// Dış API (stok aktarımı): yalnız ana panelin yetkilendirdiği mağaza, yalnız kendi ürünleri; anahtar, IP kısıtı, kapatma, yenileme
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { ipAllowed, parseIps, extApiInner } from '../src/extapi.js';
import { getRaw, setSetting } from '../src/db.js';

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
  for (let i = 1; i <= 3; i++) assert.equal((await A('/api/products', J({ name: 'A ürün ' + i, sku: 'A-' + i, barcode: '86900' + i, sale_price: 100 + i, stock: 5 }))).status, 200);
  await B('/api/products', J({ name: 'B ürün', sku: 'B-1', sale_price: 50 }));
  // Firma yöneticisi yetkilendiremez
  assert.ok([403, 404].includes((await A('/api/tenants/magaza-a/api', J({ action: 'enable' }))).status));
  // Anahtar yokken / yanlış anahtar
  assert.equal((await ext(call, 'yok')).status, 401);
  assert.equal((await ext(call, 'hst_magaza-a_' + 'x'.repeat(32))).status, 401);
  // Ana panel açar: anahtar bir kez döner, sonra gösterilmez
  const en = await (await O('/api/tenants/magaza-a/api', J({ action: 'enable' }))).json();
  assert.match(en.key, /^hst_magaza-a_[A-Za-z0-9]{32}$/); assert.equal(en.api.on, true); assert.equal(en.api.write, false, 'satış izni kapalı başlar');
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
  // Satış izni kapalıyken (varsayılan) anahtar yalnız okur: hiçbir POST kabul edilmez
  const sale = (body) => call('ext')('/api/v1/sales', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer ' + en.key, 'CF-Connecting-IP': '1.2.3.4' } });
  let sr = await sale({ ref: 'WEB-1', items: [{ sku: 'A-1', quantity: 1 }] });
  assert.equal(sr.status, 403); assert.equal((await sr.json()).code, 'readonly');
  assert.equal((await call('ext')('/api/v1/stock', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer ' + en.key } })).status, 403);
  assert.equal((await (await ext(call, en.key, '/api/v1/stock?sku=A-1')).json()).items[0].stock, 5);
  // Firma yöneticisi izni açamaz; ana panel açar
  assert.ok([403, 404].includes((await A('/api/tenants/magaza-a/api', J({ action: 'write', write: true }))).status));
  assert.equal((await (await O('/api/tenants/magaza-a/api', J({ action: 'write', write: true }))).json()).api.write, true);
  // Stok listesine yazılmaz (yazma yalnız satış bildirimi); başka yöntem yok
  assert.equal((await call('ext')('/api/v1/stock', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer ' + en.key } })).status, 404);
  assert.equal((await call('ext')('/api/v1/stock', { method: 'DELETE', headers: { Authorization: 'Bearer ' + en.key } })).status, 405);
  // Firma panelinde satış bildirimi: kendi ürününün stoğu düşer; başka firmanın ürünü bulunamaz
  sr = await sale({ ref: 'WEB-1', items: [{ sku: 'A-1', quantity: 1 }] });
  assert.equal(sr.status, 201, await sr.clone().text());
  assert.equal((await (await ext(call, en.key, '/api/v1/stock?sku=A-1')).json()).items[0].stock, 4);
  // Stoktan fazla: reddedilir, stok düşmez
  sr = await sale({ ref: 'WEB-3', items: [{ sku: 'A-2', quantity: 6 }] });
  assert.equal(sr.status, 409); assert.equal((await sr.json()).code, 'insufficient_stock');
  // İzin kapatılınca yeniden yalnız okur; yeniden açılır
  await O('/api/tenants/magaza-a/api', J({ action: 'write', write: false }));
  assert.equal((await sale({ ref: 'WEB-4', items: [{ sku: 'A-2', quantity: 1 }] })).status, 403);
  await O('/api/tenants/magaza-a/api', J({ action: 'write', write: true }));
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
    const X = X0((await (await O('/api/extapi', J({ name: 'Bayi Örnek', write: true }))).json()).key);
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
    const Y = X0((await (await O('/api/extapi', J({ name: 'Bayi 2', write: true }))).json()).key);
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

// Satış izni, yetersiz stok, günlük / kalem sınırı, senkron kapalıyken aynalanan ürün, iptal edilmiş numara, eşzamanlı farklı ürünlü
// aynı numara, büyük gövde (kimlik doğrulamadan önce okunmaz), bozuk numara
test('stok API satış güvenliği: izin, stok yeterliliği, sınırlar, senkron, iptal numarası, eşzamanlılık, gövde, bozuk ref', async () => {
  resetChannels();
  const { env, call } = setup();
  const X0 = (key) => (path, opts = {}) => worker.fetch(new Request('https://panel.test/api/v1/' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', Authorization: 'Bearer ' + key, ...(opts.headers || {}) } }), env, { waitUntil() {} });
  const O = call('owner');
  await O('/api/login', J({ password: 'x-123456' }));
  await O('/api/settings', J({ stock_sync: true }, 'PUT'));
  for (const [sku, stock] of [['P-1', 3], ['P-2', 10], ['P-3', 6000], ['P-4', 20]]) await O('/api/products', J({ name: 'Ürün ' + sku, sku, sale_price: 10, stock }));
  const id = async (sku) => (await env.DB.prepare('SELECT id FROM products WHERE sku = ?').bind(sku).first()).id;
  const stockOf = async (sku) => (await env.DB.prepare('SELECT stock FROM products WHERE sku = ?').bind(sku).first()).stock;
  const moves = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM stock_moves').first()).n;
  // İzin: yeni anahtar varsayılan olarak yalnız okur
  const k = await (await O('/api/extapi', J({ name: 'Bayi' }))).json();
  const kid = k.keys[0].id, X = X0(k.key);
  assert.equal(k.keys[0].write, false);
  let r = await X('sales', J({ ref: 'R-1', items: [{ sku: 'P-1', quantity: 1 }] }));
  assert.equal(r.status, 403); const ro = await r.json(); assert.equal(ro.code, 'readonly'); assert.match(ro.error, /satış bildirme izni yok/);
  assert.equal((await X('sales/R-1/cancel', J({}))).status, 403);
  assert.equal((await X('stock')).status, 200);
  assert.equal(await stockOf('P-1'), 3);
  assert.equal((await (await O('/api/extapi/' + kid, J({ write: true }, 'PUT'))).json()).keys[0].write, true);
  // Büyük gövde: Content-Length 256 KB üstü 413 (gövde okunmaz); yazma izni yoksa / anahtar geçersizse önce o
  const big = JSON.stringify({ ref: 'B-1', items: [{ sku: 'P-1', quantity: 1 }], pad: 'x'.repeat(300 * 1024) });
  assert.equal((await X('sales', { method: 'POST', body: big })).status, 413);
  assert.equal((await X('sales', { method: 'POST', body: '{}', headers: { 'Content-Length': String(400 * 1024) } })).status, 413);
  assert.equal((await X0('hsm_abcdefgh_' + 'x'.repeat(32))('sales', { method: 'POST', body: big })).status, 401);
  const k2 = await (await O('/api/extapi', J({ name: 'Okuyucu' }))).json();
  assert.equal((await X0(k2.key)('sales', { method: 'POST', body: big })).status, 403);
  // Bozuk % dizisi: 400 (500 değil)
  assert.equal((await X('sales/%E0%A4%A')).status, 400);
  assert.equal((await X('sales/%ZZ/cancel', J({}))).status, 400);
  // Yetersiz stok: hangi ürünlerde yetmediği listelenir, hiçbir stok düşmez; aynı numara sonra kullanılabilir
  r = await X('sales', J({ ref: 'R-1', items: [{ sku: 'P-1', quantity: 4 }, { sku: 'P-2', quantity: 2 }, { sku: 'P-4', quantity: 21 }] }));
  assert.equal(r.status, 409);
  const ins = await r.json();
  assert.equal(ins.code, 'insufficient_stock');
  assert.deepEqual(ins.items.map((x) => [x.sku, x.requested, x.available]).sort(), [['P-1', 4, 3], ['P-4', 21, 20]]);
  assert.equal(await stockOf('P-1'), 3); assert.equal(await stockOf('P-2'), 10); assert.equal(await moves(), 4);
  // Aynı ürün iki satırda: toplam adet stokla karşılaştırılır
  assert.equal((await X('sales', J({ ref: 'R-1', items: [{ sku: 'P-1', quantity: 2 }, { sku: 'P-1', quantity: 2 }] }))).status, 409);
  r = await X('sales', J({ ref: 'R-1', items: [{ sku: 'P-1', quantity: 3 }] }));
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal(await stockOf('P-1'), 0);
  assert.equal((await X('sales', J({ ref: 'R-2', items: [{ sku: 'P-1', quantity: 1 }] }))).status, 409);
  assert.equal(await stockOf('P-1'), 0);
  // Kalem sınırı
  assert.equal((await X('sales', J({ ref: 'R-3', items: Array.from({ length: 101 }, () => ({ sku: 'P-2', quantity: 1 })) }))).status, 400);
  assert.equal((await X('sales', J({ ref: 'R-3', items: [{ sku: 'P-3', quantity: 100001 }] }))).status, 400);
  // İptal edilmiş numara: tekrar bildirim 409 'cancelled' (stok düşmez)
  assert.equal((await X('sales/R-1/cancel', J({}))).status, 200);
  assert.equal(await stockOf('P-1'), 3);
  r = await X('sales', J({ ref: 'R-1', items: [{ sku: 'P-1', quantity: 3 }] }));
  assert.equal(r.status, 409); const cn = await r.json(); assert.equal(cn.code, 'cancelled'); assert.match(cn.error, /yeni numara/);
  assert.equal(await stockOf('P-1'), 3);
  // Eşzamanlı, aynı numara farklı ürünlerle: biri işlenir, diğeri 409; kalemler birleşmez
  const race = await Promise.all([X('sales', J({ ref: 'C-1', items: [{ sku: 'P-2', quantity: 1 }] })), X('sales', J({ ref: 'C-1', items: [{ sku: 'P-4', quantity: 1 }] }))]);
  assert.deepEqual(race.map((x) => x.status).sort(), [201, 409]);
  const rows = (await env.DB.prepare("SELECT product_id FROM ext_sales WHERE ref = 'C-1'").all()).results;
  assert.equal(rows.length, 1);
  assert.equal((await stockOf('P-2')) + (await stockOf('P-4')), 29);
  // Eşzamanlı, aynı numara aynı ürünle: bir kez düşer
  const twin = await Promise.all([1, 2, 3].map(() => X('sales', J({ ref: 'C-2', items: [{ sku: 'P-4', quantity: 2 }] }))));
  assert.deepEqual(twin.map((x) => x.status).sort(), [200, 200, 201]);
  // Eşzamanlı, farklı numaralar son stok için: stok eksiye düşmez
  const last = await Promise.all([X('sales', J({ ref: 'L-1', items: [{ sku: 'P-1', quantity: 2 }] })), X('sales', J({ ref: 'L-2', items: [{ sku: 'P-1', quantity: 2 }] }))]);
  assert.deepEqual(last.map((x) => x.status).sort(), [201, 409]);
  assert.equal(await stockOf('P-1'), 1);
  // Kesin eşzamanlı (aynı numara, farklı ürün): iki istek de "daha önce bildirilmedi" denetimini geçip yazıma birlikte varır (yazım bekletilir)
  let waiting = [];
  const gated = { prepare: (q) => env.DB.prepare(q), batch: async (st) => {
    await new Promise((ok) => { waiting.push(ok); if (waiting.length >= 2) { waiting.forEach((f) => f()); waiting = []; } else setTimeout(ok, 500); });
    return env.DB.batch(st);
  } };
  const inner = (body) => extApiInner(gated, new URL('https://main.internal/__api/sales'), { slug: 'ana-panel', name: 'Ana', key: kid, source: 'Bayi' }, 'race:' + Math.random(), { method: 'POST', body });
  const p24 = (await stockOf('P-2')) + (await stockOf('P-4'));
  const exact = await Promise.all([inner({ ref: 'C-3', items: [{ sku: 'P-2', quantity: 1 }] }), inner({ ref: 'C-3', items: [{ sku: 'P-4', quantity: 1 }] })]);
  assert.deepEqual(exact.map((x) => x.status).sort(), [201, 409]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM ext_sales WHERE ref = 'C-3'").first()).n, 1);
  assert.equal((await stockOf('P-2')) + (await stockOf('P-4')), p24 - 1);
  const p4 = await stockOf('P-4');
  // Aynı ürünle kesin eşzamanlı: stok bir kez düşer, ikincisi 200 (created false)
  const same2 = await Promise.all([inner({ ref: 'C-4', items: [{ sku: 'P-4', quantity: 1 }] }), inner({ ref: 'C-4', items: [{ sku: 'P-4', quantity: 1 }] })]);
  assert.deepEqual(same2.map((x) => x.status).sort(), [200, 201]);
  assert.equal(await stockOf('P-4'), p4 - 1);
  // Son stok için kesin eşzamanlı iki farklı numara: biri reddedilir, stok eksiye düşmez
  const p1 = await stockOf('P-1');
  const lastX = await Promise.all([inner({ ref: 'L-3', items: [{ sku: 'P-1', quantity: p1 }] }), inner({ ref: 'L-4', items: [{ sku: 'P-1', quantity: p1 }] })]);
  assert.deepEqual(lastX.map((x) => x.status).sort(), [201, 409]);
  assert.equal(await stockOf('P-1'), 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM ext_sale_refs WHERE ref IN ('L-3', 'L-4')").first()).n, 1);
  assert.equal((await lastX.find((x) => x.status === 409).json()).code, 'insufficient_stock');
  // Günlük sınır yok (varsayılan): stok yettikçe büyük satışlar kabul edilir
  r = await X('sales', J({ ref: 'D-1', items: [{ sku: 'P-3', quantity: 4980 }] }));
  assert.equal(r.status, 201);
  r = await X('sales', J({ ref: 'D-2', items: [{ sku: 'P-3', quantity: 100 }] }));
  assert.equal(r.status, 201);
  assert.equal(await stockOf('P-3'), 920);
  // Anahtara günlük sınır verilince uygulanır (son 24 saatte bu anahtarla bildirilen + 20); başka anahtarın sınırı ayrı
  const used = (await env.DB.prepare('SELECT SUM(qty) AS n FROM ext_sales WHERE src = ?').bind(kid).first()).n, lim = used + 20;
  assert.equal((await (await O('/api/extapi/' + kid, J({ day_limit: lim }, 'PUT'))).json()).keys.find((x) => x.id === kid).day_limit, lim);
  r = await X('sales', J({ ref: 'D-3', items: [{ sku: 'P-3', quantity: 21 }] }));
  assert.equal(r.status, 429); const dl = await r.json(); assert.equal(dl.code, 'daily_limit'); assert.match(dl.error, new RegExp(`günlük sınırı ${lim.toLocaleString('tr-TR').replace('.', '\\.')} adet`));
  assert.equal(await stockOf('P-3'), 920);
  assert.equal((await X('sales', J({ ref: 'D-3', items: [{ sku: 'P-3', quantity: 20 }] }))).status, 201);
  await O('/api/extapi/' + k2.keys.find((x) => x.name === 'Okuyucu').id, J({ write: true }, 'PUT'));
  assert.equal((await X0(k2.key)('sales', J({ ref: 'D-2', items: [{ sku: 'P-3', quantity: 100 }] }))).status, 201);
  assert.equal((await O('/api/extapi/' + kid, J({ day_limit: 'çok' }, 'PUT'))).status, 400);
  assert.equal((await (await O('/api/extapi/' + kid, J({ day_limit: '' }, 'PUT'))).json()).keys.find((x) => x.id === kid).day_limit, null);
  // Stok senkronu kapalı: stoğu siteden (ikas) aynalanan üründe satış ve iptal reddedilir; aynalanmayan üründe satış işlenir (uyarıyla)
  r = await X('sales', J({ ref: 'S-1', items: [{ sku: 'P-2', quantity: 1 }] }));
  assert.equal(r.status, 201);
  await env.DB.prepare("INSERT INTO listings (channel, remote_id, product_id, sku, name, remote_stock) VALUES ('ikas1', 'v-2', ?, 'P-2', 'Ürün P-2', 8)").bind(await id('P-2')).run();
  await O('/api/settings', J({ stock_sync: false }, 'PUT'));
  const p2 = await stockOf('P-2');
  r = await X('sales', J({ ref: 'S-2', items: [{ sku: 'P-2', quantity: 1 }, { sku: 'P-4', quantity: 1 }] }));
  assert.equal(r.status, 409);
  const so = await r.json();
  assert.equal(so.code, 'stock_sync_off'); assert.match(so.error, /stok senkronu kapalı; satış stoğa işlenemez/); assert.match(so.error, /Ayarlar → Stok → 'Stokları tüm kanallarda senkron tut' açılmalı/); assert.deepEqual(so.items.map((x) => x.sku), ['P-2']);
  assert.equal(await stockOf('P-2'), p2);
  r = await X('sales/S-1/cancel', J({}));
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'stock_sync_off');
  assert.equal(await stockOf('P-2'), p2);
  r = await X('sales', J({ ref: 'S-3', items: [{ sku: 'P-4', quantity: 1 }] }));
  assert.equal(r.status, 201); assert.match((await r.json()).warnings.join(' '), /senkronu kapalı/);
  // Senkron açılınca aynı numarayla gönderilebilir
  await O('/api/settings', J({ stock_sync: true }, 'PUT'));
  assert.equal((await X('sales', J({ ref: 'S-2', items: [{ sku: 'P-2', quantity: 1 }] }))).status, 201);
  assert.equal(await stockOf('P-2'), p2 - 1);
});

// Eski anahtar uyumu (satış izni eklenmeden önce oluşturulmuş, izin alanı olmayan anahtar): daha önce satış bildirdiyse devam eder ve
// izin kalıcı olarak açık kaydedilir; hiç satış bildirmemişse yalnız okur; izin açıkça kapalıysa her zaman reddedilir. Günlük sınır
// anahtar başına, isteğe bağlı (varsayılan sınırsız)
test('stok API (ana panel): eski anahtar uyumu ve anahtar başına isteğe bağlı günlük sınır', async () => {
  resetChannels();
  const { env, call } = setup();
  const X0 = (key) => (path, opts = {}) => worker.fetch(new Request('https://panel.test/api/v1/' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', Authorization: 'Bearer ' + key } }), env, { waitUntil() {} });
  const O = call('owner');
  await O('/api/login', J({ password: 'x-123456' }));
  await O('/api/settings', J({ stock_sync: true }, 'PUT'));
  await O('/api/products', J({ name: 'Çok stoklu', sku: 'Z-1', sale_price: 10, stock: 30000 }));
  const stockOf = async (sku) => (await env.DB.prepare('SELECT stock FROM products WHERE sku = ?').bind(sku).first()).stock;
  const stored = async (name) => ((await getRaw(env.DB, 'extapi_keys')) || []).find((x) => x.name === name);
  // Eski anahtarı taklit et: izin alanını sil
  const legacyOf = async (name) => { const l = await getRaw(env.DB, 'extapi_keys'); delete l.find((x) => x.name === name).write; await setSetting(env.DB, 'extapi_keys', l); };
  const a = await (await O('/api/extapi', J({ name: 'Eski bayi', write: true }))).json();
  const b = await (await O('/api/extapi', J({ name: 'Eski okuyucu' }))).json();
  const A = X0(a.key), B = X0(b.key);
  assert.equal((await A('sales', J({ ref: 'G-1', items: [{ sku: 'Z-1', quantity: 1 }] }))).status, 201);
  await legacyOf('Eski bayi'); await legacyOf('Eski okuyucu');
  assert.equal((await stored('Eski bayi')).write, undefined);
  // Daha önce satış bildirmiş eski anahtar: izinli; ilk başarılı satışta izin kalıcı olarak açılır
  let r = await A('sales', J({ ref: 'G-2', items: [{ sku: 'Z-1', quantity: 2 }] }));
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal((await stored('Eski bayi')).write, true);
  assert.equal((await (await O('/api/extapi')).json()).keys.find((x) => x.name === 'Eski bayi').write, true);
  // İptal de aynı kural: eski anahtarla iptal (izin kalıcı açılır)
  await legacyOf('Eski bayi');
  assert.equal((await A('sales/G-2/cancel', J({}))).status, 200);
  assert.equal((await stored('Eski bayi')).write, true);
  assert.equal(await stockOf('Z-1'), 29999);
  // Hiç satış bildirmemiş eski anahtar: yalnız okur (satış ve iptal 403), izin açılmaz; istemcinin iç parametreyi göndermesi işe yaramaz
  r = await B('sales', J({ ref: 'H-1', items: [{ sku: 'Z-1', quantity: 1 }] }));
  assert.equal(r.status, 403); assert.equal((await r.json()).code, 'readonly');
  assert.equal((await B('sales/G-1/cancel', J({}))).status, 403);
  assert.equal((await B('stock')).status, 200);
  assert.equal((await stored('Eski okuyucu')).write, undefined);
  // İzin açıkça kapalı: her zaman 403 (önceki satış olsa da)
  await O('/api/extapi/' + a.keys[0].id, J({ write: false }, 'PUT'));
  assert.equal((await A('sales', J({ ref: 'G-3', items: [{ sku: 'Z-1', quantity: 1 }] }))).status, 403);
  assert.equal((await A('sales?_x_legacy=1', J({ ref: 'G-3', items: [{ sku: 'Z-1', quantity: 1 }] }))).status, 403);
  assert.equal((await A('sales/G-1/cancel', J({}))).status, 403);
  assert.equal(await stockOf('Z-1'), 29999);
  // Günlük sınır yok (varsayılan): tek günde 20.000 adet, stok yettikçe kabul
  const c = await (await O('/api/extapi', J({ name: 'Dropship', write: true }))).json();
  assert.equal(c.keys.find((x) => x.name === 'Dropship').day_limit, null);
  const C = X0(c.key);
  assert.equal((await C('sales', J({ ref: 'Q-1', items: [{ sku: 'Z-1', quantity: 15000 }] }))).status, 201);
  assert.equal((await C('sales', J({ ref: 'Q-2', items: [{ sku: 'Z-1', quantity: 5000 }] }))).status, 201);
  assert.equal(await stockOf('Z-1'), 9999);
  // Stoktan fazlası yine reddedilir
  r = await C('sales', J({ ref: 'Q-3', items: [{ sku: 'Z-1', quantity: 10000 }] }));
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'insufficient_stock');
  // Günlük sınır 10 (yeni anahtarda verilir): 10 adet kabul, 11. adet 429; istemci iç parametreyle sınırı aşamaz
  const d = await (await O('/api/extapi', J({ name: 'Sınırlı', write: true, day_limit: 10 }))).json();
  assert.equal(d.keys.find((x) => x.name === 'Sınırlı').day_limit, 10);
  const D = X0(d.key);
  assert.equal((await D('sales', J({ ref: 'L-1', items: [{ sku: 'Z-1', quantity: 4 }] }))).status, 201);
  assert.equal((await D('sales', J({ ref: 'L-2', items: [{ sku: 'Z-1', quantity: 6 }] }))).status, 201);
  r = await D('sales?_x_day=0', J({ ref: 'L-3', items: [{ sku: 'Z-1', quantity: 1 }] }));
  assert.equal(r.status, 429); const dl = await r.json(); assert.equal(dl.code, 'daily_limit'); assert.match(dl.error, /günlük sınırı 10 adet/);
  assert.equal(await stockOf('Z-1'), 9989);
  // Sınır kaldırılınca (boş) yeniden kabul
  await O('/api/extapi/' + d.keys.find((x) => x.name === 'Sınırlı').id, J({ day_limit: '' }, 'PUT'));
  assert.equal((await D('sales', J({ ref: 'L-3', items: [{ sku: 'Z-1', quantity: 1 }] }))).status, 201);
});

test('stok API (firma paneli): eski anahtar uyumu ve isteğe bağlı günlük sınır', async () => {
  resetChannels();
  const { env, call } = setup();
  const O = call('owner'), A = call('a'), B = call('b');
  await O('/api/login', J({ password: 'x-123456' }));
  for (const [slug, who] of [['magaza-a', A], ['magaza-b', B]]) {
    assert.equal((await O('/api/tenants', J({ slug, name: slug.toUpperCase(), admin_username: 'yon', admin_password: 'gizli-sifre-1' }))).status, 200);
    assert.equal((await who('/api/login', J({ tenant: slug, username: 'yon', password: 'gizli-sifre-1' }))).status, 200);
    assert.equal((await who('/api/settings', J({ stock_sync: true }, 'PUT'))).status, 200);
    await who('/api/products', J({ name: 'Ürün', sku: 'T-1', sale_price: 10, stock: 30000 }));
  }
  const X0 = (key) => (path, opts = {}) => call('ext')('/api/v1/' + path, { ...opts, headers: { Authorization: 'Bearer ' + key, 'CF-Connecting-IP': '1.2.3.4' } });
  const stockOf = async (X) => (await (await X('stock?sku=T-1')).json()).items[0].stock;
  const apiRow = async (slug) => JSON.parse((await env.DB.prepare('SELECT api FROM tenants WHERE slug = ?').bind(slug).first()).api);
  const ka = (await (await O('/api/tenants/magaza-a/api', J({ action: 'enable' }))).json()).key;
  const kb = (await (await O('/api/tenants/magaza-b/api', J({ action: 'enable' }))).json()).key;
  const XA = X0(ka), XB = X0(kb);
  // A: önce izinle bir satış, sonra izin alanı silinir (eski anahtar)
  await O('/api/tenants/magaza-a/api', J({ action: 'write', write: true }));
  assert.equal((await XA('sales', J({ ref: 'W-1', items: [{ sku: 'T-1', quantity: 1 }] }))).status, 201);
  await env.DB.prepare("UPDATE tenants SET api = json_remove(api, '$.write') WHERE slug = 'magaza-a'").run();
  assert.equal((await apiRow('magaza-a')).write, undefined);
  let r = await XA('sales', J({ ref: 'W-2', items: [{ sku: 'T-1', quantity: 2 }] }));
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal((await apiRow('magaza-a')).write, true);
  assert.equal((await (await O('/api/tenants/magaza-a/api')).json()).write, true);
  // İptal de aynı kural
  await env.DB.prepare("UPDATE tenants SET api = json_remove(api, '$.write') WHERE slug = 'magaza-a'").run();
  assert.equal((await XA('sales/W-2/cancel', J({}))).status, 200);
  assert.equal((await apiRow('magaza-a')).write, true);
  assert.equal(await stockOf(XA), 29999);
  // B: izin alanı hiç yok (yeni / eski anahtar), hiç satış yok → yalnız okur; iç parametre işe yaramaz
  assert.equal((await apiRow('magaza-b')).write, undefined);
  r = await XB('sales?_x_legacy=1', J({ ref: 'W-1', items: [{ sku: 'T-1', quantity: 1 }] }));
  assert.equal(r.status, 403); assert.equal((await r.json()).code, 'readonly');
  assert.equal((await XB('sales/W-1/cancel', J({}))).status, 403);
  assert.equal((await apiRow('magaza-b')).write, undefined);
  assert.equal(await stockOf(XB), 30000);
  // Açıkça kapalı: önceki satış olsa da 403
  await O('/api/tenants/magaza-a/api', J({ action: 'write', write: false }));
  assert.equal((await XA('sales', J({ ref: 'W-3', items: [{ sku: 'T-1', quantity: 1 }] }))).status, 403);
  assert.equal((await XA('sales?_x_legacy=1', J({ ref: 'W-3', items: [{ sku: 'T-1', quantity: 1 }] }))).status, 403);
  await O('/api/tenants/magaza-a/api', J({ action: 'write', write: true }));
  // Günlük sınır yok (varsayılan): tek günde 20.000 adet
  assert.equal((await (await O('/api/tenants/magaza-a/api')).json()).day_limit, null);
  assert.equal((await XA('sales', J({ ref: 'Q-1', items: [{ sku: 'T-1', quantity: 15000 }] }))).status, 201);
  assert.equal((await XA('sales', J({ ref: 'Q-2', items: [{ sku: 'T-1', quantity: 5000 }] }))).status, 201);
  assert.equal(await stockOf(XA), 9999);
  // Günlük sınır 10 (B): 10 adet kabul, 11. adet 429; firma yöneticisi sınırı değiştiremez; istemci iç parametreyle aşamaz
  assert.ok([403, 404].includes((await B('/api/tenants/magaza-b/api', J({ action: 'day_limit', day_limit: 0 }))).status));
  assert.equal((await O('/api/tenants/magaza-b/api', J({ action: 'day_limit', day_limit: -3 }))).status, 400);
  assert.equal((await (await O('/api/tenants/magaza-b/api', J({ action: 'day_limit', day_limit: 10 }))).json()).api.day_limit, 10);
  await O('/api/tenants/magaza-b/api', J({ action: 'write', write: true }));
  assert.equal((await XB('sales', J({ ref: 'L-1', items: [{ sku: 'T-1', quantity: 10 }] }))).status, 201);
  r = await XB('sales?_x_day=0', J({ ref: 'L-2', items: [{ sku: 'T-1', quantity: 1 }] }));
  assert.equal(r.status, 429); const dl = await r.json(); assert.equal(dl.code, 'daily_limit'); assert.match(dl.error, /günlük sınırı 10 adet/);
  assert.equal(await stockOf(XB), 29990);
  // Sınır kaldırılınca kabul
  assert.equal((await (await O('/api/tenants/magaza-b/api', J({ action: 'day_limit', day_limit: '' }))).json()).api.day_limit, null);
  assert.equal((await XB('sales', J({ ref: 'L-2', items: [{ sku: 'T-1', quantity: 1 }] }))).status, 201);
});
