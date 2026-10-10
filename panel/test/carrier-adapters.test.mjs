// Kargo firması bağlantıları: firmaların dokümanlarındaki istek / yanıt biçimleriyle (sahte sunucu) gönderi, etiket, iptal ve takip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kargonomi from '../src/carriers/kargonomi.js';
import * as navlungo from '../src/carriers/navlungo.js';
import * as hepsijet from '../src/carriers/hepsijet.js';
import * as dhl from '../src/carriers/dhl.js';
import * as ptt from '../src/carriers/ptt.js';
import * as surat from '../src/carriers/surat.js';
import * as ups from '../src/carriers/ups.js';
import { senderPlace } from '../src/carriers.js';
import { trackUrl } from '../src/carriers/common.js';

const realFetch = globalThis.fetch;
// routes: [regex (METHOD URL), (req) => body | [status, body]]; istekler kaydedilir
function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const req = { url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body == null ? '' : String(o.body) };
    calls.push(req);
    const r = routes.find(([re]) => re.test(`${req.method} ${req.url}`) || (re.source.startsWith('SOAP:') && new RegExp(re.source.slice(5)).test(req.headers.SOAPAction || '')));
    if (!r) return new Response('not found: ' + req.method + ' ' + req.url, { status: 404 });
    let out = await r[1](req), status = 200;
    if (Array.isArray(out) && typeof out[0] === 'number' && out.length === 2) [status, out] = out;
    const text = typeof out === 'string' ? out : JSON.stringify(out);
    return new Response(text, { status, headers: { 'content-type': typeof out === 'string' && out.startsWith('<') ? 'text/xml' : 'application/json' } });
  };
  return calls;
}
const restore = () => { globalThis.fetch = realFetch; };
const ship = (extra = {}) => ({
  reference: 'TRENDYOL-1001-1', orderNumber: '1001', channel: 'trendyol', desi: 2.4, value: 300, currency: 'TRY',
  receiver: { name: 'Ayşe Yılmaz', phone: '+90 532 123 45 67', email: 'ayse@example.com', address: 'Caferağa Mah. Moda Cad. No:12 D:3', district: 'Kadıköy', city: 'İstanbul', postalCode: '', country: 'TR' },
  sender: { name: 'HasTürk Gübre', phone: '0332 000 00 00', address: 'Sanayi Cd. No 1', district: 'Selçuklu', city: 'Konya' },
  items: [{ name: 'Gübre 5 kg', sku: 'G5', barcode: '869', qty: 2, unitPrice: 150 }], ...extra,
});
const soapOk = (inner) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;

