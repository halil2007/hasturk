// eBay (Sell Fulfillment + Inventory API) kanalı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve dönüşümler denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ebay } from '../src/channels/ebay.js';

const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 5000 ? ms : 0, ...a);

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} };
    calls.push(c);
    const hit = routes.find(([re, , m]) => re.test(c.url) && (!m || m === c.method));
    let out = hit ? (typeof hit[1] === 'function' ? hit[1](c.url, opts, calls) : hit[1]) : { status: 404, body: { errors: [{ message: 'yok' }] } };
    if (!(out && out.status && 'body' in out)) out = { status: 200, body: out };
    return new Response(out.body == null ? null : JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const memKv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };
const ENV = { EBAY_CLIENT_ID: 'App-ID', EBAY_CLIENT_SECRET: 'Cert-ID', EBAY_REFRESH_TOKEN: 'v^1.1#refresh-token-abcdef1234567890' };
const TOKEN = [/identity\/v1\/oauth2\/token/, { access_token: 'AT1', expires_in: 7200, token_type: 'User Access Token' }];

const order = (id, extra = {}) => ({
  orderId: id, creationDate: '2026-10-01T10:00:00.000Z', lastModifiedDate: '2026-10-01T12:00:00.000Z', orderFulfillmentStatus: 'NOT_STARTED', orderPaymentStatus: 'PAID',
  cancelStatus: { cancelState: 'NONE_REQUESTED', cancelRequests: [] }, buyer: { username: 'alici1' },
  pricingSummary: { total: { value: '61.50', currency: 'USD' } },
  fulfillmentStartInstructions: [{ fulfillmentInstructionsType: 'SHIP_TO', shippingStep: { shippingCarrierCode: 'USPS', shipTo: {
    fullName: 'John Smith', primaryPhone: { phoneNumber: '+1 555 0100' }, email: 'abc@members.ebay.com',
    contactAddress: { addressLine1: '1 Main St', addressLine2: 'Apt 2', city: 'Austin', stateOrProvince: 'TX', postalCode: '73301', countryCode: 'US' } } } }],
  lineItems: [
    { lineItemId: '1001', sku: 'SKU-A', title: 'Seramik Kupa', quantity: 2, lineItemCost: { value: '40.00', currency: 'USD' }, legacyItemId: '1234', variationAspects: [{ name: 'Color', value: 'Blue' }],
      lineItemFulfillmentInstructions: { shipByDate: '2026-10-03T23:59:59.000Z' } },
    { lineItemId: '1002', sku: '', title: 'Tabak', quantity: 1, lineItemCost: { value: '20.00', currency: 'USD' }, discountedLineItemCost: { value: '18.00', currency: 'USD' }, legacyItemId: '5678', legacyVariationId: '9',
      lineItemFulfillmentInstructions: { shipByDate: '2026-10-02T23:59:59.000Z' } },
  ], ...extra });

test('eBay: eksik bilgi, ortam adresi ve yetenekler', async () => {
  const off = ebay({ EBAY_CLIENT_ID: 'x' }, { id: 'ebay' });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.missing, ['EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN']);
  const ch = ebay(ENV, { id: 'ebay', name: 'eBay' });
  assert.equal(ch.enabled, true); assert.equal(ch.type, 'ebay'); assert.equal(ch.name, 'eBay');
  assert.deepEqual(ch.caps, { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true });
  for (const [env, host] of [[{}, 'api.ebay.com'], [{ EBAY_SANDBOX: '1' }, 'api.sandbox.ebay.com']]) {
    const calls = mockFetch([TOKEN, [/\/order\?/, { orders: [], total: 0 }]]);
    await ebay({ ...ENV, ...env }, { id: 'ebay' }).fetchOrders(Date.now() - 6e5, Date.now());
    assert.equal(new URL(calls[0].url).host, host);
    assert.equal(new URL(calls[1].url).host, host);
  }
});

