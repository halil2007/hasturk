// Uçtan uca: eşzamanlılık — iki kullanıcı aynı ürünü / aynı siparişi aynı anda düzenler (Promise.all): bozuk durum, 500 ya da
// çift kanal / kargo işlemi olmamalı; aynı alanda son yazan kazanır.
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

// Ana panel (kendi mağazanız): veritabanı D1 — her sorgu ağ gidiş-dönüşü olduğundan aynı anda gelen iki istek sorgular arasında
// gerçekten iç içe çalışır. (Müşteri panelinde veritabanı Durable Object'in kendi SQLite'ı: istekler yalnız kanal / kargo
// çağrısı gibi gerçek ağ beklemelerinde iç içe geçer — o senaryolar aşağıda gecikmeli sahte kanalla.)
// D1 gibi: her sorgu / toplu yazım 1–4 ms ağ gecikmesiyle (sorgular arasında başka istek çalışabilir)
function slowD1(db) {
  const lag = () => new Promise((r) => setTimeout(r, 1 + Math.floor(Math.random() * 4)));
  const wrap = (st) => ({
    get sql() { return st.sql; }, get args() { return st.args; },
    bind: (...a) => wrap(st.bind(...a)),
    st: () => st.st(), runSync: () => st.runSync(),
    all: async () => { await lag(); return st.all(); }, first: async (c) => { await lag(); return st.first(c); }, run: async () => { await lag(); return st.run(); },
  });
  return { prepare: (q) => wrap(db.prepare(q)), batch: async (sts) => { await lag(); return db.batch(sts.map((x) => (x.st ? { sql: x.sql, args: x.args, st: x.st, runSync: x.runSync } : x))); }, exec: (q) => db.exec(q), raw: db.raw };
}
async function mainPanel() {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: slowD1(d1()) };
  const jars = {}, pending = [];
  const as = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Fresh': '1', Cookie: jars[who] || '', ...(opts.headers || {}) } }), env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
    const sc = r.headers.get('set-cookie');
    if (sc) jars[who] = sc.split(';')[0];
    return r;
  };
  const A = as('a');
  assert.equal((await A('/api/login', J({ password: 'x-123456' }))).status, 200);
  assert.equal((await A('/api/users', J({ username: 'ikinci', name: 'İkinci', password: 'ikinci-sifre-1', role: 'admin' }))).status, 200);
  const B = as('b');
  assert.equal((await B('/api/login', J({ username: 'ikinci', password: 'ikinci-sifre-1' }))).status, 200);
  const settle = async () => { for (let i = 0; i < 20 && pending.length; i++) await Promise.all(pending.splice(0)); };
  return { env, A, B, settle, db: env.DB };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const both = (a, b) => Promise.all([a, b]);
const no500 = (...rs) => { for (const r of rs) assert.ok(r.status < 500, 'HTTP ' + r.status); };

test('Eşzamanlı: iki kullanıcı aynı ürünün farklı alanlarını aynı anda düzenler — iki değişiklik de kalır, 500 yok', async () => {
  const { A, B } = await mainPanel();
  const p = await ok(await A('/api/products', J({ name: 'Ürün', sku: 'U-1', sale_price: 100, purchase_price: 40, stock: 10 })));
  const [r1, r2] = await both(A(`/api/products/${p.id}`, J({ name: 'Ürün (A)', sale_price: 111 }, 'PUT')), B(`/api/products/${p.id}`, J({ purchase_price: 55, critical_stock: 3 }, 'PUT')));
  no500(r1, r2); await ok(r1); await ok(r2);
  const d = await ok(await A(`/api/products/${p.id}`));
  assert.deepEqual([d.name, d.sale_price, d.purchase_price, d.critical_stock, d.stock], ['Ürün (A)', 111, 55, 3, 10]);
  // Aynı alan: son yazan kazanır (değer ikisinden biri, bozulmaz)
  const [r3, r4] = await both(A(`/api/products/${p.id}`, J({ sale_price: 120 }, 'PUT')), B(`/api/products/${p.id}`, J({ sale_price: 130 }, 'PUT')));
  no500(r3, r4);
  assert.ok([120, 130].includes((await ok(await A(`/api/products/${p.id}`))).sale_price));
});

