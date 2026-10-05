// Döviz bazlı fiyat: ürüne dolar / euro / sterlin fiyatı girilir; TL satış fiyatı ve kanal fiyatları kurla hesaplanır.
// Kur kaynağı (Ayarlar → Döviz ve fiyat):
//   tcmb = Merkez Bankası günlük kuru (iş günlerinde ~15:30'da açıklanır; resmi, gün içinde değişmez)
//   live = anlık piyasa kuru (her senkronda, ~15 dakikada bir okunur)
// Güncelleme sıklığı: live (her senkron, kur eşikten fazla değişince) · daily · weekly (pazartesi) · monthly (ayın 1'i) · manual (yalnız düğmeyle).
// Kanal fiyatları ürünün eski TL fiyatına göre oranı korunarak güncellenir (ör. Trendyol'daki fiyat %10 farklıysa fark korunur).
import { all, first, getRaw, setSetting, log } from './db.js';
import { http, chunk } from './util.js';

export const CURRENCIES = ['USD', 'EUR', 'GBP'];
export const FX_DEFAULTS = { source: 'tcmb', kind: 'sell', mode: 'daily', threshold: 0.5, rounding: 'none', margin: 0 };
const KINDS = { buy: 'ForexBuying', sell: 'ForexSelling', bbuy: 'BanknoteBuying', bsell: 'BanknoteSelling' };
const trDay = (t = Date.now()) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);

// TCMB today.xml → { USD: { buy, sell, bbuy, bsell }, ... }, date
export function parseTcmb(xml) {
  const out = {};
  for (const c of CURRENCIES) {
    const m = new RegExp(`<Currency[^>]*Kod="${c}"[^>]*>([\\s\\S]*?)</Currency>`).exec(xml);
    if (!m) continue;
    const v = (t) => { const x = new RegExp(`<${t}>([\\d.,]+)</${t}>`).exec(m[1]); return x ? Number(x[1].replace(',', '.')) : null; };
    out[c] = { buy: v('ForexBuying'), sell: v('ForexSelling'), bbuy: v('BanknoteBuying'), bsell: v('BanknoteSelling') };
  }
  const d = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  return { rates: out, date: d ? `${d[3]}-${d[2]}-${d[1]}` : trDay() };
}

