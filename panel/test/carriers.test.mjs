// Kargo entegratörleri (Kargonomi, Navlungo…): bilgiler şifreli saklanır, API'si hazır olmayan firma açıklamayla reddedilir,
// deneme modundaki örnek entegratörle gönderi → takip no + kendi anlaşmanızla gönderim → kargoya ver akışı uçtan uca çalışır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting } from '../src/db.js';
import { saveOrders } from '../src/sync.js';
import { shipmentOf } from '../src/carriers.js';
import worker from '../src/index.js';

const order = (id, extra = {}) => ({
  remoteId: id, orderNumber: id, orderedAt: Date.now(), status: 'new', remoteStatus: 'Created', customer: 'Ayşe Yılmaz', phone: '05321234567',
  address: { name: 'Ayşe Yılmaz', line: 'Atatürk Cd. No 5', district: 'Selçuklu', city: 'Konya', phone: '05321234567' }, total: 200,
  items: [{ lineId: id + '-1', sku: 'A', barcode: '111', name: 'Ürün A', quantity: 2, unitPrice: 100, total: 200, status: '', remoteKey: '111' }],
  packages: null, ...extra,
});

async function panel(extraEnv = {}) {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 'sir', DB: d1(), ...extraEnv };
  await init(env.DB);
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: env.cookie || '' } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) env.cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  return { env, call, post: (path, b) => call(path, { method: 'POST', body: JSON.stringify(b || {}) }) };
}

test('kargo entegratörü: bilgiler şifreli saklanır; API dokümanı gelmemiş firma gönderi açmaz, açıklama döner', async () => {
  const { env, call, post } = await panel();
  let r = await call('/api/integrations/carriers');
  const k0 = r.body.find((c) => c.id === 'kargonomi');
  assert.equal(k0.configured, false);
  assert.equal(k0.ready, false);
  assert.ok(r.body.some((c) => c.id === 'navlungo'));
  await call('/api/integrations/carriers/kargonomi', { method: 'PUT', body: JSON.stringify({ values: { KARGONOMI_API_KEY: 'kg-cok-gizli-9876' } }) });
  const row = await env.DB.prepare("SELECT data FROM channel_config WHERE id = 'kargonomi'").first();
  assert.ok(!row.data.includes('cok-gizli'), 'veritabanında açık metin olmamalı');
  r = await call('/api/integrations/carriers');
  const k = r.body.find((c) => c.id === 'kargonomi');
  assert.equal(k.configured, true);
  assert.equal(k.usable, false, 'bağlantısı hazır olmayan firma kullanılamaz');
  assert.equal(k.fields.find((f) => f.k === 'KARGONOMI_API_KEY').masked, '••••••9876');
  assert.ok(!JSON.stringify(r.body).includes('cok-gizli'));
  // Kargo entegratörü satış kanalı değildir: kanal listesine girmez
  assert.ok(!(await call('/api/integrations')).body.channels.some((c) => c.id === 'kargonomi'));
  r = await post('/api/integrations/carriers/kargonomi/test');
  assert.equal(r.body.ok, false);
  assert.match(r.body.message, /API dokümanı/);
  await saveOrders(env.DB, 'trendyol', [order('K1')]);
  r = await post('/api/orders/trendyol%3AK1/carrier-label', { provider: 'kargonomi' });
  assert.equal(r.status, 501);
  assert.match(r.body.error, /Kargonomi bağlantısı hazırlanıyor/);
  // Hiç kullanılabilir entegratör yoksa yönlendirme
  r = await post('/api/orders/trendyol%3AK1/carrier-label', {});
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Bağlı kargo entegratörü yok/);
});

