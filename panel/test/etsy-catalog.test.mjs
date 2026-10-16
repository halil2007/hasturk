// Etsy'ye ürün yükleme (Open API v3): satıcı kategorisi ağacı (yalnız yapraklar), özellikler (possible_values), kanal ayarları (who_made / when_made /
// is_supply, kargo / hazırlık / iade profili), createDraftListing → uploadListingImage → updateListingProperty → updateListingInventory →
// updateListing state=active; sonuç senkron (kv kuyruğu), parça parça işlenir; geçici hatada kaldığı adımdan sürer.
// Sahte cevaplar Etsy belgesindeki / OpenAPI şemasındaki biçimdedir (developers.etsy.com/documentation/tutorials/listings, etsy-ts 8.0.1 data-contracts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting, all } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { etsy } from '../src/channels/etsy.js';
import worker from '../src/index.js';

// İstekler arası bekleme (hız sınırı) testte anında geçer; uzun zaman aşımları kalır
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms > 5000 ? ms : 0, ...a);

const SHOP = 123, API = 'https://openapi.etsy.com/v3/application';
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const IMG = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
// getSellerTaxonomyNodes: kökler children ile iç içe
const TAXONOMY = { count: 1, results: [{ id: 1, level: 0, name: 'Home & Living', parent_id: null, full_path_taxonomy_ids: [1], children: [
  { id: 1633, level: 1, name: 'Outdoor & Gardening', parent_id: 1, full_path_taxonomy_ids: [1, 1633], children: [
    { id: 2149, level: 2, name: 'Plant Food', parent_id: 1633, full_path_taxonomy_ids: [1, 1633, 2149], children: [] },
    { id: 2150, level: 2, name: 'Planters & Pots', parent_id: 1633, full_path_taxonomy_ids: [1, 1633, 2150], children: [] }] }] }] };
// getPropertiesByTaxonomyId
const PROPS = { count: 3, results: [
  { property_id: 200, name: 'color', display_name: 'Primary color', scales: [], is_required: true, supports_attributes: true, supports_variations: true, is_multivalued: false, max_values_allowed: null,
    possible_values: [{ value_id: 1, name: 'Beige', scale_id: null, equal_to: [] }, { value_id: 2, name: 'Black', scale_id: null, equal_to: [] }], selected_values: [] },
  { property_id: 47626759834, name: 'size', display_name: 'Size', scales: [], is_required: false, supports_attributes: true, supports_variations: true, is_multivalued: false, max_values_allowed: null,
    possible_values: [{ value_id: 18156809190, name: '5 kg', scale_id: null, equal_to: [] }, { value_id: 18107494140, name: '10 kg', scale_id: null, equal_to: [] }], selected_values: [] },
  { property_id: 513, name: 'custom1', display_name: 'Custom variation', scales: [], is_required: false, supports_attributes: false, supports_variations: true, is_multivalued: false, max_values_allowed: null, possible_values: [], selected_values: [] }] };
const SHIPPING = { count: 2, results: [{ shipping_profile_id: 6722757781, title: 'Standart', user_id: 9, origin_country_iso: 'TR', is_deleted: false, profile_type: 'manual' },
  { shipping_profile_id: 111, title: 'Eski', user_id: 9, origin_country_iso: 'TR', is_deleted: true }] };
const READY = { count: 1, results: [{ shop_id: SHOP, readiness_state_id: 18201076875, readiness_state: 'ready_to_ship', min_processing_days: 1, max_processing_days: 3, processing_days_display_label: '1-3 days' }] };
const RETURNS = { count: 1, results: [{ return_policy_id: 55, shop_id: SHOP, accepts_returns: true, accepts_exchanges: true, return_deadline: 30 }] };
const OPTS = { who_made: 'someone_else', when_made: '2020_2026', is_supply: 'hayır', shipping_profile_id: '6722757781', readiness_state_id: '18201076875', return_policy_id: '55' };

