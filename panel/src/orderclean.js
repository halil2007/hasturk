// Sipariş silme ve kanalda bulunmayan siparişler.
// Silme: düşülen stok geri eklenir (satırlar silinip applyStock çalışır; yarıda kalırsa stock_dirty ile sonraki senkron tamamlar),
// sipariş ve bağlı kayıtları silinir, kimliği deleted_orders'a yazılır → kanal aynı siparişi yine gönderse de panel almaz (saveOrders atlar).
// Kanalda bulunamayan sipariş (silinmiş / deneme siparişi, kaldırılmış mağaza) missing_n ile işaretlenir; Siparişler sayfasında uyarı çıkar:
//   - kesin bilgi (kanalın tek sipariş sorgusu "yok" dedi ya da mağaza panelden kaldırılmış): açık sipariş iptal sayılır → açık listelerden çıkar, stok döner;
//   - liste karşılaştırması (diğer kanallar: eski açık siparişler kanaldan yeniden okunurken dönmeyen): yalnız işaret, iki kontrolde üst üste
//     (en az 6 saat arayla) bulunamazsa uyarı. Sipariş sonradan kanalda görünürse işaret kalkar.
import { all, run, log, getSettings } from './db.js';
import { chunk } from './util.js';
import { applyStock } from './sync.js';
import { getChannels } from './channels/index.js';

const H = 3600e3;
const marks = (a) => a.map(() => '?').join(',');

export async function deleteOrders(db, ids, user) {
  ids = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, 500);
  const t = Date.now(), done = [];
  const settings = await getSettings(db);
  for (const part of chunk(ids, 50)) {
    const rows = await all(db, `SELECT id, order_number, channel FROM orders WHERE id IN (${marks(part)})`, ...part);
    if (!rows.length) continue;
    const id = rows.map((r) => r.id), q = marks(id);
    await db.batch([db.prepare(`DELETE FROM order_items WHERE order_id IN (${q})`).bind(...id), db.prepare(`UPDATE orders SET stock_dirty = 1 WHERE id IN (${q})`).bind(...id)]);
    await applyStock(db, id, settings);
    await db.batch([
      ...rows.map((r) => db.prepare('INSERT OR REPLACE INTO deleted_orders (id, at, user, order_number) VALUES (?, ?, ?, ?)').bind(r.id, t, user || null, r.order_number || null)),
      db.prepare(`DELETE FROM packages WHERE order_id IN (${q})`).bind(...id),
      db.prepare(`DELETE FROM order_stock WHERE order_id IN (${q})`).bind(...id),
      db.prepare(`DELETE FROM order_events WHERE order_id IN (${q})`).bind(...id),
      db.prepare(`DELETE FROM mail_queue WHERE order_id IN (${q})`).bind(...id),
      db.prepare(`DELETE FROM orders WHERE id IN (${q})`).bind(...id),
    ]);
    done.push(...rows);
  }
  if (done.length) await log(db, null, 'info', `${user || 'Sistem'}: ${done.length} sipariş silindi (${done.slice(0, 5).map((r) => `${r.channel} #${r.order_number}`).join(', ')}${done.length > 5 ? '…' : ''}); stok geri eklendi`);
  return { deleted: done.length };
}

// Kanalda var mı (silme onayı için): true / false / null (bu kanalda doğrulanamıyor)
export async function orderOnChannel(env, db, o, chans) {
  chans = chans || await getChannels(env, db);
  const c = chans.find((x) => x.id === o.channel);
  if (!c) return { exists: false, why: 'Bu siparişin mağazası panelden kaldırılmış' };
  if (c.demo) return { exists: null, why: 'Örnek veri' };
  if (!c.enabled || !c.orderExists) return { exists: null, why: `${c.name} tek sipariş sorgusu desteklemiyor; kanalda olup olmadığı doğrulanamadı` };
  try { return (await c.orderExists(o.remote_id)) ? { exists: true, why: `Sipariş ${c.name}'da duruyor` } : { exists: false, why: `Sipariş ${c.name}'da bulunamadı (silinmiş ya da deneme siparişi)` }; }
  catch (e) { return { exists: null, why: `${c.name}'a sorulamadı: ${e.message}` }; }
}

// Açık siparişi "kanalda yok" diye işaretle; kesinse iptal say (açık listelerden çıkar, stok döner)
async function markMissing(db, rows, why, cancel) {
  const t = Date.now();
  for (const part of chunk(rows, 25)) {
    await db.batch(part.flatMap((o) => [
      db.prepare('UPDATE orders SET missing_n = 2, missing_why = ?, checked_at = ? WHERE id = ?').bind(why, t, o.id),
      ...(cancel ? [
        db.prepare("UPDATE orders SET status = 'cancelled', local_status = 'cancelled', stock_dirty = 1, updated_at = ? WHERE id = ? AND status IN ('new', 'processing')").bind(t, o.id),
        db.prepare("INSERT INTO order_events (order_id, at, source, action, status, note, user) VALUES (?, ?, 'panel', 'missing', 'cancelled', ?, 'Sistem')").bind(o.id, t, `${why}; iptal sayıldı (açık listelerden çıkarıldı, stok geri eklendi)`),
      ] : []),
    ]));
  }
}

