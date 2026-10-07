// Senkron güvenilirliği: eksik okunan aralıkta imleç ilerlemez, parça parça stok gönderimi, otomatik gönderim hatası döngüye
// girmez, acil uyarı tekrarlanmaz, firma paneli zamanlayıcısı bekçiyle yeniden kurulur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { init, run, first, all, getRaw, setSetting } from '../src/db.js';
import { resetChannels, getChannels } from '../src/channels/index.js';
import { syncAll, pushStocks } from '../src/sync.js';
import { urgentAlert, alertResolved } from '../src/alerts.js';
import { tenantWatchdog } from '../src/tenants.js';

test('kanal aralığın tamamını okuyamazsa imleç ilerlemez (en fazla 1 gün geride kalır)', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const chans = await getChannels(env, db);
  for (const c of chans) if (c.id !== 'trendyol') c.enabled = false;
  const ch = chans.find((c) => c.id === 'trendyol');
  ch.fetchListings = null;
  const t0 = Date.now();
  await setSetting(db, 'cursor:trendyol', t0 - 3 * 3600e3);
  ch.fetchOrders = async (since) => { const o = []; o.partialUntil = since; o.warnings = ['shipped: zaman aşımı']; return o; };
  await syncAll(env, db, { only: ['trendyol'] });
  assert.equal(await getRaw(db, 'cursor:trendyol'), t0 - 3 * 3600e3, 'imleç yerinde kaldı');
  assert.ok(await first(db, "SELECT 1 FROM notices WHERE key = 'partial:trendyol' AND resolved_at IS NULL"));
  ch.fetchOrders = async () => [];
  await syncAll(env, db, { only: ['trendyol'] });
  assert.ok(await getRaw(db, 'cursor:trendyol') >= t0, 'tam okununca ilerler');
  assert.ok(await first(db, "SELECT 1 FROM notices WHERE key = 'partial:trendyol' AND resolved_at IS NOT NULL"));
  resetChannels();
});

test('parça parça stok gönderimi: yalnız gönderilenler işaretlenir, hatalı ilan ayrı yazılır', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const ch = (await getChannels(env, db)).find((c) => c.id === 'pttavm');
  ch.enabled = true;
  ch.pushStock = async (items) => ({ done: [items[0].remoteId], errors: [{ remoteId: items[1].remoteId, error: 'Barkod bulunamadı' }] });
  await run(db, "INSERT INTO products (id, name, stock, created_at, updated_at) VALUES (1, 'A', 5, 0, 0), (2, 'B', 6, 0, 0), (3, 'C', 7, 0, 0)");
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, pushed_stock) VALUES ('pttavm', 'P1', 1, 0), ('pttavm', 'P2', 2, 0), ('pttavm', 'P3', 3, 0)");
  await setSetting(db, 'stock_sync', true);
  const r = await pushStocks(env, db, null, ['pttavm']);
  assert.equal(r.pttavm, '1 gönderildi, 1 hata');
  const ls = Object.fromEntries((await all(db, 'SELECT remote_id, pushed_stock, error FROM listings')).map((x) => [x.remote_id, x]));
  assert.equal(ls.P1.pushed_stock, 5);
  assert.equal(ls.P2.pushed_stock, 0); assert.match(ls.P2.error, /Barkod bulunamadı/);
  assert.equal(ls.P3.pushed_stock, 0, 'kalan ilan sonraki senkronda');
  resetChannels();
});

test('acil uyarı: aynı sorun için 6 saatte bir; düzelince temizlenir', async () => {
  const db = d1(); await init(db);
  const env = {};
  const a = await urgentAlert(env, db, 'orders:trendyol', { title: 'Trendyol: siparişler alınamıyor', body: 'x' });
  assert.ok(a);
  assert.equal(await urgentAlert(env, db, 'orders:trendyol', { title: 'tekrar', body: 'x' }), null, 'tekrar gönderilmez');
  await alertResolved(env, db, 'orders:trendyol', { title: 'düzeldi' });
  assert.equal(await getRaw(db, 'alert:orders:trendyol'), null);
  assert.ok(await urgentAlert(env, db, 'orders:trendyol', { title: 'yeniden', body: 'x' }), 'yeni sorun yeniden bildirilir');
});

test('bekçi: zamanlayıcısı kaybolan firma panelinin senkronu yeniden kurulur', async () => {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  let jar = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar, ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  assert.equal((await call('/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'bekci', name: 'Bekçi', admin_username: 'ali', admin_password: 'gizli-sifre-1' }) })).status, 200);
  const obj = env.TENANT.get(env.TENANT.idFromName('bekci'));
  await obj.ctx.storage.deleteAlarm();
  assert.equal(await obj.ctx.storage.getAlarm(), null);
  const r = await tenantWatchdog(env, env.DB);
  assert.equal(r.checked, 1);
  assert.ok(await obj.ctx.storage.getAlarm(), 'zamanlayıcı yeniden kuruldu');
  assert.equal(await tenantWatchdog(env, env.DB), null, 'saatte bir çalışır');
});
