// Büyük ölçekli toplu işlemler: alt istek sınırı (1000 / istek) ve kalıcı ilerleme. Fiyat gönderiminde kanal başına sıra (kapalı
// kanalın bekleyen fiyatları diğerlerini tıkamaz), gönderim sürerken değişen fiyat kaybolmaz, ilan başına istek atan kanal sınırlı
// parçalarla ilerler, iade / soru sayfaları senkronlar arasında devam eder, geçmiş aktarımı eşleştirme haritasını bir kez okur,
// toplu sipariş / etiket uçları fazlasını sessizce atlamaz, Excel yüklemesinde stok ve hareket kaydı aynı işlemde kalır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all, setSetting, getRaw } from '../src/db.js';
import { resetChannels, getChannels } from '../src/channels/index.js';
import { pushStocks, pushPrices, pushCap, syncAll } from '../src/sync.js';
import { syncClaims } from '../src/claims.js';
import { syncQuestions } from '../src/questions.js';
import { createJob, runJobs } from '../src/backfill.js';
import { bulkUpdate } from '../src/bulk.js';
import { handle } from '../src/handler.js';

async function seed(db, n, chans, { stock = 7, pushed = 100, dirty = 0 } = {}) {
  let st = [];
  for (let i = 1; i <= n; i++) {
    st.push(db.prepare('INSERT INTO products (id, sku, name, stock, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, 0)').bind(i, 'SKU-' + i, 'P' + i, stock));
    for (const c of chans) st.push(db.prepare('INSERT INTO listings (channel, remote_id, product_id, sku, pushed_stock, price, price_dirty) VALUES (?, ?, ?, ?, ?, 55, ?)').bind(c, `${c}-${i}`, i, 'SKU-' + i, pushed, dirty));
    if (st.length >= 900) { await db.batch(st); st = []; }
  }
  if (st.length) await db.batch(st);
}
async function channels(env, db, on) {
  const list = await getChannels(env, db);
  for (const c of list) c.enabled = on.includes(c.id);
  return Object.fromEntries(list.filter((c) => on.includes(c.id)).map((c) => [c.id, c]));
}

test('fiyat: kapalı kanalın bekleyen 2500 fiyatı açık kanalların gönderimini tıkamaz (kanal başına sorgu)', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  // Önce eklenen (rowid sırasında başta) kapalı kanal ilanları: eski tek "LIMIT 2000" sorgusu yalnız bunları alıyordu
  let st = [];
  for (let i = 1; i <= 2500; i++) st.push(db.prepare("INSERT INTO listings (channel, remote_id, price, price_dirty) VALUES ('n11', ?, 9, 1)").bind('n' + i));
  for (let i = 0; i < st.length; i += 900) await db.batch(st.slice(i, i + 900));
  await seed(db, 50, ['trendyol'], { dirty: 1 });
  const ch = await channels(env, db, ['trendyol']);
  let got = 0;
  ch.trendyol.pushStatus = null;
  ch.trendyol.pushPrice = async (items) => { got += items.length; };
  const r = await pushPrices(env, db);
  assert.equal(r.trendyol, 50);
  assert.equal(got, 50);
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM listings WHERE channel = 'trendyol' AND price_dirty = 1")).n, 0);
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM listings WHERE channel = 'n11' AND price_dirty = 1")).n, 2500, 'kapalı kanalın fiyatları bekler');
  resetChannels();
});

