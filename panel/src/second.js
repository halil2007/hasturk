// İkinci eşleşme: aynı ürünün AYNI kanaldaki ikinci (üçüncü …) ilanı. Bazı satıcılar aynı ürünü bir pazaryerinde iki kez listeler.
//  - Öneri: bağlı olmayan bir ilan, ürünün bu kanalda zaten bağlı ilanıyla / ürünün kendisiyle aynı barkodu ya da stok kodunu taşıyorsa,
//    ya da adı çok benziyor ve fiyatı yakınsa önerilir. Otomatik bağlanmaz; yalnız kullanıcı "Onayla" derse bağlanır.
//  - "Hayır, farklı ürün" (listing_twin_no) hatırlanır, o ilan + ürün bir daha önerilmez.
//  - Onaylanan / elle eklenen bağ listings.extra_link = 1 ile işaretlenir: onarım (repairDuplicates) ve otomatik eşleştirme bozmaz.
//  - Bağlandıktan sonra: ürün stoğu her iki ilana da gider (pushStocks, ilan başına stok kuralı geçerli), iki ilandan gelen sipariş
//    ürün stoğundan bir kez düşer (sipariş satırı başına), fiyat ilan başınadır.
import { all, first, run, allIn, log } from './db.js';
import { barcodes, normSku, skuEq, weakSku, nameSane, conflict, prep, score, fullName, relinkItems } from './match.js';
import { str, fail } from './util.js';

export const NAME_MIN = 75;            // ad benzerliği (0–100) en az bu kadar olmalı
const SKU_NAME_MIN = 40;               // yalnız stok kodu tutuyorsa adlar da biraz benzemeli (aynı kodu yanlışlıkla taşıyan farklı ürün)
const PRICE_RATIO = 1.3;               // ad benzerliğinde fiyatlar en çok %30 farklı olabilir
const MAX_SCAN = 5000;                 // en çok bu kadar bağlı olmayan ilan incelenir
const POOL = 300;
const RANK = { twin: 4, barcode: 4, sku: 3, name: 2 };
export const WHY = { twin: 'barkod / stok kodu / ad aynı', barcode: 'barkod aynı', sku: 'stok kodu aynı', name: 'ad çok benzer, fiyat yakın' };

const priceClose = (a, b) => !(a > 0 && b > 0) || Math.max(a, b) / Math.min(a, b) <= PRICE_RATIO;
const add = (m, k, v) => { if (!k) return; const s = m.get(k) || m.set(k, new Set()).get(k); s.add(v); };
// Barkod / stok kodu dizini (eşleştirmeyle aynı kurallar: barkod listesi, normalleştirme; stok kodunda ayraç konumu önemli)
const addCodes = (x, pid, bc, sku) => {
  for (const b of barcodes(bc)) if (b.length >= 6) add(x.bc, b, pid);
  const k = normSku(sku);
  if (k.length >= 3) { add(x.sku, k, pid); (x.skus.get(pid) || x.skus.set(pid, []).get(pid)).push(sku); }
};

