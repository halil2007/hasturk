// Blog: ana panelden yazı yazılır (Markdown, bkz. public/blogmd.js) ve görseller yüklenir; tanıtım sitesi (hasturkcrm.com/blog)
// yayındaki yazıları oturumsuz, yalnız okunur uçlardan alır (/api/public/blog…). Yazıları yalnız ana panelin yöneticisi yönetir;
// müşteri panellerinde (env.TENANT_SLUG) bu bölüm yoktur (404). Veriler ana panelin veritabanındadır (blog_posts, blog_images).
// Görseller tarayıcıda küçültülüp (en uzun kenar 1600 px, WebP / JPEG) base64 olarak saklanır; sunucu boyut ve dosya türünü ayrıca denetler.
import { all, first, run, init } from './db.js';
import { siteOrigins } from './lead.js';
import { json, fail, str, HttpError } from './util.js';
import { mdToHtml, mdText, slugify, imageIds, readMinutes, IMG_ID } from '../public/blogmd.js';

export const MAX_IMAGE = 500 * 1024; // görsel başına en fazla 500 KB (tarayıcı ~400 KB altına indirir)
const MAX_BODY = 200_000, STATUS = ['draft', 'published'];
// Sitede başka sayfaya ayrılmış adresler (/blog/img/…, /blog/etiket/…) yazı adresi olamaz
const RESERVED = ['img', 'etiket', 'rss', 'sitemap', 'sayfa', 'yeni'];
// Dosya imzası: uzantı / tür bilgisine güvenilmez, içeriğin ilk baytları denetlenir (SVG kabul edilmez: içinde betik olabilir)
const MAGIC = { 'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' };

export const siteUrl = (env) => String(env.SITE_URL || siteOrigins(env)[0] || 'https://hasturkcrm.com').replace(/\/+$/, '');
const tagsOf = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
const toMs = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : fail(400, 'Yayın tarihi geçersiz'); };

