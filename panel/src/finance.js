// Gelir & gider: sipariş kârı ve dönem bazında masraf basamakları
//   Satış − komisyon − kargo − hizmet bedeli − ek kesinti (işlem / ödeme bedeli) − stopaj = hakediş; hakediş − alış maliyeti = kâr.
// Komisyon ve kargo, kanal bildirdiyse gerçek tutardır (sipariş satırı komisyonu, kargo faturası); yoksa Ayarlar'daki oranlarla tahmin edilir.
import { all, first, run, getRaw, setSetting, log } from './db.js';
import { getChannels } from './channels/index.js';
import { chunk, fail, PRODUCT_SHIP } from './util.js';
import { profit, costOf, rateGross, costVat } from '../public/profit.js';
import { r2 } from './util.js';

// Satırın iade edilmeyen payı: kısmi iadede (3 adetten 1'i iade) ciro, komisyon ve maliyet kalan adede göre sayılır
export const keptShare = (i) => { const q = Number(i.quantity) || 0, r = Math.min(q, Math.max(0, Number(i.returned_qty) || 0)); return q > 0 ? (q - r) / q : 1; };
const liveLine = (i) => i.status !== 'cancelled' && i.status !== 'returned' && keptShare(i) > 0;
export function orderProfit(o, settings) {
  const ch = o.channel;
  let revenue = 0, commission = 0, cost = 0, missing = 0, realCommission = true;
  for (const i of o.items) {
    if (!liveLine(i)) continue;
    const rate = rateGross(settings, i.listing_commission, i.listing_commission_src) ?? costOf(settings, 'commission', ch), k = keptShare(i);
    revenue += i.total * k;
    // Kanalın bildirdiği gerçek komisyon varsa o; yoksa ilan / kanal oranıyla tahmin (iade edilen adedin komisyonu kanal tarafından geri verilir)
    if (i.commission != null) commission += i.commission * k; else { commission += profit({ sale: i.total * k, commissionRate: rate }).commission; realCommission = false; }
    if (i.purchase_price) cost += i.purchase_price * i.quantity * k; else missing++;
  }
  // Kargo ve hizmet bedeli sipariş başınadır; tüm satırları iptal edilmiş siparişte sayılmaz (istatistiklerle aynı kural)
  const live = o.items.some(liveLine);
  // Kargo: kanal faturası / siparişe elle girilen → ürünün kargo tutarı (en yükseği; tek koli) → Ayarlar'daki sipariş başı tutar
  const prodShip = Math.max(0, ...o.items.filter(liveLine).map((i) => Number(i.ship_cost) || 0));
  const defShip = costOf(settings, 'shipping', ch);
  const shipping = live ? o.shipping_cost ?? (prodShip > 0 ? prodShip : defShip) : 0;
  const fee = live ? costOf(settings, 'service_fee', ch) : 0;
  // Yüzdelik kesintiler: ek kesinti (işlem / ödeme bedeli) ve stopaj (KDV hariç satış üzerinden; KDV %20 varsayılır)
  const x = profit({ sale: revenue, feeRate: costOf(settings, 'fee_rate', ch), withholdingRate: costOf(settings, 'withholding', ch) });
  const net = revenue - commission - shipping - fee - x.rateFee - x.withholding;
  const shippingSrc = o.shipping_cost != null ? (o.shipping_src === 'api' ? 'api' : o.shipping_src === 'carrier' ? 'carrier' : 'manual') : prodShip > 0 ? 'product' : defShip > 0 ? 'default' : 'none';
  return {
    revenue: r2(revenue), commission: r2(commission), commissionSrc: realCommission && o.items.length ? 'api' : 'estimate', shipping: r2(shipping), shippingSrc,
    fee: r2(fee), rateFee: r2(x.rateFee), withholding: r2(x.withholding), payout: r2(net), cost: r2(cost), profit: r2(net - cost), missingCost: missing,
  };
}

const LIVE = "o.status NOT IN ('cancelled', 'returned')";
const KEYS = ['revenue', 'commission', 'shipping', 'fee', 'rateFee', 'withholding', 'ads', 'penalty', 'returnLoss', 'payout', 'cost', 'profit'];
// Siparişe bağlanamayan pazaryeri kesintileri (kesilen faturalardan, fatura tarihine göre dönemde)
const INV_ADS = ['Reklam / pazarlama'], INV_PENALTY = ['Ceza', 'Diğer kesinti'];

