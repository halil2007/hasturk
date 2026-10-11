// Avantajlı etiketler (fırsat etiketleri): Trendyol "Avantajlı / Yıldızlı Ürün Etiketleri" yıldız eşikleri, Hepsiburada flaş indirim /
// kampanya davetleri gibi fiyat koşullu kampanyalar. Pazaryerleri bunlar için açık servis sunmuyor; satıcı panelinden Excel indirilir,
// panele yüklenir. Akış:
//   1) Excel yükle: satırlar ilanlarla (kanal ürün kodu / barkod / stok kodu) eşleşir; dosyanın kendisi de saklanır (offer_files).
//   2) Her eşik fiyatında ve şu anki fiyatta kâr / kâr oranı görünür (KDV dahil kâr modeli, bkz. public/profit.js). Satır başına
//      eşik, "değiştirme" ya da özel fiyat seçilir (offer_rows.choice / chosen_price).
//   3) Excel'i indir: yüklenen dosya aynı sayfa / sütun / satır sırasıyla geri verilir, seçilen fiyat pazaryerinin beklediği sütuna
//      yazılır (tarayıcıda, bkz. public/sheetwrite.js + views/promos.js). Satıcı bu dosyayı pazaryerine yükler.
//   4) İsteğe bağlı "Kanala gönder": seçilen fiyat ilanın kanal fiyatı olur ve fiyat gönderimiyle kanala gider.
// Not: eski "promo_offers" tablosu bir geçişte silindi (DROP); o geçiş yeniden çalışırsa veri kaybolmasın diye yeni tablo adları kullanılır.
import { all, first, run, getSettings, log } from './db.js';
import { normBc, normSku, norm } from './match.js';
import { parseNum } from './bulk.js';
import { listRate, mpOf } from './commcheck.js';
import { DEMO_PRODUCTS } from './channels/demo.js';
import { profit, costOf, rateGross } from '../public/profit.js';
import { chunk, str, fail, r2 } from './util.js';

export const KINDS = { advantage: 'Avantajlı ürün etiketi', flash: 'Flaş indirim', deal: 'Kampanya daveti' };
export const NEW_COL = 'Yeni Satış Fiyatı';
const MAX_ROWS = 20000, PART = 900000, MAX_FILE = 8e6; // dosya base64 olarak parça parça saklanır (D1 satır sınırı)
const key = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

// Başlıklardan sütunları bulur (büyük/küçük harf ve Türkçe karakter duyarsız). rows verilirse tamamen boş "fiyat" sütunu satıcının
// dolduracağı sütun (hedef) sayılır — ör. Hepsiburada davetindeki boş "Kampanya Fiyatı".
export function detectColumns(heads, rows = []) {
  const H = heads.map((h) => [h, key(h)]);
  const used = new Set();
  const find = (...res) => { for (const re of res) { const h = H.find(([x, k]) => !used.has(x) && re.test(k)); if (h) { used.add(h[0]); return h[0]; } } return null; };
  const empty = (h) => rows.length > 0 && rows.every((r) => str(r[h]) === '');
  const col = {};
  // Satıcının yeni fiyatı yazacağı sütun (pazaryeri şablonlarındaki giriş sütunu adları)
  col.target = find(/yeni (satis )?fiyat/, /katilacaginiz fiyat/, /kampanyaya katil\w* fiyat/, /teklif (ettiginiz |edilen |verdiginiz )?fiyat/, /guncellenecek fiyat/,
    /fiyat guncelle/, /trendyol da satilacak fiyat|trendyolda satilacak fiyat/, /kampanya fiyatiniz/, /satici kampanya fiyati/, /istenen fiyat/);
  col.barcode = find(/^barkod/, /^barcode/, /\bbarkod\b/);
  col.remote = find(/hepsiburada sku/, /^hb ?sku/, /hepsiburada urun kodu/, /icerik id/, /content ?id/, /^urun kodu$/);
  col.sku = find(/satici stok kodu/, /^stok kodu/, /merchant ?sku/, /^sku$/, /satici urun kodu/, /model kodu/);
  col.name = find(/^urun ad/, /urun ismi/, /product name/, /^ad$/, /baslik/);
  col.commission = find(/^komisyon orani$/, /(yildiz|kampanya|etiket|avantaj).*komisyon/, /^komisyon$/);
  col.curCommission = find(/guncel komisyon/, /mevcut komisyon/);
  col.current = find(/guncel (satis )?fiyat/, /mevcut (satis )?fiyat/, /^satis fiyati/, /trendyol satis fiyati/, /^fiyat$/, /sizin fiyatiniz/);
  col.start = find(/baslangic/);
  col.end = find(/bitis/, /son gecerlilik/);
  col.join = find(/^katilim( durumu)?$/, /katilmak istiyor/, /^kampanyaya katil(im|mak)?$/, /^katil$/);
  // Eşik / kampanya fiyatı sütunları: yıldız, avantaj, etiket, kampanya / indirimli / flaş / önerilen / hedef / üst sınır fiyatı
  const cand = H.filter(([h, k]) => !used.has(h) && /(yildiz|avantaj|etiket|kampanya|indirimli|flas|firsat|onerilen|hedef|ust (limit|sinir|fiyat)|en yuksek|max)/.test(k) && /(fiyat|yildiz|limit|sinir|tutar)/.test(k)).map(([h]) => h);
  // Boş sütun eşik değil giriş sütunudur — eşik / üst sınır adı taşımıyorsa ("2 Yıldız Üst Fiyat" boş olabilir, yine eşiktir)
  if (!col.target) { const e = cand.find((h) => empty(h) && !/(yildiz|ust|limit|sinir|onerilen|en yuksek|max|hedef)/.test(key(h))); if (e) col.target = e; }
  col.tiers = cand.filter((h) => h !== col.target);
  return col;
}

