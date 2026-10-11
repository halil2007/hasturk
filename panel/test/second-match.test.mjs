// İkinci eşleşme: aynı ürünün aynı kanaldaki ikinci ilanı önerilir ama otomatik bağlanmaz; "Onayla" ile bağlanır, "Farklı ürün"
// hatırlanır. Bağlandıktan sonra stok iki ilana da gider, iki ilandan gelen sipariş ürün stoğundan bir kez düşer; onarım ve
// otomatik eşleştirme onaylı bağı bozmaz; bağ kaldırılabilir; işlem Ürünler yazma yetkisi ister.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, first, run, setSetting } from '../src/db.js';
import { autoMatch, repairDuplicates } from '../src/match.js';
import { secondSuggestions, linkExtra, rejectExtra, unlinkListing } from '../src/second.js';
import { saveOrders, applyStock, applyDirtyStock, pushStocks, productMaps } from '../src/sync.js';
import { resetChannels } from '../src/channels/index.js';
import { api } from '../src/api.js';

const HB = 'hepsiburada';
async function setup() {
  const db = d1();
  await init(db);
  await setSetting(db, 'manual_import', { '*': true }); // ilanlardan kendiliğinden ürün açılmasın (yalnız kesin eşleşme)
  await run(db, "INSERT INTO products (id, sku, barcode, name, sale_price, stock, created_at, updated_at) VALUES (1, 'TR-750', '8690000000042', 'Çelik Termos 750 ml', 449, 7, 0, 0)");
  await run(db, "INSERT INTO products (id, sku, barcode, name, sale_price, stock, created_at, updated_at) VALUES (2, 'HR-20', '8690000000301', 'Bahçe Hortumu 20 m', 299, 4, 0, 0)");
  const L = [
    // [remote_id, sku, barcode, name, price, stock]
    ['hb1', 'TR-750', '8690000000042', 'Çelik Termos 750 ml', 470, 3],              // ürüne barkodla bağlanır
    ['hb2', 'TR-750-B', '', 'Çelik Termos Matara 750 ml', 460, 2],                  // aynı ürün, farklı ad: ad benzer + fiyat yakın
    ['hb3', 'XX-9', '8690000000042', 'Termos Çelik 0,75 Lt Kamp', 480, 5],           // aynı barkod (ikinci ilan)
    ['hb4', 'TR-750-L', '', 'Çelik Termos Matara 750 ml Lüks', 1450, 2],             // ad benzer ama fiyat çok farklı
    ['hb5', 'HR-20', '8690000000301', 'Bahçe Hortumu 20 m', 310, 6],                 // başka ürün
    ['hb6', 'PB-1', '', 'Powerbank 20000 mAh', 600, 3],                              // ilgisiz
  ];
  for (const [id, sku, bc, name, price, st] of L) {
    await run(db, 'INSERT INTO listings (channel, remote_id, remote_product_id, sku, barcode, name, price, remote_stock, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', HB, id, 'rp-' + id, sku, bc || null, name, price, st, 1);
  }
  await autoMatch(db, { catalog: [] });
  return db;
}
const L = (db, id) => first(db, 'SELECT product_id, match, extra_link, pushed_stock, stock_value FROM listings WHERE channel = ? AND remote_id = ?', HB, id);
const stock = async (db, id = 1) => (await first(db, 'SELECT stock FROM products WHERE id = ?', id)).stock;
const order = (no, rk, qty) => ({
  remoteId: no, orderNumber: no, orderedAt: Date.now() - 864e5, status: 'new', remoteStatus: 'Created', customer: 'T', address: {}, total: 100 * qty,
  items: [{ lineId: no + '-1', sku: '', barcode: '', name: 'Termos', quantity: qty, unitPrice: 100, total: 100 * qty, status: '', remoteKey: rk }], packages: null,
});

