// Kesilen faturalar: Trendyol cari ekstre ve Hepsiburada muhasebe işlemlerinden fatura türleri; panelde saklama ve dönem raporu
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyol } from '../src/channels/trendyol.js';
import { hepsiburada } from '../src/channels/hepsiburada.js';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { syncInvoices, listInvoices, breakdown } from '../src/finance.js';
import { resetChannels } from '../src/channels/index.js';
import { saveOrders } from '../src/sync.js';

function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push(String(url));
    const hit = routes.find(([re]) => re.test(String(url)));
    return new Response(JSON.stringify(hit ? (typeof hit[1] === 'function' ? hit[1](String(url)) : hit[1]) : {}), { status: hit ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const T0 = Date.parse('2026-09-20T10:00:00Z');

test('Trendyol: kesinti faturaları türlerine ayrılır (kargo, hizmet bedeli, reklam), stopaj ayrı', async () => {
  const calls = mock([[/otherfinancials/, (u) => {
    if (/DeductionInvoices/.test(u)) return { totalPages: 1, content: [
      { id: 'K1', transactionType: 'Kargo Fatura', debt: 120.5, credit: 0, transactionDate: T0 },
      { id: 'P1', transactionType: 'Platform Hizmet Bedeli', debt: 59.9, credit: 0, transactionDate: T0 },
      { id: 'R1', transactionType: 'Reklam Bedeli', description: 'Influencer', debt: 300, credit: 0, transactionDate: T0 }] };
    if (/Stoppage/.test(u)) return { totalPages: 1, content: [{ id: 'S1', transactionType: 'Stopaj', debt: 4.17, credit: 0, transactionDate: T0, orderNumber: '900' }] };
    return { totalPages: 1, content: [] };
  }]]);
  const ch = trendyol({ TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
  const r = await ch.invoices(T0 - 864e5, T0 + 864e5);
  assert.deepEqual(r.map((x) => [x.no, x.type, x.amount]), [['K1', 'Kargo', 120.5], ['P1', 'Hizmet bedeli', 59.9], ['R1', 'Reklam / pazarlama', 300], ['S1', 'Stopaj', 4.17]]);
  assert.ok(calls.every((u) => /startDate=\d+&endDate=\d+/.test(u)));
});

test('Hepsiburada: işlemler fatura numarasına göre birleşir, iade eksi yazılır; panelde saklanır ve raporlanır', async () => {
  mock([[/mpfinance-external.*transactions/, { count: 3, items: [
    { id: 1, transactionType: 'Commission', invoiceNumber: 'HBK-1', amount: { value: -50 }, invoiceDate: '2026-09-20T00:00:00', invoiceExplanation: 'Komisyon faturası' },
    { id: 2, transactionType: 'Commission', invoiceNumber: 'HBK-1', amount: { value: -30 }, invoiceDate: '2026-09-20T00:00:00' },
    { id: 3, transactionType: 'CommissionRefund', invoiceNumber: 'HBK-2', amount: { value: 10 }, invoiceDate: '2026-09-21T00:00:00' },
    { id: 4, transactionType: 'ShipmentCostSharingExpense', invoiceNumber: '', orderNumber: '777', amount: { value: -25 }, orderDate: '2026-09-20T00:00:00' }] }]]);
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' }, { id: 'hepsiburada' });
  const r = await ch.invoices(T0 - 864e5, T0 + 864e5);
  assert.deepEqual(r.map((x) => [x.no, x.type, x.amount]), [['HBK-1', 'Komisyon', 80], ['HBK-2', 'Komisyon', -10], ['', 'Kargo', 25]]);

  const db = d1(); await init(db); resetChannels();
  const env = { DB: db, HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' };
  const s = await syncInvoices(env, db, { force: true });
  assert.equal(s.hepsiburada, 3);
  await syncInvoices(env, db, { force: true }); // ikinci kez: çift kayıt olmaz
  const L = await listInvoices(env, db, { from: T0 - 5 * 864e5, to: T0 + 5 * 864e5 });
  assert.equal(L.total, 3); assert.equal(L.sum, 95);
  assert.deepEqual(L.types.map((x) => [x.type, x.amount]), [['Komisyon', 70], ['Kargo', 25]]);
  assert.deepEqual(L.supported, ['hepsiburada']);
  resetChannels();
});

test('Gelir & gider: komisyon, kargo, stopaj basamakları ve hakediş', async () => {
  const db = d1(); await init(db);
  const o = { remoteId: 'X1', orderNumber: 'X1', orderedAt: Date.now() - 864e5, status: 'delivered', customer: 'A', total: 240, items: [{ lineId: '1', sku: 'S', name: 'Ürün', quantity: 1, unitPrice: 240, total: 240, remoteKey: 'S' }] };
  await saveOrders(db, 'trendyol', [o]);
  const settings = { commission: { trendyol: 20 }, shipping: { trendyol: 30 }, service_fee: { trendyol: 10 }, fee_rate: {}, withholding: { trendyol: 1 } };
  const b = await breakdown(db, settings, {});
  // 240 − 48 komisyon − 30 kargo − 10 hizmet − 2 stopaj (KDV hariç 200'ün %1'i) = 150
  assert.equal(b.total.revenue, 240); assert.equal(b.total.commission, 48); assert.equal(b.total.withholding, 2); assert.equal(b.total.payout, 150);
  assert.equal(b.steps.find((x) => x.k === 'payout').v, 150);
  assert.equal(b.channels[0].channel, 'trendyol');
});

test('Gelir & gider: sipariş bazında kargo gelmeyen kanalda dönemin kargo faturaları toplamı kullanılır', async () => {
  const db = d1(); await init(db);
  const mk = (no) => ({ remoteId: no, orderNumber: no, orderedAt: Date.now() - 864e5, status: 'delivered', customer: 'A', total: 100, items: [{ lineId: '1', sku: 'S', name: 'Ürün', quantity: 1, unitPrice: 100, total: 100, remoteKey: 'S' }] });
  await saveOrders(db, 'trendyol', [mk('A1'), mk('A2')]);
  await saveOrders(db, 'hepsiburada', [mk('B1')]);
  await db.prepare("INSERT INTO invoices (channel, remote_id, no, date, type, description, amount, order_number, url, synced_at) VALUES ('trendyol', 'K1', 'K1', ?, 'Kargo', 'Kargo Fatura', 85.5, '', '', 0)").bind(Date.now() - 2 * 864e5).run();
  const settings = { commission: {}, shipping: {}, service_fee: {}, fee_rate: {}, withholding: {} };
  const b = await breakdown(db, settings, {});
  const ty = b.channels.find((c) => c.channel === 'trendyol'), hb = b.channels.find((c) => c.channel === 'hepsiburada');
  assert.equal(ty.shipping, 85.5); assert.equal(ty.shippingSrc, 'invoice'); assert.equal(ty.payout, 200 - 85.5);
  assert.equal(hb.shipping, 0); assert.equal(hb.shippingSrc, 'estimate');
  assert.equal(b.total.shipping, 85.5); assert.equal(b.total.payout, 300 - 85.5);
  assert.match(b.steps.find((x) => x.k === 'shipping').note, /kargo faturaları toplamı/);
});

test('Hakediş: Trendyol ekstresi saklanır; ödeme günleri, ödenecek toplam ve mutabakat farkı', async () => {
  const now = Date.now();
  mock([[/settlements\?/, (u) => (/transactionTypes=/.test(u) ? { totalPages: 1, content: [
    { id: 1, transactionType: 'Sale', transactionDate: now - 3 * 864e5, orderNumber: 'X1', credit: 240, debt: 0, sellerRevenue: 190, commissionAmount: 50, paymentDate: now + 5 * 864e5 },
    { id: 2, transactionType: 'Sale', transactionDate: now - 20 * 864e5, orderNumber: 'X2', credit: 100, debt: 0, sellerRevenue: 80, commissionAmount: 20, paymentDate: now - 2 * 864e5, paymentOrderId: 77 },
    { id: 3, transactionType: 'Return', transactionDate: now - 10 * 864e5, orderNumber: 'X2', credit: 0, debt: 100, sellerRevenue: 80, commissionAmount: 20, paymentDate: now - 2 * 864e5, paymentOrderId: 77 }] } : { totalPages: 1, content: [] })]]);
  const db = d1(); await init(db); resetChannels();
  const env = { DB: db, TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
  const { syncSettlements, settlementReport } = await import('../src/finance.js');
  assert.equal((await syncSettlements(env, db, { force: true })).trendyol, 3);
  await saveOrders(db, 'trendyol', [{ remoteId: 'X1', orderNumber: 'X1', orderedAt: now - 3 * 864e5, status: 'delivered', customer: 'A', total: 240, items: [{ lineId: '1', sku: 'S', name: 'Ü', quantity: 1, unitPrice: 240, total: 240, remoteKey: 'S' }] }]);
  const r = await settlementReport(env, db, { commission: { trendyol: 20 } }, { from: now - 30 * 864e5, to: now + 1 });
  assert.equal(r.totals.upcoming, 190); assert.equal(r.totals.paid, 0);
  assert.equal(r.types.find((x) => x.type === 'İade').amount, -80);
  // Panel tahmini: 240 − %20 = 192; pazaryeri 190 → 2 TL fark
  assert.equal(r.diffs.length, 1); assert.equal(r.diffs[0].diff, -2);
  resetChannels();
});
