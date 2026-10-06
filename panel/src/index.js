// Satış paneli Worker'ı: /api/* → panel API'si, diğer adresler → public/ (panel arayüzü).
// Zamanlanmış görev (wrangler.jsonc → triggers): 15 dakikada bir tüm kanalları senkronlar.
// Müşteri panelleri (tenants.js): firma koduyla giriş yapan müşterinin istekleri kendi Durable Object'ine iletilir.
import { init } from './db.js';
import { syncAll, quickSync } from './sync.js';
import { handle, report5xx } from './handler.js';
import { PerfBuffer } from './perf.js';
// Ana panelin istek süreleri (bu Worker örneğinde toplanır, birkaç dakikada bir yazılır)
const perfMain = new PerfBuffer();
import { currentUser } from './auth.js';
import { cookieTenant, getTenant, forward, tenantLogin, tenantApi, SLUG_RE, expired } from './tenants.js';
import { json, body, HttpError } from './util.js';

export { TenantPanel } from './tenants.js';

// Tarayıcı güvenlik başlıkları (panel sayfaları): yalnız kendi betiğimiz çalışır, panel başka sitede çerçeve içinde açılamaz,
// görseller https / data ile sınırlı. Bir açık olsa bile dışarıdan betik yüklenemez ve veri başka sunucuya gönderilemez.
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
  "img-src 'self' data: blob: https:", "connect-src 'self'", "worker-src 'self'", "frame-src 'self' blob: data:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
function secure(res) {
  const r = new Response(res.body, res);
  r.headers.set('Content-Security-Policy', CSP);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'same-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (new URL(res.url || 'https://x').protocol === 'https:') r.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return r;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? secure(await env.ASSETS.fetch(req)) : new Response('Bulunamadı', { status: 404 });
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
      // Müşteri panelinin logosu (e-postalar için, oturumsuz): /api/logo?t=firma-kodu
      if (path === 'logo' && url.searchParams.get('t')) {
        const s = url.searchParams.get('t');
        const t = (req.method === 'GET' || req.method === 'HEAD') && SLUG_RE.test(s) && env.DB ? await getTenant(env.DB, s) : null;
        return t && t.active ? await forward(req, env, t) : new Response('Logo yok', { status: 404 });
      }
      // Müşteri panelinin oturumu: istek o firmanın paneline gider (çıkış ve giriş ekranı ana panelde)
      const slug = cookieTenant(req);
      if (slug && path !== 'logout' && path !== 'brand' && path !== 'login' && path !== 'logo') {
        const t = env.DB ? await getTenant(env.DB, slug) : null;
        if (!t || !t.active) return json({ error: t ? 'Bu müşteri paneli askıya alınmış' : 'Oturum geçersiz', tenantOff: true }, 401, { 'Set-Cookie': 'hp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
        // Abonelik süresi doldu: müşteri giremez (ana panelin destek oturumu girebilir; yenileme / veri kontrolü için)
        const raw = ((req.headers.get('Cookie') || '').match(/hp_session=([^;]+)/) || [])[1] || '';
        if (expired(t) && !/~-1\./.test(raw.replace(/%7E/gi, '~')))
          return json({ error: 'Aboneliğinizin süresi doldu. Yenilemek için hizmet sağlayıcınızla görüşün.', tenantOff: true }, 401, { 'Set-Cookie': 'hp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
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
      const t0 = Date.now(), res = await handle(req, env, ctx, env.DB);
      if (res.status >= 500) ctx.waitUntil(report5xx(env.DB, req, res, { slug: '', firm: '' }).catch(() => {}));
      perfMain.add(req.method, path, Date.now() - t0);
      if (perfMain.due() && env.DB) ctx.waitUntil(perfMain.flush(env.DB).catch(() => {}));
      return res;
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
