// Komisyon kontrolü: resmî listeyle sağlama (kategori eşleşmesi, liste oranı tahmini), komisyon indirimi (satır oranı olağan / liste
// oranından düşük), hakediş kayıtlarındaki komisyon iadesi (kâra ve mutabakata eklenir, çift sayılmaz), Hepsiburada kısmi iade
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { saveOrders, refreshListings } from '../src/sync.js';
import { trendyol } from '../src/channels/trendyol.js';
import { listRate, mpOf, applyListRates, lineDiscount, orderCommission, commissionCheck } from '../src/commcheck.js';
import { breakdown, settlementReport, countedCredit, commissionCredits, orderProfit } from '../src/finance.js';
import { resetChannels } from '../src/channels/index.js';
import { LISTS } from '../src/commission-lists.js';

const D = 864e5;
const SET = { commission: { trendyol: 24, hepsiburada: 21.6 }, costs_vat_incl: true };

test('Resmî liste: kategori adı tek anlamlı eşleşir; Trendyol oranı KDV dahil, Hepsiburada ×1,20; belirsiz / bilinmeyen ad eşleşmez', () => {
  assert.equal(LISTS.trendyol.basis, 'kdv-dahil'); assert.equal(LISTS.hepsiburada.basis, 'kdv-haric');
  assert.equal(LISTS.trendyol.cats.length, 381); assert.equal(LISTS.hepsiburada.cats.length, 156);
  const ty = listRate('trendyol', 'Saat Kordonu');
  assert.deepEqual([ty.rate, ty.path, ty.mp], [21.5, 'Aksesuar > Saat > Saat, Saat Kordonu', 'trendyol']);
  // Türkçe harf / büyük-küçük farkı ve yol biçimi ("Aksesuar > Saat Kordonu") önemsiz; ek mağaza aynı listeyi kullanır
  assert.equal(listRate('trendyol_2', 'SAAT KORDONU').rate, 21.5);
  assert.equal(listRate('trendyol', 'Aksesuar › Saat Kordonu').rate, 21.5);
  // Hepsiburada: KDV hariç 6 → kesilen %7,2
  assert.equal(listRate('hepsiburada', 'Gram Altın').rate, 7.2);
  // Aynı ada farklı oranlı iki satır (İkinci El: %12 / %17,5; HB Batarya: %25 / %15): tahmin yapılmaz
  assert.equal(listRate('trendyol', 'İkinci El'), null);
  assert.equal(listRate('hepsiburada', 'Batarya'), null);
  assert.equal(listRate('trendyol', 'Uydurma Kategori'), null);
  assert.equal(listRate('trendyol', ''), null);
  // Listesi olmayan kanallar (Trendyol Go, ikas, n11) hiç eşleşmez
  for (const c of ['trendyolgo', 'ikas1', 'n11', 'pttavm']) { assert.equal(mpOf(c), null); assert.equal(listRate(c, 'Saat Kordonu'), null); }
});

