// Satış paneli Worker'ı: /api/* → panel API'si, diğer adresler → public/ (panel arayüzü).
// Zamanlanmış görev (wrangler.jsonc → triggers): 10 dakikada bir tüm kanalları senkronlar.
import { init } from './db.js';
import { api } from './api.js';
import { syncAll } from './sync.js';
import { isAuthed, login, logoutCookie, password } from './auth.js';
import { json, body, HttpError } from './util.js';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Bulunamadı', { status: 404 });
    if (!env.DB) return json({ error: 'Veritabanı bağlı değil (wrangler.jsonc → d1_databases)' }, 503);
    const path = url.pathname.slice(5).replace(/\/+$/, '');
    try {
      await init(env.DB);
      // Başka sitelerden gelen yazma isteklerini reddet (çerez SameSite=Strict + Origin kontrolü)
      if (req.method !== 'GET') {
        const o = req.headers.get('Origin');
        if (o && new URL(o).host !== url.host) return json({ error: 'İzin verilmeyen kaynak' }, 403);
      }
      if (path === 'login' && req.method === 'POST') {
        const r = await login(req, env, env.DB, (await body(req)).password);
        return r.ok ? json({ ok: true }, 200, { 'Set-Cookie': r.cookie }) : json({ error: r.error }, r.status);
      }
      if (path === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': logoutCookie() });
      if (!(await isAuthed(req, env))) return json({ error: 'Giriş gerekli', setup: !password(env), demo: env.DEMO === '1' }, 401);
      if (path === 'me') return json({ ok: true, demo: env.DEMO === '1' });
      return await api(req, env, ctx, env.DB, path);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e.message || 'Sunucu hatası' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    await init(env.DB);
    ctx.waitUntil(syncAll(env, env.DB).then((r) => console.log('senkron', JSON.stringify(r))).catch((e) => console.error('senkron hatası', e)));
  },
};
