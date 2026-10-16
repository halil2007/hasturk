// Çiçeksepeti'ne ürün yükleme: kategori ağacı (yaprak), kategori özellikleri (listeden değer; Marka özelliği ürünün markasından),
// POST Products (1000'lik parça, batchId), Products/batch-status (Success / Warning / Failed + failureReasons; anahtar data.stockCode).
// Sahte cevaplar açık kaynak istemcilerdeki biçimde (ciceksepeti-api 1.1.1 index.d.ts, turkish-marketplaces 2.6.7 ciceksepeti.d.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { ciceksepeti } from '../src/channels/ciceksepeti.js';
import worker from '../src/index.js';

const TREE = { categories: [
  { id: 10, name: 'Çiçek', parentCategoryId: null, subCategories: [
    { id: 11, name: 'Saksı Çiçekleri', parentCategoryId: 10, subCategories: [
      { id: 12, name: 'Orkide', parentCategoryId: 11, subCategories: [] }] }] },
  { id: 20, name: 'Hediye', parentCategoryId: null, subCategories: [] }] };
const ATTRS = { categoryId: 12, categoryName: 'Orkide', categoryAttributes: [
  { attributeId: 147, attributeName: 'Renk', required: true, varianter: true, type: 'Variant Özelliği', attributeValues: [{ id: 2010420, name: 'Beyaz' }, { id: 2010421, name: 'Pembe' }] },
  { attributeId: 2000353, attributeName: 'Saksı Tipi', required: true, varianter: false, type: 'Ürün Özelliği', attributeValues: [{ id: 2010800, name: 'Seramik' }, { id: 2010801, name: 'Plastik' }] },
  { attributeId: 2000001, attributeName: 'Marka', required: true, varianter: false, type: 'Ürün Özelliği', attributeValues: [{ id: 3000001, name: 'HasTürk' }, { id: 3000002, name: 'Diğer Marka' }] },
  { attributeId: 2001498, attributeName: 'Kart Notu', required: false, varianter: false, type: 'Kişiselleştirilebilir Özellik', attributeValues: [] }] };
const LONG = '<p>Beyaz phalaenopsis orkide, seramik saksıda, bakım kartıyla gönderilir.</p>';
const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

