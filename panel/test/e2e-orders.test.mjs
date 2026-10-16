// Uçtan uca: siparişler (müşteri paneli, HTTP API'si arayüzün yaptığı gibi). Senkron, liste / filtre / arama, ayrıntı; kanal türüne göre
// işleme al → paketle → etiket → kargoya ver: pazaryeri (Trendyol ortak etiketi, Hepsiburada paket bölme), kendi anlaşmalı kargo
// (ikas + Kargonomi entegratörü), hızlı market (Trendyol Go, platform kuryesi); paket bölme, iptal, not, toplu işlem, toplama listesi.
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

async function withProducts(admin) {
  await ok(await admin('/api/settings', J({ stock_sync: true, sender: { name: 'E2E Depo', phone: '03320000000', address: 'Sanayi Cd. No 1', city: 'Selçuklu / Konya' } }, 'PUT')));
  const a = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 5 Kg', sku: 'SOL-5', barcode: '8690001', stock: 10, sale_price: 150, purchase_price: 80 })));
  const b = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 10 Kg', sku: 'SOL-10', barcode: '8690002', stock: 5, sale_price: 260, purchase_price: 140 })));
  await new Promise((r) => setTimeout(r, 5)); // sipariş tarihi ürün kartından sonra olsun (stok düşümü)
  return { a: a.id, b: b.id };
}
const stockOf = async (admin, id) => (await ok(await admin(`/api/products/${id}`))).stock;

