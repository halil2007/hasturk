// Hepsiburada denetimi: fiyat yüklemesinde kilitlenen ilanlar (priceValidations), dokümandaki iade ret gerekçeleri,
// kargo giderinde gelir kayıtlarının dışarıda kalması. Ağa çıkmadan, örnek cevaplarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hepsiburada } from '../src/channels/hepsiburada.js';

function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    const hit = routes.find(([re, m]) => re.test(String(url)) && (!m || m === (opts.method || 'GET')));
    const out = hit ? (typeof hit[2] === 'function' ? hit[2](String(url), opts) : hit[2]) : { message: 'yok' };
    return new Response(JSON.stringify(out), { status: hit ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const hb = () => hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'hasturk_dev' }, { id: 'hepsiburada' });

test('Hepsiburada: fiyat yüklemesi "Done" olsa da priceValidations (MaxLock / MinLock) kilitlenen ilan başarısız sayılır', async () => {
  mockFetch([[/price-uploads$/, 'POST', { id: 'u-1' }], [/price-uploads\/id\/u-1$/, 'GET', {
    id: 'u-1', status: 'Done', total: 2, errors: null,
    priceValidations: [{ elementNo: 1, hepsiburadaSku: 'HBV1', merchantSku: 'A', type: 'MaxLock', minPrice: 899.8, maxPrice: 13767, description: 'Yüksek fiyat sebebiyle kilitlendi.' }],
  }]]);
  const ch = hb();
  const { refs } = await ch.pushPrice([{ remoteId: 'HBV1', sku: 'A', price: 20000 }, { remoteId: 'HBV2', sku: 'B', price: 100 }]);
  assert.deepEqual(refs, ['price:u-1']);
  const r = await ch.pushStatus(refs[0]);
  assert.equal(r.done, true);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].key, 'HBV1');
  assert.equal(r.items[0].ok, false);
  assert.match(r.items[0].error, /kilitlendi.*899\.8.*13767.*MaxLock/);
  // Hata listesindeki ilan bir kez sayılır
  mockFetch([[/price-uploads\/id\/u-2$/, 'GET', { status: 'Done', errors: [{ hepsiburadaSku: 'HBV1', errors: ['Fiyat geçersiz'] }], priceValidations: [{ hepsiburadaSku: 'HBV1', type: 'MinLock' }] }]]);
  const r2 = await ch.pushStatus('price:u-2');
  assert.deepEqual(r2.items.map((x) => [x.key, x.error]), [['HBV1', 'Fiyat geçersiz']]);
});

test('Hepsiburada: iade ret gerekçeleri dokümandaki liste ve açıklamalarla', async () => {
  const list = await hb().claimReasons();
  const by = Object.fromEntries(list.map((x) => [x.id, x.name]));
  for (const id of ['CustomerReturnedWrongItem', 'ProductIsDamaged', 'MissingQuantity', 'NoSuchAccessory', 'BoxIsEmptyWithReport', 'BoxIsEmptyWithoutReport', 'ReturnedProductIsNotDelivered', 'ProductNotDefective', 'ProductSentComplete', 'Other']) assert.ok(by[id], id);
  assert.match(by.NoSuchAccessory, /kullanılmış/, 'NoSuchAccessory = ürün kullanılmış (aksesuar eksik değil)');
  for (const id of ['BoxIsEmpty', 'WrongProduct', 'MissingInvoice', 'ProductHasBeenUsed']) assert.equal(by[id], undefined, `${id} dokümanda yok`);
});

test('Hepsiburada: kargo gideri gelir kayıtlarını (CargoCompensationIncome, ShipmentCostSharingIncome) gider saymaz', async () => {
  mockFetch([[/\/transactions\/merchantid\/M\?/, 'GET', { items: [
    { orderNumber: '1', transactionType: 'ShipmentCostSharingExpense', amount: { value: -40, currencyCode: 'TRY' }, isIncome: false },
    { orderNumber: '1', transactionType: 'CargoCompensationIncome', amount: { value: 25, currencyCode: 'TRY' }, isIncome: true },
    { orderNumber: '2', transactionType: 'ShipmentCostSharingIncome', amount: { value: 30, currencyCode: 'TRY' } },
    { orderNumber: '2', transactionType: 'TransportExpenseRefund', amount: { value: 10, currencyCode: 'TRY' } },
  ] }]]);
  const r = await hb().cargoCosts(Date.parse('2026-10-01'), Date.parse('2026-10-02'));
  assert.deepEqual(r.items, [{ orderNumber: '1', amount: 40 }]);
});
