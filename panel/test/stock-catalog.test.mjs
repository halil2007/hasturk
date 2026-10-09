// Stok tek yerden (panelden) yönetilir: ana panelde stok senkronu bir kez açılır, ana katalog (HasTürk ikas) de stok alır;
// kanalın reddettiği stok sonraki senkronda yeniden gönderilir. Müşteri panellerinin ayarına dokunulmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, getSettings, first } from '../src/db.js';
import { syncAll, pushStocks } from '../src/sync.js';
import { resetChannels } from '../src/channels/index.js';

async function db0() { const db = d1(); await init(db); return db; }

test('ana panel: stok senkronu bir kez açılır, ana katalog kanalının kapalı stok gönderimi açılır; sonradan kapatılırsa yeniden açılmaz', async () => {
  resetChannels();
  const db = await db0();
  await setSetting(db, 'stock_channels', { ikas1: false, trendyol: false });
  const env = { PANEL_PASSWORD: 'x', DB: db };
  await syncAll(env, db);
  let s = await getSettings(db);
  assert.equal(s.stock_sync, true);
  assert.ok(s.stock_since > Date.now() - 60e3);
  assert.equal(s.stock_channels.ikas1, undefined, 'ana katalog stok alır');
  assert.equal(s.stock_channels.trendyol, false, 'diğer kanalların seçimi korunur');
  await setSetting(db, 'stock_sync', false);
  await syncAll(env, db);
  s = await getSettings(db);
  assert.equal(s.stock_sync, false, 'kullanıcı kapatırsa bir daha açılmaz');
});

test('müşteri paneli: stok ayarına dokunulmaz', async () => {
  resetChannels();
  const db = await db0();
  await syncAll({ PANEL_PASSWORD: 'x', DB: db, TENANT_SLUG: 'firma' }, db);
  assert.equal((await getSettings(db)).stock_sync, false);
});

test('senkron açıkken ana katalog (HasTürk) da panel stoğunu alır', async () => {
  resetChannels();
  const db = await db0();
  const env = { PANEL_PASSWORD: 'x', DB: db, DEMO: '1' };
  await setSetting(db, 'stock_sync', true);
  await db.prepare("INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'A', '111', 'Ürün A', 25, 0, 0)").run();
  await db.prepare("INSERT INTO listings (channel, remote_id, remote_product_id, product_id, sku, barcode, pushed_stock, remote_stock) VALUES ('ikas1', 'v1', 'p1', 1, 'A', '111', 10, 10), ('trendyol', '111', '', 1, 'A', '111', 10, 10)").run();
  const r = await pushStocks(env, db);
  assert.equal(r.ikas1, 1);
  assert.equal(r.trendyol, 1);
  assert.equal((await first(db, "SELECT pushed_stock FROM listings WHERE channel = 'ikas1'")).pushed_stock, 25);
});
