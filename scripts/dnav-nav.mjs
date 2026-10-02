// Masaüstü menüsü sayfa geçişlerinde kalıcı mı? Canlı sitede kategoriler/ürünler arasında gezinip her geçişten
// 0,3 / 1,5 / 4 sn sonra bizim menü (.ua-dnav) yerinde mi ve ikas'ın kendi menü öğeleri gizli mi kaydedilir.
// MODE=canli (yayındaki) | yeni (daldaki public/pm-search.js). SITE_URL ile site seçilir.
import { chromium } from 'playwright';
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const MODE = process.env.MODE || 'canli';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const out = [];
const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
if (MODE === 'yeni') await ctx.route((u) => u.hostname === HOST && u.pathname === '/pm-search.js', (r) => r.fulfill({ status: 200, body: readFileSync('public/pm-search.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
const p = await ctx.newPage();
const state = () => p.evaluate(() => {
  const h = document.querySelector('.ua-dnav'), nav = document.querySelector('[data-ua-nav]');
  // ikas menüsünün görünen kategori bağlantıları (bizimkiler hariç)
  const vis = [...document.querySelectorAll('header a[href], nav a[href]')].filter((a) => !a.closest('.ua-dnav') && !a.closest('#ua-mega') && !a.closest('#ua-dnav-ghost')).filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 200 && getComputedStyle(a).visibility !== 'hidden'; }).length;
  return { biz: !!(h && h.isConnected), gizli: !!nav, ikasGorunen: vis, url: location.pathname };
});
await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(6000);
log(`Başlangıç: ${JSON.stringify(await state())}`);
let bad = 0;
for (let i = 0; i < 10; i++) {
  // Sırayla: bizim çubuktan kategori, sayfadaki bir ürün/kategori bağlantısı (ikas'ın kendi geçişi)
  const target = await p.evaluate((i) => {
    const ours = [...(document.querySelector('.ua-dnav') && document.querySelector('.ua-dnav').shadowRoot ? document.querySelector('.ua-dnav').shadowRoot.querySelectorAll('.ti[href]') : [])].map((a) => a.href);
    const page = [...document.querySelectorAll('main a[href], #__next a[href]')].map((a) => a.href).filter((h) => { try { const u = new URL(h); return u.origin === location.origin && u.pathname.split('/').length === 2 && u.pathname !== location.pathname && !/cart|account|sepet|login|blog|pages/.test(u.pathname); } catch (e) { return false; } });
    const list = i % 2 === 0 && ours.length ? ours : page;
    return list.length ? list[(i * 3) % list.length] : null;
  }, i);
  if (!target) { log(`${i + 1}. geçiş: bağlantı bulunamadı`); continue; }
  const path = new URL(target).pathname;
  // Gerçek kullanıcı gibi tıkla (ikas'ın SPA geçişi); bağlantı görünür değilse adresle git
  const clicked = await p.evaluate((href) => {
    const host = document.querySelector('.ua-dnav'), cand = [...document.querySelectorAll('a[href]')].concat(host && host.shadowRoot ? [...host.shadowRoot.querySelectorAll('a[href]')] : []);
    const a = cand.find((x) => x.href === href); if (!a) return false; a.click(); return true;
  }, target);
  if (!clicked) await p.goto(target);
  const row = [];
  for (const t of [300, 1500, 4000]) { await p.waitForTimeout(t - (row.length ? [300, 1500, 4000][row.length - 1] : 0)); row.push(await state()); }
  const ok = row[2].biz && row[2].gizli && row[2].ikasGorunen === 0;
  if (!ok) bad++;
  log(`${i + 1}. ${path} → 0,3sn: ${row[0].biz ? 'bizim' : 'YOK'}/${row[0].ikasGorunen} ikas | 1,5sn: ${row[1].biz ? 'bizim' : 'YOK'}/${row[1].ikasGorunen} | 4sn: ${row[2].biz ? 'bizim' : 'YOK'}/${row[2].ikasGorunen} ${ok ? '✓' : '✗'}`);
}
log(`Sonuç (${MODE}, ${SITE}): ${10 - bad}/10 geçişte menü yerinde`);
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
