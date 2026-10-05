// Satış paneli Worker'ı: /api/* → panel API'si, diğer adresler → public/ (panel arayüzü).
// Zamanlanmış görev (wrangler.jsonc → triggers): 15 dakikada bir tüm kanalları senkronlar.
// Müşteri panelleri (tenants.js): firma koduyla giriş yapan müşterinin istekleri kendi Durable Object'ine iletilir.
import { init } from './db.js';
import { syncAll, quickSync } from './sync.js';
import { handle } from './handler.js';
import { currentUser } from './auth.js';
import { cookieTenant, getTenant, forward, tenantLogin, tenantApi } from './tenants.js';
import { json, body, HttpError } from './util.js';

export { TenantPanel } from './tenants.js';

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Bulunamadı', { status: 404 });
    const path = url.pathname.slice(5).replace(/\/+$/, '');
    // Başka sitelerden gelen yazma isteklerini reddet (müşteri paneli girişi ve yönetimi dahil; panel içi istekler handle() içinde de denetlenir)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const o = req.headers.get('Origin');
      if (o) { let h = ''; try { h = new URL(o).host; } catch { /* geçersiz */ } if (h !== url.host) return json({ error: 'İzin verilmeyen kaynak' }, 403); }
    }
    try {
      // Firma koduyla giriş → müşteri paneli
      if (path === 'login' && req.method === 'POST') {
        const b = await body(req.clone());
        if (b && String(b.tenant || '').trim()) return await tenantLogin(req, env, b);
      }
      // Müşteri panelinin oturumu: istek o firmanın paneline gider (çıkış ve giriş ekranı ana panelde)
      const slug = cookieTenant(req);
      if (slug && path !== 'logout' && path !== 'brand' && path !== 'login') {
        const t = env.DB ? await getTenant(env.DB, slug) : null;
        if (!t || !t.active) return json({ error: t ? 'Bu müşteri paneli askıya alınmış' : 'Oturum geçersiz', tenantOff: true }, 401, { 'Set-Cookie': 'hp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
        return await forward(req, env, t);
      }
      // Ana panel: müşteri panellerinin yönetimi (Kullanıcılar → Müşteri panelleri)
      if (path === 'tenants' || path.startsWith('tenants/')) {
        if (!env.DB) return json({ error: 'Veritabanı bağlı değil' }, 503);
        await init(env.DB);
        const user = await currentUser(req, env, env.DB);
        if (!user) return json({ error: 'Giriş gerekli' }, 401);
        const r = await tenantApi(req, env, env.DB, path, user);
        // Destek girişi: çerez ana panelin yanıtıyla verilir, tarayıcı müşteri paneline geçer
        return r && r.cookie ? json({ ok: true }, 200, { 'Set-Cookie': r.cookie }) : json(r);
      }
      return await handle(req, env, ctx, env.DB);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: e.message || 'Sunucu hatası' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    await init(env.DB);
    const quick = event && event.cron === '*/2 * * * *';
    ctx.waitUntil((quick ? quickSync(env, env.DB) : syncAll(env, env.DB, { cron: true })).then((r) => console.log(quick ? 'hızlı iş' : 'senkron', JSON.stringify(r))).catch((e) => console.error('senkron hatası', e)));
  },
};
