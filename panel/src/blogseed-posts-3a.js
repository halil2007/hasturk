// Üçüncü parti hazır blog yazıları (bkz. blogseed.js, biçim blogseed-posts.js ile aynı)
export const POSTS_3A = [
  {
    slug: "trendyol-satis-artirma-yollari",
    title: "Trendyol'da Satışları Artırmanın 12 Yolu: Görünürlük, Dönüşüm ve Kâr (2026)",
    seo_title: "Trendyol Satış Artırma: Satışları Artırmanın 12 Yolu",
    seo_desc: "Trendyol'da satışlarınızı artırın: başlık, görsel, fiyat, buybox, kampanya, teslimat ve satıcı puanı için 12 adım ve haftalık kontrol listesi. Okuyun.",
    summary: "Trendyol'da satışlar görünürlük, dönüşüm ve operasyonun birlikte iyileştirilmesiyle kalıcı olarak artar. Ürün başlığı ve görsellerden fiyat, buybox, kampanya ve kupon seçimine, teslimat süresinden satıcı puanına kadar 12 uygulanabilir adımı ve haftalık kontrol rutinini anlatıyoruz.",
    tags: ["Trendyol","Satış Artırma","Pazaryeri","Strateji"],
    cover: "trendyol-satis-artirma-kapak.jpg",
    body: `Trendyol'da satışları artırmanın kalıcı yolu, üç şeyi aynı anda iyileştirmektir: **görünürlük** (ürününüzün aramada ve kategori listelerinde müşterinin önüne çıkması), **dönüşüm** (ürün sayfasına gelen müşterinin sepete eklemesi) ve **operasyon** (zamanında kargo, düşük iptal, iyi satıcı puanı). Yalnız fiyat kırarak gelen satış artışı kısa sürer ve çoğu zaman kârı da götürür. Ürün sayfasını, fiyatı, kampanya seçimini ve teslimatı birlikte ele aldığınızda ise hem satış adedi hem de sipariş başına kâr artar.

Bu yazıda Trendyol'da satışları artırmak için uygulayabileceğiniz 12 adımı, her adımda neye dikkat etmeniz gerektiğini ve haftalık bir kontrol rutinini anlatıyoruz. Trendyol'da yeni başlıyorsanız önce [Trendyol mağaza açma rehberimize](/blog/trendyol-magaza-acma-rehberi) göz atabilirsiniz.

## Trendyol'da satış neye bağlıdır?

Bir ürünün satış adedini üç sayının çarpımı gibi düşünmek, nereye odaklanacağınızı netleştirir:

**Satış = Görüntülenme × Tıklama oranı × Dönüşüm oranı**

- **Görüntülenme:** Ürününüzün arama sonuçlarında, kategori listelerinde ve kampanya sayfalarında kaç kez gösterildiği.
- **Tıklama oranı:** Ürününüzü görenlerin kaçının ürün sayfasına girdiği. Ana görsel, fiyat, etiketler ve değerlendirme puanı bu oranı belirler.
- **Dönüşüm oranı:** Ürün sayfasına girenlerin kaçının satın aldığı. Görseller, açıklama, beden ve özellik bilgisi, teslimat süresi, yorumlar ve satıcı puanı burada devreye girer.

Aşağıdaki örnek tamamen **varsayımsaldır** ve yalnız mantığı göstermek içindir:

| Durum | Görüntülenme | Tıklama oranı | Ziyaret | Dönüşüm oranı | Sipariş |
| --- | --- | --- | --- | --- | --- |
| Başlangıç | 10.000 | %3 | 300 | %4 | 12 |
| Daha iyi ana görsel | 10.000 | %4 | 400 | %4 | 16 |
| Görsel + daha iyi ürün sayfası | 10.000 | %4 | 400 | %5 | 20 |

Görüntülenme hiç değişmeden, yalnız tıklama ve dönüşüm iyileştirildiğinde sipariş sayısı 12'den 20'ye çıkıyor. Görüntülenmeyi artırmak (kampanya, reklam, arama sıralaması) çoğu zaman para ya da kâr fedakârlığı ister; tıklama ve dönüşümü artırmak ise çoğunlukla emek ister. Bu yüzden önce ürün sayfanızı düzeltip sonra görünürlüğe yatırım yapmak daha verimlidir.

![Trendyol satış hunisi: görüntülenme, tıklama, ürün sayfası ve sipariş aşamaları ile her aşamayı etkileyen unsurlar](https://hasturkcrm.com/img/blog/trendyol-satis-hunisi.jpg "Satış hunisinin her aşamasında farklı bir kaldıraç çalışır")

## Görünürlük ve tıklama için 4 adım

### 1. Ürün başlığını müşterinin aradığı kelimelerle yazın

Müşteri Trendyol'da "kadın keten gömlek" ya da "çelik termos 500 ml" gibi somut ifadelerle arar. Başlığınızda bu ifadeler yoksa ürününüz o aramalarda zor bulunur. Trendyol'un geliştirici dokümanına göre ürün adı alanı **en fazla 100 karakterdir**; bu alanı en önemli bilgilerle doldurun:

- Marka + ürün türü + ayırt edici özellik (malzeme, kapasite, model) + gerekiyorsa renk ya da ölçü.
- Aynı kelimeyi tekrar tekrar yazmayın; okunaksız başlık tıklamayı düşürür.
- "En ucuz", "orijinal", "kampanyalı" gibi ürünü tanımlamayan ifadeleri kullanmayın.

### 2. Ana görseli tıklatacak şekilde hazırlayın

Arama sonuçlarında müşterinin ilk gördüğü şey ana görseldir. Trendyol'un geliştirici dokümanında ürün görselleri için **1200 × 1800 piksel ve 96 dpi** ölçüsü belirtilir ve bir barkoda **en fazla 8 görsel** eklenebilir. Ana görselde ürünü net, ışığı düzgün ve kadrajı dolduracak şekilde gösterin. Diğer görsellerde farklı açılar, ölçü bilgisi, kullanım anı ve detay çekimleri olsun. Başka bir satıcının görselini izinsiz kullanmayın; bu hem telif hem de pazaryeri kuralı sorunudur.

### 3. Özellik alanlarını eksiksiz doldurun

Kategori sayfasındaki filtreler (renk, beden, malzeme, kapasite gibi) ürün kartındaki özellik alanlarından beslenir. Bir özelliği boş bıraktığınızda, o filtreyi kullanan müşterinin listesinde ürününüz çıkmayabilir. Zorunlu alanların yanında isteğe bağlı alanları da doldurmak, ürününüzün daha fazla filtrede görünmesini sağlar.

### 4. Doğru kategoride listeleyin

Yanlış kategori, ürünün hem yanlış müşteriye gösterilmesine hem de yanlış komisyon oranının uygulanmasına yol açabilir. Ürününüzü en spesifik alt kategoriye yükleyin. Kategori değiştiğinde komisyon oranı da değişebileceği için mağazanıza özel güncel oranı her zaman satıcı panelinizden kontrol edin.

## Dönüşüm için 4 adım

### 5. Açıklamada müşterinin sorusunu önceden cevaplayın

İyi bir ürün açıklaması, müşterinin satın almadan önce soracağı soruları cevaplar: ölçüler, malzeme, kullanım ve bakım, kutu içeriği, uyumluluk, garanti. Ürün sayfanıza sık gelen soruları açıklamaya eklemek hem dönüşümü artırır hem de soru yükünüzü azaltır. Açıklamaya iletişim bilgisi, başka site adresi ya da kargo vaadi gibi pazaryeri kurallarına aykırı içerik yazmayın.

### 6. Fiyatı kesintilerden geriye doğru belirleyin

Satışı artırmanın en hızlı ama en riskli yolu fiyat düşürmektir. Fiyatı belirlerken komisyon, kargo, hizmet bedeli ve %1 stopajı baştan hesaba katın; her ürün için başabaş fiyatınızı ve kabul edebileceğiniz en düşük kârı bilin. Yöntemi [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) anlattık; tek bir ürün için hızlı hesap yapmak isterseniz [Trendyol komisyon hesaplama aracını](/araclar/trendyol-komisyon-hesaplama) kullanabilirsiniz.

### 7. Buybox'ı takip edin

Aynı ürünü başka satıcılar da satıyorsa, ürün sayfasındaki "Sepete ekle" düğmesi tek bir satıcıya bağlıdır. Buybox sizde değilse ürün sayfanız ne kadar iyi olursa olsun satışların çoğu rakibe gider. Trendyol'un Satıcı Bilgi Merkezi'ne göre satıcı puanı, buybox uygulamasında görünürlüğünüzü belirleyen unsurlardan biridir; fiyat, teslimat süresi ve stok da önemlidir. Ayrıntıları [Trendyol buybox rehberimizde](/blog/trendyol-buybox-nedir-nasil-kazanilir) bulabilirsiniz.

### 8. Teslimat süresini kısaltın

Ürün sayfasında görünen tahmini teslimat bilgisi müşterinin kararını doğrudan etkiler. Ürün kartında tanımladığınız kargoya teslim süresini, gerçekten tutturabileceğiniz en kısa süreye çekin. Bu süreyi kısaltıp tutturamamak ise daha kötüdür: geciken siparişler satıcı puanınızı düşürür. Siparişleri her gün aynı saatte toplayıp paketlemek, kargoya teslim süresini tutturmanın en basit yoludur.

## Kampanya, etiket ve kuponlar: seçerek katılın

### 9. Kampanyaya katılmadan önce kampanya fiyatındaki kârı hesaplayın

Trendyol kampanya dönemlerinde, seçili ürünlerde indirim oranına göre **Avantajlı Ürün, Çok Avantajlı Ürün ve Süper Avantajlı Ürün** etiketleri gösterir (bu etiketler daha önce bir ila üç yıldızlı "yıldızlı ürün" etiketi olarak gösteriliyordu). Etiketli ürünler müşterinin gözüne daha kolay çarpar; ama etiket fiyatına inmek her üründe kârlı değildir.

Kampanyaya ürün eklemeden önce şu soruları sorun:

- Kampanya fiyatında komisyon, kargo, hizmet bedeli ve stopaj sonrası sipariş başına ne kalıyor?
- Sipariş başına kâr düştüğüne göre, aynı toplam kârı korumak için kaç adet daha satmam gerekir?
- Kampanya süresince satacağım adet kadar stoğum var mı?

İndirimli fiyattaki kârınızı ve başabaş indirim oranınızı [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) önceden görebilirsiniz. Ayrıca 1 Ağustos 2026'da yürürlüğe giren yönetmelik değişikliğiyle, indirimli satışlarda indirim öncesi fiyat olarak indirimin başladığı tarihten önceki **son 10 günde uygulanan en düşük fiyat** esas alınır. Kampanyadan hemen önce fiyatı yükseltip indirimi büyük göstermek hem mevzuata aykırıdır hem de idari yaptırım riski taşır.

### 10. Kuponları hedefli kullanın

Trendyol satıcı panelinde mağazanıza özel kupon tanımlayabilirsiniz. Satıcı rehberlerinde öne çıkan kullanım şekilleri, ürünü ziyaret edip satın almayan müşterilere ve mağazanızı takip edenlere özel kuponlardır. Kupon, tüm ürünlerde kalıcı indirim yapmaktan daha kontrollü bir yoldur: indirimi yalnız satın almaya yakın müşteriye verirsiniz. Kupon tutarını belirlerken de aynı kâr hesabını yapın; kupon tutarı sizin kârınızdan çıkar.

Reklam da görünürlüğü artırmanın bir yoludur; ancak reklam bütçesini, dönüşümü düşük bir ürün sayfasına harcamak para kaybıdır. Önce ürün sayfasını ve fiyatı düzeltin, sonra reklamla görünürlüğü artırın; reklama harcadığınız tutarı da ürün kârından düşerek değerlendirin. Reklam için en uygun ürünler; buybox'ı sizde olan, stoğu yeterli, değerlendirme puanı iyi ve sipariş başına kârı reklam maliyetini kaldırabilen ürünlerdir.

## Operasyon: satışları korumak için 2 adım

### 11. Stok kesintisini ve satıcı kaynaklı iptali sıfıra yaklaştırın

Stoğu biten ürün satılmaz; stokta görünüp aslında olmayan ürün ise iptale dönüşür. Birden fazla kanalda satıyorsanız, bir kanalda satılan ürünün diğer kanallarda da hemen düşmesi gerekir. Aksi halde satıcı kaynaklı iptal hem müşteriyi kaybettirir hem de satıcı puanınızı düşürür. Bu sorunun nedenlerini ve çözümünü [stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) anlattık.

### 12. Satıcı puanınızı ve müşteri sorularını yönetin

Trendyol'un Satıcı Bilgi Merkezi'ne göre satıcı puanını etkileyen göstergeler **müşteri metrikleri** ve **operasyon metrikleri** olmak üzere iki başlık altında izlenir. Müşteri tarafında siparişlerinize ve ürünlerinize verilen puanlar, operasyon tarafında ise tedarik edememe ve zamanında kargoya teslim gibi göstergeler yer alır. Puanınızı ve sizi düşüren metrikleri satıcı panelinizdeki satıcı puanı ekranından takip edin.

Müşteri sorularını hızlı ve net cevaplamak da hem dönüşümü hem de mağaza deneyimini iyileştirir. Yanıtsız kalan her soru, satın almaya hazır bir müşterinin rakibe gitme ihtimalidir. İade nedenlerini düzenli inceleyin; yanlış beden ya da eksik bilgi kaynaklı iadeler ürün sayfası düzeltilerek azaltılabilir.

## Yeni ürüne ilk satışları nasıl kazandırırsınız?

Hiç satışı ve değerlendirmesi olmayan yeni bir ürün, aynı ürünü uzun süredir satan rakiplerin yanında zor fark edilir. İlk haftalarda şu sırayla ilerleyin:

1. **Ürün kartını eksiksiz yayına alın.** Başlık, 8 görsele kadar görsel seti, tüm özellik alanları ve açıklama ilk günden tam olsun; eksik kartla başlayıp sonra düzeltmek, ilk ziyaretçileri boşa harcar.
2. **Başlangıç fiyatını kârlı ama rekabetçi seçin.** Başabaş fiyatınızın üstünde kalarak benzer ürünlerin fiyat aralığına girin.
3. **Hedefli kupon kullanın.** Ürünü ziyaret edip almayanlara ya da mağaza takipçilerine özel kupon, genel indirimden daha az kâr götürür.
4. **Kârlı olduğu kampanyalara katılın.** Kampanya fiyatında kâr kalıyorsa ilk görünürlüğü kampanya sayfalarından kazanabilirsiniz.
5. **İlk siparişleri kusursuz gönderin.** İlk müşterilerin değerlendirmeleri sonraki müşterilerin kararını etkiler; özenli paketleme ve zamanında kargo burada en iyi yatırımdır.

Değerlendirme toplamak için kestirme yollara başvurmayın. Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği'ne göre tüketici değerlendirmelerini yalnızca ürünü satın alan kişiler yapabilir; sahte ya da karşılığı ödenmiş yorumlar haksız ticari uygulama sayılır ve idari yaptırım riski taşır.

## Hangi ürünle başlamalı?

Bütün kataloğu aynı anda iyileştirmeye çalışmak yerine en çok kazandıran ürünlerden başlayın:

| Ürün grubu | Belirti | İlk yapılacak |
| --- | --- | --- |
| Çok görüntülenen, az tıklanan | Görüntülenme yüksek, ziyaret düşük | Ana görsel, başlık, fiyat |
| Çok ziyaret edilen, az satan | Ziyaret yüksek, sipariş düşük | Açıklama, görseller, beden/özellik bilgisi, yorumlar |
| Çok satan ama az kazandıran | Adet yüksek, kâr düşük | Fiyat, kargo desisi, kampanya katılımı |
| Buybox'ı kaybedilen | Ürün sayfası rakipte | Fiyat alt sınırı, teslimat süresi, stok |
| İadesi yüksek | İade oranı kategori ortalamasının üstünde | Ürün bilgisi, ölçü tablosu, paketleme |

Bu tabloyu her ay kendi verinizle doldurduğunuzda, emeğinizi en çok getiri sağlayacak ürünlere harcamış olursunuz.

![Trendyol satışlarını artırmak için haftalık kontrol listesi](https://hasturkcrm.com/img/blog/trendyol-haftalik-satis-rutini.jpg "Her hafta 30 dakikada yapılabilecek satış kontrol rutini")

## Haftalık satış kontrol rutini

- Geçen haftanın en çok satan ve en çok kazandıran 10 ürününü karşılaştırın; çok satıp az kazandıranları işaretleyin.
- Buybox'ı kaybettiğiniz ilanlarda fiyat, teslimat süresi ve stok farkına bakın.
- Stoğu birkaç gün içinde bitecek ürünlerin siparişini verin.
- Geciken ve iptal edilen siparişlerin nedenini not edin, tekrarlanmasını önleyin.
- Yanıtsız müşteri sorusu bırakmayın; sık gelen soruları ürün açıklamasına ekleyin.
- Önümüzdeki kampanyalara katılacağınız ürünlerin kampanya fiyatındaki kârını hesaplayın.
- Satıcı puanı ekranında düşen metrik varsa nedenini bulun.

## Hastürk CRM ile satışlarınızı tek panelden yönetin

Satış artırmanın büyük kısmı ölçmekle başlar: hangi ürün kazandırıyor, hangisi stoksuz kaldı, hangi siparişte kâr komisyon ve kargoya gitti? Hastürk CRM'de [Trendyol mağazanızı](/entegrasyonlar/trendyol) bağladığınızda siparişler 15 dakikada bir panele gelir; komisyon, kargo, hizmet bedeli ve reklam faturaları Trendyol'dan çekilir ve her siparişin gerçek kârı [kâr-zarar](/ozellikler/kar-zarar) ekranında görünür. Stoklarınız diğer kanallarla eşit kalır, buybox sıranızı ve rakip fiyatlarını izleyebilir, müşteri sorularını panelden yanıtlayabilirsiniz.

Paket içeriklerini [paketler sayfasında](/paketler) karşılaştırabilir, paneli [canlı demoda](/demo) inceleyebilir ya da kendi mağazanızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol'da satışlar neden aniden düşer?

En sık nedenler buybox'ın rakibe geçmesi, stoğun bitmesi ya da ilanın pasife düşmesi, fiyat değişikliği, kampanya döneminin bitmesi ve satıcı puanındaki düşüştür. Önce satışı düşen ürünlerde buybox ve stok durumuna, ardından satıcı puanı ekranındaki metriklere bakın.

### Trendyol'da ürün başlığı kaç karakter olmalı?

Trendyol'un geliştirici dokümanına göre ürün adı en fazla 100 karakter olabilir. Bu sınırı kelime doldurmak için değil, müşterinin arayacağı bilgileri (marka, ürün türü, ayırt edici özellik, varyant) okunur şekilde yazmak için kullanın.

### Kampanyalara katılmak satışları her zaman artırır mı?

Kampanya ve etiketler görünürlüğü artırabilir; ama kampanya fiyatında kârınız düşer. Katılmadan önce kampanya fiyatındaki sipariş başına kârı ve aynı toplam kârı korumak için gereken ek satış adedini hesaplayın. Kârı negatife düşen ürünle kampanyaya girmeyin.

### Satıcı puanı satışları etkiler mi?

Evet. Trendyol'un Satıcı Bilgi Merkezi'ne göre satıcı puanı, buybox uygulamasında ve mobil uygulama bildirimlerinde görünürlüğünüzü belirleyen unsurlardan biridir. Ayrıca puan, müşterinin satın alma kararında güven unsuru olarak ürün sayfasında görünür.

### Fiyatı düşürmeden satış artırılabilir mi?

Evet. Ana görsel, başlık, özellik alanları ve açıklama iyileştirmeleri tıklama ve dönüşüm oranını artırır; teslimat süresini kısaltmak, stok kesintisini önlemek ve soruları hızlı yanıtlamak da fiyat değiştirmeden satışı artırır. Fiyat ancak bunlardan sonra değerlendirilmesi gereken bir kaldıraçtır.

### Hangi ürünlere öncelik vermeliyim?

Çok görüntülenip az tıklanan, çok ziyaret edilip az satan ve çok satıp az kazandıran ürünlerden başlayın. Bu ürünlerde küçük iyileştirmeler bile toplam satış ve kâra en büyük katkıyı yapar.
`,
  },
  {
    slug: "hepsiburada-satis-artirma",
    title: "Hepsiburada'da Satış Artırma: Görünürlük, Buybox ve Kampanya Rehberi (2026)",
    seo_title: "Hepsiburada Satış Artırma: Buybox, Kampanya, Görünürlük",
    seo_desc: "Hepsiburada'da satışlarınızı artırın: ürün sayfası, buybox, mağaza puanı, HepsiLojistik ve kampanyada kâr hesabı örneklerle. Kontrol listesini alın.",
    summary: "Hepsiburada'da satış; ürün sayfası, teklif (fiyat, teslimat, buybox) ve mağaza performansıyla belirlenir. Buybox etkenlerini, Rekabet Kurulu kararının etkisini, mağaza puanını, kampanyaya girmeden önce kâr hesabını ve satış artırma kontrol listesini anlatıyoruz.",
    tags: ["Hepsiburada","Satış Artırma","Buybox","Kampanya"],
    cover: "hepsiburada-satis-artirma-kapak.jpg",
    body: `Hepsiburada'da satışları artırmak için üç alanda güçlü olmanız gerekir: **ürün sayfası** (müşterinin ürünü bulması ve güvenmesi), **teklif** (fiyat, teslimat süresi ve buybox) ve **mağaza performansı** (zamanında kargo, düşük iptal ve iade, hızlı yanıt). Hepsiburada'da aynı ürün tek bir ürün sayfasında listelendiği için satışın büyük kısmı, o sayfada "Sepete ekle" düğmesinin bağlı olduğu satıcıya gider. Bu yüzden Hepsiburada'da satış artırmanın merkezinde buybox vardır; ama buybox'ı kalıcı olarak elde tutmanın yolu yalnız fiyat değil, mağaza performansıdır.

Bu yazıda Hepsiburada'da görünürlüğü, buybox'ı ve kampanyaları ele alıyor, kampanyaya girmeden önce kârınızı nasıl kontrol edeceğinizi örnekle gösteriyoruz. Hepsiburada'da henüz mağazanız yoksa önce [Hepsiburada satıcı olma rehberimizi](/blog/hepsiburada-satici-olma-magaza-acma) okuyabilirsiniz.

## Hepsiburada'da satışı ne belirler?

Hepsiburada'da satış, ürün bazında iki soruya bağlıdır: Müşteri ürünü buluyor mu ve bulduğunda sizden mi alıyor? İlki ürün sayfası ve görünürlükle, ikincisi teklifiniz ve buybox ile ilgilidir.

| Alan | Neyi etkiler? | Sizin kontrolünüzde olanlar |
| --- | --- | --- |
| Ürün sayfası | Aramada bulunma, tıklama, satın alma kararı | Başlık, görseller, özellik alanları, açıklama, kategori |
| Teklif | Buybox ve müşterinin seçimi | Fiyat, kargoya teslim süresi, stok |
| Mağaza performansı | Buybox, müşteri güveni, yaptırım riski | Zamanında kargo, iptal, iade, soru ve taleplere dönüş |
| Kampanya ve reklam | Görünürlük | Hangi ürünle, hangi fiyattan katılacağınız |

Bu dört alanın her biri diğerini etkiler. Örneğin kampanyaya girip stoğunuz yetmezse iptal oluşur, iptal mağaza performansınızı düşürür, düşen performans da buybox şansınızı azaltır.

## Ürün sayfası: mevcut ürüne mi satıcı olmalı, yeni ürün mü açmalı?

Hepsiburada'da satmak istediğiniz ürün katalogda zaten varsa, genellikle mevcut ürün sayfasına kendi teklifinizi eklersiniz. Bu durumda ürün içeriği ortaktır ve rekabet teklif üzerinden yapılır. Ürün katalogda yoksa ürün kartını siz oluşturursunuz ve içeriğin kalitesi doğrudan sizin satışınızı etkiler.

Yeni ürün açarken şunlara dikkat edin:

- **Başlık:** Marka, ürün türü, ayırt edici özellik ve varyant bilgisini okunur sırayla yazın. Müşterinin arama kutusuna yazacağı kelimeler başlıkta olsun.
- **Görseller:** Ana görselde ürünü sade bir zeminde, net ve kadrajı dolduracak şekilde gösterin. Görsellerde logo, yazı ve filigran kullanmayın; ölçü ve kullanım görsellerini ana görselden sonra ekleyin. Güncel görsel ölçü kurallarını satıcı panelinizdeki ürün yükleme ekranından kontrol edin.
- **Özellik alanları:** Kategori filtreleri bu alanlardan beslenir. Boş bırakılan özellik, ürünü o filtreyi kullanan müşterinin listesinden çıkarabilir.
- **Barkod:** Aynı ürünü farklı barkodla açmak ya da farklı bir ürünü mevcut sayfaya eklemek hem müşteri şikâyetine hem de pazaryeri yaptırımına yol açabilir.

Mevcut bir ürün sayfasına teklif ekliyorsanız, ürünün gerçekten aynı ürün olduğundan (aynı model, aynı içerik, aynı paket) emin olun. Yanlış eşleşme, iade ve olumsuz değerlendirme olarak geri döner.

## Buybox: Hepsiburada'da satışların anahtarı

Hepsiburada'da aynı ürünü birden fazla satıcı sattığında, ürün sayfasında müşterinin ilk gördüğü fiyat ve "Sepete ekle" düğmesi tek bir satıcıya aittir. Diğer satıcılar ürün sayfasındaki diğer satıcılar listesinde kalır. Hepsiburada, buybox'ı belirleyen ölçütlerin ağırlıklarını yayımlamaz; satıcı kaynaklarında tutarlı şekilde öne çıkan etkenler fiyat, kargoya teslim süresi, mağaza performansı ve stok durumudur.

![Hepsiburada'da buybox'ı etkileyen dört unsur: fiyat, teslimat süresi, mağaza performansı ve stok](https://hasturkcrm.com/img/blog/hepsiburada-buybox-etkenleri.jpg "Buybox yalnız fiyatla değil, dört unsurun birlikte değerlendirilmesiyle belirlenir")

### Rekabet Kurulu kararı ne değiştirdi?

Rekabet Kurulu, Hepsiburada'nın satıcılara sunduğu otomatik fiyatlandırma mekanizması hakkında yürüttüğü soruşturmayı 3 Ekim 2024 tarihli kararla, şirketin verdiği taahhütleri kabul ederek sonlandırdı. Kamuoyuna duyurulan taahhütlere göre otomatik fiyatlandırma aracından "Buybox Fiyatına Eşitle" seçeneği kaldırıldı ve aracın kullanılıp kullanılmaması buybox algoritmasında bir ölçüt olarak dikkate alınmayacak. Satıcı açısından anlamı şudur: pazaryerinin fiyat aracını kullanmak tek başına buybox avantajı sağlamaz; belirleyici olan teklifinizin ve performansınızın kendisidir.

### Buybox'ı kazanmak ve korumak için

1. **Alt fiyat sınırınızı bilin.** Komisyon, kargo ve %1 stopaj sonrası başabaş fiyatınızın altına inmeyin. Hepsiburada'da kategori komisyon oranları KDV hariç listelenir; kesintiyi hesaplarken komisyonun KDV'sini de ekleyin. Kategorinizin oranını [Hepsiburada komisyon oranları sayfamızda](/araclar/hepsiburada-komisyon-oranlari) arayabilir, tek ürün için [Hepsiburada komisyon hesaplama aracını](/araclar/hepsiburada-komisyon-hesaplama) kullanabilirsiniz.
2. **Kargoya teslim sürenizi kısaltın ve tutturun.** Kısa süre tanımlayıp geciktirmek, uzun süre tanımlamaktan daha zararlıdır.
3. **Stoğu kesintisiz tutun.** Stoğu biten teklif buybox'a giremez. Birden fazla kanalda satıyorsanız stoklarınızın eşit kalması gerekir.
4. **Satıcı kaynaklı iptali önleyin.** İptalin en yaygın nedeni, başka bir kanalda satılmış ürünün stokta görünmeye devam etmesidir.
5. **Buybox sizdeyken fiyatı gereksiz düşük bırakmayın.** Rakibin fiyatını izleyin; ikinci satıcıyla aranızda büyük fark varsa kârınızı geri kazanabilirsiniz.

Buybox'ın ayrıntılı işleyişini ve alt fiyat hesabını [buybox rehberimizde](/blog/trendyol-buybox-nedir-nasil-kazanilir) örnekle anlattık; anlatılan yöntem Hepsiburada için de geçerlidir.

## Mağaza performansı: görünmeyen sıralama faktörü

Hepsiburada, mağaza performansını satıcı panelinde mağaza puanı ve operasyon göstergeleriyle izlemenizi sağlar. Satıcı rehberlerinde bu puanı etkilediği aktarılan başlıca göstergeler şunlardır: müşterilerin satış sonrası değerlendirmeleri, sipariş iptal oranı, iade oranı, siparişin zamanında kargoya verilmesi, müşteri sorularına ve taleplerine dönüş süresi, faturanın eksiksiz iletilmesi ve eksik, hatalı ya da hasarlı ürün gönderilmemesi. Hesaplama yöntemini ve güncel eşikleri satıcı panelinizden kontrol edin.

Bu göstergelerin ortak noktası, hepsinin günlük operasyonla ilgili olmasıdır. Puanı yükseltmenin kestirme yolu yoktur; ama şu alışkanlıklar çoğu göstergeyi birlikte iyileştirir:

- Siparişleri her gün belirli saatlerde toplayın, paketleyin ve kargoya verin.
- Geciken ya da gecikme riski taşıyan siparişleri sabah ilk iş kontrol edin.
- Müşteri sorularını aynı gün yanıtlayın; sık gelen soruları ürün açıklamasına ekleyin.
- Faturayı siparişle birlikte eksiksiz iletin.
- Paketlemeden önce ürünü, varyantı ve adedi kontrol edin; hatalı gönderi hem iade hem de olumsuz değerlendirme demektir.

### Faturayı ve iade sürecini ihmal etmeyin

Mağaza performansı yalnız kargo hızıyla ölçülmez. Faturanın siparişle birlikte eksiksiz iletilmesi ve iade taleplerinin zamanında sonuçlandırılması da müşteri deneyiminin parçasıdır. İade talebini uzun süre bekletmek müşterinin şikâyete ve düşük değerlendirmeye yönelmesine yol açar. İade nedenlerini düzenli inceleyip tekrar eden nedenleri ürün sayfasında ya da paketlemede düzeltmek, hem iade oranını hem de değerlendirme puanını iyileştirir.

### Lojistiği dışarıya vermek: HepsiLojistik

Hepsiburada ekosisteminde satıcılara depolama, paketleme ve kargolama hizmeti veren HepsiLojistik bulunur. Ürünlerinizi bu hizmete gönderdiğinizde sipariş hazırlama ve kargoya verme işini lojistik merkezi üstlenir. Kendi deponuzda yeterli personeliniz yoksa ya da sipariş hacminiz dalgalıysa değerlendirilebilecek bir seçenektir. Ücretleri ve koşulları satıcı panelinizden öğrenip kendi depo maliyetinizle karşılaştırarak karar verin.

## Kampanyalar: önce kâr, sonra katılım

Hepsiburada yıl içinde Efsane Kasım gibi büyük indirim dönemleri ve Premium üyelere özel indirim günleri gibi kampanyalar düzenler; bu kampanyalarda satıcılı ürünler de yer alabilir. Kampanya görünürlüğü artırır, ama indirimli fiyatta sabit kesintiler (kargo, alış maliyeti) azalmadığı için kârınız indirim oranından çok daha hızlı düşer.

Aşağıdaki örnekte tüm tutarlar **varsayımsaldır**: ürün %20 KDV'li, alış maliyeti 450 TL, kargo 70 TL (ikisi de KDV dahil), komisyon %15 + KDV, stopaj KDV hariç satış tutarının %1'i. Kâr KDV hariç gösterilmiştir.

| Satış fiyatı (KDV dahil) | İndirim | Komisyon (KDV dahil) | Hakediş | Sipariş başına kâr |
| --- | --- | --- | --- | --- |
| 1.000 TL | – | 180,00 TL | 741,67 TL | 241,67 TL |
| 900 TL | %10 | 162,00 TL | 660,50 TL | 174,17 TL |
| 850 TL | %15 | 153,00 TL | 619,92 TL | 140,42 TL |
| 800 TL | %20 | 144,00 TL | 579,33 TL | 106,67 TL |

%10'luk indirim sipariş başına kârı yaklaşık %28, %20'lik indirim ise yaklaşık %56 düşürüyor. Bu üründe başabaş fiyatı yaklaşık 641,98 TL; yani yaklaşık %35,8'den büyük bir indirim her satışta zarar demektir. %20 indirimle kampanyaya girdiğinizde aynı toplam kârı korumak için satış adedinizin 2,27 katına çıkması gerekir (241,67 ÷ 106,67).

![Kampanya kâr kontrolü: indirim oranı arttıkça sipariş başına kârın düşüşü ve başabaş noktası](https://hasturkcrm.com/img/blog/hepsiburada-kampanya-kar-kontrolu.jpg "Varsayımsal örnek: %15 + KDV komisyonlu üründe indirim ve kâr ilişkisi")

Kendi ürünleriniz için bu hesabı [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) saniyeler içinde yapabilirsiniz. Kampanyaya katılacağınız ürünleri seçerken şu kuralı uygulayın: **kâr kalan, stoğu yeten ve buybox'ını tutabileceğiniz ürünlerle girin.**

İndirim duyururken mevzuatı da unutmayın: 1 Ağustos 2026'da yürürlüğe giren Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği değişikliğiyle, indirim öncesi fiyat olarak indirimin başladığı tarihten önceki son 10 günde uygulanan en düşük fiyat esas alınır. Kampanya öncesinde fiyatı yükseltip indirimi büyük göstermek idari yaptırım riski taşır.

### Kampanya takvimine hazırlık

Büyük indirim dönemlerinden birkaç hafta önce hazırlığa başlayın: katılacağınız ürünleri ve kampanya fiyatlarını belirleyin, stoğu ve paketleme malzemesini artırın, kargoya teslim kapasitenizi kontrol edin. Kampanya sırasında geciken sipariş ve satıcı kaynaklı iptal, mağaza performansınızı kampanya bittikten sonra da etkiler.

### Reklam ne zaman mantıklı?

Hepsiburada'da reklam, ürününüzü arama sonuçlarında ve ilgili sayfalarda öne çıkararak görünürlük sağlar. Reklam bütçesini en iyi değerlendiren ürünler; buybox'ı sizde olan, ürün sayfası güçlü, stoğu yeterli ve sipariş başına kârı reklam maliyetini kaldırabilecek ürünlerdir. Buybox'ı rakipte olan bir ürünün reklamını vermek, rakibin ürün sayfasına trafik taşımak anlamına gelebilir.

## Hangi ürünlerle başlamalı?

Bütün kataloğu aynı anda iyileştirmeye çalışmak yerine ürünlerinizi birkaç gruba ayırıp en çok getiri sağlayacak gruptan başlayın:

| Ürün grubu | Belirti | İlk yapılacak |
| --- | --- | --- |
| Buybox'ı kaybedilen çok satanlar | Ürün sayfası trafik alıyor ama satış rakibe gidiyor | Fiyat alt sınırı, kargoya teslim süresi, stok |
| Kendi açtığınız ürün kartları | Görüntülenme ya da ziyaret düşük | Başlık, ana görsel, özellik alanları |
| Ziyaret alıp satmayanlar | Ürün sayfası ikna etmiyor | Görsel seti, açıklama, soru-cevaplar |
| Çok satıp az kazandıranlar | Adet yüksek, sipariş başına kâr düşük | Fiyat, kargo desisi, kampanya katılımı |
| İadesi yüksek olanlar | İade nedeni tekrar ediyor | Ürün bilgisi, ölçü tablosu, paketleme |

Her ay bu tabloyu kendi verinizle güncellediğinizde, emeğinizi en çok satış ve kâr getirecek ürünlere ayırmış olursunuz.

### Birden fazla kanalda satıyorsanız

Hepsiburada'yı Trendyol, N11 ya da kendi sitenizle birlikte kullanıyorsanız en büyük operasyon riski stok farkıdır. Bir kanalda satılan ürün diğerlerinde stoktan düşmezse, aynı ürünü iki kez satarsınız ve biri iptale dönüşür. Satıcı kaynaklı iptal hem müşteriyi kaybettirir hem de mağaza puanınızı ve buybox şansınızı düşürür. Bu sorunun nedenlerini ve çözümünü [stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) anlattık. Kampanya dönemlerinde sipariş hızı arttığı için bu risk daha da büyür; kampanyaya girmeden önce stok eşitlemesinin çalıştığından emin olun.

## Hepsiburada satış artırma kontrol listesi

- En çok satan 20 ürününüzde buybox kimde? Kaybettiklerinizde fiyat, teslimat süresi ve stok farkı ne?
- Her ürün için başabaş fiyatınız ve en düşük kabul edilebilir fiyatınız belirli mi?
- Kargoya teslim süreniz tutturabileceğiniz en kısa süre mi?
- Son 30 günde geciken, iptal edilen ve iade edilen siparişlerin nedenleri biliniyor mu?
- Yanıtsız müşteri sorusu ya da talebi var mı?
- Kendi açtığınız ürün kartlarında başlık, görsel ve özellik alanları eksiksiz mi?
- Yaklaşan kampanyalar için ürün bazında kampanya fiyatındaki kâr hesaplandı mı, stok yeterli mi?

## Hastürk CRM ile Hepsiburada mağazanızı yönetin

Hastürk CRM'de [Hepsiburada mağazanızı](/entegrasyonlar/hepsiburada) bağladığınızda siparişlerinizi ve paketlerinizi panelden yönetir, Hepsiburada'nın verdiği barkodla kargo etiketini basarsınız. Stok ve fiyatlarınız diğer kanallarla eşit kalır; müşteri sorularını yanıtlar, iade taleplerini yönetirsiniz. Hepsiburada'nın kestiği faturalar ve hakediş kayıtları panele geldiği için her siparişin gerçek kârını görürsünüz.

[Buybox takibi ve otomatik fiyat](/ozellikler/buybox-takibi) özelliğiyle Hepsiburada ilanlarınızın buybox sırasını ve rakip fiyatlarını izleyebilirsiniz. Kural tanımladığınız ilanlarda buybox rakibe geçtiğinde fiyatınız, belirlediğiniz en düşük fiyatın altına inmeden rakibin altına çekilir. Buybox takibi [Profesyonel ve Kurumsal paketlerde](/paketler) yer alır. Paneli [canlı demoda](/demo) inceleyebilir, kendi mağazanızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Hepsiburada'da buybox neye göre belirlenir?

Hepsiburada ölçütlerin ağırlıklarını yayımlamaz. Satıcı kaynaklarında fiyat, kargoya teslim süresi, mağaza performansı ve stok durumu belirleyici etkenler olarak öne çıkar. Fiyatınız en düşük olsa bile teslimat ya da performans farkı nedeniyle buybox başka satıcıda kalabilir.

### Hepsiburada'nın otomatik fiyat aracını kullanmak buybox şansımı artırır mı?

Rekabet Kurulu'nun 3 Ekim 2024 tarihli kararıyla kabul edilen taahhütlere göre aracın kullanılıp kullanılmaması buybox algoritmasında ölçüt olarak dikkate alınmaz. Araç yalnız fiyatınızı belirlediğiniz kurala göre değiştirir.

### Kampanyaya katılmak her zaman kârlı mı?

Hayır. İndirimli fiyatta kargo ve alış maliyeti gibi sabit giderler azalmadığı için kâr indirim oranından daha hızlı düşer. Katılmadan önce kampanya fiyatındaki sipariş başına kârı ve başabaş indirim oranını hesaplayın.

### Hepsiburada komisyonu KDV dahil mi?

Hepsiburada'nın kategori komisyon oranları KDV hariç listelenir; kesilen tutar komisyonun KDV'siyle birlikte hesaplanır. Örneğin %15 oranlı bir kategoride KDV dahil kesinti satış fiyatının %18'idir. Mağazanıza özel oranı satıcı panelinizden kontrol edin.

### Mağaza puanım düşükse ne yapmalıyım?

Satıcı panelinizde puanı düşüren göstergeyi bulun. Çoğu zaman neden geciken kargo, satıcı kaynaklı iptal ya da geç yanıtlanan sorulardır. Bu göstergeler operasyon alışkanlıklarıyla düzeldikçe puan da toparlanır.

### Hepsiburada'da satış artırmak için reklam şart mı?

Şart değildir. Önce ürün sayfası, fiyat, buybox ve mağaza performansı düzeltilmelidir. Reklam, bu temel sağlam olduğunda ve sipariş başına kâr reklam maliyetini karşıladığında görünürlüğü artırmanın etkili bir yoludur.
`,
  },
  {
    slug: "pazaryeri-urun-listeleme-optimizasyonu",
    title: "Pazaryerinde Ürün Listeleme Optimizasyonu: Başlık, Açıklama, Görsel ve Özellik Alanları (Ürün SEO'su Rehberi)",
    seo_title: "Pazaryeri Ürün SEO'su: Başlık, Açıklama ve Görsel Rehberi",
    seo_desc: "Pazaryerinde ürün listeleme nasıl optimize edilir? Başlık formülü, görsel planı, özellik alanları, açıklama yapısı ve yayın öncesi kontrol listesi. Okuyun.",
    summary: "Ürün listeleme optimizasyonu, ürün kartını pazaryeri aramasında bulunacak ve ürün sayfasında satın aldıracak şekilde hazırlamaktır. Anahtar kelime araştırmasını, başlık formülünü, Trendyol görsel ölçülerini, özellik alanlarını, açıklama yapısını ve yayın öncesi kontrol listesini anlatıyoruz.",
    tags: ["Ürün SEO","Ürün Listeleme","Pazaryeri","Trendyol"],
    cover: "urun-listeleme-optimizasyonu-kapak.jpg",
    body: `Pazaryerinde ürün listeleme optimizasyonu, ürün kartınızı hem **pazaryeri aramasında bulunacak** hem de **ürün sayfasında satın aldıracak** şekilde hazırlamaktır. Buna kısaca "pazaryeri ürün SEO'su" da denir. Dört parçadan oluşur: müşterinin aradığı kelimeleri içeren bir **başlık**, ürünü her açıdan gösteren bir **görsel seti**, filtrelerde çıkmanızı sağlayan eksiksiz **özellik alanları** ve müşterinin sorularını önceden cevaplayan bir **açıklama**. Bunlara doğru kategori, doğru barkod ve düzgün varyant yapısı eklendiğinde ürününüz hem daha çok görünür hem de daha az iade alır.

Bu yazıda her parçayı Trendyol, Hepsiburada, N11 ve idefix gibi pazaryerlerinde uygulanabilecek şekilde anlatıyor, başlık formülü, görsel planı ve yayın öncesi kontrol listesi veriyoruz. Henüz mağaza açma aşamasındaysanız [Trendyol](/blog/trendyol-magaza-acma-rehberi) ve [Hepsiburada](/blog/hepsiburada-satici-olma-magaza-acma) mağaza açma rehberlerimize de göz atabilirsiniz.

## Pazaryeri araması nasıl çalışır?

Pazaryerleri arama sıralamasında hangi ölçütleri hangi ağırlıkla kullandığını yayımlamaz. Ancak bir ürünün sıralamaya girebilmesi için önce **aranan ifadeyle eşleşmesi** gerekir. Eşleşme büyük ölçüde ürün kartındaki bilgilerden kurulur: başlık, kategori, marka ve özellik alanları. Müşteri bir filtre seçtiğinde (örneğin "Renk: Lacivert", "Malzeme: Pamuk") o filtrenin değeri ürün kartınızda yoksa ürününüz listeden düşer.

Eşleştikten sonra hangi ürünün üstte görüneceğinde satış performansı, fiyat, müşteri değerlendirmeleri ve stok gibi etkenlerin rol oynadığı genel kabul görür. Bu etkenlerin çoğu ürün sayfasının kalitesine bağlıdır: Tıklanmayan bir görsel ya da müşteriyi ikna etmeyen bir açıklama satış performansını düşürür, düşük performans da sıralamayı. Bu yüzden ürün SEO'su yalnız kelime yerleştirmek değil, ürün sayfasını satış yapacak hale getirmektir.

## Adım 1: Anahtar kelime araştırması

Başlığı ve açıklamayı yazmadan önce müşterinin ürününüzü hangi kelimelerle aradığını bulun. Bunun için ücretli araç gerekmez:

- **Pazaryeri arama kutusu:** Ürün türünü yazmaya başladığınızda çıkan otomatik tamamlama önerileri, müşterilerin gerçekten kullandığı ifadeleri gösterir.
- **Kategori filtreleri:** Kategori sayfasındaki filtre adları ve değerleri, pazaryerinin ürünleri nasıl sınıflandırdığını gösterir. Bu değerleri özellik alanlarında aynen kullanın.
- **Çok satan rakip ürünler:** Kategorinizde öne çıkan ürünlerin başlıklarında hangi bilgilerin hangi sırayla yazıldığına bakın. Kopyalamak için değil, müşterinin beklediği bilgileri görmek için.
- **Müşteri soruları ve yorumları:** Müşterilerin ürünü anlatırken kullandığı kelimeler (örneğin "dar kalıp", "sızdırmaz", "makinede yıkanabilir") hem başlık hem açıklama için değerli kelimelerdir.

Bulduğunuz ifadeleri üç gruba ayırın: **ana kelime** (ürün türü: "termos"), **niteleyiciler** (malzeme, kapasite, kullanım: "çelik, 500 ml, çay") ve **varyant bilgisi** (renk, beden). Başlıkta ana kelime ve en önemli niteleyiciler, özellik alanlarında hepsi yer alsın.

## Adım 2: Başlık

Başlık, hem aramada eşleşmenin hem de arama sonuçlarında tıklanmanın en önemli parçasıdır. Trendyol'un geliştirici dokümanına göre ürün adı alanı **en fazla 100 karakterdir**; diğer pazaryerlerinde de sınırlar vardır ve uzun başlıklar listede kısaltılarak gösterilir. Bu yüzden en önemli bilgileri başa yazın.

![Pazaryeri ürün başlığı formülü: marka, ürün türü, ayırt edici özellik ve varyant](https://hasturkcrm.com/img/blog/urun-basligi-formulu.jpg "İyi bir başlık, müşterinin arayacağı bilgileri okunur bir sırayla verir")

**Başlık formülü: Marka + Ürün türü + Ayırt edici özellik + Varyant**

| Zayıf başlık | Neden zayıf? | Daha iyi başlık |
| --- | --- | --- |
| Süper Kalite Termos En Uygun Fiyat | Bilgi yok, ürünü tanımlamayan ifadeler | Marka Çelik Termos 500 ml Çay ve Kahve İçin Sızdırmaz |
| Gömlek | Ana kelime var, niteleyici yok | Marka Kadın Keten Gömlek Oversize Uzun Kollu |
| Marka Model X200 | Müşteri model kodunu aramaz | Marka X200 Kablosuz Kulak İçi Bluetooth Kulaklık |
| Kupa Kupa Kahve Kupası Kupa Seti | Kelime tekrarı, okunaksız | Marka Porselen Kahve Kupası 6'lı Set 300 ml |

Başlıkta kaçınılması gerekenler:

- Ürünle ilgisi olmayan popüler kelimeler ya da başka markaların adları. Bu hem yanıltıcıdır hem de marka hakkı ihlali sayılabilir.
- "İndirim", "kampanya", "en ucuz" gibi geçici ya da ürünü tanımlamayan ifadeler.
- Varyant bilgisini (renk, beden) yanlış yazmak; müşteri yanlış ürünü aldığını düşünür ve iade eder.

## Adım 3: Görseller

Müşteri ürünü dokunamadığı için görseller mağazadaki rafın yerini tutar. Arama sonucunda tıklanmayı ana görsel, ürün sayfasında satın almayı ise görsel setinin bütünü belirler.

Trendyol'un geliştirici dokümanında ürün görselleri için **1200 × 1800 piksel ve 96 dpi** ölçüsü belirtilir, bir barkoda **en fazla 8 görsel** eklenebilir ve görsel adreslerinin güvenli (https) olması gerekir. Hepsiburada ve diğer pazaryerlerinin ölçü ve arka plan kuralları farklı olabilir; güncel kuralları her kanalın ürün yükleme ekranından kontrol edin. Ortak iyi uygulama şudur: ana görselde ürün sade bir zeminde, net, iyi ışıkta ve kadrajı dolduracak şekilde görünsün; ana görselde yazı, logo ve filigran olmasın.

![Sekiz görsellik ürün görsel seti planı: ana görsel, açılar, detay, ölçü, kullanım ve paket içeriği](https://hasturkcrm.com/img/blog/urun-gorsel-seti-plani.jpg "Her görsel, müşterinin aklındaki farklı bir soruyu cevaplamalı")

**8 görsellik bir set için plan:**

1. Ana görsel: ürün sade zeminde, ön açıdan.
2. Arka ya da yan açı.
3. Yakın plan detay: malzeme, dikiş, yüzey, düğme.
4. Ölçü görseli: ürünün boyutları ya da beden bilgisi.
5. Kullanım anı: ürünün gerçek bir ortamda ya da üzerinde nasıl durduğu.
6. Farklı bir özellik: kapak açık, katlanmış, çalışır halde.
7. Paket içeriği: kutudan ne çıkacağı.
8. Renk ya da varyant karşılaştırması (varsa).

Başka bir satıcının ya da üreticinin görselini izinsiz kullanmayın. Kendi çektiğiniz görseller, aynı ürünü satan rakiplerden ayrışmanın da en kolay yoludur.

### Kendi görsellerinizi çekerken pratik ipuçları

- **Işık:** Gün ışığı alan bir pencere önü ya da iki yandan yumuşak ışık, pahalı ekipmandan daha iyi sonuç verir. Sert gölge ve parlama ürün rengini değiştirir.
- **Renk doğruluğu:** Renk farkı en sık iade nedenlerinden biridir. Görseli düzenlerken rengi gerçeğe yaklaştırın, aşırı filtre kullanmayın.
- **Tutarlılık:** Aynı ürün grubundaki tüm ürünleri aynı zemin, açı ve ölçekle çekmek mağazanıza düzenli bir görünüm kazandırır ve müşterinin ürünleri karşılaştırmasını kolaylaştırır.
- **Ölçek:** Küçük ürünlerde bir el ya da bilinen bir nesneyle çekilmiş görsel, ölçü tablosundan daha hızlı anlaşılır.

## Adım 4: Özellik alanları

Özellik alanları, ürün SEO'sunun en çok ihmal edilen parçasıdır. Pazaryerleri her kategoride zorunlu ve isteğe bağlı özellikler tanımlar; zorunlu alanlar eksikse ürün yayına alınmaz, isteğe bağlı alanlar eksikse ürün yayına alınır ama filtrelerde görünmez.

- **İsteğe bağlı alanları da doldurun.** Müşteri "Kapasite: 500 ml" filtresini seçtiğinde, bu alanı boş bırakan ürünler listeden çıkar.
- **Pazaryerinin değer listesini kullanın.** Renk ya da malzeme gibi alanlarda serbest metin yerine listeden seçim yapın; "Lacivert" yerine "lacivert renk" yazmak filtre eşleşmesini bozabilir.
- **Başlıkla çelişmeyin.** Başlıkta "Pamuk", özellik alanında "Polyester" yazan ürün hem müşteriyi hem de pazaryerinin denetimini yanıltır.
- **Varyantları doğru gruplayın.** Aynı ürünün renk ve beden seçenekleri tek ürün sayfasında gruplanmalıdır. Örneğin Trendyol'da varyantlar aynı ana ürün koduyla gruplanır. Her varyantı ayrı ürün gibi açmak, değerlendirmeleri ve satış geçmişini böler.

## Adım 5: Açıklama

Açıklama, ürün sayfasına gelen ve henüz karar vermemiş müşteriyi ikna eden bölümdür. Trendyol'un geliştirici dokümanına göre açıklama alanı 30.000 karaktere kadar HTML içerik alabilir; ama uzunluktan çok düzen önemlidir. Okunabilir bir açıklama şu bölümlerden oluşur:

1. **İki cümlelik özet:** Ürün nedir, kime ve ne için uygundur?
2. **Öne çıkan özellikler:** Madde madde, müşteriye sağladığı faydayla birlikte.
3. **Teknik bilgiler:** Ölçüler, ağırlık, malzeme, kapasite, uyumluluk.
4. **Kullanım ve bakım:** Yıkama talimatı, montaj, kullanım uyarıları.
5. **Kutu içeriği ve garanti bilgisi.**

Açıklamaya telefon numarası, e-posta, başka bir site adresi ya da pazaryeri dışında alışverişe yönlendiren ifadeler yazmayın; bunlar pazaryeri kurallarına aykırıdır. Ürün sayfanıza sık gelen soruları açıklamaya eklemek hem dönüşümü artırır hem de aynı soruyu tekrar tekrar yanıtlamaktan kurtarır.

Doğru ve eksiksiz açıklamanın bir faydası da iadeleri azaltmasıdır. "Beklediğim gibi değil" ve "beden uymadı" iadelerinin önemli bir kısmı eksik ürün bilgisinden kaynaklanır; bu konuyu [iade oranını düşürme rehberimizde](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) ayrıca ele aldık.

### Açıklama örneği

Aşağıdaki kısa örnek, yukarıdaki yapının bir termos için nasıl uygulanabileceğini gösterir:

- **Özet:** Çay ve kahveyi saatlerce sıcak tutan, çantada sızdırmayan 500 ml çelik termos. Ofis, okul ve yolculuk için uygundur.
- **Öne çıkanlar:** Çift cidarlı yapı; tek elle açılan sızdırmaz kapak; geniş ağız sayesinde kolay temizlik.
- **Teknik bilgiler:** Hacim, yükseklik, çap, ağırlık ve malzeme bilgisi.
- **Kullanım ve bakım:** Elde yıkama önerisi, kapak contasının nasıl çıkarılacağı.
- **Kutu içeriği:** Termos ve kullanım kılavuzu.

Ürünün sıcak tutma süresi gibi iddialarını yalnız üreticinin belgelediği değerlerle yazın; doğrulanmamış iddia hem müşteriyi yanıltır hem de iade ve şikâyet olarak geri döner.

## Adım 6: Kategori ve barkod

- **En spesifik alt kategoriyi seçin.** Yanlış kategori, ürünün yanlış müşteriye gösterilmesine ve farklı bir komisyon oranının uygulanmasına yol açabilir.
- **Barkodu doğru girin.** Aynı ürün sayfasına teklif eklenen pazaryerlerinde barkod, ürününüzün hangi sayfayla eşleşeceğini belirler. Farklı bir ürünü mevcut sayfaya eklemek müşteri şikâyetine ve yaptırıma yol açabilir.
- **Model kodu ve stok kodu tutarlı olsun.** Birden fazla kanalda satıyorsanız aynı ürünü her kanalda aynı stok koduyla tanımlamak stok eşitlemeyi kolaylaştırır.

## Aynı ürün kartı her pazaryerinde aynı mı olmalı?

Birden fazla pazaryerinde satıyorsanız ürün kartını her kanal için sıfırdan yazmak gerekmez; ama her kanala körü körüne aynı kartı kopyalamak da doğru değildir. Sağlıklı yaklaşım, **tek bir ana ürün kartı** hazırlayıp kanal farklarını bunun üzerine eklemektir:

- **Ortak kalan:** Marka, ürün türü, teknik bilgiler, açıklamanın gövdesi, görsel seti, barkod ve stok kodu.
- **Kanala göre uyarlanan:** Kategori ve kategoriye özel zorunlu özellik alanları, başlık uzunluğu sınırı, görsel ölçü ve arka plan kuralları, varyant yapısı.
- **Kanala göre değişebilen:** Fiyat. Her kanalın komisyonu, kargo modeli ve hizmet bedeli farklı olduğu için aynı fiyat her kanalda aynı kârı bırakmaz.

Ana kartı güncel tuttuğunuzda (örneğin ölçü bilgisini düzelttiğinizde) değişikliği tüm kanallara yansıtmak da kolaylaşır. Kanal sayısı arttıkça bu düzen, ürün içeriğinin kanallar arasında birbirinden kopmasını önler.

## Yayından sonra: ölçün ve düzeltin

Ürün kartı bir kez hazırlanıp unutulacak bir şey değildir. Satıcı panelinizdeki raporlardan ürün bazında görüntülenme, ziyaret ve satış sayılarını izleyin:

| Belirti | Olası neden | İlk bakılacak yer |
| --- | --- | --- |
| Görüntülenme düşük | Aranan kelimelerle eşleşmiyor, filtrelerde yok | Başlık, kategori, özellik alanları |
| Görüntülenme yüksek, ziyaret düşük | Arama sonucunda dikkat çekmiyor | Ana görsel, başlığın ilk kelimeleri, fiyat |
| Ziyaret yüksek, satış düşük | Ürün sayfası ikna etmiyor | Görsel seti, açıklama, teslimat süresi, yorumlar |
| Satış var, iade yüksek | Beklenti ile ürün uyuşmuyor | Ölçü bilgisi, açıklama, görsellerin gerçekliği |

Ürününüz pazaryeri tarafından reddedilirse ret nedenini okuyup eksiği giderin; çoğu ret zorunlu bir özellik alanının eksik olmasından, görsel kuralına uyulmamasından ya da kategori uyumsuzluğundan kaynaklanır.

## Yayın öncesi kontrol listesi

- Başlıkta marka, ürün türü, ayırt edici özellik ve varyant var; kelime tekrarı yok.
- Ana görsel sade zeminde, net ve yazısız; set en az 5–6 farklı görselden oluşuyor.
- Zorunlu ve isteğe bağlı tüm özellik alanları dolu; değerler pazaryerinin listesinden seçildi.
- Açıklamada özet, özellikler, teknik bilgi, kullanım ve kutu içeriği var.
- Kategori en spesifik alt kategori; barkod ve stok kodu doğru.
- Varyantlar aynı ürün altında gruplandı.
- Fiyat, komisyon ve kargo sonrası kârlı.

## Ürün kartını bir kez hazırlayın, her kanala gönderin

Ürün SEO'sunu her pazaryerinde ayrı ayrı yapmak, kanal sayısı arttıkça içinden çıkılmaz hale gelir. Hastürk CRM'in [ürün yönetimi](/ozellikler/urun-yonetimi) özelliğinde marka, açıklama, görseller, alış fiyatı ve varyantlar tek ürün kartında tutulur. Kategorileriniz her pazaryerinin kategorisine ve zorunlu özelliklerine bir kez eşlenir, panel en uygun kategoriyi önerir. Panelden Trendyol, Hepsiburada, N11 ve idefix'e ürün yükleyebilir; kanalın ürünü kabul edip etmediğini izler, reddedilen ürünü nedeniyle birlikte görürsünüz. Pazaryerlerinin nasıl tek panele bağlandığını [pazaryeri entegrasyonu rehberimizde](/blog/pazaryeri-entegrasyonu-nedir) anlattık.

Otomatik ürün gönderimi [Profesyonel ve Kurumsal paketlerde](/paketler) yer alır. Paneli [canlı demoda](/demo) inceleyebilir, kendi mağazanızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Pazaryeri ürün SEO'su nedir?

Ürün kartınızı (başlık, görseller, özellik alanları, açıklama, kategori) pazaryerinin kendi aramasında bulunacak ve ürün sayfasında satın aldıracak şekilde düzenlemektir. Google SEO'sundan farkı, sıralamanın pazaryerinin kendi arama ve filtre sistemi içinde yapılmasıdır.

### Trendyol'da ürün başlığı kaç karakter olabilir?

Trendyol'un geliştirici dokümanına göre ürün adı en fazla 100 karakter olabilir. Bu sınırın tamamını doldurmak zorunda değilsiniz; önemli olan marka, ürün türü, ayırt edici özellik ve varyant bilgisini okunur sırayla vermektir.

### Trendyol ürün görseli ölçüsü nedir?

Trendyol'un geliştirici dokümanında 1200 × 1800 piksel ve 96 dpi ölçüsü belirtilir; bir barkoda en fazla 8 görsel eklenebilir. Diğer pazaryerlerinin kuralları farklı olabileceği için her kanalın güncel kurallarını kontrol edin.

### Özellik alanlarını doldurmak neden önemli?

Kategori filtreleri özellik alanlarından beslenir. Bir özelliği boş bırakırsanız, o filtreyi kullanan müşterinin listesinde ürününüz görünmeyebilir. İsteğe bağlı alanları da doldurmak, ürünün daha fazla aramada çıkmasını sağlar.

### Başlığa rakip marka adı yazabilir miyim?

Hayır. Satmadığınız bir markanın adını başlığa yazmak müşteriyi yanıltır ve marka hakkı ihlali sayılabilir; pazaryerleri bu tür ilanları kapatabilir. Yalnız sattığınız ürünün gerçek markasını ve uyumlu olduğu ürünü açıkça belirtin.

### Ürün açıklaması ne kadar uzun olmalı?

Uzunluktan çok kapsam önemlidir. Müşterinin satın almadan önce soracağı soruları (ölçü, malzeme, kullanım, bakım, kutu içeriği) cevaplayan, başlıklar ve maddelerle düzenlenmiş bir açıklama, uzun ama dağınık bir metinden daha çok satış getirir.
`,
  },
  {
    slug: "trendyol-avantajli-urun-etiketi-nedir",
    title: "Trendyol Avantajlı Ürün Etiketi Nedir? Etiket Fiyatları, Komisyon Tarifeleri ve Eşik Başına Kâr Hesabı",
    seo_title: "Trendyol Avantajlı Ürün Etiketi Nedir, Nasıl Alınır?",
    seo_desc: "Trendyol avantajlı ürün etiketi nasıl çalışır? Avantajlı, çok ve süper avantajlı kademeler, komisyon tarifeleri ve eşik başına kâr hesabı. Rehberi okuyun.",
    summary: "Trendyol, kampanya dönemlerinde indirim oranına göre Avantajlı, Çok Avantajlı ve Süper Avantajlı Ürün etiketleri verir. Etiket fiyatlarını nereden göreceğinizi, fiyat aralığına bağlı komisyon tarifelerini ve hangi kademeye inmenin kârlı olduğunu eşik başına kâr hesabıyla anlatıyoruz.",
    tags: ["Trendyol","Kampanya","Fiyatlandırma","Kâr Hesaplama"],
    cover: "avantajli-urun-etiketi-kapak.jpg",
    body: `Trendyol'da avantajlı ürün etiketi, kampanya dönemlerinde seçili ürünlere **indirim oranına göre** verilen ve ürünün arama ve kampanya listelerinde dikkat çekmesini sağlayan etikettir. Etiketler üç kademedir: **Avantajlı Ürün, Çok Avantajlı Ürün ve Süper Avantajlı Ürün.** Kademe yükseldikçe beklenen indirim, dolayısıyla inmeniz gereken fiyat da artar. Etiketin gerektirdiği fiyatları satıcı panelinizdeki promosyon ve fiyat ekranlarında görürsünüz; bazı ürünlerde fiyat belirli eşiklerin altına indiğinde daha düşük bir komisyon tarifesi de uygulanabilir.

Etiket görünürlük getirir ama bedava değildir: her kademe, sipariş başına kârınızdan bir parça alır. Bu yazıda etiketlerin nasıl çalıştığını, etiket ve komisyon tarifesi fiyatlarını nereden göreceğinizi ve en önemlisi **hangi kademeye inmenin kârlı olduğuna nasıl karar vereceğinizi** örnekle anlatıyoruz.

## Avantajlı ürün etiketi nedir?

Trendyol, kampanya dönemlerinde müşterinin indirimli ürünleri kolayca fark etmesi için ürünlere indirim oranına göre etiket verir. Trendyol'un kamuoyuyla paylaştığı kampanya duyurularına göre etiketler indirimin büyüklüğüne göre üç kademede gösterilir:

| Etiket | Ne anlama gelir? | Satıcı için anlamı |
| --- | --- | --- |
| Avantajlı Ürün | İlk kademe indirim | En az fiyat fedakârlığı, en düşük öne çıkma |
| Çok Avantajlı Ürün | Daha yüksek indirim | Orta kademe fiyat, daha belirgin etiket |
| Süper Avantajlı Ürün | En yüksek kademe indirim | En düşük fiyat, en güçlü vurgu |

Bu sistem daha önce bir ila üç yıldızlı **"yıldızlı ürün etiketi"** olarak uygulanıyordu; satıcı kaynaklarında ve bazı panel ekranlarında hâlâ "yıldızlı ürün" ya da "1-2-3 avantajlı" ifadeleriyle karşılaşabilirsiniz. Mantık aynıdır: indirim büyüdükçe etiket kademesi yükselir.

Her kademe için gereken indirim oranları ve fiyatlar Trendyol tarafından ürün bazında belirlenir ve kamuya açık bir tabloda yayımlanmaz. İnternette karşılaşacağınız "şu kademe için şu kadar indirim gerekir" gibi sabit oranlara güvenmeyin; bağlayıcı olan, satıcı panelinizde ürününüz için gösterilen fiyattır.

## Etiket fiyatlarını nereden görürsünüz?

Trendyol'un Satıcı Bilgi Merkezi'ne göre ürünlerinizin etiket alabilmesi için gereken fiyatlar satıcı panelindeki **Promosyonlar & Fiyat** bölümünde görüntülenir. Burada her ürün için hangi fiyata indiğinizde hangi etiketi alabileceğinizi görürsünüz.

Satıcı kaynaklarında aynı bölümdeki **ürün komisyon tarifeleri** ekranı da anlatılır. Bu ekranda bazı ürünler için fiyat aralıklarına bağlı komisyon oranları gösterilir: ürünün fiyatı belirli bir eşiğin altına indiğinde, o eşik için tanımlı daha düşük komisyon oranı uygulanır. Ürün sayısı fazla olan satıcılar bu listeyi Excel olarak indirip her ürün için seçtikleri fiyatı dosyaya işler ve dosyayı tekrar panele yükleyerek toplu güncelleme yapar.

Eşikler, oranlar ve ekranların adları dönemsel olarak değişebilir. Güncel koşulları ve mağazanıza özel oranları her zaman satıcı panelinizden kontrol edin. Kategorinizin standart komisyon oranını görmek için [Trendyol komisyon oranları sayfamıza](/araclar/trendyol-komisyon-oranlari) bakabilirsiniz; Trendyol'un listesindeki oranlar KDV dahil yayımlanır.

## Etiket kârlı mı? Eşik başına kâr hesabı

Etikete girip girmeme kararı tek bir soruya dayanır: **Daha düşük fiyattan, daha fazla satarak toplamda daha çok kazanır mıyım?** Bunun için her eşikte sipariş başına kârınızı ve mevcut kârınızı korumak için gereken ek satışı hesaplamanız gerekir.

Aşağıdaki örnekte tüm tutarlar ve oranlar **varsayımsaldır**; yalnız hesabın mantığını göstermek için seçilmiştir. Ürün %20 KDV'li, alış maliyeti 450 TL, kargo 80 TL, hizmet bedeli 13 TL (hepsi KDV dahil). Komisyon oranları KDV dahildir, stopaj KDV hariç satış tutarının %1'idir. Kâr KDV hariç gösterilmiştir.

| Fiyat kademesi | Satış fiyatı (KDV dahil) | Komisyon | Hakediş | Sipariş başına kâr | Aynı toplam kâr için gereken ek satış |
| --- | --- | --- | --- | --- | --- |
| Mevcut fiyat | 1.000,00 TL | %21 → 210,00 TL | 688,67 TL | 197,50 TL | – |
| 1. eşik | 949,90 TL | %19 → 180,48 TL | 668,50 TL | 180,77 TL | %9,3 |
| 2. eşik | 899,90 TL | %16 → 143,98 TL | 655,42 TL | 169,93 TL | %16,2 |
| 3. eşik | 849,90 TL | %13 → 110,49 TL | 639,33 TL | 156,60 TL | %26,1 |

Bu tablo iki önemli şeyi gösteriyor:

1. **Düşük komisyon, indirimin bir kısmını telafi eder ama tamamını değil.** Fiyat %15 düştüğünde (1.000 TL'den 849,90 TL'ye) komisyon da düştüğü için kâr %15'ten fazla değil, yaklaşık %21 azalıyor. Komisyon sabit kalsaydı düşüş çok daha büyük olurdu.
2. **Her kademenin bir "ek satış barajı" vardır.** Örneğin 2. eşiğe indiğinizde, toplam kârınızın aynı kalması için satış adedinizin en az %16,2 artması gerekir. Etiketin bu artışı getirip getirmeyeceğini kendi geçmiş kampanya verinizle tahmin edin.

![Eşik başına kâr: fiyat kademesi düştükçe sipariş başına kâr ve aynı toplam kâr için gereken ek satış](https://hasturkcrm.com/img/blog/etiket-esik-kar-karsilastirma.jpg "Varsayımsal örnek: her fiyat eşiğinde sipariş başına kâr ve gereken ek satış")

Bu hesabı tek ürün için [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) yapabilirsiniz. Komisyon, kargo, hizmet bedeli ve stopajın net kâra etkisini ayrıntılı görmek isterseniz [Trendyol net kâr hesaplama rehberimizi](/blog/trendyol-komisyon-orani-net-kar-hesaplama) okuyun.

### Toplam kâr açısından bakmak

Sipariş başına kâr düşse de toplam kâr artabilir; belirleyici olan satış adedindeki değişimdir. Yukarıdaki üründe ayda 100 adet sattığınızı varsayalım (**varsayımsal**):

| Senaryo | Fiyat | Aylık adet | Sipariş başına kâr | Aylık toplam kâr |
| --- | --- | --- | --- | --- |
| Etiketsiz | 1.000,00 TL | 100 | 197,50 TL | 19.750,00 TL |
| 2. eşik, satış %10 artarsa | 899,90 TL | 110 | 169,93 TL | 18.692,30 TL |
| 2. eşik, satış %17 artarsa | 899,90 TL | 117 | 169,93 TL | 19.881,81 TL |
| 2. eşik, satış %30 artarsa | 899,90 TL | 130 | 169,93 TL | 22.090,90 TL |

Satış yalnız %10 artarsa etiket toplam kârınızı düşürür; %16,2'den fazla artarsa toplam kâr eskisini geçer. Ek olarak etiketin getirdiği yeni müşteriler, mağaza takipçisi ve ürün değerlendirmeleri gibi dolaylı faydaları da hesaba katabilirsiniz; ama kararın temeli bu tablodaki gibi somut bir hesap olmalıdır.

## Hangi kademeye inmeli? Karar için 6 soru

1. **Eşik fiyatında kâr kalıyor mu?** Sipariş başına kâr negatife düşüyorsa o kademeye girmeyin. Başabaş fiyatınızın altındaki her eşik, sattıkça zarar demektir.
2. **Gereken ek satış gerçekçi mi?** Ürün zaten kategorisinde iyi satıyorsa ve talep sınırlıysa, %25'lik bir ek satış barajı zor aşılabilir. Az bilinen ama potansiyeli olan bir üründe ise etiketin getirdiği görünürlük değerli olabilir.
3. **Stoğunuz yeter mi?** Etiket satışları hızlandırdığında stok biterse hem satış kaybı hem de iptal riski doğar. Kampanya süresince satacağınız adedi stokla karşılaştırın.
4. **Buybox sizde mi?** Aynı ürünü başka satıcılar da satıyorsa etiket fiyatına inmek buybox'ı almanıza yardım edebilir; buybox rakipteyse etiketin getirdiği trafik rakibe gidebilir. Ayrıntılar için [buybox rehberimize](/blog/trendyol-buybox-nedir-nasil-kazanilir) bakın.
5. **Kampanya bitince fiyat ne olacak?** Etiket fiyatına indiğiniz ürünün fiyatını kampanya sonrasında nasıl yöneteceğinizi baştan planlayın. Bir sonraki indirim duyurusunda gösterebileceğiniz indirim öncesi fiyat, mevzuattaki referans dönemine göre belirlenir.
6. **Ürün kâr mı getiriyor, müşteri mi?** Bazı satıcılar belirli ürünlerde düşük kârı, yeni müşteri ve mağaza takipçisi kazanmak için bilinçli olarak kabul eder. Bu da geçerli bir karardır; yeter ki bilinçli ve sınırlı sayıda üründe verilsin.

### Komisyon eşiğini kuruşuna kadar kullanın

Fiyat aralığına bağlı komisyon tarifesi olan ürünlerde eşik fiyatı bir sınırdır: fiyatınız eşiğin üstünde kalırsa bir üst kademenin komisyonu uygulanır. Örneğin eşik 899,90 TL ise, fiyatı "yuvarlak dursun" diye 900,00 TL yapmak, 10 kuruş için daha yüksek komisyon ödemek demektir. Tersi de geçerlidir: eşiğin gereğinden çok altına inmek, hiçbir ek fayda sağlamadan kâr kaybettirir. Bu yüzden kademe seçtiğinizde fiyatı tam eşik değerine ya da hemen altına ayarlayın.

### İndirim öncesi fiyat kuralına dikkat

Etiketler indirim oranına göre verildiği için, indirimi büyük göstermek amacıyla kampanyadan hemen önce fiyatı yükseltmek cazip görünebilir. Bunu yapmayın. 1 Ağustos 2026'da yürürlüğe giren Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği değişikliğiyle, indirimli satışlarda indirim öncesi fiyat olarak indirimin başladığı tarihten önceki **son 10 günde uygulanan en düşük fiyat** esas alınır. Kurala aykırı indirim duyuruları Reklam Kurulu'nun idari yaptırımlarına konu olabilir.

## Adım adım: etiket ve tarife kararını toplu vermek

Onlarca ya da yüzlerce ürününüz varsa her ürünü tek tek değerlendirmek yerine şu akışı kullanın:

![Etiket ve komisyon tarifesi karar akışı: listeyi indir, maliyetleri ekle, eşik başına kârı hesapla, kademeyi seç, dosyayı yükle, sonucu izle](https://hasturkcrm.com/img/blog/etiket-karar-akisi.jpg "Toplu etiket kararı için altı adımlık akış")

1. **Listeyi indirin.** Satıcı panelinizden ürünlerinizin etiket ya da komisyon tarifesi fiyatlarını içeren listeyi Excel olarak alın.
2. **Maliyetleri ekleyin.** Her ürün için alış maliyetini, ortalama kargo tutarını ve diğer sipariş başı giderleri yanına yazın. Kargo tutarı için tahmin değil, son siparişlerin gerçek kargo faturalarını kullanın.
3. **Eşik başına kârı hesaplayın.** Her kademede komisyon, kargo, hizmet bedeli ve stopaj sonrası sipariş başına kârı ve gereken ek satışı bulun.
4. **Kademeyi seçin.** Her ürün için kâr kalan ve ek satış barajı gerçekçi olan en uygun kademeyi işaretleyin; hiçbir kademe uygun değilse ürünü mevcut fiyatında bırakın.
5. **Dosyayı yükleyin.** Seçtiğiniz fiyatları dosyaya işleyip panele yükleyin; yüklemeden önce birkaç satırı elle kontrol edin. Yanlış girilen tek bir fiyat, zararına yüzlerce satış demek olabilir.
6. **Sonucu izleyin.** Kampanya süresince ürün bazında satış adedini ve kârı takip edin; beklenen ek satışı getirmeyen ürünü bir sonraki kampanyada farklı değerlendirin.

## Hangi ürünlerde etiket daha mantıklı?

| Ürün tipi | Etiket mantıklı mı? | Neden? |
| --- | --- | --- |
| Kâr marjı yüksek, talebi fiyata duyarlı ürün | Çoğu zaman evet | İndirim sonrası kâr kalır, fiyat düşünce satış belirgin artar |
| Yeni ve henüz değerlendirmesi olmayan ürün | Seçici olarak | Görünürlük ve ilk değerlendirmeler için düşük kârı kabul edebilirsiniz |
| Kâr marjı düşük ürün | Genellikle hayır | Alt kademelerde kâr hızla sıfıra yaklaşır |
| Stoğu sınırlı ürün | Dikkatli olun | Satış hızlanırsa stok erken biter, iptal riski doğar |
| Buybox'ı rakipte olan ürün | Önce buybox'a bakın | Etiketin getirdiği trafik rakibe gidebilir |

## Etiketin işe yarayıp yaramadığını nasıl ölçersiniz?

Kampanya bittikten sonra her ürün için kısa bir değerlendirme yapın; bir sonraki kampanyada aynı ürünle aynı kademeye girip girmeyeceğinize bu değerlendirme karar verecek:

- **Adet artışı:** Kampanya dönemindeki günlük ortalama satışı, kampanyadan önceki benzer uzunluktaki dönemle karşılaştırın.
- **Toplam kâr:** Adet artışı, hesapladığınız ek satış barajını geçti mi? Geçmediyse etiket o üründe kâr getirmedi.
- **Buybox:** Aynı ürünü satan rakipler varsa, kampanya boyunca buybox'ın sizde kalıp kalmadığına bakın.
- **Kampanya sonrası etki:** Kampanya bittikten sonraki birkaç haftada satışlar eski seviyesine mi döndü, yoksa yeni değerlendirmeler ve takipçilerle bir miktar yüksek mi kaldı?

Bu dört göstergeyi ürün bazında not etmek, zamanla hangi ürün türlerinin etiketten gerçekten fayda gördüğünü gösterir.

## Sık yapılan hatalar

- **Yalnız etikete bakıp kâra bakmamak.** "Süper avantajlı" etiketi en çok dikkat çeken etikettir; ama sipariş başına kârı en düşük olan kademedir.
- **Komisyon değişimini hesaba katmamak.** Fiyat aralığına bağlı komisyon tarifesi olan ürünlerde eşiğin bir kuruş üstünde kalmak, daha yüksek komisyon ödemek demektir. Eşik fiyatını tam olarak kullanın.
- **Kargo ve hizmet bedelini unutmak.** İndirimli fiyatta da kargo ve hizmet bedeli aynı kalır; kâr, indirim oranından daha hızlı düşer.
- **Stoğu kontrol etmeden katılmak.** Tükenen ürün hem satışı hem de satıcı puanını etkiler.
- **Kampanya sonrası fiyatı unutmak.** Kampanya bittiğinde fiyatı planladığınız seviyeye döndürmeyi takvime yazın.

## Hastürk CRM ile kararı veriye dayandırın

Hastürk CRM ile eşik başına kârınızı görebilirsiniz. Kampanya sonrasında ise kararınızın gerçekten işe yarayıp yaramadığını [kâr-zarar](/ozellikler/kar-zarar) ekranında görürsünüz: [Trendyol mağazanızı](/entegrasyonlar/trendyol) bağladığınızda komisyon, kargo, hizmet bedeli ve reklam faturaları Trendyol'dan çekilir ve her siparişin gerçek kârı hesaplanır; ürün bazında kâr ve zarar eden ürünler için uyarı da aynı ekrandadır.

Paneli [canlı demoda](/demo) inceleyebilir, kendi mağazanızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol avantajlı ürün etiketi nasıl alınır?

Ürününüzün fiyatını, satıcı panelindeki Promosyonlar & Fiyat bölümünde o ürün için gösterilen etiket fiyatına ya da altına indirmeniz gerekir. Etiketler kampanya dönemlerinde indirim oranına göre verilir; güncel koşulları panelinizden kontrol edin.

### Avantajlı, çok avantajlı ve süper avantajlı arasındaki fark nedir?

Üçü de indirim oranına göre verilen etiket kademeleridir. Avantajlı ürün ilk kademe, süper avantajlı ürün en yüksek indirim kademesidir. Kademe yükseldikçe gereken fiyat düşer ve sipariş başına kârınız azalır.

### Yıldızlı ürün etiketi ile avantajlı ürün etiketi aynı şey mi?

Aynı mantıkla çalışırlar. Trendyol daha önce indirim oranına göre bir ila üç yıldızlı etiket gösteriyordu; güncel adlandırmada bu kademeler Avantajlı, Çok Avantajlı ve Süper Avantajlı Ürün olarak gösteriliyor.

### Etiket fiyatına inersem komisyonum düşer mi?

Bazı ürünlerde fiyat aralığına bağlı komisyon tarifeleri uygulanır ve fiyat belirli bir eşiğin altına indiğinde daha düşük oran geçerli olur. Bu her ürün için geçerli olmayabilir; ürününüz için tanımlı tarifeyi satıcı panelinizdeki komisyon tarifeleri ekranından kontrol edin.

### Etikete girmek her zaman kârlı mı?

Hayır. Etiket görünürlük sağlar ama sipariş başına kârı düşürür. Kârlı olması için düşük fiyatın getirdiği ek satışın, sipariş başına kârdaki düşüşü telafi etmesi gerekir. Her kademe için gereken ek satışı hesaplayıp gerçekçi olup olmadığına bakın.

### Kampanyadan önce fiyatı artırıp indirim yapabilir miyim?

Bu yanıltıcı bir indirim uygulamasıdır. 1 Ağustos 2026'dan itibaren indirim öncesi fiyat olarak, indirimin başladığı tarihten önceki son 10 günde uygulanan en düşük fiyat esas alınır. Kurala aykırı indirim duyuruları idari yaptırım riski taşır.
`,
  },
  {
    slug: "pazaryeri-musteri-sorulari-ve-yorum-yonetimi",
    title: "Pazaryerinde Müşteri Soruları ve Ürün Yorumları Nasıl Yönetilir? Cevap Süresi, Şablonlar ve Mağaza Puanına Etkisi",
    seo_title: "Pazaryeri Müşteri Soruları ve Yorum Yönetimi Rehberi",
    seo_desc: "Müşteri sorularını hızlı cevaplayın, olumsuz yorumu doğru yönetin: cevap yapısı, hazır şablonlar, yorum mevzuatı ve mağaza puanına etkisi. Hemen okuyun.",
    summary: "Müşteri soruları ve yorumlar satışı, mağaza puanını ve iade oranını birlikte etkiler. Soru yanıtlamak için cevap yapısını ve şablonları, olumsuz yorum yönetim akışını, tüketici değerlendirmeleriyle ilgili yasal kuralları ve ekip rutinini anlatıyoruz.",
    tags: ["Müşteri Soruları","Ürün Yorumları","Müşteri Memnuniyeti","Pazaryeri"],
    cover: "musteri-sorulari-yorumlar-kapak.jpg",
    body: `Pazaryerinde müşteri sorularını ve ürün yorumlarını iyi yönetmek, üç sonucu birden getirir: **daha çok satış** (sorusu cevaplanan müşteri satın alır), **daha iyi mağaza puanı** (yanıt süresi ve müşteri değerlendirmeleri puan metrikleri arasındadır) ve **daha az iade** (beklentisi doğru kurulan müşteri ürünü geri göndermez). Temel kural basittir: soruları aynı gün, net ve ürüne özel cevaplayın; yorumları düzenli okuyup tekrar eden şikâyetin kaynağını ürün sayfasında ya da operasyonda düzeltin.

Bu yazıda soru yanıtlamak için bir cevap yapısı ve hazır şablonlar, olumsuz yorumlarla başa çıkma akışı, tüketici değerlendirmeleriyle ilgili yasal kurallar ve bu işi ekip olarak düzenli yürütmenin yolunu anlatıyoruz.

## Sorular ve yorumlar neden bu kadar önemli?

Müşteri sorusu, satın almaya en yakın sinyaldir: ürünü incelemiş, beğenmiş, tek bir belirsizlik yüzünden karar verememiştir. Cevap gecikirse müşteri aynı ürünü cevabı hazır olan başka bir satıcıdan alır. Ürün sayfasında görünen cevaplar ise sonraki müşterilerin de aynı soruyu sormadan karar vermesini sağlar; yani iyi bir cevap bir kez yazılır, defalarca satış yapar.

Yorumlar ve değerlendirme puanı da hem arama sonuçlarında hem de ürün sayfasında müşterinin karar verdiği yerdedir. Ayrıca pazaryerleri mağaza performansını ölçerken müşteri tarafındaki göstergelere bakar:

- **Trendyol:** Satıcı Bilgi Merkezi'ne göre satıcı puanını etkileyen müşteri metrikleri arasında, müşterilerin siparişlerinize verdiği puanların ortalaması olan **satıcı değerlendirmeleri** ve ürünlerinize verdiği puanların ortalaması olan **ürün değerlendirmeleri** bulunur. Satıcı rehberlerinde soru yanıtlama süresi de bu metrikler arasında sayılır.
- **Hepsiburada:** Satıcı rehberlerinde mağaza puanını etkilediği aktarılan göstergeler arasında satış sonrası müşteri değerlendirmeleri ile müşteri sorularına ve taleplerine dönüş süresi yer alır.

Metriklerin hesaplama yöntemi ve ağırlıkları pazaryerine göre değişir ve dönemsel olarak güncellenir; güncel tanımları satıcı panelinizden kontrol edin.

## Müşteri sorularını yanıtlamak: süre, içerik, ton

### Ne kadar sürede cevaplamalı?

Hedefiniz, mesai saatleri içinde gelen soruyu **aynı gün**, mesai dışında geleni ertesi sabah ilk iş cevaplamak olsun. Pazaryerlerinin soru yanıtlama için tanımladığı süreler ve hatırlatma kuralları değişebildiği için kendi panelinizdeki güncel kuralı bilin; ama hangi kural geçerli olursa olsun, en hızlı cevap en çok satış getiren cevaptır.

"Kısa sürede bilgi vereceğiz" gibi bir ara cevap müşterinin sorusunu çözmez. Bilgiyi bilmiyorsanız, öğrenip net cevabı tek seferde verin.

### İyi bir cevabın yapısı

![İyi bir müşteri sorusu cevabının yapısı: doğrudan cevap, ayrıntı, ek fayda ve kibar kapanış](https://hasturkcrm.com/img/blog/soru-cevap-yapisi.jpg "Doğrudan cevap ilk cümlede; ayrıntı ve ek bilgi ardından")

1. **Doğrudan cevap:** İlk cümlede sorunun cevabı: "Evet, ürün bulaşık makinesinde yıkanabilir."
2. **Ayrıntı:** Cevabı destekleyen bilgi: "Üst rafta, 65 derecenin altındaki programlarda yıkanmasını öneriyoruz."
3. **Ek fayda:** Müşterinin bir sonraki sorusunu önceden cevaplayan kısa bilgi: "Kapak contası çıkarılıp ayrıca temizlenebilir."
4. **Kibar kapanış:** "İyi alışverişler dileriz."

Cevabı yazarken şunlara dikkat edin:

- **Ürüne özel yazın.** Her soruya aynı kalıp cümleyi yapıştırmak müşteriyi ikna etmez.
- **Doğru bilgi verin.** Emin olmadığınız ölçüyü ya da uyumluluğu "olur" diye cevaplamak, iadeyle geri döner.
- **İletişim bilgisi ve yönlendirme yazmayın.** Telefon numarası, e-posta, başka bir site adresi ya da pazaryeri dışında alışverişe yönlendiren ifadeler pazaryeri kurallarına aykırıdır.
- **Rakip ve fiyat tartışmasına girmeyin.** "Başka satıcıda daha ucuz" diyen müşteriye ürününüzün ve hizmetinizin farkını kibarca anlatın.

### Sık sorulan sorular için hazır cevaplar

Kategorinizde sürekli tekrar eden soruları listeleyin ve her biri için düzenlenebilir bir şablon hazırlayın. Şablon hızı artırır; ama gönderirken ürüne göre mutlaka düzenleyin.

| Soru türü | Şablon cevabın özü | Ürün sayfasında ne düzeltilmeli? |
| --- | --- | --- |
| Beden / ölçü | Kalıp bilgisi + ölçü tablosuna yönlendirme + manken ölçüsü | Ölçü tablosu ve kalıp notu açıklamaya eklenmeli |
| Uyumluluk | Uyumlu model listesi + uyumsuz olanlar | Uyumluluk listesi açıklamada ve özellik alanında |
| Kargo zamanı | Kargoya teslim süreniz + sipariş saati bilgisi | Kargoya teslim süresi ürün kartında doğru olmalı |
| Orijinallik / garanti | Fatura ve garanti bilgisi | Garanti süresi ve tipi açıklamada |
| Kullanım / bakım | Kısa talimat | Kullanım ve bakım bölümü eklenmeli |

Tablonun son sütunu önemlidir: aynı soru üçüncü kez geliyorsa, sorun cevapta değil ürün sayfasındadır. Bilgiyi açıklamaya, görsellere ya da özellik alanlarına ekleyin. Ürün sayfasını eksiksiz hazırlamak hem soru yükünü hem de "beklediğim gibi değil" iadelerini azaltır; iadeler için [iade oranını düşürme rehberimize](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) bakabilirsiniz.

### Örnek soru ve cevaplar

Aşağıdaki örnekler, aynı soruya zayıf ve güçlü cevabın farkını gösterir:

**Soru:** "Bu ayakkabı kalıbı nasıl, bir numara büyük mü almalıyım?"

- *Zayıf cevap:* "Standart kalıptır."
- *Güçlü cevap:* "Ürünümüz standart kalıptır, kendi numaranızı almanızı öneriyoruz. Ayağınız genişse ya da kalın çorapla giyecekseniz bir numara büyük tercih edebilirsiniz. Numara tablosunu ürün görsellerinde bulabilirsiniz. İyi alışverişler dileriz."

**Soru:** "Bu şarj aleti benim telefonumla uyumlu mu?"

- *Zayıf cevap:* "Uyumludur."
- *Güçlü cevap:* "Ürünümüz USB-C girişli ve açıklamada listelenen hızlı şarj standartlarını destekleyen cihazlarla uyumludur. Telefonunuzun modelini yazarsanız uyumluluğunu kontrol edip net bilgi verebiliriz."

**Soru:** "Bugün sipariş verirsem ne zaman kargoya verilir?"

- *Zayıf cevap:* "En kısa sürede."
- *Güçlü cevap:* "Hafta içi saat 14:00'e kadar verilen siparişleri aynı gün kargoya teslim ediyoruz. Daha sonra verilen siparişler ertesi iş günü kargoda olur."

Son örnekteki gibi bir cevabı yalnız gerçekten tutturabileceğiniz bir süre için verin. Verdiğiniz süreye uymamak, cevap vermemekten daha çok güven kaybettirir.

## Ürün yorumlarını yönetmek

### Yorumları düzenli okuyun ve sınıflandırın

Yorumlar, ürününüz ve operasyonunuz hakkında bedava ve dürüst bir rapordur. Haftada bir kez son yorumları okuyup her olumsuz yorumu nedenine göre sınıflandırın:

- **Ürün kaynaklı:** Kalite, ölçü, renk farkı, beklentinin altında kalma.
- **Ürün sayfası kaynaklı:** Eksik ya da yanlış bilgi, gerçeği yansıtmayan görsel.
- **Operasyon kaynaklı:** Geç kargo, hasarlı paket, yanlış ya da eksik ürün.
- **Kargo firması kaynaklı:** Teslimat sırasındaki sorunlar.

Aynı neden birden fazla yorumda geçiyorsa, kaynağını düzeltin. Örneğin "renk fotoğraftakinden koyu" yorumu tekrar ediyorsa görseli gün ışığında yeniden çekin; "kutu ezik geldi" yorumu tekrar ediyorsa paketlemeyi güçlendirin.

### Olumsuz yorumla başa çıkma akışı

![Olumsuz yorum yönetim akışı: oku, nedeni sınıflandır, müşteriyle sipariş üzerinden çözüm ara, kaynağı düzelt, sonucu izle](https://hasturkcrm.com/img/blog/olumsuz-yorum-akisi.jpg "Olumsuz yorumu silmeye değil, nedenini ortadan kaldırmaya odaklanın")

1. **Sakin okuyun.** Olumsuz yorum kişisel değildir; çoğu zaman bir süreç sorununu gösterir.
2. **Siparişi bulun.** Yorumun hangi siparişe ait olduğunu, kargo ve iade geçmişini kontrol edin.
3. **Çözüm sunun.** Pazaryerinin size tanıdığı kanallar üzerinden (yorum yanıtı, sipariş mesajı ya da iade süreci) müşteriye çözüm önerin: değişim, iade ya da eksik parçanın gönderilmesi. Yorumlara satıcı yanıtı verilip verilemeyeceği pazaryerine göre değişir; panelinizdeki seçenekleri kontrol edin.
4. **Kaynağı düzeltin.** Ürün sayfasını, paketlemeyi ya da tedarikçiyi düzeltmeden aynı yorumu tekrar alırsınız.
5. **Kurala aykırı yorumu bildirin.** Hakaret içeren, ürünle ilgisiz ya da kişisel veri barındıran yorumlar için pazaryerinin bildirim ve itiraz kanalını kullanın. Yalnız olumsuz olduğu için bir yorumun kaldırılmasını isteyemezsiniz.

### Tüketici değerlendirmeleriyle ilgili yasal kurallar

Yorum yönetimi yalnız pazaryeri kuralı değil, mevzuat konusudur. Ticaret Bakanlığı'nın duyurularına ve Reklam Kurulu'nun 12 Eylül 2023 tarihli ilke kararıyla kabul ettiği Tüketici Değerlendirmeleri Hakkında Kılavuz'a göre öne çıkan kurallar şunlardır:

- Tüketici değerlendirmelerini **yalnızca ilgili ürünü ya da hizmeti satın alanlar** yapabilir.
- Değerlendirmeler, gerekli incelemeler yapıldıktan sonra **olumlu ya da olumsuz ayrımı gözetilmeden** yayımlanır ve tarih, puan ya da satıcı gibi objektif bir ölçütle sıralanır.
- Yayımlanan değerlendirmelerin **en az bir yıl** yayında kalması gerekir.
- **Sahte yorum** yazdırmak, satış artırmak için gerçeği yansıtmayan değerlendirme ya da tavsiye yayımlatmak için anlaşma yapmak ve rakip ürünü kötüleyen sahte yorumlar haksız ticari uygulama sayılır; idari para cezası dahil yaptırımlara konu olabilir.

Ayrıca 1 Ağustos 2026'da yürürlüğe giren yönetmelik değişikliğiyle, şikâyet platformlarında tüketici şikâyeti yayımlanmadan önce satıcıya tanınan açıklama ve cevap süresi 72 saatten **48 saate** indirildi; süre içinde cevap verilmezse şikâyet doğrudan yayımlanabilir. Şikâyet platformlarını takip ediyorsanız bildirimleri her gün kontrol edin.

Kısacası olumsuz yorumu engellemenin yasal bir yolu yoktur; tek sağlıklı yol, olumsuz yoruma neden olan sorunu ortadan kaldırmaktır. Bu kurallar mağazanızın da güvencesidir: rakiplerin sahte olumsuz yorumları da aynı şekilde haksız ticari uygulama sayılır.

## Daha çok olumlu değerlendirme almak için

Olumlu değerlendirmeyi satın alamazsınız, ama hak edebilirsiniz. Değerlendirmeyi belirleyen şey çoğu zaman ürünün kendisi kadar teslimat deneyimidir:

- **Zamanında kargo:** Geç gelen sipariş, ürün iyi olsa da düşük puan alır.
- **Doğru ürün, doğru varyant:** Paketlemeden önce ürünü, rengi, bedeni ve adedi kontrol edin.
- **Özenli paketleme:** Kırılabilir ürünlerde koruyucu malzeme kullanın; hasarlı teslimat en hızlı düşük puan nedenidir.
- **Gerçekçi ürün sayfası:** Görseli ve açıklaması gerçeği yansıtan ürün, beklentiyi aşmasa bile hayal kırıklığı yaratmaz.
- **Stok doğruluğu:** Satıcı kaynaklı iptal, müşterinin aklında kalan en kötü deneyimlerden biridir. Birden fazla kanalda satıyorsanız stok eşitlemeyi ihmal etmeyin; bunun için [stok takibi rehberimize](/blog/e-ticarette-stok-takibi-fazla-satis) bakabilirsiniz.

## Hangi göstergeleri izlemelisiniz?

Soru ve yorum yönetimini "iyi gidiyor" hissiyle değil, birkaç basit göstergeyle izleyin:

| Gösterge | Neyi anlatır? | Nereden bakılır? |
| --- | --- | --- |
| Yanıtsız soru sayısı | Günlük rutinin işleyip işlemediğini | Pazaryeri panelleri ya da toplu soru ekranı |
| Ortalama yanıt süresi | Müşterinin ne kadar beklediğini | Satıcı panelindeki performans ekranları |
| En çok soru alan ürünler | Hangi ürün sayfasında bilgi eksik | Soru listesinin ürün bazında incelenmesi |
| Sipariş ve ürün değerlendirme puanı | Teslimat ve ürün deneyimini | Satıcı puanı ve değerlendirme ekranları |
| Olumsuz yorumların nedeni | Hangi süreç düzeltilmeli | Haftalık yorum sınıflandırması |

Bu göstergeleri ayda bir karşılaştırdığınızda, ürün sayfası ve operasyon iyileştirmelerinin işe yarayıp yaramadığını görürsünüz. Örneğin bir ürünün açıklamasına ölçü tablosu ekledikten sonra o ürüne gelen beden sorularının azalması, değişikliğin doğru olduğunu gösterir.

### Soru ve yorumları ürün kararlarında kullanın

Sorular ve yorumlar yalnız cevaplanacak mesajlar değil, ürün ve tedarik kararları için de veridir. "Bunun büyük boyu var mı?", "Başka rengi gelecek mi?" gibi sorular, müşterinin sizden almak istediği ama kataloğunuzda olmayan ürünleri gösterir. Aynı tedarikçiden gelen ürünlerde tekrar eden "dikişi açıldı" ya da "kısa sürede bozuldu" yorumları ise tedarikçinizi gözden geçirmeniz gerektiğini gösterir. Bu sinyalleri ay sonunda kısa bir listeye dökmek, hem yeni ürün fırsatlarını hem de iade riskini erkenden yakalamanızı sağlar.

## Ekip olarak düzenli yürütmek

Soru ve yorum yönetimi "vakit bulunca" yapılırsa aksar. Basit bir rutin kurun:

- **Günde en az iki kontrol:** Sabah ve öğleden sonra yanıtsız soruları sıfırlayın.
- **Sorumlu kişi:** Soruları kimin cevaplayacağı belli olsun; tatil ve izin günlerinde yedek kişi tanımlayın.
- **Şablon kütüphanesi:** Sık sorulan sorular için onaylanmış cevaplar ortak bir yerde dursun.
- **Haftalık yorum raporu:** Olumsuz yorumların nedenleri ve alınan aksiyonlar listelensin.
- **Aylık ürün sayfası güncellemesi:** En çok soru alan ürünlerin açıklamaları güncellensin.

## Soruları tek listede yanıtlayın

Birden fazla pazaryerinde satıyorsanız, soruları her kanalın panelinde ayrı ayrı kontrol etmek hem zaman alır hem de bazı soruların gözden kaçmasına yol açar. Hastürk CRM'in [müşteri soruları ve iadeler](/ozellikler/musteri-sorulari-ve-iadeler) özelliğinde Trendyol, Hepsiburada, N11, idefix ve Pazarama sorularınız tek ekranda toplanır, bekleyenler üstte görünür. Sık sorulan sorular için hazır cevap şablonlarını tek tıkla doldurup düzenleyerek gönderirsiniz; panelden gönderdiğiniz cevap pazaryerinin servisi üzerinden iletilir ve ürün sayfasında görünür.

Cevap bekleyen sorular ana ekranda ve [sabah özeti](/ozellikler/raporlar) e-postasında hatırlatılır. Müşteri hizmetleri personelinize [yetkilendirme](/ozellikler/ekip-ve-guvenlik) ile yalnız sorular ve iadeler bölümünü açabilirsiniz. Paneli [canlı demoda](/demo) inceleyebilir, kendi mağazanızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Müşteri sorularını ne kadar sürede cevaplamalıyım?

Mümkünse aynı gün. Pazaryerlerinin tanımladığı süre ve hatırlatma kuralları değişebilir; güncel kuralı satıcı panelinizden kontrol edin. Yanıt süresi mağaza performansı göstergeleri arasında yer aldığı için hızlı cevap hem satışa hem de puana yarar.

### Soru yanıtlama süresi satıcı puanını etkiler mi?

Satıcı rehberlerinde Trendyol satıcı puanının müşteri metrikleri arasında soru yanıtlama süresi, Hepsiburada mağaza puanını etkileyen göstergeler arasında da müşteri sorularına dönüş süresi sayılır. Hesaplama yöntemini satıcı panelinizden kontrol edin.

### Cevaplarda telefon numarası ya da web sitesi adresi verebilir miyim?

Hayır. Müşteriyi pazaryeri dışına yönlendiren iletişim bilgileri ve bağlantılar pazaryeri kurallarına aykırıdır ve yaptırıma yol açabilir. Gerekli bilgiyi doğrudan cevabın içinde verin.

### Olumsuz bir yorumu kaldırtabilir miyim?

Yalnız olumsuz olduğu için hayır. Mevzuata göre değerlendirmeler olumlu ya da olumsuz ayrımı yapılmadan yayımlanır. Hakaret, kişisel veri ya da ürünle ilgisiz içerik gibi kurallara aykırı yorumlar için pazaryerinin bildirim kanalını kullanabilirsiniz.

### Müşterilerden yorum istemek yasal mı?

Ürünü gerçekten satın almış müşteriden dürüst değerlendirme rica etmek mümkündür. Ancak yalnız olumlu yorum karşılığında indirim ya da hediye vermek, sahte yorum yazdırmak veya satın almamış kişilere yorum yaptırmak haksız ticari uygulama sayılabilir.

### Aynı soru sürekli geliyorsa ne yapmalıyım?

Bilgiyi ürün sayfasına ekleyin: açıklamaya, görsellere ya da özellik alanlarına. Aynı sorunun tekrar etmesi, ürün sayfasında eksik bir bilgi olduğunu gösterir; düzelttiğinizde soru yükünüz ve iadeleriniz birlikte azalır.
`,
  },
  {
    slug: "trendyol-satici-puani-nasil-yukseltilir",
    title: "Trendyol Satıcı Puanı Nasıl Yükseltilir? Metrikler, Takip ve Haftalık Kontrol Listesi (2026)",
    seo_title: "Trendyol Satıcı Puanı Nasıl Yükseltilir? (2026 Rehberi)",
    seo_desc: "Trendyol satıcı puanı nasıl hesaplanır, nasıl yükseltilir? Müşteri ve operasyon metrikleri, puanın takibi, iyileştirme adımları ve kontrol listesi. Okuyun.",
    summary: "Trendyol satıcı puanı, müşteri ve operasyon metrikleriyle izlenir ve buybox'taki görünürlüğünüzü etkiler. Puanı oluşturan metrikleri, puanı nereden takip edeceğinizi, her metriği iyileştirmenin yollarını, puan düştüğünde izlenecek adımları ve haftalık kontrol listesini anlatıyoruz.",
    tags: ["Trendyol","Satıcı Puanı","Operasyon","Müşteri Memnuniyeti"],
    cover: "satici-puani-kapak.jpg",
    body: `Trendyol satıcı puanı, mağazanızın müşteri memnuniyeti ve operasyon performansını özetleyen, 10 üzerinden gösterilen bir puandır. Trendyol'un Satıcı Bilgi Merkezi'ne göre puanı etkileyen göstergeler **müşteri metrikleri** ve **operasyon metrikleri** olmak üzere iki başlık altında izlenir. Puanı yükseltmenin yolu da bu iki başlıktadır: siparişleri zamanında kargoya vermek, tedarik edememe kaynaklı iptali önlemek, eksik, kusurlu ya da yanlış ürün göndermemek, müşteri sorularını hızlı cevaplamak ve müşterinin siparişe ve ürüne verdiği puanları iyileştirmek.

Satıcı puanı yalnız bir rozet değildir. Satıcı Bilgi Merkezi'ne göre satıcı puanı, **buybox uygulamasında** ve **mobil uygulama bildirimlerinde** görünürlüğünüzü belirleyen unsurlardan biridir. Bu yazıda puanın hangi metriklerden oluştuğunu, nereden takip edileceğini, her metriği iyileştirmek için yapılacakları ve haftalık bir kontrol listesini anlatıyoruz.

## Satıcı puanı neden önemli?

- **Buybox:** Aynı ürünü satan satıcılar arasında "Sepete ekle" düğmesinin kime bağlanacağı belirlenirken satıcı puanı da değerlendirilir. Fiyatınız en düşük olsa bile puanı daha yüksek bir rakip buybox'ı alabilir. Ayrıntılar için [buybox rehberimize](/blog/trendyol-buybox-nedir-nasil-kazanilir) bakabilirsiniz.
- **Görünürlük:** Puan, Trendyol'un mobil uygulama bildirimlerinde ürünlerinizin yer alma şansını etkiler.
- **Müşteri güveni:** Puan, ürün sayfasında satıcı adının yanında görünür; müşteri iki benzer teklif arasında karar verirken bu puana bakar.
- **Yaptırım riskinin göstergesi:** Puanı düşüren sorunlar (geç kargo, iptal, hatalı ürün) aynı zamanda müşteri şikâyetine ve pazaryeri yaptırımlarına yol açan sorunlardır.

## Satıcı puanını oluşturan metrikler

![Trendyol satıcı puanı metrikleri: müşteri metrikleri ve operasyon metrikleri](https://hasturkcrm.com/img/blog/satici-puani-metrikleri.jpg "Satıcı puanı iki grup metrikle izlenir: müşteri metrikleri ve operasyon metrikleri")

### Müşteri metrikleri

Satıcı Bilgi Merkezi'ne göre bu başlıkta yer alan metriklerin ikisi şunlardır:

- **Satıcı değerlendirmeleri:** Müşterilerin siparişleriniz için verdiği puanların ortalaması. Teslimat süresi, paketleme ve siparişin doğru gelmesi bu puanı doğrudan etkiler.
- **Ürün değerlendirmeleri:** Müşterilerin ürünlerinize verdiği puanların ortalaması. Ürün kalitesi ve ürün sayfasının gerçeği yansıtması belirleyicidir.

Satıcı rehberlerinde bu başlık altında ayrıca **müşteri şikâyet oranı** (şikâyet talebi oluşan siparişlerin toplam siparişe oranı) ve **soru yanıtlama süresi** de sayılır.

### Operasyon metrikleri

Satıcı rehberlerinde operasyon tarafında öne çıkan metrikler şunlardır:

- **Tedarik edememe oranı:** Satıcının ürünü gönderememesi nedeniyle iptal edilen ürünlerin toplam satılan ürüne oranı.
- **Kargoya zamanında teslim oranı:** Belirtilen süre içinde kargoya verilen siparişlerin tüm siparişlere oranı.
- **Kargo teslim süresi:** Siparişin müşteriye ulaşma süresi.
- **Eksik, kusurlu ya da yanlış ürün kaynaklı iadeler:** İade metriği, müşterinin fikir değiştirmesi gibi nedenlerle yapılan iadeleri değil, satıcıdan kaynaklanan eksik, kusurlu ya da yanlış ürün iadelerini dikkate alır.

Metriklerin tam listesi, hangi dönemlerin hesaba katıldığı ve ağırlıkları zaman içinde değişebilir. İnternette "şu metrik yüzde şu kadar etkiler" şeklinde dolaşan oranlara güvenmek yerine, satıcı panelinizdeki satıcı puanı ekranında gösterilen güncel metrikleri ve açıklamaları esas alın.

## Satıcı puanı nereden takip edilir?

Satıcı Bilgi Merkezi'ne göre satıcı puanınızı satıcı panelinin ana sayfasından ya da **Raporlar > Değerlendirmelerim > Satıcı Puanı** yolunu izleyerek görebilirsiniz. Bu ekranda puanı etkileyen metrikleri ayrı ayrı görür, performans analizi bölümünde hafta seçerek o haftanın puanını ve önceki haftaya göre değişimi inceleyebilirsiniz.

Puan son dönemlerin performansına göre periyodik olarak yeniden hesaplandığı için, bugün yaptığınız iyileştirme puana hemen değil, sonraki hesaplamalarda yansır. Aynı nedenle geçmişte yaşanan kötü bir hafta da bir süre puanınızı aşağı çeker. Bu yüzden puanı tek seferlik bir hamleyle değil, her hafta tutarlı bir operasyonla yükseltirsiniz.

## Her metrik için ne yapmalı?

### Kargoya zamanında teslim oranını yükseltmek

Bu metrik tamamen sizin kontrolünüzdedir ve iyileştirmesi en hızlı olanıdır.

1. **Gerçekçi kargoya teslim süresi tanımlayın.** Ürün kartında tutturamayacağınız kadar kısa süre tanımlamak, her geciken siparişi puan kaybına çevirir.
2. **Günlük kesim saati belirleyin.** Örneğin "saat 14:00'e kadar gelen siparişler aynı gün kargoda" gibi bir iç kural koyun ve ekibinizi buna göre planlayın.
3. **Her sabah geciken ve gecikme riski taşıyan siparişleri kontrol edin.** Teslim saati yaklaşan siparişler önce hazırlanmalıdır.
4. **Paketleme malzemesini önceden hazırlayın.** Kampanya dönemlerinde sipariş artışı paketleme darboğazına dönüşmesin.
5. **Kargo teslim noktasını ve saatini sabitleyin.** Kargo firmasının alım saatinden sonra hazırlanan paket ertesi güne kalır.

### Tedarik edememe kaynaklı iptali önlemek

Tedarik edememe iptalinin en yaygın nedeni, **stokta görünen ama aslında olmayan** üründür. Bu genellikle aynı ürünü birden fazla kanalda satarken bir kanaldaki satışın diğer kanallarda stoktan düşmemesiyle olur. Çözüm:

- Kanallar arasında stok eşitlemesi kurun; bir kanalda satılan ürün diğerlerinde de hemen düşsün.
- Depo sayımı ile sistem stoğunu düzenli karşılaştırın.
- Tedarikçiden gelmesi belirsiz ürünleri stoklu göstermeyin.
- Son birkaç adımı kalan ürünlerde, kanal başına gösterilecek adedi sınırlamayı düşünün.

Bu konuyu nedenleri ve çözümleriyle [stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) ayrıntılı anlattık.

### Eksik, kusurlu ve yanlış ürün iadelerini azaltmak

- **Paketlemeden önce kontrol:** Ürün, varyant (renk, beden) ve adet siparişle eşleşiyor mu? Toplama listesi ve barkod kontrolü bu hatayı büyük ölçüde önler.
- **Kalite kontrol:** Kusurlu ürün oranı yüksek bir tedarikçiden gelen partiyi göndermeden önce örnekleyin.
- **Koruyucu paketleme:** Kırılabilir ürünlerde yetersiz paketleme "hasarlı geldi" iadesine dönüşür.
- **Doğru ürün sayfası:** Görsel ve açıklama gerçeği yansıtmıyorsa müşteri ürünü "yanlış ürün" olarak algılayabilir.

İade nedenlerini ölçmeyi ve azaltmayı [iade yönetimi rehberimizde](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) ayrıca ele aldık.

### Satıcı ve ürün değerlendirmelerini iyileştirmek

Müşterinin siparişe verdiği puanı en çok teslimat deneyimi belirler: zamanında, doğru ve sağlam gelen sipariş iyi puan alır. Ürüne verilen puanı ise ürünün kalitesi ve ürün sayfasının yarattığı beklenti belirler. Düşük puanlı yorumları haftada bir okuyup nedenlerini sınıflandırın; aynı neden tekrarlanıyorsa kaynağını düzeltin.

Değerlendirme puanını kısa yoldan yükseltmeye çalışmayın. Mevzuata göre tüketici değerlendirmelerini yalnızca ürünü satın alanlar yapabilir ve değerlendirmeler olumlu ya da olumsuz ayrımı yapılmadan yayımlanır; sahte değerlendirme yaptırmak haksız ticari uygulama sayılır.

### Soru yanıtlama süresini kısaltmak ve şikâyetleri azaltmak

- Soruları günde en az iki kez kontrol edin ve aynı gün cevaplayın.
- Sık gelen sorular için düzenlenebilir hazır cevaplar hazırlayın.
- Aynı soru tekrar ediyorsa bilgiyi ürün açıklamasına ekleyin.
- Şikâyet talebi oluştuğunda müşteriye hızlı ve çözüm odaklı dönün; şikâyetin nedenini kayda alın.

### Kargo firması kaynaklı sorunlar

Siparişi zamanında kargoya verdiğiniz halde teslimat gecikebilir ya da paket hasar görebilir. Bu durumlar müşterinin siparişe verdiği puanı yine de etkileyebilir. Yapabilecekleriniz sınırlıdır ama önemlidir: kargoya teslim kayıtlarınızı saklayın, tekrar eden teslimat sorunlarını pazaryerinin satıcı destek kanalına bildirin ve hasar şikâyeti gelen ürünlerde paketlemeyi güçlendirin. Kendi kontrolünüzdeki kısmı, yani siparişin zamanında ve sağlam şekilde kargoya verilmesini kusursuz tutmak, kargo kaynaklı sorunların etkisini de azaltır.

## Yoğun dönemlerde puanı korumak

Satıcı puanındaki düşüşlerin önemli bir kısmı kampanya ve özel gün dönemlerinde yaşanır: sipariş sayısı birkaç katına çıkar, paketleme ve stok kapasitesi yetişmez, geciken ve iptal edilen siparişler artar. Bu dönemlerde puanı korumak için:

- **Kapasitenizi hesaplayın.** Günde kaç siparişi zamanında paketleyip kargoya verebildiğinizi bilin. Kampanya beklentiniz bu kapasiteyi aşıyorsa ek personel ya da vardiya planlayın.
- **Stoğu önceden doğrulayın.** Kampanyaya gireceğiniz ürünlerin depo sayımını kampanyadan önce yapın; sistemde görünen ama rafta olmayan ürün, kampanyada tedarik edememe iptaline dönüşür.
- **Paketleme malzemesini stoklayın.** Koli, poşet ve etiket kâğıdı biterse siparişler beklemeye başlar.
- **Kargoya teslim süresini gözden geçirin.** Yoğunluğu karşılayamayacağınızı düşünüyorsanız, ürün kartındaki süreyi gerçekçi bir değere çekmek gecikmekten iyidir.
- **Soru yükünü planlayın.** Kampanya döneminde soru sayısı da artar; hazır cevap şablonlarını önceden güncelleyin.

## Yeni mağazalar için ilk haftalar

Yeni açılan mağazalarda az sayıda sipariş olduğu için her sipariş metrikleri daha fazla etkiler: birkaç geciken sipariş, oranları belirgin şekilde bozabilir. İlk haftalarda şu üç kurala odaklanın:

1. **Az ama emin ürünle başlayın.** Stoğunu ve tedarikini kesin bildiğiniz ürünlerle açın; tedarikçiden gelmesi belirsiz ürünleri sonraya bırakın.
2. **Her siparişi aynı gün hazırlayın.** İlk siparişlerin hepsini tanımladığınız süreden önce kargoya verin.
3. **Her değerlendirmeyi okuyun.** İlk müşterilerin geri bildirimleri, ürün sayfası ve paketlemedeki eksikleri büyümeden gösterir.

Trendyol'da mağaza açma sürecini ve ilk adımları [Trendyol mağaza açma rehberimizde](/blog/trendyol-magaza-acma-rehberi) anlattık.

## Hızlı teşhis tablosu

Aşağıdaki tablo, her metrik için en sık görülen nedenleri ve ilk yapılacak düzeltmeyi özetler:

| Metrik | En sık neden | İlk düzeltme |
| --- | --- | --- |
| Kargoya zamanında teslim | Tutturulamayan kısa süre, hafta sonu birikmesi, kargo alım saatinin kaçırılması | Süreyi gerçekçi yapmak, günlük kesim saati, hafta sonu planı |
| Tedarik edememe | Kanallar arası stok farkı, sayım hatası, tedarikçi gecikmesi | Stok eşitleme, düzenli sayım, belirsiz ürünü stoksuz göstermek |
| Eksik / kusurlu / yanlış ürün | Toplama hatası, kalite sorunu, zayıf paketleme | Barkodla kontrol, parti örneklemesi, koruyucu paketleme |
| Satıcı değerlendirmeleri | Geç teslimat, hasarlı paket | Kargo ve paketleme süreçleri |
| Ürün değerlendirmeleri | Ürün sayfası ile ürün arasında beklenti farkı | Görsel ve açıklamanın gerçeği yansıtması, tedarikçi değişikliği |
| Soru yanıtlama süresi | Sorumlunun belli olmaması | Günde iki kontrol, hazır cevaplar, yedek kişi |

Tabloda gördüğünüz gibi metriklerin çoğu üç sürece bağlıdır: **stok doğruluğu**, **paketleme disiplini** ve **zamanında kargo**. Bu üç süreci sağlamlaştırdığınızda puanın büyük kısmı kendiliğinden düzelir.

## Puan düştüğünde ne yapmalı?

![Satıcı puanı iyileştirme planı: düşen metriği bul, kök nedeni belirle, aksiyonu uygula, haftalık takip et](https://hasturkcrm.com/img/blog/satici-puani-iyilestirme-plani.jpg "Düşen metrikten kök nedene, oradan haftalık takibe")

Puanınız düştüğünde panik yapıp fiyat kırmak ya da kampanyaya girmek işe yaramaz; çünkü puanın nedeni fiyat değil operasyondur. Şu sırayla ilerleyin:

| Adım | Ne yapılır? | Örnek |
| --- | --- | --- |
| 1. Metriği bulun | Satıcı puanı ekranında hangi metriğin kötüleştiğine bakın | Kargoya zamanında teslim oranı düşmüş |
| 2. Siparişleri listeleyin | O metriği bozan siparişleri bulun | Son iki haftada geciken 18 sipariş |
| 3. Kök nedeni belirleyin | Siparişlerde ortak nokta ne? | Hepsi cumartesi gelen, pazartesi kargolanan siparişler |
| 4. Aksiyonu uygulayın | Nedeni ortadan kaldıran değişikliği yapın | Cumartesi paketleme vardiyası ya da süre güncellemesi |
| 5. Haftalık takip edin | Metriğin düzelip düzelmediğine bakın | Sonraki haftalarda gecikme sayısı |

Tablodaki örnek varsayımsaldır ama tipik bir durumdur: puanı düşüren siparişlerin çoğu tek bir süreç açığından kaynaklanır. O açığı kapattığınızda birden fazla metrik birlikte düzelir.

## Haftalık satıcı puanı kontrol listesi

- Satıcı puanı ekranında geçen haftaya göre değişen metrikleri not edin.
- Geciken siparişlerin nedenlerini (stok, personel, kargo alım saati) sınıflandırın.
- Tedarik edememe nedeniyle iptal edilen siparişleri ve nedenlerini inceleyin.
- Eksik, kusurlu ya da yanlış ürün iadelerini ürün ve tedarikçi bazında gruplayın.
- Düşük puanlı sipariş ve ürün değerlendirmelerini okuyun; tekrar eden nedeni bulun.
- Yanıtsız müşteri sorusu ve açık şikâyet talebi bırakmayın.
- Önümüzdeki kampanya dönemi için stok, paketleme malzemesi ve personel planını kontrol edin.

## Operasyonunuzu tek panelden izleyin

Satıcı puanını yükselten şey düzenli operasyondur; düzenli operasyon da doğru zamanda doğru uyarıyı görmekle başlar. Hastürk CRM'de [Trendyol mağazanızı](/entegrasyonlar/trendyol) bağladığınızda siparişler 15 dakikada bir panele gelir. [Sipariş yönetimi](/ozellikler/siparis-yonetimi) ekranında kanalın son kargoya teslim saatine göre geciken ve gecikme riski taşıyan siparişler kırmızıyla işaretlenir; birden fazla siparişin etiketini toplu oluşturup yazdırabilirsiniz.

[Stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) ile bir kanalda satılan ürünün stoğu, stok gönderimi açık olan diğer kanallarda da düşer; böylece tedarik edememe kaynaklı iptal riski azalır. Müşteri sorularını tek listede görür, hazır cevaplarla hızlıca yanıtlarsınız. Paneli [canlı demoda](/demo) inceleyebilir, kendi mağazanızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol satıcı puanı nasıl hesaplanır?

Trendyol, satıcı puanını müşteri metrikleri ve operasyon metrikleri olmak üzere iki grup göstergeyle izler. Müşteri tarafında sipariş ve ürün değerlendirmeleri, operasyon tarafında tedarik edememe ve zamanında kargoya teslim gibi göstergeler yer alır. Hangi dönemlerin hangi ağırlıkla hesaba katıldığını satıcı panelinizdeki açıklamadan kontrol edin.

### Satıcı puanımı nereden görebilirim?

Satıcı panelinin ana sayfasından ya da Raporlar > Değerlendirmelerim > Satıcı Puanı yolundan. Bu ekranda puanı etkileyen metrikleri ve haftalık değişimi görebilirsiniz.

### Satıcı puanı buybox'ı etkiler mi?

Evet. Trendyol'un Satıcı Bilgi Merkezi'ne göre satıcı puanı, buybox uygulamasında ve mobil uygulama bildirimlerinde görünürlüğünüzü belirleyen unsurlardan biridir. Fiyatınız en düşük olsa bile puanı daha yüksek bir rakip buybox'ı alabilir.

### Her iade satıcı puanımı düşürür mü?

Satıcı kaynaklarına göre puan, müşterinin fikir değiştirmesi gibi nedenlerle yapılan tüm iadeleri değil, eksik, kusurlu ya da yanlış ürün kaynaklı iadeleri dikkate alır. Yine de iade nedenlerinizi düzenli inceleyin; ürün sayfasındaki eksik bilgi kaynaklı iadeler de satışınızı ve kârınızı etkiler.

### Satıcı puanı ne kadar sürede yükselir?

Puan son dönemlerin performansına göre periyodik olarak yeniden hesaplandığı için iyileştirmeler hemen değil, sonraki hesaplamalarda yansır. Geçmişteki kötü dönemin etkisi de zamanla azalır. Tutarlı bir haftalık operasyon, puanı kalıcı olarak yükseltmenin tek yoludur.

### Kampanyaya katılmak satıcı puanını yükseltir mi?

Kampanya, satıcı puanını oluşturan metrikler arasında yer almaz. Aksine, stok ve paketleme kapasitesi hazır değilken kampanyaya girmek gecikme ve tedarik edememe iptalleri nedeniyle puanı düşürebilir.
`,
  },
  {
    slug: "idefix-satici-olma-magaza-acma",
    title: "idefix'te Satış Yapmak: Satıcı Olma, Mağaza Açma ve Satış Rehberi (2026)",
    seo_title: "idefix Satıcı Olma 2026: Başvuru, Belgeler ve Satış",
    seo_desc: "idefix'te nasıl satıcı olunur? Başvuru adımları, gerekli belgeler, komisyon ve kargo için sorulacaklar, fiyat hesabı ve satış ipuçları. Rehberi okuyun.",
    summary: "idefix'te satış yapmak için vergi mükellefi bir işletme ve 'Satıcımız Olun' sayfasından başvuru gerekir. idefix'in pazaryeri yapısını, başvuru adımlarını, hazırlanacak belgeleri, komisyon ve kargo için sorulacakları, fiyat hesabını ve satışları artırma ipuçlarını anlatıyoruz.",
    tags: ["idefix","Mağaza Açma","Pazaryeri","Rehber"],
    cover: "idefix-satici-olma-kapak.jpg",
    body: `idefix'te satış yapmak için vergi mükellefi bir işletmeniz olması ve idefix'in "Satıcımız Olun" sayfasından başvuru yapmanız gerekir. idefix'in kendi anlatımıyla süreç üç adımdır: **başvuru**, değerlendirme sonrasında **satıcı hesabının oluşturulması** ve **satışa başlama**. Başvuruda şirket ve iletişim bilgilerinizi ve satmak istediğiniz kategorileri bildirirsiniz; onaylandıktan sonra satıcı panelinden ürünlerinizi yükler, siparişlerinizi yönetirsiniz. Komisyon oranları kategoriye göre değişir ve size özel koşullar sözleşmenizde yer alır.

Bu yazıda idefix'in nasıl bir pazaryeri olduğunu, kimlerin satış yapabileceğini, başvuru adımlarını, başvurudan önce hazırlamanız gerekenleri ve idefix'te satışa başladıktan sonra dikkat etmeniz gereken noktaları anlatıyoruz.

## idefix nasıl bir pazaryeri?

idefix, uzun yıllar kitap ve kültür ürünleriyle bilinen bir online mağazaydı. Şirketin kendi açıklamasına göre Haziran 2023'te gerçekleşen **pazaryeri dönüşümüyle** birlikte elektronik, moda, anne ve bebek, kozmetik, süpermarket, petshop, ev ve yaşam, spor ve outdoor ile yapı market gibi pek çok kategoride, birçok satıcıyla ürün yelpazesini genişletiyor. Yani bugün idefix'te yalnız kitap değil, farklı kategorilerde ürün satan satıcılar da yer alıyor.

Satıcı açısından idefix'i değerlendirirken şunları göz önünde bulundurun:

- **Ek bir satış kanalı:** Trendyol ve Hepsiburada gibi büyük pazaryerlerine ek olarak yeni müşterilere ulaşmanın bir yolu.
- **Kategori uyumu:** Kitap ve kültür ürünleri platformun geleneksel olarak bilindiği alandır; pazaryeri dönüşümüyle birlikte diğer kategorilerde de satış yapılabilir.
- **Rekabet yapısı:** Satıcı sayısı en büyük pazaryerlerinden farklı olduğu için kategorinize göre rekabet koşulları değişir. Başvurmadan önce kendi ürünlerinizi idefix'te aratıp kaç satıcının hangi fiyatlarla sattığına bakın.

### idefix'te hangi ürünlerle başlamalı?

Yeni bir kanala bütün kataloğunuzla girmek yerine, o kanalda iş görme ihtimali yüksek ürünlerle başlamak daha verimlidir. Ürün seçerken şu sorulara bakın:

- **Talep var mı?** Ürün türünü idefix'te aratın; benzer ürünler listeleniyor ve değerlendirme alıyorsa talep vardır.
- **Rekabet nasıl?** Aynı ürünü kaç satıcı, hangi fiyat aralığında satıyor? Fiyatınız kesintilerden sonra kâr bırakıyor mu?
- **Operasyon kolay mı?** Kırılabilir, büyük hacimli ya da çok varyantlı ürünler yeni kanalda ilk ayın riskini artırır. İlk ürünlerinizi stoğunu ve paketlemesini iyi bildiğiniz ürünlerden seçin.
- **Diğer kanallarda kanıtlanmış mı?** Başka pazaryerlerinde düzenli satan ve iade oranı düşük ürünler, yeni kanal için en güvenli başlangıçtır.

## Kimler idefix'te satıcı olabilir?

idefix'te satış yapabilmek için **vergi mükellefi ve fatura kesebilen bir işletme** gerekir; vergi kaydı olmayan bireysel başvurular kabul edilmez. Satıcı kaynaklarında şahıs şirketlerinin de başvurabildiği belirtilir; ancak kabul koşulları dönemsel olarak değişebileceği için şirket türünüzün kabul edilip edilmediğini başvuru sırasında teyit edin. Henüz şirketiniz yoksa hangi şirket türünün size uygun olduğunu [şahıs şirketi mi, limited şirket mi rehberimizde](/blog/e-ticaret-sahis-sirketi-mi-limited-sirket-mi) karşılaştırdık.

### Başvurudan önce hazırlamanız gerekenler

Satıcı rehberlerinde idefix başvurusu ve sözleşme süreci için sıkça istenen belgeler şunlardır:

| Belge / bilgi | Şahıs şirketi | Sermaye şirketi (Ltd., A.Ş.) |
| --- | --- | --- |
| Vergi levhası | Gerekir | Gerekir |
| Kimlik ve iletişim bilgileri | Gerekir | Yetkili kişi için gerekir |
| İmza beyannamesi / imza sirküleri | Gerekebilir | Gerekir |
| Ticaret sicil gazetesi | Kayıt durumuna göre | Gerekir |
| Faaliyet belgesi | Kayıt durumuna göre | Gerekir |
| Şirket adına banka hesabı (IBAN) | Gerekir | Gerekir |

Güncel belge listesi başvuru sırasında size bildirilir. Belgeleri baştan hazır tutmak, değerlendirme sürecini hızlandırır. Resmî yazışmalar için bir KEP (kayıtlı elektronik posta) adresinizin olması da birçok pazaryerinde süreci kolaylaştırır.

## idefix'te mağaza açma adımları

![idefix'te mağaza açma adımları: başvuru formu, değerlendirme, sözleşme ve hesap, ürün yükleme, satışa başlama](https://hasturkcrm.com/img/blog/idefix-magaza-acma-adimlari.jpg "idefix'te başvurudan ilk siparişe uzanan adımlar")

1. **Başvuru formunu doldurun.** idefix.com'daki "Satıcımız Olun" sayfasından başvuru formuna ulaşın. Şirket bilgilerinizi, iletişim bilgilerinizi ve satmak istediğiniz ürün kategorilerini girin. Kategori ve ürün sayınızı gerçekçi yazın; değerlendirme bu bilgilere göre yapılır.
2. **Değerlendirmeyi bekleyin.** Başvurunuz idefix ekibi tarafından incelenir. Ek belge ya da bilgi istenirse hızlı dönün.
3. **Sözleşmeyi ve hesap bilgilerini tamamlayın.** Onaydan sonra satıcı sözleşmesini inceleyip onaylarsınız ve satıcı hesabınız oluşturulur. Sözleşmedeki komisyon oranlarını, ödeme takvimini, kargo ve iade koşullarını ve ceza maddelerini dikkatle okuyun.
4. **Mağaza ve kargo ayarlarını yapın.** Satıcı panelinde mağaza bilgilerinizi, iade adresinizi ve kargo tercihlerinizi tanımlayın.
5. **Ürünlerinizi yükleyin.** Ürünlerinizi doğru kategoride, eksiksiz özellik alanları, kaliteli görseller ve doğru barkodla yükleyin.
6. **Satışa başlayın.** Ürünleriniz onaylanıp yayına alındığında satışa başlarsınız. İlk siparişlerde kargoya teslim süresine özellikle dikkat edin.

## Ürün yüklerken dikkat edilecekler

idefix'te ürün kartı, diğer pazaryerlerinde olduğu gibi müşterinin ürünü bulmasını ve satın almasını belirler. Yüklemeye başlamadan önce şunları hazırlayın:

- **Doğru kategori:** Ürününüzü en spesifik alt kategoriye yükleyin. Kategori, hem müşterinin ürünü nerede bulacağını hem de hangi özellik alanlarının zorunlu olduğunu belirler.
- **Eksiksiz özellik alanları:** Kategorinin zorunlu alanlarının yanında isteğe bağlı alanları da doldurun; filtrelerde görünmenizi sağlar.
- **Başlık:** Marka, ürün türü, ayırt edici özellik ve varyant bilgisini okunur sırayla yazın.
- **Görseller:** Ürünü net, sade zeminde ve farklı açılardan gösteren kendi görselleriniz. Başka satıcıların görsellerini izinsiz kullanmayın.
- **Barkod ve stok kodu:** Aynı ürünü diğer kanallarda hangi barkod ve stok koduyla satıyorsanız idefix'te de aynısını kullanın; stok eşitleme ve sipariş takibi kolaylaşır.

Ürününüz reddedilirse ret nedenini okuyup eksiği tamamlayın; çoğu ret eksik özellik alanı, görsel kuralı ya da kategori uyumsuzluğundan kaynaklanır. Ürün kartını bir kez özenle hazırlamak, sonradan düzeltmeye uğraşmaktan çok daha az zaman alır; ilk izlenimi de ilk müşterileriniz oluşturur.

## Komisyon, kargo ve ödemeler

idefix'te komisyon oranları **kategoriye göre** değişir. İnternette idefix komisyon oranları için birbirinden farklı rakamlar dolaşır; bunlar dönemsel ve satıcıya özel koşulları yansıtmayabilir. Bağlayıcı olan, sözleşmenizde ve satıcı panelinizde yer alan orandır. Aynı şekilde ödeme vadesi, kargo anlaşması ve kargo ücretlerinin kimin tarafından nasıl ödeneceği de sözleşmenizdeki koşullara bağlıdır; başvuru sürecinde bunları açıkça sorun.

Satışa başlamadan önce sorulması gereken sorular:

- Kategorimin komisyon oranı nedir ve KDV dahil mi, hariç mi gösteriliyor?
- Komisyon dışında hizmet bedeli ya da başka bir kesinti var mı?
- Gönderilerde pazaryerinin anlaşmalı kargosu mu, kendi kargo anlaşmam mı kullanılıyor; ücret nasıl hesaplanıyor?
- Satışların parası hangi takvimle hesabıma geçiyor?
- İade kargo ücreti ve iade süreci nasıl işliyor?

Sözleşmeyi onaylamadan önce özellikle şu maddeleri okuyun:

- **Kesintiler:** Komisyon, varsa hizmet bedelleri ve bunların hangi tutar üzerinden hesaplandığı.
- **Ödeme:** Satış bedelinin hangi koşulda (teslimat, iade süresinin dolması gibi) ve hangi takvimle ödendiği.
- **Operasyon yükümlülükleri:** Kargoya teslim süresi, fatura gönderimi, iade sürecindeki sorumluluklar.
- **Yaptırımlar:** Geç kargo, satıcı kaynaklı iptal ya da kural ihlallerinde uygulanabilecek ceza ve yaptırımlar.
- **Sözleşmenin sona ermesi:** Taraflardan birinin sözleşmeyi nasıl ve hangi bildirim süresiyle sonlandırabileceği.

Anlamadığınız bir madde varsa onaylamadan önce satıcı destek ekibine sorun; gerekirse mali müşavirinizden ya da bir avukattan görüş alın.

Ödeme takvimini ve hakedişinizi kontrol etmenin genel mantığını [hakediş rehberimizde](/blog/pazaryeri-hakedis-nedir-ne-zaman-yatar) anlattık.

### Kargo ve paketleme

Kargo modeli ve ücretlendirme sözleşmenize göre belirlenir; ancak hangi model geçerli olursa olsun kargo ücreti çoğu zaman paketin desisine bağlıdır. Ürünlerinizi gereğinden büyük kolilerle göndermek kargo maliyetinizi gereksiz yere artırır. Her ürün için uygun paket ölçüsünü belirleyip desisini önceden hesaplamak, fiyatlamayı da doğru yapmanızı sağlar; bunun için [desi hesaplama aracını](/araclar/desi-hesaplama) kullanabilirsiniz.

### idefix'te fiyatı nasıl belirlemeli?

Her pazaryerinde olduğu gibi idefix'te de fiyatı maliyete yüzde ekleyerek değil, tüm kesintilerden geriye doğru hesaplayarak belirleyin. Aşağıdaki örnekte tüm tutarlar **varsayımsaldır**; kendi sözleşmenizdeki oran ve tutarlarla hesaplayın.

| Kalem | Tutar |
| --- | --- |
| Satış fiyatı (KDV dahil, %20 KDV) | 600,00 TL |
| Komisyon kesintisi (KDV dahil, varsayımsal) | −90,00 TL |
| Kargo (KDV dahil, varsayımsal) | −70,00 TL |
| Stopaj (600 ÷ 1,20 × %1) | −5,00 TL |
| **Elinize geçen tutar** | **435,00 TL** |
| Alış maliyeti (KDV dahil) | −300,00 TL |
| **KDV farkından önce kalan** | **135,00 TL** |

Bu rakam henüz net kâr değildir; satıştaki KDV ile alış, komisyon ve kargo faturalarındaki KDV arasındaki farkı da ödeyeceksiniz. Hedef kârınıza göre fiyatı bulmak için [satış fiyatı belirleme rehberimizi](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) ve [pazaryeri komisyon hesaplama aracını](/araclar/pazaryeri-komisyon-hesaplama) kullanabilirsiniz.

## idefix'te satışları artırmak için

- **Ürün kartını eksiksiz hazırlayın.** Müşterinin aradığı kelimeleri içeren başlık, birden fazla açıdan net görseller, doldurulmuş özellik alanları ve soruları önceden cevaplayan bir açıklama.
- **Kitap satıyorsanız künye bilgilerini eksiksiz girin.** Kitaplarda barkod olarak ISBN kullanılır; yazar, yayınevi, baskı ve sayfa sayısı gibi bilgiler müşterinin arama ve karar sürecinde önemlidir.
- **Kargoya teslim süresini tutturun.** Yeni bir kanalda ilk siparişlerin zamanında ve sorunsuz gitmesi, mağaza performansınızın temelini atar.
- **Stoklarınızı diğer kanallarla eşit tutun.** idefix'i mevcut kanallarınıza ek olarak açıyorsanız, bir kanalda satılan ürünün idefix'te de stoktan düşmesi gerekir. Aksi halde satıcı kaynaklı iptal yaşarsınız. Bu riski [stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) anlattık.
- **Müşteri sorularını aynı gün cevaplayın.** Sorusu cevaplanan müşteri satın alır, cevap bekleyen müşteri başka satıcıya gider.
- **İadeleri hızlı sonuçlandırın.** İade talebini zamanında onaylamak ya da gerekçesiyle reddetmek müşteri memnuniyetini korur.

![idefix'e başlamadan önce hazırlık listesi: belgeler, kategori ve ürün, fiyat ve kesintiler, operasyon](https://hasturkcrm.com/img/blog/idefix-hazirlik-listesi.jpg "Başvurudan önce dört başlıkta hazırlık")

## İlk 30 gün için plan

idefix'i mevcut kanallarınıza ek olarak açıyorsanız, ilk ayı kontrollü bir deneme gibi planlamak riskleri azaltır:

| Dönem | Odak | Yapılacaklar |
| --- | --- | --- |
| 1. hafta | Kurulum | Mağaza, kargo ve iade ayarları; ilk 20–30 ürünün yüklenmesi; stok eşitlemenin kontrolü |
| 2. hafta | İlk siparişler | Her siparişi aynı gün hazırlamak; soruları aynı gün cevaplamak; ilk hakediş kalemlerini not etmek |
| 3. hafta | Ölçüm | Hangi ürünler görüntüleniyor ve satıyor; rakip fiyatlar; ürün bazında kâr |
| 4. hafta | Genişleme | Satan ürün gruplarına benzer ürünler eklemek; satmayanlarda başlık, görsel ve fiyatı düzeltmek |

Tablodaki ürün sayıları bir öneridir; kendi kapasitenize göre uyarlayın. Önemli olan, yeni kanalı tüm kataloğu bir anda yükleyerek değil, işleyişini gördükçe büyüterek açmaktır. İlk ayın sonunda idefix'teki ürün bazında kârı diğer kanallarınızla karşılaştırın; hangi ürünlerin bu kanalda daha iyi sonuç verdiğini görmek, sonraki adımları netleştirir.

### İade ve müşteri ilişkileri

Mesafeli satışta tüketicinin cayma hakkı ve iade kuralları idefix'te de geçerlidir. İade taleplerini zamanında sonuçlandırın; reddetmeniz gereken bir talep varsa gerekçesini açıkça belirtin. İade nedenlerini ürün bazında not etmek, ürün sayfasındaki eksikleri ve paketleme sorunlarını erkenden gösterir. İade oranını düşürmenin yollarını [iade yönetimi rehberimizde](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) anlattık.

## Başlamadan önce kontrol listesi

- Vergi levhası, imza belgeleri ve şirket adına banka hesabınız hazır.
- Satacağınız kategoriler ve ilk yükleyeceğiniz ürünler belli; her ürünün barkodu, görselleri ve özellik bilgileri hazır.
- Kategorinizin komisyon oranı, kargo modeli ve ödeme takvimi sözleşmenizden öğrenildi.
- Her ürün için idefix'teki kesintilere göre başabaş ve hedef fiyatınız hesaplandı.
- Stoğunuzu diğer kanallarla nasıl eşit tutacağınız belirlendi.
- Siparişleri kimin, hangi saatlerde hazırlayıp kargoya vereceği belli.

## idefix'i diğer kanallarınızla tek panelden yönetin

idefix'i ek bir kanal olarak açtığınızda iş yükü de artar: bir panel daha, bir sipariş listesi daha, bir stok daha. Hastürk CRM'in [idefix entegrasyonuyla](/entegrasyonlar/idefix) idefix siparişlerinizi diğer kanallarla aynı listede görür, siparişi onaylayıp kargoya verildi olarak idefix'e bildirirsiniz. Stok ve fiyatlarınız diğer kanallarla eşit kalır; kategori eşleştirmesiyle ürünlerinizi panelden idefix'e gönderebilirsiniz ([ürün yönetimi](/ozellikler/urun-yonetimi)). Müşteri sorularını yanıtlar, iade taleplerini onaylar ya da gerekçesiyle reddedersiniz.

Bağlantı için idefix satıcı panelinde **Hesap Bilgileri → Entegrasyon Bilgileri → Yeni API Oluştur** adımlarıyla API Key, API Secret ve Satıcı ID (Vendor ID) bilgilerinizi alırsınız. Paneli [canlı demoda](/demo) inceleyebilir, kendi mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### idefix'te satıcı olmak ücretli mi?

Başvurunun koşulları ve varsa ücretler sözleşmede belirtilir. Komisyon oranı kategoriye göre değişir ve satış üzerinden kesilir. Güncel koşulları başvuru sürecinde ve sözleşmenizde kontrol edin.

### idefix'te şahıs şirketiyle satış yapılabilir mi?

Vergi mükellefi ve fatura kesebilen bir işletme gerekir. Satıcı kaynaklarında şahıs şirketlerinin de başvurabildiği belirtilir; ancak kabul koşulları değişebileceği için şirket türünüzü başvuru sırasında teyit edin. Vergi kaydı olmayan bireysel başvurular kabul edilmez.

### idefix'e nereden başvurulur?

idefix.com'daki "Satıcımız Olun" sayfasından. Başvuru formunda şirket bilgileri, iletişim bilgileri ve satmak istediğiniz ürün kategorileri istenir; başvuru değerlendirildikten sonra satıcı hesabınız oluşturulur.

### idefix'te sadece kitap mı satılır?

Hayır. Şirketin açıklamasına göre idefix, Haziran 2023'teki pazaryeri dönüşümüyle elektronik, moda, anne ve bebek, kozmetik, süpermarket, petshop, ev ve yaşam, spor ve outdoor ile yapı market gibi pek çok kategoride satıcılarla çalışıyor.

### idefix komisyon oranları ne kadar?

Komisyon oranları kategoriye göre değişir. İnternette farklı rakamlar dolaştığı için bunlara değil, sözleşmenizde ve satıcı panelinizde yer alan orana güvenin. Oranın KDV dahil mi hariç mi gösterildiğini de kontrol edin.

### idefix siparişlerini diğer pazaryerleriyle birlikte yönetebilir miyim?

Evet. Hastürk CRM gibi entegrasyon yazılımlarıyla idefix siparişlerinizi, stoklarınızı, fiyatlarınızı, ürün yüklemelerinizi, müşteri sorularınızı ve iade taleplerinizi diğer kanallarla aynı panelden yönetebilirsiniz.
`,
  },
];
