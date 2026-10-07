// Buybox takibi ve otomatik fiyatlandırma (yalnızca Trendyol ve Hepsiburada).
//  - Takip: ilanların buybox sırası, buybox fiyatı ve rakip (2./3.) fiyatları her senkronda parça parça kontrol edilir.
//  - Otomatik fiyat: SADECE kullanıcının kural tanımlayıp açtığı ilanlarda ve Ayarlar'daki genel anahtar açıkken çalışır.
//    Güvenlik: rakip verisi yoksa veya 20 dakikadan eskiyse değişiklik yapılmaz; kendi fiyatımız rakip sayılmaz (buybox
//    bizdeyse rakip = 2. satıcı); buybox bizdeyken fiyat yalnızca hedefe doğru yükseltilir; fiyat asla min/max dışına çıkmaz;
//    bir ilan 14 dakikada en fazla bir kez değişir; her değişiklik eski/yeni fiyat, zaman ve nedeniyle kaydedilir ve
//    ardından gerçek buybox durumu yeniden kontrol edilir.
import { all, first, run, log, notify, resolve } from './db.js';
import { getChannels } from './channels/index.js';
import { r2 } from './util.js';
import { trackPush } from './sync.js';

export const BUYBOX_CHANNELS = ['trendyol', 'hepsiburada'];
const FRESH = 20 * 60e3, COOLDOWN = 14 * 60e3;

// Kurala göre yeni fiyat kararı. b: { rank, buyboxPrice, second, multi }, P: mevcut fiyatımız
export function decide(rule, b, P) {
  if (!rule || !rule.enabled) return { skip: 'otomatik fiyat kapalı' };
  const min = Number(rule.min_price), max = Number(rule.max_price), step = Math.max(0, Number(rule.step) || 0);
  const target = Number(rule.target_price) || max;
  if (!(min > 0) || !(max >= min)) return { skip: 'kural eksik: en düşük ve en yüksek fiyat girilmeli' };
  if (!b || !b.rank) return { skip: 'buybox verisi alınamadı' };
  if (!(P > 0)) return { skip: 'mevcut fiyat bilinmiyor' };
  // Mevcut fiyat sınır dışındaysa (ör. kur ya da elle değişiklik sonrası) önce sınıra çekilir
  if (P < min - 0.004) return { price: r2(min), reason: `Fiyat en düşük sınırın (${r2(min)} TL) altındaydı; sınıra çekildi`, competitor: b.buyboxPrice || null };
  if (P > max + 0.004) return { price: r2(max), reason: `Fiyat en yüksek sınırın (${r2(max)} TL) üstündeydi; sınıra çekildi`, competitor: b.buyboxPrice || null };
  let desired, competitor = null, reason;
  if (b.rank === 1) {
    // Buybox bizde: fiyat sadece yükseltilir (hedefe kadar ya da ikinci satıcının biraz altına)
    competitor = b.multi && b.second ? b.second : null;
    desired = competitor ? Math.min(target, competitor - step) : target;
    reason = competitor ? `Buybox bizde; 2. satıcı ${r2(competitor)} TL → ${step} TL altı (en fazla hedef fiyat)` : 'Buybox bizde, rakip yok → hedef fiyata dönüş';
    if (desired <= P + 0.004) return { skip: 'Buybox bizde, değişiklik gerekmiyor' };
  } else {
    competitor = b.buyboxPrice;
    if (!competitor) return { skip: 'rakip fiyatı alınamadı' };
    desired = competitor - step;
    reason = `Buybox rakipte (${r2(competitor)} TL) → ${step} TL altı`;
    if (desired < min) { desired = min; reason += '; en düşük fiyat sınırında'; }
    if (desired >= P - 0.004) return { skip: 'Fiyatımız zaten rakibin altında / sınırda; fiyat dışı nedenle kaybedilmiş olabilir' };
  }
  const price = r2(Math.min(max, Math.max(min, desired)));
  if (Math.abs(price - P) < 0.01) return { skip: 'fiyat aynı' };
  return { price, reason, competitor };
}

