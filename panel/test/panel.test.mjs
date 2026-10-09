// Çalıştırma: cd panel && node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, first, getSettings } from '../src/db.js';
import { saveOrders, applyStock, pushStocks, autoLink, mirrorStock } from '../src/sync.js';
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

test('Entegrasyonlar: API bilgisi şifreli saklanır, gizli değer istemciye dönmez, panel değeri kullanılır', async () => {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 'sir', DB: d1() };
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: env.cookie || '' } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) env.cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  let r = await call('/api/integrations');
  const ty0 = r.body.channels.find((c) => c.id === 'trendyol');
  assert.equal(ty0.enabled, false);
  await call('/api/integrations/trendyol', { method: 'PUT', body: JSON.stringify({ values: { TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'key', TRENDYOL_API_SECRET: 'cok-gizli-1234' } }) });
  const row = await env.DB.prepare("SELECT data FROM channel_config WHERE id = 'trendyol'").first();
  assert.ok(!row.data.includes('cok-gizli'), 'veritabanında açık metin olmamalı');
  r = await call('/api/integrations');
  const ty = r.body.channels.find((c) => c.id === 'trendyol');
  assert.equal(ty.enabled, true);
  const sec = ty.fields.find((f) => f.k === 'TRENDYOL_API_SECRET');
  assert.equal(sec.value, '');
  assert.equal(sec.masked, '••••••1234');
  assert.ok(!JSON.stringify(r.body).includes('cok-gizli'), 'gizli değer cevapta olmamalı');
  // Boş gizli alan gönderilince eski değer korunur
  await call('/api/integrations/trendyol', { method: 'PUT', body: JSON.stringify({ values: { TRENDYOL_API_KEY: 'key2', TRENDYOL_API_SECRET: '' } }) });
  r = await call('/api/integrations');
  assert.equal(r.body.channels.find((c) => c.id === 'trendyol').fields.find((f) => f.k === 'TRENDYOL_API_SECRET').masked, '••••••1234');
  // Pasif kanal
  await call('/api/integrations/trendyol', { method: 'PUT', body: JSON.stringify({ active: false }) });
  r = await call('/api/integrations');
  const ty2 = r.body.channels.find((c) => c.id === 'trendyol');
  assert.equal(ty2.active, false);
  assert.equal(ty2.enabled, false);
  // Farklı şifreleme anahtarıyla okunamaz (kilitli) olarak işaretlenir
  const other = { ...env, PANEL_SECRET: 'baska' };
  const { loadConfig } = await import('../src/config.js');
  assert.equal((await loadConfig(other, env.DB)).trendyol.locked, true);
});

test('Sipariş listesi: tarih / durum filtresi, sayfalama, kâr ve CSV', async () => {
  const db = await setup();
  await saveOrders(db, 'trendyol', [order('A1', Date.parse('2026-09-10T10:00:00Z'), 1), order('A2', Date.parse('2026-09-20T10:00:00Z'), 2), order('A3', Date.parse('2026-09-20T12:00:00Z'), 1, { status: 'cancelled' })]);
  await db.prepare('UPDATE products SET purchase_price = 40 WHERE id = 1').run();
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  const j = await (await call('/api/orders?status=all&from=2026-09-15&to=2026-09-30&limit=1&page=1')).json();
  assert.equal(j.total, 2);
  assert.equal(j.orders.length, 1);
  const { late, ...counts } = j.counts;
  assert.deepEqual(counts, { new: 1, cancelled: 1 });
  assert.equal(late, 0, '15 günden eski sipariş gecikenlerde sayılmaz');
  await saveOrders(db, 'trendyol', [order('A4', Date.now() - 2 * 864e5, 1)]);
  assert.equal((await (await call('/api/orders?status=late')).json()).counts.late, 1, '1 günü aşan yeni sipariş gecikmede sayılır');
  await db.prepare("DELETE FROM orders WHERE id = 'trendyol:A4'").run();
  const all = await (await call('/api/orders?status=new&limit=10')).json();
  const a2 = all.orders.find((o) => o.order_number === 'A2');
  // 200 satış − %20 + KDV komisyon (48) − %1 stopaj (KDV hariç 166,67 → 1,67; KDV'si yok) − 2×40 maliyet = 70,33
  assert.equal(a2.profit, 70.33);
  const buf = new Uint8Array(await (await call('/api/orders.csv?status=all')).arrayBuffer());
  assert.deepEqual([...buf.slice(0, 3)], [0xef, 0xbb, 0xbf], 'Excel için UTF-8 BOM');
  const csv = new TextDecoder().decode(buf);
  assert.match(csv, /^Kanal;Sipariş no/);
  assert.match(csv, /;İptal;/);
  assert.equal(csv.trim().split('\n').length, 4);
});

