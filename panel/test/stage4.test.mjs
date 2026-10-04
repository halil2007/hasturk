// Eşleştirme kuralları: aynı kanal içi eşleştirme yok, ad + varyant ile kesin eşleşme, kaldırılan eşleşme hatırlanır
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, first, all } from '../src/db.js';
import { autoMatch, suggestions, nameKey } from '../src/match.js';

async function db0() { const db = d1(); await init(db); return db; }
const L = (db, ch, id, o = {}) => db.prepare('INSERT INTO listings (channel, remote_id, sku, barcode, name, variant_name, remote_stock, match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .bind(ch, id, o.sku ?? '', o.barcode ?? '', o.name ?? '', o.variant ?? null, o.stock ?? 5, o.match ?? null).run();
const pid = async (db, id) => (await first(db, 'SELECT product_id, match FROM listings WHERE remote_id = ?', id));

test('tek site bağlıyken: barkodsuz/kodsuz dahil her varyant kendi ürünü olur, bekleyen eşleşme olmaz', async () => {
  const db = await db0();
  await L(db, 'ikas1', 'a', { name: 'Limon Ağacı Toprağı - 5 Lt', variant: '5 Lt' });
  await L(db, 'ikas1', 'b', { name: 'Limon Ağacı Toprağı - 10 Lt', variant: '10 Lt' });
  await L(db, 'ikas1', 'c', { name: 'Avokado Toprağı', sku: 'AV-1' });
  await L(db, 'ikas1', 'd', { name: 'Avokado Toprağı Büyük', sku: 'AV-1' }); // aynı SKU'lu iki farklı ikas ürünü
  const r = await autoMatch(db, { catalog: ['ikas1'] });
  assert.equal(r.created, 4);
  const ps = await all(db, 'SELECT DISTINCT product_id FROM listings');
  assert.equal(ps.length, 4, 'aynı sitenin ürünleri birleşmez');
  assert.deepEqual(await suggestions(db, {}), []);
});

test('ana katalog seçili kanal bağlı değilse ilk bağlı kanal katalog olur', async () => {
  const db = await db0();
  await L(db, 'ikas2', 'z1', { name: 'Çim Tohumu 1 Kg' });
  const r = await autoMatch(db, { catalog: ['ikas1'] });
  assert.equal(r.created, 1);
});

test('farklı kanal: ad + varyant birebir aynıysa otomatik, benzerse onaya düşer; dolu ürün aday olmaz', async () => {
  const db = await db0();
  await L(db, 'ikas1', 'v5', { name: 'Solucan Gübresi - 5 Kg', variant: '5 Kg' });
  await L(db, 'ikas1', 'v10', { name: 'Solucan Gübresi - 10 Kg', variant: '10 Kg' });
  await L(db, 'trendyol', 't5', { name: 'SOLUCAN GÜBRESİ 5000 gr' });
  await L(db, 'trendyol', 't5r', { name: 'GÜBRESİ SOLUCAN 5kg' });
  await L(db, 'hepsiburada', 'h0', { name: 'Organik Solucan Gübresi Paket 5 Kg', stock: 0 });
  await L(db, 'hepsiburada', 'h1', { name: 'Solucan Gübresi 10 Kg', stock: 0 });
  await L(db, 'trendyol', 't10', { name: 'Organik Solucan Gübresi 10 KG' });
  await L(db, 'trendyol', 't5b', { name: 'Solucan Gübresi 5 Kg Paket' });
  await autoMatch(db, { catalog: ['ikas1'] });
  const v5 = await pid(db, 'v5'), t5 = await pid(db, 't5');
  assert.equal(t5.product_id, v5.product_id); assert.equal(t5.match, 'name');
  assert.equal((await pid(db, 't10')).product_id, null, 'fazladan kelime var: kesin değil');
  assert.equal((await pid(db, 't5b')).product_id, null);
  assert.equal((await pid(db, 't5r')).product_id, null, 'kelime sırası farklı: adın tamamı aynı değil, onaya düşer');
  const h0 = await first(db, "SELECT ignored, match, product_id FROM listings WHERE remote_id = 'h0'");
  assert.equal(h0.product_id, null); assert.deepEqual([h0.ignored, h0.match], [1, 'zero'], 'stoğu sıfır, kesin eşleşmesi yok: otomatik yok sayılır');
  const h1 = await first(db, "SELECT ignored, match, product_id FROM listings WHERE remote_id = 'h1'");
  assert.deepEqual([h1.product_id, h1.ignored, h1.match], [null, 1, 'zero'], 'stoğu sıfır: tam ad eşleşse bile eşleştirmeye girmez');
  await db.prepare("UPDATE listings SET remote_stock = 3 WHERE remote_id IN ('h0', 'h1')").run();
  await autoMatch(db, { catalog: ['ikas1'] });
  const h0b = await first(db, "SELECT ignored, match FROM listings WHERE remote_id = 'h0'");
  assert.deepEqual([h0b.ignored, h0b.match], [0, null], 'stok gelince yeniden onay listesine döner');
  assert.equal((await pid(db, 'h1')).product_id, (await pid(db, 'v10')).product_id, 'stok gelince kesin (tam ad) eşleşme yapılır');
  const s = await suggestions(db, { channel: 'trendyol' });
  const t10 = s.find((x) => x.remote_id === 't10'), t5b = s.find((x) => x.remote_id === 't5b');
  assert.equal(t10.candidates[0].product_id, (await pid(db, 'v10')).product_id);
  assert.ok(!t5b.candidates.some((c) => c.product_id === v5.product_id), 'Trendyol ilanı olan ürün tekrar Trendyol adayı olmaz');
  assert.equal(t10.candidates[0].channels[0].channel, 'ikas1');
  assert.equal(nameKey('Gübre'), '', 'tek kelimelik adla otomatik eşleşme yok');
});

test('kaldırılan eşleşme aynı ürüne tekrar otomatik bağlanmaz', async () => {
  const db = await db0();
  await L(db, 'ikas1', 'k1', { name: 'Kaktüs Toprağı 5 Lt', barcode: '8690000000999' });
  await autoMatch(db, { catalog: ['ikas1'] });
  const p = (await pid(db, 'k1')).product_id;
  await L(db, 'hepsiburada', 'h1', { name: 'X', barcode: '8690000000999', match: 'x:' + p });
  await autoMatch(db, { catalog: ['ikas1'] });
  assert.equal((await pid(db, 'h1')).product_id, null);
});

test('kargo akışı (API): paketle + etiket, kargo seç, yazdırma onayı, paket iptali, işlem geçmişi', async () => {
  const { default: worker } = await import('../src/index.js');
  const { saveOrders } = await import('../src/sync.js');
  const db = await db0();
  const env = { DEMO: '1', PANEL_PASSWORD: 'pw-12345678', DB: db };
  let cookie = '';
  const call = async (path, method = 'GET', body) => {
    const r = await worker.fetch(new Request('https://p.test/api/' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('login', 'POST', { password: 'pw-12345678' });
  const now = Date.now();
  await saveOrders(db, 'ikas1', [{ remoteId: 'X1', orderNumber: 'X1', orderedAt: now - 30 * 3600e3, status: 'new', remoteStatus: 'CREATED', customer: 'Ali', address: { phone: '05' }, total: 10, shipBy: now + 3600e3,
    items: [{ lineId: 'l1', sku: 'A', name: 'A', quantity: 2, unitPrice: 5, total: 10 }], packages: null }]);
  const id = encodeURIComponent('ikas1:X1');
  let list = await call('orders?status=late');
  assert.equal(list.total, 1, 'son teslime 1 saat kaldı → geciken');
  await call(`orders/${id}/accept`, 'POST', {});
  // paketlenmeden kargo seçimi kaydedilir, paketlerken uygulanır
  let d = await call(`orders/${id}`);
  const lab0 = await call(`orders/${id}/label`, 'POST', {});
  assert.ok(lab0.packed, 'etiket istenince önce paketlendi');
  assert.equal(lab0.panel, true);
  d = await call(`orders/${id}`);
  const pkg = d.order.packages[0];
  assert.ok(pkg.packed_at && pkg.remote_id && pkg.barcode && pkg.label_at);
  assert.equal(pkg.label_printed_at, null, 'yazdırma onaylanmadan "yazdırıldı" sayılmaz');
  const opts = await call(`orders/${id}/cargo-options?package_id=${pkg.id}`);
  assert.ok(opts.options.length > 2);
  const ch = await call(`orders/${id}/cargo`, 'POST', { package_id: pkg.id, cargo: opts.options[1] });
  assert.match(ch.message, /değiştirildi/);
  d = await call(`orders/${id}`);
  assert.equal(d.order.packages[0].cargo_company, opts.options[1].name);
  assert.equal(d.order.packages[0].label_at, null, 'kargo değişince eski etiket geçersiz');
  await call(`orders/${id}/label`, 'POST', { package_id: pkg.id });
  await call(`orders/${id}/label-mark`, 'POST', { package_id: pkg.id, kind: 'viewed' });
  await call(`orders/${id}/label-mark`, 'POST', { package_id: pkg.id, kind: 'printed' });
  list = await call('orders?status=all');
  assert.equal(list.orders[0].printed, 1);
  d = await call(`orders/${id}`);
  assert.ok(d.order.packages[0].label_printed_at);
  assert.deepEqual(d.order.events.map((e) => e.action).reverse().slice(0, 3), ['accept', 'pack', 'label']);
  // paket iptali → paketleme ve etiket sıfırlanır
  await call(`orders/${id}/cancel-package`, 'POST', { package_id: pkg.id });
  d = await call(`orders/${id}`);
  assert.equal(d.order.packages[0].packed_at, null);
  assert.equal(d.order.packages[0].label_printed_at, null);
});

test('kanal panelinden yapılan işlem algılanır; panelden yapılan işlem kanal işlemi sayılmaz', async () => {
  const { saveOrders } = await import('../src/sync.js');
  const db = await db0();
  const o = (rs, st) => ({ remoteId: 'H1', orderNumber: 'H1', orderedAt: 1, status: st, remoteStatus: rs, customer: 'x', address: {}, total: 1, items: [], packages: null });
  await saveOrders(db, 'hepsiburada', [o('new', 'new')]);
  await saveOrders(db, 'hepsiburada', [o('processing', 'processing')]);
  let r = await first(db, "SELECT ext_action FROM orders WHERE id = 'hepsiburada:H1'");
  assert.equal(JSON.parse(r.ext_action).seller, true, 'yeni → hazırlanıyor: satıcı işlemi (Hepsiburada üzerinden)');
  await saveOrders(db, 'hepsiburada', [o('shipped', 'shipped')]);
  r = await first(db, "SELECT ext_action FROM orders WHERE id = 'hepsiburada:H1'");
  assert.equal(JSON.parse(r.ext_action).seller, false, 'kargo durumunun kaynağı kesin değil');
  // Panelden işlem yapıldıysa kanal işlemi olarak işaretlenmez
  await saveOrders(db, 'trendyol', [{ ...o('Created', 'new'), remoteId: 'T1', orderNumber: 'T1' }]);
  await db.prepare("INSERT INTO order_events (order_id, at, source, action) VALUES ('trendyol:T1', ?, 'panel', 'accept')").bind(Date.now()).run();
  await saveOrders(db, 'trendyol', [{ ...o('Picking', 'processing'), remoteId: 'T1', orderNumber: 'T1' }]);
  r = await first(db, "SELECT ext_action FROM orders WHERE id = 'trendyol:T1'");
  assert.equal(r.ext_action, null);
});

test('analizler: dönem kartları, iller ve en çok satanların ortalama/min/maks fiyatı; kanal filtresi', async () => {
  const { saveOrders } = await import('../src/sync.js');
  const { insights } = await import('../src/stats.js');
  const db = await db0();
  const now = Date.now();
  const o = (id, ch, city, price, qty, st = 'new') => ({ remoteId: id, orderNumber: id, orderedAt: now - 60e3, status: st, remoteStatus: st, customer: 'x', address: { city }, total: price * qty, packages: null,
    items: [{ lineId: id + 'l', sku: 'S1', name: 'Pompa', quantity: qty, unitPrice: price, total: price * qty }] });
  await saveOrders(db, 'trendyol', [o('a', 'trendyol', 'izmir', 100, 2), o('b', 'trendyol', 'İZMİR', 120, 1), o('c', 'trendyol', 'Konya', 90, 1, 'cancelled')]);
  await saveOrders(db, 'ikas1', [o('d', 'ikas1', 'Ankara', 80, 1)]);
  const r = await insights(db, { unit: 'day', range: 'today' });
  assert.equal(r.cards.length, 5);
  assert.equal(r.cards[0].orders, 3); assert.equal(r.cards[0].lost, 1); assert.equal(r.cards[0].revenue, 400);
  assert.equal(r.cards[0].lostRate, 25);
  assert.deepEqual(r.cities.map((c) => [c.city, c.orders]), [['İZMİR', 2], ['ANKARA', 1]], 'il adları birleştirilir; iptal sayılmaz');
  const t = r.top[0];
  assert.equal(t.qty, 4); assert.equal(t.min, 80); assert.equal(t.max, 120); assert.equal(t.avg, 100);
  const ty = await insights(db, { unit: 'day', range: 'today', channel: 'trendyol' });
  assert.equal(ty.cards[0].orders, 2);
  assert.equal(ty.top[0].qty, 3);
});

test('bekleyen kanal (N11): bilgi girilip bağlantı testi başarılı olana kadar gizli; sonra devreye girer', async () => {
  const { default: worker } = await import('../src/index.js');
  const db = await db0();
  const env = { PANEL_PASSWORD: 'pw-12345678', PANEL_SECRET: 'x', DB: db };
  let cookie = '';
  const call = async (path, method = 'GET', body) => {
    const r = await worker.fetch(new Request('https://p.test/api/' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('login', 'POST', { password: 'pw-12345678' });
  const st = async () => (await call('summary')).channels.find((c) => c.id === 'n11');
  assert.equal((await st()).gated, true);
  await call('integrations/n11', 'PUT', { values: { N11_APP_KEY: 'k', N11_APP_SECRET: 's' } });
  assert.equal((await st()).gated, true, 'bilgi girildi ama test edilmedi');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ totalPages: 1, content: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const t = await call('integrations/n11/test', 'POST', {});
    assert.equal(t.ok, true);
  } finally { globalThis.fetch = realFetch; }
  const c = await st();
  assert.equal(c.gated, false); assert.equal(c.enabled, true);
  // bilgiler değişince yeniden onay gerekir
  await new Promise((r) => setTimeout(r, 5));
  await call('integrations/n11', 'PUT', { values: { N11_APP_KEY: 'k2' } });
  assert.equal((await st()).gated, true);
});

test('otomatik fiyat kararı: örnek senaryo, min/max sınırı, rakip çekilince hedefe dönüş, kendi fiyatı rakip sayılmaz', async () => {
  const { decide } = await import('../src/buybox.js');
  const rule = { enabled: 1, min_price: 2900, max_price: 3200, target_price: 3000, step: 5 };
  // Rakip 2.995'e indi, buybox onda → 2.990
  assert.equal(decide(rule, { rank: 2, buyboxPrice: 2995 }, 3000).price, 2990);
  // Rakip minimumun altına indi → en fazla minimuma kadar
  const d = decide(rule, { rank: 2, buyboxPrice: 2850 }, 2990);
  assert.equal(d.price, 2900); assert.match(d.reason, /en düşük/);
  // Minimumdayız, rakip daha da düşük → değişiklik yok (altına inilmez)
  assert.ok(decide(rule, { rank: 2, buyboxPrice: 2800 }, 2900).skip);
  // Rakip çekildi: buybox bizde, başka satıcı yok → hedef fiyata (3.000) dönüş
  assert.equal(decide(rule, { rank: 1, buyboxPrice: 2990, multi: false }, 2990).price, 3000);
  // Buybox bizde, 2. satıcı 3.050 → hedefi aşmadan yükselt (3.000)
  assert.equal(decide(rule, { rank: 1, buyboxPrice: 2990, second: 3050, multi: true }, 2990).price, 3000);
  // Buybox bizde, 2. satıcı 2.996 → 2.991'e çık (kendi fiyatımız 2.990 rakip sayılmaz; düşürülmez)
  assert.equal(decide(rule, { rank: 1, buyboxPrice: 2990, second: 2996, multi: true }, 2990).price, 2991);
  assert.ok(decide(rule, { rank: 1, buyboxPrice: 2990, second: 2992, multi: true }, 2990).skip, 'buybox bizdeyken fiyat düşürülmez');
  // Kural kapalı / veri yok / eksik kural → işlem yok
  assert.ok(decide({ ...rule, enabled: 0 }, { rank: 2, buyboxPrice: 2995 }, 3000).skip);
  assert.ok(decide(rule, { rank: null }, 3000).skip);
  assert.ok(decide({ ...rule, min_price: 0 }, { rank: 2, buyboxPrice: 2995 }, 3000).skip);
  // Hiçbir zaman max üstüne çıkmaz
  assert.equal(decide({ ...rule, target_price: 5000, max_price: 3100 }, { rank: 1, multi: false }, 3000).price, 3100);
});

test('otomatik fiyat: genel anahtar kapalıyken ya da veri eskiyken fiyat değişmez; değişiklik kaydedilir', async () => {
  const { autoPrice } = await import('../src/buybox.js');
  const { setSetting, getSettings } = await import('../src/db.js');
  const db = await db0();
  await db.prepare("INSERT INTO listings (channel, remote_id, barcode, name, price) VALUES ('trendyol', 'B1', 'B1', 'Pompa', 3000)").run();
  await db.prepare("INSERT INTO price_rules (channel, remote_id, enabled, min_price, max_price, target_price, step) VALUES ('trendyol', 'B1', 1, 2900, 3200, 3000, 5)").run();
  await db.prepare("INSERT INTO buybox (channel, remote_id, rank, buybox_price, multi, checked_at) VALUES ('trendyol', 'B1', 2, 2995, 1, ?)").bind(Date.now()).run();
  const pushed = [];
  const env = { TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's', DB: db };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, o) => { pushed.push(JSON.parse(o.body)); return new Response('{"batchRequestId":"x"}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try {
    assert.ok((await autoPrice(env, db, await getSettings(db))).skipped, 'genel anahtar kapalı');
    await setSetting(db, 'autoprice', true);
    await db.prepare("UPDATE buybox SET checked_at = ?").bind(Date.now() - 3600e3).run();
    assert.equal((await autoPrice(env, db, await getSettings(db))).changed, 0, 'eski veriyle değişiklik yok');
    await db.prepare("UPDATE buybox SET checked_at = ?").bind(Date.now()).run();
    assert.equal((await autoPrice(env, db, await getSettings(db))).changed, 1);
    assert.equal(pushed.pop().items[0].salePrice, 2990);
    const c = await first(db, 'SELECT * FROM price_changes');
    assert.equal(c.old_price, 3000); assert.equal(c.new_price, 2990); assert.equal(c.competitor_price, 2995); assert.ok(c.reason);
    assert.equal((await first(db, "SELECT price FROM listings WHERE remote_id = 'B1'")).price, 2990);
    assert.equal((await first(db, "SELECT checked_at FROM buybox")).checked_at, 0, 'değişiklik sonrası yeniden kontrol önceliği');
    // Bekleme süresi: hemen ikinci değişiklik yapılmaz
    await db.prepare("UPDATE buybox SET checked_at = ?, buybox_price = 2985").bind(Date.now()).run();
    assert.equal((await autoPrice(env, db, await getSettings(db))).changed, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('eski hatalı eşleşme onarımı: aynı kanaldan bir ürüne bağlı fazladan ilanlar ayrılır, en uygun olan kalır', async () => {
  const { repairDuplicates } = await import('../src/match.js');
  const db = await db0();
  await db.prepare("INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'SG-5', '869005', 'Solucan Gübresi 5 Kg', 5, 0, 0)").run();
  await L(db, 'trendyol', 'a', { sku: 'X', barcode: '111', name: 'Saksı Toprağı 20 Lt' });
  await L(db, 'trendyol', 'b', { sku: 'SG-5', barcode: '869005', name: 'Solucan Gübresi 5 Kg' });
  await L(db, 'trendyol', 'c', { sku: 'Y', barcode: '222', name: 'Perlit 10 Lt' });
  await db.prepare("UPDATE listings SET product_id = 1, match = 'name'").run();
  assert.equal(await repairDuplicates(db), 2);
  const rows = await all(db, 'SELECT remote_id, product_id FROM listings ORDER BY remote_id');
  assert.deepEqual(rows.map((r) => [r.remote_id, r.product_id]), [['a', null], ['b', 1], ['c', null]]);
});
