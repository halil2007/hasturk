// Tanıtım sitesi: kanal listeleri, ekran sekmeleri, paketler (aylık / yıllık), karşılaştırma tablosu, iletişim bilgileri (config.js),
// iletişim ve demo formları (demo formu panelden dönen demo bağlantısını gösterir).
(() => {
  const S = window.SITE || {}, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (k) => k.split('.').reduce((o, x) => (o ? o[x] : undefined), S);
  const tl = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const waUrl = (v) => 'https://wa.me/' + String(v).replace(/\D/g, '') + (S.waText ? '?text=' + encodeURIComponent(S.waText) : '');

  // Kanallar: aktif olanlar ve yakında gelecekler. [ad, tür, rozet rengi, kısa ad, yazı stili (logo şeridi)]
  const ACTIVE = [
    ['Hepsiburada', 'pazaryeri', '#ff6000', 'hb', 'color:#ff6000;font-size:19px'], ['Trendyol', 'pazaryeri', '#f27a1a', 'T', 'color:#f27a1a'], ['ikas', 'e-ticaret sitesi', '#111827', 'ik', 'color:#111827;font-size:24px'],
    ['N11', 'pazaryeri', '#7b3fe4', 'n11', 'color:#7b3fe4'], ['PttAVM', 'pazaryeri', '#e0a800', 'Ptt', 'color:#e0a800'], ['idefix', 'pazaryeri', '#1d4ed8', 'id', 'color:#1d4ed8;font-style:italic'],
    ['Pazarama', 'pazaryeri', '#7a2bc9', 'Pz', 'color:#7a2bc9;font-size:19px'],
  ];
  const SOON = [
    ['Amazon', 'pazaryeri', '#232f3e', 'a'], ['Çiçeksepeti', 'pazaryeri', '#1e9e57', 'Çs'], ['Koçtaş', 'pazaryeri', '#e5541b', 'K'], ['Shopify', 'e-ticaret sitesi', '#5e8e3e', 'S'],
    ['WooCommerce', 'e-ticaret sitesi', '#7f54b3', 'W'], ['Etsy', 'pazaryeri', '#f1641e', 'E'], ['Ticimax', 'e-ticaret sitesi', '#0b5cff', 'Tx'],
    ['IdeaSoft', 'e-ticaret sitesi', '#00a3e0', 'iS'], ['T-Soft', 'e-ticaret sitesi', '#e30613', 'TS'], ['OpenCart', 'e-ticaret sitesi', '#23a8e0', 'OC'],
  ];
  const badge = ([, , c, s]) => `<span class="b" style="background:${c}">${esc(s)}</span>`;
  const wordmark = (n) => ({ Hepsiburada: 'hepsiburada', Trendyol: 'trendyol', N11: 'n11', Pazarama: 'pazarama' }[n] || n);
  // Logo şeridi: kayan bant (iki kopya yan yana döner; hareket azaltma tercihinde yalnız ilk kopya durur)
  const wms = (dup, link = true) => ACTIVE.map((x) => `<${link ? 'a href="/entegrasyonlar"' : 'span'} class="wm${dup ? ' dup' : ''}" style="${x[4]}" title="${esc(x[0])}"${dup ? ' aria-hidden="true" tabindex="-1"' : ''}>${esc(wordmark(x[0]))}</${link ? 'a' : 'span'}>`).join('');
  const logos = $('[data-logos]');
  if (logos) logos.innerHTML = wms(false) + wms(true) + wms(true) + wms(true);
  const logosStatic = $('[data-logos-static]');
  if (logosStatic) logosStatic.innerHTML = wms(false, false);
  $$('[data-count="active"]').forEach((el) => { el.textContent = ACTIVE.length; });
  const integ = (list, soon) => list.map((x) => `<div class="it${soon ? ' soon' : ''}">${badge(x)}<div style="min-width:0"><b>${esc(x[0])}</b><small>${esc(x[1])}${soon ? ' · yakında' : ''}</small></div></div>`).join('');
  $$('[data-integ="active"]').forEach((el) => { el.innerHTML = integ(ACTIVE); });
  $$('[data-integ="soon"]').forEach((el) => { el.innerHTML = integ(SOON, true); });
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

  // Paketler: fiyatlar KDV dahil; büyük fiyat aylık, altında yıllık alım kutusu (2 ay hediye, peşin fiyatına taksit)
  const priceHtml = (p) => {
    if (!p.monthly && !p.yearly) return '<div class="price">Teklif alın</div>';
    const save = p.monthly && p.yearly ? p.monthly * 12 - p.yearly : 0;
    const inst = S.installments && p.yearly ? `${S.installments} × ${tl(p.yearly / S.installments)} ₺` : '';
    return `<div class="price">${tl(p.monthly)} <span class="cur">₺</span><small>/ ay</small></div>
      <div class="vatline">KDV dahil · aylık ödeme</div>
      ${p.yearly ? `<div class="yearly"><div class="y-top"><b>Yıllık ${tl(p.yearly)} ₺</b><small>KDV dahil</small>${save ? `<span class="save">${tl(save)} ₺ kazanç</span>` : ''}</div>
        <div class="y-sub">2 ay hediye · aylık ${tl(p.yearly / 12)} ₺'ye gelir</div>
        ${inst ? `<div class="y-inst"><b>Peşin fiyatına ${S.installments} taksit</b><span>${inst}</span></div>` : ''}</div>` : ''}`;
  };
  // "Hemen satın al" yalnız online satış açıkken (panelde iyzico API bilgileri girilmişse) görünür; kapalıyken eski hali
  const renderPlans = (shop) => $$('[data-plans]').forEach((el) => {
    el.innerHTML = (S.plans || []).map((p) => `<div class="plan${p.featured ? ' featured' : ''}">${p.featured ? '<span class="badge">En çok tercih edilen</span>' : ''}
      <h3>${esc(p.name)}</h3><div class="tag">${esc(p.tag)}</div>${priceHtml(p)}
      <div class="limits">${(p.limits || []).map((x) => `<span>${esc(x)}</span>`).join('')}</div>
      <ul>${p.items.map((x) => `<li><svg><use href="#i-check"/></svg><span>${esc(x)}</span></li>`).join('')}${(p.soon || []).map((x) => `<li class="soon"><svg><use href="#i-bolt"/></svg><span>${esc(x)} <em>Yakında</em></span></li>`).join('')}</ul>
      ${shop && p.key ? `<a class="btn ${p.featured ? 'btn-primary' : 'btn-outline'}" href="/satin-al?plan=${p.key}&amp;donem=yillik">Hemen satın al</a>
      <a class="btn btn-line plan-trial" href="/iletisim?konu=teklif&amp;paket=${encodeURIComponent(p.name)}">7 gün ücretsiz deneyin</a>` : `<a class="btn ${p.featured ? 'btn-primary' : 'btn-outline'}" href="/iletisim?konu=teklif&amp;paket=${encodeURIComponent(p.name)}">7 gün ücretsiz deneyin</a>`}
      <a class="plan-demo" data-demo href="/demo">ya da önce demo panelini açın →</a></div>`).join('');
  });
  renderPlans(false);
  const shopOn = () => {
    document.documentElement.classList.add('shop-on');
    renderPlans(true);
    $$('[data-plans] [data-demo]').forEach((a) => { if (S.demoUrl) { a.href = S.demoUrl; a.target = '_blank'; a.rel = 'noopener'; } });
  };
  const shopState = (on) => {
    $$('[data-shop-wait]').forEach((x) => { x.hidden = true; });
    $$('[data-shop-off]').forEach((x) => { x.hidden = on; });
    $$('[data-shop]').forEach((x) => { x.hidden = !on; });
    if (on) shopOn();
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
  const mb = $('[data-menu]'), mn = $('[data-mnav]');
  if (mb && mn) {
    mb.addEventListener('click', () => { const o = mn.classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
    mn.addEventListener('click', (e) => { if (e.target.closest('a')) { mn.classList.remove('open'); mb.setAttribute('aria-expanded', 'false'); } });
  }

  // Görünürken beliren bölümler
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('seen')));

  // İletişim sayfası: adresle gelen konu (?konu=teklif&paket=Profesyonel, ?konu=arama, ?konu=kanal)
  const q = new URLSearchParams(location.search), topicSel = $('[data-topic]');
  if (topicSel && q.get('konu') && [...topicSel.options].some((o) => o.value === q.get('konu'))) {
    topicSel.value = q.get('konu');
    const m = $('[name=message]');
    if (m && !m.value) m.value = { arama: 'Lütfen beni arayın.', kanal: 'Entegrasyonunu istediğim kanal: ', teklif: q.get('paket') ? `${q.get('paket')} paketi için teklif ve deneme hesabı istiyorum.` : '' }[q.get('konu')] || '';
  }

  // Formlar → panel (Destek'e "Web sitesi" olarak düşer); demo formu dönen bağlantıyla demo panelini açar
  $$('[data-lead]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-msg]', form), btn = $('button[type=submit]', form), f = new FormData(form);
    const raw = String(f.get('topic') || 'demo');
    const body = { name: f.get('name'), company: f.get('company'), phone: f.get('phone'), email: f.get('email'), message: f.get('message') || '', website: f.get('website'), channels: f.getAll('channels'), consent: !!f.get('consent'),
      topic: ['demo', 'teklif'].includes(raw) ? raw : 'iletisim', plan: q.get('paket') || '' };
    if (raw === 'arama' && !/arayın/i.test(body.message)) body.message = 'Lütfen beni arayın. ' + body.message;
    const say = (cls, t) => { msg.className = 'form-msg ' + cls; msg.textContent = t; };
    if (String(body.name || '').trim().length < 2) return say('err', 'Lütfen adınızı yazın.');
    if (!String(body.phone || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email || ''))) return say('err', 'Size ulaşabilmemiz için telefon ya da e-posta yazın.');
    if (!body.consent) return say('err', 'Lütfen KVKK aydınlatma metnini onaylayın.');
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
      if (raw === 'demo' && j.demo) msg.insertAdjacentHTML('beforeend', ` <a href="${esc(j.demo)}" target="_blank" rel="noopener">Demo panelini şimdi açın →</a>`);
    } catch (x) {
      say('err', `${x.message || 'Gönderilemedi'}.${get('company.phone') ? ` Dilerseniz ${get('company.phone')} numarasından ulaşabilirsiniz.` : ''}`);
    } finally { btn.disabled = false; }
  }));

  // ---------- Satın al (iyzico) ----------
  const co = $('[data-checkout]');
  if (co) {
    const plans = (S.plans || []).filter((p) => p.key && p.monthly);
    const st = { plan: q.get('plan') || 'profesyonel', period: q.get('donem') === 'aylik' ? 'monthly' : 'yearly', kind: q.get('firma') ? 'renew' : 'new' };
    if (!plans.some((p) => p.key === st.plan)) st.plan = (plans[1] || plans[0] || {}).key;
    if (q.get('firma')) { const s = $('[name=slug_renew]', co); if (s) s.value = q.get('firma'); }
    const slugOf = (t) => String(t || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
    const firm = $('[name=firm]', co), slug = $('[name=slug]', co);
    let slugTouched = false;
    if (slug) slug.addEventListener('input', () => { slugTouched = true; });
    if (firm && slug) firm.addEventListener('input', () => { if (!slugTouched) slug.value = slugOf(firm.value); });
    const draw = () => {
      $$('[data-co-plans]').forEach((el) => {
        el.innerHTML = plans.map((p) => `<button type="button" class="co-plan${p.key === st.plan ? ' on' : ''}" data-plan="${p.key}"><b>${esc(p.name)}</b><span>${tl(st.period === 'yearly' ? p.yearly : p.monthly)} ₺ <small>${st.period === 'yearly' ? '/ yıl' : '/ ay'}</small></span><em>${esc((p.limits || []).join(' · '))}</em></button>`).join('');
      });
      $$('[data-period]', co).forEach((b) => b.classList.toggle('on', b.dataset.period === st.period));
      $$('[data-kind]', co).forEach((b) => b.classList.toggle('on', b.dataset.kind === st.kind));
      $$('[data-for]', co).forEach((x) => { x.hidden = x.dataset.for !== st.kind; $$('input', x).forEach((i) => { i.disabled = x.hidden; }); });
      const p = plans.find((x) => x.key === st.plan) || {}, amount = st.period === 'yearly' ? p.yearly : p.monthly;
      const sum = $('[data-co-sum]', co);
      if (sum) sum.innerHTML = `<div class="co-sum-row"><span>${esc(p.name || '')} paketi · ${st.period === 'yearly' ? 'yıllık (12 ay)' : 'aylık (1 ay)'}</span><b>${tl(amount || 0)} ₺</b></div>
        <div class="co-sum-note">KDV dahil${st.period === 'yearly' && S.installments ? ` · kredi kartına peşin fiyatına ${S.installments} taksit (${S.installments} × ${tl((amount || 0) / S.installments)} ₺)` : ''}${st.period === 'yearly' && p.monthly ? ` · ${tl(p.monthly * 12 - p.yearly)} ₺ kazanç` : ''}</div>`;
    };
    co.addEventListener('click', (e) => {
      const b = e.target.closest('[data-plan],[data-period],[data-kind]');
      if (!b) return;
      if (b.dataset.plan) st.plan = b.dataset.plan;
      if (b.dataset.period) st.period = b.dataset.period;
      if (b.dataset.kind) st.kind = b.dataset.kind;
      draw();
    });
    draw();
    co.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('[data-msg]', co), btn = $('button[type=submit]', co), f = new FormData(co);
      const say = (cls, t) => { msg.className = 'form-msg ' + cls; msg.textContent = t; };
      const val = (k) => String(f.get(k) || '').trim();
      const body = { kind: st.kind, plan: st.plan, period: st.period, website: val('website'), consent: !!f.get('consent'),
        contact: val('contact'), email: val(st.kind === 'renew' ? 'email_renew' : 'email'), phone: val('phone'), city: val('city'), address: val('address'), identity: val('identity') };
      if (st.kind === 'new') Object.assign(body, { firm: val('firm'), slug: val('slug'), username: val('username'), password: String(f.get('password') || '') });
      else body.slug = val('slug_renew');
      if (st.kind === 'new' && body.password !== String(f.get('password2') || '')) return say('err', 'Şifreler aynı değil.');
      if (!body.consent) return say('err', 'Lütfen mesafeli satış sözleşmesini ve ön bilgilendirme formunu onaylayın.');
      btn.disabled = true; say('', 'Güvenli ödeme sayfası hazırlanıyor…');
      try {
        const r = await fetch(S.checkoutUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.error || 'Ödeme başlatılamadı');
        say('ok', 'iyzico ödeme sayfasına yönlendiriliyorsunuz…');
        location.href = j.url;
      } catch (x) {
        say('err', `${x.message || 'Ödeme başlatılamadı'}${get('company.phone') ? ` · Yardım için: ${get('company.phone')}` : ''}`);
        btn.disabled = false;
      }
    });
  }
})();
