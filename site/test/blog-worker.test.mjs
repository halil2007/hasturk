// Blog Worker'ı (src/worker.js) gerçek panel blog koduna (panel/src/blog.js, bellekte D1) bağlayıp ~250 yazıyla dener:
// sayfalama, panel isteği sayısı, önbellek (taze / bayat / panel kapalı), JSON-LD, SSS, site haritası, RSS, llms.txt, robots.txt, IndexNow.
// Çalıştırma: cd site && node --test   (Node 22.5+; panel/dev/d1.mjs yerleşik node:sqlite kullanır)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from '../../panel/dev/d1.mjs';
import { init, run } from '../../panel/src/db.js';
import { insertPost, blogPublic } from '../../panel/src/blog.js';
import worker from '../src/worker.js';

const SITE = 'https://hasturkcrm.com', PANEL = 'https://panel.hasturkcrm.com', NOW = Date.now(), DAY = 864e5;
const TAGS = ['Kargo', 'Trendyol', 'Stok', 'Fiyatlandırma', 'Hepsiburada', 'Kârlılık'];
const PAST = 230, FUTURE = 20;

// ---------- sahte panel (gerçek blogPublic) ve sahte Cloudflare ortamı ----------
const db = d1(); await init(db);
const penv = { DB: db, SITE_URL: SITE };
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(56).fill(0)]).toString('base64');
await run(db, 'INSERT INTO blog_images (id, post_id, name, type, size, w, h, data, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)', 'abcdef0123456789abcd', 'kapak.png', 'image/png', 64, 1600, 900, png, NOW);
const para = (i) => `Pazaryerinde satış yaparken **${i}. ipucu**: siparişleri tek listede toplayın, stokları eşitleyin ve kârı sipariş başına izleyin. `.repeat(12);
const body = (i, faq) => `${para(i)}\n\n## Neden önemli?\n\n${para(i)}\n\n## Nasıl yapılır?\n\n${para(i)}\n\n![Ekran](img:abcdef0123456789abcd "Panel")\n\n## Sonuç\n\n${para(i)}`
  + (faq ? `\n\n## Sık sorulan sorular\n\n### Desi nedir?\n\nHacim ölçüsüdür; **3000** ile bölünür.\n\n### Desi mi ağırlık mı?\n\nİkisinden büyük olanı.\n\nEk açıklama satırı.\n\n### Neden 3000?\n\nYurt içi kargo firmalarının çoğu böyle hesaplar.` : '');
const slugs = { past: [], future: [] };
for (let i = 0; i < PAST + FUTURE; i++) {
  const fut = i >= PAST, at = fut ? NOW + (i - PAST + 1) * DAY / 3 : NOW - (PAST - i) * DAY / 3;
  const r = await insertPost(db, { title: `${fut ? 'Gelecek' : 'Rehber'} yazı ${i}: pazaryeri ipuçları`, summary: `Kısa cevap ${i}: bu yazıda pazaryeri operasyonunu adım adım anlatıyoruz.`, body: body(i, i % 5 === 0),
    tags: [TAGS[i % 6], TAGS[(i + 1) % 6]], status: 'published', published_at: at, cover_id: 'abcdef0123456789abcd', author: 'Hastürk CRM', seo_title: i === 3 ? 'Özel SEO başlığı | Hastürk CRM' : '', seo_desc: i === 4 ? 'Özel arama açıklaması.' : '' }, { name: 'Hastürk CRM' });
  slugs[fut ? 'future' : 'past'].push(r.slug);
}
await run(db, "INSERT INTO blog_posts (slug, title, body, status, created_at, updated_at) VALUES ('taslak-yazi', 'Taslak', 'gizli', 'draft', ?, ?)", NOW, NOW);

