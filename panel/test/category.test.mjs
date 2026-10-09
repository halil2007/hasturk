// Kategori yolu: farklı ayırıcı / harfle yazılmış aynı kategori tek biçimde birleşir; ürün kaydında biçim düzeltilir; öneri listesi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { normCat, catKey } from '../public/catpath.js';
import { mergeCategories } from '../src/sync.js';
import worker from '../src/index.js';

test('kategori yolu biçimi', () => {
  assert.equal(normCat('Bahçe > Tohum>  Sebze  Tohumu'), 'Bahçe › Tohum › Sebze Tohumu');
  assert.equal(normCat('Bahçe»Tohum | Çiçek'), 'Bahçe › Tohum › Çiçek');
  assert.equal(normCat('Ev/Bahçe > Saksı'), 'Ev/Bahçe › Saksı', '"/" ayırıcı değildir');
  assert.equal(normCat(' > Bahçe > '), 'Bahçe');
  assert.equal(catKey('BAHÇE › TOHUM'), catKey('bahçe > tohum'));
});

test('kategoriler birleşir; ürün kaydında düzeltilir; öneri listesi', async () => {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 'sir', DB: d1() };
  await init(env.DB);
  const ins = (id, c) => env.DB.prepare('INSERT INTO products (id, name, category, stock, active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 0, 0)').bind(id, 'Ürün ' + id, c).run();
  await ins(1, 'Bahçe › Tohum'); await ins(2, 'Bahçe > Tohum'); await ins(3, 'bahçe › tohum'); await ins(4, 'Bahçe › Tohum'); await ins(5, 'Saksı');
  assert.equal(await mergeCategories(env.DB), 2);
  const cats = (await env.DB.prepare('SELECT DISTINCT category FROM products ORDER BY category').all()).results.map((r) => r.category);
  assert.deepEqual(cats, ['Bahçe › Tohum', 'Saksı']);
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  const r = await call('products', { method: 'POST', body: JSON.stringify({ name: 'Yeni', category: 'Bahçe > Tohum > Çiçek' }) });
  assert.equal((await env.DB.prepare('SELECT category FROM products WHERE id = ?').bind(r.id || r.product?.id).first()).category, 'Bahçe › Tohum › Çiçek');
  const list = await call('products/categories');
  assert.deepEqual(list.map((x) => [x.name, x.n]), [['Bahçe › Tohum', 4], ['Bahçe › Tohum › Çiçek', 1], ['Saksı', 1]]);
});
