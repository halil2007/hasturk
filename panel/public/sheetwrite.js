// Excel (.xlsx) ve CSV yazıcı — dış kütüphane yok (tarayıcı ve Node'da çalışır; sıkıştırma CompressionStream('deflate-raw')).
//  patchXlsx: pazaryerinden indirilen dosyanın kendisini düzenler: aynı sayfa, aynı sütunlar, başlık satırı ve satır sırası korunur;
//             yalnız verilen hücreler değişir (gerekirse en sağa yeni sütun). Değişmeyen arşiv dosyaları olduğu gibi (yeniden
//             sıkıştırılmadan) kopyalanır, böylece biçim / stil / diğer sayfalar bozulmaz.
//  buildXlsx: sıfırdan tek sayfalık basit çalışma kitabı (örnek dosya, kayıtlı dosyası olmayan liste).
//  buildCsv:  aynı ayırıcıyla, UTF-8 BOM'lu CSV (Excel Türkçe karakterleri doğru açsın).
import { unzip, firstSheet, xmlAttr, colIdx, ROW_RE, CELL_RE } from './sheetread.js';

const enc = new TextEncoder();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
export const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// ---- zip ----
let CRC = null;
export function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const dosTime = (d = new Date()) => [(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()];

// entries: [{ name, data: Uint8Array | string }] (yeni / değişen) ya da { name, raw, crc, size, usize, method, time, date } (olduğu gibi kopyalanır)
export async function zip(entries) {
  const [t0, d0] = dosTime();
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    let raw, crc, size, usize, method, time = e.time ?? t0, date = e.date ?? d0;
    if (e.raw) ({ raw, crc, size, usize, method } = e);
    else {
      const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
      crc = crc32(data); usize = data.length;
      const z = await deflate(data);
      if (z && z.length < data.length) { raw = z; method = 8; } else { raw = data; method = 0; }
      size = raw.length;
    }
    const name = enc.encode(e.name), flags = /[^\x20-\x7e]/.test(e.name) ? 0x800 : 0;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, flags, true); h.setUint16(8, method, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, usize, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, raw);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, method, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, usize, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + raw.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

// ---- hücre ----
const cellXml = (ref, v, s) => {
  const st = s != null ? ` s="${s}"` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
};

// Mevcut xlsx'te hücre yaz. cells: [{ r: satır no (1'den), c: sütun sırası (0'dan), v: sayı | metin }]
// headerRow verilirse yeni hücreye aynı sütunun veri satırlarındaki stil (ör. metin biçimi) verilir.
export async function patchXlsx(buf, cells, { headerRow = 1 } = {}) {
  const z = await unzip(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
  const sheet = await firstSheet(z);
  let xml = await z.read(sheet);
  if (xml == null) throw new Error('Excel sayfası bulunamadı');
  const byRow = new Map();
  for (const x of cells) { if (!byRow.has(x.r)) byRow.set(x.r, new Map()); byRow.get(x.r).set(x.c, x.v); }
  let maxR = 0, maxC = 0, formula = false;
  const colStyle = new Map();
  // Satırlar (konum, numara) ve sütun başına ilk veri satırı stili
  const rows = [];
  let last = 0;
  for (const m of xml.matchAll(ROW_RE())) {
    const r = Number(xmlAttr(m[1], 'r')) || last + 1;
    last = r; maxR = Math.max(maxR, r);
    rows.push({ r, start: m.index, end: m.index + m[0].length, attrs: m[1], body: m[2] || '' });
    let ci = -1;
    for (const cm of (m[2] || '').matchAll(CELL_RE())) {
      const ref = xmlAttr(cm[1], 'r'); ci = ref ? colIdx(ref) : ci + 1; maxC = Math.max(maxC, ci);
      const s = xmlAttr(cm[1], 's');
      if (r > headerRow && s != null && !colStyle.has(ci)) colStyle.set(ci, s);
    }
  }
  const rowXml = (r, attrs, body) => {
    const want = byRow.get(r), list = [];
    let ci = -1;
    for (const cm of body.matchAll(CELL_RE())) { const ref = xmlAttr(cm[1], 'r'); ci = ref ? colIdx(ref) : ci + 1; list.push({ c: ci, xml: cm[0], attrs: cm[1], body: cm[2] || '' }); }
    for (const [c, v] of want) {
      maxC = Math.max(maxC, c);
      const ref = colName(c) + r, i = list.findIndex((x) => x.c === c);
      if (i >= 0) {
        if (/<(?:\w+:)?f\b/.test(list[i].body)) formula = true;
        list[i] = { c, xml: cellXml(ref, v, xmlAttr(list[i].attrs, 's')) };
      } else {
        const at = list.findIndex((x) => x.c > c);
        const x = { c, xml: cellXml(ref, v, r === headerRow ? null : colStyle.get(c)) };
        if (at < 0) list.push(x); else list.splice(at, 0, x);
      }
    }
    // spans (satırdaki sütun aralığı ipucu) yeni sütunla tutmayabilir: kaldırılır
    const a = (attrs || '').replace(/\s+spans="[^"]*"/, '');
    return `<row${/\br="/.test(a) ? a : ` r="${r}"${a}`}>${list.map((x) => x.xml).join('')}</row>`;
  };
  // Sondan başa: konumlar kaymasın
  const pending = new Set(byRow.keys());
  let out = xml;
  for (let i = rows.length - 1; i >= 0; i--) {
    const x = rows[i];
    if (!byRow.has(x.r)) continue;
    pending.delete(x.r);
    out = out.slice(0, x.start) + rowXml(x.r, x.attrs, x.body) + out.slice(x.end);
  }
  // Sayfada olmayan satırlar: sıraya göre eklenir
  for (const r of [...pending].sort((a, b) => a - b)) {
    maxR = Math.max(maxR, r);
    const nx = [...out.matchAll(ROW_RE())].find((m) => (Number(xmlAttr(m[1], 'r')) || 0) > r);
    const add = rowXml(r, '', '');
    if (nx) out = out.slice(0, nx.index) + add + out.slice(nx.index);
    else if (/<(?:\w+:)?sheetData\s*\/>/.test(out)) out = out.replace(/<((?:\w+:)?)sheetData\s*\/>/, (m, p) => `<${p}sheetData>${add}</${p}sheetData>`);
    else out = out.replace(/<\/((?:\w+:)?)sheetData>/, (m) => add + m);
  }
  out = out.replace(/(<(?:\w+:)?dimension\b[^>]*\bref=")[^"]*(")/, (m, a, b) => `${a}A1:${colName(maxC)}${maxR}${b}`);
  const changed = new Map([[sheet, out]]);
  const drop = new Set();
  // Formül hücresinin üzerine yazıldıysa hesap zinciri (calcChain) kaldırılır; Excel açılışta yeniden kurar ("onarım" uyarısı çıkmaz)
  if (formula && z.files['xl/calcChain.xml']) {
    drop.add('xl/calcChain.xml');
    const ct = await z.read('[Content_Types].xml'), rel = await z.read('xl/_rels/workbook.xml.rels');
    if (ct) changed.set('[Content_Types].xml', ct.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
    if (rel) changed.set('xl/_rels/workbook.xml.rels', rel.replace(/<Relationship\b[^>]*Target="[^"]*calcChain\.xml"[^>]*\/>/, ''));
  }
  const entries = z.list.filter((f) => !drop.has(f.name)).map((f) => (changed.has(f.name) ? { name: f.name, data: changed.get(f.name), time: f.time, date: f.date } : f));
  return zip(entries);
}

// Sıfırdan tek sayfalık çalışma kitabı. rows: [[hücre…]…] (ilk satır başlık, kalın). Sayı → sayı hücresi, diğerleri metin.
export async function buildXlsx(rows, { sheetName = 'Sayfa1' } = {}) {
  const maxC = Math.max(1, ...rows.map((r) => r.length));
  const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, c) => (v === '' || v == null ? '' : cellXml(colName(c) + (i + 1), v, i === 0 ? 1 : null))).join('')}</row>`).join('');
  const NS = 'http://schemas.openxmlformats.org';
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}/spreadsheetml/2006/main"><dimension ref="A1:${colName(maxC - 1)}${Math.max(1, rows.length)}"/><sheetData>${data}</sheetData></worksheet>` },
  ]);
}

// CSV (UTF-8 BOM, CRLF). rows: [[hücre…]…]
export function buildCsv(rows, sep = ';') {
  const q = (v) => { const s = String(v ?? ''); return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n';
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Tarayıcıda dosyayı indir
export function saveFile(data, name, type = XLSX_TYPE) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