// ---------- işletme giderleri (kira, personel, paketleme …) ----------
// Elle girilir; tek seferlik gider tarihine göre, aylık gider başlangıç (ve varsa bitiş) arasında her aya gün bazında yayılır.
export const EXPENSE_CATS = ['Kira', 'Personel', 'Paketleme', 'Reklam (pazaryeri dışı)', 'Yazılım / abonelik', 'Muhasebe', 'Vergi / harç', 'Fatura (elektrik, internet …)', 'Diğer'];
const DAY = 864e5;
// Gider kaydının [from, to) dönemine düşen tutarı
export function expenseIn(e, from, to) {
  if (e.recurring !== 'monthly') return e.date >= from && e.date < to ? e.amount : 0;
  const start = Math.max(from, e.date), end = Math.min(to, e.until ? e.until + DAY : to, Date.now() + DAY);
  if (end <= start) return 0;
  // Ay ay: (çakışan gün / ayın gün sayısı) × aylık tutar (Türkiye saati)
  let sum = 0, t = start;
  while (t < end) {
    const d = new Date(t + 3 * 3600e3), y = d.getUTCFullYear(), m = d.getUTCMonth();
    const ms = Date.UTC(y, m, 1) - 3 * 3600e3, me = Date.UTC(y, m + 1, 1) - 3 * 3600e3;
    const seg = Math.min(end, me) - t;
    sum += (e.amount * seg) / (me - ms);
    t = Math.min(end, me);
  }
  return sum;
}
export async function expenseTotals(db, from, to) {
  const rows = await all(db, "SELECT * FROM expenses WHERE (recurring = 'monthly' AND date < ? AND (until IS NULL OR until + ? >= ?)) OR (COALESCE(recurring, '') != 'monthly' AND date >= ? AND date < ?)", to, DAY, from, from, to);
  const byCat = new Map();
  let total = 0;
  for (const e of rows) {
    const v = expenseIn(e, from, to);
    if (!v) continue;
    total += v;
    byCat.set(e.category || 'Diğer', (byCat.get(e.category || 'Diğer') || 0) + v);
  }
  return { total: r2(total), categories: [...byCat].map(([category, amount]) => ({ category, amount: r2(amount) })).sort((a, b) => b.amount - a.amount) };
}
export async function listExpenses(db) {
  return { items: await all(db, 'SELECT * FROM expenses ORDER BY (recurring = \'monthly\') DESC, date DESC LIMIT 500'), categories: EXPENSE_CATS };
}
export async function saveExpense(db, b, id = null) {
  const title = String(b.title || '').trim().slice(0, 120), amount = Math.round(Number(String(b.amount ?? '').replace(',', '.')) * 100) / 100;
  if (!title) fail(400, 'Gider adı yazın');
  if (!(amount > 0)) fail(400, 'Tutar girin');
  const date = Number(b.date) || Date.now(), recurring = b.recurring === 'monthly' ? 'monthly' : '';
  const until = recurring && Number(b.until) ? Number(b.until) : null, cat = EXPENSE_CATS.includes(b.category) ? b.category : 'Diğer', note = String(b.note || '').slice(0, 300);
  if (id) await run(db, 'UPDATE expenses SET title = ?, category = ?, amount = ?, date = ?, recurring = ?, until = ?, note = ? WHERE id = ?', title, cat, amount, date, recurring, until, note, Number(id));
  else id = (await first(db, 'INSERT INTO expenses (title, category, amount, date, recurring, until, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', title, cat, amount, date, recurring, until, note, Date.now())).id;
  return { ok: true, id };
}
export const deleteExpense = (db, id) => run(db, 'DELETE FROM expenses WHERE id = ?', Number(id)).then(() => ({ ok: true }));

