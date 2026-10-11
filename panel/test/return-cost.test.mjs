// İade maliyeti ve zarar uyarıları: sipariş başı iade maliyeti (tam / kısmi iade, kargo faturasından / tahmini, çift sayım yok),
// Gelir & gider şelalesi ve ürün kârlılığı ile tutarlılık, kargo faturasında iade kaleminin ayrılması, başa baş fiyat (beklenen iade
// maliyeti dahil; Trendyol / Hepsiburada komisyonu KDV dahil), zarar eşikleri, API çıktıları ve haftalık bildirim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run, first, setSetting, getSettings } from '../src/db.js';
import { returnCost, returnCosts, breakdown, productProfit, breakEven, lossVerdict, productLoss, lossCache, markLosses, lossSummary, lossNotify, commissionCredits, returnNote } from '../src/finance.js';
import { profit, rateGross } from '../public/profit.js';
import { api } from '../src/api.js';

const D = 864e5;
const S = { costs_vat_incl: true, commission: { trendyol: 20 }, shipping: { trendyol: 30 }, service_fee: { trendyol: 5 }, return_shipping: { hepsiburada: 40 }, fee_rate: {}, withholding: {} };
const line = (x) => ({ product_id: 1, name: 'Ürün', sku: 'S1', barcode: 'B1', total: 200, quantity: 1, returned_qty: 0, status: '', purchase_price: 80, ...x });

test('İade maliyeti: tam iade (kargo faturasından gönderim + iade kargosu, hizmet bedeli), geri verilmeyen komisyon', () => {
  const o = { id: 'A', channel: 'trendyol', status: 'returned', shipping_cost: 45, shipping_src: 'api', return_ship_cost: 50, return_ship_src: 'api', items: [line()] };
  const r = returnCost(o, S);
  assert.equal(r.full, true); assert.equal(r.units, 1);
  assert.deepEqual([r.outbound, r.outboundSrc, r.returnShip, r.returnShipSrc, r.fee, r.commission, r.total], [45, 'invoice', 50, 'invoice', 5, 0, 100]);
  assert.equal(r.lines[0].cost, 100);
  // Pazaryeri iade kaydı geldi ama komisyonu geri vermedi (hakediş kayıtlarından): kalan komisyon eklenir
  assert.equal(returnCost({ ...o, ret_comm: 24 }, S).total, 124);
  // Kargo faturası toplamı kullanılan kanalda kargo kalemleri o toplamın içinde: yalnız hizmet bedeli, kargo inInvoice'ta
  const inv = returnCost(o, S, { invoiceShipping: true });
  assert.deepEqual([inv.total, inv.inInvoice, inv.outbound, inv.returnShip], [5, 95, 0, 0]);
  assert.equal(returnCost(o, S, { feeFromInvoice: true }).total, 95);
});

test('İade maliyeti: bütün satırları iade (sipariş durumu değişmemiş), ürün kargo tutarı ve tahmini iade kargosu', () => {
  const r = returnCost({ id: 'B', channel: 'hepsiburada', status: 'delivered', shipping_cost: null, items: [line({ status: 'returned', ship_cost: 35 })] }, S);
  assert.equal(r.full, true);
  assert.deepEqual([r.outbound, r.outboundSrc, r.returnShip, r.returnShipSrc, r.fee, r.total, r.estimated], [35, 'product', 40, 'estimate', 0, 75, true]);
});

