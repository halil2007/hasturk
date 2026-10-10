// Online paket satışı (iyzico ödeme formu).
//  - Sitede yeni müşteri: paket + dönem seçer, firma ve giriş bilgilerini yazar, iyzico'da öder → firma paneli kendiliğinden
//    açılır (seçtiği şifreyle girer), hoş geldiniz e-postası gider.
//  - Sitede mevcut müşteri (süresi dolmuş olsa da): firma kodu + firma kartındaki e-postayla süresini yeniler / paket değiştirir.
//  - Panelde: firma yöneticisi Paketim sayfasından satın alır / yeniler / yükseltir.
// Tutar her zaman sunucudaki paket fiyatından (plans.js) alınır. Ödeme sonucu iyzico'dan sunucu tarafında doğrulanır; aynı
// ödeme iki kez işlenmez. Kart bilgisi panele hiç gelmez.
// Yeni firma: firma kodu firma adından üretilir (boşsa / doluysa sonuna sayı eklenir), yönetici kullanıcı adı "yonetici",
// şifre rastgele geçici şifredir. Geçici şifre ödeme tamamlanana kadar şifrelenmiş saklanır (pass_tmp), firma açılınca e-postayla
// gönderilir ve silinir; müşteri ilk girişte yeni şifre belirler (users.must_change).
// Fatura bilgisi (bireysel: ad soyad + TC kimlik no; kurumsal: unvan + vergi dairesi / no) siparişte saklanır, ödeme kaydına ve firma
// kartına (ünvan, vergi, adres, şehir) yazılır; ödeme tamamlanınca panel sahibine e-posta gider (fatura kesmek için).
import { all, first, run, init, notify, resolve as resolveNotice } from './db.js';
import { priceOf, PLANS, INSTALLMENTS, upgradeQuote, FEATURES, EFT_DISCOUNT, eftAmount, EXTRA_STORE, daysLeft, extraStoreAmount, extraRenewAmount, limitsOf, planKey } from './plans.js';
import { sendMail } from './mail.js';
import { initCheckout, retrieveCheckout, iyzicoReady } from './iyzico.js';
import { createTenant, recordPayment, checkNewTenant, getTenant, expired, contactLine, refreshTenant } from './tenants.js';
import { hashPassword } from './auth.js';
import { notify as pushNotify } from './push.js';
import { siteOrigins, validEmail, validPhone } from './lead.js';
import { mailOwner } from './ownermail.js';
import { json, str, fail, HttpError } from './util.js';
import { turnstileOk, siteHosts, CAPTCHA_ERROR } from './turnstile.js';

const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const newId = () => 'HS' + Date.now().toString(36).toUpperCase() + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
const PERIOD = { monthly: 'aylık', yearly: 'yıllık' };

// Satın alınabilir paketler (site / panel gösterimi)
export const catalog = () => Object.entries(PLANS).map(([key, p]) => ({ key, name: p.name, monthly: p.monthly, yearly: p.yearly, stores: p.stores, users: p.users, features: p.features.map((f) => FEATURES[f]).filter(Boolean), soon: p.soon || [] }));

async function rateLimit(db, req, key, max) {
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now();
  const row = await first(db, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, `${key}:${ip}`, now, now - 3600e3, now);
  if ((JSON.parse(row.v).n || 0) > max) fail(429, 'Çok fazla deneme; lütfen bir süre sonra tekrar deneyin');
  return ip;
}
// TC kimlik no: 11 hane, ilk hane 0 değil, 10. ve 11. hane kontrol haneleri
export function validTckn(s) {
  const d = String(s || '');
  if (!/^[1-9]\d{10}$/.test(d)) return false;
  const n = [...d].map(Number), odd = n[0] + n[2] + n[4] + n[6] + n[8], even = n[1] + n[3] + n[5] + n[7];
  return (((odd * 7 - even) % 10) + 10) % 10 === n[9] && n.slice(0, 10).reduce((a, x) => a + x, 0) % 10 === n[10];
}
// Fatura bilgisi: bireysel (ad soyad, TC kimlik no) ya da kurumsal (unvan, vergi dairesi, vergi no — şahıs şirketinde TC kimlik no —,
// yetkili, e-fatura mükellefi mi); adres, il, ilçe ikisinde de zorunlu
export function invoiceOf(v = {}) {
  const t = (k, n) => str(v[k]).trim().replace(/\s+/g, ' ').slice(0, n);
  const inv = { type: v.type === 'kurumsal' ? 'kurumsal' : 'bireysel' };
  if (inv.type === 'bireysel') {
    Object.assign(inv, { name: t('name', 100), tckn: str(v.tckn).replace(/\D/g, '') });
    if (inv.name.split(' ').length < 2) fail(400, 'Fatura için adınızı ve soyadınızı yazın');
    if (!validTckn(inv.tckn)) fail(400, 'Geçerli bir TC kimlik numarası yazın (11 hane)');
  } else {
    Object.assign(inv, { company: t('company', 200), taxOffice: t('taxOffice', 80), taxNo: str(v.taxNo).replace(/\D/g, ''), contact: t('contact', 100), efatura: !!v.efatura });
    if (inv.company.length < 3) fail(400, 'Firma unvanını yazın');
    if (inv.taxOffice.length < 2) fail(400, 'Vergi dairesini yazın');
    if (!/^\d{10}$/.test(inv.taxNo) && !validTckn(inv.taxNo)) fail(400, 'Vergi numarası 10 hane olmalı (şahıs şirketinde 11 haneli TC kimlik no)');
    if (inv.contact.split(' ').length < 2) fail(400, 'Yetkili kişinin adını ve soyadını yazın');
  }
  Object.assign(inv, { address: t('address', 300), district: t('district', 60), city: t('city', 60) });
  if (inv.address.length < 8) fail(400, 'Fatura adresini yazın (mahalle, cadde / sokak, no)');
  if (!inv.district) fail(400, 'Fatura adresinin ilçesini yazın');
  if (!inv.city) fail(400, 'Fatura adresinin ilini yazın');
  return inv;
}
const fullAddress = (inv) => `${inv.address}, ${inv.district} / ${inv.city}`;
// Fatura bilgisi → e-posta / panel satırları
export const invoiceRows = (inv) => (!inv ? [] : inv.type === 'kurumsal'
  ? [['Fatura türü', 'Kurumsal'], ['Unvan', inv.company], ['Vergi dairesi', inv.taxOffice], ['Vergi no', inv.taxNo], ['e-Fatura', inv.efatura ? 'e-Fatura mükellefi' : 'Mükellef değil (e-Arşiv)'], ['Yetkili', inv.contact], ['Fatura adresi', fullAddress(inv)]]
  : [['Fatura türü', 'Bireysel'], ['Ad soyad', inv.name], ['TC kimlik no', inv.tckn], ['Fatura adresi', fullAddress(inv)]]);
