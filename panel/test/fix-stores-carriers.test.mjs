// Kargo düzeltmeleri: PTT büyük harf (İ) durumları, "teslim alınmayı bekliyor", kapıda ödeme engeli, iptalden sonra yeni referans
// (deneme eki; DHL 3002 / Yurtiçi 60020 iptal edilmiş kayıt), Kargonomi fiyat onayı sonrası hata → taslak iptali, ücretin KDV bilgisi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import * as ptt from '../src/carriers/ptt.js';
import * as dhl from '../src/carriers/dhl.js';
import * as yurtici from '../src/carriers/yurtici.js';
import * as kargonomi from '../src/carriers/kargonomi.js';
import { stateOf } from '../src/carriers/common.js';
import { shipmentOf, codBlocked, withAttempt } from '../src/carriers.js';

const realFetch = globalThis.fetch;
function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const req = { url: String(url), method: o.method || 'GET', headers: o.headers || {}, body: o.body == null ? '' : String(o.body) };
    calls.push(req);
    const r = routes.find(([re]) => re.test(`${req.method} ${req.url}`) || (re.source.startsWith('SOAP:') && new RegExp(re.source.slice(5)).test(req.headers.SOAPAction || '')));
    if (!r) return new Response('not found', { status: 404 });
    let out = await r[1](req), status = 200;
    if (Array.isArray(out) && typeof out[0] === 'number' && out.length === 2) [status, out] = out;
    const text = typeof out === 'string' ? out : JSON.stringify(out);
    return new Response(text, { status, headers: { 'content-type': typeof out === 'string' && out.startsWith('<') ? 'text/xml' : 'application/json' } });
  };
  return calls;
}
const restore = () => { globalThis.fetch = realFetch; };
const soapOk = (inner) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;
const ship = (extra = {}) => ({
  reference: 'TRENDYOL-1001-1', orderNumber: '1001', channel: 'trendyol', desi: 2, value: 300, currency: 'TRY',
  receiver: { name: 'Ayşe Yılmaz', phone: '+90 532 123 45 67', email: 'a@x.com', address: 'Caferağa Mah. Moda Cad. No:12', district: 'Kadıköy', city: 'İstanbul', postalCode: '', country: 'TR' },
  sender: { name: 'HasTürk', phone: '0332', address: 'Sanayi', district: 'Selçuklu', city: 'Konya' }, items: [{ name: 'Gübre', qty: 1, unitPrice: 300 }], ...extra,
});

test('PTT takip: büyük harfli Türkçe durumlar (TESLİM EDİLDİ, İADE) doğru okunur; iade teslimden önce', async () => {
  const resp = (islem, tesalan = '') => soapOk(`<ns:gonderiSorgu2Response xmlns:ns="http://takip.ptt.gov.tr"><ns:return xmlns:ax21="http://takip.ptt.gov.tr/xsd"><ax21:BARNO>275</ax21:BARNO><ax21:TESALAN>${tesalan}</ax21:TESALAN><ax21:dongu><ax21:ISLEM>${islem}</ax21:ISLEM><ax21:ITARIH>03/10/2026</ax21:ITARIH><ax21:siraNo>1</ax21:siraNo></ax21:dongu><ax21:sonucKodu>10</ax21:sonucKodu></ns:return></ns:gonderiSorgu2Response>`);
  let body = '';
  mock([[/SOAP:urn:gonderiSorgu2/, () => body]]);
  try {
    const a = ptt.make({ PTT_CUSTOMER_NO: '1', PTT_PASSWORD: 'p' });
    body = resp('TESLİM EDİLDİ'); assert.equal((await a.track({ tracking: '275' })).state, 'delivered');
    body = resp('GÖNDERİCİYE İADE EDİLDİ', 'HASTÜRK'); assert.equal((await a.track({ tracking: '275' })).state, 'returned', 'iade teslim alanı dolu olsa da iade');
    body = resp('DAĞITIMDA'); assert.equal((await a.track({ tracking: '275' })).state, 'transit');
  } finally { restore(); }
});

