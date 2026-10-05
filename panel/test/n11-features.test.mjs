// N11: ürün yükleme (kategori / özellik / product-create / task-details) ve iade talepleri (SOAP returnService), ağa çıkmadan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { n11 } from '../src/channels/n11.js';

const ENV = { N11_APP_KEY: 'k', N11_APP_SECRET: 's' };
function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    const hit = routes.find(([re]) => re.test(String(url)));
    const b = hit ? (typeof hit[1] === 'function' ? hit[1](url, opts) : hit[1]) : { message: 'yok' };
    const text = typeof b === 'string' ? b : JSON.stringify(b);
    return new Response(text, { status: hit ? 200 : 404, headers: { 'Content-Type': typeof b === 'string' ? 'text/xml' : 'application/json' } });
  };
  return calls;
}
const realFetch = globalThis.fetch;
const restore = () => { globalThis.fetch = realFetch; };

const CATS = { categories: [{ id: 1000001, parentId: null, name: 'Bahçe', subCategories: [{ id: 1000002, parentId: 1000001, name: 'Gübre', subCategories: null }, { id: 1000003, parentId: 1000001, name: 'Tohum', subCategories: [] }] }] };
const ATTRS = { id: 1000002, name: 'Gübre', categoryAttributes: [
  { attributeId: 1, categoryId: 1000002, attributeName: 'Marka', isMandatory: true, isVariant: false, isCustomValue: true, attributeValues: [{ id: 501, value: 'HasTürk' }] },
  { attributeId: 429, categoryId: 1000002, attributeName: 'Ağırlık', isMandatory: true, isVariant: true, isCustomValue: false, attributeValues: [{ id: 7001, value: '5 kg' }, { id: 7002, value: '10 kg' }] },
  { attributeId: 911, categoryId: 1000002, attributeName: 'Menşei', isMandatory: true, isVariant: false, isCustomValue: true, attributeValues: [] },
  { attributeId: 12, categoryId: 1000002, attributeName: 'Garanti', isMandatory: false, isVariant: false, isCustomValue: true, attributeValues: [] },
] };
const PR = { id: 1, sku: 'GUB-5', barcode: '8690000000005', name: 'Solucan Gübresi 5 Kg', brand: 'hastürk', description: '<p>Organik</p>', image: 'https://img/1.jpg', images: ['https://img/1.jpg', 'http://img/2.jpg', 'https://img/3.jpg'],
  vat: 20, desi: 2, stock: 7, price: 150, listPrice: 120, group: 'GUB', variant: '5 Kg' };
const MAP = { remote_id: '1000002', attrs: { 429: { value: '@variant' }, 911: { value: 'Türkiye' } } };
const pick = async (a, text) => (text === '5 Kg' ? { id: '7001', value: '5 kg' } : null);

test('N11 katalog: yaprak kategoriler, özellikler (Marka hariç) ve değerler', async () => {
  try {
    const calls = mock([[/\/cdn\/categories$/, CATS], [/\/cdn\/category\/1000002\/attribute$/, ATTRS]]);
    const c = n11(ENV, { id: 'n11' });
    const r = await c.catalog.categories('gübre');
    assert.deepEqual(r.items, [{ id: '1000002', name: 'Gübre', path: 'Bahçe' }]);
    assert.equal((await c.catalog.allCategories()).length, 2);
    assert.equal(calls[0].headers.appkey, 'k'); assert.equal(calls[0].headers.appsecret, 's');
    const at = await c.catalog.attributes('1000002');
    assert.deepEqual(at.map((a) => [a.id, a.kind, a.mandatory, a.type, a.custom]), [['429', 'variant', true, 'enum', false], ['911', 'category', true, 'text', true], ['12', 'category', false, 'text', true]]);
    assert.deepEqual(await c.catalog.values('1000002', '429'), [{ id: '7001', value: '5 kg' }, { id: '7002', value: '10 kg' }]);
    assert.deepEqual(c.catalog.options.map((o) => o.k), ['shipmentTemplate', 'preparingDay']);
  } finally { restore(); }
});

