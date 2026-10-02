// Panel API'si (/api/*). Tüm adresler girişten sonra çalışır.
import { all, first, run, getSettings, setSetting, getRaw, log, DEFAULT_SETTINGS } from './db.js';
import { getChannels, channel, publicInfo, resetChannels, CHANNEL_IDS } from './channels/index.js';
import { loadConfig, saveConfig, describe } from './config.js';
import { syncAll, importListings, applyStock, pushStocks, pushPrices, autoLink, relinkItems } from './sync.js';
import { stats, summary, dashboard } from './stats.js';
import { profit } from '../public/profit.js';
import { json, fail, body, num, str, r2, mergeStatus, STATUS } from './util.js';

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const PKG_COLS = 'id, order_id, no, remote_id, items, status, remote_status, cargo_company, tracking, barcode, desi, created_at, shipped_at, label_format, label_at, (label_data IS NOT NULL) AS has_label';

// ---------- siparişler ----------
async function loadOrder(db, id) {
  const o = await first(db, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) fail(404, 'Sipariş bulunamadı');
  o.address = parse(o.address, {});
  o.extra = parse(o.extra, {});
  o.items = await all(db, `SELECT i.*, p.name AS product_name, p.stock AS product_stock, p.purchase_price, p.desi, p.image AS product_image, l.commission AS listing_commission
    FROM order_items i LEFT JOIN products p ON p.id = i.product_id
    LEFT JOIN listings l ON l.channel = ? AND l.remote_id = i.remote_key
    WHERE i.order_id = ? ORDER BY i.rowid`, o.channel, id);
  o.packages = (await all(db, `SELECT ${PKG_COLS} FROM packages WHERE order_id = ? ORDER BY no`, id)).map((p) => ({ ...p, items: parse(p.items, []) }));
  return o;
}

function orderProfit(o, settings) {
  const ch = o.channel;
  let revenue = 0, commission = 0, cost = 0, missing = 0;
  for (const i of o.items) {
    if (i.status === 'cancelled') continue;
    const rate = i.listing_commission ?? (settings.commission || {})[ch] ?? 0;
    revenue += i.total;
    commission += profit({ sale: i.total, commissionRate: rate }).commission;
    if (i.purchase_price) cost += i.purchase_price * i.quantity; else missing++;
  }
  const shipping = o.shipping_cost ?? (settings.shipping || {})[ch] ?? 0;
  const fee = (settings.service_fee || {})[ch] || 0;
  const net = revenue - commission - shipping - fee;
  return { revenue: r2(revenue), commission: r2(commission), shipping: r2(shipping), fee: r2(fee), payout: r2(net), cost: r2(cost), profit: r2(net - cost), missingCost: missing };
}

// Sipariş filtresi (liste, sayılar ve dışa aktarma aynı filtreyi kullanır)
function orderFilter(q, { withStatus = true } = {}) {
  const where = [], args = [];
  const st = q.status || 'all';
  if (withStatus) {
    if (st === 'active') where.push("o.status IN ('new', 'processing')");
    else if (st === 'cancelled') where.push("o.status IN ('cancelled', 'returned')");
    else if (STATUS.includes(st)) { where.push('o.status = ?'); args.push(st); }
  }
  if (q.channel && CHANNEL_IDS.includes(q.channel)) { where.push('o.channel = ?'); args.push(q.channel); }
  const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(s + 'T00:00:00Z') - 3 * 3600e3 : null);
  if (day(q.from) != null) { where.push('o.ordered_at >= ?'); args.push(day(q.from)); }
  if (day(q.to) != null) { where.push('o.ordered_at < ?'); args.push(day(q.to) + 864e5); }
  if (q.cargo) { where.push('(o.cargo_company = ? OR EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id AND k.cargo_company = ?))'); args.push(q.cargo, q.cargo); }
  if (q.q) {
    const s = '%' + q.q.trim() + '%';
    where.push('(o.order_number LIKE ? OR o.customer LIKE ? OR o.tracking LIKE ? OR EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND (x.name LIKE ? OR x.sku LIKE ? OR x.barcode LIKE ?)))');
    args.push(s, s, s, s, s, s);
  }
  return { w: where.length ? 'WHERE ' + where.join(' AND ') : '', args, st };
}

