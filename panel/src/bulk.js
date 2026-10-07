// Excel ile toplu güncelleme: ürün listesi Excel'e (CSV, Türkçe Excel'in açtığı biçimde) aktarılır, değiştirilip geri yüklenir.
// Güncellenebilen sütunlar: alış / satış fiyatı, stok, kritik stok, desi, KDV ve kanal fiyatları ("Fiyat: Trendyol" …).
// Satır panel ID'si, yoksa SKU, yoksa barkodla eşleşir. Boş hücre değişiklik sayılmaz. Önce önizleme döner, onaylanınca yazılır.
import { all, getSettings, log } from './db.js';
import { getChannels } from './channels/index.js';
import { catalogOf } from './sync.js';
import { chunk, str, fail } from './util.js';
import { norm } from './match.js';

const FIELDS = [
  ['purchase_price', 'Alış fiyatı'], ['sale_price', 'Satış fiyatı'], ['stock', 'Stok'], ['critical_stock', 'Kritik stok'], ['desi', 'Desi'], ['vat', 'KDV'],
];
const INT = new Set(['stock', 'critical_stock']);
const key = (s) => norm(s).replace(/[^a-z0-9]+/g, '');

// "1.250,50" · "1250,5" · "1250.5" · "₺1.250" → sayı; boş → null; okunamazsa NaN
export function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[\s₺]|tl$/gi, '').replace(/%/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.250 → bin ayırıcı
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
// Kontrol sütunu: dışa aktarma zamanı + her dolu hücrenin (alan:değer) kısa özeti. Geri yüklemede dokunulmamış hücre atlanır
// (bu arada otomatik fiyat / kur / satış değiştirdiyse geri alınmaz); değiştirilen stok hücresine dosyadan sonraki satışlar yansıtılır.
const CHECK = 'Kontrol (değiştirmeyin)';
const canon = (k, n) => `${k}:${INT.has(k) ? Math.round(n) : Math.round(n * 100)}`;
const h4 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 1679616).toString(36).padStart(4, '0'); };
function readCheck(v) {
  const m = /^([0-9a-z]+)\.([0-9a-z]*)$/.exec(str(v).trim());
  if (!m) return null;
  const at = parseInt(m[1], 36), set = new Set();
  for (let i = 0; i + 4 <= m[2].length; i += 4) set.add(m[2].slice(i, i + 4));
  return at > 1e12 && at < 1e13 ? { at, set } : null;
}
const fmt = (v) => (v == null || v === '' ? '' : String(Math.round(Number(v) * 100) / 100).replace('.', ','));
// Excel formül enjeksiyonu: = + - @ ile başlayan metin (ürün adı kanaldan gelir) formül olarak çalışmasın
const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function context(env, db) {
  const settings = await getSettings(db);
  const chans = (await getChannels(env, db)).filter((c) => !c.demo || c.enabled).map((c) => ({ id: c.id, name: c.name }));
  return { settings, chans, cats: catalogOf(settings) };
}

