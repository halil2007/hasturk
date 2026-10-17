// Toprak karışım tarifi ve toprak rehberi (Bilge Bey). Bitkinin toprak profili (config.json > soilMatch.plants:
// "pHmin pHmax drenaj su besin yapı", ör. "23322h") → "Kendi Toprak Karışımını Oluştur" ürünündeki bileşenlerle ölçü
// oranlı tarif (ölçü = aynı kap). Bileşenler: sphagnum / asidik torf, cocopeat, pomza, ince / kalın perlit, vermikülit,
// solucan gübresi. Solucan gübresi en çok ~%20 (bilgi/DOGRULAMA.md: harca %10–20). Widget'taki soilRecipe ile aynı kurallar.
export function tarif(prof) {
  const p = String(prof || '');
  if (!/^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(p)) return '';
  const ph = +p[0], ph2 = +p[1], dr = +p[2], su = +p[3], bs = +p[4], yp = p[5];
  const asit = ph2 <= 1 || (ph <= 1 && ph2 <= 2), taban = asit ? 'asidik torf' : 'sphagnum torf', x = [];
  if (yp === 'k') { const kurak = dr >= 3 && su <= 1; x.push([kurak ? 4 : 5, taban], [kurak ? 4 : 3, 'pomza'], [2, 'kalın perlit']); }
  else if (yp === 'h') x.push([5, taban + (asit ? '' : ' ya da cocopeat')], [dr >= 3 ? 4 : 3, 'kalın perlit']);
  else x.push([6, taban], [dr >= 3 ? 3 : 2, dr >= 3 ? 'kalın perlit' : 'ince perlit']);
  if (su >= 3 && yp !== 'k') x.push([1, 'vermikülit']);
  if (bs >= 3) x.push([2, 'solucan gübresi']); else if (bs === 2) x.push([1, 'solucan gübresi']);
  return x.map(([n, a]) => `${n} ölçü ${a}`).join(' + ') + (bs <= 1 ? ' (gübre eklemeyin)' : '') + (ph >= 4 ? '; kireçli toprağı sever, asidik torf kullanmayın' : '') + '.';
}

// Yapay zekâ için toprak rehberi: bitki hazır listede yoksa en yakın gruba göre hazır toprak + karışım tarifi önerilir
export const GRUPLAR = [
  { ad: 'Tropikal yapraklı salon bitkileri (monstera, philodendron, alokazya, singonyum gibi)', prof: '22322h', hazir: ['salon-bitkilerine-ozel-toprak-karisimi'], ozellik: 'havadar, suyu iyi süzen, hafif asidik' },
  { ad: 'Nemli toprak seven yapraklı bitkiler (eğrelti, calathea, fittonya gibi)', prof: '22232h', hazir: ['hg-dua-cicegi-saksi-topragi'], ozellik: 'nemini koruyan ama havadar' },
  { ad: 'Kaktüs ve sukulentler (etli yapraklı, kurağa dayanıklı)', prof: '23311k', hazir: ['kaktus-ve-sukulent-topragi'], ozellik: 'suyu çok iyi süzen, kumlu, az besinli' },
  { ad: 'Akdeniz otları ve kurak seven çalılar (lavanta, kekik, biberiye, zeytin, zakkum gibi)', prof: '34311k', hazir: ['kaktus-ve-sukulent-topragi'], ozellik: 'nötr-kireçli, suyu çok iyi süzen, kumlu' },
  { ad: 'Asit seven bitkiler (yaban mersini, açelya, kamelya, ortanca, manolya gibi)', prof: '12222d', hazir: ['ortanca-bogurtlen-acelya-topragi', 'yaban-mersini-ve-ortanca-topragi'], ozellik: 'kireçsiz (asidik)' },
  { ad: 'Çiçekli saksı ve balkon bitkileri (petunya, sardunya, krizantem, hibiskus gibi)', prof: '23223d', hazir: ['hg-cicek-topragi'], ozellik: 'dengeli, besince zengin' },
  { ad: 'Sebzeler ve meyveli bitkiler', prof: '23223d', hazir: ['hg-bol-verimli-sebze-topragi'], ozellik: 'besince zengin, nemini koruyan' },
  { ad: 'Meyve ağaçları ve bahçe ağaçları (saksıda ya da dikimde)', prof: '23222d', hazir: ['genel-saksi-topragi-ozel-karisim'], ozellik: 'dengeli, suyu iyi süzen' },
  { ad: 'Genel (bitki tanınmıyorsa)', prof: '23222d', hazir: ['genel-saksi-topragi-ozel-karisim'], ozellik: 'dengeli' },
];
export const OZEL_KARISIM = 'kendi-toprak-karisimini-olustur';
export const TOPRAK_SORUSU = /topra|harc|karisim|torf|saksi degis/;

// Yapay zekâya giden "Doğrulanmış bilgi" bloğu (ürün adları canlı listeden)
export function rehberMetni(byS) {
  const ad = (s) => (byS.get(s) || {}).n || s;
  return 'Toprak rehberi (bitkinin özel toprağı listede yoksa en uygun gruba göre öner; tarif "Kendi Toprak Karışımını Oluştur" ürünüyle istenen litrede hazırlanır, ölçü = aynı kap):\n' +
    GRUPLAR.map((g) => `• ${g.ad}: ${g.ozellik} toprak. Hazır: ${g.hazir.filter((s) => (byS.get(s) || {}).st).map(ad).join(' / ') || '-'}. Karışım: ${tarif(g.prof)}`).join('\n');
}
