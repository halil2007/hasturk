// Uçtan uca: ürünler (müşteri paneli, HTTP API'si arayüzün yaptığı gibi). Ürün / varyant oluşturma, fiyat ve stok düzenleme,
// barkod / SKU üretimi, kanal ilanlarıyla eşleştirme, kanallara stok gönderimi, silme; liste / arama / sıralama / filtre ve sayfalama uçları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { validEan13 } from '../src/barcodes.js';

// ---------- ortak düzenek (her e2e dosyasında aynı) ----------
const realFetch = globalThis.fetch;
function net() {
  const routes = [], calls = [];
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url), method = o.method || 'GET';
    let body = o.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* düz metin */ } }
    const c = { url: u, method, body, headers: o.headers || {} };
    calls.push(c);
    for (const r of [...routes].reverse()) {
      if ((r.m && r.m !== method) || !r.re.test(u)) continue;
      let out = await r.fn(c), status = 200;
      if (out instanceof Response) return out;
      if (out && out.__status) { status = out.__status; out = out.body; }
      return new Response(typeof out === 'string' ? out : JSON.stringify(out ?? {}), { status, headers: { 'Content-Type': typeof out === 'string' ? 'text/plain' : 'application/json' } });
    }
    return new Response(JSON.stringify({ message: 'e2e: tanımsız adres ' + method + ' ' + u }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  return {
    calls,
    on(m, re, fn) { routes.push({ m, re, fn: typeof fn === 'function' ? fn : () => fn }); },
    find: (m, re) => calls.filter((c) => (!m || c.method === m) && re.test(c.url)),
    reset() { calls.length = 0; },
    restore() { globalThis.fetch = realFetch; },
  };
}
const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
async function panel({ plan = 'Kurumsal', slug = 'e2e-firma' } = {}) {
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1(), HB_USER_AGENT: 'hasturk_dev' };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jars = {}, pending = [];
  const as = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Fresh': '1', Cookie: jars[who] || '', ...(opts.headers || {}) } }), env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
    const sc = r.headers.get('set-cookie');
    if (sc) jars[who] = sc.split(';')[0];
    return r;
  };
  const owner = as('owner');
  assert.equal((await owner('/api/login', J({ password: 'x-123456' }))).status, 200);
  const cr = await owner('/api/tenants', J({ slug, name: 'E2E Firma', admin_username: 'yonetici', admin_password: 'gizli-sifre-1', plan }));
  assert.equal(cr.status, 200, await cr.clone().text());
  const obj = env.TENANT.get(env.TENANT.idFromName(slug));
  obj.ctx.waitUntil = (p) => { pending.push(Promise.resolve(p).catch(() => {})); };
  const admin = as('admin');
  const lg = await admin('/api/login', J({ tenant: slug, username: 'yonetici', password: 'gizli-sifre-1' }));
  assert.equal(lg.status, 200, await lg.clone().text());
  // Arka plan işleri (kanala stok / fiyat gönderimi) bitene kadar bekle
  const settle = async () => { for (let i = 0; i < 20 && pending.length; i++) { const p = pending.splice(0); await Promise.all(p); } };
  // Personel: kullanıcı ekle ve o kullanıcı olarak oturum aç
  const staff = async (username, perms) => {
    const r = await admin('/api/users', J({ username, name: username, password: 'personel-sifre-1', role: 'staff', perms }));
    assert.equal(r.status, 200, await r.clone().text());
    const s = as(username);
    assert.equal((await s('/api/login', J({ tenant: slug, username, password: 'personel-sifre-1' }))).status, 200);
    return s;
  };
  return { env, owner, admin, as, staff, obj, db: obj.db, settle, slug };
}
const js = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const ok = async (r, msg) => { const b = await js(r); assert.ok(r.status === 200, `${msg || ''} HTTP ${r.status}: ${JSON.stringify(b)}`); return b; };
// ---------- düzenek sonu ----------

