// Ana panel kullanıcıya yakın bölgede, kendi yerel veritabanıyla çalışır.
// Ölçüm (Destek → Sistem hızı): ana veritabanı (D1) Asya-Pasifik'te; Türkiye'den her sorgu ~80–250 ms, bir sayfa 10–40 sorgu
// yaptığından saniyeler ediyordu. Çözüm: ana panelin mağaza verisi (sipariş, ürün, stok, ilan, ayarlar …) Avrupa'ya yerleştirilen
// tek bir Durable Object'in (MainPanel) yerel SQLite veritabanına taşınır; sorgular mikro saniyede biter (müşteri panelleri de
// böyle çalışır). Müşteri panelleriyle / siteyle ortak tablolar ana veritabanında kalır (bkz. router.js).
// Taşıma: nesne ilk istekte ana veritabanındaki mağaza tablolarını parça parça kopyalar (birkaç dakika; bu sırada panel
// "taşınıyor" der, senkron bekler). Bitince ana veritabanına "main_local" işareti yazılır; o andan sonra mağaza verisi yalnız
// nesnededir: Worker eski veritabanındaki kopyayla asla çalışmaz (yazma da senkron da). Senkron Worker'ın zamanlayıcısından
// nesneye iletilir.
import { init, TABLES } from './db.js';
import { handle, report5xx } from './handler.js';
import { PerfBuffer } from './perf.js';
import { eftAdmin } from './billing.js';
import { currentUser } from './auth.js';
import { tenantApi } from './tenants.js';
import { actionSucceeded } from './errors.js';
import { json, HttpError } from './util.js';
import { measure, dbStats, meter, region, serverTiming } from './meter.js';
import { doD1 } from './dosql.js';
import { routeDb, LOCAL_TABLES } from './router.js';
import { edgeCached, edgeDrop } from './edgecache.js';
import { syncAll, quickSync } from './sync.js';
import { serveImage } from './prodimg.js';
import { extApiInner } from './extapi.js';

// Ana panelin istek süreleri (bu örnekte toplanır, birkaç dakikada bir yazılır)
const perfMain = new PerfBuffer();
export const mainPerf = perfMain;

// Nesnenin bölgesi (Cloudflare yer ipucu): kullanıcılar Türkiye'de → Doğu Avrupa. MAIN_HINT ile değiştirilebilir
// (değişirse yeni bir nesne kurulur ve taşıma baştan yapılır; eski nesnedeki yeni veriler taşınmaz — değiştirmeyin).
const HINTS = ['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me'];
const hintOf = (env) => (HINTS.includes(String(env.MAIN_HINT || '').toLowerCase()) ? String(env.MAIN_HINT).toLowerCase() : 'eeur');
export const MAIN_FLAG = 'main_local';
const stubOf = (env) => { const h = hintOf(env); return env.MAIN.get(env.MAIN.idFromName('main-local:' + h), { locationHint: h }); };
// Taşıma tamamlandı mı (ana veritabanındaki işaret; kenar önbelleğinde 1 dk)
export const migratedFlag = (env) => edgeCached(MAIN_FLAG, 60e3, async () => {
  await init(env.DB);
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(MAIN_FLAG).first();
  return r ? JSON.parse(r.v) : null;
}, env.DB).catch(() => null);
// Ana panel nesnede mi? MAIN_DO=0 acil durum anahtarıdır: yalnız taşıma bitmeden işe yarar (bittiyse mağaza verisi yalnız nesnede)
export async function mainOn(env) {
  if (!env.MAIN || !env.DB) return false;
  return env.MAIN_DO === '0' ? !!(await migratedFlag(env)) : true;
}

// Worker → nesne (gövde bir kez okunur)
async function toMain(env, req, url = req.url, extra = {}) {
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
  const h = new Headers(req.headers);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return stubOf(env).fetch(new Request(url, { method: req.method, headers: h, body }));
}

