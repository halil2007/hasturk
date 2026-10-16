// Tanıtım sitesinin blog sayfaları: /blog (liste), /blog/<adres> (yazı), /blog/img/<kimlik> (görsel), /blog/rss.xml, /blog/sitemap.xml;
// ayrıca yapay zekâ asistanları için /llms.txt ve /llms-full.txt (site özeti + yazı listesi). Yazılar panelden (panel.hasturkcrm.com/api/public/blog…,
// bkz. panel/src/blog.js) okunur ve sunucuda HTML'e çevrilir: arama motorları tam sayfayı görür. Diğer tüm adresler statik dosyalardır (public/),
// bu kod onlarda çalışmaz (wrangler.jsonc → run_worker_first). Sayfa kalıbı (üst menü, alt bilgi, meta etiketleri) ve llms.txt'nin sabit kısmı
// build.mjs'in ürettiği blog-shell.mjs'tendir: layout.html ya da sayfalar değişince `node build.mjs`. Panel adresi: config.js → panelUrl
// (derlemede alınır) ya da Worker değişkeni PANEL_URL.
// Panel yükü: her sayfa panelden TEK istekle çizilir (yazı + ilgili yazılar aynı yanıtta) ve Cloudflare önbelleğinde saklanır (aşağıda TTL).
import { SHELL, PANEL_URL, SITE_URL, ORG, LLMS, LLMS_FULL } from './blog-shell.mjs';

