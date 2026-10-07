// Pazarama API denetimi (isortagim.pazarama.com/auth/integration dokümanı): sipariş tarih aralığı, satır durumları, onaylı ürün listesi (imleç),
// stok/fiyat hız sınırı ve sonuç sorgusu, kargoya verme, sorular — ağa çıkmadan
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { pazarama, pzDate } from '../src/channels/pazarama.js';

const ENV = { PAZARAMA_CLIENT_ID: 'c', PAZARAMA_CLIENT_SECRET: 's' };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function withFetch(fn, handler) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const c = { url: String(url), method: o.method || 'GET', body: o.body && /^\s*[{[]/.test(o.body) ? JSON.parse(o.body) : o.body || null };
    calls.push(c);
    if (/connect\/token/.test(c.url)) return J({ success: true, data: { accessToken: 'TT', expiresIn: 3600 } });
    return handler(c);
  };
  try { await fn(calls); } finally { globalThis.fetch = real; }
}
const api = (calls) => calls.filter((c) => !/connect\/token/.test(c.url));
const money = (v) => ({ currency: 'TL', value: v });
const line = (id, st, o = {}) => ({ orderItemId: id, orderItemStatus: st, quantity: 1, totalPrice: money(10), estimatedShippingDate: '2026-10-02T19:00:00+03:00',
  cargo: { companyName: 'Aras Kargo', trackingNumber: null }, product: { code: 'C' + id, stockCode: 'S' + id, name: 'Ürün ' + id, imageURL: `https://img.pzrmcdn.com/${id}.png`, variantOptionDisplay: 'Siyah' }, ...o });
const order = (no, items, o = {}) => ({ orderId: 'g-' + no, orderNumber: no, orderDate: '2026-10-01 10:00', orderAmount: 30, customerName: 'Deniz', shipmentAddress: { cityName: 'Mersin' }, items, ...o });

