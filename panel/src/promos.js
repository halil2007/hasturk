// Fırsat etiketleri: Trendyol "Avantajlı Ürün" yıldız eşikleri, Hepsiburada flaş indirim / fırsat davetleri gibi pazaryerinin
// fiyat koşullu kampanyaları. Pazaryerleri bunlar için açık servis sunmadığından satıcı panelinden indirilen Excel panele yüklenir:
// satırlar ilanlarla (barkod / stok kodu / kanal kodu) eşleşir, her eşik fiyatında kâr hesaplanır; seçilen eşik fiyatı ilanın kanal
// fiyatı olur ve fiyat gönderimiyle kanala gider (pazaryeri etiketi / kampanyayı fiyat koşulu sağlanınca kendisi verir).
import { all, run, getSettings, log } from './db.js';
import { normBc, normSku, norm } from './match.js';
import { parseNum } from './bulk.js';
import { profit, costOf } from '../public/profit.js';
import { chunk, str, fail, r2 } from './util.js';

export const KINDS = { advantage: 'Avantajlı ürün etiketi', flash: 'Flaş indirim', deal: 'Kampanya daveti' };
const key = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

// Başlıklardan sütunları bulur (büyük/küçük harf ve Türkçe karakter duyarsız)
export function detectColumns(heads) {
  const H = heads.map((h) => [h, key(h)]);
  const find = (...res) => { for (const re of res) { const h = H.find(([, k]) => re.test(k)); if (h) return h[0]; } return null; };
  const col = {
    barcode: find(/^barkod/, /^barcode/, /\bbarkod\b/),
    sku: find(/satici stok kodu/, /^stok kodu/, /merchant ?sku/, /^sku$/, /satici urun kodu/, /model kodu/),
    remote: find(/hepsiburada sku/, /^hb ?sku/, /urun kodu/, /icerik id/, /content ?id/),
    name: find(/^urun ad/, /urun ismi/, /product name/, /^ad$/, /baslik/),
    current: find(/guncel (satis )?fiyat/, /mevcut (satis )?fiyat/, /^satis fiyati/, /trendyol satis fiyati/, /^fiyat$/, /sizin fiyatiniz/),
    start: find(/baslangic/),
    end: find(/bitis/, /son gecerlilik/),
  };
  const used = new Set(Object.values(col).filter(Boolean));
  // Eşik / kampanya fiyatı sütunları: yıldız, avantaj, etiket, kampanya / indirimli / flaş / önerilen / hedef / üst sınır fiyatı
  col.tiers = H.filter(([h, k]) => !used.has(h) && /(yildiz|avantaj|etiket|kampanya|indirimli|flas|firsat|onerilen|hedef|ust (limit|sinir)|en yuksek|max)/.test(k) && /(fiyat|yildiz|limit|sinir|tutar)/.test(k)).map(([h]) => h);
  return col;
}

