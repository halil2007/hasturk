// Dış API (stok aktarımı): yalnız ana panelin yetkilendirdiği müşteri panelleri için. Firmanın dış sistemi (ERP, kendi sitesi,
// muhasebe programı …) kendi mağazasının ürün ve stoklarını okur; başka mağazaya erişemez, hiçbir şey yazamaz.
//  - Anahtar ana panelde (Firmalar → firma → Dış API) üretilir; yalnız bir kez gösterilir, veritabanında özeti saklanır.
//  - Anahtar firma koduna bağlıdır: hst_<firma-kodu>_<gizli> → yalnız o firmanın paneline yönlendirilir.
//  - Firmanın kendi yöneticisi açamaz / kapatamaz / anahtar üretemez. İsteğe bağlı IP kısıtı. Dakikada 120 istek.
// Uç noktalar (GET, başlık: Authorization: Bearer <anahtar>):
//   /api/v1/ping                     bağlantı testi
//   /api/v1/stock                    ürünler ve stoklar (sayfalı): page, limit (en fazla 1000), updated_since, sku, barcode, include_inactive
import { first, run, init, getRaw, setSetting, getSettings } from './db.js';
import { json, str, fail } from './util.js';

const enc = new TextEncoder();
const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const apiOf = (t) => { try { const a = JSON.parse((t && t.api) || 'null'); return a && typeof a === 'object' ? a : {}; } catch { return {}; } };
// Ana panele gösterilen durum (anahtar özeti hariç)
export const apiPublic = (t) => { const a = apiOf(t); return { on: !!a.on, hasKey: !!a.hash, hint: a.hint || '', ips: a.ips || [], created_at: a.created_at || null, last_at: a.last_at || null, last_ip: a.last_ip || '', calls: a.calls || 0 }; };

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
const keysPublic = (list) => (list || []).map((k) => ({ id: k.id, name: k.name, hint: k.hint, on: !!k.on, ips: k.ips || [], created_at: k.created_at, created_by: k.created_by || '', last_at: k.last_at || null, last_ip: k.last_ip || '', calls: k.calls || 0 }));
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
    list.push({ id, name, hash: await hex(key), hint: `hsm_${id}_…${secret.slice(-4)}`, on: true, ips, created_at: Date.now(), created_by: (user && user.name) || '' });
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
      if (b.ips !== undefined) { try { k.ips = parseIps(b.ips); } catch (e) { fail(400, e.message); } }
      await save(list);
      return { ok: true, keys: keysPublic(list) };
    }
  }
  fail(404, 'Bulunamadı');
}

// Worker: anahtarı doğrula, firmanın paneline yönlendir. getTenant / forward tenants.js'ten verilir (döngüsel içe aktarmayı önlemek için)
export async function extApi(req, env, ctx, path, { getTenant, forward, expired }) {
  if (req.method !== 'GET') return err(405, 'Yalnız GET desteklenir', 'method');
  const auth = req.headers.get('Authorization') || '', key = (/^Bearer\s+(.+)$/i.exec(auth) || [])[1] || req.headers.get('X-Api-Key') || '';
  // Ana panelin kendi mağazası (hsm_ anahtarı): ürünler ana veritabanından
  const mk = MAIN_KEY.exec(key.trim());
  if (mk && env.DB) {
    await init(env.DB);
    const list = (await getRaw(env.DB, 'extapi_keys')) || [];
    const k = list.find((x) => x.id === mk[1]);
    if (!k || !same(await hex(key.trim()), k.hash)) return err(401, 'API anahtarı eksik ya da geçersiz', 'auth');
    if (!k.on) return err(403, 'Bu API anahtarı kapalı', 'disabled');
    const ip = req.headers.get('CF-Connecting-IP') || '';
    if (!ipAllowed(ip, k.ips)) return err(403, `Bu IP adresine izin verilmemiş (${ip || 'bilinmiyor'})`, 'ip');
    const s = seen.get('main:' + k.id) || { n: 0, at: 0 };
    s.n++;
    if (Date.now() - s.at > 60e3) {
      const n = s.n; s.n = 0; s.at = Date.now();
      ctx.waitUntil((async () => { const l = (await getRaw(env.DB, 'extapi_keys')) || []; const x = l.find((y) => y.id === k.id); if (x) { x.last_at = Date.now(); x.last_ip = ip; x.calls = (x.calls || 0) + n; await setSetting(env.DB, 'extapi_keys', l); } })().catch(() => {}));
    }
    seen.set('main:' + k.id, s);
    const st = await getSettings(env.DB);
    const url = new URL(req.url);
    return extApiInner(env.DB, new URL('https://main.internal/__api/' + path.replace(/^v1\/?/, '') + url.search), { slug: 'ana-panel', name: (st.company && st.company.title) || 'Ana mağaza' }, 'main:' + k.id);
  }
  const m = /^hst_([a-z0-9-]{3,32})_[A-Za-z0-9]{32}$/.exec(key.trim());
  if (!m) return err(401, 'API anahtarı eksik ya da geçersiz', 'auth');
  const t = env.DB ? await getTenant(env.DB, m[1], true) : null;
  const a = apiOf(t);
  if (!t || !a.hash || !same(await hex(key.trim()), a.hash)) return err(401, 'API anahtarı eksik ya da geçersiz', 'auth');
  if (!a.on) return err(403, 'Bu mağaza için API erişimi kapalı', 'disabled');
  if (!t.active || expired(t)) return err(403, 'Mağaza paneli askıda ya da aboneliği dolmuş', 'inactive');
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!ipAllowed(ip, a.ips)) return err(403, `Bu IP adresine izin verilmemiş (${ip || 'bilinmiyor'})`, 'ip');
  // Kullanım: son erişim, IP ve sayaç (ana veritabanına en fazla dakikada bir)
  const s = seen.get(t.slug) || { n: 0, at: 0 };
  s.n++;
  if (Date.now() - s.at > 60e3) {
    const n = s.n; s.n = 0; s.at = Date.now();
    ctx.waitUntil(run(env.DB, "UPDATE tenants SET api = json_set(api, '$.last_at', ?, '$.last_ip', ?, '$.calls', COALESCE(json_extract(api, '$.calls'), 0) + ?) WHERE slug = ?", Date.now(), ip, n, t.slug).catch(() => {}));
  }
  seen.set(t.slug, s);
  const url = new URL(req.url);
  return forward(new Request('https://tenant.internal/__api/' + path.replace(/^v1\/?/, '') + url.search, { method: 'GET' }), env, t);
}

