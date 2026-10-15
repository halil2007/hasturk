// Ak Bilge tohum bilgisi: sebze türlerine göre ekim zamanı, yöntem (fide / doğrudan), ekim derinliği, mesafe,
// çimlenme süresi, 1 gramdaki tohum sayısı ve saklama ömrü. Değerler aşağıdaki kaynaklardan karşılaştırılarak
// alınmıştır (metinleri docs/kaynak/ altında). Kaynaklar arasında belirgin çelişki olan değer yazılmaz; tek kaynaklı
// değerler araştırma enstitüsü uzmanlarının rehberinden (BG) ya da resmi kurumdan (TG) alınır.
// Çıktı: bilgi/tohumlar.json (akbilge-havuz.mjs okur; tohum ürünleri türlerle eşleştirilir).
import { readFile, writeFile } from 'node:fs/promises';

const KAYNAK = {
  TG: { ad: 'TİGEM – Mirasımız Yerel Tohum: yerel tohum yetiştirme yöntemleri', url: 'https://www.tigem.gov.tr/Files/Miras%c4%b1m%c4%b1z_Yerel_Tohum.pdf' },
  BG: { ad: 'Atalık Tohumlar için Yetiştirici Rehberi (Dr. Gülay Beşirli, Dr. Alptekin Karagöz; Buğday Derneği, Yalova Atatürk Bahçe Kültürleri MAE katkısıyla)', url: 'https://www.bugday.org/blog/wp-content/uploads/2021/04/AtalikTohumlar.pdf' },
  AU: { ad: 'Ankara Üniversitesi Ziraat Fakültesi – Sebze türlerinde çoğaltma (ekim aralıkları ve tohum miktarı çizelgesi)', url: 'https://acikders.ankara.edu.tr/mod/resource/view.php?id=4225' },
  ABB: { ad: 'Ankara Büyükşehir Belediyesi – Sebze Yetiştiriciliği kurs notu', url: 'https://s.ankara.bel.tr/files/5214/3893/6685/SEBZE_YETTRCL.pdf' },
  BU: { ad: 'Tarım ve Orman Bakanlığı Bitkisel Üretim Genel Müdürlüğü – Ekim ayı ekim önerisi (Sabah haberi)', url: 'https://www.sabah.com.tr/ekonomi/balkon-bahceciligi-hobi-olmaktan-cikiyor-7119190' },
  SZ: { ad: 'Sözcü – Eylül ve Ekim aylarında ekim', url: 'https://www.sozcu.com.tr/eylul-ve-ekim-aylarinda-eken-kazaniyor-hasat-zamani-verim-2-kat-artiyor-p229165' },
  TK: { ad: 'Tarım Kütüphanesi – Kökü yenen sebzeler (havuç, turp…)', url: 'http://www.tarimkutuphanesi.com/koku_yenilen_sebzeler_(havuc,_turp,_kereviz,_sogan,_sarimsak)_00443.html' },
};

// Ortak cümleler
const FIDE_DIKIM = 'Fideler son don tarihinden bir hafta sonra, gece sıcaklığı 10 °C\'nin üstüne çıkınca dikilir; bölgeye göre genellikle 25 Nisan–15 Mayıs arası (soğuk bölgelerde biraz daha geç, sıcak bölgelerde daha erken).';
const SICAK_DOGRUDAN = 'Tohum, son don tarihinden bir hafta sonra doğrudan yerine ekilir.';
const KABAK_ZAMAN = SICAK_DOGRUDAN.replace(/\.$/, ' (fide yapılmadan, Nisan–Mayıs aylarında).');

