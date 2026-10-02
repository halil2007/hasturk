// Çalıştırma: cd panel && node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, first } from '../src/db.js';
import { saveOrders, applyStock, pushStocks, autoLink } from '../src/sync.js';
import { profit, priceFor } from '../public/profit.js';
import { code128Values } from '../public/labels.js';
import { parseXml, flat } from '../src/channels/pttavm.js';
import { mergeStatus } from '../src/util.js';
import worker from '../src/index.js';

const order = (id, at, qty, extra = {}) => ({
  remoteId: id, orderNumber: id, orderedAt: at, status: 'new', remoteStatus: 'Created', customer: 'Test', address: {}, total: 100 * qty,
  items: [{ lineId: id + '-1', sku: 'A', barcode: '111', name: 'Ürün A', quantity: qty, unitPrice: 100, total: 100 * qty, status: '', remoteKey: '111' }],
  packages: null, ...extra,
});

async function setup() {
  const db = d1();
  await init(db);
  await db.prepare("INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'A', '111', 'Ürün A', 10, 0, 0)").run();
  await db.prepare("INSERT INTO listings (channel, remote_id, product_id, sku, barcode, pushed_stock, remote_stock) VALUES ('ikas1', 'v1', 1, 'A', '111', 10, 10), ('trendyol', '111', 1, 'A', '111', 10, 10)").run();
  await setSetting(db, 'stock_sync', true);
  await setSetting(db, 'stock_since', 1000);
  return db;
}
const stock = async (db) => (await first(db, 'SELECT stock FROM products WHERE id = 1')).stock;

test('satış stoktan bir kez düşer, tekrar senkronda çift düşmez, iptalde geri eklenir', async () => {
  const db = await setup();
  const ids = await saveOrders(db, 'trendyol', [order('T1', 2000, 2)]);
  await applyStock(db, ids);
  assert.equal(await stock(db), 8);
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T1', 2000, 2)]));
  assert.equal(await stock(db), 8, 'aynı sipariş tekrar gelince stok değişmemeli');
  // Paket bölme sonrası satır kimlikleri değişse de toplam adet aynıysa stok değişmez
  const split = order('T1', 2000, 2);
  split.items = [{ ...split.items[0], lineId: 'x1', quantity: 1, total: 100 }, { ...split.items[0], lineId: 'x2', quantity: 1, total: 100 }];
  await applyStock(db, await saveOrders(db, 'trendyol', [split]));
  assert.equal(await stock(db), 8);
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T1', 2000, 2, { status: 'cancelled' })]));
  assert.equal(await stock(db), 10, 'iptal stoğa geri eklenmeli');
});

test('stok takibinden önceki sipariş stoğu değiştirmez (sonradan iptal olsa da)', async () => {
  const db = await setup();
  await applyStock(db, await saveOrders(db, 'ikas1', [order('OLD', 500, 3)]));
  assert.equal(await stock(db), 10);
  await applyStock(db, await saveOrders(db, 'ikas1', [order('OLD', 500, 3, { status: 'cancelled' })]));
  assert.equal(await stock(db), 10);
});

test('iade: ayar kapalıyken stok geri eklenmez, açıkken eklenir', async () => {
  const db = await setup();
  await applyStock(db, await saveOrders(db, 'ikas1', [order('R1', 2000, 1)]));
  assert.equal(await stock(db), 9);
  await applyStock(db, await saveOrders(db, 'ikas1', [order('R1', 2000, 1, { status: 'returned' })]));
  assert.equal(await stock(db), 9);
  await setSetting(db, 'restock_returns', true);
  await applyStock(db, ['ikas1:R1']);
  assert.equal(await stock(db), 10);
});

test('değişen stok tüm kanal ilanlarına gönderilir', async () => {
  const db = await setup();
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T2', 2000, 4)]));
  const r = await pushStocks({ DEMO: '1' }, db);
  assert.equal(r.ikas1, 1); assert.equal(r.trendyol, 1);
  const rows = (await db.prepare('SELECT pushed_stock FROM listings').all()).results;
  assert.deepEqual(rows.map((x) => x.pushed_stock), [6, 6]);
  const again = await pushStocks({ DEMO: '1' }, db);
  assert.deepEqual(again, {}, 'değişiklik yoksa tekrar gönderilmez');
});

