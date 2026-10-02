// Panel girişi: tek şifre (Cloudflare gizli değişkeni PANEL_PASSWORD). Oturum, imzalı ve HttpOnly bir çerezde tutulur.
import { getRaw, setSetting } from './db.js';

const COOKIE = 'hp_session';
const DAYS = 30;
const enc = new TextEncoder();

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
export const password = (env) => env.PANEL_PASSWORD || (env.DEMO === '1' ? 'demo' : '');
const secret = (env) => (env.PANEL_SECRET || '') + '|' + password(env);

export async function isAuthed(req, env) {
  if (!password(env)) return false;
  const m = (req.headers.get('Cookie') || '').match(new RegExp(COOKIE + '=([^;]+)'));
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, await hmac(secret(env), exp));
}

export async function login(req, env, db, pass) {
  const pw = password(env);
  if (!pw) return { ok: false, status: 503, error: 'Panel şifresi tanımlı değil (Cloudflare → Settings → Variables and Secrets → PANEL_PASSWORD)' };
  // Kaba kuvvet koruması: 15 dakikada 8 yanlış denemeden sonra bekletir
  const f = (await getRaw(db, 'login_fail')) || { n: 0, at: 0 };
  if (f.n >= 8 && Date.now() - f.at < 15 * 60e3) return { ok: false, status: 429, error: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.' };
  const a = await hmac('cmp', String(pass || '')), b = await hmac('cmp', pw);
  if (!same(a, b)) {
    await setSetting(db, 'login_fail', { n: Date.now() - f.at < 15 * 60e3 ? f.n + 1 : 1, at: Date.now() });
    return { ok: false, status: 401, error: 'Şifre hatalı' };
  }
  await setSetting(db, 'login_fail', { n: 0, at: 0 });
  const exp = String(Date.now() + DAYS * 864e5);
  const value = encodeURIComponent(`${exp}.${await hmac(secret(env), exp)}`);
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return { ok: true, cookie: `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure}` };
}
export const logoutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
