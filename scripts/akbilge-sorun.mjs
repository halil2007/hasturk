// Ak Bilge bitki sorunları bilgisi: "yaprakları neden sarardı, niye çiçek açmıyor, toprakta sinek var" gibi sorular.
// Her belirti için olası nedenler, nasıl anlaşılır, ne yapılmalı ve sitemizde gerçekten işe yarayacak ürünler (faydasıyla).
// Bilgiler üniversite yayım (extension) kaynaklarından derlendi (aşağıda KAYNAK); kaynaklar müşteriye gösterilmez.
// Kurallar: kesin teşhis yok ("olası nedenler"), ilaç dozu yok (ürün etiketine göre), ev/halk sağlığı böcek ilaçları
// (Chrysamed insektisit, Sinpest vb.) bitkiye önerilmez, ürün faydası yalnız ürün açıklamasında yazanla sınırlı.
// Çıktı: bilgi/sorunlar.json (akbilge-havuz.mjs okur; stokta olmayan ürün cevaptan sunucuda çıkarılır).
import { readFile, writeFile } from 'node:fs/promises';

const prods = JSON.parse(await readFile('public/products.json', 'utf8'));
const bySlug = new Map(prods.items.map((p) => [p.s, p]));

const KAYNAK = {
  ucipm: 'UC IPM, Houseplant Problems (Pest Notes) — ipm.ucanr.edu/legacy_assets/pdf/pestnotes/pnhouseplantproblems.pdf',
  illinois: 'University of Illinois Extension, Troubleshooting Houseplant Problems (kök rengi, yaprak ucu, tuz birikimi)',
  isu: 'Iowa State University Extension, Yard and Garden: How to Get Orchids to Rebloom; Blossom-End Rot of Tomato',
  clemson: 'Clemson HGIC, Flower & Fruit Problems (fazla azot, yetersiz ışık, budama zamanı)',
  gnat: 'Oregon State Univ., Univ. of Wisconsin, Univ. of Maryland Extension: Fungus Gnats',
  ucmg: 'UC Master Gardeners / UConn Home & Garden: Aphids, Mealybugs, Spider Mites on houseplants',
  umd: 'University of Maryland Extension, Pesticide Profile: Horticultural Oil (sıcakta ve susuz bitkide uygulama uyarısı)',
  narenciye: 'RHS, Citrus problems; UC Master Gardeners, citrus leaf yellowing and drop',
  domates: 'University of Nevada Extension (blossom drop); Illinois Extension (fruit cracking); UF/IFAS, MSU, UGA (blossom end rot)',
  usu: 'Utah State University Extension, Slugs and Snails',
  mobot: 'Missouri Botanical Garden, Whitefly indoors',
  ncsu: 'NC State Extension, seedling damping-off; seed starting light',
  csu: 'Colorado State Univ. Extension, iron chlorosis (yüksek pH, yeni yapraklarda damar arası sararma)',
};

// Ürün → müşteriye söylenecek fayda (ürün açıklamasında yazanla sınırlı)
const U = {
  perlit: ['tarim-perliti', 'toprağı havalandırır, fazla suyun süzülmesini kolaylaştırır; kökler nefes alır'],
  kalinPerlit: ['kalin-tarim-perliti', 'iri taneli perlit; drenajı artırır, toprağın sıkışmasını önler'],
  kaktusT: ['kaktus-ve-sukulent-topragi', 'hızlı süzülen karışım; suyun kökte birikmesini önler'],
  orkideT: ['gartengold-orkide-topragi', 'orkidelere özel havadar yetiştirme ortamı'],
  cicekT: ['hg-cicek-topragi', 'saksı değişimi ve toprak yenilemede kullanılan çiçek toprağı'],
  genelT: ['genel-saksi-topragi-ozel-karisim', 'solucan gübreli hazır saksı karışımı; yorgun toprağı yenilemek için'],
  asitT: ['ortanca-bogurtlen-acelya-topragi', 'asidik toprak isteyen bitkiler (ortanca, açelya, yaban mersini) için özel karışım'],
  fideT: ['fide-sasirtma-topragi', 'fide yetiştirmeye özel hazırlanmış yeni toprak'],
  solucan: ['hasturk-kati-solucan-gubresi', '%100 organik, yavaş salınımlı besin; toprağa organik madde katar, önerilen dozda bitkiyi yakmaz'],
  sivi: ['hasturk-sivi-solucan-gubresi', 'organik sıvı besin; sulama suyuna ya da yapraktan verilir, bitki besini hızlı alır'],
  humix: ['hasturk-humix-sivi-humik-asit', 'kök gelişimini, besin alımını ve toprağın su tutmasını destekler'],
  neem: ['tarm-bioleaf-protector-neem-yagi-500-ml-bocek-kovucu-sprey', 'neem yağı esaslı, kullanıma hazır sprey; ürün bilgisine göre yaprak biti, unlu bit, kabuklu bit ve beyaz sineğe karşı kovucu etkilidir'],
  floristSinek: ['florist-sinek-ve-unlu-bit-onleyici-bitki-spreyi', 'bitkisel bazlı sprey; ürün bilgisine göre unlu bite ve topraktan çıkan küçük sineklere karşı önleyicidir'],
  floristMantar: ['florist-mantar-onleyici-bitki-spreyi-250-ml', 'bitkisel bazlı sprey; ürün bilgisine göre yapraktaki un serpilmiş gibi beyaz lekelere (külleme) ve orkidede sık görülen mantar sorunlarına karşı önleyicidir'],
  subonHijyen: ['chrysamed-subon-hijyen-sprey', 'ürün bilgisine göre küllenme görülen bitkilerin bakımında ve toprak kokusunu azaltmada kullanılır'],
  boncuk: ['chrysamed-envira-subon-akilli-su-boncuklari-400-gr', 'topraktaki nemi dengeler; aşırı ya da yetersiz sulamadan doğan su stresini azaltmaya yardımcı olur'],
  cicekB: ['florist-cicekli-bitkiler-sivi-konsantre-bitki-besini', 'çiçekli bitkiler için hazırlanmış sıvı besin'],
  petal: ['tarm-petal-power-cicekli-bitki-besini-sprey-500-ml', 'çiçekli bitkiler için kullanıma hazır sprey besin'],
  yesilB: ['florist-yesil-yaprakli-bitkiler-sivi-konsantre-besini', 'yeşil yapraklı salon bitkileri için hazırlanmış sıvı besin'],
  orkideB: ['florist-konsantre-orkide-besini', 'orkidelere özel sıvı besin'],
  orkideS: ['tarm-orchid-elixir-sivi-orkide-besini-sprey-500-ml', 'orkidelere özel kullanıma hazır sprey besin'],
  kaktusB: ['florist-konsantre-sivi-kaktus-ve-sukulent-bitki-besini', 'kaktüs ve sukulentlere özel sıvı besin'],
};

