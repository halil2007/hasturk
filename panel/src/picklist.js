// Toplama listesi: kargoya çıkacak (yeni / hazırlanıyor) siparişlerdeki ürünlerin toplu listesi — depoda tek turda toplanır.
// Paketi olmayan siparişte tüm satırlar (iptaller hariç), paketlenmiş siparişte yalnız açık (gönderilmemiş) paketlerdeki adetler sayılır.
import { all } from './db.js';
import { chunk, str, DEAD_LINE } from './util.js';

const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const inList = (n) => Array(n).fill('?').join(',');

// day: 'today' = bugün (Türkiye saatiyle) gelenler, 'old' = önceki günlerden kalanlar, boş = hepsi
export const trDayStart = (t = Date.now()) => { const d = new Date(t + 3 * 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() - 3 * 3600e3; };
export async function pickList(db, { channel, ids, day, now = Date.now() } = {}) {
  const where = ["o.status IN ('new', 'processing')"], args = [];
  if (channel) { where.push('o.channel = ?'); args.push(channel); }
  if (day === 'today' || day === 'old') { where.push(`o.ordered_at ${day === 'today' ? '>=' : '<'} ?`); args.push(trDayStart(now)); }
  const idList = (Array.isArray(ids) ? ids : str(ids).split(',')).map(str).filter(Boolean).slice(0, 2000);
  if (idList.length) { where.push(`o.id IN (${inList(idList.length)})`); args.push(...idList); }
  const orders = await all(db, `SELECT o.id, o.channel, o.order_number, o.customer, o.ordered_at FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.ordered_at ASC LIMIT 2000`, ...args);
  if (!orders.length) return { orders: 0, totalQty: 0, items: [], list: [], channels: {} };
  const oids = orders.map((o) => o.id), pkgs = new Map(), lines = [];
  for (const part of chunk(oids, 400)) {
    for (const p of await all(db, `SELECT order_id, status, items FROM packages WHERE order_id IN (${inList(part.length)})`, ...part)) (pkgs.get(p.order_id) || pkgs.set(p.order_id, []).get(p.order_id)).push(p);
    lines.push(...await all(db, `SELECT order_id, line_id, product_id, sku, barcode, name, image, quantity, status FROM order_items WHERE order_id IN (${inList(part.length)})`, ...part));
  }
  const byOrder = new Map();
  for (const l of lines) (byOrder.get(l.order_id) || byOrder.set(l.order_id, []).get(l.order_id)).push(l);

  const groups = new Map(), list = [], channels = {};
  let used = 0;
  for (const o of orders) {
    const ls = byOrder.get(o.id) || [], ps = pkgs.get(o.id);
    let need;
    if (!ps || !ps.length) need = ls.filter((l) => !DEAD_LINE(l.status)).map((l) => [l, l.quantity]);
    else {
      const open = new Map();
      for (const p of ps) if (p.status === 'open') for (const x of parse(p.items, [])) open.set(String(x.line_id), (open.get(String(x.line_id)) || 0) + Number(x.qty || 0));
      need = ls.filter((l) => open.has(String(l.line_id))).map((l) => [l, open.get(String(l.line_id))]);
    }
    need = need.filter(([, q]) => q > 0);
    if (!need.length) continue;
    used++;
    channels[o.channel] = (channels[o.channel] || 0) + 1;
    list.push({ id: o.id, order_number: o.order_number, channel: o.channel, customer: o.customer, ordered_at: o.ordered_at, lines: need.map(([l, q]) => ({ product_id: l.product_id, name: l.name, sku: l.sku, image: l.image, qty: q })) });
    for (const [l, q] of need) {
      const k = l.product_id ? 'p' + l.product_id : 'k' + (str(l.sku) || str(l.barcode) || str(l.name)).toLowerCase();
      const g = groups.get(k) || groups.set(k, { key: k, product_id: l.product_id, name: l.name, sku: l.sku, barcode: l.barcode, image: l.image, qty: 0, orders: [], channels: {} }).get(k);
      g.qty += q;
      g.channels[o.channel] = (g.channels[o.channel] || 0) + q;
      g.orders.push({ id: o.id, order_number: o.order_number, channel: o.channel, customer: o.customer, ordered_at: o.ordered_at, qty: q });
    }
  }
  // Panel ürün bilgisi: ad / varyant / görsel / SKU / barkod / stok (sipariş satırındaki ad yerine)
  const pids = [...groups.values()].map((g) => g.product_id).filter(Boolean);
  const prods = new Map();
  for (const part of chunk(pids, 400)) for (const p of await all(db, `SELECT id, name, group_name, variant_name, sku, barcode, image, stock FROM products WHERE id IN (${inList(part.length)})`, ...part)) prods.set(p.id, p);
  const items = [...groups.values()].map((g) => {
    const p = prods.get(g.product_id);
    return p ? { ...g, name: p.variant_name && p.group_name ? p.group_name : p.name, variant: p.variant_name || '', sku: p.sku || g.sku, barcode: p.barcode || g.barcode, image: p.image || g.image, stock: p.stock } : { ...g, variant: '', stock: null };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr') || String(a.variant).localeCompare(String(b.variant), 'tr'));
  // Siparişe göre görünüm: satır adları panel ürün adıyla (varyant dahil)
  for (const o of list) for (const l of o.lines) { const p = prods.get(l.product_id); if (p) Object.assign(l, { name: p.variant_name && p.group_name ? p.group_name : p.name, variant: p.variant_name || '', image: p.image || l.image, sku: p.sku || l.sku }); }
  return { orders: used, totalQty: items.reduce((s, x) => s + x.qty, 0), items, list, channels, short: items.filter((x) => x.stock != null && x.stock < x.qty).length };
}