test('gönderen il / ilçe: Ayarlar\'daki tek alandan ayrılır', () => {
  assert.deepEqual(senderPlace({ city: 'Selçuklu / Konya' }), { district: 'Selçuklu', city: 'Konya' });
  assert.deepEqual(senderPlace({ city: 'Selçuklu, Konya' }), { district: 'Selçuklu', city: 'Konya' });
  assert.deepEqual(senderPlace({ city: 'Konya' }), { district: '', city: 'Konya' });
  assert.equal(trackUrl('Aras Kargo', '123'), 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code=123');
  assert.equal(trackUrl('hepsijet', 'X1'), 'https://www.hepsijet.com/gonderi-takibi/X1');
});

test('Kargonomi: il / ilçe numarası bulunur, taslak → en ucuz firma → takip no + PDF etiket; takip ve iptal', async () => {
  const calls = mock([
    [/GET .*\/states$/, () => ({ data: [{ id: 34, name: 'İSTANBUL' }, { id: 42, name: 'KONYA' }] })],
    [/GET .*\/cities\/34$/, () => ({ data: [{ id: 828, name: 'ÜSKÜDAR' }, { id: 830, name: 'KADIKÖY' }] })],
    [/GET .*\/warehouses$/, () => ({ data: [{ id: 5, is_main: 0 }, { id: 12707, is_main: 1 }] })],
    [/POST .*\/shipments$/, () => ({ id: 77, status: 'draft' })],
    [/POST .*\/confirm-shipping-price$/, () => ({ shipping_provider_with_price: [] })],
    [/GET .*\/shipments\/77$/, () => ({ data: { id: 77, status: 'webservice_order_created', status_label: 'Kargo Siparişi Oluşturuldu', shipping_webservice_tracking_code: '5551234', shipping_provider_name: 'Aras Kargo', shipping_provider_slug: 'aras', estimated_price: '45.5000' } })],
    [/GET .*\/shipments\/77\/barcode/, () => ({ data: { barcode: 'JVBERi0xLjQK' + 'A'.repeat(200) } })],
    [/POST .*\/shipments\/cancel$/, () => ({ message: 'iptal talebiniz alındı', shipment_id: 77 })],
    [/GET .*\/user\/credit$/, () => ({ data: { credit: 122.8 } })],
  ]);
  try {
    const a = kargonomi.make({ KARGONOMI_API_KEY: 'tok' });
    assert.match((await a.test()).message, /bakiye 122,8/);
    const r = await a.create(ship());
    const body = JSON.parse(calls.find((c) => /POST .*\/shipments$/.test(`${c.method} ${c.url}`)).body).shipment;
    assert.equal(body.buyer_state_id, 34);
    assert.equal(body.buyer_city_id, 830);
    assert.equal(body.warehouse_id, 12707, 'ana depo');
    assert.equal(body.buyer_phone, '5321234567');
    assert.equal(body.packages[0].desi, 2.4);
    assert.equal(JSON.parse(calls.find((c) => /confirm/.test(c.url)).body).shipping_provider_id, -1);
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
    assert.equal(r.ref, '77');
    assert.equal(r.tracking, '5551234');
    assert.equal(r.carrier, 'Aras Kargo');
    assert.equal(r.cost, 45.5);
    assert.match(r.trackingUrl, /araskargo.*5551234/);
    assert.equal(r.label.format, 'pdf');
    const t = await a.track({ carrier_ref: '77' });
    assert.equal(t.state, 'created');
    await a.cancel('77');
    // Bulunamayan ilçe: açıklamalı hata
    await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, district: 'Yokilçe' } })), /ilçesi bulunamadı/);
  } finally { restore(); }
});