test('eBay: refresh token ile belirteç alınır, kv\'de saklanır ve yeniden kullanılır; 401\'de bir kez yenilenir', async () => {
  const kv = memKv();
  let n = 0;
  const calls = mockFetch([
    [/identity\/v1\/oauth2\/token/, () => ({ access_token: 'AT' + (++n), expires_in: 7200 })],
    [/\/order\?/, (u, o) => (o.headers.Authorization === 'Bearer AT1' && n === 1 ? { orders: [] } : o.headers.Authorization === 'Bearer AT2' ? { orders: [] } : { status: 401, body: { errors: [{ message: 'Invalid access token' }] } })],
  ]);
  const ch = ebay(ENV, { id: 'ebay', kv });
  await ch.fetchOrders(Date.now() - 6e5, Date.now());
  const t = calls[0];
  assert.equal(t.method, 'POST');
  assert.equal(t.url, 'https://api.ebay.com/identity/v1/oauth2/token');
  assert.equal(t.headers.Authorization, 'Basic ' + btoa('App-ID:Cert-ID'));
  assert.equal(t.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(t.body)), { grant_type: 'refresh_token', refresh_token: ENV.EBAY_REFRESH_TOKEN });
  const saved = kv.m.get('token');
  assert.equal(saved.access, 'AT1'); assert.ok(saved.exp > Date.now()); assert.ok(!JSON.stringify(saved).includes(ENV.EBAY_REFRESH_TOKEN), 'refresh token kv\'ye yazılmaz');
  assert.equal(calls[1].headers.Authorization, 'Bearer AT1');
  assert.equal(calls[1].headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_US');
  // yeni nesne kv'deki belirteci kullanır (token isteği yok)
  const before = calls.length;
  await ebay(ENV, { id: 'ebay', kv }).fetchOrders(Date.now() - 6e5, Date.now());
  assert.equal(calls.slice(before).filter((c) => /oauth2/.test(c.url)).length, 0);
  // başka refresh token girildiyse saklanan belirteç kullanılmaz
  const b2 = calls.length;
  await ebay({ ...ENV, EBAY_REFRESH_TOKEN: 'v^1.1#another-token-0000000000' }, { id: 'ebay', kv }).fetchOrders(Date.now() - 6e5, Date.now());
  assert.equal(calls.slice(b2).filter((c) => /oauth2/.test(c.url)).length, 1);
  assert.equal(kv.m.get('token').access, 'AT2');
  // 401 → yenile ve tekrar dene
  n = 0;
  const kv2 = memKv(); await kv2.set('token', { access: 'OLD', exp: Date.now() + 1e6, fp: 'p:' + ENV.EBAY_REFRESH_TOKEN.length + ':' + ENV.EBAY_REFRESH_TOKEN.slice(-16) });
  const b3 = calls.length;
  n = 1; // bir sonraki belirteç AT2
  await ebay(ENV, { id: 'ebay', kv: kv2 }).fetchOrders(Date.now() - 6e5, Date.now());
  const seq = calls.slice(b3).map((c) => (/oauth2/.test(c.url) ? 'token' : c.headers.Authorization));
  assert.deepEqual(seq, ['Bearer OLD', 'token', 'Bearer AT2']);
});

test('eBay: geçersiz refresh token anlaşılır hata verir', async () => {
  mockFetch([[/oauth2\/token/, { status: 400, body: { error: 'invalid_grant', error_description: 'the provided authorization refresh token is invalid' } }]]);
  await assert.rejects(ebay(ENV, { id: 'ebay' }).fetchOrders(0, Date.now()), /refresh token geçersiz/);
});

