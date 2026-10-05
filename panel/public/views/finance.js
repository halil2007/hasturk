// Gelir & Gider: seçilen dönemde satıştan kâra masraf basamakları (komisyon, kargo, hizmet bedeli, ek kesinti, stopaj, alış),
// kanal bazında tablo ve pazaryerlerinin kestiği faturalar (komisyon, kargo, hizmet bedeli, reklam, ceza ...).
import { api, html, render, $, money, money0, n, ch, chLogo, chBadge, date, dateTime, store, toast, actions, busy, activeChannels, isAdmin } from '../core.js';
import { setQuery } from '../app.js';

const D = 864e5;
const startOfMonth = (k = 0) => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() - k); return d.getTime() - 3 * 3600e3; };
const RANGES = [
  ['month', 'Bu ay', () => [startOfMonth(0), Date.now() + 1]],
  ['last', 'Geçen ay', () => [startOfMonth(1), startOfMonth(0)]],
  ['30', 'Son 30 gün', () => [Date.now() - 30 * D, Date.now() + 1]],
  ['90', 'Son 90 gün', () => [Date.now() - 90 * D, Date.now() + 1]],
  ['year', 'Son 1 yıl', () => [Date.now() - 365 * D, Date.now() + 1]],
];

export async function financeView(el, rest, query = {}) {
  const f = { range: 'month', channel: query.channel || '', ...store.get('finance', {}), ...(query.channel ? { channel: query.channel } : {}) };
  let d = null, inv = null;
  render(el, html`<div class="stack">
    <div class="ch-tabs" data-chs></div>
    <div class="row wrap" style="align-items:center"><b style="margin-right:6px">Dönem:</b><div class="chips" data-ranges></div><span class="muted small" data-rlabel></span></div>
    <div class="kpis" data-kpis></div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Masraf basamakları</h2><span class="muted small">satıştan kâra</span></div><div data-steps></div></div>
      <div class="card flush"><div class="card-pad card-head"><h2>Kanallara göre</h2></div><div data-chtable></div></div>
    </div>
    <div class="card flush"><div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><h2>Kesilen faturalar</h2><span class="muted small" data-invsub></span><span class="spacer"></span>
      ${isAdmin() ? html`<button class="btn sm" data-act="invsync"><i class="ico ico-sync"></i>Faturaları çek</button>` : ''}</div><div data-inv></div></div>
  </div>`);

  const span = () => (RANGES.find((r) => r[0] === f.range) || RANGES[0])[2]();
  function draw() {
    const chs = activeChannels().filter((c) => c.enabled || c.demo);
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${chs.map((c) => html`<button class="ch-tab ${f.channel === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}">${chLogo(c.id)}${c.name}</button>`)}`);
    render($('[data-ranges]', el), html`${RANGES.map(([k, t]) => html`<button class="chip ${f.range === k ? 'on' : ''}" data-act="range" data-k="${k}">${t}</button>`)}`);
    $('[data-rlabel]', el).textContent = `${date(d.from)} – ${date(Math.min(d.to, Date.now()) - 1)}`;
    const t = d.total, ded = t.commission + t.shipping + t.fee + t.rateFee + t.withholding;
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Satış (ciro)</div><div class="value num">${money0(t.revenue)}</div><div class="delta flat">${n(t.orders)} sipariş</div></div>
      <div class="kpi"><div class="label">Pazaryeri kesintileri</div><div class="value num">${money0(ded)}</div><div class="delta flat">satışın %${n(t.revenue ? (ded / t.revenue) * 100 : 0)}'i</div></div>
      <div class="kpi"><div class="label">Hakediş</div><div class="value num">${money0(t.payout)}</div><div class="delta flat">hesabınıza geçen</div></div>
      <div class="kpi"><div class="label">Tahmini kâr</div><div class="value num" style="color:${t.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(t.profit)}</div><div class="delta flat">kâr marjı %${n(t.margin)}</div></div>`);
    const max = Math.max(1, ...d.steps.map((s) => Math.abs(s.v)));
    render($('[data-steps]', el), t.orders ? html`<div class="stack" style="gap:6px">${d.steps.map((s) => html`<div class="row" style="gap:10px;${s.sum ? 'border-top:1px solid var(--line);padding-top:6px' : ''}">
        <div style="width:190px;flex:0 0 auto"><div class="small" style="font-weight:${s.sum || s.k === 'revenue' ? 750 : 550}">${s.label}</div>${s.note ? html`<div class="tiny muted">${s.note}</div>` : ''}</div>
        <div style="flex:1;background:var(--surface-3);border-radius:6px;height:16px;overflow:hidden"><div style="height:100%;width:${(Math.abs(s.v) / max) * 100}%;border-radius:6px;background:${s.v < 0 ? 'var(--bad)' : s.k === 'profit' ? 'var(--good)' : 'var(--primary)'};opacity:${s.sum || s.k === 'revenue' ? 1 : 0.7}"></div></div>
        <b class="num" style="width:110px;text-align:right;color:${s.v < 0 ? 'var(--bad)' : 'inherit'}">${s.v < 0 ? '−' : ''}${money(Math.abs(s.v))}</b>
        <span class="muted tiny" style="width:48px;text-align:right">%${n(t.revenue ? (Math.abs(s.v) / t.revenue) * 100 : 0)}</span></div>`)}</div>
      <div class="muted tiny" style="margin-top:10px">Kesinti oranları Ayarlar → Komisyon ve giderler'den gelir; kanal gerçek komisyon ve kargo tutarını bildirdiyse o kullanılır.</div>`
      : html`<div class="empty">Bu dönemde sipariş yok</div>`);
    render($('[data-chtable]', el), d.channels.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Satış</th><th class="r">Komisyon</th><th class="r">Kargo</th><th class="r">Hizmet + ek</th><th class="r">Stopaj</th><th class="r">Hakediş</th><th class="r">Kâr</th></tr></thead><tbody>
      ${d.channels.map((c) => html`<tr><td>${chBadge(c.channel)}<div class="tiny muted">${n(c.orders)} sipariş</div></td><td class="r num">${money0(c.revenue)}</td><td class="r num">${money0(c.commission)}</td><td class="r num">${money0(c.shipping)}</td>
        <td class="r num">${money0(c.fee + c.rateFee)}</td><td class="r num">${money0(c.withholding)}</td><td class="r num" style="font-weight:650">${money0(c.payout)}</td>
        <td class="r num" style="font-weight:750;color:${c.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(c.profit)}<div class="tiny muted">%${n(c.margin)}</div></td></tr>`)}
    </tbody></table></div>` : html`<div class="empty">Veri yok</div>`);
    drawInvoices();
  }
  function drawInvoices() {
    const box = $('[data-inv]', el);
    if (!inv) return render(box, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    $('[data-invsub]', el).textContent = inv.items.length ? `${n(inv.total)} fatura · ${money0(inv.sum)}` : '';
    if (!inv.supported.length) return render(box, html`<div class="empty">Fatura bilgisi veren bağlı kanal yok.</div>`);
    render(box, html`
      ${inv.types.length ? html`<div class="row wrap" style="gap:8px;padding:0 16px 12px">${inv.types.map((x) => html`<button class="chip ${f.itype === x.type ? 'on' : ''}" data-act="itype" data-k="${x.type}">${x.type} <b class="num" style="margin-left:4px">${money0(x.amount)}</b> <span class="muted tiny">(${n(x.n)})</span></button>`)}${f.itype ? html`<button class="chip" data-act="itype" data-k="">Tümü</button>` : ''}</div>` : ''}
      ${inv.items.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Tarih</th><th>Kanal</th><th>Tür</th><th>Fatura no / açıklama</th><th class="r">Tutar</th><th></th></tr></thead><tbody>
        ${inv.items.map((x) => html`<tr><td class="small" style="white-space:nowrap">${date(x.date)}</td><td>${chLogo(x.channel, true)}</td><td><span class="pill">${x.type}</span></td>
          <td class="small"><div style="font-weight:600">${x.no || '—'}</div><div class="muted tiny ellipsis" style="max-width:360px">${x.description || ''}${x.order_number ? ` · sipariş ${x.order_number}` : ''}</div></td>
          <td class="r num" style="font-weight:650">${money(x.amount)}</td>
          <td class="r">${x.url ? html`<a class="btn sm" href="${x.url}" target="_blank" rel="noopener"><i class="ico ico-download"></i>PDF</a>` : ''}</td></tr>`)}
      </tbody></table></div>${inv.total > inv.items.length ? html`<div class="pager"><span class="muted small">İlk ${n(inv.items.length)} fatura gösteriliyor</span></div>` : ''}`
      : html`<div class="empty">Bu dönemde fatura yok${isAdmin() ? ' — “Faturaları çek” ile kanallardan alın' : ''}</div>`}
      <div class="muted tiny" style="padding:0 16px 14px">Faturalar ${inv.supported.map((c) => ch(c).name).join(', ')} finans servisinden alınır ve panelde saklanır (6 saatte bir güncellenir). PDF bağlantısı kanal veriyorsa gösterilir.</div>`);
  }
  async function load() {
    store.set('finance', { range: f.range });
    setQuery({ channel: f.channel });
    const [from, to] = span();
    const p = new URLSearchParams({ from, to });
    if (f.channel) p.set('channel', f.channel);
    inv = null;
    d = await api('finance?' + p);
    draw();
    if (f.itype) p.set('type', f.itype);
    inv = await api('invoices?' + p).catch((e) => ({ items: [], types: [], supported: [], total: 0, sum: 0, error: e.message }));
    drawInvoices();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; refresh(); },
    range: (t) => { f.range = t.dataset.k; refresh(); },
    itype: (t) => { f.itype = t.dataset.k; refresh(); },
    invsync: (t) => busy(t, async () => { const r = await api('invoices/sync', { method: 'POST' }); toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${v} fatura`}`).join(' · ') || 'Fatura bilgisi veren kanal yok'); await load(); }),
  });
  await refresh();
  return { refresh };
}
