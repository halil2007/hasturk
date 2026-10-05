// Kanal bazında otomatik işlemler: yalnız seçilen kanala stok gönderimi, otomatik kategori eşleştirme ve otomatik ürün gönderimi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { pushStocks } from '../src/sync.js';
import { autoUpload, scoreCategory } from '../src/catalog.js';

test('kategori puanı: ek ve Türkçe karakter farkına rağmen doğru kategori öne çıkar', () => {
  const cats = [{ name: 'Sebze Tohumu', path: 'Bahçe › Tohum' }, { name: 'Saksı Toprağı', path: 'Bahçe › Toprak' }, { name: 'Organik Gübre', path: 'Bahçe › Gübre' }];
  const best = (local) => cats.slice().sort((a, b) => scoreCategory(local, b) - scoreCategory(local, a))[0].name;
  assert.equal(best('Bahçe › Toprak ve Harç'), 'Saksı Toprağı');
  assert.equal(best('Tohumlar › Sebze Tohumları'), 'Sebze Tohumu');
  assert.equal(best('Gübre'), 'Organik Gübre');
});

test('genel stok senkronu kapalıyken yalnız anahtarı açık kanala (Hepsiburada) ikas stoğu gönderilir', async () => {
  const db = d1(); await init(db); resetChannels();
  const t = Date.now();
  await run(db, "INSERT INTO products (id, name, stock, created_at, updated_at) VALUES (1, 'A', 7, ?, ?)", t, t);
  for (const c of ['hepsiburada', 'trendyol', 'ikas1']) await run(db, 'INSERT INTO listings (channel, remote_id, product_id, remote_stock, pushed_stock) VALUES (?, ?, 1, 3, 3)', c, c + '-1');
  await setSetting(db, 'stock_sync', false);
  assert.deepEqual(await pushStocks({ DEMO: '1' }, db), { skipped: 'Stok senkronu kapalı' });
  await setSetting(db, 'stock_push', { hepsiburada: true, ikas1: true });
  const r = await pushStocks({ DEMO: '1' }, db);
  assert.equal(r.hepsiburada, 1); assert.equal(r.trendyol, undefined); assert.equal(r.ikas1, undefined, 'ana katalog (ikas) stok kaynağıdır, ona gönderilmez');
  const ps = Object.fromEntries((await all(db, 'SELECT channel, pushed_stock FROM listings')).map((x) => [x.channel, x.pushed_stock]));
  assert.deepEqual(ps, { hepsiburada: 7, trendyol: 3, ikas1: 3 });
  resetChannels();
});

test('otomatik gönderim: kategori otomatik eşleşir, zorunlu özellikler (varyant, Menşei) doldurulur, ürün gönderilir', async () => {
  const db = d1(); await init(db); resetChannels();
  const t = Date.now();
  await run(db, `INSERT INTO products (id, name, sku, barcode, category, variant_name, sale_price, stock, created_at, updated_at) VALUES (1, 'HG Saksı Toprağı 5 Kg', 'HG-S5', '8690000000999', 'Bahçe › Saksı Toprakları', '5 Kg', 120, 4, ?, ?)`, t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, price, remote_stock) VALUES ('ikas1', 'v1', 1, 120, 4)");
  assert.equal(await autoUpload({ DEMO: '1' }, db), null, 'anahtar kapalıyken hiçbir şey yapılmaz');
  await setSetting(db, 'auto_upload', { hepsiburada: true });
  const r = await autoUpload({ DEMO: '1' }, db);
  assert.equal(r.hepsiburada, 1);
  const m = await first(db, "SELECT remote_id, remote_name, attrs, user FROM category_map WHERE channel = 'hepsiburada'");
  assert.equal(m.remote_name, 'Saksı Toprağı'); assert.equal(m.user, 'Otomatik');
  const attrs = JSON.parse(m.attrs);
  assert.equal(attrs['10'].value, '@variant'); assert.equal(attrs['11'].value, 'TR');
  const u = await first(db, "SELECT user, status, items FROM product_uploads WHERE channel = 'hepsiburada'");
  assert.equal(u.user, 'Otomatik'); assert.equal(JSON.parse(u.items)[0].id, 1);
  assert.equal((await autoUpload({ DEMO: '1' }, db)).hepsiburada, 0, 'aynı ürün tekrar gönderilmez');
  resetChannels();
});

test('Trendyol kargo faturasından gerçek kargo gideri siparişe yazılır; elle girilen korunur', async () => {
  const { trendyol } = await import('../src/channels/trendyol.js');
  const { syncCosts } = await import('../src/sync.js');
  const db = d1(); await init(db);
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url), J = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
    if (/otherfinancials/.test(u)) return J({ content: [{ id: 'KRG2026', transactionType: 'Kargo Faturası', description: 'Kargo' }, { id: 'X1', transactionType: 'Reklam Faturası' }], totalPages: 1 });
    if (/cargo-invoice\/KRG2026\/items/.test(u)) return J({ content: [{ orderNumber: '111', amount: 42.5 }, { orderNumber: '222', amount: 30 }, { orderNumber: '111', amount: 7.5 }], totalPages: 1 });
    return J({ content: [] });
  };
  try {
    const t = Date.now();
    for (const [no, src, cost] of [['111', null, null], ['222', 'manual', 99]]) await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, shipping_cost, shipping_src) VALUES (?, 'trendyol', ?, ?, 'delivered', ?, ?, ?)", 'trendyol:' + no, no, no, t, cost, src);
    const ch = trendyol({ TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
    const r = await syncCosts({}, db, [ch]);
    assert.equal(r.trendyol, 1);
    const o = Object.fromEntries((await all(db, 'SELECT order_number, shipping_cost, shipping_src FROM orders')).map((x) => [x.order_number, [x.shipping_cost, x.shipping_src]]));
    assert.deepEqual(o, { 111: [50, 'api'], 222: [99, 'manual'] });
  } finally { globalThis.fetch = real; }
});
