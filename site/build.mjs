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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { FEATURES, INTEGRATIONS } from './src/data.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src'), OUT = join(ROOT, 'public');
const layout = await readFile(join(SRC, 'layout.html'), 'utf8');
const sprite = (await readFile(join(SRC, 'sprite.svg'), 'utf8')).trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ico = (id) => `<svg><use href="#${id}"/></svg>`;
const tick = `<i class="tick"><svg><use href="#i-check"/></svg></i>`;
const fById = Object.fromEntries(FEATURES.map((f) => [f.slug, f]));
const SITE_URL = 'https://hasturkcrm.com';
// Şirket bilgileri ve paket fiyatları tek yerden: public/assets/config.js (arama motoru verisi de buradan üretilir)
const S = (() => { const ctx = { window: {}, document: { documentElement: { classList: { add() {} } } } }; vm.runInNewContext(readFileSync(join(OUT, 'assets', 'config.js'), 'utf8'), ctx); return ctx.window.SITE; })();
// Önbellek kırıcı: CSS / JS içeriği değişince adresi de değişir (?v=…); tarayıcı eski dosyayı kullanmaz, değişmeyeni uzun süre saklar
const ver = Object.fromEntries(['site.css', 'site.js', 'config.js'].map((f) => [f, createHash('sha1').update(readFileSync(join(OUT, 'assets', f))).digest('hex').slice(0, 10)]));

// ---------- üst menü açılır listeleri ----------
const menuFeatures = FEATURES.map((f) => `<a class="mi" href="/ozellikler/${f.slug}"><span class="ic ${f.color}">${ico(f.icon)}</span><span><b>${esc(f.name)}</b><small>${esc(f.short)}</small></span></a>`).join('');
const menuIntegrations = INTEGRATIONS.map((x) => `<a class="mi" href="/entegrasyonlar/${x.slug}"><span class="b" style="background:${x.color}">${esc(x.badge)}</span><span><b>${esc(x.name)}</b><small>${esc(x.kind)}</small></span></a>`).join('');
const featureCards = FEATURES.map((f) => `<a class="fcard reveal" href="/ozellikler/${f.slug}"><span class="ic ${f.color}">${ico(f.icon)}</span><b>${esc(f.name)}</b><span>${esc(f.short)}</span><ul>${f.points.slice(0, 3).map(([, t]) => `<li>${tick}${esc(t)}</li>`).join('')}</ul><em>İncele ${ico('i-arrow')}</em></a>`).join('');
const integrationCards = INTEGRATIONS.map((x) => `<a class="icard reveal" href="/entegrasyonlar/${x.slug}"><span class="wm-big" style="color:${x.color}">${esc(x.word)}</span><small>${esc(x.kind)} · ${x.caps.filter(([, v]) => v !== false).length} işlem</small><em>Ayrıntılar ${ico('i-arrow')}</em></a>`).join('');
const TAB_FEATURES = ['siparis-yonetimi', 'kargo-ve-etiket', 'stok-senkronizasyonu', 'urun-yonetimi', 'buybox-takibi', 'kar-zarar', 'raporlar', 'musteri-sorulari-ve-iadeler', 'mobil-yonetim'];
const featureTabs = () => { const list = TAB_FEATURES.map((s) => fById[s]); return `<div class="ftabs" data-ftabs>
  <div class="ft-list" role="tablist">${list.map((f, i) => `<button type="button" role="tab" data-i="${i}" class="${i ? '' : 'on'}" aria-selected="${!i}"><span class="ic ${f.color}">${ico(f.icon)}</span><span>${esc(f.name)}</span></button>`).join('')}</div>
  <div class="ft-panels">${list.map((f, i) => `<div class="ft-p" data-p="${i}"${i ? ' hidden' : ''}>
    <div class="ft-txt"><div class="kicker">${esc(f.name)}</div><h3>${esc(f.h1[0])} <span class="grad">${esc(f.h1[1])}</span></h3><p>${esc(f.lead)}</p>
      <ul>${f.points.slice(0, 4).map(([, t, d]) => `<li>${tick}<span><b>${esc(t)}</b> ${esc(d)}</span></li>`).join('')}</ul>
      <a class="btn btn-primary" href="/ozellikler/${f.slug}">Nasıl çalışır, ne kazandırır? ${ico('i-arrow')}</a></div>
    <div class="ft-vis">${f.img ? `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>panel.hasturkcrm.com</span></div><img src="/img/${f.img}.jpg" width="1440" height="900" alt="${esc(f.name)} ekranı" loading="lazy"></div>` : MOCKS[f.mock]}</div>
  </div>`).join('')}</div>
</div>`; };
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
const ctaBand = `<section class="sec"><div class="wrap"><div class="ask big reveal"><div><b>Kendi gözünüzle görün</b><span>Kayıt olmadan demo panelini açın, örnek siparişlerle her şeyi deneyin. Beğenirseniz kendi mağazanızla 7 gün ücretsiz kullanın; kurulum ücreti yok.</span></div>
  <div class="ctas"><a class="btn btn-primary" data-demo href="/demo">Canlı demoyu açın ${ico('i-arrow')}</a><a class="btn btn-outline" data-call href="/iletisim">${ico('i-phone')}Hemen arayın</a></div></div></div></section>`;
