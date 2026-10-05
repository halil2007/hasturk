// SKU oluşturma: ürün adından okunabilir stok kodu. Biçim: [ÖN EK-]KISALTMA[-MİKTAR / VARYANT]
//   "HasTürk Solucan Gübresi - 15 Kg" (marka HasTürk, ön ek HG) → HG-SOGU-15KG
//   "Bahçe Toprağı Canlandırma Seti"                            → HG-BTCS
//   "Sıvı Gübre 2,5 Lt" → …-SIGU-2500ML  (ondalıklı miktar küçük birime çevrilir; nokta/virgül kullanılmaz)
// Kısaltma: tek kelime → ilk 4 harf; iki kelime → her birinin ilk 2 harfi; üç ve fazlası → ilk 4 kelimenin baş harfleri.
// Marka adı ve parantez içi (genelde eski kod) kısaltmaya girmez. Benzersizlik panel ürünleri ve tüm kanal ilanlarına karşı denetlenir; çakışırsa -2, -3 eklenir.
import { all, getRaw, setSetting, log } from './db.js';
import { chunk, str, fail } from './util.js';
import { norm } from './match.js';

const STOP = new Set(['ve', 'ile', 'icin', 'de', 'da', 'the', 'and', 'of', 'x', 'li', 'lu', 'lik', 'luk', 'adet', 'yeni', 'orijinal', 'ozel']);
const QTY = /(\d+(?:[.,]\d+)?)\s*['’]?\s*(kilogram|kilo|kg|gram|gr|g|litre|liter|lt|l|ml|cc|ton|adet|ad|li|lu|cm|mm|m|paket|pk)\b/;
const UNIT = { kilogram: 'KG', kilo: 'KG', kg: 'KG', gram: 'GR', gr: 'GR', g: 'GR', litre: 'LT', liter: 'LT', lt: 'LT', l: 'LT', ml: 'ML', cc: 'ML', ton: 'TON', adet: 'AD', ad: 'AD', li: 'LU', lu: 'LU', cm: 'CM', mm: 'MM', m: 'M', paket: 'PK', pk: 'PK' };
const SMALL = { KG: ['GR', 1000], LT: ['ML', 1000], TON: ['KG', 1000], M: ['CM', 100] };

export const cleanSku = (s) => norm(s).toUpperCase().replace(/[^A-Z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export function cleanSkuPrefix(p) {
  const x = cleanSku(p);
  if (str(p) && !x) fail(400, 'SKU ön eki harf ve rakamdan oluşmalı (ör. HG)');
  return x.slice(0, 8);
}

// "15 Kg" → 15KG, "2,5 Lt" → 2500ML, "3'lü" → 3LU
function qtyCode(text) {
  const r = /(\d+)\s*[/-]\s*(\d+)\s*(mm|cm|m|kg|gr|g|lt|l|ml)\b/.exec(norm(text)); // aralık: "15/25 MM" → 15-25MM
  if (r) return `${r[1]}-${r[2]}${UNIT[r[3]]}`;
  const m = QTY.exec(norm(text));
  if (!m) return '';
  let v = Number(m[1].replace(',', '.')), u = UNIT[m[2]];
  if (!Number.isInteger(v) && SMALL[u]) { v = Math.round(v * SMALL[u][1]); u = SMALL[u][0]; }
  return Number.isInteger(v) ? `${v}${u}` : `${String(v).replace('.', '')}${u}`;
}
const words = (text, brand) => {
  const b = new Set(norm(brand).split(/[^a-z0-9]+/).filter(Boolean));
  return norm(text).replace(/\([^)]*\)/g, ' ').replace(new RegExp(QTY.source, 'g'), ' ')
    .split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w) && !STOP.has(w) && !b.has(w));
};
function abbr(ws) {
  if (!ws.length) return '';
  if (ws.length === 1) return ws[0].slice(0, 4).toUpperCase();
  if (ws.length === 2) return (ws[0].slice(0, 2) + ws[1].slice(0, 2)).toUpperCase();
  return ws.slice(0, 4).map((w) => w[0]).join('').toUpperCase();
}

// Ürün için SKU önerisi (benzersizlik denetimi olmadan)
export function skuFor(p, prefix = '') {
  const variant = str(p.variant_name);
  const base = variant && str(p.group_name) ? p.group_name : p.name;
  let core = abbr(words(base, p.brand));
  if (!core) core = abbr(words(base, '')) || 'URUN'; // ad yalnız markadan oluşuyorsa markayı kullan
  let tail = qtyCode(variant) || qtyCode(p.name);
  if (!tail && variant) tail = abbr(words(variant, '')).slice(0, 4);
  return cleanSku([prefix, core, tail].filter(Boolean).join('-'));
}

