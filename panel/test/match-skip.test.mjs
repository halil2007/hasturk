// Otomatik eşleştirme: hiçbir şey değişmediyse ürün dizini kurulmaz; ürün ya da ilan değişince yeniden çalışır
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { autoMatch } from '../src/match.js';

test('eşleştirme: değişiklik yoksa atlanır; yeni ilan ya da yeni ürün gelince bağlar', async () => {
  const db = d1(); await init(db);
  const t = Date.now();
  const prod = (id, bc) => db.prepare('INSERT INTO products (id, sku, barcode, name, stock, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)').bind(id, 'S' + id, bc, 'Ürün ' + id, t, t + id).run();
  const lst = (ch, id, bc, stock = 5) => db.prepare('INSERT INTO listings (channel, remote_id, sku, barcode, name, price, remote_stock) VALUES (?, ?, ?, ?, ?, 1, ?)').bind(ch, id, '', bc, 'İlan ' + id, stock).run();
  await prod(1, '8690000000011');
  await lst('trendyol', 'T1', '8690000000011');
  await lst('trendyol', 'T9', '8690000099999', 0); // stoksuz ve karşılığı yok: ürün açılmaz, eşleşmemiş kalır
  assert.equal((await autoMatch(db, { catalog: [] })).linked, 1);
  // Değişiklik yok: atlanır (sonuç aynı, imza kayıtlı)
  assert.deepEqual(await autoMatch(db, { catalog: [] }), { linked: 0, created: 0 });
  // Yeni ilan → çalışır
  await lst('hepsiburada', 'H1', '8690000000011');
  assert.equal((await autoMatch(db, { catalog: [] })).linked, 1);
  // Eşleşmemiş ilanın karşılığı olan ürün sonradan eklenir → çalışır
  await prod(50, '8690000099999');
  assert.equal((await autoMatch(db, { catalog: [] })).linked, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM listings WHERE product_id IS NULL').first()).n, 0);
});
