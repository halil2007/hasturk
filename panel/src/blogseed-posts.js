// Hazır blog yazıları (bkz. blogseed.js). Gövde Markdown (public/blogmd.js); yazı içi görseller https adresiyle, kapak site/public/img/blog/ altındaki dosya adıyla.
// Sıra: en eski → en yeni (yayın tarihleri blogseed.js'te geriye doğru dağıtılır).
export const POSTS = [
  {
    slug: "desi-nedir-nasil-hesaplanir",
    title: "Desi Nedir, Nasıl Hesaplanır? Kargo Desi Hesaplama Rehberi ve Örnekler",
    seo_title: "Desi Nedir? Kargo Desi Hesaplama Formülü ve Örnekler",
    seo_desc: "Desi nasıl hesaplanır? En × boy × yükseklik ÷ 3000 formülü, örnek tablo, pazaryeri kargo ücretleri ve desiyi düşürmenin 8 yolu. Ücretsiz aracı deneyin.",
    summary: "Desi, kargo paketinin hacminin ağırlık karşılığıdır: en × boy × yükseklik (cm) ÷ 3000. Formülü örneklerle anlatıyor, pazaryerlerinde kargo ücretine etkisini ve desiyi düşürerek kargo maliyetini azaltmanın pratik yollarını paylaşıyoruz.",
    tags: ["Kargo","Desi","Pazaryeri","Maliyet"],
    cover: "desi-nedir-kapak.jpg",
    body: `Desi, bir kargo paketinin kapladığı hacmin ağırlık karşılığıdır ve kargo ücretinin hesaplanmasında kullanılır. Yurt içi kargoda desi, paketin **en × boy × yükseklik** ölçülerinin santimetre cinsinden çarpılıp **3000'e bölünmesiyle** bulunur. Kargo firması bu değeri paketin gerçek ağırlığıyla (kg) karşılaştırır ve **hangisi büyükse ücreti ona göre** hesaplar. Örneğin 30 × 20 × 15 cm ölçülerindeki 2 kg'lık bir koli 9.000 ÷ 3000 = 3 desidir; desi ağırlıktan büyük olduğu için ücret 3 desi üzerinden alınır.

Bu rehberde desinin ne olduğunu, nasıl hesaplandığını, pazaryerlerinde kargo ücretini nasıl etkilediğini ve desiyi düşürerek kargo maliyetinizi nasıl azaltabileceğinizi örneklerle anlatıyoruz. Hesabı hemen yapmak isterseniz [desi hesaplama aracımız](/araclar/desi-hesaplama) ücretsizdir, birden fazla koliyi de hesaplar.

## Desi nedir?

Kargo araçlarının kapasitesi yalnız ağırlıkla değil, hacimle de sınırlıdır. Büyük ama hafif bir koli (örneğin bir yastık) araçta çok yer kaplar, ama tartıda neredeyse hiç ağırlık göstermez. Küçük ama ağır bir koli (örneğin bir kutu cıvata) ise az yer kaplar ama ağırdır. Kargo firmaları bu iki durumu adil biçimde fiyatlayabilmek için hacmi bir ağırlık birimine çevirir: buna **desi** denir.

Kısacası desi, "bu paket araçta ne kadar yer kaplıyorsa, o kadar ağırmış gibi" ücretlendirilmesini sağlar. Kargo ücretine esas alınan değere de **ücrete esas ağırlık** denir.

## Desi nasıl hesaplanır?

![Desi hesaplama formülü](https://hasturkcrm.com/img/blog/desi-formulu.jpg "Desi = En × Boy × Yükseklik ÷ 3000; ücrete esas değer desi ile ağırlıktan büyük olanıdır")

**Desi = En (cm) × Boy (cm) × Yükseklik (cm) ÷ 3000**

Hesap üç adımdan oluşur:

1. **Paketi ölçün.** Kolinin dış ölçülerini santimetre cinsinden ölçün. Şişkin ya da düzensiz paketlerde en geniş noktayı alın; kargo firması da öyle ölçer.
2. **Ölçüleri çarpıp 3000'e bölün.** Çıkan sonuç paketin desisidir. Küsuratlı sonuçlar kargo firmalarınca genellikle bir üst tam desiye yuvarlanır.
3. **Gerçek ağırlıkla karşılaştırın.** Paketi tartın. Desi ile kilogram cinsinden ağırlıktan hangisi büyükse, kargo ücreti o değer üzerinden hesaplanır.

### Neden 3000'e bölünüyor?

Bölen, kargo firmasının kaç santimetreküp hacmi 1 kilograma eşit saydığını gösterir. 3000 böleni, 3.000 cm³'lük hacmin 1 desi kabul edildiği anlamına gelir. Türkiye'de yurt içi kargo firmalarının ve pazaryerlerinin anlaşmalı kargo hesaplarının büyük çoğunluğu 3000 bölenini kullanır. Yurt dışı ve bazı ekspres gönderilerde 4000 ya da 5000 gibi farklı bölenler kullanılabilir. Kendi kargo anlaşmanızla çalışıyorsanız sözleşmenizdeki böleni ve yuvarlama kuralını mutlaka kontrol edin.

## Örneklerle desi hesaplama

| Paket ölçüsü (cm) | Hacim (cm³) | Desi | Gerçek ağırlık | Ücrete esas |
| --- | --- | --- | --- | --- |
| 30 × 20 × 15 | 9.000 | 3 | 2 kg | 3 desi |
| 25 × 20 × 10 | 5.000 | 1,67 → 2 | 3 kg | 3 kg |
| 40 × 30 × 25 | 30.000 | 10 | 4 kg | 10 desi |
| 60 × 40 × 40 | 96.000 | 32 | 12 kg | 32 desi |
| 20 × 15 × 5 | 1.500 | 0,5 → 1 | 0,3 kg | 1 desi |

İkinci satırdaki küçük ama ağır paket, desisinden çok ağırlığıyla ücretlendirilir. Dördüncü satırdaki büyük koli ise 12 kg olmasına rağmen 32 desi üzerinden fiyatlanır. Mobilya, ev tekstili, oyuncak ve ambalajı hacimli ürünlerde kargo maliyetinin yüksek çıkmasının nedeni budur.

### Birden fazla koli gönderirken

Aynı siparişte birden fazla koli varsa her koli ayrı ölçülür ve her birinin desi ile ağırlığından büyük olanı alınır; sonra bunlar toplanır. Bazı kargo anlaşmalarında toplam desi ile toplam ağırlık karşılaştırılabilir. Hangi yöntemin uygulandığını anlaşmanızdan öğrenin. [Desi hesaplama aracımızda](/araclar/desi-hesaplama) birden fazla koli ekleyerek her iki toplamı da görebilirsiniz.

## Paketi doğru ölçmek

Desi hesabı ancak ölçü doğruysa işe yarar. Kargo firması paketi şubede ya da aktarma merkezinde kendi cihazıyla ölçer; sizin ölçünüz bundan farklıysa faturada beklemediğiniz bir desiyle karşılaşırsınız. Doğru ölçüm için:

- **Paketi kapattıktan sonra ölçün.** Bant, dolgu ve etiket eklendikten sonraki son hali esas alınır.
- **En geniş noktayı alın.** Kapak tam kapanmayan, ortası şişmiş ya da yanlarından taşan kolilerde en dıştaki noktayı ölçün.
- **Santimetreyi yukarı yuvarlayın.** 29,6 cm'lik bir kenarı 30 cm kabul edin; kargo firması da genellikle öyle yapar.
- **Ağırlığı dijital tartıyla ölçün.** Özellikle ağırlık ile desinin birbirine yakın olduğu paketlerde birkaç yüz gramlık fark ücrete esas değeri değiştirebilir.
- **Sık gönderdiğiniz paketlerin ölçüsünü kaydedin.** Her ürün için "hangi koli, kaç desi" bilgisini bir kez not edin; hem paketlemeyi hızlandırır hem de kargo faturalarını kontrol etmeyi kolaylaştırır.

## Desi baremleri ve fiyat listeleri

Kargo firmaları ve pazaryerlerinin anlaşmalı kargo tarifeleri genellikle **desi kademeleri** halinde düzenlenir: 0–1 desi, 2 desi, 3 desi gibi küçük paketler için ayrı ayrı, daha büyük paketler için ise desi aralıkları ya da her ek desi için ek ücret şeklinde. Bu yüzden paketinizin desisi bir kademenin sınırındaysa, küçük bir ölçü değişikliği bile ücretinizi bir kademe aşağı ya da yukarı taşır.

Tarifeler firmaya, anlaşmanıza ve döneme göre değişir; bu yazıda güncelliğini yitirebilecek fiyatlar vermiyoruz. Bunun yerine sattığınız ürünler için şu küçük tabloyu bir kez hazırlamanızı öneriyoruz:

| Ürün | Kullanılan koli | Desi | Ağırlık | Ücrete esas | Güncel kargo ücreti |
| --- | --- | --- | --- | --- | --- |
| Örnek: Tişört | Kargo poşeti 30 × 25 × 3 | 1 | 0,3 kg | 1 | Tarifenizden |
| Örnek: Kupa seti | Koli 25 × 20 × 15 | 3 | 1,8 kg | 3 | Tarifenizden |
| Örnek: Masa lambası | Koli 45 × 30 × 30 | 13,5 → 14 | 3 kg | 14 | Tarifenizden |

Bu tablo, hangi ürünlerde kargonun kârınızın büyük kısmını aldığını bir bakışta gösterir ve fiyatlamada kargo maliyetini unutmamanızı sağlar.

## Yurt dışı gönderilerde hacimsel ağırlık

Yurt dışı gönderilerde aynı mantık **hacimsel ağırlık** (volumetric weight) adıyla uygulanır. Uluslararası taşıyıcılar çoğunlukla 5000 bölenini kullanır: 40 × 30 × 20 cm'lik bir koli 24.000 ÷ 5000 = 4,8 kg hacimsel ağırlık eder. Gerçek ağırlık 3 kg ise ücret 4,8 kg üzerinden, genellikle yarım ya da tam kilograma yuvarlanarak hesaplanır. Mikro ihracat ya da yurt dışı pazaryerlerine satış yapıyorsanız taşıyıcınızın bölenini ve yuvarlama kuralını mutlaka öğrenin; yurt içine göre çok daha pahalı olduğu için ambalaj optimizasyonu burada daha da önemlidir.

## Pazaryerlerinde desi ve kargo ücreti

Trendyol ve Hepsiburada gibi pazaryerlerinin anlaşmalı kargo modellerinde kargo ücreti, paketin desisine göre belirlenen fiyat listesinden hesaplanır ve satıcıya kargo faturası olarak yansıtılır. Bu yüzden desi, satıcının kârını doğrudan etkiler.

Trendyol'un Satıcı Bilgi Merkezi'ndeki açıklamaya göre kargo faturası, siparişin çıkış işlemi sırasında **kargo firmasının sisteme işlediği desi bilgisi** esas alınarak hazırlanır. Satıcı panelinden sipariş bazında desiyi ve desi karşılığında yansıyan ücreti görebilirsiniz. Ürünlerinize desi bilgisi girmeniz zorunlu değildir, ama girerseniz kargo faturalarının kontrolünde kullanılır; fazla desiden kesim yapıldığını düşünüyorsanız Trendyol'a bildirebilirsiniz.

Trendyol ayrıca belirli bir sipariş tutarının altında kalan siparişlerde **kargo baremi** uygular: bu siparişlerde desiye göre değil, sipariş tutarıyla orantılı daha düşük bir ücret yansıtılır. Satıcı Bilgi Merkezi'ndeki açıklamaya göre 10 desinin üzerindeki paketler barem desteğine dahil edilmez ve desiye göre ücretlendirilir. Barem tutarı ve kapsamı dönemsel olarak güncellendiğinden güncel değerleri satıcı panelinden kontrol edin.

Pazaryerlerinde satış süreçlerini daha ayrıntılı görmek için [Trendyol mağaza açma](/blog/trendyol-magaza-acma-rehberi) ve [Hepsiburada satıcı olma](/blog/hepsiburada-satici-olma-magaza-acma) rehberlerimize bakabilirsiniz.

## Desiyi düşürmenin 8 pratik yolu

Desi hacimle doğru orantılıdır; paketteki her boş santimetre size para olarak geri döner. Kolinin her kenarından 2 cm kısaltmak bile çoğu zaman bir ya da birkaç desi kademesi kazandırır.

1. **Ürüne göre koli seçin.** Elinizdeki tek tip büyük koliyi her ürüne kullanmak yerine birkaç farklı boyutta koli bulundurun. Örneğin 42 × 32 × 27 cm'lik bir koli 36.288 ÷ 3000 = 12,1, yani yuvarlanınca 13 desi eder; aynı ürün 40 × 30 × 25 cm'lik koliye sığıyorsa 10 desiye düşersiniz.
2. **Boş alanı azaltın.** Dolgu malzemesini, ürünü koruyacak kadar ama koliyi büyütmeyecek şekilde kullanın.
3. **Ürünü katlayın ya da sıkıştırın.** Tekstil ürünlerini katlayarak, yastık ve yorgan gibi ürünleri vakumlayarak gönderin.
4. **Kutusuz gönderim seçeneğini değerlendirin.** Kırılmayan tekstil ürünlerinde kargo poşeti, koliye göre çok daha düşük desi çıkarır.
5. **Orijinal ambalajı sorgulayın.** Bazı ürünlerin orijinal kutusu üründen çok daha büyüktür. Müşterinin ambalaj beklentisi yoksa daha küçük bir koli düşünün.
6. **Koli ölçüsünü yuvarlama sınırına göre seçin.** Küsurat bir üst desiye yuvarlandığı için, 3,05 desi çıkan bir koli 4 desi olarak ücretlendirilir. Bir kenarı birkaç milimetre küçük koli seçmek bir kademe kazandırabilir.
7. **Çok parçalı siparişleri karşılaştırın.** Bazen iki küçük koli, tek büyük koliden daha ucuza gider; bazen tersi. İki seçeneği hesaplayıp karşılaştırın.
8. **Ürün desi bilgisini doğru girin.** Pazaryerine ürünün paketlenmiş halinin ölçüsünü girin; faturadaki desiyle karşılaştırarak hatalı kesimleri yakalayın.

## Kargo maliyeti fiyatınıza nasıl yansır?

Kargo ücreti, pazaryeri satışında komisyondan sonra genellikle en büyük kesinti kalemidir; düşük fiyatlı ürünlerde ise komisyonu bile geçebilir. Bu yüzden fiyat belirlerken ürünün desisini bilmek ve kargo ücretini maliyete eklemek gerekir.

Örneğin satış fiyatı 300 TL olan bir ürünü düşünün. Paket 4 desiden 2 desiye düşürüldüğünde aradaki kargo farkı doğrudan kârınıza eklenir; bu fark yüzlerce siparişte ciddi bir tutara ulaşır. Kendi ürününüzün kargo dahil net kârını görmek için [Trendyol komisyon hesaplama](/araclar/trendyol-komisyon-hesaplama) ya da [satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama) araçlarımıza kargo tutarınızı girerek hesap yapabilirsiniz. Tüm kesintilerin örnekli hesabı için de [Trendyol komisyon ve net kâr rehberimize](/blog/trendyol-komisyon-orani-net-kar-hesaplama) göz atabilirsiniz.

## Pazaryeri anlaşmalı kargo mu, kendi anlaşmanız mı?

Pazaryerinin anlaşmalı kargosunu kullandığınızda desi tarifesi pazaryerinin anlaşmasıdır; ayrıca bir sözleşme yapmanız gerekmez ve ücret hakedişinizden düşülür. Kendi kargo anlaşmanızla çalıştığınızda ise tarifeyi, böleni ve yuvarlama kuralını kargo firmasıyla siz belirlersiniz. Gönderi hacmi yükselen satıcılar, özellikle kendi e-ticaret sitelerinden gelen siparişler için kendi anlaşmalarını yapmayı tercih edebilir. Hangisinin daha avantajlı olduğu ürünlerinizin desi dağılımına ve aylık gönderi adedinize bağlıdır; en sık gönderdiğiniz üç-dört paket ölçüsü için her iki tarifeyi yan yana koyup karşılaştırmak en sağlıklı yoldur.

## Desi ile ilgili sık yapılan hatalar

- **İç ölçüyü yazmak:** Kolinin iç değil dış ölçüsü esas alınır.
- **Şişkinliği hesaba katmamak:** Fazla doldurulmuş, şişmiş koliler kargo firmasının ölçümünde daha büyük çıkar.
- **Tek koli tipine bağlı kalmak:** Her ürünü aynı koliyle göndermek, küçük ürünlerde gereksiz desi ödemek demektir.
- **Kargo faturasını kontrol etmemek:** Faturadaki desi ile gerçek paketin desisi arasındaki farklar fark edilmezse sürekli fazla ödeme yapılır.
- **Fiyatlamada kargoyu unutmak:** Ürünün fiyatını kargo maliyetini hesaba katmadan belirlemek, özellikle hacimli ürünlerde zararına satışa yol açar.

## Gerçek kargo maliyetini her sipariş için görün

Desiyi hesaplamak bir adım; asıl önemli olan her siparişte gerçekte ne kadar kargo ödediğinizi bilmek. Hastürk CRM, Trendyol ve Hepsiburada gibi pazaryerlerinin kestiği kargo faturalarını otomatik çeker ve tahmini değil **gerçek kargo tutarını** ilgili siparişe işler. Böylece [kâr-zarar](/ozellikler/kar-zarar) ekranında her siparişin komisyon, kargo, hizmet bedeli ve stopaj sonrası net kârını görürsünüz; kargo maliyeti yüksek çıkan ürünleri kolayca fark edersiniz.

[Kargo ve etiket](/ozellikler/kargo-ve-etiket) tarafında ise pazaryerinin anlaşmalı kargosuyla gönderimde barkod doğrudan pazaryerinden alınır; etiketleri termal ya da normal yazıcıdan tek tek veya toplu basarsınız. Kendi kargo anlaşmanızla çalışıyorsanız [kargo firması entegrasyonu](/ozellikler/kargo-entegrasyonu) ile gönderiyi panelden açabilirsiniz.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### 1 desi kaç kilogramdır?

Desi bir hacim ölçüsüdür, ama kargo ücretlendirmesinde 1 desi 1 kilogram gibi değerlendirilir. 3000 böleniyle 1 desi, 3.000 cm³'lük hacme karşılık gelir; örneğin 20 × 15 × 10 cm'lik bir koli 1 desidir.

### Desi mi ağırlık mı esas alınır?

İkisinden büyük olanı. Paketin desisi 3, ağırlığı 2 kg ise ücret 3 desiden; desisi 2, ağırlığı 5 kg ise 5 kg'dan hesaplanır.

### Desi hesaplamada neden 3000'e bölünür?

Türkiye'de yurt içi kargo firmalarının çoğu 3.000 cm³'lük hacmi 1 desi kabul eder. Bölen firmaya ve gönderi türüne göre değişebilir; yurt dışı ve bazı ekspres gönderilerde 4000 ya da 5000 kullanılabilir.

### Küsuratlı desi nasıl yuvarlanır?

Kargo firmaları küsuratlı desiyi çoğunlukla bir üst tam sayıya yuvarlar; 2,1 desi çıkan bir paket 3 desi olarak ücretlendirilebilir. Yuvarlama kuralı firmaya ve anlaşmaya göre değişebileceği için anlaşmanızı kontrol edin.

### Poşetle gönderilen ürünün desisi nasıl hesaplanır?

Poşet de aynı formülle hesaplanır: dolu haldeki poşetin en geniş noktalarındaki en, boy ve yüksekliği ölçülür. Tekstil gibi ürünlerde poşet, koliye göre genellikle çok daha düşük desi çıkarır.

### Pazaryerinde kargo faturamdaki desi yanlışsa ne yapmalıyım?

Önce paketin gerçek ölçülerini kontrol edin. Faturadaki desi gerçek ölçüden büyükse, pazaryerinin satıcı panelindeki sipariş bazlı kargo detaylarıyla birlikte pazaryerine bildirin. Ürünlerinize doğru desi bilgisi girmek bu kontrolü kolaylaştırır.
`,
  },
  {
    slug: "e-ticarette-stok-takibi-fazla-satis",
    title: "E-Ticarette Stok Takibi: Çok Kanallı Satışta Fazla Satışı Önleme Rehberi",
    seo_title: "E-Ticarette Stok Takibi: Fazla Satışı Önleme Rehberi",
    seo_desc: "Trendyol, Hepsiburada ve sitenizde aynı stoğu satarken fazla satışı önleyin: stok senkronizasyonu, yeniden sipariş noktası ve kontrol listesi. Okuyun.",
    summary: "Aynı stoğu birden fazla pazaryerinde ve kendi sitenizde satarken fazla satış nasıl önlenir? Stok takibinin temel kurallarını, yöntemlerin karşılaştırmasını, yeniden sipariş noktası hesabını ve uygulanabilir bir kontrol listesini paylaşıyoruz.",
    tags: ["Stok Yönetimi","Çok Kanallı Satış","Pazaryeri","Entegrasyon"],
    cover: "stok-takibi-kapak.jpg",
    body: `E-ticarette stok takibi, elinizdeki ürün adetlerinin satış yaptığınız her kanalda doğru ve güncel görünmesini sağlama işidir. Tek bir kanalda satarken bu iş görece kolaydır; ama aynı stoğu Trendyol, Hepsiburada, N11 ve kendi sitenizde aynı anda sattığınızda, bir kanalda satılan ürünün diğer kanallarda da hemen düşmesi gerekir. Bu yapılmazsa elinizde olmayan ürünü satarsınız (fazla satış), siparişi iptal etmek zorunda kalırsınız ve mağaza puanınız düşer. Çözüm, tüm kanalların stoğunu tek bir ürün kartından yöneten **stok senkronizasyonudur**.

Bu rehberde fazla satışın neden oluştuğunu, stok takibini doğru kurmanın temel kurallarını, yöntemlerin karşılaştırmasını ve uygulanabilir bir kontrol listesini paylaşıyoruz.

## Fazla satış (overselling) nedir, neden olur?

Fazla satış, stokta bulunandan daha fazla ürünün satılmasıdır. Çok kanallı satışta en sık şu nedenlerle ortaya çıkar:

- **Stoğun kanallara ayrı ayrı girilmesi:** Elinizde 5 adet ürün var ve her pazaryerine "5" yazdınız. Toplamda 5 değil, 15 adet satılabilir görünür.
- **Elle güncellemenin gecikmesi:** Bir kanalda satış oldu, ama diğer kanallardaki stoğu ancak akşam güncelleyebildiniz. Arada geçen sürede gelen siparişler fazla satış olur.
- **Eşzamanlı satış:** Son kalan ürün aynı dakikalarda iki farklı kanalda satılır.
- **İadelerin ve iptallerin stoğa yansımaması:** İade gelen sağlam ürün stoğa geri eklenmez ya da iptal edilen siparişin ürünü serbest bırakılmaz; bu kez tersine, elinizde olan ürün "tükendi" görünür.
- **Depo ile sistem arasındaki fark:** Kırık, kayıp ya da yanlış yere konmuş ürünler sistemde stokta görünmeye devam eder.

### Fazla satışın maliyeti

Fazla satışın doğrudan maliyeti, iptal ettiğiniz siparişin kaybıdır. Asıl maliyet ise dolaylıdır: satıcı kaynaklı iptaller pazaryerlerinde mağaza performansınızı düşürür, bazı pazaryerlerinde tedarik edememe için yaptırım uygulanabilir, müşteri olumsuz yorum bırakır ve sonraki satışlarınızda görünürlüğünüz azalır. Bu yüzden fazla satışı önlemek, sadece bir sipariş kurtarmak değil, mağazanın uzun vadeli sağlığını korumaktır.

## Stok takibinin 5 temel kuralı

![Stok senkronizasyonu: bir kanalda satış, her kanalda düşüş](https://hasturkcrm.com/img/blog/stok-senkronizasyon.jpg "Tek ürün kartındaki stok, satıştan sonra tüm kanallara gönderilir")

### 1. Tek gerçek stok, tek ürün kartı

Bir ürünün stoğu tek bir yerde tutulmalı ve kanallara oradan dağıtılmalıdır. Her kanala ayrı stok girmek, fazla satışın en temel nedenidir. Ürün kartınız "gerçeğin tek kaynağı" olmalı; kanallardaki stok adetleri bu karttan türetilmelidir.

### 2. Her varyanta benzersiz barkod ve stok kodu

Aynı ürünün farklı kanallardaki ilanlarını birbirine bağlamanın en güvenilir yolu barkod ve stok kodudur (SKU). Her renk ve beden kombinasyonuna ayrı, kanallar arasında aynı barkod verin. "Mavi M beden" ile "Mavi L beden" aynı barkodu taşıyorsa, stoklarınız hiçbir zaman doğru olmaz.

### 3. Satıştan sonra mümkün olan en kısa sürede güncelleme

Bir satış ile diğer kanallardaki stok güncellemesi arasındaki süre ne kadar kısaysa fazla satış riski o kadar düşüktür. Elle güncellemede bu süre saatler, Excel ile toplu yüklemede genellikle yarım gün ya da bir gündür; otomatik senkronizasyonda ise dakikalar mertebesindedir.

### 4. İade, iptal ve sayım farklarını stoğa yansıtın

İade gelen ürünü kontrol edin: satılabilir durumdaysa stoğa geri ekleyin, hasarlıysa ayırın. İptal edilen siparişlerin ürünlerini serbest bırakın. Dönemsel sayım yaparak sistemdeki stok ile raftaki stoğu eşitleyin.

### 5. Hızlı satan ürünlerde güvenlik payı

Son birkaç adette, özellikle kampanya dönemlerinde, aynı ürünün iki kanalda neredeyse aynı anda satılma ihtimali artar. Çok hızlı satan ürünlerde kanallarda gösterilecek en fazla adedi sınırlamak ya da 1–2 adetlik bir güvenlik payı bırakmak bu riski azaltır.

## Stok takibi yöntemleri karşılaştırması

| Yöntem | Güncelleme hızı | Fazla satış riski | Zaman maliyeti | Uygun olduğu durum |
| --- | --- | --- | --- | --- |
| Her pazaryeri panelinden elle | Saatler | Yüksek | Çok yüksek | Tek kanal, çok az ürün |
| Excel / hesap tablosu + toplu yükleme | Yarım gün – 1 gün | Orta | Yüksek | Az ürün, yavaş satış |
| Muhasebe / ön muhasebe programı | Programa bağlı | Orta | Orta | Fatura odaklı küçük işletmeler |
| Pazaryeri entegrasyonu ile otomatik senkronizasyon | Dakikalar | Düşük | Düşük | İki ve daha fazla kanal |

Excel ile çalışmak başlangıç için mantıklıdır ve maliyetsizdir. Ancak ürün sayınız ve kanal sayınız arttıkça, iki toplu yükleme arasındaki satışlar fazla satışa dönüşmeye başlar. Entegrasyonun nasıl çalıştığını ve ne zaman gerekli hale geldiğini [pazaryeri entegrasyonu rehberimizde](/blog/pazaryeri-entegrasyonu-nedir) anlattık.

## Varyantlı ürünlerde stok takibi

Giyim, ayakkabı ve aksesuar gibi kategorilerde tek bir ürün onlarca varyanttan oluşur: beş renk ve altı beden, otuz ayrı stok demektir. Varyantlı ürünlerde stok takibinin püf noktaları şunlardır:

- **Stok varyant düzeyinde tutulur.** "Tişört: 120 adet" bilgisi işe yaramaz; müşteri "siyah, M beden" satın alır. Her varyantın kendi barkodu ve kendi stok adedi olmalıdır.
- **Varyantlar ana ürün altında gruplanır.** Kanallarda varyantların aynı ürün sayfasında görünmesi için ana ürün (model) kodu tutarlı olmalıdır.
- **Biten varyant satıştan kalkmalıdır.** Siyah M beden bittiğinde yalnız o varyantın stoğu sıfırlanmalı; ürünün diğer varyantları satışta kalmalıdır.
- **Beden dağılımına göre sipariş verin.** Hangi bedenin hızlı, hangisinin yavaş sattığını izleyin; yeniden siparişte tüm bedenlerden eşit almak yerine satış dağılımına göre alın.

## Depo düzeni ve sayım

Sistemdeki stok ne kadar doğru tutulursa tutulsun, raftaki gerçek stokla eşleşmiyorsa işe yaramaz. Küçük bir depoda bile şu alışkanlıklar büyük fark yaratır:

1. **Her ürünün sabit bir yeri olsun.** Raf ve göz numarası vermek hem toplama hızını artırır hem de "ürün var ama bulunamıyor" sorununu bitirir.
2. **Toplama listesiyle çalışın.** Günün siparişlerini tek tek değil, ürün bazında toplu bir listeyle toplayın; hangi üründen kaç adet alınacağı tek sayfada görünsün.
3. **Mal kabulünü sisteme hemen işleyin.** Tedarikçiden gelen ürünü rafa koymadan önce stoğa ekleyin; aksi halde ürün rafta beklerken kanallarda "tükendi" görünür.
4. **Döngüsel sayım yapın.** Tüm depoyu yılda bir kez saymak yerine her hafta belirli bir rafı ya da ürün grubunu sayın. Hızlı satan ürünleri daha sık sayın.
5. **Farkların nedenini not edin.** Sayım farkı çıktığında yalnız rakamı düzeltmeyin; nedenini (hasar, yanlış toplama, kayıt hatası) bulun. Aynı neden tekrar ediyorsa süreçte bir sorun vardır.

## İade gelen ürün stoğa nasıl döner?

İadeler çok kanallı satışta stok farklarının en sık kaynağıdır. Basit bir iade akışı şöyle olmalıdır:

1. İade paketi geldiğinde sipariş numarasıyla eşleştirin.
2. Ürünü kontrol edin: ambalajı, etiketi ve kullanılmamış olduğu.
3. Satılabilir durumdaysa stoğa geri ekleyin; diğer kanallara da yansımasını sağlayın.
4. Hasarlı ya da eksikse ayrı bir "satılamaz" alanına alın ve gerekiyorsa pazaryerinde iadeyi gerekçesiyle reddedin.
5. İade nedenini kaydedin; aynı nedenle gelen iadeler ürün sayfasındaki bir eksiği gösterebilir.

## Stok seviyesini doğru belirlemek

Stok takibi yalnız "kaç adet var" sorusu değildir; "ne zaman ne kadar sipariş vermeliyim" sorusunun da cevabıdır. Ürün bittiğinde satışlar durur, pazaryerinde ürününüzün sıralaması geriler ve yeniden yükselmesi zaman alır. Fazla stok ise paranızı rafta bağlar.

### Tükenme süresini hesaplayın

Basit ama işe yarayan bir hesap: **Kalan gün = Mevcut stok ÷ Günlük ortalama satış.** Örneğin elinizde 60 adet var ve son 30 günde günde ortalama 4 adet sattınız: stoğunuz yaklaşık 15 gün yeter. Tedarikçinizden ürünün gelmesi 10 gün sürüyorsa, en geç 5 gün içinde sipariş vermeniz gerekir.

### Yeniden sipariş noktası

**Yeniden sipariş noktası = Günlük ortalama satış × Tedarik süresi (gün) + Güvenlik stoğu.** Yukarıdaki örnekte günde 4 adet, 10 günlük tedarik süresi ve 8 adetlik güvenlik stoğuyla yeniden sipariş noktanız 4 × 10 + 8 = 48 adettir. Stok 48'e düştüğünde yeni sipariş verirsiniz.

| Ürün | Stok | Günlük satış | Kalan gün | Tedarik süresi | Yeniden sipariş noktası | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| Ürün A | 60 | 4 | 15 | 10 gün | 48 | Sipariş verilmeli |
| Ürün B | 120 | 2 | 60 | 14 gün | 36 | Yeterli |
| Ürün C | 9 | 3 | 3 | 7 gün | 27 | Acil, tükenmek üzere |

### Hangi ürünlere öncelik vermeli?

Tüm ürünlere aynı özeni göstermek mümkün değildir. Ciroya ya da kâra en çok katkı yapan ürünleri (genellikle ürünlerinizin küçük bir kısmı) belirleyin ve bunların stoğunu daha sık kontrol edin. Hangi ürünün gerçekten kâr bıraktığını görmek için yalnız ciroya değil, komisyon ve kargo sonrası net kâra bakın; bunun nasıl hesaplandığını [Trendyol komisyon ve net kâr rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) anlattık.

## Çok kanallı stok yönetimi için kontrol listesi

- Her ürün ve varyantın benzersiz, kanallar arasında aynı barkodu ve stok kodu var.
- Ürünün stoğu tek bir ürün kartında tutuluyor; kanallara ayrı ayrı stok girilmiyor.
- Bir kanaldaki satış, diğer kanallardaki stoğa dakikalar içinde yansıyor.
- İade gelen satılabilir ürünler stoğa geri ekleniyor, hasarlılar ayrılıyor.
- Çok hızlı satan ürünlerde kanal başına üst sınır ya da güvenlik payı var.
- Stokta olmayan ve eşleşmeyen ilanlar düzenli kontrol ediliyor.
- Ayda en az bir kez (hızlı satan ürünlerde daha sık) sayım yapılıp sistem stoğu eşitleniyor.
- Tükenmek üzere olan ürünler için önceden uyarı alınıyor.
- Kampanya öncesi kampanyaya girecek ürünlerin stoğu ayrıca kontrol ediliyor.

Bu listede "hayır" dediğiniz her madde, fazla satış ya da gereksiz stok tükenmesi için potansiyel bir açık demektir.

## Kampanya dönemlerinde stok

Büyük indirim günlerinde satış hızı normalin birkaç katına çıkabilir. Bu dönemlerde:

1. Kampanyaya gireceğiniz ürünleri ve kampanya stok adetlerini önceden belirleyin.
2. Stok sayımını kampanyadan önce yapın; sistem ile raf arasındaki farkı kapatın.
3. Son adetlerde kanal başına gösterilecek stoğu sınırlayın.
4. Kampanya boyunca siparişleri ve stokta olmayan ilanları sık aralıklarla kontrol edin.
5. Kampanyaya katılmadan önce indirimli fiyattaki kârınızı [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) kontrol edin; çok satıp zarar etmek, stoğu boşa harcamaktır.

## Stok verisini kâr kararına dönüştürmek

Stok takibi yalnız operasyonel bir iş değildir; doğru tutulduğunda hangi ürüne para bağlayacağınızı da gösterir. Uzun süredir satılmayan ürünler depoda yer kaplar ve sermayenizi bağlar; bu ürünler için fiyat güncellemesi, set kampanyası ya da başka bir kanalda satış denemek mantıklıdır. Hızlı satan ve yüksek kâr bırakan ürünlerde ise stok tükenmesi en pahalı hatadır. Ayda bir kez ürünlerinizi "hızlı satan / yavaş satan" ve "kârlı / kârsız" olarak dört gruba ayırmak, stok alımlarınızı ve kampanya kararlarınızı çok daha bilinçli hale getirir.

## Stok senkronizasyonu Hastürk CRM’de nasıl çalışır?

Hastürk CRM'in [stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) özelliği, yukarıdaki kuralları sizin yerinize uygular:

- **Tek ürün kartı:** Ürün panelde tek kart olarak tutulur; kanallardaki ilanlar barkod ve stok koduyla kendiliğinden bu karta bağlanır. Eşleşmeyen ilanlar için panel öneri sunar, siz onaylarsınız.
- **Kanallar arası stok:** Bir kanaldan sipariş gelince stok düşer ve yeni adet, stok gönderimi açık olan diğer kanallara gider. Satıştan sonraki ilk kontrolde, en geç 15 dakika içinde güncelleme yapılır.
- **Kanal bazında kontrol:** Stok gönderimini her kanal için ayrı açıp kapatabilir, bir kanalda gösterilecek en fazla adedi sınırlayabilirsiniz. Stok gönderimi siz açana kadar kapalıdır; kapalıyken stoklar kanaldan yalnız okunur.
- **Tükenme tahmini:** Satış hızına göre stokun kaç gün yeteceği hesaplanır; yakında bitecek ürünler için uyarı alırsınız.
- **Toplu güncelleme:** Stok, fiyat ve maliyeti Excel dosyasıyla toplu güncelleyebilirsiniz.
- **Stoksuz ilan takibi:** Stokta olmayan ürünler ve eşleşme bekleyen ilanlar ana ekranda ayrıca gösterilir.

Trendyol, Hepsiburada, N11, Amazon, Çiçeksepeti, PttAVM, idefix, Pazarama ve Koçtaş gibi pazaryerleri ile ikas, Shopify ve WooCommerce gibi e-ticaret sitelerinizin stoğu aynı panelden yönetilir; desteklenen tüm kanalları [entegrasyonlar sayfasında](/entegrasyonlar) görebilirsiniz.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazalarınızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Stok senkronizasyonu nedir?

Bir ürünün stoğunun birden fazla satış kanalında otomatik olarak eşit tutulmasıdır. Bir kanalda satış olduğunda stok düşer ve yeni adet diğer kanallara kendiliğinden gönderilir.

### Fazla satış nasıl önlenir?

Stoğu tek bir ürün kartında tutup kanallara oradan dağıtarak, satıştan sonra tüm kanalları dakikalar içinde güncelleyerek ve hızlı satan ürünlerde küçük bir güvenlik payı bırakarak önlenir. Çok kanallı satışta bunu elle yapmak pratik değildir; otomatik stok senkronizasyonu gerekir.

### Excel ile stok takibi yeterli mi?

Tek kanal ve az ürünle çalışırken yeterli olabilir. Ancak iki ya da daha fazla kanalda satış yaptığınızda, iki toplu güncelleme arasındaki satışlar fazla satış riski doğurur. Kanal ve ürün sayınız arttıkça otomatik senkronizasyon gerekli hale gelir.

### Barkodu olmayan ürünlerin stoğu nasıl eşleşir?

Barkod yoksa stok kodu (SKU) ile eşleştirme yapılabilir. Her iki bilgi de yoksa eşleştirme elle yapılır. Uzun vadede her varyanta benzersiz bir barkod ya da stok kodu vermek en sağlıklı yoldur.

### Pazaryerinde stok neden sıfır görünüyor ama depoda ürün var?

En sık nedenler: iade edilen ürünün stoğa geri eklenmemesi, iptal edilen siparişin stoğunun serbest bırakılmaması, ilanın ürün kartıyla eşleşmemiş olması ya da o kanal için stok gönderiminin kapalı olması. Ürün kartındaki stoğu ve ilanın eşleşme durumunu kontrol edin.

### Stok güvenlik payı ne kadar olmalı?

Ürünün satış hızına ve senkronizasyon aralığına bağlıdır. Günde birkaç adet satan ürünlerde 1–2 adet çoğu zaman yeterlidir; kampanya dönemlerinde ya da çok hızlı satan ürünlerde bu payı artırmak mantıklıdır.
`,
  },
  {
    slug: "pazaryeri-entegrasyonu-nedir",
    title: "Pazaryeri Entegrasyonu Nedir? Tek Panelden Çok Kanallı Satış Rehberi",
    seo_title: "Pazaryeri Entegrasyonu Nedir? Nasıl Seçilir? (2026)",
    seo_desc: "Pazaryeri entegrasyonu nedir, nasıl çalışır? Ne zaman gerekir, Excel ile farkı, seçerken bakılacak 8 kriter ve kurulum adımları. Okuyun, demoyu açın.",
    summary: "Pazaryeri entegrasyonu; Trendyol, Hepsiburada, N11 ve e-ticaret sitenizi tek panele bağlayıp sipariş, stok, fiyat ve kargoyu tek yerden yönetmenizi sağlar. Nasıl çalıştığını, ne zaman gerektiğini, nasıl seçileceğini ve kurulum adımlarını anlatıyoruz.",
    tags: ["Entegrasyon","Pazaryeri","Çok Kanallı Satış","Stok Yönetimi"],
    cover: "pazaryeri-entegrasyonu-kapak.jpg",
    body: `Pazaryeri entegrasyonu, Trendyol, Hepsiburada, N11 gibi pazaryerlerindeki ve kendi e-ticaret sitenizdeki mağazalarınızı tek bir yazılıma bağlayarak sipariş, stok, fiyat, ürün ve kargo işlemlerini tek panelden yönetmenizi sağlayan sistemdir. Entegrasyon yazılımı, pazaryerlerinin satıcılara sunduğu resmi API'ler üzerinden çalışır: siparişleri sizin yerinize çeker, bir kanalda satılan ürünün stoğunu diğer kanallarda düşürür, fiyat değişikliğinizi tüm mağazalara gönderir. Böylece her pazaryerinin panelini ayrı ayrı açmanız gerekmez.

Bu yazıda pazaryeri entegrasyonunun nasıl çalıştığını, hangi noktada gerekli hale geldiğini, Excel ve elle yönetimle farkını, entegrasyon seçerken nelere bakmanız gerektiğini ve kurulumun adım adım nasıl yapıldığını anlatıyoruz.

## Pazaryeri entegrasyonu nasıl çalışır?

Her büyük pazaryeri, satıcıların kendi yazılımlarını bağlayabilmesi için bir **API** (uygulama programlama arayüzü) sunar. Satıcı panelinizden aldığınız API bilgileri (genellikle satıcı numarası, API anahtarı ve gizli anahtar) entegrasyon yazılımına girildiğinde, yazılım sizin adınıza o mağazada işlem yapabilir hale gelir.

![Pazaryeri entegrasyonu: tek panel, çok kanal](https://hasturkcrm.com/img/blog/entegrasyon-semasi.jpg "Kanallar tek panele bağlanır; sipariş gelir, stok ve fiyat gider")

Bağlantı kurulduktan sonra veri iki yönde akar:

- **Kanaldan panele:** Yeni siparişler, sipariş durum değişiklikleri (iptal, iade, teslim), müşteri soruları, iade talepleri, pazaryerinin kestiği faturalar ve hakediş kayıtları.
- **Panelden kanala:** Stok adetleri, fiyatlar, yeni ürünler, sipariş onayı, kargo takip numarası, soru cevapları ve iade kararları.

Bu akış belirli aralıklarla kendiliğinden tekrarlanır. Örneğin bir Trendyol siparişi geldiğinde entegrasyon bunu çeker, ürünün stoğunu bir azaltır ve yeni stok adedini Hepsiburada, N11 ve kendi sitenize gönderir. Siz hiçbir panele girmeden tüm kanallardaki stok eşit kalır.

### Entegrasyon ne değildir?

- **Pazaryerinin yerine geçmez.** Satış yine pazaryerinde gerçekleşir; pazaryerinin kuralları, komisyonları ve kampanyaları geçerlidir.
- **Pazaryeri hesabı açmaz.** Her pazaryerinde mağazanızın açılmış ve onaylanmış olması gerekir. Mağaza açma süreçleri için [Trendyol](/blog/trendyol-magaza-acma-rehberi) ve [Hepsiburada](/blog/hepsiburada-satici-olma-magaza-acma) rehberlerimize bakabilirsiniz.
- **Her kanalda her işlemi yapamayabilir.** Pazaryerlerinin API'leri aynı yetenekleri sunmaz; örneğin bazı kanallarda yeni ilan yalnız kanalın kendi panelinden açılabilir. İyi bir yazılım bunu size açıkça söyler.

## Entegrasyona ne zaman ihtiyaç duyarsınız?

Tek bir pazaryerinde, az sayıda ürün ve günde birkaç siparişle çalışırken pazaryerinin kendi paneli çoğu zaman yeterlidir. Aşağıdaki işaretlerden birkaçını yaşıyorsanız entegrasyon zamanı gelmiş demektir:

- **İkinci bir satış kanalı açtınız.** Aynı stoğu iki yerde satmaya başladığınız anda fazla satış riski doğar.
- **Stokta olmayan ürünü sattığınız oldu.** Bir kanalda biten ürün diğerinde satışta kaldıysa, bu iptal hem müşteriyi hem de mağaza puanınızı etkiler.
- **Günün önemli bir kısmı panel değiştirerek geçiyor.** Her sabah her pazaryerinin panelini açıp siparişleri tek tek kontrol ediyorsanız.
- **Fiyat güncellemesi saatler sürüyor.** Maliyet ya da kur değiştiğinde yüzlerce ürünün fiyatını her kanalda ayrı ayrı değiştirmek zorunda kalıyorsanız.
- **Gerçek kârınızı bilmiyorsunuz.** Ciroyu görüyor ama komisyon, kargo, hizmet bedeli ve stopaj sonrası her siparişte ne kazandığınızı bilmiyorsanız.
- **Ekibiniz büyüdü.** Depo, müşteri hizmetleri ve muhasebe aynı bilgilere farklı panellerden ulaşmaya çalışıyorsa.

## Elle yönetim, Excel ve entegrasyon karşılaştırması

| | Pazaryeri panelleri (elle) | Excel ile toplu güncelleme | Entegrasyon yazılımı |
| --- | --- | --- | --- |
| Siparişler | Her kanalda ayrı panel | Ayrı panellerde | Tüm kanallar tek listede |
| Stok eşitleme | Elle, her satıştan sonra | Belirli aralıklarla elle dosya yükleme | Satıştan sonra kendiliğinden |
| Fazla satış riski | Yüksek | Orta (dosya yüklenene kadar) | Düşük |
| Fiyat güncelleme | Ürün ürün | Toplu ama kanal kanal | Tek yerden tüm kanallara |
| Kargo etiketi | Her panelden ayrı | Her panelden ayrı | Tek ekrandan, toplu |
| Net kâr takibi | Faturaları elle toplamak gerekir | Elle hesap tablosu | Faturalar çekilir, sipariş bazında |
| Uygun olduğu durum | Tek kanal, az sipariş | Az ürün, az değişiklik | İki ve daha fazla kanal |

Excel ile toplu güncelleme, entegrasyona geçmeden önce iyi bir ara çözümdür; ama stok satış anında değil, dosya yüklendiğinde güncellendiği için iki yükleme arasındaki satışlar risk oluşturur. Ayrıntılı bir değerlendirme için [e-ticarette stok takibi rehberimize](/blog/e-ticarette-stok-takibi-fazla-satis) bakabilirsiniz.

## Pazaryeri ve e-ticaret sitesi birlikte

Çok kanallı satışın en yaygın biçimi, bir ya da birkaç pazaryerinin yanında kendi e-ticaret sitenizin de olmasıdır. Pazaryerleri hazır trafik ve güven sağlar; kendi siteniz ise komisyon ödemediğiniz, müşteri ilişkisini doğrudan yönettiğiniz ve markanızı büyüttüğünüz kanaldır. İkisini birlikte kullanmanın önündeki en büyük engel operasyondur: aynı stok, aynı ürün bilgisi ve farklı sipariş akışları.

Entegrasyon burada iki işi birden görür:

- **Siteniz katalog kaynağı olabilir.** Ürün açıklamaları, görseller ve varyantlar sitenizde zaten hazırsa, pazaryerlerine ürün yüklerken bu bilgiler kaynak olarak kullanılabilir.
- **Siparişler tek akışta birleşir.** Pazaryerinden gelen sipariş ile sitenizden gelen sipariş aynı listede, aynı kargo ve etiket süreciyle hazırlanır; depo ekibiniz siparişin hangi kanaldan geldiğini düşünmek zorunda kalmaz.

Kendi sitenizden gelen siparişlerde kargoyu kendi anlaşmanızla gönderiyorsanız, kargo firmasıyla doğrudan bağlantı kuran bir entegrasyon takip numarasını müşteriye ve sitenize kendiliğinden iletir.

## Entegrasyonun maliyeti nasıl değerlendirilir?

Entegrasyon yazılımının aylık ücreti görünen maliyettir; ama karşılaştırmanız gereken asıl şey, onsuz harcadığınız zaman ve yaşadığınız kayıplardır. Kendi işletmeniz için basit bir hesap yapabilirsiniz:

| Kalem | Nasıl hesaplanır? |
| --- | --- |
| Panel değiştirme ve elle güncelleme süresi | Günlük dakika × iş günü × saatlik personel maliyeti |
| Fazla satış kaynaklı iptaller | Aylık iptal adedi × (kaybedilen kâr + olası yaptırım) |
| Fiyat güncelleme gecikmesi | Maliyet artışından sonra eski fiyattan yapılan satışlardaki kâr kaybı |
| Görünmeyen zarar eden ürünler | Kesintiler sonrası zarar eden ama satılmaya devam eden ürünlerin aylık kaybı |

Örneğin günde bir saatinizi farklı panellerde sipariş ve stok kontrolüne harcıyorsanız, bu ayda yaklaşık 20–25 iş saati eder. Bu süreyi kendi saatlik maliyetinizle çarptığınızda, entegrasyonun size ne kazandıracağı hakkında gerçekçi bir fikir edinirsiniz. Rakamları kendi işletmenizin verileriyle doldurmanız önemlidir; her işletmenin sonucu farklıdır.

## Bir entegrasyon yazılımında olması gerekenler

### 1. Resmi API ile bağlantı

Yazılımın, pazaryerlerinin satıcılara sunduğu resmi API'ler üzerinden çalıştığından emin olun. Satıcı panelinize kullanıcı adı ve şifrenizle giriş yapan, ekran kazıyan ya da resmi olmayan yöntemlerle çalışan çözümler hem güvenlik riski taşır hem de pazaryeri arayüzünü değiştirdiğinde çalışmayı bırakabilir.

### 2. İhtiyacınız olan kanalların hepsi

Bugün sattığınız kanalların yanında yakın zamanda açmayı düşündüğünüz kanalları da kontrol edin: Trendyol, Hepsiburada, N11, Amazon, Çiçeksepeti, PttAVM, idefix, Pazarama, Koçtaş gibi pazaryerleri; ikas, Shopify, WooCommerce, Ticimax, IdeaSoft, T-Soft gibi e-ticaret altyapıları; hızlı teslimat ve yurt dışı kanalları.

### 3. Güvenilir stok senkronizasyonu

Entegrasyonun en kritik işi stoktur. Şunları sorun: Ürünler kanallar arasında barkod ya da stok koduyla eşleşiyor mu? Bir satıştan sonra yeni stok diğer kanallara ne kadar sürede gidiyor? Kanal bazında stok gönderimini açıp kapatabiliyor ve bir kanalda gösterilecek en fazla adedi sınırlayabiliyor musunuz?

### 4. Sipariş ve kargo yönetimi

Tüm kanalların siparişleri tek listede, durumlarına göre ayrılmış olmalı. Geciken siparişler önceden uyarılmalı, kargo etiketleri toplu ve termal yazıcıyla basılabilmeli. Pazaryerinin anlaşmalı kargosuyla çalışıyorsanız barkod doğrudan pazaryerinden gelmeli; kendi kargo anlaşmanızla çalışıyorsanız kargo firması entegrasyonu olmalı.

### 5. Ürün yükleme ve kategori eşleştirme

Ürünü bir kez girip birden fazla pazaryerine yükleyebilmek ciddi zaman kazandırır. Her pazaryerinin kategori yapısı ve zorunlu özellikleri farklı olduğu için yazılımın kategori ve özellik eşleştirmesine yardım etmesi önemlidir.

### 6. Gerçek kâr hesabı

Ciro raporu her yazılımda vardır. Önemli olan, pazaryerinin kestiği komisyon, kargo, hizmet bedeli ve stopajın sipariş bazında düşülerek gerçek kârın gösterilmesidir. Bunun nasıl hesaplandığını [Trendyol komisyon ve net kâr hesaplama rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) örnekle anlattık.

### 7. Ekip yetkileri ve güvenlik

Depo personeli kâr rakamlarını, müşteri hizmetleri personeli fiyatları değiştirmek zorunda değildir. Rol bazlı yetki, iki adımlı doğrulama ve işlem kayıtları olan bir yazılım seçin.

### 8. Şeffaf fiyat ve deneme imkânı

Kurulum ücreti, sipariş başı ücret ya da ürün sayısı sınırı olup olmadığını önceden öğrenin. Kendi mağazanızı bağlayıp gerçek siparişlerinizle deneyebileceğiniz bir deneme süresi, karar vermenin en sağlıklı yoludur.

## Pazaryeri entegrasyonu kurulumu: adım adım

1. **Kanallarınızı listeleyin.** Hangi pazaryeri ve sitelerde satış yaptığınızı, her birinde kaç ürününüz olduğunu not edin.
2. **API bilgilerinizi alın.** Her pazaryerinin satıcı panelindeki entegrasyon / API bilgileri bölümünden satıcı numaranızı ve API anahtarlarınızı alın. E-ticaret sitenizde (ikas, Shopify, WooCommerce vb.) ilgili uygulamayı ya da API erişimini açın.
3. **Mağazaları bağlayın.** API bilgilerini entegrasyon yazılımına girin; bağlantı test edilir ve ürünleriniz ile siparişleriniz panele gelmeye başlar.
4. **Ürünleri eşleştirin.** Aynı ürünün farklı kanallardaki ilanları barkod ya da stok koduyla tek ürün kartına bağlanır. Eşleşmeyenleri kontrol edip onaylayın. Barkodlarınız kanallar arasında tutarlıysa bu adım büyük ölçüde kendiliğinden tamamlanır.
5. **Stokları kontrol edin.** Paneldeki stok adetlerinin depodaki gerçek sayımla uyumlu olduğundan emin olun.
6. **Stok gönderimini açın.** Kontrolü bitirdikten sonra stok gönderimini önce bir kanalda, sonra diğerlerinde açın. Kademeli açmak olası eşleştirme hatalarını erken görmenizi sağlar.
7. **Sipariş akışını deneyin.** Bir siparişi panelden işleme alın, etiketini basın, kargoya verin ve durumun pazaryerine doğru yansıdığını kontrol edin.
8. **Ekibinizi ekleyin.** Personelinize görevine uygun yetkilerle kullanıcı açın.

## Entegrasyon herkes için gerekli mi?

Her işletmenin entegrasyona hemen ihtiyacı yoktur. Yalnız tek bir pazaryerinde, birkaç düzine ürünle ve günde birkaç siparişle çalışıyorsanız pazaryerinin kendi paneli bir süre yeterli olabilir. Ürünleriniz tamamen sipariş üzerine üretiliyorsa ve stok tutmuyorsanız stok senkronizasyonunun önemi azalır. Ancak bu durumda bile sipariş bazında gerçek kârı görmek ve kargo etiketlerini toplu basmak zaman kazandırır. Kararı verirken bugünkü durumunuza değil, önümüzdeki altı ay içinde açmayı planladığınız kanallara göre düşünün.

## Sık yapılan hatalar

- **Eşleştirmeden stok göndermek:** Yanlış eşleşen bir ilan, başka bir ürünün stoğunu alabilir. Stok gönderimini eşleştirmeyi kontrol ettikten sonra açın.
- **Tutarsız barkod kullanmak:** Aynı ürüne kanallarda farklı barkod vermek otomatik eşleştirmeyi zorlaştırır. Mümkünse her varyant için tek bir barkod kullanın.
- **Kanal panelinden ve entegrasyondan aynı anda fiyat değiştirmek:** Fiyatı tek bir yerden yönetin; aksi halde bir sonraki güncellemede değişikliğiniz geri alınabilir.
- **Stok tamponu bırakmamak:** Çok hızlı satan ürünlerde birkaç adetlik güvenlik payı bırakmak, senkronizasyon aralığındaki eşzamanlı satışlara karşı koruma sağlar.

## Hastürk CRM ile tek panelden çok kanallı satış

Hastürk CRM, pazaryerlerinin resmi API'leri üzerinden çalışan bir pazaryeri entegrasyonu ve satış yönetim panelidir. Trendyol, Hepsiburada, N11, Amazon, Çiçeksepeti, PttAVM, idefix, Pazarama ve Koçtaş gibi pazaryerlerini; ikas, Shopify, WooCommerce, Ticimax, IdeaSoft ve T-Soft gibi e-ticaret sitelerini aynı panele bağlayabilirsiniz. Tüm bağlantıları [entegrasyonlar sayfasında](/entegrasyonlar) görebilirsiniz.

- **[Sipariş yönetimi](/ozellikler/siparis-yonetimi):** Tüm kanalların siparişleri 15 dakikada bir kendiliğinden panele gelir; geciken siparişler işaretlenir, toplu işlem yapılır.
- **[Stok senkronizasyonu](/ozellikler/stok-senkronizasyonu):** İlanlar barkod ve stok koduyla eşleşir; bir kanalda satılan ürünün stoğu gönderimi açık diğer kanallarda da düşer.
- **[Ürün yönetimi](/ozellikler/urun-yonetimi):** Ürünü bir kez girin; kategori eşleştirmesiyle Trendyol, Hepsiburada, N11 ve idefix'e panelden yükleyin.
- **[Kargo ve etiket](/ozellikler/kargo-ve-etiket):** Pazaryerinin ortak barkodu ya da kendi kargo anlaşmanızla etiketleri toplu ve termal yazıcıdan basın.
- **[Kâr-zarar](/ozellikler/kar-zarar):** Pazaryerinin kestiği faturalar çekilir, her siparişin gerçek kârı hesaplanır.

Sipariş, ürün ya da ilan sayısı sınırı yoktur ve kurulum ücreti alınmaz; paket ayrıntıları [fiyatlar sayfasında](/paketler). Kayıt olmadan [canlı demo panelini](/demo) açabilir, kendi mağazalarınızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Pazaryeri entegrasyonu ne işe yarar?

Birden fazla pazaryerindeki ve e-ticaret sitesindeki mağazalarınızı tek panelden yönetmenizi sağlar. Siparişler tek listeye gelir, stok ve fiyatlar tüm kanallarda eşit kalır, kargo etiketleri tek ekrandan basılır ve her siparişin gerçek kârı hesaplanır.

### Entegrasyon kullanmak pazaryeri kurallarına aykırı mı?

Hayır. Pazaryerleri satıcıların yazılım kullanabilmesi için resmi API sunar; API bilgileri satıcı panelinden alınır. Önemli olan, kullandığınız yazılımın bu resmi API'ler üzerinden çalışmasıdır.

### Entegrasyon için teknik bilgi gerekir mi?

Genellikle hayır. Pazaryerinin satıcı panelinden API bilgilerinizi kopyalayıp yazılıma yapıştırmanız yeterlidir. Kurulum sırasında takıldığınız yerde destek ekibinden yardım alabilirsiniz.

### Stoklar ne kadar sürede eşitlenir?

Yazılıma ve pazaryerinin API'sine göre değişir. Hastürk CRM'de bir satıştan sonraki ilk kontrolde, en geç 15 dakika içinde yeni stok gönderimi açık olan diğer kanallara gider. Çok hızlı satan ürünler için küçük bir stok tamponu bırakmanızı öneririz.

### Tek pazaryerinde satıyorum, entegrasyona ihtiyacım var mı?

Tek kanalda da sipariş ve kargo yönetimi, toplu etiket ve özellikle sipariş bazında gerçek kâr takibi zaman kazandırır. Ama asıl fark, ikinci kanalı açtığınızda ortaya çıkar; stok eşitleme olmadan iki kanalda satış yapmak fazla satış riski taşır.

### Mevcut ürünlerimi yeniden girmem gerekir mi?

Hayır. Mağazanızı bağladığınızda ilanlarınız panele gelir ve barkod ya da stok koduyla eşleştirilir. Yeni ürünleri ise panelden girip desteklenen pazaryerlerine yükleyebilirsiniz.
`,
  },
  {
    slug: "hepsiburada-satici-olma-magaza-acma",
    title: "Hepsiburada'da Satıcı Olmak: Mağaza Açma Rehberi (2026)",
    seo_title: "Hepsiburada Satıcı Olma 2026: Şartlar ve Belgeler",
    seo_desc: "Hepsiburada'da mağaza nasıl açılır? Satıcı olma şartları, gerekli belgeler, başvuru adımları, kargo, komisyon ve ödeme vadesi tek rehberde. Hemen okuyun.",
    summary: "Hepsiburada'da satıcı olmak için gereken şartları, belgeleri ve mağaza tiplerini; İş Ortağım üzerinden başvuru adımlarını, ürün yükleme, kargo, komisyon ve ödeme vadesi konularını adım adım anlatıyoruz.",
    tags: ["Hepsiburada","Mağaza Açma","Pazaryeri","Rehber"],
    cover: "hepsiburada-satici-kapak.jpg",
    body: `Hepsiburada'da satıcı olmak için vergi mükellefi bir işletmeniz (şahıs, limited ya da anonim şirket) olması yeterlidir; mağaza açmak ücretsizdir. Başvuru, Hepsiburada'nın satıcı paneli olan **Hepsiburada İş Ortağım** üzerinden "Yeni başvuru" adımıyla yapılır: satıcı tipinizi seçer, mağaza adınızı ve şifrenizi oluşturur, şirket bilgilerinizi girer ve istenen belgeleri yüklersiniz. Belgeleriniz incelenip onaylandıktan sonra ürün yükleyip satışa başlayabilirsiniz.

Bu rehberde Hepsiburada mağaza açma sürecini baştan sona anlatıyoruz: şartlar, belgeler, mağaza tipleri, başvuru adımları, ürün yükleme, kargo seçenekleri, komisyon ve ödeme vadesi. Yazının sonunda Hepsiburada'yı Trendyol ile birlikte yönetmenin pratik yollarına da değiniyoruz.

## Hepsiburada satıcı olma şartları

Hepsiburada pazaryerinde satış yapabilmek için:

- **Vergi mükellefi bir işletmeniz** olmalıdır. Şahıs şirketi, limited şirket ya da anonim şirket olabilir. Zaten faal bir şirketiniz varsa e-ticaret için ayrıca şirket açmanız gerekmez.
- Satış yaptığınız her sipariş için **fatura düzenleyebilmelisiniz.** Pazaryeri satıcılarının çoğu e-arşiv / e-fatura ile çalışır.
- Hakedişlerin yatacağı **şirket adına bir banka hesabınız** olmalıdır.
- Satacağınız ürünler yasal olarak satışı serbest olmalı; bazı kategoriler ek belge isteyebilir.

Bireysel olarak, yani vergi kaydı olmadan Hepsiburada'da mağaza açılamaz. Şirketiniz yoksa ilk adım, bir mali müşavirle birlikte şahıs ya da limited şirket kurmaktır. Yeni başlayanların çoğu kuruluşu daha hızlı ve masrafı daha düşük olduğu için şahıs şirketiyle başlar.

## Hepsiburada mağaza açmak için gerekli belgeler

Başvuru sırasında ve sonrasında genellikle şu belgeler istenir:

| Belge | Şahıs şirketi | Limited / Anonim şirket |
| --- | --- | --- |
| Vergi levhası | Gerekli | Gerekli |
| İmza beyannamesi / imza sirküleri | İmza beyannamesi | İmza sirküleri |
| Ticaret sicil gazetesi | Ticaret siciline kayıtlıysa | Gerekli |
| Faaliyet belgesi | İstenebilir | İstenebilir |
| Şirket adına IBAN | Gerekli | Gerekli |
| Satıcı sözleşmesi | Panelden onaylanır | Panelden onaylanır |

Belge listesi, şirket türüne ve satış yapacağınız kategoriye göre değişebilir. Başvurudan sonra eksik kalan belgeleri satıcı panelindeki **Hesabım → Belgelerim** bölümünden yüklersiniz. Kozmetik, gıda, takviye ya da elektronik gibi kategorilerde ürüne özel belgeler; markalı ürünlerde marka tescil ya da yetki belgesi istenebilir.

> **İpucu:** Belgelerdeki unvan, adres ve vergi numarası ile panele girdiğiniz bilgilerin birebir aynı olmasına dikkat edin. Onay sürecindeki gecikmelerin önemli bir kısmı küçük yazım farklarından kaynaklanır.

## Hepsiburada’da mağaza tipleri

Başvuru ekranında üç satıcı tipi görürsünüz:

- **Standart:** Çoğu satıcının seçtiği genel mağaza tipi.
- **Kadın Girişimci:** Kadın girişimcilere yönelik destek programı. Hangi işletmelerin kapsama girdiği ve sağlanan destekler program koşullarına göre belirlenir; başvurmadan önce güncel şartları Hepsiburada'nın program sayfasından okuyun.
- **HepsiTürkiye'den:** Yöresel ürünler satan üreticiler ve işletmeler için program. Gıda ürünlerinde gıda işletme belgesi gibi ek şartlar aranır.

Program koşulları ve sağlanan destekler dönemsel olarak değişebileceği için başvuru sırasında ekranda gördüğünüz açıklamaları esas alın.

## Hepsiburada başvurusu adım adım

1. **Başvuru sayfasını açın.** Hepsiburada'nın "Satıcı ol" bağlantısından Hepsiburada İş Ortağım'daki yeni başvuru sayfasına gidin.
2. **Satıcı tipinizi seçin.** Standart, Kadın Girişimci ya da HepsiTürkiye'den seçeneklerinden size uygun olanı işaretleyin.
3. **Mağaza adı ve şifre oluşturun.** Mağaza adınız müşterilerin göreceği addır; kısa, akılda kalıcı ve markanızla uyumlu bir ad seçin.
4. **Şirket bilgilerinizi girin.** Şirket türü, unvan, vergi numarası, adres, banka ve iletişim bilgilerini eksiksiz doldurun.
5. **Belgelerinizi yükleyin.** İstenen belgeleri panele yükleyin, satıcı sözleşmesini onaylayın.
6. **Onayı bekleyin.** Hepsiburada belgelerinizi inceler; eksik ya da hatalı belge varsa panelden bildirir. Onaydan sonra mağazanız aktifleşir.
7. **Mağaza ayarlarınızı yapın.** Sevkiyat ve iade adreslerinizi, kargo tercihinizi, mağaza logonuzu ve iletişim bilgilerinizi tamamlayın.
8. **Ürünlerinizi yükleyin ve satışa başlayın.**

## Ürün yükleme: katalog ve listeleme

Hepsiburada'da aynı ürün tek bir ürün sayfasında listelenir ve o ürünü satan satıcılar aynı sayfada fiyat ve teslimat koşullarıyla yarışır. Bu yüzden ürün yüklerken iki durum vardır:

- **Ürün katalogda zaten varsa:** Kendi fiyatınızı ve stoğunuzu girerek mevcut ürüne satıcı olarak eklenirsiniz. Barkodun doğru olması burada kritiktir.
- **Ürün katalogda yoksa:** Ürünü başlık, açıklama, görseller, kategori özellikleri ve barkoduyla birlikte yeni ürün olarak oluşturursunuz. Ürün Hepsiburada'nın kontrolünden geçtikten sonra yayına alınır.

Aynı ürünü birden fazla satıcı sattığında müşterinin sepete eklerken ilk gördüğü satıcı, yani **buybox** sahibi, satışların büyük kısmını alır. Buybox yalnızca fiyata bağlı değildir; teslimat süresi ve mağaza performansı gibi ölçütler de rol oynar. Bu nedenle fiyat kadar zamanında kargolama ve düşük iptal oranı da önemlidir.

### Ürün yüklerken dikkat edilecekler

- Her varyant için **benzersiz ve doğru barkod** kullanın.
- Kategori özelliklerini eksiksiz doldurun; filtrelerde görünmeniz buna bağlıdır.
- Net, beyaz ya da sade arka planlı, farklı açılardan çekilmiş görseller yükleyin.
- Açıklamada ölçü, içerik, kullanım ve garanti bilgilerini açıkça yazın.
- Gerçekten uyabileceğiniz bir **kargoya veriliş süresi** belirleyin.

## Hepsiburada’da kargo seçenekleri

Hepsiburada'da gönderiler genellikle Hepsiburada'nın anlaşmalı kargo seçenekleriyle yapılır; Hepsiburada'nın kendi teslimat şirketi **HepsiJET** de bunların arasındadır. Siparişi panelde paketlediğinizde Hepsiburada'nın verdiği kargo barkodunu pakete yapıştırıp gönderirsiniz. Anlaşmalı kargoda ücret paketin desisine göre belirlenir ve hakedişinizden düşülür.

Kargo ücretinin ne kadar tutacağını önceden görmek için paketinizin desisini bilmeniz gerekir. Desi; en × boy × yükseklik (cm) ÷ 3000 formülüyle bulunur ve gerçek ağırlıkla karşılaştırılarak büyük olan değer ücrete esas alınır. Ayrıntılar için [desi nedir, nasıl hesaplanır](/blog/desi-nedir-nasil-hesaplanir) rehberimize, hızlı hesap için [desi hesaplama aracına](/araclar/desi-hesaplama) bakabilirsiniz.

Hepsiburada ayrıca ürünlerinizi Hepsiburada depolarında tutup sipariş hazırlama ve gönderimi sizin yerinize yapan **HepsiLojistik** hizmetini sunar. Sipariş hacmi yükselen ve depo-paketleme yükünü dışarı vermek isteyen satıcılar için değerlendirilebilecek bir seçenektir; koşullarını ve ücretlerini Hepsiburada'dan öğrenmeniz gerekir.

## Hepsiburada komisyon oranları ve kesintiler

Hepsiburada'da her satıştan şu kalemler düşülür:

- **Satış komisyonu:** Kategoriye göre değişen oran; komisyon faturası KDV eklenerek kesilir.
- **Hizmet / işlem bedeli:** Sipariş başına uygulanan bedel.
- **Kargo ücreti:** Anlaşmalı kargoda desiye göre.
- **E-ticaret stopajı:** 1 Ocak 2025'ten beri satışın KDV hariç tutarının %1'i.
- **Reklam ve diğer:** Kullandığınız reklam ya da oluşan diğer kesintiler.

Komisyon oranları kategoriye göre ciddi farklılık gösterir: elektronik gibi düşük marjlı kategorilerde oranlar genellikle daha düşük, moda ve aksesuar gibi kategorilerde daha yüksektir. Oranlar zaman zaman güncellendiği için kesin rakam vermiyoruz; güncel oranları satıcı panelinizdeki komisyon tablosundan kontrol edin. Kategori bazında genel bir fikir için [Hepsiburada komisyon oranları sayfamıza](/araclar/hepsiburada-komisyon-oranlari) bakabilir, kendi oranınızla net kârınızı [Hepsiburada komisyon hesaplama aracımızla](/araclar/hepsiburada-komisyon-hesaplama) bulabilirsiniz.

### Örnek kesinti hesabı

Aşağıdaki rakamlar **varsayımsaldır** ve yalnızca hesabın mantığını gösterir.

| Kalem | Tutar |
| --- | --- |
| Satış fiyatı (KDV dahil, %20 KDV) | 600,00 TL |
| Komisyon (örnek %15 + KDV = %18) | −108,00 TL |
| Kargo (örnek) | −70,00 TL |
| Hizmet bedeli (örnek) | −12,00 TL |
| Stopaj (600 ÷ 1,20 × %1) | −5,00 TL |
| **Hakediş** | **405,00 TL** |

Bu tutardan alış maliyetinizi ve ödeyeceğiniz KDV farkını düştüğünüzde gerçek kârınızı bulursunuz. KDV farkını da içeren adım adım bir örneği [Trendyol komisyon ve net kâr hesaplama rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) bulabilirsiniz; hesabın mantığı Hepsiburada için de aynıdır.

## Hepsiburada ödeme vadesi: para ne zaman yatar?

Hepsiburada'da vade, siparişin **müşteriye teslim edildiği tarihten** itibaren başlar ve süresi ürünün kategorisine göre komisyon tablosunda belirtilir. Vade dolduğunda tutar, kesintiler düşülerek hakedişinize yansır ve Hepsiburada'nın ödeme günlerinde hesabınıza aktarılır. Vadeler kategoriye ve satıcıya göre değişebildiği için güncel sürenizi panelinizdeki komisyon ve hakediş bölümlerinden takip edin.

Nakit akışınızı planlarken şunu unutmayın: bugün kargoya verdiğiniz siparişin parası, teslimat süresi ve vade eklendiğinde birkaç hafta sonra hesabınıza geçer. Stok alımlarınızı bu gecikmeyi hesaba katarak planlayın.

## Müşteri soruları, iadeler ve mağaza performansı

Hepsiburada'da satışın sürekliliği, siparişlerden sonra gelen süreçlerin iyi yönetilmesine bağlıdır. Yeni satıcıların en çok zorlandığı üç alan şunlardır:

### Müşteri soruları

Ürün sayfasındaki sorular hem soran müşteri hem de sayfayı ziyaret eden diğer müşteriler tarafından okunur. Kısa, net ve kibar cevaplar dönüşümü artırır. Sık gelen sorular (ölçü, uyumluluk, teslim süresi, garanti) için hazır cevap şablonları oluşturun; ama her cevabı soruya göre düzenleyip gönderin. Aynı soru sık geliyorsa, cevabını ürün açıklamasına da ekleyin.

### İade talepleri

Mesafeli satışlarda tüketicinin cayma hakkı vardır; iade taleplerini zamanında değerlendirmeniz gerekir. İade gelen ürünü kontrol edin, satılabilir durumdaysa stoğa geri ekleyin. Ürün kullanılmış, hasarlı ya da eksik geldiyse iadeyi gerekçesini ve gerekiyorsa fotoğrafını ekleyerek reddedebilirsiniz. İade nedenlerini düzenli takip etmek, ürün sayfasındaki eksikleri bulmanın en kolay yoludur.

### Performans ölçütleri

Zamanında kargolama, satıcı kaynaklı iptal oranı, müşteri memnuniyeti ve soru yanıtlama süresi gibi ölçütler mağazanızın görünürlüğünü ve buybox şansınızı etkiler. Bu ölçütleri satıcı panelinizden düzenli olarak izleyin; özellikle ilk aylarda küçük düşüşleri erkenden fark etmek önemlidir.

## Başvuru öncesi kontrol listesi

Başvuruya başlamadan önce aşağıdakilerin hazır olduğundan emin olun:

- Vergi levhanız güncel ve şirketiniz faal.
- İmza beyannamesi / imza sirküleriniz elinizde.
- Limited ya da anonim şirketseniz ticaret sicil gazeteniz hazır.
- Şirket adına açılmış bir banka hesabınız var.
- e-Arşiv / e-fatura için hizmet sağlayıcınız ve e-imza ya da mali mührünüz hazır ya da süreç başlatılmış.
- Satacağınız ilk ürünlerin barkodları, görselleri, açıklamaları ve kategori özellikleri hazır.
- Ürünlerinizin kargoya hazır paket ölçüleri ve ağırlıkları biliniyor.
- Komisyon, kargo, hizmet bedeli ve stopaj sonrası kârınızı hesapladığınız bir fiyat listeniz var.

## Hepsiburada’da ilk satışlarınızı hızlandırmak için

1. **Az ama doğru ürünle başlayın.** Rekabetin çok yoğun olmadığı, iyi tanıdığınız ve stoğunu garanti edebileceğiniz ürünlerle başlayın.
2. **Fiyatı kesintilere göre belirleyin.** Komisyon, kargo, hizmet bedeli ve stopajı fiyatlamaya baştan dahil edin. Hedef kârınıza göre fiyat bulmak için [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) kullanın.
3. **Hızlı kargolayın.** Kısa kargoya veriliş süresi hem müşteri tercihini hem de buybox şansınızı artırır.
4. **Soruları hızlı yanıtlayın.** Ürün sayfasındaki sorulara hızlı ve net cevap vermek dönüşümü artırır.
5. **Stoğu güncel tutun.** Stokta olmayan ürünün siparişini iptal etmek mağaza performansınızı düşürür. Birden fazla kanalda satıyorsanız stoklarınızı eşitlemek için [stok takibi rehberimize](/blog/e-ticarette-stok-takibi-fazla-satis) göz atın.

## Kampanyalara katılmadan önce

Hepsiburada'da indirim dönemleri ve kampanyalar satışları hızlandırabilir; ama her kampanya kârlı değildir. Kampanyaya katılmadan önce indirimli fiyatta komisyon, kargo, hizmet bedeli ve stopaj sonrası ne kaldığını hesaplayın. Sabit kesintiler indirimle birlikte azalmadığı için %10'luk bir indirim, kârınızı çoğu zaman %10'dan çok daha fazla düşürür. Başabaş indirim oranınızı [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) önceden görmek, zararına satışın önüne geçer. Kampanyaya gireceğiniz ürünlerin stoğunu da önceden kontrol edin; kampanya sırasında tükenen ürün hem satış kaybı hem de iptal riski demektir.

## Hepsiburada ve Trendyol’u birlikte yönetmek

Hepsiburada'da satış yapan satıcıların çoğu Trendyol'da da mağaza açar; Trendyol tarafının sürecini [Trendyol mağaza açma rehberimizde](/blog/trendyol-magaza-acma-rehberi) anlattık. İki ya da daha fazla kanalda satış yapmaya başladığınızda her kanalın panelinde ayrı ayrı sipariş, stok ve fiyat takibi yapmak hem zaman alır hem de hataya açıktır: Trendyol'da satılan ürünün stoğu Hepsiburada'da düşmezse, elinizde olmayan ürünü satarsınız.

Hastürk CRM'in [Hepsiburada entegrasyonu](/entegrasyonlar/hepsiburada) bu sorunu çözer: Hepsiburada siparişleriniz ve paketleriniz diğer kanallarla aynı listeye gelir, paketi panelden oluşturup Hepsiburada'nın verdiği barkodla etiketinizi basarsınız. Bir kanalda satılan ürünün stoğu [stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) ile diğer kanallarda da düşer. Hepsiburada'nın kestiği faturalar ve hakediş kayıtları panele çekilir, böylece her siparişin gerçek kârını görürsünüz. Müşteri sorularını ve iade taleplerini de aynı panelden yönetebilir, buybox sıranızı ve rakip fiyatlarını izleyebilirsiniz.

Kayıt olmadan [canlı demoyu](/demo) inceleyebilir, kendi mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Hepsiburada'da mağaza açmak ücretli mi?

Hayır, Hepsiburada pazaryerinde mağaza açmak ücretsizdir. Satış yaptıkça komisyon, hizmet bedeli, kargo ve stopaj gibi kesintiler uygulanır.

### Şahıs şirketiyle Hepsiburada'da satış yapılır mı?

Evet. Şahıs şirketleri de Hepsiburada'da satıcı olabilir. Şahıs şirketlerinde imza sirküleri yerine imza beyannamesi istenir; ticaret siciline kayıtlı değilseniz ticaret sicil gazetesi gerekmez.

### Hepsiburada başvurusu kaç günde onaylanır?

Onay süresi, belgelerinizin eksiksiz ve doğru olmasına ve inceleme yoğunluğuna göre değişir. Eksik ya da hatalı belge onayı geciktirir; başvurunuzun durumunu ve eksik belgeleri satıcı panelinden takip edebilirsiniz.

### Hepsiburada'da hangi kargo firmasıyla çalışırım?

Gönderiler genellikle Hepsiburada'nın anlaşmalı kargo seçenekleriyle yapılır; HepsiJET de bunların arasındadır. Siparişi paketlediğinizde Hepsiburada kargo barkodunu verir, ücret desiye göre hakedişinizden düşülür.

### Hepsiburada komisyon oranları ne kadar?

Oranlar kategoriye göre değişir ve satıcı panelinizdeki komisyon tablosunda yer alır. Kendi oranınızla net kârınızı görmek için [Hepsiburada komisyon hesaplama aracını](/araclar/hepsiburada-komisyon-hesaplama) kullanabilirsiniz.

### Hepsiburada'da buybox nasıl kazanılır?

Buybox'ta fiyat önemlidir ama tek ölçüt değildir; teslimat süresi ve mağaza performansı da dikkate alınır. Rekabetçi ama kârlı bir fiyat, hızlı kargolama ve düşük iptal oranı buybox şansınızı artırır. Fiyatınızın belirlediğiniz alt sınırın altına inmeden rakibe göre ayarlanması için [buybox takibi ve otomatik fiyat](/ozellikler/buybox-takibi) özelliğimizi inceleyebilirsiniz.
`,
  },
  {
    slug: "trendyol-komisyon-orani-net-kar-hesaplama",
    title: "Trendyol Komisyon Oranları ve Net Kâr Hesaplama: Örnekli Rehber (2026)",
    seo_title: "Trendyol Komisyon Oranları 2026 ve Net Kâr Hesaplama",
    seo_desc: "Trendyol komisyonu nasıl hesaplanır? Kargo, hizmet bedeli, %1 stopaj ve KDV dahil adım adım net kâr örneği, kârı korumanın 7 yolu. Ücretsiz aracı deneyin.",
    summary: "Trendyol'da komisyon kategoriye göre değişir ve satış fiyatı üzerinden hesaplanır. Komisyon, kargo, platform hizmet bedeli, %1 stopaj ve KDV farkını içeren adım adım bir net kâr örneğiyle kârınızı nasıl doğru hesaplayacağınızı gösteriyoruz.",
    tags: ["Trendyol","Komisyon","Kâr Hesaplama","Stopaj"],
    cover: "trendyol-komisyon-kapak.jpg",
    body: `Trendyol komisyon oranı tek bir sayı değildir: ürünün kategorisine göre değişir ve her ürün için satıcı panelinizde ayrı görünür. Komisyon, ürünün **satış fiyatı üzerinden** hesaplanır; kampanyada indirim yaptıysanız indirimli fiyat esas alınır. Ancak bir satıştan elinize geçen tutarı bulmak için yalnız komisyonu değil, kargo ücretini, platform hizmet bedelini ve %1 e-ticaret stopajını da düşmeniz gerekir. Kâr ise bunlardan sonra alış maliyetinizi ve KDV farkını çıkardığınızda ortaya çıkar.

Bu yazıda Trendyol'daki kesintileri tek tek açıklıyor, gerçek rakamlarla örnek bir net kâr hesabı yapıyor ve kârınızı korumak için uygulanabilir yöntemler paylaşıyoruz. Hesabı kendi rakamlarınızla yapmak isterseniz [Trendyol komisyon hesaplama aracımız](/araclar/trendyol-komisyon-hesaplama) ücretsizdir ve kayıt gerektirmez.

## Trendyol komisyonu nasıl hesaplanır?

Trendyol'un Satıcı Bilgi Merkezi'ndeki açıklamaya göre komisyon tutarı şöyle bulunur:

**Komisyon = Satış fiyatı × Kategori komisyon oranı**

Trendyol'un kendi örneğinde %20 komisyonlu bir kategoride 100 TL'lik ürünün komisyonu 20 TL'dir. Aynı ürün kampanyada 90 TL'ye satılırsa komisyon 90 TL üzerinden hesaplanır ve 18 TL olur. Yani indirim yaptığınızda komisyon tutarı da düşer; ancak aşağıda göreceğiniz gibi kârınız indirim oranından çok daha fazla erir.

Hesapta dikkat edilmesi gereken üç nokta var:

- **Oran kategoriye göre değişir.** Aynı mağazada bir ürün düşük, diğeri yüksek komisyonlu olabilir. Doğru oran, ürünün yüklü olduğu kategorinin oranıdır.
- **Komisyon faturası KDV'lidir.** Komisyon bir hizmet bedelidir ve Trendyol size komisyon faturasını KDV ekleyerek keser. Panelde gördüğünüz oran KDV hariçse, cebinizden çıkan tutar bunun KDV eklenmiş halidir. Ödediğiniz bu KDV'yi, KDV beyannamenizde indirim konusu yapabilirsiniz.
- **İadede komisyon geri döner.** İadesi onaylanan siparişin daha önce faturalanan komisyonu, bir sonraki komisyon faturasında mahsup edilir.

### Komisyon oranımı nereden öğrenirim?

Güncel oranlar satıcı panelinizdeki komisyon bölümünde ve ürün bazında listelenir. Oranlar zaman zaman güncellendiği ve bazı dönemlerde kampanyaya bağlı özel tarifeler uygulandığı için internetteki tablolara değil, kendi panelinizdeki orana güvenin. Kategori bazında genel bir fikir edinmek için [Trendyol komisyon oranları sayfamıza](/araclar/trendyol-komisyon-oranlari) da bakabilirsiniz; ama hesap yaparken her zaman panelinizdeki oranı kullanın.

## Trendyol’da satıştan düşülen tüm kesintiler

![Satıştan net kâra: Trendyol kesintileri](https://hasturkcrm.com/img/blog/net-kar-basamaklari.jpg "Satış fiyatından net kâra giden kesinti basamakları")

| Kalem | Ne zaman uygulanır? | Nasıl hesaplanır? |
| --- | --- | --- |
| Satış komisyonu | Her satışta | Satış fiyatı × kategori oranı (+ KDV) |
| Kargo ücreti | Anlaşmalı kargoyla gönderimde | Paketin desisine göre; barem altı siparişte daha düşük |
| Platform hizmet bedeli | Sipariş başına | Sabit tutar; dönemsel güncellenir |
| E-ticaret stopajı | Her satışta | KDV hariç satış tutarı × %1 |
| Reklam | Reklam kullandıysanız | Harcadığınız bütçe kadar |
| Ceza ve diğer | Gecikme, tedarik edememe vb. oluşursa | Duruma göre |

### Kargo ücreti

Trendyol'un anlaşmalı kargo modelinde gönderinin ücreti paketin **desisine** göre belirlenir ve size kargo faturası olarak yansıtılır. Desi, paketin en × boy × yüksekliğinin (cm) 3000'e bölünmesiyle bulunur. Belirli bir sipariş tutarının altında kalan siparişlerde ise **kargo baremi** uygulanır ve desiye göre değil, sipariş tutarıyla orantılı daha düşük bir ücret yansıtılır. Kargo, düşük fiyatlı ürünlerde en büyük kesinti kalemi olabilir; desiyi nasıl düşüreceğinizi [desi rehberimizde](/blog/desi-nedir-nasil-hesaplanir) anlattık.

### Platform hizmet bedeli

Trendyol her sipariş için sabit bir platform hizmet bedeli keser. Bu bedel sepetteki ürün sayısına değil sipariş sayısına göre uygulanır ve tutarı dönem dönem güncellenir; bazı dönemlerde hızlı kargolama yapan satıcılar için daha düşük tutar uygulanmıştır. Güncel tutarı Satıcı Bilgi Merkezi'nden ve panelinizdeki faturalardan kontrol edin. Sabit bir bedel olduğu için düşük fiyatlı ürünlerde kâra etkisi orantısal olarak çok daha büyüktür.

### E-ticaret stopajı (%1)

1 Ocak 2025'ten beri pazaryerleri, satıcılara yaptıkları ödemelerden **satışın KDV hariç tutarının %1'i** oranında gelir / kurumlar vergisi kesintisi (stopaj) yapar. Bu düzenleme 7524 sayılı Kanun'la Gelir Vergisi Kanunu'na eklenen hükme ve oranı %1 olarak belirleyen 9284 sayılı Cumhurbaşkanı Kararı'na dayanır. Örneğin %20 KDV'li 1.200 TL'lik satışta stopaj 1.000 × %1 = 10 TL'dir.

Kesilen stopaj kaybolan bir para değildir: yıllık gelir ya da kurumlar vergisi beyanınızda hesaplanan vergiden mahsup edilir. Ama hakedişinizden nakit olarak düştüğü için nakit akışı hesabında ayrı bir satır olarak görülmelidir. Tek başına hesaplamak için [e-ticaret stopajı hesaplama aracını](/araclar/e-ticaret-stopaj-hesaplama) kullanabilirsiniz.

## Örnek: Trendyol’da 1.000 TL’lik satışın net kârı

Aşağıdaki örnekte tüm oranlar ve tutarlar **varsayımsaldır**; yalnızca hesabın mantığını göstermek için seçilmiştir. Kendi kategorinizin oranını ve kendi kargo tutarınızı kullanın.

**Varsayımlar:** Ürün %20 KDV'li. Satış fiyatı 1.000 TL (KDV dahil). Komisyon %20 + KDV. Kargo 80 TL (KDV dahil). Platform hizmet bedeli 13 TL (KDV dahil). Ürünün alış maliyeti 400 TL (KDV dahil, %20 KDV'li).

### 1. Adım: Hakediş (elinize geçen tutar)

| Kalem | Tutar |
| --- | --- |
| Satış fiyatı (KDV dahil) | 1.000,00 TL |
| Komisyon (%20 + KDV = %24) | −240,00 TL |
| Kargo | −80,00 TL |
| Platform hizmet bedeli | −13,00 TL |
| Stopaj (1.000 ÷ 1,20 × %1) | −8,33 TL |
| **Hakediş** | **658,67 TL** |

Toplam kesinti 341,33 TL, yani satış fiyatının yaklaşık üçte biri. Hakedişten alış maliyetini (400 TL) düştüğünüzde **258,67 TL** kalır. Pek çok satıcı hesabı burada bitirir; ama bu rakam henüz kâr değildir, çünkü KDV farkı ödenmemiştir.

### 2. Adım: KDV farkı

Müşteriye 1.000 TL'lik fatura kestiğinizde bunun 166,67 TL'si devlete ödeyeceğiniz KDV'dir. Buna karşılık komisyon, kargo, hizmet bedeli ve alış faturalarında ödediğiniz KDV'yi indirebilirsiniz:

| KDV kalemi | Tutar |
| --- | --- |
| Satıştaki KDV (hesaplanan) | 166,67 TL |
| Komisyon faturasındaki KDV | −40,00 TL |
| Kargo faturasındaki KDV | −13,33 TL |
| Hizmet bedelindeki KDV | −2,17 TL |
| Alış faturasındaki KDV | −66,67 TL |
| **Ödenecek KDV** | **44,50 TL** |

### 3. Adım: Gerçek kâr

258,67 TL − 44,50 TL = **214,17 TL**. Bu tutara, peşin ödenmiş vergi niteliğindeki 8,33 TL stopajı eklediğinizde KDV hariç kârınız **222,50 TL** olur; yani KDV hariç satış tutarının (833,33 TL) yaklaşık %26,7'si. Gelir ya da kurumlar vergisi bu kâr üzerinden ayrıca hesaplanır.

Aynı hesabı KDV hariç tutarlarla yaparak sağlamasını alabilirsiniz: 833,33 (satış) − 200,00 (komisyon) − 66,67 (kargo) − 10,83 (hizmet bedeli) − 333,33 (alış) = 222,50 TL.

> **Önemli:** Bu örnekte reklam, iade, kampanya indirimi, paketleme malzemesi, personel ve kira gibi giderler yoktur. Gerçek hayatta bunlar da kârdan düşer. Özellikle iade oranı yüksek kategorilerde, iade edilen siparişlerin gidiş-dönüş kargo maliyeti hesaba katılmadan bulunan kâr yanıltıcıdır.

## Sabit kesintiler düşük fiyatlı ürünlerde neden daha ağır?

Komisyon ve stopaj fiyatla birlikte artıp azalır; ama kargo ve platform hizmet bedeli sipariş başına neredeyse sabittir. Bu yüzden aynı kategoride, aynı komisyon oranıyla satılan iki ürünün kesinti oranı fiyatlarına göre çok farklı çıkar. Aşağıdaki tabloda yine **varsayımsal** değerler kullanıyoruz: komisyon %20 + KDV, kargo 80 TL, hizmet bedeli 13 TL, KDV %20.

| Satış fiyatı | Komisyon | Kargo + hizmet bedeli | Stopaj | Toplam kesinti | Satışa oranı |
| --- | --- | --- | --- | --- | --- |
| 150 TL | 36,00 TL | 93,00 TL | 1,25 TL | 130,25 TL | %86,8 |
| 300 TL | 72,00 TL | 93,00 TL | 2,50 TL | 167,50 TL | %55,8 |
| 1.000 TL | 240,00 TL | 93,00 TL | 8,33 TL | 341,33 TL | %34,1 |
| 2.500 TL | 600,00 TL | 93,00 TL | 20,83 TL | 713,83 TL | %28,6 |

Tablo bir gerçeği açıkça gösteriyor: düşük fiyatlı ürünlerde asıl yük komisyon değil, sabit kesintilerdir. Gerçek hayatta düşük tutarlı siparişlerde kargo baremi devreye girdiği için kargo tutarı daha düşük olabilir; yine de sipariş başı sabit maliyetler düşük fiyatlı ürünlerin marjını hızla eritir. Bu tür ürünlerde set yapmak, sepet tutarını artıracak tamamlayıcı ürünler sunmak ya da desiyi küçültmek kârlılığın anahtarıdır.

## Komisyon faturaları ve mutabakat

Trendyol, komisyon faturalarını belirli aralıklarla ve teslim edilen siparişler üzerinden düzenler; kargo faturaları da ayrıca kesilir. Satıcı panelinizdeki fatura ve mutabakat bölümlerinden sipariş bazında hangi kesintinin yapıldığını görebilirsiniz. Ayda en az bir kez şu kontrolleri yapmanızı öneririz:

- Komisyon faturasındaki oranın ürünün kategorisindeki oranla uyumlu olduğunu,
- Kargo faturasındaki desinin paketin gerçek desisiyle uyuştuğunu,
- İade edilen siparişlerin komisyonunun mahsup edildiğini,
- Hakedişe yansıyan tutarın siparişlerin toplamıyla tuttuğunu.

Bu kontrolü yüzlerce siparişte elle yapmak zordur; ama hatalı kesintiler fark edilmediğinde aylar içinde önemli bir tutara ulaşabilir.

## Kampanya ve indirimin kâra etkisi

Yukarıdaki ürünü %10 indirimle 900 TL'ye sattığınızı düşünün. Komisyon 216 TL'ye, stopaj 7,50 TL'ye düşer; kargo ve hizmet bedeli değişmez. Hakediş 900 − 216 − 80 − 13 − 7,50 = 583,50 TL olur. Alış maliyetini düştüğünüzde 183,50 TL kalır; ödenecek KDV de 150 − 36 − 13,33 − 2,17 − 66,67 = 31,83 TL'ye iner. Gerçek kâr 151,67 TL'dir.

Yani **%10'luk indirim, kârı yaklaşık %29 azalttı** (214,17 TL'den 151,67 TL'ye). Sabit kesintiler (kargo, hizmet bedeli) ve alış maliyeti indirimle birlikte azalmadığı için indirimin kâra etkisi her zaman indirim oranından büyüktür. Kampanyaya katılmadan önce [indirim sonrası kâr hesaplama aracımızla](/araclar/indirim-kar-hesaplama) başabaş indirim oranınızı görün.

## Trendyol’da kârı korumanın 7 yolu

1. **Fiyatı kesintilerden geriye doğru hesaplayın.** Alış maliyetine yüzde ekleyerek değil, hedef kârınızdan ve tüm kesintilerden geriye giderek fiyat belirleyin. [Satış fiyatı hesaplama aracı](/araclar/satis-fiyati-hesaplama) bu hesabı sizin için yapar.
2. **Doğru kategoriyi seçin.** Ürünün gerçekten ait olduğu kategoriyi seçin; yanlış kategori hem görünürlüğü hem de komisyon oranını etkiler.
3. **Desiyi küçültün.** Ürüne uygun boyutta koli kullanmak kargo maliyetini doğrudan düşürür. 1–2 cm'lik fark bir üst desi kademesine geçmenize neden olabilir.
4. **Düşük fiyatlı ürünleri set yapın.** Sabit hizmet bedeli ve kargo, düşük fiyatlı ürünlerde kârın büyük kısmını alır. İkili ya da üçlü setler sipariş başına sabit maliyetleri böler.
5. **Kargo faturalarını kontrol edin.** Faturadaki desi, ürününüzün gerçek desisinden büyükse itiraz edin. Ürünlerinize desi bilgisi girmek bu kontrolü kolaylaştırır.
6. **İade nedenlerini takip edin.** Beden, renk ya da açıklama kaynaklı iadeler ürün sayfası düzeltilerek azaltılabilir. Her iade, gidiş-dönüş kargo maliyeti demektir.
7. **Kanalları karşılaştırın.** Aynı ürün farklı pazaryerlerinde farklı kâr bırakır. [Pazaryeri kâr karşılaştırma aracıyla](/araclar/kar-karsilastirma) aynı ürünü kanal kanal karşılaştırabilirsiniz.

## Her siparişin kârını tek tek hesaplamak zorunda değilsiniz

Yukarıdaki hesap tek bir ürün için bile birkaç adım sürüyor. Günde onlarca sipariş alan bir mağazada her siparişi elle hesaplamak mümkün değildir; üstelik gerçek kargo ücreti ancak kargo faturası kesildikten sonra belli olur.

Hastürk CRM'in [gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümü bu hesabı her sipariş için kendiliğinden yapar: Trendyol'un kestiği komisyon, kargo, hizmet bedeli, reklam ve ceza faturaları otomatik çekilir, tahmini değil gerçek kargo tutarı siparişe işlenir ve ciro → komisyon → kargo → hizmet bedeli → stopaj → reklam ve ceza → iade kaybı → işletme giderleri → net kâr basamakları tek ekranda görünür. Hangi satışın parasının ne zaman hesabınıza geçeceğini hakediş takviminde izlersiniz; zarar eden ürünler için uyarı alırsınız.

Panelin nasıl çalıştığını kayıt olmadan [canlı demoda](/demo) görebilir, kendi [Trendyol mağazanızı](/entegrasyonlar/trendyol) bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol komisyonu KDV dahil fiyattan mı hesaplanır?

Komisyon, ürünün müşteriye satıldığı fiyat üzerinden hesaplanır. Komisyon bir hizmet bedeli olduğu için Trendyol bunun faturasını KDV ekleyerek keser. Panelde gördüğünüz oranın KDV hariç mi dahil mi olduğuna dikkat edin; KDV hariç orana KDV eklendiğinde cebinizden çıkan tutarı bulursunuz.

### Trendyol komisyon oranları neden ürünlere göre farklı?

Oranlar kategoriye ve alt kategoriye göre belirlenir. Elektronik gibi düşük marjlı kategorilerde oranlar genellikle daha düşük, moda gibi kategorilerde daha yüksektir. Kendi ürünlerinizin oranını satıcı panelinizde görebilirsiniz.

### İade olan siparişin komisyonu geri alınır mı?

Evet. İadesi onaylanan siparişin daha önce faturalanan komisyonu, bir sonraki komisyon faturasında mahsup edilir. Ancak gidiş ve dönüş kargo ücretleri genellikle satıcıda kalır; bu yüzden iade oranı kârı doğrudan etkiler.

### Trendyol stopajı nasıl hesaplanır?

Satışın KDV hariç tutarının %1'i olarak hesaplanır. %20 KDV'li 1.200 TL'lik bir satışta stopaj 1.000 × %1 = 10 TL'dir. Trendyol bu tutarı hakedişinizden keser ve sizin adınıza vergi dairesine yatırır; tutar yıllık beyanınızda ödenecek vergiden mahsup edilir.

### Hakedişim ne zaman yatar?

Vade, siparişin müşteriye teslim tarihinden itibaren işler. Vadesi dolan siparişlerin tutarından kesintiler düşülerek kalan hakediş hesabınıza aktarılır. Güncel vade sürenizi satıcı panelinizin finans bölümünden görebilirsiniz.

### Trendyol mu Hepsiburada mı daha kârlı?

Bu tamamen ürününüzün kategorisine, fiyatına ve desisine bağlıdır; her kanalın komisyon oranı, hizmet bedeli ve kargo tarifesi farklıdır. Aynı ürünü iki kanalda karşılaştırmak için [kâr karşılaştırma aracını](/araclar/kar-karsilastirma), Hepsiburada tarafının hesabı için [Hepsiburada komisyon hesaplama aracını](/araclar/hepsiburada-komisyon-hesaplama) kullanabilirsiniz.
`,
  },
  {
    slug: "trendyol-magaza-acma-rehberi",
    title: "Trendyol'da Mağaza Açma ve Satış Yapma Rehberi (2026)",
    seo_title: "Trendyol Mağaza Açma 2026: Şartlar, Belgeler, Adımlar",
    seo_desc: "Trendyol'da satış yapmak için şartlar, gerekli belgeler, e-fatura hazırlığı, başvuru adımları, kargo ve komisyon bilgisi. Adım adım rehberi şimdi okuyun.",
    summary: "Trendyol'da mağaza açmak ücretsizdir; faal bir şahıs, limited ya da anonim şirket yeterlidir. Şirket ve e-fatura hazırlığından başvuru adımlarına, ürün yükleme, kargo, komisyon ve ilk 90 günde dikkat edilecek noktalara kadar her şeyi anlatıyoruz.",
    tags: ["Trendyol","Mağaza Açma","Pazaryeri","Rehber"],
    cover: "trendyol-magaza-acma-kapak.jpg",
    body: `Trendyol'da mağaza açmak ücretsizdir ve başvuru tamamen internet üzerinden yapılır. Temel şart, adınıza kayıtlı ve faal bir işletmenizin olmasıdır: şahıs şirketi, limited ya da anonim şirket fark etmez. Başvuru formunu doldurup e-posta adresinizi doğruladıktan sonra şirket bilgileriniz kontrol edilir, sözleşme onaylanır ve mağazanız ürün yüklemeye açılır. Trendyol mağaza açılışı için kira, üyelik ya da pazarlama bedeli almaz; kazancı, gerçekleşen satışlardan kestiği komisyondur.

Bu rehberde Trendyol'da satış yapmaya başlamak için gereken her şeyi sırasıyla anlatıyoruz: şirket kurulumu, e-fatura hazırlığı, başvuru adımları, ilk ürünleri yükleme, kargo modeli, komisyon ve kesintiler, ilk aylarda dikkat edilmesi gerekenler. Sonunda da en sık sorulan soruları yanıtlıyoruz.

## Trendyol’da satış yapmak için şartlar nelerdir?

Trendyol'un Satıcı Bilgi Merkezi'ndeki açıklamaya göre satıcı olmak için **anonim, limited ya da şahıs şirketi türünde bir işletmeniz** olmalıdır. Ayrıca Gelir İdaresi Başkanlığı kayıtlarına göre işletmenizin **aktif faaliyette olması ve fatura kesebiliyor olması** gerekir. Başvuru formunda şahıs şirketleri T.C. kimlik numarasını, diğer şirket türleri vergi kimlik numarasını girer; vergi dairesi bilgisi sistemden otomatik gelir.

Kısacası "şirketsiz" ya da bireysel olarak Trendyol'da mağaza açılamaz. Henüz şirketiniz yoksa ilk adım vergi mükellefi olmaktır.

### Şahıs şirketi mi, limited şirket mi?

Yeni başlayan satıcıların çoğu **şahıs şirketi** ile başlar; çünkü kuruluşu daha hızlı ve masrafı daha düşüktür. Limited şirket ise ortaklı yapılar, yatırım almayı düşünenler ya da cirosu belirli bir seviyeyi aşınca vergi avantajı arayanlar için tercih edilir. Hangisinin size uygun olduğunu tahmini cironuza ve ortaklık yapınıza göre bir mali müşavirle birlikte belirlemeniz en doğrusudur.

| | Şahıs şirketi | Limited şirket |
| --- | --- | --- |
| Kuruluş | Vergi dairesine işe başlama bildirimi; görece hızlı | Ticaret sicil tescili, ana sözleşme, sermaye |
| Kuruluş masrafı | Düşük | Daha yüksek (noter, sicil, sermaye) |
| Sorumluluk | Şirket sahibi tüm varlığıyla sorumlu | Ortaklar kural olarak sermaye payı kadar sorumlu |
| Vergi | Kazanca göre artan oranlı gelir vergisi | Kurumlar vergisi + kâr dağıtımında stopaj |
| Muhasebe | Genellikle daha basit | Bilanço esası, daha kapsamlı |
| Trendyol'da başvuru | TCKN ile | VKN ile |

### Hangi belgeler hazır olmalı?

Trendyol başvurusu çevrim içi yapıldığı için belgelerin çoğu formda girdiğiniz bilgilerle ve resmi kayıtlarla eşleştirilir. Yine de başvuru öncesinde şunları hazırlamanız işinizi hızlandırır:

- **Vergi levhası** ve vergi kimlik numarası (şahıs şirketinde T.C. kimlik numarası)
- **İmza sirküleri** (şahıs şirketlerinde imza beyannamesi)
- Limited / anonim şirketlerde **ticaret sicil gazetesi** ve MERSİS bilgisi
- **Şirket adına açılmış banka hesabı** (IBAN): hakedişler bu hesaba yatar
- Şirket yetkilisinin iletişim bilgileri ve kullanılabilir bir e-posta adresi
- Markalı ürün satacaksanız **marka tescil belgesi** ya da marka sahibinden alınmış **yetki / fatura** gibi belgeler

Başvuru sırasında ya da sonrasında Trendyol ek belge isteyebilir. İstenen belgeleri satıcı panelinden yüklersiniz.

## e-Fatura, e-Arşiv ve e-İmza hazırlığı

Pazaryerinde satış yaptığınız her sipariş için müşteriye fatura düzenlemeniz gerekir. Trendyol'un açıklamasına göre elektronik fatura kesebilmek için **şahıs firmaları elektronik imza (e-imza), şahıs firması olmayanlar ise mali mühür** edinmelidir. Bunun yanında bir e-fatura / e-arşiv hizmet sağlayıcısından fatura kontörü almanız gerekir.

İnternet üzerinden satış yapan işletmeler için e-fatura ve e-arşive geçiş eşiği, genel eşikten daha düşük tutulmuştur. Eşikler ve geçiş tarihleri Vergi Usul Kanunu tebliğleriyle zaman zaman güncellendiğinden, kendi durumunuzu mutlaka mali müşavirinizle kontrol edin. Pratikte pazaryeri satıcılarının büyük kısmı en baştan e-arşiv / e-fatura ile çalışmayı tercih eder; hem müşteriye fatura göndermek hem de sonradan geçiş zahmetinden kurtulmak için.

> **İpucu:** e-İmza ya da mali mührün size ulaşması birkaç gün sürebilir. Başvuruyu yaparken bu işlemi de paralel başlatırsanız mağazanız onaylandığında fatura kesmeye hazır olursunuz.

## Trendyol mağaza açma adımları

![Trendyol'da mağaza açma adımları](https://hasturkcrm.com/img/blog/trendyol-magaza-acma-adimlar.jpg "Trendyol'da mağaza açma sürecinin ana adımları")

1. **Şirketinizi kurun ya da bilgilerini hazırlayın.** Vergi levhanız, IBAN'ınız ve imza sirküleriniz elinizde olsun.
2. **Başvuru formunu doldurun.** Trendyol'un satıcı sayfasındaki "Pazaryeri'ne Başvur" bağlantısıyla Satıcı Başvuru Formu'na ulaşırsınız. Şirket türünüzü, TCKN / VKN bilginizi, faaliyet gösterdiğiniz il ve ilçeyi, satış yapacağınız kategoriyi girin. Ad-soyad alanına şirket yetkilisinin bilgileri yazılır.
3. **E-postanızı doğrulayın.** Forma yazdığınız adrese gelen doğrulama e-postasındaki adımı tamamlayın.
4. **Bilgilerinizi ve sözleşmeyi tamamlayın.** Satıcı panelinde istenen şirket, banka ve iletişim bilgilerini girin, satıcı sözleşmesini onaylayın, istenirse belgeleri yükleyin.
5. **Mağaza ayarlarını yapın.** Mağaza adınızı, logo ve iletişim bilgilerinizi, iade ve sevkiyat adreslerinizi, çalışacağınız kargo modelini belirleyin.
6. **Ürünlerinizi yükleyin.** Tek tek, Excel şablonuyla ya da bir entegrasyon yazılımıyla ürünlerinizi gönderin. Ürünler onaylandıktan sonra satışa açılır.
7. **İlk siparişinizi hazırlayın.** Siparişi onaylayın, faturanızı kesin, kargo etiketinizi basın ve belirttiğiniz sürede kargoya teslim edin.

Trendyol mağaza açılışı ve başvuru için ücret talep etmez. Bu yüzden "Trendyol'a başvuru ücreti" adıyla sizden para isteyen aracılara itibar etmeyin.

## Ne satacağınıza karar vermek

Mağaza açmadan önce cevaplamanız gereken en önemli soru, hangi ürünlerle başlayacağınızdır. Doğru ürün seçimi, ilk aylarda satış yakalayıp yakalamayacağınızı büyük ölçüde belirler. Ürün seçerken şu sorulara cevap arayın:

- **Talep var mı?** Ürünü Trendyol'da aradığınızda kaç satıcı çıkıyor, ürünlerin yorum sayıları ne düzeyde? Hiç rakibi olmayan bir ürün bazen talep olmadığının işaretidir.
- **Rekabet ne kadar yoğun?** Aynı ürünü çok sayıda satıcı aynı fiyattan satıyorsa, fiyat dışında öne çıkmanız zordur. Kendi markanız, farklı bir set ya da farklı bir varyant fark yaratabilir.
- **Kesintiler sonrası kâr kalıyor mu?** Komisyon, kargo, hizmet bedeli ve stopaj sonrası kârınızı hesaplayın. Düşük fiyatlı ve hacimli ürünlerde kargo, kârın büyük kısmını alabilir.
- **Tedarik sürekli mi?** İyi satan bir ürünün stoğu bittiğinde sıralamada kaybettiğiniz yeri geri kazanmak zaman alır. Tedarikçinizin sürekliliğinden emin olun.
- **İade riski yüksek mi?** Beden, renk ya da beklenti farkı nedeniyle sık iade alan kategorilerde, gidiş-dönüş kargo maliyetini fiyatlamaya dahil edin.
- **Belge gerektiriyor mu?** Markalı ürünler, kozmetik, gıda ya da elektronik gibi kategorilerde ek belgeler istenebilir; başvuru öncesinde bunları hazırlayın.

İlk aşamada az sayıda ama iyi tanıdığınız ürünle başlamak, operasyonu öğrenirken hata yapma riskinizi azaltır. Satışlar oturdukça ürün yelpazenizi genişletirsiniz.

## Mağaza puanı, yorumlar ve görünürlük

Trendyol'da müşteriler satın alma kararı verirken ürün yorumlarına ve mağaza puanına bakar. Mağaza puanınız; zamanında kargolama, iptal ve iade oranları, müşteri soru yanıt süresi ve müşteri değerlendirmeleri gibi operasyonel performansınızla şekillenir. Bu yüzden ilk siparişlerden itibaren:

- Paketlemeye özen gösterin; ürünün hasarsız ve özenli bir paketle ulaşması olumlu yorum ihtimalini artırır.
- Siparişleri söz verdiğiniz sürede, mümkünse daha erken kargolayın.
- Olumsuz yorumlara savunmacı değil, çözüm odaklı yaklaşın; sorunu düzeltip ürün sayfanızı güncelleyin.
- Hızlı kargo ve teslimat performansına bağlı etiketler ve rozetler, ürünlerinizin listede öne çıkmasına yardım edebilir; güncel kriterleri Satıcı Bilgi Merkezi'nden takip edin.

## İlk ürünlerinizi doğru yüklemek

Mağaza açıldıktan sonra satışın belirleyicisi ürün sayfalarınızdır. Trendyol'da müşteriler çoğunlukla arama ve filtrelerle ürüne ulaşır; bu yüzden ürün bilgilerinin eksiksiz ve doğru olması hem görünürlüğü hem de iade oranını doğrudan etkiler.

### Ürün yüklerken kontrol listesi

- **Doğru kategori:** Ürünü en uygun alt kategoriye ekleyin. Kategori, hem komisyon oranınızı hem de müşterinin hangi filtrelerde sizi bulacağını belirler.
- **Zorunlu özellikler:** Renk, beden, malzeme, garanti gibi kategori özelliklerini boş bırakmayın; filtrelerde görünmeniz buna bağlıdır.
- **Barkod ve stok kodu:** Her varyant için benzersiz barkod kullanın. Aynı barkodu farklı ürünlerde kullanmak eşleştirme sorunlarına yol açar.
- **Başlık:** Marka + ürün tipi + ayırt edici özellik (model, ölçü, renk) düzeninde, gereksiz büyük harf ve sembol kullanmadan yazın.
- **Görseller:** Beyaz ya da sade arka planlı, ürünün farklı açılarını ve ölçüsünü gösteren net fotoğraflar kullanın.
- **Açıklama:** Müşterinin satın almadan önce soracağı soruları (ölçü, içerik, kullanım, bakım) açıklamada yanıtlayın.
- **Desi bilgisi:** Ürünün paketlenmiş halinin ölçüsünü girin; kargo faturalarınızın kontrolünde kullanılır.
- **Sevkiyat (termin) süresi:** Gerçekten uyabileceğiniz bir hazırlık süresi seçin. Geciken siparişler mağaza performansınızı düşürür.

### Fiyatı belirlemeden önce hesap yapın

Pek çok yeni satıcı fiyatı, alış maliyetinin üzerine "göz kararı" bir kâr ekleyerek belirler ve ilk ay sonunda komisyon, kargo, hizmet bedeli ve stopaj düşülünce beklediğinden çok daha az kazandığını fark eder. Fiyat vermeden önce ürün başına net kârınızı hesaplayın. Bunun için ücretsiz [Trendyol komisyon hesaplama aracımızı](/araclar/trendyol-komisyon-hesaplama) ya da hedef kârınıza göre fiyat bulan [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) kullanabilirsiniz.

## Trendyol’da kargo nasıl çalışır?

Trendyol'da iki temel kargo modeli vardır:

- **Trendyol anlaşmalı kargo:** Siparişin kargo barkodu Trendyol üzerinden oluşturulur ve gönderiler Trendyol'un anlaştığı kargo firmalarıyla, Trendyol'un anlaşmalı fiyatlarıyla taşınır. Kargo ücreti size kargo faturası olarak yansıtılır ve hakedişinizden düşülür. Yeni başlayanların çoğu bu modelle çalışır; ayrı bir kargo anlaşması yapmanız gerekmez.
- **Kendi kargo anlaşmanız:** Kargo firmasıyla kendi sözleşmenizi yapıp gönderileri kendi hesabınızdan çıkarırsınız. Bu modelde Trendyol sizin adınıza kargo ücreti hesaplamaz; ücreti doğrudan kargo firmasına ödersiniz.

Anlaşmalı kargoda ücret, paketin **desisine** göre belirlenir. Desi, paketin en × boy × yükseklik ölçüsünün (cm) 3000'e bölünmesiyle bulunur ve gerçek ağırlıkla karşılaştırılır. Desinin nasıl hesaplandığını ve nasıl düşürüleceğini [desi rehberimizde](/blog/desi-nedir-nasil-hesaplanir) ayrıntılı anlattık; hızlıca hesaplamak için [desi hesaplama aracını](/araclar/desi-hesaplama) kullanabilirsiniz.

Trendyol ayrıca belirli bir sipariş tutarının altında kalan siparişler için **kargo baremi** uygular: bu siparişlerde desiye göre değil, sipariş tutarıyla orantılı daha düşük bir kargo ücreti yansıtılır. Barem tutarı ve kapsamı dönem dönem güncellendiği için güncel değerleri satıcı panelinden ve Satıcı Bilgi Merkezi'nden takip edin.

## Trendyol komisyonu ve diğer kesintiler

Trendyol'da her satıştan şu kalemler düşülür:

| Kesinti | Nasıl belirlenir? |
| --- | --- |
| Satış komisyonu | Kategoriye göre değişen oran × satış fiyatı (kampanyada indirimli fiyat üzerinden) |
| Kargo ücreti | Anlaşmalı kargoda paketin desisine göre; barem altı siparişlerde daha düşük tutar |
| Platform hizmet bedeli | Sipariş başına sabit tutar; dönemsel olarak güncellenir |
| E-ticaret stopajı | Satışın KDV hariç tutarının %1'i; pazaryeri keser ve vergi dairesine yatırır |
| Reklam, ceza vb. | Kullandıysanız ya da oluştuysa ayrıca faturalanır |

Komisyon oranları kategoriye, hatta alt kategoriye göre değişir ve satıcı panelinizde ürün bazında görünür. Oranlar zaman zaman güncellendiği için bu yazıda kesin bir rakam vermiyoruz; örnekli bir hesap ve kesintilerin tamamı için [Trendyol komisyon oranları ve net kâr hesaplama rehberimize](/blog/trendyol-komisyon-orani-net-kar-hesaplama) göz atın. E-ticaret stopajını tek başına hesaplamak isterseniz [stopaj hesaplama aracı](/araclar/e-ticaret-stopaj-hesaplama) işinizi görür.

### Ödemeler ne zaman gelir?

Trendyol'da ödeme vadesi, siparişin **müşteriye teslim tarihinden** itibaren işler. Vadesi dolan siparişlerin tutarından komisyon ve diğer kesintiler düşülerek kalan hakediş hesabınıza aktarılır. Vade süreleri kategoriye ve satıcıya göre farklılık gösterebilir; güncel vadenizi satıcı panelinizdeki finans bölümünden görebilirsiniz. Nakit akışınızı planlarken satış ile paranın hesabınıza geçmesi arasında birkaç haftalık fark olabileceğini hesaba katın.

## İlk 90 günde dikkat etmeniz gerekenler

Mağazanın ilk ayları, performans puanınızın ve müşteri yorumlarınızın oluştuğu dönemdir. Bu dönemde yapılan hatalar sonraki aylarda görünürlüğünüzü etkiler.

1. **Siparişleri zamanında kargolayın.** Belirttiğiniz sevkiyat süresini aşmayın; gecikmeler hem müşteri memnuniyetini hem de mağaza puanınızı düşürür.
2. **Stoğu gerçekçi tutun.** Elinizde olmayan ürünü satıp iptal etmek, satıcı kaynaklı iptal olarak kaydedilir. Başka bir kanalda da satış yapıyorsanız stoklarınızı mutlaka eşitleyin; bu konuyu [e-ticarette stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) anlattık.
3. **Müşteri sorularını hızlı yanıtlayın.** Satın almadan önce soru soran müşteri, hızlı yanıt alırsa çoğunlukla satın alır.
4. **İadeleri sistemli yönetin.** İade nedenlerini not edin; aynı nedenle gelen iadeler genellikle ürün açıklamasındaki ya da görsellerdeki bir eksiği gösterir.
5. **Kampanyalara hesaplı katılın.** Kampanya indirimi komisyon tutarını da düşürür, ama kâr marjınızı daha çok düşürür. Katılmadan önce indirimli fiyattaki kârınızı [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) kontrol edin.
6. **Ciroya değil kâra bakın.** Satışların artması her zaman kârın arttığı anlamına gelmez. Ürün bazında net kârınızı ayda en az bir kez gözden geçirin.

## Satışlar büyüdüğünde: birden fazla kanal

Trendyol'da düzenli satış yakalayan satıcıların çoğu bir süre sonra Hepsiburada, N11 ya da kendi e-ticaret siteleri gibi ek kanallar açar. Aynı ürünü birden fazla yerde satmak satışı artırır; ama her kanalın siparişini, stoğunu ve fiyatını ayrı panellerde takip etmek kısa sürede yönetilemez hale gelir. Hepsiburada'da satıcı olmayı düşünüyorsanız [Hepsiburada mağaza açma rehberimizi](/blog/hepsiburada-satici-olma-magaza-acma) de okuyabilirsiniz.

Bu noktada bir pazaryeri entegrasyon yazılımı devreye girer: siparişler tek listeye gelir, bir kanalda satılan ürünün stoğu diğer kanallarda kendiliğinden düşer, fiyat ve ürün güncellemeleri tek yerden yapılır. Ne zaman entegrasyona ihtiyaç duyulduğunu ve doğru yazılımı nasıl seçeceğinizi [pazaryeri entegrasyonu rehberimizde](/blog/pazaryeri-entegrasyonu-nedir) anlattık.

## Trendyol mağazanızı Hastürk CRM ile yönetin

Hastürk CRM, Trendyol'un resmi API'si üzerinden çalışan bir satış yönetim panelidir. [Trendyol entegrasyonu](/entegrasyonlar/trendyol) ile siparişleriniz panele kendiliğinden gelir; ortak barkodlu kargo etiketlerinizi panelden basarsınız; komisyon, kargo ve hizmet bedeli faturaları Trendyol'dan çekilerek her siparişin gerçek kârı hesaplanır. Müşteri sorularını yanıtlayabilir, iade taleplerini yönetebilir, isterseniz buybox durumunuzu da izleyebilirsiniz. İleride Hepsiburada, N11 ya da ikas gibi kanallar eklediğinizde stoklarınız tüm kanallarda eşit kalır.

Kayıt olmadan [canlı demo panelini](/demo) inceleyebilir, beğenirseniz kendi mağazanızı bağlayıp [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol'da mağaza açmak ücretli mi?

Hayır. Trendyol'un açıklamasına göre başvuru ve mağaza açılışı ücretsizdir; mağaza kirası, müşteri hizmetleri ücreti ya da pazarlama bedeli gibi adlarla ücret alınmaz. Satış yaptıkça komisyon ve hizmet bedeli gibi kesintiler uygulanır.

### Şirketim olmadan Trendyol'da satış yapabilir miyim?

Hayır. Trendyol'da satıcı olmak için şahıs, limited ya da anonim şirket türünde, faal ve fatura kesebilen bir işletmeniz olmalıdır. En hızlı yol genellikle şahıs şirketi kurmaktır.

### Trendyol başvurusu ne kadar sürede onaylanır?

Süre; bilgilerinizin eksiksiz olmasına, belge kontrolüne ve yoğunluğa göre değişir. Bilgileriniz resmi kayıtlarla uyumluysa ve istenen belgeleri zamanında yüklerseniz süreç hızlanır. Başvurunuzun durumunu satıcı panelinden takip edebilirsiniz.

### Trendyol komisyon oranı ne kadar?

Komisyon oranı kategoriye göre değişir ve satıcı panelinizde ürün bazında görünür. Komisyon, ürünün satış fiyatı üzerinden hesaplanır; kampanyada indirimli fiyat esas alınır. Kendi oranınızla net kârınızı görmek için [Trendyol komisyon hesaplama aracını](/araclar/trendyol-komisyon-hesaplama) kullanabilirsiniz.

### Trendyol'da hangi ürünleri satabilirim?

Yasal olarak satışı serbest olan ürünlerin çoğunu satabilirsiniz. Bazı kategoriler (örneğin markalı ürünler, kozmetik, gıda, elektronik) ek belge isteyebilir; markalı ürünlerde marka tescil ya da yetki belgesi istenebilir. Satışı yasak ya da kısıtlı ürünler için Trendyol'un satıcı kurallarını kontrol edin.

### Trendyol'da kargo ücretini kim öder?

Anlaşmalı kargo modelinde kargo ücreti satıcıya kargo faturası olarak yansıtılır ve hakedişten düşülür. Ücret, paketin desisine göre hesaplanır; belirli tutarın altındaki siparişlerde barem uygulaması nedeniyle daha düşük bir ücret yansıtılır. Kendi kargo anlaşmanızla çalışıyorsanız ücreti kargo firmasına siz ödersiniz.
`,
  },
];
