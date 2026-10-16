// Entegrasyon sayfalarının metinleri: /entegrasyonlar/<slug>. data.mjs bu kayıtları INTEGRATIONS ve CARRIERS'a ekler; build.mjs
// sayfayı yalnız buradaki metinlerle çizer (şablon cümlesi yok). Her cümle o kanalın / firmanın panelde bugün çalışan bağlantısından
// (panel/src/channels/<tür>.js, panel/src/carriers/<firma>.js, panel/src/config.js) alınmıştır; geliştirme aşamasındakilerde planlanan kapsam yazılır.
// Kural: sayfalar birbirinin adı değiştirilmiş kopyası olmaz. Aynı cümle (sayfanın kendi adı çıkarıldığında) iki sayfada geçmez;
// test/seo.test.mjs ve scripts/similarity.mjs bunu denetler. Yeni sayfa eklerken başka sayfadan cümle kopyalamayın.
// Alanlar: title (≤60, " | Hastürk CRM" dahil), desc (110–160), lead, tiles [ikon, başlık, metin], setup [başlık, metin] (3 ya da 4 adım),
// notes [madde] (isteğe bağlı "Bilmeniz gerekenler"), faq [soru, cevap], cta [kalın başlık, metin] (sayfa sonu çağrı bandı).

export const CHANNEL_PAGES = {
  trendyol: {
    title: 'Trendyol Entegrasyonu: Buybox ve Hakediş | Hastürk CRM',
    desc: 'Trendyol paketlerini Picking ve Invoiced adımlarıyla işleyin, Trendyol Express ve Aras ortak barkodunu basın; buybox sırası ve cari ekstre panelde.',
    lead: 'Trendyol paketleri sipariş numarasına göre birleşerek panele gelir. İşleme aldığınızda Trendyol\'a “Picking”, fatura numarası girdiğinizde “Invoiced” bildirilir; ortak barkodlu etiket, buybox, soru-cevap, iade talepleri ve cari hesap ekstresi aynı ekranda durur.',
    tiles: [
      ['i-box', 'Paketler tek siparişte', 'Trendyol her paketi ayrı kayıt olarak verir; aynı sipariş numarasındaki paketler panelde birleşir. Bölünen paketin yerine açılan yeni paketler ürünü ve tutarı ikinci kez saydırmaz.'],
      ['i-tag', 'Trendyol Express ve Aras barkodu', 'Ortak barkodlu gönderide etiket Trendyol\'dan ZPL olarak alınır. Başka bir firma seçiliyse Trendyol\'un verdiği takip barkodu panelin kendi etiket tasarımına basılır.'],
      ['i-truck', 'Kargo firmasını değiştirme', 'Created, Picking ya da Invoiced durumundaki pakette firmayı panelden değiştirirsiniz ve Trendyol yeni takip numarasını verir. Aynı paket için bu işlem beş dakikada bir yapılabilir.'],
      ['i-sync', 'Toplu işlem sonucu', 'Stok ve fiyat Trendyol\'a toplu işlem olarak gider; birkaç dakika sonra satır satır sonucu okunur ve reddedilen ilan nedeniyle listelenir. Bir ürüne yazılabilecek stok üst sınırı 20.000 adettir.'],
      ['i-chart', 'Buybox sırası ve fiyatı', 'Her ilanın buybox sırası ile buybox sahibinin fiyatı okunur. Kural koyduğunuz ilanlarda fiyat, belirlediğiniz alt sınırın altına inmeden rakibe göre ayarlanır.'],
      ['i-receipt', 'Cari hesap ekstresi', 'Satış, iade, kupon ve hakediş kayıtları ile kargo, platform hizmet bedeli ve reklam kesinti faturaları ekstreden çekilir. Siparişin kargo gideri faturadaki gerçek tutardır.'],
    ],
    setup: [
      ['Entegrasyon Bilgileri sayfası', 'Trendyol satıcı panelinde Hesap Bilgilerim → Entegrasyon Bilgileri sayfasını açın; Satıcı ID, API Key ve API Secret burada yazar.'],
      ['Trendyol kartını doldurun', 'Hastürk CRM\'de Entegrasyonlar → Trendyol kartına üç değeri yapıştırıp bağlantıyı test edin. Test başarılı olunca paketler ve onaylı ürünler okunmaya başlar.'],
      ['Stok gönderimini açın', 'Onaylı ilanlarınız barkodla ürün kartlarınıza bağlanınca Trendyol için stok gönderimini açın; açılana kadar Trendyol stoğuna dokunulmaz.'],
    ],
    faq: [
      ['Eski Trendyol siparişlerimi aktarabilir miyim?', 'Trendyol\'un sipariş servisi en fazla son bir ayın siparişlerini, iki haftalık aralıklarla veriyor. Geçmiş aktarım bu sınır içinde dilim dilim yapılır; daha eski siparişler servisten alınamaz.'],
      ['Fatura numarasını Trendyol\'a nasıl iletirim?', 'Paketi hazırlarken fatura numarasını girerseniz paket “Invoiced” durumuna geçirilir. Ödeme onayı bekleyen (Awaiting) paketlerde stok dışında hiçbir işlem gönderilmez.'],
      ['Komisyon oranını ayrıca girmem gerekir mi?', 'Gerekmez. Sipariş satırındaki komisyon oranı Trendyol\'dan gelir ve resmî tablo gibi KDV dahil kabul edilir; kesintinin kesin tutarı cari hesap ekstresiyle karşılaştırılır.'],
      ['Reddettiğim iade talebine belge ekleyebilir miyim?', 'Evet. Aksiyon bekleyen iade kalemini gerekçe, açıklama ve ek dosyayla reddedersiniz. Trendyol ret gerekçelerini zaman zaman değiştirdiği için liste altı saatte bir yeniden okunur.'],
      ['Müşteri sorusuna verdiğim cevap ne zaman görünür?', 'Cevap 10 ile 2000 karakter arasında olmalıdır ve Trendyol\'un onayından sonra ürün sayfasında yayımlanır. Trendyol panelinden verilen cevaplar da panelde cevaplanmış görünür.'],
    ],
    cta: ['Trendyol mağazanızı bugün bağlayın', 'Picking bildiriminden hakediş kaydına kadar her adımı aynı panelde izleyin. Deneme süresi 7 gün, kurulum için ücret alınmaz.'],
  },

  hepsiburada: {
    title: 'Hepsiburada Entegrasyonu: Paketleme, Buybox | Hastürk CRM',
    desc: 'Hepsiburada açık satırlarını panelde paketleyin, HepsiJET ya da Aras ortak barkodunu alın; fiyat kilidi uyarısı, Satıcıya Sor ve muhasebe kayıtlarından hakediş.',
    lead: 'Hepsiburada\'da sipariş önce açık satır olarak gelir; paketi panelde oluşturduğunuz anda Hepsiburada ayrı bir kargo barkodu verir. Satıcıya Sor soruları, iade talepleri, buybox sırası ve muhasebe servisindeki ödeme kayıtları da bu bağlantıyla okunur.',
    tiles: [
      ['i-box', 'Paketleme panelden', 'Açık satırları gruplayıp paketlersiniz; her grup Hepsiburada\'da kendi barkoduyla ayrı paket olur. Yanlış kurulan paketi bozduğunuzda satırlar yeniden “paketlenecek” durumuna döner.'],
      ['i-tag', 'Ortak barkod ve PDF', 'Barkod yalnız Hepsiburada\'nın ortak barkod verdiği firmalarda (ör. HepsiJET, Aras) gelir. Normal yazıcı için Hepsiburada\'nın PDF etiketi, termal yazıcı için ZPL istenir.'],
      ['i-truck', 'Firma değişince yeni etiket', 'Kargoya verilmemiş pakette seçilebilecek firmalar listelenir; firma değiştiğinde etiket aynı servisten yeniden alınır.'],
      ['i-shield', 'Fiyat kilidi uyarısı', 'Gönderdiğiniz fiyat kategori eşiğinin dışında kalırsa Hepsiburada ilanı kilitler. İşlem “Done” görünse bile panel bu satırı başarısız sayar ve sizi uyarır.'],
      ['i-chat', 'Satıcıya Sor', 'Yazışma tarih sırasıyla okunur: son mesaj sizdense soru cevaplanmış sayılır, müşteri yeniden yazdıysa ek soru olarak bekler. Cevap en fazla 2000 karakterdir.'],
      ['i-calc', 'Satış ve komisyon ayrı kayıt', 'Muhasebe servisinde satış ve komisyon iki ayrı kayıttır; komisyon kaydı geç gelirse mutabakat ekranında “bekleniyor” olarak işaretlenir.'],
    ],
    setup: [
      ['Merchant Portal bilgileri', 'Hepsiburada Merchant Portal → Ayarlar → Entegrasyon ekranında Merchant ID, servis anahtarı ve tanımlı entegratör adınız bulunur.'],
      ['Entegratör adı birebir', 'Panele girdiğiniz entegratör adı Merchant Portal\'daki adla harfi harfine aynı olmalıdır; farklıysa Hepsiburada istekleri yetki hatasıyla geri çevirir.'],
      ['Mağaza adı ve test', 'Buybox sıranızın bulunabilmesi için mağaza adınızı da yazın, ardından bağlantı testini çalıştırın.'],
    ],
    faq: [
      ['Buybox için neden mağaza adım isteniyor?', 'Hepsiburada buybox listesinde satıcıları mağaza adıyla verir; panel sizin sıranızı bu adla bulur. İlanın tek satıcısı sizseniz sıranız 1 kabul edilir.'],
      ['Komisyon tutarı neden Hepsiburada panelindekinden farklı görünüyor?', 'Hepsiburada satırda komisyonu tek adet için ve KDV hariç bildirir; kendi panelinde ise satırın tamamını KDV dahil gösterir. Panel kesilecek tutarı, yani satır toplamını KDV dahil tutar.'],
      ['İade talebini hangi gerekçeyle reddedebilirim?', 'Ret gerekçeleri Hepsiburada Talep Entegrasyonu dokümanındaki listedir; iade / değişim ile eksik ürün / eksik parça talepleri için ayrı gerekçeler sunulur. Her talep tek bir ürün satırıdır.'],
      ['Ürün gönderdikten sonra durumunu nereden izlerim?', 'Hepsiburada her ürün için WAITING, PRE_MATCHED, MATCHED, MISSING_INFO ya da REJECTED durumu döner. Eksik bilgi ve ret nedenleri ürünün yanında gösterilir.'],
    ],
    cta: ['Hepsiburada paketlerinizi panelden hazırlayın', 'Barkod, buybox ve muhasebe kayıtları tek yerde; ilk hafta ücretsiz, kurulum bedeli yok.'],
  },

  n11: {
    title: 'N11 Entegrasyonu: Onay, Soru-Cevap ve İade | Hastürk CRM',
    desc: 'N11 siparişlerini Picking ile onaylayın, fiyat-stok görevlerini SKU bazında izleyin, ürünü kategori özellikleriyle yükleyin; sorular ve iadeler panelde.',
    lead: 'N11\'in REST servisinden paket düzeyinde gelen siparişleri sipariş numarasıyla birleştirip onaylarsınız. Fiyat ve stok N11\'e görev olarak gider, sonucu SKU SKU izlenir; ürün soruları ve iade talepleri de panelden yanıtlanır.',
    tiles: [
      ['i-cart', 'Onay: Picking', 'Yeni (Created) satırlar panelden “Picking” yapılır; N11 sonucu satır satır döner, onaylanamayan satır uyarıyla gösterilir.'],
      ['i-truck', 'Anlaşmalı kargo kendiliğinden', 'N11 servisinde kargoya verme ve etiket işlemi yoktur: paket kargo firmasında okutulunca N11\'de durum kendiliğinden “Shipped” olur, panel de bunu okur.'],
      ['i-sync', 'Görev bazlı fiyat-stok', 'Fiyat ve stok en fazla 1000 SKU\'luk görevlerle kuyruğa alınır; başarısız olan SKU nedeniyle işaretlenir. Fiyatta en çok iki ondalık hane kullanılır, liste fiyatı satış fiyatının altında olamaz.'],
      ['i-up', 'Marka da bir özellik', 'Ürün yüklerken marka ayrıca sorulmaz: N11\'de marka kategorinin “Marka” özelliğidir ve ürün kartınızdaki markadan doldurulur.'],
      ['i-chat', 'Soru-cevap', 'N11 soru listesi dakikada bir okunabildiği için sorular her senkronda tek sayfada toplanır; N11 panelinden cevapladığınız soru da “bekliyor” durumunda kalmaz.'],
      ['i-orders', 'İade kararları', 'Değerlendirmesi ertelenmiş talepler dahil karar bekleyen iadeler listelenir; ret gerekçesi N11\'in gerekçe listesinden seçilir.'],
    ],
    setup: [
      ['API hesabı açın', 'Satıcı Ofisi (so.n11.com) → Hesabım → API Hesapları → Yeni Hesap Oluştur adımlarını izleyin.'],
      ['Anahtarlar e-postada', 'N11 App Key ve App Secret değerlerini hesabınıza kayıtlı e-postaya gönderir; ikisini N11 kartına girin.'],
      ['Bağlantıyı onaylayın', 'Test geçene kadar kanal yalnız Entegrasyonlar listesinde görünür; onaydan sonra siparişler 15 günlük aralıklarla okunmaya başlar.'],
    ],
    faq: [
      ['N11 için hakediş ve kesinti faturası gelir mi?', 'Gelmez; N11\'in API\'sinde finans servisi yoktur. Kâr hesabı için N11 komisyon oranınızı panelde bir kez tanımlamanız yeterlidir.'],
      ['İadeyi reddederken belge yükleyebilir miyim?', 'N11 iade servisi dosya kabul etmez; yalnız görsel adresi iletilebilir. Gerekçe ve açıklama ret isteğiyle birlikte gönderilir.'],
      ['Cevap uzunluğunda sınır var mı?', 'N11 soru cevabı 2048 karakteri geçemez. Panel bu sınırı yazarken gösterir.'],
      ['Konuma özel teslimat paketleri nasıl görünür?', 'Paket numarası olmayan bu gönderilerde kargo satıcıdadır; sipariş panelde görünür ancak kanal paketi olarak tutulmaz.'],
    ],
    cta: ['N11 onaylarını beklemeden verin', 'Sorular, iadeler ve fiyat-stok görevleri aynı ekranda. 7 günlük deneme kartsız başlar.'],
  },

  ikas: {
    title: 'ikas Entegrasyonu: ikas Kargo ve Ana Katalog | Hastürk CRM',
    desc: 'ikas sitenizin siparişlerini pazaryerleriyle birlikte yönetin: ikas Kargo etiketi, çok lokasyonlu stok, varyant ve kategorilerle ana katalog, birden çok site.',
    lead: 'ikas sitenizi GraphQL yönetim servisiyle bağlarsınız. Siparişler pazaryeri siparişlerinizin yanına gelir, ikas Kargo\'nun hazırladığı barkod ve etiket panelden yazdırılır; ikas\'taki ürün, kategori, görsel ve varyantlar pazaryerlerine yüklerken kaynak olur.',
    tiles: [
      ['i-truck', 'ikas Kargo uygulamasıyla', 'Gönderi ikas\'taki “ikas Kargo ile Paketle ve Gönder” uygulamasıyla açılır. ikas barkodu ve etiket görselini pakete yazar, panel oradan okuyup yazdırır.'],
      ['i-store', 'Lokasyon seçimi', 'Birden çok stok lokasyonunuz varsa stokun hangisine yazılacağını seçersiniz; diğer depolara dokunulmaz. Seçim yapılmadıysa yalnız stok işlemleri bekler, siparişler gelmeye devam eder.'],
      ['i-box', 'Ana katalog kaynağı', 'Kategori yolu (ör. Gübre › Sıvı Gübre), görseller ve varyant adları ikas\'tan gelir; pazaryerine ürün yüklerken kategori eşleştirmesi bu yapıdan başlar.'],
      ['i-up', 'Panelden ürün oluşturma', 'Panelde açtığınız ürünü ikas sitenizde de oluşturabilirsiniz; her varyant ayrı SKU olarak tutulur.'],
      ['i-shield', 'Kapıda ödeme kontrolü', 'Kapıda ödemeli ikas siparişleri işaretlenir; anlaşmalı kargo entegrasyonları tahsilatlı gönderi açmadığı için panel bu siparişte sizi uyarır.'],
      ['i-orders', 'Taslak siparişler beklemez', 'Taslak ya da satış sonrası teklif ekranında duran sipariş kesinleşmediği için alınmaz; oluşturulduğu anda listeye düşer.'],
    ],
    setup: [
      ['Özel uygulama', 'ikas paneli → Uygulamalar → Özel uygulama oluştur; Ürünler, Siparişler, Stok ve Mağaza bilgisi izinlerini okuma ve yazma olarak verin.'],
      ['Mağaza adı', 'Mağaza adınızı “magaza”, “magaza.myikas.com” ya da yönetim adresi biçiminde yazabilirsiniz; panel yalnız adı kullanır.'],
      ['Birden çok site', 'Farklı markalarınızın ikas sitelerini ek mağaza olarak ekleyin; her biri kendi özel uygulamasıyla bağlanır.'],
    ],
    faq: [
      ['ikas sitemde müşteri soruları ve iade talepleri panele gelir mi?', 'Gelmez. ikas bu işlemler için servis sunmadığından ikas tarafında soru-cevap ve iade talebi bölümü yoktur; iptal ve iadeler sipariş durumlarından okunur.'],
      ['Kısmen iade edilen ikas siparişi nasıl görünür?', 'İade edilen satırlar ayrıca işaretlenir, sipariş tamamen iade sayılmaz. İade talebi açık ya da reddedilmiş satır müşteride olduğu için teslim edilmiş kabul edilir.'],
      ['ikas yoğunken istekler reddedilirse ne olur?', 'ikas istek sınırı aşıldığında bildirdiği süre kadar beklenir ve aynı istek yeniden denenir; stok gönderimi bu yüzden yarıda kalmaz.'],
      ['Kendi kargo anlaşmamla ikas siparişi gönderebilir miyim?', 'ikas siparişlerinin kargosu ikas Kargo ile yürür. Kargonomi hesabınız varsa ikas siparişlerini Kargonomi üzerinden de gönderebilirsiniz.'],
    ],
    cta: ['ikas sitenizi pazaryerlerinizle buluşturun', 'Katalog ikas\'ta, siparişler tek listede. Deneme süresi bir hafta, kurulum ücretsiz.'],
  },

  woocommerce: {
    title: 'WooCommerce Entegrasyonu: Sipariş ve Stok | Hastürk CRM',
    desc: 'WooCommerce REST API ile siparişleri alın, ödeme bekleyenleri ayırın, kargo notunu müşteriye gönderin; varyasyon stoğu ve panelden ürün oluşturma dahil.',
    lead: 'WordPress üzerindeki WooCommerce mağazanız REST API anahtarlarıyla bağlanır. Ödenmiş siparişler pazaryerlerinin yanına gelir, kargo bilgisi müşteriye görünen not olarak eklenir; stok ve fiyat basit ürünlere de varyasyonlara da yazılır.',
    tiles: [
      ['i-cart', 'Ödenmemiş sipariş gelmez', 'Bekleyen, başarısız ve taslak ödeme siparişleri alınmaz. Havale / EFT onayı bekleyen (on-hold) sipariş “ödeme bekleniyor” işaretiyle listelenir.'],
      ['i-mail', 'Müşteriye kargo notu', 'Kargoya verdiğinizde sipariş “Tamamlandı” yapılır ve kargo firmasıyla takip numarası müşteriye görünen not olarak eklenir; WooCommerce müşteriye e-posta gönderir.'],
      ['i-sync', 'Stok takibi ayarına uyum', 'Stok takibi kapalı ürüne stok zorla yazılmaz, ilanda uyarı görünür. Varyasyon stoğu ana üründe tutuluyorsa adet ana ürüne bir kez yazılır.'],
      ['i-up', 'Ürün oluşturma', 'Panelde açtığınız ürünü WooCommerce\'te basit ya da varyantlı ürün olarak açabilirsiniz; görseller bağlantıdan WordPress ortam kitaplığına indirilir, barkod GTIN alanına (WooCommerce 9.2+) yazılır.'],
      ['i-eye', 'Takip eklentisi okunur', 'Shipment Tracking eklentisi ya da benzeri alanlarda kayıtlı takip numarası varsa siparişe alınır.'],
    ],
    setup: [
      ['REST API anahtarı', 'WordPress yönetimi → WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle; izin olarak Okuma/Yazma seçin.'],
      ['ck_ ve cs_ değerleri', 'Tüketici anahtarı (ck_…) ve gizli anahtarı (cs_…) site adresinizle birlikte panele girin; adres https ile başlamalıdır.'],
      ['Kalıcı bağlantılar', 'WordPress kalıcı bağlantı ayarı “Düz” ise /wp-json adresi çalışmaz; yazı adı gibi başka bir seçeneğe geçin.'],
    ],
    faq: [
      ['Sunucum anahtarları reddederse ne yapılır?', 'Bazı Apache / CGI sunucuları yetki başlığını siler ve 401 döner. Panel bu durumda anahtarları bir kez sorgu parametresiyle dener ve işe yarayan yöntemle devam eder.'],
      ['WooCommerce\'te “teslim edildi” durumu neden yok?', 'WooCommerce\'in kendi durumlarında teslim adımı bulunmaz; tamamlanan sipariş panelde kargoda görünür. Kargo firması entegrasyonu teslimi bildirirse panel siteye mağaza notu düşer.'],
      ['Fiyatlarım KDV hariç ayarlıysa sorun olur mu?', 'Panel fiyatları KDV dahil gönderir. WooCommerce fiyatları KDV hariç girilecek şekilde ayarlıysa sitede vergi eklenmiş görünür; vergi ayarınızı buna göre kontrol edin.'],
    ],
    cta: ['WordPress mağazanızı pazaryerlerinize bağlayın', 'WooCommerce siparişleri ve stokları tek panelde. Bir hafta ücretsiz deneyin.'],
  },

  pttavm: {
    title: 'PttAVM Entegrasyonu: Sipariş, Barkod ve Stok | Hastürk CRM',
    desc: 'PttAVM REST servisiyle siparişleri alın, depo numaranızla kargo barkodu ve ZPL etiket oluşturun; stok ve fiyatı 1000\'erli kuyruk işlemleriyle gönderin.',
    lead: 'PttAVM bağlantısı Api-Key ve access-token ile çalışan yeni REST servisini kullanır. Siparişler havale onayı ve iade durumlarıyla birlikte gelir; depo numaranızı girdiyseniz kargo barkodu PttAVM\'den alınır ve etiket termal yazıcıya ZPL olarak basılır.',
    tiles: [
      ['i-tag', 'Depo numarasıyla barkod', 'Barkod etiketten önce oluşturulur: panel PttAVM\'den barkod ister, hazır olunca etiketi alır. Aynı siparişe ikinci barkod açılmaz.'],
      ['i-orders', 'ZPL ya da panel etiketi', 'PttAVM ZPL etiket verirse doğrudan yazdırılır; vermezse panel kendi etiketini PttAVM barkoduyla basar.'],
      ['i-sync', 'Kuyruktaki fiyat-stok', 'Stok ve fiyat en fazla 1000 ürünlük isteklerle kuyruğa alınır, sonucu takip numarasıyla sorgulanır. Stok 0 ile 9999 arasında olmalıdır.'],
      ['i-box', 'Varyant başına ilan', 'Varyantlı üründe her varyant barkoduyla ayrı ilan olarak okunur; aktif, pasif, stoklu ve stoksuz ürünler birleştirilir.'],
      ['i-cart', 'Kısmi iade doğru sayılır', 'Siparişin tek satırı iade edildiğinde sipariş bütünüyle iade sayılmaz; diğer satırların stoğu geri eklenmez.'],
    ],
    setup: [
      ['Hesap Yönetimi', 'PttAVM satıcı panelinde Hesap Yönetimi → Entegrasyon Bilgileri bölümünden entegratör için API Key ve Token üretin.'],
      ['Depo numarası', 'Kargo barkodu alabilmek için PttAVM\'deki depo numaranızı da girin; girilmezse mağazanın ilk deposu denenir.'],
      ['Yeni ilanlar', 'Yeni ilanı PttAVM panelinden açın; barkodu paneldeki ürünle aynıysa ilan kendiliğinden eşleşir.'],
    ],
    faq: [
      ['Eski kullanıcı adı / şifreyle bağlanabilir miyim?', 'API Key ve Token girilmemişse eski SOAP servisi kullanıcı adı ve şifreyle denenir. PttAVM token doğrulamasını zorunlu kıldığı ve eski yolu kapatacağı için yeni bilgileri girmeniz önerilir.'],
      ['Aynı stok güncellemesini art arda gönderebilir miyim?', 'PttAVM aynı isteğin beş dakika içinde tekrarlanmasını kabul etmez. Panel değişen ilanları biriktirip bir sonraki gönderimde iletir.'],
      ['PttAVM\'e panelden ürün yükleyebilir miyim?', 'Hayır; PttAVM için ürün yükleme bağlantıda yok. İlanı PttAVM panelinden açtıktan sonra stok ve fiyatı panel yönetir.'],
    ],
    cta: ['PttAVM siparişlerinizi barkoduyla hazırlayın', 'Depo numaranızı girin, etiketi panelden basın. 7 gün boyunca ücretsiz kullanın.'],
  },

  idefix: {
    title: 'idefix Entegrasyonu: Ürün Havuzu ve Sipariş | Hastürk CRM',
    desc: 'idefix siparişini picking ile işleme alın, kendi kargonuzla takip adresi bildirin, ürünü havuza gönderin ve onay durumunu izleyin; soru ve iadeler panelde.',
    lead: 'idefix\'te sipariş “ready” durumundan sonra işleme alınır ve “picking” aşamasında artık müşteri tarafından iptal edilemez. Panel bu akışı, ürün havuzundaki onay durumlarını, müşteri sorularını ve depoya ulaşmış iade kalemlerini idefix\'in satıcı API\'sinden okur.',
    tiles: [
      ['i-cart', 'Picking ve sonrası', 'İşleme aldığınız sipariş idefix\'te “picking” olur; invoiced, in_cargo, delivered ve hakediş anlamındaki approved durumları panelde izlenir.'],
      ['i-truck', 'Takip no ve adresi', 'Kendi kargo anlaşmanızla gönderirken takip numarasıyla birlikte takip adresi de gerekir ve adres siparişteki firmayla uyumlu olmalıdır. Platformun anlaşmalı gönderisinde idefix\'e ayrıca bir şey bildirilmez.'],
      ['i-sync', 'Stok ve fiyat birlikte', 'idefix stoku ve fiyatı aynı kayıtta ister; yalnız stok giderse satır “fiyat yok” hatasıyla döner. Panel stok gönderirken ilanın geçerli fiyatını da ekler.'],
      ['i-up', 'Ürün havuzu', 'Ürünler idefix havuzuna istek başına en fazla 200 adet gönderilir. İnceleme ya da eksik bilgi aşamasındaki ürün satışta sayılmaz ve stok kabul etmez.'],
      ['i-chat', 'Sorular', 'idefix müşteri soruları diğer pazaryerlerinin sorularıyla birlikte listelenir; cevap 2 ile 2000 karakter arasında olmalıdır.'],
      ['i-orders', 'Depodaki iadeler', 'Yalnız idefix deposuna ulaşmış iade kalemleri onaylanır ya da red talebine dönüşür; red talebini idefix inceler.'],
    ],
    setup: [
      ['Yeni API Oluştur', 'idefix satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri → “Yeni API Oluştur”. Satıcı ID ekranda görünür.'],
      ['E-postadaki anahtarlar', 'API KEY ve API SECRET KEY e-posta adresinize gelir. Yeni hesaplarda yalnız API KEY verilebilir; panel hangi kimlik biçiminin kabul edildiğini kendisi bulur.'],
      ['Canlı ortam', 'Canlı ortamda IP izni gerekmez; bilgileri girip bağlantıyı test etmeniz yeterlidir.'],
    ],
    faq: [
      ['Ürün bilgisini panelden güncelleyebilir miyim?', 'idefix API\'si ürün bilgisi güncellemeyi kabul etmez; panelden yalnız stok ve fiyat değişir. Ad, açıklama ya da görsel değişikliğini idefix panelinde yaparsınız.'],
      ['Red talebine görsel ekleyebilir miyim?', 'Görseller yalnız adres olarak kabul edilir, dosya yükleme servisi yoktur. Bağlantısını verdiğiniz görsel talebe eklenir.'],
      ['idefix\'te kargo etiketi ve hakediş servisi var mı?', 'İkisi de bulunmaz. Etiket panelin kendi tasarımıyla basılır, kâr hesabı için idefix komisyon oranınız kullanılır.'],
      ['İstek sınırına takılınca ne olur?', 'idefix istek sınırı sıkıdır; panel 429 ve sunucu hatalarında artan beklemeyle dört kez yeniden dener, sayfa boyutunu gerekirse küçültür.'],
    ],
    cta: ['idefix mağazanızı tek panelden yönetin', 'Havuzdaki ürünler, sorular ve iadeler bir arada. Bir hafta ücretsiz, kurulumda ücret yok.'],
  },

  pazarama: {
    title: 'Pazarama Entegrasyonu: Sipariş, Soru ve Ürün | Hastürk CRM',
    desc: 'Pazarama siparişlerini Hazırlanıyor durumuna alın, kendi kargonuzla takip bildirin, sorulara cevap verin ve ürünleri yaprak kategoriye yükleyin.',
    lead: 'Pazarama iş ortağı API\'sine Client ID ve API Secret ile bağlanırsınız. Siparişler satır durumlarıyla gelir; işleme aldığınız satır “Hazırlanıyor” olur, soruların cevabı Pazarama onayından geçer, yeni ürünler de onaydan sonra satışa açılır.',
    tiles: [
      ['i-cart', 'Satır satır durum', 'Alındı, hazırlanıyor, kargoya verildi, teslimat noktasında, tedarik edilemedi ve iade aşamaları satır düzeyinde okunur; iptal süreci başlamış satırlı sipariş açık kalır.'],
      ['i-truck', 'Kendi kargonuzla', 'Anlaşmalı kargo kullanmıyorsanız takip numarası ve kargo firması her satır için Pazarama\'ya iletilir; firma kimliği Pazarama\'daki teslimat ayarlarınızdan bulunur.'],
      ['i-sync', 'On saniye kuralı', 'Fiyat-stok istekleri arasında en az 10 saniye beklenir, bir istekte en fazla 3000 ürün gider. Yüzde 70\'i aşan indirimli fiyat Pazarama\'nın onayına düşer.'],
      ['i-up', 'Yaprak kategoriye ürün', 'Ürün yalnız son kategoriye açılır ve özellik değerleri Pazarama listesinden seçilir; serbest metin kabul edilmez. Varyant grup kodu 10 karakteri aşarsa kararlı biçimde kısaltılır.'],
      ['i-chat', 'Onaylı cevaplar', 'Soru durumu cevap bekliyor, cevaplandı, onay bekliyor ya da reddedildi olarak görünür; onay bekleyen cevap Pazarama incelemesindedir.'],
    ],
    setup: [
      ['Entegrasyon Bilgileri', 'Pazarama iş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri: API Key (Client ID) ve API Secret.'],
      ['Panele girin', 'İki değeri Pazarama kartına yazın; panel bir saat geçerli erişim belirtecini kendisi alır ve yeniler.'],
      ['Teslimat ayarı', 'Kendi kargonuzla gönderecekseniz kullandığınız firmanın Pazarama teslimat ayarlarınızda tanımlı olduğundan emin olun.'],
    ],
    notes: ['Pazarama API Secret\'ı üretildiği günden itibaren en fazla bir yıl geçerlidir; süresi dolunca yenisini panelde üretip Hastürk CRM\'e girmeniz gerekir.', 'Pazarama\'da iade talebi servisi bağlantıda yoktur; iadeleri Pazarama panelinden sonuçlandırırsınız.'],
    faq: [
      ['Gönderdiğim ürün ne zaman satışa çıkar?', 'Pazarama ürünü önce kabul eder, sonra kendi onayına alır; onaylanan ürün onaylı ürünler listesinde görünür ve panelde ilanınıza bağlanır. İstekte en fazla 500 ürün gönderilir.'],
      ['Marka adım Pazarama\'da farklı yazılmışsa?', 'Marka büyük / küçük harf, boşluk ve noktalama farkı gözetilmeden aranır; “HG Tarım” ile “HG-TARIM” aynı marka sayılır.'],
      ['Bugünün siparişleri neden hemen geliyor?', 'Pazarama sipariş sorgusunda bitiş tarihi hariç tutulur; panel tarihi saat ve dakikayla gönderip bitişi bir dakika ileri alır, böylece günün siparişleri atlanmaz.'],
    ],
    cta: ['Pazarama siparişlerini hızla hazırlayın', 'Sorular, ürün onayları ve stok aynı panelde. 7 gün ücretsiz; kurulum dahil.'],
  },

  amazon: {
    title: 'Amazon Entegrasyonu: SP-API, FBA ve FBM | Hastürk CRM',
    desc: 'Amazon Selling Partner API ile FBM siparişlerine takip numarası bildirin, FBA siparişlerini izleyin, stoku SKU bazında yazın; ürünü ürün tipiyle yükleyin.',
    lead: 'Amazon mağazanız Selling Partner API üzerinden kendi özel uygulamanızla bağlanır. Kendi gönderdiğiniz (FBM) siparişlere kargo firması ve takip numarası bildirilir, Amazon deposundan çıkan (FBA) siparişler yalnız izlenir; stok ve fiyat ilan ilan güncellenir.',
    tiles: [
      ['i-store', 'FBA stoğuna dokunulmaz', 'Amazon deposunda tutulan SKU\'ya stok gönderilmez; gönderilseydi ilan satıcı gönderimine dönerdi. FBA siparişinin durumu Amazon\'dan okunur.'],
      ['i-truck', 'Gönderim onayı', 'FBM siparişinde paket satırları, takip numarası ve kargo firması Amazon\'a gönderim onayı olarak iletilir.'],
      ['i-shield', 'Kısıtlı alıcı verisi', 'Alıcı adı, açık adres ve telefon Amazon\'da kısıtlı veridir; siparişte il ve ilçe görünür, ad boş kalır.'],
      ['i-clock', 'Yavaş kotalı satır servisi', 'Amazon sipariş satırlarını saniyede yarım istekle verir; panel her turda en eski 100 siparişi işler, kalanını bir sonraki senkronda alır.'],
      ['i-up', 'Ürün tipiyle yükleme', 'Kategori olarak Amazon ürün tipi seçilir ve zorunlu özellikler o tipin şemasından gelir. Amazon\'da zaten var olan SKU\'nun ilanı panelin bilgisiyle ezilmez.'],
      ['i-globe', 'Pazar yeri seçimi', 'Varsayılan Amazon.com.tr\'dir; Avrupa, Kuzey Amerika ya da Uzak Doğu bölgesinde başka bir pazar yeri seçilebilir. Fiyat o pazar yerinin para biriminde gönderilir.'],
    ],
    setup: [
      ['Özel uygulama', 'Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme bölümünde mağazanız için özel bir uygulama oluşturun.'],
      ['LWA ve refresh token', 'Uygulamanın LWA Client ID ve Client Secret değerlerini kopyalayın; uygulamayı mağazanız için yetkilendirince Atzr| ile başlayan refresh token verilir.'],
      ['Satıcı Token', 'Seller Central → Ayarlar → Hesap Bilgileri\'ndeki Satıcı Token\'ı (Merchant Token) da girip bağlantıyı test edin.'],
    ],
    faq: [
      ['Amazon.com.tr dışında satış yapıyorsam hangi paket gerekir?', 'Amazon.com.tr yurt içi kanal sayılır. Türkiye dışında bir pazar yeri seçerseniz bağlantı yurt dışı kanal olur ve Kurumsal pakette yer alır; siparişler TCMB döviz alış kuruyla TL\'ye çevrilir.'],
      ['Barkodu olmayan ürünü Amazon\'a yükleyebilir miyim?', 'Amazon UPC (12), EAN (13) ya da GTIN (14 hane) ister. Barkodsuz ürün yalnız Amazon\'un onayladığı GTIN muafiyetiniz varsa açılabilir.'],
      ['Ürün açıklamasında HTML kullanabilir miyim?', 'Amazon metin alanlarında HTML etiketini reddeder; panel açıklamayı düz metne çevirir ve uzun metni kelime ortasından değil son boşluktan keser.'],
      ['Gönderdiğim ürünün sonucunu nasıl görürüm?', 'Amazon ilk doğrulamayı geçen ürünü işlemeye alır; panel ilanın durumunu Amazon\'dan sorgular. ASIN oluşunca ürün açılmış, işleme sırasında hata çıkarsa reddedilmiş olarak işaretlenir.'],
    ],
    cta: ['Amazon FBM siparişlerinizi diğer kanallarla birlikte gönderin', 'FBA siparişleri de aynı listede izlenir. 7 gün ücretsiz deneme, kurulum ücreti yok.'],
  },

  ciceksepeti: {
    title: 'Çiçeksepeti Entegrasyonu: Sipariş ve Stok Kodu | Hastürk CRM',
    desc: 'Çiçeksepeti siparişleri stok koduyla panele gelir, fiyat-stok 200 satırlık partilerle gider; ürün yüklemede teslimat tipi ve marka özelliği doldurulur.',
    lead: 'Çiçeksepeti bağlantısında ilanlarınız ve sipariş satırları satıcı stok kodunuzla eşleşir. Siparişler ürün satırı düzeyinde gelip sipariş numarasıyla birleşir; kargo Çiçeksepeti\'nin anlaşmasıyla yürür, etiket Çiçeksepeti panelinden basılır.',
    tiles: [
      ['i-link', 'Stok koduyla eşleşme', 'Çiçeksepeti\'nde ilanın anahtarı satıcı stok kodudur; sipariş satırı da bu kodla paneldeki ürüne bağlanır.'],
      ['i-sync', 'İki yüz satırlık partiler', 'Stok ve fiyat en fazla 200 satırlık partilerle gönderilir ve Çiçeksepeti bunları arka planda işler.'],
      ['i-truck', 'Çiçeksepeti kargosu', 'Takip numarası siparişle birlikte Çiçeksepeti\'nden gelir; elle takip numarası girmeniz gerekmez.'],
      ['i-up', 'Teslimat tipi zorunlu', 'Ürün yüklerken teslimat tipi (Çiçeksepeti servis aracı, kargo ya da ikisi) ve teslimat mesaj tipi seçilir; marka, kategorinin “Marka” özelliğinden doldurulur.'],
      ['i-box', 'Görsel ve açıklama', 'Ürün başına en fazla 5 görsel gönderilir; açıklama düz metinde en az 30 karakter olmalıdır. Alıcının sipariş verirken yazdığı kişiselleştirme alanı satıcıdan istenmez.'],
    ],
    setup: [
      ['API anahtarı', 'Çiçeksepeti satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri sayfasından API anahtarınızı alın.'],
      ['Satıcı ID', 'Aynı sayfadaki Satıcı ID\'yi de girin; Çiçeksepeti her istekte bu kimliği görmek ister.'],
      ['Stok kodlarını kontrol edin', 'Çiçeksepeti ilanlarındaki stok kodlarının paneldeki ürün SKU\'larıyla aynı olması eşleşmeyi kolaylaştırır.'],
    ],
    notes: ['İptal edilen siparişler Çiçeksepeti\'nin sipariş listesinde gelmiyor; panel bunları okuyamadığı için bağlantıda bir kez uyarır. İptalleri Çiçeksepeti panelinden kontrol edin.', 'Çiçeksepeti\'nde soru-cevap ve iade talebi bağlantısı yoktur.'],
    faq: [
      ['Ürün yükleme ne kadar sürede sonuçlanır?', 'Ürünler en fazla 1000\'erli partilerle gönderilir ve Çiçeksepeti toplu işlem numarası verir; ürün başına başarılı, uyarılı ya da başarısız sonucu bu numarayla sorgulanır.'],
      ['Kargo etiketini panelden basabilir miyim?', 'Çiçeksepeti siparişlerinde etiket Çiçeksepeti panelinden yazdırılır; panel takip numarasını ve kargo durumunu gösterir.'],
      ['Aynı ana ürünün varyantları nasıl görünür?', 'Aynı ana ürün kodundaki ilanların ortak ad başı grup adı, kalan kısmı varyant adı olur; panelde varyantlar ana ürün altında toplanır.'],
    ],
    cta: ['Çiçeksepeti ilanlarınızı stok koduyla yönetin', 'Siparişler ve stok tek ekranda. Bir haftalık deneme ücretsizdir.'],
  },

  koctas: {
    title: 'Koçtaş Entegrasyonu: Mirakl Teklif ve Sipariş | Hastürk CRM',
    desc: 'Koçtaş Mirakl panelinizi API anahtarıyla bağlayın: sipariş satırlarını kabul edin, takip numarası bildirin, teklif fiyatını koruyarak stok gönderin.',
    lead: 'Koçtaş pazaryeri Mirakl altyapısında çalışır: katalogdaki ürün Koçtaş\'ın, fiyat ve stok ise sizin teklifinizdir. Panel sipariş satırlarını kabul eder, kendi kargonuzun takip numarasını iletir ve teklifinizin diğer alanlarını bozmadan stok ve fiyat yazar.',
    tiles: [
      ['i-cart', 'Satır kabulü', 'Kabul bekleyen siparişin iptal edilmemiş satırları panelden kabul edilir; Mirakl\'da kargoya verme sipariş düzeyinde olduğu için ikinci paket tekrar bildirilmez.'],
      ['i-truck', 'Taşıyıcı listesinden firma', 'Takip numarası girerken kargo firması Mirakl\'ın taşıyıcı listesinde adıyla aranır; bulunamazsa firma adı metin olarak iletilir.'],
      ['i-sync', 'Teklif bütün olarak yazılır', 'Mirakl teklifi her güncellemede baştan yazar; panel önce teklifin güncel halini okur, yalnız stok ya da fiyatı değiştirip diğer alanları korur.'],
      ['i-tag', 'Liste fiyatı ve indirim', 'Liste fiyatınız satış fiyatından yüksekse teklif fiyatı liste fiyatı olur, satış fiyatı süresiz indirim olarak gönderilir.'],
      ['i-up', 'Katalogda yoksa ürün dosyası', 'Barkod Koçtaş kataloğundaysa yalnız teklif açılır. Değilse ürün Koçtaş\'ın şablonundaki özellik kodlarıyla dosya olarak gönderilir ve onaydan sonra teklif açılır.'],
    ],
    setup: [
      ['API Anahtarı', 'Koçtaş satıcı panelinde sağ üstteki kullanıcı menüsünden API Anahtarı sayfasını açıp anahtarı kopyalayın.'],
      ['Panel adresi', 'Koçtaş\'ın Mirakl panel adresini (ör. https://koctas-prod.mirakl.net) anahtarla birlikte girin; sondaki yol kısmı panelce temizlenir.'],
      ['Birden çok mağaza', 'Hesabınızda birden fazla Koçtaş mağazası varsa ilgili Mağaza ID\'yi de yazın; her istek o mağaza için yapılır.'],
    ],
    faq: [
      ['Onaydan sonra açılan teklifin stoğu neden sıfır?', 'Koçtaş\'ın ürün onayı günler sürebilir; o arada stok değişmiş olabileceği için teklif sıfır stokla açılır. İlan bağlandıktan sonraki ilk stok gönderiminde gerçek adet yazılır.'],
      ['Ürün dosyasını sık gönderebilir miyim?', 'Mirakl ürün dosyasını satıcı başına en fazla 15 dakikada bir kabul eder; teklif gönderimi ise dakikada bir yapılabilir. Panel bu sınırlara göre gönderir.'],
      ['Teslimattan sonra açılan sorun panelde görünür mü?', 'Koçtaş\'ta kargodan sonra müşteri sorun kaydı açarsa sipariş gönderilmiş durumda kalır; sorun açık ya da kapalı bilgisi siparişte izlenir.'],
    ],
    cta: ['Koçtaş tekliflerinizi güvenle güncelleyin', 'Mirakl teklif alanlarınız korunur, siparişler tek listede. 7 gün ücretsiz.'],
  },

  shopify: {
    title: 'Shopify Entegrasyonu: Fulfillment ve Lokasyon | Hastürk CRM',
    desc: 'Shopify Dev Dashboard uygulamasıyla bağlanın: siparişlere takip bilgisiyle fulfillment açın, stoku seçtiğiniz lokasyona yazın, ürünü varyantlarıyla oluşturun.',
    lead: 'Shopify mağazanız Admin GraphQL API ile bağlanır. Kargoya verdiğiniz sipariş Shopify\'da takip bilgisiyle tamamlanır ve müşteriye bildirim gider; stok tek bir lokasyona yazılır, panelde açtığınız ürün varyantlarıyla Shopify\'da oluşturulabilir.',
    tiles: [
      ['i-truck', 'Takip bağlantısı kendiliğinden', 'Gönderim emri takip numarası ve firmayla kapatılır. Shopify PTT, Yurtiçi Kargo, Aras Kargo ve Sürat Kargo adlarını tanır, takip bağlantısını kendisi oluşturur.'],
      ['i-store', 'Tek lokasyon', 'Stok panelde girdiğiniz lokasyona, girmediyseniz ana lokasyona yazılır; o lokasyonda stoklanmayan ürün önce etkinleştirilir.'],
      ['i-up', 'Varyantlı ürün oluşturma', 'Marka satıcı (vendor), kategorinin son basamağı ürün tipi olarak yazılır; liste fiyatı satıştan yüksekse karşılaştırma fiyatı olur.'],
      ['i-calc', 'İade ve çıkarılan kalemler', 'Siparişten çıkarılan ya da iade edilen kalemler düşülerek güncel tutar okunur; hiç gönderilmeden tamamen iade edilen sipariş iptal sayılır.'],
      ['i-shield', 'Korunan müşteri verisi', 'Uygulamanızın müşteri verisi izni yoksa Shopify ad ve adresi boş verir; panel siparişi yine alır ve eksik izni uyarıyla bildirir.'],
    ],
    setup: [
      ['Dev Dashboard', 'dev.shopify.com\'da bir uygulama oluşturun; 1 Ocak 2026\'dan beri yeni uygulamalar yalnız bu yolla açılıyor.'],
      ['İzinler', 'read_orders, read_all_orders, write_products, write_inventory, read_locations, write_merchant_managed_fulfillment_orders ve write_fulfillments izinlerini verip uygulamayı mağazanıza kurun.'],
      ['Client ID ve secret', 'Mağaza adınızla birlikte Client ID ve Client secret\'ı panele girin; 24 saatlik erişim belirteci süresi dolmadan yenilenir.'],
    ],
    faq: [
      ['Eskiden oluşturduğum özel uygulama çalışır mı?', 'Evet. Shopify yönetiminde açılmış eski özel uygulamanın shpat_ ile başlayan Admin API belirtecini gelişmiş alanlara girerek bağlanabilirsiniz.'],
      ['60 günden eski siparişler neden gelmiyor?', 'Shopify bu siparişleri yalnız read_all_orders izni olan uygulamaya verir. İzni ekleyip uygulamayı yeniden kurduğunuzda geçmiş siparişler de okunur.'],
      ['Fiyatlarım KDV hariç tanımlıysa tutarlar doğru mu?', 'Mağaza vergiyi fiyata dahil etmiyorsa panel satır vergisini ekler; panelde tüm tutarlar KDV dahil tutulur.'],
    ],
    cta: ['Shopify siparişlerini pazaryerlerinizle tek listede görün', 'Fulfillment ve stok panelden. 7 gün ücretsiz deneyin, kurulum bedelsiz.'],
  },

  opencart: {
    title: 'OpenCart Entegrasyonu: Bağlantı Dosyasıyla | Hastürk CRM',
    desc: 'OpenCart\'ın yönetim API\'si olmadığı için panelden indirilen tek PHP dosyasıyla bağlanın; seçenek bazında stok, özel fiyat ve müşteriye kargo notu.',
    lead: 'OpenCart\'ta kullanılabilir bir yönetim REST API\'si bulunmadığından bağlantı, panelden indirdiğiniz tek bir PHP dosyasıyla kurulur. Dosya veritabanına config.php bilgileriyle bağlanır; siparişler, seçenek bazında stok ve fiyat bu dosya üzerinden okunup yazılır.',
    tiles: [
      ['i-link', 'Anahtarlı bağlantı dosyası', 'Dosyanın içine panelin ürettiği bir anahtar gömülür; istekler yalnız HTTPS üzerinden ve bu anahtarla kabul edilir.'],
      ['i-box', 'Seçenek değeri ayrı ilan', 'Beden, renk gibi her seçenek değeri ayrı ilan olur; fiyatı ana fiyata eklenen fark, stoğu seçeneğin kendi adedidir.'],
      ['i-tag', 'Özel fiyatla indirim', 'Ana fiyat liste fiyatı olarak kalır, daha düşük satış fiyatı OpenCart\'ın özel fiyat (special) kaydına yazılır.'],
      ['i-mail', 'Sipariş geçmişine not', 'Kargoya verdiğinizde sipariş geçmişine kargo firması ve takip numarasıyla müşterinin göreceği bir not eklenir, durum “Kargoya verildi” olur.'],
      ['i-calc', 'Para birimi çevrimi', 'Veritabanındaki tutarlar mağazanın varsayılan para birimindedir; panel siparişin kendi para birimine OpenCart\'ın kur değeriyle çevirir.'],
    ],
    setup: [
      ['Dosyayı indirin', 'Hastürk CRM → Entegrasyonlar → OpenCart kartındaki bağlantı dosyasını indirin; varsayılan adı hasturk-baglanti.php\'dir.'],
      ['config.php\'nin yanına', 'Dosyayı OpenCart\'ın kurulu olduğu ana klasöre, config.php ile aynı yere yükleyin.'],
      ['Site adresi', 'Yönetim paneli adresini değil, OpenCart\'ın kurulu olduğu https adresini panele yazın ve bağlantıyı test edin.'],
    ],
    faq: [
      ['Yarım kalmış siparişler panele düşer mi?', 'Durumu 0 olan, ödeme sayfasında yarım kalmış siparişler alınmaz; yalnız gerçek durum kazanmış siparişler listelenir.'],
      ['Kargoya verildi durumum farklı adlandırılmışsa?', 'Panel adı “Shipped” ya da “Kargo…” olan durumu kullanır. Farklı bir durum istiyorsanız Sistem → Yerelleştirme → Sipariş Durumları\'ndaki numarayı gelişmiş ayara yazın.'],
      ['Dosyayı farklı adla yükleyebilir miyim?', 'Evet; sunucudaki dosya adını gelişmiş ayarlardaki “Bağlantı dosyasının adı” alanına yazmanız yeterlidir.'],
    ],
    cta: ['OpenCart sitenizi tek dosyayla bağlayın', 'Eklenti kurmadan sipariş ve stok eşitleme. İlk 7 gün ücretsiz.'],
  },

  etsy: {
    title: 'Etsy Entegrasyonu: Envanter ve Yurt Dışı Satış | Hastürk CRM',
    desc: 'Etsy Open API v3 ile receipt siparişlerini alın, takip numarasıyla alıcıya bildirim gönderin, envanteri varyant bazında güncelleyin, ilanı profilleriyle açın.',
    lead: 'Etsy mağazanız Open API v3 ve OAuth ile bağlanır. Siparişler Etsy receipt kayıtlarından gelir ve TL\'ye çevrilerek raporlanır; envanter ilan bazında okunup yazılır, kargo takip numarası girildiğinde Etsy alıcıyı bilgilendirir. Yurt dışı pazaryerleri Kurumsal pakettedir.',
    tiles: [
      ['i-sync', 'İlanın tüm envanteri', 'Stok ya da fiyat değişince ilanın bütün envanteri okunur, ilgili varyant satırları değiştirilip geri yazılır. Değer özelliğe göre değişmiyorsa tüm varyantlara aynı değer gider.'],
      ['i-mail', 'Alıcıya kargo bildirimi', 'Takip numarası ve kargo firması Etsy\'ye iletildiğinde alıcıya Etsy\'nin kendi gönderim bildirimi gider.'],
      ['i-up', 'Taslaktan yayına', 'Ürün önce taslak ilan olarak açılır, ardından görseller, özellikler ve envanter eklenir ve ilan yayına alınır. İlanda en fazla 20 görsel olabilir.'],
      ['i-globe', 'Mağaza para birimi', 'Ürün fiyatı Etsy mağazanızın para birimine TCMB döviz alış kuruyla çevrilerek gönderilir; çevrilemeyen TL fiyat gönderilmez.'],
      ['i-shield', 'İlan silinmez', 'Bağlantı Etsy\'den ilan silme izni istemez; panel Etsy\'de ilan kaldırmaz.'],
    ],
    setup: [
      ['Uygulama oluşturun', 'etsy.com/developers → Your Apps bölümünde uygulama açıp keystring ve shared secret değerlerini alın.'],
      ['Yetkilendirin', 'Uygulamayı transactions_r, transactions_w, listings_r, listings_w ve shops_r kapsamlarıyla mağazanız için yetkilendirip refresh token alın.'],
      ['Mağaza ID', 'Rakamlardan oluşan Etsy mağaza ID\'nizi de girin; Etsy her yenilemede yeni token verdiği için panel en yenisini saklar.'],
    ],
    faq: [
      ['Etsy\'ye ürün yüklerken hangi bilgiler zorunlu?', 'Kimin yaptığı, ne zaman yapıldığı ve malzeme olup olmadığı beyanı ile kargo, hazırlık ve iade profili gerekir. Panel bunları sizin yerinize varsayılanla doldurmaz; AB\'de kurulu mağazalarda iade profili istenmez.'],
      ['Etsy siparişlerimin tutarı hangi para biriminde görünür?', 'Sipariş kaydedilirken tutar TCMB döviz alış kuruyla TL\'ye çevrilir; asıl para birimi ve kur siparişin ayrıntısında saklanır.'],
      ['Eski bir izinle yetkilendirdiysem ürün yükleme çalışır mı?', 'listings_w kapsamı olmadan verilmiş yetki yenilenince kapsam değişmez. Uygulamayı yeniden yetkilendirip yeni refresh token girmeniz gerekir.'],
    ],
    cta: ['Etsy satışlarınızı yurt içi kanallarla birlikte izleyin', 'Kurumsal pakette Etsy, eBay ve Ozon bir arada. Bir hafta ücretsiz deneyin.'],
  },

  teknosa: {
    title: 'Teknosa Entegrasyonu: Kargo Modeli ve Komisyon | Hastürk CRM',
    desc: 'Teknosa siparişlerini kabul edin; kendi kargonuzda takip numarası, Teknosa kargosunda yalnız kargoya verildi bildirimi gider. Satır komisyonu kâra yazılır.',
    lead: 'Teknosa pazaryeri hesabınız satıcı panelinden aldığınız API anahtarıyla bağlanır. Sipariş satırları panelden kabul edilir; gönderiyi kendi anlaşmanızla mı yoksa Teknosa\'nın anlaşmalı kargosuyla mı yaptığınıza göre bildirim ayrı yürür ve her satırın komisyonu siparişin kârına yansır.',
    tiles: [
      ['i-truck', 'Kendi kargonuz', 'Kendi anlaşmanızla gönderdiğinizde takip numarası ve firma Teknosa\'ya iletilir, ardından sipariş kargoya verildi olarak işaretlenir.'],
      ['i-truck', 'Teknosa anlaşmalı kargo', 'Teknosa\'nın kargosunu kullanan hesaplarda takip numarası Teknosa\'dan gelir; panel yalnız siparişin kargoya verildiğini bildirir.'],
      ['i-calc', 'Komisyon satırda', 'Sipariş satırındaki KDV dahil komisyon panele gelir; her Teknosa siparişinin net kârı bu tutarla hesaplanır.'],
      ['i-up', 'Onaylı ürün, sonra teklif', 'Teknosa kataloğunda olmayan ürün önce onaya gider, onaylanınca teklifiniz açılır. Katalogda bulunan barkod için doğrudan teklif oluşturulur.'],
      ['i-sync', 'Fiyat ve indirim alanı', 'Stok gönderiminde teklifin mevcut fiyatı ve indirimi korunur; fiyat gönderiminde stok değişmez.'],
    ],
    setup: [
      ['Anahtarı oluşturun', 'Teknosa satıcı paneline girin, sağ üst kullanıcı menüsünden API Anahtarı sekmesini açın ve anahtarı kopyalayın.'],
      ['Adres alanı isteğe bağlı', 'Teknosa size farklı bir panel adresi vermediyse adres alanını boş bırakın; varsayılan Teknosa adresi kullanılır.'],
      ['Mağaza numarası', 'Hesabınızda birden çok mağaza varsa mağaza numaranızı ekleyip bağlantıyı test edin.'],
    ],
    faq: [
      ['Teknosa müşteri soruları ve iadeleri panele gelir mi?', 'Hayır; bu bağlantıda soru-cevap ve iade işlemleri yoktur. Bunları Teknosa satıcı panelinden yürütürsünüz.'],
      ['Teknosa\'da yeni eklenen bir sipariş durumu ne olur?', 'Panel tanımadığı bir durumu “yeni sipariş” saymaz; böylece kargolanmış bir sipariş yanlışlıkla yeniden işleme alınacak gibi görünmez.'],
      ['Hangi kargo modelini kullandığımı panele söylemem gerekir mi?', 'Gerekmez. Pakette takip numarası varsa numara ve firma Teknosa\'ya yazılır, ardından kargoya verildi bildirilir; numara yoksa yalnız kargoya verildi bilgisi gider.'],
    ],
    cta: ['Teknosa siparişlerinin kârını satır satır görün', 'Komisyon, kargo modeli ve stok aynı panelde. Deneme 7 gün, ücretsiz.'],
  },

  boyner: {
    title: 'Boyner Entegrasyonu: Geliştirme Aşamasında | Hastürk CRM',
    desc: 'Boyner pazaryeri bağlantısı geliştirme aşamasında: paket birleştirme, iki kargo modeli, toplu stok ve fiyat planlanıyor. Açıldığında size haber verelim.',
    lead: 'Boyner bağlantısı henüz kullanıma açık değil. Boyner\'in herkese açık bir API belgesi bulunmadığından servis adresleri ve alanlar, Boyner entegrasyon ekibinin satıcıya verdiği belgeyle doğrulandıktan sonra açılacak.',
    tiles: [
      ['i-box', 'Paketlerin birleşmesi', 'Boyner aynı siparişin paketlerini ayrı kayıtlar halinde veriyor; panelde bu paketlerin sipariş numarasıyla tek siparişte toplanması planlanıyor.'],
      ['i-truck', 'Boyner kargosu ya da sizin kargonuz', 'Boyner\'in anlaşmalı kargosunda takip numarasının Boyner\'den gelmesi, kendi anlaşmanızla gönderimde ise numaranın panelden iletilmesi hedefleniyor.'],
      ['i-sync', 'Bin satırlık stok partileri', 'Stok ve fiyatın 1000\'er satırlık toplu işlemlerle gönderilmesi, sonucun birkaç dakika sonra okunması planlanıyor.'],
      ['i-cart', 'Picking ve Invoiced', 'Yeni paketlerin işleme alınınca “Picking”, fatura numarası girilince “Invoiced” yapılması tasarlanıyor.'],
    ],
    setup: [
      ['Belgeyi isteyin', 'Boyner entegrasyon belgesi satıcıya Boyner entegrasyon ekibinden verilir; açılış için bu belgedeki adreslerin doğrulanması gerekiyor.'],
      ['Kimlik bilgileri', 'Bağlantı açıldığında merchant.boyner.com.tr → sağ üstte mağaza adı → Hesabım → Entegrasyon Bilgileri\'ndeki Satıcı ID, API Key ve API Secret kullanılacak.'],
      ['Haber alın', 'İletişim sayfasından Boyner için talep bırakırsanız bağlantı açıldığında sizi arayalım.'],
    ],
    faq: [
      ['Boyner entegrasyonu ne zaman açılacak?', 'Kesin bir tarih vermiyoruz. Boyner\'in uç noktaları canlı bir mağazada doğrulanınca test aşamasına alınacak ve bu sayfada duyurulacak.'],
      ['Boyner\'e panelden ürün yükleme olacak mı?', 'İlk sürümde planlanmıyor. Ürünleri Boyner panelinden açmanız, stok ve fiyatın panelden yönetilmesi hedefleniyor; soru-cevap ve iade de ilk sürümde yer almıyor.'],
      ['Entegrasyon Bilgileri ekranı hesabımda görünmüyorsa?', 'Bazı hesaplarda bu ekran kapalı olabiliyor; bu durumda bilgileri Boyner entegrasyon ekibinden istemeniz gerekir.'],
    ],
    cta: ['Boyner bağlantısı açılınca ilk siz bilin', 'Talebinizi bırakın; bu arada diğer kanallarınızı demo panelde inceleyebilirsiniz.'],
  },

  pasaj: {
    title: 'Turkcell Pasaj Entegrasyonu: Planlanan Kapsam | Hastürk CRM',
    desc: 'Turkcell Pasaj bağlantısı geliştiriliyor: API erişimini Pasaj danışmanınız açıyor. Sipariş onayı, takip bildirimi ve toplu stok güncellemesi planlanıyor.',
    lead: 'Turkcell Pasaj\'ın satıcı API\'si varsayılan olarak kapalı geliyor ve herkese açık bir belgesi yok. Pasaj danışmanınızın açtığı erişim ve ilettiği servis adresiyle çalışacak bağlantı şu an geliştirme aşamasında.',
    tiles: [
      ['i-key', 'Danışman açar', 'API özelliğini Pasaj danışmanınız açıyor ve entegrasyon belgesiyle birlikte servis adresini iletiyor; bu adres bağlantıda zorunlu alan olacak.'],
      ['i-store', 'Pasaj\'ın kendi altyapısı', 'Pasaj Seller Admin, Mirakl gibi ortak bir altyapı değil; uç noktalar Pasaj\'ın kendi belgesine göre doğrulanacak.'],
      ['i-box', 'Paketler sipariş altında', 'Ayrı kayıt olarak gelen paketlerin sipariş numarasıyla tek siparişte toplanması planlanıyor.'],
      ['i-truck', 'İki gönderim yolu', 'Pasaj anlaşmalı kargosunda yalnız fatura aşamasının, kendi kargonuzda ise takip numarasının bildirilmesi hedefleniyor.'],
    ],
    setup: [
      ['Erişimi talep edin', 'Pasaj danışmanınızdan API erişiminin açılmasını ve servis adresini isteyin.'],
      ['Anahtarları üretin', 'Seller Admin → sağ üstte kullanıcı adınız → Entegrasyon Bilgileri → “Yeni Oluştur” ile Satıcı ID, API Key ve API Secret oluşturulur.'],
      ['Açılışı bekleyin', 'Bağlantı test aşamasına geçince bu bilgileri panelin Turkcell Pasaj kartına girebileceksiniz.'],
    ],
    faq: [
      ['Pasaj için şimdiden bir şey hazırlamam gerekir mi?', 'API erişimini açtırıp servis adresini almanız, bağlantı açıldığında kurulumu hızlandırır. Bilgileri şimdilik saklayın; panelde henüz giriş alanı aktif değil.'],
      ['Pasaj müşteri soruları ve iadeleri planlanıyor mu?', 'İlk sürümde soru-cevap, iade, ürün yükleme ve etiket yer almıyor; kapsam sipariş, kargo bildirimi ve stok-fiyatla sınırlı.'],
      ['Turkcell Pasaj açıldığında haber verir misiniz?', 'Evet. İletişim formunda “kanal talebi” seçip Pasaj yazmanız yeterli.'],
    ],
    cta: ['Pasaj bağlantısı için sıraya girin', 'Açılış duyurusunu size iletelim; o zamana kadar diğer pazaryerlerinizi bağlayabilirsiniz.'],
  },

  trendyolgo: {
    title: 'Trendyol Go Entegrasyonu: Şube ve Kurye | Hastürk CRM',
    desc: 'Trendyol Go hızlı market siparişlerini şube bazında alın, toplamayı başlatın, provizyon aralığına göre hazırlandı bildirin; şube stok ve fiyatı panelden.',
    lead: 'Trendyol Go by Uber Eats hızlı market siparişleri şube (store) bazında panele gelir. Siparişi işleme aldığınızda toplama başlar; toplama bitince Trendyol Go\'nun verdiği tutar aralığına göre “hazırlandı” bildirilir ve kurye siparişi mağazadan alır.',
    tiles: [
      ['i-store', 'Şube kimliği zorunlu', 'Siparişler bağladığınız şubeden okunur, stok ve fiyat o şubeye yazılır. Bağlantı testi hesabınızdaki şube listesini de gösterir.'],
      ['i-receipt', 'Provizyon aralığı', 'Toplama sonrasında Trendyol Go faturalanabilir tutar aralığını verir; panel tutarı bu aralıkta tutarak siparişi faturalandı olarak bildirir. Bu adım olmadan sipariş kuryeye geçemez.'],
      ['i-x', 'Tedarik edilemeyen ürün', 'Bir ürünü tedarik edemediğinizde Trendyol Go aynı sipariş numarasıyla yeni paket açar; panel işlem anında güncel paketi sipariş numarasından bulur.'],
      ['i-truck', 'Kurye platformdan', 'Teslimatı Trendyol Go\'nun kuryesi yapar; etiket ya da takip numarası yoktur.'],
      ['i-sync', 'Fiyat ve stok aynı serviste', 'Stok gönderilirken son okunan fiyat, fiyat gönderilirken son okunan stok korunur; liste fiyatı da ayrı alan olarak gider.'],
    ],
    setup: [
      ['Partner paneli', 'partner.tgomarket.com\'a girin → sağ üstte mağaza adınız → Hesap Bilgilerim → Entegrasyon Bilgileri: Satıcı ID, API Key ve API Secret.'],
      ['Şube numarası', 'Şube (store) numaralarınızı kategori sorumlunuzdan alın; anahtar tüm şubelerde aynıdır, değişen yalnız şube numarasıdır.'],
      ['Diğer şubeler', 'İlk şubeyi bağladıktan sonra diğer şubeleri aynı anahtarla ek mağaza olarak ekleyin.'],
    ],
    faq: [
      ['Trendyol Go\'da iade ve çalışma saatleri panelden yönetilir mi?', 'Hayır. Bağlantı sipariş akışı, şube stoku ve fiyatıyla sınırlıdır; iade, değerlendirme, teslimat bölgesi ve çalışma saatleri Trendyol Go panelinde kalır.'],
      ['Çok sayıda ürünü aynı anda güncellersem sorun olur mu?', 'Trendyol Go aynı uca 10 saniyede en fazla 50 istek kabul eder. Panel stok ve fiyatı toplu işlemle gönderdiği için bu sınıra takılmaz.'],
      ['Trendyol pazaryeri hesabımla aynı bilgiler mi kullanılıyor?', 'Hayır; Trendyol Go\'nun satıcı paneli ve entegrasyon bilgileri ayrıdır. İki kanalı ayrı mağazalar olarak bağlarsınız.'],
    ],
    cta: ['Trendyol Go şubelerinizi tek panelden yönetin', 'Hızlı market siparişleri pazaryeri siparişlerinizin yanında. Bir hafta ücretsiz.'],
  },

  getir: {
    title: 'Getir Çarşı Entegrasyonu: Hazırlık Sürüyor | Hastürk CRM',
    desc: 'Getir Çarşı bağlantısı geliştiriliyor: anahtarlar Getir\'den e-postayla istenir. Hızlı onay, Getir kuryesine hazır bildirimi ve üstü çizili fiyat planlanıyor.',
    lead: 'Getir Çarşı bağlantısı geliştirme aşamasında. Getir\'in mağaza API\'si açık belgede yayımlanmadığı için servis yolları, Getir\'in verdiği anahtar ve belgeyle canlı bir mağazada doğrulandıktan sonra kullanıma açılacak.',
    tiles: [
      ['i-bolt', 'Hızlı onay', 'Getir yeni siparişin çok kısa sürede onaylanmasını bekliyor; siparişin panelden hemen işleme alınabilmesi bu bağlantının ana hedefi.'],
      ['i-clock', 'Onaydan sonra hazır', 'Getir onay ile hazır bildirimi arasında en az bir dakika istiyor; panelin erken bildirimi anlaşılır bir mesajla durdurması planlanıyor.'],
      ['i-truck', 'Getir kuryesi', 'Hazır bildirilen siparişi Getir kuryesi teslim alacak; kendi kuryesiyle çalışan mağazalarda teslim Getir panelinden işaretlenecek.'],
      ['i-tag', 'Üstü çizili fiyat', 'Satış fiyatıyla birlikte üstü çizili fiyatın da gönderilebilmesi planlanıyor.'],
    ],
    setup: [
      ['Anahtarı e-postayla isteyin', 'Getir Çarşı API anahtarları satıcı panelinden alınmıyor: getircarsiapi@getir.com adresine ya da Getir temsilcinize mağaza adı ve numaranızla yazın.'],
      ['İki anahtar', 'Getir bir uygulama anahtarı ve her şube için ayrı bir mağaza anahtarı iletir.'],
      ['Açılışı bekleyin', 'Bağlantı test aşamasına geçince anahtarları panele girebileceksiniz; diğer şubeler ek mağaza olarak eklenecek.'],
    ],
    faq: [
      ['Getir Çarşı\'daki eski siparişlerim aktarılacak mı?', 'Getir\'in servisinde tarih aralığıyla sipariş sorgusu bulunmuyor; bağlantı açıldığında yalnız aktif, onay bekleyen ve yeni iptal edilen siparişler okunabilecek.'],
      ['Getir Çarşı için ürün yükleme olacak mı?', 'Planlanan kapsamda yok. Mağaza ürünlerinizin okunup paneldeki ürünlerle eşleşmesi, stok ve fiyatın panelden gönderilmesi hedefleniyor.'],
      ['Açıldığında nasıl haberim olur?', 'İletişim sayfasından Getir Çarşı için talep bırakırsanız bağlantı test aşamasına geçtiğinde size yazarız.'],
    ],
    cta: ['Getir Çarşı açılışından haberdar olun', 'Talebinizi şimdi bırakın; Trendyol Go ve Yemeksepeti Market bugün bağlanabiliyor.'],
  },

  yemeksepeti: {
    title: 'Yemeksepeti Market Entegrasyonu: Toplama | Hastürk CRM',
    desc: 'Yemeksepeti Market siparişlerini toplayın, bulunamayan ürünü bildirin, kurye modeline göre teslim almaya hazır ya da yola çıktı deyin; şube stok ve fiyatı.',
    lead: 'Yemeksepeti Market ve Mahalle mağazanız Delivery Hero Partner API ile bağlanır. Sipariş geldiğinde ayrıca kabul adımı yoktur; toplama bittiğinde bulunan ve bulunamayan ürünlerle birlikte sipariş, kurye modelinize uygun durumla Yemeksepeti\'ne bildirilir.',
    tiles: [
      ['i-orders', 'Bulunamayan ürün', 'Toplarken bulamadığınız ürünü siparişten çıkarırsınız; Yemeksepeti\'ne bu satır “bulunamadı”, diğerleri “sepette” olarak gider.'],
      ['i-truck', 'Kurye modeline göre durum', 'Yemeksepeti kuryesiyle çalışan mağazada sipariş “teslim almaya hazır”, kendi kuryenizle çalışıyorsanız “yola çıktı” olarak bildirilir.'],
      ['i-store', 'Zincir ve şube', 'Tek anahtar zincirin bütün şubelerinde geçerlidir; panel bir şubeyi yönetir, diğer şubeler ek mağaza olarak eklenir.'],
      ['i-scale', 'Kilo ile satılan ürün', 'Adetle değil ağırlıkla fiyatlanan ürünlerde toplanan miktar ağırlık olarak iletilir.'],
      ['i-sync', 'Yalnız satış fiyatı', 'Yemeksepeti katalog servisi üstü çizili fiyat almaz ve stok miktarı döndürmez; panel kendi stoğunu ve satış fiyatını gönderir.'],
    ],
    setup: [
      ['Mağaza Entegrasyonları', 'Yemeksepeti Partner Portal → Mağaza Entegrasyonları (Shop Integrations) eklentisinden client_id ve client_secret oluşturun.'],
      ['Zincir ve mağaza kodu', 'Zincir (chain) ve mağaza (vendor) kimliğinizi aynı ekrandan ya da hesap yöneticinizden alın.'],
      ['Panele girin', 'Dört bilgiyi Yemeksepeti Market kartına yazın; erişim belirteci süresi dolmadan kendiliğinden yenilenir.'],
    ],
    faq: [
      ['Ne kadar eski Yemeksepeti siparişini görebilirim?', 'Servis siparişleri oluşturulma zamanına göre ve en fazla 60 gün geriye verir. Hızlı market siparişi saatler içinde kapandığı için panel her senkronda en az son iki günü yeniden okur.'],
      ['Yemeksepeti\'nde kampanya ve şube açma-kapama panelden yapılır mı?', 'Hayır. Kampanyalar, ürün ekleme ve şubeyi açıp kapatma Yemeksepeti tarafında kalır; panel sipariş, stok ve fiyatı yönetir.'],
      ['Müşteri istediği adetten azını alırsa ne görünür?', 'Siz işleyene kadar müşterinin istediği adet ve tutar, işledikten sonra karşılanan adet ve tutar siparişte görünür.'],
    ],
    cta: ['Yemeksepeti Market toplamalarınızı hızlandırın', 'Bulunamayan ürün ve kurye bildirimi tek dokunuşla. Ücretsiz deneme bir hafta sürer.'],
  },

  ebay: {
    title: 'eBay Entegrasyonu: Pazar Yeri, İlan ve Döviz | Hastürk CRM',
    desc: 'eBay pazar yerinize Fulfillment ve Inventory API ile bağlanın: siparişler TL\'ye çevrilir, stok ve fiyat 25\'erli gider, varyantlar ayrı ilan olarak açılır.',
    lead: 'eBay bağlantısı Fulfillment ve Inventory API\'lerini kullanır ve ABD, İngiltere, Almanya gibi hangi eBay pazar yerinde satıyorsanız onun için kurulur. Siparişler TL\'ye çevrilerek kaydedilir, takip numarası eBay\'e iletilir; yurt dışı pazaryerleri Kurumsal pakette yer alır.',
    tiles: [
      ['i-list', 'Inventory API ilanları', 'Yalnız Inventory API ile açılmış ya da bu sisteme taşınmış ilanlar görünür. Seller Hub veya Trading API ile açılan eski ilanlar listelenmez.'],
      ['i-sync', 'Yirmi beşerli güncelleme', 'Stok ve fiyat çağrı başına en fazla 25 SKU ile gönderilir; eBay her satır için ayrı sonuç döndürür, yalnız reddedilen ilan yeniden denenir.'],
      ['i-globe', 'Pazar yerinin para birimi', 'Ürün yüklerken panel fiyatınız seçili pazar yerinin para birimine TCMB döviz alış kuruyla çevrilir.'],
      ['i-up', 'Politikalar ve konum', 'Ürün yüklemek için eBay\'deki kargo, ödeme ve iade politikalarınız ile envanter konumunuz gerekir; tek kayıt varsa o kullanılır.'],
      ['i-box', 'Her varyant ayrı ilan', 'Panelden yüklenen varyantlı üründe her varyant kendi adıyla ayrı ilan olarak açılır; varyant özelliği ilanın özelliklerine yazılır.'],
    ],
    setup: [
      ['Geliştirici hesabı', 'developer.ebay.com\'da ücretsiz geliştirici hesabı açın; Application Keys sayfasında Production anahtar setindeki App ID ve Cert ID\'yi alın.'],
      ['Kullanıcı belirteci', 'Aynı ekranda User Tokens → “Get a Token from eBay via Your Application” ile satıcı hesabınızla oturum açıp sell.fulfillment ve sell.inventory izinlerini verin.'],
      ['Pazar yeri', 'v^1.1# ile başlayan refresh token\'ı ve satış yaptığınız eBay pazar yerini panele girip bağlantıyı test edin.'],
    ],
    faq: [
      ['eBay refresh token ne kadar geçerli?', 'Yaklaşık 18 ay. eBay yenileme sırasında yeni token vermediği için süre dolmadan aynı adımlarla yeni token alıp panele girmeniz gerekir.'],
      ['Alıcının adresi neden bir süre sonra görünmüyor?', 'eBay alıcı adı, telefonu ve adresini 90 gün, e-postasını 14 gün sonra vermez. Panel kayıtlı siparişteki bilgiyi korur.'],
      ['Türk kargo firmalarının eBay kodu var mı?', 'eBay belgelerinde Türk kargo firmalarının taşıyıcı kodu bulunmuyor; eşleşmeyen firma “Other” olarak, takip numarasıyla birlikte gönderilir.'],
      ['Ne kadar eski eBay siparişi aktarılabilir?', 'eBay en fazla iki yıllık sipariş geçmişi verir; geçmiş aktarım bu süre içinde oluşturulma tarihine göre yapılır.'],
    ],
    cta: ['eBay pazar yerinizi Türkiye\'deki kanallarınızla birleştirin', 'Kurumsal pakette yurt dışı satış ve döviz fiyatı birlikte. 7 gün ücretsiz.'],
  },

  ozon: {
    title: 'Ozon Entegrasyonu: FBS, rFBS ve Ozon Etiketi | Hastürk CRM',
    desc: 'Ozon Seller API ile FBS gönderilerini “Topla” deyip Ozon etiketiyle hazırlayın, rFBS\'de takip numarası bildirin; depo bazında stok ve saatlik fiyat sınırı.',
    lead: 'Ozon\'da her gönderi (posting) panelde ayrı bir sipariştir. Ozon lojistiğiyle giden FBS gönderisini panelden toplarsınız ve Ozon\'un PDF etiketini basarsınız; kendi gönderdiğiniz rFBS siparişinde takip numarası Ozon\'a yazılır. Yurt dışı pazaryerleri Kurumsal paketin parçasıdır.',
    tiles: [
      ['i-tag', 'Topla ve etiket', 'Panelden “Topla” dediğinizde gönderi Ozon\'da teslime hazır duruma geçer; PDF etiket 45–60 saniye içinde hazırlanır, hazır değilse panel beklemenizi söyler.'],
      ['i-truck', 'FBS ve rFBS ayrımı', 'FBS\'de kurye Ozon\'undur ve alıcı adresi verilmez; rFBS\'de adres gelir, takip numarası girildiğinde gönderi “teslimatta” yapılır.'],
      ['i-store', 'Depo bazında stok', 'Stok seçtiğiniz FBS / rFBS deposuna yazılır. Aynı ürün-depo çifti iki dakikada bir güncellenebilir.'],
      ['i-tag', 'Fiyat ve eski fiyat', 'Liste fiyatı satış fiyatından yüksekse üstü çizili eski fiyat olarak gider. Ozon bir ürünün fiyatını saatte en çok 10 kez değiştirmeye izin verir.'],
      ['i-up', 'Gerçek paket ölçüsü', 'Ürün yüklerken paket ölçüleri ve ağırlığı gerçek değer olmalıdır; panel bunları desiden türetmez. Görseller yalnız JPG ya da PNG kabul edilir.'],
    ],
    setup: [
      ['Seller API', 'seller.ozon.ru → Ayarlar → Seller API sayfasında Client ID\'yi kopyalayın.'],
      ['Anahtar ve rol', 'Aynı sayfada Admin rolünde (ya da en az FBS siparişleri, ürünler, fiyat ve stok rolleriyle) bir API anahtarı oluşturun; anahtar yalnız bir kez gösterilir.'],
      ['Depo seçimi', 'Hesabınızda birden fazla FBS deposu varsa stokların yazılacağı deponun numarasını girin; tek depoda bu alan boş kalabilir.'],
    ],
    faq: [
      ['Ozon kategori ve özellikleri hangi dilde görünür?', 'İstekler Türkçe yapılır. Ozon\'un çevirisi olmayan kategori ya da değer Rusça göründüğü gibi listelenir; değer kimliği dilden bağımsızdır.'],
      ['Ozon\'da aynı modelin ürünleri nasıl tek kartta birleşir?', 'Ozon aynı model adını alan ürünleri tek kartta toplar. Panel bu alana ürünün varyant grup kodunu yazar.'],
      ['Ozon siparişlerinin tutarı nasıl raporlanır?', 'Tutar Ozon hesabınızın para birimiyle gelir ve sipariş kaydedilirken TCMB döviz alış kuruyla TL\'ye çevrilir; asıl tutar siparişte saklanır.'],
    ],
    cta: ['Ozon FBS gönderilerinizi panelden toplayın', 'Ozon etiketi ve depo stoğu tek ekranda. Kurumsal pakette 7 gün ücretsiz deneyin.'],
  },

  ticimax: {
    title: 'Ticimax Entegrasyonu: WS Yetki Kodu ile | Hastürk CRM',
    desc: 'Ticimax sitenizi WS Yetki Koduyla bağlayın: varyasyon bazında stok ve fiyat, kargoya verildi bildirimiyle müşteriye takip e-postası, yarım siparişler hariç.',
    lead: 'Ticimax altyapılı siteniz, mağazanızın kendi alan adındaki SOAP servisleriyle ve Ticimax panelinde ürettiğiniz WS Yetki Koduyla bağlanır. Siparişler kalemleriyle gelir; her varyasyonun stoğu ve fiyatı ayrı yazılır, kargoya verdiğinizde Ticimax müşterinize takip e-postası gönderir.',
    tiles: [
      ['i-box', 'Varyasyon bazında', 'Ticimax\'taki her varyasyon panelde ayrı ilan olur; siparişteki ürün numarası varyasyon numarasıyla aynı olduğu için eşleşme doğrudandır.'],
      ['i-sync', 'Yüzerli stok güncellemesi', 'Stok adedi toplu güncellemeyle, 100 varyasyonluk parçalar halinde gönderilir ve yanıt satır satır denetlenir.'],
      ['i-tag', 'Satış ve indirimli fiyat', 'Liste fiyatınız satış fiyatına, daha düşük satış fiyatınız indirimli fiyata yazılır; fiyatlar KDV dahildir. Yalnız işaretlenen alanlar değiştiği için diğer varyasyon ayarlarınız korunur.'],
      ['i-mail', 'Müşteriye takip e-postası', 'Kargoya verildi durumu, takip numarası ve takip bağlantısıyla Ticimax\'a yazılır; Ticimax müşterinize e-posta gönderir.'],
      ['i-cart', 'Ön siparişler alınmaz', 'Tamamlanmamış sepet ya da ödeme aşamasında kalan ön siparişler panele gelmez.'],
    ],
    setup: [
      ['Yetki kodu oluşturun', 'Ticimax yönetim paneli → Ayarlar → WS Yetki Kodu Yönetimi bölümünde yeni bir kod oluşturun.'],
      ['Metotları işaretleyin', 'Yetki tablosunda SelectSiparis, SetSiparisDurum, SelectUrun, StokAdediGuncelle ve VaryasyonGuncelle metotlarını seçip kaydedin.'],
      ['Alan adı ve kod', 'Mağazanızın alan adını (ör. www.magazaniz.com) ve kodu panele girin.'],
    ],
    faq: [
      ['Yetki kodum yanlışsa nasıl anlarım?', 'Ticimax geçersiz ya da yetkisiz kodda hata vermez, boş liste döndürür. Panelin bağlantı testi bu durumu ayrıca kontrol eder ve eksik yetkiyi söyler.'],
      ['Kargo firmasını panelden değiştirebilir miyim?', 'Ticimax\'ta kargo firması sayısal firma numarasıyla seçildiği için panelden değiştirilmez; firma adı takip bağlantısına yansır.'],
      ['Ticimax\'ta panelden ürün açabilir miyim?', 'Bu bağlantıda ürün oluşturma, iade talebi ve soru-cevap yoktur; ürünlerinizi Ticimax\'ta açarsınız, stok ve fiyatı panel yönetir.'],
    ],
    cta: ['Ticimax sitenizi pazaryerlerinizle eşitleyin', 'Varyasyon stoğu ve kargo e-postası otomatik. 7 gün ücretsiz deneme.'],
  },

  ideasoft: {
    title: 'IdeaSoft Entegrasyonu: OAuth ve Admin API | Hastürk CRM',
    desc: 'IdeaSoft Admin API\'ye OAuth ile bağlanın: varyantlar ayrı ilan, KDV hariç fiyatlı ürünlerde doğru tutar, kargo kodu siparişe yazılır; token kendini yeniler.',
    lead: 'IdeaSoft siteniz Admin API\'ye OAuth yetkisiyle bağlanır. Panel yalnız refresh token\'ı ister, erişim belirtecini kendisi alır ve her yenilemede gelen yeni token\'ı saklar. Siparişler kalemleri ve adresleriyle gelir, varyantların stok ve fiyatı tek tek güncellenir.',
    tiles: [
      ['i-key', 'Kendini yenileyen yetki', 'IdeaSoft refresh token\'ı her kullanımda yeniler ve eskisini geçersiz kılar; panel yenisini saklayıp bir sonraki seferde onu kullanır.'],
      ['i-box', 'Varyant ayrı kayıt', 'IdeaSoft\'ta varyantlar ana ürüne bağlı ayrı kayıtlardır. Varyantı olan ana ürün satılmadığı için ilan olarak alınmaz.'],
      ['i-calc', 'KDV hariç fiyatlı ürün', 'Ürün fiyatları KDV hariç tutuluyorsa panel KDV dahil fiyatınızdan vergiyi düşerek yazar; bunun için ürün önce okunur.'],
      ['i-truck', 'Fulfilled ve takip kodu', 'Kargoya verdiğinizde sipariş durumu ve kargo takip kodu IdeaSoft\'a yazılır; müşteri bildirimi IdeaSoft ayarlarınıza göre gider.'],
      ['i-cart', 'Başarısız ödeme alınmaz', 'Silinmiş siparişler ve yarım kalmış kart ödemeleri panele gelmez.'],
    ],
    setup: [
      ['Uygulama ekleyin', 'IdeaSoft paneli → Entegrasyonlar → API → Ekle ile Client ID ve Client Secret üretin, yönlendirme adresini girin.'],
      ['İzin verin', 'Yetki ekranında izin verdiğinizde dönen kod 30 saniye içinde token\'a çevrilmelidir; bu adımı kurulumda birlikte yapıyoruz.'],
      ['Mağaza adresi', 'magaza.myideasoft.com ya da kendi alan adınızı, Client ID, Client Secret ve refresh token\'la birlikte panele girin.'],
    ],
    faq: [
      ['Bağlantı bir gün kendiliğinden kopar mı?', 'Refresh token iki ay hiç kullanılmazsa geçersiz olur ve yeniden izin vermek gerekir. Panel düzenli senkron yaptığı sürece token yenilenmeye devam eder.'],
      ['Panelde başka bir refresh token girersem hangisi kullanılır?', 'Yeni girdiğiniz token, saklananın önüne geçer; panel bundan sonra onu yenileyerek devam eder.'],
      ['IdeaSoft\'ta toplu stok güncellemesi var mı?', 'IdeaSoft\'ta toplu ürün güncelleme ucu yoktur; panel ürünleri tek tek günceller ve yalnız hata alan ilanı yeniden dener.'],
    ],
    cta: ['IdeaSoft mağazanızı pazaryerlerinizle buluşturun', 'Token yenileme ve KDV hesabı panelde. İlk hafta ücretsiz.'],
  },

  tsoft: {
    title: 'T-Soft Entegrasyonu: Web Servis Kullanıcısı | Hastürk CRM',
    desc: 'T-Soft REST1 servisine yetkili web servis kullanıcısıyla bağlanın: KDV hariç fiyat doğru yazılır, alt ürün stoğu ayrı gider, kargo koduyla Kargoya Verildi.',
    lead: 'T-Soft siteniz mağazanızın kendi alan adındaki REST1 servisiyle ve bu iş için açtığınız web servis kullanıcısıyla bağlanır. T-Soft fiyatları KDV hariç tuttuğu için panel vergiyi düşerek yazar; alt ürünlerin stoğu ayrı gönderilir, sipariş kargo koduyla kapatılır.',
    tiles: [
      ['i-calc', 'KDV hariç fiyat', 'Paneldeki KDV dahil fiyat, ürünün KDV oranı düşülerek yazılır; oran bilinmiyorsa önce ilan okunur.'],
      ['i-box', 'Ana ürün ve alt ürün', 'Alt ürünler (varyantlar) kendi kodlarıyla ayrı ilan olur; varyantlı ana ürün ilan olarak alınmaz, varyantsız ürünün stoğu doğrudan ürüne yazılır.'],
      ['i-truck', 'Kargo kodu', 'Sipariş “Kargoya Verildi” yapılırken ayarlardaki T-Soft kargo kodu, yoksa siparişte seçili kargonun kodu takip numarasıyla gönderilir.'],
      ['i-clock', 'Son yedi günün siparişleri', 'T-Soft güncellenme süzgecini belgelemediği için panel son yedi günde oluşturulan siparişleri okur, güncellenme zamanı varsa ona göre süzer.'],
      ['i-key', 'Oturum kendini yeniler', 'Giriş belirteci saklanır; süresi dolduğunda ya da servis belirteç hatası verdiğinde panel bir kez yeniden giriş yapar.'],
    ],
    setup: [
      ['Web servis kullanıcısı', 'T-Soft paneli → Ayarlar → Kullanıcı Yönetimi → Web Servis Kullanıcıları → Yeni kullanıcı oluşturun.'],
      ['Metot yetkileri', 'Sipariş ve ürün metotlarına yetki verin; isterseniz IP kısıtı ekleyin ya da panel girişini kapatan “Sınırlı Hesap” seçeneğini kullanın.'],
      ['Panele girin', 'Alan adınızı, kullanıcı adını ve şifreyi panele yazın. Metotları dilerseniz https://alanadiniz/rest1/console adresinden deneyebilirsiniz.'],
    ],
    faq: [
      ['Sipariş durumlarım farklı adlandırılmışsa?', 'T-Soft\'ta durum adları mağazaya göre değişebildiği için panel durumu addan tanır; varsayılan adlar ve yaygın özel adlar karşılanır.'],
      ['Kapıda ödemeli T-Soft siparişleri nasıl ayrılır?', 'Ödeme tipi adı “Kapıda Ödeme” ya da “Kapıda Kredi Kartı” olan siparişler işaretlenir; kargo firması entegrasyonlarıyla tahsilatlı gönderi açılmaz.'],
      ['T-Soft\'ta ürün oluşturabilir miyim?', 'Hayır; bu bağlantıda ürün oluşturma, iade talebi ve soru-cevap yer almıyor. Ürünü T-Soft\'ta açarsınız, eşleşme kodla yapılır.'],
    ],
    cta: ['T-Soft sitenizin stok ve siparişlerini tek panele taşıyın', 'KDV hesabı ve kargo kodu sizin yerinize. 7 gün ücretsiz deneyin.'],
  },
};

