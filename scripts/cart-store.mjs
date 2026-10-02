// Sitenin (ikas) sayfadaki sepet deposunu bulur: gizli çerçeveden eklenen ürünü açık sayfanın sepetine
// (üstteki sepet sayacı, açılır sepet) yansıtmak için hangi yöntem çağrılabilir. Anonim sepet, sipariş verilmez.
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://tarim-dunyasi.com';
const PRODUCT = process.env.PRODUCT || '/sivi-solucan-gubresi-1-lt';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.route((u) => u.hostname === HOST, (r) => r.abort());
const p = await ctx.newPage();
ctx.on('response', async (r) => {
  if (!/op=(addItemToCart|getCart\w*|saveCart)/.test(r.url())) return;
  let n = '?'; try { const j = await r.json(); const d = j.data && Object.values(j.data)[0]; n = d ? `${String(d.id).slice(0, 8)} ${(d.orderLineItems || []).length} satır` : 'boş'; } catch (e) {}
  log(`  istek ${r.url().match(/op=(\w+)/)[1]} → ${n} · ${r.frame() && r.frame().parentFrame() ? 'çerçeve' : 'ANA SAYFA'}`);
});
await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(7000);

// Üst menüdeki sepet göstergesi (sepet bağlantısı / simgesi çevresindeki metin)
const header = () => p.evaluate(() => {
  const els = [...document.querySelectorAll('a[href*="cart"], a[href*="sepet"], [class*="cart" i], [class*="basket" i], [class*="sepet" i]')]
    .filter((e) => e.getBoundingClientRect().top < 200 && (e.offsetWidth || e.offsetHeight));
  return els.slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} "${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`).join(' | ');
});

// React ağacında sepet deposunu ara
const probe = () => p.evaluate(() => {
  const found = [], seen = new WeakSet();
  const methods = (o) => { const s = new Set(); for (let q = o; q && q !== Object.prototype; q = Object.getPrototypeOf(q)) Object.getOwnPropertyNames(q).forEach((k) => { try { if (typeof o[k] === 'function' && k !== 'constructor') s.add(k); } catch (e) {} }); return [...s]; };
  const look = (o, path, d) => {
    if (!o || typeof o !== 'object' || d > 4 || seen.has(o)) return;
    seen.add(o);
    let keys = []; try { keys = Object.keys(o); } catch (e) { return; }
    if (keys.includes('cartStore') || (keys.includes('cart') && methods(o).some((m) => /cart/i.test(m)))) {
      const cs = o.cartStore || o;
      found.push({ path, keys: keys.slice(0, 30), cartStoreKeys: Object.keys(cs).slice(0, 40), cartStoreMethods: methods(cs).slice(0, 60), cart: cs.cart ? { id: cs.cart.id, n: (cs.cart.orderLineItems || []).length } : null });
      return;
    }
    if (found.length > 3) return;
    for (const k of keys.slice(0, 60)) { if (/^_react|^__react|^stateNode$|^return$|^child$|^sibling$|^alternate$/.test(k)) continue; try { look(o[k], path + '.' + k, d + 1); } catch (e) {} }
  };
  const glob = Object.keys(window).filter((k) => /ikas|store|cart|sepet/i.test(k));
  glob.forEach((k) => { try { look(window[k], 'window.' + k, 0); } catch (e) {} });
  const rootEl = document.getElementById('__next');
  const ck = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  let fiber = ck && rootEl[ck], n = 0;
  const stack = fiber ? [fiber] : [];
  while (stack.length && n < 6000 && found.length < 3) {
    const f = stack.pop(); n++;
    try { look(f.memoizedProps, 'fiber' + n + '(' + (f.type && (f.type.displayName || f.type.name) || typeof f.type) + ').props', 0); } catch (e) {}
    try { if (f.dependencies && f.dependencies.firstContext) look(f.dependencies.firstContext.memoizedValue, 'fiber' + n + '.context', 0); } catch (e) {}
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
  return { glob, fibers: n, found };
});

log('Başlangıç üst menü sepet: ' + await header());
const r0 = await probe();
log('Sepet deposu (önce): ' + JSON.stringify(r0).slice(0, 3000));

// Gizli çerçevede ürün sayfasını açıp sitenin butonuna bas (widget'ın yaptığı gibi)
await p.evaluate((u) => new Promise((res) => {
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-20000px;width:1280px;height:1000px'; f.src = u; document.body.appendChild(f);
  let n = 0; const t = setInterval(() => {
    n++;
    try {
      const btn = [...f.contentDocument.querySelectorAll('button')].find((x) => /sepete ekle/i.test(x.textContent || '') && !x.closest('a'));
      if (btn && f.contentDocument.readyState === 'complete') { clearInterval(t); setTimeout(() => { btn.click(); setTimeout(res, 4000); }, 1500); }
    } catch (e) {}
    if (n > 120) { clearInterval(t); res(); }
  }, 250);
}), SITE + PRODUCT);
log('Çerçeveden ekledikten sonra localStorage cartId: ' + await p.evaluate(() => localStorage.getItem('cartId')));
log('Üst menü sepet (çerçeveden ekleme sonrası): ' + await header());
const r1 = await probe();
log('Sepet deposu (sonra): ' + JSON.stringify(r1.found.map((f) => ({ path: f.path, cart: f.cart }))));

// Bulunan depoda sepeti yeniden okuyan yöntemleri sırayla dene
const tried = await p.evaluate(async () => {
  const res = [];
  const rootEl = document.getElementById('__next');
  const ck = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  const stack = ck ? [rootEl[ck]] : []; let store = null, n = 0;
  const pick = (o) => { if (o && typeof o === 'object') { if (o.cartStore) return o.cartStore; for (const k of Object.keys(o).slice(0, 40)) { try { if (o[k] && typeof o[k] === 'object' && o[k].cartStore) return o[k].cartStore; } catch (e) {} } } return null; };
  while (stack.length && !store && n < 6000) { const f = stack.pop(); n++; try { store = pick(f.memoizedProps) || (f.dependencies && f.dependencies.firstContext && pick(f.dependencies.firstContext.memoizedValue)); } catch (e) {} if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
  if (!store) return ['depo bulunamadı'];
  const names = []; for (let q = store; q && q !== Object.prototype; q = Object.getPrototypeOf(q)) Object.getOwnPropertyNames(q).forEach((k) => { try { if (typeof store[k] === 'function' && /cart/i.test(k) && !/add|remove|change|delete|save|set|checkout|create|clear/i.test(k)) names.push(k); } catch (e) {} });
  for (const k of [...new Set(names)]) {
    try { const before = store.cart && (store.cart.orderLineItems || []).length; await Promise.race([store[k](), new Promise((r) => setTimeout(r, 4000))]); res.push(`${k}(): önce ${before} satır, sonra ${store.cart && (store.cart.orderLineItems || []).length} satır, id ${store.cart && String(store.cart.id).slice(0, 8)}`); } catch (e) { res.push(`${k}(): hata ${String(e && e.message || e).slice(0, 80)}`); }
  }
  return res;
});
log('Denenen yöntemler: ' + JSON.stringify(tried));
await p.waitForTimeout(1500);
log('Üst menü sepet (yöntemlerden sonra): ' + await header());
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
