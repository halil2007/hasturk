// Boyner bağlantısı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boyner, BOYNER_BASE } from '../src/channels/boyner.js';

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body && JSON.parse(opts.body), headers: opts.headers || {} });
    const hit = routes.find(([m, re]) => (!m || m === (opts.method || 'GET')) && re.test(String(url)));
    const body = hit ? (typeof hit[2] === 'function' ? hit[2](String(url), opts) : hit[2]) : { message: 'yok' };
    return new Response(JSON.stringify(body ?? {}), { status: hit ? (hit[3] || 200) : 404, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const ENV = { BOYNER_SELLER_ID: '555', BOYNER_API_KEY: 'key', BOYNER_API_SECRET: 'sec' };
const pkg = (o = {}) => ({ id: 9001, orderNumber: 'B-100', orderDate: Date.parse('2026-10-01T09:00:00Z'), status: 'Created', totalPrice: 300, currencyCode: 'TRY',
  customerFirstName: 'Ayşe', customerLastName: 'Kaya', customerEmail: 'a@b.c', customerId: 77, cargoProviderName: 'Yurtiçi Kargo', cargoTrackingNumber: '',
  agreedDeliveryDate: Date.parse('2026-10-03T09:00:00Z'),
  shipmentAddress: { firstName: 'Ayşe', lastName: 'Kaya', fullAddress: 'Bağdat Cd. 10', district: 'Kadıköy', city: 'İstanbul', phone: '0555' },
  lines: [{ id: 1, merchantSku: 'TS-1', barcode: '8690001', productName: 'Tişört', quantity: 2, price: 150, orderLineItemStatusName: 'Created' }], ...o });

test('Boyner: kök adres, Basic kimlik, User-Agent, sipariş normalleştirme', async () => {
  const calls = mockFetch([['GET', /\/suppliers\/555\/orders\?/, { totalPages: 1, totalElements: 1, content: [pkg()] }]]);
  const ch = boyner(ENV, { id: 'boyner' });
  assert.equal(ch.enabled, true); assert.equal(ch.type, 'boyner');
  assert.equal(ch.caps.accept, 'remote'); assert.equal(ch.caps.ship, 'remote'); assert.equal(ch.caps.manualTracking, true);
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-02T00:00:00Z');
  const [o] = await ch.fetchOrders(since, until);
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, BOYNER_BASE + '/suppliers/555/orders');
  assert.equal(calls[0].headers.Authorization, 'Basic ' + btoa('key:sec'));
  assert.equal(calls[0].headers['User-Agent'], '555 - SelfIntegration');
  assert.equal(u.searchParams.get('startDate'), String(since)); assert.equal(u.searchParams.get('endDate'), String(until));
  assert.equal(u.searchParams.get('orderByField'), 'PackageLastModifiedDate');
  assert.equal(o.remoteId, 'B-100'); assert.equal(o.orderNumber, 'B-100'); assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, 'Created');
  assert.equal(o.orderedAt, Date.parse('2026-10-01T09:00:00Z')); assert.equal(o.shipBy, Date.parse('2026-10-03T09:00:00Z'));
  assert.equal(o.customer, 'Ayşe Kaya'); assert.equal(o.email, 'a@b.c'); assert.equal(o.customerId, '77'); assert.equal(o.phone, '0555');
  assert.deepEqual(o.address, { name: 'Ayşe Kaya', line: 'Bağdat Cd. 10', district: 'Kadıköy', city: 'İstanbul', phone: '0555' });
  assert.equal(o.total, 300); assert.equal(o.currency, 'TRY'); assert.equal(o.cargoCompany, 'Yurtiçi Kargo'); assert.equal(o.packages, null);
  assert.deepEqual(o.items[0], { lineId: '1', sku: 'TS-1', barcode: '8690001', name: 'Tişört', image: '', quantity: 2, unitPrice: 150, total: 300, status: '', remoteKey: '8690001' });

  await ch.fetchOrders(since, until, { byOrdered: true });
  assert.equal(new URL(calls[1].url).searchParams.get('orderByField'), 'CreatedDate');

  // Entegratör adı ve özel adres
  const c2 = mockFetch([['GET', /orders/, { content: [] }]]);
  await boyner({ ...ENV, BOYNER_URL: 'https://x.boyner.com.tr/sapigw/', BOYNER_INTEGRATOR: 'Has Türk!' }, {}).fetchOrders(since, until);
  assert.ok(c2[0].url.startsWith('https://x.boyner.com.tr/sapigw/suppliers/555/orders?'));
  assert.equal(c2[0].headers['User-Agent'], '555 - HasTrk');
});

