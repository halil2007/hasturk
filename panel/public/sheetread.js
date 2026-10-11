// Excel (.xlsx) ve CSV dosyasını okur → [{ başlık: değer }]. Dış kütüphane yok: .xlsx bir zip arşividir,
// yerleşik DecompressionStream ile açılır; ilk sayfa okunur. CSV'de ayırıcı (; , sekme) kendiliğinden bulunur.
// XML, DOMParser yerine küçük düzenli ifadelerle okunur: aynı kod tarayıcıda ve Node'da (testler) çalışır.
// readGrid: satırları sayfadaki gerçek satır numarasıyla verir (Excel'i aynı yapıda geri yazmak için; bkz. sheetwrite.js).

export async function readSheet(file) {
  const g = await readGrid(file);
  return toObjects(g.rows.map((r) => r.cells));
}

// Dosya → { type: 'xlsx' | 'csv', rows: [{ r: sayfa satır no (1'den), cells: [metin], types: ['s' | 'n' | ''] }], sep, sheet }
export async function readGrid(file) {
  const buf = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const { rows, sheet } = await xlsxGrid(buf);
    return { type: 'xlsx', rows, sheet };
  }
  const text = new TextDecoder('utf-8').decode(buf);
  const sep = csvSep(text);
  return { type: 'csv', sep, rows: csvRows(text).map((cells, i) => ({ r: i + 1, cells, types: cells.map(() => 's') })) };
}

function toObjects(rows) {
  const clean = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!clean.length) return [];
  const head = clean[0].map((h) => String(h ?? '').replace(/^﻿/, '').trim());
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h || `Sütun ${i + 1}`, r[i] == null ? '' : String(r[i]).trim()])));
}

const csvSep = (text) => { const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || ''; return [';', '\t', ','].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0]; };
export function csvRows(text) {
  text = text.replace(/^﻿/, '');
  const sep = csvSep(text);
  const out = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out;
}

// ---- küçük XML yardımcıları ----
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const xmlText = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()]));
export const xmlAttr = (attrs, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs || ''); return m ? xmlText(m[1]) : null; };
// Metin parçaları (<t>); fonetik okunuşlar (<rPh>) hariç
const runs = (s) => { let out = ''; const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g; let m; s = s.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, ''); while ((m = re.exec(s))) out += xmlText(m[1]); return out; };
export const ROW_RE = () => /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
export const CELL_RE = () => /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
export const colIdx = (ref) => { let n = 0; for (const c of String(ref).replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

// ---- xlsx (zip) ----
// Arşivdeki dosyalar (sıkıştırılmış hâli, CRC ve boyutlarıyla: değişmeyen dosya yeniden sıkıştırılmadan yazılabilir)
export async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Excel dosyası okunamadı (zip yapısı bulunamadı)');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {}, list = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Excel dosyası okunamadı (bozuk zip dizini)');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const f = { name, flags, method, time, date, crc, size, usize, off, raw: buf.subarray(start, start + size) };
    files[name] = f; list.push(f);
    p += 46 + nameLen + extra + comment;
  }
  const bytes = async (name) => {
    const f = files[name];
    if (!f) return null;
    if (f.method === 0) return f.raw;
    if (f.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Bu tarayıcı Excel dosyasını açamıyor; dosyayı CSV olarak kaydedip yükleyin');
    const stream = new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  const read = async (name) => { const b = await bytes(name); return b == null ? null : new TextDecoder().decode(b); };
  return { files, list, bytes, read };
}

// Çalışma kitabındaki ilk sayfanın dosya yolu (yoksa sheet1.xml)
export async function firstSheet(z) {
  try {
    const wb = await z.read('xl/workbook.xml'), rels = await z.read('xl/_rels/workbook.xml.rels');
    const sh = /<(?:\w+:)?sheet\b([^>]*?)\/?>/.exec(wb);
    const rid = sh && (/\br:id="([^"]*)"/.exec(sh[1]) || /\b\w+:id="([^"]*)"/.exec(sh[1]));
    let target = null;
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) if (xmlAttr(m[1], 'Id') === rid[1]) target = xmlAttr(m[1], 'Target');
    if (target) return target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  } catch { /* varsayılan sayfa */ }
  return 'xl/worksheets/sheet1.xml';
}

async function xlsxGrid(buf) {
  const z = await unzip(buf);
  const strings = [];
  const ss = await z.read('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g)) strings.push(m[1] ? runs(m[1]) : '');
  const sheet = await firstSheet(z);
  const xml = (await z.read(sheet)) || '';
  const out = [];
  let last = 0;
  for (const rm of xml.matchAll(ROW_RE())) {
    const rn = Number(xmlAttr(rm[1], 'r')) || last + 1;
    last = rn;
    const cells = [], types = [];
    let ci = -1;
    for (const cm of (rm[2] || '').matchAll(CELL_RE())) {
      const ref = xmlAttr(cm[1], 'r');
      ci = ref ? colIdx(ref) : ci + 1;
      const t = xmlAttr(cm[1], 't'), body = cm[2] || '';
      const vm = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body);
      let val = vm ? xmlText(vm[1]) : '', type = 's';
      if (t === 's') val = strings[Number(val)] ?? '';
      else if (t === 'inlineStr') val = runs(body);
      else if (t === 'b') val = val === '1' ? 'DOĞRU' : 'YANLIŞ';
      else if (t === 'str' || t === 'e' || t === 'd') { /* metin olduğu gibi */ }
      else if (val !== '' && /^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(val)) { type = 'n'; const num = Number(val); val = Number.isInteger(num) && Math.abs(num) >= 1e11 ? BigInt(Math.round(num)).toString() : String(num); }
      cells[ci] = val; types[ci] = val === '' ? '' : type;
    }
    out.push({ r: rn, cells: Array.from(cells, (x) => x ?? ''), types: Array.from(types, (x) => x ?? '') });
  }
  return { rows: out, sheet };
}
