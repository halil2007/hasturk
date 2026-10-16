// Ürün kargo tutarı ↔ gerçek kargo faturası
// Ürüne girilen kargo tutarı (products.ship_cost, KDV dahil, sipariş başı) kanal kargo faturası / kargo firması ücreti gelmeyen
// siparişlerin kâr tahmininde kullanılır. Faturası gelen siparişin kârında zaten faturadaki tutar kullanılır (orders.shipping_cost,
// shipping_src 'api' / 'carrier'; bkz. finance.js orderProfit). Burada ürünün tutarı faturalara göre tutulur:
//   · Örnek: tek ürünlü, tek adetlik, iptal edilmemiş siparişlerin faturalı kargo tutarı (son 90 gün; birden çok ürün / adet içeren
//     kolinin tutarı ürüne bölünemez, sayılmaz). İade kargosu gönderimle birlikte faturalanmış eski kayıtlar ('lumped') sayılmaz.
//     Kanal farkı gözetilmez (tüm kanalların ortancası): ürüne tek tutar girilir. Son en çok 5 gönderinin ortancası, en az 3 gönderi.
//   · Tutar BOŞ: pazaryerinden gelen kargo tutarı (ortanca) yazılır, kaynağı 'channel' (formda "Pazaryerinden gelen kargo bilgisi").
//   · Kaynak 'channel' (sistem yazdı): faturalar belirgin biçimde değişirse (%3 / 1 ₺ düşük ya da %5 / 2 ₺ yüksek) tutar ortancaya güncellenir.
//   · Kaynak 'user' (kullanıcı girdi): sistem bir daha DEĞİŞTİRMEZ. Faturalar belirgin biçimde yüksek ya da düşükse ürün formunda not
//     ve bildirim (ürün başına en fazla iki kez: ilk tespitte ve 30 gün sonra hâlâ farklıysa bir kez daha).
//   · Ürün tutarı en son girildikten / güncellendikten sonraki (ship_set_at) gönderiler karşılaştırılır.
import { all, allIn, first, run, getRaw, setSetting, log, notify, resolve } from './db.js';
import { fail, r2 } from './util.js';

