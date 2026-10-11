// Hepsiburada hakediş / mutabakat: kayıt türleri (Kayıt Bazlı Muhasebe Servisi TransactionTypes), amount (KDV dahil) ↔ netAmount,
// durum filtresi dışında kalan kayıtların sipariş numarasıyla bulunması, satış ve komisyonun ayrı kayıt olması (komisyon sonradan gelir:
// "bekleniyor"), farkın tarafı (panel kaynaklı / pazaryeri eksik / fazla ödemiş), pazaryerinin karşıladığı kampanya indirimi, fark ayrıntısı.
// Kayıt yapısı canlı yanıtla aynı (id, transactionType, status, orderNumber, packageNumber, amount/taxAmount/netAmount { value, currencyCode },
// isIncome, isInvoice, orderDate, dueDate, paymentDate …); değerler örnektir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hepsiburada } from '../src/channels/hepsiburada.js';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { syncSettlements, settlementReport, STL_WAIT } from '../src/finance.js';
import { resetChannels } from '../src/channels/index.js';
import { saveOrders } from '../src/sync.js';

const D = 864e5;
const HB_ENV = { HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' };
const M = (value) => ({ value, currencyCode: 'TRY' });
const tx = (id, transactionType, no, amount, extra = {}) => ({
  id, transactionType, status: 'WillBePaid', sku: 'HBV1', packageNumber: 'PK' + no, orderNumber: no, invoiceNumber: '', orderItemNumber: 'L' + no, quantity: 1,
  amount: M(amount), taxAmount: M(Math.round((amount - amount / 1.2) * 100) / 100), netAmount: M(Math.round((amount / 1.2) * 100) / 100),
  orderDate: '2026-10-09T10:00:00', invoiceDate: null, dueDate: '2026-11-02T00:00:00', paymentDate: null, invoiceExplanation: null, merchantId: HB_ENV.HB_MERCHANT_ID,
  isInvoice: false, isIncome: amount > 0, transactionTypeCategory: 'Sales', productName: 'Ürün', ...extra,
});
function mock(handler) {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify(handler(String(url)) || { items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  return calls;
}

test('Hepsiburada hakediş: tür eşlemesi (BNPL satış, kampanya geliri ve iadesi, yeni gider / gelir türleri), amount KDV dahil, ham alanlar saklanır', async () => {
  mock((u) => (/RecordDateStart/.test(u) && /Offset=0&/.test(u) ? { count: 9, items: [
    // Komisyon: amount 612 = netAmount 510 + taxAmount 102 (KDV dahil kesilen); işaret isIncome'dan
    tx('c1', 'Commission', '4093726680', 612, { isIncome: false, isInvoice: true, invoiceNumber: 'HBK1' }),
    tx('p1', 'Payment', '4093726680', 3000),
    tx('b1', 'BnplOrder', '5001', 1500),
    tx('br', 'BnplRefund', '5001', -1500, { isIncome: false }),
    tx('k1', 'CampaignDiscount', '5002', 75),
    tx('k2', 'CampaignDiscountRefund', '5002', 75, { isIncome: false }),
    tx('m1', 'MarketingSupportParticipation', '5003', 40, { isIncome: false }),
    tx('t1', 'CargoCompensationIncome', '5004', 250),
    tx('r1', 'ReturnDeliveryProcessingFee', '5005', 12, { isIncome: false }),
  ] } : { items: [] }));
  const rows = await hepsiburada(HB_ENV, { id: 'hepsiburada' }).settlements(Date.now() - 10 * D, Date.now());
  const by = Object.fromEntries(rows.map((x) => [x.remoteId, x]));
  assert.deepEqual([by.c1.type, by.c1.amount, by.c1.commission], ['Komisyon', -612, 612]);
  assert.deepEqual([by.p1.type, by.p1.amount, by.p1.commission], ['Satış', 3000, 0], 'netAmount (2.500) değil amount');
  assert.deepEqual([by.b1.type, by.b1.amount, by.br.type, by.br.amount], ['Satış', 1500, 'İade', -1500]);
  assert.deepEqual([by.k1.type, by.k1.amount, by.k2.type, by.k2.amount], ['Kampanya indirimi', 75, 'Kampanya indirimi iadesi', -75]);
  assert.deepEqual([by.m1.type, by.m1.amount], ['Reklam / pazarlama', -40]);
  assert.deepEqual([by.t1.type, by.t1.amount], ['Tazmin / müşteri memnuniyeti', 250]);
  assert.deepEqual([by.r1.type, by.r1.amount], ['Kargo', -12]);
  assert.ok(rows.every((x) => !x.unknown));
  const raw = JSON.parse(by.c1.raw);
  assert.deepEqual([raw.status, raw.amount, raw.netAmount, raw.taxAmount, raw.isIncome, raw.packageNumber, raw.invoiceNumber], ['WillBePaid', 612, 510, 102, false, 'PK4093726680', 'HBK1']);
  assert.match(raw.keys, /netAmount/);
  assert.ok(!('productName' in raw));
});

test('Hepsiburada hakediş: komisyon kaydı gelmeyen satış, sipariş numarasıyla durum filtresi olmadan okunur; filtre dışı kayıt saklanır ve günlüğe yazılır', async () => {
  const calls = mock((u) => {
    if (/RecordDateStart/.test(u)) return /Offset=0&/.test(u) ? { items: [tx('p1', 'Payment', '4093726680', 3000), tx('p2', 'Payment', '4880886977', 2099.9), tx('c2', 'Commission', '4880886977', 428.38, { isIncome: false })] } : { items: [] };
    if (/OrderNumber=4093726680/.test(u)) return { items: [tx('p1', 'Payment', '4093726680', 3000), tx('c1', 'Commission', '4093726680', 612, { isIncome: false, status: 'Open' }), tx('cx', 'Commission', '4093726680', 612, { isIncome: false, status: 'Cancelled' })] };
    return { items: [] };
  });
  const db = d1(); await init(db); resetChannels();
  const r = await syncSettlements({ DB: db, ...HB_ENV }, db, { force: true });
  assert.equal(r.hepsiburada, 4);
  const look = calls.filter((u) => /OrderNumber=/.test(u));
  assert.deepEqual(look.map((u) => /OrderNumber=(\d+)/.exec(u)[1]), ['4093726680'], 'komisyon kaydı olan sipariş yeniden okunmaz');
  const rows = (await db.prepare("SELECT remote_id, type, amount, commission, paid, raw FROM settlements WHERE order_number = '4093726680' ORDER BY remote_id").all()).results;
  assert.deepEqual(rows.map((x) => [x.remote_id, x.type, x.amount, x.paid]), [['c1', 'Komisyon', -612, 0], ['p1', 'Satış', 3000, 0]]);
  assert.equal(JSON.parse(rows[0].raw).status, 'Open');
  const lg = (await db.prepare("SELECT level, msg FROM logs WHERE channel = 'hepsiburada'").all()).results;
  assert.ok(lg.some((x) => x.level === 'warn' && /durum filtresi dışında/.test(x.msg) && /Commission \/ Open \(1\)/.test(x.msg)), JSON.stringify(lg));
  resetChannels();
});

// Mutabakat: canlı paneldeki örnek (#4093726680: satış 3.000 ₺, komisyon %17 + KDV = 612 ₺ → panel 2.388 ₺; pazaryerinde yalnız satış kaydı)
async function reconDb(orders, recs) {
  const db = d1(); await init(db); resetChannels();
  const now = Date.now();
  await saveOrders(db, 'hepsiburada', orders.map(([no, total, commission, extra = {}]) => ({ remoteId: no, orderNumber: no, orderedAt: now - (extra.age ?? 2) * D, status: extra.status || 'delivered', customer: 'A', total,
    items: [{ lineId: 'L' + no, sku: 'S', name: 'Kupa', quantity: 1, unitPrice: total, total, remoteKey: 'S', commission }] })));
  let i = 0;
  for (const [no, type, raw_type, amount, commission = 0, extra = {}] of recs) {
    await db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at, raw)
      VALUES ('hepsiburada', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, '', 0, ?)`).bind('r' + ++i, now - D, type, raw_type, no, amount, commission, now + 20 * D, extra.paid ? 1 : 0, JSON.stringify({ status: extra.paid ? 'Paid' : 'WillBePaid', amount: Math.abs(amount), netAmount: Math.abs(amount) / 1.2 })).run();
  }
  return { db, now };
}
const SET = { commission: { hepsiburada: 17 }, costs_vat_incl: true };

test('Mutabakat (Hepsiburada): komisyon kaydı henüz gelmeyen yeni sipariş fark değil "bekleniyor"; gelince eşleşir; süre geçince / ödenince panel kaynaklı fark', async () => {
  const { db, now } = await reconDb(
    [['4093726680', 3000, 612], ['4880886977', 2099.9, 428.38], ['OLD1', 1000, 204, { age: 50 }], ['PAID1', 1000, 204], ['NOORD', 500, 102]],
    [['4093726680', 'Satış', 'Payment', 3000],
      ['4880886977', 'Satış', 'Payment', 2099.9], ['4880886977', 'Komisyon', 'Commission', -428.38, 428.38],
      ['OLD1', 'Satış', 'Payment', 1000],
      ['PAID1', 'Satış', 'Payment', 1000, 0, { paid: true }],
      ['', 'Komisyon', 'Commission', -102, 102]],
  );
  const r = await settlementReport({ DB: db }, db, SET, { from: now - 90 * D, to: now + 1 });
  // Bekleyen: fark sayılmaz, kontrol edilene de girmez
  assert.equal(r.totals.pending, 1);
  assert.deepEqual([r.pending[0].order_number, r.pending[0].code, r.pending[0].expected, r.pending[0].actual], ['4093726680', 'wait_commission', 2388, 3000]);
  assert.match(r.pending[0].reason, /Komisyon kaydı henüz gelmedi/);
  assert.ok(r.pending[0].waitUntil > now + 40 * D);
  // Eşleşen: 2.099,90 − 428,38
  const by = Object.fromEntries(r.diffs.map((x) => [x.order_number, x]));
  assert.equal(by['4880886977'], undefined);
  // 45 günü geçen ya da ödenen satış, komisyonsuz: panel kaynaklı olabilir (eşleşmedi)
  assert.deepEqual([by.OLD1.code, by.OLD1.side, by.OLD1.diff], ['no_commission', 'panel', 204]);
  assert.match(by.OLD1.reason, /45 günde gelmedi/);
  assert.deepEqual([by.PAID1.code, by.PAID1.side], ['no_commission', 'panel']);
  assert.match(by.PAID1.reason, /Satış ödendi ama siparişe bağlı komisyon kaydı yok/);
  assert.equal(r.totals.checked, 3); assert.equal(r.totals.mismatched, 2); assert.equal(r.totals.short, 0);
  // Özet: kanal × neden (bekleyen ayrı işaretli)
  const s = Object.fromEntries(r.summary.map((x) => [x.code, x]));
  assert.deepEqual([s.no_commission.n, s.no_commission.diff, s.no_commission.side], [2, 408, 'panel']);
  assert.deepEqual([s.wait_commission.n, s.wait_commission.pending, s.wait_commission.diff], [1, true, 612]);
  assert.match(r.sides.short, /eksik ödemiş/);
  // Sipariş numarası olmayan komisyon kaydı: eşleşemez, ayrıca bildirilir
  assert.deepEqual(r.noOrder.map((x) => [x.type, x.n, x.amount]), [['Komisyon', 1, -102]]);
  // Ayrıntı: pazaryeri kayıtları (ham alanlarıyla) ve panelin beklediği
  const dt = r.pending[0].detail;
  assert.deepEqual(dt.records.map((x) => [x.type, x.rawType, x.amount, x.counted, x.paid]), [['Satış', 'Payment', 3000, true, false]]);
  assert.equal(dt.records[0].raw.netAmount, 2500);
  assert.deepEqual(dt.lines.map((x) => [x.name, x.qty, x.total, x.commission, x.counted]), [['Kupa', 1, 3000, 612, true]]);
  assert.deepEqual([dt.expect.revenue, dt.expect.commission, dt.expect.payout, dt.expect.commissionSrc], [3000, 612, 2388, 'api']);
  // Komisyon kaydı gelince eşleşir
  await db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, due_date, paid, synced_at) VALUES ('hepsiburada', 'late', ?, 'Komisyon', 'Commission', '4093726680', -612, 612, ?, 0, 0)`).bind(now, now + 20 * D).run();
  const r2 = await settlementReport({ DB: db }, db, SET, { from: now - 90 * D, to: now + 1 });
  assert.equal(r2.totals.pending, 0);
  assert.ok(!r2.diffs.some((x) => x.order_number === '4093726680'));
  assert.equal(r2.totals.checked, 4);
  resetChannels();
});

test('Mutabakat (Hepsiburada): tüm kayıtlar geldi ve tutar düşük → pazaryeri eksik ödemiş; pazaryerinin karşıladığı kampanya indirimi ayrı nedenle', async () => {
  const { db, now } = await reconDb(
    [['SHORT', 3000, 612], ['CAMP', 925, 204], ['EXTRA', 1000, 204]],
    [['SHORT', 'Satış', 'Payment', 3000], ['SHORT', 'Komisyon', 'Commission', -700, 700],
      // Müşteri 925 ₺ ödedi, 75 ₺'yi Hepsiburada karşıladı (CampaignDiscount geliri); komisyon 1.000 ₺ üzerinden
      ['CAMP', 'Satış', 'Payment', 925], ['CAMP', 'Kampanya indirimi', 'CampaignDiscount', 75], ['CAMP', 'Komisyon', 'Commission', -204, 204],
      ['EXTRA', 'Satış', 'Payment', 1100], ['EXTRA', 'Komisyon', 'Commission', -224.4, 224.4]],
  );
  const r = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1 });
  const by = Object.fromEntries(r.diffs.map((x) => [x.order_number, x]));
  assert.deepEqual([by.SHORT.code, by.SHORT.side, by.SHORT.diff], ['commission_diff', 'short', -88]);
  assert.match(by.SHORT.reason, /Komisyon farklı/);
  assert.deepEqual([by.CAMP.code, by.CAMP.side, by.CAMP.diff], ['campaign', 'extra', 75]);
  assert.match(by.CAMP.reason, /kampanya indirimi \(75 ₺\)/);
  assert.deepEqual([by.EXTRA.code, by.EXTRA.side], ['sale_high', 'extra']);
  assert.equal(r.totals.short, 1);
  assert.equal(r.totals.pending, 0);
  assert.ok(STL_WAIT >= 30 * D);
  resetChannels();
});