// Buybox durumunu kontrol et: önce kurallı ilanlar, sonra en uzun süredir bakılmayanlar
export async function checkBuybox(env, db, { channel, ids, limit = 100 } = {}) {
  const chans = (await getChannels(env, db)).filter((c) => BUYBOX_CHANNELS.includes(c.type) && c.enabled && c.buybox && (!channel || c.id === channel));
  const out = {};
  for (const ch of chans) {
    const rows = ids && ids.length
      ? await all(db, `SELECT l.remote_id, l.price, b.rank, b.checked_at FROM listings l LEFT JOIN buybox b ON b.channel = l.channel AND b.remote_id = l.remote_id WHERE l.channel = ? AND l.remote_id IN (${ids.map(() => '?').join(',')})`, ch.id, ...ids.map(String))
      : await all(db, `SELECT l.remote_id, l.price, b.rank, b.checked_at FROM listings l
          LEFT JOIN buybox b ON b.channel = l.channel AND b.remote_id = l.remote_id LEFT JOIN price_rules r ON r.channel = l.channel AND r.remote_id = l.remote_id
          WHERE l.channel = ? AND l.remote_id != '' ORDER BY COALESCE(r.enabled, 0) DESC, COALESCE(b.checked_at, 0) ASC LIMIT ?`, ch.id, limit);
    if (!rows.length) continue;
    let res;
    try { res = await ch.buybox(rows.map((r) => r.remote_id)); } catch (e) {
      out[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'warn', 'Buybox bilgisi alınamadı: ' + e.message);
      continue;
    }
    const t = Date.now(), byId = new Map(res.map((x) => [x.remoteId, x]));
    for (const r of rows) {
      const b = byId.get(r.remote_id);
      if (!b) { await run(db, `INSERT INTO buybox (channel, remote_id, checked_at, error) VALUES (?, ?, ?, 'veri yok') ON CONFLICT (channel, remote_id) DO UPDATE SET checked_at = excluded.checked_at, error = excluded.error`, ch.id, r.remote_id, t); continue; }
      const prev = r.rank;
      await run(db, `INSERT INTO buybox (channel, remote_id, rank, buybox_price, second_price, third_price, multi, our_price, prev_rank, checked_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT (channel, remote_id) DO UPDATE SET rank = excluded.rank, buybox_price = excluded.buybox_price, second_price = excluded.second_price, third_price = excluded.third_price,
          multi = excluded.multi, our_price = excluded.our_price, prev_rank = buybox.rank, checked_at = excluded.checked_at, error = NULL`,
      ch.id, r.remote_id, b.rank, b.buyboxPrice, b.second, b.third, b.multi ? 1 : 0, r.price, prev ?? null, t);
      // Olay: kazanıldı / kaybedildi (ilk kontrolde durum yazılır)
      const event = prev == null ? (b.rank === 1 ? 'sizde' : 'rakipte') : prev !== 1 && b.rank === 1 ? 'kazanildi' : prev === 1 && b.rank !== 1 ? 'kaybedildi' : prev !== b.rank ? 'sira' : null;
      const last = await first(db, 'SELECT buybox_price, our_price FROM buybox_history WHERE channel = ? AND remote_id = ? ORDER BY at DESC LIMIT 1', ch.id, r.remote_id);
      if (event || !last || last.buybox_price !== b.buyboxPrice || last.our_price !== r.price) {
        await run(db, 'INSERT INTO buybox_history (channel, remote_id, at, rank, our_price, buybox_price, second_price, event) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', ch.id, r.remote_id, t, b.rank, r.price, b.buyboxPrice, b.second, event);
      }
      // Fiyat değişikliğinden sonraki gerçek sıra
      await run(db, 'UPDATE price_changes SET rank_after = ? WHERE id = (SELECT id FROM price_changes WHERE channel = ? AND remote_id = ? AND ok = 1 AND rank_after IS NULL ORDER BY at DESC LIMIT 1)', b.rank, ch.id, r.remote_id);
      // Kurallı ilanda buybox kaybı bildirimi (geri kazanılınca kapanır)
      const rule = await first(db, 'SELECT enabled FROM price_rules WHERE channel = ? AND remote_id = ?', ch.id, r.remote_id);
      if (rule && event === 'kaybedildi') await notify(db, `buybox:${ch.id}:${r.remote_id}`, { level: 'warn', channel: ch.id, title: `${ch.name}: birinci sırayı kaybettiniz`, msg: `${r.remote_id} · buybox fiyatı ${b.buyboxPrice} TL, bizim fiyatımız ${r.price} TL` });
      if (b.rank === 1) await resolve(db, `buybox:${ch.id}:${r.remote_id}`);
    }
    out[ch.id] = res.length;
  }
  return out;
}