test('stateOf: "teslim alınmayı bekliyor" yolda sayılır (oluşturuldu değil)', () => {
  assert.equal(stateOf('TESLİM ALINMAYI BEKLİYOR'), 'transit');
  assert.equal(stateOf('Şubede teslim alınması bekleniyor'), 'transit');
  assert.equal(stateOf('Gönderi kaydı oluşturuldu'), 'created');
  assert.equal(stateOf('Kargo firmasının teslim alması bekleniyor'), 'created');
});

test('kapıda ödemeli siparişte entegratör gönderisi açılmaz (açıklamalı 400)', () => {
  const o = { id: 'o1', order_number: '1001', channel: 'woocommerce', customer: 'Ali', address: { name: 'Ali', line: 'Sk', city: 'Konya' }, items: [] };
  const pkg = { no: 1, items: [] }, sender = { name: 'H', address: 'A' };
  assert.equal(codBlocked(o), '');
  assert.equal(shipmentOf(o, pkg, sender).shipment.reference, '1001-1');
  for (const extra of [{ cod: true }, '{"cod":true}']) {
    assert.throws(() => shipmentOf({ ...o, extra }, pkg, sender), (e) => e.status === 400 && /Kapıda ödemeli sipariş: anlaşmalı kargo entegrasyonuyla gönderilemez; tahsilatlı gönderi için kargo firmasının panelini kullanın/.test(e.message));
  }
});

test('iptal edilen gönderiden sonra yeni gönderi yeni referansla (-R<n>) açılır', async () => {
  const db = d1(); await init(db);
  const s = shipmentOf({ id: 'o9', order_number: '77', channel: 'woocommerce', customer: 'A', address: { name: 'A', line: 'L', city: 'C' }, items: [] }, { no: 2, items: [] }, { name: 'H', address: 'A' }).shipment;
  assert.equal((await withAttempt(db, s)).reference, '77-2', 'ilk gönderi: referans değişmez');
  await db.prepare("INSERT INTO order_events (order_id, at, source, action, note) VALUES ('o9', 1, 'panel', 'carrier-cancel', 'Paket 2: Aras Kargo'), ('o9', 2, 'panel', 'carrier-cancel', 'Paket 1: Aras Kargo')").run();
  assert.equal((await withAttempt(db, s)).reference, '77-2-R1');
  await db.prepare("INSERT INTO order_events (order_id, at, source, action, note) VALUES ('o9', 3, 'panel', 'carrier-cancel', 'Paket 2: Yurtiçi Kargo')").run();
  assert.equal((await withAttempt(db, s)).reference, '77-2-R2');
});

