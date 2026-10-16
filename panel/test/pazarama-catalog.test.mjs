// Pazarama'ya ürün yükleme: kategori listesi (düz, leaf), özellikler (listeden değer), marka (GUID), product/create (500'lük parça),
// toplu işlem sonucu (yalnız hatalılar listelenir; kalanlar kabul)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import worker from '../src/index.js';

const G = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
test('Pazarama ürün yükleme: eşleştirme, eksik kontrolü, gönderim ve sonuç (hatalı ürün nedeniyle)', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now();
  const ins = (sku, bc, name, variant, img) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, list_price, vat, desi, stock, group_name, variant_name, parent_key, created_at, updated_at)
    VALUES (?, ?, ?, 'HG', 'Gübre', ?, 100, 120, 10, 2.4, 7, 'Solucan Gübresi', ?, 'ikas1:PRODUCT-GROUP-LONG-1', ?, ?)`, sku, bc, name, img, variant, t, t);
  await ins('SOL-5', '869001', 'Solucan Gübresi 5 Kg', '5 Kg', 'https://cdn.ornek.com/a.webp');
  await ins('SOL-10', '869002', 'Solucan Gübresi 10 Kg', '10 Kg', 'https://cdn.ornek.com/b.webp');
  await ins('SOL-X', '', 'Barkodsuz', '1 Kg', '');
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body });
    const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (/connect\/token/.test(u)) return J({ data: { accessToken: 'tok', expiresIn: 3600 } });
    if (/getCategoryTree/.test(u)) return J({ success: true, data: [
      { id: G(1), parentId: null, parentCategories: [], name: 'Bahçe', displayName: 'Bahçe', leaf: false },
      { id: G(2), parentId: G(1), parentCategories: ['Bahçe', 'Gübre'], name: 'Organik Gübre', displayName: 'Organik Gübre', leaf: true }] });
    if (/getCategoryWithAttributes\?Id=/.test(u)) return J({ success: true, data: { id: G(2), name: 'Organik Gübre', attributes: [
      { id: G(47), name: 'Ağırlık', isVariantable: true, isRequired: true, attributeValues: [{ id: G(901), value: '5 kg' }, { id: G(902), value: '10 kg' }] },
      { id: G(48), name: 'Menşei', isVariantable: false, isRequired: true, attributeValues: [{ id: G(903), value: 'Türkiye' }] }] } });
    if (/brand\/getBrands/.test(u)) return J({ success: true, data: [{ id: G(555), name: 'HG' }, { id: G(556), name: 'HG Bahçe' }] });
    if (/product\/create/.test(u)) return J({ success: true, data: { batchRequestId: 'aaaaaaaa-1111-2222-3333-444444444444', error: { errors: [], message: null } }, userMessage: 'Ürün ekleme isteği iletildi.' });
    if (/getProductBatchResult/.test(u)) return J({ success: true, data: { status: 2, totalCount: 2, successfulCount: 1, failedCount: 1, failedProducts: [{ productName: 'Solucan Gübresi 10 Kg', productCode: '869002', errorReason: 'İndirimli satış fiyatı boş olmamalıdır!' }] } });
    return J({ success: true, data: [] });
  };
  try {
    let cookie = '';
    const call = async (path, o = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await call('integrations/pazarama', { method: 'PUT', body: JSON.stringify({ values: { PAZARAMA_CLIENT_ID: 'id', PAZARAMA_CLIENT_SECRET: 'sec' } }) });
    await setSetting(db, 'verified:pazarama', { at: Date.now() + 1000 }); resetChannels();
    const st = await call('catalog/state');
    const pz = st.channels.find((c) => c.id === 'pazarama');
    assert.ok(pz && pz.ready, JSON.stringify(pz));
    // Kategori: yalnız son kategoriler, yol üst kategorilerden
    const cats = await call('catalog/remote-categories?channel=pazarama&q=gübre');
    assert.deepEqual(cats.items, [{ id: G(2), name: 'Organik Gübre', path: 'Bahçe › Gübre' }]);
    const at = await call(`catalog/attributes?channel=pazarama&category=${G(2)}`);
    assert.deepEqual(at.attributes.filter((a) => a.mandatory).map((a) => a.id), [G(47), G(48)]);
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'pazarama', remote_id: G(2), remote_name: 'Organik Gübre', attrs: { [G(47)]: { value: '@variant' }, [G(48)]: { id: G(903), value: 'Türkiye' } } }) });
    const cand = await call('catalog/candidates?channel=pazarama&local=G%C3%BCbre');
    const a = cand.items.find((x) => x.sku === 'SOL-5'), b = cand.items.find((x) => x.sku === 'SOL-10'), bad = cand.items.find((x) => x.sku === 'SOL-X');
    assert.deepEqual(a.missing, []); assert.deepEqual(b.missing, []);
    assert.ok(bad.missing.includes('barkod') && bad.missing.includes('görsel'), JSON.stringify(bad.missing));
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'pazarama', ids: [a.id, b.id, bad.id] }) });
    assert.equal(up.sent, 2, JSON.stringify(up)); assert.equal(up.skipped.length, 1);
    const sent = JSON.parse(calls.find((c) => /product\/create/.test(c.url)).body).products;
    const s5 = sent.find((x) => x.code === '869001');
    assert.equal(s5.brandId, G(555)); assert.equal(s5.categoryId, G(2)); assert.equal(s5.stockCode, 'SOL-5');
    assert.equal(s5.salePrice, 100); assert.equal(s5.listPrice, 120); assert.equal(s5.vatRate, 10); assert.equal(s5.desi, 2); assert.equal(s5.stockCount, 7);
    assert.deepEqual(s5.attributes, [{ attributeId: G(47), attributeValueId: G(901) }, { attributeId: G(48), attributeValueId: G(903) }]);
    assert.equal(s5.images[0].imageurl, 'https://cdn.ornek.com/a.webp');
    // Varyantlar aynı grup kodunu alır; Pazarama sınırı 10 karakter
    const s10 = sent.find((x) => x.code === '869002');
    assert.equal(s5.groupCode, s10.groupCode); assert.ok(s5.groupCode.length <= 10, s5.groupCode);
    assert.deepEqual(s10.attributes[0], { attributeId: G(47), attributeValueId: G(902) });
    // Sonuç: listede olmayan kabul (onay bekliyor), hatalı ürün nedeniyle
    const ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true);
    const r5 = ck.items.find((x) => x.key === '869001'), r10 = ck.items.find((x) => x.key === '869002');
    assert.equal(r5.ok, true); assert.match(r5.status, /onay bekliyor/);
    assert.equal(r10.ok, false); assert.match(r10.error, /İndirimli satış fiyatı/);
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});
