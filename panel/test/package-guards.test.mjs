// Paket akışı düzeltmeleri: iptal edilip yeniden paketlenen Hepsiburada paketine seçilen kargo firması yeniden uygulanır;
// kanalda iptal edilmiş siparişte "Kargoya ver" sunucuda reddedilir
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
const oid = (s) => encodeURIComponent(s);
test('HB: kargo firması seçilip paket iptal edilince yeni pakete aynı firma yeniden uygulanır', async () => {
  const n = net();
  try {
    const { admin } = await panel();
    await ok(await admin('/api/integrations/hepsiburada', J({ values: HB }, 'PUT')));
    const hb = hepsiburadaMock(n);
    const cc = [];
    n.on('PUT', /\/packagenumber\/[^/]+\/changecargocompany$/, (c) => { cc.push(c.url.match(/packagenumber\/([^/]+)/)[1] + ':' + c.body.CargoCompanyShortName); return {}; });
    hb.lines.push(hbLine('L1', 700, 'SOL-5', 1, 300));
    await ok(await admin('/api/sync', J({ channels: ['hepsiburada'] })));
    const id = oid('hepsiburada:700');
    // 1) paketle (P1), 2) kargo firmasını Sürat yap (P1'e uygulanır)
    await ok(await admin(`/api/orders/${id}/pack`, J({})));
    let d = await ok(await admin('/api/orders/' + id));
    const pkg = d.order.packages[0];
    await ok(await admin(`/api/orders/${id}/cargo`, J({ package_id: pkg.id, cargo: { id: 'SURAT', name: 'Sürat Kargo' } })));
    // 3) paketi iptal et (unpack), 4) yeniden paketle (P2)
    await ok(await admin(`/api/orders/${id}/cancel-package`, J({ package_id: pkg.id })));
    await ok(await admin(`/api/orders/${id}/pack`, J({ package_id: pkg.id })));
    d = await ok(await admin('/api/orders/' + id));
    const p2 = d.order.packages[0];
    assert.ok(cc.includes(p2.remote_id + ':SURAT'), `yeni pakete (${p2.remote_id}) Sürat uygulanmadı; panel yine de “${p2.cargo_company}” gösteriyor`);
  } finally { n.restore(); }
});
test('Kanalda iptal edilen siparişte "Kargoya ver" reddedilir (kanala gönderim bildirimi gitmez)', async () => {
  const n = net();
  try {
    const { admin, db } = await panel();
    await ok(await admin('/api/integrations/hepsiburada', J({ values: HB }, 'PUT')));
    const hb = hepsiburadaMock(n);
    hb.lines.push(hbLine('L9', 701, 'SOL-5', 1, 300));
    await ok(await admin('/api/sync', J({ channels: ['hepsiburada'] })));
    const id = oid('hepsiburada:701');
    await ok(await admin(`/api/orders/${id}/pack`, J({})));
    // sipariş bu arada kanalda iptal edildi (senkron getirdi)
    await db.prepare("UPDATE orders SET status = 'cancelled', remote_status = 'Cancelled' WHERE id = ?").bind('hepsiburada:701').run();
    const r = await admin(`/api/orders/${id}/ship`, J({ tracking: 'T1', cargo_company: 'Aras' }));
    const d = await ok(await admin('/api/orders/' + id));
    assert.equal(r.status, 400, 'iptal siparişe kargoya ver kabul edildi');
  } finally { n.restore(); }
});
