// Türkiye haritası: illere göre satış. Satış olan iller renk yoğunluğuyla boyanır; fare (telefonda dokunma) ile
// il adı, satılan adet, sipariş, müşteri, ciro ve kanal dökümü görünür; ile basınca haritanın altında kanal tablosu açılır. Harita verisi ilk kullanımda yüklenir (tr-map.js).
import { html, render, money0, n, ch, chLogo } from '../core.js';

const ASCII = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
// İl adlarını karşılaştırılabilir hale getir: "İSTANBUL", "istanbul (avrupa)", "K.Maraş", "Afyon" → istanbul, kahramanmaras, afyonkarahisar
export function cityKey(s) {
  let k = String(s || '').toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, (c) => ASCII[c] || c).split(/[/(,-]/)[0].replace(/[^a-z]/g, '');
  const alias = { afyon: 'afyonkarahisar', kmaras: 'kahramanmaras', maras: 'kahramanmaras', icel: 'mersin', urfa: 'sanliurfa', antep: 'gaziantep', hakari: 'hakkari', istanbulanadolu: 'istanbul', istanbulavrupa: 'istanbul' };
  return alias[k] || k;
}

let MAP = null;
const loadMap = () => (MAP = MAP || import('../tr-map.js'));

// Renk kademeleri: satış olan illerin değerleri doğal gruplarına ayrılır (Jenks / Fisher, logaritmik ölçekte: 1 ile 10 arasındaki fark
// 100 ile 1.000 arasındaki kadar sayılır; tek büyük il diğerlerini tek tona ezmez). Birbirine yakın iller aynı tonda, belirgin farklı
// olanlar ayrı tonda; en az satan grup en açık (--map1), en çok satan en koyu (--map5) ton (açık / koyu tema).
// Grup sayısı 2–5: dağılımı yeterince anlatan (GVF ≥ 0,9) en az grup.
function breaksOf(v, k) {
  const N = v.length, lo = Array.from({ length: N + 1 }, () => Array(k + 1).fill(1)), cost = Array.from({ length: N + 1 }, () => Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) cost[1][j] = 0;
  for (let l = 2; l <= N; l++) {
    let s1 = 0, s2 = 0, vr = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1, x = v[i3 - 1];
      s1 += x; s2 += x * x; vr = s2 - (s1 * s1) / m;
      const i4 = i3 - 1;
      if (i4) for (let j = 2; j <= k; j++) if (cost[l][j] >= vr + cost[i4][j - 1]) { lo[l][j] = i3; cost[l][j] = vr + cost[i4][j - 1]; }
    }
    cost[l][1] = vr;
  }
  const starts = []; let kk = N;
  for (let j = k; j >= 2; j--) { const id = lo[kk][j] - 1; starts.unshift(id); kk = id; }
  return { starts, sdcm: cost[N][k] };
}
export function mapClasses(values, max = 5) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return { cls: () => 0, legend: [] };
  const lv = v.map((x) => Math.log(x)), mean = lv.reduce((a, x) => a + x, 0) / lv.length, sdam = lv.reduce((a, x) => a + (x - mean) ** 2, 0);
  let br = [];
  for (let k = 2; k <= Math.min(max, new Set(v).size); k++) {
    const r = breaksOf(lv, k);
    br = [...new Set(r.starts.map((i) => v[i]))].filter((b) => b > v[0]);
    if (!sdam || 1 - r.sdcm / sdam >= 0.9) break;
  }
  const nc = br.length + 1, tone = (c) => (nc === 1 ? max : Math.round(1 + ((c - 1) * (max - 1)) / (nc - 1)));
  const cls = (x) => (x > 0 ? tone(1 + br.filter((b) => x >= b).length) : 0);
  const legend = Array.from({ length: nc }, (_, i) => ({ tone: tone(i + 1), lo: i ? br[i - 1] : v[0], hi: i < br.length ? Math.max(...v.filter((x) => x < br[i])) : v[v.length - 1] }));
  return { cls, legend };
}
const range = (a, b) => (Math.round(a) === Math.round(b) ? n(a) : `${n(a)}–${n(b)}`);
// İlin kanal dökümü: ciroya göre sıralı [kanal, { orders, units, revenue }]
const chList = (x) => Object.entries(x.channels || {}).sort((a, b) => b[1].revenue - a[1].revenue || b[1].orders - a[1].orders);

