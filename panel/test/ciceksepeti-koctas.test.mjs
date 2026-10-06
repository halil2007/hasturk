// Çiçeksepeti ve Koçtaş (Mirakl) bağlantıları: örnek API cevaplarıyla (ağa çıkmadan) istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciceksepeti } from '../src/channels/ciceksepeti.js';
import { koctas } from '../src/channels/koctas.js';

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} });
    const hit = routes.find(([m, re]) => (!m || m === (opts.method || 'GET')) && re.test(String(url)));
    const body = hit ? (typeof hit[2] === 'function' ? hit[2](String(url), opts) : hit[2]) : { message: 'yok' };
    return new Response(JSON.stringify(body ?? {}), { status: hit ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const D = 864e5;

// ---------------- Çiçeksepeti ----------------
const csLine = (o) => ({ orderId: 5001, orderItemId: 1, orderCreateDate: '2026-10-01T10:00:00', receiverName: 'Ayşe Alıcı', receiverPhone: '0555', receiverAddress: 'Çiçek Sk. 1',
  receiverCity: 'İzmir', receiverDistrict: 'Bornova', senderName: 'Mehmet Gönderen', productCode: 'STK-A', code: 'CS123', barcode: '8690001', name: 'Orkide', quantity: 2, totalPrice: 300,
  orderProductStatus: 'Yeni', cargoCompany: '', cargoNumber: '', ...o });

test('Çiçeksepeti: kimlik başlığı, satırlar orderId ile birleşir, durum en geride kalan canlı satırdan', async () => {
  const calls = mockFetch([[ 'POST', /\/Order\/GetOrders$/, { orderListCount: 3, supplierOrderListWithBranch: [
    csLine(),
    csLine({ orderItemId: 2, productCode: 'STK-B', name: 'Gül', quantity: 1, totalPrice: 100, orderProductStatus: 'Kargoya Verildi', cargoCompany: 'Yurtiçi', cargoNumber: 'YT9' }),
    csLine({ orderItemId: 3, productCode: 'STK-C', quantity: 1, totalPrice: 50, orderProductStatus: 'İptal' }),
    csLine({ orderId: 5002, orderItemId: 9, orderProductStatus: 'Teslim Edildi', orderCreateDate: '01.10.2026 12:30' }),
  ] } ]]);
  const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'KEY' }, { id: 'ciceksepeti' });
  assert.equal(ch.enabled, true);
  assert.deepEqual(ch.caps, { accept: 'local', split: 'local', ship: 'local', label: null, createProduct: false, price: true });
  const orders = await ch.fetchOrders(Date.now() - D, Date.now());
  assert.equal(calls.length, 1, 'tek pencere, eksik sayfa → tek istek');
  assert.equal(calls[0].url, 'https://apis.ciceksepeti.com/api/v1/Order/GetOrders');
  assert.equal(calls[0].headers['x-api-key'], 'KEY');
  const b = JSON.parse(calls[0].body);
  assert.equal(b.pageSize, 100); assert.equal(b.page, 0);
  assert.ok(Date.parse(b.startDate) && Date.parse(b.endDate) > Date.parse(b.startDate));
  assert.equal(orders.length, 2);
  const o = orders.find((x) => x.remoteId === '5001');
  assert.equal(o.orderNumber, '5001');
  assert.equal(o.items.length, 3);
  assert.equal(o.status, 'new', 'en geride kalan canlı satır yeni');
  assert.equal(o.remoteStatus, 'Yeni, Kargoya Verildi, İptal');
  assert.equal(o.total, 400, 'iptal satır toplama girmez');
  assert.equal(o.items[0].unitPrice, 150);
  assert.equal(o.items[0].remoteKey, 'STK-A');
  assert.equal(o.items[2].status, 'cancelled');
  assert.equal(o.customer, 'Mehmet Gönderen');
  assert.deepEqual(o.address, { name: 'Ayşe Alıcı', line: 'Çiçek Sk. 1', district: 'Bornova', city: 'İzmir', phone: '0555' });
  assert.equal(o.tracking, 'YT9'); assert.equal(o.cargoCompany, 'Yurtiçi');
  assert.equal(o.orderedAt, Date.parse('2026-10-01T07:00:00Z'), 'saat dilimsiz tarih Türkiye saati');
  assert.equal(o.packages, null);
  const o2 = orders.find((x) => x.remoteId === '5002');
  assert.equal(o2.status, 'delivered');
  assert.equal(o2.orderedAt, Date.parse('2026-10-01T09:30:00Z'));
});

