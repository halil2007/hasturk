// Cloudflare Turnstile (bot doğrulaması): giriş ekranının ilk adımında (şifre) ve "Şifremi unuttum"da.
// Açmak için Worker → Settings → Variables and secrets: TURNSTILE_SITE_KEY (Text) + TURNSTILE_SECRET (Secret).
// İkisi de tanımlı değilse doğrulama kapalıdır (geliştirme ve testler). Demo panelinde (DEMO=1) uygulanmaz.
export const turnstileOn = (env) => !!(env && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.DEMO !== '1');
export const turnstileSiteKey = (env) => (turnstileOn(env) ? String(env.TURNSTILE_SITE_KEY) : null);

export async function turnstileOk(env, req, token, fetchFn = fetch) {
  if (!turnstileOn(env)) return true;
  token = String(token || '');
  if (!token || token.length > 2048) return false;
  const fd = new FormData();
  fd.append('secret', env.TURNSTILE_SECRET);
  fd.append('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) fd.append('remoteip', ip);
  try {
    const r = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
    const d = await r.json();
    return !!d.success;
  } catch (e) {
    console.error('turnstile doğrulaması', e);
    return false;
  }
}
export const CAPTCHA_ERROR = { error: 'Güvenlik doğrulaması tamamlanamadı; kutucuğu yeniden onaylayıp tekrar deneyin', captcha: true };
