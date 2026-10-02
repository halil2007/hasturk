// Eşleştirme: kanal ilanlarını panel ürünlerine bağlar. Barkod/SKU ile kesin olanlar senkronda otomatik bağlanır;
// emin olunamayanlar burada benzerlik puanlı önerilerle listelenir ve elle bağlanır, yeni ürün açılır ya da yok sayılır.
import { api, html, render, $, n, money, chBadge, thumb, actions, busy, toast, debounce, sheet, activeChannels } from '../core.js';
import { setQuery, loadSummary } from '../app.js';

const TABS = [['', 'Bekleyen'], ['linked', 'Eşleşmiş'], ['ignored', 'Yok sayılan']];
const HOW = { barcode: ['good', 'Barkod'], sku: ['good', 'SKU'], new: ['info', 'Yeni ürün'], manual: ['amber', 'Elle'] };
const scoreCls = (s) => (s >= 70 ? 'hi' : s >= 45 ? 'mid' : 'lo');
const ids = (l) => html`<div class="muted tiny">${[l.sku && `SKU ${l.sku}`, l.barcode && `Barkod ${l.barcode}`].filter(Boolean).join(' · ') || 'SKU/barkod yok'}</div>`;

export async function matching(el, rest, query = {}) {
  const f = { tab: query.tab || '', channel: query.channel || '', q: query.q || '' };
  let data = { listings: [], counts: [] };
  render(el, html`<div class="stack">
    <div class="notice"><i class="ico ico-link"></i><div style="flex:1">Barkodu veya SKU'su tek bir ürünle birebir uyan ilanlar her senkronda <b>otomatik</b> eşleşir. Emin olunamayanlar burada önerilerle listelenir; kontrol edip bağlayın. Bir kanalda ayrı ürün olarak açılmış varyantlar da ayrı ilan olarak gelir ve ilgili varyanta bağlanır.</div></div>
    <div class="kpis" data-kpis></div>
    <div class="row wrap">
      <div class="tabs" data-tabs></div>
      <span class="spacer"></span>
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="İlan adı, SKU veya barkod" data-q value="${f.q}"></div>
      <button class="btn" data-act="auto"><i class="ico ico-sync"></i>Otomatik eşleştir</button>
    </div>
    <div class="tabs" data-chs></div>
    <div data-box></div>
  </div>`);

  function head() {
    const c = data.counts || [];
    const sum = (k) => c.reduce((a, x) => a + (x[k] || 0), 0);
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Toplam ilan</div><div class="value num">${n(sum('total'))}</div><div class="delta flat">tüm kanallar</div></div>
      <div class="kpi"><div class="label">Otomatik eşleşen</div><div class="value num">${n(sum('auto'))}</div><div class="delta flat">barkod / SKU / yeni</div></div>
      <div class="kpi"><div class="label">Elle eşleşen</div><div class="value num">${n(sum('manual'))}</div><div class="delta flat">sizin onayınızla</div></div>
      <div class="kpi"><div class="label">Bekleyen</div><div class="value num ${sum('pending') ? 'down' : ''}">${n(sum('pending'))}</div><div class="delta flat">${n(sum('ignored'))} yok sayıldı</div></div>`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.tab === k ? 'on' : ''}" data-act="tab" data-k="${k}">${t}${k === '' && sum('pending') ? html`<span class="n">${sum('pending')}</span>` : ''}</button>`)}`);
    const by = Object.fromEntries(c.map((x) => [x.channel, x]));
    render($('[data-chs]', el), html`<button class="tab ${!f.channel ? 'on' : ''}" data-act="ch" data-k="">Tüm kanallar</button>${activeChannels().filter((x) => by[x.id]).map((x) => html`<button class="tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-k="${x.id}">${chBadge(x.id)}${by[x.id].pending ? html`<span class="n">${by[x.id].pending}</span>` : ''}</button>`)}`);
  }

  const pendingCard = (l) => html`<div class="card stack" data-key="${l.channel}|${l.remote_id}">
    <div class="row" style="align-items:flex-start">${thumb(l.image, l.name)}
      <div style="flex:1;min-width:0"><div style="font-weight:650">${l.name || l.remote_id}${l.variant_name ? html`<span class="var-tag">${l.variant_name}</span>` : ''}</div>${ids(l)}
        <div class="row small" style="margin-top:4px;gap:12px">${chBadge(l.channel)}<span class="muted">${money(l.price)}</span><span class="muted">Stok ${l.remote_stock ?? '—'}</span></div></div></div>
    ${l.candidates.length ? html`<div><div class="muted tiny" style="font-weight:700;margin-bottom:6px">ÖNERİLEN ÜRÜNLER</div>${l.candidates.map((c) => html`<div class="cand">
      <span class="score ${scoreCls(c.score)}" title="Benzerlik puanı">%${c.score}</span>${thumb(c.image, c.name, 'sm')}
      <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${c.name}</div><div class="muted tiny ellipsis">${[c.sku, c.barcode, `stok ${c.stock}`].filter(Boolean).join(' · ')}${c.why.length ? ' — ' + c.why.join(', ') : ''}</div></div>
      <button class="btn sm primary" data-act="link" data-pid="${c.product_id}">Bağla</button></div>`)}</div>`
      : html`<div class="muted small">Benzer ürün bulunamadı. Ürün arayarak bağlayın veya yeni ürün olarak ekleyin.</div>`}
    <div class="row wrap"><button class="btn sm" data-act="find"><i class="ico ico-search"></i>Ürün ara</button><button class="btn sm" data-act="create"><i class="ico ico-plus"></i>Yeni ürün olarak ekle</button><span class="spacer"></span><button class="btn sm ghost" data-act="ignore">Yok say</button></div>
  </div>`;

  const linkedRow = (l) => html`<tr data-key="${l.channel}|${l.remote_id}">
    <td>${chBadge(l.channel)}</td>
    <td><div class="row">${thumb(l.image, l.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:280px;font-weight:600">${l.name}${l.variant_name ? html`<span class="var-tag">${l.variant_name}</span>` : ''}</div>${ids(l)}</div></div></td>
    <td><i class="ico ico-link muted"></i></td>
    <td><div class="row">${thumb(l.product_image, l.product_name, 'sm')}<div style="min-width:0"><a class="ellipsis link" style="max-width:280px;display:block;font-weight:600" href="#/urunler/${l.product_id}">${l.product_name}</a><div class="muted tiny">${l.product_sku || ''}</div></div></div></td>
    <td><span class="pill ${(HOW[l.match] || ['', ''])[0]}">${(HOW[l.match] || ['', l.match || '—'])[1]}</span></td>
    <td class="r"><button class="btn sm ghost" data-act="unlink">Bağlantıyı kaldır</button></td></tr>`;

  const ignoredRow = (l) => html`<div class="cand" data-key="${l.channel}|${l.remote_id}">${chBadge(l.channel)}${thumb(l.image, l.name, 'sm')}
    <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${l.name}</div>${ids(l)}</div><button class="btn sm" data-act="unignore">Geri al</button></div>`;

  function draw() {
    head();
    const L = data.listings;
    const box = $('[data-box]', el);
    if (!L.length) return render(box, html`<div class="card"><div class="empty">${f.tab === '' ? 'Eşleşme bekleyen ilan yok 🎉' : 'Kayıt yok'}</div></div>`);
    if (f.tab === 'linked') return render(box, html`<div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th>Kanal ilanı</th><th></th><th>Panel ürünü</th><th>Yöntem</th><th></th></tr></thead><tbody>${L.map(linkedRow)}</tbody></table></div></div>`);
    if (f.tab === 'ignored') return render(box, html`<div class="card">${L.map(ignoredRow)}</div>`);
    render(box, html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:12px">${L.map(pendingCard)}</div>`);
  }

  async function load() {
    setQuery({ tab: f.tab, channel: f.channel, q: f.q });
    const p = new URLSearchParams();
    if (f.channel) p.set('channel', f.channel);
    if (f.q) p.set('q', f.q);
    if (f.tab === 'linked') {
      const [r, c] = await Promise.all([api('match/linked?' + p), api('match?limit=1')]);
      data = { listings: r.listings, counts: c.counts };
    } else if (f.tab === 'ignored') {
      p.set('unlinked', '1');
      const [r, c] = await Promise.all([api('listings?' + p), api('match?limit=1')]);
      data = { listings: r.listings.filter((l) => l.ignored), counts: c.counts };
    } else data = await api('match?limit=100&' + p);
    draw();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  const keyOf = (t) => { const [channel, ...r] = t.closest('[data-key]').dataset.key.split('|'); return { channel, remote_id: r.join('|') }; };
  const done = (t, msg) => { const card = t.closest('[data-key]'); if (card) card.remove(); toast(msg); loadSummary().catch(() => {}); refresh(); };
  const link = (k, pid) => api('listings/link', { method: 'POST', body: { ...k, product_id: pid } });

  actions(el, {
    tab: (t) => { f.tab = t.dataset.k; refresh(); },
    ch: (t) => { f.channel = t.dataset.k; refresh(); },
    link: (t) => busy(t, async () => { await link(keyOf(t), Number(t.dataset.pid)); done(t, 'Eşleştirildi'); }),
    create: (t) => busy(t, async () => { await api('listings/link', { method: 'POST', body: { ...keyOf(t), create: true } }); done(t, 'Yeni ürün oluşturuldu ve bağlandı'); }),
    ignore: (t) => busy(t, async () => { await api('match/ignore', { method: 'POST', body: keyOf(t) }); done(t, 'Yok sayıldı'); }),
    unignore: (t) => busy(t, async () => { await api('match/ignore', { method: 'POST', body: { ...keyOf(t), ignored: false } }); done(t, 'Bekleyenlere geri alındı'); }),
    unlink: (t) => busy(t, async () => { await api('match/unlink', { method: 'POST', body: keyOf(t) }); done(t, 'Bağlantı kaldırıldı'); }),
    auto: (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { force: true, listings: true } }); toast(r.skipped || `${(r.match && r.match.linked) || 0} ilan otomatik eşleşti`); loadSummary().catch(() => {}); refresh(); }),
    find: (t) => findProduct(keyOf(t), () => done(t, 'Eşleştirildi')),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  return { refresh };
}