// Excel tarih seri sayısı ya da "gg.aa.yyyy ss:dd" (Türkiye saati) → ms
const day = (v) => {
  const s = str(v);
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Number(s); if (n > 20000 && n < 80000) return Math.round((n - 25569) * 864e5) - 3 * 3600e3; }
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return Date.parse(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}:00Z`) - 3 * 3600e3;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

// Başlık satırı: ilk 20 satır içinde tanıdık başlıkları en çok içeren satır (bazı dosyalarda üstte açıklama satırları olur)
const HEAD_RE = /^(barkod|barcode|stok kodu|satici stok kodu|sku|urun ad|urun ismi|hepsiburada|model kodu|.*fiyat.*|.*yildiz.*|komisyon.*|kampanya.*)$/;
export function pickHeader(grid) {
  let best = null, score = 0;
  for (const row of grid.slice(0, 20)) {
    const s = (row.cells || []).filter((c) => HEAD_RE.test(key(c))).length;
    if (s > score) { best = row; score = s; }
  }
  return best || grid.find((r) => (r.cells || []).some((c) => str(c))) || null;
}

// Dosya ızgarası (readGrid) → başlık + satır nesneleri ({ başlık: değer }, __row: sayfa satır no)
export function gridRows(grid) {
  const h = pickHeader(grid);
  if (!h) return { head: [], headerRow: 1, rows: [], textPrices: false };
  const head = h.cells.map((x, i) => str(x).replace(/^﻿/, '') || `Sütun ${i + 1}`);
  const rows = grid.filter((r) => r.r > h.r && (r.cells || []).some((c) => str(c))).map((r) => {
    const o = { __row: r.r, __types: r.types || '' };
    head.forEach((k, i) => { o[k] = r.cells[i] == null ? '' : String(r.cells[i]).trim(); });
    return o;
  });
  return { head, headerRow: h.r, rows };
}

// İstekteki ızgara: [[satır no, [hücreler], "tür dizisi" (s / n / boşluk)]]
const toGrid = (g) => (Array.isArray(g) ? g : []).map((x) => (Array.isArray(x) ? { r: Number(x[0]) || 0, cells: Array.isArray(x[1]) ? x[1].map((c) => (c == null ? '' : String(c))) : [], types: String(x[2] || '') } : null)).filter((x) => x && x.r > 0);

// Excel satırları → teklifler. Bu kanal + türdeki eski liste ve dosya silinir (yeni dosya tam liste kabul edilir).
// b: { channel, kind, name, type ('xlsx' | 'csv'), sep, grid, file (base64, isteğe bağlı) } ya da { rows: [{ başlık: değer }] } (eski biçim)
export async function importOffers(db, b) {
  const channel = str(b.channel), kind = str(b.kind), user = b.user || 'Panel';
  if (!channel) fail(400, 'Kanal seçin');
  if (!KINDS[kind]) fail(400, 'Kampanya türü seçin');
  let head, headerRow = 1, rows;
  if (b.grid) ({ head, headerRow, rows } = gridRows(toGrid(b.grid)));
  else { rows = (Array.isArray(b.rows) ? b.rows : []).map((r, i) => ({ __row: i + 2, ...r })); head = Object.keys(rows[0] || {}).filter((k) => !k.startsWith('__')); }
  if (!rows.length) fail(400, 'Dosyada satır bulunamadı');
  if (rows.length > MAX_ROWS) fail(400, 'En fazla 20.000 satır yüklenebilir');
  const col = detectColumns(head, rows);
  if (!col.barcode && !col.sku && !col.remote) fail(400, 'Dosyada barkod ya da stok kodu sütunu bulunamadı');
  if (!col.tiers.length) fail(400, 'Dosyada kampanya / eşik fiyatı sütunu bulunamadı (ör. "1 Yıldız Üst Fiyat", "Kampanya Fiyatı")');
  // Fiyatlar dosyada metin olarak mı (ör. "95,90")? Geri yazarken aynı biçim kullanılır
  const ti = head.indexOf(col.tiers[0]);
  const typed = rows.map((r) => (r.__types || '')[ti]).filter((t) => t === 's' || t === 'n');
  const textPrices = typed.length ? typed.filter((t) => t === 's').length > typed.length / 2 : false;
  const ls = await all(db, 'SELECT remote_id, sku, barcode, product_id, name FROM listings WHERE channel = ?', channel);
  const byBc = new Map(), bySku = new Map(), byId = new Map();
  for (const l of ls) { if (normBc(l.barcode)) byBc.set(normBc(l.barcode), l); if (normSku(l.sku)) bySku.set(normSku(l.sku), l); byId.set(String(l.remote_id), l); }
  const t = Date.now(), out = [], seen = new Set();
  for (const r of rows) {
    const bc = col.barcode ? str(r[col.barcode]) : '', sku = col.sku ? str(r[col.sku]) : '', rid = col.remote ? str(r[col.remote]) : '';
    const tiers = col.tiers.map((h) => ({ label: h, price: parseNum(r[h]) })).filter((x) => x.price > 0);
    if (!(bc || sku || rid) || !tiers.length) continue;
    const l = (rid && byId.get(rid)) || (normBc(bc) && byBc.get(normBc(bc))) || (normSku(sku) && bySku.get(normSku(sku))) || null;
    let k = (rid || bc || sku).slice(0, 120);
    if (seen.has(k)) k = `${k}#${r.__row}`; // aynı ürün dosyada iki kez: iki ayrı satır
    seen.add(k);
    const comm = col.commission ? parseNum(r[col.commission]) : null, cur = col.curCommission ? parseNum(r[col.curCommission]) : null;
    out.push({ key: k, row: r.__row, l, bc, sku, name: col.name ? str(r[col.name]) : '', current: col.current ? parseNum(r[col.current]) || null : null, tiers,
      comm: comm > 0 ? comm : null, cur: cur > 0 ? cur : null, start: col.start ? day(r[col.start]) : null, end: col.end ? day(r[col.end]) : null,
      raw: JSON.stringify(head.map((h) => r[h] ?? '')) });
  }
  if (!out.length) fail(400, 'Fiyatı dolu satır bulunamadı');
  await run(db, 'DELETE FROM offer_rows WHERE channel = ? AND kind = ?', channel, kind);
  await run(db, 'DELETE FROM offer_files WHERE channel = ? AND kind = ?', channel, kind);
  for (const part of chunk(out, 60)) {
    await db.batch(part.map((o) => db.prepare(`INSERT INTO offer_rows (channel, kind, key, row_no, remote_id, product_id, barcode, sku, name, current_price, tiers, file_comm, cur_comm, starts_at, ends_at, raw, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (channel, kind, key) DO NOTHING`)
      .bind(channel, kind, o.key, o.row, o.l ? o.l.remote_id : null, o.l ? o.l.product_id : null, o.bc || (o.l && o.l.barcode) || null, o.sku || (o.l && o.l.sku) || null, o.name || (o.l && o.l.name) || '',
        o.current, JSON.stringify(o.tiers), o.comm, o.cur, o.start, o.end, o.raw, t)));
  }
  // Dosya ve sütun bilgisi (geri yazmak için). Dosya çok büyükse saklanmaz; indirirken başlık + satırlardan yeniden kurulur.
  const data = typeof b.file === 'string' && b.file.length <= MAX_FILE ? b.file : '';
  const target = col.target ? { index: head.indexOf(col.target), header: col.target, append: false } : { index: head.length, header: NEW_COL, append: true };
  const meta = { name: str(b.name).slice(0, 200) || `${channel}-${kind}.xlsx`, type: b.type === 'csv' ? 'csv' : 'xlsx', sep: [';', ',', '\t'].includes(b.sep) ? b.sep : ';', headerRow, head, target,
    join: col.join ? { index: head.indexOf(col.join), header: col.join } : null, textPrices, stored: !!data, demo: !!b.demo, uploaded_at: t, user,
    columns: { barcode: col.barcode, sku: col.sku, remote: col.remote, name: col.name, current: col.current, commission: col.commission, tiers: col.tiers } };
  const parts = data ? Array.from({ length: Math.ceil(data.length / PART) }, (_, i) => data.slice(i * PART, (i + 1) * PART)) : [''];
  for (const [i, d] of parts.entries()) await run(db, 'INSERT INTO offer_files (channel, kind, part, meta, data) VALUES (?, ?, ?, ?, ?)', channel, kind, i, i ? null : JSON.stringify(meta), d);
  const matched = out.filter((o) => o.l).length;
  await log(db, channel, 'info', `${user}: ${KINDS[kind]} listesi yüklendi · ${out.length} ürün (${matched} ilanla eşleşti) · eşikler: ${col.tiers.join(', ')}`);
  return { imported: out.length, matched, unmatched: out.length - matched, tiers: col.tiers, columns: col, target };
}

