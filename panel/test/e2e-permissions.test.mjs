// Uçtan uca: yetkiler — sınırlı yetkili personel izinli bölümde tam, diğerlerinde 403; Başlangıç paketinde paket kilitli özellikler 403.
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

async function seed(admin, n) {
  await ok(await admin('/api/settings', J({ stock_sync: true, sender: { name: 'E2E Depo', phone: '03320000000', address: 'Sanayi Cd. No 1', city: 'Selçuklu / Konya' } }, 'PUT')));
  const a = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 5 Kg', sku: 'SOL-5', barcode: '8690001', stock: 10, sale_price: 150 })));
  await new Promise((r) => setTimeout(r, 5));
  await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
  const ty = trendyolMock(n);
  ty.pkgs.push(tyPkg(1, 900, 'Created', [[11, 'SOL-5', '8690001', 1, 150]]), tyPkg(2, 901, 'Created', [[21, 'SOL-5', '8690001', 1, 150]]));
  ty.questions.push({ id: 101, text: 'Kaç günde gelir?', creationDate: Date.now(), status: 'WAITING_FOR_ANSWER', productName: 'X', userName: 'A' });
  await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
  await ok(await admin('/api/questions/sync', J({})));
  return { pid: a.id, ty };
}
const codes = async (who, list) => {
  const out = {};
  for (const [k, path, opts] of list) out[k] = (await who(path, opts)).status;
  return out;
};

test('Personel yetkileri: depo (sipariş + kargo + stok, ürün yalnız görüntüleme) — izinli yerde tam, diğerlerinde 403', async () => {
  const n = net();
  try {
    const p = await panel({ plan: 'Profesyonel' });
    const { pid } = await seed(p.admin, n);
    const S = await p.staff('depo', ['orders', 'cargo', 'stock', 'products:view']);
    const me = await ok(await S('/api/me'));
    assert.deepEqual(me.user.perms, ['orders', 'cargo', 'stock', 'products:view']);
    const r = await codes(S, [
      ['ordersList', '/api/orders'], ['orderDetail', '/api/orders/' + oid('trendyol:900')], ['accept', `/api/orders/${oid('trendyol:900')}/accept`, J({})],
      ['note', `/api/orders/${oid('trendyol:900')}/note`, J({ note: 'depo notu' })], ['label', `/api/orders/${oid('trendyol:900')}/label`, J({})],
      ['packages', '/api/packages'], ['picklist', '/api/picklist'], ['bulkLabels', '/api/labels', J({ ids: ['trendyol:901'] })],
      ['stock', `/api/products/${pid}/stock`, J({ mode: 'add', qty: 1 })], ['pushStock', '/api/push-stock', J({})],
      ['productsList', '/api/products'], ['productDetail', `/api/products/${pid}`],
      ['productCreate', '/api/products', J({ name: 'Yeni' })], ['productEdit', `/api/products/${pid}`, J({ sale_price: 1 }, 'PUT')], ['productDelete', `/api/products/${pid}`, { method: 'DELETE' }],
      ['barcodes', '/api/products/barcodes', J({ ids: [pid] })],
      ['questions', '/api/questions'], ['answer', '/api/questions/trendyol/101/answer', J({ text: 'Merhaba, yarın kargoda.' })],
      ['claims', '/api/claims'], ['stats', '/api/stats'], ['customers', '/api/customers'], ['finance', '/api/finance'], ['match', '/api/match'],
      ['users', '/api/users'], ['integrations', '/api/integrations'], ['settingsPut', '/api/settings', J({ low_stock: 1 }, 'PUT')],
      ['orderDelete', '/api/orders/' + oid('trendyol:901'), { method: 'DELETE' }], ['bulkDelete', '/api/orders-bulk', J({ ids: ['trendyol:901'], action: 'delete' })],
      ['billing', '/api/billing'],
    ]);
    assert.deepEqual(r, {
      ordersList: 200, orderDetail: 200, accept: 200, note: 200, label: 200, packages: 200, picklist: 200, bulkLabels: 200, stock: 200, pushStock: 200,
      productsList: 200, productDetail: 200, productCreate: 403, productEdit: 403, productDelete: 403, barcodes: 403,
      questions: 403, answer: 403, claims: 403, stats: 403, customers: 403, finance: 403, match: 403,
      users: 403, integrations: 403, settingsPut: 403, orderDelete: 403, bulkDelete: 403, billing: 403,
    });
    // Personelin işlemi sipariş geçmişinde adıyla görünür
    const d = await ok(await p.admin('/api/orders/' + oid('trendyol:900')));
    assert.ok(d.order.events.some((e) => e.action === 'accept' && e.user === 'depo'));
  } finally { n.restore(); }
});

