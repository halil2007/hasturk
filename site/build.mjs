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
import { TOOLS, TOOL_GROUPS, CHANNEL_RATES, miniProfit } from './src/tools.mjs';
import { makeToolPages } from './src/tools-pages.mjs';
import { MARKETPLACES, loadCommission, file as commFile } from './src/commission.mjs';

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
const ver = Object.fromEntries(['site.css', 'site.js', 'tools.js', 'config.js', 'gtag.js', 'logo.webp', 'icon.svg', 'icon-48.png', 'apple-touch-icon.png'].map((f) => [f, createHash('sha1').update(readFileSync(join(OUT, 'assets', f))).digest('hex').slice(0, 10)]));

// ---------- üst menü açılır listeleri ----------
// Test aşamasındaki kanalın etiketi (data-beta): panelde "Test yazısını kaldır" denince site.js kaldırır; data-beta-on olanlar o zaman görünür
const testTag = (x, cls = 'pill soon') => (x.dev ? `<span class="${cls}">Geliştirme aşamasında</span>` : x.beta ? `<span class="${cls}" data-beta="${x.beta}">Test aşamasında</span>` : '');
const featureCards = FEATURES.map((f) => `<a class="fcard reveal" href="/ozellikler/${f.slug}"><span class="ic ${f.color}">${ico(f.icon)}</span><b>${esc(f.name)}</b><span>${esc(f.short)}</span><ul>${f.points.slice(0, 3).map(([, t]) => `<li>${tick}${esc(t)}</li>`).join('')}</ul><em>İncele ${ico('i-arrow')}</em></a>`).join('');
// ---------- kanal kartları (entegrasyonlar listesi) ----------
// Kategori: liste sayfasındaki sekmeler (kargo kartları site.js'teki CARGO listesinden gelir)
const CATS = [['pazaryeri', 'Pazaryerleri', 'pazaryerleri'], ['site', 'E-ticaret siteleri', 'e-ticaret'], ['yurtdisi', 'Yurt dışı', 'yurt-disi'], ['hizli', 'Hızlı teslimat', 'hizli-teslimat'], ['kargo', 'Kargo', 'kargo']];
const catOf = (x) => (/yurt dışı/.test(x.kind) ? 'yurtdisi' : /market/.test(x.kind) ? 'hizli' : /site/.test(x.kind) ? 'site' : 'pazaryeri');
// Logo kutusu: beyaz zemin, kanal renginde yazı; açık renkli markalarda (sarı) yazı okunaklı olsun diye koyulaşır
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const logoTile = (word, color, size = '') => { const k = word.length <= 6 ? 1 : word.length <= 9 ? 0.86 : word.length <= 11 ? 0.76 : 0.68;
  return `<span class="lt${size ? ` lt-${size}` : ''}${lum(color) > 0.62 ? ' fill' : ''}" style="--c:${color};--k:${k};--n:${word.length}" aria-hidden="true"><span>${esc(word)}</span></span>`; };