test('eşleşmeyen ilan SKU/barkodla otomatik bağlanır ve eski satırları da bağlar', async () => {
  const db = await setup();
  await db.prepare("INSERT INTO listings (channel, remote_id, sku, barcode) VALUES ('hepsiburada', 'HBV1', 'a', '')").run();
  assert.equal(await autoLink(db), 1);
  assert.equal((await first(db, "SELECT product_id FROM listings WHERE remote_id = 'HBV1'")).product_id, 1);
});

test('panel işlemi uzak durumu geri almaz; iptal her zaman kazanır', () => {
  assert.equal(mergeStatus('new', 'processing'), 'processing');
  assert.equal(mergeStatus('delivered', 'processing'), 'delivered');
  assert.equal(mergeStatus('cancelled', 'shipped'), 'cancelled');
});

test('kâr hesabı', () => {
  const r = profit({ sale: 200, purchase: 100, commissionRate: 20, shipping: 30 });
  assert.equal(r.commission, 40);
  assert.equal(r.payout, 130);
  assert.equal(r.unitProfit, 30);
  assert.equal(r.margin, 15);
  assert.equal(r.markup, 30);
  // Ters hesap: hedef marj için bulunan fiyat aynı marjı vermeli (KDV'li ve KDV'siz)
  for (const includeVat of [false, true]) {
    const base = { purchase: 120, commissionRate: 18, shipping: 35, fee: 8, extra: 5, vatRate: 20, includeVat };
    const price = priceFor(base, 25);
    assert.ok(Math.abs(profit({ ...base, sale: price }).margin - 25) < 1e-9);
    assert.ok(Math.abs(profit({ ...base, sale: profit(base).breakEven }).unitProfit) < 1e-9);
  }
  assert.equal(priceFor({ commissionRate: 90 }, 20), null);
});

test('Code 128: rakamlar C kümesi, kontrol hanesi doğru', () => {
  const v = code128Values('12345678');
  assert.deepEqual(v.slice(0, 5), [105, 12, 34, 56, 78]);
  assert.equal(v[5], (105 + 12 * 1 + 34 * 2 + 56 * 3 + 78 * 4) % 103);
  assert.equal(code128Values('AB')[0], 104);
});

test('PttAVM SOAP cevabı okunur', () => {
  const xml = `<s:Envelope xmlns:s="x"><s:Body><R><a:SiparisKontrolV2><a:SiparisNo>55</a:SiparisNo><a:SiparisTarihi>01.10.2026 10:00</a:SiparisTarihi><a:Il>Ankara</a:Il><a:Urunler><a:Urun><a:Barkod>111</a:Barkod><a:Adet>2</a:Adet></a:Urun></a:Urunler></a:SiparisKontrolV2></R></s:Body></s:Envelope>`;
  const tree = parseXml(xml);
  const o = flat(tree.children[0]);
  assert.equal(o.Body.R.SiparisKontrolV2.SiparisNo, '55');
  assert.equal(o.Body.R.SiparisKontrolV2.Urunler.Urun.Adet, '2');
});

test('API: giriş olmadan veri vermez, başka siteden yazma isteğini reddeder', async () => {
  const env = { PANEL_PASSWORD: 'gizli-sifre', DB: d1() };
  const call = (path, opts = {}) => worker.fetch(new Request('https://panel.test' + path, opts), env, { waitUntil() {} });
  assert.equal((await call('/api/orders')).status, 401);
  const bad = await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'yanlis' }) });
  assert.equal(bad.status, 401);
  const cross = await call('/api/login', { method: 'POST', headers: { Origin: 'https://kotu.site' }, body: JSON.stringify({ password: 'gizli-sifre' }) });
  assert.equal(cross.status, 403);
  const ok = await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'gizli-sifre' }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await call('/api/orders', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await call('/api/orders', { headers: { Cookie: cookie.slice(0, -3) + 'abc' } })).status, 401, 'değiştirilmiş çerez geçersiz');
});
