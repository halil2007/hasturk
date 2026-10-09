// Müşteri panelleri: ayrı veritabanı (Durable Object), firma koduyla giriş, ana panel bilgilerinin sızmaması, askı / destek / silme
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';

function setup() {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1(), TRENDYOL_SELLER_ID: '111', TRENDYOL_API_KEY: 'k1', TRENDYOL_API_SECRET: 's1' };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = { owner: '', tenant: '' };
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who], ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie');
    if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { env, jar, owner: call('owner'), tenant: call('tenant') };
}
const J = (b) => ({ method: 'POST', body: JSON.stringify(b) });

test('müşteri paneli: oluşturma, firma koduyla giriş, veri ayrımı, askıya alma, destek girişi, silme', async () => {
  resetChannels();
  const { jar, owner, tenant } = setup();
  assert.equal((await owner('/api/login', J({ password: 'x-123456' }))).status, 200);
  // Geçersiz firma kodu ve eksik bilgi
  assert.equal((await owner('/api/tenants', J({ slug: 'A B', name: 'X', admin_username: 'ali', admin_password: '12345678' }))).status, 400);
  const c = await owner('/api/tenants', J({ slug: 'yesil-bahce', name: 'Yeşil Bahçe', admin_username: 'ali', admin_password: 'gizli-sifre-1' }));
  assert.equal(c.status, 200, await c.clone().text());
  assert.equal((await (await owner('/api/tenants')).json()).tenants[0].slug, 'yesil-bahce');
  // Ana panel oturumu müşteri paneline geçmez; yanlış şifre / kod reddedilir
  assert.equal((await tenant('/api/login', J({ tenant: 'yesil-bahce', username: 'ali', password: 'yanlis-sifre' }))).status, 401);
  assert.equal((await tenant('/api/login', J({ tenant: 'yok-boyle', username: 'ali', password: 'gizli-sifre-1' }))).status, 401);
  const lg = await tenant('/api/login', J({ tenant: 'Yesil-Bahce', username: 'ali', password: 'gizli-sifre-1' }));
  assert.equal(lg.status, 200);
  assert.match(jar.tenant, /^hp_session=yesil-bahce~/);
  const me = await (await tenant('/api/me')).json();
  assert.equal(me.user.username, 'ali'); assert.equal(me.tenant.slug, 'yesil-bahce'); assert.equal(me.tenant.name, 'Yeşil Bahçe');
  // Firma adı müşterinin adıyla başlar
  assert.equal((await (await tenant('/api/summary')).json()).settings.company.title, 'Yeşil Bahçe');
  // Ana panelin Trendyol bilgileri müşteri paneline görünmez / geçmez
  const integ = await (await tenant('/api/integrations')).json();
  const ty = integ.channels.find((x) => x.id === 'trendyol');
  assert.equal(ty.fields.find((f) => f.k === 'TRENDYOL_SELLER_ID').value, ''); assert.equal(ty.enabled, false);
  // Müşteri kendi bilgisini girer; ana panel etkilenmez
  assert.equal((await tenant('/api/integrations/trendyol', { method: 'PUT', body: JSON.stringify({ values: { TRENDYOL_SELLER_ID: '999', TRENDYOL_API_KEY: 'mk', TRENDYOL_API_SECRET: 'ms' } }) })).status, 200);
  const own = (await (await owner('/api/integrations')).json()).channels.find((x) => x.id === 'trendyol');
  assert.equal(own.fields.find((f) => f.k === 'TRENDYOL_SELLER_ID').value, '111');
  const ten = (await (await tenant('/api/integrations')).json()).channels.find((x) => x.id === 'trendyol');
  assert.equal(ten.fields.find((f) => f.k === 'TRENDYOL_SELLER_ID').value, '999');
  // Müşteri, müşteri panellerini yönetemez; ana panel kullanıcı listesi müşteriye görünmez
  assert.notEqual((await tenant('/api/tenants')).status, 200);
  assert.deepEqual((await (await tenant('/api/users')).json()).map((u) => u.username), ['ali']);
  // İstatistik, askı, destek girişi
  const st = await (await owner('/api/tenants/yesil-bahce/stats')).json();
  assert.equal(st.users, 1); assert.equal(st.channels, 1);
  assert.equal((await owner('/api/tenants/yesil-bahce', { method: 'PUT', body: JSON.stringify({ active: false }) })).status, 200);
  const off = await tenant('/api/me');
  assert.equal(off.status, 401); assert.equal((await off.json()).tenantOff, true);
  assert.equal((await tenant('/api/login', J({ tenant: 'yesil-bahce', username: 'ali', password: 'gizli-sifre-1' }))).status, 403);
  await owner('/api/tenants/yesil-bahce', { method: 'PUT', body: JSON.stringify({ active: true }) });
  const sup = await owner('/api/tenants/yesil-bahce/support', J({}));
  assert.equal(sup.status, 200);
  assert.match(jar.owner, /^hp_session=yesil-bahce~-1\./);
  const sme = await (await owner('/api/me')).json();
  assert.equal(sme.user.support, true); assert.equal(sme.tenant.slug, 'yesil-bahce');
  // Şifre sıfırlama (ana panelden) ve silme
  await owner('/api/logout'); jar.owner = '';
  await owner('/api/login', J({ password: 'x-123456' }));
  assert.equal((await owner('/api/tenants/yesil-bahce/password', J({ password: 'yeni-sifre-12' }))).status, 200);
  assert.equal((await tenant('/api/login', J({ tenant: 'yesil-bahce', username: 'ali', password: 'yeni-sifre-12' }))).status, 200);
  assert.equal((await owner('/api/tenants/yesil-bahce/delete', J({ confirm: 'yanlis' }))).status, 400);
  assert.equal((await owner('/api/tenants/yesil-bahce/delete', J({ confirm: 'yesil-bahce' }))).status, 200);
  assert.equal((await tenant('/api/me')).status, 401);
  resetChannels();
});

test('müşteri paneli: yönetici adı "admin" olabilir; başka siteden gelen yönetim isteği reddedilir', async () => {
  resetChannels();
  const { jar, owner, tenant } = setup();
  await owner('/api/login', J({ password: 'x-123456' }));
  assert.equal((await owner('/api/tenants', J({ slug: 'acme', name: 'Acme', admin_username: 'admin', admin_password: 'acme-sifre-1' }))).status, 200);
  assert.equal((await tenant('/api/login', J({ tenant: 'acme', username: 'admin', password: 'acme-sifre-1' }))).status, 200);
  assert.equal((await (await tenant('/api/me')).json()).user.username, 'admin');
  assert.equal((await tenant('/api/fx')).status, 200, 'paketsiz (özel) firmada döviz bazlı fiyat açık');
  const evil = await owner('/api/tenants/acme/password', { method: 'POST', body: JSON.stringify({ password: 'kotu-sifre-12' }), headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  resetChannels();
});
