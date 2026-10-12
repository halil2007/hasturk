// Hazır blog yazıları: ana panelde bir kez yayımlanır, kapak siteden alınır; kapak alınamazsa sonra tekrar denenir; müşteri panelinde çalışmaz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, first, all, run } from '../src/db.js';
import { blogSeed, REV } from '../src/blogseed.js';

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const posts = [
  { slug: 'a-yazi', title: 'A yazısı', summary: 'özet', seo_title: 'A SEO', seo_desc: 'A açıklama', tags: ['Trendyol'], cover: 'a.jpg', body: '## Giriş\n\nMetin' },
  { slug: 'b-yazi', title: 'B yazısı', summary: 'özet', tags: [], cover: 'b.jpg', body: 'Metin' },
];
test('hazır yazılar bir kez yayımlanır; kapak alınamazsa o yazı sonra yeniden denenir; müşteri panelinde çalışmaz', async () => {
  const db = d1(); await init(db);
  const env = { SITE_URL: 'https://site.test' };
  assert.equal(await blogSeed({ ...env, TENANT_SLUG: 'x' }, db, { posts }), null);
  let fail = true;
  const fetcher = async (u) => (u.endsWith('b.jpg') && fail ? new Response('', { status: 404 }) : new Response(JPG, { status: 200 }));
  const r = await blogSeed(env, db, { posts, fetcher });
  assert.deepEqual(r.added, ['a-yazi']); assert.equal(r.errors.length, 1);
  const a = await first(db, 'SELECT * FROM blog_posts WHERE slug = ?', 'a-yazi');
  assert.equal(a.status, 'published'); assert.equal(a.seo_title, 'A SEO');
  assert.equal((await first(db, 'SELECT post_id, type FROM blog_images WHERE id = ?', a.cover_id)).post_id, a.id);
  fail = false;
  assert.deepEqual((await blogSeed(env, db, { posts, fetcher })).added, ['b-yazi']);
  assert.equal(await blogSeed(env, db, { posts, fetcher }), null, 'hepsi yüklendi');
  // Silinen yazı geri gelmez
  await run(db, "DELETE FROM blog_posts WHERE slug = 'a-yazi'");
  assert.equal(await blogSeed(env, db, { posts, fetcher }), null);
  assert.equal((await all(db, 'SELECT id FROM blog_posts')).length, 1);
});

test('day verilen yazı ileri tarihli yayımlanır (sitede o gün görünür)', async () => {
  const db = d1(); await init(db);
  const now = Date.UTC(2026, 9, 11);
  const fetcher = async () => new Response(JPG, { status: 200 });
  await blogSeed({ SITE_URL: 'https://site.test' }, db, { posts: [{ slug: 'ileri', title: 'İleri yazı', body: 'x', cover: 'a.jpg', day: 4 }], fetcher, now });
  assert.equal((await first(db, 'SELECT published_at FROM blog_posts WHERE slug = ?', 'ileri')).published_at, now + 4 * 864e5);
});

// Gerçek kaynak (public/_seed): manifest + yazı dosyaları
import { readFileSync } from 'node:fs';
const SEED = new URL('../public/_seed/', import.meta.url).pathname;
const source = async (path) => JSON.parse(readFileSync(SEED + path, 'utf8'));
const MAN = JSON.parse(readFileSync(SEED + 'manifest.json', 'utf8'));
const trDay = (t) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);

test('kaynak: her yazının dosyası var, adresler tekil, saatler TR 08–20 arası, yayın sırası tarihe göre', async () => {
  assert.ok(MAN.length >= 37);
  assert.equal(new Set(MAN.map((p) => p.slug)).size, MAN.length);
  for (const [i, m] of MAN.entries()) {
    const p = await source(`posts/${m.slug}.json`);
    assert.equal(p.slug, m.slug); assert.ok(p.title && p.body && p.cover, m.slug);
    const h = new Date(m.at + 3 * 3600e3).getUTCHours(); assert.ok(h >= 8 && h <= 20, `${m.slug} saat ${h}`);
    if (i) assert.ok(m.at >= MAN[i - 1].at, 'sıralı');
  }
  // İkinci parti 1–10 Ekim, üçüncü parti 11–31 Ekim: her gün bir yazı
  const b2 = MAN.filter((p) => p.batch === 2).map((p) => trDay(p.at)), b3 = MAN.filter((p) => p.batch === 3).map((p) => trDay(p.at));
  assert.equal(b2.length, 10); assert.equal(b2[0], '2026-10-01'); assert.equal(new Set(b2).size, 10);
  assert.equal(b3[0], '2026-10-11'); assert.equal(new Set(b3).size, b3.length); assert.ok(b3.at(-1) <= '2026-10-31');
});

