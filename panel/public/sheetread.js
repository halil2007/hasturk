// Excel (.xlsx) ve CSV dosyasını tarayıcıda okur → [{ başlık: değer }]. Dış kütüphane yok: .xlsx bir zip arşividir,
// tarayıcının yerleşik DecompressionStream'i ile açılır; ilk sayfa okunur. CSV'de ayırıcı (; , sekme) kendiliğinden bulunur.

export async function readSheet(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const rows = buf[0] === 0x50 && buf[1] === 0x4b ? await xlsxRows(buf) : csvRows(new TextDecoder('utf-8').decode(buf));
  return toObjects(rows);
}

function toObjects(rows) {
  const clean = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!clean.length) return [];
  const head = clean[0].map((h) => String(h ?? '').replace(/^﻿/, '').trim());
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h || `Sütun ${i + 1}`, r[i] == null ? '' : String(r[i]).trim()])));
}

export function csvRows(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = [';', '\t', ','].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
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

// ---- xlsx (zip) ----
async function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Excel dosyası okunamadı (zip yapısı bulunamadı)');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    files[name] = { method, size, off };
    p += 46 + nameLen + extra + comment;
  }
  const read = async (name) => {
    const f = files[name];
    if (!f) return null;
    const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const data = buf.subarray(start, start + f.size);
    if (f.method === 0) return new TextDecoder().decode(data);
    if (f.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Bu tarayıcı Excel dosyasını açamıyor; dosyayı CSV olarak kaydedip yükleyin');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
  return { files, read };
}

async function xlsxRows(buf) {
  const z = await unzip(buf);
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const strings = [];
  const ss = await z.read('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) strings.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
  // İlk sayfa: çalışma kitabındaki ilk sheet'in dosyası (yoksa sheet1.xml)
  let sheet = 'xl/worksheets/sheet1.xml';
  try {
    const wb = xml(await z.read('xl/workbook.xml')), rels = xml(await z.read('xl/_rels/workbook.xml.rels'));
    const rid = wb.getElementsByTagName('sheet')[0].getAttribute('r:id');
    const target = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid).getAttribute('Target');
    sheet = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  } catch { /* varsayılan sayfa */ }
  const doc = xml(await z.read(sheet) || '');
  const colIdx = (ref) => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
  const out = [];
  for (const r of doc.getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      let val = v ? v.textContent : '';
      if (t === 's') val = strings[Number(val)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (t === 'b') val = val === '1' ? 'DOĞRU' : 'YANLIŞ';
      else if (val !== '' && !t && /^-?\d+(\.\d+)?(E-?\d+)?$/i.test(val)) { const num = Number(val); val = Number.isInteger(num) && Math.abs(num) >= 1e11 ? BigInt(Math.round(num)).toString() : String(num); }
      row[colIdx(c.getAttribute('r') || '')] = val;
    }
    out.push(Array.from(row, (x) => x ?? ''));
  }
  return out;
}
