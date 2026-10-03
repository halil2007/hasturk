// Eşleştirme: FARKLI kanallardaki aynı ürünü / varyantı tek panel ürününe bağlar. Bir ürüne her kanaldan yalnızca bir ilan
// bağlanır; ana katalog sitesinin her varyantı kendi ürünüdür (aynı sitenin ürünleri birbiriyle eşleştirilmez).
// Kesin olanlar (barkod, stok kodu, ad + varyant birebir) senkronda otomatik bağlanır; tereddütlüler burada onaya düşer.
import { api, html, render, $, n, money, ch, chBadge, chLogo, thumb, actions, busy, toast, debounce, sheet, activeChannels } from '../core.js';
import { setQuery, loadSummary } from '../app.js';

const TABS = [['', 'Onay bekleyen'], ['linked', 'Eşleşmiş ürünler'], ['ignored', 'Yok sayılan']];
export const HOW = { barcode: ['good', 'Barkod'], sku: ['good', 'Stok kodu'], name: ['good', 'Ad + varyant'], new: ['info', 'Katalogdan'], manual: ['amber', 'Elle'] };
const howPill = (m) => { const [c, t] = HOW[m] || ['', m || '—']; return html`<span class="pill ${c}" title="Eşleşme yöntemi">${t}</span>`; };
const scoreCls = (s) => (s >= 70 ? 'hi' : s >= 45 ? 'mid' : 'lo');
const ids = (l) => html`<div class="muted tiny">${[l.sku && `SKU ${l.sku}`, l.barcode && `Barkod ${l.barcode}`].filter(Boolean).join(' · ') || 'SKU/barkod yok'}</div>`;
const vtag = (v, name) => (v && !String(name || '').includes(v) ? html`<span class="var-tag">${v}</span>` : '');