test('fiyat: gönderim sürerken değişen fiyat "gönderildi" sayılmaz, sonraki gönderimde yeni fiyat gider', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  await seed(db, 3, ['trendyol'], { dirty: 1 });
  const ch = await channels(env, db, ['trendyol']);
  const sent = [];
  ch.trendyol.pushStatus = null;
  ch.trendyol.pushPrice = async (items) => {
    sent.push(...items.map((x) => `${x.remoteId}=${x.price}`));
    // Kanal isteği beklenirken kullanıcı fiyatı değiştirir
    if (sent.length === 3) await run(db, "UPDATE listings SET price = 77, price_dirty = 1 WHERE remote_id = 'trendyol-2'");
  };
  await pushPrices(env, db);
  const l = await first(db, "SELECT price, price_dirty FROM listings WHERE remote_id = 'trendyol-2'");
  assert.equal(l.price, 77); assert.equal(l.price_dirty, 1, 'yeni fiyat bekliyor');
  assert.equal((await first(db, "SELECT price_dirty FROM listings WHERE remote_id = 'trendyol-1'")).price_dirty, 0);
  await pushPrices(env, db);
  assert.equal(sent.at(-1), 'trendyol-2=77');
  assert.equal((await first(db, "SELECT price_dirty FROM listings WHERE remote_id = 'trendyol-2'")).price_dirty, 0);
  resetChannels();
});

test('stok: ilan başına istek atan kanal (Amazon) sınırlı parçalarla ilerler; hata veren parça sonraki turda sona kalır', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const N = 1000;
  await seed(db, N, ['amazon', 'trendyol']);
  await setSetting(db, 'stock_sync', true);
  const ch = await channels(env, db, ['amazon', 'trendyol']);
  // Alt istek sayacı: Amazon ilan başına 1, Trendyol 1000 ilan başına 1 istek; 1000'i aşan istek hata verir (Workers)
  let sub = 0, fail = true;
  const use = (n) => { sub += n; if (sub > 1000) throw new Error('Too many subrequests'); };
  ch.amazon.pushStock = async (items) => { for (const x of items) { use(1); if (fail && x === items[items.length - 1]) throw new Error('HTTP 429'); } };
  ch.trendyol.pushStatus = null;
  ch.trendyol.pushStock = async (items) => { use(Math.ceil(items.length / 1000)); };
  const cap = pushCap('stock', 'amazon');
  assert.ok(cap <= 300, 'Amazon turu alt istek sınırının çok altında');
  const r1 = await pushStocks(env, db);
  assert.ok(sub <= 1000, `alt istek: ${sub}`);
  assert.match(String(r1.amazon), /hata: HTTP 429/);
  assert.equal(r1.trendyol, N);
  const failed = new Set((await all(db, "SELECT remote_id FROM listings WHERE channel = 'amazon' AND error IS NOT NULL")).map((x) => x.remote_id));
  assert.equal(failed.size, cap);
  // Sonraki tur: hatasız bekleyen ilanlar önce (aynı parça yeniden denenip kalanlar hiç gönderilmeden kalmaz)
  sub = 0; fail = false;
  let picked = [];
  const orig = ch.amazon.pushStock;
  ch.amazon.pushStock = async (items) => { picked = items.map((x) => x.remoteId); return orig(items); };
  await pushStocks(env, db);
  assert.equal(picked.length, cap);
  assert.ok(picked.every((id) => !failed.has(id)), 'önce hatasız ilanlar');
  // Tümü sonunda gönderilir (değer mutlak: tekrar gönderim çift etki yapmaz)
  for (let i = 0; i < Math.ceil(N / cap) + 1; i++) { sub = 0; await pushStocks(env, db); }
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM listings WHERE channel = 'amazon' AND pushed_stock != 7")).n, 0);
  resetChannels();
});

