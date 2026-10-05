// Siparişler: kanal sekmeleri, arama / tarih / kargo filtresi, durum sekmeleri, toplu işlem, satır içi sipariş işlemleri, sayfalama.
import { api, state, html, render, $, $$, money, ch, chLogo, chBadge, statusPill, thumb, actions, busy, toast, debounce, popMenu, shortDT, isMobile, rangeLabel, activeChannels, lateBadge, extNote } from '../core.js';
import { mountOps, openOrder, bulkLabels } from './orderops.js';
import { loadSummary, setQuery } from '../app.js';

const STATUS_TABS = [['all', 'Tümü'], ['new', 'Yeni'], ['processing', 'Hazırlanıyor'], ['late', 'Geciken'], ['shipped', 'Kargoda'], ['delivered', 'Teslim edildi'], ['cancelled', 'İptal'], ['returned', 'İade']];

export async function orders(el, rest, query = {}) {
  const f = { channel: query.channel || '', status: query.status || 'all', q: query.q || '', from: query.from || '', to: query.to || '', cargo: query.cargo || '', page: 1, limit: 25 };
  if (rest[0] === 'kanal') f.channel = rest[1] || '';
  if (rest[0] === 'durum') f.status = rest[1] || 'all';
  if (rest[0] && !['kanal', 'durum'].includes(rest[0])) setTimeout(() => openOrder(rest[0], refresh), 0);
  const sel = new Set();
  let data = { orders: [], counts: {}, total: 0 }, expanded = null, mobile = isMobile();

  render(el, html`<div class="stack">
    <div class="row wrap" style="justify-content:flex-end;margin-top:-4px">
      <span class="muted small" style="margin-right:auto" data-sub></span>
      <button class="btn sm" data-act="reload"><i class="ico ico-sync"></i>Yenile</button>
      <button class="btn sm" data-act="export"><i class="ico ico-download"></i>Dışa aktar <i class="ico ico-down"></i></button>
    </div>
    <div class="ch-tabs" data-chtabs></div>
    <div class="row wrap">
      <div class="search" style="min-width:220px"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Sipariş no, müşteri veya SKU ara" data-q value="${f.q}"></div>
      <button class="btn m-only" data-act="filters"><i class="ico ico-filter"></i>Filtreler${f.from || f.to || f.cargo ? ' •' : ''}</button>
      <div class="filters-more row wrap" style="display:contents"><label class="date-pick"><i class="ico ico-cal"></i><input type="date" data-from aria-label="Başlangıç" value="${f.from}"><span class="muted">–</span><input type="date" data-to aria-label="Bitiş" value="${f.to}"></label>
      <label class="date-pick" style="min-width:180px"><i class="ico ico-truck"></i><select data-cargo style="border:0;background:transparent;outline:none;font-weight:600;flex:1;min-height:36px"><option value="">Kargo firması</option>${((state.settings && state.settings.cargo_companies) || []).map((c) => html`<option ${f.cargo === c ? 'selected' : ''}>${c}</option>`)}</select></label>
      <button class="btn" data-act="clear"><i class="ico ico-x"></i>Filtreyi temizle</button></div>
    </div>
    <div class="tabs" data-stabs></div>
    <div class="card flush" data-box></div>
  </div>`);

  function chTabs() {
    render($('[data-chtabs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>
      ${activeChannels().filter((c) => c.enabled || c.demo).map((c) => { const p = (data.pendingByChannel || {})[c.id]; return html`<button class="ch-tab ${f.channel === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}" title="${p ? `${p} sipariş bekliyor` : ''}">${chLogo(c.id)}<span>${c.type === 'ikas' ? html`<b>ikas</b> <span class="small">${c.name}</span>` : c.name}</span>${p ? html`<span class="badge-n">${p}</span>` : ''}</button>`; })}`);
  }
  function statusTabs() {
    const c = data.counts, total = Object.entries(c).filter(([k]) => k !== 'late').reduce((a, [, x]) => a + x, 0);
    const cnt = (k) => (k === 'all' ? total : c[k] || 0);
    render($('[data-stabs]', el), html`${STATUS_TABS.map(([k, t]) => html`<button class="tab ${f.status === k ? 'on' : ''} ${k === 'late' && cnt(k) ? 'warn-tab' : ''}" data-act="st" data-k="${k}">${k === 'late' && cnt(k) ? html`<b class="late-dot">!</b>` : ''}${t}<span class="n">${cnt(k)}</span></button>`)}`);
  }

  function actionBtn(o) {
    if (o.status === 'new') return html`<button class="btn sm outline" data-act="accept" data-id="${o.id}"><i class="ico ico-play"></i>İşleme al</button><button class="btn sm ghost" data-act="toggle" data-id="${o.id}" aria-label="Yönet"><i class="ico ico-${expanded === o.id ? 'up' : 'down'}"></i></button>`;
    if (o.status === 'processing') return html`<button class="btn sm outline" data-act="toggle" data-id="${o.id}">Yönet<i class="ico ico-${expanded === o.id ? 'up' : 'down'}"></i></button>`;
    if (o.status === 'shipped') return html`<button class="btn sm outline" data-act="track" data-id="${o.id}"><i class="ico ico-truck"></i>Takip et</button>`;
    return html`<button class="btn sm outline" data-act="open" data-id="${o.id}"><i class="ico ico-orders"></i>Detay</button>`;
  }
  const products = (o) => html`<div class="row" style="min-width:180px">${thumb(o.items[0] && o.items[0].image, o.items[0] && o.items[0].name, 'sm')}
    <div style="min-width:0"><div class="ellipsis" style="max-width:200px;font-weight:600">${o.items[0] ? o.items[0].name : '—'}</div>
    <div class="muted tiny">${o.lines > 1 ? `+ ${o.lines - 1} ürün daha · ` : ''}${o.qty || 0} adet${o.unmatched ? ' · ' : ''}${o.unmatched ? html`<span style="color:var(--amber)">eşleşmemiş</span>` : ''}</div></div></div>`;
  // Durum + uyarılar: gecikme, kanalda yapılan işlem, etiket yazdırma durumu (paket başına)
  const stateCell = (o) => {
    const ext = extNote(o), pk = Math.max(o.packages, 1);
    const lbl = o.printed ? html`<span class="pill good" title="Kargo etiketi yazdırıldı">${o.printed >= pk ? '✓ Etiket yazdırıldı' : `✓ ${o.printed}/${pk} etiket yazdırıldı`}</span>`
      : o.labeled && ['new', 'processing'].includes(o.status) ? html`<span class="pill info">Etiket hazır</span>` : '';
    return html`<div class="row wrap" style="gap:4px">${statusPill(o.status)}${lateBadge(o)}${lbl}${o.pkg_errors ? html`<span class="pill bad" title="Kanal paket/etiket hatası">Kargo hatası</span>` : ''}${ext ? html`<span class="ext" title="${ext.detail} · ${shortDT(ext.at)}">${ext.text}</span>` : ''}</div>`;
  };
  const pkgCell = (o) => html`<span class="row small" style="white-space:nowrap"><i class="ico ico-truck muted"></i>${Math.max(1, o.packages)} paket${o.cargo ? html` • ${o.cargo}` : ''}</span>`;

  function table() {
    const allSel = data.orders.length && data.orders.every((o) => sel.has(o.id));
    const from = (data.page - 1) * data.limit;
    const rows = data.orders.map((o) => {
      const on = sel.has(o.id) || expanded === o.id;
      return html`<tr class="click ${on ? 'sel-row' : ''}" data-row="${o.id}">
        <td style="width:40px"><input type="checkbox" class="cb" data-sel="${o.id}" ${sel.has(o.id) ? 'checked' : ''} aria-label="Seç"></td>
        <td><div style="font-weight:750">#${o.order_number}</div><div class="muted tiny">${shortDT(o.ordered_at)}</div><div class="tiny only-narrow ellipsis" style="max-width:150px">${o.customer || ''}${o.city ? ` · ${o.city}` : ''}</div></td>
        <td class="col-cust"><div class="cust"><i class="ico ico-user"></i><div style="min-width:0"><div class="ellipsis" style="max-width:130px;font-weight:600">${o.customer || '—'}</div>${o.cust_nth > 1 ? html`<span class="pill info" style="font-size:11px;padding:1px 7px" title="Bu müşterinin ${o.cust_nth}. siparişi">${o.cust_nth}. sipariş</span>` : ''}<div class="muted tiny ellipsis">${[o.district, o.city].filter(Boolean).join(', ')}</div></div></div></td>
        <td>${chBadge(o.channel)}</td>
        <td>${products(o)}</td>
        <td class="r num" style="font-weight:750">${money(o.total)}${o.profit != null ? html`<div class="tiny ${o.profit >= 0 ? 'up' : 'down'}" title="Tahmini kâr${o.missing_cost ? ' (alış fiyatı eksik)' : ''}">${money(o.profit)}${o.missing_cost ? '*' : ''}</div>` : ''}</td>
        <td class="col-pkg">${pkgCell(o)}</td>
        <td style="min-width:140px;max-width:200px">${stateCell(o)}</td>
        <td class="r"><div class="row" style="justify-content:flex-end">${actionBtn(o)}</div></td>
      </tr>${expanded === o.id ? html`<tr><td colspan="9" style="padding:0"><div class="expand" data-ops="${o.id}"></div></td></tr>` : ''}`;
    });
    return html`<div class="table-wrap"><table class="t">
      <thead><tr><th><input type="checkbox" class="cb" data-selall ${allSel ? 'checked' : ''} aria-label="Tümünü seç"></th><th>Sipariş / Tarih</th><th class="col-cust">Müşteri</th><th>Kanal</th><th>Ürünler</th><th class="r">Tutar</th><th class="col-pkg">Paket / Kargo</th><th>Durum</th><th class="r">İşlemler</th></tr></thead>
      <tbody>${rows.length ? rows : html`<tr><td colspan="9" class="empty">Bu filtrede sipariş yok</td></tr>`}</tbody></table></div>
      ${pager(from)}`;
  }
  function cards() {
    const from = (data.page - 1) * data.limit;
    return html`<div style="padding:12px" class="m-list">${data.orders.length ? data.orders.map((o) => html`<div class="m-card ${sel.has(o.id) || expanded === o.id ? 'sel-row' : ''}" data-row="${o.id}">
        <div class="top"><input type="checkbox" class="cb" data-sel="${o.id}" ${sel.has(o.id) ? 'checked' : ''} aria-label="Seç">${chLogo(o.channel, true)}<b>#${o.order_number}</b><span class="muted tiny">${shortDT(o.ordered_at)}</span><span class="spacer"></span><b class="num">${money(o.total)}</b></div>
        <div class="row small"><i class="ico ico-user muted"></i><span class="ellipsis">${o.customer || '—'}${o.city ? ` · ${o.city}` : ''}</span>${o.cust_nth > 1 ? html`<span class="pill info" style="font-size:11px;padding:1px 7px">${o.cust_nth}. sipariş</span>` : ''}</div>
        ${products(o)}
        ${stateCell(o)}
        <div class="row wrap">${pkgCell(o)}<span class="spacer"></span>${actionBtn(o)}</div>
        ${expanded === o.id ? html`<div class="expand" style="margin:4px -14px -14px;border-radius:0 0 14px 14px;border-bottom:0" data-ops="${o.id}"></div>` : ''}
      </div>`) : html`<div class="empty">Bu filtrede sipariş yok</div>`}</div>${pager(from)}`;
  }
  function pager(from) {
    const pages = Math.max(1, Math.ceil(data.total / data.limit)), p = data.page;
    const list = [...new Set([1, p - 1, p, p + 1, pages].filter((x) => x >= 1 && x <= pages))].sort((a, b) => a - b);
    return html`<div class="pager"><span class="muted small" style="margin-right:auto">${data.total} siparişten ${data.total ? `${from + 1}–${from + data.orders.length}` : '0'} gösteriliyor</span>
      <span class="muted small">Sayfa başına</span><select class="input" style="width:auto;min-height:34px" data-limit>${[10, 25, 50, 100].map((x) => html`<option ${x === f.limit ? 'selected' : ''}>${x}</option>`)}</select>
      ${list.map((x, i) => html`${i && x - list[i - 1] > 1 ? html`<span class="muted">…</span>` : ''}<button class="pg ${x === p ? 'on' : ''}" data-act="page" data-p="${x}">${x}</button>`)}
      <button class="pg" data-act="page" data-p="${Math.min(pages, p + 1)}" aria-label="Sonraki"><i class="ico ico-chev"></i></button></div>`;
  }
  function bulkbar() {
    return sel.size ? html`<div class="bulk"><input type="checkbox" class="cb" checked data-clear aria-label="Seçimi kaldır"><b>${sel.size} sipariş seçildi</b>
      <button class="btn sm outline" data-act="bulk-accept"><i class="ico ico-play"></i>İşleme al</button>
      <button class="btn sm outline" data-act="bulk-label"><i class="ico ico-tag"></i>Toplu etiket oluştur</button>
      <button class="btn sm outline" data-act="bulk-print"><i class="ico ico-print"></i>Yazdır</button>
      <button class="icon-btn" data-act="clearsel" aria-label="Seçimi temizle"><i class="ico ico-x"></i></button></div>` : '';
  }
  function draw() {
    mobile = isMobile();
    render($('[data-box]', el), html`${bulkbar()}${mobile ? cards() : table()}`);
    const box = expanded && $(`[data-ops="${CSS.escape(expanded)}"]`, el);
    if (box) mountOps(box, expanded, { mode: 'expand', onChange: () => { load(); loadSummary().catch(() => {}); } });
    $('[data-sub]', el).textContent = `${data.total} sipariş${f.from || f.to ? ` · ${rangeLabel(f.from || f.to, f.to || f.from)}` : ''}${f.channel ? ` · ${ch(f.channel).name}` : ` · ${activeChannels().filter((c) => c.enabled || c.demo).length} satış kanalı`}`;
  }
  const params = () => { const p = new URLSearchParams({ status: f.status, page: f.page, limit: f.limit }); for (const k of ['channel', 'q', 'from', 'to', 'cargo']) if (f[k]) p.set(k, f[k]); return p; };
  async function load() {
    // Üzerinde çalışılan (açık) sipariş, durumu değişip filtre dışına çıksa da yerinde kalır
    const i = expanded ? data.orders.findIndex((o) => o.id === expanded) : -1;
    const keep = i >= 0 ? data.orders[i] : null;
    setQuery({ status: f.status, channel: f.channel, q: f.q, from: f.from, to: f.to, cargo: f.cargo });
    data = await api('orders?' + params());
    if (keep) {
      const fresh = data.orders.find((o) => o.id === keep.id);
      if (!fresh) {
        const r = await api('orders/' + encodeURIComponent(keep.id)).catch(() => null);
        if (r) keep.status = r.order.status;
        data.orders.splice(Math.min(i, data.orders.length), 0, keep);
      }
    }
    chTabs(); statusTabs(); draw();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));

  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; f.page = 1; sel.clear(); refresh(); },
    st: (t) => { f.status = t.dataset.k; f.page = 1; sel.clear(); refresh(); },
    page: (t) => { f.page = Number(t.dataset.p); refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    toggle: (t) => { expanded = expanded === t.dataset.id ? null : t.dataset.id; draw(); },
    open: (t) => openOrder(t.dataset.id, refresh),
    track: (t) => { expanded = expanded === t.dataset.id ? null : t.dataset.id; draw(); },
    // İşleme alınan sipariş, filtre "Yeni" olsa da listede kalır ve işlemleri açılır (paket / etiket / kargo için)
    accept: (t) => busy(t, async () => {
      const id = t.dataset.id;
      const r = await api(`orders/${encodeURIComponent(id)}/accept`, { method: 'POST', body: {} });
      toast(r.message);
      const o = data.orders.find((x) => x.id === id);
      if (o) { data.counts.new = Math.max(0, (data.counts.new || 0) - 1); data.counts.processing = (data.counts.processing || 0) + 1; o.status = 'processing'; }
      expanded = id; statusTabs(); draw(); loadSummary().catch(() => {});
    }),
    reload: (t) => busy(t, load),
    filters: () => el.classList.toggle('show-filters'),
    export: (t) => popMenu(t, [
      { icon: 'download', label: 'Bu filtreyi Excel (CSV) olarak indir', run: () => { location.href = '/api/orders.csv?' + params(); } },
      { icon: 'download', label: 'Seçilenleri yazdır (etiket)', run: () => sel.size ? bulkLabels([...sel], { fetch: false }) : toast('Önce sipariş seçin') },
    ]),
    clear: () => { Object.assign(f, { q: '', from: '', to: '', cargo: '', page: 1 }); $('[data-q]', el).value = ''; $('[data-from]', el).value = ''; $('[data-to]', el).value = ''; $('[data-cargo]', el).value = ''; refresh(); },
    clearsel: () => { sel.clear(); draw(); },
    'bulk-accept': (t) => busy(t, async () => {
      const r = await api('orders-bulk', { method: 'POST', body: { ids: [...sel], action: 'accept' } });
      toast(`${r.done.length} sipariş işleme alındı${r.errors.length ? `, ${r.errors.length} atlandı` : ''}`, !!r.errors.length && !r.done.length);
      sel.clear(); await load(); loadSummary().catch(() => {});
    }),
    'bulk-label': (t) => busy(t, async () => { await bulkLabels([...sel], { fetch: true, done: load }); await load(); }),
    'bulk-print': (t) => busy(t, async () => { await bulkLabels([...sel], { fetch: false }); }),
  });
  // Satıra tıklayınca işlemleri aç/kapat (kutucuk ve düğmeler hariç)
  el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-row]');
    if (!r || e.target.closest('button, input, a, select, [data-ops]')) return;
    expanded = expanded === r.dataset.row ? null : r.dataset.row;
    draw();
  });
  el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); draw(); }
    if (e.target.matches('[data-selall]')) { data.orders.forEach((o) => (e.target.checked ? sel.add(o.id) : sel.delete(o.id))); draw(); }
    if (e.target.matches('[data-clear]')) { sel.clear(); draw(); }
    if (e.target.matches('[data-limit]')) { f.limit = Number(e.target.value); f.page = 1; refresh(); }
    if (e.target.matches('[data-from], [data-to]')) { f.from = $('[data-from]', el).value; f.to = $('[data-to]', el).value; f.page = 1; refresh(); }
    if (e.target.matches('[data-cargo]')) { f.cargo = e.target.value; f.page = 1; refresh(); }
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); f.page = 1; refresh(); }, 300));
  const onResize = debounce(() => { if (isMobile() !== mobile) draw(); }, 150);
  window.addEventListener('resize', onResize);
  await refresh();
  return { refresh, destroy: () => window.removeEventListener('resize', onResize) };
}
export { openOrder };
