// "Kendi Toprak Karışımını Oluştur" — sayfa açmadan ikas window.addToCart({ variantId, quantity, options }) ile ekleme
// denemesi (gerçek site, anonim sepet, sipariş verilmez): seçenekler (bileşen kutusu + litre seçimi) ve sepetteki fiyat.
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
await ctx.route((u) => u.hostname === 'hasturk-arama.halilc2007.workers.dev', (r) => r.abort());
const p = await ctx.newPage();
// Seçenek setini ürün sayfasının HTML'inden (__NEXT_DATA__) oku — tarayıcı gerekmeden de okunabiliyor mu?
const html = await (await fetch(SITE + '/kendi-toprak-karisimini-olustur')).text();
const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
let set = null, vid = null;
if (m) { (function walk(o, d) { if (!o || typeof o !== 'object' || d > 16) return; if (o.metaData && o.metaData.slug === 'kendi-toprak-karisimini-olustur' && o.productOptionSet) { set = o.productOptionSet; vid = o.variants[0].id; } for (const k in o) walk(o[k], d + 1); })(JSON.parse(m[1]), 0); }
log(`HTML'den seçenek seti: ${set ? set.options.length + ' bileşen' : 'YOK'} · HTML ${Math.round(html.length / 1024)} KB`);
if (!set) { await b.close(); process.exit(1); }
const B = set.options.map((o) => ({ ad: o.name, cb: o.id, ch: o.childOptions && o.childOptions[0] && o.childOptions[0].id, deg: ((o.childOptions && o.childOptions[0] && o.childOptions[0].selectSettings || {}).values || []).map((v) => ({ l: parseFloat(v.value), id: v.id, p: v.price })) }));
log('Bileşenler: ' + B.map((x) => `${x.ad} (${x.deg.length} değer, 1L=${(x.deg[0] || {}).p} TL, 10L=${(x.deg.find((v) => v.l === 10) || {}).p} TL)`).join(' | '));
await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => typeof window.addToCart === 'function', null, { timeout: 60000 });
await p.waitForTimeout(1500);
const sec = [['Sphagnum', 5], ['Kalın', 2], ['Solucan', 1]];
const opts = [], beklenen = [145];
for (const [ad, l] of sec) {
  const x = B.find((y) => y.ad.includes(ad)); const v = x.deg.find((d) => d.l === l);
  opts.push({ productOptionId: x.cb, productOptionsSetId: set.id, values: ['true'] }, { productOptionId: x.ch, productOptionsSetId: set.id, values: [v.id] });
  beklenen.push(v.p);
}
log('Beklenen fiyat: ' + beklenen.join(' + ') + ' = ' + beklenen.reduce((a, c) => a + c, 0));
const r = await p.evaluate(async ({ vid, opts }) => { const t = Date.now(); try { const x = await window.addToCart({ variantId: vid, quantity: 1, options: opts }); const it = x && x.response && x.response.data && (x.response.data.items || []).find((i) => i.variant && i.variant.id === vid); return { ms: Date.now() - t, ok: x && x.success, hata: x && x.response && x.response.errors, fiyat: it && (it.finalPrice || it.price), birim: it && it.unitPrice, secenekler: it && JSON.stringify(it.options).slice(0, 1500) }; } catch (e) { return { hata: String(e) }; } }, { vid, opts });
log('window.addToCart sonucu: ' + JSON.stringify(r));
// İkinci karışım: aynı ürün farklı seçeneklerle ayrı satır mı olur?
const opts2 = [B.find((y) => y.ad.includes('Cocopeat'))].map((x) => [{ productOptionId: x.cb, productOptionsSetId: set.id, values: ['true'] }, { productOptionId: x.ch, productOptionsSetId: set.id, values: [x.deg.find((d) => d.l === 10).id] }]).flat();
const r2 = await p.evaluate(async ({ vid, opts }) => { const x = await window.addToCart({ variantId: vid, quantity: 1, options: opts }); const its = (x && x.response && x.response.data && x.response.data.items || []).filter((i) => i.variant && i.variant.id === vid); return { ok: x && x.success, satir: its.length, fiyatlar: its.map((i) => i.finalPrice || i.price) }; }, { vid, opts: opts2 });
log('İkinci karışım (Cocopeat 10 L): ' + JSON.stringify(r2));
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
