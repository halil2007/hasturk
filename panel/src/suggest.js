// Fiyat önerileri: pazaryerinin buybox servisinden okunan rakip fiyatlarına göre (Trendyol, Hepsiburada) ilan bazında öneri.
//  - Kazan: birinci sıra rakipte → rakibin fiyatının 1 kuruş altı (ürün sayfasında öne çıkmak, kampanya / avantaj koşullarına girmek için)
//  - Kâr artır: birinci sıra bizde ve ikinci satıcı epey yukarıda → ikinci satıcının 1 kuruş altına kadar fiyat yükseltilebilir
// Her öneride önerilen fiyattaki birim kâr / kâr oranı (alış fiyatı + kanalın komisyon, kargo, hizmet bedeli, stopaj ayarları) ve
// fiyat kuralı sınırları (en düşük / en yüksek) gösterilir. Uygulanan öneri ilanın kanal fiyatı olur ve fiyat gönderimiyle kanala gider.
// Not: Trendyol "avantajlı ürün" etiket eşikleri ve Hepsiburada "avantajlı teklif" önerileri için pazaryerlerinin açık servisi yok;
// bu yüzden öneriler yalnız servisle okunabilen rakip (buybox) fiyatlarından üretilir.
import { all, getSettings, log } from './db.js';
import { profit, costOf, rateGross } from '../public/profit.js';
import { chunk, fail, r2 } from './util.js';

const STEP = 0.01, MAX_AGE = 3 * 864e5, RAISE_MIN = 0.02; // ikinci satıcı en az %2 yukarıdaysa yükseltme önerilir
export const KINDS = { win: 'Birinciliği al', raise: 'Kâr artır' };

// Tek ilan için öneri (yoksa null). r: ilan + buybox + kural + ürün satırı
export function suggestFor(r, settings) {
  const P = Number(r.price) || 0;
  if (!(P > 0) || !r.rank) return null;
  let kind, price, competitor;
  if (r.rank > 1 && r.buybox_price > 0) {
    kind = 'win'; competitor = r.buybox_price; price = r2(competitor - STEP);
    if (price >= P - 0.004) return null; // fiyatımız zaten rakibin altında: birincilik fiyat dışı nedenle (kargo süresi, puan) rakipte
  } else if (r.rank === 1 && r.multi && r.second_price > P * (1 + RAISE_MIN)) {
    kind = 'raise'; competitor = r.second_price; price = r2(competitor - STEP);
  } else return null;
  // Fiyat kuralı varsa sınırların dışına çıkılmaz
  let limited = '';
  if (r.min_price > 0 && price < r.min_price) { price = r2(r.min_price); limited = 'min'; }
  if (r.max_price > 0 && price > r.max_price) { price = r2(r.max_price); limited = 'max'; }
  if (Math.abs(price - P) < 0.01) return null;
  const ch = r.channel, cost = (k) => costOf(settings, k, ch);
  const calc = (sale) => {
    if (!(r.purchase_price > 0)) return null;
    const x = profit({ sale, purchase: r.purchase_price, commissionRate: rateGross(settings, r.commission) ?? cost('commission'), shipping: cost('shipping'), fee: cost('service_fee'),
      feeRate: cost('fee_rate'), withholdingRate: cost('withholding'), vatRate: r.vat ?? 20 });
    return { profit: r2(x.unitProfit), margin: r2(x.margin) };
  };
  const now = calc(P), next = calc(price);
  return {
    kind, channel: ch, remote_id: r.remote_id, name: r.product_name || r.name, variant: r.variant_name || '', image: r.image || '', barcode: r.barcode, sku: r.sku,
    stock: r.stock, sold30: r.sold30 || 0, price: P, suggested: price, diff: r2(price - P), competitor, rank: r.rank, limited, checked_at: r.checked_at,
    now, next, loss: !!(next && next.profit < 0), noCost: !(r.purchase_price > 0), pending: !!r.price_dirty, rule: !!r.rule_on,
  };
}

