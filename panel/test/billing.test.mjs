// Online paket satışı (iyzico): imza, yeni müşteri satın alması → panel açılır, yenileme, tek sefer işleme, tutar doğrulaması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { authHeader } from '../src/iyzico.js';
import { all, first, run } from '../src/db.js';

test('iyzico IYZWSv2 imzası', async () => {
  const h = await authHeader('api-k', 'sec-k', '/payment/x', '{"a":1}', '123');
  const sig = createHmac('sha256', 'sec-k').update('123/payment/x{"a":1}').digest('hex');
  assert.equal(h, 'IYZWSv2 ' + Buffer.from(`apiKey:api-k&randomKey:123&signature:${sig}`).toString('base64'));
});

function setup() {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1(), IYZICO_API_KEY: 'k', IYZICO_SECRET_KEY: 's', IYZICO_SANDBOX: '1', SITE_ORIGINS: 'https://hasturkcrm.com' };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = { owner: '', tenant: '' };
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who], ...(opts.headers || {}) } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  // iyzico taklidi: initialize → token + ödeme sayfası; detail → kayıtlı sonuç
  const iyz = { inits: [], result: null };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url);
    if (!u.startsWith('https://sandbox-api.iyzipay.com')) return real(url, o);
    assert.match(o.headers.Authorization, /^IYZWSv2 /);
    const b = JSON.parse(o.body);
    if (u.endsWith('/checkoutform/initialize/auth/ecom')) { iyz.inits.push(b); return new Response(JSON.stringify({ status: 'success', token: 'tok-' + iyz.inits.length, paymentPageUrl: 'https://sandbox-cpp.iyzipay.com?token=tok-' + iyz.inits.length })); }
    if (u.endsWith('/checkoutform/auth/ecom/detail')) return new Response(JSON.stringify(iyz.result(b)));
    return new Response('{}', { status: 404 });
  };
  const site = (body) => worker.fetch(new Request('https://panel.test/api/public/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://hasturkcrm.com' }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  const callback = (token) => worker.fetch(new Request('https://panel.test/api/public/checkout/callback', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://sandbox-cpp.iyzipay.com' }, body: 'token=' + token }), env, { waitUntil() {} });
  return { env, jar, owner: call('owner'), tenant: call('tenant'), iyz, site, callback, restore: () => { globalThis.fetch = real; } };
}
const buyer = { contact: 'Ayşe Yılmaz', email: 'ayse@ornek.com', phone: '0532 111 22 33', city: 'Konya', address: 'Selçuklu Mah. 1. Sok. No:2', consent: true };
const ok = (iyz, price) => iyz.result = (b) => ({ status: 'success', paymentStatus: 'SUCCESS', fraudStatus: 1, basketId: b.conversationId, conversationId: b.conversationId, price, paidPrice: price, paymentId: 'P' + b.conversationId, installment: 3 });

test('yeni müşteri: siteden satın alır, ödeme onaylanınca panel seçtiği şifreyle açılır; ikinci dönüş tekrar işlemez', async () => {
  resetChannels();
  const s = setup();
  try {
    const r = await s.site({ kind: 'new', plan: 'profesyonel', period: 'yearly', firm: 'Yeşil Bahçe', slug: 'yesil-bahce', username: 'ayse', password: 'gizli-sifre-9', ...buyer });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.match(j.url, /sandbox-cpp/);
    const init = s.iyz.inits[0];
    assert.equal(init.price, '19900.00', 'tutar sunucudaki fiyattan');
    assert.deepEqual(init.enabledInstallments, [1, 2, 3], 'yıllıkta 3 taksit');
    assert.equal(init.buyer.gsmNumber, '+905321112233');
    assert.equal(init.basketItems[0].itemType, 'VIRTUAL');
    // Ödeme sayfasında tarayıcıdan gelen tutar dikkate alınmaz; şifre siparişte yalnız özetiyle durur
    const o = await first(s.env.DB, 'SELECT * FROM sales_orders WHERE id = ?', init.conversationId);
    assert.match(o.pass_hash, /^pbkdf2/); assert.ok(!JSON.stringify(o).includes('gizli-sifre-9'));
    ok(s.iyz, '19900.0');
    const cb = await s.callback('tok-1');
    const html = await cb.text();
    assert.equal(cb.status, 200); assert.match(html, /Paneliniz hazır/); assert.match(html, /yesil-bahce/);
    const t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'yesil-bahce'");
    assert.equal(t.plan, 'Profesyonel'); assert.equal(t.email, 'ayse@ornek.com');
    assert.ok(t.expires_at > Date.now() + 360 * 864e5, '12 ay');
    const pays = await all(s.env.DB, "SELECT * FROM tenant_payments WHERE slug = 'yesil-bahce'");
    assert.equal(pays.length, 1); assert.equal(pays[0].amount, 19900); assert.match(pays[0].note, /3 taksit/);
    // Sayfa yenilendi / iyzico ikinci kez gönderdi: tek ödeme kaydı kalır
    assert.match(await (await s.callback('tok-1')).text(), /Paneliniz hazır/);
    assert.equal((await all(s.env.DB, "SELECT * FROM tenant_payments WHERE slug = 'yesil-bahce'")).length, 1);
    assert.equal((await first(s.env.DB, 'SELECT pass_hash FROM sales_orders WHERE id = ?', init.conversationId)).pass_hash, null, 'şifre özeti işlem sonrası silinir');
    // Seçtiği şifreyle giriş
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'yesil-bahce', username: 'ayse', password: 'gizli-sifre-9' }) })).status, 200);
    const me = await (await s.tenant('/api/me')).json();
    assert.equal(me.tenant.planName, 'Profesyonel');
  } finally { s.restore(); }
});

