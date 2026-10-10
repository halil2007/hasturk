// T-Soft bağlantısı (REST1): ağa çıkmadan örnek cevaplarla giriş / token saklama, siparişler, ilanlar (ana ürün + varyant), stok / fiyat, kargo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tsoft, tsoftStatus, tsoftSite, tsDate } from '../src/channels/tsoft.js';

const ENV = { TSOFT_URL: 'https://www.magaza.com/srv/admin', TSOFT_USER: 'api user', TSOFT_PASS: 'p@ss' };
const memKv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };

function mockFetch(handler, { loginFail = false } = {}) {
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    const form = Object.fromEntries(new URLSearchParams(String(opts.body || '')));
    const c = { url: String(url), path: u.pathname.replace(/^\/rest1\//, ''), method: opts.method || 'GET', headers: opts.headers || {}, form };
    if (form.data) c.data = JSON.parse(form.data);
    calls.push(c);
    let r;
    if (c.path.startsWith('auth/login/')) r = loginFail ? { success: false, message: [{ type: 2, code: 'AUTH001', text: ['Kullanıcı adı veya şifre hatalı'] }] } : { success: true, data: [{ token: `TK${++n}`, expirationTime: '2099-01-01 00:00:00' }] };
    else r = await handler(c);
    if (!r || r.status == null || r.body === undefined) r = { status: 200, body: r };
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': typeof r.body === 'string' ? 'text/html' : 'application/json' } });
  };
  return calls;
}
const api = (calls) => calls.filter((c) => !c.path.startsWith('auth/'));
const ok = (data, extra = {}) => ({ success: true, data, message: [{ type: 1, code: 'OK', text: ['İşlem başarılı'] }], summary: { totalRecordCount: data.length }, ...extra });

const order = (id, status, extra = {}) => ({
  OrderId: String(id), OrderCode: `TS${id}`, OrderStatusId: '2', OrderStatus: status, OrderDateTimeStamp: '1759311000', UpdateDateTimeStamp: String(1759400000),
  CustomerId: '42', CustomerName: 'Ali Veli', CustomerUsername: 'ali@x.com', Mobile: '05320000000',
  DeliveryName: 'Ayşe Veli', DeliveryAddress: 'Cumhuriyet Mah. No 5', DeliveryCity: 'Bursa', DeliveryTown: 'Nilüfer', DeliveryMobile: '05321112233',
  OrderTotalPrice: '279.90', Currency: 'TL', CargoCode: 'YK', Cargo: 'Yurtiçi Kargo', CargoTrackingCode: '',
  OrderDetails: [{ OrderProductId: '501', ProductCode: 'T10', SubProductCode: 'TA101', ProductName: 'Tişört', Property1: 'M', Property2: 'Kırmızı', Barcode: '8690001', Quantity: '2', SellingPrice: '100', Vat: '20', ImageUrl: 'https://www.magaza.com/Data/K/t.jpg' }],
  ...extra });

test('T-Soft: adres, eksik bilgiler, durum eşlemesi, tarih', () => {
  assert.equal(tsoftSite('magaza.com'), 'https://magaza.com');
  assert.equal(tsoftSite('https://WWW.magaza.com/rest1/console'), 'https://www.magaza.com');
  assert.equal(tsoftSite('magaza'), '');
  assert.deepEqual(tsoft({}, {}).missing, ['TSOFT_URL', 'TSOFT_USER', 'TSOFT_PASS']);
  const ch = tsoft(ENV, { id: 'tsoft' });
  assert.equal(ch.enabled, true);
  assert.equal(ch.type, 'tsoft');
  assert.deepEqual([ch.caps.ship, ch.caps.accept, ch.caps.manualTracking, ch.caps.label, ch.caps.price], ['remote', 'local', true, null, true]);
  assert.deepEqual(['Yeni Sipariş', 'Onay Bekliyor', 'Ödeme Bekleniyor', 'Onaylandı', 'Hazırlanıyor', 'Kargoya Hazır', 'Kargoya Verildi', 'Teslim Edildi', 'İptal Edildi', 'İade Edildi', 'İade Talebi', ''].map(tsoftStatus),
    ['new', 'new', 'new', 'new', 'processing', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'returned', 'new']);
  assert.equal(tsDate('2026-10-01 12:30:00'), Date.parse('2026-10-01T09:30:00Z'));
  assert.equal(tsDate('2024-02-01T15:58:13Z'), Date.parse('2024-02-01T15:58:13Z'));
  assert.equal(tsDate('1706792293'), 1706792293000);
  assert.equal(tsDate('0000-00-00 00:00:00'), 0);
});

test('T-Soft: giriş kullanıcı adı yolda + şifre formda; token saklanır; token hatasında yeniden giriş; yanlış şifre anlaşılır', async () => {
  const kv = memKv();
  const calls = mockFetch(() => ok([]));
  await tsoft(ENV, { kv }).fetchOrders(0, 1000, { byOrdered: true });
  assert.equal(calls[0].url, 'https://www.magaza.com/rest1/auth/login/api%20user');
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].headers['Content-Type'], /x-www-form-urlencoded/);
  assert.deepEqual(calls[0].form, { pass: 'p@ss' });
  assert.equal(calls[1].url, 'https://www.magaza.com/rest1/order2/getOrders');
  assert.equal(calls[1].form.token, 'TK1');
  assert.deepEqual([kv.m.get('token').token, kv.m.get('token').user, kv.m.get('token').exp], ['TK1', 'api user', Date.parse('2098-12-31T21:00:00Z')]);
  // yeni örnek depodaki token'ı kullanır
  const calls2 = mockFetch(() => ok([]));
  await tsoft(ENV, { kv }).fetchListings();
  assert.ok(!calls2.some((c) => c.path.startsWith('auth/')));
  assert.equal(calls2[0].form.token, 'TK1');
  // servis token hatası → bir kez yeniden giriş
  let first = true;
  const calls3 = mockFetch(() => { if (first) { first = false; return { success: false, message: [{ type: 2, code: 'TOKEN', text: ['Token geçersiz'] }] }; } return ok([]); });
  await tsoft(ENV, {}).fetchListings();
  assert.deepEqual(calls3.map((c) => c.path).slice(0, 4), ['auth/login/api%20user', 'product/get', 'auth/login/api%20user', 'product/get']);
  assert.equal(calls3[3].form.token, 'TK2');
  // başka bir hata yeniden giriş yapmadan anlaşılır mesajla
  mockFetch(() => ({ success: false, message: [{ type: 2, code: 'E1', text: ['Yetkiniz yok'] }] }));
  await assert.rejects(tsoft(ENV, {}).fetchListings(), /T-Soft: product\/get başarısız \(Yetkiniz yok\)/);
  mockFetch(() => ok([]), { loginFail: true });
  await assert.rejects(tsoft(ENV, {}).fetchListings(), /T-Soft: giriş yapılamadı \(Kullanıcı adı veya şifre hatalı\)/);
  // REST servisi kapalı (HTML)
  mockFetch(() => '<html><head><title>Sayfa</title></head></html>');
  await assert.rejects(tsoft(ENV, {}).fetchListings(), /JSON dışı yanıt/);
});