test('Personel yetkileri: müşteri hizmetleri (sipariş görüntüleme, sorular, iadeler) — sipariş işlemi 403, soru cevaplama serbest', async () => {
  const n = net();
  try {
    const p = await panel({ plan: 'Profesyonel' });
    await seed(p.admin, n);
    const S = await p.staff('musteri', ['orders:view', 'cargo:view', 'returns', 'questions']);
    const r = await codes(S, [
      ['ordersList', '/api/orders'], ['accept', `/api/orders/${oid('trendyol:900')}/accept`, J({})], ['status', `/api/orders/${oid('trendyol:900')}/status`, J({ status: 'cancelled' })],
      ['bulk', '/api/orders-bulk', J({ ids: ['trendyol:900'], action: 'accept' })], ['csv', '/api/orders.csv'],
      ['packages', '/api/packages'], ['labelsMark', '/api/labels/mark', J({ kind: 'printed', items: [] })],
      ['questions', '/api/questions'], ['answer', '/api/questions/trendyol/101/answer', J({ text: 'Merhaba, yarın kargoda.' })], ['claims', '/api/claims'], ['claimSync', '/api/claims/sync', J({})],
      ['products', '/api/products'], ['stock', '/api/products/1/stock', J({ mode: 'add', qty: 1 })],
    ]);
    assert.deepEqual(r, { ordersList: 200, accept: 403, status: 403, bulk: 403, csv: 200, packages: 200, labelsMark: 403, questions: 200, answer: 200, claims: 200, claimSync: 200, products: 403, stock: 403 });
    assert.equal((await ok(await p.admin('/api/orders/' + oid('trendyol:900')))).order.status, 'new', '403 alan işlem siparişi değiştirmedi');
  } finally { n.restore(); }
});

test('Personel yetkileri: stok yalnız görüntüleme yetkisi olan katalog personeli ürün formundan / varyant düzenleyiciden stok değiştiremez', async () => {
  const n = net();
  try {
    const p = await panel({ plan: 'Profesyonel' });
    const { pid } = await seed(p.admin, n);
    const S = await p.staff('katalog', ['products', 'stock:view', 'orders:view']);
    const before = (await ok(await p.admin(`/api/products/${pid}`))).stock;
    assert.equal((await S(`/api/products/${pid}/stock`, J({ mode: 'set', qty: 99 }))).status, 403, 'doğrudan stok uç noktası kapalı');
    const put = await S(`/api/products/${pid}`, J({ sale_price: 175, stock: 99 }, 'PUT'));
    const vr = await S('/api/products-variants', J({ items: [{ id: pid, stock: 77 }] }));
    const st = (await ok(await p.admin(`/api/products/${pid}`))).stock;
    assert.equal(st, before, `stok değişmemeli (PUT ${put.status}, varyant ${vr.status}, stok ${st})`);
  } finally { n.restore(); }
});

