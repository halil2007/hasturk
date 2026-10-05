// Eksik ürün bilgisi: SKU / barkod / marka panel ürününde boşsa bağlı ilanlardan (ana katalog önce) tamamlanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run } from '../src/db.js';
import { fillProductInfo } from '../src/sync.js';

test('eksik SKU ve barkod diğer platformlardan tamamlanır; dolu alan ve çakışan değer korunur', async () => {
  const db = d1();
  await init(db);
  const t = Date.now();
  const P = (id, sku, barcode, brand = null) => run(db, 'INSERT INTO products (id, sku, barcode, name, brand, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, sku, barcode, 'Ürün ' + id, brand, t, t);
  const L = (ch, rid, pid, sku, barcode, brand = null) => run(db, 'INSERT INTO listings (channel, remote_id, product_id, sku, barcode, name, brand) VALUES (?, ?, ?, ?, ?, ?, ?)', ch, rid, pid, sku, barcode, 'İlan', brand);
  await P(1, null, '');            // ikas'ta SKU/barkod yok → Trendyol'dan gelir
  await L('ikas1', 'v1', 1, '', '');
  await L('trendyol', 'TY-1', 1, 'GUB-001', '8690000000011', 'Hastürk');
  await P(2, 'ELLE-SKU', null);     // elle girilen SKU korunur, barkod HB'den gelir
  await L('hepsiburada', 'HBV1', 2, 'BASKA-SKU', '8690000000028');
  await P(3, 'GUB-002', null);      // başka ürünün kullandığı değer yazılmaz; sıradaki platformun değeri denenir
  await P(4, null, null);
  await L('trendyol', 'TY-4', 4, 'GUB-002', '8690000000011');
  await L('n11', 'N-4', 4, 'GUB-004', '8690000000042');
  await P(5, null, null);           // iki ürün aynı SKU'yu alamaz
  await P(6, null, null);
  await L('trendyol', 'TY-5', 5, 'ORTAK', '');
  await L('n11', 'N-6', 6, 'ORTAK', '');

  const n = await fillProductInfo(db, { catalog_channels: ['ikas1'] });
  const rows = Object.fromEntries((await all(db, 'SELECT id, sku, barcode, brand FROM products')).map((r) => [r.id, r]));
  assert.equal(rows[1].sku, 'GUB-001');
  assert.equal(rows[1].barcode, '8690000000011');
  assert.equal(rows[1].brand, 'Hastürk');
  assert.equal(rows[2].sku, 'ELLE-SKU');
  assert.equal(rows[2].barcode, '8690000000028');
  assert.equal(rows[4].sku, 'GUB-004');
  assert.equal(rows[4].barcode, '8690000000042');
  assert.equal([rows[5].sku, rows[6].sku].filter((x) => x === 'ORTAK').length, 1);
  assert.ok(n >= 6);
  // İkinci çalıştırma bir şey değiştirmez
  assert.equal(await fillProductInfo(db, { catalog_channels: ['ikas1'] }), 0);
});

test('görsel bağlantıları: ana katalog önce, kanalda değişince güncellenir, elle düzenlenen korunur', async () => {
  const db = d1();
  await init(db);
  const t = Date.now();
  await run(db, 'INSERT INTO products (id, name, created_at, updated_at) VALUES (1, ?, ?, ?), (2, ?, ?, ?)', 'A', t, t, 'B', t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, name, images) VALUES ('trendyol', 'T1', 1, 'x', ?), ('ikas1', 'I1', 1, 'x', ?), ('trendyol', 'T2', 2, 'x', ?)",
    JSON.stringify(['https://ty/1.jpg']), JSON.stringify(['https://ikas/1.webp', 'https://ikas/2.webp']), JSON.stringify(['https://ty/9.jpg']));
  await run(db, "UPDATE products SET images = ?, images_manual = 1 WHERE id = 2", JSON.stringify(['https://elle/1.jpg']));
  await fillProductInfo(db, { catalog_channels: ['ikas1'] });
  const img = async (id) => JSON.parse((await all(db, 'SELECT images FROM products WHERE id = ?', id))[0].images);
  assert.deepEqual(await img(1), ['https://ikas/1.webp', 'https://ikas/2.webp']);
  assert.deepEqual(await img(2), ['https://elle/1.jpg']);
  await run(db, "UPDATE listings SET images = ? WHERE remote_id = 'I1'", JSON.stringify(['https://ikas/3.webp']));
  await fillProductInfo(db, { catalog_channels: ['ikas1'] });
  assert.deepEqual(await img(1), ['https://ikas/3.webp']);
});