test('Boyner: durum eşlemesi, paket birleştirme, iptal satırı, sayfalama ve 14 günlük dilim', async () => {
  const pages = [];
  mockFetch([['GET', /orders\?/, (url) => {
    const q = new URL(url).searchParams; pages.push([q.get('page'), q.get('startDate')]);
    if (q.get('page') === '0') return { totalPages: 2, content: [
      pkg({ orderNumber: 'A', status: 'Picking' }), pkg({ orderNumber: 'B', status: 'Shipped', cargoTrackingNumber: 'TR1' }), pkg({ orderNumber: 'C', status: 'Delivered' }),
      pkg({ orderNumber: 'D', status: 'Cancelled' }), pkg({ orderNumber: 'E', status: 'Returned' }),
      pkg({ orderNumber: 'F', id: 1, status: 'Shipped' }), pkg({ orderNumber: 'F', id: 2, status: 'Cancelled', totalPrice: 50, lines: [{ id: 2, barcode: 'X', quantity: 1, price: 50 }] }),
    ] };
    return { totalPages: 2, content: [pkg({ orderNumber: 'G', status: 'UnSupplied' })] };
  }]]);
  const ch = boyner(ENV, {});
  const now = Date.now();
  const list = await ch.fetchOrders(now - 3 * 864e5, now);
  assert.deepEqual(pages.map((p) => p[0]), ['0', '1']);
  const by = Object.fromEntries(list.map((o) => [o.remoteId, o]));
  assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'G'].map((k) => by[k].status), ['processing', 'shipped', 'delivered', 'cancelled', 'returned', 'cancelled']);
  assert.equal(by.B.tracking, 'TR1');
  assert.equal(by.F.status, 'shipped'); assert.equal(by.F.total, 300); assert.equal(by.F.items.length, 2); assert.equal(by.F.items[1].status, 'cancelled');

  // 30 günlük aralık → 3 dilim (14 + 14 + 2 gün)
  const starts = [];
  mockFetch([['GET', /orders\?/, (url) => { starts.push(Number(new URL(url).searchParams.get('startDate'))); return { content: [] }; }]]);
  await ch.fetchOrders(now - 30 * 864e5, now);
  assert.equal(starts.length, 3); assert.equal(starts[2], now - 30 * 864e5);
});

test('Boyner: ürünler → ilanlar, stok/fiyat gövdeleri', async () => {
  const calls = mockFetch([
    ['GET', /\/products\?/, (url) => (new URL(url).searchParams.get('page') === '0'
      ? { totalPages: 2, content: [{ barcode: '8690001', stockCode: 'TS-1', productMainId: 'M1', title: 'Tişört', salePrice: 90, listPrice: 120, quantity: 4, images: [{ url: 'https://i/1.jpg' }], approved: true, onSale: true, color: 'Kırmızı', size: 'M' }] }
      : { totalPages: 2, content: [{ barcode: '8690002', title: 'Etek', salePrice: 50, quantity: 0, approved: true, archived: true }, { title: 'barkodsuz' }] })],
    ['POST', /price-and-inventory/, { batchRequestId: 'BR-1' }],
  ]);
  const ch = boyner(ENV, {});
  const l = await ch.fetchListings();
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { remoteId: '8690001', remoteProductId: 'M1', sku: 'TS-1', barcode: '8690001', name: 'Tişört', groupName: 'Tişört', variantName: 'Kırmızı / M',
    image: 'https://i/1.jpg', images: ['https://i/1.jpg'], price: 90, listPrice: 120, stock: 4, active: true });
  assert.equal(l[1].active, false); assert.equal(l[1].listPrice, 50);

  const r = await ch.pushStock([{ remoteId: '8690001', stock: 3.6 }, { remoteId: '8690002', stock: -2 }]);
  assert.deepEqual(r, { refs: ['BR-1'] });
  const post = calls.filter((c) => c.method === 'POST');
  assert.ok(post[0].url.endsWith('/suppliers/555/products/price-and-inventory'));
  assert.deepEqual(post[0].body, { items: [{ barcode: '8690001', quantity: 4 }, { barcode: '8690002', quantity: 0 }] });
  await ch.pushPrice([{ remoteId: '8690001', price: 80, listPrice: 70 }]);
  assert.deepEqual(calls.at(-1).body, { items: [{ barcode: '8690001', salePrice: 80, listPrice: 80 }] });

  // 1000'erli bölme
  await ch.pushStock(Array.from({ length: 1500 }, (_, i) => ({ remoteId: 'b' + i, stock: 1 })));
  const big = calls.filter((c) => c.method === 'POST').slice(-2);
  assert.deepEqual(big.map((c) => c.body.items.length), [1000, 500]);
});