test('iade talepleri ve sorular: sayfa sınırını aşan kayıtlar sonraki senkronlarda alınır', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const ch = (await channels(env, db, ['trendyol'])).trendyol;
  const now = Date.now();
  const claims = Array.from({ length: 2200 }, (_, i) => ({ remoteId: 'C' + i, orderNumber: 'N' + i, claimedAt: now - i * 1000, status: 'waiting', lines: [] }));
  const qs = Array.from({ length: 3200 }, (_, i) => ({ remoteId: 'Q' + i, text: 'soru', askedAt: now - i * 1000, status: 'waiting' }));
  let calls = 0, windows = new Set();
  const pager = (arr) => async ({ since, until, page, size }) => { calls++; windows.add(`${since}-${until}`); return { items: arr.slice(page * size, page * size + size), hasNext: (page + 1) * size < arr.length }; };
  ch.claims = pager(claims); ch.questions = pager(qs);
  for (let i = 0; i < 3; i++) {
    calls = 0;
    await syncClaims(env, db, {});
    assert.ok(calls <= 20, 'senkron başına en fazla 20 sayfa');
    calls = 0;
    await syncQuestions(env, db, {});
    assert.ok(calls <= 30, 'senkron başına en fazla 30 sayfa');
  }
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM claims')).n, 2200);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM questions')).n, 3200);
  assert.equal(await getRaw(db, 'claims_page:trendyol'), null, 'tamamlanınca baştan başlar');
  assert.equal(await getRaw(db, 'questions_page:trendyol'), null);
  // İade talebi siparişe sipariş numarası diziniyle bağlanır (kanalın tüm siparişleri taranmaz)
  const plan = (await db.prepare('EXPLAIN QUERY PLAN SELECT id FROM orders WHERE channel = ? AND order_number = ? LIMIT 1').bind('trendyol', 'N1').all()).results.map((x) => x.detail).join(' ');
  assert.match(plan, /orders_number/);
  resetChannels();
});

test('geçmiş aktarımı: ürün eşleştirme haritası çalıştırma başına bir kez okunur', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  await seed(db, 20, ['trendyol']);
  const ch = (await channels(env, db, ['trendyol'])).trendyol;
  const D = 864e5, now = Date.now();
  ch.fetchOrders = async (from, to) => (from < now - 60 * D ? [] : [{ remoteId: 'R' + from, orderNumber: 'N' + from, status: 'delivered', orderedAt: from + 1, total: 1, items: [{ lineId: '1', sku: 'SKU-1', quantity: 1, total: 1 }] }]);
  await createJob(db, 'trendyol', now - 70 * D, now);
  let maps = 0;
  const prep = db.prepare;
  db.prepare = (sql) => { if (/SELECT id, sku, barcode FROM products/.test(sql)) maps++; return prep(sql); };
  const r = await runJobs(env, db, { budgetMs: 20000 });
  db.prepare = prep;
  assert.equal(r.trendyol.left, 0);
  assert.equal(maps, 1);
  const n = (await first(db, 'SELECT COUNT(*) AS n FROM orders')).n;
  assert.ok(n >= 8);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM order_items WHERE product_id = 1')).n, n, 'satırlar ürüne bağlandı');
  resetChannels();
});

test('tek senkronda 3000 yeni sipariş: tekrar senkronda çift kayıt ve çift stok düşümü yok', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  await seed(db, 100, ['trendyol'], { stock: 1000, pushed: 1000 });
  await setSetting(db, 'stock_sync', true); await setSetting(db, 'stock_since', 1);
  const ch = (await channels(env, db, ['trendyol'])).trendyol;
  ch.fetchListings = null; ch.questions = null; ch.claims = null; ch.pushStatus = null;
  ch.pushStock = async () => {}; ch.pushPrice = async () => {};
  const now = Date.now();
  await setSetting(db, 'cursor:trendyol', now - 3600e3);
  const orders = Array.from({ length: 3000 }, (_, i) => ({ remoteId: 'R' + i, orderNumber: 'N' + i, status: 'new', remoteStatus: 'Created', orderedAt: now - i * 1000, total: 1,
    items: [{ lineId: '1', sku: 'SKU-' + (1 + (i % 100)), quantity: 1, total: 1, remoteKey: 'trendyol-' + (1 + (i % 100)) }], packages: [{ remoteId: 'PK' + i, status: 'open', remoteStatus: 'Created', items: [] }] }));
  // İlk denemede kayıt yarıda kesilir (veritabanı hatası): imleç ilerlemez, sonraki senkron kalanı tamamlar
  let calls = 0;
  const batch = db.batch.bind(db);
  db.batch = async (st) => { if (++calls === 40) throw new Error('D1 geçici hata'); return batch(st); };
  ch.fetchOrders = async () => orders;
  const r1 = await syncAll(env, db, { only: ['trendyol'] });
  db.batch = batch;
  assert.match(String(r1.channels.trendyol), /hata/);
  assert.equal(await getRaw(db, 'cursor:trendyol'), now - 3600e3, 'imleç ilerlemedi');
  await syncAll(env, db, { only: ['trendyol'] });
  await syncAll(env, db, { only: ['trendyol'] });
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM orders')).n, 3000);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM packages')).n, 3000);
  assert.equal((await first(db, 'SELECT SUM(1000 - stock) AS n FROM products')).n, 3000, 'her sipariş stoğu bir kez düşer');
  resetChannels();
});

