// Kargo etiketi: 100×150 mm termal/ofis yazıcısı için yazdırılabilir etiket + Code 128 barkod.
// Pazaryerinin resmi etiketi (ZPL/PDF) varsa ayrıca indirilebilir; panel etiketi her kanalda çalışır.
import { esc, ch, money } from './core.js';

// Code 128 desen tablosu (çubuk/boşluk genişlikleri), 0–102 veri, 103–105 başlangıç A/B/C, 106 bitiş
const P = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

// Metni Code 128 değerlerine çevirir: tamamı rakamsa C kümesi (yoğun), değilse B kümesi
export function code128Values(text) {
  text = String(text).replace(/[^\x20-\x7e]/g, '');
  const vals = [];
  if (/^\d{4,}$/.test(text)) {
    vals.push(105);
    const even = text.length - (text.length % 2);
    for (let i = 0; i < even; i += 2) vals.push(Number(text.slice(i, i + 2)));
    if (even < text.length) { vals.push(100); vals.push(text.charCodeAt(even) - 32); }
  } else {
    vals.push(104);
    for (const c of text) vals.push(c.charCodeAt(0) - 32);
  }
  let sum = vals[0];
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103, 106);
  return vals;
}
// 1 = çubuk, 0 = boşluk (modül dizisi)
export function code128Modules(text) {
  let out = '';
  for (const v of code128Values(text)) {
    const w = P[v];
    for (let i = 0; i < w.length; i++) out += (i % 2 ? '0' : '1').repeat(Number(w[i]));
  }
  return out;
}
export function barcodeSvg(text) {
  const m = '0'.repeat(10) + code128Modules(text) + '0'.repeat(10);
  let d = '';
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== '1') continue;
    let j = i;
    while (m[j + 1] === '1') j++;
    d += `M${i},0h${j - i + 1}v40h-${j - i + 1}z`;
    i = j;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.length} 40" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
}

// Etiket HTML'i (bir paket)
export function labelHtml(order, pkg, total, sender = {}) {
  const a = order.address || {};
  // Çok paketli siparişte her paket kendi takip numarasını kullanır (siparişin numarası başka pakete ait olabilir)
  // Kanalın kargo barkodu (ikas Kargo barkodu / HB barkodu) önceliklidir; yoksa takip numarası
  const tn = pkg.barcode || pkg.tracking || (total <= 1 ? order.tracking : '');
  const code = tn || `${order.order_number}-${pkg.no || 1}`;
  const internal = !tn;
  const lines = (pkg.items || []).map((x) => {
    const it = order.items.find((i) => String(i.line_id) === String(x.line_id)) || {};
    return `<div><b>${esc(x.qty)}×</b><span>${esc(it.product_name || it.name || x.line_id)}${it.sku ? ` <small>(${esc(it.sku)})</small>` : ''}</span></div>`;
  }).join('');
  const desi = pkg.desi || '';
  return `<section class="slabel">
    <div class="lb-top">
      <div><div class="lb-ch">${esc(ch(order.channel).name)}</div><div>Sipariş: <b>${esc(order.order_number)}</b></div><div>${esc(new Date(order.ordered_at).toLocaleDateString('tr-TR'))}</div></div>
      <div class="lb-pkg">${esc(pkg.no || 1)}/${esc(total)}</div>
    </div>
    <div>
      <div class="lb-to">ALICI</div>
      <div class="lb-name">${esc(a.name || order.customer)}</div>
      <div class="lb-addr">${esc(a.line || '')}</div>
      <div class="lb-city">${esc([a.district, a.city].filter(Boolean).join(' / '))}</div>
      <div>${esc(a.phone || order.phone || '')}</div>
    </div>
    <div class="lb-bar">${barcodeSvg(code)}<div class="code">${esc(code)}</div>${internal ? '<div style="font-size:7pt">İç barkod — kargo takip no girilmedi</div>' : ''}</div>
    <div class="lb-meta"><span>${esc(pkg.cargo_company || order.cargo_company || '')}</span><span>${desi ? `Desi: ${esc(desi)}` : ''}</span></div>
    <div class="lb-items">${lines}</div>
    <div class="lb-from"><b>GÖNDEREN:</b> ${esc(sender.name || '')} ${esc(sender.phone || '')}<br>${esc([sender.address, sender.city].filter(Boolean).join(' '))}</div>
  </section>`;
}

// Yazdırma penceresi kapanınca çözülür (yazdırılıp yazdırılmadığını tarayıcı bildirmez; kullanıcıya sorulur)
function printHtml(markup) {
  const box = document.getElementById('print');
  box.innerHTML = markup;
  return new Promise((resolve) => {
    const clear = () => { box.innerHTML = ''; window.removeEventListener('afterprint', clear); resolve(); };
    window.addEventListener('afterprint', clear);
    setTimeout(() => window.print(), 50);
  });
}
// Panel etiketleri: [{ order, pkg }] (her paket ayrı sayfa)
export const printLabels = (list, sender) => printHtml(list.map(({ order, pkg }) => labelHtml(order, pkg, order.packages.length || 1, sender)).join(''));
// Kanalın verdiği etiket görseli (ikas Kargo PNG/JPG)
export const printImages = (list) => printHtml(list.map((x) => `<section class="slabel img"><img src="data:image/${x.format === 'jpg' ? 'jpeg' : x.format};base64,${x.data}" alt=""></section>`).join(''));

export function downloadFile(name, data, type) {
  const blob = type === 'application/pdf' ? new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type }) : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const totalOf = (order) => money(order.total);