// Firma kartı alanları (Ticari ünvan, Vergi dairesi / no, adres, şehir)
const tenantFields = (inv) => ({ legal: inv.type === 'kurumsal' ? inv.company : inv.name, tax: inv.type === 'kurumsal' ? `${inv.taxOffice} / ${inv.taxNo}` : `TC ${inv.tckn}`, address: `${inv.address}, ${inv.district}`, city: inv.city });
const TR = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export function slugFrom(name) {
  const s = String(name || '').toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, (c) => TR[c] || c).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltd|limited|sti|şti|san|sanayi|tic|ticaret|as|a\.s|anonim|sirketi|şirketi|ve)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let out = s.slice(0, 24).replace(/-+$/, '');
  if (out.length < 3) out = 'firma';
  return out;
}
async function freeSlug(db, firm, now) {
  const base = slugFrom(firm);
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? base : i < 20 ? `${base}-${i + 1}` : `${base}-${crypto.getRandomValues(new Uint16Array(1))[0] % 9000 + 1000}`;
    if (s === 'demo') continue;
    const taken = await first(db, 'SELECT 1 AS x FROM tenants WHERE slug = ?', s)
      || await first(db, "SELECT 1 AS x FROM sales_orders WHERE kind = 'new' AND slug = ? AND ((status = 'pending' AND created_at > ?) OR status = 'eft')", s, now - 3600e3);
    if (!taken) return s;
  }
  fail(500, 'Firma kodu oluşturulamadı; lütfen tekrar deneyin');
}
// Okunaklı geçici şifre (karışan harfler yok): ör. "Kp7m-Rt4x-Wq9z"
export function tempPassword() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(12));
  const c = [...r].map((x) => A[x % A.length]);
  return `${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}-${c.slice(8, 12).join('')}`;
}
// Geçici şifrenin saklanması (AES-GCM; anahtar panelin gizli anahtarından türetilir)
async function tmpKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.PANEL_SECRET || env.PANEL_PASSWORD || ''}|checkout-temp-pass`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function sealTemp(env, pw) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tmpKey(env), new TextEncoder().encode(pw)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function openTemp(env, v) {
  try { const [iv, ct] = String(v || '').split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await tmpKey(env), unb64(ct))); } catch { return ''; }
}
function buyerOf(b, ip) {
  const email = str(b.email).trim().toLowerCase().slice(0, 120), phone = str(b.phone).trim().slice(0, 30);
  if (!validEmail(email)) fail(400, 'Geçerli bir e-posta adresi yazın');
  if (!validPhone(phone)) fail(400, 'Geçerli bir telefon numarası yazın (ör. 0532 123 45 67 ya da 0212 123 45 67)');
  const inv = invoiceOf(b.invoice && typeof b.invoice === 'object' ? b.invoice : {}), corp = inv.type === 'kurumsal';
  // iyzico: alıcı = kişi (kurumsalda yetkili), kimlik no = TC kimlik no (varsa); fatura adresi adı kurumsalda firma unvanı
  return { name: corp ? inv.contact : inv.name, firm: str(b.firm).trim().slice(0, 120), email, phone, city: inv.city, address: fullAddress(inv),
    identity: corp ? (inv.taxNo.length === 11 ? inv.taxNo : '') : inv.tckn, billName: corp ? inv.company : inv.name, invoice: inv, ip };
}
// Paketim'deki fatura formu için: son tamamlanan siparişin fatura bilgisi, yoksa firma kartındaki bilgiler
async function lastInvoice(db, t) {
  const o = await first(db, "SELECT buyer FROM sales_orders WHERE slug = ? AND status = 'done' ORDER BY created_at DESC LIMIT 1", t.slug);
  try { const inv = o && JSON.parse(o.buyer || '{}').invoice; if (inv) return inv; } catch { /* boş */ }
  const tax = String(t.tax || '').trim(), tc = tax.match(/^TC\s*(\d{11})$/i), vk = tax.match(/^(.*?)[\s/,-]*(\d{10,11})$/);
  if (tc || !t.legal) return { type: 'bireysel', name: t.legal || t.contact || '', tckn: tc ? tc[1] : '', address: t.address || '', district: '', city: t.city || '' };
  return { type: 'kurumsal', company: t.legal, taxOffice: vk ? vk[1].trim() : '', taxNo: vk ? vk[2] : '', contact: t.contact || '', efatura: false, address: t.address || '', district: '', city: t.city || '' };
}
async function start(env, db, order, origin) {
  const callback = `${origin}/api/public/checkout/callback`;
  const up = order.kind === 'upgrade' ? upgradeOf(order) : null;
  const name = order.kind === 'stores' ? `${order.qty} ek mağaza (${order.period} gün)` : order.kind === 'charge' ? 'ödeme' : PLANS[order.plan].name;
  const itemName = order.kind === 'stores' ? `Hastürk CRM ${order.qty} ek mağaza (${order.period} gün)` : order.kind === 'charge' ? `Hastürk CRM ${order.plan || 'abonelik'} ödemesi${Number(order.period) ? ` (${order.period} ay)` : ''}`
    : up ? `Hastürk CRM ${PLANS[up.from].name} → ${PLANS[order.plan].name} paket yükseltme (${up.days} gün)` : '';
  // Taksit kısıtlanmaz: bankanın sunduğu tüm taksit seçenekleri ödeme sayfasında görünür (bkz. plans.js → INSTALLMENTS)
  const r = await initCheckout(env, { ...order, buyer: JSON.parse(order.buyer), name, ...(itemName ? { itemName } : {}) }, callback);
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
// Havale / EFT ile ödeme: banka hesabı (sitede ödeme adımında ve müşteriye giden e-postada gösterilir; Worker değişkenleriyle değiştirilebilir)
export const bankOf = (env = {}) => ({ bank: env.BANK_NAME || 'Ziraat Katılım Bankası', holder: env.BANK_HOLDER || 'Hastürk Gübre Sanayi ve Ticaret Limited Şirketi', iban: env.BANK_IBAN || 'TR63 0020 9000 0207 5858 0000 01' });
const tl = (n) => `${Number(n).toLocaleString('tr-TR')} TL`;

export async function publicCheckout(req, env) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
  const allowed = siteOrigins(env).includes(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? cors(origin) : {} });
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405);
  if (!allowed) return json({ error: 'İzin verilmeyen kaynak' }, 403);
  const h = cors(origin);
  try {
    if (!env.DB) fail(503, 'Şu an satış yapılamıyor');
    await init(env.DB);
    let b = {};
    try { b = JSON.parse(await req.text()); } catch { fail(400, 'Geçersiz istek'); }
    const eft = str(b.pay) === 'eft';
    if (!eft && !iyzicoReady(env)) fail(503, 'Online ödeme henüz açılmadı. Satın almak için bizi arayın ya da WhatsApp\'tan yazın.');
    if (str(b.website)) return json({ ok: true }, 200, h); // bot tuzağı
    if (!(await turnstileOk(env, req, b.cf, 'checkout', fetch, siteHosts(siteOrigins(env))))) return json(CAPTCHA_ERROR, 400, h);
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
      const firm = str(b.firm).trim().slice(0, 120);
      if (firm.length < 2) fail(400, 'Firma / mağaza adını yazın');
      const buyer = buyerOf(b, ip);
      // Firma kodu, kullanıcı adı ve geçici şifre sunucuda üretilir (bekleyen ödemelerin kodları da dolu sayılır)
      const { slug, username } = await checkNewTenant(env.DB, { slug: await freeSlug(env.DB, firm, now), name: firm, admin_username: 'yonetici' });
      const pw = tempPassword();
      order = { id: newId(), kind: 'new', slug, plan: p.plan, period: p.period, amount: p.amount, buyer: JSON.stringify(buyer), username, pass_hash: await hashPassword(pw), pass_tmp: await sealTemp(env, pw) };
    }
    // Havale / EFT: sipariş "havale bekleniyor" olarak kaydedilir (yıllıkta indirimli tutar); ödeme gelince ana panel → Firmalar'dan onaylanır
    if (eft) order.amount = eftAmount(p);
    await run(env.DB, `INSERT INTO sales_orders (id, kind, slug, plan, period, amount, status, buyer, username, pass_hash, pass_tmp, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      order.id, order.kind, order.slug, order.plan, order.period, order.amount, eft ? 'eft' : 'pending', order.buyer, order.username || null, order.pass_hash || null, order.pass_tmp || null, origin, now, now);
    if (eft) return json(await eftOrder(env, order, p, panel), 200, h);
    return json(await start(env, env.DB, order, panel), 200, h);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, h);
    console.error('satış başlatılamadı', e);
    return json({ error: 'Ödeme başlatılamadı: ' + (e.message || 'bilinmeyen hata') }, 502, h);
  }
}

