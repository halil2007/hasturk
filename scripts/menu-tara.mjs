// Menü sistemi taraması (canlı site; telefon + bilgisayar): Ürün Bul paneli ve sekmeleri (Bilge Bey, Kategoriler,
// Kaç Litre?, Rehber, Sayfalar), arama, masaüstü kategori menüsü; kırık bağlantı ve görsel, taşan öğe, konsol hatası,
// Worker uç noktaları. Anonim; sipariş verilmez, sepete bir şey eklenmez. Bilge Bey istekleri test olarak işaretlenir.
// Müşteri metni (soru, arama) çıktıya yazılmaz; yalnız sayılar ve bizim içeriğimiz.
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL || 'https://hasturkgubre.com.tr').replace(/\/$/, '');
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const out = [], sorun = [];
const log = (s) => { out.push(s); console.log(s); };
const S = (s) => { sorun.push(s); log('   ✗ ' + s); };
const R = '#urun-arama-root >> ';
const PROF = {
  telefon: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  bilgisayar: { viewport: { width: 1366, height: 860 } },
};
const hrefs = new Set();
const b = await chromium.launch();

// Shadow root içindeki görünür öğelerden ekran dışına taşanlar (yatay kaydırma yaratan)
const tasan = (p) => p.evaluate(() => {
  const r = document.getElementById('urun-arama-root').shadowRoot, W = innerWidth, bad = [];
  r.querySelectorAll('.panel *').forEach((e) => {
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (!(b.right > W + 2 || b.left < -2)) return;
    // Yatay kayan şerit içindeyse (ürün şeritleri, sekme/çip satırları) taşma değildir
    for (let a = e.parentElement; a && a !== r.host; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return; }
    const ad = (x) => (x && (typeof x.className === 'string' ? x.className : x.getAttribute && x.getAttribute('class')) || x.tagName || '').toString().slice(0, 24);
    bad.push(ad(e) + ' ⊂ ' + ad(e.parentElement) + ' "' + (e.textContent || '').trim().slice(0, 20) + '"');
  });
  const pn = r.querySelector('.panel .body, .panel');
  return { n: bad.length, ilk: [...new Set(bad)].slice(0, 5), yatay: pn ? pn.scrollWidth > pn.clientWidth + 2 : false };
});
const kirikGorsel = (p) => p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('img')]
  .filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src').slice(0, 90)));
const linkTopla = (p) => p.evaluate(() => {
  const al = (root) => root ? [...root.querySelectorAll('a[href]')].map((a) => a.href) : [];
  const sr = (sel) => { const h = document.querySelector(sel); return h && h.shadowRoot; };
  return [...al(sr('#urun-arama-root')), ...al(sr('.ua-dnav')), ...al(sr('#ua-mega'))];
});
const metin = (p, sel) => p.evaluate((s) => { const e = document.getElementById('urun-arama-root').shadowRoot.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }, sel);

