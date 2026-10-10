// Güvenlik denetimi düzeltmeleri: platform gizli bilgileri müşteri paneline sızmaz, ödeme sonrası değişen abonelikte bekleyen
// sipariş uygulanmaz, iki adımlı doğrulama açıkken yeniden kurulmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveEnv } from '../src/config.js';
import { tenantEnv } from '../src/tenants.js';

const PLATFORM = { MAIL_PROVIDER: 'smtp', MAIL_SMTP_HOST: 'smtp.platform.com', MAIL_SMTP_USER: 'bildirim@platform.com', MAIL_SMTP_PASS: 'platform-sifre', HB_PROXY_URL: 'https://proxy.platform.com', HB_PROXY_KEY: 'platform-anahtar', HB_USER_AGENT: 'hasturk' };
const tenant = (extra = {}) => ({ TENANT_SLUG: 'firma', PLATFORM_KEYS: Object.keys(PLATFORM).join(','), ...PLATFORM, ...extra });

test('müşteri panelinde e-posta servisi ayarı yok sayılır: e-postalar yalnız platformun adresinden', () => {
  const e = effectiveEnv(tenant(), { mail: { values: { MAIL_SMTP_HOST: 'evil.example', MAIL_FROM: 'kendi@firma.com' } } });
  assert.equal(e.MAIL_SMTP_HOST, 'smtp.platform.com', 'saldırganın sunucusuna gitmez');
  assert.equal(e.MAIL_FROM, undefined, 'müşterinin kendi adresi kullanılmaz');
  assert.equal(e.MAIL_SMTP_PASS, 'platform-sifre');
  assert.equal(effectiveEnv(tenant(), {}).MAIL_SMTP_PASS, 'platform-sifre');
});

test('Hepsiburada aracı adresi değiştirilirse platform anahtarı gönderilmez', () => {
  const e = effectiveEnv(tenant(), { hepsiburada: { values: { HB_PROXY_URL: 'https://evil.example/x', HB_MERCHANT_ID: 'm' } } });
  assert.equal(e.HB_PROXY_URL, 'https://evil.example/x');
  assert.equal(e.HB_PROXY_KEY, undefined);
  assert.equal(e.HB_USER_AGENT, 'hasturk', 'entegratör adı gizli değil, korunur');
});

test('ana panelde (müşteri değil) değerler alan alan birleşir', () => {
  const e = effectiveEnv({ ...PLATFORM }, { mail: { values: { MAIL_SMTP_HOST: 'yeni.host' } } });
  assert.equal(e.MAIL_SMTP_PASS, 'platform-sifre');
});

test('ana panelin kanal / kargo / servis bilgileri müşteri paneline geçmez', () => {
  const env = { PANEL_SECRET: 's'.repeat(32), AMAZON_REFRESH_TOKEN: 'x', ARAS_PASSWORD: 'x', YURTICI_PASSWORD: 'x', WOO_SECRET: 'x', ANTHROPIC_API_KEY: 'x', SHOPIFY_TOKEN: 'x', KOCTAS_API_KEY: 'x', IYZICO_API_KEY: 'k', TURNSTILE_SITE_KEY: 't' };
  const out = tenantEnv(env, { slug: 'firma', name: 'Firma' });
  for (const k of ['AMAZON_REFRESH_TOKEN', 'ARAS_PASSWORD', 'YURTICI_PASSWORD', 'WOO_SECRET', 'ANTHROPIC_API_KEY', 'SHOPIFY_TOKEN', 'KOCTAS_API_KEY']) assert.equal(out[k], undefined, k);
  assert.equal(out.TURNSTILE_SITE_KEY, 't');
});

test('oturum çerezine fazladan bölüm eklenemez (süresi dolmuş firmada destek oturumu taklidi)', async () => {
  const { currentUser } = await import('../src/auth.js');
  const env = { PANEL_SECRET: 's'.repeat(32), TENANT_SLUG: 'firma' };
  const req = new Request('https://p.test/api/me', { headers: { Cookie: 'hp_session=' + encodeURIComponent('firma~5.' + (Date.now() + 864e5) + '.abc.~-1.x') } });
  assert.equal(await currentUser(req, env, null), null);
});

test('salt-okur personel: döviz fiyatını uygulayamaz, tüm ilanları çeken ağır senkronu başlatamaz', async () => {
  const { d1 } = await import('../dev/d1.mjs');
  const { init } = await import('../src/db.js');
  const { api } = await import('../src/api.js');
  const db = d1(); await init(db);
  const viewer = { id: 7, name: 'İzleyici', role: 'staff', perms: ['products:view', 'orders:view'] };
  const post = (path, b) => api(new Request('https://panel.test/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }), {}, { waitUntil() {} }, db, path, viewer);
  await assert.rejects(() => post('fx/apply', {}), (e) => e.status === 403);
  await assert.rejects(() => post('sync', { listings: true }), (e) => e.status === 403);
});