// Dönemin siparişleri kanal başına veritabanında toplanır (sipariş kârı orderProfit ile aynı kurallar): satırlar panele taşınmaz,
// 1 yıllık / on binlerce siparişlik dönem de hızlı açılır. Oranlar (komisyon, kargo, hizmet bedeli …) kanal başına CASE ile.
async function aggregate(db, settings, { from, to, channel }) {
  const cw = channel ? ' AND o.channel = ?' : '', ca = channel ? [channel] : [];
  const chans = (await all(db, `SELECT DISTINCT o.channel FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}`, from, to, ...ca)).map((r) => r.channel).filter((c) => /^[a-z0-9_]+$/i.test(c));
  if (!chans.length) return [];
  const rate = (key, col = 'o.channel') => `(CASE ${col} ${chans.map((c) => `WHEN '${c}' THEN ${Number(costOf(settings, key, c)) || 0}`).join(' ')} ELSE 0 END)`;
  const LIVEI = "i.order_id IS NOT NULL AND COALESCE(i.status, '') NOT IN ('cancelled', 'returned')";
  // Kısmi iade: satırın iade edilmeyen payı (bkz. keptShare)
  const K = "(CASE WHEN i.quantity > 0 THEN (i.quantity - MIN(i.quantity, MAX(0, COALESCE(i.returned_qty, 0)))) * 1.0 / i.quantity ELSE 1 END)";
  // Tek geçiş: siparişler tarih dizininden bir kez okunur, satırlarıyla sipariş başına toplanır, sonra kanal başına toplanır
  // (önceki iki aşamalı sorgu siparişleri iki kez tarıyor ve ara sonuç için geçici dizin kuruyordu; 1 yıllık dönem ~%40 daha hızlı)
  return all(db, `SELECT channel, COUNT(*) AS orders, COALESCE(SUM(rev), 0) AS revenue, COALESCE(SUM(comm), 0) AS commission,
      SUM(CASE WHEN n > 0 AND estc = 0 THEN 1 ELSE 0 END) AS realCommission, COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(miss), 0) AS missingCost,
      SUM(CASE WHEN live > 0 THEN COALESCE(sc, pship, ${rate('shipping', 'channel')}) ELSE 0 END) AS shipping,
      SUM(CASE WHEN live > 0 AND sc IS NULL AND pship IS NOT NULL THEN 1 ELSE 0 END) AS productShipping,
      SUM(CASE WHEN sc IS NOT NULL AND ss IN ('api', 'carrier') THEN 1 ELSE 0 END) AS realShipping,
      SUM(CASE WHEN live > 0 THEN ${rate('service_fee', 'channel')} ELSE 0 END) AS fee,
      SUM(rev * ${rate('fee_rate', 'channel')} / 100.0) AS rateFee,
      SUM(rev * 100.0 / 120.0 * ${rate('withholding', 'channel')} / 100.0) AS withholding
    FROM (SELECT o.channel, o.shipping_cost AS sc, o.shipping_src AS ss,
        SUM(CASE WHEN ${LIVEI} THEN i.total * ${K} ELSE 0 END) AS rev,
        SUM(CASE WHEN ${LIVEI} THEN COALESCE(i.commission, i.total * COALESCE(l.commission * ${costVat(settings)}, ${rate('commission')}) / 100.0) * ${K} ELSE 0 END) AS comm,
        SUM(CASE WHEN ${LIVEI} AND i.commission IS NULL THEN 1 ELSE 0 END) AS estc,
        SUM(CASE WHEN ${LIVEI} AND COALESCE(p.purchase_price, 0) != 0 THEN p.purchase_price * i.quantity * ${K} ELSE 0 END) AS cost,
        SUM(CASE WHEN ${LIVEI} AND COALESCE(p.purchase_price, 0) = 0 THEN 1 ELSE 0 END) AS miss,
        SUM(CASE WHEN ${LIVEI} THEN 1 ELSE 0 END) AS live, COUNT(i.order_id) AS n,
        -- Ürüne girilen kargo tutarı (siparişteki en yüksek): ürünler zaten bu geçişte okunur, sipariş başına ayrı alt sorgu gerekmez
        MAX(CASE WHEN ${LIVEI} AND p.ship_cost > 0 THEN p.ship_cost END) AS pship
      FROM orders o LEFT JOIN order_items i ON i.order_id = o.id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
      WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw} GROUP BY o.id)
    GROUP BY channel`, from, to, ...ca)
    .then((rows) => rows.map((r) => { const payout = r.revenue - r.commission - r.shipping - r.fee - r.rateFee - r.withholding; return { ...r, payout, profit: payout - r.cost }; }));
}