// Worker tarafı: ana panel isteği nesneye gider. Nesne yanıt vermezse: taşıma bitmemişse okuma istekleri eskisi gibi burada
// (ana veritabanından) yanıtlanır; taşıma bittiyse ya da istek yazmaysa yanıt verilmez (eski kopyaya yazılmasın).
export async function mainRoute(req, env, ctx, path) {
  const colo = (req.cf && req.cf.colo) || '';
  if (!(await mainOn(env))) return mainApi(req, env, ctx, path, colo);
  const t0 = Date.now(), read = req.method === 'GET' || req.method === 'HEAD';
  const backup = read ? new Request(req.url, { method: req.method, headers: req.headers }) : null;
  try {
    const res = await toMain(env, req, req.url, { 'X-Edge-Colo': colo });
    return serverTiming(res, Date.now() - t0, null, '', `edge;desc="${colo}"`);
  } catch (e) {
    console.error('ana panel nesnesi yanıt vermedi', e);
    if (backup && !(await migratedFlag(env))) return mainApi(backup, env, ctx, path, colo);
    return json({ error: 'Sunucu şu an yanıt vermedi; lütfen birkaç saniye sonra tekrar deneyin' }, 503);
  }
}
// Ana panelin ürün fotoğrafı (/img/_/…) ve dış API (stok aktarımı): nesneden
export async function mainImage(env, req, id) {
  if (!(await mainOn(env))) { await init(env.DB); return serveImage(env.DB, req, id); }
  return toMain(env, new Request(req.url, { method: req.method, headers: req.headers.get('If-None-Match') ? { 'If-None-Match': req.headers.get('If-None-Match') } : {} }), `https://main.internal/__img/${id}`);
}
export async function mainExtApi(env, url, store, rkey) {
  if (!(await mainOn(env))) return extApiInner(env.DB, url, store, rkey);
  return toMain(env, new Request(url.href), url.href, { 'X-Ext-Store': encodeURIComponent(JSON.stringify(store)), 'X-Ext-Key': rkey });
}
// Zamanlanmış senkron (Worker'ın zamanlayıcısından): ana panelin senkronu nesnede çalışır
export async function mainCron(env, quick) {
  if (!(await mainOn(env))) return quick ? quickSync(env, env.DB) : syncAll(env, env.DB, { cron: true });
  const r = await stubOf(env).fetch(new Request(`https://main.internal/__cron${quick ? '?quick=1' : ''}`, { method: 'POST' }));
  return r.json().catch(() => ({ status: r.status }));
}

// Ana panel isteğinin kendisi (nesnede; nesne yoksa Worker'da)
export async function mainApi(req, env, ctx0, path, where = '', inDo = '') {
  // Nesnede env.DB yönlendiricidir (yerel + ortak); ölçüm ortak veritabanı sorgularını sayar (bkz. MainPanel)
  env = env.DB && !env.DB.routed ? { ...env, DB: meter(env.DB) } : env;
  const ctx = { waitUntil: (p) => ctx0.waitUntil(p), perf: perfMain };
  return measure(async () => {
    const t0 = Date.now();
    let res;
    try {
      if (path === 'tenants' || path.startsWith('tenants/')) {
        // Ana panel: müşteri panellerinin yönetimi (Kullanıcılar → Müşteri panelleri)
        if (!env.DB) return json({ error: 'Veritabanı bağlı değil' }, 503);
        await init(env.DB);
        const user = await currentUser(req, env, env.DB);
        if (!user) return json({ error: 'Giriş gerekli' }, 401);
        // Havale / EFT ile gelen siparişler (onay → panel açılır / süre uzar)
        if (path === 'tenants/eft' || path.startsWith('tenants/eft/')) res = json(await eftAdmin(req, env, path, user));
        else {
          const r = await tenantApi(req, env, env.DB, path, user);
          // Destek girişi: çerez ana panelin yanıtıyla verilir, tarayıcı müşteri paneline geçer
          res = r && r.cookie ? json({ ok: true }, 200, { 'Set-Cookie': r.cookie }) : json(r);
        }
      } else {
        res = await handle(req, env, ctx, env.DB);
        if (res.status >= 500) ctx.waitUntil(report5xx(env.DB, req, res, { slug: '', firm: '' }).catch(() => {}));
        else if (res.status < 400 && env.DB && path !== 'errors/report') ctx.waitUntil(actionSucceeded(env.DB, '', `${req.method} ${path}`).catch(() => {}));
      }
    } catch (e) {
      if (e instanceof HttpError) res = json({ error: e.message }, e.status);
      else {
        console.error(e);
        res = json({ error: e.message || 'Sunucu hatası' }, 500);
        if (env.DB) ctx.waitUntil(report5xx(env.DB, req, res, { slug: '', firm: '' }).catch(() => {}));
      }
    }
    const ms = Date.now() - t0, s = dbStats();
    perfMain.add(req.method, path, ms, s);
    perfMain.infra(inDo ? `DO ${inDo}` : where || '?', region.d1, s);
    if (perfMain.due() && env.DB) ctx.waitUntil(perfMain.flush(env.DB).catch(() => {}));
    return serverTiming(res, ms, s, inDo ? `do;desc="${inDo}"` : '');
  });
}

