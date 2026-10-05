// Senkron motoru (15 dakikada bir + "Senkronla"):
//  1) Her kanaldan yeni/değişen siparişleri çek, veritabanına yaz (aynı sipariş tekrar oluşmaz)
//  2) Ürün ilanlarını (görsel, varyant, kanaldaki stok/fiyat) yenile; kesin eşleşmeleri bağla
//  3) Siparişlerdeki ürünleri ortak stoktan düş (iptalde geri ekle) — sipariş başına kayıt tutulur, çift düşüm olmaz
//  4) Her ilanın olması gereken stoğunu (kanal kuralına göre) hesapla; kanaldakiyle farklıysa gönder
//  Başarısız adım bir kez daha denenir; üst üste başarısız olursa Bildirimler'e yazılır.
import { all, first, run, getSettings, getRaw, setSetting, log, notify, resolve } from './db.js';
import { getChannels } from './channels/index.js';
import { typeOf } from './config.js';
import { syncInvoices, syncSettlements } from './finance.js';
import { syncFx } from './fx.js';
import { mergeStatus, chunk, str, sleep, explainHttp } from './util.js';
import { autoMatch, relinkItems, repairDuplicates } from './match.js';
import { runJobs, createJob } from './backfill.js';
import { runBuybox } from './buybox.js';
import { syncQuestions } from './questions.js';
import { syncClaims } from './claims.js';
import { queueNew, sendQueued } from './mail.js';
import { DEMO_PRODUCTS } from './channels/demo.js';
import { checkPendingUploads, autoUpload } from './catalog.js';
import { customerKey, fillKeys } from './customers.js';
export { relinkItems };

// İlanın kanalda görünmesi gereken stok (l = listings, p = products):
//   shared: ortak stok · limit: ortak stok ama en fazla N · own: bu kanala ayrılmış N adet (o kanalın satışlarıyla azalır)
export const DESIRED = `CASE l.stock_mode WHEN 'own' THEN MAX(COALESCE(l.stock_value, 0), 0)
  WHEN 'limit' THEN MAX(MIN(p.stock, COALESCE(l.stock_value, p.stock)), 0) ELSE MAX(p.stock, 0) END`;
const LISTING_EVERY = 14 * 60e3;
export const MARKETPLACES = ['trendyol', 'hepsiburada', 'pttavm', 'n11', 'idefix', 'pazarama']; // ilanlar en geç bu aralıkla yenilenir

const D = 864e5;
const OVERLAP = 2 * 3600e3; // son senkrondan 2 saat öncesinden itibaren tekrar bakılır (geç güncellenen siparişler için)
// Sipariş tarihine göre listeleyen kanallarda (Trendyol, PttAVM) durum değişikliklerini (iptal, kargo, teslim) yakalamak için
// her senkronda son 3 günün siparişlerine yeniden bakılır; değişmeyenler veritabanına yazılmaz.
const LOOKBACK = 3 * D;

// ---------- ürün eşleştirme haritası ----------
async function productMaps(db) {
  const [prods, lst] = await Promise.all([
    all(db, 'SELECT id, sku, barcode FROM products'),
    all(db, 'SELECT channel, remote_id, product_id FROM listings WHERE product_id IS NOT NULL'),
  ]);
  const sku = new Map(), barcode = new Map(), listing = new Map();
  for (const p of prods) { if (p.sku) sku.set(p.sku.toLowerCase(), p.id); if (p.barcode) barcode.set(p.barcode, p.id); }
  for (const l of lst) listing.set(l.channel + '\u0000' + l.remote_id, l.product_id);
  return {
    resolve(ch, it) {
      return (it.remoteKey && listing.get(ch + '\u0000' + it.remoteKey)) || (it.sku && sku.get(it.sku.toLowerCase())) || (it.barcode && barcode.get(it.barcode)) || null;
    },
  };
}

