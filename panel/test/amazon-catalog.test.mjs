// Amazon'a ürün yükleme: ürün tipleri (searchDefinitionsProductTypes), şema (getDefinitionsProductType → S3 bağlantısı → JSON Schema),
// putListingsItem (SKU başına; ACCEPTED / INVALID + issues), kabul edilenlerin izlenmesi (getListingsItem summaries / issues).
// Sahte cevaplar resmi modellerdeki örnek / sandbox cevaplarının biçiminde (selling-partner-api-models: definitionsProductTypes_2020-09-01.json,
// listingsItems_2021-08-01.json). Şema parçaları belgedeki örneklerin biçiminde (item_type_keyword: anyOf [serbest, enum + enumNames];
// merchant_shipping_group: enum; items.properties.marketplace_id: { $ref: '#/$defs/marketplace_id' }). $defs içeriği (default) varsayımdır:
// kod default yoksa tek değerli listeyi kullanır, ikisi de yoksa eksik bildirir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, all, setSetting, getRaw } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { amazon } from '../src/channels/amazon.js';
import { autoAttrs } from '../src/catalog.js';
import { withBudget } from '../src/util.js';
import worker from '../src/index.js';

// Kısa beklemeler (kota için sleep) testte anında geçer; uzun zaman aşımları olduğu gibi kalır
const realTimeout = globalThis.setTimeout;
const fast = () => { globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 5000 ? ms : 0, ...a); };
const slow = () => { globalThis.setTimeout = realTimeout; };
fast();

