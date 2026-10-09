// Sistem hızı: her panelin (ana panel ve müşteri panelleri) istek süreleri işlem türüne göre toplanır ve birkaç dakikada bir
// ana veritabanına yazılır (günlük: kaç istek, ortalama, en uzun, 1 sn'yi aşan). Ortalaması 1 sn'yi aşan panel işlemi "Yavaş işlem"
// olarak Müşteri hataları'na düşer (pazaryeri bağlantılı işlemde sınır 10 sn). Günlük bakım (housekeeping) eski kayıtları temizler ve veritabanı istatistiklerini tazeler.
import { all, run } from './db.js';
import { recordError } from './errors.js';

const SLOW = 1000, ALERT = 1000, ALERT_EXT = 10000;
// Pazaryeri / site bağlantılı işlemler: süre, kanalın (Trendyol, Hepsiburada, ikas …) yanıtına bağlıdır (senkron, paketleme, etiket,
// kargo bildirimi, bağlantı testi, soru cevabı …). Raporda ayrı gösterilir; panelin kendi hızı (ortalama yanıt) bunlarsız ölçülür.
export const EXTERNAL = new RegExp('^(POST (sync|import|push-stock|buybox/check|questions/sync|claims/sync|invoices/sync|settlements/sync|backfill(/run)?|campaigns'
  + '|channel-products/(accept|add)|mail/test|digest/test|push/test|orders-bulk|labels|fx/apply|suggestions/apply|listings/stock|catalog/.*'
  + '|orders/:id/(accept|pack|split|ship|label|label-pdf|cargo|refresh|repack|cancel-package|carrier-label|carrier-cancel)'
  + '|integrations/[a-z0-9_]+/(test|diagnose)|integrations/carriers/[a-z]+/test|claims/[a-z0-9_]+/.+/(approve|reject)|questions/[a-z0-9_]+/.+/answer)'
  + '|GET (orders/:id/cargo|campaigns/.+|catalog/.*))$');
const day = (t = Date.now()) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);
// İşlem türü: kimlik / numara içeren parçalar :id olur (orders/trendyol:123 → orders/:id)
export const routeOf = (method, path) => `${method} ${String(path).split('?')[0].split('/').map((s) => (/^\d+$/.test(s) || (/\d/.test(s) && s.length > 3) ? ':id' : s)).join('/')}`.slice(0, 120);
const SKIP = /^(GET|POST) (errors\/report|support\/count|errors\/count|brand|logo|me)$/;

export class PerfBuffer {
  constructor() { this.m = new Map(); this.at = Date.now(); this.n = 0; }
  add(method, path, ms) {
    const r = routeOf(method, path);
    if (SKIP.test(r)) return;
    const e = this.m.get(r) || { n: 0, total: 0, max: 0, slow: 0 };
    e.n++; e.total += ms; e.max = Math.max(e.max, ms); if (ms >= SLOW) e.slow++;
    this.m.set(r, e); this.n++;
  }
  due() { return this.n > 0 && (Date.now() - this.at > 300e3 || this.n >= 500); }
  // Ana veritabanına yaz (slug: '' = ana panel); ortalaması çok yüksek işlem hata kaydına düşer
  async flush(db, { slug = '', firm = '' } = {}) {
    if (!db || !this.n) return;
    const rows = [...this.m.entries()], d = day();
    this.m = new Map(); this.n = 0; this.at = Date.now();
    await db.batch(rows.map(([route, e]) => db.prepare(`INSERT INTO perf_stats (day, slug, route, n, total_ms, max_ms, slow_n) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, slug, route) DO UPDATE SET n = n + excluded.n, total_ms = total_ms + excluded.total_ms, max_ms = MAX(max_ms, excluded.max_ms), slow_n = slow_n + excluded.slow_n`)
      .bind(d, slug, route, e.n, Math.round(e.total), Math.round(e.max), e.slow)));
    for (const [route, e] of rows) {
      const ext = EXTERNAL.test(route);
      if (e.n >= 3 && e.total / e.n >= (ext ? ALERT_EXT : ALERT)) await recordError(db, { slug, firm, source: 'perf', message: `${ext ? 'Pazaryeri yanıtı yavaş' : 'Yavaş işlem'}: ortalama ${Math.round(e.total / e.n / 100) / 10} sn (${e.n} istek, en uzun ${Math.round(e.max / 100) / 10} sn)`, action: route });
    }
    if (Math.random() < 0.05) await run(db, 'DELETE FROM perf_stats WHERE day < ?', day(Date.now() - 45 * 864e5));
  }
}

