// ikas denetimi: sipariş durum eşlemesi (iade kargosu, iade talebi, kısmi durumlar, upsell bekleyen sipariş), satır iadeleri,
// fiyat listesi kaydı ve indirim kaldırma; ağa çıkmadan (durum adları @ikas/admin-api-client OrderPackageStatusEnum / OrderLineItemStatusEnum)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ikas } from '../src/channels/ikas.js';

const ENV = { IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c', IKAS1_MERCHANT_ID: 'm' };
const realFetch = globalThis.fetch;
const R = (b) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } });
function mock(data) {
  const gql = [];
  globalThis.fetch = async (url, o = {}) => {
    if (/oauth\/token/.test(String(url))) return R({ access_token: 'T', expires_in: 3600 });
    const b = JSON.parse(o.body); gql.push(b);
    return R({ data: typeof data === 'function' ? data(b) : data });
  };
  return gql;
}
const li = (id, status) => ({ id, quantity: 1, price: 10, finalPrice: 10, status, variant: { id: 'v' + id, sku: 'S' + id } });
const ord = (id, status, ps, lines = [li('l1', 'FULFILLED')], pk = []) => ({ id, orderNumber: id, orderedAt: 1760000000000, status, orderPackageStatus: ps, totalFinalPrice: 10, orderLineItems: lines, orderPackages: pk });

test('ikas sipariş durumu: iade kargosu iade, iade talebi / reddi teslim, kısmi durumlar satırlardan, upsell bekleyen alınmaz', async () => {
  try {
    mock({ listOrder: { hasNext: false, data: [
      ord('A', 'CREATED', 'RETURN_IN_TRANSIT'),
      ord('B', 'CREATED', 'RETURN_DELIVERED'),
      ord('C', 'REFUND_REQUESTED', 'REFUND_REQUESTED'),
      ord('D', 'CREATED', 'RETURN_REJECTED'),
      ord('E', 'CREATED', 'PARTIALLY_DELIVERED', [li('e1', 'DELIVERED'), li('e2', 'FULFILLED')]),
      ord('F', 'PARTIALLY_CANCELLED', 'PARTIALLY_CANCELLED', [li('f1', 'CANCELLED'), li('f2', 'DELIVERED')]),
      ord('G', 'CREATED', 'PARTIALLY_READY_FOR_SHIPMENT', [li('g1', 'UNFULFILLED'), li('g2', 'UNFULFILLED')]),
      ord('H', 'PARTIALLY_REFUNDED', 'PARTIALLY_REFUNDED', [li('h1', 'RETURN_DELIVERED'), li('h2', 'DELIVERED')]),
      ord('I', 'WAITING_UPSELL_ACTION', 'UNFULFILLED'),
      ord('J', 'CREATED', 'READY_FOR_SHIPMENT'),
      ord('K', 'CREATED', 'UNFULFILLED'),
      ord('L', 'CREATED', 'FULFILLED'),
      ord('M', 'CREATED', 'REFUND_REQUEST_ACCEPTED'),
    ] } });
    const list = await ikas(ENV, 'IKAS1_', { id: 'ikas1' }).fetchOrders(0, 1);
    const st = Object.fromEntries(list.map((o) => [o.remoteId, o.status]));
    assert.deepEqual(st, { A: 'returned', B: 'returned', C: 'delivered', D: 'delivered', E: 'shipped', F: 'delivered', G: 'processing', H: 'delivered', J: 'processing', K: 'new', L: 'shipped', M: 'returned' });
    const h = list.find((o) => o.remoteId === 'H');
    assert.deepEqual(h.items.map((i) => i.status), ['returned', ''], 'iade kargosu teslim alınan satır iade');
  } finally { globalThis.fetch = realFetch; }
});

test('ikas paketleri: iade edilen paket gizlenir, iadesi reddedilen paket kalır', async () => {
  try {
    const pk = (id, st) => ({ id, orderLineItemIds: ['l1'], orderPackageFulfillStatus: st, trackingInfo: { trackingNumber: 'T' + id } });
    mock({ listOrder: { hasNext: false, data: [ord('A', 'CREATED', 'DELIVERED', [li('l1', 'DELIVERED')], [pk('p1', 'RETURN_IN_TRANSIT'), pk('p2', 'RETURN_REJECTED'), pk('p3', 'CANCELLED')])] } });
    const [o] = await ikas(ENV, 'IKAS1_', { id: 'ikas1' }).fetchOrders(0, 1);
    assert.deepEqual(o.packages.map((p) => p.remoteId), ['p2']);
  } finally { globalThis.fetch = realFetch; }
});

test('ikas fiyat: ilan fiyatı ana kayıttan (fiyat listesi değil); indirim yoksa discountPrice boşaltılır', async () => {
  try {
    const gql = mock((b) => (/listProduct/.test(b.query) ? { listProduct: { hasNext: false, data: [{ id: 'p', name: 'Gübre', variants: [{ id: 'v', sku: 'S', isActive: true,
      prices: [{ sellPrice: 80, discountPrice: null, priceListId: 'bayi' }, { sellPrice: 120, discountPrice: 100, priceListId: null }], stocks: [{ stockCount: 3 }] }] }] } }
      : /listVariantType/.test(b.query) ? { listVariantType: [] } : /listCategory/.test(b.query) ? { listCategory: [] } : { saveVariantPrices: true }));
    const c = ikas(ENV, 'IKAS1_', { id: 'ikas1' });
    const [l] = await c.fetchListings();
    assert.equal(l.price, 100); assert.equal(l.listPrice, 120);
    await c.pushPrice([{ remoteId: 'v', remoteProductId: 'p', price: 90, listPrice: 0 }, { remoteId: 'v2', remoteProductId: 'p', price: 90, listPrice: 110 }]);
    const inp = gql.find((x) => /saveVariantPrices/.test(x.query)).variables.input.variantPriceInputs;
    assert.deepEqual(inp.map((x) => x.price), [{ sellPrice: 90, discountPrice: null }, { sellPrice: 110, discountPrice: 90 }]);
  } finally { globalThis.fetch = realFetch; }
});
