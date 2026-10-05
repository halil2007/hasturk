// Müşteriler: siparişlerden müşteri kimliği çıkarılır ve tüm kanallarda tek listede toplanır.
// Müşteri anahtarı (ckey), aynı kişiyi kanallar arasında da birleştirebilmek için sırayla:
//   1) cep telefonu (son 10 hane; maskeli numaralar kullanılmaz)  2) e-posta  3) kanalın müşteri kimliği
//   4) ad + il (kanal başına)  5) hiçbiri yoksa sipariş başına ayrı müşteri.
// Pazaryerleri iletişim bilgisini çoğu zaman gizlediği için aynı kişinin farklı kanallardaki siparişleri her zaman birleşmeyebilir.
import { all, first, run } from './db.js';
import { str } from './util.js';

const TR = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
const low = (s) => str(s).replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => TR[c]).toLowerCase().replace(/\s+/g, ' ').trim();
const parse = (v, d) => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || ''); } catch { return d; } };

export function customerKey({ channel, id, phone, email, customer, address, extra }) {
  const a = parse(address, {}), x = parse(extra, {});
  const ph = str(phone || a.phone);
  if (ph && !/[*x]/i.test(ph)) {
    const d = ph.replace(/\D/g, '').slice(-10);
    if (d.length === 10 && !/^(\d)\1+$/.test(d)) return 'p:' + d;
  }
  const em = low(email || a.email);
  if (/^[^@\s*]+@[^@\s*]+\.[a-z]{2,}$/.test(em)) return 'e:' + em;
  if (x.customerId) return `c:${channel}:${x.customerId}`;
  const name = low(customer || a.name);
  if (name && !/\*/.test(name)) return `n:${channel}:${name}|${low(a.city)}`;
  return 'o:' + id;
}

// Anahtarı olmayan (eski) siparişlere anahtar yaz: parça parça (her çağrıda en fazla `limit`)
export async function fillKeys(db, limit = 4000) {
  const rows = await all(db, 'SELECT id, channel, phone, email, customer, address, extra FROM orders WHERE ckey IS NULL LIMIT ?', limit);
  for (let i = 0; i < rows.length; i += 80) {
    await db.batch(rows.slice(i, i + 80).map((r) => db.prepare('UPDATE orders SET ckey = ? WHERE id = ?').bind(customerKey(r), r.id)));
  }
  return rows.length;
}

const LIVE = "o.status NOT IN ('cancelled')";
function range(q) {
  const where = [LIVE], args = [];
  if (q.from) { where.push('o.ordered_at >= ?'); args.push(Number(q.from)); }
  if (q.to) { where.push('o.ordered_at <= ?'); args.push(Number(q.to)); }
  return { where, args };
}

// Özet: müşteri / sipariş / tekrar oranı / ortalama sepet; kanal bazında; sipariş sayısı dağılımı; aylık yeni ve tekrar eden
export async function summary(db, q = {}) {
  await fillKeys(db);
  const { where, args } = range(q);
  const W = 'WHERE ' + where.join(' AND ');
  const per = await all(db, `SELECT o.ckey, COUNT(*) AS n, SUM(o.total) AS spend, MIN(o.ordered_at) AS first_at FROM orders o ${W} GROUP BY o.ckey`, ...args);
  const customers = per.length, orders = per.reduce((s, r) => s + r.n, 0), revenue = per.reduce((s, r) => s + (r.spend || 0), 0);
  const repeat = per.filter((r) => r.n > 1).length;
  const dist = [1, 2, 3, 4, 5].map((k) => ({ k: k === 5 ? '5+' : String(k), n: per.filter((r) => (k === 5 ? r.n >= 5 : r.n === k)).length }));
  // Kanal bazında: bir müşteri birden çok kanalda alışveriş yaptıysa her kanalda sayılır
  const byCh = await all(db, `SELECT o.channel, COUNT(DISTINCT o.ckey) AS customers, COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o ${W} GROUP BY o.channel ORDER BY orders DESC`, ...args);
  const rep = await all(db, `SELECT channel, COUNT(*) AS repeat FROM (SELECT o.channel, o.ckey FROM orders o ${W} GROUP BY o.channel, o.ckey HAVING COUNT(*) > 1) GROUP BY channel`, ...args);
  const guests = await all(db, `SELECT o.channel, COUNT(DISTINCT o.ckey) AS n FROM orders o ${W} AND o.extra LIKE '%"guest":true%' GROUP BY o.channel`, ...args);
  const multi = (await first(db, `SELECT COUNT(*) AS n FROM (SELECT o.ckey FROM orders o ${W} GROUP BY o.ckey HAVING COUNT(DISTINCT o.channel) > 1)`, ...args)).n;
  // Aylık: o ay ilk siparişini veren (yeni) ve daha önce sipariş vermiş (tekrar eden) müşteri sayısı (son 12 ay)
  const since = Date.now() - 365 * 864e5;
  const firsts = new Map(per.map((r) => [r.ckey, r.first_at]));
  const monthly = await all(db, `SELECT o.ckey, strftime('%Y-%m', o.ordered_at / 1000 + 10800, 'unixepoch') AS m FROM orders o WHERE ${LIVE} AND o.ordered_at >= ? GROUP BY o.ckey, m`, since);
  const months = new Map();
  for (const r of monthly) {
    const e = months.get(r.m) || { m: r.m, new: 0, returning: 0 };
    const f = firsts.get(r.ckey);
    const fm = f ? new Date(f + 10800e3).toISOString().slice(0, 7) : r.m;
    if (fm === r.m) e.new++; else e.returning++;
    months.set(r.m, e);
  }
  // İller (harita ve liste): müşteri, sipariş, satılan adet ve ciro; tüm iller
  const cities = await all(db, `SELECT json_extract(o.address, '$.city') AS city, COUNT(DISTINCT o.ckey) AS customers, COUNT(*) AS orders, SUM(o.total) AS revenue,
      SUM((SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled')) AS units
    FROM orders o ${W} AND COALESCE(json_extract(o.address, '$.city'), '') != '' GROUP BY 1 ORDER BY orders DESC LIMIT 200`, ...args);
  return {
    customers, orders, revenue, repeat, multi,
    repeatRate: customers ? (repeat / customers) * 100 : 0,
    avgBasket: orders ? revenue / orders : 0,
    ordersPerCustomer: customers ? orders / customers : 0,
    revenuePerCustomer: customers ? revenue / customers : 0,
    repeatOrderShare: orders ? (per.filter((r) => r.n > 1).reduce((s, r) => s + r.n, 0) / orders) * 100 : 0,
    dist, cities,
    channels: byCh.map((c) => ({ ...c, repeat: (rep.find((x) => x.channel === c.channel) || {}).repeat || 0, guests: (guests.find((x) => x.channel === c.channel) || {}).n || 0, avgBasket: c.orders ? c.revenue / c.orders : 0 })),
    months: [...months.values()].sort((a, b) => a.m.localeCompare(b.m)),
  };
}

