// Barkod oluşturma: geçerli EAN-13, benzersiz (ürünler + ilanlar), dolu barkod korunur, ön ek denetimi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run } from '../src/db.js';
import { ean13Check, validEan13, assignBarcodes, suggestBarcode, cleanPrefix, missingBarcodes } from '../src/barcodes.js';

test('EAN-13 kontrol hanesi', () => {
  assert.equal(ean13Check('869000000001'), '2');
  assert.ok(validEan13('8690000000012'));
  assert.ok(validEan13('4006381333931'));
  assert.ok(!validEan13('4006381333932'));
  assert.equal(cleanPrefix(''), '200');
  assert.equal(cleanPrefix(' 8691234 '), '8691234');
  assert.throws(() => cleanPrefix('ABC'), /ön eki/);
  assert.throws(() => cleanPrefix('1234567890'), /ön eki/);
});

test('seçilen ürünlere benzersiz barkod; dolu barkod değişmez', async () => {
  const db = d1();
  await init(db);
  const t = Date.now();
  for (let i = 1; i <= 30; i++) await run(db, 'INSERT INTO products (id, name, barcode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', i, 'Ürün ' + i, i === 5 ? 'MEVCUT-5' : null, t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, barcode, name) VALUES ('trendyol', 'x', '2000000000008', 'ilan')");
  assert.equal(await missingBarcodes(db), 29);
  const r = await assignBarcodes(db, [...Array(30)].map((_, i) => i + 1).concat([999]), { prefix: '200', user: 'Test' });
  assert.equal(r.assigned.length, 29);
  assert.equal(r.skipped, 1);
  assert.equal(r.missing, 1);
  const rows = await all(db, 'SELECT id, barcode FROM products ORDER BY id');
  assert.equal(rows.find((x) => x.id === 5).barcode, 'MEVCUT-5');
  const codes = rows.filter((x) => x.id !== 5).map((x) => x.barcode);
  assert.ok(codes.every((c) => validEan13(c) && c.startsWith('200')));
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(!codes.includes('2000000000008'));
  assert.equal(await missingBarcodes(db), 0);
  // Ön ek hatırlanır; öneri kaydedilmez ve mevcutlarla çakışmaz
  const s = await suggestBarcode(db, '8691234');
  assert.ok(validEan13(s.barcode) && s.barcode.startsWith('8691234') && !codes.includes(s.barcode));
  assert.equal((await suggestBarcode(db)).barcode.slice(0, 3), '200');
});
