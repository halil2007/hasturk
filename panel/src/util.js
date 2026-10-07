// Ortak yardımcılar: JSON cevapları, tarih anahtarları (Türkiye saati), dış istekler.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export async function body(req) {
  const text = await req.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { fail(400, 'Geçersiz JSON'); }
}

export const now = () => Date.now();
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (v, d = 0) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : d; };
export const str = (v) => (v == null ? '' : String(v)).trim();
// Pazaryeri kategori özelliği bir görsel adresi mi istiyor (ör. Hepsiburada "Paket Görseli (ön)")? Listeden seçilen özellikler hariç.
// Görsel listesi: kanaldan gelen dizi (adres ya da {url}/{imageUrl}) → tekrarsız https adresleri (en fazla 12)
export function imageList(list, max = 12) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const u = str(typeof x === 'string' ? x : x && (x.url || x.imageUrl || x.src || x.path));
    if (/^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}
export const isImageAttr = (a) => !!a && /g[öo]rsel|resim|foto[gğ]raf|image|photo/i.test(String(a.name || '')) && !/enum|list|select/i.test(String(a.type || ''));

// Türkiye UTC+3 (yaz saati yok): gün/hafta/ay anahtarları bu saate göre
export const TR = 3 * 3600e3;
export const dayKey = (ms) => new Date(ms + TR).toISOString().slice(0, 10);
export const monthKey = (ms) => new Date(ms + TR).toISOString().slice(0, 7);
export function weekKey(ms) {
  // Pazartesi ile başlayan hafta; anahtar haftanın pazartesi günü
  const d = new Date(ms + TR);
  const wd = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd)).toISOString().slice(0, 10);
}
// Türkiye saatine göre günün başlangıcı (UTC ms)
export const dayStart = (ms) => Date.parse(dayKey(ms) + 'T00:00:00Z') - TR;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Sınırlı eşzamanlılık: kanal API çağrıları sırayla değil, n'er n'er yapılır (toplu etiket / toplu işlem hızı); sonuç sırası korunur
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
export const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Dış API isteği: zaman aşımı, 429/5xx'te kısa tekrar, anlaşılır hata mesajı
export async function http(url, { method = 'GET', headers = {}, body: b, timeout = 25000, tries = 2, raw = false } = {}) {
  for (let i = 1; ; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try {
      // Kimliksiz (User-Agent'sız) istekleri bazı pazaryeri güvenlik duvarları 403 ile reddeder: verilmediyse panel kimliği eklenir
      const h = headers && !Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent') ? { ...headers, 'User-Agent': 'HasturkPanel/1.0 (+https://workers.cloudflare.com)' } : headers;
      res = await fetch(url, { method, headers: h, body: b, signal: ctl.signal });
    } catch (e) {
      clearTimeout(t);
      if (i < tries) { await sleep(800 * i); continue; }
      throw new Error(`${method} ${shortUrl(url)}: bağlantı hatası (${e.name === 'AbortError' ? 'zaman aşımı' : e.message})`);
    }
    clearTimeout(t);
    if ((res.status === 429 || res.status >= 500) && i < tries) { await sleep(1500 * i); continue; }
    if (raw) {
      if (!res.ok) throw new Error(`${method} ${shortUrl(url)}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
      return res;
    }
    const text = await res.text();
    let data = text;
    if (/json/i.test(res.headers.get('content-type') || '') || /^\s*[[{]/.test(text)) { try { data = JSON.parse(text); } catch { /* düz metin */ } }
    if (!res.ok) {
      const msg = typeof data === 'object' && data ? (data.message || data.errorMessage || (data.errors && JSON.stringify(data.errors)) || JSON.stringify(data)) : text;
      const err = new Error(`${method} ${shortUrl(url)}: HTTP ${res.status} ${String(msg).slice(0, 400)}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
}
const shortUrl = (u) => { try { const x = new URL(u); return x.host + x.pathname; } catch { return u; } };

export const basic = (user, pass) => 'Basic ' + btoa(unescape(encodeURIComponent(`${user}:${pass}`)));

// Sipariş durumları (panelin kendi dili)
export const STATUS = ['new', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
export const RANK = { new: 0, processing: 1, shipped: 2, delivered: 3 };
// Uzak durum ile panelde yapılan işlem birleşir: iptal/iade her zaman kazanır, aksi halde hangisi daha ilerideyse o
export function mergeStatus(remote, local) {
  if (remote === 'cancelled' || remote === 'returned') return remote;
  if (local === 'cancelled' || local === 'returned') return local;
  if (!local) return remote;
  return (RANK[local] ?? 0) > (RANK[remote] ?? 0) ? local : remote;
}

// Kanalın verdiği etiketi (adres, data: URI, base64 PDF/PNG/JPG ya da ZPL metni) pakete kaydedilecek biçime çevirir
export function toB64(buf) {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
const MAGIC = [['JVBER', 'pdf'], ['iVBOR', 'png'], ['/9j/', 'jpg'], ['R0lGOD', 'gif']];
const fromMime = (m) => (/pdf/i.test(m) ? 'pdf' : /png/i.test(m) ? 'png' : /jpe?g/i.test(m) ? 'jpg' : /gif/i.test(m) ? 'gif' : /zpl|text\/plain/i.test(m) ? 'zpl' : '');
export async function labelFrom(v, base) {
  const s = String(v || '').trim();
  if (!s) return null;
  let format = '', data = '';
  if (/^https?:\/\//i.test(s)) {
    const res = await fetch(s);
    if (!res.ok) throw new Error(`Etiket dosyası alınamadı (HTTP ${res.status})`);
    const buf = new Uint8Array(await res.arrayBuffer());
    format = fromMime(res.headers.get('content-type') || '');
    if (format === 'zpl' || (!format && /\^XA/.test(new TextDecoder().decode(buf.subarray(0, 200))))) return { format: 'zpl', data: new TextDecoder().decode(buf), filename: base + '.zpl' };
    data = toB64(buf);
  } else if (/^data:/i.test(s)) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(s);
    if (!m) return null;
    format = fromMime(m[1]);
    data = m[2] ? m[3] : btoa(unescape(encodeURIComponent(decodeURIComponent(m[3]))));
  } else if (/\^XA/.test(s)) {
    return { format: 'zpl', data: s, filename: base + '.zpl' };
  } else {
    data = s.replace(/\s+/g, '');
  }
  if (!format) format = (MAGIC.find(([k]) => data.startsWith(k)) || [, ''])[1];
  if (!format) {
    try { const txt = atob(data.slice(0, 400)); if (/\^XA/.test(txt)) return { format: 'zpl', data: atob(data), filename: base + '.zpl' }; } catch { /* base64 değil */ }
    return null;
  }
  return { format, data, filename: `${base}.${format}` };
}

// Gecikme riski (geciken dahil): açık paketi olan (ya da paketsiz) hazırlanmayı bekleyen sipariş; kanal son teslim tarihi verdiyse ona 12 saatten
// az kaldı / geçti, vermediyse sipariş 1 günü aştı. Ayrı sekme yok: Yeni / Hazırlanıyor listelerinde "Gecikme riski" etiketi (core.js lateInfo ile aynı kural).
// 15 günden eski siparişler sayılmaz (kanalda durumu güncellenmemiş eski kayıtlar gecikenler listesini doldurmasın).
export const LATE_MAX_DAYS = 15;
export const LATE = `(o.status IN ('new', 'processing') AND o.ordered_at >= (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - ${LATE_MAX_DAYS * 86400000}) AND (NOT EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id) OR EXISTS (SELECT 1 FROM packages k WHERE k.order_id = o.id AND k.status = 'open'))
  AND ((o.ship_by IS NOT NULL AND o.ship_by < (CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 43200000)) OR (o.ship_by IS NULL AND o.ordered_at < (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000))))`;

// Tanılama adımı: işlemi çalıştırır, HTTP hatasını anlaşılır açıklamayla döndürür
export function explainHttp(msg) {
  const m = /HTTP (\d{3})/.exec(msg || ''), c = m ? Number(m[1]) : 0;
  const why = { 400: 'istek reddedildi (parametre / gövde hatası)', 401: 'kimlik doğrulanamadı: API anahtarı / şifre yanlış', 403: 'yetki yok: API kullanıcısının bu servise izni kapalı ya da IP kısıtı var', 404: 'adres bulunamadı (servis yolu ya da satıcı numarası yanlış)', 429: 'çok fazla istek (kısa süre sonra tekrar deneyin)', 500: 'kanal sunucusu hata verdi', 502: 'kanal sunucusu yanıt vermedi', 503: 'kanal servisi geçici olarak kapalı', 520: 'kanal sunucusu bağlantıyı yanıtsız kapattı (Cloudflare 520: IP / hesap erişimi ya da sunucu sorunu)', 521: 'kanal sunucusu bağlantıyı reddetti', 522: 'kanal sunucusuna bağlanırken zaman aşımı', 524: 'kanal sunucusu zamanında yanıt vermedi' }[c];
  return why ? `${msg} → ${why}` : msg;
}
export async function diagStep(out, name, fn) {
  try { const r = await fn(); out.push({ name, ok: true, ...r }); return r || {}; } catch (e) { out.push({ name, ok: false, detail: explainHttp(e.message) }); return null; }
}
// Sipariş satırı iptal ya da iade edildi mi (satılmış sayılmaz: paketleme, ciro, kâr, toplama listesi dışında kalır)
export const DEAD_LINE = (s) => s === 'cancelled' || s === 'returned';

// Siparişin ürün kargo tutarı: canlı satırlardaki ürünlerin kargo tutarlarının en yükseği (sipariş tek koli gider varsayımı)
export const PRODUCT_SHIP = "(SELECT MAX(sp.ship_cost) FROM order_items si JOIN products sp ON sp.id = si.product_id WHERE si.order_id = o.id AND COALESCE(si.status, '') NOT IN ('cancelled', 'returned') AND sp.ship_cost > 0)";
