// İstatistik: ciro / sipariş adedi (kanal bazında + toplam), dönem karşılaştırma, en çok satanlar, tahmini kâr.
import { all, first, getSettings } from './db.js';
import { dayKey, weekKey, monthKey, TR, r2, LATE, PRODUCT_SHIP } from './util.js';
import { CHANNEL_IDS, isChannelId } from './channels/index.js';
import { profit, costOf } from '../public/profit.js';
import { DESIRED } from './sync.js';
const LOW = (n) => `(CASE WHEN critical_stock > 0 THEN critical_stock ELSE ${Math.max(0, Math.round(Number(n) || 0))} END)`;

const D = 864e5;
const keyFn = { day: dayKey, week: weekKey, month: monthKey };
const startOf = (k) => Date.parse(k + 'T00:00:00Z') - TR; // "2026-10-02" → Türkiye gece yarısı (UTC ms)

function buckets(fromMs, toMs, group) {
  const f = keyFn[group], out = [];
  for (let t = fromMs; t < toMs; t += D) { const k = f(t); if (out[out.length - 1] !== k) out.push(k); }
  return out;
}

const LIVE = "o.status NOT IN ('cancelled', 'returned')";

async function period(db, fromMs, toMs, group, settings) {
  const keys = buckets(fromMs, toMs, group), f = keyFn[group];
  const idx = new Map(keys.map((k, i) => [k, i]));
  const empty = () => Object.fromEntries(CHANNEL_IDS.map((c) => [c, 0]));
  const series = keys.map((k) => ({ key: k, revenue: empty(), orders: empty(), profit: 0 }));
  const totals = Object.fromEntries(CHANNEL_IDS.map((c) => [c, { revenue: 0, orders: 0, cancelled: 0, returned: 0, profit: 0, items: 0 }]));
  const rows = await all(db, 'SELECT channel, ordered_at, total, status FROM orders WHERE ordered_at >= ? AND ordered_at < ?', fromMs, toMs);
  // Listede olmayan (ör. yeni eklenen) mağaza da sayılır
  const T = (c) => totals[c] || (totals[c] = { revenue: 0, orders: 0, cancelled: 0, returned: 0, profit: 0, items: 0 });
  for (const r of rows) {
    const tt = T(r.channel);
    if (r.status === 'cancelled') { tt.cancelled++; continue; }
    if (r.status === 'returned') { tt.returned++; continue; }
    const b = series[idx.get(f(r.ordered_at))];
    tt.revenue += r.total; tt.orders++;
    if (b) { b.revenue[r.channel] = (b.revenue[r.channel] || 0) + r.total; b.orders[r.channel] = (b.orders[r.channel] || 0) + 1; }
  }
  // Tahmini kâr: satır tutarı − komisyon − alış maliyeti; sipariş başına kargo + hizmet bedeli
  const lines = await all(db, `SELECT o.id, o.channel, o.ordered_at, o.shipping_cost, ${PRODUCT_SHIP} AS pship, i.total, i.quantity, i.commission AS actual_commission, p.purchase_price, l.commission
    FROM order_items i JOIN orders o ON o.id = i.order_id
    LEFT JOIN products p ON p.id = i.product_id
    LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE} AND i.status NOT IN ('cancelled', 'returned')`, fromMs, toMs);
  const seen = new Set();
  let missingCost = 0;
  for (const l of lines) {
    const ch = l.channel, tt = T(ch);
    const rate = l.commission ?? costOf(settings, 'commission', ch);
    // Kanalın bildirdiği gerçek komisyon varsa o kullanılır
    const effRate = l.actual_commission != null && l.total > 0 ? (l.actual_commission / l.total) * 100 : rate;
    let v = profit({ sale: l.total, purchase: (l.purchase_price || 0) * l.quantity, commissionRate: effRate, feeRate: costOf(settings, 'fee_rate', ch), withholdingRate: costOf(settings, 'withholding', ch) }).unitProfit;
    if (!l.purchase_price) missingCost++;
    if (!seen.has(l.id)) {
      seen.add(l.id);
      v -= (l.shipping_cost ?? l.pship ?? costOf(settings, 'shipping', ch)) + costOf(settings, 'service_fee', ch);
    }
    tt.profit += v; tt.items += l.quantity;
    const b = series[idx.get(f(l.ordered_at))];
    if (b) b.profit += v;
  }
  for (const t of Object.values(totals)) { t.revenue = r2(t.revenue); t.profit = r2(t.profit); }
  for (const b of series) { for (const c of Object.keys(b.revenue)) b.revenue[c] = r2(b.revenue[c]); b.profit = r2(b.profit); }
  const sum = (k) => r2(Object.values(totals).reduce((s, t) => s + t[k], 0));
  const total = { revenue: sum('revenue'), orders: sum('orders'), cancelled: sum('cancelled'), returned: sum('returned'), profit: sum('profit'), items: sum('items') };
  total.basket = total.orders ? r2(total.revenue / total.orders) : 0;
  total.lost = total.cancelled + total.returned;
  return { from: fromMs, to: toMs, series, totals, total, missingCost };
}

