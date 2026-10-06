// Shopify (GraphQL) ve WooCommerce (REST v3) bağlantıları: ağa çıkmadan örnek cevaplarla istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopify, shopifyStore, shopifyStatus } from '../src/channels/shopify.js';
import { woocommerce, wooStatus } from '../src/channels/woocommerce.js';

// handler(url, opts, call) → { status?, body } ya da düz gövde
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(c);
    let r = await handler(c);
    if (!r || r.status == null || r.body === undefined) r = { status: 200, body: r };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

// ---------------- Shopify ----------------
const SENV = { SHOPIFY_STORE: 'https://Hasturk.myshopify.com/admin/orders', SHOPIFY_TOKEN: 'shpat_x' };
const li = (id, vid, qty, unit, total, extra = {}) => ({ id: `gid://shopify/LineItem/${id}`, sku: 'SKU' + id, name: 'Ürün ' + id, quantity: qty, currentQuantity: qty, variant: vid ? { id: `gid://shopify/ProductVariant/${vid}`, barcode: 'B' + vid } : null,
  image: { url: `https://cdn.shopify.com/${id}.jpg` }, originalUnitPriceSet: { shopMoney: { amount: String(unit) } }, discountedTotalSet: { shopMoney: { amount: String(total) } }, ...extra });
const sOrder = (id, extra = {}) => ({ id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: '2026-10-01T10:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', cancelledAt: null,
  email: 'a@b.com', phone: null, customer: { id: 'gid://shopify/Customer/9', firstName: 'Ayşe', lastName: 'Kaya' },
  shippingAddress: { name: 'Ayşe Kaya', address1: 'Atatürk Cad. 1', address2: 'D:3', city: 'Bornova', province: 'İzmir', phone: '0555' },
  totalPriceSet: { shopMoney: { amount: '249.90', currencyCode: 'TRY' } }, lineItems: { pageInfo: { hasNextPage: false }, nodes: [li(1, 11, 2, 100, 180)] }, fulfillments: [], ...extra });

test('Shopify: mağaza adresi normalleştirme ve eksik bilgiler', () => {
  for (const v of ['hasturk', 'hasturk.myshopify.com', 'https://hasturk.myshopify.com/admin', 'admin.shopify.com/store/hasturk/orders', 'HASTURK']) assert.equal(shopifyStore(v), 'hasturk.myshopify.com', v);
  assert.equal(shopifyStore('evil.com/x'), '', 'nokta içeren başka alan adı kabul edilmez');
  assert.equal(shopifyStore(''), '');
  const ch = shopify({ SHOPIFY_STORE: 'kötü.com' }, { id: 'shopify' });
  assert.equal(ch.enabled, false);
  assert.deepEqual(ch.missing, ['SHOPIFY_STORE', 'SHOPIFY_TOKEN']);
  assert.equal(shopify(SENV, {}).enabled, true);
  assert.equal(shopify(SENV, {}).caps.ship, 'remote');
  assert.equal(shopify(SENV, {}).caps.manualTracking, true);
});

test('Shopify: durum eşlemesi', () => {
  assert.equal(shopifyStatus({ cancelledAt: '2026', displayFinancialStatus: 'REFUNDED' }), 'cancelled');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'REFUNDED', displayFulfillmentStatus: 'FULFILLED' }), 'returned');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', fulfillments: [{ displayStatus: 'IN_TRANSIT' }] }), 'shipped');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', fulfillments: [{ displayStatus: 'DELIVERED' }] }), 'delivered');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'PARTIALLY_FULFILLED' }), 'processing');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PENDING', displayFulfillmentStatus: 'UNFULFILLED' }), 'new');
});

