// Ürün fotoğrafları: bilgisayardan / telefondan yüklenir, panelin kendi veritabanında saklanır (ana panel: D1, müşteri paneli: kendi
// Durable Object veritabanı; ikisi de aynı kod, `db` üzerinden). Pazaryerleri (Trendyol, Hepsiburada, ikas…) görseli adresinden indirdiği
// için fotoğraf oturumsuz, herkese açık ve değişmeyen bir adresten sunulur: https://<panel>/img/<firma kodu>/<kimlik>.jpg (ana panel: /img/_/…).
// Kimlik 128 bit rastgeledir (sırayla tahmin edilemez); içerik yalnız JPG / PNG / WEBP (ilk baytlarından denetlenir; SVG kabul edilmez).
// Tarayıcı fotoğrafı önce küçültür (en uzun kenar 1600 px, JPEG, ~400 KB altı; bkz. public/views/products.js), sunucu boyutu ayrıca denetler.
import { all, first, run, getSettings } from './db.js';
import { fail, str, chunk } from './util.js';

// Fotoğraf başına en fazla 1,2 MB: base64 içerik ~1,6 MB tutar (D1 / Durable Object satır sınırı 2 MB)
export const MAX_BYTES = 1200 * 1024;
// Ürün başına en fazla 8 fotoğraf (Trendyol ve idefix en fazla 8 görsel alır)
export const MAX_PER_PRODUCT = 8;
// Panel başına: en fazla 2.000 fotoğraf / 500 MB (demo panelinde 30 fotoğraf; demo sıfırlanınca silinir)
export const MAX_COUNT = 2000, MAX_TOTAL = 500 * 1024 * 1024, DEMO_COUNT = 30;
export const ID_RE = /^[a-f0-9]{32}$/;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Dosya imzası: uzantıya / bildirilen türe güvenilmez, içeriğin ilk baytlarına bakılır
export function sniff(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
export const imgPath = (slug, id, type = 'image/jpeg') => `/img/${slug || '_'}/${id}.${EXT[type] || 'jpg'}`;
// Bir metindeki (ürünün image / images alanı) panelde barındırılan fotoğrafların kimlikleri
const HOSTED = /\/img\/(?:_|[a-z0-9][a-z0-9-]{1,30}[a-z0-9])\/([a-f0-9]{32})\.(?:jpg|png|webp)(?![\w.])/g;
export function hostedIds(...texts) {
  const out = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(HOSTED)) out.add(m[1]);
  return out;
}
export const isHosted = (u) => hostedIds(u).size > 0;
const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');

// Fotoğraf adresinin başı: pazaryerinin erişebileceği panel adresi. Yükleme yapılan adres (https; alt alan adındaki panel-proxy.php
// üzerinden gelindiyse o alan adı), değilse Ayarlar'daki panel adresi, o da yoksa isteğin adresi (yerel geliştirme).
export async function publicOrigin(req, db) {
  const url = new URL(req.url);
  const fh = str(req.headers.get('X-Forwarded-Host')).toLowerCase();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(fh)) return 'https://' + fh;
  if (url.protocol === 'https:') return url.origin;
  const pu = str((await getSettings(db)).panel_url).replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/i.test(pu) ? pu : url.origin;
}

