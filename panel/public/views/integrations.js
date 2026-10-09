// Entegrasyonlar: pazaryeri ve site API bilgileri panelden girilir/değiştirilir (sunucuda şifreli saklanır),
// bağlantı test edilir, kanal aktif/pasif yapılır; son başarılı senkron zamanları, hatalar ve geçmiş sipariş aktarımı buradadır.
import { api, state, html, render, $, $$, n, ago, date, dateTime, ch, chLogo, chState, actions, busy, toast, confirmBox, dayKey, isAdmin, popMenu, sheet } from '../core.js';
import { loadSummary } from '../app.js';
import { importDialog } from './products.js';
import { diagnoseDialog, systemCheck } from './diagnose.js';
import { listingErrorsSheet } from './listerrs.js';

const HELP = {
  ikas: 'ikas paneli → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma). Görseller ve varyantlar ürünlerle birlikte gelir.',
  trendyol: 'Trendyol satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri.',
  hepsiburada: 'Hepsiburada Merchant Portal → Hesabım → Entegrasyon: Merchant ID, servis anahtarı ve entegratör adı (User-Agent olarak gönderilir; girilmezse Hepsiburada istekleri reddeder).',
  pttavm: 'PttAVM satıcı paneli → mağaza adınızın altında Hesap Yönetimi → Entegrasyon Bilgileri: entegratörler arasından Hastürk\'ü seçip Ekle / Görüntüle → API Key ve Token\'ı kopyalayın. (PttAVM token doğrulamasını zorunlu yaptı; eski kullanıcı adı / şifre girişi kapanıyor.) Kargo barkodu mağazanızın deposuyla alınır.',
  n11: 'N11 Satıcı Ofisi (so.n11.com) → Hesabım → API Hesapları → Yeni Hesap Oluştur; App Key ve App Secret e-postayla gelir.',
  idefix: 'idefix satıcı paneli → Hesap Bilgileri → Entegrasyon Bilgileri → Yeni API Oluştur (API Key, API Secret) ve Vendor ID.',
  pazarama: 'Pazarama iş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri (API Key = Client ID, API Secret). API Secret 1 yıl geçerlidir; süresi dolunca Pazarama panelinden yenisini oluşturup buraya girin.',
  amazon: 'Amazon Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme: özel (private) SP-API uygulaması oluşturun, kendi mağazanız için yetkilendirin; LWA Client ID / Secret ve refresh token buradan alınır. Siparişler, stok, fiyat ve kargo bildirimi (takip no) desteklenir; alıcı adres bilgisini Amazon kısıtlı veri olarak verir.',
  ciceksepeti: 'Çiçeksepeti satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri → API anahtarı. Siparişler, ürünler, stok ve fiyat; kargo Çiçeksepeti anlaşmasıyla, etiket Çiçeksepeti panelinden.',
  koctas: 'Koçtaş pazaryeri (Mirakl satıcı paneli) → sağ üst kullanıcı menüsü → API Anahtarı. Siparişleri onaylama, kargo/takip bildirimi, stok ve fiyat desteklenir.',
  shopify: 'Shopify yönetimde yeni özel uygulama oluşturmayı kapattı; uygulama Dev Dashboard\'dan açılır: dev.shopify.com → Dev Dashboard → Uygulama oluştur → kapsamlar: read_orders, read_all_orders, write_products, write_inventory, read_locations, write_merchant_managed_fulfillment_orders, write_fulfillments → uygulamayı mağazanıza kurun → Ayarlar\'daki Client ID ve Client secret\'ı girin (panel 24 saatlik erişim belirtecini kendisi yeniler). Eski shpat_… belirteciniz varsa Gelişmiş ayarlar\'a girebilirsiniz.',
  woocommerce: 'WordPress yönetimi → WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle (İzin: Okuma/Yazma). Site HTTPS olmalı; kalıcı bağlantılar "Yazı adı" gibi açık olmalı.',
  opencart: 'OpenCart\'ın hazır bir yönetim API\'si olmadığından bağlantı küçük bir PHP dosyasıyla kurulur: Bağlantı dosyasını indirin, OpenCart\'ın kurulu olduğu ana klasöre (config.php\'nin yanına) yükleyin, site adresini girip bağlantıyı test edin. Dosya veritabanına OpenCart\'ın kendi bilgileriyle bağlanır, yalnız panelin anahtarıyla çalışır. Siparişler, ürünler (seçenekler ayrı varyant), stok, fiyat ve kargo bildirimi desteklenir. Site HTTPS olmalı.',
  etsy: 'etsy.com/developers → Create a New App (keystring + shared secret); uygulamayı mağazanız için OAuth ile yetkilendirip refresh token alın. Siparişler, stok, fiyat ve kargo bildirimi desteklenir; panel yenilenen belirteci kendisi saklar.',
};
// Test aşamasındaki kanallar: ana ve müşteri panellerinde eklenip kullanılır, "Test aşamasında" etiketiyle görünür. Ana panelde kanal
// sayfasındaki "Test yazısını kaldır" düğmesiyle etiketi kalkan tür listeden çıkar (liste sunucudan gelir: integrations → beta)
const ALL_BETA = ['amazon', 'ciceksepeti', 'koctas', 'shopify', 'opencart', 'etsy'];
let BETA = ALL_BETA;

// Sıra: kanal türü (ikas, Hepsiburada, Trendyol, ...), aynı türde önce ana mağaza sonra eklenenler
const TYPES = ['ikas', 'hepsiburada', 'trendyol', 'pttavm', 'n11', 'idefix', 'pazarama', 'woocommerce', ...ALL_BETA];
const TYPE_NAME = { ikas: 'ikas (web sitesi)', hepsiburada: 'Hepsiburada', trendyol: 'Trendyol', pttavm: 'PttAVM', n11: 'N11', idefix: 'idefix', pazarama: 'Pazarama', amazon: 'Amazon', ciceksepeti: 'Çiçeksepeti', koctas: 'Koçtaş', shopify: 'Shopify', woocommerce: 'WooCommerce', opencart: 'OpenCart', etsy: 'Etsy' };
// Yakında eklenecek satış kanalları ve kargo firmaları (seçilemez, yalnız bilgi)
const SOON = ['Teknosa', 'Turkcell Pasaj', 'Boyner', 'Trendyol Go', 'Getir', 'Yemeksepeti Market'];
const SOON_ABROAD = ['eBay', 'Ozon'];
const CARGO_SOON = ['Kolay Gelsin', 'Sendeo', 'DHL Express'];
const rank = (c) => TYPES.indexOf(c.type) * 1000 + (c.extra ? Number(c.id.split('_')[1]) || 99 : c.id === 'ikas2' ? 2 : 1);
const when = (ms) => (ms ? html`<span title="${dateTime(ms)}">${ago(ms)}</span>` : html`<span class="muted">henüz yok</span>`);

