// /api/* isteklerinin işlenmesi. Ana panel (env.DB) ve müşteri panelleri (her biri kendi Durable Object veritabanında,
// bkz. tenants.js) aynı kodu kullanır; böylece her güncelleme tüm panellere aynı anda gelir.
import { init, getSettings, getLogo } from './db.js';
import { logoPath } from './mail.js';
import { api } from './api.js';
import { currentUser, login, loginSecond, logoutCookie, password, security } from './auth.js';
import { json, body, HttpError } from './util.js';

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
      return json({ title: s.company.title, legal: s.company.legal, logo: logoPath(env, s) || null, demo: env.DEMO === '1' });
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
      const r = b && b.ticket ? await loginSecond(req, env, db, b) : await login(req, env, db, b);
      if (r.twofa) return json({ twofa: true, ticket: r.ticket });
      return r.ok ? json({ ok: true, user: r.user, tenant: env.TENANT_SLUG || null, recoveryUsed: r.recoveryUsed, recoveryLeft: r.recoveryLeft }, 200, { 'Set-Cookie': r.cookie }) : json({ error: r.error, restart: r.restart }, r.status);
    }
    if (path === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie() });
    const user = await currentUser(req, env, db);
    if (!user) return json({ error: 'Giriş gerekli', setup: !password(env) && !env.TENANT_SLUG, demo: env.DEMO === '1' }, 401);
    // İki adımlı doğrulama zorunluysa ve kullanıcı henüz açmadıysa yalnız kurulum ekranı çalışır
    const need2fa = !user.support && !user.twofa && (await security(db)).require2fa;
    if (path === 'me') return json({ ok: true, user, need2fa, demo: env.DEMO === '1', tenant: env.TENANT_SLUG ? { slug: env.TENANT_SLUG, name: env.TENANT_NAME || env.TENANT_SLUG } : null });
    if (need2fa && !path.startsWith('me/2fa') && !/^(brand|logo)$/.test(path)) return json({ error: 'Yöneticiniz iki adımlı doğrulamayı zorunlu tuttu; devam etmek için açın', need2fa: true }, 403);
    return await api(req, env, ctx, db, path, user);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    // Hata kaydı için yığın (yanıta eklenmez; panelin sarmalayıcısı okur, bkz. errors.js)
    const r = json({ error: e.message || 'Sunucu hatası' }, 500);
    r.errStack = String((e && e.stack) || '').slice(0, 2500);
    return r;
  }
}

// Sunucu hatasını (5xx) ana panelin hata kayıtlarına yaz
export async function report5xx(mainDb, req, res, c) {
  if (!mainDb || res.status < 500) return;
  const url = new URL(req.url), path = url.pathname.slice(5).replace(/\/+$/, '');
  let msg = '';
  try { msg = (await res.clone().json()).error || ''; } catch { msg = `HTTP ${res.status}`; }
  const { recordError } = await import('./errors.js');
  await init(mainDb);
  await recordError(mainDb, { ...c, source: 'server', message: msg || `HTTP ${res.status}`, action: `${req.method} ${path}`, status: res.status, detail: { stack: res.errStack || '' } });
}
