// IdeaSoft bağlantısı (Admin API + OAuth2 refresh token): ağa çıkmadan örnek cevaplarla belirteç yenileme / saklama, siparişler, ilanlar, stok / fiyat, kargo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ideasoft, ideasoftStatus, ideasoftSite, isoParse } from '../src/channels/ideasoft.js';

const ENV = { IDEASOFT_URL: 'https://magaza.myideasoft.com/panel', IDEASOFT_CLIENT_ID: '7_abc', IDEASOFT_CLIENT_SECRET: 'sec', IDEASOFT_REFRESH_TOKEN: 'RT0' };
const memKv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };

// handler(c) → gövde ya da { status, body }; belirteç ucu varsayılan olarak her çağrıda yeni refresh token döner
function mockFetch(handler, { tokenFail = false } = {}) {
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    const c = { url: String(url), path: u.pathname, q: Object.fromEntries(u.searchParams), method: opts.method || 'GET', headers: opts.headers || {}, raw: opts.body };
    c.body = opts.body && /json/.test(c.headers['Content-Type'] || '') ? JSON.parse(opts.body) : opts.body ? Object.fromEntries(new URLSearchParams(opts.body)) : undefined;
    calls.push(c);
    let r;
    if (c.path === '/oauth/v2/token') r = tokenFail ? { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid refresh token' } } : { status: 200, body: { access_token: `AT${++n}`, expires_in: 86400, token_type: 'bearer', refresh_token: `RT${n}` } };
    else r = await handler(c);
    if (!r || r.status == null || r.body === undefined) r = { status: 200, body: r };
    return new Response(r.body === null ? '' : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const api = (calls) => calls.filter((c) => c.path !== '/oauth/v2/token');

const order = (id, status, extra = {}) => ({
  id, status, paymentStatus: 'success', customerFirstname: 'Ali', customerSurname: 'Veli', customerEmail: 'ali@x.com', customerPhone: '05320000000', currency: 'TL',
  amount: 200, taxAmount: 40, generalAmount: 269.9, finalAmount: 279.9, shippingCompanyName: 'Yurtiçi Kargo', shippingTrackingCode: '', transactionId: 'TX' + id,
  createdAt: '2026-10-01T12:30:00+0300', updatedAt: '2026-10-02T10:00:00+03:00', member: { id: 42 },
  shippingAddress: { firstname: 'Ayşe', surname: 'Veli', location: 'Bursa', subLocation: 'Nilüfer', address: 'Cumhuriyet Mah. No 5', mobilePhoneNumber: '05321112233', phoneNumber: '' },
  billingAddress: { firstname: 'Ali', surname: 'Veli', location: 'İstanbul', subLocation: 'Kadıköy', address: 'Fatura adr', mobilePhoneNumber: '05320000000' },
  orderItems: [{ id: 501, productName: 'Tişört', productSku: 'TS-M', productBarcode: '8690001', productPrice: 100, productQuantity: 2, productTax: 20,
    product: { id: 77, fullName: 'Tişört M Kırmızı', sku: 'TS-M', images: [{ sortOrder: 2, originalUrl: '//cdn.myideasoft.com/b.jpg' }, { sortOrder: 1, originalUrl: '//cdn.myideasoft.com/a.jpg' }] } }],
  ...extra });

test('IdeaSoft: adres, eksik bilgiler, durum eşlemesi, tarih', () => {
  assert.equal(ideasoftSite('magaza.myideasoft.com'), 'https://magaza.myideasoft.com');
  assert.equal(ideasoftSite('https://www.Magaza.com/admin-api/orders'), 'https://www.magaza.com');
  assert.equal(ideasoftSite('magaza'), '');
  assert.deepEqual(ideasoft({}, {}).missing, ['IDEASOFT_URL', 'IDEASOFT_CLIENT_ID', 'IDEASOFT_CLIENT_SECRET', 'IDEASOFT_REFRESH_TOKEN']);
  const ch = ideasoft(ENV, { id: 'ideasoft' });
  assert.equal(ch.enabled, true);
  assert.equal(ch.type, 'ideasoft');
  assert.deepEqual([ch.caps.ship, ch.caps.accept, ch.caps.manualTracking, ch.caps.label, ch.caps.price], ['remote', 'local', true, null, true]);
  assert.deepEqual(['waiting_for_approval', 'approved', 'waiting_for_payment', 'being_prepared', 'fulfilled', 'delivered', 'cancelled', 'refunded', 'personal_status_2', 'x'].map(ideasoftStatus),
    ['new', 'new', 'new', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'new', 'new']);
  assert.equal(isoParse('2018-02-21T09:36:03+0300'), Date.parse('2018-02-21T06:36:03Z'));
  assert.equal(isoParse('2022-04-20T14:33:45+03:00'), Date.parse('2022-04-20T11:33:45Z'));
});

test('IdeaSoft: refresh token ile belirteç; yeni refresh token saklanır ve sonraki yenilemede kullanılır; 401 bir kez yeniler', async () => {
  const kv = memKv();
  const calls = mockFetch(() => []);
  const ch = ideasoft(ENV, { kv });
  await ch.fetchListings();
  const tok = calls.filter((c) => c.path === '/oauth/v2/token');
  assert.equal(tok.length, 1);
  assert.equal(tok[0].method, 'POST');
  assert.match(tok[0].headers['Content-Type'], /x-www-form-urlencoded/);
  assert.deepEqual(tok[0].body, { grant_type: 'refresh_token', client_id: '7_abc', client_secret: 'sec', refresh_token: 'RT0' });
  assert.equal(api(calls)[0].headers.Authorization, 'Bearer AT1');
  assert.equal(api(calls)[0].url, 'https://magaza.myideasoft.com/admin-api/products?sort=id&limit=100&page=1');
  const saved = kv.m.get('token');
  assert.deepEqual([saved.access, saved.refresh, saved.seed, saved.cid, saved.site], ['AT1', 'RT1', 'RT0', '7_abc', 'https://magaza.myideasoft.com']);
  // yeni örnek: geçerli belirteç depodan, yenileme olmaz
  const calls2 = mockFetch(() => []);
  await ideasoft(ENV, { kv }).fetchListings();
  assert.equal(calls2.filter((c) => c.path === '/oauth/v2/token').length, 0);
  assert.equal(calls2[0].headers.Authorization, 'Bearer AT1');
  // süresi dolmuş: depodaki (dönmüş) refresh token kullanılır, env'deki eskisi değil
  kv.m.set('token', { ...saved, exp: Date.now() - 1 });
  const calls3 = mockFetch(() => []);
  await ideasoft(ENV, { kv }).fetchListings();
  assert.equal(calls3[0].body.refresh_token, 'RT1');
  // kullanıcı yeni refresh token girdiyse depodaki yok sayılır
  const calls4 = mockFetch(() => []);
  await ideasoft({ ...ENV, IDEASOFT_REFRESH_TOKEN: 'RTNEW' }, { kv }).fetchListings();
  assert.equal(calls4[0].body.refresh_token, 'RTNEW');
  // 401: belirteç bir kez yenilenip istek tekrarlanır
  let first = true;
  const calls5 = mockFetch((c) => { if (first) { first = false; return { status: 401, body: { error: 'invalid_token' } }; } return []; });
  await ideasoft(ENV, {}).fetchListings();
  assert.deepEqual(calls5.map((c) => c.path), ['/oauth/v2/token', '/admin-api/products', '/oauth/v2/token', '/admin-api/products']);
  assert.equal(calls5[3].headers.Authorization, 'Bearer AT2');
  // refresh token geçersiz: anlaşılır hata
  mockFetch(() => [], { tokenFail: true });
  await assert.rejects(ideasoft(ENV, {}).fetchListings(), /IdeaSoft: erişim belirteci alınamadı \(.*invalid_grant.*\).*yeniden yetki/);
});

test('IdeaSoft: siparişler güncellenmeye göre yeniden eskiye; aralık dışı / silinmiş / ödenmemiş alınmaz; normalleştirme', async () => {
  const since = Date.parse('2026-10-02T00:00:00Z'), until = Date.parse('2026-10-03T00:00:00Z');
  const rows = [
    order(5, 'approved', { updatedAt: '2026-10-03T05:00:00+03:00' }), // until sonrası
    order(4, 'being_prepared', { updatedAt: '2026-10-02T20:00:00+03:00' }),
    order(3, 'deleted', { updatedAt: '2026-10-02T19:00:00+03:00' }),
    order(2, 'waiting_for_approval', { paymentStatus: 'failed', updatedAt: '2026-10-02T18:00:00+03:00' }),
    order(1, 'fulfilled', { updatedAt: '2026-10-02T10:00:00+03:00', shippingTrackingCode: 'YK1', shippingAddress: null }),
    order(0, 'approved', { updatedAt: '2026-10-01T10:00:00+03:00' }), // since öncesi: durulur
  ];
  const calls = mockFetch(() => rows);
  const list = await ideasoft(ENV, {}).fetchOrders(since, until);
  assert.equal(api(calls).length, 1);
  assert.deepEqual(api(calls)[0].q, { sort: '-updatedAt', limit: '100', page: '1' });
  assert.deepEqual(list.map((o) => o.remoteId), ['4', '1']);
  const o = list[0];
  assert.deepEqual({ remoteId: o.remoteId, orderNumber: o.orderNumber, status: o.status, remoteStatus: o.remoteStatus, total: o.total, currency: o.currency, customer: o.customer, email: o.email, phone: o.phone, customerId: o.customerId, cargoCompany: o.cargoCompany, tracking: o.tracking, orderedAt: o.orderedAt, awaitingPayment: o.awaitingPayment },
    { remoteId: '4', orderNumber: '4', status: 'processing', remoteStatus: 'being_prepared', total: 279.9, currency: 'TRY', customer: 'Ali Veli', email: 'ali@x.com', phone: '05320000000', customerId: '42', cargoCompany: 'Yurtiçi Kargo', tracking: '', orderedAt: Date.parse('2026-10-01T09:30:00Z'), awaitingPayment: false });
  assert.deepEqual(o.address, { name: 'Ayşe Veli', line: 'Cumhuriyet Mah. No 5', district: 'Nilüfer', city: 'Bursa', phone: '05321112233' });
  assert.deepEqual(o.items, [{ lineId: '501', sku: 'TS-M', barcode: '8690001', name: 'Tişört M Kırmızı', image: 'https://cdn.myideasoft.com/a.jpg', quantity: 2, unitPrice: 120, total: 240, status: '', remoteKey: '77' }]);
  assert.equal(o.packages, null);
  // teslimat adresi yoksa fatura adresi
  assert.deepEqual([list[1].status, list[1].tracking, list[1].address.city, list[1].address.district], ['shipped', 'YK1', 'İstanbul', 'Kadıköy']);
});

test('IdeaSoft: güncellenme sırası uygulanmıyorsa oluşturulma tarihiyle; geçmiş aktarımı gün aralığı + saat süzgeci, sayfalama', async () => {
  const since = Date.parse('2026-10-02T00:00:00Z'), until = Date.parse('2026-10-03T00:00:00Z');
  const unsorted = [order(1, 'approved', { updatedAt: '2026-10-01T10:00:00+03:00' }), order(2, 'approved', { updatedAt: '2026-10-02T10:00:00+03:00' })];
  const calls = mockFetch((c) => (c.q.sort === '-updatedAt' ? unsorted : [order(2, 'approved', { createdAt: '2026-10-02T10:00:00+03:00' })]));
  const ch = ideasoft(ENV, {});
  const list = await ch.fetchOrders(since, until);
  assert.deepEqual(api(calls).map((c) => c.q), [{ sort: '-updatedAt', limit: '100', page: '1' }, { startCreatedAt: '2026-09-26', endCreatedAt: '2026-10-03', sort: 'id', limit: '100', page: '1' }]);
  assert.deepEqual(list.map((o) => o.remoteId), ['2']);
  // sonraki senkronda doğrudan yedek yol
  const calls2 = mockFetch(() => []);
  await ch.fetchOrders(since, until);
  assert.equal(api(calls2)[0].q.startCreatedAt, '2026-09-26');
  // geçmiş aktarımı: gün aralığı (Türkiye günü), saat panelde süzülür, 100'lük sayfalar
  const hist = Array.from({ length: 100 }, (_, i) => order(100 + i, 'delivered', { createdAt: '2026-10-02T12:00:00+03:00' }));
  const calls3 = mockFetch((c) => (c.q.page === '1' ? hist : [order(300, 'delivered', { createdAt: '2026-10-01T23:00:00+03:00' }), order(301, 'cancelled', { createdAt: '2026-10-02T04:00:00+03:00' })]));
  const h = await ideasoft(ENV, {}).fetchOrders(since, until, { byOrdered: true });
  assert.deepEqual(api(calls3).map((c) => [c.q.startCreatedAt, c.q.endCreatedAt, c.q.page]), [['2026-10-02', '2026-10-03', '1'], ['2026-10-02', '2026-10-03', '2']]);
  assert.equal(h.length, 101);
  assert.equal(h[100].status, 'cancelled');
  // tek sipariş
  mockFetch((c) => (c.path === '/admin-api/orders/9' ? order(9, 'delivered') : { status: 404, body: { message: 'Not found' } }));
  assert.equal((await ideasoft(ENV, {}).fetchOne('9')).status, 'delivered');
  await assert.rejects(ideasoft(ENV, {}).fetchOne('10'), /IdeaSoft: sipariş bulunamadı/);
  assert.equal(await ideasoft(ENV, {}).orderExists('10'), false);
});

test('IdeaSoft: ilanlar; varyantlı ana ürün atlanır, varyant adı, KDV hariç fiyat, indirim, children yedeği, sayfalama', async () => {
  const parent = { id: 10, name: 'Tişört', fullName: 'Tişört', hasOption: 1, status: 1, price1: 100, images: [{ sortOrder: 1, originalUrl: 'https://cdn.x/t.jpg' }],
    children: [{ id: 13, name: 'L', fullName: 'Tişört L', sku: 'TS-L', barcode: '', price1: 100, taxIncluded: 1, stockAmount: 1, status: 1 }] };
  const v11 = { id: 11, name: 'M', fullName: 'Tişört M', sku: 'TS-M', barcode: '86911', price1: 100, discount: 10, discountType: 1, taxIncluded: 1, tax: 20, stockAmount: 4.7, status: 1, hasOption: 0, parent: { id: 10, name: 'Tişört' }, images: [] };
  const v12 = { ...v11, id: 12, name: 'S', fullName: 'Tişört S', sku: 'TS-S', discount: 0, taxIncluded: 0, price1: 100, stockAmount: -2, status: 0 };
  const simple = { id: 20, name: 'Kupa', fullName: 'Kupa', sku: 'KP', barcode: '869020', price1: 50, discount: 5, discountType: 0, taxIncluded: 1, tax: 20, stockAmount: 9, status: 1, hasOption: 0, parent: null,
    images: [{ sortOrder: 2, originalUrl: '//cdn.x/k2.jpg' }, { sortOrder: 1, originalUrl: '//cdn.x/k1.jpg' }] };
  const filler = Array.from({ length: 96 }, (_, i) => ({ ...simple, id: 1000 + i }));
  const calls = mockFetch((c) => (c.q.page === '1' ? [parent, v11, v12, simple, ...filler] : [{ ...simple, id: 21, price1: 0 }]));
  const out = await ideasoft(ENV, {}).fetchListings();
  assert.deepEqual(api(calls).map((c) => c.q.page), ['1', '2']);
  assert.ok(!out.some((x) => x.remoteId === '10'));
  const m = out.find((x) => x.remoteId === '11');
  assert.deepEqual(m, { remoteId: '11', remoteProductId: '10', sku: 'TS-M', barcode: '86911', name: 'Tişört M', groupName: 'Tişört', variantName: 'M', image: '', images: [], price: 90, listPrice: 100, stock: 4, active: true });
  const s = out.find((x) => x.remoteId === '12');
  assert.deepEqual([s.price, s.listPrice, s.stock, s.active], [120, 120, 0, false], 'KDV hariç fiyat KDV eklenerek');
  const k = out.find((x) => x.remoteId === '20');
  assert.deepEqual([k.price, k.listPrice, k.variantName, k.groupName, k.remoteProductId, k.image, k.images], [45, 50, '', 'Kupa', '20', 'https://cdn.x/k1.jpg', ['https://cdn.x/k1.jpg', 'https://cdn.x/k2.jpg']]);
  // varyant ayrı kayıt olarak gelmediyse ana ürünün children listesinden
  const l = out.find((x) => x.remoteId === '13');
  assert.deepEqual([l.remoteProductId, l.groupName, l.variantName, l.image], ['10', 'Tişört', 'L', 'https://cdn.x/t.jpg']);
  assert.equal(out.length, 101);
});

test('IdeaSoft: stok ve fiyat PUT gövdeleri; KDV hariç ürün fiyatı; hatalar toplanır', async () => {
  const calls = mockFetch((c) => (c.method === 'GET' ? { id: Number(c.path.split('/').pop()), taxIncluded: c.path.endsWith('/12') ? 0 : 1, tax: 20 } : {}));
  const ch = ideasoft(ENV, {});
  await ch.pushStock([{ remoteId: '11', stock: 3.6 }, { remoteId: '12', stock: -1 }, { remoteId: 'x', stock: 1 }]);
  const puts = api(calls).filter((c) => c.method === 'PUT');
  assert.deepEqual(puts.map((c) => [c.path, c.body]).sort(), [['/admin-api/products/11', { id: 11, stockAmount: 4 }], ['/admin-api/products/12', { id: 12, stockAmount: 0 }]]);
  assert.equal(puts[0].headers['Content-Type'], 'application/json');
  calls.length = 0;
  await ch.pushPrice([{ remoteId: '11', price: 90, listPrice: 100 }, { remoteId: '12', price: 120, listPrice: 120 }]);
  const pp = api(calls).filter((c) => c.method === 'PUT').map((c) => [c.path, c.body]).sort();
  assert.deepEqual(pp, [['/admin-api/products/11', { id: 11, price1: 90, discount: 0 }], ['/admin-api/products/12', { id: 12, price1: 100, discount: 0 }]]);
  mockFetch((c) => (c.path.endsWith('/12') ? { status: 422, body: { errors: { stockAmount: 'geçersiz' } } } : {}));
  // Sonuç ilan ilan: reddedilen ilan errors'a (yalnız o yeniden denenir), diğerleri done'a
  const r = await ch.pushStock([{ remoteId: '11', stock: 1 }, { remoteId: '12', stock: 1 }]);
  assert.deepEqual(r.done, ['11']);
  assert.equal(r.errors.length, 1); assert.equal(r.errors[0].remoteId, '12'); assert.match(r.errors[0].error, /PUT .*HTTP 422/);
});

test('IdeaSoft: kargoya verme durum + takip kodu; başka açık paket varken beklenir; tanılama', async () => {
  const calls = mockFetch(() => ({}));
  const ch = ideasoft(ENV, {});
  await ch.ship({ remote_id: '55', packages: [{ id: 1, status: 'open' }] }, { id: 1 }, { cargoCompany: 'Aras', tracking: 'AR1' });
  const put = api(calls)[0];
  assert.deepEqual([put.method, put.path, put.body], ['PUT', '/admin-api/orders/55', { id: 55, status: 'fulfilled', shippingTrackingCode: 'AR1' }]);
  await ch.ship({ remote_id: '56', packages: [] }, null, {});
  assert.deepEqual(api(calls)[1].body, { id: 56, status: 'fulfilled' });
  await ch.ship({ remote_id: '57', packages: [{ id: 1, status: 'open' }, { id: 2, status: 'open' }] }, { id: 1 }, { tracking: 'X' });
  assert.equal(api(calls).length, 2);
  mockFetch((c) => (c.path === '/admin-api/products' ? [{ id: 1, fullName: 'Kupa' }] : []));
  const steps = await ideasoft(ENV, {}).diagnose({});
  assert.deepEqual(steps.slice(0, 3).map((s) => s.ok), [true, true, true]);
  assert.match(steps[1].detail, /örnek: Kupa/);
  mockFetch(() => [], { tokenFail: true });
  const bad = await ideasoft(ENV, {}).diagnose({});
  assert.equal(bad[0].ok, false);
  assert.match(bad[1].detail, /invalid_grant/);
});
