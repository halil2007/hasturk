// İstatistik: dönem seçimi, gün/hafta/ay gruplama, önceki dönem / geçen yıl karşılaştırma,
// kanal bazında ve toplam ciro / sipariş / tahmini kâr, en çok satan ürünler.
import { api, state, html, render, $, chLogo, money, money0, compact, n, pct, delta, ch, chColor, dayKey, store, toast , activeChannels } from '../core.js';
import { columnChart, legend } from '../chart.js';

const D = 864e5;
const PRESETS = [
  ['today', 'Bugün'], ['yesterday', 'Dün'], ['7', 'Son 7 gün'], ['30', 'Son 30 gün'], ['90', 'Son 90 gün'],
  ['month', 'Bu ay'], ['lastmonth', 'Geçen ay'], ['year', 'Bu yıl'], ['custom', 'Özel'],
];
function range(p, custom) {
  const t = dayKey();
  const [y, m] = t.split('-').map(Number);
  const back = (k) => dayKey(Date.now() - k * D);
  switch (p) {
    case 'today': return [t, t, 'day'];
    case 'yesterday': return [back(1), back(1), 'day'];
    case '7': return [back(6), t, 'day'];
    case '90': return [back(89), t, 'week'];
    case 'month': return [`${t.slice(0, 7)}-01`, t, 'day'];
    case 'lastmonth': { const d = new Date(Date.UTC(y, m - 2, 1)), e = new Date(Date.UTC(y, m - 1, 0)); return [d.toISOString().slice(0, 10), e.toISOString().slice(0, 10), 'day']; }
    case 'year': return [`${y}-01-01`, t, 'month'];
    case 'custom': return [custom.from || back(29), custom.to || t, null];
    default: return [back(29), t, 'day'];
  }
}
const label = (k, g) => (g === 'month' ? new Date(k + '-15T12:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }) : `${k.slice(8, 10)}.${k.slice(5, 7)}`);
const title = (k, g) => (g === 'month' ? new Date(k + '-15T12:00:00Z').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  : g === 'week' ? `${new Date(k + 'T12:00:00Z').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} haftası`
    : new Date(k + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

export async function statsView(el) {
  const f = store.get('stats', { preset: '30', group: 'day', compare: 'prev', metric: 'revenue', custom: {} });
  const hidden = new Set();
  let chart = null, data = null, showTable = false;

  render(el, html`<div class="stack">
    <div class="chips" data-presets></div>
    <div class="row wrap" data-custom></div>
    <div class="row wrap">
      <div class="seg" data-group><button data-v="day">Gün</button><button data-v="week">Hafta</button><button data-v="month">Ay</button></div>
      <select class="input" style="width:auto" data-compare aria-label="Karşılaştırma"><option value="prev">Önceki dönemle karşılaştır</option><option value="year">Geçen yılla karşılaştır</option><option value="none">Karşılaştırma yok</option></select>
    </div>
    <div data-body></div>
  </div>`);

  function controls() {
    render($('[data-presets]', el), html`${PRESETS.map(([k, t]) => html`<button class="chip ${f.preset === k ? 'on' : ''}" data-p="${k}">${t}</button>`)}`);
    const [from, to] = range(f.preset, f.custom);
    render($('[data-custom]', el), f.preset === 'custom' ? html`<label class="field"><span>Başlangıç</span><input class="input" type="date" data-from value="${from}"></label><label class="field"><span>Bitiş</span><input class="input" type="date" data-to value="${to}"></label>` : '');
    [...$('[data-group]', el).children].forEach((b) => b.classList.toggle('on', b.dataset.v === f.group));
    $('[data-compare]', el).value = f.compare;
  }

  async function load() {
    const [from, to, g] = range(f.preset, f.custom);
    if (g && f.preset !== 'custom' && !f.groupTouched) f.group = g;
    store.set('stats', { ...f, groupTouched: false });
    controls();
    const body = $('[data-body]', el);
    body.style.opacity = data ? '.55' : '1';
    try {
      data = await api(`stats?from=${from}&to=${to}&group=${f.group}&compare=${f.compare}`);
      if (data.error) throw new Error(data.error);
      draw();
    } catch (e) { toast(e.message, true); } finally { body.style.opacity = '1'; }
  }

  function draw() {
    const cur = data.current, cmp = data.compare, ids = activeChannels().map((c) => c.id);
    const k = (lab, key, fmt, invert) => {
      const d = cmp ? delta(cur.total[key], cmp.total[key]) : null;
      const cls = d == null || d === 0 ? 'flat' : (d > 0) !== !!invert ? 'up' : 'down';
      return html`<div class="kpi"><div class="label">${lab}</div><div class="value num">${fmt(cur.total[key])}</div>${cmp ? html`<div class="delta ${cls}">${pct(d)} <span class="muted">önceki ${fmt(cmp.total[key])}</span></div>` : ''}</div>`;
    };
    const metricName = { revenue: 'Ciro', orders: 'Sipariş adedi', profit: 'Tahmini kâr' }[f.metric];
    render($('[data-body]', el), html`
      <div class="kpis five">
        ${k('Ciro', 'revenue', money0)}${k('Sipariş', 'orders', (v) => n(v))}${k('Sepet ortalaması', 'basket', money)}${k('Tahmini kâr', 'profit', money0)}${k('İptal + iade', 'lost', (v) => n(v), true)}
      </div>
      ${cur.missingCost ? html`<div class="notice warn small" style="margin-top:10px"><i class="ico ico-warn"></i><div>${cur.missingCost} satış satırında ürünün alış fiyatı yok; kâr bu satırlarda maliyetsiz hesaplandı. <a href="#/urunler">Ürünler</a> → “Alış fiyatı eksik”.</div></div>` : ''}
      <div class="card" style="margin-top:14px">
        <div class="card-head"><h2>${metricName}</h2>
          <div class="seg" data-metric><button data-v="revenue">Ciro</button><button data-v="orders">Adet</button><button data-v="profit">Kâr</button></div>
          <button class="btn sm ghost" data-table>${showTable ? 'Grafik' : 'Tablo'}</button></div>
        <div data-legend></div><div data-chart></div>
      </div>
      <div class="section-title"><h2>Kanallar</h2></div>
      <div class="card flush table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Ciro</th><th class="r">Pay</th><th class="r">Sipariş</th><th class="r">Sepet ort.</th><th class="r">Tahmini kâr</th><th class="r">İptal/iade</th>${cmp ? html`<th class="r">Ciro değişimi</th>` : ''}</tr></thead><tbody>
        ${ids.map((id) => { const t = cur.totals[id], c = cmp && cmp.totals[id], d = c ? delta(t.revenue, c.revenue) : null; return html`<tr>
          <td><span class="ch-name"><span class="dot" style="background:${chColor(id)}"></span>${chLogo(id, true)}${ch(id).name}</span></td>
          <td class="r num">${money0(t.revenue)}</td><td class="r num">${cur.total.revenue ? n((t.revenue / cur.total.revenue) * 100) + '%' : '—'}</td>
          <td class="r num">${t.orders}</td><td class="r num">${t.orders ? money(t.revenue / t.orders) : '—'}</td><td class="r num">${money0(t.profit)}</td>
          <td class="r num">${t.cancelled + t.returned}</td>${cmp ? html`<td class="r num ${d == null || d === 0 ? 'flat' : d > 0 ? 'up' : 'down'}">${pct(d)}</td>` : ''}</tr>`; })}
        <tr style="font-weight:700"><td>Toplam</td><td class="r num">${money0(cur.total.revenue)}</td><td class="r">100%</td><td class="r num">${cur.total.orders}</td><td class="r num">${money(cur.total.basket)}</td><td class="r num">${money0(cur.total.profit)}</td><td class="r num">${cur.total.cancelled + cur.total.returned}</td>${cmp ? html`<td class="r num">${pct(delta(cur.total.revenue, cmp.total.revenue))}</td>` : ''}</tr>
      </tbody></table></div>
      <div class="section-title"><h2>En çok satan ürünler</h2><span class="muted small">${data.from} – ${data.to}</span></div>
      <div class="card flush table-wrap">${data.top.length ? html`<table class="t"><thead><tr><th>#</th><th>Ürün</th><th class="r">Adet</th><th class="r">Ciro</th><th class="r">Sipariş</th><th>Kanal dağılımı</th><th class="r">Stok</th></tr></thead><tbody>
        ${data.top.map((p, i) => html`<tr><td class="muted">${i + 1}</td><td style="min-width:180px"><div class="ellipsis" style="max-width:320px;font-weight:600">${p.name}</div><div class="muted tiny">${p.sku || ''}</div></td>
          <td class="r num" style="font-weight:700">${p.qty}</td><td class="r num">${money0(p.revenue)}</td><td class="r num">${p.orders}</td>
          <td><div class="mini-bar" title="${ids.filter((id) => p.channels[id]).map((id) => `${ch(id).name}: ${p.channels[id]}`).join(', ')}">${ids.filter((id) => p.channels[id]).map((id) => html`<span style="width:${(p.channels[id] / p.qty) * 100}%;background:${chColor(id)}"></span>`)}</div></td>
          <td class="r num" style="color:${p.stock != null && p.stock <= 0 ? 'var(--bad)' : 'inherit'}">${p.stock ?? '—'}</td></tr>`)}
      </tbody></table>` : html`<div class="empty">Bu dönemde satış yok</div>`}</div>`);
    [...$('[data-metric]', el).children].forEach((b) => b.classList.toggle('on', b.dataset.v === f.metric));
    drawChart();
  }

  function drawChart() {
    const cur = data.current, cmp = data.compare, ids = activeChannels().map((c) => c.id), g = data.group;
    const fmt = f.metric === 'orders' ? (v) => `${n(v)} sipariş` : money0, axis = f.metric === 'orders' ? (v) => n(v) : compact;
    const series = f.metric === 'profit'
      ? [{ id: 'profit', name: 'Tahmini kâr', color: 'var(--accent)', values: cur.series.map((b) => Math.max(0, b.profit)) }]
      : ids.filter((id) => !hidden.has(id)).map((id) => ({ id, name: ch(id).name, color: chColor(id), values: cur.series.map((b) => b[f.metric][id]) }));
    const cmpVals = cmp ? cmp.series.map((b) => (f.metric === 'profit' ? b.profit : ids.filter((id) => !hidden.has(id)).reduce((s, id) => s + b[f.metric][id], 0))) : null;
    const cmpName = f.compare === 'year' ? 'Geçen yıl' : 'Önceki dönem';
    const lg = $('[data-legend]', el);
    if (f.metric === 'profit') { lg.className = 'legend'; lg.innerHTML = cmp ? `<span class="row" style="gap:6px"><span class="ln"></span>${cmpName}</span>` : ''; }
    else legend(lg, ids.map((id) => ({ id, name: ch(id).name, color: chColor(id) })), hidden, (id) => { hidden.has(id) ? hidden.delete(id) : hidden.add(id); drawChart(); }, cmp ? cmpName : '');
    if (chart) { chart.destroy(); chart = null; }
    const box = $('[data-chart]', el);
    if (showTable) {
      render(box, html`<div class="table-wrap"><table class="t"><thead><tr><th>Dönem</th>${series.map((s) => html`<th class="r">${s.name}</th>`)}<th class="r">Toplam</th>${cmp ? html`<th class="r">${cmpName}</th>` : ''}</tr></thead><tbody>
        ${cur.series.map((b, i) => html`<tr><td>${title(b.key, g)}</td>${series.map((s) => html`<td class="r num">${fmt(s.values[i])}</td>`)}<td class="r num" style="font-weight:650">${fmt(series.reduce((a, s) => a + s.values[i], 0))}</td>${cmp ? html`<td class="r num muted">${fmt(cmpVals[i] || 0)}</td>` : ''}</tr>`)}
      </tbody></table></div>`);
      return;
    }
    box.className = '';
    chart = columnChart(box, {
      title: f.metric, labels: cur.series.map((b) => label(b.key, g)), titles: cur.series.map((b) => title(b.key, g)),
      series, compare: cmp ? { name: cmpName, values: cmpVals.slice(0, cur.series.length) } : null, format: fmt, axisFormat: axis,
    });
  }

  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-p]');
    if (p) { f.preset = p.dataset.p; f.groupTouched = false; load(); return; }
    const g = e.target.closest('[data-group] button');
    if (g) { f.group = g.dataset.v; f.groupTouched = true; load(); return; }
    const m = e.target.closest('[data-metric] button');
    if (m) { f.metric = m.dataset.v; store.set('stats', f); draw(); return; }
    if (e.target.closest('[data-table]')) { showTable = !showTable; draw(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-compare]')) { f.compare = e.target.value; load(); }
    if (e.target.matches('[data-from], [data-to]')) { f.custom = { from: $('[data-from]', el).value, to: $('[data-to]', el).value }; load(); }
  });
  await load();
  return { refresh: load, destroy: () => chart && chart.destroy() };
}
