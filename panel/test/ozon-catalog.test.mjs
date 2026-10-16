// Ozon'a ürün yükleme: kategori ağacı (description_category_id + type_id; disabled düğüm atlanır), özellikler (dictionary_id → liste,
// is_aspect → varyant, attribute_complex_id → complex_attributes), değerler (2000'lik sayfa, last_value_id), marka araması
// (attribute/values/search), /v3/product/import (100'lük parça, task_id) ve /v1/product/import/info (pending · imported · failed).
// Sahte cevaplar Ozon OpenAPI'sinden üretilmiş istemcilerdeki örnek biçimde (artefactby-ozon-seller-api 0.18.0 dist/index.d.ts örnekleri,
// generated-ozon-seller-api-client 1.0.0 dist/OzonSellerAPI.d.ts tipleri).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting, first } from '../src/db.js';
import { resetChannels, getChannels } from '../src/channels/index.js';
import { ozon } from '../src/channels/ozon.js';
import worker from '../src/index.js';

const CAT = '17028650:970895715';
const TREE = { result: [
  { description_category_id: 17027000, category_name: 'Bahçe', disabled: false, children: [
    { description_category_id: 17028650, category_name: 'Gübreler', disabled: false, children: [
      { type_name: 'Organik gübre', type_id: 970895715, disabled: false, children: [] },
      { type_name: 'Kimyasal gübre', type_id: 970895716, disabled: true, children: [] }] },
    { description_category_id: 17028651, category_name: 'Удобрения', disabled: true, children: [{ type_name: 'Gübre seti', type_id: 970895717, disabled: false, children: [] }] }] },
  { description_category_id: 17027492, category_name: 'Канцелярские товары', disabled: false, children: [
    { description_category_id: 17029016, category_name: 'Печати и штампы', disabled: false, children: [
      { type_name: 'Пистолет-маркиратор', type_id: 970778135, disabled: false, children: [] }] }] }] };
const A = (id, name, o = {}) => ({ id, name, description: '', type: 'String', is_collection: false, is_required: false, is_aspect: false, max_value_count: 0, group_name: '', group_id: 0, dictionary_id: 0, category_dependent: false, attribute_complex_id: 0, complex_is_collection: false, ...o });
const ATTRS = { result: [
  A(85, 'Marka', { is_required: true, dictionary_id: 28732849, category_dependent: true }),
  A(4180, 'Ad', { is_required: true }),
  A(4191, 'Açıklama', { type: 'multiline' }),
  A(8229, 'Tür', { is_required: true, dictionary_id: 1960 }),
  A(9048, 'Model adı (tek kartta birleştirmek için)', { is_required: true }),
  A(4389, 'Üretici ülke', { is_required: true, is_collection: true, dictionary_id: 1935 }),
  A(23171, 'Ağırlık', { is_required: true, is_aspect: true, dictionary_id: 2001 }),
  A(4497, 'Ürün ağırlığı, g', { type: 'Integer' }),
  A(21841, 'Video bağlantısı', { type: 'URL', attribute_complex_id: 100001, complex_is_collection: true })] };
const COUNTRY1 = { result: [{ id: 90295, value: 'Турция', info: '', picture: '' }, { id: 90296, value: 'Китай', info: '', picture: '' }], has_next: true };
const COUNTRY2 = { result: [{ id: 90297, value: 'Германия', info: '', picture: '' }], has_next: false };
const MASS = { result: [{ id: 971, value: '5 kg', info: '', picture: '' }, { id: 972, value: '10 kg', info: '', picture: '' }], has_next: false };
const BRANDS = { result: [{ id: 971034861, value: 'HG', info: '', picture: '' }, { id: 971034862, value: 'HG Bahçe', info: '', picture: '' }] };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Ozon uçları: yol + gövdeye göre örnek cevap (fn: { url, body } → Response | cevap gövdesi)
function mock(extra = {}) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return real(url, opts);
    const c = { url: u, path: u.replace('https://api-seller.ozon.ru', ''), body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} };
    calls.push(c);
    if (extra[c.path]) { const r = await extra[c.path](c); return r instanceof Response ? r : J(r); }
    if (c.path === '/v1/description-category/tree') return J(TREE);
    if (c.path === '/v1/description-category/attribute') return J(ATTRS);
    if (c.path === '/v1/description-category/attribute/values') {
      if (c.body.attribute_id === 4389) return J(c.body.last_value_id === 90296 ? COUNTRY2 : COUNTRY1);
      if (c.body.attribute_id === 23171) return J(MASS);
      return J({ result: [], has_next: false });
    }
    if (c.path === '/v1/description-category/attribute/values/search') return J(/^hg/i.test(c.body.value) ? BRANDS : { result: [] });
    return J({ code: 5, message: 'Not Found', details: [] }, 404);
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

