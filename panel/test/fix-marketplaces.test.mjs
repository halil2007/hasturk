// Pazaryeri bağlantı düzeltmeleri (regresyon): sıralama / partialUntil, gelir ve komisyon, çok paketli sipariş, sayfa sınırları,
// ilan ilan gönderim sonucu, saat dilimi. Ağa çıkmadan, örnek cevaplarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amazon } from '../src/channels/amazon.js';
import { pttavm, normPttOrder } from '../src/channels/pttavm.js';
import { trendyol } from '../src/channels/trendyol.js';
import { boyner } from '../src/channels/boyner.js';
import { pasaj } from '../src/channels/pasaj.js';
import { hepsiburada, hbTime } from '../src/channels/hepsiburada.js';
import { idefix } from '../src/channels/idefix.js';
import { koctas } from '../src/channels/koctas.js';
import { teknosa } from '../src/channels/teknosa.js';
import { n11 } from '../src/channels/n11.js';
import { ciceksepeti } from '../src/channels/ciceksepeti.js';
import { pazarama } from '../src/channels/pazarama.js';
import { trendyolgo } from '../src/channels/trendyolgo.js';

// Kısa beklemeler (kota için sleep) testte anında geçer
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 5000 ? ms : 0, ...a);

// routes: [regex, gövde | (url, opts) => gövde, yöntem?]; gövde { __status, body } olabilir; metin gövde XML / CSV olarak döner
function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} };
    calls.push(c);
    const hit = routes.find(([re, , m]) => re.test(c.url) && (!m || m === c.method));
    let out = hit ? (typeof hit[1] === 'function' ? hit[1](c.url, opts) : hit[1]) : { __status: 404, body: { message: 'yok' } };
    const status = out && out.__status ? out.__status : 200;
    if (out && out.__status) out = out.body;
    const text = typeof out === 'string';
    return new Response(text ? out : JSON.stringify(out ?? {}), { status, headers: { 'Content-Type': text ? 'text/xml' : 'application/json' } });
  };
  return calls;
}
const D = 864e5, H3 = 3 * 3600e3;

// ---------------------------------------------------------------- 1) Amazon
const AENV = { AMAZON_SELLER_ID: 'A1SELLER', AMAZON_CLIENT_ID: 'c', AMAZON_CLIENT_SECRET: 's', AMAZON_REFRESH_TOKEN: 'Atzr|r' };
test('Amazon: satır tutarından promosyon indirimi düşülür; 100+ siparişte eskiden yeniye, partialUntil son işlenen − 1 sn', async () => {
  const t0 = Date.parse('2026-10-01T00:00:00Z');
  const heads = Array.from({ length: 102 }, (_, i) => ({ AmazonOrderId: 'O' + i, OrderStatus: 'Unshipped', PurchaseDate: '2026-10-01T00:00:00Z', LastUpdateDate: new Date(t0 + (101 - i) * 60e3).toISOString() }));
  mock([
    [/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }],
    [/orderItems/, { payload: { OrderItems: [{ OrderItemId: '1', SellerSKU: 'S', QuantityOrdered: 2, ItemPrice: { Amount: '200.00' }, PromotionDiscount: { Amount: '30.00' } }] } }],
    [/\/orders\/v0\/orders\?/, { payload: { Orders: heads } }],
  ]);
  const out = await amazon(AENV, { id: 'amazon' }).fetchOrders(t0 - D, Date.now());
  assert.equal(out.length, 100);
  assert.equal(out[0].remoteId, 'O101', 'en eski güncellenen önce');
  assert.ok(!out.some((o) => o.remoteId === 'O0' || o.remoteId === 'O1'), 'en yeni ikisi sonraki senkrona kalır');
  assert.equal(out.partialUntil, t0 + 99 * 60e3 - 1000);
  assert.deepEqual([out[0].items[0].total, out[0].items[0].unitPrice], [170, 85]);
});