export async function stats(db, q) {
  const settings = await getSettings(db);
  const today = dayKey(Date.now());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : dayKey(Date.now() - 29 * D);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : today;
  const group = keyFn[q.group] ? q.group : 'day';
  const fromMs = startOf(from), toMs = startOf(to) + D;
  if (toMs <= fromMs || toMs - fromMs > 800 * D) return { error: 'Geçersiz tarih aralığı' };
  const cur = await period(db, fromMs, toMs, group, settings);
  let cmp = null;
  if (q.compare === 'prev') cmp = await period(db, fromMs - (toMs - fromMs), fromMs, group, settings);
  else if (q.compare === 'year') {
    const shift = (ms) => { const d = new Date(ms + TR); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.getTime() - TR; };
    cmp = await period(db, shift(fromMs), shift(toMs), group, settings);
  }
  const top = await topProducts(db, fromMs, toMs, Math.min(Number(q.limit) || 20, 100));
  return { from, to, group, current: cur, compare: cmp, top };
}

export async function topProducts(db, fromMs, toMs, limit = 20) {
  const rows = await all(db, `SELECT i.product_id, COALESCE(p.name, i.name) AS name, COALESCE(p.sku, i.sku) AS sku, p.image, p.stock, o.channel,
      SUM(i.quantity) AS qty, SUM(i.total) AS revenue, COUNT(DISTINCT o.id) AS orders
    FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE} AND i.status NOT IN ('cancelled', 'returned')
    GROUP BY COALESCE(CAST(i.product_id AS TEXT), 'n:' || COALESCE(NULLIF(i.sku, ''), i.name)), o.channel`, fromMs, toMs);
  const m = new Map();
  for (const r of rows) {
    const k = r.product_id ? 'p' + r.product_id : 'n' + (r.sku || r.name);
    let x = m.get(k);
    if (!x) m.set(k, (x = { product_id: r.product_id, name: r.name, sku: r.sku, image: r.image, stock: r.stock, qty: 0, revenue: 0, orders: 0, channels: {} }));
    x.qty += r.qty; x.revenue += r.revenue; x.orders += r.orders; x.channels[r.channel] = (x.channels[r.channel] || 0) + r.qty;
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, limit).map((x) => ({ ...x, revenue: r2(x.revenue) }));
}

// Ana ekran özeti
export async function summary(db) {
  const now = Date.now(), t0 = startOf(dayKey(now)), settings = await getSettings(db);
  const [todayP, yestP, extra, counts, low, unlinked] = await Promise.all([
    all(db, `SELECT channel, COUNT(*) AS n, SUM(total) AS revenue FROM orders o WHERE ordered_at >= ? AND ${LIVE} GROUP BY channel`, t0),
    all(db, `SELECT channel, COUNT(*) AS n, SUM(total) AS revenue FROM orders o WHERE ordered_at >= ? AND ordered_at < ? AND ${LIVE} GROUP BY channel`, t0 - D, t0),
    first(db, `SELECT (SELECT COUNT(*) FROM products WHERE active = 1 AND stock <= 0) AS stockOut,
      (SELECT COUNT(*) FROM packages k JOIN orders o ON o.id = k.order_id WHERE k.status = 'open' AND o.status NOT IN ('cancelled', 'returned')) +
      (SELECT COUNT(*) FROM orders o WHERE o.status = 'processing' AND NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id)) AS cargoWaiting,
      (SELECT COUNT(*) FROM orders o WHERE ${LATE}) AS late`),
    all(db, "SELECT status, channel, COUNT(*) AS n FROM orders WHERE status IN ('new', 'processing') GROUP BY status, channel"),
    all(db, `SELECT id, name, sku, stock, critical_stock FROM products WHERE active = 1 AND stock <= ${LOW(settings.low_stock)} ORDER BY stock ASC LIMIT 20`),
    all(db, 'SELECT COUNT(*) AS n FROM listings WHERE product_id IS NULL AND ignored = 0'),
  ]);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.channel, { orders: r.n, revenue: r2(r.revenue) }]));
  return {
    today: by(todayP), yesterday: by(yestP), stockOut: extra.stockOut, cargoWaiting: extra.cargoWaiting, late: extra.late,
    pending: counts, lowStock: low, unlinked: unlinked[0] ? unlinked[0].n : 0,
  };
}