test('Pazarama: sipariş aralığı saat:dakika ile, bitiş bugünü kapsar (EndDate hariçtir), pencere 1 ayı aşmaz', async () => {
  await withFetch(async (calls) => {
    const ch = pazarama(ENV, { id: 'pazarama' });
    const until = Date.parse('2026-10-07T12:34:20Z'), since = until - 40 * 864e5;
    const orders = await ch.fetchOrders(since, until);
    const bodies = api(calls).map((c) => c.body);
    assert.equal(bodies.length, 2, '40 gün → 2 pencere');
    assert.equal(bodies[0].endDate, '2026-10-07T15:36', 'Türkiye saati, bir dakika ileri yuvarlanmış (bugünün siparişleri gelir)');
    for (const b of bodies) {
      assert.match(b.startDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      assert.ok(Date.parse(b.endDate + 'Z') - Date.parse(b.startDate + 'Z') <= 28 * 864e5);
    }
    assert.equal(orders.length, 1, 'iki pencerede dönen aynı sipariş bir kez');
  }, () => J({ success: true, data: [order(555, [line('a', 3)])] }));
});

test('Pazarama: satır durumları (iade reddi, teslim edilemedi, mağazada, iptal talebi), tarih, görsel, varyant, son kargo tarihi', async () => {
  await withFetch(async () => {
    const ch = pazarama(ENV, { id: 'pazarama' });
    const by = Object.fromEntries((await ch.fetchOrders(Date.now() - 864e5, Date.now())).map((o) => [o.remoteId, o]));
    assert.equal(by[1].status, 'delivered', '9 İade Reddedildi: ürün müşteride, sipariş tamamlandı (eskiden "yeni" oluyordu)');
    assert.equal(by[2].status, 'shipped', '14 Teslim Edilemedi iade değildir');
    assert.equal(by[2].items[0].status, '');
    assert.equal(by[3].status, 'shipped', '16 Mağazada');
    assert.equal(by[4].status, 'shipped', '19 Teslimat noktasında');
    assert.equal(by[5].status, 'processing', '18 İptal süreci başlatıldı: sipariş hâlâ açık');
    assert.equal(by[5].remoteStatus, 'İptal Süreci Başlatıldı');
    const o = by[6];
    assert.equal(o.status, 'processing'); assert.equal(o.remoteStatus, 'Siparişiniz Hazırlanıyor, Siparişiniz İptal Edildi');
    assert.equal(o.total, 10, 'kısmi iptalde tutar canlı satırlardan');
    assert.equal(o.items[1].status, 'cancelled');
    assert.equal(o.orderedAt, Date.parse('2026-10-01T07:00:00Z'), 'saat dilimsiz tarih Türkiye saati');
    assert.equal(o.items[0].image, 'https://img.pzrmcdn.com/6a.png');
    assert.equal(o.items[0].variantName, 'Siyah');
    assert.equal(o.shipBy, Date.parse('2026-10-02T16:00:00Z'));
    assert.equal(by[7].total, 30, 'iptal yoksa orderAmount');
  }, () => J({ success: true, data: [
    order(1, [line('1', 9)]), order(2, [line('2', 14)]), order(3, [line('3', 16)]), order(4, [line('4', 19)]), order(5, [line('5', 18, { orderItemStatusName: 'İptal Süreci Başlatıldı' })]),
    order(6, [line('6a', 12, { orderItemStatusName: 'Siparişiniz Hazırlanıyor' }), line('6b', 6, { orderItemStatusName: 'Siparişiniz İptal Edildi' })]), order(7, [line('7', 3)]),
  ] }));
  assert.equal(pzDate('2023-12-28T09:12:16.333'), Date.parse('2023-12-28T06:12:16.333Z') - 333);
  assert.equal(pzDate('2026-02-18T19:00:00+03:00'), Date.parse('2026-02-18T16:00:00Z'));
});

test('Pazarama: onaylı ürünler product/products/approved, imleçle 100\'er; grup kodu ve varyant', async () => {
  await withFetch(async (calls) => {
    const ch = pazarama(ENV, { id: 'pazarama' });
    const l = await ch.fetchListings();
    const urls = api(calls).map((c) => c.url);
    assert.deepEqual(urls, ['https://isortagimapi.pazarama.com/product/products/approved?Size=100', 'https://isortagimapi.pazarama.com/product/products/approved?Size=100&Cursor=MjAy%3D%3D']);
    assert.equal(l.length, 2);
    assert.deepEqual(l[0], { remoteId: 'B1', remoteProductId: 'G1', sku: 'S1', barcode: 'B1', name: 'Tişört Siyah', groupName: 'Tişört', variantName: 'Siyah', image: 'https://cdn/1.jpg', images: ['https://cdn/1.jpg'],
      price: 90, listPrice: 120, stock: 4, active: true, brand: 'Mavi', category: 'Tişört' });
  }, (c) => J({ success: true, data: /Cursor=/.test(c.url)
    ? { sellerProducts: [{ name: 'Kupa', code: 'B2', groupCode: 'G2', stockCount: 0, stockCode: 'S2', listPrice: 0, salePrice: 50, images: null, productGroups: null }], nextCursor: null }
    : { sellerProducts: [{ name: 'Tişört', displayName: 'Tişört Siyah', brandName: 'Mavi', categoryName: 'Tişört', code: 'B1', groupCode: 'G1', stockCount: 4, stockCode: 'S1', listPrice: 120, salePrice: 90,
      images: [{ imageUrl: 'https://cdn/1.jpg', sortOrder: 0 }], productGroups: [{ code: 'B1', attributeName: 'Renk', attributeValue: 'Siyah' }, { code: 'B9', attributeValue: 'Beyaz' }] }], nextCursor: 'MjAy==' } }));
});

test('Pazarama: stok/fiyat istekleri arasında en az 10 sn, istekte en fazla 3000; dataId ile sonuç sorgusu', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-07T10:00:00Z') });
  try {
    await withFetch(async (calls) => {
      const ch = pazarama(ENV, { id: 'pazarama' });
      const items = Array.from({ length: 3001 }, (_, i) => ({ remoteId: 'B' + i, stock: i === 0 ? -1 : 2, price: 10, listPrice: 8 }));
      const p = ch.pushStock(items);
      for (let i = 0; i < 50; i++) await Promise.resolve();
      let posts = api(calls).filter((c) => c.method === 'POST');
      assert.equal(posts.length, 1, 'ikinci parça 10 sn bekler');
      assert.equal(posts[0].body.items.length, 3000);
      assert.deepEqual(posts[0].body.items[0], { code: 'B0', stockCount: 0 });
      mock.timers.tick(10500);
      const r = await p;
      posts = api(calls).filter((c) => c.method === 'POST');
      assert.equal(posts.length, 2);
      assert.deepEqual(r, { refs: ['d-1', 'd-1'] });
      const pp = ch.pushPrice([{ remoteId: 'B1', price: 10, listPrice: 8 }]);
      for (let i = 0; i < 50; i++) await Promise.resolve();
      assert.equal(api(calls).filter((c) => /updatePrice-v2/.test(c.url)).length, 0, 'fiyat isteği stok isteğinden 10 sn sonra');
      mock.timers.tick(10500);
      await pp;
      assert.deepEqual(api(calls).find((c) => /updatePrice-v2/.test(c.url)).body, { items: [{ code: 'B1', listPrice: 10, salePrice: 10 }] });
    }, (c) => J({ data: 'd-1', success: true, message: 'Fiyat/Stok güncelleme işleminiz sıraya alındı.' }));
  } finally { mock.timers.reset(); }
});