// Öneriler: { items: [{ channel, remote_id, name, …, how, score, why, product: {…}, existing: [ilanlar] }], total }
export async function secondSuggestions(db, { channel, q, limit = 50, page = 1 } = {}) {
  const where = ['product_id IS NULL', 'ignored = 0'], args = [];
  if (channel) { where.push('channel = ?'); args.push(String(channel)); }
  const cands = await all(db, `SELECT channel, remote_id, remote_product_id, sku, barcode, name, variant_name, brand, image, price, remote_stock, match FROM listings
    WHERE ${where.join(' AND ')} ORDER BY channel, remote_id LIMIT ?`, ...args, MAX_SCAN);
  if (!cands.length) return { items: [], total: 0 };
  const chans = [...new Set(cands.map((c) => c.channel))];
  const [linked, rejects] = await Promise.all([
    allIn(db, chans, (ph, part) => [`SELECT l.channel, l.remote_id, l.product_id, l.sku, l.barcode, l.name, l.variant_name, l.price, l.image, l.extra_link,
        p.sku AS p_sku, p.barcode AS p_barcode, p.name AS p_name, p.variant_name AS p_variant, p.group_name AS p_group, p.brand AS p_brand, p.image AS p_image, p.stock AS p_stock
      FROM listings l JOIN products p ON p.id = l.product_id WHERE l.channel IN (${ph})`, part]),
    allIn(db, chans, (ph, part) => [`SELECT channel, remote_id, product_id FROM listing_twin_no WHERE channel IN (${ph})`, part]),
  ]);
  const no = new Set(rejects.map((r) => `${r.channel}|${r.remote_id}|${r.product_id}`));
  // Kanal başına dizin: barkod / stok kodu → ürünler; kelime → karşılaştırılacak kayıtlar (bağlı ilan adı ve ürün adı)
  const idx = new Map(), prods = new Map();
  for (const l of linked) {
    let x = idx.get(l.channel);
    if (!x) idx.set(l.channel, (x = { bc: new Map(), sku: new Map(), skus: new Map(), tok: new Map(), byPid: new Map(), seen: new Set() }));
    if (!prods.has(l.product_id)) prods.set(l.product_id, { id: l.product_id, sku: l.p_sku, barcode: l.p_barcode, name: l.p_name, variant_name: l.p_variant, group_name: l.p_group, brand: l.p_brand, image: l.p_image, stock: l.p_stock });
    (x.byPid.get(l.product_id) || x.byPid.set(l.product_id, []).get(l.product_id)).push(l);
    const ents = [{ pid: l.product_id, price: l.price, pr: prep({ name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode }) }];
    if (!x.seen.has(l.product_id)) {
      x.seen.add(l.product_id);
      const p = prods.get(l.product_id);
      addCodes(x, l.product_id, p.barcode, p.sku);
      ents.push({ pid: l.product_id, price: l.price, pr: prep({ name: fullName(p), variant: p.variant_name, sku: p.sku, barcode: p.barcode }) });
    }
    addCodes(x, l.product_id, l.barcode, l.sku);
    for (const e of ents) for (const w of e.pr.t) (x.tok.get(w) || x.tok.set(w, []).get(w)).push(e);
  }
  const qq = str(q).toLocaleLowerCase('tr');
  const items = [];
  for (const l of cands) {
    const x = idx.get(l.channel);
    if (!x) continue;
    if (qq && ![l.name, l.sku, l.barcode, l.remote_id].some((v) => String(v || '').toLocaleLowerCase('tr').includes(qq))) continue;
    const a = prep({ name: l.name, variant: l.variant_name, sku: l.sku, barcode: l.barcode });
    const hits = new Map(); // pid → { how, score }
    const put = (pid, how, sc) => {
      // Reddedilen öneri ve kullanıcının kaldırdığı bağ ("x:<ürün>") yeniden önerilmez
      if (!x.byPid.has(pid) || no.has(`${l.channel}|${l.remote_id}|${pid}`) || l.match === 'x:' + pid) return;
      const h = hits.get(pid);
      if (!h || RANK[how] > RANK[h.how] || (RANK[how] === RANK[h.how] && sc > h.score)) hits.set(pid, { how, score: sc });
    };
    // Ad benzerliği: ilanın en nadir kelimelerinden aday havuzu
    const sim = new Map(); // pid → { score, price }
    const lists = [...a.t].map((w) => x.tok.get(w) || []).filter((v) => v.length).sort((u, v) => u.length - v.length);
    const pool = new Set();
    for (const list of lists) { for (const e of list) pool.add(e); if (pool.size >= POOL) break; }
    for (const e of pool) {
      const s = score(a, e.pr).score, cur = sim.get(e.pid);
      if (!cur || s > cur.score) sim.set(e.pid, { score: s, price: e.price });
    }
    const simOf = (pid) => (sim.get(pid) || { score: 0 }).score;
    const tw = /^dup:\d+$/.test(l.match || '') ? Number(l.match.slice(4)) : 0;
    if (tw) put(tw, 'twin', Math.max(90, simOf(tw)));
    // Ölçü / paket / varyant / marka çelişkisi olan ürün önerilmez (aynı barkod kardeş varyanttan kopyalanmış olabilir)
    const vetoed = (pid) => !!conflict(l, prods.get(pid));
    for (const b of barcodes(l.barcode)) for (const pid of x.bc.get(b) || []) if (!vetoed(pid)) put(pid, 'barcode', Math.max(90, simOf(pid)));
    for (const pid of x.sku.get(normSku(l.sku)) || []) {
      if (!(x.skus.get(pid) || []).some((v) => skuEq(v, l.sku)) || (weakSku(l.sku) && !nameSane(l, prods.get(pid)))) continue;
      if (simOf(pid) >= SKU_NAME_MIN && !vetoed(pid)) put(pid, 'sku', Math.max(80, simOf(pid)));
    }
    for (const [pid, s] of sim) {
      if (s.score < NAME_MIN || vetoed(pid)) continue;
      // Fiyat: ürünün bu kanaldaki herhangi bir ilanına yakın olmalı
      if (!(x.byPid.get(pid) || []).some((e) => priceClose(Number(l.price) || 0, Number(e.price) || 0))) continue;
      put(pid, 'name', s.score);
    }
    if (!hits.size) continue;
    const [pid, h] = [...hits].sort(([, u], [, v]) => RANK[v.how] - RANK[u.how] || v.score - u.score)[0];
    items.push({ ...l, how: h.how, score: Math.min(100, h.score), why: WHY[h.how], product_id: pid });
  }
  items.sort((u, v) => RANK[v.how] - RANK[u.how] || v.score - u.score || u.channel.localeCompare(v.channel));
  const total = items.length, from = (Math.max(1, page) - 1) * limit;
  const out = items.slice(from, from + limit).map(({ match: _m, ...it }) => {
    const x = idx.get(it.channel), p = prods.get(it.product_id);
    return {
      ...it,
      product: { id: p.id, name: fullName(p), sku: p.sku, barcode: p.barcode, image: p.image, stock: p.stock },
      existing: (x.byPid.get(it.product_id) || []).map((e) => ({ remote_id: e.remote_id, name: e.name, sku: e.sku, barcode: e.barcode, price: e.price, image: e.image, extra_link: e.extra_link })),
    };
  });
  return { items: out, total };
}

