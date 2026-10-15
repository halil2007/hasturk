// Sepete ekleme hız tanısı (gerçek site, anonim sepet, sipariş verilmez): ikas sunucusunun tek ekleme süresi ve birden
// çok ürünü AYNI ANDA eklemenin güvenli olup olmadığı (sunucudaki sepette hepsi var mı, adetler doğru mu).
import { chromium } from 'playwright';
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const prods = JSON.parse(readFileSync('public/products.json', 'utf8')).items.filter((p) => p.st > 0);
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route((u) => u.hostname === HOST, (r) => r.abort());
const p = await ctx.newPage();
const net = [];
p.on('requestfinished', (r) => { if (/op=addItemToCart/.test(r.url())) { const t = r.timing(); net.push(Math.round(t.responseEnd)); } });
await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => typeof window.addToCart === 'function', null, { timeout: 60000 });
await p.waitForTimeout(1500);
const vids = prods.map((x) => ((x.v || []).find((v) => v.st > 0) || { id: x.v1 }).id).filter(Boolean);
const helpers = `window.__cs = () => { const el = document.getElementById('__next'), ck = Object.keys(el).find((k) => k.startsWith('__reactContainer$')); const st = [el[ck]]; let n = 0; while (st.length && n < 9000) { const f = st.pop(); n++; const q = f.memoizedProps; if (q && q.store && q.store.cartStore) return q.store.cartStore; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); } return null; };`;
await p.evaluate(helpers);
const server = () => p.evaluate(async () => { const cs = window.__cs(); await cs.getCart(); return (cs.cart.items || []).map((x) => x.variant.id.slice(0, 8) + 'x' + x.quantity).sort().join(' '); });
const add1 = (vid) => p.evaluate(async (v) => { const t = Date.now(); const r = await window.addToCart({ variantId: v, quantity: 1 }); return { ms: Date.now() - t, ok: !!(r && r.success) }; }, vid);
// 1) Tek tek (sırayla) 4 ürün: ilk ekleme sepeti de açar
for (let i = 0; i < 4; i++) { net.length = 0; const r = await add1(vids[i]); log(`sıralı ${i + 1}: toplam ${r.ms} ms (ikas sunucusu ${net.join('+')} ms) ${r.ok ? '✓' : '✗'}`); }
log('sunucudaki sepet: ' + await server());
// 2) Aynı anda 3 farklı ürün (sepet zaten açık) — 3 tur
for (let k = 0; k < 3; k++) {
  const set = vids.slice(4 + k * 3, 7 + k * 3);
  const t = Date.now();
  const rs = await p.evaluate(async (vs) => Promise.all(vs.map((v) => window.addToCart({ variantId: v, quantity: 1 }).then((r) => !!(r && r.success), () => false))), set);
  const ms = Date.now() - t;
  const sv = await server();
  const missing = set.filter((v) => !sv.includes(v.slice(0, 8) + 'x1'));
  log(`aynı anda 3 ürün (tur ${k + 1}): ${ms} ms, başarı ${rs.join(',')} · sunucuda eksik: ${missing.length ? missing.map((v) => v.slice(0, 8)).join(',') : 'yok'} · sayfadaki sepet ${await p.evaluate(() => window.__cs().cart.items.length)} satır`);
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