async function listOrders(db, q) {
  const { w, args, st } = orderFilter(q);
  const limit = Math.min(Number(q.limit) || 25, 200), page = Math.max(1, Number(q.page) || 1);
  const rows = await all(db, `SELECT o.id, o.channel, o.order_number, o.status, o.remote_status, o.ordered_at, o.customer, o.address, o.total, o.tracking, o.cargo_company, o.extra, o.shipping_cost,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id AND status != 'cancelled') AS qty,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS lines,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id) AS packages,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND status = 'open') AS open_packages,
      (SELECT MAX(cargo_company) FROM packages WHERE order_id = o.id AND cargo_company != '') AS pkg_cargo,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND product_id IS NULL) AS unmatched
    FROM orders o ${w} ORDER BY ${st === 'active' ? 'o.ordered_at ASC' : 'o.ordered_at DESC'} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = (await first(db, `SELECT COUNT(*) AS n FROM orders o ${w}`, ...args)).n;
  // Durum sayıları: seçili kanal / tarih / arama içinde (durum filtresi hariç)
  const f2 = orderFilter(q, { withStatus: false });
  const counts = await all(db, `SELECT o.status, COUNT(*) AS n FROM orders o ${f2.w} GROUP BY o.status`, ...f2.args);
  // Satır önizlemesi (görsel + ad + adet), ilk 2 ürün
  const items = {}, full = {};
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    for (const it of await all(db, `SELECT i.order_id, i.name, i.quantity, i.sku, i.total, i.status, COALESCE(p.image, i.image) AS image, COALESCE(p.name, i.name) AS pname,
        p.purchase_price, l.commission AS listing_commission
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
      WHERE i.order_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.rowid`, ...ids)) {
      (items[it.order_id] = items[it.order_id] || []).push({ name: it.pname || it.name, qty: it.quantity, sku: it.sku, image: it.image || '' });
      (full[it.order_id] = full[it.order_id] || []).push(it);
    }
  }
  const settings = await getSettings(db);
  return {
    orders: rows.map((r) => {
      const a = parse(r.address, {});
      const pr = orderProfit({ channel: r.channel, shipping_cost: r.shipping_cost, items: full[r.id] || [] }, settings);
      return { ...r, city: a.city || '', district: a.district || '', address: undefined, extra: parse(r.extra, {}), items: (items[r.id] || []).slice(0, 2), cargo: r.pkg_cargo || r.cargo_company || '', profit: ['cancelled', 'returned'].includes(r.status) ? null : pr.profit, missing_cost: pr.missingCost };
    }),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), total, page, limit,
  };
}

async function exportOrders(db, q) {
  const { w, args } = orderFilter(q);
  const rows = await all(db, `SELECT o.channel, o.order_number, o.ordered_at, o.status, o.customer, o.phone, o.address, o.total, o.cargo_company, o.tracking,
      (SELECT GROUP_CONCAT(quantity || ' x ' || name || CASE WHEN sku != '' THEN ' (' || sku || ')' ELSE '' END, ' | ') FROM order_items WHERE order_id = o.id) AS items
    FROM orders o ${w} ORDER BY o.ordered_at DESC LIMIT 10000`, ...args);
  const cell = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const fmt = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const head = ['Kanal', 'Sipariş no', 'Tarih', 'Durum', 'Müşteri', 'Telefon', 'İl', 'İlçe', 'Adres', 'Tutar', 'Kargo', 'Takip no', 'Ürünler'];
  const TR = { new: 'Yeni', processing: 'Hazırlanıyor', shipped: 'Kargoda', delivered: 'Teslim edildi', cancelled: 'İptal', returned: 'İade' };
  const lines = rows.map((r) => { const a = parse(r.address, {}); return [r.channel, r.order_number, fmt(r.ordered_at), TR[r.status] || r.status, r.customer, r.phone, a.city, a.district, a.line, String(r.total).replace('.', ','), r.cargo_company, r.tracking, r.items].map(cell).join(';'); });
  // Excel Türkçe karakterleri doğru açsın diye UTF-8 BOM
  return '﻿' + [head.join(';'), ...lines].join('\r\n');
}

const lineQty = (o) => new Map(o.items.filter((i) => i.status !== 'cancelled').map((i) => [String(i.line_id), i.quantity]));

async function insertPackages(db, orderId, pkgs, status = 'open') {
  const t = Date.now();
  const start = ((await first(db, 'SELECT COALESCE(MAX(no), 0) AS n FROM packages WHERE order_id = ?', orderId)) || {}).n || 0;
  await db.batch(pkgs.map((p, i) => db.prepare('INSERT INTO packages (order_id, no, remote_id, items, status, tracking, desi, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(orderId, start + i + 1, p.remoteId || null, JSON.stringify(p.items), status, p.tracking || '', p.desi || null, t)));
}

// Paket yoksa: tüm siparişi tek paket yap (Hepsiburada'da paketleme isteği de gönderilir)
async function ensurePackages(db, ch, o) {
  if (o.packages.length) return o;
  const items = [...lineQty(o)].map(([line_id, qty]) => ({ line_id, qty }));
  if (!items.length) fail(400, 'Siparişte gönderilecek ürün yok');
  if (ch && ch.caps.split === 'remote' && ch.split) {
    const r = await ch.split(o, [{ items, desi: orderDesi(o) }]);
    await insertPackages(db, o.id, r.packages);
  } else {
    await insertPackages(db, o.id, [{ items, desi: orderDesi(o) }]);
  }
  return loadOrder(db, o.id);
}
const orderDesi = (o) => Math.max(1, o.items.reduce((s, i) => s + (i.desi || 1) * i.quantity, 0));

async function setLocalStatus(db, o, status) {
  const merged = mergeStatus(o.status, status); // daha ileri bir durumdaysa geri gitmez
  await run(db, 'UPDATE orders SET local_status = ?, status = ?, updated_at = ? WHERE id = ?', status, merged, Date.now(), o.id);
  return merged;
}

async function orderAction(env, db, id, action, b, ctx) {
  let o = await loadOrder(db, id);
  const ch = await channel(env, db, o.channel);
  const settings = await getSettings(db);
  if (action === 'accept') {
    if (o.status !== 'new') fail(400, 'Sadece yeni siparişler işleme alınabilir');
    if (ch && ch.enabled && ch.caps.accept === 'remote' && ch.accept) await ch.accept(o);
    await setLocalStatus(db, o, 'processing');
    return { ok: true, message: 'Sipariş işleme alındı' };
  }
  if (action === 'split') {
    const groups = (b.groups || []).map((g) => ({ desi: num(g.desi, 0) || null, items: (g.items || []).map((x) => ({ line_id: String(x.line_id), qty: Math.round(num(x.qty)) })).filter((x) => x.qty > 0) })).filter((g) => g.items.length);
    if (groups.length < 1) fail(400, 'En az bir paket gerekli');
    const need = lineQty(o), got = new Map();
    for (const g of groups) for (const x of g.items) {
      if (!need.has(x.line_id)) fail(400, 'Siparişte olmayan satır: ' + x.line_id);
      got.set(x.line_id, (got.get(x.line_id) || 0) + x.qty);
    }
    for (const [lid, q] of need) if ((got.get(lid) || 0) !== q) fail(400, 'Her ürünün tüm adedi bir pakete dağıtılmalı');
    if (o.packages.some((p) => p.status === 'shipped')) fail(400, 'Kargoya verilmiş paketi olan sipariş yeniden bölünemez');
    if (ch && ch.enabled && ch.caps.split === 'remote-async') {
      const r = await ch.split(o, groups);
      await setLocalStatus(db, o, 'processing');
      return { ok: true, message: r.message };
    }
    if (ch && ch.enabled && ch.caps.split === 'remote') {
      if (o.packages.some((p) => p.remote_id)) fail(400, 'Bu sipariş kanalda zaten paketlenmiş; yeniden bölmek için kanal panelinden paketi iptal edin');
      const r = await ch.split(o, groups);
      await run(db, 'DELETE FROM packages WHERE order_id = ? AND remote_id IS NULL', o.id);
      await insertPackages(db, o.id, r.packages.map((p, i) => ({ ...p, desi: groups[i] && groups[i].desi })));
      await setLocalStatus(db, o, 'processing');
      return { ok: true, message: r.message };
    }
    await run(db, "DELETE FROM packages WHERE order_id = ? AND remote_id IS NULL AND status = 'open'", o.id);
    await insertPackages(db, o.id, groups);
    if (o.status === 'new') await setLocalStatus(db, o, 'processing');
    return { ok: true, message: `${groups.length} paket oluşturuldu` };
  }
  if (action === 'ship') {
    o = await ensurePackages(db, ch, o);
    const pkg = b.package_id ? o.packages.find((p) => p.id === Number(b.package_id)) : o.packages.find((p) => p.status === 'open');
    if (!pkg) fail(400, 'Gönderilecek açık paket yok');
    const tracking = str(b.tracking) || pkg.tracking, cargo = str(b.cargo_company) || pkg.cargo_company || o.cargo_company;
    let res = {};
    if (ch && ch.enabled && ch.caps.ship === 'remote' && ch.ship) res = (await ch.ship(o, pkg, { cargoCompany: cargo, tracking, invoiceNumber: str(b.invoice_number) })) || {};
    const tn = res.tracking || tracking || '';
    await run(db, "UPDATE packages SET status = 'shipped', tracking = ?, cargo_company = ?, shipped_at = ?, remote_id = COALESCE(remote_id, ?) WHERE id = ?", tn, cargo || '', Date.now(), res.remoteId || null, pkg.id);
    const left = await first(db, "SELECT COUNT(*) AS n FROM packages WHERE order_id = ? AND status = 'open'", o.id);
    if (!left.n) await setLocalStatus(db, o, 'shipped');
    else if (o.status === 'new') await setLocalStatus(db, o, 'processing');
    await run(db, "UPDATE orders SET tracking = CASE WHEN tracking IS NULL OR tracking = '' THEN ? ELSE tracking END, cargo_company = CASE WHEN cargo_company IS NULL OR cargo_company = '' THEN ? ELSE cargo_company END WHERE id = ?", tn, cargo || '', o.id);
    return { ok: true, message: left.n ? `Paket ${pkg.no} kargoya verildi (${left.n} paket kaldı)` : 'Sipariş kargoya verildi' };
  }
  if (action === 'tracking') {
    const pkg = o.packages.find((p) => p.id === Number(b.package_id));
    if (!pkg) fail(404, 'Paket bulunamadı');
    await run(db, 'UPDATE packages SET tracking = ?, cargo_company = ?, desi = ? WHERE id = ?', str(b.tracking), str(b.cargo_company), num(b.desi, 0) || pkg.desi, pkg.id);
    return { ok: true };
  }
  if (action === 'label') {
    o = await ensurePackages(db, ch, o);
    const pkg = b.package_id ? o.packages.find((p) => p.id === Number(b.package_id)) : o.packages[0];
    if (!pkg) fail(404, 'Paket bulunamadı');
    const r = await packageLabel(db, ch, o, pkg, settings, { refresh: !!b.refresh });
    return { ok: true, order: await loadOrder(db, o.id), package_id: pkg.id, ...r, sender: settings.sender };
  }
  if (action === 'status') {
    const s = str(b.status);
    if (!['new', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'].includes(s)) fail(400, 'Geçersiz durum');
    // Elle durum: panelde iz bırakır; "yeni"ye dönmek yerel işlemi temizler
    if (s === 'new') await run(db, 'UPDATE orders SET local_status = NULL, status = ? WHERE id = ?', 'new', o.id);
    else await run(db, 'UPDATE orders SET local_status = ?, status = ?, updated_at = ? WHERE id = ?', s, s, Date.now(), o.id);
    await applyStock(db, [o.id], settings);
    ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    return { ok: true };
  }
  if (action === 'note') {
    await run(db, 'UPDATE orders SET note = ?, shipping_cost = ? WHERE id = ?', str(b.note), b.shipping_cost === '' || b.shipping_cost == null ? null : num(b.shipping_cost), o.id);
    return { ok: true };
  }
  if (action === 'reset-packages') {
    if (o.packages.some((p) => p.status === 'shipped' || p.remote_id)) fail(400, 'Kanalda oluşmuş veya kargoya verilmiş paketler silinemez');
    await run(db, 'DELETE FROM packages WHERE order_id = ?', o.id);
    return { ok: true };
  }
  fail(404, 'Bilinmeyen işlem');
}

// ---------- kargo etiketi (kanalın kendi sisteminden) ----------
// Trendyol: ortak etiket (ZPL) · Hepsiburada: paket etiketi (ZPL/PDF) · ikas ve PttAVM: kanalın kargo barkodu panel etiketine basılır.
// Alınan etiket pakete kaydedilir; tekrar istenince kanala gidilmez.
async function packageLabel(db, ch, o, pkg, settings, { refresh = false } = {}) {
  if (pkg.has_label && !refresh) {
    const r = await first(db, 'SELECT label_format, label_data FROM packages WHERE id = ?', pkg.id);
    return { official: { format: r.label_format, data: r.label_data, filename: `${o.channel}-${o.order_number}-${pkg.no}.${r.label_format}` } };
  }
  if (!ch || !ch.enabled || !ch.caps.label || !ch.label) {
    // Deneme modu: kanal barkodu yerine örnek barkod
    if (ch && ch.demo && !pkg.barcode && !pkg.tracking) {
      pkg.barcode = `DEMO${o.order_number}${pkg.no}`.replace(/[^A-Z0-9]/gi, '');
      await run(db, 'UPDATE packages SET barcode = ? WHERE id = ?', pkg.barcode, pkg.id);
    }
    const code = pkg.barcode || pkg.tracking;
    return { official: null, panel: true, error: code ? null : `${ch ? ch.name : 'Kanal'} kargo barkodu henüz gelmedi; kanalda paketi kargoya hazırlayıp senkronlayın` };
  }
  let lab;
  try { lab = await ch.label(o, pkg); } catch (e) {
    await log(db, o.channel, 'warn', 'Etiket alınamadı: ' + e.message);
    return { official: null, error: e.message };
  }
  if (!lab) return { official: null, error: `${ch.name} etiketi henüz hazır değil (kargo takip no oluşmadı). Sipariş işleme alındıktan birkaç dakika sonra tekrar deneyin.` };
  // ZPL'yi normal yazıcı için PDF'e çevir (Ayarlar'da açıksa)
  if (lab.format === 'zpl' && settings.zpl_pdf) {
    try {
      const res = await fetch('https://api.labelary.com/v1/printers/8dpmm/labels/4x6/', { method: 'POST', headers: { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' }, body: lab.data });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        lab = { format: 'pdf', data: btoa(s), filename: lab.filename.replace(/\.zpl$/, '.pdf') };
      }
    } catch { /* ZPL olarak kalır */ }
  }
  await run(db, 'UPDATE packages SET label_format = ?, label_data = ?, label_at = ? WHERE id = ?', lab.format, lab.data, Date.now(), pkg.id);
  return { official: lab };
}

// Kargo ekranı: paketler (etiket bekleyen / kargoya verilecek / kargoda) + henüz paketlenmemiş siparişler
async function listPackages(db, q) {
  const where = [], args = [];
  if (q.channel && CHANNEL_IDS.includes(q.channel)) { where.push('o.channel = ?'); args.push(q.channel); }
  const base = `FROM packages p JOIN orders o ON o.id = p.order_id`;
  const ready = "(p.label_data IS NOT NULL OR COALESCE(p.tracking, '') != '' OR COALESCE(p.barcode, '') != '')";
  const live = "o.status NOT IN ('cancelled', 'returned')";
  const states = {
    waiting: `p.status = 'open' AND ${live} AND NOT ${ready}`,
    ready: `p.status = 'open' AND ${live} AND ${ready}`,
    shipped: `p.status = 'shipped' AND p.shipped_at >= ${Date.now() - 30 * 864e5}`,
  };
  const st = states[q.state] ? q.state : 'waiting';
  const w = (s) => 'WHERE ' + [states[s], ...where].join(' AND ');
  const rows = await all(db, `SELECT p.id, p.order_id, p.no, p.status, p.cargo_company, p.tracking, p.barcode, p.desi, p.items, p.label_format, (p.label_data IS NOT NULL) AS has_label, p.shipped_at,
      o.channel, o.order_number, o.customer, o.address, o.ordered_at, o.status AS order_status, (SELECT COUNT(*) FROM packages x WHERE x.order_id = p.order_id) AS pkg_total
    ${base} ${w(st)} ORDER BY o.ordered_at ASC LIMIT 300`, ...args);
  const counts = {};
  for (const s of Object.keys(states)) counts[s] = (await first(db, `SELECT COUNT(*) AS n ${base} ${w(s)}`, ...args)).n;
  // Paketi olmayan ve hazırlanan siparişler: tek paket olarak işlenecekler
  const unpacked = st === 'waiting' ? await all(db, `SELECT o.id AS order_id, o.channel, o.order_number, o.customer, o.address, o.ordered_at, o.status AS order_status, o.tracking, o.cargo_company,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id AND status != 'cancelled') AS qty
    FROM orders o WHERE o.status IN ('new', 'processing') AND NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id) ${where.length ? 'AND ' + where.join(' AND ') : ''} ORDER BY o.ordered_at ASC LIMIT 300`, ...args) : [];
  counts.waiting += st === 'waiting' ? unpacked.length : (await first(db, `SELECT COUNT(*) AS n FROM orders o WHERE o.status IN ('new', 'processing') AND NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id) ${where.length ? 'AND ' + where.join(' AND ') : ''}`, ...args)).n;
  const addr = (r) => { const a = parse(r.address, {}); return { ...r, city: a.city || '', district: a.district || '', address: undefined }; };
  return { state: st, packages: rows.map((r) => ({ ...addr(r), items: parse(r.items, []) })), unpacked: unpacked.map(addr), counts };
}

// ---------- ürünler ----------
const PRODUCT_FIELDS = ['sku', 'barcode', 'name', 'brand', 'category', 'description', 'image', 'purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock', 'active'];
const NUMERIC = new Set(['purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock', 'active']);
function cleanProduct(b) {
  const o = {};
  for (const k of PRODUCT_FIELDS) if (k in b) o[k] = NUMERIC.has(k) ? num(b[k]) : str(b[k]) || null;
  if ('name' in o && !o.name) fail(400, 'Ürün adı gerekli');
  return o;
}

async function listProducts(db, q) {
  const where = [], args = [];
  if (q.q) { const s = '%' + q.q.trim() + '%'; where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'); args.push(s, s, s); }
  if (q.filter === 'low') where.push('(p.stock <= p.critical_stock OR p.stock <= 0)');
  if (q.filter === 'nocost') where.push('(p.purchase_price IS NULL OR p.purchase_price = 0)');
  if (q.filter === 'waiting') where.push('EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.pushed_stock IS NOT NULL AND l.pushed_stock != MAX(p.stock, 0))');
  if (q.filter === 'error') where.push('EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.error IS NOT NULL)');
  if (q.filter === 'nolisting') where.push('NOT EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id)');
  if (q.filter === 'passive') where.push('p.active = 0'); else if (q.filter !== 'all') where.push('p.active = 1');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 50, 500), page = Math.max(1, Number(q.page) || 1);
  const rows = await all(db, `SELECT p.* FROM products p ${w} ORDER BY ${q.sort === 'stock' ? 'p.stock ASC' : 'p.name COLLATE NOCASE'} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = (await first(db, `SELECT COUNT(*) AS n FROM products p ${w}`, ...args)).n;
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const ls = await all(db, `SELECT product_id, channel, remote_id, price, commission, pushed_stock, remote_stock, error FROM listings WHERE product_id IN (${ids.map(() => '?').join(',')})`, ...ids);
    for (const r of rows) r.listings = ls.filter((l) => l.product_id === r.id);
  }
  return { products: rows, total, page, limit };
}

