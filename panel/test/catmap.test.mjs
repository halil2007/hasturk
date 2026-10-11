// Kategori eşleştirme ekranı: tüm kategori × kanal için toplu öneri, kesinleri toplu onay, hücre değiştirme,
// zorunlu özellik eksikleri, arka plan önerisi (kesinleri otomatik onay ayarı) ve Kanallarda yayınla'nın eşleşmeyi kullanması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, all, first, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { autoSuggest } from '../src/catmap.js';
import worker from '../src/index.js';

const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;

async function setup() {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', DB: db, TRENDYOL_SELLER_ID: '123', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's', IKAS1_STORE: 'magaza', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c', IKAS1_STOCK_LOCATION_ID: 'loc1' };
  // Arka plan önerisi bu testte elle çalıştırılır (girişteki senkron beklenmeden öneri hazırlamasın)
  for (const c of ['trendyol', 'ikas1']) await setSetting(db, 'automap2:' + c, Date.now());
  const t = Date.now();
  for (const [sku, name, cat] of [['A', 'Solucan Gübresi 5 Kg', 'Gübre'], ['B', 'Organik Saksı Toprağı', 'Bahçe › Toprak'], ['C', 'Budama Makası', 'El Aletleri']]) {
    await run(db, "INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, 'HG', ?, 'https://cdn.x/a.jpg', 100, 5, ?, ?)", sku, 'B' + sku, name, cat, t, t);
  }
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    let body = {}; try { body = JSON.parse(opts.body); } catch { /* form gövdesi */ }
    if (/product-categories$/.test(u)) return J({ categories: [{ id: 1, name: 'Bahçe', subCategories: [{ id: 2001, name: 'Organik Gübre', subCategories: [] }, { id: 2002, name: 'Saksı Toprağı', subCategories: [] }, { id: 2003, name: 'Kimyevi Gübre', subCategories: [] }] }] });
    if (/\/product\/categories\/200\d\/attributes$/.test(u)) return J({ categoryAttributes: [
      { attribute: { id: 1192, name: 'Menşei' }, required: true, allowCustom: false, attributeValues: [{ id: 10617, name: 'TR' }] },
      { attribute: { id: 60, name: 'Renk' }, required: true, allowCustom: false, attributeValues: [{ id: 6001, name: 'Kahverengi' }] }] });
    if (/brands\/by-name/.test(u)) return J([{ id: 555, name: 'HG' }]);
    if (/oauth\/token/.test(u)) return J({ access_token: 'T', expires_in: 3600 });
    if (/myikas\.com\/api\/v1\/admin\/graphql/.test(u) && /listCategory/.test(body.query)) return J({ data: { listCategory: [{ id: 'k1', name: 'Gübre', parentId: null }, { id: 'k0', name: 'Bahçe', parentId: null }, { id: 'k2', name: 'Toprak', parentId: 'k0' }] } });
    return J({ data: {}, content: [], totalPages: 1 });
  };
  let cookie = '';
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, body: o.body && JSON.stringify(o.body), headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const b = await r.json();
    assert.equal(r.status, 200, JSON.stringify(b));
    return b;
  };
  await call('login', { method: 'POST', body: { password: 'x-123456' } });
  return { db, env, call };
}
const done = () => { globalThis.fetch = realFetch; resetChannels(); };