// Kanal kurulmuş mu: bağlı, örnek veriyle çalışıyor ya da panelde bilgi girilmiş (test bekliyor)
const configured = (c) => c.enabled || c.demo || c.fields.some((f) => f.source) || c.extra;
const SITES = ['ikas', 'shopify', 'woocommerce', 'opencart'];
// Satıcı panelleri (bilgilerin alındığı yer)
const PANEL_URL = { trendyol: 'https://partner.trendyol.com', hepsiburada: 'https://merchant.hepsiburada.com', n11: 'https://so.n11.com', amazon: 'https://sellercentral.amazon.com.tr', etsy: 'https://www.etsy.com/developers/your-apps', pazarama: 'https://isortagim.pazarama.com' };
const panelUrl = (c) => (c.type === 'ikas' ? ((c.fields.find((f) => /STORE$/.test(f.k)) || {}).value ? `https://${c.fields.find((f) => /STORE$/.test(f.k)).value}.myikas.com/admin` : 'https://ikas.com') : PANEL_URL[c.type] || '');
// Kanalın gerçekten yapabildikleri (servisi izin vermeyen işler yazılmaz)
const CAPS = (c) => { const can = c.can || {}; return [can.orders !== false && 'Sipariş alma', can.listings && 'Ürün / stok okuma', c.caps.accept === 'remote' && 'Siparişi kanalda işleme alma', c.caps.ship === 'remote' && 'Kargo / takip bildirimi', c.caps.label && 'Kargo etiketi', can.stock !== false && 'Stok gönderimi', c.caps.price && can.price !== false && 'Fiyat gönderimi', c.caps.createProduct && 'Ürün oluşturma', can.questions && 'Müşteri soruları', c.claims && 'İade talepleri', c.campaigns && 'Kampanyalar'].filter(Boolean); };
const ok = (on, yes, no) => html`<span class="istat ${on === true ? 'on' : on === false ? 'off' : 'na'}"><i class="ico ico-${on === true ? 'check' : on === false ? 'x' : 'dots'}"></i>${on === true ? yes : on === false ? no : '—'}</span>`;

