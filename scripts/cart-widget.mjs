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
// Bilge Bey soruları test olarak işaretlenir (gerçek müşteri istatistiğine karışmaz)
await ctx.route((u) => u.hostname === HOST && u.pathname === '/ak', (r) => r.continue({ headers: { ...r.request().headers(), 'x-ak-test': '1' } }));
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
const tq = Date.now();
await p.locator(R + '.top input').fill(QUERY);
await p.locator(R + '.results [data-act="add"]').first().waitFor({ timeout: 20000 });
log(`Arama sonucu: ${Date.now() - tq} ms`);
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
await p.waitForTimeout(1500); // müşteri soruları okurken
const tak = Date.now();
await p.locator(R + `[data-act="akq"][data-v="${AKQ}"]`).first().tap({ timeout: 5000 }).catch(async () => {
  log('  öneri düğmesi yok; soru yazılıyor');
  const inp = p.locator(R + '.akf textarea').first(); await inp.fill(AKQ.replace(/\?$/, '')); await inp.press('Enter');
});
await p.locator(R + '.akall').last().waitFor({ timeout: 30000 }).catch(() => log('  "Hepsini sepete ekle" çıkmadı'));
log(`Bilge Bey cevabı (soruya dokunduktan sonra): ${Date.now() - tak} ms`);
if (await p.locator(R + '.akall').count()) {
  const before = await cart();
  await p.locator(R + '.akall').last().tap();
  await p.locator(R + '.sheet.on [data-act="bgo"]').waitFor({ timeout: 5000 });
  const sec = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.akbl:not(.akoff) .blt b')].map((x) => x.textContent.trim()));
  const f1 = frames; t0 = Date.now();
  await p.locator(R + '.sheet.on [data-act="bgo"]').tap();
  r = await waitToast(t0); c = await cart();
  const added = c.lines.reduce((a, x) => a + x.n, 0) - before.lines.reduce((a, x) => a + x.n, 0);
  log(`3) Hepsini sepete ekle (${sec.length}: ${sec.join(' + ')}) → ${r.ms} ms "${r.t}" · sepete ${added} adet eklendi · sayaç ${c.sayac} · gizli çerçeve: ${frames - f1}`);
  if (added !== sec.length || !/eklendi/.test(r.t) || /eklenemedi/.test(r.t)) { bad++; log('   ✗ hepsi eklenmedi'); }
}
// Son Bilge Bey cevabının toprak kartı (metin, "Hepsini sepete ekle" var mı)
const sonKart = () => p.evaluate(() => { const r = document.getElementById('urun-arama-root').shadowRoot, pw = r.querySelectorAll('.akpw'), lp = pw[pw.length - 1]; const s = lp && lp.querySelector('.soil'); return { t: s ? s.innerText.replace(/\s+/g, ' ').slice(0, 300) : '-', hepsi: lp ? lp.querySelectorAll('.akall').length : 0 }; });
const sor = async (q) => { const n0 = await p.evaluate(() => document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.akpw').length); await p.locator(R + '.akf textarea').first().fill(q); await p.locator(R + '.akf textarea').first().press('Enter');
  for (let i = 0; i < 150; i++) { if (await p.evaluate((n) => document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.akpw').length > n, n0)) break; await p.waitForTimeout(100); } await p.waitForTimeout(1500); return sonKart(); };
// 4) Kendi karışımını hazırlat (yalnız HasTürk): müşterinin gerçekte yazdığı gibi (yazım hatası, sesle yazma), tarifle sepete ekle
if (!SITE.includes('tarim')) {
  const bg = await sor('Bengovil toprağı lazım');
  log(`4a) "Bengovil toprağı lazım" → ${bg.t} · hepsini ekle: ${bg.hepsi}`);
  if (!/Begonvil Toprağı/.test(bg.t) || bg.hepsi) { bad++; log('   ✗ Begonvil toprağı önerilmedi'); }
  const kz = await sor('E kızılcık toprağı hazırlayabilir misin kendi toprak karışımı oluştur önünden');
  log(`4b) Kızılcık karışım isteği → ${kz.t} · hepsini ekle: ${kz.hepsi}`);
  if (!/Kızılcık/.test(kz.t) || !/karışımınız/.test(kz.t) || kz.hepsi) { bad++; log('   ✗ kızılcık karışımı hazırlanmadı'); }
  const kb = p.locator(R + '.kbtn').last();
  if (await kb.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
    log('   düğme: ' + (await kb.textContent()).trim());
    await kb.tap();
    await p.locator(R + '.kar [data-act="kargo"]').waitFor({ timeout: 10000 });
    const sat = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.kar .kr:not(.kz)')].map((x) => x.innerText.replace(/\s+/g, ' ')).join(' | '));
    const top = (await p.locator(R + '.kar .btot b').textContent()).trim();
    const once = await cart();
    await hideToast();
    const t0k = Date.now();
    await p.locator(R + '.kar [data-act="kargo"]').tap();
    let rk = { t: '' };
    for (let i = 0; i < 100 && !/Karışım/i.test(rk.t); i++) { await p.waitForTimeout(100); rk = { ms: Date.now() - t0k, t: await toast() }; }
    await p.waitForTimeout(500);
    const sonra = await cart();
    log(`4) Karışım: ${sat} · ekranda ${top} → ${rk.ms} ms "${rk.t}" · sepet satırı ${once.lines.length} → ${sonra.lines.length}`);
    const tutar = await p.evaluate(() => { const el = document.getElementById('__next'), ck = el && Object.keys(el).find((k) => k.startsWith('__reactContainer$')); const st = ck ? [el[ck]] : []; let cs = null, n = 0; while (st.length && !cs && n < 8000) { const f = st.pop(); n++; const q = f.memoizedProps; if (q && q.store && q.store.cartStore) cs = q.store.cartStore; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); } const its = (cs && cs.cart && cs.cart.items || []).filter((i) => /Kendi Toprak/.test(i.variant && i.variant.name || '')); return its.map((i) => i.finalPrice).join(','); });
    log('   sepetteki karışım tutarı: ' + tutar);
    if (!/eklendi/.test(rk.t) || sonra.lines.length !== once.lines.length + 1) { bad++; log('   ✗ karışım eklenmedi'); }
  } else { bad++; log('   ✗ "Bu tarifle hazırlat" düğmesi çıkmadı'); }
  // 5) Karışım sekmesi: tarif çipi + serbest litre (250 L → paketlere bölünür), sepette adet ve paket fiyatı
  await p.locator(R + '.tb[data-v="mix"]').click();
  await p.locator(R + '.mx-c button').first().waitFor({ timeout: 15000 });
  await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.mx-c button')].find((b) => b.textContent === 'Kaktüs').click());
  await p.waitForTimeout(1500);
  await p.locator(R + 'input[data-k="mxL"]').fill('250'); await p.waitForTimeout(500);
  const ozet = (await p.locator(R + '.mx-s').innerText()).replace(/\s+/g, ' ');
  const q5 = +((ozet.match(/(\d+) paket/) || [])[1] || 1);
  const once5 = await cart(); await hideToast();
  const t5 = Date.now();
  await p.locator(R + '.mx [data-act="kargo"]').tap();
  let r5 = { t: '' };
  for (let i = 0; i < 100 && !/Karışım/i.test(r5.t); i++) { await p.waitForTimeout(100); r5 = { ms: Date.now() - t5, t: await toast() }; }
  await p.waitForTimeout(500);
  const satir = await p.evaluate(() => { const el = document.getElementById('__next'), ck = el && Object.keys(el).find((k) => k.startsWith('__reactContainer$')); const st = ck ? [el[ck]] : []; let cs = null, n = 0; while (st.length && !cs && n < 8000) { const f = st.pop(); n++; const q = f.memoizedProps; if (q && q.store && q.store.cartStore) cs = q.store.cartStore; if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); } return (cs && cs.cart && cs.cart.items || []).filter((i) => /Kendi Toprak/.test(i.variant && i.variant.name || '')).map((i) => i.quantity + ' adet × ' + i.finalPrice).join(', '); });
  log(`5) Karışım sekmesi (Kaktüs, 250 L): ${ozet.slice(0, 160)} → ${r5.ms} ms "${r5.t}" · sepetteki karışım satırları: ${satir}`);
  if (!/eklendi/.test(r5.t) || !new RegExp('(^|, )' + q5 + ' adet').test(satir)) { bad++; log('   ✗ karışım sekmesinden doğru adetle eklenmedi'); }
}
log('Ekleme kaydı: ' + String(await p.evaluate(() => localStorage.getItem('ua-addlog'))).slice(0, 600));
log(bad ? `SONUÇ: ${bad} sorun` : 'SONUÇ: hepsi doğru');
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
process.exit(bad ? 1 : 0);
