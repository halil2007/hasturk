// Fırsat etiketleri: Excel satırları ilanlarla eşleşir, eşik fiyatlarında kâr hesaplanır, seçilen eşik kanal fiyatı olur
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, first, run, setSetting } from '../src/db.js';
import { importOffers, listOffers, applyOffers, clearOffers, detectColumns } from '../src/promos.js';

async function setup() {
  const db = d1();
  await init(db);
  const t = Date.now();
  await run(db, "INSERT INTO products (sku, barcode, name, purchase_price, sale_price, stock, vat, created_at, updated_at) VALUES ('HG-1', '8690000000011', 'Saksı Toprağı', 40, 100, 5, 20, ?, ?)", t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, sku, barcode, name, price, product_id, synced_at) VALUES ('trendyol', 'ty1', 'HG-1', '8690000000011', 'Saksı Toprağı', 100, 1, ?)", t);
  await setSetting(db, 'commission', { trendyol: 20 });
  return db;
}

test('Trendyol avantajlı ürün Excel sütunları tanınır', () => {
  const c = detectColumns(['Barkod', 'Ürün Adı', 'Trendyol Satış Fiyatı', '1 Yıldız Fiyatı', '2 Yıldız Fiyatı', '3 Yıldız Fiyatı', 'Kategori']);
  assert.equal(c.barcode, 'Barkod');
  assert.equal(c.current, 'Trendyol Satış Fiyatı');
  assert.deepEqual(c.tiers, ['1 Yıldız Fiyatı', '2 Yıldız Fiyatı', '3 Yıldız Fiyatı']);
});

test('yükle → listele (kâr) → eşik fiyatını uygula → fiyat gönderimi sırada', async () => {
  const db = await setup();
  const rows = [
    { Barkod: '8690000000011', 'Ürün Adı': 'Saksı Toprağı', 'Trendyol Satış Fiyatı': '100', '1 Yıldız Fiyatı': '95,90', '2 Yıldız Fiyatı': '89,90', '3 Yıldız Fiyatı': '' },
    { Barkod: '8690000009999', 'Ürün Adı': 'Panelde olmayan', 'Trendyol Satış Fiyatı': '50', '1 Yıldız Fiyatı': '45', '2 Yıldız Fiyatı': '40', '3 Yıldız Fiyatı': '35' },
  ];
  const r = await importOffers(db, { channel: 'trendyol', kind: 'advantage', rows });
  assert.equal(r.imported, 2);
  assert.equal(r.matched, 1);
  const { offers, groups } = await listOffers(db, { channel: 'trendyol', kind: 'advantage' });
  assert.equal(groups[0].n, 2);
  const o = offers.find((x) => x.remote_id === 'ty1');
  assert.equal(o.tiers.length, 2, 'boş eşik atlanır');
  assert.equal(o.tiers[0].price, 95.9);
  assert.ok(o.tiers[0].margin < o.now.margin, 'düşük fiyatta kâr oranı düşer');
  assert.equal(o.tiers[0].ok, false, '100 TL fiyat 95,90 eşiğini sağlamaz');
  // Kâr sınırı: %50 altına düşecekse atlanır
  const skip = await applyOffers(db, { channel: 'trendyol', kind: 'advantage', keys: ['8690000000011'], tier: 1, minMargin: 50 });
  assert.equal(skip.applied, 0);
  assert.equal(skip.skipped, 1);
  const ok = await applyOffers(db, { channel: 'trendyol', kind: 'advantage', keys: ['8690000000011', '8690000009999'], tier: 1 });
  assert.equal(ok.applied, 1);
  assert.equal(ok.unmatched, 1);
  const l = await first(db, "SELECT price, price_dirty FROM listings WHERE remote_id = 'ty1'");
  assert.equal(l.price, 89.9);
  assert.equal(l.price_dirty, 1);
  const after = (await listOffers(db, { channel: 'trendyol', kind: 'advantage' })).offers.find((x) => x.remote_id === 'ty1');
  assert.equal(after.tiers[1].ok, true, 'yeni fiyat 2. eşiği sağlıyor');
  assert.equal(after.applied_price, 89.9);
  assert.equal((await clearOffers(db, { channel: 'trendyol', kind: 'advantage' })).removed, 2);
});

test('Hepsiburada flaş indirim: HB SKU ile eşleşir, tarih okunur', async () => {
  const db = await setup();
  await run(db, "INSERT INTO listings (channel, remote_id, sku, name, price, product_id, synced_at) VALUES ('hepsiburada', 'HBV00001', 'HG-1', 'Saksı Toprağı', 110, 1, 1)");
  const r = await importOffers(db, { channel: 'hepsiburada', kind: 'flash', rows: [{ 'Hepsiburada SKU': 'HBV00001', 'Satıcı Stok Kodu': 'HG-1', 'Güncel Fiyat': '110', 'Kampanya Fiyatı': '99', 'Bitiş Tarihi': '20.10.2026 23:59' }] });
  assert.equal(r.matched, 1);
  const [o] = (await listOffers(db, { channel: 'hepsiburada', kind: 'flash' })).offers;
  assert.equal(o.remote_id, 'HBV00001');
  assert.equal(new Date(o.ends_at + 3 * 3600e3).toISOString().slice(0, 16), '2026-10-20T23:59');
  await assert.rejects(() => importOffers(db, { channel: 'hepsiburada', kind: 'flash', rows: [{ Ad: 'x', Fiyat: '1' }] }), /barkod ya da stok kodu/);
});
