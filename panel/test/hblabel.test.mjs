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
  assert.match(r.pending, /CargoCompanyId/);
});
