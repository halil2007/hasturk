// Tarım Dünyası canlı deneme: gerçek sayfaya (tarim-dunyasi.com) daldaki widget + tarim/ verisi enjekte edilir;
// telefon ve bilgisayarda Ürün Bul butonu, masaüstü menüsü, arama, bağlantılar ve sepete ekleme kontrol edilir.
// Siteye hiçbir şey kaydedilmez (sadece bu tarayıcıda); sepete ekleme anonim, sipariş verilmez.
import { chromium } from 'playwright';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';

const SITE = process.env.SITE_URL || 'https://tarim-dunyasi.com';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const R = '#urun-arama-root >> ';
mkdirSync('shots', { recursive: true });
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

// LIVE=1: siteye hiçbir şey enjekte edilmez; yayındaki etiket ve yayındaki dosyalar olduğu gibi denenir
const LIVE = !!process.env.LIVE;
async function ctxFor(b, mobile) {
  const ctx = await b.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' }
    : { viewport: { width: 1440, height: 900 } });
  if (LIVE) {
    ctx.on('request', (r) => { if (r.url().includes(HOST)) log(`  istek: ${r.url().replace('https://' + HOST, '')}`); });
    ctx.on('response', (r) => { if (r.url().includes(HOST) && r.status() >= 400) log(`  HATA ${r.status()}: ${r.url()}`); });
    ctx.on('console', (m) => { if (m.type() === 'error') log('  konsol: ' + m.text().slice(0, 200)); });
    return ctx;
  }
  await ctx.route((u) => u.hostname === HOST, (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/e') return r.fulfill({ status: 204 });
    const f = { '/pm-search.js': 'public/pm-search.js', '/tarim/menu.json': 'public/tarim/menu.json', '/tarim/products.json': 'public/tarim/products.json' }[p];
    if (!f) return r.fulfill({ status: 404 });
    return r.fulfill({ status: 200, body: readFileSync(f), contentType: f.endsWith('.js') ? 'application/javascript' : 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route((u) => u.origin === SITE && (u.pathname === '/' || !/\.\w+$/.test(u.pathname)), async (r) => {
    if (r.request().resourceType() !== 'document') return r.continue();
    const resp = await r.fetch();
    const html = (await resp.text()).replace('</head>', `<script src="https://${HOST}/pm-search.js" data-site="tarim" async fetchpriority="high"></script></head>`);
    return r.fulfill({ response: resp, body: html });
  });
  return ctx;
}

const b = await chromium.launch();
// Bilgisayar
{
  const ctx = await ctxFor(b, false), p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const t = Date.now();
  await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.locator(R + '.fab:not(.hide)').waitFor({ timeout: 30000 }).then(() => log(`Bilgisayar: Ürün Bul butonu ${((Date.now() - t) / 1000).toFixed(1)} sn`), () => log('Bilgisayar: Ürün Bul butonu ÇIKMADI'));
  await p.waitForTimeout(5000);
  const bar = await p.evaluate(() => { const h = document.querySelector('.ua-dnav'); return h && h.shadowRoot ? [...h.shadowRoot.querySelectorAll('.ti')].map((a) => a.textContent.trim() + ' → ' + a.getAttribute('href')) : null; });
  log('Masaüstü menü: ' + (bar ? bar.join(' | ') : 'KURULMADI'));
  await p.screenshot({ path: 'shots/bilgisayar-ana.png' });
  const ti = p.locator('.ua-dnav').first();
  if (await ti.count()) {
    const bb = await ti.boundingBox(); await p.mouse.move(bb.x + 50, bb.y + bb.height / 2); await p.waitForTimeout(1200);
    const mega = await p.evaluate(() => { const m = document.getElementById('ua-mega'); return m && m.shadowRoot ? [...m.shadowRoot.querySelectorAll('a[href]')].slice(0, 12).map((a) => a.textContent.trim().slice(0, 40) + ' → ' + a.getAttribute('href')) : []; });
    log('Açılır menü bağlantıları: ' + mega.join(' | '));
    await p.screenshot({ path: 'shots/bilgisayar-menu.png' });
  }
  log('Bilgisayar sayfa hataları: ' + (errs.length ? errs.slice(0, 3).join(' / ') : 'yok'));
  await ctx.close();
}
// Telefon
{
  const ctx = await ctxFor(b, true), p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const t = Date.now();
  await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.locator(R + '.fab:not(.hide)').waitFor({ timeout: 30000 }).then(() => log(`Telefon: Ürün Bul butonu ${((Date.now() - t) / 1000).toFixed(1)} sn`), () => log('Telefon: Ürün Bul butonu ÇIKMADI'));
  await p.waitForTimeout(4000);
  await p.screenshot({ path: 'shots/telefon-ana.png' });
  await p.locator(R + '.fab').tap();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'shots/telefon-panel.png' });
  await p.locator(R + '.top input').fill('solucan gübresi');
  await p.locator(R + '.results .pname').first().waitFor({ timeout: 15000 }).catch(() => {});
  const res = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.results .pname')].slice(0, 5).map((x) => x.textContent.trim()));
  const hrefs = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.results a[href]')].slice(0, 3).map((a) => a.getAttribute('href')));
  log('Arama "solucan gübresi": ' + res.join(' | '));
  log('Bağlantılar: ' + hrefs.join(' | '));
  await p.screenshot({ path: 'shots/telefon-arama.png' });
  // Bağlantı gerçekten açılıyor mu
  if (hrefs[0]) { const r2 = await fetch(hrefs[0], { redirect: 'manual' }); log(`İlk ürün sayfası: HTTP ${r2.status}`); }
  // Sepete ekleme (anonim sepet, sipariş yok)
  const add = p.locator(R + '.results [data-act="add"]').first();
  if (await add.count()) {
    const a = Date.now();
    await add.tap();
    const sheet = p.locator(R + '.sheet.on [data-act]').first();
    await p.waitForTimeout(800);
    if (await p.locator(R + '.sheet.on').count()) { await p.locator(R + '.sheet.on button').filter({ hasText: /ekle/i }).first().tap().catch(() => {}); }
    const msg = await p.locator(R + '.ptoast, ' + R + '.toast').first().textContent({ timeout: 20000 }).catch(() => '');
    await p.waitForTimeout(6000);
    const msg2 = await p.evaluate(() => { const r = document.getElementById('urun-arama-root').shadowRoot; return [...r.querySelectorAll('.ptoast, .toast, .addok, .cart-n, [role=status]')].map((x) => x.textContent.trim()).filter(Boolean).join(' / '); });
    log(`Sepete ekleme (${((Date.now() - a) / 1000).toFixed(1)} sn): ${msg2 || msg || 'mesaj yok'}`);
    await p.screenshot({ path: 'shots/telefon-sepet.png' });
    const log2 = await p.evaluate(() => localStorage.getItem('ua-addlog'));
    log('Ekleme kaydı: ' + (log2 || '-').slice(0, 300));
  }
  log('Telefon sayfa hataları: ' + (errs.length ? errs.slice(0, 3).join(' / ') : 'yok'));
  await ctx.close();
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# Tarım Dünyası canlı deneme\n\n' + lines.map((l) => '- ' + l).join('\n') + '\n');