const ILAC_NOT = 'Spreyleri ürün etiketindeki kullanım şekline göre uygulayın; sıcak saatlerde (30°C üstü), güneş altında ve susuz kalmış bitkiye uygulamayın, önce birkaç yaprakta deneyin.';

// Soru kalıbı üreticileri: aynı belirtiyi müşterinin sorabileceği farklı biçimlerde yaz
const qx = (bas, ekler = ['', ' neden', ' niye', ' ne yapmalıyım', ' ne yapabilirim', ' çözümü', ' ne iyi gelir', ' nasıl geçer', ' nasıl kurtulurum', ' ne kullanmalıyım']) => ekler.map((e) => bas + e);

const S = [];
const add = (o) => S.push(o);

// ---------- Genel (tüm bitkiler) ----------
add({ key: 'yaprak-sararma', baslik: 'Yapraklarda sararma',
  sorular: [...qx('yapraklar sararıyor'), ...qx('yaprakları sarardı'), ...qx('çiçeğimin yaprakları sararıyor'), 'yaprakları neden sararır', 'bitkimin yaprakları sararıyor', 'çiçeğimin yaprakları sarardı', 'saksı bitkisi yaprak sararması', 'yaprak sararması neden olur',
    'alt yapraklar sararıyor', 'alt yaprakları sarardı', 'yapraklar sarı oldu', 'sararan yapraklar için ne yapmalı', 'sararan yaprak için gübre', 'yaprak sararmasına hangi gübre', 'yapraklar sararıp düşüyor', 'yapraklar sararıp dökülüyor', 'salon bitkisi yaprakları sararıyor'],
  nedenler: ['Fazla sulama ve suyun saksıda birikmesi (en sık neden): kökler havasız kalır', 'Besin (özellikle azot) eksikliği: önce yaşlı alt yapraklar açık yeşil-sarı olur', 'Yetersiz ışık: bitki solgun, sarımsı yeşil kalır', 'Yaşlı alt yaprakların doğal dökümü: birkaç yaprak sararıp düşüyorsa normaldir'],
  anlama: ['Toprağa parmağınızı 2-3 cm sokun: sürekli ıslaksa fazla sulamadır', 'Saksı dibinde delik var mı, tabakta su bekliyor mu bakın', 'Sararma alttaki yaşlı yapraklardaysa besin eksikliği, en uçtaki yeni yapraklarda damarlar yeşil kalıp ara yerler sararıyorsa demir/kireç sorunu olabilir', 'Kökleri kontrol edin: sağlıklı kök beyaz ve diridir; kahverengi-siyah ve yumuşak kök çürüme işaretidir'],
  yapin: ['Toprağın üstü kurumadan tekrar sulamayın, tabakta su bırakmayın', 'Saksının drenaj deliği yoksa delikli saksıya alın; toprağa perlit karıştırarak süzülmeyi artırın', 'Bitkiyi daha aydınlık bir yere alın (yaprakları yakan direkt öğle güneşi hariç)', 'Toprak uzun süredir değişmediyse ve sulama düzgünse bitkiyi organik bir besinle destekleyin'],
  urunler: ['perlit', 'solucan', 'sivi', 'genelT'], kaynak: ['ucipm', 'illinois'] });

add({ key: 'kloroz', baslik: 'Yeni yapraklarda damar arası sararma (kireç / demir sorunu)',
  sorular: ['yeni yapraklar sararıyor', 'uçtaki yapraklar sararıyor', 'yaprak damarları yeşil arası sarı', 'yaprakların damarları yeşil kalıyor', 'damar arası sararma', 'yeni yapraklar sararıyor damarlar yeşil', 'demir eksikliği belirtileri', 'demir eksikliği nasıl giderilir', 'kireçli toprak yaprak sararması', 'açelya yaprakları sararıyor', 'yaban mersini yaprakları sararıyor', 'gardenya yaprakları sararıyor', 'kloroz nedir'],
  nedenler: ['Toprağın ya da sulama suyunun kireçli (pH yüksek) olması: demir toprakta olsa da bitki alamaz', 'Asidik toprak isteyen bitkilerin (ortanca, açelya, gardenya, yaban mersini, kamelya) normal toprağa dikilmesi', 'Sürekli ıslak toprak: kökler demiri alamaz'],
  anlama: ['Sararma en uçtaki genç yapraklardadır ve damarlar yeşil kalır', 'Musluk suyu kireçliyse saksı kenarında ve toprak yüzünde beyaz kabuk oluşur'],
  yapin: ['Asit seven bitkileri asidik özel toprağa alın', 'Mümkünse kireci az su (yağmur suyu, bekletilmiş su) kullanın', 'Toprağı sürekli ıslak tutmayın'],
  urunler: ['asitT', 'humix', 'solucan'], kaynak: ['csu', 'ucipm'] });

add({ key: 'uc-kuruma', baslik: 'Yaprak uçlarında ve kenarlarında kahverengileşme, kuruma',
  sorular: [...qx('yaprak uçları kuruyor'), ...qx('yaprak uçları kahverengi'), 'yaprakların ucu kurudu', 'yaprak kenarları kuruyor', 'yaprak kenarları kahverengi oldu', 'yaprak uçları yanıyor', 'yaprak uçları sararıp kuruyor', 'yapraklarda kahverengi lekeler', 'yapraklarda kuruma var', 'yapraklar kuruyor', 'yaprakların ucu kahverengi oldu', 'yaprak uçları kahverengileşiyor'],
  nedenler: ['Düzensiz sulama: toprağın tamamen kuruyup sonra çok ıslanması', 'Toprakta tuz birikmesi (fazla gübre ya da kireçli su): toprak yüzünde ve saksı kenarında beyaz kabuk', 'Kuru hava: kalorifer, klima, soba yakını ya da soğuk hava akımı', 'Fazla güneş: yaprakta açık renkli, kuru yanık lekeler'],
  anlama: ['Toprak yüzünde beyaz kabuk varsa tuz birikimidir', 'Bitki kalorifer/klima yanındaysa ya da cereyanda kalıyorsa hava kuruluğudur', 'Kuruma sadece güneşe bakan yaprakladıysa güneş yanığıdır'],
  yapin: ['Toprağın üst kısmı kuruyunca sulayın, tamamen kurutmayın', 'Tuz birikimi varsa saksıdan bol suyu birkaç kez geçirip süzdürün (yıkama) ve bir süre gübreye ara verin; çok kabuklanmışsa toprağı yenileyin', 'Bitkiyi kalorifer, klima ve cereyandan uzaklaştırın', 'Kuruyan uçları sağlam dokuya kadar temiz makasla kesebilirsiniz'],
  urunler: ['boncuk', 'genelT', 'cicekT'], kaynak: ['illinois', 'ucipm'] });

