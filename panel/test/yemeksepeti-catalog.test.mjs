// Yemeksepeti ürün ekleme (BETA): Partner API v2.0.2 OpenAPI'sindeki "Add Products" (POST /v2/chains/{chain}/catalog), "Product Addition Status"
// (GET …/catalog/jobs/{job_id}) ve "Vendor Categories" (GET …/vendors/{vendor}/categories) şemalarıyla sahte cevaplar. Servis pilot olarak
// açıldığı için panelde YEMEKSEPETI_CATALOG = 1 olmadan ürün yükleme kapalıdır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { yemeksepeti } from '../src/channels/yemeksepeti.js';
import worker from '../src/index.js';

const ENV = { YEMEKSEPETI_CLIENT_ID: 'cid', YEMEKSEPETI_CLIENT_SECRET: 'sec', YEMEKSEPETI_CHAIN_ID: 'CH1', YEMEKSEPETI_VENDOR_ID: 'V9' };
const CATS = { categories: [
  { global_id: 'p-1', details: { name: { tr_TR: 'Bahçe' } }, parent_global_id: null, active: true },
  { global_id: 'c-11', details: { name: { tr_TR: 'Gübre' } }, parent_global_id: 'p-1', active: true },
  { global_id: 'c-12', details: { name: { tr_TR: 'Eski Reyon' } }, parent_global_id: 'p-1', active: false },
  { global_id: 'p-2', details: { name: { en_TR: 'Drinks' } }, parent_global_id: null, active: true }] };
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
function mock(extra = {}) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return real(url, opts);
    const c = { url: u, path: u.replace(/^https:\/\/[^/]+/, '').split('?')[0], method: opts.method || 'GET', body: opts.body && /json/.test((opts.headers || {})['Content-Type'] || '') ? JSON.parse(opts.body) : null };
    calls.push(c);
    if (c.path === '/v2/oauth/token') return J({ access_token: 'tok', expires_in: 3600 });
    const k = `${c.method} ${c.path}`;
    if (extra[k]) { const r = await extra[k](c); return r instanceof Response ? r : J(r); }
    if (k === 'GET /v2/chains/CH1/vendors/V9/categories') return J(CATS);
    return J({ message: 'yok' }, 404);
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const PR = (i, o = {}) => ({ id: i, sku: `SKU-${i}`, barcode: `86900${i}`, name: `Süt ${i}`, description: '<p>Tam yağlı <b>süt</b></p><p>1 L</p>', image: 'https://cdn.ornek.com/a.jpg', images: ['https://cdn.ornek.com/a.jpg', 'https://cdn.ornek.com/b.webp'], price: 39.75, stock: 3, ...o });

test('Yemeksepeti ürün ekleme: beta seçeneği kapalıyken yok; kategoriler, eksikler, gönderim ve iş sonucu', async () => {
  assert.equal(yemeksepeti(ENV, { id: 'yemeksepeti' }).catalog, undefined);
  let polls = 0;
  const m = mock({
    'POST /v2/chains/CH1/catalog': (c) => (c.body.products.length > 1 ? { job_id: 'job-1', job_status: 'QUEUED', duplicated_products: [] } : J({ message: 'Forbidden: pilot partner değil' }, 403)),
    'GET /v2/chains/CH1/catalog/jobs/job-1': () => (++polls === 1 ? { job_id: 'job-1', job_status: 'IN_PROGRESS' } : { job_id: 'job-1', job_status: 'COMPLETED', result: {
      duplicated_products: ['V9:SKU-3'],
      item_level_feedback: [{ sku: 'SKU-2', barcodes: ['869002'], vendor_id: 'V9', status: 'Product creation failed', rejection_reasons: [{ rejected_data: 'images', rejected_reason: 'poor quality' }] }] } }),
  });
  try {
    const c = yemeksepeti({ ...ENV, YEMEKSEPETI_CATALOG: '1' }, { id: 'yemeksepeti' }).catalog;
    const cats = await c.categories('');
    assert.deepEqual(cats.items, [{ id: 'c-11', name: 'Gübre', path: 'Bahçe' }, { id: 'p-2', name: 'Drinks', path: '' }], 'yalnız etkin son kategoriler');
    assert.ok(m.calls.find((x) => x.path.endsWith('/categories')).url.includes('only_leaves=false'));
    let b = await c.build(PR(1), { remote_id: 'c-11' });
    assert.deepEqual(b.missing, []); assert.equal(b.key, 'SKU-1');
    assert.deepEqual(b.payload, { sku: 'SKU-1', title: { tr_TR: 'Süt 1' }, barcodes: ['869001'], description: { tr_TR: 'Tam yağlı süt\n1 L' }, images: ['https://cdn.ornek.com/a.jpg'], categories: ['c-11'], price: 39.75 });
    b = await c.build(PR(9, { sku: '', barcode: '', price: 0, image: 'https://cdn.ornek.com/x.webp', images: [] }), { remote_id: 'c-11' });
    assert.deepEqual(b.missing, ['SKU', 'barkod', 'fiyat', 'görsel (Yemeksepeti yalnız JPG / PNG kabul eder)']);
    const items = [1, 2, 3, 4].map((i) => ({ sku: `SKU-${i}` }));
    const { ref } = await c.send(items);
    assert.equal(ref, 'job-1:SKU-1,SKU-2,SKU-3,SKU-4');
    const post = m.calls.find((x) => x.method === 'POST' && x.path === '/v2/chains/CH1/catalog');
    assert.deepEqual(post.body.vendors, ['V9']);
    let st = await c.status(ref);
    assert.equal(st.done, false);
    st = await c.status(ref);
    assert.equal(st.done, true);
    const by = Object.fromEntries(st.items.map((x) => [x.key, x]));
    assert.equal(by['SKU-1'].ok, true);
    assert.deepEqual(by['SKU-2'], { key: 'SKU-2', ok: false, status: 'Yemeksepeti kabul etmedi', error: 'images: poor quality' });
    assert.equal(by['SKU-3'].ok, false); assert.match(by['SKU-3'].error, /önceki bir gönderimde/);
    // Pilot açılmamış hesap: servis reddeder, gönderim hata verir
    await assert.rejects(() => c.send([{ sku: 'X' }]), /HTTP 403/);
  } finally { m.restore(); }
});

