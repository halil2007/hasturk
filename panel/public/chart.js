// Yığılmış sütun grafiği (kanal bazında) + isteğe bağlı karşılaştırma çizgisi. Bağımlılıksız SVG.
// Tek eksen; her sütun üzerine gelince/odaklanınca tüm kanalların değeri gösterilir. Tablo görünümü çağıran tarafta.
import { esc } from './core.js';

const NS = 'http://www.w3.org/2000/svg';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
const topRounded = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/**
 * @param el        kapsayıcı
 * @param opts.labels     x etiketleri (kısa) ; opts.titles: araç ipucu başlıkları (uzun)
 * @param opts.series     [{ id, name, color, values }]  (alttan üste yığılır)
 * @param opts.compare    { name, values } | null — aynı birimde, toplam için çizgi
 * @param opts.format     değer biçimi (eksen için opts.axisFormat)
 */
export function columnChart(el, opts) {
  const { labels, titles = labels, series, compare = null, format = String, axisFormat = format } = opts;
  el.classList.add('chart');
  el.innerHTML = '';
  const tip = document.createElement('div');
  tip.className = 'tip hide';
  const draw = () => {
    const W = Math.max(280, el.clientWidth || 600), H = opts.height || (W < 560 ? 210 : 260);
    const padL = 44, padR = 8, padT = 10, padB = 26;
    const n = labels.length, cw = (W - padL - padR) / Math.max(1, n);
    const totals = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0));
    const max = niceMax(Math.max(...totals, ...(compare ? compare.values : [0]), 0));
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const bw = Math.max(3, Math.min(24, cw * 0.62));
    let s = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.title || 'Grafik')}">`;
    for (let k = 0; k <= 4; k++) {
      const v = (max / 4) * k, yy = Math.round(y(v)) + 0.5;
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text class="axis-text" x="${padL - 6}" y="${yy + 4}" text-anchor="end">${esc(axisFormat(v))}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / Math.floor((W - padL) / 52)));
    labels.forEach((lb, i) => {
      const cx = padL + cw * i + cw / 2;
      if (i % every === 0) s += `<text class="axis-text" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`;
      s += `<g class="col" tabindex="0" data-i="${i}"><rect class="hit" x="${padL + cw * i}" y="${padT}" width="${cw}" height="${H - padT - padB}" fill="transparent"/>`;
      let base = 0;
      const visible = series.filter((x) => (x.values[i] || 0) > 0);
      visible.forEach((x, j) => {
        const v = x.values[i];
        const y0 = y(base), y1 = y(base + v), h = y0 - y1 - (j > 0 ? 2 : 0); // 2px yüzey boşluğu
        base += v;
        if (h <= 0.4) return;
        const xx = cx - bw / 2;
        s += j === visible.length - 1
          ? `<path class="seg-rect" d="${topRounded(xx, y1, bw, h, 4)}" fill="${x.color}"/>`
          : `<rect class="seg-rect" x="${xx}" y="${y1}" width="${bw}" height="${h}" fill="${x.color}"/>`;
      });
      s += '</g>';
    });
    if (compare) {
      const pts = compare.values.map((v, i) => `${padL + cw * i + cw / 2},${y(v || 0)}`).join(' ');
      s += `<polyline class="cmp-line" points="${pts}" pointer-events="none"/>`;
    }
    s += '</svg>';
    el.innerHTML = s;
    el.append(tip);
    const show = (g) => {
      const i = Number(g.dataset.i);
      let rows = series.map((x) => `<div class="r"><span class="k" style="background:${x.color}"></span>${esc(x.name)}<b>${esc(format(x.values[i] || 0))}</b></div>`).join('');
      rows += `<div class="r" style="margin-top:4px;font-weight:650">Toplam<b>${esc(format(totals[i]))}</b></div>`;
      if (compare) rows += `<div class="r muted"><span class="k" style="background:var(--text-2);opacity:.55"></span>${esc(compare.name)}<b>${esc(format(compare.values[i] || 0))}</b></div>`;
      tip.innerHTML = `<div class="h">${esc(titles[i])}</div>${rows}`;
      tip.classList.remove('hide');
      const cx = (padL + cw * i + cw / 2) * (el.clientWidth / W);
      const left = Math.min(Math.max(0, cx + 12), el.clientWidth - tip.offsetWidth);
      tip.style.left = (cx + 12 + tip.offsetWidth > el.clientWidth ? Math.max(0, cx - tip.offsetWidth - 12) : left) + 'px';
      tip.style.top = '0px';
    };
    el.querySelectorAll('.col').forEach((g) => {
      g.addEventListener('pointerenter', () => show(g));
      g.addEventListener('focus', () => show(g));
      g.addEventListener('click', () => show(g));
    });
    el.querySelector('svg').addEventListener('pointerleave', () => tip.classList.add('hide'));
    el.querySelectorAll('.col').forEach((g) => g.addEventListener('blur', () => tip.classList.add('hide')));
  };
  draw();
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } });
  ro.observe(el);
  return { destroy: () => ro.disconnect() };
}