// ---------- siparişleri kaydet ----------
export async function saveOrders(db, ch, orders, maps) {
  if (!orders.length) return [];
  maps = maps || await productMaps(db);
  const ids = orders.map((o) => `${ch}:${o.remoteId}`);
  const existing = new Map();
  for (const part of chunk(ids, 90)) {
    for (const r of await all(db, `SELECT id, local_status, hash, status, remote_status FROM orders WHERE id IN (${part.map(() => '?').join(',')})`, ...part)) existing.set(r.id, r);
  }
  // Son 30 dakikada panelden işlem yapılan siparişler: bu siparişlerdeki durum değişikliği panelin işidir
  const recent = new Set((await all(db, "SELECT DISTINCT order_id FROM order_events WHERE source = 'panel' AND at > ?", Date.now() - 30 * 60e3)).map((r) => r.order_id));
  const t = Date.now();
  // Kanaldan aynen gelen (değişmemiş) sipariş tekrar yazılmaz: veritabanı yazma kotasını korur
  const changed = [], created = [];
  for (const o of orders) {
    const id = `${ch}:${o.remoteId}`, h = hash(JSON.stringify(o)), ex = existing.get(id);
    if (!ex) created.push(id);
    if (ex && ex.hash === h) continue;
    o._hash = h;
    changed.push(o);
  }
  for (const part of chunk(changed, 25)) {
    const st = [];
    for (const o of part) {
      const id = `${ch}:${o.remoteId}`, ex = existing.get(id);
      const status = mergeStatus(o.status, ex && ex.local_status);
      const extra = JSON.stringify({ awaitingPayment: !!o.awaitingPayment, ...(o.demo ? { demo: true } : {}), ...(o.cargoChoice ? { cargoChoice: o.cargoChoice } : {}), ...(o.customerId ? { customerId: o.customerId } : {}), ...(o.guest ? { guest: true } : {}) });
      // Kanalda durum değişti ve panelden yapılmadı → kanal tarafında işlem (satıcı paneli, kargo, müşteri…)
      let ext = null;
      if (ex && ex.remote_status && o.remoteStatus && ex.remote_status !== o.remoteStatus && !recent.has(id)) {
        const seller = ex.status === 'new' && status === 'processing'; // yalnızca satıcının yapabileceği geçiş: işleme alma / paketleme
        ext = JSON.stringify({ at: t, from: ex.remote_status, to: o.remoteStatus, status, seller });
        st.push(db.prepare("INSERT INTO order_events (order_id, at, source, action, status, remote_status, note) VALUES (?, ?, 'channel', ?, ?, ?, ?)")
          .bind(id, t, seller ? 'processed' : 'status', status, o.remoteStatus, ex.remote_status));
      }
      st.push(db.prepare(`INSERT INTO orders (id, channel, remote_id, order_number, status, remote_status, ordered_at, updated_at, customer, phone, email, address, total, currency, cargo_company, tracking, extra, hash, ship_by, ext_action, ckey)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET order_number = excluded.order_number, status = excluded.status, remote_status = excluded.remote_status,
          updated_at = excluded.updated_at, customer = excluded.customer, phone = excluded.phone, email = excluded.email, address = excluded.address,
          total = excluded.total, currency = excluded.currency,
          cargo_company = COALESCE(NULLIF(excluded.cargo_company, ''), orders.cargo_company), tracking = COALESCE(NULLIF(excluded.tracking, ''), orders.tracking), extra = excluded.extra, hash = excluded.hash,
          ship_by = COALESCE(excluded.ship_by, orders.ship_by), ext_action = COALESCE(excluded.ext_action, orders.ext_action), ckey = excluded.ckey`)
        .bind(id, ch, o.remoteId, o.orderNumber, status, o.remoteStatus || '', o.orderedAt, t, o.customer || '', o.phone || '', o.email || '',
          JSON.stringify(o.address || {}), o.total || 0, o.currency || 'TRY', o.cargoCompany || '', o.tracking || '', extra, o._hash, o.shipBy || null, ext,
          customerKey({ channel: ch, id, phone: o.phone, email: o.email, customer: o.customer, address: o.address, extra })));
      st.push(db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id));
      for (const it of o.items) {
        const com = it.commission == null || !Number.isFinite(Number(it.commission)) ? null : Math.max(0, Number(it.commission));
        st.push(db.prepare(`INSERT OR REPLACE INTO order_items (order_id, line_id, product_id, sku, barcode, name, image, quantity, unit_price, total, status, remote_key, commission)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, it.lineId, maps.resolve(ch, it), it.sku || '', it.barcode || '', it.name || '', it.image || '', it.quantity, it.unitPrice || 0, it.total || 0, it.status || '', it.remoteKey || '', com));
        // Kanalın bildirdiği gerçek komisyon oranı ilana yazılır (elle girilmiş oran korunur)
        if (com != null && it.total > 0 && it.remoteKey) st.push(db.prepare("UPDATE listings SET commission = ?, commission_src = 'api' WHERE channel = ? AND remote_id = ? AND (commission IS NULL OR commission_src = 'api')").bind(Math.round((com / it.total) * 10000) / 100, ch, it.remoteKey));
      }
      // Kanalın kendi paketleri (Trendyol/Hepsiburada/ikas) panele aynen yansır; paneldeki taslak paketler korunur
      if (Array.isArray(o.packages)) {
        const remoteIds = o.packages.map((p) => p.remoteId).filter(Boolean);
        if (remoteIds.length) {
          st.push(db.prepare(`DELETE FROM packages WHERE order_id = ? AND remote_id IS NOT NULL AND remote_id NOT IN (${remoteIds.map(() => '?').join(',')})`).bind(id, ...remoteIds));
          // Kanalda paket oluştuysa (panelden ya da kanalın kendi panelinden) paneldeki taslak paketler kaldırılır
          st.push(db.prepare("DELETE FROM packages WHERE order_id = ? AND remote_id IS NULL AND status = 'open'").bind(id));
        } else if (!o.packages.length) {
          // Kanalda paket kalmadı (ör. ikas'ta paket iptal edildi): kanal paketleri kaldırılır, taslaklar korunur
          st.push(db.prepare("DELETE FROM packages WHERE order_id = ? AND remote_id IS NOT NULL AND status = 'open'").bind(id));
        }
        for (const p of o.packages) {
          if (!p.remoteId) continue;
          // Paketlenmiş sayılır: ikas/HB'de paket varsa; Trendyol'da "Created" sonrası (Hazırlanıyor, Faturalandı…)
          const packed = p.packed ?? !/^(Created|Awaiting)$/.test(p.remoteStatus || '');
          // Kargo anlaşması: pazaryeri paketleri o pazaryerinin anlaşmasıyla; ikas paketi yalnızca ikas Kargo işlediyse
          const agreement = p.agreement || (MARKETPLACES.includes(typeOf(ch)) ? typeOf(ch) : null);
          st.push(db.prepare(`INSERT INTO packages (order_id, no, remote_id, items, status, remote_status, cargo_company, tracking, barcode, created_at, shipped_at, packed_at, error, agreement, tracking_url)
            VALUES (?, (SELECT COALESCE(MAX(no), 0) + 1 FROM packages WHERE order_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (order_id, remote_id) DO UPDATE SET items = excluded.items, remote_status = excluded.remote_status,
              status = CASE WHEN packages.status = 'shipped' AND excluded.status = 'open' THEN 'shipped' ELSE excluded.status END,
              shipped_at = CASE WHEN excluded.status = 'shipped' THEN COALESCE(packages.shipped_at, excluded.shipped_at) ELSE packages.shipped_at END,
              cargo_company = COALESCE(NULLIF(excluded.cargo_company, ''), packages.cargo_company), tracking = COALESCE(NULLIF(excluded.tracking, ''), packages.tracking),
              barcode = COALESCE(NULLIF(excluded.barcode, ''), packages.barcode), error = excluded.error,
              agreement = CASE WHEN packages.agreement = 'own' THEN 'own' ELSE COALESCE(excluded.agreement, packages.agreement) END,
              tracking_url = COALESCE(NULLIF(excluded.tracking_url, ''), packages.tracking_url),
              packed_at = CASE WHEN excluded.packed_at IS NULL THEN NULL ELSE COALESCE(packages.packed_at, excluded.packed_at) END`)
            .bind(id, id, p.remoteId, JSON.stringify(p.items || []), p.status || 'open', p.remoteStatus || '', p.cargoCompany || '', p.tracking || '', p.barcode || '', t, p.status === 'shipped' ? t : null, packed ? t : null, p.error || null, agreement, /^https?:\/\//i.test(p.trackingUrl || '') ? p.trackingUrl : ''));
        }
      }
    }
    await db.batch(st);
  }
  const out = changed.map((o) => `${ch}:${o.remoteId}`);
  out.created = created; // veritabanında ilk kez görülen siparişler (yeni sipariş bildirimi için)
  return out;
}

function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 2246822519); }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length.toString(36);
}

// ---------- stok düşümü ----------
export async function applyStock(db, orderIds, settings) {
  if (!orderIds.length) return 0;
  settings = settings || await getSettings(db);
  const since = settings.stock_sync ? Number(settings.stock_since) || 0 : Infinity;
  let moves = 0;
  for (const part of chunk(orderIds, 90)) {
    const q = part.map(() => '?').join(',');
    const rows = await all(db, `SELECT o.id, o.status, o.ordered_at, o.order_number, o.channel, i.product_id, i.quantity, i.status AS istatus, p.created_at AS pcreated
      FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id WHERE o.id IN (${q})`, ...part);
    const recs = await all(db, `SELECT order_id, product_id, qty FROM order_stock WHERE order_id IN (${q})`, ...part);
    const want = new Map(), info = new Map();
    for (const r of rows) {
      const k = r.id + '\u0000' + r.product_id;
      info.set(k, r);
      const gone = r.status === 'cancelled' || (r.status === 'returned' && settings.restock_returns) || r.istatus === 'cancelled';
      want.set(k, (want.get(k) || 0) + (gone ? 0 : r.quantity));
    }
    const have = new Map(recs.map((r) => [r.order_id + '\u0000' + r.product_id, r.qty]));
    const st = [], t = Date.now();
    for (const k of new Set([...want.keys(), ...have.keys()])) {
      const [oid, pid] = k.split('\u0000');
      const w = want.get(k) || 0, h = have.get(k), r = info.get(k);
      // Stok takibinden (veya ürünün panele eklenmesinden) önceki siparişler stoğu hiç değiştirmez (sonradan iptal olsa da), sadece kaydedilir
      const baseline = !r || r.ordered_at < since || r.ordered_at < r.pcreated;
      const delta = baseline ? 0 : w - (h || 0);
      if (h !== w) st.push(db.prepare('INSERT INTO order_stock (order_id, product_id, qty) VALUES (?, ?, ?) ON CONFLICT (order_id, product_id) DO UPDATE SET qty = excluded.qty').bind(oid, Number(pid), w));
      if (!delta) continue;
      moves++;
      const label = r ? `${r.channel} #${r.order_number}` : oid;
      st.push(db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?').bind(delta, t, Number(pid)));
      // Bu kanala ayrılmış (own) stok, aynı kanalın satışıyla azalır
      if (r) st.push(db.prepare("UPDATE listings SET stock_value = COALESCE(stock_value, 0) - ? WHERE channel = ? AND product_id = ? AND stock_mode = 'own'").bind(delta, r.channel, Number(pid)));
      st.push(db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) VALUES (?, ?, (SELECT stock FROM products WHERE id = ?), ?, ?, ?)')
        .bind(Number(pid), -delta, Number(pid), delta > 0 ? 'Sipariş' : 'İptal/iade', label, t));
    }
    for (const part2 of chunk(st, 90)) if (part2.length) await db.batch(part2);
  }
  return moves;
}

// ---------- ürün bilgisi: marka ve açıklama ----------
// Panel ürününde marka / açıklama boşsa bağlı ilanlardan doldurulur (önce ana katalog sitesi, sonra diğer kanallar).
// Panelde elle girilen değer korunur.
export async function fillProductInfo(db, settings) {
  settings = settings || await getSettings(db);
  const cats = catalogOf(settings);
  const rank = `CASE l.channel ${cats.map((c, i) => `WHEN '${String(c).replace(/'/g, '')}' THEN ${i}`).join(' ')} ELSE 99 END`;
  let n = 0;
  // Ana ürün (varyant grubu) kimliği: ana katalog kanalındaki ürün kimliği (ikas ürün id'si). Ürünler sayfası buna göre gruplar;
  // adı aynı olan farklı ikas ürünleri tek gruba düşmez.
  await run(db, `UPDATE products SET parent_key = (SELECT l.channel || ':' || l.remote_product_id FROM listings l WHERE l.product_id = products.id AND COALESCE(l.remote_product_id, '') != '' ORDER BY ${rank} LIMIT 1)
    WHERE EXISTS (SELECT 1 FROM listings l WHERE l.product_id = products.id AND COALESCE(l.remote_product_id, '') != '')`);
  for (const col of ['brand', 'description', 'category']) {
    const r = await run(db, `UPDATE products SET ${col} = (SELECT l.${col} FROM listings l WHERE l.product_id = products.id AND COALESCE(l.${col}, '') != '' ORDER BY ${rank} LIMIT 1)
      WHERE COALESCE(${col}, '') = '' AND EXISTS (SELECT 1 FROM listings l WHERE l.product_id = products.id AND COALESCE(l.${col}, '') != '')`);
    n += (r && r.meta && r.meta.changes) || 0;
  }
  return n;
}

// ---------- stok senkronu kapalıyken: ana katalog (ikas) stoğu esas ----------
// Hiçbir kanala stok gönderilmez; panel stoğu ana katalog sitesindeki (varsayılan HasTürk ikas) stoktan okunur.
// Senkron açılınca bu adım devre dışı kalır: stok panelde tutulur, satışla düşer ve kanallara gönderilir.
export const catalogOf = (settings) => ((settings.catalog_channels || []).length ? settings.catalog_channels : ['ikas1']);
export async function mirrorStock(db, settings) {
  settings = settings || await getSettings(db);
  if (settings.stock_sync) return 0;
  const cats = catalogOf(settings);
  const ls = await all(db, `SELECT l.product_id, l.channel, l.remote_stock, p.stock FROM listings l JOIN products p ON p.id = l.product_id
    WHERE l.remote_stock IS NOT NULL AND l.channel IN (${cats.map(() => '?').join(',')})`, ...cats);
  const src = new Map();
  for (const l of ls.sort((a, b) => cats.indexOf(a.channel) - cats.indexOf(b.channel))) if (!src.has(l.product_id)) src.set(l.product_id, l);
  const t = Date.now(), st = [];
  for (const [pid, l] of src) {
    const v = Math.max(0, Math.round(Number(l.remote_stock) || 0));
    if (v === l.stock) continue;
    st.push(db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').bind(v, t, pid));
    st.push(db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(pid, v - l.stock, v, 'Site stoğu (ikas)', l.channel, t));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  return st.length / 2;
}

// ---------- stok / fiyat gönderimi ----------
export async function pushStocks(env, db, settings, only) {
  settings = settings || await getSettings(db);
  // Genel senkron kapalıyken yalnız "stok gönder" anahtarı açık kanallara (ana katalog hariç) ikas stoğu gönderilir
  const cats = catalogOf(settings);
  const solo = settings.stock_sync ? null : Object.keys(settings.stock_push || {}).filter((c) => settings.stock_push[c] && !cats.includes(c));
  if (solo && !solo.length) return { skipped: 'Stok senkronu kapalı' };
  const rows = await all(db, `SELECT * FROM (SELECT l.channel, l.remote_id, l.remote_product_id, l.sku, l.barcode, l.pushed_stock, ${DESIRED} AS stock
    FROM listings l JOIN products p ON p.id = l.product_id WHERE p.active = 1${solo ? ` AND l.channel IN (${solo.map((c) => `'${c.replace(/'/g, '')}'`).join(',')})` : ''}) WHERE pushed_stock IS NULL OR pushed_stock != stock LIMIT 3000`);
  const result = {};
  for (const ch of await getChannels(env, db)) {
    if (only && !only.includes(ch.id)) continue;
    if (solo && !solo.includes(ch.id)) continue;
    const items = rows.filter((r) => r.channel === ch.id).map((r) => ({ remoteId: r.remote_id, remoteProductId: r.remote_product_id, sku: r.sku, barcode: r.barcode, stock: r.stock }));
    if (!items.length || !ch.enabled || !ch.pushStock) continue;
    if ((settings.stock_channels || {})[ch.id] === false) continue;
    try {
      await ch.pushStock(items);
      for (const part of chunk(items, 90)) {
        await db.batch(part.map((x) => db.prepare('UPDATE listings SET pushed_stock = ?, remote_stock = ?, error = NULL WHERE channel = ? AND remote_id = ?').bind(x.stock, x.stock, ch.id, x.remoteId)));
      }
      result[ch.id] = items.length;
      await log(db, ch.id, 'info', `${items.length} ürünün stoğu gönderildi`);
      await resolve(db, `stock:${ch.id}`);
    } catch (e) {
      result[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Stok gönderilemedi: ' + e.message);
      await notify(db, `stock:${ch.id}`, { channel: ch.id, title: `${ch.name}: stok gönderilemedi (${items.length} ilan bekliyor)`, msg: explainHttp(e.message) + ' · Bir sonraki senkronda yeniden denenir.' });
      for (const part of chunk(items, 90)) {
        await db.batch(part.map((x) => db.prepare('UPDATE listings SET error = ? WHERE channel = ? AND remote_id = ?').bind('Stok: ' + e.message.slice(0, 200), ch.id, x.remoteId)));
      }
    }
  }
  return result;
}

export async function pushPrices(env, db) {
  const rows = await all(db, 'SELECT channel, remote_id, remote_product_id, sku, barcode, price, list_price FROM listings WHERE price_dirty = 1 AND price > 0 LIMIT 2000');
  const result = {};
  for (const ch of await getChannels(env, db)) {
    const items = rows.filter((r) => r.channel === ch.id).map((r) => ({ remoteId: r.remote_id, remoteProductId: r.remote_product_id, sku: r.sku, barcode: r.barcode, price: r.price, listPrice: r.list_price || 0 }));
    if (!items.length || !ch.enabled || !ch.pushPrice) continue;
    try {
      await ch.pushPrice(items);
      for (const part of chunk(items, 90)) await db.batch(part.map((x) => db.prepare('UPDATE listings SET price_dirty = 0, error = NULL WHERE channel = ? AND remote_id = ?').bind(ch.id, x.remoteId)));
      result[ch.id] = items.length;
      await log(db, ch.id, 'info', `${items.length} ilanın fiyatı gönderildi`);
      await resolve(db, `price:${ch.id}`);
    } catch (e) {
      result[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Fiyat gönderilemedi: ' + e.message);
      // Bekleyen fiyatlar silinmez; bir sonraki senkronda yeniden denenir
      await notify(db, `price:${ch.id}`, { channel: ch.id, title: `${ch.name}: fiyat gönderilemedi (${items.length} ilan bekliyor)`, msg: explainHttp(e.message) + ' · Bir sonraki senkronda yeniden denenir.' });
    }
  }
  return result;
}

// ---------- tam senkron ----------
// Adımı çalıştır; hata olursa kısa bir bekleme sonrası bir kez daha dene
async function attempt(fn) {
  try { return await fn(); } catch (e) { await sleep(1500); return fn(); }
}

export async function syncAll(env, db, { only, force, listings } = {}) {
  const t = Date.now();
  const lock = await getRaw(db, 'sync_lock');
  if (!force && lock && t - lock < 10 * 60e3) return { skipped: 'Başka bir senkron sürüyor' };
  await setSetting(db, 'sync_lock', t);
  const out = { channels: {}, listings: {}, stockMoves: 0 };
  try {
    await maybePurgeDemo(env, db);
    const settings = await getSettings(db);
    const maps = await productMaps(db);
    const changed = [];
    const chans = (await getChannels(env, db)).filter((c) => c.enabled && (!only || only.includes(c.id)));
    for (const ch of chans) {
      const st = (await getRaw(db, 'last:' + ch.id)) || {};
      // Art arda hata veren kanal kademeli beklenir (3. hatadan sonra 15, 30, 45 … en çok 2 saat); "Senkronla" düğmesi beklemeyi atlar
      if (!force && st.fails >= 3 && st.at && t - st.at < Math.min(st.fails - 2, 8) * 15 * 60e3) {
        out.channels[ch.id] = `beklemede: art arda ${st.fails} hata, sonraki deneme ${new Date(st.at + Math.min(st.fails - 2, 8) * 15 * 60e3).toISOString().slice(11, 16)} UTC`;
        continue;
      }
      // 1) siparişler
      const cursor = await getRaw(db, 'cursor:' + ch.id);
      const since = cursor ? Math.min(cursor - OVERLAP, ch.byOrderDate ? t - LOOKBACK : Infinity) : t - (ch.demo ? 400 : Math.max(1, Number(settings.history_days) || 30)) * D;
      try {
        const orders = await attempt(() => ch.fetchOrders(since, t));
        const ids = await saveOrders(db, ch.id, orders, maps);
        changed.push(...ids);
        // Yeni sipariş e-postası: kanalın ilk aktarımında (imleç yokken) gönderilmez
        if (cursor && ids.created && ids.created.length) out.mailQueued = (out.mailQueued || 0) + await queueNew(db, ch, ids.created, settings).catch(() => 0);
        await setSetting(db, 'cursor:' + ch.id, t);
        Object.assign(st, { at: t, ok: true, ordersAt: t, count: orders.length, changed: ids.length, error: null, fails: 0, nextTry: null, note: null, warn: orders.warnings || null });
        out.channels[ch.id] = orders.length;
        if (orders.warnings) await log(db, ch.id, 'warn', orders.warnings.join(' | '));
        await resolve(db, `orders:${ch.id}`);
      } catch (e) {
        out.channels[ch.id] = 'hata: ' + e.message;
        Object.assign(st, { at: t, ok: false, error: explainHttp(e.message).slice(0, 600), fails: (st.fails || 0) + 1 });
        if (st.fails >= 3) st.nextTry = t + Math.min(st.fails - 2, 8) * 15 * 60e3;
        await log(db, ch.id, 'error', 'Sipariş çekilemedi: ' + e.message);
        // Bir sonraki senkronda da düzelmezse (yaklaşık 15 dk) bildirim
        if (st.fails >= 2 || force) await notify(db, `orders:${ch.id}`, { channel: ch.id, title: `${ch.name}: siparişler alınamıyor`, msg: explainHttp(e.message) + (st.fails >= 3 ? ' · Art arda hata: kanal kademeli aralıklarla yeniden denenir (“Senkronla” hemen dener).' : '') });
      }
      // 2) ilanlar (ürün, görsel, varyant, kanaldaki stok) — en geç 14 dakikada bir
      if (ch.fetchListings && (listings || force || !st.listingsAt || t - st.listingsAt >= LISTING_EVERY)) {
        try {
          const n = await attempt(() => refreshListings(db, ch));
          Object.assign(st, { listingsAt: t, listings: n, listingsError: null });
          out.listings[ch.id] = n;
          await resolve(db, `listings:${ch.id}`);
        } catch (e) {
          out.listings[ch.id] = 'hata: ' + e.message;
          Object.assign(st, { listingsError: e.message.slice(0, 500), listingsFails: (st.listingsFails || 0) + 1 });
          await log(db, ch.id, 'error', 'Ürünler alınamadı: ' + e.message);
          if (st.listingsFails >= 2 || force) await notify(db, `listings:${ch.id}`, { channel: ch.id, title: `${ch.name}: ürün/stok bilgisi alınamıyor`, msg: e.message });
        }
      }
      await setSetting(db, 'last:' + ch.id, st);
    }
    // 3) kesin eşleşmeler + ana katalogdan yeni ürünler
    // Tek seferlik: eski sürümden kalma, aynı kanaldan birden fazla ilanı tek ürüne bağlamış eşleşmeleri onar
    if (!(await getRaw(db, 'once:repair_dups_1'))) { out.repaired = await repairDuplicates(db).catch(() => 0); await setSetting(db, 'once:repair_dups_1', Date.now()); }
    out.match = await autoMatch(db, { catalog: settings.catalog_channels || ['ikas1'] });
    out.mirrored = await mirrorStock(db, settings);
    out.info = await fillProductInfo(db, settings).catch((e) => 'hata: ' + e.message);
    // 4) stok düşümü ve gönderim
    out.stockMoves = await applyStock(db, changed, settings);
    out.stock = await pushStocks(env, db, settings);
    // Döviz bazlı fiyatlar: kur yenilenir, zamanı geldiyse ürün ve kanal fiyatları güncellenir (sonra fiyatlar gönderilir)
    if (!only) out.fx = await syncFx(env, db, settings).catch((e) => 'hata: ' + e.message);
    out.price = await pushPrices(env, db);
    // Buybox kontrolü ve (açıksa) seçili ürünlerde otomatik fiyat
    if (!only) out.buybox = await runBuybox(env, db, settings).catch((e) => 'hata: ' + e.message);
    // Müşteri soruları (yeni sorular ve kanaldan verilen cevaplar)
    out.questions = await syncQuestions(env, db, { only }).catch((e) => 'hata: ' + e.message);
    out.claims = await syncClaims(env, db, { only }).catch((e) => 'hata: ' + e.message);
    out.mail = await sendQueued(env, db, chans, settings).catch((e) => 'hata: ' + e.message);
    // Kanalların kargo faturalarından gerçek kargo gideri (kanal başına 6 saatte bir)
    if (!only) out.costs = await syncCosts(env, db, chans).catch((e) => 'hata: ' + e.message);
    if (!only) out.invoices = await syncInvoices(env, db).catch((e) => 'hata: ' + e.message);
    if (!only) out.settlements = await syncSettlements(env, db).catch((e) => 'hata: ' + e.message);
    // Eski siparişlere müşteri anahtarı (müşteriler sayfası için, parça parça)
    if (!only) out.customers = await fillKeys(db, 3000).catch((e) => 'hata: ' + e.message);
    // Pazaryerine gönderilen ürünlerin onay sonucu
    if (!only) out.uploads = await checkPendingUploads(env, db).catch((e) => 'hata: ' + e.message);
    // Otomatik ürün gönderimi açık kanallar (ör. yalnız Hepsiburada): yeni ürünler kendiliğinden gönderilir
    if (!only) out.autoUpload = await autoUpload(env, db, settings).catch((e) => 'hata: ' + e.message);
    // Son 1 yılın siparişleri: her bağlı (gerçek) kanal için bir kez otomatik geçmiş aktarımı başlatılır.
    // Parça parça (haftalık) ilerler; stoğu değiştirmez, yeni sipariş e-postası oluşturmaz.
    if (!only) for (const ch of chans) {
      if (ch.demo || !ch.enabled || !ch.fetchOrders) continue;
      if (await getRaw(db, 'auto_backfill:' + ch.id)) continue;
      await createJob(db, ch.id, t - 365 * D, t);
      await setSetting(db, 'auto_backfill:' + ch.id, t);
      await log(db, ch.id, 'info', 'Son 1 yılın siparişleri için geçmiş aktarımı otomatik başlatıldı');
    }
    // 5) geçmiş sipariş aktarımı varsa bir parça daha ilerlet
    if (!only) out.backfill = await runJobs(env, db, { budgetMs: 20000 }).catch((e) => 'hata: ' + e.message);
    await setSetting(db, 'last_sync', { at: t, ms: Date.now() - t });
  } finally {
    await setSetting(db, 'sync_lock', 0);
  }
  out.ms = Date.now() - t;
  return out;
}

// Bir kanalın ilanlarını yenile: eşleştirme, kanala özel stok kuralı ve gönderilmeyi bekleyen fiyat korunur.
// Kanaldaki gerçek stok "pushed_stock" olarak kaydedilir: olması gerekenden farklıysa bir sonraki adımda düzeltilir.
export async function refreshListings(db, ch) {
  const rows = await ch.fetchListings();
  const t = Date.now();
  for (const part of chunk(rows, 40)) {
    await db.batch(part.map((l) => db.prepare(`INSERT INTO listings (channel, remote_id, remote_product_id, sku, barcode, name, group_name, variant_name, image, price, list_price, remote_stock, pushed_stock, synced_at, brand, description, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (channel, remote_id) DO UPDATE SET remote_product_id = excluded.remote_product_id, sku = excluded.sku, barcode = excluded.barcode,
        name = excluded.name, group_name = excluded.group_name, variant_name = excluded.variant_name,
        image = COALESCE(NULLIF(excluded.image, ''), listings.image),
        brand = COALESCE(NULLIF(excluded.brand, ''), listings.brand), description = COALESCE(NULLIF(excluded.description, ''), listings.description),
        category = COALESCE(NULLIF(excluded.category, ''), listings.category),
        price = CASE WHEN listings.price_dirty = 1 THEN listings.price ELSE excluded.price END,
        list_price = excluded.list_price, remote_stock = excluded.remote_stock, pushed_stock = excluded.remote_stock, synced_at = excluded.synced_at`)
      .bind(ch.id, l.remoteId, l.remoteProductId || '', l.sku || '', l.barcode || '', l.name || '', l.groupName || '', l.variantName || '', l.image || '', l.price || 0, l.listPrice || 0, l.stock ?? null, l.stock ?? null, t,
        str(l.brand).slice(0, 120), str(l.description).slice(0, 20000), str(l.category).slice(0, 300))));
  }
  // Deneme modu: örnek alış fiyatları (gerçek kanallar alış fiyatı vermez)
  for (const l of rows) if (l.purchasePrice) await run(db, 'UPDATE products SET purchase_price = ? WHERE sku = ? AND purchase_price = 0', l.purchasePrice, l.sku);
  return rows.length;
}

// Elle "ürünleri içe aktar": seçilen kanalların ilanlarını hemen yenile ve eşleştir
export async function importListings(env, db, { only } = {}) {
  const out = { channels: {}, created: 0, linked: 0 };
  for (const ch of await getChannels(env, db)) {
    if (!ch.enabled || !ch.fetchListings || (only && !only.includes(ch.id))) continue;
    try {
      out.channels[ch.id] = await refreshListings(db, ch);
      const st = (await getRaw(db, 'last:' + ch.id)) || {};
      await setSetting(db, 'last:' + ch.id, { ...st, listingsAt: Date.now(), listings: out.channels[ch.id], listingsError: null });
      await log(db, ch.id, 'info', `${out.channels[ch.id]} ilan alındı`);
    } catch (e) {
      out.channels[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Ürünler alınamadı: ' + e.message);
    }
  }
  const settings = await getSettings(db);
  const m = await autoMatch(db, { catalog: settings.catalog_channels || ['ikas1'] });
  out.created = m.created; out.linked = m.linked;
  out.mirrored = await mirrorStock(db, settings);
  await fillProductInfo(db, settings).catch(() => {});
  return out;
}
export const autoLink = async (db) => (await autoMatch(db, { catalog: [] })).linked;

// ---------- deneme verilerini temizle ----------
// DEMO kapatıldığında örnek siparişler, ilanlar ve ürünler bir kez silinir; gerçek veriye dokunulmaz.
export async function purgeDemo(db) {
  const ids = (await all(db, `SELECT id FROM orders WHERE address LIKE '%Deneme Sok%' OR extra LIKE '%"demo":true%'`)).map((r) => r.id);
  for (const part of chunk(ids, 80)) {
    const q = part.map(() => '?').join(',');
    await db.batch([
      db.prepare(`DELETE FROM order_items WHERE order_id IN (${q})`).bind(...part),
      db.prepare(`DELETE FROM packages WHERE order_id IN (${q})`).bind(...part),
      db.prepare(`DELETE FROM order_stock WHERE order_id IN (${q})`).bind(...part),
      db.prepare(`DELETE FROM orders WHERE id IN (${q})`).bind(...part),
    ]);
  }
  const keys = [];
  for (const p of DEMO_PRODUCTS) for (const ch of ['ikas1', 'ikas2', 'trendyol', 'hepsiburada', 'pttavm']) keys.push([ch, ch === 'trendyol' || ch === 'pttavm' ? p[1] : `${ch}-${p[0]}`]);
  for (const part of chunk(keys, 40)) await db.batch(part.map(([c, r]) => db.prepare('DELETE FROM listings WHERE channel = ? AND remote_id = ?').bind(c, r)));
  const skus = DEMO_PRODUCTS.map((p) => p[0]);
  const prods = (await all(db, `SELECT id FROM products WHERE sku IN (${skus.map(() => '?').join(',')}) AND id NOT IN (SELECT product_id FROM listings WHERE product_id IS NOT NULL)`, ...skus)).map((r) => r.id);
  for (const id of prods) {
    await db.batch([db.prepare('DELETE FROM stock_moves WHERE product_id = ?').bind(id), db.prepare('DELETE FROM order_stock WHERE product_id = ?').bind(id), db.prepare('DELETE FROM products WHERE id = ?').bind(id)]);
  }
  if (ids.length) await run(db, "DELETE FROM settings WHERE k LIKE 'cursor:%'");
  return { orders: ids.length, products: prods.length };
}
export async function maybePurgeDemo(env, db) {
  if (env.DEMO === '1') { await setSetting(db, 'demo_purged', false); return null; }
  if (await getRaw(db, 'demo_purged')) return null;
  const r = await purgeDemo(db);
  await setSetting(db, 'demo_purged', true);
  if (r.orders || r.products) await log(db, null, 'info', `Örnek veriler temizlendi: ${r.orders} sipariş, ${r.products} ürün`);
  return r;
}

// ---------- gerçek kargo gideri ----------
// Kanal kargo faturası / muhasebe kaydı verdiğinde siparişin kargo gideri o tutarla yazılır (kaynak: api); elle girilen tutar korunur.
// İlk çalışmada son 60 gün, sonra son 20 gün taranır (faturalar gönderimden günler sonra kesilir).
export async function syncCosts(env, db, chans, { force = false } = {}) {
  const out = {};
  for (const ch of chans || await getChannels(env, db)) {
    if (!ch.enabled || ch.demo || !ch.cargoCosts) continue;
    const key = 'costs:' + ch.id, last = await getRaw(db, key);
    if (!force && last && Date.now() - last.at < 6 * 3600e3) continue;
    const t = Date.now();
    try {
      const r = await ch.cargoCosts(last ? t - 20 * 864e5 : t - 60 * 864e5, t);
      let n = 0;
      for (const part of chunk(r.items, 80)) {
        await db.batch(part.map((x) => db.prepare("UPDATE orders SET shipping_cost = ?, shipping_src = 'api' WHERE channel = ? AND order_number = ? AND COALESCE(shipping_src, '') != 'manual'").bind(x.amount, ch.id, x.orderNumber)));
        n += (await first(db, `SELECT COUNT(*) AS n FROM orders WHERE channel = ? AND shipping_src = 'api' AND order_number IN (${part.map(() => '?').join(',')})`, ch.id, ...part.map((x) => x.orderNumber))).n;
      }
      await setSetting(db, key, { at: t, orders: n, found: r.items.length });
      if (n) await log(db, ch.id, 'info', `Gerçek kargo gideri ${n} siparişe yazıldı (kanalın kargo faturalarından)`);
      out[ch.id] = n;
    } catch (e) {
      await setSetting(db, key, { at: t, error: e.message.slice(0, 300) });
      await log(db, ch.id, 'warn', 'Kargo gideri okunamadı: ' + e.message);
      out[ch.id] = 'hata: ' + e.message;
    }
  }
  return out;
}
