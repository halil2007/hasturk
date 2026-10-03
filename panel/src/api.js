// Panel API'si (/api/*). Tüm adresler girişten sonra çalışır.
import { all, first, run, getSettings, setSetting, getRaw, log, DEFAULT_SETTINGS } from './db.js';
import { getChannels, channel, publicInfo, resetChannels, CHANNEL_IDS, GATED } from './channels/index.js';
import { loadConfig, saveConfig, describe } from './config.js';
import { syncAll, importListings, applyStock, pushStocks, pushPrices, autoLink, relinkItems, purgeDemo, DESIRED, catalogOf } from './sync.js';
import { suggestions, linkedGroups } from './match.js';
import { createJob, listJobs, runJobs, cancelJob } from './backfill.js';
import { checkBuybox, autoPrice, decide, BUYBOX_CHANNELS } from './buybox.js';
import { listQuestions, answerQuestion, syncQuestions } from './questions.js';
import { sendMail, orderMail, validEmail } from './mail.js';
import { listUsers, saveUser, changeOwnPassword } from './auth.js';
import { stats, summary, dashboard, insights } from './stats.js';
import { profit } from '../public/profit.js';
import { json, fail, body, num, str, r2, mergeStatus, STATUS, toB64, LATE, explainHttp } from './util.js';

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
// Etiketi kanalın servisinden alınan kanallar
const LABEL_REMOTE = ['ikas1', 'ikas2', 'trendyol', 'hepsiburada'];
const PKG_COLS = 'id, order_id, no, remote_id, items, status, remote_status, cargo_company, cargo_code, tracking, barcode, agreement, tracking_url, desi, created_at, shipped_at, packed_at, error, label_format, label_at, label_viewed_at, label_printed_at, label_prints, (label_data IS NOT NULL) AS has_label';

