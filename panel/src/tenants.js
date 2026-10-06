// Müşteri panelleri (CRM'i başka firmalara satmak için).
// Her müşteri paneli ayrı bir Durable Object'tir: kendi SQLite veritabanı (siparişler, ürünler, kullanıcılar, şifreli API bilgileri),
// kendi zamanlanmış senkronu (15 dk alarm). Kod ve arayüz ana panelle aynıdır; panel güncellenince müşteri panelleri de güncellenir.
// Ana panel yalnızca kaydı tutar (tenants tablosu): firma adı, firma kodu, durum. Müşteri verisi ana veritabanına hiç girmez.
// Giriş: giriş ekranında "Firma kodu" + kullanıcı adı + şifre. Oturum çerezi firma koduyla başlar ("kod~..."), istek o firmanın
// Durable Object'ine iletilir. Ana panelin API bilgileri, şifresi ve deneme modu müşteri paneline geçmez.
import { all, first, run, init } from './db.js';
import { handle } from './handler.js';
import { syncAll } from './sync.js';
import { doD1 } from './dosql.js';
import { hashPassword, supportCookie } from './auth.js';
import { json, fail, str } from './util.js';
import { loadConfig } from './config.js';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const SYNC_MS = 15 * 60e3;
// Müşteri paneline geçmeyen ortam değişkenleri: ana panelin kanal / e-posta bilgileri, şifresi, deneme modu, bağlantılar
const PRIVATE = /^(IKAS\d?_|TRENDYOL_|HB_|PTTAVM_|N11_|IDEFIX_|PAZARAMA_|MAIL_)/;
const DROP = new Set(['PANEL_PASSWORD', 'DEMO', 'DB', 'TENANT']);

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
// İsteği müşteri panelinin Durable Object'ine ilet (firma kodu ve adı başlıkla gider; DO yalnız buradan erişilebilir)
export async function forward(req, env, t, url) {
  const h = new Headers(req.headers);
  h.set('X-Tenant-Slug', t.slug); h.set('X-Tenant-Name', enc(t.name)); h.set('X-Tenant-Max-Users', String(t.max_users || 0));
  return stub(env, t.slug).fetch(new Request(url || req.url, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer() }));
}
async function admin(env, t, op, data = {}) {
  const r = await stub(env, t.slug).fetch(new Request('https://tenant.internal/__admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': t.slug, 'X-Tenant-Name': enc(t.name), 'X-Tenant-Max-Users': String(t.max_users || 0) }, body: JSON.stringify({ op, ...data }) }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) fail(r.status, j.error || 'Müşteri paneli yanıt vermedi');
  return j;
}

// Müşteri paneline giriş: firma kodu doğrulanır, giriş isteği o panelin veritabanında denetlenir
export async function tenantLogin(req, env, b) {
  const slug = str(b.tenant).toLocaleLowerCase('tr').trim();
  const t = SLUG_RE.test(slug) ? await getTenant(env.DB, slug) : null;
  if (!t) return json({ error: 'Firma kodu, kullanıcı adı veya şifre hatalı' }, 401);
  if (!t.active) return json({ error: 'Bu müşteri paneli askıya alınmış. Lütfen hizmet sağlayıcınızla görüşün.' }, 403);
  if (expired(t)) return json({ error: 'Aboneliğinizin süresi doldu. Yenilemek için hizmet sağlayıcınızla görüşün.' }, 403);
  const h = new Headers(req.headers); h.set('Content-Type', 'application/json');
  return forward(new Request(req.url, { method: 'POST', headers: h, body: JSON.stringify({ username: b.username, password: b.password }) }), env, t);
}

// ---------- ana panel: müşteri panellerini yönetme (yalnız ana panelin yöneticisi) ----------
const parse = (s) => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const pub = (t) => ({ slug: t.slug, name: t.name, email: t.email, phone: t.phone, note: t.note, active: !!t.active, admin_username: t.admin_username, created_at: t.created_at, updated_at: t.updated_at,
  legal: t.legal || '', tax: t.tax || '', contact: t.contact || '', address: t.address || '', city: t.city || '', plan: t.plan || '', fee: t.fee ?? null, period: t.period || 'monthly',
  starts_at: t.starts_at || null, expires_at: t.expires_at || null, trial: !!t.trial, max_users: t.max_users || null, usage: parse(t.usage), usage_at: t.usage_at || null, expired: expired(t) });
