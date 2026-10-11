// Excel'den yeni ürün ekleme: eşleşmeyen satır (Ürün adı dolu) yeni ürün olur; güncelleme + ekleme aynı dosyada, dosyada tekrarlanan
// SKU, Türkçe sayı biçimi, yetkiler (ürün ekleme / stok), örnek dosya ve büyük dosya (5.000 yeni ürün).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, first, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { bulkUpdate, exportProducts, templateCsv } from '../src/bulk.js';
import { api } from '../src/api.js';
import { csvRows } from '../public/sheetread.js';

const setup = async () => {
  const db = d1(); await init(db); resetChannels();
  await setSetting(db, 'stock_sync', true);
  return { db, env: { DEMO: '1' } };
};
// Dosya okuyucu (sheetread) gibi: her satırda tüm başlıklar
const sheet = (list) => { const h = [...new Set(list.flatMap(Object.keys))]; return list.map((r) => Object.fromEntries(h.map((k) => [k, r[k] ?? '']))); };
const P = (db, id, sku, name, stock = 5) => run(db, 'INSERT INTO products (id, sku, barcode, name, sale_price, purchase_price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, 100, 10, ?, 0, 0)', id, sku, 'BC' + id, name, stock);

test('yeni ürün: tüm sütunlar, ilk stok hareketi, varyant grubu', async () => {
  const { db, env } = await setup();
  const rows = [
    { ID: '', SKU: 'DOM-5', Barkod: '8690001', 'Ürün adı': 'Domates tohumu', Varyant: '5 kg', Durum: 'Aktif', 'Alış fiyatı': '1.234,50', 'Satış fiyatı': '2.000', Stok: '12', 'Kritik stok': '3', Desi: '1,5', KDV: '10',
      Marka: 'Hastürk', Kategori: 'Bahçe › Tohum', Görsel: 'https://ornek.com/a.jpg https://ornek.com/b.jpg', Açıklama: 'Açıklama' },
    { ID: '', SKU: '', Barkod: '', 'Ürün adı': 'Toprak', Varyant: '', Durum: 'Pasif', 'Alış fiyatı': '', 'Satış fiyatı': '49,90', Stok: '', 'Kritik stok': '', Desi: '', KDV: '', Marka: '', Kategori: '', Görsel: '', Açıklama: '' },
  ];
  const pv = await bulkUpdate(env, db, rows, { dry: true });
  assert.equal(pv.created, 2); assert.equal(pv.updated, 0); assert.equal(pv.errorRows, 0);
  assert.equal(pv.newPreview[0].name, 'Domates tohumu · 5 kg');
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products')).n, 0, 'önizleme yazmaz');
  const r = await bulkUpdate(env, db, rows, { dry: false, user: 'Test' });
  assert.equal(r.applied, true); assert.equal(r.created, 2); assert.equal(r.stock, true);
  const d = await first(db, "SELECT * FROM products WHERE sku = 'DOM-5'");
  assert.equal(d.name, 'Domates tohumu 5 kg'); assert.equal(d.group_name, 'Domates tohumu'); assert.equal(d.variant_name, '5 kg');
  assert.equal(d.purchase_price, 1234.5); assert.equal(d.sale_price, 2000); assert.equal(d.stock, 12); assert.equal(d.critical_stock, 3);
  assert.equal(d.desi, 1.5); assert.equal(d.vat, 10); assert.equal(d.brand, 'Hastürk'); assert.equal(d.category, 'Bahçe › Tohum');
  assert.equal(d.image, 'https://ornek.com/a.jpg'); assert.deepEqual(JSON.parse(d.images), ['https://ornek.com/a.jpg', 'https://ornek.com/b.jpg']);
  assert.equal(d.description, 'Açıklama'); assert.equal(d.active, 1);
  const mv = await all(db, 'SELECT * FROM stock_moves');
  assert.equal(mv.length, 1);
  assert.deepEqual([mv[0].product_id, mv[0].delta, mv[0].stock_after, mv[0].reason, mv[0].user], [d.id, 12, 12, 'İlk stok (Excel)', 'Test']);
  const t = await first(db, "SELECT * FROM products WHERE name = 'Toprak'");
  assert.equal(t.sku, null); assert.equal(t.active, 0); assert.equal(t.sale_price, 49.9); assert.equal(t.vat, 20, 'boş KDV: varsayılan'); assert.equal(t.stock, 0);
  // Dışa aktarılan dosya yeniden yüklenince yeni ürün açılmaz (ID ile eşleşir)
  const [head, ...data] = csvRows(await exportProducts(env, db));
  const again = await bulkUpdate(env, db, data.map((x) => Object.fromEntries(head.map((h, i) => [h, x[i]]))), { dry: true });
  assert.equal(again.created, 0); assert.equal(again.changes, 0); assert.equal(again.matched, 2);
  resetChannels();
});