async function setup() {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  let cookie = '';
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  const t = Date.now();
  const ins = (sku, bc, name, variant, img, weight, brand = 'HG') => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, description, sale_price, list_price, vat, desi, stock, weight, group_name, variant_name, parent_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Gübre', ?, '<p>%100 organik solucan gübresi</p>', 100, 120, 10, 3, 7, ?, 'Solucan Gübresi', ?, 'ikas1:SOL-GRP', ?, ?)`, sku, bc, name, brand, img, weight, variant, t, t);
  return { db, env, call, ins };
}
async function login(call, db) {
  await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  await call('integrations/ozon', { method: 'PUT', body: JSON.stringify({ values: { OZON_CLIENT_ID: '123456', OZON_API_KEY: 'key-uuid' } }) });
  await setSetting(db, 'verified:ozon', { at: Date.now() + 1000 }); resetChannels();
}

test('Ozon ürün yükleme: kategori, özellik, eşleştirme, eksikler (ölçü / ağırlık / görsel / seçenek), gönderim ve sonuç', async () => {
  const { db, env, call, ins } = await setup();
  await ins('OZ-5', '869001', 'Solucan Gübresi 5 Kg', '5 Kg', 'https://cdn.ornek.com/a.jpg', 5.2);
  await ins('OZ-10', '869002', 'Solucan Gübresi 10 Kg', '10 Kg', 'https://cdn.ornek.com/b.PNG?v=2', 10.3);
  await ins('OZ-W', '869003', 'Solucan Gübresi 3 Kg', '3 Kg', 'https://cdn.ornek.com/c.webp', null);
  await run(db, "UPDATE products SET images = ? WHERE sku = 'OZ-5'", JSON.stringify(['https://cdn.ornek.com/a.jpg', 'https://cdn.ornek.com/a2.webp', 'https://cdn.ornek.com/a3.jpeg']));
  let polls = 0;
  const m = mock({
    '/v3/product/import': () => ({ result: { task_id: 172549793 } }),
    '/v1/product/import/info': (c) => {
      assert.deepEqual(c.body, { task_id: 172549793 });
      if (++polls === 1) return { result: { items: [{ offer_id: 'OZ-5', product_id: 0, status: 'pending', errors: [] }, { offer_id: 'OZ-10', product_id: 0, status: 'pending', errors: [] }], total: 2 } };
      return { result: { items: [
        { offer_id: 'OZ-5', product_id: 137285792, status: 'imported', errors: [] },
        { offer_id: 'OZ-10', product_id: 0, status: 'failed', errors: [{ code: 'invalid_attribute_value', field: 'attributes', attribute_id: 23171, attribute_name: 'Ağırlık', state: 'imported', level: 'error', description: 'Değer kategoriye uygun değil', message: 'invalid value' }] }], total: 2 } };
    },
  });
  try {
    await login(call, db);
    const st = await call('catalog/state');
    const oz = st.channels.find((c) => c.id === 'ozon');
    assert.ok(oz && oz.ready, JSON.stringify(oz));
    assert.deepEqual(oz.options.map((o) => o.k), ['vat', 'currency']);
    // Kategori: yalnız açılabilen tür düğümleri (disabled tür / kategori atlanır); kimlik "<description_category_id>:<type_id>"
    const cats = await call('catalog/remote-categories?channel=ozon&q=gübre');
    assert.deepEqual(cats.items, [{ id: CAT, name: 'Organik gübre', path: 'Bahçe › Gübreler' }]);
    assert.equal(cats.total, 2);
    const tree = m.calls.find((c) => c.path === '/v1/description-category/tree');
    assert.deepEqual(tree.body, { language: 'TR' });
    assert.equal(tree.headers['Client-Id'], '123456'); assert.equal(tree.headers['Api-Key'], 'key-uuid');
    const ru = await call('catalog/remote-categories?channel=ozon&q=маркиратор');
    assert.deepEqual(ru.items, [{ id: '17029016:970778135', name: 'Пистолет-маркиратор', path: 'Канцелярские товары › Печати и штампы' }], 'çevirisi olmayan ad olduğu gibi');
    // Özellikler: marka / ad / açıklama / tür / model üründen dolar (listelenmez)
    const at = (await call(`catalog/attributes?channel=ozon&category=${encodeURIComponent(CAT)}`)).attributes;
    assert.deepEqual(at.map((a) => a.id), ['4389', '23171', '4497', '21841']);
    assert.deepEqual(at.find((a) => a.id === '23171'), { id: '23171', name: 'Ağırlık', mandatory: true, kind: 'variant', type: 'enum', custom: false, multi: false });
    assert.deepEqual(at.find((a) => a.id === '4389'), { id: '4389', name: 'Üretici ülke', mandatory: true, kind: 'category', type: 'enum', custom: false, multi: true });
    assert.deepEqual(at.find((a) => a.id === '4497'), { id: '4497', name: 'Ürün ağırlığı, g', mandatory: false, kind: 'category', type: 'integer', custom: true, multi: false });
    const ab = m.calls.find((c) => c.path === '/v1/description-category/attribute').body;
    assert.deepEqual(ab, { description_category_id: 17028650, type_id: 970895715, language: 'TR' });
    // Değerler: sayfalı (last_value_id = önceki sayfanın son kimliği); Rusça değer olduğu gibi
    const vals = (await call(`catalog/values?channel=ozon&category=${encodeURIComponent(CAT)}&attribute=4389`)).values;
    assert.deepEqual(vals, [{ id: '90295', value: 'Турция' }, { id: '90296', value: 'Китай' }, { id: '90297', value: 'Германия' }]);
    const vb = m.calls.filter((c) => c.path === '/v1/description-category/attribute/values' && c.body.attribute_id === 4389).map((c) => c.body);
    assert.deepEqual(vb[0], { description_category_id: 17028650, type_id: 970895715, attribute_id: 4389, language: 'TR', limit: 2000 });
    assert.equal(vb[1].last_value_id, 90296);
    assert.deepEqual((await call(`catalog/values?channel=ozon&category=${encodeURIComponent(CAT)}&attribute=4497`)).values, [], 'serbest metin');
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'ozon', remote_id: CAT, remote_name: 'Organik gübre',
      attrs: { 23171: { value: '@variant' }, 4389: { id: '90295', value: 'Турция' }, 21841: { value: 'https://www.youtube.com/watch?v=ZwM0iBn03dY' } } }) });
    // Eksikler: seçenekler (KDV, para birimi), paket ölçüleri (panelde alan yok, desiden türetilmez), ağırlık, JPG/PNG görsel, varyant listede yok
    let cand = await call('catalog/candidates?channel=ozon&local=G%C3%BCbre');
    let by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    assert.deepEqual(by['OZ-5'].missing, ['paket ölçüleri (en, boy, yükseklik)', 'KDV oranı (Ürün yükle → Ozon seçenekleri)', 'para birimi (Ürün yükle → Ozon seçenekleri)']);
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ozon', opts: { vat: '%20', currency: 'rub' } }) });
    cand = await call('catalog/candidates?channel=ozon&local=G%C3%BCbre');
    by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    assert.deepEqual(by['OZ-5'].missing, ['paket ölçüleri (en, boy, yükseklik)']);
    assert.deepEqual(by['OZ-10'].missing, ['paket ölçüleri (en, boy, yükseklik)']);
    assert.deepEqual(by['OZ-W'].missing, ['Ağırlık (varyant “3 Kg” Ozon listesinde yok)', 'görsel (Ozon yalnız JPG / PNG kabul eder)', 'paket ölçüleri (en, boy, yükseklik)', 'ağırlık (kg)']);
    // Ölçüsüz ürün gönderilmez (Ozon'a istek gitmez)
    let up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'ozon', ids: cand.items.map((x) => x.id) }) });
    assert.equal(up.sent, 0); assert.equal(up.skipped.length, 3);
    assert.ok(!m.calls.some((c) => c.path === '/v3/product/import'));

    // Panelde paket ölçüsü alanı olduğu varsayımıyla (shape() en / boy / yükseklik cm verirse): gönderim ve sonuç
    const ch = (await getChannels(env, db)).find((c) => c.id === 'ozon'), orig = ch.catalog.build;
    ch.catalog.build = (pr, map, o) => orig({ ...pr, width: 20, height: 35.5, length: 8 }, map, o);
    up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'ozon', ids: cand.items.map((x) => x.id) }) });
    assert.equal(up.sent, 2, JSON.stringify(up)); assert.deepEqual(up.skipped.map((x) => x.name), ['Solucan Gübresi 3 Kg']);
    assert.equal(up.ref, '172549793:OZ-5,OZ-10');
    const imp = m.calls.filter((c) => c.path === '/v3/product/import');
    assert.equal(imp.length, 1);
    const s5 = imp[0].body.items.find((x) => x.offer_id === 'OZ-5'), s10 = imp[0].body.items.find((x) => x.offer_id === 'OZ-10');
    assert.deepEqual({ ...s5, attributes: undefined }, { offer_id: 'OZ-5', name: 'Solucan Gübresi 5 Kg', barcode: '869001', description_category_id: 17028650, type_id: 970895715,
      price: '100', old_price: '120', currency_code: 'RUB', vat: '0.2', height: 355, width: 200, depth: 80, dimension_unit: 'mm', weight: 5200, weight_unit: 'g',
      primary_image: 'https://cdn.ornek.com/a.jpg', images: ['https://cdn.ornek.com/a3.jpeg'], attributes: undefined,
      complex_attributes: [{ attributes: [{ id: 21841, complex_id: 100001, values: [{ value: 'https://www.youtube.com/watch?v=ZwM0iBn03dY' }] }] }] });
    assert.deepEqual(s5.attributes, [
      { id: 85, complex_id: 0, values: [{ dictionary_value_id: 971034861, value: 'HG' }] },
      { id: 4180, complex_id: 0, values: [{ value: 'Solucan Gübresi 5 Kg' }] },
      { id: 4191, complex_id: 0, values: [{ value: '<p>%100 organik solucan gübresi</p>' }] },
      { id: 9048, complex_id: 0, values: [{ value: 'SOL-GRP' }] },
      { id: 4389, complex_id: 0, values: [{ dictionary_value_id: 90295, value: 'Турция' }] },
      { id: 23171, complex_id: 0, values: [{ dictionary_value_id: 971, value: '5 kg' }] }]);
    assert.ok(!s5.attributes.some((a) => a.id === 8229), 'tür type_id ile gider');
    assert.equal(s10.primary_image, 'https://cdn.ornek.com/b.PNG?v=2'); assert.deepEqual(s10.images, []); assert.equal(s10.weight, 10300);
    assert.deepEqual(s10.attributes.find((a) => a.id === 23171).values, [{ dictionary_value_id: 972, value: '10 kg' }]);
    assert.equal(s10.attributes.find((a) => a.id === 9048).values[0].value, 'SOL-GRP', 'varyantlar aynı model adıyla tek kartta');
    const brand = m.calls.find((c) => c.path === '/v1/description-category/attribute/values/search').body;
    assert.deepEqual(brand, { description_category_id: 17028650, type_id: 970895715, attribute_id: 85, value: 'HG', limit: 100 });
    // Sonuç: önce işleniyor, sonra ürün ürün (imported → kabul, failed → hata ve nedeni)
    let ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, false);
    ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true);
    const r5 = ck.items.find((x) => x.key === 'OZ-5'), r10 = ck.items.find((x) => x.key === 'OZ-10');
    assert.equal(r5.ok, true); assert.match(r5.status, /yüklendi/);
    assert.equal(r10.ok, false); assert.equal(r10.status, 'Ozon kabul etmedi'); assert.equal(r10.error, 'Ağırlık: Değer kategoriye uygun değil');
    const pc = await first(db, "SELECT state, error FROM product_channel WHERE channel = 'ozon' AND product_id = ?", by['OZ-10'].id);
    assert.equal(pc.state, 'rejected'); assert.match(pc.error, /Değer kategoriye uygun değil/);
  } finally { m.restore(); resetChannels(); }
});

