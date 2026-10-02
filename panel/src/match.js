// Ürün eşleştirme.
//  Kesin (otomatik): barkod aynı → bağla; ya da stok kodu (SKU) aynı ve barkodlar çelişmiyor → bağla.
//  Kesin değil: ad benzerliği + miktar/ölçü (5 Kg, 10 Lt…) uyumuna göre puanlı öneri; kullanıcı onaylar.
// Varyant düzeyinde çalışır: ikas'ta bir ürünün varyantı olan "5 Kg", Trendyol'da ayrı ürün olsa da aynı panel ürününe bağlanır.
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

// 0–100 benzerlik puanı ve gerekçeler
export function similarity(a, b) {
  const ta = tokens(a.name), tb = tokens(b.name);
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  let score = union ? (inter / union) * 0.85 : 0;
  const why = [];
  if (inter) why.push(`${inter} ortak kelime`);
  const qa = quantities(`${a.name} ${a.variant || ''}`), qb = quantities(`${b.name} ${b.variant || ''}`);
  if (qa.size && qb.size) {
    const same = [...qa].some((q) => qb.has(q));
    if (same) { score += 0.25; why.push('ölçü aynı'); } else { score *= 0.3; why.push('ölçü farklı'); }
  }
  const sa = norm(a.sku).replace(/[^a-z0-9]/g, ''), sb = norm(b.sku).replace(/[^a-z0-9]/g, '');
  if (sa.length >= 4 && sb.length >= 4 && (sa.includes(sb) || sb.includes(sa))) { score += 0.3; why.push('stok kodu benzer'); }
  if (a.barcode && b.barcode && a.barcode !== b.barcode) { score *= 0.8; why.push('barkod farklı'); }
  return { score: Math.round(Math.min(1, score) * 100), why };
}

// Kesin eşleşme bulunursa ürün kimliği ve şekli; yoksa null
export function certain(l, idx) {
  const bc = str(l.barcode), sku = str(l.sku).toLowerCase();
  const byBc = bc.length >= 6 ? idx.barcode.get(bc) : null;
  const bySku = sku ? idx.sku.get(sku) : null;
  if (byBc && byBc.length === 1) {
    if (bySku && bySku[0].id !== byBc[0].id) return null; // barkod bir ürünü, SKU başka ürünü gösteriyor: emin değiliz
    return { id: byBc[0].id, how: 'barcode' };
  }
  if (bySku && bySku.length === 1) {
    const p = bySku[0];
    if (bc && p.barcode && p.barcode !== bc) return null; // SKU aynı ama barkod çelişiyor
    return { id: p.id, how: 'sku' };
  }
  return null;
}

export async function productIndex(db) {
  const prods = await all(db, 'SELECT id, sku, barcode, name, variant_name, group_name, image, stock FROM products WHERE active = 1 OR active = 0');
  const sku = new Map(), barcode = new Map();
  for (const p of prods) {
    if (p.sku) { const k = p.sku.toLowerCase(); sku.set(k, [...(sku.get(k) || []), p]); }
    if (p.barcode) barcode.set(p.barcode, [...(barcode.get(p.barcode) || []), p]);
  }
  return { prods, sku, barcode };
}

