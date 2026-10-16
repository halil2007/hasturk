// Mirakl (Koçtaş / Teknosa) ürün yükleme: H11 kategori ağacı (son kategoriler), PM11 özellikleri (kategori + üst kategoriler + ortak, zorunluluk,
// varyant, DISABLED), VL11 değer listeleri, P31 barkod araması (katalogda varsa yalnız OF24 teklif), P41 ürün dosyası (PC01 ayırıcı, PM11 kodları),
// P42 / P47 / P44 durum ve raporlar, onaydan sonra OF24 teklif, OF02 / OF03 teklif sonucu. Sahte cevaplar Mirakl OpenAPI örneklerinin biçiminde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import worker from '../src/index.js';
import { koctas } from '../src/channels/koctas.js';
import { teknosa } from '../src/channels/teknosa.js';
import { parseCsv, reportErrors } from '../src/channels/mirakl-catalog.js';

const tr = (label) => [{ locale: 'tr_TR', value: label }];
const H11 = { hierarchies: [
  { code: 'YAPI', label: 'Yapı Market', label_translations: tr('Yapı Market'), level: 1, parent_code: '' },
  { code: 'ELEKTRIKLI', label: 'Elektrikli El Aletleri', label_translations: tr('Elektrikli El Aletleri'), level: 2, parent_code: 'YAPI' },
  { code: 'MATKAP', label: 'Matkaplar', label_translations: tr('Matkaplar'), level: 3, parent_code: 'ELEKTRIKLI' },
  { code: 'BAHCE', label: 'Bahçe', label_translations: tr('Bahçe'), level: 1, parent_code: '' },
  { code: 'HORTUM', label: 'Hortumlar', label_translations: tr('Hortumlar'), level: 2, parent_code: 'BAHCE' },
] };
const A = (code, label, hierarchy_code, requirement_level, type, extra = {}) => ({ code, label, label_translations: tr(label), description_translations: [], hierarchy_code, requirement_level,
  required: requirement_level === 'REQUIRED', roles: [], type, type_parameter: null, variant: false, ...extra });
const PM11 = { attributes: [
  A('category', 'Kategori', '', 'REQUIRED', 'TEXT', { roles: [{ type: 'CATEGORY', parameters: [] }] }),
  A('title', 'Ürün Adı', '', 'REQUIRED', 'TEXT'),
  A('ean', 'EAN', '', 'REQUIRED', 'TEXT'),
  A('shop_sku', 'Satıcı Ürün Kodu', '', 'REQUIRED', 'TEXT'),
  A('description', 'Açıklama', '', 'RECOMMENDED', 'TEXT'),
  A('brand', 'Marka', '', 'REQUIRED', 'LIST', { type_parameter: 'brands' }),
  A('main_image', 'Ana Görsel', '', 'REQUIRED', 'MEDIA'),
  A('image_2', 'Ek Görsel', '', 'OPTIONAL', 'MEDIA'),
  A('color', 'Renk', 'MATKAP', 'REQUIRED', 'LIST', { type_parameter: 'colors', variant: true }),
  A('material', 'Malzeme', 'ELEKTRIKLI', 'REQUIRED', 'LIST', { type_parameter: 'materials' }),
  A('hose_len', 'Hortum Uzunluğu', 'HORTUM', 'REQUIRED', 'TEXT'),
  A('old_code', 'Eski Kod', '', 'DISABLED', 'TEXT'),
  A('model', 'Model', 'MATKAP', 'OPTIONAL', 'TEXT'),
] };
const V = (code, label) => ({ code, label, label_translations: tr(label) });
const VL11 = { values_lists: [
  { code: 'brands', label: 'Markalar', label_translations: tr('Markalar'), values: [V('BOSCH', 'Bosch'), V('MAKITA', 'Makita')] },
  { code: 'colors', label: 'Renkler', label_translations: tr('Renkler'), values: [V('RED', 'Kırmızı'), V('BLUE', 'Mavi')] },
  { code: 'materials', label: 'Malzemeler', label_translations: tr('Malzemeler'), values: [V('MET', 'Metal'), V('PLA', 'Plastik')] },
] };
const PC01 = { features: { operator_csv_delimiter: 'SEMICOLON', catalog: { list_of_multiple_values_separator: '|', product_import_only_on_leaf: true } }, platform_name: 'Koçtaş' };
const OF61 = { offer_states: [{ code: '11', label: 'Yeni' }, { code: '4', label: 'İkinci El' }], total_count: 2 };
const AF01 = { additional_fields: [{ code: 'ecotax', description: 'Eco tax', editable: true, entity: 'OFFER', label: 'Eco tax', required: false, type: 'NUMERIC' }] };
const P31 = (refs, known) => ({ products: refs.map((r) => r.split('|')).filter(([t, id]) => t === 'EAN' && known[id]).map(([t, id]) => ({ category_code: 'MATKAP', category_label: 'Matkaplar',
  product_id: id, product_id_type: t, product_sku: known[id], product_title: 'Matkap' })), total_count: 1 });

