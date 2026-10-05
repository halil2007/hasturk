// Günlük özet e-postası: her sabah (Türkiye saatiyle 08:00'den sonraki ilk senkronda) dünün satışı, kârı ve bugünün işleri.
// Alıcılar ve e-posta sunucusu "Yeni sipariş e-posta bildirimi" ayarlarıyla aynıdır. Günde bir kez gönderilir.
import { all, first, getRaw, setSetting, getSettings, log } from './db.js';
import { getChannels } from './channels/index.js';
import { breakdown } from './finance.js';
import { sendMail, logoUrl, logoImg } from './mail.js';
import { LATE, r2 } from './util.js';

const H = 3600e3, D = 24 * H;
const trDay = (t = Date.now()) => new Date(t + 3 * H).toISOString().slice(0, 10);
const dayStart = (t = Date.now()) => Date.parse(trDay(t) + 'T00:00:00+03:00');
const tl = (v) => '₺' + Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

export async function digestData(env, db, settings) {
  const today = dayStart(), y0 = today - D, y1 = today - 2 * D;
  const [yday, prev] = await Promise.all([breakdown(db, settings, { from: y0, to: today }), breakdown(db, settings, { from: y1, to: y0 })]);
  const names = Object.fromEntries((await getChannels(env, db)).map((c) => [c.id, c.name]));
  const n = async (sql, ...a) => (await first(db, sql, ...a)).n || 0;
  const sold30 = `(SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id = p.id AND o.ordered_at >= ${Date.now() - 30 * D}
    AND o.status NOT IN ('cancelled', 'returned') AND COALESCE(i.status, '') != 'cancelled')`;
  const runout = await all(db, `SELECT name, variant_name, stock, s FROM (SELECT p.name, p.variant_name, p.stock, ${sold30} AS s FROM products p WHERE p.active = 1 AND p.stock > 0)
    WHERE s > 0 AND stock * 30.0 / s <= 14 ORDER BY stock * 30.0 / s LIMIT 8`);
  return {
    day: new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'Europe/Istanbul' }).format(y0), names,
    total: yday.total, prev: prev.total, channels: yday.channels,
    toShip: await n("SELECT COUNT(*) AS n FROM orders o WHERE o.status IN ('new', 'processing')"),
    late: await n(`SELECT COUNT(*) AS n FROM orders o WHERE ${LATE}`),
    questions: await n("SELECT COUNT(*) AS n FROM questions WHERE status = 'waiting'"),
    claims: await n("SELECT COUNT(*) AS n FROM claims WHERE status = 'waiting'"),
    outOfStock: await n('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock <= 0'),
    runout: runout.map((r) => ({ name: [r.name, r.variant_name].filter(Boolean).join(' · '), stock: r.stock, days: Math.floor((r.stock * 30) / r.s) })),
  };
}

