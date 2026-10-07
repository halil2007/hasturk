// OpenCart bağlantısı: panel, sitedeki bağlantı dosyasıyla (public/opencart-bridge.php) JSON üzerinden konuşur.
// Ağa çıkmadan örnek cevaplarla istekler ve normalleştirme; anahtarlı dosya indirme; PHP varsa dosyanın sözdizimi ve anahtar denetimi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { opencart, ocStatus } from '../src/channels/opencart.js';
import { d1 } from '../dev/d1.mjs';
import worker from '../src/index.js';

const realFetch = globalThis.fetch; // PHP sunucusu denemesi gerçek fetch ile
const BRIDGE = new URL('../public/opencart-bridge.php', import.meta.url);
const KEY = 'k'.repeat(32);
const ENV = { OPENCART_URL: 'https://magaza.com/admin/index.php?route=common/dashboard', OPENCART_KEY: KEY };

// handler(c) → { status?, body } ya da düz gövde; body metinse olduğu gibi (HTML) döner
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(c);
    let r = await handler(c);
    if (!r || r.status == null || r.body === undefined) r = { status: 200, body: r };
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: { 'Content-Type': typeof r.body === 'string' ? 'text/html' : 'application/json' } });
  };
  return calls;
}
const action = (c) => new URL(c.url).searchParams.get('action');

const ocOrder = (id, status, extra = {}) => ({
  order_id: id, customer_id: 7, order_status_id: 2, status, total: 236, currency_code: 'TRY', currency_value: 1, added: 1759312800, modified: 1759399200,
  firstname: 'Ali', lastname: 'Veli', email: 'ali@x.com', telephone: '0532',
  payment_firstname: 'Ali', payment_lastname: 'Veli', payment_address_1: 'Fatura adr', payment_city: 'Kadıköy', payment_zone: 'İstanbul',
  shipping_firstname: 'Ayşe', shipping_lastname: 'Veli', shipping_address_1: 'Cumhuriyet Mah.', shipping_address_2: 'No 5', shipping_city: 'Nilüfer', shipping_zone: 'Bursa',
  products: [{ order_product_id: 501, product_id: 40, name: 'Tişört', model: 'TS-01', sku: '', ean: '8690001', upc: '', image: 'https://magaza.com/image/catalog/t.jpg', quantity: 2, price: 100, tax: 18, total: 200,
    options: [{ product_option_value_id: 0, name: 'Not', value: 'Hediye paketi' }, { product_option_value_id: 77, name: 'Beden', value: 'M' }] }],
  totals: [{ code: 'sub_total', title: 'Ara Toplam', value: 200 }, { code: 'total', title: 'Toplam', value: 236 }], ...extra });

test('OpenCart: adres, eksik bilgiler, durum eşlemesi', async () => {
  assert.equal(opencart({ ...ENV, OPENCART_URL: 'http://magaza.com' }, {}).enabled, false, 'düz HTTP kabul edilmez');
  assert.deepEqual(opencart({ OPENCART_URL: 'https://x.com' }, {}).missing, ['OPENCART_KEY']);
  assert.deepEqual(opencart({}, {}).missing, ['OPENCART_URL', 'OPENCART_KEY']);
  const ch = opencart(ENV, { id: 'opencart' });
  assert.equal(ch.enabled, true);
  assert.equal(ch.type, 'opencart');
  assert.deepEqual([ch.caps.ship, ch.caps.accept, ch.caps.manualTracking, ch.caps.label, ch.caps.price], ['remote', 'local', true, null, true]);
  assert.deepEqual(['Pending', 'Processing', 'Hazırlanıyor', 'Shipped', 'Kargoya Verildi', 'Complete', 'Teslim Edildi', 'Canceled', 'İptal Edildi', 'Denied', 'Voided', 'Reversed', 'Canceled Reversal', 'Refunded', 'İade Edildi', 'Chargeback', 'Bilinmeyen', ''].map(ocStatus),
    ['new', 'new', 'new', 'shipped', 'shipped', 'delivered', 'delivered', 'cancelled', 'cancelled', 'cancelled', 'cancelled', 'cancelled', 'new', 'returned', 'returned', 'returned', 'new', 'new']);
  // yönetim / index.php / dosya adresi yapıştırılsa da site köküne gidilir; özel dosya adı
  const calls = mockFetch(() => ({ ok: true, orders: [], more: false }));
  await ch.fetchOrders(0, 1000);
  await opencart({ ...ENV, OPENCART_URL: 'https://magaza.com/shop/hasturk-baglanti.php', OPENCART_BRIDGE: 'baglanti-x.php' }, {}).fetchOrders(0, 1000);
  await opencart({ ...ENV, OPENCART_BRIDGE: '../kotu.php' }, {}).fetchOrders(0, 1000);
  assert.deepEqual(calls.map((c) => c.url), ['https://magaza.com/hasturk-baglanti.php?action=orders', 'https://magaza.com/shop/baglanti-x.php?action=orders', 'https://magaza.com/hasturk-baglanti.php?action=orders']);
});

