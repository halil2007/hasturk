// Ortak arayüz yardımcıları: API, güvenli HTML şablonu, biçimlendirme, kanal rozetleri, bildirim, alt pencere, menü.

export const state = { channels: [], settings: null, summary: null, demo: false, user: null, onLogin: null };
// Beklemedeki (pasif) kanallar listelerde gösterilmez; Entegrasyonlar sayfası hepsini gösterir
export const activeChannels = () => state.channels.filter((c) => !c.paused);
export const isAdmin = () => !state.user || state.user.role === 'admin';

// ---------- API ----------
// Üst kenarda ince yükleme çubuğu: 150 ms'den uzun süren istek varken görünür (arayüz kullanılabilir kalır)
let inflight = 0, barTimer = null;
function busyBar(d) {
  if (typeof document === 'undefined') return;
  inflight = Math.max(0, inflight + d);
  let bar = document.getElementById('topload');
  if (!bar) { bar = document.createElement('div'); bar.id = 'topload'; document.body.append(bar); }
  clearTimeout(barTimer);
  if (inflight) barTimer = setTimeout(() => bar.classList.add('on'), 150);
  else { bar.classList.remove('on'); }
}
// Okuma (GET) cevapları bellekte tutulur; aynı anda yapılan aynı istek tek istekte birleştirilir.
// - 20 sn'den yeni veri doğrudan kullanılır.
// - Sayfa açılırken (swr açık) daha eski veri de (en fazla 15 dk) HEMEN gösterilir, arka planda tazelenir; yeni veri farklıysa
//   'api:update' olayı yayınlanır ve sayfa sessizce yeniden çizilir. Böylece menüler arası geçiş ağı beklemez.
// - Bir değişiklik (POST/PUT/DELETE) sonrası tüm kayıtlar "kirli" işaretlenir: sayfa içinden yapılan sonraki okuma ağı bekler
//   (işlemin sonucu görülsün), başka sayfaya geçerken ise eski veri anında gösterilip tazelenir.
const cache = new Map(), pending = new Map();
const TTL = 20e3, STALE = 15 * 60e3;
let swr = 0;
export const swrScope = async (fn) => { swr++; try { return await fn(); } finally { swr--; } };
export const clearCache = () => cache.clear();
const remember = (path, data) => { cache.delete(path); cache.set(path, { at: Date.now(), data }); if (cache.size > 150) cache.delete(cache.keys().next().value); };
function fetchGet(path) {
  if (pending.has(path)) return pending.get(path);
  const p = request(path, 'GET').then((data) => { remember(path, data); return data; }).finally(() => pending.delete(path));
  pending.set(path, p);
  return p;
}
// Arka planda tazele; değiştiyse haber ver
function revalidate(path, old) {
  if (pending.has(path)) return;
  fetchGet(path).then((data) => {
    if (JSON.stringify(data) !== JSON.stringify(old) && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('api:update', { detail: path }));
  }).catch(() => {});
}
// Ön yükleme: menüye dokunulunca / imleç gelince sayfanın verisi önceden istenir (taze kayıt varsa istek atılmaz)
export function prefetch(path) {
  const c = cache.get(path);
  if (c && !c.dirty && Date.now() - c.at < TTL) return;
  fetchGet(path).catch(() => {});
}
// Sayfa açılırken yapılan okumalar kaydedilir (bir sonraki ziyarette menüye dokununca bu adresler önceden istenir)
export const recorder = { list: null };
// Paketinizde olmayan özellik (müşteri paneli; ana panel ve paketsiz firmada hiçbir şey kilitli değil)
export const locked = (f) => !!(state.tenant && (state.tenant.locked || []).includes(f));
export async function api(path, { method = 'GET', body, fresh = false } = {}) {
  if (method === 'GET') {
    if (recorder.list && !recorder.list.includes(path)) recorder.list.push(path);
    const c = !fresh && cache.get(path), age = c ? Date.now() - c.at : Infinity;
    if (c && !c.dirty && age < TTL) return structuredClone(c.data);
    if (c && swr && age < STALE) { revalidate(path, c.data); return structuredClone(c.data); }
    if (!fresh && pending.has(path)) return structuredClone(await pending.get(path));
    return structuredClone(await (fresh ? request(path, 'GET').then((d) => { remember(path, d); return d; }) : fetchGet(path)));
  }
  const dirty = () => { for (const c of cache.values()) c.dirty = true; };
  dirty();
  try { return await request(path, method, body); } finally { dirty(); }
}
async function request(path, method, body) {
  busyBar(1);
  let res;
  // Okuma istekleri en fazla 20 sn beklenir: takılan bir bağlantı (ör. yeni yayın anında) sayfayı sonsuza kadar bekletmesin
  const ctl = method === 'GET' && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 20e3) : null;
  try {
    res = await fetch('/api/' + path, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', signal: ctl ? ctl.signal : undefined,
    });
  } catch (e) {
    throw new Error(ctl && ctl.signal.aborted ? 'Sunucu yanıt vermedi; birazdan tekrar deneyin' : 'Sunucuya ulaşılamadı; internet bağlantınızı kontrol edin');
  } finally { clearTimeout(timer); busyBar(-1); }
  let data = {};
  try { data = await res.json(); } catch { /* boş */ }
  if (res.status === 401 && path !== 'login') { state.onLogin && state.onLogin(data); throw Object.assign(new Error(data.error || 'Giriş gerekli'), { auth: true }); }
  if (res.status === 403 && data.need2fa) { state.onNeed2fa && state.onNeed2fa(); throw Object.assign(new Error(data.error), { auth: true }); }
  if (!res.ok) {
    let raw = data.error || `Hata (${res.status})`;
    // Sunucuda karşılığı olmayan istek: hangi işlem olduğu mesajda yazsın (destek / hata kaydı için)
    if (res.status === 404 && /^Bulunamadı$/.test(raw)) raw = `İşlem bulunamadı (${method} ${path.split('?')[0]}) — sayfayı yenileyip tekrar deneyin`;
    const e = new Error(friendly(raw)); e.raw = raw;
    // İşlem hataları (yazma istekleri) ve sunucu hataları kendiliğinden kaydedilir (ana panelin "Müşteri hataları")
    if ((method !== 'GET' || res.status >= 500 || res.status === 404) && path !== 'login' && !path.startsWith('errors/')) logError({ source: 'api', message: raw, action: `${method} ${path.split('?')[0]}`, status: res.status });
    throw e;
  }
  return data;
}

