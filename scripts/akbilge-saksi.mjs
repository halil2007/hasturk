// Ak Bilge saksı bilgisi: saksı ürünlerinin hacim/çap/yükseklik/delik bilgisini ürün açıklamalarından çıkarır,
// "bu saksıya ne kadar toprak gider" hesabını yapar (5/10/20/40 L paket önerisiyle) ve saksı seçimi kurallarını
// (üniversite yayımlarıyla doğrulanmış) tek dosyada toplar. Çıktı: bilgi/saksilar.json (akbilge-havuz.mjs okur).
//
// Hacim: üretici litresi varsa o kullanılır (kaynak: uretici). Yoksa ölçülerden yaklaşık hesaplanır (kaynak: hesap):
//   hacim ≈ k × π × (üst çap/2)² × yükseklik. Konik standart saksılarda k = 0,72 üretici litreleriyle %5 içinde tutuyor
//   (Line 1,1/2,2/5/10 L, Kozalak 0,75/5,6 L, Cornet 85 L, Çeşme 130 L); kâse/küre biçiminde ~0,5.
import { readFile, writeFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile('docs/bilgi/urunler-hasturk.json', 'utf8'));
const prods = JSON.parse(await readFile('public/products.json', 'utf8'));
const bySlug = new Map(prods.items.map((p) => [p.s, p]));
const txt = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const num = (s) => parseFloat(String(s).replace(',', '.'));
const N = '(\\d+(?:[.,]\\d+)?)';

// Biçim katsayısı (ölçüden hacim tahmini için)
const FORM = [
  [/küre/i, 0.5, 'küre'], [/çömlek/i, 0.55, 'bombeli çömlek'], [/damla/i, 0.55, 'tabana doğru incelen'],
  [/oval silindir|silindir/i, 0.85, 'silindir'], [/lale/i, 0.72, 'konik'], [/ufo|tripot/i, 0.5, 'kâse'],
];
const KONIK = 0.72;
const litre = (cap, h, k) => k * Math.PI * (cap / 2) ** 2 * h / 1000;
const yuvarla = (l) => (l < 1 ? Math.round(l * 100) / 100 : l < 10 ? Math.round(l * 10) / 10 : l < 100 ? Math.round(l) : Math.round(l / 5) * 5);

