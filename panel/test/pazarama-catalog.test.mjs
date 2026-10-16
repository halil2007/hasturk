// Pazarama'ya ürün yükleme: kategori listesi (düz, leaf), özellikler (listeden değer), marka (GUID), product/create (500'lük parça),
// toplu işlem sonucu (yalnız hatalılar listelenir; kalanlar kabul)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import worker from '../src/index.js';
import { cleanHtml } from '../src/util.js';

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
  // Word'den kopyalanmış açıklama (Pazarama "Microsoft Office-specific tags" diye reddeder)
  await run(db, `UPDATE products SET description = ? WHERE sku = 'SOL-5'`, `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]--><p class=MsoNormal style='mso-pagination:widow-orphan'><b><span lang=TR style='mso-ansi-language:TR'>%100 organik</span></b><o:p></o:p></p><p class="MsoNormal">&nbsp;<o:p></o:p></p>`);
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
    // Pazarama'da aynı adla bulunamayan marka: eksik; Kanallarda yayınla'da seçilen marka eşleştirmesi (brand_map) Ürün Yükle'de de kullanılır
    await run(db, "UPDATE products SET brand = 'HasTürk Tarım' WHERE sku = 'SOL-10'");
    let c2 = await call('catalog/candidates?channel=pazarama&local=G%C3%BCbre');
    assert.ok(c2.items.find((x) => x.sku === 'SOL-10').missing.some((m) => /marka/.test(m)));
    await run(db, "INSERT INTO brand_map (brand, channel, remote_id, remote_name) VALUES ('HasTürk Tarım', 'pazarama', ?, 'HG')", G(555));
    c2 = await call('catalog/candidates?channel=pazarama&local=G%C3%BCbre');
    assert.deepEqual(c2.items.find((x) => x.sku === 'SOL-10').missing, []);
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'pazarama', ids: [a.id, b.id, bad.id] }) });
    assert.equal(up.sent, 2, JSON.stringify(up)); assert.equal(up.skipped.length, 1);
    const sent = JSON.parse(calls.find((c) => /product\/create/.test(c.url)).body).products;
    const s5 = sent.find((x) => x.code === '869001');
    assert.equal(s5.brandId, G(555)); assert.equal(s5.categoryId, G(2)); assert.equal(s5.stockCode, 'SOL-5');
    assert.equal(s5.salePrice, 100); assert.equal(s5.listPrice, 120); assert.equal(s5.vatRate, 10); assert.equal(s5.desi, 2); assert.equal(s5.stockCount, 7);
    assert.deepEqual(s5.attributes, [{ attributeId: G(47), attributeValueId: G(901) }, { attributeId: G(48), attributeValueId: G(903) }]);
    assert.equal(s5.images[0].imageurl, 'https://cdn.ornek.com/a.webp');
    assert.equal(s5.description, '<p><b>%100 organik</b></p>');
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