// Yükleme: { data: 'data:image/jpeg;base64,…', w, h }
export async function uploadImage(req, env, db, b) {
  const mm = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String((b && b.data) || ''));
  if (!mm) fail(400, 'Yalnız fotoğraf yüklenebilir (JPG, PNG ya da WEBP)');
  const b64 = mm[1], size = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (size > MAX_BYTES) fail(413, `Fotoğraf çok büyük (${(size / 1048576).toFixed(1).replace('.', ',')} MB; en fazla 1,2 MB). Daha küçük bir fotoğraf seçin.`);
  let head;
  try { head = Uint8Array.from(atob(b64.slice(0, 24)), (c) => c.charCodeAt(0)); } catch { fail(400, 'Fotoğraf okunamadı'); }
  const type = size >= 64 ? sniff(head) : null;
  if (!type) fail(400, 'Bu dosya bir fotoğraf değil (JPG, PNG ya da WEBP olmalı)');
  const max = env.DEMO === '1' ? DEMO_COUNT : MAX_COUNT;
  const u = await first(db, 'SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS s FROM product_images');
  if (u.n >= max) fail(413, `Fotoğraf sınırına ulaşıldı (panel başına en fazla ${max.toLocaleString('tr-TR')} fotoğraf). Kullanılmayan ürünlerin fotoğraflarını kaldırın.`);
  if (u.s + size > MAX_TOTAL) fail(413, 'Fotoğraf depolama alanı doldu (en fazla 500 MB). Kullanılmayan ürünlerin fotoğraflarını kaldırın.');
  const id = newId(), dim = (v) => Math.max(0, Math.min(20000, Math.round(Number(v) || 0)));
  await run(db, 'INSERT INTO product_images (id, type, size, w, h, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, type, size, dim(b.w), dim(b.h), b64, Date.now());
  return { ok: true, id, url: (await publicOrigin(req, db)) + imgPath(env.TENANT_SLUG, id, type), size, type };
}

// Ürün kaydında: elle düzenlenen görsel listesinde en fazla 8 panel fotoğrafı
export function checkProductImages(list) {
  const n = hostedIds(...(list || [])).size;
  if (n > MAX_PER_PRODUCT) fail(400, `Bir ürüne en fazla ${MAX_PER_PRODUCT} fotoğraf eklenebilir (${n} fotoğraf seçildi). Fazlasını kaldırın.`);
}
// Üründen çıkarılan fotoğraflar: başka hiçbir ürün kullanmıyorsa silinir
export async function dropUnused(db, ids) {
  let n = 0;
  for (const id of ids) {
    if (!ID_RE.test(id)) continue;
    const used = await first(db, 'SELECT 1 AS x FROM products WHERE image LIKE ? OR images LIKE ? LIMIT 1', `%${id}%`, `%${id}%`);
    if (!used) n += ((await run(db, 'DELETE FROM product_images WHERE id = ?', id)).meta || {}).changes || 0;
  }
  return n;
}
// Günlük bakım: hiçbir üründe kullanılmayan, 1 günden eski fotoğraflar (yüklenip kaydedilmeyen, silinen ürünlerinki) silinir
export async function cleanupImages(db, now = Date.now()) {
  const cand = await all(db, 'SELECT id FROM product_images WHERE created_at < ?', now - 864e5);
  if (!cand.length) return 0;
  const rows = await all(db, "SELECT image, images FROM products WHERE image LIKE '%/img/%' OR images LIKE '%/img/%'");
  const used = hostedIds(...rows.flatMap((r) => [r.image, r.images]));
  const drop = cand.map((r) => r.id).filter((id) => !used.has(id));
  for (const part of chunk(drop, 90)) await run(db, `DELETE FROM product_images WHERE id IN (${part.map(() => '?').join(',')})`, ...part);
  return drop.length;
}

// Herkese açık sunum (oturumsuz): yalnız görsel türleri, değişmez içerik (1 yıl önbellek), ETag, içinde betik çalışmaz
export async function serveImage(db, req, id) {
  const miss = (status, msg) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (!ID_RE.test(String(id || ''))) return miss(404, 'Fotoğraf yok');
  const head = req.method === 'HEAD';
  const im = await first(db, `SELECT type, size${head ? '' : ', data'} FROM product_images WHERE id = ?`, id);
  if (!im || !EXT[im.type]) return miss(404, 'Fotoğraf yok');
  const etag = `"${id}"`;
  const h = { 'Content-Type': im.type, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag, 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Disposition': `inline; filename="${id}.${EXT[im.type]}"` };
  const inm = req.headers.get('If-None-Match') || '';
  if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag || t.trim() === '*')) return new Response(null, { status: 304, headers: h });
  if (head) return new Response(null, { headers: { ...h, 'Content-Length': String(im.size) } });
  return new Response(Uint8Array.from(atob(im.data), (c) => c.charCodeAt(0)), { headers: h });
}
