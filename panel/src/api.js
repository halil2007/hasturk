// Panel API'si (/api/*). Tüm adresler girişten sonra çalışır.
import { all, first, run, getSettings, setSetting, getRaw, log, DEFAULT_SETTINGS } from './db.js';
import { getChannels, channel, publicInfo, resetChannels, CHANNEL_IDS, GATED, isChannelId } from './channels/index.js';
import { loadConfig, saveConfig, describe, addStore, removeStore, typeOf, isBeta, fieldsFor } from './config.js';
import { syncAll, importListings, applyStock, pushStocks, pushPrices, autoLink, relinkItems, purgeDemo, DESIRED, catalogOf, saveOrders, fillProductInfo, syncCosts } from './sync.js';
import { suggestions, linkedGroups, repairDuplicates, autoMatch, approveConfident, manualImport } from './match.js';
import { createJob, listJobs, runJobs, cancelJob } from './backfill.js';
import { checkBuybox, autoPrice, decide, BUYBOX_CHANNELS } from './buybox.js';
import { listQuestions, answerQuestion, syncQuestions } from './questions.js';
import { hbTest } from './hbtest.js';
import { suggestBarcode, assignBarcodes, barcodePrefix, missingBarcodes } from './barcodes.js';
import { previewSkus, suggestSku, assignSkus, skuPrefix } from './skus.js';
import { exportProducts, bulkUpdate } from './bulk.js';
import { publicKey, subscribe, unsubscribe, latest, notify } from './push.js';
import { pickList } from './picklist.js';
import { dailyDigest } from './digest.js';
import { listClaims, approveClaim, rejectClaim, claimReasons, syncClaims } from './claims.js';
import { sendMail, orderMail, validEmail, logoPath } from './mail.js';
import { catalogApi } from './catalog.js';
import * as customers from './customers.js';
import * as chp from './chproducts.js';
import { listUsers, saveUser, changeOwnPassword, revokeSessions, deleteUser, userActivity, twofaApi, resetTfa, security, setSecurity } from './auth.js';
import { stats, summary, dashboard, insights } from './stats.js';
import { costOf, COST_KEYS } from '../public/profit.js';
import { listSuggestions, applySuggestions } from './suggest.js';
import { recordError, errorsApi, clientReport } from './errors.js';
import { perfReport } from './perf.js';
import { mainKeysApi } from './extapi.js';
import { supportResponse } from './support.js';
import { can, sectionOf } from '../public/perms.js';
import { CURRENCIES, refreshRates, applyFx, rateOf, FX_DEFAULTS } from './fx.js';
import { orderProfit, breakdown, productProfit, listExpenses, saveExpense, deleteExpense, listInvoices, syncInvoices, settlementReport, syncSettlements } from './finance.js';
import { json, fail, body, num, str, r2, mergeStatus, STATUS, toB64, LATE, explainHttp, pool, imageList, chunk } from './util.js';

const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
// Etiketi kanalın servisinden alınan kanallar
// Etiketi kanalda oluşan kanal türleri (ek mağazalar dahil: ikas_3, trendyol_2, ...)
const LABEL_REMOTE = ['ikas', 'trendyol', 'hepsiburada'];
const bbIds = () => CHANNEL_IDS.filter((c) => BUYBOX_CHANNELS.includes(typeOf(c)));
const remoteLabel = (col) => `(${col} IN ('ikas1', 'ikas2', ${LABEL_REMOTE.slice(1).map((x) => `'${x}'`).join(', ')}) OR ${LABEL_REMOTE.map((x) => `${col} LIKE '${x}\\_%' ESCAPE '\\'`).join(' OR ')})`;
const PKG_COLS = 'id, order_id, no, remote_id, items, status, remote_status, cargo_company, cargo_code, cargo_applied, tracking, barcode, agreement, tracking_url, desi, created_at, shipped_at, packed_at, error, label_format, label_at, label_viewed_at, label_printed_at, label_prints, (label_data IS NOT NULL) AS has_label';

// ---------- siparişler ----------
async function loadOrder(db, id) {
  const o = await first(db, 'SELECT * FROM orders WHERE id = ?', id);
  if (!o) fail(404, 'Sipariş bulunamadı');
  o.address = parse(o.address, {});
  o.extra = parse(o.extra, {});
  // Müşterinin kaçıncı siparişi (tekrar eden müşteri)
  // Kalemler, paketler ve müşteri geçmişi aynı anda okunur (her sorgu ayrı gidiş-dönüş)
  const [cust, items, packages] = await Promise.all([
    o.ckey ? first(db, "SELECT COUNT(*) AS total, SUM(ordered_at <= ?) AS nth FROM orders WHERE ckey = ? AND status != 'cancelled'", o.ordered_at, o.ckey) : null,
    all(db, `SELECT i.*, p.name AS product_name, p.group_name AS product_group, p.variant_name AS product_variant, p.stock AS product_stock, p.purchase_price, p.desi, p.image AS product_image, l.commission AS listing_commission
    FROM order_items i LEFT JOIN products p ON p.id = i.product_id
    LEFT JOIN listings l ON l.channel = ? AND l.remote_id = i.remote_key
    WHERE i.order_id = ? ORDER BY i.rowid`, o.channel, id),
    all(db, `SELECT ${PKG_COLS} FROM packages WHERE order_id = ? ORDER BY no`, id),
  ]);
  if (cust) o.cust = cust;
  o.items = items;
  o.packages = packages.map((p) => ({ ...p, items: parse(p.items, []) }));
  return o;
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
  if (q.channel && isChannelId(q.channel)) { where.push('o.channel = ?'); args.push(q.channel); }
  const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(s + 'T00:00:00Z') - 3 * 3600e3 : null);
  if (day(q.from) != null) { where.push('o.ordered_at >= ?'); args.push(day(q.from)); }
  if (day(q.to) != null) { where.push('o.ordered_at < ?'); args.push(day(q.to) + 864e5); }
  if (q.cargo) { where.push('(o.cargo_company = ? OR EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id AND k.cargo_company = ?))'); args.push(q.cargo, q.cargo); }
  if (q.q) {
    const s = '%' + q.q.trim() + '%';
    // Eşleşen siparişler bir kez bulunur (sipariş başına alt sorgu yerine; büyük sipariş geçmişinde hızlı)
    where.push('o.id IN (SELECT id FROM orders WHERE order_number LIKE ? OR customer LIKE ? OR tracking LIKE ? UNION SELECT order_id FROM order_items WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ?)');
    args.push(s, s, s, s, s, s);
  }
  return { w: where.length ? 'WHERE ' + where.join(' AND ') : '', args, st };
}