test('OpenCart: siparişler anahtarla, değiştirilme tarihine göre sayfalı; KDV, seçenek, adres, para birimi', async () => {
  const calls = mockFetch((c) => (c.body.page === 1
    ? { ok: true, orders: [ocOrder(1, 'Processing'), ocOrder(2, 'Kargoya Verildi', { shipping_address_1: '', shipping_city: '', customer_id: 0, products: [] })], more: true }
    : { ok: true, orders: [ocOrder(3, 'Refunded', { currency_code: 'USD', currency_value: 0.03, total: 1000, products: [{ order_product_id: 9, product_id: 41, name: 'Kürek', model: 'K1', sku: 'KR-1', ean: '', upc: '123', image: '', quantity: 3, price: 100, tax: 20, total: 300, options: [] }] })], more: false }));
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-03T00:00:00.500Z');
  const list = await opencart(ENV, {}).fetchOrders(since, until);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['X-Hasturk-Key'], KEY);
  assert.equal(action(calls[0]), 'orders');
  assert.deepEqual(calls[0].body, { since: since / 1000, until: Math.ceil(until / 1000), by: 'modified', limit: 100, page: 1, key: KEY });
  assert.equal(calls[1].body.page, 2);
  assert.equal(list.length, 3);
  const o = list[0];
  assert.deepEqual({ remoteId: o.remoteId, orderNumber: o.orderNumber, status: o.status, remoteStatus: o.remoteStatus, total: o.total, currency: o.currency, customer: o.customer, email: o.email, phone: o.phone, customerId: o.customerId, tracking: o.tracking, cargoCompany: o.cargoCompany, orderedAt: o.orderedAt },
    { remoteId: '1', orderNumber: '1', status: 'new', remoteStatus: 'Processing', total: 236, currency: 'TRY', customer: 'Ali Veli', email: 'ali@x.com', phone: '0532', customerId: '7', tracking: '', cargoCompany: '', orderedAt: 1759312800000 });
  assert.deepEqual(o.address, { name: 'Ayşe Veli', line: 'Cumhuriyet Mah. No 5', district: 'Nilüfer', city: 'Bursa', phone: '0532' });
  // (fiyat + birim vergi) × adet; seçenek değeri olan satır ilanın kimliğiyle eşleşir
  assert.deepEqual(o.items, [{ lineId: '501', sku: 'TS-01', barcode: '8690001', name: 'Tişört - Hediye paketi / M', image: 'https://magaza.com/image/catalog/t.jpg', quantity: 2, unitPrice: 118, total: 236, status: '', remoteKey: '40:77' }]);
  assert.equal(o.packages, null);
  // teslimat adresi boşsa fatura adresi (bölge = il, şehir = ilçe)
  assert.deepEqual([list[1].status, list[1].address.city, list[1].address.district, list[1].address.name, list[1].customerId], ['shipped', 'İstanbul', 'Kadıköy', 'Ali Veli', '']);
  // tutarlar varsayılan para biriminde: siparişin para birimine currency_value ile çevrilir
  const u = list[2];
  assert.deepEqual([u.status, u.currency, u.total], ['returned', 'USD', 30]);
  assert.deepEqual([u.items[0].unitPrice, u.items[0].total, u.items[0].sku, u.items[0].barcode, u.items[0].remoteKey], [3.6, 10.8, 'KR-1', '123', '41']);
  // geçmiş aktarımı sipariş tarihine göre
  const calls2 = mockFetch(() => ({ ok: true, orders: [], more: false }));
  await opencart(ENV, {}).fetchOrders(since, since + 864e5, { byOrdered: true });
  assert.equal(calls2[0].body.by, 'added');
});