add({ key: 'solma', baslik: 'Bitkinin solması, boynunu bükmesi',
  sorular: [...qx('bitkim soldu'), ...qx('çiçeğim soldu'), 'bitki boynunu büktü', 'yapraklar sarktı', 'yaprakları pörsüdü', 'sulamama rağmen soluyor', 'sulamama rağmen bitkim soldu', 'çiçek soluyor ne yapayım', 'bitki solgun', 'fide soldu', 'yapraklar düştü sarktı', 'solan bitki nasıl kurtarılır'],
  nedenler: ['Susuz kalma: toprak kupkuru ve saksı hafiftir', 'Fazla sulama ve kök çürümesi: toprak ıslak olduğu halde bitki solar, çünkü çürüyen kök su çekemez', 'Sıcak ve güneşte aşırı ısınma (öğle saatinde geçici solma)', 'Saksının köklerle dolması (kök sıkışması): su hızla tükenir'],
  anlama: ['Toprak kuruysa susuzluktur; sulayınca birkaç saatte toparlanır', 'Toprak ıslak ve bitki yine solgunsa kökü kontrol edin: kahverengi-siyah, yumuşak ve kötü kokan kök çürümedir', 'Köklerin saksı deliğinden çıkması ve suyun çabuk tükenmesi saksının dar geldiğini gösterir'],
  yapin: ['Kuru toprakta saksıyı iyice sulayın, fazla suyu süzdürün', 'Islak toprakta solmada sulamayı kesin; kök çürümüşse çürük kökleri kesip bitkiyi yeni, süzek toprağa alın', 'Kökler saksıyı doldurduysa bir boy büyük saksıya alın', 'Sıcak günlerde öğle güneşinden koruyun'],
  urunler: ['perlit', 'genelT', 'humix', 'boncuk'], kaynak: ['ucipm', 'illinois'] });

add({ key: 'yaprak-dokumu', baslik: 'Yaprak dökülmesi',
  sorular: [...qx('yapraklar dökülüyor'), ...qx('yaprak döküyor'), 'bitkim yapraklarını döktü', 'yeşil yapraklar dökülüyor', 'yer değiştirince yaprak döktü', 'eve getirdim yaprak döküyor', 'yeni aldığım bitki yaprak döküyor', 'kışın yaprak döküyor', 'kauçuk yaprak döküyor'],
  nedenler: ['Ortam değişikliği: yeni eve gelme, yer değiştirme, ışığın azalması (özellikle benjamin/ficus çok hassastır)', 'Soğuk ya da sıcak hava akımı, kapı-pencere önü, kalorifer yanı', 'Fazla ya da düzensiz sulama', 'Kışın ışığın azalması ile birlikte fazla sulama'],
  anlama: ['Bitki yeni geldiyse ya da yeri değiştiyse büyük olasılıkla alışma dökümüdür; yeni yapraklar sağlıklı çıkıyorsa endişe etmeyin', 'Toprak sürekli ıslaksa sulamaya bağlıdır'],
  yapin: ['Bitkiyi aydınlık, cereyansız bir yere koyup bir daha sık sık yerini değiştirmeyin', 'Toprağın üstü kurumadan sulamayın; kışın sulamayı azaltın', 'Bitki toparlanana kadar gübre vermeyin; yeni sürgün başlayınca besinle destekleyin'],
  urunler: ['yesilB', 'sivi', 'perlit'], kaynak: ['ucipm', 'illinois'] });

add({ key: 'cicek-acmama', baslik: 'Çiçek açmama',
  sorular: [...qx('çiçek açmıyor'), ...qx('bitkim çiçek açmıyor'), 'çiçek vermiyor', 'neden çiçeklenmiyor', 'çiçeklenme için ne yapmalı', 'çiçek açması için ne yapmalıyım', 'çiçek açtırmak için gübre', 'çiçeklenme için hangi gübre', 'yaprak veriyor çiçek vermiyor', 'tomurcuk yapmıyor', 'begonvil çiçek açmıyor', 'sardunya çiçek açmıyor', 'gül çiçek açmıyor', 'begonvil neden çiçek açmıyor'],
  nedenler: ['Yetersiz ışık: çiçekli bitkilerin çoğu bol ışık ister (en sık neden)', 'Fazla azotlu gübre: bitki bol yaprak yapar ama çiçek yapmaz', 'Yanlış zamanda budama: çiçek gözleri kesilmiş olabilir', 'Bitkinin henüz çiçek yaşına gelmemesi ya da dinlenme dönemi geçirmemesi', 'Saksının çok büyük olması ya da kök sorunu'],
  anlama: ['Bitki koyu yeşil, uzun ve sık yapraklıysa ışık azlığı veya fazla azot olasıdır', 'Son aylarda budandıysa çiçek gözleri gitmiş olabilir'],
  yapin: ['Bitkiyi daha aydınlık yere alın', 'Azotu yüksek genel gübreyi azaltın; çiçekli bitkiler için hazırlanmış besine geçin', 'Budamayı bitkinin çiçeklenmesi bittikten sonra yapın', 'Kökler sağlıklıysa saksıyı gereksiz büyütmeyin'],
  urunler: ['cicekB', 'petal', 'solucan'], kaynak: ['clemson'] });

add({ key: 'tomurcuk-dokumu', baslik: 'Tomurcukların ya da çiçeklerin açmadan dökülmesi',
  sorular: [...qx('tomurcuklar dökülüyor'), ...qx('çiçekler dökülüyor'), 'tomurcuklar açmadan düşüyor', 'tomurcuklar açmadan dökülüyor', 'çiçekler açmadan dökülüyor', 'tomurcuk kuruyup düşüyor', 'çiçek tomurcukları sararıyor'],
  nedenler: ['Ani ortam değişikliği (yer değiştirme, sıcaklık farkı, cereyan)', 'Düzensiz sulama: toprağın kuruması', 'Kuru hava ve aşırı sıcak', 'Yetersiz ışık'],
  anlama: ['Bitki tomurcukluyken taşındıysa ya da yeri değiştiyse neden büyük olasılıkla budur', 'Toprak sık sık kuruyorsa sulama düzensizdir'],
  yapin: ['Tomurcuklu bitkinin yerini değiştirmeyin', 'Toprağı eşit nemde tutun', 'Kalorifer ve cereyandan uzak, aydınlık bir yerde tutun'],
  urunler: ['boncuk', 'cicekB'], kaynak: ['ucipm', 'clemson'] });

