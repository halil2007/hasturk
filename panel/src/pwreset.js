// Şifre yenileme (müşteri panelleri): "Şifremi unuttum" → kullanıcının e-postasına 1 saat geçerli tek kullanımlık bağlantı.
// Yeni firma açılınca yöneticisine "şifrenizi belirleyin" bağlantısı (7 gün) içeren hoş geldiniz e-postası gider.
// Bağlantıdaki anahtar veritabanında yalnız özetiyle (SHA-256) tutulur; kullanılınca silinir. Şifre değişince açık oturumlar kapanır.
import { first, run, getRaw, setSetting, log } from './db.js';
import { hashPassword } from './auth.js';
import { sendMail, validEmail } from './mail.js';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const HOUR = 3600e3;

export async function createToken(db, uid, ttl) {
  const tok = hex(crypto.getRandomValues(new Uint8Array(24)));
  await setSetting(db, 'pwreset:' + await sha(tok), { uid, exp: Date.now() + ttl });
  return tok;
}
const mailHtml = (title, lines, link, button) => `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px">
  <h2 style="font-size:19px;margin:0 0 12px">${esc(title)}</h2>${lines.map((l) => `<p style="margin:0 0 10px">${l}</p>`).join('')}
  <p style="margin:18px 0"><a href="${esc(link)}" style="background:#1f6feb;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold;display:inline-block">${esc(button)}</a></p>
  <p style="color:#667;font-size:12px">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın: ${esc(link)}</p></div>`;

// who: kullanıcı adı ya da e-posta. Kullanıcı yoksa / e-postası yoksa da aynı yanıt döner (hesap varlığı dışarıdan anlaşılmasın).
export async function forgot(env, db, { who, link }) {
  const w = String(who || '').trim().toLocaleLowerCase('tr');
  if (!w) return { ok: true };
  const u = await first(db, "SELECT id, username, name, email FROM users WHERE active = 1 AND COALESCE(email, '') != '' AND (LOWER(username) = ? OR LOWER(email) = ?) LIMIT 1", w, w);
  if (!u || !validEmail(u.email)) return { ok: true };
  // Kullanıcı başına saatte en fazla 3 bağlantı
  const rk = 'pwreset_rate:' + u.id, rate = (await getRaw(db, rk)) || { n: 0, at: 0 }, t = Date.now();
  const n = t - rate.at > HOUR ? 1 : rate.n + 1;
  await setSetting(db, rk, { n, at: n === 1 ? t : rate.at });
  if (n > 3) return { ok: true };
  const tok = await createToken(db, u.id, HOUR);
  const url = link + tok;
  await sendMail(env, db, { to: [u.email], subject: 'Şifre yenileme bağlantınız',
    text: `Merhaba ${u.name || u.username},\n\nŞifrenizi yenilemek için bu bağlantıyı açın (1 saat geçerli, tek kullanımlık):\n${url}\n\nBu isteği siz yapmadıysanız e-postayı yok sayın; şifreniz değişmez.`,
    html: mailHtml('Şifre yenileme', [`Merhaba ${esc(u.name || u.username)},`, 'Şifrenizi yenilemek için aşağıdaki düğmeye basın. Bağlantı <b>1 saat</b> geçerlidir ve bir kez kullanılabilir.', 'Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.'], url, 'Şifremi yenile') });
  await log(db, null, 'info', `${u.username}: şifre yenileme bağlantısı e-postayla gönderildi`);
  return { ok: true };
}

export async function resetPassword(db, { token, password }) {
  const tok = String(token || '').trim();
  if (!/^[0-9a-f]{48}$/.test(tok)) return { error: 'Bağlantı geçersiz' };
  if (String(password || '').length < 8) return { error: 'Şifre en az 8 karakter olmalı' };
  const k = 'pwreset:' + await sha(tok), r = await getRaw(db, k);
  if (!r || r.exp < Date.now()) { if (r) await run(db, 'DELETE FROM settings WHERE k = ?', k); return { error: 'Bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeniden “Şifremi unuttum” deyin.' }; }
  const u = await first(db, 'SELECT id, username FROM users WHERE id = ? AND active = 1', r.uid);
  if (!u) return { error: 'Kullanıcı bulunamadı' };
  // Yeni şifre: eski oturumlar şifre özetine bağlı olduğundan kendiliğinden kapanır
  await run(db, 'UPDATE users SET pass = ? WHERE id = ?', await hashPassword(String(password)), u.id);
  await run(db, "DELETE FROM settings WHERE k = ? OR k LIKE 'login_fail:%'", k);
  await log(db, null, 'info', `${u.username}: şifre e-postadaki bağlantıyla yenilendi`);
  return { ok: true, username: u.username };
}

// Yeni firma: yönetici e-postasına giriş bilgileri ve 7 gün geçerli "şifrenizi belirleyin" bağlantısı
export async function welcome(env, db, { email, firm, slug, username, origin, link, trialDays }) {
  if (!validEmail(email)) return { skipped: 'e-posta yok' };
  const u = await first(db, 'SELECT id FROM users WHERE LOWER(username) = LOWER(?)', username);
  if (!u) return { skipped: 'kullanıcı yok' };
  if (!(await first(db, 'SELECT email FROM users WHERE id = ?', u.id)).email) await run(db, 'UPDATE users SET email = ? WHERE id = ?', email, u.id);
  const url = link + await createToken(db, u.id, 7 * 24 * HOUR);
  await sendMail(env, db, { to: [email], subject: `${firm} · Hastürk CRM paneliniz hazır`,
    text: `Paneliniz hazır.\n\nGiriş adresi: ${origin}\nFirma kodu: ${slug}\nKullanıcı adı: ${username}\n\nŞifrenizi belirlemek için (7 gün geçerli): ${url}\n${trialDays ? `\nÜcretsiz deneme süreniz ${trialDays} gündür.` : ''}`,
    html: mailHtml('Paneliniz hazır', [`<b>${esc(firm)}</b> için Hastürk CRM paneli açıldı.`, `Giriş adresi: <a href="${esc(origin)}">${esc(origin)}</a><br>Firma kodu: <b>${esc(slug)}</b><br>Kullanıcı adı: <b>${esc(username)}</b>`,
      'Güvenliğiniz için şifrenizi aşağıdaki bağlantıdan kendiniz belirleyin (bağlantı 7 gün geçerli). Size iletilen geçici şifreyle de giriş yapabilirsiniz.', trialDays ? `Ücretsiz deneme süreniz <b>${trialDays} gün</b>. İlk adım olarak Entegrasyonlar sayfasından mağazanızı bağlayın.` : 'İlk adım olarak Entegrasyonlar sayfasından mağazanızı bağlayın.'].filter(Boolean), url, 'Şifremi belirle') });
  return { ok: true };
}