// ---------- hata kaydı ----------
// Ekran (betik) hataları ve başarısız işlemler sunucuya bildirilir; aynı hata bir oturumda bir kez, en fazla 25 kayıt.
const sentErr = new Set();
export function logError(e) {
  try {
    if (!state.user || sentErr.size >= 25) return;
    const key = `${e.source}|${e.action || ''}|${String(e.message || '').slice(0, 120)}`;
    if (sentErr.has(key)) return;
    sentErr.add(key);
    const body = { ...e, message: String(e.message || '').slice(0, 1000), stack: String(e.stack || '').slice(0, 2500), page: location.hash.replace(/^#\/?/, '').slice(0, 120) || 'genel-bakis',
      browser: navigator.userAgent.slice(0, 200), screen: `${innerWidth}x${innerHeight}`, version: state.assets || '' };
    fetch('/api/errors/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', keepalive: true }).catch(() => {});
  } catch { /* bildirim de yapılamazsa sessiz */ }
}
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => { if (ev.filename && !ev.filename.startsWith(location.origin)) return; logError({ source: 'client', message: ev.message, stack: ev.error && ev.error.stack ? ev.error.stack : `${ev.filename}:${ev.lineno}:${ev.colno}` }); });
  window.addEventListener('unhandledrejection', (ev) => { const r = ev.reason || {}; if (r.raw) return; logError({ source: 'client', message: r.message || String(r), stack: r.stack || '' }); });
}

// ---------- HTML şablonu (değerler her zaman kaçışlanır; raw() ile işaretlenen hariç) ----------
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s) });
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function val(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(val).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return raw(out);
}
export const render = (el, tpl) => { el.innerHTML = tpl && tpl.s !== undefined ? tpl.s : tpl || ''; return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// data-act="..." tıklamalarını tek yerden yakala (en içteki eylem çalışır)
export function actions(root, map) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t) || !map[t.dataset.act]) return;
    e.preventDefault();
    map[t.dataset.act](t, e);
  });
}

