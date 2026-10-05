// Hepsiburada ürün gönderimi: "Paket Görseli (ön)" gibi zorunlu görsel özellikleri ürün görselinden dolar (eksik sayılmaz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hepsiburada } from '../src/channels/hepsiburada.js';
import { isImageAttr } from '../src/util.js';

test('görsel özelliği tanıma', () => {
  assert.ok(isImageAttr({ name: 'Paket Görseli (ön)', type: 'string' }));
  assert.ok(isImageAttr({ name: 'Paket Gorseli (Arka)', type: 'url' }));
  assert.ok(!isImageAttr({ name: 'Paket Görseli', type: 'enum' }));
  assert.ok(!isImageAttr({ name: 'Ağırlık', type: 'string' }));
});

test('HB build: zorunlu paket görselleri ürün görselinden doldurulur', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const J = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (/\/api\/categories\/77\/attributes/.test(u)) return J({ data: {
      baseAttributes: [{ id: 'merchantSku', name: 'SKU', mandatory: true, type: 'string' }, { id: 'Image1', name: 'Görsel1', mandatory: true, type: 'string' }],
      attributes: [{ id: 'paket_on', name: 'Paket Görseli (ön)', mandatory: true, type: 'string' }, { id: 'paket_arka', name: 'Paket Görseli (arka)', mandatory: true, type: 'string' },
        { id: 'renk', name: 'Renk', mandatory: true, type: 'enum' }],
      variantAttributes: [] } });
    return J({});
  };
  try {
    const c = hepsiburada({ HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' }, { id: 'hepsiburada', name: 'Hepsiburada' });
    const pr = { sku: 'HGDT01', barcode: '8684568979040', name: 'Doğal Taş', brand: 'HG', price: 425, stock: 10, image: 'https://cdn/a.jpg', images: ['https://cdn/a.jpg'], vat: 20, desi: 1 };
    const r = await c.catalog.build(pr, { remote_id: '77', attrs: {} }, { pick: async () => null });
    assert.equal(r.payload.attributes.paket_on, 'https://cdn/a.jpg');
    assert.equal(r.payload.attributes.paket_arka, 'https://cdn/a.jpg');
    assert.deepEqual(r.missing, ['Renk']);
    // İkinci görsel varsa arka paket görseli odur; '@image' seçimi de ürün görseline çevrilir
    const r2 = await c.catalog.build({ ...pr, images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'] }, { remote_id: '77', attrs: { paket_on: { value: '@image' }, renk: { value: 'Beyaz' } } }, { pick: async () => null });
    assert.equal(r2.payload.attributes.paket_on, 'https://cdn/a.jpg');
    assert.equal(r2.payload.attributes.paket_arka, 'https://cdn/b.jpg');
    assert.deepEqual(r2.missing, []);
    // Görseli olmayan üründe eksik olarak kalır
    const r3 = await c.catalog.build({ ...pr, image: '', images: [] }, { remote_id: '77', attrs: { renk: { value: 'Beyaz' } } }, { pick: async () => null });
    assert.ok(r3.missing.includes('Paket Görseli (ön)'));
  } finally { globalThis.fetch = realFetch; }
});
