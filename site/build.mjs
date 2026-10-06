// Tanıtım sitesini derler: src/layout.html (ortak üst menü, alt bilgi) + src/pages/*.html (sayfa içerikleri) → public/*.html
// Ayrıca src/data.mjs'deki her özellik için public/ozellikler/<slug>.html, her entegrasyon için public/entegrasyonlar/<slug>.html
// ve üst menüdeki açılır listeler üretilir.
// Kullanım: node build.mjs   (site klasöründe; bağımlılık yok). Düzenledikten sonra çalıştırıp public/ ile birlikte kaydedin.
// Sayfanın başındaki yorum bloğu sayfa bilgileridir:
//   <!--
//   title: Sekme başlığı
//   description: Arama motoru açıklaması
//   url: /adres            (ana sayfa için /)
//   nav: ozellikler        (menüde vurgulanacak bağlantı; isteğe bağlı)
//   sitemap: no            (site haritasına girmesin; isteğe bağlı)
//   -->
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, INTEGRATIONS } from './src/data.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src'), OUT = join(ROOT, 'public');
const layout = await readFile(join(SRC, 'layout.html'), 'utf8');
const sprite = (await readFile(join(SRC, 'sprite.svg'), 'utf8')).trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ico = (id) => `<svg><use href="#${id}"/></svg>`;
const tick = `<i class="tick"><svg><use href="#i-check"/></svg></i>`;
const fById = Object.fromEntries(FEATURES.map((f) => [f.slug, f]));

// ---------- üst menü açılır listeleri ----------
const menuFeatures = FEATURES.map((f) => `<a class="mi" href="/ozellikler/${f.slug}"><span class="ic ${f.color}">${ico(f.icon)}</span><span><b>${esc(f.name)}</b><small>${esc(f.short)}</small></span></a>`).join('');
const menuIntegrations = INTEGRATIONS.map((x) => `<a class="mi" href="/entegrasyonlar/${x.slug}"><span class="b" style="background:${x.color}">${esc(x.badge)}</span><span><b>${esc(x.name)}</b><small>${esc(x.kind)}</small></span></a>`).join('');
const featureCards = FEATURES.map((f) => `<a class="fcard reveal" href="/ozellikler/${f.slug}"><span class="ic ${f.color}">${ico(f.icon)}</span><b>${esc(f.name)}</b><span>${esc(f.short)}</span><ul>${f.points.slice(0, 3).map(([, t]) => `<li>${tick}${esc(t)}</li>`).join('')}</ul><em>İncele ${ico('i-arrow')}</em></a>`).join('');
const integrationCards = INTEGRATIONS.map((x) => `<a class="icard reveal" href="/entegrasyonlar/${x.slug}"><span class="wm-big" style="color:${x.color}">${esc(x.word)}</span><small>${esc(x.kind)} · ${x.caps.filter(([, v]) => v !== false).length} işlem</small><em>Ayrıntılar ${ico('i-arrow')}</em></a>`).join('');
const mnavFeatures = FEATURES.map((f) => `<a href="/ozellikler/${f.slug}">${esc(f.name)}</a>`).join('');
const mnavIntegrations = INTEGRATIONS.map((x) => `<a href="/entegrasyonlar/${x.slug}">${esc(x.name)}</a>`).join('');