// ---------- Entegrasyonlar mega menüsü (masaüstü panel + mobil menüdeki akordeon) ----------
// Gruplar data.mjs'teki kanallardan sayılır; bağlantılar liste sayfasının sekmelerine (/entegrasyonlar#<CATS[2]>) ya da özellik sayfasına gider.
const live = (k) => INTEGRATIONS.filter((x) => k(x) && !x.dev);
const nameList = (list, n) => (list.length > n ? `${list.slice(0, n).map((x) => x.name).join(', ')} ve ${list.length - n} ${list === domestic ? 'pazaryeri daha' : 'kanal daha'}` : list.map((x) => x.name).join(', '));
const domestic = live((x) => catOf(x) === 'pazaryeri');
const MM_GROUPS = [
  ['/entegrasyonlar#pazaryerleri', 'i-store', 'c-blue', 'Pazaryeri entegrasyonu', nameList(domestic, 3)],
  ['/entegrasyonlar#e-ticaret', 'i-monitor', 'c-purple', 'E-ticaret sitesi entegrasyonu', `${['ikas', 'woocommerce', 'shopify', 'ticimax'].map((s) => live((x) => x.slug === s)[0]).filter(Boolean).map((x) => x.name).join(', ')} ve diğerleri`],
  ['/entegrasyonlar#hizli-teslimat', 'i-bolt', 'c-pink', 'Hızlı teslimat', live((x) => catOf(x) === 'hizli').map((x) => x.name).join(', ')],
  ['/entegrasyonlar#yurt-disi', 'i-globe', 'c-teal', 'Yurt dışı pazaryerleri', `${live((x) => catOf(x) === 'yurtdisi').map((x) => x.name).sort((a, b) => a.localeCompare(b, 'tr')).join(', ')}`],
  ['/ozellikler/kargo-entegrasyonu', 'i-truck', 'c-orange', 'Kargo entegrasyonu', 'Yurtiçi, Aras, PTT ve 4 kargo firması daha'],
];
// Popüler: yalnız aktif kanallar (site.js'teki TEST / DEV listelerinde olmayanlar ve data.mjs'te beta / dev işaretsizler); önce tercih sırası, sonra diğer aktifler
const SITE_JS = readFileSync(join(OUT, 'assets', 'site.js'), 'utf8');
const jsSet = (name) => new Set(((SITE_JS.match(new RegExp(`\\b${name} = new Set\\(\\[([^\\]]*)\\]`)) || [])[1] || '').match(/[a-z0-9]+/g) || []);
const NOT_LIVE = new Set([...jsSet('TEST'), ...jsSet('DEV')]);
const activeCh = INTEGRATIONS.filter((x) => !x.beta && !x.dev && !NOT_LIVE.has(x.slug));
const MM_POPULAR = [...new Set([...['trendyol', 'hepsiburada', 'n11', 'ikas', 'idefix', 'pazarama'].map((s) => activeCh.find((x) => x.slug === s)).filter(Boolean), ...activeCh])].slice(0, 6);
// Öne çıkan kart görseli: ortadaki "Yeni ürün" kartından panelden ürün yüklenebilen kanallara giden çizgiler (urun-yonetimi notuyla aynı 4 kanal)
const MM_ART = `<svg class="mm-art" viewBox="0 0 280 132" role="img" aria-label="Yeni ürün Trendyol, Hepsiburada, N11 ve idefix'e gönderiliyor">
  <g fill="none" stroke="#9db8ff" stroke-width="1.6" stroke-dasharray="3 4" stroke-linecap="round"><path d="M94 66C72 66 70 26 58 26"/><path d="M94 66C72 66 70 106 58 106"/><path d="M186 66c22 0 24-40 36-40"/><path d="M186 66c22 0 24 40 36 40"/></g>
  <g font-family="inherit" font-weight="800" font-size="12.5" text-anchor="middle" letter-spacing="-.3">
    <rect x="4" y="12" width="70" height="28" rx="14" fill="#fff" stroke="#e3e9f3"/><text x="39" y="30.5" fill="#f27a1a">trendyol</text>
    <rect x="4" y="92" width="70" height="28" rx="14" fill="#fff" stroke="#e3e9f3"/><text x="39" y="110.5" fill="#7b3fe4">n11</text>
    <rect x="206" y="12" width="70" height="28" rx="14" fill="#fff" stroke="#e3e9f3"/><text x="241" y="30.5" fill="#ff6000" font-size="10.5">hepsiburada</text>
    <rect x="206" y="92" width="70" height="28" rx="14" fill="#fff" stroke="#e3e9f3"/><text x="241" y="110.5" fill="#1d4ed8" font-style="italic">idefix</text>
  </g>
  <rect x="94" y="48" width="92" height="36" rx="18" fill="#1f6bff"/><circle cx="113" cy="66" r="10" fill="#fff" fill-opacity=".22"/>
  <path d="M109 63.5 113 61l4 2.5v5l-4 2.5-4-2.5zM109 63.5l4 2.5 4-2.5M113 66v5" fill="none" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>
  <text x="128" y="70.5" fill="#fff" font-family="inherit" font-weight="700" font-size="12">Yeni ürün</text>
</svg>`;
const menuIntegrations = `<div class="dd-p mm" id="mm-int" data-mm-panel><div class="mm-box">
  <div class="mm-body">
    <div class="mm-col mm-groups"><div class="mm-h">Entegrasyon çözümleri</div>${MM_GROUPS.map(([href, icon, color, t, sub]) => `<a class="mi" href="${href}"><span class="ic ${color}">${ico(icon)}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></a>`).join('')}</div>
    <div class="mm-col mm-pop"><div class="mm-h">Popüler</div><div class="mm-tiles">${MM_POPULAR.map((x) => `<a class="mm-tile" href="/entegrasyonlar/${x.slug}">${logoTile(x.word, x.color, 'sm')}<span><b>${esc(x.name)}</b><small>Entegrasyonu</small></span></a>`).join('')}</div></div>
    <a class="mm-feat" href="/ozellikler/urun-yonetimi"><span class="mm-kick">Öne çıkan</span><span class="mm-vis">${MM_ART}</span><b>Tek tuşla yayınla</b><span class="mm-d">Ürünü bir kez girin; Trendyol, Hepsiburada, N11 ve idefix'e tek tuşla gönderin.</span><em>Ürün yönetimini inceleyin ${ico('i-arrow')}</em></a>
  </div>
  <div class="mega-foot mm-foot"><a href="/entegrasyonlar">Tüm entegrasyonlar ${ico('i-arrow')}</a><a href="/iletisim?konu=kanal"><span>Aradığınız yok mu?</span> Kanal talep edin ${ico('i-arrow')}</a><a href="/ozellikler/kargo-entegrasyonu">Kargo firmaları ${ico('i-arrow')}</a></div>
</div></div>`;
const mnavIntegrations = MM_GROUPS.map(([href, , , t, sub]) => `<a class="m-gi" href="${href}">${esc(t)}<small>${esc(sub)}</small></a>`).join('') + '<a class="m-gi m-req" href="/iletisim?konu=kanal">Aradığınız yok mu? Kanal talep edin</a>';
// ---------- Özellikler mega menüsü (Entegrasyonlar ile aynı kalıp: gruplar · araçlar · öne çıkan kart · alt bağlantılar) ----------
// Bağlantılar data.mjs'teki özellik sayfalarına gider (sayfası olmayan slug derlemeyi durdurur). Stok API menüde yer almaz.
const fLink = (slug) => { if (!fById[slug]) throw new Error(`Özellikler menüsü: "${slug}" özellik sayfası yok`); return `/ozellikler/${slug}`; };
const FM_GROUPS = [
  ['siparis-yonetimi', 'Sipariş yönetimi', 'Tüm kanalların siparişleri tek listede'],
  ['stok-senkronizasyonu', 'Stok senkronizasyonu', 'Bir kanalda satılan her yerde düşer'],
  ['urun-yonetimi', 'Ürün yönetimi ve tek tuşla yayınla', 'Kategori eşleştirme, çok kanala yükleme'],
  ['buybox-takibi', 'Buybox ve otomatik fiyat', 'Alt ve üst sınırla rakibe göre fiyat'],
  ['kargo-ve-etiket', 'Kargo ve etiket', 'Ortak barkod, toplu ve termal etiket'],
  ['musteri-sorulari-ve-iadeler', 'Müşteri soruları ve iadeler', 'Hazır cevaplar, iade onayı tek ekranda'],
].map(([slug, t, sub]) => [fLink(slug), fById[slug].icon, fById[slug].color, t, sub]);
const FM_TOOLS = [
  ['kar-zarar', 'i-calc', 'c-purple', 'Kâr hesaplama', 'Sipariş başı net kâr'],
  ['doviz-endeksli-fiyat', 'i-coin', 'c-teal', 'Döviz ile fiyat', 'Kurla otomatik TL'],
  ['raporlar', 'i-chart', 'c-blue', 'Raporlar', 'Satış ve kanal analizi'],
  ['mobil-yonetim', 'i-phone', 'c-green', 'Telefondan yönetim', 'Uygulama gibi çalışır'],
  ['kargo-entegrasyonu', 'i-truck', 'c-orange', 'Kargo firmaları', 'Kendi anlaşmanızla'],
  ['ekip-ve-guvenlik', 'i-users', 'c-pink', 'Personel ve yetkiler', 'Roller, iki adımlı giriş'],
].map(([slug, ...r]) => [fLink(slug), ...r]);
// Öne çıkan kart görseli: üç kanalın siparişleri tek panel listesinde toplanıyor (sipariş satırında kâr: siparis-yonetimi "Satırda kâr")
const FM_ART = `<svg class="mm-art" viewBox="0 0 280 132" role="img" aria-label="Trendyol, Hepsiburada ve N11 siparişleri tek panel listesinde">
  <g fill="none" stroke="#8fd4b0" stroke-width="1.6" stroke-dasharray="3 4" stroke-linecap="round"><path d="M104 27c22 0 22 39 44 39"/><path d="M104 66h44"/><path d="M104 105c22 0 22-39 44-39"/></g>
  <g font-family="inherit" font-weight="800" font-size="9" text-anchor="middle" fill="#fff">
    ${[[13, '#f27a1a', 'T'], [52, '#ff6000', 'hb'], [91, '#7b3fe4', 'n11']].map(([y, c, l]) => `<rect x="4" y="${y}" width="100" height="28" rx="9" fill="#fff" stroke="#dcefe5"/><rect x="10" y="${y + 6}" width="16" height="16" rx="5" fill="${c}"/><text x="18" y="${y + 17}">${l}</text><rect x="32" y="${y + 8}" width="46" height="5" rx="2.5" fill="#cfd8e6"/><rect x="32" y="${y + 16}" width="30" height="4" rx="2" fill="#e5ebf3"/>`).join('')}
  </g>
  <rect x="148" y="8" width="128" height="116" rx="12" fill="#fff" stroke="#c5e6d4"/>
  <path d="M148 20a12 12 0 0 1 12-12h104a12 12 0 0 1 12 12v8H148z" fill="#18a058"/>
  <text x="160" y="22" fill="#fff" font-family="inherit" font-weight="700" font-size="10">Siparişler</text><circle cx="262" cy="18" r="6" fill="#fff" fill-opacity=".25"/><text x="262" y="21" fill="#fff" font-family="inherit" font-weight="800" font-size="8" text-anchor="middle">3</text>
  ${[[38, '#f27a1a'], [64, '#ff6000'], [90, '#7b3fe4']].map(([y, c]) => `<circle cx="162" cy="${y + 8}" r="4" fill="${c}"/><rect x="172" y="${y + 3}" width="44" height="5" rx="2.5" fill="#cfd8e6"/><rect x="172" y="${y + 11}" width="28" height="4" rx="2" fill="#e5ebf3"/><rect x="232" y="${y + 1}" width="34" height="14" rx="7" fill="#e5f7ec"/><text x="249" y="${y + 11}" fill="#138a4b" font-family="inherit" font-weight="750" font-size="8" text-anchor="middle">kâr</text>`).join('')}
</svg>`;
const menuFeatures = `<div class="dd-p mm" id="mm-feat" data-mm-panel><div class="mm-box">
  <div class="mm-body">
    <div class="mm-col mm-groups"><div class="mm-h">Satış yönetimi</div>${FM_GROUPS.map(([href, icon, color, t, sub]) => `<a class="mi" href="${href}"><span class="ic ${color}">${ico(icon)}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></a>`).join('')}</div>
    <div class="mm-col mm-pop"><div class="mm-h">Araçlar</div><div class="mm-tiles">${FM_TOOLS.map(([href, icon, color, t, sub]) => `<a class="mm-tile mm-tool" href="${href}"><span class="ic ${color}">${ico(icon)}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></a>`).join('')}</div></div>
    <a class="mm-feat mm-feat-alt" href="/ozellikler/siparis-yonetimi"><span class="mm-kick">Tek ekran</span><span class="mm-vis">${FM_ART}</span><b>Tüm kanallar tek panelde</b><span class="mm-d">Trendyol, Hepsiburada, N11 ve ikas siparişleri tek listede; her satırda kârınız.</span><em>Sipariş yönetimini inceleyin ${ico('i-arrow')}</em></a>
  </div>
  <div class="mega-foot mm-foot"><a href="/ozellikler">Tüm özellikler ${ico('i-arrow')}</a><a href="/paketler">Fiyatlar ${ico('i-arrow')}</a><a data-demo href="/demo">Canlı demo ${ico('i-arrow')}</a></div>
</div></div>`;
const mnavFeatures = FM_GROUPS.map(([href, , , t, sub]) => `<a class="m-gi" href="${href}">${esc(t)}<small>${esc(sub)}</small></a>`).join('')
  + `<div class="m-tools">${FM_TOOLS.map(([href, , , t]) => `<a href="${href}">${esc(t)}</a>`).join('')}</div>`;