test('stok senkronu kapalıyken: hiçbir kanala stok gitmez, panel stoğu ikas sitesinden okunur, panelden değiştirilemez', async () => {
  const db = d1();
  await init(db);
  assert.equal((await getSettings(db)).stock_sync, false, 'ilk kurulumda stok gönderimi kapalı');
  await db.prepare("INSERT INTO products (id, sku, barcode, name, stock, created_at, updated_at) VALUES (1, 'A', '111', 'Ürün A', 10, 0, 0), (2, 'B', '222', 'Ürün B', 3, 0, 0)").run();
  await db.prepare("INSERT INTO listings (channel, remote_id, product_id, sku, barcode, pushed_stock, remote_stock) VALUES ('ikas1', 'v1', 1, 'A', '111', 7, 7), ('trendyol', '111', 1, 'A', '111', 99, 99), ('trendyol', '222', 2, 'B', '222', 50, 50)").run();
  // Trendyol satışı stoğu düşürmez ve hiçbir kanala stok gönderilmez
  await applyStock(db, await saveOrders(db, 'trendyol', [order('T9', Date.now(), 2)]));
  assert.deepEqual(await pushStocks({ DEMO: '1' }, db), { skipped: 'Stok senkronu kapalı' });
  // Panel stoğu ikas'taki adede eşitlenir; ikas ilanı olmayan ürüne dokunulmaz (Trendyol stoğu esas alınmaz)
  assert.equal(await mirrorStock(db), 1);
  assert.equal(await stock(db), 7);
  assert.equal((await first(db, 'SELECT stock FROM products WHERE id = 2')).stock, 3);
  assert.equal((await first(db, "SELECT reason FROM stock_moves WHERE product_id = 1")).reason, 'Site stoğu (ikas)');
  assert.equal(await mirrorStock(db), 0, 'değişiklik yoksa yazılmaz');
  // Panelden stok değiştirme: ikas ilanı olan üründe engellenir, olmayanda serbest
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  const r1 = await call('/api/products/1/stock', { method: 'POST', body: JSON.stringify({ qty: 1 }) });
  assert.equal(r1.status, 409);
  assert.match((await r1.json()).error, /ikas/);
  assert.equal((await call('/api/products/2/stock', { method: 'POST', body: JSON.stringify({ qty: 1 }) })).status, 200);
  // Senkron açılınca ikas'tan okuma durur, stok panelde tutulur
  await setSetting(db, 'stock_sync', true);
  await db.prepare("UPDATE listings SET remote_stock = 1 WHERE channel = 'ikas1'").run();
  assert.equal(await mirrorStock(db), 0);
  assert.equal(await stock(db), 7);
  // Tek seferlik kapatma işaretlenmiştir: sonraki açılışlarda kullanıcının açtığı ayar korunur
  assert.ok(await first(db, "SELECT 1 AS x FROM settings WHERE k = 'once:stock_off_1'"));
});

