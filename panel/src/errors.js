// Hata kayıtları: müşteri panellerinde (ve ana panelde) oluşan hatalar kendiliğinden ana panelin veritabanına düşer.
//  - client: tarayıcıda yakalanmayan betik hatası
//  - api:    kullanıcının yaptığı işlem hata verdi (ör. "Etiket alınamadı"); hangi işlem, hangi sayfa
//  - server: sunucu hatası (500)
//  - sync:   kanal senkronu / zamanlanmış iş hatası (müşteri panelinin arka planı)
//  - perf:   ortalaması 3 sn'yi aşan işlem (bkz. perf.js)
// Aynı firmadaki aynı hata (sayılar ayıklanmış mesaj + işlem) tek kayıtta toplanır: kaç kez, kimde, ilk / son ne zaman.
// İlk kez görülen ya da çözüldü denip tekrar oluşan hata ana panele bildirim olarak düşer. "Yok say" denen hata sessizce sayılır.
// Kendiliğinden çözülme (auto = neden): aynı firmada aynı işlem sonradan başarıyla yapıldıysa, kanal hatasında o kanalın senkronu
// sonradan başarılı olduysa ya da hata bir süredir hiç tekrarlanmadıysa kayıt "Çözüldü" olur: tek seferlik (anlık) hata 1 saat, 2-3 kez
// görülen 6 saat, daha sık görülen 24 saat tekrarlanmazsa. Hata yeniden oluşursa kayıt yeniden açılır (ve bildirim gelir).
import { all, first, run, notify, resolve } from './db.js';
import { notify as pushNotify } from './push.js';
import { fail, str } from './util.js';

export const SOURCES = { client: 'Ekran hatası', api: 'İşlem hatası', server: 'Sunucu hatası', sync: 'Arka plan / kanal', perf: 'Yavaş işlem' };
const STATUS = ['open', 'resolved', 'ignored'];