test('eBay: sipariş filtresi (lastmodifieddate / creationdate), sayfalama ve dönüşüm', async () => {
  const p1 = Array.from({ length: 200 }, (_, i) => order('P1-' + i));
  const calls = mockFetch([TOKEN,
    [/offset=200/, { orders: [order('27-0001', { orderFulfillmentStatus: 'IN_PROGRESS' })], total: 201 }],
    [/\/order\?/, { orders: p1, total: 201 }]]);
  const ch = ebay(ENV, { id: 'ebay' });
  const since = Date.parse('2026-10-01T00:00:00.000Z'), until = Date.parse('2026-10-02T00:00:00.000Z');
  const orders = await ch.fetchOrders(since, until);
  const list = calls.filter((c) => /\/order\?/.test(c.url));
  assert.equal(list.length, 2);
  assert.equal(list[0].url, 'https://api.ebay.com/sell/fulfillment/v1/order?filter=lastmodifieddate:%5B2026-10-01T00:00:00.000Z..2026-10-02T00:00:00.000Z%5D&limit=200&offset=0');
  assert.match(list[1].url, /offset=200$/);
  assert.equal(orders.length, 201);
  const o = orders[0];
  assert.equal(o.remoteId, 'P1-0'); assert.equal(o.orderNumber, 'P1-0');
  assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, 'NOT_STARTED / PAID');
  assert.equal(o.orderedAt, Date.parse('2026-10-01T10:00:00.000Z'));
  assert.equal(o.total, 61.5); assert.equal(o.currency, 'USD');
  assert.equal(o.customer, 'John Smith'); assert.equal(o.phone, '+1 555 0100'); assert.equal(o.email, 'abc@members.ebay.com'); assert.equal(o.customerId, 'alici1');
  assert.deepEqual(o.address, { name: 'John Smith', line: '1 Main St, Apt 2, 73301 US', district: 'Austin', city: 'TX', phone: '+1 555 0100' });
  assert.equal(o.shipBy, Date.parse('2026-10-02T23:59:59.000Z'));
  assert.equal(o.packages, null);
  assert.deepEqual(o.items, [
    { lineId: '1001', sku: 'SKU-A', barcode: '', name: 'Seramik Kupa (Blue)', image: '', quantity: 2, unitPrice: 20, total: 40, status: '', remoteKey: 'SKU-A' },
    { lineId: '1002', sku: '', barcode: '', name: 'Tabak', image: '', quantity: 1, unitPrice: 18, total: 18, status: '', remoteKey: '5678:9' },
  ]);
  assert.equal(orders[200].status, 'processing');
  // geçmiş aktarımı: creationdate
  const b = calls.length;
  mockFetch([TOKEN, [/\/order\?/, (u) => { calls.push({ url: u }); return { orders: [], total: 0 }; }]]);
  await ebay(ENV, { id: 'ebay' }).fetchOrders(since, until, { byOrdered: true });
  assert.match(calls[b].url, /filter=creationdate:%5B2026-10-01T00:00:00\.000Z\.\.2026-10-02T00:00:00\.000Z%5D&limit=200&offset=0$/);
});

test('eBay: durum eşlemesi ve para birimi olduğu gibi', async () => {
  mockFetch([TOKEN, [/\/order\?/, { orders: [
    order('A', { orderFulfillmentStatus: 'FULFILLED' }),
    order('B', { cancelStatus: { cancelState: 'CANCELED' } }),
    order('C', { orderPaymentStatus: 'FULLY_REFUNDED' }),
    order('D', { orderPaymentStatus: 'FULLY_REFUNDED', orderFulfillmentStatus: 'FULFILLED' }),
    order('E', { orderPaymentStatus: 'PENDING', pricingSummary: { total: { value: '99.90', currency: 'GBP', convertedFromValue: '120', convertedFromCurrency: 'EUR' } } }),
    order('F', { cancelStatus: { cancelState: 'IN_PROGRESS' }, fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: 'Ali Veli', contactAddress: { city: 'İstanbul', countryCode: 'TR' } } } }] }),
  ] }]]);
  const os = await ebay(ENV, { id: 'ebay' }).fetchOrders(0, Date.now());
  assert.deepEqual(os.map((o) => o.status), ['shipped', 'cancelled', 'cancelled', 'returned', 'new', 'new']);
  assert.equal(os[1].items[0].status, 'cancelled'); assert.equal(os[3].items[0].status, '');
  assert.equal(os[4].currency, 'GBP'); assert.equal(os[4].total, 99.9);
  assert.equal(os[5].remoteStatus, 'NOT_STARTED / PAID / cancel:IN_PROGRESS');
  assert.deepEqual(os[5].address, { name: 'Ali Veli', line: '', district: '', city: 'İstanbul', phone: '' });
});

