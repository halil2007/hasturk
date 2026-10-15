// ikas'ın kendi pencere işlevi window.addToCart({ variantId, quantity }) ile sepete ekleme denemesi (gerçek site,
// anonim sepet, sipariş verilmez): ana sayfadan, sayfa açmadan; süre, sepet satırları, üstteki sepet sayacı.
import { chromium } from 'playwright';
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const prods = JSON.parse(readFileSync(SITE.includes('tarim-dunyasi') ? 'public/tarim/products.json' : 'public/products.json', 'utf8')).items;
const bySlug = new Map(prods.map((p) => [p.s, p]));
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route((u) => u.hostname === HOST, (r) => r.abort());
const p = await ctx.newPage();
p.on('response', async (r) => {
  if (!/op=\w*cart/i.test(r.url())) return;
  let t = ''; try { t = await r.text(); } catch (e) {}
  try { const j = JSON.parse(t), d = j.data && Object.values(j.data)[0]; log(`  istek ${(r.url().match(/op=(\w+)/) || [])[1]} HTTP ${r.status()} ${j.errors ? 'HATA ' + JSON.stringify(j.errors).slice(0, 200) : d ? (d.orderLineItems || []).length + ' satır' : 'boş'}`); } catch (e) {}
});
const t0 = Date.now();
await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => typeof window.addToCart === 'function', null, { timeout: 60000 });
log(`window.addToCart hazır: ${Date.now() - t0} ms`);
log('Kaynak: ' + await p.evaluate(() => String(window.addToCart).replace(/\s+/g, ' ').slice(400, 2600)));
const state = () => p.evaluate(() => {
  const el = document.getElementById('__next'), ck = el && Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
  const st = ck ? [el[ck]] : []; let cs = null, n = 0;
  while (st.length && !cs && n < 8000) { const f = st.pop(); n++; const q = f.memoizedProps; if (q && q.store && q.store.cartStore) cs = q.store.cartStore; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); }
  const c = cs && cs.cart;
  const hdr = [...document.querySelectorAll('[class*="basket" i], [class*="cart" i], a[href*="cart"]')].filter((e) => e.getBoundingClientRect().top < 200 && (e.offsetWidth || e.offsetHeight)).slice(0, 3).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20));
  return { satirlar: c ? (c.items || c.orderLineItems || []).map((x) => (x.variant && x.variant.name) + ' [' + String(x.variant && x.variant.id).slice(0, 8) + '] x' + x.quantity).join(' | ') : 'sepet yok', ustSayac: hdr.join(' / ') };
});
const tests = (process.env.TESTS || 'tarim-perliti:1,kalin-tarim-perliti:0,hasturk-sivi-solucan-gubresi:0,tarim-perliti:1').split(',');
for (const t of tests) {
  const [slug, i] = t.split(':'); const pr = bySlug.get(slug); if (!pr) { log('yok: ' + slug); continue; }
  const v = (pr.v || [])[+i] || { id: pr.v1, name: '' };
  const r = await p.evaluate(async (vid) => { const t = Date.now(); try { const x = await window.addToCart({ variantId: vid, quantity: 1 }); return { ms: Date.now() - t, sonuc: JSON.stringify(x).slice(0, 400) }; } catch (e) { return { ms: Date.now() - t, hata: String(e).slice(0, 300) }; } }, v.id);
  await p.waitForTimeout(400);
  log(`${slug} ${v.name} [${String(v.id).slice(0, 8)}] → ${JSON.stringify(r)}\n   sepet: ${JSON.stringify(await state())}`);
}
// Var olmayan varyant: başarısızlık nasıl görünür
const bad = await p.evaluate(async () => { try { return JSON.stringify(await window.addToCart({ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 })).slice(0, 400); } catch (e) { return 'hata ' + e; } });
log('Geçersiz varyant: ' + bad);
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
