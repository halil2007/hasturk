// Barkod oluşturma: barkodu olmayan ürünlere benzersiz, geçerli EAN-13 barkod verilir (son hane kontrol hanesi).
// Varsayılan ön ek 200: GS1'in mağaza içi kullanıma ayırdığı 200–299 aralığı; gerçek bir firmanın barkoduyla çakışmaz.
// Kendi GS1 firma önekiniz varsa (ör. 8691234) ön ek olarak girilir. Benzersizlik panel ürünleri ve tüm kanal ilanlarına karşı denetlenir.
import { all, first, getRaw, setSetting, log } from './db.js';
import { chunk, str, fail } from './util.js';

export const DEFAULT_PREFIX = '200';
export const ean13Check = (d12) => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
  return String((10 - (s % 10)) % 10);
};
export const validEan13 = (c) => /^\d{13}$/.test(c) && ean13Check(c.slice(0, 12)) === c[12];
// Ön ek: 1–9 rakam (en az 3 rastgele hane kalsın)
export function cleanPrefix(p) {
  const x = str(p).replace(/\s+/g, '');
  if (!x) return DEFAULT_PREFIX;
  if (!/^\d{1,9}$/.test(x)) fail(400, 'Barkod ön eki 1–9 rakamdan oluşmalı (ör. 200 ya da GS1 firma önekiniz)');
  return x;
}
function digits(n) {
  const a = new Uint8Array(n * 2);
  crypto.getRandomValues(a);
  let s = '';
  for (const b of a) { if (b < 250) s += b % 10; if (s.length === n) break; } // 250+ atılır: her rakam eşit olasılıklı
  return s.length === n ? s : s + digits(n - s.length);
}

async function usedCodes(db) {
  const rows = await all(db, `SELECT barcode AS b FROM products WHERE COALESCE(barcode, '') != '' UNION SELECT barcode FROM listings WHERE COALESCE(barcode, '') != ''`);
  return new Set(rows.map((r) => String(r.b).trim()));
}
function make(prefix, used) {
  const free = 12 - prefix.length;
  for (let i = 0; i < 200; i++) {
    const d12 = prefix + digits(free);
    const code = d12 + ean13Check(d12);
    if (!used.has(code)) { used.add(code); return code; }
  }
  fail(400, 'Bu ön ekle boşta barkod bulunamadı; daha kısa bir ön ek girin');
}

export async function barcodePrefix(db) { return (await getRaw(db, 'barcode_prefix')) || DEFAULT_PREFIX; }

// Tek barkod önerisi (ürün formundaki "Oluştur" düğmesi); kaydedilmez
export async function suggestBarcode(db, prefix) {
  return { barcode: make(cleanPrefix(prefix ?? await barcodePrefix(db)), await usedCodes(db)) };
}

// Seçilen ürünlere barkod ver. Barkodu dolu ürün atlanır (kanallardaki ilan barkodu değişmeyeceği için mevcut barkod korunur).
export async function assignBarcodes(db, ids, { prefix, user = 'Panel' } = {}) {
  const pre = cleanPrefix(prefix ?? await barcodePrefix(db));
  ids = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((x) => x > 0))].slice(0, 5000);
  if (!ids.length) fail(400, 'Ürün seçilmedi');
  const prods = [];
  for (const part of chunk(ids, 400)) prods.push(...await all(db, `SELECT id, name, variant_name, barcode FROM products WHERE id IN (${part.map(() => '?').join(',')})`, ...part));
  const used = await usedCodes(db), t = Date.now(), st = [], assigned = [];
  let skipped = 0;
  for (const p of prods) {
    if (str(p.barcode)) { skipped++; continue; }
    const code = make(pre, used);
    st.push(db.prepare("UPDATE products SET barcode = ?, updated_at = ? WHERE id = ? AND COALESCE(TRIM(barcode), '') = ''").bind(code, t, p.id));
    assigned.push({ id: p.id, name: [p.name, p.variant_name].filter(Boolean).join(' '), barcode: code });
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  await setSetting(db, 'barcode_prefix', pre);
  if (assigned.length) await log(db, null, 'info', `${user}: ${assigned.length} ürüne barkod oluşturuldu (ön ek ${pre})`);
  return { assigned, skipped, missing: ids.length - prods.length, prefix: pre };
}

// Barkodu eksik ürün sayısı (araç çubuğu rozeti)
export async function missingBarcodes(db) {
  return (await first(db, "SELECT COUNT(*) AS n FROM products WHERE active = 1 AND COALESCE(TRIM(barcode), '') = ''")).n;
}
