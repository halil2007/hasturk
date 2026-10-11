// Resmî komisyon listelerini (tanıtım sitesindeki site/public/assets/komisyon-<pazaryeri>.json) panele kopyalar:
// src/commission-lists.js üretilir (yalnız kategori yolu ve oran; vade metni ve kaynak açıklaması panelde gerekmez).
// Liste güncellenince: node dev/komisyon-listeleri.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', '..', 'site', 'public', 'assets');
const out = {};
for (const mp of ['trendyol', 'hepsiburada']) {
  const d = JSON.parse(readFileSync(join(assets, `komisyon-${mp}.json`), 'utf8'));
  if (d.v !== 1 || d.mp !== mp || !['kdv-dahil', 'kdv-haric'].includes(d.basis) || !Array.isArray(d.cats)) throw new Error(`komisyon-${mp}.json biçimi beklenmedik`);
  out[mp] = { basis: d.basis, published: d.published, title: d.sourceTitle || '', cats: d.cats.map(([p, r]) => [p, r]) };
}
const body = `// OTOMATİK ÜRETİLDİ (dev/komisyon-listeleri.mjs) — elle düzenlemeyin.
// Pazaryerlerinin resmî kategori komisyon listeleri: [kategori yolu "Ana > Alt > Ürün grubu, Ürün grubu …", oran %].
// basis: kdv-dahil (Trendyol: oran kesilen tutardır) | kdv-haric (Hepsiburada: kesilen = oran × 1,20)
export const LISTS = ${JSON.stringify(out)};
`;
writeFileSync(join(here, '..', 'src', 'commission-lists.js'), body);
console.log('src/commission-lists.js yazıldı:', Object.entries(out).map(([k, v]) => `${k} ${v.cats.length}`).join(', '), `(${Math.round(body.length / 1024)} KB)`);
