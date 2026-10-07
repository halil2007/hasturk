// Online paket satışı (iyzico ödeme formu).
//  - Sitede yeni müşteri: paket + dönem seçer, firma ve giriş bilgilerini yazar, iyzico'da öder → firma paneli kendiliğinden
//    açılır (seçtiği şifreyle girer), hoş geldiniz e-postası gider.
//  - Sitede mevcut müşteri (süresi dolmuş olsa da): firma kodu + firma kartındaki e-postayla süresini yeniler / paket değiştirir.
//  - Panelde: firma yöneticisi Paketim sayfasından satın alır / yeniler / yükseltir.
// Tutar her zaman sunucudaki paket fiyatından (plans.js) alınır. Ödeme sonucu iyzico'dan sunucu tarafında doğrulanır; aynı
// ödeme iki kez işlenmez. Kart bilgisi panele hiç gelmez.
import { all, first, run, init, notify } from './db.js';
import { priceOf, PLANS, INSTALLMENTS_YEARLY } from './plans.js';
import { initCheckout, retrieveCheckout, iyzicoReady } from './iyzico.js';
import { createTenant, recordPayment, checkNewTenant, getTenant, expired, contactLine } from './tenants.js';
import { hashPassword } from './auth.js';
import { notify as pushNotify } from './push.js';
import { siteOrigins } from './lead.js';
import { json, str, fail, HttpError } from './util.js';

const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
const validEmail = (s) => /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(String(s || '').trim());
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const newId = () => 'HS' + Date.now().toString(36).toUpperCase() + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
const PERIOD = { monthly: 'aylık', yearly: 'yıllık' };

// Satın alınabilir paketler (site / panel gösterimi)
export const catalog = () => Object.entries(PLANS).map(([key, p]) => ({ key, name: p.name, monthly: p.monthly, yearly: p.yearly, stores: p.stores, users: p.users }));

async function rateLimit(db, req, key, max) {
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now();
  const row = await first(db, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, `${key}:${ip}`, now, now - 3600e3, now);
  if ((JSON.parse(row.v).n || 0) > max) fail(429, 'Çok fazla deneme; lütfen bir süre sonra tekrar deneyin');
  return ip;
}
function buyerOf(b, ip) {
  const buyer = { name: str(b.contact || b.name).trim().slice(0, 100), firm: str(b.firm).trim().slice(0, 120), email: str(b.email).trim().toLowerCase().slice(0, 120), phone: str(b.phone).trim().slice(0, 30),
    city: str(b.city).trim().slice(0, 60), address: str(b.address).trim().slice(0, 300), identity: str(b.identity).replace(/\D/g, '').slice(0, 11), ip };
  if (buyer.name.split(/\s+/).length < 2) fail(400, 'Yetkili kişinin adını ve soyadını yazın');
  if (!validEmail(buyer.email)) fail(400, 'Geçerli bir e-posta adresi yazın');
  if (buyer.phone.replace(/\D/g, '').length < 10) fail(400, 'Cep telefonu numarasını yazın');
  if (!buyer.city) fail(400, 'Şehir yazın');
  if (buyer.address.length < 5) fail(400, 'Fatura adresini yazın');
  return buyer;
}
async function start(env, db, order, origin) {
  const callback = `${origin}/api/public/checkout/callback`;
  const r = await initCheckout(env, { ...order, buyer: JSON.parse(order.buyer), installments: order.period === 'yearly' ? INSTALLMENTS_YEARLY : [1], name: PLANS[order.plan].name }, callback);
  await run(db, 'UPDATE sales_orders SET token = ?, updated_at = ? WHERE id = ?', r.token, Date.now(), order.id);
  return { ok: true, url: r.url, order: order.id };
}

// Site: online satış açık mı (iyzico API bilgileri girildi mi). Açık değilse sitede "Satın al" bölümleri gösterilmez.
export function checkoutStatus(req, env) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
  const h = siteOrigins(env).includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  return json({ online: iyzicoReady(env) }, 200, { ...h, 'Cache-Control': 'public, max-age=60' });
}