// Otomatik fiyat: açık kurallar, taze buybox verisiyle
export async function autoPrice(env, db, settings, { only } = {}) {
  if (!settings.autoprice) return { skipped: 'Otomatik fiyatlandırma kapalı' };
  const t = Date.now(), out = { changed: 0, skipped: 0, errors: 0 };
  const rows = await all(db, `SELECT r.*, l.price, l.list_price, l.remote_product_id, l.sku, l.barcode, b.rank, b.buybox_price, b.second_price, b.third_price, b.multi, b.checked_at,
      (SELECT MAX(at) FROM price_changes c WHERE c.channel = r.channel AND c.remote_id = r.remote_id AND c.ok = 1) AS last_change
    FROM price_rules r JOIN listings l ON l.channel = r.channel AND l.remote_id = r.remote_id LEFT JOIN buybox b ON b.channel = r.channel AND b.remote_id = r.remote_id
    WHERE r.enabled = 1 ${only ? 'AND r.channel = ? AND r.remote_id = ?' : ''}`, ...(only ? [only.channel, String(only.remote_id)] : []));
  const chans = await getChannels(env, db);
  for (const r of rows) {
    const ch = chans.find((c) => c.id === r.channel);
    if (!ch || !ch.enabled || ch.demo || !ch.pushPrice) { out.skipped++; continue; }
    if (!r.checked_at || t - r.checked_at > FRESH) { out.skipped++; continue; } // güncelliği doğrulanamayan veriyle değişiklik yok
    if (r.last_change && t - r.last_change < COOLDOWN) { out.skipped++; continue; }
    const d = decide(r, { rank: r.rank, buyboxPrice: r.buybox_price, second: r.second_price, multi: !!r.multi }, r.price);
    if (d.skip) { out.skipped++; continue; }
    try {
      await trackPush(db, ch, 'price', await ch.pushPrice([{ remoteId: r.remote_id, remoteProductId: r.remote_product_id, sku: r.sku, barcode: r.barcode, price: d.price, listPrice: Math.max(r.list_price || 0, d.price) }]), 1);
      await run(db, 'UPDATE listings SET price = ?, price_dirty = 0 WHERE channel = ? AND remote_id = ?', d.price, r.channel, r.remote_id);
      await run(db, 'INSERT INTO price_changes (channel, remote_id, at, old_price, new_price, competitor_price, reason, rank_before, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)', r.channel, r.remote_id, t, r.price, d.price, d.competitor, d.reason, r.rank);
      // Değişiklikten sonra gerçek durum bir sonraki turda öncelikle yeniden kontrol edilir
      await run(db, 'UPDATE buybox SET checked_at = 0, our_price = ? WHERE channel = ? AND remote_id = ?', d.price, r.channel, r.remote_id);
      await log(db, r.channel, 'info', `Otomatik fiyat: ${r.remote_id} ${r.price} → ${d.price} TL (${d.reason})`);
      out.changed++;
    } catch (e) {
      await run(db, 'INSERT INTO price_changes (channel, remote_id, at, old_price, new_price, competitor_price, reason, rank_before, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)', r.channel, r.remote_id, t, r.price, d.price, d.competitor, d.reason, r.rank, e.message.slice(0, 300));
      await notify(db, `autoprice:${r.channel}`, { channel: r.channel, title: `${ch.name}: otomatik fiyat gönderilemedi`, msg: e.message });
      out.errors++;
    }
  }
  return out;
}

// Senkron adımı: buybox kontrolü (+ değişen fiyatların yeniden kontrolü) ve otomatik fiyat
export async function runBuybox(env, db, settings) {
  const checked = await checkBuybox(env, db, { limit: 60 });
  const priced = await autoPrice(env, db, settings);
  return { checked, priced };
}
