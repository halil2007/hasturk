// Ücretsiz hesaplama araçları (/araclar ve /araclar/<slug>): sayfa metinleri, SSS ve hesaplayıcı formları. build.mjs sayfaları, üst menüdeki
// "Araçlar" listesini ve ana sayfa kartlarını buradan üretir; hesaplar tarayıcıda public/assets/tools.js ile yapılır (sunucu yok, giriş yok).
// Kural (panelle aynı): tüm tutarlar KDV DAHİL, yani cebinize giren / cebinizden çıkan haliyle girilir ve gösterilir; "KDV hariç kâr" gösterilmez.
// Stopaj satışın KDV hariç tutarı üzerinden hesaplanır (panel/public/profit.js ile aynı formül).
// Kanal oranları resmî liste DEĞİLDİR: panelin başlangıç ayarlarıdır (panel/src/db.js → DEFAULT_SETTINGS.commission, KDV dahil;
// costs_vat_incl: true). Yalnız sitede aktif görünen pazaryerleri listelenir (build.mjs süzer). Değiştirmek için iki yeri birlikte güncelleyin.
export const CHANNEL_RATES = { trendyol: 24, hepsiburada: 21.6, n11: 18, pttavm: 14.4, idefix: 18, pazarama: 18 };
export const WITHHOLDING = 1; // e-ticaret stopajı % (panel varsayılanı)

export const TOOL_GROUPS = [['genel', 'Genel hesaplayıcılar'], ['pazaryeri', 'Komisyon ve kâr']];

// Ortak cümleler
const RATES_NOTE = 'Kanal seçince gelen oranlar örnek / varsayılan değerlerdir (Hastürk CRM panelinin başlangıç ayarları, KDV dahil). Oranlar kategoriye, kampanyaya ve mağazaya göre değişir; kendi oranınızı girin.';
const VAT_INCL = 'Tüm tutarları KDV dahil, yani faturada yazan ve cebinizden çıkan haliyle girin.';

