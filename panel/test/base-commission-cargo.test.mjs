// Ana komisyon oranı ve ürün kargo tutarı bakımı:
//  · İlana yazılan komisyon ANA orandır (son 90 günün en yüksek satır oranı, resmî liste tabanı): pazaryerinin tek siparişteki indirimi
//    (idefix %4,6) ana oranı düşürmez; kâr raporları gerçek satır komisyonunu kullanır; elle girilen oran korunur; tek seferlik geçiş;
//    ileriye dönük hesaplar (başa baş, avantajlı etiket, öneri) ana oranla.
//  · Trendyol satıcının karşıladığı sepet / kupon indirimi (lineSellerDiscount): sipariş kârında ve Gelir & Gider'de bilgi olarak, çift düşülmez.
//  · Ürün kargo tutarı ↔ kargo faturası: düşükse otomatik güncellenir (geri alınabilir), yüksekse ürün başına en fazla iki bildirim,
//    "Faturadaki tutarı kullan" düğmesi ve yetki.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run, first } from '../src/db.js';
import { saveOrders } from '../src/sync.js';
import { refreshBaseRates, rebaseOnce, baseRate, orderCommission } from '../src/commcheck.js';
import { orderProfit, breakdown, breakEven, productLoss } from '../src/finance.js';
import { costInputs } from '../src/promos.js';
import { shipCheck, evaluateShip, shipSamples } from '../src/shipcost.js';
import { trendyol } from '../src/channels/trendyol.js';
import { api } from '../src/api.js';