// Dönem: siparişler kanal kanal toplanır; masraf basamakları (şelale), kanal tablosu ve işletme giderleriyle net kâr
export async function breakdown(db, settings, { from, to, channel } = {}) {
  const now = Date.now();
  from = Number(from) || now - 30 * 864e5; to = Number(to) || now + 1;
  const cw = channel ? ' AND o.channel = ?' : '', ca = channel ? [channel] : [];
  const iw = channel ? ' AND channel = ?' : '';
  const [agg, returned, invRows, costRows, expenses] = await Promise.all([
    aggregate(db, settings, { from, to, channel }),
    // İade edilen siparişler: gönderim kargosu geri gelmez (iade kargosu pazaryerinin kargo faturasındadır)
    all(db, `SELECT o.channel, COUNT(*) AS n, SUM(o.shipping_cost IS NULL) AS est, COALESCE(SUM(o.shipping_cost), 0) AS ship FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ? AND o.status = 'returned'${cw} GROUP BY o.channel`, from, to, ...ca),
    all(db, `SELECT channel, type, ROUND(SUM(amount), 2) AS amount, COUNT(*) AS n FROM invoices WHERE date >= ? AND date < ?${iw} GROUP BY channel, type`, from, to, ...ca),
    all(db, "SELECT k, v FROM settings WHERE k LIKE 'costs:%'"),
    channel ? null : expenseTotals(db, from, to),
  ]);
  const zero = () => ({ orders: 0, returns: 0, missingCost: 0, realShipping: 0, productShipping: 0, realCommission: 0, ...Object.fromEntries(KEYS.map((k) => [k, 0])) });
  const per = new Map(), total = zero();
  const chOf = (c) => per.get(c) || per.set(c, zero()).get(c);
  for (const a of agg) {
    const t = chOf(a.channel);
    for (const x of [t, total]) {
      for (const k of KEYS) x[k] += a[k] || 0;
      x.orders += a.orders; x.missingCost += a.missingCost; x.realShipping += a.realShipping; x.productShipping += a.productShipping || 0; x.realCommission += a.realCommission;
    }
  }
  const inv = (c, types) => invRows.filter((r) => r.channel === c && types.includes(r.type)).reduce((a, r) => a + r.amount, 0);
  for (const c of new Set(invRows.filter((r) => [...INV_ADS, ...INV_PENALTY].includes(r.type)).map((r) => r.channel))) chOf(c);
  for (const r of returned) chOf(r.channel);
  const costState = Object.fromEntries(costRows.map((r) => { try { return [r.k.slice(6), JSON.parse(r.v)]; } catch { return [r.k.slice(6), null]; } }));
  total.invoiceShipping = 0; total.invoiceFee = 0;
  const take = (x, k, d) => { for (const y of [x, total]) { y[k] += d; y.payout -= d; y.profit -= d; } };
  for (const [c, x] of per) {
    // Kargo: sipariş bazında tutar gelmeyen kanalda (siparişlerin yarısından azı) pazaryerinin dönemde kestiği kargo faturalarının toplamı
    x.shippingSrc = x.realShipping ? (x.realShipping === x.orders ? 'api' : 'mixed') : x.productShipping ? 'product' : x.shipping ? 'default' : 'none';
    const cargo = inv(c, ['Kargo']);
    if (cargo > 0 && x.realShipping < x.orders / 2) {
      take(x, 'shipping', cargo - x.shipping);
      x.shippingSrc = 'invoice'; x.invoiceShipping = cargo; total.invoiceShipping += cargo;
    }
    // Hizmet bedeli: Ayarlar'da girilmemişse (0) pazaryerinin kestiği hizmet bedeli faturaları
    const fee = inv(c, ['Hizmet bedeli']);
    if (fee > 0 && !x.fee) { take(x, 'fee', fee); x.feeSrc = 'invoice'; total.invoiceFee += fee; }
    // Reklam ve ceza / diğer kesintiler (faturalardan)
    take(x, 'ads', inv(c, INV_ADS));
    take(x, 'penalty', inv(c, INV_PENALTY));
    // İade: gönderim kargosu (kargo fatura toplamı kullanılan kanalda zaten içinde)
    const r = returned.find((y) => y.channel === c);
    if (r) {
      for (const y of [x, total]) y.returns += r.n;
      if (x.shippingSrc !== 'invoice') take(x, 'returnLoss', r.ship + r.est * costOf(settings, 'shipping', c));
    }
    const st = costState[c];
    if (st && st.error) x.shippingError = st.error;
  }
  const round = (x) => { for (const k of KEYS) x[k] = r2(x[k]); x.margin = x.revenue ? r2((x.profit / x.revenue) * 100) : 0; return x; };
  round(total);
  total.expenses = expenses ? expenses.total : 0;
  total.net = r2(total.profit - total.expenses);
  total.netMargin = total.revenue ? r2((total.net / total.revenue) * 100) : 0;
  const pc = [...per.values()];
  const shipNote = pc.some((x) => x.shippingSrc === 'invoice')
    ? [total.realShipping ? `${total.realShipping}/${total.orders} siparişte kargo faturasından` : '', `${pc.filter((x) => x.shippingSrc === 'invoice').length} kanalda dönemin kargo faturaları toplamı (${r2(total.invoiceShipping)} ₺)`].filter(Boolean).join(' · ')
    : [total.realShipping ? `${total.realShipping}/${total.orders} siparişte kargo faturasından` : '', total.productShipping ? `${total.productShipping} siparişte ürüne girilen kargo tutarından` : '',
      total.shipping && !total.realShipping && !total.productShipping ? 'Ayarlar → Giderler\'deki sipariş başı kargo tutarından' : ''].filter(Boolean).join(' · ')
      || 'kargo tutarı girilmedi — ürünlere kargo tutarı girin (Ürünler → Düzenle)';
  // Şelale: satıştan net kâra her basamak
  const steps = [
    { k: 'revenue', label: 'Satış (ciro)', v: total.revenue, note: total.returns ? `${total.returns} iade edilen sipariş ciroya dahil değil` : '' },
    { k: 'commission', label: 'Komisyon', v: -total.commission, note: `${total.realCommission}/${total.orders} siparişte kanalın bildirdiği tutar` },
    { k: 'shipping', label: 'Kargo', v: -total.shipping, note: shipNote },
    { k: 'fee', label: 'Hizmet bedeli', v: -total.fee, note: total.invoiceFee ? 'pazaryerinin kestiği hizmet bedeli faturalarından' : '' },
    { k: 'rateFee', label: 'Ek kesinti (işlem / ödeme)', v: -total.rateFee },
    { k: 'withholding', label: 'Stopaj', v: -total.withholding, note: 'gelir vergisinden mahsup edilir' },
    { k: 'ads', label: 'Reklam / pazarlama', v: -total.ads, note: 'pazaryerinin kestiği reklam faturaları' },
    { k: 'penalty', label: 'Ceza ve diğer kesintiler', v: -total.penalty, note: 'gecikme cezası, fiyat farkı vb. faturalar' },
    { k: 'returnLoss', label: 'İade kaybı', v: -total.returnLoss, note: total.returns ? `${total.returns} iadede geri gelmeyen gönderim kargosu` : 'dönemde iade yok' },
    { k: 'payout', label: 'Hakediş', v: total.payout, sum: true },
    { k: 'cost', label: 'Alış maliyeti', v: -total.cost, note: total.missingCost ? `${total.missingCost} satırda alış fiyatı yok` : '' },
    { k: 'profit', label: 'Brüt kâr', v: total.profit, sum: true },
    ...(channel ? [] : [
      { k: 'expenses', label: 'İşletme giderleri', v: -total.expenses, note: expenses.categories.length ? expenses.categories.slice(0, 4).map((x) => `${x.category} ${Math.round(x.amount)} ₺`).join(' · ') : 'kira, personel, paketleme … (aşağıdan ekleyin)' },
      { k: 'net', label: total.net >= 0 ? 'Net kâr' : 'Net zarar', v: total.net, sum: true },
    ]),
  ];
  return { from, to, total, steps, expenses: expenses ? expenses.categories : null, channels: [...per.entries()].map(([c, x]) => ({ channel: c, ...round(x) })).sort((a, b) => b.revenue - a.revenue) };
}

