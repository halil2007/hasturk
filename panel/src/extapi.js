// Dış API (stok aktarımı): yalnız ana panelin yetkilendirdiği müşteri panelleri için. Firmanın dış sistemi (ERP, kendi sitesi,
// muhasebe programı …) kendi mağazasının ürün ve stoklarını okur; başka mağazaya erişemez. Yazma (satış bildirimi) yalnız
// "satış bildirebilir" izni açık anahtarla: izin anahtar başınadır, yeni anahtarlarda kapalı başlar (açılmadıkça anahtar yalnız okur).
// Eski anahtar uyumu: izin alanı hiç tanımlanmamış (izin eklenmeden önce oluşturulmuş) anahtar, o anahtarla daha önce en az bir satış
// bildirilmişse satış bildirmeye devam eder (denetim mağazanın kendi veritabanında, iç işlemcide); ilk başarılı satışta izin kalıcı
// olarak açık kaydedilir (arayüzde de açık görünür). Hiç satış bildirmemiş eski anahtar yalnız okur; izin açıkça kapatıldıysa her zaman.
// İsteğe bağlı günlük adet sınırı (day_limit) anahtar başınadır; boş / 0 = sınırsız (asıl koruma stok kontrolü: stoktan fazlası satılamaz).
//  - Anahtar ana panelde (Firmalar → firma → Dış API; ana panelin kendi ürünleri için Ayarlar → Stok API) üretilir; yalnız bir kez
//    gösterilir, veritabanında özeti saklanır. Satış izni de orada açılıp kapanır.
//  - Anahtar firma koduna bağlıdır: hst_<firma-kodu>_<gizli> → yalnız o firmanın paneline yönlendirilir.
//  - Firmanın kendi yöneticisi açamaz / kapatamaz / anahtar üretemez. İsteğe bağlı IP kısıtı. Dakikada 120 istek.
// Uç noktalar (başlık: Authorization: Bearer <anahtar>):
//   GET  /api/v1/ping                bağlantı testi
//   GET  /api/v1/stock               ürünler ve stoklar (sayfalı): page, limit (en fazla 1000), updated_since, sku, barcode, include_inactive
//   POST /api/v1/sales               dış sistemde satılan ürün: stok düşer, tüm kanallara gider (sipariş panele düşmez; bayi kendisi gönderir).
//                                    Yalnız satış izni olan anahtar; stok yetmezse, stok senkronu kapalıyken siteden aynalanan üründe
//                                    ya da anahtarın (varsa) günlük adet sınırı aşılınca reddedilir (hiçbir stok düşmez)
//   POST /api/v1/sales/{ref}/cancel  satış iptal / iade: stok geri gelir (satış izni gerekir)
//   GET  /api/v1/sales/{ref}         bildirilen satışın durumu
import { first, all, run, init, getRaw, setSetting, getSettings } from './db.js';
import { json, str, fail } from './util.js';

const enc = new TextEncoder();
const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const apiOf = (t) => { try { const a = JSON.parse((t && t.api) || 'null'); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };
// Ana panele gösterilen durum (anahtar özeti hariç)
export const apiPublic = (t) => { const a = apiOf(t); return { on: !!a.on, write: !!a.write, day_limit: dayLimit(a.day_limit) || null, hasKey: !!a.hash, hint: a.hint || '', ips: a.ips || [], created_at: a.created_at || null, last_at: a.last_at || null, last_ip: a.last_ip || '', calls: a.calls || 0 }; };

// Günlük satış adedi sınırı (anahtar başına, isteğe bağlı): boş / 0 = sınırsız
const dayLimit = (v) => { const x = Number(v); return Number.isInteger(x) && x > 0 ? x : 0; };
export function parseDayLimit(v) {
  if (v === '' || v == null || v === false) return 0;
  const t = String(v).trim(), x = Number(/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t); // 5.000 yazımı da kabul
  if (!Number.isInteger(x) || x < 0 || x > 1e9) fail(400, 'Günlük satış sınırı tam sayı olmalı (boş ya da 0 = sınırsız)');
  return x;
}

export async function newKey(slug) {
  const r = crypto.getRandomValues(new Uint8Array(32));
  const secret = [...r].map((b) => B62[b % 62]).join('');
  const key = `hst_${slug}_${secret}`;
  return { key, hash: await hex(key), hint: `hst_${slug}_…${secret.slice(-4)}` };
}

// IP kısıtı: tam adres (IPv4 / IPv6) ya da IPv4 aralığı (ör. 85.105.10.0/24)
export function parseIps(v) {
  const list = (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
  const bad = list.filter((x) => !/^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12]\d|3[0-2]))?$/.test(x) && !/^[0-9a-f:]+$/i.test(x));
  if (bad.length) throw Object.assign(new Error(`Geçersiz IP: ${bad.join(', ')}`), { status: 400 });
  return [...new Set(list)].slice(0, 30);
}
const v4 = (ip) => ip.split('.').reduce((a, x) => (a << 8) + (Number(x) & 255), 0) >>> 0;
export function ipAllowed(ip, list) {
  if (!list || !list.length) return true;
  ip = String(ip || '').trim();
  return list.some((r) => {
    if (!r.includes('/')) return r.toLowerCase() === ip.toLowerCase();
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
    const [net, bits] = r.split('/'), mask = Number(bits) ? (~0 << (32 - Number(bits))) >>> 0 : 0;
    return ((v4(ip) & mask) >>> 0) === ((v4(net) & mask) >>> 0);
  });
}

