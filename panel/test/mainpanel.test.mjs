// Ana panel kendi nesnesinde (MainPanel, yerel veritabanı): ilk istekte mağaza verisi ana veritabanından taşınır (bu sırada
// "taşınıyor" yanıtı), sonra tüm istekler nesnede; mağaza tabloları yerelde, ortak tablolar (firmalar, hata kayıtları, hız
// ölçümleri …) ana veritabanında; ayar yazımı ana veritabanına da yazılır; senkron nesnede çalışır; taşıma bittikten sonra
// nesne yanıt vermezse eski kopyayla çalışılmaz. Ayrıca sunucu süresi başlığı ve tarayıcı ölçümleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel, MainPanel } from '../src/index.js';
import { perfReport } from '../src/perf.js';
import { mainPerf } from '../src/mainpanel.js';
import { first, all, init } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';

function setup() {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
  return { env, call, J };
}
// Nesneyi bağla: taşıma zamanlayıcısını bitene kadar çalıştır
function attach(env, { broken = false } = {}) {
  const ns = doNamespace(MainPanel, () => env), calls = [];
  env.MAIN = { idFromName: ns.idFromName, get: (id, opts) => { calls.push({ name: id.name, opts }); const o = ns.get(id); return broken ? { fetch: async () => { throw new Error('nesne yok'); } } : o; } };
  const obj = () => ns.get(ns.idFromName('main-local:eeur'));
  const migrate = async () => { for (let i = 0; i < 50; i++) { const st = await obj().ctx.storage.get('mig'); if (st && st.done) return st; await obj().alarm(); } throw new Error('taşıma bitmedi'); };
  return { calls, obj, migrate };
}

test('ana panel: veri yerel veritabanına taşınır; mağaza tabloları yerelde, ortak tablolar ana veritabanında, ayarlar ikisinde', async () => {
  const { env, call, J } = setup();
  // Taşımadan önce (eski düzen): veri ana veritabanında
  assert.equal((await call('login', J({ password: 'x-123456' }))).status, 200);
  assert.equal((await call('products', J({ name: 'Eski ürün', sku: 'ESKI-1', sale_price: 100, stock: 5 }))).status, 200);
  assert.equal((await call('settings', J({ company: { title: 'Hastürk Test' } }, 'PUT'))).status, 200);
  const before = await first(env.DB, "SELECT COUNT(*) AS n FROM products");
  assert.equal(before.n, 1);

  const { calls, obj, migrate } = attach(env);
  // İlk istek: taşınıyor (zamanlayıcı kurulur)
  let r = await call('summary');
  assert.equal(r.status, 503); assert.equal((await r.json()).migrating, true);
  assert.ok(calls.every((c) => c.name === 'main-local:eeur' && c.opts.locationHint === 'eeur'));
  const st = await migrate();
  assert.ok(st.rows > 0);
  assert.ok(await first(env.DB, "SELECT 1 AS x FROM settings WHERE k = 'main_local'"), 'ana veritabanına taşındı işareti');

  // Taşımadan sonra: aynı oturum ve veri nesnede
  r = await call('products?page=1&limit=40');
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).products.map((p) => p.sku), ['ESKI-1']);
  assert.match(r.headers.get('server-timing') || '', /do;desc="yerel"/);
  // Taşıma doğrulaması: tablo başına eski / yeni kayıt sayısı eşit
  const mig = (await (await call('perf?days=1&mig=1')).json()).migration;
  assert.ok(mig && mig.rows > 0 && mig.tables.length > 30);
  for (const t of mig.tables) if (t.table !== 'settings') assert.equal(t.now, t.old, t.table);
  // Yeni ürün yalnız yerelde (ana veritabanındaki eski kopya değişmez)
  assert.equal((await call('products', J({ name: 'Yeni ürün', sku: 'YENI-1', sale_price: 50, stock: 2 }))).status, 200);
  const loc = obj().ctx.storage.sql;
  assert.equal(loc.exec("SELECT COUNT(*) AS n FROM products").toArray()[0].n, 2);
  assert.equal((await first(env.DB, 'SELECT COUNT(*) AS n FROM products')).n, 1);
  // Ayar: yerelde ve ana veritabanında (müşteri panelleri / site oradan okur)
  assert.equal((await call('settings', J({ company: { title: 'Yeni Unvan' } }, 'PUT'))).status, 200);
  assert.match((await first(env.DB, "SELECT v FROM settings WHERE k = 'company'")).v, /Yeni Unvan/);
  assert.match(loc.exec("SELECT v FROM settings WHERE k = 'company'").toArray()[0].v, /Yeni Unvan/);
  // Ortak tablo: hata kaydı ana veritabanına
  await call('errors/report', J({ source: 'client', message: 'deneme hatası' }));
  // Sık açılan sayfalar hatasız
  for (const p of ['summary', 'dashboard', 'orders?status=all&page=1&limit=50', 'packages?state=waiting', 'products?page=1&limit=50&sort=sold', 'stats?range=30', 'finance', 'customers', 'buybox?page=1&limit=50',
    'channels', 'integrations', 'settings', 'notices', 'questions', 'claims', 'match', 'users', 'tenants', 'support', 'errors', 'perf?days=7', 'blog', 'logs', 'fx', 'extapi', 'health/data'])
    assert.ok((await call(p)).status < 500, p);
  // Senkron nesnede (zamanlayıcıdan iletilir)
  await worker.scheduled({ cron: '*/15 * * * *' }, env, { waitUntil: async (p) => p });
});