const D = 864e5;
export const SHIP_DAYS = 90, SHIP_LAST = 5, SHIP_MIN = 3;
export const LOWER_PCT = 3, LOWER_MIN = 1, HIGHER_PCT = 5, HIGHER_MIN = 2;
export const REMIND_DAYS = 30, MAX_NOTICES = 2;
const TTL = 6 * 3600e3;

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tl = (v) => `${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const parse = (v) => { if (!v) return null; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

// Faturalı tek ürünlü gönderiler: Map(ürün id → [{ cost, at, channel, id }], yeniden eskiye)
export async function shipSamples(db, { productIds = null, now = Date.now() } = {}) {
  const sql = (extra) => `SELECT o.id, o.channel, o.ordered_at AS at, o.shipping_cost AS cost, MIN(i.product_id) AS pid
    FROM orders o JOIN order_items i ON i.order_id = o.id
    WHERE o.shipping_src IN ('api', 'carrier') AND o.shipping_cost > 0 AND o.ordered_at >= ? AND o.status != 'cancelled'
      AND COALESCE(o.return_ship_src, '') != 'lumped' AND COALESCE(i.status, '') != 'cancelled'${extra}
    GROUP BY o.id HAVING COUNT(*) = 1 AND SUM(i.quantity) = 1 AND MIN(i.product_id) IS NOT NULL`;
  const since = now - SHIP_DAYS * D;
  const rows = productIds
    ? await allIn(db, productIds, (ph, part) => [sql(` AND o.id IN (SELECT order_id FROM order_items WHERE product_id IN (${ph}))`), [since, ...part]])
    : await all(db, sql(''), since);
  const by = new Map();
  for (const r of rows) (by.get(r.pid) || by.set(r.pid, []).get(r.pid)).push({ id: r.id, channel: r.channel, at: r.at, cost: Number(r.cost) });
  for (const a of by.values()) a.sort((x, y) => y.at - x.at);
  return by;
}

// Ürünün durumu: { n, median, entered, action: 'fill' | 'lower' | 'higher' | 'ok' | null (yetersiz veri) }
export function evaluateShip(p, samples) {
  const entered = Number(p.ship_cost) || 0;
  const fresh = (samples || []).filter((s) => !p.ship_set_at || s.at > p.ship_set_at).slice(0, SHIP_LAST);
  if (fresh.length < SHIP_MIN) return { n: fresh.length, median: null, entered, action: null };
  const med = r2(median(fresh.map((s) => s.cost)));
  if (!(entered > 0)) return { n: fresh.length, median: med, entered: 0, action: 'fill' };
  const diff = med - entered;
  const action = -diff > entered * (LOWER_PCT / 100) && -diff > LOWER_MIN ? 'lower' : diff > entered * (HIGHER_PCT / 100) && diff > HIGHER_MIN ? 'higher' : 'ok';
  return { n: fresh.length, median: med, entered, action };
}

// Senkron işi: boşsa pazaryerinden doldur, sistemin yazdığını güncelle, kullanıcının girdiği farklıysa (ürün başına en fazla iki kez) uyar.
// force: 6 saat beklemesini atla
export async function shipCheck(db, { force = false, now = Date.now() } = {}) {
  const last = await getRaw(db, 'shipcheck').catch(() => null);
  if (!force && last && now - last.at < TTL) return null;
  await setSetting(db, 'shipcheck', { at: now });
  const samples = await shipSamples(db, { now });
  const cols = 'id, name, variant_name, ship_cost, ship_set_at, ship_warn, ship_src';
  const products = await all(db, `SELECT ${cols} FROM products WHERE ship_cost > 0`);
  const have = new Set(products.map((p) => p.id)), empty = [...samples.keys()].filter((id) => !have.has(id));
  if (empty.length) products.push(...await allIn(db, empty, (ph, part) => [`SELECT ${cols} FROM products WHERE id IN (${ph}) AND COALESCE(ship_cost, 0) <= 0`, part]));
  const out = { filled: 0, updated: 0, lower: 0, higher: 0, notified: 0 }, due = [], st = [];
  const nameOf = (p) => [p.name, p.variant_name].filter(Boolean).join(' · ');
  for (const p of products) {
    const e = evaluateShip(p, samples.get(p.id));
    const warn = parse(p.ship_warn), own = p.ship_src !== 'channel';
    if (!e || !e.action) continue; // yetersiz fatura: önceki durum korunur
    if (e.action === 'fill' || (!own && (e.action === 'lower' || e.action === 'higher'))) {
      const auto = { from: e.entered || null, to: e.median, at: now, n: e.n, by: 'Pazaryeri' };
      st.push(db.prepare(`UPDATE products SET ship_cost = ?, ship_src = 'channel', ship_set_at = ?, ship_auto = ?, ship_warn = NULL, updated_at = ? WHERE id = ? AND COALESCE(ship_cost, 0) = ?`)
        .bind(e.median, now, JSON.stringify(auto), now, p.id, Number(p.ship_cost) || 0));
      if (e.action === 'fill') out.filled++; else out.updated++;
      await log(db, null, 'info', e.action === 'fill' ? `${nameOf(p)}: kargo tutarı pazaryerinden gelen kargo bilgisiyle yazıldı: ${tl(e.median)} (son ${e.n} gönderinin ortancası)`
        : `${nameOf(p)}: kargo tutarı pazaryerinden gelen kargo bilgisine göre güncellendi: ${tl(e.entered)} → ${tl(e.median)} (son ${e.n} gönderinin ortancası)`);
    } else if (e.action === 'lower' || e.action === 'higher') {
      out[e.action]++;
      const w = warn && warn.dir === e.action ? warn : { first_at: now, notified_at: null, count: 0 };
      const notifyNow = w.count < MAX_NOTICES && (!w.notified_at || now - w.notified_at >= REMIND_DAYS * D);
      const next = { ...w, dir: e.action, median: e.median, n: e.n, entered: e.entered, at: now, ...(notifyNow ? { notified_at: now, count: w.count + 1 } : {}) };
      st.push(db.prepare('UPDATE products SET ship_warn = ? WHERE id = ?').bind(JSON.stringify(next), p.id));
      if (notifyNow) due.push({ p, e });
    } else if (warn) st.push(db.prepare('UPDATE products SET ship_warn = NULL WHERE id = ?').bind(p.id));
  }
  for (let i = 0; i < st.length; i += 90) await db.batch(st.slice(i, i + 90));
  if (due.length) {
    out.notified = due.length;
    await notify(db, 'shipcost:diff', { level: 'warn', title: `${due.length} üründe girdiğiniz kargo tutarı pazaryerinden gelen tutardan farklı`,
      msg: due.slice(0, 5).map(({ p, e }) => `${nameOf(p)}: sizin girdiğiniz ${tl(e.entered)}, pazaryerinden gelen ${tl(e.median)} (${e.action === 'higher' ? 'kargo daha pahalı gidiyor' : 'kargo daha ucuz gidiyor'}, son ${e.n} gönderi)`).join(' · ')
        + (due.length > 5 ? ` ve ${due.length - 5} ürün daha` : '') + '. Girdiğiniz tutar değiştirilmez; kâr tahmini bu tutarla hesaplanır. Düzeltmek için Ürünler → Düzenle → "Pazaryerindeki tutarı kullan". Bu uyarı ürün başına en fazla iki kez gönderilir.' });
  }
  if (!(out.lower + out.higher) && !(await first(db, 'SELECT 1 AS x FROM products WHERE ship_warn IS NOT NULL LIMIT 1'))) { await resolve(db, 'shipcost:diff'); await resolve(db, 'shipcost:high'); }
  return out;
}

// Ürün formundaki "Faturadaki tutarı kullan": ürünün kargo tutarı faturalı gönderilerin ortancası olur (önceki tutar ship_auto'da)
export async function shipFromInvoice(db, id, user, now = Date.now()) {
  const p = await first(db, 'SELECT id, name, ship_cost, ship_set_at FROM products WHERE id = ?', Number(id));
  if (!p) fail(404, 'Ürün bulunamadı');
  const s = (await shipSamples(db, { productIds: [p.id], now })).get(p.id) || [];
  const fresh = s.filter((x) => !p.ship_set_at || x.at > p.ship_set_at).slice(0, SHIP_LAST);
  if (fresh.length < SHIP_MIN) fail(409, `Faturalı gönderi yetersiz (${fresh.length}; en az ${SHIP_MIN} tek ürünlü gönderi gerekir)`);
  const med = r2(median(fresh.map((x) => x.cost)));
  await run(db, "UPDATE products SET ship_cost = ?, ship_src = 'channel', ship_set_at = ?, ship_auto = ?, ship_warn = NULL, updated_at = ? WHERE id = ?",
    med, now, JSON.stringify({ from: p.ship_cost, to: med, at: now, n: fresh.length, by: (user && user.name) || '' }), now, p.id);
  await log(db, null, 'info', `${(user && user.name) || 'Sistem'}: ${p.name} kargo tutarı faturadaki tutara göre ${tl(p.ship_cost || 0)} → ${tl(med)}`);
  if (!(await first(db, 'SELECT 1 AS x FROM products WHERE ship_warn IS NOT NULL LIMIT 1'))) { await resolve(db, 'shipcost:diff'); await resolve(db, 'shipcost:high'); }
  return { ok: true, ship_cost: med, n: fresh.length };
}

// Ürün formu için: son otomatik güncelleme ve yüksek fatura notu
export function shipInfo(p) {
  const auto = parse(p.ship_auto), warn = parse(p.ship_warn);
  return { auto: auto && Number(p.ship_cost) === Number(auto.to) ? auto : null, warn, src: p.ship_src || (Number(p.ship_cost) > 0 ? 'user' : null) };
}