test('eksik zorunlu özellik ürün adından / kategorisinden kesin algılanır (Miktar, Ürün Tipi), belirsizde eksik kalır; boş marka addan', async () => {
  const { inferValue, inferBrand } = await import('../src/catalog.js');
  const miktar = ['1 kg', '2 kg', '5 kg', '15 kg', '20 kg', '1000 kg', 'Diğer'].map((value, i) => ({ id: String(i + 1), value }));
  const tip = ['Katı', 'Sıvı', 'Granül', 'Organik', 'Diğer'].map((value, i) => ({ id: 't' + i, value }));
  const cat = 'Gübreler > Solucan Gübresi > Katı Solucan Gübresi';
  assert.equal(inferValue(miktar, { name: 'HasTürk Solucan Gübresi - 15 Kg', category: cat }).value, '15 kg');
  assert.equal(inferValue(miktar, { name: 'Solucan Gübresi', variant_name: '5 Kg', category: cat }).value, '5 kg');
  assert.equal(inferValue(miktar, { name: 'Gübre 2000 gr', category: cat }).value, '2 kg', 'birim çevrilir');
  assert.equal(inferValue(miktar, { name: "1 Ton Solucan Gübresi (20 KG'lık Çuvallarla)", category: cat }), null, 'iki ölçü: belirsiz');
  assert.equal(inferValue(miktar, { name: 'HasTürk Solucan Gübresi (HGKSG01)', category: cat }), null, 'ölçü yok');
  assert.equal(inferValue(miktar, { name: 'Gübre 3 Kg', category: cat }), null, 'listede yok');
  assert.equal(inferValue(tip, { name: 'HasTürk Solucan Gübresi', category: cat }).value, 'Katı');
  assert.equal(inferValue(tip, { name: 'Sıvı ve Katı Gübre Seti', category: cat }), null, 'adda iki değer: belirsiz');
  assert.equal(inferValue(['1', '2', '5'].map((value) => ({ id: value, value })), { name: 'Gübre 5 Kg' }), null, 'yalnız rakam değer metinden seçilmez');
  assert.equal(inferBrand('HasTürk Mükemmel Üçlü Set', ['HasTürk', 'HG']), 'HasTürk');
  assert.equal(inferBrand('Bahçe Toprağı Seti', ['HasTürk']), '');
  // Ürün Yükle: kategori eşleştirmesinde seçilmemiş Miktar / Ürün Tipi otomatik dolar, belirsiz ürün eksik kalır
  const db = d1(); await init(db); resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now();
  const ins = (sku, bc, name, brand) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, vat, desi, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'https://cdn.ornek.com/a.webp', 100, 10, 2, 7, ?, ?)`, sku, bc, name, brand, cat, t, t);
  await ins('A15', '8690015', 'HasTürk Solucan Gübresi - 15 Kg', 'HasTürk');
  await ins('A1T', '8690016', "1 Ton Solucan Gübresi (20 KG'lık Çuvallarla)", 'HasTürk');
  await ins('ASET', '8690017', 'HasTürk Mükemmel Üçlü Set 5 Kg', '');
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return real(url, opts);
    const J = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
    if (/connect\/token/.test(u)) return J({ data: { accessToken: 'tok', expiresIn: 3600 } });
    if (/getCategoryTree/.test(u)) return J({ data: [{ id: G(2), parentCategories: ['Bahçe'], name: 'Katı Solucan Gübresi', leaf: true }] });
    if (/getCategoryWithAttributes/.test(u)) return J({ data: { attributes: [
      { id: G(60), name: 'Miktar', isRequired: true, isVariantable: false, attributeValues: miktar.map((v) => ({ id: G(100 + Number(v.id)), value: v.value })) },
      { id: G(61), name: 'Ürün Tipi', isRequired: true, isVariantable: false, attributeValues: tip.map((v, i) => ({ id: G(200 + i), value: v.value })) }] } });
    if (/brand\/getBrands/.test(u)) return J({ data: [{ id: G(555), name: 'HasTürk' }] });
    return J({ data: [] });
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
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: cat, channel: 'pazarama', remote_id: G(2), remote_name: 'Katı Solucan Gübresi', attrs: {} }) });
    const cand = await call('catalog/candidates?channel=pazarama&local=' + encodeURIComponent(cat));
    const by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    assert.deepEqual(by.A15.missing, [], JSON.stringify(by.A15));
    assert.deepEqual(by.A15.auto.map((a) => `${a.name}=${a.value}`).sort(), ['Miktar=15 kg', 'Ürün Tipi=Katı']);
    assert.deepEqual(by.A1T.missing, ['Miktar'], 'iki ölçülü üründe Miktar seçilmez');
    // Set ürününde addaki ölçü setin tamamını anlatmayabilir: Miktar seçilmez; Ürün Tipi kategoriden, marka addan
    assert.deepEqual(by.ASET.missing, ['Miktar']); assert.ok(by.ASET.auto.some((a) => a.name === 'Marka' && a.value === 'HasTürk'));
  } finally { globalThis.fetch = real; resetChannels(); }
});

test('açıklama temizliği: Word / Office etiketleri silinir, temel biçim ve metin kalır', () => {
  const w = `<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]--><style>p.MsoNormal{mso-style-parent:"";}</style>