test('DHL 3002: aynı referanslı kayıt iptal edilmişse barkod alınmaz, yeni referansla açılır', async () => {
  const orders = [];
  mock([
    [/POST .*\/mngapi\/api\/token$/, () => ({ jwt: 'j' })],
    [/GET .*\/cbsinfoapi\/getcities$/, () => [{ code: '34', name: 'İSTANBUL' }]],
    [/GET .*\/cbsinfoapi\/getdistricts\/34$/, () => [{ code: '61', name: 'KADIKÖY' }]],
    [/POST .*\/standardcmdapi\/createOrder$/, (q) => { const ref = JSON.parse(q.body).order.referenceId; orders.push(ref); return ref === 'TRENDYOL-1001-1' ? [400, { error: { Code: '3002', Description: 'Bu referans ile kayıt var' } }] : [{ referenceId: ref }]; }],
    [/GET .*\/getshipmentstatus\//, () => [{ shipmentStatus: 'IPTAL_EDILDI', shipmentId: '' }]],
    [/POST .*\/barcodecmdapi\/createbarcode$/, (q) => [{ shipmentId: 'S-' + JSON.parse(q.body).referenceId, barcodes: [] }]],
  ]);
  try {
    const r = await dhl.make({ DHL_CLIENT_ID: 'c', DHL_CLIENT_SECRET: 's', DHL_CUSTOMER_NO: 'fix1', DHL_PASSWORD: 'p' }).create(ship());
    assert.equal(orders.length, 2);
    assert.match(r.ref, /^TRENDYOL-1001-1-R[0-9A-Z]{1,4}$/);
    assert.equal(r.tracking, 'S-' + r.ref, 'barkod yeni referansa');
  } finally { restore(); }
});

test('Yurtiçi 60020: var olan gönderi iptal edilmişse yeni anahtarla açılır; iptal edilmemişse o kullanılır', async () => {
  const YK = (inner) => soapOk(`<ns1:x xmlns:ns1='http://yurticikargo.com.tr/ShippingOrderDispatcherServices'>${inner}</ns1:x>`);
  const keys = [];
  let status = 'CNL';
  mock([[/POST .*ShippingOrderDispatcherServices/, (q) => {
    if (/createShipment/.test(q.body)) {
      const k = /<cargoKey>([^<]+)</.exec(q.body)[1]; keys.push(k);
      return YK(keys.length === 1 ? '<ShippingOrderResultVO><outFlag>1</outFlag><shippingOrderDetailVO><errCode>60020</errCode><errMessage>mevcut</errMessage></shippingOrderDetailVO></ShippingOrderResultVO>' : '<ShippingOrderResultVO><outFlag>0</outFlag><shippingOrderDetailVO><cargoKey>K</cargoKey></shippingOrderDetailVO></ShippingOrderResultVO>');
    }
    return YK(`<ShippingDeliveryVO><outFlag>0</outFlag><shippingDeliveryDetailVO><operationStatus>${status}</operationStatus></shippingDeliveryDetailVO></ShippingDeliveryVO>`);
  }]]);
  try {
    const a = yurtici.make({ YURTICI_USER: 'u', YURTICI_PASSWORD: 'p' });
    const r = await a.create(ship());
    assert.equal(keys.length, 2); assert.notEqual(keys[0], keys[1]); assert.equal(r.ref, keys[1]);
    assert.ok(r.ref.length <= 20);
    keys.length = 0; status = 'NOP';
    const r2 = await a.create(ship());
    assert.equal(keys.length, 1); assert.equal(r2.ref, keys[0], 'iptal edilmemiş var olan gönderi kullanılır');
    const t = await a.track({ carrier_ref: 'K' });
    assert.equal(t.costVatIncluded, true);
  } finally { restore(); }
});

test('Kargonomi: fiyat onayından sonra hata → gönderi iptal edilir (takipsiz taslak kalmaz); ücret KDV hariç işaretli', async () => {
  const calls = mock([
    [/GET .*\/states$/, () => ({ data: [{ id: 34, name: 'İSTANBUL' }] })],
    [/GET .*\/cities\/34$/, () => ({ data: [{ id: 830, name: 'KADIKÖY' }] })],
    [/GET .*\/warehouses$/, () => ({ data: [{ id: 1, is_main: 1 }] })],
    [/POST .*\/shipments$/, () => ({ id: 88, status: 'draft' })],
    [/POST .*\/confirm-shipping-price$/, () => ({})],
    [/GET .*\/shipments\/88$/, () => ({ data: { id: 88, status: 'webservice_order_failed', status_label: 'Firma reddetti' } })],
    [/POST .*\/shipments\/cancel$/, () => ({ ok: true })],
  ]);
  try {
    const a = kargonomi.make({ KARGONOMI_API_KEY: 't' });
    await assert.rejects(a.create(ship(), { providerId: '3' }), /kargo firması gönderiyi oluşturamadı/);
    assert.ok(calls.some((c) => c.method === 'POST' && /\/shipments\/cancel$/.test(c.url) && JSON.parse(c.body).shipment_id === 88), 'taslak iptal edildi');
  } finally { restore(); }
  mock([[/GET .*\/shipments\/5$/, () => ({ data: { id: 5, status: 'ready', real_price: '50' } })]]);
  try { const t = await kargonomi.make({ KARGONOMI_API_KEY: 't' }).track({ carrier_ref: '5' }); assert.equal(t.cost, 50); assert.equal(t.costVatIncluded, false); } finally { restore(); }
});