add({ key: 'kok-curumesi', baslik: 'Kök çürümesi',
  sorular: [...qx('kökleri çürüdü'), ...qx('kök çürümesi'), 'gövde dibi çürüdü', 'gövdesi yumuşadı', 'toprak kötü kokuyor', 'saksı toprağı kokuyor', 'toprak sürekli ıslak', 'kökler kararmış', 'kök çürüklüğü nasıl anlaşılır', 'kök çürümesi tedavisi'],
  nedenler: ['Fazla sulama ve saksıda suyun birikmesi', 'Drenaj deliği olmayan saksı ya da tabakta bekleyen su', 'Sıkışmış, havasız, su tutan toprak', 'Bitkiye göre çok büyük saksı (fazla toprak uzun süre ıslak kalır)'],
  anlama: ['Bitki ıslak toprakta soluyor, alt yapraklar sararıyor', 'Saksıdan çıkarınca kökler kahverengi-siyah, yumuşak ve kötü kokuludur; sağlıklı kök beyaz ve diridir'],
  yapin: ['Bitkiyi saksıdan çıkarıp eski toprağı temizleyin', 'Çürük kökleri temiz makasla kesin', 'Delikli, köke uygun boyda saksıya, yeni ve süzek toprağa (perlit katılmış) dikin', 'Dikimden sonra az sulayın; toprağın üstü kurumadan tekrar sulamayın', 'Köklerin çoğu çürüdüyse sağlam bir dalı çelik olarak köklendirmeyi deneyin'],
  urunler: ['perlit', 'genelT', 'floristMantar', 'subonHijyen'], kaynak: ['ucipm', 'illinois'] });

add({ key: 'sinekcik', baslik: 'Toprakta ve saksı çevresinde küçük siyah sinekler',
  sorular: [...qx('toprakta sinek var'), ...qx('saksıda sinek var'), 'saksıda küçük sinekler', 'toprakta küçük siyah sinekler', 'saksı toprağında sinek', 'çiçeklerde küçük sinek', 'saksıdan sinek çıkıyor', 'toprak sineği', 'mantar sineği', 'saksı sineği nasıl yok edilir', 'saksıdaki sinekler için ilaç', 'toprakta kurtçuk var'],
  nedenler: ['Mantar sinekçiği: sürekli ıslak ve organik maddece zengin toprakta çoğalır; larvaları toprakta yaşar', 'Fazla sulama ve tabakta bekleyen su'],
  anlama: ['Sinekler toprak yüzünde dolaşır ve sulayınca uçuşur', 'Toprak yüzünde ince beyaz, ipliksi kurtçuklar (larva) görülebilir; yetişkin sinek bitkiye zarar vermez, larvalar fidelerde köke zarar verebilir'],
  yapin: ['Sulamayı azaltın: toprağın üst birkaç santimi iyice kurumadan sulamayın (larvalar kuru toprakta yaşayamaz)', 'Tabakta su bırakmayın; çürüyen yaprakları toprak üstünden toplayın', 'Toprak yüzüne bir kat perlit serin; üst katman çabuk kurur', 'Yetişkin sinekler için sarı yapışkan tuzak kullanılabilir', 'Sorun büyükse toprağı yenileyin'],
  urunler: ['floristSinek', 'perlit'], ilac: true, kaynak: ['gnat'] });

add({ key: 'yaprak-biti', baslik: 'Yaprak biti',
  sorular: [...qx('yaprak biti'), 'yaprak bitine ne iyi gelir', 'yaprak biti ilacı', 'yaprak biti için ilaç', 'yaprak biti için ne kullanılır', 'yaprak biti nasıl yok edilir', 'yapraklarda yeşil böcek', 'yapraklarda küçük böcekler var', 'filizlerde küçük böcekler', 'yapraklar yapış yapış', 'yapraklar yapışkan oldu', 'gülde yaprak biti', 'biberde yaprak biti', 'yapraklar kıvrılıyor böcek var'],
  nedenler: ['Yaprak biti: yeşil, siyah ya da gri renkli küçük yumuşak böcekler; genç sürgün ve yaprak altlarında koloni yapar', 'Fazla azotlu gübre yumuşak sürgünleri çoğaltıp biti çeker'],
  anlama: ['Sürgün uçlarında ve yaprak altlarında kümelenmiş küçük böcekler', 'Yapraklarda yapışkan bir tabaka (ballı madde) ve üzerinde kararma; yaprakların kıvrılması'],
  yapin: ['Az sayıdaysa sert su ile yıkayın ya da elle silin; ağır bulaşmış sürgünü kesin', 'Bitkiyi diğerlerinden ayırın', 'Bitkisel yağ esaslı (neem) sprey kullanın; kalıcı etkisi olmadığı için birkaç gün arayla tekrarlamak gerekir', 'Azotlu gübreyi azaltın', ILAC_NOT],
  urunler: ['neem'], ilac: true, kaynak: ['ucmg', 'umd'] });

add({ key: 'unlu-bit', baslik: 'Unlu bit (beyaz pamuk gibi böcek)',
  sorular: [...qx('unlu bit'), 'unlu bite ne iyi gelir', 'unlu bit ilacı', 'unlu bit nasıl yok edilir', 'yapraklarda beyaz pamuk', 'bitkide beyaz pamuk gibi şey var', 'yaprak dibinde beyaz pamuk', 'kaktüste beyaz pamuk', 'orkidede beyaz pamuk', 'beyaz tüylü böcek', 'yapraklarda beyaz pamuk gibi şeyler var', 'kabuklu bit', 'yapraklarda kahverengi kabuklar'],
  nedenler: ['Unlu bit: beyaz, mumsu-pamuksu örtülü böcekler; yaprak dipleri, gövde ve köklerde saklanır', 'Kabuklu bit: yaprak ve gövdeye yapışık kahverengi kabuklar', 'Yeni gelen bir bitkiyle eve taşınma'],
  anlama: ['Yaprak koltuklarında ve gövdede beyaz pamuk kümeleri', 'Yapraklarda yapışkanlık; bitkinin zayıflayıp sararması'],
  yapin: ['Bitkiyi hemen diğerlerinden ayırın', 'Az sayıdaysa alkole batırılmış pamukla tek tek silin', 'Bitkisel bazlı sprey uygulayın ve birkaç gün arayla tekrarlayın; tek uygulama yetmez', 'Çok yayılmışsa ağır bulaşmış kısımları kesin', ILAC_NOT],
  urunler: ['floristSinek', 'neem'], ilac: true, kaynak: ['ucmg', 'umd'] });

add({ key: 'kirmizi-orumcek', baslik: 'Kırmızı örümcek (akar)',
  sorular: [...qx('kırmızı örümcek'), 'kırmızı örümceğe ne iyi gelir', 'yapraklarda ince ağ var', 'bitkide örümcek ağı', 'yapraklarda küçük noktalar', 'yapraklar noktalı soluk', 'yapraklarda beyaz noktalar var', 'yaprak altında ağ', 'bitkide akar var'],
  nedenler: ['Kırmızı örümcek (akar): gözle zor görülen çok küçük zararlı; sıcak ve kuru havada hızla çoğalır'],
  anlama: ['Yapraklarda ince, soluk noktalanma; yaprak grimsi-bronz renk alır', 'Yaprak altlarında ve sürgün uçlarında ince ağ', 'Yaprağın altını beyaz kâğıda silkeleyince yürüyen minik noktalar'],
  yapin: ['Bitkiyi ayırın, yaprakları (özellikle altlarını) duşla iyice yıkayın', 'Havayı nemlendirin; kalorifer yanından uzaklaştırın', 'Birkaç gün arayla yıkamayı tekrarlayın', 'Akar için etiketinde akar yazan bir ürün gerekir; doğru ürün için bitkinin fotoğrafıyla müşteri hizmetlerimize danışın'],
  urunler: [], ilac: true, kaynak: ['ucmg'] });