// ---------- ortak parçalar ----------
const browser = (img, alt) => `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>panel.hasturkcrm.com</span></div><img src="/img/${img}.jpg" width="1440" height="900" alt="${esc(alt)}"></div>`;
const MOCKS = {
  questions: `<div class="mockcard"><div class="mc-h"><b>Müşteri soruları</b><span class="pill soon">3 cevap bekliyor</span></div>
    ${[['#f27a1a', 'T', 'Trendyol', 'Bu toprak orkide için uygun mu?', '12 dk'], ['#ff6000', 'hb', 'Hepsiburada', 'Kargo ne zaman çıkar?', '40 dk'], ['#7b3fe4', 'n11', 'N11', 'Paket kaç litre?', '2 sa']].map(([c, b, n, q, t]) => `<div class="mc-row"><span class="b" style="background:${c}">${b}</span><div><b>${q}</b><small>${n} · ${t} önce</small></div><span class="mc-btn">Cevapla</span></div>`).join('')}
    <div class="mc-note">Örnek görünüm</div></div>`,
  team: `<div class="mockcard"><div class="mc-h"><b>Personel</b><span class="pill">2 adımlı doğrulama zorunlu</span></div>
    ${[['AY', 'Ayşe Y.', 'Yönetici', 'Tüm bölümler'], ['MK', 'Mehmet K.', 'Depo / sevkiyat', 'Siparişler · Kargo · Stok'], ['ZD', 'Zeynep D.', 'Müşteri hizmetleri', 'Sorular · İadeler · Siparişler (görür)']].map(([i, n, r, p]) => `<div class="mc-row"><span class="av">${i}</span><div><b>${n} <em>${r}</em></b><small>${p}</small></div><span class="mc-ok">${ico('i-shield')}</span></div>`).join('')}
    <div class="mc-note">Örnek görünüm</div></div>`,
  api: `<div class="mockcard code"><div class="mc-h"><b>GET /api/v1/stock</b><span class="pill">Authorization: Bearer hst_…</span></div>
<pre>{
  "page": 1, "total": 248, "has_more": false,
  "items": [
    { "sku": "HG-SOL-5", "barcode": "8690000000011",
      "name": "Solucan Gübresi 5 Kg",
      "stock": 42, "price": 189, "active": true },
    …
  ]
}</pre><div class="mc-note">Örnek yanıt</div></div>`,
};
const ctaBand = `<section class="sec"><div class="wrap"><div class="ask big reveal"><div><b>Kendi mağazanızla 7 gün ücretsiz deneyin</b><span>Önce örnek verilerle çalışan demo panelini kullanın; beğenirseniz deneme hesabınızı birlikte açalım. Kurulum ücreti yok.</span></div>
  <div class="ctas"><a class="btn btn-primary" href="/demo">Ücretsiz demoyu deneyin ${ico('i-arrow')}</a><a class="btn btn-outline" href="/paketler">Fiyatları görün</a></div></div></div></section>`;
// Bölümler sırayla açık mavi / beyaz zemin alır (ilk = alt)
const alt = (parts, first = true) => parts.filter(Boolean).map((c, i) => `<section class="sec${(i % 2 === 0) === first ? ' alt' : ''}"><div class="wrap">${c}</div></section>`).join('\n');
const faqHtml = (faq) => `<div class="faq">${faq.map(([q, a]) => `<details class="reveal"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
const heroChecks = `<div class="checks"><span>${tick}7 gün ücretsiz deneme</span><span>${tick}Kurulum ücreti yok</span><span>${tick}Türkçe destek</span></div>`;