// ---------- biçimlendirme ----------
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const tl0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
export const money = (v) => tl.format(Number(v) || 0);
export const money0 = (v) => tl0.format(Math.round(Number(v) || 0));
export const n = (v) => nf.format(Number(v) || 0);
export function compact(v) {
  v = Number(v) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return nf.format(v / 1e6) + ' Mn';
  if (a >= 1e4) return nf.format(v / 1e3) + ' B';
  return nf.format(Math.round(v));
}
export const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}%${nf.format(v)}`);
export const delta = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? null : 0);
const tz = { timeZone: 'Europe/Istanbul' };
const dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...tz });
const df = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', ...tz });
const hm = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', ...tz });
const dm = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', ...tz });
export const dateTime = (ms) => (ms ? dtf.format(new Date(ms)) : '');
export const date = (ms) => (ms ? df.format(new Date(ms)) : '');
export const shortDT = (ms) => (ms ? `${dm.format(new Date(ms))}, ${hm.format(new Date(ms))}` : '');
export function ago(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} gün önce`;
  return date(ms);
}
// Türkiye saatine göre YYYY-MM-DD
export const dayKey = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
export const numIn = (v) => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
export const rangeLabel = (from, to) => {
  const f = new Date(from + 'T12:00:00Z'), t = new Date(to + 'T12:00:00Z');
  const o = { day: 'numeric', month: 'long', timeZone: 'UTC' };
  if (from === to) return f.toLocaleDateString('tr-TR', { ...o, year: 'numeric' });
  if (from.slice(0, 7) === to.slice(0, 7)) return `${f.getUTCDate()} – ${t.toLocaleDateString('tr-TR', { ...o, year: 'numeric' })}`;
  return `${f.toLocaleDateString('tr-TR', o)} – ${t.toLocaleDateString('tr-TR', { ...o, year: 'numeric' })}`;
};

// Kargo gecikme uyarısı: kanalın son kargoya teslim tarihi (varsa) ve sipariş yaşı (1 günü aşan) dikkate alınır
export function lateInfo(o, now = Date.now()) {
  if (!['new', 'processing'].includes(o.status) || (o.open_packages === 0 && o.packages > 0)) return null;
  if (now - o.ordered_at > 15 * 864e5) return null; // çok eski kayıtlar gecikme sayılmaz (sunucudaki LATE ile aynı sınır)
  const H = 3600e3;
  if (o.ship_by && now > o.ship_by) return { cls: 'bad', text: 'Gecikti', title: `Son kargoya teslim: ${dateTime(o.ship_by)}` };
  if (o.ship_by && o.ship_by - now < 12 * H) return { cls: 'warn', text: 'Gecikme riski', title: `Son kargoya teslim: ${dateTime(o.ship_by)} (${Math.max(0, Math.round((o.ship_by - now) / H))} sa kaldı)` };
  // Kanal son teslim tarihi vermediyse: 1 günü aşan ve henüz kargoya verilmemiş sipariş
  if (!o.ship_by && now - o.ordered_at > 24 * H) return { cls: 'warn', text: 'Gecikme riski', title: `Sipariş ${Math.floor((now - o.ordered_at) / 864e5) || 1} günü aştı, henüz kargoya verilmedi` };
  return null;
}
export const lateBadge = (o) => { const l = lateInfo(o); return l ? html`<span class="late ${l.cls}" title="${l.title}"><b>!</b>${l.text}</span>` : ''; };
// Kanal tarafında (panel dışından) yapılan işlem notu. Kaynak yalnızca satıcı işlemi kesinse belirtilir.
export function extNote(o) {
  let x = o.ext_action;
  try { x = typeof x === 'string' ? JSON.parse(x) : x; } catch { x = null; }
  if (!x || x.status !== o.status) return null;
  const name = ch(o.channel).name;
  return { seller: x.seller, at: x.at, text: x.seller ? `${name} üzerinden işlem yapıldı` : `${name}'da durum güncellendi`, detail: `${x.from || '?'} → ${x.to || '?'}` };
}

export const STATUS_LABEL = { new: 'Yeni', processing: 'Hazırlanıyor', shipped: 'Kargoda', delivered: 'Teslim edildi', cancelled: 'İptal', returned: 'İade' };
export const statusPill = (s) => html`<span class="pill ${s}">${STATUS_LABEL[s] || s}</span>`;