// ---------- taşıma (ana veritabanı → nesnenin yerel veritabanı) ----------
// Büyük satırlı tablolar küçük parçalarla (ürün fotoğrafları base64 olarak saklanır)
const CHUNK = { product_images: 20 };
const STEP_MS = 20e3;
export async function migrateStep(ctx, env, local, now = Date.now) {
  const st = (await ctx.storage.get('mig')) || { ti: 0, after: 0, rows: 0, started: now() };
  if (st.done) return st;
  const remote = meter(env.DB), sql = ctx.storage.sql, t0 = now();
  if (!st.ti && !st.after) await init(local);
  const tables = LOCAL_TABLES;
  while (st.ti < tables.length && now() - t0 < STEP_MS) {
    const t = tables[st.ti];
    let rows;
    try {
      try { rows = (await remote.prepare(`SELECT rowid AS __r, * FROM ${t} WHERE rowid > ? ORDER BY rowid LIMIT ?`).bind(st.after, CHUNK[t] || 400).all()).results || []; }
      catch (e) { if (/no such table/i.test(e.message)) rows = []; else throw e; }
      if (!rows.length) { st.ti++; st.after = 0; st.fails = 0; await ctx.storage.put('mig', st); continue; }
      const cols = new Set(sql.exec(`PRAGMA table_info(${t})`).toArray().map((c) => c.name));
      ctx.storage.transactionSync(() => {
        for (const r of rows) {
          const keys = Object.keys(r).filter((k) => k !== '__r' && cols.has(k));
          sql.exec(`INSERT OR REPLACE INTO ${t} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => (r[k] === undefined ? null : r[k])));
        }
      });
      st.after = rows[rows.length - 1].__r; st.rows += rows.length; st.fails = 0;
    } catch (e) {
      // Aynı parça üst üste 3 kez kopyalanamazsa o tablonun kalanı atlanır (panel kilitli kalmasın); hata kaydına yazılır
      st.fails = (st.fails || 0) + 1; st.err = `${t}: ${String(e.message || e).slice(0, 200)}`;
      if (st.fails < 3) { await ctx.storage.put('mig', st); throw e; }
      (st.skipped = st.skipped || []).push(st.err); st.ti++; st.after = 0; st.fails = 0;
    }
    await ctx.storage.put('mig', st);
  }
  if (st.ti >= tables.length) {
    st.done = true; st.at = now();
    await ctx.storage.put('mig', st);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind(MAIN_FLAG, JSON.stringify({ at: st.at, rows: st.rows, hint: hintOf(env), skipped: st.skipped || [] })).run();
    if (st.skipped && st.skipped.length) {
      const { recordError } = await import('./errors.js');
      await recordError(env.DB, { slug: '', firm: '', source: 'server', message: `Ana panel taşıma: ${st.skipped.length} tablonun bir kısmı kopyalanamadı`, action: 'taşıma', detail: { skipped: st.skipped } }).catch(() => {});
    }
    await edgeDrop(MAIN_FLAG, env.DB).catch(() => {});
  }
  return st;
}
const pct = (st) => (st.done ? 100 : Math.min(99, Math.round(((st.ti || 0) / Math.max(1, LOCAL_TABLES.length)) * 100)));

// Bildirimler ve bildirim abonelikleri sonradan ortak tabloya alındı: taşımadan sonra yerelde oluşanlar bir kez ana veritabanına
// (aynı bildirim iki yerde varsa son güncellenen kalır; abonelik varsa dokunulmaz)
export async function backCopy(ctx, remote) {
  if (await ctx.storage.get('g:notices')) return 0;
  const sql = ctx.storage.sql, rows = (q) => { try { return sql.exec(q).toArray(); } catch { return []; } };
  const stmts = [];
  for (const r of rows('SELECT key, level, channel, title, msg, count, first_at, last_at, read, resolved_at FROM notices'))
    stmts.push(remote.prepare(`INSERT INTO notices (key, level, channel, title, msg, count, first_at, last_at, read, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET level = excluded.level, channel = excluded.channel, title = excluded.title, msg = excluded.msg, count = excluded.count,
        first_at = excluded.first_at, last_at = excluded.last_at, read = excluded.read, resolved_at = excluded.resolved_at WHERE excluded.last_at > notices.last_at`)
      .bind(r.key, r.level, r.channel, r.title, r.msg, r.count, r.first_at, r.last_at, r.read, r.resolved_at));
  for (const r of rows('SELECT endpoint, user_id, ua, created_at FROM push_subs'))
    stmts.push(remote.prepare('INSERT OR IGNORE INTO push_subs (endpoint, user_id, ua, created_at) VALUES (?, ?, ?, ?)').bind(r.endpoint, r.user_id, r.ua, r.created_at));
  for (let i = 0; i < stmts.length; i += 50) await remote.batch(stmts.slice(i, i + 50));
  await ctx.storage.put('g:notices', Date.now());
  return stmts.length;
}

// Kullanıcıya yakın, kendi veritabanıyla çalışan tek nesne (wrangler.jsonc → durable_objects MAIN)
export class MainPanel {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.local = doD1(ctx.storage); this.db = routeDb(this.local, meter(env.DB)); this.ok = false; }
  async ready() {
    if (this.ok) return true;
    const st = await this.ctx.storage.get('mig');
    if (st && st.done) {
      await backCopy(this.ctx, this.db.remote).catch((e) => console.error('bildirimler ana veritabanına kopyalanamadı', e));
      this.ok = true; this.fresh(); return true;
    }
    // Taşıma sürüyor / başlamadı: zamanlayıcı kurulu değilse hemen başlat
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now());
    return false;
  }
  // Nesne yeni başladıysa önceki örneğin yarıda kalan senkron kilidi geçersizdir (müşteri panellerindeki gibi)
  fresh() { if (this.unlocked) return; this.unlocked = true; try { this.ctx.storage.sql.exec("DELETE FROM settings WHERE k IN ('sync_lock', 'quick_lock')"); } catch { /* tablo yok */ } }
  async alarm() {
    const st = await migrateStep(this.ctx, this.env, this.local).catch((e) => { console.error('ana panel taşıma hatası', e); return null; });
    if (!st) return void (await this.ctx.storage.setAlarm(Date.now() + 30e3));
    if (!st.done) await this.ctx.storage.setAlarm(Date.now() + 50);
    else { await this.ctx.storage.put('g:notices', Date.now()); this.ok = true; this.fresh(); console.log('ana panel taşındı', JSON.stringify(st)); }
  }
  async fetch(req) {
    const url = new URL(req.url), env = { ...this.env, DB: this.db };
    const ok = await this.ready();
    if (url.pathname === '/__cron') {
      if (!ok) return json({ migrating: true, pct: pct((await this.ctx.storage.get('mig')) || {}) });
      await init(this.db);
      const quick = url.searchParams.get('quick') === '1';
      return json(await (quick ? quickSync(env, this.db) : syncAll(env, this.db, { cron: true })));
    }
    // Taşıma bitmeden fotoğraf ve dış API ana veritabanından (yalnız okuma)
    const rdb = ok ? this.db : meter(this.env.DB);
    if (url.pathname.startsWith('/__img/')) { await init(rdb); return serveImage(rdb, req, url.pathname.slice(7)); }
    if (url.pathname.startsWith('/__api/')) {
      await init(rdb);
      let store = { slug: 'ana-panel', name: 'Ana mağaza' };
      try { store = JSON.parse(decodeURIComponent(req.headers.get('X-Ext-Store') || '')) || store; } catch { /* varsayılan */ }
      return extApiInner(rdb, url, store, req.headers.get('X-Ext-Key') || 'main');
    }
    if (!ok) {
      const st = (await this.ctx.storage.get('mig')) || {};
      return json({ error: `Panel yeni, hızlı altyapısına taşınıyor (%${pct(st)}). Birkaç dakika sürer; sayfa kendiliğinden açılacak.`, migrating: true, pct: pct(st) }, 503, { 'Retry-After': '5' });
    }
    const path = url.pathname.slice(5).replace(/\/+$/, '');
    return mainApi(req, env, { waitUntil: (p) => this.ctx.waitUntil(p) }, path, req.headers.get('X-Edge-Colo') || '', 'yerel');
  }
}
