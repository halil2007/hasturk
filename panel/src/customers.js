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

// Özet: müşteri / sipariş / tekrar oranı / ortalama sepet; kanal bazında; sipariş sayısı dağılımı; aylık yeni ve tekrar eden.
// Hız: toplamlar veritabanında yapılır, panele yalnız birkaç satır döner (müşteri başına satır taşınmaz); D1 sorguları sırayla
// işlediği için aynı taramayı paylaşan hesaplar tek sorguda birleştirilmiştir.
// Özet önbelleği (çalışan örnek başına): siparişler değişmediyse (sayı, son güncelleme, toplam tutar) aynı dönem yeniden hesaplanmaz.
// Büyük katalogda özet birkaç ağır toplama sorgusudur (~0,6 sn); sayfa her açıldığında tekrar çalışmasın.
const memo = new WeakMap(), MEMO_MS = 15 * 60e3;
export async function summary(db, q = {}) {
  await fillKeys(db);
  const sig = JSON.stringify(await first(db, 'SELECT COUNT(*) AS n, MAX(updated_at) AS u, TOTAL(total) AS t FROM orders'));
  const key = JSON.stringify([q.from || '', q.to || '', q.channel || '']), m = memo.get(db) || memo.set(db, new Map()).get(db), hit = m.get(key);
  if (hit && hit.sig === sig && Date.now() - hit.at < MEMO_MS) return hit.val;
  const val = await summaryNow(db, q);
  if (m.size > 20) m.clear();
  m.set(key, { sig, at: Date.now(), val });
  return val;
}
async function summaryNow(db, q) {
  const { where, args } = range(q);
  const W = 'WHERE ' + where.join(' AND ');
  const since = Date.now() - 365 * 864e5;
  const M = (col) => `strftime('%Y-%m', ${col} / 1000 + 10800, 'unixepoch')`;
  const [tot, chans, monthly, cities] = await Promise.all([
    // Müşteri başına (dönem içi): sipariş sayısı, harcama, kaç kanalda alışveriş → genel toplamlar ve dağılım
    first(db, `SELECT COUNT(*) AS customers, COALESCE(SUM(n), 0) AS orders, COALESCE(SUM(spend), 0) AS revenue, COALESCE(SUM(n > 1), 0) AS repeat,
        COALESCE(SUM(CASE WHEN n > 1 THEN n ELSE 0 END), 0) AS repeatOrders, COALESCE(SUM(ch > 1), 0) AS multi,
        COALESCE(SUM(n = 1), 0) AS d1, COALESCE(SUM(n = 2), 0) AS d2, COALESCE(SUM(n = 3), 0) AS d3, COALESCE(SUM(n = 4), 0) AS d4, COALESCE(SUM(n >= 5), 0) AS d5
      FROM (SELECT o.ckey, COUNT(*) AS n, SUM(o.total) AS spend, COUNT(DISTINCT o.channel) AS ch FROM orders o ${W} GROUP BY o.ckey)`, ...args),
    // Kanal bazında: bir müşteri birden çok kanalda alışveriş yaptıysa her kanalda sayılır; tekrar eden ve misafir müşteri
    all(db, `SELECT channel, COUNT(*) AS customers, SUM(n) AS orders, SUM(spend) AS revenue, SUM(n > 1) AS repeat, SUM(g) AS guests
      FROM (SELECT o.channel, o.ckey, COUNT(*) AS n, SUM(o.total) AS spend, MAX(o.extra LIKE '%"guest":true%') AS g FROM orders o ${W} GROUP BY o.channel, o.ckey)
      GROUP BY channel ORDER BY orders DESC, channel`, ...args),
    // Aylık (son 12 ay): o ay ilk siparişini veren (yeni) ve daha önce sipariş vermiş (tekrar eden) müşteri sayısı.
    // İlk sipariş tarihi dönem filtresinden bağımsız: bir müşteri ancak ilk siparişini verdiği ay "yeni" sayılır
    all(db, `WITH m AS (SELECT DISTINCT o.ckey, ${M('o.ordered_at')} AS m FROM orders o WHERE ${LIVE} AND o.ordered_at >= ?),
        f AS (SELECT o.ckey, MIN(o.ordered_at) AS fa FROM orders o WHERE ${LIVE} AND o.ckey IN (SELECT ckey FROM m) GROUP BY o.ckey)
      SELECT m.m, SUM(${M('f.fa')} = m.m) AS new, SUM(${M('f.fa')} != m.m) AS ret FROM m JOIN f ON f.ckey = m.ckey GROUP BY m.m ORDER BY m.m`, since),
    // İller (harita ve liste): müşteri, sipariş, satılan adet ve ciro; tüm iller
    all(db, `SELECT x.city, COUNT(DISTINCT x.ckey) AS customers, COUNT(*) AS orders, SUM(x.total) AS revenue, COALESCE(SUM(u.units), 0) AS units
      FROM (SELECT o.id, o.ckey, o.total, json_extract(o.address, '$.city') AS city FROM orders o ${W}) x
      LEFT JOIN (SELECT order_id, SUM(quantity) AS units FROM order_items WHERE COALESCE(status, '') NOT IN ('cancelled', 'returned') GROUP BY order_id) u ON u.order_id = x.id
      WHERE COALESCE(x.city, '') != '' GROUP BY x.city ORDER BY orders DESC LIMIT 200`, ...args),
  ]);
  const { customers, orders, revenue, repeat, multi } = tot;
  const dist = [tot.d1, tot.d2, tot.d3, tot.d4, tot.d5].map((n, i) => ({ k: i === 4 ? '5+' : String(i + 1), n }));
  return {
    customers, orders, revenue, repeat, multi,
    repeatRate: customers ? (repeat / customers) * 100 : 0,
    avgBasket: orders ? revenue / orders : 0,
    ordersPerCustomer: customers ? orders / customers : 0,
    revenuePerCustomer: customers ? revenue / customers : 0,
    repeatOrderShare: orders ? (tot.repeatOrders / orders) * 100 : 0,
    dist, cities,
    channels: chans.map((c) => ({ channel: c.channel, customers: c.customers, orders: c.orders, revenue: c.revenue, repeat: c.repeat || 0, guests: c.guests || 0, avgBasket: c.orders ? c.revenue / c.orders : 0 })),
    months: monthly.map((r) => ({ m: r.m, new: r.new, returning: r.ret })),
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
    LEFT JOIN products p ON p.id = i.product_id WHERE o.ckey = ? AND i.status NOT IN ('cancelled', 'returned') AND o.status != 'cancelled' GROUP BY 1 ORDER BY qty DESC LIMIT 20`, key);
  return { key, orders: orders.map((o) => ({ ...o, address: parse(o.address, {}) })), items };
}

export const resetKeys = (db) => run(db, 'UPDATE orders SET ckey = NULL');