const PR = (i, o = {}) => ({ id: i, sku: `SKU-${i}`, barcode: `86900${i}`, name: `Ürün ${i}`, brand: 'HG', description: '<p>Açıklama</p>', image: 'https://cdn.ornek.com/x.jpg', images: [],
  vat: 20, desi: 1, stock: 3, price: 50, listPrice: 50, weight: 1, group: `G${i}`, variant: '5 Kg', width: 10, height: 10, length: 10, ...o });
const MAP = { remote_id: CAT, attrs: { 23171: { value: '@variant' }, 4389: { id: '90295', value: 'Турция' } } };
const OPTS = { vat: '10', currency: 'CNY' };
const pick = async (a, text) => (/^5 kg$/i.test(text) ? { id: '971', value: '5 kg' } : null);

test('Ozon build: marka bulunamadı, zorunlu özellik / varyant eksik, KDV ve para birimi doğrulaması, uzun SKU, geçersiz kategori', async () => {
  const m = mock();
  try {
    const ch = ozon({ OZON_CLIENT_ID: '1', OZON_API_KEY: 'k' }, { id: 'ozon', name: 'Ozon' });
    let b = await ch.catalog.build(PR(1), MAP, { opts: OPTS, pick });
    assert.deepEqual(b.missing, []); assert.equal(b.key, 'SKU-1');
    assert.equal(b.payload.vat, '0.1'); assert.equal(b.payload.currency_code, 'CNY'); assert.equal(b.payload.old_price, undefined, 'indirim yoksa old_price gönderilmez');
    b = await ch.catalog.build(PR(2, { brand: 'Bilinmeyen' }), MAP, { opts: OPTS, pick });
    assert.deepEqual(b.missing, ['marka “Bilinmeyen” Ozon\'da bulunamadı']);
    b = await ch.catalog.build(PR(3, { brand: '' }), MAP, { opts: OPTS, pick });
    assert.deepEqual(b.missing, ['marka']);
    // Kanallarda yayınla'da seçilen marka kimliği doğrudan kullanılır (arama yapılmaz)
    const before = m.calls.length;
    b = await ch.catalog.build(PR(4, { brand: 'HasTürk', brandId: '555' }), MAP, { opts: OPTS, pick });
    assert.deepEqual(b.payload.attributes[0], { id: 85, complex_id: 0, values: [{ dictionary_value_id: 555, value: 'HasTürk' }] });
    assert.ok(!m.calls.slice(before).some((c) => /search/.test(c.path)));
    b = await ch.catalog.build(PR(5, { variant: '' }), { remote_id: CAT, attrs: { 23171: { value: '@variant' } } }, { opts: { vat: '1', currency: 'TRY' }, pick });
    assert.deepEqual(b.missing, ['Üretici ülke', 'Ağırlık (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)', 'KDV oranı (Ürün yükle → Ozon seçenekleri)', 'para birimi (Ürün yükle → Ozon seçenekleri)']);
    // Listede olmayan yazılı değer (liste özelliği kimlik ister)
    b = await ch.catalog.build(PR(6), { remote_id: CAT, attrs: { 23171: { value: '@variant' }, 4389: { value: 'Türkiye' } } }, { opts: OPTS, pick });
    assert.deepEqual(b.missing, ['Üretici ülke (“Türkiye” Ozon listesinde yok)']);
    b = await ch.catalog.build(PR(7, { sku: 'S'.repeat(51), image: '', images: [], weight: 0, width: 0 }), MAP, { opts: OPTS, pick });
    assert.deepEqual(b.missing, ['SKU (Ozon en çok 50 karakter kabul eder)', 'görsel', 'paket ölçüleri (en, boy, yükseklik)', 'ağırlık (kg)']);
    await assert.rejects(() => ch.catalog.build(PR(8), { remote_id: '17028650', attrs: {} }, { opts: OPTS, pick }), /kategori kimliği geçersiz/);
    // Kategori marka özelliği zorunlu değilse bulunamayan marka eksik sayılmaz (gönderilmez)
    const opt = ozon({ OZON_CLIENT_ID: '1', OZON_API_KEY: 'k' }, { id: 'ozon' });
    m.restore();
    const m2 = mock({ '/v1/description-category/attribute': () => ({ result: ATTRS.result.map((a) => (a.id === 85 ? { ...a, is_required: false } : a)) }) });
    try {
      b = await opt.catalog.build(PR(9, { brand: 'Bilinmeyen' }), MAP, { opts: OPTS, pick });
      assert.deepEqual(b.missing, []); assert.ok(!b.payload.attributes.some((a) => a.id === 85));
      assert.deepEqual((await opt.catalog.brands('hg', CAT)).map((x) => x.name), ['HG', 'HG Bahçe']);
      assert.deepEqual(await opt.catalog.brands('h', CAT), [], 'en az 2 karakter');
    } finally { m2.restore(); }
  } finally { m.restore(); }
});