test('OpenCart: dosya yoksa (HTML sayfa) ya da anahtar yanlışsa anlaşılır hata', async () => {
  mockFetch(() => '<!DOCTYPE html><html><body>Sayfa bulunamadı</body></html>');
  await assert.rejects(opencart(ENV, {}).fetchListings(), /OpenCart: https:\/\/magaza\.com\/hasturk-baglanti\.php bağlantı dosyası yanıt vermedi \(dosya yüklenmemiş ya da adı farklı\)/);
  mockFetch(() => ({ status: 401, body: { ok: false, message: 'Anahtar geçersiz' } }));
  await assert.rejects(opencart(ENV, {}).fetchListings(), /HTTP 401 Anahtar geçersiz/);
});

test('OpenCart: ürünler; seçenek değerleri ayrı varyant, indirimli fiyat ve seçenek farkı', async () => {
  const simple = { product_id: 10, model: 'KR-10', sku: '', ean: '8690010', upc: '', name: 'Kürek', quantity: 4, price: 120, special: 90, status: 1, image: 'https://magaza.com/image/k.jpg', images: ['https://magaza.com/image/k2.jpg'], options: [] };
  const opt = { product_id: 20, model: 'TS', sku: 'TS-20', ean: '869', name: 'Tişört', quantity: 9, price: 100, special: null, status: 0, image: '', images: [],
    options: [{ product_option_value_id: 201, option_name: 'Beden', name: 'S', quantity: 3, price: 0, price_prefix: '+' }, { product_option_value_id: 202, option_name: 'Beden', name: 'XL', quantity: -1, price: 15, price_prefix: '+' }, { product_option_value_id: 203, option_name: 'Beden', name: 'XS', quantity: 2, price: 10, price_prefix: '-' }] };
  const calls = mockFetch((c) => (c.body.page === 1 ? { ok: true, products: [simple, opt], more: true } : { ok: true, products: [{ ...simple, product_id: 11, special: 150 }], more: false }));
  const out = await opencart(ENV, {}).fetchListings();
  assert.deepEqual(calls.map((c) => [action(c), c.body.page, c.body.limit]), [['products', 1, 500], ['products', 2, 500]]);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0], { remoteId: '10', remoteProductId: '10', sku: 'KR-10', barcode: '8690010', name: 'Kürek', groupName: 'Kürek', variantName: '', image: 'https://magaza.com/image/k.jpg', images: ['https://magaza.com/image/k.jpg', 'https://magaza.com/image/k2.jpg'], price: 90, listPrice: 120, stock: 4, active: true });
  assert.deepEqual(out[1], { remoteId: '20:201', remoteProductId: '20', sku: '', barcode: '', name: 'Tişört - S', groupName: 'Tişört', variantName: 'S', image: '', images: [], price: 100, listPrice: 100, stock: 3, active: false });
  assert.deepEqual([out[2].remoteId, out[2].price, out[2].listPrice, out[2].stock], ['20:202', 115, 115, 0]);
  assert.deepEqual([out[3].remoteId, out[3].price, out[3].listPrice], ['20:203', 90, 90]);
  assert.deepEqual([out[4].remoteId, out[4].price, out[4].listPrice], ['11', 120, 120], 'ana fiyattan yüksek "indirim" yok sayılır');
});

