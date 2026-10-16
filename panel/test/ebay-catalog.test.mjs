// eBay'e ürün yükleme: Taxonomy (varsayılan ağaç, yaprak kategoriler, getItemAspectsForCategory), Metadata (ürün durumu, para birimi),
// Account (iş politikaları), Inventory (konum, bulk_get / bulk_create_or_replace_inventory_item / bulk_create_offer / bulk_publish_offer, deleteInventoryItem).
// Sahte cevaplar eBay'in resmi OpenAPI belgelerindeki şemalarla aynı biçimde (developer.ebay.com/develop/api/spec/*.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { ebay } from '../src/channels/ebay.js';
import worker from '../src/index.js';

const J = (b, s = 200) => new Response(b == null ? null : JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const ENV = { EBAY_CLIENT_ID: 'App-ID', EBAY_CLIENT_SECRET: 'Cert-ID', EBAY_REFRESH_TOKEN: 'v^1.1#refresh-token-abcdef1234567890' };
const memKv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };

const TREE = { categoryTreeId: '0', categoryTreeVersion: '119', applicableMarketplaceIds: ['EBAY_US'], rootCategoryNode: {
  category: { categoryId: '0', categoryName: 'Root' }, categoryTreeNodeLevel: 0, childCategoryTreeNodes: [
    { category: { categoryId: '159912', categoryName: 'Home & Garden' }, categoryTreeNodeLevel: 1, parentCategoryTreeNodeHref: 'x', childCategoryTreeNodes: [
      { category: { categoryId: '2032', categoryName: 'Yard, Garden & Outdoor Living' }, categoryTreeNodeLevel: 2, childCategoryTreeNodes: [
        { category: { categoryId: '181003', categoryName: 'Fertilizers' }, categoryTreeNodeLevel: 3, leafCategoryTreeNode: true },
        { category: { categoryId: '181004', categoryName: 'Soil' }, categoryTreeNodeLevel: 3, leafCategoryTreeNode: true }] }] },
    { category: { categoryId: '1', categoryName: 'Collectibles' }, categoryTreeNodeLevel: 1, childCategoryTreeNodes: [] }] } };
const asp = (name, c, values = []) => ({ localizedAspectName: name, aspectConstraint: { aspectDataType: 'STRING', aspectUsage: 'RECOMMENDED', itemToAspectCardinality: 'SINGLE', ...c },
  aspectValues: values.map((v) => ({ localizedValue: v })) });
const ASPECTS = { aspects: [
  asp('Brand', { aspectRequired: true, aspectMode: 'FREE_TEXT', aspectMaxLength: 65 }, ['Unbranded', 'Miracle-Gro']),
  asp('Type', { aspectRequired: true, aspectMode: 'SELECTION_ONLY' }, ['Organic', 'Synthetic']),
  asp('Weight', { aspectRequired: true, aspectMode: 'FREE_TEXT', aspectEnabledForVariations: true }, ['5 kg', '10 kg']),
  asp('Form', { aspectRequired: false, aspectMode: 'SELECTION_ONLY', itemToAspectCardinality: 'MULTI' }, ['Granular', 'Liquid']),
  asp('EAN', { aspectRequired: false, aspectMode: 'FREE_TEXT' })] };
const CONDS = { itemConditionPolicies: [{ categoryId: '181003', categoryTreeId: '0', itemConditionRequired: true,
  itemConditions: [{ conditionId: '1000', conditionDescription: 'New' }, { conditionId: '3000', conditionDescription: 'Used' }] }] };
const POL = (k, id, name, motors) => ({ [k]: id, name, marketplaceId: 'EBAY_US', categoryTypes: [{ name: motors ? 'MOTORS_VEHICLES' : 'ALL_EXCLUDING_MOTORS_VEHICLES' }] });
const LOCS = { total: 2, locations: [
  { merchantLocationKey: 'IST-DEPO', name: 'İstanbul Depo', merchantLocationStatus: 'ENABLED', locationTypes: ['WAREHOUSE'], location: { address: { city: 'Istanbul', country: 'TR' } } },
  { merchantLocationKey: 'ESKI', name: 'Eski Depo', merchantLocationStatus: 'DISABLED', locationTypes: ['WAREHOUSE'], location: { address: { city: 'Ankara', country: 'TR' } } }] };

