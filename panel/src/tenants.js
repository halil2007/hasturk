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

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const SYNC_MS = 15 * 60e3;
// Müşteri paneline geçmeyen ortam değişkenleri: ana panelin kanal / e-posta bilgileri, şifresi, deneme modu, bağlantılar
const PRIVATE = /^(IKAS\d?_|TRENDYOL_|HB_|PTTAVM_|N11_|IDEFIX_|PAZARAMA_|MAIL_)/;
const DROP = new Set(['PANEL_PASSWORD', 'DEMO', 'DB', 'TENANT']);

export function tenantEnv(env, t) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!DROP.has(k) && !PRIVATE.test(k)) out[k] = v;
  // Müşterinin API bilgileri ve oturum imzası kendi anahtarıyla: ana panelin gizli anahtarı yoksa müşteri paneli açılmaz
  // (herkesçe bilinen bir sabitten türetilen anahtarla destek oturumu taklit edilebilirdi)
  if (!env.PANEL_SECRET && !env.PANEL_PASSWORD) fail(503, 'Müşteri panelleri için Cloudflare → Variables and Secrets → PANEL_SECRET tanımlanmalı');
  out.PANEL_SECRET = `${env.PANEL_SECRET || env.PANEL_PASSWORD}|tenant:${t.slug}`;
  out.TENANT_SLUG = t.slug;
  out.TENANT_NAME = t.name || t.slug;
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
  h.set('X-Tenant-Slug', t.slug); h.set('X-Tenant-Name', enc(t.name));
  return stub(env, t.slug).fetch(new Request(url || req.url, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer() }));
}
async function admin(env, t, op, data = {}) {
  const r = await stub(env, t.slug).fetch(new Request('https://tenant.internal/__admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': t.slug, 'X-Tenant-Name': enc(t.name) }, body: JSON.stringify({ op, ...data }) }));
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
  const h = new Headers(req.headers); h.set('Content-Type', 'application/json');
  return forward(new Request(req.url, { method: 'POST', headers: h, body: JSON.stringify({ username: b.username, password: b.password }) }), env, t);
}

// ---------- ana panel: müşteri panellerini yönetme (yalnız ana panelin yöneticisi) ----------
const pub = (t) => ({ slug: t.slug, name: t.name, email: t.email, phone: t.phone, note: t.note, active: !!t.active, admin_username: t.admin_username, created_at: t.created_at, updated_at: t.updated_at });
export async function tenantApi(req, env, db, path, user) {
  if (user.role !== 'admin' || user.tenant) fail(403, 'Bu bölüm yalnız ana panel yöneticisine açıktır');
  const m = req.method, b = m === 'GET' ? {} : await req.json().catch(() => ({}));
  let x;
  if (path === 'tenants' && m === 'GET') return { tenants: (await all(db, 'SELECT * FROM tenants ORDER BY created_at DESC')).map(pub), ready: !!env.TENANT };
  if (path === 'tenants' && m === 'POST') {
    const slug = str(b.slug).toLocaleLowerCase('tr').trim(), name = str(b.name).trim(), username = str(b.admin_username).trim(), pw = String(b.admin_password || '');
    if (!SLUG_RE.test(slug)) fail(400, 'Firma kodu 3-32 karakter olmalı: küçük harf, rakam ve tire (ör. yesil-bahce)');
    if (!name) fail(400, 'Firma adı gerekli');
    if (!/^[\p{L}0-9._-]{3,40}$/u.test(username)) fail(400, 'Yönetici kullanıcı adı 3-40 karakter olmalı');
    if (pw.length < 8) fail(400, 'Yönetici şifresi en az 8 karakter olmalı');
    if (await first(db, 'SELECT 1 AS x FROM tenants WHERE slug = ?', slug)) fail(400, 'Bu firma kodu kullanılıyor');
    const t = { slug, name, email: str(b.email), phone: str(b.phone), note: str(b.note), active: 1, admin_username: username, created_at: Date.now(), updated_at: Date.now() };
    await admin(env, t, 'setup', { username, password: pw, name });
    await run(db, 'INSERT INTO tenants (slug, name, email, phone, note, active, admin_username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)', slug, name, t.email, t.phone, t.note, username, t.created_at, t.updated_at);
    cache.delete(slug);
    return { ok: true, tenant: pub(t) };
  }
  if ((x = path.match(/^tenants\/([a-z0-9-]+)(?:\/(stats|password|support|delete))?$/))) {
    const t = await getTenant(db, x[1], true);
    if (!t) fail(404, 'Müşteri paneli bulunamadı');
    const op = x[2];
    if (!op && m === 'PUT') {
      const active = b.active === undefined ? t.active : b.active ? 1 : 0;
      await run(db, 'UPDATE tenants SET name = ?, email = ?, phone = ?, note = ?, active = ?, updated_at = ? WHERE slug = ?', str(b.name ?? t.name) || t.name, str(b.email ?? t.email), str(b.phone ?? t.phone), str(b.note ?? t.note), active, Date.now(), t.slug);
      if (active !== t.active) await admin(env, t, active ? 'resume' : 'suspend');
      cache.delete(t.slug);
      return { ok: true };
    }
    if (op === 'stats' && m === 'GET') return admin(env, t, 'stats');
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
      cache.delete(t.slug);
      return { ok: true };
    }
  }
  fail(404, 'Bulunamadı');
}

