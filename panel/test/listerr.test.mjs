// İlan hataları: ikas grubundaki tek hatalı varyant diğerlerini engellemez; hatalar nedenine göre gruplanır, açıklanır ve yeniden denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { ikas } from '../src/channels/ikas.js';
import { explainError, errorKey } from '../public/listerr.js';
import worker from '../src/index.js';

const ENV = { IKAS1_STORE: 'm', IKAS1_CLIENT_ID: 'id', IKAS1_CLIENT_SECRET: 's', IKAS1_STOCK_LOCATION_ID: 'loc' };
const R = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });

test('ikas stok / fiyat: gruptaki hatalı varyant ayrılır, diğerleri gönderilir', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, o = {}) => {
    if (/oauth\/token/.test(String(url))) return R({ access_token: 'T', expires_in: 3600 });
    calls++;
    const b = JSON.parse(o.body), inp = b.variables.input;
    const ids = (inp.productStockLocationInputs || inp.variantPriceInputs).map((x) => x.variantId);
    return R(ids.includes('v7') || ids.includes('v150') ? { errors: [{ message: 'Variant not found' }] } : { data: { ok: true } });
  };
  try {
    const ch = ikas(ENV, 'IKAS1_', { id: 'ikas1' });
    const items = Array.from({ length: 160 }, (_, i) => ({ remoteId: 'v' + i, remoteProductId: 'p', stock: 1, price: 10 }));
    const r = await ch.pushStock(items);
    assert.equal(r.done.length, 158);
    assert.deepEqual(r.errors.map((x) => x.remoteId).sort(), ['v150', 'v7']);
    assert.equal(r.errors[0].error, 'Variant not found');
    assert.ok(calls < 40, `ikiye bölerek az istek (${calls})`);
    const p = await ch.pushPrice(items.slice(0, 10));
    assert.equal(p.done.length, 9);
  } finally { globalThis.fetch = real; }
});

test('hata açıklaması ve gruplama anahtarı', () => {
  const x = explainError('Stok: ikas: Variant not found');
  assert.equal(x.kind, 'Stok'); assert.equal(x.title, 'İlan kanalda bulunamadı');
  assert.equal(explainError('Fiyat kanal tarafından reddedildi: Kampanyadaki ürünün fiyatı değiştirilemez').title, 'Ürün kampanyada');
  assert.equal(explainError('Stok: HTTP 503 Service Unavailable').title, 'Kanal sunucusu geçici hata verdi');
  assert.equal(explainError('tuhaf mesaj').title, 'Kanal güncellemeyi kabul etmedi');
  assert.equal(errorKey('Stok: 8690001 barkodlu ürün 12 adet'), errorKey('Stok: 8690002 barkodlu ürün 3 adet'));
});

test('ilan hataları API: gruplar, yeniden dene stok / fiyatı yeniden gönderilecek işaretler', async () => {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 'sir', DB: d1() };
  await init(env.DB);
  const ins = (id, err) => env.DB.prepare("INSERT INTO listings (channel, remote_id, sku, price, pushed_stock, price_dirty, error) VALUES ('ikas1', ?, ?, 10, 5, 0, ?)").bind(id, id, err).run();
  await ins('a', 'Stok: ikas: Variant not found'); await ins('b', 'Stok: ikas: Variant not found'); await ins('c', 'Fiyat: kampanya');
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  const r = await call('listings/errors?channel=ikas1');
  assert.equal(r.total, 3);
  assert.equal(r.groups[0].count, 2); assert.equal(r.groups[0].title, 'İlan kanalda bulunamadı'); assert.equal(r.groups[0].items.length, 2);
  assert.equal((await call('listings/errors/retry', { method: 'POST', body: JSON.stringify({ channel: 'ikas1' }) })).n, 3);
  const rows = (await env.DB.prepare('SELECT remote_id, pushed_stock, price_dirty, error FROM listings ORDER BY remote_id').all()).results;
  assert.deepEqual(rows.map((x) => [x.remote_id, x.pushed_stock, x.price_dirty, x.error]), [['a', null, 0, null], ['b', null, 0, null], ['c', 5, 1, null]]);
});