// Saklanan dosya (base64) ve sütun bilgisi
export async function offerFile(db, { channel, kind }) {
  const parts = await all(db, 'SELECT part, meta, data FROM offer_files WHERE channel = ? AND kind = ? ORDER BY part', str(channel), str(kind));
  if (!parts.length) return { meta: null, data: null };
  let meta = null;
  try { meta = JSON.parse(parts[0].meta || 'null'); } catch { /* bozuk */ }
  const data = parts.map((p) => p.data || '').join('');
  if (data) return { meta, data };
  // Dosya saklanmadıysa (çok büyük / demo örneği) indirirken başlık + satırlardan yeniden kurulur
  const rows = (await all(db, 'SELECT row_no, raw FROM offer_rows WHERE channel = ? AND kind = ? ORDER BY row_no', str(channel), str(kind)))
    .map((r) => { try { return [r.row_no, JSON.parse(r.raw || '[]')]; } catch { return [r.row_no, []]; } });
  return { meta, data: null, rows };
}

// Kâr hesabının girdileri. Komisyon: dosyadaki oran (Trendyol oranı KDV dahil olduğu gibi, Hepsiburada oranı KDV hariç → × 1,20),
// yoksa ilanın oranı (KDV dahil saklanır; rateGross), o da yoksa resmî liste oranı, o da yoksa Ayarlar'daki kanal oranı.
export function costInputs(o, settings) {
  const ch = o.channel, cost = (k) => costOf(settings, k, ch);
  const fileRate = (v) => (v == null ? null : r2(v * (mpOf(ch) === 'hepsiburada' ? 1.2 : 1)));
  const lr = listRate(ch, o.mp_category);
  const base = rateGross(settings, o.commission) ?? (lr ? lr.rate : null) ?? cost('commission');
  return {
    purchase: o.purchase_price > 0 ? o.purchase_price : null, vat: o.vat ?? 20,
    tierRate: fileRate(o.file_comm) ?? base, curRate: fileRate(o.cur_comm) ?? base,
    shipping: cost('shipping'), fee: cost('service_fee'), feeRate: cost('fee_rate'), withholding: cost('withholding'),
  };
}
export const calcAt = (c, price, rate) => {
  if (!(c.purchase > 0) || !(price > 0)) return null;
  const x = profit({ sale: price, purchase: c.purchase, commissionRate: rate, shipping: c.shipping, fee: c.fee, feeRate: c.feeRate, withholdingRate: c.withholding, vatRate: c.vat });
  return { profit: r2(x.unitProfit), margin: r2(x.margin), loss: x.unitProfit < 0 };
};

