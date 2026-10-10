// Güvenlik denetimi düzeltmeleri: platform gizli bilgileri müşteri paneline sızmaz, ödeme sonrası değişen abonelikte bekleyen
// sipariş uygulanmaz, iki adımlı doğrulama açıkken yeniden kurulmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveEnv } from '../src/config.js';
import { tenantEnv } from '../src/tenants.js';

const PLATFORM = { MAIL_PROVIDER: 'smtp', MAIL_SMTP_HOST: 'smtp.platform.com', MAIL_SMTP_USER: 'bildirim@platform.com', MAIL_SMTP_PASS: 'platform-sifre', HB_PROXY_URL: 'https://proxy.platform.com', HB_PROXY_KEY: 'platform-anahtar', HB_USER_AGENT: 'hasturk' };
const tenant = (extra = {}) => ({ TENANT_SLUG: 'firma', PLATFORM_KEYS: Object.keys(PLATFORM).join(','), ...PLATFORM, ...extra });

test('müşteri tek bir e-posta alanını değiştirirse platformun e-posta şifresi kullanılmaz', () => {
  const e = effectiveEnv(tenant(), { mail: { values: { MAIL_SMTP_HOST: 'evil.example' } } });
  assert.equal(e.MAIL_SMTP_HOST, 'evil.example');
  assert.equal(e.MAIL_SMTP_PASS, undefined, 'platform şifresi saldırganın sunucusuna gitmez');
  assert.equal(e.MAIL_SMTP_USER, undefined);
  assert.equal(e.HB_PROXY_KEY, 'platform-anahtar', 'diğer grup etkilenmez');
  // Müşteri hiçbir şey girmediyse platform servisi kullanılır
  assert.equal(effectiveEnv(tenant(), {}).MAIL_SMTP_PASS, 'platform-sifre');
  // Kendi servisini tam girerse kendi bilgileri
  const own = effectiveEnv(tenant(), { mail: { values: { MAIL_PROVIDER: 'brevo', MAIL_API_KEY: 'kendi', MAIL_FROM: 'a@b.co' } } });
  assert.deepEqual([own.MAIL_PROVIDER, own.MAIL_API_KEY, own.MAIL_SMTP_PASS], ['brevo', 'kendi', undefined]);
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
