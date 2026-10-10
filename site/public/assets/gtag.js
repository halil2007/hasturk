// Google Ads etiketi (gtag.js), Google Analytics 4 ve dönüşüm ölçümü. Kimlikler config.js → ads, analytics.
// Çerez onayı (Google Consent Mode v2): ziyaretçi "Kabul et" diyene kadar reklam / analiz çerezleri kapalıdır; Google bu sürede
// çerezsiz, kimliksiz sinyallerle dönüşümleri modelleyebilir. Tercih bu cihazda saklanır (localStorage → "cerez").
// Dönüşümler: deneme kaydı, iletişim formu, /odeme-basarili (kartla satın alma), /siparis-alindi (havale / EFT); etiketler panelden.
(() => {
  const A = (window.SITE || {}).ads || {}, GA = (window.SITE || {}).analytics || '';
  const tagId = A.id || GA;
  if (!tagId) return;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } } };
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  const choice = ls.get('cerez'), g = choice === 'evet' ? 'granted' : 'denied';
  gtag('consent', 'default', { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g, wait_for_update: 500 });
  gtag('set', 'url_passthrough', true);
  gtag('js', new Date());
  if (A.id) gtag('config', A.id);
  if (GA) gtag('config', GA);
  // Etiket betiği sayfada (layout.html) doğrudan yüklenir; kimlik farklıysa (yalnız Analytics) burada eklenir
  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + tagId + '"]')) {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(tagId);
    document.head.append(s);
  }

  // Google Ads dönüşüm etiketleri panelden okunur (ana panel → Ayarlar → Google Ads); panel yanıt vermezse config.js → ads
  const S = window.SITE || {};
  let labels = null;
  const labelsOf = () => labels || (labels = (S.panelUrl ? fetch(`${S.panelUrl.replace(/\/+$/, '')}/api/public/ads`, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) : Promise.resolve({}))
    .then((p) => ({ trial: p.trial || A.trial, lead: p.lead || A.contact, purchase: p.purchase || A.purchase, eft: p.eft || A.lead })));
  // Dönüşüm bildir: kind = trial | lead | purchase | eft; ga = Google Analytics olay adı. Etiket yoksa yalnız GA olayı gider.
  window.hcConversion = (kind, ga, data = {}) => {
    try { gtag('event', ga, data); } catch { /* yok */ }
    return labelsOf().then((l) => { if (l[kind] && A.id) gtag('event', 'conversion', { send_to: `${A.id}/${l[kind]}`, ...data }); }).catch(() => {});
  };

  // Satın alma dönüşümü: aynı sipariş bu tarayıcıda bir kez sayılır (sayfa yenilense de); Google da transaction_id ile tekrarı ayıklar
  const q = new URLSearchParams(location.search), order = q.get('siparis') || '', value = Number(q.get('tutar')) || 0;
  const conv = { '/odeme-basarili': ['purchase', 'purchase'], '/siparis-alindi': ['eft', 'eft_order'] }[location.pathname.replace(/\.html$/, '').replace(/\/+$/, '')];
  if (conv && order && ls.get('conv:' + order) !== '1') {
    window.hcConversion(conv[0], conv[1], { value, currency: 'TRY', transaction_id: order });
    ls.set('conv:' + order, '1');
  }

  // Çerez onay şeridi (yalnız ilk ziyarette; seçim yapılınca bir daha gösterilmez)
  if (choice) return;
  const show = () => {
    const b = document.createElement('div');
    b.className = 'cookie-bar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Çerez tercihi');
    b.innerHTML = '<p>Alışveriş deneyiminizi iyileştirmek için yasal düzenlemelere uygun çerezler (cookies) kullanıyoruz. Detaylı bilgiye <a href="/gizlilik">Çerez Politikası</a> sayfamızdan erişebilirsiniz.</p><div><button type="button" class="btn btn-line" data-c="no">Reddet</button><button type="button" class="btn btn-primary" data-c="yes">Kabul et</button></div>';
    b.addEventListener('click', (e) => {
      const x = e.target.closest('[data-c]'); if (!x) return;
      const ok = x.dataset.c === 'yes', v = ok ? 'granted' : 'denied';
      ls.set('cerez', ok ? 'evet' : 'hayir');
      gtag('consent', 'update', { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v });
      b.remove();
    });
    document.body.append(b);
  };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