// Panelden (firma yöneticisi, oturumlu): Paketim sayfası. t = firma kaydı, user = panel kullanıcısı
// Ek mağaza: mevcut sınır, paketin mağaza sayısı, kullanılan, yıllık ücret, lisans bitişine kalan gün ve mağaza başı tutar (sunucuda hesaplanır)
// Paket yükseltme siparişi: period = 'yearly:profesyonel:123' (dönem, eski paket, kalan gün)
const upgradeOf = (o) => { const [period, from, days] = String(o.period || '').split(':'); return { period, from, days: Number(days) || 0 }; };
// Firmanın geçerli dönemi: son tamamlanan paket satın alımının dönemi (yoksa firma kartındaki)
async function currentPeriod(db, rec) {
  const o = await first(db, "SELECT kind, period FROM sales_orders WHERE slug = ? AND status = 'done' AND kind IN ('new', 'renew', 'upgrade') ORDER BY updated_at DESC LIMIT 1", rec.slug).catch(() => null);
  const p = o ? (o.kind === 'upgrade' ? upgradeOf(o).period : o.period) : rec.period;
  return p === 'yearly' ? 'yearly' : 'monthly';
}
// Yükseltilebilir paketler (ödenmiş, süresi dolmamış abonelikte; dönem aynı kalır, fark gün hesabıyla)
async function upgradeInfo(db, rec) {
  const from = planKey(rec.plan);
  if (!from || rec.trial || expired(rec) || !rec.expires_at) return null;
  const period = await currentPeriod(db, rec);
  const options = Object.keys(PLANS).map((k) => upgradeQuote(from, k, period, rec.expires_at)).filter(Boolean).map((q) => ({ ...q, name: PLANS[q.to].name }));
  return { from, period, days: daysLeft(rec.expires_at), options };
}
function storeInfo(rec, used) {
  const lim = limitsOf(rec), base = (PLANS[planKey(rec.plan)] || {}).stores || 0;
  return { limit: lim.stores || 0, base, extra: Math.max(0, (lim.stores || 0) - base), used: Number(used) || 0, yearly: EXTRA_STORE.yearly, days: daysLeft(rec.expires_at), perStore: extraStoreAmount(1, daysLeft(rec.expires_at)), max: EXTRA_STORE.max,
    buyable: !!base && !rec.trial && !expired(rec) };
}
export async function tenantBilling(env, t, user, method, path, b, origin, { usedStores = 0 } = {}) {
  if (!env.DB) fail(503, 'Şu an kullanılamıyor');
  await init(env.DB);
  const rec = await getTenant(env.DB, t.slug, true);
  if (method === 'GET' && path === 'billing') {
    const pays = await all(env.DB, 'SELECT at, amount, months, method, note FROM tenant_payments WHERE slug = ? ORDER BY at DESC LIMIT 50', t.slug);
    return { plans: catalog(), stores: storeInfo(rec, usedStores), current: { plan: rec.plan || '', expires_at: rec.expires_at || null, trial: !!rec.trial, expired: expired(rec), email: rec.email || '', phone: rec.phone || '' },
      invoice: await lastInvoice(env.DB, rec), payments: pays, online: iyzicoReady(env), installments: INSTALLMENTS, upgrade: await upgradeInfo(env.DB, rec), bank: bankOf(env), eftDiscount: EFT_DISCOUNT };
  }
  // Ek mağaza satın alma: adet × yıllık ücret × lisans bitişine kalan gün / 365; ödeme alınınca firmanın mağaza sınırı artar
  if (method === 'POST' && path === 'billing/stores') {
    if (user.role !== 'admin') fail(403, 'Paket işlemleri yalnız yöneticiye açıktır');
    if (!iyzicoReady(env)) fail(503, 'Online ödeme henüz açılmadı. ' + await contactLine(env));
    const si = storeInfo(rec, usedStores), qty = Math.round(Number(b.qty) || 0);
    if (!si.buyable) fail(400, rec.trial ? 'Deneme süresinde ek mağaza alınamaz; önce paket seçin' : expired(rec) ? 'Aboneliğinizin süresi dolmuş; önce paketinizi yenileyin' : 'Paketiniz özel tanımlı: ek mağaza için bizimle iletişime geçin');
    if (qty < 1 || qty > si.max) fail(400, `Ek mağaza adedi 1-${si.max} arasında olmalı`);
    if (!b.consent) fail(400, 'Mesafeli satış sözleşmesini onaylayın');
    const buyer = buyerOf({ ...b, firm: rec.name, email: b.email || rec.email || user.email, phone: b.phone || rec.phone }, '');
    const now = Date.now(), days = si.days, amount = extraStoreAmount(qty, days);
    const order = { id: newId(), kind: 'stores', slug: rec.slug, plan: 'stores', period: String(days), amount, qty, buyer: JSON.stringify(buyer) };
    await run(env.DB, `INSERT INTO sales_orders (id, kind, slug, plan, period, amount, status, buyer, origin, created_at, updated_at, qty) VALUES (?, 'stores', ?, 'stores', ?, ?, 'pending', ?, 'panel', ?, ?, ?)`,
      order.id, order.slug, order.period, amount, order.buyer, now, now, qty);
    return start(env, env.DB, order, origin);
  }
  // Üst pakete geçiş: fark = (yeni paket − mevcut paket, aynı dönem fiyatıyla) × kalan gün / dönem günü; bitiş tarihi değişmez
  if (method === 'POST' && path === 'billing/upgrade') {
    if (user.role !== 'admin') fail(403, 'Paket işlemleri yalnız yöneticiye açıktır');
    if (!iyzicoReady(env)) fail(503, 'Online ödeme henüz açılmadı. ' + await contactLine(env));
    const u = await upgradeInfo(env.DB, rec);
    if (!u) fail(400, rec.trial ? 'Deneme süresinde paket yükseltilmez; paket satın alın' : expired(rec) ? 'Aboneliğinizin süresi dolmuş; paketinizi yenilerken yeni paketi seçin' : 'Paketiniz özel tanımlı: paket değişikliği için bizimle iletişime geçin');
    const q = u.options.find((x) => x.to === str(b.plan));
    if (!q) fail(400, 'Bu pakete yükseltme yapılamaz (yalnız üst pakete geçilebilir)');
    if (!b.consent) fail(400, 'Mesafeli satış sözleşmesini onaylayın');
    const buyer = buyerOf({ ...b, firm: rec.name, email: b.email || rec.email || user.email, phone: b.phone || rec.phone }, '');
    const now = Date.now(), order = { id: newId(), kind: 'upgrade', slug: rec.slug, plan: q.to, period: `${q.period}:${q.from}:${q.days}`, amount: q.amount, buyer: JSON.stringify(buyer) };
    await run(env.DB, `INSERT INTO sales_orders (id, kind, slug, plan, period, amount, status, buyer, origin, created_at, updated_at) VALUES (?, 'upgrade', ?, ?, ?, ?, 'pending', ?, 'panel', ?, ?)`,
      order.id, order.slug, order.plan, order.period, order.amount, order.buyer, now, now);
    return start(env, env.DB, order, origin);
  }
  if (method === 'POST' && path === 'billing/checkout') {
    if (user.role !== 'admin') fail(403, 'Paket işlemleri yalnız yöneticiye açıktır');
    if (!iyzicoReady(env)) fail(503, 'Online ödeme henüz açılmadı. ' + await contactLine(env));
    const p = priceOf(str(b.plan), str(b.period));
    if (!p) fail(400, 'Paket ya da dönem geçersiz');
    if (!b.consent) fail(400, 'Mesafeli satış sözleşmesini onaylayın');
    const buyer = buyerOf({ ...b, firm: rec.name, email: b.email || rec.email || user.email, phone: b.phone || rec.phone }, '');
    // Aldığı ek mağazalar yenilemede korunur ve ücrete eklenir (yeni paket daha çok mağaza içeriyorsa fazlası düşer)
    const extra = Math.max(0, (Number(rec.max_stores) || 0) - (PLANS[p.plan].stores || 0));
    if (extra) p.amount = Math.round((p.amount + extraRenewAmount(extra, p.months)) * 100) / 100;
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
  const note = `iyzico · ${order.id} · ödeme ${res.paymentId || ''}${Number(res.installment) > 1 ? ` · ${res.installment} taksit` : ''}`;
  return complete(env, order, panel, { method: 'Kart (iyzico)', note, res });
}

// Ödeme alındı (kart ya da onaylanan havale / EFT): yeni firmada panel açılır, mevcut firmada süre uzar; ödeme kaydı, bildirim, e-posta
async function complete(env, order, panel, { method, note, res = {} }) {
  if (order.kind === 'stores') return completeStores(env, order, { method, note });
  if (order.kind === 'charge') return completeCharge(env, order, { method, note });
  if (order.kind === 'upgrade') return completeUpgrade(env, order, { method, note });
  const buyer = JSON.parse(order.buyer || '{}'), p = { ...priceOf(order.plan, order.period), amount: order.amount };
  try {
    let slug = order.slug;
    const inv = buyer.invoice ? tenantFields(buyer.invoice) : { city: buyer.city, address: buyer.address, tax: buyer.identity || '' };
    if (order.kind === 'new') {
      const tempPw = order.pass_tmp ? await openTemp(env, order.pass_tmp) : '';
      await createTenant(env, env.DB, { slug: order.slug, name: buyer.firm, admin_username: order.username, passHash: order.pass_hash, email: buyer.email, phone: buyer.phone, contact: buyer.name,
        ...(tempPw ? { tempPassword: tempPw, mustChange: true } : {}),
        ...inv, plan: p.name, fee: p.amount, period: p.period, welcome: true }, { origin: panel });
    } else if (buyer.invoice) {
      // Yenilemede firma kartının fatura alanları güncellenir (yetkili / telefon boşsa doldurulur; e-posta değişmez)
      await run(env.DB, "UPDATE tenants SET legal = ?, tax = ?, address = ?, city = ?, contact = COALESCE(NULLIF(contact, ''), ?), phone = COALESCE(NULLIF(phone, ''), ?), updated_at = ? WHERE slug = ?",
        inv.legal, inv.tax, inv.address, inv.city, buyer.name, buyer.phone, Date.now(), slug).catch((e) => console.error('firma fatura bilgisi yazılamadı', e));
    }
    if (order.kind !== 'new') await run(env.DB, 'UPDATE tenants SET period = ?, fee = ?, updated_at = ? WHERE slug = ?', p.period, PLANS[order.plan][p.period], Date.now(), slug).catch(() => {});
    const t = await getTenant(env.DB, slug, true);
    await recordPayment(env, env.DB, t, { amount: p.amount, months: p.months, method, note, user: method === 'Kart (iyzico)' ? 'Online satış' : 'Havale / EFT onayı', plan: p.name });
    // Fatura bilgisi ödeme kaydında (ana panel → Firmalar → Tahsilatlar)
    if (buyer.invoice) await run(env.DB, 'UPDATE tenant_payments SET invoice = ? WHERE slug = ? AND instr(note, ?) > 0', JSON.stringify({ ...buyer.invoice, email: buyer.email, phone: buyer.phone }), slug, order.id).catch(() => {});
    await run(env.DB, "UPDATE sales_orders SET status = 'done', pass_hash = NULL, pass_tmp = NULL, updated_at = ? WHERE id = ?", Date.now(), order.id);
    const title = order.kind === 'new' ? `Yeni satış: ${buyer.firm} · ${p.name} (${PERIOD[p.period]})` : `Yenileme: ${t.name} · ${p.name} (${PERIOD[p.period]})`;
    await notify(env.DB, `sale:${order.id}`, { level: 'info', title, msg: `${p.amount} TL · ${buyer.name} · ${buyer.email} · ${buyer.phone}` }).catch(() => {});
    await pushNotify(env.DB, { title: '💳 ' + title, body: `${p.amount} TL`, url: '#/firmalar' }).catch(() => {});
    await saleMail(env, { order, buyer, p, t, res, title, panel });
    return { done: true, order: { ...order, status: 'done' } };
  } catch (e) {
    // Ödeme alındı ama firma açılamadı / uzatılamadı: elle tamamlanmak üzere işaretlenir, ana panele acil bildirim
    await run(env.DB, "UPDATE sales_orders SET status = 'error', error = ?, updated_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), order.id);
    await notify(env.DB, `sale:${order.id}`, { level: 'error', title: `Ödeme alındı, işlem tamamlanamadı: ${buyer.firm || order.slug}`, msg: `${order.id} · ${e.message} · ${buyer.email} ${buyer.phone}` }).catch(() => {});
    await pushNotify(env.DB, { title: '⚠️ Ödeme alındı, panel açılamadı', body: `${buyer.firm || order.slug}: ${e.message}`, url: '#/bildirimler' }).catch(() => {});
    return { paidError: true, reason: e.message };
  }
}

// Ek mağaza ödemesi alındı: firmanın mağaza sınırı adet kadar artar (paketin sınırı + ek), ödeme kaydı ve bildirim
async function completeStores(env, order, { method, note }) {
  const buyer = JSON.parse(order.buyer || '{}'), qty = Number(order.qty) || 0;
  try {
    const t = await getTenant(env.DB, order.slug, true);
    const cur = limitsOf(t).stores || 0, next = cur + qty;
    await run(env.DB, 'UPDATE tenants SET max_stores = ?, updated_at = ? WHERE slug = ?', next, Date.now(), t.slug);
    await recordPayment(env, env.DB, t, { amount: order.amount, months: 0, method, note: `${qty} ek mağaza (${order.period} gün, lisans bitişine kadar) · ${note}`, user: 'Online satış' });
    await refreshTenant(env, env.DB, t.slug);
    await run(env.DB, "UPDATE sales_orders SET status = 'done', updated_at = ? WHERE id = ?", Date.now(), order.id);
    const title = `Ek mağaza: ${t.name} · +${qty} (sınır ${cur} → ${next})`;
    await notify(env.DB, `sale:${order.id}`, { level: 'info', title, msg: `${order.amount} TL · ${buyer.name || ''} · ${buyer.email || ''}` }).catch(() => {});
    await pushNotify(env.DB, { title: '💳 ' + title, body: `${order.amount} TL`, url: '#/firmalar' }).catch(() => {});
    return { done: true, order: { ...order, status: 'done' }, stores: next };
  } catch (e) {
    await run(env.DB, "UPDATE sales_orders SET status = 'error', error = ?, updated_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), order.id);
    await notify(env.DB, `sale:${order.id}`, { level: 'error', title: `Ek mağaza ödemesi alındı, sınır artırılamadı: ${order.slug}`, msg: `${order.id} · ${e.message}` }).catch(() => {});
    return { paidError: true, reason: e.message };
  }
}

// Paket yükseltme ödemesi alındı: paket hemen yükselir, bitiş tarihi aynı kalır. Ek mağaza alındıysa toplam sınır korunur
// (yeni paketin sınırı daha büyükse paketin sınırı geçerli olur).
async function completeUpgrade(env, order, { method, note }) {
  const buyer = JSON.parse(order.buyer || '{}'), u = upgradeOf(order), to = PLANS[order.plan];
  try {
    const t = await getTenant(env.DB, order.slug, true);
    const cur = Number(t.max_stores) || 0;
    await run(env.DB, 'UPDATE tenants SET max_stores = ?, fee = ?, period = ?, updated_at = ? WHERE slug = ?', cur > to.stores ? cur : null, to[u.period] || null, u.period, Date.now(), t.slug);
    await recordPayment(env, env.DB, { ...t, max_stores: cur > to.stores ? cur : null }, { amount: order.amount, months: 0, method, plan: to.name, user: 'Online satış',
      note: `Paket yükseltme ${(PLANS[u.from] || {}).name || u.from} → ${to.name} (${u.days} gün, gün hesabıyla) · ${note}` });
    await refreshTenant(env, env.DB, t.slug);
    await run(env.DB, "UPDATE sales_orders SET status = 'done', updated_at = ? WHERE id = ?", Date.now(), order.id);
    const title = `Paket yükseltme: ${t.name} · ${(PLANS[u.from] || {}).name || u.from} → ${to.name}`;
    await notify(env.DB, `sale:${order.id}`, { level: 'info', title, msg: `${order.amount} TL · ${u.days} gün · ${buyer.name || ''} · ${buyer.email || ''}` }).catch(() => {});
    await pushNotify(env.DB, { title: '💳 ' + title, body: `${order.amount} TL`, url: '#/firmalar' }).catch(() => {});
    return { done: true, order: { ...order, status: 'done' } };
  } catch (e) {
    await run(env.DB, "UPDATE sales_orders SET status = 'error', error = ?, updated_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), order.id);
    await notify(env.DB, `sale:${order.id}`, { level: 'error', title: `Yükseltme ödemesi alındı, paket değiştirilemedi: ${order.slug}`, msg: `${order.id} · ${e.message}` }).catch(() => {});
    return { paidError: true, reason: e.message };
  }
}

// ---------- ana panel → Firmalar → Ödeme al → Kartla tahsil et (sanal POS) ----------
// Tutar ve uzatılacak süre girilir; 7 gün geçerli imzalı ödeme bağlantısı oluşur. Bağlantı açılınca iyzico ödeme sayfası her seferinde
// yeniden başlatılır (iyzico sayfası kısa sürede düşer). Yönetici kartı kendisi girebilir ya da bağlantı müşteriye e-postayla gider.
// Ödeme alınınca tahsilat kaydı düşer ve abonelik uzar.
const LINK_DAYS = 7;
const enc = new TextEncoder();
const linkKey = (env) => crypto.subtle.importKey('raw', enc.encode(`${env.PANEL_SECRET || env.PANEL_PASSWORD}|paylink`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const linkSig = async (env, id) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', await linkKey(env), enc.encode(id))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
export async function chargeLink(env, origin, id) { return `${origin}/api/public/pay?o=${encodeURIComponent(`${id}.${await linkSig(env, id)}`)}`; }
export async function adminCharge(env, db, t, b, user, origin) {
  if (!iyzicoReady(env)) fail(503, 'Sanal POS (iyzico) bilgileri girilmemiş: Ayarlar → Online satış');
  const amount = Math.round(Math.max(0, Number(String(b.amount ?? '').replace(',', '.')) || 0) * 100) / 100, months = Math.max(0, Math.min(36, Math.round(Number(b.months) || 0)));
  if (amount < 1) fail(400, 'Tutar girin');
  const email = str(b.email || t.email).trim().toLowerCase();
  if (!validEmail(email)) fail(400, 'Müşterinin e-posta adresi geçersiz (iyzico ister)');
  const tax = str(t.tax).replace(/\D/g, '');
  const buyer = { name: str(t.contact || t.legal || t.name), firm: t.name, email, phone: str(t.phone), city: str(t.city) || 'İstanbul', address: str(t.address) || str(t.city) || 'Türkiye',
    identity: tax.length === 11 ? tax : '', billName: str(t.legal || t.name), note: str(b.note).slice(0, 200) };
  const now = Date.now(), id = newId();
  await run(db, `INSERT INTO sales_orders (id, kind, slug, plan, period, amount, status, buyer, origin, created_at, updated_at, username) VALUES (?, 'charge', ?, ?, ?, ?, 'pending', ?, 'panel', ?, ?, ?)`,
    id, t.slug, str(t.plan), String(months), amount, JSON.stringify(buyer), now, now, str(user.name || ''));
  const link = await chargeLink(env, origin, id);
  let mailed = false;
  if (b.send) {
    const what = `${amount.toLocaleString('tr-TR')} TL${months ? ` · aboneliğiniz ${months} ay uzatılır` : ''}${buyer.note ? ` · ${buyer.note}` : ''}`;
    const r = await sendMail(env, db, { to: [email], subject: `Hastürk CRM · ödeme bağlantınız (${t.name})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px"><p>Merhaba,</p><p><b>${esc(t.name)}</b> için Hastürk CRM ödemeniz: <b>${esc(what)}</b>.</p><p><a href="${link}" style="display:inline-block;background:#1d5cff;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Kartla öde</a></p><p style="color:#555;font-size:13px">Ödeme iyzico güvencesiyle alınır; kart bilgileriniz bize ulaşmaz. Bağlantı ${LINK_DAYS} gün geçerlidir.</p></div>`,
      text: `${t.name} için Hastürk CRM ödemeniz: ${what}\nKartla ödemek için: ${link}\nBağlantı ${LINK_DAYS} gün geçerlidir.` }).catch((e) => ({ error: e.message }));
    mailed = !(r && r.error);
  }
  return { ok: true, id, link, amount, months, mailed, expires_at: now + LINK_DAYS * 864e5 };
}
// Müşterinin açtığı ödeme bağlantısı: imza ve süre denetlenir, ödenmemişse iyzico ödeme sayfası başlatılır
export async function payLink(req, env) {
  const v = str(new URL(req.url).searchParams.get('o')), [id, sig] = v.split('.');
  if (!id || !sig || !env.DB) return resultPage('Ödeme bağlantısı geçersiz', 'Bağlantı eksik ya da bozuk.', { status: 400 });
  if (sig !== await linkSig(env, id)) return resultPage('Ödeme bağlantısı geçersiz', 'Bağlantı doğrulanamadı.', { status: 400 });
  await init(env.DB);
  const o = await first(env.DB, "SELECT * FROM sales_orders WHERE id = ? AND kind = 'charge'", id);
  if (!o) return resultPage('Ödeme bulunamadı', 'Bu bağlantıya ait ödeme bulunamadı.', { status: 404 });
  if (o.status === 'done' || o.status === 'paid') return resultPage('Bu ödeme alınmış', 'Bu bağlantının ödemesi daha önce alındı, teşekkürler.', { ok: true });
  if (o.status === 'cancelled') return resultPage('Bağlantı iptal edildi', `Bu ödeme bağlantısı iptal edildi. ${esc(await contactLine(env))}`, { status: 410 });
  if (Date.now() - o.created_at > LINK_DAYS * 864e5) return resultPage('Bağlantının süresi doldu', `Ödeme bağlantısı ${LINK_DAYS} gün geçerlidir. Yeni bağlantı için bizimle iletişime geçin. ${esc(await contactLine(env))}`, { status: 410 });
  // Önceki denemesi başarısız olan bağlantı yeniden kullanılabilir
  if (o.status === 'failed') await run(env.DB, "UPDATE sales_orders SET status = 'pending', error = NULL WHERE id = ?", id);
  try {
    const r = await start(env, env.DB, { ...o, status: 'pending' }, new URL(req.url).origin);
    return new Response(null, { status: 303, headers: { Location: r.url, 'Cache-Control': 'no-store' } });
  } catch (e) { return resultPage('Ödeme başlatılamadı', `${esc(e.message)}. Biraz sonra tekrar deneyin.`, { status: 502 }); }
}
async function completeCharge(env, order, { method, note }) {
  const buyer = JSON.parse(order.buyer || '{}'), months = Number(order.period) || 0;
  try {
    const t = await getTenant(env.DB, order.slug, true);
    const r = await recordPayment(env, env.DB, t, { amount: order.amount, months, method, note: `Ödeme bağlantısı${buyer.note ? ` · ${buyer.note}` : ''} · ${note}`, user: order.username || 'Ödeme bağlantısı' });
    await run(env.DB, "UPDATE sales_orders SET status = 'done', updated_at = ? WHERE id = ?", Date.now(), order.id);
    const title = `Kartla tahsilat: ${t.name} · ${order.amount} TL${months ? ` · +${months} ay` : ''}`;
    await notify(env.DB, `sale:${order.id}`, { level: 'info', title, msg: `${buyer.email || ''}${r.expires_at ? ` · yeni bitiş ${new Date(r.expires_at + 3 * 3600e3).toISOString().slice(0, 10)}` : ''}` }).catch(() => {});
    await pushNotify(env.DB, { title: '💳 ' + title, body: `${order.amount} TL`, url: '#/firmalar' }).catch(() => {});
    return { done: true, order: { ...order, status: 'done' }, expires_at: r.expires_at };
  } catch (e) {
    await run(env.DB, "UPDATE sales_orders SET status = 'error', error = ?, updated_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), order.id);
    await notify(env.DB, `sale:${order.id}`, { level: 'error', title: `Kartla ödeme alındı, kaydedilemedi: ${order.slug}`, msg: `${order.id} · ${e.message}` }).catch(() => {});
    return { paidError: true, reason: e.message };
  }
}

// ---------- havale / EFT ----------
const eftLines = (env, order, p) => { const k = bankOf(env); return [['Banka', k.bank], ['Hesap sahibi', k.holder], ['IBAN', k.iban], ['Tutar', `${tl(order.amount)} (KDV dahil)${p.period === 'yearly' ? ` · %${EFT_DISCOUNT} havale indirimi` : ''}`], ['Açıklama', `Sipariş no ${order.id}`]]; };
async function eftOrder(env, order, p, panel) {
  const buyer = JSON.parse(order.buyer || '{}'), lines = eftLines(env, order, p), firm = buyer.firm || order.slug;
  const what = `${p.name} paketi (${PERIOD[p.period]})`;
  await notify(env.DB, `eft:${order.id}`, { level: 'info', title: `Havale bekleniyor: ${firm} · ${what}`, msg: `${tl(order.amount)} · ${order.id} · ${buyer.email} · ${buyer.phone}` }).catch(() => {});
  await pushNotify(env.DB, { title: '🏦 Havale / EFT siparişi', body: `${firm} · ${tl(order.amount)}`, url: '#/firmalar' }).catch(() => {});
  await mailOwner(env, env.DB, { subject: `Havale / EFT siparişi: ${firm} · ${what}`, intro: 'Siteden havale / EFT ile sipariş verildi. Ödeme hesabınıza geçince ana panel → Firmalar → Havale bekleyenler\'den onaylayın; panel açılır / süre uzar.',
    rows: [['Sipariş no', order.id], ['Tür', order.kind === 'new' ? 'Yeni firma' : `Yenileme (${order.slug})`], ['Paket', what], ['Beklenen tutar', `${tl(order.amount)} (KDV dahil)`], ['Alıcı', buyer.name], ['E-posta', buyer.email], ['Telefon', buyer.phone], ...invoiceRows(buyer.invoice)],
    link: `${panel}/#/firmalar`, button: 'Firmalar' });
  // Müşteriye banka bilgileri (e-posta servisi yoksa sayfada gösterilenler yeterli)
  try {
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:560px"><h2 style="font-size:18px">Siparişiniz alındı</h2><p>${esc(what)} siparişiniz havale / EFT ödemesi bekliyor. Ödemeniz hesabımıza geçince ${order.kind === 'new' ? 'paneliniz açılır ve giriş bilgileriniz e-postayla gönderilir' : 'aboneliğiniz uzatılır'}.</p>
      <table style="border-collapse:collapse">${lines.map(([k, v]) => `<tr><td style="padding:5px 12px 5px 0;color:#667">${esc(k)}</td><td style="padding:5px 0;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>
      <p style="color:#556">Açıklamaya sipariş numaranızı yazmanız işleminizi hızlandırır.</p></div>`;
    await sendMail(env, env.DB, { to: [buyer.email], subject: `Hastürk CRM · Havale / EFT bilgileri (${order.id})`, html, text: `Siparişiniz alındı (${what}).\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}` });
  } catch (e) { console.error('havale e-postası', e); }
  return { eft: true, order: order.id, amount: order.amount, bank: bankOf(env), discount: p.period === 'yearly' ? EFT_DISCOUNT : 0 };
}
// Ana panel (yönetici): havale bekleyen siparişler, onay (ödeme geldi) ve iptal
export async function eftAdmin(req, env, path, user) {
  if (!user || user.role !== 'admin' || env.TENANT_SLUG) fail(403, 'Yönetici yetkisi gerekir');
  await init(env.DB);
  let x;
  if (path === 'tenants/eft' && req.method === 'GET') {
    const rows = await all(env.DB, "SELECT id, kind, slug, plan, period, amount, buyer, created_at FROM sales_orders WHERE status = 'eft' ORDER BY created_at DESC LIMIT 100");
    return { orders: rows.map((o) => { const b = JSON.parse(o.buyer || '{}'), p = priceOf(o.plan, o.period) || {}; return { id: o.id, kind: o.kind, slug: o.slug, firm: b.firm || o.slug, plan: p.name, period: o.period, amount: o.amount, name: b.name, email: b.email, phone: b.phone, invoice: b.invoice || null, created_at: o.created_at }; }), bank: bankOf(env) };
  }
  if ((x = path.match(/^tenants\/eft\/([A-Z0-9]+)\/(confirm|cancel)$/)) && req.method === 'POST') {
    if (x[2] === 'cancel') {
      const r = await first(env.DB, "UPDATE sales_orders SET status = 'cancelled', pass_hash = NULL, pass_tmp = NULL, updated_at = ? WHERE id = ? AND status = 'eft' RETURNING id", Date.now(), x[1]);
      if (!r) fail(404, 'Sipariş bulunamadı ya da işlenmiş');
      await resolveNotice(env.DB, `eft:${x[1]}`);
      return { ok: true };
    }
    const claim = await first(env.DB, "UPDATE sales_orders SET status = 'paid', updated_at = ? WHERE id = ? AND status = 'eft' RETURNING *", Date.now(), x[1]);
    if (!claim) fail(404, 'Sipariş bulunamadı ya da işlenmiş');
    await resolveNotice(env.DB, `eft:${x[1]}`);
    const r = await complete(env, claim, new URL(req.url).origin, { method: 'Havale / EFT', note: `Havale / EFT · ${claim.id} · onaylayan ${user.name}` });
    if (r.paidError) fail(500, 'Ödeme kaydedildi ama işlem tamamlanamadı: ' + r.reason);
    return { ok: true, slug: claim.slug };
  }
  fail(404, 'Bulunamadı');
}

// Panel sahibine yeni abonelik / yenileme e-postası (fatura kesmek için tüm bilgiler). Gönderilemezse ödeme akışı etkilenmez.
async function saleMail(env, { order, buyer, p, t, res, title, panel }) {
  try {
    const exp = await first(env.DB, 'SELECT expires_at FROM tenants WHERE slug = ?', t.slug).catch(() => null);
    const until = exp && exp.expires_at ? new Date(exp.expires_at + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.') : '';
    const inst = Number(res.installment) > 1 ? ` · ${res.installment} taksit` : '';
    await mailOwner(env, env.DB, { subject: title, intro: order.kind === 'new' ? 'Siteden yeni abonelik satın alındı; firma paneli açıldı.' : 'Mevcut firma aboneliğini kartla yeniledi.',
      rows: [['Firma', `${t.name || buyer.firm} (${t.slug})`], ['Paket', p.name], ['Dönem', `${PERIOD[p.period]} (${p.months} ay)`], ['Tutar', `${p.amount.toLocaleString('tr-TR')} TL (KDV dahil)${inst}`],
        ['Yeni bitiş', until], ['Sipariş no', order.id], ['iyzico ödeme no', res.paymentId], ['Alıcı', buyer.name], ['E-posta', buyer.email], ['Telefon', buyer.phone], ...invoiceRows(buyer.invoice)],
      link: `${panel}/#/firmalar`, button: 'Firmalar' });
  } catch (e) { console.error('satış e-postası', e); }
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
  if ((r.order || order).kind === 'charge') {
    const t = await getTenant(env.DB, order.slug, true), m = Number(order.period) || 0;
    const until = t && t.expires_at ? new Date(t.expires_at + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.') : '';
    return resultPage('Ödemeniz alındı, teşekkürler', `${esc(Number(order.amount).toLocaleString('tr-TR'))} TL ödemeniz alındı.${m && until ? ` Aboneliğiniz <b>${until}</b> tarihine kadar uzatıldı.` : ''}`, { ok: true, actions: btn(`${panel}/?firma=${encodeURIComponent(order.slug)}`, 'Panele git') });
  }
  if ((r.order || order).kind === 'upgrade') {
    const t = await getTenant(env.DB, order.slug, true);
    const until = t && t.expires_at ? new Date(t.expires_at + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.') : '';
    return resultPage('Paketiniz yükseltildi', `${esc(PLANS[order.plan].name)} paketiniz aktif${until ? `; bitiş tarihiniz değişmedi (<b>${until}</b>)` : ''}. Yeni özellikler panelinizde hemen açıldı.`,
      { ok: true, actions: btn(`${panel}/?firma=${encodeURIComponent(order.slug)}`, 'Panele dön') });
  }
  if ((r.order || order).kind === 'stores') {
    const t = await getTenant(env.DB, order.slug, true);
    return resultPage('Ödemeniz alındı, teşekkürler', `${esc(String(order.qty))} ek mağaza tanımlandı; mağaza sınırınız artık <b>${esc(String(r.stores || (t && limitsOf(t).stores) || ''))}</b>. Entegrasyonlar'dan yeni mağazanızı bağlayabilirsiniz.`,
      { ok: true, actions: btn(`${panel}/#/entegrasyonlar`, 'Entegrasyonlara git') });
  }
  const o = r.order || order, p = priceOf(o.plan, o.period);
  // Siteden satış: tanıtım sitesinin teşekkür sayfasına yönlendirilir (reklam dönüşüm takibi için sabit adres). Adreste yalnız sipariş no,
  // tutar ve paket bilgisi vardır; firma kodu / kullanıcı adı adrese yazılmaz (giriş bilgileri e-postayla gider)
  if (order.origin && order.origin !== 'panel' && siteOrigins(env).includes(order.origin)) {
    const q = new URLSearchParams({ siparis: o.id, tutar: String(o.amount), paket: p.name, donem: p.period === 'yearly' ? 'yillik' : 'aylik', tur: o.kind === 'new' ? 'yeni' : 'yenileme' });
    return new Response(null, { status: 303, headers: { Location: `${order.origin}/odeme-basarili?${q}`, 'Cache-Control': 'no-store' } });
  }
  if (o.kind === 'new') {
    return resultPage('Paneliniz hazır!', `${esc(p.name)} paketiniz (${PERIOD[p.period]}) aktif. Giriş bilgileriniz:<br><b>Firma kodu:</b> ${esc(o.slug)}<br><b>Kullanıcı adı:</b> ${esc(o.username)}<br><b>Şifre:</b> e-posta adresinize gönderilen geçici şifre<br><span style="font-size:14px">Giriş bilgileriniz e-postanıza gönderildi (gelmediyse istenmeyen klasörüne bakın). İlk girişte yeni şifrenizi belirlemeniz istenecek.</span>`,
      { ok: true, actions: btn(`${panel}/?firma=${encodeURIComponent(o.slug)}`, 'Panele giriş yap') });
  }
  const t = await getTenant(env.DB, o.slug, true);
  const until = t && t.expires_at ? new Date(t.expires_at + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.') : '';
  return resultPage('Ödemeniz alındı, teşekkürler', `${esc(p.name)} paketiniz (${PERIOD[p.period]}) ${until ? `<b>${until}</b> tarihine kadar` : ''} aktif.`,
    { ok: true, actions: btn(`${panel}/?firma=${encodeURIComponent(o.slug)}`, 'Panele dön') });
}
