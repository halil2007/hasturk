// İki ikas mağazasının ürünlerini karşılaştırır (ikinci sitede ortak Ürün Bul verisi kullanılabilir mi?):
// ürün adresleri (slug), fiyat, stok, seçenek (varyant) adları ve kategoriler.
// Kullanım: node scripts/compare-stores.mjs public/products.json /tmp/magaza2.json
import { readFileSync, appendFileSync } from 'node:fs';

const [A, B] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[ışğüöçâîû]/g, (c) => ({ ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' })[c]).replace(/[^a-z0-9]+/g, ' ').trim();
const vars = (p) => (p.v && p.v.length ? p.v : [{ id: p.v1, name: '', p: p.p, d: p.d, st: p.st }]);
const price = (x) => (x.d != null ? x.d : x.p);
const tl = (n) => n == null ? '-' : Number(n).toLocaleString('tr-TR') + ' TL';
const pct = (a, b) => b ? Math.round((a / b) * 100) + '%' : '-';

const bySlugB = new Map(B.items.map((p) => [p.s, p])), byNameB = new Map(B.items.map((p) => [fold(p.n), p]));
const pairs = [], onlyA = [];
for (const a of A.items) {
  const b = bySlugB.get(a.s) || byNameB.get(fold(a.n));
  if (b) pairs.push({ a, b, how: bySlugB.get(a.s) === b ? 'adres' : 'ad' }); else onlyA.push(a);
}
const matchedB = new Set(pairs.map((x) => x.b));
const onlyB = B.items.filter((p) => !matchedB.has(p));
const bySlug = pairs.filter((x) => x.how === 'adres').length;

let priceDiff = [], stockDiff = [], varName = 0, varIdSame = 0, varTotal = 0;
for (const { a, b } of pairs) {
  if (price(a) !== price(b)) priceDiff.push([a.n, price(a), price(b)]);
  if (!!a.st !== !!b.st) stockDiff.push([a.n, a.st ? 'var' : 'yok', b.st ? 'var' : 'yok']);
  const vb = new Map(vars(b).map((v) => [fold(v.name), v]));
  for (const v of vars(a)) {
    varTotal++;
    const w = vb.get(fold(v.name));
    if (w) { varName++; if (w.id === v.id) varIdSame++; }
  }
}
const catsA = new Set(A.cats.map((c) => c.s)), catsB = new Set(B.cats.map((c) => c.s));
const catBoth = [...catsA].filter((s) => catsB.has(s)).length;

let out = `# Mağaza karşılaştırması\n\n`;
out += `| | 1. mağaza | 2. mağaza |\n|---|---|---|\n| Ürün | ${A.items.length} | ${B.items.length} |\n| Kategori | ${A.cats.length} | ${B.cats.length} |\n| Görsel kimliği (merchant) | ${A.merchant ? 'var' : '-'} | ${B.merchant ? (B.merchant === A.merchant ? 'aynı' : 'farklı') : '-'} |\n\n`;
out += `## Eşleşme\n\n| | Adet | Oran |\n|---|---|---|\n`;
out += `| İki mağazada da olan ürün | ${pairs.length} | ${pct(pairs.length, A.items.length)} (1. mağazaya göre) |\n`;
out += `| …aynı ürün adresiyle | ${bySlug} | ${pct(bySlug, pairs.length)} |\n`;
out += `| …sadece aynı adla (adres farklı) | ${pairs.length - bySlug} | ${pct(pairs.length - bySlug, pairs.length)} |\n`;
out += `| Sadece 1. mağazada | ${onlyA.length} | |\n| Sadece 2. mağazada | ${onlyB.length} | |\n`;
out += `| Fiyatı farklı (eşleşenlerde) | ${priceDiff.length} | ${pct(priceDiff.length, pairs.length)} |\n`;
out += `| Stok durumu farklı | ${stockDiff.length} | ${pct(stockDiff.length, pairs.length)} |\n`;
out += `| Seçenek adı eşleşen | ${varName}/${varTotal} | ${pct(varName, varTotal)} |\n`;
out += `| Seçenek kimliği aynı | ${varIdSame}/${varTotal} | ${pct(varIdSame, varTotal)} |\n`;
out += `| Aynı adresli kategori | ${catBoth}/${A.cats.length} | ${pct(catBoth, A.cats.length)} |\n`;
const list = (title, rows, head) => { if (!rows.length) return; out += `\n<details><summary>${title} (${rows.length})</summary>\n\n| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n` + rows.slice(0, 60).map((r) => '| ' + r.map((x) => String(x).replace(/\|/g, '/')).join(' | ') + ' |').join('\n') + (rows.length > 60 ? `\n| … ${rows.length - 60} tane daha | |` : '') + '\n\n</details>\n'; };
list('Fiyatı farklı ürünler', priceDiff.map(([n, x, y]) => [n, tl(x), tl(y)]), ['Ürün', '1. mağaza', '2. mağaza']);
list('Stok durumu farklı', stockDiff, ['Ürün', '1. mağaza', '2. mağaza']);
list('Adresi farklı (adla eşleşen)', pairs.filter((x) => x.how === 'ad').map((x) => [x.a.n, x.a.s, x.b.s]), ['Ürün', '1. adres', '2. adres']);
list('Sadece 1. mağazada', onlyA.map((p) => [p.n, p.s]), ['Ürün', 'Adres']);
list('Sadece 2. mağazada', onlyB.map((p) => [p.n, p.s]), ['Ürün', 'Adres']);
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
