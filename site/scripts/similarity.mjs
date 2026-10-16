// Sayfalar birbirine benziyor mu? Derlenmiş public/ klasöründeki her dizinlenebilir sayfadan başlık, açıklama, H1 ve gövde metnini
// (ortak üst menü / alt bilgi, kırıntı yolu, CTA bantları, "diğer entegrasyonlar / ilgili özellikler" ızgaraları hariç) çıkarır;
// sayfanın kendi adı (ör. "Koçtaş", "Koçtaş'a") ve marka adı maskelenir, sonra aynı ailedeki (entegrasyonlar/*, ozellikler/*,
// araclar/*, üst düzey) sayfalar arasında kelime 3'lü (shingle) Jaccard benzerliği hesaplanır. Başlık ve açıklamalar için de aynı
// maskelemeden sonra birebir / çok benzer tekrarlar aranır. Ad değiştirilerek çoğaltılmış metin (Google: scaled content abuse) böyle yakalanır.
// Kullanım: cd site && node build.mjs && node scripts/similarity.mjs [--top 8] [--json çıktı.json]
// test/seo.test.mjs aynı ölçümü (analyze) kullanır.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, INTEGRATIONS, CARRIERS } from '../src/data.mjs';
import { TOOLS } from '../src/tools.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = 'Hastürk CRM';
// Benzerlik ölçümüne girmeyen sayfalar: yasal metinler, dizinlenmeyen sayfalar (noindex ayrıca atlanır)
const SKIP = new Set(['/kvkk', '/gizlilik', '/kullanim-kosullari', '/mesafeli-satis-sozlesmesi', '/on-bilgilendirme', '/iptal-iade', '/404']);

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const lower = (s) => s.toLocaleLowerCase('tr');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Sayfanın kendi varlık adları (en uzun önce maskelenir: "Trendyol Go" "Trendyol"dan önce)
const NAMES = {};
for (const x of [...INTEGRATIONS, ...CARRIERS]) NAMES[`/entegrasyonlar/${x.slug}`] = [x.name, x.word, ...(x.slug === 'pasaj' ? ['Turkcell Pasaj', 'Pasaj'] : [])];
for (const f of FEATURES) NAMES[`/ozellikler/${f.slug}`] = [f.name];
const MP = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', n11: 'N11' };
for (const t of TOOLS) NAMES[`/araclar/${t.slug}`] = [t.name, ...(t.mp && MP[t.mp] ? [MP[t.mp]] : []), ...Object.values(MP).filter((n) => t.slug.startsWith(n.toLowerCase()))];
const maskRe = (names) => {
  const list = [...new Set([BRAND, ...names].filter(Boolean))].sort((a, b) => b.length - a.length);
  // ad + isteğe bağlı kesme işaretli ek (Koçtaş'a, eBay'in, N11'den)
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(reEsc).join('|')})(?:['’][\\p{L}]+)?(?![\\p{L}\\p{N}])`, 'giu');
};

const family = (url) => (/^\/(entegrasyonlar|ozellikler|araclar)\/./.test(url) ? url.split('/')[1] : 'üst düzey');
// Cümle tekrarı denetiminde entegrasyon ailesine katılan özellik sayfaları (kargo entegratörünün kendi sayfası)
export const INT_EXTRA = ['/ozellikler/kargonomi-entegrasyonu'];
NAMES['/ozellikler/kargonomi-entegrasyonu'].push('Kargonomi');
// Cümleler: blok sonları ve cümle sonu noktalamasından bölünür; 6 kelimeden kısa parçalar (düğme, etiket, başlık) sayılmaz
export const MIN_WORDS = 6;
const sentences = (body) => body.split(/\n|(?<=[.!?])\s+/).map((x) => words(x).join(' ')).filter((x) => x.split(' ').length >= MIN_WORDS);

// <main> içinden ortak / gezinme parçalarını atıp düz metin
export function bodyText(html) {
  let m = html.slice(html.indexOf('<main>') + 6, html.indexOf('</main>'));
  m = m.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ');
  // Bölüm bölüm: gezinme ızgaraları (diğer entegrasyonlar, ilgili özellikler, kargo firmaları listesi) atılır. Sayfa sonundaki
  // CTA bandı (class="ask big") metne dahildir: o da sayfaya özel olmalı.
  m = m.replace(/<section\b[\s\S]*?<\/section>/g, (s) => (/class="rels"|class="grid g3"|class="mega-|data-integ=/.test(s) ? ' ' : s));
  m = m.replace(/<nav class="crumbs"[\s\S]*?<\/nav>/g, ' ')
    .replace(/<div class="checks">[\s\S]*?<\/div>/g, ' ')
    .replace(/<div class="ctas">[\s\S]*?<\/div>/g, ' ')
    .replace(/<span class="st [^"]*"[^>]*>[^<]*<\/span>/g, ' ')
    .replace(/<span class="lt[^"]*"[\s\S]*?<\/span><\/span>/g, ' ');
  return decode(m.replace(/<\/(p|li|h[1-6]|summary|div|b|td|th)>/g, '$&\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
const words = (t) => lower(t).match(/[\p{L}\p{N}]+/gu) || [];
const shingles = (t, k = 3) => { const w = words(t), s = new Set(); for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(' ')); return s; };
export const jaccard = (a, b) => { if (!a.size && !b.size) return 0; let n = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const v of x) if (y.has(v)) n++; return n / (a.size + b.size - n); };
const norm = (t, re) => words(t.replace(re, ' ')).join(' ');

export function analyze(pub = join(ROOT, 'public')) {
  const pages = [];
  for (const f of walk(pub).filter((p) => p.endsWith('.html'))) {
    const url = '/' + relative(pub, f).replace(/\\/g, '/').replace(/\.html$/, '').replace(/^index$/, '');
    const html = readFileSync(f, 'utf8');
    if (SKIP.has(url) || /<meta name="robots" content="noindex/.test(html) || !html.includes('<main>')) continue;
    const re = maskRe(NAMES[url] || []);
    const title = decode((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '');
    const desc = decode((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || '');
    const h1 = decode(((/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1] || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const body = bodyText(html).replace(re, 'ADX');
    pages.push({ url, fam: family(url), title, desc, h1, body, sh: shingles(body), nTitle: norm(title, re), nDesc: norm(desc, re), shDesc: shingles(norm(desc, re), 2) });
  }
  const fams = {};
  for (const p of pages) (fams[p.fam] ||= []).push(p);
  const pairs = [];
  for (const list of Object.values(fams)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    pairs.push({ fam: a.fam, a: a.url, b: b.url, body: jaccard(a.sh, b.sh), desc: jaccard(a.shDesc, b.shDesc), sameTitle: a.nTitle === b.nTitle, sameDesc: a.nDesc === b.nDesc });
  }
  pairs.sort((x, y) => y.body - x.body);
  // Aynı cümle (sayfanın kendi adı maskelenmiş) aynı ailede 2+ sayfada: { aile: [[cümle, [adresler]]] }.
  // Entegrasyon ailesine Kargonomi sayfası da katılır (INT_EXTRA).
  const sentDup = {};
  const groups = { ...fams, entegrasyonlar: [...(fams.entegrasyonlar || []), ...pages.filter((p) => INT_EXTRA.includes(p.url))] };
  for (const [fam, list] of Object.entries(groups)) {
    const at = new Map();
    for (const p of list) for (const s of new Set(sentences(p.body))) (at.get(s) || at.set(s, []).get(s)).push(p.url);
    sentDup[fam] = [...at].filter(([, u]) => u.length >= 2).sort((a, b) => b[1].length - a[1].length);
  }
  // Ailede 3+ sayfada geçen aynı cümle (maskelenmiş): şablon kalıntısı
  const repeated = {};
  for (const [fam, list] of Object.entries(fams)) {
    const cnt = new Map();
    for (const p of list) for (const s of new Set(p.body.split(/\n|(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => words(x).length >= 6))) cnt.set(s, (cnt.get(s) || 0) + 1);
    repeated[fam] = [...cnt].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  }
  // Tüm sitede: başlık / açıklama birebir ya da maskelemeden sonra aynı
  const dup = (k) => { const m = new Map(), out = []; for (const p of pages) { const v = p[k]; if (m.has(v)) out.push([m.get(v), p.url, v]); else m.set(v, p.url); } return out; };
  return { pages, fams, pairs, repeated, sentDup, dupTitle: dup('nTitle'), dupDesc: dup('nDesc'), dupH1: dup('h1') };
}

// ---------- komut satırı ----------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const top = +arg('--top', 8), out = arg('--json');
  const r = analyze();
  const f3 = (n) => n.toFixed(3);
  const summary = {};
  for (const [fam, list] of Object.entries(r.fams)) {
    const ps = r.pairs.filter((p) => p.fam === fam);
    const maxOf = (u) => Math.max(0, ...ps.filter((p) => p.a === u || p.b === u).map((p) => p.body));
    const mean = ps.length ? ps.reduce((s, p) => s + p.body, 0) / ps.length : 0;
    summary[fam] = { pages: list.length, max: ps[0] ? ps[0].body : 0, mean, over035: ps.filter((p) => p.body > 0.35).length, worst: ps.slice(0, top).map((p) => [p.a, p.b, +f3(p.body)]) };
    console.log(`\n== ${fam} (${list.length} sayfa, ${ps.length} çift) · en yüksek ${f3(summary[fam].max)} · ortalama ${f3(mean)} · >0,35: ${summary[fam].over035}`);
    for (const p of ps.slice(0, top)) console.log(`  ${f3(p.body)}  ${p.a}  ↔  ${p.b}${p.desc > 0.4 ? `   (açıklama ${f3(p.desc)})` : ''}`);
    const worstPer = list.map((p) => [p.url, maxOf(p.url)]).sort((a, b) => b[1] - a[1]).slice(0, top);
    console.log(`  sayfa başına en benzer: ${worstPer.map(([u, v]) => `${u.split('/').pop() || '/'} ${f3(v)}`).join(' · ')}`);
    const rep = r.repeated[fam].slice(0, 5);
    if (rep.length) { console.log('  tekrar eden cümleler:'); for (const [s, n] of rep) console.log(`    ${n}× ${s.slice(0, 120)}`); }
  }
  console.log(`\n== Tekrarlanan cümleler (${MIN_WORDS}+ kelime, sayfanın kendi adı maskeli; aynı ailede 2+ sayfa)`);
  for (const [fam, list] of Object.entries(r.sentDup)) {
    console.log(`  ${fam}: ${list.length} cümle${list.slice(0, top).map(([s, u]) => `\n    ${u.length}× ${s.slice(0, 110)}  [${u.slice(0, 3).map((x) => x.split('/').pop()).join(', ')}${u.length > 3 ? ' …' : ''}]`).join('')}`);
  }
  const nearDesc = r.pairs.filter((p) => p.desc > 0.4).sort((a, b) => b.desc - a.desc);
  console.log(`\n== Başlık / açıklama (marka ve sayfanın kendi adı çıkarılarak)`);
  console.log(`  aynı başlık: ${r.dupTitle.length}${r.dupTitle.slice(0, top).map(([a, b, v]) => `\n    ${a} = ${b}: "${v}"`).join('')}`);
  console.log(`  aynı açıklama: ${r.dupDesc.length}${r.dupDesc.slice(0, top).map(([a, b, v]) => `\n    ${a} = ${b}: "${v}"`).join('')}`);
  console.log(`  aynı H1: ${r.dupH1.length}${r.dupH1.slice(0, top).map(([a, b, v]) => `\n    ${a} = ${b}: "${v}"`).join('')}`);
  console.log(`  çok benzer açıklama (2'li Jaccard > 0,4): ${nearDesc.length}${nearDesc.slice(0, top).map((p) => `\n    ${f3(p.desc)} ${p.a} ↔ ${p.b}`).join('')}`);
  if (out) writeFileSync(out, JSON.stringify({ summary, sentDup: Object.fromEntries(Object.entries(r.sentDup).map(([f, l]) => [f, l.length])), dupTitle: r.dupTitle, dupDesc: r.dupDesc, dupH1: r.dupH1, nearDesc: nearDesc.map((p) => [p.a, p.b, +f3(p.desc)]) }, null, 1));
}
