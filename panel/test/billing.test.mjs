// Online paket satışı (iyzico): imza, yeni müşteri satın alması → panel açılır, yenileme, tek sefer işleme, tutar doğrulaması,
// fatura bilgisi (bireysel / kurumsal) doğrulaması ve saklanması, panel sahibine satış e-postası.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { authHeader } from '../src/iyzico.js';
import { all, first, run, init, setSetting } from '../src/db.js';
import { validTckn, invoiceOf, openTemp, slugFrom, tempPassword } from '../src/billing.js';
import { validPhone } from '../src/lead.js';

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
const invoice = { type: 'bireysel', name: 'Ayşe Yılmaz', tckn: '10000000146', address: 'Selçuklu Mah. 1. Sok. No:2', district: 'Selçuklu', city: 'Konya' };
const buyer = { email: 'ayse@ornek.com', phone: '0532 111 22 33', invoice, consent: true };
const ok = (iyz, price) => iyz.result = (b) => ({ status: 'success', paymentStatus: 'SUCCESS', fraudStatus: 1, basketId: b.conversationId, conversationId: b.conversationId, price, paidPrice: price, paymentId: 'P' + b.conversationId, installment: 3 });

test('yeni müşteri: siteden satın alır; firma kodu, kullanıcı adı ve geçici şifre otomatik; ilk girişte şifre değiştirilir; ikinci dönüş tekrar işlemez', async () => {
  resetChannels();
  const s = setup();
  try {
    // Formdan gelen firma kodu / kullanıcı adı / şifre dikkate alınmaz: sunucu üretir
    const r = await s.site({ kind: 'new', plan: 'profesyonel', period: 'yearly', firm: 'Yeşil Bahçe Tarım Ltd. Şti.', slug: 'baska-kod', username: 'ayse', password: 'gizli-sifre-9', ...buyer });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.match(j.url, /sandbox-cpp/);
    const init = s.iyz.inits[0];
    assert.equal(init.price, '19900.00', 'tutar sunucudaki fiyattan');
    assert.equal(init.enabledInstallments, undefined, 'taksit kısıtlanmaz: bankanın sunduğu tüm seçenekler (12 taksite kadar)');
    assert.equal(init.buyer.gsmNumber, '+905321112233');
    assert.equal(init.basketItems[0].itemType, 'VIRTUAL');
    // Ödeme sayfasında tarayıcıdan gelen tutar dikkate alınmaz; şifre siparişte yalnız özetiyle durur
    const o = await first(s.env.DB, 'SELECT * FROM sales_orders WHERE id = ?', init.conversationId);
    assert.equal(o.slug, 'yesil-bahce-tarim', 'firma kodu firma adından'); assert.equal(o.username, 'yonetici');
    const temp = await openTemp(s.env, o.pass_tmp);
    assert.match(temp, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    assert.match(o.pass_hash, /^pbkdf2/); assert.ok(!JSON.stringify(o).includes(temp), 'geçici şifre açık yazılmaz');
    ok(s.iyz, '19900.0');
    // Siteden satış: sitenin teşekkür sayfasına yönlendirilir (reklam dönüşümü); adreste firma kodu / kullanıcı adı yok
    const cb = await s.callback('tok-1');
    assert.equal(cb.status, 303);
    const loc = new URL(cb.headers.get('location'));
    assert.equal(loc.origin + loc.pathname, 'https://hasturkcrm.com/odeme-basarili');
    assert.equal(loc.searchParams.get('siparis'), init.conversationId); assert.equal(loc.searchParams.get('tutar'), '19900');
    assert.equal(loc.searchParams.get('tur'), 'yeni'); assert.equal(loc.searchParams.get('donem'), 'yillik');
    assert.doesNotMatch(loc.search, /yesil-bahce|yonetici/);
    const t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'yesil-bahce-tarim'");
    assert.equal(t.plan, 'Profesyonel'); assert.equal(t.email, 'ayse@ornek.com');
    assert.ok(t.expires_at > Date.now() + 360 * 864e5, '12 ay');
    const pays = await all(s.env.DB, "SELECT * FROM tenant_payments WHERE slug = 'yesil-bahce-tarim'");
    assert.equal(pays.length, 1); assert.equal(pays[0].amount, 19900); assert.match(pays[0].note, /3 taksit/);
    // Sayfa yenilendi / iyzico ikinci kez gönderdi: tek ödeme kaydı kalır
    assert.match((await s.callback('tok-1')).headers.get('location'), /\/odeme-basarili\?/);
    assert.equal((await all(s.env.DB, "SELECT * FROM tenant_payments WHERE slug = 'yesil-bahce-tarim'")).length, 1);
    const done = await first(s.env.DB, 'SELECT pass_hash, pass_tmp FROM sales_orders WHERE id = ?', init.conversationId);
    assert.equal(done.pass_hash, null, 'şifre özeti işlem sonrası silinir'); assert.equal(done.pass_tmp, null, 'geçici şifre işlem sonrası silinir');
    // Geçici şifreyle giriş: yalnız şifre değiştirme çalışır
    const login = (pw) => s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'yesil-bahce-tarim', username: 'yonetici', password: pw }) });
    assert.equal((await login(temp)).status, 200);
    const me = await (await s.tenant('/api/me')).json();
    assert.equal(me.tenant.planName, 'Profesyonel'); assert.equal(me.user.mustChange, true);
    const blocked = await s.tenant('/api/orders');
    assert.equal(blocked.status, 403); assert.equal((await blocked.json()).mustChange, true);
    assert.equal((await s.tenant('/api/me/password', { method: 'POST', body: JSON.stringify({ old: temp, new: temp }) })).status, 400, 'aynı şifre olmaz');
    assert.equal((await s.tenant('/api/me/password', { method: 'POST', body: JSON.stringify({ old: temp, new: 'yeni-sifre-77' }) })).status, 200);
    assert.equal((await login(temp)).status, 401, 'geçici şifre artık geçmez');
    assert.equal((await login('yeni-sifre-77')).status, 200);
    assert.equal((await (await s.tenant('/api/me')).json()).user.mustChange, undefined);
    assert.equal((await s.tenant('/api/orders')).status, 200);
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
    assert.match((await s.callback('tok-1')).headers.get('location'), /\/odeme-basarili\?.*tur=yenileme/);
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