test('Shopify: siparişler sayfalı okunur, kalem taşması ayrıca çekilir, alanlar normalleşir', async () => {
  const big = sOrder(1002, { displayFulfillmentStatus: 'FULFILLED', fulfillments: [{ displayStatus: 'IN_TRANSIT', trackingInfo: [{ number: 'YK123', company: 'Yurtiçi Kargo' }] }],
    lineItems: { pageInfo: { hasNextPage: true, endCursor: 'L1' }, nodes: [li(1, 11, 1, 50, 50)] } });
  const calls = mockFetch((c) => {
    const q = c.body.query;
    if (/order\(id: \$id\) \{ lineItems/.test(q)) return { data: { order: { lineItems: { pageInfo: { hasNextPage: false }, nodes: [li(2, null, 3, 10, 30, { currentQuantity: 0 })] } } } };
    if (/orders\(first/.test(q)) return c.body.variables.after
      ? { data: { orders: { pageInfo: { hasNextPage: false }, nodes: [big] } } }
      : { data: { orders: { pageInfo: { hasNextPage: true, endCursor: 'C1' }, nodes: [sOrder(1001)] } } };
    return { errors: [{ message: 'beklenmeyen' }] };
  });
  const ch = shopify(SENV, { id: 'shopify' });
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-02T00:00:00Z');
  const list = await ch.fetchOrders(since, until);
  assert.equal(calls[0].url, 'https://hasturk.myshopify.com/admin/api/2025-07/graphql.json');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['X-Shopify-Access-Token'], 'shpat_x');
  assert.equal(calls[0].body.variables.q, "updated_at:>='2026-10-01T00:00:00Z' updated_at:<='2026-10-02T00:00:00Z'");
  assert.equal(calls[0].body.variables.sort, 'UPDATED_AT');
  assert.equal(calls[1].body.variables.after, 'C1');
  assert.equal(calls[2].body.variables.id, 'gid://shopify/Order/1002');
  assert.equal(list.length, 2);
  const [a, b] = list;
  assert.deepEqual({ remoteId: a.remoteId, orderNumber: a.orderNumber, status: a.status, total: a.total, currency: a.currency, customer: a.customer, customerId: a.customerId, email: a.email, phone: a.phone },
    { remoteId: '1001', orderNumber: '1001', status: 'new', total: 249.9, currency: 'TRY', customer: 'Ayşe Kaya', customerId: '9', email: 'a@b.com', phone: '0555' });
  assert.deepEqual(a.address, { name: 'Ayşe Kaya', line: 'Atatürk Cad. 1 D:3', district: 'Bornova', city: 'İzmir', phone: '0555' });
  assert.equal(a.orderedAt, Date.parse('2026-10-01T10:00:00Z'));
  assert.deepEqual(a.items[0], { lineId: '1', sku: 'SKU1', barcode: 'B11', name: 'Ürün 1', image: 'https://cdn.shopify.com/1.jpg', quantity: 2, unitPrice: 90, total: 180, status: '', remoteKey: '11' });
  assert.equal(a.packages, null);
  assert.equal(b.status, 'shipped');
  assert.equal(b.remoteStatus, 'PAID · FULFILLED');
  assert.equal(b.tracking, 'YK123');
  assert.equal(b.cargoCompany, 'Yurtiçi Kargo');
  assert.equal(b.items.length, 2);
  assert.deepEqual([b.items[1].status, b.items[1].remoteKey, b.items[1].total], ['cancelled', '', 30]);
  // geçmiş aktarımı: sipariş tarihine göre
  await ch.fetchOrders(since, until, { byOrdered: true });
  const last = calls.filter((c) => /orders\(first/.test(c.body.query)).pop();
  assert.match(last.body.variables.q, /^created_at:>=/);
  assert.equal(last.body.variables.sort, 'CREATED_AT');
});

test('Shopify: sorgu maliyeti aşılırsa sayfa küçülür, THROTTLED beklenip yeniden denenir, hatalar "Shopify:" ile', async () => {
  let n = 0;
  const calls = mockFetch((c) => {
    n++;
    if (n === 1) return { errors: [{ message: 'Query cost is 2000, which exceeds the single query max cost limit (1000).', extensions: { code: 'MAX_COST_EXCEEDED', cost: 2000, maxCost: 1000 } }] };
    if (n === 2) return { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }], extensions: { cost: { requestedQueryCost: 100, throttleStatus: { currentlyAvailable: 90, restoreRate: 100 } } } };
    if (n === 3) return { data: { orders: { pageInfo: { hasNextPage: false }, nodes: [] } } };
    return { errors: [{ message: 'Access denied for orders field.' }] };
  });
  const ch = shopify(SENV, { id: 'shopify' });
  assert.deepEqual(await ch.fetchOrders(0, 1), []);
  assert.equal(calls[0].body.variables.first, 10);
  assert.equal(calls[1].body.variables.first, 4, '10 × 1000 × 0.8 / 2000');
  assert.equal(calls[2].body.variables.first, 4);
  await ch.fetchOrders(0, 1).then(() => assert.fail('hata bekleniyordu'), (e) => assert.match(e.message, /^Shopify: Access denied/));
  assert.equal(calls[3].body.variables.first, 4, 'küçülen boyut sonraki çağrıda da kullanılır');
});

