// Google Ads etiketi (gtag.js) ve dönüşüm ölçümü. Kimlik ve dönüşüm etiketleri config.js → ads.
// Çerez onayı (Google Consent Mode v2): ziyaretçi "Kabul et" diyene kadar reklam / analiz çerezleri kapalıdır; Google bu sürede
// çerezsiz, kimliksiz sinyallerle dönüşümleri modelleyebilir. Tercih bu cihazda saklanır (localStorage → "cerez").
// Dönüşümler: /odeme-basarili (kartla satın alma) ve /siparis-alindi (havale / EFT siparişi); tutar ve sipariş no adresten okunur.
(() => {
  const A = (window.SITE || {}).ads || {};
  if (!A.id) return;
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } } };
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  const choice = ls.get('cerez'), g = choice === 'evet' ? 'granted' : 'denied';
  gtag('consent', 'default', { ad_storage: g, ad_user_data: g, ad_personalization: g, analytics_storage: g, wait_for_update: 500 });
  gtag('set', 'url_passthrough', true);
  gtag('js', new Date());
  gtag('config', A.id);
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(A.id);
  document.head.append(s);

  // Dönüşüm: aynı sipariş bu tarayıcıda bir kez sayılır (sayfa yenilense de); Google da transaction_id ile tekrarı ayıklar
  const q = new URLSearchParams(location.search), order = q.get('siparis') || '', value = Number(q.get('tutar')) || 0;
  const conv = { '/odeme-basarili': ['purchase', A.purchase], '/siparis-alindi': ['eft_order', A.lead] }[location.pathname.replace(/\.html$/, '').replace(/\/+$/, '')];
  if (conv && order && ls.get('conv:' + order) !== '1') {
    const data = { value, currency: 'TRY', transaction_id: order };
    if (conv[1]) gtag('event', 'conversion', { send_to: `${A.id}/${conv[1]}`, ...data });
    gtag('event', conv[0], data);
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
