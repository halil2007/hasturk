// Toprak karışım tarifi ve toprak rehberi (Bilge Bey). Bitkinin toprak profili (config.json > soilMatch.plants:
// "pHmin pHmax drenaj su besin yapı", ör. "23322h") ve grubu (Salon, Meyve, Çiçek…) → "Kendi Toprak Karışımını Oluştur"
// ürünündeki bileşenlerle ölçü oranlı tarif (ölçü = aynı kap). Widget'taki soilParts / soilRecipe ile birebir aynı kurallar
// (scripts/toprak-esit.mjs ikisini karşılaştırır).
export const KAR_AD = { sphagnum: 'sphagnum torf', asidik: 'asidik torf', cocopeat: 'cocopeat', pomza: 'pomza', 'ince-perlit': 'ince perlit', 'kalin-perlit': 'kalın perlit', vermikulit: 'vermikülit', solucan: 'solucan gübresi', leonardit: 'leonardit', orman: 'orman toprağı', bentonit: 'bentonit' };
export const grupKey = (g) => String(g || '').toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
export const profil = (prof) => { const p = String(prof || ''); return /^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(p) ? { ph: +p[0], ph2: +p[1], dr: +p[2], su: +p[3], bs: +p[4], yp: p[5] } : null; };

// Bileşen parçaları [ölçü, anahtar], toplam 10 ölçü (10 litrede 1 ölçü = 1 litre). Mantık: HG karışımları — torf +
// cocopeat taban, perlit / pomza süzülme, solucan gübresi %10–20; çiçek-sebzeye leonardit, ağaçlara orman toprağı, su
// bitkisine bentonit. Kaktüste %60–70 mineral, asit severde asidik torf, nötr-kireçli sevene torf yerine cocopeat.
// Yalnız doğal bileşenler (kimyasal gübre yok).
export function soilParts(pf, grp) {
  var g = String(grp || ''), asit = pf.ph2 <= 1 || (pf.ph <= 1 && pf.ph2 <= 2), kirec = pf.ph >= 3;
  var torf = asit ? 'asidik' : kirec ? 'cocopeat' : 'sphagnum', sol = pf.bs >= 3 ? 2 : pf.bs === 2 ? 1 : 0, x = [];
  var ek = function (n, k) { if (n <= 0) return; for (var i = 0; i < x.length; i++) if (x[i][1] === k) { x[i][0] += n; return; } x.push([n, k]); };
  if (/^ozel/.test(g)) { ek(6, 'sphagnum'); ek(4, 'ince-perlit'); return x; }
  if (/^su /.test(g)) { ek(4, 'sphagnum'); ek(3, 'bentonit'); ek(1, 'cocopeat'); ek(1, 'solucan'); ek(1, 'leonardit'); return x; }
  if (pf.yp === 'k') {
    // Kaktüs / sukulentte %70 mineral; kurak seven diğerlerinde %50–60; saksıda zeytin, badem, çam gibi ağaçlarda orman
    // toprağı + %40–50 mineral
    var agac = /^meyve/.test(g) || /^bahce/.test(g); sol = Math.min(sol, 1);
    var m = (agac ? 5 : /^sukulent/.test(g) && pf.dr >= 3 && pf.su <= 1 ? 7 : pf.dr >= 3 && pf.su <= 1 ? 6 : 5) - sol;
    ek(agac ? 3 : 0, 'orman'); ek(10 - (agac ? 3 : 0) - m - sol, torf); ek(Math.ceil(m / 2), 'pomza'); ek(Math.floor(m / 2), 'kalin-perlit'); ek(sol, 'solucan');
  } else if (pf.yp === 'h') {
    var nem = pf.su >= 3, kuru = pf.su <= 1, d = kuru ? 4 : 3, o = 10 - d - sol;
    ek(Math.ceil(o / 2), torf); ek(Math.floor(o / 2), 'cocopeat');
    if (kuru) { ek(2, 'pomza'); ek(2, 'kalin-perlit'); } else { ek(d - 1, nem ? 'ince-perlit' : 'kalin-perlit'); ek(1, nem ? 'vermikulit' : 'pomza'); }
    ek(sol, 'solucan');
  } else if (asit) {
    ek(5, 'asidik'); ek(2, 'orman'); ek(2, pf.dr >= 3 ? 'kalin-perlit' : 'ince-perlit'); ek(1, 'solucan');
  } else if (pf.bs <= 1) {
    ek(4, torf); ek(2, 'cocopeat'); ek(2, 'vermikulit'); ek(2, 'ince-perlit');
  } else if ((/^meyve/.test(g) || /^bahce/.test(g)) && !(pf.bs >= 3 && pf.dr <= 2)) {
    ek(3, 'orman'); ek(4 - sol, torf); ek(2, 'pomza'); ek(1, 'kalin-perlit'); ek(sol, 'solucan');
  } else {
    var dd = pf.dr >= 3 ? 3 : 2, lb = pf.bs >= 3 ? 1 : 0, v = pf.su >= 3 ? 1 : 0, ob = 10 - dd - sol - lb;
    ek(ob - 2, torf); ek(2, 'cocopeat'); ek(dd - v, pf.dr >= 3 ? 'kalin-perlit' : 'ince-perlit'); ek(v, 'vermikulit'); ek(sol, 'solucan'); ek(lb, 'leonardit');
  }
  return x;
}

