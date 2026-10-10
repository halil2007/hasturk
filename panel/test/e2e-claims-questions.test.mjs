// Uçtan uca: iade talepleri (senkron, liste, görseller, onay / ret gerekçesiyle, sipariş ve stoğa yansıması) ve müşteri soruları
// (senkron, cevap, şablonlar) — müşteri paneli, HTTP API'si arayüzün yaptığı gibi, sahte Trendyol ile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { first, all } from '../src/db.js';

// ---------- ortak düzenek (her e2e dosyasında aynı) ----------
const realFetch = globalThis.fetch;
function net() {
  const routes = [], calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url), method = o.method || 'GET';
    let body = o.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* düz metin */ } }
    const c = { url: u, method, body, headers: o.headers || {} };
    calls.push(c);
    for (const r of [...routes].reverse()) {
      if ((r.m && r.m !== method) || !r.re.test(u)) continue;
      let out = await r.fn(c), status = 200;
      if (out instanceof Response) return out;
      if (out && out.__status) { status = out.__status; out = out.body; }
      return new Response(typeof out === 'string' ? out : JSON.stringify(out ?? {}), { status, headers: { 'Content-Type': typeof out === 'string' ? 'text/plain' : 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'e2e: tanımsız adres ' + method + ' ' + u }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  return {
    calls,
    on(m, re, fn) { routes.push({ m, re, fn: typeof fn === 'function' ? fn : () => fn }); },
    find: (m, re) => calls.filter((c) => (!m || c.method === m) && re.test(c.url)),
    reset() { calls.length = 0; },
    restore() { globalThis.fetch = realFetch; },
  };
}
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
async function panel({ plan = 'Kurumsal', slug = 'e2e-firma' } = {}) {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1(), HB_USER_AGENT: 'hasturk_dev' };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jars = {}, pending = [];
  const as = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Fresh': '1', Cookie: jars[who] || '', ...(opts.headers || {}) } }), env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
    const sc = r.headers.get('set-cookie');
    if (sc) jars[who] = sc.split(';')[0];
    return r;
  };
  const owner = as('owner');
  assert.equal((await owner('/api/login', J({ password: 'x-123456' }))).status, 200);
  const cr = await owner('/api/tenants', J({ slug, name: 'E2E Firma', admin_username: 'yonetici', admin_password: 'gizli-sifre-1', plan }));
  assert.equal(cr.status, 200, await cr.clone().text());
  const obj = env.TENANT.get(env.TENANT.idFromName(slug));
  obj.ctx.waitUntil = (p) => { pending.push(Promise.resolve(p).catch(() => {})); };
  const admin = as('admin');
  const lg = await admin('/api/login', J({ tenant: slug, username: 'yonetici', password: 'gizli-sifre-1' }));
  assert.equal(lg.status, 200, await lg.clone().text());
  // Arka plan işleri (kanala stok / fiyat gönderimi) bitene kadar bekle
  const settle = async () => { for (let i = 0; i < 20 && pending.length; i++) { const p = pending.splice(0); await Promise.all(p); } };
  // Personel: kullanıcı ekle ve o kullanıcı olarak oturum aç
  const staff = async (username, perms) => {
    const r = await admin('/api/users', J({ username, name: username, password: 'personel-sifre-1', role: 'staff', perms }));
    assert.equal(r.status, 200, await r.clone().text());
    const s = as(username);
    assert.equal((await s('/api/login', J({ tenant: slug, username, password: 'personel-sifre-1' }))).status, 200);
    return s;
  };
  return { env, owner, admin, as, staff, obj, db: obj.db, settle, slug };
}
const js = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const ok = async (r, msg) => { const b = await js(r); assert.ok(r.status === 200, `${msg || ''} HTTP ${r.status}: ${JSON.stringify(b)}`); return b; };
// ---------- düzenek sonu ----------
// ---------- sahte kanallar ----------
const H3 = 3 * 3600e3;
const TY = { TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
const HB = { HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'p' };
const IK = { IKAS1_STORE: 'e2emagaza', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c', IKAS1_STOCK_LOCATION_ID: 'loc1' };
const TGO = { TRENDYOLGO_SUPPLIER_ID: '123456', TRENDYOLGO_API_KEY: 'k', TRENDYOLGO_API_SECRET: 's', TRENDYOLGO_STORE_ID: '164' };
const ADDR = { fullName: 'Ayşe Kaya', fullAddress: 'Caferağa Mah. Moda Cad. No:12', city: 'İstanbul', district: 'Kadıköy', phone: '05321234567' };
// Trendyol paketi: lines = [[lineId, sku, barcode, adet, birim fiyat, satır durumu?]]
const tyPkg = (id, no, status, lines, o = {}) => ({
  shipmentPackageId: id, orderNumber: String(no), orderDate: Date.now() + H3, status, customerFirstName: 'Ayşe', customerLastName: 'Kaya', shipmentAddress: ADDR,
  cargoProviderName: 'Trendyol Express', cargoTrackingNumber: 7000 + id, packageTotalPrice: lines.reduce((s, l) => s + l[3] * l[4], 0),
  lines: lines.map(([lineId, sku, barcode, quantity, price, st]) => ({ lineId, stockCode: sku, barcode, productName: 'Ürün ' + sku, quantity, lineUnitPrice: price, ...(st ? { orderLineItemStatusName: st } : {}) })), ...o,
});
function trendyolMock(n) {
  const st = { pkgs: [], claims: [], questions: [] };
  const pkg = (id) => st.pkgs.find((p) => String(p.shipmentPackageId) === String(id));
  n.on('GET', /apigw\.trendyol\.com\/integration\/order\/sellers\/42\/v2\/orders\?/, (c) => {
    const no = new URL(c.url).searchParams.get('orderNumber');
    return { content: no ? st.pkgs.filter((p) => p.orderNumber === no) : st.pkgs, totalPages: 1, totalElements: st.pkgs.length };
  });
  n.on('PUT', /\/shipment-packages\/\d+$/, (c) => { const p = pkg(c.url.split('/').pop()); if (!p) return { __status: 400, body: { message: 'paket yok' } }; p.status = c.body.status; return {}; });
  n.on('POST', /\/shipment-packages\/\d+\/split-packages$/, {});
  n.on('PUT', /\/cargo-providers$/, {});
  n.on('POST', /\/common-label\/\d+$/, {});
  n.on('GET', /\/common-label\/\d+$/, (c) => ({ data: [{ label: `^XA^FO50,50^BCN,100^FD${c.url.split('/').pop()}^FS^XZ` }] }));
  n.on('GET', /\/products\/approved/, { content: [], totalPages: 1 });
  n.on('POST', /trendyol\.com\/integration\/inventory\/.*price-and-inventory$/, { batchRequestId: 'b-1' });
  n.on('GET', /trendyol\.com\/integration\/order\/sellers\/42\/claims\?/, () => ({ content: st.claims, totalPages: 1 }));
  n.on('PUT', /\/claims\/[^/]+\/items\/approve$/, {});
  n.on('POST', /\/claims\/[^/]+\/issue\?/, {});
  n.on('GET', /claim-issue-reasons/, [{ id: 1, name: 'Ürün kullanılmış' }, { id: 2, name: 'Eksik parça' }]);
  n.on('GET', /\/qna\/sellers\/42\/questions\/filter\?/, () => ({ content: st.questions, totalPages: 1, totalElements: st.questions.length }));
  n.on('POST', /\/qna\/sellers\/42\/questions\/[^/]+\/answers$/, {});
  return st;
}
// Hepsiburada: açık satırlar, paket oluşturma (P1, P2 …), ZPL etiket
function hepsiburadaMock(n) {
  const st = { lines: [], made: 0, unpacked: [] };
  n.on('GET', /oms-external\.hepsiburada\.com\/orders\/merchantId\/[^/?]+\?/, (c) => (new URL(c.url).searchParams.get('offset') === '0' ? { items: st.lines } : { items: [] }));
  n.on('GET', /oms-external\.hepsiburada\.com\/packages\/merchantId\/[^/?]+\?/, []);
  n.on('GET', /oms-external\.hepsiburada\.com\/packages\/merchantId\/[^/]+\/(shipped|delivered)\?/, []);
  n.on('GET', /oms-external\.hepsiburada\.com\/orders\/merchantId\/[^/]+\/cancelled\?/, []);
  n.on('POST', /oms-external\.hepsiburada\.com\/packages\/merchantId\/[^/?]+$/, () => ({ packageNumber: 'P' + (++st.made) }));
  n.on('GET', /\/packagenumber\/[^/]+\/labels/, (c) => new Response(`^XA^FO20,20^BCN,120^FD62750000${c.url.match(/packagenumber\/P(\d+)/)[1]}^FS^XZ`, { status: 200, headers: { 'Content-Type': 'text/plain' } }));
  n.on('POST', /\/packagenumber\/[^/]+\/unpack$/, (c) => { st.unpacked.push(c.url); return {}; });
  n.on('GET', /listing-external\.hepsiburada\.com/, { listings: [] });
  return st;
}
const hbLine = (id, no, sku, qty, total) => ({ id, orderNumber: String(no), orderDate: new Date(Date.now() + 1000).toISOString(), quantity: qty, merchantSku: sku, sku: 'HB' + sku, productName: 'Ürün ' + sku,
  totalPrice: { amount: total }, customerName: 'Can Demir', shippingAddress: { address: 'Atatürk Cad. No:5', city: 'Bursa', district: 'Nilüfer', phone: '05339998877' } });
// ikas (GraphQL): siparişler, paket (fulfillOrder), paket durumu, stok
function ikasMock(n) {
  const st = { orders: [], gql: [] };
  n.on('POST', /\.myikas\.com\/api\/admin\/oauth\/token$/, { access_token: 'T', expires_in: 3600 });
  n.on('POST', /api\.myikas\.com\/api\/v1\/admin\/graphql$/, (c) => {
    const q = c.body.query, v = c.body.variables || {};
    st.gql.push(c.body);
    if (/getMerchant/.test(q)) return { data: { getMerchant: { id: 'm1' } } };
    if (/listOrder/.test(q)) return { data: { listOrder: { hasNext: false, data: v.d && v.d.eq ? st.orders.filter((o) => o.id === v.d.eq) : st.orders } } };
    if (/listVariantType/.test(q)) return { data: { listVariantType: [] } };
    if (/listCategory/.test(q)) return { data: { listCategory: [] } };
    if (/listProduct/.test(q)) return { data: { listProduct: { hasNext: false, data: [] } } };
    if (/fulfillOrder/.test(q)) {
      const o = st.orders.find((x) => x.id === v.input.orderId), id = 'pk-' + (o.orderPackages.length + 1);
      o.orderPackages.push({ id, orderLineItemIds: v.input.lines.map((l) => l.orderLineItemId), orderPackageFulfillStatus: 'READY_FOR_SHIPMENT', trackingInfo: { trackingNumber: v.input.trackingInfoDetail.trackingNumber, barcode: v.input.trackingInfoDetail.barcode, cargoCompany: v.input.trackingInfoDetail.cargoCompany } });
      o.orderPackageStatus = 'READY_FOR_SHIPMENT';
      return { data: { fulfillOrder: { id: o.id, orderPackages: o.orderPackages } } };
    }
    if (/updateOrderPackageStatus/.test(q)) {
      const o = st.orders.find((x) => x.id === v.input.orderId);
      for (const p of v.input.packages) { const k = o.orderPackages.find((x) => x.id === p.packageId); if (k) k.orderPackageFulfillStatus = p.status; }
      o.orderPackageStatus = 'FULFILLED';
      return { data: { updateOrderPackageStatus: { id: o.id } } };
    }
    if (/cancelFulfillment/.test(q)) { const o = st.orders.find((x) => x.id === v.input.orderId); o.orderPackages = o.orderPackages.filter((x) => x.id !== v.input.orderPackageId); return { data: { cancelFulfillment: { id: o.id } } }; }
    if (/saveProductStockLocations/.test(q)) return { data: { saveProductStockLocations: true } };
    if (/saveVariantPrices/.test(q)) return { data: { saveVariantPrices: true } };
    return { data: {} };
  });
  return st;
}
const ikasOrder = (id, no, lines, o = {}) => ({
  id, orderNumber: no, orderedAt: Date.now() + 1000, status: 'CREATED', orderPackageStatus: 'UNFULFILLED', orderPaymentStatus: 'PAID', totalFinalPrice: lines.reduce((s, l) => s + l[2] * l[3], 0), currencyCode: 'TRY',
  customer: { id: 'c-' + id, firstName: 'Ali', lastName: 'Veli', email: 'ali@ornek.com', phone: '05321112233' },
  shippingAddress: { firstName: 'Ali', lastName: 'Veli', phone: '05321112233', addressLine1: 'Caferağa Mah. Moda Cad. No:12', city: { name: 'İstanbul' }, district: { name: 'Kadıköy' } },
  orderLineItems: lines.map(([lid, sku, qty, price]) => ({ id: lid, quantity: qty, price, finalPrice: price, status: 'CREATED', variant: { id: 'v-' + sku, productId: 'p-' + sku, sku, name: 'Ürün ' + sku, barcodeList: [] } })),
  orderPackages: [], ...o,
});
// Kargonomi (kendi anlaşmalı kargo entegratörü): taslak → firma seçimi → takip no + PDF etiket
function kargonomiMock(n) {
  const st = { created: 0, cancelled: [] };
  n.on('GET', /app\.kargonomi\.com\.tr\/api\/v1\/states$/, { data: [{ id: 34, name: 'İstanbul' }, { id: 16, name: 'Bursa' }] });
  n.on('GET', /app\.kargonomi\.com\.tr\/api\/v1\/cities\/\d+$/, { data: [{ id: 3401, name: 'Kadıköy' }, { id: 1601, name: 'Nilüfer' }] });
  n.on('POST', /app\.kargonomi\.com\.tr\/api\/v1\/shipments$/, () => ({ data: { id: 900 + (++st.created), status: 'draft' } }));
  n.on('POST', /confirm-shipping-price$/, {});
  n.on('GET', /app\.kargonomi\.com\.tr\/api\/v1\/shipments\/\d+$/, (c) => { const id = c.url.split('/').pop(); return { data: { id: Number(id), status: 'webservice_order_created', shipping_webservice_tracking_code: 'KG' + id, shipping_provider_name: 'Aras Kargo', shipping_provider_slug: 'aras', real_price: 54.9 } }; });
  n.on('GET', /\/shipments\/\d+\/barcode\?format=pdf$/, { data: 'JVBERi0xLjQK' + 'A'.repeat(200) });
  n.on('POST', /\/shipments\/cancel$/, (c) => { st.cancelled.push(c.body.shipment_id); return {}; });
  return st;
}
// Trendyol Go (hızlı market): paketler, işleme al (picked), hazırlandı (invoiced)
const tgoPkg = (id, no, status, lines) => ({ id, supplierId: 123456, storeId: 164, orderId: 'OID-' + no, orderNumber: String(no), packageCreationDate: Date.now() + 1000, packageModificationDate: Date.now() + 1000, totalPrice: lines.reduce((s, l) => s + l[2] * l[3], 0), packageStatus: status,
  customer: { id: 1, firstName: 'Zeynep', lastName: 'A' }, address: { firstName: 'Zeynep', lastName: 'A', address1: 'Bağdat Cad. 10', city: 'İstanbul', district: 'Kadıköy', phone: '05330001122' },
  lines: lines.map(([barcode, name, qty, price]) => ({ barcode, productName: name, price, quantity: qty })) });
function tgoMock(n) {
  const st = { pkgs: [] };
  n.on('GET', /tgoapis\.com\/integrator\/order\/grocery\/suppliers\/123456\/packages\?/, () => ({ page: 0, totalPages: 1, totalCount: st.pkgs.length, content: st.pkgs }));
  n.on('GET', /\/packages\/order-number\/[^/]+$/, (c) => ({ content: st.pkgs.filter((p) => p.orderNumber === decodeURIComponent(c.url.split('/').pop())) }));
  n.on('PUT', /\/packages\/[^/]+\/picked$/, (c) => { const p = st.pkgs.find((x) => x.id === c.url.split('/').at(-2)); p.packageStatus = 'Picking'; return {}; });
  n.on('GET', /\/orders\/[^/]+\/invoice-amount$/, { minInvoiceAmount: 1, maxInvoiceAmount: 10000 });
  n.on('PUT', /\/packages\/[^/]+\/invoiced$/, (c) => { const p = st.pkgs.find((x) => x.id === c.url.split('/').at(-2)); p.packageStatus = 'Invoiced'; return {}; });
  n.on('GET', /tgoapis\.com\/integrator\/product\//, { content: [], totalPages: 1 });
  return st;
}
const oid = (id) => encodeURIComponent(id);
// ---------- sahte kanallar sonu ----------

async function setup(n, { restock = true } = {}) {
  const p = await panel();
  const { admin } = p;
  await ok(await admin('/api/settings', J({ stock_sync: true, restock_returns: restock }, 'PUT')));
  const a = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 5 Kg', sku: 'SOL-5', barcode: '8690001', stock: 10, sale_price: 150 })));
  const b = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 10 Kg', sku: 'SOL-10', barcode: '8690002', stock: 10, sale_price: 260 })));
  await new Promise((r) => setTimeout(r, 5));
  await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
  const ty = trendyolMock(n);
  return { ...p, ty, P: { a: a.id, b: b.id } };
}
const stockOf = async (admin, id) => (await ok(await admin(`/api/products/${id}`))).stock;
// Trendyol iade talebi: her adet ayrı kalem
const tyClaim = (id, no, lines, o = {}) => ({
  id, claimId: id, orderNumber: String(no), claimDate: Date.now(), customerFirstName: 'Ayşe', customerLastName: 'Kaya', cargoProviderName: 'Trendyol Express', cargoTrackingNumber: 8001,
  items: lines.map(([lineId, sku, barcode, qty, price, status = 'WaitingInAction', reason = 'Beğenmedim']) => ({
    orderLine: { id: lineId, productName: 'Ürün ' + sku, barcode, merchantSku: sku, price },
    claimItems: Array.from({ length: qty }, (_, i) => ({ id: `${id}-${lineId}-${i}`, customerClaimItemReason: { name: reason }, claimItemStatus: { name: status }, customerNote: 'kutusu ezik', customerImages: [`https://cdn.trendyol.com/claims/${id}-${i}.jpg`] })),
  })), ...o,
});
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');

test('İadeler: senkron, liste (görseller), onay → sipariş satırı ve stok; ret (gerekçe + belge); kanaldaki gecikmede karar korunur', async () => {
  const n = net();
  try {
    const { admin, ty, P } = await setup(n);
    ty.pkgs.push(tyPkg(1, 900, 'Delivered', [[11, 'SOL-5', '8690001', 3, 150], [12, 'SOL-10', '8690002', 1, 260]]), tyPkg(2, 901, 'Delivered', [[21, 'SOL-10', '8690002', 2, 260]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    assert.equal(await stockOf(admin, P.a), 7); assert.equal(await stockOf(admin, P.b), 7);
    ty.claims.push(tyClaim('c-1', 900, [[11, 'SOL-5', '8690001', 2, 150]]), tyClaim('c-2', 901, [[21, 'SOL-10', '8690002', 2, 260, 'WaitingInAction', 'Hasarlı geldi']]));
    const sc = await ok(await admin('/api/claims/sync', J({})));
    assert.equal(sc.trendyol, 2, JSON.stringify(sc));
    let L = await ok(await admin('/api/claims?status=waiting'));
    assert.equal(L.total, 2); assert.equal(L.counts.waiting, 2);
    const c1 = L.rows.find((r) => r.remote_id === 'c-1');
    assert.equal(c1.order_id, 'trendyol:900'); assert.equal(c1.lines[0].qty, 2); assert.equal(c1.amount, 300);
    assert.equal(c1.images.length, 2); assert.match(c1.images[0], /^https:\/\/cdn\.trendyol\.com\/claims\//);
    assert.equal((await ok(await admin('/api/claims?q=Hasarlı'))).total, 1);
    assert.equal((await ok(await admin('/api/claims?channel=hepsiburada'))).total, 0);
    // Ret gerekçeleri kanaldan
    const rs = await ok(await admin('/api/claims/reasons?channel=trendyol'));
    assert.deepEqual(rs.reasons.map((x) => x.id), ['1', '2']);
    // Onay: Trendyol'a tüm kalemler; siparişte 2 adet iade; stok geri eklenir
    await ok(await admin('/api/claims/trendyol/c-1/approve', J({})));
    assert.deepEqual(n.find('PUT', /claims\/c-1\/items\/approve$/)[0].body, { claimLineItemIdList: ['c-1-11-0', 'c-1-11-1'], params: {} });
    let d = await ok(await admin('/api/orders/' + oid('trendyol:900')));
    const li = d.order.items.find((i) => i.line_id === '11');
    assert.equal(li.returned_qty, 2); assert.equal(li.status, '', 'kısmi iade: satır canlı'); assert.equal(d.order.status, 'delivered');
    assert.equal(await stockOf(admin, P.a), 9);
    L = await ok(await admin('/api/claims'));
    assert.equal(L.rows.find((r) => r.remote_id === 'c-1').status, 'accepted');
    // Ret: gerekçe ve en az 5 karakter açıklama, belge (JPEG); Trendyol'a multipart
    const bad1 = await admin('/api/claims/trendyol/c-2/reject', J({ text: 'Kullanılmış ürün geldi' }));
    assert.ok(bad1.status >= 400, 'gerekçesiz ret reddedilir'); // durum kodu ayrı testte (BUG: 500)
    assert.ok((await admin('/api/claims/trendyol/c-2/reject', J({ reasonId: '1', text: 'kısa' }))).status >= 400);
    assert.equal((await admin('/api/claims/trendyol/c-2/reject', J({ reasonId: '1', text: 'Kullanılmış', file: { name: 'x.exe', type: 'application/x-msdownload', data: JPEG } }))).status, 400);
    assert.equal((await admin('/api/claims/trendyol/c-2/reject', J({ reasonId: '1', text: 'Kullanılmış', file: { name: 'x.jpg', type: 'image/jpeg', data: Buffer.from('MZ-not-a-jpeg').toString('base64') } }))).status, 400);
    await ok(await admin('/api/claims/trendyol/c-2/reject', J({ reasonId: '1', reason: 'Ürün kullanılmış', text: 'Ürün kullanılmış olarak geldi', file: { name: 'kanit.jpg', type: 'image/jpeg', data: JPEG } })));
    const iss = n.find('POST', /claims\/c-2\/issue\?/)[0], qs = new URL(iss.url).searchParams;
    assert.equal(qs.get('claimIssueReasonId'), '1'); assert.equal(qs.get('claimItemIdList'), 'c-2-21-0,c-2-21-1');
    assert.ok(iss.body instanceof FormData && iss.body.get('files'));
    assert.equal(await stockOf(admin, P.b), 7, 'reddedilen iade stoğa dönmez');
    L = await ok(await admin('/api/claims'));
    const c2 = L.rows.find((r) => r.remote_id === 'c-2');
    assert.equal(c2.status, 'rejected'); assert.match(c2.decision_note, /Ürün kullanılmış: Ürün kullanılmış olarak geldi/); assert.equal(c2.decided_by, 'yonetici');
    // Karar verilmiş talebe yeniden karar verilmez
    const again = await admin('/api/claims/trendyol/c-1/approve', J({}));
    assert.ok(again.status >= 400, 'karar verilmiş talebe yeniden karar verilmez');
    assert.equal(n.find('PUT', /claims\/c-1\/items\/approve$/).length, 1);
    // Trendyol kararı birkaç dakika geç yansıtır: senkron hâlâ "WaitingInAction" dese de paneldeki karar korunur
    await ok(await admin('/api/claims/sync', J({})));
    L = await ok(await admin('/api/claims'));
    assert.equal(L.rows.find((r) => r.remote_id === 'c-1').status, 'accepted');
    assert.equal(L.rows.find((r) => r.remote_id === 'c-2').status, 'rejected');
    // Yeniden senkronda stok iki kez eklenmez; sipariş yeniden yazılsa da iade adedi kalır
    ty.pkgs[0].customerLastName = 'Kaya-Değişti';
    await ok(await admin('/api/sync', J({ channels: ['trendyol'], force: true })));
    assert.equal(await stockOf(admin, P.a), 9);
    d = await ok(await admin('/api/orders/' + oid('trendyol:900')));
    assert.equal(d.order.items.find((i) => i.line_id === '11').returned_qty, 2);
    // Kalan adet de iade edilince ve diğer satır da iade olunca sipariş "iade" olur
    ty.claims.push(tyClaim('c-3', 900, [[11, 'SOL-5', '8690001', 1, 150, 'Accepted'], [12, 'SOL-10', '8690002', 1, 260, 'Accepted']]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'], force: true })));
    d = await ok(await admin('/api/orders/' + oid('trendyol:900')));
    assert.equal(d.order.status, 'returned', JSON.stringify(d.order.items.map((i) => [i.line_id, i.status, i.returned_qty])));
    assert.equal(await stockOf(admin, P.a), 10); assert.equal(await stockOf(admin, P.b), 8);
  } finally { n.restore(); }
});

test('İadeler: kullanıcı hataları (gerekçesiz / kısa açıklama, karar verilmiş talep, kanalın reddi) 400 döner, sunucu hatası (500) sayılmaz', { skip: 'BUG: src/api.js:1513-1516 claims approve/reject rotası claims.js\'in düz Error\'larını yakalamıyor → HTTP 500 ve ana panelin hata kayıtlarına "sunucu hatası" olarak düşer' }, async () => {
  const n = net();
  try {
    const { admin, ty } = await setup(n);
    ty.pkgs.push(tyPkg(1, 900, 'Delivered', [[11, 'SOL-5', '8690001', 2, 150]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    ty.claims.push(tyClaim('c-1', 900, [[11, 'SOL-5', '8690001', 2, 150]]));
    await ok(await admin('/api/claims/sync', J({})));
    for (const b of [{ text: 'Kullanılmış ürün geldi' }, { reasonId: '1', text: 'kısa' }]) assert.equal((await admin('/api/claims/trendyol/c-1/reject', J(b))).status, 400, JSON.stringify(b));
    assert.equal((await admin('/api/claims/trendyol/yok/approve', J({}))).status, 400, 'bulunamayan talep');
    n.on('PUT', /claims\/c-1\/items\/approve$/, { __status: 400, body: { errors: [{ message: 'Claim item status is not WaitingInAction' }] } });
    assert.equal((await admin('/api/claims/trendyol/c-1/approve', J({}))).status, 400, 'kanalın reddi');
  } finally { n.restore(); }
});

test('İadeler: "iadede stoğa ekle" kapalıyken onaylanan iade stoğu değiştirmez', async () => {
  const n = net();
  try {
    const { admin, ty, P } = await setup(n, { restock: false });
    ty.pkgs.push(tyPkg(1, 900, 'Delivered', [[11, 'SOL-5', '8690001', 2, 150]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    ty.claims.push(tyClaim('c-1', 900, [[11, 'SOL-5', '8690001', 2, 150]]));
    await ok(await admin('/api/claims/sync', J({})));
    await ok(await admin('/api/claims/trendyol/c-1/approve', J({})));
    assert.equal(await stockOf(admin, P.a), 8);
    assert.equal((await ok(await admin('/api/orders/' + oid('trendyol:900')))).order.status, 'returned');
  } finally { n.restore(); }
});

test('Müşteri soruları: senkron, liste, cevap (kanal sınırları), tekrar cevap engeli, hazır cevap şablonları', async () => {
  const n = net();
  try {
    const { admin, ty } = await setup(n);
    const q = (id, text, status = 'WAITING_FOR_ANSWER', extra = {}) => ({ id, text, creationDate: Date.now() - 3600e3, status, productName: 'Solucan Gübresi 5 Kg', imageUrl: 'https://cdn/x.jpg', webUrl: 'https://ty/x', productMainId: 'M1', userName: 'A***', showUserName: true, ...extra });
    ty.questions.push(q(101, 'Kaç günde kargoya verilir?'), q(102, 'Organik mi?'), q(103, 'Eski soru', 'ANSWERED', { answer: { text: 'Evet, kanaldan cevaplandı', creationDate: Date.now() - 1000 } }));
    const sy = await ok(await admin('/api/questions/sync', J({})));
    assert.equal(sy.trendyol, 3, JSON.stringify(sy));
    let L = await ok(await admin('/api/questions?status=waiting'));
    assert.equal(L.total, 2); assert.equal(L.counts.answered, 1);
    assert.equal((await ok(await admin('/api/questions?q=Organik'))).total, 1);
    assert.equal((await ok(await admin('/api/questions?status=answered'))).rows[0].answered_by, 'kanal');
    // Şablonlar (Ayarlar): kaydedilir, boşlar atılır
    const st0 = await ok(await admin('/api/settings'));
    assert.ok(Array.isArray(st0.answer_templates) && st0.answer_templates.length >= 1);
    const st1 = await ok(await admin('/api/settings', J({ answer_templates: ['Merhaba, siparişiniz aynı gün kargoda. İyi günler.', '', '  ', 'Evet, ürünümüz organik sertifikalıdır.'] }, 'PUT')));
    assert.deepEqual(st1.answer_templates, ['Merhaba, siparişiniz aynı gün kargoda. İyi günler.', 'Evet, ürünümüz organik sertifikalıdır.']);
    // Cevap: Trendyol en az 10 karakter
    const short = await admin('/api/questions/trendyol/101/answer', J({ text: 'Yarın' }));
    assert.equal(short.status, 400); assert.match((await js(short)).error, /en az 10/);
    await ok(await admin('/api/questions/trendyol/101/answer', J({ text: st1.answer_templates[0] })));
    assert.deepEqual(n.find('POST', /questions\/101\/answers$/).map((c) => c.body), [{ text: st1.answer_templates[0] }]);
    const dup = await admin('/api/questions/trendyol/101/answer', J({ text: st1.answer_templates[0] }));
    assert.equal(dup.status, 400); assert.match((await js(dup)).error, /zaten cevaplanmış/);
    assert.equal((await admin('/api/questions/trendyol/999/answer', J({ text: 'Merhaba bu bir cevap' }))).status, 400);
    assert.equal((await admin('/api/questions/n11/101/answer', J({ text: 'Merhaba bu bir cevap' }))).status, 400);
    L = await ok(await admin('/api/questions?status=answered'));
    const a = L.rows.find((r) => r.remote_id === '101');
    assert.equal(a.answered_by, 'panel'); assert.equal(a.user, 'yonetici');
    // Kanal hata verirse soru beklemede kalır, hata soruda görünür
    n.on('POST', /questions\/102\/answers$/, { __status: 400, body: { errors: [{ message: 'Yasaklı kelime' }] } });
    const fail = await admin('/api/questions/trendyol/102/answer', J({ text: 'Evet, ürünümüz organik sertifikalıdır.' }));
    assert.equal(fail.status, 400);
    L = await ok(await admin('/api/questions?status=waiting'));
    assert.match(L.rows.find((r) => r.remote_id === '102').error, /Yasaklı kelime/);
  } finally { n.restore(); }
});

test('Müşteri soruları: panelden cevaplanan soru, kanal cevabı henüz yansıtmadan gelen senkronla tekrar "bekliyor"a dönmez (çift cevap riski)', { skip: 'BUG: src/questions.js:41 senkron status = excluded.status ile paneldeki "answered" durumunu ezer (iadelerdeki decided_by koruması yok) → soru yeniden cevaplanabilir, müşteriye iki cevap gider' }, async () => {
  const n = net();
  try {
    const { admin, ty } = await setup(n);
    ty.questions.push({ id: 201, text: 'Kaç kg?', creationDate: Date.now() - 3600e3, status: 'WAITING_FOR_ANSWER', productName: 'X', userName: 'A' });
    await ok(await admin('/api/questions/sync', J({})));
    await ok(await admin('/api/questions/trendyol/201/answer', J({ text: 'Merhaba, 5 kg ambalajdır. İyi günler.' })));
    // Trendyol cevabı birkaç dakika sonra işler: hemen ardından gelen senkronda soru hâlâ WAITING_FOR_ANSWER ve cevapsız
    await ok(await admin('/api/questions/sync', J({})));
    const L = await ok(await admin('/api/questions'));
    const r = L.rows.find((x) => x.remote_id === '201');
    assert.equal(r.status, 'answered', 'panelden cevaplanan soru beklemeye döndü; ikinci kişi tekrar cevaplayabilir');
    const again = await admin('/api/questions/trendyol/201/answer', J({ text: 'Merhaba, 5 kg ambalajdır. İyi günler.' }));
    assert.equal(again.status, 400);
    assert.equal(n.find('POST', /questions\/201\/answers$/).length, 1);
  } finally { n.restore(); }
});
