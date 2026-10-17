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
  const oran = v.sat.filter((l) => /^%\s?\d|^\d+\s?%|%\d+ |Bileşenler /.test(l));
  log(`=== ${v.h1.slice(0, 80)} (${s}) :: ${oran.join(' | ').slice(0, 700) || '-'}`);
}
// "Kendin Seç" robotu: tariflerini /_pmw/api/karisim/liste adresinden alıyor; önce doğrudan okunur, sonra robot düğmesiyle denenir
if (await git(SITE + '/kendin-sec-bitki-topragi-karisimi')) {
  const api = await p.evaluate(async () => { try { const r = await fetch('/_pmw/api/karisim/liste'); return { http: r.status, t: await r.text() }; } catch (e) { return { hata: String(e) }; } });
  log(`\n### ROBOT API /_pmw/api/karisim/liste HTTP ${api.http} ${api.hata || ''} uzunluk ${(api.t || '').length}`);
  try {
    const j = JSON.parse(api.t);
    const dizi = Array.isArray(j) ? j : Object.values(j).find(Array.isArray) || [];
    log('anahtarlar: ' + (Array.isArray(j) ? 'dizi' : Object.keys(j).join(',')) + ' | kayıt: ' + dizi.length);
    log('ilk kayıtlar: ' + JSON.stringify(dizi.slice(0, 3)).slice(0, 3000));
    dizi.forEach((x) => log('  ' + JSON.stringify(x).slice(0, 600)));
    if (!dizi.length) log(api.t.slice(0, 20000));
  } catch (e) { log((api.t || '').slice(0, 20000)); }
  const yanit = [];
  p.on('response', async (r) => { if (!/_pmw\/api\/(?!olay)/.test(r.url())) return; let t = ''; try { t = await r.text(); } catch (e) {} yanit.push(r.request().method() + ' ' + r.url().replace(SITE, '') + ' ' + (r.request().postData() || '').slice(0, 200) + ' → ' + t.slice(0, 1500)); });
  for (const bitki of ['monstera', 'limon', 'kaktüs', 'yaban mersini', 'domates', 'orkide', 'lavanta', 'zeytin']) {
    yanit.length = 0;
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /yapay zek|robot/i.test(x.innerText)); if (b) b.click(); });
    await p.waitForTimeout(1500);
    const kutu = await p.evaluate(() => [...document.querySelectorAll('input, textarea')].filter((e) => e.offsetWidth && !/mail/i.test(e.placeholder || '') && e.type !== 'number').map((e) => e.placeholder || e.name || e.type));
    const g = (await p.$$('input:visible, textarea:visible')).length ? await p.evaluateHandle(() => [...document.querySelectorAll('input, textarea')].reverse().find((e) => e.offsetWidth && !/mail/i.test(e.placeholder || '') && e.type !== 'number' && e.type !== 'checkbox' && e.type !== 'radio')) : null;
    if (g && g.asElement()) { await g.asElement().fill(bitki); await p.keyboard.press('Enter'); }
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.offsetWidth).find((x) => /oluştur|öner|hazırla|gönder|bul|seç/i.test(x.innerText) && !/sepete/i.test(x.innerText)); if (b) b.click(); });
    await p.waitForTimeout(5000);
    const ekran = await p.evaluate(() => { const d = [...document.querySelectorAll('[class*="rb" i], [id*="rb" i], [class*="robot" i], [id*="robot" i], [role="dialog"]')].filter((e) => e.offsetWidth); return d.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' || ').slice(0, 1500); });
    log(`\n--- Robot "${bitki}" kutular: ${kutu.join(',')}\nEKRAN: ${ekran}\nAPI: ${yanit.join('\n  ')}`);
    await git(SITE + '/kendin-sec-bitki-topragi-karisimi');
  }
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n').slice(0, 900000) + '\n```\n');
