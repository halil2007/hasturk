// Demo firma paneli: sitedeki demo talebi imzalı bağlantı döndürür; bağlantı "demo" firmasına personel oturumu açar,
// örnek verilerle çalışır, şifre / iki adımlı doğrulama / ayarlar kapalıdır, günde bir sıfırlanır
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';

const call = (env, path, { method = 'GET', body, cookie, origin } = {}) => worker.fetch(new Request('https://panel.test' + path, {
  method, body: body ? JSON.stringify(body) : undefined,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': '9.9.9.9' },
}), env, { waitUntil() {} });

test('demo paneli: bağlantı, oturum, örnek veri, kısıtlar, günlük sıfırlama', async () => {
  const env = { PANEL_SECRET: 'gizli-anahtar-123', DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const lead = await (await call(env, '/api/public/lead', { method: 'POST', origin: 'https://hasturkcrm.com', body: { name: 'Ali Veli', phone: '0555', consent: true } })).json();
  assert.ok(lead.ok); assert.match(lead.demo, /^https:\/\/panel\.test\/api\/public\/demo\?t=\d+\./);
  const path = lead.demo.replace('https://panel.test', '');

  // bozuk / süresi dolmuş bağlantı açılmaz
  assert.equal((await call(env, path.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).status, 403);
  assert.equal((await call(env, '/api/public/demo?t=1000.abc')).status, 403);

  const r = await call(env, path);
  assert.equal(r.status, 200);
  const cookie = r.headers.get('Set-Cookie').split(';')[0];
  assert.match(cookie, /^hp_session=demo~/);
  assert.match(await r.text(), /http-equiv="refresh"/);
  const me = await (await call(env, '/api/me', { cookie })).json();
  assert.equal(me.tenant.slug, 'demo'); assert.equal(me.user.role, 'staff'); assert.equal(me.demo, true);
  const t = await env.DB.prepare("SELECT * FROM tenants WHERE slug = 'demo'").first();
  assert.equal(t.active, 1);

  // örnek veriler hazır (deneme modu kanalları)
  const obj = env.TENANT.objects.get('demo');
  const n = (await obj.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n;
  assert.ok(n > 100, `sipariş sayısı ${n}`);

  // kısıtlar: şifre, iki adımlı doğrulama, ayarlar, kullanıcılar, entegrasyonlar
  const o = 'https://panel.test';
  assert.equal((await call(env, '/api/me/password', { method: 'POST', cookie, origin: o, body: { old: 'x', new: 'yyyyyyyy' } })).status, 403);
  assert.equal((await call(env, '/api/me/2fa/setup', { method: 'POST', cookie, origin: o, body: {} })).status, 403);
  assert.equal((await call(env, '/api/settings', { method: 'PUT', cookie, origin: o, body: {} })).status, 403);
  assert.equal((await call(env, '/api/users', { cookie })).status, 403);
  assert.equal((await call(env, '/api/integrations', { cookie })).status, 403);
  // siparişleri görebilir
  assert.equal((await call(env, '/api/orders?status=all&limit=5', { cookie })).status, 200);

  // günlük sıfırlama: ziyaretçi değişikliği silinir, örnek veriler yeniden gelir
  await obj.db.prepare("UPDATE orders SET customer = 'Değiştirildi'").run();
  await obj.ctx.storage.put('demo_reset_at', Date.now() - 25 * 3600e3);
  await obj.alarm();
  assert.equal((await obj.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer = 'Değiştirildi'").first()).n, 0);
  assert.ok((await obj.db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n > 100);
  assert.ok(await obj.ctx.storage.getAlarm());
  // eski oturum sıfırlamadan sonra geçersiz; yeni bağlantıyla tekrar girilir
  assert.equal((await call(env, '/api/me', { cookie })).status, 401);
  const again = await call(env, path);
  assert.equal(again.status, 200);

  // ana panelin yöneticisi askıya alırsa demo kapanır
  await env.DB.prepare("UPDATE tenants SET active = 0 WHERE slug = 'demo'").run();
  const { getTenant } = await import('../src/tenants.js');
  await getTenant(env.DB, 'demo', true);
  assert.equal((await call(env, path)).status, 403);
});

test('demo firma kodu başka firmaya verilemez; gizli anahtar yoksa bağlantı üretilmez', async () => {
  const { tenantApi } = await import('../src/tenants.js');
  const env = { PANEL_SECRET: 'gizli-anahtar-123', DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const req = new Request('https://panel.test/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'demo', name: 'X', admin_username: 'yonetim', admin_password: '12345678' }) });
  await assert.rejects(tenantApi(req, env, env.DB, 'tenants', { role: 'admin' }), /demo paneline ayrılmış/);
  const env2 = { PANEL_PASSWORD: '', DB: d1() };
  const lead = await (await call(env2, '/api/public/lead', { method: 'POST', origin: 'https://hasturkcrm.com', body: { name: 'Ali Veli', phone: '0555', consent: true } })).json();
  assert.equal(lead.demo, null);
});
