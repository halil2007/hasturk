// Giriş koruması (IP engelleme): kaba kuvvetle panel şifresi / API anahtarı denemelerine karşı.
// Ana veritabanında tutulur ve ana panelin önünde çalışır: ana panel ile tüm müşteri panellerinin (firma koduyla giriş) girişleri,
// şifre sıfırlama ve dış API'nin (v1) hatalı anahtar denemeleri aynı sayaçtan geçer.
//
// Kural (Kullanıcılar → Giriş koruması'ndan değiştirilebilir): bir IP 15 dakikada 5 kez başarısız olursa engellenir.
// Engel bitince denemeler sürerse her yeni engel bir öncekinden uzundur: 1 dk → 5 dk → 15 dk → 1 saat → 6 saat → 24 saat → 7 gün.
// 24 saat hiç hatalı deneme yapmayan IP'nin geçmişi sıfırlanır. Engelliyken yapılan denemeler şifre kontrol edilmeden reddedilir.
// Giriş denemesi şifre kontrolünden ÖNCE sayılır (aynı anda gönderilen çok sayıda istek sınırı aşamaz); başarılı girişte sayaç sıfırlanır.
// Güvenilir IP'ler (ör. ofis) hiç engellenmez. Ayrıca kullanıcı adı + IP başına sayaç da vardır (auth.js → login).
import { all, first, run, getRaw, setSetting, log } from './db.js';

export const GUARD_DEFAULTS = { enabled: true, maxFails: 5, windowMin: 15, steps: [1, 5, 15, 60, 360, 1440, 10080], allow: [], apiPerMin: 600 };
const DAY = 864e5;

let cfgCache = null;
export async function guardConfig(db, fresh = false) {
  if (!fresh && cfgCache && cfgCache.db === db && Date.now() - cfgCache.at < 30e3) return cfgCache.v;
  const v = { ...GUARD_DEFAULTS, ...((await getRaw(db, 'ip_guard').catch(() => null)) || {}) };
  // Eski varsayılan aşamalarla kaydedilmiş ayar yeni varsayılana geçer (elle değiştirilmiş aşamalar korunur)
  if (Array.isArray(v.steps) && v.steps.join(',') === '15,60,360,1440,10080') v.steps = GUARD_DEFAULTS.steps;
  cfgCache = { db, at: Date.now(), v };
  return v;
}
export async function setGuardConfig(db, b) {
  const v = { ...(await guardConfig(db, true)) };
  if (b.enabled !== undefined) v.enabled = !!b.enabled;
  if (b.maxFails !== undefined) v.maxFails = Math.min(50, Math.max(3, Math.round(Number(b.maxFails)) || GUARD_DEFAULTS.maxFails));
  if (b.windowMin !== undefined) v.windowMin = Math.min(1440, Math.max(5, Math.round(Number(b.windowMin)) || GUARD_DEFAULTS.windowMin));
  if (b.steps !== undefined) {
    const s = (Array.isArray(b.steps) ? b.steps : String(b.steps).split(/[\s,;]+/)).map((x) => Math.round(Number(x))).filter((x) => x >= 1 && x <= 43200).slice(0, 8);
    v.steps = s.length ? s.sort((a, c) => a - c) : GUARD_DEFAULTS.steps;
  }
  if (b.allow !== undefined) {
    const list = (Array.isArray(b.allow) ? b.allow : String(b.allow).split(/[\s,;]+/)).map((x) => String(x).trim()).filter(Boolean);
    const bad = list.find((x) => !/^[0-9a-f:.]{2,45}\*?$/i.test(x));
    if (bad) throw new Error(`Geçersiz IP: ${bad} (ör. 85.105.12.40 ya da bir aralık için 85.105.12.*)`);
    v.allow = [...new Set(list)].slice(0, 50);
  }
  if (b.apiPerMin !== undefined) v.apiPerMin = Math.min(10000, Math.max(60, Math.round(Number(b.apiPerMin)) || GUARD_DEFAULTS.apiPerMin));
  await setSetting(db, 'ip_guard', v);
  cfgCache = null;
  return v;
}