test('site için online satış durumu: API bilgisi yokken kapalı', async () => {
  const call = (env) => worker.fetch(new Request('https://panel.test/api/public/checkout/status', { headers: { Origin: 'https://hasturkcrm.com' } }), env, { waitUntil() {} });
  const off = await call({ DB: d1() });
  assert.deepEqual(await off.json(), { online: false });
  assert.equal(off.headers.get('access-control-allow-origin'), 'https://hasturkcrm.com');
  assert.deepEqual(await (await call({ DB: d1(), IYZICO_API_KEY: 'k', IYZICO_SECRET_KEY: 's' })).json(), { online: true });
});

test('fatura bilgisi doğrulaması: TC kimlik no, vergi no, telefon', () => {
  assert.equal(validTckn('10000000146'), true);
  assert.equal(validTckn('10000000145'), false, 'kontrol hanesi');
  assert.equal(validTckn('00000000146'), false, 'ilk hane 0 olamaz');
  assert.equal(validTckn('1000000014'), false);
  for (const ok of ['0532 111 22 33', '+90 (532) 111-22-33', '5321112233', '0212 555 00 00', '0850 123 45 67']) assert.equal(validPhone(ok), true, ok);
  for (const bad of ['0555', '0155 000 00 00', '0532 111 22 3x', '', '00532 111 22 33 4']) assert.equal(validPhone(bad), false, bad);
  const err = (v) => { try { invoiceOf(v); return ''; } catch (e) { return e.message; } };
  const adr = { address: 'Atatürk Cad. No:5', district: 'Kadıköy', city: 'İstanbul' };
  assert.equal(err({ type: 'bireysel', name: 'Ayşe Yılmaz', tckn: '10000000146', ...adr }), '');
  assert.match(err({ type: 'bireysel', name: 'Ayşe Yılmaz', tckn: '12345678901', ...adr }), /TC kimlik/);
  assert.match(err({ type: 'bireysel', name: 'Ayşe', tckn: '10000000146', ...adr }), /soyad/);
  assert.match(err({ type: 'bireysel', name: 'Ayşe Yılmaz', tckn: '10000000146', ...adr, district: '' }), /ilçe/);
  const corp = { type: 'kurumsal', company: 'Yeşil Bahçe Ltd. Şti.', taxOffice: 'Kadıköy', taxNo: '1234567890', contact: 'Ali Veli', efatura: true, ...adr };
  assert.equal(err(corp), '');
  assert.equal(err({ ...corp, taxNo: '10000000146' }), '', 'şahıs şirketi: TC kimlik no');
  assert.match(err({ ...corp, taxNo: '123456789' }), /Vergi numarası/);
  assert.match(err({ ...corp, taxOffice: '' }), /Vergi dairesi/);
  assert.match(err({ ...corp, company: '' }), /unvan/);
  assert.deepEqual(Object.keys(invoiceOf(corp)).sort(), ['address', 'city', 'company', 'contact', 'district', 'efatura', 'taxNo', 'taxOffice', 'type'].sort(), 'yalnız bilinen alanlar saklanır');
});

