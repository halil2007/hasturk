// Göç listesinin arasına eklenmiş tablolar (deleted_products, ext_sales) o tarihte güncel olan panellerde hiç oluşmamıştı;
// sonraki göç (ext_sales'ten ext_sale_refs'e aktarım) "no such table" ile paneli açılmaz hale getiriyordu. Temel şema bunları her açılışta oluşturur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, TABLES } from '../src/db.js';

test('eksik kalmış tablolar açılışta oluşturulur, panel açılır, kayıtlar korunur', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mig-gap-')), file = join(dir, 'p.db');
  try {
    const a = d1(file); await init(a);
    await run(a, "INSERT INTO products (sku, name, created_at, updated_at) VALUES ('P1', 'Ürün', 1, 1)");
    for (const t of ['ext_sale_refs', 'ext_sales', 'deleted_products', 'carrier_quotes']) await run(a, `DROP TABLE ${t}`);
    // Eski sürümden kalan durum: şema imzası farklı, göç sayacı aktarım adımından önce
    await run(a, "UPDATE settings SET v = '\"eski\"' WHERE k = 'schema_v'");
    const n = (await first(a, "SELECT v FROM settings WHERE k = 'schema_n'")).v;
    await run(a, "UPDATE settings SET v = ? WHERE k = 'schema_n'", String(Number(n) - 12));
    const b = d1(file); await init(b);
    for (const t of ['ext_sales', 'ext_sale_refs', 'deleted_products', 'carrier_quotes']) assert.ok(await first(b, "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", t), t);
    assert.ok(await first(b, "SELECT 1 AS x FROM sqlite_master WHERE type = 'index' AND name = 'ext_sales_src_at'"));
    assert.equal((await first(b, "SELECT name FROM products WHERE sku = 'P1'")).name, 'Ürün');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('tablo listesinde tekrar yok', () => {
  assert.equal(new Set(TABLES).size, TABLES.length);
  assert.ok(TABLES.includes('ext_sales'));
});
