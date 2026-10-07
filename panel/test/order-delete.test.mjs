// Sipariş / ürün silme ve kanalda bulunamayan siparişler: stok geri eklenir, silinen sipariş yeniden alınmaz,
// kesin "yok" bilgisinde açık sipariş iptal sayılır, liste karşılaştırmasında iki kez bulunamayan işaretlenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, first, all, run } from '../src/db.js';
import { saveOrders, applyStock, applyDirtyStock } from '../src/sync.js';
import { deleteOrders, checkMissing, compareFetched, orderOnChannel } from '../src/orderclean.js';
import { deleteProducts } from '../src/api.js';
import { autoMatch } from '../src/match.js';

const order = (id, qty, at = Date.now() - 5 * 864e5) => ({
  remoteId: id, orderNumber: id, orderedAt: at, status: 'new', remoteStatus: 'Created', customer: 'T', address: {}, total: 100,
  items: [{ lineId: id + '-1', sku: '', barcode: '', name: 'Ürün', quantity: qty, unitPrice: 100, total: 100, status: '', remoteKey: '111' }], packages: null,
});
async function setup() {
  const db = d1();
  await init(db);
  await run(db, "INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'A', '111', 'A', 10, 0, 0)");
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, sku, barcode) VALUES ('trendyol', '111', 1, 'A', '111'), ('ikas1', '111', 1, 'A', '111')");
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  return db;
}
const stock = async (db) => (await first(db, 'SELECT stock FROM products WHERE id = 1')).stock;

test('sipariş silme: stok geri eklenir, bağlı kayıtlar silinir, kanal yine gönderse de alınmaz', async () => {
  const db = await setup();
  const ids = await saveOrders(db, 'trendyol', [order('T1', 3)]);
  await applyStock(db, ids);
  assert.equal(await stock(db), 7);
  await run(db, "INSERT INTO packages (order_id, no, items, created_at) VALUES ('trendyol:T1', 1, '[]', 1)");
  const r = await deleteOrders(db, ['trendyol:T1', 'yok:1'], 'Yönetici');
  assert.equal(r.deleted, 1);
  assert.equal(await stock(db), 10, 'düşülen 3 adet geri eklendi');
  for (const t of ['orders', 'order_items', 'packages', 'order_stock']) assert.equal((await first(db, `SELECT COUNT(*) AS n FROM ${t}`)).n, 0, t);
  assert.ok(await first(db, "SELECT 1 AS x FROM deleted_orders WHERE id = 'trendyol:T1' AND user = 'Yönetici'"));
  // Kanal aynı siparişi tekrar gönderir → alınmaz, stok değişmez; başka sipariş normal alınır
  const again = await saveOrders(db, 'trendyol', [order('T1', 3), order('T2', 1)]);
  assert.deepEqual([...again], ['trendyol:T2']);
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM orders WHERE id = 'trendyol:T1'")).n, 0);
});

