// Tanıtım sitesinden demo / teklif talebi: oturumsuz, yalnız izin verilen site adreslerinden (SITE_ORIGINS) kabul edilir.
// Talep ana panelin Destek sayfasına "Web sitesi" firmasıyla düşer ve ana panele bildirim gider. IP başına saatte 5 talep;
// gizli "website" alanı (bot tuzağı) doluysa sessizce yok sayılır.
import { first, run, init, notify } from './db.js';
import { notify as pushNotify } from './push.js';
import { json, str } from './util.js';

const DEFAULT_ORIGINS = 'https://hasturkcrm.com,https://www.hasturkcrm.com';
export const siteOrigins = (env) => String(env.SITE_ORIGINS || DEFAULT_ORIGINS).split(',').map((x) => x.trim().replace(/\/+$/, '')).filter(Boolean);
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
  if (!phone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Telefon ya da geçerli bir e-posta yazın' }, 400, h);
  if (!b.consent) return json({ error: 'Aydınlatma metnini onaylayın' }, 400, h);
  await init(db);
  // IP başına saatte 5 talep
  const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 64), now = Date.now(), k = `lead_rate:${ip}`;
  const row = await first(db, `INSERT INTO settings (k, v) VALUES (?, json_object('n', 1, 'at', ?)) ON CONFLICT (k) DO UPDATE SET
      v = CASE WHEN json_extract(settings.v, '$.at') < ? THEN json_object('n', 1, 'at', ?) ELSE json_set(settings.v, '$.n', json_extract(settings.v, '$.n') + 1) END RETURNING v`, k, now, now - 3600e3, now);
  if ((JSON.parse(row.v).n || 0) > 5) return json({ error: 'Çok fazla talep gönderildi; lütfen daha sonra tekrar deneyin ya da telefonla ulaşın' }, 429, h);
  const subject = `Demo talebi: ${company || name}`.slice(0, 140);
  const body = [`Ad soyad: ${name}`, company && `Firma: ${company}`, phone && `Telefon: ${phone}`, email && `E-posta: ${email}`, channels.length && `Satış kanalları: ${channels.join(', ')}`, message && `\nMesaj:\n${message}`, `\nKVKK aydınlatma metni onaylandı · ${new Date(now).toISOString()}`].filter(Boolean).join('\n');
  const t = await first(db, `INSERT INTO support_tickets (slug, firm, user_name, subject, category, status, page, context, created_at, updated_at, unread_admin, unread_user)
    VALUES ('', 'Web sitesi', ?, ?, 'request', 'open', 'web-sitesi', ?, ?, ?, 1, 0) RETURNING id`, name, subject, JSON.stringify({ ip, origin, browser: (req.headers.get('User-Agent') || '').slice(0, 200) }), now, now);
  await run(db, 'INSERT INTO support_messages (ticket_id, author, admin, body, created_at) VALUES (?, ?, 0, ?, ?)', t.id, name, body, now);
  await notify(db, `support:${t.id}`, { level: 'warn', title: `Web sitesi: ${subject}`, msg: body.slice(0, 300) }).catch(() => {});
  await pushNotify(db, { title: 'Yeni demo talebi', body: subject, url: `#/destek/${t.id}` }).catch(() => {});
  return json({ ok: true }, 200, h);
}
