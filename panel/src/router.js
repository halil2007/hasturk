// Ana panelin iki veritabanı: mağaza verisi (sipariş, ürün, stok, ilan, ayarlar …) ana panel nesnesinin kendi yerel
// veritabanında (Durable Object SQLite: sorgu mikro saniyede biter, nesne kullanıcıya yakın bölgede), müşteri panelleriyle /
// tanıtım sitesiyle ortak tablolar (firmalar, ödemeler, destek, hata kayıtları, hız ölçümleri, blog, IP engelleri) ana D1
// veritabanında kalır. Her sorgu adı geçen tabloya göre doğru veritabanına gider; ikisini birden kullanan sorgu yazılamaz
// (testler CHECK_MIXED=1 ile yakalar). Ayarlar ve kanal bağlantıları yerelde okunur; yazılınca ana veritabanına da yazılır
// (müşteri panelleri, site ve Worker bazı ayarları oradan okur: firma bilgisi, e-posta, giriş koruması, dış API anahtarları,
// reklam etiketleri, platform değerleri …).
import { TABLES } from './db.js';

export const GLOBAL_TABLES = ['tenants', 'tenant_payments', 'sales_orders', 'support_tickets', 'support_messages', 'support_files', 'error_reports', 'perf_stats', 'blog_posts', 'blog_images', 'ip_guard',
  // Bildirimler ve bildirim abonelikleri: satış, destek talebi, hata gibi olaylar çalışan tarafında da yazılır
  'notices', 'push_subs'];
const GSET = new Set(GLOBAL_TABLES);
export const LOCAL_TABLES = TABLES.filter((n) => !GSET.has(n));
const LSET = new Set(LOCAL_TABLES);
// Sorgunun kullandığı tablolar (FROM / JOIN / INTO / UPDATE / TABLE / INDEX … ON)
const REF = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?|INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+\w+\s+ON)\s+["`]?([a-z_][a-z0-9_]*)/gi;
const refsOf = (sql) => [...String(sql).matchAll(REF)].map((m) => m[1].toLowerCase());
const cache = new Map();
// Sorgu ortak veritabanına mı gider? Ortak ve yerel tablo birlikteyse hata (iki veritabanında birden çalışamaz)
export function isGlobal(sql) {
  let v = cache.get(sql);
  if (v !== undefined) return v;
  const refs = refsOf(sql);
  v = refs.some((r) => GSET.has(r));
  if (v && refs.some((r) => LSET.has(r))) throw new Error(`Karışık sorgu (ortak ve yerel tablo birlikte): ${String(sql).replace(/\s+/g, ' ').slice(0, 160)}`);
  if (cache.size > 3000) cache.clear();
  cache.set(sql, v);
  return v;
}
// Ana veritabanına da yazılanlar: ayar ve kanal bağlantısı değişiklikleri. Bu panele özel / anlık ayarlar hariç (şema sürümü,
// tek seferlik işaretler, kilitler, giriş denemeleri, doğrulama kodları)
const MIRROR = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i, MIRROR_T = new Set(['settings', 'channel_config']);
const NO_MIRROR = /schema_v|schema_n|once:|_lock\b|login_fail:|tfa_fail:|mailcode|pwreset|errrep/;
export const mirrorable = (sql, args = []) => MIRROR.test(sql) && refsOf(sql).some((r) => MIRROR_T.has(r))
  && !NO_MIRROR.test(sql + ' ' + args.filter((a) => typeof a === 'string').map((a) => a.slice(0, 80)).join(' '));

export function routeDb(local, remote, { onMirrorError = (e) => console.error('ayar ana veritabanına yazılamadı', e) } = {}) {
  class Stmt {
    constructor(sql, args = [], g = isGlobal(sql)) { this.sql = sql; this.args = args; this.g = g; }
    bind(...a) { return new Stmt(this.sql, a, this.g); }
    target() { return (this.g ? remote : local).prepare(this.sql).bind(...this.args); }
    mirror() { return !this.g && mirrorable(this.sql, this.args) ? remote.prepare(this.sql).bind(...this.args).run().catch(onMirrorError) : null; }
    async all() { return this.target().all(); }
    async first(c) { return c === undefined ? this.target().first() : this.target().first(c); }
    async raw(o) { return o === undefined ? this.target().raw() : this.target().raw(o); }
    async run() { const r = await this.target().run(); const m = this.mirror(); if (m) await m; return r; }
  }
  return {
    routed: true, local, remote,
    prepare: (sql) => new Stmt(sql),
    // Toplu işlem: yerel ve ortak sorgular ayrı ayrı (her biri kendi içinde tek işlemde); sonuç sırası korunur
    async batch(list) {
      const out = new Array(list.length), L = [], R = [];
      list.forEach((s, i) => (s.g ? R : L).push([i, s]));
      if (L.length) (await local.batch(L.map(([, s]) => s.target()))).forEach((r, k) => { out[L[k][0]] = r; });
      if (R.length) (await remote.batch(R.map(([, s]) => s.target()))).forEach((r, k) => { out[R[k][0]] = r; });
      const ms = L.map(([, s]) => s.mirror()).filter(Boolean);
      if (ms.length) await Promise.all(ms);
      return out;
    },
    exec: (q) => (isGlobal(q) ? remote : local).exec(q),
  };
}