test('İade maliyeti: kısmi iade yalnız iade kargosu (gönderim kargosu ve komisyon canlı siparişte zaten sayılıyor); eski kayıt "lumped"', () => {
  const o = { id: 'C', channel: 'trendyol', status: 'delivered', shipping_cost: 45, shipping_src: 'api', ret_comm: 99,
    items: [line({ quantity: 3, total: 300, returned_qty: 1 }), line({ product_id: 2, sku: 'S2', barcode: 'B2', total: 100 })] };
  const none = returnCost(o, S);
  assert.equal(none.full, false); assert.equal(none.units, 1);
  // İade kargo bedeli girilmemiş: uydurma tutar yok (0, "none"); geri verilmeyen komisyon kısmi iadede eklenmez
  assert.deepEqual([none.outbound, none.returnShip, none.returnShipSrc, none.commission, none.fee, none.total], [0, 0, 'none', 0, 0, 0]);
  assert.match(returnNote({ orders: 1, full: 0, partial: 1, units: 1 }), /İade kargo bedeli/);
  const est = returnCost(o, { ...S, return_shipping: { trendyol: 25 } });
  assert.deepEqual([est.returnShip, est.returnShipSrc, est.total, est.lines.length, est.lines[0].key, est.lines[0].units], [25, 'estimate', 25, 1, 1, 1]);
  // Eski kayıt: iade kargosu gönderim faturasıyla birlikte shipping_cost'ta → tahmin eklenmez
  const lump = returnCost({ ...o, return_ship_src: 'lumped' }, { ...S, return_shipping: { trendyol: 25 } });
  assert.deepEqual([lump.returnShip, lump.returnShipSrc, lump.total], [0, 'lumped', 0]);
  // İade yok: maliyet yok
  assert.equal(returnCost({ ...o, items: [line()] }, S), null);
});

test('İade maliyeti: hasarlı iade (ayar açıksa) iade edilen adedin alış maliyeti', () => {
  const o = { id: 'D', channel: 'trendyol', status: 'returned', shipping_cost: 0, shipping_src: 'api', items: [line({ quantity: 2, total: 400 })], damaged: [{ barcode: 'B1', qty: 1 }] };
  assert.equal(returnCost(o, S).damaged, 0);
  const r = returnCost(o, { ...S, return_damaged_loss: true });
  assert.deepEqual([r.damaged, r.total - 5], [80, 80]);
});

// Ortak örnek: P1 (alış 50) Trendyol'da; O1 teslim, O2 tamamı iade (kargo faturası: gönderim 30, iade 28), O3 kısmi iade (2'den 1)
async function seed() {
  const db = d1(); await init(db);
  const t = Date.now() - 2 * D;
  await run(db, "INSERT INTO products (id, sku, barcode, name, purchase_price, sale_price, created_at, updated_at) VALUES (1, 'P1', 'B1', 'Saksı toprağı', 50, 200, ?, ?)", t, t);
  const order = (id, status, ship, retShip) => run(db, `INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total, shipping_cost, shipping_src, return_ship_cost, return_ship_src)
    VALUES (?, 'trendyol', ?, ?, ?, ?, 0, ?, 'api', ?, ?)`, id, id, id, status, t, ship, retShip, retShip == null ? null : 'api');
  const item = (oid, qty, total, comm, ret = 0, status = '') => run(db, "INSERT INTO order_items (order_id, line_id, product_id, sku, barcode, name, quantity, unit_price, total, status, remote_key, commission, returned_qty) VALUES (?, '1', 1, 'P1', 'B1', 'Saksı toprağı', ?, 0, ?, ?, 'B1', ?, ?)", oid, qty, total, status, comm, ret);
  await order('O1', 'delivered', 30, null); await item('O1', 1, 200, 40);
  await order('O2', 'returned', 30, 28); await item('O2', 1, 200, 40);
  await order('O3', 'delivered', 30, null); await item('O3', 2, 400, 80, 1);
  // O2 hakediş: satış komisyonu 40, iade kaydında geri verildi (−40)
  const stl = (id, type, amount, comm) => run(db, "INSERT INTO settlements (channel, remote_id, date, type, order_number, amount, commission, due_date, paid) VALUES ('trendyol', ?, ?, ?, 'O2', ?, ?, ?, 0)", id, t, type, amount, comm, t);
  await stl('s1', 'Satış', 160, 40); await stl('s2', 'İade', -160, -40);
  return db;
}
const SET = { costs_vat_incl: true, commission: { trendyol: 20 }, shipping: {}, service_fee: {}, fee_rate: {}, withholding: {}, return_shipping: { trendyol: 25 } };

