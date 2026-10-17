// Perlit Market (perlitmarket.com) karışım tanısı: "kendi karışımını yap" sistemi (bileşenler, litre/fiyat) ve bitkiye özel
// hazır toprakların içerik oranları. Yalnız herkese açık sayfalar okunur; çıktı GitHub özetine yazılır (depoya kaydedilmez).
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';
const SITE = 'https://perlitmarket.com';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'tr-TR' });
const p = await ctx.newPage();
const git = async (u) => { try { await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(2500); return true; } catch (e) { log('açılamadı ' + u + ' ' + e.message.slice(0, 80)); return false; } };
await git(SITE + '/?o=7&page=1');
log('BAŞLIK: ' + await p.title());
// Tüm bağlantılar (aynı site)
const linkler = async () => p.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0]).filter((h) => h.startsWith(location.origin)))]);
let L = await linkler();
log('Ana sayfa bağlantı sayısı: ' + L.length);
const kar = L.filter((h) => /karis|karış|kendi|olustur|oluştur|mix|harc|toprak/i.test(decodeURIComponent(h)));
log('Toprak / karışım bağlantıları:\n' + kar.slice(0, 80).join('\n'));
// Ürün listesi sayfaları (?page=)
const urunler = new Set();
for (let pg = 1; pg <= 6; pg++) {
  if (!(await git(`${SITE}/?o=7&page=${pg}`))) break;
  const u = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ h: a.href.split('#')[0], t: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim() })).filter((x) => x.h.startsWith(location.origin) && x.t.length > 8));
  u.forEach((x) => { if (/topra|karış|karis|torf|perlit|pomza|harç|harc|mix|kokopit|cocopeat|vermik|kaktüs|sukulent|orkide|bonsai|monstera|aroid|asidik|leonardit|solucan|zeolit/i.test(x.t)) urunler.add(x.h + ' :: ' + x.t.slice(0, 90)); });
}
log('Toprakla ilgili ürünler (' + urunler.size + '):\n' + [...urunler].slice(0, 150).join('\n'));
// Ürün sayfalarından içerik / oran metinleri
const sayfalar = [...new Set([...urunler].map((x) => x.split(' :: ')[0]))].slice(0, 45);
for (const u of sayfalar) {
  if (!(await git(u))) continue;
  const v = await p.evaluate(() => {
    const t = document.body.innerText.replace(/\n{2,}/g, '\n');
    const h1 = (document.querySelector('h1') || {}).innerText || document.title;
    const oran = t.split('\n').filter((l) => /%\s?\d|\d\s?%|oran|içerik|içindekiler|bileşen|karışım/i.test(l) && l.length < 260).slice(0, 25);
    const fiyat = (t.match(/[\d.,]+\s?(TL|₺)|₺\s?[\d.,]+/g) || []).slice(0, 3);
    // Seçenek / karışım oluşturucu öğeleri
    const sec = [...document.querySelectorAll('select, input[type=checkbox], input[type=radio], input[type=number], [class*="option" i] label, [class*="variant" i] button')].slice(0, 60)
      .map((e) => (e.tagName === 'SELECT' ? 'SELECT[' + [...e.options].map((o) => o.text.trim()).slice(0, 30).join('/') + ']' : (e.closest('label') || e).innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean);
    return { h1: h1.trim().slice(0, 120), fiyat, oran, sec };
  });
  log(`\n=== ${v.h1} (${u})\nfiyat: ${v.fiyat.join(' | ')}\n${v.oran.join('\n')}${v.sec.length ? '\nSEÇENEKLER: ' + v.sec.join(' | ') : ''}`);
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n').slice(0, 60000) + '\n```\n');
