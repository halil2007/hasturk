// İlan yenileme yalnız değişen ilanı yazar (çok müşterili kullanımda veritabanı yazma maliyeti).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run } from '../src/db.js';
import { refreshListings } from '../src/sync.js';

test('değişmeyen ilan yeniden yazılmaz, değişen yazılır, bekleyen fiyat korunur', async () => {
  const db = d1();
  await init(db);
  let rows = [{ remoteId: 'A', sku: 'S1', barcode: '1', name: 'Gübre', price: 100, listPrice: 120, stock: 5, image: 'https://i/1.jpg' }, { remoteId: 'B', sku: 'S2', name: 'Torf', price: 50, listPrice: 50, stock: 2 }];
  const ch = { id: 'trendyol', fetchListings: async () => rows };
  await refreshListings(db, ch);
  const at = async () => Object.fromEntries((await all(db, 'SELECT remote_id, synced_at, price, remote_stock, image FROM listings')).map((r) => [r.remote_id, r]));
  const first = await at();
  await new Promise((r) => setTimeout(r, 5));
  await refreshListings(db, ch);
  const second = await at();
  assert.equal(second.A.synced_at, first.A.synced_at, 'değişmeyen ilan yazılmadı');
  assert.equal(second.B.synced_at, first.B.synced_at);
  rows = [{ ...rows[0], stock: 3, image: '' }, rows[1]];
  await new Promise((r) => setTimeout(r, 5));
  await refreshListings(db, ch);
  const third = await at();
  assert.notEqual(third.A.synced_at, first.A.synced_at, 'stoğu değişen ilan yazıldı');
  assert.equal(third.A.remote_stock, 3);
  assert.equal(third.A.image, 'https://i/1.jpg', 'boş gelen görsel eskisini silmez');
  assert.equal(third.B.synced_at, first.B.synced_at);
  // Panelde değiştirilip gönderilmeyi bekleyen fiyat kanaldan gelen fiyatla ezilmez
  await run(db, "UPDATE listings SET price = 130, price_dirty = 1 WHERE remote_id = 'A'");
  await refreshListings(db, ch);
  assert.equal((await at()).A.price, 130);
});

test('günlük bakım: eski gönderilmiş paketlerin etiket dosyası silinir, yenisi ve açık paket kalır', async () => {
  const { housekeeping } = await import('../src/sync.js');
  const db = d1();
  await init(db);
  const t = Date.now(), D = 864e5;
  await run(db, `INSERT INTO packages (order_id, no, items, status, created_at, shipped_at, label_format, label_data, tracking) VALUES
    ('a', 1, '[]', 'shipped', ?, ?, 'pdf', 'ESKI', 'TR1'), ('b', 1, '[]', 'shipped', ?, ?, 'pdf', 'YENI', 'TR2'), ('c', 1, '[]', 'open', ?, NULL, 'pdf', 'ACIK', NULL)`,
  t - 60 * D, t - 60 * D, t - 5 * D, t - 5 * D, t - 90 * D);
  const hk = await housekeeping(db);
  assert.equal(hk.labels, 1); assert.equal(typeof hk.logs, 'number'); // hız bakımı da çalışır (bkz. perf.js)
  const rows = Object.fromEntries((await all(db, 'SELECT order_id, label_data, tracking FROM packages')).map((r) => [r.order_id, r]));
  assert.equal(rows.a.label_data, null); assert.equal(rows.a.tracking, 'TR1');
  assert.equal(rows.b.label_data, 'YENI'); assert.equal(rows.c.label_data, 'ACIK');
  assert.equal(await housekeeping(db), null, 'günde bir kez');
});
