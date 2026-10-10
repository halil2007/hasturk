// DHL Express (MyDHL API) bağlantısı: OpenAPI 3.3.3'teki istek / yanıt biçimleriyle (sahte sunucu) gönderi + PDF etiket, takip ve hatalar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as dhlx from '../src/carriers/dhlexpress.js';

const realFetch = globalThis.fetch;
function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const req = { url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body == null ? '' : String(o.body) };
    calls.push(req);
    const r = routes.find(([re]) => re.test(`${req.method} ${req.url}`));
    if (!r) return new Response('not found', { status: 404 });
    let out = await r[1](req), status = 200;
    if (Array.isArray(out) && typeof out[0] === 'number' && out.length === 2) [status, out] = out;
    return new Response(typeof out === 'string' ? out : JSON.stringify(out), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
const restore = () => { globalThis.fetch = realFetch; };
const ship = (extra = {}) => ({
  reference: 'TRENDYOL-1001-1', orderNumber: '1001', channel: 'trendyol', desi: 2.4, value: 300, currency: 'TRY',
  receiver: { name: 'Ayşe Yılmaz', phone: '+90 532 123 45 67', email: 'ayse@example.com', address: 'Caferağa Mahallesi Moda Caddesi Bahariye Sokak No:12 Daire:3 Kat:2 Yeldeğirmeni yanı', district: 'Kadıköy', city: 'İstanbul', postalCode: '', country: 'TR' },
  sender: { name: 'HasTürk Gübre', phone: '0332 000 00 00', address: 'Sanayi Cd. No 1', district: 'Selçuklu', city: 'Konya' },
  items: [{ name: 'Gübre 5 kg', sku: 'G5', barcode: '869', qty: 2, unitPrice: 150 }], ...extra,
});
const vals = { DHLEXPRESS_API_KEY: 'key', DHLEXPRESS_API_SECRET: 'sec', DHLEXPRESS_ACCOUNT: '123456789' };
const PDF = 'JVBERi0xLjQK' + 'A'.repeat(40);

test('DHL Express: planlanan gönderim zamanı ve adres satırları', () => {
  // 10:00 TR (07:00Z) → aynı gün 12:00; 18:00 TR → ertesi gün 10:00; cumartesi 18:00 → pazartesi 10:00
  assert.equal(dhlx.plannedAt(Date.parse('2026-10-07T07:00:00Z')), '2026-10-07T12:00:00 GMT+03:00');
  assert.equal(dhlx.plannedAt(Date.parse('2026-10-07T15:00:00Z')), '2026-10-08T10:00:00 GMT+03:00');
  assert.equal(dhlx.plannedAt(Date.parse('2026-10-10T15:00:00Z')), '2026-10-12T10:00:00 GMT+03:00');
  const l = dhlx.lines('Caferağa Mahallesi Moda Caddesi Bahariye Sokak No:12 Daire:3 Kat:2 Yeldeğirmeni yanı');
  assert.ok(l.length <= 3 && l.every((x) => x.length <= 45));
  assert.equal(l[0], 'Caferağa Mahallesi Moda Caddesi Bahariye');
  assert.match(dhlx.publicUrl('5374534546'), /dhl\.com\/tr-tr.*tracking-id=5374534546/);
});

test('DHL Express: Basic kimlik → posta kodu (adres doğrulama) → POST /shipments → AWB + PDF etiket + ücret', async () => {
  const calls = mock([
    [/GET .*\/address-validate\?type=delivery/, () => ({ address: [{ countryCode: 'TR', postalCode: '34710', cityName: 'ISTANBUL', countyName: 'KADIKOY' }] })],
    [/GET .*\/address-validate\?type=pickup/, () => ({ address: [{ countryCode: 'TR', postalCode: '42250', cityName: 'KONYA' }] })],
    [/POST .*\/shipments$/, () => [201, {
      shipmentTrackingNumber: '5374534546', trackingUrl: 'https://express.api.dhl.com/mydhlapi/shipments/5374534546/tracking',
      packages: [{ referenceNumber: 1, trackingNumber: 'JD014600004617230779' }],
      documents: [{ imageFormat: 'PDF', content: PDF, typeCode: 'label' }],
      shipmentCharges: [{ currencyType: 'BILLC', priceCurrency: 'TRY', price: 245.5 }],
    }]],
  ]);
  try {
    const r = await dhlx.make(vals).create(ship());
    const q = calls.find((c) => /\/shipments$/.test(c.url)), b = JSON.parse(q.body);
    assert.match(q.url, /^https:\/\/express\.api\.dhl\.com\/mydhlapi\/shipments$/);
    assert.equal(q.headers.Authorization, 'Basic ' + btoa('key:sec'));
    assert.match(b.plannedShippingDateAndTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00 GMT\+03:00$/);
    assert.deepEqual(b.pickup, { isRequested: false });
    assert.equal(b.productCode, 'N');
    assert.deepEqual(b.accounts, [{ typeCode: 'shipper', number: '123456789' }]);
    assert.equal(b.outputImageProperties.encodingFormat, 'pdf');
    assert.equal(b.outputImageProperties.imageOptions[0].typeCode, 'label');
    const rc = b.customerDetails.receiverDetails, sc = b.customerDetails.shipperDetails;
    assert.equal(rc.postalAddress.postalCode, '34710');
    assert.equal(rc.postalAddress.countryCode, 'TR');
    assert.equal(rc.postalAddress.cityName, 'İstanbul');
    assert.equal(rc.postalAddress.countyName, 'Kadıköy');
    assert.ok(rc.postalAddress.addressLine1 && rc.postalAddress.addressLine1.length <= 45);
    assert.equal(rc.contactInformation.phone, '+905321234567');
    assert.equal(rc.contactInformation.mobilePhone, '+905321234567');
    assert.equal(rc.contactInformation.fullName, 'Ayşe Yılmaz');
    assert.equal(rc.typeCode, 'private');
    assert.equal(sc.postalAddress.postalCode, '42250');
    assert.equal(sc.contactInformation.companyName, 'HasTürk Gübre');
    assert.equal(sc.contactInformation.phone, '+903320000000');
    assert.equal(sc.contactInformation.mobilePhone, undefined);
    assert.equal(b.content.isCustomsDeclarable, false);
    assert.equal(b.content.unitOfMeasurement, 'metric');
    assert.equal(b.content.packages[0].weight, 2.4);
    assert.deepEqual(b.content.packages[0].customerReferences, [{ value: 'TRENDYOL-1001-1', typeCode: 'CU' }]);
    assert.equal(r.ref, '5374534546');
    assert.equal(r.tracking, '5374534546');
    assert.equal(r.carrier, 'DHL Express');
    assert.equal(r.cost, 245.5);
    assert.deepEqual(r.label, { format: 'pdf', data: PDF });
    assert.match(r.trackingUrl, /dhl\.com.*5374534546/);
  } finally { restore(); }
});

test('DHL Express: test ortamı, verilen posta kodları, ürün kodu; doğrulama yanıtsızsa il merkez kodu', async () => {
  const calls = mock([[/address-validate/, () => [500, { title: 'x' }]], [/POST .*\/shipments$/, () => [201, { shipmentTrackingNumber: '1', documents: [] }]]]);
  try {
    const r = await dhlx.make({ ...vals, DHLEXPRESS_ENV: 'test', DHLEXPRESS_PRODUCT: 'O', DHLEXPRESS_SENDER_POSTCODE: '42060', DHLEXPRESS_COMPANY: 'HasTürk A.Ş.' }).create(ship());
    const q = calls.find((c) => /\/shipments$/.test(c.url)), b = JSON.parse(q.body);
    assert.match(q.url, /\/mydhlapi\/test\/shipments$/);
    assert.equal(b.productCode, 'O');
    assert.equal(b.customerDetails.shipperDetails.postalAddress.postalCode, '42060');
    assert.equal(b.customerDetails.shipperDetails.contactInformation.companyName, 'HasTürk A.Ş.');
    assert.equal(b.customerDetails.receiverDetails.postalAddress.postalCode, '34000');
    assert.equal(calls.filter((c) => /address-validate\?type=pickup/.test(c.url)).length, 0, 'gönderen posta kodu verildiyse sorulmaz');
    assert.equal(r.label, null);
  } finally { restore(); }
  // Siparişte posta kodu varsa doğrulama çağrılmaz
  const c2 = mock([[/POST .*\/shipments$/, () => [201, { shipmentTrackingNumber: '2', documents: [{ imageFormat: 'PDF', content: PDF, typeCode: 'label' }] }]]]);
  try {
    await dhlx.make({ ...vals, DHLEXPRESS_SENDER_POSTCODE: '42060' }).create(ship({ receiver: { ...ship().receiver, postalCode: '34714' } }));
    assert.equal(c2.length, 1);
    assert.equal(JSON.parse(c2[0].body).customerDetails.receiverDetails.postalAddress.postalCode, '34714');
  } finally { restore(); }
});

test('DHL Express: hata gövdesi (additionalDetails), 401, eksik telefon; bağlantı denemesi', async () => {
  const a = dhlx.make({ ...vals, DHLEXPRESS_SENDER_POSTCODE: '42060' });
  await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, phone: '12' } })), /alıcı telefonunu/);
  await assert.rejects(a.create(ship({ sender: { ...ship().sender, phone: '' } })), /gönderen telefonunu/);
  mock([[/POST .*\/shipments$/, () => [422, { instance: '/expressapi/shipments', detail: 'Multiple problems found, see Additional Details', title: 'Validation error', message: 'Unprocessable Entity', additionalDetails: ['#/customerDetails/receiverDetails/postalAddress/cityName: expected maxLength: 45, actual: 49'], status: '422' }]]]);
  try { await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, postalCode: '34710' } })), /DHL Express: #\/customerDetails.*maxLength: 45/); } finally { restore(); }
  mock([[/POST .*\/shipments$/, () => [400, { title: 'Bad request', detail: '410138: Account number is invalid', status: '400' }]]]);
  try { await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, postalCode: '34710' } })), /Account number is invalid/); } finally { restore(); }
  const calls = mock([[/address-validate/, () => [401, { title: 'Unauthorized' }]]]);
  try {
    await assert.rejects(a.test(), /API Key \/ Secret hatalı/);
    assert.match(calls[0].url, /address-validate\?type=pickup&countryCode=TR&postalCode=34000/);
  } finally { restore(); }
  mock([[/address-validate/, () => ({ address: [{ countryCode: 'TR', postalCode: '34000' }] })]]);
  try { assert.match((await a.test()).message, /tamam/); } finally { restore(); }
});

