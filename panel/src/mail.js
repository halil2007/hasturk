// Yeni sipariş e-posta bildirimi.
// Senkron, bir kanaldan ilk kez gelen siparişi kuyruğa yazar (mail_queue, sipariş başına tek kayıt → aynı sipariş için
// ikinci e-posta gitmez). Kanalın ilk aktarımı (henüz senkron imleci yokken), geçmiş sipariş aktarımı, 48 saatten eski
// siparişler ve örnek (demo) kanallar kuyruğa girmez. Kuyruk her senkron sonunda gönderilir; hata olursa birkaç kez denenir.
// Servis: kendi e-posta sunucunuz (SMTP), Brevo (gönderen adresini e-postayla doğrulamak yeterli) ya da Resend (alan adı doğrulaması gerekir).
// API anahtarı Entegrasyonlar'daki diğer anahtarlar gibi şifreli saklanır.
import { all, first, run, getSettings, getRaw, log, notify, resolve } from './db.js';
import { loadConfig, effectiveEnv } from './config.js';
import { http, chunk } from './util.js';
import { smtpSend } from './smtp.js';

const MAX_AGE = 48 * 3600e3;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tl = (v) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(v) || 0);
const when = (t) => new Date(t).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });
export const validEmail = (s) => /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(String(s || '').trim());

// Kanala göre başlık: ikas = mağaza, diğerleri = pazaryeri
export function mailTitle(ch) {
  return ch.type === 'ikas' ? `${ch.name} (ikas) mağazanızdan yeni sipariş geldi` : `${ch.name} üzerinden yeni sipariş geldi`;
}

// Senkronda yeni gelen siparişleri kuyruğa al (yalnızca bildirim açıksa ve kanal seçiliyse)
export async function queueNew(db, ch, ids, settings) {
  if (!ids.length || ch.demo || !settings.mail_enabled || !(settings.mail_to || []).length) return 0;
  if ((settings.mail_channels || {})[ch.id] === false) return 0;
  const t = Date.now();
  let n = 0;
  for (const part of chunk(ids, 50)) {
    const rows = await all(db, `SELECT id, ordered_at FROM orders WHERE id IN (${part.map(() => '?').join(',')})`, ...part);
    const fresh = rows.filter((r) => r.ordered_at >= t - MAX_AGE);
    if (!fresh.length) continue;
    await db.batch(fresh.map((r) => db.prepare('INSERT OR IGNORE INTO mail_queue (order_id, channel, created_at, tries) VALUES (?, ?, ?, 0)').bind(r.id, ch.id, t)));
    n += fresh.length;
  }
  return n;
}

// E-posta gönder (Brevo / Resend)
export async function sendMail(env, db, { to, subject, html, text }) {
  const e = effectiveEnv(env, await loadConfig(env, db));
  const provider = String(e.MAIL_PROVIDER || 'brevo').toLowerCase().trim();
  const key = e.MAIL_API_KEY, from = String(e.MAIL_FROM || e.MAIL_SMTP_USER || '').trim(), name = e.MAIL_FROM_NAME || 'Hastürk Panel';
  if (!validEmail(from)) throw new Error('Gönderen e-posta adresi girilmemiş veya geçersiz (Ayarlar → Bildirimler)');
  // Kendi e-posta sunucunuz (hosting / kurumsal e-posta): SMTP 465 (SSL) ya da 587 (STARTTLS)
  if (provider === 'smtp') {
    if (!e.MAIL_SMTP_HOST || !e.MAIL_SMTP_PASS) throw new Error('SMTP sunucusu ve şifresi girilmemiş (Ayarlar → Bildirimler)');
    return smtpSend({ host: String(e.MAIL_SMTP_HOST).trim(), port: Number(e.MAIL_SMTP_PORT) || 465, user: String(e.MAIL_SMTP_USER || from).trim(), pass: e.MAIL_SMTP_PASS, from, fromName: name, to, subject, html, text }, { connect: env.__connect });
  }
  if (!key) throw new Error('E-posta servisi API anahtarı girilmemiş (Ayarlar → Bildirimler)');
  if (provider === 'resend') {
    return http('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${name} <${from}>`, to, subject, html, text }),
    });
  }
  return http('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: { email: from, name }, to: to.map((email) => ({ email })), subject, htmlContent: html, textContent: text }),
  });
}

// E-postalarda firma logosu: panelin herkese açık logo adresi (müşteri panelinde firma koduyla). Logo ya da panel adresi yoksa boş.
export function logoUrl(env, settings) {
  const base = String((settings && settings.panel_url) || '').replace(/\/+$/, ''), logo = (settings && settings.logo) || '';
  if (!base || !logo) return '';
  let h = 0;
  for (let i = 0; i < logo.length; i += 97) h = (Math.imul(h, 31) + logo.charCodeAt(i)) | 0;
  return `${base}/api/logo?${env && env.TENANT_SLUG ? `t=${encodeURIComponent(env.TENANT_SLUG)}&` : ''}v=${(h >>> 0).toString(36)}${logo.length.toString(36)}`;
}
export const logoImg = (url, alt = '') => (url ? `<img src="${esc(url)}" alt="${esc(alt)}" style="display:block;max-height:52px;max-width:200px;margin:0 0 14px">` : '');

