// Sendeo bağlantısı: Web Servis Teknik Dokümanı V.9'daki istek / yanıt biçimleriyle (sahte sunucu) token, iş emri, etiket, iptal ve takip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sendeo from '../src/carriers/sendeo.js';

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
  receiver: { name: 'Ayşe Yılmaz', phone: '+90 532 123 45 67', email: 'ayse@example.com', address: 'Caferağa Mah. Moda Cad. No:12 D:3', district: 'Kadıköy', city: 'İstanbul', postalCode: '', country: 'TR' },
  sender: { name: 'HasTürk Gübre', phone: '0532 000 00 00', address: 'Sanayi Cd. No 1', district: 'Selçuklu', city: 'Konya' },
  items: [{ name: 'Gübre 5 kg', sku: 'G5', barcode: '869', qty: 2, unitPrice: 150 }], ...extra,
});
const login = () => ({ StatusCode: 200, result: { Token: 'jwt-1', CustomerId: 99 }, exceptionMessage: null });
let n = 0;
const vals = () => ({ SENDEO_USER: 'musteri' + (++n), SENDEO_PASSWORD: 'sifre' }); // her testte yeni token önbelleği

test('Sendeo: il plakası + ilçe adı → Sendeo ilçe kodu (doküman listesi)', () => {
  assert.deepEqual(sendeo.districtId('İstanbul', 'Kadıköy'), { cityId: 34, districtId: 1069210 });
  assert.deepEqual(sendeo.districtId('KONYA', 'SELÇUKLU'), { cityId: 42, districtId: 1069032 });
  assert.equal(sendeo.districtId('Konya', '').districtId > 0, true, 'ilçe yoksa il merkezi');
  assert.equal(sendeo.districtId('İzmir', 'Hayali').districtId, 0);
  assert.equal(sendeo.districtId('Atlantis', 'x').cityId, 0);
});

test('Sendeo: LoginAES token → SETDELIVERY (DeliveryType 1, il / ilçe kodları, ZPL) → takip no + etiket', async () => {
  const calls = mock([
    [/POST .*\/api\/Token\/LoginAES$/, () => login()],
    [/POST .*\/api\/Cargo\/SETDELIVERY$/, () => ({ StatusCode: 200, result: { TrackingNumber: '9124356789047', TrackingUrl: 'https://sube.sendeo.com.tr/takip?ccode=1&musref=TRTRENDYOL10011', BarcodeZpl: '^XA^FDtest^FS^XZ', BarcodeNumbers: '8880001,8880002' } })],
  ]);
  try {
    const r = await sendeo.make(vals()).create(ship());
    const lg = calls[0], q = calls.find((c) => /SETDELIVERY/.test(c.url)), b = JSON.parse(q.body);
    assert.match(lg.url, /^https:\/\/api\.sendeo\.com\.tr\/api\/Token\/LoginAES$/);
    assert.deepEqual(JSON.parse(lg.body), { musteri: 'musteri' + n, sifre: 'sifre' });
    assert.equal(q.headers.Authorization, 'Bearer jwt-1');
    assert.equal(b.DeliveryType, 1);
    assert.equal(b.ReferenceNo, 'TRTRENDYOL10011');
    assert.equal(b.ReceiverCityId, 34);
    assert.equal(b.ReceiverDistrictId, 1069210);
    assert.equal(b.SenderCityId, 42);
    assert.equal(b.SenderDistrictId, 1069032);
    assert.equal(b.receiverPhone, '5321234567');
    assert.equal(b.ReceiverGSM, '5321234567');
    assert.equal(b.Receiver, 'Ayşe Yılmaz');
    assert.match(b.ReceiverAddress, /Kadıköy İstanbul$/);
    assert.equal(b.PaymentType, 1);
    assert.equal(b.CollectionType, 0);
    assert.equal(b.CollectionPrice, 0);
    assert.equal(b.ServiceType, 1);
    assert.equal(b.barcodeLabelType, 2);
    assert.deepEqual(b.products.map((p) => [p.Count, p.Deci]), [[1, 3]]);
    assert.equal(r.ref, 'TRTRENDYOL10011');
    assert.equal(r.tracking, '9124356789047');
    assert.equal(r.barcode, '8880001');
    assert.match(r.trackingUrl, /sube\.sendeo\.com\.tr\/takip/);
    assert.deepEqual(r.label, { format: 'zpl', data: '^XA^FDtest^FS^XZ' });
  } finally { restore(); }
});

