// Arama motoru / yapay zekâ görünürlüğü değişmezleri: derlenmiş public/ klasörünü okur (önce `node build.mjs`).
// Her sayfa: başlık, açıklama, canonical, tek H1, Open Graph / X kartı, geçerli JSON-LD; site haritası; kırık iç bağlantı; JS'siz okunabilen
// fiyat ve şirket bilgileri; robots.txt, llms.txt ve IndexNow anahtarı. Çalıştırma: cd site && node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { analyze, MIN_WORDS } from '../scripts/similarity.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), PUB = join(ROOT, 'public'), SITE = 'https://hasturkcrm.com';
const S = (() => { const ctx = { window: {}, document: { documentElement: { classList: { add() {} } } } }; vm.runInNewContext(readFileSync(join(PUB, 'assets', 'config.js'), 'utf8'), ctx); return ctx.window.SITE; })();
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = (h) => decode(h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const meta = (h, attr, name) => { const m = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(h); return m ? decode(m[1]) : undefined; };
const NOINDEX = ['/404', '/odeme-basarili', '/siparis-alindi', '/satin-al'];

const pages = walk(PUB).filter((f) => f.endsWith('.html')).map((f) => {
  const url = '/' + relative(PUB, f).replace(/\\/g, '/').replace(/\.html$/, '').replace(/^index$/, '');
  const html = readFileSync(f, 'utf8');
  return { url, html, noindex: /<meta name="robots" content="noindex/.test(html) };
});
const byUrl = Object.fromEntries(pages.map((p) => [p.url, p]));
const indexable = pages.filter((p) => !p.noindex);
const ld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (h) => ld(h).flatMap((x) => x['@graph'] || [x]);

test('her sayfa: dil, viewport, başlık, açıklama, canonical, tek H1', () => {
  assert.ok(pages.length > 70, `${pages.length} sayfa`);
  for (const { url, html, noindex } of pages) {
    assert.match(html, /^<!doctype html>\s*<html lang="tr">/i, url);
    assert.match(html, /<meta name="viewport" content="width=device-width/, url);
    const title = decode((/<title>([^<]+)<\/title>/.exec(html) || [])[1] || ''), desc = meta(html, 'name', 'description') || '';
    assert.ok(title, `${url}: başlık yok`);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${url}: tek H1 olmalı`);
    assert.equal((html.match(/<link rel="canonical"/g) || []).length, 1, `${url}: tek canonical`);
    const canon = (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1];
    assert.ok(/^https:\/\/hasturkcrm\.com\//.test(canon) && !/\.html$/.test(canon) && !/.\/$/.test(new URL(canon).pathname), `${url}: canonical ${canon}`);
    assert.match(html, /<meta name="robots" content="[^"]+">/, url);
    assert.doesNotMatch(html, /noarchive|nocache|nosnippet/, `${url}: önizleme / arşiv engeli olmamalı`);
    if (noindex) continue;
    assert.equal(canon, SITE + (url === '/' ? '/' : url), `${url}: canonical kendi adresi olmalı`);
    assert.ok(title.length <= 60, `${url}: başlık ${title.length} karakter (en çok 60): ${title}`);
    assert.ok(desc.length >= 110 && desc.length <= 160, `${url}: açıklama ${desc.length} karakter (110–160): ${desc}`);
  }
  for (const u of NOINDEX) assert.ok(byUrl[u] && byUrl[u].noindex, `${u} noindex olmalı`);
});

test('başlık ve açıklamalar sayfalar arasında tekrar etmez', () => {
  for (const k of ['title', 'description']) {
    const seen = new Map();
    for (const { url, html } of indexable) {
      const v = k === 'title' ? (/<title>([^<]+)/.exec(html) || [])[1] : meta(html, 'name', 'description');
      assert.ok(!seen.has(v), `${k} tekrarı: ${url} ve ${seen.get(v)}`); seen.set(v, url);
    }
  }
});

// Sayfalar birbirinin adı değiştirilmiş kopyası olmamalı (Google: scaled content abuse / yinelenen içerik). Ölçüm scripts/similarity.mjs'te:
// marka ve sayfanın kendi adı (ör. "Koçtaş", "Koçtaş'a") maskelenip karşılaştırılır.
const SIM = analyze(PUB);
test('başlık ve açıklamalar sayfanın kendi adı çıkarılınca da birbirinin aynısı değil', () => {
  assert.deepEqual(SIM.dupTitle.map(([a, b, v]) => `${a} = ${b}: ${v}`), [], 'ad değiştirilmiş aynı başlık');
  assert.deepEqual(SIM.dupDesc.map(([a, b, v]) => `${a} = ${b}: ${v}`), [], 'ad değiştirilmiş aynı açıklama');
  // Çok benzer açıklama (kelime ikilileri Jaccard): şablondan üretilmiş açıklama yakalanır
  const near = SIM.pairs.filter((p) => p.desc > 0.5).map((p) => `${p.a} ↔ ${p.b}: ${p.desc.toFixed(2)}`);
  assert.deepEqual(near, [], 'çok benzer açıklama');
});

test('aynı ailedeki sayfaların gövde metni birbirine benzemez (3 kelimelik Jaccard)', () => {
  // Entegrasyon sayfaları (kanal + kargo): en çok 0,20 (yeniden yazımdan sonra en yüksek ~0,08); diğer aileler en çok 0,35
  const LIMIT = { entegrasyonlar: 0.2 };
  const over = SIM.pairs.filter((p) => p.body > (LIMIT[p.fam] ?? 0.35)).map((p) => `${p.fam}: ${p.a} ↔ ${p.b} ${p.body.toFixed(3)}`);
  assert.deepEqual(over, []);
  assert.ok((SIM.fams.entegrasyonlar || []).length >= 30, 'entegrasyon sayfaları ölçüldü');
});

test(`entegrasyon ve özellik sayfalarında aynı cümle iki sayfada geçmez (${MIN_WORDS}+ kelime)`, () => {
  // Gezinme ızgaraları (diğer entegrasyonlar, ilgili özellikler) hariç; sayfa sonundaki çağrı bandı dahil.
  // Entegrasyon ailesine Kargonomi sayfası (/ozellikler/kargonomi-entegrasyonu) da katılır.
  for (const fam of ['entegrasyonlar', 'ozellikler']) {
    const dup = SIM.sentDup[fam].map(([x, u]) => `${u.join(', ')}: "${x}"`);
    assert.deepEqual(dup, [], `${fam}: tekrarlanan cümle`);
  }
  assert.ok(SIM.pages.some((p) => p.url === '/ozellikler/kargonomi-entegrasyonu'), 'Kargonomi sayfası denetlendi');
});

test('başlık sırası atlanmaz (H1 → H2 → H3 …)', () => {
  for (const { url, html } of pages) {
    let prev = 1;
    for (const [, n] of html.slice(html.indexOf('<main>')).matchAll(/<h([1-6])[\s>]/g)) {
      assert.ok(+n <= prev + 1, `${url}: h${prev} → h${n}`); prev = +n;
    }
  }
});

test('Open Graph ve X kartı', () => {
  for (const { url, html } of pages) {
    for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) assert.ok(meta(html, 'property', p), `${url}: ${p}`);
    assert.equal(meta(html, 'property', 'og:locale'), 'tr_TR', url);
    assert.equal(meta(html, 'property', 'og:url'), (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1], `${url}: og:url = canonical`);
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image', url);
    const img = meta(html, 'property', 'og:image');
    assert.match(img, /^https:\/\/hasturkcrm\.com\//, url);
    assert.ok(existsSync(join(PUB, new URL(img).pathname)), `${url}: paylaşım görseli yok: ${img}`);
  }
  const og = readFileSync(join(PUB, 'img', 'og-hasturk-crm.jpg'));
  // JPEG SOF0/SOF2 içindeki boyut: 1200×630
  const i = og.findIndex((b, k) => b === 0xff && (og[k + 1] === 0xc0 || og[k + 1] === 0xc2));
  assert.deepEqual([og.readUInt16BE(i + 7), og.readUInt16BE(i + 5)], [1200, 630]);
});

test('JSON-LD: geçerli, çakışmasız, görünür içerikle aynı', () => {
  for (const { url, html, noindex } of pages) {
    const all = nodes(html);
    assert.ok(all.length, `${url}: JSON-LD yok`);
    const count = (t) => all.filter((n) => n['@type'] === t).length;
    for (const t of ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList']) assert.ok(count(t) <= 1, `${url}: birden fazla ${t}`);
    assert.equal(count('AggregateRating') + all.filter((n) => n.aggregateRating || n.review).length, 0, `${url}: gerçek veri olmadan puan / yorum işaretlemesi olmamalı`);
    const org = all.find((n) => n['@type'] === 'Organization');
    assert.equal(org.name, S.brand); assert.equal(org.legalName, S.company.legal); assert.equal(org.address.postalCode, (S.company.address.match(/\b\d{5}\b/) || [])[0]);
    assert.equal(org.telephone, S.company.phone.replace(/\s/g, ''));
    if (noindex) continue;
    if (url !== '/') assert.equal(count('BreadcrumbList'), 1, `${url}: BreadcrumbList`);
    // SSS: her soru ve cevap sayfada görünür
    const faq = all.find((n) => n['@type'] === 'FAQPage'), body = text(html);
    for (const q of (faq ? faq.mainEntity : [])) {
      assert.ok(body.includes(q.name), `${url}: SSS sorusu sayfada yok: ${q.name}`);
      assert.ok(body.includes(q.acceptedAnswer.text.slice(0, 60)), `${url}: SSS cevabı sayfada yok: ${q.name}`);
    }
  }
  // Paket fiyatları: yapılandırılmış veri = config.js (KDV dahil) = panel/src/plans.js
  const app = nodes(byUrl['/paketler'].html).find((n) => n['@type'] === 'SoftwareApplication');
  assert.deepEqual(app.offers.map((o) => o.price), Array.from(S.plans.filter((p) => p.monthly), (p) => p.monthly));
  const plansJs = readFileSync(join(ROOT, '..', 'panel', 'src', 'plans.js'), 'utf8');
  for (const p of S.plans.filter((x) => x.monthly)) assert.match(plansJs, new RegExp(`\\b${p.monthly}\\b`), `panel/src/plans.js: ${p.name} ${p.monthly}`);
});

test('JS olmadan da okunur: fiyatlar, kanal listesi, şirket bilgileri', () => {
  const pk = text(byUrl['/paketler'].html);
  for (const p of S.plans.filter((x) => x.monthly)) {
    assert.ok(pk.includes(`${p.name} ${p.tag}`), `paketler: ${p.name}`);
    assert.ok(pk.includes(p.monthly.toLocaleString('tr-TR')), `paketler: ${p.monthly}`);
  }
  assert.ok(pk.includes(S.compare[0].rows[0][0]), 'karşılaştırma tablosu');
  assert.ok(pk.includes(S.vat.slice(0, 40)), 'KDV notu');
  const home = text(byUrl['/'].html);
  for (const n of ['Trendyol', 'Hepsiburada', 'N11', 'ikas']) assert.ok(home.includes(n), `ana sayfa: ${n}`);
  assert.match(home, /Hastürk CRM, [^.]{20,}satış yönetim panelidir/, 'ana sayfada tek cümlelik tanım');
  for (const { url, html } of pages) {
    const t = text(html);
    assert.ok(t.includes(S.company.phone) && t.includes(S.company.email) && t.includes(S.company.address), `${url}: alt bilgide telefon / e-posta / adres`);
    assert.doesNotMatch(html, /<(a|span|dd)\b[^>]*data-c="company\.(phone|email|address|legal)"[^>]*><\/\1>/, `${url}: boş şirket bilgisi alanı`);
  }
  const about = text(byUrl['/hakkimizda'].html);
  for (const v of [S.company.legal, S.company.address, S.company.taxNo]) assert.ok(about.includes(v), `hakkımızda: ${v}`);
});

test('site haritası: tüm dizinlenebilir sayfalar, gerçek tarih, var olan adresler', () => {
  const xml = readFileSync(join(PUB, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].map(([, loc, mod]) => ({ loc, mod }));
  assert.equal(urls.length, (xml.match(/<url>/g) || []).length, 'her adreste lastmod');
  const locs = urls.map((u) => u.loc), today = new Date().toISOString().slice(0, 10);
  assert.equal(new Set(locs).size, locs.length, 'tekrarlı adres');
  for (const { loc, mod } of urls) {
    assert.match(mod, /^\d{4}-\d{2}-\d{2}$/); assert.ok(mod <= today, `${loc}: ileri tarih ${mod}`);
    const p = byUrl[loc.slice(SITE.length) || '/'];
    assert.ok(p, `${loc}: sayfa yok`); assert.ok(!p.noindex, `${loc}: noindex sayfa haritada`);
  }
  for (const p of indexable) assert.ok(locs.includes(SITE + (p.url === '/' ? '/' : p.url)), `${p.url} site haritasında yok`);
  const lm = JSON.parse(readFileSync(join(ROOT, 'src', 'lastmod.json'), 'utf8'));
  for (const { loc, mod } of urls) assert.ok(lm[loc.slice(SITE.length) || '/'] && lm[loc.slice(SITE.length) || '/'].d <= mod, `${loc}: lastmod.json`);
});

test('kırık iç bağlantı ve görsel yok; görsellerde alt ve boyut', () => {
  const bad = [];
  for (const { url, html } of pages) {
    for (const [, raw] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      let u = decode(raw);
      if (/^(mailto:|tel:|#|data:|javascript:)/.test(u)) continue;
      if (/^https?:/.test(u)) { if (!u.startsWith(SITE + '/')) continue; u = u.slice(SITE.length); }
      u = u.replace(/[?#].*$/, '');
      if (!u || u.startsWith('/blog') || u === '/llms.txt' || u === '/llms-full.txt') continue; // Worker sayfaları (blog-worker.test.mjs)
      if (/\.html$/.test(u) || (u.length > 1 && u.endsWith('/'))) bad.push(`${url} → ${raw} (uzantısız adres kullanın)`);
      const abs = u.startsWith('/') ? u : '/' + relative(PUB, join(PUB, dirname(url), u));
      if (![join(PUB, abs === '/' ? 'index.html' : abs), join(PUB, abs + '.html')].some((p) => existsSync(p) && statSync(p).isFile())) bad.push(`${url} → ${raw}`);
    }
    for (const [img] of html.matchAll(/<img\b[^>]*>/g)) {
      if (!/\salt="/.test(img)) bad.push(`${url}: alt yok ${img.slice(0, 80)}`);
      if (!/\swidth="\d+"/.test(img) || !/\sheight="\d+"/.test(img)) bad.push(`${url}: boyut yok ${img.slice(0, 80)}`);
    }
    // LCP: öncelikli görsel en fazla bir tane ve tembel yüklenmez
    assert.ok((html.match(/fetchpriority="high"/g) || []).length <= 1, `${url}: birden fazla öncelikli görsel`);
    assert.doesNotMatch(html, /<img\b(?=[^>]*fetchpriority="high")(?=[^>]*loading="lazy")[^>]*>/, `${url}: öncelikli görsel lazy`);
  }
  assert.deepEqual(bad, []);
});

test('sahipsiz sayfa yok: her dizinlenebilir sayfaya en az bir iç bağlantı', () => {
  const linked = new Set();
  for (const { html } of pages) for (const [, u] of html.matchAll(/\shref="(\/[^"#?]*)/g)) linked.add(u);
  for (const p of indexable) if (p.url !== '/') assert.ok(linked.has(p.url), `${p.url}: hiçbir sayfadan bağlantı yok`);
});

test('robots.txt, llms.txt, IndexNow anahtarı, önbellek başlıkları', () => {
  const robots = readFileSync(join(PUB, 'robots.txt'), 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/hasturkcrm\.com\/sitemap\.xml$/m); assert.match(robots, /^Sitemap: https:\/\/hasturkcrm\.com\/blog\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, 'site kapatılmamalı');
  for (const bot of ['Googlebot', 'Bingbot', 'Applebot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent'])
    assert.match(robots, new RegExp(`^User-agent: ${bot}$`, 'm'), bot);
  const llms = readFileSync(join(PUB, 'llms.txt'), 'utf8');
  assert.match(llms, /^# Hastürk CRM\n\n> /);
  for (const p of S.plans.filter((x) => x.monthly)) assert.ok(llms.includes(`${p.name} ${p.monthly.toLocaleString('tr-TR')} ₺/ay`), `llms.txt: ${p.name}`);
  for (const [, u] of llms.matchAll(/\]\((https:\/\/hasturkcrm\.com[^)]*)\)/g)) { const path = u.slice(SITE.length) || '/'; if (!path.startsWith('/blog')) assert.ok(byUrl[path], `llms.txt: ${u}`); }
  const key = readdirSync(PUB).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(key.length, 1, 'tek IndexNow anahtar dosyası');
  assert.equal(readFileSync(join(PUB, key[0]), 'utf8').trim(), key[0].slice(0, -4));
  const headers = readFileSync(join(PUB, '_headers'), 'utf8');
  assert.match(headers, /\/assets\/site\.css\n\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /\/fonts\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
});