test('Trendyol ilanı kategori adını okur; oranı bilinmeyen ilana liste oranı yazılır (kanal / elle girilen oran korunur); siparişteki gerçek oran liste oranının yerine geçer', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = /inventory-and-price/.test(u) ? { content: [{ variants: [{ barcode: 'B1', quantity: 3 }] }], totalPages: 1 }
      : /products\/approved/.test(u) ? { totalPages: 1, content: [{ productMainId: 'P1', title: 'Kordon', category: { id: 1, name: 'Saat Kordonu' }, variants: [{ barcode: 'B1', stockCode: 'S1', price: { salePrice: 100, listPrice: 100 } }] }] } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const ls = await trendyol({ TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' }).fetchListings();
  assert.equal(ls[0].mpCategory, 'Saat Kordonu');

  const db = d1(); await init(db);
  const ins = (rid, cat, com, src) => db.prepare("INSERT INTO listings (channel, remote_id, name, mp_category, commission, commission_src) VALUES ('trendyol', ?, ?, ?, ?, ?)").bind(rid, rid, cat, com, src).run();
  await ins('B1', 'Saat Kordonu', null, null); await ins('B2', 'Saat Kordonu', 19, 'api'); await ins('B3', 'Saat Kordonu', 15, 'manual');
  await ins('B4', 'Uydurma', null, null); await ins('B5', 'Uydurma', 21.5, 'list'); // kategori değişti: eski liste oranı kalkar
  assert.equal(await applyListRates(db, 'trendyol'), 2);
  const get = async (rid) => ({ ...(await db.prepare("SELECT commission, commission_src FROM listings WHERE remote_id = ?").bind(rid).first()) });
  assert.deepEqual(await get('B1'), { commission: 21.5, commission_src: 'list' });
  assert.deepEqual(await get('B2'), { commission: 19, commission_src: 'api' });
  assert.deepEqual(await get('B3'), { commission: 15, commission_src: 'manual' });
  assert.deepEqual(await get('B4'), { commission: null, commission_src: null });
  assert.deepEqual(await get('B5'), { commission: null, commission_src: null });
  assert.equal(await applyListRates(db, 'trendyol'), 0, 'değişiklik yoksa yazılmaz');
  // Siparişin bildirdiği oran ilanın ana oranına işlenir (kaynak 'api') ama resmî liste oranının altına inmez: %18'lik satır (indirimli)
  // ana oranı %21,5'ten düşürmez; listeden yüksek gerçek oran (%22,5) ana oran olur
  await saveOrders(db, 'trendyol', [{ remoteId: 'O1', orderNumber: 'O1', orderedAt: Date.now() - D, status: 'delivered', total: 200, items: [{ lineId: '1', sku: 'S1', barcode: 'B1', name: 'Kordon', quantity: 1, unitPrice: 200, total: 200, remoteKey: 'B1', commission: 36 }] }]);
  assert.deepEqual(await get('B1'), { commission: 21.5, commission_src: 'api' });
  await saveOrders(db, 'trendyol', [{ remoteId: 'O1b', orderNumber: 'O1b', orderedAt: Date.now() - D, status: 'delivered', total: 200, items: [{ lineId: '1', sku: 'S1', barcode: 'B1', name: 'Kordon', quantity: 1, unitPrice: 200, total: 200, remoteKey: 'B1', commission: 45 }] }]);
  assert.deepEqual(await get('B1'), { commission: 22.5, commission_src: 'api' });
  // İlan senkronu kategori adını saklar ve liste oranını yazar
  await refreshListings(db, { id: 'trendyol', fetchListings: async () => [{ remoteId: 'B9', remoteProductId: 'P9', sku: 'S9', barcode: 'B9', name: 'Kordon 2', price: 50, stock: 1, mpCategory: 'Saat Kordonu' }] });
  assert.deepEqual({ ...(await db.prepare("SELECT mp_category, commission, commission_src FROM listings WHERE remote_id = 'B9'").first()) }, { mp_category: 'Saat Kordonu', commission: 21.5, commission_src: 'list' });
  // Listesi olmayan kanal (ikas): dokunulmaz
  assert.equal(await applyListRates(db, 'ikas1'), 0);
});

test('Komisyon indirimi: satır oranı olağan orandan (90 gün ortancası) ya da liste oranından ≥ 1 puan düşükse kazanç hesaplanır', () => {
  // olağan %21,5, kesilen %15 → 1000 TL'de 65 TL
  assert.deepEqual(lineDiscount({ commission: 150, total: 1000, quantity: 1 }, 21.5, null), { rate: 15, normal: 21.5, ref: 'usual', saved: 65 });
  // liste daha yüksekse liste referans alınır
  assert.equal(lineDiscount({ commission: 150, total: 1000, quantity: 1 }, 16, 21.5).ref, 'list');
  // 1 puandan az fark indirim sayılmaz; referans yoksa ya da oran bilinmiyorsa sonuç yok
  assert.equal(lineDiscount({ commission: 210, total: 1000, quantity: 1 }, 21.5, 21.5), null);
  assert.equal(lineDiscount({ commission: 150, total: 1000, quantity: 1 }, null, null), null);
  assert.equal(lineDiscount({ commission: null, total: 1000, quantity: 1 }, 21.5, null), null);
  // kısmi iade: kazanç kalan adede göre
  assert.equal(lineDiscount({ commission: 150, total: 1000, quantity: 2, returned_qty: 1 }, 21.5, null).saved, 32.5);
});

async function ordersDb() {
  const db = d1(); await init(db); resetChannels();
  await db.prepare("INSERT INTO listings (channel, remote_id, name, mp_category, commission, commission_src) VALUES ('trendyol', 'B1', 'Kordon', '', NULL, NULL), ('trendyol', 'B2', 'Saat kordonu', 'Saat Kordonu', NULL, NULL), ('hepsiburada', 'H1', 'Ürün', '', NULL, NULL)").run();
  const now = Date.now(), o = (no, at, key, total, com, extra = {}) => ({ remoteId: no, orderNumber: no, orderedAt: at, status: 'delivered', customer: 'A', total,
    items: [{ lineId: '1', sku: key, barcode: key, name: 'Ürün ' + key, quantity: extra.qty || 1, unitPrice: total / (extra.qty || 1), total, remoteKey: key, commission: com }] });
  // B1: olağan oran %21,5 (3 sipariş), son sipariş %15 (Trendyol komisyon indirimi)
  await saveOrders(db, 'trendyol', [o('A1', now - 40 * D, 'B1', 1000, 215), o('A2', now - 30 * D, 'B1', 1000, 215), o('A3', now - 20 * D, 'B1', 500, 107.5), o('A4', now - 2 * D, 'B1', 1000, 150),
    // B2: geçmiş yok, resmî liste %21,5; kesilen %18
    o('C1', now - 2 * D, 'B2', 200, 36)]);
  // Hepsiburada: oran hep aynı → indirim yok
  await saveOrders(db, 'hepsiburada', [o('H1', now - 30 * D, 'H1', 100, 21.6), o('H2', now - 20 * D, 'H1', 100, 21.6), o('H3', now - 10 * D, 'H1', 100, 21.6), o('H4', now - 2 * D, 'H1', 100, 21.6)]);
  return { db, now };
}
const loadOrder = async (db, id) => ({ ...(await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first()), items: (await db.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(id).all()).results });

test('Sipariş ayrıntısı ve dönem özeti: komisyon indirimi bulunur, Hepsiburada aynı orandaysa indirim yok', async () => {
  const { db, now } = await ordersDb();
  const a4 = await orderCommission(db, SET, await loadOrder(db, 'trendyol:A4'));
  assert.equal(a4.lines.length, 1);
  assert.deepEqual([a4.lines[0].normal, a4.lines[0].rate, a4.lines[0].ref, a4.saved], [21.5, 15, 'usual', 65]);
  const c1 = await orderCommission(db, SET, await loadOrder(db, 'trendyol:C1'));
  assert.deepEqual([c1.lines[0].normal, c1.lines[0].rate, c1.lines[0].ref, c1.saved], [21.5, 18, 'list', 7]);
  // Olağan oranlı sipariş ve Hepsiburada: indirim yok
  assert.equal((await orderCommission(db, SET, await loadOrder(db, 'trendyol:A2'))).lines.length, 0);
  assert.equal((await orderCommission(db, SET, await loadOrder(db, 'hepsiburada:H4'))).lines.length, 0);
  const r = await commissionCheck(db, SET, { from: now - 7 * D, to: now + 1 });
  assert.deepEqual([r.discounts.orders, r.discounts.lines, r.discounts.amount], [2, 2, 72]);
  assert.deepEqual(r.discounts.channels.trendyol, { orders: 2, amount: 72 });
  assert.equal(r.discounts.channels.hepsiburada, undefined);
  assert.equal(r.discounts.top[0].order_number, 'A4');
  // Liste sağlaması: B2'nin kanal oranı %18 (listeden düşük) → listeden yüksek uyarısı yok; 1 ilan eşleşti
  assert.equal(r.list.matched, 1); assert.equal(r.list.aboveCount, 0);
  // Kanal oranı listeden 0,5 puandan fazla yüksekse uyarı
  await db.prepare("UPDATE listings SET commission = 24, commission_src = 'api' WHERE remote_id = 'B2'").run();
  const r2 = await commissionCheck(db, SET, { from: now - 7 * D, to: now + 1 });
  assert.equal(r2.list.aboveCount, 1); assert.deepEqual([r2.list.above[0].rate, r2.list.above[0].list, r2.list.above[0].gap], [24, 21.5, 2.5]);
  // Listesi olmayan kanal seçilirse kontrol yapılmaz
  assert.equal((await commissionCheck(db, SET, { from: now - 7 * D, to: now + 1, channel: 'ikas1' })).supported, false);
  resetChannels();
});

test('Komisyon iadesi sayımı: panel komisyonuna yansımış kısım tekrar eklenmez', () => {
  assert.equal(countedCredit(40, 240, 240), 40);      // satır 240, pazaryeri 40 geri verdi → 40
  assert.equal(countedCredit(40, 240, 200), 0);       // panel zaten 200 saydı → 0
  assert.equal(countedCredit(40, 240, 220), 20);      // yarısı yansımış
  assert.equal(countedCredit(21.6, 64.8, 43.2), 0);   // HB kısmi iade: iade edilen adedin komisyonu panelde de düşüldü
  assert.equal(countedCredit(30, 0, 120), 30);        // pazaryerinin satış kaydı henüz yok → olduğu gibi
  assert.equal(countedCredit(-12, 240, 240), -12);    // ek komisyon (pozitif düzeltme) kârdan düşer
  assert.equal(countedCredit(0, 240, 240), 0);
});

async function creditDb() {
  const db = d1(); await init(db); resetChannels();
  const now = Date.now(), at = now - 5 * D;
  const o = (no, total, com, extra = {}) => ({ remoteId: no, orderNumber: no, orderedAt: at, status: extra.status || 'delivered', customer: 'A', total,
    items: [{ lineId: '1', sku: 'S', name: 'Ü', quantity: extra.qty || 1, unitPrice: total / (extra.qty || 1), total, remoteKey: 'S', commission: com }] });
  await saveOrders(db, 'trendyol', [o('T1', 1000, 240), o('T2', 1000, 240), o('TR', 1000, 240, { status: 'returned' })]);
  await saveOrders(db, 'hepsiburada', [o('H1', 300, 64.8, { qty: 3 }), o('H2', 500, 108)]);
  await db.prepare("UPDATE order_items SET returned_qty = 1 WHERE order_id = 'hepsiburada:H1'").run();
  let i = 0;
  const ins = (ch, no, type, raw, amount, commission = 0) => db.prepare(`INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, payment_date, due_date, paid, payment_id, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 0)`).bind(ch, 'r' + ++i, now - 2 * D, type, raw, no, amount, commission, now + 10 * D, now + 10 * D).run();
  // T1: Trendyol komisyonun 40 TL'sini geri verdi (komisyon düzeltmesi + eşi olan hakediş düzeltmesi)
  await ins('trendyol', 'T1', 'Satış', 'Satış', 760, 240); await ins('trendyol', 'T1', 'Komisyon düzeltme (−)', 'CommissionNegative', 0, -40); await ins('trendyol', 'T1', 'Hakediş düzeltme (+)', 'SellerRevenuePositive', 40, 0);
  await ins('trendyol', 'T2', 'Satış', 'Satış', 760, 240);
  // İade edilen siparişin düzeltmesi sayılmaz (komisyonu zaten sayılmıyor)
  await ins('trendyol', 'TR', 'Satış', 'Satış', 760, 240); await ins('trendyol', 'TR', 'İade', 'İade', -760, -240); await ins('trendyol', 'TR', 'Komisyon düzeltme (−)', 'CommissionNegative', 0, -10);
  // H1: 3 adetten 1'i iade; Hepsiburada iade edilen adedin komisyonunu "CommissionRefund" ile geri verdi (panelde zaten düşülmüş)
  await ins('hepsiburada', 'H1', 'Satış', 'Payment', 300); await ins('hepsiburada', 'H1', 'Komisyon', 'Commission', -64.8, 64.8);
  await ins('hepsiburada', 'H1', 'İade', 'Return', -100); await ins('hepsiburada', 'H1', 'Komisyon', 'CommissionRefund', 21.6, -21.6);
  // H2: kampanya ile komisyonun 21,6 TL'si geri verildi
  await ins('hepsiburada', 'H2', 'Satış', 'Payment', 500); await ins('hepsiburada', 'H2', 'Komisyon', 'Commission', -108, 108); await ins('hepsiburada', 'H2', 'Komisyon', 'CommissionRefund', 21.6, -21.6);
  return { db, now };
}

test('Komisyon iadesi: kâra bir kez eklenir (sipariş, dönem), mutabakatta fark sayılmaz; kısmi iadede çift sayılmaz', async () => {
  const { db, now } = await creditDb();
  const cr = await commissionCredits(db, SET, { from: now - 30 * D, to: now + 1 });
  assert.deepEqual(cr.get('trendyol:T1'), { channel: 'trendyol', credit: 40, counted: 40 });
  assert.deepEqual(cr.get('hepsiburada:H1'), { channel: 'hepsiburada', credit: 21.6, counted: 0 });
  assert.deepEqual(cr.get('hepsiburada:H2'), { channel: 'hepsiburada', credit: 21.6, counted: 21.6 });
  assert.equal(cr.has('trendyol:TR'), false); assert.equal(cr.has('trendyol:T2'), false);
  // Sipariş kârı: komisyon satırdaki gibi kalır, iade ayrı satır olarak hakedişe eklenir
  const t1 = await loadOrder(db, 'trendyol:T1'), base = orderProfit(t1, SET);
  const c = await orderCommission(db, SET, t1), p = orderProfit({ ...t1, comm_credit: c.counted }, SET);
  assert.equal(p.commission, 240); assert.equal(p.commCredit, 40); assert.equal(r(p.payout - base.payout), 40);
  // Dönem: kanal başına iade toplamı, hakediş ve kâr artar; komisyon basamağı değişmez
  const b = await breakdown(db, SET, { from: now - 30 * D, to: now + 1 });
  assert.equal(b.total.commCredit, 61.6); assert.equal(b.total.creditOrders, 2);
  assert.equal(b.channels.find((x) => x.channel === 'trendyol').commCredit, 40);
  assert.equal(b.total.commission, r(240 + 240 + 43.2 + 108));
  assert.ok(b.steps.some((s) => s.k === 'commCredit' && s.v === 61.6 && /pazaryeri karşıladı/.test(s.label)));
  // Mutabakat: hepsi uyumlu (iade hesaba katıldı), özet ayrıca verilir
  const rep = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1 });
  assert.equal(rep.diffs.length, 0, JSON.stringify(rep.diffs));
  assert.equal(rep.totals.checked, 5);
  assert.deepEqual(rep.totals.commissionCredit, { orders: 2, amount: 61.6 });
  // Dönem özeti
  const chk = await commissionCheck(db, SET, { from: now - 30 * D, to: now + 1 });
  assert.deepEqual([chk.credits.orders, chk.credits.amount], [2, 61.6]);
  resetChannels();
});

