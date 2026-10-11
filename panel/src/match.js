// Ürün eşleştirme: FARKLI kanallardaki aynı ürünü / varyantı tek panel ürününe bağlar.
//  Kural 1: otomatik eşleştirme bir panel ürününe her kanaldan en fazla BİR ilan bağlar (aynı sitenin iki ürünü asla birleşmez).
//           Aynı kanaldaki ikinci ilan yalnız kullanıcı onayıyla bağlanır (ikinci eşleşme, bkz. second.js; listings.extra_link = 1).
//  Kural 2: ana katalog kanalının (ör. HasTürk ikas) her varyantı kendi panel ürünüdür; tek kanal bağlıyken eşleştirme yapılmaz.
//  Kesin (otomatik): barkod aynı; ya da stok kodu aynı ve barkod çelişmiyor; ya da ad + varyant/ölçü birebir aynı ve tek aday.
//  Kesin değil: ad benzerliği + ölçü (5 Kg, 10 Lt…) + varyant özellikleri + stok kodu benzerliğiyle puanlı öneri; kullanıcı onaylar.
import { all, run, notify, getRaw, setSetting } from './db.js';
import { chunk, str } from './util.js';

const TR = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u' };
export const norm = (s) => String(s || '').replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (c) => TR[c]).toLowerCase();
// Generic (sector-agnostic) measures: mass, volume, length, data, power, pharma dose, counts / sizes / age
const UNIT = { kg: 'kg', kilo: 'kg', kilogram: 'kg', g: 'g', gr: 'g', gram: 'g', mg: 'mg', mcg: 'mcg', lt: 'l', l: 'l', litre: 'l', liter: 'l', cl: 'cl', ml: 'ml', cc: 'ml',
  adet: 'ad', ad: 'ad', li: 'ad', lu: 'ad', paket: 'pk', cm: 'cm', mm: 'mm', m: 'm', mt: 'm', metre: 'm', inc: 'inc', inch: 'inc',
  gb: 'gb', tb: 'tb', mb: 'mb', mah: 'mah', w: 'w', watt: 'w', kw: 'kw', v: 'v', volt: 'v', numara: 'no', no: 'no', yas: 'yas', ay: 'ay',
  parca: 'pc', yaprak: 'yp', kapsul: 'kp', tablet: 'tb_', sase: 'sase', cift: 'cift', kisilik: 'kisi' };
const QRE = /(\d+(?:[.,]\d+)?)\s*['’]?\s*(kilogram|kilo|kg|gram|gr|g|mg|mcg|litre|liter|lt|l|cl|ml|cc|adet|ad|li|lu|paket|cm|mm|metre|mt|m|inch|inc|gb|tb|mb|mah|watt|w|kw|volt|v|numara|no|yas|ay|parca|yaprak|kapsul|tablet|sase|cift|kisilik)\b/g;
const STOP = new Set(['ve', 'ile', 'icin', 'the', 'and', 'of', 'x', 'adet', 'li', 'lu', 'set', 'yeni', 'urun', 'orijinal']);
// fullKey must keep "set"/"takim"/"x": a set is not the single item
const KSTOP = new Set(['ve', 'ile', 'icin', 'the', 'and', 'of', 'yeni', 'urun', 'orijinal']);

// 1000 g = 1 kg, 0,25 kg = 250 g (canonical: smallest integer-friendly unit)
export function quantities(s) {
  const out = new Set();
  let m;
  const t = norm(s), re = new RegExp(QRE.source, 'g');
  while ((m = re.exec(t))) {
    let v = Number(m[1].replace(',', '.')), u = UNIT[m[2]];
    if (u === 'kg') { v *= 1000; u = 'g'; }
    if (u === 'l') { v *= 1000; u = 'ml'; }
    if (u === 'cl') { v *= 10; u = 'ml'; }
    if (u === 'tb') { v *= 1000; u = 'gb'; }
    if (u === 'g' && v >= 1000) { v /= 1000; u = 'kg'; }
    if (u === 'ml' && v >= 1000) { v /= 1000; u = 'l'; }
    out.add(`${+v.toFixed(3)}${u}`);
  }
  return out;
}
const qUnits = (q) => { const m = new Map(); for (const x of q) { const u = x.replace(/^[\d.]+/, ''); (m.get(u) || m.set(u, new Set()).get(u)).add(x); } return m; };
// Quantities conflict: same unit present on both sides with no common value, or a pack count (>1) on one side only
export function qtyConflict(a, b) {
  const A = qUnits(a), B = qUnits(b);
  for (const [u, s] of A) if (B.has(u) && ![...s].some((x) => B.get(u).has(x))) return true;
  const pack = (M, N) => ['ad', 'pk'].some((u) => M.has(u) && !N.has(u) && [...M.get(u)].some((x) => parseFloat(x) > 1));
  return pack(A, B) || pack(B, A);
}
export function tokens(s) {
  const t = norm(s).replace(new RegExp(QRE.source, 'g'), ' ');
  // single letters / digits are kept: sizes (S, M, L), ages ("3 Yaş"), "Vitamin C", model letters
  return new Set(t.split(/[^a-z0-9]+/).filter((w) => w.length >= 1 && !STOP.has(w)));
}
const vtok = (s) => new Set(norm(s).replace(new RegExp(QRE.source, 'g'), ' ').split(/[^a-z0-9]+/).filter((w) => w && !KSTOP.has(w)));
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ---- barcodes: list fields, Excel scientific notation, ISBN-10, GTIN leading zeros ----
const isbn13 = (t) => {
  if (!/^\d{9}[\dX]$/.test(t)) return null;
  let s = 0;
  for (let i = 0; i < 10; i++) s += (t[i] === 'X' ? 10 : Number(t[i])) * (10 - i);
  if (s % 11) return null;
  const d = '978' + t.slice(0, 9);
  let c = 0;
  for (let i = 0; i < 12; i++) c += Number(d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - (c % 10)) % 10);
};
function oneBc(x) {
  let t = str(x).replace(/[\s-]+/g, '').toUpperCase();
  // Excel scientific notation ("8.000500310427E+12"): usable only when every digit survived; "8.69E+12" is unusable (not a barcode)
  const sci = /^(\d)(?:[.,](\d+))?E\+?(\d+)$/.exec(t);
  if (sci) {
    const digits = sci[1] + (sci[2] || ''), len = Number(sci[3]) + 1;
    if (digits.length !== len) return '';
    t = digits;
  }
  const i13 = isbn13(t);
  if (i13) t = i13;
  if (!/^\d+$/.test(t)) return t;
  // GTIN baştaki sıfırlar (UPC-12 "0…" = EAN-13 = GTIN-14); kısa iç kodlarda ("000123456") sıfırlar koddur, atılmaz
  const z = t.replace(/^0+/, '');
  return z.length >= 8 ? z : t;
}
// First code of a barcode list field (what a product card / channel upload should carry): "869…;869…" → "869…"
export const firstBarcode = (b) => str(str(b).split(/[,;|/\n]+/)[0]);
export const barcodes = (b) => [...new Set(str(b).split(/[,;|/\n]+/).map(oneBc).filter(Boolean))];
export const normBc = (b) => barcodes(b)[0] || '';
// SKU: case / Turkish chars / separator style ignored, but separator POSITIONS count when both sides have separators
// ("abc_123" = "ABC-123", "044650D010" = "04465-0D010", but "TSH-1-12" != "TSH-11-2")
export const normSku = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const skuShape = (s) => norm(s).trim().replace(/[\s_.\-/]+/g, '-');
export const skuEq = (a, b) => { const x = skuShape(a), y = skuShape(b); return x === y || (normSku(a) === normSku(b) && (!/-/.test(x) || !/-/.test(y))); };
// Weak SKU: short or purely numeric codes ("12", "R01") are often reused by another channel's own numbering
export const weakSku = (s) => { const k = normSku(s); return k.length < 4 || (/^\d+$/.test(k) && k.length < 6); };

