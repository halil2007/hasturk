// Pazaryerinin resmî kategori komisyon listesini site verisine çevirir → public/assets/komisyon-<pazaryeri>.json
// Kullanım (site klasöründe):
//   node scripts/komisyon-ice-aktar.mjs <pazaryeri> <liste.csv> --kaynak <https://resmî-liste-adresi> --tarih <YYYY-AA-GG> [--baz kdv-haric|kdv-dahil] [--baslik "Liste adı"] [--not "…"]
//   pazaryeri: trendyol | hepsiburada | n11 | pazarama | pttavm | idefix | ciceksepeti
// Liste: pazaryerinin yayımladığı PDF / Excel tablosu, Excel'de "Farklı kaydet → CSV UTF-8" ile kaydedilir. Ayraç ; , ya da sekme olabilir.
//   Başlık satırında oran sütununun adında "oran" ya da "komisyon" geçmelidir; diğer dolu sütunlar soldan sağa kategori kırılımı sayılır
//   (ör. "Ana Kategori;Kategori;Alt Kategori;Komisyon Oranı"). Tek sütunda "Ev > Mutfak > Tencere" biçimi de olur.
//   Oranlar "%18,5", "18,5" ya da "18.5" yazılabilir; tüm oranlar 1'den küçükse (0,185 gibi) kesir kabul edilip 100 ile çarpılır.
// --tarih: listenin yayımlandığı / geçerli olduğu tarih (dosyada ya da sayfada yazan). --baz: listedeki oran KDV hariç mi (Trendyol ve
// Hepsiburada listeleri genellikle "+KDV", yani KDV hariçtir; varsayılan kdv-haric). Ardından: node build.mjs
// Kural: yalnız resmî liste. Tahmini ya da başka sitelerden derlenmiş oran girmeyin.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETPLACES, SEP, file, validate } from '../src/commission.mjs';

const args = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else pos.push(args[i]);
const [mp, csvPath] = pos;
const die = (m) => { console.error(`Hata: ${m}`); process.exit(1); };
if (!MARKETPLACES[mp]) die(`pazaryeri şunlardan biri olmalı: ${Object.keys(MARKETPLACES).join(', ')}`);
if (!csvPath) die('CSV dosyası verin');
if (!opt.kaynak) die('--kaynak (resmî listenin adresi) zorunlu');
if (!opt.tarih) die('--tarih (listenin yayım / geçerlilik tarihi, YYYY-AA-GG) zorunlu');

const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const delim = [';', '\t', ','].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
// Basit CSV ayrıştırma (tırnak içindeki ayraçlar korunur)
const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim()); };
const head = split(lines[0]);
const rateCol = head.findIndex((h) => /oran|komisyon/i.test(h));
if (rateCol < 0) die(`başlıkta oran sütunu bulunamadı: ${head.join(' | ')}`);
const catCols = head.map((_, i) => i).filter((i) => i !== rateCol);
const parseRate = (s) => { const t = s.replace(/[%\s]/g, '').replace(',', '.'); const n = parseFloat(t); return Number.isFinite(n) ? n : NaN; };

const rows = [], skipped = [];
for (const l of lines.slice(1)) {
  const c = split(l), r = parseRate(c[rateCol] || '');
  const path = catCols.map((i) => c[i]).filter(Boolean).join(SEP).split(/\s*>\s*/).filter(Boolean).join(SEP);
  if (!path || !Number.isFinite(r)) { skipped.push(l); continue; }
  rows.push([path, r]);
}
if (!rows.length) die('geçerli satır yok');
if (rows.every(([, r]) => r <= 1)) rows.forEach((x) => { x[1] = Math.round(x[1] * 10000) / 100; });
// Aynı yol iki kez geçerse: oranlar aynıysa birleştirilir, farklıysa durur (elle kontrol edin)
const map = new Map();
for (const [p, r] of rows) { if (map.has(p) && map.get(p) !== r) die(`aynı kategori farklı oranla iki kez: ${p} (${map.get(p)} / ${r})`); map.set(p, r); }
const today = new Date().toISOString().slice(0, 10);
const out = validate({
  v: 1, mp, source: opt.kaynak, sourceTitle: opt.baslik || `${MARKETPLACES[mp]} kategori komisyon oranları`, published: opt.tarih, retrieved: today,
  basis: opt.baz || 'kdv-haric', ...(opt.not ? { note: opt.not } : {}),
  cats: [...map].sort((a, b) => a[0].localeCompare(b[0], 'tr')),
}, mp);
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', file(mp));
writeFileSync(dest, JSON.stringify(out));
console.log(`${out.cats.length} kategori yazıldı → ${dest}${skipped.length ? ` (${skipped.length} satır atlandı: boş ya da oransız)` : ''}`);