test('Shopify: ürün listesi varyant düzeyinde', async () => {
  mockFetch(() => ({ data: { productVariants: { pageInfo: { hasNextPage: false }, nodes: [
    { id: 'gid://shopify/ProductVariant/11', sku: 'A', barcode: '869', title: 'Default Title', price: '100.00', compareAtPrice: '120.00', inventoryQuantity: 5, image: null,
      product: { id: 'gid://shopify/Product/1', title: 'Gübre', status: 'ACTIVE', featuredMedia: { preview: { image: { url: 'https://cdn.shopify.com/p1.jpg' } } } } },
    { id: 'gid://shopify/ProductVariant/12', sku: 'B', barcode: '', title: '5 kg', price: '80.00', compareAtPrice: null, inventoryQuantity: -2, image: { url: 'https://cdn.shopify.com/v12.jpg' },
      product: { id: 'gid://shopify/Product/2', title: 'Tohum', status: 'DRAFT', featuredMedia: null } },
  ] } } }));
  const [a, b] = await shopify(SENV, {}).fetchListings();
  assert.deepEqual(a, { remoteId: '11', remoteProductId: '1', sku: 'A', barcode: '869', name: 'Gübre', groupName: 'Gübre', variantName: '', image: 'https://cdn.shopify.com/p1.jpg', images: ['https://cdn.shopify.com/p1.jpg'], price: 100, listPrice: 120, stock: 5, active: true });
  assert.deepEqual([b.name, b.variantName, b.listPrice, b.active, b.image], ['Tohum - 5 kg', '5 kg', 80, false, 'https://cdn.shopify.com/v12.jpg']);
});