test('DHL Express: takip (son olay; OK teslim, RT iade, yolda; 404 henüz kayıt yok); iptal yerel', async () => {
  let res = { shipments: [{ shipmentTrackingNumber: '5374534546', status: 'Success', events: [
    { date: '2026-10-02', time: '11:59:23', GMTOffset: '+03:00', typeCode: 'OK', description: 'Delivered : AYSE Y' },
    { date: '2026-10-01', time: '13:56:21', GMTOffset: '+03:00', typeCode: 'PU', description: 'Shipment picked up' },
  ] }] };
  const calls = mock([[/GET .*\/shipments\/\d+\/tracking/, () => (typeof res === 'number' ? [res, { title: 'Not found', detail: '404: Shipment not found' }] : res)]]);
  try {
    const a = dhlx.make(vals);
    let t = await a.track({ carrier_ref: '5374534546' });
    assert.match(calls[0].url, /\/shipments\/5374534546\/tracking\?trackingView=all-checkpoints&levelOfDetail=shipment/);
    assert.equal(t.state, 'delivered');
    assert.equal(t.text, 'Delivered : AYSE Y');
    assert.equal(t.deliveredAt, Date.parse('2026-10-02T11:59:23+03:00'));
    res = { shipments: [{ events: [{ date: '2026-10-01', time: '10:00:00', typeCode: 'PU' }, { date: '2026-10-03', time: '09:00:00', typeCode: 'RT', description: 'Returned to shipper' }] }] };
    assert.equal((await a.track({ carrier_ref: '1' })).state, 'returned');
    res = { shipments: [{ events: [{ date: '2026-10-01', time: '10:00:00', typeCode: 'WC', description: 'With delivery courier' }] }] };
    t = await a.track({ carrier_ref: '1' });
    assert.equal(t.state, 'transit');
    assert.equal(t.deliveredAt, null);
    res = 404;
    assert.equal((await a.track({ carrier_ref: '1' })).state, 'created');
    const before = calls.length;
    await a.cancel('5374534546');
    assert.equal(calls.length, before, 'iptal servisi yok: istek atılmaz');
  } finally { restore(); }
});