test('Gelir & gider: "İade maliyeti" basamağı (komisyon iadesiyle çift sayım yok) ve ürün kârlılığıyla aynı kâr', async () => {
  const db = await seed();
  const q = { from: Date.now() - 10 * D, to: Date.now() + 1 };
  const rc = await returnCosts(db, SET, q);
  assert.deepEqual(rc.map((r) => [r.id, r.full, r.total]).sort(), [['O2', true, 58], ['O3', false, 25]]);
  const b = await breakdown(db, SET, q), t = b.total;
  // Ciro 200 + 400 × ½; komisyon 40 + 80 × ½ (iade edilen adedin komisyonu geri verilir); kargo yalnız canlı siparişler
  assert.deepEqual([t.revenue, t.commission, t.shipping, t.returnLoss, t.payout, t.cost, t.profit], [400, 80, 60, 83, 177, 100, 77]);
  assert.deepEqual([t.returns, t.returnInfo.full, t.returnInfo.partial, t.returnInfo.outbound, t.returnInfo.returnShip, t.returnInfo.returnShipEst], [2, 1, 1, 30, 53, 25]);
  const step = b.steps.find((s) => s.k === 'returnLoss');
  assert.equal(step.label, 'İade maliyeti'); assert.equal(step.v, -83); assert.match(step.note, /iade kargosu 53 ₺ \(25 ₺ tahmini, 1 iade\)/);
  // İade edilen siparişin komisyonu "komisyon iadesi" olarak ikinci kez eklenmez
  assert.equal(t.commCredit, 0); assert.equal((await commissionCredits(db, SET, q)).size, 0);
  const pp = await productProfit(db, SET, q), x = pp.rows[0];
  assert.deepEqual([x.units, x.revenue, x.commission, x.other, x.cost, x.profitExRet, x.returns, x.returnCost, x.profit, x.perReturn], [2, 400, 80, 60, 100, 160, 2, 83, 77, 41.5]);
  assert.equal(x.profit, t.profit, 'ürün kârları toplamı = şelaledeki brüt kâr');
  assert.equal(x.returnRate, 50); assert.equal(x.returnShare, 51.88);
  assert.equal((await productProfit(db, SET, { ...q, sort: 'retcost' })).rows[0].key, '1');
  // Pazaryeri iadede komisyonu geri vermediyse (iade kaydında komisyon 0): kalan 40 iade maliyetine eklenir
  await run(db, "UPDATE settlements SET commission = 0 WHERE remote_id = 's2'");
  const b2 = await breakdown(db, SET, q);
  assert.equal(b2.total.returnLoss, 123); assert.equal(b2.total.returnInfo.commission, 40); assert.equal(b2.total.profit, 37);
});

test('Gelir & gider: kargo faturası toplamı kullanılan kanalda iade kargosu ikinci kez düşülmez', async () => {
  const db = d1(); await init(db);
  const t = Date.now() - 2 * D;
  for (const [id, st] of [['K1', 'delivered'], ['K2', 'delivered'], ['K3', 'returned']]) {
    await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total) VALUES (?, 'trendyol', ?, ?, ?, ?, 100)", id, id, id, st, t);
    await run(db, "INSERT INTO order_items (order_id, line_id, sku, name, quantity, unit_price, total, status, commission) VALUES (?, '1', 'S', 'Ü', 1, 100, 100, '', 10)", id);
  }
  await run(db, "INSERT INTO invoices (channel, remote_id, no, date, type, description, amount, order_number, url, synced_at) VALUES ('trendyol', 'K', 'K', ?, 'Kargo', '', 150, '', '', 0)", t);
  const set = { ...SET, shipping: { trendyol: 30 }, service_fee: { trendyol: 5 } };
  const b = await breakdown(db, set, { from: t - D, to: Date.now() + 1 });
  const c = b.channels[0];
  assert.equal(c.shippingSrc, 'invoice'); assert.equal(c.shipping, 150);
  // Tam iade: gönderim 30 + iade 25 kargo faturası toplamında; yalnız hizmet bedeli (5) iade maliyeti
  assert.equal(c.returnLoss, 5); assert.equal(c.returnInfo.inInvoice, 55);
  assert.equal(c.payout, 200 - 20 - 150 - 10 - 5);
});