// Sahte Etsy: ilanlar bellekte; hook(c) bir cevap döndürürse o kullanılır (hata senaryoları)
function fakeEtsy({ currency = 'TRY', hook } = {}) {
  const calls = [], listings = new Map();
  let next = 900000;
  const create = (f) => {
    const id = next++;
    listings.set(id, { listing_id: id, shop_id: SHOP, title: f.title, state: 'draft', created_timestamp: Math.floor(Date.now() / 1000), images: [], inventory: null });
    return id;
  };
  const handler = async (url, opts = {}) => {
    const u = String(url), method = opts.method || 'GET';
    const c = { url: u, method, body: opts.body, headers: opts.headers || {} };
    if (typeof opts.body === 'string' && /x-www-form-urlencoded/.test(c.headers['Content-Type'] || '')) c.form = Object.fromEntries(new URLSearchParams(opts.body));
    calls.push(c);
    const h = hook && hook(c, calls);
    if (h) return h;
    if (/^https:\/\/cdn\.ornek\.com\/yok/.test(u)) return new Response('not found', { status: 404 });
    if (/^https:\/\/cdn\.ornek\.com\//.test(u)) return IMG();
    if (/api\.etsy\.com\/v3\/public\/oauth\/token/.test(u)) return J({ access_token: '123.AT', token_type: 'Bearer', expires_in: 3600, refresh_token: 'R1' });
    if (!u.startsWith(API)) return J({ error: 'yok' }, 404);
    const p = u.slice(API.length);
    if (p === '/seller-taxonomy/nodes') return J(TAXONOMY);
    if (/^\/seller-taxonomy\/nodes\/\d+\/properties$/.test(p)) return J(PROPS);
    if (p === `/shops/${SHOP}`) return J({ shop_id: SHOP, shop_name: 'HasturkShop', currency_code: currency, listing_active_count: 0 });
    if (p === `/shops/${SHOP}/shipping-profiles`) return J(SHIPPING);
    if (/^\/shops\/123\/readiness-state-definitions/.test(p)) return J(READY);
    if (p === `/shops/${SHOP}/policies/return`) return J(RETURNS);
    if (p === `/shops/${SHOP}/listings` && method === 'POST') {
      const f = c.form, id = create(f);
      return J({ listing_id: id, user_id: 9, shop_id: SHOP, title: f.title, description: f.description, state: 'draft', quantity: Number(f.quantity), taxonomy_id: Number(f.taxonomy_id),
        price: { amount: Math.round(Number(f.price) * 100), divisor: 100, currency_code: currency } }, 201);
    }
    if (/^\/shops\/123\/listings\?state=draft/.test(p)) return J({ count: listings.size, results: [...listings.values()].filter((l) => l.state === 'draft').reverse() });
    let m = p.match(/^\/shops\/123\/listings\/(\d+)\/images$/);
    if (m && method === 'POST') {
      const l = listings.get(+m[1]), img = { listing_id: +m[1], listing_image_id: 7000 + l.images.length, rank: Number(opts.body.get('rank')), url_fullxfull: `https://i.etsystatic.com/${m[1]}/${l.images.length}.jpg` };
      l.images.push(img);
      return J(img, 201);
    }
    m = p.match(/^\/shops\/123\/listings\/(\d+)\/properties\/(\d+)$/);
    if (m && method === 'PUT') return J({ property_id: +m[2], property_name: 'x', scale_id: null, scale_name: null, value_ids: c.form.value_ids.split(',').map(Number), values: c.form.values.split(',') });
    m = p.match(/^\/listings\/(\d+)\/inventory$/);
    if (m && method === 'PUT') { const b = JSON.parse(opts.body); listings.get(+m[1]).inventory = b; return J({ products: b.products.map((x, i) => ({ product_id: 1 + i, ...x, is_deleted: false })) }); }
    m = p.match(/^\/shops\/123\/listings\/(\d+)$/);
    if (m && method === 'PATCH') { const l = listings.get(+m[1]); l.state = c.form.state; return J({ listing_id: l.listing_id, state: l.state }); }
    // İlan listesi (fetchListings): aktif ilanlar envanteriyle
    if (/^\/shops\/123\/listings\?state=active/.test(p)) {
      const rows = [...listings.values()].filter((l) => l.state === 'active').map((l) => ({ listing_id: l.listing_id, title: l.title, state: 'active', price: { amount: 0, divisor: 100 },
        images: l.images, inventory: { products: (l.inventory.products || []).map((x, i) => ({ product_id: 1 + i, sku: x.sku, is_deleted: false, property_values: [],
          offerings: x.offerings.map((o) => ({ offering_id: 1, quantity: o.quantity, is_enabled: true, is_deleted: false, price: { amount: Math.round(o.price * 100), divisor: 100, currency_code: currency } })) })) } }));
      return J({ count: rows.length, results: rows });
    }
    if (/^\/shops\/123\/receipts/.test(p)) return J({ count: 0, results: [] });
    return J({ error: `bilinmeyen ${method} ${p}` }, 404);
  };
  return { calls, listings, handler, create };
}

async function panel() {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  let cookie = '';
  const bg = [];
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil(p) { bg.push(p); } });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  return { db, env, call, idle: () => Promise.all(bg.splice(0)) };
}
const realFetch = globalThis.fetch;
function useFetch(fake) {
  globalThis.fetch = async (url, opts = {}) => (String(url).startsWith('https://panel.test') ? realFetch(url, opts) : fake.handler(url, opts));
}

