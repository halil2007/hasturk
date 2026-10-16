// Döviz kuru güncellemesi: Türkiye dışı Amazon (ilan fiyatı EUR / USD) ilanı TL oranıyla çarpılmaz; TL kanallar orantılı güncellenir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, setSetting } from '../src/db.js';
import { applyFx } from '../src/fx.js';

test('applyFx: fx_foreign listesindeki kanalın ilan fiyatı değişmez', async () => {
  const db = d1(); await init(db);
  const t = Date.now();
  const { id } = await first(db, "INSERT INTO products (sku, name, currency, fx_price, sale_price, created_at, updated_at) VALUES ('P1', 'Ürün', 'USD', 10, 400, ?, ?) RETURNING id", t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, name, product_id, price) VALUES ('trendyol', 'T1', 'x', ?, 400), ('amazon', 'A1', 'x', ?, 10), ('amazon_2', 'A2', 'x', ?, 440)", id, id, id);
  await setSetting(db, 'fx_foreign', ['amazon']);
  await applyFx(db, {}, { source: 'tcmb', rates: { USD: { buy: 42, sell: 42 } } });
  const p = async (ch) => (await first(db, 'SELECT price FROM listings WHERE channel = ?', ch)).price;
  assert.equal((await first(db, 'SELECT sale_price FROM products WHERE id = ?', id)).sale_price, 420);
  assert.equal(await p('trendyol'), 420);
  assert.equal(await p('amazon'), 10, 'yurt dışı Amazon (USD) ilanı TL oranıyla çarpılmaz');
  assert.equal(await p('amazon_2'), 462, 'Türkiye Amazon (TL) orantılı güncellenir');
});
