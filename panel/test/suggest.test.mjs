// Fiyat önerileri: rakip (buybox) fiyatlarından birinciliği al / kâr artır önerileri, kâr hesabı, kural sınırları ve uygulama
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { suggestFor, listSuggestions, applySuggestions } from '../src/suggest.js';

const S = { commission: { trendyol: 20 }, shipping: { trendyol: 0 }, service_fee: {}, fee_rate: {}, withholding: {} };
const base = { channel: 'trendyol', remote_id: 'R1', name: 'Ürün', price: 100, purchase_price: 50, vat: 20, checked_at: Date.now() };

test('birinci sıra rakipte: rakibin 1 kuruş altı önerilir ve kâr hesaplanır', () => {
  const s = suggestFor({ ...base, rank: 2, buybox_price: 95 }, S);
  assert.equal(s.kind, 'win'); assert.equal(s.suggested, 94.99); assert.equal(s.diff, -5.01);
  assert.ok(s.next.profit < s.now.profit); assert.equal(s.loss, false);
  // fiyatımız zaten rakibin altında → öneri yok (fiyat dışı neden)
  assert.equal(suggestFor({ ...base, rank: 2, buybox_price: 100.01 }, S), null);
});

test('birinci sıra bizde, ikinci satıcı yukarıda: kâr artır önerisi; kural sınırı aşılmaz', () => {
  const s = suggestFor({ ...base, rank: 1, multi: 1, second_price: 120 }, S);
  assert.equal(s.kind, 'raise'); assert.equal(s.suggested, 119.99);
  const m = suggestFor({ ...base, rank: 1, multi: 1, second_price: 120, max_price: 110 }, S);
  assert.equal(m.suggested, 110); assert.equal(m.limited, 'max');
  assert.equal(suggestFor({ ...base, rank: 1, multi: 1, second_price: 101 }, S), null); // %2'den az fark
  assert.equal(suggestFor({ ...base, rank: 1, multi: 0 }, S), null);
});

test('zararına öneri işaretlenir ve uygulanmaz; uygun öneri ilan fiyatı olur', async () => {
  const db = d1(); await init(db);
  await db.batch([
    db.prepare("INSERT INTO products (id, name, purchase_price, stock, active, created_at, updated_at) VALUES (1, 'A', 50, 5, 1, 0, 0), (2, 'B', 90, 5, 1, 0, 0)"),
    db.prepare("INSERT INTO listings (channel, remote_id, product_id, name, price, list_price) VALUES ('trendyol', 'R1', 1, 'A', 100, 100), ('trendyol', 'R2', 2, 'B', 100, 100)"),
    db.prepare('INSERT INTO buybox (channel, remote_id, rank, buybox_price, checked_at) VALUES (?, ?, 2, 95, ?), (?, ?, 2, 80, ?)').bind('trendyol', 'R1', Date.now(), 'trendyol', 'R2', Date.now()),
    db.prepare("INSERT INTO settings (k, v) VALUES ('commission', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(JSON.stringify({ trendyol: 20 })),
  ]);
  const r = await listSuggestions(db, { channels: ['trendyol'] });
  assert.equal(r.items.length, 2); assert.equal(r.counts.win, 2); assert.equal(r.counts.loss, 1);
  const a = await applySuggestions(db, { items: [{ channel: 'trendyol', remote_id: 'R1' }, { channel: 'trendyol', remote_id: 'R2' }], channels: ['trendyol'] });
  assert.equal(a.applied, 1); assert.equal(a.skipped, 1);
  const l = await db.prepare("SELECT price, price_dirty FROM listings WHERE remote_id = 'R1'").first();
  assert.equal(l.price, 94.99); assert.equal(l.price_dirty, 1);
  assert.equal((await db.prepare("SELECT price FROM listings WHERE remote_id = 'R2'").first()).price, 100);
});