// Listing without a variant field: only its quantity can identify a sibling whose variant is just that quantity ("10 Kg")
const variantSig = (variant, name) => { if (!str(variant)) { const q = [...quantities(name)].sort().join(','); return q ? q + '|' : ''; } return [...quantities(variant)].sort().join(',') + '|' + [...vtok(variant)].sort().join(' '); };
const groupKey = (p) => str(p.parent_key) || norm(p.group_name) || norm(p.name);

export const prep = (x) => ({
  t: tokens(x.name), q: quantities(`${x.name || ''} ${x.variant || ''}`), v: tokens(x.variant),
  sku: norm(x.sku).replace(/[^a-z0-9]/g, ''), barcode: normBc(x.barcode),
});

export function score(a, b) {
  let inter = 0;
  for (const w of a.t) if (b.t.has(w)) inter++;
  const union = a.t.size + b.t.size - inter;
  let sc = union ? (inter / union) * 0.85 : 0;
  const why = [];
  if (inter) why.push(`${inter} ortak kelime`);
  if (a.q.size && b.q.size) {
    if (!qtyConflict(a.q, b.q)) { sc += 0.25; why.push('ölçü aynı'); } else { sc *= 0.3; why.push('ölçü farklı'); }
  } else if (qtyConflict(a.q, b.q)) { sc *= 0.5; why.push('paket adedi farklı'); }
  if (a.sku.length >= 4 && b.sku.length >= 4 && (a.sku.includes(b.sku) || b.sku.includes(a.sku))) { sc += 0.3; why.push('stok kodu benzer'); }
  if (a.v.size && b.v.size && ![...a.v].some((w) => b.v.has(w) || b.t.has(w)) && ![...b.v].some((w) => a.t.has(w))) { sc *= 0.5; why.push('varyant farklı'); }
  // Asymmetric extra tokens (numbers/letters that only one side has: "Pro", "5", "C") cap the score below auto-approve
  const onlyA = [...a.t].filter((w) => !b.t.has(w)), onlyB = [...b.t].filter((w) => !a.t.has(w));
  if (onlyA.length && onlyB.length && [...onlyA, ...onlyB].some((w) => /\d/.test(w) || w.length === 1)) { sc = Math.min(sc, 0.6); why.push('model / beden farklı'); }
  if (a.barcode && b.barcode && a.barcode !== b.barcode) { sc *= 0.8; why.push('barkod farklı'); }
  return { score: Math.round(Math.min(1, sc) * 100), why };
}
export const similarity = (a, b) => score(prep(a), prep(b));

export function nameKey(name, variant) {
  const full = [name, variant && !norm(name).includes(norm(variant)) ? variant : ''].filter(Boolean).join(' ');
  const t = [...tokens(full)].sort();
  if (t.length < 2) return '';
  return t.join(' ') + '|' + [...quantities(full)].sort().join(',');
}
function keyText(s) {
  let t = norm(s).replace(new RegExp(QRE.source, 'g'), (x) => ` ${[...quantities(x)][0] || x} `);
  return t.split(/[^a-z0-9.]+/).filter((w) => w && !KSTOP.has(w));
}
export function fullKey(name, variant) {
  const full = [name, variant && !norm(name).includes(norm(variant)) ? variant : ''].filter(Boolean).join(' ');
  const t = keyText(full);
  return t.length >= 2 ? t.join(' ') : '';
}
// Order-independent variant form: "<base name in order>|<sorted variant tokens>" ("Kırmızı / M" = "M / Kırmızı")
export function variantKey(base, variant) {
  if (!str(variant)) return '';
  const v = new Set(keyText(variant)), b = keyText(base).filter((w) => !v.has(w));
  return b.length ? 'v:' + b.join(' ') + '|' + [...v].sort().join(' ') : '';
}