// Gruplama anahtarı: rakamlar, uzun kimlikler ve tırnak içi değerler ayıklanır (aynı hata farklı siparişte de tek kayıt)
export const normalize = (m) => String(m || '').replace(/["“”'‘’«»][^"“”'‘’«»]{1,80}["“”'‘’«»]/g, '"…"').replace(/[0-9a-f]{8,}/gi, '#').replace(/\d+([.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 300);
async function sha(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Kullanıcıya gösterilen sıradan doğrulama uyarıları hata sayılmaz (ör. "Ürün seçin", "Şifre hatalı")
const NOISE = /^(Giriş gerekli|Kullanıcı adı veya şifre hatalı|Kod hatalı|Çok fazla hatalı|Doğrulama süresi doldu|Bu (bölüm|işlem) için .*yetki|Bu bölümde yalnız görüntüleme|ResizeObserver loop|Script error\.?$)/i;

export async function recordError(db, e) {
  const message = str(e.message).replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!message || NOISE.test(message)) return null;
  const source = SOURCES[e.source] ? e.source : 'client', slug = str(e.slug).slice(0, 60), action = str(e.action).slice(0, 160), page = str(e.page).slice(0, 160);
  const hash = await sha(`${slug}|${source}|${normalize(message)}|${action.replace(/\d+/g, '#') || page.replace(/\d+/g, '#')}`);
  const now = Date.now(), detail = JSON.stringify(e.detail && typeof e.detail === 'object' ? e.detail : {}).slice(0, 4000);
  const prev = await first(db, 'SELECT status FROM error_reports WHERE hash = ?', hash);
  const r = await first(db, `INSERT INTO error_reports (hash, slug, firm, source, message, action, page, status_code, detail, user_name, count, first_at, last_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'open')
    ON CONFLICT (hash) DO UPDATE SET count = error_reports.count + 1, last_at = excluded.last_at, message = excluded.message, page = excluded.page, status_code = excluded.status_code,
      detail = excluded.detail, user_name = excluded.user_name, firm = excluded.firm,
      status = CASE WHEN error_reports.status = 'resolved' THEN 'open' ELSE error_reports.status END, auto = CASE WHEN error_reports.status = 'resolved' THEN NULL ELSE error_reports.auto END,
      reopened = CASE WHEN error_reports.status = 'resolved' THEN 1 ELSE error_reports.reopened END
    RETURNING id, count, status`,
    hash, slug, str(e.firm).slice(0, 120), source, message, action, page, Number(e.status) || null, detail, str(e.user).slice(0, 80), now, now);
  // Bildirim: ilk kez görülen ya da çözülmüşken tekrar eden hata (yok sayılanlar ve tekrarlar sessiz)
  if (r && r.status === 'open' && (!prev || prev.status === 'resolved')) {
    const title = `${!prev ? 'Yeni hata' : 'Hata tekrarladı'} · ${e.firm || 'Ana panel'}`;
    await notify(db, `err:${r.id}`, { level: 'warn', title, msg: `${SOURCES[source]}${action ? ` (${action})` : ''}: ${message.slice(0, 240)}` }).catch(() => {});
    await pushNotify(db, { title, body: message.slice(0, 140), url: `#/destek?t=hatalar&e=${r.id}` }).catch(() => {});
  }
  // Bakım: çözülen / yok sayılan eski kayıtlar 60 günde silinir
  if (Math.random() < 0.02) await run(db, "DELETE FROM error_reports WHERE status != 'open' AND last_at < ?", now - 60 * 864e5).catch(() => {});
  return r && r.id;
}

// ---------- kendiliğinden çözülme ----------
// Bu süre boyunca tekrarlanmayan hata çözülmüş sayılır: ne kadar seyrek görüldüyse o kadar çabuk (anlık hata 1 saatte kapanır)
export const QUIET = [{ max: 1, ms: 3600e3, why: 'Tek seferlik (anlık) hata; 1 saattir tekrarlanmadı' }, { max: 3, ms: 6 * 3600e3, why: '6 saattir tekrarlanmadı' },
  { max: Infinity, ms: 864e5, why: '24 saattir tekrarlanmadı' }];
const actKey = (a) => String(a || '').split('?')[0].replace(/\d+/g, '#').replace(/\/+$/, '').trim();
async function markResolved(db, rows, reason) {
  if (!rows.length) return 0;
  const now = Date.now();
  for (let i = 0; i < rows.length; i += 90) {
    const part = rows.slice(i, i + 90);
    await run(db, `UPDATE error_reports SET status = 'resolved', reopened = 0, resolved_at = ?, auto = ? WHERE status = 'open' AND id IN (${part.map(() => '?').join(',')})`, now, reason, ...part.map((r) => r.id));
  }
  for (const r of rows) await resolve(db, `err:${r.id}`).catch(() => {});
  return rows.length;
}
// İşlem başarıyla yapıldı (yöntem + adres, ör. "POST orders/#/pack"): aynı firmanın bu işlemdeki açık hataları çözülür.
// Sık istekte veritabanı yorulmasın diye aynı işlem 5 dakikada bir denetlenir (çağıran örnek başına).
const okSeen = new Map();
export async function actionSucceeded(db, slug, action) {
  const key = `${slug}|${actKey(action)}`, now = Date.now();
  if (!db || (okSeen.get(key) || 0) > now - 300e3) return 0;
  okSeen.set(key, now);
  if (okSeen.size > 2000) okSeen.clear();
  const rows = await all(db, "SELECT id, action, last_at FROM error_reports WHERE status = 'open' AND slug = ? AND source IN ('api', 'server') AND action != '' AND last_at < ?", slug || '', now - 1000);
  return markResolved(db, rows.filter((r) => actKey(r.action) === actKey(action)), 'İşlem sonradan başarıyla yapıldı');
}
// Senkron sonucu (syncAll → channels): sayı dönen kanalın açık kanal hataları çözülür; senkron tamamen başarılıysa "Senkron durdu" da
export async function syncSucceeded(db, slug, result, failed) {
  if (!db || !result || !result.channels) return 0;
  const ok = Object.entries(result.channels).filter(([, v]) => typeof v === 'number').map(([id]) => `kanal: ${id}`);
  if (!failed) ok.push('senkron');
  if (!ok.length) return 0;
  const rows = await all(db, `SELECT id FROM error_reports WHERE status = 'open' AND slug = ? AND source = 'sync' AND action IN (${ok.map(() => '?').join(',')}) AND last_at < ?`, slug || '', ...ok, Date.now() - 1000);
  return markResolved(db, rows, 'Kanal senkronu sonradan başarılı oldu');
}
// Bir süredir tekrarlanmayan açık hatalar (yavaş işlem dahil): sayısına göre 1 saat / 6 saat / 24 saat
export async function resolveQuiet(db, now = Date.now()) {
  let n = 0, lo = 0;
  for (const q of QUIET) {
    const rows = await all(db, `SELECT id FROM error_reports WHERE status = 'open' AND count > ?${q.max === Infinity ? '' : ' AND count <= ?'} AND last_at < ? LIMIT 500`,
      lo, ...(q.max === Infinity ? [] : [q.max]), now - q.ms);
    n += await markResolved(db, rows, q.why);
    lo = q.max;
  }
  return n;
}

// Ana panel (yönetici): hata listesi, ayrıntı, durum
export async function errorsApi(req, db, path, q, b) {
  const m = req.method;
  let x;
  if (path === 'errors' && m === 'GET') {
    const where = [], args = [];
    if (STATUS.includes(q.status)) { where.push('status = ?'); args.push(q.status); }
    if (SOURCES[q.source]) { where.push('source = ?'); args.push(q.source); }
    if (q.slug != null && q.slug !== '') { where.push('slug = ?'); args.push(q.slug === '-' ? '' : q.slug); }
    if (q.q) { where.push('(message LIKE ? OR firm LIKE ? OR action LIKE ?)'); const s = '%' + q.q + '%'; args.push(s, s, s); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [items, counts, firms] = await Promise.all([
      all(db, `SELECT id, slug, firm, source, message, action, page, status_code, user_name, count, first_at, last_at, status, reopened, auto, resolved_at FROM error_reports ${W} ORDER BY (status = 'open') DESC, last_at DESC LIMIT 300`, ...args),
      all(db, 'SELECT status, COUNT(*) AS n, SUM(count) AS total FROM error_reports GROUP BY status'),
      all(db, "SELECT slug, MAX(firm) AS firm, COUNT(*) AS n FROM error_reports WHERE status = 'open' GROUP BY slug ORDER BY n DESC LIMIT 50"),
    ]);
    const day = await first(db, 'SELECT COALESCE(SUM(count), 0) AS n FROM error_reports WHERE last_at >= ?', Date.now() - 864e5);
    return { items, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])), firms, last24: day.n, sources: SOURCES };
  }
  if (path === 'errors/count' && m === 'GET') return { n: (await first(db, "SELECT COUNT(*) AS n FROM error_reports WHERE status = 'open'")).n };
  if ((x = path.match(/^errors\/(\d+)$/)) && m === 'GET') {
    const e = await first(db, 'SELECT * FROM error_reports WHERE id = ?', Number(x[1]));
    if (!e) fail(404, 'Kayıt bulunamadı');
    let detail = {};
    try { detail = JSON.parse(e.detail || '{}'); } catch { /* boş */ }
    // Aynı firmanın bu hatayla ilgili destek talepleri (müşteri ayrıca bildirdiyse)
    const key = e.message.slice(0, 40).replace(/[%_]/g, '');
    const tickets = await all(db, `SELECT id, subject, status, created_at FROM support_tickets WHERE slug = ? AND (subject LIKE ? OR context LIKE ?) ORDER BY id DESC LIMIT 5`, e.slug, '%' + key + '%', '%' + key + '%');
    return { ...e, detail, tickets };
  }
  if ((x = path.match(/^errors\/(\d+)\/status$/)) && m === 'POST') {
    if (!STATUS.includes(b.status)) fail(400, 'Geçersiz durum');
    await run(db, 'UPDATE error_reports SET status = ?, reopened = 0, auto = NULL, resolved_at = ? WHERE id = ?', b.status, b.status === 'open' ? null : Date.now(), Number(x[1]));
    await resolve(db, `err:${x[1]}`);
    return { ok: true };
  }
  if (path === 'errors/bulk' && m === 'POST') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean).slice(0, 500);
    if (!STATUS.includes(b.status) || !ids.length) fail(400, 'Kayıt seçin');
    for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); await run(db, `UPDATE error_reports SET status = ?, reopened = 0, auto = NULL, resolved_at = ? WHERE id IN (${part.map(() => '?').join(',')})`, b.status, b.status === 'open' ? null : Date.now(), ...part); }
    return { ok: true, n: ids.length };
  }
  fail(404, 'Bulunamadı');
}

// Tarayıcıdan gelen hata bildirimi (istemci tarafı): alanlar sınırlandırılır
export function clientReport(b, c) {
  return {
    slug: c.slug || '', firm: c.firm || '', user: c.user ? c.user.name || c.user.username : '', source: ['client', 'api'].includes(b.source) ? b.source : 'client',
    message: b.message, action: b.action, page: b.page, status: b.status,
    detail: { stack: str(b.stack).slice(0, 2500), browser: str(b.browser).slice(0, 200), screen: str(b.screen).slice(0, 20), version: str(b.version).slice(0, 20) },
  };
}