test('Boyner: işleme al (Picking) ve kargoya ver (Invoiced + takip no)', async () => {
  let state = 'Created';
  const calls = mockFetch([
    ['GET', /orders\?orderNumber=B-100/, () => ({ content: [pkg({ status: state }), pkg({ id: 9002, status: 'Cancelled' })] })],
    ['PUT', /shipment-packages|update-tracking-number/, {}],
  ]);
  const ch = boyner(ENV, {});
  const order = { remote_id: 'B-100', remote_status: 'Created', items: [{ line_id: '1', status: '' }] };
  await ch.accept(order);
  let puts = calls.filter((c) => c.method === 'PUT');
  assert.equal(puts.length, 1);
  assert.ok(puts[0].url.endsWith('/suppliers/555/shipment-packages/9001'));
  assert.deepEqual(puts[0].body, { lines: [{ lineId: 1, quantity: 2 }], params: {}, status: 'Picking' });

  state = 'Picking';
  const res = await ch.ship(order, { id: 1 }, { cargoCompany: 'Aras Kargo', tracking: 'AR123', invoiceNumber: 'FT1' });
  puts = calls.filter((c) => c.method === 'PUT').slice(1);
  assert.equal(puts.length, 2);
  assert.deepEqual(puts[0].body, { lines: [{ lineId: 1, quantity: 2 }], params: { invoiceNumber: 'FT1' }, status: 'Invoiced' });
  assert.ok(puts[1].url.endsWith('/suppliers/555/9001/update-tracking-number'));
  assert.deepEqual(puts[1].body, { trackingNumber: 'AR123' });
  assert.equal(res.tracking, 'AR123');

  // Zaten kargoda: işlem yapılmaz; tümü iptal siparişte işleme alma çağrısı yok
  state = 'Shipped';
  const n = calls.length;
  await ch.ship(order, { id: 1 }, {});
  assert.equal(calls.filter((c, i) => i >= n && c.method === 'PUT').length, 0);
  await ch.accept({ remote_id: 'B-100', items: [{ line_id: '1', status: 'cancelled' }] });
  assert.equal(calls.length, n + 1);
});

test('Boyner: eksik alanlar, HTTP hatası ve tanılama', async () => {
  const ch0 = boyner({ BOYNER_SELLER_ID: '1' }, {});
  assert.equal(ch0.enabled, false); assert.deepEqual(ch0.missing, ['BOYNER_API_KEY', 'BOYNER_API_SECRET']);

  mockFetch([['GET', /orders/, { message: 'Unauthorized' }, 401]]);
  const ch = boyner(ENV, {});
  await assert.rejects(ch.fetchOrders(Date.now() - 864e5, Date.now()), /HTTP 401 Unauthorized/);
  mockFetch([['GET', /orders\?orderNumber/, { content: [] }]]);
  await assert.rejects(ch.ship({ remote_id: 'Z' }, {}, {}), /açık paketi bulunamadı/);

  mockFetch([['GET', /orders\?orderNumber/, { content: [pkg({ status: 'Picking' })] }], ['GET', /orders\?/, { totalElements: 3, content: [] }], ['GET', /products/, { message: 'Forbidden' }, 403]]);
  const steps = await ch.diagnose({ orderId: 'B-100' });
  assert.equal(steps[0].ok, true); assert.match(steps[0].detail, /3 paket/);
  assert.equal(steps[1].ok, false); assert.match(steps[1].detail, /yetki yok/);
  assert.equal(steps[2].ok, true); assert.match(steps[2].detail, /Picking → processing/);
});
