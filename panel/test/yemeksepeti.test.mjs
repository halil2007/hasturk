// Yemeksepeti Market (Delivery Hero Partner API v2) bağlantısı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yemeksepeti, YS_BASE, YS_SANDBOX } from '../src/channels/yemeksepeti.js';

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
const ENV = { YEMEKSEPETI_CLIENT_ID: 'cid', YEMEKSEPETI_CLIENT_SECRET: 'sec', YEMEKSEPETI_CHAIN_ID: 'CH1', YEMEKSEPETI_VENDOR_ID: 'V9' };
const TOKEN = [ 'POST', /\/v2\/oauth\/token$/, { access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 } ];
const ysOrder = (o = {}) => ({
  order_id: '9d4a63b5-0000-4440-96af-aa04797da3a0', external_order_id: 'YS-1001', order_code: 'A7', status: 'RECEIVED', transport_type: 'LOGISTICS_DELIVERY', order_type: 'DELIVERY',
  promised_for: '2026-10-01T09:40:00Z', sys: { created_at: '2026-10-01T09:00:00Z' },
  customer: { _id: 'C1', first_name: 'Ali', last_name: 'V.', phone_number: '+90 5** *** ** 12',
    delivery_address: { street: 'Atatürk Cd.', number: '5', building: 'B', floor: '3', apartment: '7', city: 'İstanbul', suburb: 'Kadıköy', zipcode: '34710', instructions: 'Zili çalmayın' } },
  payment: { order_total: 125.5, sub_total: 120, delivery_fee: 5.5, type: 'ONLINE' },
  items: [
    { _id: 'it-1', sku: 'SUT-1', barcode: ['8690001'], name: 'Süt 1L', image_url: 'https://img/1.jpg', status: 'NOT_PROCESSED',
      original_pricing: { pricing_type: 'UNIT', quantity: 2, unit_price: 30, total_price: 60 }, pricing: { pricing_type: 'UNIT', quantity: 0, unit_price: 30, total_price: 0 } },
    { _id: 'it-2', sku: 'DOM-1', barcode: [], name: 'Domates', status: 'IN_CART', pricing: { pricing_type: 'KG', weight: 1.5, unit_price: 40, total_price: 60 } },
    { _id: 'it-3', sku: 'EKM-1', name: 'Ekmek', status: 'NOT_FOUND', pricing: { pricing_type: 'UNIT', quantity: 1, unit_price: 10, total_price: 10 } },
  ], ...o });

test('Yemeksepeti: OAuth token (form) + Bearer, sipariş çekme ve normalleştirme', async () => {
  const calls = mockFetch([TOKEN, [ 'GET', /\/v2\/chains\/CH1\/vendors\/V9\/orders\?/, { orders: [ysOrder()], page_number: 1, page_size: 500, total_pages: 1 } ]]);
  const ch = yemeksepeti(ENV, { id: 'yemeksepeti' });
  assert.equal(ch.enabled, true);
  assert.deepEqual(ch.caps, { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: false, courier: 'platform' });
  assert.equal(ch.accept, undefined, 'kabul servisi yok');
  const now = Date.now();
  const [o] = await ch.fetchOrders(now - 3600e3, now);
  const t = calls[0];
  assert.equal(t.url, YS_BASE + '/v2/oauth/token');
  assert.equal(t.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(t.body)), { grant_type: 'client_credentials', client_id: 'cid', client_secret: 'sec' });
  const g = calls[1], u = new URL(g.url);
  assert.equal(g.headers.Authorization, 'Bearer tok-1');
  assert.equal(u.pathname, '/v2/chains/CH1/vendors/V9/orders');
  assert.equal(u.searchParams.get('page'), '1'); assert.equal(u.searchParams.get('page_size'), '500');
  // senkron penceresi en az 2 gün (servis yalnız oluşturulma zamanıyla süzer)
  const st = Date.parse(u.searchParams.get('start_time')), en = Date.parse(u.searchParams.get('end_time'));
  assert.ok(en - st >= 2 * 864e5 - 2000, 'pencere en az 2 gün');
  assert.match(u.searchParams.get('start_time'), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

  assert.equal(o.remoteId, '9d4a63b5-0000-4440-96af-aa04797da3a0'); assert.equal(o.orderNumber, 'YS-1001');
  assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, 'RECEIVED');
  assert.equal(o.orderedAt, Date.parse('2026-10-01T09:00:00Z')); assert.equal(o.shipBy, Date.parse('2026-10-01T09:40:00Z'));
  assert.equal(o.total, 125.5); assert.equal(o.currency, 'TRY');
  assert.equal(o.customer, 'Ali V.'); assert.equal(o.customerId, 'C1'); assert.equal(o.tracking, ''); assert.equal(o.cargoCompany, 'Yemeksepeti kuryesi');
  assert.deepEqual(o.address, { name: 'Ali V.', line: 'Atatürk Cd. 5 B Kat 3 Daire 7 34710 (Zili çalmayın)', district: 'Kadıköy', city: 'İstanbul', phone: '+90 5** *** ** 12' });
  // NOT_PROCESSED: müşterinin istediği (original_pricing)
  assert.deepEqual(o.items[0], { lineId: 'it-1', sku: 'SUT-1', barcode: '8690001', name: 'Süt 1L', image: 'https://img/1.jpg', quantity: 2, unitPrice: 30, total: 60, status: '', remoteKey: 'SUT-1' });
  // KG ürün: tek kalem, tutar ağırlıkla
  assert.equal(o.items[1].quantity, 1); assert.equal(o.items[1].total, 60); assert.equal(o.items[1].unitPrice, 60);
  assert.equal(o.items[2].status, 'cancelled');
  assert.equal(o.packages, null);

  // token bellekte: ikinci çağrıda yeniden alınmaz
  await ch.fetchOrders(now - 3600e3, now);
  assert.equal(calls.filter((c) => /oauth/.test(c.url)).length, 1);
});

