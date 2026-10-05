// idefix: ürün yükleme (kategori, özellik, marka, create, batch-result) ve iade talepleri (claim-list, onay, red talebi) — ağa çıkmadan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idefix } from '../src/channels/idefix.js';

const ENV = { IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's', IDEFIX_VENDOR_ID: '16705' };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function withFetch(fn, handler) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, o = {}) => { const c = { url: String(url), method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null, headers: o.headers }; calls.push(c); return handler(c); };
  try { await fn(calls); } finally { globalThis.fetch = real; }
}

const TREE = [{ id: 522, parentId: 0, name: 'Bahçe', subs: [{ id: 1192, parentId: 522, name: 'Gübre', subs: [{ id: 545, parentId: 1192, name: 'Organik Gübre', subs: [] }, { id: 546, parentId: 1192, name: 'Kimyevi Gübre', subs: [] }] }] }];
const ATTRS = { id: 545, name: 'Organik Gübre', categoryAttributes: [
  { attributeId: 24, attributeTitle: 'Ağırlık', allowCustom: false, required: true, isVariant: true, attributeValues: [{ id: 93300, name: '5 Kg' }, { id: 93301, name: '15 Kg' }] },
  { attributeId: 30, attributeTitle: 'Menşei', allowCustom: false, required: true, isVariant: false, attributeValues: [{ id: 1, name: 'Türkiye' }] },
  { attributeId: 31, attributeTitle: 'Kullanım Talimatı', allowCustom: true, required: false, isVariant: false, attributeValues: [] },
  { attributeId: 32, attributeTitle: 'Renk', allowCustom: false, required: false, isVariant: false, attributeValues: [{ id: 7, name: 'Kahve' }] },
] };
const PR = { id: 1, sku: 'HG-5', barcode: '8682520171549', name: 'Solucan Gübresi 5 Kg', brand: 'HasTürk', description: 'açıklama', image: 'https://img/1.jpg', images: ['https://img/1.jpg', 'https://img/2.jpg'],
  vat: 10, desi: 2, stock: 7, price: 100, listPrice: 120, group: 'HG', variant: '5 Kg' };
const route = (c) => {
  if (c.url.endsWith('/pim/product-category')) return J(TREE);
  if (/\/pim\/category-attribute\/545$/.test(c.url)) return J(ATTRS);
  if (/\/pim\/brand\/by-name\?title=Has/.test(c.url)) return J({ id: 1000108, title: 'HasTürk' });
  if (/\/pim\/brand\/by-name/.test(c.url)) return J({ message: 'not found' }, 404);
  return J({});
};

test('katalog: kategori ağacı yapraklara açılır, özellikler ve değerler doğru eşlenir', async () => {
  await withFetch(async () => {
    const c = idefix(ENV, { id: 'idefix' });
    const r = await c.catalog.categories('gübre');
    assert.equal(r.total, 2);
    assert.deepEqual(r.items[0], { id: '545', name: 'Organik Gübre', path: 'Bahçe › Gübre' });
    const at = await c.catalog.attributes('545');
    assert.deepEqual(at.map((a) => [a.id, a.kind, a.mandatory, a.type]), [['24', 'variant', true, 'enum'], ['30', 'category', true, 'enum'], ['31', 'category', false, 'text'], ['32', 'category', false, 'enum']]);
    assert.deepEqual(await c.catalog.values('545', '24'), [{ id: '93300', value: '5 Kg' }, { id: '93301', value: '15 Kg' }]);
    assert.equal((await c.catalog.allCategories()).length, 2);
  }, route);
});

