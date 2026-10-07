// Yeni ağdan (IP) girişte e-posta kodu: ilk girişte kod, aynı ağdan tekrar girişte kodsuz, başka ağdan yine kod;
// hatalı kod sınırı, yeniden gönderme, e-postası olmayan kullanıcı, kapatma ayarı ve müşteri paneli
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { netOf } from '../src/auth.js';

const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (String(u).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(o.body)); return new Response('{"id":"1"}', { status: 200, headers: { 'content-type': 'application/json' } }); }
  return realFetch(u, o);
};
const lastCode = () => /(\d{6})/.exec(mails[mails.length - 1].subject)[1];

function setup(mail = true) {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1(), ...(mail ? { MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'k', MAIL_FROM: 'panel@hasturk.test' } : {}) };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = {};
  const call = (who, ip) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who] || '', 'CF-Connecting-IP': ip || '', ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { env, jar, call };
}
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });

test('ağ: IPv4 ilk 3 bölüm, IPv6 ilk 4 grup', () => {
  assert.equal(netOf('85.105.12.34'), '85.105.12.x');
  assert.equal(netOf('85.105.12.200'), netOf('85.105.12.34'));
  assert.notEqual(netOf('85.105.13.34'), netOf('85.105.12.34'));
  assert.equal(netOf('2a02:e0:1234:0042::1'), '2a02:e0:1234:42::/64');
  assert.equal(netOf('2a02:00e0:1234:42:aa:bb:cc:dd'), '2a02:e0:1234:42::/64');
  assert.equal(netOf('::1'), '0:0:0:0::/64');
  assert.equal(netOf(''), '');
});

