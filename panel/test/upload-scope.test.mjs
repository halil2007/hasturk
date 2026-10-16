// Kanal başına ürün kapsamı: "tüm ürünler" (kategoriye göre, varsayılan) ya da "yalnız seçtiğim ürünler" (ürün bazında seçim).
// Seçili kapsamda otomatik gönderim yalnız seçilen ürünleri gönderir; kategori eşleşmesi yine kişinin onayladığı eşleşme olmalı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all, setSetting, getSettings } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { autoUpload, catalogApi } from '../src/catalog.js';
import { setTargets, pendingPicks, scopeOf } from '../src/targets.js';

const ENV = { DEMO: '1' }, U = { name: 'Yönetici' };
async function setup() {
  const db = d1(); await init(db); resetChannels();
  const t = Date.now();
  for (const [id, name, bc] of [[1, 'HG Saksı Toprağı 5 Kg', '8690000000991'], [2, 'HG Saksı Toprağı 10 Kg', '8690000000992'], [3, 'HG Saksı Toprağı 20 Kg', '8690000000993']]) {
    await run(db, `INSERT INTO products (id, name, sku, barcode, category, variant_name, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, 'Bahçe › Saksı Toprakları', ?, 120, 4, ?, ?)`, id, name, 'HG-' + id, bc, name.split(' ').slice(-2).join(' '), t, t);
    await run(db, "INSERT INTO listings (channel, remote_id, product_id, price, remote_stock) VALUES ('ikas1', ?, ?, 120, 4)", 'v' + id, id);
  }
  await setSetting(db, 'auto_upload', { hepsiburada: true });
  await catalogApi(ENV, db, null, 'catalog/state', 'GET', {}, {}, U);
  await autoUpload(ENV, db); // öneri hazırlanır
  await catalogApi(ENV, db, null, 'catalog/suggest/accept', 'POST', {}, { channel: 'hepsiburada', local: 'Bahçe › Saksı Toprakları' }, U);
  return db;
}
const sentIds = async (db) => (await all(db, "SELECT items FROM product_uploads WHERE channel = 'hepsiburada' AND status = 'sent'")).flatMap((u) => JSON.parse(u.items).map((x) => x.id)).sort();

test('yalnız seçtiğim ürünler: kategori seçimi olmadan yalnız seçilen ürün gider; tüm ürünlere dönünce kategoriye göre', async () => {
  const db = await setup();
  await setSetting(db, 'upload_scope', { hepsiburada: 'selected' });
  assert.equal(scopeOf(await getSettings(db), 'hepsiburada'), 'selected');
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 0, 'seçili ürün yokken hiçbir şey gitmez');
  await setTargets(db, [2], ['hepsiburada'], true);
  const st = await catalogApi(ENV, db, null, 'catalog/state', 'GET', {}, {}, U);
  const ch = st.channels.find((c) => c.id === 'hepsiburada');
  assert.deepEqual([ch.scope, ch.picked], ['selected', 1]);
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 1);
  assert.deepEqual(await sentIds(db), [2], 'yalnız seçilen ürün');
  assert.deepEqual(await pendingPicks(db, 'hepsiburada'), [], 'gönderilen ürün bekleyenlerden çıkar');
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 0, 'tekrar gönderilmez');
  // Ürün yükle listesi: seçili olmayan ürün işaretlenir (elle gönderilebilir)
  const cand = await catalogApi(ENV, db, null, 'catalog/candidates', 'GET', { channel: 'hepsiburada', local: 'Bahçe › Saksı Toprakları' }, {}, U);
  assert.equal(cand.scope, 'selected');
  assert.deepEqual(cand.items.filter((x) => x.id !== 2).map((x) => x.picked), [false, false]);
  // Tüm ürünler: kategori seçimine göre (seçim yapılmadıysa hiçbiri)
  await setSetting(db, 'upload_scope', {});
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 0, 'kategori seçilmediyse tüm ürünler kapsamında da gitmez');
  await setSetting(db, 'auto_upload_cats', { hepsiburada: ['Bahçe › Saksı Toprakları'] });
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 2);
  assert.deepEqual(await sentIds(db), [1, 2, 3]);
  resetChannels();
});

