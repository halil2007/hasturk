// Geçmiş sipariş aktarımı: seçilen tarih aralığı kanal başına parça parça (7 günlük dilimler, yeniden geriye) çekilir.
// İş veritabanında saklanır; her senkronda ve "Devam et" ile ilerler, kesilirse kaldığı yerden sürer.
// Geçmiş siparişler stoğu değiştirmez (stok takibi başladığı andan önceki siparişler sadece kaydedilir).
import { all, first, run, log, notify, resolve, getRaw, setSetting } from './db.js';
import { getChannels } from './channels/index.js';
import { saveOrders, applyStock, productMaps } from './sync.js';

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
  // Ürün eşleştirme haritası (tüm ürünler + ilanlar) çalıştırma başına bir kez: haftalık her dilimde yeniden okunması 20k ürün /
  // 60k ilanlı mağazada sürenin yarısını alıyordu
  let maps = null;
  for (const j of jobs) {
    const ch = chans.find((c) => c.id === j.channel);
    if (!ch || !ch.enabled) {
      // Kanal kaldırıldı / 7 gündür kapalı: iş kapatılır ("çalışıyor" görünüp sonsuza kadar beklemesin)
      if (Date.now() - (j.updated_at || j.created_at || 0) > 7 * D) await run(db, "UPDATE jobs SET status = 'cancelled', error = 'kanal bağlı değil', updated_at = ? WHERE id = ?", Date.now(), j.id);
      out[j.channel] = 'kanal bağlı değil'; continue;
    }
    let cursor = j.cursor_ms, done = j.done;
    while (cursor > j.from_ms && Date.now() - start < budgetMs) {
      const from = Math.max(j.from_ms, cursor - STEP);
      try {
        const orders = await ch.fetchOrders(from, cursor, { byOrdered: true });
        const ids = await saveOrders(db, ch.id, orders.filter((o) => o.orderedAt >= j.from_ms - D), maps || (maps = await productMaps(db)));
        await applyStock(db, ids);
        done += orders.length;
        cursor = from;
        if (orders.partialUntil != null || (orders.warnings && orders.warnings.length)) await log(db, ch.id, 'warn', `Geçmiş sipariş aktarımı (${new Date(from).toISOString().slice(0, 10)}): ${(orders.warnings || ['dilim kısmen okundu']).join(' · ').slice(0, 300)}`);
        await run(db, 'UPDATE jobs SET cursor_ms = ?, done = ?, error = NULL, updated_at = ? WHERE id = ?', cursor, done, Date.now(), j.id);
        await run(db, "DELETE FROM settings WHERE k = ?", 'bf_fails:' + j.id);
      } catch (e) {
        if (e.budget) break; // istek sınırı: bu senkronda bu kadar, hata sayılmaz
        await run(db, 'UPDATE jobs SET error = ?, updated_at = ? WHERE id = ?', e.message.slice(0, 400), Date.now(), j.id);
        // Aynı dilim art arda 20 kez (≈ 5 saat) okunamazsa iş durur: her senkronda boşuna denenmez, kullanıcı yeniden başlatabilir
        const fails = ((await getRaw(db, 'bf_fails:' + j.id)) || 0) + 1;
        await setSetting(db, 'bf_fails:' + j.id, fails);
        if (fails >= 20) await run(db, "UPDATE jobs SET status = 'error', updated_at = ? WHERE id = ?", Date.now(), j.id);
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
