// Excel ile toplu güncelleme: dışa aktarma, Türkçe sayı biçimi, eşleştirme (ID / SKU / barkod), önizleme ve uygulama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { parseNum, exportProducts, bulkUpdate } from '../src/bulk.js';
import { csvRows } from '../public/sheetread.js';

test('Türkçe sayı biçimi', () => {
  assert.equal(parseNum('1.250,50'), 1250.5);
  assert.equal(parseNum('1250,5'), 1250.5);
  assert.equal(parseNum('1250.5'), 1250.5);
  assert.equal(parseNum('₺1.250'), 1250);
  assert.equal(parseNum('1,250.75'), 1250.75);
  assert.equal(parseNum(''), null);
  assert.ok(Number.isNaN(parseNum('abc')));
});

test('CSV okuma: ayırıcı ve tırnaklı hücre', () => {
  assert.deepEqual(csvRows('﻿ID;Ürün adı;Satış fiyatı\r\n1;"Gübre; 5 Kg";"1.250,50"\r\n'), [['ID', 'Ürün adı', 'Satış fiyatı'], ['1', 'Gübre; 5 Kg', '1.250,50']]);
  assert.deepEqual(csvRows('SKU,Stok\nA,5'), [['SKU', 'Stok'], ['A', '5']]);
});

test('dışa aktar → değiştir → önizleme → uygula', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { DB: db, TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
  const t = Date.now();
  const P = (id, sku, bc, name, sale, stock, cur = null) => run(db, 'INSERT INTO products (id, sku, barcode, name, sale_price, purchase_price, stock, currency, fx_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 10, ?, ?, ?, ?, ?)', id, sku, bc, name, sale, stock, cur, cur ? 5 : null, t, t);
  await P(1, 'A1', '111', 'Gübre 5 Kg', 100, 4);
  await P(2, 'B2', '222', 'Toprak', 50, 7);
  await P(3, 'C3', '333', 'Dolar ürün', 200, 1, 'USD');
  await P(4, 'D4', '444', 'Site stoklu', 30, 9);
  await P(5, 'E5', '555', 'Perlit', 40, 2);
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, sku, price) VALUES ('trendyol', 'T1', 1, 'A1', 120)");
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, sku, price, remote_stock) VALUES ('ikas1', 'I4', 4, 'D4', 30, 9)");
  await setSetting(db, 'stock_sync', false);
  const csv = await exportProducts(env, db);
  assert.ok(csv.startsWith('﻿ID;SKU;Barkod;Ürün adı'));
  assert.match(csv, /Fiyat: Trendyol/);
  const head = csvRows(csv)[0];
  const rowOf = (vals) => Object.fromEntries(head.map((h, i) => [h, vals[h] ?? '']));
  const rows = [
    rowOf({ ID: '1', 'Satış fiyatı': '110,00', Stok: '6', 'Fiyat: Trendyol': '135,5' }),
    rowOf({ SKU: 'b2', 'Alış fiyatı': '12,5', KDV: '10' }),
    rowOf({ Barkod: '333', 'Satış fiyatı': '999' }),
    rowOf({ ID: '4', Stok: '50' }),
    rowOf({ ID: '5', Desi: 'xx' }),
    rowOf({ ID: '1', Stok: '99' }),
    rowOf({ SKU: 'YOK', Stok: '1' }),
  ];
  const pv = await bulkUpdate(env, db, rows, { dry: true });
  assert.equal(pv.matched, 5);
  assert.ok(pv.skipped.some((x) => /birden fazla/.test(x.reason)));
  assert.equal(pv.changes, 5);
  assert.deepEqual(pv.counts, { 'Satış fiyatı': 1, Stok: 1, 'Fiyat: Trendyol': 1, 'Alış fiyatı': 1, KDV: 1 });
  assert.ok(pv.skipped.some((x) => /döviz/.test(x.reason)));
  assert.ok(pv.skipped.some((x) => /ikas sitesinden/.test(x.reason)));
  assert.ok(pv.skipped.some((x) => /sayı değil/.test(x.reason)));
  assert.ok(pv.skipped.some((x) => /bulunamadı \(YOK\)/.test(x.reason)));
  assert.equal((await all(db, 'SELECT sale_price FROM products WHERE id = 1'))[0].sale_price, 100, 'önizleme yazmaz');
  const r = await bulkUpdate(env, db, rows, { dry: false, user: 'Test' });
  assert.equal(r.applied, true); assert.equal(r.stock, true); assert.equal(r.prices, true);
  const p = Object.fromEntries((await all(db, 'SELECT id, sale_price, purchase_price, stock, vat FROM products')).map((x) => [x.id, x]));
  assert.equal(p[1].sale_price, 110); assert.equal(p[1].stock, 6);
  assert.equal(p[2].purchase_price, 12.5); assert.equal(p[2].vat, 10);
  assert.equal(p[3].sale_price, 200); assert.equal(p[4].stock, 9);
  const l = (await all(db, "SELECT price, price_dirty FROM listings WHERE remote_id = 'T1'"))[0];
  assert.deepEqual([l.price, l.price_dirty], [135.5, 1]);
  assert.equal((await all(db, 'SELECT delta FROM stock_moves WHERE product_id = 1'))[0].delta, 2);
  resetChannels();
});