test('Ozon gönderim: 100\'lük parçalar, sonraki parça reddedilirse gönderilenler kaybolmaz; ilk parça reddedilirse hata; sonuçta eksik ürün', async () => {
  let n = 0;
  const m = mock({
    '/v3/product/import': (c) => {
      n++;
      assert.ok(c.body.items.length <= 100);
      if (n === 2) return J({ code: 8, message: 'You have reached operation items limits. Retry after 120 seconds. Remaining 10 items', details: [] }, 429);
      return { result: { task_id: 1000 + n } };
    },
    '/v1/product/import/info': (c) => {
      if (c.body.task_id === 1001) return { result: { items: Array.from({ length: 99 }, (_, i) => ({ offer_id: `SKU-${i}`, product_id: i + 1, status: i % 2 ? 'skipped' : 'imported', errors: [] })), total: 99 } };
      return { result: { items: Array.from({ length: 5 }, (_, i) => ({ offer_id: `SKU-${200 + i}`, product_id: 0, status: 'failed', errors: [{ code: 'e', message: 'barcode is not unique' }] })), total: 5 } };
    },
  });
  try {
    const ch = ozon({ OZON_CLIENT_ID: '1', OZON_API_KEY: 'k' }, { id: 'ozon' });
    assert.equal(ch.catalog.chunk, 100);
    const items = [];
    for (let i = 0; i < 205; i++) items.push((await ch.catalog.build(PR(i), MAP, { opts: OPTS, pick })).payload);
    items[150].offer_id = 'A:B,C;D'; // ayraç içeren SKU kayıtta bozulmaz
    const { ref } = await ch.catalog.send(items);
    const imp = m.calls.filter((c) => c.path === '/v3/product/import');
    assert.deepEqual(imp.map((c) => c.body.items.length), [100, 100, 5]);
    const parts = ref.split(';');
    assert.equal(parts.length, 3); assert.match(parts[0], /^1001:SKU-0,/); assert.match(parts[1], /^0:SKU-100,/); assert.match(parts[2], /^1003:SKU-200,/);
    const st = await ch.catalog.status(ref);
    assert.equal(st.done, true);
    const by = Object.fromEntries(st.items.map((x) => [x.key, x]));
    assert.equal(st.items.length, 205);
    assert.equal(by['SKU-0'].ok, true); assert.equal(by['SKU-1'].ok, true); assert.match(by['SKU-1'].status, /değişiklik yok/);
    assert.equal(by['SKU-99'].ok, false); assert.equal(by['SKU-99'].error, 'Ozon bu ürün için sonuç vermedi');
    assert.equal(by['A:B,C;D'].ok, false); assert.match(by['A:B,C;D'].error, /HTTP 429 You have reached operation items limits/);
    assert.equal(by['SKU-120'].status, 'Ozon\'a gönderilemedi');
    assert.equal(by['SKU-204'].ok, false); assert.equal(by['SKU-204'].error, 'barcode is not unique');
    // İlk parça reddedilirse gönderim hata verir (catalog/upload "kabul etmedi" der)
    n = 1;
    await assert.rejects(() => ch.catalog.send(items.slice(0, 3)), /HTTP 429 You have reached operation items limits/);
    // Görev numarası gelmezse hata
    m.restore();
    const m2 = mock({ '/v3/product/import': () => ({ result: {} }) });
    try { await assert.rejects(() => ch.catalog.send(items.slice(0, 1)), /task_id/); } finally { m2.restore(); }
  } finally { m.restore(); }
});
