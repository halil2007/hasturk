// Kanal başına ürün kapsamı: pazaryerine "tüm ürünler" (varsayılan: seçilen kategorilerdeki ürünler) ya da "yalnız seçtiğim ürünler"
// gider. Seçim ürün + kanal başına tutulur (product_targets). Yalnız YENİ ilan açmayı etkiler (otomatik gönderim, Kanallarda yayınla
// ön seçimi); kanalda zaten olan ilanın stok / fiyat güncellemesi değişmez.
import { all, allIn, run } from './db.js';
import { chunk, str } from './util.js';

export const scopeOf = (settings, ch) => ((settings && settings.upload_scope) || {})[ch] === 'selected' ? 'selected' : 'all';

// Kanal için seçilmiş, kanalda henüz ilanı olmayan ve sonucu beklenmeyen ürünler (otomatik gönderim adayları)
export async function pendingPicks(db, ch, limit = 300) {
  return (await all(db, `SELECT t.product_id AS id FROM product_targets t WHERE t.channel = ?
      AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.product_id = t.product_id AND l.channel = t.channel)
      AND NOT EXISTS (SELECT 1 FROM product_channel pc WHERE pc.product_id = t.product_id AND pc.channel = t.channel AND pc.state IN ('sent', 'live'))
    ORDER BY t.at, t.product_id LIMIT ?`, ch, limit)).map((r) => r.id);
}
// Ürün → seçili kanallar
export async function targetsOf(db, ids) {
  const out = {};
  for (const r of await allIn(db, ids, (ph, part) => [`SELECT product_id, channel FROM product_targets WHERE product_id IN (${ph})`, part])) (out[r.product_id] = out[r.product_id] || []).push(r.channel);
  return out;
}
// Kanal başına seçili ürün sayısı (silinmiş / pasif ürünler sayılmaz)
export async function pickCounts(db) {
  return Object.fromEntries((await all(db, 'SELECT t.channel, COUNT(*) AS n FROM product_targets t JOIN products p ON p.id = t.product_id WHERE p.active = 1 GROUP BY t.channel')).map((r) => [r.channel, r.n]));
}
// Seç / kaldır (varyantlar ayrı ürün: seçilen her kimlik ayrı kaydedilir)
export async function setTargets(db, ids, channels, on) {
  const chs = [...new Set(channels.map(str).filter(Boolean))];
  if (!ids.length || !chs.length) return 0;
  let changed = 0;
  const t = Date.now();
  for (const ch of chs) {
    for (const part of chunk(ids, 90)) {
      const q = part.map(() => '?').join(',');
      const r = on
        ? await run(db, `INSERT OR IGNORE INTO product_targets (product_id, channel, at) SELECT id, ?, ? FROM products WHERE id IN (${q})`, ch, t, ...part)
        : await run(db, `DELETE FROM product_targets WHERE channel = ? AND product_id IN (${q})`, ch, ...part);
      changed += ((r && r.meta) || {}).changes || 0;
    }
  }
  return changed;
}
