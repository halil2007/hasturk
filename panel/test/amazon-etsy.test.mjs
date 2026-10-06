// Amazon (SP-API) ve Etsy (Open API v3) kanalları: örnek API cevaplarıyla (ağa çıkmadan) istekler ve dönüşümler denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amazon } from '../src/channels/amazon.js';
import { etsy } from '../src/channels/etsy.js';

// Kısa beklemeler (kota için sleep) testte anında geçer; uzun zaman aşımları olduğu gibi kalır
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 5000 ? ms : 0, ...a);

// routes: [regex, gövde | (url, opts, calls) => gövde | { status, body }]
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} };
    calls.push(c);
    const hit = routes.find(([re, , m]) => re.test(c.url) && (!m || m === c.method));
    let out = hit ? (typeof hit[1] === 'function' ? hit[1](c.url, opts, calls) : hit[1]) : { status: 404, body: { message: 'yok' } };
    if (!(out && out.status && 'body' in out)) out = { status: 200, body: out };
    return new Response(out.body == null ? null : JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const qs = (u) => Object.fromEntries(new URL(u).searchParams);

// ---------------------------------------------------------------- Amazon
const AENV = { AMAZON_SELLER_ID: 'A1SELLER', AMAZON_CLIENT_ID: 'amzn1.application-oa2-client.x', AMAZON_CLIENT_SECRET: 'sec', AMAZON_REFRESH_TOKEN: 'Atzr|r' };
const order = (id, st, extra = {}) => ({ AmazonOrderId: id, OrderStatus: st, PurchaseDate: '2026-10-01T10:00:00Z', LastUpdateDate: '2026-10-01T12:00:00Z', LatestShipDate: '2026-10-03T21:00:00Z',
  FulfillmentChannel: 'MFN', OrderTotal: { CurrencyCode: 'TRY', Amount: '250.00' }, ShippingAddress: { City: 'Kadıköy', StateOrRegion: 'İstanbul', CountryCode: 'TR' }, ...extra });

test('Amazon: eksik bilgi, bölge / sandbox adresi ve yetenekler', async () => {
  const off = amazon({ AMAZON_SELLER_ID: 'A1' }, { id: 'amazon' });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.missing, ['AMAZON_CLIENT_ID', 'AMAZON_CLIENT_SECRET', 'AMAZON_REFRESH_TOKEN']);
  const ch = amazon(AENV, { id: 'amazon', name: 'Amazon' });
  assert.equal(ch.enabled, true); assert.equal(ch.type, 'amazon'); assert.equal(ch.name, 'Amazon');
  assert.deepEqual(ch.caps, { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true });
  for (const [env, host] of [[{}, 'sellingpartnerapi-eu.amazon.com'], [{ AMAZON_REGION: 'na' }, 'sellingpartnerapi-na.amazon.com'], [{ AMAZON_REGION: 'fe', AMAZON_SANDBOX: '1' }, 'sandbox.sellingpartnerapi-fe.amazon.com']]) {
    const calls = mockFetch([[/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }], [/\/listings\//, { items: [] }]]);
    await amazon({ ...AENV, ...env }, { id: 'amazon' }).fetchListings();
    assert.equal(new URL(calls[1].url).host, host);
  }
});

test('Amazon: LWA belirteci alınır ve saklanır; siparişler sayfalanır, satırlar okunur, durum / adres / tutar dönüşür', async () => {
  const calls = mockFetch([
    [/auth\/o2\/token/, { access_token: 'AT1', expires_in: 3600, token_type: 'bearer' }],
    [/\/orders\/v0\/orders\/111-1\/orderItems\?NextToken=IT2/, { payload: { OrderItems: [{ OrderItemId: 'OI2', SellerSKU: 'SKU-B', Title: 'Kürek', QuantityOrdered: 1, ItemPrice: { Amount: '50.00' } }] } }],
    [/\/orders\/v0\/orders\/111-1\/orderItems$/, { payload: { AmazonOrderId: '111-1', OrderItems: [
      { OrderItemId: 'OI1', SellerSKU: 'SKU-A', ASIN: 'B01', Title: 'Gübre 5 kg', QuantityOrdered: 2, ItemPrice: { CurrencyCode: 'TRY', Amount: '200.00' } }], NextToken: 'IT2' } }],
    [/\/orders\/v0\/orders\/222-2\/orderItems/, { payload: { OrderItems: [{ OrderItemId: 'OI3', SellerSKU: 'SKU-A', Title: 'Gübre', QuantityOrdered: 0, ItemPrice: { Amount: '0' } }] } }],
    [/\/orders\/v0\/orders\/333-3\/orderItems/, { payload: { OrderItems: [{ OrderItemId: 'OI4', SellerSKU: 'SKU-C', Title: 'Tohum', QuantityOrdered: 3 }] } }],
    [/\/orders\/v0\/orders\?.*NextToken=P2/, { payload: { Orders: [order('333-3', 'Pending', { OrderTotal: undefined, ShippingAddress: undefined, FulfillmentChannel: 'AFN', LastUpdateDate: '2026-10-01T09:00:00Z' })] } }],
    [/\/orders\/v0\/orders\?/, { payload: { Orders: [order('111-1', 'Unshipped'), order('222-2', 'Canceled', { LastUpdateDate: '2026-10-01T13:00:00Z' })], NextToken: 'P2' } }],
  ]);
  const ch = amazon(AENV, { id: 'amazon' });
  const since = Date.parse('2026-10-01T00:00:00Z');
  const orders = await ch.fetchOrders(since, Date.now());
  // belirteç isteği
  assert.equal(calls[0].url, 'https://api.amazon.com/auth/o2/token');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), { grant_type: 'refresh_token', refresh_token: 'Atzr|r', client_id: 'amzn1.application-oa2-client.x', client_secret: 'sec' });
  // sipariş listesi: son güncelleme aralığı (bitiş "şimdi" olduğu için Before gönderilmez)
  const list = calls.filter((c) => /\/orders\/v0\/orders\?/.test(c.url));
  assert.equal(list.length, 2);
  assert.match(list[0].url, /^https:\/\/sellingpartnerapi-eu\.amazon\.com\/orders\/v0\/orders\?/);
  assert.deepEqual(qs(list[0].url), { MarketplaceIds: 'A33AVAJ2PDY3EV', LastUpdatedAfter: '2026-10-01T00:00:00Z', MaxResultsPerPage: '100' });
  assert.deepEqual(qs(list[1].url), { MarketplaceIds: 'A33AVAJ2PDY3EV', NextToken: 'P2' });
  for (const c of calls.slice(1)) { assert.equal(c.headers['x-amz-access-token'], 'AT1'); assert.ok(!c.headers.Authorization); }
  // en yeni güncellenen önce
  assert.deepEqual(orders.map((o) => o.remoteId), ['222-2', '111-1', '333-3']);
  const [c, u, p] = orders;
  assert.equal(u.status, 'new'); assert.equal(u.remoteStatus, 'Unshipped');
  assert.equal(u.total, 250); assert.equal(u.currency, 'TRY');
  assert.equal(u.orderedAt, Date.parse('2026-10-01T10:00:00Z')); assert.equal(u.shipBy, Date.parse('2026-10-03T21:00:00Z'));
  assert.deepEqual(u.address, { name: '', line: '', district: 'Kadıköy', city: 'İstanbul', phone: '' });
  assert.equal(u.customer, '');
  assert.equal(u.packages, null);
  assert.deepEqual(u.items, [
    { lineId: 'OI1', sku: 'SKU-A', barcode: '', name: 'Gübre 5 kg', image: '', quantity: 2, unitPrice: 100, total: 200, status: '', remoteKey: 'SKU-A' },
    { lineId: 'OI2', sku: 'SKU-B', barcode: '', name: 'Kürek', image: '', quantity: 1, unitPrice: 50, total: 50, status: '', remoteKey: 'SKU-B' },
  ]);
  assert.equal(c.status, 'cancelled'); assert.equal(c.items[0].status, 'cancelled');
  assert.equal(p.status, 'new'); assert.equal(p.remoteStatus, 'Pending (FBA)');
  assert.equal(p.total, 0, 'Pending siparişte tutar / fiyat henüz yok'); assert.equal(p.currency, 'TRY');
  // belirteç ikinci çağrıda yeniden alınmaz
  await ch.fetchOrders(since, Date.now());
  assert.equal(calls.filter((x) => /auth\/o2\/token/.test(x.url)).length, 1);
});