test('T-Soft: siparişler tarih aralığı + sayfalı; güncellenme süzgeci; kalemler (varyant kodu, KDV), adres', async () => {
  const since = Date.parse('2026-10-02T00:00:00Z'), until = Date.parse('2026-10-03T00:00:00Z');
  const page1 = [order(1, 'Hazırlanıyor', { UpdateDateTimeStamp: String(since / 1000 + 60) }), ...Array.from({ length: 99 }, (_, i) => order(100 + i, 'Onay Bekliyor', { UpdateDateTimeStamp: String(since / 1000 - 3600) }))];
  const page2 = [order(2, 'Ödeme Bekleniyor', { UpdateDateTimeStamp: '', OrderDetails: undefined })];
  const calls = mockFetch((c) => (c.path === 'order2/getOrderDetails' ? ok([{ OrderProductId: '9', ProductCode: 'T20', ProductName: 'Kupa', Quantity: '1', SellingPriceVatIncluded: '60' }]) : ok(c.form.start === '0' ? page1 : page2)));
  const list = await tsoft(ENV, {}).fetchOrders(since, until);
  const g = api(calls).filter((c) => c.path === 'order2/getOrders');
  assert.equal(g.length, 2);
  assert.deepEqual({ ...g[0].form, token: undefined }, { token: undefined, OrderDateTimeStart: '2026-09-26T00:00:00Z', OrderDateTimeEnd: '2026-10-03T00:00:00Z', FetchProductData: 'true', start: '0', limit: '100', orderby: 'OrderId ASC' });
  assert.equal(g[1].form.start, '100');
  // aralıktan önce güncellenen 99 sipariş süzülür; güncellenme zamanı olmayan alınır
  assert.deepEqual(list.map((o) => o.remoteId), ['1', '2']);
  const o = list[0];
  assert.deepEqual({ remoteId: o.remoteId, orderNumber: o.orderNumber, status: o.status, remoteStatus: o.remoteStatus, total: o.total, currency: o.currency, customer: o.customer, email: o.email, phone: o.phone, customerId: o.customerId, cargoCompany: o.cargoCompany, tracking: o.tracking, orderedAt: o.orderedAt },
    { remoteId: '1', orderNumber: 'TS1', status: 'processing', remoteStatus: 'Hazırlanıyor', total: 279.9, currency: 'TRY', customer: 'Ali Veli', email: 'ali@x.com', phone: '05321112233', customerId: '42', cargoCompany: 'Yurtiçi Kargo', tracking: '', orderedAt: 1759311000000 });
  assert.deepEqual(o.address, { name: 'Ayşe Veli', line: 'Cumhuriyet Mah. No 5', district: 'Nilüfer', city: 'Bursa', phone: '05321112233' });
  assert.deepEqual(o.items, [{ lineId: '501', sku: 'TA101', barcode: '8690001', name: 'Tişört - M / Kırmızı', image: 'https://www.magaza.com/Data/K/t.jpg', quantity: 2, unitPrice: 120, total: 240, status: '', remoteKey: 'TA101' }]);
  // kalemler gelmediyse sipariş detayından
  const d = api(calls).filter((c) => c.path === 'order2/getOrderDetails');
  assert.deepEqual(d.map((c) => c.form.f), ['OrderId|2|equal']);
  assert.deepEqual([list[1].awaitingPayment, list[1].status, list[1].items[0].unitPrice, list[1].items[0].remoteKey], [true, 'new', 60, 'T20']);
  // geçmiş aktarımı tam aralık, güncellenme süzgeci yok
  const calls2 = mockFetch(() => ok([order(5, 'Teslim Edildi', { UpdateDateTimeStamp: '1' })]));
  const h = await tsoft(ENV, {}).fetchOrders(since, until, { byOrdered: true });
  assert.equal(api(calls2)[0].form.OrderDateTimeStart, '2026-10-02T00:00:00Z');
  assert.deepEqual(h.map((x) => x.status), ['delivered']);
  // tek sipariş
  const calls3 = mockFetch(() => ok([order(7, 'Kargoya Verildi', { CargoTrackingCode: 'YK7' })]));
  const one = await tsoft(ENV, {}).fetchOne('7');
  assert.deepEqual([api(calls3)[0].form.f, one.status, one.tracking], ['OrderId|7|equal', 'shipped', 'YK7']);
  mockFetch(() => ok([]));
  await assert.rejects(tsoft(ENV, {}).fetchOne('8'), /T-Soft: sipariş bulunamadı/);
  assert.equal(await tsoft(ENV, {}).orderExists('x'), false);
});