test('Çiçeksepeti: durum metinleri ve sayısal kodlar, tamamen iptal/iade', async () => {
  const row = (id, st, extra = {}) => csLine({ orderId: id, orderItemId: id, orderProductStatus: st, ...extra });
  mockFetch([[ 'POST', /GetOrders/, { supplierOrderListWithBranch: [row(1, 'Hazırlanıyor'), row(2, 'İade Edildi'), row(3, 'İptal Edildi'), row(4, 'Kargoda'), row(5, 'Teslim Edilemedi'),
    row(6, undefined, { orderProductStatus: undefined, orderItemStatusId: 2 }), row(7, 'Kargoya Hazır')] } ]]);
  const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' });
  const by = Object.fromEntries((await ch.fetchOrders(Date.now() - D, Date.now())).map((o) => [o.remoteId, o]));
  assert.equal(by[1].status, 'processing');
  assert.equal(by[2].status, 'returned'); assert.equal(by[2].items[0].status, 'cancelled');
  assert.equal(by[3].status, 'cancelled');
  assert.equal(by[4].status, 'shipped');
  assert.equal(by[5].status, 'shipped');
  assert.equal(by[6].status, 'processing'); assert.equal(by[6].remoteStatus, '2');
  assert.equal(by[7].status, 'processing');
});

test('Çiçeksepeti: 14 günlük pencereler ve sayfalama, sandbox adresi', async () => {
  const bodies = [];
  const calls = mockFetch([[ 'POST', /GetOrders/, (url, opts) => {
    const b = JSON.parse(opts.body); bodies.push(b);
    const n = b.page === 0 ? 100 : 5;
    return { orderListCount: 105, supplierOrderListWithBranch: Array.from({ length: n }, (_, i) => csLine({ orderId: `${b.startDate}-${b.page}-${i}`, orderItemId: i })) };
  } ]]);
  const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'K', CICEKSEPETI_TEST: '1' }, { id: 'cs' });
  const now = Date.now();
  const orders = await ch.fetchOrders(now - 20 * D, now);
  assert.match(calls[0].url, /^https:\/\/sandbox-apis\.ciceksepeti\.com\/api\/v1\/Order\/GetOrders$/);
  assert.equal(bodies.length, 4, '2 pencere × 2 sayfa');
  assert.deepEqual(bodies.map((b) => b.page), [0, 1, 0, 1]);
  for (const b of bodies) assert.ok(Date.parse(b.endDate) - Date.parse(b.startDate) <= 14 * D);
  assert.equal(Date.parse(bodies[3].startDate), now - 20 * D);
  assert.equal(orders.length, 210);
});