add({ key: 'beyaz-sinek', baslik: 'Beyaz sinek',
  sorular: [...qx('beyaz sinek'), 'beyaz sineğe ne iyi gelir', 'beyaz sinek için ne kullanılır', 'yaprak altında beyaz sinekler', 'dokununca beyaz sinekler uçuşuyor', 'domateste beyaz sinek', 'beyaz küçük kelebekler'],
  nedenler: ['Beyaz sinek: yaprak altlarında yaşayan, dokununca uçuşan küçük beyaz böcekler; yumurta ve yavruları yaprağa yapışıktır'],
  anlama: ['Bitkiyi sallayınca beyaz bulut gibi uçuşma', 'Yapraklarda yapışkanlık ve sararma'],
  yapin: ['Yaprak altlarını düzenli kontrol edin, ağır bulaşmış yaprakları koparın', 'Sarı yapışkan tuzak yetişkinleri yakalar ama yaprak üstündeki yavruları etkilemez', 'Bitkisel yağ esaslı spreyi yaprak altlarına gelecek şekilde, birkaç gün arayla tekrarlayarak uygulayın', ILAC_NOT],
  urunler: ['neem'], ilac: true, kaynak: ['mobot', 'umd'] });

add({ key: 'kulleme', baslik: 'Külleme (yapraklarda un gibi beyaz tabaka)',
  sorular: [...qx('külleme'), ...qx('küllenme'), 'yapraklarda beyaz un gibi leke', 'yapraklarda beyaz toz var', 'yaprakların üstü beyaz oldu', 'yapraklarda beyaz lekeler', 'yapraklarda mantar var', 'kabakta külleme', 'gülde külleme', 'salatalıkta külleme', 'yapraklarda gri küf'],
  nedenler: ['Külleme: yaprak yüzeyinde un serpilmiş gibi beyaz tabaka yapan mantar hastalığı', 'Havasız, sık dikilmiş, nemli ortam'],
  anlama: ['Parmakla silinebilen beyaz-grimsi toz tabakası', 'Hastalık ilerledikçe yaprak sararıp kurur'],
  yapin: ['Hastalıklı yaprakları koparıp atın (komposta koymayın)', 'Bitkiler arasını açarak hava akışını artırın', 'Yaprakları ıslatmadan, toprağa sulayın', 'Mantar önleyici bitki spreyini ürün etiketine göre uygulayın'],
  urunler: ['floristMantar', 'subonHijyen'], ilac: true, kaynak: ['ucipm', 'ncsu'] });

add({ key: 'fide-devrilme', baslik: 'Fidelerin dipten çürüyüp devrilmesi (çökerten)',
  sorular: [...qx('fideler devriliyor'), ...qx('fideler çürüyor'), 'fideler dipten çürüyor', 'fideler yatıyor', 'fide gövdesi inceldi yattı', 'çimlenen tohumlar çürüyor', 'fideler ölüyor', 'çökerten hastalığı', 'fide devrilmesi'],
  nedenler: ['Çökerten: topraktan bulaşan mantarların fide gövdesini dipten çürütmesi', 'Kullanılmış ya da bahçe toprağı, temizlenmemiş viyoller', 'Fazla sulama, havasız ve serin ortam'],
  anlama: ['Fide gövdesi toprak hizasında incelir, suyla ıslanmış gibi kararır ve fide devrilir'],
  yapin: ['Devrilen fideleri hemen atın; hastalık yayılır', 'Yeni ekimi yeni, kullanılmamış fide toprağına ve temiz viyole yapın', 'Toprağı sırılsıklam tutmayın, mümkünse alttan sulayın', 'Fideleri havadar ve aydınlık yerde tutun'],
  urunler: ['fideT', 'perlit'], kaynak: ['ncsu'] });

add({ key: 'fide-uzama', baslik: 'Fidelerin incecik boylanması',
  sorular: [...qx('fideler boylanıyor'), ...qx('fideler uzadı'), 'fideler ince uzun oldu', 'fideler cılız', 'fide çok uzuyor', 'fideler ışığa doğru eğiliyor', 'fideler zayıf'],
  nedenler: ['Yetersiz ışık: fide ışığı aramak için boylanır (pencere önü bile çoğu zaman yetmez)', 'Ortamın fazla sıcak olması', 'Çok sık ekim'],
  anlama: ['Gövde ince ve uzun, yapraklar açık renkli; fideler pencereye doğru eğik'],
  yapin: ['Fideleri en aydınlık yere alın ya da bitki lambası kullanın', 'Sık çıkan fideleri seyreltin', 'Şaşırtırken (büyük viyole/saksıya alırken) gövdeyi biraz daha derine dikebilirsiniz', 'Çok cılız fideleri yeniden ekmek çoğu zaman daha iyi sonuç verir'],
  urunler: ['fideT', 'sivi'], kaynak: ['ncsu'] });

add({ key: 'salyangoz', baslik: 'Salyangoz ve sümüklü böcek',
  sorular: [...qx('salyangoz'), 'salyangoz nasıl uzaklaştırılır', 'sümüklü böcek', 'yapraklarda delikler var', 'yapraklar yenmiş', 'marul yaprakları delik delik', 'yapraklarda parlak iz', 'bahçede salyangoz çok', 'salyangoz kovucu', 'salyangozlar yaprakları yiyor', 'salyangozlar marulu yiyor', 'sümüklü böcekler yaprakları yiyor'],
  nedenler: ['Salyangoz ve sümüklü böcekler geceleri ve nemli havada beslenir; yapraklarda düzensiz delikler açar'],
  anlama: ['Yapraklarda düzensiz delikler ve yanında parlak, kurumuş sümük izi', 'Akşam karanlıkta ya da yağmur sonrası bakınca görülürler'],
  yapin: ['Akşam veya sabah erken saatte elle toplayın; düzenli toplamak sayıyı hızla düşürür', 'Ters çevrilmiş saksı ya da tahta parçası koyun, sabah altına saklananları toplayın', 'Bitki diplerindeki yabancı ot ve çürük yaprak gibi saklanma yerlerini azaltın', 'Sulamayı akşam yerine sabah yapın'],
  urunler: [], kaynak: ['usu'] });

