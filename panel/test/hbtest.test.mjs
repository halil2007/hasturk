// Hepsiburada canlıya geçiş testi (SIT) uç noktaları: doğru adreslere doğru istekler gider, sonuçlar saklanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import worker from '../src/index.js';

test('Hepsiburada test adımları: kategori, ürün gönderme (trackingId), stok/fiyat, test siparişi, temizlik', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', DB: db, HB_MERCHANT_ID: 'M-1', HB_PASSWORD: 'sk', HB_USER_AGENT: 'hasturkgubre_dev', HB_TEST: '1' };
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (/get-all-categories/.test(u)) return J({ data: [{ categoryId: 60001, name: 'Bitki Besini ve Gübre', paths: ['Bahçe', 'Gübre'] }, { categoryId: 60002, name: 'Saksı', paths: ['Bahçe'] }], totalPages: 1 });
    if (/categories\/60001\/attributes/.test(u)) return J({ data: { baseAttributes: [{ id: 'merchantSku', name: 'Satıcı Stok Kodu', mandatory: true }, { id: 'UrunAdi', name: 'Ürün Adı', mandatory: true }], attributes: [{ id: '00001', name: 'Ağırlık', mandatory: false, type: 'enum' }], variantAttributes: [] } });
    if (/products\/import$/.test(u)) return J({ success: true, data: { trackingId: 'TRK-123' } });
    if (/stock-uploads$/.test(u)) return J({ id: 'stk-1' });
    if (/price-uploads$/.test(u)) return J({ id: 'prc-1' });
    if (/oms-stub-external-sit\.hepsiburada\.com\/orders\/merchantId\/M-1$/.test(u)) return J({ orderNumber: '9001' });
    if (/listings\/merchantid\/M-1\?/.test(u)) return J({ listings: [{ hepsiburadaSku: 'HBV1', merchantSku: 'A1', productName: 'Test ürünü', price: 99, availableStock: 5 }] });
    return J([]);
  };
  try {
    let cookie = '';
    const call = async (path, opts = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    const st = await call('hbtest/state');
    assert.equal(st.ready, true); assert.equal(st.test, true); assert.equal(st.merchantId, 'M-1');
    const cats = await call('hbtest/categories?q=gübre');
    assert.deepEqual(cats.items.map((c) => c.id), ['60001']);
    assert.match(calls[0].url, /^https:\/\/mpop-sit\.hepsiburada\.com\/product\/api\/categories\/get-all-categories\?/);
    assert.equal(calls[0].headers['User-Agent'], 'hasturkgubre_dev');
    assert.equal(calls[0].headers.Authorization, 'Basic ' + btoa('M-1:sk'));
    const at = await call('hbtest/attributes?category=60001');
    assert.equal(at.attributes.filter((a) => a.mandatory).length, 2);
    const imp = await call('hbtest/import', { method: 'POST', body: JSON.stringify({ products: [{ categoryId: 60001, merchant: 'M-1', attributes: { merchantSku: 'A1', UrunAdi: 'Test' } }] }) });
    assert.equal(imp.trackingId, 'TRK-123');
    const ic = calls.find((c) => /products\/import$/.test(c.url));
    assert.ok(ic.body instanceof FormData, 'ürün dizisi JSON dosyası olarak (multipart "file") gönderilir');
    assert.deepEqual(JSON.parse(await ic.body.get('file').text())[0].attributes, { merchantSku: 'A1', UrunAdi: 'Test' });
    assert.equal((await call('hbtest/inventory', { method: 'POST' })).count, 1);
    const ls = await call('hbtest/listing', { method: 'POST', body: JSON.stringify({ hbSku: 'HBV1', merchantSku: 'A1', stock: 7, price: '120.5' }) });
    assert.deepEqual([ls.stockUploadId, ls.priceUploadId], ['stk-1', 'prc-1']);
    assert.deepEqual(JSON.parse(calls.find((c) => /stock-uploads$/.test(c.url)).body), [{ hepsiburadaSku: 'HBV1', merchantSku: 'A1', availableStock: 7 }]);
    assert.deepEqual(JSON.parse(calls.find((c) => /price-uploads$/.test(c.url)).body), [{ hepsiburadaSku: 'HBV1', merchantSku: 'A1', price: 120.5 }]);
    const o = await call('hbtest/order', { method: 'POST', body: JSON.stringify({ body: { OrderNumber: '9001', LineItems: [{ Sku: 'HBV1', Quantity: 1 }] } }) });
    assert.equal(o.orderNumber, '9001');
    const after = await call('hbtest/state');
    assert.deepEqual([after.results.trackingId, after.results.stockUploadId, after.results.priceUploadId, after.results.testOrder], ['TRK-123', 'stk-1', 'prc-1', '9001']);
    const cl = await call('hbtest/cleanup', { method: 'POST' });
    assert.equal(typeof cl.orders, 'number');
    assert.equal((await call('hbtest/state')).listings.length, 0);
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});

test('Hepsiburada test siparişi canlı ortamda reddedilir', async () => {
  const { hepsiburada } = await import('../src/channels/hepsiburada.js');
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'x', HB_USER_AGENT: 'u' }, { id: 'hepsiburada' });
  await assert.rejects(() => ch.sit.createTestOrder({}), /yalnızca test \(SIT\)/);
});

test('Hepsiburada ürün gönderimi: 415 ise JSON gövdeyle; aracı sunucu hatasında gerçek adres görünür; 500 tekrar gönderilmez', async () => {
  const { hepsiburada } = await import('../src/channels/hepsiburada.js');
  const realFetch = globalThis.fetch, calls = [];
  const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    globalThis.fetch = async (url, o = {}) => { calls.push({ url: String(url), body: o.body }); return o.body instanceof FormData ? J({ message: 'Unsupported Media Type' }, 415) : J({ data: { trackingId: 'T-9' } }); };
    const ch = hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'x', HB_USER_AGENT: 'u' }, { id: 'hepsiburada' });
    assert.equal((await ch.sit.importProducts([{ a: 1 }])).trackingId, 'T-9');
    assert.equal(JSON.parse(calls[1].body)[0].a, 1);
    calls.length = 0;
    globalThis.fetch = async (url, o = {}) => { calls.push({ url: String(url) }); return J({ message: 'global.messages.error.internalServerError' }, 500); };
    const px = hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'x', HB_USER_AGENT: 'u', HB_PROXY_URL: 'https://p.halil.deno.net', HB_PROXY_KEY: 'k'.repeat(30) }, { id: 'hepsiburada' });
    await assert.rejects(() => px.sit.importProducts([{ a: 1 }]), (e) => /mpop\.hepsiburada\.com\/product\/api\/products\/import \(aracı sunucu üzerinden\): HTTP 500/.test(e.message) && !/deno\.net/.test(e.message));
    assert.equal(calls.length, 1, '500 hatasında ürünler ikinci kez gönderilmez');
  } finally { globalThis.fetch = realFetch; }
});
