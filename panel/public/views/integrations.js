// Entegrasyonlar: pazaryeri ve site API bilgileri panelden girilir/değiştirilir (sunucuda şifreli saklanır),
// bağlantı test edilir, kanal aktif/pasif yapılır; son başarılı senkron zamanları, hatalar ve geçmiş sipariş aktarımı buradadır.
import { api, state, html, render, $, $$, n, ago, date, dateTime, ch, chLogo, chState, actions, busy, toast, confirmBox, dayKey, isAdmin, popMenu } from '../core.js';
import { loadSummary } from '../app.js';
import { importDialog } from './products.js';
import { diagnoseDialog, systemCheck } from './diagnose.js';

const HELP = {
  ikas: 'ikas paneli → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma). Görseller ve varyantlar ürünlerle birlikte gelir.',
  trendyol: 'Trendyol satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri.',
  hepsiburada: 'Hepsiburada Merchant Portal → Hesabım → Entegrasyon: Merchant ID, servis anahtarı ve entegratör adı (User-Agent olarak gönderilir; girilmezse Hepsiburada istekleri reddeder).',
  pttavm: 'PttAVM satıcı paneli → mağaza adınızın altında Hesap Yönetimi → Entegrasyon Bilgileri: entegratörler arasından Hastürk\'ü seçip Ekle / Görüntüle → API Key ve Token\'ı kopyalayın. (PttAVM token doğrulamasını zorunlu yaptı; eski kullanıcı adı / şifre girişi kapanıyor.) Kargo barkodu mağazanızın deposuyla alınır.',
  n11: 'N11 Satıcı Ofisi (so.n11.com) → Hesabım → API Hesapları → Yeni Hesap Oluştur; App Key ve App Secret e-postayla gelir.',
  idefix: 'idefix satıcı paneli → Hesap Bilgileri → Entegrasyon Bilgileri → Yeni API Oluştur (API Key, API Secret) ve Vendor ID.',
  pazarama: 'Pazarama iş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri (API Key = Client ID, API Secret).',
  amazon: 'Amazon Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme: özel (private) SP-API uygulaması oluşturun, kendi mağazanız için yetkilendirin; LWA Client ID / Secret ve refresh token buradan alınır. Siparişler, stok, fiyat ve kargo bildirimi (takip no) desteklenir; alıcı adres bilgisini Amazon kısıtlı veri olarak verir.',
  ciceksepeti: 'Çiçeksepeti satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri → API anahtarı. Siparişler, ürünler, stok ve fiyat; kargo Çiçeksepeti anlaşmasıyla, etiket Çiçeksepeti panelinden.',
  koctas: 'Koçtaş pazaryeri (Mirakl satıcı paneli) → sağ üst kullanıcı menüsü → API Anahtarı. Siparişleri onaylama, kargo/takip bildirimi, stok ve fiyat desteklenir.',
  shopify: 'Shopify yönetimde yeni özel uygulama oluşturmayı kapattı; uygulama Dev Dashboard\'dan açılır: dev.shopify.com → Dev Dashboard → Uygulama oluştur → kapsamlar: read_orders, read_all_orders, write_products, write_inventory, read_locations, write_merchant_managed_fulfillment_orders, write_fulfillments → uygulamayı mağazanıza kurun → Ayarlar\'daki Client ID ve Client secret\'ı girin (panel 24 saatlik erişim belirtecini kendisi yeniler). Eski shpat_… belirteciniz varsa Gelişmiş ayarlar\'a girebilirsiniz.',
  woocommerce: 'WordPress yönetimi → WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle (İzin: Okuma/Yazma). Site HTTPS olmalı; kalıcı bağlantılar "Yazı adı" gibi açık olmalı.',
  opencart: 'OpenCart\'ın hazır bir yönetim API\'si olmadığından bağlantı küçük bir PHP dosyasıyla kurulur: Bağlantı dosyasını indirin, OpenCart\'ın kurulu olduğu ana klasöre (config.php\'nin yanına) yükleyin, site adresini girip bağlantıyı test edin. Dosya veritabanına OpenCart\'ın kendi bilgileriyle bağlanır, yalnız panelin anahtarıyla çalışır. Siparişler, ürünler (seçenekler ayrı varyant), stok, fiyat ve kargo bildirimi desteklenir. Site HTTPS olmalı.',
  etsy: 'etsy.com/developers → Create a New App (keystring + shared secret); uygulamayı mağazanız için OAuth ile yetkilendirip refresh token alın. Siparişler, stok, fiyat ve kargo bildirimi desteklenir; panel yenilenen belirteci kendisi saklar.',
};
// Test modülü: bu kanallar ana panelde bağlanıp denenir; müşteri panellerinde "Yakında" görünür
const BETA = ['amazon', 'ciceksepeti', 'koctas', 'shopify', 'woocommerce', 'opencart', 'etsy'];