async function listOrders(db, q) {
  const { w, args, st } = orderFilter(q);
  const limit = Math.min(Number(q.limit) || 25, 200), page = Math.max(1, Number(q.page) || 1);
  // Liste, toplam, durum sayıları ve ayarlar aynı anda okunur (sıralı gidiş-dönüş yerine tek bekleme)
  const f2 = orderFilter(q, { withStatus: false });
  const [rows, totalRow, counts, lateRow, byChannel, settings] = await Promise.all([all(db, `SELECT o.id, o.channel, o.order_number, o.status, o.remote_status, o.ordered_at, o.customer, o.address, o.total, o.tracking, o.cargo_company, o.extra, o.shipping_cost, o.shipping_src,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id AND status != 'cancelled') AS qty,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS lines,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id) AS packages,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND status = 'open') AS open_packages,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND label_printed_at IS NOT NULL) AS printed,
      (SELECT COUNT(*) FROM orders x WHERE x.ckey = o.ckey AND x.ordered_at <= o.ordered_at AND x.status != 'cancelled') AS cust_nth,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND (label_data IS NOT NULL OR label_at IS NOT NULL OR ((COALESCE(barcode, '') != '' OR COALESCE(tracking, '') != '') AND (agreement = 'own' OR NOT ${remoteLabel('o.channel')})))) AS labeled,
      (SELECT COUNT(*) FROM packages WHERE order_id = o.id AND error IS NOT NULL) AS pkg_errors,
      o.ship_by, o.ext_action,
      (SELECT MAX(cargo_company) FROM packages WHERE order_id = o.id AND cargo_company != '') AS pkg_cargo,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND product_id IS NULL) AS unmatched
    FROM orders o ${w} ORDER BY ${st === 'active' ? 'o.ordered_at ASC' : 'o.ordered_at DESC'} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit),
  first(db, `SELECT COUNT(*) AS n FROM orders o ${w}`, ...args),
  // Durum sayıları: seçili kanal / tarih / arama içinde (durum filtresi hariç)
  all(db, `SELECT o.status, COUNT(*) AS n FROM orders o ${f2.w} GROUP BY o.status`, ...f2.args),
  first(db, `SELECT COUNT(*) AS n FROM orders o ${f2.w ? f2.w + ' AND ' : 'WHERE '}${LATE}`, ...f2.args),
  all(db, "SELECT channel, COUNT(*) AS n FROM orders WHERE status IN ('new', 'processing') GROUP BY channel"),
  getSettings(db)]);
  const total = totalRow.n;
  counts.push({ status: 'late', n: lateRow.n });
  // Satır önizlemesi (görsel + ad + adet), ilk 2 ürün
  const items = {}, full = {};
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    for (const it of await all(db, `SELECT i.order_id, i.name, i.quantity, i.sku, i.total, i.status, i.commission, COALESCE(p.image, i.image) AS image, COALESCE(p.name, i.name) AS pname,
        p.purchase_price, l.commission AS listing_commission
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
      WHERE i.order_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.rowid`, ...ids)) {
      (items[it.order_id] = items[it.order_id] || []).push({ name: it.pname || it.name, qty: it.quantity, sku: it.sku, image: it.image || '' });
      (full[it.order_id] = full[it.order_id] || []).push(it);
    }
  }
  return {
    orders: rows.map((r) => {
      const a = parse(r.address, {});
      const pr = orderProfit({ channel: r.channel, shipping_cost: r.shipping_cost, shipping_src: r.shipping_src, items: full[r.id] || [] }, settings);
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
  // Excel formül enjeksiyonu: = + - @ ile başlayan hücre metin olarak yazılır (alıcı adı / adres pazaryerinden gelir)
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
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
    // Hepsiburada: paket oluşunca önceden seçilen / kanalın varsayılan kargo firması uygulanır
    const fresh = await loadOrder(db, o.id);
    for (const p of fresh.packages) await applyCargo(db, ch, fresh, p);
  } else {
    await insertPackages(db, o.id, [{ items, desi: orderDesi(o) }]);
  }
  return loadOrder(db, o.id);
}
// Kargo firması tercihi: paketin kendi seçimi → siparişte paketlemeden önce seçilen → kanalın varsayılanı (Ayarlar'dan değil, kargo seçim penceresinden)
const parseJ = (v) => { try { return JSON.parse(v || 'null'); } catch { return null; } };
async function wantedCargo(db, o, p) {
  if (p && p.cargo_code) return { id: p.cargo_code, name: p.cargo_company || p.cargo_code, explicit: true };
  const pick = parseJ(o.cargo_pick);
  if (pick && pick.id) return { ...pick, explicit: true };
  const def = ((await getRaw(db, 'cargo_default')) || {})[o.channel];
  return def && def.id ? def : null;
}
const sameFirm = (a, b) => { const k = (x) => String(x || '').toLocaleLowerCase('tr').replace(/kargo|lojistik|express|marketplace|\s|\./g, ''); return !!a && !!b && (k(a).includes(k(b)) || k(b).includes(k(a))); };
// Paket kanalda oluştuktan sonra tercih edilen firmaya çevir (zaten o firmadaysa dokunulmaz). Hata paketi durdurmaz; etikette firma seçimi sunulur.
async function applyCargo(db, ch, o, p) {
  if (!ch || ch.caps.cargo !== 'change' || !ch.changeCargo || !p.remote_id || p.status !== 'open') return;
  const want = await wantedCargo(db, o, p);
  if (!want || p.cargo_applied === want.id || (!want.explicit && sameFirm(want.name, p.cargo_company))) return;
  try {
    const r = await ch.changeCargo(o, p, want);
    await updPkg(db, p.id, { ...r, cargoCompany: r.cargoCompany || want.name });
    await run(db, 'UPDATE packages SET cargo_code = ?, cargo_applied = ? WHERE id = ?', want.id, want.id, p.id);
    if (r.resetLabel) await clearLabel(db, p.id);
  } catch (e) {
    // Varsayılan firma uygulanamadıysa (ör. paket zaten o firmada) sessiz geçilir; elle seçimde hata pakette görünür
    if (want.explicit) await run(db, 'UPDATE packages SET error = ? WHERE id = ?', `Kargo firması ${want.name} yapılamadı: ${e.message}`.slice(0, 500), p.id);
  }
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
  // ikas: gönderi ikas Kargo uygulamasıyla açılır; panel "Kargoya Hazır" işaretlemez (bkz. channels/ikas.js)
  if (ch && ch.caps && ch.caps.pack === 'external') fail(400, `${ch.name} siparişleri “${ch.caps.external.label}” ile gönderilir; gönderi oluşunca barkod ve etiket buraya gelir.`);
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
      // Paketlendikten sonra seçilen (ya da kanalın varsayılan) kargo firması uygulanır (Trendyol, Hepsiburada)
      if (ch && ch.caps.cargo === 'change' && ch.changeCargo) {
        const fresh = await first(db, `SELECT ${PKG_COLS} FROM packages WHERE id = ?`, p.id);
        if (fresh.remote_id) await applyCargo(db, ch, o, { ...fresh, items: parse(fresh.items, []) });
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
    // Kargo firması seç / değiştir (seçenekler kanaldan gelir). İsteğe bağlı: bu kanalda varsayılan yap
    const cargo = b.cargo && { id: str(b.cargo.id), name: str(b.cargo.name) };
    if (!cargo || !cargo.name) fail(400, 'Kargo firması seçin');
    if (b.make_default) {
      const all_ = (await getRaw(db, 'cargo_default')) || {};
      all_[o.channel] = { id: cargo.id, name: cargo.name };
      await setSetting(db, 'cargo_default', all_);
    }
    // Paket henüz yok (Hepsiburada'da paket kanalda oluşur): seçim siparişte saklanır, paketlenince uygulanır
    if (!b.package_id) {
      if (!ch || !ch.enabled || !ch.cargoOptions) fail(400, `${ch ? ch.name : 'Bu kanal'} kargo firması seçimini API ile desteklemiyor`);
      await run(db, 'UPDATE orders SET cargo_pick = ? WHERE id = ?', JSON.stringify(cargo), o.id);
      await event(db, o, 'cargo', user, cargo.name);
      return { ok: true, message: `Kargo firması: ${cargo.name} (paketlerken uygulanacak)${b.make_default ? ' · bu kanalda varsayılan yapıldı' : ''}` };
    }
    const pkg = pkgOf(b.package_id);
    if (pkg.status === 'shipped') fail(400, 'Kargoya verilmiş paketin kargo firması değiştirilemez');
    if (!ch || !ch.enabled || !ch.cargoOptions) fail(400, `${ch ? ch.name : 'Bu kanal'} kargo firması seçimini API ile desteklemiyor`);
    // Henüz paketlenmemiş: seçim kaydedilir, paketlerken uygulanır
    if (!pkg.packed_at || (ch.caps.cargo === 'change' && !pkg.remote_id)) {
      await run(db, 'UPDATE packages SET cargo_code = ?, cargo_company = ? WHERE id = ?', cargo.id, cargo.id ? cargo.name : '', pkg.id);
      await event(db, o, 'cargo', user, cargo.name);
      return { ok: true, message: `Kargo firması: ${cargo.name} (paketlerken uygulanacak)${b.make_default ? ' · bu kanalda varsayılan yapıldı' : ''}` };
    }
    const r = await ch.changeCargo(o, pkg, cargo);
    await updPkg(db, pkg.id, { ...r, cargoCompany: r.cargoCompany || cargo.name });
    await run(db, 'UPDATE packages SET cargo_code = ?, cargo_applied = ?, packed_at = COALESCE(packed_at, ?) WHERE id = ?', cargo.id, cargo.id, Date.now(), pkg.id);
    // Kargo değişince eski etiket geçersizdir; ikas'ta paket yeniden oluştuğu için eski barkod da silinir
    if (r.resetLabel || r.remoteId !== pkg.remote_id) {
      await clearLabel(db, pkg.id);
      if (r.remoteId !== pkg.remote_id) await run(db, "UPDATE packages SET barcode = ?, tracking = ? WHERE id = ?", r.barcode || '', r.tracking || '', pkg.id);
    }
    await event(db, o, 'cargo', user, cargo.name);
    return { ok: true, message: `Kargo firması ${cargo.name} olarak değiştirildi; etiketi yeniden oluşturun` };
  }
  // Siparişi kanaldan hemen yenile (ör. ikas Kargo'da gönderi oluşturulduktan sonra barkod / etiket için senkronu beklemeden)
  if (action === 'refresh') {
    if (!ch || !ch.enabled || !ch.fetchOne) fail(400, 'Bu kanalda desteklenmiyor');
    const r = await ch.fetchOne(o.remote_id);
    await saveOrders(db, ch.id, [r]);
    return { ok: true, order: await loadOrder(db, o.id) };
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
    // ikas: yalnız ikas Kargo gönderisi kargoya verilebilir; elle takip bilgisi kabul edilmez
    if (ch && ch.caps && ch.caps.manualTracking === false) {
      if (!pkg.remote_id || !(pkg.barcode || pkg.tracking)) fail(400, `${ch.name}: bu pakette ikas Kargo gönderisi yok. Önce “Paketle ve etiket al” (ya da ikas panelinde ikas Kargo ile Gönder); elle kargo bilgisi girilmez.`);
      b = { ...b, tracking: '', cargo_company: '' };
    }
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
    // Kanal dışı (kendi anlaşmanızla) gönderimde takip no elle girilir — ikas'ta yok: gönderi yalnız ikas Kargo ile
    if (ch && ch.caps && ch.caps.manualTracking === false) fail(400, `${ch.name}: takip / kargo bilgisi elle girilmez; gönderi ${ch.type === 'ikas' ? 'ikas Kargo' : 'kanalın kargosu'} ile yapılır`);
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
  // Kayıtlı ZPL etiketini PDF olarak ver (normal yazıcı); always: bundan sonra etiketler hep PDF'e çevrilsin
  if (action === 'label-pdf') {
    const pkg = pkgOf(b.package_id);
    const row = await first(db, 'SELECT label_format, label_data FROM packages WHERE id = ?', pkg.id);
    if (!row || !row.label_data) fail(400, 'Bu pakette kayıtlı etiket yok; önce etiketi alın');
    let lab = { format: row.label_format, data: row.label_data, filename: `${o.channel}-${o.order_number}-${pkg.no}.${row.label_format}` };
    if (lab.format === 'zpl') {
      // Önce kanalın kendi PDF etiketi (Hepsiburada verir); olmazsa ZPL dış serviste (Labelary) PDF'e çevrilir
      let own = null;
      if (ch && ch.enabled && ch.label && ch.type === 'hepsiburada') { try { const x = await ch.label(o, pkg, { prefer: 'pdf' }); if (x && x.label && x.label.format === 'pdf') own = x.label; } catch { /* çeviriyle devam */ } }
      if (own) lab = own;
      else { try { lab = await zplToPdf(lab); } catch (e) { fail(502, e.message); } }
    }
    if (b.always) await setSetting(db, 'zpl_pdf', true);
    return { ok: true, official: lab };
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
    const sc = b.shipping_cost === '' || b.shipping_cost == null ? null : num(b.shipping_cost);
    // Elle girilen kargo gideri korunur (kanalın kargo faturası bunun üzerine yazmaz); boşaltılırsa yeniden kanaldan alınır
    await run(db, 'UPDATE orders SET note = ?, shipping_cost = ?, shipping_src = ? WHERE id = ?', str(b.note), sc, sc == null ? null : sc === o.shipping_cost && o.shipping_src === 'api' ? 'api' : 'manual', o.id);
    return { ok: true };
  }
  if (action === 'reset-packages') {
    if (o.packages.some((p) => p.status === 'shipped' || p.remote_id)) fail(400, 'Kanalda oluşmuş veya kargoya verilmiş paketler silinemez');
    await run(db, 'DELETE FROM packages WHERE order_id = ?', o.id);
    return { ok: true };
  }
  fail(404, 'Bilinmeyen işlem');
}

// ZPL (termal yazıcı) etiketini PDF'e çevir (Labelary). Etiket boyutu ZPL'deki genişlik / uzunluktan (203 dpi), yoksa 4×6 inç (10×15 cm).
export async function zplToPdf(lab) {
  const z = String(lab.data || ''), dots = (re, d) => { const m = re.exec(z); return m ? Number(m[1]) : d; };
  const inch = (v, d) => Math.min(15, Math.max(1, Math.round((v / 203.2) * 10) / 10 || d));
  const w = inch(dots(/\^PW(\d+)/, 812), 4), h = inch(dots(/\^LL(\d+)/, 1218), 6);
  const res = await fetch(`https://api.labelary.com/v1/printers/8dpmm/labels/${w}x${h}/`, { method: 'POST', headers: { Accept: 'application/pdf', 'Content-Type': 'application/x-www-form-urlencoded' }, body: z });
  if (!res.ok) throw new Error(`ZPL etiketi PDF'e çevrilemedi (Labelary HTTP ${res.status}: ${(await res.text()).slice(0, 160)})`);
  return { format: 'pdf', data: toB64(new Uint8Array(await res.arrayBuffer())), filename: String(lab.filename || 'etiket.zpl').replace(/\.zpl$/, '.pdf') };
}

// ---------- kargo etiketi (kanalın kendi sisteminden) ----------
// ikas: ikas Kargo etiket görseli / barkodu · Trendyol: ortak etiket (ZPL) ya da takip barkodu · Hepsiburada: paket etiketi (ZPL/PDF).
// Alınan etiket pakete kaydedilir; tekrar istenince kanala gidilmez. Oluşturma, görüntüleme ve yazdırma ayrı tutulur.
async function makeLabel(db, ch, o, pkg, settings, { refresh = false } = {}) {
  if (pkg.has_label && !refresh) {
    const r = await first(db, 'SELECT label_format, label_data FROM packages WHERE id = ?', pkg.id);
    let lab = { format: r.label_format, data: r.label_data, filename: `${o.channel}-${o.order_number}-${pkg.no}.${r.label_format}` };
    // Kayıtlı ZPL, "PDF'e çevir" açıksa PDF olarak verilir (kayıt ZPL kalır: termal yazıcı için de indirilebilir)
    if (lab.format === 'zpl' && settings.zpl_pdf) { try { lab = await zplToPdf(lab); } catch { /* ZPL olarak */ } }
    return { official: lab };
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
  try { r = (await ch.label(o, pkg, { prefer: settings.zpl_pdf ? 'pdf' : null })) || {}; } catch (e) {
    await run(db, 'UPDATE packages SET error = ? WHERE id = ?', e.message.slice(0, 500), pkg.id);
    await log(db, o.channel, 'warn', `#${o.order_number} etiket alınamadı: ${e.message}`);
    return { official: null, error: e.message };
  }
  if (r.barcode || r.tracking || r.cargoCompany || r.remoteStatus) await updPkg(db, pkg.id, { barcode: r.barcode, tracking: r.tracking, cargoCompany: r.cargoCompany, remoteStatus: r.remoteStatus, agreement: r.agreement });
  // Gerçek gönderi / etiket henüz yok: işlem tamamlanmış sayılmaz (adım ve varsa gerçek barkod bilgisiyle döner)
  if (r.pending) { if (r.changeCargo) await run(db, 'UPDATE packages SET error = ? WHERE id = ?', r.pending.slice(0, 500), pkg.id); return { official: null, pending: r.pending, step: r.step || null, barcodeOnly: !!r.barcodeOnly, repack: !!r.repack, external: !!r.external, cancelable: !!r.cancelable, changeCargo: !!r.changeCargo }; }
  if (r.panel) {
    await run(db, 'UPDATE packages SET label_at = COALESCE(label_at, ?), error = NULL WHERE id = ?', Date.now(), pkg.id);
    return { official: null, panel: true, note: r.note || null };
  }
  let lab = r.label;
  if (!lab) return { official: null, pending: `${ch.name} etiketi henüz hazır değil; birkaç dakika sonra tekrar deneyin.` };
  // ZPL'yi normal yazıcı için PDF'e çevir (Ayarlar'da açıksa; olmazsa ZPL kalır, çıktıda PDF'e çevirme sorulur)
  if (lab.format === 'zpl' && settings.zpl_pdf) { try { lab = await zplToPdf(lab); } catch { /* ZPL olarak kalır */ } }
  await run(db, 'UPDATE packages SET label_format = ?, label_data = ?, label_at = ?, error = NULL WHERE id = ?', lab.format, lab.data, Date.now(), pkg.id);
  return { official: lab };
}

// Kargo ekranı: paketler (etiket bekleyen / kargoya verilecek / kargoda) + henüz paketlenmemiş siparişler
async function listPackages(db, q) {
  const where = [], args = [];
  if (q.channel && isChannelId(q.channel)) { where.push('o.channel = ?'); args.push(q.channel); }
  const base = `FROM packages p JOIN orders o ON o.id = p.order_id`;
  // Etiket var: kanal etiketi alındı / geçerli panel etiketi oluşturuldu. Etiket servisi olan kanalda (ikas Kargo, Trendyol,
  // Hepsiburada) yalnızca barkod gelmiş olması "etiket hazır" sayılmaz; kendi anlaşmanızla gönderimde ve etiket servisi olmayan kanalda sayılır.
  const ready = `(p.label_data IS NOT NULL OR p.label_at IS NOT NULL OR ((COALESCE(p.tracking, '') != '' OR COALESCE(p.barcode, '') != '') AND (p.agreement = 'own' OR NOT ${remoteLabel('o.channel')})))`;
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
  // Paketler, sekme sayıları ve paketsiz siparişler aynı anda okunur
  const keys = Object.keys(states), noPkg = `FROM orders o WHERE o.status IN ('new', 'processing') AND NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id) ${where.length ? 'AND ' + where.join(' AND ') : ''}`;
  const [rows, unpacked, extraWaiting, ...cn] = await Promise.all([all(db, `SELECT p.id, p.order_id, p.no, p.status, p.cargo_company, p.tracking, p.barcode, p.agreement, p.tracking_url, p.desi, p.items, p.label_format, (p.label_data IS NOT NULL) AS has_label, p.shipped_at,
      p.packed_at, p.error, p.label_at, p.label_printed_at, p.remote_id,
      o.channel, o.order_number, o.customer, o.address, o.ordered_at, o.ship_by, o.status AS order_status, (SELECT COUNT(*) FROM packages x WHERE x.order_id = p.order_id) AS pkg_total
    ${base} ${w(st)} ORDER BY o.ordered_at ASC LIMIT 300`, ...args),
    // Paketi olmayan ve hazırlanan siparişler: tek paket olarak işlenecekler
    st === 'waiting' ? all(db, `SELECT o.id AS order_id, o.channel, o.order_number, o.customer, o.address, o.extra, o.ordered_at, o.ship_by, o.status AS order_status, o.tracking, o.cargo_company,
      (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id AND status != 'cancelled') AS qty
    ${noPkg} ORDER BY o.ordered_at ASC LIMIT 300`, ...args) : [],
    st === 'waiting' ? null : first(db, `SELECT COUNT(*) AS n ${noPkg}`, ...args),
    ...keys.map((k) => first(db, `SELECT COUNT(*) AS n ${base} ${w(k)}`, ...args))]);
  const counts = Object.fromEntries(keys.map((k, i) => [k, cn[i].n]));
  counts.waiting += st === 'waiting' ? unpacked.length : extraWaiting.n;
  const addr = (r) => { const a = parse(r.address, {}), x = parse(r.extra, {}); return { ...r, city: a.city || '', district: a.district || '', address: undefined, extra: undefined, cargo_choice: x.cargoChoice || '' }; };
  return { state: st, packages: rows.map((r) => ({ ...addr(r), items: parse(r.items, []) })), unpacked: unpacked.map(addr), counts };
}

// ---------- buybox listesi ----------
async function listBuybox(db, q) {
  const bb = bbIds();
  const where = [`l.channel IN (${bb.map(() => '?').join(',')})`], args = [...bb];
  if (bb.includes(q.channel)) { where.push('l.channel = ?'); args.push(q.channel); }
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
  const cw = bb.includes(q.channel) ? 'AND l.channel = ?' : '', ca = cw ? [q.channel] : [];
  const k = await first(db, `SELECT COUNT(*) AS total, SUM(b.checked_at IS NOT NULL) AS checked, SUM(b.rank = 1) AS won, SUM(b.rank > 1) AS lost, SUM(b.multi = 1) AS multi, SUM(r.enabled = 1) AS rules
    ${base} WHERE l.channel IN (${bb.map(() => '?').join(',')}) ${cw}`, ...bb, ...ca);
  return { rows, total, page, limit, kpi: Object.fromEntries(Object.entries(k).map(([a, v]) => [a, v || 0])) };
}

// ---------- ürünler ----------
const PRODUCT_FIELDS = ['sku', 'barcode', 'name', 'group_name', 'variant_name', 'brand', 'category', 'description', 'image', 'purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock', 'active', 'currency', 'fx_price', 'fx_margin'];
const NUMERIC = new Set(['purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock', 'active', 'fx_price']);
// Görsel bağlantıları: dizi ya da satır satır metin → tekrarsız https adresleri
const imagesIn = (v) => imageList(Array.isArray(v) ? v : String(v || '').split(/[\s,]+/));
function cleanProduct(b) {
  const o = {};
  for (const k of PRODUCT_FIELDS) if (k in b) o[k] = NUMERIC.has(k) ? num(b[k]) : str(b[k]) || null;
  if ('name' in o && !o.name) fail(400, 'Ürün adı gerekli');
  // Döviz: yalnız USD / EUR / GBP; ürüne özel kâr payı boşsa genel ayar kullanılır
  if ('currency' in o && !CURRENCIES.includes(o.currency)) o.currency = null;
  if ('fx_margin' in o) o.fx_margin = b.fx_margin === '' || b.fx_margin == null ? null : num(b.fx_margin);
  // Görseller: elle düzenlenen liste (images_manual = 1) ya da "kanaldan otomatik al" (images_auto: senkron doldurur)
  if (b.images_auto) { o.images = null; o.images_manual = 0; }
  else if ('images' in b) { const l = imagesIn(b.images); o.images = l.length ? JSON.stringify(l) : null; o.images_manual = 1; if (!o.image && !b.image && l[0]) o.image = l[0]; }
  return o;
}

// Stok durumu: kritik eşik ürüne özel (critical_stock) ya da Ayarlar'daki genel sınır
const LIMIT = (low) => `(CASE WHEN p.critical_stock > 0 THEN p.critical_stock ELSE ${Math.max(0, Math.round(Number(low) || 0))} END)`;
export const RUNOUT_DAYS = 14;
// Hız: son 30 gün satışları ürün başına tek seferde toplanır (ürün başına alt sorgu yerine; büyük katalogda 10 kat hızlı)
const SOLD_JOIN = () => `LEFT JOIN (SELECT i.product_id AS pid, SUM(i.quantity) AS s FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.ordered_at >= ${Date.now() - 30 * 864e5}
  AND o.status NOT IN ('cancelled', 'returned') AND COALESCE(i.status, '') != 'cancelled' AND i.product_id IS NOT NULL GROUP BY i.product_id) s30 ON s30.pid = p.id`;
const S30 = 'COALESCE(s30.s, 0)';
async function listProducts(db, q) {
  const where = [], args = [];
  const low = LIMIT((await getSettings(db)).low_stock);
  // Tükenmek üzere: mevcut satış hızıyla 14 gün içinde bitecek ürünler
  if (q.filter === 'runout') where.push(`p.stock > 0 AND ${S30} > 0 AND p.stock * 30.0 / ${S30} <= ${RUNOUT_DAYS}`);
  if (q.q) { const s = '%' + q.q.trim() + '%'; where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.group_name LIKE ? OR p.brand LIKE ?)'); args.push(s, s, s, s, s); }
  if (q.filter === 'out') where.push('p.stock <= 0');
  if (q.filter === 'below') where.push(`p.stock > 0 AND p.stock <= ${low}`);
  if (q.filter === 'enough') where.push(`p.stock > ${low}`);
  if (q.filter === 'low') where.push(`p.stock <= ${low}`);
  if (q.filter === 'nocost') where.push('(p.purchase_price IS NULL OR p.purchase_price = 0)');
  if (q.filter === 'waiting') where.push(`EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.pushed_stock IS NOT NULL AND l.pushed_stock != ${DESIRED})`);
  if (q.filter === 'error') where.push('EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.error IS NOT NULL)');
  if (q.filter === 'nosku') where.push("COALESCE(TRIM(p.sku), '') = ''");
  if (q.filter === 'nobarcode') where.push("COALESCE(TRIM(p.barcode), '') = ''");
  if (q.filter === 'nolisting') where.push('NOT EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id)');
  if (q.filter === 'passive') where.push('p.active = 0'); else if (q.filter !== 'all') where.push('p.active = 1');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 50, 500), page = Math.max(1, Number(q.page) || 1);
  // Ana ürün (varyant grubu) anahtarı: grup adı yoksa ürün adı
  const GK = "COALESCE(NULLIF(p.parent_key, ''), NULLIF(p.group_name, ''), p.name)";
  // Sıralama: ürün (varyant) satırları için ve ana ürün (grup) için toplu karşılığı
  const MARGIN = 'CASE WHEN p.sale_price > 0 AND p.purchase_price > 0 THEN (p.sale_price - p.purchase_price) / p.sale_price END';
  const NAME = "COALESCE(NULLIF(p.group_name, ''), p.name) COLLATE NOCASE";
  const SORTS = {
    stock: ['p.stock ASC', 'SUM(p.stock) ASC'], stock_desc: ['p.stock DESC', 'SUM(p.stock) DESC'],
    price_desc: ['p.sale_price DESC', 'MAX(p.sale_price) DESC'], price_asc: ['p.sale_price ASC', 'MIN(p.sale_price) ASC'],
    margin_desc: [`${MARGIN} DESC NULLS LAST`, `AVG(${MARGIN}) DESC NULLS LAST`], margin_asc: [`${MARGIN} ASC NULLS LAST`, `AVG(${MARGIN}) ASC NULLS LAST`],
    new: ['p.created_at DESC', 'MAX(p.created_at) DESC'], sold: [`${S30} DESC, (p.stock > 0) DESC`, `SUM(${S30}) DESC, MAX(p.stock > 0) DESC`],
    // Kaç gün yeter (satış hızına göre); satışı olmayan en sona
    days: [`CASE WHEN ${S30} > 0 THEN p.stock * 30.0 / ${S30} ELSE 1e9 END ASC`, `MIN(CASE WHEN ${S30} > 0 THEN p.stock * 30.0 / ${S30} ELSE 1e9 END) ASC`],
  };
  const so = SORTS[q.sort];
  // Satış toplamı yalnız gereken sorgulara eklenir (satışa göre sıralama / tükenecekler süzgeci)
  const SJ = so && ['sold', 'days'].includes(q.sort) || q.filter === 'runout' ? SOLD_JOIN() : '';
  // Sayfa satırları, toplamlar ve stok sekmesi sayıları aynı anda okunur
  const page1 = async () => {
    if (!q.group) return all(db, `SELECT p.*, ${GK} AS gk, ${low} AS low_limit FROM products p ${SJ} ${w} ORDER BY ${so ? so[0] + ', ' : ''}${NAME}, gk, p.variant_name COLLATE NOCASE, p.name COLLATE NOCASE LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
    // Sayfalama ana ürün bazında: her sayfada N ana ürün ve tüm (filtreye uyan) varyantları; grup sırası korunur
    const gks = (await all(db, `SELECT ${GK} AS gk, MIN(${NAME}) AS gn FROM products p ${SJ} ${w} GROUP BY gk ORDER BY ${so ? so[1] + ', ' : ''}gn COLLATE NOCASE LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit)).map((r) => r.gk);
    if (!gks.length) return [];
    const list = await all(db, `SELECT p.*, ${GK} AS gk, ${low} AS low_limit FROM products p ${SJ} ${w ? w + ' AND' : 'WHERE'} ${GK} IN (${gks.map(() => '?').join(',')})
      ORDER BY ${NAME}, gk, p.variant_name COLLATE NOCASE, p.name COLLATE NOCASE`, ...args, ...gks);
    const at = new Map(gks.map((g, i) => [g, i]));
    return list.sort((a, b) => at.get(a.gk) - at.get(b.gk));
  };
  const [rows, totalRow, groupRow, cnt, ro, st] = await Promise.all([
    page1(),
    first(db, `SELECT COUNT(*) AS n FROM products p ${q.filter === 'runout' ? SJ : ''} ${w}`, ...args),
    q.group ? first(db, `SELECT COUNT(DISTINCT ${GK}) AS n FROM products p ${q.filter === 'runout' ? SJ : ''} ${w}`, ...args) : null,
    first(db, `SELECT SUM(p.stock <= 0) AS out_, SUM(p.stock > 0 AND p.stock <= ${low}) AS below, SUM(p.stock > ${low}) AS enough, COUNT(*) AS total FROM products p WHERE p.active = 1`),
    first(db, `SELECT COUNT(*) AS n FROM products p ${SOLD_JOIN().replace('LEFT JOIN', 'JOIN')} WHERE p.active = 1 AND p.stock > 0 AND p.stock * 30.0 / s30.s <= ${RUNOUT_DAYS}`),
    // Katalog özeti (Ürünler sayfası kartları ve filtre sayıları)
    first(db, `SELECT SUM(active = 0) AS passive, SUM(active = 1 AND (purchase_price IS NULL OR purchase_price = 0)) AS nocost, SUM(active = 1 AND COALESCE(TRIM(sku), '') = '') AS nosku,
      SUM(active = 1 AND COALESCE(TRIM(barcode), '') = '') AS nobarcode, SUM(active = 1 AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id)) AS nolisting,
      SUM(CASE WHEN active = 1 AND stock > 0 THEN stock * COALESCE(purchase_price, 0) ELSE 0 END) AS stock_value, SUM(CASE WHEN active = 1 AND stock > 0 THEN stock * sale_price ELSE 0 END) AS sale_value,
      AVG(CASE WHEN active = 1 AND sale_price > 0 AND purchase_price > 0 THEN (sale_price - purchase_price) / sale_price END) AS margin FROM products p`),
  ]);
  const total = totalRow.n, groups = groupRow ? groupRow.n : null;
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const [ls, soldRows] = await Promise.all([all(db, `SELECT l.product_id, l.channel, l.remote_id, l.price, l.commission, l.pushed_stock, l.remote_stock, l.error, l.stock_mode, l.stock_value, l.match, l.image, ${DESIRED} AS desired
      FROM listings l JOIN products p ON p.id = l.product_id WHERE l.product_id IN (${ids.map(() => '?').join(',')})`, ...ids),
    // Satış hızı: son 30 günde satılan adet ve mevcut stokla kaç gün yeteceği
    all(db, `SELECT i.product_id AS id, SUM(i.quantity) AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id IN (${ids.map(() => '?').join(',')}) AND o.ordered_at >= ?
      AND o.status NOT IN ('cancelled', 'returned') AND COALESCE(i.status, '') != 'cancelled' GROUP BY i.product_id`, ...ids, Date.now() - 30 * 864e5)]);
    for (const r of rows) r.listings = ls.filter((l) => l.product_id === r.id);
    const sold = new Map(soldRows.map((x) => [x.id, x.n]));
    for (const r of rows) { r.sold30 = sold.get(r.id) || 0; r.days_left = r.sold30 > 0 ? Math.floor((Math.max(0, r.stock) * 30) / r.sold30) : null; }
  }
  return { products: rows, total, groups, page, limit, counts: { out: cnt.out_ || 0, below: cnt.below || 0, enough: cnt.enough || 0, runout: ro.n || 0, all: cnt.total || 0 },
    stats: Object.fromEntries(Object.entries(st || {}).map(([k, v]) => [k, k === 'margin' ? (v == null ? null : r2(v * 100)) : Math.round(v || 0)])) };
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

async function saveProduct(env, db, ctx, id, b, user, { push = true } = {}) {
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
  if (b.images_auto) await fillProductInfo(db).catch(() => {});
  // Kanal ilanları: fiyat / komisyon
  for (const l of b.listings || []) {
    const cur = await first(db, 'SELECT price, list_price, commission, commission_src FROM listings WHERE channel = ? AND remote_id = ? AND product_id = ?', l.channel, String(l.remote_id), id);
    if (!cur) continue;
    const price = l.price === '' || l.price == null ? cur.price : num(l.price);
    const dirty = price !== cur.price ? 1 : 0;
    // Elle girilen komisyon korunur (API'den gelen gerçek oran bunun üzerine yazmaz); boş bırakılırsa API / kanal oranı kullanılır
    const com = l.commission === '' || l.commission == null ? null : num(l.commission);
    const same = cur.commission != null && com != null && Math.abs(cur.commission - com) < 0.001;
    await run(db, 'UPDATE listings SET price = ?, commission = ?, commission_src = ?, price_dirty = MAX(price_dirty, ?) WHERE channel = ? AND remote_id = ?',
      price, com, com == null ? null : same ? cur.commission_src || 'manual' : 'manual', dirty, l.channel, String(l.remote_id));
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
  // Döviz fiyatlı ürün: TL fiyatı ve kanal fiyatları hemen güncel kurla hesaplanır
  if (!env.TENANT_SLUG && ('fx_price' in b || 'currency' in b)) {
    const pr = await first(db, 'SELECT currency, fx_price FROM products WHERE id = ?', id);
    if (pr && pr.currency && pr.fx_price > 0) {
      const settings = await getSettings(db);
      try { await applyFx(db, settings, await refreshRates(db, settings), { user: user.name, ids: [id] }); } catch (e) { errors.push('Döviz kuru alınamadı: ' + e.message); }
    }
  }
  if (push) ctx.waitUntil(pushPrices(env, db).catch(() => {}));
  return { ok: true, id, created, errors };
}

async function productDetail(db, id) {
  const p = await first(db, 'SELECT * FROM products WHERE id = ?', id);
  if (!p) fail(404, 'Ürün bulunamadı');
  p.listings = await all(db, `SELECT l.*, ${DESIRED} AS desired FROM listings l JOIN products p ON p.id = l.product_id WHERE l.product_id = ?`, id);
  p.moves = await all(db, 'SELECT * FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 30', id);
  // Aynı ana ürünün varyantları (tek ekrandan düzenleme için)
  const gk = p.parent_key || p.group_name;
  p.siblings = gk ? (await all(db, "SELECT id FROM products WHERE COALESCE(NULLIF(parent_key, ''), NULLIF(group_name, ''), name) = ? LIMIT 300", gk)).map((r) => r.id) : [id];
  p.sales = await all(db, `SELECT o.channel, SUM(i.quantity) AS qty, SUM(i.total) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE i.product_id = ? AND o.ordered_at >= ? AND o.status NOT IN ('cancelled', 'returned') AND i.status != 'cancelled' GROUP BY o.channel`, id, Date.now() - 30 * 864e5);
  return p;
}

// ---------- ayarlar ----------
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).concat(['stock_channels', 'logo']);
// Tarayıcıya yalnız panel ayarları gider; iç kayıtlar (bildirim imza anahtarı, senkron imleçleri, giriş sayaçları …) gitmez
// Logo: içerik yerine önbelleklenebilir adresi gider (özet her açılışta yüzlerce KB taşımasın)
const publicSettings = (st, env) => ({ ...Object.fromEntries(SETTING_KEYS.filter((k) => k in st).map((k) => [k, st[k]])), logo: logoPath(env, st) });
async function saveSettings(db, b) {
  const cur = await getSettings(db);
  for (const k of Object.keys(b)) {
    if (!SETTING_KEYS.includes(k) || k === 'stock_since') continue;
    if (k === 'logo' && /^\/api\/logo/.test(String(b[k] || ''))) continue; // değişmedi (tarayıcıdaki adres)
    let v = b[k];
    if (k === 'stock_sync') {
      v = !!v;
      if (v && !cur.stock_sync) await setSetting(db, 'stock_since', Date.now());
    }
    // Kanal giderleri: yalnız gönderilen kanallar yazılır; ek mağazada boş bırakılan değer silinir (ana mağazanınki kullanılır)
    if (COST_KEYS.includes(k)) {
      const next = { ...(cur[k] || {}) };
      for (const [c, x] of Object.entries(v && typeof v === 'object' ? v : {})) {
        if (!isChannelId(c)) continue;
        if (x === '' || x == null) { if (/_\d+$/.test(c)) delete next[c]; continue; }
        next[c] = num(x, costOf(cur, k, c));
      }
      v = next;
    }
    if (k === 'fx') {
      const o = v && typeof v === 'object' ? v : {};
      v = { source: o.source === 'live' ? 'live' : 'tcmb', kind: ['buy', 'sell', 'bbuy', 'bsell'].includes(o.kind) ? o.kind : 'sell', mode: ['live', 'daily', 'weekly', 'monthly', 'manual'].includes(o.mode) ? o.mode : 'daily',
        threshold: Math.max(0, Math.min(20, num(o.threshold, 0.5))), rounding: ['none', 'int', '90', '99'].includes(o.rounding) ? o.rounding : 'none', margin: Math.max(-50, Math.min(500, num(o.margin, 0))) };
    }
    if (k === 'history_days') v = Math.min(365, Math.max(1, Math.round(num(v, 30))));
    if (k === 'low_stock') v = Math.max(0, Math.round(num(v, 5)));
    if (k === 'autoprice') v = !!v;
    if (k === 'answer_templates') v = (Array.isArray(v) ? v : []).map((t) => str(t).slice(0, 2000)).filter(Boolean).slice(0, 30);
    if (k === 'track_urls') v = Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).map(([a, b]) => [str(a).slice(0, 40), str(b).slice(0, 300)]).filter(([a, b]) => a && /^https:\/\/[^\s]+$/i.test(b) && b.includes('{no}')).slice(0, 30));
    if (k === 'label_size') v = ['100x150', 'a5', 'a4'].includes(v) ? v : '100x150';
    if (k === 'stock_push' || k === 'auto_upload') v = Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([c]) => isChannelId(c)).map(([c, x]) => [c, !!x]));
    if (k === 'hold_channels') v = [...new Set((Array.isArray(v) ? v : []).filter((c) => isChannelId(c)))];
    if (k === 'mail_enabled' || k === 'daily_digest') v = !!v;
    if (k === 'mail_to') {
      v = [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => str(x).toLowerCase()).filter(Boolean))].slice(0, 10);
      const bad = v.filter((x) => !validEmail(x));
      if (bad.length) fail(400, 'Geçersiz e-posta adresi: ' + bad.join(', '));
    }
    if (k === 'mail_channels') v = { ...(cur.mail_channels || {}), ...Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([c]) => isChannelId(c)).map(([c, x]) => [c, x !== false])) };
    if (k === 'panel_url') { v = str(v).replace(/\/+$/, ''); if (v && !/^https?:\/\/[^\s]+$/i.test(v)) fail(400, 'Panel adresi https:// ile başlamalı'); }
    if (k === 'catalog_channels') v = (Array.isArray(v) ? v : []).filter((c) => isChannelId(c));
    if (k === 'company') v = Object.fromEntries(['title', 'legal', 'phone', 'email', 'address', 'tax'].map((f) => [f, str((v || {})[f]).slice(0, 300)]));
    if (k === 'logo') { v = v ? String(v) : ''; if (v && (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v) || v.length > 400000)) fail(400, 'Logo PNG/JPG/WEBP/SVG ve en fazla ~300 KB olmalı'); }
    await setSetting(db, k, v);
  }
  return getSettings(db);
}

