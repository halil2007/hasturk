// PDF kargo etiketi: iPhone / iPad'de Safari yazdırırken sayfanın altına adres, tarih ve sayfa numarası ekler (sayfadan
// kapatılamaz). Bu cihazlarda etiket tuvale çizilir (~300 dpi) ve tek sayfalık PDF olarak verilir; PDF yazdırılınca bu satır çıkmaz.
// Düzen HTML etiketle aynıdır (labels.js → labelData): A4 / A5'te etiket sayfanın en üstünde, 100×150'de tam sayfa.
import { code128Modules, INTERNAL_WARN } from './labels.js';

const K = 12; // piksel / mm (~305 dpi)
const PT = 0.3528; // 1 punto = 0,3528 mm
const FONT = 'Arial, Helvetica, sans-serif', MONO = 'Menlo, Consolas, "Courier New", monospace';

function loadImage(src) {
  return new Promise((ok) => {
    if (!src) return ok(null);
    const i = new Image();
    i.onload = () => ok(i); i.onerror = () => ok(null);
    i.src = src;
    setTimeout(() => ok(i.complete && i.naturalWidth ? i : null), 3000);
  });
}

// Tuval üzerinde mm birimiyle çizim
function pen(ctx) {
  const px = (v) => v * K;
  const font = (pt, w = 400, fam = FONT) => { ctx.font = `${w} ${px(pt * PT)}px ${fam}`; };
  const width = (t) => ctx.measureText(t).width / K;
  const text = (t, x, y, { pt = 10, w = 400, fam = FONT, align = 'left', color = '#000' } = {}) => {
    font(pt, w, fam); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, px(x), px(y));
  };
  // Satırlara böl (genişliği aşan kelime harf harf bölünür)
  const wrap = (t, maxW, pt = 10, w = 400) => {
    font(pt, w);
    const out = [];
    let line = '';
    for (const word of String(t || '').split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (width(tryLine) <= maxW) { line = tryLine; continue; }
      if (line) out.push(line);
      line = '';
      let part = '';
      for (const c of word) { if (width(part + c) > maxW && part) { out.push(part); part = c; } else part += c; }
      line = part;
    }
    if (line) out.push(line);
    return out.length ? out : [''];
  };
  const lines = (t, x, y, maxW, { pt = 10, w = 400, lh = 1.25, max = 4, align = 'left' } = {}) => {
    const ls = wrap(t, maxW, pt, w).slice(0, max);
    ls.forEach((l, i) => text(l, align === 'right' ? x + maxW : x, y + i * pt * PT * lh, { pt, w, align }));
    return ls.length * pt * PT * lh;
  };
  const hline = (x1, x2, y, t = 0.3, color = '#000') => { ctx.fillStyle = color; ctx.fillRect(px(x1), px(y - t / 2), px(x2 - x1), Math.max(1, px(t))); };
  const box = (x, y, w, h, t = 0.4, r = 1) => {
    ctx.lineWidth = px(t); ctx.strokeStyle = '#000';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px(x), px(y), px(w), px(h), px(r)); else ctx.rect(px(x), px(y), px(w), px(h));
    ctx.stroke();
  };
  // Code 128: çubuklar tam piksel genişliğinde (okuyucu net görsün), alan içinde ortalı
  const barcode = (code, x, y, w, h) => {
    const m = code128Modules(code), q = 10, mod = Math.max(1, Math.floor(px(w) / (m.length + 2 * q)));
    const total = (m.length + 2 * q) * mod, x0 = Math.round(px(x) + (px(w) - total) / 2) + q * mod;
    ctx.fillStyle = '#000';
    for (let i = 0; i < m.length; i++) {
      if (m[i] !== '1') continue;
      let j = i;
      while (m[j + 1] === '1') j++;
      ctx.fillRect(x0 + i * mod, Math.round(px(y)), (j - i + 1) * mod, Math.round(px(h)));
      i = j;
    }
  };
  return { text, lines, wrap, width, font, hline, box, barcode, px };
}