test('Amazon: durum eşlemesi; geçmiş aktarımında CreatedAfter / CreatedBefore; son 2 dk istenmez', async () => {
  const sts = ['Pending', 'Unshipped', 'PartiallyShipped', 'Shipped', 'Canceled', 'Unfulfillable', 'InvoiceUnconfirmed'];
  const calls = mockFetch([
    [/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }],
    [/orderItems/, { payload: { OrderItems: [] } }],
    [/\/orders\/v0\/orders\?/, { payload: { Orders: sts.map((s, i) => order('O' + i, s)) } }],
  ]);
  const ch = amazon(AENV, { id: 'amazon' });
  const from = Date.parse('2026-09-01T00:00:00Z'), to = Date.parse('2026-09-08T00:00:00Z');
  const orders = await ch.fetchOrders(from, to, { byOrdered: true });
  assert.deepEqual(qs(calls[1].url), { MarketplaceIds: 'A33AVAJ2PDY3EV', CreatedAfter: '2026-09-01T00:00:00Z', CreatedBefore: '2026-09-08T00:00:00Z', MaxResultsPerPage: '100' });
  assert.deepEqual(Object.fromEntries(orders.map((o) => [o.remoteStatus, o.status])),
    { Pending: 'new', Unshipped: 'new', PartiallyShipped: 'processing', Shipped: 'shipped', Canceled: 'cancelled', Unfulfillable: 'cancelled', InvoiceUnconfirmed: 'new' });
  const n = calls.length;
  assert.deepEqual(await ch.fetchOrders(Date.now() - 60e3, Date.now()), []);
  assert.equal(calls.length, n, 'son 2 dakika için istek atılmaz');
});

