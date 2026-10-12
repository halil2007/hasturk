// /api/* isteklerinin işlenmesi. Ana panel (env.DB) ve müşteri panelleri (her biri kendi Durable Object veritabanında,
// bkz. tenants.js) aynı kodu kullanır; böylece her güncelleme tüm panellere aynı anda gelir.
import { turnstileSiteKey } from './turnstile.js';
import { planInfo } from './plans.js';
import { init, getSettings, getLogo } from './db.js';
import { logoPath } from './mail.js';
import { api } from './api.js';
import { currentUser, login, loginSecond, loginMail, logoutCookie, password, security } from './auth.js';
import { json, body, HttpError } from './util.js';

// Kısa süreli yanıt önbelleği (Durable Object / Worker örneği başına): çok kişinin aynı anda açtığı ağır okuma ekranları
// (özet, genel bakış, sipariş / ürün listeleri, raporlar) aynı kullanıcı ve aynı sorgu için 8 sn içinde yeniden hesaplanmaz.
// Herhangi bir yazma isteği ya da senkron önbelleği hemen boşaltır; "Yenile" (X-Fresh) önbelleği atlar.
const CACHEABLE = /^(summary|dashboard|orders|products|stats|customers|customers\/summary|buybox|channels|finance|finance\/products|packages|suggestions|picklist)$/;
const CACHE_TTL = 8e3;
const caches = new WeakMap();
const cacheOf = (db) => { let c = caches.get(db); if (!c) caches.set(db, (c = new Map())); return c; };
export const bumpCache = (db, uid) => {
  const c = caches.get(db); if (!c) return;
  if (uid == null) { c.bytes = 0; return c.clear(); }
  // Yazan kişinin önbelleği hemen boşalır (değişikliğini görsün); diğer kullanıcılarda en geç 8 sn sonra yenilenir
  for (const [k, v] of c) if (k.startsWith(uid + '|')) { c.bytes -= v.body.length; c.delete(k); }
};

