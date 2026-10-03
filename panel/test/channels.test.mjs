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

test('ikas: token alınır, sipariş okunur, stok saveProductStockLocations ile gönderilir', async () => {
  const gqlBodies = [];
  mockFetch([
    [/oauth\/token/, { access_token: 'T', expires_in: 3600 }],
    [/graphql/, (url, opts) => {
      const b = JSON.parse(opts.body); gqlBodies.push(b);
      if (/listOrder/.test(b.query)) return { data: { listOrder: { hasNext: false, data: [{ id: 'o1', orderNumber: 1001, orderedAt: 1790000000000, status: 'CREATED', orderPackageStatus: 'UNFULFILLED', totalFinalPrice: 90, currencyCode: 'TRY',
        shippingAddress: { firstName: 'Ali', lastName: 'V', addressLine1: 'Sk', city: { name: 'Konya' }, district: { name: 'Selçuklu' } },
        orderLineItems: [{ id: 'li1', quantity: 3, price: 30, finalPrice: 30, variant: { id: 'v1', productId: 'p1', sku: 'A', name: 'A', barcodeList: ['111'] } }], orderPackages: [] }] } } };
      if (/listStockLocation/.test(b.query)) return { data: { listStockLocation: [{ id: 'loc1', name: 'Depo' }] } };
      return { data: { saveProductStockLocations: true } };
    }],
  ]);
  const ch = ikas({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' }, 'IKAS1_', { id: 'ikas1' });
  const [o] = await ch.fetchOrders(0, Date.now());
  assert.equal(o.orderNumber, '1001');
  assert.equal(o.items[0].total, 90);
  assert.equal(o.status, 'new');
  await ch.pushStock([{ remoteId: 'v1', remoteProductId: 'p1', stock: 7 }]);
  const save = gqlBodies.find((b) => /saveProductStockLocations/.test(b.query));
  assert.deepEqual(save.variables.input.productStockLocationInputs, [{ productId: 'p1', variantId: 'v1', stockLocationId: 'loc1', stockCount: 7 }]);
});

test('ikas Kargo: paketle "Kargoya Hazır" (FulFillOrderInput) gönderir, etiket görseli ve hata okunur, alan eksikse uyum sağlar', async () => {
  const bodies = [];
  let pkgState = { id: 'pk1', orderPackageFulfillStatus: 'READY_FOR_SHIPMENT', orderLineItemIds: ['li1'], trackingInfo: { barcode: '', trackingNumber: '' } };
  let schemaHasLabel = false; // önce eski şema: shippingLabelImage alanı yok
  mockFetch([
    [/oauth\/token/, { access_token: 'T', expires_in: 3600 }],
    [/graphql/, (url, opts) => {
      const b = JSON.parse(opts.body); bodies.push(b);
      if (!schemaHasLabel && /shippingLabelImage/.test(b.query)) return { errors: [{ message: 'Cannot query field "shippingLabelImage" on type "TrackingInfo".' }] };
      if (/listCargoCompany/.test(b.query)) return { data: { listCargoCompany: [{ id: 'c2', name: 'Yurtiçi Kargo' }, { id: 'c1', name: 'Aras Kargo' }] } };
      if (/fulfillOrder/.test(b.query)) return { data: { fulfillOrder: { id: 'o1', orderPackages: [pkgState] } } };
      if (/listOrder/.test(b.query)) return { data: { listOrder: { hasNext: false, data: [{ id: 'o1', orderNumber: 1001, orderedAt: 1, status: 'CREATED', orderLineItems: [], orderPackages: [pkgState] }] } } };
      if (/cancelFulfillment/.test(b.query)) return { data: { cancelFulfillment: { id: 'o1' } } };
      return { data: {} };
    }],
  ]);
  const ch = ikas({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' }, 'IKAS1_', { id: 'ikas1' });
  const opts = await ch.cargoOptions();
  assert.equal(opts[0].id, '', 'ilk seçenek: ikas Kargo önceliği');
  assert.deepEqual(opts.slice(1).map((x) => x.name), ['Aras Kargo', 'Yurtiçi Kargo']);
  const order = { remote_id: 'o1', order_number: '1001' };
  const pkg = { no: 1, items: [{ line_id: 'li1', qty: 2 }] };
  const r = await ch.pack(order, [pkg], { cargo: { id: 'c2', name: 'Yurtiçi Kargo' } });
  assert.equal(r.packages[0].remoteId, 'pk1');
  const ff = bodies.filter((b) => /fulfillOrder/.test(b.query)).pop();
  assert.match(ff.query, /\$input: FulFillOrderInput!/, 'ikas şemasındaki tip adı');
  assert.equal(ff.variables.input.markAsReadyForShipment, true);
  assert.deepEqual(ff.variables.input.lines, [{ orderLineItemId: 'li1', quantity: 2 }]);
  assert.deepEqual(ff.variables.input.trackingInfoDetail, { cargoCompanyId: 'c2', cargoCompany: 'Yurtiçi Kargo' });
  // Barkod henüz yok → bekleniyor
  assert.ok((await ch.label(order, { ...pkg, remote_id: 'pk1' })).pending);
  // Barkod geldi, etiket görseli yok → panel etiketi
  pkgState = { ...pkgState, trackingInfo: { barcode: '7300123', cargoCompany: 'Yurtiçi Kargo' } };
  const l1 = await ch.label(order, { ...pkg, remote_id: 'pk1' });
  assert.equal(l1.panel, true); assert.equal(l1.barcode, '7300123');
  // Yeni şema: etiket görseli (base64 PNG) okunur
  schemaHasLabel = true;
  const ch2 = ikas({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' }, 'IKAS1_', { id: 'ikas1' });
  pkgState = { ...pkgState, trackingInfo: { ...pkgState.trackingInfo, shippingLabelImage: 'iVBORw0KGgoAAAANSUhEUg' } };
  const l2 = await ch2.label(order, { ...pkg, remote_id: 'pk1' });
  assert.equal(l2.label.format, 'png');
  // ikas Kargo hatası (ör. telefon eksik) kullanıcıya iletilir
  pkgState = { ...pkgState, orderPackageFulfillStatus: 'ERROR', errorMessage: 'Alıcı telefon numarası eksik' };
  await assert.rejects(() => ch2.label(order, { ...pkg, remote_id: 'pk1' }), /telefon numarası eksik/);
  await ch2.cancelPackage(order, { remote_id: 'pk1' });
  assert.deepEqual(bodies.pop().variables.input, { orderId: 'o1', orderPackageId: 'pk1' });
});

test('Trendyol: kargo firması değiştirme ve ortak etiket', async () => {
  const calls = mockFetch([
    [/cargo-providers$/, {}],
    [/orders\?orderNumber=/, { content: [{ id: 5, cargoProviderName: 'Aras Kargo Marketplace', cargoTrackingNumber: '733' }] }],
    [/common-label\/733$/, (url, opts) => (opts.method === 'POST' ? {} : { data: [{ label: '^XA^FDtest^XZ' }] })],
  ]);
  const ch = trendyol({ TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
  const r = await ch.changeCargo({ remote_id: '900' }, { remote_id: '5', remote_status: 'Picking' }, { id: 'ARASMP', name: 'Aras Kargo' });
  assert.deepEqual(JSON.parse(calls[0].body), { cargoProvider: 'ARASMP' });
  assert.equal(r.tracking, '733');
  await assert.rejects(() => ch.changeCargo({ remote_id: '900' }, { remote_id: '5', remote_status: 'Shipped' }, { id: 'YKMP' }), /yalnızca/);
  const l = await ch.label({ order_number: '900' }, { tracking: '733', cargo_company: 'Aras Kargo' });
  assert.equal(l.label.format, 'zpl');
  assert.match(l.label.data, /\^XA/);
  const y = await ch.label({}, { tracking: '999', cargo_company: 'Yurtiçi Kargo' });
  assert.equal(y.panel, true, 'Yurtiçi için Trendyol ortak etiket vermez: takip barkodu panel etiketine basılır');
});

test('N11, idefix, Pazarama: siparişler okunur, işleme al doğru çağrıyı yapar', async () => {
  const { n11 } = await import('../src/channels/n11.js');
  const { idefix } = await import('../src/channels/idefix.js');
  const { pazarama } = await import('../src/channels/pazarama.js');
  let calls = mockFetch([[/shipmentPackages/, { totalPages: 1, content: [
    { id: 9, orderNumber: 'N1', shipmentPackageStatus: 'Created', customerfullName: 'Ece', shippingAddress: { city: 'Adana', district: 'Seyhan', address: 'A', gsm: '05' }, totalAmount: 50, agreedDeliveryDate: 1795000000000,
      packageHistories: [{ status: 'Created', createdDate: 1790000000000 }], lines: [{ orderLineId: 77, stockCode: 'S1', barcode: 'B1', productName: 'Ürün', quantity: 2, price: 25 }] }] }], [/order\/v1\/update/, {}]]);
  const n = n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n11' });
  const [o] = await n.fetchOrders(1789000000000, 1790500000000);
  assert.equal(o.orderNumber, 'N1'); assert.equal(o.items[0].total, 50); assert.equal(o.shipBy, 1795000000000); assert.equal(o.orderedAt, 1790000000000);
  assert.equal(calls[0].headers.appkey, 'k');
  await n.accept({ items: [{ line_id: '77', status: '' }] });
  assert.deepEqual(JSON.parse(calls.pop().body), { lines: [{ lineId: 77 }], status: 'Picking' });

  calls = mockFetch([[/\/oms\/V1\/list/, { items: [{ id: 'S9', orderNumber: 'I1', orderDate: '2026-10-01T10:00:00', status: 'created', shippingAddress: { city: 'Bursa', county: 'Osmangazi', fullName: 'Can' }, items: [{ id: 'it1', barcode: 'B2', merchantSku: 'S2', productName: 'X', quantity: 1, price: 40 }] }] }], [/update-shipment-status/, {}]]);
  const i = idefix({ IDEFIX_API_KEY: 'a', IDEFIX_API_SECRET: 'b', IDEFIX_VENDOR_ID: 'V1' }, { id: 'idefix' });
  const [io] = await i.fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(io.status, 'new'); assert.equal(io.address.district, 'Osmangazi');
  assert.equal(calls[0].headers['X-API-KEY'], btoa('a:b'));
  await i.accept({ packages: [{ remote_id: 'S9', status: 'open' }] });
  assert.deepEqual(JSON.parse(calls.pop().body), { status: 'picking' });

  calls = mockFetch([[/connect\/token/, { success: true, data: { accessToken: 'TT', expiresIn: 3600 } }],
    [/getOrdersForApi/, { success: true, data: [{ orderNumber: 555, orderDate: '2026-10-01T10:00:00', orderAmount: { value: 30 }, customerName: 'Deniz', shipmentAddress: { cityName: 'Mersin', districtName: 'Yenişehir' },
      items: [{ orderItemId: 'q1', orderItemStatus: 12, quantity: 1, totalPrice: { value: 30 }, product: { code: 'B3', stockCode: 'S3', name: 'Y' } }] }] }], [/updateOrderStatusList/, { success: true }]]);
  const pz = pazarama({ PAZARAMA_CLIENT_ID: 'c', PAZARAMA_CLIENT_SECRET: 'd' }, { id: 'pazarama' });
  const [po] = await pz.fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(po.status, 'processing'); assert.equal(po.total, 30); assert.equal(po.items[0].remoteKey, 'B3');
  assert.equal(calls[1].headers.Authorization, 'Bearer TT');
  await pz.accept({ remote_id: '555' });
  assert.deepEqual(JSON.parse(calls.pop().body), { orderNumber: 555, status: 12 });
});

test('ikas tanılama: izinler, eksik depo adresi, telefonsuz sipariş ve barkod üretilmemiş "Kargoya Hazır" paket açıklanır', async () => {
  mockFetch([
    [/oauth\/token/, { access_token: 'T', expires_in: 3600 }],
    [/graphql/, (url, opts) => {
      const q = JSON.parse(opts.body).query;
      if (/getAuthorizedApp/.test(q)) return { data: { getAuthorizedApp: { scope: 'read_orders,write_orders,read_products,write_products' } } };
      if (/getMerchant/.test(q)) return { data: { getMerchant: { id: 'm1' } } };
      if (/listStockLocation/.test(q)) return { data: { listStockLocation: [{ id: 'l1', name: 'Ana depo', address: { address: 'Sanayi', city: { name: 'Konya' } } }] } };
      if (/listCargoCompany/.test(q)) return { data: { listCargoCompany: [{ id: 'c1', name: 'Yurtiçi Kargo' }] } };
      if (/listShippingSettings/.test(q)) return { data: { listShippingSettings: [{ zoneName: 'Türkiye', zoneRate: [{ rateName: 'Standart', cargoCompanyId: 'c1', price: 0 }] }] } };
      if (/listOrder/.test(q)) return { data: { listOrder: { hasNext: false, data: [{ id: 'o1', orderNumber: 1001, status: 'CREATED', orderPackageStatus: 'READY_FOR_SHIPMENT', shippingAddress: {}, customer: {}, shippingLines: [{ title: 'Yurtiçi', cargoCompanyId: 'c1' }],
        orderLineItems: [], orderPackages: [{ id: 'p1', orderPackageNumber: '1001-1', orderPackageFulfillStatus: 'READY_FOR_SHIPMENT', orderLineItemIds: [], trackingInfo: {} }] }] } } };
      return { data: {} };
    }],
  ]);
  const ch = ikas({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' }, 'IKAS1_', { id: 'ikas1' });
  const r = await ch.diagnose({ orderId: 'o1' });
  const by = Object.fromEntries(r.map((x) => [x.name, x]));
  assert.equal(by['ikas bağlantısı (OAuth)'].ok, true);
  assert.equal(by['Uygulama izinleri'].ok, true);
  assert.equal(by['Depo / stok lokasyonu adresi'].ok, false, 'ilçe ve telefon eksik');
  assert.match(by['Kargo ayarları (bölgeler)'].detail, /Yurtiçi Kargo/);
  const o = by['Sipariş ve paketleri (ikas)'];
  assert.equal(o.ok, false);
  assert.match(o.detail, /Alıcı telefonu yok/);
  assert.match(o.detail, /ikas Kargo barkod üretmemiş/);
  assert.match(o.detail, /hiçbir kargo uygulaması işlememiş/);
});