test('Yemeksepeti: durum eşlemesi, sayfalama, geçmiş aktarımda 60 gün sınırı', async () => {
  const pages = [];
  mockFetch([TOKEN, [ 'GET', /\/orders\?/, (url) => {
    const p = Number(new URL(url).searchParams.get('page')); pages.push(url);
    const st = ['READY_FOR_PICKUP', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'RECEIVED'];
    const rows = p === 1 ? Array.from({ length: 500 }, (_, i) => ysOrder({ order_id: 'O' + i, status: st[i % 5] })) : [ysOrder({ order_id: 'Z' })];
    return { orders: rows, total_pages: 2 };
  } ]]);
  const ch = yemeksepeti(ENV, { id: 'yemeksepeti' });
  const now = Date.now();
  const list = await ch.fetchOrders(now - 365 * 864e5, now, { byOrdered: true });
  assert.equal(pages.length, 2); assert.equal(list.length, 501);
  assert.deepEqual(list.slice(0, 5).map((o) => o.status), ['shipped', 'shipped', 'delivered', 'cancelled', 'new']);
  assert.equal(list[3].items.every((i) => i.status === 'cancelled'), true, 'iptal siparişin kalemleri iptal');
  const start = Date.parse(new URL(pages[0]).searchParams.get('start_time'));
  assert.ok(now - start <= 60 * 864e5, 'en fazla 60 gün geriye');
  // 60 günden eski dilim: istek yok
  const before = pages.length;
  assert.deepEqual(await ch.fetchOrders(now - 300 * 864e5, now - 200 * 864e5, { byOrdered: true }), []);
  assert.equal(pages.length, before);
});

test('Yemeksepeti: 401 → token yenilenip tekrar denenir; sandbox adresi', async () => {
  let n = 0;
  const calls = mockFetch([
    [ 'POST', /oauth\/token$/, () => ({ access_token: 'tok-' + (++n), expires_in: 3600 }) ],
    [ 'GET', /\/vendors\/V9\/status$/, (url, opts) => (opts.headers.Authorization === 'Bearer tok-1' ? { __status: 401, body: { message: 'expired' } } : { vendor_id: 'V9', status: 'OPEN' }) ],
  ]);
  const ch = yemeksepeti({ ...ENV, YEMEKSEPETI_ENV: 'sandbox' }, { id: 'yemeksepeti' });
  const steps = await ch.diagnose({});
  assert.ok(calls.every((c) => c.url.startsWith(YS_SANDBOX)));
  const s = steps.find((x) => x.name === 'Mağaza durumu');
  assert.equal(s.ok, true); assert.match(s.detail, /OPEN/);
  assert.equal(calls.filter((c) => /status$/.test(c.url)).at(-1).headers.Authorization, 'Bearer tok-2');
});