test('Amazon: çok siparişte en yeni 100 işlenir, uyarı döner', async () => {
  const many = Array.from({ length: 105 }, (_, i) => order('X' + i, 'Shipped', { LastUpdateDate: new Date(Date.parse('2026-10-01T00:00:00Z') + i * 60e3).toISOString() }));
  const calls = mockFetch([
    [/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }],
    [/orderItems/, { payload: { OrderItems: [{ OrderItemId: '1', SellerSKU: 'S', QuantityOrdered: 1, ItemPrice: { Amount: '10' } }] } }],
    [/\/orders\/v0\/orders\?/, { payload: { Orders: many } }],
  ]);
  const orders = await amazon(AENV, { id: 'amazon' }).fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(orders.length, 100);
  assert.equal(orders[0].remoteId, 'X104');
  assert.ok(!orders.some((o) => o.remoteId === 'X4'));
  assert.equal(calls.filter((c) => /orderItems/.test(c.url)).length, 100);
  assert.match(orders.warnings[0], /105 siparişin en yeni 100/);
});

test('Amazon: ürün listesi (searchListingsItems) sayfalanır ve dönüşür', async () => {
  const calls = mockFetch([
    [/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }],
    [/\/listings\/2021-08-01\/items\/A1SELLER\//, { status: 'ACCEPTED', issues: [] }, 'PATCH'],
    [/pageToken=T2/, { items: [{ sku: 'SKU-B', summaries: [{ marketplaceId: 'A33AVAJ2PDY3EV', asin: 'B02', itemName: 'Kürek', status: ['DISCOVERABLE'] }], offers: [], fulfillmentAvailability: [{ fulfillmentChannelCode: 'AMAZON_EU', quantity: 4 }] }] }],
    [/\/listings\/2021-08-01\/items\/A1SELLER\?/, { numberOfResults: 2, pagination: { nextToken: 'T2' }, items: [{ sku: 'SKU A/1',
      summaries: [{ marketplaceId: 'A33AVAJ2PDY3EV', asin: 'B01', productType: 'FERTILIZER', itemName: 'Gübre 5 kg', status: ['BUYABLE', 'DISCOVERABLE'], mainImage: { link: 'https://m.media-amazon.com/images/I/a.jpg' } }],
      offers: [{ marketplaceId: 'A33AVAJ2PDY3EV', offerType: 'B2C', price: { currencyCode: 'TRY', amount: '149.90' } }],
      fulfillmentAvailability: [{ fulfillmentChannelCode: 'DEFAULT', quantity: 12 }] }] }],
  ]);
  const ch = amazon(AENV, { id: 'amazon' });
  const ls = await ch.fetchListings();
  assert.deepEqual(qs(calls[1].url), { marketplaceIds: 'A33AVAJ2PDY3EV', includedData: 'summaries,offers,fulfillmentAvailability', pageSize: '20' });
  assert.equal(qs(calls[2].url).pageToken, 'T2');
  assert.deepEqual(ls[0], { remoteId: 'SKU A/1', remoteProductId: 'B01', sku: 'SKU A/1', barcode: '', name: 'Gübre 5 kg', groupName: 'Gübre 5 kg', variantName: '',
    image: 'https://m.media-amazon.com/images/I/a.jpg', images: ['https://m.media-amazon.com/images/I/a.jpg'], price: 149.9, listPrice: 149.9, stock: 12, active: true });
  assert.equal(ls[1].active, false); assert.equal(ls[1].stock, 4); assert.equal(ls[1].price, 0); assert.deepEqual(ls[1].images, []);

  // stok / fiyat: SKU başına PATCH; ürün tipi listeden gelir (bilinmiyorsa PRODUCT)
  await ch.pushStock([{ remoteId: 'SKU A/1', stock: 7.4 }, { remoteId: 'SKU-Z', stock: -2 }]);
  const pt = calls.filter((c) => c.method === 'PATCH');
  assert.equal(pt[0].url, 'https://sellingpartnerapi-eu.amazon.com/listings/2021-08-01/items/A1SELLER/SKU%20A%2F1?marketplaceIds=A33AVAJ2PDY3EV');
  assert.deepEqual(JSON.parse(pt[0].body), { productType: 'FERTILIZER', patches: [{ op: 'replace', path: '/attributes/fulfillment_availability', value: [{ fulfillment_channel_code: 'DEFAULT', quantity: 7 }] }] });
  assert.deepEqual(JSON.parse(pt[1].body), { productType: 'PRODUCT', patches: [{ op: 'replace', path: '/attributes/fulfillment_availability', value: [{ fulfillment_channel_code: 'DEFAULT', quantity: 0 }] }] });
  await ch.pushPrice([{ remoteId: 'SKU-B', price: 99.5, listPrice: 120 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { productType: 'PRODUCT', patches: [{ op: 'replace', path: '/attributes/purchasable_offer',
    value: [{ marketplace_id: 'A33AVAJ2PDY3EV', currency: 'TRY', our_price: [{ schedule: [{ value_with_tax: 99.5 }] }] }] }] });
});

test('Amazon: reddedilen PATCH hata verir; kargoya verme shipmentConfirmation gönderir; tanılama', async () => {
  const calls = mockFetch([
    [/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }],
    [/\/items\/A1SELLER\/BAD/, { sku: 'BAD', status: 'INVALID', issues: [{ code: '90220', message: 'quantity geçersiz', severity: 'ERROR' }] }],
    [/\/items\/A1SELLER\/OK/, { sku: 'OK', status: 'ACCEPTED', submissionId: 's1', issues: [] }],
    [/shipmentConfirmation/, { status: 204, body: null }],
    [/\/orders\/v0\/orders\/111-1$/, { payload: { AmazonOrderId: '111-1', OrderStatus: 'Unshipped' } }],
    [/\/orders\/v0\/orders\?/, { payload: { Orders: [] } }],
    [/\/listings\//, { numberOfResults: 3, items: [] }],
  ]);
  const ch = amazon(AENV, { id: 'amazon' });
  await assert.rejects(() => ch.pushStock([{ remoteId: 'OK', stock: 1 }, { remoteId: 'BAD', stock: 1 }]), /BAD: quantity geçersiz/);
  const o = { remote_id: '111-1', remote_status: 'Unshipped', items: [{ line_id: 'OI1', quantity: 2, status: '' }] };
  await assert.rejects(() => ch.ship(o, { no: 1, items: [] }, { cargoCompany: 'Aras Kargo', tracking: '' }), /takip numarası/);
  await assert.rejects(() => ch.ship({ ...o, remote_status: 'Unshipped (FBA)' }, { no: 1, items: [] }, { tracking: '1' }), /FBA/);
  const r = await ch.ship(o, { no: 2, items: [{ line_id: 'OI1', qty: 2 }] }, { cargoCompany: 'Aras Kargo', tracking: 'AR123' });
  assert.deepEqual(r, { tracking: 'AR123' });
  const post = calls.at(-1);
  assert.equal(post.method, 'POST');
  assert.equal(post.url, 'https://sellingpartnerapi-eu.amazon.com/orders/v0/orders/111-1/shipmentConfirmation');
  const b = JSON.parse(post.body);
  assert.ok(Date.parse(b.packageDetail.shipDate));
  delete b.packageDetail.shipDate;
  assert.deepEqual(b, { marketplaceId: 'A33AVAJ2PDY3EV', packageDetail: { packageReferenceId: '2', carrierCode: 'Other', carrierName: 'Aras Kargo', trackingNumber: 'AR123', orderItems: [{ orderItemId: 'OI1', quantity: 2 }] } });
  const d = await ch.diagnose({ orderId: '111-1' });
  assert.deepEqual(d.map((x) => x.ok), [true, true, true, true]);
  assert.match(d[2].detail, /3 SKU/);

  mockFetch([[/auth\/o2\/token/, { status: 400, body: { error: 'invalid_grant', error_description: 'bad refresh token' } }]]);
  const bad = await amazon(AENV, { id: 'amazon' }).diagnose({});
  assert.equal(bad[0].ok, false);
  assert.match(bad[0].detail, /HTTP 400/);
});

// ---------------------------------------------------------------- Etsy
const EENV = { ETSY_SHOP_ID: '123', ETSY_API_KEY: 'KEY', ETSY_SHARED_SECRET: 'SEC', ETSY_REFRESH_TOKEN: 'R0' };
function memKv(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null), set: async (k, v) => { m.set(k, structuredClone(v)); } };
}
let rot = 0;
const tokenRoute = (valid) => [/api\.etsy\.com\/v3\/public\/oauth\/token/, (url, opts) => {
  const f = Object.fromEntries(new URLSearchParams(opts.body));
  if (valid && !(typeof valid === 'function' ? valid(f.refresh_token) : valid.includes(f.refresh_token))) return { status: 400, body: { error: 'invalid_grant' } };
  rot++;
  return { access_token: `123.AT${rot}`, token_type: 'Bearer', expires_in: 3600, refresh_token: `R${rot}x` };
}];