// İstemci IP'si. Panel kendi alan adınızdaki PHP aracı dosyasıyla (panel-proxy.php) açılıyorsa Cloudflare'in gördüğü adres
// barındırma sunucusudur; gerçek ziyaretçi X-Forwarded-For'dadır. Bu başlık taklit edilebildiğinden anahtar ikisinin birleşimidir:
// aracı üzerinden gelen bir saldırgan yalnız kendi adresini engeller, aracıyı kullanan diğer kişiler etkilenmez.
export function guardIp(req) {
  const cf = String(req.headers.get('CF-Connecting-IP') || '').trim();
  const xf = String(req.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  const via = req.headers.get('X-Forwarded-Host');
  if (!cf) return (xf || 'yerel').slice(0, 64);
  return (via && xf && xf !== cf ? `${xf} > ${cf}` : cf).slice(0, 100);
}
const realIp = (key) => String(key).split(' > ')[0];
const allowed = (cfg, key) => (cfg.allow || []).some((a) => { const ip = realIp(key); return a.endsWith('*') ? ip.startsWith(a.slice(0, -1)) : ip === a; });
const stepMs = (cfg, strikes) => { const s = cfg.steps && cfg.steps.length ? cfg.steps : GUARD_DEFAULTS.steps; return s[Math.min(strikes, s.length) - 1] * 60e3; };
export const waitText = (ms) => { const m = Math.ceil(ms / 60e3); return m < 60 ? `${m} dakika` : m < 1440 ? `${Math.ceil(m / 60)} saat` : `${Math.ceil(m / 1440)} gün`; };

// Engelli mi (sayaç değişmez): dış API'de her istekten önce
export async function guardBlocked(db, req) {
  const cfg = await guardConfig(db), ip = guardIp(req);
  if (!cfg.enabled || allowed(cfg, ip)) return null;
  for (const k of ip.includes(' > ') ? ['aracı ' + ip.split(' > ')[1], ip] : [ip]) {
    const r = await first(db, 'SELECT blocked_until FROM ip_guard WHERE ip = ?', k).catch(() => null);
    if (!(r && r.blocked_until > Date.now())) continue;
    await run(db, 'UPDATE ip_guard SET blocked_hits = blocked_hits + 1, last_at = ? WHERE ip = ?', Date.now(), k);
    return { ip: k, until: r.blocked_until };
  }
  return null;
}

// Başarısız sayılacak bir deneme (giriş isteği: önceden; dış API: hatalı anahtardan sonra). Engel gerekiyorsa uygular.
// Dönüş: { ip, until } engelliyse, değilse null
export async function guardAttempt(db, req, { kind = 'login', who = '' } = {}) {
  const cfg = await guardConfig(db), ip = guardIp(req);
  if (!cfg.enabled || allowed(cfg, ip)) return null;
  // Aracı üzerinden gelen istekte ziyaretçi adresi (X-Forwarded-For) taklit edilebilir: denemeler ayrıca bağlantının gerçek adresinde
  // toplu sayılır (10 kat sınırla). Böylece her denemede farklı sahte adres gönderen saldırgan da engellenir.
  if (ip.includes(' > ')) {
    const agg = await attempt(db, cfg, 'aracı ' + ip.split(' > ')[1], { kind, who }, cfg.maxFails * 10);
    if (agg) return agg;
  }
  return attempt(db, cfg, ip, { kind, who }, cfg.maxFails);
}
async function attempt(db, cfg, ip, { kind, who }, maxFails) {
  const now = Date.now();
  const cut = now - cfg.windowMin * 60e3;
  const r = await first(db, `INSERT INTO ip_guard (ip, fails, window_at, strikes, blocked_until, blocked_hits, last_at, last_user, last_kind, total)
      VALUES (?, 1, ?, 0, NULL, 0, ?, ?, ?, 1)
    ON CONFLICT (ip) DO UPDATE SET
      strikes = CASE WHEN ip_guard.last_at < ? AND COALESCE(ip_guard.blocked_until, 0) < ? THEN 0 ELSE ip_guard.strikes END,
      blocked_hits = ip_guard.blocked_hits + CASE WHEN COALESCE(ip_guard.blocked_until, 0) > ? THEN 1 ELSE 0 END,
      fails = CASE WHEN COALESCE(ip_guard.blocked_until, 0) > ? THEN ip_guard.fails WHEN ip_guard.window_at < ? THEN 1 ELSE ip_guard.fails + 1 END,
      window_at = CASE WHEN COALESCE(ip_guard.blocked_until, 0) <= ? AND ip_guard.window_at < ? THEN ? ELSE ip_guard.window_at END,
      last_at = ?, last_user = ?, last_kind = ?, total = ip_guard.total + 1
    RETURNING fails, strikes, blocked_until`,
  ip, now, now, who.slice(0, 80), kind, now - DAY, now, now, now, cut, now, cut, now, now, who.slice(0, 80), kind);
  if (r.blocked_until > now) return { ip, until: r.blocked_until };
  if (r.fails <= maxFails) return null;
  // Sınır aşıldı: yeni engel (aynı anda gelen istekler engeli tek kez uygular)
  const strikes = r.strikes + 1, until = now + stepMs(cfg, strikes);
  const upd = await first(db, `UPDATE ip_guard SET strikes = ?, blocked_until = ?, fails = 0, window_at = ?, blocks = blocks + 1
    WHERE ip = ? AND COALESCE(blocked_until, 0) <= ? RETURNING blocked_until`, strikes, until, until, ip, now);
  if (upd) await log(db, null, 'warn', `Giriş koruması: ${ip} ${waitText(until - now)} engellendi (${maxFails} hatalı deneme${strikes > 1 ? `, ${strikes}. engel` : ''}${who ? `, son deneme: ${who}` : ''})`).catch(() => {});
  if (Math.random() < 0.05) await run(db, 'DELETE FROM ip_guard WHERE last_at < ? AND COALESCE(blocked_until, 0) < ?', now - 30 * DAY, now).catch(() => {});
  return { ip, until: upd ? upd.blocked_until : until };
}
// Başarılı giriş: deneme sayacı sıfırlanır (geçmiş engel sayısı 24 saat sonra kendiliğinden sıfırlanır)
export async function guardOk(db, req) {
  const ip = guardIp(req);
  await run(db, 'UPDATE ip_guard SET fails = 0 WHERE ip = ?', ip).catch(() => {});
  // Aracının toplu sayacından yalnız bu (başarılı) deneme düşülür: aracıyı kullanan diğer kişilerin hatalı denemeleri korunur
  if (ip.includes(' > ')) await run(db, 'UPDATE ip_guard SET fails = MAX(0, fails - 1) WHERE ip = ?', 'aracı ' + ip.split(' > ')[1]).catch(() => {});
}
export const blockedBody = (b) => ({ error: `Çok fazla hatalı deneme nedeniyle bu bağlantı (IP) ${waitText(b.until - Date.now())} süreyle engellendi. Şifrenizi unuttuysanız süre bitince “Şifremi unuttum”u kullanın ya da yöneticinize başvurun.`, blocked: true, until: b.until });
export const blockedHeaders = (b) => ({ 'Retry-After': String(Math.max(1, Math.ceil((b.until - Date.now()) / 1000))) });

// Yönetim (ana panel → Kullanıcılar → Giriş koruması)
export async function guardList(db) {
  const now = Date.now();
  const rows = await all(db, `SELECT ip, fails, strikes, blocked_until, blocked_hits, blocks, total, last_at, last_user, last_kind FROM ip_guard
    WHERE COALESCE(blocked_until, 0) > ? OR last_at > ? ORDER BY COALESCE(blocked_until, 0) > ? DESC, last_at DESC LIMIT 200`, now, now - 7 * DAY, now);
  return rows.map((r) => ({ ...r, blocked: r.blocked_until > now }));
}
export async function guardUnblock(db, ip) {
  await run(db, 'UPDATE ip_guard SET blocked_until = NULL, fails = 0, strikes = 0 WHERE ip = ?', String(ip || ''));
}

// Genel istek sınırı (/api/*): IP başına dakikada en fazla N istek. Worker örneği başına bellekte tutulur (veritabanına yazmaz);
// aşırı yüklenmeye karşı ilk savunmadır. Kesin sınır için Cloudflare → Security → WAF → Rate limiting kuralı önerilir.
const hits = new Map();
export function rateLimited(key, perMin) {
  const now = Date.now(), r = hits.get(key);
  if (!r || now - r.at > 60e3) { hits.set(key, { at: now, n: 1 }); if (hits.size > 5000) for (const [k, v] of hits) if (now - v.at > 60e3) hits.delete(k); return false; }
  r.n++;
  return r.n > perMin;
}
