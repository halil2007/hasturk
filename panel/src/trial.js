// Kendi kendine 7 günlük deneme (tanıtım sitesi → /demo → "Kendi mağazanızla deneyin"): form doldurulunca firma paneli hemen
// açılır ve kişi tek kullanımlık, 30 dakika geçerli imzalı bağlantıyla doğrudan paneline girer (bizim onayımızı beklemez).
// Deneme panelinde paket sınırı yoktur (tüm özellikler); 7 gün sonra panel kapanır, veriler silinmez, satın alınca devam eder.
// Kötüye kullanıma karşı: bot doğrulaması (Turnstile), bot tuzağı, IP başına günde 3 deneme hesabı, aynı e-posta / telefonla tek panel.
import { first, run, init, notify } from './db.js';
import { createTenant, getTenant, ownerCookie, SLUG_RE } from './tenants.js';
import { siteOrigins, validEmail, validPhone, phoneDigits } from './lead.js';
import { turnstileOk, siteHosts, CAPTCHA_ERROR } from './turnstile.js';
import { notify as pushNotify } from './push.js';
import { json, str, HttpError } from './util.js';

const TRIAL_DAYS = 7, LINK_MS = 30 * 60e3;
const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
const TR = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
// Firma adından firma kodu: "Yeşil Bahçe Tarım Ltd." → yesil-bahce-tarim
export const slugOf = (s) => str(s).replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR[c]).toLowerCase()
  .replace(/\b(ltd|sti|şti|a\.?s|as|san|tic|ve)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '');

const enc = new TextEncoder();
const key = (env) => crypto.subtle.importKey('raw', enc.encode(`${env.PANEL_SECRET || env.PANEL_PASSWORD}|trial`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(env, slug, exp) { return b64u(await crypto.subtle.sign('HMAC', await key(env), enc.encode(`${slug}.${exp}`))); }
export async function loginLink(env, origin, slug) {
  const exp = Date.now() + LINK_MS;
  return `${origin}/api/public/trial-login?t=${encodeURIComponent(`${slug}.${exp}.${await sign(env, slug, exp)}`)}`;
}

export async function trialRequest(req, env) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
  const allowed = siteOrigins(env).includes(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? cors(origin) : {} });
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405);
  if (!allowed) return json({ error: 'İzin verilmeyen kaynak' }, 403);
  const h = cors(origin), db = env.DB;
  if (!db || !env.TENANT || !(env.PANEL_SECRET || env.PANEL_PASSWORD)) return json({ error: 'Deneme hesabı şu an otomatik açılamıyor; lütfen bizi arayın.' }, 503, h);
  let b = {};
  try { b = JSON.parse(await req.text()); } catch { return json({ error: 'Geçersiz istek' }, 400, h); }
  if (str(b.website)) return json({ ok: true }, 200, h); // bot tuzağı
  if (!(await turnstileOk(env, req, b.cf, 'trial', fetch, siteHosts(siteOrigins(env))))) return json(CAPTCHA_ERROR, 400, h);
  const company = str(b.company).slice(0, 120), name = str(b.name).slice(0, 100), email = str(b.email).toLowerCase().slice(0, 120), phone = str(b.phone).slice(0, 40);
  const username = str(b.username).slice(0, 40), password = String(b.password || '');
  const bad = (m) => json({ error: m }, 400, h);
  if (company.length < 2) return bad('Firma / mağaza adını yazın');
  if (name.length < 2) return bad('Adınızı ve soyadınızı yazın');
  if (!validEmail(email)) return bad('Geçerli bir e-posta adresi yazın');
  if (!validPhone(phone)) return bad('Geçerli bir telefon numarası yazın (ör. 0532 123 45 67)');
  if (!/^[\p{L}0-9._-]{3,40}$/u.test(username)) return bad('Kullanıcı adı 3-40 karakter olmalı (harf, rakam, . _ -)');
  if (password.length < 8) return bad('Şifre en az 8 karakter olmalı');
  if (!b.consent) return bad('Kullanım koşullarını ve KVKK aydınlatma metnini onaylayın');
  await init(db);
  // IP başına günde 3 deneme hesabı
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now();
  const rate = await first(db, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, `trial_rate:${ip}`, now, now - 864e5, now);
  if ((JSON.parse(rate.v).n || 0) > 3) return json({ error: 'Bugün bu bağlantıdan çok fazla deneme hesabı açıldı; lütfen bizi arayın.' }, 429, h);
  // Aynı e-posta ya da telefonla tek panel
  const digits = phoneDigits(phone);
  const dup = await first(db, `SELECT slug FROM tenants WHERE LOWER(email) = ? OR (phone IS NOT NULL AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?) LIMIT 1`, email, '%' + digits);
  if (dup) return json({ error: 'Bu e-posta ya da telefonla daha önce bir panel açılmış. Giriş ekranından firma kodunuzla girin ya da “Şifremi unuttum”u kullanın.', exists: true }, 409, h);
  // Firma kodu: firma adından, doluysa sonuna sayı
  let base = slugOf(company);
  if (base.length < 3) base = 'firma';
  let slug = base;
  for (let i = 2; i < 200 && (!SLUG_RE.test(slug) || slug === 'demo' || await getTenant(db, slug, true)); i++) slug = `${base}-${i}`.slice(0, 32);
  if (!SLUG_RE.test(slug) || await getTenant(db, slug, true)) slug = `firma-${now.toString(36).slice(-6)}`;
  const panel = new URL(req.url).origin;
  try {
    await createTenant(env, db, { slug, name: company, admin_username: username, admin_password: password, email, phone, contact: name, trial: 1, expires_at: '' }, { origin: panel });
  } catch (e) { return json({ error: e.message || 'Panel açılamadı' }, e instanceof HttpError ? e.status : 500, h); }
  await run(db, 'UPDATE tenants SET note = ? WHERE slug = ?', `Web sitesinden kendi kendine açılan ${TRIAL_DAYS} günlük deneme · ${name} · ${new Date(now).toISOString().slice(0, 10)}`, slug);
  const msg = `${company} · ${name} · ${phone} · ${email} · firma kodu: ${slug}`;
  await notify(db, `trial:${slug}`, { level: 'info', title: `Yeni deneme paneli: ${company}`, msg }).catch(() => {});
  await pushNotify(db, { title: 'Yeni deneme paneli', body: msg.slice(0, 140), url: '#/firmalar' }).catch(() => {});
  return json({ ok: true, slug, username, days: TRIAL_DAYS, url: await loginLink(env, panel, slug) }, 200, h);
}

