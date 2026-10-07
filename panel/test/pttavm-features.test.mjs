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

// ---------- YENİ REST API (Api-Key + access-token) ----------
const RENV = { PTTAVM_API_KEY: 'KEY-1', PTTAVM_TOKEN: 'TOK-1' };
const J = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const ORDER = {
  siparisNo: 'PTT-1', islemTarihi: '2026-10-05T14:30:00', musteriAdi: 'Ayşe', musteriSoyadi: 'Kaya', telefonNo: '0555***12', siparisAdresi: 'Atatürk Cd. 5', siparisIli: 'Konya', siparisIlce: 'Selçuklu',
  kargoBarkod: null, barcodes: [{ barcode: 'PTTB123', type: 'kargo' }],
  siparisUrunler: [
    { lineItemId: 11, urunBarkod: '869001', urun: 'Solucan Gübresi 5 Kg', toplamIslemAdedi: 2, kdvDahilToplamTutar: 300, siparisDurumu: 'kargo_yapilmasi_bekleniyor' },
    { lineItemId: 12, urunBarkod: '869002', urun: 'Torf', toplamIslemAdedi: 1, kdvDahilToplamTutar: 99.9, siparisDurumu: 'iptal' },
  ],
};

test('PttAVM REST: API Key + Token varsa yeni API seçilir; kimlik başlıkları her istekte, eksikse API Key / Token istenir', async () => {
  const realFetch = globalThis.fetch;
  try {
    assert.deepEqual(pttavm({}, { id: 'pttavm' }).missing, ['PTTAVM_API_KEY', 'PTTAVM_TOKEN']);
    assert.equal(pttavm({}, { id: 'pttavm' }).enabled, false);
    assert.equal(pttavm(ENV, { id: 'pttavm' }).api, 'soap', 'yalnız eski kullanıcı adı / şifre varsa eski yol');
    const c = pttavm({ ...RENV, ...ENV }, { id: 'pttavm' });
    assert.equal(c.api, 'rest'); assert.equal(c.enabled, true);
    const calls = [];
    globalThis.fetch = async (url, o) => { calls.push({ url: String(url), h: o.headers }); return J([ORDER]); };
    const since = Date.parse('2026-08-01T00:00:00Z'), until = Date.parse('2026-10-07T00:00:00Z');
    const list = await c.fetchOrders(since, until);
    assert.equal(calls.length, 2, '67 gün → 40 günü aşmayan 2 aralık');
    assert.match(calls[0].url, /^https:\/\/integration-api\.pttavm\.com\/api\/v1\/orders\/search\?startDate=2026-08-01T00%3A00%3A00\.000Z&endDate=.*&isActiveOrders=false$/);
    assert.equal(calls[0].h['Api-Key'], 'KEY-1'); assert.equal(calls[0].h['access-token'], 'TOK-1');
    assert.ok(calls[0].h['X-Correlation-Id'] && calls[0].h['X-Correlation-Id'] !== calls[1].h['X-Correlation-Id'], 'her isteğe yeni correlation id');
    assert.equal(list.length, 1, 'aynı sipariş iki aralıkta gelse de bir kez');
    const o = list[0];
    assert.equal(o.remoteId, 'PTT-1'); assert.equal(o.customer, 'Ayşe Kaya'); assert.equal(o.address.city, 'Konya'); assert.equal(o.address.district, 'Selçuklu');
    assert.equal(o.status, 'new'); assert.equal(o.tracking, 'PTTB123'); assert.equal(o.total, 399.9);
    assert.equal(o.orderedAt, Date.parse('2026-10-05T11:30:00Z'), 'saat dilimi yazılmamış tarih Türkiye saati');
    assert.deepEqual(o.items.map((i) => [i.barcode, i.quantity, i.unitPrice, i.status]), [['869001', 2, 150, ''], ['869002', 1, 99.9, 'cancelled']]);
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM REST: durum eşlemesi ve tek sipariş / sipariş var mı', async () => {
  const { pttStatus } = await import('../src/channels/pttavm.js');
  assert.deepEqual(['kargo_yapilmasi_bekleniyor', 'gonderilmis', 'tamamlandi', 'iptal', 'odeme_gecersiz', 'iade', 'gondericisine_teslim_edildi', 'havale_onayi_bekleniyor'].map(pttStatus),
    ['new', 'shipped', 'delivered', 'cancelled', 'cancelled', 'returned', 'returned', 'new']);
  const realFetch = globalThis.fetch;
  try {
    const c = pttavm(RENV, { id: 'pttavm' });
    globalThis.fetch = async (url) => (/orders\/PTT-1$/.test(String(url)) ? J([{ ...ORDER, siparisUrunler: ORDER.siparisUrunler.map((l) => ({ ...l, siparisDurumu: 'gonderilmis' })) }]) : J({ message: 'Not found' }, 404));
    assert.equal((await c.fetchOne('PTT-1')).status, 'shipped');
    assert.equal(await c.orderExists('PTT-1'), true);
    assert.equal(await c.orderExists('YOK'), false);
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM REST: stok ve fiyat stock-prices ile (1000\'lik), takip numarası sonucu sorgulanır', async () => {
  const realFetch = globalThis.fetch;
  try {
    const c = pttavm(RENV, { id: 'pttavm' });
    const calls = [];
    globalThis.fetch = async (url, o) => {
      calls.push({ url: String(url), method: o.method, body: o.body && JSON.parse(o.body) });
      if (/tracking-result/.test(String(url))) return J({ trackingId: 'T1', status: 'Completed', progress: 100, productsSubTrackingResult: { productBasedInfos: [{ barcode: 'B1', status: 'Completed' }, { barcode: 'B2', status: 'Cancelled', message: 'Ürün kilitli', failureReasons: ['kilit'] }] } });
      return J({ success: true, trackingId: 'T' + calls.length, countOfProductsToBeProcessed: 1 });
    };
    const r = await c.pushStock([...Array(1001)].map((_, i) => ({ remoteId: 'B' + i, stock: i === 0 ? -3 : i === 1 ? 20000 : 5 })));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://integration-api.pttavm.com/api/v1/products/stock-prices'); assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body.items.slice(0, 2), [{ barcode: 'B0', quantity: 0 }, { barcode: 'B1', quantity: 9999 }], 'stok 0–9999 aralığına çekilir');
    assert.deepEqual(r.refs, ['T1', 'T2']);
    calls.length = 0;
    await c.pushPrice([{ remoteId: 'B1', price: 199.904 }, { remoteId: 'B2', price: 0.5 }]);
    assert.deepEqual(calls[0].body.items, [{ barcode: 'B1', priceWithVAT: 199.9, discount: 0 }], '1 TL altı fiyat gönderilmez');
    const st = await c.pushStatus('T1');
    assert.equal(st.done, true);
    assert.deepEqual(st.items.map((x) => [x.key, x.ok]), [['B1', true], ['B2', false]]);
    assert.match(st.items[1].error, /Ürün kilitli · kilit/);
    globalThis.fetch = async () => J({ success: false, message: 'Aynı istek 5 dakika içinde tekrar gönderilemez' });
    await assert.rejects(c.pushStock([{ remoteId: 'B1', stock: 1 }]), /5 dakika/);
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM REST: ürün listesi (varyantlar ayrı ilan) ve kargo barkodu (depo otomatik, tracking_id ile sorgu)', async () => {
  const realFetch = globalThis.fetch;
  try {
    const c = pttavm(RENV, { id: 'pttavm' });
    const calls = [];
    globalThis.fetch = async (url, o) => {
      const u = String(url); calls.push({ u, body: o.body && JSON.parse(o.body) });
      if (/products\/search/.test(u)) return J(/searchPage=1/.test(u) ? [
        { urunId: 7, barkod: 'P7', urunAdi: 'Torf', kdVli: 120, miktar: 4, aktif: true, rowCount: 3, resimListesi: [{ url: 'https://img/7.jpg', sira: 1 }] },
        { urunId: 8, barkod: 'P8', urunAdi: 'Gübre', kdVli: 100, miktar: 9, rowCount: 3, variantListesi: [{ variantBarkod: 'V1', variant1Deger: '5 Kg', miktar: 3, fiyat: 0 }, { variantBarkod: 'V2', variant1Deger: '10 Kg', miktar: 6, fiyat: 50 }] },
      ] : []);
      if (/get-warehouse/.test(u)) return J({ data: [{ id: 555, name: 'Ana depo' }], status: true });
      if (/create-barcode/.test(u)) return J({ tracking_id: 'TR9', success: true, error: false });
      if (/barcode-status/.test(u)) return J({ tracking_id: 'TR9', status: 'completed', data: [{ order_id: 'PTT-1', barcodes: ['KB777'] }] });
      return J({});
    };
    const l = await c.fetchListings();
    assert.deepEqual(l.map((x) => [x.remoteId, x.name, x.price, x.stock]), [['P7', 'Torf', 120, 4], ['V1', 'Gübre - 5 Kg', 100, 3], ['V2', 'Gübre - 10 Kg', 150, 6]]);
    assert.equal(l[0].image, 'https://img/7.jpg');
    const r = await c.ship({ order_number: 'PTT-1' }, { id: 1 });
    assert.deepEqual(r, { tracking: 'KB777', cargoCompany: 'PTT Kargo' });
    assert.deepEqual(calls.find((x) => /create-barcode/.test(x.u)).body, { orders: [{ order_id: 'PTT-1', warehouse_id: 555 }] });
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM REST: boş kategori filtresini reddeden hesapta (HTTP 400) kabul edilen biçim bulunur; aktif/pasif, stoklu/stoksuz birleştirilir', async () => {
  const realFetch = globalThis.fetch;
  try {
    const c = pttavm(RENV, { id: 'pttavm' });
    const seen = [];
    globalThis.fetch = async (url) => {
      const u = new URL(String(url));
      if (!/products\/search/.test(u.pathname)) return J({});
      const q = Object.fromEntries(u.searchParams); seen.push(q);
      // Bu hesapta: kategori alanları boş ya da 0 gönderilince 400; hiç gönderilmeyince çalışır
      if ('categoryId' in q) return new Response('', { status: 400 });
      if (q.searchPage !== '1') return J([]);
      const rows = { 'true|true': [{ urunId: 1, barkod: 'A', urunAdi: 'Aktif stoklu', kdVli: 10, miktar: 2, aktif: true }],
        'true|false': [{ urunId: 2, barkod: 'B', urunAdi: 'Aktif stoksuz', kdVli: 11, miktar: 0, aktif: true }],
        'false|true': [{ urunId: 3, barkod: 'C', urunAdi: 'Pasif', kdVli: 12, miktar: 5, aktif: false }, { urunId: 1, barkod: 'A', urunAdi: 'Aktif stoklu', kdVli: 10, miktar: 2 }],
        'false|false': [] };
      return J(rows[`${q.isActive}|${q.isInStock}`] || []);
    };
    const l = await c.fetchListings();
    assert.deepEqual(l.map((x) => [x.remoteId, x.stock, x.active]).sort(), [['A', 2, true], ['B', 0, true], ['C', 5, false]]);
    assert.ok(seen.some((q) => q.categoryId === '' && q.isActive === ''), 'önce filtresiz denenir');
    assert.ok(seen.some((q) => q.categoryId === '0'), 'sonra kategori 0 denenir');
    // Hiçbir biçim kabul edilmezse anlaşılır hata
    globalThis.fetch = async () => new Response('', { status: 400 });
    await assert.rejects(c.fetchListings(), /arama filtrelerini kabul etmedi \(HTTP 400\)/);
  } finally { globalThis.fetch = realFetch; }
});
