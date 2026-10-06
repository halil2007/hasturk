// Tanıtım sitesini derler: src/layout.html (ortak üst menü, alt bilgi) + src/pages/*.html (sayfa içerikleri) → public/*.html
// Kullanım: node build.mjs   (site klasöründe; bağımlılık yok). Sayfayı düzenledikten sonra çalıştırıp public/ ile birlikte kaydedin.
// Sayfanın başındaki yorum bloğu sayfa bilgileridir:
//   <!--
//   title: Sekme başlığı
//   description: Arama motoru açıklaması
//   url: /adres            (ana sayfa için /)
//   nav: ozellikler        (menüde vurgulanacak bağlantı; isteğe bağlı)
//   sitemap: no            (site haritasına girmesin; isteğe bağlı)
//   -->
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src'), OUT = join(ROOT, 'public');
const layout = await readFile(join(SRC, 'layout.html'), 'utf8');
const sprite = (await readFile(join(SRC, 'sprite.svg'), 'utf8')).trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const pages = [];
for (const file of (await readdir(join(SRC, 'pages'))).filter((f) => f.endsWith('.html')).sort()) {
  const raw = await readFile(join(SRC, 'pages', file), 'utf8');
  const m = raw.match(/^<!--([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: sayfa bilgisi (yorum bloğu) yok`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.match(/^\s*([a-z]+):\s*(.*?)\s*$/)).filter(Boolean).map((x) => [x[1], x[2]]));
  for (const k of ['title', 'description', 'url']) if (!meta[k]) throw new Error(`${file}: "${k}" eksik`);
  const page = file.replace(/\.html$/, '');
  let body = raw.slice(m[0].length);
  // <!-- head --> ... <!-- /head --> arası <head> içine taşınır (sayfaya özel yapılandırılmış veri vb.)
  let head = '';
  body = body.replace(/<!-- head -->([\s\S]*?)<!-- \/head -->\s*/, (_, h) => { head = h.trim(); return ''; });
  let html = layout.replace('{{sprite}}', sprite).replace('{{body}}', body.trim()).replace('{{head}}', head)
    .replace(/{{title}}/g, esc(meta.title)).replace(/{{description}}/g, esc(meta.description)).replace(/{{url}}/g, meta.url).replace(/{{page}}/g, page);
  if (meta.nav) html = html.replace(new RegExp(`data-nav="${meta.nav}"`, 'g'), `data-nav="${meta.nav}" class="on" aria-current="page"`);
  await writeFile(join(OUT, file), html);
  pages.push({ file, ...meta });
}
const today = new Date().toISOString().slice(0, 10);
const urls = pages.filter((p) => p.sitemap !== 'no').map((p) => `  <url><loc>https://hasturkcrm.com${p.url}</loc><lastmod>${today}</lastmod></url>`).join('\n');
await writeFile(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`${pages.length} sayfa derlendi: ${pages.map((p) => p.file).join(', ')}`);