const product = (id, extra = {}) => ({ ProductId: String(id), ProductCode: `T${id}`, ProductName: `Ürün ${id}`, Barcode: `869${id}`, Stock: '5', IsActive: 'true', HasSubProducts: 'false', Vat: '20',
  SellingPrice: '100', DiscountedSellingPrice: '0', SellingPriceVatIncludedNoDiscount: '120', Currency: 'TL', ImageUrl: 'D18/1.jpg',
  ImageUrls: [{ ImageUrl: `https://www.magaza.com/Data/K/${id}b.jpg`, ListNo: '2' }, { ImageUrl: `https://www.magaza.com/Data/K/${id}a.jpg`, ListNo: '1' }], ...extra });

test('T-Soft: ilanlar; varyantlı ana ürün yerine alt ürünler, KDV dahil fiyat, indirim, sayfalama', async () => {
  const fill = Array.from({ length: 99 }, (_, i) => product(1000 + i));
  const subs = [
    { SubProductId: '1', SubProductCode: 'TA101', MainProductId: '10', MainProductCode: 'T10', Barcode: '86910M', Property1: 'M', Property2: 'Kırmızı', Stock: '3', SellingPrice: '50', DiscountedSellingPrice: '40', Vat: '20', IsActive: 'true' },
    { SubProductId: '2', SubProductCode: 'TA102', MainProductId: '10', MainProductCode: 'T10', Barcode: '', Property1: 'L', Property2: '', Stock: '-1', SellingPrice: '50', DiscountedSellingPrice: '0', Vat: '20', IsActive: 'false' },
  ];
  const calls = mockFetch((c) => (c.path === 'product/get' ? ok(c.form.start === '0' ? [product(10, { HasSubProducts: 'true' }), ...fill] : [product(20, { DiscountedSellingPrice: '75', Stock: '2.9', IsActive: 'false' })]) : ok(subs)));
  const out = await tsoft(ENV, {}).fetchListings();
  assert.deepEqual(api(calls).map((c) => [c.path, c.form.start, c.form.limit]), [['product/get', '0', '100'], ['product/get', '100', '100'], ['subProduct/getSubProducts', '0', '100']]);
  assert.equal(api(calls)[0].form.FetchImageUrls, 'true');
  assert.ok(!out.some((x) => x.remoteId === 'T10'), 'varyantlı ana ürün ilan değil');
  assert.equal(out.length, 102);
  const p20 = out.find((x) => x.remoteId === 'T20');
  assert.deepEqual(p20, { remoteId: 'T20', remoteProductId: 'T20', sku: 'T20', barcode: '86920', name: 'Ürün 20', groupName: 'Ürün 20', variantName: '', image: 'https://www.magaza.com/Data/K/20a.jpg',
    images: ['https://www.magaza.com/Data/K/20a.jpg', 'https://www.magaza.com/Data/K/20b.jpg'], price: 90, listPrice: 120, stock: 2, active: false });
  const v = out.find((x) => x.remoteId === 'TA101');
  assert.deepEqual(v, { remoteId: 'TA101', remoteProductId: 'T10', sku: 'TA101', barcode: '86910M', name: 'Ürün 10 - M / Kırmızı', groupName: 'Ürün 10', variantName: 'M / Kırmızı',
    image: 'https://www.magaza.com/Data/K/10a.jpg', images: ['https://www.magaza.com/Data/K/10a.jpg', 'https://www.magaza.com/Data/K/10b.jpg'], price: 48, listPrice: 60, stock: 3, active: true });
  const v2 = out.find((x) => x.remoteId === 'TA102');
  assert.deepEqual([v2.price, v2.listPrice, v2.stock, v2.active, v2.variantName], [60, 60, 0, false, 'L']);
});

