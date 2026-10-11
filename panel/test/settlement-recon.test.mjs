// Hakediş ve mutabakat: Trendyol / Hepsiburada kayıt türleri ve işaretleri, ödeme günü (İstanbul saati), tarih aralıkları ve sayfalama,
// mutabakat (birebir, gerçek fark, kısmi iade, iptal, pazaryerinin karşıladığı kupon, panelde olmayan sipariş), tekrar senkron ve hata beklemesi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyol } from '../src/channels/trendyol.js';
import { hepsiburada } from '../src/channels/hepsiburada.js';
import { d1 } from '../dev/d1.mjs';
import { init, getRaw, setSetting } from '../src/db.js';
import { syncSettlements, settlementReport } from '../src/finance.js';
import { resetChannels } from '../src/channels/index.js';
import { saveOrders } from '../src/sync.js';
import { withBudget } from '../src/util.js';

const D = 864e5;
function mock(handler) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const r = handler(String(url));
    if (r && r.status) return new Response(JSON.stringify(r.body || { message: 'hata' }), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(r || {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const TY_ENV = { TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
const HB_ENV = { HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' };
const ty = () => trendyol(TY_ENV, { id: 'trendyol' });
const hb = () => hepsiburada(HB_ENV, { id: 'hepsiburada' });
const T0 = Date.parse('2026-09-20T10:00:00Z');
const page = (content, totalPages = 1) => ({ totalPages, content });

test('Trendyol: tür eşlemesi ve işaretler (Türkçe / İngilizce tür adı, düzeltme çifti tek sayılır, Trendyol kuponu, tanınmayan tür "Diğer")', async () => {
  mock((u) => {
    if (/transactionTypes=/.test(u)) return page([
      // Yanıttaki tür Türkçedir; tutarlar işaretsiz gelebilir: işaret türden gelir
      { id: 1, transactionType: 'Satış', orderNumber: ' 100 ', credit: 240, debt: 0, sellerRevenue: 182.4, commissionAmount: 57.6, transactionDate: T0, paymentDate: T0 + 21 * D, paymentOrderId: 9 },
      { id: 2, transactionType: 'İade', orderNumber: '100', credit: 0, debt: 120, sellerRevenue: 91.2, commissionAmount: 28.8, transactionDate: T0 + D, paymentDate: T0 + 22 * D },
      { id: 3, transactionType: 'İndirim', orderNumber: '100', debt: 20, credit: 0, sellerRevenue: 15.2, commissionAmount: 4.8, transactionDate: T0 },
      { id: 4, transactionType: 'Kupon İptal', orderNumber: '100', debt: 0, credit: 10, sellerRevenue: 7.6, commissionAmount: 2.4, transactionDate: T0 },
      // Komisyon düzeltmesi: hakedişe etkisi eşi olan "Hakediş düzeltme" kaydında (iki kez düşülmez)
      { id: 5, transactionType: 'CommissionPositive', orderNumber: '100', debt: 12, credit: 0, sellerRevenue: null, commissionAmount: 12, transactionDate: T0 },
      { id: 6, transactionType: 'SellerRevenueNegative', orderNumber: '100', debt: 12, credit: 0, sellerRevenue: 12, commissionAmount: 0, transactionDate: T0 },
      { id: 7, transactionType: 'TYCoupon', orderNumber: '100', debt: 30, credit: 0, sellerRevenue: 30, commissionAmount: 0, transactionDate: T0 },
      { id: 8, transactionType: 'Provizyon Negatif', orderNumber: '100', debt: 5, credit: 0, sellerRevenue: -5, transactionDate: T0 },
      // sellerRevenue yok: |alacak − borç| − komisyon
      { id: 9, transactionType: 'Sale', orderNumber: '101', credit: 100, debt: 0, commissionAmount: 24, transactionDate: T0 },
      { id: 10, transactionType: 'Bambaşka Kayıt', orderNumber: '102', debt: 7, credit: 0, transactionDate: T0 }]);
    if (/transactionType=ManualRefund&/.test(u)) return page([{ id: 11, transactionType: 'Manuel İade', orderNumber: '100', debt: 40, sellerRevenue: 30.4, commissionAmount: 9.6, transactionDate: T0 }]);
    if (/transactionType=ManuelRefund&/.test(u)) return { status: 400, body: { message: 'invalid transactionType' } };
    return page([]);
  });
  const rows = await ty().settlements(T0 - D, T0 + 2 * D);
  const by = Object.fromEntries(rows.map((x) => [x.remoteId, x]));
  assert.deepEqual([by[1].type, by[1].amount, by[1].commission, by[1].paid, by[1].orderNumber], ['Satış', 182.4, 57.6, true, '100']);
  assert.equal(by[1].dueDate, T0 + 21 * D);
  assert.deepEqual([by[2].type, by[2].amount, by[2].commission, by[2].paid], ['İade', -91.2, -28.8, false]);
  assert.deepEqual([by[3].type, by[3].amount, by[3].commission], ['İndirim', -15.2, -4.8]);
  assert.deepEqual([by[4].type, by[4].amount, by[4].commission], ['Kupon iptali', 7.6, 2.4]);
  assert.deepEqual([by[5].type, by[5].amount, by[5].commission], ['Komisyon düzeltme (+)', 0, 12]);
  assert.deepEqual([by[6].type, by[6].amount], ['Hakediş düzeltme (−)', -12]);
  assert.deepEqual([by[7].type, by[7].amount], ['Trendyol kuponu', -30]);
  assert.deepEqual([by[8].type, by[8].amount], ['Provizyon (−)', -5]);
  assert.deepEqual([by[9].type, by[9].amount, by[9].commission], ['Satış', 76, 24]);
  assert.deepEqual([by[10].type, by[10].amount, by[10].unknown, by[10].rawType], ['Diğer', -7, true, 'Bambaşka Kayıt']);
  // Tek tür okuması: istenen tür bilinir; servisin tanımadığı yazım (400) atlanır, okuma sürer
  assert.deepEqual([by[11].type, by[11].amount], ['Manuel iade', -30.4]);
});

test('Trendyol: 15 günü aşmayan aralıklar, sayfalama; ortak okuma reddedilirse tür tür okunur, tanınmayan tür atlanır', async () => {
  const calls = mock((u) => {
    if (/transactionTypes=/.test(u)) return { status: 400, body: { message: 'transactionTypes desteklenmiyor' } };
    if (/transactionType=TYCoupon&/.test(u)) return { status: 400, body: { message: 'invalid' } };
    if (/transactionType=Sale&/.test(u)) {
      const p = Number(/page=(\d+)/.exec(u)[1]), s = Number(/startDate=(\d+)/.exec(u)[1]);
      return page([{ id: `S${s}-${p}`, transactionType: 'Satış', orderNumber: 'A', credit: 10, sellerRevenue: 8, commissionAmount: 2, transactionDate: s }], 3);
    }
    return page([]);
  });
  const since = T0 - 40 * D, rows = await ty().settlements(since, T0);
  const sale = calls.filter((u) => /transactionType=Sale&/.test(u));
  const wins = [...new Set(sale.map((u) => /startDate=(\d+)&endDate=(\d+)/.exec(u).slice(1).map(Number).join('-')))].map((x) => x.split('-').map(Number));
  assert.equal(wins.length, 3);
  assert.equal(wins[0][0], since); assert.equal(wins.at(-1)[1], T0);
  for (let i = 0; i < wins.length; i++) { assert.ok(wins[i][1] - wins[i][0] <= 15 * D); if (i) assert.equal(wins[i][0], wins[i - 1][1]); }
  assert.equal(sale.length, 9); // 3 aralık × 3 sayfa
  assert.equal(rows.filter((x) => x.type === 'Satış').length, 9);
  assert.ok(calls.every((u) => /size=1000/.test(u)));
});

test('Hepsiburada: tür eşlemesi ve işaretler, toplam ödeme satırı atlanır, aylık aralık ve sayfalama', async () => {
  const calls = mock((u) => {
    const off = Number(/Offset=(\d+)/.exec(u)[1]);
    if (off === 0) return { items: [
      { id: 'p1', transactionType: 'Payment', orderNumber: '777', amount: { value: 500 }, isIncome: true, status: 'Paid', orderDate: '2026-09-20T09:00:00', dueDate: '2026-10-01', paymentDate: '2026-10-01T10:00:00' },
      { id: 'c1', transactionType: 'Commission', orderNumber: '777', amount: { value: -108 }, isIncome: false, status: 'Paid', orderDate: '2026-09-20T09:00:00', dueDate: '2026-10-01' },
      { id: 'c2', transactionType: 'CommissionRefund', orderNumber: '777', amount: 21.6, isIncome: true, status: 'WillBePaid', orderDate: '2026-09-20T09:00:00', dueDate: '2026-10-15' },
      { id: 's1', transactionType: 'Stoppage', orderNumber: '777', amount: -4.17, status: 'Paid', orderDate: '2026-09-20T09:00:00', dueDate: '2026-10-01' },
      { id: 'k1', transactionType: 'ShipmentCostSharingExpense', orderNumber: '777', amount: -45, isIncome: false, status: 'Paid', orderDate: '2026-09-20T09:00:00', dueDate: '2026-10-01' },
      { id: 'x1', transactionType: 'MysteryFee', orderNumber: '', amount: -3, isIncome: false, status: 'WillBePaid', invoiceDate: '2026-09-21', dueDate: '2026-10-15' },
      { id: 't1', transactionType: 'TotalPayment', amount: 400, isIncome: true, status: 'Paid', dueDate: '2026-10-01' },
      ...Array.from({ length: 93 }, (_, i) => ({ id: 'f' + i, transactionType: 'Payment', orderNumber: 'F' + i, amount: 1, isIncome: true, status: 'Paid', orderDate: '2026-09-20', dueDate: '2026-10-01' }))] };
    return { items: [{ id: 'last', transactionType: 'Return', orderNumber: '778', amount: { value: -80 }, isIncome: false, status: 'WillBePaid', orderDate: '2026-09-22', dueDate: '2026-10-15' }] };
  });
  const rows = await hb().settlements(T0 - 40 * D, T0);
  const by = Object.fromEntries(rows.map((x) => [x.remoteId, x]));
  assert.deepEqual([by.p1.type, by.p1.amount, by.p1.paid, by.p1.commission], ['Satış', 500, true, 0]);
  // Ödeme günü İstanbul saati: "2026-10-01" → 1 Ekim 00:00 (UTC 30 Eylül 21:00)
  assert.equal(by.p1.dueDate, Date.parse('2026-09-30T21:00:00Z'));
  assert.deepEqual([by.c1.type, by.c1.amount, by.c1.commission], ['Komisyon', -108, 108]);
  assert.deepEqual([by.c2.type, by.c2.amount, by.c2.commission, by.c2.paid], ['Komisyon', 21.6, -21.6, false]);
  assert.deepEqual([by.s1.type, by.s1.amount], ['Stopaj', -4.17]);
  assert.deepEqual([by.k1.type, by.k1.amount], ['Kargo', -45]);
  assert.deepEqual([by.x1.type, by.x1.unknown, by.x1.rawType], ['Diğer', true, 'MysteryFee']);
  assert.equal(by.t1, undefined);
  assert.deepEqual([by.last.type, by.last.amount], ['İade', -80]);
  // 40 gün → iki aralık (her biri en çok 28 gün); her aralıkta 100'lük sayfa dolu olduğu için ikinci sayfa okunur
  const wins = [...new Set(calls.map((u) => /RecordDateStart=([\d-]+)&RecordDateEnd=([\d-]+)/.exec(u).slice(1).join('/')))];
  assert.equal(wins.length, 2);
  assert.equal(calls.filter((u) => /Offset=100&/.test(u)).length, 2);
});

// Mutabakat senaryoları: birebir, rakam yuvarlama, komisyon farkı, kısmi iade, iptal, pazaryerinin kuponu, satıcı kuponu, panelde olmayan sipariş
async function reconDb(rows) {
  const db = d1(); await init(db); resetChannels();
  const now = Date.now(), at = now - 5 * D;
  const o = (no, total, extra = {}) => ({ remoteId: no, orderNumber: no, orderedAt: at, status: 'delivered', customer: 'A', total, items: [{ lineId: '1', sku: 'S', name: 'Ü', quantity: extra.qty || 1, unitPrice: total / (extra.qty || 1), total, remoteKey: 'S' }], ...extra.o });
  await saveOrders(db, 'trendyol', [o('M1', 1000), o('M2', 1000), o('M3', 999.99), o('P1', 300, { qty: 3 }), o('C1', 200, { o: { status: 'cancelled' } }), o('TY1', 500), o('SC1', 500), o('R1', 400, { o: { status: 'returned' } }), o('R2', 400, { o: { status: 'returned' } })]);
  await db.prepare("UPDATE order_items SET returned_qty = 1 WHERE order_id = (SELECT id FROM orders WHERE order_number = 'P1')").run();
  await db.prepare("UPDATE order_items SET status = 'cancelled' WHERE order_id = (SELECT id FROM orders WHERE order_number = 'C1')").run();
  let i = 0;
  const ins = (no, type, amount, commission = 0, extra = {}) => db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at)
    VALUES ('trendyol', ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0)`).bind('r' + ++i, extra.date || now - 2 * D, type, no, amount, commission, extra.due || now + 10 * D, extra.due || now + 10 * D, extra.paid ? 1 : 0).run();
  for (const r of rows) await ins(...r);
  return { db, now };
}
const SET = { commission: { trendyol: 24 }, costs_vat_incl: true };

test('Mutabakat: birebir ve kuruş farkı uyumlu; ayrı kesintiler (stopaj, kargo) ve pazaryerinin kuponu fark sayılmaz', async () => {
  const { db, now } = await reconDb([
    ['M1', 'Satış', 760, 240], ['M1', 'Stopaj', -8.33], ['M1', 'Kargo', -60],
    ['M3', 'Satış', 759.39, 240.6], // 999,99 × %24 = 239,9976 → 0,61 kuruş farkı (yuvarlama payı içinde)
    ['TY1', 'Satış', 380, 120], ['TY1', 'Trendyol kuponu', -50],
  ]);
  const r = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1 });
  assert.equal(r.totals.checked, 3);
  assert.equal(r.totals.mismatched, 0, JSON.stringify(r.diffs));
  assert.equal(r.totals.matched, 3);
  resetChannels();
});

test('Mutabakat: gerçek fark nedeniyle işaretlenir (komisyon, satıcı kuponu, iptal, iade düşmedi)', async () => {
  const { db, now } = await reconDb([
    ['M2', 'Satış', 700, 300], // komisyon %30 (panel %24)
    ['SC1', 'Satış', 380, 120], ['SC1', 'Kupon', -38, -12], // satıcının karşıladığı kupon panelde görünmüyor
    ['C1', 'Satış', 152, 48], // iptal edilen siparişte ödeme kaydı
    ['R1', 'Satış', 304, 96], // tamamı iade, iade kaydı henüz yok
    ['R2', 'Satış', 304, 96], ['R2', 'İade', -304, -96], // tamamı iade, iade kaydı var → uyumlu
  ]);
  const r = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1 });
  const by = Object.fromEntries(r.diffs.map((x) => [x.order_number, x]));
  assert.equal(r.totals.checked, 5);
  assert.deepEqual(Object.keys(by).sort(), ['C1', 'M2', 'R1', 'SC1']);
  assert.equal(by.M2.expected, 760); assert.equal(by.M2.actual, 700); assert.equal(by.M2.diff, -60);
  assert.match(by.M2.reason, /Komisyon farklı: pazaryeri %30, panel %24/);
  assert.match(by.SC1.reason, /Satış tutarı düşük/); assert.equal(by.SC1.diff, -38);
  assert.match(by.C1.reason, /iptal/); assert.equal(by.C1.expected, 0);
  assert.match(by.R1.reason, /İade pazaryerinin kayıtlarına henüz düşmedi/);
  resetChannels();
});

test('Mutabakat: kısmi iade (3 adetten 1) iade kaydıyla uyumlu, kaydı yoksa nedeniyle işaretlenir; panelde olmayan sipariş ayrı listelenir', async () => {
  const ok = await reconDb([['P1', 'Satış', 228, 72], ['P1', 'İade', -76, -24], ['ZZ9', 'Satış', 90, 10], ['ZZ9', 'Stopaj', -1]]);
  const r = await settlementReport({ DB: ok.db }, ok.db, SET, { from: ok.now - 30 * D, to: ok.now + 1 });
  assert.equal(r.diffs.length, 0, JSON.stringify(r.diffs));
  assert.equal(r.totals.unmatched, 1); assert.equal(r.totals.unmatchedAmount, 89);
  assert.deepEqual([r.unmatched[0].order_number, r.unmatched[0].amount], ['ZZ9', 89]);
  const bad = await reconDb([['P1', 'Satış', 228, 72]]);
  const r2 = await settlementReport({ DB: bad.db }, bad.db, SET, { from: bad.now - 30 * D, to: bad.now + 1 });
  assert.equal(r2.diffs.length, 1); assert.equal(r2.diffs[0].diff, 76);
  assert.match(r2.diffs[0].reason, /İade pazaryerinin kayıtlarına henüz düşmedi/);
  resetChannels();
});

test('Hakediş raporu: ödeme günü İstanbul gece yarısına göre; ödenen / ödenecek / geciken toplamları; tür toplamları', async () => {
  const db = d1(); await init(db);
  const now = Date.now();
  const ins = (id, due, amount, paid, type = 'Satış', date = now - 3 * D) => db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at)
    VALUES ('hepsiburada', ?, ?, ?, ?, '', ?, 0, ?, ?, ?, '', 0)`).bind(id, date, type, type === 'Diğer' ? 'MysteryFee' : '', amount, due, due, paid ? 1 : 0).run();
  // İstanbul 1 Ekim 00:30 = UTC 30 Eylül 21:30 → 2026-10-01; 30 Eylül 23:59 TR = UTC 20:59 → 2026-09-30
  const a = Date.parse('2026-09-30T21:30:00Z'), b = Date.parse('2026-09-30T20:59:00Z');
  await ins('a', a, 100, true); await ins('b', b, 50, true);
  await ins('up', now + 5 * D, 200, false); await ins('late', now - 10 * D, 30, false); await ins('grace', now - 2 * D, 20, false); await ins('x', now + 5 * D, -3, false, 'Diğer');
  const r = await settlementReport({ DB: db }, db, {}, { from: Date.parse('2026-09-01T00:00:00+03:00'), to: Date.parse('2026-10-11T00:00:00+03:00') });
  const day = (d) => r.days.find((x) => x.d === d);
  assert.equal(day('2026-10-01').paid, 100); assert.equal(day('2026-09-30').paid, 50);
  assert.equal(r.totals.paid, 150);
  assert.equal(r.totals.upcoming, 247);
  // 3 günlük pay: 2 gün geçen ödeme henüz "gecikti" sayılmaz
  assert.equal(r.totals.overdue, 30);
  const other = r.types.find((x) => x.type === 'Diğer');
  assert.equal(other.raw, 'MysteryFee');
});

test('Senkron: tekrar okumada çift kayıt yok, ödenme bilgisi güncellenir; ödenmemiş en eski kayıttan okunur; hata sonrası bekleme', async () => {
  let paid = false, fail = false;
  const now = Date.now();
  const calls = mock((u) => {
    if (fail) return { status: 500, body: { message: 'servis hatası' } };
    if (/transactionTypes=/.test(u) && Number(/startDate=(\d+)/.exec(u)[1]) <= now - 40 * D && Number(/endDate=(\d+)/.exec(u)[1]) > now - 40 * D) return page([
      { id: 1, transactionType: 'Satış', orderNumber: 'X1', credit: 100, sellerRevenue: 76, commissionAmount: 24, transactionDate: now - 40 * D, paymentDate: now - 5 * D, ...(paid ? { paymentOrderId: 5 } : {}) }]);
    return page([]);
  });
  const db = d1(); await init(db); resetChannels();
  const env = { DB: db, ...TY_ENV };
  assert.equal((await syncSettlements(env, db, { force: true })).trendyol, 1);
  // İkinci okuma: ilk okuma yapıldı → son 20 gün, ama ödenmemiş kayıt 40 gün önce: o tarihten okunur
  calls.length = 0; paid = true;
  assert.equal((await syncSettlements(env, db, { force: true })).trendyol, 1);
  const starts = calls.map((u) => Number(/startDate=(\d+)/.exec(u)[1]));
  assert.ok(Math.min(...starts) <= now - 40 * D);
  const rows = await db.prepare('SELECT * FROM settlements').all();
  assert.equal(rows.results.length, 1);
  assert.equal(rows.results[0].paid, 1);
  // Ödendikten sonra pencere yine son 20 gün
  calls.length = 0;
  await syncSettlements(env, db, { force: true });
  assert.ok(Math.min(...calls.map((u) => Number(/startDate=(\d+)/.exec(u)[1]))) >= now - 21 * D);
  // Hata: kayıt düşer, 30 dk beklenir (zorlamasız senkron kanala gitmez); ikinci hatada 1 saat
  fail = true;
  const e1 = await syncSettlements(env, db, { force: true });
  assert.match(e1.trendyol, /hata/);
  let st = await getRaw(db, 'stlsync:trendyol');
  assert.equal(st.fails, 1); assert.ok(st.n != null, 'ilk okuma yapıldı bilgisi korunur');
  calls.length = 0;
  assert.deepEqual(await syncSettlements(env, db), {});
  assert.equal(calls.length, 0);
  await setSetting(db, 'stlsync:trendyol', { ...st, at: Date.now() - 31 * 60e3 });
  await syncSettlements(env, db);
  st = await getRaw(db, 'stlsync:trendyol');
  assert.equal(st.fails, 2);
  await setSetting(db, 'stlsync:trendyol', { ...st, at: Date.now() - 45 * 60e3 });
  calls.length = 0;
  await syncSettlements(env, db);
  assert.equal(calls.length, 0, '2 hatadan sonra 1 saat beklenir');
  // İstek sınırı dolarsa hata sayılmaz
  fail = false;
  await withBudget(0, () => syncSettlements(env, db, { force: true }));
  assert.equal((await getRaw(db, 'stlsync:trendyol')).fails, 2);
  // Başarılı okuma hata sayacını sıfırlar
  await syncSettlements(env, db, { force: true });
  st = await getRaw(db, 'stlsync:trendyol');
  assert.equal(st.fails, undefined); assert.equal(st.error, undefined);
  resetChannels();
});

test('Senkron: tanınmayan tür "Diğer" olarak saklanır ve günlüğe yazılır', async () => {
  mock((u) => (/transactionTypes=/.test(u) ? page([{ id: 77, transactionType: 'Yepyeni Tür', orderNumber: '5', debt: 9, credit: 0, transactionDate: Date.now() - D }]) : page([])));
  const db = d1(); await init(db); resetChannels();
  await syncSettlements({ DB: db, ...TY_ENV }, db, { force: true });
  const row = await db.prepare('SELECT type, raw_type, amount FROM settlements').first();
  assert.deepEqual({ ...row }, { type: 'Diğer', raw_type: 'Yepyeni Tür', amount: -9 });
  const lg = await db.prepare("SELECT level, msg FROM logs WHERE channel = 'trendyol'").all();
  assert.ok(lg.results.some((x) => x.level === 'warn' && /Yepyeni Tür \(1\)/.test(x.msg)));
  resetChannels();
});

test('Hakediş raporu: ödeme günleri tablosu kartlarla tutar (dönemden önce geciken ödenmemiş kayıt, aynı gün kısmen ödenen)', async () => {
  const db = d1(); await init(db);
  const now = Date.now();
  const ins = (id, due, amount, paid) => db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at)
    VALUES ('trendyol', ?, ?, 'Satış', '', '', ?, 0, ?, ?, ?, '', 0)`).bind(id, due - 20 * D, amount, due, due, paid ? 1 : 0).run();
  const mixed = now - 2 * D;
  await ins('old', now - 40 * D, 70, false); // dönem (son 7 gün) başlamadan gecikmiş
  await ins('m1', mixed, 100, true); await ins('m2', mixed, 25, false); // aynı gün: 100 ödendi, 25 bekliyor
  await ins('far', now + 80 * D, 40, false); // 60 günden sonraki vade
  await ins('outside', now - 20 * D, 999, true); // dönem dışında ödenen: sayılmaz
  const r = await settlementReport({ DB: db }, db, {}, { from: now - 7 * D, to: now + 1 });
  const sum = (k) => Math.round(r.days.reduce((a, x) => a + (x[k] || 0), 0) * 100) / 100;
  assert.equal(r.totals.upcoming, 135); assert.equal(sum('due'), 135);
  assert.equal(r.totals.overdue, 70);
  assert.equal(r.totals.paid, 100); assert.equal(sum('paid'), 100);
  const day = r.days.find((x) => x.paid);
  assert.deepEqual([day.paid, day.due], [100, 25]);
});

test('Senkron: tutarı 0 olan ödenmemiş kayıt (komisyon düzeltmesi) okuma penceresini geriye açmaz', async () => {
  const now = Date.now();
  const calls = mock(() => page([]));
  const db = d1(); await init(db); resetChannels();
  await setSetting(db, 'stlsync:trendyol', { at: now - 7 * 3600e3, n: 5 });
  await db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, order_number, amount, commission, due_date, paid, synced_at) VALUES ('trendyol', 'z', ?, 'Komisyon düzeltme (−)', 'X', 0, -5, ?, 0, 0)`).bind(now - 60 * D, now - 50 * D).run();
  await syncSettlements({ DB: db, ...TY_ENV }, db, { force: true });
  assert.ok(Math.min(...calls.map((u) => Number(/startDate=(\d+)/.exec(u)[1]))) >= now - 21 * D);
  resetChannels();
});