test('ikas beklemede değil (panelden paketlenir); bekleme ayardan açılırsa kanala yazmaz', async () => {
  const { getChannels, resetChannels } = await import('../src/channels/index.js');
  const db = d1();
  await init(db);
  const env = { IKAS1_STORE: 's', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c' };
  resetChannels();
  let ik = (await getChannels(env, db)).find((c) => c.id === 'ikas1');
  assert.ok(!ik.hold && ik.label && ik.cancelPackage && ik.caps.external, 'varsayılan: ikas işlemleri panelden yapılır');
  await setSetting(db, 'hold_channels', ['ikas1']);
  ik = (await getChannels(env, db)).find((c) => c.id === 'ikas1');
  assert.equal(ik.hold, true);
  assert.ok(ik.fetchOrders && ik.fetchListings && ik.label, 'okuma ve etiket okuma açık');
  assert.ok(!ik.pack && !ik.pushStock && !ik.pushPrice && !ik.ship && !ik.createProduct && !ik.repack, 'yazma işlemleri kapalı');
  await setSetting(db, 'hold_channels', []);
  ik = (await getChannels(env, db)).find((c) => c.id === 'ikas1');
  assert.ok(!ik.hold && ik.cancelPackage && ik.pushStock, 'beklemeden çıkınca yazma açılır');
  resetChannels();
});

test('eski kurulumdaki ikas beklemesi bir kez kaldırılır', async () => {
  const db = d1();
  await db.prepare("CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)").run();
  await db.prepare("INSERT INTO settings (k, v) VALUES ('hold_channels', '[\"ikas1\",\"ikas2\",\"pttavm\"]')").run();
  await init(db);
  assert.deepEqual(JSON.parse((await db.prepare("SELECT v FROM settings WHERE k = 'hold_channels'").first()).v), ['pttavm']);
});

test('art arda hata veren kanal kademeli beklenir; "Senkronla" (force) beklemeyi atlar', async () => {
  const { syncAll } = await import('../src/sync.js');
  const db = d1();
  await init(db);
  await setSetting(db, 'last:trendyol', { at: Date.now() - 60e3, ok: false, fails: 4, error: 'HTTP 503' });
  const r = await syncAll({ DEMO: '1' }, db, { only: ['trendyol'] });
  assert.match(String(r.channels.trendyol), /beklemede: art arda 4 hata/);
  const f = await syncAll({ DEMO: '1' }, db, { only: ['trendyol'], force: true });
  assert.equal(typeof f.channels.trendyol, 'number', 'elle senkron hemen dener');
});

test('API bilgileri kaydedilince eski hata ve kademeli bekleme sıfırlanır', async () => {
  const db = d1();
  await init(db);
  await setSetting(db, 'last:hepsiburada', { at: Date.now(), ok: false, fails: 5, error: 'HTTP 401', nextTry: Date.now() + 3600e3 });
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  await call('/api/integrations/hepsiburada', { method: 'PUT', body: JSON.stringify({ values: { HB_USER_AGENT: 'hasturk_dev' } }) });
  const last = JSON.parse((await first(db, "SELECT v FROM settings WHERE k = 'last:hepsiburada'")).v);
  assert.equal(last.fails, 0); assert.equal(last.error, null); assert.equal(last.nextTry, null);
  assert.match(last.note, /güncellendi/);
});

test('API bilgisi biçim kontrolü: Hepsiburada Merchant ID yerine yazı girilirse kaydedilmez', async () => {
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  const bad = await call('/api/integrations/hepsiburada', { method: 'PUT', body: JSON.stringify({ values: { HB_MERCHANT_ID: 'Merchant ID' } }) });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /36 karakterlik/);
  const ok = await call('/api/integrations/hepsiburada', { method: 'PUT', body: JSON.stringify({ values: { HB_MERCHANT_ID: '10012bc1-3a53-4306-b782-11eed9083af2' } }) });
  assert.equal(ok.status, 200);
});

