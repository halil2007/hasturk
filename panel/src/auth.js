// Panel girişi ve kullanıcılar.
//  - Ana yönetici: kullanıcı adı "yonetici" (ya da boş) + Cloudflare'deki PANEL_PASSWORD.
//  - Diğer kullanıcılar panelden eklenir (Kullanıcılar); şifreler PBKDF2-SHA256 ile özetlenip saklanır.
//  - Oturum imzalı, HttpOnly bir çerezde tutulur; şifre değişince eski oturumlar geçersiz olur.
import { all, first, run, getRaw, setSetting } from './db.js';

const COOKIE = 'hp_session';
const DAYS = 30;
const ITER = 20000;
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

// Çerezden oturumdaki kullanıcıyı bul (yoksa null)
export async function currentUser(req, env, db) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [uid, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!sig || Number(exp) < Date.now()) return null;
  if (uid === '0') {
    if (!password(env)) return null;
    return same(sig, await hmac(secret(env), `0.${exp}.0`)) ? ADMIN : null;
  }
  const u = await first(db, 'SELECT id, username, name, email, role, active, pass FROM users WHERE id = ?', Number(uid));
  if (!u || !u.active) return null;
  if (!same(sig, await hmac(secret(env), `${uid}.${exp}.${u.pass.slice(-12)}`))) return null;
  return { id: u.id, username: u.username, name: u.name || u.username, email: u.email, role: u.role };
}

export async function login(req, env, db, { username, password: pass }) {
  const users = await first(db, 'SELECT COUNT(*) AS n FROM users WHERE active = 1');
  if (!password(env) && !users.n) return { ok: false, status: 503, error: 'Panel şifresi tanımlı değil (Cloudflare → Settings → Variables and Secrets → PANEL_PASSWORD)' };
  // Kaba kuvvet koruması: 15 dakikada 8 yanlış denemeden sonra bekletir
  const f = (await getRaw(db, 'login_fail')) || { n: 0, at: 0 };
  if (f.n >= 8 && Date.now() - f.at < 15 * 60e3) return { ok: false, status: 429, error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.' };
  let user = null, ver = '0';
  if (isAdminName(username) && password(env)) {
    const a = await hmac('cmp', String(pass || '')), b = await hmac('cmp', password(env));
    if (same(a, b)) user = ADMIN;
  }
  if (!user && !isAdminName(username)) {
    const u = await first(db, 'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND active = 1', String(username).trim());
    if (u && await checkPassword(String(pass || ''), u.pass)) {
      user = { id: u.id, username: u.username, name: u.name || u.username, role: u.role };
      ver = u.pass.slice(-12);
      await run(db, 'UPDATE users SET last_login = ? WHERE id = ?', Date.now(), u.id);
    }
  }
  if (!user) {
    await setSetting(db, 'login_fail', { n: Date.now() - f.at < 15 * 60e3 ? f.n + 1 : 1, at: Date.now() });
    return { ok: false, status: 401, error: 'Kullanıcı adı veya şifre hatalı' };
  }
  await setSetting(db, 'login_fail', { n: 0, at: 0 });
  const exp = String(Date.now() + DAYS * 864e5);
  const value = encodeURIComponent(`${user.id}.${exp}.${await hmac(secret(env), `${user.id}.${exp}.${ver}`)}`);
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return { ok: true, user, cookie: `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure}` };
}
export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

// ---------- kullanıcı yönetimi ----------
export const listUsers = (db) => all(db, 'SELECT id, username, name, email, role, active, created_at, last_login FROM users ORDER BY name COLLATE NOCASE');
export async function saveUser(db, id, b) {
  const username = String(b.username || '').trim(), name = String(b.name || '').trim();
  const role = b.role === 'admin' ? 'admin' : 'staff';
  if (!id && !/^[\p{L}0-9._-]{3,40}$/u.test(username)) throw new Error('Kullanıcı adı 3-40 karakter olmalı (harf, rakam, . _ -)');
  if (!id && isAdminName(username)) throw new Error('Bu kullanıcı adı ana yöneticiye ayrılmış');
  if (b.password && String(b.password).length < 8) throw new Error('Şifre en az 8 karakter olmalı');
  if (!id) {
    if (!b.password) throw new Error('Şifre gerekli');
    const dup = await first(db, 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)', username);
    if (dup) throw new Error('Bu kullanıcı adı kullanılıyor');
    await run(db, 'INSERT INTO users (username, name, email, pass, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)', username, name || username, String(b.email || ''), await hashPassword(String(b.password)), role, Date.now());
    return;
  }
  const cur = await first(db, 'SELECT username FROM users WHERE id = ?', id);
  if (!cur) throw new Error('Kullanıcı bulunamadı');
  await run(db, 'UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?', name || cur.username, String(b.email || ''), role, b.active === false ? 0 : 1, id);
  if (b.password) await run(db, 'UPDATE users SET pass = ? WHERE id = ?', await hashPassword(String(b.password)), id);
}
export async function changeOwnPassword(db, user, oldPw, newPw) {
  if (!user.id) throw new Error('Ana yönetici şifresi Cloudflare\'deki PANEL_PASSWORD ile değiştirilir');
  const u = await first(db, 'SELECT pass FROM users WHERE id = ?', user.id);
  if (!u || !(await checkPassword(String(oldPw || ''), u.pass))) throw new Error('Mevcut şifre hatalı');
  if (String(newPw || '').length < 8) throw new Error('Yeni şifre en az 8 karakter olmalı');
  await run(db, 'UPDATE users SET pass = ? WHERE id = ?', await hashPassword(String(newPw)), user.id);
}
