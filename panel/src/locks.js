// Kısa süreli kayıt kilidi (sipariş, iade talebi, soru …): aynı kayıtta aynı anda tek işlem. Çift tıklama / iki kullanıcı aynı anda
// basınca kanala ya da kargo firmasına iki istek gitmesin (iki ücretli gönderi, iki cevap, iki onay). Kilit veritabanındadır:
// ana panelde farklı Worker örnekleri arasında da geçerlidir. İşlem yarıda düşerse kilit süre sonunda (varsayılan 2 dk) kendiliğinden açılır.
import { first, run } from './db.js';
import { fail } from './util.js';

export const BUSY = 'Bu kayıtta başka bir işlem sürüyor (çift tıklama ya da başka bir kullanıcı). Birkaç saniye sonra sayfayı yenileyip tekrar deneyin.';

// wait: kilit doluysa en fazla bu kadar ms beklenir (kısa işler: sıradaki istek öncekinin sonucunu görür, ör. SKU zaten kullanılıyor)
export async function exclusive(db, key, fn, { ttl = 120e3, busy = BUSY, wait = 0 } = {}) {
  const k = 'lock:' + key, until = Date.now() + wait;
  let t, v;
  for (;;) {
    t = Date.now(); v = JSON.stringify(t);
    const got = await first(db, `INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v
      WHERE COALESCE(CAST(settings.v AS INTEGER), 0) < ? RETURNING v`, k, v, t - ttl);
    if (got) break;
    if (Date.now() >= until) fail(409, busy);
    await new Promise((r) => setTimeout(r, 40));
  }
  try { return await fn(); } finally { await run(db, 'DELETE FROM settings WHERE k = ? AND v = ?', k, v).catch(() => {}); }
}
