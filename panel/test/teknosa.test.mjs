// Teknosa (Mirakl) bağlantısı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve normalleştirme denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teknosa, TEKNOSA_BASE } from '../src/channels/teknosa.js';

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

// ---------------- Teknosa (Mirakl) ----------------
const ENV = { TEKNOSA_URL: 'https://teknosatr-prod.mirakl.net/api/', TEKNOSA_API_KEY: 'mk-1', TEKNOSA_SHOP_ID: '2001' };
const mOrder = (o = {}) => ({ order_id: 'KT-1-A', commercial_id: 'KT-1', created_date: '2026-10-01T09:00:00Z', order_state: 'WAITING_ACCEPTANCE', total_price: 260, shipping_price: 10, currency_iso_code: 'TRY',
  shipping_company: '', shipping_tracking: '', shipping_deadline: '2026-10-03T09:00:00Z', customer_notification_email: 'x@mirakl.net',
  customer: { customer_id: 'C1', firstname: 'Ali', lastname: 'Veli', shipping_address: { firstname: 'Ali', lastname: 'Veli', street_1: 'Atatürk Cd. 5', street_2: 'D:3', city: 'Kadıköy', state: 'İstanbul', zip_code: '34710', phone: '0532' } },
  order_lines: [
    { order_line_id: 'KT-1-A-1', offer_sku: 'MAT-1', product_sku: 'P1', product_title: 'Matkap', quantity: 2, price: 200, price_unit: 100, order_line_state: 'WAITING_ACCEPTANCE', product_medias: [{ media_url: 'https://m/1.jpg', type: 'SMALL' }] },
    { order_line_id: 'KT-1-A-2', offer_sku: 'UC-1', product_sku: 'P2', product_title: 'Uç', quantity: 1, price: 50, order_line_state: 'REFUSED' },
  ], ...o });

