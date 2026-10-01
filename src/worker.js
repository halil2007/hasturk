// Cloudflare Worker: public/ klasöründeki dosyalar (widget, ürün verisi) doğrudan statik sunulur, bu kod onlarda çalışmaz.
// Sadece iki adres için devreye girer:
//   POST /e       widget'tan gelen anonim ziyaretçi olayları (arama, tıklama, görüntüleme, sepete ekleme)
//   GET  /trends  son 30 günün özeti (scripts/sync.mjs 2 saatte bir okur, products.json'a işler)
// Kişisel veri tutulmaz: IP, çerez, kullanıcı kimliği yok; sadece gün + olay türü + ürün/arama kelimesi + adet.
// Veritabanı (D1, "DB") ilk yayında Cloudflare tarafından otomatik oluşturulur; yoksa olaylar sessizce yok sayılır.

const KINDS = {
  q: 'search',    // arama (sonuç bulundu)
  q0: 'search',   // sonuçsuz arama
  c: 'slug',      // panelden/menüden ürüne tıklama
  v: 'slug',      // ürün sayfası görüntüleme
  a: 'slug',      // sepete ekleme (sitenin tamamı)
  m: 'name',      // masaüstü menü tıklaması
};
const DAYS = 30;          // özet penceresi
const HALF_LIFE = 10;     // gün: yeni olaylar daha ağır basar
const KEEP_DAYS = 150;    // daha eski satırlar silinir

let ready = false;
async function init(db) {
  if (ready) return;
  await db.exec('CREATE TABLE IF NOT EXISTS ev (d TEXT NOT NULL, k TEXT NOT NULL, x TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (d, k, x))');
  ready = true;
}
const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

function clean(kind, x) {
  if (typeof x !== 'string') return '';
  x = x.normalize('NFC').trim();
  if (kind === 'search') {
    x = x.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N} .,-]/gu, ' ').replace(/\s+/g, ' ').trim();
    return x.length >= 2 && x.length <= 40 ? x : '';
  }
  if (kind === 'slug') return /^[a-z0-9-]{1,140}$/.test(x) ? x : '';
  return x.replace(/\s+/g, ' ').slice(0, 60);
}

function originOk(req, env) {
  const o = req.headers.get('Origin') || '';
  const allow = String(env.ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.length) return true;
  try {
    const h = new URL(o).hostname;
    return allow.some((a) => h === a || h.endsWith('.' + a));
  } catch { return false; }
}

async function ingest(req, env, ctx) {
  const done = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (!env.DB || !originOk(req, env)) return done;
  const text = await req.text();
  if (text.length > 8000) return done;
  let body;
  try { body = JSON.parse(text); } catch { return done; }
  const counts = new Map();
  for (const e of (Array.isArray(body && body.e) ? body.e : []).slice(0, 40)) {
    if (!Array.isArray(e) || !KINDS[e[0]]) continue;
    const x = clean(KINDS[e[0]], e[1]);
    if (!x) continue;
    const key = e[0] + '\u0000' + x;
    counts.set(key, Math.min((counts.get(key) || 0) + 1, 3));
  }
  if (!counts.size) return done;
  const d = day();
  ctx.waitUntil((async () => {
    await init(env.DB);
    const st = env.DB.prepare('INSERT INTO ev (d, k, x, n) VALUES (?, ?, ?, ?) ON CONFLICT (d, k, x) DO UPDATE SET n = n + excluded.n');
    await env.DB.batch([...counts].map(([key, n]) => { const [k, x] = key.split('\u0000'); return st.bind(d, k, x, n); }));
  })().catch(() => {}));
  return done;
}

async function trends(env, ctx) {
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!env.DB) return json({ ok: false, why: 'db' });
  await init(env.DB);
  const { results } = await env.DB.prepare('SELECT d, k, x, n FROM ev WHERE d >= ?').bind(day(-DAYS)).all();
  const today = Date.parse(day());
  const agg = {};
  for (const r of results) {
    const age = Math.max(0, (today - Date.parse(r.d)) / 864e5);
    const w = Math.pow(0.5, age / HALF_LIFE);
    const a = (agg[r.k] = agg[r.k] || {});
    const o = (a[r.x] = a[r.x] || { n: 0, s: 0 });
    o.n += r.n;
    o.s += r.n * w;
  }
  const top = (k, lim) => Object.entries(agg[k] || {}).sort((a, b) => b[1].s - a[1].s).slice(0, lim)
    .map(([x, o]) => [x, o.n, Math.round(o.s * 100) / 100]);
  const p = {};
  for (const k of ['c', 'v', 'a']) for (const [x, o] of Object.entries(agg[k] || {})) {
    (p[x] = p[x] || {})[k] = Math.round(o.s * 100) / 100;
  }
  if (Math.random() < 0.1) ctx.waitUntil(env.DB.prepare('DELETE FROM ev WHERE d < ?').bind(day(-KEEP_DAYS)).run().catch(() => {}));
  return json({ ok: true, updated: new Date().toISOString(), days: DAYS, rows: results.length, q: top('q', 80), q0: top('q0', 50), m: top('m', 40), p });
}

export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (pathname === '/e' && req.method === 'POST') return ingest(req, env, ctx);
    if (pathname === '/e' && req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (pathname === '/trends') return trends(env, ctx).catch(() => new Response('{"ok":false}', { status: 500 }));
    return new Response('Bulunamadı', { status: 404 });
  },
};