test('öneri üretilir ama otomatik bağlanmaz (barkod aynı / ad benzer + fiyat yakın); fiyatı çok farklı ve ilgisiz ilan önerilmez', async () => {
  const db = await setup();
  assert.equal((await L(db, 'hb1')).product_id, 1, 'ilk ilan barkodla bağlandı');
  assert.equal((await L(db, 'hb5')).product_id, 2);
  for (const id of ['hb2', 'hb3', 'hb4']) assert.equal((await L(db, id)).product_id, null, `${id} otomatik bağlanmadı`);
  const s = await secondSuggestions(db);
  const by = Object.fromEntries(s.items.map((x) => [x.remote_id, x]));
  assert.deepEqual(Object.keys(by).sort(), ['hb2', 'hb3']);
  assert.equal(s.total, 2);
  assert.equal(by.hb3.product_id, 1); assert.ok(['twin', 'barcode'].includes(by.hb3.how));
  assert.equal(by.hb2.product_id, 1); assert.equal(by.hb2.how, 'name'); assert.ok(by.hb2.score >= 75);
  assert.equal(by.hb2.product.name, 'Çelik Termos 750 ml');
  assert.deepEqual(by.hb2.existing.map((e) => e.remote_id), ['hb1']);
  // Sıra: barkod önce
  assert.equal(s.items[0].remote_id, 'hb3');
  // Otomatik eşleştirme tekrar çalışsa da bağlanmaz
  await autoMatch(db, { catalog: [] });
  assert.equal((await L(db, 'hb2')).product_id, null);
  assert.equal((await secondSuggestions(db, { channel: 'trendyol' })).total, 0, 'kanal süzgeci');
  assert.equal((await secondSuggestions(db, { q: 'matara' })).items.map((x) => x.remote_id).join(), 'hb2', 'arama');
});

test('onayla bağlar (extra_link), farklı ürün hatırlanır; onarım ve otomatik eşleştirme onaylı bağı bozmaz', async () => {
  const db = await setup();
  const r = await linkExtra(db, { channel: HB, remote_id: 'hb2', product_id: 1 }, { name: 'Test' });
  assert.deepEqual(r, { linked: 1, extra: true, count: 2 });
  assert.deepEqual({ ...(await L(db, 'hb2')) }, { product_id: 1, match: 'extra', extra_link: 1, pushed_stock: 2, stock_value: null });
  // Reddet: bir daha önerilmez, otomatik eşleştirme de "tekrar olabilir" diye yeniden işaretlemez
  await rejectExtra(db, { channel: HB, remote_id: 'hb3', product_id: 1 }, { name: 'Test' });
  assert.equal((await secondSuggestions(db)).total, 0);
  await autoMatch(db, { catalog: [] });
  assert.equal((await L(db, 'hb3')).match, 'dup_no');
  assert.equal((await secondSuggestions(db)).total, 0, 'red hatırlandı');
  assert.ok(await first(db, "SELECT 1 AS x FROM listing_twin_no WHERE channel = ? AND remote_id = 'hb3' AND product_id = 1 AND user = 'Test'", HB));
  // Eski sürümden kalma onaysız mükerrer bağ (hb6 elle ürüne yazılmış) ayrılır; onaylı ikinci ilan kalır
  await run(db, "UPDATE listings SET product_id = 1, match = 'manual' WHERE channel = ? AND remote_id = 'hb6'", HB);
  assert.equal(await repairDuplicates(db), 1);
  assert.equal((await L(db, 'hb6')).product_id, null, 'onaysız ikinci bağ ayrıldı');
  assert.equal((await L(db, 'hb1')).product_id, 1);
  assert.equal((await L(db, 'hb2')).product_id, 1, 'onaylı ikinci ilan korundu');
  assert.equal(await repairDuplicates(db), 0);
  await autoMatch(db, { catalog: [] });
  assert.equal((await L(db, 'hb2')).extra_link, 1);
  // Otomatik eşleştirme kendiliğinden üçüncü bağ kurmaz (hb3 aynı barkodlu ama reddedildi; hb4 bağlanmadı)
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM listings WHERE channel = ? AND product_id = 1', HB)).n, 2);
  // Aynı ürüne yeniden onay: değişiklik yok
  assert.equal((await linkExtra(db, { channel: HB, remote_id: 'hb2', product_id: 1 })).linked, 0);
});