test('Çiçeksepeti: ürünler stockCode ile, varyant grubu ortak addan; stok ve fiyat 200lük parçalarla', async () => {
  const calls = mockFetch([
    [ 'GET', /\/Products\?PageSize=60&Page=1$/, { totalCount: 3, products: [
      { productName: 'Saksı Beyaz 20cm', productCode: 'CS1', stockCode: 'SK-B', barcode: '111', salesPrice: 90, listPrice: 120, stockQuantity: 4, images: ['https://img/1.jpg', 'https://img/2.jpg'], mainProductCode: 'M1', productStatusType: 'YAYINDA' },
      { productName: 'Saksı Siyah 20cm', productCode: 'CS2', stockCode: 'SK-S', barcode: '222', salesPrice: 90, listPrice: 0, stockQuantity: 0, images: [], mainProductCode: 'M1', productStatusType: 'PASIF' },
      { productName: 'Vazo', productCode: 'CS3', stockCode: 'VZ', barcode: '333', salesPrice: 50, stockQuantity: 2, images: [{ url: 'https://img/v.jpg' }], mainProductCode: 'M2' },
    ] } ],
    [ 'PUT', /\/Products\/price-and-stock$/, { batchId: 'b1' } ],
  ]);
  const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' });
  const l = await ch.fetchListings();
  assert.equal(calls.length, 1);
  assert.equal(l.length, 3);
  assert.deepEqual(l[0], { remoteId: 'SK-B', remoteProductId: 'CS1', sku: 'SK-B', barcode: '111', name: 'Saksı Beyaz 20cm', groupName: 'Saksı', variantName: 'Beyaz 20cm',
    image: 'https://img/1.jpg', images: ['https://img/1.jpg', 'https://img/2.jpg'], price: 90, listPrice: 120, stock: 4, active: true });
  assert.equal(l[1].active, false); assert.equal(l[1].listPrice, 90);
  assert.equal(l[2].groupName, 'Vazo'); assert.equal(l[2].variantName, ''); assert.equal(l[2].image, 'https://img/v.jpg');

  const many = Array.from({ length: 250 }, (_, i) => ({ remoteId: 'S' + i, stock: i === 0 ? -3 : 5 }));
  await ch.pushStock(many);
  const puts = calls.filter((c) => c.method === 'PUT');
  assert.equal(puts.length, 2);
  const p0 = JSON.parse(puts[0].body);
  assert.equal(p0.items.length, 200); assert.equal(JSON.parse(puts[1].body).items.length, 50);
  assert.deepEqual(p0.items[0], { stockCode: 'S0', stockQuantity: 0 });
  await ch.pushPrice([{ remoteId: 'SK-B', price: 95, listPrice: 80 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { items: [{ stockCode: 'SK-B', listPrice: 95, salesPrice: 95 }] });
});

test('Çiçeksepeti: eksik anahtar ve tanılama adımları', async () => {
  assert.deepEqual(ciceksepeti({}, { id: 'cs' }).missing, ['CICEKSEPETI_API_KEY']);
  mockFetch([[ 'POST', /GetOrders/, { orderListCount: 7, supplierOrderListWithBranch: [csLine({ orderProductStatus: 'Hazırlanıyor' })] } ], [ 'GET', /Products/, { totalCount: 42, products: [] } ]]);
  const steps = await ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' }).diagnose({});
  assert.deepEqual(steps.map((s) => s.ok), [null, true, true]);
  assert.match(steps[1].detail, /7 sipariş satırı · örnek durum: Hazırlanıyor → processing/);
  assert.match(steps[2].detail, /42 ürün/);
});

// ---------------- Koçtaş (Mirakl) ----------------
const ENV = { KOCTAS_URL: 'https://koctas-prod.mirakl.net/api/', KOCTAS_API_KEY: 'mk-1', KOCTAS_SHOP_ID: '2001' };
const mOrder = (o = {}) => ({ order_id: 'KT-1-A', commercial_id: 'KT-1', created_date: '2026-10-01T09:00:00Z', order_state: 'WAITING_ACCEPTANCE', total_price: 260, shipping_price: 10, currency_iso_code: 'TRY',
  shipping_company: '', shipping_tracking: '', shipping_deadline: '2026-10-03T09:00:00Z', customer_notification_email: 'x@mirakl.net',
  customer: { customer_id: 'C1', firstname: 'Ali', lastname: 'Veli', shipping_address: { firstname: 'Ali', lastname: 'Veli', street_1: 'Atatürk Cd. 5', street_2: 'D:3', city: 'Kadıköy', state: 'İstanbul', zip_code: '34710', phone: '0532' } },
  order_lines: [
    { order_line_id: 'KT-1-A-1', offer_sku: 'MAT-1', product_sku: 'P1', product_title: 'Matkap', quantity: 2, price: 200, price_unit: 100, order_line_state: 'WAITING_ACCEPTANCE', product_medias: [{ media_url: 'https://m/1.jpg', type: 'SMALL' }] },
    { order_line_id: 'KT-1-A-2', offer_sku: 'UC-1', product_sku: 'P2', product_title: 'Uç', quantity: 1, price: 50, order_line_state: 'REFUSED' },
  ], ...o });

test('Koçtaş: adres/kimlik/shop_id, OR11 güncellenme tarihiyle, sipariş normalleştirme', async () => {
  const calls = mockFetch([[ 'GET', /\/api\/orders\?/, { total_count: 1, orders: [mOrder()] } ]]);
  const ch = koctas(ENV, { id: 'koctas' });
  assert.equal(ch.enabled, true);
  assert.equal(ch.caps.accept, 'remote'); assert.equal(ch.caps.ship, 'remote'); assert.equal(ch.caps.manualTracking, true);
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-02T00:00:00Z');
  const [o] = await ch.fetchOrders(since, until);
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://koctas-prod.mirakl.net/api/orders');
  assert.equal(calls[0].headers.Authorization, 'mk-1', 'Bearer yok');
  assert.equal(u.searchParams.get('start_update_date'), '2026-10-01T00:00:00Z');
  assert.equal(u.searchParams.get('end_update_date'), '2026-10-02T00:00:00Z');
  assert.equal(u.searchParams.get('max'), '100'); assert.equal(u.searchParams.get('offset'), '0'); assert.equal(u.searchParams.get('paginate'), 'true');
  assert.equal(u.searchParams.get('shop_id'), '2001');
  assert.equal(o.remoteId, 'KT-1-A'); assert.equal(o.orderNumber, 'KT-1');
  assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, 'WAITING_ACCEPTANCE');
  assert.equal(o.total, 260); assert.equal(o.currency, 'TRY');
  assert.equal(o.customer, 'Ali Veli'); assert.equal(o.email, 'x@mirakl.net'); assert.equal(o.customerId, 'C1'); assert.equal(o.phone, '0532');
  assert.deepEqual(o.address, { name: 'Ali Veli', line: 'Atatürk Cd. 5 D:3 34710', district: 'İstanbul', city: 'Kadıköy', phone: '0532' });
  assert.equal(o.shipBy, Date.parse('2026-10-03T09:00:00Z'));
  assert.equal(o.orderedAt, Date.parse('2026-10-01T09:00:00Z'));
  assert.deepEqual(o.items[0], { lineId: 'KT-1-A-1', sku: 'MAT-1', barcode: '', name: 'Matkap', image: 'https://m/1.jpg', quantity: 2, unitPrice: 100, total: 200, status: '', remoteKey: 'MAT-1' });
  assert.equal(o.items[1].status, 'cancelled'); assert.equal(o.items[1].unitPrice, 50);
  assert.equal(o.packages, null);

  // geçmiş aktarım: oluşturulma tarihine göre
  await ch.fetchOrders(since, until, { byOrdered: true });
  const u2 = new URL(calls[1].url);
  assert.equal(u2.searchParams.get('start_date'), '2026-10-01T00:00:00Z'); assert.equal(u2.searchParams.get('start_update_date'), null);
});

test('Koçtaş: durum eşlemesi ve offset sayfalama', async () => {
  const states = ['WAITING_DEBIT_PAYMENT', 'SHIPPING', 'SHIPPED', 'TO_COLLECT', 'RECEIVED', 'CLOSED', 'REFUSED', 'CANCELED', 'REFUNDED'];
  const offsets = [];
  mockFetch([[ 'GET', /\/api\/orders\?/, (url) => {
    const off = Number(new URL(url).searchParams.get('offset')); offsets.push(off);
    const rows = off === 0 ? Array.from({ length: 100 }, (_, i) => mOrder({ order_id: 'A' + i, order_state: states[i % states.length] })) : [mOrder({ order_id: 'Z' })];
    return { total_count: 101, orders: rows };
  } ]]);
  const ch = koctas({ KOCTAS_URL: 'https://koctas-prod.mirakl.net', KOCTAS_API_KEY: 'k' }, { id: 'koctas' });
  const list = await ch.fetchOrders(0, Date.now());
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(list.length, 101);
  assert.deepEqual(list.slice(0, 9).map((o) => o.status), ['new', 'processing', 'shipped', 'shipped', 'delivered', 'delivered', 'cancelled', 'cancelled', 'returned']);
});

test('Koçtaş: OF21 teklifler → ilanlar (EAN barkod, indirimli fiyat)', async () => {
  const calls = mockFetch([[ 'GET', /\/api\/offers\?/, { total_count: 2, offers: [
    { offer_id: 11, shop_sku: 'MAT-1', product_sku: 'P1', product_title: 'Matkap', price: 90, quantity: 5, active: true, state_code: '11', product_references: [{ reference_type: 'EAN', reference: '869000' }], discount: { origin_price: 120, discount_price: 90 } },
    { offer_id: 12, shop_sku: 'UC-1', product_sku: 'P2', product_title: 'Uç', price: 50, quantity: 0, active: false, product_references: [] },
  ] } ]]);
  const ch = koctas(ENV, { id: 'koctas' });
  const l = await ch.fetchListings();
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, '/api/offers'); assert.equal(u.searchParams.get('max'), '100'); assert.equal(u.searchParams.get('shop_id'), '2001');
  assert.deepEqual(l[0], { remoteId: 'MAT-1', remoteProductId: 'P1', sku: 'MAT-1', barcode: '869000', name: 'Matkap', groupName: 'Matkap', variantName: '', image: '', images: [], price: 90, listPrice: 120, stock: 5, active: true });
  assert.equal(l[1].active, false); assert.equal(l[1].listPrice, 50); assert.equal(l[1].barcode, '');
});

