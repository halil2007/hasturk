// Güvenlik sıkılaştırmaları: destek talebi / mesaj / görsel sınırı, girişte e-posta kodu yağmuru, bozuk çerez, ana panelde
// bildirimlerin ortak tabloda olması (çalışan tarafındaki satış / destek bildirimleri görünür), bildirimlerin yalnız yöneticiye
// açık olması, tarayıcı ölçümlerinde ad sınırı, sunucu hatası kaydında adres kalıbı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel, MainPanel } from '../src/index.js';
import { supportApi, LIMITS } from '../src/support.js';
import { report5xx } from '../src/handler.js';
import { backCopy } from '../src/mainpanel.js';
import { PerfBuffer } from '../src/perf.js';
import { first, all, init, notify, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { json } from '../src/util.js';

const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (String(u).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(o.body)); return new Response('{"id":"1"}', { status: 200, headers: { 'content-type': 'application/json' } }); }
  return realFetch(u, o);
};
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
const IMG = 'data:image/png;base64,' + 'A'.repeat(40);

function setup(extra = {}) {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1(), ...extra };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = {};
  const call = (who = 'admin', ip = '1.1.1.1') => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who] || '', 'CF-Connecting-IP': ip, ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { env, jar, call };
}

test('destek: firma tarafında saatlik talep, 10 dakikalık mesaj ve günlük görsel sınırı; ana panel sınırsız', async () => {
  const db = d1(); await init(db);
  const c = { slug: 'firma-a', firm: 'Firma A', user: { id: 1, name: 'Ali' }, staff: false };
  const post = (path, b) => supportApi(new Request('https://p.test/api/' + path, { method: 'POST', body: JSON.stringify(b) }), db, path, c);
  const ids = [];
  for (let i = 0; i < LIMITS.ticketsHour; i++) ids.push((await post('support', { subject: `Konu ${i}`, body: 'Bir sorun var burada' })).id);
  await assert.rejects(post('support', { subject: 'Fazla', body: 'Bir sorun daha var' }), (e) => e.status === 429);
  // Başka firma etkilenmez
  const other = { ...c, slug: 'firma-b' };
  assert.ok((await supportApi(new Request('https://p.test/api/support', { method: 'POST', body: JSON.stringify({ subject: 'Konu', body: 'Bir sorun var' }) }), db, 'support', other)).id);
  // Mesaj sınırı (ilk mesajlar talep açılışında yazıldı)
  for (let i = 0; i < LIMITS.msgs10m - LIMITS.ticketsHour; i++) await post(`support/${ids[0]}/reply`, { body: `ek ${i}` });
  await assert.rejects(post(`support/${ids[0]}/reply`, { body: 'bir tane daha' }), (e) => e.status === 429);
  // Görsel sınırı (günde 40)
  await db.prepare('UPDATE support_messages SET created_at = 0').run();
  for (let i = 0; i < LIMITS.filesDay / 4; i++) await post(`support/${ids[1]}/reply`, { body: 'görsel', files: [1, 2, 3, 4].map(() => ({ name: 'a.png', data: IMG })) });
  await assert.rejects(post(`support/${ids[1]}/reply`, { body: 'görsel', files: [{ name: 'a.png', data: IMG }] }), (e) => e.status === 429);
  assert.ok((await post(`support/${ids[1]}/reply`, { body: 'yalnız yazı' })).ok, 'görselsiz mesaj geçer');
  // Ana panel (yanıtlayan taraf) sınırsız
  const staff = { slug: '', firm: '', user: { id: 0, name: 'Yönetici' }, staff: true };
  await db.prepare('UPDATE support_messages SET created_at = ?').bind(Date.now()).run();
  for (let i = 0; i < 3; i++) assert.ok((await supportApi(new Request('https://p.test/api/x', { method: 'POST', body: JSON.stringify({ body: 'yanıt' }) }), db, `support/${ids[0]}/reply`, staff)).ok);
});

test('giriş: şifreyle art arda girişte yeni kod gönderilmez (45 sn), saatte en fazla 5 kod; deneme sayacı kod adımında sıfırlanmaz', async () => {
  mails.length = 0;
  const { env, call, jar } = setup({ MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 'panel@hasturk.test' });
  const A = call('admin', '9.9.9.9');
  assert.equal((await A('login', J({ password: 'x-123456' }))).status, 200);
  assert.equal((await A('users', J({ username: 'veli', name: 'Veli', email: 'veli@firma.test', password: 'veli-sifre-1', role: 'staff' }))).status, 200);
  const V = call('veli', '85.105.12.34');
  let r = await (await V('login', J({ username: 'veli', password: 'veli-sifre-1' }))).json();
  assert.equal(r.emailcode, true); assert.equal(mails.length, 1);
  r = await (await V('login', J({ username: 'veli', password: 'veli-sifre-1' }))).json();
  assert.equal(r.emailcode, true); assert.equal(mails.length, 1, '45 sn içinde yeni kod yok');
  assert.ok(!jar.veli);
  // Saatte 5 kod gönderildiyse şifreyle giriş de yeni kod üretmez
  const uid = (await first(env.DB, "SELECT id FROM users WHERE username = 'veli'")).id, now = Date.now();
  await setSetting(env.DB, 'mailcode:' + uid, { sent: [1, 2, 3, 4, 5].map((i) => now - i * 60e3) });
  const res = await V('login', J({ username: 'veli', password: 'veli-sifre-1' }));
  assert.equal(res.status, 429); assert.equal(mails.length, 1);
  // Giriş koruması sayacı: şifre doğru ama oturum açılmadı → sayaç sıfırlanmadı
  const g = await first(env.DB, "SELECT fails FROM ip_guard WHERE ip = '85.105.12.34'");
  assert.ok(g && g.fails >= 3, JSON.stringify(g));
});