// ---------- Araçlar mega menüsü (aynı kalıp: iki araç grubu · canlı mini KDV kartı · alt bağlantılar) ----------
// Araç sayfaları src/tools.mjs + src/tools-pages.mjs'ten; kanal oranları yalnız sitede aktif görünen pazaryerleri için (panelin başlangıç ayarları, örnek, KDV hariç)
const TOOL_CH = Object.keys(CHANNEL_RATES).map((s) => activeCh.find((x) => x.slug === s)).filter(Boolean).map((x) => [x.slug, x.name, CHANNEL_RATES[x.slug]]);
const tById = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));
const toolIc = (t, cls = 'ic') => (t.brand ? `<span class="${cls} tb" style="background:${t.brand[1]}">${esc(t.brand[0])}</span>` : `<span class="${cls} ${t.color}">${ico(t.icon)}</span>`);
const MENU_TOOLS = { genel: ['kdv-hesaplama', 'desi-hesaplama', 'yuzde-hesaplama', 'satis-fiyati-hesaplama', 'e-ticaret-stopaj-hesaplama', 'indirim-kar-hesaplama'], pazaryeri: ['trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'n11-komisyon-hesaplama', 'pazaryeri-komisyon-hesaplama', 'kar-karsilastirma'] };
const miniKdv = `<div class="mm-feat mm-feat-calc" data-mini-kdv><span class="mm-kick">Hızlı KDV</span><b>Hemen hesaplayın</b>
  <div class="mk"><label class="mk-row"><span class="vh">Tutar</span><input class="mk-in" type="text" inputmode="decimal" autocomplete="off" value="1.000" aria-label="Tutar (₺)"><i>₺</i></label>
    <div class="mk-seg" role="group" aria-label="KDV oranı">${['1', '10', '20'].map((r) => `<button type="button" data-r="${r}" aria-pressed="${r === '20'}">%${r}</button>`).join('')}</div>
    <div class="mk-seg mk-dir" role="group" aria-label="Hesap yönü"><button type="button" data-d="add" aria-pressed="true">KDV ekle</button><button type="button" data-d="remove" aria-pressed="false">KDV ayır</button></div>
    <div class="mk-out" aria-live="polite"><span data-mk-l>KDV dahil</span><b data-mk-o>1.200,00 ₺</b><small data-mk-v>KDV: 200,00 ₺</small></div></div>
  <a class="mm-more" href="/araclar">${TOOLS.length} ücretsiz araç ${ico('i-arrow')}</a></div>`;
const menuTools = `<div class="dd-p mm" id="mm-tools" data-mm-panel><div class="mm-box">
  <div class="mm-body mm-body-tools">
    ${TOOL_GROUPS.map(([g, h], i) => `<div class="mm-col mm-groups${i ? ' mm-sep' : ''}"><div class="mm-h">${esc(h)}</div>${MENU_TOOLS[g].map((s) => tById[s]).map((t) => `<a class="mi" href="/araclar/${t.slug}">${toolIc(t)}<span><b>${esc(t.name)}</b><small>${esc(t.short)}</small></span></a>`).join('')}</div>`).join('')}
    ${miniKdv}
  </div>
  <div class="mega-foot mm-foot"><a href="/araclar">Tüm araçlar ${ico('i-arrow')}</a><a href="/ozellikler/kar-zarar">Panelde otomatik kâr ${ico('i-arrow')}</a><a href="/demo#deneme"><span>Her sipariş için otomatik:</span> 7 gün ücretsiz deneyin ${ico('i-arrow')}</a></div>
</div></div>`;
const mnavTools = TOOL_GROUPS.map(([g, h]) => `<span class="m-cap">${esc(h)}</span><div class="m-tools">${MENU_TOOLS[g].map((s) => tById[s]).map((t) => `<a href="/araclar/${t.slug}">${esc(t.name)}</a>`).join('')}</div>`).join('');
// Durum etiketi: Aktif / Test aşamasında (panelde test bitince site.js "Aktif"e çevirir) / Geliştirme aşamasında (henüz bağlanamaz)
const statusTag = (x) => (x.dev ? '<span class="st dev">Geliştirme aşamasında</span>'
  : x.beta ? `<span class="st test" data-beta="${x.beta}">Test aşamasında</span><span class="st ok" data-beta-on="${x.beta}" hidden>Aktif</span>` : '<span class="st ok">Aktif</span>');
// Kartın tek satırlık özeti: kanalın panelde gerçekten desteklenen işlemleri
const CAP_SHORT = [[/^Sipariş/, 'Sipariş'], [/^Stok ve fiyat/, 'Stok ve fiyat'], [/^Ürün (yükleme|oluşturma)/, 'Ürün yükleme'], [/^Kargo etiketi/, 'Kargo etiketi', (v) => ['Ortak barkod', 'ikas Kargo', 'Panel etiketi'].includes(v)],
  [/takip bildirimi|^Kargo bildirimi/, 'Kargo takibi'], [/kuryeye/, 'Kurye teslimi'], [/soru/i, 'Müşteri soruları'], [/^İade/, 'İade'], [/^Hakediş/, 'Hakediş'], [/^Buybox/, 'Buybox'], [/^Döviz/, 'Döviz fiyat']];
const capShort = (x) => CAP_SHORT.filter(([re, , ok]) => x.caps.some(([k, v]) => re.test(k) && v !== false && (!ok || ok(v)))).map(([, l]) => l).slice(0, 4).join(' · ');
const chCard = (x) => `<a class="ch${x.dev ? ' is-dev' : ''}" href="/entegrasyonlar/${x.slug}" data-cat="${catOf(x)}" data-q="${esc(`${x.name} ${x.word} ${x.kind}`)}">${logoTile(x.word, x.color)}
  <span class="ch-n"><b>${esc(x.name)}</b><small>${esc(x.kind)}</small></span><span class="ch-d">${esc(capShort(x))}</span>
  <span class="ch-f">${statusTag(x)}<em>${x.dev ? 'İncele' : 'Ayrıntılar'} ${ico('i-arrow')}</em></span></a>`;
const integrationCards = INTEGRATIONS.map(chCard).join('\n');
const integrationTabs = `<button type="button" class="ftab" data-f="all" aria-pressed="true">Tümü <span data-n="all"></span></button>${CATS.map(([id, l, h]) => `<button type="button" class="ftab" data-f="${id}" data-h="${h}" aria-pressed="false">${l} <span data-n="${id}"></span></button>`).join('')}`;
const TAB_FEATURES = ['siparis-yonetimi', 'kargo-ve-etiket', 'stok-senkronizasyonu', 'urun-yonetimi', 'buybox-takibi', 'kar-zarar', 'raporlar', 'musteri-sorulari-ve-iadeler', 'mobil-yonetim'];
const featureTabs = () => { const list = TAB_FEATURES.map((s) => fById[s]); return `<div class="ftabs" data-ftabs>
  <div class="ft-list" role="tablist">${list.map((f, i) => `<button type="button" role="tab" data-i="${i}" class="${i ? '' : 'on'}" aria-selected="${!i}"><span class="ic ${f.color}">${ico(f.icon)}</span><span>${esc(f.name)}</span></button>`).join('')}</div>
  <div class="ft-panels">${list.map((f, i) => `<div class="ft-p" data-p="${i}"${i ? ' hidden' : ''}>
    <div class="ft-txt"><div class="kicker">${esc(f.name)}</div><h3>${esc(f.h1[0])} <span class="grad">${esc(f.h1[1])}</span></h3><p>${esc(f.lead)}</p>
      <ul>${f.points.slice(0, 4).map(([, t, d]) => `<li>${tick}<span><b>${esc(t)}</b> ${esc(d)}</span></li>`).join('')}</ul>
      <a class="btn btn-primary" href="/ozellikler/${f.slug}">Nasıl çalışır, ne kazandırır? ${ico('i-arrow')}</a></div>
    <div class="ft-vis">${f.img ? `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>panel.hasturkcrm.com</span></div><img src="/img/${f.img}.jpg?v=2610" width="1440" height="900" alt="${esc(f.name)} ekranı" loading="lazy"></div>` : MOCKS[f.mock]}</div>
  </div>`).join('')}</div>
</div>`; };

// ---------- ortak parçalar ----------
const browser = (img, alt) => `<div class="browser"><div class="bar"><i></i><i></i><i></i><span>panel.hasturkcrm.com</span></div><img src="/img/${img}.jpg?v=2610" width="1440" height="900" alt="${esc(alt)}"></div>`;
const MOCKS = {
  fx: `<div class="mockcard"><div class="mc-h"><b>Döviz kurları</b><span class="pill">TCMB · günlük</span></div>
    ${[['#1f6feb', '$', 'ABD doları', '34,12 ₺', 'USD 49,90 → 1.702,59 ₺'], ['#0e9f6e', '€', 'Euro', '37,48 ₺', 'EUR 39,00 → 1.461,72 ₺'], ['#7c3aed', '£', 'Sterlin', '44,61 ₺', 'GBP 25,00 → 1.115,25 ₺']].map(([c, b, n, r, ex]) => `<div class="mc-row"><span class="b" style="background:${c}">${b}</span><div><b>${n} · ${r}</b><small>${ex}</small></div><span class="mc-btn">Güncel</span></div>`).join('')}
    <div class="mc-note">Örnek görünüm · kanal fiyatları kurla kendiliğinden güncellenir</div></div>`,
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
const heroChecks = `<div class="checks"><span>${tick}7 gün ücretsiz deneme</span><span>${tick}Kurulum ücreti yok</span><span>${tick}Telefondan da yönetin</span></div>`;

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
      <p>Kural: en düşük fiyat <b>180 ₺</b>, en yüksek fiyat <b>230 ₺</b>, adım <b>1 ₺</b>. Panel gün boyu düzenli olarak kontrol eder ve yalnız gerektiğinde fiyatı değiştirir.</p>
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
  return { meta: { title: f.seoTitle || f.title, crumb: f.name, description: f.desc || clip(f.lead), url: `/ozellikler/${f.slug}`, nav: 'ozellikler' }, body, file: `ozellikler/${f.slug}.html` };
}

// ---------- entegrasyon sayfası arama metinleri (kanalın gerçek özelliklerinden üretilir; söz verdiğimiz kadar) ----------
// Türkçe ekler (ilgi / yönelme / ayrılma): okunuşa göre (N11 → "en on bir", PttAVM → "pe te te a ve me")
const SUF = { trendyol: ['un', 'a', 'dan'], hepsiburada: ['nın', 'ya', 'dan'], n11: ['in', 'e', 'den'], ikas: ['ın', 'a', 'tan'], woocommerce: ['ın', 'a', 'tan'], pttavm: ['nin', 'ye', 'den'],
  idefix: ['in', 'e', 'ten'], pazarama: ['nın', 'ya', 'dan'], amazon: ['un', 'a', 'dan'], ciceksepeti: ['nin', 'ye', 'den'], koctas: ['ın', 'a', 'tan'], shopify: ['ın', 'a', 'dan'], opencart: ['ın', 'a', 'tan'], etsy: ['nin', 'ye', 'den'], teknosa: ["nın", "ya", "dan"], boyner: ["in", "e", "den"], pasaj: ["ın", "a", "dan"], trendyolgo: ["nun", "ya", "dan"], getir: ["nın", "ya", "dan"], yemeksepeti: ["in", "e", "ten"], ebay: ["in", "e", "den"], ozon: ["un", "a", "dan"], ticimax: ["in", "e", "ten"], ideasoft: ["un", "a", "tan"], tsoft: ["un", "a", "tan"] };
const sx = (x, i) => `${x.name}'${(SUF[x.slug] || ['in', 'e', 'den'])[i]}`;
const capOn = (x, re) => x.caps.some(([k, v]) => re.test(k) && v !== false);
const capVal = (x, re) => (x.caps.find(([k]) => re.test(k)) || [])[1];
const minPrice = Math.min(...S.plans.filter((p) => p.monthly).map((p) => p.monthly));
function intDesc(x) {
  const parts = ['siparişlerinizi', capOn(x, /^Stok/) && 'stoklarınızı', capOn(x, /^Stok/) && 'fiyatlarınızı', capOn(x, /^Kargo etiketi/) && 'kargo etiketlerini', capOn(x, /soru/i) && 'müşteri sorularını'].filter(Boolean);
  const and = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} ve ${a[a.length - 1]}` : a[0]);
  const t = `${x.name} entegrasyonu: ${and(parts)} tek panelden yönetin. Kolay kurulum, 7 gün ücretsiz deneme.`;
  return t.length <= 158 ? t : clip(x.lead);
}
function intIntro(x) {
  const on = x.caps.filter(([, v]) => v !== false).map(([k]) => k.toLocaleLowerCase('tr'));
  const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} ve ${a[a.length - 1]}` : a.join(''));
  const where = /pazaryeri/.test(x.kind) ? `${x.name} pazaryerindeki mağazanızı` : /market/.test(x.kind) ? `${x.name} mağazanızı` : `${x.name} sitenizi`;
  return [
    `Hastürk CRM, ${where} resmi entegrasyon servisi üzerinden bağlar. ${x.name} siparişleriniz otomatik olarak panele gelir; diğer pazaryerleri ve e-ticaret sitelerinizin siparişleriyle aynı listede, tek ekranda yönetilir.`,
    `${x.name} entegrasyonunda desteklenen işlemler: ${list(on)}.`,
    `Ürünleriniz barkod ve stok koduyla eşleşir; bir kanalda satılan ürünün stoğu ${capOn(x, /^Stok/) ? `${x.name} dahil ` : ''}stok gönderimi açık tüm kanallarda düşer, böylece fazla satış yaşamazsınız. Komisyon, kargo ve diğer kesintilerle her siparişin gerçek kârını da aynı panelde görürsünüz.`,
  ];
}
const isSite = (x) => /site/.test(x.kind);
const where = (x) => (isSite(x) ? `${x.name} sitenizde` : `${x.name} mağazanızda`);
function intFaq(x) {
  if (x.dev) {
    const on = x.caps.filter(([, v]) => v !== false).map(([k]) => k.toLocaleLowerCase('tr'));
    return [
      [`${x.name} entegrasyonu şu an kullanılabiliyor mu?`, `Henüz değil. ${x.name} entegrasyonu geliştirme aşamasında; kullanıma açıldığında panelinizdeki Entegrasyonlar sayfasından bağlayabilirsiniz.`],
      [`${x.name} entegrasyonunda neler olacak?`, `Planlanan işlemler: ${on.length > 1 ? `${on.slice(0, -1).join(', ')} ve ${on[on.length - 1]}` : on.join('')}.`],
      ['Kullanıma açılınca haber alabilir miyim?', `Evet. İletişim sayfasından ${x.name} için talep bırakın; entegrasyon açıldığında size haber verelim.`],
      ['Bu arada diğer kanallarımı bağlayabilir miyim?', 'Evet. Aktif kanallarınızı bugün bağlayıp 7 gün ücretsiz deneyebilirsiniz; kurulum ücreti yoktur.'],
    ];
  }
  const lbl = capVal(x, /^Kargo etiketi/);
  const ship = lbl === 'Ortak barkod' ? `${sx(x, 0)} anlaşmalı kargosuyla gönderimde barkod doğrudan ${sx(x, 2)} alınır; etiketi panelden termal ya da normal yazıcıya tek tek veya toplu basarsınız.`
    : lbl === 'ikas Kargo' ? 'Gönderi ikas Kargo ile oluşturulur ve etiket ikas\'tan alınır. Kendi kargo anlaşmanızla gönderiyorsanız Kurumsal pakette Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL eCommerce ya da Sürat Kargo\'dan etiketi doğrudan panelden alabilirsiniz.'
    : lbl === 'Panel etiketi' ? 'Kargo etiketi sipariş ve adres bilgisiyle panelden basılır. Kendi kargo anlaşmanızla gönderiyorsanız Kurumsal pakette Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL eCommerce ya da Sürat Kargo\'dan etiket ve takip numarasını doğrudan panelden alabilirsiniz.'
    : lbl ? `Kargo etiketi: ${lbl}.` : '';
  const courier = capOn(x, /kuryeye/) && [`${x.name} siparişlerini kim teslim eder?`, `Kurye ${x.name} platformundan gelir. Siz siparişi hazırlayıp panelden “hazırlandı” olarak bildirirsiniz.`];
  const track = !ship && capOn(x, /takip bildirimi|^Kargo bildirimi/) && [`Kargo takip numarası ${sx(x, 1)} nasıl iletilir?`, `Siparişi kendi kargo anlaşmanızla gönderin; kargo firması ve takip numarası panelden ${sx(x, 1)} bildirilir.`];
  return [
    [`${x.name} entegrasyonu nasıl yapılır?`, `${x.help} Ardından Hastürk CRM panelinde Entegrasyonlar sayfasındaki ${x.name} kartına bilgileri girip “Kaydet ve test et”e basın. Bağlantı hemen test edilir; siparişleriniz ve ürünleriniz birkaç dakika içinde gelmeye başlar.`],
    capOn(x, /^Stok/) && [`${x.name} stok ve fiyatlarım otomatik güncellenir mi?`, `Evet. Stok gönderimini açtığınızda bir kanalda satılan ürünün stoğu ${where(x)} da kendiliğinden düşer; panelde değiştirdiğiniz fiyat ve stoklar otomatik olarak ${sx(x, 1)} gönderilir.`],
    courier || (ship && [`${x.name} siparişlerinin kargo etiketi nasıl alınır?`, ship]) || track,
    capOn(x, /^Ürün (yükleme|oluşturma)/) && [`Ürünlerimi panelden ${x.name} ${isSite(x) ? 'siteme' : 'mağazama'} yükleyebilir miyim?`, `Evet. Ürünü panelde bir kez tanımlayın; kategori ve özellik eşleştirmesiyle ${sx(x, 1)} gönderin. Görseller, varyantlar ve fiyat da birlikte gider.`],
    [`Birden fazla ${x.name} ${isSite(x) ? 'sitesi' : 'mağazası'} bağlayabilir miyim?`, `Evet. Birden fazla ${x.name} ${isSite(x) ? 'sitenizi' : 'mağazanızı'} aynı panelde ayrı mağazalar olarak bağlayabilirsiniz. Bağlanabilecek mağaza sayısı paketinize göre değişir; gerekirse ek mağaza alabilirsiniz.`],
    [`${x.name} entegrasyonu ücretli mi?`, `${x.name} entegrasyonu tüm paketlerde yer alır. Paketler aylık ${minPrice.toLocaleString('tr-TR')} ₺'den (KDV dahil) başlar; kurulum ücreti yoktur ve 7 gün ücretsiz deneyebilirsiniz.`],
  ].filter(Boolean).slice(0, 6);
}

