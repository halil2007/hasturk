// Destek talepleri: firmalar (müşteri panelleri) sorun / soru / öneri bildirir, isterse ekran görüntüsü ekler; talepler ana panelin
// veritabanında tutulur ve ana panelin "Destek" sayfasına düşer. Ana panel yanıtlar, durum değiştirir; firma yanıtı kendi panelinde görür.
// staff = ana panel (talepleri yanıtlayan taraf); değilse yalnız kendi firmasının (slug) talepleri görülür.
import { all, first, run, notify } from './db.js';
import { notify as pushNotify } from './push.js';
import { fail, str, json } from './util.js';

export const CATEGORIES = { bug: 'Hata / sorun', question: 'Soru', request: 'Öneri / istek', billing: 'Abonelik / ödeme' };
const STATUS = ['open', 'answered', 'closed'];
const MAX_FILES = 4, MAX_DATA = 1_900_000; // D1 satır sınırı ~2 MB (görseller tarayıcıda küçültülüp gönderilir)

function files(list) {
  const out = [];
  for (const f of (Array.isArray(list) ? list : []).slice(0, MAX_FILES)) {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String((f && f.data) || ''));
    if (!m) fail(400, 'Yalnız görsel (PNG, JPG, WEBP) eklenebilir');
    if (m[2].length > MAX_DATA) fail(400, 'Görsel çok büyük (en fazla ~1,5 MB)');
    out.push({ name: str(f.name).slice(0, 120) || 'gorsel', type: m[1], data: m[2], size: Math.floor((m[2].length * 3) / 4) });
  }
  return out;
}
async function saveFiles(db, ticketId, messageId, list) {
  for (const f of list) await run(db, 'INSERT INTO support_files (ticket_id, message_id, name, type, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ticketId, messageId, f.name, f.type, f.size, f.data, Date.now());
}
const scope = (c) => (c.staff ? { w: '1 = 1', a: [] } : { w: 'slug = ?', a: [c.slug || ''] });
async function ticketOf(db, id, c) {
  const s = scope(c);
  const t = await first(db, `SELECT * FROM support_tickets WHERE id = ? AND ${s.w}`, Number(id) || 0, ...s.a);
  if (!t) fail(404, 'Talep bulunamadı');
  return t;
}
// Ana panele haber: bildirim kaydı + anlık bildirim (hata olsa da talep kaydedilir)
async function tellStaff(db, t, text) {
  await notify(db, `support:${t.id}`, { level: 'warn', title: `Destek: ${t.firm || 'Panel'} — ${t.subject}`, msg: text.slice(0, 300) });
  await pushNotify(db, { title: `Destek talebi · ${t.firm || 'Panel'}`, body: t.subject, url: `#/destek/${t.id}` }).catch(() => {});
}

// c: { slug, firm, user, staff }
export async function supportApi(req, db, path, c) {
  const m = req.method, url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const b = m === 'GET' ? {} : await req.json().catch(() => ({}));
  const u = c.user || {}, who = u.name || u.username || 'Kullanıcı';
  let x;
  if (path === 'support/count' && m === 'GET') {
    const s = scope(c);
    const r = await first(db, `SELECT COUNT(*) AS n FROM support_tickets WHERE ${s.w} AND ${c.staff ? "unread_admin = 1 AND status != 'closed'" : 'unread_user = 1'}`, ...s.a);
    return { n: (r && r.n) || 0 };
  }
  if (path === 'support' && m === 'GET') {
    const s = scope(c), where = [s.w], args = [...s.a];
    if (STATUS.includes(q.status)) { where.push('status = ?'); args.push(q.status); }
    const [tickets, counts] = await Promise.all([
      all(db, `SELECT t.id, t.slug, t.firm, t.user_name, t.subject, t.category, t.status, t.page, t.created_at, t.updated_at, t.unread_admin, t.unread_user,
          (SELECT COUNT(*) FROM support_messages WHERE ticket_id = t.id) AS messages, (SELECT COUNT(*) FROM support_files WHERE ticket_id = t.id) AS files
        FROM support_tickets t WHERE ${where.join(' AND ')} ORDER BY (t.status = 'closed'), t.updated_at DESC LIMIT 300`, ...args),
      all(db, `SELECT status, COUNT(*) AS n FROM support_tickets WHERE ${s.w} GROUP BY status`, ...s.a),
    ]);
    return { tickets, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])), categories: CATEGORIES, staff: !!c.staff };
  }
  if (path === 'support' && m === 'POST') {
    const subject = str(b.subject).slice(0, 140), body = str(b.body).slice(0, 6000), cat = CATEGORIES[b.category] ? b.category : 'bug';
    if (subject.length < 3) fail(400, 'Kısa bir konu yazın');
    if (body.length < 5) fail(400, 'Sorunu birkaç cümleyle anlatın');
    const fl = files(b.files), t = Date.now();
    const ctxText = JSON.stringify(b.context && typeof b.context === 'object' ? b.context : {}).slice(0, 2000);
    const r = await first(db, `INSERT INTO support_tickets (slug, firm, user_name, user_id, subject, category, status, page, context, created_at, updated_at, unread_admin, unread_user)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, 1, 0) RETURNING id`, c.slug || '', c.firm || '', who, u.id ?? null, subject, cat, str(b.page).slice(0, 120), ctxText, t, t);
    const mid = (await first(db, 'INSERT INTO support_messages (ticket_id, author, admin, body, created_at) VALUES (?, ?, 0, ?, ?) RETURNING id', r.id, who, body, t)).id;
    await saveFiles(db, r.id, mid, fl);
    await tellStaff(db, { id: r.id, firm: c.firm, subject }, `${CATEGORIES[cat]} · ${who}: ${body}`);
    return { ok: true, id: r.id };
  }
  if ((x = path.match(/^support\/file\/(\d+)$/)) && m === 'GET') {
    const f = await first(db, 'SELECT f.type, f.data, f.name, t.slug FROM support_files f JOIN support_tickets t ON t.id = f.ticket_id WHERE f.id = ?', Number(x[1]));
    if (!f || (!c.staff && f.slug !== (c.slug || ''))) fail(404, 'Dosya bulunamadı');
    const bin = Uint8Array.from(atob(f.data), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': f.type, 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': `inline; filename="${encodeURIComponent(f.name)}"` } });
  }
  if ((x = path.match(/^support\/(\d+)$/)) && m === 'GET') {
    const t = await ticketOf(db, x[1], c);
    const [msgs, fl] = await Promise.all([
      all(db, 'SELECT id, author, admin, body, created_at FROM support_messages WHERE ticket_id = ? ORDER BY id', t.id),
      all(db, 'SELECT id, message_id, name, type, size FROM support_files WHERE ticket_id = ? ORDER BY id', t.id),
    ]);
    await run(db, `UPDATE support_tickets SET ${c.staff ? 'unread_admin' : 'unread_user'} = 0 WHERE id = ?`, t.id);
    let context = {};
    try { context = JSON.parse(t.context || '{}'); } catch { /* boş */ }
    return { ticket: { ...t, context: c.staff ? context : undefined }, messages: msgs.map((mm) => ({ ...mm, files: fl.filter((f) => f.message_id === mm.id) })), categories: CATEGORIES, staff: !!c.staff };
  }
  if ((x = path.match(/^support\/(\d+)\/reply$/)) && m === 'POST') {
    const t = await ticketOf(db, x[1], c), body = str(b.body).slice(0, 6000), fl = files(b.files), now = Date.now();
    if (!body && !fl.length) fail(400, 'Mesaj yazın ya da görsel ekleyin');
    const mid = (await first(db, 'INSERT INTO support_messages (ticket_id, author, admin, body, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id', t.id, c.staff ? `${who} (Destek)` : who, c.staff ? 1 : 0, body, now)).id;
    await saveFiles(db, t.id, mid, fl);
    await run(db, `UPDATE support_tickets SET status = ?, updated_at = ?, unread_admin = ?, unread_user = ? WHERE id = ?`, c.staff ? 'answered' : 'open', now, c.staff ? 0 : 1, c.staff ? 1 : 0, t.id);
    if (!c.staff) await tellStaff(db, t, `${who}: ${body || '(görsel)'}`);
    return { ok: true };
  }
  if ((x = path.match(/^support\/(\d+)\/status$/)) && m === 'POST') {
    const t = await ticketOf(db, x[1], c), st = STATUS.includes(b.status) ? b.status : null;
    if (!st || (!c.staff && st === 'answered')) fail(400, 'Geçersiz durum');
    await run(db, 'UPDATE support_tickets SET status = ?, updated_at = ?, unread_user = ? WHERE id = ?', st, Date.now(), c.staff && st === 'closed' ? 1 : t.unread_user, t.id);
    return { ok: true };
  }
  fail(404, 'Bulunamadı');
}

// İstek → yanıt (Response ya da JSON)
export async function supportResponse(req, db, path, c) {
  const r = await supportApi(req, db, path, c);
  return r instanceof Response ? r : json(r);
}
