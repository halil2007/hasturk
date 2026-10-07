// Çiçeksepeti API denetimi: user-agent kimliği (Satıcı ID / entegratör) ve sayısal satır durum kodları — ağa çıkmadan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ciceksepeti } from '../src/channels/ciceksepeti.js';

function mockFetch(body) {
  const calls = [];
  globalThis.fetch = async (url, o = {}) => { calls.push({ url: String(url), headers: o.headers || {} }); return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  return calls;
}
const row = (id, code) => ({ orderId: id, orderItemId: id, orderItemStatusId: code, orderCreateDate: '2026-10-01T10:00:00', productCode: 'S' + id, quantity: 1, totalPrice: 10 });

test('Çiçeksepeti: user-agent Satıcı ID (varsa "SatıcıID-Entegratör"), yoksa panelin varsayılanı', async () => {
  let calls = mockFetch({ supplierOrderListWithBranch: [] });
  await ciceksepeti({ CICEKSEPETI_API_KEY: 'K', CICEKSEPETI_SELLER_ID: '12345' }, { id: 'cs' }).fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(calls[0].headers['User-Agent'], '12345');
  assert.equal(calls[0].headers['x-api-key'], 'K');
  calls = mockFetch({ supplierOrderListWithBranch: [] });
  await ciceksepeti({ CICEKSEPETI_API_KEY: 'K', CICEKSEPETI_SELLER_ID: '12345', CICEKSEPETI_INTEGRATOR: 'HasTurk' }, { id: 'cs' }).fetchOrders(Date.now() - 864e5, Date.now());
  assert.equal(calls[0].headers['User-Agent'], '12345-HasTurk');
  calls = mockFetch({ supplierOrderListWithBranch: [] });
  await ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' }).fetchOrders(Date.now() - 864e5, Date.now());
  assert.match(calls[0].headers['User-Agent'], /^HasturkPanel/);
});

test('Çiçeksepeti: sayısal kodlar — 5 kargoya verildi (iptal değil), 7 teslim, 11 kargoya verilecek, 20-23 iade', async () => {
  mockFetch({ supplierOrderListWithBranch: [row(1, 1), row(2, 2), row(3, 11), row(4, 5), row(5, 7), row(6, 20), row(7, 23)] });
  const by = Object.fromEntries((await ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' }).fetchOrders(Date.now() - 864e5, Date.now())).map((o) => [o.remoteId, o.status]));
  assert.deepEqual(by, { 1: 'new', 2: 'processing', 3: 'processing', 4: 'shipped', 5: 'delivered', 6: 'returned', 7: 'returned' });
});