// ---------- kanallar ----------
// ikas: müşterinin ödeme sayfasında seçtiği kargo SEÇENEĞİNİN adı (ör. "HepsiJet Ücretsiz Kargo") → ikas Kargo ekranında seçilecek firma.
// Seçenek bir bağlantı değildir; gönderiyi ikas Kargo yapar. Ad tanınmazsa boş döner (firma ikas Kargo'da elle seçilir).
const CARRIERS = [[/hepsi\s*jet/i, 'hepsiJET'], [/aras/i, 'Aras Kargo'], [/yurt\s*i?[çc]i/i, 'Yurtiçi Kargo'], [/dhl/i, 'DHL eCommerce'], [/ptt/i, 'PTT Kargo'],
  [/s[üu]rat/i, 'Sürat Kargo'], [/mng/i, 'MNG Kargo'], [/trendyol\s*express/i, 'Trendyol Express'], [/kolay\s*gelsin/i, 'Kolay Gelsin'], [/\bups\b/i, 'UPS Kargo'], [/sendeo/i, 'Sendeo']];
export const carrierOf = (choice) => { const c = CARRIERS.find(([re]) => re.test(String(choice || ''))); return c ? c[1] : ''; };
export const ch = (id) => state.channels.find((c) => c.id === id) || { id, name: id, short: id, type: id };
// Ek mağazalar (trendyol_2, ikas_3 ...): kendi türünün rengine yakın, ayırt edilebilir bir ton
const EXTRA_HUE = ['#5b6ee1', '#c2410c', '#0f766e', '#a16207', '#be185d', '#4d7c0f', '#7c3aed', '#0369a1'];
export const chColor = (id) => {
  const m = /^([a-z0-9]+)_(\d+)$/.exec(String(id || ''));
  return m ? EXTRA_HUE[(Number(m[2]) + m[1].length) % EXTRA_HUE.length] : `var(--c-${id})`;
};
// Kargoyu takip et: kanalın verdiği resmi takip bağlantısı; yoksa kargo firmasının takip sayfası (Ayarlar → Kargo takip adresleri)
export function trackUrl(pkg, order = {}) {
  if (pkg && /^https?:\/\//i.test(pkg.tracking_url || '')) return pkg.tracking_url;
  const no = String((pkg && (pkg.tracking || pkg.barcode)) || order.tracking || '').trim();
  const firm = String((pkg && pkg.cargo_company) || order.cargo_company || '').toLocaleLowerCase('tr');
  if (!no || !firm) return '';
  const urls = (state.settings && state.settings.track_urls) || {};
  const norm = (x) => x.toLocaleLowerCase('tr').replace(/kargo|cargo|lojistik|marketplace|\s+/g, '');
  const hit = Object.entries(urls).sort((a, b) => b[0].length - a[0].length).find(([k]) => norm(k) && norm(firm).includes(norm(k)));
  return hit ? hit[1].replace('{no}', encodeURIComponent(no)) : '';
}
export const trackBtn = (pkg, order, cls = 'btn sm ghost') => { const u = trackUrl(pkg, order); return u ? html`<a class="${cls}" href="${u}" target="_blank" rel="noopener noreferrer" title="${(pkg && pkg.cargo_company) || order.cargo_company || 'Kargo'} takip sayfasını açar"><i class="ico ico-truck"></i>Kargoyu takip et</a>` : ''; };
// Kanal rozeti (marka renginde harf); grafiklerde ise doğrulanmış kanal renkleri kullanılır
export function chLogo(id, sm = false) {
  const c = ch(id), t = c.type || id, k = sm ? ' sm' : '';
  // Birden fazla ikas mağazası varsa logonun köşesinde mağaza sırası (1, 2, 3…): ayırt edilsin
  if (t === 'ikas') {
    const iks = state.channels.filter((x) => (x.type || x.id) === 'ikas' && !x.paused), no = iks.length > 1 ? iks.findIndex((x) => x.id === id) + 1 : 0;
    return html`<span class="logo-b ikas${k}" title="${c.name}"><i class="ico ico-bolt"></i>${no > 0 ? html`<span class="lb-no">${no}</span>` : ''}</span>`;
  }
  if (t === 'trendyol') return html`<span class="logo-b trendyol${k}" title="Trendyol">T</span>`;
  if (t === 'hepsiburada') return html`<span class="logo-b hepsiburada${k}" title="Hepsiburada">hb</span>`;
  if (t === 'pttavm') return html`<span class="logo-b pttavm${k}" title="PttAVM">Ptt</span>`;
  if (t === 'n11') return html`<span class="logo-b${k}" style="background:#7b3fe4;color:#fff" title="N11">n11</span>`;
  if (t === 'idefix') return html`<span class="logo-b${k}" style="background:#ffc20e;color:#1c1c1c" title="idefix">id</span>`;
  if (t === 'pazarama') return html`<span class="logo-b${k}" style="background:#00a2e8;color:#fff" title="Pazarama">pz</span>`;
  const B = { amazon: ['#232f3e', '#ff9900', 'a'], ciceksepeti: ['#e5007d', '#fff', 'çs'], koctas: ['#e30613', '#fff', 'K'], shopify: ['#5e8e3e', '#fff', 'S'], woocommerce: ['#7f54b3', '#fff', 'W'], opencart: ['#23a1d1', '#fff', 'OC'], etsy: ['#f1641e', '#fff', 'E'] }[t];
  if (B) return html`<span class="logo-b${k}" style="background:${B[0]};color:${B[1]}" title="${c.name}">${B[2]}</span>`;
  return html`<span class="logo-b${k}" style="background:${chColor(id)}">${(c.name || '?').slice(0, 1)}</span>`;
}
export const chBadge = (id) => html`<span class="ch-name">${chLogo(id, true)}<span class="ellipsis">${ch(id).short || ch(id).name}</span></span>`;
export const chState = (c) => (c.gated ? ['off', (c.missing || []).length ? 'Bağlı değil' : 'Bağlantı testi bekleniyor'] : c.paused ? ['off', 'Pasif'] : !c.enabled ? ['off', 'Bağlı değil'] : c.demo ? ['demo', 'Örnek veri'] : c.last && c.last.ok === false ? ['err', 'Hata'] : c.last && c.last.ok == null && !c.last.ordersAt ? ['demo', 'Bağlantı bekleniyor'] : ['', 'Bağlı']);
export const thumb = (img, name, cls = '') => html`<span class="thumb ${cls}" style="${img ? `background-image:url('${String(img).replace(/['"()\\]/g, '')}')` : ''}">${img ? '' : (name || '?').slice(0, 2)}</span>`;

// ---------- bildirim ----------
// Kanaldan gelen teknik hata metnini (HTTP kodu, adres, İngilizce mesaj) satıcının anlayacağı dile çevirir; kanalın kendi mesajı varsa sonda kalır
export function friendly(msg) {
  const s = String(msg || '');
  if (!/HTTP \d{3}|https?:\/\/|Failed to fetch|NetworkError|zaman aşımı|bağlantı hatası|timeout/i.test(s)) return s;
  const said = ((/"([^"]{6,200})"/.exec(s) || /(?:message|error)["']?\s*[:=]\s*["']([^"']{6,200})/i.exec(s) || [])[1] || '').trim();
  const who = (/^(\S+?):/.exec(s) || [])[1];
  const ch2 = who && !/^(GET|POST|PUT|PATCH|DELETE)$/.test(who) && who.length < 20 ? who + ': ' : '';
  const tail = said ? ` (Kanalın mesajı: “${said}”)` : '';
  if (/HTTP 40[13]|unauthori|forbidden/i.test(s)) return `${ch2}Kanal bağlantı bilgilerinizi kabul etmedi. Entegrasyonlar'dan API bilgilerini kontrol edin.${tail}`;
  if (/HTTP 429|too many/i.test(s)) return `${ch2}Kanal çok sık istek nedeniyle kısa süre bekletti; birkaç dakika sonra tekrar deneyin.`;
  if (/HTTP 5\d\d|bad gateway|unavailable|internal server/i.test(s)) return `${ch2}Kanalın sunucusu şu an yanıt vermiyor; birkaç dakika sonra tekrar deneyin. Sorun sürerse Destek'e bildirin.`;
  if (/zaman aşımı|timeout|bağlantı hatası|Failed to fetch|NetworkError/i.test(s)) return `${ch2}Kanala bağlanılamadı ya da geç yanıt geldi; biraz sonra tekrar deneyin.`;
  if (/HTTP 404/.test(s)) return `${ch2}Kanalda bu kayıt bulunamadı (silinmiş ya da değişmiş olabilir).${tail}`;
  if (/HTTP 4\d\d/.test(s)) return `${ch2}Kanal işlemi kabul etmedi.${tail || ' Ayrıntı için Tanılama\'yı kullanın ya da Destek\'e bildirin.'}`;
  return s;
}
export function toast(msg, err = false) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 't-msg' + (err ? ' err' : '');
  el.textContent = err ? friendly(msg) : msg;
  // Hata mesajında "Bildir": hata metni ve sayfa bilgisi destek talebine kendiliğinden eklenir
  if (err && state.reportError && (friendly(msg) !== String(msg) || /sunucu|yüklenemedi|ulaşılamadı|başarısız|alınamadı|gönderilemedi/i.test(msg))) {
    const b = document.createElement('button'); b.className = 't-act'; b.textContent = 'Sorun bildir';
    b.onclick = () => { el.remove(); state.reportError(String(msg)); };
    el.append(b);
  }
  box.append(el);
  setTimeout(() => el.remove(), err ? 6500 : 3200);
}
// Butonu meşgul gösterip işi çalıştır; hata olursa bildir
export async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ico ico-sync spin"></i>'; }
  try { return await fn(); } catch (e) { toast(e.message, true); return undefined; } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

