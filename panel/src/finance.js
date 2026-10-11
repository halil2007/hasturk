// Gelir & gider: sipariş kârı ve dönem bazında masraf basamakları
//   Satış − komisyon − kargo − hizmet bedeli − ek kesinti (işlem / ödeme bedeli) − stopaj = hakediş; hakediş − alış maliyeti = kâr.
// Komisyon ve kargo, kanal bildirdiyse gerçek tutardır (sipariş satırı komisyonu, kargo faturası); yoksa Ayarlar'daki oranlarla tahmin edilir.
import { all, allIn, first, run, getRaw, setSetting, log, notify, resolve } from './db.js';
import { getChannels } from './channels/index.js';
import { chunk, fail, PRODUCT_SHIP } from './util.js';
import { profit, costOf, rateGross, costVat, priceFor } from '../public/profit.js';
import { r2 } from './util.js';

// Satırın iade edilmeyen payı: kısmi iadede (3 adetten 1'i iade) ciro, komisyon ve maliyet kalan adede göre sayılır
export const keptShare = (i) => { const q = Number(i.quantity) || 0, r = Math.min(q, Math.max(0, Number(i.returned_qty) || 0)); return q > 0 ? (q - r) / q : 1; };
const liveLine = (i) => i.status !== 'cancelled' && i.status !== 'returned' && keptShare(i) > 0;
export function orderProfit(o, settings) {
  const ch = o.channel;
  let revenue = 0, commission = 0, cost = 0, missing = 0, realCommission = true, sellerDiscount = 0;
  for (const i of o.items) {
    if (!liveLine(i)) continue;
    const rate = rateGross(settings, i.listing_commission, i.listing_commission_src) ?? costOf(settings, 'commission', ch), k = keptShare(i);
    revenue += i.total * k;
    // Satıcının karşıladığı sepet / kupon indirimi (Trendyol lineSellerDiscount): satır tutarından zaten düşülmüş, yalnız gösterilir
    sellerDiscount += (Number(i.seller_discount) || 0) * k;
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
  // Pazaryerinin sonradan geri verdiği / düzelttiği komisyon (hakediş kayıtlarından; bkz. commissionCredits): satıcı lehine +
  const credit = live ? Number(o.comm_credit) || 0 : 0;
  const net = revenue - commission - shipping - fee - x.rateFee - x.withholding + credit;
  const shippingSrc = o.shipping_cost != null ? (o.shipping_src === 'api' ? 'api' : o.shipping_src === 'carrier' ? 'carrier' : 'manual') : prodShip > 0 ? 'product' : defShip > 0 ? 'default' : 'none';
  return {
    revenue: r2(revenue), sellerDiscount: r2(sellerDiscount), commission: r2(commission), commissionSrc: realCommission && o.items.length ? 'api' : 'estimate', commCredit: r2(credit), shipping: r2(shipping), shippingSrc,
    fee: r2(fee), rateFee: r2(x.rateFee), withholding: r2(x.withholding), payout: r2(net), cost: r2(cost), profit: r2(net - cost), missingCost: missing,
  };
}

// ---------- iade maliyeti ----------
// İade edilen (tamamı ya da bir kısmı) siparişin satıcıya gerçekte maliyeti. Ciro, komisyon ve alış maliyeti iade edilen adet için zaten
// sayılmaz (keptShare / iade edilen sipariş kâra girmez); burada yalnız geri gelmeyen giderler toplanır:
//   · Gönderim kargosu (yalnız tamamı iade edilen siparişte; kısmi iadede sipariş canlıdır, kargosu orderProfit'te sayılır):
//     kargo faturası / elle girilen → ürünün kargo tutarı → Ayarlar'daki sipariş başı kargo (orderProfit ile aynı sıra)
//   · İade kargosu: kanalın kargo faturasındaki iade gönderisi (return_ship_src 'api') → yoksa Ayarlar → Giderler "İade kargo bedeli"
//     (tahmini; boşsa sayılmaz). 'lumped': eski kayıt, iade kargosu gönderimle birlikte shipping_cost'ta (ayrıca eklenmez).
//   · Geri verilmeyen komisyon (yalnız tamamı iade edilen siparişte, gerçek veri): pazaryerinin hakediş kayıtlarında iade kaydı varken
//     komisyon toplamı sıfırlanmadıysa kalan (ret_comm). Trendyol / Hepsiburada iadede komisyonu geri verir; çoğunlukla 0'dır.
//   · Hizmet bedeli (tamamı iade edilen siparişte): Ayarlar'daki sipariş başı tutar; iadede geri verilmez. Canlı siparişte orderProfit sayar.
//   · Hasarlı / kusurlu iade (isteğe bağlı, Ayarlar): kabul edilen iade talebinin gerekçesi hasar / kusur diyorsa ürün satılamaz sayılır,
//     iade edilen adedin alış maliyeti kayıptır.
// invoiceShipping: kanalın kargosu dönemin kargo faturaları toplamından alınıyorsa (breakdown 'invoice') kargo kalemleri o toplamın
// içindedir; çift sayılmaması için 0 yazılır (inInvoice'ta ayrıca gösterilir). feeFromInvoice: hizmet bedeli faturalardan alınıyorsa aynı.
// Tahmini iade kargosu kaynakları: Ayarlar'daki iade kargo bedeli, ürünün kargo tutarı, Ayarlar'daki sipariş başı kargo
export const EST_RET = ['estimate', 'product', 'default'];
export const DAMAGED_RE = /hasar|kusur|defo|bozuk|kırık|arıza|ezik|akmış|defect|damag|broken/i;
const retQty = (i, full) => { const q = Number(i.quantity) || 0; return i.status === 'cancelled' ? 0 : full || i.status === 'returned' ? q : Math.min(q, Math.max(0, Number(i.returned_qty) || 0)); };
const itemKey = (i) => (i.product_id != null ? i.product_id : 'x:' + (i.sku || i.name));
const keyN = (v) => String(v || '').trim().toUpperCase();
export function returnCost(o, settings, { invoiceShipping = false, feeFromInvoice = false } = {}) {
  const ch = o.channel, its = (o.items || []).filter((i) => i.status !== 'cancelled');
  if (!its.length) return null;
  const full = o.status === 'returned' || !its.some(liveLine);
  const lines = its.map((i) => ({ i, units: retQty(i, full) })).filter((x) => x.units > 0);
  if (!lines.length) return null;
  // Gönderim kargosu (tam iade)
  let outbound = 0, outboundSrc = 'none';
  if (full) {
    const prodShip = Math.max(0, ...its.map((i) => Number(i.ship_cost) || 0)), defShip = costOf(settings, 'shipping', ch);
    outbound = o.shipping_cost ?? (prodShip > 0 ? prodShip : defShip);
    outboundSrc = o.shipping_cost != null ? (['api', 'carrier'].includes(o.shipping_src) ? 'invoice' : 'manual') : prodShip > 0 ? 'product' : defShip > 0 ? 'default' : 'none';
  }
  // İade kargosu: faturadaki iade kalemi → Ayarlar'daki iade kargo bedeli → (o da boşsa) iade edilen ürünün kargo tutarı (geri gelen koli
  // gönderiyle aynı tutarda sayılır) → Ayarlar'daki sipariş başı kargo tutarı. Son ikisi "tahmini (ürün kargo tutarından)".
  // 'lumped' eski kayıtta iade kargosu gönderim faturasında (shipping_cost) olabilir: tahmin eklenmez (çift sayılmasın).
  let returnShip = 0, returnShipSrc = 'none';
  if (o.return_ship_src === 'api' && o.return_ship_cost != null) { returnShip = Number(o.return_ship_cost) || 0; returnShipSrc = 'invoice'; }
  else if (o.return_ship_src === 'lumped') returnShipSrc = 'lumped';
  else {
    const set = costOf(settings, 'return_shipping', ch), prod = Math.max(0, ...lines.map((x) => Number(x.i.ship_cost) || 0)), def = costOf(settings, 'shipping', ch);
    [returnShip, returnShipSrc] = set > 0 ? [set, 'estimate'] : prod > 0 ? [prod, 'product'] : def > 0 ? [def, 'default'] : [0, 'none'];
  }
  const commission = full ? Math.max(0, Number(o.ret_comm) || 0) : 0;
  const fee = full && !feeFromInvoice ? costOf(settings, 'service_fee', ch) : 0;
  // Hasarlı iade: talep satırları barkod / stok koduyla siparişin satırına bağlanır (tek ürünlü siparişte doğrudan)
  const dmg = new Map();
  if (settings && settings.return_damaged_loss) {
    for (const l of o.damaged || []) {
      const keys = [l.barcode, l.sku].map(keyN).filter(Boolean);
      const hit = lines.find((x) => [x.i.barcode, x.i.sku, x.i.remote_key].map(keyN).some((k) => k && keys.includes(k))) || (lines.length === 1 ? lines[0] : null);
      if (hit) dmg.set(hit, Math.min(hit.units, (dmg.get(hit) || 0) + Math.max(1, Number(l.qty) || 1)));
    }
  }
  const inInvoice = invoiceShipping ? outbound + returnShip : 0;
  if (invoiceShipping) { outbound = 0; returnShip = 0; }
  // Sipariş başı kalemler iade edilen satırlara iade edilen tutar payına göre dağıtılır (tutar yoksa adede göre)
  const val = (x) => (Number(x.i.total) || 0) * (x.units / (Number(x.i.quantity) || 1));
  const sumV = lines.reduce((a, x) => a + val(x), 0), sumU = lines.reduce((a, x) => a + x.units, 0);
  const shared = outbound + returnShip + commission + fee;
  let damaged = 0;
  const out = lines.map((x) => {
    const share = sumV > 0 ? val(x) / sumV : x.units / sumU, d = (dmg.get(x) || 0) * (Number(x.i.purchase_price) || 0);
    damaged += d;
    return { key: itemKey(x.i), product_id: x.i.product_id ?? null, name: x.i.pname || x.i.name || x.i.sku || '—', variant: x.i.variant_name || '', image: x.i.image || '', units: x.units, value: r2(val(x)), cost: r2(shared * share + d), damaged: r2(d) };
  });
  return {
    id: o.id, channel: ch, full, units: sumU, outbound: r2(outbound), outboundSrc, returnShip: r2(returnShip), returnShipSrc, commission: r2(commission), fee: r2(fee), damaged: r2(damaged),
    inInvoice: r2(inInvoice), total: r2(shared + damaged), estimated: EST_RET.includes(returnShipSrc) || ['product', 'default'].includes(outboundSrc) || fee > 0, lines: out,
  };
}
// Dönemin (sipariş tarihine göre) iade edilen siparişleri ve iade maliyetleri; productId: yalnız o ürünün geçtiği siparişler
export async function returnCosts(db, settings, { from, to, channel, productId } = {}) {
  const args = [from, to];
  let w = '';
  if (channel) { w += ' AND o.channel = ?'; args.push(channel); }
  if (productId != null) { w += ' AND EXISTS (SELECT 1 FROM order_items i2 WHERE i2.order_id = o.id AND i2.product_id = ?)'; args.push(productId); }
  const orders = await all(db, `SELECT o.id, o.channel, o.order_number, o.status, o.shipping_cost, o.shipping_src, o.return_ship_cost, o.return_ship_src FROM orders o
    WHERE o.ordered_at >= ? AND o.ordered_at < ? AND o.status != 'cancelled'
      AND (o.status = 'returned' OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND (i.returned_qty > 0 OR i.status = 'returned')))${w}`, ...args);
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const [items, claims] = await Promise.all([
    allIn(db, ids, (ph, part) => [`SELECT i.order_id, i.product_id, i.name, i.sku, i.barcode, i.remote_key, i.total, i.quantity, i.returned_qty, i.status, p.purchase_price, p.ship_cost, p.name AS pname, p.variant_name, p.image
      FROM order_items i LEFT JOIN products p ON p.id = i.product_id WHERE i.order_id IN (${ph})`, part]),
    settings && settings.return_damaged_loss ? allIn(db, ids, (ph, part) => [`SELECT order_id, status, reason, lines FROM claims WHERE order_id IN (${ph}) AND (status = 'accepted' OR lines LIKE '%"accepted"%')`, part]) : [],
  ]);
  const by = new Map(), dmg = new Map();
  for (const i of items) (by.get(i.order_id) || by.set(i.order_id, []).get(i.order_id)).push(i);
  for (const c of claims) {
    let ls; try { ls = JSON.parse(c.lines || '[]'); } catch { ls = []; }
    for (const l of ls) if ((l.status === 'accepted' || (!l.status && c.status === 'accepted')) && DAMAGED_RE.test(`${l.reason || ''} ${c.reason || ''}`)) (dmg.get(c.order_id) || dmg.set(c.order_id, []).get(c.order_id)).push(l);
  }
  // Geri verilmeyen komisyon: tamamı iade edilen siparişte pazaryerinin iade kaydı varken kalan komisyon (hakediş kayıtlarından)
  const comm = new Map(), fullNos = new Map();
  for (const o of orders) {
    const its = (by.get(o.id) || []).filter((i) => i.status !== 'cancelled');
    if (o.order_number && (o.status === 'returned' || (its.length && !its.some(liveLine)))) (fullNos.get(o.channel) || fullNos.set(o.channel, []).get(o.channel)).push(o.order_number);
  }
  for (const [c, nos] of fullNos) {
    const recs = await allIn(db, [...new Set(nos)], (ph, part) => [`SELECT order_number, type, SUM(COALESCE(commission, 0)) AS c FROM settlements WHERE channel = ? AND order_number IN (${ph}) GROUP BY order_number, type`, [c, ...part]]).catch(() => []);
    const agg = new Map();
    for (const r of recs) {
      if (!STL_ORDER.test(r.type || '')) continue;
      const a = agg.get(r.order_number) || agg.set(r.order_number, { c: 0, ret: false }).get(r.order_number);
      a.c += Number(r.c) || 0; if (STL_RETURN.test(r.type)) a.ret = true;
    }
    for (const [no, a] of agg) if (a.ret && a.c >= 0.01) comm.set(c + '|' + no, r2(a.c));
  }
  return orders.map((o) => returnCost({ ...o, items: by.get(o.id) || [], ret_comm: comm.get(o.channel + '|' + o.order_number) || 0, damaged: dmg.get(o.id) || [] }, settings)).filter(Boolean);
}

const LIVE = "o.status NOT IN ('cancelled', 'returned')";
const KEYS = ['revenue', 'sellerDiscount', 'commission', 'commCredit', 'shipping', 'fee', 'rateFee', 'withholding', 'ads', 'penalty', 'returnLoss', 'payout', 'cost', 'returnDamaged', 'profit'];
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
  return all(db, `SELECT channel, COUNT(*) AS orders, COALESCE(SUM(rev), 0) AS revenue, COALESCE(SUM(sdisc), 0) AS sellerDiscount, COALESCE(SUM(comm), 0) AS commission,
      SUM(CASE WHEN n > 0 AND estc = 0 THEN 1 ELSE 0 END) AS realCommission, COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(miss), 0) AS missingCost,
      SUM(CASE WHEN live > 0 THEN COALESCE(sc, pship, ${rate('shipping', 'channel')}) ELSE 0 END) AS shipping,
      SUM(CASE WHEN live > 0 AND sc IS NULL AND pship IS NOT NULL THEN 1 ELSE 0 END) AS productShipping,
      SUM(CASE WHEN sc IS NOT NULL AND ss IN ('api', 'carrier') THEN 1 ELSE 0 END) AS realShipping,
      SUM(CASE WHEN live > 0 THEN ${rate('service_fee', 'channel')} ELSE 0 END) AS fee,
      SUM(rev * ${rate('fee_rate', 'channel')} / 100.0) AS rateFee,
      SUM(rev * 100.0 / 120.0 * ${rate('withholding', 'channel')} / 100.0) AS withholding
    FROM (SELECT o.channel, o.shipping_cost AS sc, o.shipping_src AS ss,
        SUM(CASE WHEN ${LIVEI} THEN i.total * ${K} ELSE 0 END) AS rev,
        SUM(CASE WHEN ${LIVEI} THEN COALESCE(i.seller_discount, 0) * ${K} ELSE 0 END) AS sdisc,
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
  const [agg, returned, invRows, costRows, expenses, credits] = await Promise.all([
    aggregate(db, settings, { from, to, channel }),
    // İade edilen (tamamı / bir kısmı) siparişlerin iade maliyeti (bkz. returnCost)
    returnCosts(db, settings, { from, to, channel }),
    all(db, `SELECT channel, type, ROUND(SUM(amount), 2) AS amount, COUNT(*) AS n FROM invoices WHERE date >= ? AND date < ?${iw} GROUP BY channel, type`, from, to, ...ca),
    all(db, "SELECT k, v FROM settings WHERE k LIKE 'costs:%'"),
    channel ? null : expenseTotals(db, from, to),
    // Pazaryerinin sonradan geri verdiği komisyon (hakediş kayıtlarından, sipariş tarihine göre)
    commissionCredits(db, settings, { from, to, channel }).catch(() => new Map()),
  ]);
  const zero = () => ({ orders: 0, returns: 0, missingCost: 0, realShipping: 0, productShipping: 0, realCommission: 0, creditOrders: 0, ...Object.fromEntries(KEYS.map((k) => [k, 0])) });
  const per = new Map(), total = zero();
  const chOf = (c) => per.get(c) || per.set(c, zero()).get(c);
  for (const a of agg) {
    const t = chOf(a.channel);
    for (const x of [t, total]) {
      for (const k of KEYS) x[k] += a[k] || 0;
      x.orders += a.orders; x.missingCost += a.missingCost; x.realShipping += a.realShipping; x.productShipping += a.productShipping || 0; x.realCommission += a.realCommission;
    }
  }
  // Komisyon iadesi / düzeltmesi: hakedişe ve kâra eklenir (satır komisyonu ayrıca düşülmüştü; zaten yansımış kısım sayılmaz)
  for (const r of credits.values()) {
    if (!r.counted || !per.has(r.channel)) continue;
    for (const y of [per.get(r.channel), total]) { y.commCredit += r.counted; y.payout += r.counted; y.profit += r.counted; y.creditOrders++; }
  }
  const inv = (c, types) => invRows.filter((r) => r.channel === c && types.includes(r.type)).reduce((a, r) => a + r.amount, 0);
  for (const c of new Set(invRows.filter((r) => [...INV_ADS, ...INV_PENALTY].includes(r.type)).map((r) => r.channel))) chOf(c);
  // Kanal başına iade özeti (kargo kalemleri ayrı tutulur: kargo faturası toplamı kullanılan kanalda onların içinde)
  const RZ = () => ({ orders: 0, full: 0, partial: 0, units: 0, outbound: 0, returnShip: 0, returnShipEst: 0, estOrders: 0, returnShipProd: 0, commission: 0, fee: 0, damaged: 0, inInvoice: 0, lumped: 0 });
  const retBy = new Map();
  for (const r of returned) {
    chOf(r.channel);
    const a = retBy.get(r.channel) || retBy.set(r.channel, RZ()).get(r.channel);
    a.orders++; a[r.full ? 'full' : 'partial']++; a.units += r.units; a.outbound += r.outbound; a.returnShip += r.returnShip; a.commission += r.commission; a.fee += r.fee; a.damaged += r.damaged;
    if (EST_RET.includes(r.returnShipSrc)) { a.returnShipEst += r.returnShip; a.estOrders++; }
    if (r.returnShipSrc === 'product' || r.returnShipSrc === 'default') a.returnShipProd += r.returnShip;
    if (r.returnShipSrc === 'lumped') a.lumped++;
  }
  total.returnInfo = RZ();
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
    // İade maliyeti: geri gelmeyen gönderim kargosu, iade kargosu, geri verilmeyen komisyon ve hizmet bedeli (hakedişten düşer);
    // hasarlı / satılamaz iadenin alış maliyeti ayrıca (kâr basamağında). Kargo faturası toplamı kullanılan kanalda kargo kalemleri o
    // toplamın içindedir, hizmet bedeli faturalardan alınıyorsa o da: ikinci kez düşülmez.
    const r = retBy.get(c);
    if (r) {
      if (x.shippingSrc === 'invoice') { r.inInvoice = r.outbound + r.returnShip; r.outbound = 0; r.returnShip = 0; r.returnShipEst = 0; r.estOrders = 0; r.returnShipProd = 0; }
      if (x.feeSrc === 'invoice') r.fee = 0;
      for (const y of [x, total]) y.returns += r.orders;
      for (const [k, v] of Object.entries(r)) total.returnInfo[k] += v;
      x.returnInfo = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r2(v)]));
      take(x, 'returnLoss', r.outbound + r.returnShip + r.commission + r.fee);
      for (const y of [x, total]) { y.returnDamaged += r.damaged; y.profit -= r.damaged; }
    }
    const st = costState[c];
    if (st && st.error) x.shippingError = st.error;
  }
  const round = (x) => { for (const k of KEYS) x[k] = r2(x[k]); x.margin = x.revenue ? r2((x.profit / x.revenue) * 100) : 0; return x; };
  round(total);
  for (const k of Object.keys(total.returnInfo)) total.returnInfo[k] = r2(total.returnInfo[k]);
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
    { k: 'revenue', label: 'Satış (ciro)', v: total.revenue, note: total.returns ? `${total.returns} iade edilen siparişin iade edilen tutarı ciroya dahil değil` : '' },
    // Bilgi: satıcının karşıladığı sepet / kupon indirimi (Trendyol sipariş satırından). Satış zaten indirim düşülmüş tutardır; toplamlara girmez.
    ...(total.sellerDiscount ? [{ k: 'sellerDiscount', label: 'Sepet / kupon indirimi (sizin karşıladığınız)', v: -total.sellerDiscount, info: true, note: 'pazaryerinin sipariş satırındaki satıcı indirimi; satış tutarından zaten düşüldü, ayrıca düşülmez' }] : []),
    { k: 'commission', label: 'Komisyon', v: -total.commission, note: `${total.realCommission}/${total.orders} siparişte kanalın bildirdiği tutar` },
    ...(total.commCredit ? [{ k: 'commCredit', label: 'Komisyon iadesi / indirimi (pazaryeri karşıladı)', v: total.commCredit, note: `${total.creditOrders} siparişte pazaryerinin hakediş kaydından (komisyon düzeltmesi)` }] : []),
    { k: 'shipping', label: 'Kargo', v: -total.shipping, note: shipNote },
    { k: 'fee', label: 'Hizmet bedeli', v: -total.fee, note: total.invoiceFee ? 'pazaryerinin kestiği hizmet bedeli faturalarından' : '' },
    { k: 'rateFee', label: 'Ek kesinti (işlem / ödeme)', v: -total.rateFee },
    { k: 'withholding', label: 'Stopaj', v: -total.withholding, note: 'gelir vergisinden mahsup edilir' },
    { k: 'ads', label: 'Reklam / pazarlama', v: -total.ads, note: 'pazaryerinin kestiği reklam faturaları' },
    { k: 'penalty', label: 'Ceza ve diğer kesintiler', v: -total.penalty, note: 'gecikme cezası, fiyat farkı vb. faturalar' },
    { k: 'returnLoss', label: 'İade maliyeti', v: -total.returnLoss, note: returnNote(total.returnInfo) },
    { k: 'payout', label: 'Hakediş', v: total.payout, sum: true },
    { k: 'cost', label: 'Alış maliyeti', v: -total.cost, note: total.missingCost ? `${total.missingCost} satırda alış fiyatı yok` : '' },
    ...(total.returnDamaged ? [{ k: 'returnDamaged', label: 'Hasarlı iade (satılamaz ürün)', v: -total.returnDamaged, note: 'hasar / kusur gerekçeli kabul edilen iadelerde ürünün alış maliyeti' }] : []),
    { k: 'profit', label: 'Brüt kâr', v: total.profit, sum: true },
    ...(channel ? [] : [
      { k: 'expenses', label: 'İşletme giderleri', v: -total.expenses, note: expenses.categories.length ? expenses.categories.slice(0, 4).map((x) => `${x.category} ${Math.round(x.amount)} ₺`).join(' · ') : 'kira, personel, paketleme … (aşağıdan ekleyin)' },
      { k: 'net', label: total.net >= 0 ? 'Net kâr' : 'Net zarar', v: total.net, sum: true },
    ]),
  ];
  return { from, to, total, steps, expenses: expenses ? expenses.categories : null, channels: [...per.entries()].map(([c, x]) => ({ channel: c, ...round(x) })).sort((a, b) => b.revenue - a.revenue) };
}

// Şelaledeki "İade maliyeti" basamağının açıklaması: hangi kalem ne kadar, hangisi gerçek / tahmini
const tl = (v) => `${Math.round(v).toLocaleString('tr-TR')} ₺`;
export function returnNote(ri) {
  if (!ri || !ri.orders) return 'dönemde iade yok';
  const parts = [`${ri.orders} iade (${ri.full} tamamı, ${ri.partial} kısmi; ${Math.round(ri.units)} adet)`];
  if (ri.outbound) parts.push(`geri gelmeyen gönderim kargosu ${tl(ri.outbound)}`);
  if (ri.returnShip) parts.push(`iade kargosu ${tl(ri.returnShip)}${ri.returnShipEst ? ` (${tl(ri.returnShipEst)} tahmini, ${ri.estOrders} iade${ri.returnShipProd ? `; ${tl(ri.returnShipProd)} tahmini (ürün kargo tutarından)` : ''})` : ''}`);
  if (ri.commission) parts.push(`geri verilmeyen komisyon ${tl(ri.commission)}`);
  if (ri.fee) parts.push(`hizmet bedeli ${tl(ri.fee)}`);
  if (ri.inInvoice) parts.push(`kargo kalemleri (${tl(ri.inInvoice)}) Kargo basamağındaki fatura toplamında`);
  if (ri.lumped) parts.push(`${ri.lumped} iadede iade kargosu gönderim kargosu faturasıyla birlikte`);
  if (!ri.returnShip && !ri.inInvoice && !ri.lumped) parts.push('iade kargosu bilinmiyor: Ayarlar → Giderler → İade kargo bedeli');
  return parts.join(' · ');
}

// Ürünlere göre kârlılık: dönemde satılan her ürünün cirosu, kesintileri (sipariş başı giderler satır cirosuna göre paylaştırılır),
// alış maliyeti, iade maliyeti ve kârı. Kâr = iade dahil (gerçek) kâr; profitExRet = iade maliyeti düşülmeden önceki kâr.
// Yalnız iadesi olan (dönemde kalan satışı olmayan) ürün de listelenir: iade maliyeti kadar zarardır.
// Reklam / ceza / işletme giderleri ürüne dağıtılmaz. productId: tek ürün (ürün kartı); byChannel: kanal başına özet ve başa baş fiyat.
export async function productProfit(db, settings, { from, to, channel, sort = 'profit', productId = null, byChannel = false, limit = 300 } = {}) {
  const now = Date.now();
  from = Number(from) || now - 30 * 864e5; to = Number(to) || now + 1;
  const cw = channel ? ' AND o.channel = ?' : '', ca = channel ? [channel] : [];
  const pw = productId != null ? ' AND EXISTS (SELECT 1 FROM order_items i2 WHERE i2.order_id = o.id AND i2.product_id = ?)' : '', pa = productId != null ? [productId] : [];
  const [orders, items, rets] = await Promise.all([
    all(db, `SELECT o.id, o.channel, o.shipping_cost, o.shipping_src FROM orders o WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}${pw}`, from, to, ...ca, ...pa),
    all(db, `SELECT i.order_id, i.product_id, i.name, i.sku, i.total, i.quantity, i.returned_qty, i.status, i.commission, p.purchase_price, p.ship_cost, p.name AS pname, p.variant_name, p.image, l.commission AS listing_commission, l.commission_src AS listing_commission_src
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key
      WHERE o.ordered_at >= ? AND o.ordered_at < ? AND ${LIVE}${cw}${pw}`, from, to, ...ca, ...pa),
    returnCosts(db, settings, { from, to, channel, productId }),
  ]);
  const byOrder = new Map();
  for (const i of items) (byOrder.get(i.order_id) || byOrder.set(i.order_id, []).get(i.order_id)).push(i);
  const out = new Map();
  const CH0 = () => ({ units: 0, revenue: 0, commission: 0, fixed: 0, other: 0, cost: 0, returns: 0, returnCost: 0 });
  const rowOf = (k, i) => out.get(k) || out.set(k, { key: String(k), product_id: i.product_id ?? null, name: i.pname || i.name || i.sku || '—', variant: i.variant_name || i.variant || '', image: i.image || '', units: 0, orders: 0, revenue: 0, commission: 0, other: 0, cost: 0, missingCost: 0,
    returns: 0, returnCost: 0, returnDamaged: 0, returnOrders: 0, estReturn: 0, channels: new Set(), per: new Map() }).get(k);
  const chOf = (x, c) => x.per.get(c) || x.per.set(c, CH0()).get(c);
  for (const o of orders) {
    const its = byOrder.get(o.id) || [];
    const p = orderProfit({ ...o, items: its }, settings);
    const other = p.shipping + p.fee + p.rateFee + p.withholding;
    for (const i of its) {
      if (!liveLine(i)) continue;
      const kk = keptShare(i), tot = i.total * kk, qty = i.quantity * kk;
      const share = p.revenue ? tot / p.revenue : 0;
      const comm = (i.commission != null ? i.commission : (i.total * (rateGross(settings, i.listing_commission, i.listing_commission_src) ?? costOf(settings, 'commission', o.channel))) / 100) * kk;
      const x = rowOf(itemKey(i), i), c = chOf(x, o.channel);
      x.units += qty; x.orders++; x.revenue += tot; x.commission += comm; x.other += other * share; x.channels.add(o.channel);
      c.units += qty; c.revenue += tot; c.commission += comm; c.fixed += (p.shipping + p.fee) * share; c.other += other * share; c.cost += (Number(i.purchase_price) || 0) * qty;
      if (i.purchase_price) x.cost += i.purchase_price * qty; else x.missingCost += qty;
    }
  }
  // İade maliyeti: iade edilen satırın payı ürüne yazılır
  for (const r of rets) {
    for (const l of r.lines) {
      const x = rowOf(l.key, l), c = chOf(x, r.channel);
      x.returns += l.units; x.returnCost += l.cost; x.returnDamaged += l.damaged; x.returnOrders++; x.channels.add(r.channel);
      if (r.estimated) x.estReturn += l.cost;
      c.returns += l.units; c.returnCost += l.cost;
    }
  }
  const rows = [...out.values()].map((x) => {
    const profitExRet = x.revenue - x.commission - x.other - x.cost, profit = profitExRet - x.returnCost;
    const row = { ...x, per: undefined, channels: [...x.channels], revenue: r2(x.revenue), commission: r2(x.commission), other: r2(x.other), cost: r2(x.cost), units: r2(x.units),
      profitExRet: r2(profitExRet), profit: r2(profit), returnCost: r2(x.returnCost), returnDamaged: r2(x.returnDamaged), estReturn: r2(x.estReturn),
      perReturn: x.returns ? r2(x.returnCost / x.returns) : 0, margin: x.revenue ? r2((profit / x.revenue) * 100) : 0, unitProfit: x.units ? r2(profit / x.units) : 0,
      returnRate: x.units + x.returns ? r2((x.returns / (x.units + x.returns)) * 100) : 0, returnShare: profitExRet > 0 ? r2((x.returnCost / profitExRet) * 100) : null };
    delete row.per;
    if (byChannel) row.byChannel = [...x.per].map(([c, v]) => ({ channel: c, ...Object.fromEntries(Object.entries(v).map(([k, n]) => [k, r2(n)])), profit: r2(v.revenue - v.commission - v.other - v.cost - v.returnCost) })).sort((a, b) => b.revenue - a.revenue);
    return row;
  });
  const S = { profit: (a, b) => b.profit - a.profit, loss: (a, b) => a.profit - b.profit, revenue: (a, b) => b.revenue - a.revenue, margin: (a, b) => b.margin - a.margin,
    returns: (a, b) => b.returns - a.returns || b.returnRate - a.returnRate, retcost: (a, b) => b.returnCost - a.returnCost || b.returns - a.returns };
  rows.sort(S[sort] || S.profit);
  const losing = rows.filter(isLoss);
  return { from, to, rows: rows.slice(0, limit), total: rows.length, losing: losing.length, lossTotal: r2(losing.reduce((a, x) => a + x.profit, 0)), noCost: rows.filter((x) => x.missingCost).length,
    returnCost: r2(rows.reduce((a, x) => a + x.returnCost, 0)), returnEst: r2(rows.reduce((a, x) => a + x.estReturn, 0)) };
}

// ---------- zarar uyarıları ----------
// Zarar: iade dahil kâr −1 ₺'den düşük (kuruş farkı uyarı sayılmaz) ve alış fiyatı bilinen ürün (alışı eksik ürünün kârı yanlış çıkar).
// İade uyarısı: kârlı ama iade maliyeti iade öncesi kârın %30'undan fazlasını götürüyor.
export const LOSS_MIN = 1, RET_SHARE = 30;
export const isLoss = (x) => !x.missingCost && x.profit < -LOSS_MIN;
export function lossVerdict(x) {
  if (!x) return null;
  if (isLoss(x)) return { level: 'loss', loss: r2(-x.profit) };
  if (!x.missingCost && x.profit > 0 && x.returnCost > 0 && x.returnShare != null && x.returnShare > RET_SHARE) return { level: 'returns', share: Math.round(x.returnShare) };
  return null;
}
// Başa baş (kâr = 0) satış fiyatı, beklenen iade maliyeti dahil. Kanalın gözlenen değerleri kullanılır:
//   komisyon oranı = ilanın ANA oranı (bkz. commcheck.js refreshBaseRates: son 90 günün en yüksek satır oranı, resmî liste tabanı; elle
//   girilen oran). Pazaryerinin geçici komisyon indirimi (idefix / Hepsiburada sipariş başı indirim) başa baş fiyatı olduğundan ucuz
//   göstermesin diye gerçekleşen ortalama (kesilen komisyon / ciro) yalnız ilanın oranı bilinmiyorsa kullanılır, o da yoksa Ayarlar.
//   Gerçekleşen oran ayrıca döner (actualRate)
//   sabit gider / adet = (kargo + hizmet bedeli payı) / satılan adet
//   beklenen iade maliyeti / satılan adet = iade oranı / (1 − iade oranı) × iade başı maliyet. İade oranı ürünün (tüm kanallar; müşteri
//   ürünü kanaldan bağımsız iade eder, tek kanalın birkaç satışı yanıltmasın), iade başı maliyet kanalın (kargo kanala göre değişir; kanalda
//   iade yoksa ürünün ortalaması)
//   ek kesinti % ve stopaj (KDV hariç satış üzerinden) Ayarlar'dan.
// Fiyat = (alış + sabit + beklenen iade) / (1 − komisyon% − ek kesinti% − stopaj% / 1,2). Satışı olmayan kanalda Ayarlar'daki tutarlar.
export function breakEven(c, { purchase, settings, shipCost = 0, listingRate = null, retRatio = null, perReturn = null }) {
  const ch = c.channel, units = Number(c.units) || 0;
  const actualRate = units && c.revenue ? (c.commission / c.revenue) * 100 : null;
  const commissionRate = listingRate ?? actualRate ?? costOf(settings, 'commission', ch);
  const fixed = units ? c.fixed / units : (shipCost > 0 ? shipCost : costOf(settings, 'shipping', ch)) + costOf(settings, 'service_fee', ch);
  const ratio = retRatio ?? (units ? (Number(c.returns) || 0) / units : 0), per = c.returns ? c.returnCost / c.returns : perReturn || 0;
  const expRet = ratio * per;
  const price = priceFor({ purchase: Number(purchase) || 0, commissionRate, shipping: fixed, extra: expRet, feeRate: costOf(settings, 'fee_rate', ch), withholdingRate: costOf(settings, 'withholding', ch), vatRate: 20 }, 0);
  return { price: price == null ? null : r2(price), commissionRate: r2(commissionRate), actualRate: actualRate == null ? null : r2(actualRate), fixed: r2(fixed), expReturn: r2(expRet), avgPrice: units ? r2(c.revenue / units) : null };
}
// Ürün kartındaki uyarı: son 30 ve 90 günün kârı (iade dahil), zarar / iade uyarısı ve kanal başına başa baş fiyatı
export async function productLoss(db, settings, id) {
  const p = await first(db, 'SELECT id, name, purchase_price, sale_price, ship_cost FROM products WHERE id = ?', Number(id));
  if (!p) fail(404, 'Ürün bulunamadı');
  const now = Date.now();
  const [r30, r90, lst] = await Promise.all([
    productProfit(db, settings, { from: now - 30 * DAY, to: now + 1, productId: p.id, limit: 1e6 }),
    productProfit(db, settings, { from: now - 90 * DAY, to: now + 1, productId: p.id, byChannel: true, limit: 1e6 }),
    all(db, 'SELECT channel, price, commission, commission_src FROM listings WHERE product_id = ?', p.id),
  ]);
  const pick = (r) => { const x = r.rows.find((y) => y.product_id === p.id); return x ? { ...x, verdict: lossVerdict(x) } : null; };
  const d30 = pick(r30), d90 = pick(r90);
  const channels = (d90 ? d90.byChannel : []).map((c) => {
    const l = lst.find((y) => y.channel === c.channel);
    const be = breakEven(c, { purchase: p.purchase_price, settings, shipCost: p.ship_cost, listingRate: l ? rateGross(settings, l.commission, l.commission_src) : null,
      retRatio: d90 && d90.units ? d90.returns / d90.units : 0, perReturn: d90 ? d90.perReturn : 0 });
    return { ...c, ...be, listPrice: l ? l.price : null, returnRate: c.units + c.returns ? r2((c.returns / (c.units + c.returns)) * 100) : 0, perReturn: c.returns ? r2(c.returnCost / c.returns) : 0 };
  });
  if (d90) delete d90.byChannel;
  return { product: { id: p.id, name: p.name, purchase_price: p.purchase_price, sale_price: p.sale_price }, d30, d90, channels, thresholds: { lossMin: LOSS_MIN, retShare: RET_SHARE } };
}
// Zarar ettiren ürünler önbelleği (ürün listesindeki "zarar" rozeti ve süzgeci): son 30 gün, saatte bir yeniden hesaplanır
const LOSS_TTL = 3600e3;
export async function lossCache(db, settings, { force = false } = {}) {
  const c = await getRaw(db, 'loss_cache').catch(() => null);
  if (!force && c && Date.now() - c.at < LOSS_TTL) return c;
  const now = Date.now(), r = await productProfit(db, settings, { from: now - 30 * DAY, to: now + 1, sort: 'loss', limit: 1e6 });
  const items = r.rows.filter((x) => x.product_id != null && isLoss(x)).map((x) => [x.product_id, x.profit, x.returnCost]);
  const v = { at: now, days: 30, items, total: r2(items.reduce((a, x) => a + x[1], 0)), returnCost: r.returnCost };
  await setSetting(db, 'loss_cache', v).catch(() => {});
  return v;
}
// Ürün listesi satırlarına zarar bilgisi (önbellekten; ek sorgu yok)
export async function markLosses(db, settings, rows) {
  const c = await lossCache(db, settings);
  const m = new Map(c.items.map(([id, profit, ret]) => [id, { profit, returnCost: ret }]));
  for (const r of rows || []) { const x = m.get(r.id); if (x) r.loss30 = x; }
  return c;
}
// Genel bakış kartı: son 30 günde zarar ettiren ürünler ve bu ayın iade maliyeti
export async function lossSummary(db, settings) {
  const now = Date.now(), c = await lossCache(db, settings);
  const d = new Date(now + 3 * 3600e3); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0);
  const monthStart = d.getTime() - 3 * 3600e3;
  const rets = await returnCosts(db, settings, { from: monthStart, to: now + 1 });
  const ids = c.items.slice(0, 3).map((x) => x[0]);
  const names = ids.length ? await allIn(db, ids, (ph, part) => [`SELECT id, name, variant_name, image FROM products WHERE id IN (${ph})`, part]) : [];
  return {
    days: c.days, at: c.at, count: c.items.length, total: c.total,
    top: c.items.slice(0, 3).map(([id, profit, ret]) => { const p = names.find((y) => y.id === id) || {}; return { id, name: p.name || '—', variant: p.variant_name || '', image: p.image || '', profit, returnCost: ret }; }),
    month: { from: monthStart, orders: rets.length, units: rets.reduce((a, r) => a + r.units, 0), cost: r2(rets.reduce((a, r) => a + r.total, 0)), estimated: r2(rets.filter((r) => r.estimated).reduce((a, r) => a + r.total, 0)) },
  };
}
// Haftalık bildirim: yeni zarar ettiren ürün çıktıysa tek bildirim (aynı ürünler için tekrar yok; haftada en fazla bir kez)
export async function lossNotify(db, settings) {
  const last = await getRaw(db, 'loss_notify').catch(() => null), now = Date.now();
  if (last && now - last.at < 7 * DAY) return null;
  const c = await lossCache(db, settings, { force: true });
  const prev = new Set((last && last.ids) || []), fresh = c.items.filter(([id]) => !prev.has(id));
  await setSetting(db, 'loss_notify', { at: now, ids: c.items.map((x) => x[0]) });
  if (!c.items.length) { await resolve(db, 'loss:products'); return 0; }
  if (!fresh.length) return 0;
  const names = await allIn(db, fresh.slice(0, 5).map((x) => x[0]), (ph, part) => [`SELECT id, name FROM products WHERE id IN (${ph})`, part]);
  await notify(db, 'loss:products', { level: 'warn', title: `${c.items.length} ürün son 30 günde zarar ettirdi (toplam ${tl(-c.total)})`,
    msg: `Yeni: ${fresh.slice(0, 5).map(([id, pr]) => `${(names.find((y) => y.id === id) || {}).name || id} (${tl(-pr)})`).join(', ')}${fresh.length > 5 ? ` ve ${fresh.length - 5} ürün daha` : ''}. İade maliyeti dahil hesaplandı; fiyatı ve iade nedenlerini kontrol edin: Gelir & Gider → Ürünlere göre kârlılık → Zarar ettiren.` });
  return fresh.length;
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
// raw: kanalın kayıttaki ham alanları (JSON; Hepsiburada: durum, amount / netAmount / taxAmount, paket no …) — mutabakat ayrıntısında gösterilir
const STL_SQL = `INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (channel, remote_id) DO UPDATE SET date = excluded.date, type = excluded.type, raw_type = excluded.raw_type, order_number = excluded.order_number, amount = excluded.amount, commission = excluded.commission,
    payment_date = excluded.payment_date, due_date = excluded.due_date, paid = excluded.paid, payment_id = excluded.payment_id, synced_at = excluded.synced_at, raw = excluded.raw`;
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
        // Tutarı 0 olan kayıt (Trendyol komisyon düzeltmesi: hakedişe etkisi eşi olan kayıtta) ödeme beklemez: pencereyi 90 güne açık tutmasın
        const open = await first(db, 'SELECT MIN(date) AS d FROM settlements WHERE channel = ? AND paid = 0 AND date >= ? AND amount != 0', ch.id, t - 90 * DAY);
        since = Math.min(t - 20 * DAY, ms(open && open.d) || Infinity);
      }
      const rows = (await ch.settlements(since, t)).filter((x) => x && x.remoteId != null && String(x.remoteId) !== '');
      for (const part of chunk(rows, 60)) {
        await db.batch(part.map((x) => {
          const date = ms(x.date), pay = ms(x.paymentDate);
          // Ödeme günü: vade → ödeme tarihi → kayıt tarihi (rapor vade dizininden okur; boş kalan kayıt hiçbir güne düşmezdi)
          return db.prepare(STL_SQL).bind(ch.id, String(x.remoteId), date, x.type || 'Diğer', x.rawType || '', String(x.orderNumber || '').trim(), fin(x.amount), fin(x.commission), pay, ms(x.dueDate) || pay || date, x.paid ? 1 : 0, String(x.paymentId || ''), t, x.raw ? String(x.raw).slice(0, 2000) : null);
        }));
      }
      // Tanınmayan kayıt türleri kaybolmaz: "Diğer" olarak saklanır, günlüğe yazılır (bağdaştırıcıya eklenmesi için)
      const unk = new Map();
      for (const x of rows) if (x.unknown) unk.set(x.rawType || '?', (unk.get(x.rawType || '?') || 0) + 1);
      if (unk.size && !ch.demo) await log(db, ch.id, 'warn', 'Tanınmayan hakediş kayıt türü "Diğer" olarak eklendi: ' + [...unk].map(([k, n]) => `${k} (${n})`).join(', '));
      // Durum filtresi (Hepsiburada: Paid, WillBePaid) dışında kalıp sipariş numarasıyla bulunan kayıtlar: filtre bu kayıtları kaçırıyor demektir
      const oof = new Map();
      for (const x of rows) if (x.outOfFilter) { const k = `${x.rawType || '?'} / ${x.outOfFilter}`; oof.set(k, (oof.get(k) || 0) + 1); }
      if (oof.size && !ch.demo) await log(db, ch.id, 'warn', 'Hakediş: durum filtresi dışında kalan kayıtlar sipariş numarasıyla bulundu (tür / durum): ' + [...oof].map(([k, n]) => `${k} (${n})`).join(', '));
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

// ---------- komisyon iadesi / düzeltmesi (pazaryeri karşıladı) ----------
// Sipariş satırındaki komisyon satış anında kesilendir. Pazaryeri sonradan komisyonu geri verebilir ya da düzeltebilir (komisyon indirimi
// kampanyası, hatalı oran düzeltmesi): bunlar hakediş ekstresinde ayrı kayıttır ve sipariş satırında görünmez.
//   Trendyol: "Komisyon düzeltme (−/+)" (CommissionNegative / CommissionPositive ve iptalleri; komisyon alanı işaretli, iade = eksi komisyon)
//   Hepsiburada: "Komisyon" türünde, ham türü Commission olmayan kayıtlar (CommissionRefund, CommissionCorrection, CommissionInvoiceRefund)
// Asıl komisyon kaydı (Trendyol Satış kaydındaki komisyon, Hepsiburada Commission) zaten sipariş satırındadır: yalnız düzeltmeler sayılır.
export const STL_COMM_ADJ = "(s.type LIKE 'Komisyon düzeltme%' OR (s.type = 'Komisyon' AND COALESCE(s.raw_type, '') NOT IN ('', 'Commission')))";
// Çift sayım koruması: düzeltme (c, satıcı lehine +) panelin saydığı komisyona zaten yansımışsa sayılmaz. Örnek: kısmi iadede iade edilen
// adedin komisyonu panelde de düşülür; pazaryeri aynı tutarı "komisyon iadesi" olarak kaydederse ikinci kez eklenmez.
// base: pazaryerinin düzeltme dışı kayıtlarındaki komisyon (satış − iade …); panel: panelin saydığı komisyon. Pazaryerinin son komisyonu
// base − c'dir; panel bundan ne kadar yüksekse o kadarı (0 ile c arasında) eklenir. base bilinmiyorsa (kayıt henüz yok) c olduğu gibi.
export function countedCredit(c, base, panel) {
  if (!c) return 0;
  if (!(base > 0)) return r2(c);
  const d = panel - (base - c);
  return r2(c > 0 ? Math.min(c, Math.max(0, d)) : Math.max(c, Math.min(0, d)));
}
// Siparişlerin komisyon düzeltmeleri: Map(sipariş id → { channel, credit (ham), counted (kâra eklenen) }).
// Dönem (sipariş tarihine göre; iptal / iade edilen siparişler hariç: komisyonları zaten sayılmıyor) ya da sipariş kimlikleri.
export async function commissionCredits(db, settings, { from, to, channel, ids } = {}) {
  const base = `SELECT o.id, o.channel, ROUND(SUM(-COALESCE(s.commission, 0)), 2) AS c FROM orders o JOIN settlements s ON s.channel = o.channel AND s.order_number = o.order_number
    WHERE ${STL_COMM_ADJ} AND o.status NOT IN ('cancelled', 'returned') AND COALESCE(o.order_number, '') != ''`;
  const adj = ids
    ? await allIn(db, ids, (ph, part) => [`${base} AND o.id IN (${ph}) GROUP BY o.id`, part])
    : await all(db, `${base} AND o.ordered_at >= ? AND o.ordered_at < ?${channel ? ' AND o.channel = ?' : ''} GROUP BY o.id`, from, to, ...(channel ? [channel] : []));
  const out = new Map();
  const list = adj.filter((r) => Math.abs(Number(r.c) || 0) >= 0.01);
  if (!list.length) return out;
  const oid = list.map((r) => r.id);
  const [recs, items] = await Promise.all([
    allIn(db, oid, (ph, part) => [`SELECT o.id, s.type, s.commission FROM orders o JOIN settlements s ON s.channel = o.channel AND s.order_number = o.order_number
      WHERE o.id IN (${ph}) AND NOT ${STL_COMM_ADJ}`, part]),
    allIn(db, oid, (ph, part) => [`SELECT i.order_id, i.total, i.quantity, i.returned_qty, i.status, i.commission, l.commission AS listing_commission, l.commission_src AS listing_commission_src
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key WHERE i.order_id IN (${ph})`, part]),
  ]);
  const baseOf = new Map(), itemsOf = new Map();
  for (const r of recs) if (STL_ORDER.test(r.type || '')) baseOf.set(r.id, (baseOf.get(r.id) || 0) + (Number(r.commission) || 0));
  for (const i of items) (itemsOf.get(i.order_id) || itemsOf.set(i.order_id, []).get(i.order_id)).push(i);
  for (const r of list) {
    const panel = orderProfit({ channel: r.channel, items: itemsOf.get(r.id) || [] }, settings).commission;
    out.set(r.id, { channel: r.channel, credit: r2(r.c), counted: countedCredit(Number(r.c), r2(baseOf.get(r.id) || 0), panel) });
  }
  return out;
}

// Mutabakat: eksik kaydı (komisyon ya da satış kaydı gelmemiş) ve hiçbir kaydı henüz ödenmemiş sipariş bu süre boyunca fark sayılmaz,
// "bekleniyor" listesinde durur. Hepsiburada satışı (Payment) ve komisyonu (Commission) ayrı kayıtlarla işler; komisyon sonradan gelebilir.
export const STL_WAIT = 45 * DAY;
// Farkın tarafı: panel kaynaklı olabilir / pazaryeri eksik ödemiş / pazaryeri fazla ödemiş görünüyor
export const STL_SIDES = {
  panel: 'Panel kaynaklı olabilir (veri eşleşmedi / kayıt henüz gelmedi)',
  short: 'Pazaryeri eksik ödemiş görünüyor (tüm kayıtlar geldi, tutar düşük)',
  extra: 'Pazaryeri fazla ödemiş görünüyor (tüm kayıtlar geldi, tutar yüksek)',
};
export const STL_CODES = {
  wait_commission: 'Bekleniyor: komisyon kaydı henüz gelmedi', wait_sale: 'Bekleniyor: satış kaydı henüz gelmedi',
  cancelled_paid: 'İptal edilen siparişe ödeme kaydı', return_pending: 'İade kaydı pazaryerine henüz düşmedi', return_unknown: 'Pazaryerinde iade var, panelde yok',
  no_commission: 'Komisyon kaydı yok / eşleşmedi', no_sale: 'Satış kaydı yok / eşleşmedi', campaign: 'Pazaryerinin karşıladığı kampanya indirimi',
  commission_diff: 'Komisyon farklı', sale_low: 'Satış tutarı düşük', sale_high: 'Satış tutarı yüksek', mixed: 'Satış ve komisyon farklı',
};
// Fark ayrıntısı (tanı): siparişin tüm pazaryeri kayıtları (hakedişe girmeyenler de, ham alanlarıyla) ve panelin beklediği (satırlar, satış, komisyon)
async function stlDetails(db, list, itemsOf, ctx) {
  if (!list.length) return;
  const byCh = new Map(), recs = new Map();
  for (const x of list) (byCh.get(x.channel) || byCh.set(x.channel, new Set()).get(x.channel)).add(x.order_number);
  for (const [c, nos] of byCh) {
    for (const part of chunk([...nos], 80)) {
      for (const r of await all(db, `SELECT order_number, remote_id, date, type, raw_type, amount, commission, due_date, payment_date, paid, raw FROM settlements WHERE channel = ? AND order_number IN (${part.map(() => '?').join(',')}) ORDER BY date, remote_id`, c, ...part)) {
        let raw = null; try { raw = r.raw ? JSON.parse(r.raw) : null; } catch { raw = null; }
        const k = c + '|' + r.order_number;
        (recs.get(k) || recs.set(k, []).get(k)).push({ id: r.remote_id, type: r.type, rawType: r.raw_type || '', amount: r2(r.amount), commission: r2(r.commission || 0), date: r.date, due: r.due_date, paidAt: r.payment_date, paid: !!r.paid, counted: STL_ORDER.test(r.type || ''), raw });
      }
    }
  }
  for (const x of list) {
    const c = ctx.get(x.id) || {}, p = c.p || {};
    x.detail = {
      records: recs.get(x.channel + '|' + x.order_number) || [],
      lines: (itemsOf.get(x.id) || []).map((i) => ({ name: i.name || i.sku || '—', sku: i.sku || '', qty: Number(i.quantity) || 0, returned: Number(i.returned_qty) || 0, status: i.status || '', total: r2(i.total), commission: i.commission == null ? null : r2(i.commission), counted: !c.dead && liveLine(i) })),
      expect: { dead: !!c.dead, revenue: c.dead ? 0 : r2(p.revenue || 0), commission: c.dead ? 0 : r2(p.commission || 0), commissionSrc: p.commissionSrc || '', credit: c.cr ? r2(c.cr.counted) : 0, payout: r2(c.expected || 0) },
    };
  }
}

// Hakediş raporu: ödeme günlerine göre (ödenen / ödenecek), dönem toplamları ve mutabakat (pazaryerinin hakedişi ile panelin tahmini farklı olan siparişler)
export async function settlementReport(env, db, settings, q = {}) {
  const now = Date.now(), from = Number(q.from) || now - 30 * DAY, to = Number(q.to) || now + 1;
  const cw = q.channel ? ' AND channel = ?' : '', ca = q.channel ? [q.channel] : [];
  // Ödeme günü Türkiye saatiyle (UTC+3; yaz saati yok)
  const day = "strftime('%Y-%m-%d', due_date / 1000 + 10800, 'unixepoch')";
  const todayStart = Date.parse(new Date(now + 3 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z') - 3 * 3600e3, late = todayStart - STL_GRACE;
  const [days, tot, types, orders, unmatched, noOrder] = await Promise.all([
    // Ödeme günleri: seçilen aralıkta ödenenler + ödenmemiş tüm kayıtlar (dönemden önce gecikenler ve 60 günden sonraki vadeler de:
    // "Ödenecek / Geciken" kartlarıyla aynı kayıtlar; kart ile tablo toplamı tutsun)
    all(db, `SELECT channel, ${day} AS d, ROUND(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 2) AS paid, ROUND(SUM(CASE WHEN paid = 0 THEN amount ELSE 0 END), 2) AS due, COUNT(*) AS n, SUM(paid = 1) AS np, SUM(paid = 0) AS nd
      FROM settlements WHERE (paid = 0 OR (due_date >= ? AND due_date < ?))${cw} GROUP BY channel, d ORDER BY MAX(paid = 0) DESC, d DESC, channel LIMIT 400`, from, Math.max(to, now + 60 * DAY), ...ca),
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
    // Sipariş numarası olmayan satış / komisyon / iade kayıtları: hiçbir siparişle eşleşemez (mutabakatta görünmez)
    all(db, `SELECT channel, type, COUNT(*) AS n, ROUND(SUM(amount), 2) AS amount FROM settlements WHERE date >= ? AND date < ? AND COALESCE(order_number, '') = ''${cw}
      AND (type LIKE 'Satış%' OR type LIKE 'Komisyon%' OR type LIKE 'İade%' OR type LIKE 'Kampanya indirimi%') GROUP BY channel, type`, from, to, ...ca),
  ]);
  const diffs = [], pending = [];
  let checked = 0, creditN = 0, creditSum = 0;
  const its0 = new Map(), ctx = new Map();
  if (orders.length) {
    const ids = orders.map((o) => o.id), items = [], rows = [];
    for (const part of chunk(ids, 80)) items.push(...await all(db, `SELECT i.order_id, i.line_id, i.name, i.sku, i.total, i.quantity, i.returned_qty, i.status, i.commission, l.commission AS listing_commission, l.commission_src AS listing_commission_src
      FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN listings l ON l.channel = o.channel AND l.remote_id = i.remote_key WHERE i.order_id IN (${part.map(() => '?').join(',')})`, ...part));
    const byCh = new Map();
    for (const o of orders) (byCh.get(o.channel) || byCh.set(o.channel, []).get(o.channel)).push(o.order_number);
    for (const [c, nos] of byCh) {
      for (const part of chunk([...new Set(nos)], 80)) rows.push(...(await all(db, `SELECT order_number, type, SUM(amount) AS amount, SUM(COALESCE(commission, 0)) AS commission, COUNT(*) AS n, SUM(paid) AS np FROM settlements
        WHERE channel = ? AND order_number IN (${part.map(() => '?').join(',')}) GROUP BY order_number, type`, c, ...part)).map((r) => ({ ...r, channel: c })));
    }
    const by = its0, st = new Map();
    // Komisyon iadesi / düzeltmesi (pazaryeri karşıladı): panel hesabına eklenir; fark sayılmaz, ayrıca özetlenir
    const credits = await commissionCredits(db, settings, { ids }).catch(() => new Map());
    for (const i of items) (by.get(i.order_id) || by.set(i.order_id, []).get(i.order_id)).push(i);
    for (const r of rows) { const k = r.channel + '|' + r.order_number; (st.get(k) || st.set(k, []).get(k)).push(r); }
    // Tahmin: satış − komisyon (kargo, hizmet bedeli, ek kesinti, stopaj pazaryerinde ayrı kayıt; tahmine de katılmaz)
    const est = { ...settings, shipping: {}, service_fee: {}, fee_rate: {}, withholding: {} };
    const pct = (a, b) => (b ? `%${(Math.round((a / b) * 1000) / 10).toLocaleString('tr-TR')}` : '—');
    const tl = (v) => `${r2(v).toLocaleString('tr-TR')} ₺`;
    for (const o of orders) {
      const recs = (st.get(o.channel + '|' + o.order_number) || []).filter((r) => STL_ORDER.test(r.type || ''));
      if (!recs.length) continue; // yalnız kargo / stopaj gibi ayrı kesintiler: karşılaştırılacak hakediş yok
      const its = by.get(o.id) || [];
      const cr = credits.get(o.id), p = orderProfit({ ...o, shipping_cost: 0, comm_credit: cr ? cr.counted : 0, items: its }, est);
      const actual = r2(recs.reduce((a, r) => a + (Number(r.amount) || 0), 0)), comm = r2(recs.reduce((a, r) => a + (Number(r.commission) || 0), 0)), sales = r2(actual + comm);
      // İptal / tamamı iade edilen siparişin hakedişi 0 olmalı (satırları ayrıca işaretlenmemiş olsa da)
      const dead = o.status === 'cancelled' || o.status === 'returned', expected = dead ? 0 : p.payout, diff = r2(actual - expected);
      // Yuvarlama payı: 1 ₺ ya da satışın binde 5'i (satır satır yuvarlanan komisyon, kuruş farkları)
      const tol = Math.max(1, 0.005 * Math.max(dead ? 0 : Math.abs(p.revenue), Math.abs(sales)));
      ctx.set(o.id, { p, cr, expected, dead });
      if (Math.abs(diff) < tol) { checked++; if (cr && cr.counted && !dead) { creditN++; creditSum += cr.counted; } continue; }
      // Eksik kayıt: Hepsiburada satışı (Payment) ve komisyonu (Commission) ayrı kayıtlarla işler; komisyon kaydı satıştan sonra gelebilir.
      // Siparişin hiçbir kaydı henüz ödenmediyse ve sipariş STL_WAIT günden yeniyse fark sayılmaz: "bekleniyor" listesine girer.
      const paidAny = recs.some((r) => Number(r.np) > 0);
      const hasSale = recs.some((r) => /^Satış/.test(r.type) && Number(r.amount) > 0);
      const hasComm = recs.some((r) => r.type === 'Komisyon' || Math.abs(Number(r.commission) || 0) >= 0.01);
      const missing = dead ? '' : hasSale && !hasComm && p.commission >= tol ? 'comm' : !hasSale && hasComm ? 'sale' : '';
      const base = { id: o.id, channel: o.channel, order_number: o.order_number, ordered_at: o.ordered_at, status: o.status, expected: r2(expected), actual, diff, sales, commission: comm, estRevenue: dead ? 0 : p.revenue, estCommission: dead ? 0 : p.commission };
      if (missing && !paidAny && now - (Number(o.ordered_at) || now) < STL_WAIT) {
        pending.push({ ...base, code: missing === 'comm' ? 'wait_commission' : 'wait_sale', side: 'panel', waitUntil: (Number(o.ordered_at) || now) + STL_WAIT,
          reason: missing === 'comm' ? 'Komisyon kaydı henüz gelmedi: pazaryeri komisyonu satış kaydından sonra ayrı kayıtla işliyor; gelince otomatik eşleşir'
            : 'Satış (ödeme) kaydı henüz gelmedi; gelince otomatik eşleşir' });
        continue;
      }
      checked++;
      if (cr && cr.counted && !dead) { creditN++; creditSum += cr.counted; }
      const panelRet = o.status === 'returned' || its.some((i) => i.status === 'returned' || Number(i.returned_qty) > 0);
      const mpRet = recs.some((r) => STL_RETURN.test(r.type) && Math.abs(Number(r.amount) || 0) >= 0.01);
      const camp = r2(recs.filter((r) => /^Kampanya indirimi/.test(r.type)).reduce((a, r) => a + (Number(r.amount) || 0), 0));
      let reason, code, side = 'panel';
      const crNote = cr && cr.credit ? `Komisyon iadesi / indirimi (pazaryeri karşıladı) ${tl(cr.credit)} hesaba katıldı; kalan fark: ` : '';
      if (o.status === 'cancelled') { code = 'cancelled_paid'; reason = 'Sipariş iptal ama pazaryerinde ödeme kaydı var'; }
      else if (panelRet && !mpRet && diff > 0) { code = 'return_pending'; reason = 'İade pazaryerinin kayıtlarına henüz düşmedi'; }
      else if (mpRet && !panelRet && diff < 0) { code = 'return_unknown'; reason = 'Pazaryeri iade kaydetti, panelde iade yok'; }
      else if (missing === 'comm') {
        code = 'no_commission';
        reason = paidAny ? 'Satış ödendi ama siparişe bağlı komisyon kaydı yok (komisyon toplu / ayrı faturayla kesilmiş ya da kayıt sipariş numarasıyla eşleşmemiş olabilir)'
          : `Komisyon kaydı ${Math.round(STL_WAIT / DAY)} günde gelmedi (kayıt sipariş numarasıyla eşleşmemiş olabilir)`;
      } else if (missing === 'sale') { code = 'no_sale'; reason = 'Komisyon kaydı var ama satış (ödeme) kaydı yok (kayıt eşleşmemiş ya da okuma aralığı dışında kalmış olabilir)'; }
      else if (camp && Math.abs(diff - camp) < tol) { code = 'campaign'; side = 'extra'; reason = `Pazaryerinin karşıladığı kampanya indirimi (${tl(camp)}) ödendi; panelin satış tutarında yok`; }
      else {
        // Tüm kayıtlar geldi: fark tutardadır. Komisyon oranı aynıysa fark satış tutarındadır (indirim / kupon); satış aynıysa komisyondadır
        side = diff < 0 ? 'short' : 'extra';
        const dr = sales - p.revenue, sameRate = Math.abs((sales ? comm / sales : 0) - (p.revenue ? p.commission / p.revenue : 0)) < 0.003;
        if (Math.abs(dr) < tol) { code = 'commission_diff'; reason = `Komisyon farklı: pazaryeri ${pct(comm, sales)}, panel ${pct(p.commission, p.revenue)}`; }
        else if (sameRate) { code = dr < 0 ? 'sale_low' : 'sale_high'; reason = dr < 0 ? 'Satış tutarı düşük: indirim, kupon ya da kısmi iade' : 'Satış tutarı panelden yüksek'; }
        else { code = 'mixed'; reason = `Satış ve komisyon farklı (pazaryeri komisyonu ${pct(comm, sales)}, panel ${pct(p.commission, p.revenue)})`; }
      }
      diffs.push({ ...base, code, side, reason: crNote + reason, credit: cr ? cr.counted : 0 });
    }
  }
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  pending.sort((a, b) => b.ordered_at - a.ordered_at);
  // Fark özeti: kanal × taraf × neden (tüm farklar; listede yalnız en büyük 100'ü)
  const sumBy = new Map();
  for (const x of [...diffs, ...pending]) {
    const k = `${x.channel}|${x.code}`, s = sumBy.get(k) || sumBy.set(k, { channel: x.channel, side: x.side, code: x.code, label: STL_CODES[x.code] || x.code, pending: /^wait_/.test(x.code), n: 0, diff: 0 }).get(k);
    s.n++; s.diff = r2(s.diff + x.diff);
  }
  const shownD = diffs.slice(0, 100), shownP = pending.slice(0, 50);
  await stlDetails(db, [...shownD, ...shownP], its0, ctx).catch(() => {});
  const supported = (await getChannels(env, db)).filter((c) => c.enabled && c.settlements).map((c) => c.id);
  const um = unmatched.reduce((a, r) => a + (Number(r.amount) || 0), 0), period = types.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  return {
    from, to, lateBefore: late, supported, days, types, diffs: shownD, pending: shownP, unmatched: unmatched.slice(0, 50), sides: STL_SIDES,
    summary: [...sumBy.values()].sort((a, b) => (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : Math.abs(b.diff) - Math.abs(a.diff))),
    noOrder: noOrder.filter((r) => Math.abs(Number(r.amount) || 0) >= 0.01),
    totals: { ...tot, period: r2(period), checked, matched: checked - diffs.length, mismatched: diffs.length, pending: pending.length, limited: orders.length >= 3000, unmatched: unmatched.length, unmatchedAmount: r2(um),
      short: diffs.filter((x) => x.side === 'short').length, commissionCredit: { orders: creditN, amount: r2(creditSum) } },
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