add({ key: 'saksi-dar', baslik: 'Bitki büyümüyor, kökler saksıdan taşıyor',
  sorular: [...qx('bitkim büyümüyor'), 'kökler saksı deliğinden çıkıyor', 'kökler saksının dışına çıktı', 'saksı değişimi ne zaman yapılır', 'saksı değiştirmem gerekir mi', 'bitki gelişmiyor', 'bitkim cansız', 'toprak çok çabuk kuruyor', 'saksı küçük geldi', 'saksı nasıl değiştirilir', 'bitki yerinde sayıyor'],
  nedenler: ['Kökler saksıyı doldurmuş: toprak az kalır, su ve besin çabuk biter', 'Toprak yıllardır değişmemiş, besin tükenmiş ve sıkışmış', 'Yetersiz ışık ya da kış dinlenmesi'],
  anlama: ['Kökler drenaj deliğinden çıkıyor ya da toprak yüzüne taşıyor', 'Saksıdan çıkarınca kökler toprağın etrafında sarmal yapmış', 'Sulama suyu toprağa işlemeden hemen dipten akıyor'],
  yapin: ['İlkbaharda bir boy (çapı birkaç santim) büyük, delikli saksıya alın; çok büyük saksı kök çürümesine yol açar', 'Sarmal kökleri hafifçe açın, taze toprağa dikin', 'Saksı değişimi gerekmiyorsa üstteki birkaç santim toprağı kazıyıp yenisiyle değiştirin ve organik besinle destekleyin'],
  urunler: ['genelT', 'cicekT', 'solucan', 'sivi'], kaynak: ['ucipm', 'illinois'] });

add({ key: 'toprak-kuf', baslik: 'Toprak yüzünde beyaz tabaka (küf ya da tuz)',
  sorular: [...qx('toprakta beyaz küf'), 'toprak üstü beyaz oldu', 'toprak yüzünde beyaz tabaka', 'saksıda küf var', 'toprak küflendi', 'toprak üstünde beyaz küf', 'saksı kenarında beyaz kabuk', 'toprak üstünde beyaz kabuk', 'toprakta mantar çıktı'],
  nedenler: ['Pamuksu, tüylü beyaz tabaka: sürekli ıslak ve havasız toprakta oluşan küf', 'Sert, kabuk gibi beyaz tabaka: kireçli su ve fazla gübreden biriken tuz'],
  anlama: ['Tüylü ve yumuşaksa küftür; sert ve kabuksa tuz birikimidir'],
  yapin: ['Küfte: üstteki küflü toprağı kazıyıp atın, sulamayı azaltın, saksıyı havadar yere alın', 'Tuzda: kabuğu kazıyın, saksıdan bol suyu birkaç kez geçirip süzdürün ve bir süre gübre vermeyin', 'Sorun tekrar ediyorsa toprağı yenileyin, perlit katarak süzülmeyi artırın'],
  urunler: ['subonHijyen', 'perlit', 'genelT'], kaynak: ['illinois', 'ucipm'] });

add({ key: 'gunes-yanigi', baslik: 'Güneş yanığı (yapraklarda soluk, kuru lekeler)',
  sorular: [...qx('yapraklar yandı'), 'yapraklarda güneş yanığı', 'güneşte yapraklar yandı', 'yapraklarda beyaz kuru lekeler', 'balkona çıkardım yaprakları yandı', 'yapraklar soldu güneşten'],
  nedenler: ['Gölgeden ani olarak güçlü güneşe çıkarma', 'Cam arkasında öğle güneşi', 'Islak yapraklara güneş vurması'],
  anlama: ['Leke yalnız güneşe bakan yapraklarda, açık renkli, kuru ve kâğıt gibidir'],
  yapin: ['Bitkiyi öğle güneşinden koruyun; güneşe birkaç haftada yavaş yavaş alıştırın', 'Yanık yapraklar düzelmez; çok çirkin görünüyorsa kesebilirsiniz', 'Yaprakları güneş altında ıslatmayın'],
  urunler: ['boncuk'], kaynak: ['ucipm'] });

// ---------- Belirli bitkiler (cevap yalnız bitki adı soruda geçerse verilir) ----------
add({ key: 'orkide-cicek', bitki: 'Orkide', baslik: 'Orkide çiçek açmıyor',
  sorular: ['orkide çiçek açmıyor', 'orkidem çiçek açmıyor', 'orkide neden çiçek açmaz', 'orkide çiçek açması için ne yapmalı', 'orkide tekrar nasıl çiçek açar', 'orkide çiçekleri döküldü ne yapmalıyım', 'orkide dal vermiyor', 'orkide çiçek dalı kesilir mi', 'orkideyi çiçeklendirmek için', 'orkide çiçeği bitti'],
  nedenler: ['Yetersiz ışık (en sık neden): yapraklar koyu yeşilse ışık azdır', 'Gece-gündüz sıcaklık farkı olmaması: orkide (Phalaenopsis) yeni çiçek dalı için birkaç hafta serin gece ister', 'Düzensiz ya da hiç beslenmeme', 'Kök sorunu (fazla sulama)'],
  anlama: ['Yapraklar koyu yeşil ve bitki yıl boyu aynı sıcak odadaysa ışık ve serin gece eksiktir', 'Sağlıklı kök yeşil-gümüş renkli ve dolgundur'],
  yapin: ['Direkt öğle güneşi almayan, en aydınlık pencere önüne alın', 'Sonbaharda birkaç hafta gece sıcaklığının gündüzden belirgin serin olduğu bir yerde tutun (soğuk cereyan olmadan)', 'Büyüme döneminde orkideye özel besinle düzenli besleyin', 'Kökleri sağlıklı tutun: orkideye özel havadar ortam, ortam kurumaya yakınken sulama', 'Çiçekleri biten dal yeşilse bırakılabilir, kuruduysa dipten kesin'],
  urunler: ['orkideB', 'orkideS', 'orkideT'], kaynak: ['isu'] });

add({ key: 'orkide-yaprak', bitki: 'Orkide', baslik: 'Orkide yaprakları sararıyor, buruşuyor ya da kökleri çürüyor',
  sorular: ['orkide yaprakları sararıyor', 'orkide yaprağı sarardı', 'orkide yaprakları buruşuyor', 'orkide yaprakları yumuşadı', 'orkide yaprakları sarktı', 'orkide kökleri çürüdü', 'orkide kökleri kurudu', 'orkide kökleri sarardı', 'orkide kökleri dışarı çıkıyor', 'orkide hava kökleri', 'orkide yaprakları düşüyor', 'orkide ölüyor', 'orkide nasıl kurtarılır'],
  nedenler: ['Fazla sulama ve kök çürümesi: çürüyen kök su çekemez, yapraklar buruşup yumuşar', 'Uzun süre susuz kalma: kökler gümüşi-kuru, yapraklar buruşuk', 'En alttaki tek yaprağın yavaşça sararıp düşmesi doğaldır', 'Direkt güneş: yaprakta sarı-kahverengi yanık'],
  anlama: ['Kökleri kontrol edin: yeşil-gümüş ve dolgun kök sağlıklıdır; kahverengi, yumuşak, içi boşalmış kök çürümüştür', 'Saksıdan dışarı çıkan hava kökleri normaldir, kesmeyin'],
  yapin: ['Çürük kökleri temiz makasla kesin, orkideyi yeni orkide ortamına alın', 'Sulamayı ortam kurumaya yakınken yapın; saksı içinde su bırakmayın', 'Yaprak koltuğunda su bekletmeyin', 'Direkt öğle güneşinden uzak, aydınlık yerde tutun'],
  urunler: ['orkideT', 'floristMantar', 'orkideB'], kaynak: ['isu', 'ucipm'] });