test('Etsy: eksik bilgi ve yetenekler', () => {
  const off = etsy({ ETSY_SHOP_ID: '1' }, { id: 'etsy' });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.missing, ['ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_REFRESH_TOKEN']);
  const ch = etsy(EENV, { id: 'etsy', kv: null });
  assert.equal(ch.enabled, true); assert.equal(ch.type, 'etsy');
  assert.equal(ch.caps.ship, 'remote'); assert.equal(ch.caps.accept, 'local'); assert.equal(ch.caps.price, true);
});

test('Etsy: refresh token yenilenir, en yenisi kv\'de saklanır; başlıklar birleşik x-api-key + Bearer', async () => {
  rot = 0;
  const kv = memKv();
  const calls = mockFetch([tokenRoute(), [/\/shops\/123\/receipts/, { count: 0, results: [] }]]);
  const ch = etsy(EENV, { id: 'etsy', kv });
  await ch.fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(calls[0].url, 'https://api.etsy.com/v3/public/oauth/token');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), { grant_type: 'refresh_token', client_id: 'KEY', refresh_token: 'R0' });
  assert.equal(calls[1].headers['x-api-key'], 'KEY:SEC');
  assert.equal(calls[1].headers.Authorization, 'Bearer 123.AT1');
  const saved = kv.m.get('refresh');
  assert.equal(saved.token, 'R1x'); assert.equal(saved.base, 'R0'); assert.equal(saved.access, '123.AT1');
  // aynı nesne belirteci tekrar istemez
  await ch.fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(calls.filter((c) => /oauth\/token/.test(c.url)).length, 1);
  // yeni nesne (başka çalışma): kayıtlı erişim belirteci süresi dolmadıysa kullanılır
  const calls2 = mockFetch([tokenRoute(), [/\/shops\/123\/receipts/, { count: 0, results: [] }]]);
  await etsy(EENV, { id: 'etsy', kv }).fetchOrders(0, Date.now());
  assert.equal(calls2.length, 1); assert.equal(calls2[0].headers.Authorization, 'Bearer 123.AT1');
  // süresi dolmuşsa kayıtlı (döndürülmüş) refresh token kullanılır, girilen değil
  kv.m.set('refresh', { ...kv.m.get('refresh'), exp: Date.now() - 1 });
  const calls3 = mockFetch([tokenRoute(['R1x']), [/\/shops\/123\/receipts/, { count: 0, results: [] }]]);
  await etsy(EENV, { id: 'etsy', kv }).fetchOrders(0, Date.now());
  assert.equal(Object.fromEntries(new URLSearchParams(calls3[0].body)).refresh_token, 'R1x');
  assert.equal(kv.m.get('refresh').token, 'R2x');
  // kullanıcı yeni refresh token girdiyse (base değişti) girilen kazanır
  const calls4 = mockFetch([tokenRoute(), [/\/shops\/123\/receipts/, { count: 0, results: [] }]]);
  await etsy({ ...EENV, ETSY_REFRESH_TOKEN: 'NEW' }, { id: 'etsy', kv }).fetchOrders(0, Date.now());
  assert.equal(Object.fromEntries(new URLSearchParams(calls4[0].body)).refresh_token, 'NEW');
  assert.deepEqual([kv.m.get('refresh').token, kv.m.get('refresh').base], ['R3x', 'NEW']);
});