// Sıra: kanal türü (ikas, Hepsiburada, Trendyol, ...), aynı türde önce ana mağaza sonra eklenenler
const TYPES = ['ikas', 'hepsiburada', 'trendyol', 'pttavm', 'n11', 'idefix', 'pazarama', ...BETA];
const TYPE_NAME = { ikas: 'ikas (web sitesi)', hepsiburada: 'Hepsiburada', trendyol: 'Trendyol', pttavm: 'PttAVM', n11: 'N11', idefix: 'idefix', pazarama: 'Pazarama', amazon: 'Amazon', ciceksepeti: 'Çiçeksepeti', koctas: 'Koçtaş', shopify: 'Shopify', woocommerce: 'WooCommerce', opencart: 'OpenCart', etsy: 'Etsy' };
// Yakında eklenecek satış kanalları (seçilemez, yalnız bilgi): müşteri panellerinde test modülündekiler de burada
const SOON = () => [...(state.tenant ? BETA.map((t) => TYPE_NAME[t]) : []), 'Teknosa', 'Turkcell Pasaj'];
const rank = (c) => TYPES.indexOf(c.type) * 1000 + (c.extra ? Number(c.id.split('_')[1]) || 99 : c.id === 'ikas2' ? 2 : 1);
const when = (ms) => (ms ? html`<span title="${dateTime(ms)}">${ago(ms)}</span>` : html`<span class="muted">henüz yok</span>`);

// Kanal kurulmuş mu: bağlı, örnek veriyle çalışıyor ya da panelde bilgi girilmiş (test bekliyor)
const configured = (c) => c.enabled || c.demo || c.fields.some((f) => f.source) || c.extra;
const SITES = ['ikas', 'shopify', 'woocommerce', 'opencart'];
// Satıcı panelleri (bilgilerin alındığı yer)
const PANEL_URL = { trendyol: 'https://partner.trendyol.com', hepsiburada: 'https://merchant.hepsiburada.com', n11: 'https://so.n11.com', amazon: 'https://sellercentral.amazon.com.tr', etsy: 'https://www.etsy.com/developers/your-apps', pazarama: 'https://isortagim.pazarama.com' };
const panelUrl = (c) => (c.type === 'ikas' ? ((c.fields.find((f) => /STORE$/.test(f.k)) || {}).value ? `https://${c.fields.find((f) => /STORE$/.test(f.k)).value}.myikas.com/admin` : 'https://ikas.com') : PANEL_URL[c.type] || '');
const CAPS = (c) => [c.caps.accept === 'remote' && 'Siparişi kanalda işleme alma', c.caps.ship === 'remote' && 'Kargo / takip bildirimi', c.caps.label && 'Kargo etiketi', 'Stok gönderimi', c.caps.price && 'Fiyat gönderimi', c.caps.createProduct && 'Ürün oluşturma', c.claims && 'İade talepleri', c.campaigns && 'Kampanyalar'].filter(Boolean);
const ok = (on, yes, no) => html`<span class="istat ${on === true ? 'on' : on === false ? 'off' : 'na'}"><i class="ico ico-${on === true ? 'check' : on === false ? 'x' : 'dots'}"></i>${on === true ? yes : on === false ? no : '—'}</span>`;