const page = (title, body, extra = {}) => new Response(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${extra.refresh ? '<meta http-equiv="refresh" content="0;url=/">' : ''}<title>${title}</title>
<body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#0d1b34;background:#f5f8fe"><div style="max-width:440px;padding:24px;text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#4a5872">${body}</p></div></body></html>`,
  { status: extra.status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...(extra.cookie ? { 'Set-Cookie': extra.cookie } : {}) } });

// Tek kullanımlık giriş bağlantısı: imza ve süre denetlenir, firma yöneticisi oturumu açılır, panele geçilir
export async function trialLogin(req, env) {
  const url = new URL(req.url), t = str(url.searchParams.get('t'));
  const m = /^([a-z0-9-]{3,32})\.(\d{13})\.([A-Za-z0-9_-]{20,})$/.exec(t);
  const fail = (body, status = 400) => page('Giriş bağlantısı geçersiz', `${body} <a href="/">Giriş ekranı</a>`, { status });
  if (!m || !env.DB || !(env.PANEL_SECRET || env.PANEL_PASSWORD)) return fail('Bağlantı eksik ya da bozuk.');
  const [, slug, exp, sig] = m;
  if (Number(exp) < Date.now()) return fail('Bağlantının süresi doldu. Giriş ekranından firma kodunuz, kullanıcı adınız ve şifrenizle girin.');
  if (sig !== await sign(env, slug, exp)) return fail('Bağlantı doğrulanamadı.');
  await init(env.DB);
  // Tek kullanımlık
  const used = await first(env.DB, "INSERT INTO settings (k, v) VALUES (?, '1') ON CONFLICT (k) DO NOTHING RETURNING k", `trial_link:${slug}.${exp}`);
  if (!used) return fail('Bu bağlantı daha önce kullanıldı. Giriş ekranından firma kodunuz, kullanıcı adınız ve şifrenizle girin.');
  const tn = await getTenant(env.DB, slug, true);
  if (!tn || !tn.active) return fail('Panel bulunamadı.', 404);
  const cookie = await ownerCookie(env, tn, url.protocol === 'https:').catch(() => null);
  if (!cookie) return fail('Oturum açılamadı; giriş ekranından girin.', 500);
  return page('Paneliniz açılıyor…', 'Deneme panelinize yönlendiriliyorsunuz. <a href="/">Açılmazsa tıklayın</a>.', { refresh: true, cookie });
}