// Teklifler + her eşik fiyatında / şu anki fiyatta / seçilen fiyatta birim kâr ve kâr oranı
export async function listOffers(db, { channel, kind } = {}) {
  const where = [], args = [];
  if (channel) { where.push('o.channel = ?'); args.push(channel); }
  if (kind) { where.push('o.kind = ?'); args.push(kind); }
  const [rows, settings, groups, file] = await Promise.all([
    all(db, `SELECT o.*, l.price AS listing_price, l.list_price, l.commission, l.commission_src, l.mp_category, COALESCE(NULLIF(l.image, ''), p.image) AS image, l.price_dirty,
        p.purchase_price, p.vat, p.name AS product_name, p.variant_name, p.stock
      FROM offer_rows o LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = o.remote_id LEFT JOIN products p ON p.id = o.product_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.row_no LIMIT ${MAX_ROWS}`, ...args),
    getSettings(db),
    all(db, `SELECT channel, kind, COUNT(*) AS n, SUM(remote_id IS NOT NULL) AS matched, SUM(chosen_price IS NOT NULL) AS chosen, SUM(applied_at IS NOT NULL) AS applied, MAX(updated_at) AS at
      FROM offer_rows GROUP BY channel, kind`),
    channel && kind ? first(db, 'SELECT meta FROM offer_files WHERE channel = ? AND kind = ? AND part = 0', channel, kind) : null,
  ]);
  const offers = rows.map((o) => {
    let tiers = [];
    try { tiers = JSON.parse(o.tiers || '[]'); } catch { /* boş */ }
    const c = costInputs(o, settings);
    const price = o.listing_price || o.current_price || 0;
    return {
      channel: o.channel, kind: o.kind, key: o.key, row: o.row_no, remote_id: o.remote_id, product_id: o.product_id, barcode: o.barcode, sku: o.sku,
      name: o.product_name || o.name, variant: o.variant_name || '', image: o.image || '', stock: o.stock, price, list_price: o.list_price, file_price: o.current_price,
      starts_at: o.starts_at, ends_at: o.ends_at, choice: o.choice || null, chosen_price: o.chosen_price, chosen: o.chosen_price ? calcAt(c, o.chosen_price, c.tierRate) : null,
      applied_price: o.applied_price, applied_at: o.applied_at, pending: !!o.price_dirty, calc: c,
      now: calcAt(c, price, c.curRate), tiers: tiers.map((x) => ({ ...x, ...(calcAt(c, x.price, c.tierRate) || {}), ok: price > 0 && price <= x.price + 0.001 })),
    };
  });
  let meta = null;
  try { meta = file && file.meta ? JSON.parse(file.meta) : null; } catch { /* bozuk */ }
  return { offers, groups, kinds: KINDS, file: meta };
}