const MP = 'A33AVAJ2PDY3EV', API = 'https://sellingpartnerapi-eu.amazon.com';
const S3 = (pt) => `https://selling-partner-definitions-prod-iad.s3.amazonaws.com/schema/${pt}.json?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc`;
const J = (b, s = 200) => new Response(b == null ? null : JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const DEFS = {
  marketplace_id: { default: MP, editable: false, hidden: true, examples: ['Amazon.com.tr'], type: 'string', anyOf: [{ type: 'string' }, { type: 'string', enum: [MP], enumNames: ['Amazon.com.tr'] }] },
  language_tag: { default: 'tr_TR', editable: false, hidden: true, examples: ['Türkçe (Türkiye)'], type: 'string', anyOf: [{ type: 'string' }, { type: 'string', enum: ['tr_TR'], enumNames: ['Türkçe (Türkiye)'] }] },
};
const M = { $ref: '#/$defs/marketplace_id' }, L = { $ref: '#/$defs/language_tag' };
const arr = (title, items, extra = {}) => ({ title, type: 'array', minItems: 1, minUniqueItems: 1, maxUniqueItems: 1, selectors: ['marketplace_id'], items: { type: 'object', additionalProperties: false, ...items }, ...extra });
const txt = (title, max) => arr(title, { required: ['value', 'language_tag'], properties: { value: { title, type: 'string', minLength: 1, maxLength: max }, language_tag: L, marketplace_id: M } }, { selectors: ['marketplace_id', 'language_tag'] });
const en = (title, ids, names) => arr(title, { required: ['value'], properties: { value: { title, type: 'string', enum: ids, enumNames: names }, marketplace_id: M } });
const price = { type: 'array', items: { type: 'object', required: ['schedule'], properties: { schedule: { type: 'array', items: { type: 'object', required: ['value_with_tax'], properties: { value_with_tax: { type: 'number' } } } } } } };
const img = (title) => arr(title, { required: ['media_location'], properties: { media_location: { type: 'string', format: 'uri', minLength: 1, maxLength: 1000 }, marketplace_id: M } });
const COMMON = {
  item_name: txt('Ürün Adı', 200),
  brand: txt('Marka Adı', 100),
  product_description: txt('Ürün Açıklaması', 2000),
  externally_assigned_product_identifier: arr('Harici Ürün Kimliği', { required: ['type', 'value'], properties: {
    type: { title: 'Tür', type: 'string', enum: ['ean', 'gtin', 'upc'], enumNames: ['EAN', 'GTIN', 'UPC'] }, value: { title: 'Kimlik', type: 'string' }, marketplace_id: M } }),
  supplier_declared_has_product_identifier_exemption: arr('GTIN muafiyeti', { required: ['value'], properties: { value: { type: 'boolean' }, marketplace_id: M } }),
  condition_type: en('Durum', ['new_new', 'new_open_box', 'used_like_new'], ['Yeni', 'Yeni - Açık Kutu', 'Kullanılmış - Yeni Gibi']),
  country_of_origin: en('Menşe Ülkesi', ['TR', 'CN', 'DE'], ['Türkiye', 'Çin', 'Almanya']),
  item_type_keyword: arr('Ürün Türü Anahtar Kelimesi', { required: ['value'], properties: { value: { title: 'Ürün Türü Anahtar Kelimesi', editable: true, hidden: false, type: 'string', minLength: 1, maxLength: 500,
    anyOf: [{ type: 'string' }, { type: 'string', enum: ['fertilizers', 'plant-food'], enumNames: ['Bahçe > Gübreler', 'Bahçe > Bitki Besinleri'] }] }, marketplace_id: M } }),
  manufacturer: txt('Üretici', 100),
  batteries_required: arr('Pil gerekli mi?', { required: ['value'], properties: { value: { type: 'boolean' }, marketplace_id: M } }),
  purchasable_offer: { title: 'Satın Alınabilir Teklif', type: 'array', items: { type: 'object', required: ['currency', 'marketplace_id'], properties: {
    audience: { type: 'string', enum: ['ALL', 'B2B'], enumNames: ['Satış Fiyatı', 'Amazon Business'] }, currency: { type: 'string', enum: ['TRY'] }, marketplace_id: M,
    our_price: price, list_price: price } } },
  fulfillment_availability: { title: 'Stok', type: 'array', items: { type: 'object', required: ['fulfillment_channel_code'], properties: { fulfillment_channel_code: { type: 'string' }, quantity: { type: 'integer', minimum: 0 } } } },
  main_product_image_locator: img('Ana Görsel'),
  other_product_image_locator_1: img('Diğer Görsel 1'),
  color: txt('Renk', 100),
};
const FERTILIZER = {
  $schema: 'https://schemas.amazon.com/selling-partners/definitions/product-types/meta-schema/v1',
  $id: 'https://schemas.amazon.com/selling-partners/definitions/product-types/schema/v1/FERTILIZER',
  $comment: 'Amazon product type definition for FERTILIZER product type',
  $defs: DEFS, type: 'object',
  required: ['item_name', 'brand', 'product_description', 'condition_type', 'country_of_origin', 'item_type_keyword', 'manufacturer', 'batteries_required',
    'purchasable_offer', 'fulfillment_availability', 'main_product_image_locator'],
  properties: COMMON,
  // Koşullu zorunluluk (değerlendirilmez; Amazon gönderimde bildirir)
  allOf: [{ if: { not: { required: ['supplier_declared_has_product_identifier_exemption'] } }, then: { required: ['externally_assigned_product_identifier'] } }],
};
// Birimli zorunlu özellik + satıcıya özel marka listesi (sellerId ile gelen enum) + serbest metin varyant özelliği
const unit = (u) => ({ type: 'string', enum: u, enumNames: u });
const PLANT_SEED = {
  $schema: FERTILIZER.$schema, $id: 'https://schemas.amazon.com/selling-partners/definitions/product-types/schema/v1/PLANT_SEED', $defs: DEFS, type: 'object',
  required: ['item_name', 'brand', 'color', 'item_display_weight', 'item_package_weight', 'item_package_dimensions', 'purchasable_offer'],
  properties: { ...COMMON,
    brand: arr('Marka Adı', { required: ['value', 'language_tag'], properties: { value: { type: 'string', enum: ['HasTürk'], enumNames: ['HasTürk'] }, language_tag: L, marketplace_id: M } }),
    item_display_weight: arr('Görünen Ağırlık', { required: ['value', 'unit'], properties: { value: { type: 'number' }, unit: unit(['grams', 'kilograms']), marketplace_id: M } }),
    item_package_weight: arr('Paket Ağırlığı', { required: ['value', 'unit'], properties: { value: { type: 'number' }, unit: unit(['grams', 'kilograms']), marketplace_id: M } }),
    item_package_dimensions: arr('Paket Ölçüleri', { required: ['length', 'width', 'height'], properties: {
      length: { type: 'object', required: ['value', 'unit'], properties: { value: { type: 'number' }, unit: unit(['centimeters', 'inches']) } },
      width: { type: 'object', required: ['value', 'unit'], properties: { value: { type: 'number' }, unit: unit(['centimeters', 'inches']) } },
      height: { type: 'object', required: ['value', 'unit'], properties: { value: { type: 'number' }, unit: unit(['centimeters', 'inches']) } }, marketplace_id: M } }),
  },
};
const SCHEMAS = { FERTILIZER, PLANT_SEED };
// getDefinitionsProductType cevabı (model örneği biçiminde)
const ptd = (pt) => ({ metaSchema: { link: { resource: 'https://selling-partner-definitions-prod-iad.s3.amazonaws.com/schema/amazon-product-type-definition-meta-schema-v1.json', verb: 'GET' }, checksum: 'rZ/2Yep0np022S38ZdEiNQ==' },
  schema: { link: { resource: S3(pt), verb: 'GET' }, checksum: 'c7af9479ca7261645cea9db56c5f720d' }, requirements: 'LISTING', requirementsEnforced: 'ENFORCED',
  propertyGroups: { product_identity: { title: 'Ürün Kimliği', propertyNames: ['item_name', 'brand', 'externally_assigned_product_identifier'] } },
  locale: 'tr_TR', marketplaceIds: [MP], productType: pt, displayName: pt === 'FERTILIZER' ? 'Gübre' : 'Bitki Tohumu', productTypeVersion: { version: 'UHqSqmb4FNUk=', latest: true, releaseCandidate: false } });
const TYPES = { productTypes: [{ name: 'FERTILIZER', displayName: 'Gübre', marketplaceIds: [MP] }, { name: 'PLANT_SEED', displayName: 'Bitki Tohumu', marketplaceIds: [MP] },
  { name: 'LAWN_MOWER', displayName: 'Çim Biçme Makinesi', marketplaceIds: [MP] }, { name: 'LUGGAGE', displayName: 'Bavul', marketplaceIds: ['ATVPDKIKX0DER'] }], productTypeVersion: 'UHqSqmb4FNUk=' };

// Ortak sahte SP-API: put / get davranışı test başına verilir
function fakeApi({ put = () => null, get = () => null, realFetch } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url), method = opts.method || 'GET';
    if (realFetch && u.startsWith('https://panel.test')) return realFetch(url, opts);
    const c = { url: u, method, body: opts.body, headers: opts.headers || {} };
    calls.push(c);
    if (/api\.amazon\.com\/auth\/o2\/token/.test(u)) return J({ access_token: 'Atza|AT', token_type: 'bearer', expires_in: 3600 });
    const s3 = /s3\.amazonaws\.com\/schema\/([A-Z_]+)\.json/.exec(u);
    if (s3) return SCHEMAS[s3[1]] ? new Response(JSON.stringify(SCHEMAS[s3[1]]), { headers: { 'Content-Type': 'binary/octet-stream' } }) : J({ message: 'NoSuchKey' }, 404);
    const pt = /\/definitions\/2020-09-01\/productTypes\/([A-Z_]+)\?/.exec(u);
    if (pt) return SCHEMAS[pt[1]] ? J(ptd(pt[1])) : J({ errors: [{ code: 'NOT_FOUND', message: `Product type ${pt[1]} not found` }] }, 404);
    if (/\/definitions\/2020-09-01\/productTypes\?/.test(u)) {
      const kw = new URL(u).searchParams.get('keywords');
      return J(kw ? { productTypes: kw === 'gübre' ? [TYPES.productTypes[0], { name: 'PLANT_FOOD', displayName: 'Bitki Besini', marketplaceIds: [MP] }] : [], productTypeVersion: 'UHqSqmb4FNUk=' } : TYPES);
    }
    const it = /\/listings\/2021-08-01\/items\/A1SELLER\/([^?]+)\?/.exec(u);
    if (it) {
      const sku = decodeURIComponent(it[1]);
      const out = method === 'GET' ? get(sku, c) : put(sku, JSON.parse(opts.body), c);
      if (out && out.status && 'body' in out) return J(out.body, out.status);
      return out ? J(out) : J({ errors: [{ code: 'NOT_FOUND', message: `SKU '${sku}' not found in marketplace ${MP}` }] }, 404);
    }
    if (/\/listings\/2021-08-01\/items\/A1SELLER\?/.test(u)) return J({ numberOfResults: 1, items: [{ sku: 'SOL-5', summaries: [{ marketplaceId: MP, asin: 'B0TEST0005', productType: 'FERTILIZER', conditionType: 'new_new',
      status: ['BUYABLE', 'DISCOVERABLE'], itemName: 'Solucan Gübresi 5 Kg', mainImage: { link: 'https://m.media-amazon.com/images/I/x.jpg', height: 500, width: 500 } }],
    offers: [{ marketplaceId: MP, offerType: 'B2C', price: { currency: 'TRY', amount: '100.00' } }], fulfillmentAvailability: [{ fulfillmentChannelCode: 'DEFAULT', quantity: 7 }] }] });
    return J({ errors: [{ code: 'NOT_FOUND', message: 'yok' }] }, 404);
  };
  return calls;
}
const accepted = (sku) => ({ sku, status: 'ACCEPTED', submissionId: 'f1dc2914-75dd-11ea-bc55-0242ac130003', issues: [] });
// Model sandbox örneği (VALIDATION_INVALID) biçiminde ret
const invalid = (sku) => ({ sku, status: 'INVALID', submissionId: 'a1c562c2-1695-11ee-be56-0242ac120002', identifiers: [], issues: [
  { code: '90220', message: "'condition_type' is required but not supplied.", severity: 'ERROR', attributeNames: ['condition_type'], categories: ['MISSING_ATTRIBUTE', 'LISTING'],
    enforcements: { actions: [{ action: 'LISTING_SUPPRESSED' }], exemption: { status: 'NOT_EXEMPT' } } },
  { code: '18027', message: 'Ürün görseli önerilen boyutun altında.', severity: 'WARNING', attributeNames: ['main_product_image_locator'], categories: ['INVALID_IMAGE'] }] });
