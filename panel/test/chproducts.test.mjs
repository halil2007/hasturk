// Kanal ürünleri: kanal ilanlarını seçerek panele alma, "ben seçeyim" modu, yok sayma
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, first, run, setSetting } from '../src/db.js';
import { autoMatch } from '../src/match.js';
import { listChannelProducts, addToPanel, ignoreListings, setMode, channelSummary } from '../src/chproducts.js';

async function setup() {
  const db = d1();
  await init(db);
  const t = Date.now();
  await run(db, "INSERT INTO products (sku, barcode, name, sale_price, stock, created_at, updated_at) VALUES ('HG-1', '8690000000011', 'Saksı Toprağı 20 Lt', 100, 5, ?, ?)", t, t);
  const L = [
    ['ty1', 'X-1', '8690000000011', 'Saksı Toprağı 20 Lt (Trendyol)', 5],   // barkodla var olan ürüne bağlanır
    ['ty2', 'TY-NEW', '8690000000028', 'Domates Tohumu', 3],               // yeni ürün
    ['ty3', 'hg-1', '', 'Aynı kodlu başka ilan', 2],                       // stok kodu var olan ürünle aynı → var olana bağlanmaz (ty1 bağladı), kodsuz yeni ürün
    ['ty4', 'TY-4', '8690000000035', 'Stoksuz ürün', 0],
  ];
  for (const [id, sku, bc, name, st] of L) await run(db, 'INSERT INTO listings (channel, remote_id, sku, barcode, name, price, remote_stock, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'trendyol', id, sku, bc || null, name, 50, st, t);
  return db;
}

test('ben seçeyim modunda ana katalog kanalı otomatik ürün açmaz, yine de kesin eşleşmeyi bağlar', async () => {
  const db = await setup();
  await setSetting(db, 'manual_import', { '*': true });
  const r = await autoMatch(db, { catalog: ['trendyol'] });
  assert.equal(r.created, 0);
  assert.equal((await first(db, "SELECT product_id FROM listings WHERE remote_id = 'ty1'")).product_id, 1, 'barkodla var olan ürüne bağlandı');
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products')).n, 1);
  // Otomatik moda geçince açılır
  await setMode(db, { channel: 'trendyol', manual: false });
  const r2 = await autoMatch(db, { catalog: ['trendyol'] });
  assert.ok(r2.created >= 1);
});

test('panele ekle: var olana bağlar, yoksa ürün açar, çakışan stok kodunu boş bırakır; yok sayma; sayılar', async () => {
  const db = await setup();
  await setSetting(db, 'manual_import', { '*': true });
  await autoMatch(db, { catalog: ['trendyol'] }); // ty1 bağlanır, ty4 stoksuz → yok sayılır
  let l = await listChannelProducts(db, { channel: 'trendyol', state: 'unlinked' });
  assert.deepEqual(l.listings.map((x) => x.remote_id).sort(), ['ty2', 'ty3']);
  assert.equal(l.counts.linked, 1); assert.equal(l.counts.zero, 1);
  const r = await addToPanel({}, db, { channel: 'trendyol', ids: ['ty2', 'ty3', 'ty1'] }, { name: 'Test' });
  assert.equal(r.created, 2); assert.equal(r.linked, 0); assert.equal(r.skipped, 1, 'zaten bağlı olan atlanır');
  const p = await all(db, 'SELECT p.sku, p.name, l.remote_id FROM listings l JOIN products p ON p.id = l.product_id WHERE l.channel = ? ORDER BY l.remote_id', 'trendyol');
  assert.deepEqual(p.map((x) => [x.remote_id, x.sku]), [['ty1', 'HG-1'], ['ty2', 'TY-NEW'], ['ty3', null]]);
  // Stoksuz ilan: tümünü ekle (filtre) ile alınabilir
  const z = await addToPanel({}, db, { channel: 'trendyol', all: true, state: 'zero' });
  assert.equal(z.created, 1);
  l = await listChannelProducts(db, { channel: 'trendyol', state: 'all' });
  assert.equal(l.counts.linked, 4); assert.equal(l.counts.unlinked, 0);
  // Yok sayma yalnız bağlı olmayan ilanda
  assert.equal((await ignoreListings(db, { channel: 'trendyol', ids: ['ty2'] })).changed, 0);
  const s = await channelSummary(db);
  assert.equal(s[0].channel, 'trendyol'); assert.equal(s[0].manual, true); assert.equal(s[0].linked, 4);
});

test('önerilen eşleşme: benzer adlı, kanalda boş ürün önerilir', async () => {
  const db = await setup();
  const t = Date.now();
  await run(db, "INSERT INTO products (sku, name, sale_price, stock, created_at, updated_at) VALUES ('HG-MAKAS', 'Bahçe Makası Profesyonel 20 cm', 259, 3, ?, ?)", t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, sku, name, price, remote_stock, synced_at) VALUES ('trendyol', 'ty9', 'TY-MK', 'Bahçe Makası Profesyonel', 249, 4, ?)", t);
  const l = await listChannelProducts(db, { channel: 'trendyol', state: 'unlinked', q: 'Makas' });
  assert.equal(l.listings.length, 1);
  assert.ok(l.listings[0].suggest, 'öneri var');
  assert.equal(l.listings[0].suggest.sku, 'HG-MAKAS');
  assert.ok(l.listings[0].suggest.score >= 40);
});