async function clearFailures(db, id, note) {
  const last = (await getRaw(db, 'last:' + id)) || {};
  await setSetting(db, 'last:' + id, { ...last, ok: last.ordersAt ? true : null, error: null, fails: 0, nextTry: null, listingsError: null, listingsFails: 0, note, noteAt: Date.now() });
  await run(db, "UPDATE notices SET resolved_at = ? WHERE resolved_at IS NULL AND key IN (?, ?)", Date.now(), 'orders:' + id, 'listings:' + id);
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

// Kampanya kanalı: istek kanal kimliğiyle gelir (hepsiburada, hepsiburada_2 …)
async function campaignApi(env, db, path, m, q, b, user) {
  const id = str(q.channel || b.channel);
  const c = (await getChannels(env, db)).find((x) => x.id === id && x.enabled && x.campaigns);
  if (!c) fail(400, 'Kampanya servisi olan bağlı kanal seçin');
  const K = c.campaigns;
  if (path === 'campaigns' && m === 'GET') return K.list(Math.max(1, Number(q.page) || 1), 50);
  if (path === 'campaigns/meta' && m === 'GET') {
    const [budgets, limits, categories] = await Promise.all([K.budgets().catch(() => []), K.limits().catch(() => null), K.categories().catch(() => [])]);
    return { budgets: budgets || [], limits, categories: (categories || []).filter((x) => x.isCampaign !== false).map((x) => ({ id: x.categoryId, name: x.categoryName, leaf: !!x.isLeaf, level: x.categoryLevel })) };
  }
  let x;
  if ((x = path.match(/^campaigns\/(\w+)$/)) && m === 'GET') return K.detail(x[1]);
  if (path === 'campaigns' && m === 'POST') {
    const kind = str(b.kind), n = (v) => Math.round(num(v));
    const name = str(b.name).trim();
    if (!name) fail(400, 'Kampanya adı gerekli');
    const start = Date.parse(b.startDate), end = Date.parse(b.endDate);
    if (!start || !end || end <= start) fail(400, 'Başlangıç ve bitiş tarihini kontrol edin');
    const scope = { conditionCategories: (b.categories || []).length ? b.categories.map(Number) : null, conditionSkus: (b.skus || []).length ? b.skus.map(String) : null };
    const base = { name, description: str(b.description) || name, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(), ...scope, oneTimeUsage: !!b.oneTimeUsage };
    let body2;
    if (kind === 'percent') body2 = { ...base, discountPercentage: n(b.discountPercentage), conditionAmount: n(b.conditionAmount), maxDiscountAmount: n(b.maxDiscountAmount), maxCartCount: n(b.maxCartCount) };
    else if (kind === 'tl') body2 = { ...base, budget: n(b.budget), discountAmount: n(b.discountAmount), conditionAmount: n(b.conditionAmount) };
    else if (kind === 'xy') body2 = { ...base, conditionProductCount: n(b.conditionProductCount), mustPayProductCount: n(b.mustPayProductCount), iterationCount: n(b.iterationCount) || 1, maxCartCount: n(b.maxCartCount) };
    else fail(400, 'Kampanya türü seçin');
    const r = await K.create(kind, body2);
    await log(db, c.id, 'info', `${user.name}: kampanya oluşturuldu — ${name}`);
    return { ok: true, result: r };
  }
  if ((x = path.match(/^campaigns\/(\w+)\/cancel$/)) && m === 'POST') { await K.cancel(x[1]); await log(db, c.id, 'info', `${user.name}: kampanya iptal edildi (${x[1]})`); return { ok: true }; }
  fail(404, 'Bulunamadı');
}

// İade reddine eklenen belge (fotoğraf / PDF): tarayıcıdan base64 gelir, en fazla 5 MB
function claimFile(f) {
  if (!f || !f.data) return null;
  if (String(f.data).length > 7e6) fail(400, 'Dosya en fazla 5 MB olabilir'); // çözmeden önce boyut
  if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(f.type || '')) fail(400, 'Yalnız JPEG, PNG ya da PDF eklenebilir');
  const bin = Uint8Array.from(atob(String(f.data)), (c) => c.charCodeAt(0));
  if (bin.length > 5 * 1024 * 1024) fail(400, 'Dosya en fazla 5 MB olabilir');
  // Dosyanın gerçek türü (bildirilen türe güvenilmez): PDF / PNG / JPEG imzası
  const sig = (...b) => b.every((x, i) => bin[i] === x);
  if (!(sig(0x25, 0x50, 0x44, 0x46) || sig(0x89, 0x50, 0x4e, 0x47) || sig(0xff, 0xd8, 0xff))) fail(400, 'Dosya JPEG, PNG ya da PDF değil');
  return new File([bin], String(f.name || 'belge').slice(0, 80), { type: f.type });
}