test('kademeli ekleme: yayın saatine 3 gün kalan yazılar panele girer (ileri tarihli), en fazla 15 yazı; ikinci parti tarihleri bir kez geri çekilir', async () => {
  const db = d1(); await init(db);
  const fetcher = async () => new Response(JPG, { status: 200 });
  const now = Date.UTC(2026, 9, 11, 12), env = { SITE_URL: 'https://site.test' };
  const b2 = MAN.filter((p) => p.batch === 2);
  // Eski sürüm: ilk yazı ileri tarihli yüklenmiş, ikincisinin tarihi elle geçmişe alınmış
  await run(db, "INSERT INTO blog_posts (slug, title, body, status, published_at, created_at, updated_at) VALUES (?, 'a', 'x', 'published', ?, 0, 0), (?, 'b', 'x', 'published', 5, 0, 0)", b2[0].slug, now + 864e5, b2[1].slug);
  const due = MAN.filter((p) => p.at <= now + 3 * 864e5);
  let added = [], r;
  for (let k = 0; k < 10 && (r = await blogSeed(env, db, { source, fetcher, now, revisions: {} })); k++) { assert.ok(r.added.length + r.skipped.length <= 15); added.push(...r.added, ...r.skipped); }
  assert.deepEqual(added.sort(), due.map((p) => p.slug).sort(), 'yalnız 3 gün içindekiler');
  const at = async (s) => (await first(db, 'SELECT published_at FROM blog_posts WHERE slug = ?', s)).published_at;
  assert.equal(await at(b2[0].slug), b2[0].at);
  assert.equal(await at(b2[1].slug), 5, 'elle değiştirilen tarih korunur');
  const last = due.at(-1);
  assert.equal(await at(last.slug), last.at, 'ileri tarihli yazı kendi saatinde');
  // Ertesi gün: bir günlük yeni yazılar eklenir
  const later = now + 864e5, next = MAN.filter((p) => p.at > now + 3 * 864e5 && p.at <= later + 3 * 864e5);
  r = await blogSeed(env, db, { source, fetcher, now: later, revisions: {} });
  assert.deepEqual(next.length ? r.added : r, next.length ? next.map((p) => p.slug) : null);
});