test('bozuk oturum çerezi 500 değil, oturumsuz (401) sayılır; bozuk adres 400', async () => {
  const { env, call, jar } = setup();
  jar.x = 'hp_session=%E0%A4%A';
  const r = await call('x')('summary');
  assert.equal(r.status, 401);
  const A = call('admin');
  await A('login', J({ password: 'x-123456' }));
  assert.equal((await A('orders/%E0%A4%A')).status, 400);
  assert.equal((await all(env.DB, 'SELECT id FROM error_reports')).length, 0, 'hata kaydı açılmaz');
});

test('sunucu hatası kaydı: adresteki kimlikler tek kalıba iner (her adres ayrı kayıt / bildirim açmaz)', async () => {
  const db = d1(); await init(db);
  for (const id of ['TY-1234', 'abc123', 'xyz999', 'Q%20W']) {
    const res = json({ error: 'patladı' }, 500);
    await report5xx(db, new Request(`https://p.test/api/orders/${id}/label`), res, { slug: '', firm: '' });
  }
  const rows = await all(db, 'SELECT action, count FROM error_reports');
  assert.equal(rows.length, 1, JSON.stringify(rows));
  assert.equal(rows[0].action, 'GET orders/:x/label'); assert.equal(rows[0].count, 4);
});

test('tarayıcı ölçümü: yalnız adres kalıbındaki adlar, günde en fazla 400 farklı ad', () => {
  const p = new PerfBuffer();
  p.client({ api: { 'GET summary': [1, 10, 10, 0], 'GET orders/:id': [1, 10, 10, 0], 'GET orders/TY-1': [1, 1, 1, 0], 'GET ../x': [1, 1, 1, 0], 'POST a/b/c/d/e/f/g/h': [1, 1, 1, 0] } });
  assert.deepEqual([...p.m.keys()].sort(), ['TARAYICI GET orders/:id', 'TARAYICI GET summary']);
  for (let i = 0; i < 20; i++) p.client({ api: Object.fromEntries(Array.from({ length: 50 }, (_, k) => [`GET r${i}x${k}`, [1, 1, 1, 0]])) });
  assert.ok(p.m.size <= 400, String(p.m.size));
});

test('ana panel (yerel veritabanı): bildirimler ortak tabloda — çalışan tarafındaki satış bildirimi görünür; personel bildirimleri göremez', async () => {
  const { env, call } = setup();
  const A = call('admin');
  assert.equal((await A('login', J({ password: 'x-123456' }))).status, 200);
  assert.equal((await A('users', J({ username: 'per', name: 'Personel', password: 'per-sifre-1', role: 'staff' }))).status, 200);
  // Nesneyi bağla ve taşı
  const ns = doNamespace(MainPanel, () => env);
  env.MAIN = ns;
  const obj = () => ns.get(ns.idFromName('main-local:eeur'));
  await A('summary');
  for (let i = 0; i < 50; i++) { const st = await obj().ctx.storage.get('mig'); if (st && st.done) break; await obj().alarm(); }
  // Çalışan tarafı (satış, site formu): doğrudan ana veritabanına yazar
  await notify(env.DB, 'sale:1', { level: 'info', title: 'Yeni satış: Firma X' });
  const list = await (await A('notices')).json();
  assert.ok(list.some((n) => n.key === 'sale:1'), JSON.stringify(list));
  assert.equal((await (await A('summary')).json()).notices.open, 1);
  const P = call('per', '2.2.2.2');
  assert.equal((await P('login', J({ username: 'per', password: 'per-sifre-1' }))).status, 200);
  assert.equal((await P('notices')).status, 403);
  assert.equal((await P('notices/read', J({}))).status, 403);
});

test('taşımadan sonra yerelde kalmış bildirim ve abonelikler bir kez ana veritabanına kopyalanır', async () => {
  const remote = d1(); await init(remote);
  await remote.prepare("INSERT INTO notices (key, level, title, count, first_at, last_at, read) VALUES ('a', 'warn', 'eski', 1, 1, 100, 0)").run();
  const local = d1(); await init(local);
  await local.prepare("INSERT INTO notices (key, level, title, count, first_at, last_at, read) VALUES ('a', 'warn', 'yeni', 2, 1, 200, 0), ('b', 'info', 'yerel', 1, 1, 50, 1)").run();
  await local.prepare("INSERT INTO push_subs (endpoint, user_id, created_at) VALUES ('https://fcm.googleapis.com/x', 0, 1)").run();
  // Nesnenin yerel veritabanı senkron okunur (sahte veritabanında satırlar önceden okunur)
  const nrows = await all(local, 'SELECT key, level, channel, title, msg, count, first_at, last_at, read, resolved_at FROM notices');
  const prow = await all(local, 'SELECT endpoint, user_id, ua, created_at FROM push_subs');
  const store = new Map();
  const ctx = { storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v), sql: { exec: (q) => ({ toArray: () => (/notices/.test(q) ? nrows : prow) }) } } };
  assert.equal(await backCopy(ctx, remote), 3);
  const ns = await all(remote, 'SELECT key, title FROM notices ORDER BY key');
  assert.deepEqual(ns.map((n) => `${n.key}:${n.title}`), ['a:yeni', 'b:yerel']);
  assert.equal((await all(remote, 'SELECT endpoint FROM push_subs')).length, 1);
  assert.equal(await backCopy(ctx, remote), 0, 'bir kez');
});
