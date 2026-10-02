// Kanal bağlantıları: örnek API cevaplarıyla (ağa çıkmadan) siparişlerin doğru okunduğunu ve isteklerin doğru adrese gittiğini dener.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyol } from '../src/channels/trendyol.js';
import { hepsiburada } from '../src/channels/hepsiburada.js';
import { ikas } from '../src/channels/ikas.js';

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    const hit = routes.find(([re]) => re.test(String(url)));
    const body = hit ? (typeof hit[1] === 'function' ? hit[1](url, opts) : hit[1]) : { message: 'yok' };
    return new Response(JSON.stringify(body), { status: hit ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

test('Trendyol: aynı sipariş numaralı paketler tek siparişte birleşir, işleme al Picking gönderir', async () => {
  const pkg = (id, status, lines, tn) => ({ id, orderNumber: '900', orderDate: 1790000000000, status, customerFirstName: 'Ay', customerLastName: 'Şe', totalPrice: 150,
    shipmentAddress: { fullName: 'Ayşe K', fullAddress: 'Adres 1', city: 'İzmir', district: 'Bornova', phone: '05' }, cargoProviderName: 'Trendyol Express', cargoTrackingNumber: tn, lines });
  const calls = mockFetch([
    [/\/orders\?/, { totalPages: 1, content: [pkg(1, 'Created', [{ id: 11, quantity: 1, merchantSku: 'A', barcode: '111', productName: 'A', price: 100 }], 7001), pkg(2, 'Shipped', [{ id: 12, quantity: 1, merchantSku: 'B', barcode: '222', productName: 'B', price: 50 }], 7002)] }],
    [/shipment-packages\/1$/, {}],
  ]);
  const ch = trendyol({ TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
  const [o] = await ch.fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(o.orderNumber, '900');
  assert.equal(o.items.length, 2);
  assert.equal(o.status, 'new', 'en geride kalan paketin durumu');
  assert.equal(o.total, 300);
  assert.equal(o.packages.length, 2);
  assert.match(calls[0].url, /^https:\/\/apigw\.trendyol\.com\/integration\/order\/sellers\/42\/orders\?/);
  assert.equal(calls[0].headers['User-Agent'], '42 - SelfIntegration');
  await ch.accept({ packages: [{ remote_id: '1', status: 'open', remote_status: 'Created', items: [{ line_id: '11', qty: 1 }] }, { remote_id: '2', status: 'shipped', items: [] }] });
  const put = calls.find((c) => c.method === 'PUT');
  assert.match(put.url, /shipment-packages\/1$/);
  assert.deepEqual(JSON.parse(put.body), { lines: [{ lineId: 11, quantity: 1 }], params: {}, status: 'Picking' });
});

test('Hepsiburada: açık satırlar ve paketler birleşir; paket oluşturma lineItemRequests gönderir', async () => {
  const calls = mockFetch([
    [/\/orders\/merchantid\/M1\?/, { items: [{ id: 'L1', orderNumber: '500', orderDate: '2026-10-01T10:00:00', quantity: 2, merchantSku: 'A', sku: 'HBV1', productName: 'A', totalPrice: { amount: 200 }, customerName: 'Can', shippingAddress: { address: 'Adr', city: 'Bursa', district: 'Nilüfer' } }] }],
    [/\/packages\/merchantid\/M1\?/, []],
    [/\/packages\/merchantid\/M1$/, { packageNumber: 'P77' }],
    [/shipped|delivered|cancelled/, []],
  ]);
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x' }, { id: 'hepsiburada' });
  const [o] = await ch.fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(o.orderNumber, '500');
  assert.equal(o.items[0].unitPrice, 100);
  assert.equal(o.items[0].remoteKey, 'HBV1');
  assert.equal(o.address.city, 'Bursa');
  const r = await ch.split(o, [{ items: [{ line_id: 'L1', qty: 1 }] }, { items: [{ line_id: 'L1', qty: 1 }] }]);
  assert.equal(r.packages.length, 2);
  assert.equal(r.packages[0].remoteId, 'P77');
  const post = calls.filter((c) => c.method === 'POST');
  assert.deepEqual(JSON.parse(post[0].body), { lineItemRequests: [{ id: 'L1', quantity: 1 }], parcelQuantity: 1, deci: 1 });
});

test('ikas: token alınır, sipariş okunur, stok saveVariantStocks ile gönderilir', async () => {
  const gqlBodies = [];
  mockFetch([
    [/oauth\/token/, { access_token: 'T', expires_in: 3600 }],
    [/graphql/, (url, opts) => {
      const b = JSON.parse(opts.body); gqlBodies.push(b);
      if (/listOrder/.test(b.query)) return { data: { listOrder: { hasNext: false, data: [{ id: 'o1', orderNumber: 1001, orderedAt: 1790000000000, status: 'CREATED', orderPackageStatus: 'UNFULFILLED', totalFinalPrice: 90, currencyCode: 'TRY',
        shippingAddress: { firstName: 'Ali', lastName: 'V', addressLine1: 'Sk', city: { name: 'Konya' }, district: { name: 'Selçuklu' } },
        orderLineItems: [{ id: 'li1', quantity: 3, price: 30, finalPrice: 30, variant: { id: 'v1', productId: 'p1', sku: 'A', name: 'A', barcodeList: ['111'] } }], orderPackages: [] }] } } };
      if (/listStockLocation/.test(b.query)) return { data: { listStockLocation: [{ id: 'loc1', name: 'Depo' }] } };
      return { data: { saveVariantStocks: true } };
    }],
  ]);
  const ch = ikas({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' }, 'IKAS1_', { id: 'ikas1' });
  const [o] = await ch.fetchOrders(0, Date.now());
  assert.equal(o.orderNumber, '1001');
  assert.equal(o.items[0].total, 90);
  assert.equal(o.status, 'new');
  await ch.pushStock([{ remoteId: 'v1', remoteProductId: 'p1', stock: 7 }]);
  const save = gqlBodies.find((b) => /saveVariantStocks/.test(b.query));
  assert.deepEqual(save.variables.input.productStockLocationInputs, [{ productId: 'p1', variantId: 'v1', stockLocationId: 'loc1', stockCount: 7 }]);
});
