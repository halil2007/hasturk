// Ana panelin API'si veritabanının (D1) yanında çalışır.
// Sorun: bir sayfa açılırken 10–40 veritabanı sorgusu yapılır. Worker kullanıcıya en yakın yerde (ör. İstanbul) çalışıp
// veritabanı başka bir bölgedeyse her sorgu o mesafeyi gidip gelir; sorgu başına 40–150 ms, sayfa başına saniyeler eder.
// Çözüm: ana panelin istekleri, veritabanıyla aynı bölgeye yerleştirilen tek bir Durable Object'e (MainPanel) iletilir.
// Kullanıcı ile sunucu arasında tek gidiş-dönüş kalır, sorgular aynı bölgede milisaniyede biter. Tek ve sürekli sıcak örnek
// olduğundan bellekteki önbellekler (oturum, ayarlar, 8 sn yanıt önbelleği) de her istekte işe yarar.
// Veritabanının bölgesi ilk sorgunun yanıtından öğrenilir (meta.served_by_region); öğrenilemezse ya da nesne yanıt vermezse
// istek eskisi gibi doğrudan Worker'da işlenir (okuma istekleri). MAIN_DO=0 ortam değişkeniyle tamamen kapatılabilir.
import { init } from './db.js';
import { handle, report5xx } from './handler.js';
import { PerfBuffer } from './perf.js';
import { eftAdmin } from './billing.js';
import { currentUser } from './auth.js';
import { tenantApi } from './tenants.js';
import { actionSucceeded } from './errors.js';
import { json, HttpError } from './util.js';
import { measure, dbStats, meter, region, serverTiming } from './meter.js';

// Ana panelin istek süreleri (bu örnekte toplanır, birkaç dakikada bir yazılır)
const perfMain = new PerfBuffer();
export const mainPerf = perfMain;

// Durable Object yer ipuçları (Cloudflare): D1 bölge kodlarıyla aynı adlar
const HINTS = ['wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me'];
let probeAt = 0;
// Veritabanının bölgesi: önce bellekte, sonra Cloudflare önbelleğinde (bölge değişmez), yoksa tek bir hafif sorguyla öğrenilir
async function d1Region(env) {
  if (region.d1) return region.d1.toLowerCase();
  const edge = typeof caches !== 'undefined' && caches.default ? caches.default : null, key = 'https://cache.internal/d1-region';
  if (edge) {
    try { const hit = await edge.match(key); if (hit) { region.d1 = (await hit.text()).toUpperCase(); return region.d1.toLowerCase(); } } catch { /* önbellek yok */ }
  }
  if (Date.now() - probeAt < 600e3) return '';
  probeAt = Date.now();
  try { await meter(env.DB).prepare('SELECT 1 AS x').all(); } catch { return ''; }
  if (region.d1 && edge) await edge.put(key, new Response(region.d1, { headers: { 'Cache-Control': 'max-age=86400' } })).catch(() => {});
  return region.d1.toLowerCase();
}

async function mainStub(env) {
  if (!env.MAIN || env.MAIN_DO === '0' || !env.DB) return null;
  const hint = await d1Region(env);
  if (!HINTS.includes(hint)) return null;
  return env.MAIN.get(env.MAIN.idFromName('main:' + hint), { locationHint: hint });
}

// Worker tarafı: isteği veritabanının yanındaki nesneye ilet (olmazsa burada işle)
export async function mainRoute(req, env, ctx, path) {
  const colo = (req.cf && req.cf.colo) || '';
  let stub = null;
  try { stub = await mainStub(env); } catch (e) { console.error('ana panel nesnesi', e); }
  if (!stub) return mainApi(req, env, ctx, path, colo);
  const t0 = Date.now(), body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
  const h = new Headers(req.headers);
  h.set('X-Edge-Colo', colo);
  try {
    const res = await stub.fetch(new Request(req.url, { method: req.method, headers: h, body }));
    return serverTiming(res, Date.now() - t0, null, '', `edge;desc="${colo}"`);
  } catch (e) {
    console.error('ana panel nesnesi yanıt vermedi', e);
    if (!body) return mainApi(new Request(req.url, { method: req.method, headers: req.headers }), env, ctx, path, colo);
    // Yazma isteği nesnede yarıda kalmış olabilir: tekrar burada çalıştırılmaz (iki kez kaydedilmesin)
    return json({ error: 'Sunucu şu an yanıt vermedi; lütfen tekrar deneyin' }, 503);
  }
}

// Ana panel isteğinin kendisi (nesnede ya da yedek olarak Worker'da)
export async function mainApi(req, env, ctx0, path, where = '', inDo = false) {
  env = env.DB ? { ...env, DB: meter(env.DB) } : env;
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
        // Veritabanı açılamayan istekler de hata kayıtlarına düşer (yalnız günlüğe değil)
        if (env.DB) ctx.waitUntil(report5xx(env.DB, req, res, { slug: '', firm: '' }).catch(() => {}));
      }
    }
    const ms = Date.now() - t0, s = dbStats();
    perfMain.add(req.method, path, ms, s);
    perfMain.infra(inDo ? `DO ${region.d1 || '?'}` : where || '?', region.d1, s);
    if (perfMain.due() && env.DB) ctx.waitUntil(perfMain.flush(env.DB).catch(() => {}));
    return serverTiming(res, ms, s, inDo ? `do;desc="${region.d1}"` : '');
  });
}

// Veritabanının yanında çalışan tek nesne (wrangler.jsonc → durable_objects MAIN)
export class MainPanel {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.slice(5).replace(/\/+$/, '');
    return mainApi(req, this.env, { waitUntil: (p) => this.ctx.waitUntil(p) }, path, req.headers.get('X-Edge-Colo') || '', true);
  }
}
