// Gelir & gider: sipariş kârı ve dönem bazında masraf basamakları
//   Satış − komisyon − kargo − hizmet bedeli − ek kesinti (işlem / ödeme bedeli) − stopaj = hakediş; hakediş − alış maliyeti = kâr.
// Komisyon ve kargo, kanal bildirdiyse gerçek tutardır (sipariş satırı komisyonu, kargo faturası); yoksa Ayarlar'daki oranlarla tahmin edilir.
import { all, first, getRaw, setSetting, log } from './db.js';
import { getChannels } from './channels/index.js';
import { chunk } from './util.js';
import { profit, costOf } from '../public/profit.js';
import { r2 } from './util.js';

export function orderProfit(o, settings) {
  const ch = o.channel;
  let revenue = 0, commission = 0, cost = 0, missing = 0, realCommission = true;
  for (const i of o.items) {
    if (i.status === 'cancelled') continue;
    const rate = i.listing_commission ?? costOf(settings, 'commission', ch);
    revenue += i.total;
    // Kanalın bildirdiği gerçek komisyon varsa o; yoksa ilan / kanal oranıyla tahmin
    if (i.commission != null) commission += i.commission; else { commission += profit({ sale: i.total, commissionRate: rate }).commission; realCommission = false; }
    if (i.purchase_price) cost += i.purchase_price * i.quantity; else missing++;
  }
  const shipping = o.shipping_cost ?? costOf(settings, 'shipping', ch);
  const fee = costOf(settings, 'service_fee', ch);
  // Yüzdelik kesintiler: ek kesinti (işlem / ödeme bedeli) ve stopaj (KDV hariç satış üzerinden; KDV %20 varsayılır)
  const x = profit({ sale: revenue, feeRate: costOf(settings, 'fee_rate', ch), withholdingRate: costOf(settings, 'withholding', ch) });
  const net = revenue - commission - shipping - fee - x.rateFee - x.withholding;
  const shippingSrc = o.shipping_cost == null ? 'estimate' : o.shipping_src === 'api' ? 'api' : 'manual';
  return {
    revenue: r2(revenue), commission: r2(commission), commissionSrc: realCommission && o.items.length ? 'api' : 'estimate', shipping: r2(shipping), shippingSrc,
    fee: r2(fee), rateFee: r2(x.rateFee), withholding: r2(x.withholding), payout: r2(net), cost: r2(cost), profit: r2(net - cost), missingCost: missing,
  };
}

const LIVE = "o.status NOT IN ('cancelled', 'returned')";
const KEYS = ['revenue', 'commission', 'shipping', 'fee', 'rateFee', 'withholding', 'payout', 'cost', 'profit'];

// Dönem: siparişler kanal kanal toplanır; masraf basamakları (şelale) ve kanal tablosu
export async function breakdown(db, settings, { from, to, channel } = {}) {
  const now = Date.now();
  from = Number(from) || now - 30 * 864e5; to = Number(to) || now + 1;
  const cw = channel ? ' AND o.channel = ?' : '', ca = channel ? [channel] : [];
  const orders = await all(db, `SELECT o.id, o.channel, o.shipping_cost, o.shipping_src FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}`, from, to, ...ca);
  const items = await all(db, `SELECT i.order_id, i.total, i.quantity, i.status, i.commission, p.purchase_price, l.commission AS listing_commission
    FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}`, from, to, ...ca);
  const byOrder = new Map();
  for (const i of items) (byOrder.get(i.order_id) || byOrder.set(i.order_id, []).get(i.order_id)).push(i);
  const zero = () => ({ orders: 0, missingCost: 0, realShipping: 0, realCommission: 0, ...Object.fromEntries(KEYS.map((k) => [k, 0])) });
  const per = new Map(), total = zero();
  for (const o of orders) {
    const p = orderProfit({ ...o, items: byOrder.get(o.id) || [] }, settings);
    const t = per.get(o.channel) || per.set(o.channel, zero()).get(o.channel);
    for (const x of [t, total]) {
      for (const k of KEYS) x[k] += p[k];
      x.orders++; x.missingCost += p.missingCost;
      if (p.shippingSrc === 'api') x.realShipping++;
      if (p.commissionSrc === 'api') x.realCommission++;
    }
  }
  const round = (x) => { for (const k of KEYS) x[k] = r2(x[k]); x.margin = x.revenue ? r2((x.profit / x.revenue) * 100) : 0; return x; };
  round(total);
  // Şelale: satıştan kâra her basamak
  const steps = [
    { k: 'revenue', label: 'Satış (ciro)', v: total.revenue },
    { k: 'commission', label: 'Komisyon', v: -total.commission, note: `${total.realCommission}/${total.orders} siparişte kanalın bildirdiği tutar` },
    { k: 'shipping', label: 'Kargo', v: -total.shipping, note: `${total.realShipping}/${total.orders} siparişte kargo faturasından` },
    { k: 'fee', label: 'Hizmet bedeli', v: -total.fee },
    { k: 'rateFee', label: 'Ek kesinti (işlem / ödeme)', v: -total.rateFee },
    { k: 'withholding', label: 'Stopaj', v: -total.withholding, note: 'gelir vergisinden mahsup edilir' },
    { k: 'payout', label: 'Hakediş', v: total.payout, sum: true },
    { k: 'cost', label: 'Alış maliyeti', v: -total.cost, note: total.missingCost ? `${total.missingCost} satırda alış fiyatı yok` : '' },
    { k: 'profit', label: 'Tahmini kâr', v: total.profit, sum: true },
  ];
  return { from, to, total, steps, channels: [...per.entries()].map(([c, x]) => ({ channel: c, ...round(x) })).sort((a, b) => b.revenue - a.revenue) };
}