test('taşıma bittikten sonra nesne yanıt vermezse eski veritabanıyla çalışılmaz; bitmeden okuma eski düzende sürer', async () => {
  const { env, call, J } = setup();
  assert.equal((await call('login', J({ password: 'x-123456' }))).status, 200);
  // Taşıma başlamadan nesne yok: okuma eski düzende (ana veritabanından), yazma reddedilir
  attach(env, { broken: true });
  assert.equal((await call('summary')).status, 200);
  assert.equal((await call('products', J({ name: 'X', sku: 'X-1', sale_price: 1 }))).status, 503);
  // Taşındı işareti varsa okuma da reddedilir (eski kopya gösterilmez)
  await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('main_local', '{\"at\":1}')").run();
  const { edgeDrop } = await import('../src/edgecache.js');
  await edgeDrop('main_local', env.DB);
  assert.equal((await call('summary')).status, 503);
});

test('tarayıcı ölçümleri (sayfa açılışı, istek) ve veritabanı altyapısı Sistem hızı raporunda', async () => {
  const { env, call, J } = setup();
  await call('login', J({ password: 'x-123456' }));
  await call('summary');
  assert.equal((await call('perf/client', J({ pages: { siparisler: [3, 3600, 2000, 1], 'kötü sayfa!': [1, 1, 1, 0] }, api: { 'GET summary': [2, 900, 600, 0], 'GET ../x': [1, 1, 1, 0] } }))).status, 200);
  await mainPerf.flush(env.DB);
  const rep = await perfReport(env.DB, { days: 1 });
  const pg = rep.pages.find((p) => p.route === 'siparisler');
  assert.ok(pg && pg.n === 3 && pg.avg_ms === 1200 && pg.slow_n === 1, JSON.stringify(rep.pages));
  assert.equal(rep.pages.length, 1, 'geçersiz sayfa adı alınmaz');
  const c = rep.client.find((x) => x.route === 'GET summary');
  assert.ok(c && c.avg_ms === 450 && c.server_ms != null, JSON.stringify(rep.client));
  assert.ok(!rep.routes.some((r) => /^(SAYFA|TARAYICI|DB) /.test(r.route)), 'ölçüm satırları işlem listesine karışmaz');
});