test('Trendyol: senkron, liste / filtre / arama / sayfa, ayrıntı, işleme al → etiket → yazdırıldı → kargoya ver; not, iptal, toplu, toplama listesi', async () => {
  const n = net();
  try {
    const { admin, settle } = await panel();
    const P = await withProducts(admin);
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.pkgs.push(
      tyPkg(1, 900, 'Created', [[11, 'SOL-5', '8690001', 2, 150], [12, 'SOL-10', '8690002', 1, 260, 'Cancelled']]),
      tyPkg(2, 901, 'Created', [[21, 'SOL-10', '8690002', 1, 260]]),
      tyPkg(3, 902, 'Created', [[31, 'SOL-5', '8690001', 1, 150]], { customerFirstName: 'Mehmet', customerLastName: 'Öz' }),
    );
    const sy = await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    assert.equal(sy.channels.trendyol, 3, JSON.stringify(sy));
    // Stok: satılan adet düşer (iptal satırı düşmez)
    assert.equal(await stockOf(admin, P.a), 7);
    assert.equal(await stockOf(admin, P.b), 4);
    // Liste, sayılar, filtreler, arama, sayfalama
    let L = await ok(await admin('/api/orders?status=new'));
    assert.equal(L.total, 3); assert.equal(L.counts.new, 3);
    assert.equal(L.orders.find((o) => o.order_number === '900').qty, 2, 'iptal satırı adede sayılmaz');
    assert.equal((await ok(await admin('/api/orders?q=Mehmet'))).total, 1);
    assert.equal((await ok(await admin('/api/orders?q=SOL-10'))).total, 2);
    assert.equal((await ok(await admin('/api/orders?q=7002'))).total, 1, 'takip no ile');
    assert.equal((await ok(await admin('/api/orders?channel=trendyol&status=active'))).total, 3);
    assert.equal((await ok(await admin('/api/orders?channel=hepsiburada'))).total, 0);
    assert.equal((await ok(await admin('/api/orders?channel=yok_boyle'))).total, 3, 'geçersiz kanal yok sayılır');
    const p1 = await ok(await admin('/api/orders?limit=2&page=1')), p2 = await ok(await admin('/api/orders?limit=2&page=2'));
    assert.equal(p1.orders.length, 2); assert.equal(p2.orders.length, 1);
    assert.equal(new Set([...p1.orders, ...p2.orders].map((o) => o.id)).size, 3);
    for (const q of ['page=0', 'page=-1', 'limit=0', 'limit=abc', 'from=2026-13-45', 'to=x', 'status=bogus']) assert.equal((await admin('/api/orders?' + q)).status, 200, q);
    const today = new Date(Date.now() + H3).toISOString().slice(0, 10);
    assert.equal((await ok(await admin(`/api/orders?from=${today}&to=${today}`))).total, 3);
    assert.equal((await ok(await admin('/api/orders?from=2020-01-01&to=2020-01-02'))).total, 0);
    // Ayrıntı
    const id = 'trendyol:900';
    let d = await ok(await admin('/api/orders/' + oid(id)));
    assert.equal(d.order.items.length, 2); assert.equal(d.order.packages.length, 1);
    assert.equal(d.order.packages[0].remote_id, '1'); assert.equal(d.order.packages[0].tracking, '7001');
    assert.equal(d.channel.caps.accept, 'remote');
    assert.equal((await admin('/api/orders/' + oid('trendyol:404'))).status, 404);
    // İşleme al → Trendyol'a Picking; ikinci kez reddedilir
    n.reset();
    await ok(await admin(`/api/orders/${oid(id)}/accept`, J({})));
    assert.deepEqual(n.find('PUT', /shipment-packages\/1$/).map((c) => c.body.status), ['Picking']);
    assert.equal((await admin(`/api/orders/${oid(id)}/accept`, J({}))).status, 400);
    // Not ve kargo gideri
    await ok(await admin(`/api/orders/${oid(id)}/note`, J({ note: 'Hediye paketi yapılacak', shipping_cost: '32.5' })));
    d = await ok(await admin('/api/orders/' + oid(id)));
    assert.equal(d.order.note, 'Hediye paketi yapılacak'); assert.equal(d.order.shipping_cost, 32.5); assert.equal(d.order.status, 'processing');
    // Etiket (tek tık: önce paketlenir, sonra Trendyol ortak etiketi ZPL)
    n.reset();
    const lb = await ok(await admin(`/api/orders/${oid(id)}/label`, J({})));
    assert.equal(lb.official && lb.official.format, 'zpl', JSON.stringify(lb).slice(0, 300));
    assert.match(lb.official.data, /\^FD7001\^FS/);
    const pid = lb.package_id;
    // Kargo ekranı: etiket var, yazdırılmadı → yazdırıldı
    assert.ok((await ok(await admin('/api/packages?state=ready'))).packages.some((p) => p.id === pid));
    await ok(await admin(`/api/orders/${oid(id)}/label-mark`, J({ package_id: pid, kind: 'printed' })));
    assert.ok((await ok(await admin('/api/packages?state=printed'))).packages.some((p) => p.id === pid));
    // Kayıtlı etiket tekrar istenince kanala gidilmez
    n.reset();
    await ok(await admin(`/api/orders/${oid(id)}/label`, J({ package_id: pid })));
    assert.equal(n.find('', /common-label/).length, 0);
    // Kargoya ver
    await ok(await admin(`/api/orders/${oid(id)}/ship`, J({ package_id: pid })));
    d = await ok(await admin('/api/orders/' + oid(id)));
    assert.equal(d.order.status, 'shipped'); assert.equal(d.order.packages[0].status, 'shipped');
    assert.ok(d.order.events.some((e) => e.action === 'ship'));
    assert.equal((await admin(`/api/orders/${oid(id)}/cancel-package`, J({ package_id: pid }))).status, 400, 'kargodaki paket iptal edilemez');
    // Kanal hâlâ Picking gösterse de sonraki senkronda geri gitmez; Shipped gelince değişmez
    ty.pkgs[0].status = 'Picking';
    await ok(await admin('/api/sync', J({ channels: ['trendyol'], force: true })));
    assert.equal((await ok(await admin('/api/orders/' + oid(id)))).order.status, 'shipped');
    // Kanalda iptal: stok geri eklenir
    ty.pkgs[1].status = 'Cancelled';
    await ok(await admin('/api/sync', J({ channels: ['trendyol'], force: true })));
    assert.equal((await ok(await admin('/api/orders/' + oid('trendyol:901')))).order.status, 'cancelled');
    assert.equal(await stockOf(admin, P.b), 5);
    // Panelden elle iptal: stok geri eklenir
    await ok(await admin(`/api/orders/${oid('trendyol:902')}/status`, J({ status: 'cancelled' })));
    await settle();
    assert.equal(await stockOf(admin, P.a), 8);
    assert.equal((await ok(await admin('/api/orders?status=cancelled'))).total, 2);
    assert.equal((await admin(`/api/orders/${oid('trendyol:902')}/status`, J({ status: 'bogus' }))).status, 400);
    // Toplu: yeni iki sipariş → işleme al; iptal edilene işlem yapılmaz (hata listesinde)
    ty.pkgs.push(tyPkg(4, 903, 'Created', [[41, 'SOL-5', '8690001', 1, 150]]), tyPkg(5, 904, 'Created', [[51, 'SOL-10', '8690002', 2, 260]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'], force: true })));
    const bk = await ok(await admin('/api/orders-bulk', J({ ids: ['trendyol:903', 'trendyol:904', 'trendyol:902', 'yok:1'], action: 'accept' })));
    assert.deepEqual(bk.done.sort(), ['trendyol:903', 'trendyol:904']);
    assert.equal(bk.errors.length, 2);
    // Toplama listesi: hazırlanacak siparişlerin ürün toplamı
    const pl = await ok(await admin('/api/picklist?channel=trendyol'));
    assert.equal(pl.orders, 2, JSON.stringify(pl).slice(0, 400));
    assert.equal(pl.totalQty, 3);
    // Toplu etiket (seçilen siparişler)
    const lbs = await ok(await admin('/api/labels', J({ ids: ['trendyol:903', 'trendyol:904'], fetch: true })));
    assert.equal(lbs.orders.length, 2); assert.deepEqual(lbs.errors, []);
    assert.ok(lbs.orders.every((o) => o.labels[0].official && o.labels[0].official.format === 'zpl'));
    await ok(await admin('/api/labels/mark', J({ kind: 'printed', items: lbs.orders.map((o) => ({ pkgId: o.labels[0].package_id, orderId: o.order.id })) })));
    assert.equal((await ok(await admin('/api/packages?state=printed&channel=trendyol'))).packages.length, 2);
    // CSV dışa aktarma
    const csv = await (await admin('/api/orders.csv?status=all')).text();
    assert.match(csv, /Sipariş no/); assert.equal(csv.trim().split('\r\n').length, 6);
  } finally { n.restore(); }
});

test('Trendyol: işleme alınmış (Picking) pakete etiket alırken Trendyol\'a yeniden "Picking" gönderilmez', async () => {
  // İşleme al Trendyol paketini Picking yapar ama paneldeki paket hâlâ "Created" görünür (remote_status güncellenmez);
  // "Paketle ve etiket al" aynı statüyü ikinci kez gönderir. Trendyol aynı statüye geçişi reddederse etiket alınamaz.
  const n = net();
  try {
    const { admin } = await panel();
    await withProducts(admin);
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.pkgs.push(tyPkg(1, 900, 'Created', [[11, 'SOL-5', '8690001', 1, 150]]));
    // Gerçek Trendyol: Picking → Picking geçişi hata verir
    n.on('PUT', /\/shipment-packages\/\d+$/, (c) => { const p = ty.pkgs[0]; if (p.status === c.body.status) return { __status: 400, body: { errors: [{ message: 'Paket statüsü zaten ' + p.status }] } }; p.status = c.body.status; return {}; });
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    await ok(await admin(`/api/orders/${oid('trendyol:900')}/accept`, J({})));
    const r = await admin(`/api/orders/${oid('trendyol:900')}/label`, J({}));
    const b = await js(r);
    assert.equal(r.status, 200, JSON.stringify(b));
    assert.equal(n.find('PUT', /shipment-packages\/1$/).length, 1, 'Picking yalnız bir kez gönderilmeli; gönderilenler: ' + JSON.stringify(n.find('PUT', /shipment-packages\/1$/).map((c) => c.body.status)));
    assert.equal(b.official && b.official.format, 'zpl');
  } finally { n.restore(); }
});

test('Trendyol: yeni siparişte doğrudan "Paketle ve etiket al": sipariş kendiliğinden işleme alınır, Picking bir kez gönderilir', async () => {
  const n = net();
  try {
    const { admin } = await panel();
    await withProducts(admin);
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.pkgs.push(tyPkg(1, 901, 'Created', [[11, 'SOL-5', '8690001', 1, 150]]));
    n.on('PUT', /\/shipment-packages\/\d+$/, (c) => { const p = ty.pkgs[0]; if (p.status === c.body.status) return { __status: 400, body: { errors: [{ message: 'Paket statüsü zaten ' + p.status }] } }; p.status = c.body.status; return {}; });
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    const r = await admin(`/api/orders/${oid('trendyol:901')}/label`, J({}));
    const b = await js(r);
    assert.equal(r.status, 200, JSON.stringify(b));
    assert.equal(b.order.status, 'processing', 'sipariş işleme alındı');
    assert.equal(n.find('PUT', /shipment-packages\/1$/).length, 1, 'Picking yalnız bir kez');
  } finally { n.restore(); }
});

test('Trendyol: paket bölme kanalda (asenkron) yapılır; yeni paketler yenile ile gelir', async () => {
  const n = net();
  try {
    const { admin } = await panel();
    await withProducts(admin);
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    ty.pkgs.push(tyPkg(1, 900, 'Created', [[11, 'SOL-5', '8690001', 2, 150], [12, 'SOL-10', '8690002', 1, 260]]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    const id = oid('trendyol:900');
    // Eksik / fazla dağıtım reddedilir
    assert.equal((await admin(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: '11', qty: 1 }] }] }))).status, 400);
    assert.equal((await admin(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: '99', qty: 1 }] }] }))).status, 400);
    const r = await ok(await admin(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: '11', qty: 2 }] }, { items: [{ line_id: '12', qty: 1 }] }] })));
    assert.equal(r.async, true); assert.equal(r.expect, 2);
    const sp = n.find('POST', /split-packages$/)[0];
    assert.deepEqual(sp.body, { splitPackages: [{ packageDetails: [{ orderLineId: 11, quantities: 2 }] }, { packageDetails: [{ orderLineId: 12, quantities: 1 }] }] });
    // Trendyol yeni paketleri oluşturdu (eski paket UnPacked)
    ty.pkgs[0].status = 'UnPacked';
    ty.pkgs.push(tyPkg(6, 900, 'Created', [[11, 'SOL-5', '8690001', 2, 150]], { originPackageIds: [1] }), tyPkg(7, 900, 'Created', [[12, 'SOL-10', '8690002', 1, 260]], { originPackageIds: [1] }));
    const rf = await ok(await admin(`/api/orders/${id}/refresh`, J({})));
    assert.deepEqual(rf.order.packages.map((p) => p.remote_id).sort(), ['6', '7']);
    assert.equal(rf.order.total, 560);
  } finally { n.restore(); }
});

