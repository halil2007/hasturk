// Eşleştirme, kanala özel stok, geçmiş sipariş aktarımı, kullanıcılar ve örnek veri temizliği
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, first, all } from '../src/db.js';
import { saveOrders, applyStock, pushStocks, purgeDemo } from '../src/sync.js';
import { autoMatch, suggestions, similarity, quantities } from '../src/match.js';
import { createJob, runJobs } from '../src/backfill.js';
import worker from '../src/index.js';

async function db0() {
  const db = d1();
  await init(db);
  return db;
}
const L = (db, ch, id, o = {}) => db.prepare('INSERT INTO listings (channel, remote_id, sku, barcode, name, variant_name, remote_stock) VALUES (?, ?, ?, ?, ?, ?, ?)')
  .bind(ch, id, o.sku ?? '', o.barcode ?? '', o.name ?? '', o.variant ?? null, o.stock ?? 0).run();

test('eşleştirme: ölçü ve kelime benzerliği puanı', () => {
  assert.deepEqual([...quantities('Gübre 5 Kg')], ['5kg']);
  assert.deepEqual([...quantities('Gübre 5000 gr')], ['5kg']);
  const same = similarity({ name: 'Organik Solucan Gübresi 5 Kg' }, { name: 'Solucan Gübresi Organik - 5 kg' });
  const diff = similarity({ name: 'Organik Solucan Gübresi 5 Kg' }, { name: 'Organik Solucan Gübresi 10 Kg' });
  assert.ok(same.score >= 70, 'aynı ürün yüksek puan almalı: ' + same.score);
  assert.ok(diff.score < 45, 'farklı ölçü düşük puan almalı: ' + diff.score);
});

test('eşleştirme: yalnızca kesin olanlar otomatik bağlanır, şüpheliler öneriye düşer', async () => {
  const db = await db0();
  // ikas (ana katalog): bir ürünün iki varyantı
  await L(db, 'ikas1', 'v5', { sku: 'SG-5', barcode: '8690000000051', name: 'Solucan Gübresi - 5 Kg', variant: '5 Kg', stock: 7 });
  await L(db, 'ikas1', 'v10', { sku: 'SG-10', barcode: '8690000000105', name: 'Solucan Gübresi - 10 Kg', variant: '10 Kg', stock: 3 });
  // Trendyol: varyantlar ayrı ürün; biri barkodla, biri SKU ile, biri çelişkili, biri sadece adla
  await L(db, 'trendyol', '8690000000051', { sku: 'X-1', barcode: '8690000000051', name: 'Solucan Gübresi 5 Kg' });
  await L(db, 'trendyol', 't10', { sku: 'sg-10', barcode: '', name: 'Solucan Gübresi 10 Kg' });
  await L(db, 'trendyol', 'tc', { sku: 'SG-5', barcode: '8690000000105', name: 'Çelişkili' });
  await L(db, 'hepsiburada', 'hb1', { sku: 'HB-77', barcode: '', name: 'Organik Solucan Gübresi 5 kg' });
  const r = await autoMatch(db, { catalog: ['ikas1'] });
  assert.equal(r.created, 2, 'ikas varyantları ürün olarak açılır');
  const get = async (id) => first(db, 'SELECT l.product_id, l.match, p.variant_name, p.stock FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE remote_id = ?', id);
  const v5 = await get('v5'), ty5 = await get('8690000000051'), ty10 = await get('t10');
  assert.equal(v5.match, 'new'); assert.equal(v5.variant_name, '5 Kg'); assert.equal(v5.stock, 7);
  assert.equal(ty5.product_id, v5.product_id); assert.equal(ty5.match, 'barcode');
  assert.equal(ty10.product_id, (await get('v10')).product_id); assert.equal(ty10.match, 'sku');
  assert.equal((await get('tc')).product_id, null, 'barkod ve SKU farklı ürünleri gösteriyorsa bağlanmaz');
  assert.equal((await get('hb1')).product_id, null, 'sadece ad benzerliğiyle otomatik bağlanmaz');
  const s = await suggestions(db, { channel: 'hepsiburada' });
  assert.equal(s.length, 1);
  assert.equal(s[0].candidates[0].product_id, v5.product_id, '5 kg ürün ilk öneri olmalı');
  // Tekrar çalıştırmak yeni ürün açmaz, var olan eşleşmeyi bozmaz
  const again = await autoMatch(db, { catalog: ['ikas1'] });
  assert.deepEqual(again, { linked: 0, created: 0 });
  assert.equal((await get('8690000000051')).product_id, v5.product_id);
});

