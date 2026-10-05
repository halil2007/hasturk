// PttAVM fiyat gönderimi: UpdateProductsStockPrice (SOAP), 1000'lik parçalar, alan sırası ve hata yanıtı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pttavm } from '../src/channels/pttavm.js';

const ENV = { PTTAVM_USERNAME: 'u', PTTAVM_PASSWORD: 'p' };
const X = (b) => new Response(b, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
const reply = (ok, msg = '') => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><UpdateProductsStockPriceResponse xmlns="http://tempuri.org/">
<UpdateProductsStockPriceResult xmlns:a="http://schemas.datacontract.org/2004/07/ePttAVMService.Model.Responses" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
<a:Message>${msg}</a:Message><a:Success>${ok}</a:Success><a:TrackingId>trk-1</a:TrackingId><a:CountOfProductsToBeProcessed>1</a:CountOfProductsToBeProcessed>
</UpdateProductsStockPriceResult></UpdateProductsStockPriceResponse></s:Body></s:Envelope>`;

test('fiyat: UpdateProductsStockPrice ile barkod + KDV dahil fiyat, 1000\'lik parçalar', async () => {
  const realFetch = globalThis.fetch;
  try {
    const calls = [];
    globalThis.fetch = async (url, o) => { calls.push({ url: String(url), action: o.headers.SOAPAction, body: String(o.body) }); return X(reply('true')); };
    const c = pttavm(ENV, { id: 'pttavm' });
    assert.equal(c.caps.price, true);
    const items = [...Array(1001)].map((_, i) => ({ remoteId: 'B' + i, price: 10 + i / 3, listPrice: 0 }));
    items[0] = { remoteId: 'A&B', price: 199.9, listPrice: 250 };
    await c.pushPrice(items);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://ws.pttavm.com:93/service.svc');
    assert.equal(calls[0].action, '"http://tempuri.org/IService/UpdateProductsStockPrice"');
    const b = calls[0].body;
    assert.match(b, /<wsse:Username>u<\/wsse:Username>/);
    assert.match(b, /<tem:UpdateProductsStockPrice><tem:items xmlns:r="http:\/\/schemas\.datacontract\.org\/2004\/07\/ePttAVMService\.Model\.Requests">/);
    // DataContract alan sırası: Barcode, Discount, PriceWithVAT
    assert.ok(b.includes('<r:ProductStockPriceRequest><r:Barcode>A&amp;B</r:Barcode><r:Discount>0</r:Discount><r:PriceWithVAT>199.90</r:PriceWithVAT></r:ProductStockPriceRequest>'));
    assert.ok(b.includes('<r:Barcode>B1</r:Barcode><r:Discount>0</r:Discount><r:PriceWithVAT>10.33</r:PriceWithVAT>'));
    assert.ok(!/Quantity|Miktar/.test(b), 'stok alanı gönderilmez');
    assert.equal((b.match(/<r:ProductStockPriceRequest>/g) || []).length, 1000);
    assert.equal((calls[1].body.match(/<r:ProductStockPriceRequest>/g) || []).length, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('fiyat: Success=false ya da SOAP hatası işlemi başarısız sayar (fiyat bekler)', async () => {
  const realFetch = globalThis.fetch;
  try {
    const c = pttavm(ENV, { id: 'pttavm' });
    globalThis.fetch = async () => X(reply('false', 'Barkod bulunamadı'));
    await assert.rejects(c.pushPrice([{ remoteId: 'X1', price: 5 }]), /PttAVM fiyat: Barkod bulunamadı/);
    globalThis.fetch = async () => X('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Yetkisiz</faultstring></s:Fault></s:Body></s:Envelope>');
    await assert.rejects(c.pushPrice([{ remoteId: 'X1', price: 5 }]), /UpdateProductsStockPrice: Yetkisiz/);
    globalThis.fetch = async () => X('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body></s:Body></s:Envelope>');
    await assert.rejects(c.pushPrice([{ remoteId: 'X1', price: 5 }]), /işlem kabul edilmedi/);
  } finally { globalThis.fetch = realFetch; }
});
