// Stok doğruluğu: yarıda kalan düşüm, sonradan kurulan / kaldırılan eşleşme, aynı anda iki iş, senkron kilidi, ayrılmış stok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, first, all, run } from '../src/db.js';
import { saveOrders, applyStock, applyDirtyStock, takeLock, releaseLock, DESIRED } from '../src/sync.js';
import { relinkItems } from '../src/match.js';

const order = (id, qty, key = '111', extra = {}) => ({
  remoteId: id, orderNumber: id, orderedAt: 5000, status: 'new', remoteStatus: 'Created', customer: 'T', address: {}, total: 100,
  items: [{ lineId: id + '-1', sku: '', barcode: '', name: 'Ürün', quantity: qty, unitPrice: 100, total: 100, status: '', remoteKey: key }], packages: null, ...extra,
});
async function setup() {
  const db = d1();
  await init(db);
  await run(db, "INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'A', '111', 'A', 10, 0, 0), (2, 'B', '222', 'B', 10, 0, 0)");
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, sku, barcode) VALUES ('trendyol', '111', 1, 'A', '111')");
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  return db;
}
const stock = async (db, id = 1) => (await first(db, 'SELECT stock FROM products WHERE id = ?', id)).stock;

test('senkron düşümden önce kesilirse sipariş bekleyen kalır ve sonraki senkronda düşülür', async () => {
  const db = await setup();
  await saveOrders(db, 'trendyol', [order('T1', 2)]); // applyStock çalışmadan "kesildi"
  assert.equal(await stock(db), 10);
  // Sonraki senkronda aynı sipariş değişmeden gelir (changed boş) ama bekleyen olarak işlenir
  assert.deepEqual([...await saveOrders(db, 'trendyol', [order('T1', 2)])], []);
  assert.equal(await applyDirtyStock(db), 1);
  assert.equal(await stock(db), 8);
  assert.equal((await first(db, "SELECT stock_dirty FROM orders WHERE id = 'trendyol:T1'")).stock_dirty, 0);
  assert.equal(await applyDirtyStock(db), 0, 'ikinci kez düşülmez');
  assert.equal(await stock(db), 8);
});

test('aynı sipariş aynı anda iki iş tarafından işlense de stok bir kez düşer', async () => {
  const db = await setup();
  const ids = await saveOrders(db, 'trendyol', [order('T1', 3)]);
  await Promise.all([applyStock(db, ids), applyStock(db, ids)]);
  assert.equal(await stock(db), 7);
  assert.equal((await all(db, 'SELECT * FROM stock_moves WHERE product_id = 1')).length, 1, 'tek stok hareketi');
});

test('eşleşmemiş ilanın siparişi, ilan sonradan bağlanınca stoktan düşer; eşleşme kaldırılınca geri eklenir', async () => {
  const db = await setup();
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T2', 2, '999')]));
  assert.equal(await stock(db, 2), 10, 'eşleşmemiş satır düşmez');
  await run(db, "INSERT INTO listings (channel, remote_id, product_id) VALUES ('trendyol', '999', 2)");
  await relinkItems(db);
  await applyDirtyStock(db);
  assert.equal(await stock(db, 2), 8, 'bağlanınca düşer');
  // Yanlış eşleşme kaldırıldı (api match/unlink ile aynı adımlar)
  await run(db, "UPDATE listings SET product_id = NULL WHERE remote_id = '999'");
  await run(db, "UPDATE orders SET stock_dirty = 1 WHERE id IN (SELECT order_id FROM order_items WHERE remote_key = '999' AND product_id IS NOT NULL)");
  await run(db, "UPDATE order_items SET product_id = NULL WHERE remote_key = '999'");
  await applyDirtyStock(db);
  assert.equal(await stock(db, 2), 10, 'yanlış üründen düşülen stok geri gelir');
  const last = await first(db, 'SELECT reason, delta FROM stock_moves WHERE product_id = 2 ORDER BY id DESC LIMIT 1');
  assert.deepEqual({ ...last }, { reason: 'İptal/iade', delta: 2 });
});

test('stok takibinden önceki siparişin eşleşmesi kaldırılınca stok değişmez', async () => {
  const db = await setup();
  const o = order('OLD', 2);
  o.orderedAt = 500; // stock_since = 1000
  await applyStock(db, await saveOrders(db, 'trendyol', [o]));
  assert.equal(await stock(db), 10);
  await run(db, "UPDATE orders SET stock_dirty = 1 WHERE id = 'trendyol:OLD'");
  await run(db, "UPDATE order_items SET product_id = NULL WHERE order_id = 'trendyol:OLD'");
  await applyDirtyStock(db);
  assert.equal(await stock(db), 10);
});

test('senkron kilidi: ikinci iş kilidi alamaz, süresi geçen kilit alınır, başkasının kilidi bırakılmaz', async () => {
  const db = await setup();
  assert.equal(await takeLock(db, 'sync_lock', 1_700_000_000_000, 600e3), true);
  assert.equal(await takeLock(db, 'sync_lock', 1_700_000_000_500, 600e3), false, 'kilit dolu');
  await releaseLock(db, 'sync_lock', 1_700_000_000_500); // başkasının kilidi: etkisiz
  assert.equal(await takeLock(db, 'sync_lock', 1_700_000_001_000, 600e3), false);
  assert.equal(await takeLock(db, 'sync_lock', 1_700_000_700_000, 600e3), true, 'süresi geçen kilit alınır');
  await releaseLock(db, 'sync_lock', 1_700_000_700_000);
  assert.equal(await takeLock(db, 'sync_lock', 1_700_000_700_001, 600e3), true, 'bırakılan kilit alınır');
});

test('ayrılmış (own) stok depodaki stoktan fazla gönderilmez', async () => {
  const db = await setup();
  await run(db, "UPDATE products SET stock = 3 WHERE id = 1");
  await run(db, "UPDATE listings SET stock_mode = 'own', stock_value = 10 WHERE remote_id = '111'");
  const r = await first(db, `SELECT ${DESIRED} AS s FROM listings l JOIN products p ON p.id = l.product_id WHERE l.remote_id = '111'`);
  assert.equal(r.s, 3);
});