// Bölümler sırayla açık mavi / beyaz zemin alır (ilk = alt)
const alt = (parts, first = true) => parts.filter(Boolean).map((c, i) => `<section class="sec${(i % 2 === 0) === first ? ' alt' : ''}"><div class="wrap">${c}</div></section>`).join('\n');
const faqHtml = (faq) => `<div class="faq">${faq.map(([q, a]) => `<details class="reveal"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
const heroChecks = `<div class="checks"><span>${tick}7 gün ücretsiz deneme</span><span>${tick}Kurulum ücreti yok</span><span>${tick}Türkçe destek</span></div>`;

// Örnek hesap / senaryo blokları (tutarlar örnektir; basamaklar panelin kâr hesabıyla aynı sıradadır)
const tl = (n) => Math.abs(n).toLocaleString('tr-TR');
const PROFIT = [['Satış (ciro)', 1000, 'first'], ['Komisyon (%18)', -180], ['Kargo', -65], ['Hizmet bedeli', -10], ['Stopaj (%1)', -8], ['Reklam', -20], ['Hakediş', 717, 'sum'], ['Alış maliyeti', -450], ['Brüt kâr', 267, 'sum'], ['İşletme giderleri payı', -30], ['Net kâr', 237, 'net']];
const EXAMPLES = {
  profit: `<div class="ex">
    <div class="ex-txt reveal"><div class="kicker">Örnek hesap</div><h2>1.000 ₺'lik Satıştan Size Ne Kalır?</h2>
      <p>Panel her siparişi bu basamaklarla hesaplar. Komisyon, kargo, hizmet bedeli ve reklam tutarları pazaryerinin kestiği faturalardan gelir; alış maliyetini siz bir kez girersiniz.</p>
      <p class="muted-s">Tutarlar örnektir. Gerçek oranlar kanala, kategoriye ve kampanyaya göre değişir.</p></div>
    <div class="wf card reveal">${PROFIT.map(([l, v, k]) => `<div class="wf-r ${k || (v < 0 ? 'neg' : '')}"><span>${l}</span><i style="--w:${Math.max(3, Math.round((Math.abs(v) / 1000) * 100))}%"></i><b>${v < 0 ? '−' : ''}${tl(v)} ₺</b></div>`).join('')}</div>
  </div>`,
  buybox: `<div class="ex">
    <div class="ex-txt reveal"><div class="kicker">Örnek senaryo</div><h2>Bir Günde Buybox Nasıl Yönetilir?</h2>
      <p>Kural: en düşük fiyat <b>180 ₺</b>, en yüksek fiyat <b>230 ₺</b>, adım <b>1 ₺</b>. Panel 15 dakikada bir kontrol eder ve yalnız gerektiğinde fiyatı değiştirir.</p>
      <p class="muted-s">Saatler ve fiyatlar örnektir.</p></div>
    <ol class="tline card reveal">${[
      ['09:00', 'Fiyatınız 205 ₺, buybox sizde.', 'Değişiklik gerekmez.', ''],
      ['10:00', 'Rakip 199 ₺\'ye indi, buybox rakibe geçti.', 'Fiyatınız 198 ₺ yapılır, buybox size döner.', 'down'],
      ['13:30', 'Rakibin stoğu bitti, tek satıcı sizsiniz.', 'Fiyatınız en yüksek sınır olan 230 ₺\'ye yükseltilir.', 'up'],
      ['16:00', 'Rakip 170 ₺\'ye indi.', 'Fiyatınız en düşük sınır olan 180 ₺\'ye iner, altına inmez: zararına satış yok.', 'down'],
      ['18:45', 'Rakip fiyatını 215 ₺\'ye çıkardı.', 'Fiyatınız 214 ₺\'ye yükseltilir; buybox sizde kalır, kârınız artar.', 'up'],
    ].map(([t, a, b, d]) => `<li class="${d}"><time>${t}</time><div><b>${a}</b><span>${b}</span></div></li>`).join('')}</ol>
  </div>`,
};
MOCKS.phone = `<div class="phone-show"><div class="phone-f static"><img src="/img/mobil.jpg" width="390" height="844" alt="Panelin telefondaki görünümü"></div>
  <div class="float f-a"><span class="fi c-orange">${ico('i-cart')}</span><span>Yeni sipariş<small>Trendyol · 2 ürün</small></span></div>
  <div class="float f-b"><span class="fi">${ico('i-check')}</span><span>Sipariş işleme alındı</span></div></div>`;

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
      <div class="ctas"><a class="btn btn-primary" data-demo href="/demo">Canlı demoyu açın ${ico('i-arrow')}</a><a class="btn btn-line" href="/paketler">Fiyatlar</a></div>
      ${heroChecks}
    </div>
    <div class="vis">${vis}</div>
  </div>