test('Pazarama: listing-state sonucu (başarılı, onaya gönderildi, hata, işleniyor)', async () => {
  await withFetch(async (calls) => {
    const ch = pazarama(ENV, { id: 'pazarama' });
    const r = await ch.pushStatus('d-1');
    assert.match(api(calls)[0].url, /\/listing-state\/batch-id\/d-1\/lake-projections\?page=1&pageSize=3000$/);
    assert.equal(r.done, true);
    assert.deepEqual(r.items, [{ key: 'A', ok: true, error: '' }, { key: 'B', ok: true, error: '' }, { key: 'C', ok: false, error: 'Ürün bulunamadı' }]);
    const p = await ch.pushStatus('d-2');
    assert.equal(p.done, false);
  }, (c) => J({ success: true, data: { data: /d-1/.test(c.url) ? [
    { code: 'A', price: { status: 0, operationDetail: 'Başarılı' }, stock: null, operationStatusText: 'Başarılı' },
    { code: 'B', price: { status: 5, operationDetail: 'Ürün fiyat onayına gönderildi' }, operationStatusText: 'Onaya gönderildi' },
    { code: 'C', stock: { status: 2, operationDetail: 'Ürün bulunamadı' }, operationStatusText: 'Hata oluştu' },
  ] : [{ code: 'A', stock: { status: 3 }, operationStatusText: 'İşleniyor' }] } }));
});