test('kanalda bulunamayan: tek sipariş sorgusu "yok" → iptal sayılır, stok döner; kaldırılmış mağazanın siparişi de', async () => {
  const db = await setup();
  const ids = [...await saveOrders(db, 'ikas1', [order('I1', 2), order('I2', 1)]), ...await saveOrders(db, 'trendyol_9', [order('X1', 1)])];
  await applyStock(db, ids);
  const before = await stock(db);
  const ikas = { id: 'ikas1', name: 'HasTürk', enabled: true, orderExists: async (rid) => rid !== 'I1' };
  const chans = [ikas, { id: 'trendyol', name: 'Trendyol', enabled: true }];
  const r = await checkMissing({}, db, { chans });
  assert.equal(r.orphan, 1); assert.equal(r.checked, 2); assert.equal(r.missing, 1);
  const i1 = await first(db, "SELECT status, missing_n, missing_why FROM orders WHERE id = 'ikas1:I1'");
  assert.equal(i1.status, 'cancelled'); assert.equal(i1.missing_n, 2); assert.match(i1.missing_why, /bulunamadı/);
  assert.equal((await first(db, "SELECT status FROM orders WHERE id = 'ikas1:I2'")).status, 'new');
  assert.equal((await first(db, "SELECT status, missing_n FROM orders WHERE id = 'trendyol_9:X1'")).missing_n, 2);
  await applyDirtyStock(db);
  assert.equal(await stock(db), before + 2, 'iptal sayılan ikas siparişinin stoğu döndü (kaldırılmış mağazanın ürünü eşleşmemiş)');
  assert.ok(await first(db, "SELECT 1 AS x FROM order_events WHERE order_id = 'ikas1:I1' AND action = 'missing'"));
  // 6 saat geçmeden aynı sipariş yeniden sorulmaz
  assert.equal((await checkMissing({}, db, { chans })).checked, 0);
  // Silme onayı için tek sipariş kontrolü
  assert.equal((await orderOnChannel({}, db, { channel: 'ikas1', remote_id: 'I1' }, chans)).exists, false);
  assert.equal((await orderOnChannel({}, db, { channel: 'ikas1', remote_id: 'I2' }, chans)).exists, true);
  assert.equal((await orderOnChannel({}, db, { channel: 'trendyol', remote_id: 'T' }, chans)).exists, null);
  assert.equal((await orderOnChannel({}, db, { channel: 'trendyol_9', remote_id: 'X1' }, chans)).exists, false);
});

test('liste karşılaştırması: iki kez üst üste dönmeyen açık sipariş işaretlenir (iptal edilmez); görülünce işaret kalkar', async () => {
  const db = await setup();
  const at = Date.now() - 5 * 864e5;
  await saveOrders(db, 'trendyol', [order('T1', 1, at), order('T2', 1, at)]);
  const ch = { id: 'trendyol', name: 'Trendyol' };
  const fetched = [order('T2', 1, at)];
  assert.equal(await compareFetched(db, ch, at - 1, Date.now(), fetched), 0, 'ilk kez bulunamadı: henüz uyarı yok');
  assert.equal((await first(db, "SELECT missing_n FROM orders WHERE id = 'trendyol:T1'")).missing_n, 1);
  assert.equal(await compareFetched(db, ch, at - 1, Date.now(), fetched), 1);
  const t1 = await first(db, "SELECT status, missing_n FROM orders WHERE id = 'trendyol:T1'");
  assert.equal(t1.missing_n, 2); assert.equal(t1.status, 'new', 'yalnız işaret');
  // Kısmi okuma / boş liste → karar verilmez
  assert.equal(await compareFetched(db, ch, at - 1, Date.now(), Object.assign([order('T2', 1, at)], { partialUntil: 1 })), 0);
  assert.equal(await compareFetched(db, ch, at - 1, Date.now(), []), 0);
  // Sonra kanalda görünür → işaret kalkar
  await compareFetched(db, ch, at - 1, Date.now(), [order('T1', 1, at), order('T2', 1, at)]);
  assert.equal((await first(db, "SELECT missing_n FROM orders WHERE id = 'trendyol:T1'")).missing_n, 0);
});

test('ürün silme: bağlı ilanlar "silindi" diye yok sayılır, ana katalog senkronu ürünü yeniden açmaz', async () => {
  const db = await setup();
  await run(db, "UPDATE listings SET name = 'A', price = 10, remote_stock = 5 WHERE channel = 'ikas1'");
  const r = await deleteProducts(db, [1, 99]);
  assert.equal(r.deleted, 1); assert.deepEqual(r.names, ['A']);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products')).n, 0);
  const l = await all(db, 'SELECT product_id, ignored, match FROM listings ORDER BY channel');
  assert.ok(l.every((x) => x.product_id === null && x.ignored === 1 && x.match === 'deleted'));
  const m = await autoMatch(db, { catalog: ['ikas1'] });
  assert.equal(m.created || 0, 0);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products')).n, 0, 'ürün geri gelmedi');
});