export async function handle(req, env, ctx, db) {
  const url = new URL(req.url);
  if (!db) return json({ error: 'Veritabanı bağlı değil (wrangler.jsonc → d1_databases)' }, 503);
  const path = url.pathname.slice(5).replace(/\/+$/, '');
  try {
    await init(db);
    // Başka sitelerden gelen yazma isteklerini reddet (çerez SameSite=Strict + Origin kontrolü)
    if (req.method !== 'GET') {
      const o = req.headers.get('Origin');
      if (o && new URL(o).host !== url.host) return json({ error: 'İzin verilmeyen kaynak' }, 403);
    }
    // Giriş ekranı için firma adı ve logo (giriş gerektirmez)
    if (path === 'brand') {
      const s = await getSettings(db);
      return json({ title: s.company.title, legal: s.company.legal, logo: logoPath(env, s) || null, demo: env.DEMO === '1', turnstile: turnstileSiteKey(env) });
    }
    // Firma logosu (giriş gerektirmez): e-postalarda görünsün diye görsel olarak sunulur (ayarlardaki data: adresinden)
    if (path === 'logo' && req.method === 'GET') {
      const m = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/.exec(await getLogo(db));
      if (!m) return new Response('Logo yok', { status: 404 });
      // Logo doğrudan açılsa bile içindeki betik çalışmaz (SVG): kum havuzu CSP + nosniff
      return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': m[1], 'Cache-Control': url.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox", 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="logo"' } });
    }
    if (path === 'login' && req.method === 'POST') {
      const b = await body(req);
      const r = b && b.mailticket ? await loginMail(req, env, db, b) : b && b.ticket ? await loginSecond(req, env, db, b) : await login(req, env, db, b);
      if (r.twofa) return json({ twofa: true, ticket: r.ticket });
      if (r.emailcode) return json({ emailcode: true, ticket: r.ticket, to: r.to, resent: !!r.resent });
      return r.ok ? json({ ok: true, user: r.user, tenant: env.TENANT_SLUG || null, recoveryUsed: r.recoveryUsed, recoveryLeft: r.recoveryLeft }, 200, { 'Set-Cookie': r.cookie }) : json({ error: r.error, restart: r.restart }, r.status);
    }
    if (path === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie() });
    const user = await currentUser(req, env, db);
    if (!user) return json({ error: 'Giriş gerekli', setup: !password(env) && !env.TENANT_SLUG, demo: env.DEMO === '1' }, 401);
    // İki adımlı doğrulama zorunluysa ve kullanıcı henüz açmadıysa yalnız kurulum ekranı çalışır
    const need2fa = !user.support && !user.twofa && (await security(db)).require2fa;
    if (path === 'me') return json({ ok: true, user, need2fa, demo: env.DEMO === '1', tenant: env.TENANT_SLUG ? { slug: env.TENANT_SLUG, name: env.TENANT_NAME || env.TENANT_SLUG, ...planInfo(env) } : null });
    // İlk girişte şifre değiştirme zorunlu (online satışla açılan panelin geçici şifresi): yalnız şifre değiştirme ve özet çalışır
    if (user.mustChange && !/^(me\/password|summary|me|brand|logo|errors\/report)$/.test(path)) return json({ error: 'Devam etmek için önce geçici şifrenizi değiştirin', mustChange: true }, 403);
    if (need2fa && !path.startsWith('me/2fa') && !/^(brand|logo)$/.test(path)) return json({ error: 'Yöneticiniz iki adımlı doğrulamayı zorunlu tuttu; devam etmek için açın', need2fa: true }, 403);
    // Tarayıcının ölçtüğü sayfa açılış / istek süreleri (dakikada en fazla bir kez gönderilir; bkz. public/core.js perfBeacon)
    if (path === 'perf/client' && req.method === 'POST') { if (ctx.perf && !user.support && env.DEMO !== '1') ctx.perf.client(await body(req)); return json({ ok: true }); }
    if (req.method !== 'GET') { const r = await api(req, env, ctx, db, path, user); bumpCache(db, user.id); return r; }
    if (!CACHEABLE.test(path)) return await api(req, env, ctx, db, path, user);
    const c = cacheOf(db), key = `${user.id}|${user.role}|${user.support ? 1 : 0}|${JSON.stringify(user.perms || null)}|${path}${url.search}`, now = Date.now(), hit = c.get(key);
    if (hit && now - hit.at < CACHE_TTL && !req.headers.get('X-Fresh')) return new Response(hit.body, { status: 200, headers: hit.headers });
    const r = await api(req, env, ctx, db, path, user);
    if (r.status === 200 && /json/.test(r.headers.get('Content-Type') || '')) {
      const text = await r.text(), headers = [...r.headers];
      // Bellek sınırı: büyük yanıt (256 KB üstü) saklanmaz, toplam ~16 MB'ı aşınca eskiler atılır
      if (text.length <= 256e3) {
        if (c.size > 300 || (c.bytes || 0) > 16e6) for (const [k, v] of c) if (now - v.at >= CACHE_TTL || (c.bytes || 0) > 16e6) { c.bytes -= v.body.length; c.delete(k); }
        if (c.size < 500) { const old = c.get(key); if (old) c.bytes -= old.body.length; c.set(key, { at: now, body: text, headers }); c.bytes = (c.bytes || 0) + text.length; }
      }
      return new Response(text, { status: 200, headers });
    }
    return r;
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof URIError) return json({ error: 'Geçersiz adres' }, 400); // bozuk %-kodlu adres sunucu hatası sayılmaz
    console.error(e);
    // Hata kaydı için yığın (yanıta eklenmez; panelin sarmalayıcısı okur, bkz. errors.js)
    // Veritabanı iç hata metni kullanıcıya gösterilmez (tablo / sorgu yapısı sızmasın); hata kaydında tam metin kalır
    const internal = /SQLITE|D1_|no such (table|column)|syntax error|constraint failed|datatype mismatch/i.test(String(e.message || ''));
    const r = json({ error: internal ? 'Sunucu hatası; kayıt alındı, inceleniyor' : e.message || 'Sunucu hatası' }, 500);
    if (internal) r.errMsg = String(e.message).slice(0, 500);
    r.errStack = String((e && e.stack) || '').slice(0, 2500);
    return r;
  }
}

// Sunucu hatasını (5xx) ana panelin hata kayıtlarına yaz
export async function report5xx(mainDb, req, res, c) {
  if (!mainDb || res.status < 500) return;
  // Adresteki kimlikler tek kalıba indirilir (her farklı adres ayrı hata kaydı / bildirim açmasın)
  const url = new URL(req.url), path = url.pathname.slice(5).replace(/\/+$/, '').split('/').slice(0, 6).map((x) => (/^[a-z][a-z0-9_-]{0,40}$/.test(x) && !/\d/.test(x) ? x : ':x')).join('/');
  let msg = '';
  try { msg = res.errMsg || (await res.clone().json()).error || ''; } catch { msg = `HTTP ${res.status}`; }
  const { recordError } = await import('./errors.js');
  await init(mainDb);
  await recordError(mainDb, { ...c, source: 'server', message: msg || `HTTP ${res.status}`, action: `${req.method} ${path}`, status: res.status, detail: { stack: res.errStack || '' } });
}
