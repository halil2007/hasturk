// GetirÇarşı bağlantısı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getir, GETIR_BASE } from '../src/channels/getir.js';

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
const ENV = { GETIR_APP_SECRET_KEY: 'app-k', GETIR_SHOP_SECRET_KEY: 'shop-k' };
const LOGIN = [ 'POST', /\/auth\/login$/, { token: 'tk-1', shopId: 'S1' } ];
const gOrder = (o = {}) => ({
  id: 'go-1', status: 400, confirmationId: 'G7K2', checkoutDate: '2026-10-01T09:00:00.000Z', deliveryType: 1, totalPrice: 120, totalDiscountedPrice: 110,
  client: { id: 'c1', name: 'Ayşe K.', clientPhoneNumber: '+90 850 *** 11', contactPhoneNumber: '0850 532 50 50',
    deliveryAddress: { address: 'Moda Cd. 10', aptNo: '4', floor: '2', doorNo: '5', city: 'İstanbul', district: 'Kadıköy', description: 'Kapıya bırakın' } },
  products: [
    { id: 'l1', product: 'p1', barcode: '8690001', name: { tr: 'Süt 1L', en: 'Milk' }, imageURL: 'https://img/1.jpg', count: 2, price: 30, totalPrice: 60 },
    { id: 'l2', product: 'p2', name: { tr: 'Ekmek' }, count: 1, price: 10, totalPrice: 10 },
  ], ...o });

test('Getir: giriş (token başlığı), sipariş yoklama ve normalleştirme', async () => {
  const calls = mockFetch([LOGIN,
    [ 'POST', /\/orders\/periodic\/unapproved$/, [gOrder()] ],
    [ 'POST', /\/orders\/active$/, [gOrder(), gOrder({ id: 'go-2', status: 700 })] ],
    [ 'POST', /\/orders\/periodic\/cancelled$/, [gOrder({ id: 'go-3', status: 1500 })] ],
  ]);
  const ch = getir(ENV, { id: 'getir' });
  assert.equal(ch.enabled, true);
  assert.deepEqual(ch.caps, { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: false, courier: 'platform' });
  const list = await ch.fetchOrders(Date.now() - 3600e3, Date.now());
  assert.equal(calls[0].url, GETIR_BASE + '/auth/login');
  assert.deepEqual(JSON.parse(calls[0].body), { appSecretKey: 'app-k', shopSecretKey: 'shop-k' });
  assert.equal(calls[1].headers.token, 'tk-1'); assert.equal(calls[1].method, 'POST');
  assert.equal(list.length, 3, 'aynı sipariş bir kez');
  const [o] = list;
  assert.equal(o.remoteId, 'go-1'); assert.equal(o.orderNumber, 'G7K2'); assert.equal(o.status, 'new'); assert.equal(o.remoteStatus, '400');
  assert.equal(o.orderedAt, Date.parse('2026-10-01T09:00:00.000Z')); assert.equal(o.total, 110); assert.equal(o.currency, 'TRY');
  assert.equal(o.customer, 'Ayşe K.'); assert.equal(o.phone, '+90 850 *** 11'); assert.equal(o.cargoCompany, 'Getir kuryesi'); assert.equal(o.tracking, '');
  assert.deepEqual(o.address, { name: 'Ayşe K.', line: 'Moda Cd. 10 No 4 Kat 2 Daire 5 (Kapıya bırakın)', district: 'Kadıköy', city: 'İstanbul', phone: '0850 532 50 50' });
  assert.deepEqual(o.items[0], { lineId: 'l1', sku: '8690001', barcode: '8690001', name: 'Süt 1L', image: 'https://img/1.jpg', quantity: 2, unitPrice: 30, total: 60, status: '', remoteKey: '8690001' });
  assert.equal(o.items[1].sku, 'p2', 'barkod yoksa ürün kimliği');
  assert.equal(list[1].status, 'shipped'); assert.equal(list[2].status, 'cancelled'); assert.equal(list[2].items[0].status, 'cancelled');
  assert.equal(o.packages, null);
  // token bellekte; geçmiş aktarım yapılamaz
  await ch.fetchOrders(0, 1);
  assert.equal(calls.filter((c) => /auth\/login/.test(c.url)).length, 1);
  const n = calls.length;
  assert.deepEqual(await ch.fetchOrders(0, Date.now(), { byOrdered: true }), []);
  assert.equal(calls.length, n);
});