async function setup() {
  const db = d1();
  await init(db);
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: db };
  let cookie = '';
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  const t = Date.now();
  const ins = (sku, bc, name, variant, img, desc, brand = 'HasTürk') => run(db, `INSERT INTO products (sku, barcode, name, brand, category, image, description, sale_price, list_price, vat, desi, stock, group_name, variant_name, parent_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Orkide', ?, ?, 450, 500, 20, 2, 4, 'Orkide', ?, 'ikas1:ORK-GRP', ?, ?)`, sku, bc, name, brand, img, desc, variant, t, t);
  return { db, env, call, ins };
}
async function login(call, db) {
  await call('login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) });
  await call('integrations/ciceksepeti', { method: 'PUT', body: JSON.stringify({ values: { CICEKSEPETI_API_KEY: 'KEY' } }) });
  await setSetting(db, 'verified:ciceksepeti', { at: Date.now() + 1000 }); resetChannels();
}

test('Çiçeksepeti ürün yükleme: eşleştirme, eksikler, seçenekler, gönderim ve sonuç (işleniyor → kabul / ret)', async () => {
  const { db, call, ins } = await setup();
  await ins('ORK-B', '869100', 'Orkide Beyaz', 'Beyaz', 'https://cdn.ornek.com/b.jpg', LONG);
  await ins('ORK-P', '869101', 'Orkide Pembe', 'Pembe', 'https://cdn.ornek.com/p.jpg', LONG);
  await ins('ORK-X', '', 'Orkide Kısa', 'Beyaz', '', '<p>Kısa açıklama</p>');
  await ins('ORK-M', '869103', 'Orkide Mor', 'Beyaz', 'https://cdn.ornek.com/m.jpg', LONG, 'Bilinmeyen Marka');
  const calls = [], realFetch = globalThis.fetch;
  let polls = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} });
    if (/\/Categories$/.test(u)) return J(TREE);
    if (/\/Categories\/12\/attributes$/.test(u)) return J(ATTRS);
    if (/\/Products$/.test(u) && opts.method === 'POST') return J({ batchId: 'aaaa-1111' });
    if (/\/Products\/batch-status\/aaaa-1111$/.test(u)) {
      polls++;
      if (polls === 1) return J({ batchId: 'aaaa-1111', itemCount: 2, items: [{ itemId: 'i1', data: { stockCode: 'ORK-B' }, status: 'Processing', failureReasons: [] }] });
      return J({ batchId: 'aaaa-1111', itemCount: 2, items: [
        { itemId: 'i1', data: { stockCode: 'ORK-B', salesPrice: 450, listPrice: 500 }, status: 'Success', failureReasons: [], lastModificationDate: '2026-10-16T10:00:00' },
        { itemId: 'i2', data: { stockCode: 'ORK-P' }, status: 'Failed', failureReasons: [{ message: 'Görsel boyutu 500x500 pikselden küçük', code: 4012 }], lastModificationDate: '2026-10-16T10:00:00' }] });
    }
    if (/\/Products\?PageSize=60&Page=1$/.test(u)) return J({ totalCount: 1, products: [{ productName: 'Orkide Beyaz', productCode: 'CS1', stockCode: 'ORK-B', mainProductCode: 'ORK-GRP', barcode: '869100', isActive: true, productStatusType: 'ONAY BEKLEYEN', salesPrice: 450, listPrice: 500, stockQuantity: 4, images: ['https://cdn.ornek.com/b.jpg'] }] });
    if (/GetOrders/.test(u)) return J({ orderListCount: 0, supplierOrderListWithBranch: [] });
    return J({});
  };
  try {
    await login(call, db);
    const st = await call('catalog/state');
    const cs = st.channels.find((c) => c.id === 'ciceksepeti');
    assert.ok(cs && cs.ready, JSON.stringify(cs));
    assert.deepEqual(cs.options.map((o) => o.k), ['deliveryType', 'deliveryMessageType']);
    // Yalnız yaprak kategoriler; yol üst kategorilerden
    const cats = await call('catalog/remote-categories?channel=ciceksepeti&q=orkide');
    assert.deepEqual(cats.items, [{ id: '12', name: 'Orkide', path: 'Çiçek › Saksı Çiçekleri' }]);
    assert.equal(cats.total, 2);
    // Marka ve kişiselleştirilebilir (alıcının yazdığı) özellik eşleştirmede sorulmaz
    const at = await call('catalog/attributes?channel=ciceksepeti&category=12');
    assert.deepEqual(at.attributes.map((a) => [a.id, a.mandatory, a.kind]), [['147', true, 'variant'], ['2000353', true, 'category']]);
    const vals = await call('catalog/values?channel=ciceksepeti&category=12&attribute=2000353');
    assert.deepEqual(vals.values, [{ id: '2010800', value: 'Seramik' }, { id: '2010801', value: 'Plastik' }]);
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Orkide', channel: 'ciceksepeti', remote_id: '12', remote_name: 'Orkide', attrs: { 147: { value: '@variant' }, 2000353: { id: '2010800', value: 'Seramik' } } }) });
    // Teslimat seçenekleri girilmeden: eksik (varsayılan değer uydurulmaz)
    let cand = await call('catalog/candidates?channel=ciceksepeti&local=Orkide');
    const by = (c) => Object.fromEntries(c.items.map((x) => [x.sku, x]));
    assert.ok(by(cand)['ORK-B'].missing.some((m) => /^teslimat tipi/.test(m)), JSON.stringify(by(cand)['ORK-B'].missing));
    assert.ok(by(cand)['ORK-B'].missing.some((m) => /^teslimat mesaj tipi/.test(m)));
    // Geçersiz teslimat tipi de eksik sayılır
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ciceksepeti', opts: { deliveryType: '7', deliveryMessageType: '5' } }) });
    cand = await call('catalog/candidates?channel=ciceksepeti&local=Orkide');
    assert.ok(by(cand)['ORK-B'].missing.some((m) => /^teslimat tipi/.test(m)));
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ciceksepeti', opts: { deliveryType: '2', deliveryMessageType: '5' } }) });
    cand = await call('catalog/candidates?channel=ciceksepeti&local=Orkide');
    const c = by(cand);
    assert.deepEqual(c['ORK-B'].missing, []); assert.deepEqual(c['ORK-P'].missing, []);
    assert.ok(c['ORK-X'].missing.includes('görsel') && c['ORK-X'].missing.includes('açıklama (en az 30 karakter)'), JSON.stringify(c['ORK-X'].missing));
    assert.deepEqual(c['ORK-M'].missing, ["marka “Bilinmeyen Marka” Çiçeksepeti'de bulunamadı"]);
    // Marka araması kategorinin Marka değerlerinde
    const br = await call('catalog/brands?channel=ciceksepeti&q=hastürk&category=12');
    assert.equal(br.items[0].id, '3000001');

    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'ciceksepeti', ids: [c['ORK-B'].id, c['ORK-P'].id, c['ORK-X'].id, c['ORK-M'].id] }) });
    assert.equal(up.sent, 2, JSON.stringify(up)); assert.equal(up.skipped.length, 2);
    const posts = calls.filter((x) => x.method === 'POST' && /\/Products$/.test(x.url));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, 'https://apis.ciceksepeti.com/api/v1/Products');
    assert.equal(posts[0].headers['x-api-key'], 'KEY');
    const sent = JSON.parse(posts[0].body).products;
    const b = sent.find((x) => x.stockCode === 'ORK-B'), p = sent.find((x) => x.stockCode === 'ORK-P');
    assert.deepEqual(b, {
      productName: 'Orkide Beyaz', mainProductCode: 'ORK-GRP', stockCode: 'ORK-B', categoryId: 12, description: LONG, deliveryMessageType: 5, deliveryType: 2,
      stockQuantity: 4, salesPrice: 450, listPrice: 500, barcode: '869100', images: ['https://cdn.ornek.com/b.jpg'],
      attributes: [{ id: 147, valueId: 2010420, textLength: 0 }, { id: 2000353, valueId: 2010800, textLength: 0 }, { id: 2000001, valueId: 3000001, textLength: 0 }],
    });
    assert.equal(p.mainProductCode, b.mainProductCode, 'varyantlar aynı ana ürün kodunda');
    assert.deepEqual(p.attributes[0], { id: 147, valueId: 2010421, textLength: 0 });
    assert.ok(!sent.some((x) => x.attributes.some((a) => a.id === 2001498)), 'kişiselleştirilebilir özellik gönderilmez');

    // İlk sorgu: işleniyor
    let ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, false);
    // İkinci sorgu: biri kabul, biri ret (nedeniyle)
    ck = await call(`catalog/uploads/${up.id}/check`, { method: 'POST' });
    assert.equal(ck.done, true);
    const rb = ck.items.find((x) => x.key === 'ORK-B'), rp = ck.items.find((x) => x.key === 'ORK-P');
    assert.equal(rb.ok, true); assert.match(rb.status, /kabul etti/);
    assert.equal(rp.ok, false); assert.match(rp.error, /500x500/);
    // Ham sonuç (teşhis)
    const raw = await call(`catalog/uploads/${up.id}/raw`);
    assert.equal(raw.raw.batchId, 'aaaa-1111');
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});