test('T-Soft: stok varyant / ana ürün ayrı metotla, fiyat KDV düşülerek; kalem hataları toplanır', async () => {
  const calls = mockFetch((c) => {
    if (c.path.startsWith('subProduct/getSubProductByCode/')) return ok([{ SubProductCode: 'TA9', Vat: '10' }]);
    if (c.path === 'product/get') return ok([{ ProductCode: c.form.ProductCode, Vat: '20' }]);
    return ok([]);
  });
  const ch = tsoft(ENV, {});
  await ch.pushStock([{ remoteId: 'TA101', remoteProductId: 'T10', stock: 3.4 }, { remoteId: 'T20', remoteProductId: 'T20', stock: -2 }, { remoteId: 'T30', stock: 7 }]);
  const st = api(calls);
  assert.deepEqual(st.map((c) => [c.path, c.data]), [['subProduct/updateStock', [{ SubProductCode: 'TA101', Stock: 3 }]], ['product/updateStock', [{ ProductCode: 'T20', Stock: 0 }, { ProductCode: 'T30', Stock: 7 }]]]);
  calls.length = 0;
  await ch.pushPrice([{ remoteId: 'TA9', remoteProductId: 'T9', price: 88, listPrice: 110 }, { remoteId: 'T20', remoteProductId: 'T20', price: 120, listPrice: 0 }]);
  const pr = api(calls);
  assert.equal(pr.find((c) => c.path.startsWith('subProduct/getSubProductByCode/')).path, 'subProduct/getSubProductByCode/TA9');
  assert.equal(pr.find((c) => c.path === 'product/get').form.ProductCode, 'T20');
  assert.deepEqual(pr.find((c) => c.path === 'subProduct/updateSubProducts').data, [{ SubProductCode: 'TA9', SellingPrice: 100, DiscountedSellingPrice: 80 }]);
  assert.deepEqual(pr.find((c) => c.path === 'product/updateProducts').data, [{ ProductCode: 'T20', SellingPrice: 100, DiscountedSellingPrice: 0 }]);
  // ilan listesinden öğrenilen KDV yeniden sorulmaz
  const calls2 = mockFetch((c) => (c.path === 'product/get' ? ok(c.form.start === '0' ? [product(20)] : []) : ok([])));
  const ch2 = tsoft(ENV, {});
  await ch2.fetchListings();
  calls2.length = 0;
  await ch2.pushPrice([{ remoteId: 'T20', remoteProductId: 'T20', price: 60, listPrice: 60 }]);
  assert.deepEqual(api(calls2).map((c) => c.path), ['product/updateProducts']);
  // 100'lük parçalar; message type 2 = kalem hatası
  const many = Array.from({ length: 150 }, (_, i) => ({ remoteId: `TA${i}`, remoteProductId: 'T1', stock: 1 }));
  const calls3 = mockFetch((c) => ok([], c.data.length === 50 ? { message: [{ type: 2, code: 'SP404', text: ['TA140 bulunamadı'] }] } : {}));
  await assert.rejects(ch.pushStock(many), /T-Soft: 1 stok güncellenemedi \(TA140 bulunamadı\)/);
  assert.deepEqual(api(calls3).map((c) => c.data.length), [100, 50]);
});

