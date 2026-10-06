// Tanıtım sitesi: kanal listeleri, ekran sekmeleri, paketler, iletişim bilgileri (config.js) ve demo talep formu.
(() => {
  const S = window.SITE || {}, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (k) => k.split('.').reduce((o, x) => (o ? o[x] : undefined), S);

  // Kanallar: aktif olanlar ve yakında gelecekler. [ad, tür, rozet rengi, kısa ad, yazı stili (logo şeridi)]
  const ACTIVE = [
    ['Hepsiburada', 'pazaryeri', '#ff6000', 'hb', 'color:#ff6000;font-size:19px'], ['Trendyol', 'pazaryeri', '#f27a1a', 'T', 'color:#f27a1a'], ['ikas', 'e-ticaret sitesi', '#111827', 'ik', 'color:#111827;font-size:24px'],
    ['N11', 'pazaryeri', '#7b3fe4', 'n11', 'color:#7b3fe4'], ['PttAVM', 'pazaryeri', '#e0a800', 'Ptt', 'color:#e0a800'], ['idefix', 'pazaryeri', '#1d4ed8', 'id', 'color:#1d4ed8;font-style:italic'],
    ['Pazarama', 'pazaryeri', '#7a2bc9', 'Pz', 'color:#7a2bc9;font-size:19px'],
  ];
  const SOON = [
    ['Amazon', 'pazaryeri', '#232f3e', 'a'], ['Çiçeksepeti', 'pazaryeri', '#1e9e57', 'Çs'], ['Koçtaş', 'pazaryeri', '#e5541b', 'K'], ['Shopify', 'e-ticaret sitesi', '#5e8e3e', 'S'],
    ['WooCommerce', 'e-ticaret sitesi', '#7f54b3', 'W'], ['Etsy', 'pazaryeri', '#f1641e', 'E'],
  ];
  const badge = ([, , c, s]) => `<span class="b" style="background:${c}">${esc(s)}</span>`;
  const wordmark = (n) => ({ Hepsiburada: 'hepsiburada', Trendyol: 'trendyol', N11: 'n11', Pazarama: 'pazarama' }[n] || n);
  const logos = $('[data-logos]');
  // Logo şeridi: kayan bant (iki kopya yan yana döner; hareket azaltma tercihinde yalnız ilk kopya durur)
  const wms = (dup) => ACTIVE.map((x) => `<a class="wm${dup ? ' dup' : ''}" href="#entegrasyonlar" style="${x[4]}" title="${esc(x[0])}"${dup ? ' aria-hidden="true" tabindex="-1"' : ''}>${esc(wordmark(x[0]))}</a>`).join('');
  if (logos) logos.innerHTML = wms(false) + wms(true) + wms(true) + wms(true);
  $$('[data-count="active"]').forEach((el) => { el.textContent = ACTIVE.length; });
  const integ = (list, soon) => list.map((x) => `<div class="it${soon ? ' soon' : ''}">${badge(x)}<div style="min-width:0"><b>${esc(x[0])}</b><small>${esc(x[1])}${soon ? ' · yakında' : ''}</small></div></div>`).join('');
  const ia = $('[data-integ="active"]'), is = $('[data-integ="soon"]');
  if (ia) ia.innerHTML = integ(ACTIVE);
  if (is) is.innerHTML = integ(SOON, true);
  const chans = $('[data-chans]');
  if (chans) chans.innerHTML = [...ACTIVE, ...SOON].map((x) => x[0]).concat(['Diğer']).map((n) => `<label><input type="checkbox" name="channels" value="${esc(n)}">${esc(n)}</label>`).join('');

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

  // Paketler
  const plans = $('[data-plans]');
  if (plans) plans.innerHTML = (S.plans || []).map((p) => `<div class="plan${p.featured ? ' featured' : ''} reveal">${p.featured ? '<span class="badge">En çok tercih edilen</span>' : ''}
      <h3>${esc(p.name)}</h3><div class="tag">${esc(p.tag)}</div>
      <div class="price">${p.price ? `${esc(p.price)} <small>/ ${esc(p.period || 'ay')}</small>` : 'Teklif alın'}</div><div class="users">${esc(p.users)}</div>
      <ul>${p.items.map((x) => `<li><svg><use href="#i-check"/></svg><span>${esc(x)}</span></li>`).join('')}</ul>
      <a class="btn ${p.featured ? 'btn-primary' : 'btn-outline'}" href="#iletisim" data-plan="${esc(p.name)}">${p.price ? 'Başlayın' : 'Teklif isteyin'}</a></div>`).join('');
  $$('[data-plan]').forEach((a) => a.addEventListener('click', () => { const m = $('[name=message]'); if (m && !m.value) m.value = `${a.dataset.plan} paketi hakkında bilgi almak istiyorum.`; }));
  // "Biz sizi arayalım": formda arama talebini hazırla, ad alanına geç
  $$('[data-callme]').forEach((a) => a.addEventListener('click', () => {
    const m = $('[name=message]'); if (m && !m.value) m.value = 'Lütfen beni arayın.';
    setTimeout(() => { const n = $('[name=name]'); if (n) n.focus({ preventScroll: true }); }, 400);
  }));
  // KDV notu yalnız fiyat yazılmışsa
  const priced = (S.plans || []).some((p) => p.price);
  $$('#paketler .note').forEach((n) => { if (!priced) n.textContent = 'Fiyat teklifi; mağaza ve kanal sayınıza, aylık sipariş adedinize göre hazırlanır.'; });

  // Şirket / iletişim bilgileri (config.js): boşsa ilgili satır gizlenir; yasal sayfalarda [köşeli] yer tutucu kalır
  $$('[data-show]').forEach((el) => { if (!get(el.dataset.show)) el.hidden = true; });
  $$('[data-c]').forEach((el) => {
    const v = get(el.dataset.c);
    if (!v) { if (el.dataset.ph) el.innerHTML = `<span class="ph">[${esc(el.dataset.ph)}]</span>`; return; }
    if (el.dataset.href === 'tel') { el.href = 'tel:' + String(v).replace(/[^\d+]/g, ''); el.textContent = v; }
    else if (el.dataset.href === 'mailto') { el.href = 'mailto:' + v; el.textContent = v; }
    else if (el.dataset.href === 'wa') { el.href = 'https://wa.me/' + String(v).replace(/\D/g, ''); el.target = '_blank'; el.rel = 'noopener'; }
    else el.textContent = v;
  });
  if (S.panelUrl) $$('[data-panel]').forEach((a) => { a.href = S.panelUrl; });
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

  // Demo talep formu → panel (Destek'e "Web sitesi" olarak düşer)
  const form = $('[data-lead]');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-msg]', form), btn = $('button[type=submit]', form), f = new FormData(form);
    const body = { name: f.get('name'), company: f.get('company'), phone: f.get('phone'), email: f.get('email'), message: f.get('message'), website: f.get('website'), channels: f.getAll('channels'), consent: !!f.get('consent') };
    const say = (cls, t) => { msg.className = 'form-msg ' + cls; msg.textContent = t; };
    if (String(body.name || '').trim().length < 2) return say('err', 'Lütfen adınızı yazın.');
    if (!String(body.phone || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email || ''))) return say('err', 'Size ulaşabilmemiz için telefon ya da e-posta yazın.');
    if (!body.consent) return say('err', 'Lütfen KVKK aydınlatma metnini onaylayın.');
    btn.disabled = true; say('', 'Gönderiliyor…');
    try {
      const r = await fetch(S.leadUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gönderilemedi');
      form.reset(); say('ok', 'Teşekkürler! Talebiniz bize ulaştı, en kısa sürede dönüş yapacağız.');
    } catch (x) {
      say('err', `${x.message || 'Gönderilemedi'}.${get('company.phone') ? ` Dilerseniz ${get('company.phone')} numarasından ulaşabilirsiniz.` : ''}`);
    } finally { btn.disabled = false; }
  });
})();