function olculer(p) {
  const s = txt(p.aciklama), ad = p.ad;
  const sizes = [];
  // Seri: "Boyut Seçenekleri • 0.75 Litre: Çap 11.5 cm × 10.5 cm yükseklik • 2 Litre: Ø19.5 cm × 14.5 cm …"
  for (const m of s.matchAll(new RegExp(`${N}\\s*(?:Litre|L)\\s*:\\s*(?:Ø|Çap\\s*)?${N}\\s*cm\\s*[×x]\\s*${N}\\s*cm`, 'gi')))
    sizes.push({ litre: num(m[1]), cap: num(m[2]), yukseklik: num(m[3]), kaynak: 'uretici' });
  if (sizes.length) return sizes;
  const g = (re) => { const m = s.match(re); return m ? num(m[1]) : null; };
  let L = g(new RegExp(`${N}\\s*litre hacm`, 'i')) ?? g(new RegExp(`Hacim:\\s*${N}\\s*(?:litre|L)\\b`, 'i'));
  const cc = g(/(\d+)\s*cc\b/i); if (L == null && cc) L = cc / 1000;
  let cap = g(new RegExp(`${N}\\s*cm\\s*(?:üst\\s*)?çap`, 'i')) ?? g(new RegExp(`(?:Dış\\s*)?Çap:\\s*${N}\\s*cm`, 'i'));
  let h = g(new RegExp(`${N}\\s*cm\\s*yükseklik`, 'i')) ?? g(new RegExp(`Yükseklik\\s*:\\s*${N}\\s*cm`, 'i'));
  const mm = s.match(/ağız çapı\s*(\d+)\s*mm,\s*derinliği ise\s*(\d+)\s*mm/i); if (mm) { cap = +mm[1] / 10; h = +mm[2] / 10; }
  const olcu = s.match(new RegExp(`Ölçü:\\s*${N}\\s*[×x]\\s*${N}\\s*cm`, 'i')); if (olcu && cap == null) { cap = num(olcu[1]); h = num(olcu[2]); }
  const gen = g(new RegExp(`Genişlik:\\s*${N}\\s*cm`, 'i')), der = g(new RegExp(`Derinlik:\\s*${N}\\s*cm`, 'i')), uz = g(new RegExp(`Uzunluk:\\s*${N}\\s*cm`, 'i'));
  // Seri adında litreler (ör. "Şeffaf … 0.75 L, 1.60 L, 3.0 L") ama ölçü yok
  const seri = [...s.matchAll(new RegExp(`Boy seçenekleri:\\s*([^•]+)`, 'gi'))].map((m) => m[1])[0];
  if (L == null && cap == null && seri) {
    for (const m of seri.matchAll(new RegExp(`${N}\\s*L\\b`, 'g'))) sizes.push({ litre: num(m[1]), kaynak: 'uretici' });
    if (sizes.length) return sizes;
  }
  if (L == null) {
    const t = ad.match(new RegExp(`${N}\\s*(?:Litre|L)\\b`, 'i')); if (t && !/\//.test(ad)) L = num(t[1]);
  }
  const o = { kaynak: L != null ? 'uretici' : 'hesap' };
  if (L != null) o.litre = L;
  if (cap != null) o.cap = cap; else if (gen != null && uz == null && der == null) o.cap = gen;
  if (h != null) o.yukseklik = h;
  if (uz != null) { o.uzunluk = uz; o.genislik = gen; }
  if (der != null) { o.genislik = gen; o.derinlik = der; }
  if (o.litre == null) {
    const f = FORM.find(([re]) => re.test(ad)) || [null, KONIK, 'konik'];
    if (o.uzunluk && o.genislik && o.yukseklik) { o.litre = yuvarla(o.uzunluk * o.genislik * o.yukseklik * 0.8 / 1000); o.bicim = 'uzun oval'; }
    else if (o.derinlik && o.genislik && o.yukseklik) { o.litre = yuvarla(o.derinlik * o.genislik * o.yukseklik * 0.7 / 1000); o.bicim = 'köşeli'; }
    else if (o.cap && o.yukseklik) { o.litre = yuvarla(litre(o.cap, o.yukseklik, f[1])); o.bicim = f[2]; }
  }
  return o.litre != null || o.cap != null ? [o] : [];
}

const delik = (s) => {
  if (/tahliye açıklığı|drenaj tablası|geniş drenaj sistemi|Drenaj:\s*Geniş/i.test(s)) return 'var';
  if (/drenaj deliği (?:yoksa|bulunmayan)|drenaj delikleri oluşturun|drenaj sistemi oluşturun|tahliye yapısını kontrol|su tahliyesi sağlayın|drenaj koşullarının/i.test(s)) return 'kontrol';
  return 'belirtilmemis';
};
const uygunCumle = (s, ad) => (s.split(/(?<=[.!?])\s+|\s•\s/).find((c) => c.split(' ')[0] !== ad.split(' ')[0] && !/\?\s*$|isteyen|arayan|tercih eden/i.test(c) && /bitki|çiçek|kaktüs|sukulent|orkide|ağaç|fide|menekşe/i.test(c) && !c.toLocaleLowerCase('tr-TR').includes(ad.toLocaleLowerCase('tr-TR').split(/\s+/).slice(0, 3).join(' ')) && /(için uygun|için ideal|için yeterli|ile kullanılabilir|için kullanılabilir|için tasarlanmış|için özel olarak)/i.test(c) && c.length < 260) || '').trim();

// Toprak paketleri (HasTürk özel topraklarının çoğu 5 / 10 / 20 / 40 L)
const PAKET = [5, 10, 20, 40];
function paketler(ihtiyac) {
  let best = null;
  for (let a = 0; a <= 12; a++) for (let b = 0; b <= 2; b++) for (let c = 0; c <= 1; c++) for (let d = 0; d <= 1; d++) {
    const top = a * 40 + b * 20 + c * 10 + d * 5, adet = a + b + c + d;
    if (!adet || top < ihtiyac) continue;
    if (!best || top < best.top || (top === best.top && adet < best.adet)) best = { top, adet, a, b, c, d };
  }
  if (!best) return null;
  return [[best.a, 40], [best.b, 20], [best.c, 10], [best.d, 5]].filter(([n]) => n).map(([n, l]) => `${n > 1 ? n + ' × ' : ''}${l} L`).join(' + ');
}
// Toprak: saksı hacminin ~%90'ı (üstte 2-3 cm sulama payı); sulamadan sonra toprak çöktüğü için %10 pay eklenir → ≈ hacim
const toprak = (L) => {
  const net = L * 0.9, al = L * 0.99;
  return { litre: yuvarla(net), paket: al <= 2.5 ? 'en küçük paket (5 L) yeter; artan toprak başka saksılarda kullanılabilir' : paketler(al) };
};

const pots = [];
for (const p of raw) {
  if (!/saks|vazo/i.test(p.ad) || /toprağı|aranjman/i.test(p.ad)) continue;
  const live = bySlug.get(p.adres);
  if (!live) continue;
  const s = txt(p.aciklama);
  let boy = olculer(p);
  // "Line Tabaklı | Renk | İthal Torf Hediye" ürünlerinde ölçü ana seri sayfasında
  if (/^line-saksi-/.test(p.adres) && !boy.some((b) => b.cap)) boy = olculer(raw.find((x) => x.adres === 'line-tabakli-bitki-saksisi')) || boy;
  boy = boy.map((b) => ({ ...b, toprak: b.litre ? toprak(b.litre) : null }));
  pots.push({ slug: p.adres, ad: live.n.trim(), stok: live.st, boylar: boy, delik: delik(s), tabak: /tabak/i.test(p.ad + ' ' + s), uygun: uygunCumle(s, p.ad), dis: /dış mekân|dış mekan/i.test(s) });
}

// Saksı seçimi kuralları (doğrulanmış genel bilgi)
const KURAL = {
  boyut: {
    metin: 'Saksı değiştirirken yeni saksı, eskisinden yalnızca 2,5–5 cm (1–2 inç) daha geniş olmalı. Çok büyük saksıdaki fazla toprak uzun süre ıslak kalır ve kök çürümesine yol açabilir.',
    kaynaklar: [
      { ad: 'Colorado State Univ. Extension – Repotting houseplants', url: 'https://planttalk.colostate.edu/topics/houseplants/1316-houseplants-repotting/' },
      { ad: 'Clemson HGIC – Repotting houseplants', url: 'https://hgic.clemson.edu/?p=1556' },
      { ad: 'NC State Extension – How to repot a houseplant', url: 'https://wayne.ces.ncsu.edu/2015/11/repotting-houseplants' },
      { ad: 'Univ. of Illinois Extension – Tips for repotting', url: 'https://extension.illinois.edu/blogs/good-growing/2018-03-19-tips-repotting-houseplants' },
    ],
  },
  delik: {
    metin: 'Saksıda drenaj deliği olması en önemli koşuldur. Deliksiz dekoratif saksıyı dış saksı (kaşpo) olarak kullanın: bitkiyi delikli bir iç saksıda tutun, sulamadan sonra dipte biriken suyu boşaltın.',
    kaynaklar: [{ ad: 'UC Master Gardeners – Succulent container gardens', url: 'https://ucanr.edu/node/129776' }],
  },
  cakil: {
    metin: 'Saksının dibine çakıl/taş koymanın süzülmeyi artırdığı tartışmalıdır: Washington State Üniversitesi yayını, ince topraktan iri katmana su geçişi zor olduğu için ıslak bölgenin yukarı çıktığını belirtir; bazı yeni çalışmalar ise sınırlı fayda bulmuştur. Güvenli yol: delikli saksı + iyi süzen toprak (gerekirse perlit karıştırılır).',
    kaynaklar: [
      { ad: 'WSU Puyallup – Container drainage (L. Chalker-Scott)', url: 'https://Puyallup.WSU.edu/wp-content/uploads/sites/403/2015/03/container-drainage.pdf' },
      { ad: 'PLOS One – Effect of drainage layers on water retention of potting media in containers', url: 'https://tradescantia.uk/article/drainage-layers/' },
    ],
  },
  zaman: {
    metin: 'Kökler drenaj deliğinden çıkıyorsa, toprak çok çabuk kuruyorsa ya da su toprağa işlemeden akıp gidiyorsa saksı değiştirme zamanı gelmiştir. En uygun dönem bitkinin büyümeye başladığı ilkbahardır.',
    kaynaklar: [{ ad: 'Clemson HGIC – Repotting houseplants', url: 'https://hgic.clemson.edu/?p=1556' }],
  },
  orkide: {
    metin: 'Orkide (Phalaenopsis) için delikli, şeffaf plastik saksı uygundur: kökler ve nem durumu dışarıdan görülür. Toprak yerine kabuk (bark) içeren orkide karışımı kullanılır; karışım yaklaşık 2 yılda bozulduğu için saksı değişiminde yenilenir. Saksı yalnızca bir boy büyütülür; çiçeklenme bittikten sonra yapılması önerilir.',
    kaynaklar: [
      { ad: 'UConn Home & Garden – Orchid care and repotting', url: 'https://homegarden.cahnr.uconn.edu/factsheets/orchid-care-and-repotting' },
      { ad: "BBC Gardeners' World – How to repot a moth orchid", url: 'https://www.gardenersworld.com/house-plants/how-to-repot-a-moth-orchid' },
    ],
  },
  kaktus: {
    metin: 'Kaktüs ve sukulentler delikli ve kökten biraz büyük saksıda, hızlı süzülen, su tutma kapasitesi düşük (kumlu) bir karışımda yetiştirilir. Fazla büyük saksı toprağın uzun süre ıslak kalmasına neden olur.',
    kaynaklar: [
      { ad: 'Univ. of Illinois Extension – Succulent container gardens', url: 'https://extension.illinois.edu/sites/default/files/succulent_container_gardens_.pdf' },
      { ad: 'UC Master Gardeners – Succulent container gardens', url: 'https://ucanr.edu/node/129776' },
    ],
  },
  hesap: 'Standart (yukarı doğru genişleyen) saksıda hacim ≈ 0,72 × 3,14 × (üst çap ÷ 2)² × yükseklik. Toprak ihtiyacı hacmin ~%90\'ı (üstte 2–3 cm sulama payı); sulamadan sonra toprak çöktüğü için ~%10 fazla alınır.',
};

// Çap → litre tablosu (yüksekliği çapına yakın standart saksı)
const tablo = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 30, 32, 35, 40, 45, 50, 55, 60].map((d) => {
  const L = yuvarla(litre(d, d * 0.95, KONIK));
  return { cap: d, litre: L, toprak: toprak(L) };
});

await writeFile('bilgi/saksilar.json', JSON.stringify({
  _aciklama: 'Saksı ölçüleri, toprak ihtiyacı ve saksı seçimi kuralları. kaynak: uretici = ürün sayfasındaki litre; hesap = ölçülerden yaklaşık. delik: var / kontrol (sayfada "delik yoksa iç saksı kullanın" uyarısı) / belirtilmemis.',
  surum: 1, kural: KURAL, tablo, saksilar: pots,
}, null, 1) + '\n');
const eksik = pots.filter((p) => !p.boylar.length || p.boylar.some((b) => b.litre == null));
console.log(`Saksı: ${pots.length} ürün, ${pots.reduce((a, p) => a + p.boylar.length, 0)} boy · hesapla bulunan ${pots.flatMap((p) => p.boylar).filter((b) => b.kaynak === 'hesap').length} · litresi eksik: ${eksik.map((p) => p.slug).join(', ') || '-'}`);
