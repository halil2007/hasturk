// Hepsiburada ürün gönderim durumu (MISSING_INFO / REJECTED hata, WAITING / PRE_MATCHED bekliyor, sayfalama)
// ve ilanların katalog bilgisiyle (ad, barkod, görsel) zenginleştirilmesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hepsiburada } from '../src/channels/hepsiburada.js';

const ENV = { HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2', HB_PASSWORD: 'x', HB_USER_AGENT: 'ua' };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

test('durum: eksik bilgi ve red hata sayılır, bekleyen varken tamamlanmaz, 100+ ürün sayfalanır', async () => {
  const realFetch = globalThis.fetch;
  try {
    const rows = [...Array(130)].map((_, i) => ({ merchantSku: 'S' + i, productStatus: 'MATCHED' }));
    rows[0] = { merchantSku: 'S0', productStatus: 'MISSING_INFO', validationResults: [{ attributeName: 'Barcode', message: 'zorunlu' }] };
    rows[1] = { merchantSku: 'S1', productStatus: 'REJECTED' };
    rows[2] = { merchantSku: 'S2', productStatus: 'MISSING_INFO' };
    let wait = true;
    globalThis.fetch = async (url) => {
      const u = new URL(String(url)), pg = Number(u.searchParams.get('page')), size = Number(u.searchParams.get('size'));
      const data = rows.slice(pg * size, (pg + 1) * size).map((x) => (wait && x.merchantSku === 'S5' ? { ...x, productStatus: 'PRE_MATCHED' } : x));
      return J({ success: true, data, totalElements: rows.length });
    };
    const c = hepsiburada(ENV, { id: 'hepsiburada' });
    let r = await c.catalog.status('TID-1');
    assert.equal(r.items.length, 130);
    assert.equal(r.done, false, 'ön eşleşmedeki ürün varken tamamlanmış sayılmaz');
    const by = Object.fromEntries(r.items.map((x) => [x.key, x]));
    assert.equal(by.S0.ok, false); assert.match(by.S0.error, /Barcode: zorunlu/);
    assert.equal(by.S1.ok, false); assert.equal(by.S1.status, 'reddedildi');
    assert.equal(by.S2.ok, false); assert.equal(by.S2.error, 'eksik bilgi');
    assert.equal(by.S5.ok, null);
    assert.equal(by.S129.ok, true);
    wait = false;
    r = await c.catalog.status('TID-1');
    assert.equal(r.done, true);
  } finally { globalThis.fetch = realFetch; }
});

test('ilanlar: ad / barkod / görsel katalog servisinden eklenir; servis yoksa ilanlar olduğu gibi gelir', async () => {
  const realFetch = globalThis.fetch;
  try {
    let catalogOk = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (/\/listings\/merchantid\//.test(u)) return J({ listings: [{ hepsiburadaSku: 'HBV1', merchantSku: 'HG-SOGU-5KG', price: 100, availableStock: 4 }, { hepsiburadaSku: 'HBV2', merchantSku: 'YOK', price: 50, availableStock: 1 }] });
      if (/products-by-merchant-and-status/.test(u)) {
        if (!catalogOk) return J({ message: 'yok' }, 404);
        if (/productStatus=MATCHED&|productStatus=MATCHED$/.test(u) && /page=0/.test(u)) return J({ data: [{ merchantSku: 'hg-sogu-5kg', productName: 'Solucan Gübresi 5 Kg', barcode: '8682520171549', brand: 'HasTürk', images: ['https://img/1.jpg', { url: 'https://img/2.jpg' }] }] });
        return J({ data: [] });
      }
      return J({});
    };
    const c = hepsiburada(ENV, { id: 'hepsiburada' });
    const ls = await c.fetchListings();
    const a = ls.find((x) => x.sku === 'HG-SOGU-5KG'), b = ls.find((x) => x.sku === 'YOK');
    assert.equal(a.name, 'Solucan Gübresi 5 Kg');
    assert.equal(a.barcode, '8682520171549');
    assert.deepEqual(a.images, ['https://img/1.jpg', 'https://img/2.jpg']);
    assert.equal(a.image, 'https://img/1.jpg');
    assert.equal(b.name, 'YOK');
    catalogOk = false;
    const ls2 = await c.fetchListings();
    assert.equal(ls2.length, 2);
    assert.equal(ls2[0].name, 'HG-SOGU-5KG');
  } finally { globalThis.fetch = realFetch; }
});

test('durum: hata nedeni farklı alanlarda gelse de okunur', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => J({ data: [
      { merchantSku: 'A', productStatus: 'FAILED', importMessages: [{ attribute: 'Image1', message: 'Görsel indirilemedi' }] },
      { merchantSku: 'B', status: 'FAILED', failureReasons: ['Barkod başka satıcıda kayıtlı'] },
      { merchantSku: 'C', productStatus: 'FAILED', result: { errorMessage: 'Kategori pasif' } },
      { merchantSku: 'D', productStatus: 'FAILED' },
    ] });
    const c = hepsiburada(ENV, { id: 'hepsiburada' });
    const by = Object.fromEntries((await c.catalog.status('T')).items.map((x) => [x.key, x]));
    assert.equal(by.A.error, 'Image1: Görsel indirilemedi');
    assert.equal(by.B.error, 'Barkod başka satıcıda kayıtlı');
    assert.equal(by.C.error, 'Kategori pasif');
    assert.equal(by.D.ok, false); assert.equal(by.D.error, 'FAILED');
  } finally { globalThis.fetch = realFetch; }
});