test('fatura bilgisi: siteden zorunlu alanlar, iyzico alıcı / fatura adresi, firma kartı, ödeme kaydı ve panel sahibine e-posta', async () => {
  resetChannels();
  const s = setup();
  // Panel sahibinin e-postası ve e-posta servisi (Brevo); gönderilen e-postalar yakalanır
  Object.assign(s.env, { MAIL_PROVIDER: 'brevo', MAIL_API_KEY: 'k-1', MAIL_FROM: 'bildirim@hasturkcrm.com' });
  await init(s.env.DB);
  await setSetting(s.env.DB, 'company', { email: 'sahip@hasturkcrm.com' });
  const mails = [], mock = globalThis.fetch;
  let mailDown = false;
  globalThis.fetch = async (url, o) => {
    if (String(url).startsWith('https://api.brevo.com')) {
      if (mailDown) return new Response('{"message":"servis kapalı"}', { status: 500 });
      const m = JSON.parse(o.body); if (m.to && m.to[0].email === 'sahip@hasturkcrm.com') mails.push(m); // müşterinin hoş geldiniz e-postası sayılmaz
      return new Response('{"messageId":"m1"}', { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    return mock(url, o);
  };
  try {
    const base = { kind: 'new', plan: 'kurumsal', period: 'monthly', firm: 'Yeşil Bahçe', consent: true };
    const corp = { type: 'kurumsal', company: 'Yeşil Bahçe Tarım Ltd. Şti.', taxOffice: 'Selçuk', taxNo: '1234567890', contact: 'Ali Veli', efatura: true, address: 'Bosna Hersek Mah. 12. Sok. No:3', district: 'Selçuklu', city: 'Konya' };
    // E-posta, telefon ve fatura bilgisi zorunlu
    const no = async (b, re) => { const r = await s.site(b); assert.equal(r.status, 400); assert.match((await r.json()).error, re); };
    await no({ ...base, phone: '0532 111 22 33', invoice: corp }, /e-posta/);
    await no({ ...base, email: 'ali@ornek.com', invoice: corp }, /telefon/);
    await no({ ...base, email: 'ali@ornek.com', phone: '0532 111', invoice: corp }, /telefon/);
    await no({ ...base, email: 'ali@ornek.com', phone: '0532 111 22 33' }, /soyad|TC/);
    await no({ ...base, email: 'ali@ornek.com', phone: '0532 111 22 33', invoice: { ...corp, taxNo: '12' } }, /Vergi numarası/);
    assert.equal(s.iyz.inits.length, 0);
    const r = await s.site({ ...base, email: 'ali@ornek.com', phone: '0532 111 22 33', invoice: corp });
    assert.equal(r.status, 200, await r.clone().text());
    const init1 = s.iyz.inits[0];
    assert.equal(init1.billingAddress.contactName, 'Yeşil Bahçe Tarım Ltd. Şti.', 'kurumsalda fatura adı firma unvanı');
    assert.equal(init1.billingAddress.city, 'Konya'); assert.match(init1.billingAddress.address, /Bosna Hersek.*Selçuklu \/ Konya/);
    assert.equal(init1.buyer.name, 'Ali'); assert.equal(init1.buyer.surname, 'Veli'); assert.equal(init1.buyer.identityNumber, '11111111111', 'VKN kimlik no olarak gönderilmez');
    const o = await first(s.env.DB, 'SELECT buyer FROM sales_orders WHERE id = ?', init1.conversationId);
    assert.equal(JSON.parse(o.buyer).invoice.taxNo, '1234567890');
    const temp = await openTemp(s.env, (await first(s.env.DB, 'SELECT pass_tmp FROM sales_orders WHERE id = ?', init1.conversationId)).pass_tmp);
    ok(s.iyz, '3990.00');
    assert.equal((await s.callback('tok-1')).status, 303);
    // Firma kartı ve ödeme kaydı
    const t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'yesil-bahce'");
    assert.equal(t.legal, 'Yeşil Bahçe Tarım Ltd. Şti.'); assert.equal(t.tax, 'Selçuk / 1234567890'); assert.equal(t.city, 'Konya'); assert.match(t.address, /Selçuklu$/);
    const pay = await first(s.env.DB, "SELECT invoice FROM tenant_payments WHERE slug = 'yesil-bahce'");
    const pinv = JSON.parse(pay.invoice);
    assert.equal(pinv.type, 'kurumsal'); assert.equal(pinv.efatura, true); assert.equal(pinv.email, 'ali@ornek.com'); assert.equal(pinv.phone, '0532 111 22 33');
    // Panel sahibine e-posta: firma, paket, tutar, alıcı ve fatura bilgileri
    assert.equal(mails.length, 1);
    assert.deepEqual(mails[0].to, [{ email: 'sahip@hasturkcrm.com' }]);
    assert.match(mails[0].subject, /Yeni satış: Yeşil Bahçe · Kurumsal \(aylık\)/);
    for (const x of ['yesil-bahce', '3.990 TL', 'Ali Veli', 'ali@ornek.com', '0532 111 22 33', 'Kurumsal', 'Selçuk', '1234567890', 'e-Fatura mükellefi', 'Bosna Hersek', '/#/firmalar']) assert.ok(mails[0].htmlContent.includes(x), x);

    // Yenileme (siteden, bireysel): e-posta servisi çalışmasa da ödeme tamamlanır; firma kartı yeni fatura bilgisiyle güncellenir
    mailDown = true;
    const ind = { type: 'bireysel', name: 'Ayşe Yılmaz', tckn: '10000000146', address: 'Mevlana Cad. No:7 D:2', district: 'Meram', city: 'Konya' };
    const r2 = await s.site({ kind: 'renew', slug: 'yesil-bahce', plan: 'kurumsal', period: 'monthly', email: 'ali@ornek.com', phone: '0332 222 33 44', invoice: ind, consent: true });
    assert.equal(r2.status, 200, await r2.clone().text());
    const init2 = s.iyz.inits[1];
    assert.equal(init2.buyer.identityNumber, '10000000146', 'bireyselde TC kimlik no'); assert.equal(init2.billingAddress.contactName, 'Ayşe Yılmaz');
    assert.equal((await s.callback('tok-2')).status, 303);
    const t2 = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'yesil-bahce'");
    assert.equal(t2.legal, 'Ayşe Yılmaz'); assert.equal(t2.tax, 'TC 10000000146'); assert.equal(t2.email, 'ali@ornek.com', 'e-posta değişmez');
    assert.equal((await first(s.env.DB, "SELECT status FROM sales_orders WHERE id = ?", init2.conversationId)).status, 'done');
    assert.equal(mails.length, 1);
    assert.ok(await first(s.env.DB, "SELECT 1 AS x FROM logs WHERE msg LIKE 'Bilgilendirme e-postası gönderilemedi%'"), 'gönderilemeyen e-posta günlüğe yazılır');

    // Paketim: fatura formu son satın almanın bilgileriyle dolu gelir; panelden kurumsal yenileme
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'yesil-bahce', username: 'yonetici', password: temp }) })).status, 200);
    const g = await (await s.tenant('/api/billing')).json();
    assert.equal(g.invoice.type, 'bireysel'); assert.equal(g.invoice.tckn, '10000000146'); assert.equal(g.invoice.district, 'Meram');
    assert.deepEqual(g.plans.find((p) => p.key === 'kurumsal').soon, ['e-Fatura / e-Arşiv entegrasyonu']);
    assert.equal((await s.tenant('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'kurumsal', period: 'monthly', consent: true, invoice: { ...corp, tckn: '' } }) })).status, 200, 'e-posta / telefon firma kartından');
    assert.equal(s.iyz.inits[2].billingAddress.contactName, 'Yeşil Bahçe Tarım Ltd. Şti.');
  } finally { s.restore(); }
});