test('Etsy: kayıtlı token reddedilirse girilen denenir; 401 gelirse belirteç bir kez yenilenir; ikisi de geçersizse anlaşılır hata', async () => {
  rot = 10;
  const kv = memKv({ refresh: { token: 'OLD', base: 'R0' } });
  let first = true;
  const calls = mockFetch([tokenRoute((t) => t !== 'OLD'), [/\/shops\/123\/receipts/, (url, opts) => {
    if (first) { first = false; return { status: 401, body: { error: 'invalid_token' } }; }
    return { count: 0, results: [] };
  }]]);
  const ch = etsy(EENV, { id: 'etsy', kv });
  await ch.fetchOrders(0, Date.now());
  const toks = calls.filter((c) => /oauth\/token/.test(c.url)).map((c) => Object.fromEntries(new URLSearchParams(c.body)).refresh_token);
  assert.deepEqual(toks, ['OLD', 'R0', 'R11x']);
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer 123.AT12');
  mockFetch([tokenRoute(['zzz'])]);
  await assert.rejects(() => etsy(EENV, { id: 'etsy', kv: null }).fetchListings(), /refresh token geçersiz/);
});

test('Etsy: siparişler (receipts) sayfalanır; durum, tutar, adres, satırlar dönüşür', async () => {
  rot = 0;
  const receipt = (id, extra = {}) => ({ receipt_id: id, status: 'paid', is_shipped: false, name: 'John Doe', first_line: '1 Main St', second_line: 'Apt 2', city: 'Austin', state: 'TX', zip: '78701', country_iso: 'US',
    buyer_email: 'j@x.com', buyer_user_id: 77, created_timestamp: 1790000000, grandtotal: { amount: 4550, divisor: 100, currency_code: 'USD' }, shipments: [],
    transactions: [{ transaction_id: 9001, listing_id: 555, product_id: 66, sku: 'TSHIRT-RED-M', title: 'T-Shirt &amp; Hat &quot;Set&quot;', quantity: 2, price: { amount: 2000, divisor: 100, currency_code: 'USD' }, expected_ship_date: 1790300000,
      variations: [{ formatted_name: 'Color', formatted_value: 'Red' }, { formatted_name: 'Size', formatted_value: 'M' }] },
    { transaction_id: 9002, listing_id: 556, product_id: 67, sku: '', title: 'Sticker', quantity: 1, price: { amount: 550, divisor: 100, currency_code: 'USD' }, expected_ship_date: 1790200000 }], ...extra });
  const page1 = Array.from({ length: 100 }, (_, i) => receipt(1000 + i));
  const calls = mockFetch([tokenRoute(), [/\/shops\/123\/receipts/, (url) => (qs(url).offset === '0' ? { count: 105, results: page1 } : { count: 105, results: [
    receipt(2001, { status: 'Completed', is_shipped: true, shipments: [{ carrier_name: 'usps', tracking_code: '' }, { carrier_name: 'ups', tracking_code: '1Z99' }] }),
    receipt(2002, { status: 'Canceled' }), receipt(2003, { status: 'Fully Refunded' }), receipt(2004, { status: 'Partially Refunded', is_shipped: true }),
    receipt(2005, { country_iso: 'TR', city: 'Kadıköy', state: 'İstanbul', zip: '34710', grandtotal: { amount: 1000, divisor: 100, currency_code: 'TRY' } }),
  ] })]]);
  const ch = etsy(EENV, { id: 'etsy' });
  const since = 1789990000000, until = 1790090000000;
  const orders = await ch.fetchOrders(since, until);
  const lst = calls.filter((c) => /receipts/.test(c.url));
  assert.equal(lst.length, 2);
  assert.match(lst[0].url, /^https:\/\/openapi\.etsy\.com\/v3\/application\/shops\/123\/receipts\?/);
  assert.deepEqual(qs(lst[0].url), { min_last_modified: '1789990000', max_last_modified: '1790090000', limit: '100', offset: '0' });
  assert.equal(qs(lst[1].url).offset, '100');
  assert.equal(orders.length, 105);
  const o = orders[0];
  assert.equal(o.remoteId, '1000'); assert.equal(o.orderNumber, '1000');
  assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, 'paid');
  assert.equal(o.orderedAt, 1790000000000); assert.equal(o.shipBy, 1790200000000);
  assert.equal(o.total, 45.5); assert.equal(o.currency, 'USD');
  assert.equal(o.customer, 'John Doe'); assert.equal(o.email, 'j@x.com'); assert.equal(o.customerId, '77');
  assert.deepEqual(o.address, { name: 'John Doe', line: '1 Main St, Apt 2, 78701 US', district: 'Austin', city: 'TX', phone: '' });
  assert.deepEqual(o.items, [
    { lineId: '9001', sku: 'TSHIRT-RED-M', barcode: '', name: 'T-Shirt & Hat "Set" (Red / M)', image: '', quantity: 2, unitPrice: 20, total: 40, status: '', remoteKey: 'TSHIRT-RED-M' },
    { lineId: '9002', sku: '', barcode: '', name: 'Sticker', image: '', quantity: 1, unitPrice: 5.5, total: 5.5, status: '', remoteKey: '556:67' },
  ]);
  assert.equal(o.packages, null);
  const by = Object.fromEntries(orders.slice(100).map((x) => [x.remoteId, x]));
  assert.equal(by[2001].status, 'shipped'); assert.equal(by[2001].tracking, '1Z99'); assert.equal(by[2001].cargoCompany, 'ups');
  assert.equal(by[2002].status, 'cancelled'); assert.equal(by[2002].items[0].status, 'cancelled');
  assert.equal(by[2003].status, 'returned');
  assert.equal(by[2004].status, 'shipped');
  assert.deepEqual(by[2005].address, { name: 'John Doe', line: '1 Main St, Apt 2, 34710', district: 'Kadıköy', city: 'İstanbul', phone: '' });
  assert.equal(by[2005].currency, 'TRY'); assert.equal(by[2005].total, 10);
  // geçmiş aktarımı: oluşturulma tarihi aralığı
  await ch.fetchOrders(since, until, { byOrdered: true });
  assert.deepEqual(qs(calls.at(-2).url), { min_created: '1789990000', max_created: '1790090000', limit: '100', offset: '0' });
});