test('N11 katalog: build belgelenen product-create alanlarını doldurur; eksikler listelenir', async () => {
  try {
    mock([[/\/cdn\/category\/1000002\/attribute$/, ATTRS]]);
    const c = n11(ENV, { id: 'n11' });
    const b = await c.catalog.build(PR, MAP, { opts: { shipmentTemplate: 'Standart', preparingDay: '2' }, pick });
    assert.deepEqual(b.missing, []);
    assert.equal(b.key, 'GUB-5');
    assert.deepEqual(b.payload, {
      title: 'Solucan Gübresi 5 Kg', description: '<p>Organik</p>', categoryId: 1000002, currencyType: 'TL', productMainId: 'GUB', preparingDay: 2, shipmentTemplate: 'Standart',
      stockCode: 'GUB-5', barcode: '8690000000005', quantity: 7, images: [{ url: 'https://img/1.jpg', order: 0 }, { url: 'https://img/3.jpg', order: 1 }],
      attributes: [{ id: 1, valueId: 501, customValue: null }, { id: 429, valueId: 7001, customValue: null }, { id: 911, valueId: null, customValue: 'Türkiye' }],
      salePrice: 150, listPrice: 150, vatRate: 20,
    });
    // Varyant listede yok (özel değer kapalı), marka yok, KDV geçersiz, seçenekler girilmemiş
    const bad = await c.catalog.build({ ...PR, variant: '25 Kg', brand: '', vat: 18, image: 'http://img/1.jpg', images: [] }, MAP, { opts: {}, pick });
    assert.deepEqual(bad.missing, ['marka', 'Ağırlık (“25 Kg” listede yok)', 'görsel (https)', 'KDV oranı %18 (N11: 0, 1, 10, 20)', 'kargo şablonu (Ürün yükle → N11 seçenekleri)', 'kargoya veriliş süresi (Ürün yükle → N11 seçenekleri)']);
    // Listede olmayan marka, özel değere izin verildiği için customValue ile gider
    const own = await c.catalog.build({ ...PR, brand: 'Tarım Dünyası' }, MAP, { opts: { shipmentTemplate: 'S', preparingDay: 1 }, pick });
    assert.deepEqual(own.payload.attributes[0], { id: 1, valueId: null, customValue: 'Tarım Dünyası' });
  } finally { restore(); }
});

test('N11 katalog: gönderim taskId döndürür, REJECT hata verir; durum SUCCESS / FAIL / IN_QUEUE', async () => {
  try {
    let calls = mock([[/product-create/, { id: 1092, type: 'PRODUCT_CREATE', status: 'IN_QUEUE', reasons: ['1 sku işlenmeye alındı.'] }]]);
    const c = n11(ENV, { id: 'n11' });
    const r = await c.catalog.send([{ stockCode: 'A' }]);
    assert.equal(r.ref, '1092');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].body), { payload: { integrator: 'HasturkPanel', skus: [{ stockCode: 'A' }] } });
    mock([[/product-create/, { id: 5, status: 'REJECT', reasons: ['Kategori bulunamadı'] }]]);
    await assert.rejects(c.catalog.send([{ stockCode: 'A' }]), /Kategori bulunamadı/);

    let state = 'IN_QUEUE';
    calls = mock([[/task-details\/page-query/, (u, o) => {
      const q = JSON.parse(o.body);
      if (q.pageable.page === 0) return { taskId: q.taskId, status: state, skus: { content: [{ itemCode: 'A', status: 'SUCCESS', reasons: ['Başarıyla tamamlandı.'] }], last: false, totalPages: 2 } };
      return { taskId: q.taskId, status: state, skus: { content: [{ itemCode: 'B', status: 'FAIL', reasons: ['Zorunlu özellik eksik', 'Görsel hatalı'] }, { itemCode: 'C', status: 'IN_PROGRESS' }], last: true, totalPages: 2 } };
    }]]);
    let s = await c.catalog.status('1092');
    assert.equal(s.done, false);
    assert.deepEqual(JSON.parse(calls[0].body), { taskId: 1092, pageable: { page: 0, size: 1000 } });
    assert.deepEqual(s.items.map((x) => [x.key, x.ok, x.error]), [['A', true, ''], ['B', false, 'Zorunlu özellik eksik · Görsel hatalı'], ['C', null, '']]);
    state = 'PROCESSED';
    s = await c.catalog.status('1092');
    assert.equal(s.done, true);
  } finally { restore(); }
});