<p class=MsoListParagraph style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'>·</span><![endif]><span lang=TR>Kök gelişimi</span><o:p></o:p></p>
<ul><li style="mso-list:l0">Toprak</li></ul><p><st1:place w:st="on">Türkiye</st1:place></p><a href="javascript:alert(1)" onclick="x">a</a><a href="https://h.com/x">b</a><img src="https://h.com/i.jpg" style="width:3px">`;
  const c = cleanHtml(w);
  assert.doesNotMatch(c, /mso|Mso|<o:|<w:|<st1:|xml|style|class|lang=|<!|onclick|javascript/i);
  assert.equal(c, '<p>·Kök gelişimi</p> <ul><li>Toprak</li></ul><p>Türkiye</p><a>a</a><a href="https://h.com/x">b</a><img src="https://h.com/i.jpg">');
  assert.equal(cleanHtml('Düz metin, <b>kalın</b>'), 'Düz metin, <b>kalın</b>');
  assert.equal(cleanHtml(null), '');
});

test('ölçü algılama: karma değer seçilmez, çoklu paket / koli, aynı ölçünün farklı yazımı, set ve seçenekli ürün belirsiz', async () => {
  const { inferValue } = await import('../src/catalog.js');
  const L = (arr) => arr.map((value, i) => ({ id: 'v' + i, value }));
  // "10 lt / H - 5 Bar" yalnız ölçü değil (debi + basınç): tank hacmi 10 Lt olan pompaya seçilmez
  const bar = L(['10 lt / H - 5 Bar', '5 lt / H - 10 Bar', '0.5 lt / 5 Bar']);
  assert.equal(inferValue(bar, { name: 'Delta 10 Lt Basınçlı İlaçlama Pompası' }), null);
  const birim = L(['85 gr', '400 gr', '1.5 kg', '1500 gr', '15 kg', '3 x 5 gr', '12 x 400 gr', '6 x 400gr', '2 kg + 2 adet Pouch Hediye', '15kg - 100 gr', '5 gr']);
  assert.equal(inferValue(birim, { name: 'Kedi Maması 15 Kg' }).value, '15 kg');
  assert.equal(inferValue(birim, { name: 'Kedi Maması 1,5 Kg' }).value, '1.5 kg', 'aynı ölçünün iki yazımı: ürünle aynı sayı');
  assert.equal(inferValue(birim, { name: 'Kedi Ödül Çubuğu 3X5 Gr' }).value, '3 x 5 gr', 'çoklu paket birebir');
  assert.equal(inferValue(birim, { name: 'Kedi Ödül 5 gr' }).value, '5 gr', 'tek ölçü çoklu pakete gitmez');
  assert.equal(inferValue(birim, { name: 'Kedi Konservesi 400 Gr - 12 Adet' }).value, '12 x 400 gr', 'koli');
  assert.equal(inferValue(birim, { name: 'Kedi Konservesi 400 Gr - 6 Adet' }).value, '6 x 400gr');
  assert.equal(inferValue(birim, { name: 'Kedi Konservesi 400 Gr - 4 Adet' }), null, 'koli listede yok');
  assert.equal(inferValue(birim, { name: 'Sıvı Kedi Ödülü 3x5 Grx12 Paket' }), null, 'paketlerin kolisi: 3 x 5 gr değil');
  assert.equal(inferValue(L(['6 Adet', '12 Adet', '400 gr', '6 x 400 gr']), { name: 'Köpek Konservesi 400 Grx6 Adet' }).value, '6 x 400 gr', 'bitişik x');
  assert.equal(inferValue(L(['6 Adet', '12 Adet', '400 gr']), { name: 'Köpek Konservesi 400 Grx6 Adet' }), null);
  assert.equal(inferValue(L(['12 Adet', '5 x 14 gr', '14 gr']), { name: 'Sıvı Ödül 5x14 Grx12 Adet' }), null);
  assert.equal(inferValue(L(['5 gr', '50 adet', '10 gr']), { name: 'Domates Tohumu 5 Gr (50 Adet)' }), null, 'ölçü + adet, paket değeri yok: belirsiz');
  const miktar = L(['20 lt', '1 lt', '5 kg', '20 kg']);
  assert.equal(inferValue(miktar, { name: 'Kaktüs Bakım Seti – 20 LT Toprak + Bitki Besini Kampanyası' }), null, 'set / kampanya');
  assert.equal(inferValue(miktar, { name: 'Gübre 20 Kg + 1 Lt Hediye' }), null);
  assert.equal(inferValue(miktar, { name: 'Bitki Besini', variant_name: '1 Lt' }).value, '1 lt', 'varyant her zaman kullanılır');
  // Renk: "Seçilebilir Renk … Ücretsiz Toprak" adında "Toprak" rengi seçilmez; varyanttaki renk seçilir
  const renk = L(['Siyah', 'Gri', 'Toprak', 'Mavi', 'Beyaz']);
  assert.equal(inferValue(renk, { name: 'UFO Saksı | Seçilebilir Renk, Bitkiye Özel Ücretsiz Toprak' }), null);
  assert.equal(inferValue(renk, { name: 'UFO Saksı | Seçilebilir Renk', variant_name: 'Gri' }).value, 'Gri');
  assert.equal(inferValue(renk, { name: 'Line Saksı Koyu Gri' }).value, 'Gri');
  // Set / "+" içeren adda tek değer: kategori de aynısını söylüyorsa seçilir
  const pet = L(['Kedi', 'Köpek']);
  assert.equal(inferValue(pet, { name: 'Tavuklu Pate + Et Parçacıklı (Kısırlaştırılmış Kedi) 400 Gr', category: 'Kedi Ürünleri > Kedi Konserve Maması' }).value, 'Kedi');
  assert.equal(inferValue(pet, { name: 'Kedi Tasması + Köpek Tasması Seti', category: 'Evcil Hayvan > Tasma' }), null);
  assert.equal(inferValue(L(['Sebze Tohumu', 'Çiçek Tohumu']), { name: 'Ekim Ayı Sebze Tohumu Seti', category: 'Tohumlar > Aylık Tohum Setleri' }), null);
});

test('Pazarama: markası Pazarama\'da olmayan ürün "veri bulunamadı" hatasıyla düşmez, marka eksik olarak gösterilir', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now(), cat = 'Saksılar';
  await run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, vat, desi, stock, created_at, updated_at) VALUES ('S1', '8691', 'Yuvarlak Saksı', 'Bilinmeyen Marka', ?, 'https://cdn.ornek.com/a.webp', 100, 20, 1, 3, ?, ?)`, cat, t, t);
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return real(url, opts);
    const J = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
    if (/connect\/token/.test(u)) return J({ data: { accessToken: 'tok', expiresIn: 3600 } });
    if (/getCategoryTree/.test(u)) return J({ data: [{ id: G(3), parentCategories: ['Bahçe'], name: 'Saksı', leaf: true }] });
    if (/getCategoryWithAttributes/.test(u)) return J({ data: { attributes: [] } });
    if (/brand\/getBrands/.test(u)) return J({ data: null, success: false, messageCode: 'CAT_60', message: 'Listelenecek veri bulunamadı!', userMessage: 'Listelenecek veri bulunamadı!' });
    return J({ data: [] });
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
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: cat, channel: 'pazarama', remote_id: G(3), remote_name: 'Saksı', attrs: {} }) });
    const cand = await call('catalog/candidates?channel=pazarama&local=' + encodeURIComponent(cat));
    assert.deepEqual(cand.items[0].missing, ["marka “Bilinmeyen Marka” Pazarama'da bulunamadı"]);
  } finally { globalThis.fetch = real; resetChannels(); }
});