// Sahte Mirakl sunucusu: durum `S` ile adım adım değişir
function mirakl(base, S) {
  const calls = [];
  const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  const T = (t) => new Response(t, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  const fn = async (url, opts = {}) => {
    const u = new URL(String(url)), m = opts.method || 'GET', p = u.pathname.replace(/^\/api/, '');
    calls.push({ url: String(url), path: p, method: m, body: opts.body, headers: opts.headers || {}, q: u.searchParams });
    if (!String(url).startsWith(base)) return J({ message: 'yanlış adres' }, 404);
    if (m === 'GET' && p === '/hierarchies') return J(H11);
    if (m === 'GET' && p === '/products/attributes') return J(PM11);
    if (m === 'GET' && p === '/values_lists') return J(VL11);
    if (m === 'GET' && p === '/platform/configuration') return J(PC01);
    if (m === 'GET' && p === '/offers/states') return J(OF61);
    if (m === 'GET' && p === '/additional_fields') return J(AF01);
    if (m === 'GET' && p === '/products') return J(P31(u.searchParams.get('product_references').split(','), S.catalog));
    if (m === 'GET' && p === '/offers') {
      const sku = u.searchParams.get('sku');
      if (sku) return J({ total_count: S.offers[sku] ? 1 : 0, offers: S.offers[sku] ? [S.offers[sku]] : [] });
      return J({ total_count: 1, offers: [{ shop_sku: 'ESKI-1', product_sku: 'MKP0', price: 10, quantity: 1, state_code: '11', product_references: [{ reference_type: 'EAN', reference: '8680000000001' }] }] });
    }
    if (m === 'POST' && p === '/offers') { if (S.of24Fail) return J({ message: 'Invalid offer' }, 400); const id = S.nextOffer++; return J({ import_id: id }, 201); }
    if (m === 'POST' && p === '/products/imports') return J({ import_id: S.p41Id }, 201);
    let x;
    if (m === 'GET' && (x = /^\/products\/imports\/(\d+)$/.exec(p))) return J(S.p42[x[1]]);
    if (m === 'GET' && (x = /^\/products\/imports\/(\d+)\/transformation_error_report$/.exec(p))) return T(S.p47[x[1]] || '');
    if (m === 'GET' && (x = /^\/products\/imports\/(\d+)\/error_report$/.exec(p))) return T(S.p44[x[1]] || '');
    if (m === 'GET' && (x = /^\/offers\/imports\/(\d+)$/.exec(p))) return J(S.of02[x[1]] || { status: 'WAITING' });
    if (m === 'GET' && (x = /^\/offers\/imports\/(\d+)\/error_report$/.exec(p))) return T(S.of03[x[1]] || '');
    return J({});
  };
  return { calls, fn };
}
const of02 = (id, o = {}) => ({ date_created: '2026-10-16T10:00:00Z', has_error_report: false, import_id: id, lines_in_error: 0, lines_in_pending: 0, lines_in_success: 1, lines_read: 1, mode: 'NORMAL',
  offer_deleted: 0, offer_inserted: 1, offer_updated: 0, reason_status: '', status: 'COMPLETE', ...o });
const p42 = (id, o = {}) => ({ date_created: '2026-10-16T10:00:00Z', has_error_report: false, has_new_product_report: false, has_transformation_error_report: false, has_transformed_file: true,
  import_id: id, import_status: 'SENT', shop_id: 2000, transform_lines_in_error: 0, transform_lines_in_success: 2, transform_lines_read: 2, transform_lines_with_warning: 0, ...o });

async function panel(db) {
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db }, jobs = [];
  let cookie = '';
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil(p) { jobs.push(p); } });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  return { call, jobs };
}
const BASE = 'https://koctas-prod.mirakl.net/api';

