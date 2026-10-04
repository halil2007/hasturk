// ikas bağdaştırıcısının gönderdiği tüm GraphQL işlemleri ikas'ın resmi şemasına (@ikas/admin-api-client) uymalı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../dev/ikas-schema.mjs';
import { ikas } from '../src/channels/ikas.js';

const schema = JSON.parse(readFileSync(new URL('./fixtures/ikas-schema.json', import.meta.url)));

test('ikas: tüm sorgu ve mutasyonlar resmi şemayla uyumlu (işlem, argüman, değişken tipi, alan)', async () => {
  const seen = new Set();
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (/oauth\/token/.test(url)) return new Response(JSON.stringify({ access_token: 'T', expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
    const b = JSON.parse(opts.body);
    seen.add(b.query);
    const pk = { id: 'pk1', orderLineItemIds: ['l1'], orderPackageFulfillStatus: 'READY_FOR_SHIPMENT', trackingInfo: { barcode: 'B1' } };
    const data = { listOrder: { hasNext: false, data: [{ id: 'o1', orderNumber: 1, orderLineItems: [], orderPackages: [pk] }] }, listProduct: { hasNext: false, data: [] }, listVariantType: [], getMerchant: { id: 'm' },
      getAuthorizedApp: { scope: 'read_orders,write_orders' }, listStockLocation: [{ id: 'loc', name: 'Depo', address: {} }], listCargoCompany: [{ id: 'c', name: 'Yurtiçi' }], listShippingSettings: [],
      fulfillOrder: { id: 'o1', orderPackages: [pk] }, saveProduct: { id: 'p', variants: [{ id: 'v' }] } };
    return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const ch = ikas({ IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' }, 'IKAS1_', { id: 'ikas1' });
    const order = { remote_id: 'o1', order_number: '1', items: [] }, pkg = { no: 1, remote_id: 'pk1', items: [{ line_id: 'l1', qty: 1 }] };
    await ch.fetchOrders(0, 1); await ch.fetchListings();
    await ch.pushStock([{ remoteId: 'v', remoteProductId: 'p', stock: 1 }]); await ch.pushPrice([{ remoteId: 'v', remoteProductId: 'p', price: 1 }]);
    await ch.cargoOptions(); await ch.fetchOne('o1'); await ch.label(order, pkg);
    await ch.ship(order, { ...pkg, barcode: 'B1' }, {}); await assert.rejects(() => ch.ship(order, { ...pkg, remote_id: null }, { tracking: 'T' }), /elle kargo bilgisi girilmez/); await ch.cancelPackage(order, pkg);
    await ch.createProduct({ name: 'x', sale_price: 1, stock: 1 }); await ch.diagnose({ orderId: 'o1' });
  } finally { globalThis.fetch = real; }
  assert.ok(seen.size >= 11, `${seen.size} işlem`);
  assert.ok(![...seen].some((q) => /fulfillOrder/.test(q)), 'panel ikas\'ta Kargoya Hazır işaretlemez (ikas Kargo uygulaması gönderir)');
  assert.ok(![...seen].some((q) => /updateOrderPackageStatus/.test(q)), 'ikas\'a takip / durum bilgisi yazılmaz');
  assert.deepEqual(validate(seen, schema), []);
});

test('şema doğrulayıcı uydurma alanı, argümanı ve işlemi yakalar', () => {
  const e = validate(['query ($p: PaginationInput) { listOrder(pagination: $p, nope: 1) { data { id fake } } }', 'mutation ($input: SaveStockLocationsInput!) { saveVariantStocks(input: $input) }'], schema);
  assert.equal(e.length, 3);
});
