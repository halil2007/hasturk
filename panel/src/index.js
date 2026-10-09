// Satış paneli Worker'ı: /api/* → panel API'si, diğer adresler → public/ (panel arayüzü).
// Zamanlanmış görev (wrangler.jsonc → triggers): 15 dakikada bir tüm kanalları senkronlar.
// Müşteri panelleri (tenants.js): firma koduyla giriş yapan müşterinin istekleri kendi Durable Object'ine iletilir.
import { init } from './db.js';
import { syncAll, quickSync } from './sync.js';
import { handle, report5xx } from './handler.js';
import { PerfBuffer } from './perf.js';
import { extApi } from './extapi.js';
import { leadRequest, demoRequest, siteOrigins } from './lead.js';
import { releasedTypes, BETA_TYPES } from './config.js';
import { publicCheckout, checkoutCallback, checkoutStatus } from './billing.js';
import { blogPublic } from './blog.js';
import { turnstileOk, CAPTCHA_ERROR } from './turnstile.js';
import { actionSucceeded, resolveQuiet } from './errors.js';
// Ana panelin istek süreleri (bu Worker örneğinde toplanır, birkaç dakikada bir yazılır)
const perfMain = new PerfBuffer();
import { currentUser } from './auth.js';
import { cookieTenant, getTenant, forward, tenantLogin, tenantApi, SLUG_RE, expired, tenantWatchdog, contactLine, tenantPassword, expiryReminders, expiredMessage, renewUrl } from './tenants.js';
import { json, body, HttpError } from './util.js';

export { TenantPanel } from './tenants.js';

async function publicChannels(req, env) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
  const h = { Vary: 'Origin', 'Cache-Control': 'public, max-age=120, s-maxage=300', ...(siteOrigins(env).includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
  let rel = [];
  try { if (env.DB) { await init(env.DB); rel = await releasedTypes(env, env.DB); } } catch (e) { console.error('kanal listesi', e); }
  return json({ released: rel, beta: BETA_TYPES.filter((t) => !rel.includes(t)) }, 200, h);
}

// Tarayıcı güvenlik başlıkları (panel sayfaları): yalnız kendi betiğimiz çalışır, panel başka sitede çerçeve içinde açılamaz,
// görseller https / data ile sınırlı. Bir açık olsa bile dışarıdan betik yüklenemez ve veri başka sunucuya gönderilemez.
// Turnstile (giriş ekranındaki bot doğrulaması) yalnız challenges.cloudflare.com'dan betik ve çerçeve yükler
const TS = 'https://challenges.cloudflare.com';
const CSP = ["default-src 'self'", `script-src 'self' ${TS}`, "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
  "img-src 'self' data: blob: https:", `connect-src 'self' ${TS}`, "worker-src 'self'", `frame-src 'self' blob: data: ${TS}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
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
    // Tanıtım sitesinden demo talebi (oturumsuz; yalnız izin verilen site adreslerinden, bkz. lead.js)
    if (path === 'public/lead') return await leadRequest(req, env);
    // Online paket satışı: siteden başlatma (CORS) ve iyzico'nun ödeme sonrası dönüşü (iyzico sayfasından gelen POST)
    if (path === 'public/checkout/status') return checkoutStatus(req, env);
    if (path === 'public/checkout') return await publicCheckout(req, env);
    if (path === 'public/checkout/callback') return await checkoutCallback(req, env);
    // Blog (tanıtım sitesi için; oturumsuz, yalnız okuma: yazı listesi, yazı, görsel, RSS, site haritası — bkz. blog.js)
    if (path === 'public/blog' || path.startsWith('public/blog/')) return await blogPublic(req, env, path);
    // Tanıtım sitesi: müşterilere açık kanal türleri (test modülünden açılanlar; Entegrasyonlar sayfası "Yakında" etiketini buna göre kaldırır)
    if (path === 'public/channels' && req.method === 'GET') return await publicChannels(req, env);
    // Demo paneline giriş (sitedeki imzalı bağlantı)
    if (path === 'public/demo') return await demoRequest(req, env);
    // Başka sitelerden gelen yazma isteklerini reddet (müşteri paneli girişi ve yönetimi dahil; panel içi istekler handle() içinde de denetlenir)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const o = req.headers.get('Origin');
      if (o) { let h = ''; try { h = new URL(o).host; } catch { /* geçersiz */ } if (h !== url.host) return json({ error: 'İzin verilmeyen kaynak' }, 403); }
    }
    try {
      // Dış API (stok aktarımı): anahtarla, yalnız ana panelin yetkilendirdiği mağaza (bkz. extapi.js)
      if (path === 'v1' || path.startsWith('v1/')) return await extApi(req, env, ctx, path, { getTenant, forward, expired });
      // Şifremi unuttum / şifre yenileme (müşteri panelleri, oturumsuz)
      if ((path === 'password/forgot' || path === 'password/reset') && req.method === 'POST') {
        const b = await body(req.clone());
        if (path === 'password/forgot' && !(await turnstileOk(env, req, b && b.cf))) return json(CAPTCHA_ERROR, 400);
        return json(await tenantPassword(req, env, path.slice(9), b));
      }
      // Giriş: ilk adımda (kullanıcı adı + şifre) bot doğrulaması; firma koduyla giriş → müşteri paneli
      if (path === 'login' && req.method === 'POST') {
        const b = await body(req.clone());
        if (b && b.password !== undefined && !b.ticket && !b.mailticket && !(await turnstileOk(env, req, b.cf))) return json(CAPTCHA_ERROR, 400);
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
          return json({ error: await expiredMessage(env, t), renew: renewUrl(env, t), tenantOff: true }, 401, { 'Set-Cookie': 'hp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
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
      else if (res.status < 400 && env.DB && path !== 'errors/report') ctx.waitUntil(actionSucceeded(env.DB, '', `${req.method} ${path}`).catch(() => {}));
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
    if (!quick) ctx.waitUntil(tenantWatchdog(env, env.DB).catch((e) => console.error('bekçi hatası', e)));
    if (!quick) ctx.waitUntil(expiryReminders(env, env.DB).catch((e) => console.error('bitiş hatırlatması hatası', e)));
    // 3 gündür tekrarlanmayan hata kayıtları kendiliğinden "Çözüldü"
    if (!quick) ctx.waitUntil(resolveQuiet(env.DB).catch((e) => console.error('hata kayıtları çözülemedi', e)));
  },
};
