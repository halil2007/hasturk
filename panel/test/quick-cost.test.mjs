// Hızlı alış fiyatı (raporlardaki "alış fiyatı yok" uyarısı): yalnız alış fiyatı değişir; Ürünler yazma yetkisi ister; geçersiz değer reddedilir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first } from '../src/db.js';
import { api } from '../src/api.js';

test('products/:id/cost alış fiyatını kaydeder; yetki ve doğrulama', async () => {
  const db = d1(); await init(db);
  await run(db, "INSERT INTO products (id, sku, name, sale_price, stock, created_at, updated_at) VALUES (5, 'A', 'Ürün A', 100, 3, 0, 0)");
  const env = { PANEL_PASSWORD: 'x', DB: db }, ctx = { waitUntil() {} };
  const call = (user, b) => api(new Request('https://p.test/api/products/5/cost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, ctx, db, 'products/5/cost', user);
  const staff = (perms) => ({ id: 9, name: 'P', role: 'staff', perms });
  await assert.rejects(() => call(staff(['products:view']), { purchase_price: 40 }), (e) => e.status === 403);
  await assert.rejects(() => call(staff(['products']), { purchase_price: 0 }), (e) => e.status === 400);
  const r = await (await call(staff(['products']), { purchase_price: '42,555' })).json();
  assert.equal(r.purchase_price, 42.56);
  const p = await first(db, 'SELECT purchase_price, stock, sale_price FROM products WHERE id = 5');
  assert.deepEqual({ ...p }, { purchase_price: 42.56, stock: 3, sale_price: 100 });
});
