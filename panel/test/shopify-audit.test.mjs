// Shopify denetimi: API sürümü, client credentials, KDV hariç mağaza, kısmi iptal, korunan müşteri verisi, sayfa sınırı, tek sipariş, lokasyon stoğu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopify, shopifyStatus, shopifyCarrier, SHOPIFY_VER } from '../src/channels/shopify.js';

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const ct = (opts.headers || {})['Content-Type'] || '';
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, raw: opts.body, body: opts.body && /json/.test(ct) ? JSON.parse(opts.body) : undefined };
    calls.push(c);
    let r = await handler(c);
    if (!r || r.status == null || r.body === undefined) r = { status: 200, body: r };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const SENV = { SHOPIFY_STORE: 'hasturk', SHOPIFY_TOKEN: 'shpat_x' };
const money = (a, cur) => ({ shopMoney: { amount: String(a), ...(cur ? { currencyCode: cur } : {}) } });
const order = (id, extra = {}) => ({ id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T11:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED',
  cancelledAt: null, taxesIncluded: true, email: 'a@b.com', phone: null, customer: { id: 'gid://shopify/Customer/9', firstName: 'Ayşe', lastName: 'Kaya' }, shippingAddress: { name: 'Ayşe Kaya', city: 'Bornova', province: 'İzmir' },
  totalPriceSet: money(240, 'TRY'), currentTotalPriceSet: money(240), lineItems: { pageInfo: { hasNextPage: false }, nodes: [] }, fulfillments: [], ...extra });

test('Shopify: desteklenen API sürümü (2025-07 16 Temmuz 2026\'da erişimden kalktı)', () => {
  assert.equal(SHOPIFY_VER, '2026-10');
});

test('Shopify: Client ID / secret ile client credentials belirteci alınır, saklanır, 401\'de yenilenir', async () => {
  const store = new Map();
  const kv = { get: async (k) => store.get(k), set: async (k, v) => { store.set(k, v); } };
  let n = 0, rejectOnce = true;
  const calls = mockFetch((c) => {
    if (/oauth\/access_token/.test(c.url)) return { access_token: 'tok' + ++n, scope: 'read_orders', expires_in: 86399 };
    if (c.headers['X-Shopify-Access-Token'] === 'tok1' && rejectOnce) { rejectOnce = false; return { status: 401, body: { errors: '[API] Invalid API key or access token' } }; }
    return { data: { shop: { name: 'H', myshopifyDomain: 'hasturk.myshopify.com', currencyCode: 'TRY' } } };
  });
  const env = { SHOPIFY_STORE: 'hasturk', SHOPIFY_CLIENT_ID: 'cid', SHOPIFY_CLIENT_SECRET: 'csec' };
  const ch = shopify(env, { kv });
  assert.equal(ch.enabled, true);
  assert.deepEqual(shopify({ SHOPIFY_STORE: 'hasturk', SHOPIFY_CLIENT_ID: 'cid' }, {}).missing, ['SHOPIFY_CLIENT_SECRET']);
  assert.deepEqual(shopify({ SHOPIFY_STORE: 'hasturk' }, {}).missing, ['SHOPIFY_TOKEN']);
  const out = await ch.diagnose({});
  assert.equal(out[0].ok, true);
  assert.match(out[0].detail, /Client ID \/ secret/);
  assert.equal(calls[0].url, 'https://hasturk.myshopify.com/admin/oauth/access_token');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].raw)), { grant_type: 'client_credentials', client_id: 'cid', client_secret: 'csec' });
  // 401 → yeni belirteç → aynı istek tekrar
  assert.equal(calls[1].headers['X-Shopify-Access-Token'], 'tok1');
  assert.match(calls[2].url, /oauth\/access_token/);
  assert.equal(calls[3].headers['X-Shopify-Access-Token'], 'tok2');
  assert.equal(store.get('token').token, 'tok2');
  assert.ok(store.get('token').exp > Date.now() + 86000e3);
  // Yeni kanal nesnesi (ör. başka bir istek) saklanan belirteci kullanır: yeniden belirteç istenmez
  const calls2 = mockFetch(() => ({ data: { shop: { name: 'H', myshopifyDomain: 'x', currencyCode: 'TRY' } } }));
  await shopify(env, { kv }).diagnose({}).catch(() => null);
  assert.ok(!calls2.some((c) => /oauth/.test(c.url)));
  assert.equal(calls2[0].headers['X-Shopify-Access-Token'], 'tok2');
  // Sabit belirteç (shpat_) varsa client credentials kullanılmaz
  const calls3 = mockFetch(() => ({ data: { shop: { name: 'H', myshopifyDomain: 'x', currencyCode: 'TRY' } } }));
  await shopify({ ...env, SHOPIFY_TOKEN: 'shpat_x' }, {}).diagnose({}).catch(() => null);
  assert.equal(calls3[0].headers['X-Shopify-Access-Token'], 'shpat_x');
});