test('firma kodu firma adından; geçici şifre biçimi', () => {
  assert.equal(slugFrom('Yeşil Bahçe Tarım Ltd. Şti.'), 'yesil-bahce-tarim');
  assert.equal(slugFrom('ÇİÇEK DÜNYASI A.Ş.'), 'cicek-dunyasi');
  assert.equal(slugFrom('Öz'), 'firma');
  assert.match(slugFrom('Çok Uzun Bir Firma Adı Ve Mağaza Sanayi Ticaret'), /^[a-z0-9-]{3,24}$/);
  const a = tempPassword(), b = tempPassword();
  assert.match(a, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/); assert.notEqual(a, b);
  assert.doesNotMatch(a, /[0O1lI]/, 'karışan karakter yok');
});

test('havale / EFT: sipariş "havale bekleniyor" kaydedilir (yalnız yıllıkta %5 indirim); yönetici onaylayınca panel açılır', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.owner('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    const r = await s.site({ kind: 'new', plan: 'profesyonel', period: 'yearly', pay: 'eft', firm: 'Havale Firma', ...buyer });
    const j = await r.json();
    assert.equal(r.status, 200, JSON.stringify(j));
    assert.equal(j.eft, true); assert.equal(j.amount, 18905, '19.900 × %95'); assert.equal(j.discount, 5);
    assert.match(j.bank.iban, /^TR63 0020 9000 0207 5858 0000 01$/);
    assert.equal(s.iyz.inits.length, 0, 'iyzico başlatılmaz');
    const m = await (await s.site({ kind: 'new', plan: 'baslangic', period: 'monthly', pay: 'eft', firm: 'Aylık Firma', ...buyer })).json();
    assert.equal(m.amount, 990, 'aylıkta indirim yok'); assert.equal(m.discount, 0);
    const list = await (await s.owner('/api/tenants/eft')).json();
    assert.equal(list.orders.length, 2);
    const o = list.orders.find((x) => x.id === j.order);
    assert.equal(o.firm, 'Havale Firma'); assert.equal(o.amount, 18905);
    // Henüz panel yok; onay → panel açılır, ödeme kaydı indirimli tutarla
    assert.equal(await first(s.env.DB, "SELECT 1 AS x FROM tenants WHERE slug = 'havale-firma'"), null);
    const temp = await openTemp(s.env, (await first(s.env.DB, 'SELECT pass_tmp FROM sales_orders WHERE id = ?', j.order)).pass_tmp);
    const c = await s.owner(`/api/tenants/eft/${j.order}/confirm`, { method: 'POST' });
    assert.equal(c.status, 200, await c.clone().text());
    assert.equal((await c.json()).slug, 'havale-firma');
    const pay = await first(s.env.DB, "SELECT amount, method FROM tenant_payments WHERE slug = 'havale-firma'");
    assert.equal(pay.amount, 18905); assert.equal(pay.method, 'Havale / EFT');
    assert.equal((await s.owner(`/api/tenants/eft/${j.order}/confirm`, { method: 'POST' })).status, 404, 'ikinci onay işlemez');
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'havale-firma', username: 'yonetici', password: temp }) })).status, 200);
    // İptal
    assert.equal((await s.owner(`/api/tenants/eft/${m.order}/cancel`, { method: 'POST' })).status, 200);
    assert.equal((await (await s.owner('/api/tenants/eft')).json()).orders.length, 0);
  } finally { s.restore(); }
});

