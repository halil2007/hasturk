// Trendyol Go (Hızlı Market) bağlantısı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyolgo, TGO_BASE, TGO_STAGE } from '../src/channels/trendyolgo.js';

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} });
    const hit = routes.find(([m, re]) => (!m || m === (opts.method || 'GET')) && re.test(String(url)));
    let body = hit ? (typeof hit[2] === 'function' ? hit[2](String(url), opts) : hit[2]) : { message: 'yok' };
    let status = hit ? 200 : 404;
    if (body && body.__status) { status = body.__status; body = body.body; }
    return new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const ENV = { TRENDYOLGO_SUPPLIER_ID: '123456', TRENDYOLGO_API_KEY: 'k', TRENDYOLGO_API_SECRET: 's', TRENDYOLGO_STORE_ID: '164' };
const pkg = (o = {}) => ({
  id: 'pk-a', supplierId: 123456, storeId: 164, orderId: 'OID-1', orderNumber: '1221047877', packageCreationDate: 1759309200000, packageModificationDate: 1759309300000,
  totalPrice: 95.5, deliveryType: 'GO', packageStatus: 'Created', callCenterPhone: '0212 365 34 03',
  customer: { id: 25039720, firstName: 'Ali', lastName: 'Y' },
  address: { firstName: 'Ali', lastName: 'Y', address1: 'Cumhuriyet Mah. Selimiye Cd.', address2: 'On Kasım Sk.', city: 'İstanbul', district: 'Adalar', neighborhood: 'Burgazada Mah', apartmentNumber: '9', floor: '2', doorNumber: '2', postalCode: '34000', phone: '0212 365 34 03' },
  lines: [
    { barcode: '8690001', productName: 'Süt 1L', price: 30, items: [{ packageItemId: 'pi-1', lineItemId: 11, isCancelled: false }, { packageItemId: 'pi-2', lineItemId: 11, isCancelled: false }] },
    { barcode: '8690002', productName: 'Ekmek', price: 10, items: [{ packageItemId: 'pi-3', lineItemId: 12, isCancelled: true }] },
    { barcode: '8690003', productName: 'Peynir', price: 25.5, quantity: 1 },
  ], ...o });
const b64 = (s) => Buffer.from(s).toString('base64');

test('Trendyol Go: Basic + User-Agent, paket çekme, normalleştirme', async () => {
  const calls = mockFetch([[ 'GET', /\/order\/grocery\/suppliers\/123456\/packages\?/, { page: 0, size: 50, totalPages: 1, totalCount: 1, content: [pkg()] } ]]);
  const ch = trendyolgo({ ...ENV, TRENDYOLGO_INTEGRATOR: 'Has Türk-Panel' }, { id: 'trendyolgo' });
  assert.equal(ch.enabled, true);
  assert.deepEqual(ch.caps, { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: false, courier: 'platform' });
  const [o] = await ch.fetchOrders(1759300000000, 1759310000000);
  const c = calls[0], u = new URL(c.url);
  assert.equal(u.origin + u.pathname, TGO_BASE + '/order/grocery/suppliers/123456/packages');
  assert.equal(c.headers.Authorization, 'Basic ' + b64('k:s'));
  assert.equal(c.headers['User-Agent'], '123456 - HasTrkPanel');
  assert.equal(u.searchParams.get('storeId'), '164');
  assert.deepEqual(u.searchParams.getAll('status'), ['Created', 'Picking', 'Invoiced', 'Shipped', 'Delivered', 'Cancelled', 'UnSupplied', 'Returned']);
  assert.equal(u.searchParams.get('packageModificationStartDate'), '1759300000000');
  assert.equal(u.searchParams.get('packageModificationEndDate'), '1759310000000');
  assert.equal(u.searchParams.get('page'), '0'); assert.equal(u.searchParams.get('size'), '50');

  assert.equal(o.remoteId, '1221047877'); assert.equal(o.orderNumber, '1221047877');
  assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, 'Created');
  assert.equal(o.orderedAt, 1759309200000); assert.equal(o.total, 95.5); assert.equal(o.currency, 'TRY');
  assert.equal(o.customer, 'Ali Y'); assert.equal(o.customerId, '25039720'); assert.equal(o.tracking, ''); assert.equal(o.cargoCompany, 'Trendyol Go kuryesi');
  assert.deepEqual(o.address, { name: 'Ali Y', line: 'Cumhuriyet Mah. Selimiye Cd. On Kasım Sk. Burgazada Mah No 9 Kat 2 Daire 2 34000', district: 'Adalar', city: 'İstanbul', phone: '0212 365 34 03' });
  assert.deepEqual(o.items[0], { lineId: '11', sku: '8690001', barcode: '8690001', name: 'Süt 1L', image: '', quantity: 2, unitPrice: 30, total: 60, status: '', remoteKey: '8690001' });
  assert.equal(o.items[1].status, 'cancelled', 'tüm birimleri iptal satır');
  assert.equal(o.items[2].quantity, 1); assert.equal(o.items[2].total, 25.5);
  assert.equal(o.packages, null);
});