test('kargo entegratörü (deneme modu): gönderi → takip no ve etiket pakete yazılır, kargoya verilir; iptal ve korumalar', async () => {
  const { env, call, post } = await panel({ DEMO: '1' });
  await setSetting(env.DB, 'sender', { name: 'HasTürk', phone: '03320000000', address: 'Sanayi Cd. 1', city: 'Konya' });
  await saveOrders(env.DB, 'trendyol', [order('D1')]);
  const id = encodeURIComponent('trendyol:D1');
  const list = (await call('/api/carriers')).body;
  assert.ok(list.find((c) => c.id === 'demo' && c.usable));
  // Gönderen adresi yoksa açıklamalı hata (önce ayarlanmış olan silinip denenir)
  await setSetting(env.DB, 'sender', { name: '', phone: '', address: '', city: '' });
  let r = await post(`/api/orders/${id}/carrier-label`, { provider: 'demo' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /gönderen/);
  await setSetting(env.DB, 'sender', { name: 'HasTürk', phone: '03320000000', address: 'Sanayi Cd. 1', city: 'Konya' });
  r = await post(`/api/orders/${id}/carrier-label`, { provider: 'demo', desi: 3 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pkg = r.body.order.packages[0];
  assert.equal(pkg.carrier_provider, 'demo');
  assert.equal(pkg.agreement, 'own');
  assert.equal(pkg.cargo_company, 'Demo Kargo');
  assert.equal(pkg.desi, 3);
  assert.match(pkg.tracking, /^DM\d+$/);
  assert.equal(r.body.panel, true, 'entegratör etiket dosyası vermezse panel etiketi barkodla basılır');
  assert.ok(r.body.order.shipping_cost > 0, 'entegratör ücreti kargo giderine yazılır');
  // Aynı pakete ikinci gönderi açılmaz; gönderisi olan sipariş yeniden bölünemez
  assert.equal((await post(`/api/orders/${id}/carrier-label`, { provider: 'demo', package_id: pkg.id })).status, 400);
  assert.equal((await post(`/api/orders/${id}/split`, { groups: [{ items: [{ line_id: 'D1-1', qty: 1 }] }, { items: [{ line_id: 'D1-1', qty: 1 }] }] })).status, 400);
  // Etiket tekrar istenince kanala gidilmez (entegratör barkoduyla panel etiketi); kanalda kargo firması değiştirilemez
  r = await post(`/api/orders/${id}/label`, { package_id: pkg.id, refresh: true });
  assert.equal(r.body.panel, true);
  assert.equal(r.body.order.packages[0].tracking, pkg.tracking);
  assert.equal((await post(`/api/orders/${id}/cargo`, { package_id: pkg.id, cargo: { id: '1', name: 'Aras' } })).status, 400);
  // Kanal senkronu takip numarasını ezmez
  await saveOrders(env.DB, 'trendyol', [order('D1')]);
  let o = (await call(`/api/orders/${id}`)).body.order;
  assert.equal(o.packages[0].tracking, pkg.tracking);
  // İptal: gönderi bilgisi ve gider geri alınır
  r = await post(`/api/orders/${id}/carrier-cancel`, { package_id: pkg.id });
  assert.equal(r.status, 200);
  o = (await call(`/api/orders/${id}`)).body.order;
  assert.equal(o.packages[0].carrier_provider, null);
  assert.equal(o.packages[0].tracking, '');
  assert.equal(o.shipping_cost, 0);
  // Yeniden gönderi + kargoya ver: takip no kalır, paket kargoda
  r = await post(`/api/orders/${id}/carrier-label`, { provider: 'demo' });
  const tn = r.body.order.packages[0].tracking;
  r = await post(`/api/orders/${id}/ship`, { package_id: r.body.package_id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  o = (await call(`/api/orders/${id}`)).body.order;
  assert.equal(o.packages[0].status, 'shipped');
  assert.equal(o.packages[0].tracking, tn);
  assert.equal((await post(`/api/orders/${id}/carrier-cancel`, { package_id: o.packages[0].id })).status, 400, 'kargodaki gönderi panelden iptal edilmez');
});

test('kargo entegratörü: ikas siparişinde gönderi ikas\'a takip bilgili paket olarak yazılır, kargoya verilince "Kargoda" yapılır', async () => {
  // Gerçek ikas kanalı (ikas API'si taklit edilir) + deneme modundaki örnek entegratör
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, o = {}) => {
    if (/oauth\/token/.test(String(url))) return new Response(JSON.stringify({ access_token: 'T', expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
    const b = JSON.parse(o.body); calls.push(b);
    const data = /fulfillOrder/.test(b.query) ? { fulfillOrder: { id: 'I1', orderPackages: [{ id: 'ikpk9', orderLineItemIds: ['I1-1'], trackingInfo: { trackingNumber: b.variables.input.trackingInfoDetail.trackingNumber } }] } }
      : /updateOrderPackageStatus/.test(b.query) ? { updateOrderPackageStatus: { id: 'I1' } } : /cancelFulfillment/.test(b.query) ? { cancelFulfillment: { id: 'I1' } } : {};
    return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { env, call, post } = await panel({ DEMO_CARRIER: '1', IKAS1_STORE: 'magaza', IKAS1_CLIENT_ID: 'id', IKAS1_CLIENT_SECRET: 'secret' });
    await setSetting(env.DB, 'sender', { name: 'HasTürk', phone: '1', address: 'Adres', city: 'Konya' });
    await saveOrders(env.DB, 'ikas1', [order('I1')]);
    const id = encodeURIComponent('ikas1:I1');
    let r = await post(`/api/orders/${id}/carrier-label`, { provider: 'demo' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const f = calls.find((c) => /fulfillOrder/.test(c.query)).variables.input;
    assert.equal(f.orderId, 'I1'); assert.equal(f.markAsReadyForShipment, true); assert.equal(f.sendNotificationToCustomer, false);
    assert.deepEqual(f.lines, [{ orderLineItemId: 'I1-1', quantity: 2 }]);
    assert.match(f.trackingInfoDetail.trackingNumber, /^DM\d+$/);
    let pkg = r.body.order.packages[0];
    assert.equal(pkg.remote_id, 'ikpk9');
    // Elle takip no hâlâ girilemez
    assert.equal((await post(`/api/orders/${id}/tracking`, { package_id: pkg.id, tracking: 'X' })).status, 400);
    r = await post(`/api/orders/${id}/ship`, { package_id: pkg.id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const u = calls.find((c) => /updateOrderPackageStatus/.test(c.query)).variables.input;
    assert.deepEqual(u.packages.map((p) => [p.packageId, p.status, p.trackingInfo.trackingNumber, p.trackingInfo.isSendNotification]), [['ikpk9', 'FULFILLED', pkg.tracking, true]]);
    pkg = (await call(`/api/orders/${id}`)).body.order.packages[0];
    assert.equal(pkg.status, 'shipped');
  } finally { globalThis.fetch = real; }
});

test('gönderi bilgisi: alıcı, gönderen, içerik ve değer siparişten; eksik adres bildirilir', () => {
  const o = { id: 'x', order_number: '55', channel: 'woocommerce', customer: 'Ali', address: JSON.stringify({ name: 'Ali Veli', line: 'Cd. 1', district: 'Merkez', city: 'Ankara', phone: '0555' }),
    items: [{ line_id: 'l1', name: 'Kalem', sku: 'K1', unit_price: 12.5 }], currency: 'TRY' };
  const { shipment, missing } = shipmentOf(o, { no: 2, desi: 0, items: [{ line_id: 'l1', qty: 4 }] }, { name: 'Firma', address: 'Depo' });
  assert.deepEqual(missing, []);
  assert.equal(shipment.reference, '55-2');
  assert.equal(shipment.receiver.city, 'Ankara');
  assert.equal(shipment.desi, 1);
  assert.equal(shipment.value, 50);
  assert.equal(shipment.items[0].qty, 4);
  const bad = shipmentOf({ ...o, address: '{}', customer: '' }, { no: 1, items: [] }, {});
  assert.ok(bad.missing.includes('alıcı adresi'));
  assert.ok(bad.missing.some((m) => /gönderen/.test(m)));
});