test('Çiçeksepeti: istek reddedilirse gönderim hata verir, ürün oluşturma tekrar denenmez', async () => {
  const { db, call, ins } = await setup();
  await ins('ORK-B', '869100', 'Orkide Beyaz', 'Beyaz', 'https://cdn.ornek.com/b.jpg', LONG);
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method || 'GET' });
    if (/\/Categories$/.test(u)) return J(TREE);
    if (/\/Categories\/12\/attributes$/.test(u)) return J(ATTRS);
    if (/\/Products$/.test(u) && opts.method === 'POST') return J({ Message: 'Kategori bulunamadı' }, 500);
    return J({});
  };
  try {
    await login(call, db);
    await call('catalog/options', { method: 'POST', body: JSON.stringify({ channel: 'ciceksepeti', opts: { deliveryType: '2', deliveryMessageType: '5' } }) });
    await call('catalog/map', { method: 'POST', body: JSON.stringify({ local: 'Orkide', channel: 'ciceksepeti', remote_id: '12', remote_name: 'Orkide', attrs: { 147: { value: '@variant' }, 2000353: { id: '2010800', value: 'Seramik' } } }) });
    const cand = await call('catalog/candidates?channel=ciceksepeti&local=Orkide');
    const up = await call('catalog/upload', { method: 'POST', body: JSON.stringify({ channel: 'ciceksepeti', ids: cand.items.map((x) => x.id) }) });
    assert.match(up.error || '', /Çiçeksepeti ürünleri kabul etmedi: .*Kategori bulunamadı/, JSON.stringify(up));
    assert.equal(calls.filter((x) => x.method === 'POST').length, 1, '5xx sonrası POST tekrarlanmaz');
  } finally { globalThis.fetch = realFetch; resetChannels(); }
});

