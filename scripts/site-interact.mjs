// Canlı sitede müşteri gibi gezinme ölçümü: kaydırma, menü üzerinde gezinme, kategori ve ürün sayfasına geçiş.
// Widget sürümleri karşılaştırılır (canlı / daldaki yeni / eski commit / widget yok). Sonuç Actions özetine yazılır.
import { chromium } from 'playwright';
import { appendFileSync, readFileSync } from 'node:fs';

const SITE = (process.env.SITE || 'https://hasturkgubre.com.tr').replace(/\/$/, '');
const RUNS = +(process.env.RUNS || 3);
const WIDGET_HOST = 'hasturk-arama.halilc2007.workers.dev';
const MODES = (process.env.MODES || 'widgetli,yeni,widgetsiz').split(',');
const CAT = process.env.CAT || 'solucan-gubresi';

const PROFILES = {
  telefon: {
    ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A346B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' },
    cpu: 4, net: { latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 },
  },
  bilgisayar: { ctx: { viewport: { width: 1440, height: 900 } }, cpu: 1, net: { latency: 30, downloadThroughput: 30e6 / 8, uploadThroughput: 5e6 / 8 } },
};

// Uzun görevler ve takılan kareler (>50 ms arayla çizilen kare) sayaçları; mark() ile aşama aşama okunur
const INIT = () => {
  const M = window.__i = { lt: [], gaps: [] };
  try { new PerformanceObserver(l => l.getEntries().forEach(e => M.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  let last = 0;
  const f = t => { if (last && t - last > 50) M.gaps.push([t, t - last]); last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
};
const since = (page, t0) => page.evaluate(t0 => {
  const M = window.__i, lt = M.lt.filter(x => x[0] >= t0), g = M.gaps.filter(x => x[0] >= t0);
  return { lt: Math.round(lt.reduce((a, x) => a + x[1], 0)), ltMax: Math.round(Math.max(0, ...lt.map(x => x[1]))), jank: g.length, now: performance.now() };
}, t0);

async function setup(browser, prof, mode) {
  const ctx = await browser.newContext(prof.ctx);
  if (mode === 'widgetsiz') await ctx.route(u => u.hostname === WIDGET_HOST, r => r.abort());
  if (mode.startsWith('eski-') || mode === 'yeni') {
    const body = readFileSync(`/tmp/widget-${mode === 'yeni' ? 'HEAD' : mode.slice(5)}.js`, 'utf8');
    await ctx.route(u => u.hostname === WIDGET_HOST && u.pathname === '/pm-search.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body }));
  }
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...prof.net });
  if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  return { ctx, page };
}

async function journey(browser, name, prof, mode) {
  const { ctx, page } = await setup(browser, prof, mode);
  const r = {};
  const mobile = name === 'telefon';
  // 1) Ana sayfa açılır, müşteri hemen kaydırmaya başlar (yükleme sürerken)
  let t = Date.now();
  await page.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 350).catch(() => {}); await page.evaluate(() => window.scrollBy(0, 1)); await page.waitForTimeout(250); }
  let s = await since(page, 0);
  r.erkenKaydirma = s;
  await page.waitForLoadState('load', { timeout: 120000 }).catch(() => {});
  r.anaYuk = Date.now() - t;
  await page.waitForTimeout(2500);
  // 2) Yüklendikten sonra kaydırma (yukarı-aşağı)
  let t0 = (await since(page, 0)).now;
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, i < 8 ? 400 : -400).catch(() => {}); await page.waitForTimeout(200); }
  r.kaydirma = await since(page, t0);
  // 3) Masaüstü: menü çubuğunda gezinme / telefon: Ürün Bul'u açıp kapama
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500);
  t0 = (await since(page, 0)).now;
  if (!mobile) {
    const links = await page.$$('header a[href], nav a[href], .ua-dnav a');
    for (const a of links.slice(0, 14)) { const b = await a.boundingBox().catch(() => null); if (b && b.y < 200) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 }); await page.waitForTimeout(180); } }
    await page.mouse.move(700, 600, { steps: 4 });
  } else {
    const fab = page.locator('#urun-arama-root >> .fab');
    if (await fab.count()) {
      const a = Date.now();
      await fab.tap().catch(() => {});
      await page.locator('#urun-arama-root >> .ov.on').waitFor({ timeout: 10000 }).catch(() => {});
      r.panelAc = Date.now() - a;
      await page.waitForTimeout(1200);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await page.waitForTimeout(600);
  r.menuGez = await since(page, t0);
  // 4) Kategori sayfasına geçiş (bağlantıya tıklama, ikas'ın kendi geçişi)
  t = Date.now();
  const catLink = page.locator(`a[href$="/${CAT}"]`).first();
  if (await catLink.count()) { await catLink.click({ force: true }).catch(() => {}); } else { await page.goto(SITE + '/' + CAT); }
  await page.waitForURL(new RegExp(CAT), { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('a[href]').length > 30 && document.readyState !== 'loading', null, { timeout: 30000 }).catch(() => {});
  r.kategori = Date.now() - t;
  await page.waitForTimeout(1500);
  // 5) Ürün sayfasına geçiş
  const prod = await page.evaluate(cat => {
    const a = [...document.querySelectorAll('main a[href], a[href]')].find(x => { try { const u = new URL(x.href); return u.origin === location.origin && u.pathname.split('/').length === 2 && !u.pathname.endsWith(cat) && x.querySelector('img'); } catch (e) { return false; } });
    return a ? a.getAttribute('href') : null;
  }, CAT);
  if (prod) {
    t = Date.now();
    t0 = (await since(page, 0)).now;
    await page.locator(`a[href="${prod}"]`).first().click({ force: true }).catch(() => {});
    await page.waitForURL(u => u.pathname === new URL(prod, SITE).pathname, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /sepete/i.test(b.textContent || '')), null, { timeout: 30000 }).catch(() => {});
    r.urun = Date.now() - t;
    await page.waitForTimeout(1500);
    r.urunDonma = await since(page, t0);
  }
  await ctx.close();
  return r;
}

const med = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const sec = v => v == null ? '-' : (v / 1000).toFixed(2) + ' sn';
const ms = v => v == null ? '-' : Math.round(v) + ' ms';

const browser = await chromium.launch();
let out = `# Canlı site gezinme ölçümü\n\nSite: ${SITE} · kategori: /${CAT} · her durum ${RUNS} kez (ortanca)\n`;
for (const [name, prof] of Object.entries(PROFILES)) {
  const rows = {};
  for (const m of MODES) { rows[m] = []; for (let i = 0; i < RUNS; i++) { try { rows[m].push(await journey(browser, name, prof, m)); } catch (e) { console.log(name, m, 'hata:', e.message); } } }
  out += `\n## ${name}\n\n| | ${MODES.join(' | ')} |\n|---|${MODES.map(() => '---').join('|')}|\n`;
  const line = (label, f, fmt) => { out += `| ${label} | ${MODES.map(m => fmt(med(rows[m].map(r => { try { return f(r); } catch (e) { return null; } })))).join(' | ')} |\n`; };
  line('Yüklenirken kaydırma: donma toplamı', r => r.erkenKaydirma.lt, ms);
  line('Yüklenirken kaydırma: takılan kare', r => r.erkenKaydirma.jank, v => v == null ? '-' : String(v));
  line('Ana sayfa tam yüklenme', r => r.anaYuk, sec);
  line('Yüklendikten sonra kaydırma: donma', r => r.kaydirma.lt, ms);
  line('Yüklendikten sonra kaydırma: takılan kare', r => r.kaydirma.jank, v => v == null ? '-' : String(v));
  if (name === 'telefon') line('Ürün Bul paneli açılma', r => r.panelAc, sec);
  line(name === 'telefon' ? 'Panel aç/kapa sırasında donma' : 'Menüde gezinirken donma', r => r.menuGez.lt, ms);
  line(name === 'telefon' ? 'Panel aç/kapa: takılan kare' : 'Menüde gezinirken takılan kare', r => r.menuGez.jank, v => v == null ? '-' : String(v));
  line('Kategori sayfasına geçiş', r => r.kategori, sec);
  line('Ürün sayfasına geçiş', r => r.urun, sec);
  line('Ürün sayfası geçişinde donma', r => r.urunDonma.lt, ms);
}
await browser.close();
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
