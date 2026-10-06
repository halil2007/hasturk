// Hepsiburada etiketi: ortak barkod gelirse etiket, kargo firması ortak barkod vermiyorsa sebep + kargo değiştirme önerisi (panel etiketi basılmaz)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hepsiburada } from '../src/channels/hepsiburada.js';

const res = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('ortak barkod: BarcodeData.data içindeki ZPL etiket olur', async () => {
  globalThis.fetch = async (url) => (/\/labels/.test(String(url)) ? res(200, { data: ['^XA^FDHB^FS^XZ'], format: 'ZPL', hasMerchantMutualBarcode: true }) : res(404, 'yok'));
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' }, { id: 'hepsiburada' });
  const r = await ch.label({}, { remote_id: 'P1' });
  assert.equal(r.label.format, 'zpl');
  assert.match(r.label.data, /\^XA/);
});

test('ortak barkod vermeyen kargo firması: sebep, Hepsiburada\'daki firma ve kargo değiştirme', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (/\/labels/.test(String(url))) return res(400, '"Cargo company does not provide mutual barcodes."');
    if (/packagenumber\/P1$/.test(String(url))) return res(200, { packageNumber: 'P1', cargoCompany: 'Sürat Kargo', barcode: '' });
    return res(404, 'yok');
  };
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua', HB_TEST: '1' }, { id: 'hepsiburada' });
  const r = await ch.label({}, { remote_id: 'P1' });
  assert.equal(r.changeCargo, true);
  assert.ok(!r.panel && !r.label, 'panel etiketi basılmaz');
  assert.equal(r.cargoCompany, 'Sürat Kargo');
  assert.match(r.pending, /Sürat Kargo/);
  assert.match(r.pending, /HepsiJET/);
});

test('etiket: biçim parametresi kabul edilmezse parametresiz denenir; başka hatada da kargo firması seçimi önerilir', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (/\/labels\?format=ZPL/.test(String(url))) return res(400, '"Invalid format"');
    if (/\/labels$/.test(String(url))) return res(200, { data: ['^XA^FDOK^FS^XZ'] });
    return res(404, 'yok');
  };
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' }, { id: 'hepsiburada' });
  const r = await ch.label({}, { remote_id: 'P9' });
  assert.match(r.label.data, /FDOK/);
  assert.ok(urls.every((u) => !/sit/.test(u)) && urls.some((u) => /packages\/merchantid\/M1\/packagenumber\/P9\/labels$/.test(u)));
  globalThis.fetch = async (url) => (/\/labels/.test(String(url)) ? res(500, 'sunucu hatası') : res(200, { cargoCompany: 'Yurtiçi Kargo' }));
  const r2 = await ch.label({}, { remote_id: 'P9' });
  assert.equal(r2.changeCargo, true); assert.match(r2.pending, /Yurtiçi/);
});

test("etiket: Aras servisi 'ZPL' biçimini tanımazsa (500, Requested value 'ZPL' was not found) diğer biçimler denenir", async () => {
  const urls = [];
  const bad = '{"code":1051,"message":"response of GetBarcode Error StatusCode: 500, ResponseBody: Requested value \'ZPL\' was not found."}';
  globalThis.fetch = async (url) => {
    const u = String(url); urls.push(u);
    if (/\/labels\?format=ZPL$/.test(u) || /\/labels$/.test(u)) return res(500, bad);
    if (/\/labels\?format=Zpl$/.test(u)) return res(200, { data: ['^XA^FDARAS^FS^XZ'] });
    return res(404, 'yok');
  };
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' }, { id: 'hepsiburada' });
  const r = await ch.label({}, { remote_id: '5525149737', cargo_company: 'Aras Kargo' });
  assert.match(r.label.data, /FDARAS/);
  assert.deepEqual(urls.filter((u) => /labels/.test(u)).map((u) => u.split('labels')[1]), ['?format=ZPL', '', '?format=Zpl']);
  // Gerçek sunucu hatası (biçimle ilgisiz) beklemeden bildirilir
  globalThis.fetch = async (url) => (/\/labels/.test(String(url)) ? res(500, 'Internal error') : res(200, { cargoCompany: 'Aras Kargo' }));
  const r2 = await ch.label({}, { remote_id: '5525149737' });
  assert.equal(r2.changeCargo, true); assert.match(r2.pending, /Internal error/);
});