test('Etsy ürün yükleme: kategori, özellikler, kanal ayarları, eksikler, gönderim adımları, ret ve sonuç', async () => {
  const { db, call, idle } = await panel();
  const t = Date.now();
  const ins = (sku, name, variant, img, extra = {}) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, images, description, sale_price, list_price, vat, desi, stock, group_name, variant_name, created_at, updated_at)
    VALUES (?, '', ?, 'HG', 'Gübre', ?, ?, ?, 100, 120, 10, 2, ?, 'Solucan Gübresi', ?, ?, ?)`, sku, name, img, JSON.stringify(extra.images || []), extra.desc || '', extra.stock ?? 7, variant, t, t);
  await ins('SOL-5', 'Solucan Gübresi 5 Kg', '5 Kg', 'https://cdn.ornek.com/a.jpg', { desc: '<p><b>%100 organik</b></p><ul><li>Kök gelişimi</li></ul>' });
  await ins('SOL-10', 'Solucan Gübresi 10 Kg', '10 Kg', 'https://cdn.ornek.com/b.jpg', { images: ['https://cdn.ornek.com/yok.jpg', 'https://cdn.ornek.com/c.jpg'] });
  await ins('SOL-RED', 'Solucan Gübresi Reddedilen', '', 'https://cdn.ornek.com/d.jpg');
  await ins('', 'Kodsuz Gübre', '', '');
  await ins('SOL-0', 'Stoksuz Gübre', '', 'https://cdn.ornek.com/e.jpg', { stock: 0 });
  await ins('SOL-DEG', 'Saksı 360° Döner + Hediye + Toprak', '', 'https://cdn.ornek.com/f.jpg');
  // Etsy, SOL-RED'in envanterini reddeder (ilan açıldıktan sonraki adım: taslak numarası hatada yazılır)
  const fake = fakeEtsy({ hook: (c) => {
    if (/\/listings\/\d+\/inventory$/.test(c.url) && c.method === 'PUT' && JSON.parse(c.body).products[0].sku === 'SOL-RED') return J({ error: 'The price must be a positive number' }, 400);
  } });
  useFetch(fake);
  try {
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await call('integrations/etsy', { method: 'PUT', body: JSON.stringify({ values: { ETSY_SHOP_ID: String(SHOP), ETSY_API_KEY: 'KEY', ETSY_SHARED_SECRET: 'SEC', ETSY_REFRESH_TOKEN: 'R0' } }) });
    await setSetting(db, 'verified:etsy', { at: Date.now() + 1000 }); resetChannels();
    const st = await call('catalog/state');
    const ch = st.channels.find((c) => c.id === 'etsy');
    assert.ok(ch && ch.ready, JSON.stringify(st.channels.map((c) => c.id)));
    assert.deepEqual(ch.options.map((o) => o.k), ['who_made', 'when_made', 'is_supply', 'shipping_profile_id', 'readiness_state_id', 'return_policy_id']);

    // Kategori: yalnız yapraklar, yol üst düğümlerden
    const cats = await call('catalog/remote-categories?channel=etsy&q=plant');
    assert.deepEqual(cats.items, [{ id: '2149', name: 'Plant Food', path: 'Home & Living › Outdoor & Gardening' }, { id: '2150', name: 'Planters & Pots', path: 'Home & Living › Outdoor & Gardening' }]);
    assert.equal(cats.total, 2);
    // Özellikler: ilana yazılamayan (supports_attributes=false) gösterilmez; değerler possible_values
    const at = await call('catalog/attributes?channel=etsy&category=2149');
    assert.deepEqual(at.attributes.map((a) => [a.id, a.name, a.mandatory, a.type]), [['200', 'Primary color', true, 'enum'], ['47626759834', 'Size', false, 'enum']]);
    const vals = await call('catalog/values?channel=etsy&category=2149&attribute=47626759834');
    assert.deepEqual(vals.values, [{ id: '18156809190', value: '5 kg' }, { id: '18107494140', value: '10 kg' }]);
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'etsy', remote_id: '2149', remote_name: 'Plant Food', attrs: { 200: { id: '1', value: 'Beige' }, 47626759834: { value: '@variant' } } }) });

    // Kanal ayarları girilmeden: satıcı beyanları ve profiller eksik (varsayılan verilmez; mağazadaki tek kargo profili önerilir)
    let cand = await call('catalog/candidates?channel=etsy&local=G%C3%BCbre');
    const by = (c) => Object.fromEntries(c.items.map((x) => [x.sku || x.name, x]));
    let m5 = by(cand)['SOL-5'].missing;
    assert.ok(m5.some((x) => /kim yaptı/.test(x)) && m5.some((x) => /ne zaman yapıldı/.test(x)) && m5.some((x) => /malzeme/.test(x)), JSON.stringify(m5));
    assert.ok(m5.includes('Etsy kargo profili numarası (shipping_profile_id) — mağazanızda tek kayıt var: 6722757781 “Standart” (kullanmak için Kanal ayarlarına yazın) (Ürün yükle → Etsy seçenekleri)'), JSON.stringify(m5));
    assert.ok(m5.some((x) => /hazırlık profili.*18201076875 “ready_to_ship · 1-3 days”/.test(x)), JSON.stringify(m5));
    assert.ok(m5.some((x) => /iade politikası.*55 “iade 30 gün”/.test(x)), JSON.stringify(m5));
    // Geçersiz değerler: Etsy'nin kabul etmediği beyan, mağazada olmayan profil
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'etsy', opts: { ...OPTS, who_made: 'ben', shipping_profile_id: '999' } }) });
    m5 = by(await call('catalog/candidates?channel=etsy&local=G%C3%BCbre'))['SOL-5'].missing;
    assert.deepEqual(m5, ['Etsy: ürünü kim yaptı (i_did = ben, someone_else = başka biri, collective = ekibim): “ben” geçersiz',
      'Etsy kargo profili numarası (shipping_profile_id): “999” mağazanızda yok — mağazanızda tek kayıt var: 6722757781 “Standart” (kullanmak için Kanal ayarlarına yazın)']);
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'etsy', opts: OPTS }) });
    cand = await call('catalog/candidates?channel=etsy&local=G%C3%BCbre');
    const c = by(cand);
    assert.deepEqual(c['SOL-5'].missing, []); assert.deepEqual(c['SOL-10'].missing, []); assert.deepEqual(c['SOL-RED'].missing, []);
    assert.ok(c['Kodsuz Gübre'].missing.includes('SKU') && c['Kodsuz Gübre'].missing.includes('görsel'), JSON.stringify(c['Kodsuz Gübre'].missing));
    assert.deepEqual(c['SOL-0'].missing, ['stok (Etsy en az 1 adet ister)']);
    assert.deepEqual(c['SOL-DEG'].missing, ['ürün adında Etsy\'nin kabul etmediği karakter var (“°”)', 'ürün adında “+” Etsy\'de en fazla bir kez kullanılabilir']);

    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'etsy', ids: Object.values(c).map((x) => x.id) }) });
    assert.equal(up.sent, 3, JSON.stringify(up)); assert.equal(up.skipped.length, 3);
    assert.match(up.ref, /^j/);
    // createDraftListing: form gövdesi, zorunlu alanlar belgeye göre
    const creates = fake.calls.filter((x) => x.method === 'POST' && x.url === `${API}/shops/${SHOP}/listings`);
    assert.equal(creates.length, 3);
    const f5 = creates.find((x) => x.form.title === 'Solucan Gübresi 5 Kg');
    assert.equal(f5.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(f5.headers['x-api-key'], 'KEY:SEC'); assert.equal(f5.headers.Authorization, 'Bearer 123.AT');
    assert.deepEqual(f5.form, { quantity: '7', title: 'Solucan Gübresi 5 Kg', description: '%100 organik\n\n• Kök gelişimi', price: '100', who_made: 'someone_else', when_made: '2020_2026',
      is_supply: 'false', taxonomy_id: '2149', type: 'physical', shipping_profile_id: '6722757781', readiness_state_id: '18201076875', return_policy_id: '55' });
    const id5 = [...fake.listings.values()].find((l) => l.title === 'Solucan Gübresi 5 Kg').listing_id;
    // Görsel: indirilip multipart "image" + rank ile yüklenir (Content-Type'ı fetch koyar)
    const imgs5 = fake.calls.filter((x) => x.url === `${API}/shops/${SHOP}/listings/${id5}/images`);
    assert.equal(imgs5.length, 1);
    assert.ok(imgs5[0].body instanceof FormData); assert.equal(imgs5[0].headers['Content-Type'], undefined);
    assert.equal(imgs5[0].body.get('rank'), '1'); assert.equal(imgs5[0].body.get('image').type, 'image/jpeg'); assert.equal(imgs5[0].body.get('image').name, 'a.jpg');
    // Özellikler: renk (seçili değer) + boyut (varyanttan "5 Kg" → "5 kg")
    const props5 = fake.calls.filter((x) => x.url.startsWith(`${API}/shops/${SHOP}/listings/${id5}/properties/`));
    assert.deepEqual(props5.map((x) => [x.method, x.url.split('/').pop(), x.form]), [['PUT', '200', { value_ids: '1', values: 'Beige' }], ['PUT', '47626759834', { value_ids: '18156809190', values: '5 kg' }]]);
    // Envanter: SKU, fiyat, adet, hazırlık profili; varyasyon yok
    assert.deepEqual(fake.listings.get(id5).inventory, { products: [{ sku: 'SOL-5', property_values: [], offerings: [{ price: 100, quantity: 7, is_enabled: true, readiness_state_id: 18201076875 }] }],
      price_on_property: [], quantity_on_property: [], sku_on_property: [], readiness_state_on_property: [] });
    const act = fake.calls.find((x) => x.method === 'PATCH' && x.url === `${API}/shops/${SHOP}/listings/${id5}`);
    assert.deepEqual(act.form, { state: 'active' });
    // Sıra: oluştur → görsel → özellik → envanter → yayına al
    const seq = fake.calls.filter((x) => x.url.startsWith(API) && x.url.includes(String(id5))).map((x) => `${x.method} ${x.url.slice(API.length).replace(String(id5), 'L').replace(/\/properties\/\d+/, '/properties')}`);
    assert.deepEqual(seq, ['POST /shops/123/listings/L/images', 'PUT /shops/123/listings/L/properties', 'PUT /shops/123/listings/L/properties', 'PUT /listings/L/inventory', 'PATCH /shops/123/listings/L']);
    // SOL-10: inmeyen görsel atlanır, diğerleri sırayla
    const id10 = [...fake.listings.values()].find((l) => l.title === 'Solucan Gübresi 10 Kg').listing_id;
    assert.deepEqual(fake.listings.get(id10).images.map((x) => x.rank), [1, 2]);

    const ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    await idle();
    assert.equal(ck.done, true);
    const r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(r['SOL-5'].ok, true); assert.match(r['SOL-5'].status, /Etsy'de yayında \(ilan #\d+\)/);
    assert.equal(r['SOL-10'].ok, true); assert.match(r['SOL-10'].status, /görsel 2 indirilemedi/);
    assert.equal(r['SOL-RED'].ok, false);
    assert.match(r['SOL-RED'].error, /^Etsy: The price must be a positive number · Etsy'de taslak ilan #\d+ açıldı/);
    // Reddedilen ürün yayına alınmadı
    const red = [...fake.listings.values()].find((l) => l.title === 'Solucan Gübresi Reddedilen');
    assert.equal(red.state, 'draft');
    // Kanal durumu: kabul → yayında, red → reddedildi; onaylananlar ilan listesinden SKU ile ürüne bağlanır
    const pc = Object.fromEntries((await all(db, 'SELECT p.sku, c.state FROM product_channel c JOIN products p ON p.id = c.product_id WHERE c.channel = ?', 'etsy')).map((x) => [x.sku, x.state]));
    assert.deepEqual(pc, { 'SOL-5': 'live', 'SOL-10': 'live', 'SOL-RED': 'rejected' });
    const ls = await all(db, "SELECT l.sku, p.sku AS psku FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE l.channel = 'etsy' ORDER BY l.sku");
    assert.deepEqual(ls.map((x) => [x.sku, x.psku]), [['SOL-10', 'SOL-10'], ['SOL-5', 'SOL-5']]);
    // Tekrar sorgu: Etsy'ye yeni istek gitmez, sonuç aynı
    const before = fake.calls.length;
    const ck2 = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck2.done, true); assert.equal(fake.calls.filter((x, i) => i >= before && x.url.startsWith(API) && x.method !== 'GET').length, 0);
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});

// ---- kanal düzeyinde: kuyruk, parça sınırı, geçici hata, para birimi
const EENV = { ETSY_SHOP_ID: String(SHOP), ETSY_API_KEY: 'KEY', ETSY_SHARED_SECRET: 'SEC', ETSY_REFRESH_TOKEN: 'R0' };
function memKv() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null), set: async (k, v) => { m.set(k, structuredClone(v)); } };
}
const MAP = { remote_id: '2149', remote_name: 'Plant Food', attrs: { 200: { id: '2', value: 'Black' } } };
const prod = (i, extra = {}) => ({ id: i, sku: `SKU-${i}`, barcode: '', name: `Gübre ${i}`, brand: 'HG', description: 'Organik', image: `https://cdn.ornek.com/${i}.jpg`, images: [], vat: 20, desi: 1, stock: 3, price: 50, listPrice: 50, weight: null, group: '', variant: '', ...extra });

test('Etsy: gönderim parça parça işlenir (send ilk 3, her sorgu 8); geçici hatada ürün sırada kalır ve kaldığı adımdan sürer; aynı SKU iki kez gönderilmez', async () => {
  let fail429 = true, fail500 = true;
  const fake = fakeEtsy({ hook: (c) => {
    // SKU-5'in görseli bir kez 429 (hız sınırı; http bir kez yeniden dener, ikisi de 429) → ürün sırada kalır
    if (c.method === 'POST' && /\/images$/.test(c.url) && c.body.get('image').name === '5.jpg' && fail429) return J({ error: 'Too many requests' }, 429);
    // SKU-7'nin oluşturma isteği Etsy'de ilanı açar ama 503 döner → sonraki turda taslaklardan bulunur, ikinci ilan açılmaz
    if (c.method === 'POST' && c.url === `${API}/shops/${SHOP}/listings` && c.form.title === 'Gübre 7' && fail500) { fail500 = false; fake.create(c.form); return J({ error: 'Service Unavailable' }, 503); }
  } });
  globalThis.fetch = fake.handler;
  try {
    const kv = memKv(), ch = etsy(EENV, { id: 'etsy', kv });
    const built = [];
    for (let i = 1; i <= 13; i++) built.push(await ch.catalog.build(prod(i), MAP, { opts: OPTS }));
    built.push(await ch.catalog.build(prod(99, { sku: 'SKU-1' }), MAP, { opts: OPTS }));
    assert.ok(built.every((b) => !b.missing.length), JSON.stringify(built.find((b) => b.missing.length)));
    const { ref } = await ch.catalog.send(built.map((b) => b.payload));
    // kv: başlık + 25'lik parçalar
    assert.deepEqual(Object.keys(kv.m.get('up:' + ref)), ['at', 'parts', 'lock']);
    assert.equal(kv.m.get('up:' + ref).lock, null);
    const creates = () => fake.calls.filter((x) => x.method === 'POST' && x.url === `${API}/shops/${SHOP}/listings`).map((x) => x.form.title);
    assert.deepEqual(creates(), ['Gübre 1', 'Gübre 2', 'Gübre 3']);
    let s = await ch.catalog.status(ref);
    assert.equal(s.done, false);
    const by = (x) => Object.fromEntries(x.items.map((i) => [i.key, i]));
    let r = by(s);
    // aynı SKU'lu ikinci ürün gönderilmeden reddedilir (ilk ürün işlenir)
    assert.equal(s.items.filter((x) => x.key === 'SKU-1').length, 2);
    assert.ok(s.items.some((x) => x.key === 'SKU-1' && x.ok === false && /aynı SKU/.test(x.error)));
    assert.equal(r['SKU-4'].ok, true);
    // SKU-5: geçici hata → bu tur durur, ürün sırada (ilan açılmış: numarası durumda)
    assert.equal(r['SKU-5'].ok, null); assert.match(r['SKU-5'].status, /yükleniyor \(ilan #\d+\)/); assert.match(r['SKU-5'].error, /Too many requests/);
    assert.equal(r['SKU-6'].ok, null);
    assert.deepEqual(creates(), ['Gübre 1', 'Gübre 2', 'Gübre 3', 'Gübre 4', 'Gübre 5']);
    fail429 = false;
    s = await ch.catalog.status(ref);
    r = by(s);
    // SKU-5 yeniden oluşturulmaz, görselden sürer; SKU-7'de (503) tur durur
    assert.equal(r['SKU-5'].ok, true);
    assert.equal(creates().filter((t) => t === 'Gübre 5').length, 1);
    // SKU-7: 503 sonrası ilan taslaklarda bulunur (aynı başlık, yeni) → ikinci kez açılmaz
    assert.equal(r['SKU-7'].ok, null);
    s = await ch.catalog.status(ref);
    r = by(s);
    assert.equal(r['SKU-7'].ok, true);
    assert.equal([...fake.listings.values()].filter((l) => l.title === 'Gübre 7').length, 1);
    assert.equal(creates().filter((t) => t === 'Gübre 7').length, 1);
    while (!s.done) s = await ch.catalog.status(ref);
    assert.equal(s.items.filter((x) => x.ok === true).length, 13);
    assert.equal([...fake.listings.values()].filter((l) => l.state === 'active').length, 13);
    // Bitince yükler silinir, sonuç kalır
    const part = kv.m.get(`up:${ref}:0`);
    assert.deepEqual(Object.keys(part[0].p), ['key']);
    // Kayıt yoksa: sonuç yok, bitti sayılır
    assert.deepEqual(await ch.catalog.status('jbilinmeyen'), { done: true, items: [] });
  } finally { globalThis.fetch = realFetch; }
});

test('Etsy: kalıcı ret (görsel yok / yetki) ürünü düşürür; aynı gönderimi aynı anda iki işlem yürütmez; kimlik hatası gönderimden önce', async () => {
  const fake = fakeEtsy({ hook: (c) => {
    if (c.method === 'POST' && /\/images$/.test(c.url)) return J({ error: 'Image could not be processed' }, 400);
  } });
  globalThis.fetch = fake.handler;
  try {
    const kv = memKv(), ch = etsy(EENV, { id: 'etsy', kv });
    const b = await ch.catalog.build(prod(1), MAP, { opts: OPTS });
    const { ref } = await ch.catalog.send([b.payload]);
    const s = await ch.catalog.status(ref);
    assert.equal(s.done, true);
    assert.equal(s.items[0].ok, false);
    assert.match(s.items[0].error, /^Etsy: görsel yüklenemedi \(görsel 1: Image could not be processed\); Etsy yayındaki ilanda en az bir görsel ister · Etsy'de taslak ilan #\d+ açıldı/);
    // Kilit: başka işlem sürerken sorgu istek göndermez
    const b2 = await ch.catalog.build(prod(2), MAP, { opts: OPTS });
    globalThis.fetch = fakeEtsy().handler;
    const ch2 = etsy(EENV, { id: 'etsy', kv });
    const { ref: ref2 } = await ch2.catalog.send([]);
    const head = kv.m.get('up:' + ref2);
    kv.m.set(`up:${ref2}:0`, [{ p: b2.payload, st: {} }]); kv.m.set('up:' + ref2, { ...head, parts: 1, lock: { tok: 'baska', until: Date.now() + 60e3 } });
    const s2 = await ch2.catalog.status(ref2);
    assert.equal(s2.done, false); assert.equal(s2.items[0].ok, null);
    // Kimlik hatası: send atar, kuyruk açılmaz
    globalThis.fetch = async (u) => (/oauth\/token/.test(String(u)) ? J({ error: 'invalid_grant' }, 400) : J({}, 404));
    await assert.rejects(() => etsy(EENV, { id: 'etsy', kv: memKv() }).catalog.send([b.payload]), /refresh token geçersiz/);
  } finally { globalThis.fetch = realFetch; }
});

test('Etsy: mağaza para birimi TL değilse çevrilmemiş (TL) fiyat gönderilmez; çevrilmiş fiyat olduğu gibi gider; zorunlu özellik ve iade politikası (AB "yok")', async () => {
  globalThis.fetch = fakeEtsy({ currency: 'USD' }).handler;
  try {
    const ch = etsy(EENV, { id: 'etsy', kv: memKv() });
    assert.equal(await ch.catalog.currency(), 'USD');
    let b = await ch.catalog.build(prod(1, { price: 412.5 }), MAP, { opts: OPTS });
    assert.deepEqual(b.missing, ['fiyat para birimi (TRY; Etsy mağazanız USD kullanıyor)']);
    // catalog.js inCurrency TCMB kuruyla çevirip pr.currency'yi koyar
    b = await ch.catalog.build(prod(1, { price: 10, currency: 'USD' }), MAP, { opts: OPTS });
    assert.deepEqual(b.missing, []);
    assert.equal(b.payload.listing.price, 10); assert.equal(b.payload.price, 10);
    // Zorunlu renk seçilmemiş; AB mağazası iade politikası yerine "yok"
    b = await ch.catalog.build(prod(1, { currency: 'USD' }), { ...MAP, attrs: {} }, { opts: { ...OPTS, return_policy_id: 'yok' } });
    assert.deepEqual(b.missing, ['Primary color']);
    assert.equal(b.payload.listing.return_policy_id, undefined);
    b = await ch.catalog.build(prod(1, { variant: 'Mor', currency: 'USD' }), { ...MAP, attrs: { 200: { value: '@variant' } } }, { opts: OPTS, pick: async () => null });
    assert.deepEqual(b.missing, ['Primary color (varyant “Mor” Etsy listesinde yok)']);
  } finally { globalThis.fetch = realFetch; }
});