// Sipariş kanalda yeniden görüldü: işaret kalkar; iptali sistem yaptıysa kanal durumu sonraki okumada geri gelir
export async function clearMissing(db, ids) {
  for (const part of chunk(ids, 80)) {
    await run(db, `UPDATE orders SET local_status = CASE WHEN missing_n >= 2 AND local_status = 'cancelled' AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = orders.id AND e.action = 'missing') THEN NULL ELSE local_status END,
      hash = CASE WHEN missing_n >= 2 THEN NULL ELSE hash END, missing_n = 0, missing_why = NULL WHERE missing_n > 0 AND id IN (${marks(part)})`, ...part);
  }
}

// Liste karşılaştırması (bkz. sync.js staleOrders): kanaldan okunan aralıktaki açık siparişlerden dönmeyenler bir kez daha bulunamazsa uyarı
export async function compareFetched(db, ch, from, to, fetched) {
  if (fetched.partialUntil != null || (fetched.warnings || []).length || !fetched.length) return 0;
  const seen = new Set(fetched.map((o) => `${ch.id}:${o.remoteId}`));
  const open = await all(db, "SELECT id, missing_n FROM orders WHERE channel = ? AND status IN ('new', 'processing') AND ordered_at >= ? AND ordered_at < ?", ch.id, from, to);
  const back = open.filter((o) => seen.has(o.id) && o.missing_n > 0).map((o) => o.id), gone = open.filter((o) => !seen.has(o.id));
  if (back.length) await clearMissing(db, back);
  const t = Date.now();
  for (const part of chunk(gone, 40)) {
    await db.batch(part.map((o) => db.prepare("UPDATE orders SET missing_n = MIN(missing_n + 1, 2), missing_why = ?, checked_at = ? WHERE id = ?")
      .bind(`${ch.name}'dan okunan siparişler arasında yok (silinmiş ya da deneme siparişi olabilir)`, t, o.id)));
  }
  return gone.filter((o) => o.missing_n >= 1).length;
}

// Senkron sonunda (6 saatte bir kanal başına sınırlı): kaldırılmış mağazaların açık siparişleri ve tek sipariş sorgusu olan kanallarda açık siparişler
export async function checkMissing(env, db, { limit = 15, chans } = {}) {
  const t = Date.now(), out = { orphan: 0, checked: 0, missing: 0 };
  chans = chans || await getChannels(env, db);
  const ids = chans.map((c) => c.id);
  const orphan = await all(db, `SELECT id FROM orders WHERE status IN ('new', 'processing') AND missing_n < 2 AND channel NOT IN (${marks(ids)}) LIMIT 200`, ...ids);
  if (orphan.length) { await markMissing(db, orphan, 'Bu siparişin mağazası panelden kaldırılmış', true); out.orphan = orphan.length; }
  const live = chans.filter((c) => c.enabled && !c.demo && c.orderExists);
  if (!live.length) return out;
  const rows = await all(db, `SELECT id, channel, remote_id, order_number, missing_n FROM orders WHERE status IN ('new', 'processing') AND channel IN (${marks(live.map((c) => c.id))})
    AND ordered_at < ? AND (checked_at IS NULL OR checked_at < ?) ORDER BY checked_at IS NOT NULL, checked_at, ordered_at LIMIT ?`, ...live.map((c) => c.id), t - H, t - 6 * H, limit);
  const gone = [], back = [];
  for (const o of rows) {
    const c = live.find((x) => x.id === o.channel);
    try {
      const ok = await c.orderExists(o.remote_id);
      out.checked++;
      if (!ok) gone.push({ ...o, why: `${c.name}'da bulunamadı (silinmiş ya da deneme siparişi)` });
      else if (o.missing_n) back.push(o.id);
    } catch { /* kanala ulaşılamadı: sonra yeniden denenir */ }
    await run(db, 'UPDATE orders SET checked_at = ? WHERE id = ?', t, o.id);
  }
  for (const o of gone) await markMissing(db, [o], o.why, true);
  if (back.length) await clearMissing(db, back);
  out.missing = gone.length;
  if (gone.length) await log(db, null, 'warn', `${gone.length} açık sipariş kanalda bulunamadı ve iptal sayıldı: ${gone.map((o) => `${o.channel} #${o.order_number}`).join(', ')} (Siparişler → "Kanalda bulunamayan" uyarısından silebilirsiniz)`);
  return out;
}
