// Tüm giderler KDV dahil: eski kurulumda KDV hariç girilmiş tutarlar bir kez KDV dahile çevrilir (kâr değişmez), iki kez çevrilmez
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, getSettings, setSetting, run, first } from '../src/db.js';
import { costOf, rateGross } from '../public/profit.js';

const listing = (db, id, c, src) => run(db, "INSERT INTO listings (channel, remote_id, name, price, commission, commission_src, synced_at) VALUES ('trendyol', ?, 'x', 100, ?, ?, 0)", id, c, src);

test('eski kurulum (KDV hariç girilmiş): ayarlar ve ilan komisyonları bir kez 1,2 ile çarpılır', async () => {
  const db = d1(); await init(db);
  await setSetting(db, 'commission', { trendyol: 20, hepsiburada: 17.5 });
  await setSetting(db, 'shipping', { trendyol: 50 });
  await listing(db, 'm', 15, 'manual'); await listing(db, 'a', 10, 'api');
  const s = await getSettings(db);
  assert.equal(s.costs_vat_incl, true);
  assert.equal(s.commission.trendyol, 24); assert.equal(s.commission.hepsiburada, 21); assert.equal(s.shipping.trendyol, 60);
  assert.equal(costOf(s, 'commission', 'trendyol'), 24, 'üstüne KDV eklenmez');
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'm'")).commission, 18);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'a'")).commission, 12);
  assert.equal(rateGross(s, 18), 18);
  // Yeni bir panel örneği (aynı veritabanı) tekrar çevirmez
  const s2 = await getSettings(db);
  assert.equal(s2.commission.trendyol, 24);
});

test('zaten KDV dahil girilmiş kurulum: tutarlar değişmez, yalnız kanaldan gelen ilan oranı KDV dahile çevrilir; yeni kurulum varsayılanları KDV dahil', async () => {
  const db = d1(); await init(db);
  await setSetting(db, 'costs_vat_incl', true);
  await setSetting(db, 'commission', { trendyol: 24 });
  await listing(db, 'm', 18, 'manual'); await listing(db, 'a', 10, 'api');
  const s = await getSettings(db);
  assert.equal(s.commission.trendyol, 24);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'm'")).commission, 18);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'a'")).commission, 12);
  const fresh = d1(); await init(fresh);
  const f = await getSettings(fresh);
  assert.equal(f.costs_vat_incl, true); assert.equal(f.commission.trendyol, 24); assert.equal(costOf(f, 'commission', 'trendyol'), 24);
});
