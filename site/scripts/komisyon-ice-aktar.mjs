// Pazaryerinin resmî kategori komisyon listesini site verisine çevirir → public/assets/komisyon-<pazaryeri>.json
// Kullanım (site klasöründe):
//   node scripts/komisyon-ice-aktar.mjs <pazaryeri> <liste.csv> --kaynak <https://resmî-liste-adresi | "belge tanımı"> --tarih <YYYY-AA-GG> [--baz kdv-haric|kdv-dahil] [--baslik "Liste adı"] [--not "…"]
//   --kaynak herkese açık adres değilse (satıcıya verilen sözleşme eki PDF gibi) belgenin tanımını yazın; o zaman --baslik zorunludur ve sitede
//   bağlantısız "Kaynak: <baslik>, GG.AA.YYYY" olarak görünür.
//   pazaryeri: trendyol | hepsiburada | n11 | pazarama | pttavm | idefix | ciceksepeti
// Liste: pazaryerinin yayımladığı PDF / Excel tablosu, Excel'de "Farklı kaydet → CSV UTF-8" ile kaydedilir. Ayraç ; , ya da sekme olabilir.
//   Başlık satırında oran sütununun adında "oran" ya da "komisyon" geçmelidir; diğer dolu sütunlar soldan sağa kategori kırılımı sayılır
//   (ör. "Ana Kategori;Kategori;Alt Kategori;Komisyon Oranı"). Tek sütunda "Ev > Mutfak > Tencere" biçimi de olur.
//   Oranlar "%18,5", "18,5" ya da "18.5" yazılabilir; tüm oranlar 1'den küçükse (0,185 gibi) kesir kabul edilip 100 ile çarpılır.
//   Adında "oran"/"komisyon" geçen İLK sütun (adı "Marka" ile başlamayan) kategori oranıdır. Diğer oran sütunları (satıcı seviyesi, program,
//   lokasyon), "Marka…" sütunları ve "No"/"Sıra" sütunu aktarılmaz. Adında "vade" geçen sütun vade metni olarak saklanır (yalnız sayıysa ve
//   başlıkta "iş günü" geçiyorsa "28 iş günü" biçimine çevrilir). Aynı kategori yolu birden çok satırda geçerse (ör. yalnız marka sütunu farklı)
//   oran ve vade aynıysa tek kayıt olur, farklıysa betik durur.
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
if (!opt.kaynak) die('--kaynak (resmî listenin adresi ya da belge tanımı) zorunlu');
const isUrl = /^https:\/\/\S+$/.test(opt.kaynak);
if (!isUrl && !opt.baslik) die('--kaynak bir https adresi değilse --baslik (sitede görünecek kaynak adı) zorunlu');
if (!opt.tarih) die('--tarih (listenin yayım / geçerlilik tarihi, YYYY-AA-GG) zorunlu');

const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const delim = [';', '\t', ','].map((d) => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
// Basit CSV ayrıştırma (tırnak içindeki ayraçlar korunur)
const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim()); };
const head = split(lines[0]);
const isRate = (h) => /oran|komisyon/i.test(h), isBrand = (h) => /^marka/i.test(h.trim()), isNo = (h) => /^(no|sıra|sira)(\s*no)?\.?$/i.test(h.trim());
const rateCol = head.findIndex((h) => isRate(h) && !isBrand(h));
if (rateCol < 0) die(`başlıkta oran sütunu bulunamadı: ${head.join(' | ')}`);
const vadeCol = head.findIndex((h) => /vade/i.test(h));
const ignored = head.map((_, i) => i).filter((i) => i !== rateCol && i !== vadeCol && (isRate(head[i]) || isBrand(head[i]) || isNo(head[i])));
const catCols = head.map((_, i) => i).filter((i) => i !== rateCol && i !== vadeCol && !ignored.includes(i));
const parseRate = (s) => { const t = s.replace(/[%\s]/g, '').replace(',', '.'); if (!/^\d+(\.\d+)?$/.test(t)) return NaN; return parseFloat(t); };
const vadeOf = (s) => { const t = (s || '').replace(/\s+/g, ' ').trim(); return /^\d+$/.test(t) && /iş\s*günü/.test(head[vadeCol].toLocaleLowerCase('tr')) ? `${t} iş günü` : t; };
console.log(`Kategori yolu: ${catCols.map((i) => head[i]).join(' > ')} · Oran: ${head[rateCol]}${vadeCol >= 0 ? ` · Vade: ${head[vadeCol]}` : ''}`);
if (ignored.length) console.log(`Aktarılmayan sütunlar: ${ignored.map((i) => head[i]).join(' | ')}`);

const rows = [], skipped = [];
for (const l of lines.slice(1)) {
  const c = split(l), r = parseRate(c[rateCol] || '');
  const path = catCols.map((i) => c[i]).filter(Boolean).join(SEP).split(/\s*>\s*/).filter(Boolean).join(SEP);
  if (!path || !Number.isFinite(r)) { skipped.push(l); continue; }
  rows.push([path, r, vadeCol >= 0 ? vadeOf(c[vadeCol]) : '']);
}
if (!rows.length) die('geçerli satır yok');
if (rows.every(([, r]) => r <= 1)) rows.forEach((x) => { x[1] = Math.round(x[1] * 10000) / 100; });
// Aynı yol birden çok kez geçerse: oran ve vade aynıysa birleştirilir, farklıysa durur (elle kontrol edin)
const map = new Map();
for (const [p, r, v] of rows) {
  const o = map.get(p);
  if (o && o[0] !== r) die(`aynı kategori farklı oranla iki kez: ${p} (${o[0]} / ${r})`);
  if (o && o[1] !== v) die(`aynı kategori farklı vadeyle iki kez: ${p} (${o[1]} / ${v})`);
  map.set(p, [r, v]);
}
const today = new Date().toISOString().slice(0, 10);
const out = validate({
  v: 1, mp, ...(isUrl ? { source: opt.kaynak } : { sourceDoc: opt.kaynak }), sourceTitle: opt.baslik || `${MARKETPLACES[mp]} kategori komisyon oranları`, published: opt.tarih, retrieved: today,
  basis: opt.baz || 'kdv-haric', ...(opt.not ? { note: opt.not } : {}),
  cats: [...map].map(([p, [r, v]]) => (v ? [p, r, v] : [p, r])).sort((a, b) => a[0].localeCompare(b[0], 'tr')),
}, mp);
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', file(mp));
writeFileSync(dest, JSON.stringify(out));
console.log(`${rows.length} satır okundu, ${out.cats.length} kategori yazıldı → ${dest}${skipped.length ? ` (${skipped.length} satır atlandı: boş ya da oransız)` : ''}`);
for (const l of skipped) console.log(`  atlandı: ${l.slice(0, 160)}`);