test('ana panel: kullanıcı ilk girişte e-posta koduyla girer, aynı ağdan tekrar sorulmaz, yeni ağda yine sorulur', async () => {
  resetChannels(); mails.length = 0;
  const { call, jar } = setup();
  const A = call('admin', '1.1.1.1');
  // Ana yönetici: e-postası girilmemişken kodsuz girer (dışarıda kalmasın)
  let r = await (await A('/api/login', J({ password: 'x-123456' }))).json();
  assert.equal(r.ok, true);
  assert.equal(mails.length, 0);
  assert.equal((await A('/api/users', J({ username: 'ayse', name: 'Ayşe', email: 'ayse@firma.test', password: 'ayse-sifre-1', role: 'staff', perms: ['orders'] }))).status, 200);

  const home = call('ayse', '85.105.12.34');
  r = await (await home('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal(r.emailcode, true); assert.equal(r.ok, undefined);
  assert.match(r.to, /^a\*+e@firma\.test$/, 'adres maskeli gösterilir');
  assert.ok(!jar.ayse, 'kod girilmeden oturum açılmaz');
  assert.equal(mails.length, 1); assert.deepEqual(mails[0].to, ['ayse@firma.test']);
  const code = lastCode();
  // Hatalı kod
  let x = await home('/api/login', J({ mailticket: r.ticket, code: code === '000000' ? '111111' : '000000' }));
  assert.equal(x.status, 401); assert.match((await x.json()).error, /Kod hatalı/);
  // Başka kullanıcının bileti uydurulamaz
  x = await home('/api/login', J({ mailticket: r.ticket.replace(/\.[^.]+$/, '.uydurma'), code }));
  assert.equal(x.status, 401); assert.equal((await x.json()).restart, true);
  // Doğru kod: oturum açılır
  x = await home('/api/login', J({ mailticket: r.ticket, code }));
  assert.equal(x.status, 200); assert.equal((await x.json()).ok, true);
  assert.equal((await home('/api/me')).status, 200);
  // Kod tek kullanımlık
  assert.equal((await home('/api/login', J({ mailticket: r.ticket, code }))).status, 401);

  // Aynı ağ (son hane farklı): kod sorulmaz
  jar.ayse = '';
  const home2 = call('ayse', '85.105.12.99');
  r = await (await home2('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal(r.ok, true); assert.equal(mails.length, 1);

  // Başka ağ: yine kod
  jar.ayse = '';
  const cafe = call('ayse', '176.40.5.6');
  r = await (await cafe('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal(r.emailcode, true); assert.equal(mails.length, 2);
  // Yeniden gönderme 45 sn dolmadan reddedilir
  x = await cafe('/api/login', J({ mailticket: r.ticket, resend: true }));
  assert.equal(x.status, 429);
  // 5 hatalı denemeden sonra doğru kod da geçmez (yeni kod istenmeli)
  const c2 = lastCode(), wrong = c2 === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) await cafe('/api/login', J({ mailticket: r.ticket, code: wrong }));
  x = await cafe('/api/login', J({ mailticket: r.ticket, code: c2 }));
  assert.equal(x.status, 429); assert.match((await x.json()).error, /Çok fazla hatalı/);

  // Yönetici "oturumları kapat" derse tanınan ağlar da unutulur
  const id = (await (await A('/api/users')).json()).find((u) => u.username === 'ayse').id;
  assert.equal((await A(`/api/users/${id}/revoke`, J({}))).status, 200);
  jar.ayse = '';
  r = await (await call('ayse', '85.105.12.34')('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal(r.emailcode, true, 'oturumlar kapatılınca evdeki ağ da yeniden doğrulanır');

  // Ayar kapatılınca kod istenmez; iki adımlı doğrulama ayarı değişmez
  const sec = await (await A('/api/users/security', J({ emailVerify: false }, 'PUT'))).json();
  assert.equal(sec.emailVerify, false); assert.equal(sec.require2fa, false);
  jar.ayse = '';
  r = await (await call('ayse', '9.9.9.9')('/api/login', J({ username: 'ayse', password: 'ayse-sifre-1' }))).json();
  assert.equal(r.ok, true);
});

test('ana yönetici: e-posta girilince yeni ağdan girişte kod ister', async () => {
  resetChannels(); mails.length = 0;
  const { call, jar } = setup();
  const A = call('admin', '1.1.1.1');
  await A('/api/login', J({ password: 'x-123456' }));
  assert.equal((await A('/api/users/security', J({ adminEmail: 'gecersiz' }, 'PUT'))).status, 400);
  assert.equal((await (await A('/api/users/security', J({ adminEmail: 'patron@firma.test' }, 'PUT'))).json()).adminEmail, 'patron@firma.test');
  jar.admin = '';
  const r = await (await call('admin', '5.5.5.5')('/api/login', J({ password: 'x-123456' }))).json();
  assert.equal(r.emailcode, true); assert.deepEqual(mails[0].to, ['patron@firma.test']);
  assert.equal((await call('admin', '5.5.5.5')('/api/login', J({ mailticket: r.ticket, code: lastCode() }))).status, 200);
  // Kodla doğrulanan ağ: tekrar girişte kod yok
  jar.admin = '';
  assert.equal((await (await call('admin', '5.5.5.7')('/api/login', J({ password: 'x-123456' }))).json()).ok, true);
});

test('e-posta gönderilemezse ya da kullanıcının e-postası yoksa giriş engellenmez', async () => {
  resetChannels(); mails.length = 0;
  const { call, env } = setup(false);
  const A = call('admin', '1.1.1.1');
  await A('/api/login', J({ password: 'x-123456' }));
  await A('/api/users', J({ username: 'veli', name: 'Veli', email: 'veli@firma.test', password: 'veli-sifre-1', role: 'staff', perms: ['orders'] }));
  await A('/api/users', J({ username: 'can', name: 'Can', password: 'can-sifre-1', role: 'staff', perms: ['orders'] }));
  assert.equal((await (await call('veli', '7.7.7.7')('/api/login', J({ username: 'veli', password: 'veli-sifre-1' }))).json()).ok, true, 'e-posta servisi yok: kodsuz');
  assert.equal((await (await call('can', '7.7.7.7')('/api/login', J({ username: 'can', password: 'can-sifre-1' }))).json()).ok, true, 'e-postası yok: kodsuz');
  const logs = (await env.DB.prepare('SELECT msg FROM logs').all()).results.map((l) => l.msg);
  assert.ok(logs.some((m) => /Veli: giriş doğrulama kodu gönderilemedi/.test(m)), 'gönderilemeyen kod günlüğe yazılır');
  assert.ok(logs.some((m) => /Can: yeni ağdan giriş .*e-posta adresi olmadığı/.test(m)));
});

test('müşteri paneli: firma yöneticisi yeni ağdan girişte e-posta koduyla girer', async () => {
  resetChannels(); mails.length = 0;
  const { call, jar } = setup();
  const O = call('owner', '1.1.1.1');
  await O('/api/login', J({ password: 'x-123456' }));
  assert.equal((await O('/api/tenants', J({ slug: 'firma1', name: 'Firma Bir', email: 'yonetici@firma1.test', admin_username: 'ali', admin_password: 'gizli-sifre-1', plan: 'Profesyonel' }))).status, 200);
  mails.length = 0; // hoş geldiniz e-postası
  const T = call('tenant', '88.1.2.3');
  let r = await (await T('/api/login', J({ tenant: 'firma1', username: 'ali', password: 'gizli-sifre-1' }))).json();
  assert.equal(r.emailcode, true);
  assert.deepEqual(mails[0].to, ['yonetici@firma1.test']);
  assert.match(mails[0].subject, /Firma Bir giriş doğrulama kodu/);
  const x = await T('/api/login', J({ tenant: 'firma1', mailticket: r.ticket, code: lastCode() }));
  assert.equal(x.status, 200);
  assert.equal((await T('/api/me')).status, 200);
  jar.tenant = '';
  r = await (await T('/api/login', J({ tenant: 'firma1', username: 'ali', password: 'gizli-sifre-1' }))).json();
  assert.equal(r.ok, true, 'aynı ağdan tekrar kod sorulmaz');
  // Firma yöneticisi ana yönetici e-postasını değiştiremez
  assert.equal((await T('/api/users/security', J({ adminEmail: 'x@y.test' }, 'PUT'))).status, 403);
});