export async function integrations(el, rest = []) {
  const id = rest[0] ? decodeURIComponent(rest[0]) : '';
  let data = null, jobs = [], modes = [], carriers = [], f = { show: 'all', q: '' };
  try { f.show = sessionStorage.getItem('integ_show') || 'all'; } catch { /* yok */ }
  async function load() {
    [data, jobs, modes, carriers] = await Promise.all([api('integrations'), api('backfill').catch(() => []), api('channel-products/channels').catch(() => []), api('integrations/carriers').catch(() => [])]);
    data.channels.sort((a, b) => rank(a) - rank(b));
    if (Array.isArray(data.beta)) BETA = data.beta;
    draw();
  }
  const st = () => state.settings || {};
  const held = (c) => (st().hold_channels || []).includes(c.id);
  // Stok senkronu kapalıyken ana katalogdan stok okunur (gönderilmez); açıkken ana katalog da diğer kanallar gibi stok alır
  const isCatalog = (c) => !st().stock_sync && (st().catalog_channels || ['ikas1']).includes(c.id);
  const stockOn = (c) => (st().stock_sync ? (st().stock_channels || {})[c.id] !== false : !!(st().stock_push || {})[c.id]);
  const modeOf = (c) => modes.find((m) => m.channel === c.id);
  const stateOf = (c) => {
    const [k, t] = chState(c);
    return { k: !configured(c) && !c.paused ? 'off' : k, t: !configured(c) ? 'Bağlı değil' : t };
  };

  // ---------- genel bakış: kanal türü başına tek kart (aynı türün mağazaları kanalın kendi ekranında) ----------
  // Bir türün görünen mağazaları: kurulmuş olanlar + ilk (ana) mağaza. Kurulmamış ek ana mağazalar (ör. ikas2) gizli kalır.
  const storesOf = (type) => { const all = data.channels.filter((c) => c.type === type); return all.filter((c, i) => i === 0 || configured(c)); };
  const groupsOf = () => TYPES.map((t) => ({ type: t, stores: storesOf(t) })).filter((g) => g.stores.length);
  const typeName = (t) => (t === 'ikas' ? 'ikas' : TYPE_NAME[t] || t);
  function icard(g) {
    const conf = g.stores.filter(configured), c = conf[0] || g.stores[0], live = conf.filter((x) => x.enabled || x.demo);
    const err = conf.find((x) => x.last && x.last.ok === false);
    const s = err ? { k: 'err', t: 'Hata' } : stateOf(c);
    const multi = conf.length > 1;
    return html`<div class="icard ${conf.length ? 'conf' : ''} ${s.k}" data-act="open" data-id="${c.id}" tabindex="0">
      <div class="ic-top">${chLogo(c.id)}<div class="ic-name"><b class="ellipsis">${typeName(g.type)}</b>
          <div class="ic-st"><span class="led ${s.k === 'off' ? 'off' : s.k === 'err' ? 'err' : s.k === 'demo' ? 'demo' : ''}"></span>${multi ? `${live.length}/${conf.length} mağaza bağlı` : s.t}${c.beta ? html`<span class="pill warn tiny">Test aşamasında</span>` : ''}${c.sandbox ? html`<span class="pill warn tiny">Test ortamı</span>` : ''}</div></div>
        <button class="btn sm ${conf.length ? 'outline' : 'primary'}" data-act="open" data-id="${c.id}">${conf.length ? html`<i class="ico ico-gear"></i>Yönet` : html`<i class="ico ico-plus"></i>Bağla`}</button></div>
      ${multi ? html`<div class="ic-stores small">${conf.map((x) => { const k = stateOf(x).k; return html`<span class="ic-store"><span class="led ${k === 'off' ? 'off' : k === 'err' ? 'err' : k === 'demo' ? 'demo' : ''}"></span>${x.name}</span>`; })}</div>` : ''}
      ${!conf.length ? html`<div class="ic-need small muted">Gerekenler: ${c.fields.filter((x) => x.req).map((x) => x.label).join(', ') || 'API bilgileri'}</div>`
        : !live.length ? html`<div class="ic-need small muted">Bilgiler girildi; bağlantı testi bekleniyor.</div>` : ''}
      ${!conf.length ? html`<div class="ic-caps">${CAPS(c).slice(0, 4).map((x) => html`<span>${x}</span>`)}</div>` : !multi ? html`<div class="ic-stats">
        <div><span>Siparişler</span>${c.enabled || c.demo ? (c.last && c.last.ok === false ? html`<span class="istat off"><i class="ico ico-x"></i>Hata</span>` : ok(true, c.last && c.last.ordersAt ? ago(c.last.ordersAt) : 'Açık')) : ok(null)}</div>
        <div><span>Stok gönderimi</span>${c.enabled || c.demo ? (isCatalog(c) ? html`<span class="istat na"><i class="ico ico-db"></i>Ana katalog</span>` : ok(stockOn(c), 'Açık', 'Kapalı')) : ok(null)}</div>
        <div><span>Kanala yazma</span>${c.enabled || c.demo ? ok(!held(c), 'Açık', 'Beklemede') : ok(null)}</div>
      </div>` : ''}
      ${err ? html`<div class="ic-err small"><i class="ico ico-warn"></i><span class="ellipsis">${multi ? `${err.name}: ` : ''}${err.last.error || 'Senkron başarısız'}</span></div>` : ''}
    </div>`;
  }
  function overview() {
    const all = data.channels, conn = all.filter((c) => c.enabled || c.demo), errs = all.filter((c) => c.last && c.last.ok === false), wait = all.filter((c) => configured(c) && !c.enabled && !c.demo && c.gated);
    const gs = groupsOf(), on = (g) => g.stores.some((c) => c.enabled || c.demo), conf = (g) => g.stores.some(configured);
    const groups = [['all', 'Tümü', gs.length], ['on', 'Bağlı', gs.filter(on).length], ['off', 'Bağlanmamış', gs.filter((g) => !conf(g)).length], ['market', 'Pazaryerleri', gs.filter((g) => !SITES.includes(g.type)).length], ['site', 'E-ticaret siteleri', gs.filter((g) => SITES.includes(g.type)).length]];
    const q = f.q.toLocaleLowerCase('tr');
    const list = gs.filter((g) => (f.show === 'all' || (f.show === 'on' ? on(g) : f.show === 'off' ? !conf(g) : f.show === 'site' ? SITES.includes(g.type) : !SITES.includes(g.type)))
      && (!q || `${typeName(g.type)} ${g.stores.map((c) => c.name).join(' ')}`.toLocaleLowerCase('tr').includes(q)))
      .sort((a, b) => Number(conf(b)) - Number(conf(a)));
    render(el, html`<div class="stack">
      <div class="ihead card">
        <div class="ih-kpi"><b class="num">${n(conn.length)}</b><span>bağlı mağaza</span></div>
        <div class="ih-kpi ${errs.length ? 'bad' : ''}"><b class="num">${n(errs.length)}</b><span>hatalı</span></div>
        <div class="ih-kpi ${wait.length ? 'warn' : ''}"><b class="num">${n(wait.length)}</b><span>test bekliyor</span></div>
        <div class="ih-txt muted small">Bağlı kanallar <b>15 dakikada bir</b> otomatik kontrol edilir: siparişler, ürünler, stoklar güncellenir. Sorun olursa <a class="link" href="#/bildirimler">Bildirimler</a>'e düşer. Aynı kanalda ikinci mağaza için kanalı açıp <b>Mağaza ekle</b>'ye basın.</div>
        <div class="row" style="gap:8px"><button class="btn" data-act="syscheck"><i class="ico ico-bolt"></i>Sistem kontrolü</button></div>
      </div>
      <div class="row wrap"><div class="tabs" style="flex:1;min-width:0">${groups.map(([k, t, cnt]) => html`<button class="tab ${f.show === k ? 'on' : ''}" data-act="show" data-k="${k}">${t} <span class="n">${cnt}</span></button>`)}</div>
        <label class="search" style="max-width:260px"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Kanal ara" data-q value="${f.q}"></label></div>
      ${!conn.length ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Henüz bağlı satış kanalınız yok. Satış yaptığınız kanalın kartında <b>Bağla</b>'ya basın; bilgileri girip <b>Kaydet ve bağlantıyı test et</b> deyince siparişleriniz gelmeye başlar.</div></div>` : ''}
      <div class="icards">${list.map(icard)}</div>
      ${!list.length ? html`<div class="card empty">Bu filtrede kanal yok</div>` : ''}
      <div class="row wrap small" style="gap:6px"><span class="muted">Yakında:</span>${SOON.map((t) => html`<span class="pill">${t}</span>`)}</div>
      <div class="row wrap small" style="gap:6px"><span class="muted">Yurt dışı pazaryerleri (yakında):</span>${SOON_ABROAD.map((t) => html`<span class="pill">${t}</span>`)}</div>
      ${carrierSection()}
      ${conn.some((c) => !c.demo) || jobs.length ? backfill() : ''}
    </div>`);
  }

  // ---------- kargo entegratörleri (Kargonomi, Navlungo…): kendi anlaşmanızla gönderimde etiket ve takip no bu firmalardan ----------
  const carrierState = (c) => (!c.ready ? { k: 'off', t: 'Hazırlanıyor' } : !c.configured ? { k: 'off', t: 'Bağlanmadı' } : !c.active ? { k: 'off', t: 'Pasif' } : { k: '', t: 'Bağlı' });
  function carrierSection() {
    if (!carriers.length) return '';
    const locked = carriers.some((c) => c.locked), direct = carriers.filter((c) => c.kind === 'direct'), rest = carriers.filter((c) => c.kind !== 'direct');
    const card = (c) => { const s = carrierState(c); return html`<div class="icard ${c.configured ? 'conf' : ''}" data-act="carrier" data-id="${c.id}" tabindex="0">
        <div class="ic-top"><span class="logo-b" style="background:${c.color || (c.id === 'kargonomi' ? '#ff6b00' : c.id === 'navlungo' ? '#1d4ed8' : '#64748b')}">${c.id === 'demo' ? html`<i class="ico ico-truck"></i>` : c.name.slice(0, 1)}</span><div class="ic-name"><b class="ellipsis">${c.name}</b>
          <div class="ic-st"><span class="led ${s.k}"></span>${s.t}${c.isDefault && c.usable ? html`<span class="pill good tiny">Varsayılan</span>` : ''}</div></div>
          <button class="btn sm ${c.configured ? 'outline' : 'primary'}" data-act="carrier" data-id="${c.id}">${c.configured ? html`<i class="ico ico-gear"></i>Yönet` : html`<i class="ico ico-plus"></i>Bağla`}</button></div>
        ${!c.ready ? html`<div class="ic-need small"><span class="pill warn tiny">${c.configured ? 'Bilgiler kayıtlı · bağlantı hazırlanıyor' : 'API bilgisi gelince açılır'}</span></div>` : ''}
        <div class="ic-need small muted">${c.about}</div></div>`; };
    return html`<div class="card stack" style="--g:12px">
      <div><h2 class="row" style="gap:8px">Kargo entegrasyonları <span class="pill info tiny">Kurumsal paket</span></h2><div class="muted small">Kendi kargo anlaşmanızla gönderdiğiniz siparişlerin (kendi siteniz, pazaryerleri, ikas) etiketini ve takip numarasını kargo firmasından alın: sipariş → paket menüsü → <b>Kargo firmasından etiket al</b>. “Kargoya ver” dediğinizde takip numarası satış kanalına bildirilir. Bir firma, API bilgileri girilip bağlantısı doğrulandıktan sonra sipariş ekranında görünür.</div>
        <div class="tiny muted" style="margin-top:6px"><b>Hangi etiket?</b> Trendyol / Hepsiburada gibi pazaryeri anlaşmalı kargosunda pazaryerinin <b>ortak barkodu</b>; siteniz kargo etiketi veriyorsa (ikas Kargo) <b>sitenin etiketi</b>; ikisi de yoksa ya da kendi anlaşmanızla gönderiyorsanız <b>bağlı kargo firması</b>. Sipariş ekranı her paket için önerilen yolu gösterir.</div></div>
      ${locked ? html`<div class="notice warn small"><i class="ico ico-key"></i><div>Kendi anlaşmalı kargo entegrasyonu <b>Kurumsal</b> pakette. Pazaryeri ortak barkodu ve ikas Kargo etiketleri tüm paketlerde çalışır. ${isAdmin() ? html`<a class="link" href="#/paketim">Paketim</a>'den yükseltebilirsiniz.` : ''}</div></div>` : ''}
      <div class="small" style="font-weight:650">Kargo firmaları (doğrudan bağlantı)</div>
      <div class="icards">${direct.map(card)}</div>
      ${rest.length ? html`<div class="small" style="font-weight:650">Kargo entegratörleri (tek hesaptan birçok firma)</div><div class="icards">${rest.map(card)}</div>` : ''}
      <div class="row wrap small" style="gap:6px"><span class="muted">Yakında:</span>${CARGO_SOON.map((t) => html`<span class="pill">${t}</span>`)}</div>
    </div>`;
  }
  function carrierSheet(id) {
    const c = carriers.find((x) => x.id === id);
    if (!c) return;
    if (c.locked) return toast('Kendi anlaşmalı kargo entegrasyonu Kurumsal pakette; Paketim\'den yükseltebilirsiniz', true);
    const admin = isAdmin(), fields = c.fields || [];
    const s = sheet({ title: `${c.name} · kargo entegratörü`, size: 'narrow', body: html`<div class="stack">
      <div class="small">${c.about}</div>
      ${!c.ready ? html`<div class="notice warn small"><i class="ico ico-warn"></i><div><b>Bağlantı hazırlanıyor.</b> ${c.name} API dokümanı ve test hesabı geldiğinde gönderi oluşturma açılacak. Bilgilerinizi şimdiden kaydedebilirsiniz; o zamana kadar etiketi ${c.name} panelinden alıp takip numarasını paket menüsünden “Kendi anlaşmamla gönder” ile girebilirsiniz.</div></div>` : ''}
      <div class="notice small"><i class="ico ico-key"></i><div>${c.howto}${c.site ? html` <a class="link" href="${c.site}" target="_blank" rel="noopener">${c.site.replace(/^https?:\/\/(www\.)?/, '')}</a>` : ''}</div></div>
      ${c.demo ? '' : html`<div class="form-grid">${fields.map((f2) => html`<label class="field"><span class="row" style="gap:6px">${f2.label}${f2.req ? html`<b style="color:var(--bad)">*</b>` : ''}${f2.source === 'panel' ? html`<span class="src panel">kayıtlı</span>` : ''}</span>
        ${f2.secret ? html`<input class="input" type="password" autocomplete="new-password" data-k="${f2.k}" placeholder="${f2.masked ? `${f2.masked} (kayıtlı — değiştirmek için yazın)` : 'gizli değer'}" ${admin ? '' : 'disabled'}>`
          : html`<input class="input" data-k="${f2.k}" value="${f2.value}" autocomplete="off" ${admin ? '' : 'disabled'}>`}
        ${f2.hint ? html`<small class="muted">${f2.hint}</small>` : ''}</label>`)}</div>`}
      ${c.configured && !c.demo ? html`<label class="row" style="gap:8px;cursor:pointer"><input type="checkbox" data-active ${c.active ? 'checked' : ''} ${admin ? '' : 'disabled'}><span class="small">Aktif (kapalıysa sipariş ekranında kullanılmaz)</span></label>` : ''}
      <div data-res></div>
    </div>`,
    foot: admin ? html`${c.usable && !c.isDefault ? html`<button class="btn" data-def>Varsayılan yap</button>` : ''}<span class="spacer"></span>${c.demo ? '' : html`<button class="btn" data-save>Kaydet</button>`}<button class="btn primary" data-test><i class="ico ico-key"></i>${c.demo ? 'Bağlantıyı test et' : 'Kaydet ve test et'}</button>` : html`<span class="muted small">Bilgileri yalnız yönetici değiştirebilir.</span>` });
    const save = async () => {
      if (c.demo) return;
      const values = {}; $$('[data-k]', s.el).forEach((i) => { values[i.dataset.k] = i.value; });
      const act = $('[data-active]', s.el);
      await api('integrations/carriers/' + c.id, { method: 'PUT', body: { values, ...(act ? { active: act.checked } : {}) } });
    };
    const sv = $('[data-save]', s.el), ts = $('[data-test]', s.el), df = $('[data-def]', s.el);
    if (sv) sv.onclick = (e) => busy(e.currentTarget, async () => { await save(); toast('Kaydedildi'); s.close(); await load(); });
    if (ts) ts.onclick = (e) => busy(e.currentTarget, async () => {
      await save();
      const r = await api(`integrations/carriers/${c.id}/test`, { method: 'POST' });
      render($('[data-res]', s.el), html`<div class="notice ${r.ok ? 'good' : 'warn'} small"><i class="ico ico-${r.ok ? 'check' : 'warn'}"></i><div>${r.message}</div></div>`);
      await load();
    });
    if (df) df.onclick = (e) => busy(e.currentTarget, async () => { await api('integrations/carriers/default', { method: 'POST', body: { id: c.id } }); toast(`${c.name} varsayılan entegratör`); s.close(); await load(); });
  }

  // Kanal ekranının üstünde aynı türün mağazaları ve "Mağaza ekle" (paketteki mağaza sınırı kaydederken uygulanır)
  function storeTabs(c, admin) {
    const list = storesOf(c.type), lim = state.tenant && state.tenant.stores;
    const used = data.channels.filter(configured).length;
    return html`<div class="row wrap store-tabs" style="gap:8px;align-items:center">
      <div class="tabs" style="min-width:0">${list.map((x) => { const k = stateOf(x).k; return html`<a class="tab ${x.id === c.id ? 'on' : ''}" href="#/entegrasyonlar/${encodeURIComponent(x.id)}"><span class="led ${k === 'off' ? 'off' : k === 'err' ? 'err' : k === 'demo' ? 'demo' : ''}"></span>${x.name}</a>`; })}</div>
      ${admin ? html`<button class="btn sm outline" data-act="addstore" data-type="${c.type}"><i class="ico ico-plus"></i>${typeName(c.type)} mağazası ekle</button>` : ''}
      ${lim ? html`<span class="tiny muted">Paketiniz: ${used} / ${lim} mağaza</span>` : ''}
    </div>`;
  }

  // ---------- kanal ekranı: anahtarlar · bağlantı bilgileri · yardım ----------
  function field(c, f2) {
    const src = !state.tenant && f2.source === 'cloudflare' ? html`<span class="src" title="Cloudflare gizli değişkeninden">Cloudflare</span>` : f2.source === 'panel' ? html`<span class="src panel">kayıtlı</span>` : '';
    return html`<label class="field" data-help="${f2.k}"><span class="row" style="gap:6px">${f2.label}${f2.req ? html`<b style="color:var(--bad)">*</b>` : ''}${src}</span>
      ${f2.choices ? html`<select class="input" data-k="${f2.k}">${f2.choices.map(([v, t]) => html`<option value="${v}" ${(f2.value || '') === v ? 'selected' : ''}>${t}</option>`)}</select>`
        : f2.secret
        ? html`<input class="input" type="password" autocomplete="new-password" data-k="${f2.k}" placeholder="${f2.masked ? `${f2.masked} (kayıtlı — değiştirmek için yazın)` : 'gizli değer'}">`
        : html`<input class="input" data-k="${f2.k}" value="${f2.value}" placeholder="${f2.hint && f2.hint.length < 48 ? f2.hint : ''}" autocomplete="off">`}
      ${f2.secret && f2.source === 'panel' ? html`<small><a href="#" class="link" data-act="clear" data-id="${c.id}" data-k="${f2.k}">Kayıtlı değeri sil</a></small>` : ''}</label>`;
  }
  // Anahtar: data-<k>="<kanal>" (kanal kimliği değer olarak kaçışlanır; özellik metni hazır verilirse tırnaklar &quot; olur ve kimlik bozulur)
  const sw = (k, cid, on, title, desc, dis = false) => html`<label class="iswitch ${dis ? 'dis' : ''}"><span style="flex:1;min-width:0"><b>${title}</b><span class="muted tiny">${desc}</span></span><span class="switch"><input type="checkbox" data-${k}="${cid}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}><span></span></span></label>`;
  function helpBox(c, k) {
    const f2 = k && c.fields.find((x) => x.k === k);
    return f2 ? html`<div class="ih-field"><div class="tiny muted">Seçili alan</div><b>${f2.label}${f2.req ? ' *' : ''}</b><div class="small">${f2.hint || (f2.secret ? 'Gizli bilgi: şifreli saklanır, ekranda tekrar gösterilmez.' : 'Kanalın satıcı panelindeki değerin aynısını girin.')}</div>${f2.secret ? html`<div class="tiny muted" style="margin-top:4px">Boş bırakırsanız kayıtlı değer korunur.</div>` : ''}</div>`
      : html`<div class="ih-field muted small">Bir alana tıkladığınızda o alanın açıklaması burada görünür.</div>`;
  }
  // OpenCart: panel sitedeki bağlantı dosyasıyla konuşur; dosya kanalın anahtarı gömülü olarak sunucudan indirilir
  function ocBridge(c, admin) {
    const hasKey = c.fields.some((x) => x.k === 'OPENCART_KEY' && x.source);
    return html`<div class="notice small"><i class="ico ico-download"></i><div style="min-width:0"><b>Bağlantı dosyası</b> · OpenCart'ın yönetim API'si olmadığından panel, sitenize yükleyeceğiniz küçük bir PHP dosyasıyla bağlanır.
      <ol class="ih-steps small" style="margin:6px 0"><li><b>Bağlantı dosyasını indirin</b> (anahtar dosyaya yazılır ve burada şifreli saklanır)</li><li>Dosyayı FTP ya da hosting dosya yöneticisiyle OpenCart'ın kurulu olduğu <b>ana klasöre (config.php'nin yanına)</b> yükleyin; adını değiştirmeyin</li><li>Site adresini yazıp <b>Kaydet ve bağlantıyı test et</b>'e basın</li></ol>
      ${admin ? html`<button class="btn sm primary" data-act="ocbridge" data-id="${c.id}"><i class="ico ico-download"></i>Bağlantı dosyasını indir</button>` : ''}
      <div class="tiny muted" style="margin-top:6px">${hasKey ? 'Yeniden indirirseniz aynı anahtar kullanılır. Anahtarı değiştirmek için kayıtlı anahtarı silip dosyayı yeniden indirin ve sitedeki dosyayı değiştirin.' : 'Anahtar ilk indirmede oluşturulur.'} Dosya yalnız bu anahtarla çalışır; kimseyle paylaşmayın.</div></div></div>`;
  }
  function detail() {
    const c = data.channels.find((x) => x.id === id);
    if (!c) { render(el, html`<div class="stack"><a class="link" href="#/entegrasyonlar">← Entegrasyonlar</a><div class="card empty">Kanal bulunamadı</div></div>`); return; }
    const s = stateOf(c), live = c.enabled || c.demo, m = modeOf(c), basic = c.fields.filter((x) => !x.adv), adv = c.fields.filter((x) => x.adv), url = panelUrl(c), admin = isAdmin();
    render(el, html`<div class="stack">
      <div class="row wrap" style="gap:10px"><a class="btn ghost sm" href="#/entegrasyonlar"><i class="ico ico-back"></i>Entegrasyonlar</a><span class="spacer"></span>
        ${live ? html`<button class="btn sm" data-act="sync" data-id="${c.id}"><i class="ico ico-sync"></i>${(c.can || {}).listings === false ? 'Siparişleri çek' : 'Siparişleri ve ürünleri çek'}</button>` : ''}</div>
      ${storeTabs(c, admin)}
      <div class="idetail" data-ch="${c.id}">
        <aside class="card id-side">
          <div class="id-brand">${chLogo(c.id)}<div style="min-width:0"><h2>${c.type === 'ikas' ? `ikas · ${c.name}` : c.name}</h2><div class="ic-st"><span class="led ${s.k === 'off' ? 'off' : s.k === 'err' ? 'err' : s.k === 'demo' ? 'demo' : ''}"></span>${s.t}</div></div></div>
          ${state.tenant ? (c.beta ? html`<div class="notice small warn"><div><b>Test aşamasında:</b> bu entegrasyon kullanıma açık ancak henüz test aşamasındadır. Bağladıktan sonra ilk siparişlerinizi ve stoklarınızı kanalın kendi panelinden de kontrol edin; bir sorun görürseniz bize bildirin.</div></div>` : '')
            : ALL_BETA.includes(c.type) ? (c.beta
            ? html`<div class="notice small warn"><div><b>Test aşamasında:</b> firmalar bu kanalı ekleyip kullanabilir; panellerinde ve tanıtım sitesinde “Test aşamasında” etiketiyle görünür.${admin ? html`<div style="margin-top:8px"><button class="btn sm primary" data-act="release" data-type="${c.type}" data-on="1">Test yazısını kaldır</button></div>` : ''}</div></div>`
            : html`<div class="notice small good"><div><b>Test tamamlandı:</b> firmalarda ve tanıtım sitesinde etiketsiz, normal kanal olarak görünür.${admin ? html`<div style="margin-top:8px"><button class="btn sm" data-act="release" data-type="${c.type}" data-on="">“Test aşamasında” etiketini geri koy</button></div>` : ''}</div></div>`) : ''}
          <div class="id-sws">
            ${sw('active', c.id, c.active, 'Kanal aktif', 'Kapalıysa senkronlanmaz', !admin)}
            ${sw('write', c.id, !held(c), 'Kanala yazma', 'Kapalıysa yalnız okunur: paketleme, stok, fiyat gönderilmez', !admin || !live)}
            ${isCatalog(c) ? html`<div class="iswitch dis"><span style="flex:1"><b>Stok gönderimi</b><span class="muted tiny">Stok senkronu kapalı: stok bu kanaldan okunur (Ayarlar → Stok'tan açın)</span></span></div>`
              : sw('stock', c.id, stockOn(c), 'Stok gönderimi', st().stock_sync ? 'Panel stoğu bu kanala otomatik gider' : 'Genel stok senkronu kapalıyken yalnız bu kanala gönderilir', !admin || !live)}
            ${m ? sw('mode', c.id, !m.manual, 'Yeni ilanları otomatik ekle', 'Kapalıysa yeni ilanları Kanal Ürünleri\'nden siz seçersiniz', !admin) : ''}
          </div>
          ${live ? html`<dl class="id-kv small">
            <dt>Siparişler</dt><dd>${c.last && c.last.ordersAt ? html`<span title="${dateTime(c.last.ordersAt)}">${ago(c.last.ordersAt)}</span>` : '—'}</dd>
            ${(c.can || {}).listings !== false ? html`<dt>Ürün / stok</dt><dd>${c.last && c.last.listingsAt ? html`<span title="${dateTime(c.last.listingsAt)}">${ago(c.last.listingsAt)}</span>` : '—'}</dd>
            <dt>İlan</dt><dd class="num">${n(c.listings)}${c.listingErrors ? html` · <button class="link" style="color:var(--bad)" data-act="lerrs" data-id="${c.id}" title="Ne olduğunu ve nasıl düzeleceğini gösterir">${c.listingErrors} hatalı</button>` : ''}</dd>` : ''}</dl>` : ''}
          <div class="id-acts">
            ${live && (c.can || {}).listings !== false ? html`<button class="btn sm ghost" data-act="import"><i class="ico ico-download"></i>İlanları içe aktar</button>` : ''}
            <button class="btn sm ghost" data-act="diag" data-id="${c.id}"><i class="ico ico-bolt"></i>Tanılama</button>
            ${c.type === 'hepsiburada' && c.id === 'hepsiburada' && !state.tenant ? html`<a class="btn sm ghost" href="#/hb-test"><i class="ico ico-check"></i>Test adımları</a>` : ''}
            ${c.extra && admin ? html`<button class="btn sm ghost danger" data-act="remove" data-id="${c.id}"><i class="ico ico-x"></i>Mağazayı kaldır</button>` : ''}
          </div>
        </aside>
        <main class="stack" style="min-width:0">
          <div class="card stack">
            <div class="row wrap" style="gap:10px"><div style="flex:1;min-width:0"><h2>Bağlantı bilgileri</h2><div class="muted small">Bilgiler sunucuda şifreli saklanır, ekranda tekrar açık gösterilmez.</div></div></div>
            ${c.locked ? html`<div class="notice bad small"><i class="ico ico-warn"></i>Kayıtlı bilgiler okunamadı${state.tenant ? '' : ' (panel şifresi / PANEL_SECRET değişmiş olabilir)'}. Bilgileri yeniden girin.</div>` : ''}
            ${c.last && c.last.ok === false ? html`<div class="notice bad small"><i class="ico ico-warn"></i><div><b>Sipariş senkronu başarısız${c.last.fails > 1 ? ` (${c.last.fails}. deneme)` : ''}:</b> ${c.last.error || 'ayrıntı yok — Tanılama ile kontrol edin'}<div class="tiny muted">${c.last.nextTry ? `Sonraki otomatik deneme ${dateTime(c.last.nextTry)}.` : '15 dakikada bir otomatik yeniden denenir.'}</div></div></div>` : ''}
            ${c.last && c.last.listingsError ? html`<div class="notice bad small"><i class="ico ico-warn"></i><div><b>Ürün / stok alınamadı:</b> ${c.last.listingsError}</div></div>` : ''}
            ${c.last && c.last.note && !c.last.error ? html`<div class="notice small"><i class="ico ico-check"></i><div>${c.last.note}</div></div>` : ''}
            ${c.type === 'opencart' ? ocBridge(c, admin) : ''}
            <div class="form-grid">${basic.map((x) => field(c, x))}</div>
            ${adv.length ? html`<details class="adv"><summary>Gelişmiş ayarlar (${adv.length})</summary><div class="form-grid" style="margin-top:10px">${adv.map((x) => field(c, x))}</div></details>` : ''}
            ${admin ? html`<div class="row wrap" style="gap:8px"><button class="btn primary" data-act="test" data-id="${c.id}"><i class="ico ico-key"></i>Kaydet ve bağlantıyı test et</button><button class="btn" data-act="save" data-id="${c.id}">Yalnız kaydet</button></div>` : html`<div class="muted small">Bağlantı bilgilerini yalnız yönetici değiştirebilir.</div>`}
            <div data-res></div>
          </div>
          ${live ? backfill(c) : ''}
        </main>
        <aside class="card id-help">
          <h3>Yardım</h3>
          <div data-fhelp>${helpBox(c)}</div>
          <div><div class="small" style="font-weight:700;margin-bottom:6px">Bilgileri nereden alırım?</div><div class="small muted">${(state.tenant && c.type === 'hepsiburada' ? 'Hepsiburada Merchant Portal → Hesabım → Entegrasyon: Merchant ID ve servis anahtarı (şifre).' : HELP[c.type]) || 'Kanalın satıcı panelindeki entegrasyon / API bölümünden.'}</div>
            ${url ? html`<a class="btn sm outline" style="margin-top:8px" href="${url}" target="_blank" rel="noopener noreferrer"><i class="ico ico-link"></i>Satıcı paneline git</a>` : ''}</div>
          <ol class="ih-steps small"><li>Bilgileri satıcı panelinden kopyalayın</li><li>Alanlara yapıştırıp <b>Kaydet ve bağlantıyı test et</b>'e basın</li><li>Bağlantı doğrulanınca siparişler ve ürünler kendiliğinden gelir (son 1 yıl dahil)</li></ol>
          <div><div class="small" style="font-weight:700;margin-bottom:6px">Bu kanalda yapılabilenler</div><div class="row wrap" style="gap:6px">${CAPS(c).map((x) => html`<span class="pill">${x}</span>`)}</div></div>
        </aside>
      </div>
    </div>`);
    el.querySelectorAll('[data-help]').forEach((x) => x.addEventListener('focusin', () => render($('[data-fhelp]', el), helpBox(c, x.dataset.help))));
  }
  function backfill(only) {
    const on = only ? [only] : data.channels.filter((c) => c.enabled && !c.demo);
    const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const js = only ? jobs.filter((j) => j.channel === only.id) : jobs;
    return html`<div class="card stack" data-bf>
      <div><h2>Geçmiş siparişleri aktar</h2><div class="muted small">Seçilen tarih aralığındaki siparişler haftalık parçalar halinde çekilir. Aynı sipariş iki kez kaydedilmez; stok takibi başlamadan önceki siparişler stoğu düşmez.</div></div>
      ${on.length ? html`${only ? html`<input type="hidden" data-bfch value="${only.id}" checked>` : html`<div class="row wrap">${on.map((c) => html`<label class="check">${chLogo(c.id, true)}<input type="checkbox" value="${c.id}" data-bfch checked> ${c.name}</label>`)}</div>`}
      <div class="row wrap"><label class="field" style="flex:1;min-width:150px"><span>Başlangıç</span><input class="input" type="date" data-bffrom value="${from}"></label>
        <label class="field" style="flex:1;min-width:150px"><span>Bitiş</span><input class="input" type="date" data-bfto value="${dayKey()}"></label>
        <button class="btn primary" style="align-self:flex-end" data-act="bfstart"><i class="ico ico-download"></i>Aktarımı başlat</button></div>`
      : html`<div class="muted small">Önce en az bir kanal bağlayın.</div>`}
      ${js.length ? html`<div class="stack" style="gap:8px">${js.map((j) => {
        const pct = j.to_ms > j.from_ms ? Math.round(((j.to_ms - j.cursor_ms) / (j.to_ms - j.from_ms)) * 100) : 100;
        const s2 = { running: ['info', 'Sürüyor'], done: ['good', 'Tamamlandı'], cancelled: ['', 'İptal edildi'] }[j.status] || ['', j.status];
        return html`<div class="cand" style="flex-wrap:wrap" data-job="${j.id}"><span class="ch-name" style="min-width:130px">${chLogo(j.channel, true)}${ch(j.channel).name}</span>
          <div style="flex:1;min-width:180px"><div class="row small"><span>${date(j.from_ms)} – ${date(j.to_ms)}</span><span class="spacer"></span><b>%${pct}</b></div><div class="prog"><span style="width:${pct}%"></span></div>
            <div class="tiny muted" style="margin-top:4px">${n(j.done)} sipariş işlendi · ${ago(j.updated_at)}${j.error ? html` · <span style="color:var(--bad)">${j.error}</span>` : ''}</div></div>
          <span class="pill ${s2[0]}">${s2[1]}</span>${j.status === 'running' ? html`<button class="btn sm" data-act="bfrun">Devam et</button><button class="btn sm ghost" data-act="bfcancel">İptal</button>` : ''}</div>`;
      })}</div>` : ''}
    </div>`;
  }
  const draw = () => (id ? detail() : overview());

  const values = (cid) => { const o = {}; $$(`[data-ch="${cid}"] [data-k]`, el).forEach((i) => { o[i.dataset.k] = i.value; }); return o; };
  const after = async () => { await loadSummary().catch(() => {}); await load(); };
  const saveSet = async (patch, msg) => { try { state.settings = await api('settings', { method: 'PUT', body: patch }); toast(msg); await after(); } catch (err) { toast(err.message, true); await after(); } };
  actions(el, {
    open: (t) => { location.hash = '#/entegrasyonlar/' + encodeURIComponent(t.dataset.id); },
    carrier: (t) => carrierSheet(t.dataset.id),
    show: (t) => { f.show = t.dataset.k; try { sessionStorage.setItem('integ_show', f.show); } catch { /* yok */ } draw(); },
    release: async (t) => {
      const on = !!t.dataset.on, name = TYPE_NAME[t.dataset.type] || t.dataset.type;
      const ok = await confirmBox(on ? `${name} için “Test aşamasında” yazısı kaldırılsın mı? Firmaların panellerinde ve tanıtım sitesinde normal kanal olarak görünür (birkaç dakika içinde yansır).`
        : `${name} yeniden “Test aşamasında” etiketiyle gösterilsin mi? Kanal çalışmaya devam eder; yalnız firmaların panellerinde ve sitede etiket görünür.`, on ? 'Test yazısını kaldır' : 'Etiketi geri koy');
      if (!ok) return;
      await busy(t, async () => { await api('integrations/release', { method: 'POST', body: { type: t.dataset.type, on } }); toast(on ? `${name}: “Test aşamasında” yazısı kaldırıldı` : `${name}: “Test aşamasında” etiketi geri kondu`); await load(); });
    },
    syscheck: () => systemCheck(data.channels.filter((c) => (c.enabled && !c.paused) || (c.gated && !(c.missing || []).length)).map((c) => ({ id: c.id, name: c.name }))),
    addmenu: (t) => {
      popMenu(t, TYPES.map((x) => ({ label: `${TYPE_NAME[x]}${BETA.includes(x) ? ' (test aşamasında)' : ''}`, run: () => busy(null, async () => {
        const r = await api('integrations/add', { method: 'POST', body: { type: x } });
        toast(`${TYPE_NAME[x]}: yeni mağaza eklendi — bilgilerini girin`); await loadSummary().catch(() => {});
        location.hash = '#/entegrasyonlar/' + encodeURIComponent(r.id);
      }) })), { title: 'Hangi kanala mağaza eklensin?' });
    },
    // Aynı kanala yeni mağaza: kurulmamış hazır mağaza (ör. ikas2) varsa o açılır, yoksa yeni kayıt oluşturulur
    addstore: (t) => busy(t, async () => {
      const type = t.dataset.type, lim = state.tenant && state.tenant.stores;
      if (lim && data.channels.filter(configured).length >= lim) return toast(`Paketinizdeki mağaza sınırına ulaşıldı (${lim} mağaza). Paketim sayfasından yükseltebilirsiniz.`, true);
      const spare = data.channels.find((c) => c.type === type && !configured(c) && !storesOf(type).includes(c));
      const cid = spare ? spare.id : (await api('integrations/add', { method: 'POST', body: { type } })).id;
      if (!spare) { toast(`${typeName(type)}: yeni mağaza eklendi — bilgilerini girin`); await loadSummary().catch(() => {}); }
      location.hash = '#/entegrasyonlar/' + encodeURIComponent(cid);
    }),
    save: (t) => busy(t, async () => { await api('integrations/' + t.dataset.id, { method: 'PUT', body: { values: values(t.dataset.id) } }); toast('Kaydedildi'); await after(); }),
    test: (t) => busy(t, async () => {
      const cid = t.dataset.id;
      await api('integrations/' + cid, { method: 'PUT', body: { values: values(cid) } });
      const r = await api(`integrations/${cid}/test`, { method: 'POST' });
      await after();
      const box = $('[data-res]', el);
      if (box) render(box, html`<div class="notice ${r.ok ? 'good' : 'bad'}"><i class="ico ico-${r.ok ? 'check' : 'warn'}"></i><div>${r.message}${r.ok ? '' : html`<div class="tiny muted" style="margin-top:4px">Bilgileri kontrol edin ya da adım adım denemek için <b>Tanılama</b>'ya basın.</div>`}</div></div>`);
    }),
    sync: (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { channels: [t.dataset.id], force: true, listings: true } }); const v = (r.channels || {})[t.dataset.id]; toast(typeof v === 'string' ? v : `${v ?? 0} sipariş kontrol edildi`, typeof v === 'string'); await after(); }),
    // Önce formdaki bilgiler kaydedilir (yazılan site adresi kaybolmasın), sonra anahtarlı dosya indirilir
    ocbridge: (t) => busy(t, async () => {
      const cid = t.dataset.id;
      await api('integrations/' + cid, { method: 'PUT', body: { values: values(cid) } });
      const res = await fetch('/api/opencart-bridge?channel=' + encodeURIComponent(cid), { credentials: 'same-origin' });
      if (!res.ok) { let msg = ''; try { msg = (await res.json()).error; } catch { /* boş */ } throw new Error(msg || 'Bağlantı dosyası indirilemedi'); }
      const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'hasturk-baglanti.php';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob()); a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`${name} indirildi: OpenCart ana klasörüne (config.php'nin yanına) yükleyin`); await after();
    }),
    import: () => importDialog(after),
    remove: async (t) => {
      const cid = t.dataset.id;
      if (!(await confirmBox(`${ch(cid).name || cid} mağazası panelden kaldırılsın mı? API bilgileri silinir; geçmiş siparişler ve raporlar korunur.`, 'Kaldır'))) return;
      await api(`integrations/${cid}/remove`, { method: 'POST' }); toast('Mağaza kaldırıldı'); await loadSummary().catch(() => {}); location.hash = '#/entegrasyonlar';
    },
    diag: (t) => diagnoseDialog(t.dataset.id),
    lerrs: (t) => listingErrorsSheet(t.dataset.id, () => load().catch(() => {})),
    bfstart: (t) => busy(t, async () => {
      const box = $('[data-bf]', el), channels = $$('[data-bfch]', box).filter((x) => x.type === 'hidden' || x.checked).map((x) => x.value);
      const r = await api('backfill', { method: 'POST', body: { channels, from: $('[data-bffrom]', box).value, to: $('[data-bfto]', box).value } });
      toast(`Aktarım başladı${r.run ? ': ' + Object.entries(r.run).map(([k, v]) => `${ch(k).name} ${typeof v === 'string' ? v : v.done + ' sipariş'}`).join(', ') : ''}`); await after();
    }),
    bfrun: (t) => busy(t, async () => { await api('backfill/run', { method: 'POST' }); await after(); }),
    bfcancel: (t) => busy(t, async () => { await api(`backfill/${encodeURIComponent(t.closest('[data-job]').dataset.job)}/cancel`, { method: 'POST' }); toast('İptal edildi'); await after(); }),
    clear: async (t) => {
      if (!(await confirmBox(state.tenant ? 'Kayıtlı bu gizli değer silinsin mi?' : 'Panelde kayıtlı bu gizli değer silinsin mi? (Cloudflare\'de tanımlıysa o kullanılır.)', 'Sil'))) return;
      await api('integrations/' + t.dataset.id, { method: 'PUT', body: { clear: [t.dataset.k] } }); toast('Silindi'); await after();
    },
  });
  el.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value; clearTimeout(el._q); el._q = setTimeout(() => { draw(); const q2 = $('[data-q]', el); if (q2) { q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } }, 200); } });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.icard')) location.hash = '#/entegrasyonlar/' + encodeURIComponent(e.target.dataset.id); });
  el.addEventListener('change', async (e) => {
    const t = e.target, d = t.dataset;
    if (d.write) {
      const cur = new Set(st().hold_channels || []);
      if (t.checked) cur.delete(d.write); else cur.add(d.write);
      return saveSet({ hold_channels: [...cur] }, t.checked ? `${ch(d.write).name}: kanala yazma açık` : `${ch(d.write).name}: kanala yazma beklemede (yalnız okunuyor)`);
    }
    if (d.stock) {
      const key = st().stock_sync ? 'stock_channels' : 'stock_push';
      return saveSet({ [key]: { ...(st()[key] || {}), [d.stock]: t.checked } }, `${ch(d.stock).name}: stok gönderimi ${t.checked ? 'açık' : 'kapalı'}`);
    }
    if (d.mode) {
      try { await api('channel-products/mode', { method: 'POST', body: { channel: d.mode, manual: !t.checked } }); toast(t.checked ? 'Yeni ilanlar panele otomatik eklenecek' : 'Yeni ilanları Kanal Ürünleri\'nden siz seçeceksiniz'); } catch (err) { toast(err.message, true); }
      return after();
    }
    if (d.active) {
      try { await api('integrations/' + d.active, { method: 'PUT', body: { active: t.checked } }); toast(t.checked ? `${ch(d.active).name} aktif` : `${ch(d.active).name} pasif: senkronlanmaz`); } catch (err) { toast(err.message, true); }
      return after();
    }
  });
  await load().catch((e) => render(el, html`<div class="notice bad">${e.message}</div>`));
  return { refresh: load };
}