async function usedSkus(db, exceptIds = []) {
  const rows = await all(db, `SELECT UPPER(TRIM(sku)) AS s FROM products WHERE COALESCE(TRIM(sku), '') != ''${exceptIds.length ? ` AND id NOT IN (${exceptIds.map(() => '?').join(',')})` : ''}
    UNION SELECT UPPER(TRIM(sku)) FROM listings WHERE COALESCE(TRIM(sku), '') != '' AND (product_id IS NULL${exceptIds.length ? ` OR product_id NOT IN (${exceptIds.map(() => '?').join(',')})` : ''})`, ...exceptIds, ...exceptIds);
  return new Set(rows.map((r) => r.s));
}
function unique(sku, used) {
  let s = sku;
  for (let i = 2; used.has(s); i++) s = `${sku}-${i}`;
  used.add(s);
  return s;
}

export async function skuPrefix(db) { return (await getRaw(db, 'sku_prefix')) ?? ''; }

// Önizleme: seçilen ürünler için benzersiz SKU önerileri (kaydedilmez). Barkodu olan ürün de listelenir, SKU'su dolu olan atlanır.
export async function previewSkus(db, ids, prefix) {
  const pre = cleanSkuPrefix(prefix ?? await skuPrefix(db));
  ids = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((x) => x > 0))].slice(0, 2000);
  const prods = [];
  for (const part of chunk(ids, 400)) prods.push(...await all(db, `SELECT id, name, group_name, variant_name, brand, sku FROM products WHERE id IN (${part.map(() => '?').join(',')})`, ...part));
  const used = await usedSkus(db);
  return { prefix: pre, items: prods.filter((p) => !str(p.sku)).map((p) => ({ id: p.id, sku: unique(skuFor(p, pre), used) })) };
}

// Tek ürün için öneri (ürün formundaki "Oluştur"): ad / varyant / marka formdaki değerlerden
export async function suggestSku(db, { name, group_name, variant_name, brand, id, prefix } = {}) {
  const pre = cleanSkuPrefix(prefix ?? await skuPrefix(db));
  if (!str(name)) fail(400, 'Önce ürün adını yazın');
  return { sku: unique(skuFor({ name, group_name, variant_name, brand }, pre), await usedSkus(db, id ? [Number(id)] : [])) };
}

// Kaydet: [{ id, sku }] (önizlemede elle değiştirilmiş olabilir). SKU'su dolu ürün atlanır; çakışan kod reddedilir.
export async function assignSkus(db, items, { prefix, user = 'Panel' } = {}) {
  const list = (Array.isArray(items) ? items : []).map((x) => ({ id: Number(x.id), sku: cleanSku(x.sku) })).filter((x) => x.id > 0).slice(0, 2000);
  if (!list.length) fail(400, 'Ürün seçilmedi');
  const bad = list.filter((x) => !x.sku);
  if (bad.length) fail(400, `${bad.length} üründe SKU boş`);
  const dupIn = list.map((x) => x.sku).filter((s, i, a) => a.indexOf(s) !== i);
  if (dupIn.length) fail(400, `Aynı SKU birden fazla üründe: ${[...new Set(dupIn)].slice(0, 5).join(', ')}`);
  const used = await usedSkus(db, list.map((x) => x.id));
  const taken = list.filter((x) => used.has(x.sku));
  if (taken.length) fail(400, `Bu SKU'lar başka ürün ya da ilanda kullanılıyor: ${taken.slice(0, 5).map((x) => x.sku).join(', ')}`);
  const t = Date.now(), done = [];
  let skipped = 0;
  for (const part of chunk(list, 90)) {
    const st = part.map((x) => db.prepare("UPDATE products SET sku = ?, updated_at = ? WHERE id = ? AND COALESCE(TRIM(sku), '') = ''").bind(x.sku, t, x.id));
    const res = await db.batch(st);
    part.forEach((x, i) => { if (res[i] && res[i].meta && res[i].meta.changes) done.push(x); else skipped++; });
  }
  if (prefix !== undefined) await setSetting(db, 'sku_prefix', cleanSkuPrefix(prefix));
  if (done.length) await log(db, null, 'info', `${user}: ${done.length} ürüne SKU oluşturuldu`);
  return { assigned: done, skipped };
}