// Müşteri panelinin (Durable Object) içinde: kendi veritabanından ürün ve stok
const rate = new Map();
export async function extApiInner(db, url, store, rkey = store.slug) {
  const now = Date.now(), r = rate.get(rkey) || { at: now, n: 0 };
  if (now - r.at > 60e3) { r.at = now; r.n = 0; }
  r.n++; rate.set(rkey, r);
  if (r.n > 120) return err(429, 'Dakikada en fazla 120 istek', 'rate');
  const p = url.pathname.replace(/^\/__api\/?/, '').replace(/\/+$/, ''), q = Object.fromEntries(url.searchParams);
  if (p === 'ping') return json({ ok: true, store: { code: store.slug, name: store.name }, time: new Date().toISOString() }, 200, { 'Cache-Control': 'no-store' });
  if (p === 'stock') {
    const where = [], args = [];
    if (q.include_inactive !== '1') where.push('p.active = 1');
    if (q.sku) { where.push('p.sku = ?'); args.push(str(q.sku)); }
    if (q.barcode) { where.push('p.barcode = ?'); args.push(str(q.barcode)); }
    if (q.updated_since) {
      const t = /^\d+$/.test(q.updated_since) ? Number(q.updated_since) : Date.parse(q.updated_since);
      if (!Number.isFinite(t)) return err(400, 'updated_since geçersiz (ISO tarih ya da milisaniye)', 'param');
      where.push('p.updated_at > ?'); args.push(t);
    }
    const limit = Math.min(1000, Math.max(1, Number(q.limit) || 500)), page = Math.max(1, Number(q.page) || 1);
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [total, rows] = await Promise.all([
      first(db, `SELECT COUNT(*) AS n FROM products p ${W}`, ...args),
      db.prepare(`SELECT p.id, p.sku, p.barcode, p.name, p.variant_name, p.group_name, p.brand, p.stock, p.sale_price, p.vat, p.active, p.updated_at FROM products p ${W} ORDER BY p.id LIMIT ? OFFSET ?`)
        .bind(...args, limit, (page - 1) * limit).all().then((x) => x.results || []),
    ]);
    return json({
      store: { code: store.slug, name: store.name }, page, limit, total: total.n, has_more: page * limit < total.n, generated_at: new Date().toISOString(),
      items: rows.map((x) => ({ id: x.id, sku: x.sku || null, barcode: x.barcode || null, name: x.name, variant: x.variant_name || null, group: x.group_name || null, brand: x.brand || null,
        stock: Math.max(0, x.stock || 0), price: x.sale_price || 0, vat: x.vat ?? null, active: !!x.active, updated_at: x.updated_at ? new Date(x.updated_at).toISOString() : null })),
    }, 200, { 'Cache-Control': 'no-store' });
  }
  return err(404, 'Uç nokta bulunamadı (kullanılabilir: /api/v1/ping, /api/v1/stock)', 'notfound');
}