// Yayımlanmış hazır yazı düzeltmesi: gövde hâlâ ilk yüklenen gövdeyse bir kez güncellenir; elle düzenlenmiş yazıya dokunulmaz
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');
const PNG2 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);
test('düzeltme: değişmemiş gövde bir kez güncellenir, elle düzenlenen atlanır, yeni yüklenen etkilenmez; kapak yenilenir', async () => {
  const db = d1(); await init(db);
  const env = { SITE_URL: 'https://site.test' };
  let img = JPG;
  const fetcher = async () => new Response(img, { status: 200 });
  const v1 = [
    { slug: 'r-a', title: 'A yazısı', body: 'eski A', cover: 'a.jpg' },
    { slug: 'r-b', title: 'B yazısı', body: 'eski B', cover: 'b.jpg' },
  ];
  await blogSeed(env, db, { posts: v1, fetcher });
  await run(db, "UPDATE blog_posts SET body = 'sahibin metni' WHERE slug = 'r-b'");
  const oldCover = (await first(db, "SELECT cover_id FROM blog_posts WHERE slug = 'r-a'")).cover_id;
  const v2 = [
    { slug: 'r-a', title: 'A yazısı', body: 'yeni A', cover: 'a.jpg', seo_desc: 'yeni açıklama' },
    { slug: 'r-b', title: 'B yazısı', body: 'yeni B', cover: 'b.jpg' },
    { slug: 'r-c', title: 'C yazısı', body: 'yeni C', cover: 'c.jpg' },
  ];
  const revisions = {
    'r-a': { from: ['0'.repeat(64), await sha('eski A')], cover: true, fields: ['seo_desc'] },
    'r-b': { from: [await sha('eski B')], cover: true },
    'r-c': { from: [await sha('eski C')] },
  };
  // Site henüz eski kapağı veriyor: gövde düzelir, kapak bekler
  const r = await blogSeed(env, db, { posts: v2, fetcher, revisions, now: 1000 });
  assert.deepEqual(r.revised, ['r-a']); assert.deepEqual(r.covers, []); assert.deepEqual(r.added, ['r-c']);
  const a = await first(db, "SELECT body, seo_desc, updated_at, cover_id FROM blog_posts WHERE slug = 'r-a'");
  assert.equal(a.body, 'yeni A'); assert.equal(a.seo_desc, 'yeni açıklama'); assert.equal(a.updated_at, 1000); assert.equal(a.cover_id, oldCover);
  assert.equal((await first(db, "SELECT body FROM blog_posts WHERE slug = 'r-b'")).body, 'sahibin metni', 'elle düzenlenen korunur');
  assert.equal((await first(db, "SELECT body FROM blog_posts WHERE slug = 'r-c'")).body, 'yeni C', 'yeni yazı güncel gövdeyle yüklenir');
  assert.equal((await first(db, 'SELECT COUNT(*) AS n FROM blog_images')).n, 3, 'aynı kapak tekrar kaydedilmez');
  // Bir kez çalışır: gövde eskiye dönse bile yeniden uygulanmaz; site yeni kapağı verince kapak yeni kimlikle değişir
  await run(db, "UPDATE blog_posts SET body = 'eski A' WHERE slug = 'r-a'");
  img = PNG2;
  const r2 = await blogSeed(env, db, { posts: v2, fetcher, revisions, now: 2000 });
  assert.deepEqual(r2.revised, []); assert.deepEqual(r2.covers, ['r-a']);
  const a2 = await first(db, "SELECT id, body, cover_id FROM blog_posts WHERE slug = 'r-a'");
  assert.equal(a2.body, 'eski A'); assert.notEqual(a2.cover_id, oldCover);
  assert.equal((await first(db, 'SELECT post_id FROM blog_images WHERE id = ?', a2.cover_id)).post_id, a2.id);
  assert.equal(await first(db, 'SELECT id FROM blog_images WHERE id = ?', oldCover), null, 'eski kapak silinir');
  assert.equal(await blogSeed(env, db, { posts: v2, fetcher, revisions, now: 3000 }), null, 'yapılacak iş kalmadı');
});

test('düzeltme: kapak 14 gün içinde yenilenemezse vazgeçilir', async () => {
  const db = d1(); await init(db);
  const env = { SITE_URL: 'https://site.test' };
  const fetcher = async () => new Response(JPG, { status: 200 });
  await blogSeed(env, db, { posts: [{ slug: 'k', title: 'K yazısı', body: 'eski', cover: 'k.jpg' }], fetcher });
  const posts = [{ slug: 'k', title: 'K yazısı', body: 'yeni', cover: 'k.jpg' }], revisions = { k: { from: [await sha('eski')], cover: true } };
  assert.deepEqual((await blogSeed(env, db, { posts, fetcher, revisions, now: 0 })).revised, ['k']);
  assert.deepEqual(JSON.parse((await first(db, "SELECT v FROM settings WHERE k = ?", REV)).v).covers, ['k']);
  await blogSeed(env, db, { posts, fetcher: async () => new Response('', { status: 500 }), revisions, now: 15 * 864e5 });
  assert.deepEqual(JSON.parse((await first(db, "SELECT v FROM settings WHERE k = ?", REV)).v).covers, []);
});

test('gerçek düzeltme listesi: eski gövdelerin özetleri güncel gövdeyle aynı değil, her yazı kaynakta var', async () => {
  const { REVISIONS } = await import('../src/blogseed.js');
  for (const [slug, r] of Object.entries(REVISIONS)) {
    const p = await source(`posts/${slug}.json`);
    assert.ok(p, slug);
    assert.ok(r.from.length && r.from.every((h) => /^[0-9a-f]{64}$/.test(h)));
    assert.ok(!r.from.includes(await sha(p.body)), `${slug} güncel gövde eski özetle aynı`);
    assert.ok(!/[Kk]omisyon %20 \+ KDV|1,2 × Komisyon|%24\)/.test(p.body), `${slug} Trendyol örneğinde KDV eklenmiş oran kalmış`);
  }
});
