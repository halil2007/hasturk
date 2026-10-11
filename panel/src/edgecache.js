// Kenar önbelleği: az trafikte Worker örnekleri sık sık soğuk başlar ve bellekteki önbellek boş olur. Her istekte gereken küçük
// kayıtlar (giriş koruması ayarı, müşteri paneli kaydı) o zaman veritabanına gitmek yerine Cloudflare'in aynı veri merkezindeki
// önbelleğinden okunur (milisaniye). Süre dolunca veritabanından tazelenir; boş sonuç (kayıt yok) saklanmaz.
// Bellek kopyası veritabanı bağlantısına bağlı (aynı örnekte farklı veritabanları karışmasın; testlerde her test kendi veritabanıyla)
const mems = new WeakMap(), none = {};
const memOf = (scope) => { const k = scope && typeof scope === 'object' ? scope : none; let m = mems.get(k); if (!m) mems.set(k, (m = new Map())); return m; };
const store = () => (typeof caches !== 'undefined' && caches.default ? caches.default : null);
const keyOf = (k) => 'https://cache.internal/edge/' + encodeURIComponent(k);
export async function edgeCached(key, ttl, load, scope) {
  const mem = memOf(scope), now = Date.now(), m = mem.get(key);
  if (m && now - m.at < ttl) return m.v;
  const c = store();
  if (c) {
    try {
      const hit = await c.match(keyOf(key));
      if (hit) { const x = await hit.json(); if (x && now - x.at < ttl) { mem.set(key, x); return x.v; } }
    } catch { /* önbellek okunamadı: veritabanından */ }
  }
  const v = await load();
  const x = { at: Date.now(), v };
  if (v == null) { mem.delete(key); return v; }
  mem.set(key, x);
  if (mem.size > 500) mem.delete(mem.keys().next().value);
  if (c) await c.put(keyOf(key), new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${Math.ceil(ttl / 1000)}` } })).catch(() => {});
  return v;
}
// Kayıt değişti: bu örneğin belleğinden ve bu veri merkezinin önbelleğinden silinir (diğer veri merkezlerinde süre dolunca yenilenir)
export async function edgeDrop(key, scope) {
  memOf(scope).delete(key);
  const c = store();
  if (c) await c.delete(keyOf(key)).catch(() => {});
}