// Bir etiketi çiz: { canvas, hmm (çizilen yükseklik, mm) }
async function drawLabel(d, size) {
  const big = size !== '100x150';
  const W = size === 'a4' ? 210 : size === 'a5' ? 148 : 100, P = size === 'a4' ? 8 : size === 'a5' ? 7 : 4.5, f = size === 'a4' ? 1 : size === 'a5' ? 0.95 : 0.9;
  const maxH = big ? 297 : 150;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * K); canvas.height = Math.round(maxH * K);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const g = pen(ctx), R = W - P, CW = W - 2 * P;
  let y = P;

  // Üst: logo ve kanal işareti
  const logo = await loadImage(d.logo);
  const lh = (big ? 14 : 10) * f;
  let logoH = 0;
  if (logo) {
    const ratio = logo.naturalWidth / logo.naturalHeight || 3, w = Math.min((big ? 65 : 46) * f, lh * ratio), h = w / ratio;
    ctx.drawImage(logo, g.px(P), g.px(y), g.px(w), g.px(h)); logoH = h;
  }
  const mpt = (big ? 13 : 12) * f;
  g.font(mpt, 900);
  const mw = g.width(d.mark) + 5, mh = mpt * PT + 3;
  const my = y + Math.max(0, (Math.max(logoH, mh) - mh) / 2);
  g.box(R - mw, my, mw, mh, 0.6, 2);
  g.text(d.mark, R - mw / 2, my + mh / 2 + mpt * PT * 0.36, { pt: mpt, w: 900, align: 'center' });
  y += Math.max(logoH, mh) + 2;
  g.hline(P, R, y, 0.4);
  y += 3;

  // Kargo firması, anlaşma, paket no
  const cpt = 15 * f, ppt = 18 * f;
  g.font(ppt, 900);
  const pw = g.width(d.pkgText) + 4, ph = ppt * PT + 1.6;
  g.box(R - pw, y, pw, ph, 0.7, 0);
  g.text(d.pkgText, R - pw / 2, y + ph / 2 + ppt * PT * 0.36, { pt: ppt, w: 900, align: 'center' });
  const ch = g.lines(d.cargo || 'Kargo firması belirtilmedi', P, y + cpt * PT * 0.85, CW - pw - 4, { pt: cpt, w: 900, lh: 1.1, max: 2 });
  let cy = y + ch;
  if (d.agreement) {
    const apt = 8.5 * f;
    g.font(apt, 700);
    const aw = g.width(d.agreement) + 3, ah = apt * PT + 1.4;
    g.box(P, cy + 0.5, aw, ah, 0.35, 1);
    g.text(d.agreement, P + 1.5, cy + 0.5 + ah / 2 + apt * PT * 0.36, { pt: apt, w: 700 });
    cy += ah + 1;
  }
  y = Math.max(cy, y + ph) + 3;

  // Bilgi satırları ve alıcı
  const info = (x, y0, w) => {
    const dpt = (big ? 9 : 8.5) * f, step = dpt * PT * 1.45, lw = 18 * f;
    let yy = y0 + dpt * PT;
    const rows = [['Sipariş No', d.orderNo, 700], ['Platform', d.platform], ...(d.track ? [['Takip No', d.track]] : []), ['Tarih', d.date], ['Gönderen', `${d.sender.name}${d.sender.phone ? ` · ${d.sender.phone}` : ''}`]];
    for (const [k, v, wt] of rows) {
      g.text(k, x, yy, { pt: dpt, color: '#444' });
      const h = g.lines(v, x + lw, yy, w - lw, { pt: dpt, w: wt || 400, lh: 1.3, max: 2 });
      yy += Math.max(step, h + dpt * PT * 0.45);
    }
    return yy - dpt * PT * 0.6;
  };
  const recipient = (x, y0, w) => {
    let yy = y0;
    g.text('ALICI', x, yy + 7.5 * f * PT, { pt: 7.5 * f, w: 700 }); yy += 7.5 * f * PT + 1.6;
    yy += g.lines(d.to.name, x, yy + 13 * f * PT * 0.85, w, { pt: 13 * f, w: 900, lh: 1.15, max: 2 });
    if (d.to.phone) { g.text(d.to.phone, x, yy + 10 * f * PT * 0.9, { pt: 10 * f, w: 700 }); yy += 10 * f * PT * 1.25; }
    if (d.to.line) yy += g.lines(d.to.line, x, yy + 9 * f * PT * 0.9, w, { pt: 9 * f, lh: 1.25, max: 3 });
    if (d.to.city) yy += g.lines(d.to.city, x, yy + 12 * f * PT * 0.95, w, { pt: 12 * f, w: 900, lh: 1.15, max: 2 });
    return yy;
  };
  const bar = (x, y0, w, h) => {
    g.barcode(d.code, x, y0, w, h);
    let yy = y0 + h + 12 * f * PT * 1.05;
    g.text(d.code, x + w / 2, yy, { pt: 12 * f, w: 700, fam: MONO, align: 'center' });
    if (d.internal) yy += 1 + g.lines(INTERNAL_WARN, x, yy + 7 * PT * 1.2, w, { pt: 7, lh: 1.2, max: 2 });
    return yy + 1;
  };
  if (big) {
    // Solda bilgiler ve alıcı, sağda barkod
    const bw = CW * 0.46, lw = CW - bw - 6;
    const by = bar(R - bw, y, bw, 26 * f);
    let ly = info(P, y, lw);
    g.hline(P, P + lw, ly + 1.5, 0.3); ly += 3.5;
    ly = recipient(P, ly, lw);
    y = Math.max(ly, by) + 3;
  } else {
    // Barkod tam genişlik (üstü ve altı çizgili), altında iki sütun: bilgiler | alıcı
    g.hline(P, R, y, 0.5); y += 1.5;
    y = bar(P + 3, y, CW - 6, 24 * f) + 1;
    g.hline(P, R, y, 0.5); y += 2;
    const lw = CW * 0.47, rx = P + lw + 3, rw = CW - lw - 3;
    const ly = info(P, y, lw);
    const ry = recipient(rx + 2.5, y, rw - 2.5);
    ctx.fillStyle = '#000'; ctx.fillRect(g.px(rx), g.px(y), Math.max(1, g.px(0.4)), g.px(ry - y));
    y = Math.max(ly, ry) + 2;
  }

  // Ürünler
  const ipt = (big ? 10 : 8.5) * f, hpt = 7.5 * f, priceW = 22 * f, qW = 8 * f;
  g.text(`Ürünler (${d.qty} adet)`, P, y + hpt * PT, { pt: hpt, w: 700 });
  g.text('Tutar', R, y + hpt * PT, { pt: hpt, w: 700, align: 'right' });
  y += hpt * PT + 1; g.hline(P, R, y, 0.4); y += 1;
  const bottom = big ? maxH - P : maxH - P - 9;
  for (const r of d.rows) {
    if (y > bottom - 8) break;
    const top = y + ipt * PT;
    g.text(`${r.qty}×`, P, top, { pt: ipt * 1.05, w: 900 });
    if (r.price) g.text(r.price, R, top, { pt: ipt, align: 'right' });
    let yy = y + g.lines(r.name, P + qW, top, CW - qW - priceW - 2, { pt: ipt, w: 700, lh: 1.25, max: 3 });
    if (r.variant || r.sku) {
      let x = P + qW;
      const vpt = 8 * f;
      if (r.variant) {
        g.font(vpt, 700);
        const vw = g.width(r.variant) + 2.4, vh = vpt * PT + 1;
        g.box(x, yy + 0.4, vw, vh, 0.3, 1);
        g.text(r.variant, x + 1.2, yy + 0.4 + vh / 2 + vpt * PT * 0.36, { pt: vpt, w: 700 });
        x += vw + 1.5;
      }
      if (r.sku) g.text(r.sku, x, yy + 0.4 + vpt * PT * 0.95, { pt: 7 * f, color: '#333' });
      yy += vpt * PT + 2;
    }
    y = yy + 1;
    g.hline(P, R, y, 0.2, '#999');
    y += 1;
  }
  // 100×150: gönderen adresi etiketin altında (A4 / A5'te yok: çok siparişte yer kaplamasın)
  if (!big) {
    g.hline(P, R, maxH - P - 7, 0.3);
    g.lines(`GÖNDEREN: ${d.sender.name} ${d.sender.phone} · ${d.sender.address}`, P, maxH - P - 7 + 7.5 * PT + 1, CW, { pt: 7.5, lh: 1.2, max: 2 });
    y = maxH;
  }
  return { canvas, hmm: Math.min(maxH, y + P) };
}