// Elle bağlamak için ilan arama: kanalın ilanları (bu ürüne bağlı olanlar hariç); başka ürüne bağlıysa ürün adıyla döner
export async function searchListings(db, { product_id, channel, q, limit = 20 } = {}) {
  const pid = Number(product_id) || 0, chn = str(channel);
  if (!pid || !chn) fail(400, 'Ürün ve kanal seçin');
  const where = ['l.channel = ?', '(l.product_id IS NULL OR l.product_id != ?)'], args = [chn, pid];
  const s = str(q);
  if (s) { where.push('(l.name LIKE ? OR l.sku LIKE ? OR l.barcode LIKE ? OR l.remote_id = ?)'); args.push(`%${s}%`, `%${s}%`, `%${s}%`, s); }
  const rows = await all(db, `SELECT l.channel, l.remote_id, l.name, l.variant_name, l.sku, l.barcode, l.price, l.image, l.remote_stock, l.product_id, l.ignored, p.name AS product_name
    FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE ${where.join(' AND ')} ORDER BY l.product_id IS NOT NULL, l.name COLLATE NOCASE LIMIT ?`, ...args, Math.min(50, Number(limit) || 20));
  return { listings: rows };
}

// Siparişleri bu ilana bağlı satırların ürün bağı kalkar; düşülen stok (applyStock) geri eklenir ya da yeni ürüne geçer
async function detachOrders(db, channel, remoteId) {
  await run(db, 'UPDATE orders SET stock_dirty = 1 WHERE id IN (SELECT order_id FROM order_items WHERE remote_key = ? AND order_id LIKE ? AND product_id IS NOT NULL)', remoteId, channel + ':%');
  await run(db, 'UPDATE order_items SET product_id = NULL WHERE remote_key = ? AND order_id LIKE ?', remoteId, channel + ':%');
}