const TUR = {
  domates: { ad: 'Domates', grup: 'sıcak iklim', yontem: 'fide',
    zaman: `Tohum, fide dikiminden 30–35 gün önce viyole ya da kapalı alanda fide yastığına ekilir; fideler 4–6 haftada dikime hazır olur. ${FIDE_DIKIM}`,
    derinlik: '0,5–1 cm', cimlenme: '6–8 gün', mesafe: 'Sıra arası 70–100 cm, sıra üzeri 40–60 cm (sırık çeşitler destekle yetiştirilir; koltukları alınır)',
    sicaklik: 'Fide yetiştirirken ortam 20–25 °C, toprak nemli (ıslak değil) tutulur.', hasat: 'Fide dikiminden sonra kiraz domateste ~60 gün, sofralıkta ~80 gün', gram: [240, 400], saklama: 4, k: ['BG', 'TG', 'AU', 'ABB'] },
  biber: { ad: 'Biber', grup: 'sıcak iklim', yontem: 'fide',
    zaman: `Tohum, fide dikiminden 45–50 gün önce viyole ya da kapalı alanda fide yastığına ekilir (ör. Ankara'da mart ortası ekim, mayıs ortası dikim). ${FIDE_DIKIM}`,
    derinlik: '0,5–1 cm', cimlenme: '8–14 gün', mesafe: 'Sıra arası 60–70 cm, sıra üzeri 20–40 cm',
    sicaklik: 'Soğuğa çok hassastır; fideler don tehlikesi tamamen geçince dikilir.', hasat: 'Yeşil biber fide dikiminden ~75 gün sonra', gram: [140, 180], saklama: 4, k: ['BG', 'TG', 'AU', 'ABB'] },
  patlican: { ad: 'Patlıcan', grup: 'sıcak iklim', yontem: 'fide',
    zaman: `Tohum, fide dikiminden 45–50 gün önce viyole ya da kapalı alanda fide yastığına ekilir. ${FIDE_DIKIM}`,
    derinlik: '0,5–1 cm', cimlenme: '8–15 gün', mesafe: 'Sıra arası 60–70 cm, sıra üzeri 50–60 cm',
    sicaklik: 'Tohumun çimlenmesi için toprak sıcaklığı 19 °C\'nin üzerinde olmalıdır.', hasat: 'Fide dikiminden 75–90 gün sonra', gram: [215, 280], saklama: 5, k: ['BG', 'TG', 'AU', 'ABB'] },
  hiyar: { ad: 'Hıyar (salatalık)', grup: 'sıcak iklim', yontem: 'doğrudan (fideyle de olur)',
    zaman: `${SICAK_DOGRUDAN} Toprak sıcaklığı en az 11 °C olmalıdır. Fide ile de yetiştirilebilir.`,
    derinlik: '2,5–3 cm', cimlenme: '6–8 gün', mesafe: 'Ocaklar arası 45–60 cm, sıra arası 120–150 cm; her ocağa 4–5 tohum, çıkıştan sonra 2 bitki bırakılır (sırık çeşitlere destek verilir)',
    hasat: 'Tohum ekiminden 55–70 gün sonra', gram: [25, 50], saklama: 5, k: ['BG', 'ABB', 'AU'] },
  kabak: { ad: 'Kabak', grup: 'sıcak iklim', yontem: 'doğrudan',
    zaman: KABAK_ZAMAN, derinlik: '2–3 cm', cimlenme: '6–12 gün', mesafe: 'Ocaklar arası 70–100 cm, sıra arası 100–150 cm; her ocağa 2–3 tohum, çıkıştan sonra 1 bitki bırakılır',
    hasat: 'Sakız kabağında tohum ekiminden ~50 gün sonra', saklama: 5, k: ['BG', 'TG', 'AU'] },
  balkabagi: { ad: 'Bal kabağı', grup: 'sıcak iklim', yontem: 'doğrudan',
    zaman: KABAK_ZAMAN, derinlik: '3–5 cm', mesafe: 'Sıra üzeri 50–90 cm, sıra arası 150–300 cm (geniş yer ister)', saklama: 5, k: ['BG', 'TG'] },
  fasulye: { ad: 'Fasulye', grup: 'sıcak iklim', yontem: 'doğrudan',
    zaman: 'İlkbaharda don tehlikesi geçip toprak ısınınca doğrudan yerine ekilir; ekim Nisan–Ağustos arasında yapılabilir. Çok sıcakta (30–35 °C) çiçekler döllenmez; yazı serin geçen yerlerde haziranda ikinci ekim yapılabilir.',
    derinlik: '3–5 cm', cimlenme: '1–2 hafta', mesafe: 'Oturak (bodur): sıra arası 40–70 cm, sıra üzeri 10–20 cm. Sırık: sıra arası 70–120 cm, sıra üzeri 15–20 cm; bitkiler 10–15 cm olunca sırık/çıta verilir. Ocak usulünde her ocağa 2–3 tohum',
    hasat: 'Taze fasulye tohum ekiminden 65–85 gün sonra', gram: [1, 6], saklama: 3, k: ['BG', 'TG', 'AU'] },
  barbunya: { ad: 'Barbunya', grup: 'sıcak iklim', yontem: 'doğrudan',
    zaman: 'İlkbaharda don tehlikesi geçtikten sonra doğrudan yerine ekilir. En iyi meyve tutumu 18–25 °C\'de olur; 30–35 °C\'de döllenme olmaz.',
    derinlik: '3–5 cm', cimlenme: '6–9 gün', mesafe: 'Ocaklar 30–50 cm arayla, her ocağa 2–3 tohum; sırık çeşitlere herek/kamış verilir',
    hasat: 'Taze tüketim için tohum ekiminden 65–90 gün sonra', saklama: 3, k: ['BG'] },
  bezelye: { ad: 'Bezelye', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Kışı ılık geçen bölgelerde sonbaharda (15 Ekim–15 Kasım, aralığa kadar), kışı soğuk geçen bölgelerde ilkbaharda (15 Şubat–mart sonu) ekilir.',
    derinlik: '3–5 cm', cimlenme: '5–10 gün', mesafe: 'Ocaklar 30–50 cm arayla, her ocağa 2–3 tohum; sırık tiplere destek verilir',
    hasat: 'Taze tüketim için tohum ekiminden 60–120 gün sonra', gram: [3, 4], saklama: 3, k: ['BG', 'AU'] },
  bamya: { ad: 'Bamya', grup: 'sıcak iklim', yontem: 'doğrudan',
    zaman: 'Sıcak iklim sebzesidir; ideal gelişme sıcaklığı 22–30 °C, bölgenize göre havalar bu sıcaklığa ulaşınca ekilir. Tohum sert kabuklu olduğu için ekimden 1 gün önce suda ıslatılır.',
    derinlik: '2–2,5 cm', cimlenme: '6–12 gün', mesafe: 'Sıra üzeri 45 cm, sıra arası 75 cm (ya da 40–45 cm arayla ocaklara 2–3 tohum)',
    hasat: 'Meyve olgunlaşması 85–95 gün', gram: [15, 19], saklama: 2, k: ['BG', 'ABB'] },
  marul: { ad: 'Marul / salata', grup: 'serin iklim', yontem: 'fide ya da doğrudan',
    zaman: 'Serin iklim sebzesidir; ilkbahar ve sonbahar ekimleri uygundur. Fide yapılacaksa tohum, dikimden 25–30 gün önce ekilir. Tohumlar 4–27 °C toprak sıcaklığında çimlenir.',
    derinlik: '0,5–1 cm', cimlenme: '6–10 gün', mesafe: 'Sıra arası 30–35 cm, sıra üzeri 20–30 cm',
    sicaklik: 'Ekimden sonra üzerinin örtülmesi çimlenmeyi teşvik eder; fideler görününce örtü kaldırılır.', hasat: 'Çeşide göre 55–90 gün', gram: [700, 1300], saklama: 5, k: ['BG', 'ABB', 'AU'] },
  ispanak: { ad: 'Ispanak', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'İdeal gelişme sıcaklığı 15–20 °C\'dir; ılıman iklimde sulama ve çeşit seçimi doğru yapılırsa her mevsim ekilebilir. Ekimden sonra düzenli sulama çok önemlidir.',
    derinlik: '1–3 cm (hafif toprakta daha derin)', cimlenme: '5–10 gün', mesafe: 'Serpme ya da sıraya; sıra arası 20–30 cm, sıra üzeri 5–10 cm',
    hasat: 'Tohum ekiminden 35–50 gün sonra', gram: [70, 104], saklama: 5, k: ['BG', 'AU'] },
  lahana: { ad: 'Lahana (beyaz lahana, kara lahana)', grup: 'serin iklim', yontem: 'fide',
    zaman: 'Fide ile yetiştirilir: kışlık üretimde tohumlar temmuz–ağustosta viyollere ekilir, 4–5 hafta sonra (5–6 yapraklı) fideler yerine dikilir.',
    derinlik: '0,5–1,5 cm', cimlenme: '4–10 gün', mesafe: 'Sıra arası 60–100 cm, sıra üzeri 40–60 cm',
    hasat: 'Fide dikiminden sonra çeşide göre 70–160 gün', gram: [225, 300], saklama: 5, k: ['TG', 'BG', 'AU'] },
  havuc: { ad: 'Havuç', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Doğrudan yerine ekilir; ilkbaharda mart–nisan ana ekim dönemidir. İklimi uygun yerlerde şubattan kasıma kadar 2–3 hafta arayla kademeli ekim yapılabilir.',
    derinlik: '1–1,5 cm', cimlenme: '10–20 gün (yavaş çimlenir)', mesafe: 'Sıra arası 20–30 cm; çıkıştan sonra seyreltilip sıra üzeri 5–8 cm bırakılır',
    sicaklik: 'Tohum çok küçük olduğu için kum ya da toprakla karıştırılarak serpilir; toprak iyi inceltilmeli, gevşek ve derin olmalıdır.', hasat: 'Tohum ekiminden 70–120 gün sonra', gram: [826, 850], saklama: 3, k: ['BG', 'TK', 'ABB'] },
  turp: { ad: 'Turp', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Fındık turpu ağustostan mayısa kadar 15 gün arayla ekilebilir; kışlık büyük turplar (bayır, Japon/Çin turpu tipi) temmuz–ağustosta ekilir. Yumru en iyi 14–16 °C\'de oluşur; sıcakta küçük kalır.',
    derinlik: '1,5–2 cm', cimlenme: '3–8 gün', mesafe: 'Fındık turpu: sıra arası 20–25 cm, sıra üzeri 3–6 cm. Büyük turplar: sıra arası 30–40 cm, sıra üzeri 10–20 cm',
    hasat: 'Fındık turpu 3–4 hafta, büyük turplar ~3 ay', gram: [75, 150], saklama: 5, k: ['TK', 'BG', 'AU'] },
  maydanoz: { ad: 'Maydanoz', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'İdeal gelişme sıcaklığı 15–20 °C\'dir; sulama ayarlanırsa ılıman iklimde yıl boyu ekilebilir. Ekimden sonra düzenli sulama çok önemlidir.',
    derinlik: '0,5–1 cm', cimlenme: '14–21 gün (yavaş çimlenir, sabırlı olun)', mesafe: 'Serpme ya da sıraya; sıraya ekimde sıra üzeri 2–5 cm',
    hasat: 'İlk hasat 70–90 gün; biçildikten 20–25 gün sonra yeniden biçilebilir', gram: [530, 833], saklama: 2, k: ['BG', 'AU'] },
  dereotu: { ad: 'Dereotu', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Mart–nisan aylarında doğrudan yerine ekilir. Çimlenme oranı düşük olduğu için biraz fazla tohum kullanılır; ekimden hemen sonra sulanır ve toprak nemli tutulur.',
    derinlik: 'Çok yüzeysel: tohumlar serpilip toprağa hafifçe bastırılır', mesafe: 'Sıra arası 20–25 cm, sıra üzeri 2–4 cm (ya da serpme)', k: ['TG'] },
  roka: { ad: 'Roka', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Mart–haziran arasında doğrudan yerine ekilir. Sıcak bölgelerde ekim mayıs sonuna kadar tamamlanır; serin bölgelerde eylülde ikinci ekim yapılabilir.',
    derinlik: 'Yaklaşık 0,5 cm', mesafe: 'Sıra arası 15–20 cm, sıra üzeri 4–5 cm', k: ['TG'] },
  tere: { ad: 'Tere', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Mart–haziran arasında doğrudan yerine ekilir. Sıcak bölgelerde ekim mayıs sonuna kadar tamamlanır; serin bölgelerde eylülde ikinci ekim yapılabilir.',
    derinlik: 'Yaklaşık 0,5 cm', mesafe: 'Sıra arası 15–20 cm, sıra üzeri 4–5 cm', k: ['TG'] },
  pazi: { ad: 'Pazı', grup: 'serin iklim', yontem: 'doğrudan',
    zaman: 'Serin iklim sebzesidir.', cimlenme: '8–16 gün', gram: [37, 70], saklama: 4, k: ['BG', 'ABB'] },
};
const GENEL = {
  derinlik: 'Pratik kural: her tohum kendi iriliğinin 2,5–3 katı derinliğe ekilir. Hafif (kumlu) topraklarda ve rüzgârlı yerlerde biraz daha derine, ağır, ıslak topraklarda biraz daha yüzeye ekilir.',
  dogrudan: 'Doğrudan tohumla ekilenler: soğan, ıspanak, turp, roka, tere, bezelye, fasulye, bakla, börülce, bamya, havuç, maydanoz, dereotu, semizotu. Fideyle yetiştirilmesi daha ekonomik olanlar: domates, biber, patlıcan, hıyar, kavun, kabak, karpuz ve lahana grubu.',
  serin: 'Serin iklim sebzeleri (aylık ortalama 15–18 °C\'de en iyi gelişir): bezelye, ıspanak, soğan, sarımsak, turp, tere, maydanoz, marul, pırasa, pazı, lahana, kırmızı pancar, kereviz, brokoli, bakla, enginar, havuç.',
  sicak: 'Sıcak iklim sebzeleri (aylık ortalama 25–30 °C\'de en iyi gelişir, soğuğa hassastır): biber, bamya, domates, fasulye, hıyar, kavun, karpuz, kabak, patlıcan, mısır, patates.',
  k: ['BG', 'ABB'],
};
// Ay ay ekim/dikim (yalnız kaynakta ay açıkça yazanlar; "ılıman iklimde her mevsim" gibi genel ifadeler aya çevrilmez).
// t: tohum ekimi, d: fide dikimi, not: bölge açıklaması
const AYLAR = {
  domates: [{ t: [3, 4], not: 'fide için, kapalı alanda' }, { d: [4, 5], not: 'fide dikimi; sıcak bölgelerde daha erken' }],
  biber: [{ t: [3], not: 'fide için, kapalı alanda' }, { d: [4, 5], not: 'fide dikimi' }],
  patlican: [{ t: [3], not: 'fide için, kapalı alanda' }, { d: [4, 5], not: 'fide dikimi' }],
  kabak: [{ t: [4, 5], not: 'doğrudan yerine' }], balkabagi: [{ t: [4, 5], not: 'doğrudan yerine' }],
  fasulye: [{ t: [4, 5, 6, 7, 8], not: 'doğrudan yerine' }],
  bezelye: [{ t: [10, 11, 12], not: 'kışı ılık geçen bölgelerde' }, { t: [2, 3], not: 'kışı soğuk geçen bölgelerde' }],
  lahana: [{ t: [7, 8], not: 'kışlık için fide' }],
  havuc: [{ t: [3, 4], not: 'ana ekim dönemi' }, { t: [10, 11], not: 'kışı toprakta geçirir, ilkbaharda erken hasat' }],
  turp: [{ t: [8, 9, 10, 11, 12, 1, 2, 3, 4, 5], not: 'fındık turpu, 15 gün arayla' }, { t: [7, 8], not: 'kışlık büyük turplar' }],
  dereotu: [{ t: [3, 4] }],
  roka: [{ t: [3, 4, 5, 6] }, { t: [9], not: 'serin bölgelerde ikinci ekim' }, { t: [10], not: 'ılıman bölgelerde' }],
  tere: [{ t: [3, 4, 5, 6] }, { t: [9], not: 'serin bölgelerde ikinci ekim' }, { t: [10] }],
  ispanak: [{ t: [10] }],
  marul: [{ t: [10] }],
  maydanoz: [{ t: [9, 10], not: 'kış maydanozu; zor çimlendiği için biraz fazla tohum kullanılır' }],
};
for (const [k, v] of Object.entries(AYLAR)) TUR[k].aylar = v;
// Ekim önerisini (BU) ve sonbahar ekimini (SZ) kaynak listesine ekle
for (const k of ['havuc', 'ispanak', 'marul', 'maydanoz', 'tere', 'turp']) if (!TUR[k].k.includes('BU')) TUR[k].k.push('BU');
for (const k of ['havuc', 'maydanoz', 'roka']) if (!TUR[k].k.includes('SZ')) TUR[k].k.push('SZ');