test('Yemeksepeti: katalog → ilanlar, stok / fiyat PUT gövdeleri', async () => {
  const calls = mockFetch([TOKEN,
    [ 'GET', /\/vendors\/V9\/catalog\?/, { products: [
      { remote_product_id: 'rp1', sku: 'SUT-1', barcodes: ['8690001'], title: 'Süt 1L', images: ['https://img/1.jpg', 'x'], price: 30, active: true },
      { sku: 'DOM-1', title: 'Domates', price: 40, active: false },
    ], page_number: 1, total_pages: 1 } ],
    [ 'PUT', /\/vendors\/V9\/catalog$/, { job_id: 'job-1', job_status: 'QUEUED' } ],
  ]);
  const ch = yemeksepeti(ENV, { id: 'yemeksepeti' });
  const l = await ch.fetchListings();
  assert.deepEqual(l[0], { remoteId: 'SUT-1', remoteProductId: 'rp1', sku: 'SUT-1', barcode: '8690001', name: 'Süt 1L', groupName: 'Süt 1L', variantName: '', image: 'https://img/1.jpg', images: ['https://img/1.jpg'], price: 30, listPrice: 30, stock: null, active: true });
  assert.equal(l[1].active, false);
  assert.equal(new URL(calls[1].url).searchParams.get('page_size'), '500');

  const r = await ch.pushStock([{ remoteId: 'SUT-1', stock: 7.4 }, { sku: 'DOM-1', stock: -3 }]);
  assert.deepEqual(r, { jobs: ['job-1'] });
  const put = calls.at(-1);
  assert.equal(put.method, 'PUT'); assert.equal(put.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(put.body), { products: [{ sku: 'SUT-1', quantity: 7 }, { sku: 'DOM-1', quantity: 0 }] });
  await ch.pushPrice([{ remoteId: 'SUT-1', price: 32.499, listPrice: 40 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { products: [{ sku: 'SUT-1', price: 32.5 }] });
  await assert.rejects(ch.pushPrice([{ remoteId: 'X', price: 0 }]), /satış fiyatı yok/);
});

test('Yemeksepeti: hazır (READY_FOR_PICKUP / DISPATCHED) gövdesi, iptal edilen satır NOT_FOUND', async () => {
  let detail = ysOrder();
  const calls = mockFetch([TOKEN,
    [ 'GET', /\/v2\/chains\/CH1\/orders\/[^/?]+$/, () => detail ],
    [ 'PUT', /\/v2\/chains\/CH1\/orders\/[^/?]+$/, {} ],
  ]);
  const ch = yemeksepeti(ENV, { id: 'yemeksepeti' });
  const order = { remote_id: detail.order_id, items: [{ line_id: 'it-1', status: '' }, { line_id: 'it-2', status: 'cancelled' }] };
  await ch.ship(order, { id: 1 }, {});
  const put = calls.at(-1);
  assert.equal(put.method, 'PUT');
  assert.equal(new URL(put.url).pathname, `/v2/chains/CH1/orders/${detail.order_id}`);
  assert.deepEqual(JSON.parse(put.body), { order_id: detail.order_id, status: 'READY_FOR_PICKUP', items: [
    { _id: 'it-1', sku: 'SUT-1', status: 'IN_CART', pricing: { pricing_type: 'UNIT', unit_price: 30, quantity: 2 } },
    { _id: 'it-2', sku: 'DOM-1', status: 'NOT_FOUND', pricing: { pricing_type: 'KG', unit_price: 40, weight: 1.5 } },
    { _id: 'it-3', sku: 'EKM-1', status: 'NOT_FOUND', pricing: { pricing_type: 'UNIT', unit_price: 10, quantity: 1 } },
  ] });

  // kendi kuryesi → DISPATCHED
  detail = ysOrder({ transport_type: 'VENDOR_DELIVERY' });
  await ch.ship({ remote_id: detail.order_id, items: [] }, { id: 1 }, {});
  assert.equal(JSON.parse(calls.at(-1).body).status, 'DISPATCHED');

  // zaten hazır: tekrar gönderilmez; iptal: hata
  const n = calls.filter((c) => c.method === 'PUT').length;
  detail = ysOrder({ status: 'READY_FOR_PICKUP' });
  assert.deepEqual(await ch.ship({ remote_id: detail.order_id, items: [] }, { id: 1 }, {}), {});
  assert.equal(calls.filter((c) => c.method === 'PUT').length, n);
  detail = ysOrder({ status: 'CANCELLED' });
  await assert.rejects(ch.ship({ remote_id: detail.order_id, items: [] }, { id: 1 }, {}), /iptal/);
  // tüm satırlar iptal: anlaşılır hata
  detail = ysOrder();
  await assert.rejects(ch.ship({ remote_id: detail.order_id, items: ['it-1', 'it-2'].map((line_id) => ({ line_id, status: 'cancelled' })) }, { id: 1 }, {}), /ürün kalmadı/);
});

test('Yemeksepeti: eksik bilgi ve HTTP hatası', async () => {
  const ch = yemeksepeti({ YEMEKSEPETI_CLIENT_ID: 'x' }, { id: 'yemeksepeti' });
  assert.equal(ch.enabled, false);
  assert.deepEqual(ch.missing, ['YEMEKSEPETI_CLIENT_SECRET', 'YEMEKSEPETI_CHAIN_ID', 'YEMEKSEPETI_VENDOR_ID']);
  mockFetch([[ 'POST', /oauth\/token$/, { __status: 400, body: { message: 'invalid_client' } } ]]);
  const c2 = yemeksepeti(ENV, { id: 'yemeksepeti' });
  await assert.rejects(c2.fetchOrders(Date.now() - 1000, Date.now()), /HTTP 400 invalid_client/);
  const steps = await c2.diagnose({});
  assert.equal(steps[0].ok, false); assert.match(steps[0].detail, /HTTP 400/);
});