test('Koçtaş: OF24 stok/fiyat güncel teklif korunarak; önbellekte yoksa sku ile okunur', async () => {
  const offer = { offer_id: 11, shop_sku: 'MAT-1', product_sku: 'P1', product_title: 'Matkap', price: 90, quantity: 5, active: true, state_code: '11', leadtime_to_ship: 2, description: 'Açıklama',
    logistic_class: { code: 'M', label: 'Orta' }, offer_additional_fields: [{ code: 'garanti', type: 'STRING', value: '2 yıl' }],
    product_references: [{ reference_type: 'EAN', reference: '869000' }], discount: { origin_price: 120, discount_price: 90, start_date: null, end_date: null } };
  const calls = mockFetch([
    [ 'GET', /\/api\/offers\?/, (url) => ({ total_count: 1, offers: new URL(url).searchParams.get('sku') === 'MAT-1' ? [offer] : [] }) ],
    [ 'POST', /\/api\/offers\?shop_id=2001$/, { import_id: 77 } ],
  ]);
  const ch = koctas(ENV, { id: 'koctas' });
  await ch.pushStock([{ remoteId: 'MAT-1', remoteProductId: 'P1', stock: 8 }]);
  const get = calls.find((c) => c.method === 'GET');
  assert.equal(new URL(get.url).searchParams.get('sku'), 'MAT-1');
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(post.body), { offers: [{ shop_sku: 'MAT-1', product_id: 'P1', product_id_type: 'SKU', price: 120, quantity: 8, state_code: '11', update_delete: 'update',
    discount: { price: 90 }, description: 'Açıklama', leadtime_to_ship: 2, logistic_class: 'M', offer_additional_fields: [{ code: 'garanti', value: '2 yıl' }] }] });

  // fiyat: önbellekten (yeni GET yok), stok son gönderilen değer; liste > satış → indirim
  const n = calls.length;
  await ch.pushPrice([{ remoteId: 'MAT-1', price: 100, listPrice: 130 }]);
  assert.equal(calls.length, n + 1);
  const b = JSON.parse(calls.at(-1).body).offers[0];
  assert.equal(b.price, 130); assert.deepEqual(b.discount, { price: 100 }); assert.equal(b.quantity, 8);
  // indirim kaldırma: liste = satış → indirim yok, sonraki stok gönderimi yeni fiyatı kullanır
  await ch.pushPrice([{ remoteId: 'MAT-1', price: 110, listPrice: 0 }]);
  const c = JSON.parse(calls.at(-1).body).offers[0];
  assert.equal(c.price, 110); assert.equal(c.discount, undefined);
  await ch.pushStock([{ remoteId: 'MAT-1', stock: 3 }]);
  const d = JSON.parse(calls.at(-1).body).offers[0];
  assert.equal(d.price, 110); assert.equal(d.discount, undefined); assert.equal(d.quantity, 3);

  // bilinmeyen teklif: anlaşılır hata
  const before = calls.filter((x) => x.method === 'POST').length;
  await assert.rejects(ch.pushStock([{ remoteId: 'YOK', stock: 1 }, { remoteId: 'MAT-1', stock: 4 }]), /1 teklif bulunamadı.*YOK/);
  assert.equal(calls.filter((x) => x.method === 'POST').length, before + 1, 'bulunan teklif yine gönderilir');
  assert.deepEqual(JSON.parse(calls.at(-1).body).offers.map((x) => x.shop_sku), ['MAT-1']);
});

