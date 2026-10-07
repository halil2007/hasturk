// Fiyat güvenliği: kural sınırı her fiyat yolunda korunur, sınır dışı mevcut fiyat sınıra çekilir, reddedilen gönderim görünür olur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all } from '../src/db.js';
import { resetChannels, getChannels } from '../src/channels/index.js';
import { pushPrices, checkPushes, trackPush } from '../src/sync.js';
import { decide } from '../src/buybox.js';

test('kural açık ilanın fiyatı (kur / öneri / Excel) sınır dışına gönderilmez, sınıra çekilir ve bildirilir', async () => {
  const db = d1(); await init(db); resetChannels();
  await run(db, "INSERT INTO listings (channel, remote_id, price, price_dirty) VALUES ('trendyol', 'A', 80, 1), ('trendyol', 'B', 300, 1), ('trendyol', 'C', 150, 1), ('trendyol', 'D', 50, 1)");
  await run(db, "INSERT INTO price_rules (channel, remote_id, enabled, min_price, max_price) VALUES ('trendyol', 'A', 1, 100, 200), ('trendyol', 'B', 1, 100, 200), ('trendyol', 'C', 1, 100, 200), ('trendyol', 'D', 0, 100, 200)");
  await pushPrices({ DEMO: '1' }, db);
  const p = Object.fromEntries((await all(db, 'SELECT remote_id, price FROM listings')).map((x) => [x.remote_id, x.price]));
  assert.deepEqual(p, { A: 100, B: 200, C: 150, D: 50 }, 'kapalı kurala dokunulmaz');
  assert.ok(await first(db, "SELECT 1 FROM notices WHERE key = 'pricebound' AND resolved_at IS NULL"));
  resetChannels();
});

test('otomatik fiyat: mevcut fiyat sınır dışındaysa önce sınıra çekilir', () => {
  const rule = { enabled: 1, min_price: 100, max_price: 200, step: 1 };
  assert.equal(decide(rule, { rank: 1 }, 90).price, 100);
  assert.equal(decide(rule, { rank: 2, buyboxPrice: 150 }, 250).price, 200);
  assert.equal(decide(rule, { rank: 2, buyboxPrice: 150 }, 160).price, 149, 'sınır içindeyken normal karar');
});

test('kanalın reddettiği fiyat ilana hata olarak yazılır ve bildirilir; başarılıysa bildirim kapanır', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const ch = (await getChannels(env, db)).find((c) => c.id === 'trendyol');
  let answer = { done: false, items: [] };
  ch.pushStatus = async () => answer;
  await run(db, "INSERT INTO listings (channel, remote_id, price) VALUES ('trendyol', 'BC1', 100), ('trendyol', 'BC2', 100)");
  await trackPush(db, ch, 'price', { refs: ['batch-1'] }, 2);
  await run(db, 'UPDATE push_checks SET at = at - 120000');
  assert.deepEqual(await checkPushes(env, db), { checked: 0, failed: 0 }, 'sonuç hazır değil: bekler');
  answer = { done: true, items: [{ key: 'BC1', ok: false, error: 'Kampanyadaki ürünün fiyatı değiştirilemez' }, { key: 'BC2', ok: true }] };
  assert.deepEqual(await checkPushes(env, db), { checked: 1, failed: 1 });
  const e = Object.fromEntries((await all(db, 'SELECT remote_id, error FROM listings')).map((x) => [x.remote_id, x.error]));
  assert.match(e.BC1, /reddedildi: Kampanyadaki/);
  assert.equal(e.BC2, null);
  assert.ok(await first(db, "SELECT 1 FROM notices WHERE key = 'pricereject:trendyol' AND resolved_at IS NULL"));
  assert.equal(await checkPushes(env, db), null, 'bir kez sorgulanır');
  resetChannels();
});