// "Neler yapabilirsiniz" kutuları: yalnız kanalın caps listesinde açık olan işlemlerden üretilir (söz verdiğimizden fazlası yazılmaz)
function capTiles(x) {
  const n = x.name, T = [], has = (re) => capOn(x, re), pt = (icon) => x.points.find(([i]) => i === icon);
  T.push(['i-cart', 'Sipariş yönetimi', `${n} siparişleri kendiliğinden panele gelir${has(/onay/) ? '; panelden onaylar,' : ' ve'} diğer kanallarla aynı listede yönetirsiniz.`]);
  if (has(/^Stok ve fiyat/)) T.push(['i-sync', 'Stok ve fiyat eşitleme', `Bir kanalda satılan ürünün stoğu ${where(x)} da düşer; fiyat değişiklikleri panelden gönderilir.`]);
  if (has(/^Ürün yükleme/)) T.push(['i-up', 'Ürün yükleme', `Ürünü panelde bir kez tanımlayın; görsel, varyant ve fiyatıyla ${sx(x, 1)} gönderin.`], ['i-list', 'Kategori eşleştirme', `Panel ${n} için uygun kategoriyi önerir, siz onaylarsınız.`]);
  if (has(/^Ürün oluşturma/)) T.push(['i-up', 'Ürün oluşturma', `Paneldeki ürünleri ${n} sitenizde oluşturun.`]);
  if (has(/^Ana katalog/) && pt('i-box')) T.push(['i-box', 'Ana katalog', pt('i-box')[2]]);
  const lbl = capVal(x, /^Kargo etiketi/);
  if (lbl === 'Ortak barkod') T.push(['i-tag', 'Kargo etiketi', `Anlaşmalı kargo barkodu ${sx(x, 2)} alınır; etiketi panelden tek tek ya da toplu basarsınız.`]);
  else if (lbl === 'ikas Kargo') T.push(['i-tag', 'ikas Kargo', 'Gönderi ikas Kargo ile oluşturulur, etiket ikas\'tan gelir; takip numarası siparişe işlenir.']);
  else if (lbl === 'Panel etiketi') T.push(['i-tag', 'Kargo etiketi', 'Kendi kargo anlaşmanızla gönderimde etiket, sipariş ve adres bilgisiyle panelden basılır.']);
  else if (lbl && pt('i-truck')) T.push(['i-truck', 'Kargo', pt('i-truck')[2]]);
  if (has(/takip bildirimi|^Kargo bildirimi/)) T.push(['i-truck', 'Kargo takip bildirimi', `Kargo firması ve takip numarası panelden ${sx(x, 1)} bildirilir.`]);
  if (has(/kuryeye/)) T.push(['i-truck', 'Hazırlama ve kurye', 'Sipariş hazırlanınca panelden bildirirsiniz; kurye platformdan gelir.']);
  if (has(/^Paket bölme|^Kargo firması değiştirme/)) T.push(['i-box', 'Paket işlemleri', `Paketi bölün${has(/iptal/) ? ' ya da iptal edin' : ''}; gerekirse kargo firmasını panelden değiştirin.`]);
  if (has(/^Müşteri soruları/)) T.push(['i-chat', 'Müşteri soruları', `${n} müşteri sorularını diğer kanallarla aynı ekranda yanıtlayın.`]);
  if (has(/^İade/)) T.push(['i-orders', 'İade talepleri', 'İade taleplerini panelden onaylayın ya da gerekçesiyle reddedin.']);
  if (has(/^Hakediş/)) T.push(['i-calc', 'Gerçek kâr', `Komisyon, kargo ve hizmet bedeli faturaları ile hakedişler ${sx(x, 2)} çekilir; her siparişin net kârı hesaplanır.`]);
  if (has(/^Buybox/)) T.push(['i-chart', 'Buybox ve otomatik fiyat', 'Buybox durumunu izleyin; kural tanımladığınız ilanlarda fiyat, alt sınırınızın altına inmeden ayarlanır.']);
  if (has(/^Birden fazla site/)) T.push(['i-store', 'Birden fazla site', `Birden fazla ${n} sitenizi ayrı mağazalar olarak bağlayın.`]);
  if (has(/FBA/)) T.push(['i-eye', 'Amazon\'un gönderdiği siparişler', 'Amazon deposundan gönderilen (FBA) siparişlerin durumu da panelde izlenir.']);
  if (has(/^Döviz/)) T.push(['i-calc', 'Döviz ile fiyat', 'Fiyatları döviz kuruna bağlayın; kur değişince kendiliğinden güncellenir. Kurumsal pakette.']);
  // Kanala özel bilgiler (ör. yeni ilanın kanal panelinden açılması, alıcı bilgisi, bağlantı dosyası)
  for (const [i, t, d] of x.points) if (i === 'i-shield' || i === 'i-link' || (i === 'i-box' && !has(/^Ana katalog|^Paket bölme/))) T.push([i, t, d]);
  return T;
}