// Görsel etiket (kanalın verdiği PNG / JPG): 100×150 sayfaya sığdırılır
async function drawImage(src) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = 100 * K; canvas.height = 150 * K;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (img) {
    const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (canvas.width - w) / 2, 0, w, h);
  }
  return { canvas, hmm: 150 };
}

// Tuval → JPEG baytları (yalnız çizilen yükseklik)
function jpegOf({ canvas, hmm }) {
  const h = Math.min(canvas.height, Math.ceil(hmm * K));
  let c = canvas;
  if (h < canvas.height) {
    c = document.createElement('canvas'); c.width = canvas.width; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0);
  }
  const b64 = c.toDataURL('image/jpeg', 0.95).split(',')[1];
  return { bytes: Uint8Array.from(atob(b64), (x) => x.charCodeAt(0)), w: c.width, h: c.height, hmm: h / K };
}

// En küçük PDF: her sayfada sayfanın üstüne yerleştirilmiş tek JPEG görsel
export function buildPdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, ...body) => { offs[n] = len; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };
  const mmPt = (v) => (v * 72 / 25.4).toFixed(2);
  push('%PDF-1.4\n');
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const n = 3 + i * 3, pw = mmPt(p.pageW), ph = mmPt(p.pageH), iw = mmPt(p.pageW), ih = mmPt(p.img.hmm), y = mmPt(p.pageH - p.img.hmm);
    const content = `q ${iw} 0 0 ${ih} 0 ${y} cm /Im0 Do Q`;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(n + 2, `<< /Type /XObject /Subtype /Image /Width ${p.img.w} /Height ${p.img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.img.bytes.length} >>\nstream\n`, p.img.bytes, '\nendstream');
  });
  const size = 3 + pages.length * 3, xref = len;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let i = 1; i < size; i++) push(`${String(offs[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

const PAGE = { a4: [210, 297], a5: [148, 210], '100x150': [100, 150] };
// labels: labelData() sonuçları; images: görsel adresleri (data:…). Sonuç: PDF Blob
export async function labelsPdf(labels, size, images = []) {
  const pages = [];
  for (const d of labels) pages.push({ pageW: PAGE[size][0], pageH: PAGE[size][1], img: jpegOf(await drawLabel(d, size)) });
  for (const src of images) pages.push({ pageW: 100, pageH: 150, img: jpegOf(await drawImage(src)) });
  return buildPdf(pages);
}