// ---------- kesilen faturalar ----------
// Kanalın finans servisinden (Trendyol cari ekstre, Hepsiburada muhasebe işlemleri) okunur ve panelde saklanır: 6 saatte bir,
// ilk seferde son 90 gün, sonra son 20 gün (geç düşen faturalar için). Aynı fatura tekrar yazılmaz, tutarı güncellenir.
export async function syncInvoices(env, db, { force = false, only } = {}) {
  const out = {};
  for (const ch of await getChannels(env, db)) {
    if (!ch.enabled || ch.demo || !ch.invoices || (only && !only.includes(ch.id))) continue;
    const key = 'invsync:' + ch.id, last = await getRaw(db, key);
    if (!force && last && Date.now() - last.at < 6 * 3600e3) continue;
    const t = Date.now();
    try {
      const rows = await ch.invoices(last ? t - 20 * 864e5 : t - 90 * 864e5, t);
      for (const part of chunk(rows, 60)) {
        await db.batch(part.map((x) => db.prepare(`INSERT INTO invoices (channel, remote_id, no, date, type, description, amount, order_number, url, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (channel, remote_id) DO UPDATE SET no = excluded.no, date = excluded.date, type = excluded.type, description = excluded.description, amount = excluded.amount,
            order_number = excluded.order_number, url = COALESCE(NULLIF(excluded.url, ''), invoices.url), synced_at = excluded.synced_at`)
          .bind(ch.id, String(x.remoteId), x.no || '', x.date, x.type, x.description || '', x.amount, x.orderNumber || '', x.url || '', t)));
      }
      await setSetting(db, key, { at: t, n: rows.length });
      out[ch.id] = rows.length;
    } catch (e) {
      out[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Faturalar alınamadı: ' + e.message);
    }
  }
  return out;
}

export async function listInvoices(env, db, q = {}) {
  const where = ['date >= ?', 'date < ?'], args = [Number(q.from) || Date.now() - 30 * 864e5, Number(q.to) || Date.now() + 1];
  if (q.channel) { where.push('channel = ?'); args.push(q.channel); }
  const W = 'WHERE ' + where.join(' AND ');
  const types = await all(db, `SELECT type, COUNT(*) AS n, ROUND(SUM(amount), 2) AS amount FROM invoices ${W} GROUP BY type ORDER BY amount DESC`, ...args);
  if (q.type) { where.push('type = ?'); args.push(q.type); }
  const W2 = 'WHERE ' + where.join(' AND ');
  const items = await all(db, `SELECT channel, remote_id, no, date, type, description, amount, order_number, url FROM invoices ${W2} ORDER BY date DESC LIMIT 300`, ...args);
  const t = await first(db, `SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(amount), 0), 2) AS s FROM invoices ${W2}`, ...args);
  const supported = (await getChannels(env, db)).filter((c) => c.enabled && !c.demo && c.invoices).map((c) => c.id);
  return { items, total: t.n, sum: t.s, types, supported };
}
