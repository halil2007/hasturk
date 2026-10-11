// Excel ile toplu güncelleme: ürün listesi Excel'e (CSV, Türkçe Excel'in açtığı biçimde) aktarılır, değiştirilip geri yüklenir.
// Güncellenebilen sütunlar: alış / satış fiyatı, stok, kritik stok, desi, KDV ve kanal fiyatları ("Fiyat: Trendyol" …).
// Satır panel ID'si, yoksa SKU, yoksa barkodla eşleşir. Boş hücre değişiklik sayılmaz. Önce önizleme döner, onaylanınca yazılır.
// Eşleşmeyen satır Ürün adı doluysa yeni ürün olarak eklenir (örnek dosya: templateCsv; ürün formundaki temizleme / doğrulama kullanılır).
import { all, getSettings, log } from './db.js';
import { getChannels } from './channels/index.js';
import { catalogOf, autoLink } from './sync.js';
import { cleanProduct } from './api.js';
import { exclusive } from './locks.js';
import { str, fail } from './util.js';
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
  // Ürünün bir kanalda birden fazla ilanı varsa (ikinci eşleşme) Excel sütunu ilk ilanın fiyatıdır (Map'te son yazılan kalır)
  const ls = await all(db, 'SELECT product_id, channel, price FROM listings WHERE product_id IS NOT NULL ORDER BY extra_link DESC, remote_id DESC');
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

// Örnek dosya (yeni ürün eklemek için): dışa aktarmayla aynı başlıklar + yalnız yeni üründe kullanılan Marka / Kategori / Görsel / Açıklama.
// Örnek satır SKU'su ORNEK-001: dosya örnek satır silinmeden yüklenirse bu satır atlanır (ürün açılmaz).
const EXTRA = [['brand', 'Marka'], ['category', 'Kategori'], ['images', 'Görsel'], ['description', 'Açıklama']];
const SAMPLE_SKU = 'ORNEK-001';
export function templateCsv() {
  const head = ['ID', 'SKU', 'Barkod', 'Ürün adı', 'Varyant', 'Durum', ...FIELDS.map((f) => f[1]), ...EXTRA.map((f) => f[1])];
  const row = ['', SAMPLE_SKU, '', 'Örnek ürün (bu satırı silin)', '5 kg', 'Aktif', '120,50', '249,90', '10', '2', '1', '20', 'Örnek marka', 'Giyim › Kadın › Tişört', 'https://ornek.com/gorsel.jpg', 'Kısa açıklama'];
  return '﻿' + [head, row].map((r) => r.map(cell).join(';')).join('\r\n');
}

