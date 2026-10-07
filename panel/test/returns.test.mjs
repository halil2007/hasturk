// İptal / iade doğruluğu: satır iadesi ayara uyar, kabul edilen iade talebi siparişe ve stoğa işlenir (sipariş yeniden yazılsa da kalır).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, first, all, run } from '../src/db.js';
import { saveOrders, applyStock, applyDirtyStock } from '../src/sync.js';
import { save as saveClaims, applyClaimReturns } from '../src/claims.js';

const order = (id, items, extra = {}) => ({
  remoteId: id, orderNumber: id, orderedAt: 5000, status: 'delivered', remoteStatus: 'Delivered', customer: 'T', address: {}, total: 100,
  items: items.map(([key, qty, status = ''], n) => ({ lineId: `${id}-${n}`, sku: '', barcode: key, name: key, quantity: qty, unitPrice: 50, total: 50 * qty, status, remoteKey: key })),
  packages: null, ...extra,
});
async function setup(restock) {
  const db = d1();
  await init(db);
  await run(db, "INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'A', 'BA', 'A', 10, 0, 0), (2, 'B', 'BB', 'B', 10, 0, 0)");
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, barcode) VALUES ('trendyol', 'BA', 1, 'BA'), ('trendyol', 'BB', 2, 'BB')");
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  await setSetting(db, 'restock_returns', restock);
  return db;
}
const stock = async (db, id) => (await first(db, 'SELECT stock FROM products WHERE id = ?', id)).stock;

test('kanalın bildirdiği satır iadesi "iadede stoğa ekle" kapalıyken stoğa dönmez, iptal döner', async () => {
  const db = await setup(false);
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T1', [['BA', 2], ['BB', 1]])]));
  assert.equal(await stock(db, 1), 8);
  assert.equal(await stock(db, 2), 9);
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T1', [['BA', 2, 'returned'], ['BB', 1, 'cancelled']])]));
  assert.equal(await stock(db, 1), 8, 'iade: ayar kapalı, stok değişmez');
  assert.equal(await stock(db, 2), 10, 'iptal: stok geri eklenir');
});

test('kabul edilen iade talebi: kısmi adet ayara göre stoğa döner, sipariş yeniden yazılsa da kalır, tamamı iade → sipariş iade', async () => {
  const db = await setup(true);
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T2', [['BA', 3], ['BB', 1]])]));
  assert.equal(await stock(db, 1), 7);
  await saveClaims(db, 'trendyol', [{ remoteId: 'C1', orderNumber: 'T2', status: 'accepted', lines: [{ id: 'l1', barcode: 'BA', qty: 2, status: 'accepted' }] }]);
  await applyClaimReturns(db);
  await applyDirtyStock(db);
  assert.equal(await stock(db, 1), 9, '3 satıştan 2 iade stoğa döndü');
  const it = await first(db, "SELECT returned_qty, status FROM order_items WHERE order_id = 'trendyol:T2' AND barcode = 'BA'");
  assert.deepEqual({ ...it }, { returned_qty: 2, status: '' });
  // Kanal siparişi değişip yeniden yazıldı (iade bilgisi yok): sonraki senkronda iade yine işlenir, stok sabit kalır
  const again = order('T2', [['BA', 3], ['BB', 1]], { remoteStatus: 'Delivered2' });
  const ids = await saveOrders(db, 'trendyol', [again]);
  await applyClaimReturns(db);
  await applyStock(db, ids);
  assert.equal(await stock(db, 1), 9, 'iade kaybolmadı');
  // Kalan ürünler de iade edildi: sipariş "iade edildi"
  await saveClaims(db, 'trendyol', [{ remoteId: 'C2', orderNumber: 'T2', status: 'accepted', lines: [{ id: 'l2', barcode: 'BA', qty: 1, status: 'accepted' }, { id: 'l3', barcode: 'BB', qty: 1, status: 'accepted' }] }]);
  await applyClaimReturns(db);
  await applyDirtyStock(db);
  assert.equal((await first(db, "SELECT status FROM orders WHERE id = 'trendyol:T2'")).status, 'returned');
  assert.equal(await stock(db, 1), 10);
  assert.equal(await stock(db, 2), 10);
  assert.equal(await applyClaimReturns(db), 0, 'tekrar çalışınca değişiklik yok');
});

test('bekleyen ya da reddedilen iade talebi stoğa dokunmaz', async () => {
  const db = await setup(true);
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T3', [['BA', 1]])]));
  await saveClaims(db, 'trendyol', [
    { remoteId: 'C3', orderNumber: 'T3', status: 'waiting', lines: [{ id: 'a', barcode: 'BA', qty: 1, status: 'waiting' }] },
    { remoteId: 'C4', orderNumber: 'T3', status: 'rejected', lines: [{ id: 'b', barcode: 'BA', qty: 1, status: 'rejected' }] },
  ]);
  assert.equal(await applyClaimReturns(db), 0);
  assert.equal(await stock(db, 1), 9);
});
