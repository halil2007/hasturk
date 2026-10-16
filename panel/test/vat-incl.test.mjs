// Tüm giderler KDV dahil: eski kurulumda KDV hariç girilmiş tutarlar bir kez KDV dahile çevrilir (kâr değişmez), iki kez çevrilmez
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, getSettings, setSetting, run, first } from '../src/db.js';
import { costOf, rateGross } from '../public/profit.js';

const listing = (db, id, c, src, ch = 'trendyol') => run(db, "INSERT INTO listings (channel, remote_id, name, price, commission, commission_src, synced_at) VALUES (?, ?, 'x', 100, ?, ?, 0)", ch, id, c, src);

test('eski kurulum (KDV hariç girilmiş): ayarlar ve ilan komisyonları bir kez 1,2 ile çarpılır', async () => {
  const db = d1(); await init(db);
  await setSetting(db, 'commission', { trendyol: 20, hepsiburada: 17.5, amazon: 15, ciceksepeti: 20, n11: 15 });
  await setSetting(db, 'shipping', { trendyol: 50 });
  await listing(db, 'm', 15, 'manual', 'n11'); await listing(db, 'mt', 15, 'manual'); await listing(db, 'a', 10, 'api', 'hepsiburada'); await listing(db, 't', 21.5, 'api');
  const s = await getSettings(db);
  assert.equal(s.costs_vat_incl, true);
  // Trendyol, Amazon, Çiçeksepeti oranı zaten KDV dahil: çevrilmez
  assert.equal(s.commission.trendyol, 20); assert.equal(s.commission.amazon, 15); assert.equal(s.commission.ciceksepeti, 20);
  assert.equal(s.commission.hepsiburada, 21); assert.equal(s.commission.n11, 18); assert.equal(s.shipping.trendyol, 60);
  assert.equal(costOf(s, 'commission', 'trendyol'), 20, 'üstüne KDV eklenmez');
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'm'")).commission, 18);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'mt'")).commission, 15);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'a'")).commission, 12);
  // Trendyol çevrimi (init'te, once:ty_comm_incl_1) yapıldıktan sonra kanaldan gelen Trendyol oranı zaten KDV dahildir: ikinci kez %20 eklenmez
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 't'")).commission, 21.5);
  assert.equal(rateGross(s, 18), 18);
  // Yeni bir panel örneği (aynı veritabanı) tekrar çevirmez
  const s2 = await getSettings(db);
  assert.equal(s2.commission.trendyol, 20); assert.equal(s2.commission.n11, 18);
});

test('zaten KDV dahil girilmiş kurulum: tutarlar değişmez, yalnız kanaldan gelen ilan oranı KDV dahile çevrilir; yeni kurulum varsayılanları KDV dahil', async () => {
  const db = d1(); await init(db);
  await setSetting(db, 'costs_vat_incl', true);
  await setSetting(db, 'commission', { trendyol: 24 });
  await listing(db, 'm', 18, 'manual'); await listing(db, 'a', 10, 'api', 'hepsiburada'); await listing(db, 't', 21.5, 'api');
  const s = await getSettings(db);
  assert.equal(s.commission.trendyol, 24);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'm'")).commission, 18);
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 'a'")).commission, 12);
  // Trendyol çevrimi (init'te, once:ty_comm_incl_1) yapıldıktan sonra kanaldan gelen Trendyol oranı zaten KDV dahildir: ikinci kez %20 eklenmez
  assert.equal((await first(db, "SELECT commission FROM listings WHERE remote_id = 't'")).commission, 21.5);
  const fresh = d1(); await init(fresh);
  const f = await getSettings(fresh);
  assert.equal(f.costs_vat_incl, true); assert.equal(f.commission.trendyol, 20); assert.equal(costOf(f, 'commission', 'trendyol'), 20);
  assert.equal(f.commission.amazon, 15); assert.equal(f.commission.ciceksepeti, 20);
});

test('KDV dahil çevriminde %20 eklenmiş Trendyol / Amazon / Çiçeksepeti varsayılan oranı bir kez geri alınır; elle girilen oran korunur', async () => {
  const db = d1(); await init(db);
  await setSetting(db, 'costs_vat_incl', true);
  await setSetting(db, 'commission', { trendyol: 24, amazon: 18, ciceksepeti: 21, n11: 18 });
  // Yeni sürümün geçişleri (init yalnız eklenen geçişleri çalıştırır)
  const { MIGRATIONS } = await import('../src/db.js');
  for (const m of MIGRATIONS.filter((x) => /k = 'commission'/.test(x) && /json_set/.test(x))) await run(db, m);
  const s = await getSettings(db);
  assert.equal(s.commission.trendyol, 20); assert.equal(s.commission.amazon, 15);
  assert.equal(s.commission.ciceksepeti, 21, 'elle girilen oran değişmez'); assert.equal(s.commission.n11, 18);
});
