// Tek seferlik komisyon düzeltmesi: eski KDV çevrimi (11–12 Ekim 2026) Trendyol / Amazon / Çiçeksepeti oranlarını 1,2 ile çarpmıştı.
// Yalnız siparişlerdeki gerçek oranla kanıtlanan şişme düzeltilir; kanıtsız elle girilmiş oran kullanıcıya bildirilir; yeni panel hiç etkilenmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all, setSetting, getRaw } from '../src/db.js';
import { saveOrders } from '../src/sync.js';
import { vatFixOnce } from '../src/commcheck.js';

const D = 864e5, OLD = Date.parse('2026-10-01T10:00:00Z');
const order = (ch, no, rid, rate, at) => ({ remoteId: no, orderNumber: no, orderedAt: at, status: 'delivered', total: 1000,
  items: [{ lineId: '1', sku: rid, barcode: rid, name: 'Ürün ' + rid, quantity: 1, unitPrice: 1000, total: 1000, remoteKey: rid, commission: rate * 10 }] });
const listing = (db, ch, rid, c, src = null) => run(db, 'INSERT INTO listings (channel, remote_id, name, commission, commission_src) VALUES (?, ?, ?, ?, ?)', ch, rid, 'İlan ' + rid, c, src);
const comm = async (db, ch, rid) => (await first(db, 'SELECT commission FROM listings WHERE channel = ? AND remote_id = ?', ch, rid)).commission;

async function oldPanel() {
  const db = d1(); await init(db);
  await setSetting(db, 'once:vat_incl_1', 1);
  await run(db, "INSERT INTO products (sku, name, created_at, updated_at) VALUES ('P1', 'Eski ürün', ?, ?)", OLD, OLD);
  return db;
}

test('şişmiş Trendyol ilan ve kanal oranı gerçek sipariş oranına göre düzeltilir; diğerlerine dokunulmaz; bir kez çalışır', async () => {
  const db = await oldPanel(), now = Date.now();
  await listing(db, 'trendyol', 'T1', 24);            // gerçek %20 → 24 = 20 × 1,2: düzeltilir
  await listing(db, 'trendyol', 'T2', 30);            // gerçek %20, 30 ≠ 24: dokunulmaz
  await listing(db, 'trendyol', 'T3', 20);            // zaten doğru
  await listing(db, 'trendyol', 'T4', 24);            // sipariş yok, elle girilmiş: kontrol bildirimi
  await listing(db, 'hepsiburada', 'H1', 21.6);       // KDV hariç kanal: hiç dokunulmaz
  await listing(db, 'trendyol_2', 'X1', 18);          // ek Trendyol mağazası: gerçek %15 → 18 düzeltilir
  const orders = [];
  for (let i = 0; i < 12; i++) orders.push(order('trendyol', 'O' + i, ['T1', 'T2', 'T3'][i % 3], 20, now - (i + 1) * D));
  await saveOrders(db, 'trendyol', orders);
  await saveOrders(db, 'trendyol_2', [order('trendyol_2', 'Y1', 'X1', 15, now - D)]);
  await saveOrders(db, 'hepsiburada', [order('hepsiburada', 'Z1', 'H1', 18, now - D)]);
  await setSetting(db, 'commission', { trendyol: 24, hepsiburada: 21.6 });
  const r = await vatFixOnce(db, now);
  assert.deepEqual(r, { fixed: 3, unsure: 1 });
  assert.equal(await comm(db, 'trendyol', 'T1'), 20);
  assert.equal(await comm(db, 'trendyol', 'T2'), 30);
  assert.equal(await comm(db, 'trendyol', 'T3'), 20);
  assert.equal(await comm(db, 'trendyol', 'T4'), 24);
  assert.equal(await comm(db, 'hepsiburada', 'H1'), 21.6);
  assert.equal(await comm(db, 'trendyol_2', 'X1'), 15);
  assert.deepEqual(await getRaw(db, 'commission'), { trendyol: 20, hepsiburada: 21.6 });
  const n = await all(db, "SELECT key, title FROM notices WHERE key LIKE 'commfix:%' ORDER BY key");
  assert.deepEqual(n.map((x) => x.key), ['commfix:check', 'commfix:vat']);
  assert.match(n[1].title, /3 komisyon oranı düzeltildi/);
  // İkinci çalıştırma hiçbir şey yapmaz
  await run(db, "UPDATE listings SET commission = 24 WHERE remote_id = 'T1'");
  assert.equal(await vatFixOnce(db, now), null);
  assert.equal(await comm(db, 'trendyol', 'T1'), 24);
});

test('eski çevrimi hiç görmemiş (sonradan kurulan) panelde hiçbir şey değişmez', async () => {
  const db = d1(); await init(db);
  await setSetting(db, 'once:vat_incl_1', 1);
  const t = Date.now();
  await run(db, "INSERT INTO products (sku, name, created_at, updated_at) VALUES ('P1', 'Yeni ürün', ?, ?)", t, t);
  await listing(db, 'trendyol', 'T1', 24);
  await saveOrders(db, 'trendyol', [order('trendyol', 'O1', 'T1', 20, t - D)]);
  assert.deepEqual(await vatFixOnce(db, t), { skipped: true });
  assert.equal(await comm(db, 'trendyol', 'T1'), 24);
});