// Önbellek (Cloudflare Cache API, veri merkezi başına): [taze, bayat] saniye. Taze kopya panel sorulmadan sunulur; süresi geçince ziyaretçiye
// beklemeden eski kopya verilir ve arka planda panelden yenilenir (stale-while-revalidate). Panel yanıt vermezse bayat kopya sunulmaya devam eder.
// Liste 2 dk: 09:00'a planlanan yazı en geç ~2 dk içinde listede görünür. Yazı 10 dk: düzenleme en geç 10 dk'da yansır.
// Bulunamadı (404) 1 dk: ileri tarihli yazının adresi yayın anından en geç ~1 dk sonra açılır (öncesinde 404, yazı sızmaz).
const TTL = { list: [120, 7 * 86400], post: [600, 7 * 86400], miss: [60, 600], feed: [300, 86400], llms: [900, 86400], img: [31536000, 0] };
const CC = { list: 'public, max-age=60, s-maxage=120, stale-while-revalidate=600', post: 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600', miss: 'public, max-age=30, s-maxage=60',
  feed: 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600', llms: 'public, max-age=900, s-maxage=900, stale-while-revalidate=86400', img: 'public, max-age=31536000, immutable' };
const ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const BRAND = 'Hastürk CRM';
const DEFAULT_IMG = { src: `${SITE_URL}/img/og-hasturk-crm.jpg`, w: 1200, h: 630, alt: 'Hastürk CRM: pazaryeri ve e-ticaret satış yönetim paneli' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (id) => `<svg><use href="#${id}"/></svg>`;
const clip = (t, n = 155) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)).replace(/[,;:.]$/, '') + '…'; };
const dfmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
const iso = (ms) => new Date(ms).toISOString();
const ymd = (ms) => iso(ms).slice(0, 10);
const day = (ms) => `<time datetime="${iso(ms)}">${dfmt.format(new Date(ms))}</time>`;
// HTML → düz metin (JSON-LD, kelime sayısı, SSS cevapları için)
const txt = (h) => String(h || '').replace(/<br>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&(amp|lt|gt|quot|#39);/g, (_, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k]).replace(/\s+/g, ' ').trim();
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
  return new Response(SHELL.replace(/\{\{(T|D|U|R|O|I|IW|IH|IA|J|H|B)\}\}/g, (_, k) => v[k]), { status, headers: headers(env, { 'Cache-Control': status === 200 ? CC[m.kind || 'post'] : CC.miss }) });
}
const orgGraph = () => [ORG, { '@type': 'WebSite', '@id': `${SITE_URL}/#site`, url: `${SITE_URL}/`, name: BRAND, inLanguage: 'tr-TR', publisher: { '@id': ORG['@id'] } }];
const crumbs = (items) => ({ '@type': 'BreadcrumbList', '@id': `${items[items.length - 1][1]}#crumbs`, itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
const PUBLISHER = { '@type': 'Organization', '@id': ORG['@id'], name: BRAND, url: `${SITE_URL}/`, logo: ORG.logo && typeof ORG.logo === 'object' ? ORG.logo : { '@type': 'ImageObject', url: ORG.logo || `${SITE_URL}/assets/logo.webp` } };

// Yazı kartı (liste ve "ilgili yazılar")
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
  <div class="ctas"><a class="btn btn-primary" data-demo href="/demo">Canlı demoyu açın ${ico('i-arrow')}</a><a class="btn btn-outline" href="/demo#deneme">7 gün ücretsiz deneyin</a></div></div></div></section>`;
const RSS_LINK = `<link rel="alternate" type="application/rss+xml" title="${BRAND} Blog" href="/blog/rss.xml">`;

async function listPage(env, url) {
  const pg = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('sayfa'), 10) || 1)), tag = (url.searchParams.get('etiket') || '').slice(0, 30);
  const d = await panel(env, `?${new URLSearchParams({ page: pg, limit: 12, ...(tag ? { tag } : {}) })}`);
  if (!d) throw new Error('Panel blog listesi yok');
  const qs = (p) => { const s = new URLSearchParams({ ...(tag ? { etiket: tag } : {}), ...(p > 1 ? { sayfa: p } : {}) }).toString(); return `/blog${s ? '?' + s : ''}`; };
  const self = qs(pg), canonical = `${SITE_URL}${self}`;
  const tagName = tag && ((d.tags || []).find((t) => t.tag.toLocaleLowerCase('tr') === tag.toLocaleLowerCase('tr')) || {}).tag || tag;
  const posts = d.posts || [];
  const title = tag ? `${tagName} Yazıları | ${BRAND} Blog` : `Blog: Pazaryeri, Kargo ve Stok Rehberleri | ${BRAND}${pg > 1 ? ` (Sayfa ${pg})` : ''}`;
  // Sayfalarda açıklama da farklı olsun (arama motorunda yinelenen açıklama uyarısı çıkmaz)
  const desc = tag ? `${BRAND} blogunda "${tagName}" etiketli yazılar.` : `Trendyol, Hepsiburada ve diğer pazaryerlerinde sipariş, kargo, stok, fiyat ve kârlılık yönetimi üzerine pratik rehberler ve ipuçları.${pg > 1 ? ` Sayfa ${pg} / ${d.pages}.` : ''}`;
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
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE_URL}/blog/${p.slug}`, datePublished: iso(p.published_at), ...(p.cover ? { image: SITE_URL + localImg(p.cover) } : {}) })) },
    crumbs([['Ana sayfa', `${SITE_URL}/`], ['Blog', `${SITE_URL}/blog`], ...(tag ? [[tagName, canonical]] : [])])] };
  const head = [RSS_LINK, pg > 1 ? `<link rel="prev" href="${qs(pg - 1)}">` : '', pg < d.pages ? `<link rel="next" href="${qs(pg + 1)}">` : ''].join('');
  if (pg > d.pages && d.total) return notFound(env);
  return page(env, { title, description: desc, url: self, jsonld, head, body, kind: 'list', robots: tag ? 'noindex, follow' : ROBOTS });
}

// "Sık sorulan sorular" ara başlığı altındaki her alt başlık (soru) ve ardından gelen paragraflar (cevap) → FAQPage
function faqOf(html) {
  const m = /<h2 id="[^"]*">\s*(?:Sık(?:ça)? sorulan sorular|SSS)\b[^<]*<\/h2>([\s\S]*?)(?=<h2[\s>]|$)/i.exec(html);
  if (!m) return [];
  return m[1].split(/<h3[^>]*>/).slice(1).map((x) => { const [q, a = ''] = x.split('</h3>'); return [txt(q), txt(a)]; }).filter(([q, a]) => q && a).slice(0, 20);
}

