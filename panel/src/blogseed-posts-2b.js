// İkinci parti hazır blog yazıları (bkz. blogseed.js, biçim blogseed-posts.js ile aynı)
export const POSTS_2B = [
  {
    slug: "pazaryeri-satis-fiyati-nasil-belirlenir",
    title: "Pazaryerinde Satış Fiyatı Nasıl Belirlenir? Kâr Marjı ve Fiyat Hesaplama Rehberi (2026)",
    seo_title: "Satış Fiyatı Nasıl Belirlenir? Kâr Marjı Hesabı (2026)",
    seo_desc: "Pazaryerinde satış fiyatı nasıl hesaplanır? Komisyon, kargo ve KDV dahil formül, başabaş fiyatı ve örnek tablolar. Ücretsiz hesaplama aracını deneyin.",
    summary: "Pazaryerinde doğru fiyat, maliyete yüzde eklenerek değil, tüm kesintilerden ve hedef kârdan geriye doğru hesaplanarak bulunur. Satış fiyatı formülünü, kâr marjı ile kâr oranı farkını, başabaş fiyatını ve fiyatlandırma stratejilerini örnek tablolarla anlatıyoruz.",
    tags: ["Fiyatlandırma","Kâr Marjı","Pazaryeri","Kâr Hesaplama"],
    cover: "satis-fiyati-kapak.jpg",
    body: `Pazaryerinde doğru satış fiyatı, alış maliyetinin üzerine bir yüzde eklenerek değil, **geriye doğru** hesaplanarak bulunur: önce alış maliyetini ve sipariş başına sabit giderleri (kargo, hizmet bedeli) toplarsınız, sonra bu toplamı komisyonun ve hedeflediğiniz kâr marjının kalan payına bölersiniz. Böylece fiyat, her kesinti düşüldükten sonra elinizde gerçekten hedeflediğiniz kâr kalacak şekilde belirlenir.

Bu yazıda fiyatı oluşturan kalemleri tek tek açıklıyor, sık yapılan "maliyetin üstüne %50 koydum" hatasının neden zarar ettirdiğini rakamlarla gösteriyor, adım adım bir satış fiyatı hesabı yapıyor ve fiyatlandırma stratejilerini karşılaştırıyoruz. Hesabı kendi rakamlarınızla yapmak isterseniz [satış fiyatı hesaplama aracımız](/araclar/satis-fiyati-hesaplama) ücretsizdir ve kayıt gerektirmez.

## Satış fiyatını oluşturan kalemler

Bir pazaryeri satışında müşterinin ödediği tutar sizin cebinize olduğu gibi girmez. Fiyat belirlemeden önce bir siparişte hangi kalemlerin ödendiğini netleştirmeniz gerekir:

| Kalem | Nasıl değişir? | Fiyat hesabındaki yeri |
| --- | --- | --- |
| Alış maliyeti | Ürün başına sabit | Toplanan sabit gider |
| Pazaryeri komisyonu | Satış fiyatıyla orantılı | Paydadan düşülen oran |
| Kargo ücreti | Paketin desisine göre, sipariş başına | Toplanan sabit gider |
| Platform hizmet bedeli | Sipariş başına sabit | Toplanan sabit gider |
| E-ticaret stopajı (%1) | KDV hariç satış tutarıyla orantılı | Kâr değil nakit kalemi |
| Reklam, iade payı, ambalaj | Ürüne ve döneme göre | Sipariş başına ortalama olarak eklenir |
| KDV | Satışta tahsil edilir, giderlerdeki KDV indirilir | Hesap KDV hariç tutarlarla yapılır |

İki ayrım hesabın doğru çıkması için kritiktir:

- **Orantılı ve sabit giderler ayrı ele alınır.** Komisyon fiyat yükseldikçe artar; kargo ve hizmet bedeli ise sipariş başına neredeyse sabittir. Bu yüzden düşük fiyatlı ürünlerde sabit giderler kârın büyük kısmını alır. Ayrıntılı örneği [Trendyol komisyon ve net kâr rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) bulabilirsiniz.
- **Stopaj gider değildir, peşin ödenen vergidir.** Pazaryerleri 1 Ocak 2025'ten beri satıcıya yaptıkları ödemelerden KDV hariç satış tutarının %1'i oranında gelir / kurumlar vergisi kesintisi yapar. Bu tutar hakedişinizi azaltır ama yıllık beyanınızda ödenecek vergiden mahsup edilir. Fiyat hesabında kâr kalemi olarak değil, nakit akışı kalemi olarak düşünün. Tek başına hesaplamak için [stopaj hesaplama aracını](/araclar/e-ticaret-stopaj-hesaplama) kullanabilirsiniz.

### Komisyon neden 1,2 ile çarpılır?

Komisyon bir hizmet bedelidir ve pazaryeri komisyon faturasını KDV ekleyerek keser. Panelde %20 olarak gördüğünüz komisyon KDV hariç bir oransa, cebinizden çıkan tutar satış fiyatının %24'üdür (%20 × 1,20). Bu KDV'yi beyannamenizde indirebildiğiniz için kârınızı KDV hariç hesaplarken komisyon yine %20 olarak düşer. Aşağıdaki formüller ürünün ve hizmetlerin %20 KDV'li olduğu durum için kurulmuştur; farklı KDV oranlı ürünlerde hesap aracı oranı kendisi ayarlar.

## Kâr marjı ve kâr oranı (markup) aynı şey değildir

Fiyatlandırmadaki en yaygın karışıklık, iki farklı yüzdenin birbirinin yerine kullanılmasıdır:

- **Kâr oranı (markup):** Kârın maliyete oranıdır. 400 TL'ye aldığınız ürünü 600 TL'ye satarsanız kâr oranınız %50'dir.
- **Kâr marjı:** Kârın satış fiyatına oranıdır. Aynı örnekte (kesintiler hiç yokmuş gibi) marjınız 200 ÷ 600 = %33,3'tür.

Pazaryerinde ikisi arasındaki fark çok daha büyüktür, çünkü satış fiyatı ile maliyet arasındaki farkın önemli kısmını komisyon ve kargo alır. Bir ürüne "maliyetin üstüne %50" diye fiyat koymak, kesintiler hesaba katılmadığında zararına satışa dönüşebilir.

### "Maliyetin üstüne %50 koydum" hatası

Aşağıdaki örnekte tüm oranlar ve tutarlar **varsayımsaldır**. Ürün %20 KDV'li, alış maliyeti 400 TL (KDV dahil), komisyon %20 + KDV, kargo 80 TL (KDV dahil), platform hizmet bedeli 13 TL (KDV dahil). Satıcı maliyetin üstüne %50 ekleyip ürünü 600 TL'ye satıyor:

| Kalem (KDV hariç) | Tutar |
| --- | --- |
| Satış (600 ÷ 1,20) | 500,00 TL |
| Komisyon (%20) | −120,00 TL |
| Kargo (80 ÷ 1,20) | −66,67 TL |
| Hizmet bedeli (13 ÷ 1,20) | −10,83 TL |
| Alış maliyeti (400 ÷ 1,20) | −333,33 TL |
| **Kâr** | **−30,83 TL** |

Satıcı "her satıştan 200 TL kazanıyorum" diye düşünürken aslında her satışta yaklaşık 31 TL zarar ediyor. Ciro arttıkça zarar da büyüyor. Bu tablo, fiyatı neden maliyetten ileriye değil hedef kârdan geriye doğru hesaplamanız gerektiğini özetliyor.

## Satış fiyatı formülü

Hedef kârınızı KDV hariç satış tutarına oranla, yani **kâr marjı** olarak belirlediğinizde satış fiyatı (KDV dahil) şöyle bulunur:

**Satış fiyatı = (Alış maliyeti + Kargo + Hizmet bedeli) ÷ (1 − 1,2 × Komisyon oranı − Hedef marj)**

![Satış fiyatı formülü: sabit giderler bölü komisyon ve hedef marjdan kalan pay](https://hasturkcrm.com/img/blog/satis-fiyati-formulu.jpg "Örnek: 493 TL sabit gider, %20 komisyon + KDV ve %20 hedef marjla satış fiyatı")

Formüldeki tüm tutarlar KDV dahildir; komisyon oranı panelde gördüğünüz KDV hariç orandır. Paydadaki 1,2 × komisyon, KDV'siyle birlikte komisyonun fiyat içindeki payıdır. Hedef marj ise kârınızın KDV hariç satış tutarına oranıdır.

### Adım adım örnek

Aynı ürün için hedefimiz, KDV hariç satış tutarının %20'si kadar kâr bırakmak olsun.

1. **Sabit giderleri toplayın:** 400 (alış) + 80 (kargo) + 13 (hizmet bedeli) = 493 TL.
2. **Paydayı bulun:** 1 − (1,2 × 0,20) − 0,20 = 1 − 0,24 − 0,20 = 0,56.
3. **Bölün:** 493 ÷ 0,56 = 880,36 TL.
4. **Yuvarlayın:** Fiyatı 879,90 TL olarak belirleyelim.

Sağlamasını KDV hariç tutarlarla yapalım:

| Kalem (KDV hariç) | Tutar |
| --- | --- |
| Satış (879,90 ÷ 1,20) | 733,25 TL |
| Komisyon (%20) | −175,98 TL |
| Kargo | −66,67 TL |
| Hizmet bedeli | −10,83 TL |
| Alış maliyeti | −333,33 TL |
| **Kâr** | **146,44 TL** |

146,44 ÷ 733,25 = **%20,0**. Hedeflenen marj tutuyor. Bu siparişte hakedişiniz 879,90 − 211,18 (KDV'li komisyon) − 80 − 13 − 7,33 (stopaj) = **568,39 TL** olur; kârın bir kısmı KDV farkı olarak devlete, stopaj kadarı da yıl sonunda vergiden mahsup edilmek üzere vergi dairesine gider.

### Hedef marja göre gereken fiyat

Aynı varsayımlarla farklı hedef marjlar için gereken fiyat:

| Hedef marj | Gereken satış fiyatı (KDV dahil) | Sipariş başına kâr (KDV hariç) |
| --- | --- | --- |
| %0 (başabaş) | 648,68 TL | 0,00 TL |
| %10 | 746,97 TL | 62,25 TL |
| %20 | 880,36 TL | 146,73 TL |
| %30 | 1.071,74 TL | 267,93 TL |

Tablodaki ilk satır özellikle önemlidir: **648,68 TL bu ürünün başabaş fiyatıdır.** Bunun altındaki her satış, kesintiler ve maliyet düşüldükten sonra zarar demektir. Kampanyaya katılırken, buybox için fiyat kırarken ya da otomatik fiyat kuralı tanımlarken alt sınırınız bu fiyatın üstünde olmalıdır.

## Reklam, iade ve diğer giderleri fiyata katmak

Yukarıdaki hesap yalnız her siparişte kesin olarak oluşan giderleri içerir. Gerçek kârınızı bulmak için üç gideri daha sipariş başına ortalama olarak eklemelisiniz:

- **Reklam:** Son 30 günde bir ürün için harcadığınız reklam bütçesini o ürünün sipariş sayısına bölün. Örneğin 3.000 TL reklamla 100 sipariş aldıysanız sipariş başına reklam maliyeti 30 TL'dir; bu tutarı formüldeki sabit giderlere ekleyin.
- **İade payı:** İade edilen siparişte komisyon genellikle geri döner ama gidiş ve dönüş kargosu çoğunlukla satıcıda kalır. İade oranınız %10 ise, her 10 siparişten birinin kargo maliyetini diğer 9 siparişin taşıdığını hesaba katın.
- **Ambalaj ve işçilik:** Koli, dolgu malzemesi, etiket ve paketleme süresi küçük görünür ama sipariş başına sabit bir maliyettir.

Kira, personel ve yazılım gibi genel giderler ürün fiyatına tek tek dağıtılmaz; bunlar için hedef marjınızı yeterince yüksek tutarak aylık toplam kârın bu giderleri karşıladığından emin olursunuz.

## Kanal bazında fiyat: her pazaryerinde aynı fiyat mı?

Aynı ürün farklı kanallarda farklı kesintilerle satılır. Komisyon oranı, hizmet bedeli ve kargo tarifesi değiştiği için aynı hedef marjı tutturmak üzere gereken fiyat da değişir. Varsayımsal iki kanal düşünelim:

| | Kanal A | Kanal B |
| --- | --- | --- |
| Komisyon (KDV hariç) | %20 | %15 |
| Kargo (KDV dahil) | 80 TL | 70 TL |
| Hizmet bedeli (KDV dahil) | 13 TL | Yok |
| %20 marj için gereken fiyat | 880,36 TL | 758,06 TL |

Fark %16'yı aşıyor. Bu noktada iki yaklaşım vardır:

- **Her kanalda kendi hesabına göre fiyat:** Her kanalda aynı marjı korursunuz. Dezavantajı, müşterinin fiyat farkını görmesi ve kanallar arasında fiyat takibinin zorlaşmasıdır.
- **Tek fiyat:** Yönetimi kolaydır ama düşük kesintili kanalda fazla, yüksek kesintili kanalda az kâr edersiniz. Yüksek kesintili kanalda başabaş fiyatın altına düşmediğinizi mutlaka kontrol edin.

Pratikte birçok satıcı, kanallar arasında sabit bir oran farkı belirleyip (ör. bir kanalda %5 yukarıda) fiyatları bu kurala göre yönetir. Aynı ürünün kanal kanal kârını görmek için [pazaryeri kâr karşılaştırma aracını](/araclar/kar-karsilastirma) kullanabilirsiniz.

## İndirim ve kampanya fiyatı

Kampanyaya katılmadan önce indirimli fiyatla kârınızı yeniden hesaplayın. Yukarıdaki 879,90 TL'lik ürünü %10 indirimle 791,91 TL'ye sattığınızda komisyon da düşer, ama kargo, hizmet bedeli ve alış maliyeti değişmez. Aynı hesapla kârınız 146,44 TL'den **90,71 TL'ye** iner. Yani %10'luk indirim kârı yaklaşık **%38 azaltır**. Bu kaybı telafi etmek için satış adedinin belirgin biçimde artması gerekir. Kampanya öncesi hesap için [indirim sonrası kâr hesaplama aracı](/araclar/indirim-kar-hesaplama) zarar etmeden yapabileceğiniz en yüksek indirimi gösterir.

İndirim yaparken yasal bir kuralı da unutmayın: Fiyat Etiketi Yönetmeliği'nde 2022'de yapılan değişiklikle, indirimli satışta indirimden önceki fiyat olarak **indirimden önceki 30 gün içinde uygulanan en düşük fiyat** esas alınır. Fiyatı önce yükseltip ardından "indirim" göstermek bu kurala aykırıdır ve ispat yükü satıcıdadır. Kampanya fiyatlarınızı planlarken fiyat geçmişinizi kayıt altında tutun.

## Fiyatlandırma stratejileri: hangisi ne zaman?

Formül size alt sınırı ve hedef fiyatı verir; ama son fiyatı belirlerken pazarı da hesaba katmanız gerekir. En yaygın yaklaşımlar:

- **Maliyet bazlı fiyat:** Yukarıdaki formülle hedef marjdan fiyat bulunur. Rekabetin az olduğu, kendi markanızla sattığınız ürünlerde ana yöntemdir.
- **Rekabet bazlı fiyat:** Aynı ürünü başka satıcılar da satıyorsa fiyat büyük ölçüde pazarda belirlenir. Burada formül size "bu fiyata inebilir miyim?" sorusunun cevabını verir: piyasa fiyatı başabaş fiyatınızın altındaysa, o üründe rekabet etmek yerine maliyetinizi düşürmeyi ya da ürünü bırakmayı düşünmelisiniz.
- **Değer bazlı fiyat:** Müşterinin ürüne biçtiği değere göre fiyat koymaktır. Güçlü marka, özgün ürün, iyi yorumlar ve hızlı teslimat daha yüksek fiyatı taşıyabilir.
- **Psikolojik fiyat:** 880 TL yerine 879,90 TL gibi küsuratlı fiyatlar yaygındır. Etkisi kategoriye göre değişir; yuvarlamanın marjınızı başabaşın altına itmediğinden emin olun.
- **Set ve paket fiyatı:** Sabit kesintiler düşük fiyatlı ürünlerde kârı eritiyorsa, ikili ya da üçlü set yaparak kargo ve hizmet bedelini birden fazla ürüne bölebilirsiniz.

Aynı ürünü birden fazla satıcının sattığı ilanlarda fiyat, buybox için de belirleyici etkenlerden biridir. Ama buybox için fiyat kırarken bile başabaş fiyatın altına inmemek gerekir.

## Fiyatınızı ne zaman güncellemelisiniz?

Doğru hesaplanmış bir fiyat bile zamanla yanlış hale gelir. Aşağıdaki durumlardan biri olduğunda fiyatlarınızı yeniden hesaplayın:

- Tedarikçiniz alış fiyatını değiştirdi ya da döviz kuru belirgin biçimde hareket etti.
- Pazaryeri kategorinizin komisyon oranını ya da hizmet bedelini güncelledi.
- Kargo tarifesi değişti ya da ürünün paketini değiştirip desisini düşürdünüz.
- Reklam harcamanız ya da iade oranınız belirgin biçimde arttı.
- Rakipler fiyatlarını kalıcı olarak değiştirdi.
- Ürünün KDV oranı ya da yasal bir kesinti değişti.

Dövizle aldığınız ürünlerde kur değişikliklerini elle takip etmek zordur; fiyatların kurla birlikte güncellenmemesi, fark edilmeden zarar etmenin en hızlı yoludur. Paketleme ve desi tarafında yapacağınız iyileştirmeler için [desi rehberimize](/blog/desi-nedir-nasil-hesaplanir) göz atabilirsiniz.

## Sık yapılan fiyatlandırma hataları

- **Maliyete yüzde ekleyip kesintileri unutmak:** Yukarıdaki örnekte olduğu gibi %50 kâr oranı zarara dönüşebilir.
- **KDV dahil ve hariç tutarları karıştırmak:** Satış fiyatı KDV dahil, kâr ise KDV hariç hesaplanmalıdır. İkisini karıştırmak kârı olduğundan yüksek gösterir.
- **Komisyonun KDV'sini atlamak:** Panelde %20 görünen komisyon nakit olarak fiyatın %24'ünü alır.
- **Stopajı kâr kaybı sanmak ya da tamamen unutmak:** Stopaj nakit akışını etkiler ama yıl sonunda mahsup edilir.
- **Tek bir ürün için hesap yapıp tüm kataloğa genellemek:** Desi, komisyon ve maliyet ürün bazında değişir; hesap da ürün bazında yapılmalıdır.
- **Fiyatı bir kez belirleyip unutmak:** Maliyetler ve kesintiler değiştiğinde dünün doğru fiyatı bugün zarar ettirebilir.

## Her ürünün gerçek kârını kendiliğinden görün

Bu hesabı birkaç ürün için elle yapmak mümkündür. Ama yüzlerce ürün, birden fazla kanal ve sürekli değişen kargo faturaları söz konusu olduğunda, hangi ürünün gerçekten kâr bıraktığını tablolarla takip etmek zorlaşır.

Hastürk CRM'in [gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümü her siparişte komisyonu, kargoyu, hizmet bedelini ve stopajı düşerek net kârı hesaplar; Trendyol ve Hepsiburada'da kesintiler pazaryerinin kestiği faturalardan, kargo ücreti de kargo faturasındaki gerçek tutardan gelir. Sipariş listesinde her siparişin kârını aynı satırda görür, zarar eden ürünler için uyarı alırsınız. Profesyonel pakette Excel ile toplu fiyat, stok ve maliyet güncelleyebilir; Kurumsal pakette dövizle aldığınız ürünlerin fiyatlarını [döviz kuruna endeksli otomatik fiyat](/ozellikler/doviz-endeksli-fiyat) ile kurla birlikte güncel tutabilirsiniz.

Panelin nasıl çalıştığını kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Satış fiyatı nasıl hesaplanır?

Alış maliyeti, kargo ve hizmet bedeli gibi sipariş başına sabit giderleri toplayın; bu toplamı 1'den komisyonun KDV'li payını ve hedef kâr marjınızı çıkardığınızda kalan orana bölün. %20 komisyon ve %20 hedef marjla 493 TL'lik sabit gider için fiyat 493 ÷ 0,56 = 880,36 TL olur.

### Kâr marjı ile kâr oranı arasındaki fark nedir?

Kâr oranı (markup) kârın maliyete, kâr marjı ise kârın satış fiyatına oranıdır. 400 TL'ye alınıp kesintisiz 600 TL'ye satılan üründe kâr oranı %50, kâr marjı %33,3'tür. Pazaryerinde kesintiler nedeniyle aynı fiyat çok daha düşük bir marj, hatta zarar bırakabilir.

### Başabaş fiyatı nedir, nasıl bulunur?

Başabaş fiyatı, tüm kesintiler ve maliyet düşüldükten sonra kârın sıfır olduğu fiyattır. Satış fiyatı formülünde hedef marjı sıfır alarak bulunur. Kampanya, buybox ya da otomatik fiyat kurallarında alt sınırınız bu fiyatın üstünde olmalıdır.

### Satış fiyatı hesaplanırken KDV dahil mi hariç mi kullanılmalı?

Müşteriye gösterdiğiniz fiyat KDV dahildir; kârı ise KDV hariç tutarlarla hesaplamalısınız. Satışta tahsil ettiğiniz KDV'den, komisyon, kargo, hizmet bedeli ve alış faturalarındaki KDV'yi indirip kalan farkı ödersiniz. Tek başına KDV hesabı için [KDV hesaplama aracını](/araclar/kdv-hesaplama) kullanabilirsiniz.

### Her pazaryerinde aynı fiyattan mı satmalıyım?

Zorunlu değildir; karar sizin stratejinize bağlıdır. Kesintiler kanaldan kanala değiştiği için aynı fiyat farklı kanallarda farklı kâr bırakır. Tek fiyat uyguluyorsanız en yüksek kesintili kanalda başabaşın altına düşmediğinizi kontrol edin.

### Fiyatımı ne sıklıkla güncellemeliyim?

Belirli bir takvim yerine tetikleyicilere göre güncelleyin: alış maliyeti, döviz kuru, komisyon oranı, kargo tarifesi, reklam harcaması ya da iade oranı değiştiğinde fiyatı yeniden hesaplayın. Kampanya dönemlerinden önce de indirimli fiyatla kârınızı mutlaka kontrol edin.
`,
  },
  {
    slug: "trendyol-buybox-nedir-nasil-kazanilir",
    title: "Trendyol Buybox Nedir, Nasıl Kazanılır? Zararına Fiyat Kırmadan Buybox Rehberi (2026)",
    seo_title: "Trendyol Buybox Nedir, Nasıl Kazanılır? (2026 Rehberi)",
    seo_desc: "Trendyol buybox nedir, neye göre belirlenir? Rekabet Kurulu kararı, buybox kazanmanın 8 adımı ve zararına satmadan alt fiyat hesabı. Rehberi okuyun.",
    summary: "Buybox, aynı ürünü satan satıcılar arasında 'Sepete ekle' düğmesinin bağlı olduğu satıcıdır. Trendyol'da buybox'ı belirleyen etkenleri, Rekabet Kurulu'nun 2024 kararlarının etkisini, buybox kazanmanın adımlarını ve zararına fiyat kırmamak için alt sınır hesabını anlatıyoruz.",
    tags: ["Trendyol","Buybox","Fiyatlandırma","Hepsiburada"],
    cover: "buybox-kapak.jpg",
    body: `Buybox, aynı ürünü birden fazla satıcının sattığı bir ürün sayfasında **"Sepete ekle" düğmesinin bağlı olduğu satıcıdır**. Müşteri ürün sayfasında doğrudan sepete eklediğinde ürünü buybox sahibinden satın alır; diğer satıcılar ise sayfadaki "diğer satıcılar" listesinde kalır. Trendyol, buybox'ı hangi satıcının alacağını kendi algoritmasıyla belirler. Algoritmanın ağırlıkları yayımlanmaz, ancak fiyatın tek ölçüt olmadığı; teslimat hızı, mağaza performansı ve stok gibi etkenlerin de değerlendirildiği bilinir.

Bu yazıda buybox'ın nasıl çalıştığını, Rekabet Kurulu'nun 2024'te Trendyol ve Hepsiburada için aldığı kararların buybox'ı nasıl etkilediğini, buybox'ı kazanmak için uygulanabilir adımları ve en önemlisi **zararına fiyat kırmadan** buybox'ta nasıl kalacağınızı anlatıyoruz.

## Buybox nedir, neden bu kadar önemlidir?

Trendyol ve Hepsiburada gibi pazaryerlerinde aynı ürün (aynı barkod) için çoğu zaman tek bir ürün sayfası bulunur ve o ürünü satan tüm satıcılar bu sayfada listelenir. Müşterinin ilk gördüğü fiyat, teslimat bilgisi ve "Sepete ekle" düğmesi buybox sahibine aittir. Diğer satıcıların tekliflerini görmek için müşterinin ayrıca "diğer satıcılar" bölümüne bakması gerekir.

Bu yüzden çok satıcılı bir üründe buybox'ta olmak ile olmamak arasındaki fark büyüktür. Müşterilerin büyük kısmı ilk gördüğü teklifi seçtiği için, buybox'ı kaybeden satıcının satışları belirgin biçimde düşebilir. Aynı ürünün yalnız sizin tarafınızdan satıldığı ilanlarda ise buybox rekabeti yoktur; buybox doğal olarak sizdedir.

### Buybox ile arama sıralaması aynı şey mi?

Hayır. Arama sıralaması, müşteri bir kelime aradığında **hangi ürünlerin** üstte görüneceğini belirler. Buybox ise **aynı ürünü satan satıcılar arasında** sepete ekle düğmesinin kime bağlanacağını belirler. Ürününüz aramada üst sıralarda olabilir ama o ürünün sayfasında buybox başka bir satıcıda olabilir. İkisini ayrı ayrı izlemek gerekir.

## Trendyol buybox'ı neye göre belirler?

Trendyol, buybox algoritmasının ölçütlerini ve ağırlıklarını kamuya açık bir liste olarak yayımlamaz. Satıcı kaynaklarında ve sektör yazılarında tutarlı biçimde öne çıkan etkenler şunlardır:

| Etken | Neden önemli? | Ne yapmalı? |
| --- | --- | --- |
| Fiyat | Müşteriye sunulan teklifin en görünür parçası | Rekabetçi ama başabaşın üstünde fiyat |
| Kargoya veriliş ve teslimat süresi | Hızlı teslimat müşteri deneyimini doğrudan etkiler | Kısa ve tutturabileceğiniz bir kargolama süresi |
| Mağaza puanı ve operasyon performansı | Zamanında kargolama, düşük iptal ve iade, müşteri memnuniyeti | Satıcı kaynaklı iptali önleyin, soruları hızlı yanıtlayın |
| Stok durumu | Stoğu tükenen satıcı satış yapamaz | Stoku tüm kanallarda güncel tutun |

Bu etkenlerin hangisinin ne kadar ağırlık taşıdığı açıklanmadığı için "şu puanın üstündeyseniz buybox sizindir" gibi kesin eşikler veren kaynaklara temkinli yaklaşın. Güvenilir olan yaklaşım, kontrol edebildiğiniz her etkende iyi olmaktır. Mağaza puanınızı ve operasyon göstergelerinizi satıcı panelinizden düzenli takip edin.

### Rekabet Kurulu kararları ne değiştirdi?

Rekabet Kurulu, Trendyol ve Hepsiburada'nın satıcılara sunduğu **otomatik fiyatlandırma** mekanizmaları hakkında soruşturma açmıştı. Bu mekanizmalar, satıcıların buybox yarışını otomatikleştirmek için tasarlanmıştı. Kurul, 3 Ekim 2024 tarihli kararlarla her iki şirketin verdiği taahhütleri yeterli bularak soruşturmaları sonlandırdı. Kamuoyuna duyurulan taahhütlerin satıcıyı ilgilendiren başlıca sonuçları şunlardır:

- Otomatik fiyatlandırma aracından **"Buybox Fiyatına Eşitle"** seçeneği kaldırıldı; satıcılara yalnız "Buybox Fiyatının Altında Kal" ve "Buybox Fiyatının Üstünde Kal" seçenekleri sunulacak.
- Satıcıların otomatik fiyatlandırma aracını kullanıp kullanmaması, **buybox algoritmasında bir kriter olarak dikkate alınmayacak.**
- Aracın kullanımı zorunlu tutulmayacak ve kullanımı zorunlu hale getirecek bir teşvik sunulmayacak.

Satıcı açısından anlamı şudur: pazaryerinin kendi otomatik fiyat aracını kullanmak buybox'ta size tek başına bir avantaj sağlamaz. Buybox'ı belirleyen, teklifinizin ve mağaza performansınızın kendisidir.

## Buybox'a girmenin ön koşulları

Buybox rekabetine katılabilmek için bazı temel koşulları sağlamanız gerekir:

- **Aynı ürünü satıyor olmak:** Ürününüz, mevcut ürün sayfasıyla aynı barkoda ve aynı içeriğe sahip olmalıdır. Farklı bir ürünü mevcut sayfaya eklemek hem müşteri şikâyetine hem de pazaryeri yaptırımına yol açabilir.
- **Ürünü yetkili kaynaktan almak:** Marka sahibi, yetkisiz satışlara pazaryerine itiraz edebilir. Satış yaptığınız markalar için fatura ve gerekiyorsa yetki belgelerinizi hazır tutun.
- **Stokta olmak:** Stoğu sıfır olan teklif buybox'a giremez. Birden fazla kanalda satıyorsanız stoklarınızın eşit olduğundan emin olun; aksi halde bir kanalda tükenen ürün diğerinde satılmaya devam eder ve iptale dönüşür. Ayrıntılar için [stok takibi rehberimize](/blog/e-ticarette-stok-takibi-fazla-satis) bakabilirsiniz.
- **Aktif ve sağlıklı bir mağaza:** Mağaza performansınız kötüleştikçe buybox şansınız da düşer.

## Trendyol'da buybox nasıl kazanılır? 8 adım

1. **Başabaş fiyatınızı bilin.** Buybox için fiyat kırmadan önce, tüm kesintilerden sonra kârın sıfır olduğu fiyatı hesaplayın. Bu fiyat sizin kırmızı çizginizdir. Hesap yöntemini [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) adım adım anlattık.
2. **Fiyatı küçük adımlarla ayarlayın.** Rakibin çok altına inmek gereksiz kâr kaybıdır. Buybox'ı almak için çoğu zaman küçük bir fark yeter; fiyatın tek ölçüt olmadığını da unutmayın.
3. **Kargolama sürenizi kısaltın.** Ürün sayfasında görünen teslimat süresi müşterinin kararını etkiler. Tutturabileceğiniz en kısa kargolama süresini tanımlayın ve bu süreye uyun.
4. **Zamanında kargolayın.** Geciken siparişler mağaza performansınızı düşürür. Her sabah bugün kargoya verilmesi gereken siparişleri kontrol edin.
5. **Satıcı kaynaklı iptali sıfıra yaklaştırın.** İptallerin en yaygın nedeni, başka kanalda satılmış bir ürünün stokta görünmeye devam etmesidir. Stok senkronizasyonu bu riski azaltır.
6. **Müşteri sorularını hızlı yanıtlayın.** Soru yanıtlama süresi mağaza deneyiminin bir parçasıdır ve yanıtsız soru satış kaybıdır.
7. **İade nedenlerini azaltın.** Yanlış beden, eksik açıklama ya da hatalı paketleme kaynaklı iadeler ürün sayfası ve paketleme düzeltilerek azaltılabilir.
8. **Stoğu kesintisiz tutun.** Stok tükendiğinde buybox kaybedilir. Hızlı satan ürünlerde tükenme süresini takip edip siparişi zamanında verin.

## Buybox için fiyat kırmadan önce: alt sınır hesabı

Buybox rekabetinin en tehlikeli yanı fiyat savaşıdır. İki satıcı birbirinin altına inmeye devam ettiğinde fiyat kısa sürede başabaşın altına düşebilir. Bunu önlemenin yolu, her ürün için bir **en düşük fiyat** belirlemektir.

Aşağıdaki örnekte tüm tutarlar **varsayımsaldır**. Ürün %20 KDV'li, alış maliyeti 400 TL, kargo 80 TL, platform hizmet bedeli 13 TL (tümü KDV dahil), komisyon %20 + KDV:

| Fiyat (KDV dahil) | Sipariş başına kâr (KDV hariç) | Durum |
| --- | --- | --- |
| 879,90 TL | 146,44 TL | Hedef fiyat (%20 marj) |
| 749,90 TL | 64,10 TL | Kâr düşük ama pozitif |
| 649,90 TL | 0,77 TL | Başabaşın hemen üstü |
| 629,90 TL | −11,90 TL | Zarar |

Bu üründe başabaş fiyatı yaklaşık 648,68 TL'dir. Rakip 629,90 TL'ye indiğinde onu takip etmek, her satışta zarar etmek demektir. Bu durumda yapılacak şey fiyat kırmak değil; rakibin bu fiyatı ne kadar sürdürebileceğini izlemek, diğer etkenlerde (teslimat süresi, mağaza performansı) güçlü kalmak ya da maliyetinizi düşürmenin yolunu aramaktır.

Alt sınırı belirlerken yalnız başabaşa değil, kabul edebileceğiniz en düşük kâra göre karar verin. Örneğin "sipariş başına en az 30 TL kâr" gibi bir kural, reklam ve iade gibi öngörülemeyen giderler için güvenlik payı bırakır. Kampanya döneminde fiyatınızı düşürecekseniz [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) kârınızı önceden kontrol edin.

## Buybox'ı kaybettiniz: neden olabilir?

Buybox'ı kaybettiğinizde ilk refleks fiyatı düşürmek olur; ama neden her zaman fiyat değildir. Aşağıdaki kontrol listesiyle sırayla ilerleyin:

- **Rakip fiyatı:** Buybox fiyatı sizin fiyatınızın altında mı? Fark ne kadar?
- **Teslimat süresi:** Rakibin ürün sayfasında görünen teslimat süresi sizinkinden kısa mı?
- **Stok:** İlanınızda stok var mı? Başka bir kanalda satılan ürün stoğunuzu sıfırlamış olabilir.
- **Mağaza performansı:** Son haftalarda geciken sipariş, iptal ya da iade sayınız arttı mı?
- **İlan durumu:** Ürününüz pasife düşmüş ya da fiyatı onay bekliyor olabilir mi?
- **Kampanya:** Rakip bir kampanyaya katıldığı için geçici olarak öne geçmiş olabilir mi?

Fiyatınız en düşük olduğu halde buybox rakipteyse sorun büyük ihtimalle fiyat dışı bir etkendedir. Bu durumda fiyatı daha da düşürmek yalnız kârınızı azaltır.

## Otomatik fiyatlandırma: nasıl güvenle kullanılır?

Çok sayıda çok satıcılı ürününüz varsa rakip fiyatlarını gün boyu elle takip etmek mümkün değildir. Otomatik fiyatlandırma, belirlediğiniz kurallara göre fiyatınızı rakip fiyatına göre ayarlar. Pazaryerinin kendi aracını ya da bir entegrasyon yazılımını kullanabilirsiniz. Hangisini seçerseniz seçin, şu kuralları uygulayın:

- **Her ürüne alt sınır koyun.** Alt sınırsız otomatik fiyat, fiyat savaşında sizi başabaşın altına sürükleyebilir.
- **Üst sınır da koyun.** Rakip stoğu bittiğinde fiyatın aşırı yükselmesi müşteri güvenini zedeler.
- **Adımı küçük tutun.** Rakibin 1 TL altı gibi küçük adımlar, gereksiz kâr kaybını önler.
- **Buybox sizdeyken fiyatı geri yükseltin.** Buybox'ı aldıktan sonra fiyatı düşük bırakmak, kazanabileceğiniz kârdan vazgeçmektir.
- **Değişiklikleri kayıt altında tutun.** Hangi fiyatın neden değiştiğini görebilmek, kuralları iyileştirmenin tek yoludur.
- **Maliyetiniz değiştiğinde alt sınırı güncelleyin.** Alış fiyatı ya da kargo tarifesi arttığında eski alt sınır artık zarar ettiriyor olabilir.

## Fiyat kırmak mı, teslimatı hızlandırmak mı?

Buybox'ı kaybettiğinizde elinizde iki kaldıraç vardır: fiyat ve hizmet. Fiyat kaldıracı hızlıdır ama her kullanımda kârınızdan bir parça götürür ve rakip de aynı kaldıracı kullanabilir. Hizmet kaldıracı (daha kısa kargolama süresi, zamanında teslim, düşük iptal) daha yavaş sonuç verir ama kalıcıdır ve rakibin kopyalaması zordur.

Aşağıdaki örnek (varsayımsal) farkı gösteriyor: yukarıdaki üründe ayda 300 adet satıyorsunuz. Buybox'ı geri almak için fiyatı 879,90 TL'den 849,90 TL'ye indirdiğinizde sipariş başına kârınız KDV hariç yaklaşık 19 TL azalır; bu da ayda yaklaşık 5.700 TL demektir. Aynı tutarı depo düzenine, paketleme hızına ya da kargo teslim saatinin öne alınmasına harcamak, yalnız bu üründe değil tüm ürünlerinizde buybox şansınızı ve mağaza puanınızı iyileştirebilir. Doğru cevap çoğu zaman ikisinin dengesidir: fiyatı alt sınırla korunan küçük adımlarla yönetirken hizmet tarafını sürekli iyileştirmek.

### Buybox için haftalık kontrol rutini

- Çok satıcılı ürünlerinizi listeleyin ve buybox'ın kimde olduğunu kontrol edin.
- Buybox'ı kaybettiğiniz ilanlarda fiyat farkını ve teslimat süresi farkını not edin.
- Son haftanın geciken siparişlerini ve satıcı kaynaklı iptallerini inceleyin; nedenlerini kapatın.
- Alış maliyeti ya da kargo tarifesi değişen ürünlerin alt sınırlarını güncelleyin.
- Stoğu azalan çok satıcılı ürünlerin siparişini verin; stok tükendiğinde buybox da gider.
- Yanıtsız müşteri sorusu bırakmayın.

## Hepsiburada'da buybox

Hepsiburada'da da aynı ürün tek bir ürün sayfasında listelenir ve satıcılar bu sayfada fiyat ve teslimat koşullarıyla yarışır. Fiyat, kargolama hızı, mağaza performansı ve stok burada da belirleyicidir. Rekabet Kurulu'nun aynı tarihli kararıyla Hepsiburada'nın otomatik fiyatlandırma aracından da "Buybox Fiyatına Eşitle" seçeneği kaldırıldı ve aracın kullanımı buybox kriteri olmaktan çıktı. Hepsiburada'da satışa başlıyorsanız [Hepsiburada satıcı olma rehberimize](/blog/hepsiburada-satici-olma-magaza-acma) göz atabilirsiniz.

## Buybox'ı Hastürk CRM ile takip edin

Hastürk CRM'in [buybox takibi ve otomatik fiyat](/ozellikler/buybox-takibi) özelliği Trendyol ve Hepsiburada ilanlarınız için çalışır. Her ilanın buybox sırasını, buybox fiyatını ve ikinci, üçüncü satıcının fiyatını görürsünüz; buybox'ı kaybettiğiniz ilanlar ayrıca listelenir.

Kural tanımladığınız ilanlarda panel buybox durumunu 15 dakikada bir kontrol eder. Buybox rakibe geçtiğinde fiyatınızı belirlediğiniz adım kadar rakibin altına çeker; ama **belirlediğiniz en düşük fiyatın altına asla inmez**, en yüksek fiyatın da üstüne çıkmaz. Buybox sizdeyken fiyat ikinci satıcının hemen altına ya da hedef fiyatınıza doğru yeniden yükseltilir. Her değişiklik eski ve yeni fiyat, rakip fiyatı ve nedeniyle kaydedilir. Kural kurmak istemezseniz fiyat önerileri ekranı, önerilen fiyatı ve o fiyattaki kârınızı gösterir; fiyatı siz onaylarsınız.

Buybox takibi [Profesyonel ve Kurumsal paketlerde](/paketler) yer alır. Panelin nasıl çalıştığını [canlı demoda](/demo) görebilir, kendi [Trendyol mağazanızı](/entegrasyonlar/trendyol) bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol buybox nedir?

Aynı ürünü birden fazla satıcı sattığında ürün sayfasındaki "Sepete ekle" düğmesinin bağlı olduğu satıcıdır. Müşteri doğrudan sepete eklediğinde ürünü buybox sahibinden alır; diğer satıcılar "diğer satıcılar" bölümünde listelenir.

### Buybox'ı sadece en ucuz satıcı mı alır?

Hayır. Fiyat önemli bir etkendir ama tek etken değildir. Teslimat süresi, mağaza performansı ve stok durumu da değerlendirilir. Fiyatınız en düşük olsa bile buybox, teslimatı daha hızlı ya da performansı daha iyi bir satıcıda kalabilir.

### Pazaryerinin otomatik fiyat aracını kullanmak buybox şansımı artırır mı?

Rekabet Kurulu'nun 3 Ekim 2024 tarihli kararlarıyla bağlayıcı hale gelen taahhütlere göre Trendyol ve Hepsiburada, otomatik fiyatlandırma aracının kullanılıp kullanılmamasını buybox algoritmasında bir kriter olarak dikkate almayacak. Araç yalnız fiyatınızı kurallara göre değiştirir; buybox'ı belirleyen teklifinizin kendisidir.

### Tek satıcısı olduğum üründe buybox önemli mi?

Ürünü yalnız siz satıyorsanız buybox rekabeti yoktur ve sepete ekle düğmesi size bağlıdır. Ancak başka bir satıcı aynı ürünü satmaya başladığında rekabet başlar; bu yüzden çok satan ürünlerinizi düzenli kontrol etmekte fayda vardır.

### Buybox için fiyatı ne kadar düşürmeliyim?

Başabaş fiyatınızın, tercihen kabul edebileceğiniz en düşük kârın altına inmeden, rakibin hemen altına yetecek kadar. Rakip fiyatı alt sınırınızın altındaysa takip etmeyin; fiyat dışı etkenlerde güçlü kalmak daha sağlıklıdır.

### Buybox sıramı nereden görebilirim?

En basit yol, ürün sayfasını açıp sepete ekle düğmesinin hangi satıcıya bağlı olduğuna bakmaktır. Çok sayıda ilanınız varsa bu yöntem pratik değildir. Trendyol ve Hepsiburada, buybox bilgisini entegrasyon servisleriyle de paylaşır; örneğin Trendyol'un geliştirici dokümanına göre bu servis ürünün buybox sırasını, buybox fiyatını ve birden fazla satıcısı olup olmadığını döndürür. Entegrasyon yazılımları bu bilgiyi tüm ilanlarınız için tek listede gösterebilir.
`,
  },
  {
    slug: "e-ticarette-kargo-maliyeti-dusurme",
    title: "E-Ticarette Kargo Maliyeti Nasıl Düşürülür? Kargo Anlaşması, Desi ve Pazaryeri Kargo Modelleri",
    seo_title: "E-Ticarette Kargo Maliyeti Nasıl Düşürülür? (2026)",
    seo_desc: "Kargo maliyetinizi düşürün: kargo anlaşması yaparken sorulacaklar, desi optimizasyonu, pazaryeri kargo modelleri ve fatura kontrolü. Rehberi hemen okuyun.",
    summary: "Kargo maliyeti paketin desisine, uygulanan tarifeye ve iade gibi operasyon kayıplarına bağlıdır. Kargo maliyetinizi nasıl analiz edeceğinizi, pazaryeri kargo modellerini, kargo firmasıyla anlaşırken nelere bakmanız gerektiğini ve fatura kontrolünü örneklerle anlatıyoruz.",
    tags: ["Kargo","Maliyet","Desi","E-Ticaret"],
    cover: "kargo-maliyeti-kapak.jpg",
    body: `E-ticarette kargo maliyeti üç şeye bağlıdır: paketin **ücrete esas ağırlığı** (desi ya da kilogram), bu ağırlığa uygulanan **tarife** (pazaryerinin anlaşması ya da sizin anlaşmanız) ve iade, hatalı faturalama, yeniden gönderim gibi **operasyon kayıpları**. Kargo maliyetini kalıcı olarak düşürmenin yolu bu üçüne ayrı ayrı müdahale etmektir: paketi küçültmek, doğru kargo modelini seçip iyi bir anlaşma yapmak ve kaçakları kapatmak.

Bu yazıda kargo maliyetinizi nasıl analiz edeceğinizi, pazaryeri kargo modellerini, kargo firmasıyla anlaşma yaparken nelere bakmanız gerektiğini, desi optimizasyonunun gerçek etkisini ve kargo faturalarını nasıl kontrol edeceğinizi örneklerle anlatıyoruz.

## Kargo maliyetiniz neden yüksek?

Kargo, özellikle düşük ve orta fiyatlı ürünlerde komisyondan sonra en büyük kesinti kalemi olabilir. Sipariş başına neredeyse sabit olduğu için ürün fiyatı düştükçe kargo, kârın daha büyük bir kısmını alır. Maliyeti oluşturan bileşenler şunlardır:

| Bileşen | Neye bağlı? | Nasıl düşürülür? |
| --- | --- | --- |
| Ücrete esas ağırlık | Paket ölçüleri ve gerçek ağırlık | Doğru koli, sıkı paketleme |
| Tarife | Pazaryeri anlaşması ya da sizin anlaşmanız, gönderi hacmi | Model seçimi, pazarlık, firma karşılaştırması |
| İade ve tekrar gönderim | İade oranı, hatalı ürün ya da adres | Doğru ürün bilgisi, kontrollü paketleme |
| Fatura farkları | Faturada yazan desi ile gerçek desinin uyuşmaması | Düzenli fatura kontrolü ve itiraz |

## İlk adım: kargo maliyetinizi ölçün

Maliyeti düşürmeden önce nereye gittiğini görmeniz gerekir. Son üç ayın gönderilerini bir tabloya dökün ve şu soruların cevabını çıkarın:

1. **Sipariş başına ortalama kargo maliyetiniz ne kadar?** Toplam kargo faturasını gönderi sayısına bölün.
2. **Kargo, cironun yüzde kaçı?** Toplam kargo maliyetini toplam ciroya bölün. Bu oranı ürün ve kanal bazında da hesaplayın.
3. **Gönderileriniz hangi desi aralıklarında yoğunlaşıyor?** Gönderilerin büyük kısmı birkaç ürün ve birkaç koli ölçüsünde toplanır. İyileştirmeyi buradan başlatın.
4. **Hangi kanalda hangi tarifeyle gönderiyorsunuz?** Pazaryeri anlaşması ile kendi anlaşmanızın aynı desi için fiyatlarını yan yana koyun.
5. **İade gönderileri ne kadar tutuyor?** İade oranı yüksek ürünlerde gidiş ve dönüş kargosu birlikte düşünülmelidir.

Bu analiz genellikle şaşırtıcı bir sonuç verir: kargo maliyetinin büyük kısmı birkaç ürünün yanlış koliyle gönderilmesinden ya da birkaç kategorideki yüksek iade oranından kaynaklanır.

## Pazaryeri kargo modelleri

Pazaryerlerinde iki temel model vardır ve her pazaryerinin seçenekleri, koşulları ve tarifeleri farklıdır:

- **Pazaryerinin anlaşmalı kargosu:** Siparişin kargo barkodu pazaryerinden gelir, gönderi pazaryerinin anlaştığı kargo firmalarıyla ve pazaryerinin anlaşmalı fiyatlarıyla taşınır. Ücret paketin desisine göre hesaplanır ve kargo faturası olarak hakedişinizden düşülür. Ayrı bir sözleşme gerekmez; yeni başlayan satıcıların çoğu bu modelle çalışır.
- **Satıcının kendi kargo anlaşması:** Bazı pazaryerleri ve kanallar, siparişi kendi anlaşmanızla göndermenize izin verir. Bu durumda tarifeyi kargo firmasıyla siz belirler, ücreti firmaya siz ödersiniz. Hangi kanalda, hangi koşullarla bu seçeneğin sunulduğunu satıcı panelinizden kontrol edin.

### Barem ve kargo destek programları

Pazaryerleri düşük tutarlı siparişlerde kargo ücretini desiye göre değil, sipariş tutarına bağlı farklı bir fiyatlamayla hesaplayabilir; Trendyol'da bu uygulama **kargo baremi** olarak bilinir. Ayrıca zamanında kargolama gibi performans koşullarına bağlı indirimli tarifeler ya da destek programları dönem dönem duyurulur. Bu uygulamaların eşikleri, tutarları ve koşulları sık değiştiği için internetteki tablolara değil, satıcı panelinizdeki güncel duyurulara ve faturalarınıza güvenin. Düşük fiyatlı ürünlerde fiyat belirlerken barem uygulamasının sizin ürünlerinize etkisini mutlaka hesaba katın.

### Kargo firması seçimi

Anlaşmalı kargo modelinde de çoğu zaman birden fazla kargo firması arasından seçim yapabilirsiniz. Firmaların tarifeleri, teslimat hızları ve bölgesel performansları farklı olabilir. Aynı desi için firmalar arasındaki fiyat farkını ve müşterilerinizin yoğunlaştığı bölgelerdeki teslim sürelerini karşılaştırarak varsayılan firmanızı belirleyin.

## Kendi kargo anlaşmanızı yapmak

Kendi e-ticaret sitenizden satış yapıyorsanız ya da gönderi hacminiz belirli bir seviyeye ulaştıysa, kargo firmalarıyla doğrudan kurumsal anlaşma yapmak maliyeti düşürmenin en etkili yollarından biridir. Kargo firmaları teklif verirken büyük ölçüde gönderi hacminize ve paketlerinizin profiline bakar; bu yüzden görüşmeye hazırlıklı gitmek önemlidir.

### Görüşmeden önce hazırlayın

- **Aylık gönderi adedi:** Son üç ayın ortalaması ve yoğun dönemlerdeki en yüksek adet.
- **Desi dağılımı:** Gönderilerinizin yüzde kaçı hangi desi aralığında? Firmalar en çok bu dağılıma göre fiyat verir.
- **Gönderi bölgeleri:** Müşterilerinizin hangi illerde yoğunlaştığı.
- **İade oranı:** İade gönderilerinin aylık adedi.
- **Teslim alma ihtiyacı:** Paketlerin depodan mı alınacağı, şubeye mi teslim edileceği.

### Teklifte nelere bakmalısınız?

| Konu | Sorulacak soru |
| --- | --- |
| Desi kademeleri | Fiyat hangi desi aralıklarında değişiyor? En çok gönderdiğiniz aralık hangi kademede? |
| Desi hesabı | Bölen kaç (yaygın olarak 3000)? Küsuratlı desi nasıl yuvarlanıyor? Desi ile kilogramdan büyük olanı mı esas alınıyor? |
| İade gönderisi | İade gönderilerine hangi fiyat uygulanıyor? Müşteriye iade kodu verilebiliyor mu? |
| Teslim alma | Adresten alım ücretsiz mi, saat aralığı ne? |
| Ek ücretler | Uzak ya da özel teslimat bölgeleri için ek ücret var mı? |
| Hasar ve kayıp | Tazmin süreci nasıl işliyor, sınırları ne? |
| Ödeme | Fatura dönemi ve ödeme vadesi ne? |
| Entegrasyon | Web servis bilgisi veriliyor mu? Etiket ve takip numarası sisteminize otomatik gelebilir mi? |

Tek bir teklifle yetinmeyin. En az iki ya da üç firmadan, en sık gönderdiğiniz üç-dört paket ölçüsü için fiyat alın ve toplam aylık maliyeti karşılaştırın. Birim fiyatın yanında teslimat başarısı ve müşteri şikâyetleri de maliyetin parçasıdır: geç ya da hasarlı teslim edilen paket iade, olumsuz yorum ve kayıp müşteri demektir.

### Birden fazla firmayla çalışmak

Tek bir firmaya bağlı kalmak hem pazarlık gücünüzü azaltır hem de o firmada yaşanabilecek yoğunluk ya da aksaklıkta sizi çaresiz bırakır. Birçok satıcı ana firmasının yanında yedek bir firmayla da anlaşma yapar; bazı ürün gruplarını ya da bölgeleri bu firmayla gönderir.

## Desi optimizasyonu: en hızlı tasarruf

Desi, paketin en × boy × yüksekliğinin (cm) 3000'e bölünmesiyle bulunur ve kargo firmaları çoğunlukla desi ile gerçek ağırlıktan büyük olanı ücrete esas alır. Hafif ama büyük kolilerle gönderilen ürünlerde ödediğiniz ücreti gerçek ağırlık değil koli boyutu belirler. Bu yüzden koliyi küçültmek, çoğu zaman tarifeyi pazarlıkla düşürmekten daha hızlı sonuç verir.

Aşağıdaki örnekte tarife **varsayımsaldır**:

| Desi aralığı | Ücret (KDV dahil, varsayımsal) |
| --- | --- |
| 0–2 desi | 75 TL |
| 3–5 desi | 95 TL |
| 6–10 desi | 130 TL |
| 11–15 desi | 170 TL |

Bir ürün 40 × 30 × 20 cm koliyle gönderiliyor: 24.000 ÷ 3000 = **8 desi**, ücret 130 TL. Aynı ürün dolgu malzemesi azaltılarak 30 × 25 × 12 cm koliye sığdırıldığında: 9.000 ÷ 3000 = **3 desi**, ücret 95 TL. Gönderi başına fark 35 TL'dir. Bu üründen ayda 1.000 adet gönderiyorsanız tasarruf aylık **35.000 TL**, KDV hariç yaklaşık 29.167 TL olur.

Desiyi düşürmenin pratik yolları, ölçüm hataları ve örnek hesaplar için [desi rehberimizi](/blog/desi-nedir-nasil-hesaplanir) okuyabilir, kendi paketlerinizi [desi hesaplama aracıyla](/araclar/desi-hesaplama) hesaplayabilirsiniz. Kısaca:

- Her ürün grubu için ürüne uygun ölçüde birkaç koli tipi kullanın; tek tip büyük koli en pahalı tercihtir.
- Kırılmayan ürünlerde koli yerine kargo poşeti değerlendirin.
- Dolgu malzemesini koruma için yeterli, boşluk için değil kullanın.
- Ürünlerinize doğru desi bilgisi girin; fatura kontrolü bu bilgiye dayanır.

## Ücretsiz kargo eşiği ve kargoyu fiyata yansıtmak

Kendi sitenizde kargo ücretini müşteriden ayrıca almak, ürün fiyatına dahil etmek ya da belirli bir sepet tutarının üstünde ücretsiz kargo vermek mümkündür. Ücretsiz kargo eşiği, doğru belirlendiğinde ortalama sepet tutarını artırarak kargo maliyetini birden fazla ürüne böler.

Eşiği belirlerken şu hesabı yapın: kargo maliyetinizi karşılamak için sepete ne kadar ek satış eklenmesi gerekir? Örneğin (varsayımsal) sipariş başına kargo maliyetiniz KDV hariç 62,50 TL ve ürünlerinizden alış maliyeti ile ödeme kesintisi düşüldükten sonra satışın %30'u kadar katkı kalıyorsa, kargoyu karşılamak için 62,50 ÷ 0,30 = 208,33 TL (KDV hariç), yani KDV dahil 250 TL ek satış gerekir. Eşiği ortalama sepet tutarınızın bir miktar üzerine koymak, müşteriyi sepete ürün eklemeye yönlendirirken kârınızı korur.

Pazaryerlerinde ise kargo ücreti ürün fiyatına dahildir ve hakedişinizden düşülür; bu yüzden fiyat hesabında kargoyu sipariş başına sabit gider olarak ele almalısınız. Hesabın nasıl kurulacağını [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) anlattık.

## İade kaynaklı kargo maliyetini azaltın

İade edilen her sipariş iki kez kargo maliyeti demektir: gidiş ve dönüş. İadelerin önemli kısmı ürün sayfasının yetersizliğinden kaynaklanır: beden tablosu olmayan giyim ürünleri, eksik ölçü bilgisi olan mobilyalar, gerçek rengini yansıtmayan fotoğraflar. İade nedenlerini ürün bazında kaydedin; en çok iade alan beş ürünün sayfasını iyileştirmek, kargo faturanızı doğrudan düşürür. Paketleme sırasında ürün, varyant ve adres kontrolü yapmak da yanlış gönderim kaynaklı iadeleri önler.

## Kargo faturasını kontrol edin

Kargo faturalarında yazan desinin paketin gerçek desisiyle uyuşmaması sık karşılaşılan bir durumdur. Ölçüm farkları ya da hatalı okuma nedeniyle paket bir üst kademeden faturalanabilir. Tek tek küçük görünen bu farklar, yüzlerce gönderide önemli bir tutara ulaşır.

Pazaryerleri de bu farkları ayrıca kayda alabilir. Örneğin Trendyol'un cari hesap ekstresi servisinin dokümanında, ağırlık farkından doğan tutar farkları için hakedişe ayrı düzeltme (provizyon) kayıtları oluşturulduğu belirtilir. Ayda en az bir kez şu kontrolleri yapın:

- Faturadaki desi ile ürün kartınızdaki desiyi karşılaştırın; büyük farklar için kargo firmasına ya da pazaryerine itiraz edin.
- Aynı ürünün farklı gönderilerde farklı desiden faturalanıp faturalanmadığına bakın.
- İptal edilen ya da kargoya verilmeyen siparişler için kargo ücreti kesilip kesilmediğini kontrol edin.
- Kendi anlaşmanızda, faturadaki birim fiyatların anlaşmanızdaki tarifeyle uyuştuğunu doğrulayın.

## Kargo maliyetini düşürmek için kontrol listesi

- Son üç ayın gönderilerini desi aralığına ve ürüne göre analiz edin.
- En çok gönderdiğiniz ürünler için koli ölçülerini gözden geçirin.
- Ürün kartlarınıza doğru ölçü, ağırlık ve desi bilgisi girin.
- Pazaryerinin anlaşmalı tarifesini ve varsa kendi anlaşma seçeneğini karşılaştırın.
- Kendi siteniz için en az iki kargo firmasından teklif alın.
- Barem ve destek programlarının güncel koşullarını satıcı panelinizden takip edin.
- Ücretsiz kargo eşiğinizi ortalama sepet tutarına göre belirleyin.
- En çok iade alan ürünlerin sayfalarını iyileştirin.
- Kargo faturalarını ayda en az bir kez kontrol edip farklara itiraz edin.
- Sipariş başına gerçek kargo maliyetini kâr hesabınıza işleyin.

## Gerçek kargo maliyetini her siparişte görün

Kargo maliyetini düşürmenin ön koşulu, her siparişin gerçek kargo maliyetini bilmektir. Tahmini tutarlarla yapılan kâr hesabı, kargo faturası geldiğinde yanıltıcı çıkar.

Hastürk CRM'in [gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümünde, pazaryerinin kargo faturasındaki **gerçek tutar** siparişe işlenir; böylece her siparişin ve her ürünün kargo dahil net kârını görürsünüz. [Kargo ve etiket](/ozellikler/kargo-ve-etiket) bölümünde Trendyol ve Hepsiburada siparişlerinin ortak barkodlu etiketini panelden basar, gerekirse kargo firmasını panelden değiştirip yeni barkodu alırsınız. Kendi kargo anlaşmanızla çalışıyorsanız, Kurumsal pakette yer alan [kargo firması entegrasyonu](/ozellikler/kargo-entegrasyonu) ile Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL eCommerce ve Sürat Kargo'da gönderiyi panelden açar; takip numarası ve etiket panele gelir, firmanın bildirdiği kargo ücreti siparişin giderine yazılır.

Panelin nasıl çalıştığını [canlı demoda](/demo) görebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### E-ticarette kargo maliyeti nasıl düşürülür?

Üç yönden: paketin desisini düşürerek (ürüne uygun koli, sıkı paketleme), doğru tarifeyle çalışarak (pazaryeri anlaşması ile kendi anlaşmanızı karşılaştırmak, birden fazla firmadan teklif almak) ve kayıpları kapatarak (iade nedenlerini azaltmak, kargo faturalarını kontrol etmek).

### Kargo firmasıyla anlaşma yapmak için ne gerekir?

Firmalar genellikle şirketinizin bilgilerini ve gönderi profilinizi ister. Görüşmeye aylık gönderi adediniz, desi dağılımınız, gönderi bölgeleriniz ve iade oranınızla gidin. Teklifi desi kademeleri, iade fiyatı, teslim alma koşulları ve ek ücretlerle birlikte değerlendirin.

### Pazaryerinin anlaşmalı kargosu mu, kendi anlaşmam mı daha ucuz?

Ürünlerinizin desi dağılımına, gönderi hacminize ve pazaryerinin o dönemki tarifesine bağlıdır. En sağlıklı yol, en sık gönderdiğiniz paket ölçüleri için iki tarifeyi yan yana koyup aylık toplam maliyeti karşılaştırmaktır. Kendi anlaşma seçeneğinin hangi kanalda ve hangi koşullarla sunulduğunu satıcı panelinizden kontrol edin.

### Kargo baremi nedir?

Pazaryerlerinin düşük tutarlı siparişlerde kargo ücretini desi yerine sipariş tutarına bağlı farklı bir fiyatlamayla hesapladığı uygulamadır; Trendyol'da bu ad kullanılır. Eşikler ve tutarlar dönem dönem değiştiği için güncel koşulları satıcı panelinizden takip edin.

### Kargo faturasındaki desi yanlışsa ne yapmalıyım?

Paketin gerçek ölçülerini ve ürün kartınızdaki desi bilgisini kanıt olarak hazırlayıp pazaryerine ya da kargo firmasına itiraz edin. Aynı ürün sürekli yüksek desiden faturalanıyorsa paket ölçülerinizi ve ürün bilginizi gözden geçirin.

### Ücretsiz kargo vermek kârlı mı?

Doğru eşikle verildiğinde kârlı olabilir. Ücretsiz kargo eşiğini, kargo maliyetinizi karşılayacak ek satışı hesaplayarak ve ortalama sepet tutarınızın biraz üzerine koyarak belirleyin. Eşiksiz ücretsiz kargo ise düşük tutarlı siparişlerde kârı tamamen eritebilir.
`,
  },
  {
    slug: "pazaryeri-hakedis-nedir-ne-zaman-yatar",
    title: "Pazaryeri Hakediş Nedir? Trendyol ve Hepsiburada Ödemeleri Ne Zaman Yatar, Nasıl Kontrol Edilir?",
    seo_title: "Hakediş Nedir? Trendyol Ödemesi Ne Zaman Yatar? (2026)",
    seo_desc: "Pazaryeri hakedişi nasıl hesaplanır, ne zaman yatar? Trendyol ve Hepsiburada ödeme döngüsü, kesintiler ve adım adım mutabakat kontrolü. Rehberi okuyun.",
    summary: "Hakediş, satışlarınızdan tüm kesintiler düşüldükten sonra pazaryerinin size ödediği net tutardır. Hakedişin nasıl oluştuğunu, Trendyol ve Hepsiburada ödemelerinin işleyişini, düşülen kalemleri ve size yatan paranın doğruluğunu kontrol etmek için mutabakat adımlarını anlatıyoruz.",
    tags: ["Hakediş","Trendyol","Hepsiburada","Nakit Akışı"],
    cover: "hakedis-kapak.jpg",
    body: `Hakediş, pazaryerinde yaptığınız satışlardan komisyon, kargo, hizmet bedeli, stopaj ve diğer kesintiler düşüldükten sonra **pazaryerinin size ödeyeceği net tutardır**. Satışın parası müşteriden pazaryerine geçer; pazaryeri bu tutarı sipariş müşteriye teslim edildikten ve ürün kategorinize tanımlı **vade** dolduktan sonra, kesintileri mahsup ederek hesabınıza aktarır. Bu yüzden bugün yaptığınız satışın parası birkaç hafta sonra hesabınıza geçer.

Bu yazıda hakedişin nasıl oluştuğunu, Trendyol ve Hepsiburada'da ödemelerin hangi mantıkla yapıldığını, hakedişten düşülen kalemleri ve en önemlisi **mutabakatı**, yani size yatan paranın doğru olup olmadığını nasıl kontrol edeceğinizi anlatıyoruz. Ödeme süreleri kategoriye, sözleşmeye ve döneme göre değiştiği için kesin gün vermiyoruz; kendi vadenizi nereden göreceğinizi gösteriyoruz.

## Hakediş nedir?

Hakediş, en basit haliyle şöyle hesaplanır:

**Hakediş = Satış tutarı − Komisyon − Kargo − Hizmet bedeli − Stopaj − Diğer kesintiler ± Düzeltmeler**

Örneğin (varsayımsal) %20 KDV'li 1.000 TL'lik bir satışta komisyon %20 + KDV (240 TL), kargo 80 TL, platform hizmet bedeli 13 TL ve %1 stopaj (1.000 ÷ 1,20 × %1 = 8,33 TL) düşüldüğünde hakediş **658,67 TL** olur. Bu hesabın ayrıntılarını [Trendyol komisyon ve net kâr rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) adım adım anlattık.

### Hakediş kâr değildir

Hakediş, pazaryerinden hesabınıza geçecek nakittir; kârınız değildir. Kârı bulmak için hakedişten ürünün alış maliyetini ve ödeyeceğiniz KDV farkını düşmeniz, peşin ödenmiş vergi niteliğindeki stopajı ise ayrıca hesaba katmanız gerekir. Pek çok satıcı hesabına yatan tutara bakıp kâr ettiğini düşünür; oysa reklam, iade ve işletme giderleri düşülmeden bulunan rakam yanıltıcıdır.

## Hakediş nasıl oluşur? Satıştan ödemeye adım adım

![Satıştan hakedişe: sipariş, teslimat, vade ve ödeme](https://hasturkcrm.com/img/blog/hakedis-akisi.jpg "Satış ile paranın hesaba geçmesi arasındaki adımlar")

1. **Sipariş gelir.** Müşteri ödemeyi pazaryerine yapar; para henüz size geçmez.
2. **Ürünü kargoya verirsiniz.** Kargolama süreniz bu aşamayı belirler.
3. **Sipariş teslim edilir.** Vade çoğunlukla teslim tarihinden itibaren işlemeye başlar. Trendyol'un geliştirici dokümanında da finansal kayıtların sipariş teslim edildikten sonra oluştuğu belirtilir.
4. **Vade dolar.** Vade süresi kategoriye ve sözleşme koşullarınıza göre değişir. Aynı gün satılan iki farklı kategorideki ürünün parası farklı tarihlerde ödenebilir.
5. **Ödeme hesaplanır ve gönderilir.** Vadesi dolan satışların toplamından, aynı dönemdeki kesinti faturaları, iadeler ve düzeltmeler mahsup edilir; kalan tutar banka hesabınıza aktarılır.

Bu akışın pratik sonucu şudur: satış ile paranın hesabınıza geçmesi arasındaki süre, kargolama süresi + teslimat süresi + vade + ödeme döngüsündeki bekleme toplamıdır.

## Trendyol hakediş ne zaman yatar?

Trendyol'da vade, siparişin müşteriye teslim tarihinden itibaren işler ve süresi kategoriye ve sözleşme koşullarınıza göre belirlenir. Trendyol'un cari hesap ekstresi entegrasyonuna ait geliştirici dokümanında (Ekim 2026'da güncellenmiş haliyle) ödeme döngüsü şöyle tarif edilir: **istisnalar dışında, ilgili hafta içinde vadesi dolan siparişler için her çarşamba bir ödeme emri oluşturulur** ve siparişler ile ödemeler bu ödeme emri numarasıyla eşleştirilebilir.

Paranın bankanıza hangi gün geçtiğini ve kendi kategorilerinizin güncel vade sürelerini satıcı panelinizin finans ve cari hesap bölümlerinden görebilirsiniz. İnternette dolaşan "Trendyol ödemeleri şu kadar günde yatar" türünden genellemeler kategoriye ve döneme göre farklılık gösterdiği için nakit planınızı her zaman panelinizdeki vade bilgisine göre yapın.

Trendyol'un aynı dokümanında, vadesi gelmemiş hakedişler için **erken ödeme** alındığında cari hesapta ayrı bir kayıt oluştuğu da belirtilir. Erken ödeme ya da tedarikçi finansmanı seçenekleri varsa koşullarını ve maliyetini panelinizden ve bankanızdan öğrenip normal vadeyle karşılaştırarak karar verin.

## Hepsiburada ödemeleri ne zaman yatar?

Hepsiburada'da da vade, siparişin **müşteriye teslim edildiği tarihten** itibaren başlar ve süresi kategoriye göre belirlenir. Vade dolduğunda tutar kesintiler düşülerek hakedişinize yansır ve Hepsiburada'nın ödeme günlerinde hesabınıza aktarılır. Hepsiburada'nın finans kayıtlarında işlemler ödenecek ve ödenmiş olarak, vade tarihleriyle birlikte tutulur; bunları satıcı panelinizin finans bölümünden izleyebilirsiniz. Vade süreleri kategoriye ve satıcıya göre değişebildiği için güncel sürenizi panelinizdeki komisyon ve hakediş bölümlerinden takip edin. Hepsiburada'da satışa yeni başlıyorsanız [Hepsiburada satıcı olma rehberimize](/blog/hepsiburada-satici-olma-magaza-acma) de göz atabilirsiniz.

## Hakedişten düşülen kalemler

Pazaryerinin cari hesap ekstresinde hakedişinizi etkileyen kayıtlar türlerine göre listelenir. Trendyol'un geliştirici dokümanında yer alan işlem türlerinden satıcıyı en çok ilgilendirenler şunlardır:

| Kayıt | Hakedişe etkisi | Açıklama |
| --- | --- | --- |
| Satış | + | Teslim edilen siparişin tutarı |
| İade | − | İade edilen siparişin tutarı geri alınır |
| İndirim ve kupon | − | Satıcının karşıladığı indirim ve kupon tutarları |
| Komisyon | − | Satış tutarı üzerinden kategori oranıyla |
| Kesinti faturaları | − | Kargo, platform hizmet bedeli, reklam, ceza gibi hizmet bedelleri |
| Stopaj | − | KDV hariç satış tutarının %1'i |
| Provizyon | + / − | Ağırlık (desi) farkından doğan tutar farkları için düzeltme |
| Düzeltme kayıtları | + / − | Hakediş ve komisyon düzeltmeleri |

Burada dikkat edilmesi gereken nokta, kesinti faturalarının siparişle aynı anda değil, kendi fatura dönemlerinde kesilmesidir. Bu yüzden bir haftanın ödemesinde o haftanın siparişleriyle birlikte önceki dönemlere ait kargo, reklam ya da ceza faturaları da mahsup edilmiş olabilir. Mutabakatın zorluğu buradan gelir.

## Örnek: bir haftalık hakediş kontrolü

Aşağıdaki örnekte tüm tutarlar **varsayımsaldır**. Bu hafta vadesi dolan iki sipariş var; ikisi de %20 KDV'li, komisyon %20 + KDV, hizmet bedeli 13 TL.

| | Sipariş A | Sipariş B |
| --- | --- | --- |
| Satış tutarı | 1.000,00 TL | 500,00 TL |
| Komisyon (%24) | −240,00 TL | −120,00 TL |
| Beklenen kargo | −80,00 TL | −60,00 TL |
| Hizmet bedeli | −13,00 TL | −13,00 TL |
| Stopaj | −8,33 TL | −4,17 TL |
| **Beklenen hakediş** | **658,67 TL** | **302,83 TL** |

Beklenen toplam 961,50 TL. Hesabınıza ise 946,50 TL yatmış: 15 TL fark var. Ekstreyi sipariş bazında açtığınızda A siparişinin kargo faturasının 80 TL yerine 95 TL kesildiğini görüyorsunuz. Paketin desisi faturada bir üst kademeden okunmuş. Bu durumda paket ölçüleri ve ürün kartınızdaki desi bilgisiyle itiraz edebilirsiniz.

15 TL tek başına küçük görünür. Ama aynı hata haftada 200 siparişte tekrarlanıyorsa, ayda 12.000 TL'yi aşan bir kayıp demektir. Mutabakatın amacı tam olarak bu küçük ama sürekli farkları yakalamaktır. Kargo farklarını azaltmanın yollarını [kargo maliyetini düşürme rehberimizde](/blog/e-ticarette-kargo-maliyeti-dusurme) ayrıca anlattık.

## Mutabakat nasıl yapılır? 7 adım

Mutabakat, pazaryerinin size ödediği tutar ile sizin kayıtlarınıza göre ödenmesi gereken tutarın karşılaştırılmasıdır. Haftalık ödeme alıyorsanız haftalık, değilse en az aylık yapın:

1. **Ekstreyi indirin.** Satıcı panelinizin cari hesap ya da finans bölümünden ilgili döneme ait işlemleri sipariş bazında dışa aktarın.
2. **Siparişlerinizi eşleştirin.** Ekstredeki her satış kaydını sipariş numarasıyla kendi sipariş listenizle eşleştirin. Teslim edilip ekstrede görünmeyen siparişleri not alın; vadesi henüz dolmamış olabilirler.
3. **Komisyon oranını kontrol edin.** Her siparişte uygulanan oranın ürününüzün kategorisindeki oranla uyuştuğuna bakın. Kampanya dönemlerinde farklı tarifeler uygulanmış olabilir.
4. **Kargo tutarlarını kontrol edin.** Faturadaki desiyi ürün kartınızdaki desiyle karşılaştırın.
5. **İadeleri takip edin.** İade edilen siparişin satış tutarının geri alındığını ve komisyonunun mahsup edildiğini doğrulayın.
6. **Stopajı doğrulayın.** Stopaj, KDV hariç satış tutarının %1'i olmalıdır. Tek tek kontrol için [stopaj hesaplama aracını](/araclar/e-ticaret-stopaj-hesaplama) kullanabilirsiniz.
7. **Banka hareketiyle karşılaştırın.** Ödeme emrindeki tutarın banka hesabınıza aynen geçtiğini kontrol edin. Açıklayamadığınız farklar için pazaryerinin satıcı destek kanalından kayıt açın ve kanıtlarınızı ekleyin.

### Sık görülen farklar ve nedenleri

| Fark | Olası neden | Ne yapmalı? |
| --- | --- | --- |
| Beklenenden düşük ödeme | Önceki döneme ait kargo, reklam ya da ceza faturası mahsup edilmiş | Kesinti faturalarını dönemiyle birlikte kontrol edin |
| Kargo tutarı yüksek | Faturada desi bir üst kademeden okunmuş | Ölçü ve desi bilgisiyle itiraz edin |
| Komisyon beklenenden yüksek | Ürün farklı kategoride ya da kampanya tarifesi uygulanmış | Kategoriyi ve kampanya koşullarını kontrol edin |
| Sipariş ödemede yok | Vadesi dolmamış ya da teslimat kaydı gecikmiş | Teslim tarihini ve vadeyi kontrol edin |
| İade sonrası eksi bakiye | İade tutarı yeni satışlardan mahsup edilmiş | İade kayıtlarını siparişle eşleştirin |

## Hakediş vadesine göre nakit akışını planlayın

Vade, satış ile para arasında bir boşluk yaratır ve bu boşluk büyüdükçe işletmenizin daha fazla işletme sermayesine ihtiyacı olur. Basit bir hesapla görelim (varsayımsal): kargolama 1 gün, teslimat 2 gün, vade 14 gün ve haftalık ödeme döngüsünde ortalama birkaç günlük bekleme olsun. Satışın parası ortalama 3 hafta sonra hesabınıza geçer. Haftada 50.000 TL hakediş oluşturan bir mağazanın, herhangi bir anda yaklaşık 150.000 TL'si pazaryerinde alacak olarak bekliyor demektir.

Bu nedenle:

- **Stok alımlarınızı vadeye göre planlayın.** Tedarikçinize ödeme vadeniz, pazaryerinden tahsilat sürenizden kısaysa büyüdükçe nakit sıkışması yaşarsınız.
- **Kampanya dönemlerine dikkat edin.** Büyük kampanyalarda satış artar ama para vadeyle gelir; kampanya için alınan stok ve reklam harcaması önce sizin cebinizden çıkar.
- **İade oranını hesaba katın.** İade edilen siparişin tutarı, sonraki ödemelerden mahsup edilir.
- **Kanalları birlikte izleyin.** Birden fazla pazaryerinde satıyorsanız her kanalın vade ve ödeme döngüsü farklıdır; toplam nakit takviminizi birlikte görmeniz gerekir.

Fiyatlarınızı belirlerken de vadenin bir maliyeti olduğunu unutmayın: paranın hesabınıza geç gelmesi, özellikle yüksek enflasyon ortamında, aynı tutarın değerini azaltır. Fiyat hesabının kuruluşu için [satış fiyatı belirleme rehberimize](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) bakabilirsiniz.

## Erken ödeme mantıklı mı?

Vadesi gelmemiş hakedişinizi erken almak, nakit sıkışıklığında işe yarayabilir; ama bunun bir maliyeti vardır. Karar vermeden önce maliyeti yıllık orana çevirip alternatiflerinizle karşılaştırın. Örneğin (varsayımsal) 100.000 TL'lik hakedişi 14 gün erken almak için 1.500 TL ödüyorsanız, bu 14 günlük %1,5'lik bir maliyettir; basit hesapla yıllık yaklaşık %39'a karşılık gelir (1,5 × 365 ÷ 14). Bu oranı bankanızın ticari kredi ya da kredili hesap maliyetiyle ve tedarikçinizle vade pazarlığı yapma imkânınızla karşılaştırın. Erken ödeme, sürekli başvurulan bir finansman yolu olmaktan çok, kampanya öncesi stok alımı gibi kısa süreli ihtiyaçlar için değerlendirilmelidir.

## Muhasebe tarafında dikkat edilecekler

Hakediş yalnız nakit konusu değildir; muhasebe kayıtlarınızın da doğru olması gerekir. Pazaryeri, komisyon ve hizmet bedelleri için size fatura keser; bu faturalardaki KDV'yi indirim konusu yapabilirsiniz. Kargo, reklam ve ceza gibi kesintiler de ayrı faturalarla gelir. Stopaj ise sizin adınıza vergi dairesine yatırılır ve yıllık gelir ya da kurumlar vergisi beyanınızda mahsup edilir.

Ay sonunda mali müşavirinize satış faturalarınızla birlikte pazaryerinin kestiği tüm faturaları, stopaj kesintilerinin dökümünü ve cari hesap ekstrenizi iletin. Satış tutarını hakediş olarak, yani kesintiler düşülmüş net tutar üzerinden kaydetmek sık yapılan bir hatadır: satış brüt tutarla, kesintiler ise kendi faturalarıyla ayrı ayrı kaydedilmelidir. Kayıt yönteminin ayrıntıları için mali müşavirinizin yönlendirmesini esas alın.

## Hakedişi ve kesilen faturaları tek ekranda görün

Her hafta ekstre indirip sipariş sipariş eşleştirmek, sipariş sayısı arttıkça saatler süren bir işe dönüşür. Birden fazla pazaryerinde satıyorsanız her kanalın ekstresi farklı biçimdedir.

Hastürk CRM'in [gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümündeki **hakediş takvimi**, hangi satışın parasının ne zaman hesabınıza geçeceğini ve ödenen ile bekleyen hakedişleri gösterir. Trendyol ve Hepsiburada'nın kestiği komisyon, kargo, reklam ve ceza faturaları kendiliğinden panele çekilir; kargo ücreti tahmini değil faturadaki gerçek tutarla siparişe işlenir. Böylece her siparişin net kârını ve hakedişini aynı yerde görür, farkları ekstre ekstre aramak zorunda kalmazsınız.

Hakediş takvimi ve kesilen faturalar [Profesyonel ve Kurumsal paketlerde](/paketler) yer alır. Panelin nasıl çalıştığını [canlı demoda](/demo) görebilir, kendi [Trendyol mağazanızı](/entegrasyonlar/trendyol) bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Hakediş ne demek?

Pazaryerinde yaptığınız satışlardan komisyon, kargo, hizmet bedeli, stopaj ve diğer kesintiler düşüldükten sonra pazaryerinin size ödeyeceği net tutardır. Hakediş kâr değildir; kârı bulmak için alış maliyetini ve KDV farkını da düşmeniz gerekir.

### Trendyol ödemeleri hangi gün yatar?

Trendyol'un geliştirici dokümanına göre istisnalar dışında, ilgili hafta içinde vadesi dolan siparişler için her çarşamba ödeme emri oluşturulur. Vade süresi kategoriye ve sözleşmenize göre değişir; paranın bankanıza geçtiği günü ve kendi vadenizi satıcı panelinizin finans bölümünden kontrol edin.

### Vade neden teslim tarihinden başlıyor?

Pazaryerleri ödemeyi müşteriye teslim edilmiş siparişler üzerinden yapar; teslim edilmeyen ya da iptal edilen siparişin tutarı satıcıya geçmez. Bu yüzden zamanında kargolamak, paranızın da daha erken hesabınıza geçmesini sağlar.

### İade edilen siparişin parası nasıl düşülür?

İade onaylandığında cari hesabınıza iade kaydı düşülür: satış tutarı geri alınır, daha önce kesilen komisyon da mahsup edilir. Bu kayıtlar ödemelerinizden mahsup edilir; ekstrenizde iade kaydını sipariş numarasıyla eşleştirerek takip edebilirsiniz. Gidiş ve dönüş kargo ücretleri ise genellikle satıcıda kalır.

### Hakedişim eksik yattı, ne yapmalıyım?

Önce cari hesap ekstrenizi sipariş bazında indirip beklediğiniz tutarla karşılaştırın; farkın önceki döneme ait bir kesinti faturasından mı, kargo desisinden mi yoksa iadeden mi kaynaklandığını bulun. Açıklayamadığınız farklar için kanıtlarınızla birlikte pazaryerinin satıcı destek kanalından kayıt açın.

### Mutabakat ne sıklıkla yapılmalı?

Ödemeleri haftalık alıyorsanız haftalık, değilse en az ayda bir kez. Sipariş sayınız arttıkça küçük farklar büyük tutarlara ulaştığı için mutabakatı düzenli bir rutin haline getirmek önemlidir.
`,
  },
  {
    slug: "kendi-e-ticaret-sitesi-mi-pazaryeri-mi",
    title: "Kendi E-Ticaret Siteniz mi, Pazaryeri mi? Avantajlar, Maliyetler ve İkisini Birlikte Yönetmek",
    seo_title: "E-Ticaret Sitesi mi Pazaryeri mi? Maliyet Karşılaştırması",
    seo_desc: "Kendi e-ticaret siteniz mi, pazaryeri mi daha kârlı? Maliyet karşılaştırması, sipariş başına kâr örneği, yasal yükümlülükler ve çok kanallı satış. Okuyun.",
    summary: "Pazaryeri hazır trafik ve hızlı başlangıç sunar; kendi siteniz ise komisyonsuz satış, marka ve müşteri ilişkisi. İki modeli maliyet ve risk açısından karşılaştırıyor, sipariş başına kâr örneği veriyor ve ikisini birlikte yönetmenin yollarını anlatıyoruz.",
    tags: ["E-Ticaret Sitesi","Pazaryeri","Çok Kanallı Satış","Strateji"],
    cover: "site-mi-pazaryeri-mi-kapak.jpg",
    body: `Kendi e-ticaret siteniz mi, pazaryeri mi sorusunun çoğu satıcı için doğru cevabı "biri ya da diğeri" değil, **"önce pazaryeri, büyüdükçe ikisi birlikte"**dir. Pazaryerleri hazır trafik ve müşteri güveni sunar; satışa günler içinde başlarsınız ama her satıştan komisyon ödersiniz ve müşteri ilişkisi pazaryerinde kalır. Kendi siteniz ise komisyonsuz satış, marka ve müşteri verisi sağlar; ama ziyaretçiyi getirmek sizin işinizdir ve bunun bir maliyeti vardır. Hangisinin daha kârlı olduğunu belirleyen asıl rakam, sitenizde **bir siparişi kazanmak için harcadığınız pazarlama maliyetidir**.

Bu yazıda iki modeli maliyet, kontrol ve risk açısından karşılaştırıyor, sipariş başına örnek bir kâr hesabı yapıyor, kendi sitenizi açmadan önce yerine getirmeniz gereken yasal yükümlülükleri sıralıyor ve ikisini birlikte yönetmenin pratik yollarını anlatıyoruz.

## Hızlı karşılaştırma

| Konu | Pazaryeri | Kendi siteniz |
| --- | --- | --- |
| Trafik | Hazır; alıcılar ürünü zaten orada arıyor | Sizin getirmeniz gerekir (reklam, içerik, sosyal medya) |
| Başlangıç | Mağaza açmak hızlıdır | Altyapı, tasarım, ödeme ve kargo kurulumu gerekir |
| Satış başına kesinti | Komisyon, hizmet bedeli, pazaryeri kargo tarifesi | Ödeme altyapısı kesintisi, kendi kargo anlaşmanız |
| Müşteri ilişkisi | Pazaryerinde kalır | Sizdedir; tekrar satış ve iletişim mümkündür |
| Marka | Ürününüz diğer satıcılarla yan yana | Tamamen sizin tasarımınız ve deneyiminiz |
| Fiyat ve rekabet | Aynı ürünü satan satıcılarla doğrudan fiyat rekabeti | Fiyatı siz belirlersiniz; rakip bir tık uzaktadır |
| Kurallar | Pazaryerinin kurallarına ve değişikliklerine bağlısınız | Kuralları yasal sınırlar içinde siz koyarsınız |
| Tahsilat | Pazaryeri tahsil eder, vadeyle öder | Ödeme altyapınızın koşullarına göre |

Tablodaki satırların hiçbiri tek başına karar verdirmez. Pazaryeri ile site arasındaki seçim, ürününüze, markanızın gücüne ve pazarlamaya ayırabileceğiniz bütçeye bağlıdır.

## Pazaryerinde satmanın artıları ve eksileri

**Artıları:**

- **Hazır talep:** Müşteri ürünü pazaryerinde zaten arıyor. Satış için ayrıca ziyaretçi getirmeniz gerekmez.
- **Güven:** Müşteri, tanımadığı bir mağazadan değil, bildiği bir platformdan alışveriş yapar.
- **Hızlı başlangıç ve düşük sabit maliyet:** Mağaza açmak için altyapı, tasarım ve ödeme sistemi kurmanız gerekmez. Trendyol için süreci [Trendyol mağaza açma rehberimizde](/blog/trendyol-magaza-acma-rehberi) anlattık.
- **Hazır operasyon:** Ödeme tahsilatı, anlaşmalı kargo ve müşteri hizmetlerinin bir kısmı pazaryeri tarafından sağlanır.

**Eksileri:**

- **Komisyon ve kesintiler:** Her satıştan kategori komisyonu, sipariş başına hizmet bedeli ve kargo düşülür.
- **Fiyat rekabeti:** Aynı ürünü satan satıcılarla aynı sayfada yarışırsınız; buybox için fiyat baskısı yüksektir.
- **Müşteri sizin değil:** Müşteriyle iletişiminiz pazaryerinin izin verdiği kanallarla sınırlıdır; tekrar satış için müşteriye doğrudan ulaşamazsınız.
- **Bağımlılık:** Komisyon, kargo ve kampanya kuralları pazaryerinin kararıyla değişir. Tüm satışınız tek pazaryerindeyse bu değişikliklerden doğrudan etkilenirsiniz.
- **Vade:** Satışın parası teslimat ve vade sonrasında hesabınıza geçer.

## Kendi e-ticaret sitenizin artıları ve eksileri

**Artıları:**

- **Daha yüksek marj potansiyeli:** Pazaryeri komisyonu yoktur. Ödeme altyapısı kesintisi ve kargo yine vardır ama satış başına kesinti genellikle daha düşüktür.
- **Müşteri ilişkisi ve veri:** Müşterinin iletişim bilgisi, alışveriş geçmişi ve tercihleri sizdedir. İzin alarak e-posta ve kampanya iletişimi yapabilir, tekrar satış alabilirsiniz.
- **Marka:** Ürün sunumu, paketleme ve müşteri deneyimi tamamen sizin kontrolünüzdedir.
- **Kuralları siz koyarsınız:** Kampanya, sepet indirimi, ücretsiz kargo eşiği ve ürün yelpazesine kendiniz karar verirsiniz.

**Eksileri:**

- **Trafik maliyeti:** Sitenize gelen her ziyaretçinin bir maliyeti vardır: reklam, içerik üretimi, arama motoru optimizasyonu ya da sosyal medya emeği.
- **Güven oluşturmak zaman alır:** Yeni bir sitede müşteri, bildiği bir pazaryerine göre daha temkinlidir.
- **Daha fazla iş:** Ödeme altyapısı, kargo anlaşması, müşteri hizmetleri, iade süreci ve yasal yükümlülükler sizin sorumluluğunuzdadır.
- **Sabit giderler:** Altyapı aboneliği ya da barındırma, tema, entegrasyon ve bakım, satış olsa da olmasa da ödenir.

## Kendi sitenizin gerçek maliyeti

Kendi sitenizin maliyetini hesaplarken üç grup gideri ayrı ele alın:

| Gider grubu | Örnekler | Nasıl davranır? |
| --- | --- | --- |
| Sabit giderler | Altyapı aboneliği ya da barındırma, alan adı, tema, entegrasyonlar, bakım | Satış adedinden bağımsız, aylık ya da yıllık |
| Sipariş başına giderler | Ödeme altyapısı kesintisi, kargo, ambalaj | Her siparişte |
| Müşteri edinme | Reklam, içerik, kampanya, iş birlikleri | Siparişe bölündüğünde sitenin kârlılığını belirler |

Ödeme altyapısı kesintisi, taksit seçenekleri ve hesaba geçiş süresi sağlayıcıdan sağlayıcıya ve anlaşmanıza göre değişir. Teklif alırken bu üç koşulu birlikte karşılaştırın. Kargo tarafında ise pazaryerinin anlaşmalı tarifesi yerine kendi anlaşmanızla çalışırsınız; kendi anlaşmanızı nasıl yapacağınızı [kargo maliyetini düşürme rehberimizde](/blog/e-ticarette-kargo-maliyeti-dusurme) anlattık.

### Kendi sitenizi açmadan önce yasal yükümlülükler

Kendi sitenizden satış yapmak, pazaryerinde satışa göre size ek yasal yükümlülükler getirir. Başlıcaları şunlardır:

- **ETBİS kaydı:** Kendi elektronik ticaret ortamında faaliyet gösteren işletmeler, Ticaret Bakanlığı'nın Elektronik Ticaret Bilgi Sistemi'ne (ETBİS) faaliyete başlamadan önce kayıt olmakla yükümlüdür. Kayıt e-Devlet üzerinden yapılır; bilgilerinizde değişiklik olduğunda bildirim yapmanız gerekir.
- **Mesafeli satış belgeleri:** Müşteriye satış öncesinde ön bilgilendirme formu sunmanız ve mesafeli satış sözleşmesi kurmanız gerekir. Tüketicinin 14 günlük cayma hakkını ve kullanma koşullarını açıkça belirtmelisiniz.
- **Kişisel verilerin korunması:** Müşteri verilerini işlediğiniz için KVKK kapsamında aydınlatma metni sunmanız, çerez kullanımı ve ticari ileti izinleri konusunda mevzuata uygun hareket etmeniz gerekir.
- **Fatura:** Satışlarınız için mevzuata uygun fatura (e-fatura ya da e-arşiv fatura) düzenlemelisiniz.

Bu yükümlülüklerin ayrıntıları işletmenizin durumuna göre değişebileceği için kurulum aşamasında mali müşavirinizden ve gerekiyorsa bir hukukçudan destek almanızı öneririz.

### Yeni bir sitede güven oluşturmak

Pazaryerinde müşteri platforma güvenir; kendi sitenizde ise güveni siz oluşturmalısınız. Yeni sitelerde dönüşüm oranını en çok etkileyen unsurlar şunlardır:

- **Açık iletişim bilgileri:** Şirket unvanı, adres, telefon ve e-posta kolayca bulunmalıdır.
- **Açık teslimat ve iade koşulları:** Kargoya veriliş süresi, kargo ücreti ve iade süreci ürün sayfasından ve sepetten görülebilmelidir.
- **Güvenli ödeme:** Tanınan bir ödeme altyapısı ve güvenli bağlantı (HTTPS) müşterinin ilk sorgusudur.
- **Gerçek ürün bilgisi:** Net fotoğraflar, ölçüler, malzeme ve kullanım bilgisi hem güveni hem de iade oranını etkiler.
- **Gerçek müşteri yorumları:** Yalnız gerçek alışverişlere dayanan yorumları yayımlayın; uydurma yorum hem güveni zedeler hem de tüketiciyi yanıltan bir uygulama olarak yaptırım riski taşır.

## Örnek: aynı ürün, iki kanal, sipariş başına kâr

Aşağıdaki örnekte tüm oran ve tutarlar **varsayımsaldır** ve hesap KDV hariç tutarlarla yapılmıştır. Ürün %20 KDV'li, alış maliyeti 400 TL (KDV dahil) ve iki kanalda da 879,90 TL'ye satılıyor.

- **Pazaryeri:** Komisyon %20 + KDV, kargo 80 TL, hizmet bedeli 13 TL (KDV dahil).
- **Kendi site:** Ödeme altyapısı kesintisi satış tutarının %3'ü, kendi kargo anlaşmanızla kargo 65 TL (KDV dahil), sipariş başına reklam maliyeti 120 TL. Basitlik için ödeme kesintisini ve reklamı KDV indirimi olmayan gider olarak aldık.

| Kalem (KDV hariç) | Pazaryeri | Kendi site |
| --- | --- | --- |
| Satış (879,90 ÷ 1,20) | 733,25 TL | 733,25 TL |
| Komisyon | −175,98 TL | — |
| Ödeme altyapısı kesintisi | — | −26,40 TL |
| Kargo | −66,67 TL | −54,17 TL |
| Hizmet bedeli | −10,83 TL | — |
| Sipariş başına reklam | — | −120,00 TL |
| Alış maliyeti | −333,33 TL | −333,33 TL |
| **Kâr** | **146,44 TL** | **199,35 TL** |

Bu örnekte site daha kârlı görünüyor. Ama tablonun en hassas satırı **sipariş başına reklam maliyeti**dir. Aynı hesapta bu maliyet 172,91 TL'ye çıktığında iki kanalın kârı eşitlenir; 200 TL olduğunda sitenin kârı 119,35 TL'ye düşer ve pazaryerinin gerisinde kalır.

Buradan çıkan sonuç şudur: kendi sitenin kârlılığı, bir siparişi kazanmak için ne harcadığınıza bağlıdır. Bu maliyeti düşüren en güçlü etken ise **tekrar eden müşteridir**. İlk siparişi reklamla kazandığınız müşteri ikinci ve üçüncü siparişini doğrudan sitenize gelerek verirse, sipariş başına ortalama pazarlama maliyetiniz belirgin biçimde düşer. Pazaryerinde ise her siparişte komisyon yeniden ödenir. Kendi rakamlarınızla karşılaştırma için [satış fiyatı belirleme rehberimizdeki](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) formülü ve [pazaryeri kâr karşılaştırma aracını](/araclar/kar-karsilastirma) kullanabilirsiniz.

## Hangisi kimin için daha uygun?

- **Yeni başlıyorsanız:** Pazaryeri. Talebi test etmek, hangi ürünün sattığını görmek ve ilk nakit akışını oluşturmak için en hızlı yoldur.
- **Başkalarının da sattığı ürünleri satıyorsanız:** Pazaryeri ağırlıklı. Aynı ürün için müşteriyi sitenize çekmek zordur; fiyat karşılaştırması bir tık uzaktadır.
- **Kendi markanız ya da özgün ürünleriniz varsa:** Pazaryeri ile başlayıp siteye erken yatırım yapın. Marka arayan müşteri, sitenize doğrudan gelir.
- **Tekrar satın alınan ürünler satıyorsanız:** Kozmetik, gıda, evcil hayvan ürünleri gibi düzenli tüketilen ürünlerde müşteri ilişkisinin değeri yüksektir; kendi siteniz bu değeri size bırakır.
- **Tek bir pazaryerine bağımlıysanız:** İkinci bir pazaryeri ve kendi siteniz, kural değişikliklerine karşı riskinizi dağıtır.

## İkisini birlikte yönetmek

Çok kanallı satışın önündeki en büyük engel operasyondur. Pazaryeri ve site birlikte çalıştığında dört konuda düzen kurmanız gerekir:

1. **Stok:** Aynı stok birden fazla kanalda satıldığında, bir kanalda satılan ürünün stoğu diğerlerinde de hemen düşmelidir; aksi halde fazla satış ve iptal kaçınılmazdır.
2. **Sipariş:** Siparişler farklı panellerden gelir. Tek bir listede toplanmadığında gözden kaçan sipariş gecikmeye dönüşür.
3. **Fiyat:** Kanallar arasındaki fiyat farkına bilinçli karar verin. Pazaryerinde kesintiler daha yüksekse fiyat da daha yüksek olabilir; sitede ise sadık müşteri için avantaj sunabilirsiniz.
4. **Kâr takibi:** Her kanalın kesintileri farklı olduğu için kanal bazında net kârı ayrı izlemelisiniz. Pazaryerlerinde paranın ne zaman hesabınıza geçtiğini de takip etmeniz gerekir; ayrıntılar [hakediş rehberimizde](/blog/pazaryeri-hakedis-nedir-ne-zaman-yatar).

Bir uyarı: pazaryerinden gelen siparişlerde müşteriyi kendi sitenize yönlendirmeye çalışmak (örneğin pakete sitenizin indirim kuponunu koymak) pazaryeri kurallarına aykırı olabilir. Böyle bir uygulamadan önce satıcı sözleşmenizi ve pazaryerinin güncel kurallarını kontrol edin. Kendi sitenizin müşterisini ise sitenizin kendi kanallarıyla, izinli iletişimle büyütün.

### Altyapı seçerken nelere bakmalı?

Kendi siteniz için hazır bir e-ticaret altyapısı (aylık abonelikle kullanılan, barındırma ve güncellemeleri sağlayıcının yaptığı sistemler) ya da WooCommerce gibi kendi sunucunuza kurduğunuz açık kaynak bir çözüm seçebilirsiniz. Hazır altyapılar kurulum ve bakım yükünü azaltır; açık kaynak çözümler daha fazla esneklik sunar ama teknik sorumluluğu size bırakır. Seçerken şu sorulara cevap arayın: Ödeme ve kargo entegrasyonları hazır mı? Pazaryerlerinizle stok ve sipariş entegrasyonu kurulabiliyor mu? Toplam aylık maliyet, ek modüllerle birlikte ne tutuyor? Verilerinizi gerektiğinde dışa aktarabiliyor musunuz?

## Pazaryerinden siteye geçiş planı: 6 adım

1. **Pazaryerinde talebi doğrulayın.** Hangi ürünlerin sattığını, hangi fiyatta ve hangi marjla sattığını görün.
2. **Kanal bazında kârınızı hesaplayın.** Pazaryerindeki gerçek net kârınızı bilmeden sitenin daha kârlı olup olmayacağını söyleyemezsiniz.
3. **Siteyi en çok satan ürünlerle açın.** Tüm kataloğu bir anda taşımak yerine kanıtlanmış ürünlerle başlayın.
4. **Müşteri edinme bütçesi belirleyin.** Sipariş başına kabul edebileceğiniz en yüksek reklam maliyetini yukarıdaki hesapla bulun ve reklamlarınızı bu sınırla yönetin.
5. **Stok ve siparişi tek yerden yönetin.** Kanallar arasında stok eşitlemesi kurmadan siteyi açmak, fazla satış riskini beraberinde getirir.
6. **Tekrar satışa yatırım yapın.** İzinli e-posta listesi, sadakat avantajları ve iyi bir teslimat deneyimi, sitenin uzun vadeli kârlılığını belirler.

Çok kanallı satışın genel mantığını [pazaryeri entegrasyonu rehberimizde](/blog/pazaryeri-entegrasyonu-nedir) ayrıca anlattık.

## Pazaryeri ve sitenizi tek panelden yönetin

Hastürk CRM, pazaryerlerinizi ve e-ticaret sitenizi aynı panele bağlar. [ikas](/entegrasyonlar/ikas) ve [WooCommerce](/entegrasyonlar/woocommerce) sitelerinizin siparişleri pazaryeri siparişlerinizle aynı listeye gelir; Shopify, OpenCart, Ticimax, IdeaSoft ve T-Soft entegrasyonları ise test aşamasındadır. [Stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) sayesinde bir kanalda satılan ürünün yeni stoğu, stok gönderimini açtığınız tüm kanallara (sitenize ve pazaryerlerinize) gider. ikas sitenizin ürünleri, kategorileri, görselleri ve varyantları pazaryerlerine ürün yüklerken ana katalog olarak kullanılabilir; ikas siparişlerini ikas Kargo ile gönderirsiniz.

Gelir, gider ve kâr-zarar bölümünde her siparişin, her ürünün ve her kanalın net kârını görür; raporlarda hangi kanalın ne kadar sattığını ve hangisinin daha kârlı olduğunu karşılaştırırsınız. Panelin nasıl çalıştığını [canlı demoda](/demo) görebilir, mağazalarınızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### E-ticaret sitesi mi pazaryeri mi daha kârlı?

Sipariş başına kesinti genellikle kendi sitenizde daha düşüktür; ama sitenize ziyaretçi getirmenin bir maliyeti vardır. Sitenin daha kârlı olup olmayacağını, bir siparişi kazanmak için harcadığınız pazarlama maliyeti ve müşterilerinizin tekrar alışveriş oranı belirler.

### Yeni başlayan biri önce site mi kurmalı, pazaryerinde mi satmalı?

Çoğu durumda önce pazaryeri. Hazır talep sayesinde ürünlerinizi hızla test eder, hangi ürünün sattığını görür ve nakit akışı oluşturursunuz. Talebi doğruladıktan sonra en çok satan ürünlerinizle kendi sitenizi açabilirsiniz.

### Kendi sitemde satış yapmak için ETBİS kaydı gerekli mi?

Evet. Kendi elektronik ticaret ortamında faaliyet gösteren işletmelerin, faaliyete başlamadan önce Ticaret Bakanlığı'nın Elektronik Ticaret Bilgi Sistemi'ne (ETBİS) kayıt olması gerekir. Kayıt e-Devlet üzerinden yapılır.

### Pazaryerinde ve sitemde aynı fiyattan mı satmalıyım?

Zorunlu değildir. Kanalların kesintileri farklı olduğu için aynı fiyat farklı kâr bırakır. Birçok satıcı kanallar arasında sabit bir fiyat farkı belirler. Hangi yolu seçerseniz seçin, her kanalda başabaş fiyatınızın üstünde kaldığınızı kontrol edin.

### Pazaryeri müşterisini kendi siteme yönlendirebilir miyim?

Pazaryeri siparişlerinde müşteriyi kendi sitenize yönlendiren uygulamalar pazaryeri kurallarına aykırı olabilir ve yaptırıma yol açabilir. Satıcı sözleşmenizi ve pazaryerinin güncel kurallarını kontrol edin; kendi sitenizin müşteri kitlesini sitenin kendi kanallarıyla büyütün.

### Site ve pazaryeri stoklarını nasıl eşit tutarım?

Ürünleri tek bir ürün kartında tutup her satıştan sonra yeni stoğu tüm kanallara gönderen bir entegrasyon kullanarak. Excel ya da elle güncelleme, sipariş sayısı arttığında fazla satışa yol açar.
`,
  },
];