test('güncelleme + ekleme aynı dosyada; bulunamayan ID / SKU ad varsa yeni ürün, yoksa hata', async () => {
  const { db, env } = await setup();
  await P(db, 1, 'A1', 'Gübre'); await P(db, 2, 'B2', 'Perlit');
  const rows = [
    { ID: '1', SKU: 'A1', 'Ürün adı': 'Gübre', 'Satış fiyatı': '110', Stok: '' },
    { ID: '', SKU: 'b2', 'Ürün adı': 'Perlit', 'Satış fiyatı': '', Stok: '9' },
    { ID: '', SKU: 'YENI-1', 'Ürün adı': 'Yeni ürün', 'Satış fiyatı': '75,5', Stok: '4' },
    { ID: '999', SKU: '', 'Ürün adı': 'Silinmiş ürün', 'Satış fiyatı': '10', Stok: '' },
    { ID: '', SKU: 'YOK', 'Ürün adı': '', 'Satış fiyatı': '10', Stok: '' },
    { ID: '', SKU: '', 'Ürün adı': '', 'Satış fiyatı': '', Stok: '' },
  ];
  const pv = await bulkUpdate(env, db, rows, { dry: true });
  assert.equal(pv.updated, 2); assert.equal(pv.created, 2); assert.equal(pv.errorRows, 1);
  assert.ok(pv.skipped.some((x) => x.line === 6 && /bulunamadı \(YOK\).*Ürün adı/.test(x.reason)));
  const r = await bulkUpdate(env, db, rows, { dry: false });
  assert.equal(r.created, 2);
  assert.equal((await first(db, 'SELECT sale_price FROM products WHERE id = 1')).sale_price, 110);
  assert.equal((await first(db, 'SELECT stock FROM products WHERE id = 2')).stock, 9);
  assert.equal((await first(db, "SELECT stock FROM products WHERE sku = 'YENI-1'")).stock, 4);
  assert.ok(await first(db, "SELECT id FROM products WHERE name = 'Silinmiş ürün' AND id != 999"));
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products')).n, 4);
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM stock_moves WHERE reason = 'İlk stok (Excel)'")).n, 1);
  resetChannels();
});

test('SKU dosyada tekrar (büyük/küçük harf duyarsız), hatalı sayı ve KDV satırı eklenmez; diğerleri eklenir', async () => {
  const { db, env } = await setup();
  const rows = sheet([
    { SKU: 'X-1', 'Ürün adı': 'Bir', 'Satış fiyatı': '10' },
    { SKU: 'x-1', 'Ürün adı': 'İki', 'Satış fiyatı': '20' },
    { SKU: 'X-2', 'Ürün adı': 'Üç', 'Satış fiyatı': 'abc' },
    { SKU: 'X-3', 'Ürün adı': 'Dört', KDV: '18' },
    { SKU: 'X-4', 'Ürün adı': 'Beş', Stok: '-3' },
    { SKU: 'X-5', 'Ürün adı': 'Altı', 'Satış fiyatı': '₺1.250,75' },
  ]);
  const pv = await bulkUpdate(env, db, rows, { dry: true });
  assert.equal(pv.created, 2); assert.equal(pv.errorRows, 4);
  assert.ok(pv.skipped.some((x) => x.line === 3 && /SKU x-1 dosyada 2\. satırda/.test(x.reason)));
  assert.ok(pv.skipped.some((x) => x.line === 4 && /sayı değil/.test(x.reason)));
  assert.ok(pv.skipped.some((x) => x.line === 5 && /KDV/.test(x.reason)));
  assert.ok(pv.skipped.some((x) => x.line === 6 && /sayı değil/.test(x.reason)));
  await bulkUpdate(env, db, rows, { dry: false });
  assert.deepEqual((await all(db, 'SELECT sku, sale_price FROM products ORDER BY sku')).map((p) => [p.sku, p.sale_price]), [['X-1', 10], ['X-5', 1250.75]]);
  resetChannels();
});