test('katalog: build → create isteği (varyant, serbest metin, marka, görseller); eksikler bildirilir', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    const map = { remote_id: '545', attrs: { 24: { value: '@variant' }, 30: { id: '1', value: 'Türkiye' }, 31: { value: 'Toprağa karıştırın' } } };
    const pick = async (attr, text) => (await c.catalog.values('545', attr.id)).find((v) => v.value === text) || null;
    const b = await c.catalog.build(PR, map, { opts: { cargoCompanyId: '5' }, pick });
    assert.deepEqual(b.missing, []);
    assert.equal(b.key, PR.barcode);
    const p = b.payload;
    assert.equal(p.brandId, 1000108); assert.equal(p.categoryId, 545); assert.equal(p.vendorStockCode, 'HG-5'); assert.equal(p.productMainId, 'HG');
    assert.equal(p.inventoryQuantity, 7); assert.equal(p.price, 100); assert.equal(p.comparePrice, 120); assert.equal(p.vatRate, 10); assert.equal(p.cargoCompanyId, 5);
    assert.deepEqual(p.images, [{ url: 'https://img/1.jpg' }, { url: 'https://img/2.jpg' }]);
    assert.deepEqual(p.attributes, [
      { attributeId: 24, attributeValueId: 93300, customAttributeValue: null },
      { attributeId: 30, attributeValueId: 1, customAttributeValue: null },
      { attributeId: 31, attributeValueId: null, customAttributeValue: 'Toprağa karıştırın' },
    ]);
    // Listede olmayan varyant, bilinmeyen marka
    const bad = await c.catalog.build({ ...PR, variant: '7 Kg', brand: 'Yok', image: '' }, { remote_id: '545', attrs: { 24: { value: '@variant' } } }, { pick });
    assert.ok(bad.missing.includes('Ağırlık (“7 Kg” listede yok)'));
    assert.ok(bad.missing.includes('Menşei'));
    assert.ok(bad.missing.some((m) => /marka “Yok”/.test(m)));
    assert.ok(bad.missing.includes('görsel'));

    // Gönderim: 200'lük parçalar, products gövdesi, batchRequestId'ler birleştirilir
    calls.length = 0;
    let n = 0;
    globalThis.fetch = async (url, o = {}) => { calls.push({ url: String(url), method: o.method, body: JSON.parse(o.body) }); return J({ batchRequestId: 'B' + ++n, status: 'created' }); };
    const r = await c.catalog.send(Array.from({ length: 250 }, () => p));
    assert.equal(r.ref, 'B1,B2');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://merchantapi.idefix.com/pim/pool/16705/create');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].body.products.length, 200); assert.equal(calls[1].body.products.length, 50);
  }, route);
});

test('katalog: batch-result durumları (onay / hata kodu / bekleyen / zaten havuzda)', async () => {
  let batch = 'running';
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    let r = await c.catalog.status('B1');
    assert.equal(calls[0].url, 'https://merchantapi.idefix.com/pim/pool/16705/batch-result/B1');
    assert.equal(r.done, false);
    const by = Object.fromEntries(r.items.map((x) => [x.key, x]));
    assert.equal(by.A.ok, true);
    assert.equal(by.B.ok, false); assert.match(by.B.error, /zorunlu kategori özelliği eksik/);
    assert.equal(by.C.ok, null);
    assert.equal(by.D.ok, true); assert.equal(by.D.status, 'zaten ürün havuzunda');
    assert.equal(by.E.ok, false); assert.equal(by.E.error, 'eksik bilgi');
    batch = 'COMPLETED';
    r = await c.catalog.status('B1');
    assert.equal(r.done, false, 'inceleme bekleyen ürün varken tamamlanmış sayılmaz');
  }, () => J({ status: batch, batchRequestId: 'B1', products: [
    { barcode: 'A', status: 'ready_for_sale', failureReasons: null },
    { barcode: 'B', status: 'decline', failureReasons: 'CATEGORY_MANDATORY_ATTRIBUTE_MISSED' },
    { barcode: 'C', status: 'waiting_catalog_action', failureReasons: null },
    { barcode: 'D', status: 'decline', failureReasons: 'PRODUCT_POOL_ALREADY_EXIST' },
    { barcode: 'E', status: 'missing_info', failureReasons: null },
  ] }));
  await withFetch(async () => {
    const r = await idefix(ENV, { id: 'idefix' }).catalog.status('B2');
    assert.equal(r.done, true);
    assert.deepEqual(r.items.map((x) => x.ok), [true, false]);
  }, () => J({ status: 'COMPLETED', products: [{ barcode: 'A', status: 'auto_matched' }, { barcode: 'B', status: 'platform_declined' }] }));
});

