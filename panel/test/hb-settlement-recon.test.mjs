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
import { syncSettlements, settlementReport, STL_WAIT, saveDispute, settlementCsv, stlNotify } from '../src/finance.js';
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

test('Mutabakat (Hepsiburada): tüm kayıtlar geldi ve tutar düşük → pazaryeri eksik ödemiş; pazaryerinin karşıladığı kampanya indirimi fark değil, ayrıca özetlenir', async () => {
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
  assert.equal(by.CAMP, undefined, 'kampanya geliri fark sayılmaz');
  assert.deepEqual(r.totals.campaign, { orders: 1, amount: 75 });
  assert.deepEqual([by.EXTRA.code, by.EXTRA.side], ['sale_high', 'extra']);
  assert.deepEqual([r.totals.short, r.totals.shortAmount, r.totals.checked, r.totals.matched, r.totals.mismatched], [1, -88, 3, 1, 2]);
  // Sipariş numarasıyla arama: eşleşen sipariş de "uyumlu" olarak listelenir
  const sr = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1, q: 'CAM' });
  assert.deepEqual(sr.search.found.map((x) => [x.order_number, x.code]), [['CAMP', 'ok']]);
  assert.match(sr.search.found[0].reason, /kampanya indirimi \(75 ₺\)/);
  assert.ok(sr.search.found[0].detail.records.length === 3);
  assert.equal(r.totals.pending, 0);
  assert.ok(STL_WAIT >= 30 * D);
  resetChannels();
});

test('Mutabakat (Hepsiburada): fark takibi (itiraz edildi / kabul edildi), fark değişince yeniden açılır, Excel çıktısı', async () => {
  const { db, now } = await reconDb(
    [['SHORT', 3000, 612], ['SHORT2', 1000, 204], ['EXTRA', 1000, 204]],
    [['SHORT', 'Satış', 'Payment', 3000], ['SHORT', 'Komisyon', 'Commission', -700, 700],
      ['SHORT2', 'Satış', 'Payment', 1000], ['SHORT2', 'Komisyon', 'Commission', -254, 254],
      ['EXTRA', 'Satış', 'Payment', 1100], ['EXTRA', 'Komisyon', 'Commission', -224.4, 224.4]],
  );
  const Q = { from: now - 30 * D, to: now + 1 };
  await assert.rejects(saveDispute(db, { channel: 'hepsiburada', order_number: 'SHORT', status: 'bilinmez' }), /Geçersiz durum/);
  await saveDispute(db, { channel: 'hepsiburada', order_number: 'SHORT', status: 'disputed', note: 'Talep 123', diff: -88 }, { name: 'Ali' });
  await saveDispute(db, { channel: 'hepsiburada', order_number: 'EXTRA', status: 'accepted', note: 'Fiyat farkı doğru', diff: 75.6 }, { name: 'Ali' });
  let r = await settlementReport({ DB: db }, db, SET, Q);
  const by = Object.fromEntries(r.diffs.map((x) => [x.order_number, x]));
  // İtiraz edilen açık kalır, işaretlidir; kabul edilen kapatılanlara geçer
  assert.deepEqual([by.SHORT.dispute.status, by.SHORT.dispute.label, by.SHORT.dispute.note, by.SHORT.dispute.by, by.SHORT.dispute.changed], ['disputed', 'İtiraz edildi', 'Talep 123', 'Ali', false]);
  assert.equal(by.EXTRA, undefined);
  assert.deepEqual(r.closed.map((x) => [x.order_number, x.dispute.status]), [['EXTRA', 'accepted']]);
  assert.ok(r.closed[0].detail, 'kapatılanın da ayrıntısı var');
  assert.deepEqual([r.totals.mismatched, r.totals.closed, r.totals.disputed, r.totals.matched], [2, 1, 1, 0]);
  assert.ok(!r.summary.some((x) => x.code === 'sale_high'), 'kapatılan fark özete girmez');
  // Excel: açık farklar + kapatılanlar, takip ve not sütunlarıyla
  const csv = await settlementCsv({ DB: db }, db, SET, Q);
  const lines = csv.replace(/^\ufeff/, '').split('\r\n');
  assert.match(lines[0], /^Kanal;Sipariş no;Sipariş tarihi;Liste;Panel hesabı/);
  assert.equal(lines.length, 4);
  assert.ok(lines.some((l) => /;SHORT;/.test(l) && /;Açık fark;/.test(l) && /;-88;/.test(l) && /Eksik ödeme/.test(l) && /İtiraz edildi;Talep 123$/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /;EXTRA;/.test(l) && /;Kapatılan;/.test(l) && /Kabul edildi;Fiyat farkı doğru$/.test(l)));
  // Kapatılan farkın tutarı değişirse yeniden açılır
  await db.prepare("INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, due_date, paid, synced_at) VALUES ('hepsiburada', 'x2', ?, 'İade', 'Return', 'EXTRA', -50, 0, ?, 0, 0)").bind(now, now + 20 * D).run();
  r = await settlementReport({ DB: db }, db, SET, Q);
  const ex = r.diffs.find((x) => x.order_number === 'EXTRA');
  assert.ok(ex && ex.dispute.changed && ex.dispute.status === 'accepted');
  assert.equal(r.totals.closed, 0);
  // Takibi kaldır
  await saveDispute(db, { channel: 'hepsiburada', order_number: 'EXTRA', status: '' });
  r = await settlementReport({ DB: db }, db, SET, Q);
  assert.equal(r.diffs.find((x) => x.order_number === 'EXTRA').dispute, undefined);
  resetChannels();
});