test('ödeme onaylanmazsa ya da tutar uyuşmazsa panel açılmaz; firma kodu çakışması önceden reddedilir', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.site({ kind: 'new', plan: 'baslangic', period: 'monthly', firm: 'A Firma', slug: 'a-firma', username: 'ali', password: 'gizli-sifre-1', ...buyer });
    ok(s.iyz, '1.00'); // tutar oynanmış
    const html = await (await s.callback('tok-1')).text();
    assert.match(html, /Ödeme tamamlanmadı/);
    assert.equal(await first(s.env.DB, "SELECT 1 FROM tenants WHERE slug = 'a-firma'"), null);
    s.iyz.result = (b) => ({ status: 'failure', errorMessage: 'Kart limiti yetersiz', basketId: b.conversationId });
    await s.site({ kind: 'new', plan: 'baslangic', period: 'monthly', firm: 'B Firma', slug: 'b-firma', username: 'ali', password: 'gizli-sifre-1', ...buyer });
    assert.match(await (await s.callback('tok-2')).text(), /Kart limiti yetersiz/);
    // Geçersiz paket / onaysız sözleşme / izinsiz site
    assert.equal((await s.site({ kind: 'new', plan: 'yok', period: 'yearly', ...buyer })).status, 400);
    assert.equal((await s.site({ kind: 'new', plan: 'baslangic', period: 'yearly', firm: 'C', slug: 'c-firma', username: 'ali', password: 'gizli-sifre-1', ...buyer, consent: false })).status, 400);
    const bad = await worker.fetch(new Request('https://panel.test/api/public/checkout', { method: 'POST', headers: { Origin: 'https://kotu.site' }, body: '{}' }), s.env, { waitUntil() {} });
    assert.equal(bad.status, 403);
  } finally { s.restore(); }
});

test('mevcut müşteri: siteden (firma kodu + e-posta) ve panelden (Paketim) yeniler / yükseltir', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.owner('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await s.owner('/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'eski-musteri', name: 'Eski Müşteri', admin_username: 'veli', admin_password: 'gizli-sifre-2', plan: 'Başlangıç', email: 'veli@ornek.com', trial: true, welcome: false }) });
    await run(s.env.DB, "UPDATE tenants SET expires_at = ? WHERE slug = 'eski-musteri'", Date.now() - 864e5); // süresi dolmuş
    assert.equal((await s.site({ kind: 'renew', slug: 'eski-musteri', plan: 'profesyonel', period: 'monthly', ...buyer, email: 'baska@ornek.com' })).status, 400, 'e-posta eşleşmeli');
    const r = await s.site({ kind: 'renew', slug: 'eski-musteri', plan: 'profesyonel', period: 'monthly', ...buyer, email: 'veli@ornek.com' });
    assert.equal(r.status, 200);
    ok(s.iyz, '1990.00');
    assert.match(await (await s.callback('tok-1')).text(), /Ödemeniz alındı/);
    let t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'eski-musteri'");
    assert.equal(t.plan, 'Profesyonel'); assert.equal(t.trial, 0); assert.ok(t.expires_at > Date.now() + 27 * 864e5);
    // Panelden: Paketim → yıllık Kurumsal
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'eski-musteri', username: 'veli', password: 'gizli-sifre-2' }) })).status, 200);
    const g = await (await s.tenant('/api/billing')).json();
    assert.equal(g.current.plan, 'Profesyonel'); assert.equal(g.plans.length, 3); assert.equal(g.payments.length, 1);
    const before = t.expires_at;
    const c = await s.tenant('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'kurumsal', period: 'yearly', ...buyer }) });
    assert.equal(c.status, 200, await c.clone().text());
    ok(s.iyz, '39900.00');
    assert.match(await (await s.callback('tok-2')).text(), /Ödemeniz alındı/);
    t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'eski-musteri'");
    assert.equal(t.plan, 'Kurumsal'); assert.ok(t.expires_at > before + 360 * 864e5, 'süre mevcut bitişin üstüne eklenir');
    const me = await (await s.tenant('/api/me')).json();
    assert.equal(me.tenant.planName, 'Kurumsal', 'paket panele hemen iletildi');
  } finally { s.restore(); }
});