test('Paket kilitleri: Başlangıç paketinde Profesyonel / Kurumsal özellikleri 403; personel yetki seçimi uygulanmaz', async () => {
  const n = net();
  try {
    const p = await panel({ plan: 'Başlangıç' });
    await seed(p.admin, n);
    const me = await ok(await p.admin('/api/me'));
    assert.equal(me.tenant.planName, 'Başlangıç');
    const r = await codes(p.admin, [
      ['carrierLabel', `/api/orders/${oid('trendyol:900')}/carrier-label`, J({})], ['carrierSave', '/api/integrations/carriers/kargonomi', J({ values: { KARGONOMI_API_KEY: 'x' } }, 'PUT')],
      ['fx', '/api/fx'], ['fxApply', '/api/fx/apply', J({})], ['buybox', '/api/buybox/check', J({})], ['priceRule', '/api/price-rules', J({ channel: 'trendyol', remote_id: '8690001', enabled: true, min_price: 1, max_price: 2 }, 'PUT')],
      ['csv', '/api/products.csv'], ['bulk', '/api/products/bulk', J({ rows: [] })], ['settlements', '/api/settlements'], ['invoices', '/api/invoices'],
      ['autoprice', '/api/settings', J({ autoprice: true }, 'PUT')], ['autoupload', '/api/settings', J({ auto_upload: { trendyol: true } }, 'PUT')],
      // Paketten bağımsız temel işlemler açık
      ['orders', '/api/orders'], ['accept', `/api/orders/${oid('trendyol:900')}/accept`, J({})], ['label', `/api/orders/${oid('trendyol:900')}/label`, J({})],
      ['finance', '/api/finance'], ['claims', '/api/claims'], ['questions', '/api/questions'], ['carriers', '/api/carriers'],
    ]);
    assert.deepEqual(r, { carrierLabel: 403, carrierSave: 403, fx: 403, fxApply: 403, buybox: 403, priceRule: 403, csv: 403, bulk: 403, settlements: 403, invoices: 403, autoprice: 403, autoupload: 403,
      orders: 200, accept: 200, label: 200, finance: 200, claims: 200, questions: 200, carriers: 200 });
    const cl = await js(await p.admin('/api/carriers'));
    assert.ok(cl.every((c) => c.locked && !c.usable));
    // Başlangıç: bölüm bazlı yetki yok → personel standart (tam) yetkiyle çalışır; yönetici işlemleri yine kapalı
    const S = await p.staff('veli', ['orders:view']);
    assert.equal((await ok(await S('/api/me'))).user.perms ?? null, null);
    assert.equal((await S(`/api/orders/${oid('trendyol:901')}/accept`, J({}))).status, 200);
    assert.equal((await S('/api/users')).status, 403);
    // Kullanıcı sınırı: 2 (yönetici + 1)
    assert.equal((await p.admin('/api/users', J({ username: 'ayse', name: 'Ayşe', password: 'personel-sifre-1', role: 'staff' }))).status, 400);
    // Profesyonel paketinde Kurumsal özellikleri (kendi kargo entegrasyonu, döviz) hâlâ kilitli
    assert.equal((await p.owner('/api/tenants/' + p.slug, J({ plan: 'Profesyonel' }, 'PUT'))).status, 200);
    assert.equal((await p.admin('/api/products.csv')).status, 200);
    assert.equal((await p.admin('/api/settlements')).status, 200);
    assert.equal((await p.admin(`/api/orders/${oid('trendyol:900')}/carrier-label`, J({}))).status, 403);
    assert.equal((await p.admin('/api/fx')).status, 403);
  } finally { n.restore(); }
});

test('Yönetici dışı rol: oturum yokken 401, başka firmanın siparişine erişim yok', async () => {
  const n = net();
  try {
    const p = await panel({ plan: 'Profesyonel', slug: 'firma-a' });
    await seed(p.admin, n);
    const anon = p.as('anon');
    assert.equal((await anon('/api/orders')).status, 401);
    assert.equal((await anon(`/api/orders/${oid('trendyol:900')}/accept`, J({}))).status, 401);
    // İkinci firma: aynı sipariş kimliği onun panelinde yok
    assert.equal((await p.owner('/api/tenants', J({ slug: 'firma-b', name: 'B', admin_username: 'bbyonetici', admin_password: 'gizli-sifre-2', plan: 'Profesyonel' }))).status, 200);
    const B = p.as('b');
    assert.equal((await B('/api/login', J({ tenant: 'firma-b', username: 'bbyonetici', password: 'gizli-sifre-2' }))).status, 200);
    assert.equal((await B('/api/orders/' + oid('trendyol:900'))).status, 404);
    assert.equal((await ok(await B('/api/orders'))).total, 0);
    // Başka siteden gelen yazma isteği reddedilir
    assert.equal((await p.admin(`/api/orders/${oid('trendyol:900')}/accept`, { method: 'POST', body: '{}', headers: { Origin: 'https://kotu.site' } })).status, 403);
  } finally { n.restore(); }
});