test('eBay: ürün listesi (inventory_item + offer) sayfalanır ve dönüşür', async () => {
  const calls = mockFetch([TOKEN,
    [/inventory_item\?limit=100&offset=1$/, { inventoryItems: [{ sku: 'SKU-C', product: { title: 'Vazo' }, availability: { shipToLocationAvailability: { quantity: 3 } } }], total: 3 }],
    [/inventory_item\?limit=100&offset=0$/, { total: 3, next: '/sell/inventory/v1/inventory_item?offset=1&limit=100', inventoryItems: [
      { sku: 'SKU-A', product: { title: 'Seramik Kupa', imageUrls: ['https://i.ebayimg.com/a.jpg', 'http://x/b.jpg', 'https://i.ebayimg.com/a.jpg'], ean: ['8690000000011'] }, availability: { shipToLocationAvailability: { quantity: 12 } } },
      { sku: 'SKU B', product: { title: 'Tabak', upc: ['012345678905'] }, availability: { shipToLocationAvailability: { quantity: 5 } } }] }],
    [/offer\?sku=SKU-A/, { offers: [{ offerId: 'O-A', sku: 'SKU-A', marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', status: 'PUBLISHED', availableQuantity: 10,
      pricingSummary: { price: { value: '19.99', currency: 'USD' }, originalRetailPrice: { value: '29.99', currency: 'USD' } }, listing: { listingId: '110', listingStatus: 'ACTIVE' } }] }],
    [/offer\?sku=SKU%20B/, { offers: [{ offerId: 'O-B', sku: 'SKU B', format: 'FIXED_PRICE', status: 'UNPUBLISHED', pricingSummary: { price: { value: '5.00', currency: 'USD' } } }] }],
    [/offer\?sku=SKU-C/, { status: 404, body: { errors: [{ errorId: 25713, message: 'This Offer is not available.' }] } }],
  ]);
  const ls = await ebay(ENV, { id: 'ebay' }).fetchListings();
  assert.equal(ls.length, 3);
  assert.deepEqual(ls[0], { remoteId: 'SKU-A', remoteProductId: '110', sku: 'SKU-A', barcode: '8690000000011', name: 'Seramik Kupa', groupName: 'Seramik Kupa', variantName: '',
    image: 'https://i.ebayimg.com/a.jpg', images: ['https://i.ebayimg.com/a.jpg', 'http://x/b.jpg'], price: 19.99, listPrice: 29.99, stock: 10, active: true });
  assert.equal(ls[1].active, false); assert.equal(ls[1].stock, 5); assert.equal(ls[1].barcode, '012345678905'); assert.equal(ls[1].price, 5);
  assert.equal(ls[2].active, false); assert.equal(ls[2].stock, 3); assert.equal(ls[2].price, 0);
  assert.equal(calls.filter((c) => /inventory_item/.test(c.url)).length, 2);
});

test('eBay: stok ve fiyat bulk_update_price_quantity gövdeleri; 25\'erli parça; satır hatası bildirilir', async () => {
  const bodies = [];
  const offers = (sku) => ({ offers: sku === 'NO' ? [] : [{ offerId: 'O-' + sku, sku, format: 'FIXED_PRICE', status: 'PUBLISHED', pricingSummary: { price: { value: '1', currency: 'EUR' } }, listing: { listingStatus: 'ACTIVE' } }] });
  mockFetch([TOKEN,
    [/offer\?sku=/, (u) => offers(new URL(u).searchParams.get('sku'))],
    [/bulk_update_price_quantity/, (u, o) => { const b = JSON.parse(o.body); bodies.push(b); return { responses: b.requests.map((r) => ({ statusCode: (r.sku || '').startsWith('BAD') ? 400 : 200, sku: r.sku, errors: (r.sku || '').startsWith('BAD') ? [{ message: 'Invalid quantity' }] : [] })) }; }, 'POST'],
  ]);
  const ch = ebay({ ...ENV, EBAY_MARKETPLACE_ID: 'EBAY_DE' }, { id: 'ebay' });
  await ch.pushStock([{ remoteId: 'S1', stock: 7.4 }, { remoteId: 'S2', stock: -3 }]);
  assert.deepEqual(bodies[0], { requests: [
    { sku: 'S1', shipToLocationAvailability: { quantity: 7 }, offers: [{ offerId: 'O-S1', availableQuantity: 7 }] },
    { sku: 'S2', shipToLocationAvailability: { quantity: 0 }, offers: [{ offerId: 'O-S2', availableQuantity: 0 }] }] });
  bodies.length = 0;
  await ch.pushStock(Array.from({ length: 30 }, (_, i) => ({ sku: 'K' + i, stock: 1 })));
  assert.deepEqual(bodies.map((b) => b.requests.length), [25, 5]);
  bodies.length = 0;
  await ch.pushPrice([{ remoteId: 'S1', price: 12.5 }]);
  assert.deepEqual(bodies[0], { requests: [{ offers: [{ offerId: 'O-S1', price: { value: '12.50', currency: 'EUR' } }] }] });
  // Sonuç ilan ilan: reddedilen ilan errors'a, diğerleri done'a
  assert.deepEqual(await ch.pushPrice([{ remoteId: 'NO', price: 3 }]), { done: [], errors: [{ remoteId: 'NO', error: 'eBay: teklif (offer) bulunamadı' }] });
  assert.deepEqual(await ch.pushStock([{ remoteId: 'BAD1', stock: 1 }, { remoteId: 'S1', stock: 2 }]), { done: ['S1'], errors: [{ remoteId: 'BAD1', error: 'eBay: Invalid quantity' }] });
});