async function stockChange(env, db, ctx, id, b) {
  const p = await first(db, 'SELECT id, stock FROM products WHERE id = ?', id);
  if (!p) fail(404, 'Ürün bulunamadı');
  const qty = Math.round(num(b.qty));
  const delta = b.mode === 'set' ? qty - p.stock : qty;
  if (!delta) return { ok: true, stock: p.stock };
  const t = Date.now();
  await db.batch([
    db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?').bind(delta, t, id),
    db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) VALUES (?, ?, (SELECT stock FROM products WHERE id = ?), ?, ?, ?)')
      .bind(id, delta, id, b.mode === 'set' ? 'Sayım / düzeltme' : delta > 0 ? 'Stok girişi' : 'Stok çıkışı', str(b.note) || null, t),
  ]);
  ctx.waitUntil(pushStocks(env, db).catch(() => {}));
  return { ok: true, stock: p.stock + delta };
}

async function saveProduct(env, db, ctx, id, b) {
  const f = cleanProduct(b), t = Date.now();
  if (f.sku) {
    const dup = await first(db, 'SELECT id FROM products WHERE LOWER(sku) = LOWER(?) AND id != ?', f.sku, id || 0);
    if (dup) fail(400, 'Bu stok kodu (SKU) başka bir üründe kullanılıyor');
  }
  if (!id) {
    const keys = Object.keys(f);
    const r = await first(db, `INSERT INTO products (${keys.join(', ')}, stock, created_at, updated_at) VALUES (${keys.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`,
      ...keys.map((k) => f[k]), Math.round(num(b.stock)), t, t);
    id = r.id;
    if (num(b.stock)) await run(db, 'INSERT INTO stock_moves (product_id, delta, stock_after, reason, created_at) VALUES (?, ?, ?, ?, ?)', id, Math.round(num(b.stock)), Math.round(num(b.stock)), 'İlk stok', t);
  } else {
    const keys = Object.keys(f);
    if (keys.length) await run(db, `UPDATE products SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => f[k]), t, id);
    if (b.stock !== undefined && b.stock !== '') await stockChange(env, db, ctx, id, { mode: 'set', qty: b.stock, note: 'Ürün formu' });
  }
  // Kanal ilanları: fiyat / komisyon
  for (const l of b.listings || []) {
    const cur = await first(db, 'SELECT price, list_price FROM listings WHERE channel = ? AND remote_id = ? AND product_id = ?', l.channel, String(l.remote_id), id);
    if (!cur) continue;
    const price = l.price === '' || l.price == null ? cur.price : num(l.price);
    const dirty = price !== cur.price ? 1 : 0;
    await run(db, 'UPDATE listings SET price = ?, commission = ?, price_dirty = MAX(price_dirty, ?) WHERE channel = ? AND remote_id = ?',
      price, l.commission === '' || l.commission == null ? null : num(l.commission), dirty, l.channel, String(l.remote_id));
  }
  // Yeni ürünü ikas mağazalarında da aç (pazaryerlerinde kategori özellikleri gerektiği için oradan açılır, barkod/SKU ile otomatik bağlanır)
  const created = [], errors = [];
  for (const cid of b.create_on || []) {
    const ch = await channel(env, db, cid);
    if (!ch || !ch.enabled || !ch.caps.createProduct) continue;
    try {
      const p = await first(db, 'SELECT * FROM products WHERE id = ?', id);
      const l = await ch.createProduct(p);
      await run(db, `INSERT INTO listings (channel, remote_id, product_id, remote_product_id, sku, barcode, name, price, remote_stock, pushed_stock, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (channel, remote_id) DO UPDATE SET product_id = excluded.product_id`, cid, l.remoteId, id, l.remoteProductId || '', l.sku || '', l.barcode || '', l.name, l.price || 0, l.stock, l.stock, t);
      created.push(cid);
    } catch (e) { errors.push(`${ch.name}: ${e.message}`); await log(db, cid, 'error', 'Ürün oluşturulamadı: ' + e.message); }
  }
  if (b.sku || b.barcode) await autoLink(db);
  ctx.waitUntil(pushPrices(env, db).catch(() => {}));
  return { ok: true, id, created, errors };
}

async function productDetail(db, id) {
  const p = await first(db, 'SELECT * FROM products WHERE id = ?', id);
  if (!p) fail(404, 'Ürün bulunamadı');
  p.listings = await all(db, 'SELECT * FROM listings WHERE product_id = ?', id);
  p.moves = await all(db, 'SELECT * FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 30', id);
  p.sales = await all(db, `SELECT o.channel, SUM(i.quantity) AS qty, SUM(i.total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE i.product_id = ? AND o.ordered_at >= ? AND o.status NOT IN ('cancelled', 'returned') AND i.status != 'cancelled' GROUP BY o.channel`, id, Date.now() - 30 * 864e5);
  return p;
}

// ---------- ayarlar ----------
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).concat(['stock_channels']);
async function saveSettings(db, b) {
  const cur = await getSettings(db);
  for (const k of Object.keys(b)) {
    if (!SETTING_KEYS.includes(k) || k === 'stock_since') continue;
    let v = b[k];
    if (k === 'stock_sync') {
      v = !!v;
      if (v && !cur.stock_sync) await setSetting(db, 'stock_since', Date.now());
    }
    if (['commission', 'shipping', 'service_fee'].includes(k)) v = Object.fromEntries(CHANNEL_IDS.map((c) => [c, num((v || {})[c], (cur[k] || {})[c] || 0)]));
    if (k === 'history_days') v = Math.min(365, Math.max(1, Math.round(num(v, 30))));
    await setSetting(db, k, v);
  }
  return getSettings(db);
}

async function channelsInfo(env, db) {
  const counts = await all(db, 'SELECT channel, COUNT(*) AS n, SUM(product_id IS NOT NULL) AS linked, SUM(error IS NOT NULL) AS errors FROM listings GROUP BY channel');
  const out = [];
  for (const c of await getChannels(env, db)) {
    const x = counts.find((r) => r.channel === c.id) || {};
    out.push({ ...publicInfo(c), last: await getRaw(db, 'last:' + c.id), listings: x.n || 0, linked: x.linked || 0, listingErrors: x.errors || 0 });
  }
  return out;
}

// ---------- yönlendirme ----------
export async function api(req, env, ctx, db, path) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams), m = req.method;
  let x;
  if (path === 'summary' && m === 'GET') {
    return json({ ...(await summary(db)), channels: await channelsInfo(env, db), settings: await getSettings(db) });
  }
  if (path === 'channels' && m === 'GET') return json(await channelsInfo(env, db));
  if (path === 'sync' && m === 'POST') { const b = await body(req); return json(await syncAll(env, db, { only: b.channels, force: !!b.force })); }
  if (path === 'import' && m === 'POST') { const b = await body(req); return json(await importListings(env, db, { only: b.channels, createMissing: b.createMissing !== false })); }
  if (path === 'push-stock' && m === 'POST') return json(await pushStocks(env, db));

  if (path === 'orders' && m === 'GET') return json(await listOrders(db, q));
  if ((x = path.match(/^orders\/([^/]+)$/)) && m === 'GET') {
    const o = await loadOrder(db, decodeURIComponent(x[1]));
    const ch = await channel(env, db, o.channel);
    return json({ order: o, profit: orderProfit(o, await getSettings(db)), channel: ch ? publicInfo(ch) : null });
  }
  if ((x = path.match(/^orders\/([^/]+)\/([a-z-]+)$/)) && m === 'POST') {
    const b = await body(req);
    return json(await orderAction(env, db, decodeURIComponent(x[1]), x[2], b, ctx));
  }
  if (path === 'orders-bulk' && m === 'POST') {
    const b = await body(req), done = [], errors = [];
    for (const id of (b.ids || []).slice(0, 100)) {
      try { await orderAction(env, db, id, b.action, b, ctx); done.push(id); } catch (e) { errors.push(`${id}: ${e.message}`); }
    }
    return json({ ok: !errors.length, done, errors });
  }
  if (path === 'labels' && m === 'POST') {
    // Toplu etiket: seçilen siparişlerin açık paketleri (paket yoksa tek paket oluşturulur); kanal etiketi istenirse alınır
    const b = await body(req), out = [], errors = [], settings = await getSettings(db);
    for (const id of (b.ids || []).slice(0, 40)) {
      try {
        let o = await loadOrder(db, id);
        const ch = await channel(env, db, o.channel);
        o = await ensurePackages(db, ch, o);
        const labels = [];
        for (const pkg of o.packages.filter((p) => p.status === 'open' || b.all)) {
          const r = b.fetch ? await packageLabel(db, ch, o, pkg, settings) : {};
          if (r.error) errors.push(`${o.order_number}/${pkg.no}: ${r.error}`);
          labels.push({ package_id: pkg.id, official: r.official || null });
        }
        out.push({ order: await loadOrder(db, id), labels });
      } catch (e) { errors.push(`${id}: ${e.message}`); }
    }
    return json({ orders: out, errors, sender: settings.sender });
  }
  if (path === 'packages' && m === 'GET') return json(await listPackages(db, q));
  if (path === 'orders.csv' && m === 'GET') {
    return new Response(await exportOrders(db, q), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="siparisler-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  if (path === 'dashboard' && m === 'GET') return json(await dashboard(db, q));

  // ---------- entegrasyonlar (kanal API bilgileri) ----------
  if (path === 'integrations' && m === 'GET') {
    const cfg = await loadConfig(env, db), chs = await getChannels(env, db), info = await channelsInfo(env, db);
    return json({ secretSet: !!env.PANEL_SECRET, channels: chs.map((c) => ({ ...info.find((x) => x.id === c.id), ...describe(env, cfg, c.id) })) });
  }
  if ((x = path.match(/^integrations\/([a-z0-9]+)$/)) && m === 'PUT') {
    await saveConfig(env, db, x[1], await body(req));
    resetChannels();
    await log(db, x[1], 'info', 'API bilgileri panelden güncellendi');
    return json({ ok: true });
  }
  if ((x = path.match(/^integrations\/([a-z0-9]+)\/test$/)) && m === 'POST') {
    resetChannels();
    const ch = await channel(env, db, x[1]);
    if (!ch) fail(404, 'Kanal bulunamadı');
    if (ch.paused) return json({ ok: false, message: 'Kanal pasif' });
    if (!ch.enabled) return json({ ok: false, message: 'Eksik bilgi: ' + ch.missing.join(', ') });
    if (ch.demo) return json({ ok: true, message: 'Deneme modu: örnek veriyle çalışıyor' });
    const t = Date.now();
    try {
      const orders = await ch.fetchOrders(t - 24 * 3600e3, t);
      return json({ ok: true, message: `Bağlantı başarılı · son 24 saatte ${orders.length} sipariş`, ms: Date.now() - t });
    } catch (e) {
      return json({ ok: false, message: e.message });
    }
  }

  if (path === 'products' && m === 'GET') return json(await listProducts(db, q));
  if (path === 'products' && m === 'POST') return json(await saveProduct(env, db, ctx, 0, await body(req)));
  if ((x = path.match(/^products\/(\d+)$/))) {
    const id = Number(x[1]);
    if (m === 'GET') return json(await productDetail(db, id));
    if (m === 'PUT') return json(await saveProduct(env, db, ctx, id, await body(req)));
    if (m === 'DELETE') {
      await db.batch([
        db.prepare('UPDATE listings SET product_id = NULL WHERE product_id = ?').bind(id),
        db.prepare('UPDATE order_items SET product_id = NULL WHERE product_id = ?').bind(id),
        db.prepare('DELETE FROM order_stock WHERE product_id = ?').bind(id),
        db.prepare('DELETE FROM stock_moves WHERE product_id = ?').bind(id),
        db.prepare('DELETE FROM products WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }
  if ((x = path.match(/^products\/(\d+)\/stock$/)) && m === 'POST') return json(await stockChange(env, db, ctx, Number(x[1]), await body(req)));

  if (path === 'listings' && m === 'GET') {
    const where = [], args = [];
    if (q.unlinked) where.push('l.product_id IS NULL');
    if (q.channel) { where.push('l.channel = ?'); args.push(q.channel); }
    if (q.q) { const s = '%' + q.q + '%'; where.push('(l.name LIKE ? OR l.sku LIKE ? OR l.barcode LIKE ?)'); args.push(s, s, s); }
    const rows = await all(db, `SELECT l.*, p.name AS product_name FROM listings l LEFT JOIN products p ON p.id = l.product_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.name LIMIT 300`, ...args);
    return json({ listings: rows });
  }
  if (path === 'listings/link' && m === 'POST') {
    const b = await body(req);
    let pid = b.product_id === null ? null : Number(b.product_id) || null;
    if (b.create) {
      const l = await first(db, 'SELECT * FROM listings WHERE channel = ? AND remote_id = ?', b.channel, String(b.remote_id));
      if (!l) fail(404, 'İlan bulunamadı');
      const t = Date.now();
      const r = await first(db, 'INSERT INTO products (sku, barcode, name, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        l.sku || null, l.barcode || null, l.name || l.sku || l.remote_id, l.image || '', l.price || 0, Math.max(0, l.remote_stock || 0), t, t);
      pid = r.id;
    }
    await run(db, 'UPDATE listings SET product_id = ?, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ?', pid, b.channel, String(b.remote_id));
    if (pid) await relinkItems(db);
    ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    return json({ ok: true, product_id: pid });
  }

  if (path === 'stats' && m === 'GET') return json(await stats(db, q));
  if (path === 'settings' && m === 'GET') return json(await getSettings(db));
  if (path === 'settings' && m === 'PUT') return json(await saveSettings(db, await body(req)));
  if (path === 'logs' && m === 'GET') return json(await all(db, 'SELECT * FROM logs ORDER BY id DESC LIMIT 200'));
  fail(404, 'Bulunamadı');
}