const CLAIMS = { totalCount: 2, itemCount: 2, pageCount: 2, currentPage: 1, limit: 50, items: [{
  customerName: 'Derya Kaya', createdAt: '2023-05-17T18:56:29+03:00', orderNumber: 'IDE645', id: 241, cargoTrackingNumber: '9168', cargoKey: 'CLMY241', cargoCompanyName: 'Yurtiçi Kargo',
  items: [
    { id: 262, orderLineId: 1, barcode: '868', productName: 'Gübre', productImage: 'https://s/{size}p.jpg', erpId: 'HG-5', discountedTotalPrice: 10.05, totalPrice: 10.05, customerReason: 'Modelini beğenmedim', customerNote: 'kırık', state: 'waiting_vendor_approve' },
    { id: 263, orderLineId: 2, barcode: '868', productName: 'Gübre', productImage: '', erpId: 'HG-5', discountedTotalPrice: 10.05, customerReason: 'Modelini beğenmedim', state: 'waiting_vendor_approve' },
    { id: 264, orderLineId: 3, barcode: '999', productName: 'Pompa', erpId: 'P1', discountedTotalPrice: 50, customerReason: 'Hasarlı', state: 'approved' },
  ] }] };

test('iadeler: claim-list okunur, kalemler gruplanır, sayfalama ve tarih biçimi doğru', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    const since = Date.parse('2024-01-01T00:00:00Z'), until = Date.parse('2024-01-31T00:00:00Z');
    const r = await c.claims({ since, until, page: 0, size: 50 });
    const u = new URL(calls[0].url);
    assert.equal(u.pathname, '/oms/16705/claim-list');
    assert.equal(u.searchParams.get('startDate'), '2024/01/01 03:00:00');
    assert.equal(u.searchParams.get('endDate'), '2024/01/31 03:00:00');
    assert.equal(u.searchParams.get('page'), '1');
    assert.equal(r.hasNext, true);
    const x = r.items[0];
    assert.equal(x.remoteId, '241'); assert.equal(x.orderNumber, 'IDE645'); assert.equal(x.status, 'waiting'); assert.equal(x.customer, 'Derya Kaya');
    assert.equal(x.claimedAt, Date.parse('2023-05-17T18:56:29+03:00')); assert.equal(x.cargo, 'Yurtiçi Kargo'); assert.equal(x.tracking, '9168');
    assert.equal(x.lines.length, 2);
    assert.deepEqual(x.lines[0].ids, ['262', '263']); assert.equal(x.lines[0].qty, 2); assert.equal(x.lines[0].status, 'waiting'); assert.equal(x.lines[0].image, 'https://s/300/p.jpg');
    assert.equal(x.lines[1].status, 'accepted'); assert.equal(x.lines[1].remoteStatus, 'Onaylandı');
    assert.equal(Math.round(x.amount * 100), 7010);
    // Sayfa parametresi yok sayılırsa (aynı sayfa döner) devam edilmez
    const r2 = await c.claims({ since, until, page: 1 });
    assert.equal(r2.hasNext, false);
  }, () => J(CLAIMS));
});

test('iadeler: onay, red talebi ve ret sebepleri doğru uç noktalara gider', async () => {
  await withFetch(async (calls) => {
    const c = idefix(ENV, { id: 'idefix' });
    const claim = { remote_id: '241' }, lines = [{ id: '262', ids: ['262', '263'] }];
    await c.approveClaim(claim, lines);
    assert.equal(calls[0].url, 'https://merchantapi.idefix.com/oms/16705/241/claim-approve');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, { claimLineIds: ['262', '263'] });
    await c.rejectClaim(claim, lines, { reasonId: '1', text: 'Ürün kullanılmış' });
    assert.equal(calls[1].url, 'https://merchantapi.idefix.com/oms/16705/241/claim-decline-request');
    assert.deepEqual(calls[1].body, { claimLines: [262, 263].map((id) => ({ id, claimDeclineReasonId: 1, description: 'Ürün kullanılmış', images: [] })) });
    assert.deepEqual(await c.claimReasons(), [{ id: '1', name: 'Hatalı Ürün' }]);
    assert.equal(calls[2].url, 'https://merchantapi.idefix.com/oms/claim-decline-reasons');
    assert.equal(c.caps.label, null, 'idefix kargo etiketi servisi yok');
    assert.equal(c.settlements, undefined); assert.equal(c.invoices, undefined);
  }, (x) => (/claim-decline-reasons/.test(x.url) ? J([{ id: 1, name: 'Hatalı Ürün', description: null }]) : J({})));
});