async function postPage(env, slug) {
  const d = await panel(env, `/post/${slug}`);
  if (!d) return notFound(env);
  const p = d.post, url = `/blog/${p.slug}`, abs = SITE_URL + url, cover = localImg(p.cover), html = localImg(p.html);
  const desc = clip(p.seo_desc || p.summary || p.text);
  const img = cover ? { src: SITE_URL + cover, w: p.cover_w, h: p.cover_h, alt: p.title } : null;
  const isOrg = !p.author || /hast[uü]rk/i.test(p.author);
  const pub = p.published_at, mod = Math.max(p.updated_at || 0, pub), words = p.words || txt(html).split(' ').filter(Boolean).length;
  const share = encodeURIComponent(abs), stitle = encodeURIComponent(p.title);
  // İçindekiler: yazıdaki ara başlıklar (en az iki tane varsa; geniş ekranda yanda sabit, dar ekranda yazının başında açılır liste)
  const toc = [...String(html).matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '').trim()]).filter((x) => x[1]).slice(0, 14);
  const tocList = `<ol>${toc.map(([id, t]) => `<li><a href="#${esc(id)}">${t}</a></li>`).join('')}</ol>`;
  const tocHtml = toc.length >= 2 ? `<aside class="bl-toc" aria-label="Bu yazıda"><b>Bu yazıda</b>${tocList}</aside>` : '';
  const tocMob = toc.length >= 3 ? `<details class="bl-tocm"><summary>Bu yazıda (${toc.length} başlık)</summary>${tocList}</details>` : '';
  const faq = faqOf(html);
  // Yayın ve son güncelleme tarihi görünür (aynı günse yalnız biri)
  const dates = ymd(mod) !== ymd(pub) ? `<span>Yayın: ${day(pub)}</span><span>Güncellendi: ${day(mod)}</span>` : `<span>Yayın: ${day(pub)}</span>`;
  const body = `<div class="bl-progress" data-progress aria-hidden="true"></div><article class="bl-post">
  <header class="bl-head"><div class="wrap">
    <nav class="crumbs" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span><a href="/blog">Blog</a><span>›</span><b>${esc(clip(p.title, 60))}</b></nav>
    ${p.tags.length ? `<div class="bl-ptags">${p.tags.map((t) => `<a href="/blog?etiket=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
    <h1>${esc(p.title)}</h1>
    ${p.summary ? `<div class="bl-sum"><b>Özet</b><p>${esc(p.summary)}</p></div>` : ''}
    <div class="bl-meta"><span>Yazar: ${isOrg ? `<a href="/hakkimizda">${esc(p.author || BRAND)}</a>` : esc(p.author)}</span>${dates}<span>${p.minutes} dk okuma</span></div>
  </div></header>
  ${cover ? `<figure class="bl-cover"><img src="${esc(cover)}" alt="${esc(p.title)}"${p.cover_w ? ` width="${p.cover_w}" height="${p.cover_h}"` : ''} fetchpriority="high" decoding="async"></figure>` : ''}
  <div class="bl-body${tocHtml ? ' has-toc' : ''}"><div class="bl-main">${tocMob}<div class="bl-art">${html}</div>
  <div class="bl-author"><span class="bl-av">${esc((p.author || BRAND).slice(0, 1))}</span><div><b>${isOrg ? `<a href="/hakkimizda">${esc(p.author || `${BRAND} Ekibi`)}</a>` : esc(p.author)}</b><span>${isOrg ? 'Pazaryeri ve e-ticaret operasyonu üzerine yazıyoruz. Panelimizi kullanan satıcıların sahada karşılaştığı sorunlardan derliyoruz. <a href="/hakkimizda">Hakkımızda</a>' : `${BRAND} blog yazarı`}</span></div></div>
  <footer class="bl-foot">
    <div class="bl-share"><b>Paylaşın:</b><a href="https://wa.me/?text=${stitle}%20${share}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a><a href="https://x.com/intent/post?url=${share}&amp;text=${stitle}" target="_blank" rel="noopener">X</a><a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener">Facebook</a></div>
    <a class="bl-back" href="/blog">‹ Tüm yazılar</a>
  </footer></div>${tocHtml}</div>
</article>
${d.more && d.more.length ? `<section class="sec bl-list"><div class="wrap"><div class="sec-head"><div class="kicker">Blog</div><h2>İlgili Yazılar</h2></div><div class="bl-grid three">${d.more.map((x) => card(x)).join('')}</div></div></section>` : ''}
${ctaBand}`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [...orgGraph(),
    { '@type': 'WebPage', '@id': abs, url: abs, name: p.seo_title || p.title, description: desc, inLanguage: 'tr-TR', isPartOf: { '@id': `${SITE_URL}/#site` }, breadcrumb: { '@id': `${abs}#crumbs` },
      datePublished: iso(pub), dateModified: iso(mod), ...(img ? { primaryImageOfPage: { '@id': `${abs}#cover` } } : {}) },
    { '@type': 'BlogPosting', '@id': `${abs}#post`, mainEntityOfPage: { '@id': abs }, url: abs, headline: p.title.slice(0, 110), description: desc, inLanguage: 'tr-TR',
      datePublished: iso(pub), dateModified: iso(mod), ...(img ? { image: { '@type': 'ImageObject', '@id': `${abs}#cover`, url: img.src, ...(img.w ? { width: img.w, height: img.h } : {}) } } : {}),
      author: isOrg ? { '@type': 'Organization', '@id': ORG['@id'], name: BRAND, url: `${SITE_URL}/` } : { '@type': 'Person', name: p.author }, publisher: PUBLISHER, isPartOf: { '@id': `${SITE_URL}/blog#blog` },
      wordCount: words, timeRequired: `PT${p.minutes || 1}M`, ...(p.tags.length ? { keywords: p.tags.join(', '), articleSection: p.tags[0] } : {}) },
    crumbs([['Ana sayfa', `${SITE_URL}/`], ['Blog', `${SITE_URL}/blog`], [p.title, abs]]),
    ...(faq.length ? [{ '@type': 'FAQPage', '@id': `${abs}#faq`, isPartOf: { '@id': abs }, inLanguage: 'tr-TR', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : [])] };
  const head = [RSS_LINK, `<meta property="article:published_time" content="${iso(pub)}">`, `<meta property="article:modified_time" content="${iso(mod)}">`, `<meta property="og:updated_time" content="${iso(mod)}">`,
    `<meta property="article:author" content="${esc(p.author || BRAND)}">`, ...p.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`)].join('');
  const t = p.seo_title || p.title;
  return page(env, { title: /hast[uü]rk/i.test(t) ? t : `${t} | ${BRAND}`, description: desc, url, ogType: 'article', image: img, jsonld, head, body, kind: 'post' });
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
  if (r.status === 404) return new Response('Bulunamadı', { status: 404, headers: { 'Cache-Control': CC.miss } });
  if (!r.ok) throw new Error(`Panel yanıtı: HTTP ${r.status}`);
  const ct = r.headers.get('Content-Type') || '';
  if (type === 'image' && !/^image\/(webp|jpeg|png)$/.test(ct)) return new Response('Bulunamadı', { status: 404, headers: { 'Cache-Control': CC.miss } });
  return new Response(r.body, { headers: { 'Content-Type': type === 'image' ? ct : type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', ...(type === 'image' ? { 'Content-Security-Policy': "default-src 'none'; sandbox" } : {}) } });
}

// /llms.txt (llmstxt.org): yapay zekâ asistanlarının (ChatGPT, Claude, Gemini, Perplexity, Copilot …) siteyi doğru anlatıp kaynak gösterebilmesi için
// kısa özet. Sabit kısım (ürün, özellikler, entegrasyonlar, araçlar, fiyatlar) derlemede üretilir; blog bölümü panelden tek istekle eklenir.
// /llms-full.txt: aynı özet + ayrıntılı bilgiler (derlemede: kanal başına desteklenen işlemler, paketler, özellikler) + yayındaki tüm yazıların
// başlığı, adresi ve kısa özeti (yazı gövdesi yok; küçük kalır).
const md = (s) => String(s || '').replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')')).replace(/\s+/g, ' ').trim();
const LLMS_TAIL = `- [Blog](${SITE_URL}/blog): Pazaryeri, kargo, stok, fiyat ve kârlılık üzerine rehberler\n- [Blog RSS akışı](${SITE_URL}/blog/rss.xml)\n- [Blog site haritası](${SITE_URL}/blog/sitemap.xml)\n`;
const textRes = (body, cc) => new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': cc, 'X-Content-Type-Options': 'nosniff' } });
async function llms(env, full) {
  let d = await panel(env, '/index');
  if (!d) d = await panel(env, '?limit=50'); // panel henüz güncellenmediyse son 50 yazı
  const posts = (d && d.posts) || [], list = full ? posts : posts.slice(0, 30);
  const line = (p) => `- [${md(p.title)}](${SITE_URL}/blog/${p.slug}): ${md(clip(p.summary, 160))} (${ymd(p.published_at)})`;
  return textRes(`${LLMS}\n${full ? `${LLMS_FULL}\n` : ''}## Blog${full ? `: tüm yazılar (${posts.length})` : ': son yazılar'}\n\n${list.length ? list.map(line).join('\n') + '\n' : ''}${LLMS_TAIL}`
    + (full ? '' : `\n## Optional\n\n- [Tüm blog yazıları](${SITE_URL}/llms-full.txt): ${posts.length} yazının başlığı, adresi ve özeti\n`), CC.llms);
}

// IndexNow (Bing, Yandex, Seznam, Naver …; api.indexnow.org katılımcı arama motorlarının hepsine iletir): yayına giren ya da değişen yazılar
// zamanlayıcıyla (wrangler.jsonc → triggers.crons, 15 dk) bildirilir; her çalışmada panelden tek istek, yalnız son 15 dakikanın yazıları.
// KURULUM (bir kez): Cloudflare → Workers & Pages → hasturk-site → Settings → Variables and Secrets → INDEXNOW_KEY = 8–128 harf / rakam
// (ör. `openssl rand -hex 16`). Anahtar dosyası /blog/<anahtar>.txt adresinden sunulur (keyLocation). Değişken yoksa hiçbir şey yapılmaz.
const INDEXNOW_EVERY = 15 * 60e3, KEY_RE = /^[A-Za-z0-9-]{8,128}$/;
const indexKey = (env) => { const k = String((env && env.INDEXNOW_KEY) || '').trim(); return KEY_RE.test(k) ? k : ''; };
async function indexNow(env, at) {
  const key = indexKey(env);
  if (!key) return null;
  const d = await panel(env, `/index?since=${at - INDEXNOW_EVERY}`);
  const list = ((d && d.posts) || []).filter((p) => Math.max(p.published_at, p.updated_at || 0) <= at);
  if (!list.length) return { sent: 0 };
  const urlList = [`${SITE_URL}/blog`, ...list.map((p) => `${SITE_URL}/blog/${p.slug}`)].slice(0, 10000);
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key, keyLocation: `${SITE_URL}/blog/${key}.txt`, urlList }) });
  if (!r.ok) console.error('IndexNow', r.status, await r.text().catch(() => ''));
  return { sent: urlList.length, status: r.status };
}