test('Amazon: DEFAULT kanalı olmayan (FBA) SKU stoğu gönderilmez; liste okunmadıysa SKU tek tek sorulur', async () => {
  const calls = mock([
    [/auth\/o2\/token/, { access_token: 'AT', expires_in: 3600 }],
    [/\/items\/A1SELLER\/[^?]+\?/, { status: 'ACCEPTED', issues: [] }, 'PATCH'],
    [/\/items\/A1SELLER\/FBA-2\?/, { sku: 'FBA-2', summaries: [{ marketplaceId: 'A33AVAJ2PDY3EV', productType: 'X' }], fulfillmentAvailability: [{ fulfillmentChannelCode: 'AMAZON_EU', quantity: 3 }] }],
    [/\/items\/A1SELLER\/MFN-2\?/, { sku: 'MFN-2', fulfillmentAvailability: [{ fulfillmentChannelCode: 'DEFAULT', quantity: 1 }] }],
    [/\/items\/A1SELLER\?/, { items: [
      { sku: 'FBA-1', summaries: [], fulfillmentAvailability: [{ fulfillmentChannelCode: 'AMAZON_EU', quantity: 4 }] },
      { sku: 'MFN-1', summaries: [], fulfillmentAvailability: [{ fulfillmentChannelCode: 'DEFAULT', quantity: 2 }] }] }],
  ]);
  const ch = amazon(AENV, { id: 'amazon' });
  const ls = await ch.fetchListings();
  assert.equal(ls[0].stock, 4, 'FBA stoğu okunur');
  await ch.pushStock([{ remoteId: 'FBA-1', stock: 9 }, { remoteId: 'MFN-1', stock: 9 }, { remoteId: 'FBA-2', stock: 9 }, { remoteId: 'MFN-2', stock: 9 }]);
  const patched = calls.filter((c) => c.method === 'PATCH').map((c) => decodeURIComponent(new URL(c.url).pathname.split('/').pop()));
  assert.deepEqual(patched, ['MFN-1', 'MFN-2']);
  assert.equal(calls.filter((c) => c.method === 'GET' && /\/items\/A1SELLER\/MFN-1/.test(c.url)).length, 0, 'listede görülen SKU yeniden sorulmaz');
});

// ---------------------------------------------------------------- 2) PttAVM
test('PttAVM: tek satırın iadesi siparişi iade yapmaz; hepsi iptal / iade ise iade; satır sonucu yalnız tamamlanınca kabul', async () => {
  const o = (sts) => normPttOrder({ siparisNo: 'P1', islemTarihi: '2026-10-05T14:30:00', siparisUrunler: sts.map((s, i) => ({ lineItemId: i + 1, toplamIslemAdedi: 1, kdvDahilToplamTutar: 10, siparisDurumu: s })) });
  assert.equal(o(['iade', 'gonderilmis']).status, 'shipped');
  assert.equal(o(['iade', 'kargo_yapilmasi_bekleniyor']).status, 'new');
  assert.equal(o(['iade', 'iptal']).status, 'returned');
  assert.equal(o(['iptal', 'iptal']).status, 'cancelled');
  assert.deepEqual(o(['iade', 'gonderilmis']).items.map((i) => i.status), ['returned', '']);
  mock([[/tracking-result/, { status: 'InProgress', progress: 50, productsSubTrackingResult: { productBasedInfos: [
    { barcode: 'B1', status: 'Completed' }, { barcode: 'B2', status: 'Failed', message: 'x' }, { barcode: 'B3', status: 'Waiting' }, { barcode: 'B4', status: 'Error' }, { barcode: 'B5', status: 'Success' }] } }]]);
  const st = await pttavm({ PTTAVM_API_KEY: 'k', PTTAVM_TOKEN: 't' }, { id: 'pttavm' }).pushStatus('T1');
  assert.deepEqual(st.items.map((x) => [x.key, x.ok]), [['B1', true], ['B2', false], ['B3', null], ['B4', false], ['B5', true]]);
});