test('Shopify: KDV hariç mağazada satır vergisi eklenir; kısmen çıkarılan satır kalan adetle; güncel toplam', async () => {
  const li = { id: 'gid://shopify/LineItem/1', sku: 'A', name: 'Gübre', quantity: 3, currentQuantity: 2, variant: { id: 'gid://shopify/ProductVariant/11', barcode: '' }, image: null,
    originalUnitPriceSet: money(100), discountedTotalSet: money(270), taxLines: [{ priceSet: money(54) }] };
  const calls = mockFetch(() => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [order(1, { taxesIncluded: false, currentTotalPriceSet: money(216), totalPriceSet: money(324, 'TRY'), lineItems: { pageInfo: { hasNextPage: false }, nodes: [li] } })] } } }));
  const [o] = await shopify(SENV, {}).fetchOrders(0, 1);
  assert.match(calls[0].body.query, /discountedTotalSet\(withCodeDiscounts: true\)/);
  assert.match(calls[0].body.query, /taxesIncluded/);
  assert.deepEqual([o.items[0].quantity, o.items[0].total, o.items[0].unitPrice, o.items[0].status], [2, 216, 108, '']);
  assert.equal(o.total, 216);
});

test('Shopify: durum eşlemesi — gönderilmeden iade edilen iptal, gönderim gerektirmeyen teslim, iptal edilen gönderim sayılmaz', () => {
  assert.equal(shopifyStatus({ displayFinancialStatus: 'REFUNDED', displayFulfillmentStatus: 'UNFULFILLED', fulfillments: [] }), 'cancelled');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'REFUNDED', displayFulfillmentStatus: 'FULFILLED', fulfillments: [{ displayStatus: 'DELIVERED' }] }), 'returned');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLMENT_NOT_REQUIRED' }), 'delivered');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', fulfillments: [{ displayStatus: 'CANCELED' }, { displayStatus: 'DELIVERED' }] }), 'delivered');
  assert.equal(shopifyStatus({ displayFinancialStatus: 'PENDING', displayFulfillmentStatus: 'ON_HOLD' }), 'new');
});

test('Shopify: korunan müşteri verisi izni yoksa siparişler boş alanlarla gelir ve uyarı verilir', async () => {
  mockFetch(() => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [order(5, { customer: null, email: null, shippingAddress: null })] } },
    errors: [{ message: 'This app is not approved to access the Customer object.', path: ['orders', 'nodes', 0, 'customer'] }, { message: 'This app is not approved to use the email field.', path: ['orders', 'nodes', 0, 'email'] }] }));
  const list = await shopify(SENV, {}).fetchOrders(0, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].customer, '');
  assert.equal(list.warnings.length, 1);
  assert.match(list.warnings[0], /korunan müşteri verisi/);
  assert.equal(list.partialUntil, undefined);
  // müşteri verisi dışı hata yine hata
  mockFetch(() => ({ data: { orders: null }, errors: [{ message: 'Access denied for orders field.', path: ['orders'] }] }));
  await assert.rejects(shopify(SENV, {}).fetchOrders(0, 1), /^Error: Shopify: Access denied/);
});

test('Shopify: 100 sayfa sınırına gelinirse partialUntil ve uyarı (imleç kayıp sipariş bırakmaz)', async () => {
  let p = 0;
  mockFetch(() => { p++; return { data: { orders: { pageInfo: { hasNextPage: true, endCursor: 'c' + p }, nodes: [order(p, { updatedAt: new Date(Date.parse('2026-10-01T00:00:00Z') + p * 60e3).toISOString() })] } } }; });
  const since = Date.parse('2026-09-30T00:00:00Z');
  const list = await shopify(SENV, {}).fetchOrders(since, Date.parse('2026-10-03T00:00:00Z'));
  assert.equal(p, 100);
  assert.equal(list.length, 100);
  assert.equal(list.partialUntil, Date.parse('2026-10-01T00:00:00Z') + 100 * 60e3);
  assert.match(list.warnings[0], /100\+ sipariş/); // test her sayfada 1 sipariş döndürür
  // geçmiş aktarımı (sipariş tarihine göre) imleç kullanmaz
  p = 0;
  const old = await shopify(SENV, {}).fetchOrders(since, since + 864e5, { byOrdered: true });
  assert.equal(old.partialUntil, undefined);
});

test('Shopify: tek sipariş (yenile) ve kanalda var mı', async () => {
  const calls = mockFetch((c) => {
    if (/order\(id: \$id\) \{ id \}/.test(c.body.query)) return { data: { order: c.body.variables.id.endsWith('/7') ? { id: c.body.variables.id } : null } };
    if (/order\(id: \$id\) \{ lineItems/.test(c.body.query)) return { data: { order: { lineItems: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'gid://shopify/LineItem/2', quantity: 1, currentQuantity: 1, discountedTotalSet: money(10), variant: null }] } } } };
    return { data: { order: c.body.variables.id.endsWith('/7') ? order(7, { lineItems: { pageInfo: { hasNextPage: true, endCursor: 'L' }, nodes: [{ id: 'gid://shopify/LineItem/1', quantity: 1, currentQuantity: 1, discountedTotalSet: money(5), variant: null }] } }) : null } };
  });
  const ch = shopify(SENV, {});
  const o = await ch.fetchOne('7');
  assert.equal(calls[0].body.variables.id, 'gid://shopify/Order/7');
  assert.deepEqual([o.remoteId, o.orderNumber, o.items.length, o.status], ['7', '7', 2, 'new']);
  await assert.rejects(ch.fetchOne('8'), /sipariş bulunamadı/);
  assert.equal(await ch.orderExists('7'), true);
  assert.equal(await ch.orderExists('8'), false);
});

