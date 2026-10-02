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
export const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Dış API isteği: zaman aşımı, 429/5xx'te kısa tekrar, anlaşılır hata mesajı
export async function http(url, { method = 'GET', headers = {}, body: b, timeout = 25000, tries = 2, raw = false } = {}) {
  for (let i = 1; ; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try {
      res = await fetch(url, { method, headers, body: b, signal: ctl.signal });
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
