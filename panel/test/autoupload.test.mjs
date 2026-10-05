// Otomatik ürün gönderimi: kabul edilen / işlenen ürün tekrar gönderilmez; reddedilen ürün düzeltilince 1 saat, düzeltilmezse 24 saat sonra yeniden denenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run } from '../src/db.js';
import { sentFilter } from '../src/catalog.js';

test('otomatik gönderimde atlanacak ürünler', async () => {
  const db = d1();
  await init(db);
  const now = Date.now(), H = 3600e3;
  const U = (status, items, ago) => run(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at) VALUES ('hepsiburada', 'T', ?, ?, 'x', ?)", status, JSON.stringify(items), now - ago);
  await U('done', [{ id: 1, ok: true }, { id: 2, ok: false }, { id: 3, ok: false }, { id: 6, ok: false }], 2 * H);
  await U('sent', [{ id: 4 }], 0.5 * H);
  await U('error', [{ id: 5 }], 30 * H);
  await U('done', [{ id: 6, ok: true }], H); // önce hata, sonra kabul
  const skip = await sentFilter(db, 'hepsiburada');
  assert.equal(skip({ id: 1 }), true, 'kabul edilen tekrar gönderilmez');
  assert.equal(skip({ id: 2, updated_at: now - 3 * H }), true, 'düzeltilmeyen hata 24 saat beklenir');
  assert.equal(skip({ id: 3, updated_at: now - H }), false, 'gönderimden sonra düzeltilen ürün 1 saat sonra yeniden denenir');
  assert.equal(skip({ id: 4 }), true, 'kanalın işlediği ürün beklenir');
  assert.equal(skip({ id: 5, updated_at: 0 }), false, 'isteği reddedilen gönderim 24 saat sonra yeniden denenir');
  assert.equal(skip({ id: 6 }), true, 'sonradan kabul edilen ürün tekrar gönderilmez');
  assert.equal(skip({ id: 7 }), false, 'hiç gönderilmemiş ürün gönderilir');
});
