// Kargo etiketi: 100×150 mm termal/ofis yazıcısı için yazdırılabilir etiket + Code 128 barkod.
// Pazaryerinin resmi etiketi (ZPL/PDF) varsa ayrıca indirilebilir; panel etiketi her kanalda çalışır.
import { esc, ch, money, state, sheet, html } from './core.js';

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

// Kanal işaretleri (termal yazıcıda net basılması için siyah-beyaz yazı işaret)
const MARK = { ikas: 'ikas', trendyol: 'trendyol', hepsiburada: 'hepsiburada', pttavm: 'PttAVM', n11: 'n11', idefix: 'idefix', pazarama: 'pazarama', amazon: 'amazon', ciceksepeti: 'çiçeksepeti', koctas: 'Koçtaş', shopify: 'shopify', woocommerce: 'woocommerce', opencart: 'OpenCart', etsy: 'Etsy', teknosa: 'Teknosa', boyner: 'Boyner', pasaj: 'Turkcell Pasaj', trendyolgo: 'Trendyol Go', getir: 'Getir Çarşı', yemeksepeti: 'Yemeksepeti Market', ebay: 'eBay', ozon: 'Ozon', ticimax: 'Ticimax', ideasoft: 'IdeaSoft', tsoft: 'T-Soft' };
// Gönderinin yapıldığı gerçek kargo anlaşması → etikete yazılan ifade
export const AGREEMENT = {
  ikas: 'ikas Kargo anlaşmalı gönderi', trendyol: 'Trendyol anlaşmalı gönderi', hepsiburada: 'Hepsiburada anlaşmalı gönderi', pttavm: 'PttAVM anlaşmalı gönderi',
  n11: 'N11 anlaşmalı gönderi', idefix: 'idefix anlaşmalı gönderi', pazarama: 'Pazarama anlaşmalı gönderi', ciceksepeti: 'Çiçeksepeti anlaşmalı gönderi', own: 'Satıcı anlaşmalı gönderi',
};
// Kargo entegratörü gönderisi (bizim tasarımda): etiketin işareti ve anlaşma ifadesi; barkod kargo firmasının (Sürat, Aras…) barkodu
const CARRIER_MARK = { kargonomi: ['kargonomi', 'Kargonomi anlaşmalı gönderi'] };
const MARKETPLACES = ['trendyol', 'hepsiburada', 'pttavm', 'n11', 'idefix', 'pazarama', 'ciceksepeti'];
// Anlaşma: pakete kaydedilen (ikas Kargo işlediyse 'ikas', kendi anlaşmanızsa 'own'); yoksa pazaryeri barkodu o pazaryerinin anlaşmasıdır
export function agreementOf(order, pkg) {
  if (pkg.agreement) return pkg.agreement;
  const t = ch(order.channel).type || order.channel;
  return MARKETPLACES.includes(t) && (pkg.barcode || pkg.tracking) ? t : null;
}

// Etiket boyutları (Ayarlar → Kargo etiketi): 100×150 mm termal, A5, A4
export const LABEL_SIZES = { '100x150': ['100mm', '150mm'], a5: ['148mm', '210mm'], a4: ['210mm', '297mm'] };
const labelSize = () => (LABEL_SIZES[state.settings && state.settings.label_size] ? state.settings.label_size : '100x150');
const fmtMoney = (v) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(v) || 0);