const day = (v) => {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return Date.parse(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}:00Z`) - 3 * 3600e3;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

// Excel satırları → teklifler. replace = bu kanal + türdeki eski teklifler silinir (yeni dosya tam liste kabul edilir)
export async function importOffers(db, { channel, kind, rows, replace = true, user = 'Panel' }) {
  channel = str(channel);
  if (!channel) fail(400, 'Kanal seçin');
  if (!KINDS[kind]) fail(400, 'Kampanya türü seçin');
  if (!Array.isArray(rows) || !rows.length) fail(400, 'Dosyada satır bulunamadı');
  if (rows.length > 20000) fail(400, 'En fazla 20.000 satır yüklenebilir');
  const col = detectColumns(Object.keys(rows[0] || {}));
  if (!col.barcode && !col.sku && !col.remote) fail(400, 'Dosyada barkod ya da stok kodu sütunu bulunamadı');
  if (!col.tiers.length) fail(400, 'Dosyada kampanya / eşik fiyatı sütunu bulunamadı (ör. "1 Yıldız Fiyatı", "Kampanya Fiyatı")');
  const ls = await all(db, 'SELECT remote_id, sku, barcode, product_id, name FROM listings WHERE channel = ?', channel);
  const byBc = new Map(), bySku = new Map(), byId = new Map();
  for (const l of ls) { if (normBc(l.barcode)) byBc.set(normBc(l.barcode), l); if (normSku(l.sku)) bySku.set(normSku(l.sku), l); byId.set(String(l.remote_id), l); }
  const t = Date.now(), out = [];
  for (const r of rows) {
    const bc = col.barcode ? str(r[col.barcode]) : '', sku = col.sku ? str(r[col.sku]) : '', rid = col.remote ? str(r[col.remote]) : '';
    const tiers = col.tiers.map((h) => ({ label: h, price: parseNum(r[h]) })).filter((x) => x.price > 0);
    if (!(bc || sku || rid) || !tiers.length) continue;
    const l = (rid && byId.get(rid)) || (normBc(bc) && byBc.get(normBc(bc))) || (normSku(sku) && bySku.get(normSku(sku))) || null;
    out.push({ key: (rid || bc || sku).slice(0, 120), l, bc, sku, name: col.name ? str(r[col.name]) : '', current: col.current ? parseNum(r[col.current]) : null, tiers,
      start: col.start ? day(r[col.start]) : null, end: col.end ? day(r[col.end]) : null });
  }
  if (!out.length) fail(400, 'Fiyatı dolu satır bulunamadı');
  if (replace) await run(db, 'DELETE FROM promo_offers WHERE channel = ? AND kind = ?', channel, kind);
  for (const part of chunk(out, 90)) {
    await db.batch(part.map((o) => db.prepare(`INSERT INTO promo_offers (channel, kind, key, remote_id, product_id, barcode, sku, name, current_price, tiers, starts_at, ends_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (channel, kind, key) DO UPDATE SET remote_id = excluded.remote_id, product_id = excluded.product_id, barcode = excluded.barcode,
      sku = excluded.sku, name = excluded.name, current_price = excluded.current_price, tiers = excluded.tiers, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = excluded.updated_at`)
      .bind(channel, kind, o.key, o.l ? o.l.remote_id : null, o.l ? o.l.product_id : null, o.bc || (o.l && o.l.barcode) || null, o.sku || (o.l && o.l.sku) || null, o.name || (o.l && o.l.name) || '',
        o.current, JSON.stringify(o.tiers), o.start, o.end, t)));
  }
  const matched = out.filter((o) => o.l).length;
  await log(db, channel, 'info', `${user}: ${KINDS[kind]} listesi yüklendi · ${out.length} ürün (${matched} ilanla eşleşti) · eşikler: ${col.tiers.join(', ')}`);
  return { imported: out.length, matched, unmatched: out.length - matched, tiers: col.tiers, columns: col };
}

// Teklifler + her eşik fiyatında birim kâr / kâr oranı (ürünün alış fiyatı, kanalın komisyon / kargo / hizmet bedeli / stopaj ayarlarıyla)
export async function listOffers(db, { channel, kind } = {}) {
  const where = [], args = [];
  if (channel) { where.push('o.channel = ?'); args.push(channel); }
  if (kind) { where.push('o.kind = ?'); args.push(kind); }
  const [rows, settings, groups] = await Promise.all([
    all(db, `SELECT o.*, l.price AS listing_price, l.commission, l.image, l.price_dirty, p.purchase_price, p.vat, p.name AS product_name, p.variant_name, p.stock
      FROM promo_offers o LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = o.remote_id LEFT JOIN products p ON p.id = o.product_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (o.remote_id IS NULL), o.name COLLATE NOCASE LIMIT 3000`, ...args),
    getSettings(db),
    all(db, 'SELECT channel, kind, COUNT(*) AS n, SUM(remote_id IS NOT NULL) AS matched, SUM(applied_at IS NOT NULL) AS applied, MAX(updated_at) AS at FROM promo_offers GROUP BY channel, kind'),
  ]);
  const offers = rows.map((o) => {
    let tiers = [];
    try { tiers = JSON.parse(o.tiers || '[]'); } catch { /* boş */ }
    const ch = o.channel, cost = (k) => costOf(settings, k, ch);
    const calc = (price) => {
      if (!(o.purchase_price > 0)) return null;
      const r = profit({ sale: price, purchase: o.purchase_price, commissionRate: o.commission ?? cost('commission'), shipping: cost('shipping'), fee: cost('service_fee'),
        feeRate: cost('fee_rate'), withholdingRate: cost('withholding'), vatRate: o.vat ?? 20 });
      return { profit: r2(r.unitProfit), margin: r2(r.margin) };
    };
    const price = o.listing_price || o.current_price || 0;
    return {
      channel: ch, kind: o.kind, key: o.key, remote_id: o.remote_id, product_id: o.product_id, barcode: o.barcode, sku: o.sku, name: o.product_name || o.name, variant: o.variant_name || '',
      image: o.image || '', stock: o.stock, price, current_price: o.current_price, purchase_price: o.purchase_price, starts_at: o.starts_at, ends_at: o.ends_at,
      applied_price: o.applied_price, applied_at: o.applied_at, pending: !!o.price_dirty,
      now: calc(price), tiers: tiers.map((x) => ({ ...x, ...(calc(x.price) || {}), ok: price > 0 && price <= x.price + 0.001 })),
    };
  });
  return { offers, groups, kinds: KINDS };
}

// Seçilen eşik fiyatını ilanların kanal fiyatı yap (fiyat gönderimi kuyruğa girer). tier = eşik sırası; price verilirse o fiyat.
// minMargin: kâr oranı bu değerin altına düşecekse ilan atlanır (alış fiyatı girilmemişse kontrol edilmez).
export async function applyOffers(db, { channel, kind, keys = [], tier = 0, minMargin = null, user = 'Panel' }) {
  if (!Array.isArray(keys) || !keys.length) fail(400, 'Ürün seçin');
  const { offers } = await listOffers(db, { channel, kind });
  const want = new Set(keys.map(String)), t = Date.now(), st = [];
  let applied = 0, skipped = 0, unmatched = 0;
  for (const o of offers) {
    if (!want.has(o.key)) continue;
    if (!o.remote_id) { unmatched++; continue; }
    const x = o.tiers[Math.min(Math.max(0, Number(tier) || 0), o.tiers.length - 1)];
    if (!x) { skipped++; continue; }
    if (minMargin != null && x.margin != null && x.margin < Number(minMargin)) { skipped++; continue; }
    const price = Math.floor(x.price * 100 + 1e-6) / 100;
    st.push(db.prepare('UPDATE listings SET price = ?, price_dirty = 1 WHERE channel = ? AND remote_id = ?').bind(price, o.channel, o.remote_id));
    st.push(db.prepare('UPDATE promo_offers SET applied_price = ?, applied_at = ? WHERE channel = ? AND kind = ? AND key = ?').bind(price, t, o.channel, o.kind, o.key));
    applied++;
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  if (applied) await log(db, channel, 'info', `${user}: ${KINDS[kind] || 'kampanya'} fiyatı ${applied} ilana uygulandı (fiyat gönderimi sırada)`);
  return { applied, skipped, unmatched };
}

export async function clearOffers(db, { channel, kind }) {
  if (!channel || !KINDS[kind]) fail(400, 'Kanal ve tür seçin');
  const r = await run(db, 'DELETE FROM promo_offers WHERE channel = ? AND kind = ?', channel, kind);
  return { removed: (r.meta && r.meta.changes) || 0 };
}