test('eBay: kargoya verme (shipping_fulfillment) gövdesi', async () => {
  const calls = mockFetch([TOKEN, [/shipping_fulfillment/, { status: 201, body: {} }, 'POST']]);
  const ch = ebay(ENV, { id: 'ebay' });
  const o = { remote_id: '27-0001-2', items: [{ line_id: '1001', quantity: 2, status: '' }, { line_id: '1002', quantity: 1, status: 'cancelled' }] };
  const r = await ch.ship(o, { id: 5 }, { cargoCompany: 'DHL Express', tracking: 'JD0123' });
  assert.deepEqual(r, { tracking: 'JD0123' });
  const c = calls.find((x) => /shipping_fulfillment/.test(x.url));
  assert.equal(c.url, 'https://api.ebay.com/sell/fulfillment/v1/order/27-0001-2/shipping_fulfillment');
  assert.equal(c.headers['Content-Type'], 'application/json');
  const b = JSON.parse(c.body);
  assert.ok(Date.parse(b.shippedDate) > 0);
  assert.deepEqual({ ...b, shippedDate: 'x' }, { lineItems: [{ lineItemId: '1001', quantity: 2 }], shippedDate: 'x', shippingCarrierCode: 'DHL', trackingNumber: 'JD0123' });
  // paket satırları + bilinmeyen firma → Other
  await ch.ship(o, { items: [{ line_id: '1002', qty: 1 }] }, { cargoCompany: 'Yurtiçi Kargo', tracking: 'YK1' });
  const b2 = JSON.parse(calls.filter((x) => /shipping_fulfillment/.test(x.url))[1].body);
  assert.deepEqual(b2.lineItems, [{ lineItemId: '1002', quantity: 1 }]); assert.equal(b2.shippingCarrierCode, 'Other');
  // takip no yok: yalnız satırlar + tarih
  await ch.ship(o, {}, {});
  const b3 = JSON.parse(calls.filter((x) => /shipping_fulfillment/.test(x.url))[2].body);
  assert.deepEqual(Object.keys(b3), ['lineItems', 'shippedDate']);
  await assert.rejects(ch.ship({ remote_id: 'x', items: [] }, {}, { tracking: '1' }), /satırı yok/);
});

test('eBay: tanılama adımları; API hatası anlaşılır mesajla', async () => {
  mockFetch([TOKEN, [/\/order\?/, { orders: [order('X1', { orderFulfillmentStatus: 'FULFILLED' })], total: 4 }], [/inventory_item\?limit=1/, { total: 0, inventoryItems: [] }],
    [/\/order\/X9$/, { status: 404, body: { errors: [{ errorId: 32100, message: 'Invalid Order Id' }] } }]]);
  const steps = await ebay(ENV, { id: 'ebay' }).diagnose({ orderId: 'X9' });
  assert.deepEqual(steps.map((s) => s.ok), [true, true, null, false]);
  assert.match(steps[1].detail, /4 sipariş · örnek X1: FULFILLED → shipped/);
  assert.match(steps[2].detail, /Inventory API/);
  assert.match(steps[3].detail, /HTTP 404.*Invalid Order Id.*adres bulunamadı/);
});
