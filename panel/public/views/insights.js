// Analizler: özet rapor (son 4 gün / hafta / ay kartları, haftalık rapor, illere göre gönderim, en çok satanlar)
// ve ayrıntılı grafik sekmesi. Tüm bölümler toplam ya da tek bir satış kanalı için görülebilir.
import { turkeyMap } from './trmap.js';
import { api, html, render, $, money, money0, n, pct, delta, ch, chLogo, chColor, thumb, store, toast, actions, date, isMobile, activeChannels } from '../core.js';
import { setQuery } from '../app.js';
import { statsView } from './stats.js';

const UNITS = [['day', 'Gün'], ['week', 'Hafta'], ['month', 'Ay'], ['year', 'Yıl']];
const RANGES = [['today', 'Bugün'], ['yesterday', 'Dün'], ['week', 'Bu hafta'], ['month', 'Bu ay'], ['30', 'Son 30 gün'], ['year', 'Bu yıl']];
const cardTitle = (u, i) => ({
  day: ['Bugün', 'Dün', '2 gün önce', '3 gün önce'],
  week: ['Bu hafta', 'Geçen hafta', '2 hafta önce', '3 hafta önce'],
  month: ['Bu ay', 'Geçen ay', '2 ay önce', '3 ay önce'],
  year: ['Bu yıl', 'Geçen yıl', '2 yıl önce', '3 yıl önce'],
}[u][i]);
const dlabel = (ms, u) => (u === 'month' ? new Date(ms + 3 * 3600e3 + 864e5).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : u === 'year' ? String(new Date(ms + 3 * 3600e3 + 864e5).getUTCFullYear()) : date(ms));
const chg = (cur, prev) => { const d = delta(cur, prev); return d == null || d === 0 ? html`<span class="delta flat">—</span>` : html`<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${pct(d)}</span>`; };

export async function insightsView(el, rest, query = {}) {
  if (query.tab === 'grafik') return tabbed(el, 'grafik', async (box) => statsView(box));
  return tabbed(el, '', (box) => summary(box, query));
}
async function tabbed(el, cur, fn) {
  render(el, html`<div class="stack"><div class="tabs" style="max-width:420px"><a class="tab ${cur === '' ? 'on' : ''}" href="#/analiz">Özet rapor</a><a class="tab ${cur === 'grafik' ? 'on' : ''}" href="#/analiz?tab=grafik">Ayrıntılı grafik</a></div><div data-tabbox></div></div>`);
  return fn($('[data-tabbox]', el));
}