const err = (status, error, code) => json({ error, code }, status, { 'Cache-Control': 'no-store' });
const seen = new Map(); // kullanım kaydı: firma başına dakikada en fazla bir yazma

// ---------- ana panelin kendi mağazası: birden çok anahtar (ör. her bayi / dış sistem için ayrı) ----------
// Anahtar biçimi hsm_<kimlik>_<gizli>; ayarlarda (extapi_keys) yalnız özeti tutulur. Yalnız ana panel yöneticisi yönetir.
const MAIN_KEY = /^hsm_([a-z0-9]{8})_[A-Za-z0-9]{32}$/;
const keysPublic = (list) => (list || []).map((k) => ({ id: k.id, name: k.name, hint: k.hint, on: !!k.on, write: !!k.write, day_limit: dayLimit(k.day_limit) || null, ips: k.ips || [], created_at: k.created_at, created_by: k.created_by || '', last_at: k.last_at || null, last_ip: k.last_ip || '', calls: k.calls || 0 }));
export async function mainKeysApi(db, path, method, b, user) {
  const list = (await getRaw(db, 'extapi_keys')) || [];
  const save = (l) => setSetting(db, 'extapi_keys', l);
  if (path === 'extapi' && method === 'GET') return { keys: keysPublic(list) };
  if (path === 'extapi' && method === 'POST') {
    const name = str(b.name).trim().slice(0, 80);
    if (!name) fail(400, 'Anahtara bir ad verin (ör. bayinin adı)');
    if (list.length >= 20) fail(400, 'En fazla 20 anahtar');
    const id = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
    const secret = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => B62[x % 62]).join('');
    const key = `hsm_${id}_${secret}`;
    let ips = [];
    try { ips = parseIps(b.ips); } catch (e) { fail(400, e.message); }
    const day_limit = parseDayLimit(b.day_limit);
    list.push({ id, name, hash: await hex(key), hint: `hsm_${id}_…${secret.slice(-4)}`, on: true, write: b.write === true, day_limit, ips, created_at: Date.now(), created_by: (user && user.name) || '' });
    await save(list);
    return { ok: true, key, keys: keysPublic(list) };
  }
  const m = /^extapi\/([a-z0-9]{8})$/.exec(path);
  if (m) {
    const k = list.find((x) => x.id === m[1]);
    if (!k) fail(404, 'Anahtar bulunamadı');
    if (method === 'DELETE') { await save(list.filter((x) => x !== k)); return { ok: true, keys: keysPublic(list.filter((x) => x !== k)) }; }
    if (method === 'PUT') {
      if (b.name !== undefined) k.name = str(b.name).trim().slice(0, 80) || k.name;
      if (b.on !== undefined) k.on = !!b.on;
      // Satış bildirme (yazma) izni: kapalıyken anahtar yalnız okur
      if (b.write !== undefined) k.write = b.write === true;
      // Günlük satış adedi sınırı: boş / 0 = sınırsız
      if (b.day_limit !== undefined) k.day_limit = parseDayLimit(b.day_limit);
      if (b.ips !== undefined) { try { k.ips = parseIps(b.ips); } catch (e) { fail(400, e.message); } }
      await save(list);
      return { ok: true, keys: keysPublic(list) };
    }
  }
  fail(404, 'Bulunamadı');
}