test('Shopify: ürün stoğu panelin yazdığı lokasyondan okunur; lokasyon okunamazsa toplam', async () => {
  const v = (id, inv, extra = {}) => ({ id: `gid://shopify/ProductVariant/${id}`, sku: 'S' + id, barcode: '', title: 'Default Title', price: '10.00', compareAtPrice: null, inventoryQuantity: 9, image: null,
    product: { id: 'gid://shopify/Product/1', title: 'P', status: 'ACTIVE', featuredMedia: null }, inventoryItem: inv, ...extra });
  const calls = mockFetch((c) => (/^\{ location \{/.test(c.body.query) ? { data: { location: { id: 'gid://shopify/Location/3', isActive: true } } }
    : { data: { productVariants: { pageInfo: { hasNextPage: false }, nodes: [v(1, { tracked: true, inventoryLevel: { quantities: [{ name: 'available', quantity: 4 }] } }), v(2, { tracked: true, inventoryLevel: null })] } } }));
  const [a, b] = await shopify(SENV, {}).fetchListings();
  const q = calls.find((c) => /productVariants/.test(c.body.query));
  assert.equal(q.body.variables.loc, 'gid://shopify/Location/3');
  assert.match(q.body.query, /inventoryLevel\(locationId: \$loc\) \{ quantities\(names: \["available"\]\)/);
  assert.deepEqual([a.stock, b.stock], [4, 9]);
});

test('Shopify: kargo adı Shopify\'ın tanıdığı adla gönderilir (takip bağlantısı)', async () => {
  assert.deepEqual(['PTT Kargo', 'Yurtiçi Kargo', 'Yurtici', 'Aras Kargo (Ücretli)', 'Sürat Kargo', 'MNG Kargo', 'DHL eCommerce', ''].map(shopifyCarrier),
    ['PTT', 'Yurtiçi Kargo', 'Yurtiçi Kargo', 'Aras Kargo', 'Sürat Kargo', 'MNG Kargo', 'DHL eCommerce', '']);
  const calls = mockFetch((c) => (/fulfillmentCreate/.test(c.body.query) ? { data: { fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/1' }, userErrors: [] } } }
    : { data: { order: { fulfillmentOrders: { nodes: [{ id: 'gid://shopify/FulfillmentOrder/1', status: 'OPEN', lineItems: { nodes: [] } }] } } } }));
  await shopify(SENV, {}).ship({ remote_id: '1' }, {}, { cargoCompany: 'PTT Kargo', tracking: 'KP1' });
  assert.deepEqual(calls[1].body.variables.f.trackingInfo, { number: 'KP1', company: 'PTT' });
});

test('Shopify: tanılama birden çok online lokasyonu ve read_all_orders eksikliğini bildirir', async () => {
  mockFetch((c) => {
    const q = c.body.query;
    if (/shop \{/.test(q)) return { data: { shop: { name: 'H', myshopifyDomain: 'hasturk.myshopify.com', currencyCode: 'TRY' } } };
    if (/accessScopes/.test(q)) return { data: { currentAppInstallation: { accessScopes: ['read_orders', 'write_products', 'write_inventory', 'read_locations', 'write_merchant_managed_fulfillment_orders', 'write_fulfillments'].map((handle) => ({ handle })) } } };
    if (/^\{ location \{/.test(q)) return { data: { location: { id: 'gid://shopify/Location/1', isActive: true } } };
    if (/locations\(first: 20/.test(q)) return { data: { locations: { nodes: [{ id: 'gid://shopify/Location/1', name: 'Depo', fulfillsOnlineOrders: true }, { id: 'gid://shopify/Location/2', name: 'Mağaza', fulfillsOnlineOrders: true }, { id: 'gid://shopify/Location/3', name: 'Arşiv', fulfillsOnlineOrders: false }] } } };
    if (/orders\(first/.test(q)) return { data: { orders: { pageInfo: { hasNextPage: false }, nodes: [] } } };
    return { data: { productVariants: { nodes: [{ id: 'v' }] } } };
  });
  const out = await shopify(SENV, {}).diagnose({});
  assert.deepEqual(out.map((x) => x.ok), [true, true, null, true, true]);
  assert.match(out[0].detail, /API 2026-10 · erişim belirteci/);
  assert.match(out[1].detail, /read_all_orders yok/);
  assert.match(out[2].detail, /^Depo · gid:\/\/shopify\/Location\/1 \(ana lokasyon\) · dikkat: 1 lokasyon daha .*Mağaza/);
});
