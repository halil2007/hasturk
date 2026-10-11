// Veritabanı ölçümü: bir istekte kaç sorgu yapıldı, sorgular toplam ne kadar bekletti, veritabanının kendi çalışma süresi
// (D1 meta.timings) ve veritabanının bölgesi (meta.served_by_region). Aradaki fark ağ gidiş-dönüşüdür: panelin yavaşlığı
// sorgunun kendisinden mi, sunucu ile veritabanı arasındaki mesafeden mi geliyor, bu ayrımla görülür (Destek → Sistem hızı).
// Sayaç isteğe özeldir (AsyncLocalStorage); ölçüm dışındaki çağrılar (senkron, zamanlanmış işler) yalnız bölgeyi öğrenir.
import { AsyncLocalStorage } from 'node:async_hooks';
import { isGlobal } from './router.js';
// Testlerde (CHECK_MIXED=1): ortak ve yerel tabloyu aynı sorguda kullanan kod hemen hata verir (bkz. router.js)
const CHECK = typeof process !== 'undefined' && process.env && process.env.CHECK_MIXED === '1';

const als = new AsyncLocalStorage();
export const measure = (fn) => als.run({ q: 0, ms: 0, sql: 0 }, fn);
export const dbStats = () => als.getStore() || null;
// Veritabanının ana kopyasının bölgesi (WEUR, EEUR, ENAM …): ilk yanıtta öğrenilir
export const region = { d1: '' };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function note(t0, results) {
  for (const r of results) {
    const m = r && r.meta;
    if (m && m.served_by_region && m.served_by_primary !== false) region.d1 = String(m.served_by_region).toUpperCase();
  }
  const s = als.getStore();
  if (!s) return;
  s.q++;
  s.ms += now() - t0;
  for (const r of results) { const t = r && r.meta && r.meta.timings; if (t && t.sql_duration_ms) s.sql += t.sql_duration_ms; }
}

class Stmt {
  constructor(st) { this.st = st; }
  bind(...a) { return new Stmt(this.st.bind(...a)); }
  async all() { const t = now(), r = await this.st.all(); note(t, [r]); return r; }
  async run() { const t = now(), r = await this.st.run(); note(t, [r]); return r; }
  async first(col) { const t = now(), r = await (col === undefined ? this.st.first() : this.st.first(col)); note(t, []); return r; }
  async raw(o) { const t = now(), r = await (o === undefined ? this.st.raw() : this.st.raw(o)); note(t, []); return r; }
}

// Aynı veritabanı bağlantısı için hep aynı sarmalayıcı (önbellekler veritabanı nesnesine bağlı: init, yanıt önbelleği …)
const wrapped = new WeakMap();
export function meter(db) {
  if (!db || typeof db !== 'object' || db.metered) return db;
  let w = wrapped.get(db);
  if (!w) {
    w = {
      metered: true,
      prepare: (q) => { if (CHECK) { try { isGlobal(q); } catch (e) { console.error('KARISIK ' + e.message); throw e; } } return new Stmt(db.prepare(q)); },
      async batch(list) { const t = now(), r = await db.batch(list.map((s) => (s instanceof Stmt ? s.st : s))); note(t, r || []); return r; },
      exec: (q) => db.exec(q),
      dump: () => db.dump(),
    };
    wrapped.set(db, w);
  }
  return w;
}

// Sunucu süresi başlığı (tarayıcı ağ beklemesini sunucu süresinden ayırabilsin): app = toplam, db = sorguların beklettiği süre
export function serverTiming(res, ms, s, extra = '', name = 'app') {
  if (!res || !res.headers || res.status === 101 || res.webSocket) return res;
  const parts = [`${name};dur=${Math.round(ms)}`];
  if (s && s.q) parts.push(`db;dur=${Math.round(s.ms)};desc="${s.q} sorgu${region.d1 ? ' ' + region.d1 : ''}"`);
  if (extra) parts.push(extra);
  try { res.headers.append('Server-Timing', parts.join(', ')); return res; } catch {
    const r = new Response(res.body, res); r.headers.append('Server-Timing', parts.join(', ')); return r;
  }
}
