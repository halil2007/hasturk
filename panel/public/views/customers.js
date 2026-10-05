// Müşteriler: tüm kanallardaki müşteriler tek listede; müşteri analizi (tekrar sipariş oranı, ortalama sepet, kanal bazında
// müşteri sayısı, sipariş sayısı dağılımı, aylık yeni / tekrar eden müşteri, iller) ve müşteri ayrıntısı (tüm siparişleri).
import { api, html, render, $, money, money0, n, ch, chLogo, chBadge, chColor, statusPill, dateTime, date, actions, debounce, sheet, store, toast } from '../core.js';
import { setQuery } from '../app.js';
import { columnChart } from '../chart.js';
import { openOrder } from './orderops.js';
import { turkeyMap, cityTable } from './trmap.js';

const RANGES = [['all', 'Tümü'], ['365', 'Son 1 yıl'], ['90', 'Son 90 gün'], ['30', 'Son 30 gün']];
const SORTS = [['last', 'Son sipariş'], ['orders', 'Sipariş sayısı'], ['spend', 'Toplam harcama'], ['first', 'Yeni müşteri']];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export async function customersView(el, rest, query = {}) {
  const f = { range: 'all', sort: 'last', repeat: '', channel: '', q: '', page: 1, cityView: 'map', ...store.get('customers', {}), ...(query.channel ? { channel: query.channel } : {}) };
  let S = null, L = null;
  const params = () => {
    const p = new URLSearchParams();
    if (f.range !== 'all') p.set('from', String(Date.now() - Number(f.range) * 864e5));
    return p;
  };
  render(el, html`<div class="stack">
    <div class="row wrap" style="align-items:center"><b style="margin-right:6px">Dönem:</b><div class="chips" data-ranges></div></div>
    <div class="kpis" data-kpis></div>
    <div class="grid-2" style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))">
      <div class="card flush"><div class="card-head" style="padding:16px 16px 0"><h2>Kanallara göre müşteriler</h2></div><div data-chs></div></div>
      <div class="card"><div class="card-head"><h2>Kaç kez sipariş verdiler?</h2></div><div data-dist></div></div>
    </div>
    <div class="card"><div class="card-head" style="flex-wrap:wrap;gap:8px"><h2>İllere göre satış</h2><span class="spacer"></span><div class="seg" data-cview></div></div><div data-cities></div></div>
    <div class="card"><div class="card-head"><h2>Aylık yeni ve tekrar eden müşteri</h2></div><div data-months></div><div class="row small muted" style="gap:14px;margin-top:6px"><span><i class="dot" style="background:var(--primary)"></i> Yeni</span><span><i class="dot" style="background:var(--good)"></i> Tekrar eden</span></div></div>
    <div class="card flush">
      <div class="card-head" style="padding:16px 16px 0;flex-wrap:wrap;gap:8px"><h2>Müşteri listesi</h2><span class="spacer"></span>
        <div class="search" style="min-width:220px"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ad, telefon, e-posta, sipariş no" data-q value="${f.q}"></div>
        <select class="input" style="width:auto" data-ch></select>
        <select class="input" style="width:auto" data-sort>${SORTS.map(([k, t]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${t}</option>`)}</select>
        <label class="check small"><input type="checkbox" data-repeat ${f.repeat ? 'checked' : ''}> Yalnız tekrar edenler</label></div>
      <div data-list></div>
    </div>
  </div>`);

  function drawSummary() {
    render($('[data-ranges]', el), html`${RANGES.map(([k, t]) => html`<button class="chip ${f.range === k ? 'on' : ''}" data-act="range" data-k="${k}">${t}</button>`)}`);
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Toplam müşteri</div><div class="value num">${n(S.customers)}</div><div class="delta flat">${n(S.multi)} müşteri birden çok kanalda</div></div>
      <div class="kpi"><div class="label">Toplam sipariş</div><div class="value num">${n(S.orders)}</div><div class="delta flat">müşteri başına ${n(S.ordersPerCustomer)} sipariş</div></div>
      <div class="kpi"><div class="label">Tekrar sipariş oranı</div><div class="value num">%${n(S.repeatRate)}</div><div class="delta flat">${n(S.repeat)} müşteri 2+ sipariş · siparişlerin %${n(S.repeatOrderShare)}'i</div></div>
      <div class="kpi"><div class="label">Ortalama sepet</div><div class="value num">${money(S.avgBasket)}</div><div class="delta flat">müşteri başına ${money0(S.revenuePerCustomer)} · toplam ${money0(S.revenue)}</div></div>`);
    render($('[data-chs]', el), S.channels.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Müşteri</th><th class="r">Sipariş</th><th class="r">Tekrar eden</th><th class="r">Ort. sepet</th><th class="r">Ciro</th></tr></thead><tbody>
      ${S.channels.map((c) => html`<tr style="cursor:pointer" data-act="chpick" data-k="${c.channel}"><td>${chBadge(c.channel)}${c.guests ? html`<div class="tiny muted">${n(c.guests)} üyeliksiz</div>` : ''}</td><td class="r num"><b>${n(c.customers)}</b></td><td class="r num">${n(c.orders)}</td>
        <td class="r num">${n(c.repeat)} <span class="muted tiny">%${n(c.customers ? (c.repeat / c.customers) * 100 : 0)}</span></td><td class="r num">${money(c.avgBasket)}</td><td class="r num">${money0(c.revenue)}</td></tr>`)}
    </tbody></table></div>` : html`<div class="empty">Sipariş yok</div>`);
    const max = Math.max(1, ...S.dist.map((x) => x.n));
    render($('[data-dist]', el), html`<div class="stack" style="gap:8px">${S.dist.map((x) => html`<div class="row" style="gap:10px"><span style="width:84px" class="small">${x.k === '1' ? '1 sipariş' : `${x.k} sipariş`}</span>
      <div style="flex:1;background:var(--surface-3);border-radius:6px;height:18px;overflow:hidden"><div style="height:100%;width:${(x.n / max) * 100}%;background:${x.k === '1' ? 'var(--primary)' : 'var(--good)'};border-radius:6px"></div></div>
      <b class="num" style="width:70px;text-align:right">${n(x.n)}</b><span class="muted tiny" style="width:44px;text-align:right">%${n(S.customers ? (x.n / S.customers) * 100 : 0)}</span></div>`)}</div>`);
    const box = $('[data-months]', el);
    if (S.months.length) columnChart(box, { labels: S.months.map((m) => MONTHS[Number(m.m.slice(5)) - 1]), titles: S.months.map((m) => `${MONTHS[Number(m.m.slice(5)) - 1]} ${m.m.slice(0, 4)}`), series: [{ id: 'new', name: 'Yeni', color: 'var(--primary)', values: S.months.map((m) => m.new) }, { id: 'ret', name: 'Tekrar eden', color: 'var(--good)', values: S.months.map((m) => m.returning) }], format: (v) => n(v), height: 220 });
    else render(box, html`<div class="empty">Veri yok</div>`);
    drawCities();
    render($('[data-ch]', el), html`<option value="">Tüm kanallar</option>${S.channels.map((c) => html`<option value="${c.channel}" ${f.channel === c.channel ? 'selected' : ''}>${ch(c.channel).name}</option>`)}`);
  }
  // İller: önce Türkiye haritası (üzerine gelince adet / sipariş / ciro), Liste sekmesinde tablo
  function drawCities() {
    render($('[data-cview]', el), html`<button class="${f.cityView === 'map' ? 'on' : ''}" data-act="cview" data-k="map">Harita</button><button class="${f.cityView === 'list' ? 'on' : ''}" data-act="cview" data-k="list">Liste</button>`);
    const box = $('[data-cities]', el);
    if (f.cityView === 'list') return render(box, cityTable(S.cities));
    turkeyMap(box, S.cities).catch((e) => render(box, html`<div class="notice bad">${e.message}</div>`));
  }
  function drawList() {
    render($('[data-list]', el), L.customers.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Müşteri</th><th>Kanallar</th><th class="r">Sipariş</th><th class="r">Toplam</th><th class="r">Ort. sepet</th><th>İlk / son sipariş</th></tr></thead><tbody>
      ${L.customers.map((c) => html`<tr style="cursor:pointer" data-act="open" data-k="${c.ckey}"><td><div style="font-weight:650" class="ellipsis">${c.name || '—'}</div><div class="muted tiny ellipsis" style="max-width:260px">${[c.city, c.phone, c.email].filter(Boolean).join(' · ')}</div></td>
        <td><div class="row" style="gap:4px">${c.channels.map((x) => chLogo(x, true))}</div></td>
        <td class="r num"><b>${n(c.orders)}</b>${c.orders > 1 ? html` <span class="pill good" style="font-size:11px;padding:1px 6px">tekrar</span>` : ''}</td><td class="r num">${money(c.spend)}</td><td class="r num">${money(c.avg)}</td>
        <td class="small">${date(c.first_at)}${c.orders > 1 ? html` <span class="muted">→</span> ${date(c.last_at)}` : ''}</td></tr>`)}
    </tbody></table></div>
    <div class="pager"><span class="muted small" style="margin-right:auto">${n(L.total)} müşteri</span>${f.page > 1 ? html`<button class="btn sm" data-act="page" data-k="-1">Önceki</button>` : ''}${f.page * 50 < L.total ? html`<button class="btn sm" data-act="page" data-k="1">Sonraki</button>` : ''}</div>`
      : html`<div class="empty">Müşteri bulunamadı</div>`);
  }
  async function loadSummary() { S = await api('customers/summary?' + params()); drawSummary(); }
  async function loadList() {
    const p = params();
    for (const k of ['channel', 'q', 'sort', 'repeat']) if (f[k]) p.set(k, f[k]);
    p.set('page', f.page);
    L = await api('customers?' + p); drawList();
  }
  const save = () => { store.set('customers', { range: f.range, sort: f.sort, repeat: f.repeat, cityView: f.cityView }); setQuery({ channel: f.channel }); };

  async function openCustomer(key) {
    const s = sheet({ title: 'Müşteri', size: 'wide', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
    try {
      const d = await api('customers/detail?key=' + encodeURIComponent(key));
      const o0 = d.orders[0] || {}, a = o0.address || {};
      const live = d.orders.filter((o) => o.status !== 'cancelled'), spend = live.reduce((x, o) => x + (o.total || 0), 0);
      s.title.textContent = o0.customer || 'Müşteri';
      s.setBody(html`<div class="stack">
        <div class="kpis"><div class="kpi"><div class="label">Sipariş</div><div class="value num">${n(live.length)}</div></div><div class="kpi"><div class="label">Toplam harcama</div><div class="value num">${money(spend)}</div></div>
          <div class="kpi"><div class="label">Ortalama sepet</div><div class="value num">${money(live.length ? spend / live.length : 0)}</div></div><div class="kpi"><div class="label">İlk sipariş</div><div class="value" style="font-size:18px">${date(d.orders[d.orders.length - 1] && d.orders[d.orders.length - 1].ordered_at)}</div></div></div>
        <div class="small muted">${[o0.phone, o0.email, [a.district, a.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
        <div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th>Sipariş</th><th>Kanal</th><th>Tarih</th><th>Durum</th><th class="r">Tutar</th></tr></thead><tbody>
          ${d.orders.map((o, i) => html`<tr style="cursor:pointer" data-oid="${o.id}"><td><b>#${o.order_number}</b> <span class="muted tiny">${d.orders.length - i}. sipariş</span></td><td>${chBadge(o.channel)}</td><td class="small">${dateTime(o.ordered_at)}</td><td>${statusPill(o.status)}</td><td class="r num">${money(o.total)}</td></tr>`)}
        </tbody></table></div></div>
        ${d.items.length ? html`<div class="card flush"><div class="card-head" style="padding:16px 16px 0"><h3>Aldığı ürünler</h3></div><div class="table-wrap"><table class="t"><tbody>${d.items.map((x) => html`<tr><td>${x.name}</td><td class="r num">${n(x.qty)} adet</td><td class="r num">${money(x.total)}</td></tr>`)}</tbody></table></div></div>` : ''}
      </div>`);
      s.body.addEventListener('click', (e) => { const r = e.target.closest('[data-oid]'); if (r) { s.close(); openOrder(r.dataset.oid); } });
    } catch (e) { s.setBody(html`<div class="notice bad">${e.message}</div>`); }
  }

  actions(el, {
    range: (t) => { f.range = t.dataset.k; f.page = 1; save(); Promise.all([loadSummary(), loadList()]).catch((e) => toast(e.message, true)); },
    chpick: (t) => { f.channel = t.dataset.k; f.page = 1; save(); $('[data-ch]', el).value = f.channel; loadList().catch((e) => toast(e.message, true)); },
    page: (t) => { f.page += Number(t.dataset.k); loadList().catch((e) => toast(e.message, true)); },
    open: (t) => openCustomer(t.dataset.k),
    cview: (t) => { f.cityView = t.dataset.k; save(); drawCities(); },
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); f.page = 1; loadList().catch(() => {}); }, 300));
  $('[data-ch]', el).addEventListener('change', (e) => { f.channel = e.target.value; f.page = 1; save(); loadList().catch(() => {}); });
  $('[data-sort]', el).addEventListener('change', (e) => { f.sort = e.target.value; f.page = 1; save(); loadList().catch(() => {}); });
  $('[data-repeat]', el).addEventListener('change', (e) => { f.repeat = e.target.checked ? '1' : ''; f.page = 1; save(); loadList().catch(() => {}); });
  await Promise.all([loadSummary(), loadList()]);
  if (query.key) openCustomer(query.key);
}