for (const [ad, opt] of Object.entries(PROF)) {
  log(`\n=== ${SITE.replace('https://', '')} · ${ad}`);
  const ctx = await b.newContext(opt);
  await ctx.route((u) => u.hostname === HOST && u.pathname === '/ak', (r) => r.continue({ headers: { ...r.request().headers(), 'x-ak-test': '1' } }));
  const p = await ctx.newPage();
  const hatalar = [], ag = [];
  p.on('pageerror', (e) => hatalar.push('sayfa: ' + String(e.message).slice(0, 140)));
  p.on('console', (m) => { if (m.type() === 'error' && /pm-search|urun-arama|ua-|hasturk-arama/i.test(m.text() + (m.location().url || ''))) hatalar.push('konsol: ' + m.text().slice(0, 140)); });
  p.on('response', (r) => { if (r.url().includes(HOST) && r.status() >= 400) ag.push(r.status() + ' ' + new URL(r.url()).pathname); });
  p.on('requestfailed', (r) => { if (r.url().includes(HOST)) ag.push('başarısız ' + new URL(r.url()).pathname + ' ' + (r.failure() || {}).errorText); });
  const t0 = Date.now();
  await p.goto(SITE + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const fabOk = await p.locator(R + '.fab:not(.akfab):not(.hide)').waitFor({ timeout: 30000 }).then(() => true, () => false);
  log(`Ürün Bul düğmesi: ${fabOk ? ((Date.now() - t0) / 1000).toFixed(1) + ' sn' : 'ÇIKMADI'}`);
  if (!fabOk) { S(`${ad}: Ürün Bul düğmesi 30 sn içinde çıkmadı`); await ctx.close(); continue; }
  await p.waitForTimeout(2500);

  // Masaüstü kategori menüsü (ikas menüsünün yerine geçen çubuk + açılır menü)
  if (ad === 'bilgisayar') {
    const bar = await p.evaluate(() => { const h = document.querySelector('.ua-dnav'); const r = h && h.shadowRoot; return r ? [...r.querySelectorAll('.bar a.ti')].map((a) => ({ n: a.textContent.trim(), alt: a.getAttribute('aria-haspopup') === 'true' })) : null; });
    if (!bar) log('Masaüstü menü: kurulmamış (bu sitede kapalı olabilir)');
    else {
      log(`Masaüstü menü: ${bar.length} başlık (${bar.filter((x) => x.alt).length} açılır)`);
      const tis = p.locator('.ua-dnav >> .bar a.ti[aria-haspopup="true"]');
      const n = await tis.count();
      for (let i = 0; i < n; i++) {
        await tis.nth(i).hover(); await p.waitForTimeout(450);
        const mm = await p.evaluate(() => { const h = document.getElementById('ua-mega'); const r = h && h.shadowRoot; if (!r) return null; const v = [...r.querySelectorAll('a[href]')].filter((a) => a.getBoundingClientRect().height > 0); return v.length; });
        if (!mm) S(`masaüstü menü: "${bar.filter((x) => x.alt)[i].n}" açılır menüsü boş ya da açılmadı`);
      }
      (await linkTopla(p)).forEach((h) => hrefs.add(h));
      await p.mouse.move(5, 700); await p.waitForTimeout(300);
    }
  }

  // Panel ve sekmeler
  await p.locator(R + '.fab:not(.akfab)').click();
  await p.locator(R + '.panel').waitFor({ timeout: 8000 });
  await p.waitForTimeout(800);
  const sekmeler = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.tb')].map((t) => t.getAttribute('data-v')));
  log(`Sekmeler: ${sekmeler.join(', ')}`);
  for (const t of sekmeler) {
    await p.locator(R + `.tb[data-v="${t}"]`).click(); await p.waitForTimeout(900);
    const tx = await p.evaluate(() => { const r = document.getElementById('urun-arama-root').shadowRoot; const v = [...r.querySelectorAll('.panel > *')].filter((e) => e.offsetHeight && !e.classList.contains('tabs')); return v.map((e) => e.innerText).join(' ').replace(/\s+/g, ' ').trim().length; });
    const ts = await tasan(p);
    log(`  [${t}] içerik ${tx} karakter${ts.n ? ` · taşan ${ts.n} öğe (${ts.ilk.join(', ')})` : ''}${ts.yatay ? ' · YATAY KAYDIRMA' : ''}`);
    if (tx < 40) S(`${ad} [${t}] sekmesi boş görünüyor`);
    if (ts.n || ts.yatay) { S(`${ad} [${t}] ekrandan taşan öğe: ${ts.ilk.join(', ') || 'panel'}`); await p.screenshot({ path: `tara-${ad}-${t}.png` }).catch(() => {}); }
    (await linkTopla(p)).forEach((h) => hrefs.add(h));

    if (t === 'home') {
      // Tüm kategoriler: ilk 4 ana kategoriye gir, ürün sayısı > 0 olmalı
      await p.evaluate(() => { const b = document.getElementById('urun-arama-root').shadowRoot.querySelector('[data-act="catx"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });
      await p.waitForTimeout(500);
      const cats = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('[data-act="cat"]')].filter((b) => b.offsetHeight).map((b) => b.getAttribute('data-v')).filter(Boolean));
      const catLink = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.panel a.li, .panel aside a')].filter((a) => a.offsetHeight).length);
      log(`  Kategoriler: ${cats.length} kategori düğmesi, ${catLink} kategori bağlantısı`);
      if (!cats.length && !catLink) S(`${ad}: Kategoriler sekmesinde kategori yok`);
      await p.screenshot({ path: `tara-${ad}-kategoriler.png` }).catch(() => {});
      for (const c of cats.slice(0, 4)) {
        await p.evaluate((v) => { const b = [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('[data-act="cat"]')].find((x) => x.getAttribute('data-v') === v && x.offsetHeight); if (b) b.click(); }, c);
        await p.waitForTimeout(900);
        const n = await p.evaluate(() => document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.pname, [data-act="add"], .hp, .li').length);
        if (!n) S(`${ad}: "${c}" kategorisi boş açıldı`);
        (await linkTopla(p)).forEach((h) => hrefs.add(h));
        await p.evaluate(() => { const b = document.getElementById('urun-arama-root').shadowRoot.querySelector('[data-act="back"]'); if (b && b.offsetHeight) b.click(); });
        await p.waitForTimeout(500);
      }
    }
    if (t === 'calc') {
      const ins = p.locator(R + '.panel input[inputmode="decimal"]');
      const k = await ins.count();
      for (let i = 0; i < k; i++) if (await ins.nth(i).isVisible()) await ins.nth(i).fill('40');
      await p.waitForTimeout(700);
      const res = await metin(p, '.res');
      log(`  Kaç Litre: ${k} ölçü kutusu · sonuç: ${res.slice(0, 80) || 'YOK'}`);
      if (!/litre|L\b/i.test(res)) S(`${ad}: Kaç Litre hesaplayıcı sonuç vermedi`);
    }
    if (t === 'guide') {
      const gq = p.locator(R + 'input[data-k="gq"]');
      if (await gq.count()) {
        await gq.fill('domates'); await p.waitForTimeout(900);
        const g = await metin(p, '.gres');
        log(`  Rehber "domates": ${g.length} karakter${/toprak/i.test(g) ? ' (toprak kartı var)' : ''}`);
        if (g.length < 40) S(`${ad}: Rehber araması sonuç vermedi`);
        await gq.fill('');
      } else S(`${ad}: Rehber arama kutusu yok`);
    }
    if (t === 'ak') {
      const chips = await p.evaluate(() => document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.akbas button, .akbas [data-act]').length);
      log(`  Bilge Bey: ${chips} hazır soru düğmesi`);
    }
  }

  // Arama
  await p.locator(R + '.tb[data-v="home"]').click(); await p.waitForTimeout(400);
  for (const q of ['perlit', 'solucan gübresi', 'saksı', 'xqzvwk']) {
    await p.locator(R + '.top input').fill(q); await p.waitForTimeout(1200);
    const n = await p.evaluate(() => document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('.results .pname').length);
    const bos = await metin(p, '.results .empty, .empty');
    log(`  Arama "${q}": ${n} ürün${!n ? ' · boş sonuç ekranı: ' + (bos ? 'var' : 'YOK') : ''}`);
    if (q !== 'xqzvwk' && !n) S(`${ad}: "${q}" araması sonuç vermedi`);
    if (q === 'xqzvwk' && !n && !bos) S(`${ad}: sonuçsuz aramada bilgi mesajı yok`);
    (await linkTopla(p)).forEach((h) => hrefs.add(h));
  }
  await p.locator(R + '.top input').fill('');
  const kg = await kirikGorsel(p);
  if (kg.length) S(`${ad}: ${kg.length} kırık görsel (ör. ${kg[0]})`);

  // Kapatma: bilgisayarda Esc, telefonda geri tuşu sayfadan çıkmadan paneli kapatmalı
  const url0 = p.url();
  if (ad === 'bilgisayar') await p.keyboard.press('Escape'); else await p.goBack().catch(() => {});
  await p.waitForTimeout(900);
  const acik = await p.evaluate(() => { const r = document.getElementById('urun-arama-root'); const o = r && r.shadowRoot.querySelector('.ov'); return !!(o && (o.classList.contains('on') || o.classList.contains('open') || getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility !== 'hidden' && o.getBoundingClientRect().height > 0)); });
  log(`  ${ad === 'bilgisayar' ? 'Esc' : 'Geri tuşu'}: panel ${acik ? 'AÇIK KALDI' : 'kapandı'} · sayfa ${p.url() === url0 ? 'aynı' : 'DEĞİŞTİ (' + p.url().slice(0, 60) + ')'}`);
  if (acik) S(`${ad}: ${ad === 'bilgisayar' ? 'Esc' : 'geri tuşu'} paneli kapatmadı`);
  if (p.url() !== url0) S(`${ad}: geri tuşu paneli kapatmak yerine sayfadan çıktı`);

  // Erişilebilirlik: adı olmayan düğmeler
  const adsiz = await p.evaluate(() => [...document.getElementById('urun-arama-root').shadowRoot.querySelectorAll('button')].filter((x) => !(x.getAttribute('aria-label') || x.textContent.trim() || x.title)).length);
  if (adsiz) S(`${ad}: ${adsiz} düğmenin ekran okuyucu adı yok`);
  log(`  Hatalar: ${hatalar.length ? hatalar.slice(0, 5).join(' | ') : 'yok'} · Worker istek sorunu: ${ag.length ? [...new Set(ag)].slice(0, 5).join(', ') : 'yok'}`);
  hatalar.forEach((h) => S(`${ad}: ${h}`));
  [...new Set(ag)].forEach((h) => S(`${ad}: Worker isteği ${h}`));
  await ctx.close();
}

// Kırık bağlantılar (sitenin kendi adresleri)
const host = new URL(SITE).hostname;
const liste = [...hrefs].map((h) => h.split('#')[0]).filter((h) => { try { const u = new URL(h); return u.hostname === host && u.protocol.startsWith('http'); } catch (e) { return false; } });
const tekil = [...new Set(liste)].slice(0, 400);
log(`\n=== Bağlantı kontrolü: ${tekil.length} adres`);
const rc = await b.newContext();
const kirik = [];
for (let i = 0; i < tekil.length; i += 8) {
  await Promise.all(tekil.slice(i, i + 8).map(async (u) => {
    const r = await rc.request.get(u, { maxRedirects: 5, timeout: 30000 }).catch((e) => ({ status: () => 0, e }));
    const st = r.status(); if (st >= 400 || st === 0) kirik.push(st + ' ' + u.replace(SITE, ''));
  }));
}
log(kirik.length ? 'Kırık:\n  ' + kirik.join('\n  ') : 'Kırık bağlantı yok');
kirik.forEach((k) => S('kırık bağlantı ' + k));

// Worker uç noktaları: kim erişebiliyor, ne gösteriyor (içerik değil, yalnız durum ve alanlar)
log('\n=== Worker uç noktaları');
for (const [yol, not] of [['/tasi', 'veritabanı taşıma'], ['/trends', 'arama/ürün eğilimi'], ['/ak/populer', 'en çok sorulanlar'], ['/ak/sayac', 'sayaç'], ['/ak/rapor', 'rapor'], ['/ai/durum', 'anahtar durumu'], ['/ak/inceleme', 'şifreli inceleme'], ['/tarif-anahtar', 'açık anahtar']]) {
  const r = await rc.request.get(`https://${HOST}${yol}`, { timeout: 30000 }).catch(() => null);
  let ozet = '';
  if (r) { const t = await r.text().catch(() => ''); try { const j = JSON.parse(t); ozet = 'alanlar: ' + Object.keys(j).slice(0, 8).join(','); if (Array.isArray(j.sorular)) ozet += ` · ${j.sorular.length} soru (metin gösterilmedi)`; } catch (e) { ozet = t.length + ' bayt'; } }
  log(`  ${yol} (${not}): ${r ? r.status() : 'erişilemedi'} · ${ozet}`);
}
await b.close();
log(`\n=== SONUÇ: ${sorun.length ? sorun.length + ' sorun' : 'sorun bulunmadı'}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