test('Komisyon iadesi: hakediş düzeltmesi henüz gelmediyse mutabakat farkı nedeniyle açıklanır; iade yokken eski davranış aynı', async () => {
  const { db, now } = await creditDb();
  // T1'in hakediş düzeltmesi (eşi) silinir: pazaryeri 40 TL'yi henüz ödemedi
  await db.prepare("DELETE FROM settlements WHERE raw_type = 'SellerRevenuePositive'").run();
  const rep = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1 });
  assert.equal(rep.diffs.length, 1);
  assert.equal(rep.diffs[0].order_number, 'T1'); assert.equal(rep.diffs[0].diff, -40); assert.equal(rep.diffs[0].credit, 40);
  assert.match(rep.diffs[0].reason, /^Komisyon iadesi \/ indirimi \(pazaryeri karşıladı\) 40 ₺ hesaba katıldı; kalan fark: /);
  // Düzeltme kayıtları silinince kâr ve mutabakat önceki gibi
  await db.prepare("DELETE FROM settlements WHERE type LIKE 'Komisyon düzeltme%' OR raw_type = 'CommissionRefund'").run();
  const b = await breakdown(db, SET, { from: now - 30 * D, to: now + 1 });
  assert.equal(b.total.commCredit, 0); assert.ok(!b.steps.some((s) => s.k === 'commCredit'));
  const rep2 = await settlementReport({ DB: db }, db, SET, { from: now - 30 * D, to: now + 1 });
  assert.deepEqual(rep2.totals.commissionCredit, { orders: 0, amount: 0 });
  // H1 kısmi iade: iade edilen adedin komisyonu henüz geri verilmedi (panel 43,2, pazaryeri 64,8) → gerçek fark, işaretlenir
  assert.deepEqual(rep2.diffs.map((x) => x.order_number).sort(), ['H1']);
  resetChannels();
});
const r = (v) => Math.round(v * 100) / 100;
