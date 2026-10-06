// Eski açık siparişler: kanaldan yeniden okunur; 30 günden eski ve hâlâ açık görünen tamamlandı sayılır (kargo ekranından da çıkar)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, first } from '../src/db.js';
import { saveOrders, staleOrders } from '../src/sync.js';

const D = 864e5;
const ord = (no, days, status = 'new') => ({ remoteId: no, orderNumber: no, orderedAt: Date.now() - days * D, status, remoteStatus: status, customer: 'A', total: 100,
  items: [{ lineId: '1', sku: 'S', name: 'Ürün', quantity: 1, unitPrice: 100, total: 100, remoteKey: 'S' }] });

test('30 günden eski açık sipariş tamamlandı sayılır; yenisi kalır; kanal sonradan iptal bildirirse iptal olur', async () => {
  const db = d1(); await init(db);
  await saveOrders(db, 'trendyol', [ord('ESKI', 140), ord('ESKI2', 45, 'processing'), ord('YENI', 3)]);
  await db.prepare("INSERT INTO packages (order_id, no, items, status, created_at) VALUES ('trendyol:ESKI2', 1, '[]', 'open', ?)").bind(Date.now() - 44 * D).run();
  // Kanal yeniden okunur (sipariş tarihine göre, 2 günden eski açıklar için)
  const calls = [];
  const ch = { id: 'trendyol', fetchOrders: async (since, until, o) => { calls.push([since, until, o]); return [ord('ESKI2', 45, 'processing')]; } };
  const r = await staleOrders({}, db, [ch]);
  assert.equal(calls.length, 1); assert.ok(calls[0][0] <= Date.now() - 45 * D); // son 90 gündeki en eski açık sipariş assert.deepEqual(calls[0][2], { byOrdered: true });
  assert.equal(r.closed, 2);
  const st = Object.fromEntries((await all(db, 'SELECT order_number, status FROM orders')).map((x) => [x.order_number, x.status]));
  assert.deepEqual(st, { ESKI: 'delivered', ESKI2: 'delivered', YENI: 'new' });
  const pk = await first(db, "SELECT status, shipped_at FROM packages WHERE order_id = 'trendyol:ESKI2'");
  assert.equal(pk.status, 'shipped'); assert.ok(pk.shipped_at < Date.now() - 40 * D); // "son 30 günde kargoya verilenler"e düşmez
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM order_events WHERE action = 'auto_close'")).n, 2);
  // 6 saat içinde kanal tekrar sorgulanmaz
  await staleOrders({}, db, [ch]); assert.equal(calls.length, 1);
  // Kanal eski siparişi yine "yeni" gösterse de tamamlandı kalır; iptal bildirirse iptal olur
  await saveOrders(db, 'trendyol', [{ ...ord('ESKI', 140), customer: 'B' }]);
  assert.equal((await first(db, "SELECT status FROM orders WHERE order_number = 'ESKI'")).status, 'delivered');
  await saveOrders(db, 'trendyol', [ord('ESKI', 140, 'cancelled')]);
  assert.equal((await first(db, "SELECT status FROM orders WHERE order_number = 'ESKI'")).status, 'cancelled');
});