test('Trendyol Go: durum eşlemesi, tedarik edememe sonrası yeni paket, Model 2 adres maskesi, sayfalama', async () => {
  const pagesSeen = [];
  const st = ['Picking', 'Invoiced', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
  mockFetch([[ 'GET', /\/packages\?/, (url) => {
    const p = Number(new URL(url).searchParams.get('page')); pagesSeen.push(p);
    if (p === 0) return { totalPages: 2, content: [
      ...Array.from({ length: 48 }, (_, i) => pkg({ id: 'x' + i, orderNumber: 'N' + i, packageStatus: st[i % st.length] })),
      pkg({ id: 'old', orderNumber: 'U1', packageStatus: 'UnSupplied', packageCreationDate: 1000 }),
      pkg({ id: 'new', orderNumber: 'U1', packageStatus: 'Picking', packageCreationDate: 2000, totalPrice: 40, lines: [{ barcode: 'B', productName: 'X', price: 40, quantity: 1 }] }),
    ] };
    return { totalPages: 2, content: [pkg({ id: 'z', orderNumber: 'Z', address: { firstName: 'A', lastName: 'B', address1: 'Trendyol Yemek', city: 'Trendyol Yemek', district: 'Trendyol Yemek', phone: '0212' } })] };
  } ]]);
  const ch = trendyolgo(ENV, { id: 'trendyolgo' });
  const list = await ch.fetchOrders(0, Date.now());
  assert.deepEqual(pagesSeen, [0, 1]);
  assert.equal(list.length, 50);
  assert.deepEqual(list.slice(0, 6).map((o) => o.status), ['processing', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']);
  assert.equal(list[4].items.every((i) => i.status === 'cancelled'), true);
  const u1 = list.find((o) => o.remoteId === 'U1');
  assert.equal(u1.remoteStatus, 'Picking'); assert.equal(u1.total, 40); assert.equal(u1.items.length, 1);
  const z = list.find((o) => o.remoteId === 'Z');
  assert.equal(z.address.line, ''); assert.equal(z.address.city, ''); assert.equal(z.address.district, '');
});

test('Trendyol Go: işleme al (picked, gövdesiz) ve hazırlandı (invoice-amount + invoiced)', async () => {
  let cur = pkg();
  const calls = mockFetch([
    [ 'GET', /\/packages\/order-number\/1221047877$/, () => ({ content: [pkg({ id: 'pk-old', packageStatus: 'UnSupplied', packageCreationDate: 1 }), cur] }) ],
    [ 'PUT', /\/packages\/pk-a\/picked$/, () => { cur = { ...cur, packageStatus: 'Picking' }; return {}; } ],
    [ 'GET', /\/orders\/OID-1\/invoice-amount$/, { minInvoiceAmount: 50, maxInvoiceAmount: 80 } ],
    [ 'PUT', /\/packages\/pk-a\/invoiced$/, {} ],
  ]);
  const ch = trendyolgo(ENV, { id: 'trendyolgo' });
  const order = { remote_id: '1221047877', items: [{ line_id: '11', total: 60, quantity: 2, status: '' }, { line_id: '13', total: 25.5, quantity: 1, status: '' }, { line_id: '12', total: 10, status: 'cancelled' }] };
  await ch.accept(order);
  const picked = calls.find((c) => c.method === 'PUT');
  assert.equal(new URL(picked.url).pathname, '/integrator/order/grocery/suppliers/123456/packages/pk-a/picked');
  assert.equal(picked.body, undefined, 'gövdesiz');
  // tekrar işleme al: paket Picking → istek yok
  await ch.accept(order);
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1);

  const r = await ch.ship(order, { id: 1 }, {});
  assert.deepEqual(r, { tracking: '' });
  const inv = calls.at(-1);
  assert.equal(new URL(inv.url).pathname, '/integrator/order/grocery/suppliers/123456/packages/pk-a/invoiced');
  assert.equal(inv.headers['Content-Type'], 'application/json');
  // canlı satırlar 85.5 → provizyon üst sınırı 80
  assert.deepEqual(JSON.parse(inv.body), { invoiceAmount: 80, bagCount: null, receiptLink: null, invoiceTaxAmount: 0 });
  assert.ok(calls.findIndex((c) => /invoice-amount/.test(c.url)) < calls.length - 1, 'provizyon aralığı önce okunur');

  // zaten Invoiced: istek yok; iptal: hata
  const n = calls.length;
  cur = { ...cur, packageStatus: 'Invoiced' };
  assert.deepEqual(await ch.ship(order, { id: 1 }, {}), {});
  assert.equal(calls.filter((c) => c.method === 'PUT').length, calls.slice(0, n).filter((c) => c.method === 'PUT').length);
  cur = { ...cur, packageStatus: 'Cancelled' };
  await assert.rejects(ch.ship(order, { id: 1 }, {}), /Trendyol Go: paket/);
});

test('Trendyol Go: Created paket hazırlanırken önce picked; ürünler ve stok / fiyat gövdeleri; stage adresi', async () => {
  const calls = mockFetch([
    [ 'GET', /\/packages\/order-number\//, [pkg({ orderId: null })] ],
    [ 'PUT', /\/picked$/, {} ], [ 'PUT', /\/invoiced$/, {} ],
    [ 'GET', /\/product\/grocery\/suppliers\/123456\/stores\/164\/products\?/, { totalPages: 1, content: [
      { barcode: '8690001', productMainId: 'M1', title: 'Süt 1L', images: [{ url: 'https://img/1.jpg' }], salePrice: 30, listPrice: 35, quantity: 12, onSale: true },
      { barcode: '8690002', title: 'Ekmek', salePrice: 10, quantity: 0, onSale: false },
    ] } ],
    [ 'POST', /\/products\/price-and-inventory$/, { batchRequestId: 'b-1' } ],
  ]);
  const ch = trendyolgo({ ...ENV, TRENDYOLGO_ENV: 'stage' }, { id: 'trendyolgo' });
  await ch.ship({ remote_id: '1221047877', items: [] }, { id: 1 }, {});
  assert.deepEqual(calls.filter((c) => c.method === 'PUT').map((c) => c.url.split('/').pop()), ['picked', 'invoiced']);
  assert.equal(JSON.parse(calls.at(-1).body).invoiceAmount, 95.5, 'kalem yoksa paket tutarı');
  assert.ok(calls.every((c) => c.url.startsWith(TGO_STAGE)));

  const l = await ch.fetchListings();
  assert.deepEqual(l[0], { remoteId: '8690001', remoteProductId: 'M1', sku: '8690001', barcode: '8690001', name: 'Süt 1L', groupName: 'Süt 1L', variantName: '', image: 'https://img/1.jpg', images: ['https://img/1.jpg'], price: 30, listPrice: 35, stock: 12, active: true });
  assert.equal(l[1].active, false); assert.equal(l[1].listPrice, 10);

  const r = await ch.pushStock([{ remoteId: '8690001', stock: 5.6 }, { barcode: '8690002', stock: -1 }]);
  assert.deepEqual(r, { batchRequestIds: ['b-1'] });
  assert.deepEqual(JSON.parse(calls.at(-1).body), { items: [{ barcode: '8690001', storeId: 164, quantity: 6 }, { barcode: '8690002', storeId: 164, quantity: 0 }] });
  await ch.pushPrice([{ remoteId: '8690001', price: 29.999, listPrice: 20 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { items: [{ barcode: '8690001', storeId: 164, salePrice: 30, listPrice: 30 }] });
  await assert.rejects(ch.pushPrice([{ remoteId: 'x', price: 0 }]), /satış fiyatı yok/);
});

test('Trendyol Go: eksik bilgi, 401 hatası ve tanılama', async () => {
  const ch0 = trendyolgo({ TRENDYOLGO_SUPPLIER_ID: '1' }, { id: 'trendyolgo' });
  assert.equal(ch0.enabled, false);
  assert.deepEqual(ch0.missing, ['TRENDYOLGO_API_KEY', 'TRENDYOLGO_API_SECRET', 'TRENDYOLGO_STORE_ID']);
  mockFetch([
    [ 'GET', /\/store-listing$/, [{ id: 164, name: 'Kadıköy' }, { id: 165, name: 'Moda' }] ],
    [ 'GET', /\/packages\?/, { __status: 401, body: { exception: 'ClientApiAuthenticationException', message: 'unauthorized' } } ],
  ]);
  const ch = trendyolgo(ENV, { id: 'trendyolgo' });
  await assert.rejects(ch.fetchOrders(0, 1), /HTTP 401/);
  const steps = await ch.diagnose({});
  assert.equal(steps[0].ok, true); assert.match(steps[0].detail, /2 şube.*Kadıköy \(164\).*seçili şube 164 bulundu/);
  assert.equal(steps[1].ok, false); assert.match(steps[1].detail, /kimlik doğrulanamadı/);
});
