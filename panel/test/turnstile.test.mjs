// Turnstile: anahtarlar tanımlıysa giriş ve "şifremi unuttum" doğrulama ister; tanımlı değilse kapalıdır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import worker from '../src/index.js';
import { turnstileOk, turnstileOn } from '../src/turnstile.js';

const post = (env, path, b) => worker.fetch(new Request(`https://panel.test/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), env, { waitUntil() {} });

test('turnstile: anahtar yoksa kapalı; varsa giriş ve şifremi unuttum jeton ister', async () => {
  const db = d1();
  await init(db);
  const off = { PANEL_PASSWORD: 'x-123456', DB: db };
  assert.equal(turnstileOn(off), false);
  assert.notEqual((await post(off, 'login', { username: 'admin', password: 'x-123456' })).status, 400);
  const env = { ...off, TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET: 'gizli' };
  const brand = await (await worker.fetch(new Request('https://panel.test/api/brand'), env, { waitUntil() {} })).json();
  assert.equal(brand.turnstile, 'site');
  const r = await post(env, 'login', { username: 'admin', password: 'x-123456' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).captcha, true);
  assert.equal((await post(env, 'password/forgot', { tenant: 'acme', who: 'a' })).status, 400);
  assert.equal((await post(env, 'login', { tenant: 'acme', username: 'a', password: 'b' })).status, 400);
  assert.equal(turnstileOn({ ...env, DEMO: '1' }), false, 'demo panelinde kapalı');
});

test('turnstile: siteverify yanıtı', async () => {
  const env = { TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET: 'k' }, req = new Request('https://panel.test/api/login', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
  const res = (o) => async () => new Response(JSON.stringify(o));
  let sent;
  const ok = await turnstileOk(env, req, 'tok', 'login', async (u, o) => { sent = o.body; return new Response(JSON.stringify({ success: true, action: 'login', hostname: 'panel.test' })); });
  assert.equal(ok, true);
  assert.equal(sent.get('secret'), 'k'); assert.equal(sent.get('response'), 'tok'); assert.equal(sent.get('remoteip'), '1.2.3.4');
  assert.equal(await turnstileOk(env, req, 'tok', 'login', res({ success: false })), false);
  assert.equal(await turnstileOk(env, req, 'tok', 'login', res({ success: true, action: 'forgot', hostname: 'panel.test' })), false, 'başka işlemin jetonu');
  assert.equal(await turnstileOk(env, req, 'tok', 'login', res({ success: true, action: 'login', hostname: 'evil.test' })), false, 'başka sitenin jetonu');
  assert.equal(await turnstileOk({ ...env, TURNSTILE_HOSTNAMES: 'a.test, panel.test' }, req, 'tok', 'login', res({ success: true, action: 'login', hostname: 'a.test' })), true);
  assert.equal(await turnstileOk(env, req, 'tok', 'login', async () => new Response('x', { status: 500 })), false);
  assert.equal(await turnstileOk(env, req, '', 'login', async () => { throw new Error('çağrılmamalı'); }), false);
  assert.equal(await turnstileOk(env, req, 'tok', 'login', async () => { throw new Error('ağ'); }), false);
});