// Ürünlere göre kârlılık: dönemde satılan her ürünün cirosu, kesintileri (sipariş başı giderler satır cirosuna göre paylaştırılır),
// alış maliyeti, kârı ve iade adedi. Reklam / ceza / işletme giderleri ürüne dağıtılmaz.
export async function productProfit(db, settings, { from, to, channel, sort = 'profit' } = {}) {
  const now = Date.now();
  from = Number(from) || now - 30 * 864e5; to = Number(to) || now + 1;
  const cw = channel ? ' AND o.channel = ?' : '', ca = channel ? [channel] : [];
  const [orders, items, ret] = await Promise.all([
    all(db, `SELECT o.id, o.channel, o.shipping_cost, o.shipping_src FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}`, from, to, ...ca),
    all(db, `SELECT i.order_id, i.product_id, i.name, i.sku, i.total, i.quantity, i.returned_qty, i.status, i.commission, p.purchase_price, p.ship_cost, p.name AS pname, p.variant_name, p.image, l.commission AS listing_commission, l.commission_src AS listing_commission_src
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
      WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}`, from, to, ...ca),
    all(db, `SELECT COALESCE(i.product_id, 'x:' || COALESCE(i.sku, i.name)) AS k, SUM(CASE WHEN o.status = 'returned' THEN i.quantity ELSE MIN(i.quantity, COALESCE(i.returned_qty, 0)) END) AS n
      FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.ordered_at >= ? AND o.ordered_at < ? AND (o.status = 'returned' OR i.returned_qty > 0)${cw} GROUP BY k`, from, to, ...ca),
  ]);
  const byOrder = new Map();
  for (const i of items) (byOrder.get(i.order_id) || byOrder.set(i.order_id, []).get(i.order_id)).push(i);
  const out = new Map();
  for (const o of orders) {
    const its = byOrder.get(o.id) || [];
    const p = orderProfit({ ...o, items: its }, settings);
    const other = p.shipping + p.fee + p.rateFee + p.withholding;
    for (const i of its) {
      if (!liveLine(i)) continue;
      const kk = keptShare(i), tot = i.total * kk, qty = i.quantity * kk;
      const share = p.revenue ? tot / p.revenue : 0;
      const comm = (i.commission != null ? i.commission : (i.total * (rateGross(settings, i.listing_commission, i.listing_commission_src) ?? costOf(settings, 'commission', o.channel))) / 100) * kk;
      const k = i.product_id != null ? i.product_id : 'x:' + (i.sku || i.name);
      const x = out.get(k) || out.set(k, { key: String(k), product_id: i.product_id, name: i.pname || i.name || i.sku || '—', variant: i.variant_name || '', image: i.image || '', units: 0, orders: 0, revenue: 0, commission: 0, other: 0, cost: 0, missingCost: 0, channels: new Set() }).get(k);
      x.units += qty; x.orders++; x.revenue += tot; x.commission += comm; x.other += other * share; x.channels.add(o.channel);
      if (i.purchase_price) x.cost += i.purchase_price * qty; else x.missingCost += qty;
    }
  }
  const retBy = new Map(ret.map((r) => [String(r.k), r.n]));
  const rows = [...out.values()].map((x) => {
    const profit = x.revenue - x.commission - x.other - x.cost;
    const returns = retBy.get(x.key) || 0;
    return { ...x, channels: [...x.channels], revenue: r2(x.revenue), commission: r2(x.commission), other: r2(x.other), cost: r2(x.cost), profit: r2(profit),
      margin: x.revenue ? r2((profit / x.revenue) * 100) : 0, unitProfit: x.units ? r2(profit / x.units) : 0, returns, returnRate: x.units + returns ? r2((returns / (x.units + returns)) * 100) : 0 };
  });
  const S = { profit: (a, b) => b.profit - a.profit, loss: (a, b) => a.profit - b.profit, revenue: (a, b) => b.revenue - a.revenue, margin: (a, b) => b.margin - a.margin, returns: (a, b) => b.returns - a.returns || b.returnRate - a.returnRate };
  rows.sort(S[sort] || S.profit);
  return { from, to, rows: rows.slice(0, 300), total: rows.length, losing: rows.filter((x) => x.profit < 0 && !x.missingCost).length, noCost: rows.filter((x) => x.missingCost).length };
}