test('stok iki ilana da gider (ilan başına kural geçerli); iki ilandan gelen sipariş ürün stoğundan bir kez düşer; bağ kaldırılınca geri eklenir', async () => {
  resetChannels();
  const db = await setup();
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  await linkExtra(db, { channel: HB, remote_id: 'hb2', product_id: 1 });
  const env = { PANEL_PASSWORD: 'x', DB: db, DEMO: '1' };
  await pushStocks(env, db);
  assert.equal((await L(db, 'hb1')).pushed_stock, 7);
  assert.equal((await L(db, 'hb2')).pushed_stock, 7, 'ikinci ilan da ürün stoğunu aldı');
  // İlan başına stok kuralı: ikinci ilana ayrılmış 3 adet
  await run(db, "UPDATE listings SET stock_mode = 'own', stock_value = 3 WHERE channel = ? AND remote_id IN ('hb1', 'hb2')", HB);
  await run(db, "UPDATE listings SET stock_value = 5 WHERE channel = ? AND remote_id = 'hb1'", HB);
  await pushStocks(env, db);
  assert.equal((await L(db, 'hb1')).pushed_stock, 5);
  assert.equal((await L(db, 'hb2')).pushed_stock, 3);
  // Sipariş çözümü: iki ilan da aynı ürüne
  const maps = await productMaps(db);
  assert.equal(maps.resolve(HB, { remoteKey: 'hb1' }), 1);
  assert.equal(maps.resolve(HB, { remoteKey: 'hb2' }), 1);
  const ids = [...await saveOrders(db, HB, [order('O1', 'hb2', 2)]), ...await saveOrders(db, HB, [order('O2', 'hb1', 1)])];
  await applyStock(db, ids);
  assert.equal(await stock(db), 4, '7 − 2 − 1: her sipariş satırı bir kez düştü');
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM stock_moves WHERE product_id = 1')).n, 2);
  assert.equal((await first(db, 'SELECT SUM(quantity) AS n FROM order_items WHERE product_id = 1')).n, 3, 'satış adedi çift sayılmaz');
  // Ayrılmış stok yalnız satışın geldiği ilanda azalır
  assert.equal((await L(db, 'hb2')).stock_value, 1);
  assert.equal((await L(db, 'hb1')).stock_value, 4);
  // Senkron tekrar: değişmez
  await applyStock(db, ids);
  assert.equal(await stock(db), 4);
  // Bağı kaldır: ikinci ilanın siparişiyle düşen 2 adet geri eklenir, ilan aynı ürüne otomatik bağlanmaz
  await unlinkListing(db, { channel: HB, remote_id: 'hb2' }, { name: 'Test' });
  await applyDirtyStock(db);
  assert.equal(await stock(db), 6);
  assert.deepEqual({ ...(await L(db, 'hb2')) }, { product_id: null, match: 'x:1', extra_link: 0, pushed_stock: 3, stock_value: 1 });
  await autoMatch(db, { catalog: [] });
  assert.equal((await L(db, 'hb2')).product_id, null);
  assert.ok(!(await secondSuggestions(db)).items.some((x) => x.remote_id === 'hb2'), 'kaldırılan bağ yeniden önerilmez');
});

test('yetki: görmek Eşleştirme, bağlamak / reddetmek / ayırmak Ürünler yazma yetkisi ister', async () => {
  resetChannels();
  const db = await setup();
  const env = { PANEL_PASSWORD: 'x', DB: db };
  const ctx = { waitUntil() {} };
  const call = (path, user, b) => api(new Request('https://panel.test/api/' + path, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : {}), env, ctx, db, path.split('?')[0], user);
  const staff = (perms) => ({ id: 9, name: 'Personel', role: 'staff', perms });
  const body = { channel: HB, remote_id: 'hb2', product_id: 1 };
  const g = await (await call('match/second', staff(['match']))).json();
  assert.equal(g.total, 2);
  for (const perms of [['match'], ['products:view', 'match']]) {
    for (const p of ['approve', 'reject', 'unlink']) await assert.rejects(() => call('products/second-match/' + p, staff(perms), body), (e) => e.status === 403, `${perms} ${p}`);
  }
  assert.equal((await L(db, 'hb2')).product_id, null);
  const r = await (await call('products/second-match/approve', staff(['products']), body)).json();
  assert.equal(r.linked, 1);
  assert.equal((await L(db, 'hb2')).extra_link, 1);
  // İlan arama (elle bağlama): bu ürüne bağlı olanlar gelmez
  const s = await (await call(`products/second-match/listings?product_id=1&channel=${HB}&q=Termos`, staff(['products:view']))).json();
  assert.deepEqual(s.listings.map((x) => x.remote_id).sort(), ['hb3', 'hb4']);
  await call('products/second-match/unlink', staff(['products']), { channel: HB, remote_id: 'hb2' });
  assert.equal((await L(db, 'hb2')).product_id, null);
  // Eski uç (Eşleştirme → Kaldır) de işareti temizler
  await call('products/second-match/approve', { id: 0, name: 'Y', role: 'admin' }, body);
  await call('match/unlink', staff(['match']), { channel: HB, remote_id: 'hb2' });
  assert.equal((await L(db, 'hb2')).extra_link, 0);
});