export function tarif(prof, grp) {
  const pf = profil(prof);
  if (!pf) return '';
  return soilParts(pf, grupKey(grp)).map(([n, k]) => `${n} ölçü ${KAR_AD[k]}`).join(' + ') +
    (pf.bs <= 1 ? ' (gübre eklemeyin)' : '') + (pf.ph >= 3 ? '; nötr-kireçli toprağı sever, asidik torf kullanmayın' : '') + '.';
}

// Yapay zekâ için toprak rehberi: bitki hazır listede yoksa en yakın gruba göre hazır toprak + karışım tarifi önerilir
export const GRUPLAR = [
  { ad: 'Tropikal yapraklı salon bitkileri (monstera, philodendron, alokazya, singonyum gibi)', prof: '22322h', grp: 'salon', hazir: ['salon-bitkilerine-ozel-toprak-karisimi'], ozellik: 'havadar, suyu iyi süzen, hafif asidik' },
  { ad: 'Nemli toprak seven yapraklı bitkiler (eğrelti, calathea, fittonya gibi)', prof: '22232h', grp: 'salon', hazir: ['hg-dua-cicegi-saksi-topragi'], ozellik: 'nemini koruyan ama havadar' },
  { ad: 'Kaktüs ve sukulentler (etli yapraklı, kurağa dayanıklı)', prof: '23311k', grp: 'sukulent', hazir: ['kaktus-ve-sukulent-topragi'], ozellik: 'suyu çok iyi süzen, kumlu, az besinli' },
  { ad: 'Akdeniz otları ve kurak seven çalılar (lavanta, kekik, biberiye, zeytin, zakkum gibi)', prof: '34311k', grp: 'aromatik', hazir: ['kaktus-ve-sukulent-topragi'], ozellik: 'nötr-kireçli, suyu çok iyi süzen, kumlu' },
  { ad: 'Asit seven bitkiler (yaban mersini, açelya, kamelya, ortanca, manolya gibi)', prof: '12222d', grp: 'asit seven', hazir: ['ortanca-bogurtlen-acelya-topragi', 'yaban-mersini-ve-ortanca-topragi'], ozellik: 'kireçsiz (asidik)' },
  { ad: 'Çiçekli saksı ve balkon bitkileri (petunya, krizantem, gül, hibiskus gibi)', prof: '23223d', grp: 'cicek', hazir: ['hg-cicek-topragi'], ozellik: 'dengeli, besince zengin' },
  { ad: 'Sebzeler ve meyveli bitkiler (domates, biber, çilek gibi)', prof: '23223d', grp: 'sebze', hazir: ['hg-bol-verimli-sebze-topragi'], ozellik: 'besince zengin, nemini koruyan' },
  { ad: 'Meyve ağaçları ve bahçe ağaçları (saksıda ya da dikimde)', prof: '23222d', grp: 'meyve', hazir: ['trabzon-hurmasi-cennet-hurmasi-topragi', 'genel-saksi-topragi-ozel-karisim'], ozellik: 'dengeli, suyu iyi süzen, orman toprağı katkılı' },
  { ad: 'Narenciye (limon, portakal, mandalina, kumkuat)', prof: '23323d', grp: 'meyve', hazir: ['hg-narenciye-topragi', 'limon-agaci-topragi-ozel-organik-karisim'], ozellik: 'suyu çok iyi süzen, besince zengin' },
  { ad: 'Su bitkileri (nilüfer, lotus)', prof: '23133d', grp: 'su bitkisi', hazir: ['lotus-nilufer-cicegi-topragi'], ozellik: 'ağır, killi, suda dağılmayan' },
  { ad: 'Genel (bitki tanınmıyorsa)', prof: '23222d', grp: '', hazir: ['genel-saksi-topragi-ozel-karisim'], ozellik: 'dengeli' },
];
export const OZEL_KARISIM = 'kendi-toprak-karisimini-olustur';
export const TOPRAK_SORUSU = /topra|harc|karisim|torf|saksi degis/;

// Yapay zekâya giden "Doğrulanmış bilgi" bloğu (ürün adları canlı listeden)
export function rehberMetni(byS) {
  const ad = (s) => (byS.get(s) || {}).n || s;
  return 'Toprak rehberi (bitkinin özel toprağı listede yoksa en uygun gruba göre öner; tarif "Kendi Toprak Karışımını Oluştur" ürünüyle istenen litrede hazırlanır, ölçü = aynı kap, 10 ölçü = 10 litrede 1 ölçü 1 litre):\n' +
    GRUPLAR.map((g) => `• ${g.ad}: ${g.ozellik} toprak. Hazır: ${g.hazir.filter((s) => (byS.get(s) || {}).st).map(ad).join(' / ') || '-'}. Karışım: ${tarif(g.prof, g.grp)}`).join('\n');
}