// Genel bakış: seçilen dönem + aynı uzunluktaki önceki dönem, KPI serileri, kanal dağılımı, bekleyenler, stok özeti
export async function dashboard(db, q) {
  const settings = await getSettings(db);
  const ok = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);
  const today = dayKey(Date.now());
  const from = ok(q.from) || today.slice(0, 8) + '01', to = ok(q.to) || today;
  const fromMs = startOf(from), toMs = startOf(to) + D, len = toMs - fromMs;
  if (len <= 0 || len > 800 * D) return { error: 'Geçersiz tarih aralığı' };
  const group = len > 120 * D ? 'month' : len > 45 * D ? 'week' : 'day';
  const [cur, prev] = await Promise.all([period(db, fromMs, toMs, group, settings), period(db, fromMs - len, fromMs, group, settings)]);
  const line = (p, k) => p.series.map((b) => (k === 'profit' ? b.profit : r2(Object.values(b[k]).reduce((a, x) => a + x, 0))));
  const pack = (p) => ({ total: p.total, totals: p.totals, revenue: line(p, 'revenue'), orders: line(p, 'orders'), profit: line(p, 'profit') });
  const [pending, low, stock, top] = await Promise.all([
    all(db, "SELECT status, COUNT(*) AS n FROM orders WHERE status IN ('new', 'processing') GROUP BY status"),
    all(db, `SELECT id, name, sku, image, stock, critical_stock FROM products WHERE active = 1 AND stock <= ${LOW(settings.low_stock)} ORDER BY stock ASC LIMIT 8`),
    first(db, `SELECT (SELECT COUNT(*) FROM products WHERE active = 1) AS products, (SELECT COALESCE(SUM(MAX(stock, 0)), 0) FROM products WHERE active = 1) AS units,
      (SELECT COUNT(*) FROM listings l JOIN products p ON p.id = l.product_id WHERE p.active = 1 AND l.pushed_stock IS NOT NULL AND l.pushed_stock != ${DESIRED}) AS waiting,
      (SELECT COUNT(*) FROM listings WHERE error IS NOT NULL) AS errors, (SELECT COUNT(*) FROM listings WHERE product_id IS NULL AND ignored = 0) AS unlinked,
      (SELECT COUNT(*) FROM products WHERE active = 1 AND stock <= 0) AS out_, (SELECT COUNT(*) FROM products WHERE active = 1 AND stock > 0 AND stock <= ${LOW(settings.low_stock)}) AS below`),
    topProducts(db, fromMs, toMs, 6),
  ]);
  const p = Object.fromEntries(pending.map((r) => [r.status, r.n]));
  return {
    from, to, group, keys: cur.series.map((b) => b.key), current: pack(cur), previous: pack(prev), missingCost: cur.missingCost,
    pending: { new: p.new || 0, processing: p.processing || 0 }, lowStock: low, stock, top, stockSync: !!settings.stock_sync,
  };
}

// ---------- Analizler (raporlar) ----------
// Dönem başlangıcı (Türkiye saatiyle): gün / hafta (pazartesi) / ay / yıl; n dönem geri
function unitStart(unit, ms, back = 0) {
  const d = new Date(ms + TR);
  d.setUTCHours(0, 0, 0, 0);
  if (unit === 'day') d.setUTCDate(d.getUTCDate() - back);
  if (unit === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7 * back);
  if (unit === 'month') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back); }
  if (unit === 'year') { d.setUTCMonth(0, 1); d.setUTCFullYear(d.getUTCFullYear() - back); }
  return d.getTime() - TR;
}
const cityName = (s) => String(s || '').trim().toLocaleUpperCase('tr').replace(/\s+/g, ' ');

