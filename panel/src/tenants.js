// Müşteri panelleri (CRM'i başka firmalara satmak için).
// Her müşteri paneli ayrı bir Durable Object'tir: kendi SQLite veritabanı (siparişler, ürünler, kullanıcılar, şifreli API bilgileri),
// kendi zamanlanmış senkronu (15 dk alarm). Kod ve arayüz ana panelle aynıdır; panel güncellenince müşteri panelleri de güncellenir.
// Ana panel yalnızca kaydı tutar (tenants tablosu): firma adı, firma kodu, durum. Müşteri verisi ana veritabanına hiç girmez.
// Giriş: giriş ekranında "Firma kodu" + kullanıcı adı + şifre. Oturum çerezi firma koduyla başlar ("kod~..."), istek o firmanın
// Durable Object'ine iletilir. Ana panelin API bilgileri, şifresi ve deneme modu müşteri paneline geçmez.
import { all, first, run, init } from './db.js';
import { handle, report5xx } from './handler.js';
import { recordError, clientReport } from './errors.js';
import { PerfBuffer } from './perf.js';
import { extApiInner, apiOf, apiPublic, newKey, parseIps } from './extapi.js';
import { syncAll } from './sync.js';
import { doD1 } from './dosql.js';
import { hashPassword, supportCookie, currentUser, demoCookie } from './auth.js';
import { supportResponse } from './support.js';
import { json, fail, str } from './util.js';
import { loadConfig } from './config.js';
import { DEMO_PRODUCTS } from './channels/demo.js';
import { limitsOf } from './plans.js';
import { forgot, resetPassword, welcome } from './pwreset.js';
import { tenantBilling } from './billing.js';
import { iyzicoReady } from './iyzico.js';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const SYNC_MS = 15 * 60e3;
// Demo firma paneli: tanıtım sitesinden demo talep edenlerin girdiği, örnek verilerle çalışan panel (firma kodu ayrılmış).
// Deneme modunda (DEMO=1) çalışır: kanallar örnek sipariş / ürün üretir, gerçek pazaryerine bağlanmaz.
// Ziyaretçilerin yaptığı değişiklikler kalıcı olmaz: panel 20 dakika kimse kullanmazsa (son sıfırlamadan 1 saat geçtiyse) ve
// her durumda günde bir eski haline döner. Demo kullanıcısı sıfırlamada korunur, içerideki ziyaretçinin oturumu düşmez.
export const DEMO_SLUG = 'demo';
const DEMO_IDLE = 20 * 60e3, DEMO_STALE = 3600e3, DEMO_MAX = 24 * 3600e3;
export const demoDue = (now, resetAt, seenAt) => now - resetAt > DEMO_MAX || (now - resetAt > DEMO_STALE && now - seenAt > DEMO_IDLE);
// Müşteri paneline geçmeyen ortam değişkenleri: ana panelin kanal / e-posta bilgileri, şifresi, deneme modu, bağlantılar
const PRIVATE = /^(IKAS\d?_|TRENDYOL_|HB_|PTTAVM_|N11_|IDEFIX_|PAZARAMA_|MAIL_)/;
const DROP = new Set(['PANEL_PASSWORD', 'DEMO', 'DB', 'TENANT']);

// Süresi dolan / askıdaki firmaya gösterilen iletişim: ana panelin firma bilgilerindeki telefon ve e-posta (Ayarlar → Firma)
export async function contactLine(env, short = false) {
  let c = {};
  try { const r = env.DB && await first(env.DB, "SELECT v FROM settings WHERE k = 'company'"); c = (r && JSON.parse(r.v)) || {}; } catch { /* yok */ }
  const parts = [c.phone && `telefon ${c.phone}`, c.email && `e-posta ${c.email}`].filter(Boolean);
  return parts.length ? `${short ? '' : 'Lütfen '}bize ulaşın: ${parts.join(' · ')}` : `${short ? '' : 'Lütfen '}hizmet sağlayıcınızla görüşün.`;
}
// Süresi dolan firmaya: online yenileme bağlantısı (sitedeki satın alma sayfası, firma kodu dolu) ve iletişim
export const renewUrl = (env, t) => { if (!iyzicoReady(env)) return null; const site = String(env.SITE_ORIGINS || 'https://hasturkcrm.com').split(',')[0].trim().replace(/\/+$/, ''); return `${site}/satin-al?firma=${encodeURIComponent(t.slug)}`; };
export async function expiredMessage(env, t) {
  const u = renewUrl(env, t);
  return `${t.trial ? 'Ücretsiz deneme süreniz' : 'Aboneliğinizin süresi'} doldu; verileriniz silinmedi. ${u ? `Kartla hemen yenilemek için: ${u} · Yardım için ` : 'Paket seçmek / yenilemek için '}` + await contactLine(env, true);
}
// Abonelik bitiş tarihi geçti mi (bitiş günü sonuna kadar açık)
export const expired = (t, now = Date.now()) => !!(t && t.expires_at && now > t.expires_at);
// Platform değerleri: müşteriyi ilgilendirmeyen, ana panelde bir kez girilen bilgiler müşteri paneline varsayılan olarak geçer
// (Hepsiburada entegratör adı ve aracı sunucusu, bildirim e-postası servisi). Müşteri kendi değerini girerse onunki kullanılır.
const PLATFORM = { hepsiburada: ['HB_USER_AGENT', 'HB_PROXY_URL', 'HB_PROXY_KEY'], mail: ['MAIL_PROVIDER', 'MAIL_API_KEY', 'MAIL_FROM', 'MAIL_SMTP_HOST', 'MAIL_SMTP_PORT', 'MAIL_SMTP_USER', 'MAIL_SMTP_PASS'] };
export async function platformValues(env, db) {
  const cfg = db ? await loadConfig(env, db) : {}, out = {};
  for (const [id, keys] of Object.entries(PLATFORM)) for (const k of keys) { const v = (cfg[id] && cfg[id].values && cfg[id].values[k]) || env[k]; if (v) out[k] = String(v); }
  return out;
}
export function tenantEnv(env, t, platform = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!DROP.has(k) && !PRIVATE.test(k)) out[k] = v;
  // Müşterinin API bilgileri ve oturum imzası kendi anahtarıyla: ana panelin gizli anahtarı yoksa müşteri paneli açılmaz
  // (herkesçe bilinen bir sabitten türetilen anahtarla destek oturumu taklit edilebilirdi)
  if (!env.PANEL_SECRET && !env.PANEL_PASSWORD) fail(503, 'Müşteri panelleri için Cloudflare → Variables and Secrets → PANEL_SECRET tanımlanmalı');
  out.PANEL_SECRET = `${env.PANEL_SECRET || env.PANEL_PASSWORD}|tenant:${t.slug}`;
  out.TENANT_SLUG = t.slug;
  out.TENANT_NAME = t.name || t.slug;
  if (t.maxUsers) out.TENANT_MAX_USERS = String(t.maxUsers);
  if (t.plan) out.TENANT_PLAN = t.plan;
  if (t.maxStores) out.TENANT_MAX_STORES = String(t.maxStores);
  if (t.expires) out.TENANT_EXPIRES = String(t.expires);
  if (t.trial) out.TENANT_TRIAL = '1';
  if (t.slug === DEMO_SLUG) out.DEMO = '1';
  Object.assign(out, platform);
  // Platformun e-posta servisiyle giden bildirimlerde gönderen adı firmanın adı
  if (platform.MAIL_FROM || platform.MAIL_SMTP_USER) out.MAIL_FROM_NAME = out.TENANT_NAME;
  out.PLATFORM_KEYS = Object.keys(platform).join(',');
  return out;
}

