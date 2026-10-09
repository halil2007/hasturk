// Blog: yönetim (yalnız ana panel yöneticisi), adres (slug) tekilliği, görsel sınırı, herkese açık uçlar (yalnız yayındakiler), güvenli Markdown
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run } from '../src/db.js';
import worker from '../src/index.js';
import { api } from '../src/api.js';
import { blogAdmin, MAX_IMAGE } from '../src/blog.js';
import { mdToHtml, slugify, imageIds } from '../public/blogmd.js';

const ADMIN = { id: 0, name: 'Yönetici', role: 'admin' };
const call = async (db, method, path, body, { env = {}, user = ADMIN } = {}) => {
  const r = await blogAdmin(new Request('https://panel.test/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, db, path.split('?')[0], user);
  return r.json();
};
const WEBP = (bytes = 64) => { const b = new Uint8Array(bytes); b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8); return 'data:image/webp;base64,' + Buffer.from(b).toString('base64'); };
const pub = (env, path, origin) => worker.fetch(new Request('https://panel.test/api/' + path, { headers: origin ? { Origin: origin } : {} }), env, { waitUntil() {} });

test('Türkçe slug', () => {
  assert.equal(slugify('Kargo Ücreti Nasıl Hesaplanır?'), 'kargo-ucreti-nasil-hesaplanir');
  assert.equal(slugify('IĞDIR İŞLEM & Çözüm'), 'igdir-islem-ve-cozum');
  assert.equal(slugify('  --  '), '');
  assert.ok(slugify('a '.repeat(100)).length <= 80);
});

test('Markdown: betik / olay özniteliği / javascript: bağlantısı çıkmaz, biçimler çalışır', () => {
  const h = mdToHtml('## Başlık\n<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n[tıkla](javascript:alert(1)) [iyi](https://ornek.com) [iç](/paketler) [x](//kotu.site)\n![g](img:0123456789abcdef0123 "Alt")\n![d](data:image/png;base64,AAAA)\n**kalın** *eğik*\n- a\n- b', { site: 'https://hasturkcrm.com' });
  assert.doesNotMatch(h, /<script/i);
  assert.doesNotMatch(h, /<img[^>]*onerror/i);
  assert.doesNotMatch(h, /href="(javascript|\/\/)/i);
  assert.doesNotMatch(h, /src="data:/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /<h2 id="baslik">Başlık<\/h2>/);
  assert.match(h, /<a href="https:\/\/ornek.com" target="_blank" rel="noopener noreferrer">iyi<\/a>/);
  assert.match(h, /<a href="\/paketler">iç<\/a>/);
  assert.match(h, /<figure><img src="\/api\/public\/blog\/img\/0123456789abcdef0123" alt="g"[^>]*><figcaption>Alt<\/figcaption><\/figure>/);
  assert.match(h, /<strong>kalın<\/strong> <em>eğik<\/em>/);
  assert.match(h, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.deepEqual(imageIds('![a](img:0123456789abcdef0123) ![b](img:0123456789abcdef0123)'), ['0123456789abcdef0123']);
});

test('yazı CRUD, slug tekilliği, görsel sınırı ve bağlama', async () => {
  const db = d1(); await init(db);
  await assert.rejects(() => call(db, 'POST', 'blog', { title: 'x' }), /Başlık/);
  const a = await call(db, 'POST', 'blog', { title: 'Kargo Ücreti Nasıl Hesaplanır?', body: 'Merhaba' });
  assert.equal(a.slug, 'kargo-ucreti-nasil-hesaplanir');
  // Aynı başlık: adres kendiliğinden -2 olur; elle yazılan çakışan adres reddedilir
  const b = await call(db, 'POST', 'blog', { title: 'Kargo ücreti nasıl hesaplanır' });
  assert.equal(b.slug, 'kargo-ucreti-nasil-hesaplanir-2');
  await assert.rejects(() => call(db, 'POST', 'blog', { title: 'Başka', slug: 'Kargo Ücreti Nasıl Hesaplanır' }), (e) => e.status === 409);
  await assert.rejects(() => call(db, 'PUT', `blog/${b.id}`, { slug: 'kargo-ucreti-nasil-hesaplanir' }), (e) => e.status === 409);
  assert.equal((await call(db, 'POST', 'blog', { title: 'img' })).slug, 'img-2', 'site için ayrılmış adres kullanılmaz');
  // Görsel: tür, imza ve boyut denetimi
  await assert.rejects(() => call(db, 'POST', 'blog/images', { data: 'data:image/svg+xml;base64,PHN2Zz4=' }), /WEBP/);
  await assert.rejects(() => call(db, 'POST', 'blog/images', { data: 'data:image/png;base64,' + Buffer.from('not a png at all').toString('base64') }), /uyuşmuyor/);
  await assert.rejects(() => call(db, 'POST', 'blog/images', { data: WEBP(MAX_IMAGE + 10) }), (e) => e.status === 413);
  const im = await call(db, 'POST', 'blog/images', { data: WEBP(), name: 'kapak.webp', w: 1600, h: 900 });
  assert.match(im.id, /^[a-f0-9]{20}$/);
  // Kaydedilince görsel yazıya bağlanır; düzenleme, etiket, yayın
  const u = await call(db, 'PUT', `blog/${a.id}`, { body: `Giriş\n\n![Kapak](img:${im.id})`, cover_id: im.id, tags: 'Kargo, kargo, Trendyol', status: 'published', summary: 'Kısa özet' });
  assert.equal(u.status, 'published'); assert.ok(u.published_at);
  const d = await call(db, 'GET', `blog/${a.id}`);
  assert.deepEqual(d.post.tags, ['Kargo', 'Trendyol']);
  assert.equal(d.post.slug, 'kargo-ucreti-nasil-hesaplanir', 'başlık değişmeden adres sabit');
  assert.equal(d.images.length, 1);
  await assert.rejects(() => call(db, 'PUT', `blog/${a.id}`, { title: 'Eski sürüm', updated_at: 1 }), (e) => e.status === 409);
  await assert.rejects(() => call(db, 'DELETE', `blog/images/${im.id}`), (e) => e.status === 409, 'kullanılan görsel silinmez');
  const l = await call(db, 'GET', 'blog');
  assert.equal(l.counts.total, 3); assert.equal(l.counts.published, 1);
  assert.equal((await call(db, 'GET', 'blog?status=draft')).posts.length, 2);
  // Silme: görselleri de silinir
  await call(db, 'DELETE', `blog/${a.id}`);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM blog_images').first()).n, 0);
  await assert.rejects(() => call(db, 'GET', `blog/${a.id}`), (e) => e.status === 404);
});

test('yetki: müşteri paneli ve personel 404; ana panel yöneticisi girer', async () => {
  const db = d1(); await init(db);
  const req = () => new Request('https://panel.test/api/blog');
  await assert.rejects(() => api(req(), { TENANT_SLUG: 'firma' }, { waitUntil() {} }, db, 'blog', ADMIN), (e) => e.status === 404);
  await assert.rejects(() => api(req(), {}, { waitUntil() {} }, db, 'blog', { id: 5, name: 'Personel', role: 'staff', perms: null }), (e) => e.status === 404);
  const r = await api(req(), {}, { waitUntil() {} }, db, 'blog', ADMIN);
  assert.equal(r.status, 200);
  // Oturumsuz istek reddedilir
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  assert.equal((await worker.fetch(new Request('https://panel.test/api/blog'), env, { waitUntil() {} })).status, 401);
});

test('herkese açık uçlar: yalnız yayındaki yazılar, sayfalama, görsel, RSS, site haritası, CORS', async () => {
  const db = d1(); await init(db);
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  const im = await call(db, 'POST', 'blog/images', { data: WEBP(), w: 800, h: 450 });
  const p1 = await call(db, 'POST', 'blog', { title: 'Birinci yazı', body: `**Merhaba** <script>x</script>\n\n![Görsel](img:${im.id})`, cover_id: im.id, status: 'published', tags: ['Kargo'], published_at: Date.now() - 2000 });
  await call(db, 'POST', 'blog', { title: 'İkinci yazı', body: 'İkinci', status: 'published', published_at: Date.now() - 1000 });
  await call(db, 'POST', 'blog', { title: 'Taslak yazı', body: 'gizli' });
  await call(db, 'POST', 'blog', { title: 'İleri tarihli', body: 'yarın', status: 'published', published_at: Date.now() + 864e5 });
  const r = await pub(env, 'public/blog?limit=1', 'https://hasturkcrm.com');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://hasturkcrm.com');
  assert.match(r.headers.get('cache-control'), /s-maxage=300/);
  const j = await r.json();
  assert.equal(j.total, 2, 'taslak ve ileri tarihli yazı listede yok'); assert.equal(j.pages, 2);
  assert.equal(j.posts[0].title, 'İkinci yazı');
  assert.equal((await (await pub(env, 'public/blog?page=2&limit=1')).json()).posts[0].cover, `https://panel.test/api/public/blog/img/${im.id}`);
  assert.equal((await pub(env, 'public/blog', 'https://kotu.site')).headers.get('access-control-allow-origin'), null);
  assert.equal((await (await pub(env, 'public/blog?tag=kargo')).json()).total, 1);
  const p = await (await pub(env, 'public/blog/post/' + p1.slug)).json();
  assert.match(p.post.html, /<strong>Merhaba<\/strong> &lt;script&gt;/);
  assert.match(p.post.html, new RegExp(`src="https://panel.test/api/public/blog/img/${im.id}" alt="Görsel" width="800" height="450"`));
  assert.equal(p.more.length, 1);
  assert.equal((await pub(env, 'public/blog/post/taslak-yazi')).status, 404);
  assert.equal((await pub(env, 'public/blog/post/ileri-tarihli')).status, 404);
  const img = await pub(env, 'public/blog/img/' + im.id);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.match(img.headers.get('cache-control'), /immutable/);
  assert.match(img.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await img.arrayBuffer()).byteLength, 64);
  const rss = await (await pub(env, 'public/blog/rss')).text();
  assert.match(rss, /<link>https:\/\/hasturkcrm.com\/blog\/birinci-yazi<\/link>/);
  assert.doesNotMatch(rss, /Taslak/);
  const sm = await (await pub(env, 'public/blog/sitemap')).text();
  assert.match(sm, /<loc>https:\/\/hasturkcrm.com\/blog<\/loc>/); assert.match(sm, /ikinci-yazi/); assert.doesNotMatch(sm, /taslak/);
  // Yalnız okuma
  assert.equal((await worker.fetch(new Request('https://panel.test/api/public/blog', { method: 'POST', body: '{}' }), env, { waitUntil() {} })).status, 405);
  await run(db, "UPDATE blog_posts SET status = 'draft' WHERE id = ?", p1.id);
  assert.equal((await pub(env, 'public/blog/post/' + p1.slug)).status, 404, 'yayından kaldırılan yazı açılmaz');
});