test('eski "aynı ürün, bağla" (dup_ok) bağları geçişte işaretlenir; Kanal Ürünleri "farklı ürün" kararı öneride de hatırlanır', async () => {
  const db = await setup();
  const { resolveTwins } = await import('../src/chproducts.js');
  assert.equal((await L(db, 'hb3')).match, 'dup:1');
  await resolveTwins({}, db, { channel: HB, ids: ['hb3'], same: true });
  assert.equal((await L(db, 'hb3')).extra_link, 1);
  assert.equal(await repairDuplicates(db), 0);
  // Geçiş sorgusu: extra_link'i olmayan eski dup_ok bağı
  await run(db, "UPDATE listings SET extra_link = 0 WHERE remote_id = 'hb3'");
  await run(db, "UPDATE listings SET extra_link = 1 WHERE match = 'dup_ok' AND product_id IS NOT NULL");
  assert.equal((await L(db, 'hb3')).extra_link, 1);
  const s = await secondSuggestions(db);
  assert.deepEqual(s.items.map((x) => x.remote_id), ['hb2']);
});

test('Sipariş → Ürünle eşleştir: ilanı panelde olmayan satır doğrudan bağlanır (2. ilan), stok bir kez düşer; barkodlu satır kanaldaki ilanı bulur; yetki ister', async () => {
  resetChannels();
  const db = await setup();
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  const env = { PANEL_PASSWORD: 'x', DB: db, DEMO: '1' };
  const ctx = { waitUntil() {} };
  const call = (path, user, b) => api(new Request('https://panel.test/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, ctx, db, path, user);
  const staff = (perms) => ({ id: 9, name: 'Personel', role: 'staff', perms });
  // İlanı henüz panele gelmemiş satır (remote_key 'hb-yeni', listings'te yok)
  const [oid] = await saveOrders(db, HB, [order('O9', 'hb-yeni', 2)]);
  await applyStock(db, [oid]);
  assert.equal(await stock(db), 7);
  const path = `orders/${encodeURIComponent(oid)}/link-item`, b = { line_id: 'O9-1', product_id: 1 };
  await assert.rejects(() => call(path, staff(['orders']), b), (e) => e.status === 403);
  const r = await (await call(path, staff(['orders', 'products']), b)).json();
  assert.equal(r.linked, 1); assert.equal(r.extra, true, 'ürünün kanalda ilanı vardı: 2. ilan');
  assert.deepEqual({ ...(await first(db, 'SELECT product_id, extra_link FROM listings WHERE channel = ? AND remote_id = ?', HB, 'hb-yeni')) }, { product_id: 1, extra_link: 1 });
  assert.equal((await first(db, 'SELECT product_id FROM order_items WHERE order_id = ?', oid)).product_id, 1);
  assert.equal(await stock(db), 5, 'stok bir kez düştü');
  await call(path, staff(['orders', 'products']), b);
  await applyStock(db, [oid]);
  assert.equal(await stock(db), 5, 'tekrar bağlama çift düşmez');
  // remote_key'siz, barkodlu satır: kanaldaki aynı barkodlu bağlanmamış ilan (hb3) kullanılır, yeni ilan açılmaz
  const o2 = order('O10', '', 1); o2.items[0].barcode = '8690000000042';
  const [oid2] = await saveOrders(db, HB, [o2]);
  await run(db, "UPDATE order_items SET product_id = NULL, remote_key = NULL WHERE order_id = ?", oid2);
  await call(`orders/${encodeURIComponent(oid2)}/link-item`, staff(['orders', 'products']), { line_id: 'O10-1', product_id: 1 });
  assert.equal((await L(db, 'hb3')).product_id, 1);
  assert.equal((await first(db, 'SELECT remote_key, product_id FROM order_items WHERE order_id = ?', oid2)).remote_key, 'hb3');
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM listings WHERE channel = ? AND remote_id = ?', HB, '8690000000042')).n, 0);
});
