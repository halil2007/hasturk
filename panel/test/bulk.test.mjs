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

test('dışa aktarmadan sonraki satış ve otomatik fiyat, dokunulmayan hücrelerle geri alınmaz', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { DB: db, TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
  const t = Date.now() - 1000;
  await run(db, "INSERT INTO products (id, sku, barcode, name, sale_price, purchase_price, stock, created_at, updated_at) VALUES (1, 'A1', '111', 'Gübre', 100, 10, 10, ?, ?)", t, t);
  await run(db, "INSERT INTO products (id, sku, barcode, name, sale_price, purchase_price, stock, created_at, updated_at) VALUES (2, 'B2', '222', 'Toprak', 50, 10, 20, ?, ?)", t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, sku, price) VALUES ('trendyol', 'T1', 1, 'A1', 120)");
  await setSetting(db, 'stock_sync', true);
  const csv = await exportProducts(env, db);
  const [head, ...data] = csvRows(csv);
  assert.ok(head.includes('Kontrol (değiştirmeyin)'));
  const obj = (r) => Object.fromEntries(head.map((h, i) => [h, r[i]]));
  // Dosya indirildikten sonra: 3 satış (stok 10 → 7), otomatik fiyat 120 → 115, 2. üründe 5 satış (20 → 15)
  await new Promise((r) => setTimeout(r, 5));
  const now = Date.now();
  await run(db, 'UPDATE products SET stock = 7 WHERE id = 1');
  await run(db, "INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) VALUES (1, -3, 7, 'Sipariş', 'x', ?)", now);
  await run(db, 'UPDATE products SET stock = 15 WHERE id = 2');
  await run(db, "INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) VALUES (2, -5, 15, 'Sipariş', 'y', ?)", now);
  await run(db, "UPDATE listings SET price = 115 WHERE remote_id = 'T1'");
  // Kullanıcı 1. üründe yalnız satış fiyatını, 2. üründe stoğu (20 → 30, sayım sonucu) değiştirdi
  const r1 = obj(data.find((r) => r[0] === '1')), r2 = obj(data.find((r) => r[0] === '2'));
  r1['Satış fiyatı'] = '105';
  r2.Stok = '30';
  const pv = await bulkUpdate(env, db, [r1, r2], { dry: true });
  assert.deepEqual(pv.counts, { 'Satış fiyatı': 1, Stok: 1 }, 'dokunulmayan stok ve kanal fiyatı değişiklik sayılmamalı');
  const st = pv.preview.find((c) => c.field === 'stock');
  assert.equal(st.new, 25, 'sayımda girilen 30 − dosyadan sonraki 5 satış');
  assert.match(st.note, /5 adet satış/);
  await bulkUpdate(env, db, [r1, r2], { dry: false });
  const [p1, p2] = await all(db, 'SELECT stock, sale_price FROM products ORDER BY id');
  assert.equal(p1.stock, 7, 'satışlar geri alınmadı');
  assert.equal(p1.sale_price, 105);
  assert.equal(p2.stock, 25);
  assert.equal((await all(db, "SELECT price FROM listings WHERE remote_id = 'T1'"))[0].price, 115, 'otomatik fiyat geri alınmadı');
  // Aynı dosya ikinci kez yüklenirse stok yeniden değişmez
  const again = await bulkUpdate(env, db, [r1, r2], { dry: true });
  assert.equal(again.changes, 0);
});