test('Koçtaş ürün yükleme: kategori / özellik / değer, eksik kontrolü, katalogda olana yalnız teklif, yeniye ürün dosyası, onaydan sonra teklif', async () => {
  const db = d1(); await init(db); resetChannels();
  const t = Date.now();
  const ins = (sku, bc, name, brand, variant, images = []) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, description, image, images, sale_price, list_price, vat, desi, stock, group_name, variant_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Matkap', '<p>Güçlü matkap</p>', ?, ?, 100, 120, 20, 3, 7, 'Darbeli Matkap', ?, ?, ?)`, sku, bc, name, brand, images[0] || '', JSON.stringify(images), variant, t, t);
  await ins('MAT-1', '8690001', 'Darbeli Matkap 500W', 'Bosch', '', ['https://cdn.ornek.com/1.jpg']);
  await ins('MAT-2', '8690002', 'Darbeli Matkap Kırmızı', 'Bosch', 'Kırmızı', ['https://cdn.ornek.com/2a.jpg', 'https://cdn.ornek.com/2b.jpg']);
  await ins('MAT-3', '8690003', 'Darbeli Matkap Mavi', 'BOSCH', 'Mavi', ['https://cdn.ornek.com/3.jpg']);
  await ins('MAT-4', '8690004', 'Darbeli Matkap Yeşil', 'Bilinmez', 'Kırmızı', ['https://cdn.ornek.com/4.jpg']);
  await ins('MAT-5', '8690005', 'Darbeli Matkap Eski', 'Bosch', 'Mavi', ['https://cdn.ornek.com/5.jpg']);
  await ins('MAT-X', '', 'Barkodsuz Matkap', 'Bosch', 'Mavi', []);
  const S = { catalog: { '8690001': 'MKP1' }, offers: { 'MAT-5': { shop_sku: 'MAT-5', product_sku: 'MKP5', price: 99, quantity: 3 } }, nextOffer: 2044, p41Id: 2035, p42: {}, p47: {}, p44: {}, of02: {}, of03: {} };
  const M = mirakl(BASE, S), real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (String(url).startsWith('https://panel.test') ? real(url, opts) : M.fn(url, opts));
  const { call, jobs } = await panel(db);
  try {
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await call('integrations/koctas', { method: 'PUT', body: JSON.stringify({ values: { KOCTAS_URL: 'https://koctas-prod.mirakl.net', KOCTAS_API_KEY: 'mk-1' } }) });
    await setSetting(db, 'verified:koctas', { at: Date.now() + 1000 }); resetChannels();
    const st = await call('catalog/state');
    const k = st.channels.find((c) => c.id === 'koctas');
    assert.ok(k && k.ready, JSON.stringify(k));
    assert.ok(k.options.some((o) => o.k === 'attrTitle') && k.options.some((o) => o.k === 'eanType'));

    // H11: yalnız son kategoriler (çocuğu olmayan), yol üst kategorilerden
    const cats = await call('catalog/remote-categories?channel=koctas&q=matkap');
    assert.deepEqual(cats.items, [{ id: 'MATKAP', name: 'Matkaplar', path: 'Yapı Market › Elektrikli El Aletleri' }]);
    assert.equal((await call('catalog/remote-categories?channel=koctas')).total, 2);
    // PM11: ortak + kategori + üst kategori özellikleri; başka daldaki (Hortum) ve DISABLED özellik yok; zorunluluk requirement_level'dan
    let at = (await call('catalog/attributes?channel=koctas&category=MATKAP')).attributes;
    assert.deepEqual(at.filter((a) => a.mandatory).map((a) => a.id), ['category', 'title', 'ean', 'shop_sku', 'brand', 'main_image', 'color', 'material']);
    assert.ok(!at.some((a) => a.id === 'hose_len' || a.id === 'old_code'));
    const color = at.find((a) => a.id === 'color');
    assert.deepEqual({ kind: color.kind, type: color.type, custom: color.custom }, { kind: 'variant', type: 'enum', custom: false });
    assert.equal(at.find((a) => a.id === 'model').mandatory, false);
    // VL11: değer kimliği = değer kodu
    assert.deepEqual((await call('catalog/values?channel=koctas&category=MATKAP&attribute=color')).values, [{ id: 'RED', value: 'Kırmızı' }, { id: 'BLUE', value: 'Mavi' }]);
    assert.deepEqual((await call('catalog/values?channel=koctas&category=MATKAP&attribute=title')).values, []);

    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Matkap', channel: 'koctas', remote_id: 'MATKAP', remote_name: 'Matkaplar',
      attrs: { color: { value: '@variant' }, material: { id: 'MET', value: 'Metal' }, main_image: { value: '@image' }, image_2: { value: '@image' } } }) });
    // Ayarlar girilmeden: katalogda olan ürün (P31) yalnız teklif ister → eksiksiz (teklif durumu OF61 "Yeni", barkod türü mevcut tekliflerden EAN);
    // katalogda olmayan ürün için ürün şablonu kodları eksik
    let cand = await call('catalog/candidates?channel=koctas&local=Matkap');
    let by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    assert.deepEqual(by['MAT-1'].missing, []);
    assert.ok(by['MAT-2'].missing.includes('Koçtaş ürün şablonu: ürün adı özellik kodu'), JSON.stringify(by['MAT-2'].missing));
    assert.ok(by['MAT-2'].missing.includes('Koçtaş ürün şablonu: barkod özellik kodu'));
    assert.ok(by['MAT-X'].missing.includes('barkod'));
    const p31 = M.calls.find((c) => c.path === '/products');
    // Barkodlar kategori başına bir kez, toplu (prepare) sorgulanır: ürün başına ayrı istek yok
    assert.deepEqual(p31.q.get('product_references').split(',').sort(), ['EAN|8690001', 'EAN|8690002', 'EAN|8690003', 'EAN|8690004', 'EAN|8690005']);
    assert.equal(M.calls.filter((c) => c.path === '/products').length, 1);
    assert.equal(p31.headers.Authorization, 'mk-1');

    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'koctas', opts: { attrCategory: 'category', attrTitle: 'title', attrEan: 'ean', attrSku: 'shop_sku', attrDesc: 'description', attrBrand: 'brand' } }) });
    cand = await call('catalog/candidates?channel=koctas&local=Matkap');
    by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    for (const s of ['MAT-1', 'MAT-2', 'MAT-3', 'MAT-5']) assert.deepEqual(by[s].missing, [], s + ' ' + JSON.stringify(by[s].missing));
    assert.deepEqual(by['MAT-4'].missing, ['marka “Bilinmez” Koçtaş listesinde bulunamadı']);
    assert.ok(by['MAT-X'].missing.includes('barkod') && by['MAT-X'].missing.includes('Ana Görsel (ürünün görseli yok)'), JSON.stringify(by['MAT-X'].missing));
    // Ürün alanına bağlanan özellikler kategori eşleştirmesinde artık sorulmaz
    at = (await call('catalog/attributes?channel=koctas&category=MATKAP')).attributes;
    assert.deepEqual(at.filter((a) => a.mandatory).map((a) => a.id), ['main_image', 'color', 'material']);

    const ids = cand.items.map((x) => x.id);
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'koctas', ids }) });
    assert.equal(up.sent, 4, JSON.stringify(up)); assert.equal(up.skipped.length, 2);
    // Katalogda olan ürün: tek OF24 isteği, ürün SKU'suyla teklif; liste fiyatı > satış fiyatı → indirim
    const of24 = M.calls.filter((c) => c.method === 'POST' && c.path === '/offers');
    assert.equal(of24.length, 1);
    assert.deepEqual(JSON.parse(of24[0].body), { offers: [{ shop_sku: 'MAT-1', price: 120, quantity: 7, state_code: '11', update_delete: 'update', discount: { price: 100 }, product_id: 'MKP1', product_id_type: 'SKU' }] });
    assert.equal(of24[0].headers['Content-Type'], 'application/json');
    // Yeni ürünler: tek P41 dosyası (multipart "file", operator_format), başlıklar PM11 kodları, ayırıcı PC01'den (;), liste değerleri kodla
    const p41 = M.calls.filter((c) => c.method === 'POST' && c.path === '/products/imports');
    assert.equal(p41.length, 1);
    assert.ok(p41[0].body instanceof FormData); assert.equal(p41[0].headers['Content-Type'], undefined, 'sınırı fetch yazar');
    assert.equal(p41[0].body.get('operator_format'), 'true');
    const file = p41[0].body.get('file');
    assert.equal(file.name, 'urunler.csv');
    const rows = parseCsv(await file.text());
    assert.deepEqual(rows[0], ['category', 'title', 'ean', 'shop_sku', 'description', 'brand', 'main_image', 'image_2', 'color', 'material']);
    const r2 = Object.fromEntries(rows[0].map((h, i) => [h, rows.find((r) => r[3] === 'MAT-2')[i]]));
    assert.deepEqual(r2, { category: 'MATKAP', title: 'Darbeli Matkap Kırmızı', ean: '8690002', shop_sku: 'MAT-2', description: '<p>Güçlü matkap</p>', brand: 'BOSCH',
      main_image: 'https://cdn.ornek.com/2a.jpg', image_2: 'https://cdn.ornek.com/2b.jpg', color: 'RED', material: 'MET' });
    assert.equal(rows.find((r) => r[3] === 'MAT-3')[8], 'BLUE');
    assert.ok(!rows.some((r) => r[3] === 'MAT-5'), 'aynı SKU ile teklifi olan ürün gönderilmez (OF24 teklifi baştan yazar)');
    assert.match(up.ref, /^E:MAT-5;O2044:MAT-1;P2035:MAT-2,MAT-3$/);

    // 1. sorgu: ürün dosyası operatöre gönderildi (SENT); dönüşüm hata raporu (P47) MAT-3'ü reddediyor; teklif içe aktarması (OF02) tamam
    S.of02['2044'] = of02(2044);
    S.p42['2035'] = p42(2035, { has_transformation_error_report: true });
    S.p47['2035'] = '"category";"title";"ean";"shop_sku";"description";"brand";"main_image";"image_2";"color";"material";"errors";"warnings"\n' +
      '"MATKAP";"Darbeli Matkap Mavi";"8690003";"MAT-3";"<p>Güçlü\nmatkap</p>";"BOSCH";"https://cdn.ornek.com/3.jpg";"";"BLUE";"MET";"Renk değeri bu kategoride geçersiz";""\n';
    let ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    let r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(ck.done, false);
    assert.equal(r['MAT-1'].ok, true); assert.match(r['MAT-1'].status, /Teklif açıldı/);
    assert.equal(r['MAT-5'].ok, true); assert.match(r['MAT-5'].status, /zaten var/);
    assert.equal(r['MAT-3'].ok, false); assert.equal(r['MAT-3'].error, 'Renk değeri bu kategoride geçersiz');
    assert.equal(r['MAT-2'].ok, null); assert.match(r['MAT-2'].status, /onayı bekleniyor/);

    // 2. sorgu: içe aktarma tamamlandı, ürün kataloğa girdi (P31) → teklif OF24 ile açılır; teklif içe aktarması sürüyor
    S.p42['2035'] = p42(2035, { import_status: 'COMPLETE', has_transformation_error_report: true, has_error_report: false });
    S.catalog['8690002'] = 'MKP2';
    ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(ck.done, false);
    const of24b = M.calls.filter((c) => c.method === 'POST' && c.path === '/offers');
    assert.equal(of24b.length, 2);
    // Onaydan sonra açılan teklif stok 0 ile (gerçek stok panelin stok gönderimiyle yazılır); fiyat gönderim anının
    assert.deepEqual(JSON.parse(of24b[1].body).offers, [{ shop_sku: 'MAT-2', price: 120, quantity: 0, state_code: '11', update_delete: 'update', discount: { price: 100 }, product_id: 'MKP2', product_id_type: 'SKU' }]);
    assert.equal(r['MAT-2'].ok, null); assert.match(r['MAT-2'].status, /teklifi işliyor/);
    assert.equal(r['MAT-3'].ok, false);

    // 3. sorgu: teklif açıldı → gönderim tamam; teklif bir daha gönderilmez
    S.of02['2045'] = of02(2045);
    ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    r = Object.fromEntries(ck.items.map((x) => [x.key, x]));
    assert.equal(ck.done, true);
    assert.equal(r['MAT-2'].ok, true); assert.match(r['MAT-2'].status, /Teklif açıldı.*stok panelin stok gönderimiyle yazılır/);
    assert.equal(M.calls.filter((c) => c.method === 'POST' && c.path === '/offers').length, 2);
    await Promise.all(jobs);

    // Ürün dosyası 15 dakikada bir: hemen ikinci yeni ürün gönderimi reddedilir (anlaşılır neden)
    const again = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'koctas', ids: [by['MAT-3'].id] }) });
    assert.match(again.error, /15 dakikada bir/);
    assert.equal(M.calls.filter((c) => c.method === 'POST' && c.path === '/products/imports').length, 1);
    // H11 / PM11 / VL11 saatte bir sınırı: bellekte tutulur, tekrar çağrılmaz
    for (const p of ['/hierarchies', '/products/attributes', '/values_lists']) assert.equal(M.calls.filter((c) => c.path === p).length, 1, p);
    await Promise.all(jobs);
  } finally { globalThis.fetch = real; resetChannels(); }
});

