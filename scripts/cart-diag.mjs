// Sepete ekleme tanısı (gerçek site): ürün sayfasındaki "Sepete ekle" butonları, butona basınca giden istekler ve
// sepetin gerçekten dolup dolmadığı. Ayrıca widget'ın Ürün Bul'dan eklemesi (yayındaki ya da daldaki sürüm).
// SITE_URL, PRODUCT (adres), QUERY (arama), MODE=canli|yeni
import { chromium } from 'playwright';
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://tarim-dunyasi.com';
const PRODUCT = process.env.PRODUCT || '/sivi-solucan-gubresi-1-lt';
const QUERY = process.env.QUERY || 'sıvı solucan gübresi';
const MODE = process.env.MODE || 'canli';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
// Sepete ekleme cevabı: hata var mı, sepette kaç satır/adet var
const watchAdds = (target, tag) => target.on('response', async (r) => {
  if (!/op=(addItemToCart|saveCart|getCart\w*)/.test(r.url())) return;
  let t = ''; try { t = await r.text(); } catch (e) {}
  let info = '';
  try {
    const j = JSON.parse(t), d = j.data && (j.data.addItemToCart || j.data.saveCart || j.data.getCart || j.data.getCartById);
    info = j.errors ? 'HATA: ' + JSON.stringify(j.errors).slice(0, 300) : d ? `sepet ${String(d.id || '').slice(0, 8)} · ${(d.orderLineItems || []).length} satır · adet ${(d.orderLineItems || []).reduce((a, x) => a + (x.quantity || 0), 0)} · ${(d.orderLineItems || []).map((x) => (x.variant && (x.variant.name || x.variant.id)) || '').join(', ').slice(0, 120)}` : 'boş cevap: ' + t.slice(0, 200);
  } catch (e) { info = 'okunamadı: ' + t.slice(0, 200); }
  let reqId = ''; try { reqId = (r.request().postData() || '').match(/"(?:id|cartId)"\s*:\s*"([0-9a-f-]{8})/)[1]; } catch (e) {}
  log(`  [${tag}] ${r.url().match(/op=(\w+)/)[1]} (istenen sepet ${reqId || '-'}) → HTTP ${r.status()} · ${info} · çerçeve: ${r.frame() && r.frame().parentFrame() ? 'GİZLİ ÇERÇEVE' : 'ana sayfa'}`);
});

const cartCount = async (p) => p.evaluate(async () => {
  // Sepet sayfasını ayrı çerçevede açıp satırları say (sitenin kendi sepeti)
  return await new Promise((res) => {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-9999px;width:1200px;height:900px'; f.src = '/cart';
    let n = 0; const t = setInterval(() => {
      n++;
      try {
        const d = f.contentDocument, txt = (d && d.body && d.body.innerText) || '';
        if (/sepetiniz boş|sepetinizde ürün bulunmamaktadır|sepetiniz bos/i.test(txt)) { clearInterval(t); f.remove(); return res('BOŞ'); }
        const m = txt.match(/(\d+)\s*ürün/i);
        if ((m || n > 40) && txt.length > 200) { clearInterval(t); const s = (txt.match(/[^\n]*(solucan|gübre|ürün)[^\n]*/gi) || []).slice(0, 4).join(' / '); f.remove(); return res((m ? m[0] : '?') + ' :: ' + s.slice(0, 200)); }
      } catch (e) {}
      if (n > 60) { clearInterval(t); f.remove(); res('okunamadı'); }
    }, 250);
    document.body.appendChild(f);
  });
});

// 1) Ürün sayfası: butonlar + doğrudan tıklama
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.route((u) => u.hostname === HOST, (r) => r.abort()); // widget kapalı: sitenin kendi davranışı
  const p = await ctx.newPage();
  watchAdds(p, 'ürün sayfası');
  const reqs = [];
  p.on('request', (r) => { if (/graphql|cart|sepet/i.test(r.url()) && r.method() === 'POST') reqs.push({ t: Date.now(), url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90), body: (r.postData() || '').replace(/\s+/g, ' ').slice(0, 160) }); });
  await p.goto(SITE + PRODUCT, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(6000);
  const btns = await p.evaluate(() => {
    const fold = (s) => s.toLocaleLowerCase('tr-TR').replace(/[ışğüöç]/g, (c) => ({ ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' })[c]);
    return [...document.querySelectorAll('button,[role="button"],a,input[type="submit"]')].map((el, i) => {
      const t = fold((el.value || el.textContent || '').replace(/\s+/g, ' ').trim()); const r = el.getBoundingClientRect();
      if (!/sepete ?(ekle|at)|add to cart/.test(t) || t.length > 40) return null;
      return { i, t, tag: el.tagName, top: Math.round(r.top + scrollY), w: Math.round(r.width), vis: !!(el.offsetWidth || el.offsetHeight), dis: !!el.disabled, card: !!el.closest('a[href]') || !!el.closest('[class*="card" i],[class*="product-item" i],[class*="slider" i],[class*="swiper" i]') };
    }).filter(Boolean);
  });
  log('Ürün sayfası "sepete ekle" butonları (sırayla): ' + JSON.stringify(btns));
  log('Başlangıç sepet: ' + await cartCount(p));
  const first = btns.find((x) => x.vis && !x.dis);
  if (first) {
    const t0 = Date.now(); reqs.length = 0;
    await p.evaluate((i) => document.querySelectorAll('button,[role="button"],a,input[type="submit"]')[i].click(), first.i);
    await p.waitForTimeout(6000);
    log(`İlk butona (${first.t}, ${first.card ? 'ÜRÜN KARTI' : 'ana'}) basınca istekler: ` + JSON.stringify(reqs.map((r) => ({ ms: r.t - t0, url: r.url, body: r.body }))));
    log('Sonra sepet: ' + await cartCount(p));
  }
  await ctx.close();
}
// 2) Ürün Bul'dan ekleme (widget)
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  if (MODE === 'yeni') await ctx.route((u) => u.hostname === HOST && u.pathname === '/pm-search.js', (r) => r.fulfill({ status: 200, body: readFileSync('public/pm-search.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
  const p = await ctx.newPage();
  watchAdds(ctx, 'widget');
  const reqs = [];
  ctx.on('request', (r) => { if (/graphql|cart|sepet/i.test(r.url()) && r.method() === 'POST') reqs.push({ t: Date.now(), url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90), body: (r.postData() || '').replace(/\s+/g, ' ').slice(0, 140) }); });
  await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.locator('#urun-arama-root >> .fab:not(.hide)').waitFor({ timeout: 30000 });
  await p.waitForTimeout(3000);
  const store = () => p.evaluate(() => ({ ls: Object.keys(localStorage).filter((k) => /cart|sepet|ikas/i.test(k)).map((k) => k + '=' + String(localStorage.getItem(k)).slice(0, 60)), ss: Object.keys(sessionStorage).filter((k) => /cart|sepet|ikas/i.test(k)).map((k) => k + '=' + String(sessionStorage.getItem(k)).slice(0, 60)), ck: document.cookie.split('; ').filter((c) => /cart|sepet/i.test(c)).map((c) => c.slice(0, 80)) }));
  log('Sepet kimliği (önce): ' + JSON.stringify(await store()));
  log('Widget testi başlangıç sepet: ' + await cartCount(p));
  await p.locator('#urun-arama-root >> .fab').tap();
  await p.locator('#urun-arama-root >> .top input').fill(QUERY);
  await p.locator('#urun-arama-root >> .results [data-act="add"]').first().waitFor({ timeout: 20000 });
  const name = await p.locator('#urun-arama-root >> .results .pname').first().textContent();
  reqs.length = 0; const t0 = Date.now();
  await p.locator('#urun-arama-root >> .results [data-act="add"]').first().tap();
  await p.waitForTimeout(1000);
  if (await p.locator('#urun-arama-root >> .sheet.on').count()) await p.locator('#urun-arama-root >> .sheet.on button').filter({ hasText: /ekle/i }).first().tap().catch(() => {});
  await p.waitForTimeout(12000);
  const toast = await p.evaluate(() => { const r = document.getElementById('urun-arama-root').shadowRoot; return [...r.querySelectorAll('.ptoast,[role=status]')].map((x) => x.textContent.trim()).filter(Boolean).join(' / '); });
  const alog = await p.evaluate(() => localStorage.getItem('ua-addlog'));
  log(`Widget: "${name.trim()}" eklendi mesajı: ${toast || '-'}`);
  log('Widget ekleme kaydı: ' + (alog || '-').slice(0, 900));
  try { const a0 = JSON.parse(alog)[0]; log('Sayfa sepeti yenileme: ' + a0.sayfaSepeti + ' (bekleme ' + a0.bekleme + ')'); } catch (e) {}
  log('Sepet kimliği (sonra): ' + JSON.stringify(await store()));
  // Açık sayfadaki sitenin sepeti (yenilemeden): üstteki sepet sayacı ve sitenin sepet deposu
  log('Sayfa yenilenmeden sitenin sepeti: ' + JSON.stringify(await p.evaluate(() => {
    const hdr = [...document.querySelectorAll('[class*="basket" i], [class*="cart" i], a[href*="cart"]')].filter((e) => e.getBoundingClientRect().top < 200 && (e.offsetWidth || e.offsetHeight)).slice(0, 3).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20));
    let cs = null; const el = document.getElementById('__next'); const ck = el && Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
    const st = ck ? [el[ck]] : []; let n = 0;
    while (st.length && !cs && n < 5000) { const f = st.pop(); n++; const pr = f.memoizedProps; if (pr && pr.store && pr.store.cartStore) cs = pr.store.cartStore; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); }
    return { ustSayac: hdr, depo: cs ? (cs.cart ? String(cs.cart.id).slice(0, 8) + ' ' + (cs.cart.orderLineItems || []).length + ' satır' : 'boş') : 'bulunamadı' };
  })));
  log('Widget istekleri: ' + JSON.stringify(reqs.map((r) => ({ ms: r.t - t0, url: r.url, body: r.body }))).slice(0, 2000));
  await p.goto(SITE + '/'); await p.waitForTimeout(3000);
  log('Widget testi sonra sepet: ' + await cartCount(p));
  await ctx.close();
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
