// İade talepleri: pazaryerlerindeki iade taleplerini (müşterinin iade isteği, kargoyla gelen ürün) her senkronda çeker,
// panelde listeler; satıcı panelden onaylar ya da gerekçesiyle reddeder. Kanalda verilen kararlar da senkronla görünür.
// Kanal arayüzü: claims({ since, until, page, size }) → { items, hasNext }, claimReasons(), approveClaim(c, lines), rejectClaim(c, lines, { reasonId, text, file })
import { all, first, run, log, notify, resolve } from './db.js';
import { getChannels } from './channels/index.js';
import { chunk, str } from './util.js';

export const CLAIM_STATUS = ['waiting', 'accepted', 'rejected', 'other'];
const parse = (v, d) => { try { return JSON.parse(v || ''); } catch { return d; } };

export async function syncClaims(env, db, { only } = {}) {
  const out = {};
  for (const ch of await getChannels(env, db)) {
    if (!ch.enabled || !ch.claims || (only && !only.includes(ch.id))) continue;
    try {
      const last = (await first(db, 'SELECT MAX(synced_at) AS t FROM claims WHERE channel = ?', ch.id)).t;
      // İlk senkronda son 30 gün, sonra son 10 gün (kararı kanalda verilen / otomatik onaylanan talepleri güncellemek için)
      const since = Date.now() - (last ? 10 : 30) * 864e5, items = [];
      for (let page = 0; page < 20; page++) {
        const r = await ch.claims({ since, until: Date.now(), page, size: 50 });
        items.push(...r.items);
        if (!r.hasNext || !r.items.length) break;
      }
      await save(db, ch.id, items);
      out[ch.id] = items.length;
      await resolve(db, `claims:${ch.id}`);
    } catch (e) {
      out[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'İade talepleri alınamadı: ' + e.message);
      await notify(db, `claims:${ch.id}`, { level: 'warn', channel: ch.id, title: `${ch.name}: iade talepleri alınamadı`, msg: e.message });
    }
  }
  return out;
}

export async function save(db, channel, items) {
  const t = Date.now();
  for (const part of chunk(items, 40)) {
    await db.batch(part.map((c) => db.prepare(`INSERT INTO claims (channel, remote_id, order_number, order_id, claimed_at, status, remote_status, customer, reason, note, lines, amount, cargo, tracking, synced_at)
      VALUES (?, ?, ?, (SELECT id FROM orders WHERE channel = ? AND order_number = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (channel, remote_id) DO UPDATE SET status = CASE WHEN claims.decided_by IS NOT NULL AND excluded.status = 'waiting' THEN claims.status ELSE excluded.status END,
        remote_status = excluded.remote_status, lines = CASE WHEN claims.decided_by IS NOT NULL AND excluded.status = 'waiting' THEN claims.lines ELSE excluded.lines END, amount = excluded.amount, cargo = excluded.cargo, tracking = excluded.tracking, reason = excluded.reason, note = excluded.note,
        order_id = COALESCE(claims.order_id, excluded.order_id), synced_at = excluded.synced_at`)
      .bind(channel, String(c.remoteId), str(c.orderNumber), channel, str(c.orderNumber), c.claimedAt || t, CLAIM_STATUS.includes(c.status) ? c.status : 'other', str(c.remoteStatus),
        str(c.customer), str(c.reason), str(c.note), JSON.stringify(c.lines || []), Number(c.amount) || 0, str(c.cargo), str(c.tracking), t)));
  }
}

