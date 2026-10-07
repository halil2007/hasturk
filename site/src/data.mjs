// Özellik ve entegrasyon sayfalarının içeriği. build.mjs her kayıt için /ozellikler/<slug> ve /entegrasyonlar/<slug> sayfasını,
// ayrıca üst menüdeki açılır listeleri buradan üretir. Yazılanlar panelin bugün yaptıklarıyla birebir olmalı (müşteriye söz veriyoruz).
// Alanlar: slug, name (menü), icon (src/sprite.svg'deki id), color (c-blue, c-green ...), short (menü açıklaması), title (sekme başlığı),
// h1 (iki parça: düz + vurgulu), lead, img (public/img'deki ekran görüntüsü; yoksa mock), points [ikon, başlık, metin],
// steps [başlık, metin] (isteğe bağlı), note {title, items[]} (isteğe bağlı "Bilmeniz gerekenler"), faq [soru, cevap], related [slug].

export const FEATURES = [
  {
    slug: 'siparis-yonetimi', name: 'Sipariş yönetimi', icon: 'i-cart', color: 'c-pink', short: 'Tüm kanalların siparişleri tek listede',
    title: 'Sipariş Yönetimi — Hastürk CRM', h1: ['Tüm Kanalların Siparişleri', 'Tek Listede'],
    lead: 'Trendyol, Hepsiburada, N11, ikas ve diğer kanallardan gelen siparişler 15 dakikada bir kendiliğinden panele gelir. Hangi siparişin bugün kargoya verilmesi gerektiğini ilk bakışta görürsünüz.',
    img: 'siparisler',
    points: [
      ['i-list', 'Durum sekmeleri', 'Yeni, hazırlanan, geciken, kargodaki, teslim edilen, iptal ve iade siparişler ayrı sekmelerde; her sekmede kaç sipariş olduğu görünür.'],
      ['i-clock', 'Gecikme uyarısı', 'Kanalın son kargoya teslim saatine göre geciken ve gecikme riski taşıyan siparişler kırmızıyla işaretlenir.'],
      ['i-bolt', 'Toplu işlem', 'Birden fazla siparişi tek seferde işleme alın, etiketlerini toplu oluşturun ve yazdırın.'],
      ['i-calc', 'Satırda kâr', 'Her siparişte ürünler, tutar ve komisyon ile kargo düşüldükten sonra size kalan kâr aynı satırda.'],
      ['i-sync', 'Dışarıda yapılan işlemler', 'Pazaryeri panelinden yapılan iptal, iade ya da kargolama panelde de kendiliğinden güncellenir.'],
      ['i-mail', 'Bildirim ve özet', 'Yeni siparişte e-posta ve telefon bildirimi; her sabah önceki günün özeti e-postanızda.'],
    ],
    faq: [
      ['Siparişler ne sıklıkla gelir?', 'Panel her kanalı 15 dakikada bir kontrol eder; isterseniz "Yenile" ile hemen çekebilirsiniz.'],
      ['Eski siparişlerim de gelir mi?', 'Evet. Mağazanızı bağladığınızda son bir yılın siparişleri arka planda panele aktarılır; raporlarınız ilk günden dolu olur.'],
      ['Pazaryeri panelinde yaptığım işlem panele yansır mı?', 'Evet. Siparişi pazaryerinin kendi panelinden iptal eder ya da kargolarsanız, panel bir sonraki kontrolde durumu günceller.'],
    ],
    related: ['kargo-ve-etiket', 'stok-senkronizasyonu', 'kar-zarar'],
  },
  {
    slug: 'kargo-ve-etiket', name: 'Kargo ve etiket', icon: 'i-truck', color: 'c-blue', short: 'Ortak barkod, tek tıkla etiket',
    title: 'Kargo ve Etiket — Hastürk CRM', h1: ['Paketle, Etiketi Al,', 'Yazdır'],
    lead: 'Pazaryerinin anlaşmalı kargosuyla gönderimde barkod doğrudan pazaryerinden alınır. Etiketi panelin sade tasarımıyla termal ya da normal yazıcıdan basarsınız.',
    img: 'kargo',
    points: [
      ['i-tag', 'Ortak barkod', 'Trendyol ve Hepsiburada siparişlerinde anlaşmalı kargo barkodu pazaryerinden gelir; etikette pazaryeri logosu ve anlaşma bilgisi yer alır.'],
      ['i-truck', 'ikas Kargo', 'ikas sitenizin siparişlerinde gönderi ikas Kargo ile oluşturulur, etiket ikas\'tan alınır.'],
      ['i-gear', 'Kargo firması seçimi', 'Kargo firmasını sipariş başına seçin ya da kanal için varsayılan firma belirleyin.'],
      ['i-orders', 'Termal ve normal yazıcı', 'Etiketler PDF ya da termal yazıcılar için ZPL olarak alınır; toplu yazdırma desteklenir.'],
      ['i-list', 'Toplama listesi', 'Bugün hazırlanacak ürünlerin toplu listesi: depoda hangi üründen kaç adet alınacağı tek sayfada.'],
      ['i-eye', 'Kargo takibi', 'Hazırlanacak, yazdırılacak, kargoya verilecek ve kargodaki paketler ayrı sekmelerde; takip bağlantısı tek tıkla.'],
    ],
    steps: [
      ['Paketleyin', 'Siparişi işleme alın; birden fazla paket gerekiyorsa bölün.'],
      ['Etiketi alın', 'Barkod pazaryerinden gelir, etiket panelde hazırlanır.'],
      ['Kargoya verin', 'Etiketi yazdırın; kargo firması paketi teslim alınca durum kendiliğinden güncellenir.'],
    ],
    faq: [
      ['Hangi kargo firmalarıyla çalışır?', 'Ortak barkodlu gönderimde pazaryerinin size sunduğu anlaşmalı firmalardan birini seçersiniz. Kendi kargo anlaşmanızla gönderdiğiniz kanallarda etiket sipariş ve adres bilgisiyle panelden basılır.'],
      ['Termal yazıcım var, kullanabilir miyim?', 'Evet. Etiketi termal yazıcılar için ZPL ya da PDF olarak alabilirsiniz.'],
      ['Kargo firmasını sonradan değiştirebilir miyim?', 'Trendyol ve Hepsiburada siparişlerinde kargo firmasını panelden değiştirip yeni barkodu alabilirsiniz.'],
    ],
    related: ['siparis-yonetimi', 'stok-senkronizasyonu', 'raporlar'],
  },
  {
    slug: 'stok-senkronizasyonu', name: 'Stok senkronizasyonu', icon: 'i-sync', color: 'c-green', short: 'Bir kanalda satılan her yerde düşer',
    title: 'Stok Senkronizasyonu — Hastürk CRM', h1: ['Bir Kanalda Satılan,', 'Her Yerde Düşer'],
    lead: 'Ürün panelde tek kart olarak tutulur; kanallardaki ilanları barkod ve stok koduyla kendiliğinden eşleşir. Bir kanaldan sipariş gelince yeni stok diğer kanallara gönderilir, fazla satış derdi biter.',
    img: 'urunler',
    points: [
      ['i-link', 'Otomatik eşleştirme', 'Aynı barkod ya da stok kodlu ilanlar tek ürüne bağlanır; kalanlar için panel öneri sunar, siz onaylarsınız.'],
      ['i-sync', 'Kanallar arası stok', 'Satış olduğunda stok düşer ve yeni adet, stok gönderimi açık olan tüm kanallara gider.'],
      ['i-gear', 'Kanal bazında kontrol', 'Stok gönderimini her kanal için ayrı açıp kapatın; bir kanalda gösterilecek en fazla adedi sınırlayın.'],
      ['i-clock', 'Tükenme tahmini', 'Satış hızına göre stokun kaç gün yeteceği hesaplanır; yakında bitecek ürünler için uyarı alırsınız.'],
      ['i-orders', 'Excel ile toplu güncelleme', 'Stok, fiyat ve maliyeti Excel dosyasıyla toplu güncelleyin.'],
      ['i-eye', 'Stoksuz ilan takibi', 'Stokta olmayan ürünler ve eşleşme bekleyen ilanlar ana ekranda ayrıca gösterilir.'],
    ],
    note: { title: 'Bilmeniz gerekenler', items: ['Stok gönderimi siz bir kanal için açana kadar kapalıdır; kapalıyken stoklar kanaldan yalnız okunur, hiçbir şey değiştirilmez.', 'Satıştan sonraki ilk kontrolde (en geç 15 dakika içinde) yeni stok, gönderimi açık olan diğer kanallara gider.'] },
    faq: [
      ['Aynı ürün farklı kanallarda farklı barkodla satılıyorsa?', 'Eşleştirme ekranından ilanları elle aynı ürüne bağlayabilirsiniz; bir kez bağladıktan sonra stok birlikte yönetilir.'],
      ['Bir kanala stoğumun tamamını göstermek istemiyorum.', 'Kanala özel en fazla adet tanımlayabilirsiniz; panel o kanala bu sınırı aşmayan adedi gönderir.'],
    ],
    related: ['urun-yonetimi', 'siparis-yonetimi', 'stok-api'],
  },
  {
    slug: 'urun-yonetimi', name: 'Ürün yönetimi ve otomatik gönderim', icon: 'i-box', color: 'c-orange', short: 'Çok kanala ürün yükleme, otomatik gönderim',
    title: 'Ürün Yönetimi ve Otomatik Gönderim — Hastürk CRM', h1: ['Ürünü Bir Kez Tanımlayın,', 'Her Kanala Gönderin'],
    lead: 'Ürün kartlarınızı tek yerden yönetin; panelden Trendyol, Hepsiburada, N11 ve idefix\'e ürün yükleyin. Otomatik gönderimi açtığınız kanallarda yeni ürünleriniz kendiliğinden yüklenir.',
    img: 'urunler',
    points: [
      ['i-box', 'Ürün kartları', 'Marka, açıklama, görseller, alış fiyatı ve varyantlar tek kartta; varyantlar ana ürün altında gruplanır.'],
      ['i-list', 'Otomatik kategori eşleştirme', 'Kategorileriniz her pazaryerinin kategorisine ve zorunlu özelliklerine bir kez eşlenir; panel en uygun kategoriyi önerir.'],
      ['i-up', 'Çok kanala yükleme', 'Henüz bir kanalda ilanı olmayan ürünleri seçip tek tıkla o kanala gönderin.'],
      ['i-bolt', 'Otomatik gönderim', 'Kanal bazında açılır: kanalda olmayan, stoğu olan ve bilgisi eksiksiz ürünler her kontrolde kendiliğinden gönderilir.'],
      ['i-eye', 'Gönderim takibi', 'Kanalın ürünü kabul edip etmediği ve ilanın mağazada görünüp görünmediği izlenir; reddedilen ürün nedeniyle birlikte gösterilir.'],
      ['i-tag', 'Toplu fiyat ve maliyet', 'Excel ile fiyat, stok ve alış fiyatı güncelleme; döviz bazlı fiyat (USD, EUR, GBP) ve anlık kur.'],
    ],
    note: { title: 'Bilmeniz gerekenler', items: ['Panelden ürün yükleme Trendyol, Hepsiburada, N11 ve idefix\'te çalışır. PttAVM ve Pazarama\'da yeni ilan kanalın kendi panelinden açılır; stok ve fiyat yine panelden gider.', 'Otomatik gönderim siz bir kanal için açana kadar kapalıdır. Reddedilen ürün, düzelttiyseniz 1 saat, düzeltmediyseniz 24 saat sonra tekrar denenir.'] },
    faq: [
      ['Ürünlerim nereden geliyor?', 'Bağladığınız kanallardaki ilanlarınızdan seçerek panele alırsınız. ikas siteniz varsa ürünler, kategoriler, görseller ve varyantlar oradan ana katalog olarak gelebilir.'],
      ['Kanal ürünümü reddederse ne olur?', 'Panel kanalın verdiği hata nedenini gösterir. Eksiği tamamladığınızda ürün tekrar gönderilir.'],
    ],
    related: ['stok-senkronizasyonu', 'buybox-takibi', 'raporlar'],
  },
  {
    slug: 'buybox-takibi', name: 'Buybox takibi ve otomatik fiyat', icon: 'i-up', color: 'c-teal', short: 'Buybox\'ı kaybedince fiyatla geri alın',
    title: 'Buybox Takibi ve Otomatik Fiyat — Hastürk CRM', h1: ['Buybox\'ı Takip Edin,', 'Kaybettiğinizde Geri Alın'],
    lead: 'Trendyol ve Hepsiburada\'daki ilanlarınızın buybox sırasını ve rakip fiyatlarını izleyin. Kural tanımladığınız ilanlarda buybox rakibe geçince fiyatınız, belirlediğiniz alt sınırı aşmadan rakibin altına çekilir.',
    img: 'fiyat-onerileri',
    points: [
      ['i-eye', 'Buybox sırası', 'Her ilan için buybox sıranız, buybox fiyatı ve ikinci, üçüncü satıcının fiyatı; sıranızı kaybettiğiniz ilanlar ayrıca listelenir.'],
      ['i-up', 'Otomatik geri alma', 'Buybox rakibe geçince fiyatınız rakibin belirlediğiniz adım (ör. 1 TL) kadar altına çekilir.'],
      ['i-shield', 'Alt ve üst sınır', 'Fiyat asla belirlediğiniz en düşük fiyatın altına inmez, en yüksek fiyatın üstüne çıkmaz; zararına satış olmaz.'],
      ['i-calc', 'Kârı geri kazanma', 'Buybox sizdeyken fiyat ikinci satıcının hemen altına ya da hedef fiyatınıza doğru yükseltilir.'],
      ['i-clock', 'Güvenli çalışma', 'Rakip verisi 20 dakikadan eskiyse fiyat değişmez; bir ilan 14 dakikada en fazla bir kez değişir.'],
      ['i-list', 'Değişiklik kaydı', 'Her fiyat değişikliği eski ve yeni fiyat, rakip fiyatı ve nedeniyle kaydedilir; ardından gerçek buybox durumu yeniden kontrol edilir.'],
    ],
    steps: [
      ['Kural tanımlayın', 'İlan için en düşük ve en yüksek fiyatı, adım tutarını ve isterseniz hedef fiyatı girin.'],
      ['Otomatik fiyatı açın', 'Buybox sayfasındaki genel anahtarı açın; kapalıyken kurallar kaydedilir ama fiyat değişmez.'],
      ['Sonucu izleyin', 'Panel her 15 dakikada buybox durumunu kontrol eder, gerekirse fiyatı günceller ve kaydını tutar.'],
    ],
    note: { title: 'Bilmeniz gerekenler', items: ['Buybox yalnız fiyata bağlı değildir; pazaryerleri teslim süresi ve mağaza puanı gibi ölçütleri de kullanır. Fiyatınız en düşük olsa bile buybox başka nedenle rakipte kalabilir; bu durumda panel fiyatı boşuna düşürmez.', 'Rakibin fiyatı sizin en düşük fiyatınızın altındaysa panel sınırın altına inmez; buybox\'ı geri almak için zararına satış yapmaz.', 'Otomatik fiyat yalnız kural tanımlayıp açtığınız ilanlarda çalışır. Hepsiburada\'da sıranızın bulunması için Entegrasyonlar sayfasına mağaza adınızı girmeniz gerekir.'] },
    faq: [
      ['Hangi pazaryerlerinde çalışır?', 'Trendyol ve Hepsiburada. Bu iki pazaryeri buybox bilgisini entegrasyon servisiyle paylaşır.'],
      ['Fiyatım sürekli düşüp zarar eder mi?', 'Hayır. Fiyat asla sizin belirlediğiniz en düşük fiyatın altına inmez. Buybox sizdeyken de fiyat yeniden yükseltilir.'],
      ['Kural kurmadan kullanabilir miyim?', 'Evet. Fiyat önerileri ekranı, birinciliği almak ya da kârı artırmak için önerilen fiyatı ve o fiyattaki kârınızı gösterir; fiyatı siz onaylarsınız.'],
    ],
    related: ['urun-yonetimi', 'kar-zarar', 'raporlar'],
  },
  {
    slug: 'kar-zarar', name: 'Gelir, gider ve kâr-zarar', icon: 'i-calc', color: 'c-purple', short: 'Ciroyu değil, gerçek kârı görün',
    title: 'Gelir, Gider ve Kâr-Zarar — Hastürk CRM', h1: ['Ciroyu Değil,', 'Gerçek Kârı Görün'],
    lead: 'Satıştan net kâra her basamak açık: komisyon, kargo, hizmet bedeli, stopaj, reklam, ceza, iade kaybı ve işletme giderleri. Pazaryerinin kestiği faturalar ve hakedişler de aynı ekranda.',
    img: 'gelir-gider',
    points: [
      ['i-calc', 'Net kâr basamakları', 'Ciro → komisyon → kargo → hizmet bedeli → stopaj → reklam ve ceza → iade kaybı → işletme giderleri → net kâr.'],
      ['i-orders', 'Kesilen faturalar', 'Pazaryerinin kestiği komisyon, kargo, reklam ve ceza faturaları kendiliğinden çekilir.'],
      ['i-truck', 'Gerçek kargo maliyeti', 'Tahmini değil, pazaryerinin kargo faturasındaki gerçek tutar siparişe işlenir.'],
      ['i-calendar', 'Hakediş takvimi', 'Hangi satışın parası ne zaman hesabınıza geçecek; ödenen ve bekleyen hakedişler.'],
      ['i-box', 'Ürün bazında kâr', 'Her ürünün ve her kanalın net kârı; zarar eden ürünler için uyarı.'],
      ['i-store', 'İşletme giderleri', 'Kira, personel, yazılım gibi giderleri girin; dönem kârınız bunları da düşer.'],
    ],
    faq: [
      ['Komisyon oranlarını elle mi girmeliyim?', 'Hayır. Trendyol ve Hepsiburada\'da gerçek kesintiler faturalardan gelir. Diğer kanallar için kanal komisyon oranınızı bir kez girersiniz.'],
      ['Alış fiyatı girmezsem ne olur?', 'Kâr yine hesaplanır ama alış fiyatı eksik satırlar uyarıyla gösterilir; Excel ile toplu girebilirsiniz.'],
    ],
    related: ['raporlar', 'siparis-yonetimi', 'buybox-takibi'],
  },
  {
    slug: 'raporlar', name: 'Raporlar ve analiz', icon: 'i-chart', color: 'c-blue', short: 'Satış, ürün ve müşteri analizleri',
    title: 'Raporlar ve Analiz — Hastürk CRM', h1: ['İşinizi', 'Verilerle Büyütün'],
    lead: 'Günlük, haftalık ve aylık satışlarınızı dönem karşılaştırmasıyla görün. En çok satan ürünler, kanal dağılımı, il bazında satışlar ve tekrar sipariş veren müşteriler tek bölümde.',
    img: 'analiz',
    points: [
      ['i-chart', 'Satış analizi', 'Ciro ve sipariş grafikleri; bugünü dünle, bu haftayı geçen haftayla, bu ayı geçen ayla karşılaştırın.'],
      ['i-up', 'En çok satanlar', 'Seçtiğiniz dönemde adet ve ciroya göre en çok satan ürünler.'],
      ['i-store', 'Kanal dağılımı', 'Hangi kanal ne kadar satıyor, hangisi daha kârlı.'],
      ['i-pin', 'Türkiye haritası', 'Satışlarınızın il bazında dağılımı harita üzerinde.'],
      ['i-users', 'Müşteriler', 'Müşteri listesi, tekrar sipariş veren sadık müşteriler ve müşteri bazında ciro.'],
      ['i-mail', 'Sabah özeti', 'Her sabah önceki günün satışları, bekleyen siparişler ve tükenecek ürünler e-postanızda.'],
    ],
    faq: [
      ['Verilerimi dışarı aktarabilir miyim?', 'Evet. Sipariş listesini filtreleyip Excel\'e aktarabilirsiniz.'],
      ['Geçmiş dönemleri görebilir miyim?', 'Mağazanızı bağladığınızda son bir yılın siparişleri aktarılır; raporlar ilk günden geçmişi de kapsar.'],
    ],
    related: ['kar-zarar', 'siparis-yonetimi', 'stok-senkronizasyonu'],
  },
  {
    slug: 'musteri-sorulari-ve-iadeler', name: 'Müşteri soruları ve iadeler', icon: 'i-chat', color: 'c-pink', short: 'Sorular ve iade talepleri tek yerde',
    title: 'Müşteri Soruları ve İadeler — Hastürk CRM', h1: ['Soruları Yanıtlayın,', 'İadeleri Yönetin'],
    lead: 'Pazaryerlerindeki müşteri sorularını tek listede toplayın ve panelden yanıtlayın. İade taleplerini görün, onaylayın ya da gerekçesiyle reddedin.',
    mock: 'questions',
    points: [
      ['i-chat', 'Tüm sorular tek listede', 'Trendyol, Hepsiburada, N11, idefix ve Pazarama sorularınız tek ekranda; bekleyenler üstte.'],
      ['i-bolt', 'Hazır cevaplar', 'Sık sorulan sorular için hazır cevap şablonları; tek tıkla doldurun, düzenleyip gönderin.'],
      ['i-clock', 'Süre takibi', 'Cevap bekleyen sorular ana ekranda ve sabah özetinde hatırlatılır.'],
      ['i-sync', 'İade talepleri', 'Trendyol, Hepsiburada, N11 ve idefix iade taleplerini panelden onaylayın.'],
      ['i-x', 'Gerekçeli ret', 'İadeyi reddederken kanalın istediği gerekçeyi seçin, açıklama ve belge ekleyin.'],
      ['i-users', 'Ekip için yetki', 'Müşteri hizmetleri personeline yalnız sorular ve iadeler bölümünü açın.'],
    ],
    faq: [
      ['Cevabım pazaryerinde görünür mü?', 'Evet. Panelden gönderdiğiniz cevap pazaryerinin servisi üzerinden iletilir ve ürün sayfasında görünür.'],
      ['ikas sitemdeki müşteri mesajları da gelir mi?', 'Hayır. ikas soru-cevap servisi sunmadığı için yalnız pazaryerlerinin soruları gelir.'],
    ],
    related: ['siparis-yonetimi', 'ekip-ve-guvenlik', 'raporlar'],
  },
  {
    slug: 'ekip-ve-guvenlik', name: 'Ekip, yetki ve güvenlik', icon: 'i-shield', color: 'c-green', short: 'Personel yetkileri, iki adımlı doğrulama',
    title: 'Ekip, Yetki ve Güvenlik — Hastürk CRM', h1: ['Ekibinizle Çalışın,', 'Kontrol Sizde Kalsın'],
    lead: 'Personel ekleyin, herkes yalnız işi olan bölümü görsün. Google Authenticator ile iki adımlı doğrulama, oturum kontrolü ve işlem kayıtlarıyla hesabınız güvende.',
    mock: 'team',
    points: [
      ['i-users', 'Hazır roller', 'Depo / sevkiyat, müşteri hizmetleri, katalog, muhasebe, satış uzmanı ve yalnız izleme şablonları; tek tek de değiştirilebilir.'],
      ['i-eye', 'Görür ya da işlem yapar', 'Her bölüm için ayrı yetki: yalnız görüntüleme ya da işlem yapma.'],
      ['i-shield', 'İki adımlı doğrulama', 'Google Authenticator ile giriş; yönetici tüm personel için zorunlu tutabilir, yedek kodlar verilir.'],
      ['i-lock', 'Oturum kontrolü', 'Bir personelin tüm oturumlarını tek tıkla kapatın; ayrılan personeli pasife alın.'],
      ['i-list', 'İşlem kayıtları', 'Kimin ne zaman hangi işlemi yaptığı kayıt altında; personel bazında etkinlik.'],
      ['i-key', 'Kaba kuvvet koruması', 'Hatalı giriş denemeleri sınırlanır; şifreler tek yönlü özetlenerek saklanır.'],
    ],
    faq: [
      ['Kaç personel ekleyebilirim?', 'Paketinize göre: Başlangıç 2, Profesyonel 5, Kurumsal sınırsız kullanıcı.'],
      ['Personel ayarları değiştirebilir mi?', 'Hayır. Ayarlar, kanal API bilgileri ve kullanıcı yönetimi yalnız yöneticiye açıktır.'],
    ],
    related: ['musteri-sorulari-ve-iadeler', 'siparis-yonetimi', 'stok-api'],
  },
  {
    slug: 'stok-api', name: 'Stok API', icon: 'i-link', color: 'c-purple', short: 'Stoklarınızı bayilerinize aktarın',
    title: 'Stok API — Hastürk CRM', h1: ['Stoklarınızı', 'Bayilerinize Aktarın'],
    lead: 'Paneldeki güncel stoklarınızı kendi sitenize, ERP\'nize ya da bayilerinizin sistemine aktarın. Her bayi için ayrı anahtar, IP kısıtı ve hazır kurulum kılavuzu.',
    mock: 'api',
    points: [
      ['i-key', 'Ayrı anahtar', 'Her bayi ya da sistem için ayrı API anahtarı; birini iptal etmek diğerlerini etkilemez.'],
      ['i-lock', 'IP kısıtı', 'Anahtarı yalnız belirttiğiniz IP adreslerinden kullanılabilir hale getirin.'],
      ['i-eye', 'Yalnız okuma', 'API yalnız sizin ürünlerinizin stok ve satış fiyatını okur; hiçbir şeyi değiştiremez.'],
      ['i-shield', 'Güvenli saklama', 'Anahtarın kendisi saklanmaz, yalnız özeti tutulur; anahtar oluşturulduğunda bir kez gösterilir.'],
      ['i-clock', 'Hız sınırı', 'Dakikada 120 istek; bayilerinizin sistemi panelinizi yavaşlatmaz.'],
      ['i-orders', 'Kurulum kılavuzu', 'Bayinizin yazılımcısına gönderebileceğiniz hazır kılavuz ve örnek istekler.'],
    ],
    faq: [
      ['Hangi pakette var?', 'Stok API Kurumsal pakette yer alır. Anahtarı kurulumda birlikte oluşturuyoruz.'],
      ['Bayim stoğumu değiştirebilir mi?', 'Hayır. API yalnız okuma içindir.'],
    ],
    related: ['stok-senkronizasyonu', 'ekip-ve-guvenlik', 'urun-yonetimi'],
  },
];