test('önizlemeden sonra eklenen aynı SKU: satır atlanır, hata vermez; örnek satır eklenmez', async () => {
  const { db, env } = await setup();
  const rows = sheet([{ SKU: 'K-1', 'Ürün adı': 'Kalem', Stok: '5' }, { SKU: 'ornek-001', 'Ürün adı': 'Örnek ürün (bu satırı silin)' }, { SKU: 'K-2', 'Ürün adı': 'Silgi', Stok: '1' }]);
  const pv = await bulkUpdate(env, db, rows, { dry: true });
  assert.equal(pv.created, 2);
  assert.ok(pv.skipped.some((x) => /örnek satır/.test(x.reason)));
  // Kayıt sırasında (kilit içindeki son kontrolden hemen önce) ürün formundan aynı SKU eklenir
  const prep = db.prepare;
  db.prepare = (sql) => { if (/SELECT sku, barcode FROM products WHERE COALESCE/.test(sql)) db.raw.exec("INSERT INTO products (id, sku, name, created_at, updated_at) VALUES (50, 'k-1', 'Başka kalem', 0, 0)"); return prep(sql); };
  const r = await bulkUpdate(env, db, rows, { dry: false });
  db.prepare = prep;
  assert.equal(r.created, 1);
  assert.ok(r.skipped.some((x) => /K-1 başka üründe/.test(x.reason)));
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM stock_moves WHERE reason = 'İlk stok (Excel)'")).n, 1, 'eklenmeyen ürünün stok hareketi yok');
  resetChannels();
});

