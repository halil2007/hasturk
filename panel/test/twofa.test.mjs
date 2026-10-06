// İki adımlı doğrulama: TOTP (RFC 6238), girişte kod adımı, tekrar kullanılamayan kod, yedek kod, zorunluluk ve sıfırlama
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { hotp, b32encode, verifyCode, step } from '../src/totp.js';

test('TOTP: RFC 6238 test vektörü ve ±1 adım', async () => {
  const sk = b32encode(new TextEncoder().encode('12345678901234567890'));
  assert.equal(sk, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(await hotp(sk, Math.floor(59 / 30)), '287082');
  assert.equal(await hotp(sk, Math.floor(1111111109 / 30)), '081804');
  const t = 1111111109000, c = await hotp(sk, step(t) - 1);
  assert.equal(await verifyCode(sk, c, -1, t), step(t) - 1); // 30 sn önceki kod da geçer
  assert.equal(await verifyCode(sk, c, step(t) - 1, t), null); // aynı kod ikinci kez geçmez
});

function setup() {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = {};
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who] || '', ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie');
    if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { env, jar, call };
}
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
const now = (sk, d = 0) => hotp(sk, step() + d);

test('giriş: kod adımı, hatalı kod, yedek kod, zorunluluk ve yönetici sıfırlaması', async () => {
  resetChannels();
  const { call, jar } = setup();
  const A = call('admin'), S = call('staff');
  await A('/api/login', J({ password: 'x-123456' }));
  await A('/api/users', J({ username: 'ayse', name: 'Ayşe', password: 'ayse-sifre-1', role: 'staff', perms: ['orders'] }));
  assert.equal((await S('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).status, 200);
  // Kurulum: QR + anahtar; yanlış kodla açılmaz, doğru kodla açılır ve 10 yedek kod verir
  const st = await (await S('/api/me/2fa/setup', J({}))).json();
  assert.match(st.qr, /^<svg/); assert.match(st.uri, /^otpauth:\/\/totp\//);
  const sk = st.secret.replace(/\s/g, '');
  assert.equal((await S('/api/me/2fa/enable', J({ code: '000000' }))).status, 400);
  const en = await (await S('/api/me/2fa/enable', J({ code: await now(sk) }))).json();
  assert.equal(en.recovery.length, 10);
  // Yönetici listesinde görünür, sır görünmez
  const u = (await (await A('/api/users')).json()).find((x) => x.username === 'ayse');
  assert.equal(u.twofa, true); assert.equal(u.totp, undefined);
  // Yeni giriş: şifre doğru → oturum yok, bilet var
  delete jar.staff;
  const l1 = await (await S('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal(l1.twofa, true); assert.ok(l1.ticket); assert.equal(jar.staff, undefined);
  assert.equal((await S('/api/summary')).status, 401);
  assert.equal((await S('/api/login', J({ ticket: l1.ticket, code: '123456' }))).status, 401);
  // Kurulumda kullanılan kod tekrar geçmez; bir sonraki adımın kodu geçer
  assert.equal((await S('/api/login', J({ ticket: l1.ticket, code: await now(sk) }))).status, 401);
  const ok = await S('/api/login', J({ ticket: l1.ticket, code: await now(sk, 1) }));
  assert.equal(ok.status, 200); assert.equal((await S('/api/summary')).status, 200);
  // Yedek kod: bir kez geçer
  delete jar.staff;
  const l2 = await (await S('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  const r2 = await (await S('/api/login', J({ ticket: l2.ticket, code: en.recovery[0].toUpperCase() }))).json();
  assert.equal(r2.ok, true); assert.equal(r2.recoveryUsed, true); assert.equal(r2.recoveryLeft, 9);
  delete jar.staff;
  const l3 = await (await S('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal((await S('/api/login', J({ ticket: l3.ticket, code: en.recovery[0] }))).status, 401);
  // Sahte bilet reddedilir
  assert.equal((await S('/api/login', J({ ticket: l3.ticket.replace(/.$/, 'x'), code: await now(sk, 1) }))).status, 401);
  // Zorunluluk: yönetici (2FA kapalı) kurulum ekranına düşer; yalnız me/2fa çalışır
  assert.equal((await A('/api/users/security', J({ require2fa: true }, 'PUT'))).status, 200);
  const blocked = await A('/api/summary');
  assert.equal(blocked.status, 403); assert.equal((await blocked.json()).need2fa, true);
  assert.equal((await (await A('/api/me')).json()).need2fa, true);
  const ast = await (await A('/api/me/2fa/setup', J({}))).json();
  await A('/api/me/2fa/enable', J({ code: await now(ast.secret.replace(/\s/g, '')) }));
  assert.equal((await A('/api/summary')).status, 200);
  // Zorunluyken kullanıcı kapatamaz
  const cur = await (await A('/api/me/2fa')).json();
  assert.equal(cur.on, true); assert.equal(cur.required, true);
  // Yönetici sıfırlar: kullanıcının oturumu kapanır, girişte kod istenmez ama zorunluluk kurulum ister
  assert.equal((await A(`/api/users/${u.id}/2fa-reset`, J({}))).status, 200);
  delete jar.staff;
  const l4 = await S('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }));
  assert.equal(l4.status, 200); assert.equal((await l4.json()).twofa, undefined);
  assert.equal((await S('/api/orders?status=all')).status, 403);
  // Ana yönetici de kodla girer
  delete jar.admin;
  const la = await (await A('/api/login', J({ password: 'x-123456' }))).json();
  assert.equal(la.twofa, true);
  assert.equal((await A('/api/login', J({ ticket: la.ticket, code: await now(ast.secret.replace(/\s/g, ''), 1) }))).status, 200);
  assert.equal((await A('/api/summary')).status, 200);
});