test('Hepsiburada: panelde bölünen sipariş Hepsiburada\'da iki paket olur, etiket (bizim tasarım + HB barkodu), kargoya ver, paket iptali', async () => {
  const n = net();
  try {
    const { admin } = await panel();
    const P = await withProducts(admin);
    await ok(await admin('/api/integrations/hepsiburada', J({ values: HB }, 'PUT')));
    const hb = hepsiburadaMock(n);
    hb.lines.push(hbLine('L1', 500, 'SOL-5', 2, 300), hbLine('L2', 500, 'SOL-10', 1, 260));
    const sy = await ok(await admin('/api/sync', J({ channels: ['hepsiburada'] })));
    assert.equal(sy.channels.hepsiburada, 1, JSON.stringify(sy));
    assert.equal(await stockOf(admin, P.a), 8);
    const id = oid('hepsiburada:500');
    let d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.items.length, 2); assert.equal(d.order.packages.length, 0);
    // Böl: 2 paket (her biri Hepsiburada'da paket oluşturma isteği)
    const s = await ok(await admin(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: 'L1', qty: 1 }] }, { items: [{ line_id: 'L1', qty: 1 }, { line_id: 'L2', qty: 1 }], desi: 3 }] })));
    assert.match(s.message, /2 paket/);
    const posts = n.find('POST', /packages\/merchantId\/[^/]+$/);
    assert.deepEqual(posts.map((c) => c.body.lineItemRequests), [[{ id: 'L1', quantity: 1 }], [{ id: 'L1', quantity: 1 }, { id: 'L2', quantity: 1 }]]);
    assert.equal(posts[1].body.deci, 3);
    d = await ok(await admin('/api/orders/' + id));
    assert.deepEqual(d.order.packages.map((p) => p.remote_id), ['P1', 'P2']);
    assert.equal(d.order.status, 'processing');
    // Paketlendikten sonra yeniden bölme engellenir (önce paketi iptal et)
    assert.equal((await admin(`/api/orders/${id}/split`, J({ groups: [{ items: [{ line_id: 'L1', qty: 2 }, { line_id: 'L2', qty: 1 }] }] }))).status, 400);
    // Etiket: Hepsiburada ZPL'i saklanır, bizim tasarımla HB barkodu basılır
    for (const p of d.order.packages) {
      const lb = await ok(await admin(`/api/orders/${id}/label`, J({ package_id: p.id })));
      assert.equal(lb.panel, true, JSON.stringify(lb).slice(0, 300));
    }
    d = await ok(await admin('/api/orders/' + id));
    assert.deepEqual(d.order.packages.map((p) => p.barcode), ['627500001', '627500002']);
    // İkinci paketi iptal et (unpack) → Hepsiburada'ya bildirilir, paket panelde yeniden paketlenebilir
    await ok(await admin(`/api/orders/${id}/cancel-package`, J({ package_id: d.order.packages[1].id })));
    assert.equal(hb.unpacked.length, 1);
    d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.packages[1].remote_id, null); assert.equal(d.order.packages[1].barcode, '');
    // Kargoya ver: ilk paket → kısmi; ikinci paket yeniden paketlenip verilir → sipariş kargoda
    const sh1 = await ok(await admin(`/api/orders/${id}/ship`, J({ package_id: d.order.packages[0].id })));
    assert.match(sh1.message, /1 paket kaldı/);
    await ok(await admin(`/api/orders/${id}/pack`, J({ package_id: d.order.packages[1].id })));
    d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.packages[1].remote_id, 'P3');
    await ok(await admin(`/api/orders/${id}/ship`, J({ package_id: d.order.packages[1].id })));
    assert.equal((await ok(await admin('/api/orders/' + id))).order.status, 'shipped');
  } finally { n.restore(); }
});

