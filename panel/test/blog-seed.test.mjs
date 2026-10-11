// Hazır blog yazıları: ana panelde bir kez yayımlanır, kapak siteden alınır; kapak alınamazsa sonra tekrar denenir; müşteri panelinde çalışmaz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, first, all, run } from '../src/db.js';
import { blogSeed } from '../src/blogseed.js';

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

test('ikinci parti: 1 Ekim\'den itibaren günde bir (farklı saatlerde) yayımlanmış sayılır; önceden ileri tarihli yüklenenler bir kez geri çekilir', async () => {
  const { SECOND } = await import('../src/blogseed.js');
  assert.equal(SECOND.length, 10);
  const days = SECOND.map((p) => new Date(p.at + 3 * 3600e3).toISOString().slice(0, 10));
  assert.equal(days[0], '2026-10-01'); assert.equal(new Set(days).size, 10);
  for (const p of SECOND) { const h = new Date(p.at + 3 * 3600e3).getUTCHours(); assert.ok(h >= 9 && h <= 17, `${p.slug} saat ${h}`); }
  const db = d1(); await init(db);
  const now = Date.UTC(2026, 9, 11, 12);
  const fetcher = async () => new Response(JPG, { status: 200 });
  // Eski sürüm: ilk yazı ileri tarihli yüklenmiş, ikincisinin tarihi elle geçmişe alınmış
  await run(db, "INSERT INTO blog_posts (slug, title, body, status, published_at, created_at, updated_at) VALUES (?, 'a', 'x', 'published', ?, 0, 0), (?, 'b', 'x', 'published', 5, 0, 0)", SECOND[0].slug, now + 864e5, SECOND[1].slug);
  await blogSeed({ SITE_URL: 'https://site.test' }, db, { fetcher, now });
  const at = async (s) => (await first(db, 'SELECT published_at FROM blog_posts WHERE slug = ?', s)).published_at;
  assert.equal(await at(SECOND[0].slug), SECOND[0].at);
  assert.equal(await at(SECOND[1].slug), 5, 'elle değiştirilen tarih korunur');
  assert.equal(await at(SECOND[9].slug), SECOND[9].at, 'yeni yüklenen de Ekim tarihinde');
});