export async function matching(el, rest, query = {}) {
  const f = { tab: query.tab || '', channel: query.channel || '', q: query.q || '', multi: query.multi ?? '1', page: 1 };
  let data = { listings: [], counts: [] };
  render(el, html`<div class="stack">
    <div class="notice"><i class="ico ico-link"></i><div style="flex:1">Eşleştirme, <b>farklı kanallardaki</b> aynı ürünü birbirine bağlar; bir ürüne her kanaldan yalnızca bir ilan bağlanır. Barkod, stok kodu veya ad + varyant/ölçü birebir aynıysa <b>otomatik</b> bağlanır. Emin olunamayanlar burada önerilerle listelenir. Yanlış eşleşmeleri “Eşleşmiş ürünler” sekmesinden düzeltebilirsiniz.</div></div>
    <div class="kpis" data-kpis></div>
    <div class="row wrap">
      <div class="tabs" data-tabs></div>
      <span class="spacer"></span>
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-q value="${f.q}"></div>
      <button class="btn" data-act="auto"><i class="ico ico-sync"></i>Şimdi eşleştir</button>
      <button class="btn ghost" data-act="repair" title="Aynı kanaldan birden fazla ilanın tek ürüne bağlandığı eski eşleşmeleri ayırır">Hatalı eşleşmeleri onar</button>
    </div>
    <div class="row wrap"><div class="tabs" style="flex:1" data-chs></div><select class="input" style="width:auto" data-multi hidden>
      <option value="1">Birden fazla kanalda olanlar</option><option value="0">Tek kanalda olanlar</option><option value="">Tümü</option></select></div>
    <div data-box></div>
  </div>`);
  $('[data-multi]', el).value = f.multi;

  function head() {
    const c = data.counts || [];
    const sum = (k) => c.reduce((a, x) => a + (x[k] || 0), 0);
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Kanal ilanı</div><div class="value num">${n(sum('total'))}</div><div class="delta flat">${n(sum('created'))} ana katalogdan ürün</div></div>
      <div class="kpi"><div class="label">Otomatik eşleşen</div><div class="value num">${n(sum('auto'))}</div><div class="delta flat">barkod / stok kodu / ad + varyant</div></div>
      <div class="kpi"><div class="label">Elle eşleşen</div><div class="value num">${n(sum('manual'))}</div><div class="delta flat">sizin onayınızla</div></div>
      <div class="kpi"><div class="label">Onay bekleyen</div><div class="value num ${sum('pending') ? 'down' : ''}">${n(sum('pending'))}</div><div class="delta flat">${n(sum('ignored'))} yok sayıldı</div></div>`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.tab === k ? 'on' : ''}" data-act="tab" data-k="${k}">${t}${k === '' && sum('pending') ? html`<span class="n">${sum('pending')}</span>` : ''}</button>`)}`);
    const by = Object.fromEntries(c.map((x) => [x.channel, x]));
    render($('[data-chs]', el), html`<button class="tab ${!f.channel ? 'on' : ''}" data-act="ch" data-k="">Tüm kanallar</button>${activeChannels().filter((x) => by[x.id]).map((x) => html`<button class="tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-k="${x.id}">${chBadge(x.id)}${f.tab === '' && by[x.id].pending ? html`<span class="n">${by[x.id].pending}</span>` : ''}</button>`)}`);
    $('[data-multi]', el).hidden = f.tab !== 'linked';
  }

  const pendingCard = (l) => html`<div class="card stack" data-key="${l.channel}|${l.remote_id}">
    <div class="row" style="align-items:flex-start">${thumb(l.image, l.name)}
      <div style="flex:1;min-width:0"><div style="font-weight:650">${l.name || l.remote_id}${vtag(l.variant_name, l.name)}</div>${ids(l)}
        <div class="row small wrap" style="margin-top:4px;gap:12px">${chBadge(l.channel)}<span class="muted">${money(l.price)}</span><span class="muted">Stok ${l.remote_stock ?? '—'}</span></div></div></div>
    ${l.candidates.length ? html`<div><div class="muted tiny" style="font-weight:700;margin-bottom:6px">OLASI KARŞILIKLARI (diğer kanallardaki ürünler)</div>${l.candidates.map((c) => html`<div class="cand">
      <span class="score ${scoreCls(c.score)}" title="Benzerlik puanı">%${c.score}</span>${thumb(c.image, c.name, 'sm')}
      <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${c.name}</div>
        <div class="muted tiny ellipsis">${(c.channels || []).map((x) => `${ch(x.channel).short || ch(x.channel).name}: ${x.name}`).join(' · ') || 'kanalda ilanı yok'}</div>
        <div class="muted tiny ellipsis">${[c.sku, c.barcode, `stok ${c.stock}`].filter(Boolean).join(' · ')}${c.why.length ? ' — ' + c.why.join(', ') : ''}</div></div>
      <button class="btn sm primary" data-act="link" data-pid="${c.product_id}">Bağla</button></div>`)}</div>`
      : html`<div class="muted small">Diğer kanallarda benzer ürün bulunamadı. Ürün arayarak bağlayın veya yeni ürün olarak ekleyin.</div>`}
    <div class="row wrap"><button class="btn sm" data-act="find"><i class="ico ico-search"></i>Ürün ara</button><button class="btn sm" data-act="create"><i class="ico ico-plus"></i>Yeni ürün olarak ekle</button><span class="spacer"></span><button class="btn sm ghost" data-act="ignore">Yok say</button></div>
  </div>`;

  // Eşleşmiş ürün: panel ürünü + her kanaldaki bağlı ilanı
  const groupCard = (p) => html`<div class="card flush" data-pid="${p.id}">
    <div class="card-pad row" style="align-items:flex-start;border-bottom:1px solid var(--line)">${thumb(p.image, p.name)}
      <div style="flex:1;min-width:0"><a class="link" style="font-weight:700" href="#/urunler/${p.id}">${p.group_name && p.variant_name ? p.group_name : p.name}</a>${vtag(p.variant_name, p.group_name && p.variant_name ? p.group_name : p.name)}${ids(p)}</div>
      <span class="pill ${new Set(p.listings.map((l) => l.channel)).size > 1 ? 'good' : ''}">${new Set(p.listings.map((l) => l.channel)).size} kanal</span></div>
    ${p.listings.map((l) => html`<div class="link-row" data-key="${l.channel}|${l.remote_id}">
      <span class="ch-name" style="min-width:120px">${chLogo(l.channel, true)}<span class="ellipsis">${ch(l.channel).short || ch(l.channel).name}</span></span>
      ${thumb(l.image, l.name, 'sm')}
      <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${l.name}${vtag(l.variant_name, l.name)}</div><div class="muted tiny ellipsis">${[l.sku && `SKU ${l.sku}`, l.barcode && `Barkod ${l.barcode}`, money(l.price), `stok ${l.remote_stock ?? '—'}`].filter(Boolean).join(' · ')}</div></div>
      ${howPill(l.match)}
      <div class="row" style="gap:4px"><button class="btn sm ghost" data-act="find" title="Bu ilanı başka bir ürüne bağla">Taşı</button><button class="btn sm ghost danger" data-act="unlink" title="Bağlantıyı kaldır">Kaldır</button></div>
    </div>`)}
  </div>`;

  const ignoredRow = (l) => html`<div class="cand" data-key="${l.channel}|${l.remote_id}">${chBadge(l.channel)}${thumb(l.image, l.name, 'sm')}
    <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${l.name}</div>${ids(l)}</div><button class="btn sm" data-act="unignore">Geri al</button></div>`;

  function draw() {
    head();
    const box = $('[data-box]', el);
    if (f.tab === 'linked') {
      const P = data.products || [];
      if (!P.length) return render(box, html`<div class="card"><div class="empty">Bu filtrede eşleşmiş ürün yok</div></div>`);
      return render(box, html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,560px),1fr));gap:12px">${P.map(groupCard)}</div>
        <div class="pager"><span class="muted small" style="margin-right:auto">${n(data.total)} ürün</span>${P.length < data.total ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
    }
    const L = data.listings || [];
    if (!L.length) return render(box, html`<div class="card"><div class="empty">${f.tab === '' ? 'Onay bekleyen ilan yok 🎉' : 'Kayıt yok'}</div></div>`);
    if (f.tab === 'ignored') return render(box, html`<div class="card">${L.map(ignoredRow)}</div>`);
    render(box, html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:12px">${L.map(pendingCard)}</div>`);
  }

  async function load(append = false) {
    setQuery({ tab: f.tab, channel: f.channel, q: f.q, multi: f.tab === 'linked' && f.multi !== '1' ? f.multi || 'all' : '' });
    const p = new URLSearchParams();
    if (f.channel) p.set('channel', f.channel);
    if (f.q) p.set('q', f.q);
    if (f.tab === 'linked') {
      if (f.multi) p.set('multi', f.multi);
      p.set('page', f.page);
      const [r, c] = await Promise.all([api('match/groups?' + p), api('match?limit=1')]);
      data = { products: append ? (data.products || []).concat(r.products) : r.products, total: r.total, counts: c.counts };
    } else if (f.tab === 'ignored') {
      p.set('unlinked', '1');
      const [r, c] = await Promise.all([api('listings?' + p), api('match?limit=1')]);
      data = { listings: r.listings.filter((l) => l.ignored), counts: c.counts };
    } else data = await api('match?limit=100&' + p);
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const keyOf = (t) => { const [channel, ...r] = t.closest('[data-key]').dataset.key.split('|'); return { channel, remote_id: r.join('|') }; };
  const done = (t, msg) => { const card = t.closest('[data-key]'); if (card && f.tab !== 'linked') card.remove(); toast(msg); loadSummary().catch(() => {}); refresh(); };
  const link = (k, pid) => api('listings/link', { method: 'POST', body: { ...k, product_id: pid } });

  actions(el, {
    tab: (t) => { f.tab = t.dataset.k; refresh(); },
    ch: (t) => { f.channel = t.dataset.k; refresh(); },
    more: (t) => busy(t, async () => { f.page++; await load(true); }),
    link: (t) => busy(t, async () => { await link(keyOf(t), Number(t.dataset.pid)); done(t, 'Eşleştirildi'); }),
    create: (t) => busy(t, async () => { await api('listings/link', { method: 'POST', body: { ...keyOf(t), create: true } }); done(t, 'Yeni ürün oluşturuldu ve bağlandı'); }),
    ignore: (t) => busy(t, async () => { await api('match/ignore', { method: 'POST', body: keyOf(t) }); done(t, 'Yok sayıldı'); }),
    unignore: (t) => busy(t, async () => { await api('match/ignore', { method: 'POST', body: { ...keyOf(t), ignored: false } }); done(t, 'Bekleyenlere geri alındı'); }),
    unlink: (t) => busy(t, async () => { await api('match/unlink', { method: 'POST', body: keyOf(t) }); done(t, 'Eşleşme kaldırıldı; ilan tekrar otomatik olarak bu ürüne bağlanmaz'); }),
    repair: (t) => busy(t, async () => { const r = await api('match/repair', { method: 'POST' }); toast(`${r.freed} hatalı bağlantı ayrıldı · ${r.linked} ilan yeniden kesin eşleşti`); loadSummary().catch(() => {}); refresh(); }),
    auto: (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { force: true, listings: true } }); toast(r.skipped || `${(r.match && r.match.linked) || 0} ilan otomatik eşleşti, ${(r.match && r.match.created) || 0} yeni ürün`); loadSummary().catch(() => {}); refresh(); }),
    find: (t) => findProduct(keyOf(t), () => done(t, 'Eşleştirildi')),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  $('[data-multi]', el).addEventListener('change', (e) => { f.multi = e.target.value; refresh(); });
  await refresh();
  return { refresh };
}