// Çerezdeki firma kodu ("kod~kullanıcı.son.imza")
export function cookieTenant(req) {
  const m = (req.headers.get('Cookie') || '').match(/hp_session=([^;]+)/);
  if (!m) return null;
  let v = '';
  try { v = decodeURIComponent(m[1]); } catch { return null; }
  const i = v.indexOf('~'), slug = i > 0 ? v.slice(0, i) : '';
  return SLUG_RE.test(slug) ? slug : null; // geçersiz kod veritabanına sorulmaz
}

// Kayıt (ana veritabanında); sık istek için 30 sn bellekte
const cache = new Map();
export async function getTenant(db, slug, fresh = false) {
  const c = cache.get(slug);
  if (!fresh && c && Date.now() - c.at < 30e3) return c.t;
  await init(db);
  const t = await first(db, 'SELECT * FROM tenants WHERE slug = ?', slug);
  cache.set(slug, { at: Date.now(), t });
  return t;
}
const stub = (env, slug) => {
  if (!env.TENANT) fail(503, 'Müşteri panelleri için Durable Object bağlantısı yok (wrangler.jsonc → durable_objects TENANT)');
  return env.TENANT.get(env.TENANT.idFromName(slug));
};
const enc = (s) => encodeURIComponent(String(s || ''));
// Müşteri paneline giden firma bilgileri: ad, paket ve sınırlar, abonelik bitişi (panel bunlarla sınır uygular, uyarı gösterir)
const tHeaders = (t) => {
  const l = limitsOf(t);
  return { 'X-Tenant-Slug': t.slug, 'X-Tenant-Name': enc(t.name), 'X-Tenant-Max-Users': String(l.users || 0), 'X-Tenant-Plan': l.plan, 'X-Tenant-Max-Stores': String(l.stores || 0),
    'X-Tenant-Expires': String(t.expires_at || ''), 'X-Tenant-Trial': t.trial ? '1' : '' };
};
// İsteği müşteri panelinin Durable Object'ine ilet (firma kodu ve adı başlıkla gider; DO yalnız buradan erişilebilir)
export async function forward(req, env, t, url) {
  const h = new Headers(req.headers);
  for (const [k, v] of Object.entries(tHeaders(t))) h.set(k, v);
  return stub(env, t.slug).fetch(new Request(url || req.url, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer() }));
}
async function admin(env, t, op, data = {}) {
  const r = await stub(env, t.slug).fetch(new Request('https://tenant.internal/__admin', { method: 'POST', headers: { 'Content-Type': 'application/json', ...tHeaders(t) }, body: JSON.stringify({ op, ...data }) }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) fail(r.status, j.error || 'Müşteri paneli yanıt vermedi');
  return j;
}

// Müşteri paneline giriş: firma kodu doğrulanır, giriş isteği o panelin veritabanında denetlenir
// Şifremi unuttum / şifre yenileme (oturumsuz): firma kodu doğrulanır, istek firmanın paneline gider. IP başına saatte 10 istek.
export async function tenantPassword(req, env, kind, b) {
  if (!env.DB) fail(503, 'Şu an kullanılamıyor');
  await init(env.DB);
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now();
  const row = await first(env.DB, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, `pw_rate:${ip}`, now, now - 3600e3, now);
  if ((JSON.parse(row.v).n || 0) > 10) fail(429, 'Çok fazla deneme; lütfen bir saat sonra tekrar deneyin');
  const origin = new URL(req.url).origin;
  if (kind === 'forgot') {
    const slug = str(b.tenant).toLocaleLowerCase('tr').trim(), t = SLUG_RE.test(slug) ? await getTenant(env.DB, slug, true) : null;
    if (t && t.active && !expired(t) && slug !== DEMO_SLUG) await admin(env, t, 'forgot', { who: str(b.who).slice(0, 120), link: `${origin}/#/sifre/${slug}.` }).catch(() => {});
    return { ok: true, message: 'Bu bilgilerle e-posta adresi kayıtlı bir kullanıcı varsa şifre yenileme bağlantısı gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.' };
  }
  const m = /^([a-z0-9-]+)\.([0-9a-f]{48})$/.exec(str(b.key));
  if (!m) fail(400, 'Bağlantı geçersiz');
  const t = await getTenant(env.DB, m[1], true);
  if (!t || !t.active) fail(400, 'Bağlantı geçersiz');
  const r = await admin(env, t, 'reset', { token: m[2], password: String(b.password || '') });
  if (r.error) fail(400, r.error);
  return { ok: true, tenant: t.slug, username: r.username };
}

// Abonelik / deneme bitiş hatırlatması: bitişe 7, 3 ve 1 gün kala firma kartındaki e-postaya (ana panelin e-posta servisiyle).
// Her eşik için bir kez; bitiş tarihi uzatılırsa yeni tarih için yeniden hatırlatılır.
export async function expiryReminders(env, db) {
  const now = Date.now(), last = await first(db, "SELECT v FROM settings WHERE k = 'expmail_at'");
  if (last && now - JSON.parse(last.v) < 3600e3) return null;
  await run(db, "INSERT INTO settings (k, v) VALUES ('expmail_at', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", JSON.stringify(now));
  const rows = await all(db, "SELECT * FROM tenants WHERE active = 1 AND slug != ? AND expires_at > ? AND expires_at <= ? AND COALESCE(email, '') != ''", DEMO_SLUG, now, now + 7 * DAY);
  if (!rows.length) return { sent: 0 };
  const { sendMail, validEmail } = await import('./mail.js');
  const contact = await contactLine(env, true);
  let sent = 0;
  for (const t of rows) {
    const left = Math.ceil((t.expires_at - now) / DAY), th = [1, 3, 7].find((d) => left <= d);
    const k = `expmail:${t.slug}:${th}:${t.expires_at}`;
    if (!th || !validEmail(t.email) || await first(db, 'SELECT 1 AS x FROM settings WHERE k = ?', k)) continue;
    await run(db, "INSERT INTO settings (k, v) VALUES (?, '1') ON CONFLICT (k) DO NOTHING", k);
    const what = t.trial ? 'ücretsiz deneme süreniz' : 'aboneliğiniz';
    const when = left <= 1 ? 'yarın' : `${left} gün sonra`;
    const date = new Date(t.expires_at + 3 * 3600e3).toISOString().slice(0, 10).split('-').reverse().join('.');
    try {
      await sendMail(env, db, { to: [t.email], subject: `${t.name}: ${what} ${when} sona eriyor`,
        text: `Merhaba,\n\n${t.name} için Hastürk CRM ${what} ${date} tarihinde (${when}) sona eriyor. Süre bitince panele giriş ve pazaryerleriyle senkron durur; verileriniz silinmez.\n\n${t.trial ? 'Paket seçmek' : 'Yenilemek'} için ${contact}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px"><h2 style="font-size:18px">${t.trial ? 'Deneme süreniz bitiyor' : 'Aboneliğiniz bitiyor'}</h2><p><b>${String(t.name).replace(/</g, '&lt;')}</b> için Hastürk CRM ${what} <b>${date}</b> tarihinde (${when}) sona eriyor.</p><p>Süre bitince panele giriş ve pazaryerleriyle senkron durur; verileriniz silinmez.</p><p>${t.trial ? 'Paket seçmek' : 'Yenilemek'} için ${contact.replace(/</g, '&lt;')}</p></div>` });
      sent++;
    } catch (e) { console.error('bitiş hatırlatması gönderilemedi', t.slug, e.message); }
  }
  return { sent };
}

// Bekçi (ana panelin 15 dakikalık senkronunda, saatte bir): son 2 saattir senkron izi olmayan etkin firmaların
// zamanlayıcısı yeniden kurulur. Müşteri paneli kimse açmasa da siparişler / stoklar kendiliğinden işlemeye devam eder.
export async function tenantWatchdog(env, db) {
  if (!env.TENANT) return null;
  const now = Date.now(), last = (await first(db, "SELECT v FROM settings WHERE k = 'watchdog_at'")) || null;
  if (last && now - JSON.parse(last.v) < 3600e3) return null;
  await run(db, "INSERT INTO settings (k, v) VALUES ('watchdog_at', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", JSON.stringify(now));
  const rows = await all(db, 'SELECT * FROM tenants WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?) AND COALESCE(usage_at, 0) < ? ORDER BY COALESCE(usage_at, 0) LIMIT 50', now, now - 2 * 3600e3);
  let n = 0;
  for (const t of rows) { try { await admin(env, t, 'ping'); n++; } catch (e) { console.error('bekçi: firma paneline ulaşılamadı', t.slug, e); } }
  if (n) console.log('bekçi: zamanlayıcısı yenilenen firma', n);
  return { checked: n };
}

export async function tenantLogin(req, env, b) {
  const slug = str(b.tenant).toLocaleLowerCase('tr').trim();
  const t = SLUG_RE.test(slug) ? await getTenant(env.DB, slug) : null;
  if (!t) return json({ error: 'Firma kodu, kullanıcı adı veya şifre hatalı' }, 401);
  if (!t.active) return json({ error: 'Bu müşteri paneli askıya alınmış. ' + await contactLine(env) }, 403);
  if (expired(t)) return json({ error: await expiredMessage(env, t), renew: renewUrl(env, t) }, 403);
  const h = new Headers(req.headers); h.set('Content-Type', 'application/json');
  return forward(new Request(req.url, { method: 'POST', headers: h, body: JSON.stringify(b.ticket ? { ticket: b.ticket, code: b.code } : { username: b.username, password: b.password }) }), env, t);
}

// Demo paneline giriş (tanıtım sitesindeki imzalı bağlantıdan, bkz. lead.js): kayıt yoksa oluşturulur; ana panel yöneticisi
// Firmalar'dan askıya alırsa demo kapanır. Dönen çerez demo personel oturumudur (1 gün).
export async function demoLogin(env, secure) {
  if (!env.DB) fail(503, 'Demo şu an kullanılamıyor');
  await init(env.DB);
  const now = Date.now();
  await run(env.DB, `INSERT INTO tenants (slug, name, note, active, admin_username, created_at, updated_at) VALUES (?, 'Demo Mağaza', ?, 1, 'demo', ?, ?)
    ON CONFLICT (slug) DO NOTHING`, DEMO_SLUG, 'Web sitesindeki demo paneli: örnek verilerle çalışır, ziyaretçi değişiklikleri kendiliğinden geri alınır. Askıya alırsanız demo kapanır.', now, now);
  const t = await getTenant(env.DB, DEMO_SLUG, true);
  if (!t.active) fail(403, 'Demo paneli şu an kapalı. Lütfen bizimle iletişime geçin.');
  return (await admin(env, t, 'demo', { secure })).cookie;
}

// ---------- ana panel: müşteri panellerini yönetme (yalnız ana panelin yöneticisi) ----------
const parse = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const pub = (t) => ({ slug: t.slug, name: t.name, email: t.email, phone: t.phone, note: t.note, active: !!t.active, admin_username: t.admin_username, created_at: t.created_at, updated_at: t.updated_at,
  legal: t.legal || '', tax: t.tax || '', contact: t.contact || '', address: t.address || '', city: t.city || '', plan: t.plan || '', fee: t.fee ?? null, period: t.period || 'monthly',
  starts_at: t.starts_at || null, expires_at: t.expires_at || null, trial: !!t.trial, max_users: t.max_users || null, max_stores: t.max_stores || null, limits: limitsOf(t), usage: parse(t.usage), usage_at: t.usage_at || null, expired: expired(t), api: apiPublic(t) });
// Firma kartı alanları (oluşturma ve düzenleme)
const DAY = 864e5;
const dateMs = (v, end = false) => { const s = str(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const ms = Date.parse(s + (end ? 'T23:59:59+03:00' : 'T00:00:00+03:00')); return Number.isFinite(ms) ? ms : null; };
function fields(b, t = {}) {
  const has = (k) => b[k] !== undefined;
  const fee = has('fee') ? (b.fee === '' || b.fee == null ? null : Math.max(0, Number(String(b.fee).replace(',', '.')) || 0)) : t.fee ?? null;
  const max = has('max_users') ? (Number(b.max_users) > 0 ? Math.min(1000, Math.round(Number(b.max_users))) : null) : t.max_users ?? null;
  const maxStores = has('max_stores') ? (Number(b.max_stores) > 0 ? Math.min(500, Math.round(Number(b.max_stores))) : null) : t.max_stores ?? null;
  const v = (k, n = 200) => (has(k) ? str(b[k]).trim().slice(0, n) : t[k] || '');
  return {
    name: v('name', 120) || t.name, email: v('email', 120), phone: v('phone', 40), note: v('note', 1000), legal: v('legal', 200), tax: v('tax', 80), contact: v('contact', 120),
    address: v('address', 400), city: v('city', 60), plan: v('plan', 60), fee, period: has('period') ? (b.period === 'yearly' ? 'yearly' : 'monthly') : t.period || 'monthly',
    starts_at: has('starts_at') ? dateMs(b.starts_at) : t.starts_at ?? null, expires_at: has('expires_at') ? dateMs(b.expires_at, true) : t.expires_at ?? null,
    trial: has('trial') ? (b.trial ? 1 : 0) : t.trial ? 1 : 0, max_users: max, max_stores: maxStores,
  };
}
const COLS = ['name', 'email', 'phone', 'note', 'legal', 'tax', 'contact', 'address', 'city', 'plan', 'fee', 'period', 'starts_at', 'expires_at', 'trial', 'max_users', 'max_stores'];
// Ay ekle (takvim ayı; 31 Ocak + 1 ay = 28/29 Şubat)
function addMonths(ms, n) { const d = new Date(ms + 3 * 3600e3), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime() - 3 * 3600e3; }
// Firma oluşturma (ana panelden ya da online satın almada): kayıt, firmanın paneli (Durable Object) ve hoş geldiniz e-postası.
// passHash: online satışta müşterinin seçtiği şifrenin özeti (şifrenin kendisi saklanmaz).
export async function checkNewTenant(db, b) {
  const slug = str(b.slug).toLocaleLowerCase('tr').trim(), name = str(b.name).trim(), username = str(b.admin_username).trim();
  if (!SLUG_RE.test(slug)) fail(400, 'Firma kodu 3-32 karakter olmalı: küçük harf, rakam ve tire (ör. yesil-bahce)');
  if (!name) fail(400, 'Firma adı gerekli');
  if (!/^[\p{L}0-9._-]{3,40}$/u.test(username)) fail(400, 'Yönetici kullanıcı adı 3-40 karakter olmalı (harf, rakam, . _ -)');
  if (slug === DEMO_SLUG) fail(400, 'Bu firma kodu web sitesindeki demo paneline ayrılmış');
  if (await first(db, 'SELECT 1 AS x FROM tenants WHERE slug = ?', slug)) fail(400, 'Bu firma kodu kullanılıyor; başka bir kod seçin');
  return { slug, name, username };
}
export async function createTenant(env, db, b, { origin }) {
  const { slug, name, username } = await checkNewTenant(db, b);
  const pw = String(b.admin_password || '');
  if (!b.passHash && pw.length < 8) fail(400, 'Yönetici şifresi en az 8 karakter olmalı');
  const f = fields(b);
  // Deneme süresi: bitiş girilmediyse 7 gün
  if (f.trial && !f.expires_at) f.expires_at = Date.now() + 7 * DAY;
  if (!f.starts_at) f.starts_at = Date.now();
  const t = { slug, ...f, name, active: 1, admin_username: username, created_at: Date.now(), updated_at: Date.now() };
  await admin(env, t, 'setup', { username, password: pw, passHash: b.passHash || null, name });
  await run(db, `INSERT INTO tenants (slug, ${COLS.join(', ')}, active, admin_username, created_at, updated_at) VALUES (?, ${COLS.map(() => '?').join(', ')}, 1, ?, ?, ?)`,
    slug, ...COLS.map((k) => t[k] ?? null), username, t.created_at, t.updated_at);
  cache.delete(slug);
  // Hoş geldiniz e-postası (firma kartında e-posta varsa): giriş bilgileri ve şifre belirleme bağlantısı
  let mail = null;
  if (f.email && b.welcome !== false) {
    mail = await admin(env, t, 'welcome', { email: f.email, firm: name, slug, username, origin, link: `${origin}/#/sifre/${slug}.`, trialDays: f.trial ? Math.max(1, Math.round((f.expires_at - Date.now()) / DAY)) : 0 }).catch((e) => ({ error: e.message }));
  }
  return { ok: true, tenant: pub(t), mail };
}

// Tahsilat kaydı: abonelik belirtilen ay kadar uzar (bitiş geçmişse bugünden, değilse bitişten itibaren). plan verilirse paket de
// değişir (online satın almada). Panel yeni bilgileri hemen öğrenir (süresi dolmuş panelin senkronu yeniden başlar).
export async function recordPayment(env, db, t, { at = Date.now(), amount = 0, months = 0, method = '', note = '', user = '', plan = null }) {
  await run(db, 'INSERT INTO tenant_payments (slug, at, amount, months, method, note, user) VALUES (?, ?, ?, ?, ?, ?, ?)', t.slug, at, amount, months, String(method).slice(0, 40), String(note).slice(0, 300), user);
  let expires = t.expires_at;
  const next = { ...t };
  if (months) { expires = addMonths(Math.max(Date.now(), t.expires_at || 0), months); next.expires_at = expires; next.trial = 0; }
  if (plan) next.plan = plan;
  if (months || plan) {
    await run(db, 'UPDATE tenants SET expires_at = ?, trial = ?, plan = ?, updated_at = ? WHERE slug = ?', next.expires_at ?? null, next.trial ? 1 : 0, next.plan || null, Date.now(), t.slug);
    cache.delete(t.slug);
    await admin(env, next, 'ping').catch(() => {});
  }
  return { ok: true, expires_at: expires };
}

export async function tenantApi(req, env, db, path, user) {
  if (user.role !== 'admin' || user.tenant) fail(403, 'Bu bölüm yalnız ana panel yöneticisine açıktır');
  const m = req.method, b = m === 'GET' ? {} : await req.json().catch(() => ({}));
  let x;
  if (path === 'tenants' && m === 'GET') {
    const [rows, pays] = await Promise.all([all(db, 'SELECT * FROM tenants ORDER BY created_at DESC'), all(db, 'SELECT slug, MAX(at) AS last_at, SUM(amount) AS total FROM tenant_payments GROUP BY slug')]);
    const p = new Map(pays.map((x) => [x.slug, x]));
    return { tenants: rows.map((t) => ({ ...pub(t), paid_total: (p.get(t.slug) || {}).total || 0, last_payment: (p.get(t.slug) || {}).last_at || null })), ready: !!env.TENANT };
  }
  if (path === 'tenants' && m === 'POST') return createTenant(env, db, b, { origin: new URL(req.url).origin });
  if ((x = path.match(/^tenants\/([a-z0-9-]+)(?:\/(stats|password|support|delete|payments|api))?(?:\/(\d+))?$/))) {
    const t = await getTenant(db, x[1], true);
    if (!t) fail(404, 'Müşteri paneli bulunamadı');
    const op = x[2];
    if (!op && m === 'PUT') {
      const active = b.active === undefined ? t.active : b.active ? 1 : 0;
      const f = fields(b, t);
      await run(db, `UPDATE tenants SET ${COLS.map((k) => k + ' = ?').join(', ')}, active = ?, updated_at = ? WHERE slug = ?`, ...COLS.map((k) => f[k] ?? null), active, Date.now(), t.slug);
      if (active !== t.active) await admin(env, t, active ? 'resume' : 'suspend');
      cache.delete(t.slug);
      // Paket, sınırlar ve bitiş tarihi panele hemen iletilir
      if (active) await admin(env, { ...t, ...f, active }, 'ping').catch(() => {});
      return { ok: true };
    }
    // Kullanım: panelden anlık okunur ve kayda yazılır (liste her firmaya ayrı istek atmadan gösterir)
    if (op === 'stats' && m === 'GET') {
      const st = await admin(env, t, 'stats');
      await run(db, 'UPDATE tenants SET usage = ?, usage_at = ? WHERE slug = ?', JSON.stringify(st), Date.now(), t.slug);
      return st;
    }
    // Tahsilatlar: ödeme kaydı aboneliği belirtilen ay kadar uzatır (bitiş geçmişse bugünden, değilse bitişten itibaren)
    if (op === 'payments' && m === 'GET') return { payments: await all(db, 'SELECT * FROM tenant_payments WHERE slug = ? ORDER BY at DESC LIMIT 200', t.slug) };
    if (op === 'payments' && m === 'POST') {
      const amount = Math.max(0, Number(String(b.amount ?? '').replace(',', '.')) || 0), months = Math.max(0, Math.min(36, Math.round(Number(b.months) || 0)));
      if (!amount && !months) fail(400, 'Tutar ya da uzatılacak süre girin');
      return recordPayment(env, db, t, { at: dateMs(b.date) || Date.now(), amount, months, method: str(b.method), note: str(b.note), user: user.name || '' });
    }
    if (op === 'payments' && m === 'DELETE' && x[3]) { await run(db, 'DELETE FROM tenant_payments WHERE id = ? AND slug = ?', Number(x[3]), t.slug); return { ok: true }; }
    // Dış API (stok aktarımı): yalnız ana panel açar / kapatır / anahtar üretir; firma yöneticisi göremez ve değiştiremez
    if (op === 'api' && m === 'GET') return apiPublic(t);
    if (op === 'api' && m === 'POST') {
      const a = apiOf(t), act = str(b.action);
      let key = null;
      if (act === 'enable' || act === 'rotate') {
        const k = await newKey(t.slug);
        Object.assign(a, { on: true, hash: k.hash, hint: k.hint, created_at: Date.now(), by: user.name || '' });
        key = k.key;
      } else if (act === 'disable') a.on = false;
      else if (act === 'resume') { if (!a.hash) fail(400, 'Önce anahtar oluşturun'); a.on = true; }
      else if (act === 'ips') { try { a.ips = parseIps(b.ips); } catch (e) { fail(400, e.message); } }
      else fail(400, 'Geçersiz işlem');
      await run(db, 'UPDATE tenants SET api = ?, updated_at = ? WHERE slug = ?', JSON.stringify(a), Date.now(), t.slug);
      cache.delete(t.slug);
      return { ok: true, key, api: apiPublic({ api: JSON.stringify(a) }) };
    }
    if (op === 'password' && m === 'POST') {
      if (String(b.password || '').length < 8) fail(400, 'Şifre en az 8 karakter olmalı');
      return admin(env, t, 'password', { username: str(b.username) || t.admin_username, password: String(b.password) });
    }
    // Destek girişi: ana panel yöneticisi müşteri paneline 2 saatlik "Destek" oturumuyla girer
    if (op === 'support' && m === 'POST') {
      if (!t.active) fail(400, 'Askıdaki panele giriş yapılamaz');
      const r = await admin(env, t, 'support', { secure: new URL(req.url).protocol === 'https:' });
      return { ok: true, cookie: r.cookie };
    }
    if (op === 'delete' && m === 'POST') {
      if (str(b.confirm) !== t.slug) fail(400, 'Silmek için firma kodunu yazın');
      await admin(env, t, 'destroy');
      await run(db, 'DELETE FROM tenants WHERE slug = ?', t.slug);
      await run(db, 'DELETE FROM tenant_payments WHERE slug = ?', t.slug);
      cache.delete(t.slug);
      return { ok: true };
    }
  }
  fail(404, 'Bulunamadı');
}

// ---------- müşteri panelinin kendisi (Durable Object) ----------
export class TenantPanel {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.db = doD1(ctx.storage); this.t = null; this.tenv = null; this.pf = null; this.pfAt = 0; this.perf = new PerfBuffer(); }
  // Platform değerleri ana veritabanından 10 dakikada bir okunur; değişince ortam yeniden kurulur
  async platform() {
    if (this.pf && Date.now() - this.pfAt < 600e3) return;
    let v = this.pf || {};
    try { v = await platformValues(this.env, this.env.DB); } catch (e) { console.error('platform değerleri okunamadı', e); }
    this.pfAt = Date.now();
    if (JSON.stringify(v) !== JSON.stringify(this.pf)) { this.pf = v; this.tenv = null; }
  }
  async meta(req) {
    const slug = req && req.headers.get('X-Tenant-Slug');
    if (slug) {
      const H = (k) => req.headers.get(k) || '';
      const next = { slug, name: decodeURIComponent(H('X-Tenant-Name')) || slug, maxUsers: Number(H('X-Tenant-Max-Users')) || 0, plan: H('X-Tenant-Plan'),
        maxStores: Number(H('X-Tenant-Max-Stores')) || 0, expires: Number(H('X-Tenant-Expires')) || 0, trial: H('X-Tenant-Trial') === '1' };
      if (!this.t || JSON.stringify(this.t) !== JSON.stringify(next)) { this.t = next; this.tenv = null; await this.ctx.storage.put('meta', this.t); }
    } else if (!this.t) this.t = (await this.ctx.storage.get('meta')) || null;
    if (this.t) await this.platform();
    if (this.t && !this.tenv) this.tenv = tenantEnv(this.env, this.t, this.pf || {});
    return this.tenv;
  }
  async schedule() { if (!(await this.ctx.storage.get('suspended')) && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + SYNC_MS); }
  async fetch(req) {
    // Silinmiş firma: önbellekteki eski kayıtla gelen istek veriyi / zamanlayıcıyı yeniden oluşturmasın (yalnız yeniden kurulum)
    if (await this.ctx.storage.get('destroyed') && new URL(req.url).pathname !== '/__admin') return json({ error: 'Müşteri paneli yok' }, 404);
    const env = await this.meta(req);
    if (!env) return json({ error: 'Müşteri paneli tanımsız' }, 400);
    const url = new URL(req.url);
    if (url.pathname === '/__admin') return this.adminOp(env, await req.json().catch(() => ({})));
    // Dış API: anahtar Worker'da doğrulandı (bu yol yalnız Worker içinden gelir; tarayıcı istekleri /api/ ile başlar)
    if (url.pathname.startsWith('/__api/')) {
      if (await this.ctx.storage.get('suspended')) return json({ error: 'Mağaza paneli askıda' }, 403);
      await init(this.db);
      return extApiInner(this.db, url, this.t);
    }
    if (await this.ctx.storage.get('suspended')) return json({ error: 'Bu müşteri paneli askıya alınmış' }, 403);
    // Destek talepleri: firmanın kendi talepleri, ana panelin veritabanında (ana panel yanıtlar)
    const sp = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
    if (/^support(\/|$)/.test(sp)) {
      if (!this.env.DB) return json({ error: 'Destek şu an kullanılamıyor' }, 503);
      try {
        await init(this.db);
        const user = await currentUser(req, env, this.db);
        if (!user) return json({ error: 'Giriş gerekli' }, 401);
        if (req.method !== 'GET' && req.headers.get('Origin') && new URL(req.headers.get('Origin')).host !== url.host) return json({ error: 'İzin verilmeyen kaynak' }, 403);
        await init(this.env.DB);
        return await supportResponse(req, this.env.DB, sp, { slug: this.t.slug, firm: this.t.name, user, staff: false });
      } catch (e) { return json({ error: e.message || 'Hata' }, e.status || 500); }
    }
    // Paketim (online satın alma / yenileme): ödeme ve abonelik ana panelin kaydında; yalnız bu firmanın kaydı
    if (/^billing(\/|$)/.test(sp)) {
      try {
        await init(this.db);
        const user = await currentUser(req, env, this.db);
        if (!user) return json({ error: 'Giriş gerekli' }, 401);
        if (req.method !== 'GET' && req.headers.get('Origin') && new URL(req.headers.get('Origin')).host !== url.host) return json({ error: 'İzin verilmeyen kaynak' }, 403);
        const b = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
        return json(await tenantBilling(this.env, this.t, user, req.method, sp, b, url.origin));
      } catch (e) { return json({ error: e.message || 'Hata' }, e.status || 500); }
    }
    // Hata bildirimi (tarayıcıdan): ana panelin hata kayıtlarına firma adıyla düşer
    if (sp === 'errors/report' && req.method === 'POST') {
      try {
        await init(this.db);
        const user = await currentUser(req, env, this.db);
        if (!user || !this.env.DB) return json({ ok: false });
        await init(this.env.DB);
        await recordError(this.env.DB, clientReport(await req.json().catch(() => ({})), { slug: this.t.slug, firm: this.t.name, user }));
        return json({ ok: true });
      } catch (e) { return json({ ok: false }); }
    }
    await this.schedule();
    if (env.DEMO === '1' && Date.now() - (this.seen || 0) > 60e3) { this.seen = Date.now(); await this.ctx.storage.put('demo_seen', this.seen); }
    const t0 = Date.now(), res = await handle(req, env, { waitUntil: (p) => this.ctx.waitUntil(p) }, this.db);
    if (res.status >= 500) this.ctx.waitUntil(report5xx(this.env.DB, req, res, { slug: this.t.slug, firm: this.t.name }).catch(() => {}));
    // İstek süresi: firma adıyla ana panelin "Sistem hızı" bölümüne
    this.perf.add(req.method, sp, Date.now() - t0);
    if (this.perf.due() && this.env.DB) this.ctx.waitUntil(init(this.env.DB).then(() => this.perf.flush(this.env.DB, { slug: this.t.slug, firm: this.t.name })).catch(() => {}));
    return res;
  }
  // Arka plan (senkron) hataları: son kontrolden beri yazılan hata günlükleri ana panelin hata kayıtlarına aktarılır
  async reportSyncErrors(err) {
    if (!this.env.DB || !this.t) return;
    const since = (await this.ctx.storage.get('errlog_at')) || Date.now() - 3600e3, now = Date.now();
    const rows = await all(this.db, "SELECT at, channel, msg FROM logs WHERE level = 'error' AND at > ? ORDER BY at LIMIT 50", since);
    if (err) rows.push({ channel: '', msg: 'Senkron durdu: ' + (err.message || err), stack: err.stack });
    if (rows.length) {
      await init(this.env.DB);
      for (const r of rows) await recordError(this.env.DB, { slug: this.t.slug, firm: this.t.name, source: 'sync', message: r.msg, action: r.channel ? `kanal: ${r.channel}` : 'senkron', detail: r.stack ? { stack: String(r.stack).slice(0, 2500) } : {} });
    }
    await this.ctx.storage.put('errlog_at', now);
  }
  async adminOp(env, b) {
    const db = this.db;
    try {
      await init(db);
      if (b.op === 'setup') {
        const n = await first(db, 'SELECT COUNT(*) AS n FROM users');
        if (!n.n) await run(db, "INSERT INTO users (username, name, email, pass, role, active, created_at) VALUES (?, ?, '', ?, 'admin', 1, ?)", b.username, b.username, b.passHash && /^pbkdf2/.test(b.passHash) ? b.passHash : await hashPassword(String(b.password)), Date.now());
        // Firma adı (giriş ekranı, etiket, e-posta) müşterinin adıyla başlar; Ayarlar'dan değiştirilebilir
        await run(db, "INSERT INTO settings (k, v) VALUES ('company', ?) ON CONFLICT (k) DO NOTHING", JSON.stringify({ title: b.name, legal: b.name }));
        // Yeni firma: kanallardaki ürünler kendiliğinden ürün kartına dönüşmez; firma Kanal Ürünleri'nden istediğini seçer
        await run(db, "INSERT INTO settings (k, v) VALUES ('manual_import', ?) ON CONFLICT (k) DO NOTHING", JSON.stringify({ '*': true }));
        await this.ctx.storage.delete('suspended'); await this.ctx.storage.delete('destroyed');
        await this.schedule();
        return json({ ok: true });
      }
      if (b.op === 'suspend') { await this.ctx.storage.put('suspended', true); await this.ctx.storage.deleteAlarm(); return json({ ok: true }); }
      if (b.op === 'resume') { await this.ctx.storage.delete('suspended'); await this.schedule(); return json({ ok: true }); }
      if (b.op === 'password') {
        const u = await first(db, 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)', b.username);
        if (u) await run(db, 'UPDATE users SET pass = ?, active = 1 WHERE id = ?', await hashPassword(String(b.password)), u.id);
        else await run(db, "INSERT INTO users (username, name, email, pass, role, active, created_at) VALUES (?, ?, '', ?, 'admin', 1, ?)", b.username, b.username, await hashPassword(String(b.password)), Date.now());
        await run(db, "DELETE FROM settings WHERE k = 'login_fail'");
        return json({ ok: true, username: b.username });
      }
      if (b.op === 'support') return json({ ok: true, cookie: await supportCookie(env, !!b.secure) });
      if (b.op === 'demo') {
        if (env.DEMO !== '1') return json({ error: 'Bu panel demo paneli değil' }, 400);
        await this.ctx.storage.delete('suspended'); await this.ctx.storage.delete('destroyed');
        if (await this.demoDue()) await this.demoReset(env);
        await this.schedule();
        return json({ ok: true, cookie: await demoCookie(env, this.db, !!b.secure) });
      }
      if (b.op === 'forgot') { try { await forgot(env, db, { who: b.who, link: b.link }); } catch (e) { console.error('şifre yenileme e-postası', e); } return json({ ok: true }); }
      if (b.op === 'reset') return json(await resetPassword(db, { token: b.token, password: b.password }));
      if (b.op === 'welcome') { try { return json(await welcome(env, db, b)); } catch (e) { return json({ error: e.message }); } }
      // Ana panelin bekçisi: zamanlayıcı bir nedenle kaybolduysa yeniden kurulur
      if (b.op === 'ping') { await this.schedule(); return json({ ok: true, alarm: await this.ctx.storage.getAlarm() }); }
      if (b.op === 'stats') return json({ ...(await this.usage()), suspended: !!(await this.ctx.storage.get('suspended')) });
      if (b.op === 'destroy') { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); await this.ctx.storage.put('destroyed', true); this.db = doD1(this.ctx.storage); this.t = null; this.tenv = null; return json({ ok: true }); }
      return json({ error: 'Bilinmeyen işlem' }, 400);
    } catch (e) { return json({ error: e.message }, e.status || 500); }
  }
  async demoDue() {
    const st = this.ctx.storage;
    return demoDue(Date.now(), (await st.get('demo_reset_at')) || 0, (await st.get('demo_seen')) || 0);
  }
  // Demo paneli sıfırlama: ziyaretçilerin yaptığı değişiklikler silinir, örnek veriler baştan çekilir. Demo kullanıcısı aynı
  // kimlik ve şifre özetiyle yeniden yazılır; böylece açık oturumlar geçerli kalır.
  async demoReset(env) {
    const keep = await first(this.db, "SELECT id, pass, perms FROM users WHERE username = 'demo'").catch(() => null);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.db = doD1(this.ctx.storage);
    if (this.t) await this.ctx.storage.put('meta', this.t);
    await init(this.db);
    if (keep) await run(this.db, "INSERT INTO users (id, username, name, email, pass, role, active, created_at, perms) VALUES (?, 'demo', 'Demo kullanıcı', '', ?, 'staff', 1, ?, ?)", keep.id, keep.pass, Date.now(), keep.perms);
    await run(this.db, "INSERT INTO settings (k, v) VALUES ('company', ?) ON CONFLICT (k) DO NOTHING", JSON.stringify({ title: 'Demo Mağaza', legal: 'Demo Mağaza' }));
    await this.ctx.storage.put('demo_reset_at', Date.now());
    try { await syncAll(env, this.db); } catch (e) { console.error('demo paneli senkron hatası', e); }
    // Örnek ürünlerin alış fiyatı ve desisi: kâr raporları gerçekçi görünsün
    for (const [sku, , , , cost, desi] of DEMO_PRODUCTS) await run(this.db, 'UPDATE products SET purchase_price = ?, desi = ? WHERE sku = ? AND purchase_price = 0', cost, desi, sku).catch(() => {});
  }
  // Kullanım özeti (Firmalar listesi): kullanıcı, kanal, ürün, sipariş, son 30 gün sipariş / ciro, son giriş ve sipariş
  async usage() {
    const db = this.db, since = Date.now() - 30 * 864e5;
    const r = await first(db, `SELECT (SELECT COUNT(*) FROM users WHERE active = 1) AS users, (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM products) AS products,
      (SELECT COUNT(*) FROM channel_config WHERE data IS NOT NULL) AS channels, (SELECT MAX(last_login) FROM users) AS last_login, (SELECT MAX(ordered_at) FROM orders) AS last_order,
      (SELECT COUNT(*) FROM orders WHERE ordered_at >= ? AND status NOT IN ('cancelled')) AS orders30, (SELECT COALESCE(SUM(total), 0) FROM orders WHERE ordered_at >= ? AND status NOT IN ('cancelled', 'returned')) AS revenue30`, since, since);
    return { ...r, revenue30: Math.round(r.revenue30 || 0) };
  }
  // 15 dakikada bir: siparişler, ürünler, stoklar (ana paneldeki zamanlanmış senkronun aynısı); ardından kullanım özeti ana kayda yazılır
  async alarm() {
    const env = await this.meta();
    if (!env || await this.ctx.storage.get('suspended') || await this.ctx.storage.get('destroyed')) return;
    // Sonraki tur baştan kurulur: bu tur yarıda kesilse (süre sınırı, güncelleme) bile senkron durmaz
    await this.ctx.storage.setAlarm(Date.now() + SYNC_MS);
    // Abonelik süresi doldu: kanallara stok / fiyat gönderimi ve senkron durur (müşteri panele giremezken arka planda iş yapılmaz).
    // Yenilenince ana panel bitiş tarihini iletir, senkron kendiliğinden devam eder.
    if (this.t && this.t.expires && Date.now() > this.t.expires && env.DEMO !== '1') return;
    let syncErr = null;
    if (env.DEMO === '1' && (await this.demoDue())) {
      try { await this.demoReset(env); } catch (e) { console.error('demo paneli sıfırlanamadı', e); }
      return void (await this.ctx.storage.setAlarm(Date.now() + SYNC_MS));
    }
    try { await init(this.db); await syncAll(env, this.db); } catch (e) { syncErr = e; console.error('müşteri paneli senkron hatası', this.t && this.t.slug, e); }
    try { await this.reportSyncErrors(syncErr); } catch (e) { console.error('hata kayıtları aktarılamadı', e); }
    // Saatte bir yeter (ana veritabanına yazma maliyeti)
    try {
      const last = (await this.ctx.storage.get('usage_at')) || 0;
      if (this.env.DB && this.t && Date.now() - last > 3600e3) {
        await run(this.env.DB, 'UPDATE tenants SET usage = ?, usage_at = ? WHERE slug = ?', JSON.stringify(await this.usage()), Date.now(), this.t.slug);
        await this.ctx.storage.put('usage_at', Date.now());
      }
    } catch (e) { console.error('kullanım özeti yazılamadı', e); }
    finally { if (!(await this.ctx.storage.get('suspended')) && !(await this.ctx.storage.get('destroyed'))) await this.ctx.storage.setAlarm(Date.now() + SYNC_MS); }
  }
}