test('OpenCart: stok ve fiyat gönderimi; seçenek kalemleri ürün + seçenek değeriyle, hatalar toplanır', async () => {
  const calls = mockFetch(() => ({ ok: true, updated: 1, errors: [] }));
  const ch = opencart(ENV, {});
  await ch.pushStock([{ remoteId: '10', remoteProductId: '10', stock: 4 }, { remoteId: '20:201', remoteProductId: '20', stock: -2 }, { remoteId: '30', stock: 1.6 }]);
  assert.equal(action(calls[0]), 'stock');
  assert.deepEqual(calls[0].body.items, [{ product_id: 10, quantity: 4 }, { product_id: 20, option_value_id: 201, quantity: 0 }, { product_id: 30, quantity: 2 }]);
  await ch.pushPrice([{ remoteId: '10', remoteProductId: '10', price: 90, listPrice: 120 }, { remoteId: '11', remoteProductId: '11', price: 75.5, listPrice: 0 }, { remoteId: '20:202', remoteProductId: '20', price: 115, listPrice: 115 }]);
  assert.equal(action(calls[1]), 'price');
  assert.deepEqual(calls[1].body.items, [{ product_id: 10, price: 120, special: 90 }, { product_id: 11, price: 75.5, special: 0 }, { product_id: 20, option_value_id: 202, price: 115, special: 0 }]);
  // 200'den fazlası parçalanır; kalem hataları bildirilir
  const many = Array.from({ length: 250 }, (_, i) => ({ remoteId: String(i + 1), remoteProductId: String(i + 1), stock: 1 }));
  const calls2 = mockFetch((c) => ({ ok: true, updated: c.body.items.length - 1, errors: c.body.items.length === 50 ? [{ product_id: 220, message: 'ürün bulunamadı' }] : [{ product_id: 5, option_value_id: 9, message: 'seçenek bulunamadı' }] }));
  await assert.rejects(ch.pushStock(many), /OpenCart: 2 ürün güncellenemedi \(5:9: seçenek bulunamadı; 220: ürün bulunamadı\)/);
  assert.deepEqual(calls2.map((c) => c.body.items.length), [200, 50]);
});

test('OpenCart: kargoya verme not + durum; başka açık paket varsa yalnız not', async () => {
  const calls = mockFetch(() => ({ ok: true, order_status_id: 3 }));
  await opencart(ENV, {}).ship({ remote_id: '77', packages: [{ id: 1, status: 'open' }] }, { id: 1 }, { cargoCompany: 'Aras Kargo', tracking: 'AR5' });
  assert.equal(action(calls[0]), 'ship');
  assert.deepEqual(calls[0].body, { order_id: 77, order_status_id: 0, keep_status: false, comment: 'Kargo: Aras Kargo · Takip: AR5', notify: true, key: KEY });
  await opencart({ ...ENV, OPENCART_SHIP_STATUS: '17' }, {}).ship({ remote_id: '78', packages: [] }, null, {});
  assert.deepEqual([calls[1].body.order_status_id, calls[1].body.comment, calls[1].body.keep_status], [17, 'Siparişiniz kargoya verildi', false]);
  const ch = opencart(ENV, {}), two = { remote_id: '79', packages: [{ id: 1, status: 'open' }, { id: 2, status: 'open' }] };
  await ch.ship(two, { id: 1 }, { tracking: 'X1' });
  assert.deepEqual([calls[2].body.keep_status, calls[2].body.comment], [true, 'Takip: X1']);
  await ch.ship(two, { id: 1 }, {});
  assert.equal(calls.length, 3, 'başka açık paket var ve not yok: istek gönderilmez');
});