test('Çiçeksepeti: 1000\'lik parça, 5 sn aralık, batchId yoksa hata; sonuç: Warning kabul, düz metin neden, eksik ürün işleniyor', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || 'GET', body: opts.body, at: Date.now() });
    if (/\/Products$/.test(u)) return J({ batchId: 'b' + (++n) });
    if (/batch-status\/b1$/.test(u)) return J({ batchId: 'b1', itemCount: 1000, items: [
      { data: { stockCode: 'S0' }, status: 'Warning', failureReasons: [{ message: 'Fiyat son 30 günün en düşüğünden yüksek', code: 1 }] },
      { data: { stockCode: 'S1' }, status: 'Failed', failureReasons: ['Barkod başka üründe kullanılıyor'] },
      { data: { stockCode: 'S2' }, status: 'Pending', failureReasons: [] }] });
    if (/batch-status\/b2$/.test(u)) return J({ batchId: 'b2', itemCount: 1, items: [{ data: { stockCode: 'S1000' }, status: 'Success', failureReasons: [] }] });
    if (/batch-status\/b9$/.test(u)) return J({ batchId: 'b9', itemCount: 0, items: [] });
    return J({});
  };
  try {
    const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' });
    assert.equal(ch.catalog.chunk, 1000);
    const items = Array.from({ length: 1001 }, (_, i) => ({ stockCode: 'S' + i }));
    const r = await ch.catalog.send(items);
    const posts = calls.filter((x) => x.method === 'POST');
    assert.equal(posts.length, 2);
    assert.equal(JSON.parse(posts[0].body).products.length, 1000);
    assert.equal(JSON.parse(posts[1].body).products.length, 1);
    assert.ok(posts[1].at - posts[0].at >= 5000, 'iki istek arası en az 5 sn');
    assert.match(r.ref, /^b1:S0,S1,.*;b2:S1000$/);
    const s = await ch.catalog.status(r.ref);
    assert.equal(s.done, false, 'Pending ürün var');
    const k = Object.fromEntries(s.items.map((x) => [x.key, x]));
    assert.equal(k.S0.ok, true); assert.match(k.S0.status, /uyarı: Fiyat son 30/);
    assert.equal(k.S1.ok, false); assert.equal(k.S1.error, 'Barkod başka üründe kullanılıyor');
    assert.equal(k.S2, undefined);
    assert.equal(k.S1000.ok, true);
    // Sonuç listesi henüz boş: işleniyor
    assert.equal((await ch.catalog.status('b9:S5')).done, false);
    // batchId dönmeyen cevap hata
    globalThis.fetch = async () => J({ message: 'Limit aşımı' });
    await assert.rejects(ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' }).catalog.send([{ stockCode: 'A' }]), /batchId.*Limit aşımı/);
  } finally { globalThis.fetch = realFetch; }
});

