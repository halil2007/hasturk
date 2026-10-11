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
