// İstatistik: ciro / sipariş adedi (kanal bazında + toplam), dönem karşılaştırma, en çok satanlar, tahmini kâr.
import { all, getSettings } from './db.js';
import { dayKey, weekKey, monthKey, TR, r2 } from './util.js';
import { CHANNEL_IDS } from './channels/index.js';
import { profit } from '../public/profit.js';

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
  for (const r of rows) {
    const tt = totals[r.channel];
    if (!tt) continue;
    if (r.status === 'cancelled') { tt.cancelled++; continue; }
    if (r.status === 'returned') { tt.returned++; continue; }
    const b = series[idx.get(f(r.ordered_at))];
    tt.revenue += r.total; tt.orders++;
    if (b) { b.revenue[r.channel] += r.total; b.orders[r.channel]++; }
  }
  // Tahmini kâr: satır tutarı − komisyon − alış maliyeti; sipariş başına kargo + hizmet bedeli
  const lines = await all(db, `SELECT o.id, o.channel, o.ordered_at, o.shipping_cost, i.total, i.quantity, p.purchase_price, l.commission
    FROM order_items i JOIN orders o ON o.id = i.order_id
    LEFT JOIN products p ON p.id = i.product_id
    LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE} AND i.status != 'cancelled'`, fromMs, toMs);
  const seen = new Set();
  let missingCost = 0;
  for (const l of lines) {
    const ch = l.channel, tt = totals[ch];
    if (!tt) continue;
    const rate = l.commission ?? (settings.commission || {})[ch] ?? 0;
    let v = profit({ sale: l.total, purchase: (l.purchase_price || 0) * l.quantity, commissionRate: rate }).unitProfit;
    if (!l.purchase_price) missingCost++;
    if (!seen.has(l.id)) {
      seen.add(l.id);
      v -= (l.shipping_cost ?? (settings.shipping || {})[ch] ?? 0) + ((settings.service_fee || {})[ch] || 0);
    }
    tt.profit += v; tt.items += l.quantity;
    const b = series[idx.get(f(l.ordered_at))];
    if (b) b.profit += v;
  }
  for (const t of Object.values(totals)) { t.revenue = r2(t.revenue); t.profit = r2(t.profit); }
  for (const b of series) { for (const c of CHANNEL_IDS) b.revenue[c] = r2(b.revenue[c]); b.profit = r2(b.profit); }
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
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE} AND i.status != 'cancelled'
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
  const now = Date.now(), t0 = startOf(dayKey(now));
  const [todayP, yestP, last14, counts, low, unlinked] = await Promise.all([
    all(db, `SELECT channel, COUNT(*) AS n, SUM(total) AS revenue FROM orders o WHERE ordered_at >= ? AND ${LIVE} GROUP BY channel`, t0),
    all(db, `SELECT channel, COUNT(*) AS n, SUM(total) AS revenue FROM orders o WHERE ordered_at >= ? AND ordered_at < ? AND ${LIVE} GROUP BY channel`, t0 - D, t0),
    period(db, t0 - 13 * D, t0 + D, 'day', await getSettings(db)),
    all(db, "SELECT status, channel, COUNT(*) AS n FROM orders WHERE status IN ('new', 'processing') GROUP BY status, channel"),
    all(db, 'SELECT id, name, sku, stock, critical_stock FROM products WHERE active = 1 AND (stock <= critical_stock OR stock <= 0) ORDER BY stock ASC LIMIT 20'),
    all(db, 'SELECT COUNT(*) AS n FROM listings WHERE product_id IS NULL'),
  ]);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.channel, { orders: r.n, revenue: r2(r.revenue) }]));
  return {
    today: by(todayP), yesterday: by(yestP), last14: { series: last14.series, totals: last14.totals, total: last14.total },
    pending: counts, lowStock: low, unlinked: unlinked[0] ? unlinked[0].n : 0,
  };
}
