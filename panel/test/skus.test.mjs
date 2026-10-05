// SKU oluşturma: ürün adından okunabilir kod, benzersizlik, önizleme ve kaydetme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run } from '../src/db.js';
import { skuFor, previewSkus, assignSkus, suggestSku, cleanSku } from '../src/skus.js';

test('ürün adından SKU', () => {
  assert.equal(skuFor({ name: 'HasTürk Solucan Gübresi - 15 Kg', group_name: 'HasTürk Solucan Gübresi', variant_name: '15 Kg', brand: 'HasTürk' }, 'HG'), 'HG-SOGU-15KG');
  assert.equal(skuFor({ name: 'Bahçe Toprağı Canlandırma Seti', brand: 'HasTürk' }, 'HG'), 'HG-BTCS');
  assert.equal(skuFor({ name: 'Sıvı Gübre 2,5 Lt' }, ''), 'SIGU-2500ML');
  assert.equal(skuFor({ name: 'Doğal Taş Podima Beyaz Tamburlu Taş - 15/25 MM' }, 'HG'), 'HG-DTPB-15-25MM');
  assert.equal(skuFor({ name: 'Torf' }, ''), 'TORF');
  assert.equal(skuFor({ name: 'HasTürk Solucan Gübresi (HGKSG01)', brand: 'HasTürk' }, ''), 'SOGU');
  assert.equal(skuFor({ name: 'Domates Fidesi', group_name: 'Domates Fidesi', variant_name: 'Kırmızı' }, ''), 'DOFI-KIRM');
  assert.equal(cleanSku(' hg-çay ş '), 'HG-CAYS');
});

test('önizleme benzersiz; kaydetme çakışmayı ve dolu SKU\'yu korur', async () => {
  const db = d1();
  await init(db);
  const t = Date.now();
  const P = (id, name, sku = null) => run(db, 'INSERT INTO products (id, name, sku, brand, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, name, sku, 'HasTürk', t, t);
  await P(1, 'Solucan Gübresi 5 Kg'); await P(2, 'Solucan Gübresi 5 Kg'); await P(3, 'Torf', 'ESKI-1'); await P(4, 'Perlit');
  await run(db, "INSERT INTO listings (channel, remote_id, sku, name) VALUES ('trendyol', 'x', 'HG-PERL', 'ilan')");
  const pv = await previewSkus(db, [1, 2, 3, 4], 'HG');
  const m = Object.fromEntries(pv.items.map((x) => [x.id, x.sku]));
  assert.equal(m[1], 'HG-SOGU-5KG');
  assert.equal(m[2], 'HG-SOGU-5KG-2');
  assert.equal(m[3], undefined, 'SKU\'su dolu ürün önizlenmez');
  assert.equal(m[4], 'HG-PERL-2', 'kanal ilanındaki SKU ile çakışmaz');
  await assert.rejects(() => assignSkus(db, [{ id: 1, sku: 'A' }, { id: 2, sku: 'a' }]), /birden fazla/);
  await assert.rejects(() => assignSkus(db, [{ id: 1, sku: 'ESKI-1' }]), /kullanılıyor/);
  const r = await assignSkus(db, [{ id: 1, sku: m[1] }, { id: 2, sku: 'hg-ozel' }, { id: 3, sku: 'YENI' }], { prefix: 'HG', user: 'Test' });
  assert.equal(r.assigned.length, 2);
  assert.equal(r.skipped, 1);
  const rows = Object.fromEntries((await all(db, 'SELECT id, sku FROM products')).map((x) => [x.id, x.sku]));
  assert.deepEqual([rows[1], rows[2], rows[3]], ['HG-SOGU-5KG', 'HG-OZEL', 'ESKI-1']);
  // Tek ürün önerisi: kendi SKU'su çakışma sayılmaz, ön ek hatırlanır
  assert.equal((await suggestSku(db, { name: 'Solucan Gübresi 5 Kg', brand: 'HasTürk', id: 1 })).sku, 'HG-SOGU-5KG');
  assert.equal((await suggestSku(db, { name: 'Solucan Gübresi 5 Kg', brand: 'HasTürk' })).sku, 'HG-SOGU-5KG-2');
});