// Etiket verisi (bir paket): HTML etiket ve PDF etiket (labelpdf.js) aynı bilgiyi kullanır.
// Çok paketli siparişte her paket kendi takip numarasını kullanır (siparişin numarası başka pakete ait olabilir);
// kanalın kargo barkodu (ikas Kargo barkodu / HB barkodu) önceliklidir, yoksa takip numarası
export function labelData(order, pkg, total, sender = {}) {
  const a = order.address || {};
  const tn = pkg.barcode || pkg.tracking || (total <= 1 ? order.tracking : '');
  const code = tn || `${order.order_number}-${pkg.no || 1}`;
  const internal = !tn;
  const rows = (pkg.items || []).map((x) => {
    const it = order.items.find((i) => String(i.line_id) === String(x.line_id)) || {};
    const unit = Number(it.quantity) ? (Number(it.total) || 0) / Number(it.quantity) : 0;
    return { qty: x.qty, name: String(it.product_variant && it.product_group ? it.product_group : it.product_name || it.name || x.line_id), variant: it.product_variant || '', sku: it.sku || '',
      price: unit ? fmtMoney(unit * (Number(x.qty) || 0)) : '' };
  });
  const c = ch(order.channel), type = c.type || order.channel;
  const agr = internal ? null : agreementOf(order, pkg), cm = !internal && CARRIER_MARK[pkg.carrier_provider];
  return {
    code, internal, track: pkg.tracking && pkg.tracking !== code ? pkg.tracking : '', rows, qty: (pkg.items || []).reduce((n, x) => n + (Number(x.qty) || 0), 0),
    type: cm ? pkg.carrier_provider : type, mark: cm ? cm[0] : MARK[type] || c.name, platform: c.name, agreement: cm ? cm[1] : agr ? AGREEMENT[agr] || '' : '',
    cargo: pkg.cargo_company || order.cargo_company || '',
    pkgText: `${pkg.no || 1}/${total}`, orderNo: order.order_number, date: new Date(order.ordered_at).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
    // Firma logosunu yüklediyse etikette onun logosu, yoksa Hastürk logosu (panel ekranlarındaki logo değişmez)
    logo: (state.settings && state.settings.logo) || 'logo.webp',
    sender: { name: sender.name || '', phone: sender.phone || '', address: [sender.address, sender.city].filter(Boolean).join(' ') },
    to: { name: a.name || order.customer || '', phone: a.phone || order.phone || '', line: a.line || '', city: [a.district, a.city].filter(Boolean).join(' / ') },
  };
}
export const INTERNAL_WARN = 'İç barkod — kargo takip numarası yok, kargo firması bu barkodu okutmaz';

// Etiket HTML'i (bir paket). Düzen: logolar → kargo firması ve anlaşma → gerçek kargo barkodu → sipariş / alıcı bilgileri → ürünler.
export function labelHtml(order, pkg, total, sender = {}) {
  const d = labelData(order, pkg, total, sender), size = labelSize();
  const rows = d.rows.map((r) => `<tr><td class="q">${esc(r.qty)}×</td><td><div class="n">${esc(r.name)}</div>${r.variant ? `<span class="v">${esc(r.variant)}</span>` : ''}${r.sku ? `<span class="s">${esc(r.sku)}</span>` : ''}</td><td class="p">${esc(r.price)}</td></tr>`).join('');
  return `<section class="slabel s-${size}">
    <header class="lb-hd"><img class="lb-logo" src="${esc(d.logo)}" alt=""><span class="lb-mark ${esc(d.type)}">${esc(d.mark)}</span></header>
    <div class="lb-cargo"><div><b>${esc(d.cargo || 'Kargo firması belirtilmedi')}</b>${d.agreement ? `<span class="lb-agr">${esc(d.agreement)}</span>` : ''}</div><div class="lb-pkg" title="Paket">${esc(d.pkgText)}</div></div>
    <div class="lb-main">
      <div class="lb-bar">${barcodeSvg(d.code)}<div class="code">${esc(d.code)}</div>${d.internal ? `<div class="warn">${INTERNAL_WARN}</div>` : ''}</div>
      <div class="lb-info">
        <dl>
          <dt>Sipariş No</dt><dd><b>${esc(d.orderNo)}</b></dd>
          <dt>Platform</dt><dd>${esc(d.platform)}</dd>
          ${d.track ? `<dt>Takip No</dt><dd>${esc(d.track)}</dd>` : ''}
          <dt>Tarih</dt><dd>${esc(d.date)}</dd>
          <dt>Gönderen</dt><dd>${esc(d.sender.name)}${d.sender.phone ? ` · ${esc(d.sender.phone)}` : ''}</dd>
        </dl>
        <div class="lb-to">
          <div class="lbl">ALICI</div>
          <div class="nm">${esc(d.to.name)}</div>
          <div class="ph">${esc(d.to.phone)}</div>
          <div class="ad">${esc(d.to.line)}</div>
          <div class="ct">${esc(d.to.city)}</div>
        </div>
      </div>
    </div>
    <table class="lb-items"><thead><tr><th colspan="2">Ürünler (${esc(d.qty)} adet)</th><th class="p">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
    <footer class="lb-from"><b>GÖNDEREN:</b> ${esc(d.sender.name)} ${esc(d.sender.phone)} · ${esc(d.sender.address)}</footer>
  </section>`;
}

