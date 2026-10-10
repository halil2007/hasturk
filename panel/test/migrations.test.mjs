// Geçiş listesi: mevcut veritabanında yalnız son kayıttan (schema_n) sonraki geçişler çalışır. Araya eklenen sütun atlanırdı
// ("no such column: carrier_state"); eski listeyle güncellenmiş veritabanı yeni yayında eksik sütunları alır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';

const cols = async (db, t) => (await db.prepare(`PRAGMA table_info(${t})`).all()).results.map((c) => c.name);

test('araya eklenip atlanmış sütunlar sonraki açılışta eklenir', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'mig-')), 'db.sqlite');
  const a = d1(file);
  await init(a);
  const n = JSON.parse((await a.prepare("SELECT v FROM settings WHERE k = 'schema_n'").first()).v);
  // Bozuk yayının bıraktığı durum: sütunlar yok, sayaç 4 geçiş geride (eski liste uzunluğu), sürüm eski
  for (const [t, c] of [['packages', 'carrier_checked_at'], ['packages', 'carrier_state'], ['packages', 'carrier_status'], ['blog_posts', 'ai']]) {
    await a.prepare(`ALTER TABLE ${t} DROP COLUMN ${c}`).run();
  }
  await a.prepare("UPDATE settings SET v = ? WHERE k = 'schema_n'").bind(JSON.stringify(n - 4)).run();
  await a.prepare("UPDATE settings SET v = '\"eski\"' WHERE k = 'schema_v'").run();
  const b = d1(file); // yeni Worker örneği
  await init(b);
  assert.ok((await cols(b, 'packages')).includes('carrier_state'));
  assert.ok((await cols(b, 'packages')).includes('carrier_status'));
  assert.ok((await cols(b, 'packages')).includes('carrier_checked_at'));
  assert.ok((await cols(b, 'blog_posts')).includes('ai'));
  await b.prepare('SELECT carrier_state, carrier_status FROM packages').all();
});

test('sayaç güncelse bile sütunu eksik veritabanı onarılır (sürüm değişince tümü denenir)', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'mig-')), 'db.sqlite');
  const a = d1(file);
  await init(a);
  await a.prepare('ALTER TABLE packages DROP COLUMN carrier_state').run();
  await a.prepare("UPDATE settings SET v = '\"eski\"' WHERE k = 'schema_v'").run();
  const b = d1(file);
  await init(b);
  assert.ok((await cols(b, 'packages')).includes('carrier_state'));
});
