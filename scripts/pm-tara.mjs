// Perlit Market (perlitmarket.com) karışım tanısı: bitkiye özel hazır toprakların içerik oranları ve "Kendin Seç"
// karışım robotunun bitkiye göre seçtiği bileşenler. Yalnız herkese açık sayfalar okunur; çıktı GitHub özetine yazılır
// (depoya kaydedilmez). Kimyasal (sentetik gübre vb.) bileşenler yalnız not edilir, tariflerde kullanılmaz.
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';
const SITE = 'https://perlitmarket.com';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'tr-TR' });
const p = await ctx.newPage();
const git = async (u) => { try { await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(2500); return true; } catch (e) { log('açılamadı ' + u + ' ' + e.message.slice(0, 80)); return false; } };
const metin = () => p.evaluate(() => {
  const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
  const h1 = ((document.querySelector('h1') || {}).innerText || document.title).trim();
  // Açıklama bölümü: oran / içerik / kullanım satırları
  const sat = t.split('\n').map((l) => l.trim()).filter((l) => l.length > 3 && l.length < 400 && /%|oran|içerik|içindekiler|bileşen|karışım|ph|drenaj|torf|perlit|pomza|cocopeat|kokopit|vermik|solucan|leonardit|kum|zeolit|bark|kabuk|akadama|kanuma|lav|kömür|humus|orman|yosun|ölçü|litre/i.test(l));
  return { h1, sat: [...new Set(sat)].slice(0, 70) };
});
const KAT = ['/bitkiye-ozel-toprak-karisimi', '/profesyonel-taze-toprak-serisi', '/profesyonel-taze-toprak-karisimlari-5-ve-10-litre'];
const SAY = new Set(['/pm-kaktus-sukulent-saksi-topragi-karisimi-5-litre', '/pm-limon-agaci-narenciye-saksi-topragi-karisimi-10-litre',
  '/pm-yaban-mersini-ortanca-saksi-topragi-karisimi-10-litre', '/pm-tohum-cimlendirme-saksi-topragi-karisimi-5-litre',
  '/banana-tropical-toprak-karisimi', '/bahce-topragi-guclendirici-sebze-karisimi-50-litre']);
// Kategori sayfalarındaki ürün bağlantıları
for (const k of KAT) {
  if (!(await git(SITE + k))) continue;
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 4000); await p.waitForTimeout(700); }
  const L = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ h: a.href.split(/[?#]/)[0], t: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim() })).filter((x) => x.h.startsWith(location.origin) && x.t.length > 8));
  const u = L.filter((x) => /topra|karış|karis|harç|mix|substrat/i.test(x.t));
  log(`\n### Kategori ${k}: ${u.length} ürün bağlantısı`);
  u.forEach((x) => { const yol = new URL(x.h).pathname; if (!KAT.includes(yol)) SAY.add(yol); log('  ' + yol + ' :: ' + x.t.slice(0, 90)); });
}
// Ürün sayfaları: içerik oranları
for (const s of [...SAY].slice(0, 60)) {
  if (!(await git(SITE + s))) continue;
  const v = await metin();
  log(`\n=== ${v.h1} (${s})\n${v.sat.join('\n')}`);
}
// "Kendin Seç" robotu: sayfa yapısı ve bitkiye göre seçim
if (await git(SITE + '/kendin-sec-bitki-topragi-karisimi')) {
  const v = await metin();
  log(`\n=== ROBOT ${v.h1}\n${v.sat.join('\n')}`);
  const yapi = await p.evaluate(() => ({
    girdiler: [...document.querySelectorAll('input, textarea, select, button')].filter((e) => e.offsetWidth).slice(0, 80).map((e) => `${e.tagName}${e.type ? '[' + e.type + ']' : ''} name=${e.name || ''} ph=${e.placeholder || ''} "${(e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 60)}"`),
    secenekler: [...document.querySelectorAll('label')].filter((e) => e.offsetWidth).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 80),
  }));
  log('GİRDİLER:\n' + yapi.girdiler.join('\n') + '\nETİKETLER:\n' + yapi.secenekler.join(' | '));
  const istek = []; p.on('request', (r) => { if (!/\.(png|jpe?g|webp|svg|woff2?|css)(\?|$)|google|facebook|analytics|gtm|hotjar|clarity/i.test(r.url())) istek.push(r.method() + ' ' + r.url().slice(0, 160) + (r.postData() ? ' ' + r.postData().slice(0, 300) : '')); });
  for (const bitki of ['monstera', 'limon', 'kaktüs', 'yaban mersini', 'domates', 'orkide', 'lavanta', 'zeytin', 'aloe vera', 'çilek', 'bonsai', 'eğrelti']) {
    istek.length = 0;
    const g = await p.$('input[type=text]:visible, input:not([type]):visible, textarea:visible, input[type=search]:visible');
    if (!g) { log('Robot: bitki kutusu bulunamadı'); break; }
    const once = await p.evaluate(() => document.body.innerText);
    await g.fill(''); await g.type(bitki, { delay: 40 }); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
    const btn = await p.$('button:has-text("Robot"), button:has-text("Öner"), button:has-text("Hesapla"), button:has-text("Oluştur"), button:has-text("Seç"), button:has-text("Getir")');
    if (btn) { await btn.click().catch(() => {}); }
    await p.waitForTimeout(4500);
    const sonra = await p.evaluate(() => ({ t: document.body.innerText, sec: [...document.querySelectorAll('input:checked, select')].map((e) => e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text : ((e.closest('label') || e.parentElement || {}).innerText || e.value)).map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean) }));
    const yeni = sonra.t.split('\n').map((l) => l.trim()).filter((l) => l && !once.includes(l)).slice(0, 40);
    log(`\n--- Robot "${bitki}" (düğme: ${btn ? 'var' : 'yok'})\nYENİ METİN: ${yeni.join(' / ')}\nSEÇİLİ: ${sonra.sec.join(' | ').slice(0, 900)}\nİSTEKLER: ${istek.slice(0, 8).join('\n  ')}`);
    await git(SITE + '/kendin-sec-bitki-topragi-karisimi');
  }
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n').slice(0, 900000) + '\n```\n');
