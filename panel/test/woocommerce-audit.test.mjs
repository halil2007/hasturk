// WooCommerce denetimi: on-hold = ödeme bekleniyor, tek sipariş / kanalda var mı, sayfa sınırında imleç, KDV dahil fiyat ayarı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { woocommerce } from '../src/channels/woocommerce.js';

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(c);
    let r = await handler(c);
    if (!r || r.status == null || r.body === undefined) r = { status: 200, body: r };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const WENV = { WOO_URL: 'https://magaza.com', WOO_KEY: 'ck_1', WOO_SECRET: 'cs_2' };
const qs = (u) => Object.fromEntries(new URL(u).searchParams);
const wOrder = (id, status, extra = {}) => ({ id, number: String(id), status, currency: 'TRY', date_created_gmt: '2026-10-01T10:00:00', date_modified_gmt: '2026-10-02T10:00:00', total: '10.00',
  billing: { first_name: 'Ali', last_name: 'Veli' }, shipping: {}, line_items: [], meta_data: [], ...extra });

test('WooCommerce: on-hold (havale / EFT onayı bekleniyor) siparişi "ödeme bekleniyor" işaretli', async () => {
  mockFetch(() => [wOrder(1, 'on-hold'), wOrder(2, 'processing')]);
  const [a, b] = await woocommerce(WENV, {}).fetchOrders(0, 1, { byOrdered: true });
  assert.deepEqual([a.status, a.awaitingPayment, b.awaitingPayment], ['new', true, false]);
});

test('WooCommerce: tek sipariş ve kanalda var mı (404 ve çöp kutusu = yok)', async () => {
  const calls = mockFetch((c) => (/\/orders\/5$/.test(new URL(c.url).pathname) ? wOrder(5, 'completed') : /\/orders\/6$/.test(new URL(c.url).pathname) ? wOrder(6, 'trash')
    : { status: 404, body: { code: 'woocommerce_rest_shop_order_invalid_id', message: 'Geçersiz kimlik.' } }));
  const ch = woocommerce(WENV, {});
  assert.ok(ch.fetchOne && ch.orderExists);
  const o = await ch.fetchOne('5');
  assert.match(calls[0].url, /\/wp-json\/wc\/v3\/orders\/5$/);
  assert.deepEqual([o.remoteId, o.status], ['5', 'shipped']);
  assert.deepEqual([await ch.orderExists('5'), await ch.orderExists('6'), await ch.orderExists('7')], [true, false, false]);
  await assert.rejects(ch.fetchOne('6'), /sipariş bulunamadı/);
  // 404 dışı hata "bilinmiyor" demektir: yutulmaz
  mockFetch(() => ({ status: 500, body: { message: 'db' } }));
  await assert.rejects(woocommerce(WENV, {}).orderExists('5'), /HTTP 500/);
});

test('WooCommerce: 50 sayfa sınırına gelinirse partialUntil son okunan değiştirilme zamanı', async () => {
  let n = 0;
  mockFetch((c) => { const p = Number(qs(c.url).page); n++; return Array.from({ length: 100 }, (_, i) => wOrder(p * 1000 + i, 'processing', { date_modified_gmt: new Date(Date.parse('2026-10-02T00:00:00Z') + (p * 100 + i) * 1000).toISOString().slice(0, 19) })); });
  const since = Date.parse('2026-10-01T23:00:00Z');
  const list = await woocommerce(WENV, {}).fetchOrders(since, since + 864e5);
  assert.equal(n, 50);
  assert.equal(list.length, 5000);
  assert.equal(list.partialUntil, Date.parse('2026-10-02T00:00:00Z') + (50 * 100 + 99) * 1000);
  assert.match(list.warnings[0], /5000\+ sipariş/);
});

test('WooCommerce: tanılama fiyatların KDV hariç girildiğini bildirir', async () => {
  const calls = mockFetch((c) => (/woocommerce_calc_taxes/.test(c.url) ? { id: 'woocommerce_calc_taxes', value: 'yes' }
    : /woocommerce_prices_include_tax/.test(c.url) ? { id: 'woocommerce_prices_include_tax', value: 'no' } : /\/orders/.test(c.url) ? [] : [{ id: 1 }]));
  const out = await woocommerce(WENV, {}).diagnose({});
  const tax = out.find((x) => x.name === 'Fiyatlar KDV dahil mi');
  assert.equal(tax.ok, null);
  assert.match(tax.detail, /KDV hariç/);
  assert.ok(calls.some((c) => /\/wp-json\/wc\/v3\/settings\/tax\/woocommerce_prices_include_tax$/.test(c.url)));
  mockFetch((c) => (/woocommerce_calc_taxes/.test(c.url) ? { value: 'yes' } : /prices_include_tax/.test(c.url) ? { value: 'yes' } : /\/orders/.test(c.url) ? [] : [{ id: 1 }]));
  assert.equal((await woocommerce(WENV, {}).diagnose({})).find((x) => x.name === 'Fiyatlar KDV dahil mi').ok, true);
});