// Gösterge (lejant): kanal açıp kapatma; renk kanala bağlıdır, kapatılan kanal diğerlerinin rengini değiştirmez
export function legend(el, items, hidden, onToggle, compareName) {
  el.className = 'legend';
  el.innerHTML = items.map((x) => `<button type="button" data-id="${esc(x.id)}" class="${hidden.has(x.id) ? 'off' : ''}" aria-pressed="${!hidden.has(x.id)}"><span class="sw" style="background:${x.color}"></span>${esc(x.name)}</button>`).join('')
    + (compareName ? `<span class="row" style="gap:6px"><span class="ln"></span>${esc(compareName)}</span>` : '');
  el.onclick = (e) => { const b = e.target.closest('button[data-id]'); if (b) onToggle(b.dataset.id); };
}

// Çizgi grafik: bu dönem (dolu çizgi + hafif alan) ve önceki dönem (kesikli). Artı imleç ve tüm serileri gösteren ipucu.
export function lineChart(el, { labels, titles = labels, current, previous = null, curName = 'Bu dönem', prevName = 'Önceki dönem', format = String, axisFormat = format, height }) {
  el.classList.add('chart');
  el.innerHTML = '';
  const tip = document.createElement('div');
  tip.className = 'tip hide';
  let geo = null;
  const draw = () => {
    const W = Math.max(280, el.clientWidth || 600), H = height || (W < 560 ? 200 : 250);
    const padL = 50, padR = 12, padT = 12, padB = 26;
    const n = labels.length;
    const max = niceMax(Math.max(0, ...current, ...(previous || [])));
    const x = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : ((W - padL - padR) * i) / (n - 1));
    const y = (v) => padT + (H - padT - padB) * (1 - (v || 0) / max);
    const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    let s = `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Satış grafiği">`;
    for (let k = 0; k <= 4; k++) {
      const v = (max / 4) * k, yy = Math.round(y(v)) + 0.5;
      s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}"/><text class="axis-text" x="${padL - 8}" y="${yy + 4}" text-anchor="end">${esc(axisFormat(v))}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL) / 64))));
    labels.forEach((lb, i) => { if (i % every === 0) s += `<text class="axis-text" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lb)}</text>`; });
    if (previous) s += `<path class="cmp-line" d="${path(previous.slice(0, n))}"/>`;
    s += `<path class="main-area" d="${path(current)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z"/><path class="main-line" d="${path(current)}"/>`;
    s += `<line class="xhair hide" x1="0" x2="0" y1="${padT}" y2="${H - padB}"/><circle class="xdot hide" r="4.5" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>`;
    s += `<rect class="hit-layer" x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" tabindex="0"/></svg>`;
    el.innerHTML = s;
    el.append(tip);
    geo = { W, x, y, n };
    const svg = el.querySelector('svg'), hit = el.querySelector('.hit-layer'), xh = el.querySelector('.xhair'), xd = el.querySelector('.xdot');
    const show = (i) => {
      i = Math.max(0, Math.min(n - 1, i));
      const sc = el.clientWidth / W, px = x(i);
      xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.classList.remove('hide');
      xd.setAttribute('cx', px); xd.setAttribute('cy', y(current[i])); xd.classList.remove('hide');
      tip.innerHTML = `<div class="h">${esc(titles[i])}</div><div class="r"><span class="k" style="background:var(--primary)"></span>${esc(curName)}<b>${esc(format(current[i] || 0))}</b></div>`
        + (previous ? `<div class="r muted"><span class="k dash"></span>${esc(prevName)}<b>${esc(format(previous[i] || 0))}</b></div>` : '');
      tip.classList.remove('hide');
      const left = px * sc + 14 + tip.offsetWidth > el.clientWidth ? px * sc - tip.offsetWidth - 14 : px * sc + 14;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '4px';
    };
    const idx = (ev) => { const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W; return n <= 1 ? 0 : Math.round(((px - padL) / (W - padL - padR)) * (n - 1)); };
    hit.addEventListener('pointermove', (ev) => show(idx(ev)));
    hit.addEventListener('pointerdown', (ev) => show(idx(ev)));
    let ki = n - 1;
    hit.addEventListener('focus', () => show(ki));
    hit.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft') show((ki = Math.max(0, ki - 1))); if (ev.key === 'ArrowRight') show((ki = Math.min(n - 1, ki + 1))); });
    const hide = () => { tip.classList.add('hide'); xh.classList.add('hide'); xd.classList.add('hide'); };
    hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
  };
  draw();
  let w = el.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 4) { w = el.clientWidth; draw(); } });
  ro.observe(el);
  return { destroy: () => ro.disconnect() };
}

// KPI kartlarındaki küçük eğilim çizgisi (değerler sadece görsel eğilim; rakam kartın kendisinde)
export function sparkline(values, color = 'var(--primary)') {
  const v = values.length ? values : [0];
  const W = 120, H = 44, max = Math.max(...v, 1), min = Math.min(...v, 0);
  const x = (i) => (v.length === 1 ? W / 2 : (W * i) / (v.length - 1));
  const y = (val) => 4 + (H - 8) * (1 - (val - min) / (max - min || 1));
  const d = v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W},${H}L0,${H}Z" fill="${color}" opacity=".1"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