// POST gövdesi (satış bildirimi; JSON) en fazla 256 KB: Content-Length büyükse hiç okunmaz, yoksa okurken sınır aşılınca kesilir
export const MAX_BODY = 256 * 1024;
async function readBody(req) {
  const cl = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(cl) && cl > MAX_BODY) return { res: err(413, 'Gövde en fazla 256 KB olabilir', 'body') };
  let raw = '';
  if (req.body) {
    const rd = req.body.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BODY) { rd.cancel().catch(() => {}); return { res: err(413, 'Gövde en fazla 256 KB olabilir', 'body') }; }
      parts.push(value);
    }
    raw = await new Blob(parts).text();
  }
  try { JSON.parse(raw || 'null'); } catch { return { res: err(400, 'Gövde geçerli JSON olmalı', 'body') }; }
  return { raw };
}
// Dış katmanın iç işlemciye ilettiği kurallar (firma panelinde URL parametresiyle; istemcinin gönderdiği aynı adlı parametre silinir)
const FLAG_LEGACY = '_x_legacy', FLAG_DAY = '_x_day';
const innerUrl = (base, path, search, flags) => {
  const u = new URL(base + path.replace(/^v1\/?/, '') + search);
  u.searchParams.delete(FLAG_LEGACY); u.searchParams.delete(FLAG_DAY);
  if (flags) { if (flags.legacy) u.searchParams.set(FLAG_LEGACY, '1'); if (flags.day_limit) u.searchParams.set(FLAG_DAY, String(flags.day_limit)); }
  return u;
};
const READONLY = 'Bu API anahtarı yalnız stok okuma içindir; satış bildirme izni yok. Mağaza yetkilisinden bu anahtara "satış bildirebilsin" iznini açmasını isteyin.';

// Worker: anahtarı doğrula, firmanın paneline yönlendir. getTenant / forward tenants.js'ten verilir (döngüsel içe aktarmayı önlemek için).
// Sıra: anahtar → durum / IP → yazma izni → gövde (kimliği doğrulanmamış istekte gövde okunmaz)
export async function extApi(req, env, ctx, path, { getTenant, forward, expired, mainInner = (e, u, s, k, o) => extApiInner(e.DB, u, s, k, { ...o, env: e, body: o && o.raw ? JSON.parse(o.raw) : null }) }) {
  if (!['GET', 'POST'].includes(req.method)) return err(405, 'Yalnız GET ve POST desteklenir', 'method');
  const post = req.method === 'POST';
  const auth = req.headers.get('Authorization') || '', key = ((/^Bearer\s+(.+)$/i.exec(auth) || [])[1] || req.headers.get('X-Api-Key') || '').trim();
  // Ana panelin kendi mağazası (hsm_ anahtarı): ürünler ana veritabanından
  const mk = MAIN_KEY.exec(key);
  if (mk && env.DB) {
    await init(env.DB);
    const list = (await getRaw(env.DB, 'extapi_keys')) || [];
    const k = list.find((x) => x.id === mk[1]);
    if (!k || !same(await hex(key), k.hash)) return err(401, 'API anahtarı eksik ya da geçersiz', 'auth');
    if (!k.on) return err(403, 'Bu API anahtarı kapalı', 'disabled');
    const ip = req.headers.get('CF-Connecting-IP') || '';
    if (!ipAllowed(ip, k.ips)) return err(403, `Bu IP adresine izin verilmemiş (${ip || 'bilinmiyor'})`, 'ip');
    // Satış izni: açıkça kapalıysa reddedilir; hiç tanımlanmamışsa (eski anahtar) iç işlemci önceki satışlara bakar
    if (post && k.write !== true && k.write != null) return err(403, READONLY, 'readonly');
    const legacy = post && k.write == null;
    let raw = null;
    if (post) { const b = await readBody(req); if (b.res) return b.res; raw = b.raw; }
    const s = seen.get('main:' + k.id) || { n: 0, at: 0 };
    s.n++;
    if (Date.now() - s.at > 60e3) {
      const n = s.n; s.n = 0; s.at = Date.now();
      ctx.waitUntil((async () => { const l = (await getRaw(env.DB, 'extapi_keys')) || []; const x = l.find((y) => y.id === k.id); if (x) { x.last_at = Date.now(); x.last_ip = ip; x.calls = (x.calls || 0) + n; await setSetting(env.DB, 'extapi_keys', l); } })().catch(() => {}));
    }
    seen.set('main:' + k.id, s);
    const st = await getSettings(env.DB);
    const url = new URL(req.url);
    // Ürünler ana panelin kendi veritabanından (nesnede, bkz. mainpanel.js)
    const res = await mainInner(env, innerUrl('https://main.internal/__api/', path, url.search), { slug: 'ana-panel', name: (st.company && st.company.title) || 'Ana mağaza', key: k.id, source: k.name,
      legacy, day_limit: dayLimit(k.day_limit) }, 'main:' + k.id, { method: req.method, raw, ctx });
    // Eski anahtarla başarılı satış / iptal: izin kalıcı olarak açık kaydedilir
    if (legacy && res.status >= 200 && res.status < 300) {
      try { const l = (await getRaw(env.DB, 'extapi_keys')) || []; const x = l.find((y) => y.id === k.id); if (x && x.write == null) { x.write = true; await setSetting(env.DB, 'extapi_keys', l); } } catch (e) { console.error('stok API izni kaydedilemedi', e); }
    }
    return res;
  }
  const m = /^hst_([a-z0-9-]{3,32})_[A-Za-z0-9]{32}$/.exec(key);
  if (!m) return err(401, 'API anahtarı eksik ya da geçersiz', 'auth');
  const t = env.DB ? await getTenant(env.DB, m[1], true) : null;
  const a = apiOf(t);
  if (!t || !a.hash || !same(await hex(key), a.hash)) return err(401, 'API anahtarı eksik ya da geçersiz', 'auth');
  if (!a.on) return err(403, 'Bu mağaza için API erişimi kapalı', 'disabled');
  if (!t.active || expired(t)) return err(403, 'Mağaza paneli askıda ya da aboneliği dolmuş', 'inactive');
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!ipAllowed(ip, a.ips)) return err(403, `Bu IP adresine izin verilmemiş (${ip || 'bilinmiyor'})`, 'ip');
  if (post && a.write !== true && a.write != null) return err(403, READONLY, 'readonly');
  const legacy = post && a.write == null;
  let raw = null;
  if (post) { const b = await readBody(req); if (b.res) return b.res; raw = b.raw; }
  // Kullanım: son erişim, IP ve sayaç (ana veritabanına en fazla dakikada bir)
  const s = seen.get(t.slug) || { n: 0, at: 0 };
  s.n++;
  if (Date.now() - s.at > 60e3) {
    const n = s.n; s.n = 0; s.at = Date.now();
    ctx.waitUntil(run(env.DB, "UPDATE tenants SET api = json_set(api, '$.last_at', ?, '$.last_ip', ?, '$.calls', COALESCE(json_extract(api, '$.calls'), 0) + ?) WHERE slug = ?", Date.now(), ip, n, t.slug).catch(() => {}));
  }
  seen.set(t.slug, s);
  const url = new URL(req.url);
  const res = await forward(new Request(innerUrl('https://tenant.internal/__api/', path, url.search, { legacy, day_limit: post ? dayLimit(a.day_limit) : 0 }).href,
    { method: req.method, body: raw, headers: { 'Content-Type': 'application/json' } }), env, t);
  // Eski anahtarla başarılı satış / iptal: izin kalıcı olarak açık kaydedilir (anahtar bu arada yenilenmediyse)
  if (legacy && res.status >= 200 && res.status < 300) {
    await run(env.DB, "UPDATE tenants SET api = json_set(api, '$.write', json('true')), updated_at = ? WHERE slug = ? AND json_extract(api, '$.write') IS NULL AND json_extract(api, '$.hash') = ?", Date.now(), t.slug, a.hash)
      .catch((e) => console.error('stok API izni kaydedilemedi', e));
  }
  return res;
}

