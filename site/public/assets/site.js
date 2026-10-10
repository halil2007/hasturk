// Tanıtım sitesi: kanal listeleri, ekran sekmeleri, paketler (aylık / yıllık), karşılaştırma tablosu, iletişim bilgileri (config.js),
// iletişim ve demo formları (demo formu panelden dönen demo bağlantısını gösterir), satın alma (iyzico) formu.
// Tüm formlarda e-posta ve telefon zorunludur; biçimleri burada ve sunucuda (panel/src/lead.js, billing.js) aynı kuralla doğrulanır.
(() => {
  const S = window.SITE || {}, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (k) => k.split('.').reduce((o, x) => (o ? o[x] : undefined), S);
  const tl = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  // Doğrulama: e-posta; Türkiye telefonu (cep 5xx, sabit 2xx-4xx, 850; başında 0 / +90 olabilir); TC kimlik no (kontrol haneleri)
  const okEmail = (v) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(v || '').trim());
  const okPhone = (v) => {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('90')) d = d.slice(2); else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[2-58]\d{9}$/.test(d) && !/[^\d\s()+-]/.test(String(v || '').trim());
  };
  const okTckn = (v) => {
    const d = String(v || ''); if (!/^[1-9]\d{10}$/.test(d)) return false;
    const n = [...d].map(Number), o = n[0] + n[2] + n[4] + n[6] + n[8], e = n[1] + n[3] + n[5] + n[7];
    return (((o * 7 - e) % 10) + 10) % 10 === n[9] && n.slice(0, 10).reduce((a, x) => a + x, 0) % 10 === n[10];
  };
  // Hatalı alanı işaretle ve odakla (yazmaya başlayınca işaret kalkar)
  const mark = (form, name) => { const el = form.elements[name]; if (!el) return; el.classList.add('bad'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  document.addEventListener('input', (e) => { if (e.target.classList && e.target.classList.contains('bad')) e.target.classList.remove('bad'); });
  const waUrl = (v) => 'https://wa.me/' + String(v).replace(/\D/g, '') + (S.waText ? '?text=' + encodeURIComponent(S.waText) : '');

  // Kanallar: aktif olanlar ve yakında gelecekler. [ad, tür, rozet rengi, kısa ad, yazı stili (logo şeridi), paneldeki kanal türü]
  const ACTIVE = [
    ['Hepsiburada', 'pazaryeri', '#ff6000', 'hb', 'color:#ff6000;font-size:19px'], ['Trendyol', 'pazaryeri', '#f27a1a', 'T', 'color:#f27a1a'], ['ikas', 'e-ticaret sitesi', '#111827', 'ik', 'color:#111827;font-size:24px'],
    ['N11', 'pazaryeri', '#7b3fe4', 'n11', 'color:#7b3fe4'], ['PttAVM', 'pazaryeri', '#e0a800', 'Ptt', 'color:#e0a800'], ['idefix', 'pazaryeri', '#1d4ed8', 'id', 'color:#1d4ed8;font-style:italic'],
    ['Pazarama', 'pazaryeri', '#7a2bc9', 'Pz', 'color:#7a2bc9;font-size:19px'], ['WooCommerce', 'e-ticaret sitesi', '#7f54b3', 'W', 'color:#7f54b3;font-size:19px'],
    // Test aşamasındakiler (6. alan: paneldeki kanal türü): kullanıma açık, "test aşamasında" etiketiyle görünür
    ['Amazon', 'pazaryeri', '#232f3e', 'a', 'color:#232f3e', 'amazon'], ['Çiçeksepeti', 'pazaryeri', '#1e9e57', 'Çs', 'color:#1e9e57;font-size:19px', 'ciceksepeti'], ['Koçtaş', 'pazaryeri', '#e5541b', 'K', 'color:#e5541b', 'koctas'],
    ['Shopify', 'e-ticaret sitesi', '#5e8e3e', 'S', 'color:#5e8e3e', 'shopify'], ['OpenCart', 'e-ticaret sitesi', '#23a8e0', 'OC', 'color:#23a8e0;font-size:19px', 'opencart'], ['Etsy', 'pazaryeri', '#f1641e', 'E', 'color:#f1641e', 'etsy'],
  ];
  // Ana panelde "Test yazısını kaldır" denince tür bu listeden çıkar (panel → /api/public/channels → beta); panel yanıt vermezse etiketler kalır
  let TEST = new Set(['amazon', 'ciceksepeti', 'koctas', 'shopify', 'opencart', 'etsy']);
  const SOON = [
    ['Teknosa', 'pazaryeri', '#0057a8', 'Tk'], ['Turkcell Pasaj', 'pazaryeri', '#ffc900', 'P'], ['Boyner', 'pazaryeri', '#111827', 'B'],
    ['Trendyol Go', 'hızlı market', '#f27a1a', 'Go'], ['Getir', 'hızlı market', '#5d3ebc', 'G'], ['Yemeksepeti Market', 'hızlı market', '#ea004b', 'Ys'],
    ['eBay', 'yurt dışı pazaryeri', '#0064d2', 'eb'], ['Ozon', 'yurt dışı pazaryeri', '#005bff', 'Oz'],
    ['Ticimax', 'e-ticaret sitesi', '#0b5cff', 'Tx'], ['IdeaSoft', 'e-ticaret sitesi', '#00a3e0', 'iS'], ['T-Soft', 'e-ticaret sitesi', '#e30613', 'TS'],
  ];
  // Kargo: entegratörler (altyapı hazır, firmaların API'si bağlanınca açılır) ve doğrudan bağlanacak kargo firmaları
  // Kargo: bağlı firmalar (Kurumsal pakette) ve yakında gelecekler
  const CARGO = [
    ['Yurtiçi Kargo', 'kargo firması', '#004a99', 'Y'], ['Aras Kargo', 'kargo firması', '#e30613', 'A'], ['DHL eCommerce', 'kargo firması', '#d40511', 'D'],
    ['Sürat Kargo', 'kargo firması', '#0b3c8c', 'S'], ['PTT Kargo', 'kargo firması', '#f5b400', 'P'], ['UPS', 'kargo firması', '#351c15', 'U'], ['HepsiJET', 'kargo firması', '#ff6000', 'hj']
  ];
  const CARGO_SOON = [['Kargonomi', 'kargo entegratörü', '#ff6b00', 'K'], ['Navlungo', 'kargo entegratörü', '#1d4ed8', 'N'], ['Kolay Gelsin', 'kargo firması', '#00a651', 'KG'], ['Sendeo', 'kargo firması', '#6c2bd9', 'Sd'], ['DHL Express', 'kargo firması', '#ffcc00', 'DHL']];
  const badge = ([, , c, s]) => `<span class="b" style="background:${c}">${esc(s)}</span>`;
  const wordmark = (n) => ({ Hepsiburada: 'hepsiburada', Trendyol: 'trendyol', N11: 'n11', Pazarama: 'pazarama' }[n] || n);
  // Logo şeridi: kayan bant (iki kopya yan yana döner; hareket azaltma tercihinde yalnız ilk kopya durur)
  const wms = (dup, link = true) => ACTIVE.map((x) => `<${link ? 'a href="/entegrasyonlar"' : 'span'} class="wm${dup ? ' dup' : ''}" style="${x[4]}" title="${esc(x[0])}"${dup ? ' aria-hidden="true" tabindex="-1"' : ''}>${esc(wordmark(x[0]))}</${link ? 'a' : 'span'}>`).join('');
  const integ = (list, soon) => list.map((x) => `<div class="it${soon ? ' soon' : ''}">${badge(x)}<div style="min-width:0"><b>${esc(x[0])}</b><small>${esc(x[1])}${soon ? ' · yakında' : ''}${TEST.has(x[5]) ? '<span class="tt">Test aşamasında</span>' : ''}</small></div></div>`).join('');
  const drawChannels = () => {
    const logos = $('[data-logos]');
    if (logos) logos.innerHTML = wms(false) + wms(true) + wms(true) + wms(true);
    const logosStatic = $('[data-logos-static]');
    if (logosStatic) logosStatic.innerHTML = wms(false, false);
    $$('[data-count="active"]').forEach((el) => { el.textContent = ACTIVE.filter((x) => !TEST.has(x[5])).length; });
    $$('[data-integ="active"]').forEach((el) => { el.innerHTML = integ(ACTIVE); });
    $$('[data-integ="soon"]').forEach((el) => { el.innerHTML = integ(SOON, true); });
    $$('[data-integ="cargo"]').forEach((el) => { el.innerHTML = integ(CARGO, false) + integ(CARGO_SOON, true); });
    // Derlenmiş sayfalardaki "Test aşamasında" etiketleri (menü, kartlar, kanal sayfası): testi biten türde kalkar, yerine "Aktif entegrasyon"
    $$('[data-beta]').forEach((el) => { if (!TEST.has(el.dataset.beta)) el.remove(); });
    $$('[data-beta-on]').forEach((el) => { el.hidden = TEST.has(el.dataset.betaOn); });
  };
  drawChannels();
  // Panelde testi biten kanallar: "Test aşamasında" etiketi kalkar (panel yanıt vermezse sayfa olduğu gibi kalır)
  if (S.panelUrl && (document.querySelector('[data-integ], [data-beta]'))) {
    fetch(`${S.panelUrl.replace(/\/+$/, '')}/api/public/channels`, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || !Array.isArray(d.beta)) return;
      const next = new Set([...TEST].filter((t) => d.beta.includes(t)));
      if (next.size !== TEST.size) { TEST = next; drawChannels(); }
    }).catch(() => {});
  }
  $$('[data-chans]').forEach((el) => { el.innerHTML = [...ACTIVE, ...SOON].map((x) => x[0]).concat(['Diğer']).map((n) => `<label><input type="checkbox" name="channels" value="${esc(n)}">${esc(n)}</label>`).join(''); });

  // Ekran sekmeleri
  const SHOTS = [
    ['siparisler', 'Siparişler', 'Tüm kanalların siparişleri tek listede: durum sekmeleri, gecikme uyarısı, satır içinde ürün ve kâr.'],
    ['kargo', 'Kargo', 'Hazırlanacak, yazdırılacak, kargoya verilecek ve kargodaki paketler; tek tıkla etiket.'],
    ['gelir-gider', 'Gelir & gider', 'Satıştan net kâra: komisyon, kargo, hizmet bedeli, stopaj, reklam, iade kaybı ve işletme giderleri.'],
    ['urunler', 'Ürünler', 'Ürün kartları, kanallardaki ilanlar, alış fiyatı, marj ve stokun kaç gün yeteceği.'],
    ['fiyat-onerileri', 'Fiyat önerileri', 'Rakip fiyatına göre birinciliği alma ya da kârı artırma önerileri, önerilen fiyattaki kârınızla.'],
    ['analiz', 'Satış analizi', 'Dönem karşılaştırmalı satış grafikleri, en çok satanlar ve kanal dağılımı.'],
  ];
  const tabs = $('[data-tabs]'), img = $('[data-shot]'), cap = $('[data-cap]');
  if (tabs && img) {
    const show = (i) => {
      const [k, t, c] = SHOTS[i];
      img.src = `/img/${k}.jpg`; img.alt = `${t} ekranı`; cap.textContent = c;
      $$('button', tabs).forEach((b, j) => { b.classList.toggle('on', i === j); b.setAttribute('aria-selected', i === j); });
    };
    tabs.innerHTML = SHOTS.map(([, t], i) => `<button type="button" role="tab" data-i="${i}">${esc(t)}</button>`).join('');
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(Number(b.dataset.i)); });
    show(0);
  }

  // Havale / EFT indirimi yalnız yıllık alımda (config.js → eftDiscount); aylıkta havale / EFT tam fiyat
  const eftPct = () => Number(S.eftDiscount) || 0;
  const eftPrice = (amount, period) => (period === 'yearly' ? Math.round((amount || 0) * (100 - eftPct()) / 100) : amount || 0);
  // Paketler: fiyatlar KDV dahil; büyük fiyat aylık, altında yıllık alım kutusu (2 ay hediye, peşin fiyatına taksit)
  const priceHtml = (p) => {
    if (!p.monthly && !p.yearly) return '<div class="price">Teklif alın</div>';
    const save = p.monthly && p.yearly ? p.monthly * 12 - p.yearly : 0;
    const inst = S.installments && p.yearly ? `${S.installments} × ${tl(p.yearly / S.installments)} ₺` : '';
    return `<div class="price">${tl(p.monthly)} <span class="cur">₺</span><small>/ ay</small></div>
      <div class="vatline">KDV dahil · aylık ödeme</div>
      ${p.yearly ? `<div class="yearly"><div class="y-top"><b>Yıllık ${tl(p.yearly)} ₺</b><small>KDV dahil</small>${save ? `<span class="save">${tl(save)} ₺ kazanç</span>` : ''}</div>
        <div class="y-sub">2 ay hediye · aylık ${tl(p.yearly / 12)} ₺'ye gelir</div>
        ${inst ? `<div class="y-inst"><b>Peşin fiyatına ${S.installments} taksit</b><span>${inst}</span></div>` : ''}
        ${eftPct() ? `<div class="y-eft">Havale / EFT ile <b>${tl(eftPrice(p.yearly, 'yearly'))} ₺</b> <small>(%${eftPct()} indirim)</small></div>` : ''}</div>` : ''}`;
  };
  // "Hemen satın al" yalnız online satış açıkken (panelde iyzico API bilgileri girilmişse) görünür; kapalıyken eski hali
  const renderPlans = (shop) => $$('[data-plans]').forEach((el) => {
    el.innerHTML = (S.plans || []).map((p) => `<div class="plan${p.featured ? ' featured' : ''}">${p.featured ? '<span class="badge">En çok tercih edilen</span>' : ''}
      <h3>${esc(p.name)}</h3><div class="tag">${esc(p.tag)}</div>${priceHtml(p)}
      <div class="limits">${(p.limits || []).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      <ul>${p.items.map((x) => `<li><svg><use href="#i-check"/></svg><span>${esc(x)}</span></li>`).join('')}${(p.soon || []).map((x) => `<li class="soon"><svg><use href="#i-bolt"/></svg><span>${esc(x)} <em>Yakında</em></span></li>`).join('')}</ul>
      ${shop && p.key ? `<a class="btn ${p.featured ? 'btn-primary' : 'btn-outline'}" href="/satin-al?plan=${p.key}&amp;donem=yillik">Hemen satın al</a>
      <a class="btn btn-line plan-trial" href="/demo#deneme">7 gün ücretsiz deneyin</a>` : `<a class="btn ${p.featured ? 'btn-primary' : 'btn-outline'}" href="/demo#deneme">7 gün ücretsiz deneyin</a>`}
      <a class="plan-demo" data-demo href="/demo">ya da önce demo panelini açın →</a></div>`).join('');
  });
  renderPlans(false);
  const shopOn = () => {
    document.documentElement.classList.add('shop-on');
    renderPlans(true);
    $$('[data-plans] [data-demo]').forEach((a) => { if (S.demoUrl) { a.href = S.demoUrl; a.target = '_blank'; a.rel = 'noopener'; } });
  };
  // Satın alma: kartla ödeme yalnız iyzico açıkken; havale / EFT (banka bilgisi tanımlıysa) her zaman
  let cardOn = false;
  const shopState = (card) => {
    cardOn = card;
    const on = card || !!(S.bank && S.bank.iban);
    $$('[data-shop-wait]').forEach((x) => { x.hidden = true; });
    $$('[data-shop-off]').forEach((x) => { x.hidden = on; });
    $$('[data-shop]').forEach((x) => { x.hidden = !on; });
    if (on) shopOn();
    document.dispatchEvent(new Event('shop:state'));
  };
  if (S.checkoutUrl) fetch(S.checkoutUrl + '/status').then((r) => r.json()).then((j) => shopState(!!j.online)).catch(() => shopState(false));
  else shopState(false);
  $$('[data-vat]').forEach((el) => { el.textContent = S.vat || ''; });
  const cmp = $('[data-compare]');
  if (cmp && S.compare) {
    const cell = (v) => (v === true ? '<td class="y"><svg><use href="#i-check"/></svg><span class="sr">Var</span></td>' : v === false ? '<td class="n"><svg><use href="#i-minus"/></svg><span class="sr">Yok</span></td>' : `<td class="t${v === 'Yakında' ? ' soon-cell' : ''}">${esc(v)}</td>`);
    cmp.innerHTML = `<thead><tr><th scope="col">Özellik</th>${(S.plans || []).map((p) => `<th scope="col"${p.featured ? ' class="feat"' : ''}>${esc(p.name)}</th>`).join('')}</tr></thead>
      <tbody>${S.compare.map(([k, ...v]) => `<tr><th scope="row">${esc(k)}</th>${v.map(cell).join('')}</tr>`).join('')}</tbody>`;
  }

  // Şirket / iletişim bilgileri (config.js): boşsa ilgili satır gizlenir; yasal sayfalarda [köşeli] yer tutucu kalır
  $$('[data-show]').forEach((el) => { if (!get(el.dataset.show)) el.hidden = true; });
  $$('[data-c]').forEach((el) => {
    const v = get(el.dataset.c);
    if (!v) { if (el.dataset.ph) el.innerHTML = `<span class="ph">[${esc(el.dataset.ph)}]</span>`; return; }
    if (el.dataset.href === 'tel') { el.href = 'tel:' + String(v).replace(/[^\d+]/g, ''); el.textContent = v; }
    else if (el.dataset.href === 'mailto') { el.href = 'mailto:' + v; el.textContent = v; }
    else if (el.dataset.href === 'wa') { el.href = waUrl(v); el.target = '_blank'; el.rel = 'noopener'; }
    else el.textContent = v;
  });
  // İletişim kartları (bağlantı tüm kart)
  $$('[data-c-href]').forEach((el) => {
    const v = get(el.dataset.cHref); if (!v) return;
    const k = el.dataset.kind;
    el.href = k === 'tel' ? 'tel:' + String(v).replace(/[^\d+]/g, '') : k === 'mailto' ? 'mailto:' + v : waUrl(v);
    if (k === 'wa') { el.target = '_blank'; el.rel = 'noopener'; }
  });
  if (S.panelUrl) $$('[data-panel]').forEach((a) => { a.href = S.panelUrl; });
  // "Canlı demo": bilgi istemeden demo paneli (yeni sekmede); "Hemen ara": telefon
  if (S.demoUrl) $$('[data-demo]').forEach((a) => { a.href = S.demoUrl; a.target = '_blank'; a.rel = 'noopener'; });
  const tel = get('company.phone');
  if (tel) $$('[data-call]').forEach((a) => { a.href = 'tel:' + String(tel).replace(/[^\d+]/g, ''); a.title = tel; });
  // Sekmeli özellik gezgini
  $$('[data-ftabs]').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('[role=tab]'); if (!b) return;
    $$('[role=tab]', box).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    $$('.ft-p', box).forEach((p) => { p.hidden = p.dataset.p !== b.dataset.i; });
  }));
  $$('[data-year]').forEach((y) => { y.textContent = new Date().getFullYear(); });

  // Mobil menü
  // Menü ekrandan uzun olabilir (açılır listeler): kendi içinde kayar. Yükseklik menünün ekrandaki yerine göre ayarlanır
  // (üstteki iletişim şeridi görünürken de alttaki bağlantılara ulaşılır; sayfa kayınca yeniden hesaplanır).
  const mb = $('[data-menu]'), mn = $('[data-mnav]');
  if (mb && mn) {
    const fit = () => { if (mn.classList.contains('open')) mn.style.maxHeight = Math.max(200, window.innerHeight - mn.getBoundingClientRect().top) + 'px'; };
    const set = (o) => {
      mn.classList.toggle('open', o); mb.setAttribute('aria-expanded', o);
      if (o) { mn.scrollTop = 0; fit(); } else mn.style.maxHeight = '';
    };
    mb.addEventListener('click', () => set(!mn.classList.contains('open')));
    mn.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    window.addEventListener('resize', () => { if (window.innerWidth >= 1040) set(false); else fit(); });
    window.addEventListener('scroll', fit, { passive: true });
    mn.addEventListener('toggle', fit, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mn.classList.contains('open')) set(false); });
  }

  // Görünürken beliren bölümler
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('seen')));

  // İletişim sayfası: adresle gelen konu (?konu=teklif&paket=Profesyonel, ?konu=arama, ?konu=kanal)
  const q = new URLSearchParams(location.search), topicSel = $('[data-topic]');
  if (topicSel && q.get('konu') && [...topicSel.options].some((o) => o.value === q.get('konu'))) {
    topicSel.value = q.get('konu');
    const m = $('[name=message]');
    if (m && !m.value) m.value = { arama: 'Lütfen beni arayın.', kanal: 'Entegrasyonunu istediğim kanal: ', teklif: q.get('paket') ? `${q.get('paket')} paketi için teklif istiyorum.` : '' }[q.get('konu')] || '';
  }

  // Bot doğrulaması (Cloudflare Turnstile): panel anahtar verirse formlara "robot değilim" kutucuğu eklenir; vermezse formlar kutucuksuz
  // çalışır (doğrulama sunucuda da kapalıdır). Jeton tek kullanımlık: her gönderimden sonra kutucuk yenilenir.
  let cfKey = null, cfLoad = null;
  const captcha = () => cfLoad || (cfLoad = !S.panelUrl ? Promise.resolve(null)
    : fetch(`${S.panelUrl.replace(/\/+$/, '')}/api/public/captcha`).then((r) => (r.ok ? r.json() : {})).then((d) => {
      cfKey = d && d.siteKey;
      if (!cfKey) return null;
      return new Promise((ok) => {
        window.__cfReady = () => ok(window.turnstile || null);
        const sc = document.createElement('script');
        sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__cfReady'; sc.async = true; sc.onerror = () => ok(null);
        document.head.append(sc);
      });
    }).catch(() => null));
  const guard = (form, action) => {
    const btn = $('button[type=submit]', form);
    if (!btn) return;
    const box = document.createElement('div'); box.className = 'cf-box';
    btn.parentNode.insertBefore(box, btn);
    captcha().then((ts) => { if (!ts) { box.remove(); return; } form._cf = { ts, id: ts.render(box, { sitekey: cfKey, action, language: 'tr' }) }; });
  };
  const cfToken = (form) => (form._cf ? form._cf.ts.getResponse(form._cf.id) || '' : null);
  const cfReset = (form) => { if (form._cf) try { form._cf.ts.reset(form._cf.id); } catch { /* yok */ } };
  const CF_MSG = 'Lütfen "Ben robot değilim" doğrulamasını tamamlayın.';
  $$('[data-lead]').forEach((form) => guard(form, 'lead'));

  // Formlar → panel (Destek'e "Web sitesi" olarak düşer); demo formu dönen bağlantıyla demo panelini açar
  $$('[data-lead]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-msg]', form), btn = $('button[type=submit]', form), f = new FormData(form);
    const raw = String(f.get('topic') || 'demo');
    const body = { name: f.get('name'), company: f.get('company'), phone: f.get('phone'), email: f.get('email'), message: f.get('message') || '', website: f.get('website'), channels: f.getAll('channels'), consent: !!f.get('consent'),
      topic: ['demo', 'teklif'].includes(raw) ? raw : 'iletisim', plan: q.get('paket') || '' };
    if (raw === 'arama' && !/arayın/i.test(body.message)) body.message = 'Lütfen beni arayın. ' + body.message;
    const say = (cls, t) => { msg.className = 'form-msg ' + cls; msg.textContent = t; };
    if (String(body.name || '').trim().length < 2) { mark(form, 'name'); return say('err', 'Lütfen adınızı yazın.'); }
    if (!okPhone(body.phone)) { mark(form, 'phone'); return say('err', 'Geçerli bir telefon numarası yazın (ör. 0532 123 45 67 ya da 0212 123 45 67).'); }
    if (!okEmail(body.email)) { mark(form, 'email'); return say('err', 'Geçerli bir e-posta adresi yazın.'); }
    if (!body.consent) return say('err', 'Lütfen KVKK aydınlatma metnini onaylayın.');
    const tok = cfToken(form);
    if (tok === '') return say('err', CF_MSG);
    if (tok) body.cf = tok;
    btn.disabled = true; say('', 'Gönderiliyor…');
    try {
      const r = await fetch(S.leadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gönderilemedi');
      const ok = $('[data-demo-ok]', form);
      if (ok && j.demo) {
        $('[data-demo-link]', ok).href = j.demo;
        $$(':scope > :not([data-demo-ok])', form).forEach((x) => { x.hidden = true; });
        ok.hidden = false; form.classList.add('done');
        return;
      }
      form.reset(); if (topicSel) topicSel.value = raw;
      say('ok', 'Teşekkürler! Mesajınız bize ulaştı, en kısa sürede dönüş yapacağız.');
      if (window.hcConversion) window.hcConversion('lead', 'generate_lead', { form: raw });
      if (raw === 'demo' && j.demo) msg.insertAdjacentHTML('beforeend', ` <a href="${esc(j.demo)}" target="_blank" rel="noopener">Demo panelini şimdi açın →</a>`);
    } catch (x) {
      say('err', `${x.message || 'Gönderilemedi'}.${get('company.phone') ? ` Dilerseniz ${get('company.phone')} numarasından ulaşabilirsiniz.` : ''}`);
    } finally { btn.disabled = false; cfReset(form); }
  }));

  // 7 günlük deneme: form gönderilince panel hemen açılır, dönen tek kullanımlık bağlantıyla doğrudan girilir
  $$('[data-trial]').forEach((form) => guard(form, 'trial'));
  $$('[data-trial]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-msg]', form), btn = $('button[type=submit]', form), f = new FormData(form);
    const body = Object.fromEntries(['company', 'name', 'phone', 'email', 'username', 'password', 'website'].map((k) => [k, String(f.get(k) || '').trim()]));
    body.password = String(f.get('password') || ''); body.consent = !!f.get('consent');
    const say = (cls, t) => { msg.className = 'form-msg ' + cls; msg.textContent = t; };
    if (body.company.length < 2) { mark(form, 'company'); return say('err', 'Firma / mağaza adını yazın.'); }
    if (body.name.length < 2) { mark(form, 'name'); return say('err', 'Lütfen adınızı ve soyadınızı yazın.'); }
    if (!okPhone(body.phone)) { mark(form, 'phone'); return say('err', 'Geçerli bir telefon numarası yazın (ör. 0532 123 45 67).'); }
    if (!okEmail(body.email)) { mark(form, 'email'); return say('err', 'Geçerli bir e-posta adresi yazın.'); }
    if (!/^[\p{L}0-9._-]{3,40}$/u.test(body.username)) { mark(form, 'username'); return say('err', 'Kullanıcı adı 3-40 karakter olmalı (harf, rakam, . _ -), boşluk içermemeli.'); }
    if (body.password.length < 8) { mark(form, 'password'); return say('err', 'Şifre en az 8 karakter olmalı.'); }
    if (!body.consent) return say('err', 'Lütfen kullanım koşullarını ve KVKK aydınlatma metnini onaylayın.');
    const tok = cfToken(form);
    if (tok === '') return say('err', CF_MSG);
    if (tok) body.cf = tok;
    if (!S.panelUrl) return say('err', 'Deneme paneli şu an açılamıyor; lütfen bizi arayın.');
    btn.disabled = true; say('', 'Paneliniz açılıyor…');
    try {
      const r = await fetch(`${S.panelUrl.replace(/\/+$/, '')}/api/public/trial`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Panel açılamadı');
      if (!j.url) { say('ok', 'Teşekkürler!'); return; }
      const ok = $('[data-trial-ok]', form);
      $('[data-t-slug]', ok).textContent = j.slug; $('[data-t-user]', ok).textContent = j.username;
      $('[data-t-link]', ok).href = j.url;
      $$(':scope > :not([data-trial-ok])', form).forEach((x) => { x.hidden = true; });
      ok.hidden = false; form.classList.add('done');
      if (window.hcConversion) window.hcConversion('trial', 'sign_up', { method: 'trial' });
    } catch (x) {
      say('err', `${x.message || 'Panel açılamadı'}.${get('company.phone') ? ` Dilerseniz ${get('company.phone')} numarasından ulaşabilirsiniz.` : ''}`.replace('..', '.'));
    } finally { btn.disabled = false; cfReset(form); }
  }));

  // Blog yazısı: okuma ilerleme çubuğu ve içindekilerde okunan başlığın vurgusu
  const bar = $('[data-progress]');
  if (bar) {
    const art = $('.bl-art'), links = $$('.bl-toc a'), heads = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    let tick = false;
    const upd = () => {
      tick = false;
      const r = art.getBoundingClientRect(), total = r.height - innerHeight * 0.6;
      bar.style.width = `${Math.max(0, Math.min(100, (-r.top / Math.max(1, total)) * 100))}%`;
      let cur = -1; heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) cur = i; });
      links.forEach((a, i) => a.classList.toggle('on', i === cur));
    };
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  // ---------- Teşekkür sayfaları (reklam dönüşümü için sabit adresler): /odeme-basarili (kartla ödeme), /siparis-alindi (havale / EFT) ----------
  const th = $('[data-thanks]');
  if (th) {
    const g = (k) => q.get(k) || '', renew = g('tur') === 'yenileme', amount = Number(g('tutar')) || 0;
    const row = (k, v, copy) => `<dt>${esc(k)}</dt><dd>${v}${copy ? ` <button type="button" class="co-copy" data-copy="${esc(copy)}">Kopyala</button>` : ''}</dd>`;
    const rows = [];
    if (g('siparis')) rows.push(row('Sipariş no', esc(g('siparis')), th.dataset.thanks === 'eft' ? g('siparis') : ''));
    if (g('paket')) rows.push(row('Paket', `${esc(g('paket'))}${g('donem') ? ` · ${g('donem') === 'yillik' ? 'yıllık' : 'aylık'}` : ''}`));
    if (amount) rows.push(row('Tutar', `<b>${tl(amount)} ₺</b> <small>KDV dahil${Number(g('indirim')) ? ` · %${Number(g('indirim'))} havale indirimi` : ''}</small>`));
    if (th.dataset.thanks === 'eft') {
      const k = S.bank || {};
      rows.push(row('Banka', esc(k.name || '')), row('Hesap sahibi', esc(k.holder || '')), row('IBAN', `<span class="iban">${esc(k.iban || '')}</span>`, String(k.iban || '').replace(/\s/g, '')));
      if (renew) $('[data-t-lead]', th).textContent = 'Aşağıdaki hesaba havale / EFT yapın; açıklamaya sipariş numaranızı yazın. Ödemeniz hesabımıza geçince aboneliğiniz uzatılır.';
    } else if (renew) {
      $('[data-t-title]', th).textContent = 'Teşekkürler, aboneliğiniz uzatıldı';
      $('[data-t-lead]', th).textContent = 'Ödemeniz alındı ve paketiniz güncellendi. Panelinizi kullanmaya kaldığınız yerden devam edebilirsiniz.';
    }
    const dl = $('[data-t-dl]', th);
    dl.innerHTML = rows.join(''); dl.hidden = !rows.length;
    th.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = 'Kopyalandı'; }).catch(() => {}); });
  }

  // ---------- Satın al (iyzico): 1 Paket → 2 Hesap → 3 Fatura bilgileri → 4 Onay; özet kartı seçime göre güncellenir ----------
  const co = $('[data-checkout]');
  if (co) {
    guard(co, 'checkout');
    const plans = (S.plans || []).filter((p) => p.key && p.monthly);
    const st = { plan: q.get('plan') || 'profesyonel', period: q.get('donem') === 'aylik' ? 'monthly' : 'yearly', kind: q.get('firma') ? 'renew' : 'new', inv: 'bireysel', pay: 'card' };
    if (!plans.some((p) => p.key === st.plan)) st.plan = (plans[1] || plans[0] || {}).key;
    if (q.get('firma')) co.elements.slug_renew.value = q.get('firma');
    const IL = 'Adana Adıyaman Afyonkarahisar Ağrı Aksaray Amasya Ankara Antalya Ardahan Artvin Aydın Balıkesir Bartın Batman Bayburt Bilecik Bingöl Bitlis Bolu Burdur Bursa Çanakkale Çankırı Çorum Denizli Diyarbakır Düzce Edirne Elazığ Erzincan Erzurum Eskişehir Gaziantep Giresun Gümüşhane Hakkari Hatay Iğdır Isparta İstanbul İzmir Kahramanmaraş Karabük Karaman Kars Kastamonu Kayseri Kilis Kırıkkale Kırklareli Kırşehir Kocaeli Konya Kütahya Malatya Manisa Mardin Mersin Muğla Muş Nevşehir Niğde Ordu Osmaniye Rize Sakarya Samsun Şanlıurfa Siirt Sinop Şırnak Sivas Tekirdağ Tokat Trabzon Tunceli Uşak Van Yalova Yozgat Zonguldak'.split(' ');
    $('[data-iller]', co).insertAdjacentHTML('beforeend', IL.map((x) => `<option>${x}</option>`).join(''));
    const F = co.elements;
    // Firma kodu, kullanıcı adı ve geçici şifreyi sunucu üretir (e-postayla gönderilir); fatura unvanı firma adından önerilir
    F.firm.addEventListener('input', () => { if (!F.company.value || F.company.dataset.auto) { F.company.value = F.firm.value; F.company.dataset.auto = '1'; } });
    F.corp.addEventListener('change', () => { st.inv = F.corp.checked ? 'kurumsal' : 'bireysel'; draw(); });
    $$('[name=pay]', co).forEach((r) => r.addEventListener('change', () => { st.pay = r.value; draw(); }));
    document.addEventListener('shop:state', () => { if (!cardOn) st.pay = 'eft'; draw(); });
    const copy = (t, b) => navigator.clipboard.writeText(t).then(() => { const o = b.textContent; b.textContent = 'Kopyalandı'; setTimeout(() => { b.textContent = o; }, 1500); }).catch(() => {});
    co.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) { e.preventDefault(); copy(b.dataset.copy, b); } });
    F.company.addEventListener('input', () => { delete F.company.dataset.auto; });
    const draw = () => {
      const p = plans.find((x) => x.key === st.plan) || {}, yearly = st.period === 'yearly', amount = yearly ? p.yearly : p.monthly;
      $('[data-co-plans]', co).innerHTML = plans.map((x) => `<button type="button" role="radio" aria-checked="${x.key === st.plan}" class="co-plan${x.key === st.plan ? ' on' : ''}" data-plan="${x.key}"><b>${esc(x.name)}</b><span>${tl(yearly ? x.yearly : x.monthly)} ₺ <small>${yearly ? '/ yıl' : '/ ay'}</small></span><em>${esc((x.limits || []).join(' · '))}</em></button>`).join('');
      $$('[data-period]', co).forEach((b) => b.classList.toggle('on', b.dataset.period === st.period));
      $$('[data-kind]', co).forEach((b) => b.classList.toggle('on', b.dataset.kind === st.kind));
      $$('[data-for]', co).forEach((x) => { x.hidden = x.dataset.for !== st.kind; $$('input', x).forEach((i) => { i.disabled = x.hidden; }); });
      $$('[data-inv-for]', co).forEach((x) => { x.hidden = x.dataset.invFor !== st.inv; });
      const inst = yearly && S.installments ? `${S.installments} × ${tl((amount || 0) / S.installments)} ₺` : '';
      const save = yearly && p.monthly ? p.monthly * 12 - p.yearly : 0;
      $('[data-co-sum]', co).innerHTML = `<h3>Sipariş özeti</h3>
        <div class="co-sum-pkg"><div><b>${esc(p.name || '')} paketi</b><small>${esc((p.limits || []).join(' · '))}</small></div><em>${yearly ? 'Yıllık' : 'Aylık'}</em></div>
        <dl><dt>Süre</dt><dd>${yearly ? '12 ay' : '1 ay'}</dd>
          ${yearly ? `<dt>Aylık karşılığı</dt><dd>${tl(p.yearly / 12)} ₺</dd>` : `<dt>Aylık ücret</dt><dd>${tl(p.monthly)} ₺</dd>`}
          ${save ? `<dt>Yıllık kazanç</dt><dd class="good">${tl(save)} ₺ (2 ay hediye)</dd>` : ''}
          <dt>Kurulum ücreti</dt><dd class="good">Yok</dd></dl>
        <div class="co-sum-tot"><span>Toplam</span><b>${tl(amount || 0)} ₺<small>KDV dahil</small></b></div>
        ${inst ? `<div class="co-sum-inst"><b>Peşin fiyatına ${S.installments} taksit:</b> ${inst} (kredi kartına)</div>` : `<div class="co-sum-inst">Yıllık alımda 2 ay hediye ve peşin fiyatına ${S.installments || 3} taksit.</div>`}
        ${yearly && eftPct() ? `<div class="co-sum-eft"><b>Havale / EFT ile:</b> ${tl(eftPrice(amount, 'yearly'))} ₺ <small>(%${eftPct()} indirim)</small></div>` : ''}`;
      $('[data-co-total]', co).innerHTML = `<span>${esc(p.name || '')} · ${yearly ? 'yıllık (12 ay)' : 'aylık (1 ay)'}</span><b>${tl(amount || 0)} ₺</b><small>KDV dahil${inst ? ` · ${S.installments} taksit imkânı` : ''}</small>`;
      $('[data-co-pay]', co).textContent = `${tl(amount || 0)} ₺ öde · güvenli ödemeye geç`;
      // Ödeme yöntemi: kart (iyzico) ya da havale / EFT (yıllıkta indirimli); havalede banka bilgileri ve tutar gösterilir
      const eftAmt = eftPrice(amount, st.period), pct = yearly ? eftPct() : 0, bank = S.bank || {};
      const card = $('[name=pay][value=card]', co);
      card.disabled = !cardOn; card.closest('label').classList.toggle('off', !cardOn);
      if (!cardOn) st.pay = 'eft';
      $$('[name=pay]', co).forEach((r) => { r.checked = r.value === st.pay; r.closest('label').classList.toggle('on', r.checked); });
      $('[data-pm-card]', co).textContent = cardOn ? `iyzico 3D Secure${yearly && S.installments ? ` · peşin fiyatına ${S.installments} taksit` : ''}` : 'Şu an kapalı; havale / EFT ile ödeyebilirsiniz';
      $('[data-pm-eft]', co).textContent = pct ? `%${pct} indirimli: ${tl(eftAmt)} ₺` : 'Aylık pakette indirim yok';
      const eftBox = $('[data-co-eft]', co);
      eftBox.hidden = st.pay !== 'eft';
      eftBox.innerHTML = `<b>Havale / EFT bilgileri</b>
        <dl><dt>Banka</dt><dd>${esc(bank.name || '')}</dd><dt>Hesap sahibi</dt><dd>${esc(bank.holder || '')}</dd>
        <dt>IBAN</dt><dd class="iban">${esc(bank.iban || '')} <button type="button" class="co-copy" data-copy="${esc(String(bank.iban || '').replace(/\s/g, ''))}">Kopyala</button></dd>
        <dt>Tutar</dt><dd><b>${tl(eftAmt)} ₺</b> <small>KDV dahil${pct ? ` · %${pct} havale indirimi` : ''}</small></dd></dl>
        <span>Siparişi verince size sipariş numarası verilir; açıklamaya bu numarayı yazın. Ödemeniz hesabımıza geçince ${st.kind === 'renew' ? 'aboneliğiniz uzatılır' : 'paneliniz açılır ve giriş bilgileriniz e-postanıza gönderilir'}.</span>`;
      $('.co-secure', co).hidden = st.pay === 'eft';
      if (st.pay === 'eft') {
        $('[data-co-total]', co).innerHTML = `<span>${esc(p.name || '')} · ${yearly ? 'yıllık (12 ay)' : 'aylık (1 ay)'} · havale / EFT</span><b>${tl(eftAmt)} ₺</b><small>KDV dahil${pct ? ` · %${pct} indirim uygulandı` : ''}</small>`;
        $('[data-co-pay]', co).textContent = `Siparişi ver · ${tl(eftAmt)} ₺ havale / EFT`;
      }
    };
    co.addEventListener('click', (e) => {
      const b = e.target.closest('[data-plan],[data-period],[data-kind]');
      if (!b) return;
      if (b.dataset.plan) st.plan = b.dataset.plan;
      if (b.dataset.period) st.period = b.dataset.period;
      if (b.dataset.kind) st.kind = b.dataset.kind;
      draw();
    });
    // Üstteki adım göstergesi: üzerinde çalışılan adım
    const steps = $$('[data-co-steps] li');
    co.addEventListener('focusin', (e) => {
      const f = e.target.closest('[data-step]'); if (!f) return;
      const n = Number(f.dataset.step);
      steps.forEach((li, i) => { li.classList.toggle('on', i + 1 === n); li.classList.toggle('done', i + 1 < n); });
    });
    draw();
    co.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('[data-msg]', co), btn = $('button[type=submit]', co);
      const say = (cls, t) => { msg.className = 'form-msg ' + cls; msg.textContent = t; };
      const val = (k) => String((F[k] && F[k].value) || '').trim();
      const bad = (k, t) => { mark(co, k); say('err', t); };
      const renew = st.kind === 'renew', corp = st.inv === 'kurumsal';
      // Adım sırasıyla denetim: ilk eksik alan işaretlenir
      if (!renew) {
        if (val('firm').length < 2) return bad('firm', 'Firma / mağaza adını yazın.');
      } else if (!val('slug_renew')) return bad('slug_renew', 'Firma kodunuzu yazın.');
      if (!okEmail(val('email'))) return bad('email', 'Geçerli bir e-posta adresi yazın.');
      if (!okPhone(val('phone'))) return bad('phone', 'Geçerli bir telefon numarası yazın (ör. 0532 123 45 67 ya da 0212 123 45 67).');
      if (!corp) {
        if (val('inv_name').split(/\s+/).length < 2) return bad('inv_name', 'Fatura için adınızı ve soyadınızı yazın.');
        if (!okTckn(val('tckn'))) return bad('tckn', 'Geçerli bir TC kimlik numarası yazın (11 hane).');
      } else {
        if (val('company').length < 3) return bad('company', 'Firma unvanını yazın.');
        if (val('tax_office').length < 2) return bad('tax_office', 'Vergi dairesini yazın.');
        if (!/^\d{10}$/.test(val('tax_no')) && !okTckn(val('tax_no'))) return bad('tax_no', 'Vergi numarası 10 hane olmalı (şahıs şirketinde 11 haneli TC kimlik no).');
        if (val('contact').split(/\s+/).length < 2) return bad('contact', 'Yetkili kişinin adını ve soyadını yazın.');
      }
      if (val('address').length < 8) return bad('address', 'Fatura adresini yazın (mahalle, cadde / sokak, no).');
      if (!val('city')) return bad('city', 'Fatura adresinin ilini seçin.');
      if (!val('district')) return bad('district', 'Fatura adresinin ilçesini yazın.');
      if (!F.consent.checked) return bad('consent', 'Lütfen ön bilgilendirme formunu ve mesafeli satış sözleşmesini onaylayın.');
      const invoice = corp ? { type: 'kurumsal', company: val('company'), taxOffice: val('tax_office'), taxNo: val('tax_no').replace(/\D/g, ''), contact: val('contact'), efatura: F.efatura.checked }
        : { type: 'bireysel', name: val('inv_name'), tckn: val('tckn').replace(/\D/g, '') };
      Object.assign(invoice, { address: val('address'), district: val('district'), city: val('city') });
      const body = { kind: st.kind, plan: st.plan, period: st.period, pay: st.pay, website: val('website'), consent: true, email: val('email'), phone: val('phone'), invoice };
      if (!renew) body.firm = val('firm');
      else body.slug = val('slug_renew');
      const tok = cfToken(co);
      if (tok === '') return say('err', CF_MSG);
      if (tok) body.cf = tok;
      btn.disabled = true; say('', 'Güvenli ödeme sayfası hazırlanıyor…');
      try {
        const r = await fetch(S.checkoutUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.eft) {
          // Havale / EFT: sipariş kaydedildi → teşekkür sayfası (reklam dönüşümü için sabit adres; banka bilgileri orada)
          const tq = new URLSearchParams({ siparis: j.order, tutar: String(j.amount), paket: (plans.find((x) => x.key === st.plan) || {}).name || '', donem: st.period === 'yearly' ? 'yillik' : 'aylik', tur: body.kind === 'renew' ? 'yenileme' : 'yeni', ...(j.discount ? { indirim: String(j.discount) } : {}) });
          location.href = `/siparis-alindi?${tq}`;
          return;
        }
        if (!r.ok || !j.url) throw new Error(j.error || 'Ödeme başlatılamadı');
        say('ok', 'iyzico ödeme sayfasına yönlendiriliyorsunuz…');
        location.href = j.url;
      } catch (x) {
        say('err', `${x.message || 'Ödeme başlatılamadı'}${get('company.phone') ? ` · Yardım için: ${get('company.phone')}` : ''}`);
        btn.disabled = false; cfReset(co);
      }
    });
  }
})();