test('ek mağaza: Paketim\'den lisans bitişine kalan gün için (yıllık 3000 TL) alınır; sınır artar; yenilemede korunup ücrete eklenir', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.owner('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await s.owner('/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'magazaci', name: 'Mağazacı', admin_username: 'ali', admin_password: 'gizli-sifre-3', plan: 'Başlangıç', email: 'ali@ornek.com', welcome: false }) });
    await run(s.env.DB, "UPDATE tenants SET expires_at = ?, trial = 0 WHERE slug = 'magazaci'", Date.now() + 73 * 864e5 - 3600e3); // 73 gün kaldı
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'magazaci', username: 'ali', password: 'gizli-sifre-3' }) })).status, 200);
    const g = await (await s.tenant('/api/billing')).json();
    assert.deepEqual([g.stores.limit, g.stores.base, g.stores.extra, g.stores.used, g.stores.days, g.stores.buyable], [3, 3, 0, 0, 73, true]);
    assert.equal(g.stores.perStore, 600, '3000 × 73 / 365');
    assert.equal((await s.tenant('/api/billing/stores', { method: 'POST', body: JSON.stringify({ qty: 0, ...buyer }) })).status, 400);
    const c = await s.tenant('/api/billing/stores', { method: 'POST', body: JSON.stringify({ qty: 2, ...buyer }) });
    assert.equal(c.status, 200, await c.clone().text());
    assert.equal(s.iyz.inits.at(-1).price, '1200.00', '2 mağaza × 3000 TL × 73 / 365 gün');
    ok(s.iyz, '1200.00');
    assert.match(await (await s.callback('tok-1')).text(), /2 ek mağaza tanımlandı/);
    let t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'magazaci'");
    assert.equal(t.max_stores, 5);
    const me = await (await s.tenant('/api/billing')).json();
    assert.deepEqual([me.stores.limit, me.stores.extra], [5, 2], 'sınır firma paneline hemen iletildi');
    // Aylık Başlangıç yenilemesi: 990 + 2 × 3000 / 12
    await s.tenant('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'baslangic', period: 'monthly', ...buyer }) });
    assert.equal(s.iyz.inits.at(-1).price, '1490.00');
    // Yıllık yenileme: 9900 + 2 × 3000
    await s.tenant('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: 'baslangic', period: 'yearly', ...buyer }) });
    assert.equal(s.iyz.inits.at(-1).price, '15900.00');
  } finally { s.restore(); }
});