// ---------- alt pencere ----------
const sheets = [];
export function sheet({ title, body, foot, size = '', onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg' + (size.includes('drawer') ? ' drawer-bg' : '');
  bg.innerHTML = `<div class="sheet ${size}" role="dialog" aria-modal="true"><div class="sheet-head"><h2 class="ellipsis"></h2><button class="icon-btn" data-close aria-label="Kapat"><i class="ico ico-x"></i></button></div><div class="sheet-body"></div><div class="sheet-foot hide"></div></div>`;
  const s = { el: bg, body: $('.sheet-body', bg), foot: $('.sheet-foot', bg), title: $('h2', bg) };
  s.title.textContent = title || '';
  s.close = () => { if (!bg.isConnected) return; bg.remove(); sheets.splice(sheets.indexOf(s), 1); document.body.style.overflow = sheets.length ? 'hidden' : ''; onClose && onClose(); };
  s.setBody = (tpl) => render(s.body, tpl);
  s.setFoot = (tpl) => { s.foot.classList.toggle('hide', !tpl); if (tpl) render(s.foot, tpl); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) s.close(); });
  if (body) s.setBody(body);
  if (foot) s.setFoot(foot);
  $('#sheet-root').append(bg);
  sheets.push(s);
  document.body.style.overflow = 'hidden';
  return s;
}
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (openMenu) closeMenu(); else if (sheets.length) sheets[sheets.length - 1].close(); } });
export const closeAllSheets = () => [...sheets].forEach((s) => s.close());