// Yazdırma penceresi kapanınca çözülür (yazdırılıp yazdırılmadığını tarayıcı bildirmez; kullanıcıya sorulur)
function printHtml(markup, size = labelSize()) {
  const box = document.getElementById('print');
  const [w, h] = LABEL_SIZES[size] || LABEL_SIZES['100x150'];
  box.innerHTML = `<style>@page { size: ${w} ${h}; margin: 0; }</style>` + markup;
  return new Promise((resolve) => {
    const clear = () => { box.innerHTML = ''; window.removeEventListener('afterprint', clear); resolve(); };
    window.addEventListener('afterprint', clear);
    // Logolar yüklenmeden yazdırılmasın (en fazla 2 sn beklenir)
    const imgs = [...box.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; })));
    Promise.race([Promise.all(imgs), new Promise((ok) => setTimeout(ok, 2000))]).then(() => setTimeout(() => window.print(), 50));
  });
}
// iPhone / iPad: Safari yazdırırken sayfa altına adres, tarih ve sayfa numarası ekler (kapatılamaz); bu cihazlarda etiket PDF
// olarak hazırlanır (bkz. labelpdf.js) ve paylaşım menüsünden yazdırılır. Pencere kapanınca çözülür.
export const needsPdf = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
async function printPdf(labels, size, images = [], name = 'etiket') {
  const { labelsPdf } = await import('./labelpdf.js');
  const blob = await labelsPdf(labels, size, images);
  const file = new File([blob], `${String(name).replace(/[^\w.-]+/g, '-')}.pdf`, { type: 'application/pdf' });
  return new Promise((resolve) => {
    const s = sheet({
      title: 'Etiket hazır', size: 'narrow', onClose: resolve,
      body: html`<p style="margin:0">Etiket PDF olarak hazırlandı (${labels.length + images.length} sayfa). “Yazdır”a basın, açılan menüden <b>Yazdır</b>'ı seçin.</p>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Kapat</button><button class="btn primary" data-share><i class="ico ico-print"></i> Yazdır</button>`,
    });
    s.el.querySelector('[data-share]').onclick = async () => {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); s.close(); } catch { /* vazgeçildi */ }
      } else { window.open(URL.createObjectURL(blob), '_blank'); s.close(); }
    };
  });
}
// Panel etiketleri: [{ order, pkg }] (her paket ayrı sayfa)
export const printLabels = (list, sender) => (needsPdf()
  ? printPdf(list.map(({ order, pkg }) => labelData(order, pkg, order.packages.length || 1, sender)), labelSize(), [], list.length === 1 ? `etiket-${list[0].order.order_number}` : 'etiketler')
  : printHtml(list.map(({ order, pkg }) => labelHtml(order, pkg, order.packages.length || 1, sender)).join('')));
// Kanalın verdiği etiket görseli (ikas Kargo PNG/JPG)
// Görsel verisi yalnız base64 karakterleri ve bilinen biçim olabilir (kanaldan gelen veri HTML'e karışmasın)
const imgSrc = (x) => `data:image/${({ jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp' })[x.format] || 'png'};base64,${String(x.data).replace(/\s+/g, '')}`;
export const printImages = (list) => {
  const ok = list.filter((x) => /^[A-Za-z0-9+/=\s]+$/.test(String(x.data || '')));
  return needsPdf() ? printPdf([], '100x150', ok.map(imgSrc)) : printHtml(ok.map((x) => `<section class="slabel img s-100x150"><img src="${imgSrc(x)}" alt=""></section>`).join(''), '100x150');
};

export function downloadFile(name, data, type) {
  const blob = type === 'application/pdf' ? new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type }) : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const totalOf = (order) => money(order.total);