// Entegrasyonlar. caps: [özellik, true | false | 'metin'] (sayfadaki "Desteklenen işlemler" kartı)
export const INTEGRATIONS = [
  {
    slug: 'trendyol', name: 'Trendyol', kind: 'pazaryeri', color: '#f27a1a', badge: 'T', word: 'trendyol',
    lead: 'Trendyol mağazanızın siparişlerini, ortak barkodlu kargo etiketlerini, stok ve fiyatlarını, müşteri sorularını, iadelerini, faturalarını ve buybox durumunu tek panelden yönetin.',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Ortak barkod'], ['Kargo firması değiştirme', true], ['Paket bölme', true], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', true], ['Gerçek kargo maliyeti', true], ['Buybox takibi ve otomatik fiyat', true]],
    points: [
      ['i-tag', 'Ortak barkodlu etiket', 'Trendyol anlaşmalı kargo barkodu Trendyol\'dan alınır; etiketi panelden basarsınız.'],
      ['i-up', 'Buybox ve otomatik fiyat', 'Buybox sıranızı izleyin; kural tanımladığınız ilanlarda fiyat alt sınırı aşmadan otomatik ayarlanır.'],
      ['i-calc', 'Gerçek kesintiler', 'Komisyon, kargo, hizmet bedeli ve reklam faturaları ile hakedişler Trendyol\'dan çekilir.'],
      ['i-chat', 'Sorular ve iadeler', 'Müşteri sorularını yanıtlayın, iade taleplerini onaylayın ya da gerekçesiyle reddedin.'],
    ],
    help: 'Trendyol satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri sayfasından Satıcı ID, API Key ve API Secret bilgilerinizi alın.',
  },
  {
    slug: 'hepsiburada', name: 'Hepsiburada', kind: 'pazaryeri', color: '#ff6000', badge: 'hb', word: 'hepsiburada',
    lead: 'Hepsiburada mağazanızın siparişlerini ve paketlerini, ortak barkodlu kargo etiketlerini, stok ve fiyatlarını, sorularını, iadelerini, faturalarını ve buybox durumunu tek panelden yönetin.',
    caps: [['Siparişler ve paketleme', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Ortak barkod'], ['Kargo firması değiştirme', true], ['Paket bölme ve iptal', true], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', true], ['Gerçek kargo maliyeti', true], ['Buybox takibi ve otomatik fiyat', true]],
    points: [
      ['i-tag', 'Paket etiketi', 'Paketi panelden oluşturun; Hepsiburada\'nın verdiği barkodla etiketi bizim sade tasarımımızla basın.'],
      ['i-up', 'Buybox ve otomatik fiyat', 'Buybox sıranızı ve rakip fiyatlarını izleyin; kurallı ilanlarda fiyat otomatik ayarlanır.'],
      ['i-calc', 'Faturalar ve hakediş', 'Hepsiburada\'nın kestiği faturalar ve hakediş kayıtları panelde; gerçek kârınız hesaplanır.'],
      ['i-chat', 'Sorular ve iadeler', 'Müşteri sorularını yanıtlayın, iade taleplerini panelden yönetin.'],
    ],
    help: 'Hepsiburada Merchant Portal → Hesabım → Entegrasyon ekranından Merchant ID ve servis anahtarınızı alın. Entegratör tanımını ve buybox için mağaza adınızı kurulumda birlikte giriyoruz.',
  },
  {
    slug: 'n11', name: 'N11', kind: 'pazaryeri', color: '#7b3fe4', badge: 'n11', word: 'n11',
    lead: 'N11 mağazanızın siparişlerini onaylayın, stok ve fiyatlarınızı eşitleyin, ürün yükleyin, müşteri sorularını ve iade taleplerini panelden yönetin.',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', false], ['Buybox takibi', false]],
    points: [
      ['i-cart', 'Sipariş onayı', 'Yeni N11 siparişlerini panelden onaylayın; diğer kanallarla aynı listede yönetin.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız diğer kanallarla eşit kalır.'],
      ['i-up', 'Ürün yükleme', 'Kategori eşleştirmesiyle ürünlerinizi panelden N11\'e gönderin.'],
      ['i-chat', 'Sorular ve iadeler', 'Müşteri sorularını yanıtlayın, iade taleplerini onaylayın ya da reddedin.'],
    ],
    help: 'N11 Satıcı Ofisi (so.n11.com) → Hesabım → API Hesapları → Yeni Hesap Oluştur. App Key ve App Secret e-postanıza gelir.',
  },
  {
    slug: 'ikas', name: 'ikas', kind: 'e-ticaret sitesi', color: '#111827', badge: 'ik', word: 'ikas',
    lead: 'ikas sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin, ikas Kargo ile gönderin. Birden fazla ikas siteniz varsa hepsini bağlayın; ürünleriniz ana katalog olarak kullanılabilir.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Ürün oluşturma', true], ['Kargo etiketi', 'ikas Kargo'], ['Birden fazla site', true], ['Ana katalog (kategori, görsel, varyant)', true], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-truck', 'ikas Kargo', 'Gönderi ikas Kargo ile oluşturulur; etiket ikas\'tan gelir, takip numarası siparişe işlenir.'],
      ['i-store', 'Birden fazla site', 'Farklı markalar için açtığınız ikas sitelerini ayrı mağazalar olarak bağlayın.'],
      ['i-box', 'Ana katalog', 'ikas\'taki ürünler, kategoriler, görseller ve varyantlar pazaryerlerine ürün yüklerken kaynak olarak kullanılır.'],
      ['i-sync', 'Stok eşitleme', 'Pazaryerinde satılan ürünün stoğu ikas sitenizde de düşer.'],
    ],
    help: 'ikas paneli → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma).',
  },
  {
    slug: 'pttavm', name: 'PttAVM', kind: 'pazaryeri', color: '#e0a800', badge: 'Ptt', word: 'PttAVM',
    lead: 'PttAVM mağazanızın siparişlerini diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı panelden eşitleyin.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Ürün yükleme', false], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'PttAVM siparişleri 15 dakikada bir panele gelir.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız diğer kanallarla eşit kalır.'],
      ['i-tag', 'Etiket', 'Sipariş ve adres bilgisiyle etiket panelden basılır; kargo barkodu için depo numaranız girilir.'],
      ['i-box', 'Ürünler', 'Yeni ilanı PttAVM panelinden açarsınız; ilan barkoduyla paneldeki ürüne kendiliğinden bağlanır.'],
    ],
    help: 'PttAVM mağaza paneli → Entegrasyon → API kullanıcısı bilgilerinizi alın. Kargo barkodu için depo numaranız gerekir.',
  },
  {
    slug: 'idefix', name: 'idefix', kind: 'pazaryeri', color: '#1d4ed8', badge: 'id', word: 'idefix',
    lead: 'idefix mağazanızın siparişlerini onaylayın ve kargoya verin, stok ve fiyatlarınızı eşitleyin, ürün yükleyin, sorularınızı ve iadelerinizi panelden yönetin.',
    caps: [['Siparişler, onay ve kargoya verme', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', false], ['Buybox takibi', false]],
    points: [
      ['i-cart', 'Sipariş akışı', 'Siparişi onaylayın ve kargoya verildi olarak idefix\'e bildirin.'],
      ['i-up', 'Ürün yükleme', 'Kategori eşleştirmesiyle ürünlerinizi panelden idefix\'e gönderin.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız diğer kanallarla eşit kalır.'],
      ['i-chat', 'Sorular ve iadeler', 'Müşteri sorularını yanıtlayın, iade taleplerini yönetin.'],
    ],
    help: 'idefix satıcı paneli → Hesap Bilgileri → Entegrasyon Bilgileri → Yeni API Oluştur. API Key, API Secret ve Satıcı ID (Vendor ID) bilgileriniz gerekir.',
  },
  {
    slug: 'pazarama', name: 'Pazarama', kind: 'pazaryeri', color: '#7a2bc9', badge: 'Pz', word: 'pazarama',
    lead: 'Pazarama mağazanızın siparişlerini onaylayın, stok ve fiyatlarınızı eşitleyin, müşteri sorularını panelden yanıtlayın.',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['Ürün yükleme', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Sipariş onayı', 'Yeni Pazarama siparişlerini panelden onaylayın.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız diğer kanallarla eşit kalır.'],
      ['i-chat', 'Müşteri soruları', 'Pazarama sorularını diğer kanallarla aynı listede yanıtlayın.'],
      ['i-box', 'Ürünler', 'Yeni ilanı Pazarama panelinden açarsınız; ilan paneldeki ürüne kendiliğinden bağlanır.'],
    ],
    help: 'Pazarama iş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri. API Key (Client ID) ve API Secret bilgileriniz gerekir.',
  },
];

// ---------- özellik sayfalarının ek bölümleri: ne işe yarar (sorun → çözüm), nasıl çalışır (adımlar), artıları ----------
// example: 'profit' (kâr-zarar örnek hesabı) | 'buybox' (buybox örnek senaryosu)
const MORE = {
  'siparis-yonetimi': {
    why: ['Her pazaryerinin paneline ayrı ayrı girip siparişleri tek tek kontrol etmek zaman alır. Bir kanalda gözden kaçan sipariş gecikmeye, gecikme de pazaryeri cezasına ve düşük mağaza puanına dönüşür.', 'Tüm kanalların siparişleri tek listede, kargoya verilme son saatine göre. Geciken ya da gecikme riski taşıyan sipariş kırmızıyla işaretlenir; hiçbir sipariş gözden kaçmaz.'],
    steps: [['Kanallarınızı bağlayın', 'Pazaryeri ve site API bilgilerini bir kez girin.'], ['Siparişler gelsin', 'Yeni siparişler 15 dakikada bir kendiliğinden panele düşer, size bildirim gelir.'], ['İşleme alın, paketleyin', 'Tek tek ya da toplu işleme alın; etiket ve kargo adımına geçin.']],
    benefits: [['i-clock', 'Zaman kazanırsınız', 'Panel panel gezmek yerine tek ekran'], ['i-shield', 'Gecikme cezası riski azalır', 'Son saat yaklaşınca uyarı'], ['i-users', 'Ekip aynı listeyi görür', 'Kim neyi hazırladı belli'], ['i-calc', 'Kârı satırda görürsünüz', 'Zarar eden sipariş fark edilir']],
  },
  'kargo-ve-etiket': {
    why: ['Her pazaryerinde barkodu ayrı ekrandan almak, etiketi farklı biçimlerde yazdırmak ve hangi paketin kargoya verildiğini takip etmek karışık ve hataya açıktır.', 'Paketle, etiketi al, yazdır: barkod pazaryerinden gelir, etiket tek tasarımla panelden basılır. Paketlerin hangi aşamada olduğu sekmelerde görünür.'],
    benefits: [['i-bolt', 'Hızlı paketleme', 'Toplu etiket ve toplama listesi'], ['i-tag', 'Doğru barkod', 'Barkod pazaryerinden gelir'], ['i-orders', 'Termal yazıcı', 'ZPL ya da PDF çıktı'], ['i-eye', 'Net takip', 'Hangi paket hangi aşamada']],
  },
  'stok-senkronizasyonu': {
    why: ['Aynı ürünü birden fazla kanalda satarken bir kanaldaki satış diğerlerine yansımazsa stokta olmayan ürün satılır. İptal edilen sipariş hem müşteriyi hem mağaza puanınızı üzer.', 'Ürün panelde tek kart olarak tutulur; bir kanalda satılınca yeni stok diğer kanallara gider. Fazla satış ve stoksuz ilan derdi biter.'],
    steps: [['İlanlar eşleşsin', 'Kanallardaki ilanlar barkod ve stok koduyla aynı ürüne bağlanır.'], ['Stok gönderimini açın', 'Her kanal için ayrı açılır; isterseniz kanala gösterilecek en fazla adedi belirleyin.'], ['Satış oldukça eşitlensin', 'Bir kanalda satılan ürünün yeni stoğu diğer kanallara gider.']],
    benefits: [['i-shield', 'Fazla satış olmaz', 'Stok her kanalda aynı'], ['i-clock', 'Elle güncelleme yok', 'Panel kendisi gönderir'], ['i-eye', 'Tükenmeden haberiniz olur', 'Kaç gün yeteceği hesaplanır'], ['i-gear', 'Kontrol sizde', 'Kanal bazında aç / kapat']],
  },
  'urun-yonetimi': {
    why: ['Yeni bir ürünü her pazaryerine ayrı ayrı yüklemek, kategori ve zorunlu özellikleri her kanal için yeniden doldurmak saatler alır; bir kanalı unutmak satış kaybıdır.', 'Ürünü bir kez tanımlayın. Kategori eşleştirmesi bir kez yapılır, panel ürünü kanallara gönderir. Otomatik gönderimi açtığınız kanallarda yeni ürünler kendiliğinden yüklenir.'],
    steps: [['Kategorileri eşleştirin', 'Panel her pazaryeri için en uygun kategoriyi önerir; siz onaylarsınız.'], ['Gönderin ya da otomatiğe alın', 'Ürünleri seçip tek tıkla gönderin ya da kanal için otomatik gönderimi açın.'], ['Sonucu izleyin', 'Kabul edilen, reddedilen ve mağazada görünen ürünler ayrı ayrı listelenir.']],
    benefits: [['i-clock', 'Saatler değil dakikalar', 'Bir kez tanımla, her yere gönder'], ['i-bolt', 'Otomatik gönderim', 'Yeni ürün kendiliğinden yüklenir'], ['i-list', 'Doğru kategori', 'Panel önerir, siz onaylarsınız'], ['i-eye', 'Şeffaf takip', 'Ret nedeni açıkça görünür']],
  },
  'buybox-takibi': {
    why: ['Buybox\'ı kaybeden ilan satış yapamaz. Rakip fiyatını gün boyu kontrol edip elle güncellemek imkânsızdır; aceleyle indirilen fiyat da çoğu zaman gereğinden düşük kalır ve kârınız erir.', 'Panel buybox durumunu 15 dakikada bir kontrol eder. Kaybettiğinizde fiyatı alt sınırınızı aşmadan rakibin hemen altına çeker; buybox sizdeyken fiyatı yeniden yükseltir.'],
    example: 'buybox',
    benefits: [['i-up', 'Daha çok satış', 'Buybox\'ı kaybettiğiniz an tepki'], ['i-shield', 'Zararına satış yok', 'Alt sınırın altına inmez'], ['i-calc', 'Kâr korunur', 'Buybox sizdeyken fiyat yükselir'], ['i-list', 'Her adım kayıtlı', 'Neden değiştiği görünür']],
  },
  'kar-zarar': {
    why: ['Ciro yüksek görünse de komisyon, kargo, hizmet bedeli, stopaj, reklam ve iadeler düşüldüğünde birçok satış zarar ettirir. Bunu Excel\'de hesaplamak hem zor hem de hep gecikmelidir.', 'Panel her siparişin gerçek kesintilerini pazaryeri faturalarından çeker, alış maliyeti ve işletme giderlerini de düşer. Hangi ürünün, hangi kanalın gerçekten kazandırdığını görürsünüz.'],
    example: 'profit',
    steps: [['Alış fiyatlarını girin', 'Ürün kartından ya da Excel ile toplu olarak; bir kez girmeniz yeterli.'], ['Kesintiler gelsin', 'Komisyon, kargo, hizmet bedeli, reklam ve ceza faturaları pazaryerinden kendiliğinden çekilir.'], ['Net kârı inceleyin', 'Dönem, kanal ve ürün bazında net kârınızı ve zarar eden satışları görün.']],
    benefits: [['i-eye', 'Gerçek tablo', 'Tahmini değil, kesilen tutar'], ['i-box', 'Ürün bazında kâr', 'Zarar eden ürün fark edilir'], ['i-calendar', 'Nakit planı', 'Hakediş ne zaman yatacak'], ['i-clock', 'Excel yok', 'Her gün kendiliğinden güncel']],
  },
  'raporlar': {
    why: ['Satışların nereye gittiğini görmeden verilen karar tahmindir: hangi ürün büyüyor, hangi kanal geriliyor, hangi ilde talep var?', 'Tüm kanalların satışları tek raporda; dönemleri karşılaştırın, en çok satan ürünleri, kanal ve il dağılımını, sadık müşterilerinizi görün.'],
    steps: [['Veriler gelsin', 'Bağladığınız kanalların son bir yıllık siparişleri aktarılır.'], ['Dönemi seçin', 'Bugün, 7 gün, bu ay ya da istediğiniz tarih aralığı.'], ['Karşılaştırın', 'Önceki dönemle farkı, kanal ve ürün dağılımını inceleyin.']],
    benefits: [['i-chart', 'Doğru karar', 'Veriye dayalı stok ve fiyat'], ['i-up', 'Büyüyeni görün', 'En çok satanlar öne çıkar'], ['i-pin', 'Bölgesel talep', 'İl bazında satış haritası'], ['i-mail', 'Her sabah özet', 'E-postanıza gelir']],
  },
  'musteri-sorulari-ve-iadeler': {
    why: ['Cevapsız kalan soru kaybedilmiş satıştır; iade talepleri her pazaryerinde ayrı ekranda takip edilir ve süresi kaçırılabilir.', 'Tüm kanalların soruları ve iade talepleri tek yerde; hazır cevaplarla hızlı yanıt verin, iadeleri gerekçesiyle sonuçlandırın.'],
    steps: [['Sorular ve talepler gelsin', 'Kanallardaki yeni sorular ve iade talepleri kendiliğinden panele düşer.'], ['Yanıtlayın', 'Hazır cevap şablonunu seçin, düzenleyin, gönderin.'], ['İadeyi sonuçlandırın', 'Onaylayın ya da gerekçe ve belgeyle reddedin.']],
    benefits: [['i-up', 'Daha çok satış', 'Soru hızlı yanıtlanır'], ['i-clock', 'Süre kaçmaz', 'Bekleyenler hatırlatılır'], ['i-users', 'İş bölümü', 'Müşteri hizmetlerine özel yetki'], ['i-list', 'Tek ekran', 'Tüm kanallar bir arada']],
  },
  'ekip-ve-guvenlik': {
    why: ['Herkesin aynı hesapla girdiği bir panelde kimin ne yaptığı bilinmez; pazaryeri şifresini paylaşmak da ciddi bir güvenlik riskidir.', 'Her personelin kendi hesabı ve yalnız işi olan bölümlere yetkisi olur; iki adımlı doğrulama ve işlem kayıtlarıyla kontrol sizde kalır.'],
    steps: [['Personel ekleyin', 'Kullanıcı adı ve şifreyle hesap açın.'], ['Rolünü seçin', 'Hazır şablonlardan seçin ya da bölüm bölüm yetki verin.'], ['Güvenliği açın', 'İki adımlı doğrulamayı herkes için zorunlu tutun.']],
    benefits: [['i-lock', 'Şifre paylaşımı yok', 'Herkesin kendi hesabı'], ['i-eye', 'Görünürlük', 'Kim ne yaptı kayıtlı'], ['i-shield', 'Güçlü giriş', 'İki adımlı doğrulama'], ['i-users', 'Doğru yetki', 'Herkes yalnız işini görür']],
  },
  'stok-api': {
    why: ['Bayileriniz ya da kendi siteniz güncel stoğunuzu bilmezse olmayan ürünü satar. Stok listesini e-postayla ya da Excel\'le göndermek gecikmeli ve hatalıdır.', 'Bayinizin sistemi panelinizdeki güncel stoğu güvenli bir API ile kendisi okur; siz hiçbir şey göndermezsiniz.'],
    steps: [['Anahtarı oluşturalım', 'Bayi ya da sistem için ayrı anahtar ve izin verilen IP adresleri tanımlanır.'], ['Bayiniz bağlansın', 'Hazır kılavuzla yazılımcısı birkaç saatte bağlar.'], ['Stok hep güncel', 'Her istekte paneldeki son stok ve fiyat döner.']],
    benefits: [['i-sync', 'Anlık stok', 'Her istekte güncel'], ['i-lock', 'Güvenli', 'Anahtar + IP kısıtı'], ['i-eye', 'Yalnız okuma', 'Hiçbir şey değiştirilemez'], ['i-clock', 'Elle liste yok', 'E-posta, Excel bitti']],
  },
};
for (const f of FEATURES) Object.assign(f, MORE[f.slug] || {});

// Telefondan yönetim (ayrı özellik sayfası)
FEATURES.push({
  slug: 'mobil-yonetim', name: 'Telefondan yönetim', icon: 'i-phone', color: 'c-teal', short: 'Kurulum yok, telefonda tam panel',
  title: 'Telefondan Yönetim — Hastürk CRM', h1: ['Mağazanız', 'Cebinizde'],
  lead: 'Panel telefona göre tasarlandı: siparişleri işleme alın, stok güncelleyin, soruları yanıtlayın, kârınızı görün. Uygulama indirmeden, ana ekrana ekleyip uygulama gibi kullanın.',
  mock: 'phone',
  points: [
    ['i-phone', 'Kurulum yok', 'Tarayıcıdan açılır; ana ekrana ekleyince uygulama gibi tam ekran çalışır.'],
    ['i-bolt', 'Anlık bildirim', 'Yeni sipariş, müşteri sorusu ve önemli uyarılar telefonunuza bildirim olarak gelir.'],
    ['i-list', 'Telefona özel menü', 'Panel, siparişler, kargo ve stok alt menüde tek dokunuşla; büyük, parmakla rahat basılan düğmeler.'],
    ['i-clock', 'Hızlı açılış', 'Son görülen ekranlar telefonda saklanır; panel anında açılır, veriler arkadan yenilenir.'],
    ['i-cart', 'Sahadan işlem', 'Siparişi işleme alın, stoğu güncelleyin, soruyu yanıtlayın, iadeyi sonuçlandırın.'],
    ['i-shield', 'Güvenli', 'İki adımlı doğrulama ve oturum kontrolü telefonda da geçerli.'],
  ],
  why: ['Siparişler masa başındayken gelmez. Fuarda, depoda ya da yoldayken bir siparişi kaçırmak, bir soruyu yanıtsız bırakmak satış kaybıdır.', 'Panelin tamamı telefonda da çalışır: bildirim gelir, siparişi işleme alırsınız, stoğu güncellersiniz, kârınızı görürsünüz.'],
  steps: [['Telefondan açın', 'panel.hasturkcrm.com adresine girip oturum açın.'], ['Ana ekrana ekleyin', 'Tarayıcı menüsünden "Ana ekrana ekle" ile uygulama gibi kullanın.'], ['Bildirimleri açın', 'Yeni sipariş ve sorular için telefon bildirimine izin verin.']],
  benefits: [['i-phone', 'Her yerden yönetim', 'Masaya bağlı değilsiniz'], ['i-bolt', 'Anında haber', 'Yeni sipariş bildirimi'], ['i-clock', 'Hızlı', 'Anında açılan ekranlar'], ['i-shield', 'Güvenli', 'Aynı güvenlik telefonda']],
  faq: [
    ['Uygulama mağazasından indirmem gerekiyor mu?', 'Hayır. Panel tarayıcıda çalışır; ana ekrana ekleyince uygulama gibi açılır. Güncellemeler kendiliğinden gelir.'],
    ['iPhone ve Android\'de çalışır mı?', 'Evet. Güncel Safari ve Chrome tarayıcılarında çalışır.'],
  ],
  related: ['siparis-yonetimi', 'kargo-ve-etiket', 'raporlar'],
});