// Müşteri listesi: arama, kanal, yalnız tekrar edenler, sıralama, sayfalama
export async function list(db, q = {}) {
  await fillKeys(db);
  const { where, args } = range(q);
  if (q.channel) { where.push('o.channel = ?'); args.push(q.channel); }
  if (q.q) { const s = '%' + q.q.trim() + '%'; where.push('(o.customer LIKE ? OR o.phone LIKE ? OR o.email LIKE ? OR o.order_number LIKE ?)'); args.push(s, s, s, s); }
  const having = q.repeat === '1' ? 'HAVING COUNT(*) > 1' : '';
  const sort = { spend: 'spend DESC', orders: 'orders DESC, spend DESC', last: 'last_at DESC', first: 'first_at DESC' }[q.sort] || 'last_at DESC';
  const W = 'WHERE ' + where.join(' AND ');
  const limit = Math.min(Number(q.limit) || 50, 200), page = Math.max(1, Number(q.page) || 1);
  const total = (await first(db, `SELECT COUNT(*) AS n FROM (SELECT o.ckey FROM orders o ${W} GROUP BY o.ckey ${having})`, ...args)).n;
  const rows = await all(db, `SELECT o.ckey, COUNT(*) AS orders, SUM(o.total) AS spend, MIN(o.ordered_at) AS first_at, MAX(o.ordered_at) AS last_at,
      GROUP_CONCAT(DISTINCT o.channel) AS channels,
      (SELECT x.customer FROM orders x WHERE x.ckey = o.ckey ORDER BY x.ordered_at DESC LIMIT 1) AS name,
      (SELECT x.phone FROM orders x WHERE x.ckey = o.ckey AND COALESCE(x.phone, '') != '' ORDER BY x.ordered_at DESC LIMIT 1) AS phone,
      (SELECT x.email FROM orders x WHERE x.ckey = o.ckey AND COALESCE(x.email, '') != '' ORDER BY x.ordered_at DESC LIMIT 1) AS email,
      (SELECT json_extract(x.address, '$.city') FROM orders x WHERE x.ckey = o.ckey ORDER BY x.ordered_at DESC LIMIT 1) AS city
    FROM orders o ${W} GROUP BY o.ckey ${having} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  return { total, customers: rows.map((r) => ({ ...r, channels: str(r.channels).split(',').filter(Boolean), avg: r.orders ? r.spend / r.orders : 0 })) };
}

// Tek müşteri: tüm siparişleri ve aldığı ürünler
export async function detail(db, key) {
  const orders = await all(db, `SELECT id, channel, order_number, status, ordered_at, total, customer, phone, email, address FROM orders WHERE ckey = ? ORDER BY ordered_at DESC LIMIT 200`, key);
  const items = await all(db, `SELECT COALESCE(p.name, i.name) AS name, SUM(i.quantity) AS qty, SUM(i.total) AS total FROM order_items i JOIN orders o ON o.id = i.order_id
    LEFT JOIN products p ON p.id = i.product_id WHERE o.ckey = ? AND i.status != 'cancelled' AND o.status != 'cancelled' GROUP BY 1 ORDER BY qty DESC LIMIT 20`, key);
  return { key, orders: orders.map((o) => ({ ...o, address: parse(o.address, {}) })), items };
}

export const resetKeys = (db) => run(db, 'UPDATE orders SET ckey = NULL');