test('Kargo faturası: iade gönderisi kalemi ayrı yazılır; sonraki okumada yalnız iade kalemi gönderim tutarını silmez; elle girilen korunur', async () => {
  const { trendyol } = await import('../src/channels/trendyol.js');
  const { syncCosts } = await import('../src/sync.js');
  const db = d1(); await init(db);
  const real = globalThis.fetch;
  let items = [{ orderNumber: '111', amount: 40, shipmentPackageType: 'Gönderi' }, { orderNumber: '111', amount: 35, shipmentPackageType: 'İade' }, { orderNumber: '222', amount: 30 }, { orderNumber: '222', amount: 33, shipmentPackageType: 'İade' }, { orderNumber: '333', amount: 45 }];
  globalThis.fetch = async (url) => {
    const u = String(url), J = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
    if (/otherfinancials/.test(u)) return J({ content: [{ id: 'KRG', transactionType: 'Kargo Faturası' }], totalPages: 1 });
    if (/cargo-invoice\/KRG\/items/.test(u)) return J({ content: items, totalPages: 1 });
    return J({ content: [] });
  };
  try {
    const t = Date.now();
    for (const [no, src, cost, rsrc] of [['111', null, null, null], ['222', 'manual', 99, null], ['333', 'api', 70, 'lumped']]) await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, shipping_cost, shipping_src, return_ship_src) VALUES (?, 'trendyol', ?, ?, 'delivered', ?, ?, ?, ?)", 'trendyol:' + no, no, no, t, cost, src, rsrc);
    const ch = trendyol({ TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
    const r0 = await ch.cargoCosts(t - D, t);
    assert.deepEqual(r0.items.find((x) => x.orderNumber === '111'), { orderNumber: '111', amount: 40, returnAmount: 35 });
    await syncCosts({}, db, [ch]);
    const rows = async () => Object.fromEntries((await all(db, 'SELECT order_number, shipping_cost, shipping_src, return_ship_cost, return_ship_src FROM orders')).map((x) => [x.order_number, [x.shipping_cost, x.shipping_src, x.return_ship_cost, x.return_ship_src]]));
    assert.deepEqual(await rows(), { 111: [40, 'api', 35, 'api'], 222: [99, 'manual', 33, 'api'], 333: [45, 'api', null, null] });
    assert.equal(JSON.parse((await first(db, "SELECT v FROM settings WHERE k = 'costs:trendyol'")).v).split, 1);
    // Sonraki okuma: gönderim faturası pencerenin dışında kaldı, yalnız iade kalemi geldi
    items = [{ orderNumber: '111', amount: 36, shipmentPackageType: 'İade' }];
    await syncCosts({}, db, [ch], { force: true });
    assert.deepEqual((await rows())[111], [40, 'api', 36, 'api']);
  } finally { globalThis.fetch = real; }
});

test('Hepsiburada kargo kaydı: iade kargosu ayrı (returnAmount), gelir kayıtları sayılmaz', async () => {
  const { hepsiburada } = await import('../src/channels/hepsiburada.js');
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [
    { orderNumber: '1', transactionType: 'ShipmentCostSharingExpense', amount: { value: -40 } },
    { orderNumber: '1', transactionType: 'ReturnCargoExpense', description: 'İade kargo bedeli', amount: { value: -38 } },
    { orderNumber: '1', transactionType: 'CargoCompensationIncome', amount: { value: 25 }, isIncome: true }] }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const r = await hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' }, { id: 'hepsiburada' }).cargoCosts(Date.parse('2026-10-01'), Date.parse('2026-10-02'));
    assert.deepEqual(r.items, [{ orderNumber: '1', amount: 40, returnAmount: 38 }]);
  } finally { globalThis.fetch = real; }
});