const claimXml = (pageCount = 1) => `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns3:ClaimReturnListResponse xmlns:ns3="http://www.n11.com/ws/schemas">
  <result><status>success</status></result><claimReturnList>
  <claimReturn><attributesNames>5 kg</attributesNames><buyerName>Ad Soyad</buyerName><claimReturnId>25383473</claimReturnId><executer>SHIPMENT</executer><finalPrice>300</finalPrice><orderNumber>123456789001</orderNumber>
    <productId>623456780</productId><productName>Solucan Gübresi</productName><quantity>2</quantity><requestDate>01/05/2025</requestDate><returnReasonDescription>Paket yırtık &amp; eksik</returnReasonDescription>
    <returnReasonType>Hasarlı Paket</returnReasonType><sender>SELLER</sender><shipmentCompany>Sürat Kargo</shipmentCompany><status>REQUESTED</status><trackingNumber>12306601382000</trackingNumber><unitPrice>150</unitPrice></claimReturn>
  <claimReturn><claimReturnId>25391658</claimReturnId><orderNumber>123456789000</orderNumber><productName>Leonardit</productName><quantity>1</quantity><requestDate>07/05/2025</requestDate><status>CANCELLED</status><unitPrice>100</unitPrice></claimReturn>
  </claimReturnList><pagingData><currentPage>0</currentPage><pageSize>20</pageSize><totalCount>2</totalCount><pageCount>${pageCount}</pageCount></pagingData></ns3:ClaimReturnListResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

test('N11 iade: ClaimReturnList okunur, onay / ret / ret gerekçeleri returnService SOAP ile gider', async () => {
  try {
    const ok = '<x><result><status>success</status></result></x>';
    const reasons = `<x><result><status>success</status></result><denyReasonTypeDataList><denyReasonTypeData><id>1</id><value>Ürün kargoya sağlam teslim edildi</value></denyReasonTypeData><denyReasonTypeData><id>41</id><value>İade Ürün Mağazaya Ulaşmadı</value></denyReasonTypeData></denyReasonTypeDataList></x>`;
    const calls = mock([[/\/ws\/returnService\/$/, (u, o) => (/ClaimReturnListRequest/.test(o.body) ? claimXml(2) : /ClaimReturnDenyReasonTypesRequest/.test(o.body) ? reasons : ok)]]);
    const c = n11({ N11_APP_KEY: 'k&1', N11_APP_SECRET: 's' }, { id: 'n11' });
    const r = await c.claims({ since: Date.parse('2026-10-01T00:00:00Z'), until: Date.parse('2026-10-05T00:00:00Z'), page: 0, size: 50 });
    assert.equal(r.hasNext, true);
    assert.match(calls[0].body, /<sch:ClaimReturnListRequest><auth><appKey>k&amp;1<\/appKey><appSecret>s<\/appSecret><\/auth><searchData><status>ALL<\/status>/);
    assert.match(calls[0].body, /<period><startDate>01\/10\/2026<\/startDate><endDate>05\/10\/2026<\/endDate><\/period><\/searchData><pagingData><currentPage>0<\/currentPage><\/pagingData>/);
    const [a, b] = r.items;
    assert.deepEqual([a.remoteId, a.orderNumber, a.status, a.remoteStatus, a.customer, a.reason, a.note, a.amount, a.cargo, a.tracking, a.claimedAt],
      ['25383473', '123456789001', 'waiting', 'İade talebi geldi', 'Ad Soyad', 'Hasarlı Paket', 'Paket yırtık & eksik', 300, 'Sürat Kargo', '12306601382000', Date.parse('2025-05-01T00:00:00+03:00')]);
    assert.deepEqual(a.lines, [{ id: '25383473', name: 'Solucan Gübresi · 5 kg', productId: '623456780', qty: 2, price: 150, reason: 'Hasarlı Paket', note: 'Paket yırtık & eksik', status: 'waiting', remoteStatus: 'İade talebi geldi' }]);
    assert.deepEqual([b.status, b.amount], ['other', 100]);
    assert.equal((await c.claims({ since: 1, until: 2, page: 1 })).hasNext, false);

    assert.deepEqual(await c.claimReasons(), [{ id: '1', name: 'Ürün kargoya sağlam teslim edildi' }, { id: '41', name: 'İade Ürün Mağazaya Ulaşmadı' }]);
    await c.approveClaim({ remote_id: '25383473' }, a.lines);
    assert.match(calls.at(-1).body, /<sch:ClaimReturnApproveRequest><auth>.*<\/auth><claimReturnId>25383473<\/claimReturnId><\/sch:ClaimReturnApproveRequest>/);
    await c.rejectClaim({ remote_id: '25383473' }, a.lines, { reasonId: '1', text: 'Sağlam <teslim>' });
    assert.match(calls.at(-1).body, /<claimReturnId>25383473<\/claimReturnId><denyReasonId>1<\/denyReasonId><denyReasonNote>Sağlam &lt;teslim&gt;<\/denyReasonNote><\/sch:ClaimReturnDenyRequest>/);
    assert.equal(calls.at(-1).url, 'https://api.n11.com/ws/returnService/');

    mock([[/returnService/, '<x><result><status>failure</status><errorMessage>İade talebi bulunamadı</errorMessage></result></x>']]);
    await assert.rejects(c.approveClaim({ remote_id: '1' }, []), /bulunamadı/);
    assert.equal(c.caps.label, null, 'N11 API etiket servisi vermez');
  } finally { restore(); }
});