// Eşleşmemiş ilanları kesin olanlarla bağla; ana katalog kanallarındaki karşılıksız ilanlardan yeni ürün aç
export async function autoMatch(db, { catalog = ['ikas1'] } = {}) {
  let idx = await productIndex(db);
  const unlinked = await all(db, 'SELECT channel, remote_id, sku, barcode, name, group_name, variant_name, image, price, remote_stock FROM listings WHERE product_id IS NULL AND ignored = 0');
  const st = [], left = [];
  for (const l of unlinked) {
    const c = certain(l, idx);
    if (c) st.push(db.prepare('UPDATE listings SET product_id = ?, match = ?, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ?').bind(c.id, c.how, l.channel, l.remote_id));
    else left.push(l);
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  let created = 0, later = 0;
  // Ana katalogdan yeni ürün (SKU veya barkodu olan, başka kesin eşleşmesi olmayan varyantlar)
  const fresh = left.filter((l) => catalog.includes(l.channel) && (str(l.sku) || str(l.barcode)));
  if (fresh.length) {
    const t = Date.now(), seen = new Set();
    const ins = [];
    for (const l of fresh) {
      const key = str(l.sku).toLowerCase() || 'b:' + str(l.barcode);
      if (seen.has(key)) continue;
      seen.add(key);
      ins.push(db.prepare(`INSERT INTO products (sku, barcode, name, group_name, variant_name, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (sku) DO NOTHING`)
        .bind(str(l.sku) || null, str(l.barcode) || null, l.name || l.sku || l.barcode, l.group_name || null, l.variant_name || null, l.image || '', l.price || 0, Math.max(0, l.remote_stock || 0), t, t));
    }
    for (const part of chunk(ins, 60)) await db.batch(part);
    created = ins.length;
    idx = await productIndex(db);
    // Yeni açılan ürünlere hem katalog ilanı hem de diğer kanallardaki kesin karşılıkları aynı turda bağlanır
    const st2 = [], isNew = new Set(fresh);
    for (const l of left) {
      const c = certain(l, idx);
      if (!c) continue;
      st2.push(db.prepare('UPDATE listings SET product_id = ?, match = ?, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ?').bind(c.id, isNew.has(l) ? 'new' : c.how, l.channel, l.remote_id));
      if (!isNew.has(l)) later++;
    }
    for (const part of chunk(st2, 90)) await db.batch(part);
  }
  // Ürünün eksik görsel / grup / varyant bilgisini bağlı ilandan tamamla
  await run(db, `UPDATE products SET
      image = COALESCE(NULLIF(image, ''), (SELECT l.image FROM listings l WHERE l.product_id = products.id AND l.image != '' ORDER BY l.channel LIMIT 1), ''),
      group_name = COALESCE(group_name, (SELECT l.group_name FROM listings l WHERE l.product_id = products.id AND l.group_name IS NOT NULL AND l.group_name != '' ORDER BY l.channel LIMIT 1)),
      variant_name = COALESCE(variant_name, (SELECT l.variant_name FROM listings l WHERE l.product_id = products.id AND l.variant_name IS NOT NULL AND l.variant_name != '' ORDER BY l.channel LIMIT 1))
    WHERE image IS NULL OR image = '' OR group_name IS NULL OR variant_name IS NULL`);
  const linked = st.length + later + created;
  if (linked) await relinkItems(db);
  return { linked: st.length + later, created };
}

// Eşleşme önerileri (emin olunamayan ilanlar)
export async function suggestions(db, { channel, q, limit = 100 } = {}) {
  const idx = await productIndex(db);
  const where = ['product_id IS NULL', 'ignored = 0'], args = [];
  if (channel) { where.push('channel = ?'); args.push(channel); }
  if (q) { where.push('(name LIKE ? OR sku LIKE ? OR barcode LIKE ?)'); const s = '%' + q + '%'; args.push(s, s, s); }
  const rows = await all(db, `SELECT channel, remote_id, sku, barcode, name, variant_name, image, price, remote_stock FROM listings WHERE ${where.join(' AND ')} ORDER BY channel, name LIMIT ?`, ...args, limit);
  const pn = idx.prods.map((p) => ({ ...p, full: [p.name, p.variant_name && !String(p.name).includes(p.variant_name) ? p.variant_name : ''].filter(Boolean).join(' ') }));
  return rows.map((l) => {
    const a = { name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode };
    const cands = pn.map((p) => ({ p, s: similarity(a, { name: p.full, sku: p.sku, barcode: p.barcode }) }))
      .filter((x) => x.s.score >= 25).sort((x, y) => y.s.score - x.s.score).slice(0, 3)
      .map(({ p, s }) => ({ product_id: p.id, name: p.full, sku: p.sku, barcode: p.barcode, image: p.image, stock: p.stock, score: s.score, why: s.why }));
    return { ...l, candidates: cands };
  });
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