test('Başa baş fiyat: komisyon, kargo, stopaj ve beklenen iade maliyeti (iade oranı × iade başı maliyet) dahil', () => {
  const set = { costs_vat_incl: true, commission: { trendyol: 20, hepsiburada: 18 }, shipping: { hepsiburada: 30 }, service_fee: {}, fee_rate: {}, withholding: { trendyol: 1, hepsiburada: 1 } };
  // Trendyol: kanalın bildirdiği komisyon KDV dahil (%24), kargo + hizmet 40 / adet, 10 satışta 2 iade × 80 ₺
  const ty = { channel: 'trendyol', units: 10, revenue: 2000, commission: 480, fixed: 400, returns: 2, returnCost: 160 };
  const be = breakEven(ty, { purchase: 100, settings: set });
  assert.equal(be.commissionRate, 24); assert.equal(be.fixed, 40); assert.equal(be.expReturn, 16);
  assert.equal(be.price, 207.54); // (100 + 40 + 16) / (1 − 0,24 − 0,01 / 1,2)
  const at = profit({ sale: be.price, purchase: 100, commissionRate: 24, shipping: 40, extra: 16, withholdingRate: 1 });
  assert.ok(Math.abs(at.unitProfit) < 0.01, 'başa baş fiyatta kâr 0');
  // İade olmasa daha düşük
  assert.ok(breakEven({ ...ty, returns: 0, returnCost: 0 }, { purchase: 100, settings: set }).price < be.price);
  // Ürünün iade oranı tüm kanallardan (kanalın 1 satışı yanıltmasın), iade başı maliyet kanalın
  assert.equal(breakEven({ ...ty, units: 1, returns: 2 }, { purchase: 100, settings: set, retRatio: 0.2, perReturn: 50 }).expReturn, 16);
  // Hepsiburada: kanalın komisyon tutarı KDV dahil saklanır (oran %18 + KDV = %21,6)
  const hb = { channel: 'hepsiburada', units: 5, revenue: 1000, commission: 1000 * 0.18 * 1.2, fixed: 150, returns: 0, returnCost: 0 };
  assert.equal(breakEven(hb, { purchase: 100, settings: set }).commissionRate, 21.6);
  // Satışı olmayan kanal: ilan oranı (KDV hariç girilmiş eski kurulumda ×1,2) ve Ayarlar'daki kargo
  const legacy = { ...set, costs_vat_incl: false };
  const none = breakEven({ channel: 'hepsiburada', units: 0, revenue: 0, commission: 0, fixed: 0, returns: 0, returnCost: 0 }, { purchase: 100, settings: legacy, listingRate: rateGross(legacy, 18) });
  assert.equal(none.commissionRate, 21.6); assert.equal(none.fixed, 36);
  // Kesintiler satışın tamamını götürüyorsa fiyat yok
  assert.equal(breakEven({ ...ty, commission: 2000 }, { purchase: 100, settings: set }).price, null);
});

test('Zarar eşikleri: −1 ₺ altı zarar; alış fiyatı eksikse uyarı yok; iade kârın %30\'undan fazlasını götürüyorsa iade uyarısı', () => {
  assert.equal(lossVerdict({ profit: -0.5, returnCost: 0 }), null);
  assert.deepEqual(lossVerdict({ profit: -5, returnCost: 3 }), { level: 'loss', loss: 5 });
  assert.equal(lossVerdict({ profit: -500, missingCost: 2 }), null);
  assert.deepEqual(lossVerdict({ profit: 69, returnCost: 31, returnShare: 31 }), { level: 'returns', share: 31 });
  assert.equal(lossVerdict({ profit: 71, returnCost: 29, returnShare: 29 }), null);
  assert.equal(lossVerdict({ profit: 100, returnCost: 0, returnShare: 0 }), null);
});

