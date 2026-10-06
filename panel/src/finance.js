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
  // Kargo ve hizmet bedeli sipariş başınadır; tüm satırları iptal edilmiş siparişte sayılmaz (istatistiklerle aynı kural)
  const live = o.items.some((i) => i.status !== 'cancelled');
  const shipping = live ? o.shipping_cost ?? costOf(settings, 'shipping', ch) : 0;
  const fee = live ? costOf(settings, 'service_fee', ch) : 0;
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
  // Sipariş bazında kargo tutarı gelmeyen kanalda (siparişlerin yarısından azı) pazaryerinin dönemde kestiği kargo faturalarının
  // toplamı kullanılır: tahmin (Ayarlar'daki sipariş başı kargo, çoğu zaman 0) yerine gerçek gider.
  const invCargo = await all(db, `SELECT channel, ROUND(SUM(amount), 2) AS amount, COUNT(*) AS n FROM invoices WHERE type = 'Kargo' AND date >= ? AND date < ?${channel ? ' AND channel = ?' : ''} GROUP BY channel`, from, to, ...ca);
  const costState = Object.fromEntries((await all(db, "SELECT k, v FROM settings WHERE k LIKE 'costs:%'")).map((r) => { try { return [r.k.slice(6), JSON.parse(r.v)]; } catch { return [r.k.slice(6), null]; } }));
  total.invoiceShipping = 0;
  for (const [c, x] of per) {
    x.shippingSrc = x.realShipping ? (x.realShipping === x.orders ? 'api' : 'mixed') : 'estimate';
    const inv = invCargo.find((r) => r.channel === c);
    if (inv && inv.amount > 0 && x.realShipping < x.orders / 2) {
      const d = inv.amount - x.shipping;
      for (const y of [x, total]) { y.shipping += d; y.payout -= d; y.profit -= d; }
      x.shippingSrc = 'invoice'; x.invoiceShipping = inv.amount; total.invoiceShipping += inv.amount;
    }
    const st = costState[c];
    if (st && st.error) x.shippingError = st.error;
  }
  const round = (x) => { for (const k of KEYS) x[k] = r2(x[k]); x.margin = x.revenue ? r2((x.profit / x.revenue) * 100) : 0; return x; };
  round(total);
  const pc = [...per.values()];
  const shipNote = pc.some((x) => x.shippingSrc === 'invoice')
    ? [total.realShipping ? `${total.realShipping}/${total.orders} siparişte kargo faturasından` : '', `${pc.filter((x) => x.shippingSrc === 'invoice').length} kanalda dönemin kargo faturaları toplamı (${r2(total.invoiceShipping)} ₺)`].filter(Boolean).join(' · ')
    : total.realShipping ? `${total.realShipping}/${total.orders} siparişte kargo faturasından` : total.shipping ? 'tahmin (Ayarlar → Giderler, sipariş başı kargo)' : 'kanaldan kargo tutarı gelmedi — Ayarlar → Giderler\'den sipariş başı kargo girin';
  // Şelale: satıştan kâra her basamak
  const steps = [
    { k: 'revenue', label: 'Satış (ciro)', v: total.revenue },
    { k: 'commission', label: 'Komisyon', v: -total.commission, note: `${total.realCommission}/${total.orders} siparişte kanalın bildirdiği tutar` },
    { k: 'shipping', label: 'Kargo', v: -total.shipping, note: shipNote },
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

// ---------- hakediş ----------
// Pazaryerinin hesap ekstresi (satış / iade / indirim / komisyon kayıtları ve ödeme tarihleri) 6 saatte bir okunur ve saklanır.
export async function syncSettlements(env, db, { force = false, only } = {}) {
  const out = {};
  for (const ch of await getChannels(env, db)) {
    if (!ch.enabled || ch.demo || !ch.settlements || (only && !only.includes(ch.id))) continue;
    const key = 'stlsync:' + ch.id, last = await getRaw(db, key);
    if (!force && last && Date.now() - last.at < 6 * 3600e3) continue;
    const t = Date.now();
    try {
      const rows = await ch.settlements(last ? t - 20 * 864e5 : t - 60 * 864e5, t);
      for (const part of chunk(rows, 60)) {
        await db.batch(part.map((x) => db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (channel, remote_id) DO UPDATE SET date = excluded.date, type = excluded.type, order_number = excluded.order_number, amount = excluded.amount, commission = excluded.commission,
            payment_date = excluded.payment_date, due_date = excluded.due_date, paid = excluded.paid, payment_id = excluded.payment_id, synced_at = excluded.synced_at`)
          .bind(ch.id, String(x.remoteId), x.date || null, x.type || '', x.orderNumber || '', x.amount || 0, x.commission || 0, x.paymentDate || null, x.dueDate || null, x.paid ? 1 : 0, x.paymentId || '', t)));
      }
      await setSetting(db, key, { at: t, n: rows.length });
      out[ch.id] = rows.length;
    } catch (e) {
      out[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Hakediş kayıtları alınamadı: ' + e.message);
    }
  }
  return out;
}

// Hakediş raporu: ödeme günlerine göre (ödenen / ödenecek), dönem toplamları ve mutabakat (pazaryerinin hakedişi ile panelin tahmini farklı olan siparişler)
export async function settlementReport(env, db, settings, q = {}) {
  const now = Date.now(), from = Number(q.from) || now - 30 * 864e5, to = Number(q.to) || now + 1;
  const cw = q.channel ? ' AND channel = ?' : '', ca = q.channel ? [q.channel] : [];
  const day = "strftime('%Y-%m-%d', COALESCE(due_date, payment_date, date) / 1000 + 10800, 'unixepoch')";
  // Ödeme günleri: seçilen aralık + önümüzdeki 60 gün (ödenecekler)
  const days = await all(db, `SELECT channel, ${day} AS d, ROUND(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 2) AS paid, ROUND(SUM(CASE WHEN paid = 0 THEN amount ELSE 0 END), 2) AS due, COUNT(*) AS n
    FROM settlements WHERE COALESCE(due_date, payment_date, date) >= ? AND COALESCE(due_date, payment_date, date) < ?${cw} GROUP BY channel, d ORDER BY d DESC, channel`, from, Math.max(to, now + 60 * 864e5), ...ca);
  const tot = await first(db, `SELECT ROUND(COALESCE(SUM(CASE WHEN paid = 1 AND COALESCE(payment_date, due_date) >= ? AND COALESCE(payment_date, due_date) < ? THEN amount END), 0), 2) AS paid,
      ROUND(COALESCE(SUM(CASE WHEN paid = 0 THEN amount END), 0), 2) AS upcoming, ROUND(COALESCE(SUM(CASE WHEN paid = 0 AND due_date < ? THEN amount END), 0), 2) AS overdue
    FROM settlements WHERE 1 = 1${cw}`, from, to, now - 864e5, ...ca);
  const types = await all(db, `SELECT type, ROUND(SUM(amount), 2) AS amount, COUNT(*) AS n FROM settlements WHERE date >= ? AND date < ?${cw} GROUP BY type ORDER BY ABS(SUM(amount)) DESC`, from, to, ...ca);
  // Mutabakat: dönemde satılan, pazaryerinin hakediş kaydı olan siparişlerde gerçek hakediş − panel tahmini (komisyon, kargo hariç kesintiler)
  const orders = await all(db, `SELECT o.id, o.channel, o.order_number, o.ordered_at, o.shipping_cost, o.shipping_src, s.amount AS actual
    FROM orders o JOIN (SELECT channel, order_number, SUM(amount) AS amount FROM settlements WHERE order_number != '' AND (type IN ('Satış', 'İade', 'İndirim', 'İndirim iptali', 'Kupon', 'Kupon iptali', 'Kampanya indirimi', 'Komisyon') OR type LIKE 'Komisyon düzeltme%') GROUP BY channel, order_number) s ON s.channel = o.channel AND s.order_number = o.order_number
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND o.status NOT IN ('cancelled')${q.channel ? ' AND o.channel = ?' : ''} ORDER BY o.ordered_at DESC LIMIT 2000`, from, to, ...ca);
  const diffs = [];
  if (orders.length) {
    const ids = orders.map((o) => o.id), items = [];
    for (const part of chunk(ids, 80)) items.push(...await all(db, `SELECT i.order_id, i.total, i.quantity, i.status, i.commission, p.purchase_price, l.commission AS listing_commission FROM order_items i JOIN orders o ON o.id = i.order_id
      LEFT JOIN products p ON p.id = i.product_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key WHERE i.order_id IN (${part.map(() => '?').join(',')})`, ...part));
    const by = new Map();
    for (const i of items) (by.get(i.order_id) || by.set(i.order_id, []).get(i.order_id)).push(i);
    for (const o of orders) {
      const p = orderProfit({ ...o, shipping_cost: 0, items: by.get(o.id) || [] }, { ...settings, shipping: {}, service_fee: {}, fee_rate: {}, withholding: {} });
      const diff = Math.round((o.actual - p.payout) * 100) / 100;
      if (Math.abs(diff) >= 1) diffs.push({ id: o.id, channel: o.channel, order_number: o.order_number, ordered_at: o.ordered_at, expected: p.payout, actual: Math.round(o.actual * 100) / 100, diff });
    }
  }
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const supported = (await getChannels(env, db)).filter((c) => c.enabled && !c.demo && c.settlements).map((c) => c.id);
  return { from, to, totals: { ...tot, checked: orders.length, mismatched: diffs.length }, days: days.slice(0, 120), types, diffs: diffs.slice(0, 100), supported };
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