function featurePage(f) {
  const vis = f.img ? browser(f.img, `${f.name} ekranı`) : MOCKS[f.mock];
  const rel = (f.related || []).map((s) => fById[s]).filter(Boolean);
  const body = `<section class="page-hero fp-hero">
  <div class="wrap fp-grid">
    <div class="txt">
      <nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span><a href="/ozellikler">Özellikler</a><span>›</span><b>${esc(f.name)}</b></nav>
      <div class="fp-k"><span class="ic ${f.color}">${ico(f.icon)}</span>${esc(f.name)}</div>
      <h1>${esc(f.h1[0])} <span class="grad">${esc(f.h1[1])}</span></h1>
      <p>${esc(f.lead)}</p>
      <div class="ctas"><a class="btn btn-primary" href="/demo">Ücretsiz demoyu deneyin ${ico('i-arrow')}</a><a class="btn btn-line" href="/paketler">Fiyatlar</a></div>
      ${heroChecks}
    </div>
    <div class="vis">${vis}</div>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">Neler yapabilirsiniz?</div><h2>${esc(f.name)}</h2></div>
    <div class="trust">${f.points.map(([i, t, d], k) => `<div class="tr reveal"><span class="ic ${['c-blue', 'c-green', 'c-purple', 'c-orange', 'c-teal', 'c-pink'][k % 6]}">${ico(i)}</span><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>
  </div>
</section>
${alt([
  f.steps && `<div class="sec-head reveal"><div class="kicker">Nasıl çalışır?</div><h2>${f.steps.length} Adımda</h2></div>
  <div class="how three">${f.steps.map(([t, d], k) => `<div class="hs reveal"><div class="ic">${ico(['i-gear', 'i-bolt', 'i-eye'][k] || 'i-check')}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div>`,
  f.note && `<div class="note-box reveal"><div class="nb-h">${ico('i-shield')}<b>${esc(f.note.title)}</b></div><ul>${f.note.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`,
  `<div class="sec-head reveal"><div class="kicker">Sık sorulanlar</div><h2>Merak Edilenler</h2></div>${faqHtml(f.faq)}`,
  `<div class="sec-head reveal"><div class="kicker">İlgili özellikler</div><h2>Bunlara da Göz Atın</h2></div>
    <div class="grid g3">${rel.map((r) => `<a class="card rel reveal" href="/ozellikler/${r.slug}"><span class="ic ${r.color}">${ico(r.icon)}</span><b>${esc(r.name)}</b><span>${esc(r.short)}</span><em>İncele ${ico('i-arrow')}</em></a>`).join('')}</div>`,
], true)}
${ctaBand}`;
  return { meta: { title: f.title, description: f.lead.slice(0, 155), url: `/ozellikler/${f.slug}`, nav: 'ozellikler' }, body, file: `ozellikler/${f.slug}.html` };
}

function integrationPage(x) {
  const cap = ([k, v]) => `<li class="${v === false ? 'no' : ''}">${v === false ? `<i class="x">${ico('i-minus')}</i>` : tick}<span>${esc(k)}</span>${typeof v === 'string' ? `<em>${esc(v)}</em>` : v === false ? '<em class="muted">yok</em>' : ''}</li>`;
  const others = INTEGRATIONS.filter((o) => o.slug !== x.slug);
  const body = `<section class="page-hero fp-hero">
  <div class="wrap fp-grid">
    <div class="txt">
      <nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span><a href="/entegrasyonlar">Entegrasyonlar</a><span>›</span><b>${esc(x.name)}</b></nav>
      <div class="int-logo"><span class="b" style="background:${x.color}">${esc(x.badge)}</span><span class="wm-big" style="color:${x.color}">${esc(x.word)}</span><span class="pill">Aktif entegrasyon</span></div>
      <h1>${esc(x.name)} <span class="grad">Entegrasyonu</span></h1>
      <p>${esc(x.lead)}</p>
      <div class="ctas"><a class="btn btn-primary" href="/demo">Ücretsiz demoyu deneyin ${ico('i-arrow')}</a><a class="btn btn-line" href="/paketler">Fiyatlar</a></div>
      ${heroChecks}
    </div>
    <div class="vis"><div class="capcard"><div class="cc-h"><b>Desteklenen işlemler</b><small>${esc(x.name)} resmi entegrasyon servisi</small></div><ul>${x.caps.map(cap).join('')}</ul></div></div>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">${esc(x.name)} ile</div><h2>Neler Yapabilirsiniz?</h2></div>
    <div class="trust four">${x.points.map(([i, t, d], k) => `<div class="tr reveal"><span class="ic ${['c-blue', 'c-green', 'c-purple', 'c-orange'][k % 4]}">${ico(i)}</span><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>
  </div>
</section>
<section class="sec alt">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">Bağlantı</div><h2>${esc(x.name)} Mağazanızı Bağlayın</h2></div>
    <div class="how three">
      <div class="hs reveal"><div class="ic">${ico('i-key')}</div><h3>API bilgilerini alın</h3><p>${esc(x.help)}</p></div>
      <div class="hs reveal"><div class="ic">${ico('i-plug')}</div><h3>Panele girin</h3><p>Entegrasyonlar sayfasında ${esc(x.name)} kartına bilgileri yapıştırın; panel bağlantıyı hemen test eder ve sorun varsa nedenini söyler.</p></div>
      <div class="hs reveal"><div class="ic">${ico('i-sync')}</div><h3>Veriler gelsin</h3><p>Son bir yılın siparişleri ve ilanlarınız gelir; ürünler barkoda göre eşleşir. Kurulumda yanınızdayız.</p></div>
    </div>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">Diğer entegrasyonlar</div><h2>Tüm Kanallarınız Tek Panelde</h2><p>Aynı panelde birden fazla pazaryeri ve e-ticaret sitesini birlikte yönetin; stok ve fiyat hepsinde eşit kalır.</p></div>
    <div class="integ">${others.map((o) => `<a class="it reveal" href="/entegrasyonlar/${o.slug}"><span class="b" style="background:${o.color}">${esc(o.badge)}</span><div style="min-width:0"><b>${esc(o.name)}</b><small>${esc(o.kind)}</small></div></a>`).join('')}<a class="it reveal" href="/entegrasyonlar#yakinda"><span class="b" style="background:#94a3b8">+</span><div style="min-width:0"><b>Yakında</b><small>Amazon, Çiçeksepeti, Shopify…</small></div></a></div>
  </div>
</section>
${ctaBand}`;
  return { meta: { title: `${x.name} Entegrasyonu — Hastürk CRM`, description: x.lead.slice(0, 155), url: `/entegrasyonlar/${x.slug}`, nav: 'entegrasyonlar' }, body, file: `entegrasyonlar/${x.slug}.html` };
}

// ---------- sayfa üretimi ----------
function render(meta, body, page) {
  let head = '';
  body = body.replace(/<!-- head -->([\s\S]*?)<!-- \/head -->\s*/, (_, h) => { head = h.trim(); return ''; });
  let html = layout.replace('{{sprite}}', sprite).replace('{{body}}', body.trim()).replace('{{head}}', head)
    .replace('{{featureCards}}', featureCards).replace('{{integrationCards}}', integrationCards).replace('{{menuFeatures}}', menuFeatures).replace('{{menuIntegrations}}', menuIntegrations).replace('{{mnavFeatures}}', mnavFeatures).replace('{{mnavIntegrations}}', mnavIntegrations)
    .replace(/{{title}}/g, esc(meta.title)).replace(/{{description}}/g, esc(meta.description)).replace(/{{url}}/g, meta.url).replace(/{{page}}/g, page);
  if (meta.nav) html = html.replace(new RegExp(`data-nav="${meta.nav}"`, 'g'), `data-nav="${meta.nav}" class="on" aria-current="page"`);
  return html;
}

const pages = [];
for (const file of (await readdir(join(SRC, 'pages'))).filter((f) => f.endsWith('.html')).sort()) {
  const raw = await readFile(join(SRC, 'pages', file), 'utf8');
  const m = raw.match(/^<!--([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: sayfa bilgisi (yorum bloğu) yok`);
  const meta = Object.fromEntries(m[1].split('\n').map((l) => l.match(/^\s*([a-z]+):\s*(.*?)\s*$/)).filter(Boolean).map((x) => [x[1], x[2]]));
  for (const k of ['title', 'description', 'url']) if (!meta[k]) throw new Error(`${file}: "${k}" eksik`);
  await writeFile(join(OUT, file), render(meta, raw.slice(m[0].length), file.replace(/\.html$/, '')));
  pages.push({ file, ...meta });
}
for (const dir of ['ozellikler', 'entegrasyonlar']) await mkdir(join(OUT, dir), { recursive: true });
for (const g of [...FEATURES.map(featurePage), ...INTEGRATIONS.map(integrationPage)]) {
  await writeFile(join(OUT, g.file), render(g.meta, g.body, g.file.split('/')[0] + '-detay'));
  pages.push({ file: g.file, ...g.meta });
}
const today = new Date().toISOString().slice(0, 10);
const urls = pages.filter((p) => p.sitemap !== 'no').map((p) => `  <url><loc>https://hasturkcrm.com${p.url}</loc><lastmod>${today}</lastmod></url>`).join('\n');
await writeFile(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`${pages.length} sayfa derlendi`);
