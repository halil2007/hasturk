// Ürün Bul / Bilge Bey'den sepete ekleme (gerçek site, daldaki widget, telefon görünümü; anonim sepet, sipariş verilmez):
// varyantlı ürün + adet, aynı ürünü tekrar ekleme (adet artmalı), "Hepsini sepete ekle". Süre, sitenin sepeti, üst sayaç.
import { chromium } from 'playwright';
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const QUERY = process.env.QUERY || 'tarım perliti';
const AKQ = process.env.AKQ || 'Saksı çiçeklerine hangi gübre?';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const out = []; const log = (s) => { out.push(s); console.log(s); };
let bad = 0;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.route((u) => u.hostname === HOST && u.pathname === '/pm-search.js', (r) => r.fulfill({ status: 200, body: readFileSync('public/pm-search.js'), contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
const p = await ctx.newPage();
let frames = 0;
p.on('frameattached', () => frames++);
p.on('response', async (r) => {
  if (!/op=addItemToCart/i.test(r.url())) return;
  let t = ''; try { t = await r.text(); } catch (e) {}
  try { const j = JSON.parse(t), d = j.data && j.data.addItemToCart; log(`    · addItemToCart HTTP ${r.status()} ${j.errors ? 'HATA ' + JSON.stringify(j.errors).slice(0, 200) : (d.orderLineItems || []).length + ' satır'} · ${r.frame().parentFrame() ? 'GİZLİ ÇERÇEVE' : 'ana sayfa'}`); } catch (e) {}
});
const R = '#urun-arama-root >> ';
const cart = () => p.evaluate(() => {
  const el = document.getElementById('__next'), ck = el && Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
  const st = ck ? [el[ck]] : []; let cs = null, n = 0;
  while (st.length && !cs && n < 8000) { const f = st.pop(); n++; const q = f.memoizedProps; if (q && q.store && q.store.cartStore) cs = q.store.cartStore; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); }
  const c = cs && cs.cart, lines = c ? (c.items || []).map((x) => ({ ad: x.variant && x.variant.name, v: String(x.variant && x.variant.id).slice(0, 8), n: x.quantity })) : [];
  const hdr = [...document.querySelectorAll('[class*="basket" i], [class*="cart" i], a[href*="cart"]')].filter((e) => e.getBoundingClientRect().top < 200 && (e.offsetWidth || e.offsetHeight)).slice(0, 2).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 12));
  return { lines, sayac: hdr.join('/') };
});
const toast = () => p.evaluate(() => { const r = document.getElementById('urun-arama-root').shadowRoot; const t = r.querySelector('.ptoast.on, .xsell.on .xs-ok'); return t ? t.textContent.trim().slice(0, 120) : ''; });
const waitToast = async (t0) => { for (let i = 0; i < 120; i++) { const t = await toast(); if (t) return { ms: Date.now() - t0, t }; await p.waitForTimeout(100); } return { ms: Date.now() - t0, t: 'MESAJ YOK' }; };
const hideToast = () => p.evaluate(() => { const r = document.getElementById('urun-arama-root').shadowRoot; r.querySelectorAll('.ptoast.on,.xsell.on').forEach((x) => x.classList.remove('on')); });
const qtyOf = (c, v8) => (c.lines.find((x) => x.v === v8) || {}).n || 0;

await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.locator(R + '.fab:not(.akfab):not(.hide)').waitFor({ timeout: 30000 });
await p.waitForFunction(() => typeof window.addToCart === 'function', null, { timeout: 30000 }).catch(() => log('window.addToCart YOK'));
await p.waitForTimeout(1500);
log('Başlangıç sepeti: ' + JSON.stringify(await cart()));

// 1) Varyantlı ürün, 2. seçenek, adet 2
await p.locator(R + '.fab:not(.akfab)').tap();
await p.locator(R + '.top input').fill(QUERY);
await p.locator(R + '.results [data-act="add"]').first().waitFor({ timeout: 20000 });
// Seçenekli (2+ stoklu seçenek) ilk ürün: ürün verisinden
const MULTI = JSON.parse(readFileSync(SITE.includes('tarim-dunyasi') ? 'public/tarim/products.json' : 'public/products.json', 'utf8')).items
  .filter((x) => (x.v || []).filter((v) => v.st > 0).length >= 2).map((x) => x.id);
