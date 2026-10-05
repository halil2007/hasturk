// /api/* isteklerinin işlenmesi. Ana panel (env.DB) ve müşteri panelleri (her biri kendi Durable Object veritabanında,
// bkz. tenants.js) aynı kodu kullanır; böylece her güncelleme tüm panellere aynı anda gelir.
import { init, getSettings } from './db.js';
import { api } from './api.js';
import { currentUser, login, logoutCookie, password } from './auth.js';
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
      return json({ title: s.company.title, legal: s.company.legal, logo: s.logo || null, demo: env.DEMO === '1' });
    }
    if (path === 'login' && req.method === 'POST') {
      const r = await login(req, env, db, await body(req));
      return r.ok ? json({ ok: true, user: r.user, tenant: env.TENANT_SLUG || null }, 200, { 'Set-Cookie': r.cookie }) : json({ error: r.error }, r.status);
    }
    if (path === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie() });
    const user = await currentUser(req, env, db);
    if (!user) return json({ error: 'Giriş gerekli', setup: !password(env) && !env.TENANT_SLUG, demo: env.DEMO === '1' }, 401);
    if (path === 'me') return json({ ok: true, user, demo: env.DEMO === '1', tenant: env.TENANT_SLUG ? { slug: env.TENANT_SLUG, name: env.TENANT_NAME || env.TENANT_SLUG } : null });
    return await api(req, env, ctx, db, path, user);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: e.message || 'Sunucu hatası' }, 500);
  }
}