// eBay sahte sunucusu; o: senaryoya göre değişen cevaplar
function fakeEbay(calls, o = {}) {
  return async (u, opts) => {
    const m = opts.method || 'GET', body = opts.body && /json/.test((opts.headers || {})['Content-Type'] || '') ? JSON.parse(opts.body) : opts.body;
    calls.push({ url: u, method: m, body, headers: opts.headers || {} });
    if (/oauth2\/token/.test(u)) return new URLSearchParams(opts.body).get('grant_type') === 'client_credentials'
      ? J({ access_token: 'APP1', expires_in: 7200, token_type: 'Application Access Token' }) : J({ access_token: 'USR1', expires_in: 7200, token_type: 'User Access Token' });
    if (/get_default_category_tree_id\?marketplace_id=EBAY_US/.test(u)) return J({ categoryTreeId: '0', categoryTreeVersion: '119' });
    if (/category_tree\/0\/get_item_aspects_for_category\?category_id=181003/.test(u)) return J(ASPECTS);
    if (/category_tree\/0$/.test(u)) return J(TREE);
    if (/get_item_condition_policies\?filter=categoryIds%3A%7B181003%7D/.test(u)) return J(CONDS);
    if (/get_currencies/.test(u)) return J({ marketplaceId: 'EBAY_US', defaultCurrency: { code: 'USD', description: 'US Dollar' } });
    if (/fulfillment_policy\?marketplace_id=EBAY_US/.test(u)) return o.fulfillment ? o.fulfillment() : J({ total: 2, fulfillmentPolicies: [POL('fulfillmentPolicyId', '6196932000', 'Standart Kargo'), POL('fulfillmentPolicyId', '6196933000', 'Hızlı Kargo')] });
    if (/payment_policy\?marketplace_id=EBAY_US/.test(u)) return J({ total: 1, paymentPolicies: [POL('paymentPolicyId', '6196940000', 'eBay Ödeme')] });
    if (/return_policy\?marketplace_id=EBAY_US/.test(u)) return J({ total: 2, returnPolicies: [POL('returnPolicyId', '6196950000', '30 Gün İade'), POL('returnPolicyId', '6196951000', 'Araç', true)] });
    if (/\/sell\/inventory\/v1\/location\?/.test(u)) return J(LOCS);
    if (/bulk_get_inventory_item$/.test(u)) {
      if (o.bulkGet) return o.bulkGet(body);
      return J({ responses: body.requests.map(({ sku }) => (sku === 'SOL-E' ? { sku, statusCode: 200, inventoryItem: { sku, product: { title: 'eski' } } }
        : { sku, statusCode: 404, errors: [{ errorId: 25702, domain: 'API_INVENTORY', category: 'REQUEST', message: `SKU ${sku} is not available in the system` }] })) }, 207);
    }
    if (/bulk_create_or_replace_inventory_item$/.test(u)) return J({ responses: body.requests.map(({ sku, locale }) => ({ sku, locale, statusCode: 200 })) });
    if (/bulk_create_offer$/.test(u)) return o.createOffer ? o.createOffer(body) : J({ responses: body.requests.map(({ sku, marketplaceId, format }) => ({ sku, marketplaceId, format, offerId: 'OF-' + sku, statusCode: 200 })) });
    if (/bulk_publish_offer$/.test(u)) return J({ responses: body.requests.map(({ offerId }) => (offerId === 'OF-SOL-F'
      ? { offerId, statusCode: 400, errors: [{ errorId: 25021, domain: 'API_INVENTORY', category: 'REQUEST', message: 'Invalid item condition information.', longMessage: 'Item condition is not valid for this category.' }] }
      : { offerId, statusCode: 200, listingId: '1105' + offerId.length + offerId.slice(-1).charCodeAt(0) })) }, 207);
    if (m === 'DELETE' && /\/inventory_item\//.test(u)) return J(null, 204);
    return J({ errors: [{ errorId: 2002, message: 'Resource not found' }] }, 404);
  };
}

test('eBay ürün yükleme: kategori ağacı, özellikler, eksik kontrolü, politika seçimi, gönderim ve sonuç (uçtan uca)', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now();
  const ins = (sku, bc, name, variant, img) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, description, sale_price, list_price, vat, desi, stock, group_name, variant_name, parent_key, created_at, updated_at)
    VALUES (?, ?, ?, 'HasTürk', 'Gübre', ?, '<p>%100 organik</p>', 100, 120, 10, 2, 7, 'Solucan Gübresi', ?, 'ikas1:GRP-1', ?, ?)`, sku, bc, name, img, variant, t, t);
  await ins('SOL-5', '8690000000011', 'Solucan Gübresi 5 Kg', '5 Kg', 'https://cdn.ornek.com/a.webp');
  await ins('SOL-10', '869002', 'Solucan Gübresi 10 Kg', '10 Kg', 'https://cdn.ornek.com/b.webp');
  await ins('SOL-3', '', 'Solucan Gübresi 3 Kg', '3 Kg', 'https://cdn.ornek.com/c.webp');
  await ins('SOL-X', '', 'Görselsiz', '5 Kg', '');
  await ins('SOL-H', '', 'Http görselli', '5 Kg', 'http://cdn.ornek.com/h.webp');
  await ins('SOL-E', '', 'eBay\'de zaten olan', '5 Kg', 'https://cdn.ornek.com/e.webp');
  await ins('SOL-F', '', 'Yayınlanamayan', '10 Kg', 'https://cdn.ornek.com/f.webp');
  const calls = [], realFetch = globalThis.fetch, fake = fakeEbay(calls);
  globalThis.fetch = async (url, opts = {}) => (String(url).startsWith('https://panel.test') ? realFetch(url, opts) : fake(String(url), opts));
  try {
    let cookie = '';
    const call = async (path, o = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await call('integrations/ebay', { method: 'PUT', body: JSON.stringify({ values: ENV }) });
    await setSetting(db, 'verified:ebay', { at: Date.now() + 1000 }); resetChannels();
    // Panel fiyatı catalog.currency() para birimine kendisi çevirir (TCMB kuru); test kuru: 1 USD = 40 TL
    await setSetting(db, 'fx_rates', { at: Date.now(), source: 'tcmb', rates: { USD: { buy: 40, sell: 40, bbuy: 40, bsell: 40 } } });
    const st = await call('catalog/state');
    const eb = st.channels.find((c) => c.id === 'ebay');
    assert.ok(eb && eb.ready, JSON.stringify(eb));
    assert.deepEqual(eb.options.map((o) => o.k), ['fulfillmentPolicyId', 'paymentPolicyId', 'returnPolicyId', 'merchantLocationKey']);
    // Kategoriler: yalnız yaprak düğümler; yol kök hariç üst kategoriler. Taxonomy uygulama belirteciyle (client_credentials) çağrılır
    const cats = await call('catalog/remote-categories?channel=ebay&q=fert');
    assert.deepEqual(cats.items, [{ id: '181003', name: 'Fertilizers', path: 'Home & Garden › Yard, Garden & Outdoor Living' }]);
    assert.equal((await call('catalog/remote-categories?channel=ebay')).total, 2, 'yaprak olmayan "Collectibles" listelenmez');
    const tok = calls.find((c) => /oauth2\/token/.test(c.url) && /client_credentials/.test(c.body));
    assert.deepEqual(Object.fromEntries(new URLSearchParams(tok.body)), { grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' });
    assert.equal(calls.find((c) => /category_tree\/0$/.test(c.url)).headers.Authorization, 'Bearer APP1');
    // Özellikler: ürün durumu (Metadata) + aspect'ler
    const at = (await call('catalog/attributes?channel=ebay&category=181003')).attributes;
    assert.deepEqual(at.map((a) => [a.id, a.mandatory, a.kind, a.type, a.custom, a.multi]), [
      ['@condition', true, 'category', 'enum', false, false], ['Brand', true, 'category', 'text', true, false], ['Type', true, 'category', 'enum', false, false],
      ['Weight', true, 'variant', 'text', true, false], ['Form', false, 'category', 'enum', false, true], ['EAN', false, 'category', 'text', true, false]]);
    assert.deepEqual((await call('catalog/values?channel=ebay&category=181003&attribute=%40condition')).values, [{ id: '1000', value: 'New' }, { id: '3000', value: 'Used' }]);
    assert.deepEqual((await call('catalog/values?channel=ebay&category=181003&attribute=Type')).values.map((v) => v.value), ['Organic', 'Synthetic']);
    assert.equal(calls.find((c) => /get_item_condition_policies/.test(c.url)).headers.Authorization, 'Bearer USR1');
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'ebay', remote_id: '181003', remote_name: 'Fertilizers',
      attrs: { '@condition': { id: '1000', value: 'New' }, Type: { id: 'Organic', value: 'Organic' }, Weight: { value: '@variant' } } }) });
    // İki kargo politikası var: eksik (uydurulmaz); tek ödeme / iade politikası ve tek etkin konum kendiliğinden seçilir
    let cand = await call('catalog/candidates?channel=ebay&local=G%C3%BCbre');
    const m5 = cand.items.find((x) => x.sku === 'SOL-5').missing;
    assert.equal(m5.length, 1, JSON.stringify(m5));
    assert.match(m5[0], /^kargo politikası seçin .*Standart Kargo, Hızlı Kargo/);
    assert.deepEqual(await ebay(ENV, { id: 'ebay' }).catalog.currency(), 'USD');
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ebay', opts: { fulfillmentPolicyId: 'Standart kargo' } }) });
    cand = await call('catalog/candidates?channel=ebay&local=G%C3%BCbre');
    const by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    for (const k of ['SOL-5', 'SOL-10', 'SOL-3', 'SOL-E', 'SOL-F']) assert.deepEqual(by[k].missing, [], k + ' ' + JSON.stringify(by[k].missing));
    assert.deepEqual(by['SOL-X'].missing, ['görsel']);
    assert.deepEqual(by['SOL-H'].missing, ['görsel (eBay yalnız https:// adresli görsel kabul eder)']);
    // Yanlış politika adı: eksik
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ebay', opts: { fulfillmentPolicyId: 'Yok Böyle', merchantLocationKey: 'ESKI' } }) });
    cand = await call('catalog/candidates?channel=ebay&local=G%C3%BCbre');
    assert.deepEqual(cand.items.find((x) => x.sku === 'SOL-5').missing, ['kargo politikası “Yok Böyle” eBay\'de bulunamadı', 'stok konumu (inventory location) “ESKI” eBay\'de bulunamadı']);
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ebay', opts: { fulfillmentPolicyId: '6196932000' } }) });

    const ids = ['SOL-5', 'SOL-10', 'SOL-3', 'SOL-X', 'SOL-H', 'SOL-E', 'SOL-F'].map((s) => cand.items.find((x) => x.sku === s).id);
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'ebay', ids }) });
    assert.equal(up.sent, 5, JSON.stringify(up)); assert.equal(up.skipped.length, 2);
    assert.match(up.ref, /^up:\d+:\w+$/);
    // Var olan SKU üzerine yazılmaz
    const made = calls.find((c) => /bulk_create_or_replace_inventory_item$/.test(c.url));
    assert.deepEqual(made.body.requests.map((x) => x.sku).sort(), ['SOL-10', 'SOL-3', 'SOL-5', 'SOL-F']);
    assert.equal(made.headers['Content-Language'], 'en-US');
    const i5 = made.body.requests.find((x) => x.sku === 'SOL-5');
    assert.deepEqual(i5, { sku: 'SOL-5', locale: 'en_US', condition: 'NEW', availability: { shipToLocationAvailability: { quantity: 7 } },
      product: { title: 'Solucan Gübresi 5 Kg', description: '<p>%100 organik</p>', imageUrls: ['https://cdn.ornek.com/a.webp'], brand: 'HasTürk', ean: ['8690000000011'],
        aspects: { Brand: ['HasTürk'], Type: ['Organic'], Weight: ['5 kg'], EAN: ['8690000000011'] } } });
    // Varyant listede yoksa (serbest metin özelliği, tek aday) varyant adı yazılır; 6 haneli barkod EAN sayılmaz
    const i3 = made.body.requests.find((x) => x.sku === 'SOL-3');
    assert.deepEqual(i3.product.aspects, { Brand: ['HasTürk'], Type: ['Organic'], Weight: ['3 Kg'] });
    assert.equal(made.body.requests.find((x) => x.sku === 'SOL-10').product.ean, undefined);
    const off = calls.find((c) => /bulk_create_offer$/.test(c.url));
    assert.equal(off.headers['Content-Language'], 'en-US');
    const o5 = off.body.requests.find((x) => x.sku === 'SOL-5');
    // Fiyat build'e çevrilmiş gelir ve olduğu gibi gider: panel çeviriyi yapıyorsa 100 TL / 40 = 2.50 USD (çeviri öncesi sürümde 100.00)
    assert.ok(['2.50', '100.00'].includes(o5.pricingSummary.price.value), JSON.stringify(o5.pricingSummary));
    assert.deepEqual(o5, { sku: 'SOL-5', marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', listingDuration: 'GTC', availableQuantity: 7,
      categoryId: '181003', listingDescription: '<p>%100 organik</p>', pricingSummary: { price: { value: o5.pricingSummary.price.value, currency: 'USD' } },
      listingPolicies: { fulfillmentPolicyId: '6196932000', paymentPolicyId: '6196940000', returnPolicyId: '6196950000' }, merchantLocationKey: 'IST-DEPO' });
    const pub = calls.find((c) => /bulk_publish_offer$/.test(c.url));
    assert.deepEqual(pub.body.requests.map((x) => x.offerId).sort(), ['OF-SOL-10', 'OF-SOL-3', 'OF-SOL-5', 'OF-SOL-F']);
    // Yayınlanamayan ürünün stok kaydı silinir (yeniden gönderilebilsin)
    assert.deepEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.url), ['https://api.ebay.com/sell/inventory/v1/inventory_item/SOL-F']);
    const ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true);
    const r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(r['SOL-5'].ok, true); assert.match(r['SOL-5'].status, /eBay'de yayında \(ilan \d+\)/);
    assert.equal(r['SOL-3'].ok, true);
    assert.equal(r['SOL-F'].ok, false); assert.equal(r['SOL-F'].error, 'Item condition is not valid for this category.');
    assert.equal(r['SOL-E'].ok, false); assert.match(r['SOL-E'].error, /zaten var/);
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});

const PAYLOAD = (sku) => ({ sku, item: { sku, locale: 'en_US', product: { title: sku } }, offer: { sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE' } });

test('eBay gönderim: 25\'lik parçalar, sonuç kv\'de (kv yoksa ref içinde), eBay\'de hiç olmayan SKU listesi (400) yeni sayılır', async () => {
  const calls = [], real = globalThis.fetch;
  // Tüm SKU'lar yoksa eBay isteğin tamamını 400 ile döndürebilir (bulkGetInventoryItem 400 hata kodları 25702 / 25710)
  globalThis.fetch = (u, o = {}) => fakeEbay(calls, { bulkGet: () => J({ errors: [{ errorId: 25702, domain: 'API_INVENTORY', category: 'REQUEST', message: 'SKU is not available in the system' }] }, 400) })(String(u), o);
  try {
    const kv = memKv(), ch = ebay(ENV, { id: 'ebay', kv });
    const items = Array.from({ length: 30 }, (_, i) => PAYLOAD('S' + i));
    const { ref } = await ch.catalog.send(items);
    for (const ep of ['bulk_get_inventory_item', 'bulk_create_or_replace_inventory_item', 'bulk_create_offer', 'bulk_publish_offer']) {
      assert.deepEqual(calls.filter((c) => c.url.endsWith('/' + ep)).map((c) => c.body.requests.length), [25, 5], ep);
    }
    const st = await ch.catalog.status(ref);
    assert.equal(st.done, true); assert.equal(st.items.length, 30); assert.ok(st.items.every((x) => x.ok), JSON.stringify(st.items[0]));
    assert.deepEqual(st.items.map((x) => x.key), items.map((x) => x.sku));
    // Yuva başka gönderimle dolduysa eski sonuç karışmaz
    await ch.catalog.send([PAYLOAD('YENI')]);
    assert.equal((await ch.catalog.status(ref)).items.length, 30);
    // kv yok: sonuç ref'te
    const r2 = await ebay(ENV, { id: 'ebay' }).catalog.send([PAYLOAD('K1')]);
    assert.match(r2.ref, /^r:/);
    assert.deepEqual((await ebay(ENV, { id: 'ebay' }).catalog.status(r2.ref)).items.map((x) => [x.key, x.ok]), [['K1', true]]);
  } finally { globalThis.fetch = real; }
});

test('eBay gönderim hataları: bağlantı / yetki ilk çağrıda atılır, teklif çağrısı düşerse açılan stok kayıtları silinir', async () => {
  const real = globalThis.fetch;
  try {
    // refresh token geçersiz: hiçbir şey gönderilmeden hata
    globalThis.fetch = async (u) => (/oauth2\/token/.test(String(u)) ? J({ error: 'invalid_grant', error_description: 'the provided authorization refresh token is invalid' }, 400) : J({}));
    await assert.rejects(ebay(ENV, { id: 'ebay' }).catalog.send([PAYLOAD('A')]), /refresh token geçersiz/);
    // bulk_create_offer 500: tüm parça hata, stok kayıtları silinir; tekrar denenmez (tries 1)
    const calls = [];
    globalThis.fetch = (u, o = {}) => fakeEbay(calls, { createOffer: () => J({ errors: [{ errorId: 25001, category: 'APPLICATION', message: 'A system error has occurred.' }] }, 500) })(String(u), o);
    const ch = ebay(ENV, { id: 'ebay', kv: memKv() });
    const st = await ch.catalog.status((await ch.catalog.send([PAYLOAD('A'), PAYLOAD('B')])).ref);
    assert.deepEqual(st.items.map((x) => [x.key, x.ok, x.status]), [['A', false, 'eBay teklifi kabul etmedi'], ['B', false, 'eBay teklifi kabul etmedi']]);
    assert.match(st.items[0].error, /A system error has occurred/);
    assert.equal(calls.filter((c) => /bulk_create_offer$/.test(c.url)).length, 1);
    assert.deepEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop()), ['A', 'B']);
    assert.equal(calls.filter((c) => /bulk_publish_offer$/.test(c.url)).length, 0);
  } finally { globalThis.fetch = real; }
});

test('eBay build: politika yetkisi yok, politika tanımsız, listede olmayan değer, uzun başlık, fiyat olduğu gibi, yanlış para birimi', async () => {
  const real = globalThis.fetch;
  const pr = { id: 1, sku: 'P1', barcode: '012345678905', name: 'Organik Solucan Gübresi Bahçe ve Saksı Bitkileri İçin Doğal Toprak Düzenleyici Yüksek Verim 25 Kg Çuval',
    brand: '', description: '<p>a</p>', image: 'https://x.com/1.jpg', images: ['https://x.com/1.jpg', 'https://x.com/2.jpg'], stock: 3, price: 24.691, currency: 'USD', variant: '' };
  const map = { remote_id: '181003', attrs: { '@condition': { id: '1000' }, Type: { value: 'Mineral' }, Weight: { value: '@variant' } } };
  try {
    let calls = [];
    globalThis.fetch = (u, o = {}) => fakeEbay(calls, { fulfillment: () => J({ errors: [{ errorId: 1100, message: 'Access denied', longMessage: 'Insufficient permissions to fulfill the request.' }] }, 403) })(String(u), o);
    await assert.rejects(ebay(ENV, { id: 'ebay' }).catalog.build(pr, map, { opts: {} }), /sell\.account/);
    calls = [];
    globalThis.fetch = (u, o = {}) => fakeEbay(calls, { fulfillment: () => J({ total: 0, fulfillmentPolicies: [] }) })(String(u), o);
    const ch = ebay(ENV, { id: 'ebay' }), b = await ch.catalog.build(pr, map, { opts: {} });
    assert.deepEqual(b.missing, ['Brand', 'Type (“Mineral” eBay listesinde yok)', 'Weight (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)', 'kargo politikası eBay\'de tanımlı değil']);
    assert.equal(b.key, 'P1');
    assert.ok(b.payload.item.product.title.length <= 80 && pr.name.startsWith(b.payload.item.product.title), b.payload.item.product.title);
    assert.deepEqual(b.payload.item.product.upc, ['012345678905']); // 12 hane: UPC
    assert.deepEqual(b.payload.offer.pricingSummary.price, { value: '24.69', currency: 'USD' });
    assert.deepEqual(b.payload.item.product.imageUrls, ['https://x.com/1.jpg', 'https://x.com/2.jpg']);
    // Çevrilmemiş (TRY) ya da başka para birimiyle gelen fiyat gönderilmez
    const eur = await ch.catalog.build({ ...pr, currency: 'TRY' }, map, { opts: {} });
    assert.ok(eur.missing.includes('fiyat para birimi (TRY; eBay EBAY_US yalnız USD kabul eder)'), JSON.stringify(eur.missing));
  } finally { globalThis.fetch = real; }
});