const D = 864e5;
const SET = { costs_vat_incl: true, commission: { idefix: 20, trendyol: 24 }, shipping: {}, service_fee: {}, fee_rate: {}, withholding: {}, return_shipping: {} };
const listing = (db, ch, rid, extra = {}) => run(db, `INSERT INTO listings (channel, remote_id, name, product_id, mp_category, commission, commission_src) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ch, rid, rid, extra.product_id ?? null, extra.mp_category ?? null, extra.commission ?? null, extra.src ?? null);
const order = (no, at, rate, { rid = 'IX1', total = 1000, ch = 'idefix' } = {}) => ({ remoteId: no, orderNumber: no, orderedAt: at, status: 'delivered', total,
  items: [{ lineId: '1', sku: 'S1', barcode: rid, name: 'Ürün', quantity: 1, unitPrice: total, total, remoteKey: rid, commission: Math.round(total * rate) / 100 }] });
const lst = async (db, rid, ch = 'idefix') => ({ ...(await first(db, 'SELECT commission, commission_src FROM listings WHERE channel = ? AND remote_id = ?', ch, rid)) });

test('Ana oran: tek indirimli satır (idefix %4,6) ilanın oranını düşürmez; kâr gerçek komisyonla; elle girilen oran korunur', async () => {
  const db = d1(); await init(db);
  const now = Date.now();
  await listing(db, 'idefix', 'IX1'); await listing(db, 'idefix', 'IX2', { commission: 15, src: 'manual' });
  await saveOrders(db, 'idefix', [order('A1', now - 5 * D, 18), order('A2', now - 3 * D, 18)]);
  assert.deepEqual(await lst(db, 'IX1'), { commission: 18, commission_src: 'api' });
  // idefix'in kendi indirimi: son sipariş %4,6
  await saveOrders(db, 'idefix', [order('A3', now - D, 4.6)]);
  assert.deepEqual(await lst(db, 'IX1'), { commission: 18, commission_src: 'api' }, 'tek indirimli satır ana oranı düşürmez');
  // Kâr raporu gerçek kesintiyi kullanır (46 ₺), ileriye dönük tahmin ana oranı
  const items = await all(db, `SELECT i.*, l.commission AS listing_commission, l.commission_src AS listing_commission_src FROM order_items i LEFT JOIN listings l ON l.channel = 'idefix' AND l.remote_id = i.remote_key WHERE i.order_id = 'idefix:A3'`);
  assert.equal(orderProfit({ channel: 'idefix', items }, SET).commission, 46);
  // Oran artışı hemen yansır
  await saveOrders(db, 'idefix', [order('A4', now - D / 2, 19.5)]);
  assert.deepEqual(await lst(db, 'IX1'), { commission: 19.5, commission_src: 'api' });
  // Elle girilen oran: siparişler değiştirmez
  await saveOrders(db, 'idefix', [order('B1', now - D, 22, { rid: 'IX2' })]);
  assert.deepEqual(await lst(db, 'IX2'), { commission: 15, commission_src: 'manual' });
  // 90 günden eski satırlar sayılmaz (kalıcı düşüş 90 gün sonra yansır)
  await run(db, "UPDATE orders SET ordered_at = ? WHERE id IN ('idefix:A1', 'idefix:A2', 'idefix:A4')", now - 100 * D);
  assert.equal(await refreshBaseRates(db, 'idefix', ['IX1']), 1);
  assert.deepEqual(await lst(db, 'IX1'), { commission: 4.6, commission_src: 'api' });
});

test('idefix siparişinde komisyon indirimi sipariş ayrıntısında gösterilir (olağan %18 yerine %4,6); ilan oranı %18 kalır', async () => {
  const db = d1(); await init(db);
  const now = Date.now();
  await listing(db, 'idefix', 'IX1');
  await saveOrders(db, 'idefix', [order('A1', now - 9 * D, 18), order('A2', now - 7 * D, 18), order('A3', now - 5 * D, 18), order('A4', now - D, 4.6)]);
  const o = { ...(await first(db, "SELECT * FROM orders WHERE id = 'idefix:A4'")), items: await all(db, "SELECT * FROM order_items WHERE order_id = 'idefix:A4'") };
  const c = await orderCommission(db, SET, o);
  assert.deepEqual([c.lines.length, c.lines[0].rate, c.lines[0].normal, c.saved], [1, 4.6, 18, 134]);
  assert.deepEqual(await lst(db, 'IX1'), { commission: 18, commission_src: 'api' });
});

test('Ana oran: resmî liste tabanı (Trendyol olduğu gibi, Hepsiburada × 1,20); yardımcı', async () => {
  assert.equal(baseRate([18, 4.6], null), 18);
  assert.equal(baseRate([18], 21.5), 21.5);
  assert.equal(baseRate([], 7.2), 7.2);
  assert.equal(baseRate([], null), null);
  const db = d1(); await init(db);
  const now = Date.now();
  await listing(db, 'hepsiburada', 'HB1', { mp_category: 'Gram Altın' }); // liste: KDV hariç %6 → %7,2
  await saveOrders(db, 'hepsiburada', [order('H1', now - D, 3, { rid: 'HB1' })]); // Hepsiburada'nın sipariş başı indirimi
  assert.deepEqual(await lst(db, 'HB1', 'hepsiburada'), { commission: 7.2, commission_src: 'api' });
});

test('Ana oran: tek seferlik geçiş eski "son sipariş" oranını düzeltir, bir kez çalışır', async () => {
  const db = d1(); await init(db);
  const now = Date.now();
  await listing(db, 'idefix', 'IX1');
  await saveOrders(db, 'idefix', [order('A1', now - 5 * D, 18), order('A2', now - D, 4.6)]);
  // Eski kuralın bıraktığı durum: ilanda son satırın oranı
  await run(db, "UPDATE listings SET commission = 4.6, commission_src = 'api' WHERE remote_id = 'IX1'");
  await run(db, "DELETE FROM settings WHERE k = 'once:comm_base_1'");
  assert.equal(await rebaseOnce(db), 1);
  assert.deepEqual(await lst(db, 'IX1'), { commission: 18, commission_src: 'api' });
  await run(db, "UPDATE listings SET commission = 4.6 WHERE remote_id = 'IX1'");
  assert.equal(await rebaseOnce(db), null, 'ikinci kez çalışmaz');
});

test('İleriye dönük hesaplar ana oranla: başa baş fiyat geçici indirimle ucuzlamaz; avantajlı etiket / öneri ilanın oranını kullanır', async () => {
  // Kanalın 90 günlük gerçekleşen oranı %10 (indirimli siparişler), ilanın ana oranı %18
  const c = { channel: 'idefix', units: 10, revenue: 10000, commission: 1000, fixed: 500, returns: 0, returnCost: 0 };
  const base = breakEven(c, { purchase: 500, settings: SET, listingRate: 18 }), actual = breakEven(c, { purchase: 500, settings: SET });
  assert.equal(base.commissionRate, 18); assert.equal(base.actualRate, 10);
  assert.equal(actual.commissionRate, 10, 'ilan oranı bilinmiyorsa gerçekleşen oran');
  assert.ok(base.price > actual.price);
  // Ürün kartı: productLoss ilanın ana oranını kullanır
  const db = d1(); await init(db);
  const now = Date.now();
  await run(db, "INSERT INTO products (id, sku, name, purchase_price, sale_price, created_at, updated_at) VALUES (1, 'S1', 'Ürün', 500, 1000, 0, 0)");
  await listing(db, 'idefix', 'IX1', { product_id: 1 });
  await saveOrders(db, 'idefix', [order('A1', now - 5 * D, 18), order('A2', now - D, 4.6)]);
  await run(db, 'UPDATE order_items SET product_id = 1');
  const pl = await productLoss(db, SET, 1);
  assert.equal(pl.channels[0].commissionRate, 18); assert.equal(pl.channels[0].actualRate, 11.3);
  // Avantajlı etiket: dosyada oran yoksa ilanın (ana) oranı
  assert.equal(costInputs({ channel: 'idefix', commission: 18, purchase_price: 500 }, SET).curRate, 18);
});

test('Trendyol satıcı indirimi (sepet / kupon): satırdan okunur, sipariş kârında ve Gelir & Gider\'de bilgi; kâr ikinci kez düşmez', async () => {
  const H3 = 3 * 3600e3;
  globalThis.fetch = async () => new Response(JSON.stringify({ totalPages: 1, content: [{ shipmentPackageId: 1, orderNumber: '900', orderDate: Date.now() - D + H3, status: 'Delivered', lines: [
    { lineId: 11, quantity: 2, barcode: 'B1', lineGrossAmount: 350, lineSellerDiscount: 35, lineTyDiscount: 50, lineUnitPrice: 265, commission: 20 },
    { lineId: 12, quantity: 1, barcode: 'B2', lineUnitPrice: 40 }] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const [o] = await trendyol({ TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' }).fetchOrders(Date.now() - 2 * D, Date.now());
  assert.deepEqual([o.items[0].total, o.items[0].sellerDiscount, o.items[1].sellerDiscount], [630, 70, undefined]);
  const db = d1(); await init(db);
  await saveOrders(db, 'trendyol', [o]);
  const items = await all(db, "SELECT * FROM order_items WHERE order_id = 'trendyol:900' ORDER BY line_id");
  assert.deepEqual(items.map((i) => i.seller_discount), [70, null]);
  const p = orderProfit({ channel: 'trendyol', items }, SET);
  // komisyon: satır 1 gerçek (630 × %20), satır 2 tahmin (40 × %24)
  assert.deepEqual([p.revenue, p.sellerDiscount, p.commission], [670, 70, 135.6]);
  assert.equal(p.payout, 534.4, 'indirim satıştan zaten düşülmüş: ayrıca düşülmez');
  const b = await breakdown(db, SET, { from: Date.now() - 5 * D, to: Date.now() + 1 });
  assert.equal(b.total.sellerDiscount, 70);
  const step = b.steps.find((s) => s.k === 'sellerDiscount');
  assert.equal(step.v, -70); assert.equal(step.info, true);
  assert.deepEqual([b.total.revenue, b.total.payout], [670, 534.4], 'Gelir & Gider de indirimi ikinci kez düşmez');
});

// ---------- kargo ----------
async function cargoDb(shipCost, invoices, { lumped = [], multi = [] } = {}) {
  const db = d1(); await init(db);
  await run(db, "INSERT INTO products (id, sku, name, purchase_price, sale_price, ship_cost, created_at, updated_at) VALUES (1, 'S1', 'Termos', 100, 400, ?, 0, 0), (2, 'S2', 'Diğer', 100, 400, 50, 0, 0)", shipCost);
  const now = Date.now();
  let k = 0;
  for (const [cost, opts = {}] of invoices.map((x) => (Array.isArray(x) ? x : [x]))) {
    const id = `trendyol:${++k}`;
    await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total, shipping_cost, shipping_src, return_ship_src) VALUES (?, 'trendyol', ?, ?, 'delivered', ?, 400, ?, ?, ?)",
      id, String(k), String(k), now - (k + 1) * D, cost, opts.src || 'api', lumped.includes(k) ? 'lumped' : null);
    await run(db, "INSERT INTO order_items (order_id, line_id, product_id, quantity, total, status) VALUES (?, '1', 1, ?, 400, '')", id, opts.qty || 1);
    if (multi.includes(k)) await run(db, "INSERT INTO order_items (order_id, line_id, product_id, quantity, total, status) VALUES (?, '2', 2, 1, 400, '')", id);
  }
  return db;
}
const prod = async (db) => { const p = { ...(await first(db, 'SELECT ship_cost, ship_set_at, ship_auto, ship_warn, ship_src FROM products WHERE id = 1')) }; p.ship_auto = JSON.parse(p.ship_auto || 'null'); p.ship_warn = JSON.parse(p.ship_warn || 'null'); return p; };

test('Kargo: boş ürüne pazaryerinden gelen kargo bilgisi yazılır (son 5 gönderinin ortancası); sistemin yazdığı faturalarla güncellenir; kullanıcının girdiğine dokunulmaz, uyarılır; çok ürünlü / çok adetli / "lumped" sayılmaz', async () => {
  // 5 tek ürünlü gönderi (54,9 ortanca) + sayılmayanlar: 2 ürünlü koli (20), 2 adet (20), iade kargosu karışık eski kayıt (20)
  const inv = [54.9, 52, 56, [20, { qty: 2 }], 54.9, 20, 55, 20], cnt = { multi: [6], lumped: [8] };
  const db = await cargoDb(null, inv, cnt);
  const s = (await shipSamples(db)).get(1);
  assert.deepEqual(s.map((x) => x.cost), [54.9, 52, 56, 54.9, 55]);
  const r = await shipCheck(db, { force: true });
  assert.equal(r.filled, 1);
  const p = await prod(db);
  assert.deepEqual([p.ship_cost, p.ship_src, p.ship_auto.from, p.ship_auto.to, p.ship_auto.n, p.ship_auto.by], [54.9, 'channel', null, 54.9, 5, 'Pazaryeri']);
  assert.ok(p.ship_set_at > 0);
  assert.match((await first(db, "SELECT msg FROM logs WHERE msg LIKE '%pazaryerinden gelen kargo bilgisiyle yazıldı%'")).msg, /54,90 ₺/);
  // Tekrar çalışınca değişmez (yeni gönderi yok)
  assert.equal((await shipCheck(db, { force: true })).filled, 0);
  // Kullanıcının girdiği tutar (65) faturalardan yüksek: tutar değişmez, uyarılır
  const db2 = await cargoDb(65, inv, cnt);
  const r2 = await shipCheck(db2, { force: true });
  assert.deepEqual([r2.lower, r2.updated, r2.notified], [1, 0, 1]);
  const p2 = await prod(db2);
  assert.deepEqual([p2.ship_cost, p2.ship_warn.dir, p2.ship_warn.median], [65, 'lower', 54.9]);
  assert.match((await first(db2, "SELECT msg FROM notices WHERE key = 'shipcost:diff'")).msg, /sizin girdiğiniz 65,00 ₺, pazaryerinden gelen 54,90 ₺ \(kargo daha ucuz gidiyor/);
  // Sistemin yazdığı tutar faturalar değişince güncellenir
  await run(db2, "UPDATE products SET ship_src = 'channel', ship_warn = NULL WHERE id = 1");
  const r3 = await shipCheck(db2, { force: true });
  assert.equal(r3.updated, 1);
  assert.deepEqual([(await prod(db2)).ship_cost, (await prod(db2)).ship_auto.from], [54.9, 65]);
  // Eşik altındaki fark (%3 / 1 ₺) sayılmaz; 3'ten az gönderi karar vermez; boş tutar doldurulur
  assert.equal(evaluateShip({ ship_cost: 56 }, [{ cost: 55, at: 1 }, { cost: 55, at: 2 }, { cost: 55, at: 3 }]).action, 'ok');
  assert.equal(evaluateShip({ ship_cost: 65 }, [{ cost: 40, at: 1 }, { cost: 40, at: 2 }]).action, null);
  assert.equal(evaluateShip({ ship_cost: null }, [{ cost: 40, at: 1 }, { cost: 41, at: 2 }, { cost: 42, at: 3 }]).action, 'fill');
  // 6 saatte bir çalışır
  assert.equal(await shipCheck(db), null);
});

test('Kargo: faturalar yüksekse tutar değişmez, ürün başına en fazla iki bildirim (ilk + 30 gün sonra); düzelince kalkar', async () => {
  const db = await cargoDb(65, [72.4, 71, 74, 72.4]);
  const notice = () => first(db, "SELECT count, resolved_at, msg FROM notices WHERE key = 'shipcost:diff'");
  const t0 = Date.now();
  let r = await shipCheck(db, { force: true, now: t0 });
  assert.deepEqual([r.higher, r.notified, r.updated], [1, 1, 0]);
  assert.equal((await prod(db)).ship_cost, 65);
  assert.match((await notice()).msg, /sizin girdiğiniz 65,00 ₺, pazaryerinden gelen 72,40 ₺ \(kargo daha pahalı gidiyor/);
  // Aynı ay içinde tekrar: bildirim yok
  r = await shipCheck(db, { force: true, now: t0 + 10 * D });
  assert.equal(r.notified, 0); assert.equal((await notice()).count, 1);
  // 30 gün sonra hâlâ yüksek: bir kez daha
  r = await shipCheck(db, { force: true, now: t0 + 31 * D });
  assert.equal(r.notified, 1); assert.equal((await notice()).count, 2);
  // Sonrası: sessiz
  r = await shipCheck(db, { force: true, now: t0 + 70 * D });
  assert.equal(r.notified, 0); assert.equal((await notice()).count, 2);
  const w = (await prod(db)).ship_warn;
  assert.deepEqual([w.count, w.median, w.entered, w.n], [2, 72.4, 65, 4]);
  // Ürüne doğru tutar girilince (faturaların ortancasına yakın) uyarı kalkar
  await run(db, 'UPDATE products SET ship_cost = 72 WHERE id = 1');
  await shipCheck(db, { force: true, now: t0 + 71 * D });
  assert.equal((await prod(db)).ship_warn, null);
  assert.ok((await notice()).resolved_at > 0);
});

test('Kargo: "Faturadaki tutarı kullan" düğmesi (Ürünler yazma yetkisi); elle değişiklikten sonra eski faturalar karşılaştırılmaz', async () => {
  const db = await cargoDb(65, [72.4, 71, 74, 72.4]);
  await shipCheck(db, { force: true });
  const call = (path, user, method = 'GET', body) => api(new Request('https://p.test/api/' + path, method === 'GET' ? {} : { method, body: JSON.stringify(body || {}), headers: { 'Content-Type': 'application/json' } }),
    { DB: db }, { waitUntil() {} }, db, path, user).then((r) => r.json());
  const admin = { id: 0, name: 'Y', role: 'admin' }, viewer = { id: 5, name: 'G', role: 'staff', perms: ['products:view'] }, editor = { id: 6, name: 'E', role: 'staff', perms: ['products'] };
  // Ürün formu: not bilgisi
  const d = await call('products/1', viewer);
  assert.deepEqual([d.ship_info.warn.median, d.ship_info.warn.entered, d.ship_info.auto], [72.4, 65, null]);
  await assert.rejects(() => call('products/1/ship-from-invoice', viewer, 'POST'), (e) => e.status === 403);
  const r = await call('products/1/ship-from-invoice', editor, 'POST');
  assert.deepEqual([r.ok, r.ship_cost, r.n], [true, 72.4, 4]);
  const p = await prod(db);
  assert.deepEqual([p.ship_cost, p.ship_warn, p.ship_auto.from, p.ship_auto.to, p.ship_auto.by, p.ship_src], [72.4, null, 65, 72.4, 'E', 'channel']);
  const d2 = await call('products/1', admin);
  assert.deepEqual([d2.ship_info.auto.from, d2.ship_info.auto.to, d2.ship_info.warn], [65, 72.4, null]);
  // Tutar girildikten sonra yeni gönderi yok: tekrar kullanılamaz (yetersiz fatura)
  await assert.rejects(() => call('products/1/ship-from-invoice', admin, 'POST'), (e) => e.status === 409);
  // Elle değişiklik (ürün formu): karşılaştırma bundan sonraki gönderilerle başlar — eski faturalar kullanıcının tutarını ezmez
  await call('products/1', admin, 'PUT', { name: 'Termos', ship_cost: 60 });
  const p2 = await prod(db);
  assert.equal(p2.ship_cost, 60); assert.ok(p2.ship_set_at > 0); assert.equal(p2.ship_src, 'user');
  const r2 = await shipCheck(db, { force: true });
  assert.deepEqual([r2.lower, r2.higher, r2.updated], [0, 0, 0]);
  assert.equal((await prod(db)).ship_cost, 60);
  // Aynı tutarla kayıt (form her alanı gönderir): karşılaştırma sıfırlanmaz
  const at = (await prod(db)).ship_set_at;
  await call('products/1', admin, 'PUT', { name: 'Termos', ship_cost: 60 });
  assert.equal((await prod(db)).ship_set_at, at);
  // Tutar silinirse pazaryerinden gelen kargo bilgisi yeniden yazılır
  await call('products/1', admin, 'PUT', { name: 'Termos', ship_cost: '' });
  assert.deepEqual([(await prod(db)).ship_src, (await prod(db)).ship_set_at], [null, null]);
  assert.equal((await shipCheck(db, { force: true })).filled, 1);
  assert.deepEqual([(await prod(db)).ship_cost, (await prod(db)).ship_src], [72.4, 'channel']);
});

test('Kargo: kargo faturası gelen siparişin kârında faturadaki tutar, gelmeyende ürünün (güncellenmiş) kargo tutarı', async () => {
  const items = [{ total: 400, quantity: 1, status: '', commission: 80, ship_cost: 54.9, purchase_price: 100 }];
  assert.deepEqual([orderProfit({ channel: 'trendyol', shipping_cost: 61, shipping_src: 'api', items }, SET).shipping, orderProfit({ channel: 'trendyol', shipping_cost: 61, shipping_src: 'api', items }, SET).shippingSrc], [61, 'api']);
  assert.deepEqual([orderProfit({ channel: 'trendyol', items }, SET).shipping, orderProfit({ channel: 'trendyol', items }, SET).shippingSrc], [54.9, 'product']);
});