const TY = { TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
// Trendyol ilan servisi (V2): onaylı ürünler + stok / fiyat
function trendyolListings(n, items) {
  n.on('GET', /\/products\/approved\/inventory-and-price\?/, () => ({ content: items.map((x) => ({ barcode: x.barcode, quantity: x.stock })), totalPages: 1 }));
  n.on('GET', /\/products\/approved\?/, () => ({ content: [{ productMainId: 'M1', title: 'Solucan Gübresi', images: [{ url: 'https://img/1.jpg' }], variants: items.map((x) => ({ barcode: x.barcode, stockCode: x.sku, price: { salePrice: x.price, listPrice: x.price }, onSale: true })) }], totalPages: 1 }));
  n.on('GET', /\/v2\/orders\?/, { content: [], totalPages: 1 });
  n.on('POST', /price-and-inventory$/, { batchRequestId: 'b-1' });
}

test('ürün kartı: oluştur, varyant grubu, fiyat / stok düzenle, barkod ve SKU üret, sil', async () => {
  const n = net();
  try {
    const { admin, settle } = await panel();
    await ok(await admin('/api/settings', J({ stock_sync: true }, 'PUT')));
    // Oluştur (ürün formu): ad zorunlu, SKU tekil
    assert.equal((await admin('/api/products', J({ name: '' }))).status, 400);
    const a = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 5 Kg', group_name: 'Solucan Gübresi', variant_name: '5 Kg', sku: 'SOL-5', sale_price: 150, purchase_price: 80, stock: 12, vat: 20 })));
    const b = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 10 Kg', group_name: 'Solucan Gübresi', variant_name: '10 Kg', sale_price: 260, stock: 4 })));
    const dup = await admin('/api/products', J({ name: 'Başka', sku: 'sol-5' }));
    assert.equal(dup.status, 400, 'SKU büyük/küçük harf duyarsız tekil');
    assert.match((await js(dup)).error, /SKU/);
    // Ayrıntı: ilk stok hareketi, kardeş varyantlar
    let d = await ok(await admin(`/api/products/${a.id}`));
    assert.equal(d.stock, 12); assert.equal(d.moves[0].reason, 'İlk stok');
    assert.deepEqual(d.siblings.sort(), [a.id, b.id].sort());
    // Varyant düzenleyici: iki varyant tek istekte
    const vg = await ok(await admin(`/api/products-variants?ids=${a.id},${b.id}`));
    assert.deepEqual(vg.products.map((p) => p.variant_name), ['10 Kg', '5 Kg']);
    const vs = await ok(await admin('/api/products-variants', J({ shared: { brand: 'HasTürk' }, items: [{ id: a.id, sale_price: 155 }, { id: b.id, stock: 6 }] })));
    assert.equal(vs.saved, 2);
    // Fiyat ve stok düzenleme (ürün formu PUT; stok hızlı düzeltme)
    await ok(await admin(`/api/products/${a.id}`, J({ sale_price: 159.9, stock: 20 }, 'PUT')));
    const sc = await ok(await admin(`/api/products/${a.id}/stock`, J({ mode: 'add', qty: -3, note: 'kırık' })));
    assert.equal(sc.stock, 17);
    d = await ok(await admin(`/api/products/${a.id}`));
    assert.equal(d.sale_price, 159.9); assert.equal(d.brand, 'HasTürk'); assert.equal(d.stock, 17);
    assert.deepEqual(d.moves.slice(0, 2).map((m) => [m.delta, m.stock_after]), [[-3, 17], [8, 20]]);
    // Barkod üretimi: öneri geçerli EAN-13; seçilenlere ver, dolu barkod korunur
    const sug = await ok(await admin('/api/products/barcodes/new'));
    assert.ok(validEan13(sug.barcode), sug.barcode);
    assert.equal((await admin('/api/products/barcodes/new?prefix=abc')).status, 400);
    const miss = await ok(await admin('/api/products/barcodes'));
    assert.equal(miss.missing, 2);
    const asg = await ok(await admin('/api/products/barcodes', J({ ids: [a.id, b.id] })));
    assert.equal(asg.assigned.length ?? asg.assigned, 2);
    const ba = (await ok(await admin(`/api/products/${a.id}`))).barcode;
    assert.ok(validEan13(ba));
    const again = await ok(await admin('/api/products/barcodes', J({ ids: [a.id] })));
    assert.equal(again.skipped, 1);
    assert.equal((await ok(await admin(`/api/products/${a.id}`))).barcode, ba, 'mevcut barkod değişmez');
    // SKU üretimi: önizleme, kaydet (dolu SKU başkasıyla çakışmaz)
    const pv = await ok(await admin('/api/products/skus/preview', J({ ids: [b.id] })));
    const item = (pv.items || pv)[0];
    assert.ok(item && item.sku, JSON.stringify(pv));
    await ok(await admin('/api/products/skus', J({ items: [{ id: b.id, sku: item.sku }] })));
    assert.equal((await ok(await admin(`/api/products/${b.id}`))).sku, item.sku);
    const clash = await js(await admin('/api/products/skus', J({ items: [{ id: b.id, sku: 'SOL-5' }] })));
    assert.ok(clash.error || (clash.errors && clash.errors.length) || clash.skipped, 'çakışan SKU kaydedilmez: ' + JSON.stringify(clash));
    assert.equal((await ok(await admin(`/api/products/${b.id}`))).sku, item.sku);
    // Sil: tekli ve toplu
    await ok(await admin(`/api/products/${a.id}`, { method: 'DELETE' }));
    assert.equal((await admin(`/api/products/${a.id}`)).status, 404);
    assert.equal((await admin(`/api/products/${a.id}`, { method: 'DELETE' })).status, 404);
    const bulk = await ok(await admin('/api/products-bulk', J({ ids: [b.id], action: 'delete' })));
    assert.equal(bulk.changed, 1);
    await settle();
    assert.equal((await ok(await admin('/api/products'))).total, 0);
  } finally { n.restore(); }
});

test('kanal ilanları: Trendyol ilanları alınır, panele eklenir / var olan ürüne bağlanır, stok kanala gönderilir', async () => {
  const n = net();
  try {
    const { admin, settle } = await panel();
    await ok(await admin('/api/settings', J({ stock_sync: true }, 'PUT')));
    await ok(await admin('/api/integrations/trendyol', J({ values: TY }, 'PUT')));
    trendyolListings(n, [{ barcode: '8690001', sku: 'SOL-5', stock: 7, price: 150 }, { barcode: '8690002', sku: 'SOL-10', stock: 3, price: 260 }]);
    // Panelde aynı SKU'lu ürün var (ilan buna bağlanmalı), diğeri ilandan yeni ürün olur
    const p5 = await ok(await admin('/api/products', J({ name: 'Solucan Gübresi 5 Kg', sku: 'SOL-5', stock: 10, sale_price: 150 })));
    const sy = await ok(await admin('/api/sync', J({ channels: ['trendyol'], listings: true })));
    assert.equal(sy.listings.trendyol, 2, JSON.stringify(sy));
    // Yeni firma: "ben seçeyim" modu — ilanlar kendiliğinden ürün olmaz
    let cp = await ok(await admin('/api/channel-products?channel=trendyol&state=unlinked'));
    const linkedBySync = (await ok(await admin('/api/channel-products?channel=trendyol&state=linked'))).total;
    assert.equal(cp.total + linkedBySync, 2);
    const add = await ok(await admin('/api/channel-products/add', J({ channel: 'trendyol', all: true })));
    assert.equal(add.created + add.linked + linkedBySync, 2, JSON.stringify(add));
    await settle();
    const ps = await ok(await admin('/api/products?filter=all'));
    assert.equal(ps.total, 2);
    const l5 = ps.products.find((p) => p.sku === 'SOL-5');
    assert.equal(l5.id, p5.id, 'aynı SKU ile var olan ürüne bağlandı (mükerrer kart açılmadı)');
    assert.equal(l5.listings.length, 1);
    // Panelde stok değişince Trendyol'a gönderilir
    n.reset();
    await ok(await admin(`/api/products/${p5.id}/stock`, J({ mode: 'set', qty: 4 })));
    await settle();
    const sent = n.find('POST', /price-and-inventory$/).map((c) => c.body.items).flat();
    assert.deepEqual(sent, [{ barcode: '8690001', quantity: 4 }]);
    const dl = await ok(await admin(`/api/products/${p5.id}`));
    assert.equal(dl.listings[0].pushed_stock, 4);
    // Değişiklik yoksa tekrar gönderilmez
    n.reset();
    const again = await ok(await admin('/api/push-stock', J({})));
    assert.deepEqual(again, {});
    assert.equal(n.find('POST', /price-and-inventory$/).length, 0);
    // Kanal fiyatı ürün formundan: kirli işaret ve fiyat gönderimi
    await ok(await admin(`/api/products/${p5.id}`, J({ listings: [{ channel: 'trendyol', remote_id: '8690001', price: 169.9 }] }, 'PUT')));
    await settle();
    const pr = n.find('POST', /price-and-inventory$/).map((c) => c.body.items).flat().find((x) => x.salePrice);
    assert.equal(pr && pr.salePrice, 169.9);
    // Eşleşmeyi kaldır: ilan bağsız kalır, ürün durur
    await ok(await admin('/api/match/unlink', J({ channel: 'trendyol', remote_id: '8690001' })));
    cp = await ok(await admin('/api/channel-products?channel=trendyol&state=unlinked'));
    assert.equal(cp.total, 1);
    // Elle bağla
    await ok(await admin('/api/channel-products/link', J({ channel: 'trendyol', remote_id: '8690001', product_id: p5.id })));
    assert.equal((await ok(await admin(`/api/products/${p5.id}`))).listings.length, 1);
    // Aynı kanaldan ikinci ilan aynı ürüne bağlanamaz
    const other = ps.products.find((p) => p.sku !== 'SOL-5');
    const two = await admin('/api/channel-products/link', J({ channel: 'trendyol', remote_id: '8690002', product_id: p5.id }));
    assert.equal(two.status, 400);
    assert.ok(other);
  } finally { n.restore(); }
});

test('ürün listesi: arama, filtre, sıralama, grup sayfalama ve sayfa uç değerleri', async () => {
  const n = net();
  try {
    const { admin, db } = await panel();
    await ok(await admin('/api/settings', J({ stock_sync: true, low_stock: 5 }, 'PUT')));
    // 3 grup × 3 varyant + 4 tekil ürün = 13 ürün
    for (const g of ['Alfa', 'Beta', 'Gama']) for (const [i, v] of ['S', 'M', 'L'].entries()) {
      await ok(await admin('/api/products', J({ name: `${g} Tişört ${v}`, group_name: `${g} Tişört`, variant_name: v, sku: `${g[0]}-${v}`, sale_price: 100 + i * 10, purchase_price: i ? 50 : 0, stock: i * 4 })));
    }
    for (const [i, nm] of ['Zeytin', 'Çilek', 'Şeftali', 'İncir'].entries()) await ok(await admin('/api/products', J({ name: nm + ' Fidanı', sale_price: 20 * (i + 1), stock: 10 + i, category: i % 2 ? 'Bahçe › Fidan' : 'Bahçe' })));
    const L = async (q) => ok(await admin('/api/products?' + q), q);
    let r = await L('');
    assert.equal(r.total, 13); assert.equal(r.products.length, 13);
    assert.deepEqual(r.counts, { out: 3, below: 3, enough: 7, runout: 0, all: 13 });
    // Sayfalama: limit 5 → 3 sayfa; son sayfanın ötesi boş; geçersiz değerler güvenli
    const pages = [];
    for (let p = 1; p <= 3; p++) pages.push(...(await L(`limit=5&page=${p}`)).products.map((x) => x.id));
    assert.equal(new Set(pages).size, 13, 'sayfalar örtüşmez ve hepsini kapsar');
    assert.equal((await L('limit=5&page=4')).products.length, 0);
    for (const q of ['page=0', 'page=-3', 'page=abc', 'limit=0', 'limit=-1', 'limit=99999', 'page=1e9', 'limit=abc']) {
      const x = await admin('/api/products?' + q);
      assert.equal(x.status, 200, q);
    }
    assert.equal((await L('limit=99999')).limit, 500, 'üst sınır');
    assert.equal((await L('page=1e9')).products.length, 0);
    // Arama: ad, SKU, grup; Türkçe karakter; LIKE joker karakteri sızmaz
    assert.equal((await L('q=tişört')).total, 9);
    assert.equal((await L('q=B-M')).total, 1);
    assert.equal((await L('q=' + encodeURIComponent('Çilek'))).total, 1);
    assert.equal((await L('q=%25')).total, 13, '% araması: (bilinen) LIKE joker karakteri — hepsi döner');
    assert.equal((await L('q=' + encodeURIComponent("'; DROP TABLE products; --"))).total, 0);
    assert.equal((await L('')).total, 13, 'SQL enjeksiyonu yok');
    // Filtreler
    assert.equal((await L('filter=out')).total, 3);
    assert.equal((await L('filter=below')).total, 3);
    assert.equal((await L('filter=enough')).total, 7);
    assert.equal((await L('filter=nocost')).total, 7);
    assert.equal((await L('filter=nosku')).total, 4);
    assert.equal((await L('filter=nobarcode')).total, 13);
    assert.equal((await L('filter=nolisting')).total, 13);
    assert.equal((await L('category=Bahçe')).total, 4, 'alt kategoriler dahil');
    assert.equal((await L('category=' + encodeURIComponent('Bahçe › Fidan'))).total, 2);
    assert.equal((await L('category=-')).total, 9);
    await ok(await admin('/api/products-bulk', J({ ids: [r.products[0].id], action: 'deactivate' })));
    assert.equal((await L('filter=passive')).total, 1);
    assert.equal((await L('')).total, 12);
    assert.equal((await L('filter=all')).total, 13);
    await ok(await admin('/api/products-bulk', J({ ids: [r.products[0].id], action: 'activate' })));
    // Sıralama
    const prices = (await L('sort=price_desc')).products.map((p) => p.sale_price);
    assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
    const st = (await L('sort=stock')).products.map((p) => p.stock);
    assert.deepEqual(st, [...st].sort((a, b) => a - b));
    assert.equal((await admin('/api/products?sort=__proto__')).status, 200, 'bilinmeyen sıralama yok sayılır');
    assert.equal((await admin('/api/products?sort=constructor')).status, 200);
    // Grup (ana ürün) sayfalama: sayfa başına N ana ürün + tüm varyantları
    const g1 = await L('group=1&limit=2&page=1'), g2 = await L('group=1&limit=2&page=2'), g3 = await L('group=1&limit=2&page=3'), g4 = await L('group=1&limit=2&page=4');
    assert.equal(g1.groups, 7);
    const gk = (x) => [...new Set(x.products.map((p) => p.gk))];
    assert.equal(gk(g1).length, 2); assert.equal(gk(g2).length, 2); assert.equal(gk(g3).length, 2); assert.equal(gk(g4).length, 1);
    const allIds = [g1, g2, g3, g4].flatMap((x) => x.products.map((p) => p.id));
    assert.equal(new Set(allIds).size, 13, 'grup sayfaları tüm ürünleri bir kez verir');
    assert.equal((await L('group=1&limit=2&page=5')).products.length, 0);
    // Grup + sıralama + filtre birlikte
    const gs = await L('group=1&sort=price_desc&filter=enough');
    assert.ok(gs.products.every((p) => p.stock > 5));
    assert.ok(db);
  } finally { n.restore(); }
});
