// Cloudflare Worker: public/ klasöründeki dosyalar (widget, ürün verisi) doğrudan statik sunulur, bu kod onlarda çalışmaz.
// Sadece iki adres için devreye girer:
//   POST /e       widget'tan gelen anonim ziyaretçi olayları (arama, tıklama, görüntüleme, sepete ekleme)
//   GET  /trends  son 30 günün özeti (ivme dahil) + son 2 yılın aynı dönemi (scripts/sync.mjs 2 saatte bir okur, products.json'a işler)
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
const KEEP_DAYS = 800;    // daha eski satırlar silinir (son 2 yılın aynı dönemi karşılaştırılır)
const LY_BEFORE = 7, LY_AFTER = 30; // geçen yıl: bugünün 1 hafta öncesi – 1 ay sonrası (yaklaşan sezon)

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

// Ürün olaylarının tek sayıya çevrilmesi: sepete ekleme > tıklama > görüntüleme
const EW = { a: 2, c: 1, v: 0.3 };
async function trends(env, ctx) {
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!env.DB) return json({ ok: false, why: 'db' });
  await init(env.DB);
  const { results } = await env.DB.prepare('SELECT d, k, x, n FROM ev WHERE d >= ?').bind(day(-DAYS)).all();
  const today = Date.parse(day());
  const agg = {}, p = {};
  for (const r of results) {
    const age = Math.max(0, (today - Date.parse(r.d)) / 864e5);
    const w = Math.pow(0.5, age / HALF_LIFE);
    const a = (agg[r.k] = agg[r.k] || {});
    const o = (a[r.x] = a[r.x] || { n: 0, s: 0, n7: 0 });
    o.n += r.n;
    o.s += r.n * w;
    if (age < 7) o.n7 += r.n;
    // Ürün başına: tür bazında ağırlıklı (yeni olan ağır) + ivme için son 7 gün / son 28 gün ham toplam
    if (EW[r.k]) {
      const q = (p[r.x] = p[r.x] || { a: 0, c: 0, v: 0, e7: 0, e28: 0 });
      q[r.k] += r.n * w;
      if (age < 7) q.e7 += r.n * EW[r.k];
      if (age < 28) q.e28 += r.n * EW[r.k];
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  for (const q of Object.values(p)) for (const k in q) q[k] = r2(q[k]);
  const top = (k, lim) => Object.entries(agg[k] || {}).sort((a, b) => b[1].s - a[1].s).slice(0, lim)
    .map(([x, o]) => [x, o.n, r2(o.s), o.n7]);
  // Geçmiş yıllar (1 ve 2 yıl önce): "önümüzdeki dönem" (o günün 1 hafta öncesi – 1 ay sonrası) ve
  // "son 2 hafta" (bu yılın son 2 haftasıyla karşılaştırıp sezonun tutup tutmadığını görmek için)
  async function year(y) {
    const base = -365 * y;
    const rows = (await env.DB.prepare(
      'SELECT k, x, SUM(CASE WHEN d >= ?1 AND d <= ?2 THEN n ELSE 0 END) AS ahead, SUM(CASE WHEN d >= ?3 AND d <= ?4 THEN n ELSE 0 END) AS recent ' +
      'FROM ev WHERE d >= ?3 AND d <= ?2 GROUP BY k, x')
      .bind(day(base - LY_BEFORE), day(base + LY_AFTER), day(base - 14), day(base)).all()).results;
    const out = { q: [], p: {}, rows: rows.length };
    for (const r of rows) {
      if (r.k === 'q' && r.ahead) out.q.push([r.x, r.ahead]);
      else if (EW[r.k]) {
        const q = (out.p[r.x] = out.p[r.x] || { e: 0, e14: 0 });
        q.e = r2(q.e + r.ahead * EW[r.k]);
        q.e14 = r2(q.e14 + r.recent * EW[r.k]);
      }
    }
    out.q = out.q.sort((a, b) => b[1] - a[1]).slice(0, 60);
    return out;
  }
  const [ly, ly2] = [await year(1), await year(2)];
  if (Math.random() < 0.1) ctx.waitUntil(env.DB.prepare('DELETE FROM ev WHERE d < ?').bind(day(-KEEP_DAYS)).run().catch(() => {}));
  return json({ ok: true, updated: new Date().toISOString(), days: DAYS, rows: results.length, q: top('q', 80), q0: top('q0', 50), m: top('m', 40), p, ly, ly2 });
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