test('Kendi anlaşmalı kargo: ikas siparişi Kargonomi ile gönderilir (etiket, takip no ikas\'a yazılır, kargoya ver, iptal)', async () => {
  const n = net();
  try {
    const { admin } = await panel({ plan: 'Kurumsal' });
    const P = await withProducts(admin);
    await ok(await admin('/api/integrations/ikas1', J({ values: IK }, 'PUT')));
    const ik = ikasMock(n), kg = kargonomiMock(n);
    ik.orders.push(ikasOrder('io1', 1001, [['li1', 'SOL-5', 2, 150]]), ikasOrder('io2', 1002, [['li2', 'SOL-10', 1, 260]]));
    const sy = await ok(await admin('/api/sync', J({ channels: ['ikas1'] })));
    assert.equal(sy.channels.ikas1, 2, JSON.stringify(sy));
    assert.equal(await stockOf(admin, P.a), 8);
    // ikas: elle takip no girilmez, panel "Kargoya Hazır" yapmaz
    const id = oid('ikas1:io1');
    assert.equal((await admin(`/api/orders/${id}/tracking`, J({ package_id: 1, tracking: 'X' }))).status, 400);
    assert.equal((await admin(`/api/orders/${id}/pack`, J({}))).status, 400);
    // Entegratör bağlanmadan gönderi açılamaz
    assert.equal((await admin(`/api/orders/${id}/carrier-label`, J({}))).status, 400);
    await ok(await admin('/api/integrations/carriers/kargonomi', J({ values: { KARGONOMI_API_KEY: 'tok', KARGONOMI_WAREHOUSE: '1' } }, 'PUT')));
    const cl = await ok(await admin(`/api/orders/${id}/carrier-label`, J({ provider: 'kargonomi', firm_id: '11' })));
    assert.equal(cl.official.format, 'pdf');
    const draft = n.find('POST', /kargonomi\.com\.tr\/api\/v1\/shipments$/)[0].body.shipment;
    assert.equal(draft.buyer_state_id, 34); assert.equal(draft.buyer_city_id, 3401); assert.equal(draft.buyer_phone, '5321112233');
    let d = await ok(await admin('/api/orders/' + id));
    const pk = d.order.packages[0];
    assert.equal(pk.carrier_provider, 'kargonomi'); assert.equal(pk.tracking, 'KG901'); assert.equal(pk.agreement, 'own'); assert.equal(pk.remote_id, 'pk-1');
    assert.equal(d.order.shipping_cost, 65.88, 'entegratör ücreti (KDV hariç 54,90) KDV dahil kargo giderine');
    const ful = ik.gql.find((b) => /fulfillOrder/.test(b.query));
    assert.equal(ful.variables.input.trackingInfoDetail.trackingNumber, 'KG901');
    assert.equal(ful.variables.input.sendNotificationToCustomer, false);
    // İkinci gönderi açılmaz
    assert.equal((await admin(`/api/orders/${id}/carrier-label`, J({ provider: 'kargonomi', package_id: pk.id }))).status, 400);
    // Senkron ikas paketini getirir: takip no / entegratör bilgisi korunur
    await ok(await admin('/api/sync', J({ channels: ['ikas1'], force: true })));
    d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.packages.length, 1); assert.equal(d.order.packages[0].carrier_provider, 'kargonomi'); assert.equal(d.order.packages[0].tracking, 'KG901');
    // Etiket kayıtlı (entegratörün PDF'i)
    const lb = await ok(await admin(`/api/orders/${id}/label`, J({ package_id: pk.id })));
    assert.equal(lb.official.format, 'pdf');
    // Kargoya ver → ikas'ta paket FULFILLED (müşteriye bildirim ikas'tan)
    await ok(await admin(`/api/orders/${id}/ship`, J({ package_id: pk.id })));
    const up = ik.gql.find((b) => /updateOrderPackageStatus/.test(b.query));
    assert.equal(up.variables.input.packages[0].status, 'FULFILLED'); assert.equal(up.variables.input.packages[0].trackingInfo.isSendNotification, true);
    assert.equal((await ok(await admin('/api/orders/' + id))).order.status, 'shipped');
    // İkinci sipariş: gönderi açılır, sonra iptal edilir (entegratör + ikas paketi geri alınır, kargo gideri düşer)
    const id2 = oid('ikas1:io2');
    const c2 = await ok(await admin(`/api/orders/${id2}/carrier-label`, J({ firm_id: '11' })));
    const pk2 = c2.order.packages[0];
    await ok(await admin(`/api/orders/${id2}/carrier-cancel`, J({ package_id: pk2.id })));
    assert.deepEqual(kg.cancelled, [902]);
    d = await ok(await admin('/api/orders/' + id2));
    assert.equal(d.order.packages[0].carrier_provider, null); assert.equal(d.order.packages[0].tracking, ''); assert.equal(d.order.packages[0].remote_id, null);
    assert.equal(d.order.shipping_cost, 0);
    assert.ok(ik.gql.some((b) => /cancelFulfillment/.test(b.query)));
  } finally { n.restore(); }
});