// Müşteri panelinin (Durable Object) içinde: kendi veritabanından ürün ve stok
const rate = new Map();
// ---------- satış bildirimi: dış sistemde (bayinin sitesi) satılan ürün panelin stoğundan düşer ----------
// Sipariş panele düşmez (bayi siparişi kendisi yönetir ve gönderir); yalnız stok düşer, ürünün stok hareketlerinde "Bayi satışı" görünür
// ve yeni stok tüm kanallara gider. Satış numarası (ref) anahtar başına tektir: aynı satış tekrar gelirse (ağ hatası sonrası yeniden
// gönderim, aynı anda iki istek) stok ikinci kez düşmez; aynı numara farklı ürünle gelirse ya da iptal edildiyse reddedilir (409).
// Numara önce ext_sale_refs'e (src + ref benzersiz) koşullu yazılır: koşul "her ürünün stoğu yeterli ve (varsa) günlük sınır aşılmıyor".
// Kaydı alan istek (tok) ürün yazımlarını yapar, diğerleri hiçbir şey yazmaz; hepsi tek işlemde (aynı anda gelen istekler birleşmez).
// Stok eksiye düşmez: istenen adet mevcut stoktan fazlaysa satış reddedilir (409), hiçbir stok düşmez.
// Stok senkronu kapalıyken stok siteden (ikas, katalog kanalı) aynalanan üründe satış reddedilir: düşülen adet bir sonraki senkronda
// sitedeki stokla ezilirdi (bkz. sync.js mirrorStock); iptal de aynı nedenle reddedilir.
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/#]{0,63}$/;
// Kalem sayısı ve satır başına adet için güvenlik üst sınırı (günlük sınır anahtar başına, isteğe bağlı: day_limit)
export const SALE_LIMITS = { lines: 100, lineQty: 100000 };
const nostore = { 'Cache-Control': 'no-store' };
const DAY = 864e5;
async function saleOut(db, src, ref) {
  const rows = await all(db, 'SELECT s.product_id, s.qty, s.at, s.cancelled_at, p.sku, p.barcode, p.stock FROM ext_sales s LEFT JOIN products p ON p.id = s.product_id WHERE s.src = ? AND s.ref = ? ORDER BY s.product_id', src, ref);
  if (!rows.length) return null;
  return { ref, status: rows.every((r) => r.cancelled_at) ? 'cancelled' : 'active', created_at: new Date(Math.min(...rows.map((r) => r.at))).toISOString(),
    items: rows.map((r) => ({ product_id: r.product_id, sku: r.sku || null, barcode: r.barcode || null, quantity: r.qty, stock: r.stock == null ? null : Math.max(0, r.stock) })) };
}
async function afterSale(db, opts) {
  await import('./handler.js').then((m) => m.bumpCache(db)).catch(() => {});
  const settings = await getSettings(db).catch(() => ({}));
  if (opts.env && opts.ctx && opts.ctx.waitUntil) opts.ctx.waitUntil(import('./sync.js').then((m) => m.pushStocks(opts.env, db, settings)).catch(() => {}));
  return settings.stock_sync ? [] : ['Panelde stok senkronu kapalı: stok düştü ama kanallara gönderilmedi'];
}
// Stok senkronu kapalıyken stoğu katalog kanalından (ikas) aynalanan ürünler (mirrorStock'un okuduğu ilanlar)
async function mirrored(db, pids) {
  const settings = await getSettings(db).catch(() => ({}));
  if (settings.stock_sync || !pids.length) return [];
  const { catalogOf } = await import('./sync.js');
  return all(db, `SELECT p.id, p.sku, p.barcode, p.name FROM products p WHERE p.id IN (SELECT value FROM json_each(?))
    AND EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.remote_stock IS NOT NULL AND l.channel IN (SELECT value FROM json_each(?))) ORDER BY p.id`,
  JSON.stringify(pids), JSON.stringify(catalogOf(settings)));
}
const syncOff = (rows, what) => json({ error: `Panelde stok senkronu kapalı; ${what} stoğa işlenemez: ${rows.length} ürünün stoğu siteden (ikas) okunuyor, değişiklik bir sonraki senkronda geri yazılırdı. Hiçbir stok değişmedi. Yapılacak: Panelde Ayarlar → Stok → 'Stokları tüm kanallarda senkron tut' açılmalı; açıldıktan sonra aynı numarayla yeniden gönderin.`,
  code: 'stock_sync_off', items: rows.map((r) => ({ product_id: r.id, sku: r.sku || null, barcode: r.barcode || null, name: r.name })) }, 409, nostore);
