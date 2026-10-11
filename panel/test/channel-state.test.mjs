// Kanaldaki yayın durumu (listings.remote_state): idefix havuzundaki onaylanmamış ürün (eksik bilgi / inceleme) yayında sayılmaz,
// stok / fiyat gönderilmez, hata sayılmaz; kanal yayına alınca gönderim kendiliğinden başlar. PRODUCT_NOT_FOUND kanal kaynaklıdır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all, setSetting } from '../src/db.js';
import { resetChannels, getChannels } from '../src/channels/index.js';
import { refreshListings, pushStocks, pushPrices, checkPushes, trackPush, listingState } from '../src/sync.js';
import { idefix, idefixPoolState } from '../src/channels/idefix.js';
import { isHeld, isLive, realError, isChannelSide, channelStateText } from '../public/listerr.js';
import worker from '../src/index.js';

const ENV = { IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's', IDEFIX_VENDOR_ID: '16705' };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
async function withFetch(fn, handler) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => handler({ url: String(url), method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('idefix havuz durumu → yayın durumu (büyük harf / tire toleranslı, red nedeni nota eklenir, bilinmeyen durum yayında)', () => {
  assert.deepEqual(idefixPoolState({ status: 'ready_for_sale' }), { remoteState: 'live', stateNote: '' });
  assert.deepEqual(idefixPoolState({ status: 'AUTO_MATCHED' }), { remoteState: 'live', stateNote: '' });
  assert.deepEqual(idefixPoolState({ status: 'waiting-catalog-action' }), { remoteState: 'pending', stateNote: 'idefix inceliyor' });
  assert.equal(idefixPoolState({ status: 'WAITING_VENDOR_APPROVE' }).remoteState, 'pending');
  assert.equal(idefixPoolState({ status: 'not_matched' }).remoteState, 'pending');
  assert.deepEqual(idefixPoolState({ status: 'MISSING_INFO', failureReasons: ['CATEGORY_MANDATORY_ATTRIBUTE_MISSED'] }),
    { remoteState: 'rejected', stateNote: 'eksik bilgi: zorunlu kategori özelliği eksik' });
  assert.deepEqual(idefixPoolState({ productStatus: 'missing_info' }), { remoteState: 'rejected', stateNote: 'eksik bilgi' });
  assert.equal(idefixPoolState({ status: 'platform_declined' }).remoteState, 'rejected');
  assert.equal(idefixPoolState({ status: 'archived' }).remoteState, 'passive');
  assert.equal(idefixPoolState({}).remoteState, 'live', 'durum alanı yoksa eski davranış: yayında');
  assert.equal(idefixPoolState({ status: 'tuhaf_durum' }).remoteState, 'live');
  // Diğer kanallar: active === false → passive (nedeni varsa not)
  assert.deepEqual(listingState({ active: false, stateNote: 'arşivde' }), ['passive', 'arşivde']);
  assert.deepEqual(listingState({ active: true }), [null, null]);
  assert.deepEqual(listingState({}), [null, null]);
});

test('idefix ilan yenileme: havuz durumu ilana yazılır; onay bekleyenin eski PRODUCT_NOT_FOUND hatası silinir', async () => {
  const db = d1(); await init(db);
  let pool = [
    { barcode: 'A', title: 'Yayında', status: 'ready_for_sale', price: 100, inventoryQuantity: 3 },
    { barcode: 'B', title: 'Eksik bilgi', status: 'missing_info', failureReasons: ['CATEGORY_MANDATORY_ATTRIBUTE_MISSED'], price: 100, inventoryQuantity: 0 },
    { barcode: 'C', title: 'İnceleniyor', status: 'waiting_catalog_action', price: 100, inventoryQuantity: 0 },
  ];
  const c = idefix(ENV, { id: 'idefix' });
  await run(db, "INSERT INTO listings (channel, remote_id, error, error_at, error_side) VALUES ('idefix', 'B', 'Stok kanal tarafından reddedildi: idefix bu barkodu satıştaki ürünleri arasında bulamadı', 1, 'channel')");
  await withFetch(() => refreshListings(db, c), () => J({ items: pool, pageCount: 1 }));
  const at = async () => Object.fromEntries((await all(db, 'SELECT remote_id, remote_state, remote_state_note, error, error_at FROM listings')).map((x) => [x.remote_id, x]));
  let l = await at();
  assert.equal(l.A.remote_state, null, 'yayında: NULL');
  assert.equal(l.B.remote_state, 'rejected'); assert.equal(l.B.remote_state_note, 'eksik bilgi: zorunlu kategori özelliği eksik');
  assert.equal(l.B.error, null, 'eski kanal hatası silindi'); assert.equal(l.B.error_at, null);
  assert.equal(l.C.remote_state, 'pending'); assert.equal(l.C.remote_state_note, 'idefix inceliyor');
  // idefix onaylayınca durum temizlenir
  pool = pool.map((p) => ({ ...p, status: 'ready_for_sale', failureReasons: null }));
  await withFetch(() => refreshListings(db, c), () => J({ items: pool, pageCount: 1 }));
  l = await at();
  assert.equal(l.B.remote_state, null); assert.equal(l.B.remote_state_note, null);
  assert.equal(l.C.remote_state, null);
});

test('onay bekleyen / onaylanmayan ilana stok ve fiyat gönderilmez; kanal yayına alınca gönderilir', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const ch = (await getChannels(env, db)).find((c) => c.id === 'idefix');
  const sent = { stock: [], price: [] };
  ch.pushStock = async (items) => { sent.stock.push(...items.map((x) => x.remoteId)); return {}; };
  ch.pushPrice = async (items) => { sent.price.push(...items.map((x) => x.remoteId)); return {}; };
  await setSetting(db, 'stock_sync', true);
  await run(db, "INSERT INTO products (id, name, stock, created_at, updated_at) VALUES (1, 'A', 5, 0, 0), (2, 'B', 6, 0, 0), (3, 'C', 7, 0, 0)");
  await run(db, `INSERT INTO listings (channel, remote_id, product_id, pushed_stock, price, price_dirty, remote_state, remote_state_note) VALUES
    ('idefix', 'L1', 1, 0, 100, 1, NULL, NULL), ('idefix', 'L2', 2, 0, 100, 1, 'pending', 'idefix inceliyor'), ('idefix', 'L3', 3, 0, 100, 1, 'rejected', 'eksik bilgi')`);
  await pushStocks(env, db, null, ['idefix']);
  await pushPrices(env, db);
  assert.deepEqual(sent.stock, ['L1']);
  assert.deepEqual(sent.price, ['L1']);
  const l = Object.fromEntries((await all(db, 'SELECT remote_id, pushed_stock, price_dirty, error FROM listings')).map((x) => [x.remote_id, x]));
  assert.equal(l.L2.pushed_stock, 0); assert.equal(l.L2.price_dirty, 1, 'bekleyen fiyat korunur'); assert.equal(l.L2.error, null, 'hata yazılmaz');
  // Kanal yayına aldı (ilan yenilemede durum temizlenir): bekleyen stok ve fiyat gönderilir
  ch.fetchListings = async () => ['L1', 'L2', 'L3'].map((id) => ({ remoteId: id, sku: id, name: id, price: 100, stock: id === 'L1' ? 5 : 0 }));
  await refreshListings(db, ch);
  sent.stock = []; sent.price = [];
  await pushStocks(env, db, null, ['idefix']);
  await pushPrices(env, db);
  assert.deepEqual(sent.stock.sort(), ['L2', 'L3']);
  assert.deepEqual(sent.price.sort(), ['L2', 'L3']);
  resetChannels();
});

test('idefix PRODUCT_NOT_FOUND kanal kaynaklı: ilana kanal kaynaklı yazılır, bildirim / hata sayısına girmez', async () => {
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' };
  const ch = (await getChannels(env, db)).find((c) => c.id === 'idefix');
  // Gerçek idefix sonucu çözümlemesi (side: 'channel')
  const real = idefix(ENV, { id: 'idefix' });
  const res = await withFetch(() => real.pushStatus('R1'), () => J({ status: 'COMPLETED', items: [
    { barcode: 'NF', status: 'decline', failureReasons: ['PRODUCT_NOT_FOUND'] }, { barcode: 'NP', status: 'decline', failureReasons: [{ code: 'NO_PRICE' }] }] }));
  assert.equal(res.items[0].side, 'channel'); assert.equal(res.items[1].side, undefined);
  ch.pushStatus = async () => res;
  await run(db, "INSERT INTO listings (channel, remote_id, price, pushed_stock) VALUES ('idefix', 'NF', 100, 3), ('idefix', 'NP', 100, 3)");
  await trackPush(db, ch, 'stock', { refs: ['R1'] }, 2);
  await run(db, 'UPDATE push_checks SET at = at - 120000');
  assert.deepEqual(await checkPushes(env, db), { checked: 1, failed: 1 }, 'yalnız gerçek hata sayılır');
  const l = Object.fromEntries((await all(db, 'SELECT remote_id, error, error_side FROM listings')).map((x) => [x.remote_id, x]));
  assert.equal(l.NF.error_side, 'channel'); assert.match(l.NF.error, /bulamadı/);
  assert.equal(l.NP.error_side, null);
  const n = await first(db, "SELECT msg FROM notices WHERE key = 'stockreject:idefix' AND resolved_at IS NULL");
  assert.ok(n && /NP/.test(n.msg) && !/NF/.test(n.msg), 'bildirimde yalnız gerçek hata');
  resetChannels();
});

test('API: hata sayıları kanal kaynaklıyı saymaz; ürün listesi ilan durumunu verir; hatalı ilanlar penceresinde ayrı grup', async () => {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  const db = env.DB; await init(db);
  await run(db, "INSERT INTO products (id, name, sku, stock, created_at, updated_at) VALUES (1, 'Yoga Matı', 'YM', 5, 0, 0), (2, 'Termos', 'TR', 5, 0, 0)");
  await run(db, `INSERT INTO listings (channel, remote_id, product_id, price, pushed_stock, error, error_side, remote_state, remote_state_note) VALUES
    ('idefix', 'I1', 1, 100, 0, NULL, NULL, 'rejected', 'eksik bilgi'),
    ('idefix', 'I2', 2, 100, 5, 'Stok kanal tarafından reddedildi: idefix bu barkodu satıştaki ürünleri arasında bulamadı', 'channel', NULL, NULL),
    ('idefix', 'I3', NULL, 100, 0, NULL, NULL, 'pending', 'idefix inceliyor'),
    ('trendyol', 'T1', 1, 100, 5, NULL, NULL, NULL, NULL),
    ('trendyol', 'T2', 2, 100, 5, 'Stok: HTTP 500', NULL, NULL, NULL)`);
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  const chs = await call('channels');
  const ix = chs.find((c) => c.id === 'idefix'), ty = chs.find((c) => c.id === 'trendyol');
  assert.ok(ix && ty);
  assert.equal(ix.listingErrors, 0, 'idefix: gerçek hata yok'); assert.equal(ix.channelSide, 3, 'onaylanmayan + bekleyen + kanal kaynaklı hata');
  assert.equal(ty.listingErrors, 1); assert.equal(ty.channelSide, 0);
  const r = await call('listings/errors?channel=idefix');
  assert.equal(r.total, 0);
  assert.equal(r.channelSide.total, 3);
  assert.deepEqual(r.channelSide.groups.map((g) => g.state || 'hata').sort(), ['hata', 'pending', 'rejected']);
  const all0 = await call('listings/errors');
  assert.equal(all0.total, 1); assert.equal(all0.groups[0].channel, 'trendyol');
  const errOnly = await call('products?filter=error');
  assert.deepEqual(errOnly.products.map((p) => p.id), [2], 'yalnız gerçek hatalı ürün (Trendyol HTTP 500)');
  const list = await call('products');
  const ym = list.products.find((p) => p.id === 1);
  const il = ym.listings.find((l) => l.channel === 'idefix');
  assert.equal(il.remote_state, 'rejected'); assert.equal(il.remote_state_note, 'eksik bilgi');
  // Ürün listesindeki logolar: yalnız yayında olan kanallar (istemci kuralı)
  assert.deepEqual([...new Set(ym.listings.filter((l) => !isHeld(l)).map((l) => l.channel))], ['trendyol']);
  const d = await call('dashboard');
  assert.equal(d.stock.errors, 1, 'özet: yalnız gerçek hata');
  assert.equal(d.stock.waiting, 0, 'onay bekleyen ilan gönderim beklemez');
});

test('istemci kuralları: yayında değil / kanal kaynaklı / gerçek hata ayrımı ve açıklama', () => {
  const held = { channel: 'idefix', remote_state: 'rejected', remote_state_note: 'eksik bilgi', error: 'eski' };
  assert.equal(isHeld(held), true); assert.equal(isLive(held), false); assert.equal(realError(held), false); assert.equal(isChannelSide(held), true);
  assert.equal(channelStateText(held, 'idefix').short, 'yayında değil — idefix onaylamadı (eksik bilgi)');
  assert.match(channelStateText(held, 'idefix').fix, /idefix kaynaklı, panelden kaynaklanmıyor/);
  const nf = { remote_state: null, error: 'Stok kanal tarafından reddedildi: PRODUCT_NOT_FOUND', error_side: 'channel' };
  assert.equal(realError(nf), false); assert.equal(isChannelSide(nf), true); assert.equal(isLive(nf), true);
  assert.match(channelStateText(nf, 'idefix').short, /idefix kaynaklı/);
  const bad = { error: 'Stok: HTTP 500' };
  assert.equal(realError(bad), true); assert.equal(channelStateText(bad, 'x'), null);
  assert.equal(isLive({ remote_state: 'passive' }), false); assert.equal(isHeld({ remote_state: 'passive' }), false);
});