async function route(env, url) {
  const p = url.pathname;
  let m;
  if (p === '/llms.txt' || p === '/llms-full.txt') return llms(env, p === '/llms-full.txt');
  if (p === '/blog') return listPage(env, url);
  if (p === '/blog/rss.xml') return passthrough(env, '/rss', 'application/rss+xml; charset=utf-8', CC.feed);
  if (p === '/blog/sitemap.xml') return passthrough(env, '/sitemap', 'application/xml; charset=utf-8', CC.feed);
  if ((m = /^\/blog\/img\/([a-f0-9]{16,32})$/.exec(p))) return passthrough(env, `/img/${m[1]}`, 'image', CC.img);
  if ((m = /^\/blog\/([A-Za-z0-9-]{8,128})\.txt$/.exec(p)) && indexKey(env) && m[1] === indexKey(env)) return textRes(m[1], 'public, max-age=3600');
  if ((m = /^\/blog\/([a-z0-9-]{1,100})$/.exec(p))) return postPage(env, m[1]);
  // Eski / büyük harfli adres: küçük harfli adrese yönlendir (Türkçe karakterli yazımlar dahil değil)
  if ((m = /^\/blog\/([A-Za-z0-9-]{1,100})$/.exec(p))) return Response.redirect(`${url.origin}/blog/${m[1].toLowerCase()}`, 301);
  return notFound(env);
}
const kindOf = (p, status) => (status === 404 ? 'miss' : p === '/blog' ? 'list' : p.startsWith('/blog/img/') ? 'img' : /^\/llms/.test(p) ? 'llms' : /\.(xml|txt)$/.test(p) ? 'feed' : 'post');

