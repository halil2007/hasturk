// Pazaryeri kategori komisyon listeleri: public/assets/komisyon-<pazaryeri>.json
// Kural: bu dosyalar YALNIZ pazaryerinin kendi yayımladığı resmî listeden (satıcı merkezi / akademi sayfası, PDF, Excel) üretilir;
// tahmini ya da üçüncü taraf sitelerden derlenmiş oran girilmez. Dosya yoksa hesaplayıcı elle oran girişiyle çalışır,
// kategori seçici ve /araclar/<pazaryeri>-komisyon-oranlari tablo sayfası üretilmez.
// Dosya üretmek için: node scripts/komisyon-ice-aktar.mjs (resmî listeyi CSV olarak kaydedip verin; kaynak adresi ve liste tarihi zorunlu).
//
// Biçim (sürüm 1):
// { "v": 1, "mp": "trendyol", "source": "https://…", "sourceTitle": "…", "published": "YYYY-MM-DD", "retrieved": "YYYY-MM-DD",
//   "basis": "kdv-haric" | "kdv-dahil", "note": "…", "cats": [["Ana kategori > Alt kategori > …", 18.5], …] }
// basis: listedeki oranın KDV hariç mi dahil mi olduğu. KDV hariç ise kesilen komisyon = oran × 1,20 (komisyon faturasına %20 KDV eklenir).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MARKETPLACES = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', n11: 'N11', pazarama: 'Pazarama', pttavm: 'PttAVM', idefix: 'idefix', ciceksepeti: 'Çiçeksepeti' };
// İlgi eki: "Trendyol'un", "Hepsiburada'nın"
export const GEN = { trendyol: "'un", hepsiburada: "'nın", n11: "'in", pazarama: "'nın", pttavm: "'nin", idefix: "'in", ciceksepeti: "'nin" };
export const SEP = ' > ';
export const file = (mp) => `komisyon-${mp}.json`;

// Türkçe arama için sadeleştirme (tools.js'teki fold() ile aynı)
export const fold = (s) => String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c]).replace(/\s+/g, ' ').trim();
// Bağlantı / çapa adı: "Ev & Mobilya" → "ev-mobilya"
export const slugify = (s) => fold(s).replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function validate(d, mp) {
  const bad = (m) => { throw new Error(`${file(mp)}: ${m}`); };
  if (!d || d.v !== 1) bad('"v": 1 olmalı');
  if (d.mp !== mp) bad(`"mp" "${mp}" olmalı`);
  if (!/^https:\/\/\S+$/.test(d.source || '')) bad('"source" resmî listenin https adresi olmalı');
  for (const k of ['published', 'retrieved']) if (!/^\d{4}-\d{2}-\d{2}$/.test(d[k] || '')) bad(`"${k}" YYYY-AA-GG olmalı`);
  if (!['kdv-haric', 'kdv-dahil'].includes(d.basis)) bad('"basis" kdv-haric ya da kdv-dahil olmalı');
  if (!Array.isArray(d.cats) || !d.cats.length) bad('"cats" boş');
  const seen = new Set();
  for (const c of d.cats) {
    if (!Array.isArray(c) || typeof c[0] !== 'string' || !c[0].trim() || typeof c[1] !== 'number' || !(c[1] >= 0 && c[1] <= 100)) bad(`hatalı satır ${JSON.stringify(c)}`);
    if (seen.has(c[0])) bad(`aynı kategori iki kez: ${c[0]}`);
    seen.add(c[0]);
  }
  return d;
}

// Dosya varsa doğrulanmış veriyi, yoksa null döner
export function loadCommission(assetsDir, mp) {
  const p = join(assetsDir, file(mp));
  if (!existsSync(p)) return null;
  return validate(JSON.parse(readFileSync(p, 'utf8')), mp);
}

// Listeyi ana kategorilere göre gruplar: [{ top, id, rows: [[altYol, oran]], min, max }]
export function groupByTop(d) {
  const m = new Map();
  for (const [path, rate] of d.cats) {
    const parts = path.split(SEP), top = parts[0];
    if (!m.has(top)) m.set(top, []);
    m.get(top).push([parts.slice(1).join(SEP) || top, rate, path]);
  }
  return [...m].sort(([a], [b]) => a.localeCompare(b, 'tr')).map(([top, rows]) => ({
    top, id: slugify(top), rows: rows.sort((a, b) => a[0].localeCompare(b[0], 'tr')),
    min: Math.min(...rows.map((r) => r[1])), max: Math.max(...rows.map((r) => r[1])),
  }));
}

// KDV dahil kesilen oran (komisyon faturasına %20 KDV eklenir)
export const charged = (rate, basis) => (basis === 'kdv-haric' ? rate * 1.2 : rate);
export const trDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
