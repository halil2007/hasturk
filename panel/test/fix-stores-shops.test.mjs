// Kendi site bağdaştırıcıları: ilan ilan gönderim sonucu ({ done, errors }), WooCommerce stok takibi (parent / kapalı),
// Ticimax StokAdediGuncelle yanıt denetimi ve imleç, kapıda ödeme işareti (cod)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { woocommerce } from '../src/channels/woocommerce.js';
import { opencart } from '../src/channels/opencart.js';
import { ticimax } from '../src/channels/ticimax.js';
import { ideasoft } from '../src/channels/ideasoft.js';
import { tsoft } from '../src/channels/tsoft.js';

const realFetch = globalThis.fetch;
function mock(handler) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const c = { url: String(url), method: o.method || 'GET', headers: o.headers || {}, raw: String(o.body || '') };
    try { c.body = JSON.parse(c.raw); } catch { c.body = c.raw; }
    c.op = String(c.headers.SOAPAction || '').replace(/"/g, '').split('/').pop();
    calls.push(c);
    let r = await handler(c);
    if (!r || r.status == null) r = { status: 200, body: r };
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status, headers: { 'Content-Type': typeof r.body === 'string' ? 'text/xml' : 'application/json' } });
  };
  return calls;
}
const restore = () => { globalThis.fetch = realFetch; };
const WENV = { WOO_URL: 'https://magaza.com', WOO_KEY: 'ck', WOO_SECRET: 'cs' };

test('WooCommerce: stok ana üründe (parent) → ana ürüne bir kez; stok takibi kapalı → zorla açılmaz, ilana hata', async () => {
  const modes = { 21: 'parent', 22: 'parent', 23: false, 10: true, 11: false };
  const calls = mock((c) => (c.method === 'GET' ? new URL(c.url).searchParams.get('include').split(',').map((id) => ({ id: Number(id), manage_stock: modes[id] }))
    : { update: c.body.update.map((u) => ({ id: u.id })) }));
  try {
    const r = await woocommerce(WENV, {}).pushStock([{ remoteId: '21', remoteProductId: '20', stock: 5 }, { remoteId: '22', remoteProductId: '20', stock: 5 }, { remoteId: '23', remoteProductId: '20', stock: 2 },
      { remoteId: '10', remoteProductId: '10', stock: 3 }, { remoteId: '11', remoteProductId: '11', stock: 4 }]);
    const posts = calls.filter((c) => c.method === 'POST');
    assert.deepEqual(posts.map((c) => [new URL(c.url).pathname, c.body.update]), [
      ['/wp-json/wc/v3/products/batch', [{ id: 10, manage_stock: true, stock_quantity: 3 }]],
      ['/wp-json/wc/v3/products/batch', [{ id: 20, stock_quantity: 5 }]]], 'varyasyonlara değil, ana ürüne tek kayıt; kapalı olanlar gönderilmez');
    assert.deepEqual(r.done.sort(), ['10', '21', '22']);
    assert.deepEqual(r.errors.map((x) => [x.remoteId, x.error]).sort(), [['11', "WooCommerce'da stok takibi kapalı"], ['23', "WooCommerce'da stok takibi kapalı"]]);
  } finally { restore(); }
});

test('WooCommerce: bir parça gönderildikten sonra gelen bağlantı / yetki hatası yalnız o parçaya yazılır; hiçbiri gönderilemediyse atılır', async () => {
  let n = 0;
  mock((c) => (c.method === 'GET' ? new URL(c.url).searchParams.get('include').split(',').map((id) => ({ id: Number(id), manage_stock: true }))
    : n++ === 0 ? { update: c.body.update.map((u) => ({ id: u.id })) } : { status: 403, body: { message: 'yetki yok' } }));
  try {
    const items = Array.from({ length: 150 }, (_, i) => ({ remoteId: String(i + 1), remoteProductId: String(i + 1), stock: 1, price: 10 }));
    const r = await woocommerce(WENV, {}).pushStock(items);
    assert.equal(r.done.length, 100); assert.equal(r.errors.length, 50); assert.match(r.errors[0].error, /HTTP 403/);
    n = 1;
    await assert.rejects(woocommerce(WENV, {}).pushPrice(items.slice(0, 3)), /HTTP 403/);
  } finally { restore(); }
});