// Satış neden işlenemez: yetersiz stok (pasif ürün satılamaz: stok listesinde 0 görünür) ya da anahtarın (varsa) günlük adet sınırı
async function blocker(db, src, want, limit) {
  const rows = await all(db, 'SELECT id, sku, barcode, name, stock, active FROM products WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify([...want.keys()]));
  const short = rows.map((r) => ({ product_id: r.id, sku: r.sku || null, barcode: r.barcode || null, name: r.name, requested: want.get(r.id), available: r.active ? Math.max(0, r.stock || 0) : 0 }))
    .filter((x) => x.requested > x.available);
  if (short.length) return json({ error: `Stok yetersiz: ${short.length} üründe istenen adet mevcut stoktan fazla; hiçbir stok düşmedi (güncel stoğu /stock ile alın)`, code: 'insufficient_stock', items: short }, 409, nostore);
  if (!limit) return null;
  const used = Number((await first(db, 'SELECT COALESCE(SUM(qty), 0) AS n FROM ext_sales WHERE src = ? AND at > ?', src, Date.now() - DAY)).n) || 0;
  const total = [...want.values()].reduce((a, x) => a + x, 0);
  if (used + total > limit) return json({ error: `Günlük sınır: bu anahtarın günlük sınırı ${limit.toLocaleString('tr-TR')} adet; son 24 saatte en fazla ${limit.toLocaleString('tr-TR')} adet satış bildirilebilir (şu ana kadar ${used.toLocaleString('tr-TR')}, bu satış ${total.toLocaleString('tr-TR')}). Hiçbir stok düşmedi. Sınırı mağaza yetkilisi değiştirebilir.`, code: 'daily_limit', limit, used, requested: total }, 429, nostore);
  return null;
}
// Aynı numara daha önce bildirildi: iptal edildiyse reddedilir; ürünler aynıysa aynen döner (stok yeniden düşmez), farklıysa reddedilir
async function priorSale(db, src, ref, want) {
  const had = await all(db, 'SELECT product_id, qty, cancelled_at FROM ext_sales WHERE src = ? AND ref = ?', src, ref);
  const head = had.length ? null : await first(db, 'SELECT 1 AS x FROM ext_sale_refs WHERE src = ? AND ref = ?', src, ref);
  if (!had.length && !head) return null;
  if (had.some((r) => r.cancelled_at)) return err(409, 'Bu satış numarası iptal edildi; yeniden satış için yeni numara kullanın', 'cancelled');
  const same = had.length === want.size && had.every((r) => want.get(r.product_id) === r.qty);
  if (!same) return err(409, 'Bu satış numarası daha önce farklı ürün / adetle bildirildi; değiştirmek için önce iptal edip yeni numarayla bildirin', 'conflict');
  return json({ ok: true, created: false, sale: await saleOut(db, src, ref), warnings: [] }, 200, nostore);
}
async function reportSale(db, src, store, b, opts, limit = 0) {
  if (!b || typeof b !== 'object') return err(400, 'Gövde JSON olmalı', 'body');
  const ref = str(b.ref ?? b.order_number).trim();
  if (!REF_RE.test(ref)) return err(400, 'ref gerekli: satışın (siparişinizin) numarası; harf, rakam, . _ - / # (en fazla 64 karakter)', 'param');
  // Ürün kimliği "id" (stok listesindeki) ya da "product_id" olarak verilebilir
  const items = (Array.isArray(b.items) ? b.items : []).map((x) => (x && typeof x === 'object' ? { ...x, product_id: x.product_id ?? x.id } : x));
  if (!items.length || items.length > SALE_LIMITS.lines) return err(400, `items: 1–${SALE_LIMITS.lines} kalem olmalı`, 'param');
  for (const [i, x] of items.entries()) {
    const q = Number(x && x.quantity);
    if (!x || typeof x !== 'object' || !Number.isInteger(q) || q < 1 || q > SALE_LIMITS.lineQty) return err(400, `items[${i}].quantity 1–${SALE_LIMITS.lineQty} arası tam sayı olmalı`, 'param');
    if (!(Number(x.product_id) > 0) && !str(x.sku).trim() && !str(x.barcode).trim()) return err(400, `items[${i}]: product_id, sku ya da barcode gerekli`, 'param');
  }
  // Ürünler: kimlik (stok listesindeki id), stok kodu ya da barkod. Bulunamayan varsa hiçbir stok düşmez
  const { itemResolver } = await import('./match.js');
  const maps = await itemResolver(db);
  const ids = [...new Set(items.map((x) => Number(x.product_id)).filter((x) => Number.isInteger(x) && x > 0))];
  const known = new Set(ids.length ? (await all(db, 'SELECT id FROM products WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))).map((r) => r.id) : []);
  const want = new Map(), bad = [];
  items.forEach((x, i) => {
    const pid = Number(x.product_id) > 0 ? (known.has(Number(x.product_id)) ? Number(x.product_id) : null) : maps.resolve('api', { sku: str(x.sku), barcode: str(x.barcode) });
    if (!pid) bad.push({ line: i + 1, product_id: x.product_id ?? null, sku: x.sku ?? null, barcode: x.barcode ?? null });
    else want.set(pid, (want.get(pid) || 0) + Number(x.quantity));
  });
  if (bad.length) return json({ error: `${bad.length} kalemin ürünü bulunamadı; hiçbir stok düşmedi (ürünleri /stock ile alıp id ya da sku gönderin)`, code: 'unknown_items', items: bad }, 422, nostore);
  const prior = await priorSale(db, src, ref, want);
  if (prior) return prior;
  const mir = await mirrored(db, [...want.keys()]);
  if (mir.length) return syncOff(mir, 'satış');
  const stop = await blocker(db, src, want, limit);
  if (stop) return stop;
  const t = Date.now(), label = `${store.source} #${ref}`.slice(0, 120), total = [...want.values()].reduce((a, x) => a + x, 0);
  const tok = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');
  // Numarayı al: yalnız tüm ürünlerin stoğu yeterliyse ve (varsa) günlük sınır aşılmıyorsa (aynı işlemde, eşzamanlı satışlar da kapsanır)
  const st = [db.prepare(`INSERT OR IGNORE INTO ext_sale_refs (src, ref, tok, at) SELECT ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM json_each(?) j LEFT JOIN products p ON p.id = json_extract(j.value, '$[0]')
      WHERE p.id IS NULL OR p.active = 0 OR p.stock < json_extract(j.value, '$[1]'))${limit ? `
    AND (SELECT COALESCE(SUM(qty), 0) FROM ext_sales WHERE src = ? AND at > ?) + ? <= ?` : ''}`)
    .bind(src, ref, tok, t, JSON.stringify([...want]), ...(limit ? [src, t - DAY, total, limit] : []))];
  const mine = 'EXISTS (SELECT 1 FROM ext_sale_refs WHERE src = ? AND ref = ? AND tok = ?) AND NOT EXISTS (SELECT 1 FROM ext_sales WHERE src = ? AND ref = ? AND product_id = ?)';
  for (const [pid, q] of want) {
    st.push(db.prepare(`UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND ${mine}`).bind(q, t, pid, src, ref, tok, src, ref, pid));
    st.push(db.prepare(`INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) SELECT ?, ?, stock, 'Bayi satışı', ?, ? FROM products WHERE id = ? AND ${mine}`).bind(pid, -q, label, t, pid, src, ref, tok, src, ref, pid));
    st.push(db.prepare(`INSERT OR IGNORE INTO ext_sales (src, ref, product_id, qty, at) SELECT ?, ?, ?, ?, ? WHERE ${mine}`).bind(src, ref, pid, q, t, src, ref, tok, src, ref, pid));
  }
  await db.batch(st);
  const won = await first(db, 'SELECT tok FROM ext_sale_refs WHERE src = ? AND ref = ?', src, ref);
  if (!won) return (await blocker(db, src, want, limit)) || err(409, 'Satış şu an işlenemedi (stok bu sırada değişti); yeniden gönderin', 'retry');
  if (won.tok !== tok) return (await priorSale(db, src, ref, want)) || err(409, 'Bu satış numarası şu an işleniyor; biraz sonra durumunu sorgulayın', 'conflict');
  const warnings = await afterSale(db, opts);
  return json({ ok: true, created: true, sale: await saleOut(db, src, ref), warnings }, 201, nostore);
}
async function cancelSale(db, src, ref, store, opts) {
  const rows = await all(db, 'SELECT product_id, qty, cancelled_at FROM ext_sales WHERE src = ? AND ref = ?', src, ref);
  if (!rows.length) return err(404, 'Bu numarayla bildirilmiş satış yok', 'notfound');
  const openRows = rows.filter((x) => !x.cancelled_at);
  const mir = await mirrored(db, openRows.map((r) => r.product_id));
  if (mir.length) return syncOff(mir, 'iptal');
  const t = Date.now(), label = `${store.source} #${ref}`.slice(0, 120), st = [];
  const open = 'EXISTS (SELECT 1 FROM ext_sales WHERE src = ? AND ref = ? AND product_id = ? AND cancelled_at IS NULL)';
  for (const r of openRows) {
    st.push(db.prepare(`UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND ${open}`).bind(r.qty, t, r.product_id, src, ref, r.product_id));
    st.push(db.prepare(`INSERT INTO stock_moves (product_id, delta, stock_after, reason, ref, created_at) SELECT ?, ?, stock, 'Bayi satışı iptal', ?, ? FROM products WHERE id = ? AND ${open}`).bind(r.product_id, r.qty, label, t, r.product_id, src, ref, r.product_id));
    st.push(db.prepare('UPDATE ext_sales SET cancelled_at = ? WHERE src = ? AND ref = ? AND product_id = ? AND cancelled_at IS NULL').bind(t, src, ref, r.product_id));
  }
  if (st.length) await db.batch(st);
  const warnings = st.length ? await afterSale(db, opts) : [];
  return json({ ok: true, sale: await saleOut(db, src, ref), warnings }, 200, nostore);
}

export async function extApiInner(db, url, store, rkey = store.slug, opts = {}) {
  const now = Date.now(), r = rate.get(rkey) || { at: now, n: 0 };
  if (now - r.at > 60e3) { r.at = now; r.n = 0; }
  r.n++; rate.set(rkey, r);
  if (r.n > 120) return err(429, 'Dakikada en fazla 120 istek', 'rate');
  // Dış katmanın kuralları: eski anahtar (izin alanı yok) ve günlük sınır; ana panelde store ile, firma panelinde URL parametresiyle gelir
  const fl = url.searchParams.get(FLAG_LEGACY) === '1', fd = url.searchParams.get(FLAG_DAY);
  url = new URL(url.href); url.searchParams.delete(FLAG_LEGACY); url.searchParams.delete(FLAG_DAY);
  const p = url.pathname.replace(/^\/__api\/?/, '').replace(/\/+$/, ''), q = Object.fromEntries(url.searchParams);
  const method = opts.method || 'GET';
  const legacy = !!(store.legacy ?? opts.legacy ?? fl), limit = dayLimit(store.day_limit ?? opts.day_limit ?? fd);
  // Satış bildirimi (anahtar başına ayrı numara alanı: iki bayinin aynı numarası karışmaz)
  const src = str(store.key || 'site').replace(/[^a-z0-9-]/gi, '') || 'site';
  store = { ...store, source: str(store.source || store.name || 'API') };
  // Eski anahtar (izin alanı tanımlanmamış): bu anahtarla daha önce satış bildirildiyse yazabilir, yoksa yalnız okur
  if (method !== 'GET' && legacy && !(await first(db, 'SELECT 1 AS x FROM ext_sales WHERE src = ? LIMIT 1', src))) return err(403, READONLY, 'readonly');
  if (p === 'sales' && method === 'POST') return reportSale(db, src, store, opts.body, opts, limit);
  const sm = /^sales\/([^/]+)(\/cancel)?$/.exec(p);
  if (sm) {
    let ref = '';
    try { ref = decodeURIComponent(sm[1]); } catch { /* bozuk % dizisi: geçersiz numara */ }
    if (!REF_RE.test(ref)) return err(400, 'Satış numarası geçersiz', 'param');
    if (sm[2] && method === 'POST') return cancelSale(db, src, ref, store, opts);
    if (!sm[2] && method === 'GET') { const x = await saleOut(db, src, ref); return x ? json({ sale: x }, 200, nostore) : err(404, 'Bu numarayla bildirilmiş satış yok', 'notfound'); }
  }
  if (method !== 'GET') return err(404, 'Uç nokta bulunamadı (yazma yalnız POST /sales ve /sales/{ref}/cancel)', 'notfound');
  if (p === 'ping') return json({ ok: true, store: { code: store.slug, name: store.name }, time: new Date().toISOString() }, 200, { 'Cache-Control': 'no-store' });
  if (p === 'stock') {
    const where = [], args = [];
    let since = null;
    if (q.updated_since) {
      since = /^\d+$/.test(q.updated_since) ? Number(q.updated_since) : Date.parse(q.updated_since);
      if (!Number.isFinite(since)) return err(400, 'updated_since geçersiz (ISO tarih ya da milisaniye)', 'param');
    }
    // Değişenler çekiminde pasife alınan ürün de gelir (stok 0, active false): bayi satmayı bıraksın
    if (q.include_inactive !== '1' && since == null) where.push('p.active = 1');
    if (q.sku) { where.push('p.sku = ?'); args.push(str(q.sku)); }
    if (q.barcode) { where.push('p.barcode = ?'); args.push(str(q.barcode)); }
    if (since != null) { where.push('p.updated_at > ?'); args.push(since); }
    const limit = Math.min(1000, Math.max(1, Number(q.limit) || 500)), page = Math.max(1, Number(q.page) || 1);
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const now = Date.now();
    const [total, rows, gone] = await Promise.all([
      first(db, `SELECT COUNT(*) AS n FROM products p ${W}`, ...args),
      db.prepare(`SELECT p.id, p.sku, p.barcode, p.name, p.variant_name, p.group_name, p.brand, p.stock, p.sale_price, p.vat, p.active, p.updated_at FROM products p ${W} ORDER BY p.id LIMIT ? OFFSET ?`)
        .bind(...args, limit, (page - 1) * limit).all().then((x) => x.results || []),
      // Silinen ürünler: yalnız değişenler çekiminde, ilk sayfada
      since != null && page === 1 && !q.sku && !q.barcode
        ? db.prepare('SELECT id, sku, barcode, at FROM deleted_products WHERE at > ? ORDER BY at LIMIT 5000').bind(since).all().then((x) => x.results || []).catch(() => [])
        : [],
    ]);
    return json({
      store: { code: store.slug, name: store.name }, page, limit, total: total.n, has_more: page * limit < total.n, generated_at: new Date(now).toISOString(),
      // Sonraki "değişenler" çekiminde kullanılacak zaman: bu yanıtın zamanından 2 dk önce (çekim sırasında değişen ürün kaçmasın)
      next_since: new Date(now - 120e3).toISOString(),
      items: rows.map((x) => ({ id: x.id, sku: x.sku || null, barcode: x.barcode || null, name: x.name, variant: x.variant_name || null, group: x.group_name || null, brand: x.brand || null,
        // Satılabilir stok: pasif üründe 0
        stock: x.active ? Math.max(0, x.stock || 0) : 0, price: x.sale_price || 0, vat: x.vat ?? null, active: !!x.active, updated_at: x.updated_at ? new Date(x.updated_at).toISOString() : null })),
      deleted: gone.map((x) => ({ id: x.id, sku: x.sku || null, barcode: x.barcode || null, stock: 0, deleted_at: new Date(x.at).toISOString() })),
    }, 200, { 'Cache-Control': 'no-store' });
  }
  return err(404, 'Uç nokta bulunamadı (kullanılabilir: GET /ping, /stock, /sales/{ref}; POST /sales, /sales/{ref}/cancel)', 'notfound');
}
