// Varyant grubu: tüm varyantları tek istekte düzenleme (fiyat, stok, kanal fiyatı, ortak alanlar)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import worker from '../src/index.js';
import { init, run, all, first } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';

test('varyant düzenleyici: fiyat, kritik stok, kanal fiyatı (kirli işaret), ortak ad; ikas stoğu korunur', async () => {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  await init(env.DB);
  const t = Date.now();
  for (const [sku, v] of [['T-1', 'Kırmızı'], ['T-2', 'Mavi'], ['T-3', 'Yeşil']]) await run(env.DB, 'INSERT INTO products (sku, name, group_name, variant_name, sale_price, purchase_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, 100, 50, 5, ?, ?)', sku, 'Tişört ' + v, 'Tişört', v, t, t);
  const ids = (await all(env.DB, 'SELECT id FROM products ORDER BY id')).map((r) => r.id);
  await run(env.DB, "INSERT INTO listings (channel, remote_id, product_id, sku, name, price, remote_stock) VALUES ('trendyol', 'ty1', ?, 'T-1', 'Tişört Kırmızı', 120, 5)", ids[0]);
  await run(env.DB, "INSERT INTO listings (channel, remote_id, product_id, sku, name, price, remote_stock) VALUES ('ikas1', 'ik2', ?, 'T-2', 'Tişört Mavi', 110, 7)", ids[1]);
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  const g = await (await call('/api/products-variants?ids=' + ids.join(','))).json();
  assert.equal(g.products.length, 3);
  assert.equal(g.products.find((p) => p.id === ids[1]).site_stock, true, 'ikas ilanı olan varyantın stoğu siteden');
  const r = await (await call('/api/products-variants', { method: 'POST', body: JSON.stringify({
    shared: { group_name: 'Basic Tişört' },
    items: [
      { id: ids[0], sale_price: 129.9, critical_stock: 3, stock: 12, listings: [{ channel: 'trendyol', remote_id: 'ty1', price: 149.9 }] },
      { id: ids[1], stock: 99 }, // stok ikas'tan okunur → hata, diğerleri kaydedilir
      { id: ids[2], purchase_price: 55, active: 0 },
    ],
  }) })).json();
  assert.equal(r.saved, 2); assert.equal(r.errors.length, 1); assert.equal(r.errors[0].id, ids[1]);
  const ps = await all(env.DB, 'SELECT id, group_name, sale_price, purchase_price, critical_stock, stock, active FROM products ORDER BY id');
  assert.equal(ps[0].sale_price, 129.9); assert.equal(ps[0].critical_stock, 3); assert.equal(ps[0].stock, 12);
  assert.equal(ps[2].purchase_price, 55); assert.equal(ps[2].active, 0);
  assert.equal(ps[0].group_name, 'Basic Tişört'); assert.equal(ps[2].group_name, 'Basic Tişört');
  assert.equal(ps[1].stock, 5, 'ikas stoğu değişmedi');
  const l = await first(env.DB, "SELECT price, price_dirty FROM listings WHERE remote_id = 'ty1'");
  assert.equal(l.price, 149.9); assert.equal(l.price_dirty, 1);
});