// Sipariş e-postası (HTML + düz metin)
export function orderMail(o, items, ch, panelUrl, logo = '') {
  const title = mailTitle(ch);
  const link = panelUrl ? `${panelUrl.replace(/\/$/, '')}/#/siparisler/${encodeURIComponent(o.id)}` : '';
  const a = (() => { try { return JSON.parse(o.address || '{}'); } catch { return {}; } })();
  const live = items.filter((i) => i.status !== 'cancelled');
  const rows = live.map((i) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(i.name || i.sku)}${i.sku ? `<div style="color:#888;font-size:12px">${esc(i.sku)}</div>` : ''}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center">${esc(i.quantity)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${esc(tl(i.total))}</td></tr>`).join('');
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#1c2333">
  <div style="max-width:560px;margin:0 auto;padding:20px">
    <div style="background:#fff;border-radius:12px;padding:22px;border:1px solid #e6e9f0">
      ${logoImg(logo)}
      <div style="font-size:12px;color:#6b7385;text-transform:uppercase;letter-spacing:.5px">${esc(ch.type === 'ikas' ? 'ikas mağazası' : 'Pazaryeri')} · ${esc(ch.name)}</div>
      <h1 style="font-size:20px;margin:6px 0 14px">${esc(title)}</h1>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:14px">
        <tr><td style="color:#6b7385;padding:3px 0;width:130px">Sipariş no</td><td style="font-weight:bold">#${esc(o.order_number)}</td></tr>
        <tr><td style="color:#6b7385;padding:3px 0">Tarih</td><td>${esc(when(o.ordered_at))}</td></tr>
        <tr><td style="color:#6b7385;padding:3px 0">Platform / mağaza</td><td>${esc(ch.name)}${ch.type === 'ikas' ? ' (ikas)' : ''}</td></tr>
        ${o.customer ? `<tr><td style="color:#6b7385;padding:3px 0">Müşteri</td><td>${esc(o.customer)}${a.city ? ` · ${esc([a.district, a.city].filter(Boolean).join(' / '))}` : ''}</td></tr>` : ''}
      </table>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr style="background:#f6f8fb"><th style="text-align:left;padding:8px 10px">Ürün</th><th style="padding:8px 10px">Adet</th><th style="text-align:right;padding:8px 10px">Tutar</th></tr>
        ${rows}
        <tr><td colspan="2" style="padding:10px;text-align:right;font-weight:bold">Toplam</td><td style="padding:10px;text-align:right;font-weight:bold;white-space:nowrap">${esc(tl(o.total))}</td></tr>
      </table>
      ${link ? `<div style="text-align:center;margin-top:18px"><a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:9px">Siparişi panelde aç</a></div>` : ''}
    </div>
    <div style="font-size:11px;color:#8a92a3;text-align:center;margin-top:12px">Bu e-posta Hastürk satış panelinden otomatik gönderildi. Bildirim ayarları: Ayarlar → Bildirimler.</div>
  </div></body></html>`;
  const text = [title, `Sipariş no: #${o.order_number}`, `Tarih: ${when(o.ordered_at)}`, `Platform / mağaza: ${ch.name}`, '', ...live.map((i) => `${i.quantity} × ${i.name || i.sku} — ${tl(i.total)}`), '', `Toplam: ${tl(o.total)}`, link ? `\nSiparişi panelde aç: ${link}` : ''].join('\n');
  return { subject: `${title} · #${o.order_number} · ${tl(o.total)}`, html, text };
}

// Kuyruktaki e-postaları gönder (her senkron sonunda)
export async function sendQueued(env, db, channels, settings) {
  settings = settings || await getSettings(db);
  const pending = await all(db, 'SELECT * FROM mail_queue WHERE sent_at IS NULL AND tries < 5 ORDER BY created_at LIMIT 20');
  if (!pending.length) return 0;
  const to = (settings.mail_to || []).filter(validEmail);
  if (!settings.mail_enabled || !to.length) {
    // Bildirim kapatıldıysa bekleyenler gönderilmeden kapatılır (sonradan açılınca eski siparişler gönderilmez)
    await run(db, "UPDATE mail_queue SET sent_at = ?, error = 'bildirim kapalı' WHERE sent_at IS NULL", Date.now());
    return 0;
  }
  const panelUrl = settings.panel_url || (await getRaw(db, 'panel_url')) || '';
  const logo = logoUrl(env, { ...settings, panel_url: panelUrl });
  let sent = 0;
  for (const q of pending) {
    const o = await first(db, 'SELECT * FROM orders WHERE id = ?', q.order_id);
    const ch = channels.find((c) => c.id === q.channel) || { id: q.channel, name: q.channel, type: q.channel };
    if (!o) { await run(db, "UPDATE mail_queue SET sent_at = ?, error = 'sipariş yok' WHERE order_id = ?", Date.now(), q.order_id); continue; }
    try {
      const items = await all(db, 'SELECT * FROM order_items WHERE order_id = ?', o.id);
      await sendMail(env, db, { to, ...orderMail(o, items, ch, panelUrl, logo) });
      await run(db, 'UPDATE mail_queue SET sent_at = ?, tries = tries + 1, error = NULL WHERE order_id = ?', Date.now(), q.order_id);
      sent++;
    } catch (e) {
      await run(db, 'UPDATE mail_queue SET tries = tries + 1, error = ? WHERE order_id = ?', e.message.slice(0, 400), q.order_id);
      await log(db, q.channel, 'warn', `#${o.order_number} yeni sipariş e-postası gönderilemedi: ${e.message}`);
      await notify(db, 'mail', { level: 'warn', title: 'Yeni sipariş e-postası gönderilemedi', msg: e.message });
      return sent; // servis hatası: kalanlar sonraki senkronda denenir
    }
  }
  if (sent) await resolve(db, 'mail');
  return sent;
}
