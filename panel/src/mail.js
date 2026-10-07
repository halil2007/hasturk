// Yeni sipariş e-posta bildirimi.
// Senkron, bir kanaldan ilk kez gelen siparişi kuyruğa yazar (mail_queue, sipariş başına tek kayıt → aynı sipariş için
// ikinci e-posta gitmez). Kanalın ilk aktarımı (henüz senkron imleci yokken), geçmiş sipariş aktarımı, 48 saatten eski
// siparişler ve örnek (demo) kanallar kuyruğa girmez. Kuyruk her senkron sonunda gönderilir; hata olursa birkaç kez denenir.
// Servis: kendi e-posta sunucunuz (SMTP), Brevo (gönderen adresini e-postayla doğrulamak yeterli) ya da Resend (alan adı doğrulaması gerekir).
// API anahtarı Entegrasyonlar'daki diğer anahtarlar gibi şifreli saklanır.
import { all, first, run, getSettings, getRaw, log, notify, resolve } from './db.js';
import { loadConfig, effectiveEnv } from './config.js';
import { http, chunk, DEAD_LINE } from './util.js';
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
    const host = String(e.MAIL_SMTP_HOST).trim();
    // Google (Gmail / Workspace) uygulama şifresi "abcd efgh ijkl mnop" diye gösterilir: boşluklar şifrenin parçası değildir
    const pass = /gmail|google/i.test(host) ? String(e.MAIL_SMTP_PASS).replace(/\s+/g, '') : e.MAIL_SMTP_PASS;
    return smtpSend({ host, port: Number(e.MAIL_SMTP_PORT) || 465, user: String(e.MAIL_SMTP_USER || from).trim(), pass, from, fromName: name, to, subject, html, text }, { connect: env.__connect });
  }
  if (!key) throw new Error('E-posta servisi API anahtarı girilmemiş (Ayarlar → Bildirimler)');
  // Birden çok alıcı: herkese ayrı kopya (alıcılar birbirinin adresini görmez)
  if (provider === 'resend') {
    const one = (t) => ({ from: `${name} <${from}>`, to: [t], subject, html, text });
    if (to.length === 1) return http('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(one(to[0])) });
    return http('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(to.map(one)) });
  }
  const body = { sender: { email: from, name }, subject, htmlContent: html, textContent: text };
  if (to.length === 1) body.to = [{ email: to[0] }];
  else body.messageVersions = to.map((email) => ({ to: [{ email }] }));
  return http('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  });
}

// E-postalarda firma logosu: panelin herkese açık logo adresi (müşteri panelinde firma koduyla). Logo ya da panel adresi yoksa boş.
// Logonun panel içi adresi (/api/logo?…&v=sürüm): sürüm logo değişince değişir, tarayıcı önbelleği eskiyi göstermez
export function logoPath(env, settings) {
  const logo = (settings && settings.logo) || '';
  if (!logo) return '';
  let h = 0;
  for (let i = 0; i < logo.length; i++) h = (Math.imul(h, 31) + logo.charCodeAt(i)) | 0;
  return `/api/logo?${env && env.TENANT_SLUG ? `t=${encodeURIComponent(env.TENANT_SLUG)}&` : ''}v=${(h >>> 0).toString(36)}${logo.length.toString(36)}`;
}
export function logoUrl(env, settings) {
  const base = String((settings && settings.panel_url) || '').replace(/\/+$/, ''), p = logoPath(env, settings);
  return base && p ? base + p : '';
}
export const logoImg = (url, alt = '') => (url ? `<img src="${esc(url)}" alt="${esc(alt)}" style="display:block;max-height:52px;max-width:200px;margin:0 0 14px">` : '');

// Sipariş e-postası (HTML + düz metin). Tablo tabanlı, satır içi stilli düzen: Gmail / Outlook / Apple Mail / telefonda aynı görünür.
// Açık tema sabittir (color-scheme: light) — koyu temalı istemciler de okunur kalır.
const imgOk = (u) => /^https:\/\//i.test(String(u || ''));
export function orderMail(o, items, ch, panelUrl, logo = '', company = '') {
  const title = mailTitle(ch);
  const link = panelUrl ? `${panelUrl.replace(/\/$/, '')}/#/siparisler/${encodeURIComponent(o.id)}` : '';
  const a = (() => { try { return JSON.parse(o.address || '{}'); } catch { return {}; } })();
  const live = items.filter((i) => !DEAD_LINE(i.status));
  const qty = live.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const sub = Math.round(live.reduce((s, i) => s + (Number(i.total) || 0), 0) * 100) / 100, total = Number(o.total) || 0;
  const diff = Math.round((total - sub) * 100) / 100;
  const place = [a.district, a.city].filter(Boolean).join(' / ');
  const store = `${ch.name}${ch.type === 'ikas' ? ' (ikas)' : ''}`;
  const F = 'font-family:Arial,Helvetica,sans-serif';
  const info = [['Sipariş no', `<b>#${esc(o.order_number)}</b>`], ['Tarih', esc(when(o.ordered_at))], ['Mağaza', esc(store)],
    o.customer ? ['Müşteri', esc(o.customer) + (place ? `<br><span style="color:#6b7385">${esc(place)}</span>` : '')] : null].filter(Boolean)
    .map(([k, v]) => `<tr><td style="${F};font-size:13px;color:#6b7385;padding:5px 0;width:110px;vertical-align:top">${k}</td><td style="${F};font-size:14px;color:#1c2333;padding:5px 0">${v}</td></tr>`).join('');
  const rows = live.map((i) => {
    const unit = Number(i.unit_price) || (Number(i.quantity) ? (Number(i.total) || 0) / Number(i.quantity) : 0);
    const pic = imgOk(i.image) ? `<td width="56" style="padding:12px 12px 12px 0;vertical-align:top"><img src="${esc(i.image)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #e6e9f0;background:#f6f8fb"></td>` : '';
    return `<tr>${pic}<td style="${F};padding:12px 0;vertical-align:top;border-bottom:1px solid #eef1f6">
        <div style="font-size:14px;color:#1c2333;font-weight:bold;line-height:1.35">${esc(i.name || i.sku)}</div>
        <div style="font-size:12px;color:#8a92a3;margin-top:3px">${i.sku ? `${esc(i.sku)} · ` : ''}${esc(i.quantity)} adet × ${esc(tl(unit))}</div></td>
      <td style="${F};padding:12px 0 12px 12px;vertical-align:top;text-align:right;white-space:nowrap;font-size:14px;color:#1c2333;font-weight:bold;border-bottom:1px solid #eef1f6">${esc(tl(i.total))}</td></tr>`;
  }).join('');
  const cols = live.some((i) => imgOk(i.image)) ? 3 : 2;
  const sumRow = (k, v, strong) => `<tr><td colspan="${cols - 1}" style="${F};padding:${strong ? '10px' : '4px'} 0 0;text-align:right;font-size:${strong ? 16 : 13}px;color:${strong ? '#1c2333' : '#6b7385'};${strong ? 'font-weight:bold' : ''}">${k}</td>
      <td style="${F};padding:${strong ? '10px' : '4px'} 0 0 12px;text-align:right;white-space:nowrap;font-size:${strong ? 16 : 13}px;color:#1c2333;${strong ? 'font-weight:bold' : ''}">${v}</td></tr>`;
  const sums = (Math.abs(diff) >= 0.01 ? sumRow('Ara toplam', esc(tl(sub))) + sumRow(diff > 0 ? 'Kargo ve diğer ücretler' : 'İndirim', esc(tl(diff))) : '') + sumRow('Toplam', esc(tl(total)), true);
  const brand = logo ? `<img src="${esc(logo)}" alt="${esc(company)}" style="display:block;max-height:40px;max-width:180px;border:0">`
    : `<span style="${F};font-size:16px;font-weight:bold;color:#1c2333">${esc(company || 'Hastürk CRM')}</span>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title>
<style>:root{color-scheme:light only}@media (max-width:620px){.wrap{padding:12px 8px!important}.card{padding:18px 16px!important}.big{font-size:24px!important}}</style></head>
<body style="margin:0;padding:0;background:#eef1f6" bgcolor="#eef1f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">#${esc(o.order_number)} · ${esc(tl(total))} · ${esc(store)}${o.customer ? ' · ' + esc(o.customer) : ''}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f6" style="background:#eef1f6"><tr><td align="center" class="wrap" style="padding:24px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
  <tr><td style="padding:0 4px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle">${brand}</td>
    <td align="right" style="vertical-align:middle"><span style="${F};display:inline-block;background:#dcfce7;color:#166534;font-size:12px;font-weight:bold;padding:5px 11px;border-radius:999px">● Yeni sipariş</span></td>
  </tr></table></td></tr>
  <tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e3e7ef;border-radius:14px;padding:26px 28px">
    <div style="${F};font-size:12px;color:#6b7385;text-transform:uppercase;letter-spacing:.6px">${esc(ch.type === 'ikas' ? 'ikas mağazası' : 'Pazaryeri')} · ${esc(ch.name)}</div>
    <h1 style="${F};font-size:19px;line-height:1.35;color:#1c2333;margin:6px 0 16px;font-weight:bold">${esc(title)}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f8fb" style="background:#f6f8fb;border-radius:10px"><tr><td style="padding:14px 16px">
      <div style="${F};font-size:12px;color:#6b7385">Sipariş tutarı</div>
      <div class="big" style="${F};font-size:28px;font-weight:bold;color:#1c2333;margin-top:2px">${esc(tl(total))}</div>
      <div style="${F};font-size:13px;color:#6b7385;margin-top:2px">${qty} ürün · #${esc(o.order_number)}</div>
    </td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px">${info}</table>
    <div style="${F};font-size:12px;color:#6b7385;text-transform:uppercase;letter-spacing:.6px;margin:12px 0 0;padding-bottom:6px;border-bottom:1px solid #e3e7ef">Ürünler</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}${sums}</table>
    ${link ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px"><tr><td align="center">
      <a href="${esc(link)}" style="${F};display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 28px;border-radius:9px">Siparişi panelde aç</a></td></tr></table>` : ''}
  </td></tr>
  <tr><td style="${F};font-size:11px;line-height:1.5;color:#8a92a3;text-align:center;padding:14px 8px 0">Bu e-posta ${esc(company || 'Hastürk CRM')} satış panelinden otomatik gönderildi.<br>Bildirim ayarları: Ayarlar → Bildirimler</td></tr>
 </table>
</td></tr></table></body></html>`;
  const text = [title, '', `Sipariş no: #${o.order_number}`, `Tarih: ${when(o.ordered_at)}`, `Platform / mağaza: ${store}`, o.customer ? `Müşteri: ${o.customer}${place ? ' · ' + place : ''}` : '', '',
    ...live.map((i) => `${i.quantity} × ${i.name || i.sku} — ${tl(i.total)}`), '',
    ...(Math.abs(diff) >= 0.01 ? [`Ara toplam: ${tl(sub)}`, `${diff > 0 ? 'Kargo ve diğer ücretler' : 'İndirim'}: ${tl(diff)}`] : []), `Toplam: ${tl(total)}`, link ? `\nSiparişi panelde aç: ${link}` : ''].filter((l, k, arr) => l !== '' || arr[k - 1] !== '').join('\n');
  return { subject: `${title} · #${o.order_number} · ${tl(total)}`, html, text };
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
  const logo = logoUrl(env, { ...settings, panel_url: panelUrl }), company = (settings.company && settings.company.title) || '';
  let sent = 0;
  for (const q of pending) {
    const o = await first(db, 'SELECT * FROM orders WHERE id = ?', q.order_id);
    const ch = channels.find((c) => c.id === q.channel) || { id: q.channel, name: q.channel, type: q.channel };
    if (!o) { await run(db, "UPDATE mail_queue SET sent_at = ?, error = 'sipariş yok' WHERE order_id = ?", Date.now(), q.order_id); continue; }
    try {
      const items = await all(db, 'SELECT * FROM order_items WHERE order_id = ?', o.id);
      await sendMail(env, db, { to, ...orderMail(o, items, ch, panelUrl, logo, company) });
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
