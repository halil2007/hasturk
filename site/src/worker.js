// Tanıtım sitesinin blog sayfaları: /blog (liste), /blog/<adres> (yazı), /blog/img/<kimlik> (görsel), /blog/rss.xml, /blog/sitemap.xml.
// Yazılar panelden (panel.hasturkcrm.com/api/public/blog…, bkz. panel/src/blog.js) okunur ve sunucuda HTML'e çevrilir: arama motorları
// tam sayfayı görür. Diğer tüm adresler statik dosyalardır (public/), bu kod onlarda çalışmaz (wrangler.jsonc → run_worker_first).
// Sayfa kalıbı (üst menü, alt bilgi, meta etiketleri) build.mjs'in ürettiği blog-shell.mjs'tendir: layout.html değişince `node build.mjs`.
// Önbellek: sayfalar Cloudflare'de 5 dk, görseller 1 yıl saklanır; panel her ziyarette sorgulanmaz. Panel adresi: config.js → panelUrl
// (derlemede alınır) ya da Worker değişkeni PANEL_URL.
import { SHELL, PANEL_URL, SITE_URL, ORG } from './blog-shell.mjs';

const PAGE_CACHE = 'public, max-age=60, s-maxage=300';
const ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const BRAND = 'Hastürk CRM';
const DEFAULT_IMG = { src: `${SITE_URL}/img/genel-bakis.jpg`, w: 1440, h: 900, alt: 'Hastürk CRM panelinin genel bakış ekranı' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (id) => `<svg><use href="#${id}"/></svg>`;
const clip = (t, n = 155) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,;:.]$/, '') + '…'; };
const dfmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
const day = (ms) => `<time datetime="${new Date(ms).toISOString()}">${dfmt.format(new Date(ms))}</time>`;
// Panelin görsel adresi → sitenin kendi adresi (/blog/img/…): aynı alan adından, önbellekli
const IMG_RE = /https?:\/\/[^"'\s)]+\/api\/public\/blog\/img\/([a-f0-9]{16,32})/g;
const localImg = (s) => String(s || '').replace(IMG_RE, '/blog/img/$1');
const panelBase = (env) => String((env && env.PANEL_URL) || PANEL_URL).replace(/\/+$/, '');
const headers = (env, extra = {}) => ({ 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://challenges.cloudflare.com https://static.cloudflareinsights.com; connect-src 'self' ${panelBase(env)} https://challenges.cloudflare.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://www.google.com https://www.google.com.tr https://google.com https://www.googleadservices.com https://pagead2.googlesyndication.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com https://td.doubleclick.net https://bid.g.doubleclick.net https://www.googletagmanager.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`, ...extra });

async function panel(env, path) {
  const r = await fetch(`${panelBase(env)}/api/public/blog${path}`, { headers: { Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Panel yanıtı: HTTP ${r.status}`);
  return r.json();
}

// Kalıba yerleştir (tek geçişte; yazı içeriğindeki {{…}} metinleri dokunulmadan kalır)
function page(env, m, status = 200) {
  const img = m.image || DEFAULT_IMG;
  const v = { T: esc(m.title), D: esc(m.description), U: m.url, R: m.robots || ROBOTS, O: m.ogType || 'website', I: esc(img.src), IW: img.w || 1200, IH: img.h || 630, IA: esc(img.alt || m.title),
    J: JSON.stringify(m.jsonld).replace(/</g, '\\u003c'), H: m.head || '', B: m.body };
  return new Response(SHELL.replace(/\{\{(T|D|U|R|O|I|IW|IH|IA|J|H|B)\}\}/g, (_, k) => v[k]), { status, headers: headers(env, { 'Cache-Control': status === 200 ? PAGE_CACHE : 'public, max-age=30, s-maxage=60' }) });
}
const orgGraph = () => [ORG, { '@type': 'WebSite', '@id': `${SITE_URL}/#site`, url: `${SITE_URL}/`, name: BRAND, inLanguage: 'tr-TR', publisher: { '@id': ORG['@id'] } }];
const crumbs = (items) => ({ '@type': 'BreadcrumbList', '@id': `${items[items.length - 1][1]}#crumbs`, itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });

// Yazı kartı (liste ve "diğer yazılar")
function card(p, feat = false) {
  const href = `/blog/${p.slug}`, cover = localImg(p.cover);
  return `<article class="bl-card${feat ? ' feat' : ''}">
  <a class="bl-cimg" href="${href}" tabindex="-1" aria-hidden="true">${cover ? `<img src="${esc(cover)}" alt=""${p.cover_w ? ` width="${p.cover_w}" height="${p.cover_h}"` : ''} loading="${feat ? 'eager' : 'lazy'}" decoding="async"${feat ? ' fetchpriority="high"' : ''}>` : `<span class="bl-ph">${esc(p.title.slice(0, 1))}</span>`}</a>
  <div class="bl-cbody"><div class="bl-meta">${day(p.published_at)}${p.tags[0] ? ` · <a href="/blog?etiket=${encodeURIComponent(p.tags[0])}">${esc(p.tags[0])}</a>` : ''}</div>
    <h${feat ? 2 : 3}><a href="${href}">${esc(p.title)}</a></h${feat ? 2 : 3}><p>${esc(clip(p.summary, feat ? 260 : 170))}</p>
    <a class="bl-more" href="${href}">Devamını okuyun ${ico('i-arrow')}</a></div>
</article>`;
}
const ctaBand = `<section class="sec alt"><div class="wrap"><div class="ask big"><div><b>Pazaryeri satışlarınızı tek panelden yönetin</b><span>Siparişler, kargo etiketleri, stok ve kârlılık tek ekranda. Kayıt olmadan demo panelini açın; beğenirseniz 7 gün ücretsiz kullanın.</span></div>
  <div class="ctas"><a class="btn btn-primary" data-demo href="/demo">Canlı demoyu açın ${ico('i-arrow')}</a><a class="btn btn-outline" data-call href="/iletisim">${ico('i-phone')}Hemen arayın</a></div></div></div></section>`;
const RSS_LINK = `<link rel="alternate" type="application/rss+xml" title="${BRAND} Blog" href="/blog/rss.xml">`;

async function listPage(env, url) {
  const pg = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('sayfa'), 10) || 1)), tag = (url.searchParams.get('etiket') || '').slice(0, 30);
  const d = await panel(env, `?${new URLSearchParams({ page: pg, limit: 12, ...(tag ? { tag } : {}) })}`);
  const qs = (p) => { const s = new URLSearchParams({ ...(tag ? { etiket: tag } : {}), ...(p > 1 ? { sayfa: p } : {}) }).toString(); return `/blog${s ? '?' + s : ''}`; };
  const self = qs(pg), canonical = `${SITE_URL}${self}`;
  const tagName = tag && ((d.tags || []).find((t) => t.tag.toLocaleLowerCase('tr') === tag.toLocaleLowerCase('tr')) || {}).tag || tag;
  const posts = d.posts || [];
  const title = tag ? `${tagName} Yazıları | ${BRAND} Blog` : `Blog: Pazaryeri, Kargo ve Stok Rehberleri | ${BRAND}${pg > 1 ? ` (Sayfa ${pg})` : ''}`;
  const desc = tag ? `${BRAND} blogunda "${tagName}" etiketli yazılar.` : 'Trendyol, Hepsiburada ve diğer pazaryerlerinde sipariş, kargo, stok, fiyat ve kârlılık yönetimi üzerine pratik rehberler ve ipuçları.';
  const body = `<section class="bl-hero"><div class="wrap">
  <nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span>${tag ? `<a href="/blog">Blog</a><span>›</span><b>${esc(tagName)}</b>` : '<b>Blog</b>'}</nav>
  <div class="bl-hero-row"><div><h1>${tag ? esc(tagName) : `${BRAND} Blog`}</h1>
  <p>${tag ? `"${esc(tagName)}" etiketli ${d.total} yazı.` : 'E-ticaret operasyonu üzerine rehberler: pazaryeri yönetimi, kargo, stok, fiyatlandırma ve kârlılık. Ekibimizin sahadaki deneyiminden, uygulanabilir ve kısa.'}</p></div>
  <a class="bl-rss" href="/blog/rss.xml" title="RSS ile takip edin">RSS</a></div>
  ${(d.tags || []).length ? `<div class="bl-tagbar"><a href="/blog"${tag ? '' : ' class="on" aria-current="page"'}>Tümü</a>${d.tags.slice(0, 12).map((t) => `<a href="/blog?etiket=${encodeURIComponent(t.tag)}"${t.tag.toLocaleLowerCase('tr') === tag.toLocaleLowerCase('tr') ? ' class="on" aria-current="page"' : ''}>${esc(t.tag)}</a>`).join('')}</div>` : ''}
</div></section>
<section class="sec bl-list"><div class="wrap">
  ${posts.length ? `<div class="bl-grid">${posts.map((p, i) => card(p, i === 0 && pg === 1 && !tag)).join('')}</div>` : '<div class="bl-empty"><b>Henüz yazı yok</b><span>Yakında burada pazaryeri satışı üzerine rehberler yayınlayacağız.</span></div>'}
  ${d.pages > 1 ? `<nav class="bl-pager" aria-label="Sayfalar">${pg > 1 ? `<a class="btn btn-line" href="${qs(pg - 1)}" rel="prev">‹ Önceki</a>` : '<span></span>'}<span>Sayfa ${pg} / ${d.pages}</span>${pg < d.pages ? `<a class="btn btn-line" href="${qs(pg + 1)}" rel="next">Sonraki ›</a>` : '<span></span>'}</nav>` : ''}
</div></section>
${ctaBand}`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [...orgGraph(),
    { '@type': 'Blog', '@id': `${SITE_URL}/blog#blog`, url: `${SITE_URL}/blog`, name: `${BRAND} Blog`, description: desc, inLanguage: 'tr-TR', publisher: { '@id': ORG['@id'] },
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE_URL}/blog/${p.slug}`, datePublished: new Date(p.published_at).toISOString(), ...(p.cover ? { image: SITE_URL + localImg(p.cover) } : {}) })) },
    crumbs([['Ana sayfa', `${SITE_URL}/`], ['Blog', `${SITE_URL}/blog`], ...(tag ? [[tagName, canonical]] : [])])] };
  const head = [RSS_LINK, pg > 1 ? `<link rel="prev" href="${qs(pg - 1)}">` : '', pg < d.pages ? `<link rel="next" href="${qs(pg + 1)}">` : ''].join('');
  if (pg > d.pages && d.total) return notFound(env);
  return page(env, { title, description: desc, url: self, jsonld, head, body, robots: tag ? 'noindex, follow' : ROBOTS });
}

async function postPage(env, slug) {
  const d = await panel(env, `/post/${slug}`);
  if (!d) return notFound(env);
  const p = d.post, url = `/blog/${p.slug}`, abs = SITE_URL + url, cover = localImg(p.cover);
  const desc = clip(p.seo_desc || p.summary || p.text);
  const img = cover ? { src: SITE_URL + cover, w: p.cover_w, h: p.cover_h, alt: p.title } : null;
  const isOrg = !p.author || /hast[uü]rk/i.test(p.author);
  const share = encodeURIComponent(abs), stitle = encodeURIComponent(p.title);
  // İçindekiler: yazıdaki ara başlıklar (en az iki tane varsa; geniş ekranda yanda sabit)
  const toc = [...String(p.html).matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').trim()]).filter((x) => x[1]).slice(0, 14);
  const tocHtml = toc.length >= 2 ? `<aside class="bl-toc" aria-label="Bu yazıda"><b>Bu yazıda</b><ol>${toc.map(([id, t]) => `<li><a href="#${esc(id)}">${esc(t)}</a></li>`).join('')}</ol></aside>` : '';
  const body = `<div class="bl-progress" data-progress aria-hidden="true"></div><article class="bl-post">
  <header class="bl-head"><div class="wrap">
    <nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span><a href="/blog">Blog</a><span>›</span><b>${esc(clip(p.title, 60))}</b></nav>
    ${p.tags.length ? `<div class="bl-ptags">${p.tags.map((t) => `<a href="/blog?etiket=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
    <h1>${esc(p.title)}</h1>
    ${p.summary ? `<p class="bl-lead">${esc(p.summary)}</p>` : ''}
    <div class="bl-meta"><span>${esc(p.author || BRAND)}</span><span>${day(p.published_at)}</span><span>${p.minutes} dk okuma</span></div>
  </div></header>
  ${cover ? `<figure class="bl-cover"><img src="${esc(cover)}" alt="${esc(p.title)}"${p.cover_w ? ` width="${p.cover_w}" height="${p.cover_h}"` : ''} fetchpriority="high" decoding="async"></figure>` : ''}
  <div class="bl-body${tocHtml ? ' has-toc' : ''}"><div class="bl-main"><div class="bl-art">${localImg(p.html).replace(/<img /g, '<img decoding="async" ')}</div>
  <div class="bl-author"><span class="bl-av">${esc((p.author || BRAND).slice(0, 1))}</span><div><b>${esc(p.author || `${BRAND} Ekibi`)}</b><span>${isOrg ? 'Pazaryeri ve e-ticaret operasyonu üzerine yazıyoruz. Panelimizi kullanan satıcıların sahada karşılaştığı sorunlardan derliyoruz.' : `${BRAND} blog yazarı`}</span></div></div>
  <footer class="bl-foot">
    <div class="bl-share"><b>Paylaşın:</b><a href="https://wa.me/?text=${stitle}%20${share}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a><a href="https://x.com/intent/post?url=${share}&amp;text=${stitle}" target="_blank" rel="noopener">X</a><a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener">Facebook</a></div>
    <a class="bl-back" href="/blog">‹ Tüm yazılar</a>
  </footer></div>${tocHtml}</div>
</article>
${d.more && d.more.length ? `<section class="sec bl-list"><div class="wrap"><div class="sec-head"><div class="kicker">Blog</div><h2>Diğer Yazılar</h2></div><div class="bl-grid three">${d.more.map((x) => card(x)).join('')}</div></div></section>` : ''}
${ctaBand}`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [...orgGraph(),
    { '@type': 'BlogPosting', '@id': `${abs}#post`, mainEntityOfPage: { '@type': 'WebPage', '@id': abs }, url: abs, headline: p.title.slice(0, 110), description: desc, inLanguage: 'tr-TR',
      datePublished: new Date(p.published_at).toISOString(), dateModified: new Date(Math.max(p.updated_at || 0, p.published_at)).toISOString(), ...(img ? { image: [img.src] } : {}),
      author: isOrg ? { '@id': ORG['@id'] } : { '@type': 'Person', name: p.author }, publisher: { '@id': ORG['@id'] }, isPartOf: { '@id': `${SITE_URL}/blog#blog` },
      ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}) },
    crumbs([['Ana sayfa', `${SITE_URL}/`], ['Blog', `${SITE_URL}/blog`], [p.title, abs]])] };
  const head = [RSS_LINK, `<meta property="article:published_time" content="${new Date(p.published_at).toISOString()}">`, `<meta property="article:modified_time" content="${new Date(Math.max(p.updated_at || 0, p.published_at)).toISOString()}">`,
    ...p.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`)].join('');
  return page(env, { title: `${p.seo_title || p.title} | ${BRAND}`, description: desc, url, ogType: 'article', image: img, jsonld, head, body });
}

function notFound(env) {
  return page(env, { title: `Yazı bulunamadı | ${BRAND}`, description: 'Aradığınız yazı bulunamadı.', url: '/blog', robots: 'noindex, follow', jsonld: { '@context': 'https://schema.org', '@graph': orgGraph() },
    body: '<div class="legal" style="text-align:center;padding-top:96px"><h1>Yazı bulunamadı</h1><p>Aradığınız yazı kaldırılmış ya da adresi değişmiş olabilir.</p><p style="margin-top:24px"><a class="btn btn-primary" href="/blog">Tüm yazılar</a></p></div>' }, 404);
}
function unavailable(env) {
  const r = page(env, { title: `Blog | ${BRAND}`, description: 'Blog şu an açılamıyor.', url: '/blog', robots: 'noindex, follow', jsonld: { '@context': 'https://schema.org', '@graph': orgGraph() },
    body: '<div class="legal" style="text-align:center;padding-top:96px"><h1>Blog şu an açılamıyor</h1><p>Lütfen birkaç dakika sonra tekrar deneyin.</p><p style="margin-top:24px"><a class="btn btn-primary" href="/">Ana sayfa</a></p></div>' }, 503);
  r.headers.set('Cache-Control', 'no-store'); r.headers.set('Retry-After', '120');
  return r;
}

// Görsel, RSS ve site haritası: panelden olduğu gibi (görsel türü denetlenir)
async function passthrough(env, path, type, cache) {
  const r = await fetch(`${panelBase(env)}/api/public/blog${path}`);
  if (!r.ok) return new Response('Bulunamadı', { status: r.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'public, max-age=60' } });
  const ct = r.headers.get('Content-Type') || '';
  if (type === 'image' && !/^image\/(webp|jpeg|png)$/.test(ct)) return new Response('Bulunamadı', { status: 404 });
  return new Response(r.body, { headers: { 'Content-Type': type === 'image' ? ct : type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', ...(type === 'image' ? { 'Content-Security-Policy': "default-src 'none'; sandbox" } : {}) } });
}

async function route(env, url) {
  const p = url.pathname;
  let m;
  if (p === '/blog') return listPage(env, url);
  if (p === '/blog/rss.xml') return passthrough(env, '/rss', 'application/rss+xml; charset=utf-8', PAGE_CACHE);
  if (p === '/blog/sitemap.xml') return passthrough(env, '/sitemap', 'application/xml; charset=utf-8', 'public, max-age=600, s-maxage=1800');
  if ((m = /^\/blog\/img\/([a-f0-9]{16,32})$/.exec(p))) return passthrough(env, `/img/${m[1]}`, 'image', 'public, max-age=31536000, immutable');
  if ((m = /^\/blog\/([a-z0-9-]{1,100})$/.exec(p))) return postPage(env, m[1]);
  // Eski / büyük harfli adres: küçük harfli adrese yönlendir (Türkçe karakterli yazımlar dahil değil)
  if ((m = /^\/blog\/([A-Za-z0-9-]{1,100})$/.exec(p))) return Response.redirect(`${url.origin}/blog/${m[1].toLowerCase()}`, 301);
  return notFound(env);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname !== '/blog' && !url.pathname.startsWith('/blog/')) return env.ASSETS.fetch(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Yalnız GET', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname.length > 5 && url.pathname.endsWith('/')) return Response.redirect(`${url.origin}${url.pathname.replace(/\/+$/, '')}${url.search}`, 301);
    // Önbellek anahtarı: yalnız anlamlı sorgu parametreleri (utm_… gibi takip parametreleri aynı sayfayı paylaşır)
    const key = new URL(url.origin + url.pathname);
    for (const k of ['sayfa', 'etiket']) if (url.searchParams.get(k)) key.searchParams.set(k, url.searchParams.get(k));
    const cache = typeof caches !== 'undefined' && caches.default, ck = new Request(key.toString());
    let res = cache ? await cache.match(ck) : null;
    if (!res) {
      try { res = await route(env, key); } catch (e) { console.error('blog', e); return unavailable(env); }
      if (cache && (res.status === 200 || res.status === 404) && ctx) ctx.waitUntil(cache.put(ck, res.clone()));
    }
    return req.method === 'HEAD' ? new Response(null, res) : res;
  },
};
