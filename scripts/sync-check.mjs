// Senkron kontrolü (canlı): widget sunucusundaki ürün dosyası ne kadar güncel ve rastgele ürünlerin Ürün Bul'daki
// fiyatı / stoğu ürünün sitedeki kendi sayfasıyla (JSON-LD) aynı mı. GitHub Actions'ta çalışır, hiçbir şey değiştirmez.
import { appendFileSync } from 'node:fs';
const HOST = 'https://hasturk-arama.halilc2007.workers.dev';
const SITES = [
  { name: 'HasTürk', site: 'https://hasturkgubre.com.tr', file: '/products.json' },
  { name: 'Tarım Dünyası', site: 'https://tarim-dunyasi.com', file: '/tarim/products.json' },
];
const N = +(process.env.N || 25);
const out = []; const log = (s) => { out.push(s); console.log(s); };
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' };
const money = (v) => Math.round(parseFloat(String(v).replace(',', '.')) * 100) / 100;
function ld(html) {
  const prices = new Set(); let avail = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(walk);
      for (const k of ['price', 'lowPrice', 'highPrice']) if (o[k] != null && !isNaN(money(o[k]))) prices.add(money(o[k]));
      if (o.availability) avail = (avail === 'in' ? 'in' : /InStock|PreOrder|LimitedAvailability/i.test(o.availability) ? 'in' : 'out');
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
    };
    walk(j);
  }
  return { prices, avail };
}
let bad = 0;
for (const s of SITES) {
  const r = await fetch(HOST + s.file + '?t=' + Date.now(), { headers: UA });
  const d = await r.json();
  const age = Math.round((Date.now() - Date.parse(d.updated)) / 60000);
  log(`\n## ${s.name}\nYayındaki ürün dosyası: ${d.items.length} ürün, son güncelleme ${d.updated} (${age} dk önce)${age > 180 ? '  ← ESKİ!' : ''}`);
  if (age > 180) bad++;
  const pick = [...d.items].sort(() => Math.random() - 0.5).slice(0, N);
  let ok = 0, diff = 0, skip = 0;
  for (const p of pick) {
    let html = '';
    try { const pr = await fetch(s.site + '/' + p.s, { headers: UA }); if (!pr.ok) { log(`  ? ${p.n.slice(0, 50)}: sayfa açılmadı (HTTP ${pr.status})`); skip++; continue; } html = await pr.text(); } catch (e) { skip++; continue; }
    const { prices, avail } = ld(html);
    if (!prices.size) { log(`  ? ${p.n.slice(0, 50)}: sayfada fiyat bilgisi okunamadı`); skip++; continue; }
    const vp = new Set([money(p.p), ...(p.v || []).map((v) => money(v.p)).filter((x) => !isNaN(x))]);
    const priceOk = [...vp].some((x) => prices.has(x));
    const stockOk = avail == null || (avail === 'in') === !!p.st;
    if (priceOk && stockOk) ok++;
    else { diff++; log(`  ✗ ${p.n.slice(0, 60)}: Ürün Bul ${[...vp].join('/')} TL ${p.st ? 'stokta' : 'stok yok'} · sitede ${[...prices].join('/')} TL ${avail === 'in' ? 'stokta' : avail === 'out' ? 'stok yok' : ''}`); }
  }
  bad += diff;
  log(`Rastgele ${pick.length} ürün: ${ok} aynı, ${diff} farklı, ${skip} okunamadı`);
}
log(bad ? `\nSONUÇ: ${bad} sorun var` : '\nSONUÇ: senkron tutarlı');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