// Ürün arayıp seçilen ürüne bağla. Aynı kanaldan zaten ilanı olan ürün seçilemez.
function findProduct(key, onDone) {
  const s = sheet({
    title: `${ch(key.channel).name} ilanını bağla`, size: 'narrow',
    body: html`<div class="stack"><div class="search" style="min-width:0"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-pq></div><div data-res class="stack" style="gap:6px"></div></div>`,
  });
  const res = $('[data-res]', s.el);
  const search = async (q) => {
    const r = await api('products?limit=15&filter=all&q=' + encodeURIComponent(q)).catch(() => ({ products: [] }));
    render(res, r.products.length ? html`${r.products.map((p) => {
      const mine = (p.listings || []).find((l) => l.channel === key.channel);
      const same = mine && mine.remote_id === key.remote_id;
      return html`<div class="cand">${thumb(p.image, p.name, 'sm')}<div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${p.name}${vtag(p.variant_name, p.name)}</div>
        <div class="muted tiny ellipsis">${[p.sku, p.barcode, `stok ${p.stock}`].filter(Boolean).join(' · ')}${(p.listings || []).length ? ' · ' + [...new Set(p.listings.map((l) => ch(l.channel).short || l.channel))].join(', ') : ''}</div></div>
        ${same ? html`<span class="pill good">Bağlı</span>` : mine ? html`<span class="pill" title="Bu ürüne bu kanaldan başka bir ilan bağlı">Kanalda dolu</span>` : html`<button class="btn sm primary" data-pick="${p.id}">Bağla</button>`}</div>`;
    })}` : html`<div class="muted small">Sonuç yok</div>`);
  };
  $('[data-pq]', s.el).addEventListener('input', debounce((e) => search(e.target.value.trim()), 250));
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) busy(b, async () => { await api('listings/link', { method: 'POST', body: { ...key, product_id: Number(b.dataset.pick) } }); s.close(); onDone(); });
  });
  search('');
  setTimeout(() => $('[data-pq]', s.el).focus(), 50);
}
