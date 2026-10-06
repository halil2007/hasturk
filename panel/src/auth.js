// Panel girişi ve kullanıcılar.
//  - Ana yönetici: kullanıcı adı "yonetici" (ya da boş) + Cloudflare'deki PANEL_PASSWORD.
//  - Diğer kullanıcılar panelden eklenir (Kullanıcılar); şifreler PBKDF2-SHA256 ile özetlenip saklanır.
//  - Oturum imzalı, HttpOnly bir çerezde tutulur; şifre değişince eski oturumlar geçersiz olur.
import { all, first, run, getRaw, setSetting } from './db.js';
import { PERM_VALUES } from '../public/perms.js';
const permsOf = (v) => { try { const a = JSON.parse(v || 'null'); return Array.isArray(a) ? a.filter((k) => PERM_VALUES.includes(k)) : null; } catch { return null; } };
// Oturum imzası şifreye ve oturum sürümüne bağlı: "oturumları kapat" sürümü artırır, eski çerezler geçersiz olur
const ver = (u) => u.pass.slice(-12) + (u.sess ? ':' + u.sess : '');

const COOKIE = 'hp_session';
const DAYS = 30;
const ITER = 100000; // yeni şifreler; eski özetler kendi tur sayısıyla doğrulanmaya devam eder
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(pw, salt, ITER))}`;
}
async function checkPassword(pw, stored) {
  const [, iter, salt, h] = String(stored).split('$');
  if (!h) return false;
  return same(b64(await pbkdf2(pw, unb64(salt), Number(iter))), h);
}

export const password = (env) => env.PANEL_PASSWORD || (env.DEMO === '1' ? 'demo' : '');
const secret = (env) => (env.PANEL_SECRET || '') + '|' + password(env);
const ADMIN = { id: 0, username: 'yonetici', name: 'Yönetici', role: 'admin' };
const isAdminName = (u) => !u || ['yonetici', 'yönetici', 'admin'].includes(String(u).trim().toLocaleLowerCase('tr'));

// Müşteri panelinde (env.TENANT_SLUG) çerez değeri firma koduyla başlar: "kod~kullanıcı.son.imza"
const pre = (env) => (env.TENANT_SLUG ? env.TENANT_SLUG + '~' : '');
const SUPPORT = { id: -1, username: 'destek', name: 'Destek', role: 'admin', support: true };
// Destek oturumu: ana panel yöneticisi müşteri paneline 2 saatliğine girer (yalnız ana panel üzerinden üretilir)
export async function supportCookie(env, secure) {
  const exp = String(Date.now() + 2 * 3600e3);
  const value = encodeURIComponent(`${pre(env)}-1.${exp}.${await hmac(secret(env), `-1.${exp}.support`)}`);
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${secure ? '; Secure' : ''}`;
}

// Çerezden oturumdaki kullanıcıyı bul (yoksa null)
export async function currentUser(req, env, db) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(COOKIE + '=([^;]+)'));
  if (!m) return null;
  let v = decodeURIComponent(m[1]);
  const i = v.indexOf('~');
  if (env.TENANT_SLUG ? v.slice(0, i + 1) !== pre(env) : i >= 0) return null; // başka panelin çerezi
  if (i >= 0) v = v.slice(i + 1);
  const [uid, exp, sig] = v.split('.');
  if (!sig || Number(exp) < Date.now()) return null;
  // Destek oturumu en fazla 2 saat: imzalı olsa bile daha uzak bitiş tarihi kabul edilmez
  if (uid === '-1') return env.TENANT_SLUG && Number(exp) <= Date.now() + 2 * 3600e3 + 60e3 && same(sig, await hmac(secret(env), `-1.${exp}.support`)) ? { ...SUPPORT, name: 'Destek (ana panel)' } : null;
  if (uid === '0') {
    if (!password(env)) return null;
    return same(sig, await hmac(secret(env), `0.${exp}.0`)) ? ADMIN : null;
  }
  const u = await first(db, 'SELECT id, username, name, email, role, active, pass, perms, sess FROM users WHERE id = ?', Number(uid));
  if (!u || !u.active) return null;
  if (!same(sig, await hmac(secret(env), `${uid}.${exp}.${ver(u)}`))) return null;
  return { id: u.id, username: u.username, name: u.name || u.username, email: u.email, role: u.role, perms: u.role === 'admin' ? null : permsOf(u.perms) };
}

