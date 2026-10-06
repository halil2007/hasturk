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