test('seçili kapsamda kategori seçimi gönderimi genişletmez; sistem onaylı eşleşmeyle seçili ürün de gitmez', async () => {
  const db = await setup();
  await setSetting(db, 'auto_upload_cats', { hepsiburada: ['Bahçe › Saksı Toprakları'] });
  await setSetting(db, 'upload_scope', { hepsiburada: 'selected' });
  await setTargets(db, [1], ['hepsiburada'], true);
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 1);
  assert.deepEqual(await sentIds(db), [1]);
  await run(db, "UPDATE category_map SET user = 'Otomatik (kesin)' WHERE channel = 'hepsiburada'");
  await setTargets(db, [3], ['hepsiburada'], true);
  assert.equal((await autoUpload(ENV, db)).hepsiburada, 0);
  // Seçimden çıkarma
  assert.equal(await setTargets(db, [3], ['hepsiburada'], false), 1);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM product_targets')).n, 1);
  resetChannels();
});

test('ayar yalnız "selected" saklar, ürün silinince seçim silinir', async () => {
  const db = await setup();
  const { saveSettings, deleteProducts } = await import('../src/api.js');
  {
    await saveSettings(db, { upload_scope: { hepsiburada: 'selected', trendyol: 'all', 'bad id!': 'selected' } });
    assert.deepEqual((await getSettings(db)).upload_scope, { hepsiburada: 'selected' });
    await saveSettings(db, { upload_scope: { trendyol: 'selected' } });
    assert.deepEqual((await getSettings(db)).upload_scope, { hepsiburada: 'selected', trendyol: 'selected' }, 'kanal bazında birleşir');
    await saveSettings(db, { upload_scope: { hepsiburada: 'all' } });
    assert.deepEqual((await getSettings(db)).upload_scope, { trendyol: 'selected' });
  }
  await setTargets(db, [1, 2], ['hepsiburada', 'trendyol'], true);
  await deleteProducts(db, [1]);
  assert.deepEqual((await all(db, 'SELECT product_id, channel FROM product_targets ORDER BY channel')).map((r) => `${r.product_id}:${r.channel}`), ['2:hepsiburada', '2:trendyol']);
  resetChannels();
});

test('Kanallarda yayınla: seçili kapsamdaki kanal ürünün seçimini bildirir; elle yayınlanan ürün seçili olur', async () => {
  const { publishApi } = await import('../src/publish.js');
  const db = await setup();
  await setSetting(db, 'upload_scope', { hepsiburada: 'selected' });
  await setTargets(db, [1], ['hepsiburada'], true);
  const p = await publishApi(ENV, db, null, 'catalog/preflight', 'GET', { ids: '2', channels: 'hepsiburada,trendyol' }, {}, U);
  const hb = p.channels.find((c) => c.id === 'hepsiburada'), ty = p.channels.find((c) => c.id === 'trendyol');
  assert.equal(hb.scope, 'selected'); assert.ok(!hb.picked.includes(2));
  if (ty) assert.equal(ty.scope, undefined, 'tüm ürünler kapsamı');
  await run(db, "UPDATE products SET brand = 'HG', warranty_months = 24 WHERE id = 3");
  const r = await publishApi(ENV, db, null, 'catalog/publish', 'POST', {}, { ids: [3], channels: ['hepsiburada'] }, U);
  assert.equal(r.results.hepsiburada.sent, 1, JSON.stringify(r.results.hepsiburada));
  assert.ok(await first(db, "SELECT 1 AS x FROM product_targets WHERE product_id = 3 AND channel = 'hepsiburada'"));
  resetChannels();
});
