// Senkron motoru:
//  1) Her kanaldan yeni/değişen siparişleri çek, veritabanına yaz
//  2) Siparişlerdeki ürünleri merkezi stoktan düş (iptalde geri ekle) — sipariş başına kayıt tutulduğu için çift düşüm olmaz
//  3) Stoğu değişen ürünleri tüm kanallara gönder (her ilan için son gönderilen adet saklanır, sadece fark gönderilir)
import { all, first, run, getSettings, getRaw, setSetting, log } from './db.js';
import { getChannels, channel } from './channels/index.js';
import { mergeStatus, chunk, str } from './util.js';

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
    for (const r of await all(db, `SELECT id, local_status, hash FROM orders WHERE id IN (${part.map(() => '?').join(',')})`, ...part)) existing.set(r.id, r);
  }
  const t = Date.now();
  // Kanaldan aynen gelen (değişmemiş) sipariş tekrar yazılmaz: veritabanı yazma kotasını korur
  const changed = [];
  for (const o of orders) {
    const id = `${ch}:${o.remoteId}`, h = hash(JSON.stringify(o)), ex = existing.get(id);
    if (ex && ex.hash === h) continue;
    o._hash = h;
    changed.push(o);
  }
  for (const part of chunk(changed, 25)) {
    const st = [];
    for (const o of part) {
      const id = `${ch}:${o.remoteId}`, ex = existing.get(id);
      const status = mergeStatus(o.status, ex && ex.local_status);
      const extra = JSON.stringify({ awaitingPayment: !!o.awaitingPayment });
      st.push(db.prepare(`INSERT INTO orders (id, channel, remote_id, order_number, status, remote_status, ordered_at, updated_at, customer, phone, email, address, total, currency, cargo_company, tracking, extra, hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET order_number = excluded.order_number, status = excluded.status, remote_status = excluded.remote_status,
          updated_at = excluded.updated_at, customer = excluded.customer, phone = excluded.phone, email = excluded.email, address = excluded.address,
          total = excluded.total, currency = excluded.currency,
          cargo_company = COALESCE(NULLIF(excluded.cargo_company, ''), orders.cargo_company), tracking = COALESCE(NULLIF(excluded.tracking, ''), orders.tracking), extra = excluded.extra, hash = excluded.hash`)
        .bind(id, ch, o.remoteId, o.orderNumber, status, o.remoteStatus || '', o.orderedAt, t, o.customer || '', o.phone || '', o.email || '',
          JSON.stringify(o.address || {}), o.total || 0, o.currency || 'TRY', o.cargoCompany || '', o.tracking || '', extra, o._hash));
      st.push(db.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id));
      for (const it of o.items) {
        st.push(db.prepare(`INSERT OR REPLACE INTO order_items (order_id, line_id, product_id, sku, barcode, name, image, quantity, unit_price, total, status, remote_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, it.lineId, maps.resolve(ch, it), it.sku || '', it.barcode || '', it.name || '', it.image || '', it.quantity, it.unitPrice || 0, it.total || 0, it.status || '', it.remoteKey || ''));
      }
      // Kanalın kendi paketleri (Trendyol/Hepsiburada/ikas) panele aynen yansır; paneldeki taslak paketler korunur
      if (Array.isArray(o.packages)) {
        const remoteIds = o.packages.map((p) => p.remoteId).filter(Boolean);
        if (remoteIds.length) {
          st.push(db.prepare(`DELETE FROM packages WHERE order_id = ? AND remote_id IS NOT NULL AND remote_id NOT IN (${remoteIds.map(() => '?').join(',')})`).bind(id, ...remoteIds));
        }
        for (const p of o.packages) {
          if (!p.remoteId) continue;
          st.push(db.prepare(`INSERT INTO packages (order_id, no, remote_id, items, status, remote_status, cargo_company, tracking, created_at, shipped_at)
            VALUES (?, (SELECT COALESCE(MAX(no), 0) + 1 FROM packages WHERE order_id = ?), ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (order_id, remote_id) DO UPDATE SET items = excluded.items, remote_status = excluded.remote_status,
              status = CASE WHEN packages.status = 'shipped' AND excluded.status = 'open' THEN 'shipped' ELSE excluded.status END,
              cargo_company = COALESCE(NULLIF(excluded.cargo_company, ''), packages.cargo_company), tracking = COALESCE(NULLIF(excluded.tracking, ''), packages.tracking)`)
            .bind(id, id, p.remoteId, JSON.stringify(p.items || []), p.status || 'open', p.remoteStatus || '', p.cargoCompany || '', p.tracking || '', t, p.status === 'shipped' ? t : null));
        }
      }
    }
    await db.batch(st);
  }
  return changed.map((o) => `${ch}:${o.remoteId}`);
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
      st.push(db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) VALUES (?, ?, (SELECT stock FROM products WHERE id = ?), ?, ?, ?)')
        .bind(Number(pid), -delta, Number(pid), delta > 0 ? 'Sipariş' : 'İptal/iade', label, t));
    }
    for (const part2 of chunk(st, 90)) if (part2.length) await db.batch(part2);
  }
  return moves;
}

// ---------- stok / fiyat gönderimi ----------
export async function pushStocks(env, db, settings, only) {
  settings = settings || await getSettings(db);
  if (!settings.stock_sync) return { skipped: 'Stok senkronu kapalı' };
  const rows = await all(db, `SELECT l.channel, l.remote_id, l.remote_product_id, l.sku, l.barcode, MAX(p.stock, 0) AS stock
    FROM listings l JOIN products p ON p.id = l.product_id
    WHERE p.active = 1 AND (l.pushed_stock IS NULL OR l.pushed_stock != MAX(p.stock, 0)) LIMIT 3000`);
  const result = {};
  for (const ch of getChannels(env)) {
    if (only && !only.includes(ch.id)) continue;
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
    } catch (e) {
      result[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Stok gönderilemedi: ' + e.message);
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
  for (const ch of getChannels(env)) {
    const items = rows.filter((r) => r.channel === ch.id).map((r) => ({ remoteId: r.remote_id, remoteProductId: r.remote_product_id, sku: r.sku, barcode: r.barcode, price: r.price, listPrice: r.list_price || 0 }));
    if (!items.length || !ch.enabled || !ch.pushPrice) continue;
    try {
      await ch.pushPrice(items);
      for (const part of chunk(items, 90)) await db.batch(part.map((x) => db.prepare('UPDATE listings SET price_dirty = 0, error = NULL WHERE channel = ? AND remote_id = ?').bind(ch.id, x.remoteId)));
      result[ch.id] = items.length;
      await log(db, ch.id, 'info', `${items.length} ilanın fiyatı gönderildi`);
    } catch (e) {
      result[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Fiyat gönderilemedi: ' + e.message);
    }
  }
  return result;
}

// ---------- tam senkron ----------
export async function syncAll(env, db, { only, force } = {}) {
  const t = Date.now();
  const lock = await getRaw(db, 'sync_lock');
  if (!force && lock && t - lock < 4 * 60e3) return { skipped: 'Başka bir senkron sürüyor' };
  await setSetting(db, 'sync_lock', t);
  const settings = await getSettings(db);
  const maps = await productMaps(db);
  const out = { channels: {}, stockMoves: 0 };
  try {
    const changed = [];
    for (const ch of getChannels(env)) {
      if (!ch.enabled || (only && !only.includes(ch.id))) continue;
      const cursor = await getRaw(db, 'cursor:' + ch.id);
      // İlk senkron: geçmiş N gün (deneme modunda geçen yılla karşılaştırma görülsün diye 400 gün)
      const since = cursor ? Math.min(cursor - OVERLAP, ch.byOrderDate ? t - LOOKBACK : Infinity) : t - (ch.demo ? 400 : Math.max(1, Number(settings.history_days) || 30)) * D;
      try {
        const orders = await ch.fetchOrders(since, t);
        const ids = await saveOrders(db, ch.id, orders, maps);
        changed.push(...ids);
        await setSetting(db, 'cursor:' + ch.id, t);
        await setSetting(db, 'last:' + ch.id, { at: t, ok: true, count: orders.length, warn: orders.warnings || null });
        out.channels[ch.id] = orders.length;
        if (orders.warnings) await log(db, ch.id, 'warn', orders.warnings.join(' | '));
      } catch (e) {
        out.channels[ch.id] = 'hata: ' + e.message;
        await setSetting(db, 'last:' + ch.id, { at: t, ok: false, error: e.message.slice(0, 500) });
        await log(db, ch.id, 'error', 'Sipariş çekilemedi: ' + e.message);
      }
    }
    out.stockMoves = await applyStock(db, changed, settings);
    out.stock = await pushStocks(env, db, settings);
    out.price = await pushPrices(env, db);
  } finally {
    await setSetting(db, 'sync_lock', 0);
  }
  out.ms = Date.now() - t;
  return out;
}

// ---------- ilanları içe aktar ve ürünlerle eşleştir ----------
export async function importListings(env, db, { only, createMissing = true } = {}) {
  const t = Date.now(), out = { channels: {}, created: 0, linked: 0 };
  const fetched = [];
  for (const ch of getChannels(env)) {
    if (!ch.enabled || !ch.fetchListings || (only && !only.includes(ch.id))) continue;
    try {
      const rows = await ch.fetchListings();
      fetched.push([ch.id, rows]);
      for (const part of chunk(rows, 40)) {
        await db.batch(part.map((l) => db.prepare(`INSERT INTO listings (channel, remote_id, remote_product_id, sku, barcode, name, image, price, list_price, remote_stock, pushed_stock, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (channel, remote_id) DO UPDATE SET remote_product_id = excluded.remote_product_id, sku = excluded.sku, barcode = excluded.barcode,
            name = excluded.name, image = excluded.image, price = CASE WHEN listings.price_dirty = 1 THEN listings.price ELSE excluded.price END,
            list_price = excluded.list_price, remote_stock = excluded.remote_stock, pushed_stock = excluded.remote_stock, synced_at = excluded.synced_at`)
          .bind(ch.id, l.remoteId, l.remoteProductId || '', l.sku || '', l.barcode || '', l.name || '', l.image || '', l.price || 0, l.listPrice || 0, l.stock ?? null, l.stock ?? null, t)));
      }
      out.channels[ch.id] = rows.length;
      await log(db, ch.id, 'info', `${rows.length} ilan içe aktarıldı`);
    } catch (e) {
      out.channels[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'İlanlar alınamadı: ' + e.message);
    }
  }
  // Eşleşmeyen ilanlar: önce SKU, sonra barkodla mevcut ürüne bağla; yoksa yeni ürün aç (stok = ilk kanalın stoğu)
  const unlinked = await all(db, 'SELECT channel, remote_id, sku, barcode, name, image, price, remote_stock FROM listings WHERE product_id IS NULL');
  const order = ['ikas1', 'ikas2', 'trendyol', 'hepsiburada', 'pttavm'];
  unlinked.sort((a, b) => order.indexOf(a.channel) - order.indexOf(b.channel));
  if (createMissing) {
    const prods = await all(db, 'SELECT sku, barcode FROM products');
    const skus = new Set(prods.map((p) => (p.sku || '').toLowerCase()).filter(Boolean)), bars = new Set(prods.map((p) => p.barcode).filter(Boolean));
    const fresh = [];
    for (const l of unlinked) {
      const s = str(l.sku).toLowerCase(), b = str(l.barcode);
      if (!s && !b) continue;
      if ((s && skus.has(s)) || (b && bars.has(b))) continue;
      if (s) skus.add(s);
      if (b) bars.add(b);
      fresh.push(l);
    }
    for (const part of chunk(fresh, 40)) {
      await db.batch(part.map((l) => db.prepare(`INSERT INTO products (sku, barcode, name, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (sku) DO NOTHING`)
        .bind(str(l.sku) || null, str(l.barcode) || null, l.name || l.sku || l.barcode, l.image || '', l.price || 0, Math.max(0, l.remote_stock || 0), t, t)));
    }
    // Deneme modunda örnek alış fiyatları (gerçek kanallar alış fiyatı vermez)
    for (const [ch, rows] of fetched) for (const l of rows) if (l.purchasePrice) await run(db, 'UPDATE products SET purchase_price = ? WHERE sku = ? AND purchase_price = 0', l.purchasePrice, l.sku);
    out.created = fresh.length;
  }
  out.linked = await autoLink(db);
  return out;
}

export async function autoLink(db) {
  const maps = await productMaps(db);
  const unlinked = await all(db, 'SELECT channel, remote_id, sku, barcode FROM listings WHERE product_id IS NULL');
  const st = [];
  for (const l of unlinked) {
    const pid = maps.resolve(l.channel, { sku: l.sku, barcode: l.barcode });
    if (pid) st.push(db.prepare('UPDATE listings SET product_id = ? WHERE channel = ? AND remote_id = ?').bind(pid, l.channel, l.remote_id));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  if (st.length) await relinkItems(db);
  return st.length;
}

// İlan bir ürüne bağlandığında, o ilanın eşleşmemiş sipariş satırları da bağlanır
export async function relinkItems(db) {
  await run(db, `UPDATE order_items SET product_id = (
      SELECT l.product_id FROM listings l JOIN orders o ON o.id = order_items.order_id
      WHERE l.channel = o.channel AND l.remote_id = order_items.remote_key AND l.product_id IS NOT NULL)
    WHERE product_id IS NULL AND remote_key != ''`);
  await run(db, `UPDATE order_items SET product_id = (SELECT p.id FROM products p WHERE p.sku IS NOT NULL AND LOWER(p.sku) = LOWER(order_items.sku))
    WHERE product_id IS NULL AND sku != ''`);
  await run(db, `UPDATE order_items SET product_id = (SELECT p.id FROM products p WHERE p.barcode = order_items.barcode)
    WHERE product_id IS NULL AND barcode != ''`);
}

export { channel, first };