add({ key: 'limon', bitki: 'Limon mandalina portakal narenciye', baslik: 'Limon (narenciye) yaprakları sararıyor ya da dökülüyor',
  sorular: ['limon yaprakları sararıyor', 'limon ağacı yaprak döküyor', 'limon yaprakları dökülüyor', 'limonun yaprakları sarardı', 'saksıda limon yaprak döküyor', 'limon ağacı kuruyor', 'limon çiçekleri dökülüyor', 'limon meyve tutmuyor', 'limon yaprakları kıvrılıyor', 'mandalina yaprakları sararıyor', 'portakal yaprakları sararıyor', 'limon ağacı neden sararır'],
  nedenler: ['Fazla sulama (özellikle kışın) ve kökte su birikmesi: en sık neden', 'Soğuk ya da cereyan; kışın içeri alınma, ışığın azalması', 'Besin eksikliği: yaşlı yapraklar sararıyorsa azot, yeni yapraklarda damarlar yeşil arası sarıysa demir (kireçli su/toprak)', 'İçeri alınınca bir miktar yaprak dökmesi alışma tepkisidir'],
  anlama: ['Toprak sürekli ıslaksa sulamadır', 'Sararmanın yaşlı mı yeni mi yaprakta olduğuna bakın'],
  yapin: ['Toprağın üst birkaç santimi kuruyunca sulayın; kışın sulamayı azaltın', 'Saksının deliği olsun, tabakta su bırakmayın; toprak ağır ise süzek toprakla yenileyin', 'Bitkiyi en aydınlık, cereyansız yere koyun', 'Büyüme döneminde organik besinle destekleyin; kireçli suyla sulanıyorsa demir sorununa karşı toprağı asidik yapıda tutun'],
  urunler: ['solucan', 'sivi', 'humix', 'perlit'], kaynak: ['narenciye'] });

add({ key: 'domates-cicek', bitki: 'Domates biber', baslik: 'Domates çiçekleri dökülüyor, meyve tutmuyor',
  sorular: ['domates çiçekleri dökülüyor', 'domates çiçek döküyor', 'domates meyve tutmuyor', 'domates çiçek açıyor meyve vermiyor', 'domateste çiçek dökümü', 'domates tutmuyor', 'domates çiçekleri kuruyor', 'biber çiçekleri dökülüyor', 'biber meyve tutmuyor'],
  nedenler: ['Sıcaklık: geceler çok serin ya da çok sıcak olduğunda, gündüz aşırı sıcakta çiçekler döllenmeden dökülür', 'Düzensiz sulama ve susuz kalma', 'Fazla azotlu gübre: bol yaprak, az meyve', 'Tozlaşmanın olmaması (rüzgârsız sera, balkon)'],
  anlama: ['Yaz ortasındaki sıcak dalgalarında ya da serin baharda görülüyorsa sıcaklıktır; hava düzelince yeni çiçekler tutar'],
  yapin: ['Toprağı eşit nemde tutun, malç ile nemi koruyun', 'Azotlu gübreyi azaltın', 'Balkon ve serada çiçek salkımlarını hafifçe sallayarak tozlaşmaya yardım edin', 'Aşırı sıcakta öğle saatlerinde gölgeleyin'],
  urunler: ['solucan', 'sivi', 'humix'], kaynak: ['domates'] });

add({ key: 'cicek-burnu', baslik: 'Çiçek burnu çürüklüğü (meyvenin dibinin kararması)',
  sorular: ['çiçek burnu çürüklüğü', 'domatesin altı kararıyor', 'domatesin dibi çürüyor', 'domates altı siyah', 'domates popo çürüklüğü', 'domates meyvesinin ucu kararıyor', 'biberin ucu çürüyor', 'biberin altı kararıyor', 'kabağın ucu çürüyor', 'domateste kalsiyum eksikliği'],
  nedenler: ['Meyvenin gelişirken yeterli kalsiyum alamaması; asıl neden çoğu zaman düzensiz sulamadır (toprak kuruyup ıslandıkça kalsiyum meyveye taşınamaz)', 'Fazla azotlu gübre durumu kötüleştirir', 'Saksıda yetiştirilen domates ve biberde sık görülür'],
  anlama: ['Meyvenin çiçek tarafındaki ucunda önce suyla ıslanmış gibi, sonra kahverengi-siyah, çökük leke'],
  yapin: ['Toprağı eşit nemde tutun; kuruyup sırılsıklam olmasına izin vermeyin', 'Toprağı malçlayın, saksıdaysa büyük saksı kullanın', 'Azotlu gübreyi azaltın', 'Lekeli meyveleri koparın; sulama düzene girince yeni meyveler sağlıklı gelir'],
  urunler: ['humix', 'solucan', 'boncuk'], kaynak: ['isu', 'domates'] });

add({ key: 'domates-catlama', bitki: 'Domates', baslik: 'Domates meyvesinde çatlama',
  sorular: ['domates çatlıyor', 'domatesler çatladı', 'domates meyvesi yarılıyor', 'domates kabuğu çatlıyor', 'domateste çatlama neden olur'],
  nedenler: ['Kuraklıktan sonra ani bol su ya da yağmur: meyve içten hızlı büyüyüp kabuğu çatlatır', 'Sıcak ve güneşli dönemler'],
  anlama: ['Meyvenin sap çevresinde halka ya da boyuna çatlaklar'],
  yapin: ['Kurak dönemde düzenli ve eşit sulayın; toprağı malçla nemli tutun', 'Olgunlaşmaya yakın meyveleri yağmur öncesi toplayın'],
  urunler: ['humix', 'solucan'], kaynak: ['domates'] });

add({ key: 'kaktus-curume', bitki: 'Kaktüs sukulent', baslik: 'Kaktüs ya da sukulent yumuşadı, çürüyor',
  sorular: ['kaktüs yumuşadı', 'kaktüs çürüyor', 'sukulent uzuyor', 'kaktüs çürüdü', 'kaktüsün dibi çürüyor', 'kaktüs kararıyor', 'kaktüs sarardı', 'kaktüs buruştu', 'kaktüs ölüyor', 'sukulent yaprakları yumuşadı', 'sukulent çürüyor', 'sukulent yaprakları dökülüyor', 'sukulent yaprakları şeffaf oldu', 'kaktüs ne sıklıkla sulanır', 'kaktüs ne zaman sulanır', 'kaktüs nasıl sulanır', 'sukulent ne zaman sulanır'],
  nedenler: ['Fazla sulama (en sık neden): toprak kurumadan sulanınca kök ve gövde dibi çürür', 'Su tutan normal toprak, deliksiz saksı', 'Kışın sulamanın azaltılmaması', 'Buruşma çoğunlukla uzun süre susuz kalmadandır'],
  anlama: ['Dipte yumuşak, kararmış ve kötü kokulu doku çürümedir', 'Gövde sert ama buruşuksa susuz kalmıştır'],
  yapin: ['Toprak tamamen kurumadan sulamayın; kışın çok seyrek sulayın', 'Çürük kısmı sağlam dokuya kadar kesin, kesik yeri birkaç gün kurutup kaktüs toprağına dikin', 'Delikli saksı ve hızlı süzülen kaktüs toprağı kullanın'],
  urunler: ['kaktusT', 'perlit', 'kaktusB'], kaynak: ['ucipm'] });

