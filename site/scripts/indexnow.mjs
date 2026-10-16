// IndexNow: değişen site sayfalarını Bing, Yandex, Seznam, Naver … arama motorlarına anında bildirir (api.indexnow.org hepsine iletir).
// Google IndexNow kullanmaz; Google için site haritası (public/sitemap.xml, robots.txt'te) yeterlidir.
// Anahtar: public/<32 haneli anahtar>.txt (içinde yalnız anahtar). Sitede https://hasturkcrm.com/<anahtar>.txt adresinden sunulur.
//
// Kullanım (yayından SONRA, site klasöründe; sayfaların yeni hali yayında olmalı):
//   node scripts/indexnow.mjs                 → site haritasında lastmod'u bugün olan sayfalar
//   node scripts/indexnow.mjs --since 2026-10-01   → bu tarihten sonra değişen sayfalar
//   node scripts/indexnow.mjs --all           → site haritasındaki tüm sayfalar (ilk kurulumda bir kez)
//   node scripts/indexnow.mjs --dry-run …     → göndermeden listeyi yazar
// Blog yazıları ayrıca Worker'ın zamanlayıcısıyla bildirilir (src/worker.js → IndexNow; Worker değişkeni INDEXNOW_KEY bu anahtarla aynı olabilir).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const SITE = 'https://hasturkcrm.com';
const args = process.argv.slice(2), has = (f) => args.includes(f), val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : '');

const keyFile = readdirSync(PUB).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('Anahtar dosyası yok: public/<32 haneli anahtar>.txt'); process.exit(1); }
const key = readFileSync(join(PUB, keyFile), 'utf8').trim();
if (`${key}.txt` !== keyFile) { console.error(`${keyFile} içindeki anahtar dosya adıyla aynı olmalı`); process.exit(1); }

const today = new Date().toISOString().slice(0, 10), since = val('--since') || today;
const entries = [...readFileSync(join(PUB, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map(([, loc, mod]) => ({ loc, mod }));
const urlList = entries.filter((e) => has('--all') || e.mod >= since).map((e) => e.loc).slice(0, 10000);
if (!urlList.length) { console.log(`Bildirilecek sayfa yok (lastmod >= ${since}).`); process.exit(0); }
console.log(`${urlList.length} adres${has('--all') ? '' : ` (lastmod >= ${since})`}:\n${urlList.join('\n')}`);
if (has('--dry-run')) process.exit(0);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList }),
});
// 200 / 202: alındı · 403: anahtar dosyası sitede bulunamadı (önce yayınlayın) · 422: adresler bu siteye ait değil · 429: çok sık istek
console.log(`IndexNow yanıtı: HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
process.exit(res.ok ? 0 : 1);