test('Navlungo: token → gönderi (adres no, telefon biçimi) → takip no ve etiket hazır olunca alınır; aynı referans tekrarında mevcut gönderi kullanılır', async () => {
  let n = 0;
  const calls = mock([
    [/POST .*\/auth\/api$/, () => ({ status: true, data: { access_token: 'jwt-1', expires_in: '2030-01-01 00:00:00' } })],
    [/POST .*\/post\/create$/, () => (n++ ? [422, { status: false, message: 'Doğrulama Hatası', error: { 'posts.0.reference_id': ['Bu gönderi numarası zaten mevcuttur.'] } }] : { status: true, data: [{ post_number: 'MFYS1', tracking_url: 'https://domestic-track.navlungo.com/check/MFYS1', post: { carrier_name: 'Sürat Kargo' } }] })],
    [/GET .*\/post\/check\//, () => ({ status: true, data: { post_number: 'MFYS1', carrier_tracking_code: '07414623015915', carrier_tracking_url: 'https://suratkargo.com.tr/KargoTakip/07414623015915', barcode_status: 1, post: { carrier_name: 'Sürat Kargo', post: { post_price: 41.76 } }, status: { status_code: 16, status_name: 'Teslim Alındı' } } })],
    [/POST .*\/barcode\/getBarcode$/, () => ({ status: true, data: { barcode_pdf: 'JVBERi0x' + 'B'.repeat(200) } })],
    [/POST .*\/post\/cancel$/, () => ({ status: true, message: 'Gönderi başarıyla iptal edilmiştir.' })],
  ]);
  try {
    const a = navlungo.make({ NAVLUNGO_USER: 'u', NAVLUNGO_PASSWORD: 'p', NAVLUNGO_ADDRESS_ID: '150' });
    const r = await a.create(ship());
    const post = JSON.parse(calls.find((c) => /post\/create/.test(c.url)).body).posts[0];
    assert.equal(post.sender.addressId, 150);
    assert.equal(post.recipient.phone, '+90 532 123 45 67');
    assert.equal(post.recipient.district, 'Kadıköy');
    assert.equal(post.carrier_id, 1);
    assert.equal(calls.find((c) => /post\/create/.test(c.url)).headers.Authorization, 'Bearer jwt-1');
    assert.equal(r.ref, 'MFYS1');
    assert.equal(r.tracking, '07414623015915');
    assert.equal(r.carrier, 'Sürat Kargo');
    assert.equal(r.cost, 41.76);
    assert.equal(r.label.format, 'pdf');
    // Yanıtı kaybolmuş gönderi yeniden açılırsa (aynı referans) hata yerine mevcut gönderi döner
    const again = await a.create(ship());
    assert.equal(again.ref, 'MFYS1');
    assert.equal((await a.track({ carrier_ref: 'MFYS1' })).state, 'transit');
    await a.cancel('MFYS1');
  } finally { restore(); }
});

test('HepsiJET: token (Basic) → gönderi ve ZPL etiket aynı yanıtta; takip "teslim edildi"; hata gövdesi okunur', async () => {
  const calls = mock([
    [/GET .*\/auth\/getToken$/, () => ({ status: 'OK', data: { token: 'tk-1' } })],
    [/POST .*\/sendDeliveryOrderEnhanced$/, (q) => ({ status: 'OK', data: { customerDeliveryNo: JSON.parse(q.body).delivery.customerDeliveryNo, zplBarcodeDTOList: [{ zplBarcode: '^XA^FDtest^FS^XZ' }] } })],
    [/POST .*\/integration\/track$/, () => ({ status: 'OK', data: [{ barcode: 'X', trackingUrl: 'https://hepsiexpress.com/gonderi-takibi/X', details: [{ integrationStatus: 'ACCEPTED', transactionDate: '2026-10-01T10:00:00+03:00' }, { integrationStatus: 'DELIVERED', transactionDate: '2026-10-02T12:53:29+03:00' }] }] })],
    [/POST .*\/deleteDeliveryOrder\//, () => ({ status: 'OK', message: 'Delivery has been deleted successfully' })],
  ]);
  try {
    const a = hepsijet.make({ HEPSIJET_USER: 'u', HEPSIJET_PASSWORD: 'p', HEPSIJET_COMPANY: 'etf', HEPSIJET_WAREHOUSE: 'MRHP_SANCAKTEPE' });
    const r = await a.create(ship());
    const req = calls.find((c) => /sendDeliveryOrderEnhanced/.test(c.url)), b = JSON.parse(req.body);
    assert.equal(calls[0].headers.Authorization, 'Basic ' + btoa('u:p'));
    assert.equal(req.headers['X-Auth-Token'], 'tk-1');
    assert.match(b.delivery.customerDeliveryNo, /^ETF\d{10}$/);
    assert.equal(b.delivery.receiver.firstName, 'Ayşe');
    assert.equal(b.delivery.receiver.lastName, 'Yılmaz');
    assert.equal(b.delivery.recipientAddress.town.name, 'KADIKÖY');
    assert.equal(b.delivery.senderAddress.town.name, 'SELÇUKLU');
    assert.equal(b.currentXDock.abbreviationCode, 'MRHP_SANCAKTEPE');
    assert.equal(r.tracking, b.delivery.customerDeliveryNo);
    assert.equal(r.label.format, 'zpl');
    const t = await a.track({ carrier_ref: r.ref });
    assert.equal(t.state, 'delivered');
    assert.equal(t.trackingUrl, 'https://www.hepsijet.com/gonderi-takibi/X');
    assert.ok(t.deliveredAt > 0);
    await a.cancel(r.ref);
    // Gönderen ilçesi yoksa açıklamalı hata
    await assert.rejects(a.create(ship({ sender: { ...ship().sender, district: '' } })), /gönderen il ve ilçesini/);
  } finally { restore(); }
  mock([[/GET .*\/auth\/getToken$/, () => ({ status: 'OK', data: { token: 'tk-2' } })], [/POST .*sendDeliveryOrderEnhanced/, () => ({ status: 'FAIL', detailStatus: 'BARCODE_EXIST', message: 'Gönderi numarası sistemde kayıtlı.' })]]);
  try { await assert.rejects(hepsijet.make({ HEPSIJET_USER: 'u2', HEPSIJET_PASSWORD: 'p', HEPSIJET_COMPANY: 'ETF', HEPSIJET_WAREHOUSE: 'X' }).create(ship()), /sistemde kayıtlı.*BARCODE_EXIST/); } finally { restore(); }
});

test('DHL eCommerce: il / ilçe kodları → createOrder → createbarcode (gönderi no + ZPL); şube bekleniyorsa etiket sonra; takip ve iptal', async () => {
  let barcodeTries = 0;
  const calls = mock([
    [/POST .*\/mngapi\/api\/token$/, () => ({ jwt: 'jwt-d' })],
    [/GET .*\/cbsinfoapi\/getcities$/, () => [{ code: '34', name: 'İSTANBUL  34' }, { code: '42', name: 'KONYA' }]],
    [/GET .*\/cbsinfoapi\/getdistricts\/34$/, () => [{ cityCode: '34', code: '61', name: 'KADIKÖY' }]],
    [/POST .*\/standardcmdapi\/createOrder$/, () => [{ orderInvoiceId: '1', referenceId: 'TRENDYOL-1001-1' }]],
    [/POST .*\/barcodecmdapi\/createbarcode$/, () => (barcodeTries++ === 0 ? [500, { error: { Code: '20001', Description: 'VARIŞ ŞUBESİ BULUNAMADI' } }] : [{ shipmentId: '614118757013', barcodes: [{ pieceNumber: 1, value: '^XA^FD1^FS^XZ', barcode: 'C@6B' }] }])],
    [/GET .*\/getshipmentstatus\//, () => [{ shipmentStatusCode: 5, shipmentId: '614118757013', shipmentStatus: 'Teslim_Edildi', isDelivered: 1, deliveryDateTime: '13-10-2026 14:56' }]],
    [/GET .*\/getshipment\//, () => [{ shipment: { finalTotal: 40.84 } }]],
    [/PUT .*\/cancelshipment$/, () => ''],
    [/PUT .*\/cancelorder\//, () => ''],
  ]);
  try {
    const a = dhl.make({ DHL_CLIENT_ID: 'cid', DHL_CLIENT_SECRET: 'sec', DHL_CUSTOMER_NO: '312947702', DHL_PASSWORD: 'pw' });
    const r = await a.create(ship());
    const ord = JSON.parse(calls.find((c) => /createOrder/.test(c.url)).body);
    assert.equal(ord.order.referenceId, 'TRENDYOL-1001-1');
    assert.equal(ord.recipient.cityCode, 34);
    assert.equal(ord.recipient.districtCode, 61);
    assert.equal(ord.recipient.mobilePhoneNumber, '5321234567');
    assert.equal(ord.orderPieceList[0].desi, 3, 'desi tam sayıya yuvarlanır');
    assert.equal(calls.find((c) => /createOrder/.test(c.url)).headers['X-IBM-Client-Id'], 'cid');
    assert.equal(calls.find((c) => /createOrder/.test(c.url)).headers.Authorization, 'Bearer jwt-d');
    assert.equal(r.ref, 'TRENDYOL-1001-1');
    assert.equal(r.tracking, '614118757013', 'şube ilk denemede bulunamadı, ikinci denemede gönderi açıldı');
    assert.equal(r.label.format, 'zpl');
    const t = await a.track({ carrier_ref: r.ref });
    assert.equal(t.state, 'delivered');
    assert.equal(t.cost, 40.84);
    await a.cancel(r.ref);
    assert.ok(calls.some((c) => /cancelshipment/.test(c.url)) && calls.some((c) => /cancelorder\/TRENDYOL-1001-1/.test(c.url)));
  } finally { restore(); }
});

test('PTT: barkod aralığından sıradaki numara + kontrol hanesi; veri yükleme yanıtı ve takip okunur; aralık dolunca uyarı', async () => {
  assert.equal(ptt.pttCheckDigit('275036569845'), '6');
  let seq = -1;
  const db = { prepare: (sql) => ({ bind: (k) => ({ first: async () => { assert.match(sql, /RETURNING v/); assert.equal(k, 'ptt_barcode_seq:275036569845'); return { v: String(++seq) }; } }) }) };
  const calls = mock([
    [/SOAP:urn:kabulEkle2/, () => soapOk('<ns:kabulEkle2Response xmlns:ns="http://kabul.ptt.gov.tr"><ns:return xmlns:ax21="http://kabul.ptt.gov.tr/xsd"><ax21:aciklama>BASARILI</ax21:aciklama><ax21:dongu><ax21:barkod></ax21:barkod><ax21:donguAciklama>https://pttws.ptt.gov.tr/ReferansSorgu/x?guid=1</ax21:donguAciklama><ax21:donguHataKodu>1</ax21:donguHataKodu><ax21:donguSonuc>true</ax21:donguSonuc></ax21:dongu><ax21:hataKodu>1</ax21:hataKodu></ns:return></ns:kabulEkle2Response>')],
    [/SOAP:urn:gonderiSorgu2/, () => soapOk('<ns:gonderiSorgu2Response xmlns:ns="http://takip.ptt.gov.tr"><ns:return xmlns:ax21="http://takip.ptt.gov.tr/xsd"><ax21:BARNO>2750365698456</ax21:BARNO><ax21:TESALAN>AYŞE</ax21:TESALAN><ax21:dongu><ax21:ISLEM>Kabul Edildi</ax21:ISLEM><ax21:ITARIH>01/10/2026</ax21:ITARIH><ax21:siraNo>1</ax21:siraNo></ax21:dongu><ax21:dongu><ax21:ISLEM>Teslim Edildi</ax21:ISLEM><ax21:ITARIH>03/10/2026</ax21:ITARIH><ax21:siraNo>2</ax21:siraNo></ax21:dongu><ax21:sonucKodu>10</ax21:sonucKodu></ns:return></ns:gonderiSorgu2Response>')],
    [/SOAP:urn:barkodVeriSil/, () => soapOk('<ns:barkodVeriSilResponse xmlns:ns="http://kabul.ptt.gov.tr"><ns:return><ax21:aciklama xmlns:ax21="x">1 adet kayit silindi.</ax21:aciklama><ax21:hataKodu xmlns:ax21="x">1</ax21:hataKodu></ns:return></ns:barkodVeriSilResponse>')],
  ]);
  try {
    const a = ptt.make({ PTT_CUSTOMER_NO: '123456789', PTT_PASSWORD: 's', PTT_BARCODE_START: '275036569845', PTT_BARCODE_END: '275036569846' }, { db });
    const r = await a.create(ship());
    assert.equal(r.tracking, '2750365698456');
    assert.match(r.ref, /^2750365698456\|TRENDYOL-1001-1-\d{14}$/);
    assert.match(r.trackingUrl, /guid=1/);
    const x = calls[0].body;
    assert.match(x, /<xsd:aliciIlceAdi>KADIKÖY<\/xsd:aliciIlceAdi>/);
    assert.match(x, /<xsd:aliciSms>5321234567<\/xsd:aliciSms>/);
    assert.match(x, /<xsd:agirlik>2400<\/xsd:agirlik>/);
    assert.match(x, /<xsd:kullanici>PttWs<\/xsd:kullanici>/);
    assert.ok(x.indexOf('<xsd:dongu>') < x.indexOf('<xsd:dosyaAdi>'), 'alanlar WSDL sırasıyla');
    assert.equal((await a.create(ship())).tracking, '275036569846' + ptt.pttCheckDigit('275036569846'));
    await assert.rejects(a.create(ship()), /barkod aralığı doldu/);
    const t = await a.track({ tracking: '2750365698456', carrier_ref: r.ref });
    assert.equal(t.state, 'delivered');
    await a.cancel(r.ref);
    assert.match(calls.at(-1).body, /<xsd:dosyaAdi>TRENDYOL-1001-1-\d{14}<\/xsd:dosyaAdi>/);
  } finally { restore(); }
});

test('Sürat: ön kabul (OzelKargoTakipNo barkod olur), "Tamam" / zaten var kabul edilir; takipte Sürat takip numarası gelir', async () => {
  let res = 'Tamam';
  const calls = mock([
    [/SOAP:GonderiyiKargoyaGonderYeni/, () => soapOk(`<GonderiyiKargoyaGonderYeniResponse xmlns="http://tempuri.org/"><GonderiyiKargoyaGonderYeniResult>${res}</GonderiyiKargoyaGonderYeniResult></GonderiyiKargoyaGonderYeniResponse>`)],
    [/POST .*KargoTakipHareketDetayi/, () => ({ IsError: false, Gonderiler: [{ KargoTakipNo: '07414623015915', TakipUrl: 'https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=07414623015915', KargonunDurumu: 'Teslim Edildi', KargonunDurumuSayi: 6, TeslimTarihi: '05.10.2026 14:10' }] })],
  ]);
  try {
    const a = surat.make({ SURAT_USER: '1038106246', SURAT_PASSWORD: '123456' });
    const r = await a.create(ship());
    assert.equal(r.ref, 'TRENDYOL-1001-1');
    assert.equal(r.barcode, 'TRENDYOL-1001-1');
    assert.match(calls[0].body, /<TelefonCep>05321234567<\/TelefonCep>/);
    assert.match(calls[0].body, /<OzelKargoTakipNo>TRENDYOL-1001-1<\/OzelKargoTakipNo>/);
    assert.match(calls[0].body, /<BirimDesi>3<\/BirimDesi>/);
    res = '009';
    assert.equal((await a.create(ship())).ref, 'TRENDYOL-1001-1', 'zaten var: aynı gönderi');
    res = '001';
    await assert.rejects(a.create(ship()), /cari kod\) veya şifre yanlış/);
    const t = await a.track({ carrier_ref: 'TRENDYOL-1001-1' });
    assert.equal(t.state, 'delivered');
    assert.equal(t.tracking, '07414623015915');
    assert.match(calls.at(-1).url, /CariKodu=1038106246&Sifre=123456&WebSiparisKodu=TRENDYOL-1001-1/);
    await assert.rejects(a.cancel('X'), /web servis şifresi gerekir/);
  } finally { restore(); }
});

test('UPS: oturum → gönderi (il plaka + UPS bölge kodu) → 1Z takip no + PNG etiket; düşen oturumda yeniden giriş; takip', async () => {
  let created = 0;
  const calls = mock([
    [/SOAP:wsCreateShipment\/Login_Type1/, () => soapOk('<Login_Type1Response xmlns="https://ws.ups.com.tr/wsCreateShipment"><Login_Type1Result><SessionID>AB98-1</SessionID><ErrorCode>0</ErrorCode><ErrorDefinition/></Login_Type1Result></Login_Type1Response>')],
    [/SOAP:wsCreateShipment\/CreateShipment_Type3/, () => soapOk(created++ === 0
      ? '<CreateShipment_Type3Response xmlns="https://ws.ups.com.tr/wsCreateShipment"><CreateShipment_Type3Result><ShipmentNo /><ErrorCode>12</ErrorCode><ErrorDefinition>TOKEN DECODE ERROR</ErrorDefinition></CreateShipment_Type3Result></CreateShipment_Type3Response>'
      : '<CreateShipment_Type3Response xmlns="https://ws.ups.com.tr/wsCreateShipment"><CreateShipment_Type3Result><ShipmentNo>1ZGEVREK6800813639</ShipmentNo><BarkodArrayPng><string>iVBORw0KGgoAAAA</string></BarkodArrayPng><ErrorCode>0</ErrorCode><ErrorDefinition/></CreateShipment_Type3Result></CreateShipment_Type3Response>')],
    [/SOAP:wsPaketIslemSorgulamaEng\/Login_V1/, () => soapOk('<Login_V1Response xmlns="https://ws.ups.com.tr/wsPaketIslemSorgulamaEng/"><Login_V1Result><SessionID>Q-1</SessionID><ErrorCode>0</ErrorCode></Login_V1Result></Login_V1Response>')],
    [/SOAP:GetTransactionsByTrackingNumber_V1/, () => soapOk('<GetTransactionsByTrackingNumber_V1Response xmlns="https://ws.ups.com.tr/wsPaketIslemSorgulamaEng/"><GetTransactionsByTrackingNumber_V1Result><PackageTransaction><ProcessTimeStamp>20261002-101500</ProcessTimeStamp><StatusCode>2</StatusCode><ProcessDescription1>ALICIYA TESLİM EDİLDİ</ProcessDescription1><RecordId>2</RecordId><ErrorCode>0</ErrorCode></PackageTransaction><PackageTransaction><ProcessTimeStamp>20261001-090000</ProcessTimeStamp><StatusCode>1</StatusCode><RecordId>1</RecordId><ErrorCode>0</ErrorCode></PackageTransaction></GetTransactionsByTrackingNumber_V1Result></GetTransactionsByTrackingNumber_V1Response>')],
  ]);
  try {
    assert.deepEqual(ups.upsPlace('Konya', 'Selçuklu'), { city: 42, area: 1918 });
    assert.deepEqual(ups.upsPlace('İstanbul', 'Kadıköy'), { city: 34, area: 457 });
    const a = ups.make({ UPS_CUSTOMER_NO: 'GEVREK', UPS_USER: 'u', UPS_PASSWORD: 'p' });
    const r = await a.create(ship());
    assert.equal(r.tracking, '1ZGEVREK6800813639');
    assert.deepEqual(r.label, { format: 'png', data: 'iVBORw0KGgoAAAA' });
    const body = calls.filter((c) => /CreateShipment_Type3/.test(c.headers.SOAPAction)).at(-1).body;
    assert.equal(calls.filter((c) => /Login_Type1/.test(c.headers.SOAPAction)).length, 2, 'düşen oturumda yeniden giriş');
    assert.match(body, /<ConsigneeCityCode>34<\/ConsigneeCityCode><ConsigneeAreaCode>457<\/ConsigneeAreaCode>/);
    assert.match(body, /<ShipperCityCode>42<\/ShipperCityCode><ShipperAreaCode>1918<\/ShipperAreaCode>/);
    assert.match(body, /<Weight>2.4<\/Weight>/);
    assert.ok(body.indexOf('<ServiceLevel>') < body.indexOf('<PackageDimensions>'), 'WSDL sırası');
    const t = await a.track({ tracking: r.tracking });
    assert.equal(t.state, 'delivered');
    assert.ok(t.deliveredAt > 0);
    await assert.rejects(a.create(ship({ receiver: { ...ship().receiver, district: 'Yokilçe' } })), /UPS bölge listesinde bulunamadı/);
  } finally { restore(); }
});