// Ürün arayıp seçilen ürüne bağla
function findProduct(key, onDone) {
  const s = sheet({
    title: 'Ürün ara ve bağla', size: 'narrow',
    body: html`<div class="stack"><div class="search" style="min-width:0"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-pq></div><div data-res class="stack" style="gap:6px"></div></div>`,
  });
  const res = $('[data-res]', s.el);
  const search = async (q) => {
    const r = await api('products?limit=12&q=' + encodeURIComponent(q)).catch(() => ({ products: [] }));
    render(res, r.products.length ? html`${r.products.map((p) => html`<div class="cand">${thumb(p.image, p.name, 'sm')}<div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${p.name}${p.variant_name && !String(p.name).includes(p.variant_name) ? html`<span class="var-tag">${p.variant_name}</span>` : ''}</div><div class="muted tiny">${[p.sku, p.barcode, `stok ${p.stock}`].filter(Boolean).join(' · ')}</div></div><button class="btn sm primary" data-pick="${p.id}">Bağla</button></div>`)}`
      : html`<div class="muted small">Sonuç yok</div>`);
  };
  $('[data-pq]', s.el).addEventListener('input', debounce((e) => search(e.target.value.trim()), 250));
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) busy(b, async () => { await api('listings/link', { method: 'POST', body: { ...key, product_id: Number(b.dataset.pick) } }); s.close(); onDone(); });
  });
  search('');
  setTimeout(() => $('[data-pq]', s.el).focus(), 50);
}
