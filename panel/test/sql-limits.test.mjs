// D1 bir sorguya en fazla 100 değer kabul eder: kalabalık sayfalar (çok varyantlı ürün listesi, 200 siparişlik sayfa, toplu seçim) hata vermemeli
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run } from '../src/db.js';
import worker from '../src/index.js';

test('kalabalık listeler: 40 grup × 5 varyant ürün listesi, 200 siparişlik sayfa, 300 varyantlık düzenleyici', async () => {
  const db = d1(); await init(db);
  const t = Date.now();
  const prods = [];
  for (let g = 0; g < 40; g++) for (let v = 0; v < 5; v++) prods.push(`(${g * 5 + v + 1}, 'Ürün ${g}', 'Ürün ${g}', '${v + 1} Kg', 'SKU-${g}-${v}', 5, ${t}, ${t})`);
  await run(db, `INSERT INTO products (id, name, group_name, variant_name, sku, stock, created_at, updated_at) VALUES ${prods.join(',')}`);
  const orders = [];
  for (let i = 0; i < 150; i++) orders.push(`('trendyol:${i}', 'trendyol', '${i}', '${i}', 'new', ${t - i * 1000}, 10)`);
  await run(db, `INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total) VALUES ${orders.join(',')}`);
  const items = [];
  for (let i = 0; i < 150; i++) items.push(`('trendyol:${i}', 'l${i}', ${(i % 200) + 1}, 'A', 1, 10, 10)`);
  await run(db, `INSERT INTO order_items (order_id, line_id, product_id, name, quantity, unit_price, total) VALUES ${items.join(',')}`);
  const env = { DEMO: '1', PANEL_PASSWORD: 'pw-12345678', DB: db };
  let cookie = '';
  const call = async (path) => {
    const r = await worker.fetch(new Request('https://p.test/api/' + path, { method: path === 'login' ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: path === 'login' ? JSON.stringify({ password: 'pw-12345678' }) : undefined }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const j = await r.json(); if (r.status >= 400) throw new Error(`${path}: ${r.status} ${j.error}`); return j;
  };
  await call('login');
  const p = await call('products?group=1&limit=40&page=1');
  assert.ok(p.products.length >= 200, 'tüm varyantlar geldi');
  assert.ok(p.products.every((x) => Array.isArray(x.listings)));
  const o = await call('orders?status=all&limit=200&page=1');
  assert.equal(o.orders.length, 150);
  assert.ok(o.orders.every((x) => x.items.length === 1));
  const ids = Array.from({ length: 200 }, (_, i) => i + 1).join(',');
  const v = await call('products-variants?ids=' + ids);
  assert.equal(v.products.length, 200);
});
