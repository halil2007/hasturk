// PttAVM'e ürün yükleme (SOAP Katalog Entegrasyonu): kategori ağacı (GetCategoryTree; düz gelirse GetMainCategories + alt ağaçlar),
// barkod kontrolü (BarkodKontrolBulk), UpdateProductsV3 (100'lük parça, DataContract alan sırası), GetProductsTrackingResult (ürün bazında sonuç),
// kargo profili seçeneği (GetCargoProfiles). Sahte cevaplar PttAVM WSDL'inden üretilmiş istemcideki (svcutil, Reference.cs) tiplerle aynı biçimde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting, first } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { pttavm, v3Xml } from '../src/channels/pttavm.js';
import worker from '../src/index.js';

const SOAP = { PTTAVM_USERNAME: 'u', PTTAVM_PASSWORD: 'p' };
const REST = { PTTAVM_API_KEY: 'KEY', PTTAVM_TOKEN: 'TOK' };
const X = (inner) => new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${inner}</s:Body></s:Envelope>`, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
const NS = 'xmlns:a="http://schemas.datacontract.org/2004/07/ePttAVMService" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"';
const RNS = 'xmlns:a="http://schemas.datacontract.org/2004/07/ePttAVMService.Model.Responses" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"';
const cat = (id, name, parent, kids = []) => `<a:Category><a:children>${kids.join('')}</a:children><a:id>${id}</a:id><a:name>${name}</a:name><a:parent_id>${parent}</a:parent_id><a:updated_at>2026-01-01</a:updated_at></a:Category>`;
const FULL = `<GetCategoryTreeResponse xmlns="http://tempuri.org/"><GetCategoryTreeResult ${NS}><a:category_tree>${
  cat(1, 'Bahçe', 0, [cat(11, 'Gübre', 1, [cat(111, 'Organik Gübre', 11), cat(112, 'Kimyasal Gübre', 11)]), cat(12, 'Saksı', 1)])}${cat(2, 'Kırtasiye', 0, [cat(21, 'Kalem', 2)])
}</a:category_tree><a:error i:nil="true"/><a:success>true</a:success></GetCategoryTreeResult></GetCategoryTreeResponse>`;
const PROFILES = `<GetCargoProfilesResponse xmlns="http://tempuri.org/"><GetCargoProfilesResult ${NS}><a:CargoProfileModel><a:Description>Standart</a:Description><a:Id>77</a:Id><a:Name>PTT Kargo Standart</a:Name><a:Type>1</a:Type></a:CargoProfileModel></GetCargoProfilesResult></GetCargoProfilesResponse>`;
const barkod = (found) => `<BarkodKontrolBulkResponse xmlns="http://tempuri.org/"><BarkodKontrolBulkResult ${NS}>${found.map((b) => `<a:StokKontrolDetay><a:Barkod>${b}</a:Barkod><a:UrunAdi>Var olan</a:UrunAdi><a:UrunId>5501</a:UrunId></a:StokKontrolDetay>`).join('')}</BarkodKontrolBulkResult></BarkodKontrolBulkResponse>`;
const updated = (ok, tid, msg = '') => `<UpdateProductsV3Response xmlns="http://tempuri.org/"><UpdateProductsV3Result ${RNS}><a:Message>${msg}</a:Message><a:Success>${ok}</a:Success><a:TrackingId>${tid}</a:TrackingId><a:CountOfProductsToBeProcessed>2</a:CountOfProductsToBeProcessed></UpdateProductsV3Result></UpdateProductsV3Response>`;
const info = (bc, st, msg = '', why = []) => `<a:ProductBasedInfo><a:FailureReasons xmlns:b="http://schemas.microsoft.com/2003/10/Serialization/Arrays">${why.map((w) => `<b:string>${w}</b:string>`).join('')}</a:FailureReasons><a:Message>${msg}</a:Message><a:Status>${st}</a:Status><a:Barcode>${bc}</a:Barcode><a:ProductId>0</a:ProductId></a:ProductBasedInfo>`;
const tracked = (st, progress, infos) => `<GetProductsTrackingResultResponse xmlns="http://tempuri.org/"><GetProductsTrackingResultResult ${RNS}><a:CreatedAt>2026-10-17T10:00:00</a:CreatedAt><a:Progress>${progress}</a:Progress><a:Status>${st}</a:Status><a:TrackingId>trk</a:TrackingId><a:UpdatedAt>2026-10-17T10:01:00</a:UpdatedAt><a:ProductsSubTrackingResult><a:CountOfTotalProducts>2</a:CountOfTotalProducts><a:ProductBasedInfos>${infos.join('')}</a:ProductBasedInfos></a:ProductsSubTrackingResult></GetProductsTrackingResultResult></GetProductsTrackingResultResponse>`;

// SOAP uçları: SOAPAction'a göre örnek cevap (handlers[method](body) → XML gövdesi)
function mock(handlers = {}) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return real(url, opts);
    const action = String((opts.headers || {}).SOAPAction || '').replace(/"/g, '').split('/').pop();
    calls.push({ url: u, action, body: String(opts.body || '') });
    if (!action) return new Response(JSON.stringify({ error: 'yok' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    const h = handlers[action] || { GetCategoryTree: () => FULL, GetCargoProfiles: () => PROFILES, BarkodKontrolBulk: () => barkod([]) }[action];
    if (!h) return X(`<s:Fault><faultcode>s:Client</faultcode><faultstring>Bilinmeyen ${action}</faultstring></s:Fault>`);
    return X(h(calls[calls.length - 1].body));
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const PR = (i, o = {}) => ({ id: i, sku: `SKU-${i}`, barcode: `86900${i}`, name: `Ürün ${i}`, brand: 'HG', description: '<p>Açıklama</p>', image: 'https://cdn.ornek.com/x.jpg', images: ['https://cdn.ornek.com/x.jpg', 'https://cdn.ornek.com/y.jpg'],
  vat: 10, desi: 2, stock: 3, price: 149.9, listPrice: 160, group: 'G', variant: '', ...o });
const MAP = { remote_id: '111', attrs: {} };

test('PttAVM ürün yükleme yalnız SOAP girişiyle: REST hesabında kullanıcı adı / şifre yoksa kapalı, varsa açık', () => {
  assert.equal(pttavm(REST, { id: 'pttavm' }).catalog, undefined);
  const both = pttavm({ ...REST, ...SOAP }, { id: 'pttavm' });
  assert.equal(both.api, 'rest'); assert.ok(both.catalog);
  assert.ok(pttavm(SOAP, { id: 'pttavm' }).catalog);
  assert.equal(pttavm({}, { id: 'pttavm' }).catalog, undefined);
  assert.deepEqual(both.catalog.options.map((o) => o.k), ['cargoProfileId', 'preparingDay']);
});

test('PttAVM kategoriler: tam ağaçtan son kategoriler ve yol; ağaç düz gelirse ana kategoriler tek tek açılır; hata mesajı', async () => {
  let m = mock();
  try {
    const c = pttavm(SOAP, { id: 'pttavm' }).catalog;
    const r = await c.categories('gübre');
    assert.deepEqual(r.items, [{ id: '111', name: 'Organik Gübre', path: 'Bahçe › Gübre' }, { id: '112', name: 'Kimyasal Gübre', path: 'Bahçe › Gübre' }]);
    assert.equal(r.total, 4);
    assert.deepEqual((await c.allCategories()).map((x) => x.id), ['111', '112', '12', '21']);
    assert.equal(m.calls.filter((x) => x.action === 'GetCategoryTree').length, 1, 'önbellekten');
    assert.match(m.calls[0].body, /<tem:GetCategoryTree><tem:parent_id><\/tem:parent_id><tem:last_update><\/tem:last_update><\/tem:GetCategoryTree>/);
    assert.match(m.calls[0].body, /<wsse:Username>u<\/wsse:Username>/);
    assert.deepEqual(await c.attributes('111'), [], 'PttAVM kategori özelliği servisi yok');
  } finally { m.restore(); }
  // Düz ağaç: yalnız ana kategoriler (çocuksuz) → GetMainCategories + her ana kategori için alt ağaç
  m = mock({
    GetCategoryTree: (b) => (/<tem:parent_id>1<\/tem:parent_id>/.test(b) ? `<GetCategoryTreeResponse xmlns="http://tempuri.org/"><GetCategoryTreeResult ${NS}><a:category_tree>${cat(11, 'Gübre', 1, [cat(111, 'Organik Gübre', 11)])}</a:category_tree><a:success>true</a:success></GetCategoryTreeResult></GetCategoryTreeResponse>`
      : /<tem:parent_id>2<\/tem:parent_id>/.test(b) ? `<GetCategoryTreeResponse xmlns="http://tempuri.org/"><GetCategoryTreeResult ${NS}><a:category_tree></a:category_tree><a:success>true</a:success></GetCategoryTreeResult></GetCategoryTreeResponse>`
        : `<GetCategoryTreeResponse xmlns="http://tempuri.org/"><GetCategoryTreeResult ${NS}><a:category_tree>${cat(1, 'Bahçe', 0)}${cat(2, 'Kırtasiye', 0)}</a:category_tree><a:success>true</a:success></GetCategoryTreeResult></GetCategoryTreeResponse>`),
    GetMainCategories: () => `<GetMainCategoriesResponse xmlns="http://tempuri.org/"><GetMainCategoriesResult ${NS}><a:success>true</a:success><a:main_category><a:category><a:id>1</a:id><a:name>Bahçe</a:name></a:category><a:category><a:id>2</a:id><a:name>Kırtasiye</a:name></a:category></a:main_category></GetMainCategoriesResult></GetMainCategoriesResponse>`,
  });
  try {
    const c = pttavm(SOAP, { id: 'pttavm' }).catalog;
    assert.deepEqual(await c.allCategories(), [{ id: '111', name: 'Organik Gübre', path: 'Bahçe › Gübre' }, { id: '2', name: 'Kırtasiye', path: '' }]);
  } finally { m.restore(); }
  m = mock({ GetCategoryTree: () => `<GetCategoryTreeResponse xmlns="http://tempuri.org/"><GetCategoryTreeResult ${NS}><a:error><a:error_code>401</a:error_code><a:error_message>Yetkisiz kullanıcı</a:error_message></a:error><a:success>false</a:success></GetCategoryTreeResult></GetCategoryTreeResponse>` });
  try { await assert.rejects(() => pttavm(SOAP, { id: 'pttavm' }).catalog.categories(''), /PttAVM kategori ağacı: Yetkisiz kullanıcı/); } finally { m.restore(); }
  // Boş parent_id SOAP hatası verirse ana kategorilerden yürünür
  m = mock({
    GetCategoryTree: (b) => (/<tem:parent_id><\/tem:parent_id>/.test(b) ? `<s:Fault><faultcode>s:Client</faultcode><faultstring>Input string was not in a correct format</faultstring></s:Fault>`
      : `<GetCategoryTreeResponse xmlns="http://tempuri.org/"><GetCategoryTreeResult ${NS}><a:category_tree>${cat(1, 'Bahçe', 0, [cat(12, 'Saksı', 1)])}</a:category_tree><a:success>true</a:success></GetCategoryTreeResult></GetCategoryTreeResponse>`),
    GetMainCategories: () => `<GetMainCategoriesResponse xmlns="http://tempuri.org/"><GetMainCategoriesResult ${NS}><a:success>true</a:success><a:main_category><a:category><a:id>1</a:id><a:name>Bahçe</a:name></a:category></a:main_category></GetMainCategoriesResult></GetMainCategoriesResponse>`,
  });
  try { assert.deepEqual(await pttavm(SOAP, { id: 'pttavm' }).catalog.allCategories(), [{ id: '12', name: 'Saksı', path: 'Bahçe' }], 'ana kategorinin kendisiyle gelen ağaç'); } finally { m.restore(); }
});

test('PttAVM build: eksikler (barkod, görsel, fiyat), kayıtlı barkod, kargo profili / hazırlık süresi doğrulaması, varyantlar ayrı ürün', async () => {
  const m = mock({ BarkodKontrolBulk: (b) => barkod(/869002/.test(b) ? ['869002'] : []) });
  try {
    const c = pttavm(SOAP, { id: 'pttavm' }).catalog;
    let b = await c.build(PR(1), MAP, { opts: {} });
    assert.deepEqual(b.missing, []); assert.equal(b.key, '869001');
    assert.deepEqual(b.payload, { Active: true, Barcode: '869001', Brand: 'HG', CargoProfileId: null, CategoryId: 111, Desi: 2, Discount: 0, EstimatedCourierDelivery: null,
      Images: ['https://cdn.ornek.com/x.jpg', 'https://cdn.ornek.com/y.jpg'], LongDescription: '<p>Açıklama</p>', Name: 'Ürün 1', PriceWithVat: '149.90', ProductCode: 'SKU-1', Quantity: 3, VATRate: 10 });
    b = await c.build(PR(3, { barcode: '', image: 'cdn/x.jpg', images: [], price: 0, name: 'N'.repeat(250), stock: 20000 }), MAP, { opts: {} });
    assert.deepEqual(b.missing, ['barkod', 'görsel', 'fiyat']);
    assert.equal(b.payload.Name.length, 200, 'ad en çok 200 karakter'); assert.equal(b.payload.Quantity, 9999);
    // Kayıtlı barkod: UpdateProductsV3 mevcut ürünün üstüne yazar; yeni ürün olarak gönderilmez
    await c.prepare([PR(1), PR(2)]);
    const bk = m.calls.find((x) => x.action === 'BarkodKontrolBulk').body;
    assert.match(bk, /<tem:Barkod xmlns:arr="http:\/\/schemas\.microsoft\.com\/2003\/10\/Serialization\/Arrays"><arr:string>869001<\/arr:string><arr:string>869002<\/arr:string><\/tem:Barkod>/);
    assert.deepEqual((await c.build(PR(2), MAP, { opts: {} })).missing, ['barkod PttAVM\'de başka bir üründe kayıtlı (yeni ürün açılmaz; ilanı PttAVM\'den eşleştirin)']);
    // Kargo profili adı ya da numarası; yoksa tanımlılar listelenir. Hazırlık süresi 1–30 gün
    b = await c.build(PR(1), MAP, { opts: { cargoProfileId: 'ptt kargo standart', preparingDay: '2' } });
    assert.deepEqual(b.missing, []); assert.equal(b.payload.CargoProfileId, 77); assert.equal(b.payload.EstimatedCourierDelivery, 2);
    b = await c.build(PR(1), MAP, { opts: { cargoProfileId: '99', preparingDay: '0' } });
    assert.deepEqual(b.missing, ['kargo profili “99” PttAVM\'de yok (tanımlı: PTT Kargo Standart 77); PttAVM seçeneklerinden düzeltin', 'kargoya veriliş süresi “0” geçersiz (1–30 gün; PttAVM seçeneklerinden düzeltin)']);
    await assert.rejects(() => c.build(PR(1), { remote_id: 'abc', attrs: {} }, { opts: {} }), /kategori kimliği geçersiz/);
    // Varyantlar: her varyant kendi barkoduyla ayrı ürün (adında varyantı taşır)
    const v1 = await c.build(PR(5, { name: 'Gübre 5 Kg', variant: '5 Kg', group: 'GUB' }), MAP, { opts: {} });
    const v2 = await c.build(PR(6, { name: 'Gübre 10 Kg', variant: '10 Kg', group: 'GUB' }), MAP, { opts: {} });
    assert.deepEqual([v1.key, v2.key, v1.payload.Name, v2.payload.Name], ['869005', '869006', 'Gübre 5 Kg', 'Gübre 10 Kg']);
    assert.ok(!('Variants' in v1.payload));
  } finally { m.restore(); }
});

test('PttAVM gönderim: UpdateProductsV3 alan sırası ve ad alanı, 100\'lük parça, sonraki parça reddi; sonuç ürün bazında', async () => {
  let n = 0;
  const m = mock({
    UpdateProductsV3: () => (++n === 2 ? updated('false', '', 'Günlük limit aşıldı') : updated('true', `trk-${n}`)),
    GetProductsTrackingResult: (b) => (/trk-1/.test(b) ? tracking1() : ''),
  });
  let polls = 0;
  const tracking1 = () => (++polls === 1 ? tracked('InProgress', 40, [info('869000', 'InProgress')])
    : tracked('Completed', 100, [info('869000', 'Completed', 'Ürün oluşturuldu'), info('869001', 'Failed', 'Ürün oluşturulamadı', ['Kategori bulunamadı', 'Görsel indirilemedi'])]));
  try {
    const c = pttavm(SOAP, { id: 'pttavm' }).catalog;
    assert.equal(c.chunk, 100);
    const items = [];
    for (let i = 0; i < 101; i++) items.push((await c.build(PR(i, { name: i === 0 ? 'Saksı & Toprak <Set>' : `Ürün ${i}` }), MAP, { opts: { cargoProfileId: '77', preparingDay: '3' } })).payload);
    const { ref } = await c.send(items);
    const up = m.calls.filter((x) => x.action === 'UpdateProductsV3');
    assert.equal(up.length, 2);
    assert.equal((up[0].body.match(/<r:ProductV3Request>/g) || []).length, 100);
    assert.match(up[0].body, /<tem:UpdateProductsV3><tem:items xmlns:r="http:\/\/schemas\.datacontract\.org\/2004\/07\/ePttAVMService\.Model\.Requests"><r:ProductV3Request>/);
    // DataContract sırası (WSDL): Active, Barcode, Brand, CargoProfileId, CategoryId, Desi, Discount, EstimatedCourierDelivery, Images, LongDescription, Name, PriceWithVat, ProductCode, Quantity, VATRate
    assert.ok(up[0].body.includes('<r:ProductV3Request><r:Active>true</r:Active><r:Barcode>869000</r:Barcode><r:Brand>HG</r:Brand><r:CargoProfileId>77</r:CargoProfileId><r:CategoryId>111</r:CategoryId>'
      + '<r:Desi>2</r:Desi><r:Discount>0</r:Discount><r:EstimatedCourierDelivery>3</r:EstimatedCourierDelivery><r:Images><r:ProductImageV3><r:Url>https://cdn.ornek.com/x.jpg</r:Url></r:ProductImageV3>'
      + '<r:ProductImageV3><r:Url>https://cdn.ornek.com/y.jpg</r:Url></r:ProductImageV3></r:Images><r:LongDescription>&lt;p&gt;Açıklama&lt;/p&gt;</r:LongDescription><r:Name>Saksı &amp; Toprak &lt;Set&gt;</r:Name>'
      + '<r:PriceWithVat>149.90</r:PriceWithVat><r:ProductCode>SKU-0</r:ProductCode><r:Quantity>3</r:Quantity><r:VATRate>10</r:VATRate></r:ProductV3Request>'), up[0].body.slice(0, 1500));
    assert.equal(v3Xml({ Barcode: 'B', CargoProfileId: null, Images: [] }), '<r:ProductV3Request><r:Barcode>B</r:Barcode></r:ProductV3Request>', 'boş alan gönderilmez');
    assert.match(ref, /^trk-1:869000,869001,/); assert.match(ref, /;0:86900100$/);
    // Sonuç: önce işleniyor; sonra ürün ürün (Completed → kabul, Failed → nedenleriyle); reddedilen parça "gönderilemedi"; sonuç gelmeyen ürün hata
    let st = await c.status(ref);
    assert.equal(st.done, false);
    assert.match(m.calls.find((x) => x.action === 'GetProductsTrackingResult').body, /<tem:trackingId>trk-1<\/tem:trackingId>/);
    st = await c.status(ref);
    assert.equal(st.done, true);
    const by = Object.fromEntries(st.items.map((x) => [x.key, x]));
    assert.deepEqual(by['869000'], { key: '869000', ok: true, status: 'PttAVM kabul etti', error: '' });
    assert.deepEqual(by['869001'], { key: '869001', ok: false, status: 'PttAVM kabul etmedi', error: 'Ürün oluşturulamadı · Kategori bulunamadı · Görsel indirilemedi' });
    assert.equal(by['869002'].ok, false); assert.equal(by['869002'].error, 'PttAVM bu ürün için sonuç vermedi');
    assert.equal(by['86900100'].ok, false); assert.equal(by['86900100'].status, 'PttAVM\'e gönderilemedi');
    // İlk parça reddedilirse gönderim hata verir (catalog/upload "kabul etmedi" der)
    n = 1;
    await assert.rejects(() => c.send(items.slice(0, 2)), /PttAVM ürün gönderimi: Günlük limit aşıldı/);
  } finally { m.restore(); }
});

test('PttAVM ürün yükleme uçtan uca: REST hesabı + eski giriş, eşleştirme, eksikler, gönderim, sonuç ve ürün kanal durumu', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now();
  const ins = (sku, bc, name, variant, img) => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, description, sale_price, list_price, vat, desi, stock, group_name, variant_name, parent_key, created_at, updated_at)
    VALUES (?, ?, ?, 'HG', 'Gübre', ?, '<p>%100 organik</p>', 100, 120, 10, 3, 7, 'Solucan Gübresi', ?, 'ikas1:SOL', ?, ?)`, sku, bc, name, img, variant, t, t);
  await ins('SOL-5', '869001', 'Solucan Gübresi 5 Kg', '5 Kg', 'https://cdn.ornek.com/a.jpg');
  await ins('SOL-10', '869002', 'Solucan Gübresi 10 Kg', '10 Kg', 'https://cdn.ornek.com/b.jpg');
  await ins('SOL-X', '', 'Barkodsuz', '1 Kg', '');
  let polls = 0;
  const m = mock({
    UpdateProductsV3: () => updated('true', 'trk-e2e'),
    GetProductsTrackingResult: () => (++polls === 1 ? tracked('InProgress', 10, [])
      : tracked('Completed', 100, [info('869001', 'Completed'), info('869002', 'Failed', '', ['Ürün adı kategoriyle uyumsuz'])])),
  });
  try {
    let cookie = '';
    const call = async (path, o = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    // Yalnız API Key + Token: ürün yükleme kapalı, nedeni söylenir
    await call('integrations/pttavm', { method: 'PUT', body: JSON.stringify({ values: REST }) });
    await setSetting(db, 'verified:pttavm', { at: Date.now() + 1000 }); resetChannels();
    let st = await call('catalog/state');
    let pt = st.channels.find((c) => c.id === 'pttavm');
    assert.equal(pt.ready, false); assert.match(pt.reason, /eski API kullanıcı adı ve şifresini girin/);
    const no = await call('catalog/remote-categories?channel=pttavm&q=x');
    assert.match(no.error, /eski API kullanıcı adı ve şifresini girin/);
    // Eski kullanıcı adı / şifre de girilince açılır (siparişler REST'te kalır)
    await call('integrations/pttavm', { method: 'PUT', body: JSON.stringify({ values: { ...REST, ...SOAP } }) });
    await setSetting(db, 'verified:pttavm', { at: Date.now() + 1000 }); resetChannels();
    st = await call('catalog/state');
    pt = st.channels.find((c) => c.id === 'pttavm');
    assert.ok(pt.ready, JSON.stringify(pt));
    assert.deepEqual(pt.options.map((o) => o.k), ['cargoProfileId', 'preparingDay']);
    const cats = await call('catalog/remote-categories?channel=pttavm&q=organik');
    assert.deepEqual(cats.items, [{ id: '111', name: 'Organik Gübre', path: 'Bahçe › Gübre' }]);
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Gübre', channel: 'pttavm', remote_id: '111', remote_name: 'Organik Gübre', attrs: {} }) });
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'pttavm', opts: { cargoProfileId: '12345' } }) });
    let cand = await call('catalog/candidates?channel=pttavm&local=G%C3%BCbre');
    let by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    assert.deepEqual(by['SOL-5'].missing, ['kargo profili “12345” PttAVM\'de yok (tanımlı: PTT Kargo Standart 77); PttAVM seçeneklerinden düzeltin']);
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'pttavm', opts: { cargoProfileId: '77', preparingDay: '2' } }) });
    cand = await call('catalog/candidates?channel=pttavm&local=G%C3%BCbre');
    by = Object.fromEntries(cand.items.map((x) => [x.sku, x]));
    assert.deepEqual(by['SOL-5'].missing, []); assert.deepEqual(by['SOL-10'].missing, []);
    assert.deepEqual(by['SOL-X'].missing, ['barkod', 'görsel']);
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'pttavm', ids: cand.items.map((x) => x.id) }) });
    assert.equal(up.sent, 2, JSON.stringify(up)); assert.equal(up.ref, 'trk-e2e:869002,869001'); assert.equal(up.skipped.length, 1);
    const body = m.calls.find((x) => x.action === 'UpdateProductsV3').body;
    assert.match(body, /<r:Barcode>869001<\/r:Barcode><r:Brand>HG<\/r:Brand><r:CargoProfileId>77<\/r:CargoProfileId><r:CategoryId>111<\/r:CategoryId><r:Desi>3<\/r:Desi>/);
    assert.match(body, /<r:Name>Solucan Gübresi 5 Kg<\/r:Name><r:PriceWithVat>100\.00<\/r:PriceWithVat><r:ProductCode>SOL-5<\/r:ProductCode><r:Quantity>7<\/r:Quantity><r:VATRate>10<\/r:VATRate>/);
    assert.ok(m.calls.some((x) => x.action === 'BarkodKontrolBulk'), 'kayıtlı barkod kontrolü');
    let ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, false);
    ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true);
    const r1 = ck.items.find((x) => x.key === '869001'), r2 = ck.items.find((x) => x.key === '869002');
    assert.equal(r1.ok, true); assert.equal(r2.ok, false); assert.equal(r2.error, 'Ürün adı kategoriyle uyumsuz');
    const pc = await first(db, "SELECT state, error FROM product_channel WHERE channel = 'pttavm' AND product_id = ?", by['SOL-10'].id);
    assert.equal(pc.state, 'rejected'); assert.match(pc.error, /kategoriyle uyumsuz/);
    const raw = await call(`catalog/uploads/${up.id}/raw`);
    assert.equal(raw.raw.Status, 'Completed');
  } finally { m.restore(); resetChannels(); }
});
