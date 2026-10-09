// Giriş koruması: IP başına hatalı deneme sınırı, artan engel süreleri, başarılı girişte sıfırlanma, firma girişleri ve dış API,
// güvenilir IP'ler, yönetim ekranı ve genel istek sınırı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, first, run } from '../src/db.js';
import { guardIp, rateLimited } from '../src/guard.js';
import worker from '../src/index.js';

function setup() {
  const env = { PANEL_PASSWORD: 'dogru-sifre-1', PANEL_SECRET: 'sir', DB: d1() };
  const call = async (path, { ip = '1.1.1.1', body, method = 'POST', cookie = '' } = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Cookie: cookie } }), env, { waitUntil() {} });
    return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
  };
  return { env, call, login: (password, ip, extra = {}) => call('/api/login', { ip, body: { password, ...extra } }) };
}

test('5 hatalı denemeden sonra IP engellenir; doğru şifre de reddedilir; başka IP etkilenmez', async () => {
  const { login } = setup();
  for (let i = 0; i < 5; i++) assert.equal((await login('yanlis' + i, '9.9.9.9')).status, 401);
  const b = await login('dogru-sifre-1', '9.9.9.9');
  assert.equal(b.status, 429);
  assert.equal(b.body.blocked, true);
  assert.match(b.body.error, /15 dakika/);
  assert.ok(Number(b.headers.get('Retry-After')) > 800);
  // Farklı kullanıcı adlarıyla denemek de aynı sayaca girer; başka IP serbest
  assert.equal((await login('dogru-sifre-1', '8.8.8.8')).status, 200);
});

test('engel bitince denemeler sürerse süre artar (15 dk → 1 saat → 6 saat); 24 saat sessizlikten sonra sıfırlanır', async () => {
  const { env, login } = setup();
  const ip = '7.7.7.7';
  const expire = () => run(env.DB, 'UPDATE ip_guard SET blocked_until = ? WHERE ip = ?', Date.now() - 1000, ip);
  const block = async () => { for (let i = 0; i < 6; i++) await login('x', ip); return (await first(env.DB, 'SELECT blocked_until, strikes FROM ip_guard WHERE ip = ?', ip)); };
  let r = await block();
  assert.equal(r.strikes, 1);
  assert.ok(Math.abs(r.blocked_until - Date.now() - 15 * 60e3) < 5000);
  await expire(); r = await block();
  assert.equal(r.strikes, 2);
  assert.ok(Math.abs(r.blocked_until - Date.now() - 60 * 60e3) < 5000);
  await expire(); r = await block();
  assert.equal(r.strikes, 3);
  assert.ok(Math.abs(r.blocked_until - Date.now() - 360 * 60e3) < 5000);
  // Engelliyken gelen denemeler engeli uzatmaz, sayılır
  const before = (await first(env.DB, 'SELECT blocked_until, blocked_hits FROM ip_guard WHERE ip = ?', ip));
  await login('x', ip);
  const after = (await first(env.DB, 'SELECT blocked_until, blocked_hits FROM ip_guard WHERE ip = ?', ip));
  assert.equal(after.blocked_until, before.blocked_until);
  assert.equal(after.blocked_hits, before.blocked_hits + 1);
  // 24 saat hiç deneme yok: geçmiş sıfırlanır, bir sonraki engel yine 15 dk
  await run(env.DB, 'UPDATE ip_guard SET blocked_until = ?, last_at = ? WHERE ip = ?', Date.now() - 2 * 864e5, Date.now() - 2 * 864e5, ip);
  r = await block();
  assert.equal(r.strikes, 1);
});

test('başarılı giriş sayacı sıfırlar: arada doğru giren kullanıcı engellenmez', async () => {
  const { login } = setup();
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 4; i++) assert.equal((await login('yanlis', '6.6.6.6')).status, 401);
    assert.equal((await login('dogru-sifre-1', '6.6.6.6')).status, 200);
  }
});

test('firma koduyla giriş ve dış API anahtarı denemeleri de sayılır; güvenilir IP engellenmez', async () => {
  const { env, call, login } = setup();
  // Var olmayan firma kodu (firma kodu tahmini)
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/login', { ip: '5.5.5.5', body: { tenant: 'firma-' + i, username: 'a', password: 'b' } })).status, 401);
  assert.equal((await call('/api/login', { ip: '5.5.5.5', body: { tenant: 'firma-x', username: 'a', password: 'b' } })).status, 429);
  // Dış API: geçersiz anahtar 401 → sayılır; engelli IP anahtara bakılmadan reddedilir
  for (let i = 0; i < 6; i++) await call('/api/v1/stock', { ip: '4.4.4.4', method: 'GET', cookie: '' }).then((r) => assert.ok([401, 429].includes(r.status)));
  const r = await call('/api/v1/stock', { ip: '4.4.4.4', method: 'GET' });
  assert.equal(r.status, 429);
  assert.equal(r.body.blocked, true);
  // Şifre yenileme isteği de sayılır (e-posta bombardımanına karşı)
  for (let i = 0; i < 6; i++) await call('/api/password/forgot', { ip: '3.3.3.3', body: { tenant: 'yok', email: 'a@b.co' } });
  assert.equal((await call('/api/password/forgot', { ip: '3.3.3.3', body: { tenant: 'yok', email: 'a@b.co' } })).status, 429);
  // Güvenilir IP: hiç engellenmez
  const ok = await login('dogru-sifre-1', '2.2.2.2');
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/users/guard', { ip: '2.2.2.2', method: 'PUT', cookie, body: { allow: '10.0.0.*' } })).status, 200);
  // (kullanıcı adı başına 15 dakikada 8 deneme sınırı güvenilir IP'de de geçerlidir: auth.js → login)
  for (let i = 0; i < 8; i++) assert.equal((await login('yanlis', '10.0.0.7')).status, 401);
  assert.equal(await first(env.DB, "SELECT ip FROM ip_guard WHERE ip = '10.0.0.7'"), null);
});