// ---------- müşteri panelinin kendisi (Durable Object) ----------
export class TenantPanel {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.db = doD1(ctx.storage); this.t = null; this.tenv = null; }
  async meta(req) {
    const slug = req && req.headers.get('X-Tenant-Slug');
    if (slug) {
      const name = decodeURIComponent(req.headers.get('X-Tenant-Name') || '') || slug;
      if (!this.t || this.t.slug !== slug || this.t.name !== name) { this.t = { slug, name }; this.tenv = null; await this.ctx.storage.put('meta', this.t); }
    } else if (!this.t) this.t = (await this.ctx.storage.get('meta')) || null;
    if (this.t && !this.tenv) this.tenv = tenantEnv(this.env, this.t);
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
      if (b.op === 'stats') {
        const q = async (s) => ((await first(db, s)) || {}).n || 0;
        return json({
          users: await q('SELECT COUNT(*) AS n FROM users WHERE active = 1'), orders: await q('SELECT COUNT(*) AS n FROM orders'), products: await q('SELECT COUNT(*) AS n FROM products'),
          channels: await q('SELECT COUNT(*) AS n FROM channel_config WHERE data IS NOT NULL'), last_login: await q('SELECT MAX(last_login) AS n FROM users'),
          last_order: await q('SELECT MAX(ordered_at) AS n FROM orders'), suspended: !!(await this.ctx.storage.get('suspended')),
        });
      }
      if (b.op === 'destroy') { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); await this.ctx.storage.put('destroyed', true); this.db = doD1(this.ctx.storage); this.t = null; this.tenv = null; return json({ ok: true }); }
      return json({ error: 'Bilinmeyen işlem' }, 400);
    } catch (e) { return json({ error: e.message }, e.status || 500); }
  }
  // 15 dakikada bir: siparişler, ürünler, stoklar (ana paneldeki zamanlanmış senkronun aynısı)
  async alarm() {
    const env = await this.meta();
    if (!env || await this.ctx.storage.get('suspended') || await this.ctx.storage.get('destroyed')) return;
    try { await init(this.db); await syncAll(env, this.db); } catch (e) { console.error('müşteri paneli senkron hatası', this.t && this.t.slug, e); }
    finally { if (!(await this.ctx.storage.get('suspended')) && !(await this.ctx.storage.get('destroyed'))) await this.ctx.storage.setAlarm(Date.now() + SYNC_MS); }
  }
}