// Is product p contradicted by listing l? (pack size / unit value, variant axis, brand)
export function conflict(l, p, idx) {
  const ql = quantities(`${l.name || ''} ${l.variant_name || ''}`), qp = quantities(`${fullName(p)} ${p.variant_name || ''}`);
  if (qtyConflict(ql, qp)) return 'ölçü';
  if (str(l.variant_name) && str(p.variant_name) && !setEq(vtok(l.variant_name), vtok(p.variant_name))) return 'varyant';
  if (str(l.brand) && str(p.brand)) { const a = normSku(l.brand), b = normSku(p.brand); if (a && b && !a.includes(b) && !b.includes(a)) return 'marka'; }
  // Variant evidence in the listing title (HB / N11 put the variant in the title): words beyond the product's base name must
  // include the product's own variant values ("Kolye 16 Rose" is not "Kolye - 17 / Gümüş")
  if (str(p.variant_name)) {
    const own = vtok(p.variant_name), base = vtok(p.group_name || String(p.name || '').split(' - ')[0]), lt = vtok(`${l.name || ''} ${l.variant_name || ''}`);
    const extra = [...lt].filter((w) => !base.has(w));
    if (extra.length && ![...own].every((w) => lt.has(w))) return 'varyant';
  }
  return '';
}
export const nameSane = (l, p) => { const a = tokens(`${l.name} ${l.variant_name || ''}`), b = tokens(`${fullName(p)} ${p.variant_name || ''}`); return [...a].some((w) => w.length >= 3 && !/^\d+$/.test(w) && [...b].some((x) => x.length >= 3 && (x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4))))); };

export function certain(l, idx, { anyTaken = false } = {}) {
  const no = /^x:\d+$/.test(l.match || '') ? Number(l.match.slice(2)) : 0;
  const free = (list) => (list || []).filter((p) => p.id !== no && (anyTaken || !idx.taken(p.id, l.channel)));
  const ok = (list) => list.filter((p) => !conflict(l, p, idx));
  const bcs = barcodes(l.barcode).filter((b) => b.length >= 6), sku = normSku(l.sku);
  const byBcAll = [...new Set(bcs.flatMap((b) => free(idx.barcode.get(b))))];
  const byBc = ok(byBcAll);
  const bySku = sku ? ok(free(idx.sku.get(sku)).filter((p) => skuEq(p.sku, l.sku) && (!weakSku(l.sku) || nameSane(l, p)))) : [];
  if (byBc.length === 1) {
    if (bySku.length && bySku[0].id !== byBc[0].id) return null;
    return { id: byBc[0].id, how: 'barcode' };
  }
  if (byBcAll.length && !byBc.length) return null; // barcode hit but contradicted: needs a human
  if (byBc.length > 1) {
    // Several products share the barcode (variants): the exact name key decides among them
    const k = fullKey(l.name, l.variant_name), hit = byBc.filter((p) => (idx.name.get(k) || []).includes(p));
    return hit.length === 1 ? { id: hit[0].id, how: 'barcode' } : null;
  }
  if (bySku.length === 1) {
    const p = bySku[0];
    if (bcs.length && barcodes(p.barcode).length && !barcodes(p.barcode).some((b) => bcs.includes(b))) return null;
    return { id: p.id, how: 'sku' };
  }
  if (bySku.length > 1) return null;
  for (const key of [fullKey(l.name, l.variant_name), variantKey(l.name, l.variant_name)]) {
    const byName = key ? ok(free(idx.name.get(key))) : [];
    if (byName.length === 1) {
      const p = byName[0];
      if (bcs.length && barcodes(p.barcode).length && !barcodes(p.barcode).some((b) => bcs.includes(b))) return null;
      if (sku && p.sku && !skuEq(p.sku, l.sku)) return null;
      return { id: p.id, how: 'name' };
    }
    if (byName.length > 1) return null;
  }
  const gks = l.remote_product_id ? idx.rgroup.get(`${l.channel}|${l.remote_product_id}`) : null;
  if (gks && gks.size === 1) {
    const sig = variantSig(l.variant_name, l.name);
    if (!sig) return null;
    const sib = ok(free(idx.group.get([...gks][0])).filter((p) => variantSig(p.variant_name) === sig));
    if (sib.length === 1) {
      const p = sib[0];
      if (bcs.length && barcodes(p.barcode).length && !barcodes(p.barcode).some((b) => bcs.includes(b))) return null;
      if (sku && p.sku && !skuEq(p.sku, l.sku)) return null;
      return { id: p.id, how: 'group' };
    }
  }
  return null;
}

// Öneri ekranları için dizin önbelleği (çalışan örnek başına): ürün ve bağlı ilanlar değişmediyse dizin yeniden kurulmaz.
// İmza: ürün sayısı + son ürün güncellemesi + bağlı ilan sayısı ve kimlik toplamı (bağlama / ayırma her seferinde değiştirir).
const cache = new WeakMap(), CACHE_MS = 10 * 60e3;
const SIG_SQL = `SELECT (SELECT COUNT(*) FROM products) AS a, (SELECT MAX(updated_at) FROM products) AS b,
    (SELECT COUNT(*) FROM listings WHERE product_id IS NOT NULL) AS c, (SELECT TOTAL(product_id) FROM listings WHERE product_id IS NOT NULL) AS d`;