// ---------- siparişler ----------
async function loadOrder(db, id) {
  const o = await first(db, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) fail(404, 'Sipariş bulunamadı');
  o.address = parse(o.address, {});
  o.extra = parse(o.extra, {});
  o.items = await all(db, `SELECT i.*, p.name AS product_name, p.group_name AS product_group, p.variant_name AS product_variant, p.stock AS product_stock, p.purchase_price, p.desi, p.image AS product_image, l.commission AS listing_commission
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
    else if (st === 'late') where.push(LATE);
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
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND label_printed_at IS NOT NULL) AS printed,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND (label_data IS NOT NULL OR label_at IS NOT NULL OR ((COALESCE(barcode, '') != '' OR COALESCE(tracking, '') != '') AND (agreement = 'own' OR o.channel NOT IN (${LABEL_REMOTE.map((x) => `'${x}'`).join(',')}))))) AS labeled,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND error IS NOT NULL) AS pkg_errors,
      o.ship_by, o.ext_action,
      (SELECT MAX(cargo_company) FROM packages WHERE order_id = o.id AND cargo_company != '') AS pkg_cargo,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND product_id IS NULL) AS unmatched
    FROM orders o ${w} ORDER BY ${st === 'active' ? 'o.ordered_at ASC' : 'o.ordered_at DESC'} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = (await first(db, `SELECT COUNT(*) AS n FROM orders o ${w}`, ...args)).n;
  // Durum sayıları: seçili kanal / tarih / arama içinde (durum filtresi hariç)
  const f2 = orderFilter(q, { withStatus: false });
  const counts = await all(db, `SELECT o.status, COUNT(*) AS n FROM orders o ${f2.w} GROUP BY o.status`, ...f2.args);
  counts.push({ status: 'late', n: (await first(db, `SELECT COUNT(*) AS n FROM orders o ${f2.w ? f2.w + ' AND ' : 'WHERE '}${LATE}`, ...f2.args)).n });
  const byChannel = await all(db, "SELECT channel, COUNT(*) AS n FROM orders WHERE status IN ('new', 'processing') GROUP BY channel");
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
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), pendingByChannel: Object.fromEntries(byChannel.map((c) => [c.channel, c.n])), total, page, limit,
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

// Panelden yapılan sipariş işlemi kaydı (kanal tarafındaki değişikliklerden ayırmak için)
async function event(db, o, action, user, note) {
  await run(db, "INSERT INTO order_events (order_id, at, source, action, status, remote_status, note, user) VALUES (?, ?, 'panel', ?, ?, ?, ?, ?)",
    o.id, Date.now(), action, o.status, o.remote_status || '', note || null, user ? user.name : null);
}
// Kanalın döndürdüğü paket bilgisini pakete işle
async function updPkg(db, id, r = {}) {
  await run(db, `UPDATE packages SET remote_id = COALESCE(?, remote_id), remote_status = COALESCE(?, remote_status), barcode = COALESCE(NULLIF(?, ''), barcode),
    tracking = COALESCE(NULLIF(?, ''), tracking), cargo_company = COALESCE(NULLIF(?, ''), cargo_company), agreement = COALESCE(?, agreement), error = ? WHERE id = ?`,
  r.remoteId || null, r.remoteStatus || null, r.barcode || '', r.tracking || '', r.cargoCompany || '', r.agreement || null, r.error || null, id);
}
const clearLabel = (db, id) => run(db, 'UPDATE packages SET label_format = NULL, label_data = NULL, label_at = NULL, label_viewed_at = NULL, label_printed_at = NULL WHERE id = ?', id);

// Paketle (kargoya hazırla): paket kanalda oluşturulur / hazırlanıyor bildirilir. ikas: "Kargoya Hazır" → ikas Kargo barkod üretir.
async function packOrder(db, ch, o, { only, invoice } = {}) {
  o = await ensurePackages(db, ch, o);
  const todo = o.packages.filter((p) => p.status === 'open' && !p.packed_at && (!only || p.id === only));
  if (!todo.length) return { o, message: 'Paketler zaten hazır' };
  const errors = [];
  for (const p of todo) {
    try {
      if (ch && ch.enabled && ch.pack && !(ch.caps.pack === 'remote' && p.remote_id)) {
        const cargo = p.cargo_code ? { id: p.cargo_code, name: p.cargo_company } : null;
        const r = await ch.pack(o, [p], { cargo, invoiceNumber: invoice });
        await updPkg(db, p.id, r.packages[0]);
        if (r.packages[0] && r.packages[0].error) { errors.push(r.packages[0].error); continue; }
      }
      // Hepsiburada: paketlendikten sonra seçilen kargo firması uygulanır
      if (p.cargo_code && ch && ch.caps.cargo === 'change' && ch.changeCargo) {
        const fresh = await first(db, `SELECT ${PKG_COLS} FROM packages WHERE id = ?`, p.id);
        if (fresh.remote_id) await updPkg(db, p.id, await ch.changeCargo(o, { ...fresh, items: parse(fresh.items, []) }, { id: p.cargo_code, name: p.cargo_company }));
      }
      await run(db, 'UPDATE packages SET packed_at = ? WHERE id = ?', Date.now(), p.id);
    } catch (e) {
      await run(db, 'UPDATE packages SET error = ? WHERE id = ?', e.message.slice(0, 500), p.id);
      errors.push(e.message);
    }
  }
  if (o.status === 'new' && errors.length < todo.length) await setLocalStatus(db, o, 'processing');
  if (errors.length) fail(400, errors[0]);
  return { o: await loadOrder(db, o.id), message: ch && ch.pack ? `${todo.length} paket ${ch.name}'da kargoya hazırlandı` : `${todo.length} paket hazırlandı` };
}

async function orderAction(env, db, id, action, b, ctx, user) {
  let o = await loadOrder(db, id);
  const ch = await channel(env, db, o.channel);
  const settings = await getSettings(db);
  const live = !['cancelled', 'returned', 'delivered'].includes(o.status);
  const pkgOf = (pid) => { const p = o.packages.find((x) => x.id === Number(pid)); if (!p) fail(404, 'Paket bulunamadı'); return p; };
  if (action === 'accept') {
    if (o.status !== 'new') fail(400, 'Sadece yeni siparişler işleme alınabilir');
    if (ch && ch.enabled && ch.caps.accept === 'remote' && ch.accept) await ch.accept(o);
    await setLocalStatus(db, o, 'processing');
    await event(db, o, 'accept', user);
    return { ok: true, message: ch && ch.caps.accept === 'remote' ? `Sipariş işleme alındı (${ch.name}'a bildirildi)` : 'Sipariş işleme alındı' };
  }
  if (action === 'pack') {
    if (!live) fail(400, 'Bu siparişte işlem yapılamaz');
    const r = await packOrder(db, ch, o, { only: b.package_id ? Number(b.package_id) : null, invoice: str(b.invoice_number) });
    await event(db, o, 'pack', user);
    return { ok: true, message: r.message };
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
      await event(db, o, 'split', user);
      return { ok: true, message: r.message };
    }
    if (o.packages.some((p) => p.remote_id && ch && ch.caps.split !== 'remote-async')) fail(400, `Bu sipariş ${ch ? ch.name : 'kanal'}da paketlenmiş. Yeniden bölmek için önce paket menüsünden "Paketi iptal et" yapın.`);
    if (ch && ch.enabled && ch.caps.split === 'remote') {
      const r = await ch.split(o, groups);
      await run(db, 'DELETE FROM packages WHERE order_id = ? AND remote_id IS NULL', o.id);
      await insertPackages(db, o.id, r.packages.map((p, i) => ({ ...p, desi: groups[i] && groups[i].desi })));
      await run(db, 'UPDATE packages SET packed_at = ? WHERE order_id = ? AND remote_id IS NOT NULL AND packed_at IS NULL', Date.now(), o.id);
      await setLocalStatus(db, o, 'processing');
      await event(db, o, 'split', user);
      return { ok: true, message: r.message };
    }
    await run(db, "DELETE FROM packages WHERE order_id = ? AND remote_id IS NULL AND status = 'open'", o.id);
    await insertPackages(db, o.id, groups);
    if (o.status === 'new') await setLocalStatus(db, o, 'processing');
    await event(db, o, 'split', user);
    return { ok: true, message: `${groups.length} paket oluşturuldu` };
  }
  if (action === 'cargo') {
    // Kargo firması seç / değiştir (seçenekler kanaldan gelir)
    const pkg = pkgOf(b.package_id), cargo = b.cargo && { id: str(b.cargo.id), name: str(b.cargo.name) };
    if (!cargo || !cargo.name) fail(400, 'Kargo firması seçin');
    if (pkg.status === 'shipped') fail(400, 'Kargoya verilmiş paketin kargo firması değiştirilemez');
    if (!ch || !ch.enabled || !ch.cargoOptions) fail(400, `${ch ? ch.name : 'Bu kanal'} kargo firması seçimini API ile desteklemiyor`);
    // Henüz paketlenmemiş: seçim kaydedilir, paketlerken uygulanır
    if (!pkg.packed_at || (ch.caps.cargo === 'change' && !pkg.remote_id)) {
      await run(db, 'UPDATE packages SET cargo_code = ?, cargo_company = ? WHERE id = ?', cargo.id, cargo.id ? cargo.name : '', pkg.id);
      await event(db, o, 'cargo', user, cargo.name);
      return { ok: true, message: `Kargo firması: ${cargo.name} (paketlerken uygulanacak)` };
    }
    const r = await ch.changeCargo(o, pkg, cargo);
    await updPkg(db, pkg.id, { ...r, cargoCompany: r.cargoCompany || cargo.name });
    await run(db, 'UPDATE packages SET cargo_code = ?, packed_at = COALESCE(packed_at, ?) WHERE id = ?', cargo.id, Date.now(), pkg.id);
    // Kargo değişince eski etiket geçersizdir; ikas'ta paket yeniden oluştuğu için eski barkod da silinir
    if (r.resetLabel || r.remoteId !== pkg.remote_id) {
      await clearLabel(db, pkg.id);
      if (r.remoteId !== pkg.remote_id) await run(db, "UPDATE packages SET barcode = ?, tracking = ? WHERE id = ?", r.barcode || '', r.tracking || '', pkg.id);
    }
    await event(db, o, 'cargo', user, cargo.name);
    return { ok: true, message: `Kargo firması ${cargo.name} olarak değiştirildi; etiketi yeniden oluşturun` };
  }
  if (action === 'repack') {
    // ikas Kargo ile yeniden hazırla: elle kargo bilgisiyle oluşmuş paketi iptal edip takip bilgisi olmadan yeniden "Kargoya Hazır" yap
    const pkg = pkgOf(b.package_id);
    if (!ch || !ch.enabled || !ch.repack) fail(400, 'Bu kanalda desteklenmiyor');
    if (pkg.status === 'shipped') fail(400, 'Kargoya verilmiş paket yeniden hazırlanamaz');
    const r = await ch.repack(o, pkg);
    await run(db, "UPDATE packages SET remote_id = ?, remote_status = ?, barcode = '', tracking = '', cargo_company = ?, cargo_code = NULL, agreement = NULL, packed_at = ?, error = ? WHERE id = ?",
      r.remoteId, r.remoteStatus || '', r.cargoCompany || '', Date.now(), r.error || null, pkg.id);
    await clearLabel(db, pkg.id);
    await event(db, o, 'pack', user, `Paket ${pkg.no}: ikas Kargo ile yeniden hazırlandı`);
    return { ok: true, message: `Paket ${pkg.no} ikas'ta yeniden “Kargoya Hazır” yapıldı (kargo bilgisi ikas Kargo'ya bırakıldı)` };
  }
  if (action === 'cancel-package') {
    const pkg = pkgOf(b.package_id);
    if (pkg.status === 'shipped') fail(400, 'Kargoya verilmiş paket iptal edilemez');
    if (pkg.remote_id) {
      if (!ch || !ch.enabled || !ch.cancelPackage) fail(400, `${ch ? ch.name : 'Kanal'} paketi API ile iptal edilemiyor; kanal panelinden yapın`);
      await ch.cancelPackage(o, pkg);
    }
    await run(db, "UPDATE packages SET remote_id = NULL, remote_status = NULL, packed_at = NULL, barcode = '', tracking = '', error = NULL WHERE id = ?", pkg.id);
    await clearLabel(db, pkg.id);
    await event(db, o, 'cancel-package', user, `Paket ${pkg.no}`);
    return { ok: true, message: `Paket ${pkg.no} paketlemesi iptal edildi` };
  }
  if (action === 'ship') {
    o = await ensurePackages(db, ch, o);
    const pkg = b.package_id ? o.packages.find((p) => p.id === Number(b.package_id)) : o.packages.find((p) => p.status === 'open');
    if (!pkg) fail(400, 'Gönderilecek açık paket yok');
    const tracking = str(b.tracking) || pkg.tracking || pkg.barcode, cargo = str(b.cargo_company) || pkg.cargo_company || o.cargo_company;
    let res = {};
    if (ch && ch.enabled && ch.caps.ship === 'remote' && ch.ship) res = (await ch.ship(o, pkg, { cargoCompany: cargo, tracking, invoiceNumber: str(b.invoice_number) })) || {};
    const tn = res.tracking || tracking || '';
    await run(db, "UPDATE packages SET status = 'shipped', tracking = ?, cargo_company = ?, shipped_at = ?, packed_at = COALESCE(packed_at, ?), remote_id = COALESCE(remote_id, ?) WHERE id = ?", tn, cargo || '', Date.now(), Date.now(), res.remoteId || null, pkg.id);
    const left = await first(db, "SELECT COUNT(*) AS n FROM packages WHERE order_id = ? AND status = 'open'", o.id);
    if (!left.n) await setLocalStatus(db, o, 'shipped');
    else if (o.status === 'new') await setLocalStatus(db, o, 'processing');
    await run(db, "UPDATE orders SET tracking = CASE WHEN tracking IS NULL OR tracking = '' THEN ? ELSE tracking END, cargo_company = CASE WHEN cargo_company IS NULL OR cargo_company = '' THEN ? ELSE cargo_company END WHERE id = ?", tn, cargo || '', o.id);
    await event(db, o, 'ship', user, `Paket ${pkg.no}`);
    return { ok: true, message: left.n ? `Paket ${pkg.no} kargoya verildi (${left.n} paket kaldı)` : 'Sipariş kargoya verildi' };
  }
  if (action === 'tracking') {
    // Kanal dışı (kendi anlaşmanızla) gönderimde takip no elle girilir
    const pkg = pkgOf(b.package_id);
    await run(db, "UPDATE packages SET tracking = ?, cargo_company = ?, desi = ?, agreement = 'own' WHERE id = ?", str(b.tracking), str(b.cargo_company), num(b.desi, 0) || pkg.desi, pkg.id);
    await event(db, o, 'tracking', user);
    return { ok: true };
  }
  if (action === 'label') {
    o = await ensurePackages(db, ch, o);
    let pkg = b.package_id ? o.packages.find((p) => p.id === Number(b.package_id)) : o.packages[0];
    if (!pkg) fail(404, 'Paket bulunamadı');
    let packed = false;
    // Tek tıkla: paketlenmemişse önce kanalda paketlenir (kargoya hazırlanır), sonra etiket alınır
    if (live && pkg.status === 'open' && !pkg.packed_at && ch && ch.enabled && ch.pack) {
      await packOrder(db, ch, o, { only: pkg.id });
      await event(db, o, 'pack', user);
      o = await loadOrder(db, o.id); pkg = o.packages.find((p) => p.id === pkg.id); packed = true;
    }
    const r = await makeLabel(db, ch, o, pkg, settings, { refresh: !!b.refresh });
    if (r.official || r.panel) await event(db, o, 'label', user, `Paket ${pkg.no}`);
    return { ok: true, order: await loadOrder(db, o.id), package_id: pkg.id, packed, ...r, sender: settings.sender };
  }
  if (action === 'label-mark') {
    // Etiket durumu: görüntülendi / yazdırıldı (yalnızca kullanıcı onaylayınca) / yazdırılmadı
    const pkg = pkgOf(b.package_id), t = Date.now();
    if (b.kind === 'viewed') await run(db, 'UPDATE packages SET label_viewed_at = ? WHERE id = ?', t, pkg.id);
    else if (b.kind === 'printed') await run(db, 'UPDATE packages SET label_printed_at = ?, label_prints = label_prints + 1, label_viewed_at = COALESCE(label_viewed_at, ?) WHERE id = ?', t, t, pkg.id);
    else if (b.kind === 'unprinted') await run(db, 'UPDATE packages SET label_printed_at = NULL WHERE id = ?', pkg.id);
    else fail(400, 'Geçersiz işlem');
    if (b.kind !== 'viewed') await event(db, o, 'label-' + b.kind, user, `Paket ${pkg.no}`);
    return { ok: true };
  }
  if (action === 'status') {
    const s = str(b.status);
    if (!['new', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'].includes(s)) fail(400, 'Geçersiz durum');
    // Elle durum: panelde iz bırakır; "yeni"ye dönmek yerel işlemi temizler
    if (s === 'new') await run(db, 'UPDATE orders SET local_status = NULL, status = ? WHERE id = ?', 'new', o.id);
    else await run(db, 'UPDATE orders SET local_status = ?, status = ?, updated_at = ? WHERE id = ?', s, s, Date.now(), o.id);
    await applyStock(db, [o.id], settings);
    ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    await event(db, o, 'status', user, s);
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
// ikas: ikas Kargo etiket görseli / barkodu · Trendyol: ortak etiket (ZPL) ya da takip barkodu · Hepsiburada: paket etiketi (ZPL/PDF).
// Alınan etiket pakete kaydedilir; tekrar istenince kanala gidilmez. Oluşturma, görüntüleme ve yazdırma ayrı tutulur.
async function makeLabel(db, ch, o, pkg, settings, { refresh = false } = {}) {
  if (pkg.has_label && !refresh) {
    const r = await first(db, 'SELECT label_format, label_data FROM packages WHERE id = ?', pkg.id);
    return { official: { format: r.label_format, data: r.label_data, filename: `${o.channel}-${o.order_number}-${pkg.no}.${r.label_format}` } };
  }
  if (!ch || !ch.enabled || !ch.label) {
    // Deneme modu: kanal barkodu yerine örnek barkod
    if (ch && ch.demo && !pkg.barcode && !pkg.tracking) {
      pkg.barcode = `DEMO${o.order_number}${pkg.no}`.replace(/[^A-Z0-9]/gi, '');
      await run(db, 'UPDATE packages SET barcode = ?, packed_at = COALESCE(packed_at, ?) WHERE id = ?', pkg.barcode, Date.now(), pkg.id);
    }
    const code = pkg.barcode || pkg.tracking;
    if (code) await run(db, 'UPDATE packages SET label_at = COALESCE(label_at, ?) WHERE id = ?', Date.now(), pkg.id);
    return { official: null, panel: !!code, error: code ? null : `${ch ? ch.name : 'Kanal'} kargo barkodu henüz gelmedi; kanalda paketi kargoya hazırlayıp senkronlayın` };
  }
  let r;
  try { r = (await ch.label(o, pkg)) || {}; } catch (e) {
    await run(db, 'UPDATE packages SET error = ? WHERE id = ?', e.message.slice(0, 500), pkg.id);
    await log(db, o.channel, 'warn', `#${o.order_number} etiket alınamadı: ${e.message}`);
    return { official: null, error: e.message };
  }
  if (r.barcode || r.tracking || r.cargoCompany || r.remoteStatus) await updPkg(db, pkg.id, { barcode: r.barcode, tracking: r.tracking, cargoCompany: r.cargoCompany, remoteStatus: r.remoteStatus, agreement: r.agreement });
  // Gerçek gönderi / etiket henüz yok: işlem tamamlanmış sayılmaz (adım ve varsa gerçek barkod bilgisiyle döner)
  if (r.pending) return { official: null, pending: r.pending, step: r.step || null, barcodeOnly: !!r.barcodeOnly, repack: !!r.repack };
  if (r.panel) {
    await run(db, 'UPDATE packages SET label_at = COALESCE(label_at, ?), error = NULL WHERE id = ?', Date.now(), pkg.id);
    return { official: null, panel: true };
  }
  let lab = r.label;
  if (!lab) return { official: null, pending: `${ch.name} etiketi henüz hazır değil; birkaç dakika sonra tekrar deneyin.` };
  // ZPL'yi normal yazıcı için PDF'e çevir (Ayarlar'da açıksa)
  if (lab.format === 'zpl' && settings.zpl_pdf) {
    try {
      const res = await fetch('https://api.labelary.com/v1/printers/8dpmm/labels/4x6/', { method: 'POST', headers: { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' }, body: lab.data });
      if (res.ok) lab = { format: 'pdf', data: toB64(new Uint8Array(await res.arrayBuffer())), filename: lab.filename.replace(/\.zpl$/, '.pdf') };
    } catch { /* ZPL olarak kalır */ }
  }
  await run(db, 'UPDATE packages SET label_format = ?, label_data = ?, label_at = ?, error = NULL WHERE id = ?', lab.format, lab.data, Date.now(), pkg.id);
  return { official: lab };
}

// Kargo ekranı: paketler (etiket bekleyen / kargoya verilecek / kargoda) + henüz paketlenmemiş siparişler
async function listPackages(db, q) {
  const where = [], args = [];
  if (q.channel && CHANNEL_IDS.includes(q.channel)) { where.push('o.channel = ?'); args.push(q.channel); }
  const base = `FROM packages p JOIN orders o ON o.id = p.order_id`;
  // Etiket var: kanal etiketi alındı / geçerli panel etiketi oluşturuldu. Etiket servisi olan kanalda (ikas Kargo, Trendyol,
  // Hepsiburada) yalnızca barkod gelmiş olması "etiket hazır" sayılmaz; kendi anlaşmanızla gönderimde ve etiket servisi olmayan kanalda sayılır.
  const ready = `(p.label_data IS NOT NULL OR p.label_at IS NOT NULL OR ((COALESCE(p.tracking, '') != '' OR COALESCE(p.barcode, '') != '') AND (p.agreement = 'own' OR o.channel NOT IN (${LABEL_REMOTE.map((x) => `'${x}'`).join(',')}))))`;
  const live = "o.status NOT IN ('cancelled', 'returned', 'delivered')";
  // Hazırlanacak (etiket yok) → yazdırılacak (etiket var, yazdırılmadı) → kargoya verilecek (yazdırıldı) → kargoda
  const states = {
    waiting: `p.status = 'open' AND ${live} AND NOT ${ready}`,
    ready: `p.status = 'open' AND ${live} AND ${ready} AND p.label_printed_at IS NULL`,
    printed: `p.status = 'open' AND ${live} AND p.label_printed_at IS NOT NULL`,
    shipped: `p.status = 'shipped' AND p.shipped_at >= ${Date.now() - 30 * 864e5}`,
  };
  const st = states[q.state] ? q.state : 'waiting';
  const w = (s) => 'WHERE ' + [states[s], ...where].join(' AND ');
  const rows = await all(db, `SELECT p.id, p.order_id, p.no, p.status, p.cargo_company, p.tracking, p.barcode, p.agreement, p.tracking_url, p.desi, p.items, p.label_format, (p.label_data IS NOT NULL) AS has_label, p.shipped_at,
      p.packed_at, p.error, p.label_at, p.label_printed_at, p.remote_id,
      o.channel, o.order_number, o.customer, o.address, o.ordered_at, o.ship_by, o.status AS order_status, (SELECT COUNT(*) FROM packages x WHERE x.order_id = p.order_id) AS pkg_total
    ${base} ${w(st)} ORDER BY o.ordered_at ASC LIMIT 300`, ...args);
  const counts = {};
  for (const s of Object.keys(states)) counts[s] = (await first(db, `SELECT COUNT(*) AS n ${base} ${w(s)}`, ...args)).n;
  // Paketi olmayan ve hazırlanan siparişler: tek paket olarak işlenecekler
  const unpacked = st === 'waiting' ? await all(db, `SELECT o.id AS order_id, o.channel, o.order_number, o.customer, o.address, o.ordered_at, o.ship_by, o.status AS order_status, o.tracking, o.cargo_company,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id AND status != 'cancelled') AS qty
    FROM orders o WHERE o.status IN ('new', 'processing') AND NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id) ${where.length ? 'AND ' + where.join(' AND ') : ''} ORDER BY o.ordered_at ASC LIMIT 300`, ...args) : [];
  counts.waiting += st === 'waiting' ? unpacked.length : (await first(db, `SELECT COUNT(*) AS n FROM orders o WHERE o.status IN ('new', 'processing') AND NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id) ${where.length ? 'AND ' + where.join(' AND ') : ''}`, ...args)).n;
  const addr = (r) => { const a = parse(r.address, {}); return { ...r, city: a.city || '', district: a.district || '', address: undefined }; };
  return { state: st, packages: rows.map((r) => ({ ...addr(r), items: parse(r.items, []) })), unpacked: unpacked.map(addr), counts };
}

// ---------- buybox listesi ----------
async function listBuybox(db, q) {
  const where = [`l.channel IN (${BUYBOX_CHANNELS.map(() => '?').join(',')})`], args = [...BUYBOX_CHANNELS];
  if (BUYBOX_CHANNELS.includes(q.channel)) { where.push('l.channel = ?'); args.push(q.channel); }
  if (q.q) { const s = '%' + q.q + '%'; where.push('(l.name LIKE ? OR l.barcode LIKE ? OR l.sku LIKE ? OR p.name LIKE ?)'); args.push(s, s, s, s); }
  const F = { won: 'b.rank = 1', lost: 'b.rank > 1', multi: 'b.multi = 1', rules: 'r.enabled = 1', unchecked: 'b.checked_at IS NULL' };
  if (F[q.status]) where.push(F[q.status]);
  const base = `FROM listings l LEFT JOIN buybox b ON b.channel = l.channel AND b.remote_id = l.remote_id LEFT JOIN price_rules r ON r.channel = l.channel AND r.remote_id = l.remote_id LEFT JOIN products p ON p.id = l.product_id`;
  const w = 'WHERE ' + where.join(' AND ');
  const limit = Math.min(Number(q.limit) || 50, 200), page = Math.max(1, Number(q.page) || 1);
  const rows = await all(db, `SELECT l.channel, l.remote_id, l.name, l.barcode, l.sku, l.price, COALESCE(NULLIF(l.image, ''), p.image) AS image, p.name AS product_name,
      b.rank, b.prev_rank, b.buybox_price, b.second_price, b.third_price, b.multi, b.checked_at, b.error,
      r.enabled AS rule_on, r.min_price, r.max_price, r.target_price, r.step,
      (SELECT MAX(at) FROM price_changes c WHERE c.channel = l.channel AND c.remote_id = l.remote_id AND c.ok = 1) AS last_change
    ${base} ${w} ORDER BY COALESCE(r.enabled, 0) DESC, CASE WHEN b.rank > 1 THEN 0 WHEN b.rank = 1 THEN 1 ELSE 2 END, l.name COLLATE NOCASE LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = (await first(db, `SELECT COUNT(*) AS n ${base} ${w}`, ...args)).n;
  const cw = BUYBOX_CHANNELS.includes(q.channel) ? 'AND l.channel = ?' : '', ca = cw ? [q.channel] : [];
  const k = await first(db, `SELECT COUNT(*) AS total, SUM(b.checked_at IS NOT NULL) AS checked, SUM(b.rank = 1) AS won, SUM(b.rank > 1) AS lost, SUM(b.multi = 1) AS multi, SUM(r.enabled = 1) AS rules
    ${base} WHERE l.channel IN (${BUYBOX_CHANNELS.map(() => '?').join(',')}) ${cw}`, ...BUYBOX_CHANNELS, ...ca);
  return { rows, total, page, limit, kpi: Object.fromEntries(Object.entries(k).map(([a, v]) => [a, v || 0])) };
}

// ---------- ürünler ----------
const PRODUCT_FIELDS = ['sku', 'barcode', 'name', 'group_name', 'variant_name', 'brand', 'description', 'image', 'purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock', 'active'];
const NUMERIC = new Set(['purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock', 'active']);
function cleanProduct(b) {
  const o = {};
  for (const k of PRODUCT_FIELDS) if (k in b) o[k] = NUMERIC.has(k) ? num(b[k]) : str(b[k]) || null;
  if ('name' in o && !o.name) fail(400, 'Ürün adı gerekli');
  return o;
}

// Stok durumu: kritik eşik ürüne özel (critical_stock) ya da Ayarlar'daki genel sınır
const LIMIT = (low) => `(CASE WHEN p.critical_stock > 0 THEN p.critical_stock ELSE ${Math.max(0, Math.round(Number(low) || 0))} END)`;
async function listProducts(db, q) {
  const where = [], args = [];
  const low = LIMIT((await getSettings(db)).low_stock);
  if (q.q) { const s = '%' + q.q.trim() + '%'; where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.group_name LIKE ? OR p.brand LIKE ?)'); args.push(s, s, s, s, s); }
  if (q.filter === 'out') where.push('p.stock <= 0');
  if (q.filter === 'below') where.push(`p.stock > 0 AND p.stock <= ${low}`);
  if (q.filter === 'enough') where.push(`p.stock > ${low}`);
  if (q.filter === 'low') where.push(`p.stock <= ${low}`);
  if (q.filter === 'nocost') where.push('(p.purchase_price IS NULL OR p.purchase_price = 0)');
  if (q.filter === 'waiting') where.push(`EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.pushed_stock IS NOT NULL AND l.pushed_stock != ${DESIRED})`);
  if (q.filter === 'error') where.push('EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.error IS NOT NULL)');
  if (q.filter === 'nolisting') where.push('NOT EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id)');
  if (q.filter === 'passive') where.push('p.active = 0'); else if (q.filter !== 'all') where.push('p.active = 1');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 50, 500), page = Math.max(1, Number(q.page) || 1);
  // Ana ürün (varyant grubu) anahtarı: grup adı yoksa ürün adı
  const GK = "COALESCE(NULLIF(p.group_name, ''), p.name)";
  let rows, total, groups = null;
  if (q.group) {
    // Sayfalama ana ürün bazında: her sayfada N ana ürün ve tüm (filtreye uyan) varyantları
    const gks = (await all(db, `SELECT ${GK} AS gk FROM products p ${w} GROUP BY gk ORDER BY gk COLLATE NOCASE LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit)).map((r) => r.gk);
    rows = gks.length ? await all(db, `SELECT p.*, ${GK} AS gk, ${low} AS low_limit FROM products p ${w ? w + ' AND' : 'WHERE'} ${GK} IN (${gks.map(() => '?').join(',')})
      ORDER BY gk COLLATE NOCASE, p.variant_name COLLATE NOCASE, p.name COLLATE NOCASE`, ...args, ...gks) : [];
    groups = (await first(db, `SELECT COUNT(DISTINCT ${GK}) AS n FROM products p ${w}`, ...args)).n;
    total = (await first(db, `SELECT COUNT(*) AS n FROM products p ${w}`, ...args)).n;
  } else {
    rows = await all(db, `SELECT p.*, ${GK} AS gk, ${low} AS low_limit FROM products p ${w} ORDER BY ${q.sort === 'stock' ? 'p.stock ASC, p.name COLLATE NOCASE' : 'gk COLLATE NOCASE, p.variant_name COLLATE NOCASE, p.name COLLATE NOCASE'} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
    total = (await first(db, `SELECT COUNT(*) AS n FROM products p ${w}`, ...args)).n;
  }
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const ls = await all(db, `SELECT l.product_id, l.channel, l.remote_id, l.price, l.commission, l.pushed_stock, l.remote_stock, l.error, l.stock_mode, l.stock_value, l.match, l.image, ${DESIRED} AS desired
      FROM listings l JOIN products p ON p.id = l.product_id WHERE l.product_id IN (${ids.map(() => '?').join(',')})`, ...ids);
    for (const r of rows) r.listings = ls.filter((l) => l.product_id === r.id);
  }
  // Stok durumu sayıları (sekmeler için)
  const cnt = await first(db, `SELECT SUM(p.stock <= 0) AS out_, SUM(p.stock > 0 AND p.stock <= ${low}) AS below, SUM(p.stock > ${low}) AS enough, COUNT(*) AS total FROM products p WHERE p.active = 1`);
  return { products: rows, total, groups, page, limit, counts: { out: cnt.out_ || 0, below: cnt.below || 0, enough: cnt.enough || 0, all: cnt.total || 0 } };
}

async function stockChange(env, db, ctx, id, b, user) {
  const p = await first(db, 'SELECT id, stock FROM products WHERE id = ?', id);
  if (!p) fail(404, 'Ürün bulunamadı');
  const qty = Math.round(num(b.qty));
  const delta = b.mode === 'set' ? qty - p.stock : qty;
  if (!delta) return { ok: true, stock: p.stock };
  // Stok senkronu kapalıyken ana katalog (ikas) stoğu esastır: panelde yapılan değişiklik bir sonraki senkronda geri yazılırdı
  const settings = await getSettings(db);
  if (!settings.stock_sync) {
    const cats = catalogOf(settings);
    const src = await first(db, `SELECT channel FROM listings WHERE product_id = ? AND remote_stock IS NOT NULL AND channel IN (${cats.map(() => '?').join(',')}) LIMIT 1`, id, ...cats);
    if (src) fail(409, 'Stok senkronu kapalıyken stoklar ikas sitesinden okunur. Adedi ikas panelinden değiştirin (birkaç dakika içinde buraya yansır) ya da Ayarlar → Stok\'tan senkronu açın.');
  }
  const t = Date.now();
  await db.batch([
    db.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?').bind(delta, t, id),
    db.prepare('INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at, user) VALUES (?, ?, (SELECT stock FROM products WHERE id = ?), ?, ?, ?, ?)')
      .bind(id, delta, id, b.mode === 'set' ? 'Sayım / düzeltme' : delta > 0 ? 'Stok girişi' : 'Stok çıkışı', str(b.note) || null, t, user ? user.name : null),
  ]);
  ctx.waitUntil(pushStocks(env, db).catch(() => {}));
  return { ok: true, stock: p.stock + delta };
}

async function saveProduct(env, db, ctx, id, b, user) {
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
    if (b.stock !== undefined && b.stock !== '') await stockChange(env, db, ctx, id, { mode: 'set', qty: b.stock, note: 'Ürün formu' }, user);
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
  p.listings = await all(db, `SELECT l.*, ${DESIRED} AS desired FROM listings l JOIN products p ON p.id = l.product_id WHERE l.product_id = ?`, id);
  p.moves = await all(db, 'SELECT * FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 30', id);
  p.sales = await all(db, `SELECT o.channel, SUM(i.quantity) AS qty, SUM(i.total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE i.product_id = ? AND o.ordered_at >= ? AND o.status NOT IN ('cancelled', 'returned') AND i.status != 'cancelled' GROUP BY o.channel`, id, Date.now() - 30 * 864e5);
  return p;
}

// ---------- ayarlar ----------
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).concat(['stock_channels', 'logo']);
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
    if (k === 'low_stock') v = Math.max(0, Math.round(num(v, 5)));
    if (k === 'autoprice') v = !!v;
    if (k === 'answer_templates') v = (Array.isArray(v) ? v : []).map((t) => str(t).slice(0, 2000)).filter(Boolean).slice(0, 30);
    if (k === 'track_urls') v = Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).map(([a, b]) => [str(a).slice(0, 40), str(b).slice(0, 300)]).filter(([a, b]) => a && /^https:\/\/[^\s]+$/i.test(b) && b.includes('{no}')).slice(0, 30));
    if (k === 'label_size') v = ['100x150', 'a5', 'a4'].includes(v) ? v : '100x150';
    if (k === 'hold_channels') v = [...new Set((Array.isArray(v) ? v : []).filter((c) => CHANNEL_IDS.includes(c)))];
    if (k === 'mail_enabled') v = !!v;
    if (k === 'mail_to') {
      v = [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => str(x).toLowerCase()).filter(Boolean))].slice(0, 10);
      const bad = v.filter((x) => !validEmail(x));
      if (bad.length) fail(400, 'Geçersiz e-posta adresi: ' + bad.join(', '));
    }
    if (k === 'mail_channels') v = Object.fromEntries(CHANNEL_IDS.map((c) => [c, (v || {})[c] !== false]));
    if (k === 'panel_url') { v = str(v).replace(/\/+$/, ''); if (v && !/^https?:\/\/[^\s]+$/i.test(v)) fail(400, 'Panel adresi https:// ile başlamalı'); }
    if (k === 'catalog_channels') v = (Array.isArray(v) ? v : []).filter((c) => CHANNEL_IDS.includes(c));
    if (k === 'company') v = Object.fromEntries(['title', 'legal', 'phone', 'email', 'address', 'tax'].map((f) => [f, str((v || {})[f]).slice(0, 300)]));
    if (k === 'logo') { v = v ? String(v) : ''; if (v && (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v) || v.length > 400000)) fail(400, 'Logo PNG/JPG/WEBP/SVG ve en fazla ~300 KB olmalı'); }
    await setSetting(db, k, v);
  }
  return getSettings(db);
}

async function channelsInfo(env, db) {
  // Tek seferde: ilan sayıları + tüm kanalların son senkron durumu (kanal başına ayrı sorgu yapılmaz)
  const [counts, lasts, chs] = await Promise.all([
    all(db, 'SELECT channel, COUNT(*) AS n, SUM(product_id IS NOT NULL) AS linked, SUM(error IS NOT NULL) AS errors FROM listings GROUP BY channel'),
    all(db, "SELECT k, v FROM settings WHERE k LIKE 'last:%'"),
    getChannels(env, db),
  ]);
  const last = new Map(lasts.map((r) => { try { return [r.k.slice(5), JSON.parse(r.v)]; } catch { return [r.k.slice(5), null]; } }));
  return chs.map((c) => {
    const x = counts.find((r) => r.channel === c.id) || {};
    return { ...publicInfo(c), last: last.get(c.id) || null, listings: x.n || 0, linked: x.linked || 0, listingErrors: x.errors || 0 };
  });
}

// ---------- yönlendirme ----------
// Sadece yöneticinin yapabileceği işlemler (kanal API bilgileri, kullanıcılar, ayarlar, toplu aktarım)
const ADMIN_ONLY = [/^mail\//, /^integrations/, /^users/, /^purge-demo$/, /^backfill$/, /^backfill\//, /^import$/, /^price-rules$/];
export async function api(req, env, ctx, db, path, user = { id: 0, name: 'Yönetici', role: 'admin' }) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams), m = req.method;
  let x;
  // Tanılama personel için de açık (API bilgilerini göstermez)
  const diag = /^integrations\/[a-z0-9]+\/diagnose$/.test(path);
  if (user.role !== 'admin' && !diag && m !== 'GET' && (ADMIN_ONLY.some((r) => r.test(path)) || path === 'settings')) fail(403, 'Bu işlem için yönetici yetkisi gerekir');
  if (user.role !== 'admin' && !diag && (path === 'users' || path.startsWith('integrations'))) fail(403, 'Bu bölüm için yönetici yetkisi gerekir');
  if (path === 'summary' && m === 'GET') {
    const [qs, s, notices, match, st, chInfo] = await Promise.all([
      first(db, "SELECT COUNT(*) AS n FROM questions WHERE status = 'waiting'"),
      summary(db),
      first(db, 'SELECT COUNT(*) AS open, SUM(read = 0) AS unread FROM notices WHERE resolved_at IS NULL'),
      first(db, 'SELECT COUNT(*) AS n FROM listings WHERE product_id IS NULL AND ignored = 0'),
      getSettings(db),
      channelsInfo(env, db),
    ]);
    // E-postadaki "panelde aç" bağlantısı için panel adresi (yönetici girmediyse kullanılan adres)
    if (!st.panel_url && user.role === 'admin' && /^https:\/\//.test(url.origin)) { await setSetting(db, 'panel_url', url.origin); st.panel_url = url.origin; }
    return json({ ...s, channels: chInfo, settings: st, user, notices: { open: notices.open || 0, unread: notices.unread || 0 }, unmatched: match.n, questions: qs.n, demo: env.DEMO === '1' });
  }
  if (path === 'channels' && m === 'GET') return json(await channelsInfo(env, db));
  if (path === 'sync' && m === 'POST') { const b = await body(req); return json(await syncAll(env, db, { only: b.channels, force: !!b.force, listings: !!b.listings })); }
  if (path === 'import' && m === 'POST') { const b = await body(req); return json(await importListings(env, db, { only: b.channels })); }
  if (path === 'purge-demo' && m === 'POST') return json(await purgeDemo(db));

  // ---------- eşleştirme ----------
  if (path === 'match' && m === 'GET') {
    const [rows, counts] = await Promise.all([
      suggestions(db, { channel: q.channel, q: q.q, limit: Math.min(Number(q.limit) || 60, 200) }),
      all(db, `SELECT channel, SUM(product_id IS NULL AND ignored = 0) AS pending, SUM(product_id IS NULL AND ignored = 1) AS ignored,
        SUM(match IN ('barcode', 'sku', 'name')) AS auto, SUM(match = 'new') AS created, SUM(match = 'manual') AS manual, COUNT(*) AS total FROM listings GROUP BY channel`),
    ]);
    return json({ listings: rows, counts });
  }
  if (path === 'match/linked' && m === 'GET') {
    const where = ['l.product_id IS NOT NULL'], args = [];
    if (q.channel) { where.push('l.channel = ?'); args.push(q.channel); }
    if (q.how) { where.push('l.match = ?'); args.push(q.how); }
    if (q.q) { const s = '%' + q.q + '%'; where.push('(l.name LIKE ? OR l.sku LIKE ? OR p.name LIKE ?)'); args.push(s, s, s); }
    return json({ listings: await all(db, `SELECT l.channel, l.remote_id, l.name, l.sku, l.barcode, l.image, l.variant_name, l.match, p.id AS product_id, p.name AS product_name, p.sku AS product_sku, p.image AS product_image
      FROM listings l JOIN products p ON p.id = l.product_id WHERE ${where.join(' AND ')} ORDER BY l.channel, l.name LIMIT 300`, ...args) });
  }
  if (path === 'match/groups' && m === 'GET') return json(await linkedGroups(db, { channel: q.channel, q: q.q, how: q.how, multi: q.multi, page: Number(q.page) || 1 }));
  if (path === 'match/ignore' && m === 'POST') {
    const b = await body(req);
    await run(db, 'UPDATE listings SET ignored = ? WHERE channel = ? AND remote_id = ?', b.ignored === false ? 0 : 1, b.channel, String(b.remote_id));
    return json({ ok: true });
  }
  if (path === 'match/unlink' && m === 'POST') {
    const b = await body(req);
    // Kaldırılan eşleşme hatırlanır ("x:<ürün>"): otomatik eşleştirme bu ilanı aynı ürüne tekrar bağlamaz
    const l = await first(db, 'SELECT product_id, name FROM listings WHERE channel = ? AND remote_id = ?', b.channel, String(b.remote_id));
    await run(db, 'UPDATE listings SET product_id = NULL, match = ? WHERE channel = ? AND remote_id = ?', l && l.product_id ? 'x:' + l.product_id : null, b.channel, String(b.remote_id));
    await run(db, 'UPDATE order_items SET product_id = NULL WHERE remote_key = ? AND order_id LIKE ?', String(b.remote_id), b.channel + ':%');
    await log(db, b.channel, 'info', `${user.name}: ${l ? l.name : b.remote_id} eşleşmesi kaldırıldı`);
    return json({ ok: true });
  }
  // Kanala özel stok kuralı: shared | limit (en fazla N) | own (bu kanala ayrılmış N adet)
  if (path === 'listings/stock' && m === 'POST') {
    const b = await body(req);
    const mode = ['shared', 'limit', 'own'].includes(b.mode) ? b.mode : 'shared';
    const v = mode === 'shared' ? null : Math.max(0, Math.round(num(b.value)));
    await run(db, 'UPDATE listings SET stock_mode = ?, stock_value = ? WHERE channel = ? AND remote_id = ?', mode, v, b.channel, String(b.remote_id));
    await log(db, b.channel, 'info', `${user.name}: ${b.remote_id} stok kuralı → ${mode}${v != null ? ' ' + v : ''}`);
    ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    return json({ ok: true });
  }

  // ---------- müşteri soruları ----------
  if (path === 'questions' && m === 'GET') return json(await listQuestions(db, q));
  if (path === 'questions/sync' && m === 'POST') return json(await syncQuestions(env, db));
  if ((x = path.match(/^questions\/([a-z0-9]+)\/(.+)\/answer$/)) && m === 'POST') {
    const b = await body(req);
    try { return json(await answerQuestion(env, db, x[1], decodeURIComponent(x[2]), b.text, user)); } catch (e) { fail(400, e.message); }
  }

  // ---------- buybox ----------
  if (path === 'buybox' && m === 'GET') return json(await listBuybox(db, q));
  if (path === 'buybox/item' && m === 'GET') {
    const [l, b, r, history, changes] = await Promise.all([
      first(db, 'SELECT l.channel, l.remote_id, l.name, l.price, l.image, l.barcode, l.sku, p.name AS product_name, p.image AS product_image FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE l.channel = ? AND l.remote_id = ?', q.channel, q.remote_id),
      first(db, 'SELECT * FROM buybox WHERE channel = ? AND remote_id = ?', q.channel, q.remote_id),
      first(db, 'SELECT * FROM price_rules WHERE channel = ? AND remote_id = ?', q.channel, q.remote_id),
      all(db, 'SELECT at, rank, our_price, buybox_price, second_price, event FROM buybox_history WHERE channel = ? AND remote_id = ? ORDER BY at DESC LIMIT 60', q.channel, q.remote_id),
      all(db, 'SELECT * FROM price_changes WHERE channel = ? AND remote_id = ? ORDER BY at DESC LIMIT 40', q.channel, q.remote_id),
    ]);
    if (!l) fail(404, 'İlan bulunamadı');
    return json({ listing: l, buybox: b, rule: r, history, changes, preview: r && b ? decide({ ...r, enabled: 1 }, { rank: b.rank, buyboxPrice: b.buybox_price, second: b.second_price, multi: !!b.multi }, l.price) : null });
  }
  if (path === 'buybox/check' && m === 'POST') { const b = await body(req); return json(await checkBuybox(env, db, { channel: b.channel, ids: b.ids, limit: Math.min(Number(b.limit) || 100, 300) })); }
  if (path === 'price-rules' && m === 'PUT') {
    const b = await body(req);
    if (!BUYBOX_CHANNELS.includes(b.channel)) fail(400, 'Otomatik fiyat yalnızca Trendyol ve Hepsiburada için');
    const l = await first(db, 'SELECT price FROM listings WHERE channel = ? AND remote_id = ?', b.channel, String(b.remote_id));
    if (!l) fail(404, 'İlan bulunamadı');
    const min = r2(num(b.min_price)), max = r2(num(b.max_price)), target = r2(num(b.target_price) || max), step = r2(Math.max(0, num(b.step, 5)));
    const enabled = b.enabled ? 1 : 0;
    if (enabled && (!(min > 0) || !(max >= min))) fail(400, 'En düşük fiyat 0\'dan büyük, en yüksek fiyat en düşükten büyük ya da eşit olmalı');
    if (enabled && (target < min || target > max)) fail(400, 'Normal (hedef) fiyat en düşük ile en yüksek fiyat arasında olmalı');
    await run(db, `INSERT INTO price_rules (channel, remote_id, enabled, min_price, max_price, target_price, step, updated_at, user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (channel, remote_id) DO UPDATE SET enabled = excluded.enabled, min_price = excluded.min_price, max_price = excluded.max_price, target_price = excluded.target_price, step = excluded.step, updated_at = excluded.updated_at, user = excluded.user`,
    b.channel, String(b.remote_id), enabled, min || null, max || null, target || null, step, Date.now(), user.name);
    await log(db, b.channel, 'info', `${user.name}: ${b.remote_id} otomatik fiyat kuralı ${enabled ? `açık (min ${min}, max ${max}, hedef ${target}, fark ${step} TL)` : 'kapalı'}`);
    return json({ ok: true });
  }

  // ---------- geçmiş sipariş aktarımı ----------
  if (path === 'backfill' && m === 'GET') return json(await listJobs(db));
  if (path === 'backfill' && m === 'POST') {
    const b = await body(req);
    const d = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(s + 'T00:00:00Z') - 3 * 3600e3 : null);
    const from = d(b.from), to = d(b.to) != null ? d(b.to) + 864e5 : Date.now();
    if (from == null || from >= to) fail(400, 'Geçerli bir tarih aralığı seçin');
    const chs = (b.channels || []).filter((c) => CHANNEL_IDS.includes(c));
    if (!chs.length) fail(400, 'En az bir kanal seçin');
    for (const c of chs) await createJob(db, c, from, Math.min(to, Date.now()));
    await log(db, null, 'info', `${user.name}: geçmiş sipariş aktarımı başlatıldı (${chs.join(', ')}, ${b.from} – ${b.to || 'bugün'})`);
    return json({ ok: true, run: await runJobs(env, db, { budgetMs: 15000 }) });
  }
  if (path === 'backfill/run' && m === 'POST') return json({ ok: true, run: await runJobs(env, db, { budgetMs: 20000 }) });
  if ((x = path.match(/^backfill\/(.+)\/cancel$/)) && m === 'POST') { await cancelJob(db, decodeURIComponent(x[1])); return json({ ok: true }); }

  // ---------- kullanıcılar ----------
  if (path === 'users' && m === 'GET') return json(await listUsers(db));
  if (path === 'users' && m === 'POST') { const b = await body(req); try { await saveUser(db, 0, b); } catch (e) { fail(400, e.message); } await log(db, null, 'info', `${user.name}: kullanıcı eklendi (${b.username})`); return json({ ok: true }); }
  if ((x = path.match(/^users\/(\d+)$/)) && m === 'PUT') { try { await saveUser(db, Number(x[1]), await body(req)); } catch (e) { fail(400, e.message); } return json({ ok: true }); }
  if (path === 'me/password' && m === 'POST') { const b = await body(req); try { await changeOwnPassword(db, user, b.old, b.new); } catch (e) { fail(400, e.message); } return json({ ok: true }); }

  // ---------- bildirimler ----------
  if (path === 'notices' && m === 'GET') return json(await all(db, `SELECT * FROM notices ${q.all ? '' : 'WHERE resolved_at IS NULL'} ORDER BY resolved_at IS NOT NULL, last_at DESC LIMIT 200`));
  if (path === 'notices/read' && m === 'POST') { await run(db, 'UPDATE notices SET read = 1 WHERE read = 0'); return json({ ok: true }); }
  if ((x = path.match(/^notices\/(\d+)\/resolve$/)) && m === 'POST') { await run(db, 'UPDATE notices SET resolved_at = ?, read = 1 WHERE id = ?', Date.now(), Number(x[1])); return json({ ok: true }); }
  if (path === 'push-stock' && m === 'POST') return json(await pushStocks(env, db));

  if (path === 'orders' && m === 'GET') return json(await listOrders(db, q));
  if ((x = path.match(/^orders\/([^/]+)$/)) && m === 'GET') {
    const o = await loadOrder(db, decodeURIComponent(x[1]));
    const ch = await channel(env, db, o.channel);
    o.events = await all(db, 'SELECT at, source, action, status, remote_status, note, user FROM order_events WHERE order_id = ? ORDER BY at DESC LIMIT 30', o.id);
    return json({ order: o, profit: orderProfit(o, await getSettings(db)), channel: ch ? publicInfo(ch) : null });
  }
  // Kargo firması seçenekleri: kanalın kendi listesinden (ikas Kargo firmaları, Trendyol sağlayıcıları, HB değiştirilebilir firmalar)
  if ((x = path.match(/^orders\/([^/]+)\/cargo-options$/)) && m === 'GET') {
    const o = await loadOrder(db, decodeURIComponent(x[1]));
    const ch = await channel(env, db, o.channel);
    const pkg = o.packages.find((p) => p.id === Number(q.package_id)) || null;
    if (!ch || !ch.enabled || !ch.cargoOptions) return json({ options: [], note: `${ch ? ch.name : 'Bu kanal'} kargo firması seçimini API ile desteklemiyor` });
    if (ch.caps.cargo === 'change' && ch.type === 'hepsiburada' && (!pkg || !pkg.remote_id)) return json({ options: [], note: 'Hepsiburada kargo firması, paket oluşturulduktan sonra değiştirilebilir. Önce "Paketle".' });
    try { return json({ options: await ch.cargoOptions(o, pkg), current: pkg && pkg.cargo_company, code: pkg && pkg.cargo_code, mode: ch.caps.cargo }); } catch (e) { return json({ options: [], note: e.message }); }
  }
  if ((x = path.match(/^orders\/([^/]+)\/([a-z-]+)$/)) && m === 'POST') {
    const b = await body(req);
    return json(await orderAction(env, db, decodeURIComponent(x[1]), x[2], b, ctx, user));
  }
  if (path === 'orders-bulk' && m === 'POST') {
    const b = await body(req), done = [], errors = [];
    for (const id of (b.ids || []).slice(0, 100)) {
      try { await orderAction(env, db, id, b.action, b, ctx, user); done.push(id); } catch (e) { errors.push(`${id}: ${e.message}`); }
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
        // Etiket alınırken paketlenmemiş paketler önce kanalda kargoya hazırlanır
        if (b.fetch && ch && ch.enabled && ch.pack && o.packages.some((p) => p.status === 'open' && !p.packed_at) && !['cancelled', 'returned'].includes(o.status)) {
          try { o = (await packOrder(db, ch, o)).o; await event(db, o, 'pack', user); } catch (e) { errors.push(`${o.order_number}: ${e.message}`); o = await loadOrder(db, id); }
        }
        for (const pkg of o.packages.filter((p) => p.status === 'open' || b.all)) {
          const r = b.fetch || pkg.has_label ? await makeLabel(db, ch, o, pkg, settings) : {};
          if (r.error || r.pending) errors.push(`${o.order_number}/${pkg.no}: ${r.error || r.pending}`);
          labels.push({ package_id: pkg.id, official: r.official || null, panel: !!r.panel });
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
  // E-posta servisi bilgileri (gizli anahtar istemciye dönmez) ve deneme e-postası
  if (path === 'integrations/mail' && m === 'GET') return json(describe(env, await loadConfig(env, db), 'mail'));
  if (path === 'mail/test' && m === 'POST') {
    const settings = await getSettings(db), to = (settings.mail_to || []).filter(validEmail);
    if (!to.length) fail(400, 'Önce bildirim alacak e-posta adresini kaydedin');
    const chs = await getChannels(env, db), c = chs.find((x) => x.enabled) || { id: 'ikas1', name: 'HasTürk', type: 'ikas' };
    const sample = { id: 'deneme', order_number: 'DENEME-1', ordered_at: Date.now(), customer: 'Deneme Müşteri', address: JSON.stringify({ city: 'Konya', district: 'Selçuklu' }), total: 249.9 };
    const mail = orderMail(sample, [{ name: 'Örnek ürün', sku: 'ORNEK-1', quantity: 1, total: 249.9, status: '' }], c, settings.panel_url || url.origin);
    try { await sendMail(env, db, { to, subject: '[Deneme] ' + mail.subject, html: mail.html, text: mail.text }); } catch (e) { fail(400, 'E-posta gönderilemedi: ' + e.message); }
    await log(db, null, 'info', `${user.name}: deneme e-postası gönderildi (${to.join(', ')})`);
    return json({ ok: true, message: `Deneme e-postası gönderildi: ${to.join(', ')}` });
  }
  if ((x = path.match(/^integrations\/([a-z0-9]+)$/)) && m === 'PUT') {
    await saveConfig(env, db, x[1], await body(req));
    resetChannels();
    await log(db, x[1], 'info', 'API bilgileri panelden güncellendi');
    return json({ ok: true });
  }
  // Adım adım bağlantı tanılaması (isteğe bağlı sipariş için kargo/paket durumu)
  if ((x = path.match(/^integrations\/([a-z0-9]+)\/diagnose$/)) && m === 'POST') {
    const b = await body(req);
    resetChannels();
    let ch = await channel(env, db, x[1]);
    if (!ch) fail(404, 'Kanal bulunamadı');
    if (ch.gated) ch = ch.real;
    const checks = [{ name: 'API bilgileri', ok: ch.demo ? null : ch.enabled ? true : false, detail: ch.demo ? 'Girilmemiş' : ch.enabled ? 'Gerekli alanlar dolu' : 'Eksik: ' + (ch.missing || []).join(', ') }];
    if (ch.demo) checks.push({ name: 'Deneme modu', ok: null, detail: 'Bu kanal örnek veriyle çalışıyor (API bilgisi girilmemiş)' });
    let order = null;
    if (b.order_id) order = await first(db, 'SELECT remote_id, order_number FROM orders WHERE id = ?', String(b.order_id));
    if (ch.enabled && !ch.demo && ch.diagnose) checks.push(...await ch.diagnose({ orderId: order ? (ch.type === 'trendyol' || ch.type === 'hepsiburada' ? order.order_number : order.remote_id) : undefined }));
    else if (ch.enabled && !ch.demo) {
      const t = Date.now();
      try { const o = await ch.fetchOrders(t - 864e5, t); checks.push({ name: 'Siparişler (son 24 saat)', ok: true, detail: `${o.length} sipariş` }); } catch (e) { checks.push({ name: 'Siparişler', ok: false, detail: explainHttp(e.message) }); }
    }
    const last = await getRaw(db, 'last:' + ch.id);
    if (last) checks.push({ name: 'Son senkron', ok: last.ok === false ? false : true, detail: `siparişler ${last.ordersAt ? new Date(last.ordersAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'hiç başarılı olmadı'}${last.error ? ' · hata: ' + last.error : ''}${last.listingsError ? ' · ürün hatası: ' + last.listingsError : ''}` });
    await log(db, ch.id, 'info', `${user.name}: bağlantı tanılaması çalıştırıldı (${checks.filter((c) => c.ok === false).length} sorun)`);
    return json({ channel: ch.id, at: Date.now(), checks });
  }
  if ((x = path.match(/^integrations\/([a-z0-9]+)\/test$/)) && m === 'POST') {
    resetChannels();
    let ch = await channel(env, db, x[1]);
    if (!ch) fail(404, 'Kanal bulunamadı');
    const gated = !!ch.gated;
    if (gated) ch = ch.real; // bekleyen kanal: gerçek bağlantı denenir, başarılıysa onaylanır
    else if (ch.paused) return json({ ok: false, message: 'Kanal pasif' });
    if (!ch.enabled) return json({ ok: false, message: 'Eksik bilgi: ' + ch.missing.join(', ') });
    if (ch.demo) return json({ ok: true, message: 'Deneme modu: örnek veriyle çalışıyor' });
    const t = Date.now();
    try {
      const orders = await ch.fetchOrders(t - 24 * 3600e3, t);
      if (GATED.includes(ch.id)) { await setSetting(db, 'verified:' + ch.id, { at: Date.now() }); resetChannels(); await log(db, ch.id, 'info', 'Bağlantı onaylandı; kanal sipariş, ürün ve stok ekranlarına eklendi'); }
      return json({ ok: true, message: `Bağlantı başarılı · son 24 saatte ${orders.length} sipariş${gated ? ' · kanal devreye alındı' : ''}`, ms: Date.now() - t });
    } catch (e) {
      return json({ ok: false, message: e.message });
    }
  }

  if (path === 'products' && m === 'GET') return json(await listProducts(db, q));
  if (path === 'products' && m === 'POST') return json(await saveProduct(env, db, ctx, 0, await body(req), user));
  if ((x = path.match(/^products\/(\d+)$/))) {
    const id = Number(x[1]);
    if (m === 'GET') return json(await productDetail(db, id));
    if (m === 'PUT') return json(await saveProduct(env, db, ctx, id, await body(req), user));
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
  if ((x = path.match(/^products\/(\d+)\/stock$/)) && m === 'POST') return json(await stockChange(env, db, ctx, Number(x[1]), await body(req), user));

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
    // Bir ürüne her kanaldan yalnızca bir ilan bağlanabilir (aynı sitenin iki ürünü birleştirilmez)
    if (pid && !b.create) {
      const dup = await first(db, 'SELECT name FROM listings WHERE product_id = ? AND channel = ? AND remote_id != ?', pid, b.channel, String(b.remote_id));
      if (dup) fail(400, `Bu ürüne aynı kanaldan zaten bir ilan bağlı (${dup.name}). Önce o bağlantıyı kaldırın.`);
    }
    if (b.create) {
      const l = await first(db, 'SELECT * FROM listings WHERE channel = ? AND remote_id = ?', b.channel, String(b.remote_id));
      if (!l) fail(404, 'İlan bulunamadı');
      const t = Date.now();
      // SKU başka üründe varsa yeni ürün SKU'suz açılır (çakışma olmasın)
      const dup = l.sku ? await first(db, 'SELECT id FROM products WHERE LOWER(sku) = LOWER(?)', l.sku) : null;
      const r = await first(db, 'INSERT INTO products (sku, barcode, name, group_name, variant_name, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        dup ? null : l.sku || null, l.barcode || null, l.name || l.sku || l.remote_id, l.group_name || null, l.variant_name || null, l.image || '', l.price || 0, Math.max(0, l.remote_stock || 0), t, t);
      pid = r.id;
    }
    await run(db, 'UPDATE listings SET product_id = ?, match = ?, ignored = 0, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ?', pid, pid ? (b.create ? 'new' : 'manual') : null, b.channel, String(b.remote_id));
    if (pid) await relinkItems(db);
    await log(db, b.channel, 'info', `${user.name}: ${b.remote_id} ${pid ? (b.create ? 'yeni ürün olarak eklendi' : 'ürüne bağlandı') : 'bağlantısı kaldırıldı'}`);
    ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    return json({ ok: true, product_id: pid });
  }

  if (path === 'stats' && m === 'GET') return json(await stats(db, q));
  if (path === 'insights' && m === 'GET') return json(await insights(db, q));
  if (path === 'settings' && m === 'GET') return json(await getSettings(db));
  if (path === 'settings' && m === 'PUT') return json(await saveSettings(db, await body(req)));
  if (path === 'logs' && m === 'GET') return json(await all(db, 'SELECT * FROM logs ORDER BY id DESC LIMIT 200'));
  fail(404, 'Bulunamadı');
}
