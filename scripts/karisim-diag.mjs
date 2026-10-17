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
// 2) Bileşen başlıklarına tıkla, açılan öğeleri listele
const basliklar = ['Sphagnum', 'Cocopeat', 'Longoz', 'İnce Tarım', 'Kalın Tarım', 'Pomza', 'Vermikülit', 'Bentonit', 'Solucan', 'Leonardit', 'Asidik'];
for (const t of basliklar.slice(0, 2)) { const l = p.getByText(t, { exact: false }).first(); try { await l.click({ timeout: 3000 }); await p.waitForTimeout(500); } catch (e) { log('tıklanamadı: ' + t); } }
const ui = await p.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  return [...document.querySelectorAll('input, select, textarea, [role="checkbox"], [role="radio"], [role="spinbutton"]')].filter(vis).slice(0, 80)
    .map((e) => { let l = e.closest('div'); for (let i = 0; i < 3 && l && (l.innerText || '').length < 4; i++) l = l.parentElement; return `${e.tagName}[${e.type || ''}] val=${e.value} min=${e.min || ''} max=${e.max || ''} step=${e.step || ''} :: ${(l && l.innerText || '').replace(/\s+/g, ' ').slice(0, 120)}`; }).join('\n');
});
log('Tıklama sonrası öğeler:\n' + ui);
const html = await p.evaluate(() => { const e = [...document.querySelectorAll('*')].find((x) => /Sphagnum Ham Torf/.test(x.textContent || '') && (x.textContent || '').length < 3000 && x.children.length > 3); return e ? e.outerHTML.replace(/\s+/g, ' ').slice(0, 6000) : 'yok'; });
log('Seçim alanı HTML:\n' + html);
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n').slice(0, 60000) + '\n```\n');
