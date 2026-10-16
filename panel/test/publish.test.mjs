// Kanallarda yayınla: hazırlık kontrolü (eksikler, kategori önerisi, marka), ürüne özel özellik, varyant grubu tek gönderimde,
// çift gönderim engeli, kanal sonucu (yayında / reddedildi), site ürünü (ikas) oluşturma ve yetki.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, all, first } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import worker from '../src/index.js';
import { api } from '../src/api.js';
import { groupCode } from '../src/catalog.js';

const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;

async function setup({ ikas = false } = {}) {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', DB: db, TRENDYOL_SELLER_ID: '123', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's',
    ...(ikas ? { IKAS1_STORE: 'magaza', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c', IKAS1_STOCK_LOCATION_ID: 'loc1' } : {}) };
  const t = Date.now();
  const ins = (sku, bc, name, variant, extra = '') => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, list_price, vat, desi, stock, group_name, variant_name, created_at, updated_at${extra ? ', ' + extra.split('=')[0] : ''})
    VALUES (?, ?, ?, 'HG', 'Gübre', 'https://cdn.x/a.jpg', 100, 130, 10, 2, 7, 'Solucan Gübresi', ?, ?, ?${extra ? ", '" + extra.split('=')[1] + "'" : ''})`, sku, bc, name, variant, t, t);
  await ins('SOL-5', '869005', 'Solucan Gübresi 5 Kg', '5 Kg');
  await ins('SOL-10', '869010', 'Solucan Gübresi 10 Kg', '10 Kg');
  const ids = (await all(db, 'SELECT id FROM products ORDER BY id')).map((r) => r.id);
  const calls = [];
  const batches = new Map();
  let seq = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    const body = opts.body && typeof opts.body === 'string' ? (() => { try { return JSON.parse(opts.body); } catch { return opts.body; } })() : opts.body;
    calls.push({ url: u, method: opts.method || 'GET', body });
    if (/product-categories$/.test(u)) return J({ categories: [{ id: 1, name: 'Bahçe', subCategories: [{ id: 2001, name: 'Organik Gübre', subCategories: [] }, { id: 2002, name: 'Saksı Toprağı', subCategories: [] }] }] });
    if (/\/product\/categories\/200\d\/attributes$/.test(u)) return J({ categoryAttributes: [
      { attribute: { id: 47, name: 'Ağırlık' }, required: true, varianter: true, allowCustom: false, attributeValues: [{ id: 901, name: '5 kg' }, { id: 910, name: '10 kg' }] },
      { attribute: { id: 1192, name: 'Menşei' }, required: true, allowCustom: false, attributeValues: [{ id: 10617, name: 'TR' }, { id: 10618, name: 'DE' }] },
      { attribute: { id: 60, name: 'Renk' }, required: true, allowCustom: false, attributeValues: [{ id: 6001, name: 'Kahverengi' }] }] });
    if (/brands\/by-name\?name=HG$/.test(u)) return J([{ id: 555, name: 'HG' }]);
    if (/brands\/by-name/.test(u)) return J([{ id: 888, name: 'Başka Marka' }]);
    if (/sellers\/123\/v2\/products$/.test(u)) { const id = 'B-' + ++seq; batches.set(id, body.items); return J({ batchRequestId: id }); }
    const bm = /batch-requests\/(B-\d+)$/.exec(u);
    if (bm) return J({ status: 'COMPLETED', items: batches.get(bm[1]).map((it) => ({ requestItem: { barcode: it.barcode }, status: it.barcode === '869010' ? 'FAILED' : 'SUCCESS', failureReasons: it.barcode === '869010' ? ['Görsel uygun değil'] : [] })) });
    // ikas
    if (/oauth\/token/.test(u)) return J({ access_token: 'T', expires_in: 3600 });
    if (/upload\/image/.test(u)) return J(true);
    if (/myikas\.com\/api\/v1\/admin\/graphql/.test(u)) {
      const q = body.query;
      if (/listProductBrand/.test(q)) return J({ data: { listProductBrand: [{ id: 'br1', name: 'HG' }] } });
      if (/listCategory/.test(q)) return J({ data: { listCategory: [{ id: 'cat1', name: 'Gübre', parentId: null }] } });
      if (/listVariantType/.test(q)) return J({ data: { listVariantType: [] } });
      if (/saveVariantType/.test(q)) return J({ data: { saveVariantType: { id: 'vt1', name: 'Ağırlık', values: body.variables.input.values.map((v, i) => ({ id: 'vv' + i, name: v.name })) } } });
      if (/saveProduct\(/.test(q)) return J({ data: { saveProduct: { id: 'ip1', variants: body.variables.input.variants.map((v, i) => ({ id: 'iv' + i, sku: v.sku })) } } });
      if (/saveProductStockLocations/.test(q)) return J({ data: { saveProductStockLocations: true } });
      if (/listStockLocation/.test(q)) return J({ data: { listStockLocation: [{ id: 'loc1', name: 'Depo', deleted: false }] } });
      return J({ data: {} });
    }
    return J({ content: [], totalPages: 1 });
  };
  let cookie = '';
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, body: o.body && JSON.stringify(o.body), headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const b = await r.json();
    if (o.status !== undefined) assert.equal(r.status, o.status, JSON.stringify(b)); else assert.equal(r.status, 200, JSON.stringify(b));
    return b;
  };
  await call('login', { method: 'POST', body: { password: 'x-123456' } });
  return { db, env, ids, calls, call };
}
const done = () => { globalThis.fetch = realFetch; resetChannels(); };
const sends = (calls) => calls.filter((c) => /sellers\/123\/v2\/products$/.test(c.url) && c.method === 'POST');

test('grup kodu: model kodu → ikas ana ürünü → ana ürün adı → SKU', () => {
  assert.equal(groupCode({ model_code: 'M-1', parent_key: 'ikas1:P1', group_name: 'X', sku: 'S' }), 'M-1');
  assert.equal(groupCode({ parent_key: 'ikas1:P1', group_name: 'X', sku: 'S' }), 'P1');
  assert.equal(groupCode({ group_name: 'Solucan Gübresi Çiğ', sku: 'S' }), 'SOLUCAN-GUBRESI-CIG');
  assert.equal(groupCode({ sku: 'S' }), 'S');
});

test('hazırlık: eksikler, kategori önerisi, marka otomatik eşleşir; yayınla: onay, özellik, grup tek gönderimde', async () => {
  const { db, ids, calls, call } = await setup();
  try {
    const pf = await call(`catalog/preflight?ids=${ids[0]}`);
    assert.deepEqual(pf.products.map((p) => p.id).sort(), ids, 'aynı grubun diğer varyantı da gelir');
    const ty = pf.channels.find((c) => c.id === 'trendyol');
    assert.equal(ty.kind, 'market');
    const cat = ty.cats[0];
    assert.equal(cat.state, 'suggested'); assert.equal(cat.remote_id, '2001'); assert.equal(cat.name, 'Organik Gübre');
    assert.deepEqual(cat.attrs.map((a) => a.name), ['Ağırlık', 'Menşei', 'Renk']);
    assert.ok(cat.attrs[2].values.some((v) => v.value === 'Kahverengi'));
    const it = ty.items.find((x) => x.id === ids[0]);
    assert.equal(it.state, 'missing');
    assert.ok(it.missing.includes('Kategori onayı'), it.missing);
    assert.ok(it.missing.some((m) => /^Renk/.test(m)), it.missing);
    assert.ok(it.missing.includes('Kargo firması numarası'), it.missing);
    assert.equal(it.brand.state, 'ok'); assert.equal(it.brand.remote_id, '555');
    assert.deepEqual(await first(db, "SELECT remote_id FROM brand_map WHERE brand = 'HG' AND channel = 'trendyol'"), { remote_id: '555' });
    assert.equal(it.vals['47'].value, '5 kg', 'varyant adından');
    assert.equal(it.vals['1192'].value, 'TR', 'Menşei otomatik');
    assert.ok(ty.options.find((o) => o.k === 'cargoCompanyId').need);
    // Taslakla tekrar kontrol: eksik kalmaz, hiçbir şey kaydedilmez
    const draft = { ids: [ids[0]], approve: { trendyol: { category: '2001', name: 'Organik Gübre' } }, attrs: { trendyol: { 60: { id: '6001' } } }, opts: { trendyol: { cargoCompanyId: '17' } } };
    const pf2 = await call('catalog/preflight', { method: 'POST', body: draft });
    assert.deepEqual(pf2.channels[0].items.map((x) => [x.state, x.missing]), [['ready', []], ['ready', []]]);
    assert.equal((await all(db, 'SELECT * FROM category_map')).length, 0);
    assert.equal(sends(calls).length, 0);
    // Yayınla: onay kategori eşleştirmesine, özellik ürüne yazılır; iki varyant aynı gönderimde, aynı productMainId ile
    const pub = await call('catalog/publish', { method: 'POST', body: { ...draft, channels: ['trendyol'], pattrs: { [ids[1]]: { trendyol: { 1192: 'DE' } } } } });
    assert.equal(pub.results.trendyol.sent, 2);
    const s = sends(calls);
    assert.equal(s.length, 1);
    const items = s[0].body.items;
    assert.deepEqual(items.map((x) => x.productMainId), ['SOLUCAN-GUBRESI', 'SOLUCAN-GUBRESI']);
    assert.equal(items[0].categoryId, 2001); assert.equal(items[0].brandId, 555); assert.equal(items[0].cargoCompanyId, 17);
    assert.equal(items[0].listPrice, 130); assert.equal(items[0].salePrice, 100);
    const a10 = items.find((x) => x.barcode === '869010').attributes, a5 = items.find((x) => x.barcode === '869005').attributes;
    assert.deepEqual(a5, [{ attributeId: 47, attributeValueIds: [901] }, { attributeId: 1192, attributeValueIds: [10617] }, { attributeId: 60, attributeValueIds: [6001] }]);
    assert.deepEqual(a10.find((a) => a.attributeId === 1192), { attributeId: 1192, attributeValueIds: [10618] }, 'ürüne özel özellik kategori değerinin üstüne yazar');
    assert.equal((await first(db, "SELECT remote_id FROM category_map WHERE local = 'Gübre' AND channel = 'trendyol'")).remote_id, '2001');
    assert.equal((await all(db, "SELECT * FROM product_attrs WHERE attr_id = '60'")).length, 2);
    assert.deepEqual((await all(db, "SELECT state FROM product_channel WHERE channel = 'trendyol'")).map((r) => r.state), ['sent', 'sent']);
    assert.equal(pub.channels[0].items[0].state, 'sent');
    // Çift tıklama / yeniden gönderim: ikinci istek bir şey göndermez
    const again = await Promise.allSettled([call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'] } }), call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'] } })]);
    assert.ok(again.some((r) => r.status === 'fulfilled'));
    assert.equal(sends(calls).length, 1, 'tekrar gönderilmedi');
    // Kanal sonucu: biri yayında, diğeri nedeniyle reddedildi
    const st = await call(`catalog/publish/status?ids=${ids.join(',')}`);
    const by = Object.fromEntries(st.items.map((x) => [x.id, x]));
    assert.equal(by[ids[0]].state, 'live');
    assert.equal(by[ids[1]].state, 'rejected'); assert.match(by[ids[1]].error, /Görsel uygun değil/);
    // Reddedilen ürün yalnız "Tekrar dene" ile yeniden gönderilir
    await call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'] } });
    assert.equal(sends(calls).length, 1);
    const re = await call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'], retry: ['trendyol'] } });
    assert.equal(re.results.trendyol.sent, 1);
    assert.deepEqual(sends(calls)[1].body.items.map((x) => x.barcode), ['869010']);
  } finally { done(); }
});

test('fiyat farkı (%): yayınla ekranında girilir, ilk gönderimde site fiyatına eklenir ve kanal için kaydedilir', async () => {
  const { db, ids, calls, call } = await setup();
  try {
    await run(db, "INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES ('Gübre', 'trendyol', '2001', 'Organik Gübre', ?, 0, 'x')", JSON.stringify({ 47: { value: '@variant' }, 1192: { id: '10617', value: 'TR' }, 60: { id: '6001', value: 'Kahverengi' } }));
    const pf = await call(`catalog/preflight?ids=${ids[0]}&channels=trendyol`);
    assert.equal(pf.channels[0].markup, 0);
    const pub = await call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'], opts: { trendyol: { cargoCompanyId: '17', markup: '10' } } } });
    assert.equal(pub.results.trendyol.sent, 2);
    const it = sends(calls)[0].body.items[0];
    assert.equal(it.salePrice, 110); assert.equal(it.listPrice, 143);
    assert.equal((await call(`catalog/preflight?ids=${ids[0]}&channels=trendyol`)).channels[0].markup, 10, 'kanal için hatırlanır');
    // "%10" yazımı okunur; boş bırakılınca kayıtlı fark kaldırılır (önizleme ile gönderilen fiyat aynı); geçersiz değer hata
    const { markupPct, cleanMarkup } = await import('../src/catalog.js');
    assert.deepEqual([markupPct('%10'), markupPct('10,5'), markupPct(''), cleanMarkup(' %12 '), cleanMarkup('')], [10, 10.5, 0, '12', '']);
    assert.throws(() => cleanMarkup('on'), /sayı olmalı/);
    assert.throws(() => cleanMarkup('500'), /-50 ile 300/);
    await call('catalog/publish', { method: 'POST', body: { ids: [ids[0]], channels: ['trendyol'], opts: { trendyol: { cargoCompanyId: '17', markup: '' } } } });
    assert.equal((await call(`catalog/preflight?ids=${ids[0]}&channels=trendyol`)).channels[0].markup, 0, 'temizlenen fark kaldırıldı');
  } finally { done(); }
});

test('marka bulunamazsa seçilir ve hatırlanır', async () => {
  const { db, ids, calls, call } = await setup();
  try {
    await run(db, "UPDATE products SET brand = 'Bilinmez'");
    await run(db, "INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES ('Gübre', 'trendyol', '2001', 'Organik Gübre', ?, 0, 'x')", JSON.stringify({ 47: { value: '@variant' }, 1192: { id: '10617', value: 'TR' }, 60: { id: '6001', value: 'Kahverengi' } }));
    await call('catalog/options', { method: 'POST', body: { channel: 'trendyol', opts: { cargoCompanyId: '17' } } });
    const pf = await call(`catalog/preflight?ids=${ids[0]}&channels=trendyol`);
    const it = pf.channels[0].items[0];
    assert.equal(pf.channels[0].cats[0].state, 'mapped', 'eşleştirme kullanılır');
    assert.deepEqual(it.missing, ['Marka']);
    assert.equal(it.brand.state, 'missing'); assert.equal(it.brand.options[0].name, 'Başka Marka');
    const b = await call(`catalog/brands?channel=trendyol&q=Bilinmez`);
    assert.equal(b.items[0].id, '888');
    await call('catalog/publish', { method: 'POST', body: { ids: [ids[0]], channels: ['trendyol'], brands: { trendyol: { Bilinmez: { remote_id: '888', name: 'Başka Marka' } } } } });
    assert.equal(sends(calls)[0].body.items[0].brandId, 888);
    assert.deepEqual(await first(db, "SELECT remote_id, remote_name FROM brand_map WHERE brand = 'Bilinmez'"), { remote_id: '888', remote_name: 'Başka Marka' });
  } finally { done(); }
});

test('site (ikas): varyantlı ürün oluşturulur, ilan bağlanır, gönderim kaydı tutulur', async () => {
  const { db, ids, calls, call } = await setup({ ikas: true });
  try {
    const pf = await call(`catalog/preflight?ids=${ids[0]}&channels=ikas1`);
    assert.equal(pf.channels[0].kind, 'store');
    assert.deepEqual(pf.channels[0].items.map((x) => x.state), ['ready', 'ready']);
    const r = await call('catalog/publish', { method: 'POST', body: { ids: [ids[0]], channels: ['ikas1'] } });
    assert.equal(r.results.ikas1.live, 2);
    const save = calls.find((c) => /saveProduct\(/.test((c.body || {}).query || '')).body.variables.input;
    assert.equal(save.name, 'Solucan Gübresi'); assert.equal(save.brandId, 'br1'); assert.deepEqual(save.categoryIds, ['cat1']);
    assert.equal(save.variants.length, 2); assert.deepEqual(save.variants[0].prices, [{ sellPrice: 130, discountPrice: 100 }]);
    assert.equal(save.productVariantTypes[0].variantTypeId, 'vt1');
    const stock = calls.find((c) => /saveProductStockLocations/.test((c.body || {}).query || '')).body.variables.input.productStockLocationInputs;
    assert.ok(stock.every((x) => x.stockLocationId === 'loc1'), 'yalnız seçili lokasyon');
    assert.ok(calls.some((c) => /upload\/image/.test(c.url)), 'görsel bağlantıdan');
    assert.deepEqual((await all(db, "SELECT product_id FROM listings WHERE channel = 'ikas1' ORDER BY product_id")).map((x) => x.product_id), ids);
    assert.deepEqual((await all(db, "SELECT state FROM product_channel WHERE channel = 'ikas1'")).map((x) => x.state), ['live', 'live']);
    assert.equal((await first(db, "SELECT status FROM product_uploads WHERE channel = 'ikas1'")).status, 'done');
    const n = calls.filter((c) => /saveProduct\(/.test((c.body || {}).query || '')).length;
    await call('catalog/publish', { method: 'POST', body: { ids: [ids[0]], channels: ['ikas1'] } });
    assert.equal(calls.filter((c) => /saveProduct\(/.test((c.body || {}).query || '')).length, n, 'ikinci kez oluşturulmaz');
  } finally { done(); }
});

test('yetki: yalnız görüntüleme yetkisiyle yayınlanamaz, kontrol görülebilir', async () => {
  const { db, env, ids } = await setup();
  try {
    const staff = { id: 9, name: 'Personel', role: 'staff', perms: ['products:view'] };
    const req = (path, m = 'GET', b) => new Request('https://panel.test/api/' + path, { method: m, body: b && JSON.stringify(b), headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(() => api(req('catalog/publish', 'POST', { ids }), env, { waitUntil() {} }, db, 'catalog/publish', staff), (e) => e.status === 403);
    const r = await api(req(`catalog/preflight?ids=${ids[0]}`), env, { waitUntil() {} }, db, 'catalog/preflight', staff);
    assert.equal(r.status, 200);
    // Ürün yazma yetkili personel yayınlayabilir (yönetici olması gerekmez)
    const writer = { ...staff, perms: ['products'] };
    const w = await api(req('catalog/publish', 'POST', { ids, channels: ['trendyol'] }), env, { waitUntil() {} }, db, 'catalog/publish', writer);
    assert.equal(w.status, 200);
  } finally { done(); }
});

test('siteler: WooCommerce varyantlı ürün, Shopify seçenekli ürün (liste fiyatı, marka, tür)', async () => {
  const { woocommerce } = await import('../src/channels/woocommerce.js');
  const { shopify } = await import('../src/channels/shopify.js');
  const vs = [{ id: 1, sku: 'A', barcode: '1', name: 'G 5 Kg', group_name: 'G', variant_name: '5 Kg', sale_price: 10, list_price: 12, stock: 3, brand: 'HG', category: 'Bahçe › Gübre', image: 'https://cdn.x/a.jpg', weight: 5 },
    { id: 2, sku: 'B', barcode: '2', name: 'G 10 Kg', group_name: 'G', variant_name: '10 Kg', sale_price: 18, stock: 4, image: 'https://cdn.x/b.jpg' }];
  const calls = [];
  try {
    globalThis.fetch = async (url, o = {}) => {
      const u = String(url), body = o.body ? JSON.parse(o.body) : null;
      calls.push({ u, m: o.method || 'GET', body });
      if (/variations\/batch/.test(u)) return J({ create: body.create.map((x, i) => ({ id: 70 + i })) });
      if (/\/products(\?|$)/.test(u) && o.method === 'POST') return J({ id: 7 });
      const q = (body && body.query) || '';
      if (/productCreate/.test(q)) return J({ data: { productCreate: { product: { id: 'gid://shopify/Product/9', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/1' }] } }, userErrors: [] } } });
      if (/productVariantsBulkCreate/.test(q)) return J({ data: { productVariantsBulkCreate: { productVariants: [{ id: 'gid://shopify/ProductVariant/91', sku: 'A' }, { id: 'gid://shopify/ProductVariant/92', sku: 'B' }], userErrors: [] } } });
      if (/locations/.test(q)) return J({ data: { locations: { nodes: [{ id: 'gid://shopify/Location/5', isActive: true }] } } });
      if (/nodes\(ids/.test(q)) return J({ data: { nodes: [] } });
      return J({ data: {} });
    };
    const w = await woocommerce({ WOO_URL: 'https://magaza.com/', WOO_KEY: 'ck_1', WOO_SECRET: 'cs_2' }, { id: 'woocommerce' }).createProduct(vs[0], { variants: vs, categoryId: '15' });
    const parent = calls.find((c) => /\/products(\?|$)/.test(c.u) && c.m === 'POST').body, vb = calls.find((c) => /variations\/batch/.test(c.u)).body.create;
    assert.equal(parent.type, 'variable'); assert.deepEqual(parent.attributes[0].options, ['5 Kg', '10 Kg']); assert.deepEqual(parent.categories, [{ id: 15 }]);
    assert.deepEqual([vb[0].regular_price, vb[0].sale_price, vb[0].weight, vb[1].regular_price, vb[1].sale_price], ['12', '10', '5', '18', undefined]);
    assert.deepEqual(w.map((x) => [x.pid, x.remoteId, x.remoteProductId]), [[1, '70', '7'], [2, '71', '7']]);
    calls.length = 0;
    const s = await shopify({ SHOPIFY_STORE: 'hasturk', SHOPIFY_TOKEN: 'shpat_x' }, { id: 'shopify' }).createProduct(vs[0], { variants: vs });
    const p = calls.find((c) => /productCreate/.test((c.body || {}).query || '')).body.variables.p;
    assert.deepEqual([p.title, p.vendor, p.productType, p.productOptions[0].values.length], ['G', 'HG', 'Gübre', 2]);
    const v = calls.find((c) => /productVariantsBulkCreate/.test((c.body || {}).query || '')).body.variables.v;
    assert.deepEqual([v[0].price, v[0].compareAtPrice, v[0].inventoryItem.measurement.weight.value, v[1].compareAtPrice], ['10', '12', 5, undefined]);
    assert.deepEqual(s.map((x) => [x.pid, x.remoteId]), [[1, '91'], [2, '92']]);
  } finally { globalThis.fetch = realFetch; }
});

test('sistemin eşleştirdiği kategori ("Otomatik (kesin)") elle yayınlamada da onay ister; onaylanınca gönderilir ve onaylayan yazılır', async () => {
  const { db, ids, calls, call } = await setup();
  try {
    await run(db, "INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES ('Gübre', 'trendyol', '2001', 'Organik Gübre', ?, 0, 'Otomatik (kesin)')", JSON.stringify({ 47: { value: '@variant' }, 1192: { id: '10617', value: 'TR' }, 60: { id: '6001', value: 'Kahverengi' } }));
    const pf = await call(`catalog/preflight?ids=${ids[0]}&channels=trendyol`);
    const cat = pf.channels[0].cats[0];
    assert.deepEqual([cat.state, cat.remote_id, cat.sure], ['suggested', '2001', true]);
    assert.ok(pf.channels[0].items.every((x) => x.missing.includes('Kategori onayı')));
    let pub = await call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'], opts: { trendyol: { cargoCompanyId: '17' } } } });
    assert.ok(!(pub.results.trendyol || {}).sent, 'onaysız gönderilmez');
    assert.equal(sends(calls).length, 0);
    pub = await call('catalog/publish', { method: 'POST', body: { ids, channels: ['trendyol'], approve: { trendyol: { category: '2001', name: 'Organik Gübre' } }, opts: { trendyol: { cargoCompanyId: '17' } } } });
    assert.equal(pub.results.trendyol.sent, 2);
    const m = await first(db, "SELECT user, attrs FROM category_map WHERE local = 'Gübre' AND channel = 'trendyol'");
    assert.ok(!/^Otomatik/.test(m.user), m.user);
    assert.match(m.attrs, /6001/, 'sistemin özellik değerleri korunur');
  } finally { done(); }
});
