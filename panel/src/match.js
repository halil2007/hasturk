// Ürün eşleştirme: FARKLI kanallardaki aynı ürünü / varyantı tek panel ürününe bağlar.
//  Kural 1: bir panel ürününe her kanaldan en fazla BİR ilan bağlanır (aynı sitenin iki ürünü asla birleşmez).
//  Kural 2: ana katalog kanalının (ör. HasTürk ikas) her varyantı kendi panel ürünüdür; tek kanal bağlıyken eşleştirme yapılmaz.
//  Kesin (otomatik): barkod aynı; ya da stok kodu aynı ve barkod çelişmiyor; ya da ad + varyant/ölçü birebir aynı ve tek aday.
//  Kesin değil: ad benzerliği + ölçü (5 Kg, 10 Lt…) + varyant özellikleri + stok kodu benzerliğiyle puanlı öneri; kullanıcı onaylar.
import { all, run } from './db.js';
import { chunk, str } from './util.js';

const TR = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u' };
export const norm = (s) => String(s || '').replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (c) => TR[c]).toLowerCase();
const UNIT = { kg: 'kg', kilo: 'kg', kilogram: 'kg', g: 'g', gr: 'g', gram: 'g', lt: 'l', l: 'l', litre: 'l', liter: 'l', ml: 'ml', cc: 'ml', adet: 'ad', ad: 'ad', li: 'ad', lu: 'ad', cm: 'cm', mm: 'mm', m: 'm', paket: 'pk' };
const STOP = new Set(['ve', 'ile', 'icin', 'the', 'and', 'of', 'x', 'adet', 'li', 'lu', 'set', 'yeni', 'urun', 'orijinal']);

