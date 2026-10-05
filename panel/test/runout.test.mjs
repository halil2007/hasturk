// Stok tükenme tahmini: son 30 günün satışı (iptal / iade hariç) ile kaç gün yeteceği ve "tükenmek üzere" filtresi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run } from '../src/db.js';
import worker from '../src/index.js';

test('satış hızına göre kaç gün yeter', async () => {
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  const t = Date.now(), D = 864e5;
  const P = (id, name, stock) => run(db, 'INSERT INTO products (id, name, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', id, name, stock, t, t);
  await P(1, 'Hızlı', 10);   // 30 günde 60 satış → 5 gün
  await P(2, 'Yavaş', 100);  // 30 günde 30 satış → 100 gün
  await P(3, 'Satılmayan', 5);
  const O = (id, status, ago, pid, qty, line = '') => run(db, `INSERT INTO orders (id, channel, remote_id, status, ordered_at, total) VALUES (?, 'trendyol', ?, ?, ?, 0)`, id, id, status, t - ago)
    .then(() => run(db, 'INSERT INTO order_items (order_id, line_id, product_id, quantity, status) VALUES (?, ?, ?, ?, ?)', id, id + 'L', pid, qty, line));
  await O('a', 'delivered', 2 * D, 1, 60);
  await O('b', 'cancelled', 2 * D, 1, 500);   // iptal sayılmaz
  await O('c', 'delivered', 40 * D, 1, 500);  // 30 günden eski sayılmaz
  await O('d', 'shipped', 5 * D, 2, 30);
  await O('e', 'delivered', 3 * D, 2, 900, 'cancelled'); // iptal edilen satır sayılmaz
  let cookie = '';
  const call = async (path) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { headers: { Cookie: cookie } }), env, { waitUntil() {} });
    return r.json();
  };
  const login = await worker.fetch(new Request('https://panel.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x-123456' }) }), env, { waitUntil() {} });
  cookie = login.headers.get('set-cookie').split(';')[0];
  const all = await call('products?limit=50&sort=stock');
  const by = Object.fromEntries(all.products.map((p) => [p.id, p]));
  assert.deepEqual([by[1].sold30, by[1].days_left], [60, 5]);
  assert.deepEqual([by[2].sold30, by[2].days_left], [30, 100]);
  assert.equal(by[3].days_left, null);
  assert.equal(all.counts.runout, 1);
  const ro = await call('products?filter=runout');
  assert.deepEqual(ro.products.map((p) => p.id), [1]);
});