test('Mirakl hata durumları: OF24 reddi (kısmi gönderim), OF03 hata raporu, P42 FAILED, P44 rapor, kimlik türü / teklif durumu belirsiz', async () => {
  const S = { catalog: { '8690001': 'MKP1' }, offers: {}, nextOffer: 3000, p41Id: 4000, p42: {}, p47: {}, p44: {}, of02: {}, of03: {} };
  const M = mirakl(BASE, S), real = globalThis.fetch;
  globalThis.fetch = M.fn;
  try {
    const kv = new Map(), meta = { id: 'koctas', kv: { get: async (k) => kv.get(k) ?? null, set: async (k, v) => { kv.set(k, v); } } };
    const ch = koctas({ KOCTAS_URL: 'https://koctas-prod.mirakl.net', KOCTAS_API_KEY: 'k' }, meta);
    const opts = { attrCategory: 'category', attrTitle: 'title', attrEan: 'ean', attrSku: 'shop_sku', attrBrand: 'brand', eanType: 'EAN', offerState: '11', leadtime: '2' };
    const map = { remote_id: 'MATKAP', attrs: { color: { id: 'RED', value: 'Kırmızı' }, material: { value: 'Plastik' }, main_image: { value: '@image' } } };
    const pr = (sku, barcode) => ({ sku, barcode, name: 'Matkap ' + sku, brand: 'Makita', description: 'x', image: 'https://cdn/x.jpg', images: ['https://cdn/x.jpg'], price: 50, listPrice: 50, stock: 2, group: 'G', variant: '' });
    const a = await ch.catalog.build(pr('A-1', '8690001'), map, { opts });
    assert.equal(a.payload.mode, 'offer'); assert.equal(a.payload.offer.leadtime_to_ship, 2); assert.equal(a.payload.offer.discount, undefined);
    const b = await ch.catalog.build(pr('B-1', '8690009'), map, { opts });
    assert.deepEqual(b.missing, []);
    assert.equal(b.payload.mode, 'product'); assert.equal(b.payload.row.material, 'PLA', 'metin değer listeden kodla eşlenir'); assert.equal(b.payload.row.brand, 'MAKITA');
    // Teklif reddi: ürün dosyası yine gönderilir, teklifler gönderilemedi olarak kaydedilir
    S.of24Fail = true;
    const sent = await ch.catalog.send([a.payload, b.payload]);
    assert.match(sent.ref, /^X[^:]*:A-1;P4000:B-1$/);
    S.p42['4000'] = p42(4000, { import_status: 'FAILED', reason_status: 'Dosya biçimi hatalı' });
    let st = await ch.catalog.status(sent.ref);
    assert.equal(st.done, true);
    assert.equal(st.items.find((x) => x.key === 'A-1').ok, false); assert.match(st.items.find((x) => x.key === 'A-1').error, /HTTP 400 Invalid offer/);
    assert.deepEqual(st.items.find((x) => x.key === 'B-1'), { key: 'B-1', ok: false, status: 'Koçtaş ürünü kabul etmedi', error: 'Dosya biçimi hatalı' });
    // OF03: hatalı teklif satırı (sku + error-message sütunları, OpenAPI örneği)
    S.of24Fail = false;
    const c = await ch.catalog.build(pr('C-1', '8690001'), map, { opts }), d = await ch.catalog.build(pr('D-1', '8690001'), map, { opts });
    const s2 = await ch.catalog.send([c.payload, d.payload]);
    assert.equal(s2.ref, 'O3000:C-1,D-1');
    S.of02['3000'] = of02(3000, { lines_in_error: 1, lines_in_success: 1, has_error_report: true });
    S.of03['3000'] = '"sku";"product-id";"product-id-type";"price";"quantity";"state";"update-delete";"error-line";"error-message"\n"D-1";"MKP1";"SKU";"50";"2";"11";"update";"2";"The product does not exist"\n';
    st = await ch.catalog.status(s2.ref);
    assert.equal(st.done, true);
    assert.equal(st.items.find((x) => x.key === 'C-1').ok, true);
    assert.deepEqual(st.items.find((x) => x.key === 'D-1'), { key: 'D-1', ok: false, status: 'Koçtaş teklifi kabul etmedi', error: 'The product does not exist' });
    // P44: tamamlanan içe aktarmada entegre edilemeyen ürün (barkoddan bulunur); kalan ürün katalogda henüz yok → beklemede
    kv.delete('p41at');
    S.p41Id = 4001;
    const e = await ch.catalog.build(pr('E-1', '8690010'), map, { opts }), f = await ch.catalog.build(pr('F-1', '8690011'), map, { opts });
    const s3 = await ch.catalog.send([e.payload, f.payload]);
    S.p42['4001'] = p42(4001, { import_status: 'COMPLETE', has_error_report: true });
    S.p44['4001'] = 'ean;error_message\n8690010;Zorunlu özellik eksik: Malzeme\n';
    st = await ch.catalog.status(s3.ref);
    assert.equal(st.done, false);
    assert.equal(st.items.find((x) => x.key === 'E-1').error, 'Zorunlu özellik eksik: Malzeme');
    assert.equal(st.items.find((x) => x.key === 'F-1').ok, null);
    // Barkod türü ayarsız ve mevcut tekliflerde birden çok barkod türü: eksik (tahmin edilmez); teklif durumu OF61'de belirsizse eksik
    const ch2 = koctas({ KOCTAS_URL: 'https://koctas-prod.mirakl.net', KOCTAS_API_KEY: 'k' }, { id: 'koctas' });
    const realFn = globalThis.fetch;
    globalThis.fetch = async (url, o) => {
      const p = new URL(String(url)).pathname;
      if (p === '/api/offers') return new Response(JSON.stringify({ offers: [{ shop_sku: 'Z', product_references: [{ reference_type: 'EAN', reference: '8680000000001' }, { reference_type: 'UPC', reference: '012345678905' }] }] }), { headers: { 'Content-Type': 'application/json' } });
      if (p === '/api/offers/states') return new Response(JSON.stringify({ offer_states: [{ code: '1', label: 'Teşhir' }, { code: '2', label: 'Outlet' }] }), { headers: { 'Content-Type': 'application/json' } });
      return realFn(url, o);
    };
    const g = await ch2.catalog.build(pr('G-1', '8690001'), map, { opts: {} });
    assert.ok(g.missing.some((m) => /barkod kimlik türü/.test(m)), JSON.stringify(g.missing));
    assert.ok(g.missing.some((m) => /teklif durumu/.test(m)));
  } finally { globalThis.fetch = real; }
});