test('yetki: ürün düzenleme yetkisi olmadan ekleme yok, stok yetkisi olmadan stok girilemez', async () => {
  const { db, env } = await setup();
  await P(db, 1, 'A1', 'Gübre', 5);
  const rows = sheet([{ SKU: 'A1', 'Ürün adı': 'Gübre', Stok: '8', 'Satış fiyatı': '120' }, { SKU: 'N-1', 'Ürün adı': 'Yeni', Stok: '3' }, { SKU: 'N-2', 'Ürün adı': 'Yeni 2', Stok: '' }]);
  const a = await bulkUpdate(env, db, rows, { dry: true, canCreate: false });
  assert.equal(a.created, 0);
  assert.equal(a.skipped.filter((x) => /ekleme yetkiniz yok/.test(x.reason)).length, 2);
  const b = await bulkUpdate(env, db, rows, { dry: false, canStock: false });
  assert.equal(b.created, 1, 'stoksuz yeni ürün eklenir');
  assert.ok(b.skipped.some((x) => x.line === 2 && /stok değiştirme yetkiniz yok/.test(x.reason)));
  assert.ok(b.skipped.some((x) => x.line === 3 && /stok girme yetkiniz yok/.test(x.reason)));
  const p = await first(db, 'SELECT stock, sale_price FROM products WHERE id = 1');
  assert.deepEqual([p.stock, p.sale_price], [5, 120]);
  // Uç: personel yetkileri (Ürünler: yalnız görüntüleme → 403; Ürünler düzenleme, Stok görüntüleme → stok yazılmaz)
  const ctx = { waitUntil() {} };
  const req = (body) => new Request('https://p.test/api/products/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await assert.rejects(api(req({ rows, dry: true }), env, ctx, db, 'products/bulk', { id: 9, name: 'Personel', role: 'staff', perms: ['products:view'] }), (e) => e.status === 403);
  const r = await (await api(req({ rows: [{ SKU: 'N-3', 'Ürün adı': 'Üç', Stok: '2' }], dry: true }), env, ctx, db, 'products/bulk', { id: 9, name: 'Personel', role: 'staff', perms: ['products', 'stock:view'] })).json();
  assert.equal(r.created, 0);
  assert.ok(r.skipped.some((x) => /stok girme yetkiniz yok/.test(x.reason)));
  resetChannels();
});

test('örnek dosya: dışa aktarmayla aynı başlıklar, örnek satır; yalnız Ürün adı sütunlu dosya da kabul edilir', async () => {
  const { db, env } = await setup();
  const [head, row] = csvRows(templateCsv());
  assert.deepEqual(head.slice(0, 12), ['ID', 'SKU', 'Barkod', 'Ürün adı', 'Varyant', 'Durum', 'Alış fiyatı', 'Satış fiyatı', 'Stok', 'Kritik stok', 'Desi', 'KDV']);
  assert.deepEqual(head.slice(12), ['Marka', 'Kategori', 'Görsel', 'Açıklama']);
  const exp = csvRows(await exportProducts(env, db))[0];
  for (const h of exp.filter((x) => !/^Kontrol/.test(x))) assert.ok(head.includes(h), h);
  const obj = Object.fromEntries(head.map((h, i) => [h, row[i]]));
  const pv = await bulkUpdate(env, db, [obj, { ...obj, SKU: 'GERCEK-1', 'Ürün adı': 'Gerçek ürün' }], { dry: true });
  assert.equal(pv.created, 1, 'örnek satır atlanır, kopyası eklenir');
  const only = await bulkUpdate(env, db, [{ 'Ürün adı': 'Sadece ad' }], { dry: false });
  assert.equal(only.created, 1);
  resetChannels();
});

test('büyük dosya: 5.000 yeni ürün + 1.000 güncelleme tek yüklemede (D1 parça sınırları içinde)', async () => {
  const { db, env } = await setup();
  let st = [];
  for (let i = 1; i <= 1000; i++) { st.push(db.prepare('INSERT INTO products (id, sku, name, stock, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0)').bind(i, 'OLD-' + i, 'Eski ' + i)); if (st.length >= 500) { await db.batch(st); st = []; } }
  if (st.length) await db.batch(st);
  const rows = [
    ...Array.from({ length: 1000 }, (_, i) => ({ SKU: 'OLD-' + (i + 1), 'Ürün adı': 'Eski', Stok: '2', 'Satış fiyatı': '' })),
    ...Array.from({ length: 5000 }, (_, i) => ({ SKU: 'NEW-' + i, 'Ürün adı': 'Yeni ' + i, Stok: String(i % 7), 'Satış fiyatı': `${1 + (i % 50)},90` })),
  ];
  let batches = 0, maxStmts = 0;
  const batch = db.batch.bind(db);
  db.batch = async (s) => { batches++; maxStmts = Math.max(maxStmts, s.length); return batch(s); };
  const t0 = Date.now();
  const pv = await bulkUpdate(env, db, rows, { dry: true });
  assert.equal(pv.created, 5000); assert.equal(pv.updated, 1000);
  const r = await bulkUpdate(env, db, rows, { dry: false });
  db.batch = batch;
  assert.equal(r.created, 5000);
  assert.ok(maxStmts <= 90, `parça: ${maxStmts}`);
  assert.ok(Date.now() - t0 < 60e3);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products')).n, 6000);
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM stock_moves WHERE reason = 'İlk stok (Excel)'")).n, 5000 - Math.ceil(5000 / 7));
  // Her ilk stok hareketi kendi ürününe bağlı ve stokla tutarlı
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM stock_moves m JOIN products p ON p.id = m.product_id WHERE m.reason = 'İlk stok (Excel)' AND p.stock = m.delta AND p.sku LIKE 'NEW-%'")).n, 5000 - Math.ceil(5000 / 7));
  assert.equal((await first(db, "SELECT SUM(stock) AS n FROM products WHERE sku LIKE 'OLD-%'")).n, 2000);
  resetChannels();
});