// Ürün adı → tür (ilk eşleşen)
const ESLE = [
  [/bal kaba/i, 'balkabagi'], [/kudret nar/i, null], [/domates/i, 'domates'], [/biber(?!iye)/i, 'biber'], [/patlıcan/i, 'patlican'],
  [/hıyar|salatalık/i, 'hiyar'], [/kabak/i, 'kabak'], [/barbunya/i, 'barbunya'], [/fasulye/i, 'fasulye'], [/bezelye/i, 'bezelye'],
  [/bamya/i, 'bamya'], [/marul/i, 'marul'], [/ıspanak/i, 'ispanak'], [/lahana/i, 'lahana'], [/havuç/i, 'havuc'], [/turp/i, 'turp'],
  [/maydanoz/i, 'maydanoz'], [/dere ?otu/i, 'dereotu'], [/roka/i, 'roka'], [/tere tohum/i, 'tere'], [/pazı/i, 'pazi'],
];
const prods = JSON.parse(await readFile('public/products.json', 'utf8'));
const urunler = {};
for (const p of prods.items) {
  if (!/tohum/i.test(p.n) || /çim|yonca|seti/i.test(p.n)) continue;
  const lc = p.n.toLocaleLowerCase('tr-TR');
  const e = ESLE.find(([re]) => re.test(lc));
  const gr = (p.n.match(/(\d+(?:[.,]\d+)?)\s*(?:gr|g)\b/i) || [])[1], adet = (p.n.match(/(\d+)\s*adet/i) || [])[1];
  const o = { tur: e ? e[1] : null };
  if (gr) o.gram = parseFloat(gr.replace(',', '.'));
  if (adet) o.adet = +adet;
  const t = o.tur && TUR[o.tur];
  // Tohum iriliği çeşide göre çok değişen türlerde (fasulye gibi, aralık 3 kattan geniş) sayı verilmez
  if (t && t.gram && o.gram && t.gram[1] / t.gram[0] <= 3) o.tohumSayisi = [Math.round(t.gram[0] * o.gram / 10) * 10, Math.round(t.gram[1] * o.gram / 10) * 10];
  urunler[p.s] = o;
}
await writeFile('bilgi/tohumlar.json', JSON.stringify({
  _aciklama: 'Sebze tohumu ekim bilgisi. Değerler kaynaklar karşılaştırılarak alınmıştır (k: kaynak kodları). gram: 1 gramdaki tohum sayısı aralığı; saklama: uygun koşulda saklama ömrü (yıl). urunler: mağazadaki tohum ürünlerinin türle eşleşmesi.',
  surum: 1, kaynaklar: KAYNAK, genel: GENEL, turler: TUR, urunler,
}, null, 1) + '\n');
const es = Object.values(urunler);
console.log(`Tohum: ${Object.keys(TUR).length} tür · ${es.length} ürün, türü eşleşen ${es.filter((u) => u.tur).length}, tohum sayısı hesaplanan ${es.filter((u) => u.tohumSayisi).length}`);
console.log('Eşleşmeyen: ' + Object.entries(urunler).filter(([, u]) => !u.tur).map(([s]) => s).join(', '));