test('Sendeo: etiket yanıtta yoksa GETBARCODE ile alınır; test ortamı; LoginAES yoksa Login', async () => {
  const calls = mock([
    [/POST .*\/api\/Token\/LoginAES$/, () => [404, 'Not Found']],
    [/POST .*\/api\/Token\/Login$/, () => login()],
    [/POST .*\/api\/Cargo\/SETDELIVERY$/, () => ({ StatusCode: 200, result: { TrackingNumber: '777' } })],
    [/POST .*\/api\/Cargo\/GETBARCODE/, () => ({ StatusCode: 200, result: { TrackingNumber: '777', BarcodeZpls: ['^XA^FD1^XZ', '^XA^FD2^XZ'] } })],
  ]);
  try {
    const r = await sendeo.make({ ...vals(), SENDEO_ENV: 'test' }).create(ship());
    assert.match(calls[0].url, /^https:\/\/api-dev\.sendeo\.com\.tr\//);
    const g = calls.find((c) => /GETBARCODE/.test(c.url));
    assert.match(g.url, /referenceNo=TRTRENDYOL10011/);
    assert.deepEqual(JSON.parse(g.body), { barcodeLabelType: 2, referenceNo: 'TRTRENDYOL10011' });
    assert.equal(r.label.data, '^XA^FD1^XZ\n^XA^FD2^XZ');
    assert.equal(r.trackingUrl, 'https://www.sendeo.com.tr/gonderi-takip?code=777');
  } finally { restore(); }
});

test('Sendeo: hata mesajları (500 + ExceptionMessage, şifre hatalı, ilçe bulunamadı), süresi dolan token yenilenir', async () => {
  mock([[/LoginAES$/, () => [400, { StatusCode: 400, exceptionMessage: 'Kullanıcı adı veya şifre hatalı' }]]]);
  try { await assert.rejects(sendeo.make(vals()).test(), /müşteri adı veya şifresi hatalı/); } finally { restore(); }
  await assert.rejects(sendeo.make(vals()).create(ship({ receiver: { ...ship().receiver, district: 'Hayalköy' } })), /ilçesi Sendeo listesinde bulunamadı/);
  await assert.rejects(sendeo.make(vals()).create(ship({ sender: { ...ship().sender, district: '', city: '' } })), /gönderen il ve ilçesini/);
  mock([[/LoginAES$/, () => login()], [/SETDELIVERY$/, () => [500, { RequestId: 'f1d6', ExceptionMessage: 'Receiver District Id is Not Correct.', StatusCode: 206 }]]]);
  try { await assert.rejects(sendeo.make(vals()).create(ship()), /Receiver District Id is Not Correct/); } finally { restore(); }
  let logins = 0, first = true;
  const calls = mock([[/LoginAES$/, () => { logins++; return { StatusCode: 200, result: { Token: 'jwt-' + logins } }; }],
    [/TRACKDELIVERY/, (q) => { if (first) { first = false; return [401, 'Unauthorized']; } return { StatusCode: 200, result: { TrackingNo: 912345678, State: 101, StateText: 'İş Emri Alındı' } }; }]]);
  try {
    const t = await sendeo.make(vals()).track({ carrier_ref: 'REF1' });
    assert.equal(logins, 2);
    assert.equal(calls.filter((c) => /TRACKDELIVERY/.test(c.url)).pop().headers.Authorization, 'Bearer jwt-2');
    assert.equal(t.state, 'created');
  } finally { restore(); }
});

test('Sendeo: takip (teslim / iade / yolda, ücret, teslim zamanı) ve iptal (702 kayıt yok, 703 toplandı)', async () => {
  let res = { TrackingNo: 912345678, ReferenceNo: 'REF1', State: 111, StateText: 'Teslim Edildi', UpdateDate: '04/02/2022 10:00:27', CargoAmount: 10.03, statusHistories: [{ StatusDate: '03/02/2022 09:00:00', StatusId: '105', Status: 'TM Hat Yükleme' }] };
  let cancel = () => ({ StatusCode: 200, result: { IsSuccess: true } });
  const calls = mock([[/LoginAES$/, () => login()], [/TRACKDELIVERY/, () => ({ StatusCode: 200, result: res })], [/CANCELDELIVERY/, () => cancel()]]);
  try {
    const a = sendeo.make(vals());
    let t = await a.track({ carrier_ref: 'REF1' });
    assert.match(calls.find((c) => /TRACKDELIVERY/.test(c.url)).url, /\/api\/Cargo\/TRACKDELIVERY\?referenceNo=REF1$/);
    assert.equal(calls.find((c) => /TRACKDELIVERY/.test(c.url)).method, 'GET');
    assert.equal(t.state, 'delivered');
    assert.equal(t.tracking, '912345678');
    assert.equal(t.cost, 10.03);
    assert.equal(t.deliveredAt, Date.parse('2022-02-04T10:00:27+03:00'));
    res = { ...res, State: 151, StateText: 'İade Olarak Teslim' };
    assert.equal((await a.track({ carrier_ref: 'REF1' })).state, 'returned');
    res = { TrackingNo: 1, State: 109, StateText: 'Dağıtıma Çıkarıldı' };
    t = await a.track({ carrier_ref: 'REF1' });
    assert.equal(t.state, 'transit');
    assert.equal(t.deliveredAt, null);
    res = { TrackingNo: 1, State: 133 };
    assert.equal((await a.track({ carrier_ref: 'REF1' })).state, 'cancelled');
    await a.cancel('REF1');
    const c = calls.find((x) => /CANCELDELIVERY/.test(x.url));
    assert.equal(c.method, 'POST');
    assert.match(c.url, /CANCELDELIVERY\?referenceNo=REF1$/);
    cancel = () => [500, { ExceptionMessage: 'No Delivery Found.', StatusCode: 702 }];
    await a.cancel('REF1');
    cancel = () => [500, { ExceptionMessage: 'You Cannot Cancel , Delivery Has Already Sent.', StatusCode: 703 }];
    await assert.rejects(a.cancel('REF1'), /toplandığı için iptal edilemiyor/);
  } finally { restore(); }
});