const calls = [], indexnow = [];
let panelDown = false;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.startsWith('https://api.indexnow.org/')) { indexnow.push(JSON.parse(o.body)); return new Response('', { status: 202 }); }
  if (!url.startsWith(PANEL + '/api/')) throw new Error('beklenmeyen dış istek: ' + url);
  calls.push(url.slice(PANEL.length));
  if (panelDown) return new Response('{"error":"x"}', { status: 503 });
  return blogPublic(new Request(url, o), penv, new URL(url).pathname.slice(5));
};
const store = new Map();
globalThis.caches = { default: {
  async match(r) { const e = store.get(r.url); return e ? new Response(e.body.slice(0), { status: e.status, headers: e.headers }) : undefined; },
  async put(r, res) { store.set(r.url, { status: res.status, headers: [...res.headers], body: await res.arrayBuffer() }); },
} };
const ASSETS = { fetch: async (req) => new Response(new URL(req.url).pathname === '/robots.txt' ? readFileSync(new URL('../public/robots.txt', import.meta.url)) : 'statik', { headers: { 'X-Static': '1' } }) };
const env = { ASSETS };
async function get(path, { e = env, method = 'GET' } = {}) {
  const jobs = [], ctx = { waitUntil: (p) => jobs.push(p) }, before = calls.length;
  const res = await worker.fetch(new Request(SITE + path, { method }), e, ctx);
  const text = method === 'HEAD' ? '' : await res.text();
  await Promise.all(jobs);
  return { res, text, up: calls.length - before, cache: res.headers.get('x-cache') };
}
const jsonld = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
const node = (ld, type) => ld['@graph'].find((x) => x['@type'] === type);
const meta = (html, attr, name) => (new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(html) || [])[1];
const canonical = (html) => (/<link rel="canonical" href="([^"]*)"/.exec(html) || [])[1];
const report = [];