test('Teknosa: varsayılan Mirakl adresiyle katalogda olan ürüne teklif; rapor ayrıştırma', async () => {
  const S = { catalog: { '8690001': 'MKP1' }, offers: {}, nextOffer: 10, p41Id: 1, p42: {}, p47: {}, p44: {}, of02: {}, of03: {} };
  const M = mirakl('https://teknosatr-prod.mirakl.net/api', S), real = globalThis.fetch;
  globalThis.fetch = M.fn;
  try {
    const ch = teknosa({ TEKNOSA_API_KEY: 'tk', TEKNOSA_SHOP_ID: '77' }, { id: 'teknosa' });
    assert.deepEqual((await ch.catalog.categories('hortum')).items, [{ id: 'HORTUM', name: 'Hortumlar', path: 'Bahçe' }]);
    const x = await ch.catalog.build({ sku: 'T-1', barcode: '8690001', name: 'Matkap', price: 80, listPrice: 100, stock: 4, images: [] }, { remote_id: 'MATKAP', attrs: {} }, { opts: {} });
    assert.deepEqual(x.missing, []);
    const s = await ch.catalog.send([x.payload]);
    assert.equal(s.ref, 'O10:T-1');
    const post = M.calls.find((c) => c.method === 'POST');
    assert.equal(new URL(post.url).origin + new URL(post.url).pathname, 'https://teknosatr-prod.mirakl.net/api/offers');
    assert.equal(new URL(post.url).searchParams.get('shop_id'), '77'); assert.equal(post.headers.Authorization, 'tk');
    S.of02['10'] = of02(10);
    assert.deepEqual(await ch.catalog.status(s.ref), { done: true, items: [{ key: 'T-1', ok: true, status: 'Teklif açıldı (Teknosa)', error: '' }] });
    // Rapor: tırnak içinde satır sonu, ayırıcı başlıktan; hata sütunu gönderilen dosyada olmayan sütun
    assert.deepEqual(parseCsv('a,b\n"x\ny","z ""q"""\n'), [['a', 'b'], ['x\ny', 'z "q"']]);
    const m = reportErrors('"sku";"title";"problem"\n"T-1";"Ad";"Görsel indirilemedi"\n"T-9";"";"başka"\n', (v) => (v === 'T-1' ? v : ''), ['sku', 'title']);
    assert.deepEqual([...m], [['T-1', ['Görsel indirilemedi']]]);
  } finally { globalThis.fetch = real; }
});