add({ key: 'kaktus-uzama', bitki: 'Kaktüs sukulent', baslik: 'Kaktüs ya da sukulent uzuyor, incelip eğiliyor',
  sorular: ['kaktüs uzuyor', 'kaktüs inceldi uzadı', 'kaktüs eğiliyor', 'kaktüs ışığa doğru eğildi', 'sukulent uzuyor', 'sukulent boylandı', 'sukulent rengi soldu'],
  nedenler: ['Yetersiz ışık: bitki ışığa uzanır, rengi solar'],
  anlama: ['Yeni büyüme ince, soluk ve pencereye doğru eğik'],
  yapin: ['En aydınlık, güneş alan yere alın (yanmaması için birkaç haftada alıştırın)', 'Uzamış kısım eski haline dönmez; isterseniz kesip köklendirebilirsiniz'],
  urunler: ['kaktusT', 'kaktusB'], kaynak: ['ucipm'] });

add({ key: 'monstera', bitki: 'Monstera deve tabanı', baslik: 'Monstera yaprakları sararıyor ya da yarılmıyor',
  sorular: ['monstera yaprakları sararıyor', 'monstera yaprağı sarardı', 'monstera yaprakları yarılmıyor', 'monstera yaprakları delikli çıkmıyor', 'monstera yaprak uçları kahverengi', 'monstera büyümüyor', 'deve tabanı yaprakları sararıyor', 'deve tabanı yaprakları yarılmıyor'],
  nedenler: ['Sararmada en sık neden fazla sulama ve su tutan topraktır', 'Yaprakların yarılmaması: bitkinin genç olması ya da yetersiz ışık', 'Uç kuruması: kuru hava, düzensiz sulama'],
  anlama: ['Toprak sürekli ıslaksa ve alt yapraklar sararıyorsa sulamadır', 'Yeni yapraklar küçük ve bütünse ışık azdır'],
  yapin: ['Toprağın üst kısmı kuruyunca sulayın; toprağa perlit katarak havalandırın', 'Direkt öğle güneşi almayan aydınlık bir yere alın', 'Büyüme döneminde yeşil yapraklı bitki besiniyle besleyin'],
  urunler: ['perlit', 'yesilB', 'genelT'], kaynak: ['ucipm', 'illinois'] });

add({ key: 'ficus', bitki: 'Benjamin ficus', baslik: 'Benjamin (ficus) yaprak döküyor',
  sorular: ['benjamin yaprak döküyor', 'benjamin yaprakları sararıyor', 'benjamin yaprakları dökülüyor', 'ficus yaprak döküyor', 'benjamin kurudu', 'benjamin ağacı yaprak döktü'],
  nedenler: ['Yer değişikliği ve ışığın azalması: benjamin ortam değişimine çok hassastır', 'Cereyan, kalorifer, soğuk pencere', 'Fazla ya da düzensiz sulama'],
  anlama: ['Bitki yeni geldiyse ya da yeri değiştiyse alışma dökümüdür; yeni yapraklar çıkıyorsa toparlanıyordur'],
  yapin: ['Aydınlık, cereyansız bir yere koyup yerini değiştirmeyin', 'Toprağın üstü kuruyunca sulayın', 'Toparlanana kadar gübre vermeyin, yeni sürgünde besinle destekleyin'],
  urunler: ['yesilB', 'perlit'], kaynak: ['ucipm'] });

add({ key: 'ortanca', bitki: 'Ortanca', baslik: 'Ortanca yaprakları sararıyor ya da çiçek açmıyor',
  sorular: ['ortanca yaprakları sararıyor', 'ortanca yaprakları sarardı', 'ortanca çiçek açmıyor', 'ortanca kuruyor', 'ortanca yaprakları kahverengi oldu', 'ortanca solmuş'],
  nedenler: ['Kireçli toprak ya da su: ortanca asidik toprak ister, aksi halde yeni yapraklarda damar arası sararma olur', 'Susuz kalma ya da öğle güneşi', 'Çiçek açmamada yanlış zamanda budama (çoğu ortanca bir önceki yılın dallarında çiçek açar) ve gölge'],
  anlama: ['Yeni yapraklarda damarlar yeşil arası sarıysa kireç/demir sorunudur'],
  yapin: ['Asit seven bitkiler için hazırlanmış toprağa dikin', 'Toprağı nemli tutun, öğleden sonra gölge sağlayın', 'Budamayı çiçeklenmeden hemen sonra yapın; sonbahar-kış budaması çiçek gözlerini götürebilir'],
  urunler: ['asitT', 'humix'], kaynak: ['csu', 'clemson'] });

// ---------- Ürünleri bağla (sitede olmayan ürün çıkarılır) ----------
const out = [], yok = [];
for (const s of S) {
  // Bitkiye özel kayıtlarda ilk kalıpların "neden / ne yapmalıyım" biçimleri de olsun
  if (s.bitki) s.sorular = [...new Set([...s.sorular, ...s.sorular.slice(0, 4).flatMap((q) => [q + ' neden', q + ' ne yapmalıyım', 'neden ' + q, q + ' nasıl düzelir'])])];
  const urunler = (s.urunler || []).map((k) => { const [slug, fayda] = U[k]; if (!bySlug.has(slug)) { yok.push(slug); return null; } return { slug, ad: bySlug.get(slug).n.trim(), fayda }; }).filter(Boolean);
  out.push({ ...s, urunler, kaynak: s.kaynak.map((k) => KAYNAK[k]) });
}
await writeFile('bilgi/sorunlar.json', JSON.stringify({ _aciklama: 'Ak Bilge bitki sorunları: olası nedenler, nasıl anlaşılır, ne yapılmalı, sitemizdeki faydalı ürünler. Kesin teşhis ve ilaç dozu yok. Kaynaklar müşteriye gösterilmez. Üretici: scripts/akbilge-sorun.mjs', guncelleme: new Date().toISOString().slice(0, 10), ilacNot: ILAC_NOT, sorunlar: out }, null, 1) + '\n');
console.log(`Bitki sorunları: ${out.length} belirti, ${out.reduce((a, s) => a + s.sorular.length, 0)} soru kalıbı, ${out.reduce((a, s) => a + s.urunler.length, 0)} ürün bağlantısı${yok.length ? '; sitede bulunamayan: ' + [...new Set(yok)].join(', ') : ''}`);
