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
  // Yazma yok
  assert.equal((await call('ext')('/api/v1/stock', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer ' + en.key } })).status, 405);
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