const AENV = { AMAZON_SELLER_ID: 'A1SELLER', AMAZON_CLIENT_ID: 'amzn1.application-oa2-client.x', AMAZON_CLIENT_SECRET: 'sec', AMAZON_REFRESH_TOKEN: 'Atzr|r' };
function memKv() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null), set: async (k, v) => { m.set(k, structuredClone(v)); } }; }
const pr = (o = {}) => ({ id: 1, sku: 'S1', barcode: '8690000000011', name: 'Tohum', brand: 'HasTürk', description: '<p>Açıklama</p>', image: 'https://cdn.ornek.com/a.jpg', images: ['https://cdn.ornek.com/a.jpg'],
  vat: 20, desi: 1, stock: 3, price: 50, listPrice: 50, weight: null, group: 'G', variant: '', ...o });

test('Amazon ürün yükleme (uçtan uca): ürün tipi, şema, eşleştirme, eksikler, putListingsItem ve sonuç izleme', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now();
  const ins = (sku, bc, name, img, desc) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, description, sale_price, list_price, vat, desi, stock, group_name, variant_name, created_at, updated_at)
    VALUES (?, ?, ?, 'HasTürk', 'Gübre', ?, ?, 100, 120, 20, 2, 7, 'Solucan Gübresi', '', ?, ?)`, sku, bc, name, img, desc, t, t);
  await ins('SOL-5', '8690000000011', 'Solucan Gübresi 5 Kg', 'https://cdn.ornek.com/a.jpg', '<p>%100 <b>organik</b></p><p>Kokusuz&nbsp;&amp; doğal</p>');
  await ins('SOL-10', '869000000002', 'Solucan Gübresi 10 Kg', 'https://cdn.ornek.com/b.jpg', '<p>Organik</p>');
  await ins('SOL-20', '86900000000033', 'Solucan Gübresi 20 Kg', 'https://cdn.ornek.com/c.jpg', '<p>Organik</p>');
  await ins('SOL-X', '', 'Barkodsuz Gübre', '', '<p>Organik</p>');
  await ins('SOL-U', '12345', 'Kısa Barkodlu Gübre', 'https://cdn.ornek.com/d.jpg', '<p>Organik</p>');
  await ins('SOL-L', '8690000000099', 'Ç'.repeat(201), 'https://cdn.ornek.com/e.jpg', '<p>Organik</p>');
  let polls = 0;
  const realFetch = globalThis.fetch;
  const calls = fakeApi({
    realFetch,
    put: (sku) => (sku === 'SOL-20' ? invalid(sku) : accepted(sku)),
    get: (sku) => {
      if (sku === 'SOL-5') return polls++ ? { sku, summaries: [{ marketplaceId: MP, asin: 'B0TEST0005', productType: 'FERTILIZER', conditionType: 'new_new', status: ['BUYABLE', 'DISCOVERABLE'],
        itemName: 'Solucan Gübresi 5 Kg', createdDate: '2026-10-16T10:00:00Z', lastUpdatedDate: '2026-10-16T10:01:00Z' }], issues: [] } : null;
      // İşleme sonrası (asenkron) sorun: Issues Troubleshooting 100980
      if (sku === 'SOL-10') return { sku, summaries: [], issues: [{ code: '100980', message: 'Your barcode is already associated with another product ASIN, which appears to be different from the product you are trying to list.',
        severity: 'ERROR', attributeNames: ['externally_assigned_product_identifier'], categories: ['INVALID_ATTRIBUTE'] }] };
      return null;
    },
  });
  try {
    let cookie = '';
    const call = async (path, o = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await call('integrations/amazon', { method: 'PUT', body: JSON.stringify({ values: AENV }) });
    await setSetting(db, 'verified:amazon', { at: Date.now() + 1000 }); resetChannels();
    const st = await call('catalog/state');
    const az = st.channels.find((c) => c.id === 'amazon');
    assert.ok(az && az.ready, JSON.stringify(st.channels.map((c) => c.id)));
    assert.deepEqual(az.options.map((o) => o.k), ['gtinExempt']);

    // Ürün tipleri: yalnız bu pazar yerinin tipleri; adda geçenler + Amazon anahtar kelime araması
    const cats = await call('catalog/remote-categories?channel=amazon&q=gübre');
    assert.deepEqual(cats.items, [{ id: 'FERTILIZER', name: 'Gübre', path: 'FERTILIZER' }, { id: 'PLANT_FOOD', name: 'Bitki Besini', path: 'PLANT_FOOD' }]);
    assert.equal(cats.total, 3);
    const search = calls.filter((c) => /productTypes\?/.test(c.url));
    assert.deepEqual(search.map((c) => Object.fromEntries(new URL(c.url).searchParams)), [{ marketplaceIds: MP }, { marketplaceIds: MP, keywords: 'gübre' }]);
    assert.equal(search[0].headers['x-amz-access-token'], 'Atza|AT');

    // Şema: zorunlu özellikler (panelin kendisinin doldurdukları hariç), enum / serbest / evet-hayır
    const at = await call('catalog/attributes?channel=amazon&category=FERTILIZER');
    assert.deepEqual(at.attributes, [
      { id: 'condition_type', name: 'Durum', mandatory: true, kind: 'category', type: 'enum', custom: false, multi: false },
      { id: 'country_of_origin', name: 'Menşe Ülkesi', mandatory: true, kind: 'category', type: 'enum', custom: false, multi: false },
      { id: 'item_type_keyword', name: 'Ürün Türü Anahtar Kelimesi', mandatory: true, kind: 'category', type: 'enum', custom: true, multi: false },
      { id: 'manufacturer', name: 'Üretici', mandatory: true, kind: 'category', type: 'text', custom: true, multi: false },
      { id: 'batteries_required', name: 'Pil gerekli mi?', mandatory: true, kind: 'category', type: 'enum', custom: false, multi: false }]);
    const def = calls.find((c) => /productTypes\/FERTILIZER\?/.test(c.url));
    assert.deepEqual(Object.fromEntries(new URL(def.url).searchParams), { marketplaceIds: MP, sellerId: 'A1SELLER', requirements: 'LISTING', requirementsEnforced: 'ENFORCED', parentageLevel: 'NONE' });
    const s3 = calls.find((c) => /s3\.amazonaws\.com/.test(c.url));
    assert.equal(s3.url, S3('FERTILIZER'));
    assert.ok(!s3.headers['x-amz-access-token'], 'S3 şema bağlantısına Amazon belirteci gitmez');
    assert.deepEqual((await call('catalog/values?channel=amazon&category=FERTILIZER&attribute=condition_type')).values, [{ id: 'new_new', value: 'Yeni' }, { id: 'new_open_box', value: 'Yeni - Açık Kutu' }, { id: 'used_like_new', value: 'Kullanılmış - Yeni Gibi' }]);
    assert.deepEqual((await call('catalog/values?channel=amazon&category=FERTILIZER&attribute=batteries_required')).values, [{ id: 'true', value: 'Evet' }, { id: 'false', value: 'Hayır' }]);
    // Şema önbellekte: ikinci okumada yeniden indirilmez
    assert.equal(calls.filter((c) => /s3\.amazonaws\.com/.test(c.url)).length, 1);

    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'amazon', remote_id: 'FERTILIZER', remote_name: 'Gübre', attrs: {
      condition_type: { id: 'new_new', value: 'Yeni' }, country_of_origin: { id: 'TR', value: 'Türkiye' }, item_type_keyword: { id: 'fertilizers', value: 'Bahçe > Gübreler' },
      manufacturer: { value: 'HasTürk Tarım' }, batteries_required: { id: 'false', value: 'Hayır' } } }) });
    const cand = await call('catalog/candidates?channel=amazon&local=G%C3%BCbre');
    const by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    for (const k of ['SOL-5', 'SOL-10', 'SOL-20']) assert.deepEqual(by[k].missing, [], k + ' ' + JSON.stringify(by[k].missing));
    assert.deepEqual(by['SOL-X'].missing, ['barkod', 'görsel']);
    assert.deepEqual(by['SOL-U'].missing, ['barkod Amazon için 12 (UPC), 13 (EAN) ya da 14 (GTIN) haneli olmalı']);
    assert.deepEqual(by['SOL-L'].missing, ['ürün adı en fazla 200 karakter olabilir']);

    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'amazon', ids: cand.items.map((x) => x.id) }) });
    assert.equal(up.sent, 3, JSON.stringify(up)); assert.equal(up.skipped.length, 3);
    assert.match(up.ref, /^amz:/);
    const puts = calls.filter((c) => c.method === 'PUT');
    assert.deepEqual(puts.map((c) => c.url).sort(), ['SOL-10', 'SOL-20', 'SOL-5'].map((s) => `${API}/listings/2021-08-01/items/A1SELLER/${s}?marketplaceIds=${MP}&includedData=issues,identifiers`));
    const b5 = JSON.parse(puts.find((c) => /SOL-5\?/.test(c.url)).body);
    const tr = { language_tag: 'tr_TR', marketplace_id: MP }, m = { marketplace_id: MP };
    assert.deepEqual(b5, { productType: 'FERTILIZER', requirements: 'LISTING', attributes: {
      item_name: [{ value: 'Solucan Gübresi 5 Kg', ...tr }],
      brand: [{ value: 'HasTürk', ...tr }],
      product_description: [{ value: '%100 organik\nKokusuz & doğal', ...tr }],
      externally_assigned_product_identifier: [{ type: 'ean', value: '8690000000011', ...m }],
      purchasable_offer: [{ currency: 'TRY', ...m, audience: 'ALL', our_price: [{ schedule: [{ value_with_tax: 100 }] }], list_price: [{ schedule: [{ value_with_tax: 120 }] }] }],
      fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity: 7 }],
      main_product_image_locator: [{ media_location: 'https://cdn.ornek.com/a.jpg', ...m }],
      condition_type: [{ value: 'new_new', ...m }], country_of_origin: [{ value: 'TR', ...m }], item_type_keyword: [{ value: 'fertilizers', ...m }],
      manufacturer: [{ value: 'HasTürk Tarım', ...tr }], batteries_required: [{ value: false, ...m }] } });
    assert.deepEqual(JSON.parse(puts.find((c) => /SOL-10\?/.test(c.url)).body).attributes.externally_assigned_product_identifier, [{ type: 'upc', value: '869000000002', ...m }]);
    assert.deepEqual(JSON.parse(puts.find((c) => /SOL-20\?/.test(c.url)).body).attributes.externally_assigned_product_identifier, [{ type: 'gtin', value: '86900000000033', ...m }]);
    // Sonuçlar kanal deposunda
    const kept = await getRaw(db, 'kv:amazon:uploads');
    assert.equal(kept[up.ref.slice(4)].items['SOL-20'].s, 'I');

    // 1. sorgu: SOL-20 ret (yalnız ERROR sorunları), SOL-10 işleme sonrası ret, SOL-5 henüz oluşmadı (404) → bitmedi
    let ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, false);
    let r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(r['SOL-20'].ok, false); assert.equal(r['SOL-20'].error, "'condition_type' is required but not supplied.");
    assert.equal(r['SOL-10'].ok, false); assert.match(r['SOL-10'].error, /barcode is already associated/); assert.match(r['SOL-10'].status, /işlerken sorun/);
    assert.equal(r['SOL-5'].ok, null); assert.match(r['SOL-5'].status, /işliyor/);
    const gets = calls.filter((c) => c.method === 'GET' && /items\/A1SELLER\/SOL/.test(c.url));
    assert.ok(gets.some((c) => c.url === `${API}/listings/2021-08-01/items/A1SELLER/SOL-10?marketplaceIds=${MP}&includedData=summaries,issues`));
    assert.equal(gets.length, 2, 'reddedilen (INVALID) SKU sorgulanmaz ' + gets.map((c) => c.url).join(' '));
    // 2. sorgu: SOL-5 oluştu (ASIN); sonuçlanmış SKU'lar yeniden sorulmaz
    const before = calls.length;
    ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true);
    r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(r['SOL-5'].ok, true); assert.equal(r['SOL-5'].status, "Amazon'da oluşturuldu · ASIN B0TEST0005 · satışta");
    assert.deepEqual(calls.slice(before).filter((c) => /items\/A1SELLER\/SOL/.test(c.url)).map((c) => new URL(c.url).pathname.split('/').pop()), ['SOL-5']);
    // Onaylanan ürün ilan listesinden (SKU ile) panele bağlanır
    for (let i = 0; i < 100; i++) { if ((await all(db, "SELECT 1 FROM listings WHERE channel = 'amazon' AND sku = 'SOL-5' AND product_id IS NOT NULL")).length) break; await new Promise((ok) => realTimeout(ok, 10)); }
    assert.equal((await all(db, "SELECT 1 FROM listings WHERE channel = 'amazon' AND sku = 'SOL-5' AND product_id IS NOT NULL")).length, 1);
    const states = Object.fromEntries((await all(db, "SELECT p.sku, pc.state, pc.error FROM product_channel pc JOIN products p ON p.id = pc.product_id WHERE pc.channel = 'amazon'")).map((x) => [x.sku, x]));
    assert.equal(states['SOL-5'].state, 'live'); assert.equal(states['SOL-20'].state, 'rejected'); assert.equal(states['SOL-10'].state, 'rejected');
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});

test('Amazon build: birimli / iç içe zorunlu özellik eksik, satıcıya özel marka listesi, varyant, GTIN muafiyeti, açıklama kısaltma, dil etiketi', async () => {
  const real = globalThis.fetch;
  fakeApi();
  try {
    const ch = amazon(AENV, { id: 'amazon', kv: memKv() });
    const map = { remote_id: 'PLANT_SEED', attrs: { color: { value: '@variant' } } };
    // Birimli zorunlu (item_display_weight) panelden doldurulamaz; paket ağırlığı / ölçüleri panel bilgisinden (kg, cm)
    assert.deepEqual((await ch.catalog.attributes('PLANT_SEED')).map((a) => [a.id, a.type]), [['color', 'text'], ['item_display_weight', 'complex']]);
    let b = await ch.catalog.build(pr({ variant: 'Kırmızı' }), map, { pick: async () => null });
    assert.deepEqual(b.missing, ['paket ağırlığı (kg)', 'paket ölçüleri (en, boy, yükseklik cm)', "Görünen Ağırlık (birimli / çok alanlı özellik; panelden gönderilemiyor, Amazon Seller Central'dan girin)"]);
    assert.deepEqual(b.payload.attributes.color, [{ value: 'Kırmızı', language_tag: 'tr_TR', marketplace_id: MP }], 'serbest metin özelliği varyant adından');
    b = await ch.catalog.build(pr({ variant: 'Kırmızı', weight: 1.25, length: 30, width: 20, height: 10 }), map, { pick: async () => null });
    assert.deepEqual(b.payload.attributes.item_package_weight, [{ value: 1.25, unit: 'kilograms', marketplace_id: MP }]);
    assert.deepEqual(b.payload.attributes.item_package_dimensions, [{ length: { value: 30, unit: 'centimeters' }, width: { value: 20, unit: 'centimeters' }, height: { value: 10, unit: 'centimeters' }, marketplace_id: MP }]);
    // Satıcıya özel marka listesi: listede olmayan marka
    b = await ch.catalog.build(pr({ brand: 'Bilinmeyen' }), map, { pick: async () => null });
    assert.ok(b.missing.includes("marka “Bilinmeyen” Amazon'da bulunamadı"), JSON.stringify(b.missing));
    assert.ok(b.missing.includes('Renk (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)'));
    // Çok eksenli varyant serbest metne bölünmeden yazılmaz
    b = await ch.catalog.build(pr({ variant: 'Kırmızı / 5 Kg' }), map, { pick: async () => null });
    assert.ok(b.missing.includes('Renk (varyant “Kırmızı / 5 Kg” Amazon listesinde yok)'));

    // Barkodsuz ürün: yalnız GTIN muafiyeti seçeneğiyle
    const fm = { remote_id: 'FERTILIZER', attrs: { condition_type: { id: 'new_new' }, country_of_origin: { value: 'Türkiye' }, item_type_keyword: { value: 'özel anahtar' }, manufacturer: { value: 'X' }, batteries_required: { value: 'Hayır' } } };
    b = await ch.catalog.build(pr({ barcode: '' }), fm, {});
    assert.deepEqual(b.missing, ['barkod']);
    b = await ch.catalog.build(pr({ barcode: '' }), fm, { opts: { gtinExempt: 'Evet' } });
    assert.deepEqual(b.missing, []);
    assert.deepEqual(b.payload.attributes.supplier_declared_has_product_identifier_exemption, [{ value: true, marketplace_id: MP }]);
    assert.equal(b.payload.attributes.externally_assigned_product_identifier, undefined);
    // Değer adıyla yazılan liste değeri kimliğe çevrilir; serbest değer kabul eden listede yazılan değer olduğu gibi
    assert.deepEqual(b.payload.attributes.country_of_origin, [{ value: 'TR', marketplace_id: MP }]);
    assert.deepEqual(b.payload.attributes.item_type_keyword, [{ value: 'özel anahtar', marketplace_id: MP }]);
    assert.deepEqual(b.payload.attributes.batteries_required, [{ value: false, marketplace_id: MP }]);
    // Listede olmayan değer, eşleştirilmemiş zorunlu özellik, fiyatsız ürün; pazar yerinin para birimi (panel fiyatı buna çevirip pr.currency verir)
    b = await ch.catalog.build(pr({ price: 0 }), { remote_id: 'FERTILIZER', attrs: { condition_type: { value: 'Sıfır' } } }, {});
    assert.deepEqual(b.missing, ['fiyat', 'Durum (“Sıfır” Amazon listesinde yok)', 'Menşe Ülkesi', 'Ürün Türü Anahtar Kelimesi', 'Üretici', 'Pil gerekli mi?']);
    assert.equal(await ch.catalog.currency(), 'TRY');
    b = await ch.catalog.build(pr({ price: 12.5, listPrice: 15, currency: 'EUR' }), fm, {});
    assert.equal(b.payload.attributes.purchasable_offer[0].currency, 'EUR');
    assert.equal(await amazon({ ...AENV, AMAZON_MARKETPLACE_ID: 'A1PA6795UKMFR9' }, { id: 'amazon' }).catalog.currency(), 'EUR');
    // Uzun açıklama şemadaki sınırda son boşluktan kısaltılır (ad kısaltılmaz, eksik bildirilir)
    const long = Array.from({ length: 400 }, (_, i) => 'kelime' + i).join(' ');
    b = await ch.catalog.build(pr({ description: `<p>${long}</p>` }), fm, {});
    const d = b.payload.attributes.product_description[0].value;
    assert.ok(d.length <= 2000 && d.length > 1900 && long.startsWith(d) && /\d$/.test(d), d.length);
    // Menşei: catalog.js autoAttrs mağaza ayarındaki ülkeyi Amazon listesinde bulur (Türkiye → TR)
    assert.deepEqual((await autoAttrs(ch, 'FERTILIZER', { origin: 'Türkiye' })).attrs.country_of_origin, { id: 'TR', value: 'Türkiye' });

    // Dil etiketi şemada belirlenemiyorsa (varsayılan yok, birden çok değer) uydurulmaz
    SCHEMAS.NO_LANG = { ...FERTILIZER, $id: FERTILIZER.$id.replace('FERTILIZER', 'NO_LANG'), $defs: { ...DEFS, language_tag: { type: 'string', enum: ['tr_TR', 'en_US'] } } };
    b = await ch.catalog.build(pr(), { remote_id: 'NO_LANG', attrs: fm.attrs }, {});
    assert.ok(b.missing.includes('ürün adı (dil etiketi şemada belirlenemedi)'), JSON.stringify(b.missing));
    // Olmayan ürün tipi: Amazon hatası iletilir
    await assert.rejects(ch.catalog.attributes('NOPE'), /HTTP 404.*NOPE not found/);
  } finally { globalThis.fetch = real; delete SCHEMAS.NO_LANG; }
});

test('Amazon gönderim: hız sınırı (≥250 ms), kısmi hata, tümü başarısız, istek sınırı, izleme parçası (40 SKU)', async () => {
  const real = globalThis.fetch;
  try {
    const kv = memKv();
    const P = (sku) => ({ sku, productType: 'FERTILIZER', attributes: { item_name: [{ value: sku, language_tag: 'tr_TR', marketplace_id: MP }] } });
    // Hız sınırı: istekler arası en az 250 ms (5 istek/sn)
    slow();
    let calls = fakeApi({ put: (sku) => accepted(sku) });
    let ch = amazon(AENV, { id: 'amazon', kv });
    const t0 = Date.now();
    await ch.catalog.send([P('A'), P('B'), P('C')]);
    assert.ok(Date.now() - t0 >= 480, `${Date.now() - t0} ms`);
    fast();
    // Kısmi hata: 400 ErrorList ürün bazında kaydedilir, diğerleri gider
    calls = fakeApi({ put: (sku) => (sku === 'B' ? { status: 400, body: { errors: [{ code: 'InvalidInput', message: 'Request has missing or invalid parameters and cannot be parsed.', details: 'productType' }] } } : accepted(sku)) });
    ch = amazon(AENV, { id: 'amazon', kv });
    const { ref } = await ch.catalog.send([P('A'), P('B'), P('C')]);
    let st = await ch.catalog.status(ref);
    const r = Object.fromEntries(st.items.map((x) => [x.key, x]));
    assert.equal(r.B.ok, false); assert.equal(r.B.status, 'Gönderilemedi'); assert.equal(r.B.error, 'Request has missing or invalid parameters and cannot be parsed. productType');
    assert.equal(r.A.ok, null); assert.equal(st.done, false);
    assert.deepEqual(await ch.catalog.raw(ref), (await kv.get('uploads'))[ref.slice(4)]);
    // Kabul edilen SKU'nun ürün tipi sonraki stok / fiyat güncellemesinde kullanılır
    await ch.pushStock([{ remoteId: 'A', stock: 2 }]);
    assert.equal(JSON.parse(calls.filter((c) => c.method === 'PATCH').at(-1).body).productType, 'FERTILIZER');
    // Tümü başarısız (yetki): gönderim hatası
    fakeApi({ put: () => ({ status: 403, body: { errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.', details: '' }] } }) });
    await assert.rejects(amazon(AENV, { id: 'amazon', kv }).catalog.send([P('A'), P('B')]), /Access to requested resource is denied/);
    // İstek sınırı gönderimin ortasında dolarsa gidenlerin takibi korunur, kalanlar "gönderilmedi"
    calls = fakeApi({ put: (sku) => accepted(sku) });
    ch = amazon(AENV, { id: 'amazon', kv });
    const part = await withBudget(3, () => ch.catalog.send([P('A'), P('B'), P('C'), P('D')]));
    st = await ch.catalog.raw(part.ref);
    assert.deepEqual(Object.values(st.items).map((x) => x.s), ['A', 'A', 'E', 'E']);
    // Hiç istek gidemeden sınır dolarsa sınır hatası olduğu gibi iletilir (sonraki senkronda yeniden)
    await assert.rejects(withBudget(0, () => amazon(AENV, { id: 'amazon', kv }).catalog.send([P('A')])), (e) => e.budget === true);
    // İzleme: sorgu başına en çok 40 SKU
    let gets = 0;
    fakeApi({ put: (sku) => accepted(sku), get: (sku) => { gets++; return { sku, summaries: [{ marketplaceId: MP, asin: 'B0' + sku, status: ['DISCOVERABLE'] }], issues: [] }; } });
    ch = amazon(AENV, { id: 'amazon', kv: memKv() });
    const many = await ch.catalog.send(Array.from({ length: 45 }, (_, i) => P('S' + i)));
    st = await ch.catalog.status(many.ref);
    assert.equal(gets, 40); assert.equal(st.done, false); assert.equal(st.items.filter((x) => x.ok === true).length, 40);
    assert.equal(st.items[0].status, "Amazon'da oluşturuldu · ASIN B0S0");
    st = await ch.catalog.status(many.ref);
    assert.equal(gets, 45); assert.equal(st.done, true);
    // Kaydı bulunmayan (süresi geçmiş) gönderim
    assert.deepEqual(await ch.catalog.status('amz:yok'), { done: true, items: [] });
  } finally { globalThis.fetch = real; fast(); }
});