test('Pazarama: kargoya verme — firma kimliği teslimat ayarlarından, canlı her satır statü 5; kanalın takip no\'su ise istek yok', async () => {
  await withFetch(async (calls) => {
    const ch = pazarama(ENV, { id: 'pazarama' });
    assert.equal(ch.caps.ship, 'remote');
    const o = { remote_id: '555', status: 'new', tracking: '', cargo_company: '', items: [{ line_id: 'a', status: '' }, { line_id: 'b', status: 'cancelled' }, { line_id: 'c', status: '' }] };
    await ch.ship(o, { items: [{ line_id: 'a', qty: 1 }, { line_id: 'b', qty: 1 }, { line_id: 'c', qty: 1 }] }, { tracking: '604164846124', cargoCompany: 'Yurtiçi' });
    const sent = api(calls);
    assert.equal(sent[0].url, 'https://isortagimapi.pazarama.com/sellerRegister/getSellerDelivery');
    assert.deepEqual(sent[1].body, { orderNumber: 555, status: 12 }, 'yeni sipariş önce Hazırlanıyor (12)');
    const ups = sent.filter((c) => /updateOrderStatus$/.test(c.url));
    assert.equal(ups.length, 2, 'iptal satır gönderilmez');
    assert.equal(ups[0].method, 'PUT');
    assert.deepEqual(ups[0].body, { orderNumber: 555, item: { orderItemId: 'a', status: 5, deliveryType: 1, shippingTrackingNumber: '604164846124', cargoCompanyId: '7b55' } });
    const n = calls.length;
    assert.deepEqual(await ch.ship({ ...o, status: 'processing', tracking: 'PZ1' }, { items: [] }, { tracking: 'PZ1', cargoCompany: 'Aras' }), {});
    assert.deepEqual(await ch.ship({ ...o, status: 'processing' }, { items: [] }, { tracking: '', cargoCompany: 'Aras' }), {});
    assert.equal(calls.length, n, 'anlaşmalı kargo / kanalın takip no\'su: istek yok');
    await assert.rejects(ch.ship({ ...o, status: 'processing' }, { items: [] }, { tracking: 'X1', cargoCompany: 'Sürat' }), /Tanımlı firmalar: MNG, Yurtiçi Kargo/);
  }, (c) => {
    if (/getSellerDelivery/.test(c.url)) return J({ success: true, data: { cargoCompany: { contracted: false, cargoCompanies: [
      { cargoCompanyId: '8eb9', cargoCardType: 2, cargoCompanyName: 'MNG' }, { cargoCompanyId: '7b55', cargoCardType: 1, cargoCompanyName: 'Yurtiçi Kargo' }] } } });
    return J({ success: true, data: null });
  });
});

test('Pazarama: sorular — toplam pageResponse\'tan, tarih Türkiye saati, reddedilen soru bekleyenlere düşmez', async () => {
  await withFetch(async () => {
    const ch = pazarama(ENV, { id: 'pazarama' });
    const r = await ch.questions({ since: 1, until: 2, page: 0, size: 1 });
    assert.equal(r.total, 3); assert.equal(r.hasNext, true);
    assert.equal(r.items[0].askedAt, Date.parse('2023-12-28T06:12:16Z'));
    assert.equal(r.items[0].status, 'answered'); assert.equal(r.items[0].remoteStatus, 'Onay bekliyor');
    assert.equal(r.items[0].answeredAt, Date.parse('2023-12-28T07:17:13Z'));
    assert.equal(r.items[1].status, 'other');
  }, () => J({ success: true, data: { approvalAnswersByMerchantSearchs: [
    { questionId: 'q1', question: 'garanti var mı', questionDate: '2023-12-28T09:12:16', answer: 'Var', answerDate: '2023-12-28T10:17:13', questionStatus: 2 },
    { questionId: 'q2', question: '?', questionDate: '2023-12-28T09:12:16', questionStatus: 3 },
  ], pageResponse: { pageIndex: 1, pageSize: 1, totalCount: 3, totalPages: 3 } } }));
});

test('Pazarama: tanılama adımları', async () => {
  await withFetch(async () => {
    const steps = await pazarama(ENV, { id: 'pazarama' }).diagnose();
    assert.deepEqual(steps.map((s) => [s.name, s.ok]), [['Kimlik (belirteç)', true], ['Siparişler (son 24 saat)', true], ['Onaylı ürünler', true]]);
    assert.match(steps[1].detail, /1 sipariş · örnek durum: Siparişiniz Alındı → new/);
  }, (c) => (/getOrdersForApi/.test(c.url) ? J({ success: true, data: [order(9, [line('9', 3)])] }) : J({ success: true, data: { sellerProducts: [], nextCursor: null } })));
});