async function summary(el, query) {
  // En çok satanlar her açılışta adede göre sıralanır (ciro sıralaması isteğe bağlı, kaydedilmez)
  const f = { channel: query.channel || '', ...store.get('insights', { unit: 'day', range: 'week' }), sort: 'qty', allCities: false, tq: '', more: false };
  let d = null;
  render(el, html`<div class="stack">
    <div class="ch-tabs" data-chs></div>
    <div class="card"><div class="card-head"><h2>Sipariş performansı</h2><div class="seg" data-units></div></div><div class="day-cards" data-cards></div></div>
    <div class="row wrap" style="align-items:center"><b style="margin-right:6px">Dönem:</b><div class="chips" data-ranges></div><span class="muted small" data-rlabel></span></div>
    <div class="two-col">
      <div class="card flush"><div class="card-pad card-head"><h2>Haftalık rapor</h2><span class="muted small">son 8 hafta</span></div><div data-weeks></div></div>
      <div class="card flush"><div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><h2 style="flex:none;white-space:nowrap">İllere göre satış</h2><span class="muted small" data-ctotal></span><span class="spacer"></span><div class="seg" data-cview></div></div><div data-cities></div></div>
    </div>
    <div class="card flush"><div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:200px"><h2>En çok satanlar</h2><div class="muted small" data-tsum></div></div>
      <label class="search" style="max-width:220px"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün ara" data-tq></label>
      <div class="seg" data-sort></div><button class="btn sm" data-act="csv" title="Listeyi Excel'de açılabilen dosya olarak indir"><i class="ico ico-download"></i>İndir</button></div><div data-top></div></div>
  </div>`);

  function draw() {
    const chs = activeChannels().filter((c) => c.enabled || c.demo);
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Toplam</button>${chs.map((c) => html`<button class="ch-tab ${f.channel === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}">${chLogo(c.id)}${c.name}</button>`)}`);
    render($('[data-units]', el), html`${UNITS.map(([k, t]) => html`<button class="${f.unit === k ? 'on' : ''}" data-act="unit" data-k="${k}">${t}</button>`)}`);
    render($('[data-ranges]', el), html`${RANGES.map(([k, t]) => html`<button class="chip ${f.range === k ? 'on' : ''}" data-act="range" data-k="${k}">${t}</button>`)}`);
    $('[data-rlabel]', el).textContent = `${date(d.range.from)} – ${date(Math.min(d.range.to, Date.now()) - 1)}`;
    render($('[data-sort]', el), html`<button class="${f.sort === 'qty' ? 'on' : ''}" data-act="sort" data-k="qty">Adede göre</button><button class="${f.sort === 'revenue' ? 'on' : ''}" data-act="sort" data-k="revenue">Ciroya göre</button>`);
    // 1) son 4 dönem kartları
    render($('[data-cards]', el), html`${d.cards.slice(0, 4).map((c, i) => { const p = d.cards[i + 1]; return html`<div class="day-card ${i === 0 ? 'cur' : ''}">
      <div class="row" style="align-items:baseline"><h3>${cardTitle(d.unit, i)}</h3><span class="spacer"></span>${chg(c.revenue, p.revenue)}</div>
      <div class="muted tiny" style="margin:-2px 0 10px">${dlabel(c.start, d.unit)}${d.unit !== 'day' && d.unit !== 'month' && d.unit !== 'year' ? ` – ${date(Math.min(c.end, Date.now()) - 1)}` : ''}</div>
      <div class="mini-grid">
        <div><span>Satış</span><b>${money(c.revenue)}</b></div><div><span>Sepet ort.</span><b>${money(c.basket)}</b></div><div><span>İptal / iade oranı</span><b class="${c.lostRate ? 'down' : ''}">%${n(c.lostRate)}</b></div>
        <div><span>Sipariş</span><b>${n(c.orders)} adet</b></div><div><span>Ürün</span><b>${n(c.items)}</b></div><div><span>İptal / iade</span><b class="${c.lost ? 'down' : ''}">${n(c.lost)}</b></div>
      </div></div>`; })}`);
    // 2) haftalık rapor
    const wk = d.weeks.slice().reverse(), maxW = Math.max(1, ...wk.map((w) => w.revenue));
    render($('[data-weeks]', el), html`<div class="table-wrap"><table class="t"><thead><tr><th>Hafta</th><th class="r">Sipariş</th><th class="r">Ciro</th><th class="r">Değişim</th><th style="width:30%"></th></tr></thead><tbody>
      ${wk.map((w, i) => { const p = wk[i + 1]; return html`<tr><td style="white-space:nowrap">${i === 0 ? html`<b>Bu hafta</b>` : i === 1 ? 'Geçen hafta' : date(w.start)}<div class="muted tiny">${i < 2 ? `${date(w.start)} haftası` : 'haftası'}${w.lost ? ` · ${w.lost} iptal/iade` : ''}</div></td>
        <td class="r num">${n(w.orders)}</td><td class="r num" style="font-weight:650">${money0(w.revenue)}</td><td class="r">${p ? chg(w.revenue, p.revenue) : ''}</td>
        <td><div class="hbar">${Object.entries(w.channels).map(([c, v]) => html`<span style="width:${(v.revenue / maxW) * 100}%;background:${chColor(c)}" title="${ch(c).name}: ${money0(v.revenue)} · ${v.orders} sipariş"></span>`)}</div></td></tr>`; })}
    </tbody></table></div>`);
    // 3) iller
    const cs = f.allCities ? d.cities : d.cities.slice(0, 12), maxC = Math.max(1, ...d.cities.map((c) => c.orders));
    $('[data-ctotal]', el).textContent = `${n(d.cities.length)} il · ${n(d.totals.orders)} sipariş`;
    render($('[data-cview]', el), html`<button class="${f.cityView !== 'list' ? 'on' : ''}" data-act="cview" data-k="map">Harita</button><button class="${f.cityView === 'list' ? 'on' : ''}" data-act="cview" data-k="list">Liste</button>`);
    if (f.cityView !== 'list') { const b = $('[data-cities]', el); b.style.padding = '0 16px 16px'; turkeyMap(b, d.cities.filter((c) => c.city !== 'BİLİNMİYOR')).catch((e) => render(b, html`<div class="notice bad">${e.message}</div>`)); }
    else { $('[data-cities]', el).style.padding = ''; render($('[data-cities]', el), d.cities.length ? html`<div class="city-list">${cs.map((c, i) => html`<div class="city"><span class="rk">${i + 1}</span><b class="ellipsis">${c.city}</b>
        <div class="hbar"><span style="width:${(c.orders / maxC) * 100}%;background:var(--primary);opacity:${0.35 + 0.65 * (c.orders / maxC)}"></span></div>
        <span class="num" title="${c.shipped} kargoya verildi / teslim">${n(c.units || c.orders)} adet · ${n(c.orders)} sipariş</span><span class="num muted small">${money0(c.revenue)}</span></div>`)}</div>
      ${d.cities.length > 12 ? html`<div class="pager"><button class="btn sm" data-act="allcities">${f.allCities ? 'Daha az göster' : `Tüm iller (${d.cities.length})`}</button></div>` : ''}` : html`<div class="empty">Bu dönemde sipariş yok</div>`); }
    // 4) en çok satanlar: adet / ciro, önceki döneme göre değişim, satıştaki pay, brüt kâr, iptal-iade, stok kaç gün yeter
    drawTop();
  }
  const trendTag = (p) => (p.trend == null ? html`<span class="pill info tiny" title="Önceki dönemde satışı yoktu">yeni</span>` : html`<span class="tiny ${p.trend > 0 ? 'up' : p.trend < 0 ? 'down' : 'muted'}" title="Önceki dönem ${n(p.prevQty)} adet">${p.trend > 0 ? '▲' : p.trend < 0 ? '▼' : '='} %${n(Math.abs(p.trend))}</span>`);
  const coverTag = (p) => (p.cover == null ? '' : html`<span class="pill tiny ${p.cover <= 7 ? 'bad' : p.cover <= 21 ? 'warn' : ''}" title="Bu satış hızıyla stok yaklaşık ${p.cover} gün yeter">${p.cover > 365 ? '1 yıl+' : `${p.cover} gün`}</span>`);
  const topRows = () => { const q = f.tq.toLocaleLowerCase('tr'); const L = q ? d.top.filter((p) => `${p.name} ${p.sku || ''}`.toLocaleLowerCase('tr').includes(q)) : d.top; return f.more || q ? L : L.slice(0, 20); };
  function drawTop() {
    const L = topRows(), box = $('[data-top]', el);
    $('[data-tsum]', el).textContent = d.top.length ? `${n(d.products || d.top.length)} farklı ürün · ${n(d.totals.units || 0)} adet · ${money0(d.totals.revenue)}` : '';
    const more = !f.tq && d.top.length > 20 ? html`<div class="pager"><button class="btn sm" data-act="topmore">${f.more ? 'İlk 20' : `Tümünü göster (${n(d.top.length)})`}</button></div>` : '';
    if (!L.length) return render(box, html`<div class="empty">${f.tq ? 'Aramaya uyan ürün yok' : 'Bu dönemde satış yok'}</div>`);
    if (isMobile()) return render(box, html`<div class="m-list" style="padding:0 12px 12px">${L.map((p) => { const i = d.top.indexOf(p); return html`<div class="m-card"><div class="top"><b class="muted" style="width:22px">${i + 1}</b>${thumb(p.image, p.name, 'sm')}<div style="min-width:0;flex:1"><div class="clamp2" style="font-weight:650">${p.name}</div><div class="muted tiny">ort. ${money(p.avg)}${p.stock != null ? ` · stok ${n(p.stock)}` : ''}</div></div></div>
      <div class="row small" style="gap:8px;flex-wrap:wrap"><b>${n(p.qty)} adet</b>${trendTag(p)}<span class="muted">${n(p.orders)} sipariş</span><span class="spacer"></span><b>${money(p.revenue)}</b><span class="muted tiny">%${p.share}</span></div>
      <div class="row tiny" style="gap:8px;flex-wrap:wrap">${p.profit != null ? html`<span>Kâr <b class="${p.profit < 0 ? 'down' : ''}">${money(p.profit)}</b></span>` : ''}${p.lost ? html`<span class="down">${n(p.lost)} iptal/iade</span>` : ''}${coverTag(p)}</div>
      <div class="hbar">${Object.entries(p.channels).map(([c, v]) => html`<span style="width:${(v / p.qty) * 100}%;background:${chColor(c)}" title="${ch(c).name}: ${v} adet"></span>`)}</div></div>`; })}</div>${more}`);
    render(box, html`<div class="table-wrap"><table class="t"><thead><tr><th style="width:44px">Sıra</th><th>Ürün</th><th class="r">Satış adedi</th><th class="r">Ciro</th><th class="r" title="Alış fiyatı girilen ürünlerde: ciro − alış × adet (komisyon ve kargo hariç)">Brüt kâr</th><th class="r">Birim fiyat</th><th class="r" title="Bu dönemde iptal / iade edilen adet">İptal / iade</th><th>Kanallar</th></tr></thead><tbody>
      ${L.map((p) => { const i = d.top.indexOf(p); return html`<tr><td class="c">${i < 3 ? ['🥇', '🥈', '🥉'][i] : html`<span class="muted">${i + 1}</span>`}</td>
        <td><div class="row">${thumb(p.image, p.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:320px;font-weight:650" title="${p.name}">${p.name}</div><div class="muted tiny row" style="gap:6px">${p.sku || ''}${p.stock != null ? html`<span>stok ${n(p.stock)}</span>` : ''}${coverTag(p)}</div></div></div></td>
        <td class="r num" style="white-space:nowrap"><b style="font-size:15px">${n(p.qty)}</b> <span class="muted tiny">adet</span><div>${trendTag(p)} <span class="muted tiny">${n(p.orders)} sipariş</span></div></td>
        <td class="r num" style="white-space:nowrap"><b style="font-weight:${f.sort === 'revenue' ? 800 : 600}">${money(p.revenue)}</b><div class="muted tiny" title="Toplam cirodaki payı">%${p.share} pay</div></td>
        <td class="r num">${p.profit != null ? html`<span class="${p.profit < 0 ? 'down' : ''}">${money(p.profit)}</span>` : html`<span class="muted tiny" title="Ürüne alış fiyatı girilmemiş">—</span>`}</td>
        <td class="r small" style="white-space:nowrap">Ort: <b>${money(p.avg)}</b><div class="muted tiny">${money(p.min)} – ${money(p.max)}</div></td>
        <td class="r num">${p.lost ? html`<span class="down">${n(p.lost)}</span><div class="muted tiny">%${p.lostRate}</div>` : html`<span class="muted">0</span>`}</td>
        <td><div class="hbar" style="min-width:90px">${Object.entries(p.channels).map(([c, v]) => html`<span style="width:${(v / p.qty) * 100}%;background:${chColor(c)}" title="${ch(c).name}: ${v} adet"></span>`)}</div></td></tr>`; })}
    </tbody></table></div>${more}`);
  }
  // CSV (Excel): tüm liste, Türkçe karakterler için BOM, ayraç ;
  function csv() {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`, num = (v) => (v == null ? '' : String(v).replace('.', ','));
    const rows = [['Sıra', 'Ürün', 'Stok kodu', 'Satış adedi', 'Önceki dönem adet', 'Değişim %', 'Sipariş', 'Ciro', 'Ciro payı %', 'Brüt kâr', 'Ortalama fiyat', 'İptal / iade adet', 'Stok', 'Stok kaç gün yeter', 'Kanallar'],
      ...d.top.map((p, i) => [i + 1, p.name, p.sku || '', p.qty, p.prevQty, p.trend ?? '', p.orders, num(p.revenue), num(p.share), num(p.profit), num(p.avg), p.lost, p.stock ?? '', p.cover ?? '',
        Object.entries(p.channels).map(([c, v]) => `${ch(c).name}: ${v}`).join(', ')])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `en-cok-satanlar-${new Date(d.range.from).toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function load() {
    store.set('insights', { unit: f.unit, range: f.range, cityView: f.cityView });
    setQuery({ channel: f.channel });
    const p = new URLSearchParams({ unit: f.unit, range: f.range, sort: f.sort, limit: 500 });
    if (f.channel) p.set('channel', f.channel);
    d = await api('insights?' + p);
    draw();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; refresh(); },
    unit: (t) => { f.unit = t.dataset.k; refresh(); },
    range: (t) => { f.range = t.dataset.k; refresh(); },
    sort: (t) => { f.sort = t.dataset.k; refresh(); },
    allcities: () => { f.allCities = !f.allCities; draw(); },
    topmore: () => { f.more = !f.more; drawTop(); },
    csv: () => (d && d.top.length ? csv() : toast('Bu dönemde satış yok', true)),
    cview: (t) => { f.cityView = t.dataset.k; store.set('insights', { unit: f.unit, range: f.range, cityView: f.cityView }); draw(); },
  });
  $('[data-tq]', el).addEventListener('input', (e) => { f.tq = e.target.value.trim(); if (d) drawTop(); });
  await refresh();
  return { refresh };
}