export function confirmBox(text, okText = 'Tamam') {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title: 'Onay', size: 'narrow', body: html`<p style="margin:0">${text}</p>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-ok>${okText}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    $('[data-ok]', s.el).onclick = () => { done = true; s.close(); resolve(true); };
  });
}

// ---------- açılır menü ----------
let openMenu = null;
const closeMenu = () => { if (openMenu) { openMenu.remove(); openMenu = null; } };
// Telefonda menü alttan açılan işlem listesi olarak gösterilir (parmakla rahat seçilir, düğme gizli olsa da çalışır)
export function popMenu(anchor, items, { title = '' } = {}) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  render(m, html`${items.map((it, i) => (it === '-' ? html`<div class="sep"></div>` : html`<button data-i="${i}" ${it.danger ? 'style="color:var(--bad)"' : ''}>${it.icon ? html`<i class="ico ico-${it.icon}"></i>` : ''}${it.label}</button>`))}`);
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { const it = items[Number(b.dataset.i)]; closeMenu(); it.run(); } });
  if (isMobile()) {
    const bg = document.createElement('div');
    bg.className = 'menu-bg';
    m.classList.add('as-sheet');
    if (title) { const h = document.createElement('div'); h.className = 'menu-title'; h.textContent = title; m.prepend(h); }
    bg.append(m);
    bg.addEventListener('click', (e) => { if (e.target === bg) closeMenu(); });
    document.body.append(bg);
    openMenu = bg;
    return;
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - m.offsetWidth - 8, Math.max(8, r.right - m.offsetWidth));
  const top = r.bottom + 6 + m.offsetHeight > window.innerHeight ? r.top - m.offsetHeight - 6 : r.bottom + 6;
  m.style.left = left + window.scrollX + 'px';
  m.style.top = top + window.scrollY + 'px';
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { closeMenu(); document.removeEventListener('click', off); } }), 0);
  openMenu = m;
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// Tema: varsayılan açık; koyu ve "cihaza uy" Ayarlar → Görünüm'den (cihaz başına saklanır)
export const themeOf = () => { const t = store.get('theme', 'light'); return ['light', 'dark', 'auto'].includes(t) ? t : 'light'; };
export function applyTheme() {
  const t = themeOf();
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}
export const store = {
  get(k, d) { try { const v = localStorage.getItem('panel:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('panel:' + k, JSON.stringify(v)); } catch { /* özel pencere */ } },
};
export const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