test('liste: sayfalama, tek panel isteği, küçük yük, önbellek başlıkları', async () => {
  const a = await get('/blog');
  assert.equal(a.res.status, 200); assert.equal(a.up, 1, 'liste sayfası panelden tek istekle'); assert.equal(a.cache, 'MISS');
  assert.equal((a.text.match(/<article class="bl-card/g) || []).length, 12);
  assert.match(a.text, new RegExp(`Sayfa 1 / ${Math.ceil(PAST / 12)}`));
  assert.doesNotMatch(a.text, /Gelecek yazı/, 'ileri tarihli yazı listede yok');
  assert.match(a.res.headers.get('cache-control'), /s-maxage=120, stale-while-revalidate/);
  assert.equal(canonical(a.text), `${SITE}/blog`);
  assert.match(a.text, /<link rel="next" href="\/blog\?sayfa=2">/);
  const b = await get('/blog?utm_source=x');
  assert.equal(b.up, 0, 'ikinci ziyaret önbellekten'); assert.equal(b.cache, 'HIT');
  const p2 = await get('/blog?sayfa=2');
  assert.equal(canonical(p2.text), `${SITE}/blog?sayfa=2`); assert.match(meta(p2.text, 'name', 'description'), /Sayfa 2 \//);
  assert.equal((await get('/blog?sayfa=99')).res.status, 404);
  // Panelin liste yanıtı yazı gövdesi taşımaz
  const raw = await (await fetch(`${PANEL}/api/public/blog?page=1&limit=12`)).text();
  assert.doesNotMatch(raw, /ipucu\*\*/); assert.ok(raw.length < 12000, `liste yükü ${raw.length} bayt`);
  report.push(`liste: panel JSON ${raw.length} B, HTML ${a.text.length} B`);
  const tag = await get('/blog?etiket=Kargo');
  assert.equal(tag.res.status, 200); assert.match(tag.text, /noindex, follow/);
});

test('yazı: tek panel isteği, JSON-LD (BlogPosting, Breadcrumb, FAQPage), canonical, OG, özet, ilgili yazılar', async () => {
  const slug = slugs.past[PAST - 5]; // i = 225 → SSS var
  const a = await get('/blog/' + slug);
  assert.equal(a.res.status, 200); assert.equal(a.up, 1, 'yazı sayfası panelden tek istekle (ilgili yazılar aynı yanıtta)');
  report.push(`yazı: HTML ${a.text.length} B`);
  const ld = jsonld(a.text), bp = node(ld, 'BlogPosting');
  assert.ok(bp.headline && bp.description && bp.image.url && bp.datePublished && bp.dateModified);
  assert.equal(bp.author['@type'], 'Organization'); assert.equal(bp.author.name, 'Hastürk CRM');
  assert.ok(bp.publisher.logo.url); assert.equal(bp.mainEntityOfPage['@id'], `${SITE}/blog/${slug}`); assert.equal(bp.inLanguage, 'tr-TR');
  assert.match(bp.keywords, /,/); assert.ok(bp.wordCount > 100, `kelime ${bp.wordCount}`);
  assert.equal(node(ld, 'BreadcrumbList').itemListElement.length, 3);
  const faq = node(ld, 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((q) => q.name), ['Desi nedir?', 'Desi mi ağırlık mı?', 'Neden 3000?']);
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'Hacim ölçüsüdür; 3000 ile bölünür.');
  assert.equal(faq.mainEntity[1].acceptedAnswer.text, 'İkisinden büyük olanı. Ek açıklama satırı.');
  assert.equal(canonical(a.text), `${SITE}/blog/${slug}`);
  assert.equal(meta(a.text, 'property', 'og:type'), 'article'); assert.equal(meta(a.text, 'property', 'og:image'), `${SITE}/blog/img/abcdef0123456789abcd`);
  assert.equal(meta(a.text, 'property', 'og:url'), `${SITE}/blog/${slug}`); assert.equal(meta(a.text, 'name', 'twitter:card'), 'summary_large_image');
  assert.match(a.text, /<div class="bl-sum"><b>Özet<\/b><p>Kısa cevap 225/); assert.match(a.text, /Son güncelleme: <time/); assert.match(a.text, /\d+ dk okuma/);
  assert.match(a.text, /<aside class="bl-toc"/); assert.match(a.text, /<details class="bl-tocm">/);
  assert.match(a.res.headers.get('cache-control'), /s-maxage=600/);
  // İlgili yazılar: 3 tane, ortak etiketli ve yalnız yayındakiler
  const rel = a.text.split('İlgili Yazılar')[1] || '';
  const relSlugs = [...new Set([...rel.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
  assert.equal(relSlugs.length, 3); for (const s of relSlugs) assert.ok(slugs.past.includes(s) && s !== slug);
  assert.match(rel, /bl-meta[^]*?(Kargo|Trendyol|Stok|Fiyatlandırma|Hepsiburada|Kârlılık)/);
  // Görseller: genişlik / yükseklik, yazı içindekiler tembel yüklenir, yinelenen öznitelik yok
  assert.match(a.text, /<img src="\/blog\/img\/abcdef0123456789abcd" alt="Ekran" width="1600" height="900" loading="lazy" decoding="async"><figcaption>Panel<\/figcaption>/);
  assert.doesNotMatch(a.text, /decoding="async"[^>]*decoding="async"/);
  const b = await get('/blog/' + slug);
  assert.equal(b.up, 0); assert.equal(b.cache, 'HIT');
  // SSS olmayan yazıda FAQPage yok; özel SEO başlığına marka iki kez eklenmez
  const c = await get('/blog/' + slugs.past[3]);
  assert.equal(node(jsonld(c.text), 'FAQPage'), undefined);
  assert.match(c.text, /<title>Özel SEO başlığı \| Hastürk CRM<\/title>/);
  assert.equal(meta((await get('/blog/' + slugs.past[4])).text, 'name', 'description'), 'Özel arama açıklaması.');
});

test('ileri tarihli / bilinmeyen yazı 404 (sızmaz), büyük harf yönlendirilir, HEAD', async () => {
  const f = await get('/blog/' + slugs.future[0]);
  assert.equal(f.res.status, 404); assert.equal(f.up, 1); assert.match(f.text, /noindex/); assert.doesNotMatch(f.text, /Gelecek yazı/);
  assert.match(f.res.headers.get('cache-control'), /s-maxage=60/);
  assert.equal((await get('/blog/taslak-yazi')).res.status, 404);
  assert.equal((await get('/blog/yok-boyle-bir-yazi')).res.status, 404);
  const r = await get('/blog/Rehber-Yazi');
  assert.equal(r.res.status, 301); assert.equal(r.res.headers.get('location'), `${SITE}/blog/rehber-yazi`);
  const h = await get('/blog', { method: 'HEAD' });
  assert.equal(h.res.status, 200); assert.equal(h.text, '');
});

test('site haritası, RSS ve görsel', async () => {
  const sm = await get('/blog/sitemap.xml');
  assert.equal(sm.res.status, 200); assert.equal(sm.up, 1); assert.match(sm.res.headers.get('content-type'), /xml/);
  assert.equal((sm.text.match(/<url>/g) || []).length, PAST + 1);
  for (const s of slugs.future) assert.ok(!sm.text.includes(`/blog/${s}<`), 'ileri tarihli yazı haritada yok');
  assert.ok(!sm.text.includes('taslak-yazi'));
  assert.match(sm.text, /<lastmod>\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/lastmod><image:image><image:loc>https:\/\/hasturkcrm.com\/blog\/img\/abcdef0123456789abcd<\/image:loc>/);
  const rss = await get('/blog/rss.xml');
  assert.equal((rss.text.match(/<item>/g) || []).length, 30); assert.doesNotMatch(rss.text, /Gelecek yazı/);
  const img = await get('/blog/img/abcdef0123456789abcd');
  assert.equal(img.res.headers.get('content-type'), 'image/png'); assert.match(img.res.headers.get('cache-control'), /immutable/);
  assert.equal((await get('/blog/img/abcdef0123456789abcd')).up, 0);
});

test('llms.txt, llms-full.txt ve robots.txt', async () => {
  const a = await get('/llms.txt');
  assert.equal(a.res.status, 200); assert.equal(a.up, 1); assert.match(a.res.headers.get('content-type'), /text\/plain/);
  assert.match(a.text, /^# Hastürk CRM\n\n> /); assert.match(a.text, /## Özellikler/); assert.match(a.text, /## Entegrasyonlar/); assert.match(a.text, /\/paketler\)/);
  assert.match(a.text, /komisyon-oranlari\)/); assert.match(a.text, /## Blog: son yazılar/); assert.match(a.text, /## Optional\n\n- \[Tüm blog yazıları\]\(https:\/\/hasturkcrm.com\/llms-full.txt\)/);
  assert.equal((a.text.match(/\]\(https:\/\/hasturkcrm.com\/blog\/rehber-/g) || []).length, 30);
  assert.doesNotMatch(a.text, /Gelecek|e-fatura|Türkçe destek|15 dakika/i);
  const f = await get('/llms-full.txt');
  assert.equal((f.text.match(/\]\(https:\/\/hasturkcrm.com\/blog\/rehber-/g) || []).length, PAST); assert.doesNotMatch(f.text, /Gelecek/);
  report.push(`llms.txt ${a.text.length} B, llms-full.txt ${f.text.length} B (${PAST} yazı)`);
  assert.ok(f.text.length < 150_000);
  const r = await get('/robots.txt');
  assert.equal(r.up, 0); assert.equal(r.res.headers.get('x-static'), '1', 'robots.txt statik dosya');
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'YandexBot']) assert.match(r.text, new RegExp(`^User-agent: ${bot}$`, 'm'));
  assert.doesNotMatch(r.text, /Disallow: \//);
  assert.match(r.text, /^Sitemap: https:\/\/hasturkcrm.com\/sitemap.xml$/m); assert.match(r.text, /^Sitemap: https:\/\/hasturkcrm.com\/blog\/sitemap.xml$/m);
  assert.equal((await get('/paketler')).res.headers.get('x-static'), '1');
});

test('önbellek: süresi geçince bayat kopya hemen sunulur, arka planda tek istekle yenilenir; panel kapalıyken bayat kopya', async () => {
  await get('/blog?sayfa=3');
  const e = store.get(`${SITE}/blog?sayfa=3`);
  e.headers = e.headers.map(([k, v]) => [k, k === 'x-at' ? String(Date.now() - 121e3) : v]);
  const s = await get('/blog?sayfa=3');
  assert.equal(s.cache, 'STALE'); assert.equal(s.up, 1, 'arka planda tek yenileme'); assert.equal(s.res.status, 200);
  assert.equal((await get('/blog?sayfa=3')).cache, 'HIT');
  const e2 = store.get(`${SITE}/blog?sayfa=3`);
  e2.headers = e2.headers.map(([k, v]) => [k, k === 'x-at' ? String(Date.now() - 300e3) : v]);
  panelDown = true;
  try {
    const d = await get('/blog?sayfa=3');
    assert.equal(d.res.status, 200, 'panel kapalı: bayat kopya sunulur'); assert.equal(d.cache, 'STALE');
    const n = await get('/blog?sayfa=4');
    assert.equal(n.res.status, 503); assert.equal(n.res.headers.get('cache-control'), 'no-store');
    const l = await get('/llms-full.txt?x=1'); // önbellekte (sorgu parametresi anahtara girmez)
    assert.equal(l.res.status, 200);
    store.delete(`${SITE}/llms.txt`);
    const l2 = await get('/llms.txt');
    assert.equal(l2.res.status, 200); assert.match(l2.text, /^# Hastürk CRM/);
  } finally { panelDown = false; }
});

test('IndexNow: anahtar yoksa hiçbir şey yapılmaz; varsa son 15 dakikada yayına girenler bildirilir', async () => {
  // Zamanlayıcı anı t: panel de "şimdi"yi t olarak görür (ileri tarihli yazı o anda yayına girmiş olur)
  const sched = async (e, t) => {
    const real = Date.now, jobs = [], before = calls.length; Date.now = () => t;
    try { await worker.scheduled({ scheduledTime: t }, e, { waitUntil: (p) => jobs.push(p) }); await Promise.all(jobs); } finally { Date.now = real; }
    return calls.length - before;
  };
  const key = 'a1b2c3d4e5f6a7b8', ke = { ...env, INDEXNOW_KEY: key };
  assert.equal(await sched(env, NOW + DAY / 3 + 60e3), 0, 'anahtar yok: panel de sorgulanmaz'); assert.equal(indexnow.length, 0);
  assert.equal(await sched(ke, NOW + DAY / 6), 1, 'tek panel isteği'); assert.equal(indexnow.length, 0, 'pencerede yeni yazı yok');
  // İlk ileri tarihli yazı NOW + 8 sa'te yayına girer: onu kapsayan 15 dakikalık pencerede bildirilir, sonrakinde tekrar bildirilmez
  await sched(ke, NOW + DAY / 3 + 60e3);
  assert.equal(indexnow.length, 1);
  assert.deepEqual(indexnow[0].urlList, [`${SITE}/blog`, `${SITE}/blog/${slugs.future[0]}`]);
  await sched(ke, NOW + DAY / 3 + 60e3 + 15 * 60e3);
  assert.equal(indexnow.length, 1, 'aynı yazı ikinci kez bildirilmez');
  assert.equal(indexnow[0].key, key); assert.equal(indexnow[0].keyLocation, `${SITE}/blog/${key}.txt`); assert.equal(indexnow[0].host, 'hasturkcrm.com');
  const kf = await get(`/blog/${key}.txt`, { e: ke });
  assert.equal(kf.res.status, 200); assert.equal(kf.text, key); assert.equal(kf.up, 0);
  assert.equal((await get('/blog/baskaanahtar1.txt', { e: ke })).res.status, 404);
});

test('rapor', () => { console.log(report.join('\n')); });
