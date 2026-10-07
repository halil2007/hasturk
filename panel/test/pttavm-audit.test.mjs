// PttAVM REST denetimi: ürün listesi sayfalama (rowCount ürün sayısı, varyantlar ilan sayısını artırır) ve kargo etiketi
// (barkod yoksa önce oluşturulur, etiket get-barcode-tag ile ZPL alınır), ağa çıkmadan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pttavm } from '../src/channels/pttavm.js';

const RENV = { PTTAVM_API_KEY: 'KEY-1', PTTAVM_TOKEN: 'TOK-1' };
const J = (b, status = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status, headers: { 'Content-Type': typeof b === 'string' ? 'text/plain' : 'application/json' } });
const realFetch = globalThis.fetch;
function mock(fn) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => { const u = String(url); calls.push({ u, body: o.body ? JSON.parse(o.body) : null }); return fn(u, o.body ? JSON.parse(o.body) : null); };
  return calls;
}
const ORDER = { siparisNo: 'PTT-9', islemTarihi: '2026-10-05T14:30:00', musteriAdi: 'Ali', musteriSoyadi: 'Veli', siparisUrunler: [{ lineItemId: 1, urunBarkod: 'B1', toplamIslemAdedi: 1, kdvDahilToplamTutar: 10, siparisDurumu: 'kargo_yapilmasi_bekleniyor' }] };

test('PttAVM ürün listesi: varyantlı ürünler varken sayfalama rowCount (ürün sayısı) dolana kadar sürer', async () => {
  const prod = (id, nVar) => ({ urunId: id, urunAdi: `Ürün ${id}`, barkod: `P${id}`, kdVli: 100, miktar: 5, rowCount: 4, aktif: true,
    variantListesi: Array.from({ length: nVar }, (_, i) => ({ variantBarkod: `P${id}-V${i}`, variant1Deger: `${i + 1} Kg`, miktar: i, fiyat: 10 * i })) });
  try {
    const calls = mock((u) => (/products\/search/.test(u) ? J(/searchPage=1(&|$)/.test(u) ? [prod(1, 3), prod(2, 3)] : /searchPage=2(&|$)/.test(u) ? [prod(3, 0), prod(4, 0)] : []) : J({}, 404)));
    const l = await pttavm(RENV, { id: 'pttavm' }).fetchListings();
    const pages = calls.filter((c) => /products\/search/.test(c.u)).map((c) => new URL(c.u).searchParams.get('searchPage'));
    assert.deepEqual(pages, ['1', '2'], '1. sayfada 6 ilan (2 ürün) var ama rowCount 4 ürün: 2. sayfa da okunmalı, 3. sayfaya gerek yok');
    assert.equal(l.length, 8);
    assert.deepEqual(l.filter((x) => x.remoteProductId === '1').map((x) => [x.remoteId, x.stock, x.price]), [['P1-V0', 0, 100], ['P1-V1', 1, 110], ['P1-V2', 2, 120]]);
    assert.ok(l.some((x) => x.remoteId === 'P4'));
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM etiket: barkod yoksa siparişe bakılır, depo + create-barcode + barcode-status, sonra ZPL etiket', async () => {
  const ZPL = '^XA^FO50,50^BCN,100^FD12345678^FS^XZ';
  try {
    const calls = mock((u, b) => {
      if (/orders\/PTT-9$/.test(u)) return J([ORDER]);
      if (/get-warehouse/.test(u)) return J({ data: [{ id: 77, name: 'Depo' }], status: true });
      if (/create-barcode/.test(u)) return J({ tracking_id: 'T1', success: true, error: false });
      if (/barcode-status/.test(u)) return J({ tracking_id: 'T1', status: 'completed', data: [{ order_id: 'PTT-9', barcodes: ['12345678'] }], error: '' });
      if (/get-barcode-tag/.test(u)) return J(ZPL);
      return J({}, 404);
    });
    const c = pttavm(RENV, { id: 'pttavm' });
    assert.equal(c.caps.label, 'remote');
    const r = await c.label({ remote_id: 'PTT-9', order_number: 'PTT-9' }, { no: 1 });
    assert.equal(r.barcode, '12345678'); assert.equal(r.cargoCompany, 'PTT Kargo');
    assert.deepEqual(r.label, { format: 'zpl', data: ZPL, filename: 'pttavm-PTT-9-1.zpl' });
    assert.deepEqual(calls.find((x) => /create-barcode/.test(x.u)).body, { orders: [{ order_id: 'PTT-9', warehouse_id: 77 }] });
    assert.deepEqual(calls.find((x) => /get-barcode-tag/.test(x.u)).body, { barcode: '12345678', order_id: 'PTT-9', type: 'zpl' });
    // Barkodu olan pakette yeniden barkod açılmaz; kargoya verirken de
    calls.length = 0;
    await c.label({ remote_id: 'PTT-9', order_number: 'PTT-9' }, { no: 1, barcode: '12345678' });
    assert.ok(!calls.some((x) => /create-barcode/.test(x.u)));
    assert.deepEqual(await c.ship({ order_number: 'PTT-9' }, { barcode: '12345678' }), {});
    assert.equal(calls.filter((x) => /create-barcode/.test(x.u)).length, 0);
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM etiket: siparişte kargo barkodu zaten varsa yeni barkod açılmaz; etiket servisi hata verirse barkodla panel etiketi', async () => {
  try {
    const calls = mock((u) => {
      if (/orders\/PTT-9$/.test(u)) return J([{ ...ORDER, kargoBarkod: 'KB-1' }]);
      if (/get-barcode-tag/.test(u)) return J({ message: 'etiket yok' }, 422);
      return J({}, 404);
    });
    const r = await pttavm(RENV, { id: 'pttavm' }).label({ remote_id: 'PTT-9', order_number: 'PTT-9' }, { no: 2 });
    assert.ok(!calls.some((x) => /create-barcode|get-warehouse/.test(x.u)));
    assert.equal(r.barcode, 'KB-1'); assert.equal(r.panel, true); assert.match(r.note, /HTTP 422/);
  } finally { globalThis.fetch = realFetch; }
});

test('PttAVM etiket: barkod hazırlanırken (pending) tekrar istenince ikinci kez barkod oluşturulmaz', async () => {
  try {
    const calls = mock((u) => {
      if (/orders\/PTT-9$/.test(u)) return J([ORDER]);
      if (/create-barcode/.test(u)) return J({ tracking_id: 'T2', success: true, error: false });
      if (/barcode-status/.test(u)) return J({ tracking_id: 'T2', status: 'pending', data: [], error: '' });
      return J({}, 404);
    });
    const c = pttavm({ ...RENV, PTTAVM_WAREHOUSE_ID: '55' }, { id: 'pttavm' });
    const r1 = await c.label({ remote_id: 'PTT-9', order_number: 'PTT-9' }, { no: 1 });
    assert.match(r1.pending, /hazırlıyor/);
    const r2 = await c.label({ remote_id: 'PTT-9', order_number: 'PTT-9' }, { no: 1 });
    assert.match(r2.pending, /hazırlıyor/);
    assert.equal(calls.filter((x) => /create-barcode/.test(x.u)).length, 1);
    assert.ok(!calls.some((x) => /get-warehouse/.test(x.u)), 'depo numarası girildiyse depo listesi istenmez');
  } finally { globalThis.fetch = realFetch; }
});
