// Kendi kendine 7 günlük deneme: sitedeki form firma panelini açar, tek kullanımlık bağlantıyla doğrudan girilir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { slugOf } from '../src/trial.js';
import { init } from '../src/db.js';

function setup() {
  const env = { PANEL_PASSWORD: 'ana-sifre-1', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const call = (path, { body, method = 'POST', origin = 'https://hasturkcrm.com', ip = '1.1.1.1', cookie = '' } = {}) => worker.fetch(new Request('https://panel.test' + path, {
    method, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip, Cookie: cookie } }), env, { waitUntil() {} });
  return { env, call };
}
const form = (o = {}) => ({ company: 'Yeşil Bahçe Tarım Ltd. Şti.', name: 'Ayşe Yılmaz', email: 'ayse@yesilbahce.com', phone: '0532 111 22 33', username: 'ayse', password: 'gizli-sifre-9', consent: true, ...o });

test('firma kodu firma adından', () => {
  assert.equal(slugOf('Yeşil Bahçe Tarım Ltd. Şti.'), 'yesil-bahce-tarim');
  assert.equal(slugOf('ÇİÇEK & Dünya A.Ş.'), 'cicek-dunya');
});

test('deneme: form → 7 günlük panel açılır → tek kullanımlık bağlantıyla doğrudan girilir', async () => {
  const { env, call } = setup();
  let r = await call('/api/public/trial', { body: form() });
  let j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.slug, 'yesil-bahce-tarim'); assert.equal(j.username, 'ayse'); assert.equal(j.days, 7);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://hasturkcrm.com');
  const t = await env.DB.prepare("SELECT * FROM tenants WHERE slug = 'yesil-bahce-tarim'").first();
  assert.equal(t.trial, 1); assert.equal(t.email, 'ayse@yesilbahce.com');
  assert.ok(Math.abs(t.expires_at - Date.now() - 7 * 864e5) < 60e3);
  // Bağlantı: oturum çerezi verir, panele yönlendirir; ikinci kez kullanılamaz
  const link = new URL(j.url);
  r = await call(link.pathname + link.search, { method: 'GET', origin: '' });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^hp_session=yesil-bahce-tarim/);
  const me = await call('/api/me', { method: 'GET', origin: '', cookie });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.username, 'ayse');
  assert.equal((await call(link.pathname + link.search, { method: 'GET', origin: '' })).status, 400, 'tek kullanımlık');
  // Kendi şifresiyle de girer
  assert.equal((await call('/api/login', { body: { tenant: 'yesil-bahce-tarim', username: 'ayse', password: 'gizli-sifre-9' }, origin: 'https://panel.test' })).status, 200);
  // Aynı e-posta / telefonla ikinci panel açılmaz; aynı ad başka firmaya -2 ile
  r = await call('/api/public/trial', { body: form({ email: 'baska@ornek.com' }) });
  assert.equal(r.status, 409);
  r = await call('/api/public/trial', { body: form({ email: 'baska@ornek.com', phone: '0533 999 88 77' }) });
  assert.equal((await r.json()).slug, 'yesil-bahce-tarim-2');
});

test('deneme: doğrulamalar, bot tuzağı, sahte / süresi geçmiş bağlantı, IP sınırı', async () => {
  const { env, call } = setup();
  assert.equal((await call('/api/public/trial', { body: form(), origin: 'https://kotu.site' })).status, 403);
  for (const bad of [{ company: 'A' }, { email: 'yok' }, { phone: '123' }, { username: 'a b' }, { password: 'kisa' }, { consent: false }]) {
    assert.equal((await call('/api/public/trial', { body: form(bad) })).status, 400, JSON.stringify(bad));
  }
  await call('/api/public/trial', { body: form({ website: 'http://spam' }) });
  await init(env.DB);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM tenants').first()).n, 0, 'bot tuzağı');
  assert.equal((await call('/api/public/trial-login?t=yesil.1.abc', { method: 'GET' })).status, 400);
  const old = `/api/public/trial-login?t=${encodeURIComponent(`firma-x.${Date.now() - 1000}.${'a'.repeat(43)}`)}`;
  assert.equal((await call(old, { method: 'GET' })).status, 400);
  const j = await (await call('/api/public/trial', { body: form(), ip: '7.7.7.7' })).json();
  const forged = new URL(j.url); forged.searchParams.set('t', forged.searchParams.get('t').replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')));
  assert.equal((await call(forged.pathname + forged.search, { method: 'GET' })).status, 400, 'imza');
  let last;
  for (let i = 0; i < 4; i++) last = await call('/api/public/trial', { body: form({ email: `x${i}@ornek.com`, phone: `0532 000 00 0${i}`, company: 'Firma ' + i }), ip: '8.8.8.8' });
  assert.equal(last.status, 429);
});