// Siteden: POST /api/public/checkout  { kind: 'new' | 'renew', plan, period, ...alanlar, consent }
export async function publicCheckout(req, env) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
  const allowed = siteOrigins(env).includes(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? cors(origin) : {} });
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405);
  if (!allowed) return json({ error: 'İzin verilmeyen kaynak' }, 403);
  const h = cors(origin);
  try {
    if (!env.DB) fail(503, 'Şu an satış yapılamıyor');
    if (!iyzicoReady(env)) fail(503, 'Online ödeme henüz açılmadı. Satın almak için bizi arayın ya da WhatsApp\'tan yazın.');
    await init(env.DB);
    let b = {};
    try { b = JSON.parse(await req.text()); } catch { fail(400, 'Geçersiz istek'); }
    if (str(b.website)) return json({ ok: true }, 200, h); // bot tuzağı
    const ip = await rateLimit(env.DB, req, 'checkout_rate', 10);
    const p = priceOf(str(b.plan), str(b.period));
    if (!p) fail(400, 'Paket ya da dönem geçersiz');
    if (!b.consent) fail(400, 'Mesafeli satış sözleşmesini ve ön bilgilendirme formunu onaylayın');
    const panel = new URL(req.url).origin, now = Date.now();
    let order;
    if (str(b.kind) === 'renew') {
      // Mevcut müşteri: firma kodu + firma kartındaki e-posta
      const t = await getTenant(env.DB, str(b.slug).toLocaleLowerCase('tr').trim(), true);
      if (!t || !t.email || t.email.trim().toLowerCase() !== str(b.email).trim().toLowerCase()) fail(400, 'Firma kodu ve e-posta eşleşmedi. Firma kartınızdaki e-posta adresini yazın ya da bizimle iletişime geçin.');
      if (!t.active) fail(400, 'Bu firma paneli askıya alınmış. ' + await contactLine(env));
      const buyer = buyerOf({ ...b, firm: t.name }, ip);
      order = { id: newId(), kind: 'renew', slug: t.slug, plan: p.plan, period: p.period, amount: p.amount, buyer: JSON.stringify(buyer) };
    } else {
      const firm = str(b.firm).trim();
      const { slug, username } = await checkNewTenant(env.DB, { slug: b.slug, name: firm, admin_username: b.username });
      if (String(b.password || '').length < 8) fail(400, 'Şifre en az 8 karakter olmalı');
      // Aynı firma kodu için bekleyen başka bir ödeme (son 1 saat) varsa kod ayrılmış sayılır
      if (await first(env.DB, "SELECT 1 AS x FROM sales_orders WHERE kind = 'new' AND slug = ? AND status = 'pending' AND created_at > ?", slug, now - 3600e3)) fail(400, 'Bu firma kodu için devam eden bir ödeme var; birkaç dakika sonra tekrar deneyin ya da başka kod seçin');
      const buyer = buyerOf(b, ip);
      order = { id: newId(), kind: 'new', slug, plan: p.plan, period: p.period, amount: p.amount, buyer: JSON.stringify(buyer), username, pass_hash: await hashPassword(String(b.password)) };
    }
    await run(env.DB, `INSERT INTO sales_orders (id, kind, slug, plan, period, amount, status, buyer, username, pass_hash, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      order.id, order.kind, order.slug, order.plan, order.period, order.amount, order.buyer, order.username || null, order.pass_hash || null, origin, now, now);
    return json(await start(env, env.DB, order, panel), 200, h);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, h);
    console.error('satış başlatılamadı', e);
    return json({ error: 'Ödeme başlatılamadı: ' + (e.message || 'bilinmeyen hata') }, 502, h);
  }
}

// Panelden (firma yöneticisi, oturumlu): Paketim sayfası. t = firma kaydı, user = panel kullanıcısı
export async function tenantBilling(env, t, user, method, path, b, origin) {
  if (!env.DB) fail(503, 'Şu an kullanılamıyor');
  await init(env.DB);
  const rec = await getTenant(env.DB, t.slug, true);
  if (method === 'GET' && path === 'billing') {
    const pays = await all(env.DB, 'SELECT at, amount, months, method, note FROM tenant_payments WHERE slug = ? ORDER BY at DESC LIMIT 50', t.slug);
    return { plans: catalog(), current: { plan: rec.plan || '', expires_at: rec.expires_at || null, trial: !!rec.trial, expired: expired(rec), email: rec.email || '' }, payments: pays, online: iyzicoReady(env), installments: INSTALLMENTS_YEARLY.length };
  }
  if (method === 'POST' && path === 'billing/checkout') {
    if (user.role !== 'admin') fail(403, 'Paket işlemleri yalnız yöneticiye açıktır');
    if (!iyzicoReady(env)) fail(503, 'Online ödeme henüz açılmadı. ' + await contactLine(env));
    const p = priceOf(str(b.plan), str(b.period));
    if (!p) fail(400, 'Paket ya da dönem geçersiz');
    if (!b.consent) fail(400, 'Mesafeli satış sözleşmesini onaylayın');
    const buyer = buyerOf({ ...b, firm: rec.name, email: b.email || rec.email || user.email }, '');
    const now = Date.now(), order = { id: newId(), kind: 'renew', slug: rec.slug, plan: p.plan, period: p.period, amount: p.amount, buyer: JSON.stringify(buyer) };
    await run(env.DB, `INSERT INTO sales_orders (id, kind, slug, plan, period, amount, status, buyer, origin, created_at, updated_at) VALUES (?, 'renew', ?, ?, ?, ?, 'pending', ?, 'panel', ?, ?)`,
      order.id, order.slug, order.plan, order.period, order.amount, order.buyer, now, now);
    return start(env, env.DB, order, origin);
  }
  fail(404, 'Bulunamadı');
}

// iyzico dönüşü: POST (form) token → sonuç sunucuda doğrulanır, sipariş bir kez işlenir; müşteriye sonuç sayfası
export async function checkoutCallback(req, env) {
  const panel = new URL(req.url).origin;
  let token = new URL(req.url).searchParams.get('token') || '';
  if (req.method === 'POST') { try { const f = await req.formData(); token = str(f.get('token')) || token; } catch { /* boş */ } }
  if (!token || !env.DB) return resultPage('Ödeme sonucu alınamadı', 'Ödeme bilgisi eksik geldi. Kartınızdan çekim yapıldıysa bizimle iletişime geçin.', { status: 400 });
  await init(env.DB);
  const order = await first(env.DB, 'SELECT * FROM sales_orders WHERE token = ?', token);
  if (!order) return resultPage('Ödeme bulunamadı', 'Bu ödemeye ait sipariş bulunamadı. Kartınızdan çekim yapıldıysa bizimle iletişime geçin.', { status: 404 });
  const r = await finalize(env, order, panel).catch((e) => ({ error: e.message }));
  return pageFor(env, order, r, panel);
}

// Sonucu doğrula ve uygula (tek sefer): pending → paid (iyzico onayı) → done (firma açıldı / uzatıldı)
export async function finalize(env, order, panel, fetchFn) {
  if (order.status === 'done') return { done: true, order };
  if (order.status === 'failed') return { failed: true, reason: order.error };
  const res = await retrieveCheckout(env, order.token, order.id, fetchFn);
  const ok = res.status === 'success' && res.paymentStatus === 'SUCCESS' && String(res.basketId || '') === order.id && Math.abs(Number(res.price) - order.amount) < 0.01;
  if (!ok) {
    const reason = res.errorMessage || (res.paymentStatus ? `ödeme durumu: ${res.paymentStatus}` : 'ödeme tamamlanmadı');
    await run(env.DB, "UPDATE sales_orders SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'pending'", String(reason).slice(0, 300), Date.now(), order.id);
    return { failed: true, reason };
  }
  if (res.fraudStatus === -1) {
    await run(env.DB, "UPDATE sales_orders SET status = 'failed', error = 'iyzico güvenlik kontrolü onaylamadı', updated_at = ? WHERE id = ?", Date.now(), order.id);
    return { failed: true, reason: 'Ödeme güvenlik kontrolünden geçmedi' };
  }
  // Tek sefer: pending → paid geçişini yapan istek uygular (sayfa yenilense / iyzico iki kez gönderse de)
  const claim = await first(env.DB, "UPDATE sales_orders SET status = 'paid', payment_id = ?, installment = ?, updated_at = ? WHERE id = ? AND status = 'pending' RETURNING id", String(res.paymentId || ''), Number(res.installment) || 1, Date.now(), order.id);
  if (!claim) return { done: true, order: await first(env.DB, 'SELECT * FROM sales_orders WHERE id = ?', order.id), again: true };
  const buyer = JSON.parse(order.buyer || '{}'), p = priceOf(order.plan, order.period), note = `iyzico · ${order.id} · ödeme ${res.paymentId || ''}${Number(res.installment) > 1 ? ` · ${res.installment} taksit` : ''}`;
  try {
    let slug = order.slug;
    if (order.kind === 'new') {
      await createTenant(env, env.DB, { slug: order.slug, name: buyer.firm, admin_username: order.username, passHash: order.pass_hash, email: buyer.email, phone: buyer.phone, contact: buyer.name, city: buyer.city, address: buyer.address,
        tax: buyer.identity || '', plan: p.name, fee: p.amount, period: p.period, welcome: true }, { origin: panel });
    }
    const t = await getTenant(env.DB, slug, true);
    await recordPayment(env, env.DB, t, { amount: p.amount, months: p.months, method: 'Kart (iyzico)', note, user: 'Online satış', plan: p.name });
    await run(env.DB, "UPDATE sales_orders SET status = 'done', pass_hash = NULL, updated_at = ? WHERE id = ?", Date.now(), order.id);
    const title = order.kind === 'new' ? `Yeni satış: ${buyer.firm} · ${p.name} (${PERIOD[p.period]})` : `Yenileme: ${t.name} · ${p.name} (${PERIOD[p.period]})`;
    await notify(env.DB, `sale:${order.id}`, { level: 'info', title, msg: `${p.amount} TL · ${buyer.name} · ${buyer.email} · ${buyer.phone}` }).catch(() => {});
    await pushNotify(env.DB, { title: '💳 ' + title, body: `${p.amount} TL`, url: '#/firmalar' }).catch(() => {});
    return { done: true, order: { ...order, status: 'done' } };
  } catch (e) {
    // Ödeme alındı ama firma açılamadı / uzatılamadı: elle tamamlanmak üzere işaretlenir, ana panele acil bildirim
    await run(env.DB, "UPDATE sales_orders SET status = 'error', error = ?, updated_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), order.id);
    await notify(env.DB, `sale:${order.id}`, { level: 'error', title: `Ödeme alındı, işlem tamamlanamadı: ${buyer.firm || order.slug}`, msg: `${order.id} · ${e.message} · ${buyer.email} ${buyer.phone}` }).catch(() => {});
    await pushNotify(env.DB, { title: '⚠️ Ödeme alındı, panel açılamadı', body: `${buyer.firm || order.slug}: ${e.message}`, url: '#/bildirimler' }).catch(() => {});
    return { paidError: true, reason: e.message };
  }
}

function resultPage(title, body, { status = 200, ok = false, actions = '' } = {}) {
  return new Response(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:92vh;margin:0;color:#0d1b34;background:#f5f8fe"><div style="max-width:480px;padding:28px;margin:16px;text-align:center;background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(13,27,52,.08)">
<div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:22px;margin:8px 0 10px">${esc(title)}</h1><div style="color:#4a5872;line-height:1.6">${body}</div>${actions}</div></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
const btn = (href, label) => `<p style="margin-top:18px"><a href="${esc(href)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">${esc(label)}</a></p>`;
async function pageFor(env, order, r, panel) {
  const site = order.origin && order.origin !== 'panel' ? order.origin : panel;
  if (r.failed) return resultPage('Ödeme tamamlanmadı', `${esc(r.reason || 'Ödeme onaylanmadı')}. Kartınızdan çekim yapılmadı. Tekrar deneyebilir ya da bizimle iletişime geçebilirsiniz.`,
    { actions: btn(order.origin === 'panel' ? `${panel}/#/paketim` : `${site}/satin-al?plan=${order.plan}&donem=${order.period === 'yearly' ? 'yillik' : 'aylik'}`, 'Tekrar dene') });
  if (r.paidError) return resultPage('Ödemeniz alındı', `Ödemeniz başarıyla alındı ancak işleminiz otomatik tamamlanamadı. Ekibimiz en kısa sürede tamamlayıp size dönecek; ek bir ödeme yapmanız gerekmez. ${esc(await contactLine(env))}`, { ok: true });
  if (r.error) return resultPage('Ödeme sonucu doğrulanamadı', `Ödeme sonucunu şu an doğrulayamadık (${esc(r.error)}). Kartınızdan çekim yapıldıysa işleminiz kısa sürede tamamlanır; sayfayı birkaç dakika sonra yenileyebilir ya da bizimle iletişime geçebilirsiniz.`, { status: 502 });
  const o = r.order || order, p = priceOf(o.plan, o.period);
  if (o.kind === 'new') {
    return resultPage('Paneliniz hazır!', `${esc(p.name)} paketiniz (${PERIOD[p.period]}) aktif. Giriş bilgileriniz:<br><b>Firma kodu:</b> ${esc(o.slug)}<br><b>Kullanıcı adı:</b> ${esc(o.username)}<br><b>Şifre:</b> satın alırken belirlediğiniz şifre<br><span style="font-size:14px">Bilgiler e-posta adresinize de gönderildi.</span>`,
      { ok: true, actions: btn(`${panel}/?firma=${encodeURIComponent(o.slug)}`, 'Panele giriş yap') });
  }
  const t = await getTenant(env.DB, o.slug, true);
  const until = t && t.expires_at ? new Date(t.expires_at + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.') : '';
  return resultPage('Ödemeniz alındı, teşekkürler', `${esc(p.name)} paketiniz (${PERIOD[p.period]}) ${until ? `<b>${until}</b> tarihine kadar` : ''} aktif.`,
    { ok: true, actions: btn(`${panel}/?firma=${encodeURIComponent(o.slug)}`, 'Panele dön') });
}
