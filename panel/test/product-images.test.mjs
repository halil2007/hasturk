// Ürün fotoğrafları: yükleme (oturum + Ürünler yazma yetkisi), herkese açık sunum (doğru başlıklar, ETag), dosya imzası,
// boyut / ürün / panel sınırları, üründen çıkarılan fotoğrafın silinmesi, günlük temizlik ve firmalar arası ayrım.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { doNamespace } from '../dev/do.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { first, run } from '../src/db.js';
import { maintain } from '../src/perf.js';
import { MAX_COUNT, sniff, hostedIds } from '../src/prodimg.js';

const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
const realFetch = globalThis.fetch;

function setup() {
  resetChannels();
  // Dış adreslere istek gitmesin (kanal yok; yine de güvence)
  globalThis.fetch = async (u) => new Response(JSON.stringify({ message: 'test: dış istek ' + u }), { status: 404 });
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jars = {}, pending = [];
  const as = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Fresh': '1', Cookie: jars[who] || '', ...(opts.headers || {}) } }), env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
    const sc = r.headers.get('set-cookie');
    if (sc) jars[who] = sc.split(';')[0];
    return r;
  };
  // Oturumsuz, çerezsiz istek (pazaryerinin görseli indirmesi gibi)
  const anon = (path, opts = {}) => worker.fetch(new Request(path.startsWith('http') ? path : 'https://panel.test' + path, opts), env, { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); } });
  return { env, as, anon, owner: as('owner'), done: () => { globalThis.fetch = realFetch; resetChannels(); } };
}
async function firm(ctx, slug) {
  const r = await ctx.owner('/api/tenants', J({ slug, name: slug.toUpperCase(), admin_username: 'yonetici', admin_password: 'gizli-sifre-1' }));
  assert.equal(r.status, 200, await r.clone().text());
  const a = ctx.as('admin:' + slug);
  assert.equal((await a('/api/login', J({ tenant: slug, username: 'yonetici', password: 'gizli-sifre-1' }))).status, 200);
  return { call: a, db: ctx.env.TENANT.get(ctx.env.TENANT.idFromName(slug)).db, slug };
}
const jpeg = (n = 2000, seed = 1) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 255; b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46], 0); return b; };
const png = (n = 500) => { const b = new Uint8Array(n).fill(7); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); return b; };
const dataUrl = (bytes, type = 'image/jpeg') => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const upload = (call, bytes, type) => call('/api/products/images', J({ data: dataUrl(bytes, type), w: 800, h: 600 }));
const err = async (r) => (await r.json()).error;
const pathOf = (u) => new URL(u).pathname;

