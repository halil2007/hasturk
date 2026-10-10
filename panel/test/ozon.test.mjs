// Ozon (Seller API) kanalı: örnek API cevaplarıyla (ağa çıkmadan) istekler ve dönüşümler denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ozon } from '../src/channels/ozon.js';

const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 5000 ? ms : 0, ...a);

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} };
    calls.push(c);
    const hit = routes.find(([re]) => re.test(c.url));
    let out = hit ? (typeof hit[1] === 'function' ? hit[1](c) : hit[1]) : { status: 404, body: { code: 5, message: 'Not Found' } };
    if (out instanceof Response) return out;
    if (!(out && out.status && 'body' in out)) out = { status: 200, body: out };
    return new Response(out.body == null ? null : JSON.stringify(out.body), { status: out.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const ENV = { OZON_CLIENT_ID: '123456', OZON_API_KEY: 'key-uuid' };
const posting = (n, st, extra = {}) => ({
  posting_number: n, order_id: 1, order_number: n.split('-').slice(0, 2).join('-'), status: st, substatus: 'posting_created',
  in_process_at: '2026-10-01T10:00:00Z', shipment_date: '2026-10-02T15:00:00Z', tracking_number: '',
  delivery_method: { id: 1, name: 'Ozon Логистика', warehouse_id: 777, warehouse: 'Склад', tpl_provider: 'Ozon Логистика', tpl_provider_id: 24 },
  customer: null, addressee: null, analytics_data: { city: 'Москва', region: 'Москва' },
  products: [
    { sku: 1001, offer_id: 'SKU-A', name: 'Кружка', price: '450.0000', quantity: 2, currency_code: 'RUB' },
    { sku: 1002, offer_id: 'SKU-B', name: 'Тарелка', price: '300', quantity: 1, currency_code: 'RUB' },
  ], ...extra });

test('Ozon: eksik bilgi, yetenekler ve kimlik başlıkları', async () => {
  const off = ozon({}, { id: 'ozon' });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.missing, ['OZON_CLIENT_ID', 'OZON_API_KEY']);
  const ch = ozon(ENV, { id: 'ozon', name: 'Ozon' });
  assert.equal(ch.enabled, true); assert.equal(ch.type, 'ozon'); assert.equal(ch.name, 'Ozon');
  assert.deepEqual(ch.caps, { accept: 'remote', split: 'local', ship: 'remote', label: 'remote', createProduct: false, price: true, manualTracking: true });
  const calls = mockFetch([[/fbs\/list/, { result: { postings: [], has_next: false } }]]);
  await ch.fetchOrders(Date.now() - 6e5, Date.now());
  assert.equal(calls[0].url, 'https://api-seller.ozon.ru/v3/posting/fbs/list');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Client-Id'], '123456'); assert.equal(calls[0].headers['Api-Key'], 'key-uuid');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
});

test('Ozon: senkron (durum değişikliği) ve geçmiş aktarımı süzgeçleri, has_next sayfalama', async () => {
  const calls = mockFetch([[/fbs\/list/, (c) => ({ result: { postings: c.body.offset === 0 ? [posting('1-1-1', 'awaiting_packaging')] : [posting('1-1-2', 'delivered')], has_next: c.body.offset === 0 } })]]);
  const ch = ozon(ENV, { id: 'ozon' });
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-02T00:00:00Z');
  const os = await ch.fetchOrders(since, until);
  assert.equal(os.length, 2);
  assert.deepEqual(calls[0].body, { dir: 'ASC', limit: 50, offset: 0, with: { analytics_data: true, financial_data: false },
    filter: { since: '2026-09-02T00:00:00Z', to: '2026-10-02T00:00:00Z', last_changed_status_date: { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' } } });
  assert.equal(calls[1].body.offset, 50);
  const b = calls.length;
  await ch.fetchOrders(since, until, { byOrdered: true });
  assert.deepEqual(calls[b].body.filter, { since: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
});

test('Ozon: gönderi dönüşümü (durum, satırlar, tutar, adres, para birimi)', async () => {
  const sts = ['awaiting_registration', 'acceptance_in_progress', 'awaiting_approve', 'awaiting_packaging', 'awaiting_deliver', 'arbitration', 'client_arbitration', 'driver_pickup', 'delivering', 'sent_by_seller', 'delivered', 'cancelled', 'not_accepted'];
  mockFetch([[/fbs\/list/, { result: { has_next: false, postings: [
    posting('0001-1-1', 'awaiting_packaging'),
    posting('0002-1-1', 'awaiting_deliver', { tracking_number: 'TRK1', customer: { customer_id: 55, name: 'Иван Петров', phone: '+79990000000',
      address: { address_tail: 'ул. Ленина, 1', city: 'Казань', district: 'Вахитовский', region: 'Татарстан', zip_code: '420000', country: 'Россия' } },
      products: [{ sku: 2001, offer_id: 'SKU-C', name: 'Ваза', price: '12.50', quantity: 1, currency_code: 'CNY' }] }),
    ...sts.map((s, i) => posting('S-' + i, s)),
  ] } }]]);
  const os = await ozon(ENV, { id: 'ozon' }).fetchOrders(0, Date.now(), { byOrdered: true });
  const [a, r] = os;
  assert.equal(a.remoteId, '0001-1-1'); assert.equal(a.orderNumber, '0001-1-1');
  assert.equal(a.status, 'new'); assert.equal(a.remoteStatus, 'awaiting_packaging / posting_created');
  assert.equal(a.orderedAt, Date.parse('2026-10-01T10:00:00Z')); assert.equal(a.shipBy, Date.parse('2026-10-02T15:00:00Z'));
  assert.equal(a.total, 1200); assert.equal(a.currency, 'RUB');
  assert.equal(a.customer, ''); assert.equal(a.cargoCompany, 'Ozon Логистика');
  assert.deepEqual(a.address, { name: '', line: '', district: '', city: 'Москва', phone: '' });
  assert.deepEqual(a.items, [
    { lineId: '1001', sku: 'SKU-A', barcode: '', name: 'Кружка', image: '', quantity: 2, unitPrice: 450, total: 900, status: '', remoteKey: 'SKU-A' },
    { lineId: '1002', sku: 'SKU-B', barcode: '', name: 'Тарелка', image: '', quantity: 1, unitPrice: 300, total: 300, status: '', remoteKey: 'SKU-B' },
  ]);
  assert.equal(a.packages, null);
  assert.equal(r.status, 'processing'); assert.equal(r.tracking, 'TRK1'); assert.equal(r.currency, 'CNY'); assert.equal(r.total, 12.5);
  assert.equal(r.customer, 'Иван Петров'); assert.equal(r.customerId, '55'); assert.equal(r.phone, '+79990000000');
  assert.deepEqual(r.address, { name: 'Иван Петров', line: 'ул. Ленина, 1, 420000', district: 'Вахитовский', city: 'Казань', phone: '+79990000000' });
  assert.deepEqual(Object.fromEntries(os.slice(2).map((o) => [o.remoteStatus.split(' / ')[0], o.status])), {
    awaiting_registration: 'new', acceptance_in_progress: 'new', awaiting_approve: 'new', awaiting_packaging: 'new', awaiting_deliver: 'processing', arbitration: 'processing',
    client_arbitration: 'processing', driver_pickup: 'shipped', delivering: 'shipped', sent_by_seller: 'shipped', delivered: 'delivered', cancelled: 'cancelled', not_accepted: 'cancelled' });
  assert.equal(os.find((o) => o.remoteId === 'S-11').items[0].status, 'cancelled');
});

test('Ozon: ürün listesi (product/list + info/list) ve dönüşüm', async () => {
  const calls = mockFetch([
    [/v3\/product\/list/, (c) => ({ result: c.body.last_id ? { items: [], total: 3, last_id: '' } : { items: [{ product_id: 11, offer_id: 'SKU-A' }, { product_id: 12, offer_id: 'SKU-B' }, { product_id: 13, offer_id: 'OLD', archived: true }], total: 3, last_id: 'abc' } })],
    [/v3\/product\/info\/list/, { items: [
      { id: 11, offer_id: 'SKU-A', name: 'Кружка', barcodes: ['4600000000011'], primary_image: ['https://cdn1.ozone.ru/a.jpg'], images: ['https://cdn1.ozone.ru/a.jpg', 'https://cdn1.ozone.ru/b.jpg'],
        price: '450.0000', old_price: '600.0000', currency_code: 'RUB', visible: true, is_archived: false,
        stocks: { has_stock: true, stocks: [{ source: 'fbs', present: 10, reserved: 2, sku: 1001 }, { source: 'fbo', present: 50, reserved: 0 }, { source: 'rfbs', present: 1, reserved: 0 }] } },
      { id: 12, offer_id: 'SKU-B', name: 'Тарелка', barcodes: [], images: [], price: '300', old_price: '0', currency_code: 'RUB', visible: false, stocks: { stocks: [] } },
    ] }],
  ]);
  const ls = await ozon(ENV, { id: 'ozon' }).fetchListings();
  assert.deepEqual(calls[0].body, { filter: { visibility: 'ALL' }, last_id: '', limit: 1000 });
  assert.equal(calls.length, 2, '1000\'den az ürün gelince sonraki sayfa istenmez');
  assert.deepEqual(calls[1].body, { product_id: [11, 12] });
  assert.deepEqual(ls[0], { remoteId: 'SKU-A', remoteProductId: '11', sku: 'SKU-A', barcode: '4600000000011', name: 'Кружка', groupName: 'Кружка', variantName: '',
    image: 'https://cdn1.ozone.ru/a.jpg', images: ['https://cdn1.ozone.ru/a.jpg', 'https://cdn1.ozone.ru/b.jpg'], price: 450, listPrice: 600, stock: 11, active: true }); // present (rezerve dahil): gönderilen "stock" ile aynı temel
  assert.equal(ls[1].active, false); assert.equal(ls[1].listPrice, 300); assert.equal(ls[1].stock, 0); assert.equal(ls[1].image, '');
});

test('Ozon: stok gönderimi (depo no, 100\'erli parça, tek depo otomatik, satır hatası)', async () => {
  let calls = mockFetch([[/v2\/products\/stocks/, (c) => ({ result: c.body.stocks.map((s) => ({ offer_id: s.offer_id, product_id: s.product_id || 0, warehouse_id: s.warehouse_id, updated: true, errors: [] })) })]]);
  const ch = ozon({ ...ENV, OZON_WAREHOUSE_ID: '22334455' }, { id: 'ozon' });
  await ch.pushStock([{ remoteId: 'SKU-A', remoteProductId: '11', stock: 4.6 }, { sku: 'SKU-B', stock: -1 }]);
  assert.deepEqual(calls[0].body, { stocks: [{ offer_id: 'SKU-A', product_id: 11, stock: 5, warehouse_id: 22334455 }, { offer_id: 'SKU-B', stock: 0, warehouse_id: 22334455 }] });
  await ch.pushStock(Array.from({ length: 150 }, (_, i) => ({ remoteId: 'K' + i, stock: 1 })));
  assert.deepEqual(calls.slice(1).map((c) => c.body.stocks.length), [100, 50]);
  // depo girilmedi: tek etkin depo kullanılır
  calls = mockFetch([[/v1\/warehouse\/list/, { result: [{ warehouse_id: 9, name: 'Ana', status: 'created' }, { warehouse_id: 8, name: 'Eski', status: 'disabled' }] }],
    [/v2\/products\/stocks/, { result: [{ offer_id: 'SKU-A', updated: false, errors: [{ code: 'TOO_MANY_REQUESTS', message: 'too many requests' }] }] }]]);
  assert.deepEqual(await ozon(ENV, { id: 'ozon' }).pushStock([{ remoteId: 'SKU-A', stock: 1 }]), { done: [], errors: [{ remoteId: 'SKU-A', error: 'Ozon: too many requests' }] });
  assert.equal(calls[1].body.stocks[0].warehouse_id, 9);
  // birden çok depo: açık hata
  mockFetch([[/v1\/warehouse\/list/, { result: [{ warehouse_id: 1, name: 'A' }, { warehouse_id: 2, name: 'B' }] }]]);
  await assert.rejects(ozon(ENV, { id: 'ozon' }).pushStock([{ remoteId: 'X', stock: 1 }]), /2 FBS deposu var.*stok deposu numarasını girin/);
});

test('Ozon: fiyat gönderimi (old_price, para birimi önbellekten, satır hatası)', async () => {
  const calls = mockFetch([
    [/v3\/product\/list/, { result: { items: [{ product_id: 11, offer_id: 'SKU-A' }], last_id: '' } }],
    [/v3\/product\/info\/list/, { items: [{ id: 11, offer_id: 'SKU-A', name: 'x', price: '1', currency_code: 'CNY', stocks: { stocks: [] } }] }],
    [/import\/prices/, (c) => ({ result: c.body.prices.map((p) => ({ offer_id: p.offer_id, product_id: p.product_id || 0, updated: p.offer_id !== 'BAD', errors: p.offer_id === 'BAD' ? [{ code: 'INVALID_PRICE', message: 'price diff too small' }] : [] })) })],
  ]);
  const ch = ozon(ENV, { id: 'ozon' });
  await ch.fetchListings();
  await ch.pushPrice([{ remoteId: 'SKU-A', price: 450, listPrice: 599.999 }, { remoteId: 'SKU-Z', price: 100.5, listPrice: 100 }]);
  const c = calls.find((x) => /import\/prices/.test(x.url));
  assert.deepEqual(c.body, { prices: [
    { offer_id: 'SKU-A', product_id: 11, price: '450', old_price: '600', currency_code: 'CNY', auto_action_enabled: 'UNKNOWN' },
    { offer_id: 'SKU-Z', price: '100.5', old_price: '0', auto_action_enabled: 'UNKNOWN' }] });
  assert.deepEqual((await ch.pushPrice([{ remoteId: 'BAD', price: 1 }])).errors, [{ remoteId: 'BAD', error: 'Ozon: price diff too small' }]);
});

test('Ozon: işleme al (topla), kargoya ver (rFBS takip no) ve etiket', async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  let labelReady = false;
  const calls = mockFetch([
    [/v4\/posting\/fbs\/ship/, { result: ['0001-1-1'] }],
    [/tracking-number\/set/, { result: [{ posting_number: '0001-1-1', result: true, error: [] }] }],
    [/posting\/delivering/, { result: [{ posting_number: '0001-1-1', result: true, error: [] }] }],
    [/package-label/, () => (labelReady ? new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf' } }) : { status: 400, body: { code: 3, message: 'POSTINGS_NOT_READY' } })],
  ]);
  const ch = ozon(ENV, { id: 'ozon' });
  const order = { remote_id: '0001-1-1', remote_status: 'awaiting_packaging / posting_created', items: [{ line_id: '1001', quantity: 2, status: '' }, { line_id: '1002', quantity: 1, status: 'cancelled' }] };
  await ch.accept(order);
  assert.deepEqual(calls[0].body, { packages: [{ products: [{ product_id: 1001, quantity: 2 }] }], posting_number: '0001-1-1', with: { additional_data: false } });
  // toplanmış gönderide işleme al tekrar çağrılmaz
  await ch.accept({ ...order, remote_status: 'awaiting_deliver' });
  assert.equal(calls.length, 1);
  // FBS: takip no yoksa uzak çağrı yok
  assert.deepEqual(await ch.ship({ ...order, remote_status: 'awaiting_deliver' }, {}, {}), {});
  assert.equal(calls.length, 1);
  // toplanmamış rFBS gönderi: önce topla, sonra takip no + teslimatta
  const r = await ch.ship(order, {}, { tracking: 'RF123' });
  assert.deepEqual(r, { tracking: 'RF123' });
  assert.deepEqual(calls.slice(1).map((c) => c.url.replace('https://api-seller.ozon.ru', '')), ['/v4/posting/fbs/ship', '/v2/fbs/posting/tracking-number/set', '/v2/fbs/posting/delivering']);
  assert.deepEqual(calls[2].body, { tracking_numbers: [{ posting_number: '0001-1-1', tracking_number: 'RF123' }] });
  assert.deepEqual(calls[3].body, { posting_number: ['0001-1-1'] });
  // etiket hazır değil → bekleme; hazır → PDF base64
  const p = await ch.label(order, { no: 1 });
  assert.equal(p.step, 'waiting'); assert.match(p.pending, /hazırlıyor/);
  labelReady = true;
  const l = await ch.label(order, { no: 2 });
  assert.deepEqual(l, { label: { format: 'pdf', data: 'JVBERi0=', filename: 'ozon-0001-1-1-2.pdf' } });
  assert.deepEqual(calls.at(-1).body, { posting_number: ['0001-1-1'] });
});

test('Ozon: takip no reddi ve API hata mesajı', async () => {
  mockFetch([[/tracking-number\/set/, { result: [{ posting_number: 'X', result: false, error: ['INVALID_TRACKING'] }] }]]);
  await assert.rejects(ozon(ENV, { id: 'ozon' }).ship({ remote_id: 'X', remote_status: 'awaiting_deliver' }, {}, { tracking: 'T' }), /INVALID_TRACKING/);
  mockFetch([[/fbs\/list/, { status: 403, body: { code: 7, message: 'Api-key is deactivated', details: [] } }]]);
  await assert.rejects(ozon(ENV, { id: 'ozon' }).fetchOrders(0, Date.now()), /HTTP 403 Api-key is deactivated/);
});

test('Ozon: tanılama adımları', async () => {
  mockFetch([[/warehouse\/list/, { result: [{ warehouse_id: 9, name: 'Ana' }] }], [/fbs\/list/, { result: { postings: [posting('P-1', 'delivering')], has_next: false } }],
    [/v3\/product\/list/, { result: { items: [{ product_id: 1 }], total: 42, last_id: '' } }], [/fbs\/get/, { result: posting('P-1', 'delivered') }]]);
  const s = await ozon(ENV, { id: 'ozon' }).diagnose({ orderId: 'P-1' });
  assert.deepEqual(s.map((x) => x.ok), [true, true, true, true]);
  assert.match(s[0].detail, /1 FBS deposu: Ana \(9\)/); assert.match(s[1].detail, /P-1: delivering → shipped/); assert.match(s[2].detail, /42 ürün/); assert.match(s[3].detail, /delivered \/ posting_created → delivered/);
  mockFetch([[/warehouse\/list/, { status: 401, body: { code: 16, message: 'Invalid Api-Key, please contact support' } }]]);
  const f = await ozon(ENV, { id: 'ozon' }).diagnose();
  assert.equal(f[0].ok, false); assert.match(f[0].detail, /kimlik doğrulanamadı/); assert.equal(f[1].name, 'İpucu');
});
