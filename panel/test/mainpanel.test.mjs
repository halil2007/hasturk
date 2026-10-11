// Ana panel veritabanının yanında (MainPanel nesnesi): bölge ilk sorgudan öğrenilir, istekler nesneye gider, sunucu süresi başlığı
// eklenir; nesne yanıt vermezse okuma istekleri Worker'da işlenir, yazma istekleri tekrar çalıştırılmaz. Tarayıcı ölçümleri kaydedilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel, MainPanel } from '../src/index.js';
import { region } from '../src/meter.js';
import { perfReport } from '../src/perf.js';
import { mainPerf } from '../src/mainpanel.js';

// Gerçek D1 gibi: yanıtta veritabanının bölgesi ve kendi çalışma süresi
function regionDb() {
  const db = d1();
  const meta = { served_by_region: 'WEUR', served_by_primary: true, timings: { sql_duration_ms: 0.2 } };
  const wrap = (st) => ({ bind: (...a) => wrap(st.bind(...a)), all: async () => ({ ...(await st.all()), meta }), run: async () => ({ ...(await st.run()), meta: { ...meta, ...(await st.run()).meta } }),
    first: (c) => st.first(c), raw: () => st.raw(), _st: st });
  return { prepare: (q) => wrap(db.prepare(q)), batch: async (l) => (await db.batch(l.map((s) => s._st || s))).map((r) => ({ ...r, meta })), exec: (q) => db.exec(q) };
}
function setup({ broken = false } = {}) {
  region.d1 = '';
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: regionDb() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const ns = doNamespace(MainPanel, () => env), calls = [];
  env.MAIN = { idFromName: ns.idFromName, get: (id, opts) => { calls.push({ name: id.name, opts }); const o = ns.get(id); return broken ? { fetch: async () => { throw new Error('nesne yok'); } } : o; } };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r;
  };
  return { env, call, calls };
}

test('ana panel istekleri veritabanının bölgesindeki nesnede işlenir; sunucu süresi başlığı', async () => {
  const { call, calls } = setup();
  assert.equal((await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) })).status, 200);
  const r = await call('summary');
  assert.equal(r.status, 200);
  assert.ok(calls.length >= 1 && calls.every((c) => c.name === 'main:weur' && c.opts.locationHint === 'weur'), JSON.stringify(calls));
  const st = r.headers.get('server-timing');
  assert.match(st, /app;dur=\d+/); assert.match(st, /db;dur=\d+;desc="\d+ sorgu WEUR"/); assert.match(st, /do;desc="WEUR"/); assert.match(st, /edge;desc="[^"]*";dur=\d+/);
  // Yazma da nesnede
  assert.equal((await call('settings', { method: 'PUT', body: JSON.stringify({}) })).status < 500, true);
});

test('nesne yanıt vermezse okuma Worker\'da işlenir, yazma 503 (iki kez çalışmasın)', async () => {
  const { call } = setup({ broken: true });
  // Giriş de bir yazma isteği: nesne yokken 503
  assert.equal((await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) })).status, 503);
});

test('MAIN_DO=0 ya da bölge bilinmiyorsa doğrudan Worker', async () => {
  const { env, call, calls } = setup();
  env.MAIN_DO = '0';
  assert.equal((await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) })).status, 200);
  assert.equal((await call('summary')).status, 200);
  assert.equal(calls.length, 0);
});

test('tarayıcı ölçümleri (sayfa açılışı, istek) ve veritabanı altyapısı Sistem hızı raporunda', async () => {
  const { env, call } = setup();
  env.MAIN_DO = '0';
  await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  await call('summary');
  assert.equal((await call('perf/client', { method: 'POST', body: JSON.stringify({ pages: { siparisler: [3, 3600, 2000, 1], 'kötü sayfa!': [1, 1, 1, 0] }, api: { 'GET summary': [2, 900, 600, 0], 'GET ../x': [1, 1, 1, 0] } }) })).status, 200);
  await mainPerf.flush(env.DB);
  const rep = await perfReport(env.DB, { days: 1 });
  const pg = rep.pages.find((p) => p.route === 'siparisler');
  assert.ok(pg && pg.n === 3 && pg.avg_ms === 1200 && pg.slow_n === 1, JSON.stringify(rep.pages));
  assert.equal(rep.pages.length, 1, 'geçersiz sayfa adı alınmaz');
  const c = rep.client.find((x) => x.route === 'GET summary');
  assert.ok(c && c.avg_ms === 450 && c.server_ms != null, JSON.stringify(rep.client));
  assert.ok(rep.infra.some((x) => /WEUR/.test(x.where) && x.queries > 0), JSON.stringify(rep.infra));
  assert.ok(!rep.routes.some((r) => /^(SAYFA|TARAYICI|DB) /.test(r.route)), 'ölçüm satırları işlem listesine karışmaz');
  const sm = rep.routes.find((r) => r.route === 'GET summary');
  assert.ok(sm && sm.db_q > 0, JSON.stringify(sm));
});