// rows: [{ city, orders, units?, revenue, customers?, channels?: { kanal: { orders, units, revenue } } }] — aynı ile ait farklı yazımlar birleştirilir
export async function turkeyMap(box, rows, { metric = 'units' } = {}) {
  render(box, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  const { VIEW, PROVINCES } = await loadMap();
  const by = new Map(PROVINCES.map(([plate, name]) => [cityKey(name), { plate, name, orders: 0, units: 0, revenue: 0, customers: 0, channels: {} }]));
  let unknown = 0;
  for (const r of rows) {
    const x = by.get(cityKey(r.city));
    if (!x) { unknown += r.orders || 0; continue; }
    x.orders += r.orders || 0; x.units += r.units || 0; x.revenue += r.revenue || 0; x.customers += r.customers || 0;
    for (const [c, v] of Object.entries(r.channels || {})) {
      const t = x.channels[c] || (x.channels[c] = { orders: 0, units: 0, revenue: 0 });
      t.orders += v.orders || 0; t.units += v.units || 0; t.revenue += v.revenue || 0;
    }
  }
  const val = (x) => (metric === 'units' ? x.units || x.orders : x[metric]);
  const list = [...by.values()];
  const sold = list.filter((x) => x.orders), revenue = sold.reduce((s, x) => s + x.revenue, 0);
  const { cls, legend } = mapClasses(list.map(val));
  const fill = (x) => { const c = cls(val(x)); return c ? `var(--map${c})` : 'var(--surface-3)'; };
  const unit = metric === 'units' ? 'adet' : metric === 'orders' ? 'sipariş' : '';
  render(box, html`<div class="trmap" style="position:relative">
    <svg viewBox="${VIEW}" role="img" aria-label="Türkiye illere göre satış haritası" style="width:100%;height:auto;display:block">
      ${PROVINCES.map(([plate, name, d]) => { const x = by.get(cityKey(name)); return html`<path d="${d}" data-plate="${plate}" fill="${fill(x)}" stroke="var(--surface)" stroke-width="1.2" style="cursor:pointer;transition:opacity .12s"><title>${name}</title></path>`; })}
    </svg>
    <div class="trtip" hidden style="position:absolute;pointer-events:none;z-index:5;background:var(--surface);border:1px solid var(--line-2);border-radius:10px;box-shadow:var(--shadow, 0 6px 20px rgba(0,0,0,.15));padding:8px 10px;font-size:13px;min-width:170px;max-width:260px"></div>
    <div class="row wrap small muted" style="gap:14px;margin-top:8px;align-items:center">
      <span><b style="color:var(--text)">${n(sold.length)}</b> ilde satış</span>
      <span>Toplam ciro <b style="color:var(--text)">${money0(revenue)}</b></span>
      ${unknown ? html`<span>${n(unknown)} siparişte il bilgisi eşleşmedi</span>` : ''}
      ${legend.length ? html`<span class="row wrap" style="gap:8px;margin-left:auto;align-items:center" aria-label="Renk açıklaması">${legend.map((g) => html`<span class="row" style="gap:4px;align-items:center"><span style="display:inline-block;width:14px;height:10px;border-radius:3px;background:var(--map${g.tone})"></span>${range(g.lo, g.hi)}</span>`)}${unit ? html`<span>${unit}</span>` : ''}</span>` : ''}
    </div>
    <div class="muted tiny" style="margin-top:4px">İl üzerine gelin ya da basın: hangi kanaldan kaç sipariş ve ne kadar ciro geldiği görünür.</div>
    <div data-trdetail></div></div>`);
  const svg = box.querySelector('svg'), tip = box.querySelector('.trtip'), wrap = box.querySelector('.trmap'), det = box.querySelector('[data-trdetail]');
  const byPlate = new Map(list.map((x) => [String(x.plate), x]));
  let sel = null;
  const mark = (hover) => svg.querySelectorAll('path').forEach((el) => {
    const on = el.dataset.plate === sel;
    el.style.opacity = hover && el !== hover && !on ? '.75' : '1';
    el.setAttribute('stroke', on ? 'var(--text)' : 'var(--surface)'); el.setAttribute('stroke-width', on ? '2.4' : '1.2');
    if (on) el.parentNode.appendChild(el); // seçili ilin çerçevesi komşuların altında kalmasın
  });
  function show(e) {
    const p = e.target.closest('path[data-plate]');
    mark(p);
    if (!p) { tip.hidden = true; return; }
    const x = byPlate.get(p.dataset.plate), cs = chList(x);
    render(tip, html`<div style="font-weight:700;margin-bottom:4px">${x.name}</div>
      ${x.orders ? html`<div><b>${n(x.units || x.orders)}</b> adet · ${n(x.orders)} sipariş${x.customers ? ` · ${n(x.customers)} müşteri` : ''}</div><div style="margin-top:2px">Ciro: <b>${money0(x.revenue)}</b></div>
        ${cs.length ? html`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line);display:grid;gap:3px">${cs.slice(0, 5).map(([c, v]) => html`<div class="row" style="gap:6px;align-items:center">${chLogo(c, true)}<span class="ellipsis" style="flex:1;min-width:0">${ch(c).name}</span><span class="muted">${n(v.orders)}</span><b class="num">${money0(v.revenue)}</b></div>`)}
          ${cs.length > 5 ? html`<div class="muted tiny">+${cs.length - 5} kanal daha · basınca tümü</div>` : ''}</div>` : ''}` : html`<div class="muted">Satış yok</div>`}`);
    tip.hidden = false;
    const r = wrap.getBoundingClientRect(), pt = e.touches ? e.touches[0] : e;
    let left = pt.clientX - r.left + 14, top = pt.clientY - r.top + 14;
    if (left + tip.offsetWidth > r.width) left = pt.clientX - r.left - tip.offsetWidth - 14;
    if (top + tip.offsetHeight > svg.clientHeight) top = pt.clientY - r.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = Math.max(0, top) + 'px';
  }
  // İle basınca: haritanın altında ilin kanal dökümü (sipariş, adet, ciro, ciro payı); aynı ile tekrar basınca kapanır
  function pick(e) {
    const p = e.target.closest('path[data-plate]');
    if (!p) return;
    tip.hidden = true;
    sel = sel === p.dataset.plate ? null : p.dataset.plate;
    mark(null);
    if (!sel) return render(det, '');
    const x = byPlate.get(sel), cs = chList(x);
    render(det, html`<div style="margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:12px">
      <div class="row" style="gap:8px;align-items:flex-start"><div style="flex:1;min-width:0"><b style="font-size:15px">${x.name}</b>
        <div class="muted small">${x.orders ? `${n(x.units || x.orders)} adet · ${n(x.orders)} sipariş${x.customers ? ` · ${n(x.customers)} müşteri` : ''} · ${money0(x.revenue)}` : 'Bu dönemde satış yok'}</div></div>
        <button class="btn sm ghost" data-trclose aria-label="Kapat">✕</button></div>
      ${cs.length ? html`<div class="table-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>Kanal</th><th class="r">Sipariş</th><th class="r">Ciro</th><th class="m-hide" style="width:28%">Ciro payı</th></tr></thead><tbody>
        ${cs.map(([c, v]) => { const sh = x.revenue ? (v.revenue / x.revenue) * 100 : 0; return html`<tr><td><span class="row" style="gap:6px;align-items:center">${chLogo(c, true)}<b class="ellipsis">${ch(c).name}</b></span></td>
          <td class="r num">${n(v.orders)}<div class="muted tiny">${n(v.units)} adet</div></td><td class="r num" style="font-weight:650;white-space:nowrap">${money0(v.revenue)}<div class="muted tiny">%${n(Math.round(sh))} pay</div></td>
          <td class="m-hide"><div class="row" style="gap:6px;align-items:center"><div style="flex:1;height:8px;border-radius:4px;background:var(--surface-3);overflow:hidden"><div style="width:${sh.toFixed(1)}%;height:100%;background:var(--map3)"></div></div></div></td></tr>`; })}
      </tbody></table></div>` : x.orders ? html`<div class="muted small" style="margin-top:6px">Kanal dökümü yok.</div>` : ''}</div>`);
    det.querySelector('[data-trclose]').onclick = () => { sel = null; mark(null); render(det, ''); };
  }
  svg.addEventListener('mousemove', show);
  svg.addEventListener('click', pick);
  svg.addEventListener('mouseleave', () => { tip.hidden = true; mark(null); });
}

// İl listesi (haritadaki verinin tablo hali): adet, sipariş, müşteri, ciro
export function cityTable(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = cityKey(r.city) || r.city;
    const x = m.get(k) || { city: r.city, orders: 0, units: 0, revenue: 0, customers: 0 };
    x.orders += r.orders || 0; x.units += r.units || 0; x.revenue += r.revenue || 0; x.customers += r.customers || 0;
    m.set(k, x);
  }
  const list = [...m.values()].sort((a, b) => (b.units || b.orders) - (a.units || a.orders) || b.revenue - a.revenue);
  const hasU = list.some((x) => x.units), hasC = list.some((x) => x.customers);
  return list.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th style="width:40px">#</th><th>İl</th>${hasU ? html`<th class="r">Adet</th>` : ''}<th class="r">Sipariş</th>${hasC ? html`<th class="r">Müşteri</th>` : ''}<th class="r">Ciro</th></tr></thead><tbody>
    ${list.map((x, i) => html`<tr><td class="muted">${i + 1}</td><td style="font-weight:600">${x.city}</td>${hasU ? html`<td class="r num"><b>${n(x.units)}</b></td>` : ''}<td class="r num">${n(x.orders)}</td>${hasC ? html`<td class="r num">${n(x.customers)}</td>` : ''}<td class="r num">${money0(x.revenue)}</td></tr>`)}
  </tbody></table></div>` : html`<div class="empty">Veri yok</div>`;
}
