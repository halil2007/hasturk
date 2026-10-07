// N11 denetimi: paket bölme (Unpacked) sonrası sipariş, satır tutarı (sellerInvoiceAmount), numarasız paket,
// fiyat / stok görevi (2 hane, REJECT, task-details sonucu) ve sipariş onayı (satır bazlı sonuç), ağa çıkmadan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { n11 } from '../src/channels/n11.js';

const ENV = { N11_APP_KEY: 'k', N11_APP_SECRET: 's' };
const realFetch = globalThis.fetch;
function mock(fn) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url), body = o.body ? JSON.parse(o.body) : null;
    calls.push({ u, method: o.method || 'GET', body });
    const r = fn(u, body);
    return new Response(JSON.stringify(r === undefined ? { message: 'yok' } : r), { status: r === undefined ? 404 : 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const line = (id, qty, price, extra = {}) => ({ orderLineId: id, quantity: qty, price, stockCode: `SKU-${id}`, productName: `Ürün ${id}`, dueAmount: price * qty - 5, sellerInvoiceAmount: price * qty - 1, ...extra });
const pkg = (id, status, lines, extra = {}) => ({ id, orderNumber: '2030', shipmentPackageStatus: status, lines, totalAmount: lines.reduce((s, l) => s + l.price * l.quantity, 0), customerfullName: 'Ali Veli',
  shippingAddress: { fullName: 'Ali Veli', city: 'Konya', district: 'Meram', address: 'X', gsm: '5' }, packageHistories: [{ createdDate: 1760000000000, status: 'Created' }], lastModifiedDate: 1760000500000, ...extra });

test('N11 siparişler: bölünen (Unpacked) paket sayılmaz; ürünler / tutar iki kez sayılmaz, durum yeni paketlerden', async () => {
  try {
    mock((u) => (/shipmentPackages/.test(u) ? { content: [
      pkg(100, 'Unpacked', [line(1, 3, 10), line(2, 1, 50)]),
      pkg(101, 'Shipped', [line(1, 2, 10)], { cargoTrackingNumber: 'K1', cargoProviderName: 'Yurtiçi' }),
      pkg(102, 'Shipped', [line(3, 1, 10), line(2, 1, 50)]),
    ], totalPages: 1 } : undefined));
    const [o] = await n11(ENV, { id: 'n11' }).fetchOrders(Date.now() - 864e5, Date.now());
    assert.equal(o.status, 'shipped', 'Unpacked ana paket siparişi "hazırlanıyor"da tutmaz');
    assert.deepEqual(o.items.map((i) => [i.lineId, i.quantity]).sort(), [['1', 2], ['2', 1], ['3', 1]]);
    assert.deepEqual(o.packages.map((p) => p.remoteId), ['101', '102']);
    assert.equal(o.total, 80);
    assert.equal(o.tracking, 'K1');
  } finally { globalThis.fetch = realFetch; }
});

test('N11 siparişler: durum adı büyük / küçük harf duyarsız; satır tutarı satıcı fatura tutarı; numarasız paket kanal paketi değil; tekrar gelen paket bir kez', async () => {
  try {
    const p = pkg(null, 'Created', [line(7, 2, 100)]);
    mock((u) => (/shipmentPackages/.test(u) ? { content: [p, pkg(200, 'Picking', [line(8, 1, 40)], { orderNumber: '2031' }), pkg(200, 'Picking', [line(8, 1, 40)], { orderNumber: '2031' }),
      pkg(300, 'UnPacked', [line(9, 1, 20)], { orderNumber: '2032' })], totalPages: 1 } : undefined));
    const list = await n11(ENV, { id: 'n11' }).fetchOrders(Date.now() - 864e5, Date.now());
    const by = Object.fromEntries(list.map((o) => [o.orderNumber, o]));
    assert.equal(by['2030'].items[0].total, 199, 'sellerInvoiceAmount (fiyat × adet − mağaza indirimi)');
    assert.equal(by['2030'].items[0].unitPrice, 99.5);
    assert.deepEqual(by['2030'].packages, [], 'paket numarası (id) null: konuma özel teslimat');
    assert.equal(by['2031'].packages.length, 1); assert.equal(by['2031'].total, 40);
    assert.equal(by['2032'].status, 'processing', 'yalnız bölünmüş paket varsa (geçiş anı) o paket kullanılır');
  } finally { globalThis.fetch = realFetch; }
});

test('N11 fiyat / stok: fiyat 2 haneye yuvarlanır, stok tam sayı; görev kimliği takip edilir, REJECT hata; sonuç task-details ile', async () => {
  try {
    const calls = mock((u, b) => {
      if (/price-stock-update/.test(u)) return b.payload.skus[0].stockCode === 'BAD' ? { status: 'REJECT', reasons: ['integrator boş olamaz'] } : { id: 4321, type: 'SKU_UPDATE', status: 'IN_QUEUE', reasons: ['1 sku işlenmeye alındı.'] };
      if (/task-details/.test(u)) return { taskId: 4321, status: 'PROCESSED', skus: { content: [{ itemCode: 'A', status: 'SUCCESS', reasons: [] }, { itemCode: 'B', status: 'FAIL', reasons: ['listPrice salePrice\'dan düşük'] }], last: true, totalPages: 1 } };
      return undefined;
    });
    const c = n11(ENV, { id: 'n11' });
    const r = await c.pushPrice([{ remoteId: 'A', price: 19.999, listPrice: 0 }, { remoteId: 'B', price: 10.004, listPrice: 12.5 }]);
    assert.deepEqual(r, { refs: ['4321'] });
    assert.deepEqual(calls[0].body.payload.skus, [{ stockCode: 'A', salePrice: 20, listPrice: 20, currencyType: 'TL' }, { stockCode: 'B', salePrice: 10, listPrice: 12.5, currencyType: 'TL' }]);
    await c.pushStock([{ remoteId: 'A', stock: 3.6 }, { remoteId: 'B', stock: -2 }]);
    assert.deepEqual(calls[1].body.payload.skus, [{ stockCode: 'A', quantity: 4 }, { stockCode: 'B', quantity: 0 }]);
    await assert.rejects(() => c.pushStock([{ remoteId: 'BAD', stock: 1 }]), /reddedildi: integrator boş olamaz/);
    const st = await c.pushStatus('4321');
    assert.equal(st.done, true);
    assert.deepEqual(st.items.map((x) => [x.key, x.ok]), [['A', true], ['B', false]]);
  } finally { globalThis.fetch = realFetch; }
});

test('N11 işleme alma: hiçbir satır onaylanmazsa hata (sessizce "bildirildi" denmez), kısmi başarı geçerli', async () => {
  try {
    let reply = null;
    const calls = mock((u) => (/order\/v1\/update/.test(u) ? reply : undefined));
    const c = n11(ENV, { id: 'n11' });
    const order = { items: [{ line_id: '11', status: '' }, { line_id: '12', status: 'cancelled' }, { line_id: '13', status: '' }] };
    reply = { content: [{ lineId: 11, status: 'FAIL', reasons: 'Statü uygun değil' }, { lineId: 13, status: 'FAIL', reasons: 'Statü uygun değil' }] };
    await assert.rejects(() => c.accept(order), /N11 siparişi onaylamadı: 11: Statü uygun değil/);
    assert.deepEqual(calls[0].body, { lines: [{ lineId: 11 }, { lineId: 13 }], status: 'Picking' });
    reply = { content: [{ lineId: 11, status: 'SUCCESS', reasons: 'Başarıyla tamamlandı.' }, { lineId: 13, status: 'FAIL', reasons: 'x' }] };
    await c.accept(order);
  } finally { globalThis.fetch = realFetch; }
});