export function digestMail(d, { company = 'Hastürk', panelUrl = '', logo = '' } = {}) {
  const t = d.total, p = d.prev;
  const dRev = pct(t.revenue, p.revenue), dOrd = pct(t.orders, p.orders);
  const delta = (v) => (v == null ? '' : ` <span style="color:${v >= 0 ? '#15803d' : '#b91c1c'};font-size:12px">${v >= 0 ? '▲' : '▼'} %${Math.abs(v)}</span>`);
  const tile = (label, value, sub = '') => `<td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;width:33%"><div style="color:#6b7280;font-size:12px">${label}</div><div style="font-size:20px;font-weight:700;margin-top:2px">${value}</div>${sub ? `<div style="font-size:12px;color:#6b7280">${sub}</div>` : ''}</td>`;
  const todo = [
    [d.toShip, 'sipariş kargoya hazırlanacak', '#/kargo'], [d.late, 'sipariş gecikmede', '#/siparisler?status=late'], [d.claims, 'iade talebi karar bekliyor', '#/iadeler'],
    [d.questions, 'müşteri sorusu cevap bekliyor', '#/sorular'], [d.outOfStock, 'ürün stokta yok', '#/stoklar?durum=out'], [d.runout.length, 'ürün 14 gün içinde tükenecek', '#/stoklar?durum=runout'],
  ].filter(([v]) => v > 0);
  const link = (h, text) => (panelUrl ? `<a href="${esc(panelUrl + '/' + h)}" style="color:#1d4ed8;text-decoration:none">${text}</a>` : text);
  const html = `<div style="font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;max-width:640px">
    ${logoImg(logo, company)}<h2 style="margin:0 0 4px">${esc(company)} · günlük özet</h2><div style="color:#6b7280;margin-bottom:14px">${esc(d.day)} (dün)</div>
    <table cellspacing="6" style="width:100%;border-collapse:separate"><tr>${tile('Ciro', tl(t.revenue) + delta(dRev), `önceki gün ${tl(p.revenue)}`)}${tile('Sipariş', t.orders + delta(dOrd), `önceki gün ${p.orders}`)}${tile('Tahmini kâr', tl(t.profit), `marj %${r2(t.margin || 0)}`)}</tr></table>
    ${d.channels.length ? `<h3 style="margin:18px 0 6px;font-size:15px">Kanallar</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#6b7280;text-align:left"><th style="padding:4px 0">Kanal</th><th style="text-align:right">Sipariş</th><th style="text-align:right">Ciro</th><th style="text-align:right">Kâr</th></tr>
      ${d.channels.map((c) => `<tr style="border-top:1px solid #eee"><td style="padding:5px 0">${esc(d.names[c.channel] || c.channel)}</td><td style="text-align:right">${c.orders}</td><td style="text-align:right">${tl(c.revenue)}</td><td style="text-align:right">${tl(c.profit)}</td></tr>`).join('')}</table>` : '<p style="color:#6b7280">Dün sipariş gelmedi.</p>'}
    <h3 style="margin:18px 0 6px;font-size:15px">Bugünün işleri</h3>
    ${todo.length ? `<ul style="margin:0;padding-left:18px">${todo.map(([v, t2, h]) => `<li>${link(h, `<b>${v}</b> ${t2}`)}</li>`).join('')}</ul>` : '<p style="color:#15803d">Bekleyen iş yok 🎉</p>'}
    ${d.runout.length ? `<h3 style="margin:18px 0 6px;font-size:15px">Tükenmek üzere</h3><table style="width:100%;border-collapse:collapse;font-size:13px">${d.runout.map((r) => `<tr style="border-top:1px solid #eee"><td style="padding:4px 0">${esc(r.name)}</td><td style="text-align:right">${r.stock} adet</td><td style="text-align:right;color:#b91c1c">≈ ${r.days} gün</td></tr>`).join('')}</table>` : ''}
    ${panelUrl ? `<p style="margin-top:20px"><a href="${esc(panelUrl)}" style="background:#1d4ed8;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Paneli aç</a></p>` : ''}
    <p style="color:#9ca3af;font-size:12px;margin-top:18px">Kâr tahminidir (komisyon, kargo, kesinti ve alış fiyatına göre). Bu e-postayı Ayarlar → Bildirimler'den kapatabilirsiniz.</p></div>`;
  const text = [`${company} günlük özet · ${d.day}`, `Ciro ${tl(t.revenue)} · ${t.orders} sipariş · tahmini kâr ${tl(t.profit)}`, ...todo.map(([v, t2]) => `- ${v} ${t2}`)].join('\n');
  return { subject: `Günlük özet · ${d.day} · ${t.orders} sipariş, ${tl(t.revenue)}`, html, text };
}

// Senkronda çağrılır: açıksa ve bugün gönderilmediyse 08:00'den sonra gönderir. force = deneme (hemen, işaretlemeden).
export async function dailyDigest(env, db, settings, { force = false } = {}) {
  settings = settings || await getSettings(db);
  if (!force) {
    if (!settings.daily_digest || env.DEMO === '1') return null;
    if (new Date(Date.now() + 3 * H).getUTCHours() < 8) return null;
    if ((await getRaw(db, 'digest_sent')) === trDay()) return null;
  }
  const to = settings.mail_to || [];
  if (!to.length) throw new Error('Özet e-postası için alıcı e-posta adresi girilmemiş (Ayarlar → Bildirimler)');
  const d = await digestData(env, db, settings);
  const m = digestMail(d, { company: (settings.company && settings.company.title) || 'Hastürk', panelUrl: settings.panel_url || '', logo: logoUrl(env, settings) });
  if (!force) await setSetting(db, 'digest_sent', trDay()); // hata olsa da gün içinde tekrar tekrar denenmesin
  await sendMail(env, db, { to, subject: m.subject, html: m.html, text: m.text });
  if (!force) await log(db, null, 'info', `Günlük özet e-postası gönderildi (${to.length} alıcı)`);
  return { sent: to.length, subject: m.subject };
}
