// Cloudflare D1 bir sorguda en fazla 100 değişken kabul eder: çok sayıda sipariş / ürünle çalışan ekranlar bu sınırı aşmamalı
// (dev/d1.mjs aynı sınırı uygular). Ayrıca müşteri özetinde il bazında satılan adet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { pickList } from '../src/picklist.js';
import { summary } from '../src/customers.js';
import worker from '../src/index.js';

async function seed(n) {
  const db = d1(); await init(db);
  const st = [], now = Date.now();
  for (let i = 1; i <= 150; i++) st.push(db.prepare("INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (?, ?, ?, ?, 5, 0, 0)").bind(i, 'S' + i, 'B' + i, 'Ürün ' + i));
  for (let i = 1; i <= n; i++) {
    st.push(db.prepare("INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, updated_at, customer, total, address, ckey) VALUES (?, 'trendyol', ?, ?, 'new', ?, ?, 'X', 10, ?, ?)")
      .bind('trendyol:' + i, String(i), String(i), now - i * 1000, now, JSON.stringify({ city: i % 2 ? 'Konya' : 'Bursa' }), 'n:' + (i % 40)));
    st.push(db.prepare("INSERT INTO order_items (order_id, line_id, product_id, sku, name, quantity, unit_price, total, status) VALUES (?, '1', ?, 'S', 'Ürün', 2, 5, 10, NULL)").bind('trendyol:' + i, 1 + (i % 150)));
  }
  for (let i = 0; i < st.length; i += 400) await db.batch(st.slice(i, i + 400));
  return db;
}

test('toplama listesi: yüzlerce açık siparişte ve 100+ seçili siparişte çalışır', async () => {
  const db = await seed(300);
  const r = await pickList(db, {});
  assert.equal(r.orders, 300);
  assert.equal(r.totalQty, 600);
  assert.equal(r.items.length, 150);
  assert.ok(r.items.every((x) => x.stock === 5), 'ürün bilgisi panelden');
  const sel = await pickList(db, { ids: Array.from({ length: 120 }, (_, i) => 'trendyol:' + (i + 1)).join(',') });
  assert.equal(sel.orders, 120);
});

test('müşteri özeti: il bazında satılan adet (durumu boş satırlar dahil) sayılır', async () => {
  const db = await seed(100);
  const s = await summary(db, {});
  assert.equal(s.orders, 100);
  assert.equal(s.customers, 40);
  assert.deepEqual(s.cities.map((c) => [c.city, c.units]).sort(), [['Bursa', 100], ['Konya', 100]]);
});

test('ürünler: 150 ürüne toplu işlem tek seferde uygulanır', async () => {
  const db = await seed(1);
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 's', DB: db };
  let cookie = '';
  const call = async (path, b) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/login', { password: 'pw-123456' });
  const ids = Array.from({ length: 150 }, (_, i) => i + 1);
  const r = await call('/api/products-bulk', { ids, action: 'critical', value: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.changed, 150);
});