test('Mirakl: P41 / OF24 tekrar denenmez (zaman aşımında anlaşılır uyarı), prepare toplu P31, OF21 tek okuma, stok 0 teklif + stok gönderimi fiyatı korur, kv kaydı küçülür', async () => {
  const S = { catalog: {}, offers: {}, nextOffer: 500, p41Id: 600, p42: {}, p47: {}, p44: {}, of02: {}, of03: {} };
  const M = mirakl(BASE, S), real = globalThis.fetch;
  let p41Down = true, of24Down = true;
  globalThis.fetch = async (url, o = {}) => {
    const p = new URL(String(url)).pathname;
    if (o.method === 'POST' && p === '/api/products/imports' && p41Down) { M.calls.push({ path: '/products/imports', method: 'POST' }); throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }); }
    if (o.method === 'POST' && p === '/api/offers' && of24Down) { M.calls.push({ path: '/offers', method: 'POST' }); return new Response('{"message":"Bad gateway"}', { status: 502, headers: { 'Content-Type': 'application/json' } }); }
    return M.fn(url, o);
  };
  const count = (m, path, f = () => true) => M.calls.filter((c) => c.method === m && c.path === path && f(c)).length;
  try {
    const kv = new Map(), meta = { id: 'koctas', kv: { get: async (k) => kv.get(k) ?? null, set: async (k, v) => { kv.set(k, v); } } };
    const make = () => koctas({ KOCTAS_URL: 'https://koctas-prod.mirakl.net', KOCTAS_API_KEY: 'k' }, meta);
    const opts = { attrCategory: 'category', attrTitle: 'title', attrEan: 'ean', attrSku: 'shop_sku', attrBrand: 'brand', eanType: 'EAN', offerState: '11' };
    const map = { remote_id: 'MATKAP', attrs: { color: { id: 'RED', value: 'Kırmızı' }, material: { id: 'MET', value: 'Metal' }, main_image: { value: '@image' } } };
    const pr = (sku, barcode, stock = 7) => ({ sku, barcode, name: 'Matkap ' + sku, brand: 'Makita', description: 'x', image: 'https://cdn/x.jpg', images: ['https://cdn/x.jpg'], price: 100, listPrice: 120, stock, group: 'G', variant: '' });

    // prepare: 150 barkod → 2 P31 isteği (100'lük); build önbellekten, yeniden sormaz
    let ch = make();
    const prs = Array.from({ length: 150 }, (_, i) => pr('S-' + i, String(8691000 + i)));
    S.catalog[String(8691000 + 3)] = 'MKP-3';
    await ch.catalog.prepare(prs, { opts });
    assert.equal(count('GET', '/products'), 2);
    assert.equal(M.calls.filter((c) => c.path === '/products')[0].q.get('product_references').split(',').length, 100);
    const built = [];
    for (const x of prs.slice(0, 30)) built.push(await ch.catalog.build(x, map, { opts }));
    assert.equal(count('GET', '/products'), 2, 'build önbellekteki sonucu kullanır');
    assert.equal(built[3].payload.mode, 'offer'); assert.equal(built[0].payload.mode, 'product');
    // opts verilmeden: build'in kaydettiği kimlik türüyle
    await make().catalog.prepare([pr('Y-1', '8699999')]);
    assert.equal(M.calls.filter((c) => c.path === '/products').at(-1).q.get('product_references'), 'EAN|8699999');

    // OF21: 20'den fazla SKU'da tüm liste bir kez okunur; aynı nesnede yeniden okunmaz
    const offers = built.filter((b) => b.payload.mode === 'product').slice(0, 25).map((b) => ({ ...b.payload, mode: 'offer', offer: { ...b.payload.offer, product_id: 'P', product_id_type: 'SKU' } }));
    of24Down = true;
    await assert.rejects(ch.catalog.send(offers), /HTTP 502/);
    assert.equal(count('POST', '/offers'), 1, 'OF24 tekrar denenmez');
    await assert.rejects(ch.catalog.send(offers), /HTTP 502/);
    assert.equal(count('GET', '/offers', (c) => !c.q.get('sku') && c.q.get('max') === '100' && c.q.get('offset') === '0'), 1, 'tüm liste bir kez');

    // P41 zaman aşımı: tek deneme; kullanıcıya dosyanın gitmiş olabileceği söylenir
    of24Down = false;
    const prod = built.find((b) => b.payload.mode === 'product').payload;
    await assert.rejects(ch.catalog.send([prod]), (e) => /dosya gitmiş olabilir; 15 dakika sonra Koçtaş panelinde içe aktarmaları kontrol edin, sonra yeniden gönderin/.test(e.message) && /zaman aşımı/.test(e.message));
    assert.equal(count('POST', '/products/imports'), 1, 'P41 tekrar denenmez');
    await assert.rejects(ch.catalog.send([prod]), /15 dakikada bir/);

    // Onaydan sonra teklif stok 0 ile; sonuç kesinleşince kv kaydı küçülür, sonraki sorgu Mirakl'a gitmez
    kv.delete('p41at'); p41Down = false;
    ch = make();
    const s = await ch.catalog.send([prod]);
    assert.equal(s.ref, `P600:${prod.key}`);
    assert.ok(kv.get('p41:600').items.length === 1 && kv.get('p41:600').head.length);
    S.p42['600'] = p42(600, { import_status: 'COMPLETE' });
    S.catalog[prod.barcode] = 'MKP-NEW';
    let st = await ch.catalog.status(s.ref);
    assert.equal(st.done, false);
    const of24 = M.calls.filter((c) => c.method === 'POST' && c.path === '/offers' && c.body).at(-1);
    assert.deepEqual(JSON.parse(of24.body).offers, [{ ...prod.offer, quantity: 0, product_id: 'MKP-NEW', product_id_type: 'SKU' }]);
    assert.equal(prod.offer.quantity, 7);
    S.of02[String(S.nextOffer - 1)] = of02(S.nextOffer - 1);
    st = await ch.catalog.status(s.ref);
    assert.deepEqual(st, { done: true, items: [{ key: prod.key, ok: true, status: 'Teklif açıldı (Koçtaş); stok panelin stok gönderimiyle yazılır', error: '' }] });
    assert.deepEqual(kv.get('p41:600'), { at: kv.get('p41:600').at, done: true, r: [[prod.key, true, 'Teklif açıldı (Koçtaş); stok panelin stok gönderimiyle yazılır', '']] });
    const n = M.calls.length;
    assert.deepEqual(await make().catalog.status(s.ref), st);
    assert.equal(M.calls.length, n, 'kesinleşmiş sonuç Mirakl\'a sorulmaz');

    // Stok gönderimi: yeni teklifin fiyatı / indirimi (OF21) korunur, yalnız miktar yazılır
    S.offers[prod.key] = { shop_sku: prod.key, product_sku: 'MKP-NEW', price: 100, origin_price: 120, discount: { origin_price: 120, discount_price: 100 }, quantity: 0, state_code: '11',
      product_references: [{ reference_type: 'EAN', reference: prod.barcode }] };
    const res = await make().pushStock([{ remoteId: prod.key, sku: prod.key, stock: 7 }]);
    assert.deepEqual(res.done, [prod.key]);
    const push = M.calls.filter((c) => c.method === 'POST' && c.path === '/offers' && c.body).at(-1);
    assert.deepEqual(JSON.parse(push.body).offers, [{ shop_sku: prod.key, product_id: 'MKP-NEW', product_id_type: 'SKU', price: 120, quantity: 7, state_code: '11', update_delete: 'update', discount: { price: 100 } }]);
  } finally { globalThis.fetch = real; }
});
