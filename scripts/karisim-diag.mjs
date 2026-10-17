// "Kendi Toprak Karışımını Oluştur" ürün sayfası tanısı (gerçek site, anonim sepet, sipariş verilmez): ürünün ikas
// seçenek yapısı (productOptionSet: adımlar, bileşenler, litre, fiyatlar), sayfadaki seçim öğeleri ve bir seçimle sepete
// eklerken giden istek (options biçimi). Çıktı: GitHub özetine yazılır.
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const URL_ = SITE + '/' + (process.env.PRODUCT || 'kendi-toprak-karisimini-olustur');
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
await ctx.route((u) => u.hostname === 'hasturk-arama.halilc2007.workers.dev', (r) => r.abort());
const p = await ctx.newPage();
const reqs = [];
p.on('request', (r) => { if (/op=\w*cart/i.test(r.url()) && r.method() === 'POST') reqs.push(r.postData() || ''); });
p.on('response', async (r) => { if (!/op=\w*cart/i.test(r.url())) return; try { const j = await r.json(); const d = j.data && Object.values(j.data)[0]; log('  cevap ' + (j.errors ? 'HATA ' + JSON.stringify(j.errors).slice(0, 300) : d ? JSON.stringify((d.orderLineItems || []).map((x) => ({ ad: x.variant && x.variant.name, adet: x.quantity, fiyat: x.finalPrice, secenek: x.options }))).slice(0, 1500) : 'boş')); } catch (e) {} });
await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(6000);
// 1) Ürünün kendi verisi (slug ile) ve seçenek seti
const raw = await p.evaluate(() => {
  const nd = window.__NEXT_DATA__ || {};
  let urun = null, setler = [];
  (function walk(o, d) {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (o.metaData && o.metaData.slug === 'kendi-toprak-karisimini-olustur' && o.variants) urun = urun || o;
    if (Array.isArray(o.options) && o.options.length && o.options[0] && ('optionType' in o.options[0] || 'type' in o.options[0] || 'values' in o.options[0])) setler.push(o);
    for (const k in o) walk(o[k], d + 1);
  })(nd, 0);
  const kisalt = (x) => JSON.stringify(x, (k, v) => (/^(images|image|description|metaData|categories|stars|campaigns|brand)$/.test(k) ? undefined : v));
  return { urun: urun ? kisalt(urun).slice(0, 6000) : 'bulunamadı', setler: setler.slice(0, 3).map((x) => kisalt(x).slice(0, 15000)) };
});
log('ÜRÜN:\n' + raw.urun);
raw.setler.forEach((x, i) => log(`SEÇENEK SETİ ${i}:\n` + x));
// 2) Gerçek seçim: Sphagnum 2 Lt + Cocopeat 1 LT, sepete ekle; giden istekteki options biçimi
const sec = async (ad, deger) => {
  const blok = p.locator('.options-main', { hasText: ad }).first();
  await blok.locator('.option-checkbox').first().click();
  await p.waitForTimeout(400);
  await blok.locator('.react-select__control').first().click();
  await p.waitForTimeout(300);
  await p.locator('.react-select__option', { hasText: new RegExp('^' + deger + '\\s*$', 'i') }).first().click();
  await p.waitForTimeout(400);
};
try { await sec('Sphagnum Ham Torf', '2 Lt'); await sec('Cocopeat Torfu', '1 LT'); log('seçimler yapıldı'); } catch (e) { log('seçim hatası: ' + e.message.slice(0, 200)); }
log('Sayfadaki fiyat: ' + await p.evaluate(() => (document.body.innerText.match(/₺\s?[\d.,]+/g) || []).slice(0, 4).join(' | ')));
reqs.length = 0;
await p.getByText('SEPETE EKLE', { exact: true }).first().click();
await p.waitForTimeout(5000);
for (const r of reqs) { let v = ''; try { v = JSON.stringify(JSON.parse(r).variables); } catch (e) { v = r.slice(0, 500); } log('İSTEK değişkenleri: ' + v.slice(0, 4000)); }
// 3) Aynı biçimle window.addToCart (sayfa açmadan ekleme denemesi): Sphagnum 5 Lt + Kalın perlit 2 Lt
const opt = reqs.length ? (() => { try { return JSON.parse(reqs[reqs.length - 1]).variables.input.item; } catch (e) { return null; } })() : null;
log('item: ' + JSON.stringify(opt).slice(0, 3000));
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n').slice(0, 60000) + '\n```\n');