export const TOOLS = [
  {
    slug: 'kdv-hesaplama', group: 'genel', calc: 'kdv', icon: 'i-receipt', color: 'c-blue', name: 'KDV hesaplama', short: 'KDV dahil ↔ hariç, %1 · %10 · %20',
    card: 'KDV hariç fiyattan KDV dahil fiyatı, KDV dahil fiyattan KDV hariç tutarı ve KDV\'yi bulun.',
    title: 'KDV Hesaplama: KDV Dahil ve Hariç Fiyat (%1, %10, %20) | Hastürk CRM',
    desc: 'Ücretsiz KDV hesaplama: KDV hariç fiyattan KDV dahil fiyatı, KDV dahil fiyattan KDV hariç tutarı ve KDV\'yi saniyede bulun. %1, %10, %20 ve özel oran.',
    h1: ['KDV', 'Hesaplama'], lead: 'Fiyata KDV ekleyin ya da KDV dahil fiyatın içindeki KDV\'yi ayırın. %1, %10, %20 veya kendi oranınızla; yazdıkça hesaplanır.',
    formula: ['KDV dahil = KDV hariç × (1 + oran ÷ 100)', 'KDV hariç = KDV dahil ÷ (1 + oran ÷ 100)', 'KDV tutarı = KDV dahil − KDV hariç'],
    how: ['KDV, KDV hariç tutarın yüzdesidir. Bu yüzden KDV eklerken tutarı (1 + oran) ile çarparsınız, KDV dahil fiyattan geri giderken ise aynı sayıya bölersiniz.',
      'Sık yapılan hata, KDV dahil fiyattan KDV oranı kadar indirim yapmaktır: 1.200 ₺ × %20 = 240 ₺ çıkarılırsa KDV hariç tutar 960 ₺ gibi yanlış bulunur; doğrusu 1.200 ÷ 1,20 = 1.000 ₺\'dir.'],
    example: '1.000 ₺ + %20 KDV = 1.200 ₺. 1.200 ₺\'lik KDV dahil fiyatın içindeki KDV 200 ₺\'dir.',
    faq: [
      ['KDV dahil fiyattan KDV nasıl çıkarılır?', 'KDV dahil tutarı (1 + KDV oranı) ile bölün. %20 KDV\'de 1.200 ₺ ÷ 1,20 = 1.000 ₺ KDV hariç tutardır; aradaki 200 ₺ KDV\'dir.'],
      ['KDV dahil fiyattan neden %20 düşülmez?', 'Çünkü KDV, KDV hariç tutarın %20\'sidir, KDV dahil tutarın değil. 1.200 ₺\'nin %20\'si 240 ₺ eder ve KDV hariç tutarı 960 ₺ gibi hatalı gösterir.'],
      ['Hangi ürüne hangi KDV oranı uygulanır?', 'Genel oran %20\'dir. Bazı temel gıda ürünleri gibi mallarda %1 ya da %10 gibi indirimli oranlar uygulanır. Ürününüzün oranını alış faturanızdan ya da mali müşavirinizden teyit edin.'],
      ['Pazaryerinde satış fiyatı KDV dahil mi yazılır?', 'Evet. Pazaryerlerinde müşterinin gördüğü fiyat KDV dahildir. Komisyon, kargo ve hizmet bedeli faturaları da size KDV dahil kesilir; kâr hesabında bu tutarları olduğu gibi kullanmak en sade yöntemdir.'],
    ],
    related: ['satis-fiyati-hesaplama', 'e-ticaret-stopaj-hesaplama', 'yuzde-hesaplama', 'pazaryeri-komisyon-hesaplama'],
  },
  {
    slug: 'desi-hesaplama', group: 'genel', calc: 'desi', icon: 'i-ruler', color: 'c-orange', name: 'Desi hesaplama', short: 'Koli ölçüsünden desi, desi mi kg mı?',
    card: 'En × boy × yükseklik ile desiyi bulun; birden fazla koli ekleyin, ücretin desiden mi kilogramdan mı alınacağını görün.',
    title: 'Desi Hesaplama: Kargo Desi ve Ücrete Esas Ağırlık | Hastürk CRM',
    desc: 'Kargo desi hesaplama: en × boy × yükseklik ÷ 3000 ile desiyi bulun, birden fazla koli ekleyin; ücrete esas olanın desi mi kilogram mı olduğunu görün.',
    h1: ['Desi', 'Hesaplama'], lead: 'Koli ölçülerini ve ağırlığını girin; desiyi ve kargo ücretinin desiden mi kilogramdan mı hesaplanacağını görün. Birden fazla koli ekleyebilirsiniz.',
    formula: ['Desi = En (cm) × Boy (cm) × Yükseklik (cm) ÷ 3000', 'Ücrete esas = desi ile gerçek ağırlıktan (kg) büyük olanı', 'Birden fazla koli: her kolinin ücrete esas değeri × adet, toplanır'],
    how: ['Kargo firmaları gönderiyi hem tartar hem ölçer. Hafif ama büyük bir koli araçta çok yer kapladığı için hacmine (desi), küçük ama ağır bir koli ağırlığına göre ücretlendirilir.',
      'Yurt içi kargo firmalarının çoğu 3000 bölenini kullanır; bazı firmalar ve yurt dışı gönderiler 4000 ya da 5000 kullanabilir. Firmalar küsuratı genellikle bir üst desiye yuvarlar; anlaşmanızdaki kuralı kontrol edin.'],
    example: '30 × 20 × 15 cm ve 2 kg\'lık koli: 9.000 ÷ 3000 = 3 desi. Desi ağırlıktan büyük olduğu için ücret 3 desiden hesaplanır.',
    faq: [
      ['Desi nedir?', 'Desi, gönderinin kapladığı hacmin ağırlık karşılığıdır. Kargo ücreti, desi ile gerçek ağırlıktan büyük olana göre belirlenir.'],
      ['Desi hesaplamada neden 3000\'e bölünür?', 'Yurt içi kargo firmalarının çoğu 3000 cm³ hacmi 1 desi kabul eder. Bölen firmaya ve gönderi türüne göre değişebilir; araçta 4000 ve 5000 de seçilebilir.'],
      ['Birden fazla koli gönderirken desi nasıl hesaplanır?', 'Her koli ayrı ölçülür; her birinin desi ve ağırlığından büyük olanı alınıp toplanır. Bazı firmalar toplam desi ile toplam ağırlığı karşılaştırır; araç iki toplamı da gösterir.'],
      ['Desiyi nasıl düşürebilirim?', 'Ürüne uygun boyutta koli kullanın ve boş alanı azaltın. Koli ölçüsündeki 1–2 cm\'lik fark bile desiyi bir üst kademeye taşıyabilir.'],
    ],
    related: ['satis-fiyati-hesaplama', 'pazaryeri-komisyon-hesaplama', 'kdv-hesaplama', 'kar-karsilastirma'],
  },
  {
    slug: 'yuzde-hesaplama', group: 'genel', calc: 'yuzde', icon: 'i-percent', color: 'c-teal', name: 'Yüzde hesaplama', short: 'Yüzdesi, artış oranı, indirimli fiyat',
    card: 'Bir sayının yüzdesini, yüzde kaç olduğunu, artış / azalış oranını ve indirimli fiyatı hesaplayın.',
    title: 'Yüzde Hesaplama: Yüzdesi, Artış Oranı, İndirimli Fiyat | Hastürk CRM',
    desc: 'Ücretsiz yüzde hesaplama: bir sayının yüzdesini, bir sayının diğerinin yüzde kaçı olduğunu, artış / azalış oranını ve indirimli fiyatı tek sayfada hesaplayın.',
    h1: ['Yüzde', 'Hesaplama'], lead: 'Dört sık kullanılan yüzde hesabı tek sayfada: bir sayının yüzdesi, yüzde kaçı olduğu, iki değer arasındaki değişim ve indirimli fiyat.',
    formula: ['X\'in %Y\'si = X × Y ÷ 100', 'A, B\'nin yüzde kaçı = A ÷ B × 100', 'Değişim oranı = (Yeni − Eski) ÷ Eski × 100', 'İndirimli fiyat = Fiyat × (1 − İndirim ÷ 100)'],
    how: ['Yüzde, bir sayının 100 parça içindeki payıdır. Değişim oranında bölen her zaman eski (başlangıç) değerdir; bu yüzden %20 artışın ardından gelen %20 indirim başlangıca geri getirmez.'],
    example: '250\'nin %18\'i 45\'tir. 200 ₺\'den 250 ₺\'ye çıkan fiyat %25 artmıştır. 1.000 ₺\'lik ürün %15 indirimle 850 ₺ olur.',
    faq: [
      ['Yüzde artış nasıl hesaplanır?', 'Yeni değerden eski değeri çıkarın, sonucu eski değere bölüp 100 ile çarpın. 200 ₺\'den 250 ₺\'ye çıkan fiyat (250 − 200) ÷ 200 × 100 = %25 artmıştır.'],
      ['%20 zam ve ardından %20 indirim eski fiyatı verir mi?', 'Hayır. 100 ₺\'ye %20 zam 120 ₺ eder; 120 ₺\'ye %20 indirim 96 ₺\'dir. İndirim daha büyük tutardan yapıldığı için fiyat başlangıcın altına düşer.'],
      ['İndirimli fiyattan eski fiyat nasıl bulunur?', 'İndirimli fiyatı (1 − indirim oranı) ile bölün. %15 indirimle 850 ₺\'ye satılan ürünün eski fiyatı 850 ÷ 0,85 = 1.000 ₺\'dir.'],
    ],
    related: ['kdv-hesaplama', 'indirim-kar-hesaplama', 'satis-fiyati-hesaplama', 'kar-karsilastirma'],
  },
  {
    slug: 'satis-fiyati-hesaplama', group: 'genel', calc: 'satis', icon: 'i-tag', color: 'c-purple', name: 'Satış fiyatı belirleme', short: 'Maliyet + kesintiler + hedef kâr',
    card: 'Alış, komisyon, kargo, hizmet bedeli ve stopajla hedef kârınıza göre satış fiyatını bulun; ya da fiyattan kârı görün.',
    title: 'Satış Fiyatı Hesaplama: Komisyon ve Kargo Dahil Fiyat | Hastürk CRM',
    desc: 'Alış maliyeti, pazaryeri komisyonu, kargo, hizmet bedeli ve stopajla hedef kâr marjınıza göre satış fiyatını bulun; ya da fiyatınızdan net kârınızı görün.',
    h1: ['Satış Fiyatı', 'Belirleme'], lead: 'Maliyetinizi ve kesintileri girin, hedef kârınıza göre satış fiyatını bulun. Ters yönde de çalışır: fiyatınızı girin, birim kârınızı ve marjınızı görün.',
    formula: ['Satış fiyatı = (Alış + Kargo + Hizmet bedeli + Hedef kâr ₺) ÷ (1 − Komisyon % − Stopaj % ÷ (1 + KDV %) − Hedef marj %)', 'Net kâr = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj − Alış', 'Kâr marjı = Net kâr ÷ Satış × 100'],
    how: [VAT_INCL + ' Komisyon satış fiyatının yüzdesi olduğu için fiyat yükseldikçe komisyon da artar; bu yüzden maliyetin üzerine kâr eklemek yetmez, yüzdelik kesintiler paydadan düşülür.',
      'Stopaj, satışın KDV hariç tutarı üzerinden kesildiği için ürününüzün KDV oranıyla ayarlanır. Hedefi yüzde (satış fiyatına göre marj) ya da tutar (ürün başı ₺) olarak verebilirsiniz.'],
    example: 'Alış 450 ₺, komisyon %18, kargo 65 ₺, hizmet bedeli 10 ₺, stopaj %1 (KDV %20) ve %20 marj hedefi: (450 + 65 + 10) ÷ (1 − 0,18 − 0,0083 − 0,20) = 858,31 ₺.',
    faq: [
      ['Kâr marjı ile kâr oranı (markup) arasındaki fark nedir?', 'Kâr marjı kârın satış fiyatına, markup ise alış maliyetine oranıdır. 450 ₺\'ye alıp 858,31 ₺\'ye sattığınız üründe 171,66 ₺ kâr, %20 marj ve yaklaşık %38 markup demektir.'],
      ['Hesap neden KDV dahil tutarlarla yapılıyor?', 'Satış fiyatınız ile komisyon, kargo ve hizmet bedeli faturaları KDV dahil tutarlardır; hakedişiniz de bunlardan oluşur. Araç cebinize giren ve çıkan tutarları gösterir. Dönem sonu ödeyeceğiniz KDV, alış ve gider faturalarınıza göre değişir; bunun için mali müşavirinize danışın.'],
      ['Komisyon oranımı nereden öğrenirim?', 'Pazaryerinin satıcı panelinde ürün ya da kategori bazında görünür. Oranlar kategoriye ve kampanyaya göre değişir; araca kendi oranınızı girin.'],
      ['"Bu hedefe ulaşılamaz" ne demek?', 'Komisyon, stopaj ve hedef marjın toplamı %100\'e ulaşırsa hiçbir fiyat hedefi karşılamaz: fiyat arttıkça kesinti de aynı oranda artar. Hedef marjı düşürün ya da kesintileri gözden geçirin.'],
    ],
    related: ['pazaryeri-komisyon-hesaplama', 'kar-karsilastirma', 'indirim-kar-hesaplama', 'kdv-hesaplama'],
  },
  {
    slug: 'e-ticaret-stopaj-hesaplama', group: 'genel', calc: 'stopaj', icon: 'i-bank', color: 'c-pink', name: 'E-ticaret stopajı', short: '%1 stopaj kesintisi, KDV hariç matrah',
    card: 'Pazaryerinin hakedişinizden kestiği %1 e-ticaret stopajını KDV dahil satış tutarından hesaplayın.',
    title: 'E-Ticaret Stopajı Hesaplama (%1): Pazaryeri Kesintisi | Hastürk CRM',
    desc: 'Pazaryeri satışlarınızdan kesilen %1 e-ticaret stopajını hesaplayın: KDV dahil satış tutarından KDV hariç matrahı ve stopaj kesintisini saniyeler içinde bulun.',
    h1: ['E-Ticaret Stopajı', 'Hesaplama'], lead: 'Pazaryeri satışlarınızdan kesilen stopajı bulun: KDV dahil satış tutarını girin, KDV hariç matrahı ve hakedişinizden düşülecek tutarı görün.',
    formula: ['Matrah (KDV hariç) = KDV dahil satış ÷ (1 + KDV % ÷ 100)', 'Stopaj = Matrah × Stopaj % ÷ 100'],
    how: ['2025 başından beri pazaryerleri, satıcılara yaptıkları ödemelerden satışın KDV hariç tutarı üzerinden e-ticaret stopajı (%1) keser ve vergi dairesine yatırır. Oran değişirse araçta değiştirebilirsiniz.',
      'Kesilen tutar kaybolmaz; yıllık gelir ya da kurumlar vergisi beyanınızda ödenecek vergiden mahsup edilir. Yine de hakedişinizden nakit olarak düştüğü için kâr ve nakit hesabında ayrı satır olarak görülmelidir.'],
    example: '%20 KDV\'li 1.200 ₺\'lik satış: matrah 1.200 ÷ 1,20 = 1.000 ₺, stopaj 1.000 × %1 = 10 ₺.',
    faq: [
      ['E-ticaret stopajını kim keser?', 'Pazaryeri (aracı hizmet sağlayıcı) keser: size ödeyeceği hakedişten düşer ve sizin adınıza vergi dairesine yatırır. Ayrıca bir ödeme yapmanız gerekmez.'],
      ['Stopaj KDV dahil tutar üzerinden mi hesaplanır?', 'Hayır, satışın KDV hariç tutarı üzerinden hesaplanır. %20 KDV\'li 1.200 ₺\'lik satışta stopaj 12 ₺ değil, 1.000 ₺ × %1 = 10 ₺\'dir.'],
      ['Kesilen stopaj geri alınır mı?', 'Yıllık beyannamede hesaplanan gelir ya da kurumlar vergisinden mahsup edilir. Mahsup ve iade süreçleri için mali müşavirinize danışın.'],
    ],
    related: ['pazaryeri-komisyon-hesaplama', 'kdv-hesaplama', 'satis-fiyati-hesaplama', 'kar-karsilastirma'],
  },
  {
    slug: 'pazaryeri-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', icon: 'i-store', color: 'c-blue', name: 'Pazaryeri komisyon', short: 'Kesintiler sonrası net hakediş',
    card: 'Komisyon, kargo, hizmet bedeli ve stopaj sonrası elinize geçecek tutarı ve kârınızı hesaplayın.',
    title: 'Pazaryeri Komisyon Hesaplama: Net Hakediş ve Kâr | Hastürk CRM',
    desc: 'Pazaryeri komisyon hesaplama: komisyon, kargo, hizmet bedeli ve %1 stopaj sonrası hesabınıza geçecek net tutarı ve ürün başı kârınızı hesaplayın. Ücretsiz.',
    h1: ['Pazaryeri Komisyon', 'Hesaplama'], lead: 'Satış fiyatınızdan komisyon, kargo, hizmet bedeli ve stopaj düşülünce hesabınıza ne geçeceğini görün. Alış maliyetinizi de girerseniz ürün başı kârınızı hesaplar.',
    formula: ['Komisyon = Satış × Komisyon % ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × Stopaj %', 'Hakediş = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj', 'Kâr = Hakediş − Alış maliyeti'],
    how: [VAT_INCL + ' Pazaryerleri komisyon oranını çoğunlukla KDV hariç ilan eder, faturayı ise KDV ekleyerek keser: %20 komisyon %20 KDV ile satışın %24\'üne denk gelir. Oranı KDV hariç girdiyseniz "KDV hariç" kutusunu işaretleyin.', RATES_NOTE],
    example: '1.000 ₺\'lik satış, %24 komisyon (KDV dahil), 65 ₺ kargo, 10 ₺ hizmet bedeli, %1 stopaj: 1.000 − 240 − 65 − 10 − 8,33 = 676,67 ₺ hakediş. Alış 450 ₺ ise kâr 226,67 ₺.',
    faq: [
      ['Pazaryeri komisyonu KDV dahil mi?', 'Pazaryerleri oranı genellikle KDV hariç ilan eder, faturayı KDV ekleyerek keser. %20 komisyon, %20 KDV ile satış fiyatınızın %24\'üdür. Araçta oranı KDV hariç girdiyseniz kutuyu işaretleyin; hesap KDV dahil tutarla yapılır.'],
      ['Hakediş nedir?', 'Hakediş, pazaryerinin satış tutarından komisyon, kargo, hizmet bedeli ve stopaj gibi kesintileri düştükten sonra size ödediği tutardır. Ödeme günü pazaryerine ve vadenize göre değişir.'],
      ['Komisyon oranları neden kanala göre değişiyor?', 'Her pazaryeri kategori, marka ve kampanya bazında ayrı oran belirler. Bu sayfadaki kanal oranları resmî liste değil, örnek başlangıç değerleridir; satıcı panelinizdeki oranı girin.'],
      ['Reklam ve iade kesintileri hesaba katılıyor mu?', 'Hayır. Araç sipariş başı kesintileri hesaplar. Reklam, ceza ve iade gibi dönemsel kesintileri Hastürk CRM\'in gelir ve gider ekranı dönem bazında ayrıca gösterir.'],
    ],
    related: ['kar-karsilastirma', 'trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'satis-fiyati-hesaplama'],
  },
  {
    slug: 'kar-karsilastirma', group: 'pazaryeri', calc: 'karsilastir', icon: 'i-scale', color: 'c-green', name: 'Kâr karşılaştırma', short: 'Aynı ürün, kanal kanal net kâr', isNew: true,
    card: 'Aynı ürünün pazaryerlerindeki net kârını yan yana görün; komisyon, kargo ve hizmet bedelini kanal başına değiştirin.',
    title: 'Pazaryeri Kâr Karşılaştırma: Hangi Kanal Daha Kârlı? | Hastürk CRM',
    desc: 'Aynı ürünün Trendyol, Hepsiburada, N11, PttAVM, idefix ve Pazarama\'daki net kârını yan yana görün. Komisyon, kargo ve hizmet bedelini kanal başına değiştirin.',
    h1: ['Pazaryeri Kâr', 'Karşılaştırma'], lead: 'Ürününüzün satış fiyatını ve alış maliyetini bir kez girin; her pazaryerinde ne kadar kâr bıraktığını yan yana görün. Oranları ve tutarları kanal kanal değiştirebilirsiniz.',
    formula: ['Kanal kârı = Satış − Satış × Komisyon % − Kargo − Hizmet bedeli − Stopaj − Alış', 'Stopaj = Satış ÷ (1 + KDV %) × Stopaj %', 'Marj = Kâr ÷ Satış × 100'],
    how: [VAT_INCL + ' Her kanal kartındaki komisyon, kargo ve hizmet bedeli ayrı ayrı değiştirilebilir; kartın işaretini kaldırırsanız o kanal karşılaştırmadan çıkar.', RATES_NOTE],
    example: '1.000 ₺\'lik, alışı 450 ₺ olan üründe 65 ₺ kargo ve 10 ₺ hizmet bedeliyle: %24 komisyonda kâr 226,67 ₺, %18 komisyonda 286,67 ₺ olur.',
    faq: [
      ['Aynı ürünü her kanalda aynı fiyata mı satmalıyım?', 'Zorunlu değil. Komisyon ve kargo farkları yüzünden aynı fiyat her kanalda farklı kâr bırakır. Bu araçla kanal başına kârı görüp fiyatınızı buna göre belirleyebilirsiniz.'],
      ['Kanal oranları neden örnek?', 'Pazaryerleri oranları kategoriye, kampanyaya ve mağazaya göre belirler. Buradaki değerler Hastürk CRM panelinin başlangıç ayarlarıdır; satıcı panelinizdeki oranları girin.'],
      ['Reklam ve iade maliyetleri hesaba katılıyor mu?', 'Hayır. Karşılaştırma sipariş başı komisyon, kargo, hizmet bedeli ve stopajla yapılır. Reklam, ceza ve iade gibi dönemsel kesintileri Hastürk CRM\'in gelir ve gider ekranı ayrıca gösterir.'],
    ],
    related: ['pazaryeri-komisyon-hesaplama', 'satis-fiyati-hesaplama', 'indirim-kar-hesaplama', 'trendyol-komisyon-hesaplama'],
  },
  {
    slug: 'trendyol-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', preset: 'trendyol', brand: ['T', '#f27a1a'], name: 'Trendyol komisyon', short: 'Trendyol satışında net kâr',
    card: 'Trendyol satışınızda komisyon, kargo, hizmet bedeli ve stopaj sonrası hakedişinizi ve kârınızı görün.',
    title: 'Trendyol Komisyon Hesaplama: Net Kâr ve Hakediş | Hastürk CRM',
    desc: 'Trendyol komisyon hesaplama: komisyon, kargo, platform hizmet bedeli ve %1 stopaj sonrası hesabınıza geçecek tutarı ve net kârınızı hesaplayın. Ücretsiz.',
    h1: ['Trendyol Komisyon', 'Hesaplama'], lead: 'Trendyol\'daki satış fiyatınızdan komisyon, kargo, hizmet bedeli ve stopaj düşülünce hesabınıza ne geçeceğini ve ürün başı kârınızı görün.',
    formula: ['Komisyon = Satış × Komisyon % ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × %1', 'Hakediş = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj', 'Kâr = Hakediş − Alış maliyeti'],
    how: [VAT_INCL + ' Trendyol komisyon oranını satıcı panelinde KDV hariç gösterir; fatura KDV eklenerek kesilir. Oranı panelde gördüğünüz gibi girip "KDV hariç" kutusunu işaretleyebilirsiniz.', 'Gelen %24 oranı örnektir (%20 + KDV; Hastürk CRM panelinin başlangıç ayarı). Trendyol komisyonu kategoriye ve kampanyaya göre değişir; kendi oranınızı girin.'],
    example: '1.000 ₺\'lik satış, %20 + KDV (%24) komisyon, 65 ₺ kargo, 10 ₺ hizmet bedeli: 1.000 − 240 − 65 − 10 − 8,33 = 676,67 ₺ hakediş.',
    faq: [
      ['Trendyol komisyon oranı ne kadar?', 'Trendyol komisyon oranları kategoriye göre değişir ve satıcı panelinizde ürün bazında görünür. Araçtaki %24 (KDV dahil; %20 + KDV) yalnızca örnektir; kendi oranınızı girin.'],
      ['Trendyol hakedişimden hangi kesintiler düşülür?', 'Sipariş başına komisyon, kargo (Trendyol\'un anlaşmalı kargosuyla gönderiyorsanız), hizmet bedeli ve e-ticaret stopajı. Reklam ya da ceza gibi kesintiler varsa ayrıca kesilir.'],
      ['Trendyol stopajı nasıl hesaplanır?', 'Satışın KDV hariç tutarının %1\'i olarak: %20 KDV\'li 1.200 ₺\'lik satışta 1.000 × %1 = 10 ₺.'],
      ['Her Trendyol siparişinin gerçek kârını otomatik görebilir miyim?', 'Evet. Hastürk CRM, Trendyol\'un kestiği komisyon, kargo ve hizmet bedeli faturalarını ve hakedişleri çeker; her siparişin net kârını panelde gösterir.'],
    ],
    related: ['hepsiburada-komisyon-hesaplama', 'kar-karsilastirma', 'pazaryeri-komisyon-hesaplama', 'e-ticaret-stopaj-hesaplama'],
  },
  {
    slug: 'hepsiburada-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', preset: 'hepsiburada', brand: ['hb', '#ff6000'], name: 'Hepsiburada komisyon', short: 'Hepsiburada satışında net kâr',
    card: 'Hepsiburada satışınızda komisyon, kargo, hizmet bedeli ve stopaj sonrası hakedişinizi ve kârınızı görün.',
    title: 'Hepsiburada Komisyon Hesaplama: Net Kâr ve Hakediş | Hastürk CRM',
    desc: 'Hepsiburada komisyon hesaplama: komisyon, kargo, hizmet bedeli ve %1 stopaj sonrası hesabınıza geçecek tutarı ve net kârınızı hesaplayın. Ücretsiz, kayıtsız.',
    h1: ['Hepsiburada Komisyon', 'Hesaplama'], lead: 'Hepsiburada\'daki satış fiyatınızdan komisyon, kargo, hizmet bedeli ve stopaj düşülünce hesabınıza ne geçeceğini ve ürün başı kârınızı görün.',
    formula: ['Komisyon = Satış × Komisyon % ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × %1', 'Hakediş = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj', 'Kâr = Hakediş − Alış maliyeti'],
    how: [VAT_INCL + ' Hepsiburada komisyonu KDV hariç bildirir; size kesilen tutar KDV dahildir (ör. %18 + KDV = %21,6). Oranı KDV hariç girdiyseniz "KDV hariç" kutusunu işaretleyin.', 'Gelen %21,6 oranı örnektir (%18 + KDV; Hastürk CRM panelinin başlangıç ayarı). Hepsiburada komisyonu kategoriye ve kampanyaya göre değişir; kendi oranınızı girin.'],
    example: '1.000 ₺\'lik satış, %18 + KDV (%21,6) komisyon, 65 ₺ kargo, 10 ₺ hizmet bedeli: 1.000 − 216 − 65 − 10 − 8,33 = 700,67 ₺ hakediş.',
    faq: [
      ['Hepsiburada komisyon oranı ne kadar?', 'Hepsiburada komisyon oranları kategoriye göre değişir ve satıcı panelinizde görünür. Araçtaki %21,6 (KDV dahil; %18 + KDV) yalnızca örnektir; kendi oranınızı girin.'],
      ['Hepsiburada komisyonu KDV dahil mi?', 'Hepsiburada oranı ve satırdaki komisyon tutarını KDV hariç bildirir; kesilen fatura KDV dahildir. Kâr hesabında KDV dahil tutarı kullanın: araçta "KDV hariç" kutusu bunu sizin yerinize yapar.'],
      ['Hepsiburada stopajı nasıl hesaplanır?', 'Satışın KDV hariç tutarının %1\'i olarak: %20 KDV\'li 1.200 ₺\'lik satışta 1.000 × %1 = 10 ₺.'],
      ['Her Hepsiburada siparişinin gerçek kârını otomatik görebilir miyim?', 'Evet. Hastürk CRM, Hepsiburada\'nın kestiği komisyon, kargo ve hizmet bedeli kayıtlarını ve hakedişleri çeker; her siparişin net kârını panelde gösterir.'],
    ],
    related: ['trendyol-komisyon-hesaplama', 'kar-karsilastirma', 'pazaryeri-komisyon-hesaplama', 'e-ticaret-stopaj-hesaplama'],
  },
  {
    slug: 'indirim-kar-hesaplama', group: 'pazaryeri', calc: 'indirim', icon: 'i-discount', color: 'c-orange', name: 'İndirim sonrası kâr', short: 'Kampanyada kâr ve başabaş indirim',
    card: 'İndirim ya da kampanya sonrası kârınızı, zarar etmeden yapabileceğiniz en yüksek indirimi ve gereken satış artışını görün.',
    title: 'İndirim Sonrası Kâr Hesaplama: Kampanyada Ne Kalır? | Hastürk CRM',
    desc: 'İndirim ya da kampanya sonrası birim kârınızı, zarar etmeden yapabileceğiniz en yüksek indirimi ve aynı toplam kâr için gereken satış artışını hesaplayın.',
    h1: ['İndirim Sonrası', 'Kâr Hesaplama'], lead: 'Kampanyaya girmeden önce hesaplayın: indirimli fiyatta ürün başı ne kalır, en fazla ne kadar indirim yapılabilir ve aynı toplam kâr için kaç kat daha fazla satmanız gerekir?',
    formula: ['İndirimli fiyat = Fiyat × (1 − İndirim % ÷ 100)', 'Başabaş fiyat = (Alış + Kargo + Hizmet bedeli) ÷ (1 − Komisyon % − Stopaj % ÷ (1 + KDV %))', 'En fazla indirim = 1 − Başabaş fiyat ÷ Fiyat', 'Gereken satış artışı = Önceki kâr ÷ İndirimli kâr − 1'],
    how: [VAT_INCL + ' İndirim fiyattan düşer ama alış maliyeti, kargo ve hizmet bedeli aynı kalır; bu yüzden %10 indirim kârı genellikle %10\'dan çok daha fazla azaltır.', 'Pazaryeri indirimin bir kısmını karşılıyorsa, yalnız sizin karşıladığınız indirim oranını girin.'],
    example: '1.000 ₺\'lik, alışı 450 ₺ olan ürün (%18 komisyon, 65 ₺ kargo, 10 ₺ hizmet bedeli): kâr 286,67 ₺. %10 indirimde 205,50 ₺\'ye düşer; aynı toplam kâr için yaklaşık %39,5 daha fazla satış gerekir.',
    faq: [
      ['%10 indirim kârımı neden %10\'dan fazla düşürüyor?', 'İndirim satış fiyatından düşer ama alış maliyeti ve kargo gibi sabit giderler aynı kalır. 286,67 ₺ kâr bırakan 1.000 ₺\'lik üründe %10 indirim kârı 205,50 ₺\'ye, yani yaklaşık %28 düşürür.'],
      ['Başabaş indirimi nedir?', 'Ürün başı kârın sıfıra indiği indirim oranıdır. Bu orandan fazla indirim yaparsanız her satışta zarar edersiniz.'],
      ['Pazaryeri indirimin bir kısmını karşılarsa nasıl girerim?', 'Yalnız sizin karşıladığınız indirim oranını girin. Örneğin %20\'lik kampanyanın %5\'ini pazaryeri karşılıyorsa indirim olarak %15 girin.'],
    ],
    related: ['satis-fiyati-hesaplama', 'yuzde-hesaplama', 'kar-karsilastirma', 'pazaryeri-komisyon-hesaplama'],
  },
];

// ---------- form parçaları ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ico = (id) => `<svg><use href="#${id}"/></svg>`;
export const trNum = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
// Sayı alanı: metin kutusu + birim (₺, %, cm, kg); "1.234,56" ve "1234.56" ikisi de kabul edilir (tools.js)
const fld = (name, label, val, unit = '₺', hint = '') => `<label class="cf"><span class="cf-l">${label}</span><span class="cf-in"><input class="in" name="${name}" type="text" inputmode="decimal" autocomplete="off" value="${val === '' ? '' : esc(trNum(val))}"${val === '' ? ' placeholder="isteğe bağlı"' : ''}><i>${unit}</i></span>${hint ? `<small>${hint}</small>` : ''}</label>`;
const seg = (name, opts, sel, label) => `<div class="seg" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === sel ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
const vatChips = (name = 'vat', sel = '20', other = true) => `<div class="cf"><span class="cf-l">KDV oranı</span><div class="seg seg-sm" role="radiogroup" aria-label="KDV oranı">${['1', '10', '20'].map((r) => `<label><input type="radio" name="${name}" value="${r}"${r === sel ? ' checked' : ''}><span>%${r}</span></label>`).join('')}${other ? `<label><input type="radio" name="${name}" value="x"><span>Diğer</span></label>` : ''}</div>${other ? `<span class="cf-in cf-x" hidden><input class="in" name="${name}X" type="text" inputmode="decimal" autocomplete="off" aria-label="Diğer KDV oranı" placeholder="ör. 8"><i>%</i></span>` : ''}</div>`;
const out = (k, l, cls = '') => `<div class="co${cls ? ' ' + cls : ''}"><span>${l}</span><b data-o="${k}">–</b></div>`;
const big = (label, k = 'big', sub = 'bigSub') => `<div class="cr-big"><span data-o="bigLabel">${label}</span><strong data-o="${k}" aria-live="polite">–</strong><small data-o="${sub}"></small></div>`;
const res = (inner, note = '') => `<div class="calc-out">${inner}${note ? `<p class="calc-note">${note}</p>` : ''}</div>`;
const form = (calc, inner, attrs = '') => `<form class="calc" data-calc="${calc}"${attrs} novalidate autocomplete="off">${inner}</form>`;
const costs = (o = {}) => `<div class="cf-grid">${fld('com', 'Komisyon oranı', o.com ?? 18, '%')}${fld('ship', 'Kargo (sipariş başı)', o.ship ?? 65)}${fld('fee', 'Hizmet bedeli', o.fee ?? 10)}${fld('wh', 'Stopaj', WITHHOLDING, '%', 'KDV hariç satıştan')}</div>`;
const NOTE_INCL = 'Tüm tutarlar KDV dahildir (cebinizden çıkan haliyle).';

// Kanal listesi: [slug, ad, oran] (build.mjs aktif kanallarla süzer)
export function calcForm(t, channels) {
  const chSel = (sel) => `<label class="cf"><span class="cf-l">Pazaryeri</span><select class="in" name="ch">${channels.map(([s, n, r]) => `<option value="${s}" data-rate="${r}"${s === sel ? ' selected' : ''}>${esc(n)} (örnek %${trNum(r)})</option>`).join('')}<option value="">Diğer / kendi oranım</option></select></label>`;
  switch (t.calc) {
    case 'kdv':
      return form('kdv', `<div class="calc-in">
  ${seg('mode', [['add', 'KDV ekle (hariç → dahil)'], ['remove', 'KDV ayır (dahil → hariç)']], 'add', 'Hesap yönü')}
  ${fld('amount', '<span data-o="amountLabel">KDV hariç tutar</span>', 1000)}
  ${vatChips('vat', '20')}
</div>${res(`${big('KDV dahil fiyat')}${out('net', 'KDV hariç')}${out('vat', 'KDV tutarı')}${out('gross', 'KDV dahil', 'strong')}`)}`);
    case 'desi':
      return form('desi', `<div class="calc-in">
  <label class="cf"><span class="cf-l">Kargo firmasının böleni</span><select class="in" name="div"><option value="3000" selected>3000 (yurt içi kargoların çoğu)</option><option value="4000">4000</option><option value="5000">5000 (bazı yurt dışı / ekspres)</option></select></label>
  <div class="parcels" data-rows>
    <div class="parcel" data-row><div class="parcel-h"><b>Koli <span data-n>1</span></b><button type="button" class="parcel-x" data-del aria-label="Koliyi kaldır" hidden>${ico('i-x')}</button></div>
      <div class="cf-grid g5">${fld('en', 'En', 30, 'cm')}${fld('boy', 'Boy', 20, 'cm')}${fld('yuk', 'Yükseklik', 15, 'cm')}${fld('kg', 'Ağırlık', 2, 'kg')}${fld('adet', 'Adet', 1, 'ad')}</div>
      <div class="parcel-r"><span>Desi: <b data-r="desi">–</b></span><span>Ücrete esas: <b data-r="charge">–</b></span></div></div>
  </div>
  <button type="button" class="btn btn-line btn-sm" data-add>+ Koli ekle</button>
</div>${res(`${big('Ücrete esas toplam')}${out('desi', 'Toplam desi')}${out('kg', 'Toplam ağırlık')}${out('up', 'Yukarı yuvarlanmış (koli başı)')}`, 'Firmalar küsuratı çoğunlukla bir üst desiye yuvarlar; anlaşmanızı kontrol edin.')}`);
    case 'yuzde': {
      const box = (title, inner, outs) => `<div class="pbox"><b class="pbox-h">${title}</b><div class="cf-grid">${inner}</div><div class="pbox-o">${outs}</div></div>`;
      return form('yuzde', `<div class="pboxes">
  ${box('Bir sayının yüzdesi', `${fld('p1x', 'Sayı', 250, '')}${fld('p1y', 'Yüzde', 18, '%')}`, `<span data-o="p1t">250 × %18 =</span><strong data-o="p1">–</strong>`)}
  ${box('Yüzde kaçı?', `${fld('p2a', 'Sayı', 45, '')}${fld('p2b', 'Toplam', 250, '')}`, `<span data-o="p2t">45 ÷ 250 =</span><strong data-o="p2">–</strong>`)}
  ${box('Artış / azalış oranı', `${fld('p3a', 'Eski değer', 200, '')}${fld('p3b', 'Yeni değer', 250, '')}`, `<span data-o="p3t">Değişim</span><strong data-o="p3">–</strong><small data-o="p3d"></small>`)}
  ${box('İndirimli fiyat', `${fld('p4p', 'Fiyat', 1000)}${fld('p4d', 'İndirim', 15, '%')}`, `<span>İndirimli fiyat</span><strong data-o="p4">–</strong><small data-o="p4s"></small>`)}
</div>`, ' data-wide');
    }
    case 'satis':
      return form('satis', `<div class="calc-in">
  ${seg('mode', [['price', 'Hedef kârdan fiyat bul'], ['profit', 'Fiyattan kâr bul']], 'price', 'Hesap yönü')}
  <div class="cf-grid">${fld('cost', 'Alış maliyeti', 450)}<div data-mode="profit" hidden>${fld('price', 'Satış fiyatı', 1000)}</div>
  <div class="cf" data-mode="price"><span class="cf-l">Hedef</span><span class="cf-in cf-pair"><input class="in" name="target" type="text" inputmode="decimal" autocomplete="off" value="20" aria-label="Hedef kâr"><select class="in" name="tt" aria-label="Hedef türü"><option value="m" selected>% marj</option><option value="t">₺ kâr</option></select></span></div></div>
  ${costs()}
  ${vatChips('vat', '20', false)}
</div>${res(`${big('Önerilen satış fiyatı')}${out('com', 'Komisyon')}${out('ship', 'Kargo + hizmet bedeli')}${out('wh', 'Stopaj')}${out('payout', 'Hakediş (elinize geçen)')}${out('profit', 'Net kâr', 'strong')}${out('margin', 'Kâr marjı (satışa göre)')}${out('markup', 'Kâr oranı (alışa göre)')}${out('be', 'Başabaş fiyat (kâr = 0)')}`, NOTE_INCL)}`);
    case 'stopaj':
      return form('stopaj', `<div class="calc-in">
  ${fld('amount', 'Satış tutarı (KDV dahil)', 1200, '₺', 'Tek sipariş ya da aylık toplam satış')}
  ${vatChips('vat', '20')}
  ${fld('wh', 'Stopaj oranı', WITHHOLDING, '%')}
</div>${res(`${big('Stopaj kesintisi')}${out('base', 'Matrah (KDV hariç satış)')}${out('vatAmt', 'Satıştaki KDV')}${out('after', 'Stopaj sonrası (diğer kesintiler hariç)', 'strong')}`, 'Kesilen stopaj yıllık gelir / kurumlar vergisinden mahsup edilir.')}`);
    case 'komisyon': {
      const r = t.preset ? channels.find(([s]) => s === t.preset) : channels[0];
      return form('komisyon', `<div class="calc-in">
  ${chSel(r ? r[0] : '')}
  <div class="cf-grid">${fld('price', 'Satış fiyatı', 1000)}${fld('com', 'Komisyon oranı', r ? r[2] : 18, '%')}</div>
  <label class="cb"><input type="checkbox" name="exVat"><span>Girdiğim oran KDV hariç (üzerine %20 KDV eklensin)</span></label>
  <div class="cf-grid">${fld('ship', 'Kargo (sipariş başı)', 65)}${fld('fee', 'Hizmet bedeli', 10)}${fld('wh', 'Stopaj', WITHHOLDING, '%', 'KDV hariç satıştan')}${fld('cost', 'Alış maliyeti', 450)}</div>
  ${vatChips('vat', '20', false)}
  <p class="calc-hint">${ico('i-eye')}Oranlar kategoriye göre değişir; kendi oranınızı girin. Kanal oranları örnek / varsayılan değerlerdir.</p>
</div>${res(`${big('Hakediş (elinize geçen)')}${out('com', 'Komisyon')}${out('ship', 'Kargo')}${out('fee', 'Hizmet bedeli')}${out('wh', 'Stopaj')}${out('cut', 'Toplam kesinti')}${out('profit', 'Net kâr', 'strong')}${out('margin', 'Kâr marjı')}`, NOTE_INCL)}`, t.preset ? ` data-preset="${t.preset}"` : '');
    }
    case 'karsilastir':
      return form('karsilastir', `<div class="calc-in calc-top">
  <div class="cf-grid g4">${fld('price', 'Satış fiyatı', 1000)}${fld('cost', 'Alış maliyeti', 450)}${fld('wh', 'Stopaj', WITHHOLDING, '%')}<label class="cf"><span class="cf-l">Ürün KDV oranı</span><select class="in" name="vat"><option value="1">%1</option><option value="10">%10</option><option value="20" selected>%20</option></select></label></div>
  <p class="calc-hint">${ico('i-eye')}Kanal oranları örnek / varsayılan değerlerdir (KDV dahil); oranlar kategoriye göre değişir, kendi oranınızı girin.</p>
</div>
<div class="cmp-sum" aria-live="polite"><span data-o="bigLabel">En kârlı kanal</span><strong data-o="big">–</strong><small data-o="bigSub"></small></div>
<div class="cmp">${channels.map(([s, n, rt]) => `<div class="cmp-c" data-ch="${s}"><label class="cmp-h"><input type="checkbox" name="on" checked><b>${esc(n)}</b><em class="pill" data-best hidden>En kârlı</em></label>
  <div class="cf-grid g3">${fld('com', 'Komisyon', rt, '%')}${fld('ship', 'Kargo', 65)}${fld('fee', 'Hizmet b.', 10)}</div>
  <div class="cmp-r"><span>Hakediş <b data-r="payout">–</b></span><span>Kâr <b data-r="profit">–</b></span><span>Marj <b data-r="margin">–</b></span></div></div>`).join('')}</div>
<p class="calc-note">${NOTE_INCL}</p>`, ' data-wide');
    case 'indirim':
      return form('indirim', `<div class="calc-in">
  <div class="cf-grid">${fld('price', 'Normal satış fiyatı', 1000)}${fld('disc', 'İndirim oranı', 10, '%')}${fld('cost', 'Alış maliyeti', 450)}</div>
  ${costs()}
  ${vatChips('vat', '20', false)}
</div>${res(`${big('İndirimli fiyatta kâr')}${out('newPrice', 'İndirimli fiyat')}${out('before', 'İndirimsiz kâr')}${out('after', 'İndirimli kâr', 'strong')}${out('drop', 'Kârdaki değişim')}${out('be', 'Başabaş fiyat')}${out('maxDisc', 'En fazla indirim (kâr = 0)')}${out('need', 'Aynı toplam kâr için gereken satış artışı')}`, NOTE_INCL)}`);
  }
  throw new Error(`Araç: "${t.calc}" hesaplayıcısı yok`);
}

// Ana sayfadaki küçük net kâr hesaplayıcısı (stopaj %1, ürün KDV %20 kabul edilir)
export const miniProfit = () => form('mini', `<div class="calc-in">
  <div class="cf-grid">${fld('price', 'Satış fiyatı', 1000)}${fld('cost', 'Alış maliyeti', 450)}${fld('com', 'Komisyon oranı', 18, '%')}${fld('ship', 'Kargo + hizmet bedeli', 75)}</div>
</div>${res(`${big('Ürün başı net kâr')}${out('payout', 'Hakediş (elinize geçen)')}${out('margin', 'Kâr marjı')}`, 'KDV dahil tutarlar; stopaj %1 (KDV %20 kabul edilerek) düşülür.')}`);