// Dışa aktarma: tüm ürünler (varyant ayrı satır) ve bağlı oldukları kanallardaki fiyatlar
export async function exportProducts(env, db) {
  const { chans } = await context(env, db);
  const prods = await all(db, `SELECT id, sku, barcode, name, group_name, variant_name, purchase_price, sale_price, stock, critical_stock, desi, vat, active FROM products
    ORDER BY COALESCE(NULLIF(group_name, ''), name) COLLATE NOCASE, variant_name COLLATE NOCASE`);
  const ls = await all(db, 'SELECT product_id, channel, price FROM listings WHERE product_id IS NOT NULL');
  const used = chans.filter((c) => ls.some((l) => l.channel === c.id));
  const price = new Map(ls.map((l) => [`${l.product_id}|${l.channel}`, l.price]));
  const head = ['ID', 'SKU', 'Barkod', 'Ürün adı', 'Varyant', 'Durum', ...FIELDS.map((f) => f[1]), ...used.map((c) => `Fiyat: ${c.name}`), CHECK];
  const t36 = Date.now().toString(36);
  const rows = prods.map((p) => {
    const vals = [...FIELDS.map(([k]) => [k, p[k]]), ...used.map((c) => ['ch:' + c.id, price.get(`${p.id}|${c.id}`)])];
    const code = vals.filter(([, v]) => v != null && v !== '' && Number.isFinite(Number(v))).map(([k, v]) => h4(canon(k, Number(v)))).join('');
    return [p.id, p.sku || '', p.barcode || '', p.variant_name && p.group_name ? p.group_name : p.name, p.variant_name || '', p.active ? 'Aktif' : 'Pasif',
      ...FIELDS.map(([k]) => (INT.has(k) ? p[k] ?? '' : fmt(p[k]))), ...used.map((c) => fmt(price.get(`${p.id}|${c.id}`))), `${t36}.${code}`];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

// rows: [{ başlık: değer }] (istemci CSV / XLSX'i okuyup gönderir). dry = önizleme.
export async function bulkUpdate(env, db, rows, { dry = true, user = 'Panel' } = {}) {
  if (!Array.isArray(rows) || !rows.length) fail(400, 'Dosyada satır bulunamadı');
  if (rows.length > 20000) fail(400, 'En fazla 20.000 satır yüklenebilir');
  const { settings, chans, cats } = await context(env, db);
  // Başlık eşleştirme (büyük/küçük harf, Türkçe karakter ve boşluk duyarsız)
  const heads = Object.keys(rows[0] || {});
  const col = {};
  for (const h of heads) {
    const k = key(h);
    if (k === 'id' || k === 'panelid') col.id = h;
    else if (k === 'sku' || k === 'stokkodu') col.sku = h;
    else if (k === 'barkod' || k === 'barcode') col.barcode = h;
    else if (k === 'urunadi' || k === 'ad') col.name = h;
    else if (k === key(CHECK) || k === 'kontrol') col.check = h;
    else {
      const f = FIELDS.find(([, label]) => key(label) === k) || (k === 'alis' ? FIELDS[0] : k === 'satis' || k === 'fiyat' ? FIELDS[1] : k === 'kdvorani' ? FIELDS[5] : null);
      if (f) { col[f[0]] = h; continue; }
      const m = /^fiyat(.+)$/.exec(k);
      const c = m && chans.find((x) => key(x.name) === m[1] || key(x.id) === m[1]);
      if (c) col['ch:' + c.id] = h;
    }
  }
  const editable = Object.keys(col).filter((k) => FIELDS.some(([f]) => f === k) || k.startsWith('ch:'));
  if (!col.id && !col.sku && !col.barcode) fail(400, 'Dosyada ID, SKU ya da Barkod sütunu yok (Excel\'e aktar ile alınan dosyayı kullanın)');
  if (!editable.length) fail(400, 'Güncellenecek sütun bulunamadı (Alış fiyatı, Satış fiyatı, Stok, Kritik stok, Desi, KDV ya da "Fiyat: Kanal adı")');

  const prods = await all(db, 'SELECT id, sku, barcode, name, variant_name, purchase_price, sale_price, stock, critical_stock, desi, vat, currency, fx_price FROM products');
  const byId = new Map(prods.map((p) => [p.id, p])), bySku = new Map(), byBc = new Map();
  for (const p of prods) { if (str(p.sku)) bySku.set(str(p.sku).toUpperCase(), p); if (str(p.barcode)) byBc.set(str(p.barcode), p); }
  const listings = await all(db, 'SELECT product_id, channel, remote_id, price, remote_stock FROM listings WHERE product_id IS NOT NULL');
  const lmap = new Map(listings.map((l) => [`${l.product_id}|${l.channel}`, l]));
  const siteStock = new Set(settings.stock_sync ? [] : listings.filter((l) => cats.includes(l.channel) && l.remote_stock != null).map((l) => l.product_id));

  // Dosyadan sonraki stok hareketleri (satış, iptal, elle düzeltme; Excel yüklemeleri hariç): değiştirilen stok hücresine eklenir
  const checks = rows.map((r) => (col.check ? readCheck(r[col.check]) : null));
  const movesAfter = new Map();
  if (col.stock) for (const at of new Set(checks.filter(Boolean).map((c) => c.at))) {
    const m = new Map((await all(db, "SELECT product_id, SUM(delta) AS d FROM stock_moves WHERE created_at > ? AND reason NOT LIKE 'Excel%' GROUP BY product_id", at)).map((x) => [x.product_id, x.d || 0]));
    movesAfter.set(at, m);
  }
  const changes = [], skipped = [], seen = new Set();
  const label = (k) => (k.startsWith('ch:') ? `Fiyat: ${(chans.find((c) => c.id === k.slice(3)) || { name: k.slice(3) }).name}` : FIELDS.find(([f]) => f === k)[1]);
  rows.forEach((r, i) => {
    const line = i + 2;
    const v = (k) => (col[k] ? str(r[col[k]]) : '');
    const p = (v('id') && byId.get(Number(v('id')))) || (v('sku') && bySku.get(v('sku').toUpperCase())) || (v('barcode') && byBc.get(v('barcode')));
    if (!p) { if (v('id') || v('sku') || v('barcode')) skipped.push({ line, reason: `ürün bulunamadı (${v('id') || v('sku') || v('barcode')})` }); return; }
    if (seen.has(p.id)) { skipped.push({ line, reason: `aynı ürün dosyada birden fazla satırda (${p.sku || p.id}); ilk satır kullanıldı` }); return; }
    seen.add(p.id);
    const name = [p.name, p.variant_name].filter(Boolean).join(' · ');
    const chk = checks[i];
    for (const k of editable) {
      const raw = v(k);
      if (!raw) continue;
      let n = parseNum(raw);
      if (!Number.isFinite(n) || n < 0) { skipped.push({ line, reason: `${label(k)}: “${raw}” sayı değil` }); continue; }
      if (INT.has(k)) n = Math.round(n);
      // Dosyada dokunulmamış hücre: dışa aktarmadaki değerle aynı → değişiklik sayılmaz (bu arada değişen güncel değer korunur)
      if (chk && chk.set.has(h4(canon(k, n)))) continue;
      if (k === 'vat' && ![0, 1, 10, 20].includes(n)) { skipped.push({ line, reason: `KDV %0, 1, 10 ya da 20 olmalı (${raw})` }); continue; }
      if (k.startsWith('ch:')) {
        const l = lmap.get(`${p.id}|${k.slice(3)}`);
        if (!l) { skipped.push({ line, reason: `${name}: ${label(k)} — ürünün bu kanalda ilanı yok` }); continue; }
        if (!(n > 0)) { skipped.push({ line, reason: `${name}: ${label(k)} sıfır olamaz` }); continue; }
        if (Math.abs((l.price || 0) - n) < 0.005) continue;
        changes.push({ id: p.id, name, field: k, label: label(k), old: l.price, new: n, channel: l.channel, remote_id: l.remote_id });
        continue;
      }
      if (k === 'stock' && siteStock.has(p.id)) { skipped.push({ line, reason: `${name}: stok ikas sitesinden okunuyor (stok senkronu kapalı); ikas'tan değiştirin` }); continue; }
      if (k === 'sale_price' && p.currency && p.fx_price > 0) { skipped.push({ line, reason: `${name}: satış fiyatı döviz kurundan hesaplanıyor (${p.currency}); döviz fiyatını ürün kartından değiştirin` }); continue; }
      const old = p[k] ?? 0;
      let note = '';
      if (k === 'stock' && chk) {
        const d = (movesAfter.get(chk.at) || new Map()).get(p.id) || 0;
        if (d) { note = `Dosyadan sonra ${d < 0 ? `${-d} adet satış` : `${d} adet giriş/iade`} oldu; yeni stoğa yansıtıldı (${n} ${d < 0 ? '−' : '+'} ${Math.abs(d)})`; n = Math.max(0, n + d); }
      }
      if (Math.abs(old - n) < 0.005) continue;
      changes.push({ id: p.id, name, field: k, label: label(k), old, new: n, ...(note ? { note } : {}) });
    }
  });

  const counts = {};
  for (const c of changes) counts[c.label] = (counts[c.label] || 0) + 1;
  const summary = { rows: rows.length, matched: seen.size, changes: changes.length, counts, skipped: skipped.slice(0, 300), skippedTotal: skipped.length, columns: editable.map(label) };
  if (dry) return { ...summary, preview: changes.slice(0, 500) };

  // Uygula: ürün alanları, stok (hareket kaydıyla) ve kanal fiyatları (gönderilmeyi bekler)
  const t = Date.now(), st = [];
  for (const c of changes) {
    if (c.field.startsWith('ch:')) st.push(db.prepare('UPDATE listings SET price = ?, price_dirty = 1 WHERE channel = ? AND remote_id = ?').bind(c.new, c.channel, c.remote_id));
    else if (c.field === 'stock') {
      st.push(db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').bind(c.new, t, c.id));
      st.push(db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at, user) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(c.id, c.new - c.old, c.new, 'Excel ile toplu güncelleme', null, t, user));
    } else st.push(db.prepare(`UPDATE products SET ${c.field} = ?, updated_at = ? WHERE id = ?`).bind(c.new, t, c.id));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  await log(db, null, 'info', `${user}: Excel ile toplu güncelleme · ${changes.length} değişiklik (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  return { ...summary, applied: true, stock: changes.some((c) => c.field === 'stock'), prices: changes.some((c) => c.field.startsWith('ch:')) };
}