test('OpenCart: tanılama', async () => {
  mockFetch((c) => (action(c) === 'ping' ? { ok: true, version: '3.0.3.8', php: '7.4.33', counts: { products: 12, orders: 5 }, ship_status: { order_status_id: 3, name: 'Shipped' } }
    : c.body.ids ? { ok: true, orders: [ocOrder(55, 'Pending')], more: false } : { ok: true, orders: [ocOrder(5, 'Complete')], more: false }));
  const out = await opencart(ENV, {}).diagnose({ orderId: '55' });
  assert.deepEqual(out.map((x) => x.ok), [true, true, true, true]);
  assert.match(out[0].detail, /hasturk-baglanti\.php · OpenCart 3\.0\.3\.8 · PHP 7\.4\.33 · 12 ürün, 5 sipariş/);
  assert.match(out[1].detail, /1 sipariş · örnek #5: Complete → delivered/);
  assert.match(out[2].detail, /#55: Pending → new · 1 kalem/);
  assert.match(out[3].detail, /Shipped \(no 3\)/);
  mockFetch((c) => (action(c) === 'ping' ? { ok: true, version: '4.0.2.3', counts: {}, ship_status: null } : { ok: true, orders: [], more: false }));
  const noShip = await opencart(ENV, {}).diagnose({});
  assert.deepEqual(noShip.map((x) => x.ok), [true, true, false]);
  mockFetch(() => ({ status: 404, body: '<html>Not Found</html>' }));
  const bad = await opencart(ENV, {}).diagnose({});
  assert.deepEqual(bad.map((x) => x.ok), [false, null]);
  assert.match(bad[0].detail, /HTTP 404/);
  assert.match(bad[1].detail, /config\.php'nin yanına/);
});

test('OpenCart: bağlantı dosyası anahtarı gömülü indirilir; anahtar yoksa üretilip şifreli kaydedilir', async () => {
  const php = readFileSync(BRIDGE, 'utf8');
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 'sir', DB: d1(), ASSETS: { fetch: async (req) => (new URL(req.url).pathname === '/opencart-bridge.php' ? new Response(php) : new Response('yok', { status: 404 })) } };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  assert.equal((await call('/api/opencart-bridge?channel=trendyol')).status, 400, 'yalnız OpenCart kanalı');
  const r1 = await call('/api/opencart-bridge?channel=opencart');
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('Content-Disposition'), 'attachment; filename="hasturk-baglanti.php"');
  assert.equal(r1.headers.get('Cache-Control'), 'no-store');
  const f1 = await r1.text(), key = (/define\('HASTURK_KEY', '([^']+)'\);/.exec(f1) || [])[1];
  assert.match(key, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(!f1.includes("'__HASTURK_KEY__'"), 'yer tutucu kalmaz');
  assert.ok(f1.includes("'__HASTURK' . '_KEY__'"), 'dosyanın yer tutucu denetimi bozulmaz');
  assert.equal(f1.length, php.length - '__HASTURK_KEY__'.length + 32);
  const row = await env.DB.prepare("SELECT data FROM channel_config WHERE id = 'opencart'").first();
  assert.ok(row && !row.data.includes(key), 'anahtar veritabanında şifreli');
  const integ = await (await call('/api/integrations')).json(), oc = integ.channels.find((c) => c.id === 'opencart');
  const kf = oc.fields.find((f) => f.k === 'OPENCART_KEY');
  assert.deepEqual([kf.secret, kf.value, kf.masked, kf.source], [true, '', '••••••' + key.slice(-4), 'panel']);
  assert.ok(!JSON.stringify(integ).includes(key), 'anahtar istemciye açık dönmez');
  // yeniden indirmede aynı anahtar; özel dosya adı
  await call('/api/integrations/opencart', { method: 'PUT', body: JSON.stringify({ values: { OPENCART_URL: 'https://magaza.com', OPENCART_BRIDGE: 'baglanti-2.php' } }) });
  const r2 = await call('/api/opencart-bridge?channel=opencart');
  assert.equal(r2.headers.get('Content-Disposition'), 'attachment; filename="baglanti-2.php"');
  assert.ok((await r2.text()).includes(`define('HASTURK_KEY', '${key}');`));
  // ek mağaza kendi anahtarını alır
  const add = await (await call('/api/integrations/add', { method: 'POST', body: JSON.stringify({ type: 'opencart' }) })).json();
  assert.equal(add.id, 'opencart_2');
  const f3 = await (await call('/api/opencart-bridge?channel=opencart_2')).text();
  assert.ok(!f3.includes(key));
  assert.match(f3, /define\('HASTURK_KEY', '[A-Za-z0-9_-]{32}'\);/);
  // elle girilen anahtar biçime uymazsa kaydedilmez (dosyaya PHP metni olarak yazılır)
  const bad = await call('/api/integrations/opencart', { method: 'PUT', body: JSON.stringify({ values: { OPENCART_KEY: "kisa'); system('x" } }) });
  assert.equal(bad.status, 400);
});

// ---------- PHP dosyası (php kuruluysa) ----------
let php = '';
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); php = 'php'; } catch { /* php yok: atlanır */ }