test('Kapıda ödeme işareti: WooCommerce payment_method cod, OpenCart payment_code cod (3.x) / cod.cod (4.x), T-Soft ödeme tipi adı', async () => {
  try {
    mock(() => [{ id: 1, number: '1', status: 'processing', payment_method: 'cod', billing: {}, shipping: {}, line_items: [] }, { id: 2, number: '2', status: 'processing', payment_method: 'bacs', billing: {}, shipping: {}, line_items: [] }]);
    const w = await woocommerce(WENV, {}).fetchOrders(0, 1, { byOrdered: true });
    assert.deepEqual(w.map((o) => !!o.cod), [true, false]);
    mock(() => ({ ok: true, more: false, orders: [{ order_id: 1, status: 'Pending', payment_code: 'cod', products: [] }, { order_id: 2, status: 'Pending', payment_method: '{"name":"Kapıda","code":"cod.cod"}', products: [] }, { order_id: 3, status: 'Pending', payment_code: 'bank_transfer', products: [] }] }));
    const oc = await opencart({ OPENCART_URL: 'https://magaza.com', OPENCART_KEY: 'k' }, {}).fetchOrders(0, 1);
    assert.deepEqual(oc.map((o) => !!o.cod), [true, true, false]);
    mock((c) => (/auth\/login/.test(c.url) ? { success: true, data: [{ token: 'T' }] } : { success: true, data: [{ OrderId: 5, OrderCode: 'TS5', OrderStatus: 'Yeni', PaymentTypeName: 'Kapıda Ödeme', OrderDetails: [] }] }));
    const ts = await tsoft({ TSOFT_URL: 'https://magaza.com', TSOFT_USER: 'u', TSOFT_PASS: 'p' }, {}).fetchOrders(0, Date.now(), { byOrdered: true });
    assert.equal(ts[0].cod, true);
  } finally { restore(); }
});

test('Ticimax: StokAdediGuncelle yanıtındaki hata (IsError) başarı sayılmaz; satır sonucu varsa yalnız o ilana yazılır', async () => {
  const env = (inner, op) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${op}Response xmlns="http://tempuri.org/"><${op}Result xmlns:a="http://schemas.datacontract.org/2004/07/">${inner}</${op}Result></${op}Response></s:Body></s:Envelope>`;
  const ENV = { TICIMAX_URL: 'https://www.magaza.com', TICIMAX_KEY: 'K' };
  let inner = '<a:IsError>true</a:IsError><a:ErrorMessage>Yetkisiz metot</a:ErrorMessage>';
  mock((c) => env(inner, c.op));
  try {
    const items = [{ remoteId: '1', stock: 1 }, { remoteId: '2', stock: 1 }, { remoteId: 'x', stock: 1 }];
    let r = await ticimax(ENV, {}).pushStock(items);
    assert.deepEqual(r.done, []);
    assert.deepEqual(r.errors.map((e) => [e.remoteId, e.error]), [['x', 'Ticimax: geçersiz varyasyon numarası'], ['1', 'Ticimax: Yetkisiz metot'], ['2', 'Ticimax: Yetkisiz metot']]);
    inner = '<a:Sonuclar><a:Sonuc><a:ID>2</a:ID><a:IsError>true</a:IsError><a:ErrorMessage>Varyasyon bulunamadı</a:ErrorMessage></a:Sonuc></a:Sonuclar>';
    r = await ticimax(ENV, {}).pushStock(items.slice(0, 2));
    assert.deepEqual(r, { done: ['1'], errors: [{ remoteId: '2', error: 'Ticimax: Varyasyon bulunamadı' }] });
    inner = '';
    assert.deepEqual((await ticimax(ENV, {}).pushStock(items.slice(0, 2))).done, ['1', '2']);
  } finally { restore(); }
});

test('IdeaSoft: tüm ilanlarda bağlantı / sunucu hatası (hiçbiri gönderilemedi) atılır; ilan hatası (422) yalnız o ilana', async () => {
  const ENV = { IDEASOFT_URL: 'https://magaza.myideasoft.com', IDEASOFT_CLIENT_ID: 'c', IDEASOFT_CLIENT_SECRET: 's', IDEASOFT_REFRESH_TOKEN: 'r' };
  mock((c) => (/oauth/.test(c.url) ? { access_token: 'A', expires_in: 3600 } : { status: 403, body: { message: 'izin yok' } }));
  try {
    await assert.rejects(ideasoft(ENV, {}).pushStock([{ remoteId: '1', stock: 1 }, { remoteId: '2', stock: 1 }]), /HTTP 403/);
    mock((c) => (/oauth/.test(c.url) ? { access_token: 'A', expires_in: 3600 } : { status: 422, body: { message: 'geçersiz' } }));
    const r = await ideasoft(ENV, {}).pushStock([{ remoteId: '1', stock: 1 }]);
    assert.equal(r.errors.length, 1); assert.equal(r.done.length, 0);
  } finally { restore(); }
});
