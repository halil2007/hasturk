// Kolay Gelsin bağlantısı: entegrasyon dokümanındaki istek / yanıt biçimleriyle (sahte sunucu) gönderi, iptal, takip ve hata zarfı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kg from '../src/carriers/kolaygelsin.js';

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
const env = (p) => ({ Source: 'parcelDelivery', Target: 'APIReadQ', JobId: 'S-1', Payload: p, Username: 'u', ResultCode: 200, ResultMessage: 'OK' });
const ship = (extra = {}) => ({
  reference: 'TRENDYOL-1001-1', orderNumber: '1001', channel: 'trendyol', desi: 2.4, value: 300, currency: 'TRY',
  receiver: { name: 'Ayşe Nur Yılmaz', phone: '+90 532 123 45 67', email: 'ayse@example.com', address: 'Caferağa Mah. Moda Cad. No:12 D:3', district: 'Kadıköy', city: 'İstanbul', postalCode: '', country: 'TR' },
  sender: { name: 'HasTürk Gübre', phone: '0332 000 00 00', address: 'Sanayi Cd. No 1', district: 'Selçuklu', city: 'Konya' },
  items: [{ name: 'Gübre 5 kg', sku: 'G5', barcode: '869', qty: 2, unitPrice: 150 }], ...extra,
});
const vals = { KOLAYGELSIN_TOKEN: 'tok-1', KOLAYGELSIN_CUSTOMER_ID: '2124', KOLAYGELSIN_ADDRESS_ID: '4389' };

test('Kolay Gelsin: il plakası ve parça barkodu', () => {
  assert.equal(kg.plateOf('İSTANBUL'), 34);
  assert.equal(kg.plateOf('Şanlıurfa'), 63);
  assert.equal(kg.plateOf('afyon'), 3);
  assert.equal(kg.plateOf('Düzce'), 81);
  assert.equal(kg.plateOf('Yok'), 0);
  assert.equal(kg.barcodeOf({ channel: 'trendyol', reference: 'TRENDYOL-1001-1' }), 'TRTRENDYOL10011');
  assert.ok(kg.barcodeOf({ channel: 'x', reference: 'A'.repeat(40) }).length <= 20);
});

test('Kolay Gelsin: SaveIntegrationShipmentV2 (alıcı istekte) → gönderi no; Bearer token; etiket panelden (müşteri barkodu)', async () => {
  const calls = mock([[/POST .*\/api\/request\/SaveIntegrationShipmentV2$/, () => env({ ShipmentId: 70000, CustomerSpecificCode: 'TRTRENDYOL10011', ShipmentItemLabelList: [{ ShipmentItemId: '1', CustomerBarcode: 'TRTRENDYOL10011', ShipmentItemLabel: '<html></html>' }], ShipmentTrackingLink: 'https://esube.kolaygelsin.com/shipment' })]]);
  try {
    const r = await kg.make(vals).create(ship());
    const q = calls[0], b = JSON.parse(q.body);
    assert.match(q.url, /^https:\/\/api\.kolaygelsin\.com\/api\/request\//);
    assert.equal(q.headers.Authorization, 'Bearer tok-1');
    assert.equal(q.headers['Content-Type'], 'application/json');
    assert.deepEqual(b.SenderCustomer, { CustomerId: 2124, Address: { AddressId: 4389 } });
    assert.equal(b.Recipient.RecipientType, 1);
    assert.equal(b.Recipient.RecipientName, 'Ayşe Nur');
    assert.equal(b.Recipient.RecipientSurname, 'Yılmaz');
    assert.equal(b.Recipient.Gsm, '5321234567');
    assert.equal(b.Recipient.Address.CityId, 34);
    assert.equal(b.Recipient.Address.TownName, 'Kadıköy');
    assert.match(b.Recipient.Address.AddressText, /Moda Cad.*Kadıköy İstanbul/);
    assert.equal(b.PackageType, 2);
    assert.equal(b.PayingParty, 1);
    assert.equal(b.ShipmentItemList.length, 1);
    assert.equal(b.ShipmentItemList[0].CustomerBarcode, 'TRTRENDYOL10011');
    assert.equal(b.ShipmentItemList[0].Weight, 3);
    assert.ok(b.ShipmentItemList[0].Width > 0);
    assert.equal(b.ProductCodeList, undefined);
    assert.equal(r.ref, '70000');
    assert.equal(r.tracking, '70000');
    assert.equal(r.barcode, 'TRTRENDYOL10011');
    assert.equal(r.label, null, 'HTML etiket kullanılmaz; panel etiketi basılır');
    // Yanıttaki takip bağlantısı genel sayfaysa herkese açık takip adresi kullanılır
    assert.match(r.trackingUrl, /kolaygelsin\.com\/shipments\?trackingId=70000/);
  } finally { restore(); }
});

test('Kolay Gelsin: test ortamı, aynı gün teslim seçeneği, "Bearer" önekli token', async () => {
  const calls = mock([[/SaveIntegrationShipmentV2$/, () => env({ ShipmentId: '81', ShipmentTrackingLink: 'https://esubebeta.klyglsn.com/shipments?trackingId=81' })]]);
  try {
    const r = await kg.make({ ...vals, KOLAYGELSIN_TOKEN: 'Bearer abc', KOLAYGELSIN_ENV: 'test', KOLAYGELSIN_SAMEDAY: '1', KOLAYGELSIN_BRAND: 'HasTürk' }).create(ship());
    const b = JSON.parse(calls[0].body);
    assert.match(calls[0].url, /^https:\/\/apiintg\.klyglsn\.com\/api\/request\/SaveIntegrationShipmentV2$/);
    assert.equal(calls[0].headers.Authorization, 'Bearer abc');
    assert.deepEqual(b.ProductCodeList, ['SAMEDAY']);
    assert.equal(b.SenderBrand, 'HasTürk');
    assert.equal(r.trackingUrl, 'https://esubebeta.klyglsn.com/shipments?trackingId=81');
  } finally { restore(); }
});

test('Kolay Gelsin: eksik bilgi ve hata zarfı (HTTP 200 içinde ResultCode 500 / 404.1), 401', async () => {
  const a = kg.make(vals);
  await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, phone: '' } })), /telefon/);
  await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, district: '' } })), /ilçe/);
  await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, city: 'Atlantis' } })), /ili tanınmadı/);
  mock([[/SaveIntegrationShipmentV2$/, () => ({ ...env(null), ResultCode: 404.1, ResultMessage: 'Adres müşteriye ait değil' })]]);
  try { await assert.rejects(a.create(ship()), /Adres müşteriye ait değil \(404\.1\)/); } finally { restore(); }
  mock([[/SaveIntegrationShipmentV2$/, () => [500, { ...env(null), ResultCode: 500.0, ResultMessage: 'Bu kordinatta kurye çalışma alanı bulunamamıştır.' }]]]);
  try { await assert.rejects(a.create(ship()), /kurye çalışma alanı/); } finally { restore(); }
  mock([[/GetCorporateCustomerCargoEventTypes$/, () => [401, { Message: 'Authorization has been denied' }]]]);
  try { await assert.rejects(a.test(), /token'ı geçersiz/); } finally { restore(); }
});