test('OpenCart bağlantı dosyası: PHP sözdizimi', { skip: !php && 'php yok' }, () => {
  assert.match(execFileSync(php, ['-l', BRIDGE.pathname], { encoding: 'utf8' }), /No syntax errors/);
});

test('OpenCart bağlantı dosyası: yer tutucu ve yanlış anahtar reddedilir, ayrıntı sızmaz', { skip: !php && 'php yok' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ocb-'));
  const src = readFileSync(BRIDGE, 'utf8');
  writeFileSync(join(dir, 'ham.php'), src);
  writeFileSync(join(dir, 'b.php'), src.replace("define('HASTURK_KEY', '__HASTURK_KEY__');", `define('HASTURK_KEY', '${KEY}');`));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir], { stdio: 'ignore' });
  const post = (file, headers = {}, body = '{}', act = 'ping') => realFetch(`http://127.0.0.1:${port}/${file}?action=${act}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
    .then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), body: await r.json() }));
  try {
    for (let i = 0; i < 50; i++) { try { await realFetch(`http://127.0.0.1:${port}/b.php`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const get = await realFetch(`http://127.0.0.1:${port}/b.php`);
    assert.equal(get.status, 405);
    let r = await post('ham.php', { 'X-Hasturk-Key': '__HASTURK_KEY__' });
    assert.equal(r.status, 503, 'yer tutucu anahtarla çalışmaz');
    assert.match(r.body.message, /panelden .* yeniden indirin/);
    r = await post('b.php', { 'X-Hasturk-Key': 'yanlis' + KEY });
    assert.deepEqual([r.status, r.body], [401, { ok: false, message: 'Anahtar geçersiz' }]);
    assert.match(r.type, /application\/json/);
    r = await post('b.php');
    assert.equal(r.status, 401, 'anahtarsız istek');
    r = await post('b.php', { 'X-Hasturk-Key': KEY }, 'bozuk{');
    assert.equal(r.status, 400);
    r = await post('b.php', { 'X-Hasturk-Key': KEY }, '{}', 'drop');
    assert.deepEqual([r.status, r.body.message], [400, 'Bilinmeyen işlem']);
    r = await post('b.php', {}, JSON.stringify({ key: KEY })); // başlığı silen sunucular için gövdedeki anahtar
    assert.equal(r.status, 500);
    assert.match(r.body.message, /config\.php bulunamadı/);
  } finally { srv.kill(); rmSync(dir, { recursive: true, force: true }); }
});