function integrationPage(x) {
  const cap = ([k, v]) => `<li class="${v === false ? 'no' : ''}">${v === false ? `<i class="x">${ico('i-minus')}</i>` : tick}<span>${esc(k)}</span>${typeof v === 'string' ? `<em>${esc(v)}</em>` : v === false ? '<em class="muted">yok</em>' : ''}</li>`;
  const cat = catOf(x);
  const rel = [...INTEGRATIONS.filter((o) => o.slug !== x.slug && catOf(o) === cat && !o.dev), ...INTEGRATIONS.filter((o) => o.slug !== x.slug && catOf(o) !== cat && !o.dev)].slice(0, 8);
  const colors = ['c-blue', 'c-green', 'c-purple', 'c-orange', 'c-teal', 'c-pink'];
  const ctas = x.dev
    ? `<a class="btn btn-primary" href="/iletisim?konu=kanal">Açılınca haber verin ${ico('i-arrow')}</a><a class="btn btn-line" data-demo href="/demo">Canlı demo</a>`
    : `<a class="btn btn-primary" href="/demo#deneme">Ücretsiz deneyin ${ico('i-arrow')}</a><a class="btn btn-line" data-demo href="/demo">Canlı demo</a>`;
  const steps = [
    ['i-key', 'API bilgilerini girin', `${n2(x)} aldığınız bilgileri panelde Entegrasyonlar sayfasına yapıştırın; bağlantı hemen test edilir.`],
    ['i-link', 'Ürünler eşleşir', 'İlanlarınız barkod ve stok koduyla paneldeki ürünlere kendiliğinden bağlanır.'],
    ['i-sync', 'Siparişler ve stok otomatik', `Siparişler panele gelir; stok ve fiyat değişiklikleri ${sx(x, 1)} kendiliğinden gönderilir.`],
  ];
  const body = `<section class="page-hero fp-hero int-hero">
  <div class="wrap fp-grid">
    <div class="txt">
      <nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span><a href="/entegrasyonlar">Entegrasyonlar</a><span>›</span><b>${esc(x.name)}</b></nav>
      <div class="int-logo">${logoTile(x.word, x.color, 'lg')}${statusTag(x)}</div>
      <h1>${esc(x.name)} <span class="grad">entegrasyonu</span></h1>
      <p>${esc(x.lead)}</p>
      ${x.dev ? `<p class="beta-note"><b>Geliştirme aşamasında:</b> ${esc(x.name)} entegrasyonu hazırlanıyor ve henüz bağlanamıyor. Kullanıma açıldığında panelinizdeki Entegrasyonlar sayfasından bağlayabilirsiniz.</p>` : ''}
      ${x.beta ? `<p class="beta-note" data-beta="${x.beta}"><b>Test aşamasında:</b> ${esc(x.name)} entegrasyonu panelde kullanıma açıktır, son testleri sürmektedir. Kurulumda ilk siparişlerinizi ve stoklarınızı birlikte kontrol ederiz.</p>` : ''}
      <div class="ctas">${ctas}</div>
      ${heroChecks}
    </div>
    <div class="vis"><div class="capcard"><div class="cc-h"><b>${x.dev ? 'Planlanan işlemler' : 'Desteklenen işlemler'}</b><small>${esc(x.name)} resmi entegrasyon servisi</small></div><ul>${x.caps.filter(([, v]) => v !== false).map(cap).join('')}</ul></div></div>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">${x.dev ? 'Kullanıma açıldığında' : `${esc(x.name)} ile`}</div><h2>Neler Yapabilirsiniz?</h2></div>
    <div class="feats">${capTiles(x).map(([i, t, d], k) => `<div class="feat reveal"><span class="ic ${colors[k % 6]}">${ico(i)}</span><div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`).join('')}</div>
  </div>
</section>
<section class="sec alt">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">${x.dev ? 'Kullanıma açıldığında' : 'Kurulum'}</div><h2>Nasıl Çalışır?</h2></div>
    <div class="how three">${steps.map(([i, t, d]) => `<div class="hs reveal"><div class="ic">${ico(i)}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div>
    ${x.dev ? '' : '<p class="how-note reveal">Kurulumda yanınızdayız; ilk siparişlerinizi birlikte kontrol ederiz.</p>'}
  </div>
</section>
${x.dev ? '' : `<section class="sec">
  <div class="wrap narrow-text">
    <div class="sec-head reveal"><div class="kicker">${esc(x.name)} entegrasyonu nedir?</div><h2>${esc(x.name)} ${isSite(x) ? 'Sitenizi' : 'Mağazanızı'} Tek Panelden Yönetin</h2></div>
    ${intIntro(x).filter((_, i) => i !== 1).map((t) => `<p class="reveal seo-p">${esc(t)}</p>`).join('')}
  </div>
</section>`}
<section class="sec${x.dev ? '' : ' alt'}">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">Sık sorulanlar</div><h2>${esc(x.name)} Entegrasyonu Hakkında</h2></div>${faqHtml(intFaq(x))}
  </div>
</section>
<section class="sec${x.dev ? ' alt' : ''}">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">Diğer entegrasyonlar</div><h2>Tüm Kanallarınız Tek Panelde</h2><p>Stok ve fiyat bağladığınız tüm kanallarda eşit kalır.</p></div>
    <div class="rels">${rel.map((o) => `<a class="rl" href="/entegrasyonlar/${o.slug}">${logoTile(o.word, o.color, 'sm')}<span><b>${esc(o.name)}</b><small>${esc(o.kind)}</small></span></a>`).join('')}</div>
    <div class="center-cta"><a class="btn btn-line" href="/entegrasyonlar">Tüm entegrasyonlar ${ico('i-arrow')}</a></div>
  </div>
</section>
<section class="sec"><div class="wrap"><div class="ask big reveal"><div>${x.dev ? `<b>${esc(x.name)} açılınca haber verelim</b><span>Talebinizi bırakın; entegrasyon kullanıma açıldığında size ulaşalım. Bu arada demo panelini kayıt olmadan inceleyebilirsiniz.</span>` : `<b>${esc(x.name)} ${isSite(x) ? 'sitenizi' : 'mağazanızı'} bugün bağlayın</b><span>7 gün ücretsiz deneyin; kurulum ücreti yok, kurulumda yanınızdayız.</span>`}</div>
  <div class="ctas">${ctas}</div></div></div></section>`;
  const desc = x.dev ? `${x.name} entegrasyonu geliştirme aşamasında: siparişler, stok ve fiyat tek panelde olacak. Kullanıma açılınca haber verelim.` : x.desc || intDesc(x);
  return { meta: { title: x.seoTitle || `${x.name} Entegrasyonu: Sipariş, Stok ve Fiyat | Hastürk CRM`, crumb: `${x.name} Entegrasyonu`, description: clip(desc), url: `/entegrasyonlar/${x.slug}`, nav: 'entegrasyonlar' }, body, file: `entegrasyonlar/${x.slug}.html` };
}
// "Trendyol satıcı panelinizden" / "ikas yönetim panelinizden"
const n2 = (x) => `${x.name} ${isSite(x) ? 'yönetim' : 'satıcı'} panelinizden`;

// ---------- ücretsiz hesaplama araçları: /araclar ve /araclar/<slug> ----------
// Kategori komisyon listeleri (yalnız resmî listeden üretilmiş public/assets/komisyon-<pazaryeri>.json varsa; yoksa elle oran)
const COMM = Object.fromEntries(Object.keys(MARKETPLACES).map((mp) => [mp, loadCommission(join(OUT, 'assets'), mp)]).filter(([, d]) => d)
  .map(([mp, d]) => [mp, { ...d, src: `/assets/${commFile(mp)}?v=${createHash('sha1').update(readFileSync(join(OUT, 'assets', commFile(mp)))).digest('hex').slice(0, 10)}` }]));
const TP = makeToolPages({ esc, ico, tick, faqHtml, toolIc, channels: TOOL_CH, comm: COMM, siteUrl: SITE_URL });
// Ana sayfa bölümü: canlı mini net kâr hesabı + araç kartları
const HOME_TOOLS = ['trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'kar-karsilastirma', 'satis-fiyati-hesaplama', 'kdv-hesaplama', 'desi-hesaplama'];
const toolsHome = `<div class="tools-home">
  <div class="th-calc reveal"><div class="th-h">${ico('i-calc')}<b>Hızlı net kâr</b><span class="pill">Canlı</span></div>${miniProfit()}<a class="th-more" href="/araclar/pazaryeri-komisyon-hesaplama">Ayrıntılı komisyon hesabı ${ico('i-arrow')}</a></div>
  <div class="th-list">${HOME_TOOLS.map((s) => tById[s]).map((t) => `<a class="th-i reveal" href="/araclar/${t.slug}">${toolIc(t)}<span><b>${esc(t.name)}</b><small>${esc(t.short)}</small></span>${ico('i-arrow')}</a>`).join('')}</div>
</div>`;

// ---------- arama motoru verisi (JSON-LD) ----------
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pageName = (meta) => meta.crumb || meta.title.split(/ [—|] /)[0];
const SECTIONS = { ozellikler: 'Özellikler', entegrasyonlar: 'Entegrasyonlar', araclar: 'Araçlar' };
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
  // Sayfaya özel ek veri (araçlar: WebApplication, HowTo, Dataset …) ve son güncelleme tarihi
  if (meta.ld) graph.push(...meta.ld);
  if (meta.modified) page.dateModified = meta.modified;
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
    .replace('{{featureCards}}', featureCards).replace('{{phoneMock}}', MOCKS.phone).replace('{{featureTabs}}', body.includes('{{featureTabs}}') ? featureTabs() : '').replace('{{integrationCards}}', integrationCards).replace('{{integrationTabs}}', integrationTabs).replace('{{menuFeatures}}', menuFeatures).replace('{{menuIntegrations}}', menuIntegrations).replace('{{mnavFeatures}}', mnavFeatures).replace('{{mnavIntegrations}}', mnavIntegrations)
    .replace('{{menuTools}}', menuTools).replace('{{mnavTools}}', mnavTools).replace('{{toolsHome}}', toolsHome)
    .replace(/{{v:([a-z0-9.-]+)}}/g, (_, f) => ver[f]).replace('{{robots}}', meta.sitemap === 'no' ? 'noindex, follow' : ROBOTS)
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
for (const dir of ['ozellikler', 'entegrasyonlar', 'araclar']) await mkdir(join(OUT, dir), { recursive: true });
for (const g of [...FEATURES.map(featurePage), ...INTEGRATIONS.map(integrationPage), ...TP.pages()]) {
  await writeFile(join(OUT, g.file), render(g.meta, g.body, g.file.includes('/') ? g.file.split('/')[0] + '-detay' : g.file.replace(/\.html$/, '')));
  pages.push({ file: g.file, ...g.meta });
}
// Blog sayfa kalıbı (src/worker.js sunucuda doldurur): aynı üst menü / alt bilgi, yer tutucular {{T}} başlık, {{D}} açıklama, {{U}} adres,
// {{R}} robots, {{O}} og:type, {{I}}/{{IW}}/{{IH}}/{{IA}} paylaşım görseli, {{J}} JSON-LD, {{H}} ek head, {{B}} gövde
{
  const SENT = { title: '\u0001T\u0001', description: '\u0001D\u0001', url: '\u0001U\u0001' };
  let shell = layout.replace('{{sprite}}', sprite).replace('{{head}}', `<link rel="stylesheet" href="/assets/blog.css?v=${createHash('sha1').update(readFileSync(join(OUT, 'assets', 'blog.css'))).digest('hex').slice(0, 10)}">\u0001H\u0001`).replace('{{body}}', '\u0001B\u0001')
    .replace('{{menuFeatures}}', menuFeatures).replace('{{menuIntegrations}}', menuIntegrations).replace('{{mnavFeatures}}', mnavFeatures).replace('{{mnavIntegrations}}', mnavIntegrations)
    .replace('{{menuTools}}', menuTools).replace('{{mnavTools}}', mnavTools).replace('{{toolsHome}}', toolsHome)
    .replace(/{{v:([a-z0-9.-]+)}}/g, (_, f) => ver[f]).replace('{{robots}}', '\u0001R\u0001').replace('{{jsonld}}', '\u0001J\u0001')
    .replace(/{{title}}/g, SENT.title).replace(/{{description}}/g, SENT.description).replace(/{{url}}/g, SENT.url).replace(/{{page}}/g, 'blog')
    .replace('<meta property="og:type" content="website">', '<meta property="og:type" content="\u0001O\u0001">')
    .replace(/https:\/\/hasturkcrm\.com\/img\/genel-bakis\.jpg/g, '\u0001I\u0001').replace('content="1440"', 'content="\u0001IW\u0001"').replace('content="900"', 'content="\u0001IH\u0001"')
    .replace('content="Hastürk CRM panelinin genel bakış ekranı"', 'content="\u0001IA\u0001"')
    .replace(/data-nav="blog"/g, 'data-nav="blog" class="on" aria-current="page"');
  // Sayfadaki (statik) {{…}} benzeri metinler önce kaçışlanır, sonra yer tutucular {{X}} biçimine çevrilir
  shell = shell.replace(/\{\{/g, '{\u200b{').replace(/\u0001([A-Z]+)\u0001/g, '{{$1}}');
  await writeFile(join(SRC, 'blog-shell.mjs'), `// node build.mjs üretir; elle düzenlemeyin (kaynak: src/layout.html)\nexport const SHELL = ${JSON.stringify(shell)};\nexport const PANEL_URL = ${JSON.stringify(S.panelUrl || 'https://panel.hasturkcrm.com')};\nexport const SITE_URL = ${JSON.stringify(SITE_URL)};\nexport const ORG = ${JSON.stringify(ORG)};\n`);
}
pages.push({ file: 'blog', url: '/blog' });
const today = new Date().toISOString().slice(0, 10);
const urls = pages.filter((p) => p.sitemap !== 'no').map((p) => `  <url><loc>https://hasturkcrm.com${p.url}</loc><lastmod>${p.modified || today}</lastmod></url>`).join('\n');
await writeFile(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`${pages.length} sayfa derlendi`);