test('Çiçeksepeti build: varyant listede yoksa / zorunlu özellik seçilmemişse eksik; en fazla 5 görsel; barkod yoksa gönderilmez', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (/attributes$/.test(String(url)) ? J(ATTRS) : J({}));
  try {
    const ch = ciceksepeti({ CICEKSEPETI_API_KEY: 'K' }, { id: 'cs' });
    const pick = async (a, v) => (await ch.catalog.values('12', a.id)).find((x) => x.value === v) || null;
    const pr = { sku: 'S1', barcode: '', name: 'Orkide', brand: 'HasTürk', description: LONG, image: 'https://c/1.jpg', images: ['https://c/1.jpg', 'https://c/2.jpg', 'https://c/3.jpg', 'https://c/4.jpg', 'https://c/5.jpg', 'https://c/6.jpg'],
      stock: 3.4, price: 99.999, listPrice: 50, group: 'G1', variant: 'Mor' };
    const opts = { deliveryType: '1', deliveryMessageType: '18' };
    let b = await ch.catalog.build(pr, { remote_id: '12', attrs: { 147: { value: '@variant' } } }, { opts, pick });
    assert.deepEqual(b.missing, ['Renk (varyant “Mor” Çiçeksepeti listesinde yok)', 'Saksı Tipi']);
    b = await ch.catalog.build({ ...pr, variant: 'Beyaz' }, { remote_id: '12', attrs: { 147: { value: '@variant' }, 2000353: { value: 'plastik' } } }, { opts, pick });
    assert.deepEqual(b.missing, []);
    assert.equal(b.key, 'S1');
    assert.equal(b.payload.images.length, 5);
    assert.equal('barcode' in b.payload, false);
    assert.equal(b.payload.stockQuantity, 3); assert.equal(b.payload.salesPrice, 100); assert.equal(b.payload.listPrice, 100, 'liste fiyatı satış fiyatından düşük olamaz');
    assert.equal(b.payload.deliveryType, 1); assert.equal(b.payload.deliveryMessageType, 18);
    // Marka: büyük / küçük harf farkı gözetilmez ama harf birebir aynı olmalı ("hasturk" ≠ "HasTürk")
    const nb = await ch.catalog.build({ ...pr, variant: 'Beyaz', brand: 'hasturk' }, { remote_id: '12', attrs: { 147: { value: '@variant' }, 2000353: { value: 'plastik' } } }, { opts, pick });
    assert.deepEqual(nb.missing, ["marka “hasturk” Çiçeksepeti'de bulunamadı"]);
    b = await ch.catalog.build({ ...pr, variant: 'Beyaz', brand: 'HASTÜRK' }, { remote_id: '12', attrs: { 147: { value: '@variant' }, 2000353: { value: 'plastik' } } }, { opts, pick });
    assert.deepEqual(b.payload.attributes.find((a) => a.id === 2000001), { id: 2000001, valueId: 3000001, textLength: 0 });
    // Marka kimliği kategorinin Marka listesinde yoksa kullanılmaz (marka adıyla aranır; o da yoksa eksik)
    b = await ch.catalog.build({ ...pr, variant: 'Beyaz', brandId: '999' }, { remote_id: '12', attrs: { 147: { value: '@variant' }, 2000353: { id: '2010801' } } }, { opts, pick });
    assert.deepEqual(b.payload.attributes.find((a) => a.id === 2000001), { id: 2000001, valueId: 3000001, textLength: 0 });
    b = await ch.catalog.build({ ...pr, variant: 'Beyaz', brandId: '999', brand: 'Yok' }, { remote_id: '12', attrs: { 147: { value: '@variant' }, 2000353: { id: '2010801' } } }, { opts, pick });
    assert.deepEqual(b.missing, ["marka “Yok” Çiçeksepeti'de bulunamadı"]);
    assert.ok(!b.payload.attributes.some((a) => a.id === 2000001));
  } finally { globalThis.fetch = realFetch; }
});
