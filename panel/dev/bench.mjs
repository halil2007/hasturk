// Büyük katalog hız testi: N ürün (varsayılan 20.000), her biri 3 kanalda ilan, M sipariş (varsayılan 60.000) ile panelin
// en sık açılan sayfalarının sunucu süresi ve sorgu sayısı ölçülür. Cloudflare D1 de SQLite olduğundan sorgu planı ve göreli
// maliyet aynıdır; DEV_LATENCY=ms ile her sorguya ağ gecikmesi eklenir (D1 gidiş-dönüşü).
//   node dev/bench.mjs                      → 20k ürün, 60k sipariş
//   PRODUCTS=50000 ORDERS=150000 node dev/bench.mjs
//   DEV_LATENCY=2 node dev/bench.mjs        → her sorguya +2 ms
import { d1, d1Stats } from './d1.mjs';
import { init } from '../src/db.js';
import { handle } from '../src/handler.js';
import { resetChannels } from '../src/channels/index.js';

const P = Number(process.env.PRODUCTS) || 20000, O = Number(process.env.ORDERS) || 60000;
const CH = ['ikas1', 'trendyol', 'hepsiburada'];
const env = { PANEL_PASSWORD: 'bench-pass-1', PANEL_SECRET: 's'.repeat(32) };
const db = d1();
await init(db);
resetChannels();

console.log(`Veri hazırlanıyor: ${P.toLocaleString('tr')} ürün, ${(P * CH.length).toLocaleString('tr')} ilan, ${O.toLocaleString('tr')} sipariş …`);
const t0 = Date.now(), now = Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const batch = async (rows) => { for (let i = 0; i < rows.length; i += 500) await db.batch(rows.slice(i, i + 500)); };
let st = [];
for (let i = 1; i <= P; i++) {
  st.push(db.prepare('INSERT INTO products (id, sku, barcode, name, category, purchase_price, sale_price, stock, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(i, 'SKU-' + i, String(8690000000000 + i), `Ürün ${i} ${['Toprak', 'Gübre', 'Saksı', 'Tohum'][i % 4]}`, 'Kategori ' + (i % 40), 50 + (i % 100), 100 + (i % 200), rnd(60), now - rnd(400) * 864e5, now));
  for (const c of CH) st.push(db.prepare('INSERT INTO listings (channel, remote_id, product_id, sku, barcode, name, price, remote_stock, pushed_stock, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(c, `${c}-${i}`, i, 'SKU-' + i, String(8690000000000 + i), `Ürün ${i}`, 100 + (i % 200), rnd(60), rnd(60), now));
  if (st.length >= 2000) { await batch(st); st = []; }
}
for (let i = 1; i <= O; i++) {
  const c = CH[i % 3], at = now - rnd(365) * 864e5 - rnd(864e5), pid = 1 + Math.floor(Math.pow(Math.random(), 3) * P); // satışlar az sayıda üründe yoğun
  const status = ['delivered', 'delivered', 'delivered', 'shipped', 'new', 'processing', 'cancelled', 'returned'][i % 8];
  st.push(db.prepare('INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, updated_at, customer, total, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(`${c}:${i}`, c, String(i), String(100000 + i), status, at, at, 'Müşteri ' + (i % 5000), 150, JSON.stringify({ city: ['İstanbul', 'Ankara', 'İzmir'][i % 3] })));
  st.push(db.prepare('INSERT INTO order_items (order_id, line_id, product_id, sku, name, quantity, unit_price, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(`${c}:${i}`, '1', pid, 'SKU-' + pid, 'Ürün ' + pid, 1 + (i % 3), 150, 150, status === 'cancelled' ? 'cancelled' : null));
  if (st.length >= 2000) { await batch(st); st = []; }
}
await batch(st);
await db.prepare('ANALYZE').run();
console.log(`Hazır (${((Date.now() - t0) / 1000).toFixed(1)} sn)\n`);

// Oturum çerezi
const login = await handle(new Request('https://b.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: env.PANEL_PASSWORD }) }), env, { waitUntil() {} }, db);
const cookie = login.headers.get('set-cookie').split(';')[0];
const month = new Date(); month.setDate(1);
const PAGES = [
  ['Genel bakış (özet)', 'summary'], ['Genel bakış (pano)', 'dashboard'],
  ['Siparişler (yeni)', 'orders?status=new&page=1&limit=50'], ['Siparişler (tümü)', 'orders?status=all&page=1&limit=50'], ['Sipariş arama', 'orders?status=all&q=100500&page=1&limit=50'],
  ['Kargo', 'packages?state=waiting'],
  ['Ürünler (en çok satan)', 'products?page=1&limit=40&group=1&sort=sold'], ['Ürünler (A–Z)', 'products?page=1&limit=40&group=1&sort=name'], ['Ürün arama', 'products?page=1&limit=40&group=1&q=Gübre'],
  ['Stoklar', 'products?page=1&limit=50&sort=sold'], ['Stoklar (tükenecek)', 'products?page=1&limit=50&sort=days'],
  ['Satış analizi', 'stats?range=30'], ['Gelir & gider (bu ay)', `finance?from=${month.getTime()}`], ['Ürün kârlılığı (bu ay)', `finance/products?from=${month.getTime()}`],
  ['Gelir & gider (1 yıl)', `finance?from=${now - 365 * 864e5}`], ['Müşteriler', 'customers'], ['Buybox', 'buybox?page=1&limit=50'], ['Fiyat önerileri', 'suggestions'],
];
const rows = [];
for (const [name, path] of PAGES) {
  const times = [];
  let q = 0, status = 0;
  for (let k = 0; k < 3; k++) {
    const q0 = d1Stats.q, s = performance.now();
    const r = await handle(new Request('https://b.test/api/' + path, { headers: { Cookie: cookie } }), env, { waitUntil() {} }, db);
    status = r.status; await r.text();
    times.push(performance.now() - s); q = d1Stats.q - q0;
  }
  times.sort((a, b) => a - b);
  rows.push({ sayfa: name, ms: Math.round(times[1]), sorgu: q, durum: status });
}
console.table(rows);
const slow = rows.filter((r) => r.ms > 500);
console.log(slow.length ? `\n500 ms'yi aşan: ${slow.map((r) => r.sayfa).join(', ')}` : '\nTüm sayfalar 500 ms altında.');
