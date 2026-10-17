// Ürün / fiyat güncelliği tanısı: ikas mağazasındaki gerçek durum ile Ürün Bul'un kullandığı products.json karşılaştırılır.
//  1) Yayındaki products.json (Cloudflare) ne zaman üretilmiş, önbellek başlıkları, depodaki son sürümle aynı mı
//  2) Site haritasındaki ürünler ↔ products.json (eksik / fazla ürün)
//  3) Ürün sayfalarındaki fiyat ↔ products.json fiyatı (varyant varyant)
// Yalnız herkese açık sayfalar okunur; ikas'a yazılmaz.
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = (process.env.SITE_URL || 'https://hasturkgubre.com.tr').replace(/\/$/, '');
const TARIM = SITE.includes('tarim');
const HOST = 'https://hasturk-arama.halilc2007.workers.dev/' + (TARIM ? 'tarim/' : '');
const out = [];
const log = (s) => { out.push(s); console.log(s); };
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' };
const yas = (iso) => { const m = (Date.now() - Date.parse(iso)) / 60000; return m < 120 ? Math.round(m) + ' dk' : (m / 60).toFixed(1) + ' sa'; };

// 1) Yayındaki dosya
const repo = JSON.parse(readFileSync(TARIM ? 'public/tarim/products.json' : 'public/products.json', 'utf8'));
const r1 = await fetch(HOST + 'products.json', { headers: UA });
const live = await r1.json();
const r2 = await fetch(HOST + 'products.json?t=' + Date.now(), { headers: UA });
const live2 = await r2.json();
log(`=== ${SITE.replace('https://', '')}`);
log(`Depodaki products.json: ${repo.updated} (${yas(repo.updated)} önce), ${repo.items.length} ürün`);
log(`Yayındaki products.json: ${live.updated} (${yas(live.updated)} önce), ${live.items.length} ürün · önbelleksiz istekte: ${live2.updated}`);
log(`Başlıklar: cache-control="${r1.headers.get('cache-control')}" age=${r1.headers.get('age') || '-'} cf-cache-status=${r1.headers.get('cf-cache-status') || '-'} etag=${(r1.headers.get('etag') || '-').slice(0, 20)}`);

// 2) Site haritası
const slugOf = (u) => { try { return decodeURIComponent(new URL(u).pathname.replace(/^\/|\/$/g, '')); } catch (e) { return ''; } };
const locs = async (u, d = 0) => {
  const r = await fetch(u, { headers: UA }); if (!r.ok) { log(`site haritası ${u}: HTTP ${r.status}`); return []; }
  const x = await r.text(), L = [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (/<sitemapindex/i.test(x) && d < 2) { const all = []; for (const s of L) all.push(...(await locs(s, d + 1))); return all; }
  return L;
};
const smap = await locs(SITE + '/sitemap.xml');
const smProd = smap.map(slugOf).filter((s) => s && !s.includes('/'));
const have = new Set(live2.items.map((x) => x.s)), catS = new Set((live2.cats || []).map((c) => c.s));
const sayfa = new Set(smProd);
const eksik = smProd.filter((s) => !have.has(s) && !catS.has(s) && !/^(blog|pages|account|cart|checkout|search|iletisim|hakkimizda|$)/.test(s));
log(`\nSite haritası: ${smap.length} adres · products.json'da olmayan ürün/sayfa adayı: ${eksik.length}`);
// Aday gerçekten ürün mü (sayfada ürün verisi var mı) ve neden yok
const nd = async (slug) => {
  const r = await fetch(`${SITE}/${slug}`, { headers: UA }); if (!r.ok) return { http: r.status };
  const h = await r.text(), m = h.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { http: r.status, nd: false };
  let j; try { j = JSON.parse(m[1]); } catch (e) { return { http: r.status, nd: false }; }
  return { http: r.status, j };
};
// __NEXT_DATA__ içinde ürün: varyant kimliği → { sell, disc, final }
const fiyatlar = (j) => {
  const V = new Map(); let ad = null;
  const walk = (o, d) => {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
    if (o.variants && Array.isArray(o.variants) && o.name && !ad) ad = o.name;
    if (o.id && Array.isArray(o.prices) && o.prices.length) {
      const p = o.prices.find((x) => !x.priceListId) || o.prices[0];
      if (p && (p.sellPrice != null)) V.set(o.id, { sell: p.sellPrice, disc: p.discountPrice ?? null, final: p.finalPrice ?? null });
    }
    for (const k in o) walk(o[k], d + 1);
  };
  walk(j, 0);
  return { V, ad };
};
const gercekEksik = [];
for (const s of eksik.slice(0, 40)) {
  const r = await nd(s);
  const f = r.j ? fiyatlar(r.j) : null;
  if (f && f.V.size) gercekEksik.push(`${s} (${f.ad || '?'}; ${f.V.size} varyant)`);
}
log(gercekEksik.length ? `Sitede satışta olup Ürün Bul'da OLMAYAN ürünler (${gercekEksik.length}):\n  ` + gercekEksik.join('\n  ') : 'Sitede olup Ürün Bul\'da olmayan ürün yok');
const fazla = live2.items.filter((x) => !sayfa.has(x.s)).map((x) => x.s);
log(`Ürün Bul'da olup site haritasında olmayan: ${fazla.length}${fazla.length ? ' (ör. ' + fazla.slice(0, 5).join(', ') + ')' : ''}`);

// 3) Fiyat karşılaştırması: tüm ürünler (en fazla 400), varyant varyant
const N = Math.min(400, live2.items.length);
let bak = 0, fark = [], hata = 0;
const list = live2.items.slice(0, N);
for (let i = 0; i < list.length; i += 6) {
  await Promise.all(list.slice(i, i + 6).map(async (x) => {
    const r = await nd(x.s).catch(() => ({}));
    if (!r.j) { hata++; return; }
    const { V } = fiyatlar(r.j);
    const vars = x.v || [{ id: x.v1, p: x.p, d: x.d }];
    for (const v of vars) {
      const g = V.get(v.id); if (!g) continue;
      bak++;
      const gs = g.disc && g.disc < g.sell ? g.disc : g.sell, bs = v.d ?? v.p;
      if (Math.abs((gs || 0) - (bs || 0)) > 0.01) fark.push(`${x.s}${v.name ? ' [' + v.name + ']' : ''}: sitede ${gs} TL, Ürün Bul'da ${bs} TL`);
    }
  }));
}
log(`\nFiyat: ${list.length} ürün, ${bak} varyant karşılaştırıldı (${hata} sayfa okunamadı) · farklı: ${fark.length}`);
fark.slice(0, 40).forEach((f) => log('  ' + f));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