test('Kolay Gelsin: bağlantı denemesi, iptal ve takip (en son aksiyon, teslim / iade)', async () => {
  let track = [{ ShipmentId: '70000', CustomerBarcode: 'TRX', CargoEventLogModelList: [{ CargoEventType: '1', TimeStamp: '2026-10-01T10:00:00+03:00' }, { CargoEventType: '29', TimeStamp: '2026-10-02T12:30:00+03:00' }, { CargoEventType: '12', TimeStamp: '2026-10-01T15:00:00+03:00' }] }];
  const calls = mock([
    [/GetCorporateCustomerCargoEventTypes$/, () => env({ CargoEventTypeList: [{ CargoEventType: 1, EventCustomerDescription: 'Kayıt' }, { CargoEventType: 29, EventCustomerDescription: 'Teslim' }] })],
    [/CancelPickupAndDelivery$/, () => env({})],
    [/GetCorporateShipmentsStatus$/, () => env(track)],
  ]);
  try {
    const a = kg.make(vals);
    assert.match((await a.test()).message, /tamam · 2 kargo durumu/);
    await a.cancel('70000');
    assert.deepEqual(JSON.parse(calls.find((c) => /Cancel/.test(c.url)).body), { ShipmentId: 70000, DeliveryCancellationReason: 1 });
    let t = await a.track({ carrier_ref: '70000' });
    const q = JSON.parse(calls.find((c) => /GetCorporateShipmentsStatus/.test(c.url)).body);
    assert.deepEqual(q.ShipmentIdList, ['70000']);
    assert.equal(q.OnlyLatestEvents, false);
    assert.equal(t.state, 'delivered');
    assert.equal(t.text, 'Teslim edildi');
    assert.equal(t.deliveredAt, Date.parse('2026-10-02T12:30:00+03:00'));
    assert.equal(t.barcode, 'TRX');
    // Dokümandaki biçim: Payload.ShipmentModelList; iade aksiyonu
    track = { ShipmentModelList: [{ ShipmentId: '70000', CargoEventLogModelList: [{ CargoEventType: 31, TimeStamp: '03.10.2026 09:00:00' }] }] };
    t = await a.track({ carrier_ref: '70000' });
    assert.equal(t.state, 'returned');
    assert.equal(t.deliveredAt, null);
    track = [];
    t = await a.track({ carrier_ref: '70000' });
    assert.equal(t.state, null);
  } finally { restore(); }
});