// ---------- kesilen faturalar ----------
// Kanalın finans servisinden (Trendyol cari ekstre, Hepsiburada muhasebe işlemleri) okunur ve panelde saklanır: 6 saatte bir,
// ilk seferde son 90 gün, sonra son 20 gün (geç düşen faturalar için). Aynı fatura tekrar yazılmaz, tutarı güncellenir.
export async function syncInvoices(env, db, { force = false, only } = {}) {
  const out = {};
  for (const ch of await getChannels(env, db)) {
    if (!ch.enabled || ch.demo || !ch.invoices || (only && !only.includes(ch.id))) continue;
    const key = 'invsync:' + ch.id, last = await getRaw(db, key);
    // Hata sonrası kademeli bekleme (30 dk, 1 sa, … en çok 6 sa): uzun okumada sürekli hata alan kanal her senkronda baştan denenmez
    if (!force && last && Date.now() - last.at < (last.error ? Math.min(last.fails || 1, 12) * 30 * 60e3 : 6 * 3600e3)) continue;
    const t = Date.now();
    try {
      // İlk başarılı okumaya kadar 90 gün, sonra son 20 gün (hata kaydı ilk okumayı "yapıldı" saydırmaz)
      const rows = await ch.invoices(last && last.n != null ? t - 20 * 864e5 : t - 90 * 864e5, t);
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
      // İlk okuma (90 gün) henüz başarılmadıysa kayıt "ilk okuma" olarak kalır (last yok → yine 90 gün); istek sınırı doluysa sayılmaz
      if (!e.budget) await setSetting(db, key, { ...(last || {}), at: t, error: e.message.slice(0, 300), fails: ((last && last.fails) || 0) + 1 }).catch(() => {});
      await log(db, ch.id, 'error', 'Faturalar alınamadı: ' + e.message);
    }
  }
  return out;
}

// ---------- hakediş ----------
// Pazaryerinin hesap ekstresi (satış / iade / indirim / komisyon kayıtları ve ödeme tarihleri) 6 saatte bir okunur ve saklanır.
// İlk okumada son 60 gün; sonra son 20 gün — ödenmemiş kayıt varsa en eskisinin tarihinden (en çok 90 gün geriye): ödeme
// kayda sonradan işlenir (Trendyol paymentOrderId, Hepsiburada WillBePaid → Paid), okunmazsa kayıt "ödenmedi / gecikti" kalırdı.
const STL_SQL = `INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (channel, remote_id) DO UPDATE SET date = excluded.date, type = excluded.type, raw_type = excluded.raw_type, order_number = excluded.order_number, amount = excluded.amount, commission = excluded.commission,
    payment_date = excluded.payment_date, due_date = excluded.due_date, paid = excluded.paid, payment_id = excluded.payment_id, synced_at = excluded.synced_at`;
const fin = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
const ms = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
export async function syncSettlements(env, db, { force = false, only } = {}) {
  const out = {};
  for (const ch of await getChannels(env, db)) {
    // Deneme modunda örnek kanallar da örnek hakediş kayıtları verir (sayfa boş kalmasın)
    if (!ch.enabled || !ch.settlements || (only && !only.includes(ch.id))) continue;
    const key = 'stlsync:' + ch.id, last = await getRaw(db, key);
    // Hata sonrası kademeli bekleme (30 dk, 1 sa, … en çok 6 sa): uzun okumada sürekli hata alan kanal her senkronda baştan denenmez
    if (!force && last && Date.now() - last.at < (last.error ? Math.min(last.fails || 1, 12) * 30 * 60e3 : 6 * 3600e3)) continue;
    const t = Date.now();
    try {
      let since = t - 60 * DAY;
      if (last && last.n != null) {
        const open = await first(db, 'SELECT MIN(date) AS d FROM settlements WHERE channel = ? AND paid = 0 AND date >= ?', ch.id, t - 90 * DAY);
        since = Math.min(t - 20 * DAY, ms(open && open.d) || Infinity);
      }
      const rows = (await ch.settlements(since, t)).filter((x) => x && x.remoteId != null && String(x.remoteId) !== '');
      for (const part of chunk(rows, 60)) {
        await db.batch(part.map((x) => {
          const date = ms(x.date), pay = ms(x.paymentDate);
          // Ödeme günü: vade → ödeme tarihi → kayıt tarihi (rapor vade dizininden okur; boş kalan kayıt hiçbir güne düşmezdi)
          return db.prepare(STL_SQL).bind(ch.id, String(x.remoteId), date, x.type || 'Diğer', x.rawType || '', String(x.orderNumber || '').trim(), fin(x.amount), fin(x.commission), pay, ms(x.dueDate) || pay || date, x.paid ? 1 : 0, String(x.paymentId || ''), t);
        }));
      }
      // Tanınmayan kayıt türleri kaybolmaz: "Diğer" olarak saklanır, günlüğe yazılır (bağdaştırıcıya eklenmesi için)
      const unk = new Map();
      for (const x of rows) if (x.unknown) unk.set(x.rawType || '?', (unk.get(x.rawType || '?') || 0) + 1);
      if (unk.size && !ch.demo) await log(db, ch.id, 'warn', 'Tanınmayan hakediş kayıt türü "Diğer" olarak eklendi: ' + [...unk].map(([k, n]) => `${k} (${n})`).join(', '));
      await setSetting(db, key, { at: t, n: rows.length });
      out[ch.id] = rows.length;
    } catch (e) {
      out[ch.id] = 'hata: ' + e.message;
      if (!e.budget) await setSetting(db, key, { ...(last || {}), at: t, error: e.message.slice(0, 300), fails: ((last && last.fails) || 0) + 1 }).catch(() => {});
      await log(db, ch.id, 'error', 'Hakediş kayıtları alınamadı: ' + e.message);
    }
  }
  return out;
}

