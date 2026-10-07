// Acil uyarı: kanal saatlerce sipariş vermiyorsa ya da stok gönderilemiyorsa yalnız panel içi bildirim yetmez (kimse paneli
// açmayabilir). Telefona / tarayıcıya anlık bildirim ve (Ayarlar → Bildirimler'de alıcı varsa) e-posta gider.
// Aynı sorun için en fazla 6 saatte bir uyarı; sorun düzelince tek bir "düzeldi" bildirimi.
import { getRaw, setSetting, run, getSettings, log } from './db.js';
import { notify as push } from './push.js';
import { sendMail } from './mail.js';

const EVERY = 6 * 3600e3;
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function urgentAlert(env, db, key, { title, body, url = '#/bildirimler' }) {
  if (env.DEMO === '1') return null;
  const k = 'alert:' + key, last = await getRaw(db, k), t = Date.now();
  if (last && t - last.at < EVERY) return null;
  await setSetting(db, k, { at: t, title });
  const out = {};
  out.push = await push(db, { title: '⚠️ ' + title, body, url }).catch((e) => 'hata: ' + e.message);
  const settings = await getSettings(db);
  const to = settings.mail_to || [];
  if (to.length) {
    const company = (settings.company && settings.company.title) || 'Hastürk Panel', link = settings.panel_url ? `${settings.panel_url.replace(/\/+$/, '')}/${url}` : '';
    out.mail = await sendMail(env, db, {
      to, subject: `⚠️ ${title}`,
      text: `${body}\n\n${link ? 'Panel: ' + link : ''}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111"><h2 style="font-size:18px;margin:0 0 10px">${esc(title)}</h2><p style="margin:0 0 14px">${esc(body)}</p>${link ? `<p><a href="${esc(link)}">Panelde görüntüle</a></p>` : ''}<p style="color:#667;font-size:12px">${esc(company)} · otomatik uyarı (aynı sorun için en fazla 6 saatte bir gönderilir)</p></div>`,
    }).then(() => to.length).catch((e) => 'hata: ' + e.message);
  }
  await log(db, null, 'warn', `Acil uyarı gönderildi: ${title}`);
  return out;
}
// Sorun düzeldi: daha önce uyarı gittiyse tek bir bilgi bildirimi
export async function alertResolved(env, db, key, { title, body = '', url = '#/' }) {
  const k = 'alert:' + key;
  if (!(await getRaw(db, k))) return null;
  await run(db, 'DELETE FROM settings WHERE k = ?', k);
  if (env.DEMO === '1') return null;
  return push(db, { title: '✅ ' + title, body, url }).catch(() => null);
}