await p.waitForTimeout(800);
const pick = await p.evaluate((ids) => {
  const r = document.getElementById('urun-arama-root').shadowRoot;
  for (const bt of r.querySelectorAll('.results [data-act="add"]')) {
    if (!ids.includes(bt.getAttribute('data-v'))) continue;
    let el = bt; for (let i = 0; i < 4 && el.parentElement; i++) { el = el.parentElement; const n = el.querySelector('.pname'); if (n) return { id: bt.getAttribute('data-v'), name: n.textContent.trim() }; }
    return { id: bt.getAttribute('data-v'), name: '?' };
  }
  return null;
}, MULTI);
if (!pick) { log('Seçenekli ürün bulunamadı'); process.exit(1); }
const name = pick.name, ADD = R + `.results [data-act="add"][data-v="${pick.id}"]`;
const f0 = frames;
await p.locator(ADD).first().tap();
await p.locator(R + '.sheet.on').waitFor({ timeout: 5000 }).catch(() => {});
let vname = '', v8 = '';
if (await p.locator(R + '.sheet.on .vo:not([disabled])').count() > 1) {
  const vo = p.locator(R + '.sheet.on .vo:not([disabled])').nth(1);
  vname = (await vo.textContent()).trim(); v8 = String(await vo.getAttribute('data-v')).slice(0, 8);
  await vo.tap();
}
if (await p.locator(R + '.sheet.on [data-act="sq"][data-v="1"]').count()) await p.locator(R + '.sheet.on [data-act="sq"][data-v="1"]').tap(); else log('  adet seçici yok');
let t0 = Date.now();
await p.locator(R + '.sheet.on [data-act="shgo"]').tap();
let r = await waitToast(t0);
let c = await cart();
log(`1) "${name}" ${vname} x2 → ${r.ms} ms "${r.t}" · sepet ${JSON.stringify(c)} · gizli çerçeve: ${frames - f0}`);
if (!/eklendi/i.test(r.t) || qtyOf(c, v8) !== 2) { bad++; log('   ✗ beklenen: bu seçenekten 2 adet'); }
await hideToast();

// 2) Aynı ürünü tekrar (1 adet): adet 3 olmalı (ezilmemeli)
await p.locator(ADD).first().tap();
await p.locator(R + '.sheet.on').waitFor({ timeout: 5000 }).catch(() => {});
if (v8) await p.locator(R + `.sheet.on .vo[data-v^="${v8}"]`).tap();
t0 = Date.now();
await p.locator(R + '.sheet.on [data-act="shgo"]').tap();
r = await waitToast(t0); c = await cart();
log(`2) aynı seçenek tekrar x1 → ${r.ms} ms "${r.t}" · ${qtyOf(c, v8)} adet · sayaç ${c.sayac}`);
if (qtyOf(c, v8) !== 3) { bad++; log('   ✗ beklenen 3 adet'); }
await hideToast();

// 3) Bilge Bey: Hepsini sepete ekle
await p.locator(R + '.xbtn[data-act="close"]').first().tap().catch(() => {});
await p.keyboard.press('Escape').catch(() => {});
await p.waitForTimeout(600);
await p.locator(R + '.fab.akfab').tap().catch(async () => { log('  akfab yok, Ürün Bul içinden'); });
await p.locator(R + '[data-act="akgrp"][data-v="1"]').first().tap({ timeout: 10000 }).catch(() => log('  konu düğmesi yok'));
await p.locator(R + `[data-act="akq"][data-v="${AKQ}"]`).first().tap({ timeout: 5000 }).catch(async () => {
  log('  öneri düğmesi yok; soru yazılıyor');
  const inp = p.locator(R + '.akf input').first(); await inp.fill(AKQ.replace(/\?$/, '')); await inp.press('Enter');
});
await p.locator(R + '.akall').last().waitFor({ timeout: 30000 }).catch(() => log('  "Hepsini sepete ekle" çıkmadı'));
if (await p.locator(R + '.akall').count()) {
  const before = await cart();
  await p.locator(R + '.akall').last().tap();
  await p.locator(R + '.sheet.on [data-act="bgo"]').waitFor({ timeout: 5000 });
  const sec = await p.locator(R + '.sheet.on .bl:not(.off) .blt b').allTextContents();
  const f1 = frames; t0 = Date.now();
  await p.locator(R + '.sheet.on [data-act="bgo"]').tap();
  r = await waitToast(t0); c = await cart();
  const added = c.lines.reduce((a, x) => a + x.n, 0) - before.lines.reduce((a, x) => a + x.n, 0);
  log(`3) Hepsini sepete ekle (${sec.length}: ${sec.join(' + ')}) → ${r.ms} ms "${r.t}" · sepete ${added} adet eklendi · sayaç ${c.sayac} · gizli çerçeve: ${frames - f1}`);
  if (added !== sec.length || !/eklendi/.test(r.t) || /eklenemedi/.test(r.t)) { bad++; log('   ✗ hepsi eklenmedi'); }
}
log('Ekleme kaydı: ' + String(await p.evaluate(() => localStorage.getItem('ua-addlog'))).slice(0, 600));
log(bad ? `SONUÇ: ${bad} sorun` : 'SONUÇ: hepsi doğru');
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
process.exit(bad ? 1 : 0);
