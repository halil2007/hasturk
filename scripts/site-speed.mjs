// Canlı sitenin açılış hızını ölçer: widget açıkken, widget engellenmişken ve (etiket async değilse) async etiketle.
// GitHub Actions'ta çalışır (.github/workflows/site-speed.yml); sonuç işin özet sayfasına yazılır.
// Yerelde: npm i playwright && node scripts/site-speed.mjs
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const SITE = process.env.SITE || 'https://hasturkgubre.com.tr/';
const RUNS = +(process.env.RUNS || 3);
const WIDGET_HOST = 'hasturk-arama.halilc2007.workers.dev';
const TAG_RE = /<script[^>]*pm-search\.js[^>]*><\/script>/i;

const PROFILES = {
  telefon: {
    ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A346B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' },
    // Orta seviye Android + 4G: 4x yavaş CPU, ~9 Mbit, 85 ms gecikme
    cpu: 4, net: { latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 },
  },
  bilgisayar: { ctx: { viewport: { width: 1440, height: 900 } }, cpu: 1, net: { latency: 30, downloadThroughput: 30e6 / 8, uploadThroughput: 5e6 / 8 } },
};

const INIT = () => {
  window.__m = { lcp: 0, fcp: 0, lt: [], fab: 0 };
  try {
    new PerformanceObserver(l => l.getEntries().forEach(e => { window.__m.lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; })).observe({ type: 'paint', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => {
      const a = (e.attribution && e.attribution[0]) || {};
      window.__m.lt.push({ s: e.startTime, d: e.duration, src: a.containerSrc || a.containerName || '' });
    })).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  const t = setInterval(() => {
    const h = document.getElementById('urun-arama-root');
    const f = h && h.shadowRoot && h.shadowRoot.querySelector('.fab:not(.hide)');
    if (f) { window.__m.fab = performance.now(); clearInterval(t); }
  }, 50);
};

async function run(browser, prof, mode, liveTag) {
  const ctx = await browser.newContext(prof.ctx);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...prof.net });
  if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  await page.addInitScript(INIT);

  const res = [];
  page.on('requestfinished', async r => {
    try { const s = await r.sizes(); const t = r.timing(); res.push({ url: r.url(), type: r.resourceType(), kb: (s.responseBodySize + s.responseHeadersSize) / 1024, end: t.responseEnd }); } catch (e) {}
  });
  if (mode === 'widgetsiz') await page.route(u => u.hostname === WIDGET_HOST, r => r.abort());
  if (mode === 'async') {
    await page.route(u => u.href === SITE, async r => {
      const resp = await r.fetch();
      const html = (await resp.text()).replace(TAG_RE, `<script src="https://${WIDGET_HOST}/pm-search.js" async fetchpriority="high"></script>`);
      await r.fulfill({ response: resp, body: html });
    });
  }

  const t0 = Date.now();
  await page.goto(SITE, { waitUntil: 'load', timeout: 120000 });
  const loadWall = Date.now() - t0;
  await page.waitForTimeout(6000); // FAB ve geç uzun görevler için
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { ...window.__m, ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  await ctx.close();
  const after = m.lt.filter(x => x.s > m.fcp);
  return {
    mode, ttfb: m.ttfb, fcp: m.fcp, lcp: m.lcp, dcl: m.dcl, load: m.load, fab: m.fab, loadWall,
    tbt: after.reduce((a, x) => a + Math.max(0, x.d - 50), 0), longest: Math.max(0, ...m.lt.map(x => x.d)),
    kb: res.reduce((a, r) => a + r.kb, 0), n: res.length,
    widgetKb: res.filter(r => r.url.includes(WIDGET_HOST)).reduce((a, r) => a + r.kb, 0),
    big: res.sort((a, b) => b.kb - a.kb).slice(0, 12), liveTag,
  };
}

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sec = v => (v / 1000).toFixed(2) + ' sn';

const browser = await chromium.launch();
const html = await (await fetch(SITE)).text();
const liveTag = (html.match(TAG_RE) || ['(etiket bulunamadı)'])[0];
const modes = ['widgetli', 'widgetsiz'];
if (!/\basync\b/.test(liveTag) && TAG_RE.test(html)) modes.push('async');

let out = `# Canlı site hız ölçümü\n\nSite: ${SITE}  \nSitedeki etiket: \`${liveTag.replace(/`/g, '')}\`  \nHer ölçüm ${RUNS} kez, ortanca değer (önbelleksiz, ilk ziyaret).\n`;
for (const [name, prof] of Object.entries(PROFILES)) {
  const rows = {};
  for (const mode of modes) {
    rows[mode] = [];
    for (let i = 0; i < RUNS; i++) {
      try { rows[mode].push(await run(browser, prof, mode, liveTag)); } catch (e) { console.log(name, mode, 'hata', e.message); }
    }
  }
  out += `\n## ${name}\n\n| | ${modes.join(' | ')} |\n|---|${modes.map(() => '---').join('|')}|\n`;
  const line = (label, f, fmt = sec) => { out += `| ${label} | ${modes.map(m => rows[m].length ? fmt(med(rows[m].map(f))) : '-').join(' | ')} |\n`; };
  line('Sunucu ilk bayt (TTFB)', r => r.ttfb);
  line('İlk görüntü (FCP)', r => r.fcp);
  line('Ana görsel/LCP', r => r.lcp);
  line('HTML hazır (DCL)', r => r.dcl);
  line('Tam yüklendi (load)', r => r.load);
  line('Ürün Bul butonu', r => r.fab, v => v ? sec(v) : '-');
  line('Donma toplamı (TBT)', r => r.tbt, v => Math.round(v) + ' ms');
  line('En uzun donma', r => r.longest, v => Math.round(v) + ' ms');
  line('İndirilen toplam', r => r.kb, v => Math.round(v) + ' KB');
  line('İstek sayısı', r => r.n, v => String(v));
  line('Widget payı', r => r.widgetKb, v => Math.round(v) + ' KB');
  const sample = rows.widgetli[0];
  if (sample) {
    out += `\n<details><summary>En büyük 12 dosya (${name}, widgetli)</summary>\n\n| KB | tür | adres |\n|---|---|---|\n`;
    sample.big.forEach(r => { out += `| ${Math.round(r.kb)} | ${r.type} | ${r.url.slice(0, 140)} |\n`; });
    out += `\n</details>\n`;
  }
}
await browser.close();
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