</section>
${f.why ? `<section class="sec"><div class="wrap"><div class="sec-head reveal"><div class="kicker">Ne işe yarar?</div><h2>Hangi Sorunu Çözer?</h2></div>
  <div class="why"><div class="why-c bad reveal"><span class="why-t">${ico('i-x')}Bugün</span><p>${esc(f.why[0])}</p></div><div class="why-arrow">${ico('i-arrow')}</div><div class="why-c good reveal"><span class="why-t">${ico('i-check')}Hastürk CRM ile</span><p>${esc(f.why[1])}</p></div></div></div></section>` : ''}
${alt([
  `<div class="sec-head reveal"><div class="kicker">Neler yapabilirsiniz?</div><h2>${esc(f.name)}</h2></div>
    <div class="trust">${f.points.map(([i, t, d], k) => `<div class="tr reveal"><span class="ic ${['c-blue', 'c-green', 'c-purple', 'c-orange', 'c-teal', 'c-pink'][k % 6]}">${ico(i)}</span><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}</div>`,
  f.example && EXAMPLES[f.example],
  f.steps && `<div class="sec-head reveal"><div class="kicker">Nasıl çalışır?</div><h2>${f.steps.length} Adımda</h2></div>
  <div class="how three">${f.steps.map(([t, d], k) => `<div class="hs reveal"><div class="ic">${ico(['i-gear', 'i-bolt', 'i-eye'][k] || 'i-check')}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div>`,
  f.benefits && `<div class="sec-head reveal"><div class="kicker">Artıları</div><h2>Size Ne Kazandırır?</h2></div>
    <div class="bens">${f.benefits.map(([i, t, d]) => `<div class="ben reveal"><span>${ico(i)}</span><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join('')}</div>`,
  f.note && `<div class="note-box reveal"><div class="nb-h">${ico('i-shield')}<b>${esc(f.note.title)}</b></div><ul>${f.note.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`,
  `<div class="sec-head reveal"><div class="kicker">Sık sorulanlar</div><h2>Merak Edilenler</h2></div>${faqHtml(f.faq)}`,
  `<div class="sec-head reveal"><div class="kicker">İlgili özellikler</div><h2>Bunlara da Göz Atın</h2></div>
    <div class="grid g3">${rel.map((r) => `<a class="card rel reveal" href="/ozellikler/${r.slug}"><span class="ic ${r.color}">${ico(r.icon)}</span><b>${esc(r.name)}</b><span>${esc(r.short)}</span><em>İncele ${ico('i-arrow')}</em></a>`).join('')}</div>`,
], !!f.why)}
${ctaBand}`;
  return { meta: { title: f.title, description: clip(f.lead), url: `/ozellikler/${f.slug}`, nav: 'ozellikler' }, body, file: `ozellikler/${f.slug}.html` };
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
      <div class="ctas"><a class="btn btn-primary" data-demo href="/demo">Canlı demoyu açın ${ico('i-arrow')}</a><a class="btn btn-line" href="/paketler">Fiyatlar</a></div>
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
    <div class="integ">${others.map((o) => `<a class="it reveal" href="/entegrasyonlar/${o.slug}"><span class="b" style="background:${o.color}">${esc(o.badge)}</span><div style="min-width:0"><b>${esc(o.name)}</b><small>${esc(o.kind)}</small></div></a>`).join('')}<a class="it reveal" href="/entegrasyonlar#yakinda"><span class="b" style="background:#94a3b8">+</span><div style="min-width:0"><b>Yakında</b><small>Amazon, Ticimax, IdeaSoft, T-Soft…</small></div></a></div>
  </div>
</section>
${ctaBand}`;
  return { meta: { title: `${x.name} Entegrasyonu: Sipariş, Stok ve Fiyat | Hastürk CRM`, crumb: `${x.name} Entegrasyonu`, description: clip(x.lead), url: `/entegrasyonlar/${x.slug}`, nav: 'entegrasyonlar' }, body, file: `entegrasyonlar/${x.slug}.html` };
}

// ---------- arama motoru verisi (JSON-LD) ----------
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pageName = (meta) => meta.crumb || meta.title.split(/ [—|] /)[0];
const SECTIONS = { ozellikler: 'Özellikler', entegrasyonlar: 'Entegrasyonlar' };
const ORG = { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: S.brand, url: `${SITE_URL}/`, logo: `${SITE_URL}/assets/logo.webp`,
  ...(S.company.legal ? { legalName: S.company.legal } : {}), ...(S.company.email ? { email: S.company.email } : {}), ...(S.company.phone ? { telephone: S.company.phone.replace(/\s/g, '') } : {}),
  ...(S.company.phone ? { contactPoint: [{ '@type': 'ContactPoint', telephone: S.company.phone.replace(/\s/g, ''), contactType: 'customer service', areaServed: 'TR', availableLanguage: ['Turkish'] }] } : {}) };
const APP = { '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#app`, name: S.brand, applicationCategory: 'BusinessApplication', applicationSubCategory: 'Pazaryeri entegrasyonu ve sipariş yönetimi',
  operatingSystem: 'Web, iOS, Android (tarayıcı)', inLanguage: 'tr-TR', url: `${SITE_URL}/`, image: `${SITE_URL}/img/genel-bakis.jpg`, publisher: { '@id': `${SITE_URL}/#org` },
  description: 'Trendyol, Hepsiburada, N11, ikas, PttAVM, idefix ve Pazarama mağazalarının siparişlerini, kargo etiketlerini, stoklarını, fiyatlarını ve kârlılığını tek panelden yöneten satış yönetim yazılımı.',
  offers: S.plans.filter((p) => p.monthly).map((p) => ({ '@type': 'Offer', name: `${p.name} paketi (aylık)`, price: p.monthly, priceCurrency: 'TRY', url: `${SITE_URL}/paketler`, availability: 'https://schema.org/InStock',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: p.monthly, priceCurrency: 'TRY', valueAddedTaxIncluded: true, unitCode: 'MON', billingDuration: 'P1M' } })) };
function jsonLd(meta, body) {
  const url = SITE_URL + meta.url, graph = [ORG, { '@type': 'WebSite', '@id': `${SITE_URL}/#site`, url: `${SITE_URL}/`, name: S.brand, inLanguage: 'tr-TR', publisher: { '@id': `${SITE_URL}/#org` } }];
  const page = { '@type': 'WebPage', '@id': `${url}#page`, url, name: meta.title, description: meta.description, inLanguage: 'tr-TR', isPartOf: { '@id': `${SITE_URL}/#site` }, about: { '@id': `${SITE_URL}/#app` },
    primaryImageOfPage: `${SITE_URL}/img/genel-bakis.jpg` };
  if (meta.url !== '/') {
    const parts = meta.url.split('/').filter(Boolean), items = [{ name: 'Ana sayfa', item: `${SITE_URL}/` }];
    if (parts.length > 1 && SECTIONS[parts[0]]) items.push({ name: SECTIONS[parts[0]], item: `${SITE_URL}/${parts[0]}` });
    items.push({ name: pageName(meta), item: url });
    graph.push({ '@type': 'BreadcrumbList', '@id': `${url}#crumbs`, itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...x })) });
    page.breadcrumb = { '@id': `${url}#crumbs` };
  }
  graph.push(page);
  if (['/', '/paketler', '/ozellikler', '/demo'].includes(meta.url)) graph.push(APP);
  // Sayfadaki "Sık sorulan sorular" (details/summary) aynen arama motoruna da verilir
  const faq = [...body.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)].map(([, q, a]) => [strip(q), strip(a)]).filter(([q, a]) => q && a);
  if (faq.length) graph.push({ '@type': 'FAQPage', '@id': `${url}#faq`, mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
// Görseller: sayfanın ilk büyük görseli öncelikli yüklenir (LCP), diğerleri ekrana yaklaşınca
function tuneImages(html) {
  const at = html.indexOf('<main>');
  let first = true;
  return html.slice(0, at) + html.slice(at).replace(/<img\b([^>]*)>/g, (m, a) => {
    if (/fetchpriority|loading=/.test(a) && !/loading="lazy"/.test(a)) return m;
    if (first && !/loading="lazy"/.test(a)) { first = false; return `<img${a} fetchpriority="high" decoding="async">`; }
    first = false;
    return `<img${/loading=/.test(a) ? a : a + ' loading="lazy"'}${/decoding=/.test(a) ? '' : ' decoding="async"'}>`;
  });
}

// ---------- sayfa üretimi ----------
const ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
function render(meta, body, page) {
  let head = '';
  body = body.replace(/<!-- head -->([\s\S]*?)<!-- \/head -->\s*/, (_, h) => { head = h.trim(); return ''; });
  let html = layout.replace('{{sprite}}', sprite).replace('{{body}}', body.trim()).replace('{{head}}', head)
    .replace('{{featureCards}}', featureCards).replace('{{phoneMock}}', MOCKS.phone).replace('{{featureTabs}}', body.includes('{{featureTabs}}') ? featureTabs() : '').replace('{{integrationCards}}', integrationCards).replace('{{menuFeatures}}', menuFeatures).replace('{{menuIntegrations}}', menuIntegrations).replace('{{mnavFeatures}}', mnavFeatures).replace('{{mnavIntegrations}}', mnavIntegrations)
    .replace(/{{v:([a-z.]+)}}/g, (_, f) => ver[f]).replace('{{robots}}', meta.sitemap === 'no' ? 'noindex, follow' : ROBOTS)
    .replace(/{{title}}/g, esc(meta.title)).replace(/{{description}}/g, esc(meta.description)).replace(/{{url}}/g, meta.url).replace(/{{page}}/g, page);
  html = html.replace('{{jsonld}}', () => jsonLd(meta, html.slice(html.indexOf('<main>'))));
  if (meta.nav) html = html.replace(new RegExp(`data-nav="${meta.nav}"`, 'g'), `data-nav="${meta.nav}" class="on" aria-current="page"`);
  return tuneImages(html);
}
// Arama sonucunda kesik görünmesin: açıklama ~155 karakterde kelime sınırından kısaltılır
const clip = (t, n = 155) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,;:]$/, '') + '…');

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