test('Getir: durum eşlemesi', async () => {
  const codes = [325, 350, 400, 500, 550, 600, 700, 800, 900, 1500, 1600];
  mockFetch([LOGIN, [ 'POST', /\/orders\/active$/, codes.map((s) => gOrder({ id: 'o' + s, status: s })) ], [ 'POST', /\/periodic\//, [] ]]);
  const list = await getir(ENV, { id: 'getir' }).fetchOrders(0, Date.now());
  assert.deepEqual(list.map((o) => o.status), ['new', 'processing', 'new', 'processing', 'shipped', 'shipped', 'shipped', 'shipped', 'delivered', 'cancelled', 'cancelled']);
});

test('Getir: işleme al (verify / verify-scheduled) ve hazır (prepare)', async () => {
  let status = 500;
  const calls = mockFetch([LOGIN,
    [ 'GET', /\/orders\/go-1$/, () => gOrder({ status }) ],
    [ 'POST', /\/orders\/go-1\/(verify|verify-scheduled|prepare)$/, { result: true } ],
  ]);
  const ch = getir(ENV, { id: 'getir' });
  await ch.accept({ remote_id: 'go-1', remote_status: '400' });
  assert.equal(new URL(calls.at(-1).url).pathname, '/orders/go-1/verify');
  await ch.accept({ remote_id: 'go-1', remote_status: '325' });
  assert.equal(new URL(calls.at(-1).url).pathname, '/orders/go-1/verify-scheduled');
  const n = calls.length;
  await ch.accept({ remote_id: 'go-1', remote_status: '500' });
  assert.equal(calls.length, n, 'onaylı sipariş yeniden onaylanmaz');

  assert.deepEqual(await ch.ship({ remote_id: 'go-1' }, { id: 1 }, {}), { tracking: '' });
  assert.equal(new URL(calls.at(-1).url).pathname, '/orders/go-1/prepare'); assert.equal(calls.at(-1).method, 'POST');
  status = 550;
  const m = calls.length;
  assert.deepEqual(await ch.ship({ remote_id: 'go-1' }, { id: 1 }, {}), {});
  assert.equal(calls.length, m + 1, 'yalnız durum okunur');
  status = 1600;
  await assert.rejects(ch.ship({ remote_id: 'go-1' }, { id: 1 }, {}), /iptal/);
  // yeni sipariş: önce onay, sonra 1 dakika beklenmesi söylenir
  status = 400;
  await assert.rejects(ch.ship({ remote_id: 'go-1' }, { id: 1 }, {}), /1 dakika/);
  assert.equal(new URL(calls.at(-1).url).pathname, '/orders/go-1/verify');
});

test('Getir: ürünler, stok / fiyat gövdeleri, 401 sonrası yeniden giriş', async () => {
  let n = 0;
  const calls = mockFetch([
    [ 'POST', /\/auth\/login$/, () => ({ token: 'tk-' + (++n) }) ],
    [ 'GET', /\/products\?/, (url, opts) => (opts.headers.token === 'tk-1' ? { __status: 401, body: { message: 'expired' } } : [
      { id: 'p1', barcode: '8690001', name: { tr: 'Süt 1L' }, price: 30, struckPrice: 35, stock: 9, status: 100, imageURL: 'https://img/1.jpg' },
      { id: 'p2', name: { tr: 'Ekmek' }, price: 10, stock: 0, status: 200 },
    ]) ],
    [ 'PUT', /\/products\/(stock|price)$/, {} ],
  ]);
  const ch = getir(ENV, { id: 'getir' });
  const l = await ch.fetchListings();
  assert.equal(n, 2, 'token yenilendi');
  assert.deepEqual(l[0], { remoteId: '8690001', remoteProductId: 'p1', sku: '8690001', barcode: '8690001', name: 'Süt 1L', groupName: 'Süt 1L', variantName: '', image: 'https://img/1.jpg', images: ['https://img/1.jpg'], price: 30, listPrice: 35, stock: 9, active: true });
  assert.equal(l[1].remoteId, 'p2'); assert.equal(l[1].active, false);
  await ch.pushStock([{ remoteId: '8690001', barcode: '8690001', stock: 4.2 }, { remoteId: 'p2', remoteProductId: 'p2', stock: -1 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { products: [{ barcode: '8690001', stock: 4 }, { productId: 'p2', stock: 0 }] });
  assert.equal(calls.at(-1).headers.token, 'tk-2');
  await ch.pushPrice([{ barcode: '8690001', price: 29.9, listPrice: 35 }, { remoteProductId: 'p2', price: 10, listPrice: 10 }]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { products: [{ barcode: '8690001', price: 29.9, struckPrice: 35 }, { productId: 'p2', price: 10 }] });
  await assert.rejects(ch.pushPrice([{ barcode: 'x', price: 0 }]), /satış fiyatı yok/);
});

test('Getir: eksik bilgi, hatalı anahtar ve tanılama', async () => {
  const c0 = getir({}, { id: 'getir' });
  assert.equal(c0.enabled, false); assert.deepEqual(c0.missing, ['GETIR_APP_SECRET_KEY', 'GETIR_SHOP_SECRET_KEY']);
  mockFetch([[ 'POST', /\/auth\/login$/, { __status: 401, body: { code: 6, error: 'AuthenticationError', message: 'Invalid secret keys' } } ]]);
  const ch = getir({ ...ENV, GETIR_BASE: 'https://ornek.getirapi.com/' }, { id: 'getir' });
  await assert.rejects(ch.fetchOrders(0, 1), /ornek\.getirapi\.com\/auth\/login: HTTP 401 Invalid secret keys/);
  const steps = await ch.diagnose({});
  assert.equal(steps[0].ok, false); assert.match(steps[0].detail, /kimlik doğrulanamadı/);
});
