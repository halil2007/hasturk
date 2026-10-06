// Personel (görüntüle / tam yetki, oturum kapatma, silme, etkinlik) ve firmalar (abonelik, ödeme, kullanıcı sınırı, süre dolması)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';

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

test('personel: yalnız görüntüleme yetkisi değişikliği engeller, oturum kapatma, pasif, silme, etkinlik', async () => {
  resetChannels();
  const { call } = setup();
  const A = call('admin'), S = call('staff');
  await A('/api/login', J({ password: 'x-123456' }));
  const c = await A('/api/users', J({ username: 'depo', name: 'Depo Ali', title: 'Depo', phone: '555', password: 'depo-sifre-1', role: 'staff', template: 'depo', perms: ['orders:view', 'stock', 'bozuk:view'] }));
  assert.equal(c.status, 200, await c.clone().text());
  const u = (await (await A('/api/users')).json()).find((x) => x.username === 'depo');
  assert.deepEqual(u.perms, ['orders:view', 'stock']); assert.equal(u.title, 'Depo'); assert.equal(u.template, 'depo');
  assert.equal((await S('/api/login', J({ username: 'depo', password: 'depo-sifre-1' }))).status, 200);
  // Görür: liste açılır, işlem reddedilir; yetkisiz bölüm kapalı
  assert.equal((await S('/api/orders?status=all')).status, 200);
  const w = await S('/api/orders-bulk', J({ ids: ['x'], action: 'accept' }));
  assert.equal(w.status, 403); assert.match((await w.json()).error, /yalnız görüntüleme/);
  assert.equal((await S('/api/claims')).status, 403);
  // Personel kullanıcı listesine / etkinliğe erişemez
  assert.equal((await S('/api/users')).status, 403);
  assert.equal((await S(`/api/users/${u.id}/activity`)).status, 403);
  // Oturumları kapat: açık oturum geçersiz olur, tekrar giriş yapılabilir
  assert.equal((await A(`/api/users/${u.id}/revoke`, J({}))).status, 200);
  assert.equal((await S('/api/me')).status, 401);
  assert.equal((await S('/api/login', J({ username: 'depo', password: 'depo-sifre-1' }))).status, 200);
  assert.equal((await S('/api/me')).status, 200);
  // Pasifleştirme oturumu hemen kapatır
  assert.equal((await A(`/api/users/${u.id}`, J({ ...u, active: false }, 'PUT'))).status, 200);
  assert.equal((await S('/api/me')).status, 401);
  const act = await (await A(`/api/users/${u.id}/activity`)).json();
  assert.ok(Array.isArray(act.orders));
  // Silme; kendi hesabını silemez
  assert.equal((await A(`/api/users/${u.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await (await A('/api/users')).json()).length, 0);
});

test('firmalar: abonelik alanları, ödeme ile uzatma, kullanıcı sınırı, süre dolunca giriş kapanır (destek girebilir)', async () => {
  resetChannels();
  const { env, call } = setup();
  const O = call('owner'), T = call('tenant');
  await O('/api/login', J({ password: 'x-123456' }));
  const r = await O('/api/tenants', J({ slug: 'yesil-bahce', name: 'Yeşil Bahçe', legal: 'Yeşil Bahçe Ltd.', contact: 'Ayşe', plan: 'Profesyonel', fee: '1.500', period: 'monthly', max_users: 2, trial: true, admin_username: 'ali', admin_password: 'gizli-sifre-1' }));
  assert.equal(r.status, 200, await r.clone().text());
  let t = (await (await O('/api/tenants')).json()).tenants[0];
  assert.equal(t.plan, 'Profesyonel'); assert.equal(t.legal, 'Yeşil Bahçe Ltd.'); assert.equal(t.trial, true); assert.equal(t.max_users, 2);
  assert.ok(t.expires_at > Date.now() + 13 * 864e5 && t.expires_at < Date.now() + 15 * 864e5, 'deneme 14 gün');
  // Kullanıcı sınırı: 2 (yönetici + 1)
  assert.equal((await T('/api/login', J({ tenant: 'yesil-bahce', username: 'ali', password: 'gizli-sifre-1' }))).status, 200);
  assert.equal((await T('/api/users', J({ username: 'veli', name: 'Veli', password: 'veli-sifre-1', role: 'staff', perms: ['orders'] }))).status, 200);
  const lim = await T('/api/users', J({ username: 'can', name: 'Can', password: 'can-sifre-12', role: 'staff', perms: [] }));
  assert.equal(lim.status, 400); assert.match((await lim.json()).error, /sınır/);
  // Ödeme: 1 ay uzatır, denemeden çıkar
  const before = t.expires_at;
  const p = await (await O('/api/tenants/yesil-bahce/payments', J({ amount: '1500', months: 1, method: 'Havale / EFT', note: 'Ekim' }))).json();
  assert.ok(p.expires_at > before + 27 * 864e5);
  t = (await (await O('/api/tenants')).json()).tenants[0];
  assert.equal(t.trial, false); assert.equal(t.paid_total, 1500);
  assert.equal((await (await O('/api/tenants/yesil-bahce/payments')).json()).payments.length, 1);
  // Süre doldu: müşteri giremez, açık oturumu kapanır; destek oturumu girebilir
  assert.equal((await O('/api/tenants/yesil-bahce', J({ expires_at: '2020-01-01' }, 'PUT'))).status, 200);
  await new Promise((res) => setTimeout(res, 5));
  const { getTenant } = await import('../src/tenants.js');
  await getTenant(env.DB, 'yesil-bahce', true);
  const x = await T('/api/me');
  assert.equal(x.status, 401); assert.match((await x.json()).error, /süresi doldu/);
  const l2 = await T('/api/login', J({ tenant: 'yesil-bahce', username: 'ali', password: 'gizli-sifre-1' }));
  assert.equal(l2.status, 403);
  const sup = await O('/api/tenants/yesil-bahce/support', J({}));
  assert.equal(sup.status, 200);
  assert.equal((await O('/api/me')).status, 200, 'destek oturumu süresi dolmuş firmaya girer');
});