test('Teknosa: adres/kimlik/shop_id, OR11 güncellenme tarihiyle, sipariş normalleştirme', async () => {
  const calls = mockFetch([[ 'GET', /\/api\/orders\?/, { total_count: 1, orders: [mOrder()] } ]]);
  const ch = teknosa(ENV, { id: 'teknosa' });
  assert.equal(ch.enabled, true);
  assert.equal(ch.caps.accept, 'remote'); assert.equal(ch.caps.ship, 'remote'); assert.equal(ch.caps.manualTracking, true);
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-02T00:00:00Z');
  const [o] = await ch.fetchOrders(since, until);
  const u = new URL(calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://teknosatr-prod.mirakl.net/api/orders');
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

test('Teknosa: durum eşlemesi ve offset sayfalama', async () => {
  const states = ['WAITING_DEBIT_PAYMENT', 'SHIPPING', 'SHIPPED', 'TO_COLLECT', 'RECEIVED', 'CLOSED', 'REFUSED', 'CANCELED', 'REFUNDED'];
  const offsets = [];
  mockFetch([[ 'GET', /\/api\/orders\?/, (url) => {
    const off = Number(new URL(url).searchParams.get('offset')); offsets.push(off);
    const rows = off === 0 ? Array.from({ length: 100 }, (_, i) => mOrder({ order_id: 'A' + i, order_state: states[i % states.length] })) : [mOrder({ order_id: 'Z' })];
    return { total_count: 101, orders: rows };
  } ]]);
  const ch = teknosa({ TEKNOSA_URL: 'https://teknosatr-prod.mirakl.net', TEKNOSA_API_KEY: 'k' }, { id: 'teknosa' });
  const list = await ch.fetchOrders(0, Date.now());
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(list.length, 101);
  assert.deepEqual(list.slice(0, 9).map((o) => o.status), ['new', 'processing', 'shipped', 'shipped', 'delivered', 'delivered', 'cancelled', 'cancelled', 'returned']);
});

test('Teknosa: OF21 teklifler → ilanlar (EAN barkod, indirimli fiyat)', async () => {
  const calls = mockFetch([[ 'GET', /\/api\/offers\?/, { total_count: 2, offers: [
    { offer_id: 11, shop_sku: 'MAT-1', product_sku: 'P1', product_title: 'Matkap', price: 90, quantity: 5, active: true, state_code: '11', product_references: [{ reference_type: 'EAN', reference: '869000' }], discount: { origin_price: 120, discount_price: 90 } },
    { offer_id: 12, shop_sku: 'UC-1', product_sku: 'P2', product_title: 'Uç', price: 50, quantity: 0, active: false, product_references: [] },
  ] } ]]);
  const ch = teknosa(ENV, { id: 'teknosa' });
  const l = await ch.fetchListings();
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, '/api/offers'); assert.equal(u.searchParams.get('max'), '100'); assert.equal(u.searchParams.get('shop_id'), '2001');
  assert.deepEqual(l[0], { remoteId: 'MAT-1', remoteProductId: 'P1', sku: 'MAT-1', barcode: '869000', name: 'Matkap', groupName: 'Matkap', variantName: '', image: '', images: [], price: 90, listPrice: 120, stock: 5, active: true });
  assert.equal(l[1].active, false); assert.equal(l[1].listPrice, 50); assert.equal(l[1].barcode, '');
});

test('Teknosa: OF24 stok/fiyat güncel teklif korunarak; önbellekte yoksa sku ile okunur', async () => {
  const offer = { offer_id: 11, shop_sku: 'MAT-1', product_sku: 'P1', product_title: 'Matkap', price: 90, quantity: 5, active: true, state_code: '11', leadtime_to_ship: 2, description: 'Açıklama',
    logistic_class: { code: 'M', label: 'Orta' }, offer_additional_fields: [{ code: 'garanti', type: 'STRING', value: '2 yıl' }],
    product_references: [{ reference_type: 'EAN', reference: '869000' }], discount: { origin_price: 120, discount_price: 90, start_date: null, end_date: null } };
  const calls = mockFetch([
    [ 'GET', /\/api\/offers\?/, (url) => ({ total_count: 1, offers: new URL(url).searchParams.get('sku') === 'MAT-1' ? [offer] : [] }) ],
    [ 'POST', /\/api\/offers\?shop_id=2001$/, { import_id: 77 } ],
  ]);
  const ch = teknosa(ENV, { id: 'teknosa' });
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

test('Teknosa: çok sayıda eksik teklifte tüm liste okunur, 100lük parçalarla gönderilir; EAN yedeği', async () => {
  const offers = Array.from({ length: 150 }, (_, i) => ({ shop_sku: 'S' + i, product_sku: i === 0 ? '' : 'P' + i, price: 10, quantity: 1, product_references: [{ reference_type: 'EAN', reference: 'E' + i }] }));
  const calls = mockFetch([
    [ 'GET', /\/api\/offers\?/, (url) => { const off = Number(new URL(url).searchParams.get('offset')); return { total_count: 150, offers: offers.slice(off, off + 100) }; } ],
    [ 'POST', /\/api\/offers/, { import_id: 1 } ],
  ]);
  const ch = teknosa({ TEKNOSA_URL: 'https://teknosatr-prod.mirakl.net/', TEKNOSA_API_KEY: 'k' }, { id: 'teknosa' });
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

test('Teknosa: OR21 kabul, OR23 takip (SH21 taşıyıcı eşleme) + OR24 kargoya verme', async () => {
  const calls = mockFetch([
    [ 'PUT', /\/api\/orders\/KT-1-A\/accept/, {} ],
    [ 'GET', /\/api\/shipping\/carriers/, { carriers: [{ code: 'YURTICI', label: 'Yurtiçi Kargo' }, { code: 'ARAS', label: 'Aras Kargo' }] } ],
    [ 'PUT', /\/api\/orders\/KT-1-A\/(tracking|ship)/, {} ],
  ]);
  const ch = teknosa(ENV, { id: 'teknosa' });
  const row = { remote_id: 'KT-1-A', order_number: 'KT-1', remote_status: 'WAITING_ACCEPTANCE', items: [{ line_id: 'KT-1-A-1', status: '' }, { line_id: 'KT-1-A-2', status: 'cancelled' }], packages: [] };
  await ch.accept(row);
  assert.equal(calls[0].method, 'PUT');
  assert.match(calls[0].url, /^https:\/\/teknosatr-prod\.mirakl\.net\/api\/orders\/KT-1-A\/accept\?shop_id=2001$/);
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

test('Teknosa: eksik alanlar ve tanılama (A01, OR11, OF21)', async () => {
  assert.deepEqual(teknosa({}, { id: 'teknosa' }).missing, ['TEKNOSA_API_KEY']);
  const calls = mockFetch([
    [ 'GET', /\/api\/account/, { shop_id: 2001, shop_name: 'Hastürk', shop_state: 'OPEN' } ],
    [ 'GET', /\/api\/orders\?/, (url) => new URL(url).searchParams.get('order_ids') ? { orders: [mOrder({ order_state: 'SHIPPED', shipping_company: 'Aras', shipping_tracking: 'A9' })] } : { total_count: 4, orders: [mOrder({ order_state: 'SHIPPING' })] } ],
    [ 'GET', /\/api\/offers\?/, { total_count: 12, offers: [] } ],
  ]);
  const steps = await teknosa(ENV, { id: 'teknosa' }).diagnose({ orderId: 'KT-1-A' });
  assert.deepEqual(steps.map((s) => s.ok), [true, true, true, true]);
  assert.match(steps[0].detail, /Hastürk · mağaza ID 2001 · durum OPEN/);
  assert.match(steps[1].detail, /4 sipariş · örnek durum: SHIPPING → processing/);
  assert.match(steps[2].detail, /SHIPPED · kargo Aras A9/);
  assert.match(steps[3].detail, /12 teklif/);
  assert.ok(calls.every((c) => c.headers.Authorization === 'mk-1'));
  // hata adımı
  mockFetch([]);
  const bad = await teknosa(ENV, { id: 'teknosa' }).diagnose({});
  assert.deepEqual(bad.map((s) => s.ok), [false, false, false]);
});

test('Teknosa: adres boşsa varsayılan Mirakl kök adresi; panel yolu atılır; anlaşmalı kargoda yalnız OR24', async () => {
  assert.equal(TEKNOSA_BASE, 'https://teknosatr-prod.mirakl.net');
  const calls = mockFetch([[ 'GET', /\/api\/orders\?/, { total_count: 0, orders: [] } ], [ 'PUT', /\/ship/, {} ]]);
  const ch = teknosa({ TEKNOSA_API_KEY: 'k' }, { id: 'teknosa' });
  assert.equal(ch.enabled, true); assert.equal(ch.type, 'teknosa');
  await ch.fetchOrders(0, 1000);
  assert.match(calls[0].url, /^https:\/\/teknosatr-prod\.mirakl\.net\/api\/orders\?/);
  const ch2 = teknosa({ TEKNOSA_URL: 'https://teknosatr-prod.mirakl.net/mmp/shop/order/all', TEKNOSA_API_KEY: 'k' }, { id: 'teknosa' });
  await ch2.fetchOrders(0, 1000);
  assert.match(calls[1].url, /^https:\/\/teknosatr-prod\.mirakl\.net\/api\/orders\?/);
  const pkg = { id: 1, status: 'open' };
  await ch.ship({ remote_id: 'T-1', packages: [pkg] }, pkg, {});
  assert.equal(calls.length, 3); assert.match(calls[2].url, /\/api\/orders\/T-1\/ship$/);
});

test('Teknosa: HTTP hatası anlaşılır mesajla döner', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(teknosa({ TEKNOSA_API_KEY: 'x' }, { id: 'teknosa' }).fetchListings(), /HTTP 401 Unauthorized/);
});