async function fetchTcmb() {
  const res = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { headers: { Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`TCMB kur servisi HTTP ${res.status}`);
  const r = parseTcmb(await res.text());
  if (!r.rates.USD || !r.rates.USD.sell) throw new Error('TCMB kur listesi okunamadı');
  return { source: 'tcmb', date: r.date, rates: r.rates };
}
// Anlık kur: piyasa fiyatı (alış = satış). Birincil kaynak Yahoo Finance (XXXTRY=X), olmazsa open.er-api.com.
async function fetchLive() {
  const rates = {};
  try {
    for (const c of CURRENCIES) {
      const r = await http(`https://query1.finance.yahoo.com/v8/finance/chart/${c}TRY=X?interval=1m&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, tries: 2, timeout: 15000 });
      const p = r && r.chart && r.chart.result && r.chart.result[0] && r.chart.result[0].meta && r.chart.result[0].meta.regularMarketPrice;
      if (!(p > 0)) throw new Error('kur yok');
      rates[c] = { buy: p, sell: p, bbuy: p, bsell: p };
    }
  } catch {
    const r = await http('https://open.er-api.com/v6/latest/TRY', { tries: 2, timeout: 15000 });
    for (const c of CURRENCIES) { const x = r && r.rates && r.rates[c]; if (x > 0) { const p = 1 / x; rates[c] = { buy: p, sell: p, bbuy: p, bsell: p }; } }
    if (!rates.USD) throw new Error('Anlık kur alınamadı');
    return { source: 'live', provider: 'open.er-api.com', date: trDay(), rates };
  }
  return { source: 'live', provider: 'Yahoo Finance', date: trDay(), rates };
}

// Kurları yenile: anlık kaynakta her çağrıda, TCMB'de en fazla saatte bir (kur günde bir açıklanır)
export async function refreshRates(db, settings, { force = false } = {}) {
  const fx = { ...FX_DEFAULTS, ...(settings.fx || {}) };
  const cur = await getRaw(db, 'fx_rates');
  if (!force && cur && cur.source === fx.source && Date.now() - cur.at < (fx.source === 'live' ? 10 * 60e3 : 3600e3)) return cur;
  const r = fx.source === 'live' ? await fetchLive() : await fetchTcmb();
  const out = { ...r, at: Date.now() };
  await setSetting(db, 'fx_rates', out);
  return out;
}
export const rateOf = (rates, c, kind = 'sell') => { const x = rates && rates.rates && rates.rates[c]; return x ? x[kind] || x.sell || null : null; };

function round(v, mode) {
  if (mode === 'int') return Math.round(v);
  if (mode === '90') return Math.max(0.9, Math.ceil(v) - 0.1);
  if (mode === '99') return Math.max(0.99, Math.ceil(v) - 0.01);
  return Math.round(v * 100) / 100;
}
export const fxPrice = (p, rate, fx) => round(p.fx_price * rate * (1 + (p.fx_margin ?? fx.margin ?? 0) / 100), fx.rounding);

// Güncelleme zamanı geldi mi?
function due(fx, last, rates) {
  if (fx.mode === 'manual') return false;
  if (!last) return true;
  const now = new Date(Date.now() + 3 * 3600e3);
  if (fx.mode === 'live') return CURRENCIES.some((c) => { const a = rateOf(rates, c, fx.kind), b = last.rates && last.rates[c]; return a && (!b || Math.abs(a - b) / b * 100 >= (Number(fx.threshold) || 0)); });
  const ld = new Date(last.at + 3 * 3600e3);
  if (fx.mode === 'daily') return trDay() !== trDay(last.at) && (fx.source !== 'tcmb' || rates.date === trDay());
  if (fx.mode === 'weekly') return now.getUTCDay() === 1 && trDay() !== trDay(last.at);
  if (fx.mode === 'monthly') return now.getUTCDate() === 1 && (now.getUTCMonth() !== ld.getUTCMonth() || now.getUTCFullYear() !== ld.getUTCFullYear());
  return false;
}

// Döviz fiyatlı ürünlerin TL fiyatlarını ve bağlı ilanlarını güncelle
export async function applyFx(db, settings, rates, { user = 'Otomatik', ids = null } = {}) {
  const fx = { ...FX_DEFAULTS, ...(settings.fx || {}) };
  const prods = await all(db, `SELECT id, name, currency, fx_price, fx_margin, sale_price FROM products WHERE currency IN ('USD', 'EUR', 'GBP') AND fx_price > 0${ids ? ` AND id IN (${ids.map(() => '?').join(',')})` : ''}`, ...(ids || []));
  let changed = 0, listings = 0;
  for (const part of chunk(prods, 40)) {
    const st = [];
    for (const p of part) {
      const rate = rateOf(rates, p.currency, fx.kind);
      if (!rate) continue;
      const price = fxPrice(p, rate, fx);
      if (Math.abs(price - (p.sale_price || 0)) < 0.005) continue;
      changed++;
      st.push(db.prepare('UPDATE products SET sale_price = ?, updated_at = ? WHERE id = ?').bind(price, Date.now(), p.id));
      // Kanal fiyatları: eski TL fiyatına göre oran korunur; eski fiyat yoksa yeni fiyat yazılır
      const k = p.sale_price > 0 ? price / p.sale_price : null;
      st.push(db.prepare(`UPDATE listings SET price = ROUND(CASE WHEN ? IS NOT NULL AND price > 0 THEN price * ? ELSE ? END, 2), price_dirty = 1 WHERE product_id = ?`).bind(k, k, price, p.id));
    }
    if (st.length) await db.batch(st);
  }
  if (changed) listings = (await first(db, `SELECT COUNT(*) AS n FROM listings WHERE price_dirty = 1`)).n;
  const applied = { at: Date.now(), source: rates.source, rates: Object.fromEntries(CURRENCIES.map((c) => [c, rateOf(rates, c, fx.kind)])), changed };
  if (!ids) await setSetting(db, 'fx_applied', applied);
  if (changed) await log(db, null, 'info', `${user}: döviz kuru ile ${changed} ürünün fiyatı güncellendi (${CURRENCIES.map((c) => `${c} ${applied.rates[c] ? applied.rates[c].toFixed(4) : '—'}`).join(', ')})`);
  return { changed, listings, rates: applied.rates };
}

// Senkronda: kurları yenile, zamanı geldiyse fiyatları güncelle
export async function syncFx(env, db, settings) {
  if (env.TENANT_SLUG) return null; // müşteri panellerinde yakında
  const n = (await first(db, "SELECT COUNT(*) AS n FROM products WHERE currency IN ('USD', 'EUR', 'GBP') AND fx_price > 0")).n;
  if (!n) return null; // döviz fiyatlı ürün yoksa kur servisine gidilmez (kurlar Ayarlar açılınca okunur)
  const fx = { ...FX_DEFAULTS, ...(settings.fx || {}) };
  const rates = await refreshRates(db, settings, { force: fx.source === 'live' });
  const last = await getRaw(db, 'fx_applied');
  if (!due(fx, last, rates)) return { rates: rates.rates, products: n, skipped: true };
  return applyFx(db, settings, rates);
}