// Siparişin hakedişine giren kayıt türleri: mutabakatta panelin tahminiyle (satış − komisyon) karşılaştırılır.
// Kargo / teslimat, hizmet bedeli, stopaj, reklam, ceza ayrı kesilir (tahminde de yok). Trendyol'un karşıladığı indirim / kupon
// ("Trendyol indirimi / kuponu") ay sonu faturayla satıcıya geri ödenir: siparişin kazancını düşürmez, mutabakata girmez.
export const STL_ORDER = /^(Satış|İade|İndirim|Kupon|Kampanya indirimi|Komisyon|Hakediş düzeltme|Manuel iade|Provizyon)/;
const STL_RETURN = /^(İade|Manuel iade)$/;
// Ödeme günü bu kadar geçtiyse "gecikti": Trendyol haftanın vadesi gelenleri çarşamba öder, kayıt ertesi gün güncellenir
export const STL_GRACE = 3 * DAY;

// Hakediş raporu: ödeme günlerine göre (ödenen / ödenecek), dönem toplamları ve mutabakat (pazaryerinin hakedişi ile panelin tahmini farklı olan siparişler)
export async function settlementReport(env, db, settings, q = {}) {
  const now = Date.now(), from = Number(q.from) || now - 30 * DAY, to = Number(q.to) || now + 1;
  const cw = q.channel ? ' AND channel = ?' : '', ca = q.channel ? [q.channel] : [];
  // Ödeme günü Türkiye saatiyle (UTC+3; yaz saati yok)
  const day = "strftime('%Y-%m-%d', due_date / 1000 + 10800, 'unixepoch')";
  const todayStart = Date.parse(new Date(now + 3 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z') - 3 * 3600e3, late = todayStart - STL_GRACE;
  const [days, tot, types, orders, unmatched] = await Promise.all([
    // Ödeme günleri: seçilen aralık + önümüzdeki 60 gün (ödenecekler)
    all(db, `SELECT channel, ${day} AS d, ROUND(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 2) AS paid, ROUND(SUM(CASE WHEN paid = 0 THEN amount ELSE 0 END), 2) AS due, COUNT(*) AS n
      FROM settlements WHERE due_date >= ? AND due_date < ?${cw} GROUP BY channel, d ORDER BY d DESC, channel LIMIT 400`, from, Math.max(to, now + 60 * DAY), ...ca),
    first(db, `SELECT ROUND(COALESCE(SUM(CASE WHEN paid = 1 AND due_date >= ? AND due_date < ? THEN amount END), 0), 2) AS paid,
        ROUND(COALESCE(SUM(CASE WHEN paid = 0 THEN amount END), 0), 2) AS upcoming, ROUND(COALESCE(SUM(CASE WHEN paid = 0 AND due_date < ? THEN amount END), 0), 2) AS overdue
      FROM settlements WHERE (paid = 0 OR (due_date >= ? AND due_date < ?))${cw}`, from, to, late, from, to, ...ca),
    // Kayıt türleri (kayıt tarihine göre dönemde); "Diğer" için kanalın gönderdiği ham tür adları
    all(db, `SELECT type, ROUND(SUM(amount), 2) AS amount, COUNT(*) AS n, GROUP_CONCAT(DISTINCT CASE WHEN type = 'Diğer' THEN raw_type END) AS raw
      FROM settlements WHERE date >= ? AND date < ?${cw} GROUP BY type ORDER BY ABS(SUM(amount)) DESC`, from, to, ...ca),
    // Mutabakat: dönemde verilen, pazaryerinde hakediş kaydı olan siparişler (iptal edilenler de: iptalde ödeme kaydı olmamalı)
    all(db, `SELECT o.id, o.channel, o.order_number, o.ordered_at, o.status FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ?${q.channel ? ' AND o.channel = ?' : ''}
      AND COALESCE(o.order_number, '') != '' AND EXISTS (SELECT 1 FROM settlements s WHERE s.channel = o.channel AND s.order_number = o.order_number) ORDER BY o.ordered_at DESC LIMIT 3000`, from, to, ...ca),
    // Panelde olmayan siparişlerin kayıtları (panel kurulmadan / geçmiş aktarılmadan önceki siparişler)
    all(db, `SELECT channel, order_number, ROUND(SUM(amount), 2) AS amount, MIN(date) AS date, COUNT(*) AS n FROM settlements s WHERE date >= ? AND date < ? AND order_number != ''${cw}
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.channel = s.channel AND o.order_number = s.order_number) GROUP BY channel, order_number ORDER BY date DESC LIMIT 1000`, from, to, ...ca),
  ]);
  const diffs = [];
  let checked = 0;
  if (orders.length) {
    const ids = orders.map((o) => o.id), items = [], rows = [];
    for (const part of chunk(ids, 80)) items.push(...await all(db, `SELECT i.order_id, i.total, i.quantity, i.returned_qty, i.status, i.commission, l.commission AS listing_commission, l.commission_src AS listing_commission_src
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key WHERE i.order_id IN (${part.map(() => '?').join(',')})`, ...part));
    const byCh = new Map();
    for (const o of orders) (byCh.get(o.channel) || byCh.set(o.channel, []).get(o.channel)).push(o.order_number);
    for (const [c, nos] of byCh) {
      for (const part of chunk([...new Set(nos)], 80)) rows.push(...(await all(db, `SELECT order_number, type, SUM(amount) AS amount, SUM(COALESCE(commission, 0)) AS commission, COUNT(*) AS n FROM settlements
        WHERE channel = ? AND order_number IN (${part.map(() => '?').join(',')}) GROUP BY order_number, type`, c, ...part)).map((r) => ({ ...r, channel: c })));
    }
    const by = new Map(), st = new Map();
    for (const i of items) (by.get(i.order_id) || by.set(i.order_id, []).get(i.order_id)).push(i);
    for (const r of rows) { const k = r.channel + '|' + r.order_number; (st.get(k) || st.set(k, []).get(k)).push(r); }
    // Tahmin: satış − komisyon (kargo, hizmet bedeli, ek kesinti, stopaj pazaryerinde ayrı kayıt; tahmine de katılmaz)
    const est = { ...settings, shipping: {}, service_fee: {}, fee_rate: {}, withholding: {} };
    for (const o of orders) {
      const recs = (st.get(o.channel + '|' + o.order_number) || []).filter((r) => STL_ORDER.test(r.type || ''));
      if (!recs.length) continue; // yalnız kargo / stopaj gibi ayrı kesintiler: karşılaştırılacak hakediş yok
      checked++;
      const its = by.get(o.id) || [];
      const p = orderProfit({ ...o, shipping_cost: 0, items: its }, est);
      const actual = r2(recs.reduce((a, r) => a + (Number(r.amount) || 0), 0)), comm = r2(recs.reduce((a, r) => a + (Number(r.commission) || 0), 0)), sales = r2(actual + comm);
      const expected = o.status === 'cancelled' ? 0 : p.payout, diff = r2(actual - expected);
      // Yuvarlama payı: 1 ₺ ya da satışın binde 5'i (satır satır yuvarlanan komisyon, kuruş farkları)
      const tol = Math.max(1, 0.005 * Math.max(Math.abs(p.revenue), Math.abs(sales)));
      if (Math.abs(diff) < tol) continue;
      const panelRet = o.status === 'returned' || its.some((i) => i.status === 'returned' || Number(i.returned_qty) > 0);
      const mpRet = recs.some((r) => STL_RETURN.test(r.type) && Math.abs(Number(r.amount) || 0) >= 0.01);
      const pct = (a, b) => (b ? `%${(Math.round((a / b) * 1000) / 10).toLocaleString('tr-TR')}` : '—');
      let reason;
      if (o.status === 'cancelled') reason = 'Sipariş iptal ama pazaryerinde ödeme kaydı var';
      else if (panelRet && !mpRet && diff > 0) reason = 'İade pazaryerinin kayıtlarına henüz düşmedi';
      else if (mpRet && !panelRet && diff < 0) reason = 'Pazaryeri iade kaydetti, panelde iade yok';
      else if (!comm && p.commission >= tol) reason = 'Komisyon kaydı pazaryerinde henüz yok';
      else {
        const dr = sales - p.revenue, dc = comm - p.commission;
        reason = Math.abs(dr) >= tol && Math.abs(dc) >= tol ? `Satış ve komisyon farklı (pazaryeri komisyonu ${pct(comm, sales)}, panel ${pct(p.commission, p.revenue)})`
          : Math.abs(dr) >= tol ? (dr < 0 ? 'Satış tutarı düşük: indirim, kupon ya da kısmi iade' : 'Satış tutarı panelden yüksek')
          : `Komisyon farklı: pazaryeri ${pct(comm, sales)}, panel ${pct(p.commission, p.revenue)}`;
      }
      diffs.push({ id: o.id, channel: o.channel, order_number: o.order_number, ordered_at: o.ordered_at, status: o.status, expected: r2(expected), actual, diff, reason, sales, commission: comm, estRevenue: p.revenue, estCommission: p.commission });
    }
  }
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const supported = (await getChannels(env, db)).filter((c) => c.enabled && c.settlements).map((c) => c.id);
  const um = unmatched.reduce((a, r) => a + (Number(r.amount) || 0), 0), period = types.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return {
    from, to, lateBefore: late, supported, days: days.slice(0, 120), types, diffs: diffs.slice(0, 100), unmatched: unmatched.slice(0, 50),
    totals: { ...tot, period: r2(period), checked, matched: checked - diffs.length, mismatched: diffs.length, limited: orders.length >= 3000, unmatched: unmatched.length, unmatchedAmount: r2(um) },
  };
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