// Firma kartı alanları (oluşturma ve düzenleme)
const DAY = 864e5;
const dateMs = (v, end = false) => { const s = str(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const ms = Date.parse(s + (end ? 'T23:59:59+03:00' : 'T00:00:00+03:00')); return Number.isFinite(ms) ? ms : null; };
function fields(b, t = {}) {
  const has = (k) => b[k] !== undefined;
  const fee = has('fee') ? (b.fee === '' || b.fee == null ? null : Math.max(0, Number(String(b.fee).replace(',', '.')) || 0)) : t.fee ?? null;
  const max = has('max_users') ? (Number(b.max_users) > 0 ? Math.min(1000, Math.round(Number(b.max_users))) : null) : t.max_users ?? null;
  const v = (k, n = 200) => (has(k) ? str(b[k]).trim().slice(0, n) : t[k] || '');
  return {
    name: v('name', 120) || t.name, email: v('email', 120), phone: v('phone', 40), note: v('note', 1000), legal: v('legal', 200), tax: v('tax', 80), contact: v('contact', 120),
    address: v('address', 400), city: v('city', 60), plan: v('plan', 60), fee, period: has('period') ? (b.period === 'yearly' ? 'yearly' : 'monthly') : t.period || 'monthly',
    starts_at: has('starts_at') ? dateMs(b.starts_at) : t.starts_at ?? null, expires_at: has('expires_at') ? dateMs(b.expires_at, true) : t.expires_at ?? null,
    trial: has('trial') ? (b.trial ? 1 : 0) : t.trial ? 1 : 0, max_users: max,
  };
}
const COLS = ['name', 'email', 'phone', 'note', 'legal', 'tax', 'contact', 'address', 'city', 'plan', 'fee', 'period', 'starts_at', 'expires_at', 'trial', 'max_users'];
// Ay ekle (takvim ayı; 31 Ocak + 1 ay = 28/29 Şubat)
function addMonths(ms, n) { const d = new Date(ms + 3 * 3600e3), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime() - 3 * 3600e3; }
export async function tenantApi(req, env, db, path, user) {
  if (user.role !== 'admin' || user.tenant) fail(403, 'Bu bölüm yalnız ana panel yöneticisine açıktır');
  const m = req.method, b = m === 'GET' ? {} : await req.json().catch(() => ({}));
  let x;
  if (path === 'tenants' && m === 'GET') {
    const [rows, pays] = await Promise.all([all(db, 'SELECT * FROM tenants ORDER BY created_at DESC'), all(db, 'SELECT slug, MAX(at) AS last_at, SUM(amount) AS total FROM tenant_payments GROUP BY slug')]);
    const p = new Map(pays.map((x) => [x.slug, x]));
    return { tenants: rows.map((t) => ({ ...pub(t), paid_total: (p.get(t.slug) || {}).total || 0, last_payment: (p.get(t.slug) || {}).last_at || null })), ready: !!env.TENANT };
  }
  if (path === 'tenants' && m === 'POST') {
    const slug = str(b.slug).toLocaleLowerCase('tr').trim(), name = str(b.name).trim(), username = str(b.admin_username).trim(), pw = String(b.admin_password || '');
    if (!SLUG_RE.test(slug)) fail(400, 'Firma kodu 3-32 karakter olmalı: küçük harf, rakam ve tire (ör. yesil-bahce)');
    if (!name) fail(400, 'Firma adı gerekli');
    if (!/^[\p{L}0-9._-]{3,40}$/u.test(username)) fail(400, 'Yönetici kullanıcı adı 3-40 karakter olmalı');
    if (pw.length < 8) fail(400, 'Yönetici şifresi en az 8 karakter olmalı');
    if (await first(db, 'SELECT 1 AS x FROM tenants WHERE slug = ?', slug)) fail(400, 'Bu firma kodu kullanılıyor');
    const f = fields(b);
    // Deneme süresi: bitiş girilmediyse 14 gün
    if (f.trial && !f.expires_at) f.expires_at = Date.now() + 14 * DAY;
    if (!f.starts_at) f.starts_at = Date.now();
    const t = { slug, ...f, name, active: 1, admin_username: username, created_at: Date.now(), updated_at: Date.now() };
    await admin(env, t, 'setup', { username, password: pw, name });
    await run(db, `INSERT INTO tenants (slug, ${COLS.join(', ')}, active, admin_username, created_at, updated_at) VALUES (?, ${COLS.map(() => '?').join(', ')}, 1, ?, ?, ?)`,
      slug, ...COLS.map((k) => t[k] ?? null), username, t.created_at, t.updated_at);
    cache.delete(slug);
    return { ok: true, tenant: pub(t) };
  }
  if ((x = path.match(/^tenants\/([a-z0-9-]+)(?:\/(stats|password|support|delete|payments))?(?:\/(\d+))?$/))) {
    const t = await getTenant(db, x[1], true);
    if (!t) fail(404, 'Müşteri paneli bulunamadı');
    const op = x[2];
    if (!op && m === 'PUT') {
      const active = b.active === undefined ? t.active : b.active ? 1 : 0;
      const f = fields(b, t);
      await run(db, `UPDATE tenants SET ${COLS.map((k) => k + ' = ?').join(', ')}, active = ?, updated_at = ? WHERE slug = ?`, ...COLS.map((k) => f[k] ?? null), active, Date.now(), t.slug);
      if (active !== t.active) await admin(env, t, active ? 'resume' : 'suspend');
      cache.delete(t.slug);
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
      const at = dateMs(b.date) || Date.now();
      await run(db, 'INSERT INTO tenant_payments (slug, at, amount, months, method, note, user) VALUES (?, ?, ?, ?, ?, ?, ?)', t.slug, at, amount, months, str(b.method).slice(0, 40), str(b.note).slice(0, 300), user.name || '');
      let expires = t.expires_at;
      if (months) {
        expires = addMonths(Math.max(Date.now(), t.expires_at || 0), months);
        await run(db, 'UPDATE tenants SET expires_at = ?, trial = 0, updated_at = ? WHERE slug = ?', expires, Date.now(), t.slug);
        cache.delete(t.slug);
      }
      return { ok: true, expires_at: expires };
    }
    if (op === 'payments' && m === 'DELETE' && x[3]) { await run(db, 'DELETE FROM tenant_payments WHERE id = ? AND slug = ?', Number(x[3]), t.slug); return { ok: true }; }
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
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.db = doD1(ctx.storage); this.t = null; this.tenv = null; this.pf = null; this.pfAt = 0; }
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
      const name = decodeURIComponent(req.headers.get('X-Tenant-Name') || '') || slug, maxUsers = Number(req.headers.get('X-Tenant-Max-Users')) || 0;
      if (!this.t || this.t.slug !== slug || this.t.name !== name || (this.t.maxUsers || 0) !== maxUsers) { this.t = { slug, name, maxUsers }; this.tenv = null; await this.ctx.storage.put('meta', this.t); }
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
    if (await this.ctx.storage.get('suspended')) return json({ error: 'Bu müşteri paneli askıya alınmış' }, 403);
    await this.schedule();
    return handle(req, env, { waitUntil: (p) => this.ctx.waitUntil(p) }, this.db);
  }
  async adminOp(env, b) {
    const db = this.db;
    try {
      await init(db);
      if (b.op === 'setup') {
        const n = await first(db, 'SELECT COUNT(*) AS n FROM users');
        if (!n.n) await run(db, "INSERT INTO users (username, name, email, pass, role, active, created_at) VALUES (?, ?, '', ?, 'admin', 1, ?)", b.username, b.username, await hashPassword(String(b.password)), Date.now());
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
      if (b.op === 'stats') return json({ ...(await this.usage()), suspended: !!(await this.ctx.storage.get('suspended')) });
      if (b.op === 'destroy') { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); await this.ctx.storage.put('destroyed', true); this.db = doD1(this.ctx.storage); this.t = null; this.tenv = null; return json({ ok: true }); }
      return json({ error: 'Bilinmeyen işlem' }, 400);
    } catch (e) { return json({ error: e.message }, e.status || 500); }
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
    try { await init(this.db); await syncAll(env, this.db); } catch (e) { console.error('müşteri paneli senkron hatası', this.t && this.t.slug, e); }
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