test('T-Soft: kargoya verme OrderCode + kargo kodu + takip no; kod ayarı / siparişten; açık paket; hata', async () => {
  const calls = mockFetch((c) => (c.path === 'order2/getOrders' ? ok([order(55, 'Hazırlanıyor', { CargoCode: 'AR' })]) : ok([])));
  await tsoft(ENV, {}).ship({ remote_id: '55', order_number: 'TS55', packages: [{ id: 1, status: 'open' }] }, { id: 1 }, { tracking: 'AR123' });
  const a = api(calls);
  assert.deepEqual(a.map((c) => c.path), ['order2/getOrders', 'order2/updateOrderStatusAsSentToCargo']);
  assert.deepEqual(a[1].data, [{ OrderCode: 'TS55', CargoCode: 'AR', CargoTrackingCode: 'AR123' }]);
  // ayarlarda kod varsa sipariş okunmaz
  const calls2 = mockFetch(() => ok([]));
  await tsoft({ ...ENV, TSOFT_CARGO_CODE: 'YK' }, {}).ship({ remote_id: '56', order_number: 'TS56', packages: [] }, null, {});
  assert.deepEqual(api(calls2).map((c) => [c.path, c.data]), [['order2/updateOrderStatusAsSentToCargo', [{ OrderCode: 'TS56', CargoCode: 'YK' }]]]);
  const calls3 = mockFetch(() => ok([]));
  await tsoft(ENV, {}).ship({ remote_id: '57', order_number: 'TS57', packages: [{ id: 1, status: 'open' }, { id: 2, status: 'open' }] }, { id: 1 }, { tracking: 'X' });
  assert.equal(api(calls3).length, 0);
  mockFetch(() => ok([], { message: [{ type: 2, code: 'ORI004', text: ['Sipariş durumu uygun değil'] }] }));
  await assert.rejects(tsoft({ ...ENV, TSOFT_CARGO_CODE: 'YK' }, {}).ship({ remote_id: '58', order_number: 'TS58', packages: [] }, null, { tracking: 'X' }), /T-Soft: sipariş kargoya verildi yapılamadı \(Sipariş durumu uygun değil\)/);
});

test('T-Soft: tanılama', async () => {
  mockFetch((c) => (c.path === 'product/get' ? ok([product(1)]) : ok([order(1, 'Onay Bekliyor')])));
  const s = await tsoft(ENV, {}).diagnose({ orderId: '1' });
  assert.deepEqual(s.slice(0, 4).map((x) => x.ok), [true, true, true, true]);
  assert.match(s[1].detail, /örnek: Ürün 1/);
  assert.match(s[3].detail, /#TS1: Onay Bekliyor → new · 1 kalem/);
  mockFetch(() => ok([]), { loginFail: true });
  const b = await tsoft(ENV, {}).diagnose({});
  assert.equal(b[0].ok, false);
  assert.match(b[1].detail, /rest1\/console/);
});