const INV = (lid) => ({
  products: [
    { product_id: lid * 10 + 1, sku: `S${lid}-R`, is_deleted: false, property_values: [{ property_id: 200, property_name: 'Color', scale_id: null, scale_name: null, value_ids: [1], values: ['Red'] }],
      offerings: [{ offering_id: 1, quantity: 5, is_enabled: true, is_deleted: false, price: { amount: 1250, divisor: 100, currency_code: 'USD' } }] },
    { product_id: lid * 10 + 2, sku: '', is_deleted: false, property_values: [{ property_id: 200, property_name: 'Color', scale_id: null, scale_name: null, value_ids: [2], values: ['Blue'] }],
      offerings: [{ offering_id: 2, quantity: 3, is_enabled: false, is_deleted: false, price: { amount: 1300, divisor: 100, currency_code: 'USD' } }] },
    { product_id: lid * 10 + 3, sku: 'GONE', is_deleted: true, property_values: [], offerings: [] },
  ],
  price_on_property: [200], quantity_on_property: [200], sku_on_property: [200],
});

test('Etsy: ilanlar envanteriyle okunur (eklenti yoksa ilan başına envanter)', async () => {
  rot = 0;
  const listing = (id, extra = {}) => ({ listing_id: id, title: 'Mug &amp; Cup', state: 'active', price: { amount: 999, divisor: 100, currency_code: 'USD' },
    images: [{ rank: 2, url_fullxfull: 'https://i.etsystatic.com/b.jpg' }, { rank: 1, url_fullxfull: 'https://i.etsystatic.com/a.jpg' }], ...extra });
  const calls = mockFetch([tokenRoute(),
    [/\/shops\/123\/listings\?.*Inventory/, { status: 400, body: { error: 'includes geçersiz' } }],
    [/\/shops\/123\/listings\?/, { count: 2, results: [listing(5), listing(6, { images: [] })] }],
    [/\/listings\/5\/inventory/, INV(5)],
    [/\/listings\/6\/inventory/, { products: [{ product_id: 61, sku: 'S5-R', property_values: [], offerings: [{ quantity: 1, is_enabled: true, price: { amount: 500, divisor: 100 } }] }] }],
  ]);
  const ls = await etsy(EENV, { id: 'etsy' }).fetchListings();
  const lc = calls.filter((c) => /\/shops\/123\/listings/.test(c.url));
  assert.deepEqual(qs(lc[0].url), { state: 'active', limit: '100', offset: '0', includes: 'Images,Inventory' });
  assert.equal(qs(lc[1].url).includes, 'Images');
  assert.equal(ls.length, 3, 'silinmiş ürün atlanır');
  assert.deepEqual(ls[0], { remoteId: 'S5-R', remoteProductId: '5', sku: 'S5-R', barcode: '', name: 'Mug & Cup (Red)', groupName: 'Mug & Cup', variantName: 'Red',
    image: 'https://i.etsystatic.com/a.jpg', images: ['https://i.etsystatic.com/a.jpg', 'https://i.etsystatic.com/b.jpg'], price: 12.5, listPrice: 12.5, stock: 5, active: true });
  assert.equal(ls[1].remoteId, '5:52', 'SKU yoksa ilan:ürün'); assert.equal(ls[1].active, false); assert.equal(ls[1].price, 13);
  assert.equal(ls[2].remoteId, '6:61', 'tekrarlanan SKU ilan:ürün olur'); assert.equal(ls[2].image, '');

  // eklenti destekleniyorsa ilan başına istek yapılmaz
  const calls2 = mockFetch([tokenRoute(), [/\/shops\/123\/listings\?/, { count: 1, results: [listing(5, { inventory: INV(5) })] }]]);
  assert.equal((await etsy(EENV, { id: 'etsy' }).fetchListings()).length, 2);
  assert.ok(!calls2.some((c) => /\/listings\/5\/inventory/.test(c.url)));
});