test('Shopify: stok inventorySetQuantities ile; lokasyon, etkinleştirme, takipsiz/silinmiş varyant atlanır', async () => {
  const calls = mockFetch((c) => {
    const q = c.body.query;
    if (/locations\(first/.test(q)) return { data: { locations: { nodes: [{ id: 'gid://shopify/Location/5', name: 'Depo', isActive: true }] } } };
    if (/nodes\(ids/.test(q)) return { data: { nodes: [
      { id: 'gid://shopify/ProductVariant/11', product: { id: 'gid://shopify/Product/1' }, inventoryItem: { id: 'gid://shopify/InventoryItem/111', tracked: true, inventoryLevel: { id: 'L' } } },
      { id: 'gid://shopify/ProductVariant/12', product: { id: 'gid://shopify/Product/1' }, inventoryItem: { id: 'gid://shopify/InventoryItem/112', tracked: true, inventoryLevel: null } },
      { id: 'gid://shopify/ProductVariant/13', product: { id: 'gid://shopify/Product/1' }, inventoryItem: { id: 'gid://shopify/InventoryItem/113', tracked: false } },
      null,
    ] } };
    if (/inventoryActivate/.test(q)) return { data: { inventoryActivate: { userErrors: [] } } };
    if (/inventorySetQuantities/.test(q)) return { data: { inventorySetQuantities: { userErrors: [] } } };
    return { errors: [{ message: 'beklenmeyen' }] };
  });
  await shopify(SENV, {}).pushStock([{ remoteId: '11', stock: 7 }, { remoteId: '12', stock: -1 }, { remoteId: '13', stock: 3 }, { remoteId: '14', stock: 1 }]);
  const nodes = calls.find((c) => /nodes\(ids/.test(c.body.query));
  assert.deepEqual(nodes.body.variables, { ids: ['gid://shopify/ProductVariant/11', 'gid://shopify/ProductVariant/12', 'gid://shopify/ProductVariant/13', 'gid://shopify/ProductVariant/14'], loc: 'gid://shopify/Location/5' });
  assert.deepEqual(calls.find((c) => /inventoryActivate/.test(c.body.query)).body.variables, { i: 'gid://shopify/InventoryItem/112', l: 'gid://shopify/Location/5' });
  const set = calls.find((c) => /inventorySetQuantities/.test(c.body.query));
  assert.deepEqual(set.body.variables.input, { name: 'available', reason: 'correction', ignoreCompareQuantity: true, quantities: [
    { inventoryItemId: 'gid://shopify/InventoryItem/111', locationId: 'gid://shopify/Location/5', quantity: 7 },
    { inventoryItemId: 'gid://shopify/InventoryItem/112', locationId: 'gid://shopify/Location/5', quantity: 0 },
  ] });
  // Lokasyon env'den (sayı) gelirse sorgulanmaz; userErrors hata olur
  const calls2 = mockFetch((c) => (/nodes\(ids/.test(c.body.query)
    ? { data: { nodes: [{ id: 'gid://shopify/ProductVariant/11', inventoryItem: { id: 'gid://shopify/InventoryItem/111', tracked: true, inventoryLevel: { id: 'L' } } }] } }
    : { data: { inventorySetQuantities: { userErrors: [{ field: ['input', 'quantities', '0'], message: 'Not stocked' }] } } }));
  await assert.rejects(shopify({ ...SENV, SHOPIFY_LOCATION_ID: '77' }, {}).pushStock([{ remoteId: '11', stock: 1 }]), /^Error: Shopify: stok: input\.quantities\.0: Not stocked/);
  assert.equal(calls2.length, 2);
  assert.equal(calls2[0].body.variables.loc, 'gid://shopify/Location/77');
});

test('Shopify: fiyat ürün başına productVariantsBulkUpdate', async () => {
  const calls = mockFetch(() => ({ data: { productVariantsBulkUpdate: { userErrors: [] } } }));
  await shopify(SENV, {}).pushPrice([{ remoteId: '11', remoteProductId: '1', price: 100, listPrice: 120 }, { remoteId: '12', remoteProductId: '1', price: 80, listPrice: 80 }, { remoteId: '21', remoteProductId: '2', price: 9.5, listPrice: 0 }]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body.variables, { p: 'gid://shopify/Product/1', v: [{ id: 'gid://shopify/ProductVariant/11', price: '100', compareAtPrice: '120' }, { id: 'gid://shopify/ProductVariant/12', price: '80', compareAtPrice: null }] });
  assert.deepEqual(calls[1].body.variables, { p: 'gid://shopify/Product/2', v: [{ id: 'gid://shopify/ProductVariant/21', price: '9.5', compareAtPrice: null }] });
});

test('Shopify: kargoya verme pakete göre fulfillmentCreate, takip bilgisiyle', async () => {
  const fo = { data: { order: { fulfillmentOrders: { nodes: [
    { id: 'gid://shopify/FulfillmentOrder/1', status: 'OPEN', lineItems: { nodes: [{ id: 'gid://shopify/FulfillmentOrderLineItem/91', remainingQuantity: 2, lineItem: { id: 'gid://shopify/LineItem/1' } }, { id: 'gid://shopify/FulfillmentOrderLineItem/92', remainingQuantity: 1, lineItem: { id: 'gid://shopify/LineItem/2' } }] } },
    { id: 'gid://shopify/FulfillmentOrder/2', status: 'CLOSED', lineItems: { nodes: [] } },
  ] } } } };
  const calls = mockFetch((c) => (/fulfillmentCreate/.test(c.body.query) ? { data: { fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/555', status: 'SUCCESS' }, userErrors: [] } } } : fo));
  const ch = shopify(SENV, {});
  const r = await ch.ship({ remote_id: '1001' }, { items: [{ line_id: '1', qty: 1 }] }, { cargoCompany: 'Aras Kargo', tracking: 'AR1' });
  assert.deepEqual(r, { remoteId: '555' });
  assert.equal(calls[0].body.variables.id, 'gid://shopify/Order/1001');
  assert.deepEqual(calls[1].body.variables.f, { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/1', fulfillmentOrderLineItems: [{ id: 'gid://shopify/FulfillmentOrderLineItem/91', quantity: 1 }] }],
    notifyCustomer: true, trackingInfo: { number: 'AR1', company: 'Aras Kargo' } });
  // paket kalemi yoksa açık gönderim emrinin tamamı
  await ch.ship({ remote_id: '1001' }, { items: [] }, { tracking: 'X' });
  assert.deepEqual(calls[3].body.variables.f.lineItemsByFulfillmentOrder, [{ fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/1' }]);
  // hepsi kapalıysa istek atılmaz
  const calls2 = mockFetch(() => ({ data: { order: { fulfillmentOrders: { nodes: [{ id: 'x', status: 'CLOSED', lineItems: { nodes: [] } }] } } } }));
  assert.deepEqual(await ch.ship({ remote_id: '1' }, {}, {}), {});
  assert.equal(calls2.length, 1);
});

test('Shopify: tanılama adımları', async () => {
  mockFetch((c) => {
    const q = c.body.query;
    if (/shop \{/.test(q)) return { data: { shop: { name: 'Hastürk', myshopifyDomain: 'hasturk.myshopify.com', currencyCode: 'TRY' } } };
    if (/accessScopes/.test(q)) return { data: { currentAppInstallation: { accessScopes: ['write_orders', 'write_products', 'write_inventory', 'read_locations'].map((handle) => ({ handle })) } } };
    if (/locations/.test(q)) return { data: { locations: { nodes: [{ id: 'gid://shopify/Location/5', isActive: true }] } } };
    if (/orders\(first/.test(q)) return { data: { orders: { pageInfo: { hasNextPage: false }, nodes: [sOrder(7)] } } };
    if (/order\(id/.test(q)) return { data: { order: { name: '#7', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED' } } };
    return { data: { productVariants: { nodes: [{ id: 'v' }] } } };
  });
  const out = await shopify(SENV, {}).diagnose({ orderId: '7' });
  assert.deepEqual(out.map((x) => x.ok), [true, null, true, true, true, true]);
  assert.match(out[1].detail, /write_merchant_managed_fulfillment_orders, write_fulfillments/);
  assert.doesNotMatch(out[1].detail, /read_orders/, 'write_orders okumayı da kapsar');
  assert.match(out[3].detail, /1 sipariş · örnek #7: PAID · UNFULFILLED → new/);
});

// ---------------- WooCommerce ----------------
const WENV = { WOO_URL: 'https://magaza.com/', WOO_KEY: 'ck_1', WOO_SECRET: 'cs_2' };
const AUTH = 'Basic ' + Buffer.from('ck_1:cs_2').toString('base64');
const wOrder = (id, status, extra = {}) => ({ id, number: String(id), status, currency: 'TRY', date_created: '2026-10-01T13:00:00', date_created_gmt: '2026-10-01T10:00:00', date_modified_gmt: '2026-10-02T10:00:00',
  total: '236.00', customer_id: 0, billing: { first_name: 'Ali', last_name: 'Veli', email: 'ali@x.com', phone: '0532', address_1: 'Fatura adr', city: 'Kadıköy', state: 'TR34' },
  shipping: { first_name: 'Ayşe', last_name: 'Veli', address_1: 'Cumhuriyet Mah.', address_2: 'No 5', city: 'Nilüfer', state: 'TR16', phone: '' },
  line_items: [{ id: 501, sku: 'A1', name: 'Gübre 5kg', quantity: 2, price: 100, total: '200.00', total_tax: '36.00', product_id: 40, variation_id: 41, image: { src: 'https://magaza.com/a.jpg' } }],
  meta_data: [], ...extra });
const qs = (u) => Object.fromEntries(new URL(u).searchParams);

test('WooCommerce: adres ve eksik bilgiler, durum eşlemesi', () => {
  assert.equal(woocommerce({ ...WENV, WOO_URL: 'http://magaza.com' }, {}).enabled, false, 'düz HTTP kabul edilmez');
  assert.deepEqual(woocommerce({ WOO_URL: 'https://x.com' }, {}).missing, ['WOO_KEY', 'WOO_SECRET']);
  assert.deepEqual(woocommerce({}, {}).missing, ['WOO_URL', 'WOO_KEY', 'WOO_SECRET']);
  const ch = woocommerce(WENV, {});
  assert.equal(ch.enabled, true);
  assert.deepEqual([ch.caps.ship, ch.caps.accept, ch.caps.manualTracking, ch.caps.label], ['remote', 'local', true, null]);
  assert.deepEqual(['processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'kargoya-verildi', 'delivered'].map(wooStatus), ['new', 'new', 'shipped', 'cancelled', 'returned', 'shipped', 'delivered']);
});

test('WooCommerce: siparişler Basic kimlikle, değiştirilme tarihine göre sayfalı; ödenmemişler atlanır', async () => {
  const page1 = [wOrder(1, 'processing', { meta_data: [{ key: '_wc_shipment_tracking_items', value: [{ tracking_provider: 'yurtici', tracking_number: 'YK9' }] }] }), wOrder(2, 'pending'), wOrder(3, 'failed'), wOrder(4, 'checkout-draft'),
    ...Array.from({ length: 96 }, (_, i) => wOrder(100 + i, 'completed', { shipping: {}, meta_data: [{ key: '_tracking_number', value: 'T' + i }] }))];
  const calls = mockFetch((c) => (qs(c.url).page === '1' ? page1 : [wOrder(9, 'refunded', { currency: 'USD' })]));
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-03T00:00:00Z');
  const list = await woocommerce(WENV, {}).fetchOrders(since, until);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.Authorization, AUTH);
  assert.match(calls[0].url, /^https:\/\/magaza\.com\/wp-json\/wc\/v3\/orders\?/);
  assert.deepEqual(qs(calls[0].url), { modified_after: '2026-10-01T00:00:00Z', modified_before: '2026-10-03T00:00:00Z', dates_are_gmt: 'true', per_page: '100', page: '1', orderby: 'date', order: 'desc' });
  assert.equal(qs(calls[1].url).page, '2');
  assert.equal(list.length, 98, 'pending / failed / checkout-draft alınmaz');
  const o = list[0];
  assert.deepEqual({ remoteId: o.remoteId, orderNumber: o.orderNumber, status: o.status, remoteStatus: o.remoteStatus, total: o.total, currency: o.currency, customer: o.customer, email: o.email, phone: o.phone, customerId: o.customerId, tracking: o.tracking, cargoCompany: o.cargoCompany, orderedAt: o.orderedAt },
    { remoteId: '1', orderNumber: '1', status: 'new', remoteStatus: 'processing', total: 236, currency: 'TRY', customer: 'Ali Veli', email: 'ali@x.com', phone: '0532', customerId: '', tracking: 'YK9', cargoCompany: 'yurtici', orderedAt: Date.parse('2026-10-01T10:00:00Z') });
  assert.deepEqual(o.address, { name: 'Ayşe Veli', line: 'Cumhuriyet Mah. No 5', district: 'Nilüfer', city: 'Bursa', phone: '0532' });
  assert.deepEqual(o.items, [{ lineId: '501', sku: 'A1', barcode: '', name: 'Gübre 5kg', quantity: 2, unitPrice: 118, total: 236, status: '', image: 'https://magaza.com/a.jpg', remoteKey: '41' }]);
  assert.equal(o.packages, null);
  // teslimat adresi boşsa fatura adresi; meta takip no
  assert.deepEqual([list[1].status, list[1].address.city, list[1].address.district, list[1].address.name, list[1].tracking], ['shipped', 'İstanbul', 'Kadıköy', 'Ali Veli', 'T0']);
  assert.deepEqual([list[97].status, list[97].currency], ['returned', 'USD']);
});

test('WooCommerce: modified_after tanınmazsa sipariş tarihine geçilir; geçmiş aktarımı after/before kullanır', async () => {
  const calls = mockFetch((c) => (qs(c.url).modified_after ? [wOrder(1, 'processing', { date_modified_gmt: '2025-01-01T00:00:00' })] : [wOrder(1, 'processing')]));
  const ch = woocommerce(WENV, {}), since = Date.parse('2026-10-01T00:00:00Z');
  const list = await ch.fetchOrders(since, since + 864e5);
  assert.equal(list.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(qs(calls[1].url).after, '2026-10-01T00:00:00Z');
  assert.equal(qs(calls[1].url).modified_after, undefined);
  await ch.fetchOrders(since, since + 864e5);
  assert.equal(calls.length, 3, 'sonraki senkronlar doğrudan sipariş tarihiyle');
  const calls2 = mockFetch(() => []);
  await woocommerce(WENV, {}).fetchOrders(since, since + 864e5, { byOrdered: true });
  assert.deepEqual([qs(calls2[0].url).after, qs(calls2[0].url).before], ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z']);
});

test('WooCommerce: 401 olursa anahtarlar sorgu parametresiyle denenir ve öyle devam edilir', async () => {
  const calls = mockFetch((c) => (c.headers.Authorization ? { status: 401, body: { code: 'woocommerce_rest_cannot_view', message: 'Sorry, you cannot list resources.' } } : []));
  const ch = woocommerce(WENV, {});
  await ch.fetchOrders(0, 1, { byOrdered: true });
  await ch.fetchListings();
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers.Authorization, AUTH);
  for (const c of calls.slice(1)) {
    assert.equal(c.headers.Authorization, undefined);
    assert.deepEqual([qs(c.url).consumer_key, qs(c.url).consumer_secret], ['ck_1', 'cs_2']);
  }
  // ikisi de 401 ise ilk hata bildirilir
  mockFetch(() => ({ status: 401, body: { message: 'Consumer key is invalid.' } }));
  await assert.rejects(woocommerce(WENV, {}).fetchListings(), /HTTP 401 Consumer key is invalid/);
});

test('WooCommerce: ürünler; değişken ürünün varyasyonları ayrı okunur', async () => {
  const simple = { id: 10, type: 'simple', name: 'Kürek', sku: 'K1', global_unique_id: '8690001', price: '90', regular_price: '120', sale_price: '90', manage_stock: true, stock_quantity: 4, status: 'publish', images: [{ src: 'https://magaza.com/k.jpg' }] };
  const variable = { id: 20, type: 'variable', name: 'Tohum', sku: '', price: '', manage_stock: true, stock_quantity: 9, status: 'publish', images: [{ src: 'https://magaza.com/t.jpg' }] };
  const calls = mockFetch((c) => (/\/products\/20\/variations/.test(c.url)
    ? [{ id: 21, sku: 'T-1', price: '50', regular_price: '50', manage_stock: 'parent', stock_quantity: null, status: 'publish', image: { src: 'https://magaza.com/t1.jpg' }, attributes: [{ name: 'Ağırlık', option: '1 kg' }] },
      { id: 22, sku: 'T-5', price: '200', regular_price: '', manage_stock: false, stock_quantity: null, status: 'private', image: null, attributes: [{ name: 'Ağırlık', option: '5 kg' }] }]
    : [simple, variable]));
  const out = await woocommerce(WENV, {}).fetchListings();
  assert.deepEqual(qs(calls[0].url), { per_page: '100', page: '1', status: 'publish' });
  assert.match(calls[1].url, /\/wp-json\/wc\/v3\/products\/20\/variations\?per_page=100&page=1$/);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { remoteId: '10', remoteProductId: '10', sku: 'K1', barcode: '8690001', name: 'Kürek', groupName: 'Kürek', variantName: '', image: 'https://magaza.com/k.jpg', images: ['https://magaza.com/k.jpg'], price: 90, listPrice: 120, stock: 4, active: true });
  assert.deepEqual(out[1], { remoteId: '21', remoteProductId: '20', sku: 'T-1', barcode: '', name: 'Tohum - 1 kg', groupName: 'Tohum', variantName: '1 kg', image: 'https://magaza.com/t1.jpg', images: ['https://magaza.com/t1.jpg', 'https://magaza.com/t.jpg'], price: 50, listPrice: 50, stock: 9, active: true });
  assert.deepEqual([out[2].stock, out[2].active, out[2].listPrice, out[2].image], [0, false, 200, 'https://magaza.com/t.jpg']);
});

test('WooCommerce: stok ve fiyat toplu (batch) gönderilir; varyasyonlar ana ürün altında', async () => {
  const calls = mockFetch((c) => ({ update: c.body.update.map((u) => ({ id: u.id })) }));
  const ch = woocommerce(WENV, {});
  await ch.pushStock([{ remoteId: '10', remoteProductId: '10', stock: 4 }, { remoteId: '21', remoteProductId: '20', stock: -2 }, { remoteId: '22', remoteProductId: '20', stock: 3 }, { remoteId: '30', stock: 1 }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/wp-json\/wc\/v3\/products\/batch$/);
  assert.deepEqual(calls[0].body, { update: [{ id: 10, manage_stock: true, stock_quantity: 4 }, { id: 30, manage_stock: true, stock_quantity: 1 }] });
  assert.match(calls[1].url, /\/products\/20\/variations\/batch$/);
  assert.deepEqual(calls[1].body, { update: [{ id: 21, manage_stock: true, stock_quantity: 0 }, { id: 22, manage_stock: true, stock_quantity: 3 }] });
  await ch.pushPrice([{ remoteId: '10', remoteProductId: '10', price: 90, listPrice: 120 }, { remoteId: '11', remoteProductId: '11', price: 75.5, listPrice: 0 }]);
  assert.deepEqual(calls[2].body, { update: [{ id: 10, regular_price: '120', sale_price: '90' }, { id: 11, regular_price: '75.5', sale_price: '' }] });
  // 100'den fazlası parçalanır; kalem hatası bildirilir
  const many = Array.from({ length: 150 }, (_, i) => ({ remoteId: String(i + 1), remoteProductId: String(i + 1), stock: 1 }));
  const calls2 = mockFetch((c) => ({ update: c.body.update.map((u) => (u.id === 120 ? { id: 120, error: { code: 'woocommerce_rest_product_invalid_id', message: 'Geçersiz kimlik.' } } : { id: u.id })) }));
  await assert.rejects(ch.pushStock(many), /WooCommerce: 1 ürün güncellenemedi \(120: Geçersiz kimlik\.\)/);
  assert.deepEqual(calls2.map((c) => c.body.update.length), [100, 50]);
});

test('WooCommerce: kargoya verme not + completed; başka açık paket varsa yalnız not', async () => {
  const calls = mockFetch(() => ({ id: 1 }));
  const ch = woocommerce(WENV, {});
  await ch.ship({ remote_id: '77', packages: [{ id: 1, status: 'open' }] }, { id: 1 }, { cargoCompany: 'Aras Kargo', tracking: 'AR5' });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/orders\/77\/notes$/);
  assert.deepEqual(calls[0].body, { note: 'Kargo: Aras Kargo · Takip: AR5', customer_note: true });
  assert.equal(calls[1].method, 'PUT');
  assert.match(calls[1].url, /\/orders\/77$/);
  assert.deepEqual(calls[1].body, { status: 'completed' });
  await ch.ship({ remote_id: '78', packages: [{ id: 1, status: 'open' }, { id: 2, status: 'open' }] }, { id: 1 }, { tracking: 'X1' });
  assert.equal(calls.length, 3, 'ikinci paket açık: sipariş tamamlanmaz');
  assert.deepEqual(calls[2].body, { note: 'Takip: X1', customer_note: true });
});

test('WooCommerce: tanılama', async () => {
  mockFetch((c) => (/\/orders\/55/.test(c.url) ? { id: 55, number: '55', status: 'on-hold' } : /\/orders/.test(c.url) ? [wOrder(5, 'completed')] : [{ id: 1 }]));
  const out = await woocommerce(WENV, {}).diagnose({ orderId: '55' });
  assert.deepEqual(out.map((x) => x.ok), [true, true, true, null]);
  assert.match(out[0].detail, /HTTP Basic · ürün örneği alındı/);
  assert.match(out[1].detail, /1 sipariş · örnek #5: completed → shipped/);
  assert.match(out[2].detail, /#55: on-hold → new/);
  mockFetch(() => ({ status: 404, body: { code: 'rest_no_route', message: 'No route' } }));
  const bad = await woocommerce(WENV, {}).diagnose({});
  assert.deepEqual(bad.map((x) => x.ok), [false, null]);
  assert.match(bad[0].detail, /HTTP 404/);
});