export async function listClaims(db, q = {}) {
  const where = [], args = [];
  if (q.channel) { where.push('c.channel = ?'); args.push(q.channel); }
  if (CLAIM_STATUS.includes(q.status)) { where.push('c.status = ?'); args.push(q.status); }
  if (q.q) { const s = '%' + q.q + '%'; where.push('(c.order_number LIKE ? OR c.customer LIKE ? OR c.lines LIKE ? OR c.reason LIKE ?)'); args.push(s, s, s, s); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 30, 100), page = Math.max(1, Number(q.page) || 1);
  const rows = await all(db, `SELECT c.* FROM claims c ${w} ORDER BY CASE c.status WHEN 'waiting' THEN 0 ELSE 1 END, c.claimed_at DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = (await first(db, `SELECT COUNT(*) AS n FROM claims c ${w}`, ...args)).n;
  const counts = Object.fromEntries((await all(db, `SELECT status, COUNT(*) AS n FROM claims ${q.channel ? 'WHERE channel = ?' : ''} GROUP BY status`, ...(q.channel ? [q.channel] : []))).map((r) => [r.status, r.n]));
  // Ürün görseli: eşleşmiş panel ürününden
  for (const r of rows) {
    r.lines = parse(r.lines, []);
    for (const l of r.lines) if (!l.image && (l.barcode || l.sku)) {
      const p = await first(db, `SELECT COALESCE(NULLIF(l.image, ''), p.image) AS image FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE l.channel = ? AND (l.barcode = ? OR l.sku = ?) LIMIT 1`, r.channel, l.barcode || '-', l.sku || '-');
      if (p) l.image = p.image;
    }
  }
  return { rows, total, counts };
}

async function claimOf(env, db, channel, id) {
  const ch = (await getChannels(env, db)).find((c) => c.id === channel);
  if (!ch || !ch.enabled || !ch.approveClaim) throw new Error('Bu kanal panelden iade onaylamayı desteklemiyor');
  const c = await first(db, 'SELECT * FROM claims WHERE channel = ? AND remote_id = ?', channel, String(id));
  if (!c) throw new Error('İade talebi bulunamadı');
  if (c.status !== 'waiting') throw new Error('Bu iade talebi için karar verilmiş');
  return { ch, c: { ...c, lines: parse(c.lines, []) } };
}
const pickLines = (c, ids) => {
  const open = c.lines.filter((l) => l.status === 'waiting' || !l.status);
  const sel = ids && ids.length ? open.filter((l) => ids.includes(String(l.id))) : open;
  if (!sel.length) throw new Error('Karar bekleyen ürün satırı yok');
  return sel;
};

export async function approveClaim(env, db, channel, id, lineIds, user) {
  const { ch, c } = await claimOf(env, db, channel, id);
  const lines = pickLines(c, lineIds);
  try { await ch.approveClaim(c, lines); }
  catch (e) { await run(db, 'UPDATE claims SET error = ? WHERE channel = ? AND remote_id = ?', e.message.slice(0, 400), channel, String(id)); throw e; }
  await decide(db, c, lines, 'accepted', user, '');
  await log(db, channel, 'info', `${user.name}: iade onaylandı · sipariş ${c.order_number} (${lines.length} ürün)`);
  return { ok: true };
}

export async function rejectClaim(env, db, channel, id, { lineIds, reasonId, reason, text, file }, user) {
  const { ch, c } = await claimOf(env, db, channel, id);
  if (!ch.rejectClaim) throw new Error('Bu kanal panelden iade reddetmeyi desteklemiyor');
  if (!str(reasonId)) throw new Error('Ret gerekçesi seçin');
  const t = str(text).trim();
  if (t.length < 5) throw new Error('Ret açıklaması en az 5 karakter olmalı');
  const lines = pickLines(c, lineIds);
  try { await ch.rejectClaim(c, lines, { reasonId: str(reasonId), text: t, file }); }
  catch (e) { await run(db, 'UPDATE claims SET error = ? WHERE channel = ? AND remote_id = ?', e.message.slice(0, 400), channel, String(id)); throw e; }
  await decide(db, c, lines, 'rejected', user, `${reason || reasonId}: ${t}`);
  await log(db, channel, 'info', `${user.name}: iade reddedildi · sipariş ${c.order_number} · ${reason || reasonId}`);
  return { ok: true };
}

async function decide(db, c, lines, status, user, note) {
  const ids = new Set(lines.map((l) => String(l.id)));
  const next = c.lines.map((l) => (ids.has(String(l.id)) ? { ...l, status } : l));
  const all = next.every((l) => l.status && l.status !== 'waiting');
  await run(db, 'UPDATE claims SET lines = ?, status = ?, decided_at = ?, decided_by = ?, decision_note = ?, error = NULL WHERE channel = ? AND remote_id = ?',
    JSON.stringify(next), all ? (next.every((l) => l.status === 'accepted') ? 'accepted' : next.some((l) => l.status === 'rejected') ? 'rejected' : 'other') : 'waiting',
    Date.now(), user.name, note || null, c.channel, c.remote_id);
}

export async function claimReasons(env, db, channel) {
  const ch = (await getChannels(env, db)).find((c) => c.id === channel);
  if (!ch || !ch.claimReasons) return [];
  return ch.claimReasons();
}