export async function readIndex(db) {
  const r = await all(db, SIG_SQL);
  const sig = JSON.stringify(r[0]), hit = cache.get(db);
  if (hit && hit.sig === sig && Date.now() - hit.at < CACHE_MS) return hit.idx;
  const idx = await productIndex(db, { names: false });
  cache.set(db, { sig, idx, at: Date.now() });
  return idx;
}

// names: ad anahtarı dizini (kesin eşleşme için; certain). Yalnız öneri puanı (candidates) gereken ekranlar atlar: 20.000 ürün ve
// 60.000 bağlı ilanda tam ad anahtarı hesaplamak dizin süresinin çoğudur.
export async function productIndex(db, { names = true } = {}) {
  const [prods, used] = await Promise.all([
    all(db, 'SELECT id, sku, barcode, name, variant_name, group_name, parent_key, brand, image, stock FROM products'),
    all(db, `SELECT product_id, channel, remote_product_id, barcode${names ? ', name, variant_name' : ''} FROM listings WHERE product_id IS NOT NULL`),
  ]);
  const sku = new Map(), barcode = new Map(), name = new Map(), chans = new Map(), group = new Map(), rgroup = new Map();
  const add = (m, k, p) => m.set(k, [...(m.get(k) || []), p]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  const idx = {
    prods, sku, barcode, name, chans, group, rgroup,
    taken: (id, ch) => !!(chans.get(id) && chans.get(id).has(ch)),
    // Bağlanan ilan: ürün o kanalda dolu sayılır; ilanın kanaldaki ana ürünü → panel ürün grubu ilişkisi öğrenilir
    use: (id, ch, rpid) => {
      if (!chans.has(id)) chans.set(id, new Set());
      chans.get(id).add(ch);
      const p = byId.get(id);
      if (p && rpid) { const k = `${ch}|${rpid}`; if (!rgroup.has(k)) rgroup.set(k, new Set()); rgroup.get(k).add(groupKey(p)); }
    },
    add: (p) => {
      byId.set(p.id, p);
      if (idx.tok) for (const w of prepOf(p).t) (idx.tok.get(w) || idx.tok.set(w, []).get(w)).push(p);
      const sk = normSku(p.sku);
      if (sk) add(sku, sk, p);
      for (const bc of barcodes(p.barcode)) add(barcode, bc, p);
      if (names) for (const k of [fullKey(p.name, p.variant_name), variantKey(p.group_name || p.name, p.variant_name)]) if (k && !(name.get(k) || []).includes(p)) add(name, k, p);
      const g = groupKey(p);
      if (g) add(group, g, p);
    },
  };
  for (const p of prods) idx.add(p);
  for (const u of used) idx.use(u.product_id, u.channel, u.remote_product_id);
  // Barkod listesi taşıyan bağlı ilan (ikas varyantının tüm barkodları "a;b"): listedeki her kod ürünü gösterir
  for (const u of used) {
    if (!/[,;|]/.test(u.barcode || '')) continue;
    const p = byId.get(u.product_id);
    if (p) for (const bc of barcodes(u.barcode)) if (!(barcode.get(bc) || []).includes(p)) add(barcode, bc, p);
  }
  // Ürünün bağlı ilanlarının adları da ad anahtarına eklenir (aynı ürün farklı sitede farklı adla olabilir)
  if (names) for (const u of used) {
    const p = byId.get(u.product_id), k = fullKey(u.name, u.variant_name);
    if (p && k && !(name.get(k) || []).includes(p)) add(name, k, p);
  }
  return idx;
}

// Aynı ürünün aynı kanaldaki ikinci ilanı: barkod / stok kodu / tam ad kesin eşleşiyor ama ürünün bu kanalda zaten ilanı var.
// Yeni ürün açılmaz; ilan "dup:<ürün>" olarak işaretlenir ve kullanıcıya sorulur (Kanal Ürünleri → Tekrar olabilir).
// Kullanıcı "farklı ürün" dediyse (dup_no) bir daha sorulmaz.
export function twinOf(l, idx) {
  if (l.match === 'dup_no') return null;
  const c = certain(l, idx, { anyTaken: true });
  if (!c || !idx.taken(c.id, l.channel) || !['barcode', 'sku', 'name'].includes(c.how)) return null;
  // Yalnız stok kodu tutuyorsa adlar da benzemeli (aynı kodu yanlışlıkla taşıyan farklı ürünler sorulmasın)
  if (c.how === 'sku') {
    const p = idx.prods.find((x) => x.id === c.id);
    if (!p || score(prep({ name: l.name, variant: l.variant_name }), prep({ name: fullName(p), variant: p.variant_name })).score < 70) return null;
  }
  return c.id;
}
export const markTwin = (db, pid, l) => db.prepare("UPDATE listings SET match = ? WHERE channel = ? AND remote_id = ? AND product_id IS NULL").bind('dup:' + pid, l.channel, l.remote_id);

// Ana katalog: ayarda seçilen ve ilanı olan kanallar; hiçbiri yoksa öncelik sırasındaki ilk bağlı kanal
const PRIORITY = ['ikas1', 'ikas2', 'shopify', 'woocommerce', 'opencart', 'ticimax', 'ideasoft', 'tsoft', 'hepsiburada', 'trendyol', 'n11', 'idefix', 'pazarama', 'pttavm', 'amazon', 'ciceksepeti', 'koctas', 'etsy', 'teknosa', 'boyner', 'pasaj', 'trendyolgo', 'getir', 'yemeksepeti', 'ebay', 'ozon'];
async function catalogChannels(db, wanted) {
  const have = new Set((await all(db, 'SELECT DISTINCT channel FROM listings')).map((r) => r.channel));
  const list = (wanted || []).filter((c) => have.has(c));
  if (list.length) return list;
  const first = PRIORITY.find((c) => have.has(c)) || [...have][0];
  return first ? [first] : [];
}

const link = (db, id, how, l) => db.prepare('UPDATE listings SET product_id = ?, match = ?, ignored = 0, extra_link = 0, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ? AND product_id IS NULL').bind(id, how, l.channel, l.remote_id);

// Aynı kanaldan birden fazla ilanı aynı ürüne bağlanmış (eski sürümden kalma) eşleşmeleri onarır: ürüne en uygun
// ilan (barkod > stok kodu > ad benzerliği) kalır, diğerleri ayrılıp yeniden eşleştirmeye döner.
// Kullanıcının onayladığı ikinci ilan bağları (extra_link = 1, bkz. second.js) hiç sayılmaz ve ayrılmaz.
const KEEP = "COALESCE(match, '') != 'dup_ok' AND COALESCE(extra_link, 0) = 0";
export async function repairDuplicates(db) {
  const dups = await all(db, `SELECT product_id, channel FROM listings WHERE product_id IS NOT NULL AND ${KEEP} GROUP BY product_id, channel HAVING COUNT(*) > 1`);
  let freed = 0;
  for (const d of dups) {
    const p = await all(db, 'SELECT id, sku, barcode, name, variant_name, group_name, brand FROM products WHERE id = ?', d.product_id);
    const ls = await all(db, `SELECT remote_id, sku, barcode, name, variant_name, brand, match FROM listings WHERE product_id = ? AND channel = ? AND ${KEEP}`, d.product_id, d.channel);
    if (!p[0] || ls.length < 2) continue;
    const pp = prep({ name: fullName(p[0]), variant: p[0].variant_name, sku: p[0].sku, barcode: p[0].barcode });
    const pbc = barcodes(p[0].barcode);
    const rank = (l) => (barcodes(l.barcode).some((b) => pbc.includes(b)) ? 1000 : 0) + (normSku(l.sku) && skuEq(l.sku, p[0].sku) ? 500 : 0) + (l.match === 'manual' ? 50 : 0)
      - (conflict(l, p[0]) ? 300 : 0) + score(prep({ name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode }), pp).score;
    const keep = ls.slice().sort((a, b) => rank(b) - rank(a))[0];
    for (const l of ls) {
      if (l === keep) continue;
      await run(db, 'UPDATE listings SET product_id = NULL, match = NULL WHERE channel = ? AND remote_id = ?', d.channel, l.remote_id);
      freed++;
    }
  }
  if (freed) {
    const stale = "product_id IS NOT NULL AND remote_key != '' AND NOT EXISTS (SELECT 1 FROM listings l JOIN orders o ON o.id = order_items.order_id WHERE l.channel = o.channel AND l.remote_id = order_items.remote_key AND l.product_id = order_items.product_id)";
    // Bağı kalkan satırların düşülmüş stoğu geri eklensin (applyStock)
    await run(db, `UPDATE orders SET stock_dirty = 1 WHERE id IN (SELECT order_id FROM order_items WHERE ${stale})`);
    await run(db, `UPDATE order_items SET product_id = NULL WHERE ${stale}`);
  }
  return freed;
}

// Eşleşmemiş ilanları kesin olanlarla bağla; ana katalog kanalındaki karşılıksız her varyant için panel ürünü aç
// Kanal ürünlerini panele alma biçimi (Kanal Ürünleri sayfası): { kanal: true } = "ben seçeyim" (otomatik ürün açılmaz),
// "*" tüm kanalların varsayılanı. Elle seçilen kanalda ilanlar yine kesin eşleşmeyle var olan ürünlere bağlanır.
export async function manualImport(db) {
  const r = (await all(db, "SELECT v FROM settings WHERE k = 'manual_import'"))[0];
  let m = {};
  try { m = (r && JSON.parse(r.v)) || {}; } catch { /* bozuk */ }
  return (ch) => (ch in m ? !!m[ch] : !!m['*']);
}
// Ürünün eksik görsel / grup / varyant bilgisini bağlı ilandan tamamla
const fillFromListings = (db) => run(db, `UPDATE products SET
      image = COALESCE(NULLIF(image, ''), (SELECT l.image FROM listings l WHERE l.product_id = products.id AND l.image != '' ORDER BY l.channel LIMIT 1), ''),
      group_name = COALESCE(NULLIF(group_name, ''), (SELECT l.group_name FROM listings l WHERE l.product_id = products.id AND l.group_name IS NOT NULL AND l.group_name != '' ORDER BY l.channel LIMIT 1)),
      variant_name = COALESCE(NULLIF(variant_name, ''), (SELECT l.variant_name FROM listings l WHERE l.product_id = products.id AND l.variant_name IS NOT NULL AND l.variant_name != '' ORDER BY l.channel LIMIT 1))
    WHERE image IS NULL OR image = '' OR group_name IS NULL OR group_name = '' OR variant_name IS NULL OR variant_name = ''`);
const UNLINKED = "SELECT channel, remote_id, remote_product_id, sku, barcode, name, group_name, variant_name, brand, image, price, remote_stock, match FROM listings WHERE product_id IS NULL AND (ignored = 0 OR match = 'zero') ORDER BY channel, remote_id";
async function matchSig(db, cats, unlinked) {
  const r = (await all(db, SIG_SQL))[0];
  let h = 0;
  for (const l of unlinked) {
    const s = `${l.channel}|${l.remote_id}|${l.remote_product_id || ''}|${l.match || ''}|${l.remote_stock == null ? '' : l.remote_stock > 0 ? 1 : 0}|${l.sku || ''}|${l.barcode || ''}|${l.name || ''}|${l.variant_name || ''}`;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return JSON.stringify([r, cats, unlinked.length, h]);
}
// noCreate: yalnız kesin eşleşmeler bağlanır; ana katalogdan yeni ürün açılmaz (autoLink)
export async function autoMatch(db, { catalog = ['ikas1'], noCreate = false } = {}) {
  const isManual = await manualImport(db);
  const cats = noCreate ? [] : (await catalogChannels(db, catalog)).filter((c) => !isManual(c));
  // Stoğu sıfır olduğu için otomatik yok sayılan ilan, stoğu gelince yeniden eşleştirmeye döner
  await run(db, "UPDATE listings SET ignored = 0, match = NULL WHERE ignored = 1 AND match = 'zero' AND COALESCE(remote_stock, 0) > 0");
  // Stoğu 0 olan eşleşmemiş ilanlar (ana katalog dahil) için ürün açılmaz, öneri / onay listesine düşmez. Ancak barkod / SKU ile
  // kesin eşleşen bir ürün varsa bağlanır: depoya mal gelince panel o ilanın stoğunu da açar (tükenmiş ilan kapalı kalmaz).
  // (Kullanıcının kaldırdığı eşleşmenin hatırası "x:<ürün>" silinmez; yoksa ilan aynı ürüne yeniden bağlanırdı.)
  await run(db, "UPDATE listings SET ignored = 1, match = 'zero' WHERE product_id IS NULL AND ignored = 0 AND remote_stock IS NOT NULL AND remote_stock <= 0 AND COALESCE(match, '') NOT LIKE 'x:%'");
  const unlinked = await all(db, UNLINKED);
  // Son çalışmadan beri ürünler, bağlı ilanlar ve eşleşmemiş ilanlar değişmediyse sonuç da değişmez: ürün dizini (büyük katalogda
  // saniyeye yakın işlemci) kurulmaz. Müşteri paneli tek iş parçacığında çalıştığından arka plandaki bu iş o anki istekleri bekletiyordu.
  const before = await matchSig(db, cats, unlinked);
  if (!unlinked.length || before === (await getRaw(db, 'match_sig'))) {
    if (!unlinked.length) await setSetting(db, 'match_sig', before);
    await fillFromListings(db);
    return { linked: 0, created: 0 };
  }
  const idx = await productIndex(db);
  // Ana katalog önce işlenir (sırasıyla), sonra diğer kanallar
  const rank = (c) => (cats.includes(c) ? cats.indexOf(c) : 99);
  unlinked.sort((a, b) => rank(a.channel) - rank(b.channel));
  const st = [], rest = [];
  let linked = 0, created = 0, twins = 0;
  for (const l of unlinked) {
    const zero = l.match === 'zero' || (l.remote_stock != null && l.remote_stock <= 0);
    const c = certain(l, idx);
    // Stoksuz ilan yalnız barkod / SKU ile bağlanır (ada göre bağlanmaz, ürün açmaz, öneriye düşmez)
    if (c && (!zero || c.how === 'barcode' || c.how === 'sku')) { st.push(link(db, c.id, c.how, l)); idx.use(c.id, l.channel, l.remote_product_id); linked++; continue; }
    if (zero) continue;
    // Ana katalog: ilk katalog kanalının her varyantı ürün olur. Diğer katalog kanalları (ör. ikinci site) yalnızca
    // hiçbir ürüne benzemiyorsa yeni ürün açar; benziyorsa elle onaya düşer (yanlış birleştirme / mükerrer ürün olmasın).
    const isCat = cats.includes(l.channel);
    if (!isCat) { rest.push(l); continue; }
    if (cats.indexOf(l.channel) > 0 && bestScore(l, idx) >= 40) continue;
    const tw = twinOf(l, idx);
    if (tw) { if (l.match !== 'dup:' + tw) { st.push(markTwin(db, tw, l)); twins++; } continue; }
    if (st.length) { for (const part of chunk(st.splice(0), 90)) await db.batch(part); }
    const skuFree = str(l.sku) && !idx.sku.has(normSku(l.sku));
    const t = Date.now();
    const r = await db.prepare(`INSERT INTO products (sku, barcode, name, group_name, variant_name, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(skuFree ? str(l.sku) : null, firstBarcode(l.barcode) || null, l.name || l.sku || l.barcode || l.remote_id, l.group_name || null, l.variant_name || null, l.image || '', l.price || 0, Math.max(0, l.remote_stock || 0), t, t).first();
    const p = { id: r.id, sku: skuFree ? str(l.sku) : null, barcode: str(l.barcode) || null, name: l.name, variant_name: l.variant_name, group_name: l.group_name, image: l.image, stock: Math.max(0, l.remote_stock || 0) };
    idx.prods.push(p); idx.add(p); idx.use(p.id, l.channel, l.remote_product_id);
    st.push(link(db, p.id, 'new', l));
    created++;
  }
  // İkinci geçiş: ilk geçişte bağlanan varyantlardan öğrenilen ürün grupları ile kardeş varyantlar (sıradan bağımsız)
  for (let pass = 0; pass < 2 && rest.length; pass++) {
    const left = rest.splice(0);
    for (const l of left) {
      const c = certain(l, idx);
      if (c) { st.push(link(db, c.id, c.how, l)); idx.use(c.id, l.channel, l.remote_product_id); linked++; } else rest.push(l);
    }
    if (rest.length === left.length) break;
  }
  // Diğer kanallarda da: eşleşmeyen ilan, bu kanalda zaten ilanı olan bir ürünün kesin karşılığıysa "tekrar olabilir" diye sorulur
  for (const l of rest) { const tw = twinOf(l, idx); if (tw && l.match !== 'dup:' + tw) { st.push(markTwin(db, tw, l)); twins++; } }
  for (const part of chunk(st, 90)) await db.batch(part);
  await fillFromListings(db);
  if (linked || created) await relinkItems(db);
  await setSetting(db, 'match_sig', await matchSig(db, cats, await all(db, UNLINKED)));
  if (twins) await notify(db, 'dup_listings', { level: 'warn', title: 'Aynı ürünün ikinci ilanı olabilir', msg: `${twins} ilan panelde olan bir ürünün aynı kanaldaki ikinci ilanı gibi görünüyor; yeni ürün açılmadı. Kanal Ürünleri → Tekrar olabilir'den onaylayın.` }).catch(() => {});
  return { linked, created, ...(twins ? { twins } : {}) };
}

export const fullName = (p) => [p.name, p.variant_name && !String(p.name).includes(p.variant_name) ? p.variant_name : ''].filter(Boolean).join(' ');
// Verilen ilanlar için en iyi aday ürün (Kanal Ürünleri listesinde "önerilen eşleşme"); en az 40 puan
export async function bestCandidates(db, listings) {
  if (!listings.length) return new Map();
  const idx = await readIndex(db), out = new Map();
  for (const l of listings) {
    const c = candidates(l, idx, 1)[0];
    if (c && c.s.score >= 40) out.set(l.remote_id, { product_id: c.p.id, name: fullName(c.p), sku: c.p.sku, barcode: c.p.barcode, image: c.p.image, score: c.s.score, why: c.s.why });
  }
  return out;
}
// Aday havuzu: ilanla en az bir ortak kelimesi olan ürünler (kelime dizini; nadir kelimeden başlanır), aynı stok kodlu ve aynı ürün
// grubundaki ürünler. Ortak kelimesi olmayan ürünün puanı en çok stok kodu benzerliğidir; o da stok kodu dizininden gelir.
// Böylece her ilan binlerce ürünün hepsiyle karşılaştırılmaz (20.000 üründe öneri listesi 2 sn → 0,1 sn).
const prepOf = (p) => p._prep || (p._prep = prep({ name: fullName(p), variant: p.variant_name, sku: p.sku, barcode: p.barcode }));
const POOL = 4000;
function tokenIndex(idx) {
  if (idx.tok) return idx.tok;
  idx.tok = new Map();
  for (const p of idx.prods) for (const w of prepOf(p).t) (idx.tok.get(w) || idx.tok.set(w, []).get(w)).push(p);
  return idx.tok;
}
function pool(l, a, idx, gks) {
  const tok = tokenIndex(idx), set = new Set();
  const lists = [...a.t].map((w) => tok.get(w) || []).filter((x) => x.length).sort((x, y) => x.length - y.length);
  for (const list of lists) { for (const p of list) set.add(p); if (set.size >= POOL) break; }
  for (const p of (a.sku && idx.sku.get(a.sku)) || []) set.add(p);
  if (gks) for (const g of gks) for (const p of idx.group.get(g) || []) set.add(p);
  return set;
}
function candidates(l, idx, n = 3) {
  const a = prep({ name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode });
  const gks = l.remote_product_id ? idx.rgroup.get(`${l.channel}|${l.remote_product_id}`) : null;
  const out = [];
  for (const p of pool(l, a, idx, gks)) {
    if (idx.taken(p.id, l.channel)) continue;
    let s = score(a, prepOf(p));
    if (gks && gks.has(groupKey(p))) s = { score: Math.min(100, s.score + 20), why: [...s.why, 'aynı ürün grubu'] };
    if (s.score >= 25) out.push({ p, s });
  }
  return out.sort((x, y) => y.s.score - x.s.score).slice(0, n);
}
const bestScore = (l, idx) => (candidates(l, idx, 1)[0] || { s: { score: 0 } }).s.score;

// Eşleşme önerileri (emin olunamayan ilanlar). Aday ürün, ilanın kanalından ilan almamış ürünlerdir.
export async function suggestions(db, { channel, q, limit = 100 } = {}) {
  const where = ['product_id IS NULL', 'ignored = 0'], args = [];
  if (channel) { where.push('channel = ?'); args.push(channel); }
  if (q) { where.push('(name LIKE ? OR sku LIKE ? OR barcode LIKE ?)'); const s = '%' + q + '%'; args.push(s, s, s); }
  const rows = await all(db, `SELECT channel, remote_id, remote_product_id, sku, barcode, name, variant_name, brand, image, price, remote_stock FROM listings WHERE ${where.join(' AND ')} ORDER BY channel, name LIMIT ?`, ...args, limit);
  if (!rows.length) return [];
  const idx = await readIndex(db);
  const out = rows.map((l) => ({ ...l, cands: candidates(l, idx) }));
  // Adayların bağlı ilanları: yalnız aday ürünler için (tüm bağlı ilanlar okunmaz)
  const ids = [...new Set(out.flatMap((l) => l.cands.map((c) => c.p.id)))], on = new Map();
  for (const part of chunk(ids, 90)) {
    for (const x of await all(db, `SELECT product_id, channel, name FROM listings WHERE product_id IN (${part.map(() => '?').join(',')})`, ...part)) {
      (on.get(x.product_id) || on.set(x.product_id, []).get(x.product_id)).push({ channel: x.channel, name: x.name });
    }
  }
  return out.map(({ cands, ...l }) => ({
    ...l,
    candidates: cands.map(({ p, s }) => ({
      product_id: p.id, name: fullName(p), sku: p.sku, barcode: p.barcode, image: p.image, stock: p.stock, score: s.score, why: s.why, channels: on.get(p.id) || [],
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
// Bağlanan satırların siparişleri "stok düşümü bekliyor" işaretlenir: satış, bir sonraki senkronu beklemeden (applyDirtyStock) stoktan düşer.
const LISTING_OF = `SELECT l.product_id FROM listings l JOIN orders o ON o.id = order_items.order_id
      WHERE l.channel = o.channel AND l.remote_id = order_items.remote_key AND l.product_id IS NOT NULL`;
export async function relinkItems(db) {
  // 1) via the line's listing (exact); 2) sku / barcode with the same normalisation and conflict rules as listings
  await run(db, `UPDATE orders SET stock_dirty = 1 WHERE stock_dirty = 0 AND id IN (SELECT order_id FROM order_items WHERE product_id IS NULL AND remote_key != '' AND EXISTS (${LISTING_OF}))`);
  await run(db, `UPDATE order_items SET product_id = (
      SELECT l.product_id FROM listings l JOIN orders o ON o.id = order_items.order_id
      WHERE l.channel = o.channel AND l.remote_id = order_items.remote_key AND l.product_id IS NOT NULL)
    WHERE product_id IS NULL AND remote_key != ''`);
  const items = await all(db, `SELECT i.order_id, i.line_id, i.sku, i.barcode, i.remote_key, o.channel FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE i.product_id IS NULL AND (i.sku != '' OR i.barcode != '')`);
  if (!items.length) return;
  const maps = await itemResolver(db), st = [];
  for (const it of items) {
    const id = maps.resolve(it.channel, { sku: it.sku, barcode: it.barcode, remoteKey: it.remote_key });
    if (id) st.push(db.prepare('UPDATE order_items SET product_id = ? WHERE order_id = ? AND line_id = ? AND product_id IS NULL').bind(id, it.order_id, it.line_id),
      db.prepare('UPDATE orders SET stock_dirty = 1 WHERE id = ?').bind(it.order_id));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
}
// Order line -> product (shared by sync.saveOrders and relinkItems): listing first; then barcode and SKU, which must agree;
// an ambiguous barcode (two products) or a listing the user explicitly unlinked (x:<id>) never resolves by code.
export async function itemResolver(db) {
  const [prods, lst] = await Promise.all([
    all(db, 'SELECT id, sku, barcode FROM products'),
    all(db, "SELECT channel, remote_id, product_id, match FROM listings WHERE product_id IS NOT NULL OR match LIKE 'x:%'"),
  ]);
  const sku = new Map(), bc = new Map(), listing = new Map();
  const add = (m, k, id) => m.set(k, m.has(k) && m.get(k) !== id ? -1 : id);
  const skuOf = new Map(prods.map((p) => [p.id, p.sku]));
  for (const p of prods) { if (normSku(p.sku)) add(sku, normSku(p.sku), p.id); for (const b of barcodes(p.barcode)) add(bc, b, p.id); }
  for (const l of lst) listing.set(l.channel + '\u0000' + l.remote_id, l.product_id || ('x' + l.match.slice(2)));
  return {
    resolve(ch, it) {
      const L = it.remoteKey ? listing.get(ch + '\u0000' + it.remoteKey) : undefined;
      if (typeof L === 'number') return L;
      const no = typeof L === 'string' ? Number(L.slice(1)) : 0;
      const b = barcodes(it.barcode).map((x) => bc.get(x)).find((x) => x !== undefined);
      let s = normSku(it.sku) ? sku.get(normSku(it.sku)) : undefined;
      if (s > 0 && !skuEq(skuOf.get(s), it.sku)) s = undefined; // "TSH-1-12" ≠ "TSH-11-2"
      if (b === -1 || s === -1) return null;
      if (b && s && b !== s) { if (weakSku(it.sku)) s = undefined; else return null; } // kısa / sayısal stok kodu barkoda karşı oy kullanmaz
      const id = b || s || null;
      return id && id !== no ? id : null;
    },
  };
}

// Yüksek puanlı önerileri toplu onayla: en iyi aday en az `min` puan ve ikinci adaydan en az `gap` puan öndeyse bağlanır.
// Aynı ürüne aynı kanaldan ikinci ilan bağlanmaz. Eşleşme yöntemi "approved" (toplu onay) olarak kaydedilir.
export async function approveConfident(db, { channel, min = 85, gap = 15 } = {}) {
  const rows = await suggestions(db, { channel, limit: 500 });
  const byId = new Map((await readIndex(db)).prods.map((p) => [p.id, p]));
  const taken = new Set();
  const st = [];
  for (const l of rows) {
    const [a, b] = l.candidates;
    if (!a || a.score < min || (b && a.score - b.score < gap)) continue;
    // Ölçü / paket / varyant / marka çelişkisi olan öneri toplu onayla bağlanmaz (kullanıcı tek tek bakar)
    const p = byId.get(a.product_id);
    if (p && conflict(l, p)) continue;
    const k = `${a.product_id}|${l.channel}`;
    if (taken.has(k)) continue;
    taken.add(k);
    st.push(db.prepare("UPDATE listings SET product_id = ?, match = 'approved', extra_link = 0, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ? AND product_id IS NULL").bind(a.product_id, l.channel, l.remote_id));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  if (st.length) await relinkItems(db);
  return { linked: st.length };
}