test('Etsy: stok / fiyat envanter PUT ile yazılır (salt okunur alanlar çıkarılır); kargoya verme takip gönderir; tanılama', async () => {
  rot = 0;
  const puts = [];
  const shared = { products: [
    { product_id: 71, sku: 'A', property_values: [{ property_id: 513, property_name: 'Size', scale_id: 5, scale_name: 'US', value_ids: [9], values: ['S'] }], offerings: [{ offering_id: 1, quantity: 4, is_enabled: true, is_deleted: false, price: { amount: 1000, divisor: 100 }, readiness_state_id: 42 }] },
    { product_id: 72, sku: 'B', property_values: [{ property_id: 513, property_name: 'Size', scale_id: 5, scale_name: 'US', value_ids: [10], values: ['M'] }], offerings: [{ offering_id: 2, quantity: 4, is_enabled: true, is_deleted: false, price: { amount: 1200, divisor: 100 }, readiness_state_id: 42 }] },
  ], price_on_property: [513], quantity_on_property: [], sku_on_property: [513] };
  const calls = mockFetch([tokenRoute(),
    [/\/listings\/(\d+)\/inventory/, (url, opts) => {
      const lid = Number(/listings\/(\d+)/.exec(url)[1]);
      if (opts.method === 'PUT') { puts.push({ lid, body: JSON.parse(opts.body) }); return {}; }
      return lid === 7 ? shared : INV(lid);
    }],
    [/\/receipts\/1000\/tracking/, { receipt_id: 1000, is_shipped: true }],
    [/\/shops\/123\/receipts\/1000$/, { receipt_id: 1000, status: 'paid' }],
    [/\/shops\/123\/receipts\?/, { count: 3, results: [] }],
    [/\/shops\/123\/listings\?/, { count: 1, results: [{ listing_id: 5 }] }],
    [/\/shops\/123$/, { shop_id: 123, shop_name: 'HasturkShop', currency_code: 'USD', listing_active_count: 12 }],
  ]);
  const ch = etsy(EENV, { id: 'etsy' });
  await ch.pushStock([{ remoteId: 'S5-R', remoteProductId: '5', stock: 9 }, { remoteId: '5:52', remoteProductId: '5', stock: 1200 }]);
  assert.equal(puts.length, 1, 'aynı ilanın satırları tek PUT');
  const put = calls.find((c) => c.method === 'PUT');
  assert.equal(put.url, 'https://openapi.etsy.com/v3/application/listings/5/inventory');
  assert.equal(put.headers['x-api-key'], 'KEY:SEC');
  assert.deepEqual(puts[0].body, {
    products: [
      { sku: 'S5-R', property_values: [{ property_id: 200, value_ids: [1], scale_id: null, property_name: 'Color', values: ['Red'] }], offerings: [{ price: 12.5, quantity: 9, is_enabled: true }] },
      { sku: '', property_values: [{ property_id: 200, value_ids: [2], scale_id: null, property_name: 'Color', values: ['Blue'] }], offerings: [{ price: 13, quantity: 999, is_enabled: false }] },
    ],
    price_on_property: [200], quantity_on_property: [200], sku_on_property: [200],
  });
  // adet özelliğe göre değişmiyorsa (quantity_on_property boş) değer tüm varyantlara yazılır; fiyat özelliğe göre değiştiği için yalnız eşleşene
  await ch.pushStock([{ remoteId: 'A', remoteProductId: '7', stock: 6 }]);
  assert.deepEqual(puts[1].body.products.map((p) => p.offerings[0].quantity), [6, 6]);
  assert.deepEqual(puts[1].body.products[0].offerings[0], { price: 10, quantity: 6, is_enabled: true, readiness_state_id: 42 });
  assert.deepEqual(puts[1].body.products[0].property_values[0], { property_id: 513, value_ids: [9], scale_id: 5, property_name: 'Size', values: ['S'] });
  await ch.pushPrice([{ remoteId: 'B', remoteProductId: '7', price: 15.555, listPrice: 20 }]);
  assert.deepEqual(puts[2].body.products.map((p) => p.offerings[0].price), [10, 15.56]);
  assert.deepEqual(puts[2].body.quantity_on_property, []);
  // ilanda olmayan satır hata olarak bildirilir (diğerleri yine yazılır)
  await assert.rejects(() => ch.pushStock([{ remoteId: 'YOK', remoteProductId: '5', stock: 1 }, { remoteId: 'x', stock: 1 }]), /x: ilan numarası yok \| YOK: ilanda bulunamadı/);

  await assert.rejects(() => ch.ship({ remote_id: '1000' }, {}, { cargoCompany: 'PTT', tracking: '' }), /takip numarası/);
  assert.deepEqual(await ch.ship({ remote_id: '1000' }, { items: [] }, { cargoCompany: 'Yurtiçi Kargo', tracking: 'YK1' }), { tracking: 'YK1' });
  const tr = calls.at(-1);
  assert.equal(tr.method, 'POST');
  assert.equal(tr.url, 'https://openapi.etsy.com/v3/application/shops/123/receipts/1000/tracking');
  assert.deepEqual(JSON.parse(tr.body), { tracking_code: 'YK1', carrier_name: 'Yurtiçi Kargo' });

  const d = await ch.diagnose({ orderId: '1000' });
  assert.deepEqual(d.map((x) => x.ok), [true, true, true, true, true]);
  assert.match(d[1].detail, /HasturkShop · USD · 12 aktif ilan/);
  assert.match(d[2].detail, /3 sipariş/);
});