// ---------- yönlendirme ----------
// Sadece yöneticinin yapabileceği işlemler (kanal API bilgileri, kullanıcılar, ayarlar, toplu aktarım)
const ADMIN_ONLY = [/^mail\//, /^integrations/, /^users/, /^purge-demo$/, /^backfill$/, /^backfill\//, /^import$/, /^price-rules$/, /^catalog\//];
export async function api(req, env, ctx, db, path, user = { id: 0, name: 'Yönetici', role: 'admin' }) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams), m = req.method;
  let x;
  await getChannels(env, db); // eklenen mağazaların kimlikleri güncel olsun (önbellekten, ek sorgu yok denecek kadar az)
  // Tanılama personel için de açık (API bilgilerini göstermez)
  const diag = /^integrations\/[a-z0-9_]+\/diagnose$/.test(path);
  if (user.role !== 'admin' && !diag && m !== 'GET' && (ADMIN_ONLY.some((r) => r.test(path)) || path === 'settings')) fail(403, 'Bu işlem için yönetici yetkisi gerekir');
  if (user.role !== 'admin' && !diag && (path === 'users' || path.startsWith('users/') || path.startsWith('integrations'))) fail(403, 'Bu bölüm için yönetici yetkisi gerekir');
  // Personel: yalnız yetkili olduğu bölümler (bkz. public/perms.js)
  const sec = sectionOf(path);
  if (!can(user, sec)) fail(403, 'Bu bölüm için yetkiniz yok (Personel → yetkiler)');
  // Yalnız görüntüleme yetkisi: okuma serbest, değişiklik yok (etiket / dışa aktarma gibi okuma amaçlı POST'lar hariç değil)
  if (m !== 'GET' && !can(user, sec, true)) fail(403, 'Bu bölümde yalnız görüntüleme yetkiniz var');
  // Hepsiburada canlıya geçiş testi (yalnız yönetici)
  if (path.startsWith('hbtest/')) {
    if (user.role !== 'admin') fail(403, 'Bu bölüm için yönetici yetkisi gerekir');
    return json(await hbTest(env, db, path, m, q, m === 'GET' ? {} : await body(req), user));
  }
  // Kategori eşleştirme ve pazaryerine ürün yükleme
  if (path.startsWith('catalog/')) return json(await catalogApi(env, db, ctx, path, m, q, m === 'GET' ? {} : await body(req), user));
  if (path === 'summary' && m === 'GET') {
    const [qs, s, notices, match, st, chInfo, cl] = await Promise.all([
      first(db, "SELECT COUNT(*) AS n FROM questions WHERE status = 'waiting'"),
      summary(db),
      first(db, 'SELECT COUNT(*) AS open, SUM(read = 0) AS unread FROM notices WHERE resolved_at IS NULL'),
      // Eşleşme bekleyen ilan: "ben seçeyim" kanallarındaki ilanlar sayılmaz (Kanal Ürünleri'nde seçilmeyi bekler, uyarı değil)
      Promise.all([all(db, 'SELECT channel, COUNT(*) AS n FROM listings WHERE product_id IS NULL AND ignored = 0 GROUP BY channel'), manualImport(db)])
        .then(([rows, isManual]) => ({ n: rows.filter((r) => !isManual(r.channel)).reduce((a, r) => a + r.n, 0) })),
      getSettings(db),
      channelsInfo(env, db),
      first(db, "SELECT COUNT(*) AS n FROM claims WHERE status = 'waiting'"),
    ]);
    // E-postadaki "panelde aç" bağlantısı için panel adresi (yönetici girmediyse kullanılan adres).
    // Panel sonradan kendi alan adına taşınırsa, kayıtlı workers.dev adresi yeni adresle değiştirilir.
    // Alt alan adındaki panel-proxy.php üzerinden gelindiyse o adres kullanılır (X-Forwarded-Host).
    const fh = str(req.headers.get('X-Forwarded-Host')).toLowerCase();
    const origin = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(fh) ? 'https://' + fh : url.origin;
    const moved = /\.workers\.dev$/i.test(str(st.panel_url)) && !/\.workers\.dev$/i.test(new URL(origin).host);
    if ((!st.panel_url || moved) && user.role === 'admin' && /^https:\/\//.test(origin)) { await setSetting(db, 'panel_url', origin); st.panel_url = origin; }
    return json({ ...s, channels: chInfo, settings: publicSettings(st, env), user, tenant: env.TENANT_SLUG ? { slug: env.TENANT_SLUG, name: env.TENANT_NAME } : null, owner: !env.TENANT_SLUG && !!env.TENANT, notices: { open: notices.open || 0, unread: notices.unread || 0 }, unmatched: match.n, questions: qs.n, claims: cl.n, demo: env.DEMO === '1', build: (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || null });
  }
  // Alt alan adı için panel-proxy.php: panelin kendi adresi doldurulmuş olarak indirilir
  if (path === 'panel-proxy' && m === 'GET') {
    if (user.role !== 'admin') fail(403, 'Yalnız yönetici');
    if (!env.ASSETS) fail(404, 'Dosya bulunamadı');
    const src = await (await env.ASSETS.fetch(new Request(url.origin + '/panel-proxy.php'))).text();
    const base = /\.workers\.dev$/i.test(url.host) ? url.origin : 'https://hasturk-panel.HESABINIZ.workers.dev';
    return new Response(src.replace('https://hasturk-panel.HESABINIZ.workers.dev', base), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="index.php"', 'Cache-Control': 'no-store' } });
  }
  if (path === 'channels' && m === 'GET') return json(await channelsInfo(env, db));
  if (path === 'sync' && m === 'POST') { const b = await body(req); return json(await syncAll(env, db, { only: b.channels, force: !!b.force, listings: !!b.listings })); }
  if (path === 'import' && m === 'POST') { const b = await body(req); return json(await importListings(env, db, { only: b.channels })); }
  if (path === 'purge-demo' && m === 'POST') return json(await purgeDemo(db));

  // ---------- eşleştirme ----------
  if (path === 'match/repair' && m === 'POST') {
    const freed = await repairDuplicates(db);
    const r = await autoMatch(db, { catalog: (await getSettings(db)).catalog_channels || ['ikas1'] });
    await log(db, null, 'info', `${user.name}: eşleştirme onarımı · ${freed} hatalı bağlantı ayrıldı, ${r.linked} yeniden bağlandı`);
    return json({ freed, ...r });
  }
  if (path === 'match' && m === 'GET') {
    const [rows, counts] = await Promise.all([
      suggestions(db, { channel: q.channel, q: q.q, limit: Math.min(Number(q.limit) || 60, 200) }),
      all(db, `SELECT channel, SUM(product_id IS NULL AND ignored = 0) AS pending, SUM(product_id IS NULL AND ignored = 1) AS ignored,
        SUM(match IN ('barcode', 'sku', 'name', 'group', 'approved')) AS auto, SUM(match = 'new') AS created, SUM(match = 'manual') AS manual, COUNT(*) AS total FROM listings GROUP BY channel`),
    ]);
    return json({ listings: rows, counts });
  }
  if (path === 'match/approve' && m === 'POST') {
    const b = await body(req);
    const r = await approveConfident(db, { channel: b.channel || undefined, min: Math.max(70, Number(b.min) || 85) });
    if (r.linked) await fillProductInfo(db).catch(() => {});
    await log(db, b.channel || null, 'info', `${user.name}: ${r.linked} yüksek puanlı öneri toplu onaylandı`);
    return json(r);
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
  if ((x = path.match(/^questions\/([a-z0-9_]+)\/(.+)\/answer$/)) && m === 'POST') {
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
    if (!bbIds().includes(b.channel)) fail(400, 'Otomatik fiyat yalnızca Trendyol ve Hepsiburada için');
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
    const chs = (b.channels || []).filter((c) => isChannelId(c));
    if (!chs.length) fail(400, 'En az bir kanal seçin');
    for (const c of chs) await createJob(db, c, from, Math.min(to, Date.now()));
    await log(db, null, 'info', `${user.name}: geçmiş sipariş aktarımı başlatıldı (${chs.join(', ')}, ${b.from} – ${b.to || 'bugün'})`);
    return json({ ok: true, run: await runJobs(env, db, { budgetMs: 15000 }) });
  }
  if (path === 'backfill/run' && m === 'POST') return json({ ok: true, run: await runJobs(env, db, { budgetMs: 20000 }) });
  if ((x = path.match(/^backfill\/(.+)\/cancel$/)) && m === 'POST') { await cancelJob(db, decodeURIComponent(x[1])); return json({ ok: true }); }

  // ---------- kullanıcılar ----------
  if (path === 'users' && m === 'GET') return json(await listUsers(db));
  const maxUsers = Number(env.TENANT_MAX_USERS) || 0;
  if (path === 'users' && m === 'POST') { const b = await body(req); let id; try { id = await saveUser(db, 0, b, { maxUsers }); } catch (e) { fail(400, e.message); } await log(db, null, 'info', `${user.name}: kullanıcı eklendi (${str(b.username)})`); return json({ ok: true, id }); }
  if ((x = path.match(/^users\/(\d+)$/)) && m === 'PUT') {
    const id = Number(x[1]), b = await body(req);
    if (id === user.id && (b.active === false || b.role === 'staff')) fail(400, 'Kendi yönetici yetkinizi ya da hesabınızı kapatamazsınız');
    try { await saveUser(db, id, b, { maxUsers }); } catch (e) { fail(400, e.message); }
    // Yetki, durum ya da şifre değişince açık oturumlar hemen yeni yetkiyle çalışır; pasif / şifresi değişen hesabın oturumu kapanır
    if (b.active === false || b.password) await revokeSessions(db, id);
    await log(db, null, 'info', `${user.name}: kullanıcı güncellendi (#${id}${b.password ? ', şifre değişti' : ''}${b.active === false ? ', pasif' : ''})`);
    return json({ ok: true });
  }
  if ((x = path.match(/^users\/(\d+)$/)) && m === 'DELETE') { try { await deleteUser(db, Number(x[1]), user); } catch (e) { fail(400, e.message); } await log(db, null, 'info', `${user.name}: kullanıcı silindi (#${x[1]})`); return json({ ok: true }); }
  if ((x = path.match(/^users\/(\d+)\/revoke$/)) && m === 'POST') { await revokeSessions(db, Number(x[1])); await log(db, null, 'info', `${user.name}: kullanıcının oturumları kapatıldı (#${x[1]})`); return json({ ok: true }); }
  if ((x = path.match(/^users\/(\d+)\/activity$/)) && m === 'GET') { try { return json(await userActivity(db, Number(x[1]))); } catch (e) { fail(404, e.message); } }
  // İki adımlı doğrulama: kendi hesabı (her kullanıcı) ve zorunluluk / sıfırlama (yönetici)
  if (path === 'me/2fa' || path.startsWith('me/2fa/')) {
    let r;
    try { r = await twofaApi(db, user, path, m === 'GET' ? {} : await body(req), { issuer: env.TENANT_NAME || (await getSettings(db)).company.title || 'Hastürk' }); } catch (e) { fail(400, e.message); }
    if (!r) fail(404, 'Bulunamadı');
    if (path !== 'me/2fa') await log(db, null, 'info', `${user.name}: iki adımlı doğrulama ${{ 'me/2fa/enable': 'açıldı', 'me/2fa/disable': 'kapatıldı', 'me/2fa/recovery': 'yedek kodları yenilendi', 'me/2fa/setup': 'kurulumu başladı' }[path] || ''}`);
    return json(r);
  }
  if (path === 'users/security' && m === 'GET') return json(await security(db, true));
  if (path === 'users/security' && m === 'PUT') { const r = await setSecurity(db, await body(req)); await log(db, null, 'info', `${user.name}: iki adımlı doğrulama tüm kullanıcılar için ${r.require2fa ? 'zorunlu yapıldı' : 'isteğe bağlı yapıldı'}`); return json(r); }
  if ((x = path.match(/^users\/(\d+)\/2fa-reset$/)) && m === 'POST') { await resetTfa(db, Number(x[1])); await revokeSessions(db, Number(x[1])); await log(db, null, 'info', `${user.name}: kullanıcının iki adımlı doğrulaması sıfırlandı (#${x[1]})`); return json({ ok: true }); }
  if (path === 'me/password' && m === 'POST') { const b = await body(req); try { await changeOwnPassword(db, user, b.old, b.new); } catch (e) { fail(400, e.message); } return json({ ok: true }); }

  // ---------- bildirimler ----------
  if (path === 'notices' && m === 'GET') return json(await all(db, `SELECT * FROM notices ${q.all ? '' : 'WHERE resolved_at IS NULL'} ORDER BY resolved_at IS NOT NULL, last_at DESC LIMIT 200`));
  if (path === 'notices/read' && m === 'POST') { await run(db, 'UPDATE notices SET read = 1 WHERE read = 0'); return json({ ok: true }); }
  if ((x = path.match(/^notices\/(\d+)\/resolve$/)) && m === 'POST') { await run(db, 'UPDATE notices SET resolved_at = ?, read = 1 WHERE id = ?', Date.now(), Number(x[1])); return json({ ok: true }); }
  if (path === 'push-stock' && m === 'POST') return json(await pushStocks(env, db));

  if (path === 'orders' && m === 'GET') return json(await listOrders(db, q));
  // Müşteriler: özet / liste / tek müşteri
  if (path === 'customers/summary' && m === 'GET') return json(await customers.summary(db, q));
  if (path === 'customers' && m === 'GET') return json(await customers.list(db, q));
  if (path === 'customers/detail' && m === 'GET') return json(await customers.detail(db, str(q.key)));
  if ((x = path.match(/^orders\/([^/]+)$/)) && m === 'GET') {
    const id = decodeURIComponent(x[1]);
    const [o, events, st] = await Promise.all([loadOrder(db, id),
      all(db, 'SELECT at, source, action, status, remote_status, note, user FROM order_events WHERE order_id = ? ORDER BY at DESC LIMIT 30', id), getSettings(db)]);
    const ch = await channel(env, db, o.channel);
    o.events = events;
    return json({ order: o, profit: orderProfit(o, st), channel: ch ? publicInfo(ch) : null });
  }
  // Kargo firması seçenekleri: kanalın kendi listesinden (ikas Kargo firmaları, Trendyol sağlayıcıları, HB değiştirilebilir firmalar)
  if ((x = path.match(/^orders\/([^/]+)\/cargo-options$/)) && m === 'GET') {
    const o = await loadOrder(db, decodeURIComponent(x[1]));
    const ch = await channel(env, db, o.channel);
    const pkg = o.packages.find((p) => p.id === Number(q.package_id)) || null;
    if (!ch || !ch.enabled || !ch.cargoOptions) return json({ options: [], note: `${ch ? ch.name : 'Bu kanal'} kargo firması seçimini API ile desteklemiyor (firma kanalın kendi panelindeki ayardan gelir)` });
    const def = ((await getRaw(db, 'cargo_default')) || {})[o.channel] || null, pick = parseJ(o.cargo_pick);
    const extra = { default: def, pick, mode: ch.caps.cargo, current: pkg && pkg.cargo_company, code: (pkg && pkg.cargo_code) || (pick && pick.id) || '' };
    // Hepsiburada: firma listesi pakete göre gelir; paket oluşmadan önce son alınan liste gösterilir, seçim paketlerken uygulanır
    if (ch.type === 'hepsiburada' && (!pkg || !pkg.remote_id)) {
      const cached = (await getRaw(db, 'cargo_list:' + ch.id)) || [];
      return json({ ...extra, options: cached.map((c) => ({ ...c, current: false })), before: true,
        note: cached.length ? '' : 'Hepsiburada kargo firması listesini paket üzerinden verir. “Paketle ve etiket al”a basın; etiket alınamazsa firma listesi açılır, seçtiğiniz firma Hepsiburada\'da uygulanır ve etiket yeniden istenir.' });
    }
    try {
      const options = await ch.cargoOptions(o, pkg);
      if (ch.type === 'hepsiburada' && options.length) await setSetting(db, 'cargo_list:' + ch.id, options.map((c) => ({ id: c.id, name: c.name })));
      return json({ ...extra, options });
    } catch (e) { return json({ ...extra, options: [], note: e.message }); }
  }
  if ((x = path.match(/^orders\/([^/]+)\/([a-z-]+)$/)) && m === 'POST') {
    const b = await body(req);
    return json(await orderAction(env, db, decodeURIComponent(x[1]), x[2], b, ctx, user));
  }
  if (path === 'orders-bulk' && m === 'POST') {
    const b = await body(req), done = [], errors = [];
    await pool((b.ids || []).slice(0, 100), 4, async (id) => {
      try { await orderAction(env, db, id, b.action, b, ctx, user); done.push(id); } catch (e) { errors.push(`${id}: ${e.message}`); }
    });
    return json({ ok: !errors.length, done, errors });
  }
  // Toplu etiket işareti (görüntülendi / yazdırıldı): tek istekte
  if (path === 'labels/mark' && m === 'POST') {
    const b = await body(req), t = Date.now();
    if (!['viewed', 'printed'].includes(b.kind)) fail(400, 'Geçersiz işlem');
    const items = (b.items || []).slice(0, 300).map((x) => Number(x.pkgId)).filter(Boolean);
    for (let i = 0; i < items.length; i += 80) {
      const part = items.slice(i, i + 80), ph = part.map(() => '?').join(',');
      if (b.kind === 'viewed') await run(db, `UPDATE packages SET label_viewed_at = ? WHERE id IN (${ph})`, t, ...part);
      else await run(db, `UPDATE packages SET label_printed_at = ?, label_prints = label_prints + 1, label_viewed_at = COALESCE(label_viewed_at, ?) WHERE id IN (${ph})`, t, t, ...part);
    }
    if (b.kind === 'printed') {
      const orders = [...new Set((b.items || []).map((x) => String(x.orderId)))].slice(0, 300);
      for (const id of orders) { const o = await first(db, 'SELECT id, status, remote_status FROM orders WHERE id = ?', id); if (o) await event(db, o, 'label-printed', user, 'Toplu yazdırma'); }
    }
    return json({ ok: true, count: items.length });
  }
  if (path === 'labels' && m === 'POST') {
    // Toplu etiket: seçilen siparişlerin açık paketleri (paket yoksa tek paket oluşturulur); kanal etiketi istenirse alınır
    const b = await body(req), errors = [], settings = await getSettings(db);
    // Siparişler 4'erli paralel işlenir (her biri kanalda paketleme + etiket isteği); sonuç sırası korunur
    const out = (await pool((b.ids || []).slice(0, 60), 4, async (id) => {
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
        return { order: await loadOrder(db, id), labels };
      } catch (e) { errors.push(`${id}: ${e.message}`); return null; }
    })).filter(Boolean);
    return json({ orders: out, errors, sender: settings.sender });
  }
  if (path === 'packages' && m === 'GET') return json(await listPackages(db, q));
  if (path === 'orders.csv' && m === 'GET') {
    return new Response(await exportOrders(db, q), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="siparisler-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  if (path === 'dashboard' && m === 'GET') {
    const d = await dashboard(db, q);
    // Kâr bilgisi yalnız "Gelir, gider ve hakediş" yetkisi olana
    if (!d.error && !can(user, 'finance')) for (const p of [d.current, d.previous]) { p.profit = p.profit.map(() => null); p.total = { ...p.total, profit: null }; for (const t of Object.values(p.totals)) t.profit = null; }
    return json(d);
  }
  // Gelir & gider: dönem masraf basamakları (satış → komisyon → kargo → hizmet bedeli → ek kesinti → stopaj → hakediş → alış → kâr)
  // Döviz kurları ve döviz bazlı fiyat (müşteri panellerinde yakında)
  if (path === 'fx' || path.startsWith('fx/')) {
    if (env.TENANT_SLUG) fail(403, 'Döviz bazlı fiyat yakında müşteri panellerinde de açılacak');
    const settings = await getSettings(db);
    if (path === 'fx' && m === 'GET') {
      let rates = await getRaw(db, 'fx_rates'), error = null;
      if (!rates || q.refresh) { try { rates = await refreshRates(db, settings, { force: !!q.refresh }); } catch (e) { error = e.message; } }
      const products = (await first(db, "SELECT COUNT(*) AS n FROM products WHERE currency IN ('USD', 'EUR', 'GBP') AND fx_price > 0")).n;
      return json({ settings: { ...FX_DEFAULTS, ...(settings.fx || {}) }, rates, applied: await getRaw(db, 'fx_applied'), products, error });
    }
    if (path === 'fx/apply' && m === 'POST') {
      if (!can(user, 'products')) fail(403, 'Yetki yok');
      const rates = await refreshRates(db, settings, { force: true });
      const r = await applyFx(db, settings, rates, { user: user.name });
      ctx.waitUntil(pushPrices(env, db).catch(() => {}));
      return json(r);
    }
  }
  // Kampanyalar (Hepsiburada sepet indirimleri)
  // Hata kayıtları: tarayıcıdan bildirim (ana panelin kendi hataları; müşteri panellerininki tenants.js'te) ve yönetici ekranı
  if (path === 'errors/report' && m === 'POST') {
    if (!env.TENANT_SLUG) await recordError(db, clientReport(await body(req), { slug: '', firm: '', user }));
    return json({ ok: true });
  }
  // Dış API (stok aktarımı) — ana panelin kendi ürünleri için anahtarlar (yalnız ana panel yöneticisi; bkz. extapi.js)
  if (path === 'extapi' || path.startsWith('extapi/')) {
    if (env.TENANT_SLUG || user.role !== 'admin') fail(404, 'Bulunamadı');
    const r = await mainKeysApi(db, path, m, m === 'GET' ? {} : await body(req), user);
    if (m !== 'GET') await log(db, null, 'info', `${user.name}: stok API anahtarı ${m === 'POST' ? 'oluşturuldu' : m === 'DELETE' ? 'silindi' : 'güncellendi'}`);
    return json(r);
  }
  if (path === 'perf' && m === 'GET') {
    if (env.TENANT_SLUG || user.role !== 'admin') fail(404, 'Bulunamadı');
    return json({ ...(await perfReport(db, { days: Math.min(30, Number(q.days) || 7), slug: q.slug })), maint: await getRaw(db, 'maint') });
  }
  if (path === 'errors' || path.startsWith('errors/')) {
    if (env.TENANT_SLUG || user.role !== 'admin') fail(404, 'Bulunamadı');
    return json(await errorsApi(req, db, path, q, m === 'GET' ? {} : await body(req)));
  }
  // Destek talepleri: ana panelde gelen kutusu (müşteri panellerinin istekleri Durable Object'te karşılanır, bkz. tenants.js)
  if (path === 'support' || path.startsWith('support/')) {
    if (env.TENANT_SLUG) fail(404, 'Bulunamadı');
    return supportResponse(req, db, path, { slug: '', firm: '', user, staff: true });
  }
  if (path === 'campaigns' || path.startsWith('campaigns/')) return json(await campaignApi(env, db, path, m, q, m === 'GET' ? {} : await body(req), user));
  // Fiyat önerileri (buybox servisinden okunan rakip fiyatlarına göre; bkz. suggest.js)
  if (path === 'suggestions' && m === 'GET') { const bb = bbIds(); return json(await listSuggestions(db, bb.includes(q.channel) ? { channel: q.channel } : { channels: bb })); }
  if (path === 'suggestions/apply' && m === 'POST') {
    const b = await body(req), r = await applySuggestions(db, { ...b, channels: bbIds(), user: user.name });
    if (r.applied) ctx.waitUntil(pushPrices(env, db).catch(() => {}));
    return json(r);
  }
  // İade talepleri
  if (path === 'claims' && m === 'GET') return json(await listClaims(db, { ...q, channel: isChannelId(q.channel) ? q.channel : '' }));
  if (path === 'claims/sync' && m === 'POST') return json(await syncClaims(env, db));
  if (path === 'claims/reasons' && m === 'GET') return json({ reasons: await claimReasons(env, db, str(q.channel)) });
  if ((x = path.match(/^claims\/([a-z0-9_]+)\/(.+)\/(approve|reject)$/)) && m === 'POST') {
    const b = await body(req), id = decodeURIComponent(x[2]);
    return json(x[3] === 'approve' ? await approveClaim(env, db, x[1], id, b.lines, user) : await rejectClaim(env, db, x[1], id, { lineIds: b.lines, reasonId: b.reasonId, reason: b.reason, text: b.text, file: claimFile(b.file) }, user));
  }
  if (path === 'settlements' && m === 'GET') return json(await settlementReport(env, db, await getSettings(db), { from: q.from, to: q.to, channel: isChannelId(q.channel) ? q.channel : '' }));
  if (path === 'settlements/sync' && m === 'POST') { if (user.role !== 'admin') fail(403, 'Yönetici yetkisi gerekir'); return json(await syncSettlements(env, db, { force: true })); }
  if (path === 'invoices' && m === 'GET') return json(await listInvoices(env, db, { from: q.from, to: q.to, channel: isChannelId(q.channel) ? q.channel : '', type: str(q.type) }));
  if (path === 'invoices/sync' && m === 'POST') { if (user.role !== 'admin') fail(403, 'Yönetici yetkisi gerekir'); const [invoices, costs] = await Promise.all([syncInvoices(env, db, { force: true }), syncCosts(env, db, null, { force: true }).catch((e) => ({ error: e.message }))]); return json({ invoices, costs }); }
  if (path === 'finance/products' && m === 'GET') return json(await productProfit(db, await getSettings(db), { from: q.from, to: q.to, channel: isChannelId(q.channel) ? q.channel : '', sort: str(q.sort) }));
  if (path === 'expenses' && m === 'GET') return json(await listExpenses(db));
  if (path === 'expenses' && m === 'POST') return json(await saveExpense(db, await body(req)));
  if ((x = path.match(/^expenses\/(\d+)$/))) {
    if (m === 'PUT') return json(await saveExpense(db, await body(req), x[1]));
    if (m === 'DELETE') return json(await deleteExpense(db, x[1]));
  }
  if (path === 'finance' && m === 'GET') return json(await breakdown(db, await getSettings(db), { from: q.from, to: q.to, channel: isChannelId(q.channel) ? q.channel : '' }));

  // ---------- entegrasyonlar (kanal API bilgileri) ----------
  if (path === 'integrations' && m === 'GET') {
    const cfg = await loadConfig(env, db), chs = await getChannels(env, db), info = await channelsInfo(env, db);
    // Müşteri panelinde platform alanları (entegratör adı, test ortamı, aracı sunucu) gösterilmez; değerleri ana panelden gelir
    const tenant = !!env.TENANT_SLUG;
    const view = (c) => {
      const d = describe(env, cfg, c.id), i = info.find((x) => x.id === c.id) || {};
      if (!tenant) return { ...i, ...d };
      const plat = new Set(fieldsFor(c.id).filter((f) => f.platform).map((f) => f.k));
      return { ...i, ...d, fields: d.fields.filter((f) => !plat.has(f.k)), missing: (i.missing || []).map((k) => (plat.has(k) ? 'entegratör bilgisi (hizmet sağlayıcınız tanımlar)' : k)) };
    };
    return json({ secretSet: !!env.PANEL_SECRET, tenant, channels: chs.map(view) });
  }
  // E-posta servisi bilgileri (gizli anahtar istemciye dönmez) ve deneme e-postası
  if (path === 'integrations/mail' && m === 'GET') {
    const d = describe(env, await loadConfig(env, db), 'mail');
    if (!env.TENANT_SLUG) return json(d);
    const plat = /MAIL_/.test(env.PLATFORM_KEYS || '');
    return json({ ...d, platform: plat, fields: d.fields.map((f) => (f.source === 'cloudflare' ? { ...f, value: '', masked: '', source: '' } : f)) });
  }
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
  // Mağaza ekle / kaldır (aynı kanal türünden istenen sayıda mağaza)
  if (path === 'integrations/add' && m === 'POST') {
    const id = await addStore(db, str((await body(req)).type), { tenant: !!env.TENANT_SLUG });
    resetChannels();
    await log(db, id, 'info', `${user.name}: yeni mağaza eklendi`);
    return json({ ok: true, id });
  }
  if ((x = path.match(/^integrations\/([a-z0-9_]+)\/remove$/)) && m === 'POST') {
    await removeStore(db, x[1]);
    resetChannels();
    await log(db, null, 'info', `${user.name}: ${x[1]} mağazası kaldırıldı (siparişleri ve ilanları silinmedi)`);
    return json({ ok: true });
  }
  if ((x = path.match(/^integrations\/([a-z0-9_]+)$/)) && m === 'PUT') {
    if (env.TENANT_SLUG && isBeta(x[1])) fail(403, 'Bu kanal yakında açılacak');
    const b = await body(req);
    await saveConfig(env, db, x[1], b);
    resetChannels();
    // API bilgileri değişti: eski hata ve bekleme sıfırlanır, kanal sonraki senkronda hemen denenir
    if (b.values || b.clear) {
      await clearFailures(db, x[1], 'API bilgileri güncellendi; yeniden denenecek');
      // Hesap değişmiş olabilir (ör. Hepsiburada testten canlıya): son 1 yıllık geçmiş aktarımı yeniden başlatılır (çift kayıt olmaz)
      await run(db, 'DELETE FROM settings WHERE k = ?', 'auto_backfill:' + x[1]);
    }
    await log(db, x[1], 'info', 'API bilgileri panelden güncellendi');
    return json({ ok: true });
  }
  // Adım adım bağlantı tanılaması (isteğe bağlı sipariş için kargo/paket durumu)
  if ((x = path.match(/^integrations\/([a-z0-9_]+)\/diagnose$/)) && m === 'POST') {
    const b = await body(req);
    if (b.order_id && !can(user, 'orders')) fail(403, 'Sipariş ayrıntısı için Siparişler yetkisi gerekir');
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
  if ((x = path.match(/^integrations\/([a-z0-9_]+)\/test$/)) && m === 'POST') {
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
      // Bağlantı çalışıyor: eski hata / bekleme silinir ve kanal arka planda hemen senkronlanır
      await clearFailures(db, ch.id, 'Bağlantı testi başarılı');
      if (!gated && ctx && ctx.waitUntil) ctx.waitUntil(syncAll(env, db, { only: [ch.id], force: true, listings: true }).catch(() => {}));
      if (GATED.includes(typeOf(ch.id))) { await setSetting(db, 'verified:' + ch.id, { at: Date.now() }); resetChannels(); await log(db, ch.id, 'info', 'Bağlantı onaylandı; kanal sipariş, ürün ve stok ekranlarına eklendi'); }
      return json({ ok: true, message: `Bağlantı başarılı · son 24 saatte ${orders.length} sipariş${gated ? ' · kanal devreye alındı' : ''}`, ms: Date.now() - t });
    } catch (e) {
      return json({ ok: false, message: e.message });
    }
  }

  // Barkod oluşturma: öneri (kaydedilmez), seçilen ürünlere toplu barkod, ön ek ve eksik sayısı
  if (path === 'products/barcodes' && m === 'GET') return json({ prefix: await barcodePrefix(db), missing: await missingBarcodes(db) });
  if (path === 'products/barcodes/new' && m === 'GET') return json(await suggestBarcode(db, q.prefix));
  if (path === 'products/barcodes' && m === 'POST') { const b = await body(req); return json(await assignBarcodes(db, b.ids, { prefix: b.prefix, user: user.name })); }
  // Günlük özet e-postası: hemen bir örnek gönder (yönetici)
  if (path === 'digest/test' && m === 'POST') {
    if (user.role !== 'admin') fail(403, 'Yalnızca yönetici');
    const r = await dailyDigest(env, db, null, { force: true });
    return json({ ok: true, message: `Günlük özet ${r.sent} alıcıya gönderildi` });
  }
  // Toplama listesi: kargoya çıkacak siparişlerdeki ürünlerin toplamı (kanal ya da seçili siparişler)
  if (path === 'picklist' && m === 'GET') return json(await pickList(db, { channel: q.channel || '', ids: q.ids || '' }));
  // Anlık bildirim: cihaz aboneliği, deneme bildirimi ve servis çalışanının okuduğu son bildirim
  if (path === 'push/key' && m === 'GET') return json({ key: await publicKey(db) });
  if (path === 'push/subscribe' && m === 'POST') { const b = await body(req); return json(await subscribe(db, user, b.subscription, req.headers.get('user-agent'))); }
  if (path === 'push/unsubscribe' && m === 'POST') return json(await unsubscribe(db, (await body(req)).endpoint, user));
  if (path === 'push/latest' && m === 'GET') return json(await latest(db));
  if (path === 'push/test' && m === 'POST') return json(await notify(db, { title: 'Hastürk Panel', body: `Bildirimler açık · ${user.name}`, url: '#/' }, { userId: user.id ?? null }));
  // Excel ile toplu güncelleme: dışa aktar (CSV) ve geri yükle (önizleme / uygula)
  if (path === 'products.csv' && m === 'GET') return new Response(await exportProducts(env, db), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="urunler-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  if (path === 'products/bulk' && m === 'POST') {
    const b = await body(req);
    const r = await bulkUpdate(env, db, b.rows, { dry: b.dry !== false, user: user.name });
    if (r.applied && r.stock) ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    if (r.applied && r.prices) ctx.waitUntil(pushPrices(env, db).catch(() => {}));
    return json(r);
  }
  // SKU oluşturma: ürün adından öneri (önizleme, kaydedilmez), tek ürün önerisi, seçilenlere kaydet
  if (path === 'products/skus' && m === 'GET') return json({ prefix: await skuPrefix(db) });
  if (path === 'products/skus/new' && m === 'GET') return json(await suggestSku(db, q));
  if (path === 'products/skus/preview' && m === 'POST') { const b = await body(req); return json(await previewSkus(db, b.ids, b.prefix)); }
  if (path === 'products/skus' && m === 'POST') { const b = await body(req); return json(await assignSkus(db, b.items, { prefix: b.prefix, user: user.name })); }
  if (path === 'products' && m === 'GET') return json(await listProducts(db, q));
  // Varyant grubu: tek ekrandan tüm varyantlar (ad, kodlar, alış / satış, stok, kritik, kanal fiyatları, aktiflik) ve ortak alanlar
  if (path === 'products-variants' && m === 'GET') {
    const ids = str(q.ids).split(',').map(Number).filter((x) => x > 0).slice(0, 300);
    if (!ids.length) fail(400, 'Ürün seçin');
    const ph = ids.map(() => '?').join(',');
    const [prods, ls] = await Promise.all([
      all(db, `SELECT id, name, group_name, variant_name, sku, barcode, brand, image, purchase_price, sale_price, stock, critical_stock, vat, desi, active, currency, fx_price FROM products WHERE id IN (${ph}) ORDER BY variant_name COLLATE NOCASE, name COLLATE NOCASE`, ...ids),
      all(db, `SELECT product_id, channel, remote_id, price, commission, error FROM listings WHERE product_id IN (${ph})`, ...ids),
    ]);
    const st = await getSettings(db), cats = catalogOf(st);
    for (const p of prods) {
      p.listings = ls.filter((l) => l.product_id === p.id);
      // Stok senkronu kapalıyken ikas ilanı olan ürünün stoğu siteden okunur (burada değiştirilemez)
      p.site_stock = !st.stock_sync && p.listings.some((l) => cats.includes(l.channel));
    }
    return json({ products: prods });
  }
  if (path === 'products-variants' && m === 'POST') {
    const b = await body(req), items = (Array.isArray(b.items) ? b.items : []).slice(0, 300), shared = b.shared && typeof b.shared === 'object' ? b.shared : {};
    if (!items.length) fail(400, 'Değişiklik yok');
    const common = {};
    for (const k of ['group_name', 'brand', 'category']) if (k in shared) common[k] = shared[k];
    const done = [], errors = [];
    for (const it of items) {
      const id = Number(it.id);
      if (!(id > 0)) continue;
      const data = { ...common };
      for (const k of ['variant_name', 'sku', 'barcode', 'purchase_price', 'sale_price', 'critical_stock', 'vat', 'desi', 'active']) if (k in it) data[k] = it[k];
      if ('stock' in it) data.stock = it.stock;
      if (Array.isArray(it.listings)) data.listings = it.listings;
      try { await saveProduct(env, db, ctx, id, data, user, { push: false }); done.push(id); }
      catch (e) { errors.push({ id, error: e.message }); }
    }
    // Kanal fiyatları tek seferde gönderilir (varyant başına ayrı gönderim olmasın)
    ctx.waitUntil(pushPrices(env, db).catch(() => {}));
    // Yalnız ortak alan değiştiyse (varyant satırı gönderilmeden) gruptaki tüm ürünlere yazılır
    await log(db, null, 'info', `${user.name}: varyant grubu güncellendi (${done.length} varyant${errors.length ? `, ${errors.length} hata` : ''})`);
    return json({ ok: !errors.length, saved: done.length, errors });
  }
  // Toplu: aktif / pasif yap, kritik stok sınırı
  if (path === 'products-bulk' && m === 'POST') {
    const b = await body(req), ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter((x) => x > 0).slice(0, 2000);
    if (!ids.length) fail(400, 'Ürün seçin');
    const set = b.action === 'activate' ? ['active = 1'] : b.action === 'deactivate' ? ['active = 0'] : b.action === 'critical' ? ['critical_stock = ?'] : null;
    if (!set) fail(400, 'Geçersiz işlem');
    const extra = b.action === 'critical' ? [Math.max(0, Math.round(num(b.value)))] : [];
    let changed = 0;
    for (const part of chunk(ids, 300)) changed += ((await run(db, `UPDATE products SET ${set[0]}, updated_at = ? WHERE id IN (${part.map(() => '?').join(',')})`, ...extra, Date.now(), ...part)).meta || {}).changes || 0;
    await log(db, null, 'info', `${user.name}: ${changed} ürün toplu güncellendi (${b.action})`);
    return json({ changed });
  }
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
  // Kanal ürünleri: kanal kanal ilanlar, seçerek panele alma, yok sayma, kanal modu (otomatik / ben seçeyim)
  if (path === 'channel-products/channels' && m === 'GET') return json(await chp.channelSummary(db, (await getChannels(env, db)).filter((c) => (c.enabled || c.demo) && c.fetchListings).map((c) => c.id)));
  if (path === 'channel-products' && m === 'GET') return json(await chp.listChannelProducts(db, q));
  if (path === 'channel-products/add' && m === 'POST') { const r = await chp.addToPanel(env, db, await body(req), user); ctx.waitUntil(pushStocks(env, db).catch(() => {})); return json(r); }
  if (path === 'channel-products/ignore' && m === 'POST') return json(await chp.ignoreListings(db, await body(req)));
  if (path === 'channel-products/accept' && m === 'POST') { const r = await chp.acceptStrong(db, await body(req), user); ctx.waitUntil(pushStocks(env, db).catch(() => {})); return json(r); }
  if (path === 'channel-products/mode' && m === 'POST') { const r = await chp.setMode(db, await body(req)); await log(db, null, 'info', `${user.name}: kanal ürünleri modu değişti`); return json(r); }
  if ((path === 'listings/link' || path === 'channel-products/link') && m === 'POST') {
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
    if (pid) { await relinkItems(db); await fillProductInfo(db).catch(() => {}); }
    await log(db, b.channel, 'info', `${user.name}: ${b.remote_id} ${pid ? (b.create ? 'yeni ürün olarak eklendi' : 'ürüne bağlandı') : 'bağlantısı kaldırıldı'}`);
    ctx.waitUntil(pushStocks(env, db).catch(() => {}));
    return json({ ok: true, product_id: pid });
  }

  if (path === 'stats' && m === 'GET') return json(await stats(db, q));
  if (path === 'insights' && m === 'GET') return json(await insights(db, q));
  if (path === 'settings' && m === 'GET') return json(publicSettings(await getSettings(db), env));
  if (path === 'settings' && m === 'PUT') return json(publicSettings(await saveSettings(db, await body(req)), env));
  if (path === 'logs' && m === 'GET') return json(await all(db, 'SELECT * FROM logs ORDER BY id DESC LIMIT 200'));
  // Hata özeti (son 30 gün): aynı hata (sayılar / kimlikler ayıklanarak) kanal bazında gruplanır; açıklama ve kopyalanabilir rapor
  if (path === 'logs/errors' && m === 'GET') {
    const rows = await all(db, "SELECT at, channel, msg FROM logs WHERE level = 'error' AND at > ? ORDER BY at DESC LIMIT 3000", Date.now() - 30 * 864e5);
    const groups = new Map();
    for (const r of rows) {
      const k = (r.channel || '') + '|' + String(r.msg || '').replace(/\d{3,}/g, '#').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').slice(0, 220);
      const g = groups.get(k) || { channel: r.channel, msg: explainHttp(r.msg), count: 0, first: r.at, last: r.at };
      g.count++; g.first = Math.min(g.first, r.at); g.last = Math.max(g.last, r.at);
      groups.set(k, g);
    }
    return json({ total: rows.length, groups: [...groups.values()].sort((a, b) => b.last - a.last).slice(0, 100) });
  }
  fail(404, 'Bulunamadı');
}
