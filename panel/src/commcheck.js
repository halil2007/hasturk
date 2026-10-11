// Komisyon kontrolü (Trendyol / Hepsiburada):
//  1) Resmî listeyle sağlama: ilanın pazaryeri kategorisi (listings.mp_category) resmî komisyon listesinde TEK anlamlı eşleşirse listedeki
//     oran (KDV dahil: Trendyol oranı olduğu gibi, Hepsiburada oranı × 1,20) bulunur. Kanalın bildirdiği oran listeden 0,5 puandan fazla
//     yüksekse "veri sorunu olabilir" diye gösterilir; ilanın oranı hiç bilinmiyorsa liste oranı tahmin olarak yazılır (commission_src 'list').
//     Eşleşme yalnız birebir ad eşitliğiyle yapılır (Türkçe harf / büyük-küçük farkı yok sayılır); tahmin yapılmaz, eşleşmeyen ilan atlanır.
//  2) Komisyon indirimi (sipariş ayrıntısında satır komisyonu bildiren her kanal, dönem özetinde Trendyol / Hepsiburada): sipariş
//     satırındaki gerçek oran, ilanın olağan oranından (son 90 günün ortancası, en az 3 satır) ya da liste
//     oranından en az 1 puan düşükse satır "indirimli" sayılır; kazanç = (normal oran − gerçek oran) × satır tutarı. Saklanmaz, her
//     seferinde hesaplanır.
//  3) Sonradan gelen komisyon iadesi / düzeltmesi: hakediş kayıtlarından (bkz. finance.js commissionCredits).
import { LISTS } from './commission-lists.js';
import { all, allIn, first } from './db.js';
import { keptShare, commissionCredits } from './finance.js';
import { chunk, r2 } from './util.js';

const D = 864e5;
export const DISCOUNT_MIN = 1;   // puan: bu kadar düşükse "komisyon indirimi"
export const ABOVE_LIST = 0.5;   // puan: kanal oranı listeden bu kadar yüksekse veri sorunu
const MIN_SAMPLES = 3;            // olağan oran için en az satır

// Kanal kimliği → resmî listesi olan pazaryeri (ek mağazalar: trendyol_2 …; Trendyol Go ayrı sözleşme, listesi yok)
export const mpOf = (ch) => { const m = /^(trendyol|hepsiburada)(?:_\w+)?$/.exec(String(ch || '')); return m ? m[1] : null; };
const fold = (s) => String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c]).replace(/\s+/g, ' ').trim();

// Liste dizini: ürün grubu adı (yolun son parçası, virgülle ayrılmış) ve alt kategori adı → satırlar
let IDX = null;
function index() {
  if (IDX) return IDX;
  IDX = {};
  for (const [mp, d] of Object.entries(LISTS)) {
    const leaf = new Map(), mid = new Map();
    const add = (m, k, e) => { if (k) (m.get(k) || m.set(k, []).get(k)).push(e); };
    for (const [path, rate] of d.cats) {
      const parts = path.split(' > '), e = { path, rate: d.basis === 'kdv-haric' ? r2(rate * 1.2) : rate };
      for (const t of new Set(parts[parts.length - 1].split(',').map(fold))) add(leaf, t, e);
      if (parts.length > 2) add(mid, fold(parts[parts.length - 2]), e);
    }
    IDX[mp] = { leaf, mid };
  }
  return IDX;
}
// Tek anlamlı: aynı ada denk gelen satırların hepsi aynı oranda (farklı oranlı birden çok satır → eşleşme yok)
const one = (list) => (list && list.length && new Set(list.map((x) => x.rate)).size === 1 ? list[0] : null);
// İlanın resmî liste oranı (KDV dahil %) ve listedeki yolu; eşleşmezse null
export function listRate(channel, category) {
  const mp = mpOf(channel);
  if (!mp || !String(category || '').trim()) return null;
  const ix = index()[mp], parts = String(category).split(/\s*(?:>|›|\/)\s*/).filter(Boolean);
  for (const name of [...new Set([String(category), parts[parts.length - 1]])]) {
    const k = fold(name), hit = one(ix.leaf.get(k)) || (!ix.leaf.has(k) && one(ix.mid.get(k)));
    if (hit) return { rate: hit.rate, path: hit.path, mp };
  }
  return null;
}
export const listInfo = () => Object.fromEntries(Object.entries(LISTS).map(([mp, d]) => [mp, { basis: d.basis, published: d.published, title: d.title, n: d.cats.length }]));