test('toplu uçlar: 100\'den fazla sipariş "rest" ile döner, 300\'den fazla etiket işaretlenir', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { PANEL_PASSWORD: 'bulk-pass-1', PANEL_SECRET: 's'.repeat(32) };
  const ctx = { waitUntil() {} };
  const login = await handle(new Request('https://b.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.PANEL_PASSWORD }) }), env, ctx, db);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = async (p, b) => (await handle(new Request('https://b.test/api/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(b) }), env, ctx, db)).json();
  const r = await post('orders-bulk', { ids: Array.from({ length: 150 }, (_, i) => 'yok:' + i), action: 'accept' });
  assert.equal(r.rest.length, 50);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /50 sipariş işlenmedi/.test(e)));
  let st = [];
  for (let i = 1; i <= 400; i++) {
    st.push(db.prepare("INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, updated_at, total) VALUES (?, 'trendyol', ?, ?, 'processing', 0, 0, 1)").bind('trendyol:' + i, String(i), 'N' + i));
    st.push(db.prepare("INSERT INTO packages (id, order_id, no, items, status, created_at) VALUES (?, ?, 1, '[]', 'open', 0)").bind(i, 'trendyol:' + i));
  }
  for (let i = 0; i < st.length; i += 400) await db.batch(st.slice(i, i + 400));
  const m = await post('labels/mark', { kind: 'printed', items: Array.from({ length: 400 }, (_, i) => ({ pkgId: i + 1, orderId: 'trendyol:' + (i + 1) })) });
  assert.equal(m.count, 400);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM packages WHERE label_prints = 1')).n, 400);
  assert.equal((await first(db, "SELECT COUNT(*) AS n FROM order_events WHERE action = 'label-printed'")).n, 400);
  resetChannels();
});

test('Excel: yükleme yarıda kesilse de stok ve stok hareketi birlikte yazılır; yeniden yüklemede kalanlar uygulanır', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  await seed(db, 300, []);
  await setSetting(db, 'stock_sync', true);
  // İlk satırda yalnız desi (tek yazım): eski sürümde stok + hareket çiftleri 90'lık parça sınırında bölünüyordu
  const rows = Array.from({ length: 300 }, (_, i) => ({ SKU: 'SKU-' + (i + 1), Stok: String(20 + i), Desi: i === 0 ? '3' : '' }));
  let calls = 0;
  const batch = db.batch.bind(db);
  db.batch = async (st) => { if (++calls === 2) throw new Error('D1 geçici hata'); return batch(st); };
  await assert.rejects(bulkUpdate(env, db, rows, { dry: false }));
  db.batch = batch;
  const changed = (await first(db, 'SELECT COUNT(*) AS n FROM products WHERE stock != 7')).n;
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM stock_moves')).n, changed, 'her stok değişikliğinin hareket kaydı var');
  const again = await bulkUpdate(env, db, rows, { dry: false });
  assert.equal(again.counts.Stok, 300 - changed);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM products WHERE stock != 7')).n, 300);
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM stock_moves')).n, 300);
  resetChannels();
});