test('dosya imzası ve adresteki kimlikler', () => {
  assert.equal(sniff(jpeg()), 'image/jpeg');
  assert.equal(sniff(png()), 'image/png');
  const webp = new Uint8Array(40); webp.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); webp.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
  assert.equal(sniff(webp), 'image/webp');
  assert.equal(sniff(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(sniff(new TextEncoder().encode('GIF89a......')), null);
  const id = 'a'.repeat(32);
  assert.deepEqual([...hostedIds(`["https://p.test/img/firma-a/${id}.jpg","https://x.test/a.jpg"]`, `https://p.test/img/_/${'b'.repeat(32)}.png`)], [id, 'b'.repeat(32)]);
  assert.equal(hostedIds(`https://p.test/img/firma-a/${id}.jpg.html`).size, 0);
});

test('yükleme → herkese açık adres, doğru başlıklar; firmalar arası ayrım; süresi dolan firma yine sunar, askıdaki sunmaz', async () => {
  const ctx = setup();
  try {
    assert.equal((await ctx.owner('/api/login', J({ password: 'x-123456' }))).status, 200);
    const A = await firm(ctx, 'firma-a'), B = await firm(ctx, 'firma-b');
    const bytes = jpeg(3000);
    const r = await upload(A.call, bytes);
    assert.equal(r.status, 200, await r.clone().text());
    const up = await r.json();
    assert.match(up.url, /^https:\/\/panel\.test\/img\/firma-a\/[a-f0-9]{32}\.jpg$/);
    assert.equal(up.size, 3000); assert.equal(up.type, 'image/jpeg');
    // Oturumsuz indirme (pazaryeri)
    const g = await ctx.anon(up.url);
    assert.equal(g.status, 200);
    assert.equal(g.headers.get('content-type'), 'image/jpeg');
    assert.match(g.headers.get('cache-control'), /max-age=31536000.*immutable/);
    assert.equal(g.headers.get('etag'), `"${up.id}"`);
    assert.equal(g.headers.get('x-content-type-options'), 'nosniff');
    assert.match(g.headers.get('content-security-policy'), /sandbox/);
    assert.deepEqual(new Uint8Array(await g.arrayBuffer()), bytes);
    // Koşullu istek ve HEAD
    const c = await ctx.anon(up.url, { headers: { 'If-None-Match': `"${up.id}"` } });
    assert.equal(c.status, 304);
    const h = await ctx.anon(up.url, { method: 'HEAD' });
    assert.equal(h.status, 200); assert.equal(h.headers.get('content-length'), '3000'); assert.equal((await h.arrayBuffer()).byteLength, 0);
    assert.equal((await ctx.anon(up.url, { method: 'POST', body: 'x' })).status, 405);
    // Firmalar arası ayrım: A'nın fotoğrafı B'nin ya da ana panelin adresinden açılmaz
    assert.equal((await ctx.anon(`/img/firma-b/${up.id}.jpg`)).status, 404);
    assert.equal((await ctx.anon(`/img/_/${up.id}.jpg`)).status, 404);
    assert.equal((await ctx.anon(`/img/yok-firma/${up.id}.jpg`)).status, 404);
    // Tahmin edilemeyen / bozuk adresler, dizin gezintisi
    for (const p of [`/img/firma-a/${up.id.slice(0, 31)}.jpg`, `/img/firma-a/${up.id}.svg`, `/img/firma-a/${up.id}.html`, `/img/firma-a/../_/${up.id}.jpg`, `/img/firma-a/%2e%2e/${up.id}.jpg`, `/img/FIRMA-A/${up.id}.jpg`, '/img/', `/img/firma-a/${up.id}`]) {
      const x = await ctx.anon(p);
      assert.equal(x.status, 404, p);
      assert.doesNotMatch(x.headers.get('content-type') || '', /html|svg/);
    }
    // B kendi fotoğrafını yükler; kendi adresinden açılır, A'nınkinden açılmaz
    const ub = await (await upload(B.call, png())).json();
    assert.match(ub.url, /\/img\/firma-b\/[a-f0-9]{32}\.png$/);
    assert.equal((await ctx.anon(ub.url)).headers.get('content-type'), 'image/png');
    assert.equal((await ctx.anon(`/img/firma-a/${ub.id}.png`)).status, 404);
    // Ana panel: /img/_/…
    const um = await (await upload(ctx.owner, jpeg(900, 3))).json();
    assert.match(um.url, /^https:\/\/panel\.test\/img\/_\/[a-f0-9]{32}\.jpg$/);
    assert.equal((await ctx.anon(um.url)).status, 200);
    assert.equal((await ctx.anon(`/img/firma-a/${um.id}.jpg`)).status, 404);
    // Süresi dolan firma: fotoğraflar sunulmaya devam eder (pazaryerinde yayında); askıya alınan firmanınki sunulmaz
    assert.equal((await ctx.owner('/api/tenants/firma-a', J({ expires_at: '2020-01-31' }, 'PUT'))).status, 200);
    assert.equal((await A.call('/api/me')).status, 401);
    assert.equal((await ctx.anon(up.url)).status, 200);
    assert.equal((await ctx.owner('/api/tenants/firma-a', J({ active: false }, 'PUT'))).status, 200);
    assert.equal((await ctx.anon(up.url)).status, 404);
  } finally { ctx.done(); }
});

test('yükleme için oturum ve Ürünler yazma yetkisi gerekir; dosya imzası, boyut ve sınırlar denetlenir', async () => {
  const ctx = setup();
  try {
    assert.equal((await ctx.owner('/api/login', J({ password: 'x-123456' }))).status, 200);
    const A = await firm(ctx, 'firma-a');
    // Oturumsuz
    assert.equal((await upload(ctx.as('kimse'), jpeg())).status, 401);
    // Personel: yalnız görüntüleme → 403; Ürünler yetkisi → 200; Ürünler yetkisi hiç yok → 403
    const staff = async (username, perms) => {
      assert.equal((await A.call('/api/users', J({ username, name: username, password: 'personel-sifre-1', role: 'staff', perms }))).status, 200);
      const s = ctx.as(username);
      assert.equal((await s('/api/login', J({ tenant: 'firma-a', username, password: 'personel-sifre-1' }))).status, 200);
      return s;
    };
    const viewer = await staff('bakan', ['products:view']), editor = await staff('duzenleyen', ['products']), depo = await staff('depo', ['orders']);
    assert.equal((await upload(viewer, jpeg())).status, 403);
    assert.equal((await upload(depo, jpeg())).status, 403);
    assert.equal((await upload(editor, jpeg())).status, 200);
    // Başka siteden gelen yükleme
    assert.equal((await A.call('/api/products/images', { ...J({ data: dataUrl(jpeg()) }), headers: { Origin: 'https://kotu.example' } })).status, 403);
    // Dosya imzası: uzantı / tür JPEG dese de içerik görsel değil
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' + ' '.repeat(200) + '</svg>');
    let r = await upload(A.call, svg, 'image/jpeg');
    assert.equal(r.status, 400); assert.match(await err(r), /fotoğraf değil/);
    r = await upload(A.call, new TextEncoder().encode('<html><script>alert(1)</script></html>'.repeat(5)), 'image/png');
    assert.equal(r.status, 400);
    r = await A.call('/api/products/images', J({ data: dataUrl(jpeg(), 'image/svg+xml') }));
    assert.equal(r.status, 400); assert.match(await err(r), /Yalnız fotoğraf/);
    r = await A.call('/api/products/images', J({ data: dataUrl(jpeg(), 'text/html') }));
    assert.equal(r.status, 400);
    r = await A.call('/api/products/images', J({ data: 'data:image/jpeg;base64,/9j/' }));
    assert.equal(r.status, 400);
    // Boyut: 1,2 MB üstü reddedilir
    r = await upload(A.call, jpeg(1300 * 1024));
    assert.equal(r.status, 413); assert.match(await err(r), /çok büyük/);
    assert.equal((await upload(A.call, jpeg(1100 * 1024))).status, 200);
    // Panel başına sayı sınırı
    await run(A.db, `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < ?) INSERT INTO product_images (id, type, size, w, h, data, created_at) SELECT printf('%032x', x), 'image/jpeg', 10, 0, 0, '/9j/', ? FROM c`, MAX_COUNT, Date.now());
    r = await upload(A.call, jpeg());
    assert.equal(r.status, 413); assert.match(await err(r), /Fotoğraf sınırına ulaşıldı/);
    await run(A.db, "DELETE FROM product_images WHERE data = '/9j/'");
    // Panel başına toplam boyut (500 MB)
    await run(A.db, "INSERT INTO product_images (id, type, size, data, created_at) VALUES (?, 'image/jpeg', ?, '/9j/', ?)", 'f'.repeat(32), 500 * 1024 * 1024, Date.now());
    r = await upload(A.call, jpeg());
    assert.equal(r.status, 413); assert.match(await err(r), /depolama alanı doldu/);
    await run(A.db, "DELETE FROM product_images WHERE data = '/9j/'");
    // Ürün başına en fazla 8 fotoğraf
    const urls = [];
    for (let i = 0; i < 9; i++) urls.push((await (await upload(A.call, jpeg(500, i))).json()).url);
    r = await A.call('/api/products', J({ name: 'Çok fotoğraflı', images: urls }));
    assert.equal(r.status, 400); assert.match(await err(r), /en fazla 8 fotoğraf/);
    r = await A.call('/api/products', J({ name: 'Sekiz fotoğraflı', images: urls.slice(0, 8), image: urls[0] }));
    assert.equal(r.status, 200, await r.clone().text());
  } finally { ctx.done(); }
});

test('üründen çıkarılan fotoğraf (başka ürün kullanmıyorsa) silinir; kaydedilmeyen fotoğraflar günlük bakımda temizlenir', async () => {
  const ctx = setup();
  try {
    assert.equal((await ctx.owner('/api/login', J({ password: 'x-123456' }))).status, 200);
    const A = await firm(ctx, 'firma-a');
    const [u1, u2, u3, u4] = await Promise.all([1, 2, 3, 4].map(async (i) => (await (await upload(A.call, jpeg(800, i))).json()).url));
    // Ürün 1: u1 (ana) + u2; ürün 2 (varyant): u2'yi paylaşır
    const p1 = (await (await A.call('/api/products', J({ name: 'Domates tohumu', images: [u1, u2], image: u1 }))).json()).id;
    const p2 = (await (await A.call('/api/products', J({ name: 'Domates tohumu 2', images: [u2] }))).json()).id;
    const d1_ = await (await A.call('/api/products/' + p1)).json();
    assert.equal(d1_.image, u1); assert.deepEqual(JSON.parse(d1_.images), [u1, u2]);
    assert.equal(JSON.parse((await (await A.call('/api/products/' + p2)).json()).images)[0], u2);
    // Sıra değişir (ana fotoğraf u2 olur), u1 çıkarılır → u1 silinir
    assert.equal((await A.call('/api/products/' + p1, J({ images: [u2], image: u2 }, 'PUT'))).status, 200);
    assert.equal((await ctx.anon(u1)).status, 404);
    assert.equal((await ctx.anon(u2)).status, 200);
    // u2 üründen 1'den de çıkarılır ama ürün 2 kullanıyor → kalır
    assert.equal((await A.call('/api/products/' + p1, J({ images: [], image: '' }, 'PUT'))).status, 200);
    assert.equal((await ctx.anon(u2)).status, 200);
    // Ürün 2 silinir: fotoğraf hemen silinmez (1 gün sonra bakımda); u3 hiç kaydedilmedi; u4 yeni yüklendi (1 günden yeni)
    assert.equal((await A.call('/api/products/' + p2, { method: 'DELETE' })).status, 200);
    const old = Date.now() - 2 * 864e5;
    for (const u of [u2, u3]) await run(A.db, 'UPDATE product_images SET created_at = ? WHERE id = ?', old, pathOf(u).split('/').pop().slice(0, 32));
    // Kullanılan eski fotoğraf korunur
    const keep = (await (await upload(A.call, jpeg(600, 9))).json()).url;
    await A.call('/api/products', J({ name: 'Biber', images: [keep] }));
    await run(A.db, 'UPDATE product_images SET created_at = ? WHERE id = ?', old, pathOf(keep).split('/').pop().slice(0, 32));
    const m = await maintain(A.db);
    assert.equal(m.product_images, 2);
    assert.equal((await ctx.anon(u2)).status, 404);
    assert.equal((await ctx.anon(u3)).status, 404);
    assert.equal((await ctx.anon(u4)).status, 200);
    assert.equal((await ctx.anon(keep)).status, 200);
    assert.equal((await first(A.db, 'SELECT COUNT(*) AS n FROM product_images')).n, 2);
  } finally { ctx.done(); }
});