test('Koçtaş: çok sayıda eksik teklifte tüm liste okunur, 100lük parçalarla gönderilir; EAN yedeği', async () => {
  const offers = Array.from({ length: 150 }, (_, i) => ({ shop_sku: 'S' + i, product_sku: i === 0 ? '' : 'P' + i, price: 10, quantity: 1, product_references: [{ reference_type: 'EAN', reference: 'E' + i }] }));
  const calls = mockFetch([
    [ 'GET', /\/api\/offers\?/, (url) => { const off = Number(new URL(url).searchParams.get('offset')); return { total_count: 150, offers: offers.slice(off, off + 100) }; } ],
    [ 'POST', /\/api\/offers/, { import_id: 1 } ],
  ]);
  const ch = koctas({ KOCTAS_URL: 'https://koctas-prod.mirakl.net/', KOCTAS_API_KEY: 'k' }, { id: 'koctas' });
  await ch.pushStock(offers.map((o) => ({ remoteId: o.shop_sku, stock: 2 })));
  const gets = calls.filter((c) => c.method === 'GET'), posts = calls.filter((c) => c.method === 'POST');
  assert.equal(gets.length, 2); assert.equal(new URL(gets[0].url).searchParams.get('sku'), null);
  assert.equal(new URL(gets[0].url).searchParams.get('shop_id'), null, 'mağaza ID verilmediyse eklenmez');
  assert.equal(posts.length, 2);
  const first = JSON.parse(posts[0].body).offers;
  assert.equal(first.length, 100); assert.equal(JSON.parse(posts[1].body).offers.length, 50);
  assert.equal(first[0].product_id, 'E0'); assert.equal(first[0].product_id_type, 'EAN');
  assert.equal(first[1].product_id, 'P1'); assert.equal(first[1].product_id_type, 'SKU');
});

