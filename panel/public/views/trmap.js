// Türkiye haritası: illere göre satış. Satış olan iller renk yoğunluğuyla boyanır; fare (telefonda dokunma) ile
// il adı, satılan adet, sipariş, müşteri ve ciro görünür. Harita verisi ilk kullanımda yüklenir (tr-map.js).
import { html, render, money0, n } from '../core.js';

const ASCII = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
// İl adlarını karşılaştırılabilir hale getir: "İSTANBUL", "istanbul (avrupa)", "K.Maraş", "Afyon" → istanbul, kahramanmaras, afyonkarahisar
export function cityKey(s) {
  let k = String(s || '').toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, (c) => ASCII[c] || c).split(/[/(,-]/)[0].replace(/[^a-z]/g, '');
  const alias = { afyon: 'afyonkarahisar', kmaras: 'kahramanmaras', maras: 'kahramanmaras', icel: 'mersin', urfa: 'sanliurfa', antep: 'gaziantep', hakari: 'hakkari', istanbulanadolu: 'istanbul', istanbulavrupa: 'istanbul' };
  return alias[k] || k;
}

let MAP = null;
const loadMap = () => (MAP = MAP || import('../tr-map.js'));

// rows: [{ city, orders, units?, revenue, customers? }] — aynı ile ait farklı yazımlar birleştirilir
export async function turkeyMap(box, rows, { metric = 'units' } = {}) {
  render(box, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  const { VIEW, PROVINCES } = await loadMap();
  const by = new Map(PROVINCES.map(([plate, name]) => [cityKey(name), { plate, name, orders: 0, units: 0, revenue: 0, customers: 0 }]));
  let unknown = 0;
  for (const r of rows) {
    const x = by.get(cityKey(r.city));
    if (!x) { unknown += r.orders || 0; continue; }
    x.orders += r.orders || 0; x.units += r.units || 0; x.revenue += r.revenue || 0; x.customers += r.customers || 0;
  }
  const val = (x) => (metric === 'units' ? x.units || x.orders : x[metric]);
  const list = [...by.values()], max = Math.max(1, ...list.map(val));
  const sold = list.filter((x) => x.orders), revenue = sold.reduce((s, x) => s + x.revenue, 0);
  // Renk: satış yoksa nötr; varsa en çok satan ile oranlı ton (karekök ölçek: küçük iller de görünür)
  const fill = (x) => (val(x) ? `color-mix(in srgb, var(--primary) ${Math.round(18 + 82 * Math.sqrt(val(x) / max))}%, var(--surface))` : 'var(--surface-3)');
  render(box, html`<div class="trmap" style="position:relative">
    <svg viewBox="${VIEW}" role="img" aria-label="Türkiye illere göre satış haritası" style="width:100%;height:auto;display:block">
      ${PROVINCES.map(([plate, name, d]) => { const x = by.get(cityKey(name)); return html`<path d="${d}" data-plate="${plate}" fill="${fill(x)}" stroke="var(--surface)" stroke-width="1.2" style="cursor:pointer;transition:opacity .12s"><title>${name}</title></path>`; })}
    </svg>
    <div class="trtip" hidden style="position:absolute;pointer-events:none;z-index:5;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow, 0 6px 20px rgba(0,0,0,.15));padding:8px 10px;font-size:13px;min-width:150px"></div>
    <div class="row wrap small muted" style="gap:14px;margin-top:8px">
      <span><b style="color:var(--text)">${n(sold.length)}</b> ilde satış</span>
      <span>Toplam ciro <b style="color:var(--text)">${money0(revenue)}</b></span>
      ${unknown ? html`<span>${n(unknown)} siparişte il bilgisi eşleşmedi</span>` : ''}
      <span class="row" style="gap:6px;margin-left:auto">az <span style="display:inline-block;width:90px;height:8px;border-radius:4px;background:linear-gradient(90deg, color-mix(in srgb, var(--primary) 18%, var(--surface)), var(--primary))"></span> çok</span>
    </div></div>`);
  const svg = box.querySelector('svg'), tip = box.querySelector('.trtip'), wrap = box.querySelector('.trmap');
  const byPlate = new Map(list.map((x) => [String(x.plate), x]));
  function show(e) {
    const p = e.target.closest('path[data-plate]');
    svg.querySelectorAll('path').forEach((el) => { el.style.opacity = p && el !== p ? '.75' : '1'; });
    if (!p) { tip.hidden = true; return; }
    const x = byPlate.get(p.dataset.plate);
    render(tip, html`<div style="font-weight:700;margin-bottom:4px">${x.name}</div>
      ${x.orders ? html`<div><b>${n(x.units || x.orders)}</b> adet satış</div><div class="muted">${n(x.orders)} sipariş${x.customers ? ` · ${n(x.customers)} müşteri` : ''}</div><div style="margin-top:4px">Ciro: <b>${money0(x.revenue)}</b></div>` : html`<div class="muted">Satış yok</div>`}`);
    tip.hidden = false;
    const r = wrap.getBoundingClientRect(), pt = e.touches ? e.touches[0] : e;
    let left = pt.clientX - r.left + 14, top = pt.clientY - r.top + 14;
    if (left + tip.offsetWidth > r.width) left = pt.clientX - r.left - tip.offsetWidth - 14;
    if (top + tip.offsetHeight > r.height) top = pt.clientY - r.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = Math.max(0, top) + 'px';
  }
  svg.addEventListener('mousemove', show);
  svg.addEventListener('click', show);
  svg.addEventListener('mouseleave', () => { tip.hidden = true; svg.querySelectorAll('path').forEach((el) => { el.style.opacity = '1'; }); });
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