test('Eşzamanlı: iki kullanıcı aynı anda stok girişi yapar (+) — ikisi de eklenir', async () => {
  const { A, B } = await mainPanel();
  const p = await ok(await A('/api/products', J({ name: 'Ürün', sku: 'U-1', stock: 10 })));
  const rs = await Promise.all([A(`/api/products/${p.id}/stock`, J({ mode: 'add', qty: 1 })), B(`/api/products/${p.id}/stock`, J({ mode: 'add', qty: 2 })), A(`/api/products/${p.id}/stock`, J({ mode: 'add', qty: -1 }))]);
  no500(...rs);
  const d = await ok(await A(`/api/products/${p.id}`));
  assert.equal(d.stock, 12);
  assert.equal(d.moves[0].stock_after, 12, 'hareket kaydı son stokla tutarlı');
});

test('Eşzamanlı: iki kullanıcı aynı ürüne aynı anda sayım yapar (stok = N) — sonuç girilen değerlerden biri olmalı', async () => {
  const { A, B } = await mainPanel();
  const p = await ok(await A('/api/products', J({ name: 'Ürün', sku: 'U-1', stock: 10 })));
  const [r1, r2] = await both(A(`/api/products/${p.id}/stock`, J({ mode: 'set', qty: 5 })), B(`/api/products/${p.id}/stock`, J({ mode: 'set', qty: 7 })));
  no500(r1, r2);
  const d = await ok(await A(`/api/products/${p.id}`));
  assert.ok([5, 7].includes(d.stock), 'stok ' + d.stock);
});

test('Eşzamanlı: aynı SKU ile aynı anda iki ürün açılır — biri 400 ile reddedilir, 500 ve mükerrer kart yok', async () => {
  const { A, B } = await mainPanel();
  const [r1, r2] = await both(A('/api/products', J({ name: 'X', sku: 'AYNI-1' })), B('/api/products', J({ name: 'Y', sku: 'AYNI-1' })));
  const [r3, r4] = await both(A('/api/products', J({ name: 'X', sku: 'abc-1' })), B('/api/products', J({ name: 'Y', sku: 'ABC-1' })));
  const cards = (await ok(await A('/api/products?q=abc-1'))).total;
  assert.deepEqual({ same: [r1.status, r2.status].sort(), cased: [r3.status, r4.status].sort(), cards }, { same: [200, 400], cased: [200, 400], cards: 1 });
});

test('Eşzamanlı: aynı siparişi iki kullanıcı aynı anda böler / etiket alır — paketler çoğalmaz, ürün adedi korunur', async () => {
  const n = net();
  try {
    const { A, B } = await mainPanel();
    await ok(await A('/api/integrations/ikas1', J({ values: IK }, 'PUT')));
    const ik = ikasMock(n);
    ik.orders.push(ikasOrder('io1', 1001, [['li1', 'SOL-5', 2, 150]]), ikasOrder('io2', 1002, [['li2', 'SOL-5', 2, 150]]));
    await ok(await A('/api/sync', J({ channels: ['ikas1'] })));
    const id = oid('ikas1:io1');
    const [r1, r2] = await both(A(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: 'li1', qty: 1 }] }, { items: [{ line_id: 'li1', qty: 1 }] }] })),
      B(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: 'li1', qty: 2 }] }] })));
    no500(r1, r2);
    const d = await ok(await A('/api/orders/' + id));
    const qty = d.order.packages.flatMap((p) => p.items).reduce((s, x) => s + x.qty, 0);
    assert.equal(qty, 2, 'paketlerdeki toplam adet: ' + JSON.stringify(d.order.packages.map((p) => p.items)));
    // Paketi olmayan siparişte iki kişi aynı anda "etiket" der: tek paket açılmalı
    const id2 = oid('ikas1:io2');
    no500(...await both(A(`/api/orders/${id2}/label`, J({})), B(`/api/orders/${id2}/label`, J({}))));
    assert.equal((await ok(await A('/api/orders/' + id2))).order.packages.length, 1);
  } finally { n.restore(); }
});