test('Mutabakat bildirimleri (Hepsiburada): yeni eksik ödeme, geciken hakediş; itirazı sonuçlanan sipariş "çözüldü" olur; düzelince bildirim kapanır', async () => {
  const { db, now } = await reconDb(
    [['SHORT', 3000, 612], ['SHORT2', 1000, 204]],
    [['SHORT', 'Satış', 'Payment', 3000], ['SHORT', 'Komisyon', 'Commission', -700, 700],
      ['SHORT2', 'Satış', 'Payment', 1000], ['SHORT2', 'Komisyon', 'Commission', -254, 254]],
  );
  const env = { DB: db, ...HB_ENV };
  // Ödeme günü 5 gün geçmiş, ödenmemiş kayıt
  await db.prepare("INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, due_date, paid, synced_at) VALUES ('hepsiburada', 'late1', ?, 'Satış', 'Payment', 'ESKI', 450, 0, ?, 0, 0)").bind(now - 20 * D, now - 5 * D).run();
  await saveDispute(db, { channel: 'hepsiburada', order_number: 'SHORT2', status: 'disputed', diff: -50 });
  const notices = async () => Object.fromEntries((await db.prepare('SELECT key, level, title, msg, count, resolved_at FROM notices').all()).results.map((x) => [x.key, x]));
  let o = await stlNotify(env, db, SET);
  assert.deepEqual(o.hepsiburada, { short: 1, late: 450, fixed: 0 });
  let nt = await notices();
  assert.match(nt['stl:short:hepsiburada'].title, /Hepsiburada: 1 siparişte eksik ödeme görünüyor \(toplam 88 ₺\)/);
  assert.match(nt['stl:short:hepsiburada'].msg, /#SHORT \(88 ₺\)/);
  assert.ok(!/SHORT2/.test(nt['stl:short:hepsiburada'].msg), 'itiraz edilen bildirilmez');
  assert.match(nt['stl:late:hepsiburada'].title, /450 ₺ hakediş ödeme gününü geçti/);
  // Aynı durum tekrar bildirilmez
  o = await stlNotify(env, db, SET);
  assert.deepEqual(o.hepsiburada, { short: 0, late: 0, fixed: 0 });
  assert.equal((await notices())['stl:short:hepsiburada'].count, 1);
  // Pazaryeri SHORT2 farkını düzeltti, SHORT'u kabul ettik, geciken ödendi
  await db.prepare("INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, due_date, paid, synced_at) VALUES ('hepsiburada', 'fx', ?, 'Komisyon', 'Commission', 'SHORT2', 50, -50, ?, 0, 0)").bind(now, now + 20 * D).run();
  await db.prepare("UPDATE settlements SET paid = 1 WHERE remote_id = 'late1'").run();
  await saveDispute(db, { channel: 'hepsiburada', order_number: 'SHORT', status: 'accepted', diff: -88 });
  o = await stlNotify(env, db, SET);
  assert.equal(o.hepsiburada.fixed, 1);
  nt = await notices();
  assert.ok(nt['stl:short:hepsiburada'].resolved_at && nt['stl:late:hepsiburada'].resolved_at);
  assert.match(nt['stl:fixed:hepsiburada'].title, /1 itiraz sonuçlandı/);
  const d = await db.prepare("SELECT status, note FROM stl_disputes WHERE order_number = 'SHORT2'").first();
  assert.equal(d.status, 'resolved'); assert.match(d.note, /pazaryeri düzeltti/);
  resetChannels();
});
