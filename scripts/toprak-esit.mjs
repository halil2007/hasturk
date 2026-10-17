// Toprak tarifi tutarlılık kontrolü: widget/pm-search.js > soilParts ile src/toprak.js > soilParts tüm profil × grup
// birleşimlerinde aynı sonucu vermeli; her tarif 10 ölçü, solucan gübresi en çok 2 ölçü (%20), bileşenler karışım ürününde var.
// Kullanım: node scripts/toprak-esit.mjs
import { readFileSync } from 'node:fs';
import { soilParts, profil, grupKey, KAR_AD } from '../src/toprak.js';
const w = readFileSync(new URL('../widget/pm-search.js', import.meta.url), 'utf8');
const a = w.indexOf('  function soilParts(pf, grp)'), b = w.indexOf('\n  }\n', a) + 4;
const wParts = new Function(w.slice(a, b) + '; return soilParts;')();
// fold (Türkçe harfleri sadeleştirme) widget'tan alınır: FOLD tablosundan fold işlevinin sonuna kadar
const f0 = w.indexOf('  var FOLD ='), f1 = w.indexOf('\n  }\n', w.indexOf('  function fold(s)')) + 4;
const fold = new Function(w.slice(f0, f1) + '; return fold;')();
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const gruplar = [...new Set(config.soilMatch.plants.map((p) => p[2]))].concat(['']);
let n = 0; const hata = [];
for (const ph of [1, 2, 3, 4]) for (const ph2 of [1, 2, 3, 4]) for (const dr of [1, 2, 3]) for (const su of [1, 2, 3]) for (const bs of [1, 2, 3]) for (const yp of 'khd') for (const g of gruplar) {
  const prof = `${ph}${ph2}${dr}${su}${bs}${yp}`, pf = profil(prof);
  const s = soilParts(pf, grupKey(g)), x = wParts(pf, fold(g)); n++;
  const top = s.reduce((t, [k]) => t + k, 0), sol = (s.find(([, k]) => k === 'solucan') || [0])[0];
  if (JSON.stringify(s) !== JSON.stringify(x)) hata.push(`${prof} ${g}: sunucu ${JSON.stringify(s)} widget ${JSON.stringify(x)}`);
  if (top !== 10 || sol > 2 || s.some(([k, c]) => k <= 0 || !KAR_AD[c])) hata.push(`${prof} ${g}: geçersiz ${JSON.stringify(s)}`);
}
if (hata.length) { console.error(hata.slice(0, 20).join('\n') + `\n${hata.length} hata / ${n}`); process.exit(1); }
console.log(`Toprak tarifleri tutarlı (${n} birleşim).`);