export async function integrations(el, rest = []) {
  const id = rest[0] ? decodeURIComponent(rest[0]) : '';
  let data = null, jobs = [], modes = [], f = { show: 'all', q: '' };
  try { f.show = sessionStorage.getItem('integ_show') || 'all'; } catch { /* yok */ }
  async function load() {
    [data, jobs, modes] = await Promise.all([api('integrations'), api('backfill').catch(() => []), api('channel-products/channels').catch(() => [])]);
    data.channels.sort((a, b) => rank(a) - rank(b));
    draw();
  }
  const st = () => state.settings || {};
  const held = (c) => (st().hold_channels || []).includes(c.id);
  const isCatalog = (c) => (st().catalog_channels || ['ikas1']).includes(c.id);
  const stockOn = (c) => (st().stock_sync ? (st().stock_channels || {})[c.id] !== false : !!(st().stock_push || {})[c.id]);
  const modeOf = (c) => modes.find((m) => m.channel === c.id);
  const stateOf = (c) => {
    const [k, t] = chState(c);
    return { k: !configured(c) && !c.paused ? 'off' : k, t: !configured(c) ? 'Bağlı değil' : t };
  };

  // ---------- genel bakış: kanal kartları ----------
  function icard(c) {
    const s = stateOf(c), conf = configured(c), linkP = c.listings ? Math.round((c.linked / c.listings) * 100) : 0;
    return html`<div class="icard ${conf ? 'conf' : ''} ${s.k}" data-act="open" data-id="${c.id}" tabindex="0">
      <div class="ic-top">${chLogo(c.id)}<div class="ic-name"><b class="ellipsis">${c.type === 'ikas' ? `ikas · ${c.name}` : c.name}</b>
          <div class="ic-st"><span class="led ${s.k === 'off' ? 'off' : s.k === 'err' ? 'err' : s.k === 'demo' ? 'demo' : ''}"></span>${s.t}${c.beta ? html`<span class="pill info tiny">Test modülü</span>` : ''}${c.sandbox ? html`<span class="pill warn tiny">Test ortamı</span>` : ''}</div></div>
        <button class="btn sm ${conf ? 'outline' : 'primary'}" data-act="open" data-id="${c.id}">${conf ? html`<i class="ico ico-gear"></i>Yönet` : html`<i class="ico ico-plus"></i>Bağla`}</button></div>
      ${conf && (c.enabled || c.demo) ? html`<div class="ic-prog"><div class="row small"><span class="muted">Eşleşen ilan</span><span class="spacer"></span><b class="num">${n(c.linked)} / ${n(c.listings)}</b></div><div class="prog"><span style="width:${linkP}%"></span></div></div>`
        : html`<div class="ic-need small muted">${conf ? 'Bilgiler girildi; bağlantı testi bekleniyor.' : `Gerekenler: ${c.fields.filter((x) => x.req).map((x) => x.label).join(', ') || 'API bilgileri'}`}</div>`}
      ${!conf ? html`<div class="ic-caps">${CAPS(c).slice(0, 4).map((x) => html`<span>${x}</span>`)}</div>` : html`<div class="ic-stats">
        <div><span>Siparişler</span>${c.enabled || c.demo ? (c.last && c.last.ok === false ? html`<span class="istat off"><i class="ico ico-x"></i>Hata</span>` : ok(true, c.last && c.last.ordersAt ? ago(c.last.ordersAt) : 'Açık')) : ok(null)}</div>
        <div><span>Stok gönderimi</span>${c.enabled || c.demo ? (isCatalog(c) ? html`<span class="istat na"><i class="ico ico-db"></i>Ana katalog</span>` : ok(stockOn(c), 'Açık', 'Kapalı')) : ok(null)}</div>
        <div><span>Kanala yazma</span>${c.enabled || c.demo ? ok(!held(c), 'Açık', 'Beklemede') : ok(null)}</div>
      </div>`}
      ${c.last && c.last.ok === false ? html`<div class="ic-err small"><i class="ico ico-warn"></i><span class="ellipsis">${c.last.error || 'Senkron başarısız'}</span></div>` : ''}
    </div>`;
  }
  function overview() {
    const all = data.channels, conn = all.filter((c) => c.enabled || c.demo), errs = all.filter((c) => c.last && c.last.ok === false), wait = all.filter((c) => configured(c) && !c.enabled && !c.demo && c.gated);
    const groups = [['all', 'Tümü', all.length], ['on', 'Bağlı', conn.length], ['off', 'Bağlanmamış', all.filter((c) => !configured(c)).length], ['market', 'Pazaryerleri', all.filter((c) => !SITES.includes(c.type)).length], ['site', 'E-ticaret siteleri', all.filter((c) => SITES.includes(c.type)).length]];
    const q = f.q.toLocaleLowerCase('tr');
    const list = all.filter((c) => (f.show === 'all' || (f.show === 'on' ? c.enabled || c.demo : f.show === 'off' ? !configured(c) : f.show === 'site' ? SITES.includes(c.type) : !SITES.includes(c.type))) && (!q || `${c.name} ${TYPE_NAME[c.type] || ''}`.toLocaleLowerCase('tr').includes(q)))
      .sort((a, b) => Number(configured(b)) - Number(configured(a)));
    render(el, html`<div class="stack">
      <div class="ihead card">
        <div class="ih-kpi"><b class="num">${n(conn.length)}</b><span>bağlı kanal</span></div>
        <div class="ih-kpi ${errs.length ? 'bad' : ''}"><b class="num">${n(errs.length)}</b><span>hatalı</span></div>
        <div class="ih-kpi ${wait.length ? 'warn' : ''}"><b class="num">${n(wait.length)}</b><span>test bekliyor</span></div>
        <div class="ih-txt muted small">Bağlı kanallar <b>15 dakikada bir</b> otomatik kontrol edilir: siparişler, ürünler, stoklar güncellenir. Sorun olursa <a class="link" href="#/bildirimler">Bildirimler</a>'e düşer.</div>
        <div class="row" style="gap:8px"><button class="btn" data-act="syscheck"><i class="ico ico-bolt"></i>Sistem kontrolü</button>${isAdmin() ? html`<button class="btn primary" data-act="addmenu"><i class="ico ico-plus"></i>Mağaza ekle</button>` : ''}</div>
      </div>
      <div class="row wrap"><div class="tabs" style="flex:1;min-width:0">${groups.map(([k, t, cnt]) => html`<button class="tab ${f.show === k ? 'on' : ''}" data-act="show" data-k="${k}">${t} <span class="n">${cnt}</span></button>`)}</div>
        <label class="search" style="max-width:260px"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Kanal ara" data-q value="${f.q}"></label></div>
      ${!conn.length ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Henüz bağlı satış kanalınız yok. Satış yaptığınız kanalın kartında <b>Bağla</b>'ya basın; bilgileri girip <b>Kaydet ve bağlantıyı test et</b> deyince siparişleriniz gelmeye başlar.</div></div>` : ''}
      <div class="icards">${list.map(icard)}</div>
      ${!list.length ? html`<div class="card empty">Bu filtrede kanal yok</div>` : ''}
      <div class="row wrap small" style="gap:6px"><span class="muted">Yakında:</span>${SOON().map((t) => html`<span class="pill">${t}</span>`)}</div>
      ${conn.some((c) => !c.demo) || jobs.length ? backfill() : ''}
    </div>`);
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
        ${live ? html`<button class="btn sm" data-act="sync" data-id="${c.id}"><i class="ico ico-sync"></i>Siparişleri ve ürünleri çek</button>` : ''}</div>
      <div class="idetail" data-ch="${c.id}">
        <aside class="card id-side">
          <div class="id-brand">${chLogo(c.id)}<div style="min-width:0"><h2>${c.type === 'ikas' ? `ikas · ${c.name}` : c.name}</h2><div class="ic-st"><span class="led ${s.k === 'off' ? 'off' : s.k === 'err' ? 'err' : s.k === 'demo' ? 'demo' : ''}"></span>${s.t}</div></div></div>
          ${c.beta ? html`<div class="notice small"><div><b>Test modülü:</b> yalnız bu panelde açık; firmalarda “Yakında” görünür.</div></div>` : ''}
          <div class="id-sws">
            ${sw('active', c.id, c.active, 'Kanal aktif', 'Kapalıysa senkronlanmaz', !admin)}
            ${sw('write', c.id, !held(c), 'Kanala yazma', 'Kapalıysa yalnız okunur: paketleme, stok, fiyat gönderilmez', !admin || !live)}
            ${isCatalog(c) ? html`<div class="iswitch dis"><span style="flex:1"><b>Stok gönderimi</b><span class="muted tiny">Ana katalog: stok bu kanaldan okunur</span></span></div>`
              : sw('stock', c.id, stockOn(c), 'Stok gönderimi', st().stock_sync ? 'Panel stoğu bu kanala otomatik gider' : 'Genel stok senkronu kapalıyken yalnız bu kanala gönderilir', !admin || !live)}
            ${m ? sw('mode', c.id, !m.manual, 'Yeni ilanları otomatik ekle', 'Kapalıysa yeni ilanları Kanal Ürünleri\'nden siz seçersiniz', !admin) : ''}
          </div>
          ${live ? html`<dl class="id-kv small">
            <dt>Siparişler</dt><dd>${c.last && c.last.ordersAt ? html`<span title="${dateTime(c.last.ordersAt)}">${ago(c.last.ordersAt)}</span>` : '—'}</dd>
            <dt>Ürün / stok</dt><dd>${c.last && c.last.listingsAt ? html`<span title="${dateTime(c.last.listingsAt)}">${ago(c.last.listingsAt)}</span>` : '—'}</dd>
            <dt>İlan</dt><dd class="num">${n(c.listings)}</dd><dt>Eşleşmiş</dt><dd class="num">${n(c.linked)}${c.listingErrors ? html` · <span style="color:var(--bad)">${c.listingErrors} hatalı</span>` : ''}</dd></dl>` : ''}
          <div class="id-acts">
            ${live ? html`<button class="btn sm ghost" data-act="import"><i class="ico ico-download"></i>İlanları içe aktar</button>` : ''}
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
    show: (t) => { f.show = t.dataset.k; try { sessionStorage.setItem('integ_show', f.show); } catch { /* yok */ } draw(); },
    syscheck: () => systemCheck(data.channels.filter((c) => (c.enabled && !c.paused) || (c.gated && !(c.missing || []).length)).map((c) => ({ id: c.id, name: c.name }))),
    addmenu: (t) => {
      const types = TYPES.filter((x) => !(state.tenant && BETA.includes(x)));
      popMenu(t, types.map((x) => ({ label: `${TYPE_NAME[x]}${BETA.includes(x) ? ' (test modülü)' : ''}`, run: () => busy(null, async () => {
        const r = await api('integrations/add', { method: 'POST', body: { type: x } });
        toast(`${TYPE_NAME[x]}: yeni mağaza eklendi — bilgilerini girin`); await loadSummary().catch(() => {});
        location.hash = '#/entegrasyonlar/' + encodeURIComponent(r.id);
      }) })), { title: 'Hangi kanala mağaza eklensin?' });
    },
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