test('PttAVM: sınıra takılmış görünen sipariş araması aralık bölünerek yeniden sorulur; bölünemezse partialUntil + uyarı', async () => {
  const until = Date.parse('2026-10-10T00:00:00Z'), since = until - 2 * D;
  const row = (n) => ({ siparisNo: 'S' + n, islemTarihi: '2026-10-09T10:00:00', siparisUrunler: [{ lineItemId: n, toplamIslemAdedi: 1, kdvDahilToplamTutar: 5, siparisDurumu: 'gonderilmis' }] });
  let calls = mock([[/orders\/search/, (u) => {
    const q = new URL(u).searchParams, a = Date.parse(q.get('startDate')), b = Date.parse(q.get('endDate'));
    return b - a > D ? Array.from({ length: 100 }, (_, i) => row(i)) : Array.from({ length: 60 }, (_, i) => row(a + i));
  }]]);
  const c = pttavm({ PTTAVM_API_KEY: 'k', PTTAVM_TOKEN: 't' }, { id: 'pttavm' });
  let out = await c.fetchOrders(since, until);
  assert.equal(calls.length, 3, '2 günlük aralık sınırda → iki 1 günlük aralık');
  assert.equal(out.length, 120); assert.equal(out.partialUntil, undefined);
  calls = mock([[/orders\/search/, () => Array.from({ length: 100 }, (_, i) => row(i))]]);
  out = await c.fetchOrders(since, until);
  assert.equal(calls.length, 17, 'en fazla 16 ek istek');
  assert.ok(out.partialUntil >= since && out.partialUntil < until);
  assert.match(out.warnings[0], /sınıra takılmış/);
});

