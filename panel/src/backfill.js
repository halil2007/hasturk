// Geçmiş sipariş aktarımı: seçilen tarih aralığı kanal başına parça parça (7 günlük dilimler, yeniden geriye) çekilir.
// İş veritabanında saklanır; her senkronda ve "Devam et" ile ilerler, kesilirse kaldığı yerden sürer.
// Geçmiş siparişler stoğu değiştirmez (stok takibi başladığı andan önceki siparişler sadece kaydedilir).
import { all, first, run, log, notify, resolve } from './db.js';
import { getChannels } from './channels/index.js';
import { saveOrders, applyStock } from './sync.js';

const D = 864e5, STEP = 7 * D;

export async function createJob(db, channel, fromMs, toMs) {
  const t = Date.now();
  await run(db, `INSERT INTO jobs (id, channel, from_ms, to_ms, cursor_ms, status, done, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'running', 0, NULL, ?, ?)
    ON CONFLICT (id) DO UPDATE SET from_ms = excluded.from_ms, to_ms = excluded.to_ms, cursor_ms = excluded.cursor_ms, status = 'running', done = 0, error = NULL, updated_at = excluded.updated_at`,
  'backfill:' + channel, channel, fromMs, toMs, toMs, t, t);
}
export const listJobs = (db) => all(db, "SELECT * FROM jobs ORDER BY created_at DESC");
export const cancelJob = (db, id) => run(db, "UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?", Date.now(), id);

export async function runJobs(env, db, { budgetMs = 20000 } = {}) {
  const start = Date.now();
  const jobs = await all(db, "SELECT * FROM jobs WHERE status = 'running' ORDER BY created_at");
  if (!jobs.length) return null;
  const chans = await getChannels(env, db), out = {};
  for (const j of jobs) {
    const ch = chans.find((c) => c.id === j.channel);
    if (!ch || !ch.enabled) { out[j.channel] = 'kanal bağlı değil'; continue; }
    let cursor = j.cursor_ms, done = j.done;
    while (cursor > j.from_ms && Date.now() - start < budgetMs) {
      const from = Math.max(j.from_ms, cursor - STEP);
      try {
        const orders = await ch.fetchOrders(from, cursor, { byOrdered: true });
        const ids = await saveOrders(db, ch.id, orders.filter((o) => o.orderedAt >= j.from_ms - D));
        await applyStock(db, ids);
        done += orders.length;
        cursor = from;
        await run(db, 'UPDATE jobs SET cursor_ms = ?, done = ?, error = NULL, updated_at = ? WHERE id = ?', cursor, done, Date.now(), j.id);
      } catch (e) {
        await run(db, 'UPDATE jobs SET error = ?, updated_at = ? WHERE id = ?', e.message.slice(0, 400), Date.now(), j.id);
        await log(db, ch.id, 'error', 'Geçmiş sipariş aktarımı: ' + e.message);
        await notify(db, `backfill:${ch.id}`, { channel: ch.id, title: `${ch.name}: geçmiş sipariş aktarımı durdu`, msg: e.message + ' (bir sonraki senkronda yeniden denenecek)' });
        break;
      }
    }
    if (cursor <= j.from_ms) {
      await run(db, "UPDATE jobs SET status = 'done', cursor_ms = from_ms, updated_at = ? WHERE id = ?", Date.now(), j.id);
      await resolve(db, `backfill:${ch.id}`);
      await log(db, ch.id, 'info', `Geçmiş sipariş aktarımı tamamlandı: ${done} sipariş`);
    }
    out[j.channel] = { done, left: Math.max(0, Math.ceil((cursor - j.from_ms) / D)) };
  }
  return out;
}
