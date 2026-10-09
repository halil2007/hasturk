// Tanıtım sitesinden demo / teklif talebi: oturumsuz, yalnız izin verilen site adreslerinden (SITE_ORIGINS) kabul edilir.
// Talep ana panelin Destek sayfasına "Web sitesi" firmasıyla düşer ve ana panele bildirim gider. IP başına saatte 5 talep;
// gizli "website" alanı (bot tuzağı) doluysa sessizce yok sayılır. Ad, e-posta ve telefon zorunludur. Yanıtta demo paneline giriş bağlantısı döner.
import { first, run, init, notify } from './db.js';
import { demoLogin } from './tenants.js';
import { notify as pushNotify } from './push.js';
import { json, str } from './util.js';

const DEFAULT_ORIGINS = 'https://hasturkcrm.com,https://www.hasturkcrm.com';
export const siteOrigins = (env) => String(env.SITE_ORIGINS || DEFAULT_ORIGINS).split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
// İletişim bilgisi doğrulaması (site formları ve online satış): e-posta biçimi; Türkiye telefonu (cep 5xx, sabit 2xx-4xx, 850)
export const validEmail = (s) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(String(s || '').trim());
export function phoneDigits(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2); else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const validPhone = (s) => /^[2-58]\d{9}$/.test(phoneDigits(s)) && !/[^\d\s()+-]/.test(String(s || '').trim());
const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });

export async function leadRequest(req, env) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
  const allowed = siteOrigins(env).includes(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? cors(origin) : {} });
  if (req.method !== 'POST') return json({ error: 'Yalnız POST' }, 405);
  if (!allowed) return json({ error: 'İzin verilmeyen kaynak' }, 403);
  const h = cors(origin), db = env.DB;
  if (!db) return json({ error: 'Şu an alınamıyor' }, 503, h);
  let b = {};
  try { b = JSON.parse(await req.text()); } catch { return json({ error: 'Geçersiz istek' }, 400, h); }
  if (str(b.website)) return json({ ok: true }, 200, h); // bot tuzağı
  const name = str(b.name).trim().slice(0, 100), company = str(b.company).trim().slice(0, 120), phone = str(b.phone).trim().slice(0, 40), email = str(b.email).trim().slice(0, 120);
  const channels = (Array.isArray(b.channels) ? b.channels : []).map((x) => str(x).slice(0, 30)).slice(0, 20), message = str(b.message).trim().slice(0, 2000);
  if (name.length < 2) return json({ error: 'Adınızı yazın' }, 400, h);
  if (!validEmail(email)) return json({ error: 'Geçerli bir e-posta adresi yazın' }, 400, h);
  if (!validPhone(phone)) return json({ error: 'Geçerli bir telefon numarası yazın (ör. 0532 123 45 67 ya da 0212 123 45 67)' }, 400, h);
  if (!b.consent) return json({ error: 'Aydınlatma metnini onaylayın' }, 400, h);
  await init(db);
  // IP başına saatte 5 talep
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now(), k = `lead_rate:${ip}`;
  const row = await first(db, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, k, now, now - 3600e3, now);
  if ((JSON.parse(row.v).n || 0) > 5) return json({ error: 'Çok fazla talep gönderildi; lütfen daha sonra tekrar deneyin ya da telefonla ulaşın' }, 429, h);
  // Konu: demo (varsayılan), teklif (paketler sayfası), iletişim (genel soru)
  const topic = { teklif: 'Teklif talebi', iletisim: 'İletişim' }[str(b.topic)] || 'Demo talebi', plan = str(b.plan).trim().slice(0, 60);
  const subject = `${topic}: ${company || name}`.slice(0, 140);
  const body = [`Ad soyad: ${name}`, company && `Firma: ${company}`, phone && `Telefon: ${phone}`, email && `E-posta: ${email}`, channels.length && `Satış kanalları: ${channels.join(', ')}`, plan && `İlgilendiği paket: ${plan}`, message && `\nMesaj:\n${message}`, `\nKVKK aydınlatma metni onaylandı · ${new Date(now).toISOString()}`].filter(Boolean).join('\n');
  const t = await first(db, `INSERT INTO support_tickets (slug, firm, user_name, subject, category, status, page, context, created_at, updated_at, unread_admin, unread_user)
    VALUES ('', 'Web sitesi', ?, ?, 'request', 'open', 'web-sitesi', ?, ?, ?, 1, 0) RETURNING id`, name, subject, JSON.stringify({ ip, origin, browser: (req.headers.get('User-Agent') || '').slice(0, 200) }), now, now);
  await run(db, 'INSERT INTO support_messages (ticket_id, author, admin, body, created_at) VALUES (?, ?, 0, ?, ?)', t.id, name, body, now);
  await notify(db, `support:${t.id}`, { level: 'warn', title: `Web sitesi: ${subject}`, msg: body.slice(0, 300) }).catch(() => {});
  await pushNotify(db, { title: 'Yeni demo talebi', body: subject, url: `#/destek/${t.id}` }).catch(() => {});
  return json({ ok: true, demo: await demoUrl(req, env) }, 200, h);
}

// Demo paneli bağlantısı (müşteri panelleri kuruluysa: Durable Object bağlantısı ve gizli anahtar)
export async function demoUrl(req, env) {
  if (!env.TENANT || !(env.PANEL_SECRET || env.PANEL_PASSWORD)) return null;
  return `${new URL(req.url).origin}/api/public/demo`;
}
const page = (title, body, extra = {}) => new Response(`<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${extra.refresh ? '<meta http-equiv="refresh" content="0;url=/">' : ''}<title>${title}</title>
<body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#0d1b34;background:#f5f8fe"><div style="max-width:440px;padding:24px;text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#4a5872">${body}</p></div></body></html>`,
  { status: extra.status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...(extra.cookie ? { 'Set-Cookie': extra.cookie } : {}) } });
// Demo paneline giriş (kayıt / bilgi istemez; sitedeki "Canlı demo" düğmesi buraya gelir): demo personel oturumu açılır ve
// panele geçilir (aynı adresten yönlendirme, böylece SameSite=Strict çerez ilk açılışta da gönderilir). IP başına saatte 30 giriş.
export async function demoRequest(req, env) {
  const url = new URL(req.url);
  if (req.method !== 'GET') return json({ error: 'Yalnız GET' }, 405);
  if (!env.DB || !env.TENANT || !(env.PANEL_SECRET || env.PANEL_PASSWORD)) return page('Demo paneli açılamadı', 'Demo şu an kullanılamıyor. Lütfen bizimle iletişime geçin.', { status: 503 });
  await init(env.DB);
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now();
  const row = await first(env.DB, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, `demo_rate:${ip}`, now, now - 3600e3, now);
  if ((JSON.parse(row.v).n || 0) > 30) return page('Biraz bekleyin', 'Kısa sürede çok fazla demo girişi yapıldı. Lütfen bir saat sonra tekrar deneyin.', { status: 429 });
  let cookie;
  try { cookie = await demoLogin(env, url.protocol === 'https:'); } catch (e) { return page('Demo paneli açılamadı', String(e.message || 'Lütfen biraz sonra tekrar deneyin.').replace(/[<>]/g, ''), { status: e.status || 500 }); }
  return page('Demo paneli açılıyor…', 'Örnek verilerle çalışan panele yönlendiriliyorsunuz. <a href="/">Açılmazsa tıklayın</a>.', { refresh: true, cookie });
}
