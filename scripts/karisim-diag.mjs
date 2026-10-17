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
// 1) Ham ürün verisi
const raw = await p.evaluate(() => {
  const nd = window.__NEXT_DATA__; const s = JSON.stringify(nd || {});
  const i = s.indexOf('productOptionSet'), j = s.indexOf('"options"');
  return { uzunluk: s.length, opsiyonSeti: i >= 0 ? s.slice(Math.max(0, i - 200), i + 12000) : 'yok', opt: j >= 0 ? s.slice(j, j + 1500) : '' };
});
log('NEXT_DATA uzunluk: ' + raw.uzunluk);
log('productOptionSet çevresi:\n' + raw.opsiyonSeti);
// 2) Sayfadaki seçim öğeleri (görünen metinler)
const ui = await p.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
  const els = [...document.querySelectorAll('input, select, textarea, [role="checkbox"], [role="radio"], label, button')].filter(vis);
  return els.slice(0, 200).map((e) => `${e.tagName}${e.type ? '[' + e.type + ']' : ''} name=${e.name || ''} val=${(e.value || '').slice(0, 30)} :: ${(e.innerText || e.getAttribute('aria-label') || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 80)}`).join('\n');
});
log('Görünen seçim öğeleri:\n' + ui);
const metin = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 5000));
log('Sayfa metni (ilk 5000):\n' + metin);
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n').slice(0, 60000) + '\n```\n');