// İlanı ürüne bağla (önerinin onayı ya da elle). Ürünün bu kanalda başka ilanı varsa ikinci ilan olarak işaretlenir (extra_link = 1).
// Başka ürüne bağlı ilan taşınır (o ürünün düşülen stoğu geri eklenir). Sonuç: { linked, extra, count }
export async function linkExtra(db, b, user = {}) {
  const chn = str(b.channel), rid = str(b.remote_id), pid = Number(b.product_id) || 0;
  if (!chn || !rid || !pid) fail(400, 'İlan ve ürün seçin');
  const [l, p] = await Promise.all([
    first(db, 'SELECT channel, remote_id, name, product_id FROM listings WHERE channel = ? AND remote_id = ?', chn, rid),
    first(db, 'SELECT id, name FROM products WHERE id = ?', pid),
  ]);
  if (!l) fail(404, 'İlan bulunamadı');
  if (!p) fail(404, 'Ürün bulunamadı');
  const others = (await first(db, 'SELECT COUNT(*) AS n FROM listings WHERE channel = ? AND product_id = ? AND remote_id != ?', chn, pid, rid)).n;
  if (l.product_id === pid) return { linked: 0, extra: others > 0, count: others + 1 };
  if (l.product_id) await detachOrders(db, chn, rid);
  await db.batch([
    db.prepare('UPDATE listings SET product_id = ?, match = ?, extra_link = ?, ignored = 0, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ?')
      .bind(pid, others ? 'extra' : 'manual', others ? 1 : 0, chn, rid),
    db.prepare('DELETE FROM listing_twin_no WHERE channel = ? AND remote_id = ? AND product_id = ?').bind(chn, rid, pid),
  ]);
  await relinkItems(db);
  await log(db, chn, 'info', `${user.name || 'Panel'}: ${l.name || rid} ilanı "${p.name}" ürününe ${others ? `${others + 1}. ilan olarak ` : ''}bağlandı`);
  return { linked: 1, extra: others > 0, count: others + 1 };
}

// "Hayır, farklı ürün": bu ilan + ürün bir daha önerilmez. Ürün "tekrar olabilir" (dup:<ürün>) diye işaretliyse o işaret de kalkar.
export async function rejectExtra(db, b, user = {}) {
  const chn = str(b.channel), rid = str(b.remote_id), pid = Number(b.product_id) || 0;
  if (!chn || !rid || !pid) fail(400, 'İlan ve ürün seçin');
  await db.batch([
    db.prepare('INSERT INTO listing_twin_no (channel, remote_id, product_id, at, user) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(chn, rid, pid, Date.now(), user.name || null),
    db.prepare("UPDATE listings SET match = 'dup_no' WHERE channel = ? AND remote_id = ? AND product_id IS NULL AND (match IS NULL OR match = ?)").bind(chn, rid, 'dup:' + pid),
  ]);
  return { ok: true };
}

// Bağı kaldır (Eşleştirme → Kaldır ve ürün formu): kaldırılan eşleşme hatırlanır ("x:<ürün>"), otomatik eşleştirme aynı ürüne yeniden bağlamaz
export async function unlinkListing(db, b, user = {}) {
  const chn = str(b.channel), rid = str(b.remote_id);
  const l = await first(db, 'SELECT product_id, name FROM listings WHERE channel = ? AND remote_id = ?', chn, rid);
  if (!l) fail(404, 'İlan bulunamadı');
  await run(db, 'UPDATE listings SET product_id = NULL, extra_link = 0, match = ? WHERE channel = ? AND remote_id = ?', l.product_id ? 'x:' + l.product_id : null, chn, rid);
  await detachOrders(db, chn, rid);
  await log(db, chn, 'info', `${user.name || 'Panel'}: ${l.name || rid} eşleşmesi kaldırıldı`);
  return { ok: true, product_id: l.product_id };
}
