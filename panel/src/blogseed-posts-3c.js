// Üçüncü parti hazır blog yazıları (bkz. blogseed.js, biçim blogseed-posts.js ile aynı)
export const POSTS_3C = [
  {
    slug: "pazaryeri-siparis-yonetimi-geciken-siparis",
    title: "Pazaryeri Sipariş Yönetimi: Tüm Siparişleri Tek Ekrandan Yönetmek ve Gecikmeyi Önlemek",
    seo_title: "Pazaryeri Sipariş Yönetimi: Geciken Siparişi Önleyin",
    seo_desc: "Pazaryeri siparişlerini tek ekrandan yönetin: son kargoya teslim tarihi, günlük sipariş rutini, gecikmeyi önleyen 8 kural ve ölçüler. Rehberi okuyun.",
    summary: "Birden fazla pazaryerinde satarken siparişleri tek listede toplamak, son kargoya teslim tarihine göre önceliklendirmek ve gecikmeyi önlemek için sipariş yaşam döngüsünü, günlük sipariş rutinini, 8 pratik kuralı ve takip edilecek ölçüleri anlatıyoruz.",
    tags: ["Sipariş Yönetimi","Kargo","Pazaryeri","Operasyon"],
    cover: "cok-kanalli-siparis-yonetimi-kapak.jpg",
    body: `Birden fazla pazaryerinde satış yapan bir mağazada siparişler farklı panellere, farklı saatlerde ve farklı kargo kurallarıyla düşer. Trendyol'a bakarken Hepsiburada'daki bir siparişi, N11'e bakarken kendi sitenizdeki bir siparişi gözden kaçırmak çok kolaydır. Gözden kaçan sipariş geç kargolanır; geç kargolama da müşteri şikâyetine, iptale ve mağaza performansınızın düşmesine dönüşür.

Bu yazıda çok kanallı sipariş yönetiminin nasıl kurulacağını anlatıyoruz: siparişin yaşam döngüsü, kanalların "son kargoya teslim" tarihlerini doğru okumak, günlük sipariş rutini, gecikmeyi önleyen pratik kurallar, iptal ve iade gibi istisnaların yönetimi ve takip etmeniz gereken ölçüler.

## Çok kanallı sipariş yönetimi nedir?

Çok kanallı sipariş yönetimi, farklı satış kanallarından (pazaryerleri, kendi e-ticaret siteniz, hızlı market kanalları) gelen siparişleri tek bir iş akışında toplamak, önceliklendirmek, hazırlamak, kargolamak ve sonuçlandırmaktır. Amaç basittir: her sipariş, kanalın beklediği sürede ve doğru ürünle müşteriye çıksın.

Siparişleri her kanalın kendi panelinden yönetmek az sipariş varken çalışır. Kanal ve sipariş sayısı arttıkça üç sorun ortaya çıkar:

- **Görünürlük kaybı:** Hangi kanalda kaç bekleyen sipariş olduğunu görmek için her panele ayrı ayrı girmeniz gerekir.
- **Önceliklendirme hatası:** Her kanalın kargolama süresi farklıdır. Siparişleri geliş sırasına göre hazırlarsanız, süresi en erken dolacak siparişi sona bırakabilirsiniz.
- **Stok çakışması:** Aynı ürün iki kanalda aynı anda satıldığında stoğunuz yetmeyebilir. Bu konuyu [stok takibi ve fazla satış rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) ayrıntılı anlattık.

## Bir siparişin yaşam döngüsü

Kanallar durumlara farklı adlar verse de bir siparişin izlediği yol hemen her yerde aynıdır. Sipariş yönetimini kurarken bu aşamaları ortak bir dile çevirmek, ekibin aynı şeyi anlamasını sağlar.

| Aşama | Ne olur? | Sizin işiniz |
| --- | --- | --- |
| Yeni | Müşteri ödemeyi yapmıştır, sipariş size düşer. | Siparişi görmek, stoğu kontrol etmek |
| Hazırlanıyor | Siparişi işleme alırsınız; pazaryeri müşteriye hazırlandığını gösterir. | Ürünü toplamak, paketlemek, etiketi basmak |
| Kargoya verildi | Paket kargo firmasına teslim edilmiştir. | Takip numarasının kanala ulaştığını kontrol etmek |
| Teslim edildi | Müşteri paketi almıştır; iade süresi işlemeye başlar. | Soru ve iade taleplerini izlemek |
| İptal / iade | Sipariş iptal edilmiş ya da ürün geri dönmüştür. | Stoğu düzeltmek, nedeni kaydetmek |

![Sipariş yaşam döngüsü: yeni, hazırlanıyor, kargoya verildi, teslim edildi; iptal ve iade dalları](https://hasturkcrm.com/img/blog/siparis-yasam-dongusu.jpg "Bir siparişin aşamaları ve her aşamada satıcının yapması gerekenler")

Bu tablodaki en kritik geçiş "Hazırlanıyor"dan "Kargoya verildi"ye olanıdır. Pazaryerlerinin performans ölçümü büyük ölçüde paketin kargo firmasına ne zaman teslim edildiğine bakar.

## Son kargoya teslim tarihini doğru okuyun

Pazaryerlerinde her siparişin bir **son kargoya teslim tarihi** vardır. Bu tarih, ürününüz için tanımlı kargoya teslim (hazırlık) süresine ve siparişin geldiği saate göre oluşur ve sipariş bilgilerinde yer alır. Örneğin Trendyol'un sipariş servisinde her paket için bu tarih ayrı bir alan olarak döner; Amazon siparişlerinde en geç gönderim tarihi, Hepsiburada'da ise sipariş kalemlerinin vade tarihi bulunur.

Bu tarih sizin için sipariş listesindeki asıl sıralama ölçütüdür. Dikkat edilmesi gerekenler:

- **Kargoya teslim süresi ürün ya da ilan bazında tanımlanır.** Ürünü hazırlamak için gerçekten ihtiyacınız olan süreyi girin. Rekabet için kısa süre yazıp tutturamamak, uzun süre yazmaktan daha zararlıdır.
- **"Kargoya teslim" kargo firmasının paketi okutmasıdır.** Etiketi basmış olmanız ya da paketi kapınızın önüne koymanız yetmez; kargo firmasının sistemine giriş yapılmış olması gerekir. Kargo firmasının sizden alım saati, son teslim saatiniz gibi düşünülmelidir.
- **Hafta sonu ve tatiller.** Kanalların hafta sonu ve resmî tatilleri nasıl saydığı farklı olabilir. Kendi kanallarınız için bu kuralı satıcı panelinden ya da satıcı destek sayfalarından kontrol edin.

### Geç kargolamanın sonuçları

Pazaryerleri geç kargolanan siparişleri mağaza performansı hesabına katar. Gecikme oranı yükseldiğinde mağaza puanı düşebilir, ürünlerin görünürlüğü ve buybox şansı azalabilir; pazaryerine göre ek yaptırımlar da uygulanabilir. Gecikmeye ilişkin ceza, eşik ve puan kuralları pazaryerine göre değişir ve sık güncellenir; internette dolaşan tablolara değil, satıcı sözleşmenize ve satıcı panelinizdeki güncel performans kurallarına bakın. Buybox'ın teslimat hızından nasıl etkilendiğini [buybox rehberimizde](/blog/trendyol-buybox-nedir-nasil-kazanilir) anlattık.

Yasal çerçeve açısından ise satıcı, taahhüt ettiği süre içinde teslimatı yapmakla yükümlüdür; Mesafeli Sözleşmeler Yönetmeliği'ne göre mal satışlarında bu süre her hâlükârda otuz günü geçemez. Pazaryerlerinin kargolama süreleri bu üst sınırdan çok daha kısadır; pratikte sizi bağlayan, ilanınızda taahhüt ettiğiniz süredir.

## Siparişleri tek ekranda toplamak

Çok kanallı sipariş yönetiminin ilk adımı, tüm kanalların siparişlerini tek listede görmektir. Bunun üç yolu vardır:

| Yöntem | Nasıl çalışır? | Ne zaman yeterli? |
| --- | --- | --- |
| Her kanalın kendi paneli | Gün içinde her panele sırayla girersiniz. | Tek kanal, günde birkaç sipariş |
| Excel'e aktarma | Kanallardan sipariş listesini indirip birleştirirsiniz. | Raporlama için; anlık takip için uygun değil |
| Entegrasyon paneli | Siparişler API ile düzenli aralıklarla tek listeye gelir. | Birden fazla kanal, ekipli çalışma |

Entegrasyonun nasıl çalıştığını ve neye dikkat edilmesi gerektiğini [pazaryeri entegrasyonu rehberimizde](/blog/pazaryeri-entegrasyonu-nedir) anlattık. Burada önemli olan şudur: tek liste, siparişlerin **son kargoya teslim tarihine göre** sıralanabilmeli ve süresi yaklaşan siparişler ayrıca işaretlenmelidir. Yalnızca "yeni sipariş" sayısını gösteren bir ekran, gecikmeyi önlemeye yetmez.

## Günlük sipariş rutini

Gecikmeleri en çok azaltan şey yazılım değil, her gün aynı saatlerde tekrarlanan sabit bir rutindir. Aşağıdaki akış, günde birkaç düzineden birkaç yüze kadar sipariş çıkaran mağazalar için uyarlanabilir:

1. **Güne başlarken:** Gece gelen siparişleri ve gecikme riski taşıyanları kontrol edin. Önceki günden kalan, kargoya verilmemiş paket var mı bakın.
2. **Toplu işleme alma:** Hazırlanabilecek siparişleri topluca işleme alın. Stoğu yetmeyen ya da sorunlu siparişleri ayırın; bunlar için müşteriyle iletişime geçin.
3. **Toplama ve paketleme:** Günün siparişleri için ürün bazında toplama listesi çıkarın; ürünleri raftan bir kerede toplayıp paketleyin. Toplama listesi ve toplu etiket gibi araçlar bu adımı belirgin şekilde hızlandırır; panelde bunlar [kargo ve etiket](/ozellikler/kargo-ve-etiket) bölümündedir.
4. **Etiket ve kargo:** Etiketleri toplu basın, paketleri kargo firmasının alım saatinden önce hazır edin.
5. **Öğleden sonra ikinci tur:** Sabahtan sonra gelen siparişleri aynı şekilde işleyin. Kargo alım saatinden sonra gelen siparişlerin son teslim tarihini kontrol edin.
6. **Gün sonu kontrolü:** "Hazırlanıyor" durumunda kalmış, etiketi basılmış ama kargoya verilmemiş paket kalmadığından emin olun. Kanalda takip numarası görünmeyen siparişleri not alın.

![Günlük sipariş rutini: sabah kontrolü, toplu işleme alma, toplama ve paketleme, etiket ve kargo, ikinci tur ve gün sonu kontrolü](https://hasturkcrm.com/img/blog/gunluk-siparis-rutini.jpg "Her gün aynı sırayla tekrarlanan altı adımlık sipariş rutini")

### Kargo alım saatini sabitleyin

Kargo firmasının paketleri sizden aldığı saat, günlük rutininizin omurgasıdır. Bu saatten önce hazır olan paketler o gün kargoya verilmiş sayılır; sonrası ertesi güne kalır. Alım saatini bilmeden hazırlık süresi tanımlamak, gecikmeyi baştan kabul etmek demektir. Gönderi sayınız arttıkça kargo firmasıyla ikinci bir alım saati ya da şubeye teslim seçeneğini konuşun.

## Gecikmeyi önleyen 8 kural

1. **Gerçekçi hazırlık süresi tanımlayın.** Ürün stokta ve rafta değilse (örneğin tedarikçiden gelecekse), o ürünün kargoya teslim süresini buna göre uzatın.
2. **Siparişi kanal sırasına göre değil, son teslim tarihine göre hazırlayın.** En erken süresi dolacak sipariş her zaman ilk sıradadır.
3. **Stoğu sipariş gelmeden doğru tutun.** Stokta olmayan ürünün satılması hem iptale hem de gecikmeye yol açar. Kanallar arası stok senkronu bunun ön koşuludur.
4. **Sorunlu siparişi bekletmeyin.** Adres eksikliği, stok farkı ya da varyant karışıklığı varsa siparişi hemen ayırın ve aynı gün çözün.
5. **Toplu işlem yapın.** Siparişleri tek tek işleme almak ve etiketleri tek tek basmak, yoğun günlerde en çok vakit kaybettiren adımdır.
6. **Kampanya günlerine hazırlanın.** İndirim dönemlerinde sipariş sayısı birkaç katına çıkabilir. Paketleme malzemesini, ek personeli ve kargo alım saatini önceden planlayın.
7. **Takip numarasının kanala ulaştığını kontrol edin.** Kendi kargo anlaşmanızla gönderdiğiniz siparişlerde takip numarası kanala bildirilmezse sipariş kanalda kargoya verilmemiş görünebilir.
8. **Gecikmelerin nedenini kaydedin.** Gecikmeler genellikle birkaç nedende toplanır: belirli bir tedarikçi, belirli bir ürün grubu ya da belirli bir gün. Nedeni bilmeden aynı hata tekrar eder.

## İptal, iade ve istisnalar

Sipariş yönetimi yalnız mutlu akıştan ibaret değildir. İstisnaların da bir sahibi ve kuralı olmalıdır:

- **Müşteri iptali:** Sipariş henüz kargoya verilmeden müşteri iptal ettiyse paketi hazırlamayı durdurun ve stoğu geri ekleyin. Kanal panelinden yapılan iptallerin listenize yansıdığını kontrol edin.
- **Satıcı kaynaklı iptal (tedarik edememe):** Stokta olmayan ürünü iptal etmek pazaryerlerinde genellikle performans ölçüsüne girer. Bunu en aza indirmenin yolu doğru stoktur.
- **Paket bölme:** Bir siparişteki ürünlerden biri hazır değilse bazı kanallarda paketi bölerek hazır olanı önce gönderebilirsiniz. Bu seçeneğin hangi kanalda nasıl çalıştığını satıcı panelinizden kontrol edin.
- **İade:** İade gelen ürünü kontrol edip stoğa geri ekleyin, nedenini kaydedin. İade sürecini ve iade oranını düşürmenin yollarını [iade yönetimi rehberimizde](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) anlattık.

## Ekipte görev dağılımı

Sipariş sayısı arttığında "herkes her işe bakar" düzeni hata üretir: iki kişi aynı siparişi hazırlar, bir sipariş ise kimse sahiplenmediği için bekler. Küçük ekiplerde bile sorumlulukları netleştirmek gecikmeleri belirgin şekilde azaltır:

| Görev | Sorumlu | Ne zaman? |
| --- | --- | --- |
| Gecikme riski taşıyan siparişleri kontrol etmek | Operasyon sorumlusu | Gün başında ve öğleden sonra |
| Siparişleri işleme almak, sorunlu olanları ayırmak | Operasyon sorumlusu | Her sipariş turunda |
| Toplama, kontrol ve paketleme | Depo personeli | Kargo alım saatinden önce |
| Kargo teslimi ve takip numarası kontrolü | Depo personeli | Alım saatinde ve gün sonunda |
| İptal, iade ve müşteri soruları | Müşteri hizmetleri | Gün içinde düzenli aralıklarla |

Her personelin yalnız kendi işiyle ilgili ekranları görmesi hem hatayı hem de karışıklığı azaltır. Tatil ve izin günleri için her görevin bir yedeği olmalıdır; sipariş akışı tek bir kişinin varlığına bağlı kalmamalıdır.

## Takip etmeniz gereken sipariş ölçüleri

| Ölçü | Nasıl hesaplanır? | Ne anlatır? |
| --- | --- | --- |
| Zamanında kargolama oranı | Süresinde kargoya verilen sipariş ÷ toplam sipariş | Operasyonunuzun kanal kurallarına uyumu |
| Ortalama hazırlık süresi | Sipariş saati ile kargoya teslim saati arasındaki ortalama süre | Hazırlık sürelerinizin gerçekçi olup olmadığı |
| Satıcı kaynaklı iptal oranı | Stok ya da hazırlık nedeniyle iptal edilen ÷ toplam sipariş | Stok doğruluğu |
| Hatalı gönderim oranı | Yanlış ürün, yanlış varyant ya da eksik ürün ÷ toplam gönderi | Toplama ve paketleme kalitesi |
| İade oranı | İade edilen ÷ teslim edilen sipariş | Ürün sayfası ve ürün kalitesi |

Bu ölçüleri kanal bazında ayrı ayrı izleyin. Bir kanalda gecikme oranı diğerlerinden yüksekse, o kanalın hazırlık süresi tanımları ya da kargo modeli gözden geçirilmelidir.

## Sipariş başına kâr: hızın ötesi

Siparişi zamanında kargolamak işin yarısıdır; diğer yarısı o siparişten gerçekten kâr edip etmediğinizdir. Komisyon, kargo, hizmet bedeli ve diğer kesintiler düşüldüğünde bazı siparişler zarar ettirebilir. Sipariş listesinde her siparişin net kârını görmek, zarar eden ürünleri erkenden fark etmenizi sağlar. Hesaplamanın mantığını [Trendyol komisyon ve net kâr rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) örnekle anlattık.

## Hastürk CRM ile tüm siparişler tek listede

Hastürk CRM'in [sipariş yönetimi](/ozellikler/siparis-yonetimi) bölümünde Trendyol, Hepsiburada, N11, ikas ve diğer bağlı kanallarınızdan gelen siparişler 15 dakikada bir kendiliğinden panele gelir; isterseniz "Yenile" ile hemen çekebilirsiniz.

- **Durum sekmeleri:** Yeni, hazırlanan, geciken, kargodaki, teslim edilen, iptal ve iade siparişler ayrı sekmelerde; her sekmede kaç sipariş olduğu görünür.
- **Gecikme uyarısı:** Kanalın son kargoya teslim saatine göre geciken ve gecikme riski taşıyan siparişler kırmızıyla işaretlenir.
- **Toplu işlem:** Birden fazla siparişi tek seferde işleme alır, etiketlerini toplu oluşturup yazdırırsınız.
- **Satırda kâr:** Her siparişte komisyon ve kargo düşüldükten sonra size kalan kâr aynı satırda görünür.
- **Dışarıda yapılan işlemler:** Pazaryeri panelinden yapılan iptal, iade ya da kargolama panelde de kendiliğinden güncellenir.
- **Bildirim ve özet:** Yeni siparişte e-posta ve telefon bildirimi gelir; her sabah önceki günün özeti e-postanıza düşer.

Bir kanalda satılan ürünün stoğu [stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) ile diğer kanallarda da düşer; böylece stokta olmayan ürün satılıp siparişin iptal edilmesi riski azalır. Sipariş, kargo etiketi ve toplama listesi tüm [paketlerde](/paketler) yer alır.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazalarınızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Pazaryerinde sipariş ne zamana kadar kargoya verilmeli?

Her siparişin bir son kargoya teslim tarihi vardır; bu tarih ürününüz için tanımlı kargoya teslim süresine ve siparişin geldiği saate göre oluşur ve sipariş detayında görünür. Sipariş bu tarihe kadar kargo firmasına teslim edilip sisteme okutulmalıdır.

### Geç kargolanan sipariş için ne olur?

Geç kargolama mağaza performans ölçülerine yansır; mağaza puanı, görünürlük ve buybox şansı etkilenebilir, pazaryerine göre ek yaptırımlar da uygulanabilir. Kurallar pazaryerine göre farklıdır ve değişebilir; güncel koşulları satıcı panelinizden kontrol edin.

### Birden fazla pazaryerinin siparişlerini tek ekrandan nasıl yönetirim?

Kanalların API'si üzerinden siparişleri düzenli aralıklarla tek listeye çeken bir entegrasyon paneli kullanabilirsiniz. Listeyi son kargoya teslim tarihine göre sıralayıp gecikme riski taşıyan siparişleri ayrıca işaretlemek gecikmeyi önlemenin en etkili yoludur.

### Kargoya teslim süremi kısa mı tutmalıyım, uzun mu?

Gerçekten tutturabileceğiniz en kısa süreyi seçin. Kısa süre müşteri açısından daha cazip görünür, ancak tutturamadığınızda gecikme oranınız yükselir. Tedarikçiden gelen ya da üretim gerektiren ürünlerde süreyi buna göre uzatın.

### Sipariş iptal edilirse stok ne olur?

Kargoya verilmeden iptal edilen siparişin ürünü stoğa geri eklenmelidir. Entegrasyon kullanıyorsanız pazaryeri panelinden yapılan iptalin listenize ve stoğunuza yansıdığını kontrol edin.

### Sipariş yönetiminde en sık yapılan hata nedir?

Siparişleri geliş sırasına ya da kanala göre hazırlamak. Doğru sıralama, son kargoya teslim tarihine göredir. İkinci sık hata ise stoğu kanallar arasında eşitlemeden satış yapmaktır.
`,
  },
  {
    slug: "siparis-hazirlama-depo-duzeni-paketleme",
    title: "Sipariş Hazırlama ve Depo Düzeni: Toplama Listesi, Paketleme ve Kargo Etiketi Rehberi",
    seo_title: "Sipariş Hazırlama ve Depo Düzeni: Toplama, Paketleme",
    seo_desc: "Sipariş hazırlamayı hızlandırın: raf adresleme, toplama yöntemleri, toplama listesi, paketleme istasyonu, kontrol ve toplu etiket. Rehberi hemen okuyun.",
    summary: "Sipariş hazırlama hızını depo düzeni ve günlük iş akışı belirler. Raf adreslemeyi, ürünleri satış hızına göre yerleştirmeyi, toplama yöntemlerini, toplama listesini, paketleme istasyonunu, hatalı gönderimi önleyen kontrolleri ve etiket ile kargo teslimini anlatıyoruz.",
    tags: ["Depo","Sipariş Hazırlama","Kargo Etiketi","Operasyon"],
    cover: "siparis-hazirlama-depo-kapak.jpg",
    body: `E-ticarette müşterinin gördüğü tek fiziksel temas paketin kendisidir. Sipariş ekranında her şey yolunda görünse de yanlış rafa konmuş bir ürün, karışan bir varyant ya da geç basılan bir etiket; gecikmeye, yanlış gönderime ve iadeye dönüşür. Sipariş hazırlama hızınızı yazılımdan çok depo düzeniniz ve her gün tekrarladığınız iş akışı belirler.

Bu yazıda sipariş hazırlama sürecini adım adım ele alıyoruz: depoyu adreslemek, ürünleri satış hızına göre yerleştirmek, doğru toplama yöntemini seçmek, toplama listesiyle çalışmak, paketleme istasyonu kurmak, etiket ve kargo teslimini hızlandırmak ve hataları ölçmek.

## Sipariş hazırlama süreci nedir?

Sipariş hazırlama (fulfillment), bir siparişin sisteme düşmesinden paketin kargo firmasına teslim edilmesine kadar geçen tüm depo işlemleridir. Temel adımlar şunlardır:

1. **Siparişleri işleme alma:** Hangi siparişlerin bugün hazırlanacağı belirlenir.
2. **Toplama (picking):** Ürünler raftan alınır.
3. **Kontrol:** Toplanan ürün, varyant ve adet siparişle karşılaştırılır.
4. **Paketleme:** Ürün uygun koliye ya da poşete konur, korunur ve kapatılır.
5. **Etiketleme:** Kargo etiketi basılıp pakete yapıştırılır.
6. **Kargoya teslim:** Paket kargo firmasına verilir ve sisteme okutulur.

Bu adımların her birinde kaybedilen birkaç dakika, günde yüz siparişte saatlere ulaşır. İyileştirmeye en çok zaman alan adımdan başlayın; küçük depolarda bu çoğunlukla toplama adımıdır.

## Depo düzeni: her ürünün bir adresi olsun

Depoda bir ürünü "nerede olduğunu bilen kişi" bulabiliyorsa, o kişi izne çıktığında sipariş hazırlama durur. Çözüm, her ürüne sabit bir **raf adresi** vermektir.

### Basit bir adresleme sistemi

Adres, ürünün yerini sırasıyla tarif eden kısa bir koddur. Örneğin **A-03-2**: A koridoru, 3 numaralı raf, 2. göz. Küçük bir depoda koridor yerine raf grubu, göz yerine kutu numarası da kullanılabilir. Önemli olan kuralın herkes için aynı olmasıdır.

- Raf ve gözleri okunaklı etiketlerle numaralandırın.
- Her ürünün (varyantlı ürünlerde her varyantın) adresini ürün kartına ya da stok listenize yazın.
- Ürünü adresinden başka bir yere koymayın; yer değişirse adresi aynı anda güncelleyin.
- Aynı göze birbirine benzeyen iki ürünü (aynı modelin iki rengi, iki yakın beden) koymaktan kaçının. Karışan varyant, hatalı gönderimin en sık nedenidir.

### Ürünleri satış hızına göre yerleştirin

Siparişlerin büyük kısmı genellikle ürünlerinizin küçük bir grubundan gelir. Bu ürünleri paketleme masasına en yakın, bel ve göz hizasındaki raflara koymak toplama yolunu kısaltır. Yavaş satan ürünler daha uzak ve üst raflara gidebilir. Hangi ürünün hızlı satan olduğunu belirlemek için son üç ayın satış adetlerini kullanın ve yerleşimi sezon değiştikçe gözden geçirin.

Sık birlikte satılan ürünleri (örneğin bir ürün ve yedek parçası) yan yana koymak da toplamayı hızlandırır.

## Mal kabul: stok doğruluğu kapıda başlar

Toplamada "ürün rafta yok" sorunlarının önemli kısmı mal kabulde başlar. Tedarikçiden gelen ürün sayılmadan rafa konursa ya da sisteme geç işlenirse, sistem stoğu ile raftaki stok arasındaki fark büyür. Basit bir mal kabul akışı:

1. **Gelen koliyi irsaliye ya da faturayla karşılaştırın.** Ürün, varyant ve adet bazında sayın; eksik ve hasarlı ürünleri hemen not edin.
2. **Barkodları kontrol edin.** Barkodsuz ya da okunmayan barkodlu ürünleri etiketleyin. Barkodsuz ürün, kontrol adımında hatalı gönderimin kapısını açar.
3. **Stoğu sisteme işleyin.** Ürünü rafa koymadan önce stoğa ekleyin; böylece ürün beklerken kanallarda "tükendi" görünmez.
4. **Ürünü adresine yerleştirin.** Yeni gelen ürünü eski ürünün arkasına koyun; ilk gelen ürünün ilk çıkması, ambalajı yıpranan ya da sezonu geçen ürün birikmesini önler.

## Toplama yöntemleri

Ürünleri raftan nasıl toplayacağınız, sipariş sayınıza ve sipariş başına ürün sayınıza göre değişir. Üç yaygın yöntem vardır:

| Yöntem | Nasıl çalışır? | Uygun olduğu durum | Dikkat |
| --- | --- | --- | --- |
| Sipariş bazlı toplama | Her sipariş için depoyu ayrı dolaşırsınız. | Günde az sipariş, sipariş başına çok ürün | Sipariş arttıkça yürüme süresi katlanır |
| Toplu toplama | Günün siparişlerindeki ürünler toplam adetle bir kerede toplanır, sonra siparişlere ayrılır. | Çok sipariş, çoğunda tek ürün | Ayırma adımında kontrol şarttır |
| Bölge bazlı toplama | Depo bölgelere ayrılır, her kişi kendi bölgesindeki ürünleri toplar. | Geniş depo, birden fazla personel | Bölgelerden gelen ürünlerin birleştirilmesi gerekir |

![Toplama yöntemleri karşılaştırması: sipariş bazlı, toplu ve bölge bazlı toplama](https://hasturkcrm.com/img/blog/toplama-yontemleri.jpg "Sipariş sayınıza ve depo büyüklüğünüze göre toplama yöntemi seçimi")

Pazaryeri satıcılarının çoğunda siparişlerin büyük kısmı tek ürünlüdür. Bu durumda **toplu toplama** en büyük zaman kazancını sağlar: 40 siparişte aynı üründen 12 adet varsa, o rafa 12 kez değil bir kez gidersiniz.

## Toplama listesiyle çalışmak

Toplama listesi (picking list), günün hazırlanacak siparişlerindeki ürünlerin toplu dökümüdür. İyi bir toplama listesi şu bilgileri içerir:

- Ürün adı ve varyantı (renk, beden)
- Barkod ya da stok kodu
- Toplanacak toplam adet
- Raf adresi
- İsterseniz ürün görseli (benzer ürünleri ayırt etmek için)

Listeyi **raf adresine göre sıralamak**, toplayıcının depoda geri dönmeden tek bir rota izlemesini sağlar. Toplama sırasında listede eksik çıkan ürünleri hemen işaretleyin: rafta olmayan ürün, ya sistem stoğunuzun yanlış olduğunu ya da ürünün yanlış yere konduğunu gösterir. İki durumda da aynı gün düzeltilmelidir; aksi halde ürün satılmaya devam eder. Stok doğruluğu ve sayım konusunu [stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) ele aldık.

## Paketleme istasyonu kurmak

Paketleme masası, ihtiyaç duyulan her şeyin el altında olduğu sabit bir istasyon olmalıdır. Malzeme aramak için masadan kalkmak, paketleme süresini en çok uzatan alışkanlıktır.

### İstasyonda bulunması gerekenler

- En sık kullandığınız ölçülerde koliler ve kargo poşetleri
- Dolgu ve koruma malzemesi, bant ve bant makinesi
- Etiket yazıcısı ve yedek etiket rulosu
- Barkod okuyucu (kontrol için)
- Fatura ya da irsaliye çıktısı gerekiyorsa yazıcı
- Kırılacak ürünler için ek koruma malzemesi ve uyarı etiketi

### Doğru koli, doğru maliyet

Koli seçimi doğrudan kargo maliyetinizi belirler. Kargo ücreti çoğunlukla paketin desisine göre hesaplandığından, ürüne göre büyük koli kullanmak her gönderide fazladan ödeme yapmak demektir. Ürün gruplarınız için birkaç standart koli ölçüsü belirleyin ve hangi ürünün hangi koliye gireceğini listeleyin. Desi hesabını [desi rehberimizde](/blog/desi-nedir-nasil-hesaplanir), kargo maliyetini düşürmenin diğer yollarını [kargo maliyeti rehberimizde](/blog/e-ticarette-kargo-maliyeti-dusurme) anlattık.

### Ürüne göre paketleme malzemesi

Her ürün aynı korumayı gerektirmez. Ürün gruplarınız için paketleme standardını bir kez belirleyip yazılı hale getirmek, hem hasar kaynaklı iadeleri hem de gereksiz malzeme kullanımını azaltır:

| Ürün tipi | Önerilen ambalaj | Dikkat |
| --- | --- | --- |
| Tekstil, kırılmayan yumuşak ürünler | Kargo poşeti | Ürünü ayrıca şeffaf poşetle nemden koruyun |
| Kutulu küçük ürünler | Ürüne yakın ölçüde koli | Kutu içinde oynamayacak kadar dolgu |
| Kırılabilir ürünler | Çift katlı koli, köşe koruma | Ürün koli kenarına temas etmemeli |
| Sıvı içeren ürünler | Sızdırmaz poşet ve koli | Kapağı bantlayın, dik konumu işaretleyin |

## Kontrol adımı: hatalı gönderimi önlemek

Yanlış ürün ya da yanlış varyant gönderimi, iki kez kargo ücreti, iade işlemi ve olumsuz yorum demektir. Kontrol adımını atlamayın:

1. **Barkodu okutun.** Paketlemeden önce ürün barkodunu okutup siparişle karşılaştırmak, göz kontrolünden çok daha güvenilirdir.
2. **Varyantı ayrıca kontrol edin.** Renk ve beden gibi varyantlar aynı barkoda sahip değilse etiketten okuyun.
3. **Adedi sayın.** Çok adetli siparişlerde eksik ürün sık görülür.
4. **Ürünün durumunu kontrol edin.** İade gelip stoğa geri alınan ürünlerde ambalaj ve etiketin sağlam olduğundan emin olun.
5. **Paketi kapatmadan fotoğraf çekin.** Özellikle yüksek tutarlı ürünlerde paket içeriğinin fotoğrafı, "eksik ürün geldi" türü itirazlarda elinizdeki en güçlü kanıttır.

![Paketleme istasyonu kontrol listesi: barkod okutma, varyant, adet, ürün durumu, fotoğraf, doğru koli ve etiket](https://hasturkcrm.com/img/blog/paketleme-kontrol-listesi.jpg "Paketi kapatmadan önce yapılacak yedi kontrol")

## Etiket ve kargo teslimi

### Etiketleri toplu basın

Etiketleri sipariş sipariş basmak yerine, paketlenmeye hazır siparişlerin etiketlerini toplu basın. Etiket sırasının toplama listesiyle aynı olması, eşleştirmeyi kolaylaştırır.

Pazaryerinin anlaşmalı kargosuyla gönderimde kargo barkodu pazaryerinden gelir; etiketin üzerindeki barkodun o siparişe ait olduğundan emin olun. Yanlış pakete yapıştırılan etiket, ürünün başka bir müşteriye gitmesine yol açar. Her etiketi yapıştırırken sipariş numarasını paketin içindeki ürünle karşılaştırın.

### Termal yazıcı mı, normal yazıcı mı?

Termal yazıcılar mürekkep ya da toner kullanmaz, yapışkanlı etiket rulosuna doğrudan basar; kesme ve yapıştırma işi ortadan kalkar. Günde onlarca paket çıkaran mağazalar için zaman kazancı belirgindir. Termal yazıcılar genellikle ZPL gibi yazıcı dillerini ya da PDF çıktısını destekler; etiket kaynağınızın hangi biçimi verdiğini ve yazıcınızın etiket ölçüsünü kontrol edin. Az sipariş çıkaran mağazalarda A4 yapışkanlı etiket kâğıdı ve normal yazıcı da iş görür.

### Kargo teslimini planlayın

Paketlerin kargo firmasına teslim saati, gün içindeki tüm işlerin son teslim saatidir. Bu saatten önce hazır olmayan paket ertesi güne kalır ve siparişin son kargoya teslim tarihi aşılabilir. Paketleri kargo firmasının alım saatinden en az yarım saat önce kapatmayı hedefleyin, teslim sırasında paket sayısını kargo görevlisiyle birlikte sayın ve teslim tutanağını saklayın.

## Hazırlık süresini ölçün

Ölçmediğiniz süreci iyileştiremezsiniz. Basit bir haftalık takip tablosu yeterlidir:

| Ölçü | Hesap | Hedef yönü |
| --- | --- | --- |
| Sipariş başına hazırlık süresi | Hazırlık için harcanan toplam süre ÷ hazırlanan sipariş | Düşmeli |
| Aynı gün kargolama oranı | Alım saatinden önce gelen ve aynı gün kargolanan sipariş ÷ alım saatinden önce gelen sipariş | Yükselmeli |
| Hatalı gönderim oranı | Yanlış ya da eksik gönderi ÷ toplam gönderi | Düşmeli |
| Toplamada bulunamayan ürün | Listede olup rafta bulunamayan satır sayısı | Sıfıra yakın olmalı |

Hatalı gönderimler belli ürünlerde yoğunlaşıyorsa o ürünlerin raf yerleşimini, etiketlerini ya da ürün kartındaki varyant bilgisini gözden geçirin. İade nedenleri arasında "yanlış ürün" sık görülüyorsa, sorun büyük olasılıkla kontrol adımındadır. İade nedenlerini ölçmeyi [iade yönetimi rehberimizde](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) anlattık.

## Yoğun dönemlere hazırlık

Kampanya ve özel gün dönemlerinde sipariş hacmi kısa sürede katlanabilir. Bu dönemlere hazırlık, normal günlerdeki düzenin üzerine kurulur:

- Kampanyaya girecek ürünleri paketleme masasına en yakın raflara taşıyın.
- Koli, poşet, bant ve etiket rulosu stoklarını önceden artırın.
- Geçici personel için raf adresleri ve kontrol adımlarını tek sayfalık bir talimata yazın.
- Kargo firmasıyla ek alım saati ya da ek araç konuşun.
- Toplama ve paketleme işini iki kişiye ayırın: biri toplasın, diğeri kontrol edip paketlesin.

## Sipariş hazırlama kontrol listesi

- Her ürün ve varyantın sabit bir raf adresi var.
- Hızlı satan ürünler paketleme masasına yakın.
- Günün siparişleri toplu toplama listesiyle, raf sırasına göre toplanıyor.
- Paketlemeden önce barkod ve varyant kontrolü yapılıyor.
- Her ürün grubu için standart koli ölçüsü belirlenmiş.
- Etiketler toplu basılıyor; etiket ile paket içeriği eşleştiriliyor.
- Paketler kargo alım saatinden önce kapanıyor.
- Hatalı gönderim ve bulunamayan ürün sayısı her hafta izleniyor.

## Hastürk CRM ile toplama listesi ve toplu etiket

Hastürk CRM'in [kargo ve etiket](/ozellikler/kargo-ve-etiket) bölümü sipariş hazırlama akışını tek ekranda toplar:

- **Toplama listesi:** Bugün hazırlanacak ürünlerin toplu listesi; depoda hangi üründen kaç adet alınacağı tek sayfada.
- **Ortak barkod:** Trendyol ve Hepsiburada siparişlerinde anlaşmalı kargo barkodu pazaryerinden gelir, etiket panelde hazırlanır.
- **Termal ve normal yazıcı:** Etiketler PDF ya da termal yazıcılar için ZPL olarak alınır; toplu yazdırma desteklenir.
- **Kargo takibi:** Hazırlanacak, yazdırılacak, kargoya verilecek ve kargodaki paketler ayrı sekmelerde görünür.
- **Kargo firması seçimi:** Kargo firmasını sipariş başına seçebilir ya da kanal için varsayılan firma belirleyebilirsiniz.

Siparişler [sipariş yönetimi](/ozellikler/siparis-yonetimi) ekranında gecikme riskine göre işaretlenir ve toplu olarak işleme alınabilir. Kendi kargo anlaşmanızla gönderiyorsanız Kurumsal pakette yer alan kargo firması entegrasyonu, etiketi ve takip numarasını doğrudan kargo firmasından alır.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Sipariş hazırlama süresi nasıl kısaltılır?

En büyük kazanç toplama adımındadır: ürünlere sabit raf adresi verin, hızlı satanları paketleme masasına yakın koyun ve günün siparişlerini toplu toplama listesiyle, raf sırasına göre toplayın. Ardından paketleme istasyonunu malzemeleri el altında olacak şekilde düzenleyin ve etiketleri toplu basın.

### Toplama listesi nedir?

Günün hazırlanacak siparişlerindeki ürünlerin toplu dökümüdür. Her ürün için toplam adet, varyant, barkod ve raf adresi yer alır. Toplayıcı her sipariş için depoyu ayrı dolaşmak yerine ürünleri bir kerede toplar.

### Yanlış ürün gönderimi nasıl önlenir?

Paketlemeden önce ürün barkodunu okutup siparişle karşılaştırın, varyantı ve adedi ayrıca kontrol edin. Birbirine benzeyen ürünleri aynı göze koymayın. Hatalı gönderimleri haftalık sayıp hangi ürünlerde yoğunlaştığına bakın.

### Kargo etiketi için termal yazıcı gerekli mi?

Zorunlu değildir; az sipariş çıkaran mağazalar normal yazıcı ve yapışkanlı etiket kâğıdıyla çalışabilir. Günlük gönderi sayısı arttıkça termal yazıcı, kesme ve yapıştırma işini ortadan kaldırarak ciddi zaman kazandırır.

### Depoda raf adresleme nasıl yapılır?

Koridor, raf ve göz sırasıyla kısa bir kod belirleyin (ör. A-03-2), raf ve gözleri etiketleyin ve her ürünün adresini stok listenize yazın. Ürünün yeri değiştiğinde adresi aynı anda güncelleyin.

### Paket içeriğinin fotoğrafını çekmek gerekli mi?

Zorunlu değildir, ancak yüksek tutarlı ürünlerde paket kapanmadan önce çekilen fotoğraf, eksik ya da yanlış ürün itirazlarında elinizdeki en güçlü kanıttır.
`,
  },
  {
    slug: "e-ticarette-stok-yonetimi-yontemleri",
    title: "E-Ticarette Stok Yönetimi Yöntemleri: ABC Analizi, Kritik Stok, Stok Devir Hızı ve Sezon Planı",
    seo_title: "Stok Yönetimi Yöntemleri: ABC Analizi ve Kritik Stok",
    seo_desc: "ABC analizi, stok devir hızı, güvenlik stoğu, kritik stok seviyesi ve sezonluk planlama formülleri örnek hesaplarla. Stoğunuzu doğru yönetin, okuyun.",
    summary: "Hangi ürüne öncelik vermeli, ne zaman ve ne kadar sipariş vermeli? ABC analizini, stok devir hızını, güvenlik stoğu ve kritik stok formüllerini, ekonomik sipariş miktarını, sezon endeksiyle planlamayı ve ölü stok yönetimini örnek hesaplarla anlatıyoruz.",
    tags: ["Stok Yönetimi","ABC Analizi","Planlama","E-Ticaret"],
    cover: "stok-yonetimi-yontemleri-kapak.jpg",
    body: `E-ticarette stok iki yönden para kaybettirir. Az stok, satışın durması, pazaryerinde ürün sıralamasının düşmesi ve müşterinin rakibe gitmesi demektir. Fazla stok ise paranızın rafta beklemesi, depo alanının dolması ve sonunda zararına indirimle eritilen ürünler demektir. İyi stok yönetimi, bu iki uç arasında her ürün için doğru seviyeyi bulmaktır.

Bu yazıda e-ticaret satıcılarının kullanabileceği temel stok yönetimi yöntemlerini formülleri ve örnek hesaplarıyla anlatıyoruz: ABC analizi, stok devir hızı, güvenlik stoğu ve kritik stok seviyesi, ekonomik sipariş miktarı, sezonluk planlama ve ölü stok yönetimi. Örneklerdeki tüm rakamlar **varsayımsaldır**.

## Stok yönetimi neden yalnız sayım değildir?

Stok takibi "elimde kaç adet var?" sorusunu cevaplar. Stok yönetimi ise üç soruyu daha cevaplar: **hangi ürüne** öncelik vermeliyim, **ne zaman** sipariş vermeliyim, **ne kadar** sipariş vermeliyim? Çok kanallı satışta stok adetlerinin kanallar arasında doğru tutulması ön koşuldur; bu konuyu ve fazla satışı önlemeyi [stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) ayrıntılı anlattık. Bu yazı, doğru adetlerin üzerine kurulan planlama yöntemlerine odaklanıyor.

## ABC analizi: her ürüne aynı özeni göstermeyin

ABC analizi, ürünleri satışa (ya da kâra) katkılarına göre üç gruba ayırır. Yöntem, ürünlerin küçük bir kısmının satışın büyük kısmını oluşturduğu gözlemine dayanır. Yaygın kullanılan ayrım şöyledir:

- **A grubu:** Toplam satışın yaklaşık %80'ini oluşturan ürünler. Genellikle ürün sayısının küçük bir kısmıdır.
- **B grubu:** Sonraki yaklaşık %15'lik dilim.
- **C grubu:** Kalan yaklaşık %5'lik dilim; ürün sayısının çoğu genellikle buradadır.

Bu oranlar kesin bir kural değil, başlangıç noktasıdır. Kendi verinizde sınırları biraz kaydırabilirsiniz.

### ABC analizi nasıl yapılır?

1. Son 12 ayın (en az son üç ayın) ürün bazında satış tutarını çıkarın.
2. Ürünleri satış tutarına göre büyükten küçüğe sıralayın.
3. Her ürünün toplam satış içindeki payını ve kümülatif payını hesaplayın.
4. Kümülatif payı %80'e kadar olanları A, %95'e kadar olanları B, kalanları C olarak işaretleyin.

Örnek (yıllık satış tutarları KDV dahil, varsayımsal):

| Ürün | Yıllık satış | Pay | Kümülatif pay | Grup |
| --- | --- | --- | --- | --- |
| Ürün 1 | 420.000 TL | %42,0 | %42,0 | A |
| Ürün 2 | 260.000 TL | %26,0 | %68,0 | A |
| Ürün 3 | 130.000 TL | %13,0 | %81,0 | A |
| Ürün 4 | 70.000 TL | %7,0 | %88,0 | B |
| Ürün 5 | 45.000 TL | %4,5 | %92,5 | B |
| Ürün 6 | 30.000 TL | %3,0 | %95,5 | B |
| Ürün 7 | 20.000 TL | %2,0 | %97,5 | C |
| Ürün 8 | 12.000 TL | %1,2 | %98,7 | C |
| Ürün 9 | 8.000 TL | %0,8 | %99,5 | C |
| Ürün 10 | 5.000 TL | %0,5 | %100,0 | C |

On ürünün üçü satışın %81'ini getiriyor. Bu üç ürünün stoğunun bitmesi, C grubundaki dört ürünün tamamının bitmesinden çok daha pahalıdır.

![ABC analizi grafiği: ürünlerin satış payları ve kümülatif pay eğrisi, A, B ve C grupları](https://hasturkcrm.com/img/blog/abc-analizi-grafigi.jpg "Örnek ABC analizi: on üründen üçü satışın yüzde 81'ini oluşturuyor (varsayımsal)")

### Gruplara göre ne yapmalı?

| Grup | Stok kontrolü | Güvenlik stoğu | Tedarik |
| --- | --- | --- | --- |
| A | Sık (haftalık ya da daha sık) | Yüksek tutun, tükenmesine izin vermeyin | Tedarikçiyle düzenli sipariş planı, yedek tedarikçi |
| B | Orta (iki haftada bir) | Orta | Düzenli sipariş |
| C | Seyrek (aylık) | Düşük ya da hiç | Gerektiğinde sipariş; satmayanları tasfiye |

Bir uyarı: satış tutarına göre yapılan ABC analizi, en çok satan ürünü gösterir ama en çok kâr bırakanı göstermeyebilir. Komisyonu yüksek ya da sık iade alan bir ürün A grubunda olup kârınıza az katkı yapabilir. Analizi bir de ürün bazında net kâr üzerinden yapmak daha doğru bir tablo verir. Net kârın nasıl hesaplandığını [Trendyol komisyon ve net kâr rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) anlattık.

## Stok devir hızı

Stok devir hızı, stoğunuzun bir dönemde kaç kez satılıp yenilendiğini gösterir. Paranızın rafta ne kadar süre beklediğini anlamanın en kısa yoludur.

**Stok devir hızı = Satılan malın maliyeti ÷ Ortalama stok (maliyet değeriyle)**

**Ortalama stok = (Dönem başı stok + Dönem sonu stok) ÷ 2**

**Stokta kalma süresi (gün) = 365 ÷ Yıllık stok devir hızı**

Formülde pay ve paydanın aynı bazda olması önemlidir: ikisi de maliyet değeriyle ve ikisi de KDV hariç alınmalıdır. Satış tutarını maliyetle karşılaştırırsanız devir hızını olduğundan yüksek bulursunuz.

Örnek (KDV hariç, varsayımsal): Yıl içinde satılan malın maliyeti 600.000 TL. Yıl başında stok değeri 140.000 TL, yıl sonunda 100.000 TL.

- Ortalama stok = (140.000 + 100.000) ÷ 2 = **120.000 TL**
- Stok devir hızı = 600.000 ÷ 120.000 = **5**
- Stokta kalma süresi = 365 ÷ 5 = **73 gün**

Yani bir ürün ortalama 73 gün rafta bekliyor. Bu süre tedarikçinize ödeme vadenizden ve pazaryeri hakediş sürenizden uzunsa, satışlarınızı kendi sermayenizle finanse ediyorsunuz demektir. Nakit akışının hakediş tarafını [hakediş rehberimizde](/blog/pazaryeri-hakedis-nedir-ne-zaman-yatar) anlattık.

Devir hızını tüm mağaza için değil, ürün grubu ve ürün bazında da hesaplayın. Ortalama iyi görünürken bazı ürünlerin yılda bir kez bile dönmediğini fark edebilirsiniz.

### Stok kârlılığı: brüt kâr ÷ ortalama stok

Devir hızı tek başına yeterli değildir; hızlı dönen ama çok az kâr bırakan ürün de olabilir. Bunun için **stok yatırımının brüt kâr getirisi** kullanılır:

**Stok getirisi = Yıllık brüt kâr ÷ Ortalama stok (maliyet değeriyle)**

Örneğimizde yıllık brüt kâr 240.000 TL ise: 240.000 ÷ 120.000 = **2**. Stoğa bağladığınız her 1 TL yılda 2 TL brüt kâr üretiyor. Bu oranı ürünler arasında karşılaştırmak, sınırlı sermayenizi hangi ürüne bağlayacağınıza karar vermenizi kolaylaştırır.

## Güvenlik stoğu ve kritik stok seviyesi

Kritik stok seviyesi (yeniden sipariş noktası), stoğun bu seviyeye düştüğünde yeni sipariş vermeniz gereken adettir. Tedarik süresi boyunca satacağınız miktar ile beklenmedik dalgalanmalara karşı tuttuğunuz güvenlik stoğunun toplamıdır:

**Kritik stok = Günlük ortalama satış × Tedarik süresi (gün) + Güvenlik stoğu**

Asıl soru güvenlik stoğunun ne kadar olacağıdır. İki yaygın yöntem vardır.

### Yöntem 1: En yüksek ve ortalama değerlerle

**Güvenlik stoğu = (En yüksek günlük satış × En uzun tedarik süresi) − (Ortalama günlük satış × Ortalama tedarik süresi)**

Örnek (varsayımsal): En yüksek günlük satış 12, en uzun tedarik süresi 14 gün; ortalama günlük satış 8, ortalama tedarik süresi 10 gün.

Güvenlik stoğu = (12 × 14) − (8 × 10) = 168 − 80 = **88 adet**

Bu yöntem kolaydır ama en kötü iki durumun aynı anda yaşanacağını varsaydığı için genellikle yüksek sonuç verir. Tedarik sorunu sık yaşanan A grubu ürünlerde uygun olabilir.

### Yöntem 2: Satış dalgalanmasıyla (istatistiksel)

Tedarik süresi görece sabitse ve günlük satışlarınızın dalgalanmasını biliyorsanız:

**Güvenlik stoğu = Z × Günlük satışın standart sapması × √Tedarik süresi**

Z, hedeflediğiniz hizmet düzeyine karşılık gelen katsayıdır: %90 için yaklaşık 1,28, %95 için yaklaşık 1,65, %99 için yaklaşık 2,33. Günlük satışın standart sapmasını son 30–90 günün satışlarından Excel'de STDSAPMA işleviyle hesaplayabilirsiniz.

Örnek (varsayımsal): Ortalama günlük satış 8 adet, standart sapma 3 adet, tedarik süresi 9 gün, hedef hizmet düzeyi %95.

- Güvenlik stoğu = 1,65 × 3 × √9 = 1,65 × 3 × 3 = 14,85 → **15 adet**
- Kritik stok = 8 × 9 + 15 = 72 + 15 = **87 adet**

Stok 87 adede düştüğünde siparişi verirsiniz. Hizmet düzeyi yükseldikçe güvenlik stoğu hızla artar; her ürün için %99 hedeflemek, sermayenizi gereksiz yere bağlar. A grubunda yüksek, C grubunda düşük hizmet düzeyi seçmek mantıklıdır.

![Stok formülleri kartı: stok devir hızı, stokta kalma süresi, güvenlik stoğu, kritik stok ve ekonomik sipariş miktarı](https://hasturkcrm.com/img/blog/stok-formulleri-karti.jpg "Stok yönetiminde en sık kullanılan formüller ve örnek sonuçlar (varsayımsal)")

## Ne kadar sipariş vermeli? Ekonomik sipariş miktarı

Sık ve az sipariş vermek stok tutma maliyetini düşürür ama sipariş, nakliye ve mal kabul işini artırır. Seyrek ve çok sipariş vermek ise tersini yapar. Ekonomik sipariş miktarı (EOQ), bu iki maliyetin toplamını en aza indiren sipariş adedini verir:

**EOQ = √(2 × Yıllık talep × Sipariş başına sabit maliyet ÷ Birim başına yıllık stok tutma maliyeti)**

Örnek (varsayımsal): Yıllık talep 2.400 adet, her siparişin sabit maliyeti (nakliye, mal kabul, işlem) 500 TL, bir ürünü bir yıl stokta tutmanın maliyeti (depo, sermaye, fire) 12 TL.

EOQ = √(2 × 2.400 × 500 ÷ 12) = √200.000 ≈ **447 adet**

Yani yılda yaklaşık 5–6 kez, her seferinde 450 civarında sipariş vermek bu varsayımlarla en düşük toplam maliyeti verir. Gerçek hayatta tedarikçinin asgari sipariş adedi, miktar indirimleri ve sezon etkisi bu sonucu değiştirir; EOQ'yu kesin cevap değil, başlangıç noktası olarak kullanın.

## Sezonluk planlama

Birçok kategoride satışlar yıl içinde eşit dağılmaz: okul dönemi, bayramlar, yaz ve kış sezonu, yıl sonu indirim günleri. Sezonluk ürünlerde günlük ortalama satışla hesaplanan kritik stok, sezon başında yetersiz, sezon sonunda fazla kalır.

### Sezon endeksiyle tahmin

1. Geçen yılın aylık satış adetlerini çıkarın.
2. Aylık ortalamayı hesaplayın (yıllık satış ÷ 12).
3. Her ayın **sezon endeksini** bulun: o ayın satışı ÷ aylık ortalama.
4. Bu yıl için beklediğiniz aylık ortalamayı endeksle çarpın.

Örnek (varsayımsal): Geçen yıl toplam 3.600 adet sattınız; aylık ortalama 300 adet. Geçen Kasım 690 adet sattınız: Kasım endeksi = 690 ÷ 300 = **2,3**. Bu yıl satışlarınızın %20 büyüyeceğini tahmin ediyorsanız aylık ortalama 360 olur ve Kasım tahmini 360 × 2,3 = **828 adet** olur.

Tahmini çıkardıktan sonra, tedarik süresini geriye doğru sayarak sipariş tarihini belirleyin. Sezon ürünlerinde stoğun sezon başlamadan rafta olması gerekir; sezon ortasında tükenen ürünü yeniden getirmek çoğu zaman mümkün olmaz ya da sezon biter.

### Sezon planında dikkat edilecekler

- Geçen yılın stok tükenmesi yaşanan aylarındaki satış, gerçek talebi değil stoğun yettiği kadarını gösterir. Bu ayların endeksini yukarı yönlü düzeltin.
- Kampanyaya katılacağınız günleri ayrıca planlayın; kampanya satışları normal sezon eğrisinin üzerine eklenir.
- Sezon sonu için bir çıkış planı yapın: sezon bitmeden yavaşlayan ürünler için kademeli indirim takvimi belirleyin.

## Ölü stok ve yavaş dönen ürünler

Belirli bir süredir (örneğin 90 ya da 180 gün) hiç satılmayan ürünler ölü stoktur. Bu ürünler hem sermayeyi hem depo alanını bağlar. Ayda bir kez şu listeyi çıkarın: son 90 günde satışı olmayan ve stokta bekleyen ürünler, stok değerleriyle birlikte.

Ölü stok için seçenekler:

1. **Fiyat güncellemesi:** İndirimin kârınıza etkisini önceden hesaplayın; [indirim sonrası kâr hesaplama aracı](/araclar/indirim-kar-hesaplama) bu iş için uygundur.
2. **Set ya da paket satış:** Yavaş dönen ürünü hızlı satan bir ürünle birlikte sunun.
3. **Başka kanal:** Bir pazaryerinde satmayan ürün, farklı müşteri kitlesine sahip başka bir kanalda satabilir.
4. **Tedarikçiye iade ya da takas:** Anlaşmanız izin veriyorsa değerlendirin.
5. **Tasfiye:** Maliyetin altında da olsa nakde çevirmek, ürünü yıllarca depoda tutmaktan çoğu zaman daha iyidir.

Ölü stok oluşmasını önlemenin en iyi yolu, yeni ürünleri küçük partilerle denemek ve ilk satış verisi geldikten sonra büyük sipariş vermektir.

## Stok yönetimi için aylık rutin

- Ürün bazında satış ve net kâr verisiyle ABC analizini güncelleyin.
- A grubu ürünlerin kritik stok seviyelerini gözden geçirin.
- Stok devir hızını ve stokta kalma süresini ürün grubu bazında hesaplayın.
- Önümüzdeki iki ayın sezon ve kampanya etkisini tahminlere ekleyin.
- 90 gündür satmayan ürünler için karar verin.
- Sayım farklarını ve nedenlerini kontrol edin.

## Hastürk CRM ile stok verisini karara dönüştürün

Formüller ancak doğru veriyle işe yarar. Hastürk CRM'de tüm kanallarınızın satışları ve stoğu tek panelde toplandığı için bu hesaplar için gereken veri elinizin altındadır:

- **Tükenme tahmini:** [Stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) bölümünde satış hızına göre stokun kaç gün yeteceği hesaplanır; yakında bitecek ürünler için uyarı alırsınız.
- **En çok satanlar ve kanal dağılımı:** [Raporlar](/ozellikler/raporlar) bölümünde seçtiğiniz dönemde adet ve ciroya göre en çok satan ürünleri görür, ABC analizinizin temelini çıkarırsınız.
- **Ürün bazında kâr:** [Gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümünde her ürünün net kârı ve zarar eden ürünler için uyarı yer alır; analizi ciroya değil kâra göre yapabilirsiniz.
- **Toplu güncelleme:** Profesyonel ve Kurumsal pakette stok, fiyat ve maliyeti Excel ile toplu güncelleyebilirsiniz.
- **Kanallar arası stok:** Bir kanalda satılan ürünün stoğu diğer kanallarda da düşer; hesapladığınız stok seviyeleri her kanalda aynı gerçeği yansıtır.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### ABC analizi nedir?

Ürünleri satışa ya da kâra katkılarına göre üç gruba ayıran bir stok önceliklendirme yöntemidir. Yaygın kullanımda satışın yaklaşık %80'ini oluşturan ürünler A, sonraki %15'i oluşturanlar B, kalan %5'i oluşturanlar C grubuna girer. A grubu en sık kontrol edilen ve tükenmesine izin verilmeyen gruptur.

### Stok devir hızı nasıl hesaplanır?

Satılan malın maliyeti ortalama stok değerine bölünür; ortalama stok, dönem başı ve dönem sonu stoğun ortalamasıdır. Örneğin 600.000 TL'lik satılan mal maliyeti ve 120.000 TL ortalama stokla devir hızı 5'tir; 365 ÷ 5 = 73 gün ürünlerin ortalama rafta kalma süresidir.

### Kritik stok seviyesi nasıl belirlenir?

Günlük ortalama satış tedarik süresiyle çarpılır ve güvenlik stoğu eklenir. Günde 8 adet satan, 9 günde gelen ve 15 adet güvenlik stoğu tutulan bir üründe kritik stok 8 × 9 + 15 = 87 adettir.

### Güvenlik stoğu ne kadar olmalı?

Satışlarınızın ne kadar dalgalandığına, tedarik süresine ve hedeflediğiniz hizmet düzeyine bağlıdır. İstatistiksel yöntemde Z katsayısı × günlük satışın standart sapması × tedarik süresinin karekökü kullanılır. A grubu ürünlerde yüksek, C grubunda düşük tutmak sermayeyi verimli kullanmanızı sağlar.

### Ekonomik sipariş miktarı her zaman uygulanmalı mı?

Hayır. EOQ, sabit talep ve sabit maliyet varsayımlarıyla çalışır. Tedarikçinin asgari sipariş adedi, miktar indirimleri ve sezonluk talep sonucu değiştirir. Başlangıç noktası olarak kullanıp kendi koşullarınıza göre yuvarlayın.

### Ölü stok ne zaman tasfiye edilmeli?

Kesin bir süre yoktur; birçok işletme 90 ya da 180 gün satılmayan ürünleri ölü stok sayar. Fiyat güncellemesi, set satış ve başka kanal denemeleri sonuç vermediyse, ürünü depoda tutmanın maliyetini hesaba katarak tasfiye etmek genellikle daha kârlıdır.
`,
  },
  {
    slug: "excel-ile-toplu-fiyat-stok-guncelleme",
    title: "Excel ile Toplu Ürün, Fiyat ve Stok Güncelleme Rehberi: Pazaryeri Şablonları ve Formüller",
    seo_title: "Excel ile Toplu Fiyat ve Stok Güncelleme Rehberi",
    seo_desc: "Pazaryerinde Excel ile toplu fiyat ve stok güncelleme: şablonlar, güvenli 6 adım, işe yarayan formüller ve en sık 8 hata. Hatasız güncelleyin, okuyun.",
    summary: "Excel ile toplu güncelleme hızlıdır ama yanlış yapılırsa yüzlerce ilanı bozar. Pazaryeri şablonlarının işleyişini, güvenli güncellemenin 6 adımını, zam, yuvarlama ve maliyet çekme formüllerini ve barkod, ondalık ayırıcı gibi en sık hataları anlatıyoruz.",
    tags: ["Excel","Toplu Güncelleme","Fiyat","Stok"],
    cover: "excel-toplu-guncelleme-kapak.jpg",
    body: `Yüzlerce ürünün fiyatını ya da stoğunu tek tek güncellemek hem saatler alır hem de hataya açıktır. Tedarikçiniz zam yaptığında, kampanya öncesi fiyatları ayarlarken ya da depo sayımından sonra stokları düzeltirken en pratik araç çoğu zaman Excel'dir. Pazaryerlerinin satıcı panelleri ve entegrasyon yazılımları da bu yüzden Excel ile toplu işlem imkânı sunar.

Ancak Excel ile toplu güncelleme, yanlış yapıldığında tek tıkla yüzlerce ürünü bozabilir: barkodların bozulması, virgül ile noktanın karışması ya da yanlış satırın eşleşmesi, fiyatı yanlış ya da stoğu sıfır olan ilanlar demektir. Bu yazıda Excel ile toplu ürün, fiyat ve stok güncellemeyi güvenli şekilde yapmanın yolunu; pazaryeri şablonlarını, işinize yarayacak Excel formüllerini ve en sık yapılan hataları anlatıyoruz.

## Excel ile toplu güncelleme ne zaman mantıklı?

Excel, aynı kuralın çok sayıda ürüne uygulanacağı işlerde en hızlı yoldur:

- **Toplu fiyat güncellemesi:** Tedarikçi zammı, kur değişimi ya da kategori bazında fiyat ayarı.
- **Toplu stok güncellemesi:** Sayım sonrası düzeltme, yeni gelen sevkiyatın stoğa işlenmesi.
- **Maliyet (alış fiyatı) girişi:** Kâr hesabının doğru çıkması için tüm ürünlerin alış fiyatının bir kerede girilmesi.
- **Toplu ürün yükleme:** Pazaryerine çok sayıda yeni ürünün tek seferde yüklenmesi.

Buna karşılık, satışa bağlı olarak sürekli değişen bilgiler için Excel uygun değildir. Bir kanalda satılan ürünün stoğunun diğer kanallarda düşmesi gibi işler dakikalar içinde yapılmalıdır; bunu Excel'le yetiştirmek mümkün değildir. Bu konuyu [stok takibi ve fazla satış rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) ele aldık.

## Pazaryeri Excel şablonları nasıl çalışır?

Trendyol, Hepsiburada ve N11 gibi pazaryerlerinin satıcı panellerinde, genellikle ürün menüsünün altındaki toplu işlemler bölümünde Excel ile işlem yapılır. Menü adları ve şablonların içeriği zaman zaman değiştiği için her seferinde güncel şablonu panelden indirmeniz en güvenli yoldur. Genel işleyiş şöyledir:

1. **Şablonu indirin.** Fiyat ve stok güncellemesi için genellikle mevcut ürünlerinizin listelendiği bir dosya indirilir. Yeni ürün yüklemede ise şablon kategoriye göre değişir; her kategorinin zorunlu özellikleri farklı olduğundan farklı kategorilerdeki ürünler için ayrı şablon gerekir.
2. **Yalnız değişecek sütunları doldurun.** Ürünü tanımlayan sütunlara (barkod, stok kodu gibi) dokunmayın.
3. **Dosyayı yükleyin.** Panel dosyayı işler ve sonucunu bildirir.
4. **Hata raporunu okuyun.** Hatalı satırlar genellikle nedeniyle birlikte raporlanır. Raporu okumadan "yüklendi" diye geçmeyin; reddedilen satırlar güncellenmemiş demektir.

### Fiyat sütunları: liste fiyatı ve satış fiyatı

Pazaryeri şablonlarında çoğunlukla iki fiyat sütunu bulunur: ürün sayfasında üstü çizili görünen **liste fiyatı** ve müşterinin ödediği **satış fiyatı**. Liste fiyatı satış fiyatından düşük olamaz. Pazaryerlerinde tüketiciye gösterilen fiyatlar KDV dahildir; şablondaki fiyat alanının neyi beklediğini (KDV dahil mi, ayrıca KDV oranı sütunu var mı) şablonun açıklamasından kontrol edin.

### Her kanal için ayrı dosya

Her pazaryerinin şablonu, sütun adları ve kuralları farklıdır. Beş kanalda satıyorsanız aynı fiyat güncellemesini beş farklı dosyada, beş farklı panelde yapmanız gerekir. Kanal sayısı arttıkça bu iş, tek bir dosyadan tüm kanallara gönderim yapan bir entegrasyon paneline taşınmalıdır. Entegrasyonun mantığını [pazaryeri entegrasyonu rehberimizde](/blog/pazaryeri-entegrasyonu-nedir) anlattık.

![Excel ile toplu güncelleme adımları: dışa aktar, yedekle, düzenle, kontrol et, yükle, hata raporunu oku](https://hasturkcrm.com/img/blog/excel-guncelleme-adimlari.jpg "Excel ile güvenli toplu güncellemenin altı adımı")

## Güvenli toplu güncelleme için 6 adım

1. **Güncel listeyi dışa aktarın.** Elinizdeki eski bir dosyayla çalışmayın; aradan geçen sürede fiyat, stok ya da ürün listesi değişmiş olabilir.
2. **Yedek alın.** Dışa aktardığınız dosyanın değiştirilmemiş bir kopyasını saklayın. Bir şey ters giderse eski değerlere bu dosyayla dönebilirsiniz.
3. **Düzenlemeyi ayrı sütunda yapın.** Yeni fiyatı doğrudan eski fiyatın üzerine yazmak yerine yanına bir sütun açıp formülle hesaplayın. Kontrol ettikten sonra değerleri asıl sütuna "yalnızca değerler" olarak yapıştırın.
4. **Kontrol edin.** Eski ve yeni fiyat arasındaki farkı yüzde olarak hesaplayın ve sıralayın. Beklenmedik büyük artış ya da düşüş varsa formülde ya da veride hata vardır.
5. **Önce birkaç satırla deneyin.** İlk kez kullandığınız bir şablonda önce birkaç ürünlük bir dosya yükleyip sonucu kanalda kontrol edin.
6. **Sonuç raporunu okuyun.** Reddedilen satırları düzeltip yeniden yükleyin.

## İşinizi kolaylaştıracak Excel formülleri

Türkçe Excel'de işlev adları Türkçedir ve bağımsız değişkenler noktalı virgülle ayrılır. Aşağıdaki örneklerde C sütunu mevcut satış fiyatını, D sütunu alış fiyatını gösterir.

### Yüzdesel zam ya da indirim

- %8 zam: \`=C2*1,08\`
- %10 indirim: \`=C2*0,9\`
- İki ondalığa yuvarlama: \`=YUVARLA(C2*1,08;2)\`

Yüzde hesaplarında zam ve indirimin simetrik olmadığını unutmayın: %10 zam yapılmış bir fiyatı %10 indirim geri getirmez. Hızlı kontrol için [yüzde hesaplama aracını](/araclar/yuzde-hesaplama) kullanabilirsiniz.

### Psikolojik fiyat: ,90 ile bitirme

Yeni fiyatı bir üst tam sayıya yuvarlayıp 10 kuruş düşmek için: \`=TAVANA(C2*1,08;1)-0,1\`

Örneğin (varsayımsal) 452,30 TL'lik ürüne %8 zam 488,48 TL eder; formül sonucu **488,90 TL** olur.

### Tedarikçi listesinden maliyet çekme

Tedarikçinizin gönderdiği yeni fiyat listesini ayrı bir sayfaya yapıştırın ve ürünlerinizin alış fiyatını stok koduyla eşleştirerek çekin. A sütununda stok kodu, tedarikçi sayfasında A sütununda stok kodu, B sütununda fiyat varsa:

\`=DÜŞEYARA(A2;Tedarikci!A:B;2;YANLIŞ)\`

Excel'in yeni sürümlerinde aynı iş \`=ÇAPRAZARA(A2;Tedarikci!A:A;Tedarikci!B:B)\` ile de yapılabilir. Eşleşmeyen satırlarda hata değeri (#YOK) görünür; bu satırları ayrıca kontrol edin, boş bırakıp yüklemeyin.

### Kârı koruyan taban fiyat kontrolü

Toplu indirim yaparken bazı ürünlerin maliyetinin altına düşmesini önlemek için taban fiyat sütunu (E) hesaplayıp yeni fiyatla karşılaştırın:

\`=EĞER(C2*0,9<E2;E2;C2*0,9)\`

Taban fiyatın, yani komisyon, kargo ve diğer kesintilerden sonra zarar etmediğiniz en düşük fiyatın nasıl hesaplandığını [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) anlattık; tek tek ürünler için [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) da kullanabilirsiniz.

### Gereksiz boşlukları temizleme

Başka kaynaklardan kopyalanan stok kodlarının başında ya da sonunda boşluk kalabilir ve eşleşme başarısız olur. \`=KIRP(A2)\` baştaki ve sondaki boşlukları temizler.

## En sık yapılan 8 Excel hatası

| Hata | Ne olur? | Nasıl önlenir? |
| --- | --- | --- |
| Barkodun sayıya dönüşmesi | Uzun barkodlar bilimsel gösterime (ör. 8,69E+12) döner, baştaki sıfırlar silinir. | Barkod sütununu metin biçimine alın; CSV dosyalarını içe aktarma sihirbazıyla açıp sütunu "Metin" seçin. |
| Ondalık ayırıcı karışıklığı | 1.250,50 ile 1,250.50 farklı okunur; fiyat 1.000 kat değişebilir. | Şablonun beklediği biçimi kontrol edin, yüklemeden önce birkaç fiyatı gözle doğrulayın. |
| Formülün yüklenmesi | Dosyada değer yerine formül kalır, panel okuyamaz. | Sonuçları "yalnızca değerler" olarak yapıştırın. |
| Sıralamanın bozulması | Tek sütun sıralanır, fiyatlar başka ürünlere kayar. | Sıralamayı tüm tabloyu seçerek yapın; tanımlayıcı sütunla birlikte kontrol edin. |
| Eski dosyayla çalışmak | Arada değişen stok ve fiyatlar eski değerlerle ezilir. | Her güncellemede listeyi yeniden dışa aktarın. |
| Boş hücrenin sıfır sayılması | Bazı şablonlarda boş stok sıfır olarak işlenebilir. | Değişmeyecek satırları dosyadan çıkarın ya da şablon açıklamasını okuyun. |
| Liste fiyatının satış fiyatından düşük kalması | İndirimde yalnız satış fiyatı değişir, liste fiyatı unutulur ya da tersi olur. | İki sütunu birlikte kontrol edin. |
| Hata raporunu okumamak | Reddedilen satırlar güncellenmemiş kalır. | Her yüklemeden sonra sonucu kontrol edin. |

![Excel ile toplu güncellemede sık yapılan hatalar: barkodun bilimsel gösterime dönmesi, ondalık ayırıcı, formül, sıralama, eski dosya](https://hasturkcrm.com/img/blog/excel-sik-hatalar.jpg "Toplu güncellemede en çok zarar veren hatalar ve önlemleri")

### Stok güncellerken özel dikkat

Stok, satışla birlikte sürekli değişir. Excel dosyasını dışa aktardığınız an ile geri yüklediğiniz an arasında satış olduysa, dosyadaki stok artık gerçek stok değildir ve yükleme, satılmış ürünleri yeniden satışa açabilir. Bu yüzden:

- Stok dosyasını hazırlama ile yükleme arasındaki süreyi kısa tutun.
- Yalnız değişen ürünleri yükleyin; dokunmadığınız ürünleri dosyadan çıkarın.
- Birden fazla kanalda satıyorsanız stoğu her kanala ayrı dosyayla yüklemek yerine tek merkezden yönetin.

## Örnek: tedarikçi zammını fiyatlara yansıtmak

Tedarikçiniz bir marka grubunda %12 zam yaptı ve siz bu ürünlerde marjınızı korumak istiyorsunuz. Excel ile adım adım (tutarlar **varsayımsal**):

1. Güncel ürün listesini dışa aktarın ve yedeğini alın.
2. Marka sütununa filtre uygulayıp yalnız zamlı markanın ürünlerini bırakın; diğer satırları yeni bir dosyaya kopyalamayın.
3. Alış fiyatı sütununun yanına yeni alış fiyatını hesaplayın: \`=YUVARLA(D2*1,12;2)\`. 250 TL'lik alış fiyatı 280 TL olur.
4. Satış fiyatını da aynı oranda artırmak marjınızı korur mu? Komisyon fiyatla orantılı, kargo sabit olduğu için tam olarak aynı sonucu vermez. Birkaç örnek ürünü [satış fiyatı hesaplama aracıyla](/araclar/satis-fiyati-hesaplama) kontrol edip uygun artış oranını belirleyin.
5. Yeni satış fiyatını ,90 ile bitecek şekilde hesaplayın, eski ve yeni fiyatın yüzde farkını ayrı sütunda gösterin ve en büyük farkları gözle kontrol edin.
6. Yeni alış ve satış fiyatlarını "yalnızca değerler" olarak asıl sütunlara yapıştırın, yardımcı sütunları silin ve dosyayı yükleyin.

Bu akışta alış fiyatını da güncellemek önemlidir: satış fiyatını artırıp maliyeti eski bırakırsanız, kâr raporlarınız gerçekte olmayan bir kârı gösterir.

## Kanal fiyat farklarını Excel'de korumak

Komisyon oranları kanaldan kanala değiştiği için aynı ürünü farklı kanallarda farklı fiyatla satmak yaygındır. Toplu güncellemede bu farkın bozulmaması için ana fiyatı tek sütunda tutup kanal fiyatlarını formülle türetebilirsiniz. Örneğin ana fiyat C sütunundaysa ve bir kanalda %6 daha yüksek satıyorsanız o kanalın fiyat sütunu \`=TAVANA(C2*1,06;1)-0,1\` olur. Ana fiyatı değiştirdiğinizde tüm kanal fiyatları aynı kurala göre yeniden hesaplanır. Kanal farkının ne kadar olması gerektiğini kanalların komisyonlarını karşılaştırarak belirleyin; kesintilerin kâra etkisini [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) anlattık.

## Toplu ürün yüklemede dikkat edilecekler

Yeni ürünleri Excel ile yüklerken en çok zaman alan iş, kategoriye özel zorunlu özellikleri (renk, beden, materyal gibi) pazaryerinin kabul ettiği değerlerle doldurmaktır. Şablondaki açılır listelerden seçim yapın; serbest metin yazılan özellik alanları reddedilebilir. Görsel bağlantılarının herkese açık ve çalışır olduğundan, her varyantın benzersiz barkoda sahip olduğundan emin olun. Ürün yüklemesinin ardından ürünlerin onay sürecini ve reddedilen ürünlerin nedenini takip edin.

## Excel'den tek merkeze geçmek

Excel tek kanallı ve az ürünlü bir mağaza için yeterli olabilir. Ancak her kanal için ayrı şablon, ayrı dosya ve ayrı yükleme; kanal ve ürün sayısıyla birlikte katlanarak büyür. Bu noktada şu yapı daha güvenlidir:

1. Ürünler tek bir ana katalogda, her varyantı tek bir ürün kartı olarak tutulur.
2. Fiyat, stok ve maliyet güncellemesi bu katalogda, bir kez yapılır.
3. Değişiklikler bağlı tüm kanallara yazılımla gönderilir.
4. Satıştan kaynaklanan stok değişimi Excel'e değil, otomatik senkrona bırakılır.

## Hastürk CRM'de Excel ile toplu güncelleme

Hastürk CRM'de Excel, kanal kanal dosya hazırlamak yerine tek merkezden toplu güncelleme için kullanılır:

- **Excel ile toplu fiyat, stok ve maliyet:** [Ürün yönetimi](/ozellikler/urun-yonetimi) bölümünde fiyat, stok ve alış fiyatını Excel dosyasıyla toplu güncellersiniz. Bu özellik Profesyonel ve Kurumsal [paketlerde](/paketler) yer alır.
- **Kanallara gönderim:** Güncellenen stok, [stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) açık olan kanallara panel tarafından gönderilir; her kanal için ayrı şablon hazırlamanız gerekmez.
- **Satışa bağlı stok otomatik:** Bir kanalda satılan ürünün stoğu diğer kanallarda kendiliğinden düşer; Excel'i yalnız sayım düzeltmesi ve toplu değişiklikler için kullanırsınız.
- **Maliyet ile kâr:** Toplu girdiğiniz alış fiyatları kâr-zarar hesabında kullanılır; alış fiyatı eksik ürünler uyarıyla gösterilir.
- **Ürün yükleme:** Trendyol, Hepsiburada, N11 ve idefix'e ürünlerinizi Excel şablonu doldurmadan panelden gönderebilirsiniz; kategori eşleştirmesi bir kez yapılır.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Trendyol'da Excel ile toplu fiyat ve stok nasıl güncellenir?

Satıcı panelindeki toplu ürün işlemleri bölümünden güncel fiyat ve stok şablonunu indirir, yalnız değişecek sütunları doldurur ve dosyayı yeniden yüklersiniz. Yükleme sonrasında hata raporunu kontrol edip reddedilen satırları düzeltmeniz gerekir. Menü adları değişebildiği için güncel şablonu her seferinde panelden indirin.

### Excel'de barkodlar neden 8,69E+12 gibi görünüyor?

Excel uzun sayıları otomatik olarak bilimsel gösterime çevirir ve baştaki sıfırları siler. Barkod sütununu metin biçimine alın; CSV dosyasını açarken içe aktarma sihirbazında bu sütunun türünü "Metin" olarak seçin.

### Tüm ürünlere toplu zam nasıl yapılır?

Yeni bir sütunda mevcut fiyatı zam oranıyla çarpın (ör. %8 için \`=C2*1,08\`), isterseniz YUVARLA ya da TAVANA ile yuvarlayın, sonucu kontrol ettikten sonra "yalnızca değerler" olarak fiyat sütununa yapıştırın.

### Excel ile stok güncellemek güvenli mi?

Sayım düzeltmesi gibi tek seferlik işler için güvenlidir, ancak dosyayı hazırladığınız sürede satış olursa dosyadaki stok eskir. Dosyayı kısa sürede yükleyin ve yalnız değişen ürünleri dosyada bırakın. Satışa bağlı stok değişimi için otomatik senkron kullanın.

### Birden fazla pazaryerinin fiyatını tek Excel'le güncelleyebilir miyim?

Pazaryerlerinin kendi panellerinde her kanal için o kanalın şablonunu kullanmanız gerekir. Tek dosyayla tüm kanalları güncellemek için ürünleri tek katalogda tutan ve değişiklikleri kanallara gönderen bir entegrasyon paneli gerekir.

### Excel'de DÜŞEYARA #YOK hatası veriyorsa ne yapmalıyım?

Aranan stok kodu diğer listede bulunamamış demektir. Çoğunlukla kodların başında ya da sonunda boşluk vardır ya da biri metin, diğeri sayı biçimindedir. KIRP işleviyle boşlukları temizleyin ve iki sütunun biçimini eşitleyin.
`,
  },
  {
    slug: "doviz-kuru-ile-fiyatlandirma-ithal-urun",
    title: "Döviz Kuruyla Fiyatlandırma: İthal Ürünlerde Kur Farkı ve Otomatik Fiyat Güncelleme",
    seo_title: "Döviz Kuruyla Fiyatlandırma: İthal Üründe Kur Farkı",
    seo_desc: "İthal ürünlerde kur farkı kârınızı nasıl eritir? Dövize bağlı fiyat formülü, kur kaynağı, eşik ve yuvarlama, örnek hesap. Kârınızı koruyun, okuyun.",
    summary: "Dövizle aldığınız ürünü TL ile satarken kur yükselişi kârınızı sessizce eritir. Kur farkının etkisini örnekle gösteriyor, dövize bağlı satış fiyatı formülünü kuruyor; kur kaynağı, güncelleme sıklığı, eşik ve yuvarlama kararlarını anlatıyoruz.",
    tags: ["Döviz","Fiyatlandırma","İthal Ürün","Kâr Marjı"],
    cover: "doviz-kuru-fiyatlandirma-kapak.jpg",
    body: `İthal ürün satıyorsanız ya da tedarikçinize dövizle ödeme yapıyorsanız, maliyetiniz dolar veya euro ile, satış fiyatınız ise Türk lirası ile belirlenir. Kur yükseldiğinde maliyetiniz anında artar; fiyatınızı aynı hızla güncellemezseniz, çok satarken bile kârınız erir. Daha kötüsü, sattığınız ürünün parasıyla aynı ürünü yeniden alamaz hale gelebilirsiniz.

Bu yazıda döviz kuruyla fiyatlandırmanın mantığını anlatıyoruz: kur farkının kârınızı nasıl etkilediğini örnek hesapla gösteriyor, dövize bağlı satış fiyatı formülünü kuruyor, kur kaynağı, güncelleme sıklığı, eşik ve yuvarlama kararlarını ve pazaryerlerinde fiyat güncellerken dikkat edilmesi gerekenleri ele alıyoruz. Örneklerdeki tüm kurlar, oranlar ve tutarlar **varsayımsaldır**.

## Kur farkı kârınızı nasıl eritir?

Dövizle alınan bir ürünün TL maliyeti, kur değiştikçe değişir. Satış fiyatınızın içinde ise kurdan bağımsız kalemler de vardır: kargo, hizmet bedeli gibi sabit giderler. Bu yüzden kurdaki küçük bir artış, kârınızda çok daha büyük bir düşüşe yol açar.

### Örnek hesap

Bir ürünün birim maliyeti 25 USD (navlun ve diğer alım masrafları dahil, KDV hariç). Ürün %20 KDV'li. Pazaryeri komisyonu satış fiyatının %18'i (KDV dahil oran), kargo sipariş başına 90 TL (KDV dahil). Ürünü aldığınızda kur 40,00 TL ve fiyatınızı KDV hariç satış tutarının %15'i kadar kâr bırakacak şekilde 1.924,90 TL olarak belirlediniz.

| Kalem (KDV hariç) | Kur 40,00 TL | Kur 44,00 TL, fiyat aynı |
| --- | --- | --- |
| Satış (1.924,90 ÷ 1,20) | 1.604,08 TL | 1.604,08 TL |
| Komisyon (%18) | −288,73 TL | −288,73 TL |
| Kargo (90 ÷ 1,20) | −75,00 TL | −75,00 TL |
| Ürün maliyeti (25 USD × kur) | −1.000,00 TL | −1.100,00 TL |
| **Kâr** | **240,35 TL** | **140,35 TL** |
| Kâr marjı | %15,0 | %8,7 |

Kur %10 arttı, fiyat güncellenmedi: sipariş başına kâr %42 azaldı. Bu fiyatla kâr ancak kur yaklaşık 49,61 TL'ye çıktığında sıfırlanır; ama o noktaya gelmeden marjınız, reklam ve iade gibi diğer giderlerinizi karşılayamaz hale gelir.

![Kur farkı örnek hesabı: kur yüzde 10 artınca fiyat güncellenmezse sipariş başına kâr 240 TL'den 140 TL'ye düşer](https://hasturkcrm.com/img/blog/kur-farki-ornek-hesap.jpg "Kur yüzde 10 artarken fiyat sabit kalırsa kâr yüzde 42 azalır (varsayımsal örnek)")

### Asıl risk: yerine koyma maliyeti

Muhasebede ürünün maliyeti, onu aldığınız günkü tutardır. Ancak işletmenin devamı için önemli olan, sattığınız ürünün yerine yenisini **bugünkü kurla** kaça alacağınızdır. Eski kurla alınmış stoğu eski kura göre fiyatlamak, kâğıt üzerinde kâr gösterirken gerçekte sermayenizi küçültür: satıştan gelen para, aynı adet ürünü yeniden almaya yetmez. Bu yüzden ithal ürünlerde fiyatı, stoktaki ürünün alış kuruna değil, **bir sonraki alımda ödeyeceğiniz kura** göre belirlemek daha güvenlidir.

## Dövize bağlı satış fiyatı formülü

Satış fiyatını hedef kârdan geriye doğru hesaplamanın mantığını [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) ayrıntılı anlattık. Dövizli üründe tek fark, maliyetin kurla çarpılmasıdır:

**Satış fiyatı (KDV dahil) = (Döviz maliyeti × Kur × 1,2 + Kargo + Diğer sabit giderler) ÷ (1 − Komisyon oranı − Hedef marj)**

Formülde kargo ve diğer sabit giderler KDV dahil tutarlardır; komisyon oranı KDV dahil orandır; hedef marj kârınızın KDV hariç satış tutarına oranıdır. Ürününüzün KDV oranı %20 değilse 1,2 yerine kendi oranınızı kullanın.

Yukarıdaki örnekte kur 44,00 TL olduğunda:

1. Maliyet (KDV dahil): 25 × 44 × 1,2 = 1.320 TL
2. Sabit giderlerle toplam: 1.320 + 90 = 1.410 TL
3. Payda: 1 − 0,18 − 0,15 = 0,67
4. Fiyat: 1.410 ÷ 0,67 = 2.104,48 TL → yuvarlanmış fiyat **2.104,90 TL**

Bu fiyatla kâr yeniden yaklaşık 263 TL ve marj yeniden %15 olur. Kendi rakamlarınızla hesaplamak için [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) kullanabilirsiniz; döviz maliyetini o günkü kurla TL'ye çevirip girmeniz yeterlidir.

### Kâr payını dövize değil, fiyatın tamamına bağlayın

Sık yapılan bir hata, yalnız ürün maliyetini kurla güncelleyip üzerine sabit bir TL kâr eklemektir. Kur yükseldikçe ürün maliyeti büyür ama TL kârınız sabit kalır, yani marjınız düşer. Komisyon gibi orantılı kesintiler de fiyatla birlikte arttığından, fiyatı yukarıdaki gibi orana dayalı formülle hesaplamak marjınızı korur.

### Döviz fiyatlı ürünlerde tutulması gereken bilgiler

Kur ile fiyatlamanın sağlıklı çalışması için her dövizli ürünün kaydında şu bilgiler bulunmalıdır:

| Bilgi | Neden gerekli? |
| --- | --- |
| Para birimi (USD, EUR, GBP) | Hangi kurla çevrileceğini belirler |
| Döviz maliyeti (masraflar dahil) | Fiyat hesabının çıkış noktası |
| Hedef marj ya da kâr payı | Kur değiştiğinde marjın korunması için |
| Son kullanılan kur ve tarih | Bir sonraki güncellemenin eşik kontrolü için |
| Kanal fiyat farkları | Her kanal fiyatının aynı oranda güncellenmesi için |

## Hangi kuru kullanmalısınız?

Fiyatlamada kullanılabilecek iki temel kaynak vardır:

- **TCMB gösterge kurları:** Türkiye Cumhuriyet Merkez Bankası her iş günü döviz alış, döviz satış, efektif alış ve efektif satış kurlarını ilan eder. Günde bir kez değiştiği için fiyatlarınız gün içinde sabit kalır ve takip etmesi kolaydır.
- **Anlık piyasa kuru:** Gün içinde sürekli değişir. Kurun hızlı hareket ettiği dönemlerde maliyetinizi daha yakından izler, ancak fiyatlarınızın gün içinde sık değişmesine yol açabilir.

Hangi kuru seçerseniz seçin, tedarikçinize ödeme yaparken karşılaşacağınız kura yakın bir kur kullanın. Döviz satın alarak ödeme yapıyorsanız alış kuru yerine satış kurunu esas almak, maliyetinizi olduğundan düşük hesaplamanızı önler.

### Ödeme vadesi ve kur

Tedarikçinize ödemeyi malı aldıktan sonra vadeli yapıyorsanız, asıl maliyetiniz ödeme günündeki kurla belirlenir. Bu durumda bugünkü kurla fiyatlamak bile risk taşır. Birçok satıcı bu riske karşı fiyat hesabındaki kura küçük bir **kur payı** ekler (ör. kurun %2 üzerini esas almak). Payın büyüklüğü, ödeme vadenize ve kurun dönemsel hareketine göre sizin vereceğiniz bir karardır; fazla yüksek pay, rakiplerinize karşı fiyat rekabetinizi zayıflatır.

## Ne sıklıkla güncellemeli?

Fiyatı her kur hareketinde değiştirmek de, hiç değiştirmemek de sorun yaratır. Karar vermeniz gereken üç ayar vardır:

### 1. Güncelleme sıklığı

| Sıklık | Avantaj | Dezavantaj |
| --- | --- | --- |
| Anlık / gün içinde | Maliyet artışı fiyata hemen yansır | Fiyat çok sık değişir |
| Günlük | Dengeli; TCMB kuruyla uyumlu | Hızlı kur hareketlerinde bir gün gecikme |
| Haftalık / aylık | Fiyatlar sabit görünür | Kur sert yükselirse uzun süre düşük marj |
| Elle | Tam kontrol | Unutulması kolay; çok ürün ve çok kanalda zaman alır |

### 2. Eşik

Küçük dalgalanmalarda fiyatın değişmemesi için bir eşik belirleyin: örneğin kur son güncellemeden bu yana %0,5'ten fazla değişmedikçe fiyat aynı kalsın. Eşik, gereksiz fiyat değişikliğini önlerken büyük hareketlerin kaçmamasını sağlar.

### 3. Yuvarlama

Kurla hesaplanan fiyat 2.104,48 TL gibi küsuratlı çıkar. Fiyatları tam sayıya ya da ,90 veya ,99 ile bitecek şekilde yuvarlamak hem müşteriye daha düzgün görünür hem de küçük kur hareketlerinde fiyatın her seferinde birkaç kuruş oynamasını engeller.

![Döviz endeksli fiyat güncelleme akışı: kur kaynağı, eşik kontrolü, fiyat hesabı, yuvarlama ve kanallara gönderim](https://hasturkcrm.com/img/blog/doviz-fiyat-guncelleme-akisi.jpg "Kur değiştiğinde fiyatın hesaplanıp kanallara gönderilmesi")

## Kur düştüğünde ne olur?

Dövize endeksli fiyatlandırma iki yönlü çalışır: kur düştüğünde fiyatınız da düşer. Bu, rakiplerinizin fiyatlarına uyum sağlamanızı kolaylaştırır; ancak elinizde yüksek kurdan alınmış stok varsa, düşen kurla fiyatlamak o stokta marjınızı azaltır. Böyle dönemlerde kur düşüşünü fiyata kademeli yansıtmak ya da eşiği aşağı yönde daha geniş tutmak düşünülebilir. Kararı verirken yerine koyma maliyeti mantığını unutmayın: bir sonraki alımınız düşük kurdan olacaksa, rakipleriniz de büyük olasılıkla fiyatlarını düşürecektir.

## Pazaryerlerinde fiyat güncellerken dikkat edilecekler

- **Fiyat TL olarak listelenir.** Pazaryerlerinde müşteriye gösterilen fiyat Türk lirasıdır; döviz fiyatı yalnız sizin hesaplamanızdadır.
- **Kanal farklarını koruyun.** Komisyon oranları kanaldan kanala değiştiği için aynı ürünü farklı kanallarda farklı fiyatla satıyor olabilirsiniz. Kur güncellemesi bu farkı bozmamalı; her kanal fiyatı aynı oranda güncellenmelidir.
- **Kampanya ve indirimlere dikkat.** Bir kampanyaya katıldığınız ürünlerde fiyat değişikliği kampanya koşullarını etkileyebilir. Kampanyaya katılmadan önce kampanya fiyatının kur artışına karşı ne kadar dayanıklı olduğunu hesaplayın.
- **Buybox ve otomatik fiyat birlikte.** Buybox için fiyatı otomatik ayarlıyorsanız, alt fiyat sınırınızın da kurla birlikte güncellenmesi gerekir. Sabit TL ile tanımlanmış bir alt sınır, kur yükseldiğinde zararına satışa izin verebilir. Buybox mantığını [buybox rehberimizde](/blog/trendyol-buybox-nedir-nasil-kazanilir) anlattık.
- **Fiyat geçmişini kaydedin.** Hangi gün hangi kurla hangi fiyatın gönderildiğini bilmek, kâr analizinde ve müşteri sorularında işinize yarar.

## Kampanya fiyatınız kura ne kadar dayanır?

İndirim kampanyalarına genellikle birkaç gün ya da hafta önceden katılırsınız ve kampanya süresince fiyatınızı serbestçe değiştiremeyebilirsiniz. Dövizli üründe bu, kampanya boyunca kur riskini üstlenmek demektir. Kampanyaya girmeden önce şu soruyu cevaplayın: **bu indirimli fiyatla kur hangi seviyeye çıkarsa zarar etmeye başlarım?**

Örnekteki ürünü (25 USD maliyet, %18 komisyon, 90 TL kargo) kampanyada 1.799,90 TL'ye satacağınızı varsayalım:

- KDV hariç satış: 1.799,90 ÷ 1,20 = 1.499,92 TL
- Komisyon ve kargo sonrası kalan: 1.499,92 × 0,82 − 75 = 1.154,93 TL
- Zararın başladığı kur: 1.154,93 ÷ 25 ≈ **46,20 TL**

Kampanya sırasında kur 40,00 TL ise kampanya fiyatı kârlıdır; ancak kurun 46,20 TL'ye yaklaşması ihtimali varsa kampanya stok adedini sınırlamak ya da daha az indirimle katılmak daha güvenlidir.

## Kur riskini operasyonla azaltmak

Fiyat güncellemesinin yanında, kur riskini operasyonel kararlarla da azaltabilirsiniz:

- **Stok devir hızını artırın.** Ürün rafta ne kadar az beklerse, alış ve satış arasındaki kur farkı o kadar küçük olur. Dövizli ürünlerde fazla stok, kur riskini büyütür.
- **Sipariş sıklığını gözden geçirin.** Seyrek ve büyük alımlar yerine daha sık ve küçük alımlar, maliyetinizi güncel kura daha yakın tutar; nakliye maliyetiyle birlikte değerlendirin.
- **Tedarikçiyle para birimini konuşun.** Bazı tedarikçiler TL fiyat ya da belirli bir süre sabit kur verebilir; bu, fiyatlarınızı daha öngörülebilir kılar.
- **Ürün karmasını dengeleyin.** Tamamen dövize bağlı bir ürün gamı yerine yerli tedarikli ürünlerle denge kurmak, kur şoklarının toplam kârınıza etkisini azaltır.

## Döviz kuruyla fiyatlandırma kontrol listesi

- Dövizle alınan her ürünün döviz maliyeti (masraflar dahil) kayıtlı.
- Fiyat, yerine koyma maliyetine (bir sonraki alımın kuruna) göre hesaplanıyor.
- Kâr payı sabit TL değil, fiyata oranla belirleniyor.
- Kur kaynağı ve kullanılan kur türü (alış / satış) belli.
- Güncelleme sıklığı, eşik ve yuvarlama kuralı tanımlı.
- Buybox alt fiyat sınırları kurla birlikte güncelleniyor.
- Kanal fiyat farkları korunuyor.
- Kampanya fiyatlarının kur dayanıklılığı hesaplanıyor.

İthalatla ilgili vergi, gümrük ve muhasebe kayıtları için mali müşavirinize danışın; bu yazı fiyatlandırmanın operasyonel tarafına odaklanmaktadır.

## Hastürk CRM ile döviz kuruna endeksli otomatik fiyat

Hastürk CRM'in [döviz kuruna endeksli fiyat](/ozellikler/doviz-endeksli-fiyat) özelliği, yukarıdaki kuralları sizin yerinize uygular:

- **Dövizle fiyat:** Ürüne USD, EUR ya da GBP fiyatı girersiniz; TL fiyatı kurla hesaplanır, kâr payını ürün bazında eklersiniz.
- **Kanallara otomatik:** Yeni TL fiyatı Trendyol, Hepsiburada ve diğer kanallara kendiliğinden gider; kanallar arasındaki fiyat farkınız korunur.
- **Kur kaynağı:** Merkez Bankası (TCMB) günlük kuru ya da anlık piyasa kuru; döviz alış / satış, efektif alış / satış seçenekleri.
- **Güncelleme sıklığı ve eşik:** Anlık (yaklaşık 15 dakikada bir), günlük, haftalık, aylık ya da yalnız düğmeyle; kur belirlediğiniz eşikten fazla değişince.
- **Yuvarlama:** Fiyatlar kuruşuyla, tam sayıya ya da ,90 / ,99 ile bitecek şekilde yuvarlanır.
- **Kontrol sizde:** Her güncelleme işlem kayıtlarına yazılır; döviz fiyatlı ürünlerin TL fiyatı elle yanlışlıkla değiştirilemez.

Döviz kuruna endeksli otomatik fiyat Kurumsal [pakette](/paketler) yer alır. Fiyat değiştikten sonra her siparişin gerçek kârını [kâr-zarar](/ozellikler/kar-zarar) ekranında takip edebilirsiniz.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Döviz kuruna göre satış fiyatı nasıl hesaplanır?

Ürünün döviz maliyetini kurla çarpıp KDV'siyle birlikte kargo ve diğer sabit giderlere ekleyin; toplamı (1 − komisyon oranı − hedef marj) ile bölün. Böylece kur değiştiğinde fiyat, marjınızı koruyacak şekilde yeniden hesaplanır.

### Fiyatlamada hangi kur kullanılmalı?

Tedarikçinize ödeme yaparken karşılaşacağınız kura en yakın kuru kullanın. Döviz satın alarak ödüyorsanız satış kurunu esas almak daha güvenlidir. TCMB günlük kuru takip kolaylığı, anlık piyasa kuru ise hızlı kur hareketlerinde yakınlık sağlar.

### Kur her değiştiğinde fiyatı güncellemek gerekir mi?

Hayır. Küçük dalgalanmalar için bir eşik belirleyin (örneğin %0,5) ve fiyatı yalnız kur bu eşiğin üzerinde değiştiğinde güncelleyin. Güncelleme sıklığını da ürününüzün rekabet durumuna göre seçin.

### Kur düşünce fiyatımı düşürmeli miyim?

Dövize endeksli sistemde fiyat iki yönlü güncellenir. Elinizde yüksek kurdan alınmış stok varsa düşüşü kademeli yansıtmayı değerlendirebilirsiniz; ancak rakipleriniz de düşük kurdan aldıkları ürünleri daha ucuza satacağı için uzun süre yüksek fiyatta kalmak satış kaybettirebilir.

### Stoktaki ürünü alış kuruna göre mi, bugünkü kura göre mi fiyatlamalıyım?

İşletmenin sermayesini korumak için bugünkü (ya da bir sonraki alımda ödeyeceğiniz) kura göre fiyatlamak daha güvenlidir. Eski kurla fiyatlarsanız satıştan gelen para aynı ürünü yeniden almaya yetmeyebilir.

### Kur payı nedir, ne kadar olmalı?

Fiyat hesabında kullandığınız kura eklediğiniz küçük bir güvenlik payıdır; ödeme vadesi boyunca kurun yükselme riskine karşı tutulur. Oranı ödeme vadenize ve rekabet durumunuza göre siz belirlersiniz; yüksek pay, fiyat rekabetini zayıflatır.
`,
  },
  {
    slug: "pazaryeri-reklam-roas-acos-hesaplama",
    title: "Pazaryeri Reklamlarında ROAS ve ACoS Hesaplama: Reklam Bütçeniz Gerçekten Kârlı mı?",
    seo_title: "ROAS ve ACoS Hesaplama: Pazaryeri Reklamı Kârlı mı?",
    seo_desc: "ROAS ve ACoS nasıl hesaplanır? Başabaş ROAS, en yüksek tıklama maliyeti ve reklam bütçesini kâra göre yönetme, örnek hesaplarla. Rehberi hemen okuyun.",
    summary: "Reklam panelinde iyi görünen kampanya, kesintiler düşülünce zarar ediyor olabilir. ROAS ve ACoS hesaplamayı, ürününüz için başabaş ROAS ve hedef ROAS bulmayı, ödenebilecek en yüksek tıklama maliyetini ve reklam bütçesini kâra göre yönetmeyi anlatıyoruz.",
    tags: ["Reklam","ROAS","ACoS","Kâr Marjı"],
    cover: "pazaryeri-reklam-roas-kapak.jpg",
    body: `Pazaryeri reklamları satışları hızla artırabilir; ama reklam panelinde iyi görünen bir kampanya, komisyon, kargo ve ürün maliyeti düşüldüğünde zarar ediyor olabilir. "Reklama 5.000 TL verdim, 25.000 TL satış geldi" cümlesi tek başına hiçbir şey söylemez. Reklamın kârlı olup olmadığını anlamak için ROAS ve ACoS'u doğru hesaplamanız ve bunları ürününüzün kâr marjıyla karşılaştırmanız gerekir.

Bu yazıda ROAS ve ACoS'un ne olduğunu, nasıl hesaplandığını, ürününüz için başabaş ROAS'ı nasıl bulacağınızı, en fazla ne kadar tıklama başı maliyete katlanabileceğinizi ve reklam bütçesini kârlılığa göre nasıl yöneteceğinizi örnek hesaplarla anlatıyoruz. Örneklerdeki tüm tutarlar ve oranlar **varsayımsaldır**.

## Pazaryeri reklamları nasıl çalışır?

Büyük pazaryerlerinin çoğu satıcılara kendi platformları içinde reklam imkânı sunar. Trendyol'un satıcı panelinde ürün reklamları, Hepsiburada'da HepsiAd ve Amazon'da Sponsored Products bu tür reklamlara örnektir. Ürün reklamları genellikle arama sonuçlarında ve kategori listelerinde "reklam" ya da "sponsorlu" ibaresiyle gösterilir ve çoğunlukla **tıklama başına** ücretlendirilir: reklamınız gösterildiğinde değil, müşteri tıkladığında ödeme yaparsınız.

Reklam türleri, hedefleme seçenekleri, ücretlendirme modeli ve raporlarda kullanılan ölçüler pazaryerine göre farklıdır ve değişebilir. Kendi kanalınızın güncel koşullarını satıcı panelindeki reklam bölümünden ve yardım sayfalarından kontrol edin. Bu yazıdaki hesaplar ise tüm platformlarda aynı şekilde çalışır.

## Temel reklam ölçüleri

| Ölçü | Formül | Ne anlatır? |
| --- | --- | --- |
| Tıklama oranı (TO / CTR) | Tıklama ÷ Gösterim | Reklamınız ne kadar ilgi çekiyor? |
| Tıklama başı maliyet (TBM / CPC) | Reklam harcaması ÷ Tıklama | Bir ziyaretçiye ne ödüyorsunuz? |
| Dönüşüm oranı | Sipariş ÷ Tıklama | Ürün sayfanız ziyaretçiyi ikna ediyor mu? |
| Sipariş başı reklam maliyeti | Reklam harcaması ÷ Reklam kaynaklı sipariş | Bir satışa reklamla ne ödüyorsunuz? |
| ROAS | Reklam kaynaklı satış ÷ Reklam harcaması | Harcanan her 1 TL kaç TL satış getiriyor? |
| ACoS | Reklam harcaması ÷ Reklam kaynaklı satış × 100 | Satışın yüzde kaçı reklama gidiyor? |

## ROAS ve ACoS nedir?

**ROAS (Return on Ad Spend, reklam harcamasının getirisi)**, reklamdan elde edilen satışın reklam harcamasına oranıdır. 2.000 TL harcadığınız bir kampanya 10.000 TL satış getirdiyse ROAS = 10.000 ÷ 2.000 = **5**'tir (bazen 5x ya da %500 olarak yazılır).

**ACoS (Advertising Cost of Sales, satışın reklam maliyeti)**, reklam harcamasının reklam kaynaklı satışa oranıdır ve özellikle Amazon reklamlarında yaygın kullanılır. Aynı örnekte ACoS = 2.000 ÷ 10.000 × 100 = **%20**'dir.

İki ölçü aynı bilginin iki yüzüdür: **ACoS = 1 ÷ ROAS**. ROAS 5 ise ACoS %20, ROAS 4 ise ACoS %25'tir. ROAS'ta yüksek değer, ACoS'ta düşük değer iyidir.

![ROAS ve ACoS formülleri: reklam kaynaklı satış bölü reklam harcaması; ACoS bunun tersi; başabaş ROAS bir bölü reklam öncesi kâr marjı](https://hasturkcrm.com/img/blog/roas-acos-formulleri.jpg "ROAS, ACoS ve başabaş ROAS arasındaki ilişki")

### Aynı bazda karşılaştırın: KDV dahil mi, hariç mi?

ROAS hesabındaki en sık hata, satışı KDV dahil, harcamayı KDV hariç almaktır. Pazaryerinde müşterinin ödediği tutar KDV dahildir; reklam harcaması ise raporlarda çoğunlukla KDV hariç gösterilir ve faturası KDV eklenerek kesilir. %20 KDV'li bir üründe bu karışıklık ROAS'ı olduğundan %20 yüksek gösterir. Raporunuzun hangi bazda olduğunu kontrol edin ve kendi hesabınızda her iki tarafı da aynı bazda (bu yazıda olduğu gibi KDV hariç) kullanın.

### Atıf: hangi satış reklamdan sayılır?

Reklam raporundaki "reklam kaynaklı satış", müşterinin reklama tıkladıktan sonra belirli bir süre içinde yaptığı alışverişlerden oluşur. Bu süre (atıf penceresi) ve tıklanan ürün dışındaki alışverişlerin sayılıp sayılmadığı pazaryerine ve reklam türüne göre değişir. Pencere uzadıkça rapordaki satış artar; ama bu satışların bir kısmı reklam olmadan da gerçekleşecek olabilir. Farklı kanalların ROAS değerlerini karşılaştırırken atıf kurallarının aynı olmadığını unutmayın ve kararlarınızı toplam satış ve toplam kâr değişimiyle birlikte değerlendirin.

## Başabaş ROAS: reklamınız hangi noktada kâr ettirir?

ROAS'ın "iyi" olup olmadığı ürününüzün kâr marjına bağlıdır. Marjı yüksek bir ürün düşük ROAS'la bile kâr ettirebilir; marjı düşük bir ürün yüksek ROAS'la bile zarar ettirebilir. Bu yüzden önce her ürün için **reklam öncesi kâr marjını** hesaplamanız gerekir:

**Reklam öncesi kâr marjı = (Satış − Komisyon − Kargo − Diğer kesintiler − Ürün maliyeti) ÷ Satış** (tümü KDV hariç)

**Başabaş ACoS = Reklam öncesi kâr marjı**

**Başabaş ROAS = 1 ÷ Reklam öncesi kâr marjı**

### Örnek hesap

Ürün %20 KDV'li ve 600 TL'ye (KDV dahil) satılıyor. Komisyon satış fiyatının %18'i (KDV dahil oran), kargo 72 TL (KDV dahil), ürün maliyeti 230 TL (KDV hariç).

| Kalem (KDV hariç) | Tutar |
| --- | --- |
| Satış (600 ÷ 1,20) | 500 TL |
| Komisyon (%18) | −90 TL |
| Kargo (72 ÷ 1,20) | −60 TL |
| Ürün maliyeti | −230 TL |
| **Reklam öncesi kâr** | **120 TL** |
| Reklam öncesi kâr marjı | %24 |

- **Başabaş ACoS = %24.** Reklama satışın %24'ünden fazlasını harcarsanız her reklamlı satış zarar ettirir.
- **Başabaş ROAS = 1 ÷ 0,24 ≈ 4,17.** Harcanan her 1 TL reklam en az 4,17 TL (KDV hariç) satış getirmelidir.

Reklam raporunuz satışı KDV dahil, harcamayı KDV hariç gösteriyorsa, aynı başabaş noktası o raporda 600 ÷ 120 = **5** olarak görünür. Raporun bazını bilmeden "ROAS 4,5, iyi gidiyoruz" demek, aslında zarar eden bir kampanyayı sürdürmek anlamına gelebilir.

Komisyon ve kesintilerin ayrıntılı hesabını [Trendyol komisyon ve net kâr rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) anlattık; farklı pazaryerlerinin komisyonunu [pazaryeri komisyon hesaplama aracıyla](/araclar/pazaryeri-komisyon-hesaplama) karşılaştırabilirsiniz.

## Kampanya kârlı mı? Örnek değerlendirme

Aynı ürün için 30 günlük bir kampanyanın sonuçları:

- Reklam harcaması: 6.000 TL (KDV hariç)
- Reklam kaynaklı sipariş: 56 adet
- Reklam kaynaklı satış: 56 × 600 = 33.600 TL (KDV dahil) = 28.000 TL (KDV hariç)

Hesap:

- ROAS (KDV hariç) = 28.000 ÷ 6.000 ≈ **4,67**
- ACoS = 6.000 ÷ 28.000 ≈ **%21,4**
- Reklam öncesi kâr = 56 × 120 = 6.720 TL
- Reklam sonrası kâr = 6.720 − 6.000 = **720 TL**

Kampanya başabaş ROAS'ın (4,17) üzerinde olduğu için kâr ettiriyor; ancak sipariş başına reklam sonrası kâr yalnız yaklaşık 13 TL. İade oranı birkaç puan yükselirse ya da tıklama maliyeti biraz artarsa kampanya zarara döner.

![Başabaş ROAS örneği: reklam öncesi kâr 120 TL, başabaş ROAS 4,17, kampanya ROAS 4,67 ve reklam sonrası kâr](https://hasturkcrm.com/img/blog/basabas-roas-ornek.jpg "Örnek kampanya başabaş noktasının biraz üzerinde: kârlı ama kırılgan (varsayımsal)")

### Hedef ROAS'ı kâr hedefinden belirleyin

Başabaş noktası yalnız zarar etmemeyi gösterir. Reklamlı satışlarda da belirli bir kâr hedefliyorsanız:

**Hedef ACoS = Reklam öncesi kâr marjı − Hedef net kâr marjı**

Örnekte reklamlı satışlardan da %10 net kâr hedefliyorsanız hedef ACoS = %24 − %10 = **%14**, hedef ROAS = 1 ÷ 0,14 ≈ **7,14** olur. Kampanyanızın ROAS'ı 4,67 ile 7,14 arasında kaldıkça reklam kâr ettirir ama hedefinizin altında kalır.

## En fazla ne kadar tıklama başı maliyete katlanabilirsiniz?

Tıklama başına teklif verdiğiniz reklamlarda en önemli soru budur:

**Başabaş TBM = Sipariş başı reklam öncesi kâr × Dönüşüm oranı**

Örnekte sipariş başı kâr 120 TL. Ürün sayfanız 100 tıklamadan 2,5 sipariş alıyorsa (dönüşüm oranı %2,5):

Başabaş TBM = 120 × 0,025 = **3,00 TL** (KDV hariç)

Tıklama başına 3 TL'den fazla öderseniz reklamlı satış zarar ettirir. Bu formül iki önemli sonucu gösterir:

1. **Dönüşüm oranını artırmak, ödeyebileceğiniz tıklama maliyetini artırır.** Dönüşüm %2,5'ten %4'e çıkarsa başabaş TBM 4,80 TL olur. Daha iyi görseller, eksiksiz ürün bilgisi, olumlu yorumlar ve rekabetçi fiyat, reklam bütçesinden daha etkili olabilir.
2. **Buybox sizde değilse reklam boşa gidebilir.** Aynı ürünü birden fazla satıcının sattığı ilanlarda reklama tıklayan müşteri, buybox'taki satıcıdan satın alabilir. Reklama başlamadan önce buybox durumunuzu kontrol edin; konuyu [buybox rehberimizde](/blog/trendyol-buybox-nedir-nasil-kazanilir) anlattık.

## Reklam testine nasıl başlanır?

Yeni bir ürün için reklama başlarken bütçeyi sonuçsuz bir denemeye harcamamak için testin sınırlarını önceden belirleyin:

1. **Başabaş TBM'yi hesaplayın.** Örnekte 3,00 TL.
2. **Teklifinizi başabaşın altında başlatın.** İlk günlerde başabaş TBM'nin bir miktar altında teklif vermek, zarar riskini sınırlar.
3. **Yeterli veri toplayın.** Birkaç düzine tıklamayla karar vermek yanıltıcıdır; dönüşüm oranı %2,5 olan bir üründe 100 tıklama ortalama 2–3 sipariş getirir. Örnekte 200 tıklamalık bir test, başabaş TBM'yle en fazla 200 × 3 = **600 TL** bütçe demektir.
4. **Sonucu başabaşla karşılaştırın.** Test sonunda ROAS başabaşın üzerindeyse bütçeyi kademeli artırın; altındaysa önce ürün sayfasını ve fiyatı iyileştirip yeniden deneyin.
5. **Kazanan ürünleri ayırın.** İyi sonuç veren ürünleri ayrı kampanyaya almak, bütçenin zayıf ürünlere dağılmasını önler.

## Reklam bütçesi nasıl yönetilir?

### Ürün seçimi

Reklamı her ürüne değil, reklamı kaldırabilecek ürünlere verin:

- Reklam öncesi kâr marjı yeterli olan ürünler (başabaş ROAS'ı ulaşılabilir olanlar)
- Stoğu yeterli olan ürünler; stoğu bitmek üzere olan ürüne reklam vermek, kazandığınız trafiği boşa harcar
- Yorumu ve puanı iyi, dönüşüm oranı yüksek ürünler
- Buybox'ı sizde olan ilanlar

### Haftalık kontrol

1. Ürün bazında harcama, sipariş, ROAS ve ACoS'u çıkarın.
2. Her ürünün ROAS'ını kendi başabaş ROAS'ıyla karşılaştırın.
3. Başabaşın altında kalan ürünlerde teklifi düşürün, hedeflemeyi daraltın ya da reklamı durdurun.
4. Hedefin üzerinde kalan ürünlerde bütçeyi kademeli artırın ve sonucun korunup korunmadığını izleyin.
5. Tıklama alıp satış getirmeyen ürünlerin sayfasını inceleyin: fiyat, görsel, açıklama ya da teslim süresi sorun olabilir.

### İadeleri ve organik etkiyi hesaba katın

Reklam raporundaki satışlar, sonradan iade edilen siparişleri de içerebilir. İade oranı yüksek ürünlerde gerçek ROAS, rapordakinden düşüktür; iade oranınızla düzeltilmiş satışı kullanın. İade oranını düşürmenin yollarını [iade yönetimi rehberimizde](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) anlattık.

Öte yandan reklamla gelen satışlar ürünün satış geçmişini ve yorum sayısını artırarak organik satışlara da katkı yapabilir. Bu etkiyi görmek için toplam reklam harcamasını **toplam** satışa (organik dahil) bölen bir ölçü de izlenir; bu oran e-ticarette TACoS (toplam ACoS) olarak bilinir. Reklam harcaması artarken toplam satışınız da artıyorsa ve TACoS düşüyorsa, reklam organik büyümeyi de destekliyor olabilir.

### Kampanya dönemleri

İndirim dönemlerinde fiyatınızı düşürdüğünüzde reklam öncesi kâr marjınız da düşer ve başabaş ROAS yükselir. Normal dönemde kârlı olan bir kampanya, indirimli fiyatla zarar ettirebilir. Kampanyaya girmeden önce indirimli fiyattaki marjı ve yeni başabaş ROAS'ı hesaplayın.

## Reklam kârlılığı kontrol listesi

- Her ürünün reklam öncesi kâr marjı ve başabaş ROAS'ı hesaplanmış.
- Reklam raporundaki satış ve harcamanın bazı (KDV dahil / hariç) biliniyor.
- Başabaş TBM, dönüşüm oranıyla birlikte hesaplanmış.
- Reklam yalnız stoğu yeterli, buybox'ı sizde ve dönüşümü iyi ürünlere veriliyor.
- ROAS haftalık, ürün bazında başabaşla karşılaştırılıyor.
- İade oranı reklam satışlarından düşülüyor.
- İndirim dönemlerinde başabaş ROAS yeniden hesaplanıyor.
- Reklam giderleri net kâr hesabına işleniyor.

## Hastürk CRM ile reklam gideri dahil net kâr

Reklamın kârlılığını reklam paneli değil, kâr-zarar tablonuz gösterir. Hastürk CRM'in [gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümünde satıştan net kâra her basamak açıktır: ciro, komisyon, kargo, hizmet bedeli, stopaj, **reklam ve ceza**, iade kaybı ve işletme giderleri.

- **Kesilen faturalar:** Pazaryerinin kestiği komisyon, kargo, reklam ve ceza faturaları kendiliğinden çekilir; reklam gideriniz tahmini değil, faturadaki tutardır.
- **Ürün ve kanal bazında kâr:** Her ürünün ve her kanalın net kârı görünür, zarar eden ürünler için uyarı alırsınız.
- **Satış analizi:** [Raporlar](/ozellikler/raporlar) bölümünde dönemleri karşılaştırır, reklam döneminde satışların nasıl değiştiğini görürsünüz.

Paneli kayıt olmadan [canlı demoda](/demo) inceleyebilir, kendi mağazanızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### ROAS nasıl hesaplanır?

Reklam kaynaklı satış tutarı, reklam harcamasına bölünür. 3.000 TL harcamayla 15.000 TL satış elde ettiyseniz ROAS 5'tir. Satış ve harcamayı aynı bazda (ikisi de KDV hariç ya da ikisi de KDV dahil) kullanmaya dikkat edin.

### ACoS nedir, ROAS'tan farkı ne?

ACoS, reklam harcamasının reklam kaynaklı satışa oranıdır ve yüzde olarak ifade edilir. ROAS'ın tersidir: ROAS 5 ise ACoS %20'dir. ROAS'ta yüksek değer, ACoS'ta düşük değer daha iyidir.

### İyi bir ROAS kaç olmalı?

Herkes için geçerli bir rakam yoktur. İyi ROAS, ürününüzün başabaş ROAS'ının üzerinde olandır. Başabaş ROAS, 1'in reklam öncesi kâr marjına bölünmesiyle bulunur: marjı %24 olan bir ürün için yaklaşık 4,17, marjı %40 olan bir ürün için 2,5'tir.

### Başabaş ACoS nasıl bulunur?

Başabaş ACoS, ürünün reklam öncesi kâr marjına eşittir. Satıştan komisyon, kargo, diğer kesintiler ve ürün maliyeti düşüldükten sonra kalan kâr, satışın yüzde kaçıysa reklama en fazla o kadar harcayabilirsiniz.

### Tıklama başına en fazla ne kadar ödemeliyim?

Sipariş başına reklam öncesi kârınızı dönüşüm oranınızla çarpın. Sipariş başı 120 TL kâr ve %2,5 dönüşüm oranıyla başabaş tıklama maliyeti 3 TL'dir; bunun üzerinde ödenen her tıklama zarar ettirir.

### Reklam vermeden önce nelere dikkat etmeliyim?

Ürünün kâr marjının reklamı kaldırıp kaldırmadığını hesaplayın, stoğun yeterli ve buybox'ın sizde olduğundan emin olun, ürün sayfasının görsel, açıklama ve yorumlar açısından dönüşüme hazır olduğunu kontrol edin.
`,
  },
  {
    slug: "yurt-disi-pazaryeri-satis-etsy-ebay-amazon",
    title: "Yurt Dışı Pazaryerlerinde Satış: Etsy, eBay ve Amazon ile Başlangıç Rehberi",
    seo_title: "Yurt Dışına Satış: Etsy, eBay ve Amazon Başlangıç Rehberi",
    seo_desc: "Türkiye'den Etsy, eBay ve Amazon'da satış: pazaryeri seçimi, hesap, ücretler, ilan, döviz ile fiyat, kargo ve stok yönetimi. Başlangıç rehberini okuyun.",
    summary: "Etsy, eBay ve Amazon ile yurt dışına satışa başlamanın operasyon tarafı: doğru pazaryerini seçmek, hesap açmak, ücretleri hesaplamak, ilan hazırlamak, döviz ile fiyatlamak, kargo ve teslim sürelerini yönetmek, stok ve siparişleri yurt içi kanallarla birlikte yürütmek.",
    tags: ["Yurt Dışı Satış","Etsy","eBay","Amazon"],
    cover: "yurt-disi-pazaryeri-satis-kapak.jpg",
    body: `Türkiye'deki pazaryerlerinde rekabet arttıkça birçok satıcı aynı ürünü yurt dışındaki müşterilere de satmayı düşünüyor. Etsy, eBay ve Amazon gibi küresel pazaryerleri, kendi sitenizi kurup yurt dışında tanınırlık kazanmaya uğraşmadan milyonlarca alıcıya ulaşmanın en kısa yoludur. Döviz cinsinden satış, kur yükseldiğinde TL gelirinizi de artırır.

Ancak yurt dışı satış, Türkiye'deki pazaryeri satışından birkaç önemli noktada ayrılır: ilan dili ve alışkanlıklar farklıdır, kargo süreleri ve maliyetleri çok daha yüksektir, fiyat dövizle belirlenir ve siparişler farklı saat dilimlerinden gelir. Bu yazıda yurt dışı pazaryerlerinde satışa başlamanın operasyon tarafını anlatıyoruz: doğru pazaryerini seçmek, hesap açmak, ilan hazırlamak, döviz ile fiyatlamak, kargo ve teslim sürelerini yönetmek, stok ve siparişleri yurt içi kanallarınızla birlikte yürütmek.

## Hangi pazaryeri size uygun?

Üç büyük küresel pazaryerinin müşteri kitlesi ve satış mantığı birbirinden farklıdır:

| Pazaryeri | Öne çıkan ürünler | Satış modeli | Dikkat |
| --- | --- | --- | --- |
| Etsy | El yapımı ürünler, vintage ürünler, el işi ve hobi malzemeleri | Mağaza içinde sabit fiyatlı ilanlar | Ürünün Etsy'nin el yapımı / vintage / malzeme kurallarına uyması gerekir |
| eBay | Geniş kategori yelpazesi; yeni ve ikinci el ürünler | Sabit fiyat ya da açık artırma | Ülke sitelerine göre farklı alıcı kitlesi |
| Amazon | Markalı ve standart ürünler, yüksek hacimli kategoriler | Ürün kataloğu üzerinden satış; kendi gönderiminiz ya da Amazon lojistiği (FBA) | Her ülke pazaryeri için ayrı ilan; rekabet ve operasyon standartları yüksek |

Seçiminizi yaparken ürününüzün o pazaryerinde aranıp aranmadığına, rakiplerin fiyat aralığına ve ürünün kargo maliyetine (özellikle hacmine) bakın. Hafif ve küçük hacimli, kargo maliyetine göre değeri yüksek ve özgün ürünler yurt dışı satışta en rahat başlangıcı sağlar; ev tekstili, takı, deri ürünler ve el yapımı dekorasyon gibi gruplar bu ölçütlere çoğu zaman uyar.

## Hesap açma: hazırlamanız gerekenler

Her pazaryerinin başvuru adımları farklıdır ve zaman zaman değişir; ama genellikle şu bilgiler istenir:

- **İşletme ve kimlik bilgileri:** Şirket bilgileri, yetkili kişinin kimlik belgesi, adres doğrulaması.
- **Ödeme alacağınız hesap:** Satış gelirinin aktarılacağı banka hesabı ya da pazaryerinin desteklediği bir ödeme hizmeti.
- **Kredi kartı:** Pazaryeri ücretlerinin tahsil edilmesi için.
- **Telefon ve e-posta doğrulaması.**

Ödeme altyapısında ülkeye göre farklar vardır. Örneğin Etsy'nin yardım sayfalarına göre Türkiye'deki satıcılar Etsy Payments'a katılabilir; ancak PayPal Türkiye'de faaliyet göstermediği için Türkiye'deki satıcıların mağazasında PayPal seçeneği sunulmaz. Hesap açmadan önce seçtiğiniz pazaryerinin Türkiye'deki satıcılar için hangi ödeme yöntemlerini desteklediğini kontrol edin.

Amazon'da Türkiye'deki satıcılar için Amazon.com.tr ile başlamak ve ardından yurt dışı pazaryerlerine açılmak mümkündür. Amazon.com.tr'de hesap açma adımlarını [Amazon Türkiye satıcı rehberimizde](/blog/amazon-turkiye-satici-olma-rehberi) anlattık. Yurt dışı Amazon pazaryerlerinde ilanların her ülke pazaryeri için ayrıca oluşturulması gerektiğini ve ücretlerin ülkeye göre değiştiğini unutmayın.

## Ücretleri önceden hesaplayın

Yurt dışı pazaryerlerinin ücret yapısı Türkiye'deki komisyon modelinden farklı olabilir. Örneğin Etsy'nin ücret yapısında ilan başına bir listeleme ücreti (yazının hazırlandığı tarihte ilan başına 0,20 USD, ilan dört ay yayında kalır), alıcının ödediği toplam tutar (kargo dahil) üzerinden bir işlem ücreti (%6,5) ve ülkeye göre değişen ödeme işleme ücreti bulunur. Bazı ülkelerdeki satıcılara ek ücretler de uygulanabilir. eBay ve Amazon'da ise satış ücretleri kategoriye ve ülke pazaryerine göre değişir.

Ücretler sık güncellendiği için fiyatınızı belirlemeden önce seçtiğiniz pazaryerinin güncel ücret sayfasını mutlaka okuyun ve tüm kesintileri satış başına toplayın. Bunlara ek olarak, döviz gelirinizi Türk lirasına çevirirken ödeme hizmeti ya da bankanızın uyguladığı dönüşüm farkını da hesaba katın.

## İlan hazırlama: yurt dışı alıcı için yazın

Yurt dışında alıcı, ürünü sizin dilinizde değil kendi arama alışkanlıklarıyla arar. İyi bir ilan için:

1. **Başlıkta aranan kelimeleri kullanın.** Türkçe başlığı birebir çevirmek yerine, hedef ülkedeki alıcının yazacağı ifadeleri araştırın. Pazaryerinin arama kutusundaki önerileri ve rakip ilanların başlıklarını inceleyin.
2. **Ölçüleri hedef pazarın birimiyle verin.** ABD'li alıcı için inç ve libre, Avrupalı alıcı için santimetre ve kilogram. İki birimi birlikte yazmak güvenlidir.
3. **Fotoğrafları özenle hazırlayın.** Ürünü fiziksel olarak göremeyen ve iadenin zor olduğu yurt dışı alıcı için fotoğraflar en önemli satış aracıdır: beyaz zeminli ürün fotoğrafı, ölçek gösteren fotoğraf, detay ve kullanım fotoğrafları.
4. **Malzeme ve bakım bilgisini açık yazın.** Kumaş türü, malzeme, bakım talimatı ve ürünün el yapımı olup olmadığı alıcının sık sorduğu konulardır.
5. **Teslim süresini dürüstçe belirtin.** Hazırlık süresi ve tahmini teslimat süresi, alıcının beklentisini belirler.

## Döviz ile fiyatlandırma

Yurt dışı pazaryerlerinde fiyatınız dolar, euro ya da sterlin gibi bir para birimiyle belirlenir; maliyetleriniz ise büyük ölçüde Türk lirasıdır. Fiyat hesabında şu kalemleri toplayın:

- Ürün maliyeti (TL'den güncel kurla dövize çevrilmiş)
- Paketleme maliyeti
- Uluslararası kargo ücreti (müşteriden ayrıca almıyorsanız)
- Pazaryeri ücretleri (listeleme, işlem, ödeme işleme)
- Döviz dönüşüm farkı
- İade ve hasar payı
- Hedef kârınız

Örnek (tüm tutarlar ve oranlar **varsayımsal**): Ürün maliyetiniz paketleme dahil 600 TL ve kur 40 TL ise maliyet 15 USD'dir. Kargoyu fiyata dahil ediyorsunuz ve gönderi başına 12 USD tutuyor. Pazaryeri ücretleri ve dönüşüm farkı toplamda satış fiyatının %15'i, hedef kâr marjınız %20 olsun:

**Fiyat = (15 + 12) ÷ (1 − 0,15 − 0,20) = 27 ÷ 0,65 ≈ 41,54 USD**

Fiyatı 41,99 USD olarak belirleyebilirsiniz.

![Yurt dışı satış fiyatı hesabı örneği: ürün maliyeti 15 USD, kargo 12 USD, pazaryeri ücretleri ve dönüşüm farkı yüzde 15, hedef marj yüzde 20, fiyat 41,54 USD](https://hasturkcrm.com/img/blog/yurt-disi-fiyat-hesabi.jpg "Döviz ile satış fiyatı: sabit maliyetler bölü kesinti ve marjdan kalan pay (varsayımsal örnek)")
 Bu hesap, Türkiye'deki satış fiyatı hesabıyla aynı mantıktadır; ayrıntısını [satış fiyatı belirleme rehberimizde](/blog/pazaryeri-satis-fiyati-nasil-belirlenir) anlattık.

### Kur hareketlerinde fiyat

Dövizle satış yaparken kur ilişkisi Türkiye'deki ithal ürün satışının tersidir: kur yükseldiğinde döviz fiyatınız sabit kalsa bile TL geliriniz artar, kur düştüğünde azalır. Maliyetleriniz TL'de hızla artıyorsa, döviz fiyatınızı da düzenli aralıklarla gözden geçirin. Fiyatın kur ile birlikte otomatik hesaplanmasını [döviz kuruna endeksli fiyat](/ozellikler/doviz-endeksli-fiyat) sayfasında anlattığımız yöntemle kurabilirsiniz.

![Yurt dışı pazaryerinde satışa başlama adımları: pazaryeri seçimi, hesap, ücret hesabı, ilan, fiyat, kargo ve sipariş yönetimi](https://hasturkcrm.com/img/blog/yurt-disi-baslangic-adimlari.jpg "Yurt dışı pazaryerinde satışa başlamanın yedi adımı")

## Kargo ve teslim süreleri

Yurt dışı satışta müşteri memnuniyetini ve kârlılığı en çok kargo belirler.

### Kargo seçenekleri

Yurt dışı gönderilerde genellikle iki seçenek vardır: uluslararası hızlı kargo (express) firmaları ve posta yoluyla gönderim. Hızlı kargo daha pahalı ama daha hızlı ve takip edilebilirdir; posta daha ekonomik ama teslim süresi daha uzundur. Gönderi başına maliyeti, takip numarası verilip verilmediğini ve hedef ülkeye ortalama teslim süresini karşılaştırarak seçim yapın.

Uluslararası gönderilerde ücret çoğunlukla gerçek ağırlık ile **hacimsel ağırlıktan** büyük olana göre hesaplanır. Hacimsel ağırlığın nasıl hesaplandığını [desi rehberimizdeki](/blog/desi-nedir-nasil-hesaplanir) yurt dışı gönderiler bölümünde anlattık. Büyük ama hafif ürünlerde paket ölçüsünü küçültmek, yurt dışı kargoda Türkiye'dekinden çok daha büyük tasarruf sağlar.

### Teslim süresi ve takip numarası

- **Hazırlık süresini gerçekçi tanımlayın.** İlanda belirttiğiniz sürede kargoya vermek, yurt dışı pazaryerlerinde de mağaza performansınızı belirleyen ölçülerden biridir.
- **Takip numarasını zamanında bildirin.** Kargoya verdiğiniz siparişin takip numarasını pazaryerine eksiksiz girin. Alıcı paketini takip edebildiğinde "ürünüm nerede" sorusu ve buna bağlı anlaşmazlıklar azalır.
- **Teslim süresini doğru gösterin.** Kargo seçeneğinize göre tahmini teslim süresini ilanınızda ve kargo ayarlarınızda doğru tanımlayın.

### Gümrük ve vergi

Yurt dışı gönderilerde gümrük işlemleri, mikro ihracat (ETGB) gibi uygulamalar ve vergi tarafı ürününüze, gönderi değerine ve hedef ülkeye göre değişir. Bu konularda mali müşavirinize ve çalıştığınız kargo firmasına danışın; alıcının ülkesinde ödenebilecek vergi ve harçlar konusunda ilanınızda açık bilgi vermeniz anlaşmazlıkları azaltır.

## İadeler

Yurt dışından iade almak, gönderinin kendisi kadar maliyetli olabilir. Pazaryerinin iade kurallarını ve kendi mağaza politikanızı (iade kabul edip etmediğiniz, süre, iade kargosunu kimin ödediği) netleştirin ve ilanlarınızda açıkça belirtin. Düşük tutarlı ürünlerde ürünü geri getirmek yerine bedel iadesi yapmak bazen daha ekonomik olabilir; bu kararı ürün ve kargo maliyetinize göre verin. İade oranını düşürmenin en etkili yolu, Türkiye'de olduğu gibi, eksiksiz ürün bilgisi ve doğru fotoğraflardır.

## Stok ve siparişleri yurt içiyle birlikte yönetmek

Aynı ürünü hem Türkiye'deki pazaryerlerinde hem yurt dışında satıyorsanız iki operasyonel risk vardır:

1. **Fazla satış.** Etsy'deki son ürününüz gece satıldığında Trendyol'daki ilanınız hâlâ stokta görünüyorsa, sabah iptal etmek zorunda kalırsınız. Yurt dışı kanalların stoğu da yurt içi kanallarınızla aynı ürün kartından yönetilmelidir.
2. **Saat dilimi farkı.** ABD'den gelen siparişler Türkiye saatiyle gece ve sabaha karşı düşer. Sabah rutininizde önce bu siparişleri kontrol edin; kargo hazırlık sürelerini bu farkı hesaba katarak tanımlayın.

Siparişleri her pazaryerinin panelinden ayrı ayrı takip etmek yerine, yurt içi ve yurt dışı siparişleri tek listede görmek hem gecikmeyi hem de stok hatalarını azaltır.

## İlk 90 gün için yol haritası

Yurt dışı satışa tüm ürünlerinizle ve birden fazla pazaryerinde aynı anda başlamak, operasyonu gereksiz yere zorlar. Kademeli bir başlangıç daha güvenlidir:

1. **İlk ay:** Tek bir pazaryeri seçin, hesabınızı açın ve kargo maliyeti uygun 10–20 ürünle başlayın. Her ürün için tüm kesintileri içeren fiyat hesabını yapın.
2. **İkinci ay:** İlk siparişlerde hazırlık süresini, kargo teslim sürelerini ve müşteri sorularını izleyin. İlan başlıklarını ve fotoğrafları gelen sorulara göre iyileştirin.
3. **Üçüncü ay:** Satan ürünlerin varyantlarını ve benzer ürünleri ekleyin; satmayan ürünlerin fiyatını, başlığını ya da kargo seçeneğini gözden geçirin. Operasyon oturduysa ikinci bir pazaryerini değerlendirin.

Her aşamada sipariş başına gerçek kârı (pazaryeri ücretleri, kargo, dönüşüm farkı ve iadeler düşüldükten sonra) ölçmek, hangi ürün ve pazaryerine yatırım yapacağınızı gösterir.

## Yurt dışı satışa başlama kontrol listesi

- Ürününüz hedef pazaryerinin kurallarına ve alıcı kitlesine uygun.
- Hesap açma için işletme, kimlik ve ödeme bilgileri hazır; ödeme yöntemi Türkiye'den destekleniyor.
- Pazaryeri ücretleri, kargo ve döviz dönüşüm farkı satış başına hesaplanmış.
- İlan başlığı ve açıklaması hedef dilde, aranan ifadelerle yazılmış; ölçüler hedef birimde.
- Kargo firması seçilmiş, hacimsel ağırlık ve teslim süreleri hesaplanmış.
- Hazırlık süresi gerçekçi; takip numarası zamanında bildiriliyor.
- İade politikası belirlenmiş ve ilanda yazıyor.
- Gümrük ve vergi konuları mali müşavirle konuşulmuş.
- Stok, yurt içi kanallarla aynı ürün kartından yönetiliyor.

## Hastürk CRM ile yurt dışı ve yurt içi kanallar tek panelde

Hastürk CRM'de yurt dışı pazaryerleri, Türkiye'deki kanallarınızla aynı panelde yönetilir. Yurt dışı pazaryerleri (eBay, Etsy, Ozon ve yurt dışı Amazon) Kurumsal [pakette](/paketler) yer alır:

- **Siparişler tek listede:** [Etsy](/entegrasyonlar/etsy), [eBay](/entegrasyonlar/ebay) ve [Amazon](/entegrasyonlar/amazon) siparişleri diğer kanallarla aynı listeye gelir. eBay ve Ozon siparişleri TCMB kuruyla TL'ye çevrilerek listelenir.
- **Stok ve fiyat:** Stok ve fiyatlarınız ilanlarınıza gönderilir; yurt içinde satılan ürünün stoğu yurt dışı kanalda da düşer.
- **Kargo bildirimi:** Kargo firması ve takip numarası panelden pazaryerine bildirilir.
- **Döviz ile fiyat:** eBay ve Ozon'da döviz kuruna endeksli fiyatla birlikte kullanılabilir.
- **Amazon lojistiği:** Amazon'un kendi deposundan gönderdiği (FBA) siparişlerin durumu da izlenir.

Bu kanallarda yeni ilan pazaryerinin kendi panelinden açılır; aktif ilanlarınız ve varyantları panele gelip paneldeki ürünle eşleşir. Panelin nasıl çalıştığını [canlı demoda](/demo) görebilir, kendi mağazalarınızı bağlayarak [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Türkiye'den Etsy'de satış yapılabilir mi?

Evet. Etsy'nin yardım sayfalarına göre Türkiye'deki satıcılar Etsy Payments'a katılabilir; PayPal Türkiye'de faaliyet göstermediği için mağazanızda PayPal seçeneği olmaz. Ürünlerinizin Etsy'nin el yapımı, vintage ya da el işi malzemesi kurallarına uyması gerekir.

### Yurt dışı pazaryerlerinde satış için hangi ürünler uygundur?

Hafif ve küçük hacimli, kargo maliyetine göre değeri yüksek ve özgün ürünler en rahat başlangıcı sağlar; ev tekstili, takı, deri ürünler ve el yapımı dekorasyon bu ölçütlere çoğu zaman uyar. Seçmeden önce hedef pazaryerinde aranma durumunu ve rakip fiyatlarını inceleyin.

### Yurt dışı satışta kargo ücreti nasıl hesaplanır?

Uluslararası gönderilerde ücret genellikle gerçek ağırlık ile hacimsel ağırlıktan büyük olana göre, hedef ülkeye ve kargo seçeneğine bağlı olarak hesaplanır. Birkaç kargo firmasından en sık göndereceğiniz paket ölçüleri için fiyat alın ve fiyatınıza yansıtın.

### Etsy, eBay ve Amazon'un ücretleri ne kadar?

Ücretler pazaryerine, kategoriye ve satıcının ülkesine göre değişir ve sık güncellenir. Etsy'de ilan başına listeleme ücreti, kargo dahil toplam tutar üzerinden işlem ücreti ve ödeme işleme ücreti vardır; eBay ve Amazon'da satış ücretleri kategoriye göre değişir. Fiyat belirlemeden önce her pazaryerinin güncel ücret sayfasını kontrol edin.

### Yurt dışı satışta gümrük işlemlerini kim yapar?

Gümrük işlemleri ve izlenecek yöntem gönderinin değerine, ürüne ve kullandığınız kargo firmasına göre değişir. Bu konuda mali müşavirinize ve çalıştığınız kargo firmasına danışmanız gerekir.

### Yurt içi ve yurt dışı stoğu nasıl birlikte yönetirim?

Ürünü tek bir ürün kartında tutup tüm kanalların ilanlarını bu karta bağlayın; bir kanalda satış olduğunda yeni stok diğer kanallara gönderilsin. Böylece yurt dışında satılan son ürün Türkiye'deki ilanlarınızda da tükenmiş görünür ve fazla satış önlenir.
`,
  },
];