// Önbellek kaydı: saklama süresi taze + bayat; ziyaretçiye giden Cache-Control (X-CC) ve kayıt anı (X-At) başlıkta saklanır
async function store(cache, ck, res, kind) {
  const [fresh, stale] = TTL[kind], h = new Headers(res.headers);
  h.set('X-CC', h.get('Cache-Control') || CC[kind]); h.set('X-At', String(Date.now())); h.set('X-Kind', kind); h.set('Cache-Control', `public, max-age=${fresh + stale}`);
  await cache.put(ck, new Response(res.body, { status: res.status, headers: h }));
}
function serve(res, state, age) {
  const h = new Headers(res.headers);
  if (h.get('X-CC')) h.set('Cache-Control', h.get('X-CC'));
  for (const k of ['X-CC', 'X-At', 'X-Kind']) h.delete(k);
  h.set('X-Cache', state); if (age != null) h.set('Age', String(Math.max(0, Math.floor(age))));
  return new Response(res.body, { status: res.status, headers: h });
}
// Panelden çiz + önbelleğe yaz (200 ve 404; hata yanıtları saklanmaz)
async function render(env, url, cache, ck, ctx) {
  const res = await route(env, url);
  if (cache && (res.status === 200 || res.status === 404)) {
    const job = store(cache, ck, res.clone(), kindOf(url.pathname, res.status));
    if (ctx) ctx.waitUntil(job.catch((e) => console.error('önbellek', e))); else await job;
  }
  return res;
}
const refreshing = new Set(); // aynı adres için eşzamanlı ikinci yenileme başlatılmaz (bu örnek içinde)

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), path = url.pathname;
    if (path !== '/blog' && !path.startsWith('/blog/') && path !== '/llms.txt' && path !== '/llms-full.txt') return env.ASSETS.fetch(req);
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Yalnız GET', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (path.length > 5 && path.endsWith('/')) return Response.redirect(`${url.origin}${path.replace(/\/+$/, '')}${url.search}`, 301);
    // Önbellek anahtarı: yalnız anlamlı sorgu parametreleri (utm_… gibi takip parametreleri aynı sayfayı paylaşır)
    const key = new URL(url.origin + path);
    if (path === '/blog') for (const k of ['sayfa', 'etiket']) if (url.searchParams.get(k)) key.searchParams.set(k, url.searchParams.get(k));
    const cache = typeof caches !== 'undefined' && caches.default, ck = new Request(key.toString());
    const hit = cache ? await cache.match(ck) : null;
    let res;
    if (hit) {
      const age = (Date.now() - Number(hit.headers.get('X-At') || 0)) / 1000, [fresh] = TTL[hit.headers.get('X-Kind')] || TTL.post;
      if (age >= fresh && ctx && !refreshing.has(ck.url)) {
        refreshing.add(ck.url);
        ctx.waitUntil(render(env, key, cache, ck).catch((e) => console.error('blog yenileme', e)).finally(() => refreshing.delete(ck.url)));
      }
      res = serve(hit, age < fresh ? 'HIT' : 'STALE', age);
    } else {
      try { res = serve(await render(env, key, cache, ck, ctx), 'MISS'); } catch (e) {
        console.error('blog', e);
        // llms.txt panel açılmasa da sabit kısmıyla sunulur
        res = path.startsWith('/llms') ? textRes(`${LLMS}\n${path === '/llms-full.txt' ? `${LLMS_FULL}\n` : ''}## Blog\n\n${LLMS_TAIL}`, 'public, max-age=60') : unavailable(env);
      }
    }
    return req.method === 'HEAD' ? new Response(null, res) : res;
  },
  async scheduled(ev, env, ctx) {
    ctx.waitUntil(indexNow(env, ev.scheduledTime || Date.now()).then((r) => r && r.sent && console.log('IndexNow', JSON.stringify(r))).catch((e) => console.error('IndexNow', e)));
  },
};