export async function login(req, env, db, { username, password: pass }) {
  const users = await first(db, 'SELECT COUNT(*) AS n FROM users WHERE active = 1');
  if (!password(env) && !users.n) return { ok: false, status: 503, error: 'Panel şifresi tanımlı değil (Cloudflare → Settings → Variables and Secrets → PANEL_PASSWORD)' };
  // Kaba kuvvet koruması: kullanıcı adı + IP başına 15 dakikada 8 deneme. Sayaç denemeden ÖNCE artırılır (eşzamanlı
  // istekler sınırı aşamaz); başarılı girişte yalnız o sayaç silinir. Herkesi kilitleyen tek bir genel sayaç yoktur.
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '';
  const fk = `login_fail:${String(username || 'yonetici').trim().toLocaleLowerCase('tr').slice(0, 60)}|${ip.split(',')[0].trim()}`;
  const now = Date.now();
  const row = await first(db, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`,
    fk, now, now - 15 * 60e3, now);
  if (Math.random() < 0.05) await run(db, "DELETE FROM settings WHERE k LIKE 'login_fail:%' AND json_extract(v, '$.at') < ?", now - 864e5);
  if (((row && JSON.parse(row.v)) || {}).n > 8) return { ok: false, status: 429, error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.' };
  let user = null, sv = '0';
  if (!env.TENANT_SLUG && isAdminName(username) && password(env)) {
    const a = await hmac('cmp', String(pass || '')), b = await hmac('cmp', password(env));
    if (same(a, b)) user = ADMIN;
  }
  // Müşteri panelinde ana yönetici (PANEL_PASSWORD) yoktur: "admin" gibi adlar da normal kullanıcıdır
  if (!user && username && (env.TENANT_SLUG || !isAdminName(username))) {
    const u = await first(db, 'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND active = 1', String(username).trim());
    // Kullanıcı yoksa da aynı süre harcanır (yanıt süresinden hangi kullanıcı adının var olduğu anlaşılmasın)
    if (!u) await pbkdf2(String(pass || ''), new Uint8Array(16), ITER);
    if (u && await checkPassword(String(pass || ''), u.pass)) {
      user = { id: u.id, username: u.username, name: u.name || u.username, role: u.role, perms: u.role === 'admin' ? null : permsOf(u.perms) };
      sv = ver(u);
      await run(db, 'UPDATE users SET last_login = ?, last_ip = ? WHERE id = ?', Date.now(), ip.split(',')[0].trim().slice(0, 64) || null, u.id);
    }
  }
  if (!user) return { ok: false, status: 401, error: 'Kullanıcı adı veya şifre hatalı' };
  await run(db, 'DELETE FROM settings WHERE k = ?', fk);
  const exp = String(Date.now() + DAYS * 864e5);
  const value = encodeURIComponent(`${pre(env)}${user.id}.${exp}.${await hmac(secret(env), `${user.id}.${exp}.${sv}`)}`);
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return { ok: true, user, cookie: `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure}` };
}
export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

// ---------- kullanıcı yönetimi ----------
export const listUsers = async (db) => (await all(db, `SELECT id, username, name, email, phone, title, note, role, active, created_at, last_login, last_ip, perms, template
  FROM users ORDER BY active DESC, name COLLATE NOCASE`)).map((u) => ({ ...u, perms: permsOf(u.perms) }));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
export async function saveUser(db, id, b, { maxUsers = 0 } = {}) {
  const username = String(b.username || '').trim(), name = String(b.name || '').trim();
  const role = b.role === 'admin' ? 'admin' : 'staff';
  // Personel yetkileri: seçilen bölümler (dizi; "bolum" ya da "bolum:view"); gönderilmezse değişmez
  const perms = Array.isArray(b.perms) ? JSON.stringify([...new Set(b.perms.filter((k) => PERM_VALUES.includes(k)))]) : undefined;
  const email = clip(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-posta adresi geçersiz');
  const extra = [clip(b.phone, 40), clip(b.title, 80), clip(b.note, 500), clip(b.template, 20) || null];
  if (!id && !/^[\p{L}0-9._-]{3,40}$/u.test(username)) throw new Error('Kullanıcı adı 3-40 karakter olmalı (harf, rakam, . _ -)');
  if (!id && isAdminName(username) && !b.tenant) throw new Error('Bu kullanıcı adı ana yöneticiye ayrılmış');
  if (b.password && String(b.password).length < 8) throw new Error('Şifre en az 8 karakter olmalı');
  if (!id) {
    if (!b.password) throw new Error('Şifre gerekli');
    const dup = await first(db, 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)', username);
    if (dup) throw new Error('Bu kullanıcı adı kullanılıyor');
    // Firma paketindeki kullanıcı sınırı (müşteri panellerinde; aktif kullanıcılar sayılır)
    if (maxUsers && (await first(db, 'SELECT COUNT(*) AS n FROM users WHERE active = 1')).n >= maxUsers) throw new Error(`Paketinizdeki kullanıcı sınırına ulaşıldı (${maxUsers}). Bir kullanıcıyı pasifleştirin ya da paketinizi yükseltin.`);
    const r = await first(db, 'INSERT INTO users (username, name, email, pass, role, active, created_at, perms, phone, title, note, template) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?) RETURNING id',
      username, name || username, email, await hashPassword(String(b.password)), role, Date.now(), perms ?? null, ...extra);
    return r && r.id;
  }
  const cur = await first(db, 'SELECT username, active FROM users WHERE id = ?', id);
  if (!cur) throw new Error('Kullanıcı bulunamadı');
  const active = b.active === false ? 0 : 1;
  if (maxUsers && active && !cur.active && (await first(db, 'SELECT COUNT(*) AS n FROM users WHERE active = 1')).n >= maxUsers) throw new Error(`Paketinizdeki kullanıcı sınırına ulaşıldı (${maxUsers})`);
  await run(db, 'UPDATE users SET name = ?, email = ?, role = ?, active = ?, phone = ?, title = ?, note = ?, template = ? WHERE id = ?', name || cur.username, email, role, active, ...extra, id);
  if (perms !== undefined) await run(db, 'UPDATE users SET perms = ? WHERE id = ?', perms, id);
  if (b.password) await run(db, 'UPDATE users SET pass = ? WHERE id = ?', await hashPassword(String(b.password)), id);
  return id;
}
// Kullanıcının tüm cihazlardaki oturumlarını kapat (şifre değişmeden)
export const revokeSessions = (db, id) => run(db, 'UPDATE users SET sess = COALESCE(sess, 0) + 1 WHERE id = ?', id);
export async function deleteUser(db, id, me) {
  if (me && me.id === id) throw new Error('Kendi hesabınızı silemezsiniz');
  const u = await first(db, 'SELECT id, role FROM users WHERE id = ?', id);
  if (!u) throw new Error('Kullanıcı bulunamadı');
  // Son yönetici silinemez (müşteri panelinde ana yönetici şifresi yok; panel yöneticisiz kalmasın)
  if (u.role === 'admin' && (await first(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?", id)).n === 0) throw new Error('Son yönetici silinemez');
  await run(db, 'DELETE FROM push_subs WHERE user_id = ?', id);
  await run(db, 'DELETE FROM users WHERE id = ?', id);
}
// Kullanıcının panelde yaptığı son işlemler (sipariş işlemleri ve işlem günlüğü)
export async function userActivity(db, id) {
  const u = await first(db, 'SELECT name, username FROM users WHERE id = ?', id);
  if (!u) throw new Error('Kullanıcı bulunamadı');
  const nm = u.name || u.username;
  const [orders, logs] = await Promise.all([
    all(db, `SELECT e.at, e.action, e.note, o.order_number, o.channel, o.id AS order_id FROM order_events e LEFT JOIN orders o ON o.id = e.order_id
      WHERE e.source = 'panel' AND e.user = ? ORDER BY e.at DESC LIMIT 40`, nm),
    all(db, "SELECT at, level, msg FROM logs WHERE msg LIKE ? ORDER BY at DESC LIMIT 30", nm.replace(/[%_]/g, '') + ':%'),
  ]);
  const since = Date.now() - 30 * 864e5;
  return { orders, logs, count30: orders.filter((x) => x.at >= since).length };
}
export async function changeOwnPassword(db, user, oldPw, newPw) {
  if (user.id === -1) throw new Error('Destek oturumunda şifre değiştirilemez');
  if (!user.id) throw new Error('Ana yönetici şifresi Cloudflare\'deki PANEL_PASSWORD ile değiştirilir');
  const u = await first(db, 'SELECT pass FROM users WHERE id = ?', user.id);
  if (!u || !(await checkPassword(String(oldPw || ''), u.pass))) throw new Error('Mevcut şifre hatalı');
  if (String(newPw || '').length < 8) throw new Error('Yeni şifre en az 8 karakter olmalı');
  await run(db, 'UPDATE users SET pass = ? WHERE id = ?', await hashPassword(String(newPw)), user.id);
}
