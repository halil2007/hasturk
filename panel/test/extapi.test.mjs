// Dış API (stok aktarımı): yalnız ana panelin yetkilendirdiği mağaza, yalnız kendi ürünleri; anahtar, IP kısıtı, kapatma, yenileme
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { ipAllowed, parseIps } from '../src/extapi.js';

function setup() {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = {};
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who] || '', ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { env, call };
}
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
const ext = (call, key, path = '/api/v1/stock', ip = '1.2.3.4') => call('ext')(path, { headers: { Authorization: 'Bearer ' + key, 'CF-Connecting-IP': ip } });

test('IP kısıtı: tam adres ve IPv4 aralığı', () => {
  assert.equal(ipAllowed('85.105.10.7', ['85.105.10.0/24']), true);
  assert.equal(ipAllowed('85.105.11.7', ['85.105.10.0/24']), false);
  assert.equal(ipAllowed('1.2.3.4', []), true);
  assert.equal(ipAllowed('2a02::1', ['2A02::1']), true);
  assert.throws(() => parseIps('1.2.3'), /Geçersiz IP/);
});

test('dış API: ana panel yetkilendirir; mağaza yalnız kendi stoklarını okur', async () => {
  resetChannels();
  const { call } = setup();
  const O = call('owner'), A = call('a'), B = call('b');
  await O('/api/login', J({ password: 'x-123456' }));
  for (const [slug, who] of [['magaza-a', A], ['magaza-b', B]]) {
    assert.equal((await O('/api/tenants', J({ slug, name: slug.toUpperCase(), admin_username: 'yon', admin_password: 'gizli-sifre-1' }))).status, 200);
    assert.equal((await who('/api/login', J({ tenant: slug, username: 'yon', password: 'gizli-sifre-1' }))).status, 200);
  }
  for (let i = 1; i <= 3; i++) assert.equal((await A('/api/products', J({ name: 'A ürün ' + i, sku: 'A-' + i, barcode: '86900' + i, sale_price: 100 + i }))).status, 200);
  await B('/api/products', J({ name: 'B ürün', sku: 'B-1', sale_price: 50 }));
  // Firma yöneticisi yetkilendiremez
  assert.ok([403, 404].includes((await A('/api/tenants/magaza-a/api', J({ action: 'enable' }))).status));
  // Anahtar yokken / yanlış anahtar
  assert.equal((await ext(call, 'yok')).status, 401);
  assert.equal((await ext(call, 'hst_magaza-a_' + 'x'.repeat(32))).status, 401);
  // Ana panel açar: anahtar bir kez döner, sonra gösterilmez
  const en = await (await O('/api/tenants/magaza-a/api', J({ action: 'enable' }))).json();
  assert.match(en.key, /^hst_magaza-a_[A-Za-z0-9]{32}$/); assert.equal(en.api.on, true);
  const st = await (await O('/api/tenants/magaza-a/api')).json();
  assert.equal(st.key, undefined); assert.equal(st.hash, undefined); assert.match(st.hint, /…/);
  // Okuma: yalnız A'nın ürünleri
  const r = await (await ext(call, en.key)).json();
  assert.equal(r.store.code, 'magaza-a'); assert.equal(r.total, 3);
  assert.deepEqual(r.items.map((x) => x.sku).sort(), ['A-1', 'A-2', 'A-3']);
  assert.ok(r.items.every((x) => typeof x.stock === 'number' && x.updated_at));
  assert.equal((await (await ext(call, en.key, '/api/v1/stock?sku=A-2')).json()).items[0].name, 'A ürün 2');
  assert.equal((await (await ext(call, en.key, '/api/v1/stock?limit=2&page=2')).json()).items.length, 1);
  assert.equal((await (await ext(call, en.key, '/api/v1/ping')).json()).ok, true);
  // B'nin anahtarı yok: A'nın gizli kısmıyla B koduna istek reddedilir
  assert.equal((await ext(call, en.key.replace('magaza-a', 'magaza-b'))).status, 401);
  // Stok listesine yazılmaz (yazma yalnız satış bildirimi); başka yöntem yok
  assert.equal((await call('ext')('/api/v1/stock', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer ' + en.key } })).status, 404);
  assert.equal((await call('ext')('/api/v1/stock', { method: 'DELETE', headers: { Authorization: 'Bearer ' + en.key } })).status, 405);
  // Firma panelinde satış bildirimi: kendi ürününün stoğu düşer; başka firmanın ürünü bulunamaz
  const sale = (body) => call('ext')('/api/v1/sales', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer ' + en.key, 'CF-Connecting-IP': '1.2.3.4' } });
  let sr = await sale({ ref: 'WEB-1', items: [{ sku: 'A-1', quantity: 1 }] });
  assert.equal(sr.status, 201, await sr.clone().text());
  assert.equal((await sale({ ref: 'WEB-2', items: [{ sku: 'B-1', quantity: 1 }] })).status, 422);
  // IP kısıtı
  await O('/api/tenants/magaza-a/api', J({ action: 'ips', ips: '85.105.10.0/24' }));
  assert.equal((await ext(call, en.key, '/api/v1/stock', '1.2.3.4')).status, 403);
  assert.equal((await ext(call, en.key, '/api/v1/stock', '85.105.10.9')).status, 200);
  await O('/api/tenants/magaza-a/api', J({ action: 'ips', ips: '' }));
  // Kapatma ve yenileme: eski anahtar geçersiz
  await O('/api/tenants/magaza-a/api', J({ action: 'disable' }));
  assert.equal((await ext(call, en.key)).status, 403);
  const ro = await (await O('/api/tenants/magaza-a/api', J({ action: 'rotate' }))).json();
  assert.equal((await ext(call, en.key)).status, 401);
  assert.equal((await ext(call, ro.key)).status, 200);
  // Askıya alınan mağaza okunamaz
  await O('/api/tenants/magaza-a', J({ active: false }, 'PUT'));
  assert.equal((await ext(call, ro.key)).status, 403);
});

test('ana panelin kendi ürünleri: birden çok adlı anahtar, kapatma, silme, IP; firma panelleri etkilenmez', async () => {
  resetChannels();
  const { call } = setup();
  const O = call('owner');
  await O('/api/login', J({ password: 'x-123456' }));
  for (let i = 1; i <= 2; i++) await O('/api/products', J({ name: 'Ana ürün ' + i, sku: 'M-' + i, sale_price: 10 * i }));
  assert.equal((await O('/api/extapi', J({ name: '' }))).status, 400);
  const k1 = await (await O('/api/extapi', J({ name: 'Bayi 1' }))).json();
  const k2 = await (await O('/api/extapi', J({ name: 'ERP', ips: '9.9.9.9' }))).json();
  assert.match(k1.key, /^hsm_[a-z0-9]{8}_[A-Za-z0-9]{32}$/); assert.equal(k2.keys.length, 2);
  assert.ok(!JSON.stringify(k2.keys).includes(k1.key.slice(-10)), 'anahtar listede görünmez');
  const r = await (await ext(call, k1.key)).json();
  assert.equal(r.total, 2); assert.deepEqual(r.items.map((x) => x.sku).sort(), ['M-1', 'M-2']);
  assert.equal((await ext(call, k2.key, '/api/v1/stock', '1.2.3.4')).status, 403);
  assert.equal((await ext(call, k2.key, '/api/v1/stock', '9.9.9.9')).status, 200);
  const id1 = k2.keys.find((x) => x.name === 'Bayi 1').id;
  await O('/api/extapi/' + id1, J({ on: false }, 'PUT'));
  assert.equal((await ext(call, k1.key)).status, 403);
  await O('/api/extapi/' + id1, { method: 'DELETE' });
  assert.equal((await ext(call, k1.key)).status, 401);
  assert.equal((await ext(call, k1.key.replace(/.$/, 'x'))).status, 401);
});

// Bayi satışı: bayinin sitesinde satılan ürün stoktan düşer ve tüm kanallara gider; sipariş panele düşmez. Pasif / silinen ürün
// "değişenler" çekiminde bildirilir (bayi satmayı bıraksın)
test('stok API: satış bildirimi stok düşer (tekrar / aynı anda çift bildirimde bir kez), iptalde geri gelir, kanallara gider; pasif / silinen ürün bildirilir', async () => {
  resetChannels();
  const { env, call } = setup();
  const pend = [];
  const X0 = (key) => (path, opts = {}) => worker.fetch(new Request('https://panel.test/api/v1/' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', Authorization: 'Bearer ' + key } }), env, { waitUntil(p) { pend.push(p); } });
  const O = call('owner');
  await O('/api/login', J({ password: 'x-123456' }));
  await O('/api/settings', J({ stock_sync: true }, 'PUT'));
  await O('/api/products', J({ name: 'Domates Tohumu', sku: 'DT-1', barcode: '8690001', sale_price: 120, stock: 10 }));
  await O('/api/products', J({ name: 'Biber Tohumu', sku: 'BT-1', sale_price: 90, stock: 5 }));
  await O('/api/products', J({ name: 'Eski Ürün', sku: 'ES-1', sale_price: 50, stock: 3 }));
  const id = async (sku) => (await env.DB.prepare('SELECT id FROM products WHERE sku = ?').bind(sku).first()).id;
  // Trendyol'da aynı ürünün ilanı: bayi satışı Trendyol'a da stok olarak gider
  await O('/api/integrations/trendyol', J({ values: { TRENDYOL_SELLER_ID: '123', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' } }, 'PUT'));
  await env.DB.prepare("INSERT INTO listings (channel, remote_id, product_id, sku, barcode, name, pushed_stock, remote_stock) VALUES ('trendyol', '8690001', ?, 'DT-1', '8690001', 'Domates', 10, 10)").bind(await id('DT-1')).run();
  const real = globalThis.fetch, ty = [];
  globalThis.fetch = async (url, o = {}) => { if (/trendyol/.test(String(url))) { ty.push(o.body || ''); return new Response(JSON.stringify({ batchRequestId: 'b1' }), { headers: { 'Content-Type': 'application/json' } }); } return real(url, o); };
  try {
    const X = X0((await (await O('/api/extapi', J({ name: 'Bayi Örnek' }))).json()).key);
    const stockOf = async (sku) => (await (await X('stock?sku=' + sku)).json()).items[0].stock;
    const t0 = new Date(Date.now() - 1000).toISOString();
    // Bilinmeyen ürün: hiçbir stok düşmez
    let r = await X('sales', J({ ref: 'S-1', items: [{ sku: 'DT-1', quantity: 1 }, { sku: 'YOK', quantity: 1 }] }));
    assert.equal(r.status, 422); assert.equal(await stockOf('DT-1'), 10);
    assert.equal((await X('sales', J({ items: [{ sku: 'DT-1', quantity: 1 }] }))).status, 400);
    assert.equal((await X('sales', J({ ref: 'S-1', items: [{ sku: 'DT-1', quantity: 0 }] }))).status, 400);
    assert.equal((await X('sales', { method: 'POST', body: '{bozuk' })).status, 400);
    // Satış: stok düşer (sku, barkod ya da id ile), Trendyol'a yeni stok gider
    const body = { ref: 'S-1', items: [{ sku: 'DT-1', quantity: 2 }, { barcode: '8690001', quantity: 1 }, { id: await id('BT-1'), quantity: 1 }] };
    r = await X('sales', J(body));
    assert.equal(r.status, 201, await r.clone().text());
    const o = await r.json();
    assert.equal(o.created, true); assert.equal(o.sale.status, 'active');
    assert.equal(await stockOf('DT-1'), 7); assert.equal(await stockOf('BT-1'), 4);
    await Promise.allSettled(pend.splice(0));
    assert.ok(ty.some((b) => /"barcode":"8690001","quantity":7/.test(b)), 'Trendyol: ' + ty.join(' | '));
    // Tekrar (ağ hatası sonrası) ve aynı anda iki bildirim: stok bir kez düşer
    r = await X('sales', J(body));
    assert.equal(r.status, 200); assert.equal((await r.json()).created, false);
    const both = await Promise.all([X('sales', J({ ref: 'S-2', items: [{ sku: 'DT-1', quantity: 1 }] })), X('sales', J({ ref: 'S-2', items: [{ sku: 'DT-1', quantity: 1 }] }))]);
    assert.deepEqual(both.map((x) => x.status).sort(), [200, 201]);
    assert.equal(await stockOf('DT-1'), 6);
    // Aynı numara farklı adetle: reddedilir
    assert.equal((await X('sales', J({ ref: 'S-1', items: [{ sku: 'DT-1', quantity: 9 }] }))).status, 409);
    // Panelde: sipariş yok, ürünün stok hareketinde "Bayi satışı"
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 0);
    const mv = await env.DB.prepare("SELECT delta, reason, ref FROM stock_moves WHERE product_id = ? AND reason = 'Bayi satışı'").bind(await id('DT-1')).all();
    assert.equal(mv.results.reduce((a, x) => a + x.delta, 0), -4); assert.match(mv.results[0].ref, /Bayi Örnek #S-1/);
    // İptal: stok geri gelir; ikinci iptal bir şey değiştirmez
    r = await X('sales/S-1/cancel', J({}));
    assert.equal(r.status, 200); assert.equal((await r.json()).sale.status, 'cancelled');
    assert.equal(await stockOf('DT-1'), 9); assert.equal(await stockOf('BT-1'), 5);
    await X('sales/S-1/cancel', J({}));
    assert.equal(await stockOf('DT-1'), 9);
    assert.equal((await X('sales/YOK/cancel', J({}))).status, 404);
    assert.equal((await (await X('sales/S-2')).json()).sale.items[0].quantity, 1);
    // Başka bayinin aynı numarası ayrı satış sayılır; bu bayinin satışını iptal edemez
    const Y = X0((await (await O('/api/extapi', J({ name: 'Bayi 2' }))).json()).key);
    assert.equal((await Y('sales/S-2/cancel', J({}))).status, 404);
    assert.equal((await Y('sales', J({ ref: 'S-2', items: [{ sku: 'DT-1', quantity: 1 }] }))).status, 201);
    assert.equal(await stockOf('DT-1'), 8);
    // Değişenler çekimi: pasife alınan ürün stok 0 ile, silinen ürün "deleted" listesinde gelir; sonraki çekim zamanı verilir
    await O('/api/products/' + (await id('BT-1')), J({ active: false }, 'PUT'));
    await O('/api/products/' + (await id('ES-1')), { method: 'DELETE' });
    const ch = await (await X('stock?updated_since=' + encodeURIComponent(t0))).json();
    const bt = ch.items.find((x) => x.sku === 'BT-1');
    assert.ok(bt, 'pasif ürün değişenlerde'); assert.equal(bt.active, false); assert.equal(bt.stock, 0);
    assert.deepEqual(ch.deleted.map((x) => x.sku), ['ES-1']);
    assert.ok(Date.parse(ch.next_since) < Date.parse(ch.generated_at));
    // Tam liste: pasif ürün varsayılan olarak gelmez
    assert.ok(!(await (await X('stock')).json()).items.some((x) => x.sku === 'BT-1'));
    await Promise.allSettled(pend);
  } finally { globalThis.fetch = real; }
});