test('Eşzamanlı: işleme al + not aynı anda (müşteri paneli, gecikmeli kanal) — ikisi de uygulanır, durum bozulmaz', async () => {
  const n = net();
  try {
    const { admin, staff } = await panel();
    await ok(await admin('/api/settings', J({ stock_sync: true }, 'PUT')));
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.pkgs.push(tyPkg(1, 900, 'Created', [[11, 'SOL-5', '8690001', 1, 150]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    const S = await staff('ikinci', null);
    n.on('PUT', /\/shipment-packages\/\d+$/, async (c) => { await sleep(30); ty.pkgs[0].status = c.body.status; return {}; });
    const id = oid('trendyol:900');
    const [r1, r2, r3] = await Promise.all([admin(`/api/orders/${id}/accept`, J({})), S(`/api/orders/${id}/note`, J({ note: 'Acil' })), S(`/api/orders/${id}/accept`, J({}))]);
    no500(r1, r2, r3);
    assert.ok([r1.status, r3.status].includes(200) && [r1.status, r3.status].every((s) => s === 200 || s === 400 || s === 409), `${r1.status} / ${r3.status}`);
    const d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.status, 'processing'); assert.equal(d.order.note, 'Acil');
  } finally { n.restore(); }
});

test('Eşzamanlı: "Entegratörle gönder"e iki kez basılır (çift tık / iki kullanıcı) — kargo firmasında tek gönderi açılmalı', async () => {
  const n = net();
  try {
    const { admin, staff } = await panel({ plan: 'Kurumsal' });
    await ok(await admin('/api/settings', J({ sender: { name: 'E2E Depo', phone: '03320000000', address: 'Sanayi Cd. No 1', city: 'Selçuklu / Konya' } }, 'PUT')));
    await ok(await admin('/api/integrations/ikas1', J({ values: IK }, 'PUT')));
    await ok(await admin('/api/integrations/carriers/kargonomi', J({ values: { KARGONOMI_API_KEY: 'tok', KARGONOMI_WAREHOUSE: '1' } }, 'PUT')));
    const ik = ikasMock(n), kg = kargonomiMock(n);
    ik.orders.push(ikasOrder('io1', 1001, [['li1', 'SOL-5', 1, 150]]));
    await ok(await admin('/api/sync', J({ channels: ['ikas1'] })));
    n.on('POST', /app\.kargonomi\.com\.tr\/api\/v1\/shipments$/, async () => { await sleep(40); return { data: { id: 900 + (++kg.created), status: 'draft' } }; });
    const S = await staff('ikinci', null);
    const id = oid('ikas1:io1');
    await ok(await admin(`/api/orders/${id}/label`, J({})).catch(() => ({ status: 200, text: async () => '{}' }))); // paket oluşsun
    const pk = (await ok(await admin('/api/orders/' + id))).order.packages[0];
    const [r1, r2] = await both(admin(`/api/orders/${id}/carrier-label`, J({ package_id: pk.id, firm_id: '11' })), S(`/api/orders/${id}/carrier-label`, J({ package_id: pk.id, firm_id: '11' })));
    no500(r1, r2);
    assert.equal(kg.created, 1, `Kargonomi\'de ${kg.created} gönderi açıldı (HTTP ${r1.status} / ${r2.status})`);
  } finally { n.restore(); }
});

test('Eşzamanlı: iki kullanıcı aynı soruyu aynı anda cevaplar — müşteriye tek cevap gitmeli', async () => {
  const n = net();
  try {
    const { admin, staff } = await panel();
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.questions.push({ id: 101, text: 'Kaç günde gelir?', creationDate: Date.now(), status: 'WAITING_FOR_ANSWER', productName: 'X', userName: 'A' });
    await ok(await admin('/api/questions/sync', J({})));
    n.on('POST', /\/questions\/101\/answers$/, async () => { await sleep(30); return {}; });
    const S = await staff('ikinci', null);
    const [r1, r2] = await both(admin('/api/questions/trendyol/101/answer', J({ text: 'Merhaba, yarın kargoda.' })), S('/api/questions/trendyol/101/answer', J({ text: 'Merhaba, bugün kargoya veriyoruz.' })));
    no500(r1, r2);
    assert.equal(n.find('POST', /\/questions\/101\/answers$/).length, 1);
  } finally { n.restore(); }
});

test('Eşzamanlı: iki kullanıcı aynı iade talebini aynı anda onaylar — kanala tek onay, stok bir kez', async () => {
  const n = net();
  try {
    const { admin, staff } = await panel();
    await ok(await admin('/api/settings', J({ stock_sync: true, restock_returns: true }, 'PUT')));
    const p = await ok(await admin('/api/products', J({ name: 'Ürün', sku: 'SOL-5', stock: 10 })));
    await sleep(5);
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.pkgs.push(tyPkg(1, 900, 'Delivered', [[11, 'SOL-5', '8690001', 2, 150]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    ty.claims.push({ id: 'c-1', orderNumber: '900', claimDate: Date.now(), items: [{ orderLine: { id: 11, productName: 'Ürün', barcode: '8690001', merchantSku: 'SOL-5', price: 150 }, claimItems: [{ id: 'ci-1', claimItemStatus: { name: 'WaitingInAction' }, customerClaimItemReason: { name: 'x' } }] }] });
    await ok(await admin('/api/claims/sync', J({})));
    n.on('PUT', /\/claims\/c-1\/items\/approve$/, async () => { await sleep(30); return {}; });
    const S = await staff('ikinci', null);
    const [r1, r2] = await both(admin('/api/claims/trendyol/c-1/approve', J({})), S('/api/claims/trendyol/c-1/approve', J({})));
    // Stok bir kez eklenir (order_stock koşullu yazım), sipariş satırında 1 adet iade
    assert.equal((await ok(await admin(`/api/products/${p.id}`))).stock, 9);
    const approves = n.find('PUT', /\/claims\/c-1\/items\/approve$/).length;
    // Kanala çift onay ve ikinci isteğin sonucu raporda (bkz. BUG notu); durum bozulmaz
    assert.ok([r1.status, r2.status].includes(200));
    assert.equal(approves, 1, `kanala ${approves} onay isteği gitti (HTTP ${r1.status} / ${r2.status})`);
  } finally { n.restore(); }
});

test('Eşzamanlı: hızlı market siparişinde "Hazırlandı"ya iki kez basılır — Trendyol Go\'ya tek "invoiced"', async () => {
  const n = net();
  try {
    const { admin, staff } = await panel();
    await ok(await admin('/api/integrations/trendyolgo', J({ values: TGO }, 'PUT')));
    const tg = tgoMock(n);
    tg.pkgs.push(tgoPkg('pk-a', 'G100', 'Picking', [['8690001', 'Süt', 1, 30]]));
    assert.equal((await ok(await admin('/api/integrations/trendyolgo/test', J({})))).ok, true);
    await ok(await admin('/api/sync', J({ channels: ['trendyolgo'] })));
    n.on('GET', /\/orders\/[^/]+\/invoice-amount$/, async () => { await sleep(30); return { minInvoiceAmount: 1, maxInvoiceAmount: 100 }; });
    const S = await staff('ikinci', null);
    const id = oid('trendyolgo:G100');
    const [r1, r2] = await both(admin(`/api/orders/${id}/ship`, J({})), S(`/api/orders/${id}/ship`, J({})));
    no500(r1, r2);
    assert.equal(n.find('PUT', /\/invoiced$/).length, 1);
  } finally { n.restore(); }
});