test('API: ürün kartı uyarısı, ürün listesi rozeti / süzgeci (yalnız kâr yetkisiyle), genel bakış özeti, haftalık bildirim', async () => {
  const db = await seed();
  // Alış 150: ürün zararda (iade öncesi −40, iade maliyeti 83 → −123)
  await run(db, 'UPDATE products SET purchase_price = 150 WHERE id = 1');
  // Stopaj 0 (tutarlar elle hesaplanabilsin); API aynı ayarları veritabanından okur
  await setSetting(db, 'return_shipping', { trendyol: 25 }); await setSetting(db, 'withholding', { trendyol: 0 });
  const settings = await getSettings(db);
  const pl = await productLoss(db, settings, 1);
  assert.equal(pl.d90.profit, -123); assert.equal(pl.d90.profitExRet, -40); assert.deepEqual(pl.d90.verdict, { level: 'loss', loss: 123 });
  assert.equal(pl.d30.verdict.level, 'loss');
  const c = pl.channels[0];
  assert.equal(c.channel, 'trendyol'); assert.equal(c.profit, -123); assert.equal(c.returnRate, 50);
  // Başa baş: komisyon %20 (gerçek), sabit 30 / adet, beklenen iade = 2 iade / 2 satış × 41,5
  assert.deepEqual([c.commissionRate, c.fixed, c.expReturn], [20, 30, 41.5]);
  assert.ok(c.price > c.avgPrice);
  const cache = await lossCache(db, settings, { force: true });
  assert.deepEqual(cache.items, [[1, -123, 83]]);
  const rows = [{ id: 1 }, { id: 2 }]; await markLosses(db, settings, rows);
  assert.deepEqual(rows[0].loss30, { profit: -123, returnCost: 83 }); assert.equal(rows[1].loss30, undefined);
  const sum = await lossSummary(db, settings);
  assert.equal(sum.count, 1); assert.equal(sum.total, -123); assert.equal(sum.top[0].name, 'Saksı toprağı');
  assert.ok(sum.month.cost >= 0);

  const call = (path, user) => api(new Request('https://p.test/api/' + path), { DB: db }, { waitUntil() {} }, db, path.split('?')[0], user).then((r) => r.json());
  const admin = { id: 0, name: 'Y', role: 'admin' }, staff = { id: 5, name: 'P', role: 'staff', perms: ['products'] };
  const L = await call('products?filter=loss', admin);
  assert.deepEqual(L.products.map((p) => p.id), [1]); assert.equal(L.stats.loss, 1); assert.deepEqual(L.products[0].loss30, { profit: -123, returnCost: 83 });
  const Ls = await call('products', staff);
  assert.equal(Ls.products[0].loss30, undefined); assert.equal(Ls.stats.loss, undefined);
  await assert.rejects(() => call('products?filter=loss', staff), (e) => e.status === 403);
  await assert.rejects(() => call('finance/product/1', staff), (e) => e.status === 403);
  const P = await call('finance/product/1', admin);
  assert.equal(P.d90.verdict.level, 'loss'); assert.equal(P.channels.length, 1);
  const F = await call('finance/losses', admin);
  assert.equal(F.count, 1);
  const FP = await call('finance/products?sort=retcost', admin);
  assert.equal(FP.rows[0].returnCost, 83); assert.equal(FP.losing, 1); assert.equal(FP.lossTotal, -123);

  // Haftalık bildirim: ilk seferde bildirim; aynı hafta tekrar yok; hafta geçse de yeni ürün yoksa yok
  assert.equal(await lossNotify(db, settings), 1);
  const n1 = await first(db, "SELECT title, msg, count FROM notices WHERE key = 'loss:products'");
  assert.match(n1.title, /1 ürün son 30 günde zarar ettirdi/); assert.match(n1.msg, /Saksı toprağı/);
  assert.equal(await lossNotify(db, settings), null);
  await run(db, "UPDATE settings SET v = json_set(v, '$.at', 0) WHERE k = 'loss_notify'");
  assert.equal(await lossNotify(db, settings), 0);
  assert.equal((await first(db, "SELECT count FROM notices WHERE key = 'loss:products'")).count, 1);
});