export async function listSuggestions(db, { channel, channels = [] } = {}) {
  const ids = channel ? [channel] : channels;
  if (!ids.length) return { items: [], counts: {}, checked: 0, kinds: KINDS };
  const since = Date.now() - 30 * 864e5;
  const [rows, settings] = await Promise.all([
    all(db, `SELECT l.channel, l.remote_id, l.name, l.barcode, l.sku, l.price, l.commission, l.price_dirty, COALESCE(NULLIF(l.image, ''), p.image) AS image,
        p.name AS product_name, p.variant_name, p.purchase_price, p.vat, p.stock, b.rank, b.buybox_price, b.second_price, b.multi, b.checked_at,
        r.enabled AS rule_on, r.min_price, r.max_price,
        (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id = l.product_id AND o.channel = l.channel AND o.ordered_at >= ${since}
          AND o.status NOT IN ('cancelled', 'returned') AND COALESCE(i.status, '') != 'cancelled') AS sold30
      FROM listings l JOIN buybox b ON b.channel = l.channel AND b.remote_id = l.remote_id
      LEFT JOIN price_rules r ON r.channel = l.channel AND r.remote_id = l.remote_id LEFT JOIN products p ON p.id = l.product_id
      WHERE l.channel IN (${ids.map(() => '?').join(',')}) AND b.rank IS NOT NULL AND b.checked_at >= ? AND l.price > 0`, ...ids, Date.now() - MAX_AGE),
    getSettings(db),
  ]);
  const items = rows.map((r) => suggestFor(r, settings)).filter(Boolean)
    // Çok satan ve stoğu olan ürünler önce; sonra fiyat farkı küçük olan (uygulaması kolay) öneriler
    .sort((a, b) => (b.stock > 0) - (a.stock > 0) || b.sold30 - a.sold30 || Math.abs(a.diff / a.price) - Math.abs(b.diff / b.price));
  const counts = { win: 0, raise: 0, loss: 0 };
  for (const x of items) { counts[x.kind]++; if (x.loss) counts.loss++; }
  return { items, counts, checked: rows.length, kinds: KINDS };
}

// Seçilen önerileri uygula: ilanın kanal fiyatı önerilen fiyat olur (gönderim kuyruğu). Zararına olanlar ve
// minMargin verildiyse kâr oranı bunun altına düşenler atlanır (alış fiyatı girilmemiş ilanda kâr kontrolü yapılamaz).
export async function applySuggestions(db, { items = [], minMargin = null, channels = [], user = 'Panel' }) {
  if (!Array.isArray(items) || !items.length) fail(400, 'Ürün seçin');
  const want = new Set(items.map((x) => `${x.channel}|${x.remote_id}`));
  const { items: all_ } = await listSuggestions(db, { channels: [...new Set(items.map((x) => String(x.channel)))].filter((c) => channels.includes(c)) });
  const st = [], done = [];
  let skipped = 0;
  for (const s of all_) {
    if (!want.has(`${s.channel}|${s.remote_id}`)) continue;
    if (s.loss || (minMargin != null && minMargin !== '' && s.next && s.next.margin < Number(minMargin))) { skipped++; continue; }
    st.push(db.prepare('UPDATE listings SET price = ?, list_price = CASE WHEN COALESCE(list_price, 0) < ? THEN ? ELSE list_price END, price_dirty = 1 WHERE channel = ? AND remote_id = ?')
      .bind(s.suggested, s.suggested, s.suggested, s.channel, s.remote_id));
    st.push(db.prepare('UPDATE buybox SET checked_at = 0 WHERE channel = ? AND remote_id = ?').bind(s.channel, s.remote_id)); // sonuç bir sonraki turda yeniden kontrol edilir
    done.push(s);
  }
  for (const part of chunk(st, 90)) await db.batch(part);
  for (const c of new Set(done.map((s) => s.channel))) {
    const n = done.filter((s) => s.channel === c).length;
    await log(db, c, 'info', `${user}: ${n} ilanda fiyat önerisi uygulandı (fiyat gönderimi sırada)`);
  }
  return { applied: done.length, skipped, missing: want.size - done.length - skipped };
}