test('Hızlı market (Trendyol Go): bağlantı testiyle devreye girer; işleme al (picked), kurye platformun: etiket / takip yok, hazırlandı (invoiced)', async () => {
  const n = net();
  try {
    const { admin } = await panel();
    await withProducts(admin);
    await ok(await admin('/api/integrations/trendyolgo', J({ values: TGO }, 'PUT')));
    const tg = tgoMock(n);
    tg.pkgs.push(tgoPkg('pk-a', 'G100', 'Created', [['8690001', 'Solucan 5', 1, 150], ['8690002', 'Solucan 10', 1, 260]]));
    // Bağlantı testi geçmeden kanal sipariş ekranına girmez
    const s0 = await ok(await admin('/api/sync', J({ channels: ['trendyolgo'] })));
    assert.equal(s0.channels.trendyolgo, undefined);
    const t = await ok(await admin('/api/integrations/trendyolgo/test', J({})));
    assert.equal(t.ok, true, JSON.stringify(t));
    const sy = await ok(await admin('/api/sync', J({ channels: ['trendyolgo'] })));
    assert.equal(sy.channels.trendyolgo, 1, JSON.stringify(sy));
    const id = oid('trendyolgo:G100');
    let d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.status, 'new'); assert.equal(d.channel.caps.courier, 'platform');
    await ok(await admin(`/api/orders/${id}/accept`, J({})));
    assert.equal(n.find('PUT', /\/picked$/).length, 1);
    // Kurye platformun: elle takip no ve kargo entegratörü yok
    assert.equal((await admin(`/api/orders/${id}/tracking`, J({ package_id: 1, tracking: 'X' }))).status, 400);
    assert.equal((await admin(`/api/orders/${id}/carrier-label`, J({}))).status, 400);
    const lb = await ok(await admin(`/api/orders/${id}/label`, J({})));
    assert.equal(lb.official, null);
    // Hazırlandı: provizyon aralığı okunur, invoiced bildirilir
    await ok(await admin(`/api/orders/${id}/ship`, J({})));
    const inv = n.find('PUT', /\/invoiced$/);
    assert.equal(inv.length, 1); assert.equal(inv[0].body.invoiceAmount, 410);
    d = await ok(await admin('/api/orders/' + id));
    assert.equal(d.order.packages[0].status, 'shipped');
    // Kanal Shipped / Delivered bildirir
    tg.pkgs[0].packageStatus = 'Delivered';
    await ok(await admin('/api/sync', J({ channels: ['trendyolgo'], force: true })));
    assert.equal((await ok(await admin('/api/orders/' + id))).order.status, 'delivered');
  } finally { n.restore(); }
});

test('Toplama listesi: iptal edilen satır (açık pakette dursa da) toplanacaklara girmez', async () => {
  const n = net();
  try {
    const { admin } = await panel();
    await withProducts(admin);
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    const ty = trendyolMock(n);
    // Trendyol kısmi iptalde iptal edilen satırı paketin satırlarında "Cancelled" durumuyla bırakır
    ty.pkgs.push(tyPkg(1, 900, 'Created', [[11, 'SOL-5', '8690001', 2, 150], [12, 'SOL-10', '8690002', 1, 260, 'Cancelled']]));
    await ok(await admin('/api/sync', J({ channels: ['trendyol'] })));
    const pl = await ok(await admin('/api/picklist'));
    const names = pl.items.map((i) => [i.sku, i.qty]);
    assert.deepEqual(names, [['SOL-5', 2]], 'iptal satırı toplama listesinde: ' + JSON.stringify(names));
    assert.equal(pl.totalQty, 2);
  } finally { n.restore(); }
});