// Ana panel → Destek → Sistem hızı: son N günün en yavaş işlemleri (firma bazında) ve günlük toplam
export async function perfReport(db, { days = 7, slug } = {}) {
  const from = day(Date.now() - (days - 1) * 864e5), sw = slug != null && slug !== '' ? ' AND slug = ?' : '', sa = sw ? [slug === '-' ? '' : slug] : [];
  // Günlük ve firma toplamları panelin kendi işlemleriyle (pazaryeri bağlantılılar hariç) hesaplanır; onlar ayrıca verilir
  const [routes, byDay, byFirm] = await Promise.all([
    all(db, `SELECT slug, route, SUM(n) AS n, ROUND(SUM(total_ms) * 1.0 / SUM(n)) AS avg_ms, MAX(max_ms) AS max_ms, SUM(slow_n) AS slow_n FROM perf_stats WHERE day >= ?${sw}
      GROUP BY slug, route HAVING SUM(n) > 0 ORDER BY avg_ms DESC LIMIT 300`, from, ...sa),
    all(db, `SELECT day, route, SUM(n) AS n, SUM(total_ms) AS t, SUM(slow_n) AS slow_n FROM perf_stats WHERE day >= ?${sw} GROUP BY day, route`, from, ...sa),
    all(db, `SELECT p.slug, COALESCE(t.name, '') AS firm, p.route, SUM(p.n) AS n, SUM(p.total_ms) AS t, SUM(p.slow_n) AS slow_n FROM perf_stats p LEFT JOIN tenants t ON t.slug = p.slug
      WHERE p.day >= ? GROUP BY p.slug, p.route`, from).catch(() => []),
  ]);
  const sum = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
      if (EXTERNAL.test(r.route)) continue;
      const e = m.get(r[key]) || { [key]: r[key], firm: r.firm, n: 0, t: 0, slow_n: 0 };
      e.n += r.n; e.t += r.t; e.slow_n += r.slow_n; m.set(r[key], e);
    }
    return [...m.values()].map(({ t, ...e }) => ({ ...e, avg_ms: e.n ? Math.round(t / e.n) : 0 }));
  };
  const daily = sum(byDay, 'day').sort((a, b) => a.day.localeCompare(b.day));
  const firms = sum(byFirm, 'slug').sort((a, b) => b.avg_ms - a.avg_ms);
  const names = new Map(byFirm.map((f) => [f.slug, f.firm]));
  const named = (r) => ({ ...r, firm: r.slug ? names.get(r.slug) || r.slug : 'Ana panel', ext: EXTERNAL.test(r.route) });
  const all_ = routes.map(named);
  return { days, routes: all_.filter((r) => !r.ext).slice(0, 60), external: all_.filter((r) => r.ext).slice(0, 40), daily,
    firms: firms.map((f) => ({ ...f, firm: f.slug ? f.firm || f.slug : 'Ana panel' })) };
}

// Günlük bakım (her panelin kendi veritabanında): büyüyen geçmiş tabloları budanır, sorgu planlayıcının istatistikleri tazelenir
export async function maintain(db) {
  const t = Date.now(), out = {};
  const del = async (k, sql, ...a) => { try { const r = await run(db, sql, ...a); out[k] = (r && r.meta && r.meta.changes) || 0; } catch { /* tablo yoksa geç */ } };
  await del('logs', 'DELETE FROM logs WHERE at < ?', t - 30 * 864e5);
  await del('buybox_history', 'DELETE FROM buybox_history WHERE at < ?', t - 120 * 864e5);
  await del('price_changes', 'DELETE FROM price_changes WHERE at < ?', t - 365 * 864e5);
  await del('notices', 'DELETE FROM notices WHERE resolved_at IS NOT NULL AND resolved_at < ?', t - 30 * 864e5);
  await del('fails', "DELETE FROM settings WHERE (k LIKE 'login_fail:%' OR k LIKE 'tfa_fail:%' OR k LIKE 'lead_rate:%' OR k LIKE 'demo_rate:%') AND json_extract(v, '$.at') < ?", t - 864e5);
  await del('expmail', "DELETE FROM settings WHERE k LIKE 'expmail:%' AND CAST(substr(k, length(k) - 12) AS INTEGER) < ?", t - 30 * 864e5);
  await del('pwreset', "DELETE FROM settings WHERE (k LIKE 'pwreset:%' AND json_extract(v, '$.exp') < ?) OR (k LIKE 'pwreset_rate:%' AND json_extract(v, '$.at') < ?) OR (k LIKE 'pw_rate:%' AND json_extract(v, '$.at') < ?)", t, t - 864e5, t - 864e5);
  await del('push_checks', "DELETE FROM push_checks WHERE at < ?", t - 7 * 864e5);
  await del('perf_stats', 'DELETE FROM perf_stats WHERE day < ?', day(t - 45 * 864e5));
  // Sorgu planlayıcı istatistikleri (indeks seçimi): SQLite'ın önerdiği bakım komutu
  try { await run(db, 'PRAGMA optimize'); out.optimize = true; } catch { out.optimize = false; }
  return out;
}
