// idefix API denetimi (developer.idefix.com): sayfalama, kargo bildirimi, stok/fiyat sonuç sorgusu, tekil sevkiyat — ağa çıkmadan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idefix } from '../src/channels/idefix.js';

const ENV = { IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's', IDEFIX_VENDOR_ID: '16705' };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function withFetch(fn, handler) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, o = {}) => { const c = { url: String(url), method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null }; calls.push(c); return handler(c); };
  try { await fn(calls); } finally { globalThis.fetch = real; }
}
const shipment = (id, o = {}) => ({ id, orderNumber: 'IDE' + id, orderDate: '2026-10-01T10:00:00+03:00', status: 'shipment_ready', shippingAddress: { fullName: 'Can', city: 'Bursa' },
  items: [{ id: id * 10, barcode: 'B' + id, merchantSku: 'S' + id, productName: 'Ürün', price: 40, discountedTotalPrice: 40 }], ...o });

test('idefix: sipariş listesi sayfa sayısı pageCount\'tan okunur (limit sessizce düşürülse de sonraki sayfalar atlanmaz)', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    const orders = await c.fetchOrders(Date.now() - 864e5, Date.now());
    assert.equal(calls.length, 3, '3 sayfa okunur');
    assert.deepEqual(calls.map((x) => new URL(x.url).searchParams.get('page')), ['1', '2', '3']);
    assert.equal(orders.length, 150);
  }, (c) => {
    const page = Number(new URL(c.url).searchParams.get('page'));
    // idefix limit=100 istense de 50 döndürüyor
    return J({ totalCount: 150, itemCount: 50, pageCount: 3, currentPage: page, limit: 50, items: Array.from({ length: 50 }, (_, i) => shipment(page * 1000 + i)) });
  });
});

test('idefix: platform anlaşmalı sevkiyatta (takip no idefix\'in kendisinin) update-tracking-number çağrılmaz; kendi takip no\'su bildirilir', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    // Takip no idefix'ten gelen cargoKey: kendi anlaşmasına geçirmemek için hiçbir istek gitmez
    assert.deepEqual(await c.ship({ cargo_company: 'Yurtiçi Kargo' }, { remote_id: '600', tracking: 'CLMY241', cargo_company: 'Yurtiçi Kargo', agreement: 'idefix' }, { tracking: 'CLMY241', cargoCompany: 'Yurtiçi Kargo' }), {});
    assert.equal(calls.length, 0);
    // Satıcının kendi girdiği takip no: panelde seçilen firma (Aras) adrese yansır
    await c.ship({ cargo_company: 'Yurtiçi Kargo' }, { remote_id: '600', tracking: 'CLMY241', cargo_company: 'Yurtiçi Kargo', agreement: 'idefix' }, { tracking: 'AR123', cargoCompany: 'Aras Kargo' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/oms\/16705\/600\/update-tracking-number$/);
    assert.deepEqual(calls[0].body, { trackingNumber: 'AR123', trackingUrl: 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code=AR123' });
    // "Takip bilgisi gir" ile kaydedilmiş (agreement own) takip no aynı olsa da bildirilir
    await c.ship({}, { remote_id: '601', tracking: 'YT9', cargo_company: 'Yurtiçi Kargo', agreement: 'own' }, { tracking: 'YT9', cargoCompany: 'Yurtiçi Kargo' });
    assert.equal(calls.length, 2);
  }, () => J({}));
});

test('idefix: stok/fiyat gönderimi batchRequestId döndürür; inventory-result satır sonuçları okunur', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    const r = await c.pushStock([{ remoteId: 'B1', stock: 5 }, { remoteId: 'B2', stock: -2 }]);
    assert.deepEqual(r, { refs: ['101b-1'] });
    assert.deepEqual(calls[0].body, { items: [{ barcode: 'B1', inventoryQuantity: 5 }, { barcode: 'B2', inventoryQuantity: 0 }] });
    const pr = await c.pushPrice([{ remoteId: 'B1', price: 100, listPrice: 90 }]);
    assert.deepEqual(pr.refs, ['101b-1']);
    assert.deepEqual(calls[1].body, { items: [{ barcode: 'B1', price: 100, comparePrice: 100 }] });
    const st = await c.pushStatus('101b-1');
    assert.match(calls[2].url, /\/pim\/catalog\/16705\/inventory-result\/101b-1$/);
    assert.equal(st.done, true);
    assert.deepEqual(st.items, [{ key: 'B1', ok: true, error: '' }, { key: 'B2', ok: false, error: 'barkod idefix ürün havuzunda yok' }]);
    const pend = await c.pushStatus('101b-2');
    assert.equal(pend.done, false);
  }, (c) => {
    if (/inventory-upload/.test(c.url)) return J({ items: c.body.items, status: 'CREATED', batchRequestId: '101b-1' });
    if (/inventory-result\/101b-1/.test(c.url)) return J({ status: 'COMPLETED', batchRequestId: '101b-1', items: [{ barcode: 'B1', status: 'completed' }, { barcode: 'B2', status: 'decline', failureReasons: 'PRODUCT_NOT_FOUND' }] });
    return J({ status: 'CREATED', items: [{ barcode: 'B1', status: 'created' }] });
  });
});

test('idefix: tekil sevkiyat "ids" ile yenilenir; bulunamazsa hata (orderExists yok: yanlış "silindi" riski)', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    assert.equal(c.orderExists, undefined);
    const o = await c.fetchOne('700');
    assert.match(calls[0].url, /\/oms\/16705\/list\?ids=700&/);
    assert.equal(o.remoteId, '700'); assert.equal(o.status, 'new');
    await assert.rejects(c.fetchOne('999'), /bulunamadı/);
  }, (c) => J({ totalCount: 1, pageCount: 1, items: /ids=700/.test(c.url) ? [shipment(700)] : [] }));
});

test('idefix: stok gönderiminde mevcut fiyat da gider (yalnız stok "NO_PRICE" ile reddedilir); fiyat gönderiminde stok da gider', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    await c.pushStock([{ remoteId: 'B1', stock: 7, price: 120, listPrice: 150 }, { remoteId: 'B2', stock: -2, price: 80, listPrice: 0 },
      // Bekleyen fiyat değişikliği: eski fiyat gönderilmez (fiyat gönderimine bırakılır)
      { remoteId: 'B3', stock: 4, price: 99, priceDirty: true }]);
    assert.deepEqual(calls[0].body.items, [
      { barcode: 'B1', price: 120, comparePrice: 150, inventoryQuantity: 7 },
      { barcode: 'B2', price: 80, comparePrice: 80, inventoryQuantity: 0 },
      { barcode: 'B3', inventoryQuantity: 4 },
    ]);
    await c.pushPrice([{ remoteId: 'B1', price: 110, listPrice: 0, stock: 5 }, { remoteId: 'B4', price: 50, listPrice: 60, stock: null }]);
    assert.deepEqual(calls[1].body.items, [{ barcode: 'B1', price: 110, comparePrice: 110, inventoryQuantity: 5 }, { barcode: 'B4', price: 50, comparePrice: 60 }]);
  }, (c) => J({ items: c.body.items, status: 'CREATED', batchRequestId: '101b-9' }));
});
