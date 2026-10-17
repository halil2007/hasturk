// Ürün yükleme denetimi: pazaryeri belgelerine göre gönderimden önce yakalanması gereken eksikler ve gönderim biçimi.
//  Trendyol ürün yaratma v2 (developers.trendyol.com → Ürün Yaratma v2; Trendyol/trendyol-integration-developer-tool → modules.md):
//   özellik biçimi v2 başvurusuna göre attributeValueIds (dizi) / attributeValue (V1'e düşülürse attributeValueId / customAttributeValue),
//   barkod en çok 40 karakter ve özel karakter yalnız . - _, stockCode zorunlu, görseller https ve en çok 8.
//  N11 ürün oluşturma (product-create): barkod ya da N11 katalog numarası gerekir; katalog numarası gönderilmediği için barkod zorunlu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyol } from '../src/channels/trendyol.js';
import { n11 } from '../src/channels/n11.js';

const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
function mock(route) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => { const c = { url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null }; calls.push(c); return J(route(c)); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const PR = (o = {}) => ({ id: 1, sku: 'SKU-1', barcode: '869001', name: 'Solucan Gübresi 5 Kg', brand: 'HG', brandId: '555', description: '<p>Açıklama</p>', image: 'https://cdn.ornek.com/a.jpg',
  images: ['https://cdn.ornek.com/a.jpg', ...Array.from({ length: 9 }, (_, i) => `https://cdn.ornek.com/${i}.jpg`)], vat: 10, desi: 2, stock: 7, price: 100, listPrice: 120, group: 'SOL', variant: '5 Kg', ...o });

test('Trendyol ürün yaratma v2: özellik biçimi (attributeValueIds / attributeValue), barkod / SKU / https görsel kontrolü, en çok 8 görsel', async () => {
  const ATTRS = { categoryAttributes: [
    { attribute: { id: 47, name: 'Ağırlık' }, required: true, varianter: true, allowCustom: false, attributeValues: [{ id: 905, name: '5 kg' }] },
    { attribute: { id: 1192, name: 'Menşei' }, required: true, allowCustom: false, attributeValues: [{ id: 10617, name: 'TR' }] },
    { attribute: { id: 60, name: 'Kullanım Şekli' }, required: false, allowCustom: true, attributeValues: [] }] };
  const m = mock((c) => (/attributes$/.test(c.url) ? ATTRS : /v2\/products$/.test(c.url) ? { batchRequestId: 'B-9' } : {}));
  try {
    const ch = trendyol({ TRENDYOL_SELLER_ID: '123', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
    const map = { remote_id: '2001', attrs: { 47: { value: '@variant' }, 1192: { id: '10617', value: 'TR' }, 60: { value: 'Toprağa karıştırın' } } };
    const pick = async (a, t) => (/5 kg/i.test(t) ? { id: '905', value: '5 kg' } : null);
    let b = await ch.catalog.build(PR(), map, { opts: {}, pick });
    assert.deepEqual(b.missing, []);
    assert.deepEqual(b.payload.attributes, [{ attributeId: 47, attributeValueIds: [905] }, { attributeId: 1192, attributeValueIds: [10617] }, { attributeId: 60, attributeValue: 'Toprağa karıştırın' }]);
    assert.equal(b.payload.images.length, 8, 'Trendyol barkod başına en çok 8 görsel');
    assert.equal(b.payload.images[0].url, 'https://cdn.ornek.com/a.jpg');
    // Barkod: boşluk / özel karakter ya da 40 karakterden uzun → gönderilmez; SKU (stockCode) zorunlu; http görsel kabul edilmez
    b = await ch.catalog.build(PR({ barcode: '869 001/A', sku: '', image: 'http://cdn.ornek.com/a.jpg', images: ['http://cdn.ornek.com/a.jpg'] }), map, { opts: {}, pick });
    assert.deepEqual(b.missing, ['barkod “869 001/A” Trendyol\'a uygun değil (en çok 40 karakter; harf, rakam ve . - _ dışında karakter ve boşluk olamaz)', 'SKU (stok kodu)', 'görsel (Trendyol yalnız https bağlantı kabul eder)']);
    b = await ch.catalog.build(PR({ barcode: 'Ç'.repeat(41) }), map, { opts: {}, pick });
    assert.match(b.missing[0], /Trendyol'a uygun değil/);
    assert.deepEqual((await ch.catalog.build(PR({ barcode: 'ÇİÖ-12_3.4' }), map, { opts: {}, pick })).missing, [], 'Türkçe harf ve . - _ kabul');
    // Gönderim v2 servisine aynı biçimle gider
    b = await ch.catalog.build(PR(), map, { opts: {}, pick });
    const { ref } = await ch.catalog.send([b.payload]);
    assert.equal(ref, 'B-9');
    const sent = m.calls.find((c) => /v2\/products$/.test(c.url)).body.items[0];
    assert.equal(sent.stockCode, 'SKU-1'); assert.deepEqual(sent.attributes, b.payload.attributes);
  } finally { m.restore(); }
});

test('N11 ürün oluşturma: barkod zorunlu (katalog numarası gönderilmiyor)', async () => {
  const m = mock((c) => (/\/cdn\/category\/\d+\/attribute$/.test(c.url) ? { categoryAttributes: [{ attributeId: 1, attributeName: 'Marka', isMandatory: true, isCustomValue: true, attributeValues: [] }] } : {}));
  try {
    const ch = n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n11' });
    const opts = { shipmentTemplate: 'Standart', preparingDay: '2' };
    assert.deepEqual((await ch.catalog.build(PR(), { remote_id: '1000', attrs: {} }, { opts })).missing, []);
    assert.deepEqual((await ch.catalog.build(PR({ barcode: '' }), { remote_id: '1000', attrs: {} }, { opts })).missing, ['barkod']);
  } finally { m.restore(); }
});