test('kategori eşleştirme: toplu öneri, kesinleri onayla, hücre değiştir, eksik özellik, yayınla eşleşmeyi kullanır', async () => {
  const { db, call } = await setup();
  try {
    let mx = await call('catalog/matrix');
    assert.deepEqual(mx.locals.map((l) => l.local), ['Bahçe › Toprak', 'El Aletleri', 'Gübre']);
    assert.deepEqual(mx.channels.map((c) => [c.id, c.kind]).sort(), [['ikas1', 'store'], ['trendyol', 'market']]);
    assert.equal(mx.todo, 6);
    // Toplu öneri: küçük parçalarla, kaldığı yerden devam eder
    let r = await call('catalog/automap-all', { method: 'POST', body: {} });
    assert.equal(r.processed, 6, JSON.stringify(r)); assert.equal(r.remaining, 0);
    mx = await call('catalog/matrix');
    assert.deepEqual(mx.cells['Gübre'].ikas1, { state: 'suggested', remote_id: 'k1', name: 'Gübre', path: '', sure: true });
    assert.equal(mx.cells['Bahçe › Toprak'].ikas1.remote_id, 'k2'); assert.equal(mx.cells['Bahçe › Toprak'].ikas1.sure, true);
    assert.equal(mx.cells['Gübre'].trendyol.state, 'suggested'); assert.equal(mx.cells['Gübre'].trendyol.name, 'Organik Gübre');
    assert.equal(mx.cells['Bahçe › Toprak'].trendyol.name, 'Saksı Toprağı');
    assert.equal(mx.cells['El Aletleri'].ikas1.state, 'none');
    // Kesinleri onayla: yalnız kesin öneriler eşleşir
    const sureTy = Object.values(mx.cells).filter((c) => c.trendyol && c.trendyol.sure).length;
    const a = await call('catalog/approve-sure', { method: 'POST', body: {} });
    assert.equal(a.approved, 2 + sureTy);
    assert.equal((await first(db, "SELECT remote_id FROM category_map WHERE local = 'Gübre' AND channel = 'ikas1'")).remote_id, 'k1');
    // Hücre değiştir: pazaryeri kategorisi elle seçilir; zorunlu özellik eksikleri sayılır (Menşei otomatik TR)
    await call('catalog/cell', { method: 'POST', body: { local: 'Gübre', channel: 'trendyol', remote_id: '2003', remote_name: 'Kimyevi Gübre' } });
    mx = await call('catalog/matrix');
    assert.deepEqual(mx.cells['Gübre'].trendyol, { state: 'mapped', remote_id: '2003', name: 'Kimyevi Gübre', missing: ['Renk'] });
    assert.equal(mx.summary.find((s) => s.id === 'ikas1').pct, 67);
    // Varsayılan özellik doldurulunca eksik kalmaz (mevcut eşleştirme kaydı: catalog/map)
    const m = await first(db, "SELECT attrs FROM category_map WHERE local = 'Gübre' AND channel = 'trendyol'");
    await call('catalog/map', { method: 'POST', body: { local: 'Gübre', channel: 'trendyol', remote_id: '2003', remote_name: 'Kimyevi Gübre', attrs: { ...JSON.parse(m.attrs), 60: { id: '6001', value: 'Kahverengi' } } } });
    mx = await call('catalog/matrix');
    assert.deepEqual(mx.cells['Gübre'].trendyol.missing, []);
    // Öneriyi reddet: aynı kategori tekrar önerilmez
    await call('catalog/cell', { method: 'POST', body: { local: 'El Aletleri', channel: 'trendyol', reject: true } });
    // Kanallarda yayınla aynı eşleşmeyi kullanır
    const id = (await first(db, "SELECT id FROM products WHERE sku = 'A'")).id;
    const pf = await call(`catalog/preflight?ids=${id}&channels=trendyol`);
    assert.equal(pf.channels[0].cats[0].state, 'mapped'); assert.equal(pf.channels[0].cats[0].remote_id, '2003');
    assert.ok(!pf.channels[0].items[0].missing.includes('Kategori onayı'));
  } finally { done(); }
});

test('arka plan önerisi: günde bir; kesinler yalnız ayar açıkken otomatik onaylanır', async () => {
  const { db, env } = await setup();
  try {
    await run(db, "DELETE FROM settings WHERE k LIKE 'automap2:%'");
    await autoSuggest(env, db);
    assert.ok((await all(db, 'SELECT * FROM category_suggest')).length >= 5);
    assert.equal((await all(db, 'SELECT * FROM category_map')).length, 0, 'ayar kapalı: onay yok');
    await setSetting(db, 'auto_approve_sure', true);
    await run(db, "DELETE FROM settings WHERE k LIKE 'automap2:%'");
    const r = await autoSuggest(env, db);
    assert.ok(r.approved >= 2);
    const maps = await all(db, 'SELECT local, channel FROM category_map');
    assert.ok(maps.some((x) => x.local === 'Gübre' && x.channel === 'ikas1'));
    assert.equal((await all(db, "SELECT * FROM category_map m JOIN category_suggest s ON s.local = m.local AND s.channel = m.channel")).length, 0);
  } finally { done(); }
});