// Oranı bilinmeyen (ya da önceden listeden yazılmış) ilanlara liste oranı: kanal oranı (api) ve elle girilen oran korunur
export async function applyListRates(db, channel) {
  if (!mpOf(channel)) return 0;
  const rows = await all(db, "SELECT remote_id, mp_category, commission, commission_src FROM listings WHERE channel = ? AND (commission IS NULL OR commission_src = 'list') AND (COALESCE(mp_category, '') != '' OR commission_src = 'list')", channel);
  const st = [];
  for (const r of rows) {
    const x = listRate(channel, r.mp_category), v = x ? x.rate : null;
    if (v === r.commission || (v == null && r.commission == null)) continue;
    st.push(db.prepare(`UPDATE listings SET commission = ?, commission_src = ? WHERE channel = ? AND remote_id = ? AND (commission IS NULL OR commission_src = 'list')`).bind(v, v == null ? null : 'list', channel, r.remote_id));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  return st.length;
}

// ---------- ilanın ana (baz) komisyon oranı ----------
// Sipariş satırındaki komisyon gerçek kesintidir (kâr raporları onu kullanır). Pazaryeri bazı siparişlerde kendi indirimini yapar
// (idefix'in %4,x kestiği sipariş, Hepsiburada'nın sipariş başı indirimi, Trendyol komisyon kampanyası): bu oran sürekli değildir,
// satıcıyı bağlamaz. İlana yazılan oran ileriye dönük hesapların (fiyat önerisi, başa baş fiyat, avantajlı etiket kârı, istatistik
// tahmini, ürün formundaki kâr) ANA oranıdır: son 90 günün canlı satırlarındaki EN YÜKSEK oran; kategori resmî listeyle eşleşiyorsa
// liste oranının altına inmez. Tek bir indirimli satır ana oranı düşürmez; oran artışı hemen yansır, kalıcı düşüş 90 gün sonra
// (ya da elle girilerek). Elle girilen oran (commission_src 'manual') hiç değişmez.
export const BASE_DAYS = 90;
export function baseRate(rates, list) {
  const v = [...(rates || []), ...(list != null && Number.isFinite(list) ? [list] : [])].filter((x) => Number.isFinite(x) && x > 0);
  return v.length ? r2(Math.max(...v)) : null;
}
// Verilen ilanların (keys: remote_id listesi; boşsa kanalın son 90 günde satan tüm ilanları) ana oranını yeniden hesaplar ve değiştiyse
// yazar (commission_src 'api'). Değişen ilan sayısı döner.
export async function refreshBaseRates(db, channel, keys = null, now = Date.now()) {
  const since = now - BASE_DAYS * D;
  const sql = (extra) => `SELECT i.remote_key AS k, MAX(i.commission * 100.0 / i.total) AS r FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.channel = ? AND o.ordered_at >= ? AND i.commission IS NOT NULL AND i.total > 0 AND COALESCE(i.remote_key, '') != '' AND ${LIVE_LINE}${extra} GROUP BY i.remote_key`;
  const rows = keys ? (keys.length ? await allIn(db, [...new Set(keys)], (ph, part) => [sql(` AND i.remote_key IN (${ph})`), [channel, since, ...part]]) : [])
    : await all(db, sql(''), channel, since);
  if (!rows.length) return 0;
  const top = new Map(rows.map((r) => [r.k, Number(r.r)]));
  const ls = await allIn(db, [...top.keys()], (ph, part) => [`SELECT remote_id, mp_category, commission, commission_src FROM listings WHERE channel = ? AND remote_id IN (${ph})
    AND (commission IS NULL OR commission_src IN ('api', 'list'))`, [channel, ...part]]);
  const st = [];
  for (const l of ls) {
    const lr = listRate(channel, l.mp_category), v = baseRate([top.get(l.remote_id)], lr ? lr.rate : null);
    if (v == null || (l.commission_src === 'api' && l.commission != null && Math.abs(l.commission - v) < 0.005)) continue;
    st.push(db.prepare("UPDATE listings SET commission = ?, commission_src = 'api' WHERE channel = ? AND remote_id = ? AND (commission IS NULL OR commission_src IN ('api', 'list'))").bind(v, channel, l.remote_id));
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  return st.length;
}
// Tek seferlik: önceki kural ilana SON siparişin oranını yazıyordu (indirimli tek satır ana oranı düşürüyordu). Kanaldan oranı gelen
// ilanlar yeni kurala göre yeniden hesaplanır. İşaret önce alınır (iki örnek aynı anda çalıştırmasın); hata olursa geri bırakılır.
export async function rebaseOnce(db, now = Date.now()) {
  const claim = await first(db, "INSERT INTO settings (k, v) VALUES ('once:comm_base_1', '1') ON CONFLICT (k) DO NOTHING RETURNING k").catch(() => null);
  if (!claim) return null;
  try {
    const chans = (await all(db, `SELECT DISTINCT o.channel FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.ordered_at >= ? AND i.commission IS NOT NULL`, now - BASE_DAYS * D)).map((r) => r.channel);
    let n = 0;
    for (const c of chans) n += await refreshBaseRates(db, c, null, now);
    return n;
  } catch (e) {
    await db.prepare("DELETE FROM settings WHERE k = 'once:comm_base_1'").run().catch(() => {});
    throw e;
  }
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Satırın gerçek oranı ve normal oranı: max(olağan oran, liste oranı); indirim ≥ 1 puan ise kazanç
export function lineDiscount({ commission, total, quantity, returned_qty }, usual, list) {
  if (commission == null || !(total > 0)) return null;
  const rate = (commission / total) * 100;
  const refs = [usual, list].filter((x) => x != null && Number.isFinite(x));
  if (!refs.length) return null;
  const normal = Math.max(...refs);
  if (normal - rate < DISCOUNT_MIN) return null;
  return { rate: r2(rate), normal: r2(normal), ref: normal === list && (usual == null || list > usual) ? 'list' : 'usual', saved: r2(((normal - rate) / 100) * total * keptShare({ quantity, returned_qty })) };
}
// İlanların olağan oranı: verilen aralıktaki canlı satırların oran ortancası (en az 3 satır), Map("kanal|ilan" → oran)
function usualRates(rows) {
  const by = new Map();
  for (const r of rows) { const k = r.channel + '|' + r.k; (by.get(k) || by.set(k, []).get(k)).push(r.r); }
  return new Map([...by].filter(([, a]) => a.length >= MIN_SAMPLES).map(([k, a]) => [k, median(a)]));
}
const LIVE_LINE = "COALESCE(i.status, '') NOT IN ('cancelled', 'returned')";

// Sipariş ayrıntısı: satır satır komisyon indirimi ve hakedişteki komisyon iadesi
export async function orderCommission(db, settings, o) {
  // Satır komisyonu bildiren her kanalda (idefix, Hepsiburada, Trendyol …): olağan orana göre; resmî liste yalnız Trendyol / Hepsiburada
  const out = { lines: [], saved: 0, credit: 0, counted: 0 };
  const items = (o.items || []).filter((i) => i.commission != null && i.total > 0 && i.status !== 'cancelled' && i.status !== 'returned' && keptShare(i) > 0);
  const keys = [...new Set(items.map((i) => i.remote_key).filter(Boolean))];
  const [hist, cats, cr] = await Promise.all([
    keys.length ? allIn(db, keys, (ph, part) => [`SELECT o.channel, i.remote_key AS k, i.commission * 100.0 / i.total AS r FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.channel = ? AND o.ordered_at >= ? AND o.ordered_at < ? AND o.id != ? AND i.remote_key IN (${ph}) AND i.commission IS NOT NULL AND i.total > 0 AND ${LIVE_LINE}`,
    [o.channel, o.ordered_at - 90 * D, o.ordered_at + D, o.id, ...part]]) : [],
    keys.length ? allIn(db, keys, (ph, part) => [`SELECT remote_id, mp_category FROM listings WHERE channel = ? AND remote_id IN (${ph})`, [o.channel, ...part]]) : [],
    commissionCredits(db, settings, { ids: [o.id] }).catch(() => new Map()),
  ]);
  const usual = usualRates(hist), cat = new Map(cats.map((r) => [r.remote_id, r.mp_category]));
  for (const i of items) {
    const lr = listRate(o.channel, cat.get(i.remote_key)), x = lineDiscount(i, usual.get(o.channel + '|' + i.remote_key), lr ? lr.rate : null);
    if (x) { out.lines.push({ line_id: i.line_id, name: i.product_name || i.name || i.sku || '', ...x }); out.saved += x.saved; }
  }
  out.saved = r2(out.saved);
  const c = cr.get(o.id);
  if (c) { out.credit = c.credit; out.counted = c.counted; }
  return out;
}

// Dönem özeti: komisyon indirimi (satırlar), komisyon iadesi (hakediş) ve resmî listeyle sağlama (ilanlar)
export async function commissionCheck(db, settings, { from, to, channel } = {}) {
  const now = Date.now();
  from = Number(from) || now - 30 * D; to = Number(to) || now + 1;
  if (channel && !mpOf(channel)) return { from, to, supported: false, discounts: null, credits: null, list: null };
  const cw = channel ? ' AND o.channel = ?' : " AND (o.channel LIKE 'trendyol%' OR o.channel LIKE 'hepsiburada%')", ca = channel ? [channel] : [];
  const lw = channel ? ' AND channel = ?' : " AND (channel LIKE 'trendyol%' OR channel LIKE 'hepsiburada%')";
  // Olağan oran için dönemden önceki 90 gün de okunur (tek sorgu: yalnız oranı bilinen satırlar)
  const [lines, listings, credits] = await Promise.all([
    all(db, `SELECT o.id, o.channel, o.order_number, o.ordered_at, o.status, i.remote_key AS k, i.name, i.commission, i.total, i.quantity, i.returned_qty
      FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.ordered_at >= ? AND o.ordered_at < ?${cw} AND i.commission IS NOT NULL AND i.total > 0 AND ${LIVE_LINE}`, from - 90 * D, to, ...ca),
    all(db, `SELECT channel, remote_id, name, commission, commission_src, mp_category, product_id FROM listings WHERE COALESCE(match, '') != 'gone'${lw}`, ...ca),
    commissionCredits(db, settings, { from, to, channel }).catch(() => new Map()),
  ]);
  const ls = listings.filter((l) => mpOf(l.channel));
  const lrate = new Map(ls.map((l) => [l.channel + '|' + l.remote_id, listRate(l.channel, l.mp_category)]));
  const usual = usualRates(lines.filter((r) => mpOf(r.channel)).map((r) => ({ channel: r.channel, k: r.k, r: (r.commission / r.total) * 100 })));
  // Komisyon indirimi: dönemdeki canlı siparişlerin satırları
  const disc = { orders: 0, lines: 0, amount: 0, channels: {}, top: [] }, seen = new Set();
  for (const r of lines) {
    if (r.ordered_at < from || !mpOf(r.channel) || r.status === 'cancelled' || r.status === 'returned' || keptShare(r) <= 0) continue;
    const key = r.channel + '|' + r.k, lr = lrate.get(key), x = lineDiscount(r, usual.get(key), lr ? lr.rate : null);
    if (!x) continue;
    disc.lines++; disc.amount += x.saved;
    if (!seen.has(r.id)) { seen.add(r.id); disc.orders++; }
    const c = disc.channels[r.channel] || (disc.channels[r.channel] = { orders: new Set(), amount: 0 });
    c.orders.add(r.id); c.amount += x.saved;
    disc.top.push({ id: r.id, channel: r.channel, order_number: r.order_number, ordered_at: r.ordered_at, name: r.name, ...x });
  }
  disc.amount = r2(disc.amount);
  disc.channels = Object.fromEntries(Object.entries(disc.channels).map(([k, v]) => [k, { orders: v.orders.size, amount: r2(v.amount) }]));
  disc.top = disc.top.sort((a, b) => b.saved - a.saved).slice(0, 30);
  // Komisyon iadesi / düzeltmesi (hakediş kayıtları)
  const cr = { orders: 0, amount: 0, raw: 0 };
  for (const x of credits.values()) { cr.raw += x.credit; if (x.counted) { cr.orders++; cr.amount += x.counted; } }
  cr.amount = r2(cr.amount); cr.raw = r2(cr.raw);
  // Resmî listeyle sağlama: kategori eşleşen ilanlar, listeden yüksek kanal oranları, listeden yazılan tahminler
  const list = { total: ls.length, withCategory: 0, matched: 0, fallback: 0, aboveCount: 0, above: [], sources: listInfo() };
  for (const l of ls) {
    if (String(l.mp_category || '').trim()) list.withCategory++;
    const x = lrate.get(l.channel + '|' + l.remote_id);
    if (!x) continue;
    list.matched++;
    if (l.commission_src === 'list') list.fallback++;
    if (l.commission_src === 'api' && l.commission != null && l.commission - x.rate > ABOVE_LIST) {
      list.aboveCount++;
      list.above.push({ channel: l.channel, remote_id: l.remote_id, product_id: l.product_id, name: l.name, category: l.mp_category, path: x.path, rate: r2(l.commission), list: x.rate, gap: r2(l.commission - x.rate) });
    }
  }
  list.above = list.above.sort((a, b) => b.gap - a.gap).slice(0, 30);
  return { from, to, supported: true, discounts: disc, credits: cr, list };
}