test('ZPL → PDF: boyut ZPL genişlik / uzunluğundan; Labelary hatası anlaşılır mesajla', async () => {
  const { zplToPdf } = await import('../src/api.js');
  let asked = '';
  globalThis.fetch = async (url) => { asked = String(url); return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'Content-Type': 'application/pdf' } }); };
  const r = await zplToPdf({ format: 'zpl', data: '^XA^PW812^LL812^FDX^FS^XZ', filename: 'hepsiburada-1.zpl' });
  assert.equal(r.format, 'pdf'); assert.equal(r.filename, 'hepsiburada-1.pdf'); assert.equal(atob(r.data), '%PDF');
  assert.match(asked, /labels\/4x4\//);
  await zplToPdf({ format: 'zpl', data: '^XA^FDX^FS^XZ' });
  assert.match(asked, /labels\/4x6\//);
  globalThis.fetch = async () => new Response('ERROR: bad zpl', { status: 400 });
  await assert.rejects(() => zplToPdf({ format: 'zpl', data: '^XA' }), /PDF'e çevrilemedi.*400/);
});

test('PDF istenirse önce Hepsiburada\'nın kendi PDF etiketi denenir', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (/\/labels\?format=PDF$/.test(String(url))) return new Response(new Uint8Array([37, 80, 68, 70, 45]), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    return res(200, { data: ['^XA^FDZ^FS^XZ'] });
  };
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' }, { id: 'hepsiburada' });
  const r = await ch.label({}, { remote_id: 'P5' }, { prefer: 'pdf' });
  assert.equal(r.label.format, 'pdf'); assert.match(urls[0], /format=PDF$/);
  const z = await ch.label({}, { remote_id: 'P5' });
  assert.equal(z.label.format, 'zpl');
});

test('etiketteki kargo barkodu (takip no) panelin tasarımına basılmak üzere döner', async () => {
  globalThis.fetch = async (url) => (/\/labels/.test(String(url)) ? res(200, { data: ['^XA^FO50,50^BY3^BCN,120,N,N^FD>;62755251497373^FS^FO50,200^A0N,30,30^FDTES. NO : 62755251497373^FS^XZ'] }) : res(404, 'yok'));
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' }, { id: 'hepsiburada' });
  const r = await ch.label({}, { remote_id: '5525149737' });
  assert.equal(r.barcode, '62755251497373'); assert.equal(r.agreement, 'hepsiburada'); assert.equal(r.label.format, 'zpl');
  // ZPL'de barkod alanı yoksa paket bilgisinden
  globalThis.fetch = async (url) => (/\/labels/.test(String(url)) ? res(200, { data: ['^XA^FDmetin^FS^XZ'] }) : res(200, { packageNumber: '1', barcode: '99887766554433', cargoCompany: 'Aras Kargo' }));
  const r2 = await ch.label({}, { remote_id: '1' });
  assert.equal(r2.barcode, '99887766554433'); assert.equal(r2.cargoCompany, 'Aras Kargo');
});

test('panel: Hepsiburada etiketi bizim tasarımla (panel etiketi + Hepsiburada barkodu); ayar kapalıysa kanalın etiketi', async () => {
  const { d1 } = await import('../dev/d1.mjs');
  const { init } = await import('../src/db.js');
  const { default: worker } = await import('../src/index.js');
  const { saveOrders } = await import('../src/sync.js');
  const { resetChannels } = await import('../src/channels/index.js');
  resetChannels();
  const db = d1(); await init(db);
  const env = { PANEL_PASSWORD: 'pw-12345678', DB: db, HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' };
  let cookie = '';
  const call = async (path, method = 'GET', body) => {
    const r = await worker.fetch(new Request('https://p.test/api/' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body && JSON.stringify(body) }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url);
    if (/\/labels/.test(u)) return res(200, { data: ['^XA^BCN,100,N^FD62755251497373^FS^XZ'] });
    if (/\/packages\/merchantId\/M1$/.test(u) && o.method === 'POST') return res(200, [{ packageNumber: 'PK1' }]);
    return res(200, {});
  };
  await call('login', 'POST', { password: 'pw-12345678' });
  await saveOrders(db, 'hepsiburada', [{ remoteId: 'H1', orderNumber: 'H1', orderedAt: Date.now() - 3600e3, status: 'new', remoteStatus: 'Open', customer: 'Ali', address: {}, total: 10,
    items: [{ lineId: 'L1', sku: 'A', name: 'A', quantity: 1, unitPrice: 10, total: 10 }] }]);
  const id = encodeURIComponent('hepsiburada:H1');
  const r = await call(`orders/${id}/label`, 'POST', {});
  assert.equal(r.panel, true); assert.equal(r.official, null);
  const pkg = r.order.packages[0];
  assert.equal(pkg.barcode, '62755251497373'); assert.equal(pkg.agreement, 'hepsiburada'); assert.ok(pkg.has_label, 'Hepsiburada etiketi saklandı');
  // Ayar kapalı: kanalın etiketi
  await call('settings', 'PUT', { label_own: false });
  const r2 = await call(`orders/${id}/label`, 'POST', { package_id: pkg.id });
  assert.equal(r2.official.format, 'zpl');
});