test('çoklu mağaza: aynı türden ek mağaza eklenir, kendi bilgileriyle çalışır, ana mağazayı etkilemez, kaldırılabilir', async () => {
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x-123456', DB: db, TRENDYOL_SELLER_ID: '111', TRENDYOL_API_KEY: 'k1', TRENDYOL_API_SECRET: 's1' };
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  const a = await (await call('/api/integrations/add', { method: 'POST', body: JSON.stringify({ type: 'trendyol' }) })).json();
  assert.equal(a.id, 'trendyol_2');
  const b = await (await call('/api/integrations/add', { method: 'POST', body: JSON.stringify({ type: 'trendyol' }) })).json();
  assert.equal(b.id, 'trendyol_3');
  // Eklenen mağaza boşken Cloudflare'deki ana mağaza bilgilerini devralmaz
  let list = (await (await call('/api/integrations')).json()).channels;
  let t2 = list.find((c) => c.id === 'trendyol_2');
  assert.equal(t2.type, 'trendyol'); assert.equal(t2.enabled, false);
  assert.equal(t2.fields.find((f) => f.k === 'TRENDYOL_SELLER_ID').value, '');
  assert.ok(t2.fields.some((f) => f.k === 'STORE_LABEL'));
  const put = await call('/api/integrations/trendyol_2', { method: 'PUT', body: JSON.stringify({ values: { STORE_LABEL: 'Trendyol Bahçe', TRENDYOL_SELLER_ID: '222', TRENDYOL_API_KEY: 'k2', TRENDYOL_API_SECRET: 's2' } }) });
  assert.equal(put.status, 200);
  list = (await (await call('/api/integrations')).json()).channels;
  t2 = list.find((c) => c.id === 'trendyol_2');
  assert.equal(t2.name, 'Trendyol Bahçe'); assert.equal(t2.enabled, true);
  const t1 = list.find((c) => c.id === 'trendyol');
  assert.equal(t1.fields.find((f) => f.k === 'TRENDYOL_SELLER_ID').value, '111'); // ana mağaza değişmedi
  // Ek mağazaya ait ayar (ör. stok gönderimi) kabul edilir
  const st = await (await call('/api/settings', { method: 'PUT', body: JSON.stringify({ stock_push: { trendyol_2: true } }) })).json();
  assert.equal(st.stock_push.trendyol_2, true);
  // Ana mağaza kaldırılamaz, ek mağaza kaldırılır
  assert.equal((await call('/api/integrations/trendyol/remove', { method: 'POST' })).status, 400);
  assert.equal((await call('/api/integrations/trendyol_3/remove', { method: 'POST' })).status, 200);
  list = (await (await call('/api/integrations')).json()).channels;
  assert.ok(!list.some((c) => c.id === 'trendyol_3'));
  assert.ok(list.some((c) => c.id === 'trendyol_2'));
});

test('personel yetkileri: yalnız seçilen bölümlerin API\'si açılır, yönetici her şeyi görür', async () => {
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  const jar = { a: '', s: '' };
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who] } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) jar[who] = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  const A = call('a'), S = call('s');
  await A('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  assert.equal((await A('/api/users', { method: 'POST', body: JSON.stringify({ username: 'depo', name: 'Depo', password: 'depo-sifre-1', role: 'staff', perms: ['orders', 'cargo', 'yok-boyle'] }) })).status, 200);
  const u = (await (await A('/api/users')).json()).find((x) => x.username === 'depo');
  assert.deepEqual(u.perms, ['orders', 'cargo']);
  await S('/api/login', { method: 'POST', body: JSON.stringify({ username: 'depo', password: 'depo-sifre-1' }) });
  assert.equal((await S('/api/orders')).status, 200);
  assert.equal((await S('/api/packages')).status, 200);
  assert.equal((await S('/api/finance')).status, 403);
  assert.equal((await S('/api/customers/summary')).status, 403);
  assert.equal((await S('/api/questions')).status, 403);
  assert.equal((await S('/api/summary')).status, 200, 'genel bakış her zaman açık');
  assert.deepEqual((await (await S('/api/me')).json()).user.perms, ['orders', 'cargo']);
  // Yetki genişletilince hemen geçerli olur
  await A(`/api/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ name: 'Depo', role: 'staff', perms: ['orders', 'finance'] }) });
  assert.equal((await S('/api/finance')).status, 200);
  assert.equal((await A('/api/finance')).status, 200);
});
