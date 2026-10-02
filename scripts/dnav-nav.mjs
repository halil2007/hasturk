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
const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error' && /pm-search|ua-|urun|Ürün/i.test(m.text() + ((m.location() || {}).url || ''))) errs.push('konsol: ' + m.text().slice(0, 200)); });
// Sayfa tam yeniden yüklenirken ölçüm denk gelirse biraz bekleyip tekrar dene
const state = async () => { for (let k = 0; ; k++) { try { return await state0(); } catch (e) { if (k > 10) throw e; await p.waitForTimeout(300); } } };
const state0 = () => p.evaluate(() => {
  const h = document.querySelector('.ua-dnav'), nav = document.querySelector('[data-ua-nav]');
  // ikas menüsünün görünen kategori bağlantıları (bizimkiler hariç)
  const vis = [...document.querySelectorAll('header a[href], nav a[href]')].filter((a) => !a.closest('.ua-dnav') && !a.closest('#ua-mega') && !a.closest('#ua-dnav-ghost')).filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 200 && getComputedStyle(a).visibility !== 'hidden'; }).length;
  return { biz: !!(h && h.isConnected), gizli: !!nav, ikasGorunen: vis, url: location.pathname };
});
await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(6000);
const base = await state();
log(`Başlangıç: ${JSON.stringify(base)} (başlıktaki logo/hesap gibi menü dışı bağlantılar: ${base.ikasGorunen})`);
let bad = 0;
for (let i = 0; i < 14; i++) {
  // Sırayla: bizim çubuktan kategori, sayfadaki bir ürün/kategori bağlantısı (ikas'ın kendi geçişi)
  await p.waitForLoadState('domcontentloaded').catch(() => {});
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
  // Her ölçümde bizim menü yerinde ve ikas'ın kategori bağlantıları görünmüyor olmalı (başlangıçtaki sayıyı aşmamalı)
  const ok = row.every((r) => r.biz && r.ikasGorunen <= base.ikasGorunen);
  if (!ok) {
    bad++;
    // Tanı: menü neden kurulamadı? (kaydırma, başlıktaki kategori bağlantılarının konumu, işaretler)
    const d = await p.evaluate(() => {
      const links = [...document.querySelectorAll('a[href]')].filter((a) => !a.closest('.ua-dnav,#ua-mega,#ua-dnav-ghost')).map((a) => { const r = a.getBoundingClientRect(); return { t: (a.textContent || '').trim().slice(0, 18), h: a.getAttribute('href'), top: Math.round(r.top), w: Math.round(r.width), vis: getComputedStyle(a).visibility }; }).filter((x) => x.top < 300 && x.top > -50 && x.w > 0).slice(0, 14);
      return { scrollY: Math.round(scrollY), pre: !!document.querySelector('[data-ua-pre]'), nav: !!document.querySelector('[data-ua-nav]'), headers: document.querySelectorAll('header').length, links };
    });
    log('   tanı: ' + JSON.stringify(d));
    if (errs.length) log('   hatalar: ' + errs.splice(0).join(' | '));
  }
  log(`${i + 1}. ${path} → 0,3sn: ${row[0].biz ? 'bizim' : 'YOK'}/${row[0].ikasGorunen} ikas | 1,5sn: ${row[1].biz ? 'bizim' : 'YOK'}/${row[1].ikasGorunen} | 4sn: ${row[2].biz ? 'bizim' : 'YOK'}/${row[2].ikasGorunen} ${ok ? '✓' : '✗'}`);
}
log(`Sonuç (${MODE}, ${SITE}): ${14 - bad}/14 geçişte menü yerinde`);
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
