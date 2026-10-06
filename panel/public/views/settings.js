// Ayarlar: firma bilgileri ve logo, stok senkronu ve stok sınırı, ana katalog, komisyon/kargo, kargo etiketi, kayıtlar.
// Kanal API bilgileri Entegrasyonlar'da, kullanıcılar Kullanıcılar sayfasındadır.
import { api, state, html, render, $, $$, n, dateTime, ch, chLogo, actions, busy, toast, numIn, confirmBox, isAdmin, activeChannels, sheet } from '../core.js';
import { apiGuide } from '../apiguide.js';
import { loadSummary } from '../app.js';
import { costOf, COST_KEYS } from '../profit.js';
import { pushState, enablePush, disablePush } from '../push-client.js';

// Logoyu en fazla 600×200 px PNG'ye küçült (veritabanında küçük yer kaplasın)
function shrink(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / img.width, 200 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Görsel okunamadı'));
    img.src = URL.createObjectURL(file);
  });
}

export async function settingsView(el) {
  const admin = isAdmin();
  // Anlık bildirim kartı (her kullanıcı kendi cihazı için açar)
  async function drawPush() {
    const box = $('[data-pushbox]', el); if (!box) return;
    const st = await pushState().catch(() => 'unsupported');
    render(box, html`<h2>Anlık bildirim (bu cihaz)</h2>
      <div class="muted small">Yeni sipariş, iade talebi ve müşteri sorusu bu telefona / bilgisayara bildirim olarak gelir (15 dakikalık senkronda, tek özet bildirim). Her cihazda ayrı açılır.</div>
      ${st === 'on' ? html`<div class="row wrap"><span class="pill good">Bu cihazda açık</span><span class="spacer"></span><button class="btn" data-act="push-test">Deneme bildirimi gönder</button><button class="btn ghost" data-act="push-off">Kapat</button></div>`
        : st === 'off' ? html`<div class="row wrap"><button class="btn primary" data-act="push-on"><i class="ico ico-bell"></i>Bu cihazda bildirimleri aç</button></div>`
        : st === 'denied' ? html`<div class="notice warn small">Bildirim izni bu tarayıcıda reddedilmiş. Adres çubuğundaki kilit simgesi → Bildirimler → İzin ver, sonra sayfayı yenileyin.</div>`
        : st === 'ios-install' ? html`<div class="notice small">iPhone'da bildirim için paneli ana ekrana ekleyin: Safari → <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>; sonra ana ekrandaki simgeden açıp buradan bildirimleri açın (iOS 16.4 ve üzeri).</div>`
        : html`<div class="notice warn small">Bu tarayıcı anlık bildirimi desteklemiyor. Chrome, Edge, Firefox ya da Safari'nin güncel sürümünü kullanın.</div>`}`);
  }
  let tab = 'firma';
  try { tab = sessionStorage.getItem('settings_tab') || 'firma'; } catch { /* yok */ }
  const STABS = [['firma', 'Firma', 'user'], ['stok', 'Stok', 'db'], ['giderler', 'Komisyon ve giderler', 'calc'], ...(state.tenant ? [] : [['doviz', 'Döviz', 'tag']]), ['bildirim', 'Bildirimler', 'bell'], ['etiket', 'Kargo etiketi', 'print'], ...(state.tenant || !admin ? [] : [['api', 'Stok API', 'link']]), ['kayit', 'İşlem kayıtları', 'orders']];
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (b) showTab(b.dataset.st); });
  const load = async () => { await load0(); drawPush(); };
  async function load0() {
    const [chs, st, logs, mail] = await Promise.all([api('channels'), api('settings'), api('logs'), admin ? api('integrations/mail').catch(() => null) : null]);
    state.settings = st;
    const live = chs.filter((c) => !c.paused);
    const co = st.company || {};
    const dis = admin ? '' : 'disabled';
    const mf = (k) => (mail ? mail.fields.find((x) => x.k === k) : null) || {};
    const prov = mf('MAIL_PROVIDER').value || (mf('MAIL_API_KEY').masked ? 'brevo' : 'smtp');
    const ownMail = prov === 'smtp' ? !!(mf('MAIL_SMTP_HOST').value && mf('MAIL_SMTP_PASS').masked) : !!mf('MAIL_API_KEY').masked;
    // Müşteri panelinde e-posta varsayılan olarak hizmet sağlayıcının altyapısıyla gider (kurulum gerekmez)
    const platformMail = !!(mail && mail.platform) && !ownMail, mailReady = ownMail || platformMail;
    render(el, html`<div class="stack" style="max-width:1000px">
      ${!admin ? html`<div class="notice"><i class="ico ico-warn"></i>Ayarları sadece yönetici değiştirebilir.</div>` : ''}
      <div class="tabs stabs" data-stabs>${STABS.map(([k, t, i]) => html`<button class="tab" data-st="${k}"><i class="ico ico-${i}"></i>${t}</button>`)}</div>
      <div class="card stack" data-stab="firma">
        <h2>Firma bilgileri</h2>
        <div class="row wrap" style="gap:16px;align-items:center">
          <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px"><img src="${st.logo || 'logo.webp'}" alt="Logo" style="height:56px;max-width:240px;object-fit:contain;display:block" data-logo-prev></div>
          <div class="row wrap">
            <label class="btn sm ${admin ? '' : 'hide'}"><i class="ico ico-upload"></i>Logo yükle<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-logo-file hidden></label>
            ${st.logo && admin ? html`<button class="btn sm ghost" data-act="logo-reset">Varsayılan logo</button>` : ''}
          </div>
        </div>
        <div class="form-grid">
          <label class="field"><span>Kısa ad (menüde)</span><input class="input" data-co="title" value="${co.title || ''}" ${dis}></label>
          <label class="field"><span>Firma unvanı</span><input class="input" data-co="legal" value="${co.legal || ''}" placeholder="ör. Hastürk Tarım Ürünleri Ltd. Şti." ${dis}></label>
          <label class="field"><span>Telefon</span><input class="input" data-co="phone" value="${co.phone || ''}" ${dis}></label>
          <label class="field"><span>E-posta</span><input class="input" data-co="email" value="${co.email || ''}" ${dis}></label>
          <label class="field"><span>Adres</span><input class="input" data-co="address" value="${co.address || ''}" ${dis}></label>
          <label class="field"><span>Vergi dairesi / no</span><input class="input" data-co="tax" value="${co.tax || ''}" ${dis}></label>
        </div>
      </div>

      <div class="card stack" data-stab="stok">
        <div class="card-head" style="margin:0"><h2>Stok</h2><button class="btn sm" data-act="push-stock"><i class="ico ico-upload"></i>Stokları şimdi gönder</button></div>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="stock_sync" ${st.stock_sync ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>Stokları tüm kanallarda senkron tut</b><br><span class="small muted">Bir kanalda satış olunca ortak stok düşer ve her kanala kendi kuralına göre (ortak / üst sınır / kanala özel adet) gönderilir. ${st.stock_sync && st.stock_since ? `Açıldığı an: ${dateTime(st.stock_since)} (öncesindeki siparişler stoğu etkilemez).` : 'Kapalıyken hiçbir kanala stok gönderilmez; panel stokları ikas sitesindeki (ana katalog) adetlerden okunur. Açmadan önce Eşleştirme sayfasını tamamlayın ve stok adetlerini kontrol edin.'}</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="restock_returns" ${st.restock_returns ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>İade gelen ürünü stoğa geri ekle</b><br><span class="small muted">İptal edilen siparişler her zaman stoğa geri eklenir.</span></span></label>
        <div class="form-grid">
          <label class="field"><span>Stok sınırı (bu adet ve altı “sınırın altında”)</span><input class="input" inputmode="numeric" data-low value="${st.low_stock}" ${dis}><small>Ürüne özel kritik stok girilmişse o kullanılır.</small></label>
        </div>
        <div><div class="small" style="font-weight:650;margin-bottom:6px">Stok gönderilecek kanallar</div><div class="row wrap">${live.map((c) => html`<label class="check"><input type="checkbox" data-stockch="${c.id}" ${(st.stock_channels || {})[c.id] === false ? '' : 'checked'} ${dis}> ${chLogo(c.id, true)}${c.name}</label>`)}</div></div>
        <div><div class="small" style="font-weight:650;margin-bottom:6px">Ana katalog (eşleşmeyen ürünleri otomatik oluşturan kanallar)</div><div class="row wrap">${live.filter((c) => c.type === 'ikas').map((c) => html`<label class="check"><input type="checkbox" data-catalog="${c.id}" ${(st.catalog_channels || []).includes(c.id) ? 'checked' : ''} ${dis}> ${chLogo(c.id, true)}${c.name}</label>`)}</div>
          <div class="muted tiny" style="margin-top:4px">Diğer kanallardaki ilanlar barkod / stok kodu kesin tutuyorsa otomatik bağlanır; tutmuyorsa Eşleştirme sayfasında onayınızı bekler.</div></div>
      </div>

      <div class="card stack" data-fxcard data-stab="${state.tenant ? 'giderler' : 'doviz'}">${state.tenant ? html`<h2>Döviz ve fiyat <span class="pill info">Yakında</span></h2><div class="muted small">Dolar, euro ve sterlin bazlı ürün fiyatı; anlık / günlük / haftalık / aylık kur güncellemesi yakında panelinizde.</div>` : html`<div class="empty"><i class="ico ico-sync spin"></i></div>`}</div>

      <div class="card flush" data-stab="giderler"><div class="card-pad"><h2>Komisyon ve giderler</h2><div class="muted small" style="margin-top:4px">Sipariş ve istatistiklerdeki tahmini kâr bu değerlerle hesaplanır. Ürüne özel komisyon ürün formundan girilir.</div></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Komisyon %</th><th class="r">Sipariş başı kargo ₺</th><th class="r" title="Sipariş başına sabit platform / hizmet bedeli">Hizmet bedeli ₺</th><th class="r" title="Satış tutarının yüzdesi: işlem, ödeme veya altyapı bedeli">Ek kesinti %</th><th class="r" title="E-ticaret stopajı: KDV hariç satış tutarı üzerinden pazaryerinin kestiği gelir vergisi">Stopaj %</th></tr></thead><tbody>
        ${live.map((c) => html`<tr><td><span class="ch-name">${chLogo(c.id, true)}${c.name}</span></td>
          ${COST_KEYS.map((k) => { const own = (st[k] || {})[c.id], extra = /_\d+$/.test(c.id); return html`<td class="r"><input class="input" style="width:92px;text-align:right" inputmode="decimal" data-cost="${k}:${c.id}" value="${extra ? own ?? '' : costOf(st, k, c.id)}" placeholder="${extra ? costOf(st, k, c.id) : ''}" title="${extra ? 'Boş bırakılırsa aynı türdeki ana mağazanın değeri kullanılır' : ''}" ${dis}></td>`; })}</tr>`)}
      </tbody></table></div>
        <div class="card-pad muted tiny" style="padding-top:0">Masraf basamakları: satış − komisyon − kargo − hizmet bedeli − ek kesinti − stopaj = hakediş; hakediş − alış = kâr. Stopaj, pazaryerlerinin 2025'ten beri hakedişten kestiği gelir vergisidir (KDV hariç satış üzerinden, genelde %1); yıllık vergiden mahsup edilir. Kendi siteniz (ikas) için 0 bırakın.</div></div>

      <div class="card stack" data-pushbox data-stab="bildirim"><h2>Anlık bildirim (bu cihaz)</h2><div class="muted small">Yükleniyor…</div></div>

      ${admin ? html`<div class="card stack" data-mailbox data-stab="bildirim">
        <h2>Yeni sipariş e-posta bildirimi</h2>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="mail_enabled" ${st.mail_enabled ? 'checked' : ''}><span></span></span>
          <span><b>Yeni sipariş gelince e-posta gönder</b><br><span class="small muted">Her sipariş için bir kez gönderilir; 15 dakikalık senkronda aynı sipariş için tekrar gönderilmez. Kanalların ilk aktarımı ve geçmiş sipariş aktarımı e-posta oluşturmaz.</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="daily_digest" ${st.daily_digest ? 'checked' : ''}><span></span></span>
          <span><b>Her sabah günlük özet e-postası gönder</b><br><span class="small muted">Saat 08:00'den sonra: dünün cirosu, sipariş sayısı ve tahmini kârı (önceki günle karşılaştırmalı, kanal kanal), bugün kargoya hazırlanacak / geciken siparişler, bekleyen iade ve sorular, stokta olmayan ve tükenmek üzere olan ürünler. Aşağıdaki alıcılara gider.</span></span></label>
        <div class="form-grid">
          <label class="field"><span>Bildirim alacak e-postalar</span><input class="input" data-mailto value="${(st.mail_to || []).join(', ')}" placeholder="ornek@firma.com, ikinci@firma.com"><small>Virgülle ayırın (en fazla 10)</small></label>
          ${state.tenant ? '' : html`<label class="field"><span>Panel adresi</span><input class="input" data-panelurl value="${st.panel_url || ''}" placeholder="https://hasturk-panel.xxx.workers.dev"><small>E-postadaki “Siparişi panelde aç” bağlantısı</small></label>`}
        </div>
        ${state.tenant ? '' : html`<div class="notice small"><i class="ico ico-link"></i><div><b>Paneli kendi alt alan adınızdan açmak</b> (ör. crm.alanadiniz.com.tr, DNS'i taşımadan): cPanel'de alt alan adı oluşturun, <a class="link" href="/api/panel-proxy" download="index.php">index.php</a> dosyasını indirip o alt alan adının klasörüne yükleyin, AutoSSL ile sertifika alın. Panel adresi ilk girişte kendiliğinden güncellenir.</div></div>`}
        <div><div class="small" style="font-weight:650;margin-bottom:6px">E-posta alınacak mağazalar / pazaryerleri</div><div class="row wrap">${live.map((c) => html`<label class="check"><input type="checkbox" data-mailch="${c.id}" ${(st.mail_channels || {})[c.id] === false ? '' : 'checked'}> ${chLogo(c.id, true)}${c.name}</label>`)}</div></div>
        ${platformMail ? html`<div class="notice good small"><i class="ico ico-check"></i><div>E-posta bildirimleri <b>hazır</b>: kurulum gerekmez, e-postalar firma adınızla gönderilir. Kendi e-posta adresinizden göndermek isterseniz aşağıdan kendi sunucunuzu girebilirsiniz.</div></div>` : ''}
        <details ${mailReady ? '' : 'open'}><summary style="cursor:pointer;font-weight:650">${platformMail ? 'Kendi e-posta sunucumu kullan (isteğe bağlı)' : html`E-posta servisi ${mailReady ? html`<span class="pill good" style="margin-left:6px">bağlı · ${mf('MAIL_FROM').value || mf('MAIL_SMTP_USER').value || ''}</span>` : html`<span class="pill warn" style="margin-left:6px">kurulmadı</span>`}`}</summary>
          <div class="stack" style="margin-top:10px">
            <div class="form-grid">
              <label class="field"><span>Servis</span><select class="input" data-mailf="MAIL_PROVIDER" data-prov>${[['smtp', 'Kendi e-posta sunucum (SMTP)'], ['brevo', 'Brevo'], ['resend', 'Resend']].map(([v, t]) => html`<option value="${v}" ${prov === v ? 'selected' : ''}>${t}</option>`)}</select></label>
              <label class="field"><span>Gönderen e-posta</span><input class="input" data-mailf="MAIL_FROM" value="${mf('MAIL_FROM').value || ''}" placeholder="bildirim@firma.com"><small>Bildirimlerin gönderileceği adres</small></label>
              <label class="field"><span>Gönderen adı</span><input class="input" data-mailf="MAIL_FROM_NAME" value="${mf('MAIL_FROM_NAME').value || ''}" placeholder="Hastürk Panel"></label>
            </div>
            <div class="stack" data-provbox="smtp" ${prov === 'smtp' ? '' : 'hidden'}>
              <div class="notice small"><div><b>Kendi e-posta adresinizden gönderim:</b> hosting / kurumsal e-posta panelinizdeki (cPanel → E-posta Hesapları → Bağlan / Connect Devices) <b>giden posta (SMTP)</b> bilgilerini girin. Port <b>465</b> (SSL) ya da <b>587</b> (STARTTLS) olmalı${state.tenant ? '' : "; 25 numaralı port Cloudflare'de kapalıdır"}. Kullanıcı adı genelde e-posta adresinin kendisidir.</div></div>
              <div class="form-grid">
                <label class="field"><span>SMTP sunucusu</span><input class="input" data-mailf="MAIL_SMTP_HOST" value="${mf('MAIL_SMTP_HOST').value || ''}" placeholder="mail.alanadiniz.com.tr" autocapitalize="off"></label>
                <label class="field"><span>Port</span><select class="input" data-mailf="MAIL_SMTP_PORT">${['465', '587'].map((v) => html`<option value="${v}" ${(mf('MAIL_SMTP_PORT').value || '465') === v ? 'selected' : ''}>${v === '465' ? '465 (SSL)' : '587 (STARTTLS)'}</option>`)}</select></label>
                <label class="field"><span>Kullanıcı adı</span><input class="input" data-mailf="MAIL_SMTP_USER" value="${mf('MAIL_SMTP_USER').value || ''}" placeholder="bildirim@firma.com" autocapitalize="off" autocomplete="off"></label>
                <label class="field"><span>Şifre</span><input class="input" type="password" autocomplete="new-password" data-mailf="MAIL_SMTP_PASS" placeholder="${mf('MAIL_SMTP_PASS').masked || 'e-posta hesabının şifresi'}"><small>${mf('MAIL_SMTP_PASS').masked ? 'Kayıtlı (şifreli). Değiştirmek için yenisini yazın.' : 'Şifreli saklanır, ekranda tekrar gösterilmez.'}</small></label>
              </div>
            </div>
            <div class="stack" data-provbox="api" ${prov === 'smtp' ? 'hidden' : ''}>
              <div class="notice small"><div><b>Brevo (ücretsiz, alan adı gerekmez):</b> brevo.com'da hesap açın → <i>Senders</i> bölümünde gönderen adresinizi doğrulayın → <i>SMTP & API → API Keys</i> bölümünden anahtar oluşturup yapıştırın. <b>Resend</b> için alan adınızı Resend'de doğrulamanız gerekir.</div></div>
              <label class="field"><span>API anahtarı</span><input class="input" type="password" autocomplete="off" data-mailf="MAIL_API_KEY" placeholder="${mf('MAIL_API_KEY').masked || 'yapıştırın'}"><small>${mf('MAIL_API_KEY').masked ? 'Kayıtlı (şifreli). Değiştirmek için yenisini yapıştırın.' : 'Şifreli saklanır, ekranda tekrar gösterilmez.'}</small></label>
            </div>
          </div></details>
        <div class="row wrap"><button class="btn" data-act="mail-test"><i class="ico ico-chat"></i>Deneme e-postası gönder</button><button class="btn" data-act="digest-test"><i class="ico ico-bars"></i>Örnek günlük özet gönder</button><span class="spacer"></span><button class="btn primary" data-act="mail-save">Bildirim ayarlarını kaydet</button></div>
      </div>` : ''}

      <div class="card stack" data-stab="etiket">
        <h2>Kargo etiketi</h2>
        <div class="form-grid">
          <label class="field"><span>Gönderen</span><input class="input" data-sender="name" value="${st.sender.name || co.title || ''}" ${dis}></label>
          <label class="field"><span>Telefon</span><input class="input" data-sender="phone" value="${st.sender.phone || ''}" ${dis}></label>
          <label class="field"><span>Adres</span><input class="input" data-sender="address" value="${st.sender.address || ''}" ${dis}></label>
          <label class="field"><span>İlçe / il</span><input class="input" data-sender="city" value="${st.sender.city || ''}" ${dis}></label>
          <label class="field"><span>Kargo firmaları (virgülle)</span><input class="input" data-cargos value="${(st.cargo_companies || []).join(', ')}" ${dis}></label>
          <label class="field"><span>Kendi etiketimizin boyutu</span><select class="input" data-labelsize ${dis}>${[['100x150', '10 × 15 cm (termal yazıcı)'], ['a5', 'A5 (normal yazıcı)'], ['a4', 'A4 (normal yazıcı)']].map(([v, t]) => html`<option value="${v}" ${(st.label_size || '100x150') === v ? 'selected' : ''}>${t}</option>`)}</select></label>
          <label class="field"><span>İlk senkronda geçmiş (gün)</span><input class="input" inputmode="numeric" data-history value="${st.history_days}" ${dis}></label>
        </div>
        <label class="field"><span>Kargo takip adresleri (“Kargoyu takip et” düğmesi)</span><textarea class="input" data-track style="min-height:120px;font-family:ui-monospace,monospace;font-size:12.5px" ${dis}>${Object.entries(st.track_urls || {}).map(([k, v]) => `${k} = ${v}`).join('\n')}</textarea>
          <small>Her satır: <b>Firma = adres</b>; adreste takip numarasının geleceği yere <b>{no}</b> yazın. Kanal resmi takip bağlantısı verdiyse (ikas, Trendyol) önce o kullanılır.</small></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="label_own" ${st.label_own !== false ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>Hepsiburada etiketini bizim tasarımla bas</b><br><span class="small muted">Kargo barkodu (takip numarası) Hepsiburada'dan alınır ve panelin etiket tasarımına basılır; Hepsiburada'nın kendi etiketi saklanır, paket menüsünden indirilebilir. Kapalıyken Hepsiburada'nın etiketi basılır.</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="zpl_pdf" ${st.zpl_pdf ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>Etiketleri PDF olarak ver (normal yazıcı)</b><br><span class="small muted">Trendyol ve Hepsiburada etiketi termal yazıcı biçiminde (ZPL) gelir. Açıkken Hepsiburada'dan doğrudan PDF istenir; kanal PDF vermezse ZPL, Labelary servisiyle PDF'e çevrilir (etiket içeriği — alıcı adı / adresi — bu servise gönderilir). Kapalıyken etiket alınınca “PDF olarak aç / ZPL indir” sorulur.</span></span></label>
      </div>
      ${admin ? html`<div class="savebar" data-savebar><span class="muted small" data-savehint>Değişiklikleri kaydetmeyi unutmayın.</span><span class="spacer"></span><button class="btn primary lg" data-act="save">Kaydet</button></div>` : ''}

      ${!state.tenant && admin ? html`<div class="card stack" data-stab="api" data-apibox><div class="empty"><i class="ico ico-sync spin"></i></div></div>` : ''}
      <div class="card flush" data-stab="kayit"><div class="card-pad row"><h2 style="flex:1">İşlem kayıtları</h2>${admin && state.demo ? html`<button class="btn sm ghost danger" data-act="purge">Örnek (demo) verileri temizle</button>` : ''}<a class="btn sm ghost" href="#/bildirimler">Bildirimler</a></div>
        <div class="table-wrap" style="max-height:380px;overflow:auto"><table class="t"><tbody>
        ${logs.length ? logs.map((l) => html`<tr><td class="small muted" style="white-space:nowrap">${dateTime(l.at)}</td><td class="small">${l.channel ? ch(l.channel).name : ''}</td><td class="small" style="color:${l.level === 'error' ? 'var(--bad)' : l.level === 'warn' ? 'var(--amber)' : 'inherit'}">${l.msg}</td></tr>`) : html`<tr><td class="empty">Kayıt yok</td></tr>`}
      </tbody></table></div></div>
    </div>`);
    drawFx().catch(() => {});
    if (!state.tenant && admin) drawApi().catch(() => {});
    showTab(tab);
  }
  // ---------- Stok API (ana panelin kendi ürünleri): her dış sistem / bayi için ayrı anahtar ----------
  async function drawApi(keys) {
    const box = $('[data-apibox]', el);
    if (!box) return;
    if (!keys) keys = (await api('extapi', { fresh: true })).keys;
    const store = (state.settings && state.settings.company && state.settings.company.title) || 'Ana mağaza';
    render(box, html`<div class="row wrap" style="gap:10px;align-items:flex-start"><div style="flex:1;min-width:240px"><h2>Stok API (dış sistemlere stok aktarımı)</h2>
        <div class="muted small" style="margin-top:4px">Bayiniz ya da kendi sisteminiz (ERP, site, muhasebe) panelinizdeki ürün ve stokları anahtarla okur; yazma yok. Her dış sistem için ayrı anahtar oluşturun, gerektiğinde tek tek kapatın. Firma panellerinin API'si Firmalar ekranından verilir.</div></div>
        <button class="btn primary" data-api="new"><i class="ico ico-plus"></i>Yeni anahtar</button></div>
      ${keys.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Ad</th><th>Anahtar</th><th>IP kısıtı</th><th>Son erişim</th><th class="r">İstek</th><th>Durum</th><th></th></tr></thead><tbody>
        ${keys.map((k) => html`<tr data-kid="${k.id}"><td><b>${k.name}</b><div class="tiny muted">${dateTime(k.created_at)}${k.created_by ? ` · ${k.created_by}` : ''}</div></td><td class="num small">${k.hint}</td>
          <td class="small">${k.ips.length ? k.ips.join(', ') : html`<span class="muted">her yerden</span>`}</td>
          <td class="small">${k.last_at ? html`${dateTime(k.last_at)}${k.last_ip ? html`<div class="tiny muted">${k.last_ip}</div>` : ''}` : html`<span class="muted">henüz yok</span>`}</td>
          <td class="r num">${n(k.calls)}</td><td><span class="pill ${k.on ? 'good' : ''}">${k.on ? 'Açık' : 'Kapalı'}</span></td>
          <td class="r"><div class="row" style="justify-content:flex-end;gap:4px"><button class="btn sm" data-api="toggle">${k.on ? 'Kapat' : 'Aç'}</button><button class="btn sm ghost" data-api="ips">IP</button><button class="icon-btn sm" data-api="del" aria-label="Sil"><i class="ico ico-x"></i></button></div></td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Henüz anahtar yok. “Yeni anahtar” ile oluşturun; anahtar bir kez gösterilir.</div>`}
      <div class="row"><span class="spacer"></span><button class="btn sm ghost" data-api="doc"><i class="ico ico-help"></i>Kullanım kılavuzu</button></div>`);
    box.onclick = async (e) => {
      const b = e.target.closest('[data-api]');
      if (!b) return;
      const k = b.closest('[data-kid]') && keys.find((x) => x.id === b.closest('[data-kid]').dataset.kid), act = b.dataset.api;
      if (act === 'doc') { const s2 = sheet({ title: 'Stok API — kullanım kılavuzu', size: 'wide', body: html`<pre class="err-stack" style="max-height:none;font-size:12.5px">${apiGuide(store)}</pre>` }); return s2; }
      if (act === 'new') {
        const s2 = sheet({ title: 'Yeni stok API anahtarı', size: 'narrow', body: html`<div class="stack">
          <label class="field"><span>Ad (kimin için?)</span><input class="input" data-kn placeholder="ör. Bayi — Yeşil Bahçe"></label>
          <label class="field"><span>İzin verilen IP adresleri (isteğe bağlı)</span><textarea class="input" rows="2" data-ki placeholder="Boş: her yerden · ör. 85.105.10.25, 85.105.10.0/24"></textarea></label></div>`,
          foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-ok>Oluştur</button>` });
        $('[data-ok]', s2.el).onclick = (ev) => busy(ev.currentTarget, async () => {
          const r = await api('extapi', { method: 'POST', body: { name: $('[data-kn]', s2.el).value, ips: $('[data-ki]', s2.el).value } });
          s2.close(); await drawApi(r.keys);
          const s3 = sheet({ title: 'Anahtar oluşturuldu', size: 'narrow', body: html`<div class="stack">
            <div class="notice warn small"><i class="ico ico-warn"></i><div>Anahtar <b>yalnız bir kez</b> gösterilir. Kopyalayıp dış sisteme girin ya da güvenli yolla iletin.</div></div>
            <input class="input num" readonly value="${r.key}" style="font-size:13px">
            <div class="row wrap" style="gap:6px"><button class="btn sm primary" data-c="key"><i class="ico ico-copy"></i>Anahtarı kopyala</button><button class="btn sm" data-c="doc"><i class="ico ico-copy"></i>Kılavuzu anahtarla kopyala</button></div></div>`,
            foot: html`<span class="spacer"></span><button class="btn" data-close>Kapat</button>` });
          s3.el.addEventListener('click', (x) => { const c = x.target.closest('[data-c]'); if (c) navigator.clipboard.writeText(c.dataset.c === 'key' ? r.key : apiGuide(store, r.key)).then(() => toast('Kopyalandı')).catch(() => toast('Kopyalanamadı; elle seçin', true)); });
        });
        return;
      }
      if (!k) return;
      if (act === 'toggle') return busy(b, async () => drawApi((await api('extapi/' + k.id, { method: 'PUT', body: { on: !k.on } })).keys));
      if (act === 'ips') { const v = prompt('İzin verilen IP adresleri (virgülle; boş = her yerden):', k.ips.join(', ')); if (v !== null) busy(b, async () => drawApi((await api('extapi/' + k.id, { method: 'PUT', body: { ips: v } })).keys)); return; }
      if (act === 'del' && (await confirmBox(`“${k.name}” anahtarı silinsin mi? Bu anahtarı kullanan sistem hemen erişemez.`, 'Sil'))) busy(b, async () => drawApi((await api('extapi/' + k.id, { method: 'DELETE' })).keys));
    };
  }
  // Sekmeler: her sekmede tek kaydet düğmesi (bildirim ve döviz sekmelerinde kendi düğmeleri; genel düğme gizlenir)
  function showTab(k) {
    tab = STABS.some((x) => x[0] === k) ? k : 'firma';
    try { sessionStorage.setItem('settings_tab', tab); } catch { /* yok */ }
    $$('[data-stab]', el).forEach((c) => { c.hidden = c.dataset.stab !== tab; });
    $$('[data-st]', el).forEach((b) => b.classList.toggle('on', b.dataset.st === tab));
    const bar = $('[data-savebar]', el); if (bar) bar.hidden = !['firma', 'stok', 'giderler', 'etiket'].includes(tab);
  }
  const save = async (patch) => { state.settings = await api('settings', { method: 'PUT', body: patch }); };
  // ---------- döviz ve fiyat ----------
  const KIND = [['sell', 'Döviz satış'], ['buy', 'Döviz alış'], ['bsell', 'Efektif satış'], ['bbuy', 'Efektif alış']];
  const MODE = [['live', 'Anlık (her senkronda, ~15 dk; eşik aşılınca)'], ['daily', 'Günlük'], ['weekly', 'Haftalık (pazartesi)'], ['monthly', 'Aylık (ayın 1\'i)'], ['manual', 'Elle (yalnız düğmeyle)']];
  const ROUND = [['none', 'Kuruşuyla'], ['int', 'Tam sayıya'], ['90', ',90 ile bitsin'], ['99', ',99 ile bitsin']];
  async function drawFx(refresh) {
    const box = $('[data-fxcard]', el);
    if (!box || state.tenant) return;
    let d;
    try { d = await api('fx' + (refresh ? '?refresh=1' : ''), refresh ? { fresh: true } : {}); } catch (e) { return render(box, html`<h2>Döviz ve fiyat</h2><div class="notice bad small">${e.message}</div>`); }
    const fx = d.settings, R = (d.rates && d.rates.rates) || {}, dis = isAdmin() ? '' : 'disabled';
    const cell = (c, k) => (R[c] && R[c][k] ? R[c][k].toFixed(4) : '—');
    render(box, html`<div class="row wrap" style="gap:8px"><div style="flex:1;min-width:220px"><h2>Döviz ve fiyat</h2><div class="muted small">Ürüne dolar / euro / sterlin fiyatı girilir (ürün formu); TL satış fiyatı ve kanal fiyatları seçtiğiniz kur ve sıklıkla güncellenir. ${n(d.products)} ürün döviz fiyatlı.</div></div>
        <button class="btn sm" data-act="fx-refresh"><i class="ico ico-sync"></i>Kurları yenile</button></div>
      ${d.error ? html`<div class="notice bad small">Kur alınamadı: ${d.error}</div>` : ''}
      <div class="table-wrap"><table class="t"><thead><tr><th>Kur</th><th class="r">Döviz alış</th><th class="r">Döviz satış</th><th class="r">Efektif alış</th><th class="r">Efektif satış</th></tr></thead><tbody>
        ${[['USD', 'Dolar'], ['EUR', 'Euro'], ['GBP', 'Sterlin']].map(([c, t]) => html`<tr><td><b>${c}</b> <span class="muted small">${t}</span></td>${['buy', 'sell', 'bbuy', 'bsell'].map((k) => html`<td class="r num" style="${k === fx.kind ? 'font-weight:750;color:var(--primary)' : ''}">${cell(c, k)}</td>`)}</tr>`)}
      </tbody></table></div>
      <div class="muted tiny">${d.rates ? `${d.rates.source === 'live' ? `Anlık piyasa kuru (${d.rates.provider || ''})` : `TCMB ${d.rates.date || ''} kuru`} · okundu ${dateTime(d.rates.at)}` : 'Kur henüz okunmadı'}${d.applied ? ` · son fiyat güncellemesi ${dateTime(d.applied.at)} (${d.applied.changed} ürün)` : ''}</div>
      <div class="form-grid">
        <label class="field"><span>Kur kaynağı</span><select class="input" data-fx="source" ${dis}><option value="tcmb" ${fx.source === 'tcmb' ? 'selected' : ''}>TCMB (resmi, günde bir açıklanır)</option><option value="live" ${fx.source === 'live' ? 'selected' : ''}>Anlık piyasa kuru</option></select></label>
        <label class="field"><span>Kullanılacak kur</span><select class="input" data-fx="kind" ${dis}>${KIND.map(([v, t]) => html`<option value="${v}" ${fx.kind === v ? 'selected' : ''}>${t}</option>`)}</select><small>Anlık kurda alış = satış</small></label>
        <label class="field"><span>Fiyat güncelleme sıklığı</span><select class="input" data-fx="mode" ${dis}>${MODE.map(([v, t]) => html`<option value="${v}" ${fx.mode === v ? 'selected' : ''}>${t}</option>`)}</select></label>
        <label class="field"><span>Değişim eşiği %</span><input class="input" data-fx="threshold" inputmode="decimal" value="${fx.threshold}" ${dis}><small>Anlık modda kur bu orandan az değiştiyse fiyat değişmez</small></label>
        <label class="field"><span>Yuvarlama</span><select class="input" data-fx="rounding" ${dis}>${ROUND.map(([v, t]) => html`<option value="${v}" ${fx.rounding === v ? 'selected' : ''}>${t}</option>`)}</select></label>
        <label class="field"><span>Genel kâr payı %</span><input class="input" data-fx="margin" inputmode="decimal" value="${fx.margin}" ${dis}><small>Döviz fiyatına eklenir; ürüne özel değer önceliklidir</small></label>
      </div>
      ${isAdmin() ? html`<div class="row wrap"><button class="btn primary" data-act="fx-save">Döviz ayarlarını kaydet</button><button class="btn" data-act="fx-apply"><i class="ico ico-bolt"></i>Fiyatları şimdi güncelle</button></div>` : ''}`);
  }
  el.addEventListener('change', async (e) => {
    if (e.target.dataset && e.target.dataset.prov !== undefined) {
      const smtp = e.target.value === 'smtp';
      $$('[data-provbox]', el).forEach((b) => { b.hidden = (b.dataset.provbox === 'smtp') !== smtp; });
      return;
    }
    const k = e.target.dataset.s;
    try {
      if (k) { await save({ [k]: e.target.checked }); toast('Kaydedildi'); if (k === 'stock_sync') load(); }
      if (e.target.dataset.stockch) {
        const m = {}; $$('[data-stockch]', el).forEach((x) => { m[x.dataset.stockch] = x.checked; });
        await save({ stock_channels: m }); toast('Kaydedildi');
      }
      if (e.target.dataset.catalog) { await save({ catalog_channels: $$('[data-catalog]', el).filter((x) => x.checked).map((x) => x.dataset.catalog) }); toast('Kaydedildi'); }
      if (e.target.matches('[data-logo-file]') && e.target.files[0]) {
        const data = await shrink(e.target.files[0]);
        await save({ logo: data });
        $('[data-logo-prev]', el).src = data;
        await loadSummary(); toast('Logo güncellendi');
      }
    } catch (err) { toast(err.message, true); }
  });
  const saveMail = async () => {
    const box = $('[data-mailbox]', el);
    const m = {}; $$('[data-mailch]', box).forEach((x) => { m[x.dataset.mailch] = x.checked; });
    await save({ mail_to: $('[data-mailto]', box).value, mail_channels: m, ...($('[data-panelurl]', box) ? { panel_url: $('[data-panelurl]', box).value.trim() } : {}) });
    const values = {}; $$('[data-mailf]', box).forEach((i) => { values[i.dataset.mailf] = i.value.trim(); });
    await api('integrations/mail', { method: 'PUT', body: { values } });
  };
  actions(el, {
    'push-on': (t) => busy(t, async () => { await enablePush(); toast('Bildirimler bu cihazda açıldı'); await drawPush(); }),
    'push-off': (t) => busy(t, async () => { await disablePush(); toast('Bildirimler bu cihazda kapatıldı'); await drawPush(); }),
    'push-test': (t) => busy(t, async () => { const r = await api('push/test', { method: 'POST' }); toast(r.sent ? `Deneme bildirimi gönderildi (${r.sent} cihaz)` : 'Bildirim açık cihaz yok'); }),
    'mail-save': (t) => busy(t, async () => { await saveMail(); toast('Bildirim ayarları kaydedildi'); await load(); }),
    'digest-test': (t) => busy(t, async () => { await saveMail(); const r = await api('digest/test', { method: 'POST' }); toast(r.message); }),
    'mail-test': (t) => busy(t, async () => { await saveMail(); const r = await api('mail/test', { method: 'POST' }); toast(r.message); }),
    'push-stock': (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); }),
    'logo-reset': (t) => busy(t, async () => { await save({ logo: '' }); await loadSummary(); load(); }),
    purge: async (t) => {
      if (!(await confirmBox('Deneme modunda oluşan örnek siparişler, ilanlar ve ürünler silinsin mi? Gerçek kanal verisine dokunulmaz.', 'Temizle'))) return;
      busy(t, async () => { const r = await api('purge-demo', { method: 'POST' }); toast(`${r.orders} örnek sipariş ve ${r.products} örnek ürün silindi`); await loadSummary(); });
    },
    'fx-refresh': (t) => busy(t, async () => { await drawFx(true); toast('Kurlar yenilendi'); }),
    'fx-save': (t) => busy(t, async () => {
      const o = {}; $$('[data-fx]', el).forEach((i) => { o[i.dataset.fx] = ['threshold', 'margin'].includes(i.dataset.fx) ? numIn(i.value) : i.value; });
      await save({ fx: o }); toast('Döviz ayarları kaydedildi'); await drawFx(true);
    }),
    'fx-apply': (t) => busy(t, async () => { const r = await api('fx/apply', { method: 'POST' }); toast(r.changed ? `${r.changed} ürünün fiyatı güncellendi; kanal fiyatları gönderiliyor` : 'Fiyatlar zaten güncel'); await drawFx(); }),
    save: (t) => busy(t, async () => {
      const cost = Object.fromEntries(COST_KEYS.map((k) => [k, {}]));
      $$('[data-cost]', el).forEach((i) => { const [k, c] = i.dataset.cost.split(':'); cost[k][c] = i.value.trim() === '' && /_\d+$/.test(c) ? '' : numIn(i.value); });
      const sender = {}; $$('[data-sender]', el).forEach((i) => { sender[i.dataset.sender] = i.value.trim(); });
      const company = {}; $$('[data-co]', el).forEach((i) => { company[i.dataset.co] = i.value.trim(); });
      const track = {}; ($('[data-track]', el).value || '').split('\n').forEach((l) => { const i = l.indexOf('='); if (i > 0) track[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      await save({ ...cost, sender, company, track_urls: track, label_size: $('[data-labelsize]', el).value, low_stock: numIn($('[data-low]', el).value), cargo_companies: $('[data-cargos]', el).value.split(',').map((x) => x.trim()).filter(Boolean), history_days: numIn($('[data-history]', el).value) });
      await loadSummary();
      toast('Ayarlar kaydedildi');
    }),
  });
  await load();
  return { refresh: load };
}
