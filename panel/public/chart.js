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