test('Yemeksepeti ürün yükleme ekranı: beta kapalıyken nedeni söylenir, açılınca eşleştirme ve gönderim', async () => {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  const t = Date.now();
  await run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, list_price, vat, desi, stock, created_at, updated_at)
    VALUES ('SUT-1', '869001', 'Süt 1 L', 'Ova', 'Süt', 'https://cdn.ornek.com/s.jpg', 40, 40, 1, 1, 9, ?, ?)`, t, t);
  const m = mock({ 'POST /v2/chains/CH1/catalog': () => ({ job_id: 'job-9', job_status: 'QUEUED' }) });
  try {
    let cookie = '';
    const call = async (path, o = {}) => {
      const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return r.json();
    };
    await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
    await call('integrations/yemeksepeti', { method: 'PUT', body: JSON.stringify({ values: ENV }) });
    await setSetting(db, 'verified:yemeksepeti', { at: Date.now() + 1000 }); resetChannels();
    let st = await call('catalog/state');
    let ys = st.channels.find((c) => c.id === 'yemeksepeti');
    assert.ok(ys, JSON.stringify(st.channels.map((c) => c.id)));
    assert.equal(ys.ready, false); assert.match(ys.reason, /beta/);
    assert.match((await call('catalog/remote-categories?channel=yemeksepeti&q=')).error, /Ürün ekleme \(beta\)/);
    await call('integrations/yemeksepeti', { method: 'PUT', body: JSON.stringify({ values: { ...ENV, YEMEKSEPETI_CATALOG: '1' } }) });
    await setSetting(db, 'verified:yemeksepeti', { at: Date.now() + 1000 }); resetChannels();
    st = await call('catalog/state');
    ys = st.channels.find((c) => c.id === 'yemeksepeti');
    assert.ok(ys.ready, JSON.stringify(ys));
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Süt', channel: 'yemeksepeti', remote_id: 'c-11', remote_name: 'Gübre', attrs: {} }) });
    const cand = await call('catalog/candidates?channel=yemeksepeti&local=S%C3%BCt');
    assert.deepEqual(cand.items[0].missing, []);
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'yemeksepeti', ids: [cand.items[0].id] }) });
    assert.equal(up.sent, 1, JSON.stringify(up)); assert.equal(up.ref, 'job-9:SUT-1');
    const body = m.calls.find((x) => x.method === 'POST' && x.path === '/v2/chains/CH1/catalog').body;
    assert.deepEqual(body.products[0], { sku: 'SUT-1', title: { tr_TR: 'Süt 1 L' }, barcodes: ['869001'], images: ['https://cdn.ornek.com/s.jpg'], categories: ['c-11'], price: 40 });
  } finally { m.restore(); resetChannels(); }
});