// Kargo firması / entegratör sayfaları (/entegrasyonlar/<slug>): kendi anlaşmanızla gönderi. Ortak akış panel/src/carriers.js'ten
// (gönderi → takip no + etiket pakete, "Kargoya ver" kanala bildirir, durum düzenli sorgulanır, kapıda ödemeli gönderi açılmaz);
// her sayfa bu akışı firmanın kendi yöntemiyle anlatır (panel/src/carriers/<firma>.js).
export const CARRIER_PAGES = {
  'yurtici-kargo': {
    title: 'Yurtiçi Kargo Entegrasyonu: Kargo Anahtarı | Hastürk CRM',
    desc: 'Yurtiçi Kargo web servisine kargo anahtarıyla veri gönderin, barkodlu etiketi basın; şube okutunca gönderi kodu, takip adresi ve kargo ücreti siparişe yazılsın.',
    lead: 'Yurtiçi Kargo bağlantısı bir “veri gönderimi”dir: panel siparişiniz için bir kargo anahtarı üretip Yurtiçi\'ne bildirir ve bu anahtarı etikete barkod olarak basar. Paket şubede okutulunca Yurtiçi gönderi kodunu ve takip adresini verir, panel bunları takip sorgusuyla pakete yazar.',
    tiles: [
      ['i-tag', 'Kargo anahtarı barkodu', 'Anahtar, kanal kısaltması ile sipariş ve paket numarasından oluşur (en fazla 20 karakter). Etiketi termal ya da normal yazıcıdan basarsınız.'],
      ['i-eye', 'Şube kabulünden sonra kod', 'Yurtiçi gönderi kodu ancak paket şubede okutulduktan sonra oluşur; o ana kadar takip için kargo anahtarı kullanılır.'],
      ['i-calc', 'Toplam kargo ücreti', 'Yurtiçi\'nin bildirdiği toplam ücret siparişin kargo giderine yazılır, sipariş kârı tahmini değil gerçek ücretle çıkar.'],
      ['i-sync', 'Kopan isteğe karşı', 'Yanıtı kaybolan bir istek tekrarlandığında Yurtiçi “zaten var” der ve aynı gönderi kullanılır; iptal edilmiş gönderi yerine yeni anahtarla tek bir yeni kayıt açılır.'],
      ['i-orders', 'İade dönüşü', 'Yurtiçi\'nin iade ve ret durumları okunur; müşteriye ulaşmayıp size dönen paket siparişte iade olarak işaretlenir.'],
    ],
    setup: [
      ['Şubeden kullanıcı', 'Yurtiçi Kargo şubenizden gönderici ödemeli web servis kullanıcı adı ve şifresi isteyin; ödeme tipi kullanıcıya bağlıdır.'],
      ['Panele girin', 'Bilgileri Entegrasyonlar → Kargo entegrasyonları → Yurtiçi Kargo kartına yazın; bağlantı kaydederken test edilir.'],
      ['Etiketi alın', 'Siparişte “Kargo firmasından etiket al” dediğinizde anahtar Yurtiçi\'ne gider ve barkodlu etiket hazırlanır.'],
    ],
    faq: [
      ['Yurtiçi\'nde iptal ettiğim gönderi panelde nasıl görünür?', 'Yurtiçi iptal edilen gönderiyi kayıtlarından siler; panel “kayıt yok” yanıtını iptal olarak işler ve paketi yeniden gönderilebilir hale getirir.'],
      ['Alıcı ödemeli gönderi açabilir miyim?', 'Bağlantı, şubenin verdiği kullanıcının ödeme tipiyle çalışır; panel kurulumda gönderici ödemeli kullanıcı ister. Kapıda ödemeli (tahsilatlı) gönderi bu bağlantıyla açılmaz.'],
      ['Takip numarası satış kanalına ne zaman gider?', 'Yurtiçi paketi teslim aldığında panel “Kargoya ver” adımını kendisi yapar ve kanal destekliyorsa takip bilgisini iletir; isterseniz bu otomatiği Ayarlar\'dan kapatırsınız.'],
    ],
    cta: ['Yurtiçi Kargo gönderilerinizi panelden açın', 'Kargo anahtarı, gönderi kodu ve ücret tek ekranda. Kurumsal pakette, 7 gün ücretsiz.'],
  },

  'aras-kargo': {
    title: 'Aras Kargo Entegrasyonu: Barkod Yetkisi ve ZPL | Hastürk CRM',
    desc: 'Aras Kargo ile kendi anlaşmanızdan gönderi açın; barkod yetkili hesapta Aras ZPL etiketi ve 13 haneli takip numarası anında gelir, durum ve ücret esasweb\'den.',
    lead: 'Aras Kargo\'da gönderi, panelin ürettiği entegrasyon koduyla Aras\'a kaydedilir ve şubenin okutacağı parça barkodu etikete basılır. Hesabınızda barkod yetkisi varsa Aras\'ın kendi etiketi ve takip numarası gönderiyle aynı anda gelir; kargo durumu ve ücreti ayrı bir takip servisinden okunur.',
    tiles: [
      ['i-tag', 'Barkod yetkili hesap', 'Barkod yetkisi olan hesapta Aras etiketi termal yazıcı için ZPL olarak ve 13 haneli takip numarasıyla gelir. Şube kodu belirlenirken birkaç saniyelik “hazır değil” yanıtı beklenir.'],
      ['i-orders', 'Yetkisiz hesapta parça barkodu', 'Barkod yetkisi yoksa panel etiketi Aras\'a bildirilen parça barkoduyla basar; şube bu barkodu okutur.'],
      ['i-eye', 'esasweb takip servisi', 'Kargo durumu ve ücreti, Aras kurumsal panelinde (esasweb) açılan XML servis kullanıcısı ve müşteri kodunuzla okunur. Bu bilgiler girilmezse gönderi açılır ama durum takibi yapılmaz.'],
      ['i-x', 'İrsaliyeden önce iptal', 'İrsaliyesi kesilmemiş gönderiyi panelden iptal edersiniz; irsaliye kesildikten sonra iptal Aras şubesinden yapılır.'],
      ['i-key', 'Entegrasyon kodu', 'Her paket için en fazla 32 karakterlik, büyük harfli bir entegrasyon kodu üretilir; aynı paket için ikinci kayıt açılmaz.'],
    ],
    setup: [
      ['Sevkiyat kullanıcısı', 'Aras Kargo şubenizden ya da entegrasyon ekibinden sevkiyat entegrasyonu kullanıcı adı ve şifresi alın.'],
      ['Takip kullanıcısı', 'Durum takibi için Aras kurumsal panelinde (esasweb) XML servis kullanıcısı açın ve müşteri kodunuzu not edin.'],
      ['İki bilgiyi birlikte girin', 'Sevkiyat ve takip bilgilerini Aras Kargo kartına yazın; panel kullanıcı adı ile şifreyi var olmayan bir siparişin etiketini isteyerek dener.'],
    ],
    faq: [
      ['Barkod yetkim olup olmadığını nasıl anlarım?', 'İlk gönderide Aras etiketi ve 13 haneli numara geliyorsa yetkiniz vardır. Gelmiyorsa panel kendi etiketini parça barkoduyla basar; yetkiyi Aras şubenizden isteyebilirsiniz.'],
      ['Aras kargo ücreti siparişe nasıl yazılır?', 'esasweb takip servisi bağlıysa Aras\'ın bildirdiği ücret düzenli sorgularda okunur ve siparişin kargo giderine işlenir.'],
      ['Aras ile tahsilatlı gönderi yapılır mı?', 'Hayır; bu bağlantı kapıda ödemeli gönderi açmaz. Panel kapıda ödemeli siparişte Aras\'a gitmeden önce uyarır.'],
    ],
    cta: ['Aras Kargo etiketini panelden yazdırın', 'Barkod yetkili hesapta Aras ZPL etiketi anında gelir. Kurumsal pakette, ilk hafta ücretsiz.'],
  },

  'ptt-kargo': {
    title: 'PTT Kargo Entegrasyonu: Barkod Aralığıyla | Hastürk CRM',
    desc: 'PTT Kargo kurumsal web servisine gönderi verisi yükleyin; size ayrılan barkod aralığından sıradaki numara kontrol hanesiyle etikete basılır, takip şubeden.',
    lead: 'PTT Kargo barkod üretmez; kurumsal müşterisine bir barkod aralığı verir. Panel bu aralıktan sıradaki 12 haneyi alır, PTT\'nin kontrol hanesini ekleyip 13 haneli barkodu etikete basar ve gönderi verisini PTT\'ye yükler. Paket şubede okutulunca gönderi kabul edilir.',
    tiles: [
      ['i-tag', 'Kontrol haneli barkod', 'On iki hanelik numaraya PTT\'nin ağırlıklı toplam kuralıyla kontrol hanesi eklenir; etikette 13 haneli PTT barkodu yer alır.'],
      ['i-lock', 'Çakışmayan sıra', 'Sıra sayacı panelde atomik olarak tutulur; aynı anda açılan iki gönderi asla aynı barkodu almaz.'],
      ['i-eye', 'Kabulden sonra takip', 'PTT takip servisi ancak şube kabulünden sonra veri döner; panel kargo durumunu bu andan itibaren sorgular. Teslim ve iade durumları PTT\'nin büyük harfli metinlerinden okunur.'],
      ['i-x', 'Kabulden önce silme', 'Şubeye verilmemiş gönderinin verisi panelden silinir; şube kabul ettikten sonra silme yapılamaz.'],
    ],
    setup: [
      ['Bölge müdürlüğü', 'PTT Kargo bölge müdürlüğünüzden müşteri numaranızı ve web servis şifrenizi alın.'],
      ['Barkod aralığı', 'Size ayrılan barkod aralığının 12 haneli başlangıç ve bitiş numarasını isteyin; sayaç bu aralıkta ilerler.'],
      ['Kartı doldurun', 'Bilgileri PTT Kargo kartına girin; panel kimliği var olmayan bir barkodun etiketini isteyerek dener.'],
    ],
    faq: [
      ['Barkod aralığım biterse ne olur?', 'Aralığın sonuna gelindiğinde yeni gönderi açılmaz; PTT\'den yeni bir aralık alıp başlangıç ve bitiş numaralarını güncellemeniz gerekir.'],
      ['PTT gönderisinin takip numarası nedir?', 'Etikete basılan 13 haneli barkod takip numarasıdır; kanala da bu numara bildirilir.'],
      ['Kargoya verdiğim PTT paketi neden hâlâ “oluşturuldu” görünüyor?', 'Şube paketi okutmadıkça PTT takip servisi bilgi vermez. Okutma sonrası ilk sorguda durum güncellenir.'],
    ],
    cta: ['PTT Kargo barkodlarınızı elle takip etmeyin', 'Barkod sırası, etiket ve takip panelde. Kurumsal pakette 7 gün ücretsiz.'],
  },

  'ups-kargo': {
    title: 'UPS Kargo Entegrasyonu: Yurt İçi Servis Seçimi | Hastürk CRM',
    desc: 'UPS Türkiye ile yurt içi gönderiyi Standart, Express Saver ya da Express 10:30 servisiyle açın; 1Z takip numarası ve paket başına etiket görseli hemen gelir.',
    lead: 'UPS Türkiye web servisinde gönderi tek adımda açılır: 1Z ile başlayan takip numarası ve her paketin etiket görseli aynı yanıtta gelir. Alıcının ili plaka koduyla, ilçesi UPS\'in bölge koduyla gönderilir; teslimat ve ücret ayrı sorgu servisinden izlenir.',
    tiles: [
      ['i-tag', 'Paket başına etiket', 'Her paket için UPS\'in hazırladığı etiket görseli gelir; yazdırıp kolinin üzerine yapıştırırsınız.'],
      ['i-truck', 'Servis türü', 'Standart, Express Saver ya da Express 10:30 servislerinden anlaşmanızın kapsadığını seçersiniz.'],
      ['i-pin', 'UPS bölge kodları', 'İl ve ilçe adları panelde UPS\'in plaka ve bölge kodlarına çevrilir; adres kodu yanlış gitmez.'],
      ['i-calc', 'Ücret sonradan okunur', 'UPS\'in hesapladığı kargo ücreti gönderiden sonra paket bilgisinde görünür ve siparişin kargo giderine yazılır.'],
      ['i-key', 'Oturum yenileme', 'UPS oturumu düşerse panel bir kez yeniden giriş yapıp isteği tekrarlar.'],
    ],
    setup: [
      ['Satış temsilcisi', 'UPS Türkiye satış temsilcinizden müşteri numarası ile web servis kullanıcı adı ve şifresini isteyin.'],
      ['Takip kullanıcısı', 'Takip için ayrı bir kullanıcı verildiyse onu da not edin; sorgu servisi bu bilgilerle çalışır.'],
      ['Panelde test', 'Bilgileri UPS Kargo kartına girin. UPS\'in test ortamı olmadığı için deneme gönderisi açılırsa hemen iptal edilir.'],
    ],
    faq: [
      ['UPS ile yurt dışına gönderi açabilir miyim?', 'Bu bağlantı UPS Türkiye\'nin yurt içi gönderileri içindir; uluslararası gönderi açmaz.'],
      ['UPS hatası neden anlaşılır biçimde görünüyor?', 'UPS hataları sistem hatası olarak değil hata kodu ve açıklamasıyla döner; panel bu açıklamayı olduğu gibi gösterir.'],
      ['Gönderiyi iptal edebilir miyim?', 'Evet, UPS gönderisi panelden iptal edilir ve paket yeniden gönderilebilir hale gelir.'],
    ],
    cta: ['UPS gönderilerinizi siparişin içinden açın', 'Takip numarası ve etiket saniyeler içinde. Kurumsal pakette bir hafta ücretsiz deneyin.'],
  },

  hepsijet: {
    title: 'HepsiJET Entegrasyonu: Aynı Gün ve XDock | Hastürk CRM',
    desc: 'HepsiJET ile kendi anlaşmanızdan gönderi açın: ZPL etiket aynı yanıtta gelir; standart, ertesi gün ya da aynı gün teslimat, çıkış deposu kodu bir kez girilir.',
    lead: 'HepsiJET bağlantısında gönderi tek istekte açılır ve termal yazıcıya uygun ZPL etiket aynı yanıtta gelir. Gönderi numarasını firma kodunuzla panel üretir; bu numara aynı zamanda takip numarasıdır. Gönderiler HepsiJET\'in size tanımladığı çıkış deposundan yola çıkar.',
    tiles: [
      ['i-tag', 'Tek istekte etiket', 'Gönderi açılır açılmaz HepsiJET etiketi ZPL olarak pakete yazılır; ayrı bir etiket isteği gerekmez.'],
      ['i-truck', 'Teslimat hızı', 'Anlaşmanıza göre standart, ertesi gün ya da aynı gün teslimat türünü seçersiniz.'],
      ['i-store', 'XDock çıkış deposu', 'HepsiJET\'in tanımladığı çıkış deposunun (XDock) kodu bağlantıda bir kez girilir, her gönderi oradan çıkar.'],
      ['i-key', 'Firma kodlu numara', 'Gönderi numarası firma kodunuz ve benzersiz rakamlardan oluşur, en fazla 16 karakterdir.'],
      ['i-pin', 'Adla adres eşleşmesi', 'HepsiJET il, ilçe ve mahalleyi kodla değil adla eşleştirir; siparişteki adres bu yüzden olduğu gibi gönderilir.'],
    ],
    setup: [
      ['Kurumsal satış ekibi', 'HepsiJET kurumsal satış ekibinden entegrasyon kullanıcı adı, şifre ve firma kodunu isteyin.'],
      ['Depo kodu', 'Size tanımlanan çıkış deposunun (XDock) kodunu da alın.'],
      ['Bağlantı', 'Dört bilgiyi HepsiJET kartına girin; panel 60 dakika geçerli oturum belirtecini gerektikçe yeniler.'],
    ],
    faq: [
      ['Hepsiburada siparişlerim için bu bağlantı gerekir mi?', 'Gerekmez. Hepsiburada\'nın anlaşmalı HepsiJET gönderisinde barkod Hepsiburada\'dan gelir; bu bağlantı kendi HepsiJET anlaşmanızla gönderdiğiniz siparişler içindir.'],
      ['HepsiJET hatası nasıl bildirilir?', 'HepsiJET bazı hataları başarılı yanıtın içinde “FAIL” olarak döner; panel bunları da hata sayar ve mesajı gösterir.'],
      ['HepsiJET gönderisi iptal edilebilir mi?', 'Evet; iptal panelden HepsiJET\'e iletilir ve paket yeniden gönderime açılır.'],
    ],
    cta: ['HepsiJET ile aynı gün teslimatı panelden başlatın', 'Etiket, takip ve teslimat türü tek ekranda. Kurumsal pakette 7 gün ücretsiz.'],
  },

  'dhl-ecommerce': {
    title: 'DHL eCommerce (MNG Kargo) Entegrasyonu | Hastürk CRM',
    desc: 'DHL eCommerce (eski MNG Kargo) ile iki adımda gönderi açın: sipariş kaydı ve barkod. Varış şubesi belli olmazsa etiket sonra gelir; kesin ücret takipte okunur.',
    lead: 'DHL eCommerce, eski adıyla MNG Kargo, iki ayrı kimlik ister: geliştirici portalındaki uygulama anahtarları ve şubenizin verdiği müşteri numarası. Gönderi önce sipariş kaydı olarak açılır, ardından gönderi numarası ve ZPL etiket alınır; alıcının il ve ilçesi DHL\'in kendi kodlarıyla gönderilir.',
    tiles: [
      ['i-tag', 'Sipariş kaydı ve barkod', 'Gönderi iki adımda açılır: önce sipariş kaydı, sonra gönderi numarası ile termal yazıcıya uygun etiket.'],
      ['i-clock', 'Varış şubesi gecikirse', 'Varış şubesi o an belirlenemezse panel kısa bir süre bekleyip yeniden dener; yine olmazsa etiket hazır olunca kendisi alır.'],
      ['i-calc', 'Kesinleşen ücret', 'DHL\'in gönderi için hesapladığı KDV dahil toplam takip sorgusunda okunur ve siparişin kargo giderine yazılır.'],
      ['i-x', 'Kayıt ve barkod birlikte iptal', 'Panelden iptal ettiğinizde DHL\'deki sipariş kaydı ve barkod birlikte iptal edilir; aynı paket yeni referansla yeniden açılabilir.'],
      ['i-key', 'ASCII referans', 'DHL küçük harf ve Türkçe karakter kabul etmediği için referans büyük harf ve rakamlardan oluşturulur.'],
    ],
    setup: [
      ['Geliştirici portalı', 'DHL eCommerce geliştirici portalında bir uygulama açın; Client ID ve Client Secret bu uygulamaya aittir.'],
      ['Müşteri bilgileri', 'Şubenizden müşteri numaranızı ve şifrenizi alın; gönderi işlemleri bu bilgilerle yetkilendirilir.'],
      ['Panele girin', 'Dört bilgiyi DHL eCommerce kartına yazın ve bağlantıyı test edin.'],
    ],
    faq: [
      ['MNG Kargo hesabım DHL eCommerce bağlantısıyla çalışır mı?', 'Evet. MNG Kargo artık DHL eCommerce adını taşıyor; müşteri numaranız ve şifreniz bu bağlantıda kullanılır.'],
      ['Yanıtı gelmeyen gönderi iki kez açılır mı?', 'Hayır. Aynı referansla kayıt zaten varsa panel etiket adımına geçer; kayıt iptal edilmişse yeni referansla bir kez yeniden açar.'],
      ['Alıcı adresindeki ilçe DHL\'de farklı yazılmışsa?', 'Panel il ve ilçeyi DHL\'in adres servisinden kodlarıyla bulur; bu servis için ayrı oturum gerekmez.'],
    ],
    cta: ['DHL eCommerce gönderilerini panelden yönetin', 'Etiket, takip ve kesin ücret siparişte. Kurumsal pakette ilk hafta ücretsiz.'],
  },

  'surat-kargo': {
    title: 'Sürat Kargo Entegrasyonu: Ön Kabul ve PDF | Hastürk CRM',
    desc: 'Sürat Kargo\'ya gönderiyi ön kabul olarak bildirin; özel takip kodunuz etikete basılır, şube okutunca Sürat takip numarası siparişe yazılır. PDF etiket seçeneği.',
    lead: 'Sürat Kargo\'da gönderi bir ön kabuldür: panel her pakete özel bir kargo takip kodu üretip Sürat\'a bildirir ve bu kodu etikete barkod olarak basar. Şube paketi okuttuğunda Sürat kendi takip numarasını verir; panel bu numarayı takip sorgusuyla pakete işler.',
    tiles: [
      ['i-tag', 'Özel takip kodu', 'Etikete basılan kod Sürat\'ta web sipariş kodu olarak görünür; yalnız harf, rakam ve tire içerir.'],
      ['i-orders', 'Sürat\'ın PDF etiketi', 'Barkod yetkisi olan hesaplarda Sürat\'ın kendi etiketini PDF olarak panelden alırsınız; bunun için e-Sürat\'ta belirlediğiniz web servis şifresi gerekir.'],
      ['i-eye', 'Şubede numara', 'Sürat takip numarası şube kabulünden sonra oluşur ve ilk takip sorgusunda pakete yazılır.'],
      ['i-x', 'Şifreyle iptal', 'Web servis şifrenizi girdiyseniz Sürat gönderisini panelden iptal edersiniz.'],
      ['i-shield', 'Güvenlik duvarı uyarısı', 'Sürat sunucuları bir güvenlik duvarının arkasında; istek engellenirse panel bunu açık bir mesajla bildirir.'],
    ],
    setup: [
      ['Cari kod', 'Sürat Kargo şubenizden cari kodunuzu ve gönderi servisi şifrenizi alın.'],
      ['e-Sürat şifresi', 'Panelden iptal ve Sürat etiketi için e-Sürat profilinizde bir web servis şifresi belirleyin.'],
      ['Kartı kaydedin', 'Bilgileri Sürat Kargo kartına girin; panel var olmayan bir siparişi sorgulayarak şifreyi doğrular.'],
    ],
    faq: [
      ['Barkod yetkim yoksa etiket nasıl basılır?', 'Panel kendi etiket tasarımına özel takip kodunuzu barkod olarak basar; Sürat şubesi bu barkodu okutur.'],
      ['Sürat takip numarası müşteriye ne zaman gider?', 'Numara şube kabulünden sonra oluşur. İnternet sitenizden gelen siparişte sonradan oluşan numara siteye de yazılır.'],
      ['Sürat ile kapıda ödemeli paket gönderebilir miyim?', 'Bu bağlantı tahsilatlı gönderi açmaz; kapıda ödemeli siparişler için Sürat\'ın kendi ekranını kullanın.'],
    ],
    cta: ['Sürat Kargo ön kabulünü panelden yapın', 'Takip numarası şubeden sonra kendiliğinden siparişte. Kurumsal pakette 7 gün ücretsiz.'],
  },

  'kolay-gelsin': {
    title: 'Kolay Gelsin Entegrasyonu: Müşteri Barkodu | Hastürk CRM',
    desc: 'Kolay Gelsin gönderisini tek istekte açın; paket sizin barkodunuzla taşınır, gönderi numarası takip numarası olur. Toplanmış pakette teslimat durdurulup iade.',
    lead: 'Kolay Gelsin (Ekol Ekspres; 2024\'ten beri Sendeo ile aynı çatı altında) paketleri müşteri barkoduyla taşımayı tercih ediyor. Panel gönderiyi alıcı bilgisiyle tek istekte açar, kendi kargo anahtarınızı parça barkodu olarak etikete basar ve Kolay Gelsin gönderi numarasını takip numarası yapar.',
    tiles: [
      ['i-tag', 'Sizin barkodunuz', 'Parça barkodu panelin ürettiği kargo anahtarıdır ve panel etiketine basılır. Kolay Gelsin\'in HTML etiketi yazdırma biçimlerine uymadığı için kullanılmaz.'],
      ['i-eye', 'Seçtiğiniz durumlar', 'Kolay Gelsin takip servisi yalnız kendi panelinizdeki “Webhook Ayarlar” sekmesinde seçtiğiniz durumları döndürür; panele gelmesini istediklerinizi orada işaretleyin.'],
      ['i-x', 'İptal ya da iade', 'Toplanmamış gönderi iptal edilir; toplanmış ama teslim edilmemiş gönderide teslimat durdurulur ve iade süreci başlar.'],
      ['i-box', 'Desiden ölçü', 'Paketin desi değeri Kolay Gelsin\'in istediği en, boy ve yükseklik ölçüsüne çevrilir.'],
    ],
    setup: [
      ['Token ve müşteri no', 'Kolay Gelsin kurumsal satış ekibinden entegrasyon token\'ı ve müşteri numaranızı alın.'],
      ['Gönderen adresi', 'Kolay Gelsin\'de kayıtlı çıkış adresinizin numarasını isteyin; gönderiler bu adresten açılır.'],
      ['Durumları seçin', 'Kolay Gelsin panelinde takip etmek istediğiniz gönderi durumlarını seçip bilgileri Hastürk CRM\'e girin.'],
    ],
    faq: [
      ['Kolay Gelsin bağlantısı neden test aşamasında?', 'Bağlantı Kolay Gelsin\'in entegrasyon dokümanına göre kuruldu; canlı gönderilerle doğrulama sürdüğü için “Test aşamasında” etiketiyle sunuluyor.'],
      ['Kolay Gelsin hataları neden başarılı yanıtta geliyor?', 'Kolay Gelsin iş kuralı hatalarını sonuç koduyla, HTTP 200 içinde döner; panel sonuç kodunu okuyup hatayı açıklamasıyla gösterir.'],
      ['Takip bağlantısı müşteriye hangi adresle gider?', 'Gönderiye özel bağlantı varsa o, yoksa Kolay Gelsin\'in herkese açık takip sayfası kullanılır.'],
    ],
    cta: ['Kolay Gelsin gönderilerinizi kendi barkodunuzla açın', 'Etiket panelden, takip numarası siparişte. Kurumsal pakette bir hafta ücretsiz.'],
  },

  sendeo: {
    title: 'Sendeo Entegrasyonu: İş Emri ve Toplama | Hastürk CRM',
    desc: 'Sendeo\'ya adresinizden toplama iş emri gönderin; ZPL etiket, takip numarası ve adresi aynı yanıtta gelir. İlçe kodu panelde bulunur; iptal toplamadan önce.',
    lead: 'Sendeo\'da gönderi bir iş emridir: paket sizin adresinizden alınıp müşterinize teslim edilir. Panelin verdiği tekil referans barkoda basılır ve Sendeo toplamada onu okutur; yanıtta Sendeo takip numarası, takip adresi ve ZPL etiket birlikte gelir.',
    tiles: [
      ['i-truck', 'Adresinizden toplama', 'İş emri “lokasyonunuzdan müşterinize” türünde açılır; kurye paketi sizden alır.'],
      ['i-tag', 'Referans barkodu', 'Panelin ürettiği tekil referans hem barkoda basılır hem iptal, takip ve etiket işlemlerinde kullanılır.'],
      ['i-pin', 'Sendeo ilçe kodu', 'İl kodu plaka numarasıdır; ilçe kodu Sendeo\'nun il-ilçe listesinden bulunur, bulunamazsa ilin merkez kaydı kullanılır.'],
      ['i-x', 'Toplamadan önce iptal', 'Yalnız “İş Emri Alındı” durumundaki, henüz toplanmamış gönderi panelden iptal edilir.'],
      ['i-calc', 'Ücret takipte', 'Sendeo\'nun takip yanıtındaki kargo ücreti siparişin kargo giderine yazılır.'],
    ],
    setup: [
      ['Canlı ortam bilgileri', 'Sendeo kurumsal satış ekibinden canlı ortam web servis müşteri adı ve şifresini alın.'],
      ['Gönderen ilçesi', 'Panel gönderen ilçenizi ayarlardaki adresten bulur; bulamazsa Sendeo\'nun verdiği ilçe kodunu gelişmiş alana yazın.'],
      ['Bağlantı', 'Bilgileri Sendeo kartına girin; oturum belirteci 20 saat geçerlidir ve panel tarafından yenilenir.'],
    ],
    faq: [
      ['Sendeo takip bilgisi neden hemen değişmiyor?', 'Sendeo takip sorgusunu 30 dakikalık önbellekten yanıtlar; durum değişikliği panele bu gecikmeyle yansır.'],
      ['Etiket yanıtta gelmezse ne olur?', 'Panel referans numarasıyla etiketi bir kez daha ister; çoğu durumda ikinci istekte etiket hazırdır.'],
      ['Sendeo ile Kolay Gelsin aynı bağlantı mı?', 'Hayır. İki firma aynı çatı altında olsa da web servisleri ayrıdır; her birini kendi kartından bağlarsınız.'],
    ],
    cta: ['Sendeo toplama iş emirlerini panelden verin', 'Etiket ve takip numarası aynı anda. Kurumsal pakette 7 gün ücretsiz.'],
  },

  'dhl-express': {
    title: 'DHL Express Entegrasyonu: Yurt İçi AWB | Hastürk CRM',
    desc: 'MyDHL API ile yurt içi ekspres gönderi açın: AWB numarası ve PDF etiket aynı yanıtta, gümrük beyanı gerekmez. Kurye çağrılmaz, gönderi hesabınıza faturalanır.',
    lead: 'DHL Express Türkiye bağlantısı MyDHL API ile yurt içi (Türkiye\'den Türkiye\'ye) ekspres gönderi açar. AWB numarası, parça numaraları ve PDF etiket tek yanıtta gelir; yurt içi gönderide gümrük beyanı istenmez ve gönderi DHL Express hesap numaranıza faturalanır.',
    tiles: [
      ['i-tag', 'AWB ve PDF etiket', 'Gönderi açıldığında AWB numarası ve PDF etiket birlikte gelir; normal yazıcıdan basılır.'],
      ['i-clock', 'Planlanan gönderim saati', 'Saat 17:00\'den önce açılan gönderi iki saat sonrasına, daha geç açılan ertesi gün 10:00\'a planlanır.'],
      ['i-truck', 'Kurye çağrılmaz', 'Bağlantı kurye çağrısı yapmaz; paketi DHL Express noktasına verirsiniz ya da düzenli alım anlaşmanızı kullanırsınız.'],
      ['i-x', 'İptal yerine kaldırma', 'MyDHL API\'de iptal servisi yok; kuryeye verilmemiş AWB faturalanmaz, panel gönderiyi pakette kaldırır.'],
      ['i-pin', 'Posta kodu tamamlanır', 'Siparişte posta kodu yoksa DHL\'in adres doğrulamasından, o da sonuç vermezse ilin merkez kodundan bulunur; adres 45 karakterlik üç satıra bölünür.'],
    ],
    setup: [
      ['MyDHL API uygulaması', 'developer.dhl.com\'da MyDHL API uygulaması oluşturup API Key ve Secret alın.'],
      ['Canlı erişim onayı', 'Canlı ortama erişimi DHL Express Türkiye satış temsilcinizin onayı açar; onayı isteyin.'],
      ['Hesap numarası', 'Gönderilerin faturalanacağı DHL Express hesap numaranızı anahtarlarla birlikte panele girin.'],
    ],
    faq: [
      ['DHL Express ile yurt dışına gönderebilir miyim?', 'Bu bağlantı şimdilik yalnız yurt içi ekspres gönderi açar; uluslararası gönderide gerekli gümrük beyanı kurulmadı.'],
      ['Bağlantı testi gönderi açar mı?', 'Hayır. Panel kimliği ücretsiz adres doğrulama isteğiyle dener; deneme sırasında gönderi oluşmaz.'],
      ['DHL Express takip durumları nasıl okunur?', 'Alındı, dağıtımda, teslim edildi ve göndericiye iade gibi olay kodları takip servisinden okunup siparişe işlenir.'],
    ],
    cta: ['DHL Express yurt içi gönderilerinizi hızlandırın', 'AWB ve etiket tek tıkla. Kurumsal pakette ilk 7 gün ücretsiz.'],
  },

  navlungo: {
    title: 'Navlungo Entegrasyonu: Cüzdanla Çok Firma | Hastürk CRM',
    desc: 'Navlungo API kullanıcınızla Sürat, HepsiJET, Kolay Gelsin, Aras, PTT ve Yurtiçi gönderisi açın; firmayı otomatik bırakın, ücret cüzdan bakiyenizden düşsün.',
    lead: 'Navlungo bir kargo entegratörüdür: tek hesap ve cüzdan bakiyesiyle birden çok kargo firmasına gönderi açarsınız. Panel gönderiyi Navlungo\'ya iletir, Navlungo bakiyeniz yetiyorsa onu sıradaki firmaya aktarır; takip numarası ve PDF etiket birkaç saniye ya da dakika içinde hazır olur.',
    tiles: [
      ['i-truck', 'Otomatik ya da sabit firma', 'Firma seçimini Navlungo\'ya bırakabilir ya da her gönderi için tek bir firmayı sabitleyebilirsiniz. Gönderiler Navlungo\'daki fiyat listelerinize göre çıkar.'],
      ['i-coin', 'Cüzdandan ödeme', 'Kargo ücreti Navlungo cüzdan bakiyenizden düşer ve aynı tutar siparişin kargo giderine işlenir.'],
      ['i-clock', 'Etiket kısa süre sonra', 'Gönderi firmaya iletildikten sonra takip numarası ve PDF etiket hazırlanır; panel kısa bir bekleme ile ikisini aynı işlemde almaya çalışır, olmazsa sonra kendisi alır.'],
      ['i-sync', 'Tekrarlanan istekte aynı gönderi', 'Yanıtı kaybolan bir istek tekrarlanırsa ikinci gönderi açılmaz, aynı referanslı gönderi kullanılır.'],
    ],
    setup: [
      ['API kullanıcısı', 'Navlungo panelinde Entegrasyonlar bölümünden bir API kullanıcısı oluşturun; bu, panel giriş bilginizden farklıdır.'],
      ['Gönderen adres numarası', 'Navlungo Adres Defteri\'ndeki gönderici adresinizin numarasını not edin.'],
      ['Fiyat listeleri', 'Kullanacağınız kargo firmaları için Navlungo\'da fiyat listesi tanımlı olduğundan emin olup bilgileri panele girin.'],
    ],
    faq: [
      ['Bakiye yetmezse ne olur?', 'Navlungo gönderiyi kargo firmasına iletmez ve etiket oluşmaz; önce Navlungo cüzdanınıza bakiye yüklemeniz gerekir.'],
      ['Navlungo oturumu ne kadar geçerli?', 'API oturumu sekiz saat geçerlidir; panel süre dolunca yeni oturum açar.'],
      ['Kendi kargo anlaşmam varken Navlungo\'ya gerek var mı?', 'Doğrudan bağlantısı olan firmalarda kendi anlaşmanızı kullanabilirsiniz. Navlungo, tek hesaptan birden çok firmaya ve bakiyeyle gönderim isteyenler içindir.'],
    ],
    cta: ['Navlungo hesabınızla tüm firmalara panelden gönderin', 'Firma seçimi, etiket ve bakiye tek ekranda. Kurumsal pakette 7 gün ücretsiz.'],
  },
};