test('Koçtaş: OR21 kabul, OR23 takip (SH21 taşıyıcı eşleme) + OR24 kargoya verme', async () => {
  const calls = mockFetch([
    [ 'PUT', /\/api\/orders\/KT-1-A\/accept/, {} ],
    [ 'GET', /\/api\/shipping\/carriers/, { carriers: [{ code: 'YURTICI', label: 'Yurtiçi Kargo' }, { code: 'ARAS', label: 'Aras Kargo' }] } ],
    [ 'PUT', /\/api\/orders\/KT-1-A\/(tracking|ship)/, {} ],
  ]);
  const ch = koctas(ENV, { id: 'koctas' });
  const row = { remote_id: 'KT-1-A', order_number: 'KT-1', remote_status: 'WAITING_ACCEPTANCE', items: [{ line_id: 'KT-1-A-1', status: '' }, { line_id: 'KT-1-A-2', status: 'cancelled' }], packages: [] };
  await ch.accept(row);
  assert.equal(calls[0].method, 'PUT');
  assert.match(calls[0].url, /^https:\/\/koctas-prod\.mirakl\.net\/api\/orders\/KT-1-A\/accept\?shop_id=2001$/);
  assert.deepEqual(JSON.parse(calls[0].body), { order_lines: [{ accepted: true, id: 'KT-1-A-1' }] });
  // kabul beklemeyen sipariş: istek yok
  await ch.accept({ ...row, remote_status: 'SHIPPING' });
  assert.equal(calls.length, 1);

  const pkg = { id: 1, remote_id: null, items: [], status: 'open' };
  const r = await ch.ship({ ...row, packages: [pkg] }, pkg, { cargoCompany: 'YURTICI KARGO A.Ş.', tracking: 'YT123' });
  assert.deepEqual(r, { tracking: 'YT123' });
  const tr = calls.find((c) => /\/tracking/.test(c.url)), sh = calls.find((c) => /\/ship\?/.test(c.url));
  assert.deepEqual(JSON.parse(tr.body), { carrier_code: 'YURTICI', tracking_number: 'YT123' });
  assert.equal(sh.method, 'PUT'); assert.equal(sh.body, undefined);
  assert.ok(calls.indexOf(tr) < calls.indexOf(sh), 'önce takip, sonra kargoya verildi');

  // listede olmayan firma: ad olarak; taşıyıcı listesi bir kez okunur
  await ch.ship({ ...row, packages: [pkg] }, pkg, { cargoCompany: 'Kolay Gelsin', tracking: 'KG1' });
  assert.deepEqual(JSON.parse(calls.filter((c) => /\/tracking/.test(c.url)).at(-1).body), { carrier_name: 'Kolay Gelsin', tracking_number: 'KG1' });
  assert.equal(calls.filter((c) => /carriers/.test(c.url)).length, 1);

  // başka paketi gönderilmiş sipariş: tekrar gönderilmez
  const n = calls.length, done = { id: 2, status: 'shipped' };
  await ch.ship({ ...row, packages: [done, pkg] }, pkg, { cargoCompany: 'Aras', tracking: 'A1' });
  assert.equal(calls.length, n);
  // takip no var ama firma yok: hata
  await assert.rejects(ch.ship({ ...row, packages: [pkg] }, pkg, { tracking: 'X' }), /kargo firması/);
});