// ---------- yönetim (ana panel yöneticisi) ----------
async function freeSlug(db, want, id, strict) {
  let s = want, n = 1;
  for (;;) {
    const taken = RESERVED.includes(s) || await first(db, 'SELECT id FROM blog_posts WHERE slug = ? AND id != ?', s, id || 0);
    if (!taken) return s;
    if (strict) fail(409, `"${s}" adresi başka bir yazıda kullanılıyor; farklı bir adres yazın`);
    s = `${want.slice(0, 74)}-${++n}`;
  }
}
async function clean(db, b, old, user) {
  const title = str(b.title ?? (old && old.title)).slice(0, 160);
  if (title.length < 3) fail(400, 'Başlık yazın (en az 3 karakter)');
  // Adres: elle yazıldıysa aynen (çakışırsa hata), yazılmadıysa başlıktan üretilir (çakışırsa -2, -3 …); kayıtlı yazının adresi kendiliğinden değişmez
  const typed = slugify(str(b.slug));
  const slug = typed ? (old && typed === old.slug ? typed : await freeSlug(db, typed, old && old.id, true)) : old ? old.slug : await freeSlug(db, slugify(title) || 'yazi', 0, false);
  const body = String(b.body ?? (old ? old.body : '') ?? '');
  if (body.length > MAX_BODY) fail(400, 'Yazı çok uzun (en fazla 200.000 karakter)');
  const status = b.status === undefined ? (old ? old.status : 'draft') : STATUS.includes(b.status) ? b.status : fail(400, 'Geçersiz durum');
  let cover = b.cover_id === undefined ? (old ? old.cover_id : null) : str(b.cover_id) || null;
  if (cover && !(IMG_ID.test(cover) && await first(db, 'SELECT id FROM blog_images WHERE id = ?', cover))) fail(400, 'Kapak görseli bulunamadı');
  const raw = b.tags === undefined ? (old ? tagsOf(old.tags) : []) : Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',');
  const tags = [];
  for (const t of raw.map((x) => str(x).replace(/^#/, '').slice(0, 30)).filter(Boolean)) if (!tags.some((x) => x.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) tags.push(t);
  let pub = b.published_at === undefined ? (old ? old.published_at : null) : toMs(b.published_at);
  if (status === 'published' && !pub) pub = Date.now();
  const pick = (k, n) => str(b[k] === undefined ? old && old[k] : b[k]).slice(0, n);
  return { slug, title, summary: pick('summary', 320), body, cover_id: cover, tags: JSON.stringify(tags.slice(0, 8)), status, published_at: pub,
    author: pick('author', 80) || (old ? old.author : user.name) || 'Hastürk CRM', seo_title: pick('seo_title', 90), seo_desc: pick('seo_desc', 200) };
}
// Yazıda / kapakta kullanılan, henüz bir yazıya bağlanmamış görseller bu yazıya bağlanır (yazı silinince onlar da silinir)
async function claimImages(db, id, p) {
  const ids = [...new Set([...imageIds(p.body), p.cover_id].filter(Boolean))];
  if (ids.length) await run(db, `UPDATE blog_images SET post_id = ? WHERE post_id IS NULL AND id IN (${ids.map(() => '?').join(',')})`, id, ...ids);
}
const postOut = (p) => p && { ...p, tags: tagsOf(p.tags) };
// Yeni yazı kaydı (panelden ya da otomatik blogdan, bkz. blogai.js)
export async function insertPost(db, b, user) {
  const p = await clean(db, b, null, user), now = Date.now();
  const r = await first(db, `INSERT INTO blog_posts (slug, title, summary, body, cover_id, tags, status, published_at, created_at, updated_at, author, seo_title, seo_desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, p.slug, p.title, p.summary, p.body, p.cover_id, p.tags, p.status, p.published_at, now, now, p.author, p.seo_title, p.seo_desc);
  await claimImages(db, r.id, p);
  return { id: r.id, slug: p.slug };
}

export async function blogAdmin(req, env, db, path, user) {
  if (env.TENANT_SLUG || !user || user.role !== 'admin' || user.support) fail(404, 'Bulunamadı');
  const m = req.method, url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  const b = m === 'GET' || m === 'DELETE' ? {} : await req.json().catch(() => fail(400, 'Geçersiz JSON'));
  const now = Date.now();
  let x;
  if (path === 'blog' && m === 'GET') {
    const where = ['1 = 1'], args = [];
    if (q.status === 'scheduled') { where.push("status = 'published' AND published_at > ?"); args.push(now); }
    else if (STATUS.includes(q.status)) { where.push('status = ?'); args.push(q.status); }
    if (str(q.q)) { where.push('(title LIKE ? OR slug LIKE ? OR tags LIKE ?)'); const s = `%${str(q.q).slice(0, 60)}%`; args.push(s, s, s); }
    const [posts, counts] = await Promise.all([
      all(db, `SELECT id, slug, title, summary, cover_id, tags, status, published_at, created_at, updated_at, author, ai, length(body) AS chars
        FROM blog_posts WHERE ${where.join(' AND ')} ORDER BY (status = 'draft') DESC, COALESCE(published_at, updated_at) DESC LIMIT 500`, ...args),
      first(db, "SELECT COUNT(*) AS total, SUM(status = 'draft') AS draft, SUM(status = 'published') AS published, SUM(status = 'published' AND published_at > ?) AS scheduled FROM blog_posts", now),
    ]);
    return json({ posts: posts.map(postOut), counts: { total: counts.total || 0, draft: counts.draft || 0, published: counts.published || 0, scheduled: counts.scheduled || 0 }, site: siteUrl(env), now });
  }
  if (path === 'blog' && m === 'POST') {
    const r = await insertPost(db, b, user);
    return json({ ok: true, id: r.id, slug: r.slug });
  }
  // Otomatik blog (Claude): ayarlar, konu kuyruğu, API anahtarı ve "şimdi üret"
  if (path === 'blog/auto') {
    const ai = await import('./blogai.js'), { saveConfig, loadConfig, describe } = await import('./config.js');
    if (m === 'PUT') {
      const cur = await ai.autoConfig(db);
      const topics = (Array.isArray(b.topics) ? b.topics : String(b.topics || '').split('\n')).map((t) => str(t).slice(0, 200)).filter(Boolean).slice(0, 100);
      await run(db, "INSERT INTO settings (k, v) VALUES ('blog_auto', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v",
        JSON.stringify({ ...cur, enabled: b.enabled === undefined ? cur.enabled : !!b.enabled, hour: b.hour === undefined ? cur.hour : Math.max(0, Math.min(23, Math.round(Number(b.hour) || 0))), topics: b.topics === undefined ? cur.topics : topics }));
      if (str(b.key)) await saveConfig(env, db, 'ai', { values: { ANTHROPIC_API_KEY: str(b.key) } });
    }
    if (m === 'GET' || m === 'PUT') {
      const [cfg, st, pend] = await Promise.all([ai.autoConfig(db), first(db, "SELECT v FROM settings WHERE k = 'blog_auto_state'"), first(db, "SELECT COUNT(*) AS n FROM blog_posts WHERE ai = 1 AND status = 'draft'")]);
      const key = describe(env, await loadConfig(env, db), 'ai').fields[0];
      return json({ ...cfg, key: { set: !!(key.source), masked: key.masked, source: key.source }, state: st ? JSON.parse(st.v) : {}, pending: pend.n || 0, max_pending: ai.MAX_PENDING, model: ai.MODEL });
    }
    if (m === 'POST' && path === 'blog/auto') fail(405, 'Bilinmeyen işlem');
  }
  if (path === 'blog/auto/run' && m === 'POST') {
    const ai = await import('./blogai.js');
    const cfg = await ai.autoConfig(db);
    const r = await ai.runOnce(env, db, cfg, b.topic != null && str(b.topic) ? { topic: str(b.topic).slice(0, 200) } : {});
    return json({ ok: true, ...r });
  }
  // Görsel yükleme: { data: 'data:image/webp;base64,…', name, w, h, post_id? }
  if (path === 'blog/images' && m === 'POST') {
    const mm = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(b.data || ''));
    if (!mm) fail(400, 'Yalnız WEBP, JPG ya da PNG görsel yüklenebilir');
    const size = Math.floor((mm[2].length * 3) / 4) - (mm[2].endsWith('==') ? 2 : mm[2].endsWith('=') ? 1 : 0);
    if (size > MAX_IMAGE) fail(413, `Görsel çok büyük (${Math.round(size / 1024)} KB; en fazla ${MAX_IMAGE / 1024} KB)`);
    let head;
    try { head = Uint8Array.from(atob(mm[2].slice(0, 24)), (c) => c.charCodeAt(0)); } catch { fail(400, 'Görsel okunamadı'); }
    if (!MAGIC[mm[1]](head)) fail(400, 'Dosya içeriği görsel türüyle uyuşmuyor');
    const postId = Number(b.post_id) || null;
    if (postId && !(await first(db, 'SELECT id FROM blog_posts WHERE id = ?', postId))) fail(404, 'Yazı bulunamadı');
    const id = newId(), w = Math.max(0, Math.min(10000, Math.round(Number(b.w) || 0))), h = Math.max(0, Math.min(10000, Math.round(Number(b.h) || 0)));
    // Kaydedilmeden bırakılan yazıların sahipsiz görselleri (2 günden eski) temizlenir
    await run(db, 'DELETE FROM blog_images WHERE post_id IS NULL AND created_at < ?', now - 2 * 864e5);
    await run(db, 'INSERT INTO blog_images (id, post_id, name, type, size, w, h, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, postId, str(b.name).slice(0, 120) || 'gorsel', mm[1], size, w, h, mm[2], now);
    return json({ ok: true, id, url: `/api/public/blog/img/${id}`, size, w, h });
  }
  if ((x = path.match(/^blog\/images\/([a-f0-9]{16,32})$/)) && m === 'DELETE') {
    const used = await first(db, 'SELECT title FROM blog_posts WHERE cover_id = ? OR body LIKE ? LIMIT 1', x[1], `%img:${x[1]}%`);
    if (used && !q.force) fail(409, `Bu görsel "${used.title}" yazısında kullanılıyor; önce yazıdan çıkarın`);
    await run(db, 'DELETE FROM blog_images WHERE id = ?', x[1]);
    return json({ ok: true });
  }
  if ((x = path.match(/^blog\/(\d+)$/))) {
    const id = Number(x[1]), old = await first(db, 'SELECT * FROM blog_posts WHERE id = ?', id);
    if (!old) fail(404, 'Yazı bulunamadı');
    if (m === 'GET') {
      // Yazının görselleri + yazıda kullanılan ama henüz bağlanmamış görseller (kaydedilmemiş yeni yazıdan kalanlar)
      const ids = imageIds(old.body);
      const images = await all(db, `SELECT id, name, type, size, w, h, created_at FROM blog_images WHERE post_id = ?${ids.length ? ` OR id IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY created_at`, id, ...ids);
      return json({ post: postOut(old), images, site: siteUrl(env), now });
    }
    if (m === 'PUT') {
      // Eşzamanlı düzenleme: başka sekmede kaydedilmiş daha yeni sürümün üzerine yazılmaz
      if (b.updated_at && Number(b.updated_at) !== old.updated_at) fail(409, 'Yazı başka bir pencerede değiştirilmiş; sayfayı yenileyip tekrar deneyin');
      const p = await clean(db, b, old, user);
      await run(db, `UPDATE blog_posts SET slug = ?, title = ?, summary = ?, body = ?, cover_id = ?, tags = ?, status = ?, published_at = ?, author = ?, seo_title = ?, seo_desc = ?, updated_at = ? WHERE id = ?`,
        p.slug, p.title, p.summary, p.body, p.cover_id, p.tags, p.status, p.published_at, p.author, p.seo_title, p.seo_desc, now, id);
      await claimImages(db, id, p);
      return json({ ok: true, id, slug: p.slug, status: p.status, published_at: p.published_at, updated_at: now });
    }
    if (m === 'DELETE') {
      await run(db, 'DELETE FROM blog_images WHERE post_id = ?', id);
      await run(db, 'DELETE FROM blog_posts WHERE id = ?', id);
      return json({ ok: true });
    }
  }
  fail(404, 'Bulunamadı');
}

// ---------- herkese açık uçlar (tanıtım sitesi) ----------
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
// Yayında: durumu "yayında" ve yayın tarihi gelmiş (ileri tarihli yazı o güne kadar görünmez)
const live = (a = '') => `${a}status = 'published' AND ${a}published_at <= ?`;
const CACHE = 'public, max-age=60, s-maxage=300';
const card = (p, base) => ({ slug: p.slug, title: p.title, summary: p.summary || mdText(p.body || '').slice(0, 200), tags: tagsOf(p.tags), author: p.author,
  published_at: p.published_at, updated_at: p.updated_at, cover: p.cover_id ? `${base}/api/public/blog/img/${p.cover_id}` : null, cover_w: p.cw || null, cover_h: p.ch || null });
// Liste satırı: yazının tamamı taşınmaz (özet boşsa ilk 600 karakterden üretilir)
const COLS = `p.id, p.slug, p.title, p.summary, p.tags, p.author, p.published_at, p.updated_at, p.cover_id, i.w AS cw, i.h AS ch, i.type AS ct, i.size AS cs`;
const SHORT = `${COLS}, CASE WHEN p.summary IS NULL OR p.summary = '' THEN substr(p.body, 1, 600) END AS body`;
const FROM = 'FROM blog_posts p LEFT JOIN blog_images i ON i.id = p.cover_id';

export async function blogPublic(req, env, path) {
  const origin = (req.headers.get('Origin') || '').replace(/\/+$/, ''), ok = siteOrigins(env).includes(origin);
  const h = { Vary: 'Origin', ...(ok ? { 'Access-Control-Allow-Origin': origin } : {}) };
  if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: ok ? { ...h, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Max-Age': '86400' } : h });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'Yalnız GET' }, 405, { ...h, Allow: 'GET, HEAD, OPTIONS' });
  const db = env.DB;
  if (!db) return json({ error: 'Blog şu an kullanılamıyor' }, 503, h);
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams), base = url.origin, site = siteUrl(env), now = Date.now();
  try {
    await init(db);
    let x;
    if ((x = path.match(/^public\/blog\/img\/([a-f0-9]{16,32})$/))) {
      const im = await first(db, 'SELECT type, data FROM blog_images WHERE id = ?', x[1]);
      if (!im) return new Response('Görsel yok', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
      // Kimlik rastgele ve görsel değişmez: 1 yıl saklanır. Doğrudan açılsa bile içinde betik çalışmaz (kum havuzu CSP + nosniff)
      return new Response(Uint8Array.from(atob(im.data), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': im.type, 'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox", 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
    }
    if (path === 'public/blog') {
      const limit = Math.min(50, Math.max(1, Number(q.limit) || 12)), page = Math.max(1, Math.min(1000, Number(q.page) || 1)), tag = str(q.tag).slice(0, 30);
      const where = `${live('p.')}${tag ? ' AND EXISTS (SELECT 1 FROM json_each(p.tags) WHERE lower(value) = lower(?))' : ''}`, args = [now, ...(tag ? [tag] : [])];
      const [rows, cnt, tags] = await Promise.all([
        all(db, `SELECT ${SHORT} ${FROM} WHERE ${where} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit),
        first(db, `SELECT COUNT(*) AS n FROM blog_posts p WHERE ${where}`, ...args),
        all(db, `SELECT j.value AS tag, COUNT(*) AS n FROM blog_posts p, json_each(p.tags) j WHERE ${live('p.')} GROUP BY lower(j.value) ORDER BY n DESC, j.value LIMIT 30`, now),
      ]);
      const total = cnt.n || 0;
      return json({ posts: rows.map((p) => card(p, base)), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), tag: tag || null, tags, site }, 200, { ...h, 'Cache-Control': CACHE });
    }
    if ((x = path.match(/^public\/blog\/post\/([a-z0-9-]{1,100})$/))) {
      const p = await first(db, `SELECT p.*, i.w AS cw, i.h AS ch ${FROM} WHERE p.slug = ? AND ${live('p.')}`, x[1], now);
      if (!p) return json({ error: 'Yazı bulunamadı' }, 404, { ...h, 'Cache-Control': 'public, max-age=30, s-maxage=60' });
      const ids = imageIds(p.body);
      const dims = new Map((ids.length ? await all(db, `SELECT id, w, h FROM blog_images WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids) : []).map((r) => [r.id, r]));
      const html = mdToHtml(p.body, { site, image: (id) => { const d = dims.get(id); return d ? { src: `${base}/api/public/blog/img/${id}`, w: d.w, h: d.h } : null; } });
      const more = await all(db, `SELECT ${SHORT} ${FROM} WHERE ${live('p.')} AND p.id != ? ORDER BY p.published_at DESC LIMIT 3`, now, p.id);
      return json({ post: { ...card(p, base), html, text: mdText(p.body).slice(0, 300), minutes: readMinutes(p.body), seo_title: p.seo_title || '', seo_desc: p.seo_desc || '', created_at: p.created_at },
        more: more.map((r) => card(r, base)), site }, 200, { ...h, 'Cache-Control': CACHE });
    }
    // RSS akışı ve site haritası parçası (bağlantılar tanıtım sitesine gider)
    if (path === 'public/blog/rss') {
      const rows = await all(db, `SELECT ${SHORT} ${FROM} WHERE ${live('p.')} ORDER BY p.published_at DESC LIMIT 20`, now);
      const items = rows.map((p) => { const c = card(p, base), link = `${site}/blog/${p.slug}`; return `<item><title>${xml(p.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate>${c.tags.map((t) => `<category>${xml(t)}</category>`).join('')}<description>${xml(c.summary)}</description>${c.cover ? `<enclosure url="${xml(`${site}/blog/img/${p.cover_id}`)}" type="${xml(p.ct)}" length="${p.cs || 0}"/>` : ''}</item>`; });
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Hastürk CRM Blog</title><link>${site}/blog</link><atom:link href="${site}/blog/rss.xml" rel="self" type="application/rss+xml"/><description>Pazaryeri satışı, kargo, stok ve kârlılık üzerine rehberler</description><language>tr-TR</language>${rows[0] ? `<lastBuildDate>${new Date(Math.max(...rows.map((r) => r.updated_at || r.published_at))).toUTCString()}</lastBuildDate>` : ''}\n${items.join('\n')}\n</channel></rss>\n`,
        { headers: { ...h, 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': CACHE } });
    }
    if (path === 'public/blog/sitemap') {
      const rows = await all(db, `SELECT slug, published_at, updated_at FROM blog_posts WHERE ${live()} ORDER BY published_at DESC LIMIT 5000`, now);
      const day = (ms) => new Date(ms).toISOString().slice(0, 10), last = rows.reduce((a, r) => Math.max(a, r.updated_at || 0, r.published_at || 0), 0);
      const urls = [`  <url><loc>${site}/blog</loc>${last ? `<lastmod>${day(last)}</lastmod>` : ''}</url>`, ...rows.map((r) => `  <url><loc>${site}/blog/${r.slug}</loc><lastmod>${day(Math.max(r.updated_at || 0, r.published_at || 0))}</lastmod></url>`)];
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, { headers: { ...h, 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE } });
    }
    return json({ error: 'Bulunamadı' }, 404, h);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, h);
    console.error(e);
    return json({ error: 'Sunucu hatası' }, 500, h);
  }
}