// ---------------------------------------------------------------- 3) Trendyol
const TENV = { TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
const tpkg = (id, lines, extra = {}) => ({ shipmentPackageId: id, orderNumber: '900', orderDate: 1790000000000 + H3, status: 'Created', lines, ...extra });
test('Trendyol: satıcı geliri brüt − satıcı indirimi (TY indirimi satıcıya ödenir), komisyon oranı → KDV dahil tutar, boş shipBy null', async () => {
  mock([[/\/v2\/orders\?/, { totalPages: 1, content: [tpkg(1, [
    // 2 adet: brüt 350, satıcı indirimi 35, TY indirimi 50 (adet başı) → müşteri 265, satıcı geliri 315; komisyon %13
    { lineId: 11, quantity: 2, barcode: 'B1', lineGrossAmount: 350, lineSellerDiscount: 35, lineTyDiscount: 50, lineUnitPrice: 265, commission: 13 },
    { lineId: 12, quantity: 1, barcode: 'B2', lineUnitPrice: 40 }], { packageGrossAmount: 740, packageSellerDiscount: 70, packageTyDiscount: 100, packageTotalPrice: 570 })] }]]);
  const [o] = await trendyol(TENV, { id: 'trendyol' }).fetchOrders(Date.now() - D, Date.now());
  assert.deepEqual([o.items[0].unitPrice, o.items[0].total], [315, 630]);
  assert.equal(o.items[0].commission, Math.round(630 * 0.13 * 1.2 * 100) / 100);
  assert.deepEqual([o.items[1].unitPrice, o.items[1].commission], [40, undefined], 'alan yoksa net birim fiyat, komisyon yok');
  assert.equal(o.total, 670);
  assert.equal(o.shipBy, null, 'agreedDeliveryDate yoksa Infinity değil');
});

test('Trendyol: v2 404 verirse yalnız o okumada eski adrese düşülür, sonraki okuma yine v2 dener; 50 sayfa sınırında partialUntil', async () => {
  const calls = mock([[/\/v2\/orders\?/, { __status: 404, body: { message: 'Not Found' } }], [/\/sellers\/42\/orders\?/, (u) => ({ totalPages: 2, content: [tpkg(Number(new URL(u).searchParams.get('page')) + 1, [])] })]]);
  const ch = trendyol(TENV, { id: 'trendyol' });
  await ch.fetchOrders(Date.now() - D, Date.now());
  assert.deepEqual(calls.map((c) => (/\/v2\//.test(c.url) ? 'v2' : 'eski')), ['v2', 'eski', 'eski'], 'aynı listenin 2. sayfası doğrudan eski adresten');
  await ch.fetchOrders(Date.now() - D, Date.now());
  assert.equal(calls[3].url.includes('/v2/'), true, 'kalıcı geçilmez');
  mock([[/\/v2\/orders\?/, (u) => ({ totalPages: 99, content: [tpkg(Number(new URL(u).searchParams.get('page')) + 1, [])] })]]);
  const since = Date.now() - D, out = await ch.fetchOrders(since, Date.now());
  assert.equal(out.partialUntil, since);
  assert.match(out.warnings.join(' '), /10\.000/);
});

// ---------------------------------------------------------------- 4) Boyner / Pasaj
const bpkg = (o = {}) => ({ id: 1, orderNumber: 'B-1', orderDate: Date.parse('2026-09-20T09:00:00Z'), lastModifiedDate: Date.parse('2026-10-09T09:00:00Z'), status: 'Shipped', totalPrice: 100,
  lines: [{ id: 1, barcode: 'X1', quantity: 1, price: 100 }], ...o });
for (const [name, make, env] of [['Boyner', boyner, { BOYNER_SELLER_ID: '555', BOYNER_API_KEY: 'k', BOYNER_API_SECRET: 's' }], ['Pasaj', pasaj, { PASAJ_URL: 'https://pasaj.example/api', PASAJ_SELLER_ID: '555', PASAJ_API_KEY: 'k', PASAJ_API_SECRET: 's' }]]) {
  test(`${name}: değişen paketin siparişi numarayla okunur (diğer paketlerin satırları düşmez); yeni sipariş okunmaz; sınırda partialUntil`, async () => {
    const since = Date.parse('2026-10-09T00:00:00Z'), until = Date.parse('2026-10-10T00:00:00Z');
    const calls = mock([[/\/orders\?/, (u) => {
      const q = new URL(u).searchParams;
      if (q.get('orderNumber') === 'B-1') return { content: [bpkg(), bpkg({ id: 2, status: 'Created', totalPrice: 50, lines: [{ id: 2, barcode: 'X2', quantity: 1, price: 50 }] })] };
      if (q.get('orderNumber')) return { content: [] };
      return { totalPages: 1, content: [bpkg(), bpkg({ id: 7, orderNumber: 'NEW', orderDate: since + 3600e3, status: 'Created' })] };
    }]]);
    const out = await make(env, { id: name.toLowerCase() }).fetchOrders(since, until);
    const o = out.find((x) => x.remoteId === 'B-1');
    assert.deepEqual(o.items.map((i) => i.lineId), ['1', '2']);
    assert.equal(o.total, 150); assert.equal(o.status, 'new', 'en geride kalan paket');
    assert.ok(out.find((x) => x.remoteId === 'NEW'));
    assert.deepEqual(calls.map((c) => new URL(c.url).searchParams.get('orderNumber')).filter(Boolean), ['B-1'], 'aralıkta oluşturulan sipariş numarayla okunmaz');
    assert.equal(out.partialUntil, undefined);
    // 100'den fazla değişen sipariş: en eski değişen 100 okunur, kalanı sonraki senkrona
    mock([[/\/orders\?/, (u) => {
      const q = new URL(u).searchParams;
      if (q.get('orderNumber')) return { content: [] };
      return { totalPages: 1, content: Array.from({ length: 102 }, (_, i) => bpkg({ id: i + 1, orderNumber: 'O' + i, lastModifiedDate: since + i * 60e3 })) };
    }]]);
    const big = await make(env, {}).fetchOrders(since, until);
    assert.equal(big.length, 100); assert.ok(!big.some((x) => x.remoteId === 'O100' || x.remoteId === 'O101'));
    assert.equal(big.partialUntil, since + 99 * 60e3 - 1000);
  });
}

// ---------------------------------------------------------------- 5) Hepsiburada
const HB = () => hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'hasturk_dev' }, { id: 'hepsiburada' });
test('Hepsiburada: saat dilimsiz tarih Türkiye saati; ISO / Z / ofsetli olduğu gibi', () => {
  assert.equal(hbTime('2021-02-02T11:09:39'), Date.parse('2021-02-02T08:09:39Z'));
  assert.equal(hbTime('2021-02-02 11:09'), Date.parse('2021-02-02T08:09:00Z'));
  assert.equal(hbTime('2021-02-02T11:09:39.123'), Date.parse('2021-02-02T08:09:39.123Z'));
  assert.equal(hbTime('2021-02-02'), Date.parse('2021-02-01T21:00:00Z'));
  assert.equal(hbTime('2021-02-02T11:09:39Z'), Date.parse('2021-02-02T11:09:39Z'));
  assert.equal(hbTime('2021-02-02T11:09:39+01:00'), Date.parse('2021-02-02T10:09:39Z'));
  assert.equal(hbTime(''), 0); assert.equal(hbTime('x'), 0);
});

test('Hepsiburada: oransız komisyon adet başı sayılınca %35\'i aşarsa satır toplamı; oransız 0 → bilinmiyor; sipariş tarihi Türkiye saati', async () => {
  const run = async (x) => {
    mock([[/\/orders\/merchantId\/M\?/, (u) => (!/offset=[1-9]/.test(u) ? { items: [{ id: 'L1', orderNumber: 'S1', orderDate: '2026-10-09T10:00:00', merchantSku: 'A', quantity: 2, totalPrice: { amount: 1000 }, ...x }] } : { items: [] })]]);
    return (await HB().fetchOrders(Date.now() - D, Date.now())).find((o) => o.orderNumber === 'S1');
  };
  assert.equal((await run({ commission: { amount: 85 } })).items[0].commission, 204, '2 × 85 = 170 (%17) → × 1,2');
  assert.equal((await run({ commission: { amount: 200 } })).items[0].commission, 240, '2 × 200 = %40 olanaksız → satır toplamı 200');
  assert.equal((await run({ commission: { amount: 0 } })).items[0].commission, null);
  assert.equal((await run({ commission: { amount: 0 }, commissionRate: 10 })).items[0].commission, 120, 'oran varsa ondan');
  assert.equal((await run({})).orderedAt, Date.parse('2026-10-09T07:00:00Z'));
});

test('Hepsiburada: kargo / teslim / iptal kayıtları eskiden yeniye; 200 ayrıntı sınırında partialUntil ilk okunamayan kaydın zamanı', async () => {
  const now = Date.now(), since = now - 2 * D, iso = (t) => new Date(t).toISOString();
  const shipped = Array.from({ length: 50 }, (_, i) => ({ PackageNumber: 'P' + i, OrderNumber: 'S' + i, ShippedDate: iso(since + 1000e3 + i * 60e3) }));
  const delivered = Array.from({ length: 50 }, (_, i) => ({ PackageNumber: 'Q' + i, OrderNumber: 'D' + i, DeliveredDate: iso(since + 2000e3 + i * 60e3) }));
  const cancelled = Array.from({ length: 50 }, (_, i) => ({ orderNumber: 'C' + i, lineItemId: 'x', cancelDate: iso(since + 500e3 + i * 60e3) }));
  const page = (rows) => (u) => { const off = Number(new URL(u).searchParams.get('offset')); return off ? [] : rows; };
  const big = Array.from({ length: 160 }, (_, i) => ({ PackageNumber: 'R' + i, OrderNumber: 'R' + i, ShippedDate: iso(since + 100e3 + i * 1e3) }));
  let detail = 0;
  mock([
    [/\/orders\/merchantId\/M\?/, { items: [] }],
    [/\/packages\/merchantId\/M\?/, []],
    [/\/packages\/merchantId\/M\/shipped/, page([...shipped, ...big].slice(0, 50))],
    [/\/packages\/merchantId\/M\/delivered/, page(delivered)],
    [/\/orders\/merchantId\/M\/cancelled/, page([...cancelled, ...big.slice(50, 100).map((x) => ({ orderNumber: x.OrderNumber, lineItemId: 'x', cancelDate: x.ShippedDate }))])],
    [/\/ordernumber\//, (u) => { detail++; const no = decodeURIComponent(u.split('/').pop()); return { orderNumber: no, orderDate: iso(since), items: [{ id: 'L-' + no, quantity: 1, totalPrice: { amount: 10 }, orderNumber: no }] }; }],
  ]);
  // 50 kargo + 50 teslim + 100 iptal kaydı = 200 farklı sipariş: hepsi okunur, sınıra takılmaz
  let out = await HB().fetchOrders(since, now);
  assert.equal(detail, 200); assert.equal(out.partialUntil, undefined);
  // 250 farklı sipariş: eskiden yeniye 200 okunur; imleç ilk okunamayanın zamanında
  const more = Array.from({ length: 50 }, (_, i) => ({ PackageNumber: 'Z' + i, OrderNumber: 'Z' + i, DeliveredDate: iso(since + 5000e3 + i * 60e3) }));
  detail = 0;
  mock([
    [/\/orders\/merchantId\/M\?/, { items: [] }],
    [/\/packages\/merchantId\/M\?/, []],
    [/\/packages\/merchantId\/M\/shipped/, page(shipped)],
    [/\/packages\/merchantId\/M\/delivered/, (u) => { const off = Number(new URL(u).searchParams.get('offset')); return off === 0 ? more : off === 50 ? delivered : []; }],
    [/\/orders\/merchantId\/M\/cancelled/, page([...cancelled, ...big.slice(0, 50).map((x) => ({ orderNumber: x.OrderNumber, lineItemId: 'x', cancelDate: x.ShippedDate }))])],
    [/\/ordernumber\//, (u) => { detail++; const no = decodeURIComponent(u.split('/').pop()); return { orderNumber: no, orderDate: iso(since), items: [{ id: 'L-' + no, quantity: 1, totalPrice: { amount: 10 }, orderNumber: no }] }; }],
  ]);
  out = await HB().fetchOrders(since, now);
  assert.equal(detail, 200);
  assert.ok(!out.some((o) => o.orderNumber === 'Z49'), 'en yeni kayıtlar sonraki senkrona');
  assert.ok(out.some((o) => o.orderNumber === 'R0'), 'en eski kayıtlar okunur');
  assert.equal(out.partialUntil, since + 5000e3 - 1000);
});

// ---------------------------------------------------------------- 6) idefix
test('idefix: komisyon 0 / boş → null; satır tutarının %0,5–%60 dışı → null; sipariş sayfa sınırında partialUntil', async () => {
  const it = (c) => ({ id: 'L' + c, barcode: 'B', quantity: 1, price: 100, discountedTotalPrice: 100, ...(c === undefined ? {} : { commissionAmount: c }) });
  const calls = mock([[/\/oms\/16705\/list/, (u) => ({ items: [{ id: 1, status: 'shipment_created', items: [it(0), it(undefined), it(18), it(0.1), it(80)] }], pageCount: 1 })]]);
  const ch = idefix({ IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's', IDEFIX_VENDOR_ID: '16705' }, { id: 'idefix' });
  const [o] = await ch.fetchOrders(Date.now() - D, Date.now());
  assert.deepEqual(o.items.map((i) => i.commission), [null, null, 18, null, null]);
  assert.equal(calls.length, 1);
  mock([[/\/oms\/16705\/list/, (u) => ({ items: [{ id: Number(new URL(u).searchParams.get('page')), status: 'shipment_created', items: [] }], pageCount: 500 })]]);
  const since = Date.now() - D, out = await ch.fetchOrders(since, Date.now());
  assert.equal(out.length, 100); assert.equal(out.partialUntil, since); assert.match(out.warnings[0], /en yeni 100/);
});

// ---------------------------------------------------------------- 7 / 9) Koçtaş / Teknosa (Mirakl)
for (const [name, make, env] of [['Koçtaş', koctas, { KOCTAS_URL: 'https://koctas-prod.mirakl.net', KOCTAS_API_KEY: 'k' }], ['Teknosa', teknosa, { TEKNOSA_API_KEY: 'k' }]]) {
  test(`${name}: satır komisyonu (fee + KDV), INCIDENT durumları, bilinmeyen durum yeni değil, REFUNDED satır iade`, async () => {
    const ord = (st, lines) => ({ order_id: 'O-' + st, order_state: st, created_date: '2026-10-01T09:00:00Z', total_price: 100, order_lines: lines || [{ order_line_id: 'L1', offer_sku: 'S1', quantity: 2, price: 100, price_unit: 50, order_line_state: st }] });
    mock([[/\/api\/orders\?/, { total_count: 5, orders: [
      ord('SHIPPED', [{ order_line_id: 'L1', offer_sku: 'S1', quantity: 2, price: 100, commission_fee: 15, commission_vat: 3, order_line_state: 'SHIPPED' },
        { order_line_id: 'L2', offer_sku: 'S2', quantity: 1, price: 40, commission_fee: 5, commission_taxes: [{ amount: 1, code: 'TAXDEFAULT' }], order_line_state: 'REFUNDED' },
        { order_line_id: 'L3', offer_sku: 'S3', quantity: 1, price: 40, total_commission: 7.2, order_line_state: 'SHIPPED' }]),
      ord('INCIDENT_OPEN'), ord('INCIDENT_CLOSED'), ord('SOME_NEW_STATE'), ord('REFUNDED')] }]]);
    const list = await make(env, { id: 'x' }).fetchOrders(0, Date.now());
    const by = Object.fromEntries(list.map((o) => [o.remoteStatus, o]));
    assert.deepEqual(by.SHIPPED.items.map((i) => [i.commission, i.status]), [[18, ''], [6, 'returned'], [7.2, '']]);
    assert.equal(by.INCIDENT_OPEN.status, 'shipped'); assert.equal(by.INCIDENT_CLOSED.status, 'shipped');
    assert.equal(by.SOME_NEW_STATE.status, 'processing');
    assert.equal(by.REFUNDED.status, 'returned'); assert.equal(by.REFUNDED.items[0].status, 'returned');
    assert.equal(by.INCIDENT_OPEN.items[0].commission, undefined, 'komisyon alanı yoksa tahmin');
  });

  test(`${name}: bir kısmı bulunamayan gönderim {done, errors, refs} döner; OF02 / OF03 ile reddedilen satırlar okunur`, async () => {
    const offer = { shop_sku: 'S1', product_sku: 'P1', price: 10, quantity: 1, state_code: '11' };
    const calls = mock([
      [/\/api\/offers\/imports\/77\/error_report/, 'shop_sku;price;quantity;error-line;error-message\nS1;10;3;1;"Fiyat; kategori sınırı dışında"\n'],
      [/\/api\/offers\/imports\/77/, { import_id: 77, import_status: 'COMPLETE', lines_in_error: 1, lines_in_success: 0 }],
      [/\/api\/offers\/imports\/78/, { import_id: 78, import_status: 'RUNNING' }],
      [/\/api\/offers\?.*sku=S1/, { total_count: 1, offers: [offer] }],
      [/\/api\/offers\?/, { total_count: 0, offers: [] }],
      [/\/api\/offers$/, { import_id: 77 }, 'POST'],
    ]);
    const ch = make(env, { id: 'x' });
    const r = await ch.pushStock([{ remoteId: 'S1', stock: 3 }, { remoteId: 'YOK', stock: 1 }]);
    assert.deepEqual(r.done, ['S1']); assert.deepEqual(r.refs, ['77']);
    assert.deepEqual(r.errors.map((x) => x.remoteId), ['YOK']);
    assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
    await assert.rejects(ch.pushStock([{ remoteId: 'YOK', stock: 1 }]), /1 teklif bulunamadı/, 'hiçbiri gönderilemezse hata');
    assert.deepEqual(await ch.pushStatus('77'), { done: true, items: [{ key: 'S1', ok: false, error: 'Fiyat; kategori sınırı dışında' }] });
    assert.deepEqual(await ch.pushStatus('78'), { done: false, items: [] });
  });
}

// ---------------------------------------------------------------- 8) N11
test('N11: sorular durum süzgeci boş (tüm sorular) istenir, cevaplanan soru güncellenir; boş süzgeç reddedilirse açık sorular; SOAP http() üzerinden', async () => {
  const xml = '<x><result><status>success</status></result><productQuestions><productQuestion><id>1</id><question>A?</question><answer>Evet</answer></productQuestion><productQuestion><id>2</id><question>B?</question></productQuestion></productQuestions></x>';
  let calls = mock([[/productService/, xml]]);
  const ch = n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n11' });
  const r = await ch.questions({ since: Date.now() - D, until: Date.now() });
  assert.match(calls[0].body, /<status><\/status>/);
  assert.ok(calls[0].headers['User-Agent'], 'util http() kimliği eklenir');
  assert.deepEqual(r.items.map((q) => [q.remoteId, q.status, q.answer]), [['1', 'answered', 'Evet'], ['2', 'waiting', null]]);
  calls = mock([[/productService/, (u, o) => (/<status><\/status>/.test(o.body) ? { __status: 500, body: '<s:Envelope><s:Body><s:Fault><faultstring>status zorunlu</faultstring></s:Fault></s:Body></s:Envelope>' } : xml)]]);
  const c2 = n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n11' });
  assert.equal((await c2.questions({ since: Date.now() - D })).items.length, 2);
  await c2.questions({ since: Date.now() - D });
  assert.deepEqual(calls.map((c) => /<status>OPEN<\/status>/.test(c.body)), [false, true, true], 'reddedilince bu bağlantıda yalnız açık sorular');
  mock([[/productService/, { __status: 500, body: '<s:Envelope><s:Body><s:Fault><faultstring>Yetkisiz</faultstring></s:Fault></s:Body></s:Envelope>' }]]);
  await assert.rejects(c2.answer({ remote_id: '1' }, 'x'), /N11 SaveProductAnswer: HTTP 500 Yetkisiz/);
});

// ---------------------------------------------------------------- 10) Çiçeksepeti
test('Çiçeksepeti: iptallerin okunamadığı bir kez uyarılır; stok / fiyat batchId refs olarak döner', async () => {
  mock([[/GetOrders/, { supplierOrderListWithBranch: [] }], [/price-and-stock/, { batchId: 'b-9' }]]);
  const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'k' }, { id: 'ciceksepeti' });
  const a = await ch.fetchOrders(Date.now() - D, Date.now());
  assert.match(a.warnings[0], /iptal/);
  const b = await ch.fetchOrders(Date.now() - D, Date.now());
  assert.equal(b.warnings, undefined);
  assert.deepEqual(await ch.pushStock([{ remoteId: 'S', stock: 1 }]), { refs: ['b-9'] });
});

// ---------------------------------------------------------------- 11) Sayfa sınırları
test('Sayfa sınırına takılan sipariş okuması imleci ilerletmez (partialUntil): Çiçeksepeti, Pazarama, N11, Trendyol Go', async () => {
  const since = Date.now() - D, until = Date.now();
  mock([[/GetOrders/, (u, o) => ({ supplierOrderListWithBranch: Array.from({ length: 100 }, (_, i) => ({ orderId: `${JSON.parse(o.body).page}-${i}`, orderItemId: i, quantity: 1, totalPrice: 1 })) })]]);
  const cs = await ciceksepeti({ CICEKSEPETI_API_KEY: 'k' }, { id: 'c' }).fetchOrders(since, until);
  assert.equal(cs.partialUntil, since); assert.match(cs.warnings.join(' '), /5\.000/);

  mock([[/connect\/token/, { data: { accessToken: 't', expiresIn: 3600 } }], [/getOrdersForApi/, (u, o) => ({ success: true, data: Array.from({ length: 100 }, (_, i) => ({ orderNumber: `${JSON.parse(o.body).pageNumber}-${i}`, items: [] })) })]]);
  const pz = await pazarama({ PAZARAMA_CLIENT_ID: 'c', PAZARAMA_CLIENT_SECRET: 's' }, { id: 'p' }).fetchOrders(since, until);
  assert.equal(pz.partialUntil, since);

  mock([[/shipmentPackages/, (u) => ({ totalPages: 99, content: [{ id: Number(new URL(u).searchParams.get('page')), orderNumber: 'N' + new URL(u).searchParams.get('page'), shipmentPackageStatus: 'Created', lines: [] }] })]]);
  const nn = await n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n' }).fetchOrders(since, until);
  assert.equal(nn.length, 50); assert.equal(nn.partialUntil, since);

  mock([[/\/packages\?/, (u) => ({ totalPages: 999, content: Array.from({ length: 50 }, (_, i) => ({ id: `${new URL(u).searchParams.get('page')}-${i}`, orderNumber: `${new URL(u).searchParams.get('page')}-${i}`, packageStatus: 'Created', lines: [] })) })]]);
  const tg = await trendyolgo({ TRENDYOLGO_SUPPLIER_ID: '1', TRENDYOLGO_API_KEY: 'k', TRENDYOLGO_API_SECRET: 's', TRENDYOLGO_STORE_ID: '2' }, { id: 't' }).fetchOrders(since, until);
  assert.equal(tg.partialUntil, since); assert.match(tg.warnings[0], /en yeni 2000/);

  // Son sayfa kısa geldiyse sınır sayılmaz
  mock([[/shipmentPackages/, { totalPages: 1, content: [] }]]);
  assert.equal((await n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n' }).fetchOrders(since, until)).partialUntil, undefined);
});
