// ikas düzeltmeleri: çok lokasyonlu mağazada lokasyon seçilmeden stok işlemi yapılmaz (siparişler sürer), silinmiş lokasyon,
// satış kanalı okunamayan sipariş, updatedAt sıralı okuma + partialUntil, kapıda ödeme işareti, sınırlı ikiye bölme
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ikas } from '../src/channels/ikas.js';

const R = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;
function mock(fn) {
  const bodies = [];
  globalThis.fetch = async (url, o = {}) => {
    if (/oauth\/token/.test(String(url))) return R({ access_token: 'T', expires_in: 3600 });
    const b = JSON.parse(o.body); bodies.push(b);
    return R(fn(b));
  };
  return bodies;
}
const env = (x = {}) => ({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c', IKAS1_MERCHANT_ID: 'm', ...x });
const prod = { listProduct: { hasNext: false, data: [{ id: 'p1', name: 'A', variants: [{ id: 'v1', sku: 'A', isActive: true, prices: [{ sellPrice: 1 }], stocks: [{ stockCount: 3, stockLocationId: 'A' }, { stockCount: 4, stockLocationId: 'B' }] }] }] } };
const order = (id, extra = {}) => ({ id, orderNumber: id, orderedAt: 1, status: 'CREATED', orderLineItems: [], orderPackages: [], ...extra });
const data = (locs) => (b) => ({ data: /listStockLocation/.test(b.query) ? { listStockLocation: locs } : /listProduct/.test(b.query) ? prod
  : /listOrder/.test(b.query) ? { listOrder: { hasNext: false, data: [order('o1')] } } : /listVariantType/.test(b.query) ? { listVariantType: [] } : /listCategory/.test(b.query) ? { listCategory: [] } : { saveProductStockLocations: true } });

test('ikas: birden çok lokasyon ve seçim yok → stok gönderimi / okuması hata verir, hiçbir depoya yazılmaz; siparişler alınır', async () => {
  try {
    const bodies = mock(data([{ id: 'A', name: 'Depo' }, { id: 'B', name: 'Mağaza' }, { id: 'X', deleted: true }]));
    const ch = ikas(env(), 'IKAS1_', { id: 'ikas1' });
    await assert.rejects(() => ch.pushStock([{ remoteId: 'v1', remoteProductId: 'p1', stock: 5 }]), /birden fazla stok lokasyonu var; Entegrasyonlar → ikas'tan stok lokasyonunu seçin/);
    await assert.rejects(() => ch.fetchListings(), /birden fazla stok lokasyonu/);
    assert.ok(!bodies.some((b) => /saveProductStockLocations/.test(b.query)), 'hiçbir lokasyona yazılmadı');
    const orders = await ch.fetchOrders(0, 10);
    assert.equal(orders.length, 1, 'siparişler etkilenmez');
  } finally { globalThis.fetch = realFetch; }
});

test('ikas: seçilen lokasyon silinmişse stok okunmaz ve gönderilmez; tek lokasyonda o kullanılır', async () => {
  try {
    mock(data([{ id: 'A', name: 'Depo', deleted: true }, { id: 'B', name: 'Mağaza' }]));
    const ch = ikas(env({ IKAS1_STOCK_LOCATION_ID: 'A' }), 'IKAS1_', { id: 'ikas1' });
    await assert.rejects(() => ch.fetchListings(), /seçili stok lokasyonu \(A\) bulunamadı ya da silinmiş/);
    await assert.rejects(() => ch.pushStock([{ remoteId: 'v1', remoteProductId: 'p1', stock: 5 }]), /silinmiş/);
    const bodies = mock(data([{ id: 'B', name: 'Mağaza' }, { id: 'A', deleted: true }]));
    const one = ikas(env(), 'IKAS1_', { id: 'ikas1' });
    assert.deepEqual((await one.pushStock([{ remoteId: 'v1', remoteProductId: 'p1', stock: 5 }])).done, ['v1']);
    assert.equal(bodies.find((b) => /saveProductStockLocations/.test(b.query)).variables.input.productStockLocationInputs[0].stockLocationId, 'B');
    assert.equal((await one.fetchListings())[0].stock, 4, 'tek lokasyonun stoğu okunur');
  } finally { globalThis.fetch = realFetch; }
});

test('ikas: satış kanalı seçiliyken kanalı okunamayan sipariş alınmaz ve uyarı verilir; kapıda ödeme işaretlenir', async () => {
  try {
    mock(() => ({ data: { listOrder: { hasNext: false, data: [order('a', { salesChannelId: 'SC' }), order('b', { salesChannelId: 'OTHER' }), order('c'),
      order('d', { salesChannelId: 'SC', paymentMethods: [{ type: 'CASH_ON_DELIVERY' }] })] } } }));
    const list = await ikas(env({ IKAS1_SALES_CHANNEL_ID: 'SC' }), 'IKAS1_', { id: 'ikas1' }).fetchOrders(0, 10);
    assert.deepEqual(list.map((o) => o.remoteId), ['a', 'd']);
    assert.match(list.warnings.join(' '), /1 siparişin satış kanalı okunamadı/);
    assert.equal(list.find((o) => o.remoteId === 'd').cod, true);
    assert.ok(!list.find((o) => o.remoteId === 'a').cod);
  } finally { globalThis.fetch = realFetch; }
});

test('ikas: siparişler updatedAt sıralı okunur; aralık bitmezse partialUntil son okunan güncelleme; sıralama yoksa aralığın başı', async () => {
  const realNow = Date.now;
  let fake = realNow();
  Date.now = () => (fake += 1000); // istek aralığı beklemesi (GAP) atlanır
  try {
    let n = 0;
    const bodies = mock(() => ({ data: { listOrder: { hasNext: true, data: [order('o' + n, { updatedAt: 1000 + n++ })] } } }));
    const out = await ikas(env(), 'IKAS1_', { id: 'ikas1' }).fetchOrders(500, 99999);
    assert.match(bodies[1].query, /sort: "updatedAt"/);
    assert.equal(out.partialUntil, 1000 + n - 1, 'son okunan satırın güncellenme zamanı');
    // Şema sıralamayı kabul etmezse sırasız okunur, imleç aralığın başında kalır
    const b2 = mock((b) => (/sort/.test(b.query) ? { errors: [{ message: 'Unknown argument "sort" on field "listOrder"' }] } : { data: { listOrder: { hasNext: true, data: [order('x', { updatedAt: 2000 })] } } }));
    const out2 = await ikas(env(), 'IKAS1_', { id: 'ikas1' }).fetchOrders(500, 99999);
    assert.equal(out2.partialUntil, 500);
    assert.ok(b2.some((b) => /listOrder/.test(b.query) && !/sort/.test(b.query)));
  } finally { Date.now = realNow; globalThis.fetch = realFetch; }
});

test('ikas: tüm isteğe ait GraphQL hatası tek tek bölünmez (az istekle atılır); bölme istek sayısı sınırlı; bütçe hatası atılır', async () => {
  try {
    let calls = 0;
    mock((b) => { if (/listStockLocation/.test(b.query)) return { data: { listStockLocation: [{ id: 'A' }] } }; calls++; return { errors: [{ message: 'Field "x" is not defined by type "SaveStockLocationsInput"' }] }; });
    const items = Array.from({ length: 100 }, (_, i) => ({ remoteId: 'v' + i, remoteProductId: 'p', stock: 1 }));
    await assert.rejects(() => ikas(env(), 'IKAS1_', { id: 'ikas1' }).pushStock(items), /not defined/);
    assert.ok(calls <= 5, `tüm istek hatası ${calls} istekte anlaşıldı`);
    // Her ilan ayrı hata verirse (farklı mesaj) en çok ~60 bölme isteği; kalanlar hatalı yazılır
    calls = 0;
    mock((b) => { if (/listStockLocation/.test(b.query)) return { data: { listStockLocation: [{ id: 'A' }] } }; calls++;
      return { errors: [{ message: 'bad ' + b.variables.input.productStockLocationInputs.map((x) => x.variantId).join(',') }] }; });
    const r = await ikas(env(), 'IKAS1_', { id: 'ikas1' }).pushStock(Array.from({ length: 300 }, (_, i) => ({ remoteId: 'v' + i, remoteProductId: 'p', stock: 1 })));
    assert.ok(calls <= 70, `${calls} istek`);
    assert.equal(r.done.length + r.errors.length, 300);
    // İstek bütçesi doldu: ilan hatası sayılmaz, atılır
    mock((b) => { if (/listStockLocation/.test(b.query)) return { data: { listStockLocation: [{ id: 'A' }] } }; throw Object.assign(new Error('bütçe'), { budget: true }); });
    await assert.rejects(() => ikas(env(), 'IKAS1_', { id: 'ikas1' }).pushStock(items.slice(0, 4)), (e) => e.budget === true || /bütçe|sınırı/.test(e.message));
  } finally { globalThis.fetch = realFetch; }
});
