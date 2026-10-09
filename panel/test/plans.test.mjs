// Paket ve abonelik: paket sınırları müşteri panelinde uygulanır, süresi dolan panelin senkronu durur, şifremi unuttum / yenileme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { planKey, limitsOf } from '../src/plans.js';
import { createToken } from '../src/pwreset.js';
import { first, run } from '../src/db.js';

function setup() {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = { owner: '', tenant: '' };
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who], ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { env, jar, owner: call('owner'), tenant: call('tenant') };
}
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });

test('paket adı ve sınırlar', () => {
  assert.equal(planKey('Başlangıç'), 'baslangic'); assert.equal(planKey('PROFESYONEL paket'), 'profesyonel'); assert.equal(planKey('Özel'), '');
  assert.deepEqual(limitsOf({ plan: 'Kurumsal' }), { plan: 'kurumsal', stores: 25, users: 0 });
  assert.deepEqual(limitsOf({ plan: 'Başlangıç', max_stores: 5 }), { plan: 'baslangic', stores: 5, users: 2 }, 'elle girilen sınır önce gelir');
});

test('Başlangıç paketi: mağaza / kullanıcı sınırı ve Profesyonel özellikleri kapalı; paket yükseltilince açılır', async () => {
  resetChannels();
  const { owner, tenant } = setup();
  await owner('/api/login', J({ password: 'x-123456' }));
  assert.equal((await owner('/api/tenants', J({ slug: 'kucuk', name: 'Küçük Mağaza', admin_username: 'ali', admin_password: 'gizli-sifre-1', plan: 'Başlangıç' }))).status, 200);
  assert.equal((await tenant('/api/login', J({ tenant: 'kucuk', username: 'ali', password: 'gizli-sifre-1' }))).status, 200);
  const me = await (await tenant('/api/me')).json();
  assert.equal(me.tenant.planName, 'Başlangıç');
  assert.ok(me.tenant.locked.includes('buybox') && me.tenant.locked.includes('bulk'));
  // 3 mağaza bağlanır, 4. reddedilir; var olanı güncellemek serbest
  const put = (id, values) => tenant(`/api/integrations/${id}`, J({ values }, 'PUT'));
  assert.equal((await put('trendyol', { TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' })).status, 200);
  assert.equal((await put('hepsiburada', { HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'p' })).status, 200);
  assert.equal((await put('n11', { N11_APP_KEY: 'a', N11_APP_SECRET: 'b' })).status, 200);
  const r4 = await put('idefix', { IDEFIX_VENDOR_ID: '1', IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's' });
  assert.equal(r4.status, 403); assert.match((await r4.json()).error, /mağaza sınırına ulaşıldı \(3/);
  assert.equal((await put('trendyol', { TRENDYOL_API_KEY: 'k2' })).status, 200, 'bağlı mağaza güncellenebilir');
  // Kullanıcı sınırı: 2
  assert.equal((await tenant('/api/users', J({ username: 'veli', password: 'gizli-sifre-2', role: 'staff' }))).status, 200);
  assert.equal((await tenant('/api/users', J({ username: 'ayse', password: 'gizli-sifre-3', role: 'staff' }))).status, 400);
  // Profesyonel özellikleri
  const pr = await tenant('/api/price-rules', J({ channel: 'trendyol', remote_id: 'x', enabled: true, min_price: 1, max_price: 2 }, 'PUT'));
  assert.equal(pr.status, 403); assert.match((await pr.json()).error, /Profesyonel paketinde var/);
  assert.equal((await tenant('/api/products.csv')).status, 403);
  assert.equal((await tenant('/api/settings', J({ autoprice: true }, 'PUT'))).status, 403);
  assert.equal((await tenant('/api/settings', J({ low_stock: 3 }, 'PUT'))).status, 200, 'diğer ayarlar kaydedilir');
  // Paket yükseltildi: kısıtlar hemen kalkar
  assert.equal((await owner('/api/tenants/kucuk', J({ plan: 'Profesyonel' }, 'PUT'))).status, 200);
  assert.equal((await tenant('/api/products.csv')).status, 200);
  assert.equal((await put('idefix', { IDEFIX_VENDOR_ID: '1', IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's' })).status, 200);
  assert.equal((await (await tenant('/api/me')).json()).tenant.locked.sort().join(','), 'carrier,fx,stockapi', 'yalnız Kurumsal özellikleri (kargo entegrasyonu, Stok API, döviz endeksli fiyat) kilitli');
});

test('süresi dolan panel: giriş mesajı iletişim bilgisi verir, arka plan senkronu durur, yenilenince devam eder', async () => {
  resetChannels();
  const { env, owner, tenant } = setup();
  await owner('/api/login', J({ password: 'x-123456' }));
  await owner('/api/settings', J({ company: { title: 'Hastürk', phone: '+90 553 942 29 61', email: 'info@hasturkcrm.com' } }, 'PUT'));
  assert.equal((await owner('/api/tenants', J({ slug: 'eski', name: 'Eski Firma', admin_username: 'ali', admin_password: 'gizli-sifre-1', trial: true }))).status, 200);
  await run(env.DB, 'UPDATE tenants SET expires_at = ? WHERE slug = ?', Date.now() - 1000, 'eski');
  const lg = await tenant('/api/login', J({ tenant: 'eski', username: 'ali', password: 'gizli-sifre-1' }));
  assert.equal(lg.status, 403);
  const msg = (await lg.json()).error;
  assert.match(msg, /deneme süreniz doldu/); assert.match(msg, /\+90 553 942 29 61/);
  // Panel bitiş tarihini biliyor: alarm senkron yapmadan döner
  const obj = env.TENANT.get(env.TENANT.idFromName('eski'));
  await owner('/api/tenants/eski', J({ note: 'x' }, 'PUT')); // panele güncel bilgi gider
  obj.t.expires = Date.now() - 1000;
  let synced = false;
  const orig = obj.reportSyncErrors; obj.reportSyncErrors = async () => { synced = true; };
  await obj.alarm();
  assert.equal(synced, false, 'süresi dolmuş panel senkron yapmaz');
  assert.ok(await obj.ctx.storage.getAlarm(), 'zamanlayıcı korunur');
  obj.reportSyncErrors = orig;
  // Ödeme kaydı: süre uzar, panel yeni tarihi öğrenir
  assert.equal((await owner('/api/tenants/eski/payments', J({ amount: 1990, months: 1 }))).status, 200);
  assert.ok(obj.t.expires > Date.now());
  assert.equal((await tenant('/api/login', J({ tenant: 'eski', username: 'ali', password: 'gizli-sifre-1' }))).status, 200);
});

test('şifremi unuttum: hesap varlığı belli edilmez; e-postadaki bağlantıyla şifre bir kez yenilenir', async () => {
  resetChannels();
  const { env, owner, tenant } = setup();
  await owner('/api/login', J({ password: 'x-123456' }));
  await owner('/api/tenants', J({ slug: 'unutkan', name: 'Unutkan', admin_username: 'ali', admin_password: 'gizli-sifre-1' }));
  const f1 = await (await tenant('/api/password/forgot', J({ tenant: 'unutkan', who: 'yok-boyle' }))).json();
  const f2 = await (await tenant('/api/password/forgot', J({ tenant: 'olmayan-firma', who: 'ali' }))).json();
  assert.equal(f1.message, f2.message, 'aynı yanıt');
  const obj = env.TENANT.get(env.TENANT.idFromName('unutkan'));
  const uid = (await first(obj.db, "SELECT id FROM users WHERE username = 'ali'")).id;
  const tok = await createToken(obj.db, uid, 3600e3);
  const bad = await tenant('/api/password/reset', J({ key: 'unutkan.' + 'a'.repeat(48), password: 'yeni-sifre-99' }));
  assert.equal(bad.status, 400);
  const ok = await tenant('/api/password/reset', J({ key: `unutkan.${tok}`, password: 'yeni-sifre-99' }));
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal((await tenant('/api/password/reset', J({ key: `unutkan.${tok}`, password: 'baska-sifre-1' }))).status, 400, 'bağlantı tek kullanımlık');
  assert.equal((await tenant('/api/login', J({ tenant: 'unutkan', username: 'ali', password: 'gizli-sifre-1' }))).status, 401, 'eski şifre geçmez');
  assert.equal((await tenant('/api/login', J({ tenant: 'unutkan', username: 'ali', password: 'yeni-sifre-99' }))).status, 200);
});

test('kendi anlaşmalı kargo entegrasyonu yalnız Kurumsal pakette', async () => {
  const { requireFeature, allows } = await import('../src/plans.js');
  assert.equal(allows({ TENANT_SLUG: 'a', TENANT_PLAN: 'profesyonel' }, 'carrier'), false);
  assert.equal(allows({ TENANT_SLUG: 'a', TENANT_PLAN: 'kurumsal' }, 'carrier'), true);
  assert.throws(() => requireFeature({ TENANT_SLUG: 'a', TENANT_PLAN: 'baslangic' }, 'carrier'), /Kurumsal paketinde var/);
});