// Miktar/ölçü ifadeleri: "5 Kg", "10lt", "0,5 L", "3'lü" → { "5kg", "10l", "0.5l", "3ad" }; 1000 g = 1 kg, 1000 ml = 1 l
export function quantities(s) {
  const out = new Set();
  const re = /(\d+(?:[.,]\d+)?)\s*['’]?\s*(kilogram|kilo|kg|gram|gr|g|litre|liter|lt|l|ml|cc|adet|ad|li|lu|cm|mm|m|paket)\b/g;
  let m;
  const t = norm(s);
  while ((m = re.exec(t))) {
    let v = Number(m[1].replace(',', '.')), u = UNIT[m[2]];
    if (u === 'g' && v >= 1000) { v /= 1000; u = 'kg'; }
    if (u === 'ml' && v >= 1000) { v /= 1000; u = 'l'; }
    out.add(`${+v.toFixed(3)}${u}`);
  }
  return out;
}
export function tokens(s) {
  const t = norm(s).replace(/(\d+(?:[.,]\d+)?)\s*['’]?\s*(kilogram|kilo|kg|gram|gr|g|litre|liter|lt|l|ml|cc|adet|ad|li|lu|cm|mm|m|paket)\b/g, ' ');
  return new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

// Karşılaştırma için önceden hazırlanmış özellikler (binlerce üründe her seferinde yeniden ayrıştırmamak için)
export const prep = (x) => ({
  t: tokens(x.name), q: quantities(`${x.name || ''} ${x.variant || ''}`), v: tokens(x.variant),
  sku: norm(x.sku).replace(/[^a-z0-9]/g, ''), barcode: str(x.barcode),
});

// 0–100 benzerlik puanı ve gerekçeler (a, b: prep() sonucu)
export function score(a, b) {
  let inter = 0;
  for (const w of a.t) if (b.t.has(w)) inter++;
  const union = a.t.size + b.t.size - inter;
  let sc = union ? (inter / union) * 0.85 : 0;
  const why = [];
  if (inter) why.push(`${inter} ortak kelime`);
  if (a.q.size && b.q.size) {
    if ([...a.q].some((q) => b.q.has(q))) { sc += 0.25; why.push('ölçü aynı'); } else { sc *= 0.3; why.push('ölçü farklı'); }
  }
  if (a.sku.length >= 4 && b.sku.length >= 4 && (a.sku.includes(b.sku) || b.sku.includes(a.sku))) { sc += 0.3; why.push('stok kodu benzer'); }
  // Varyant özellikleri (renk, tip…): ikisinde de varsa ve hiç ortak kelime yoksa farklı varyanttır
  if (a.v.size && b.v.size && ![...a.v].some((w) => b.v.has(w) || b.t.has(w)) && ![...b.v].some((w) => a.t.has(w))) { sc *= 0.5; why.push('varyant farklı'); }
  if (a.barcode && b.barcode && a.barcode !== b.barcode) { sc *= 0.8; why.push('barkod farklı'); }
  return { score: Math.round(Math.min(1, sc) * 100), why };
}
export const similarity = (a, b) => score(prep(a), prep(b));

// Ad + varyant anahtarı: kelime sırası, büyük/küçük harf, Türkçe karakter ve ölçü yazımından bağımsız
export function nameKey(name, variant) {
  const full = [name, variant && !norm(name).includes(norm(variant)) ? variant : ''].filter(Boolean).join(' ');
  const t = [...tokens(full)].sort();
  if (t.length < 2) return ''; // "Gübre" gibi tek kelimelik adlarla otomatik eşleştirme yapılmaz
  return t.join(' ') + '|' + [...quantities(full)].sort().join(',');
}

// Tam ad anahtarı (otomatik eşleşme için): adın TAMAMI, kelime sırası korunarak; Türkçe karakter, büyük/küçük harf,
// noktalama ve ölçü yazımı ("5 Kg" = "5kg" = "5000 gr") farkları yok sayılır. Adın sonu (ölçü / varyant) dahil birebir aynı olmalı.
export function fullKey(name, variant) {
  const full = [name, variant && !norm(name).includes(norm(variant)) ? variant : ''].filter(Boolean).join(' ');
  let t = norm(full).replace(/(\d+(?:[.,]\d+)?)\s*['’]?\s*(kilogram|kilo|kg|gram|gr|g|litre|liter|lt|l|ml|cc|adet|ad|li|lu|cm|mm|m|paket)\b/g, (x) => ` ${[...quantities(x)][0] || x} `);
  t = t.split(/[^a-z0-9.]+/).filter((w) => w && !STOP.has(w)).join(' ');
  return t.split(' ').length >= 2 ? t : '';
}

// Kesin eşleşme: aday ürün, ilanın kanalından henüz ilan almamış olmalı. Bulunursa { id, how }; yoksa null
export function certain(l, idx) {
  const no = /^x:\d+$/.test(l.match || '') ? Number(l.match.slice(2)) : 0; // kullanıcının kaldırdığı eşleşme
  const free = (list) => (list || []).filter((p) => p.id !== no && !idx.taken(p.id, l.channel));
  const bc = str(l.barcode), sku = str(l.sku).toLowerCase();
  const byBc = bc.length >= 6 ? free(idx.barcode.get(bc)) : [];
  const bySku = sku ? free(idx.sku.get(sku)) : [];
  if (byBc.length === 1) {
    if (bySku.length && bySku[0].id !== byBc[0].id) return null; // barkod bir ürünü, SKU başka ürünü gösteriyor: emin değiliz
    return { id: byBc[0].id, how: 'barcode' };
  }
  if (byBc.length > 1) return null;
  if (bySku.length === 1) {
    const p = bySku[0];
    if (bc && p.barcode && p.barcode !== bc) return null; // SKU aynı ama barkod çelişiyor
    return { id: p.id, how: 'sku' };
  }
  if (bySku.length > 1) return null;
  // Ada göre otomatik bağlama: adın tamamı ve sonu (ölçü) birebir aynı, tek aday ve ölçüler çelişmiyor
  const key = fullKey(l.name, l.variant_name);
  const byName = key ? free(idx.name.get(key)) : [];
  if (byName.length === 1) {
    const p = byName[0];
    if (bc && p.barcode && p.barcode !== bc) return null;
    if (sku && p.sku && p.sku.toLowerCase() !== sku) return null;
    return { id: p.id, how: 'name' };
  }
  return null;
}

export async function productIndex(db) {
  const prods = await all(db, 'SELECT id, sku, barcode, name, variant_name, group_name, image, stock FROM products');
  const used = await all(db, 'SELECT product_id, channel, name FROM listings WHERE product_id IS NOT NULL');
  const sku = new Map(), barcode = new Map(), name = new Map(), chans = new Map();
  const add = (m, k, p) => m.set(k, [...(m.get(k) || []), p]);
  const idx = {
    prods, sku, barcode, name, chans,
    taken: (id, ch) => !!(chans.get(id) && chans.get(id).has(ch)),
    use: (id, ch) => { if (!chans.has(id)) chans.set(id, new Set()); chans.get(id).add(ch); },
    add: (p) => {
      if (p.sku) add(sku, p.sku.toLowerCase(), p);
      if (p.barcode) add(barcode, p.barcode, p);
      const k = fullKey(p.name, p.variant_name);
      if (k) add(name, k, p);
    },
  };
  for (const p of prods) idx.add(p);
  for (const u of used) idx.use(u.product_id, u.channel);
  // Ürünün bağlı ilanlarının adları da ad anahtarına eklenir (aynı ürün farklı sitede farklı adla olabilir)
  const byId = new Map(prods.map((p) => [p.id, p]));
  for (const u of used) {
    const p = byId.get(u.product_id), k = fullKey(u.name);
    if (p && k && !(name.get(k) || []).includes(p)) add(name, k, p);
  }
  return idx;
}

// Ana katalog: ayarda seçilen ve ilanı olan kanallar; hiçbiri yoksa öncelik sırasındaki ilk bağlı kanal
const PRIORITY = ['ikas1', 'ikas2', 'hepsiburada', 'trendyol', 'n11', 'idefix', 'pazarama', 'pttavm'];
async function catalogChannels(db, wanted) {
  const have = new Set((await all(db, 'SELECT DISTINCT channel FROM listings')).map((r) => r.channel));
  const list = (wanted || []).filter((c) => have.has(c));
  if (list.length) return list;
  const first = PRIORITY.find((c) => have.has(c)) || [...have][0];
  return first ? [first] : [];
}

const link = (db, id, how, l) => db.prepare('UPDATE listings SET product_id = ?, match = ?, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ? AND product_id IS NULL').bind(id, how, l.channel, l.remote_id);

// Aynı kanaldan birden fazla ilanı aynı ürüne bağlanmış (eski sürümden kalma) eşleşmeleri onarır: ürüne en uygun
// ilan (barkod > stok kodu > ad benzerliği) kalır, diğerleri ayrılıp yeniden eşleştirmeye döner.
export async function repairDuplicates(db) {
  const dups = await all(db, 'SELECT product_id, channel FROM listings WHERE product_id IS NOT NULL GROUP BY product_id, channel HAVING COUNT(*) > 1');
  let freed = 0;
  for (const d of dups) {
    const p = await all(db, 'SELECT id, sku, barcode, name, variant_name FROM products WHERE id = ?', d.product_id);
    const ls = await all(db, 'SELECT remote_id, sku, barcode, name, variant_name, match FROM listings WHERE product_id = ? AND channel = ?', d.product_id, d.channel);
    if (!p[0] || ls.length < 2) continue;
    const pp = prep({ name: fullName(p[0]), variant: p[0].variant_name, sku: p[0].sku, barcode: p[0].barcode });
    const rank = (l) => (l.barcode && l.barcode === p[0].barcode ? 1000 : 0) + (l.sku && p[0].sku && l.sku.toLowerCase() === p[0].sku.toLowerCase() ? 500 : 0) + (l.match === 'manual' ? 50 : 0)
      + score(prep({ name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode }), pp).score;
    const keep = ls.slice().sort((a, b) => rank(b) - rank(a))[0];
    for (const l of ls) {
      if (l === keep) continue;
      await run(db, 'UPDATE listings SET product_id = NULL, match = NULL WHERE channel = ? AND remote_id = ?', d.channel, l.remote_id);
      freed++;
    }
  }
  if (freed) await run(db, 'UPDATE order_items SET product_id = NULL WHERE product_id IS NOT NULL AND remote_key != \'\' AND NOT EXISTS (SELECT 1 FROM listings l JOIN orders o ON o.id = order_items.order_id WHERE l.channel = o.channel AND l.remote_id = order_items.remote_key AND l.product_id = order_items.product_id)');
  return freed;
}

// Eşleşmemiş ilanları kesin olanlarla bağla; ana katalog kanalındaki karşılıksız her varyant için panel ürünü aç
export async function autoMatch(db, { catalog = ['ikas1'] } = {}) {
  const cats = await catalogChannels(db, catalog);
  // Stoğu sıfır olduğu için otomatik yok sayılan ilan, stoğu gelince yeniden eşleştirmeye döner
  await run(db, "UPDATE listings SET ignored = 0, match = NULL WHERE ignored = 1 AND match = 'zero' AND COALESCE(remote_stock, 0) > 0");
  // Stoğu 0 olan eşleşmemiş ilanlar (ana katalog dahil) eşleştirmeye hiç girmez: ürün açılmaz, öneri / onay listesine düşmez
  await run(db, "UPDATE listings SET ignored = 1, match = 'zero' WHERE product_id IS NULL AND ignored = 0 AND remote_stock IS NOT NULL AND remote_stock <= 0");
  const idx = await productIndex(db);
  const unlinked = await all(db, 'SELECT channel, remote_id, sku, barcode, name, group_name, variant_name, image, price, remote_stock, match FROM listings WHERE product_id IS NULL AND ignored = 0 ORDER BY channel, remote_id');
  // Ana katalog önce işlenir (sırasıyla), sonra diğer kanallar
  const rank = (c) => (cats.includes(c) ? cats.indexOf(c) : 99);
  unlinked.sort((a, b) => rank(a.channel) - rank(b.channel));
  const st = [];
  let linked = 0, created = 0;
  for (const l of unlinked) {
    const c = certain(l, idx);
    if (c) { st.push(link(db, c.id, c.how, l)); idx.use(c.id, l.channel); linked++; continue; }
    // Ana katalog: ilk katalog kanalının her varyantı ürün olur. Diğer katalog kanalları (ör. ikinci site) yalnızca
    // hiçbir ürüne benzemiyorsa yeni ürün açar; benziyorsa elle onaya düşer (yanlış birleştirme / mükerrer ürün olmasın).
    const isCat = cats.includes(l.channel);
    if (!isCat) continue;
    if (cats.indexOf(l.channel) > 0 && bestScore(l, idx) >= 40) continue;
    if (st.length) { for (const part of chunk(st.splice(0), 90)) await db.batch(part); }
    const skuFree = str(l.sku) && !idx.sku.has(str(l.sku).toLowerCase());
    const t = Date.now();
    const r = await db.prepare(`INSERT INTO products (sku, barcode, name, group_name, variant_name, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(skuFree ? str(l.sku) : null, str(l.barcode) || null, l.name || l.sku || l.barcode || l.remote_id, l.group_name || null, l.variant_name || null, l.image || '', l.price || 0, Math.max(0, l.remote_stock || 0), t, t).first();
    const p = { id: r.id, sku: skuFree ? str(l.sku) : null, barcode: str(l.barcode) || null, name: l.name, variant_name: l.variant_name, image: l.image, stock: Math.max(0, l.remote_stock || 0) };
    idx.prods.push(p); idx.add(p); idx.use(p.id, l.channel);
    st.push(link(db, p.id, 'new', l));
    created++;
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  // Ürünün eksik görsel / grup / varyant bilgisini bağlı ilandan tamamla
  await run(db, `UPDATE products SET
      image = COALESCE(NULLIF(image, ''), (SELECT l.image FROM listings l WHERE l.product_id = products.id AND l.image != '' ORDER BY l.channel LIMIT 1), ''),
      group_name = COALESCE(NULLIF(group_name, ''), (SELECT l.group_name FROM listings l WHERE l.product_id = products.id AND l.group_name IS NOT NULL AND l.group_name != '' ORDER BY l.channel LIMIT 1)),
      variant_name = COALESCE(NULLIF(variant_name, ''), (SELECT l.variant_name FROM listings l WHERE l.product_id = products.id AND l.variant_name IS NOT NULL AND l.variant_name != '' ORDER BY l.channel LIMIT 1))
    WHERE image IS NULL OR image = '' OR group_name IS NULL OR group_name = '' OR variant_name IS NULL OR variant_name = ''`);
  if (linked || created) await relinkItems(db);
  return { linked, created };
}

const fullName = (p) => [p.name, p.variant_name && !String(p.name).includes(p.variant_name) ? p.variant_name : ''].filter(Boolean).join(' ');
function candidates(l, idx, n = 3) {
  const a = prep({ name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode });
  const out = [];
  for (const p of idx.prods) {
    if (idx.taken(p.id, l.channel)) continue;
    if (!p._prep) p._prep = prep({ name: fullName(p), variant: p.variant_name, sku: p.sku, barcode: p.barcode });
    const s = score(a, p._prep);
    if (s.score >= 25) out.push({ p, s });
  }
  return out.sort((x, y) => y.s.score - x.s.score).slice(0, n);
}
const bestScore = (l, idx) => (candidates(l, idx, 1)[0] || { s: { score: 0 } }).s.score;

// Eşleşme önerileri (emin olunamayan ilanlar). Aday ürün, ilanın kanalından ilan almamış ürünlerdir.
export async function suggestions(db, { channel, q, limit = 100 } = {}) {
  const idx = await productIndex(db);
  const where = ['product_id IS NULL', 'ignored = 0'], args = [];
  if (channel) { where.push('channel = ?'); args.push(channel); }
  if (q) { where.push('(name LIKE ? OR sku LIKE ? OR barcode LIKE ?)'); const s = '%' + q + '%'; args.push(s, s, s); }
  const rows = await all(db, `SELECT channel, remote_id, sku, barcode, name, variant_name, image, price, remote_stock FROM listings WHERE ${where.join(' AND ')} ORDER BY channel, name LIMIT ?`, ...args, limit);
  if (!rows.length) return [];
  const on = await all(db, 'SELECT product_id, channel, name FROM listings WHERE product_id IS NOT NULL');
  return rows.map((l) => ({
    ...l,
    candidates: candidates(l, idx).map(({ p, s }) => ({
      product_id: p.id, name: fullName(p), sku: p.sku, barcode: p.barcode, image: p.image, stock: p.stock, score: s.score, why: s.why,
      channels: on.filter((x) => x.product_id === p.id).map((x) => ({ channel: x.channel, name: x.name })),
    })),
  }));
}

// Eşleşmiş ürünler: her panel ürünü ve her kanaldaki bağlı ilanı (inceleme ve düzeltme için)
export async function linkedGroups(db, { channel, q, how, multi, page = 1, limit = 40 } = {}) {
  const where = ['EXISTS (SELECT 1 FROM listings x WHERE x.product_id = p.id)'], args = [];
  if (channel) { where.push('EXISTS (SELECT 1 FROM listings x WHERE x.product_id = p.id AND x.channel = ?)'); args.push(channel); }
  if (how) { where.push('EXISTS (SELECT 1 FROM listings x WHERE x.product_id = p.id AND x.match = ?)'); args.push(how); }
  if (multi === '1') where.push('(SELECT COUNT(DISTINCT channel) FROM listings x WHERE x.product_id = p.id) > 1');
  if (multi === '0') where.push('(SELECT COUNT(DISTINCT channel) FROM listings x WHERE x.product_id = p.id) = 1');
  if (q) { const s = '%' + q + '%'; where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR EXISTS (SELECT 1 FROM listings x WHERE x.product_id = p.id AND (x.name LIKE ? OR x.sku LIKE ? OR x.barcode LIKE ?)))'); args.push(s, s, s, s, s, s); }
  const w = 'WHERE ' + where.join(' AND ');
  const total = (await all(db, `SELECT COUNT(*) AS n FROM products p ${w}`, ...args))[0].n;
  const prods = await all(db, `SELECT p.id, p.name, p.sku, p.barcode, p.image, p.group_name, p.variant_name, p.stock FROM products p ${w} ORDER BY COALESCE(NULLIF(p.group_name, ''), p.name) COLLATE NOCASE, p.variant_name COLLATE NOCASE LIMIT ? OFFSET ?`, ...args, limit, (Math.max(1, page) - 1) * limit);
  if (!prods.length) return { products: [], total };
  const ls = await all(db, `SELECT product_id, channel, remote_id, name, variant_name, sku, barcode, image, match, price, remote_stock FROM listings WHERE product_id IN (${prods.map(() => '?').join(',')}) ORDER BY channel`, ...prods.map((p) => p.id));
  for (const p of prods) p.listings = ls.filter((l) => l.product_id === p.id);
  return { products: prods, total };
}

// İlan bir ürüne bağlandığında, o ilanın eşleşmemiş sipariş satırları da bağlanır
export async function relinkItems(db) {
  await run(db, `UPDATE order_items SET product_id = (
      SELECT l.product_id FROM listings l JOIN orders o ON o.id = order_items.order_id
      WHERE l.channel = o.channel AND l.remote_id = order_items.remote_key AND l.product_id IS NOT NULL)
    WHERE product_id IS NULL AND remote_key != ''`);
  await run(db, `UPDATE order_items SET product_id = (SELECT p.id FROM products p WHERE p.sku IS NOT NULL AND LOWER(p.sku) = LOWER(order_items.sku))
    WHERE product_id IS NULL AND sku != ''`);
  await run(db, `UPDATE order_items SET product_id = (SELECT MIN(p.id) FROM products p WHERE p.barcode = order_items.barcode)
    WHERE product_id IS NULL AND barcode != ''`);
}