// Hazır aralıklar: bugün, dün, bu hafta, bu ay, bu yıl ya da from–to
function rangeOf(q) {
  const now = Date.now();
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (q.range === 'custom' && ok(q.from) && ok(q.to)) return [startOf(q.from), startOf(q.to) + D];
  if (q.range === 'today') return [unitStart('day', now), now + 1];
  if (q.range === 'yesterday') return [unitStart('day', now, 1), unitStart('day', now)];
  if (q.range === 'month') return [unitStart('month', now), now + 1];
  if (q.range === 'year') return [unitStart('year', now), now + 1];
  if (q.range === '30') return [unitStart('day', now, 29), now + 1];
  return [unitStart('week', now), now + 1];
}

export async function insights(db, q) {
  const now = Date.now(), unit = ['day', 'week', 'month', 'year'].includes(q.unit) ? q.unit : 'day';
  const chan = isChannelId(q.channel) ? q.channel : null;
  const cw = chan ? ' AND o.channel = ?' : '', ca = chan ? [chan] : [];
  // 1) Son 4 dönem kartları (+ karşılaştırma için 5. dönem)
  const starts = [0, 1, 2, 3, 4].map((b) => unitStart(unit, now, b));
  const rows = await all(db, `SELECT o.ordered_at, o.total, o.status,
      (SELECT COALESCE(SUM(quantity), 0) FROM order_items i WHERE i.order_id = o.id AND i.status NOT IN ('cancelled', 'returned')) AS items
    FROM orders o WHERE o.ordered_at >= ?${cw}`, starts[4], ...ca);
  const cards = starts.slice(0, 5).map((s, i) => ({ start: s, end: i ? starts[i - 1] : now + 1, revenue: 0, orders: 0, items: 0, lost: 0 }));
  for (const r of rows) {
    const c = cards.find((x) => r.ordered_at >= x.start && r.ordered_at < x.end);
    if (!c) continue;
    if (r.status === 'cancelled' || r.status === 'returned') { c.lost++; continue; }
    c.revenue += r.total; c.orders++; c.items += r.items;
  }
  for (const c of cards) { c.revenue = r2(c.revenue); c.basket = c.orders ? r2(c.revenue / c.orders) : 0; c.lostRate = c.orders + c.lost ? r2((c.lost / (c.orders + c.lost)) * 100) : 0; }
  // 2) Haftalık rapor: son 8 hafta (haftadan haftaya değişim)
  const w0 = unitStart('week', now, 7);
  const wrows = await all(db, `SELECT o.channel, o.ordered_at, o.total, o.status FROM orders o WHERE o.ordered_at >= ?${cw}`, w0, ...ca);
  const weeks = Array.from({ length: 8 }, (_, i) => ({ start: unitStart('week', now, 7 - i), revenue: 0, orders: 0, lost: 0, channels: {} }));
  for (const r of wrows) {
    const w = [...weeks].reverse().find((x) => r.ordered_at >= x.start);
    if (!w) continue;
    if (r.status === 'cancelled' || r.status === 'returned') { w.lost++; continue; }
    w.revenue += r.total; w.orders++;
    const c = (w.channels[r.channel] = w.channels[r.channel] || { revenue: 0, orders: 0 });
    c.revenue = r2(c.revenue + r.total); c.orders++;
  }
  for (const w of weeks) w.revenue = r2(w.revenue);
  // 3) İller ve 4) en çok satanlar: seçilen aralıkta
  const [from, to] = rangeOf(q);
  const crows = await all(db, `SELECT o.address, o.total, o.status, (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id AND i.status NOT IN ('cancelled', 'returned')) AS units FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}`, from, to, ...ca);
  const cm = new Map();
  for (const r of crows) {
    let a = {}; try { a = JSON.parse(r.address || '{}'); } catch { /* boş */ }
    const k = cityName(a.city) || 'BİLİNMİYOR';
    const x = cm.get(k) || { city: k, orders: 0, revenue: 0, shipped: 0, units: 0 };
    x.orders++; x.revenue += r.total; x.units += r.units || 0; if (r.status === 'shipped' || r.status === 'delivered') x.shipped++;
    cm.set(k, x);
  }
  const cities = [...cm.values()].map((x) => ({ ...x, revenue: r2(x.revenue) })).sort((a, b) => b.orders - a.orders);
  const trows = await all(db, `SELECT i.product_id, COALESCE(p.name, i.name) AS name, COALESCE(p.sku, i.sku) AS sku, COALESCE(p.image, i.image) AS image, p.stock, p.purchase_price AS cost, o.channel,
      SUM(i.quantity) AS qty, SUM(i.total) AS revenue, COUNT(DISTINCT o.id) AS orders, MIN(i.unit_price) AS min, MAX(i.unit_price) AS max
    FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE} AND i.status NOT IN ('cancelled', 'returned')${cw}
    GROUP BY COALESCE(CAST(i.product_id AS TEXT), 'n:' || COALESCE(NULLIF(i.sku, ''), i.name)), o.channel`, from, to, ...ca);
  const tm = new Map();
  for (const r of trows) {
    const k = r.product_id ? 'p' + r.product_id : 'n' + (r.sku || r.name);
    const x = tm.get(k) || { product_id: r.product_id, name: r.name, sku: r.sku, image: r.image, stock: r.stock, cost: r.cost, qty: 0, revenue: 0, orders: 0, min: Infinity, max: 0, channels: {} };
    x.qty += r.qty; x.revenue += r.revenue; x.orders += r.orders; x.min = Math.min(x.min, r.min || Infinity); x.max = Math.max(x.max, r.max || 0);
    x.channels[r.channel] = (x.channels[r.channel] || 0) + r.qty;
    tm.set(k, x);
  }
  // Önceki aynı uzunluktaki dönemin adetleri (artış / düşüş) ve bu dönemde iptal / iade edilen adetler
  const key = (r) => (r.product_id ? 'p' + r.product_id : 'n' + (r.sku || r.name));
  const kexpr = "COALESCE(CAST(i.product_id AS TEXT), 'n:' || COALESCE(NULLIF(i.sku, ''), i.name))";
  const [prow, lrow] = await Promise.all([
    all(db, `SELECT i.product_id, COALESCE(p.sku, i.sku) AS sku, COALESCE(p.name, i.name) AS name, SUM(i.quantity) AS qty FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
      WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE} AND i.status NOT IN ('cancelled', 'returned')${cw} GROUP BY ${kexpr}`, from - (to - from), from, ...ca),
    all(db, `SELECT i.product_id, COALESCE(p.sku, i.sku) AS sku, COALESCE(p.name, i.name) AS name, SUM(i.quantity) AS qty FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
      WHERE o.ordered_at >= ? AND o.ordered_at < ? AND (i.status IN ('cancelled', 'returned') OR o.status IN ('cancelled', 'returned'))${cw} GROUP BY ${kexpr}`, from, to, ...ca),
  ]);
  const prev = new Map(prow.map((r) => [key(r), r.qty])), lost = new Map(lrow.map((r) => [key(r), r.qty]));
  const days = Math.max(1, (Math.min(to, now) - from) / 864e5), all$ = [...tm.values()], totQ = all$.reduce((a, x) => a + x.qty, 0), totR = all$.reduce((a, x) => a + x.revenue, 0);
  const sort = q.sort === 'revenue' ? (a, b) => b.revenue - a.revenue : (a, b) => b.qty - a.qty || b.revenue - a.revenue;
  const top = all$.sort(sort).slice(0, Math.min(Number(q.limit) || 50, 500))
    .map((x) => {
      const k = key(x), pq = prev.get(k) || 0, perDay = x.qty / days;
      return { ...x, cost: undefined, revenue: r2(x.revenue), avg: x.qty ? r2(x.revenue / x.qty) : 0, min: Number.isFinite(x.min) ? r2(x.min) : 0, max: r2(x.max),
        prevQty: pq, trend: pq ? Math.round(((x.qty - pq) / pq) * 100) : null,
        share: totR ? Math.round((x.revenue / totR) * 1000) / 10 : 0, qtyShare: totQ ? Math.round((x.qty / totQ) * 1000) / 10 : 0,
        lost: lost.get(k) || 0, lostRate: x.qty + (lost.get(k) || 0) ? Math.round(((lost.get(k) || 0) / (x.qty + (lost.get(k) || 0))) * 100) : 0,
        // Alış fiyatı girilmişse brüt kâr (satış - alış; komisyon / kargo hariç)
        profit: x.cost > 0 ? r2(x.revenue - x.cost * x.qty) : null,
        cover: x.stock != null && perDay > 0 ? Math.floor(x.stock / perDay) : null };
    });
  return { unit, channel: chan, cards, weeks, range: { from, to }, cities, top, products: tm.size, totals: { orders: crows.length, revenue: r2(crows.reduce((s, r) => s + r.total, 0)), units: totQ } };
}
