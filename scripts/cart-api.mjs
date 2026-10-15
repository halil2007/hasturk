// Sepete ekleme isteği tanısı (gerçek site, anonim sepet, sipariş verilmez): sitenin kendi "Sepete ekle" butonunun
// gönderdiği istek (adres, başlık adları, gövde), sitenin sepet deposunun (cartStore) yöntemleri ve aynı isteği
// sayfa açmadan başka bir ürün/seçenek için göndermenin çalışıp çalışmadığı.
import { chromium } from 'playwright';
import { readFileSync, appendFileSync } from 'node:fs';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const HOST = 'hasturk-arama.halilc2007.workers.dev';
const prods = JSON.parse(readFileSync(SITE.includes('tarim-dunyasi') ? 'public/tarim/products.json' : 'public/products.json', 'utf8')).items;
const bySlug = new Map(prods.map((p) => [p.s, p]));
const out = []; const log = (s) => { out.push(s); console.log(s); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.route((u) => u.hostname === HOST, (r) => r.abort()); // widget kapalı: sitenin kendi davranışı
const p = await ctx.newPage();
const adds = [];
p.on('request', (r) => {
  if (!/op=\w*cart/i.test(r.url()) || r.method() !== 'POST') return;
  const h = r.headers(), op = (r.url().match(/op=(\w+)/) || [])[1];
  adds.push({ op, url: r.url(), heads: Object.keys(h).filter((k) => !/cookie|user-agent|sec-|accept-language/i.test(k)).map((k) => k + (/^x-|content-type/i.test(k) ? '=' + String(h[k]).slice(0, 40) : '')), body: r.postData() || '' });
});
p.on('response', async (r) => {
  if (!/op=\w*cart/i.test(r.url())) return;
  let t = ''; try { t = await r.text(); } catch (e) {}
  try { const j = JSON.parse(t), d = j.data && Object.values(j.data)[0]; log(`  cevap ${(r.url().match(/op=(\w+)/) || [])[1]} HTTP ${r.status()} ${j.errors ? 'HATA ' + JSON.stringify(j.errors).slice(0, 300) : d ? (d.orderLineItems || []).length + ' satır: ' + (d.orderLineItems || []).map((x) => (x.variant && x.variant.name) + ' x' + x.quantity).join(', ') : 'boş'}`); } catch (e) { log('  cevap okunamadı ' + t.slice(0, 120)); }
});

const slug = process.env.PRODUCT || 'tarim-perliti';
const pr = bySlug.get(slug);
log(`Ürün: ${slug} (${pr && pr.id}) seçenekler: ${JSON.stringify((pr.v || []).map((v) => v.name + ':' + v.id))}`);
const t0 = Date.now();
await p.goto(`${SITE}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
log(`Sayfa HTML: ${Date.now() - t0} ms`);
await p.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /sepete ekle/i.test(b.textContent) && b.offsetWidth), null, { timeout: 60000 });
log(`"Sepete ekle" butonu göründü: ${Date.now() - t0} ms`);
await p.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
log(`Sayfa tam yüklendi: ${Date.now() - t0} ms`);
await p.waitForTimeout(1500);

// Sitenin sepet deposu ve yöntemleri
log('Sepet deposu: ' + JSON.stringify(await p.evaluate(() => {
  const el = document.getElementById('__next'), ck = el && Object.keys(el).find((k) => k.startsWith('__reactContainer$'));
  const st = ck ? [el[ck]] : []; let cs = null, store = null, n = 0;
  while (st.length && !cs && n < 8000) { const f = st.pop(); n++; const q = f.memoizedProps; if (q && q.store && q.store.cartStore) { store = q.store; cs = q.store.cartStore; } if (f.sibling) st.push(f.sibling); if (f.child) st.push(f.child); }
  if (!cs) return 'bulunamadı';
  const fns = new Set(); let o = cs; while (o && o !== Object.prototype) { Object.getOwnPropertyNames(o).forEach((k) => { try { if (typeof cs[k] === 'function') fns.add(k); } catch (e) {} }); o = Object.getPrototypeOf(o); }
  const src = (k) => { try { return String(cs[k]).replace(/\s+/g, ' ').slice(0, 900); } catch (e) { return ''; } };
  return { yontemler: [...fns].join(','), storeAlanlari: Object.keys(store).join(','), addItem: src('addItem'), changeItemQuantity: src('changeItemQuantity').slice(0, 300) };
})));

// Seçenek seç (ikinci seçenek) ve butona bas
const v2 = (pr.v || [])[1];
if (v2) {
  const ok = await p.evaluate((name) => {
    const sq = (s) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, '');
    const el = [...document.querySelectorAll('button,[role="radio"],label,li,a,span,div,p,option')].find((e) => e.children.length <= 3 && (e.offsetWidth || e.tagName === 'OPTION') && sq(e.textContent || '') === sq(name));
    if (!el) return 'seçenek bulunamadı: ' + [...document.querySelectorAll('button,[role="radio"],label,option')].map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 20).slice(0, 30).join(' | ');
    if (el.tagName === 'OPTION') { const s = el.closest('select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, el.value); s.dispatchEvent(new Event('change', { bubbles: true })); return 'select'; }
    (el.closest('button,[role="radio"],label,a,li') || el).click(); return 'tıklandı ' + el.tagName;
  }, v2.name);
  log(`Seçenek "${v2.name}": ${ok}`);
  await p.waitForTimeout(800);
}
const t1 = Date.now();
await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /sepete ekle/i.test(b.textContent) && b.offsetWidth).click());
await p.waitForTimeout(5000);
log(`Butona basıldı; istekler (${Date.now() - t1} ms içinde):`);
for (const a of adds) log(`  ${a.op} ${a.url.replace(/^https?:\/\/([^/]+)/, '$1')}\n    başlıklar: ${a.heads.join(', ')}\n    gövde: ${a.body.slice(0, 1500)}`);

// Aynı isteği sayfa açmadan başka ürün için gönder (doğrudan ekleme denemesi)
const addReq = adds.find((a) => /add\w*cart|saveItemToCart/i.test(a.op));
const other = bySlug.get(process.env.OTHER || 'kalin-tarim-perliti');
if (addReq && other) {
  const ov = (other.v || []).find((v) => v.st > 0) || { id: other.v1, name: '' };
  const res = await p.evaluate(async ({ a, vid, pid, oldV, oldP, vname }) => {
    let body = a.body.split(oldV).join(vid).split(oldP).join(pid);
    const t = Date.now();
    const r = await fetch(a.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const j = await r.json().catch(() => null);
    const d = j && j.data && Object.values(j.data)[0];
    return { ms: Date.now() - t, http: r.status, hata: j && j.errors ? JSON.stringify(j.errors).slice(0, 400) : '', satirlar: d ? (d.orderLineItems || []).map((x) => (x.variant && (x.variant.name || '')) + ' [' + String(x.variant && x.variant.id).slice(0, 8) + '] x' + x.quantity + ' ' + (x.finalPrice || x.price || '')).join(' | ') : '', beklenen: vname + ' [' + vid.slice(0, 8) + ']' };
  }, { a: addReq, vid: ov.id, pid: other.id, oldV: v2 ? v2.id : pr.v1, oldP: pr.id, vname: ov.name });
  log('Doğrudan ekleme (sayfa açmadan, yalnız kimlikler değişti): ' + JSON.stringify(res));
}
await b.close();
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
