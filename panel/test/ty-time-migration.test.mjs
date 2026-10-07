// Trendyol sipariş saati (orderDate GMT+3) tek seferlik düzeltmesi: eski veritabanında Trendyol siparişleri 3 saat geri alınır,
// başka kanallar değişmez; açılış (init) tekrarlansa da düzeltme ikinci kez uygulanmaz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, all } from '../src/db.js';

test('Trendyol sipariş saati: yalnız bir kez ve yalnız Trendyol mağazalarında 3 saat geri alınır', async () => {
  const db = d1();
  await init(db);
  await run(db, `INSERT INTO orders (id, channel, remote_id, order_number, ordered_at, status, total) VALUES
    ('t1','trendyol','1','1',1000000000000,'new',1), ('t2','trendyol_2','3','3',1000000000000,'new',1), ('h1','hepsiburada','2','2',1000000000000,'new',1)`);
  // Yeni kurulumda düzeltme işareti konur: sonradan gelen (doğru saatli) siparişlere dokunulmaz
  assert.deepEqual((await all(db, 'SELECT ordered_at FROM orders ORDER BY id')).map((r) => r.ordered_at), [1e12, 1e12, 1e12]);
  // Eski yayından kalan veritabanı: işaret yok, şema sürümü farklı → açılışlar tekrarlansa da tek düzeltme
  await db.prepare("DELETE FROM settings WHERE k IN ('schema_v','once:ty_gmt3_1')").run();
  for (let i = 0; i < 3; i++) {
    const { init: again } = await import('../src/db.js?again=' + i);
    await again(db);
    await db.prepare("DELETE FROM settings WHERE k = 'schema_v'").run();
  }
  assert.deepEqual(Object.fromEntries((await all(db, 'SELECT id, ordered_at FROM orders')).map((r) => [r.id, r.ordered_at])), { t1: 1e12 - 10800000, t2: 1e12 - 10800000, h1: 1e12 });
});
