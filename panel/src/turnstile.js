// Cloudflare Turnstile (bot doğrulaması): giriş ekranının ilk adımında (şifre), "Şifremi unuttum"da ve tanıtım sitesinin formlarında
// (iletişim / demo / teklif talebi ve satın alma; site anahtarı /api/public/captcha'dan alır, alan adı SITE_ORIGINS'ten denetlenir).
// Açmak için Worker → Settings → Variables and secrets: TURNSTILE_SITE_KEY (Text) + TURNSTILE_SECRET (Secret).
// İkisi de tanımlı değilse doğrulama kapalıdır (geliştirme ve testler). Demo panelinde (DEMO=1) uygulanmaz.
// Cloudflare'in önerdiği denetim: success, beklenen işlem (action: login / forgot) ve sayfanın açıldığı alan adı
// (hostname; varsayılan isteğin geldiği adres, TURNSTILE_HOSTNAMES ile virgüllü liste verilebilir). Jeton tek kullanımlıktır.
export const turnstileOn = (env) => !!(env && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.DEMO !== '1');
export const turnstileSiteKey = (env) => (turnstileOn(env) ? String(env.TURNSTILE_SITE_KEY) : null);

export async function turnstileOk(env, req, token, action, fetchFn = fetch, hostList = null) {
  if (!turnstileOn(env)) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const hosts = new Set((hostList || String(env.TURNSTILE_HOSTNAMES || new URL(req.url).hostname).split(',')).map((h) => String(h).trim().toLowerCase()).filter(Boolean));
  const fd = new FormData();
  fd.append('secret', env.TURNSTILE_SECRET);
  fd.append('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) fd.append('remoteip', ip);
  try {
    const r = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`siteverify HTTP ${r.status}`);
    const d = await r.json();
    return d.success === true && (!action || d.action === action) && hosts.has(String(d.hostname || '').toLowerCase());
  } catch (e) {
    console.error('turnstile doğrulaması', e);
    return false;
  }
}
export const CAPTCHA_ERROR = { error: 'Güvenlik doğrulaması tamamlanamadı; kutucuğu yeniden onaylayıp tekrar deneyin', captcha: true };

// Tanıtım sitesi formları: jetonun açıldığı alan adı sitenin adresleri (SITE_ORIGINS; varsayılan hasturkcrm.com) olmalı
export const siteHosts = (origins) => origins.map((o) => { try { return new URL(o).hostname; } catch { return ''; } }).filter(Boolean);