// Satır başına seçim: choice = 't0', 't1', … (eşik), 'custom' (price ile) ya da null (değiştirme)
export async function chooseOffers(db, { channel, kind, items = [] }) {
  if (!Array.isArray(items) || !items.length) fail(400, 'Ürün seçin');
  if (items.length > MAX_ROWS) fail(400, 'Çok fazla satır');
  const rows = await all(db, 'SELECT key, tiers FROM offer_rows WHERE channel = ? AND kind = ?', str(channel), str(kind));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const st = [], done = [];
  let set = 0, cleared = 0, bad = 0;
  for (const it of items) {
    const r = byKey.get(String(it.key));
    if (!r) { bad++; continue; }
    let choice = it.choice == null || it.choice === '' ? null : String(it.choice), price = null;
    if (choice && /^t\d+$/.test(choice)) {
      let tiers = [];
      try { tiers = JSON.parse(r.tiers || '[]'); } catch { /* boş */ }
      const x = tiers[Number(choice.slice(1))];
      if (!x) { bad++; continue; }
      price = Math.floor(x.price * 100 + 1e-6) / 100;
    } else if (choice === 'custom') {
      price = r2(parseNum(it.price));
      if (!(price > 0)) { bad++; continue; }
    } else choice = null;
    st.push(db.prepare('UPDATE offer_rows SET choice = ?, chosen_price = ? WHERE channel = ? AND kind = ? AND key = ?').bind(choice, price, str(channel), str(kind), r.key));
    done.push({ key: r.key, choice, price });
    choice ? set++ : cleared++;
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  return { set, cleared, bad, items: done };
}

// Seçilen fiyatları ilanların kanal fiyatı yap (fiyat gönderimi kuyruğa girer). Zararına olanlar atlanır (allowLoss ile gönderilir).
// Eski biçim: tier verilirse seçili satırlara o eşik uygulanır.
export async function applyOffers(db, { channel, kind, keys = [], tier = null, minMargin = null, allowLoss = false, user = 'Panel' }) {
  if (!Array.isArray(keys) || !keys.length) fail(400, 'Ürün seçin');
  if (tier != null && tier !== '') await chooseOffers(db, { channel, kind, items: keys.map((key) => ({ key, choice: `t${Number(tier) || 0}` })) });
  const { offers } = await listOffers(db, { channel, kind });
  const want = new Set(keys.map(String)), t = Date.now(), st = [];
  let applied = 0, skipped = 0, unmatched = 0, loss = 0;
  for (const o of offers) {
    if (!want.has(o.key)) continue;
    if (!o.remote_id) { unmatched++; continue; }
    if (!(o.chosen_price > 0)) { skipped++; continue; }
    if (o.chosen && o.chosen.loss && !allowLoss) { loss++; continue; }
    if (minMargin != null && minMargin !== '' && o.chosen && o.chosen.margin < Number(minMargin)) { skipped++; continue; }
    const price = o.chosen_price;
    st.push(db.prepare('UPDATE listings SET price = ?, list_price = CASE WHEN COALESCE(list_price, 0) < ? THEN ? ELSE list_price END, price_dirty = 1 WHERE channel = ? AND remote_id = ?')
      .bind(price, price, price, o.channel, o.remote_id));
    st.push(db.prepare('UPDATE offer_rows SET applied_price = ?, applied_at = ? WHERE channel = ? AND kind = ? AND key = ?').bind(price, t, o.channel, o.kind, o.key));
    applied++;
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  if (applied) await log(db, channel, 'info', `${user}: ${KINDS[kind] || 'kampanya'} fiyatı ${applied} ilana uygulandı (fiyat gönderimi sırada)`);
  return { applied, skipped, unmatched, loss };
}

export async function clearOffers(db, { channel, kind }) {
  if (!channel || !KINDS[kind]) fail(400, 'Kanal ve tür seçin');
  const r = await run(db, 'DELETE FROM offer_rows WHERE channel = ? AND kind = ?', channel, kind);
  await run(db, 'DELETE FROM offer_files WHERE channel = ? AND kind = ?', channel, kind);
  return { removed: (r.meta && r.meta.changes) || 0 };
}

// ---------- deneme modu (DEMO=1) ----------
// Örnek dosyalar: Trendyol yıldızlı / avantajlı ürün etiketleri dışa aktarımı ve Hepsiburada flaş indirim daveti düzeninde.
// Fiyatlar Trendyol dosyasındaki gibi metin ("1.234,90" değil "1234,90"); satırlar demo ilanlarının fiyatından üretilir.
export const DEMO_KIND = { trendyol: 'advantage', hepsiburada: 'flash' };
const tr = (v) => r2(v).toFixed(2).replace('.', ',');
const ninety = (v) => r2(Math.max(1, Math.floor(v / 10) * 10 - 0.1));
const dstr = (ms) => { const d = new Date(ms + 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()} 23:59`; };
export async function demoSample(db, channel) {
  const kind = DEMO_KIND[channel];
  if (!kind) fail(400, 'Örnek dosya yalnız Trendyol ve Hepsiburada için');
  const ls = new Map((await all(db, 'SELECT l.sku, l.price, p.stock FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE l.channel = ? AND l.price > 0', channel)).map((l) => [l.sku, l]));
  const now = Date.now(), start = dstr(now), end = dstr(now + 6 * 864e5);
  const rows = [];
  DEMO_PRODUCTS.forEach((p, i) => {
    const l = ls.get(p[0]);
    if (!l) return;
    const P = l.price, deep = [0.62, 0.7, 0.78, 0.85][i % 4]; // bazı ürünlerde son eşik zarara düşer
    if (channel === 'trendyol') {
      const comm = [20, 21.5, 18, 22.5][i % 4];
      rows.push([p[2], p[1], `${p[0]}-M`, p[0], p[9].split(' › ')[0] === 'Bahçe' ? 'HG' : 'Demo', p[9].split(' › ').pop(), start, end,
        tr(ninety(P * 0.96)), tr(ninety(P * 0.9)), tr(ninety(P * deep)), tr(comm - 2), String(l.stock ?? 0), tr(comm), tr(Math.round(P * 1.15)), tr(P)]);
    } else {
      rows.push([p[0], `HBV0000${String(100 + i)}`, p[1], p[2], tr(P), tr(ninety(P * 0.93)), tr(ninety(P * deep)), start, end, '', '']);
    }
  });
  const head = channel === 'trendyol'
    ? ['ÜRÜN İSMİ', 'BARKOD', 'MODEL KODU', 'STOK KODU', 'MARKA', 'KATEGORİ', 'BAŞLANGIÇ TARİHİ', 'BİTİŞ TARİHİ', '1 YILDIZ ÜST FİYAT', '2 YILDIZ ÜST FİYAT', '3 YILDIZ ÜST FİYAT', 'Komisyon Oranı', 'STOK', 'GÜNCEL KOMİSYON', 'PİYASA SATIŞ FİYATI', 'GÜNCEL SATIŞ FİYATI']
    : ['Satıcı Stok Kodu', 'Hepsiburada Ürün Kodu', 'Barkod', 'Ürün Adı', 'Güncel Satış Fiyatı', 'Kampanya Üst Fiyat Limiti', 'Önerilen Kampanya Fiyatı', 'Kampanya Başlangıç Tarihi', 'Kampanya Bitiş Tarihi', 'Kampanya Fiyatı', 'Katılım'];
  return { channel, kind, name: channel === 'trendyol' ? 'YildizliUrunEtiketleri-ornek.xlsx' : 'Hepsiburada-flas-indirim-daveti-ornek.xlsx', head, rows };
}
// Demo panelinde ilk açılışta örnek listeler yüklenir (bir kez; kullanıcı silerse geri gelmez — demo her gün sıfırlanır)
export async function seedDemoOffers(db) {
  if (await first(db, "SELECT 1 AS x FROM settings WHERE k = 'demo_offers_1'")) return 0;
  let n = 0;
  for (const channel of Object.keys(DEMO_KIND)) {
    const s = await demoSample(db, channel);
    if (!s.rows.length) continue;
    const grid = [[1, s.head, 's'.repeat(s.head.length)], ...s.rows.map((r, i) => [i + 2, r, r.map(() => 's').join('')])];
    n += (await importOffers(db, { channel, kind: s.kind, name: s.name, type: 'xlsx', grid, demo: true, user: 'Demo' })).imported;
  }
  // İlanlar henüz gelmediyse (ilk senkron) sonraki açılışta yeniden denenir
  if (n) await run(db, "INSERT INTO settings (k, v) VALUES ('demo_offers_1', '1') ON CONFLICT (k) DO NOTHING");
  return n;
}
