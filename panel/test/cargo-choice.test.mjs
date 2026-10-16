// Müşterinin sitenin ödeme sayfasında seçtiği kargo (bilgi notu): yalnız internet sitesi siparişlerinde saklanır, pazaryerinde hiç tutulmaz.
// Kaynaklar: WooCommerce shipping_lines[].method_title, Shopify Order.shippingLine.title, OpenCart shipping_method (bağlantı dosyası),
// Ticimax KargoFirmaTanim, IdeaSoft shippingCompanyName, T-Soft CargoName; ikas shippingLines.title (önceden vardı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, first } from '../src/db.js';
import { saveOrders } from '../src/sync.js';
import { woocommerce } from '../src/channels/woocommerce.js';
import { shopify } from '../src/channels/shopify.js';

const J = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const order = (no, extra = {}) => ({ remoteId: no, orderNumber: no, orderedAt: Date.now(), status: 'new', total: 100,
  items: [{ lineId: '1', sku: 'S1', barcode: '869', name: 'Ürün', quantity: 1, unitPrice: 100, total: 100, remoteKey: 'R1' }], ...extra });
const extraOf = async (db, id) => JSON.parse((await first(db, 'SELECT extra FROM orders WHERE id = ?', id)).extra || '{}');

test('WooCommerce: müşterinin seçtiği kargo yöntemi shipping_lines[].method_title', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => J([{ id: 7, number: '7', status: 'processing', currency: 'TRY', date_created_gmt: '2026-10-01T10:00:00', billing: { first_name: 'Ayşe', last_name: 'Kaya' },
    shipping: { first_name: 'Ayşe', last_name: 'Kaya', address_1: 'Cad. 1', city: 'Bornova', state: 'TR35' }, line_items: [{ id: 1, name: 'Ürün', quantity: 1, total: '100', total_tax: '0' }], total: '100',
    shipping_lines: [{ id: 3, method_title: 'HepsiJet Kargo', method_id: 'flat_rate', total: '0.00' }] }]);
  try {
    const [o] = await woocommerce({ WOO_URL: 'https://magaza.com/', WOO_KEY: 'ck', WOO_SECRET: 'cs' }, {}).fetchOrders(Date.parse('2026-10-01'), Date.parse('2026-10-02'));
    assert.equal(o.cargoChoice, 'HepsiJet Kargo');
  } finally { globalThis.fetch = real; }
});

test('Shopify: sorgu shippingLine { title } ister, müşterinin seçtiği kargo oradan', async () => {
  const real = globalThis.fetch, queries = [];
  globalThis.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body); queries.push(b.query);
    return J({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'gid://shopify/Order/1', name: '#1', createdAt: '2026-10-01T10:00:00Z', displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'UNFULFILLED', taxesIncluded: true, customer: null, shippingAddress: { name: 'A', city: 'Kadıköy', province: 'İstanbul' },
      totalPriceSet: { shopMoney: { amount: '50', currencyCode: 'TRY' } }, lineItems: { pageInfo: { hasNextPage: false }, nodes: [] }, fulfillments: [], shippingLine: { title: 'Sürat Kargo' } }] } } });
  };
  try {
    const [o] = await shopify({ SHOPIFY_STORE: 'magaza.myshopify.com', SHOPIFY_TOKEN: 'shpat_x' }, { id: 'shopify' }).fetchOrders(Date.parse('2026-10-01'), Date.parse('2026-10-02'));
    assert.match(queries[0], /shippingLine \{ title \}/);
    assert.equal(o.cargoChoice, 'Sürat Kargo');
  } finally { globalThis.fetch = real; }
});

test('Kayıt: seçilen kargo yalnız site siparişinde saklanır; pazaryeri siparişinde (kanal gönderse bile) tutulmaz', async () => {
  const db = d1(); await init(db);
  await saveOrders(db, 'woocommerce', [order('W1', { cargoChoice: 'Aras Kargo (Ücretli)' })]);
  await saveOrders(db, 'ikas_2', [order('I1', { cargoChoice: 'HepsiJet Ücretsiz Kargo' })]);
  await saveOrders(db, 'trendyol', [order('T1', { cargoChoice: 'Yurtiçi Kargo' })]);
  await saveOrders(db, 'hepsiburada_2', [order('H1', { cargoChoice: 'HepsiJET' })]);
  assert.equal((await extraOf(db, 'woocommerce:W1')).cargoChoice, 'Aras Kargo (Ücretli)');
  assert.equal((await extraOf(db, 'ikas_2:I1')).cargoChoice, 'HepsiJet Ücretsiz Kargo', 'ek ikas mağazası da site');
  assert.equal((await extraOf(db, 'trendyol:T1')).cargoChoice, undefined);
  assert.equal((await extraOf(db, 'hepsiburada_2:H1')).cargoChoice, undefined);
});
