// Panel sahibine (Hastürk) bilgilendirme e-postası: yeni üyelik / ödeme, yeni destek talebi vb.
// Alıcı: ana panel Ayarlar → Firma e-postası; yoksa Kullanıcılar → Ana yönetici e-postası (security.adminEmail).
// E-posta servisi ana panelin Ayarlar → Bildirimler'indeki servistir. Gönderilemezse iş durmaz; olay günlüğe yazılır.
import { getSettings, getRaw, log } from './db.js';
import { sendMail, validEmail } from './mail.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export async function ownerAddress(db) {
  const s = await getSettings(db).catch(() => ({}));
  const company = String((s.company && s.company.email) || '').trim();
  if (validEmail(company)) return company;
  const sec = (await getRaw(db, 'security').catch(() => null)) || {};
  return validEmail(sec.adminEmail) ? String(sec.adminEmail).trim() : '';
}

// rows: [[etiket, değer], ...] tablo olarak; link: panelde ilgili sayfa (isteğe bağlı)
export async function mailOwner(env, db, { subject, intro = '', rows = [], link = '', button = 'Panelde aç' }) {
  try {
    const to = await ownerAddress(db);
    if (!to) return { skipped: 'alıcı yok' };
    const list = rows.filter((r) => r && r[1] != null && String(r[1]).trim() !== '');
    const text = [intro, ...list.map(([k, v]) => `${k}: ${v}`), link ? `\n${link}` : ''].filter(Boolean).join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:560px">
      <h2 style="font-size:18px;margin:0 0 10px">${esc(subject)}</h2>${intro ? `<p style="margin:0 0 12px">${esc(intro)}</p>` : ''}
      <table style="border-collapse:collapse;width:100%">${list.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#667;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>
      ${link ? `<p style="margin:16px 0 0"><a href="${esc(link)}" style="background:#1f6feb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;display:inline-block">${esc(button)}</a></p>` : ''}</div>`;
    await sendMail(env, db, { to: [to], subject, text, html });
    return { ok: true };
  } catch (e) {
    await log(db, null, 'warn', `Bilgilendirme e-postası gönderilemedi (${subject}): ${String(e.message).slice(0, 200)}`).catch(() => {});
    return { error: e.message };
  }
}
