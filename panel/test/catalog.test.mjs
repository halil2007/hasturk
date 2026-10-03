// Kategori eşleştirme + Trendyol'a ürün yükleme: doğru kategori/özellik/marka kimlikleriyle gönderilir, durum sorgulanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import worker from '../src/index.js';

test('Ürün yükle: eşleştirme, eksik kontrolü, Trendyol gönderimi ve durum', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', DB: db, TRENDYOL_SELLER_ID: '123', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
  const t = Date.now();
  await run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, vat, desi, stock, group_name, variant_name, parent_key, created_at, updated_at)
    VALUES ('SOL-5', '869001', 'Solucan Gübresi 5 Kg', 'HG', 'Gübre', 'https://cdn.myikas.com/images/m/i/360/a.webp', 100, 10, 2, 7, 'Solucan Gübresi', '5 Kg', 'ikas1:P1', ?, ?)`, t, t);
  await run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, stock, created_at, updated_at) VALUES ('NOBC', '', 'Barkodsuz', 'HG', 'Gübre', '', 50, 3, ?, ?)`, t, t);
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body });
    const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (/product-categories$/.test(u)) return J({ categories: [{ id: 1, name: 'Bahçe', subCategories: [{ id: 2001, name: 'Organik Gübre', subCategories: [] }] }] });
    if (/product-categories\/2001\/attributes$/.test(u)) return J({ categoryAttributes: [
      { attribute: { id: 47, name: 'Ağırlık' }, required: true, varianter: true, allowCustom: false, attributeValues: [{ id: 901, name: '1 kg' }, { id: 905, name: '5 kg' }] },
      { attribute: { id: 1192, name: 'Menşei' }, required: true, allowCustom: false, attributeValues: [{ id: 10617, name: 'TR' }] },
      { attribute: { id: 99, name: 'Not' }, required: false, allowCustom: true, attributeValues: [] }] });
    if (/brands\/by-name/.test(u)) return J([{ id: 555, name: 'HG' }]);
    if (/v2\/products$/.test(u)) return J({}, 404);
    if (/sellers\/123\/products$/.test(u) && opts.method === 'POST') return J({ batchRequestId: 'B-1' });
    if (/batch-requests\/B-1$/.test(u)) return J({ status: 'COMPLETED', items: [{ requestItem: { barcode: '869001' }, status: 'SUCCESS', failureReasons: [] }] });
    return J({ content: [], totalPages: 1 });
  };
  try {
    let cookie = '';
    const call = async (path, o = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    const st = await call('catalog/state');
    assert.equal(st.channels.find((c) => c.id === 'trendyol').ready, true);
    assert.deepEqual(st.categories.map((c) => [c.local, c.n]), [['Gübre', 2]]);
    const cats = await call('catalog/remote-categories?channel=trendyol&q=gübre');
    assert.deepEqual(cats.items, [{ id: '2001', name: 'Organik Gübre', path: 'Bahçe' }]);
    const at = await call('catalog/attributes?channel=trendyol&category=2001');
    assert.deepEqual(at.attributes.filter((a) => a.mandatory).map((a) => a.id), ['47', '1192']);
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'trendyol', remote_id: '2001', remote_name: 'Organik Gübre', attrs: { 47: { value: '@variant' }, 1192: { id: '10617', value: 'TR' } } }) });
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'trendyol', opts: { markup: '10' } }) });
    const cand = await call('catalog/candidates?channel=trendyol&local=G%C3%BCbre');
    const ok = cand.items.find((x) => x.sku === 'SOL-5'), bad = cand.items.find((x) => x.sku === 'NOBC');
    assert.deepEqual(ok.missing, []);
    assert.equal(ok.price, 110);
    assert.ok(bad.missing.includes('barkod') && bad.missing.includes('görsel'));
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'trendyol', ids: [ok.id, bad.id] }) });
    assert.equal(up.sent, 1); assert.equal(up.ref, 'B-1'); assert.equal(up.skipped.length, 1);
    const sent = JSON.parse(calls.find((c) => /sellers\/123\/products$/.test(c.url) && c.method === 'POST').body).items[0];
    assert.equal(sent.brandId, 555); assert.equal(sent.categoryId, 2001); assert.equal(sent.productMainId, 'P1');
    assert.equal(sent.salePrice, 110); assert.equal(sent.vatRate, 10); assert.equal(sent.quantity, 7); assert.equal(sent.dimensionalWeight, 2);
    assert.deepEqual(sent.attributes, [{ attributeId: 47, attributeValueId: 905 }, { attributeId: 1192, attributeValueId: 10617 }]);
    assert.equal(sent.images[0].url, 'https://cdn.myikas.com/images/m/i/1080/a.webp');
    const ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true); assert.equal(ck.items[0].ok, true);
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});