test('Koçtaş: eksik alanlar ve tanılama (A01, OR11, OF21)', async () => {
  assert.deepEqual(koctas({}, { id: 'koctas' }).missing, ['KOCTAS_URL', 'KOCTAS_API_KEY']);
  const calls = mockFetch([
    [ 'GET', /\/api\/account/, { shop_id: 2001, shop_name: 'Hastürk', shop_state: 'OPEN' } ],
    [ 'GET', /\/api\/orders\?/, (url) => new URL(url).searchParams.get('order_ids') ? { orders: [mOrder({ order_state: 'SHIPPED', shipping_company: 'Aras', shipping_tracking: 'A9' })] } : { total_count: 4, orders: [mOrder({ order_state: 'SHIPPING' })] } ],
    [ 'GET', /\/api\/offers\?/, { total_count: 12, offers: [] } ],
  ]);
  const steps = await koctas(ENV, { id: 'koctas' }).diagnose({ orderId: 'KT-1-A' });
  assert.deepEqual(steps.map((s) => s.ok), [true, true, true, true]);
  assert.match(steps[0].detail, /Hastürk · mağaza ID 2001 · durum OPEN/);
  assert.match(steps[1].detail, /4 sipariş · örnek durum: SHIPPING → processing/);
  assert.match(steps[2].detail, /SHIPPED · kargo Aras A9/);
  assert.match(steps[3].detail, /12 teklif/);
  assert.ok(calls.every((c) => c.headers.Authorization === 'mk-1'));
  // hata adımı
  mockFetch([]);
  const bad = await koctas(ENV, { id: 'koctas' }).diagnose({});
  assert.deepEqual(bad.map((s) => s.ok), [false, false, false]);
});