// rows: [{ başlık: değer }] (istemci CSV / XLSX'i okuyup gönderir). dry = önizleme.
// Var olan ürünle eşleşmeyen satır (ID / SKU / barkod bulunamadı ya da boş) Ürün adı doluysa yeni ürün olarak eklenir.
// canCreate: ürün ekleme yetkisi (Ürünler: düzenleme), canStock: stok değiştirme yetkisi (Stok: düzenleme) — ürün formundaki gibi.
export async function bulkUpdate(env, db, rows, { dry = true, user = 'Panel', canCreate = true, canStock = true } = {}) {
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
    else if (k === 'varyant' || k === 'varyantadi') col.variant = h;
    else if (k === 'anaurun' || k === 'varyantgrubu') col.group = h;
    else if (k === 'durum') col.active = h;
    else if (k === 'marka') col.brand = h;
    else if (k === 'kategori') col.category = h;
    else if (k === 'gorsel' || k === 'gorseller' || k === 'gorseladresi' || k === 'resim') col.images = h;
    else if (k === 'aciklama') col.description = h;
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
  if (!col.id && !col.sku && !col.barcode && !col.name) fail(400, 'Dosyada ID, SKU, Barkod ya da Ürün adı sütunu yok (Excel\'e aktar ya da örnek dosyayı kullanın)');
  if (!editable.length && !col.name) fail(400, 'Güncellenecek sütun bulunamadı (Alış fiyatı, Satış fiyatı, Stok, Kritik stok, Desi, KDV ya da "Fiyat: Kanal adı")');

  const prods = await all(db, 'SELECT id, sku, barcode, name, variant_name, purchase_price, sale_price, stock, critical_stock, desi, vat, currency, fx_price FROM products');
  const byId = new Map(prods.map((p) => [p.id, p])), bySku = new Map(), byBc = new Map();
  for (const p of prods) { if (str(p.sku)) bySku.set(str(p.sku).toUpperCase(), p); if (str(p.barcode)) byBc.set(str(p.barcode), p); }
  const listings = await all(db, 'SELECT product_id, channel, remote_id, price, remote_stock FROM listings WHERE product_id IS NOT NULL ORDER BY extra_link DESC, remote_id DESC');
  const lmap = new Map(listings.map((l) => [`${l.product_id}|${l.channel}`, l]));
  const rules = new Map((await all(db, 'SELECT channel, remote_id, min_price, max_price FROM price_rules WHERE enabled = 1')).map((r) => [`${r.channel}|${r.remote_id}`, r]));
  const siteStock = new Set(settings.stock_sync ? [] : listings.filter((l) => cats.includes(l.channel) && l.remote_stock != null).map((l) => l.product_id));

  // Dosyadan sonraki stok hareketleri (satış, iptal, elle düzeltme; Excel yüklemeleri hariç): değiştirilen stok hücresine eklenir
  const checks = rows.map((r) => (col.check ? readCheck(r[col.check]) : null));
  const movesAfter = new Map();
  if (col.stock) for (const at of new Set(checks.filter(Boolean).map((c) => c.at))) {
    const m = new Map((await all(db, "SELECT product_id, SUM(delta) AS d FROM stock_moves WHERE created_at > ? AND reason NOT LIKE 'Excel%' GROUP BY product_id", at)).map((x) => [x.product_id, x.d || 0]));
    movesAfter.set(at, m);
  }
  const changes = [], skipped = [], seen = new Set(), creates = [], newSku = new Map(), newBc = new Map();
  const label = (k) => (k.startsWith('ch:') ? `Fiyat: ${(chans.find((c) => c.id === k.slice(3)) || { name: k.slice(3) }).name}` : FIELDS.find(([f]) => f === k)[1]);
  // Yeni ürün satırı: tüm hatalar toplanır; hatalı satır eklenmez
  const newRow = (r, line, v) => {
    const errs = [], name = v('name'), sku = v('sku'), bc = v('barcode');
    if (!name) {
      if (sku || bc || v('id')) skipped.push({ line, reason: `ürün bulunamadı (${v('id') || sku || bc}); yeni ürün için Ürün adı yazın` });
      else if (Object.values(r).some((x) => str(x))) skipped.push({ line, reason: 'Ürün adı boş' });
      return;
    }
    if (sku.toUpperCase() === SAMPLE_SKU) { skipped.push({ line, reason: 'örnek satır atlandı (silebilirsiniz)' }); return; }
    if (!canCreate) { skipped.push({ line, reason: `${name}: yeni ürün ekleme yetkiniz yok` }); return; }
    if (sku && newSku.has(sku.toUpperCase())) errs.push(`SKU ${sku} dosyada ${newSku.get(sku.toUpperCase())}. satırda da var`);
    if (bc && newBc.has(bc)) errs.push(`barkod ${bc} dosyada ${newBc.get(bc)}. satırda da var`);
    const variant = v('variant'), group = v('group');
    const data = { name: variant && !group ? `${name} ${variant}` : name };
    if (variant) { data.variant_name = variant; data.group_name = group || name; } else if (group) data.group_name = group;
    if (sku) data.sku = sku;
    if (bc) data.barcode = bc;
    for (const [k] of EXTRA) if (v(k)) data[k] = v(k);
    if (v('active')) data.active = /^(pasif|0|hay[ıi]r|kapal[ıi])$/i.test(v('active')) ? 0 : 1;
    let stock = 0;
    for (const [k] of FIELDS) {
      const raw = v(k);
      if (!raw) continue;
      let n = parseNum(raw);
      if (!Number.isFinite(n) || n < 0) { errs.push(`${label(k)}: “${raw}” sayı değil`); continue; }
      if (INT.has(k)) n = Math.round(n);
      if (k === 'vat' && ![0, 1, 10, 20].includes(n)) { errs.push(`KDV %0, 1, 10 ya da 20 olmalı (${raw})`); continue; }
      if (k === 'stock') stock = n; else data[k] = n;
    }
    if (stock && !canStock) errs.push('stok girme yetkiniz yok (Stok sütununu boş bırakın)');
    let f;
    try { f = cleanProduct(data); } catch (e) { errs.push(e.message); }
    if (errs.length) { skipped.push({ line, reason: `${name}: ${errs.join('; ')} — eklenmedi` }); return; }
    if (sku) newSku.set(sku.toUpperCase(), line);
    if (bc) newBc.set(bc, line);
    creates.push({ line, f, stock, name: [data.group_name || data.name, data.variant_name].filter(Boolean).join(' · ') });
  };
  rows.forEach((r, i) => {
    const line = i + 2;
    const v = (k) => (col[k] ? str(r[col[k]]) : '');
    const p = (v('id') && byId.get(Number(v('id')))) || (v('sku') && bySku.get(v('sku').toUpperCase())) || (v('barcode') && byBc.get(v('barcode')));
    if (!p) return newRow(r, line, v);
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
        const rule = rules.get(`${l.channel}|${l.remote_id}`);
        if (rule && ((rule.min_price > 0 && n < rule.min_price) || (rule.max_price > 0 && n > rule.max_price))) { skipped.push({ line, reason: `${name}: ${label(k)} ${n} — otomatik fiyat kuralı ${rule.min_price}–${rule.max_price} TL dışında` }); continue; }
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
      if (k === 'stock' && !canStock) { skipped.push({ line, reason: `${name}: stok değiştirme yetkiniz yok` }); continue; }
      changes.push({ id: p.id, name, field: k, label: label(k), old, new: n, ...(note ? { note } : {}) });
    }
  });

  const counts = {};
  for (const c of changes) counts[c.label] = (counts[c.label] || 0) + 1;
  const summary = () => ({ rows: rows.length, matched: seen.size, changes: changes.length, counts, updated: new Set(changes.map((c) => c.id)).size, created: creates.length,
    errorRows: new Set(skipped.map((x) => x.line)).size, skipped: skipped.slice(0, 300), skippedTotal: skipped.length, columns: editable.map(label),
    noSku: creates.filter((c) => !c.f.sku).length });
  if (dry) return { ...summary(), preview: changes.slice(0, 500), newPreview: creates.slice(0, 300).map((c) => ({ line: c.line, name: c.name, sku: c.f.sku || '', barcode: c.f.barcode || '', sale_price: c.f.sale_price ?? null, stock: c.stock })) };

  // Uygula: ürün alanları, stok (hareket kaydıyla) ve kanal fiyatları (gönderilmeyi bekler)
  // Bir değişikliğin yazımları (fiyat + fiyat geçmişi, stok + stok hareketi) aynı işlemde kalır: parça sınırında bölünüp biri yazılıp
  // diğeri yazılmadan (ör. stok değişip hareket kaydı olmadan) kesilmesin. Yarıda kesilirse yazılan parçalar kalır; dosya yeniden
  // yüklendiğinde yalnız kalan değişiklikler görünür (değerler mutlak yazılır, aynı değişiklik iki kez uygulanmaz).
  const t = Date.now(), groups = [];
  for (const c of changes) {
    const st = [];
    if (c.field.startsWith('ch:')) {
      st.push(db.prepare('UPDATE listings SET price = ?, price_dirty = 1 WHERE channel = ? AND remote_id = ?').bind(c.new, c.channel, c.remote_id));
      // Elle (Excel) değişiklik: otomatik fiyat bu ilanı 14 dakika değiştirmez, fiyat geçmişinde görünür
      st.push(db.prepare('INSERT INTO price_changes (channel, remote_id, at, old_price, new_price, reason, ok) VALUES (?, ?, ?, ?, ?, ?, 1)').bind(c.channel, c.remote_id, t, c.old, c.new, `Excel ile toplu güncelleme (${user})`));
    }
    else if (c.field === 'stock') {
      st.push(db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').bind(c.new, t, c.id));
      st.push(db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at, user) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(c.id, c.new - c.old, c.new, 'Excel ile toplu güncelleme', null, t, user));
    } else st.push(db.prepare(`UPDATE products SET ${c.field} = ?, updated_at = ? WHERE id = ?`).bind(c.new, t, c.id));
    groups.push(st);
  }
  const flush = async (gs, onResult) => {
    let batch = [], owners = [];
    const send = async () => { const res = await db.batch(batch); if (onResult) onResult(res, owners); batch = []; owners = []; };
    for (const [gi, g] of gs.entries()) { if (batch.length && batch.length + g.length > 90) await send(); batch.push(...g); owners.push(...g.map(() => gi)); }
    if (batch.length) await send();
  };
  await flush(groups);

  // Yeni ürünler: tek seferde bir Excel yüklemesi ekler (iki yükleme aynı anda aynı SKU'yu açmasın). Kilit içinde SKU / barkod son kez
  // kontrol edilir (önizlemeden sonra elle eklenen ürün); SKU çakışırsa (aynı anda ürün formundan eklenen) satır atlanır, hata vermez.
  // Ürün ve ilk stok hareketi aynı işlemde yazılır (last_insert_rowid: aynı parçadaki bir önceki ekleme).
  let created = 0;
  if (creates.length) await exclusive(db, 'excel:create', async () => {
    const now = await all(db, "SELECT sku, barcode FROM products WHERE COALESCE(sku, '') != '' OR COALESCE(barcode, '') != ''");
    const skus = new Set(now.filter((p) => str(p.sku)).map((p) => str(p.sku).toUpperCase())), bcs = new Set(now.filter((p) => str(p.barcode)).map((p) => str(p.barcode)));
    const ok = creates.filter((c) => {
      if (c.f.sku && skus.has(c.f.sku.toUpperCase())) { skipped.push({ line: c.line, reason: `${c.name}: SKU ${c.f.sku} başka üründe kullanılıyor — eklenmedi` }); return false; }
      if (c.f.barcode && bcs.has(c.f.barcode)) { skipped.push({ line: c.line, reason: `${c.name}: barkod ${c.f.barcode} başka üründe var — eklenmedi` }); return false; }
      return true;
    });
    const gs = ok.map((c) => {
      const keys = Object.keys(c.f);
      const st = [db.prepare(`INSERT INTO products (${keys.join(', ')}, stock, created_at, updated_at) VALUES (${keys.map(() => '?').join(', ')}, ?, ?, ?) ON CONFLICT DO NOTHING`)
        .bind(...keys.map((k) => c.f[k]), c.stock, t, t)];
      if (c.stock) st.push(db.prepare("INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at, user) SELECT last_insert_rowid(), ?, ?, 'İlk stok (Excel)', NULL, ?, ? WHERE changes() > 0")
        .bind(c.stock, c.stock, t, user));
      return st;
    });
    await flush(gs, (res, owners) => res.forEach((r, i) => { if (i === 0 || owners[i] !== owners[i - 1]) created += Number((r.meta || {}).changes) || 0; }));
    // Kayıt anında çakışan (ON CONFLICT ile atlanan) satırlar
    const lost = ok.length - created;
    if (lost > 0) skipped.push({ line: 0, reason: `${lost} yeni ürün SKU çakışması nedeniyle eklenmedi (aynı anda başka yerden eklendi)` });
  }, { ttl: 10 * 60e3, busy: 'Başka bir Excel yüklemesi sürüyor. Bitince tekrar deneyin.' });
  if (created) await autoLink(db).catch(() => {});

  const out = summary();
  out.created = created;
  await log(db, null, 'info', `${user}: Excel ile toplu güncelleme · ${changes.length} değişiklik (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')})${created ? ` · ${created} yeni ürün` : ''}`);
  return { ...out, applied: true, stock: changes.some((c) => c.field === 'stock') || creates.some((c) => c.stock), prices: changes.some((c) => c.field.startsWith('ch:')) };
}