test('yönetim: liste, engeli kaldırma, ayarlar; geçersiz IP reddedilir', async () => {
  const { call, login } = setup();
  for (let i = 0; i < 6; i++) await login('x', '11.11.11.11');
  const ok = await login('dogru-sifre-1', '2.2.2.2');
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  let g = await call('/api/users/guard', { ip: '2.2.2.2', method: 'GET', cookie });
  assert.equal(g.status, 200);
  const row = g.body.rows.find((x) => x.ip === '11.11.11.11');
  assert.equal(row.blocked, true);
  assert.equal(row.last_kind, 'giriş');
  assert.equal(g.body.you, '2.2.2.2');
  assert.equal((await call('/api/users/guard/unblock', { ip: '2.2.2.2', cookie, body: { ip: '11.11.11.11' } })).status, 200);
  assert.equal((await login('dogru-sifre-1', '11.11.11.11')).status, 200);
  // Ayarlar: 3 denemede engel, ilk engel 1 dakika
  assert.equal((await call('/api/users/guard', { ip: '2.2.2.2', method: 'PUT', cookie, body: { maxFails: 3, steps: '1, 5' } })).status, 200);
  for (let i = 0; i < 3; i++) assert.equal((await login('x', '12.12.12.12')).status, 401);
  const b = await login('x', '12.12.12.12');
  assert.equal(b.status, 429);
  assert.match(b.body.error, /1 dakika/);
  assert.equal((await call('/api/users/guard', { ip: '2.2.2.2', method: 'PUT', cookie, body: { allow: 'drop table' } })).status, 400);
  // Personel / oturumsuz erişemez
  assert.equal((await call('/api/users/guard', { ip: '2.2.2.2', method: 'GET' })).status, 401);
});

test('aracı üzerinden her denemede farklı sahte adres gönderen saldırgan da toplu sayaçla engellenir', async () => {
  const { env } = setup();
  const call = (xff) => worker.fetch(new Request('https://panel.test/api/login', { method: 'POST', body: JSON.stringify({ password: 'x' }),
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '20.20.20.20', 'X-Forwarded-For': xff, 'X-Forwarded-Host': 'crm.firma.com' } }), env, { waitUntil() {} });
  // Gerçek ziyaretçi: kendi adresiyle 5 denemede engellenir, aynı aracıyı kullanan diğer ziyaretçi etkilenmez
  for (let i = 0; i < 5; i++) assert.equal((await call('30.0.0.1')).status, 401);
  assert.equal((await call('30.0.0.1')).status, 429);
  assert.equal((await call('30.0.0.2')).status, 401);
  // Aracıyı kullanan ofis: çok sayıda başarılı giriş toplu sayaca birikmez
  const good = (xff) => worker.fetch(new Request('https://panel.test/api/login', { method: 'POST', body: JSON.stringify({ password: 'dogru-sifre-1' }),
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '20.20.20.20', 'X-Forwarded-For': xff, 'X-Forwarded-Host': 'crm.firma.com' } }), env, { waitUntil() {} });
  for (let i = 0; i < 70; i++) assert.equal((await good('50.0.0.' + (i % 200))).status, 200);
  // Her istekte başka sahte adres: aracının toplu sınırı (5 × 10) aşılınca engel
  let blocked = 0;
  for (let i = 0; i < 60; i++) if ((await call('40.0.' + Math.floor(i / 250) + '.' + (i % 250))).status === 429) blocked++;
  assert.ok(blocked >= 5, `toplu sınır engellemeli (${blocked})`);
});

test('IP anahtarı: aracı dosya (panel-proxy.php) üzerinden gelen ziyaretçi ayrı sayılır; genel istek sınırı', () => {
  const req = (h) => new Request('https://x.test/', { headers: h });
  assert.equal(guardIp(req({ 'CF-Connecting-IP': '1.2.3.4' })), '1.2.3.4');
  // Doğrudan gelen istekte X-Forwarded-For dikkate alınmaz (taklit edilebilir)
  assert.equal(guardIp(req({ 'CF-Connecting-IP': '1.2.3.4', 'X-Forwarded-For': '9.9.9.9' })), '1.2.3.4');
  assert.equal(guardIp(req({ 'CF-Connecting-IP': '1.2.3.4', 'X-Forwarded-For': '9.9.9.9', 'X-Forwarded-Host': 'crm.firma.com' })), '9.9.9.9 > 1.2.3.4');
  for (let i = 0; i < 100; i++) assert.equal(rateLimited('rl-test', 100), false);
  assert.equal(rateLimited('rl-test', 100), true);
});
