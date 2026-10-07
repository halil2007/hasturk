// Trendyol denetimi: güncel dokümana göre düzeltmeler (v2/orders, yeniden adlandırılan alanlar, GMT+3 tarihler, paket bölme /
// kısmi iptal, stok-fiyat toplu işlem sonucu, iade ret talebi, ödeme bekleyen paket). Ağa çıkmadan, örnek cevaplarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyol } from '../src/channels/trendyol.js';

const H3 = 3 * 3600e3, D = 864e5;
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    const hit = routes.find(([re, m]) => re.test(String(url)) && (!m || m === (opts.method || 'GET')));
    const out = hit ? (typeof hit[2] === 'function' ? hit[2](String(url), opts) : hit[2]) : { message: 'yok' };
    const status = out && out.__status ? out.__status : hit ? 200 : 404;
    return new Response(JSON.stringify(out), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const env = { TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
const ty = (e = {}) => trendyol({ ...env, ...e }, { id: 'trendyol' });
// Güncel (Nisan 2026 sonrası) paket biçimi: shipmentPackageId, lines[].lineId, lineUnitPrice, stockCode, packageTotalPrice
const pkg = (id, status, lines, extra = {}) => ({ shipmentPackageId: id, orderNumber: '900', orderDate: 1790000000000 + H3, status, customerFirstName: 'Ay', customerLastName: 'Şe',
  shipmentAddress: { fullName: 'Ayşe K', fullAddress: 'Adres', city: 'İzmir', district: 'Bornova', phone: '05' }, cargoProviderName: 'Trendyol Express', cargoTrackingNumber: 7000 + id,
  packageTotalPrice: lines.reduce((s, l) => s + l.lineUnitPrice * l.quantity, 0), lines, ...extra });
const line = (lineId, qty, price, extra = {}) => ({ lineId, quantity: qty, stockCode: 'SKU' + lineId, barcode: 'B' + lineId, productName: 'Ürün ' + lineId, lineUnitPrice: price, ...extra });

test('Trendyol: siparişler v2/orders adresinden, yeni alan adlarıyla (lineId, lineUnitPrice, packageTotalPrice) okunur', async () => {
  const calls = mockFetch([[/\/v2\/orders\?/, 'GET', { totalPages: 1, content: [pkg(1, 'Created', [line(11, 2, 100), line(12, 1, 50)])] }], [/shipment-packages\/1$/, 'PUT', {}]]);
  const [o] = await ty().fetchOrders(Date.now() - D, Date.now());
  assert.match(calls[0].url, /\/integration\/order\/sellers\/42\/v2\/orders\?/);
  assert.equal(o.items.length, 2, 'iki ayrı satır tek kaleme düşmez');
  assert.deepEqual(o.items.map((i) => [i.lineId, i.sku, i.quantity, i.unitPrice, i.total]), [['11', 'SKU11', 2, 100, 200], ['12', 'SKU12', 1, 50, 50]]);
  assert.equal(o.total, 250);
  assert.equal(o.packages[0].remoteId, '1');
  assert.deepEqual(o.packages[0].items, [{ line_id: '11', qty: 2 }, { line_id: '12', qty: 1 }]);
  await ty().accept({ packages: [{ remote_id: '1', status: 'open', remote_status: 'Created', items: o.packages[0].items }] });
  const put = calls.find((c) => c.method === 'PUT');
  assert.deepEqual(JSON.parse(put.body).lines, [{ lineId: 11, quantity: 2 }, { lineId: 12, quantity: 1 }]);
});

test('Trendyol: orderDate GMT+3 → gerçek zaman; bitiş tarihi +3 saat, dilim 2 haftayı aşmaz; 1 aydan eskisi istenmez', async () => {
  const calls = mockFetch([[/\/v2\/orders\?/, 'GET', { totalPages: 1, content: [pkg(1, 'Created', [line(11, 1, 10)])] }]]);
  const until = Date.now(), since = until - 20 * D;
  const out = await ty().fetchOrders(since, until);
  assert.equal(out[0].orderedAt, 1790000000000);
  const qs = calls.map((c) => new URL(c.url).searchParams);
  assert.equal(Number(qs[0].get('endDate')), until + H3);
  for (const q of qs) assert.ok(Number(q.get('endDate')) - Number(q.get('startDate')) <= 14 * D, 'aralık en fazla 2 hafta');
  assert.equal(Math.min(...qs.map((q) => Number(q.get('startDate')))), since);
  assert.equal(out.warnings, undefined);
  calls.length = 0;
  const old = await ty().fetchOrders(until - 60 * D, until);
  assert.ok(Math.min(...calls.map((c) => Number(new URL(c.url).searchParams.get('startDate')))) >= until - 30 * D, 'son 1 ay');
  assert.match(old.warnings[0], /son 1 ay/);
});

test('Trendyol: v2 adresi yoksa (404) eski /orders adresine düşülür', async () => {
  const calls = mockFetch([[/\/v2\/orders\?/, 'GET', { __status: 404, message: 'not found' }], [/\/sellers\/42\/orders\?/, 'GET', { totalPages: 1, content: [pkg(1, 'Created', [line(11, 1, 10)])] }]]);
  const out = await ty().fetchOrders(Date.now() - D, Date.now());
  assert.equal(out.length, 1);
  assert.ok(calls.some((c) => /\/sellers\/42\/orders\?/.test(c.url)));
});

test('Trendyol: bölünen paket (UnPacked) ve kısmi iptalle bozulan paket sayılmaz; aynı satır iki pakete bölündüyse adet toplanır', async () => {
  mockFetch([[/\/v2\/orders\?/, 'GET', { totalPages: 1, content: [
    pkg(2, 'Created', [line(11, 2, 100)], { originPackageIds: [1] }),
    pkg(3, 'Created', [line(11, 1, 100)], { originPackageIds: [1] }),
    pkg(1, 'UnPacked', [line(11, 3, 100)]),
    pkg(2, 'Created', [line(11, 2, 100)], { originPackageIds: [1] }), // aynı paket ikinci sayfada tekrar
  ] }]]);
  const [o] = await ty().fetchOrders(Date.now() - D, Date.now());
  assert.deepEqual(o.items.map((i) => [i.lineId, i.quantity, i.total, i.status]), [['11', 3, 300, '']]);
  assert.equal(o.total, 300, 'tutar ikiye katlanmaz');
  assert.deepEqual(o.packages.map((p) => p.remoteId).sort(), ['2', '3']);
  // Kısmi iptal: eski paket iptal, yeni paket kalan adetle (originPackageIds eski paketi gösterir)
  mockFetch([[/\/v2\/orders\?/, 'GET', { totalPages: 1, content: [
    pkg(5, 'Cancelled', [line(21, 2, 40), line(22, 1, 60)]),
    pkg(6, 'Created', [line(21, 1, 40), line(22, 1, 60)], { originPackageIds: '5', createdBy: 'cancel' }),
  ] }]]);
  const [p] = await ty().fetchOrders(Date.now() - D, Date.now());
  assert.equal(p.status, 'new');
  assert.deepEqual(p.items.map((i) => [i.lineId, i.quantity, i.status]), [['21', 1, ''], ['22', 1, '']]);
  assert.equal(p.total, 100);
  // İptal paketi bozulan paket değilse: aynı satırın iptal edilen kısmı ayrı kalem, tutardan düşülür
  mockFetch([[/\/v2\/orders\?/, 'GET', { totalPages: 1, content: [pkg(7, 'Created', [line(31, 1, 40)]), pkg(8, 'Cancelled', [line(31, 1, 40)])] }]]);
  const [q] = await ty().fetchOrders(Date.now() - D, Date.now());
  assert.deepEqual(q.items.map((i) => [i.lineId, i.quantity, i.status]), [['31', 1, ''], ['31-cancelled', 1, 'cancelled']]);
  assert.equal(q.total, 40);
});

test('Trendyol: stok-fiyat toplu işleminde genel durum alanı yok — kalemler bitince sonuç tamamlanır; stok 20.000 ile sınırlı', async () => {
  let batch = { batchRequestId: 'b1', items: [], itemCount: 2 };
  const calls = mockFetch([[/price-and-inventory$/, 'POST', { batchRequestId: 'b1' }], [/batch-requests\/b1$/, 'GET', () => batch]]);
  const ch = ty();
  const { refs } = await ch.pushStock([{ remoteId: 'B1', stock: 50000 }, { remoteId: 'B2', stock: -3 }]);
  assert.deepEqual(JSON.parse(calls[0].body).items, [{ barcode: 'B1', quantity: 20000 }, { barcode: 'B2', quantity: 0 }]);
  assert.equal((await ch.pushStatus(refs[0])).done, false, 'kalem yoksa bekler');
  batch = { batchRequestId: 'b1', itemCount: 2, items: [{ requestItem: { barcode: 'B1', quantity: 20000 }, status: 'SUCCESS', failureReasons: [] }, { requestItem: { barcode: 'B2', quantity: 0 }, status: 'FAILED', failureReasons: ['Ürün kilitli'] }] };
  const r = await ch.pushStatus(refs[0]);
  assert.equal(r.done, true);
  assert.deepEqual(r.items.map((x) => [x.key, x.ok, x.error]), [['B1', true, ''], ['B2', false, 'Ürün kilitli']]);
  // Ürün oluşturma toplu işlemi genel durum verir: IN_PROGRESS beklenir
  batch = { status: 'IN_PROGRESS', items: [{ requestItem: { barcode: 'X' }, status: 'SUCCESS' }] };
  assert.equal((await ch.pushStatus('b1')).done, false);
});

test('Trendyol: iade talep kimliği claimId; ret talebi gerekçe / kalem / açıklama sorgu parametresiyle', async () => {
  const calls = mockFetch([[/\/claims\?/, 'GET', { totalPages: 1, content: [{ claimId: 'c-9', orderNumber: '900', claimDate: 1, items: [{ orderLine: { id: 1, price: 10 }, claimItems: [{ id: 'ci-1', claimItemStatus: { name: 'WaitingInAction' } }] }] }] }],
    [/\/claims\/c-9\/issue\?/, 'POST', {}]]);
  const ch = ty();
  const r = await ch.claims({ since: 1, until: 2 });
  assert.equal(r.items[0].remoteId, 'c-9');
  await ch.rejectClaim({ remote_id: 'c-9' }, r.items[0].lines, { reasonId: '451', text: 'Analize alınacak' });
  const q = new URL(calls.find((c) => /issue/.test(c.url)).url).searchParams;
  assert.deepEqual([q.get('claimIssueReasonId'), q.get('claimItemIdList'), q.get('description')], ['451', 'ci-1', 'Analize alınacak']);
});

test('Trendyol: ödeme bekleyen pakete işlem yok; fatura no ile Picking → Invoiced sırası; kargodaki pakete statü gönderilmez', async () => {
  const calls = mockFetch([[/shipment-packages\/\d+$/, 'PUT', {}]]);
  const ch = ty();
  const p = (id, st) => ({ remote_id: String(id), status: 'open', remote_status: st, items: [{ line_id: '11', qty: 1 }] });
  await assert.rejects(ch.pack({}, [p(1, 'Awaiting')], { invoiceNumber: 'F1' }), /ödeme onayını/);
  await assert.rejects(ch.ship({}, p(1, 'Awaiting'), { invoiceNumber: 'F1' }), /ödeme onayını/);
  assert.equal(calls.length, 0);
  await ch.ship({}, p(2, 'Created'), { invoiceNumber: 'F2' });
  assert.deepEqual(calls.map((c) => JSON.parse(c.body).status), ['Picking', 'Invoiced']);
  assert.deepEqual(JSON.parse(calls[1].body).params, { invoiceNumber: 'F2' });
  calls.length = 0;
  await ch.ship({}, p(3, 'Shipped'), { invoiceNumber: 'F3' });
  const r = await ch.pack({}, [p(4, 'Shipped')], { invoiceNumber: 'F4' });
  assert.equal(calls.length, 0);
  assert.equal(r.packages[0].remoteStatus, 'Shipped');
});

test('Trendyol: kargo değişikliği sonrası paket shipmentPackageId ile bulunur; User-Agent entegratör adını taşır', async () => {
  const calls = mockFetch([[/cargo-providers$/, 'PUT', {}], [/\/v2\/orders\?orderNumber=900/, 'GET', { content: [{ shipmentPackageId: 77, status: 'Created', cargoProviderName: 'Aras Kargo Marketplace', cargoTrackingNumber: 123 }] }]]);
  const r = await ty({ TRENDYOL_INTEGRATOR: 'Has Türk!' }).changeCargo({ remote_id: '900' }, { remote_id: '77', remote_status: 'Created' }, { id: 'ARASMP', name: 'Aras Kargo' });
  assert.equal(r.tracking, '123');
  assert.equal(r.cargoCompany, 'Aras Kargo Marketplace');
  assert.equal(calls[0].headers['User-Agent'], '42 - HasTrk');
  mockFetch([]);
  const calls2 = mockFetch([[/cargo-providers$/, 'PUT', {}]]);
  await ty().changeCargo({ remote_id: '900' }, { remote_id: '77', remote_status: 'Created' }, { id: 'ARASMP', name: 'Aras Kargo' });
  assert.equal(calls2[0].headers['User-Agent'], '42 - SelfIntegration');
});