test('üst pakete geçiş: aynı dönem fiyat farkı × kalan gün; bitiş tarihi değişmez, paket hemen yükselir, ek mağaza korunur', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.owner('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await s.owner('/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'yukselen', name: 'Yükselen', admin_username: 'efe', admin_password: 'gizli-sifre-5', plan: 'Profesyonel', period: 'yearly', email: 'efe@ornek.com', welcome: false }) });
    const exp = Date.now() + 146 * 864e5 - 3600e3; // 146 gün kaldı
    await run(s.env.DB, "UPDATE tenants SET expires_at = ?, trial = 0, max_stores = 12 WHERE slug = 'yukselen'", exp);
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'yukselen', username: 'efe', password: 'gizli-sifre-5' }) })).status, 200);
    const g = await (await s.tenant('/api/billing')).json();
    assert.equal(g.installments.max, 12);
    assert.equal(g.upgrade.period, 'yearly');
    assert.deepEqual(g.upgrade.options.map((x) => [x.to, x.days, x.amount]), [['kurumsal', 146, 8000]], '(39900 − 19900) × 146 / 365; alt paket listelenmez');
    assert.equal((await s.tenant('/api/billing/upgrade', { method: 'POST', body: JSON.stringify({ plan: 'baslangic', ...buyer }) })).status, 400, 'alt pakete geçiş yok');
    const r = await s.tenant('/api/billing/upgrade', { method: 'POST', body: JSON.stringify({ plan: 'kurumsal', ...buyer }) });
    assert.equal(r.status, 200, await r.clone().text());
    const init = s.iyz.inits.at(-1);
    assert.equal(init.price, '8000.00');
    assert.equal(init.enabledInstallments, undefined);
    assert.match(init.basketItems[0].name, /Profesyonel → Kurumsal paket yükseltme \(146 gün\)/);
    ok(s.iyz, '8000.00');
    assert.match(await (await s.callback('tok-1')).text(), /Paketiniz yükseltildi/);
    const t = await first(s.env.DB, "SELECT * FROM tenants WHERE slug = 'yukselen'");
    assert.equal(t.plan, 'Kurumsal');
    assert.equal(t.expires_at, exp, 'bitiş tarihi değişmedi');
    assert.equal(t.max_stores, null, '12 mağaza < Kurumsal 25: paketin sınırı geçerli');
    const pay = await first(s.env.DB, "SELECT amount, months, note FROM tenant_payments WHERE slug = 'yukselen' ORDER BY at DESC LIMIT 1");
    assert.deepEqual([pay.amount, pay.months], [8000, 0]);
    assert.match(pay.note, /Profesyonel → Kurumsal/);
    const me = await (await s.tenant('/api/billing')).json();
    assert.equal(me.current.plan, 'Kurumsal');
    assert.deepEqual(me.upgrade.options, [], 'en üst pakette yükseltme yok');
  } finally { s.restore(); }
});