test('kanala özel stok: ortak / en fazla / ayrılmış; ayrılmış adet o kanalın satışıyla azalır', async () => {
  const db = await db0();
  await db.prepare("INSERT INTO products (id, sku, name, stock, created_at, updated_at) VALUES (1, 'A', 'Ürün A', 20, 0, 0)").run();
  await db.prepare(`INSERT INTO listings (channel, remote_id, product_id, sku, pushed_stock, stock_mode, stock_value) VALUES
    ('ikas1', 'i1', 1, 'A', 0, 'shared', NULL), ('trendyol', 't1', 1, 'A', 0, 'own', 10), ('hepsiburada', 'h1', 1, 'A', 0, 'limit', 5)`).run();
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  await pushStocks({ DEMO: '1' }, db);
  const pushed = async () => Object.fromEntries((await all(db, 'SELECT channel, pushed_stock FROM listings')).map((r) => [r.channel, r.pushed_stock]));
  assert.deepEqual(await pushed(), { ikas1: 20, trendyol: 10, hepsiburada: 5 });
  const o = { remoteId: 'T9', orderNumber: 'T9', orderedAt: 5000, status: 'new', customer: 'x', address: {}, total: 30,
    items: [{ lineId: 'l1', sku: 'A', name: 'Ürün A', quantity: 3, unitPrice: 10, total: 30, remoteKey: 't1' }] };
  await applyStock(db, await saveOrders(db, 'trendyol', [o]));
  await applyStock(db, await saveOrders(db, 'trendyol', [o]));
  await pushStocks({ DEMO: '1' }, db);
  assert.deepEqual(await pushed(), { ikas1: 17, trendyol: 7, hepsiburada: 5 }, 'satış bir kez düşer; ayrılmış adet de azalır');
});

test('geçmiş sipariş aktarımı parça parça ilerler, tekrar çalışınca çift kayıt olmaz', async () => {
  const db = await db0();
  const env = { DEMO: '1', DB: db };
  const now = Date.now();
  await createJob(db, 'trendyol', now - 20 * 864e5, now);
  const r = await runJobs(env, db, { budgetMs: 10000 });
  assert.ok(r.trendyol.done >= 0);
  const job = await first(db, "SELECT * FROM jobs WHERE id = 'backfill:trendyol'");
  assert.equal(job.status, 'done');
  const n1 = (await first(db, "SELECT COUNT(*) AS n FROM orders WHERE channel = 'trendyol'")).n;
  await createJob(db, 'trendyol', now - 20 * 864e5, now);
  await runJobs(env, db, { budgetMs: 10000 });
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM orders WHERE channel = 'trendyol'")).n, n1, 'aynı siparişler tekrar eklenmez');
});

test('örnek (demo) siparişler temizlenir, gerçek siparişler kalır', async () => {
  const db = await db0();
  await saveOrders(db, 'ikas1', [{ remoteId: 'D1', orderNumber: 'D1', orderedAt: 1, status: 'new', customer: 'x', address: {}, total: 1, items: [], demo: true }]);
  await saveOrders(db, 'ikas1', [{ remoteId: 'R1', orderNumber: 'R1', orderedAt: 1, status: 'new', customer: 'y', address: {}, total: 1, items: [] }]);
  await purgeDemo(db);
  assert.deepEqual((await all(db, 'SELECT order_number FROM orders')).map((r) => r.order_number), ['R1']);
});

test('kullanıcılar: yönetici personel ekler; personel yönetici bölümlerine giremez', async () => {
  const env = { PANEL_PASSWORD: 'ana-sifre-1', DB: d1() };
  const jar = {};
  const call = async (who, path, method = 'GET', body) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: jar[who] || '' }, body: body && JSON.stringify(body) }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) jar[who] = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await call('admin', 'login', 'POST', { username: '', password: 'ana-sifre-1' })).status, 200);
  assert.equal((await call('admin', 'users', 'POST', { username: 'ali', name: 'Ali Veli', password: 'kisa' })).status, 400, 'kısa şifre reddedilir');
  assert.equal((await call('admin', 'users', 'POST', { username: 'ali', name: 'Ali Veli', password: 'personel-123', role: 'staff' })).status, 200);
  const users = (await call('admin', 'users')).body;
  assert.equal(users.length, 1);
  assert.ok(!('pass' in users[0]), 'şifre özeti dönmez');
  assert.equal((await call('ali', 'login', 'POST', { username: 'ali', password: 'yanlis-sifre' })).status, 401);
  const lg = await call('ali', 'login', 'POST', { username: 'ALI', password: 'personel-123' });
  assert.equal(lg.status, 200);
  assert.equal((await call('ali', 'me')).body.user.role, 'staff');
  assert.equal((await call('ali', 'orders')).status, 200);
  assert.equal((await call('ali', 'integrations')).status, 403);
  assert.equal((await call('ali', 'users')).status, 403);
  assert.equal((await call('ali', 'settings', 'PUT', { low_stock: 3 })).status, 403);
  // Pasif yapılan kullanıcının oturumu düşer
  await call('admin', `users/${users[0].id}`, 'PUT', { name: 'Ali Veli', role: 'staff', active: false });
  assert.equal((await call('ali', 'orders')).status, 401);
  // Kendi şifresini değiştirince eski oturum geçersiz olur
  await call('admin', `users/${users[0].id}`, 'PUT', { name: 'Ali Veli', role: 'staff', active: true });
  await call('ali', 'login', 'POST', { username: 'ali', password: 'personel-123' });
  assert.equal((await call('ali', 'me/password', 'POST', { old: 'personel-123', new: 'yeni-sifre-456' })).status, 200);
  assert.equal((await call('ali', 'orders')).status, 401);
  assert.equal((await call('ali', 'login', 'POST', { username: 'ali', password: 'yeni-sifre-456' })).status, 200);
});