test('üst pakete geçiş: aylık abonelikte aylık fark (30 gün üzerinden); denemede kapalı', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.owner('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await s.owner('/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'aylikci', name: 'Aylıkçı', admin_username: 'naz', admin_password: 'gizli-sifre-6', plan: 'Başlangıç', period: 'monthly', email: 'naz@ornek.com', welcome: false }) });
    await run(s.env.DB, "UPDATE tenants SET expires_at = ?, trial = 1 WHERE slug = 'aylikci'", Date.now() + 15 * 864e5 - 3600e3);
    assert.equal((await s.tenant('/api/login', { method: 'POST', body: JSON.stringify({ tenant: 'aylikci', username: 'naz', password: 'gizli-sifre-6' }) })).status, 200);
    assert.equal((await (await s.tenant('/api/billing')).json()).upgrade, null, 'denemede yükseltme yok');
    await run(s.env.DB, "UPDATE tenants SET trial = 0 WHERE slug = 'aylikci'");
    const g = await (await s.tenant('/api/billing')).json();
    assert.deepEqual(g.upgrade.options.map((x) => [x.to, x.amount]), [['profesyonel', 500], ['kurumsal', 1500]], '(1990 − 990) × 15 / 30; (3990 − 990) × 15 / 30');
  } finally { s.restore(); }
});

test('Firmalar → kartla tahsil et: imzalı ödeme bağlantısı, iyzico ödemesi, tahsilat kaydı ve uzatma; sahte / ödenmiş bağlantı', async () => {
  resetChannels();
  const s = setup();
  try {
    await s.owner('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await s.owner('/api/tenants', { method: 'POST', body: JSON.stringify({ slug: 'kartli', name: 'Kartlı Firma', admin_username: 'can', admin_password: 'gizli-sifre-4', plan: 'Profesyonel', email: 'can@ornek.com', phone: '0532 111 22 33', welcome: false }) });
    const before = (await first(s.env.DB, "SELECT expires_at FROM tenants WHERE slug = 'kartli'")).expires_at || Date.now();
    assert.equal((await s.owner('/api/tenants/kartli/charge', { method: 'POST', body: JSON.stringify({ amount: '0' }) })).status, 400);
    const c = await (await s.owner('/api/tenants/kartli/charge', { method: 'POST', body: JSON.stringify({ amount: '1990', months: 1, note: 'Ekim' }) })).json();
    assert.match(c.link, /^https:\/\/panel\.test\/api\/public\/pay\?o=/);
    const pay = (u) => worker.fetch(new Request(u), s.env, { waitUntil() {} });
    assert.equal((await pay(c.link.replace(/.{3}$/, 'xyz'))).status, 400, 'imza bozuk');
    const r = await pay(c.link);
    assert.equal(r.status, 303); assert.match(r.headers.get('location'), /sandbox-cpp\.iyzipay\.com/);
    const init = s.iyz.inits.at(-1);
    assert.equal(init.price, '1990.00'); assert.equal(init.buyer.email, 'can@ornek.com'); assert.match(init.basketItems[0].name, /ödemesi \(1 ay\)/);
    ok(s.iyz, '1990.00');
    assert.match(await (await s.callback('tok-1')).text(), /1\.990 TL ödemeniz alındı/);
    const t = await first(s.env.DB, "SELECT expires_at FROM tenants WHERE slug = 'kartli'");
    assert.ok(t.expires_at > before + 27 * 864e5, 'abonelik uzadı');
    const p = await first(s.env.DB, "SELECT * FROM tenant_payments WHERE slug = 'kartli'");
    assert.equal(p.amount, 1990); assert.equal(p.months, 1); assert.match(p.note, /Ödeme bağlantısı · Ekim/);
    assert.match(await (await pay(c.link)).text(), /ödemesi daha önce alındı/);
  } finally { s.restore(); }
});
