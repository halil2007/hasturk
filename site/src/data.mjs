// Özellik ve entegrasyon sayfalarının içeriği. build.mjs her kayıt için /ozellikler/<slug> ve /entegrasyonlar/<slug> sayfasını,
// ayrıca üst menüdeki açılır listeleri buradan üretir. Yazılanlar panelin bugün yaptıklarıyla birebir olmalı (müşteriye söz veriyoruz).
// Alanlar: slug, name (menü), icon (src/sprite.svg'deki id), color (c-blue, c-green ...), short (menü açıklaması), title (sekme başlığı),
// h1 (iki parça: düz + vurgulu), lead, img (public/img'deki ekran görüntüsü; yoksa mock), points [ikon, başlık, metin],
// steps [başlık, metin] (isteğe bağlı), note {title, items[]} (isteğe bağlı "Bilmeniz gerekenler"), faq [soru, cevap], related [slug].

export const FEATURES = [
  {
    slug: 'siparis-yonetimi', name: 'Sipariş yönetimi', icon: 'i-cart', color: 'c-pink', short: 'Tüm kanalların siparişleri tek listede',
    title: 'Sipariş Yönetimi — Hastürk CRM', h1: ['Tüm Kanalların Siparişleri', 'Tek Listede'],
    lead: 'Trendyol, Hepsiburada, N11, ikas ve diğer kanallardan gelen siparişler otomatik olarak panele gelir. Hangi siparişin bugün kargoya verilmesi gerektiğini ilk bakışta görürsünüz.',
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
      ['Siparişler ne sıklıkla gelir?', 'Panel kanallarınızı gün boyu otomatik olarak kontrol eder; isterseniz "Yenile" ile hemen çekebilirsiniz.'],
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
    note: { title: 'Bilmeniz gerekenler', items: ['Stok gönderimi siz bir kanal için açana kadar kapalıdır; kapalıyken stoklar kanaldan yalnız okunur, hiçbir şey değiştirilmez.', 'Satıştan sonraki ilk kontrolde yeni stok, gönderimi açık olan diğer kanallara gider.'] },
    faq: [
      ['Aynı ürün farklı kanallarda farklı barkodla satılıyorsa?', 'Eşleştirme ekranından ilanları elle aynı ürüne bağlayabilirsiniz; bir kez bağladıktan sonra stok birlikte yönetilir.'],
      ['Bir kanala stoğumun tamamını göstermek istemiyorum.', 'Kanala özel en fazla adet tanımlayabilirsiniz; panel o kanala bu sınırı aşmayan adedi gönderir.'],
    ],
    related: ['urun-yonetimi', 'siparis-yonetimi', 'kargo-ve-etiket'],
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
    note: { title: 'Bilmeniz gerekenler', items: ['Panelden ürün yükleme Trendyol, Hepsiburada, N11, idefix ve Pazarama\'da çalışır; Çiçeksepeti, Koçtaş, Teknosa, Amazon, eBay, Etsy ve Ozon\'da kanal bağlantınız onaylanınca açılır. Yurt dışı kanallarda fiyat TCMB kuruyla kanalın para birimine çevrilir. PttAVM, Boyner ve Pasaj\'da yeni ilan kanalın kendi panelinden açılır; stok ve fiyat yine panelden gider.', 'Otomatik gönderim siz bir kanal için açana kadar kapalıdır. Reddedilen ürün, düzelttiyseniz 1 saat, düzeltmediyseniz 24 saat sonra tekrar denenir.'] },
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
      ['Sonucu izleyin', 'Panel buybox durumunu gün boyu düzenli olarak kontrol eder, gerekirse fiyatı günceller ve kaydını tutar.'],
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
    related: ['musteri-sorulari-ve-iadeler', 'siparis-yonetimi', 'mobil-yonetim'],
  },
  {
    slug: 'doviz-endeksli-fiyat', name: 'Döviz kuruna endeksli fiyat', icon: 'i-calc', color: 'c-teal', short: 'Dolar / euro fiyatı, kurla otomatik TL fiyat',
    title: 'Döviz Kuruna Endeksli Otomatik Fiyat — Hastürk CRM', h1: ['Kur Değişsin,', 'Fiyatınız Kendiliğinden Güncellensin'],
    lead: 'İthal ya da dövizle aldığınız ürünlere dolar, euro veya sterlin fiyatı girin; TL satış fiyatınız ve tüm pazaryeri fiyatlarınız güncel kurla kendiliğinden hesaplanıp kanallara gönderilsin. Kur yükseldiğinde zarar etmezsiniz.',
    mock: 'fx',
    points: [
      ['i-calc', 'Dövizle fiyat', 'Ürüne USD, EUR ya da GBP fiyatı girin; TL fiyatı kurla hesaplanır, kâr payını ürün bazında ekleyin.'],
      ['i-sync', 'Kanallara otomatik', 'Yeni TL fiyatı Trendyol, Hepsiburada ve diğer kanallara kendiliğinden gider; kanallar arasındaki fiyat farkınız korunur.'],
      ['i-clock', 'Güncelleme sıklığı', 'Anlık (piyasa kuru, ~15 dakikada bir), günlük, haftalık, aylık ya da yalnız düğmeyle; kur belirlediğiniz eşikten fazla değişince.'],
      ['i-shield', 'Resmi kur', 'Merkez Bankası (TCMB) günlük kuru ya da anlık piyasa kuru; döviz alış / satış, efektif alış / satış seçenekleri.'],
      ['i-tag', 'Yuvarlama', 'Fiyatlar kuruşuyla, tam sayıya ya da ,90 / ,99 ile bitecek şekilde yuvarlanır.'],
      ['i-eye', 'Kontrol sizde', 'Her güncelleme işlem kayıtlarına yazılır; döviz fiyatlı ürünlerin TL fiyatı elle yanlışlıkla değiştirilemez.'],
    ],
    faq: [
      ['Hangi pakette var?', 'Döviz kuruna endeksli otomatik fiyat Kurumsal pakette yer alır.'],
      ['Kur düşerse fiyatım da düşer mi?', 'Evet; fiyat kurla iki yönde de güncellenir. Küçük dalgalanmalarda fiyat değişmesin diye bir eşik (ör. %0,5) belirleyebilirsiniz.'],
      ['Pazaryerindeki fiyatım panelden farklıysa ne olur?', 'Kanal fiyatı, ürünün eski TL fiyatına göre oranı korunarak güncellenir; ör. Trendyol\'da %10 farklı satıyorsanız fark korunur.'],
    ],
    related: ['urun-yonetimi', 'buybox-takibi', 'kar-zarar'],
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
    slug: 'woocommerce', name: 'WooCommerce', kind: 'e-ticaret sitesi', color: '#7f54b3', badge: 'W', word: 'WooCommerce',
    lead: 'WordPress / WooCommerce sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin; stok ve fiyatlarınızı tüm kanallarla eşit tutun.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo bildirimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Birden fazla site', true], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'WooCommerce siparişleri diğer kanallarla aynı listeye gelir; durum değişiklikleri sitenize işlenir.'],
      ['i-sync', 'Stok ve fiyat', 'Pazaryerinde satılan ürünün stoğu WooCommerce sitenizde de düşer; fiyatlarınız eşit kalır.'],
      ['i-store', 'Birden fazla site', 'Birden fazla WooCommerce sitenizi ayrı mağazalar olarak bağlayın.'],
      ['i-tag', 'Etiket', 'Kendi kargo anlaşmanızla gönderimde etiket sipariş ve adres bilgisiyle panelden basılır.'],
    ],
    help: 'WordPress yönetimi → WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle (izin: Okuma/Yazma). Siteniz HTTPS olmalıdır.',
  },
  {
    slug: 'pttavm', name: 'PttAVM', kind: 'pazaryeri', color: '#e0a800', badge: 'Ptt', word: 'PttAVM',
    lead: 'PttAVM mağazanızın siparişlerini diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı panelden eşitleyin.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Ürün yükleme', false], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'PttAVM siparişleri otomatik olarak panele gelir.'],
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
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['Ürün yükleme', true], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Sipariş onayı', 'Yeni Pazarama siparişlerini panelden onaylayın.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız diğer kanallarla eşit kalır.'],
      ['i-chat', 'Müşteri soruları', 'Pazarama sorularını diğer kanallarla aynı listede yanıtlayın.'],
      ['i-box', 'Ürünler', 'Ürünlerinizi kategori ve özellik eşleştirmesiyle panelden Pazarama\'ya yüklersiniz (onaydan sonra satışa açılır); Pazarama\'da açtığınız ilanlar da paneldeki ürüne kendiliğinden bağlanır.'],
    ],
    help: 'Pazarama iş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri. API Key (Client ID) ve API Secret bilgileriniz gerekir.',
  },
  // Test aşamasındaki kanallar (beta: paneldeki kanal türü). Sayfada, menüde ve kartlarda "Test aşamasında" etiketiyle görünür; ana panelde
  // Entegrasyonlar → kanal → "Test yazısını kaldır" denince etiket sitede de kalkar (site.js, panelin /api/public/channels yanıtına göre).
  {
    slug: 'amazon', beta: 'amazon', name: 'Amazon', kind: 'pazaryeri', color: '#232f3e', badge: 'a', word: 'amazon',
    lead: 'Amazon mağazanızın siparişlerini diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı eşitleyin, kargo takip numarasını Amazon\'a bildirin.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Amazon\'un gönderdiği (FBA) siparişler', 'Durum takibi'], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'Amazon siparişleri diğer kanallarla aynı listeye gelir; Amazon\'un kendi deposundan gönderdiği siparişlerin durumu da izlenir.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız ilanlarınıza gönderilir; diğer kanallarla eşit kalır.'],
      ['i-truck', 'Kargo bildirimi', 'Kargo firması ve takip numarası panelden Amazon\'a bildirilir.'],
      ['i-shield', 'Alıcı bilgisi', 'Amazon alıcının adını ve açık adresini kısıtlı veri olarak verir; siparişte il ve ilçe görünür.'],
    ],
    help: 'Amazon Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme: kendi mağazanız için özel bir uygulama oluşturup yetkilendirin; LWA Client ID, Client Secret ve refresh token buradan alınır.',
  },
  {
    slug: 'ciceksepeti', beta: 'ciceksepeti', name: 'Çiçeksepeti', kind: 'pazaryeri', color: '#1e9e57', badge: 'Çs', word: 'çiçeksepeti',
    lead: 'Çiçeksepeti mağazanızın siparişlerini ve ürünlerini diğer kanallarla aynı panelde görün, stok ve fiyatlarınızı eşitleyin.',
    caps: [['Siparişler', true], ['Ürün ve stok okuma', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Çiçeksepeti panelinden'], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'Çiçeksepeti siparişleri diğer kanallarla aynı listeye gelir; durumları kanaldan güncellenir.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız ilanlarınıza gönderilir; diğer kanallarla eşit kalır.'],
      ['i-box', 'Ürünler', 'İlanlarınız stok koduyla panele gelir ve paneldeki ürünle eşleşir.'],
      ['i-truck', 'Kargo', 'Gönderi Çiçeksepeti anlaşmalı kargosuyla yapılır; takip numarası kanaldan panele gelir.'],
    ],
    help: 'Çiçeksepeti satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri sayfasından API anahtarınızı alın.',
  },
  {
    slug: 'koctas', beta: 'koctas', name: 'Koçtaş', kind: 'pazaryeri', color: '#e5541b', badge: 'K', word: 'koçtaş',
    lead: 'Koçtaş pazaryeri siparişlerinizi panelden onaylayın, kargo takip numarasını bildirin, stok ve fiyatlarınızı diğer kanallarla eşitleyin.',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Sipariş onayı', 'Yeni Koçtaş siparişlerini panelden onaylayın; diğer kanallarla aynı listede yönetin.'],
      ['i-truck', 'Kargo bildirimi', 'Kendi kargo anlaşmanızla gönderip takip numarasını panelden Koçtaş\'a bildirin.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız tekliflerinize gönderilir; diğer kanallarla eşit kalır.'],
      ['i-box', 'Ürünler', 'Barkodu Koçtaş kataloğunda olan ürün için teklif doğrudan açılır; katalogda olmayan ürün Koçtaş onayından sonra satışa açılır. Mevcut teklifleriniz paneldeki ürüne bağlanır.'],
    ],
    help: 'Koçtaş satıcı paneli → sağ üstteki kullanıcı menüsü → API Anahtarı sayfasından anahtarınızı alın.',
  },
  {
    slug: 'shopify', beta: 'shopify', name: 'Shopify', kind: 'e-ticaret sitesi', color: '#5e8e3e', badge: 'S', word: 'shopify',
    lead: 'Shopify sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin; stok ve fiyatlarınızı tüm kanallarla eşit tutun, kargo bilgisini müşterinize Shopify üzerinden iletin.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Birden fazla site', true], ['Ürün oluşturma', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'Shopify siparişleri diğer kanallarla aynı listeye gelir.'],
      ['i-sync', 'Stok ve fiyat', 'Pazaryerinde satılan ürünün stoğu Shopify sitenizde de düşer; fiyatlarınız eşit kalır.'],
      ['i-truck', 'Kargo bildirimi', 'Kargo firması ve takip numarası Shopify\'a işlenir, müşterinize bildirim gider.'],
      ['i-tag', 'Etiket', 'Kendi kargo anlaşmanızla gönderimde etiket sipariş ve adres bilgisiyle panelden basılır.'],
    ],
    help: 'Shopify Dev Dashboard (dev.shopify.com) → uygulama oluşturun, sipariş, ürün, stok ve gönderim izinlerini verip mağazanıza kurun; Client ID ve Client secret bilgilerinizi panele girin.',
  },
  {
    slug: 'opencart', beta: 'opencart', name: 'OpenCart', kind: 'e-ticaret sitesi', color: '#23a8e0', badge: 'OC', word: 'OpenCart',
    lead: 'OpenCart sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin; stok ve fiyatlarınızı tüm kanallarla eşit tutun.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Birden fazla site', true], ['Ürün oluşturma', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'OpenCart siparişleri diğer kanallarla aynı listeye gelir; seçenekli ürünlerin her seçeneği ayrı varyant olarak eşleşir.'],
      ['i-sync', 'Stok ve fiyat', 'Pazaryerinde satılan ürünün stoğu OpenCart sitenizde de düşer; fiyatlarınız eşit kalır.'],
      ['i-truck', 'Kargo bildirimi', 'Kargo firması ve takip numarası sipariş geçmişine müşterinin göreceği not olarak işlenir.'],
      ['i-link', 'Bağlantı dosyası', 'OpenCart\'ın hazır bir yönetim API\'si olmadığı için bağlantı, panelden indirdiğiniz tek bir dosyayla kurulur.'],
    ],
    help: 'Panelde Entegrasyonlar → OpenCart → Bağlantı dosyasını indirin, OpenCart\'ın kurulu olduğu ana klasöre (config.php\'nin yanına) yükleyin ve site adresinizi girin. Siteniz HTTPS olmalıdır.',
  },
  {
    slug: 'etsy', beta: 'etsy', name: 'Etsy', kind: 'yurt dışı pazaryeri', color: '#f1641e', badge: 'E', word: 'Etsy',
    lead: 'Etsy mağazanızın siparişlerini diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı eşitleyin, kargo takip numarasını Etsy\'ye bildirin. Yurt dışı pazaryerleri Kurumsal pakette yer alır.',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
    points: [
      ['i-cart', 'Siparişler', 'Etsy siparişleri diğer kanallarla aynı listeye gelir.'],
      ['i-sync', 'Stok ve fiyat', 'Stok ve fiyatlarınız ilanlarınıza ve varyantlarına gönderilir; diğer kanallarla eşit kalır.'],
      ['i-truck', 'Kargo bildirimi', 'Kargo firması ve takip numarası panelden Etsy\'ye bildirilir.'],
      ['i-box', 'Ürünler', 'Aktif ilanlarınız ve varyantları panele gelir, paneldeki ürünle eşleşir.'],
    ],
    help: 'etsy.com/developers → Your Apps: uygulama oluşturun (keystring ve shared secret), uygulamayı mağazanız için yetkilendirip refresh token alın.',
  },
  {
    slug: 'teknosa', beta: 'teknosa', name: "Teknosa", kind: 'pazaryeri', color: '#005bab', badge: "T", word: "Teknosa",
    lead: "Teknosa siparişlerinizi diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı eşitleyin, kargo takip numarasını panelden bildirin.",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Ürün yükleme", true], ["Sipariş komisyonu", true], ["Müşteri soruları", false], ["İade talepleri", false]],
    points: [["i-cart", "Siparişler", "Teknosa siparişleri diğer kanallarla aynı listeye gelir, panelden kabul edilir."], ["i-sync", "Stok ve fiyat", "Stok ve fiyatlarınız diğer kanallarla eşit kalır."], ["i-truck", "Kargo bildirimi", "Kargo firması ve takip numarası panelden bildirilir."], ["i-box", "Ürünler", "Barkodu Teknosa kataloğunda olan ürün için teklif doğrudan açılır; katalogda olmayan ürün Teknosa onayından sonra satışa açılır. Mevcut teklifleriniz paneldeki ürüne bağlanır."]],
    extra: [["i-truck", "İki kargo modeli", "Kendi kargo anlaşmanızla gönderimde takip numarası panelden Teknosa'ya bildirilir; Teknosa'nın anlaşmalı kargosunu kullanıyorsanız takip numarası Teknosa'dan gelir, panel yalnız kargoya verildiğini bildirir."], ["i-calc", "Komisyon siparişte", "Teknosa'nın sipariş satırındaki komisyonu panele gelir; her siparişin net kârı bu tutarla hesaplanır."]],
    help: "Teknosa satıcı paneline girin → sağ üst kullanıcı menüsü → API Anahtarı → anahtarı oluşturup kopyalayın. Birden çok mağazanız varsa mağaza numaranızı da girin.",
  },
  {
    slug: 'boyner', dev: true, name: "Boyner", kind: 'pazaryeri', color: '#000000', badge: "B", word: "Boyner",
    lead: "Boyner siparişlerinizi diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı eşitleyin, kargo takip numarasını panelden bildirin.",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Ürün yükleme", false], ["Müşteri soruları", false], ["İade talepleri", false]],
    points: [["i-cart", "Siparişler", "Boyner siparişleri diğer kanallarla aynı listeye gelir, panelden onaylanır."], ["i-sync", "Stok ve fiyat", "Stok ve fiyatlarınız diğer kanallarla eşit kalır."], ["i-truck", "Kargo bildirimi", "Kargo firması ve takip numarası panelden bildirilir."], ["i-box", "Ürünler", "İlanlarınız panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-box", "Paketler tek siparişte", "Boyner aynı siparişin paketlerini ayrı kayıtlar olarak verir; panel bunları tek siparişte toplar."], ["i-truck", "İki kargo modeli", "Boyner'in anlaşmalı kargosunda takip numarası Boyner'den gelir; kendi kargo anlaşmanızla gönderimde takip numarası panelden bildirilir."]],
    help: "Boyner satıcı paneline (merchant.boyner.com.tr) girin → sağ üstte mağaza adı → Hesabım → Entegrasyon Bilgileri. Satıcı ID, API Key ve API Secret değerlerini kopyalayın; ekran yoksa Boyner entegrasyon ekibinden isteyin.",
  },
  {
    slug: 'pasaj', dev: true, name: "Turkcell Pasaj", kind: 'pazaryeri', color: '#ffc900', badge: "P", word: "Pasaj",
    lead: "Turkcell Pasaj siparişlerinizi diğer kanallarla aynı listede yönetin, stok ve fiyatlarınızı eşitleyin, kargo takip numarasını panelden bildirin.",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Ürün yükleme", false], ["Müşteri soruları", false], ["İade talepleri", false]],
    points: [["i-cart", "Siparişler", "Turkcell Pasaj siparişleri diğer kanallarla aynı listeye gelir, panelden onaylanır."], ["i-sync", "Stok ve fiyat", "Stok ve fiyatlarınız diğer kanallarla eşit kalır."], ["i-truck", "Kargo bildirimi", "Kargo firması ve takip numarası panelden bildirilir."], ["i-box", "Ürünler", "İlanlarınız panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-box", "Paketler tek siparişte", "Pasaj aynı siparişin paketlerini ayrı kayıtlar olarak verir; panel bunları tek siparişte toplar."], ["i-truck", "İki kargo modeli", "Pasaj'ın anlaşmalı kargosunda takip numarası Pasaj'dan gelir; kendi kargo anlaşmanızla gönderimde takip numarası panelden bildirilir."]],
    help: "Önce Pasaj danışmanınızdan API erişiminin açılmasını ve entegrasyon adresini isteyin (API varsayılan olarak kapalıdır). Ardından Pasaj Seller Admin → sağ üstte kullanıcı adınız → Entegrasyon Bilgileri → \"Yeni Oluştur\" ile Satıcı ID, API Key ve API Secret oluşturun.",
  },
  {
    slug: 'trendyolgo', beta: 'trendyolgo', name: "Trendyol Go", kind: 'hızlı market', color: '#ff6000', badge: "TG", word: "Trendyol Go",
    lead: "Trendyol Go siparişlerini pazaryeri siparişlerinizle aynı ekranda görün, hazırlayıp kuryeye teslim edin; stok ve fiyatlarınız tüm kanallarla eşit kalsın.",
    caps: [["Siparişler", true], ["Hazırlandı / kuryeye teslim bildirimi", true], ["Stok ve fiyat gönderimi", true], ["Kurye", "Platformun kuryesi"], ["Ürün yükleme", false]],
    points: [["i-cart", "Siparişler", "Trendyol Go siparişleri diğer kanallarla aynı listeye gelir."], ["i-truck", "Hazırlama ve teslim", "Sipariş hazırlanınca panelden bildirirsiniz; kurye platformdan gelir."], ["i-sync", "Stok ve fiyat", "Tükenen ürün bu kanalda da tükenir, fiyatlarınız eşit kalır."], ["i-box", "Ürünler", "Mağaza ürünleriniz panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-store", "Şube bazında stok ve fiyat", "Stok ve fiyat şube (mağaza) bazında gönderilir; birden çok şubeniz varsa her biri için ayrı tutulur."], ["i-orders", "Sipariş akışı", "Siparişi panelden işleme alırsınız; toplama bitince “hazırlandı” bildirilir ve sipariş kuryenin teslim almasına hazır olur."]],
    help: "Trendyol Go satıcı paneline (partner.tgomarket.com) girin → sağ üstte mağaza adınız → Hesap Bilgilerim → Entegrasyon Bilgileri: Satıcı ID, API Key ve API Secret. Şube numaralarınızı kategori sorumlunuzdan alın; bağlantı testi şube listesini de gösterir.",
  },
  {
    slug: 'getir', dev: true, name: "Getir Çarşı", kind: 'hızlı market', color: '#5d3ebc', badge: "G", word: "getir",
    lead: "Getir Çarşı siparişlerini pazaryeri siparişlerinizle aynı ekranda görün, hazırlayıp kuryeye teslim edin; stok ve fiyatlarınız tüm kanallarla eşit kalsın.",
    caps: [["Siparişler", true], ["Hazırlandı / kuryeye teslim bildirimi", true], ["Stok ve fiyat gönderimi", true], ["Kurye", "Platformun kuryesi"], ["Ürün yükleme", false]],
    points: [["i-cart", "Siparişler", "Getir Çarşı siparişleri diğer kanallarla aynı listeye gelir."], ["i-truck", "Hazırlama ve teslim", "Sipariş hazırlanınca panelden bildirirsiniz; kurye platformdan gelir."], ["i-sync", "Stok ve fiyat", "Tükenen ürün bu kanalda da tükenir, fiyatlarınız eşit kalır."], ["i-box", "Ürünler", "Mağaza ürünleriniz panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-bolt", "Hızlı yanıt", "Getir Çarşı siparişlerinin kısa sürede yanıtlanması gerekir; yeni siparişi panelden işleme alır, hazır olunca bildirirsiniz."], ["i-tag", "Üstü çizili fiyat", "Satış fiyatıyla birlikte üstü çizili fiyat da gönderilebilecek."]],
    help: "Getir Çarşı API anahtarları satıcı panelinden alınmaz: getircarsiapi@getir.com adresine (ya da Getir temsilcinize) mağaza adı ve mağaza numaranızla API erişimi talep edin; Getir uygulama anahtarını ve mağaza anahtarını iletir.",
  },
  {
    slug: 'yemeksepeti', beta: 'yemeksepeti', name: "Yemeksepeti Market", kind: 'hızlı market', color: '#fa0050', badge: "YS", word: "yemeksepeti",
    lead: "Yemeksepeti Market siparişlerini pazaryeri siparişlerinizle aynı ekranda görün, hazırlayıp kuryeye teslim edin; stok ve fiyatlarınız tüm kanallarla eşit kalsın.",
    caps: [["Siparişler", true], ["Hazırlandı / kuryeye teslim bildirimi", true], ["Stok ve fiyat gönderimi", true], ["Kurye", "Platformun kuryesi"], ["Ürün yükleme", false]],
    points: [["i-cart", "Siparişler", "Yemeksepeti Market siparişleri diğer kanallarla aynı listeye gelir."], ["i-truck", "Hazırlama ve teslim", "Sipariş hazırlanınca panelden bildirirsiniz; kurye platformdan gelir."], ["i-sync", "Stok ve fiyat", "Tükenen ürün bu kanalda da tükenir, fiyatlarınız eşit kalır."], ["i-box", "Ürünler", "Mağaza ürünleriniz panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-orders", "Bulunamayan ürün", "Toplama sırasında bulamadığınız ürünü siparişten çıkarırsınız; Yemeksepeti'ne bu satır “bulunamadı” olarak bildirilir."], ["i-store", "Şube bazında stok ve fiyat", "Zincirinizdeki her şube ayrı mağaza olarak eklenir; stok ve fiyat şube bazında gönderilir."], ["i-truck", "Kurye modeli", "Yemeksepeti kuryesiyle çalışıyorsanız sipariş “teslim almaya hazır”, kendi kuryenizle çalışıyorsanız “yola çıktı” olarak bildirilir."]],
    help: "Yemeksepeti Partner Portal → Mağaza Entegrasyonları (Shop Integrations) bölümünden client_id ve client_secret oluşturun; zincir ve mağaza numaralarınızı aynı ekrandan ya da hesap yöneticinizden alın.",
  },
  {
    slug: 'ebay', beta: 'ebay', name: "eBay", kind: 'yurt dışı pazaryeri', color: '#E53238', badge: "e", word: "ebay",
    lead: "eBay siparişlerinizi Türkiye'deki kanallarınızla aynı panelde yönetin; stok ve fiyatlarınızı eşitleyin, takip numarasını panelden bildirin. Yurt dışı pazaryerleri Kurumsal pakette yer alır.",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Döviz ile fiyat (Kurumsal)", true], ["Ürün yükleme", true]],
    points: [["i-cart", "Siparişler", "eBay siparişleri TCMB kuruyla TL'ye çevrilerek diğer kanallarla aynı listeye gelir."], ["i-sync", "Stok ve fiyat", "Yurt içinde satılan ürünün stoğu bu kanalda da düşer."], ["i-truck", "Kargo bildirimi", "Takip numarası panelden bildirilir."], ["i-calc", "Döviz", "Döviz kuruna endeksli fiyatla birlikte kullanılabilir."]],
    extra: [["i-globe", "eBay pazarınız", "ABD, İngiltere, Almanya gibi hangi eBay pazarında satıyorsanız bağlantı o pazar için kurulur."], ["i-box", "İlanlar ve varyantlar", "eBay'in envanter sistemindeki ilanlarınız panele gelir; panelden yüklediğiniz üründe her varyant ayrı ilan olarak açılır."]],
    help: "developer.ebay.com'da ücretsiz geliştirici hesabı açıp üretim (Production) anahtar setini (App ID ve Cert ID) oluşturun; ardından aynı ekrandan eBay satıcı hesabınızla oturum açıp izin vererek refresh token alın. Kurulumda bu adımları birlikte yapıyoruz.",
  },
  {
    slug: 'ozon', beta: 'ozon', name: "Ozon", kind: 'yurt dışı pazaryeri', color: '#005BFF', badge: "O", word: "OZON",
    lead: "Ozon siparişlerinizi Türkiye'deki kanallarınızla aynı panelde yönetin; stok ve fiyatlarınızı eşitleyin, takip numarasını panelden bildirin. Yurt dışı pazaryerleri Kurumsal pakette yer alır.",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo etiketi", "Ozon etiketi (FBS)"], ["Kargo / takip bildirimi", true], ["Döviz ile fiyat (Kurumsal)", true], ["Ürün yükleme", true]],
    points: [["i-cart", "Siparişler", "Ozon siparişleri TCMB kuruyla TL'ye çevrilerek diğer kanallarla aynı listeye gelir."], ["i-sync", "Stok ve fiyat", "Yurt içinde satılan ürünün stoğu bu kanalda da düşer."], ["i-truck", "Kargo bildirimi", "Takip numarası panelden bildirilir."], ["i-calc", "Döviz", "Döviz kuruna endeksli fiyatla birlikte kullanılabilir."]],
    extra: [["i-tag", "Ozon etiketi", "FBS siparişlerinde panelden “Topla” dediğinizde Ozon gönderiyi hazırlar; etiket (PDF) Ozon'dan alınır."], ["i-truck", "FBS ve rFBS", "Ozon lojistiğiyle giden FBS gönderilerinde kurye Ozon'undur; kendi gönderdiğiniz rFBS siparişlerinde takip numarası panelden Ozon'a bildirilir."]],
    help: "seller.ozon.ru → Ayarlar → Seller API sayfasında Client ID'yi kopyalayın ve Admin rolünde bir API anahtarı oluşturun (anahtar yalnız bir kez gösterilir). Birden fazla FBS deponuz varsa stokların yazılacağı depoyu kurulumda seçeriz.",
  },
  {
    slug: 'ticimax', beta: 'ticimax', name: "Ticimax", kind: 'e-ticaret sitesi', color: '#00A8E8', badge: "Tx", word: "ticimax",
    lead: "Ticimax sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin; stok ve fiyatlarınızı tüm kanallarla eşit tutun.",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Birden fazla site", true], ["Ürün oluşturma", false]],
    points: [["i-cart", "Siparişler", "Ticimax siparişleri diğer kanallarla aynı listeye gelir."], ["i-sync", "Stok ve fiyat", "Pazaryerinde satılan ürünün stoğu sitenizde de düşer."], ["i-truck", "Kargo bildirimi", "Kargo firması ve takip numarası sitenize işlenir."], ["i-box", "Ürünler", "Ürün ve varyantlarınız panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-truck", "Müşteriye kargo bildirimi", "Sipariş kargoya verildiğinde takip numarası ve takip bağlantısı Ticimax sitenize işlenir; Ticimax müşterinize e-posta gönderir."], ["i-box", "Varyantlar", "Ticimax'taki her varyasyon panelde ayrı ilan olarak eşleşir; stok ve fiyat varyasyon bazında gönderilir."]],
    help: "Ticimax yönetim paneli → Ayarlar → WS Yetki Kodu Yönetimi → yeni kod oluşturun; yetki tablosunda sipariş ve ürün servislerini işaretleyip kaydedin. Kodu ve sitenizin alan adını panele girin; bağlantı testi yetki eksikse uyarır.",
  },
  {
    slug: 'ideasoft', beta: 'ideasoft', name: "IdeaSoft", kind: 'e-ticaret sitesi', color: '#F26B21', badge: "iS", word: "IdeaSoft",
    lead: "IdeaSoft sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin; stok ve fiyatlarınızı tüm kanallarla eşit tutun.",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Birden fazla site", true], ["Ürün oluşturma", false]],
    points: [["i-cart", "Siparişler", "IdeaSoft siparişleri diğer kanallarla aynı listeye gelir."], ["i-sync", "Stok ve fiyat", "Pazaryerinde satılan ürünün stoğu sitenizde de düşer."], ["i-truck", "Kargo bildirimi", "Kargo firması ve takip numarası sitenize işlenir."], ["i-box", "Ürünler", "Ürün ve varyantlarınız panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-box", "Varyantlar", "IdeaSoft'taki her varyant panelde ayrı ilan olarak eşleşir; stok ve fiyat varyant bazında gönderilir."], ["i-truck", "Kargo bildirimi", "Sipariş kargoya verildiğinde durumu ve takip kodu IdeaSoft sitenize işlenir."]],
    help: "IdeaSoft yönetim paneli → Entegrasyonlar → API → Ekle ile bir uygulama oluşturun ve sipariş ile ürün izinlerini verin. Yetkilendirme adımını kurulumda birlikte yapıyoruz; bağlantı bir kez kurulduktan sonra panel kendini yeniler.",
  },
  {
    slug: 'tsoft', beta: 'tsoft', name: "T-Soft", kind: 'e-ticaret sitesi', color: '#E30613', badge: "T", word: "T-Soft",
    lead: "T-Soft sitenizin siparişlerini pazaryeri siparişlerinizle aynı listede yönetin; stok ve fiyatlarınızı tüm kanallarla eşit tutun.",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Birden fazla site", true], ["Ürün oluşturma", false]],
    points: [["i-cart", "Siparişler", "T-Soft siparişleri diğer kanallarla aynı listeye gelir."], ["i-sync", "Stok ve fiyat", "Pazaryerinde satılan ürünün stoğu sitenizde de düşer."], ["i-truck", "Kargo bildirimi", "Kargo firması ve takip numarası sitenize işlenir."], ["i-box", "Ürünler", "Ürün ve varyantlarınız panele gelir, paneldeki ürünle eşleşir."]],
    extra: [["i-calc", "KDV doğru yazılır", "T-Soft fiyatları KDV hariç tutar; panel KDV dahil fiyatınızı KDV'yi düşerek gönderir."], ["i-box", "Ana ürün ve alt ürünler", "Alt ürünleriniz (varyantlar) panelde ayrı ilan olarak eşleşir; stok varyant bazında gönderilir."]],
    help: "T-Soft yönetim paneli → Ayarlar → Kullanıcı Yönetimi → Web Servis Kullanıcıları → Yeni kullanıcı: sipariş ve ürün servislerine yetki verin (isterseniz yalnız API için “Sınırlı Hesap” seçin). Kullanıcı adı ve şifreyi panele girin.",
  },
];

// ---------- kargo firması ve kargo entegratörü sayfaları: /entegrasyonlar/<slug> ----------
// Kaynak: panel/src/carriers.js ve panel/src/carriers/<firma>.js (yalnız bağlantının bugün yaptıkları yazılır).
// Alanlar: slug, panel (paneldeki firma kimliği), name, kind ('kargo firması' | 'kargo entegratörü'), color, word (logo kutusundaki yazı),
// beta (panelde test aşamasında), plan, lead, caps [işlem, true | false | 'açıklama'], tiles [ikon, başlık, metin] (firmaya özel),
// need (firmadan istenecek bilgiler), setup [başlık, metin] (kurulum adımları), faq [soru, cevap] (firmaya özel), title / desc (arama sonucu).
// Kargonomi'nin ayrıntılı sayfası /ozellikler/kargonomi-entegrasyonu'dur (page ile oraya bağlanır, ayrı sayfa üretilmez).
export const CARRIERS = [
  {
    slug: 'yurtici-kargo', panel: 'yurtici', name: 'Yurtiçi Kargo', kind: 'kargo firması', color: '#004a99', word: 'Yurtiçi',
    lead: 'Yurtiçi Kargo ile yaptığınız kurumsal anlaşmayla gönderilerinizi panelden açın: kargo anahtarı etikete barkod olarak basılır, şube okutunca Yurtiçi gönderi kodu ve takip adresi siparişe kendiliğinden yazılır, teslimat panelden izlenir.',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'Panel etiketi + barkod'], ['Takip numarası', 'Şube kabulünden sonra'], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
    tiles: [
      ['i-tag', 'Barkodlu etiket', 'Gönderi açılınca panel, Yurtiçi\'ne bildirilen kargo anahtarını barkod olarak etikete basar; etiketi termal ya da normal yazıcıdan yazdırırsınız.'],
      ['i-eye', 'Gönderi kodu kendiliğinden', 'Şube paketi okuttuğunda Yurtiçi gönderi kodunu ve takip adresini verir; panel takip sorgusuyla bunları pakete yazar.'],
      ['i-calc', 'Kargo ücreti', 'Yurtiçi\'nin bildirdiği toplam kargo ücreti siparişin kargo giderine yazılır; sipariş kârınız gerçek maliyetle hesaplanır.'],
    ],
    need: 'Yurtiçi Kargo şubenizden gönderici ödemeli web servis kullanıcı adı ve şifresi.',
    title: 'Yurtiçi Kargo Entegrasyonu: Etiket ve Takip | Hastürk CRM',
    desc: 'Yurtiçi Kargo entegrasyonu: kendi anlaşmanızla gönderi açın, barkodlu etiketi basın; gönderi kodu, kargo ücreti ve teslimat panele gelsin.',
  },
  {
    slug: 'aras-kargo', panel: 'aras', name: 'Aras Kargo', kind: 'kargo firması', color: '#e30613', word: 'Aras',
    lead: 'Aras Kargo ile kendi anlaşmanızdan gönderi açın: barkod yetkili hesaplarda Aras etiketi ve takip numarası anında gelir, diğer hesaplarda etiket panelden barkodla basılır. Kargo durumu ve ücreti Aras\'tan düzenli okunur.',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'Aras etiketi (ZPL) ya da panel etiketi'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', 'İrsaliye kesilmeden önce']],
    tiles: [
      ['i-tag', 'Aras etiketi', 'Hesabınızda barkod yetkisi varsa Aras etiketi (termal yazıcı için ZPL) ve 13 haneli takip numarası gönderiyle birlikte gelir; yoksa etiket parça barkoduyla panelden basılır.'],
      ['i-eye', 'Durum ve ücret takibi', 'Aras\'ın takip servisi bağlıysa gönderinin durumu ve kargo ücreti panele düzenli olarak gelir.'],
      ['i-x', 'İptal', 'Henüz irsaliyesi kesilmemiş gönderiyi panelden iptal edersiniz; irsaliye kesildiyse iptali Aras şubesi yapar.'],
    ],
    need: 'Aras Kargo şubenizden ya da entegrasyon ekibinden sevkiyat entegrasyonu kullanıcı adı ve şifresi; kargo durumu takibi için Aras\'ın kurumsal panelinde (esasweb) açacağınız takip servisi kullanıcısı ve müşteri kodunuz.',
    title: 'Aras Kargo Entegrasyonu: Etiket ve Takip | Hastürk CRM',
    desc: 'Aras Kargo entegrasyonu: kendi anlaşmanızla gönderi açın, Aras etiketi ve takip numarasını panelden alın; kargo durumu ve ücreti kendiliğinden gelsin.',
  },
  {
    slug: 'ptt-kargo', panel: 'ptt', name: 'PTT Kargo', kind: 'kargo firması', color: '#f5b400', word: 'PTT Kargo',
    lead: 'PTT Kargo kurumsal müşterisi olarak gönderilerinizi panelden PTT\'ye yükleyin: size verilen barkod aralığından sıradaki barkod etikete basılır, şubede okutulunca gönderi kabul edilir ve takibi panelden yapılır.',
    caps: [['Gönderi oluşturma (veri yükleme)', true], ['Kargo etiketi', 'Panel etiketi + PTT barkodu'], ['Takip numarası', true], ['Kargo durumu takibi', 'Şube kabulünden sonra'], ['Gönderi iptali', 'Şube kabulünden önce']],
    tiles: [
      ['i-tag', 'PTT barkodu', 'PTT\'nin size verdiği barkod aralığından sıradaki numara kontrol hanesiyle birlikte etikete basılır; sıra sayacı panelde tutulur.'],
      ['i-eye', 'Şube kabulü ve takip', 'Paket şubede okutulunca gönderi kabul edilir; panel kargo durumunu bu andan sonra PTT\'den sorgular.'],
      ['i-x', 'İptal', 'Şubeye verilmemiş gönderinin kaydı panelden silinir.'],
    ],
    need: 'PTT Kargo bölge müdürlüğünüzden müşteri numarası, web servis şifresi ve barkod aralığı (12 haneli başlangıç ve bitiş numarası).',
    title: 'PTT Kargo Entegrasyonu: Barkod ve Takip | Hastürk CRM',
    desc: 'PTT Kargo entegrasyonu: gönderilerinizi panelden PTT\'ye yükleyin, barkodlu etiketi basın; şube kabulünden sonra kargo durumu panelden izlensin.',
  },
  {
    slug: 'ups-kargo', panel: 'ups', name: 'UPS Kargo', kind: 'kargo firması', color: '#351c15', word: 'UPS',
    lead: 'UPS Türkiye ile yurt içi gönderilerinizi panelden açın: UPS takip numarası ve paket etiketi anında gelir, teslimat UPS\'ten izlenir, UPS\'in hesapladığı kargo ücreti siparişe yazılır.',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'UPS etiketi (görsel)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
    tiles: [
      ['i-tag', 'UPS etiketi', 'Gönderi açıldığında UPS takip numarası ve her paketin etiketi aynı anda gelir; yazdırıp paketin üzerine yapıştırırsınız.'],
      ['i-truck', 'Servis seçimi', 'Standart, Express Saver ya da Express 10:30 servislerinden anlaşmanıza uygun olanı seçersiniz.'],
      ['i-calc', 'Kargo ücreti', 'UPS\'in gönderi için hesapladığı ücret paket bilgisinden okunur ve siparişin kargo giderine yazılır.'],
    ],
    need: 'UPS Türkiye satış temsilcinizden müşteri numarası ve web servis kullanıcı adı / şifresi (takip için ayrı kullanıcı verildiyse onu da).',
    title: 'UPS Kargo Entegrasyonu: Etiket ve Takip | Hastürk CRM',
    desc: 'UPS Kargo entegrasyonu: yurt içi gönderiyi panelden açın, UPS etiketi ve takip numarası anında gelsin; teslimat ve kargo ücreti kendiliğinden izlensin.',
  },
  {
    slug: 'hepsijet', panel: 'hepsijet', name: 'HepsiJET', kind: 'kargo firması', color: '#ff6000', word: 'HepsiJET',
    lead: 'HepsiJET ile kendi anlaşmanızdan gönderi açın: HepsiJET etiketi gönderiyle aynı anda gelir, termal yazıcıdan basılır; gönderinin durumu HepsiJET\'ten izlenir.',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'HepsiJET etiketi (ZPL)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Teslimat türü', 'Standart, ertesi gün, aynı gün'], ['Gönderi iptali', true]],
    tiles: [
      ['i-tag', 'Anında etiket', 'Gönderi açılır açılmaz HepsiJET etiketi (termal yazıcı için ZPL) ve gönderi numarası pakete yazılır.'],
      ['i-truck', 'Teslimat türü', 'Anlaşmanıza göre standart, ertesi gün ya da aynı gün teslimat türünü seçersiniz.'],
      ['i-store', 'Çıkış deposu', 'Gönderiler HepsiJET\'in size tanımladığı çıkış deposundan (XDock) çıkar; depo kodu bağlantıda bir kez girilir.'],
    ],
    need: 'HepsiJET kurumsal satış ekibinden entegrasyon kullanıcı adı, şifre, firma kodu ve çıkış deposu (XDock) kodu.',
    title: 'HepsiJET Entegrasyonu: Etiket ve Takip | Hastürk CRM',
    desc: 'HepsiJET entegrasyonu: kendi anlaşmanızla gönderi açın, HepsiJET etiketi anında gelsin; standart, ertesi gün ya da aynı gün teslimat. Takip panelde.',
  },
  {
    slug: 'dhl-ecommerce', panel: 'dhl', name: 'DHL eCommerce', kind: 'kargo firması', color: '#d40511', word: 'DHL eCom',
    lead: 'DHL eCommerce (eski MNG Kargo) ile kendi anlaşmanızdan gönderi açın: gönderi numarası ve DHL etiketi panele gelir, kargo durumu ve kesinleşen kargo ücreti DHL\'den düzenli okunur.',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'DHL etiketi (ZPL)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
    tiles: [
      ['i-tag', 'DHL etiketi', 'Gönderi açılınca DHL eCommerce gönderi numarasını ve termal yazıcı için etiketi verir. Varış şubesi o an belirlenemezse etiket hazır olunca panel kendisi alır.'],
      ['i-calc', 'Kesin kargo ücreti', 'DHL\'in gönderi için hesapladığı toplam ücret takipte okunur ve siparişin kargo giderine yazılır.'],
      ['i-x', 'İptal', 'Gönderiyi panelden iptal edersiniz; DHL\'deki sipariş kaydı ve barkod birlikte iptal edilir.'],
    ],
    need: 'DHL eCommerce geliştirici portalında açacağınız uygulamanın Client ID / Client Secret bilgileri ile şubenizden alacağınız müşteri numarası ve şifresi.',
    title: 'DHL eCommerce (MNG) Kargo Entegrasyonu | Hastürk CRM',
    desc: 'DHL eCommerce (MNG Kargo) entegrasyonu: kendi anlaşmanızla gönderi açın, DHL etiketi ve takip numarası panele gelsin; kargo ücreti ve teslimat izlensin.',
  },
  {
    slug: 'surat-kargo', panel: 'surat', name: 'Sürat Kargo', kind: 'kargo firması', color: '#0b3c8c', word: 'Sürat',
    lead: 'Sürat Kargo ile kendi anlaşmanızdan gönderi açın: gönderi Sürat\'a ön kabul olarak bildirilir, etiket barkoduyla basılır; şube okutunca Sürat takip numarası siparişe kendiliğinden yazılır.',
    caps: [['Gönderi oluşturma (ön kabul)', true], ['Kargo etiketi', 'Panel etiketi ya da Sürat etiketi (PDF)'], ['Takip numarası', 'Şube kabulünden sonra'], ['Kargo durumu takibi', true], ['Gönderi iptali', true]],
    tiles: [
      ['i-tag', 'Etiket', 'Gönderinin barkodu panel etiketine basılır; hesabınızda barkod yetkisi varsa Sürat\'ın kendi etiketini (PDF) de panelden alırsınız.'],
      ['i-eye', 'Takip numarası kendiliğinden', 'Şube paketi okuttuğunda Sürat takip numarasını verir; panel takip sorgusuyla bunu pakete yazar ve durumu izler.'],
      ['i-x', 'İptal', 'Sürat web servis şifrenizi girdiyseniz gönderiyi panelden iptal edersiniz.'],
    ],
    need: 'Sürat Kargo şubenizden cari kodunuz ve web servis şifresi; panelden iptal ve Sürat etiketi için e-Sürat profilinizde belirlediğiniz web servis şifresi.',
    title: 'Sürat Kargo Entegrasyonu: Gönderi ve Takip | Hastürk CRM',
    desc: 'Sürat Kargo entegrasyonu: kendi anlaşmanızla gönderi açın, barkodlu etiketi basın; takip numarası şube kabulünden sonra siparişe yazılsın.',
  },
  {
    slug: 'kolay-gelsin', panel: 'kolaygelsin', name: 'Kolay Gelsin', kind: 'kargo firması', color: '#00a651', word: 'Kolay Gelsin', beta: true,
    lead: 'Kolay Gelsin ile kendi anlaşmanızdan gönderi açın: Kolay Gelsin gönderi numarası takip numarası olarak siparişe yazılır, etiket paketi taşıyacak müşteri barkoduyla panelden basılır.',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'Panel etiketi + müşteri barkodu'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Gönderi iptali', true]],
    tiles: [
      ['i-tag', 'Müşteri barkoduyla etiket', 'Kolay Gelsin paketi sizin barkodunuzla taşır: panel bu barkodu etikete basar, gönderi numarası takip numarası olarak siparişe yazılır.'],
      ['i-eye', 'Durum takibi', 'Kolay Gelsin panelinde takip etmek istediğiniz gönderi durumlarını seçtiğinizde bu durumlar panele gelir.'],
      ['i-x', 'İptal ve iade', 'Toplanmamış gönderi panelden iptal edilir; toplanmış ama teslim edilmemiş gönderide teslimat durdurulur ve iade süreci başlar.'],
    ],
    need: 'Kolay Gelsin kurumsal satış ekibinden entegrasyon anahtarı (token), müşteri numaranız ve gönderen adres numaranız.',
    title: 'Kolay Gelsin Entegrasyonu: Etiket ve Takip | Hastürk CRM',
    desc: 'Kolay Gelsin entegrasyonu: kendi anlaşmanızla gönderi açın, müşteri barkodlu etiketi panelden basın; takip numarası ve kargo durumu siparişe gelsin.',
  },
  {
    slug: 'sendeo', panel: 'sendeo', name: 'Sendeo', kind: 'kargo firması', color: '#00b140', word: 'Sendeo', beta: true,
    lead: 'Sendeo ile kendi anlaşmanızdan gönderi açın: iş emri Sendeo\'ya iletilir, Sendeo etiketi ve takip numarası anında gelir; kargo durumu ve ücreti Sendeo\'dan izlenir.',
    caps: [['Gönderi oluşturma (iş emri)', true], ['Kargo etiketi', 'Sendeo etiketi (ZPL)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', 'Toplanmadan önce']],
    tiles: [
      ['i-tag', 'Sendeo etiketi', 'Gönderi açılınca Sendeo etiketi (termal yazıcı için ZPL), takip numarası ve takip adresi aynı anda gelir.'],
      ['i-truck', 'Adresinizden toplama', 'Gönderi, paketin sizin adresinizden alınıp müşterinize teslim edileceği iş emri olarak açılır.'],
      ['i-x', 'İptal', 'Sendeo henüz toplamadıysa gönderiyi panelden iptal edersiniz.'],
    ],
    need: 'Sendeo kurumsal satış ekibinden canlı ortam web servis müşteri adı ve şifresi.',
    title: 'Sendeo Kargo Entegrasyonu: Etiket ve Takip | Hastürk CRM',
    desc: 'Sendeo entegrasyonu: kendi anlaşmanızla gönderi açın, Sendeo etiketi ve takip numarası anında gelsin; kargo durumu ve ücreti panelden izlensin.',
  },
  {
    slug: 'dhl-express', panel: 'dhlexpress', name: 'DHL Express', kind: 'kargo firması', color: '#ffcc00', word: 'DHL Express', beta: true,
    lead: 'DHL Express Türkiye hesabınızla yurt içi ekspres gönderi açın: gönderi numarası (AWB) ve PDF etiket tek seferde gelir, gönderi DHL Express hesabınıza faturalanır, durumu panelden izlenir.',
    caps: [['Yurt içi ekspres gönderi', true], ['Kargo etiketi', 'DHL Express etiketi (PDF)'], ['Takip numarası (AWB)', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true]],
    tiles: [
      ['i-tag', 'Tek adımda etiket', 'Gönderi açıldığında DHL Express gönderi numarası (AWB) ve PDF etiket aynı yanıtta gelir; normal yazıcıdan basarsınız.'],
      ['i-coin', 'Hesabınıza faturalanır', 'Gönderiler DHL Express gönderen hesap numaranıza faturalanır; DHL\'in bildirdiği ücret siparişe yazılır.'],
      ['i-truck', 'Teslim', 'Bu bağlantı kurye çağırmaz: paketi DHL Express şubesine verirsiniz ya da düzenli alım anlaşmanızı kullanırsınız.'],
    ],
    need: 'DHL geliştirici portalında oluşturacağınız MyDHL API uygulamasının API Key / Secret bilgileri (canlı erişim DHL Express Türkiye satış temsilcinizin onayıyla açılır) ve gönderen hesap numaranız.',
    title: 'DHL Express Entegrasyonu: Yurt İçi Ekspres | Hastürk CRM',
    desc: 'DHL Express entegrasyonu: yurt içi ekspres gönderiyi panelden açın; AWB numarası ve PDF etiket anında gelsin, kargo durumu panelden izlensin.',
  },
  {
    slug: 'navlungo', panel: 'navlungo', name: 'Navlungo', kind: 'kargo entegratörü', color: '#1d4ed8', word: 'Navlungo',
    lead: 'Navlungo hesabınızla Sürat, HepsiJET, Kolay Gelsin, Aras, PTT ve Yurtiçi gibi firmalara tek hesaptan, cüzdan bakiyenizle gönderi açın: takip numarası, etiket ve kargo ücreti panele gelir.',
    caps: [['Gönderi oluşturma', true], ['Kargo firması seçimi', 'Otomatik ya da sabit firma'], ['Kargo etiketi', 'Navlungo etiketi (PDF)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
    tiles: [
      ['i-truck', 'Tek hesap, birçok firma', 'Gönderiler Navlungo\'daki fiyat listelerinize göre Sürat, HepsiJET, Kolay Gelsin, Aras, PTT ya da Yurtiçi ile çıkar; firmayı otomatik bırakabilir ya da sabitleyebilirsiniz.'],
      ['i-tag', 'Etiket ve takip numarası', 'Gönderi kargo firmasına iletildikten kısa süre sonra takip numarası ve PDF etiket hazır olur; panel bunları kendisi alır.'],
      ['i-coin', 'Bakiyeden ödeme', 'Kargo ücreti Navlungo cüzdan bakiyenizden düşer ve siparişin kargo giderine yazılır.'],
    ],
    need: 'Navlungo panelinde Entegrasyonlar bölümünden oluşturacağınız API kullanıcısı (kullanıcı adı / şifre) ve Adres Defteri\'ndeki gönderici adresinizin numarası. Kullanacağınız kargo firmaları için Navlungo\'da fiyat listesi tanımlı olmalıdır.',
    title: 'Navlungo Entegrasyonu: Tek Hesaptan Kargo | Hastürk CRM',
    desc: 'Navlungo entegrasyonu: Sürat, HepsiJET, Aras, PTT ve Yurtiçi gönderilerini tek hesaptan açın; etiket, takip numarası ve kargo ücreti panele gelsin.',
  },
  {
    slug: 'kargonomi', panel: 'kargonomi', page: '/ozellikler/kargonomi-entegrasyonu', name: 'Kargonomi', kind: 'kargo entegratörü', color: '#ff6b00', word: 'Kargonomi',
    plan: 'Profesyonel ve Kurumsal', short: 'İnternet sitesi siparişlerinde, firmaların fiyatlarını görerek gönderim',
  },
];

// ---------- özellik sayfalarının ek bölümleri: ne işe yarar (sorun → çözüm), nasıl çalışır (adımlar), artıları ----------
// example: 'profit' (kâr-zarar örnek hesabı) | 'buybox' (buybox örnek senaryosu)
const MORE = {
  'siparis-yonetimi': {
    why: ['Her pazaryerinin paneline ayrı ayrı girip siparişleri tek tek kontrol etmek zaman alır. Bir kanalda gözden kaçan sipariş gecikmeye, gecikme de pazaryeri cezasına ve düşük mağaza puanına dönüşür.', 'Tüm kanalların siparişleri tek listede, kargoya verilme son saatine göre. Geciken ya da gecikme riski taşıyan sipariş kırmızıyla işaretlenir; hiçbir sipariş gözden kaçmaz.'],
    steps: [['Kanallarınızı bağlayın', 'Pazaryeri ve site API bilgilerini bir kez girin.'], ['Siparişler gelsin', 'Yeni siparişler otomatik olarak panele düşer, size bildirim gelir.'], ['İşleme alın, paketleyin', 'Tek tek ya da toplu işleme alın; etiket ve kargo adımına geçin.']],
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
    why: ['Buybox\'ı kaybeden ilan satış yapamaz. Rakip fiyatını gün boyu kontrol edip elle güncellemek imkânsızdır; aceleyle indirilen fiyat da çoğu zaman gereğinden düşük kalır ve kârınız erir.', 'Panel buybox durumunu gün boyu düzenli olarak kontrol eder. Kaybettiğinizde fiyatı alt sınırınızı aşmadan rakibin hemen altına çeker; buybox sizdeyken fiyatı yeniden yükseltir.'],
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
  'doviz-endeksli-fiyat': {
    why: ['Dövizle aldığınız ürünün fiyatını kur her değiştiğinde onlarca kanalda tek tek güncellemek saatler sürer; geciktiğiniz her gün maliyetinizin altında satabilirsiniz.', 'Ürünün döviz fiyatını bir kez girersiniz; panel kuru takip eder, TL fiyatı hesaplar ve tüm kanallara kendisi gönderir.'],
    steps: [['Döviz fiyatı girin', 'Ürün kartında para birimini ve döviz fiyatını yazın.'], ['Kuralı seçin', 'Kur kaynağı, güncelleme sıklığı, eşik ve yuvarlama.'], ['Gerisini panel yapsın', 'Kur değişince TL fiyatı ve kanal fiyatları kendiliğinden güncellenir.']],
    benefits: [['i-up', 'Zarar yok', 'Maliyet kurla birlikte izlenir'], ['i-clock', 'Zaman kazancı', 'Elle fiyat güncelleme biter'], ['i-sync', 'Tüm kanallar', 'Tek seferde her yerde'], ['i-shield', 'Resmi kur', 'TCMB ya da anlık piyasa']],
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

// ---------- Kendi anlaşmalı kargo entegrasyonu (Kurumsal paket) ----------
FEATURES.push({
  slug: 'kargo-entegrasyonu', name: 'Kargo firması entegrasyonu', icon: 'i-truck', color: 'c-orange', short: 'Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL, Sürat',
  title: 'Kargo Entegrasyonu — Hastürk CRM', h1: ['Kendi Kargo Anlaşmanızla', 'Etiket ve Takip Tek Tıkla'],
  lead: 'Yurtiçi Kargo, Aras Kargo, PTT Kargo, UPS, HepsiJET, DHL eCommerce ve Sürat Kargo ile kendi anlaşmanızdan gönderi açın: takip numarası ve kargo etiketi panele gelir, takip numarası satış kanalına bildirilir, kargo teslim edilince sipariş kendiliğinden kapanır.',
  img: 'kargo',
  points: [
    ['i-truck', '7 kargo firması', 'Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL eCommerce ve Sürat Kargo web servisleriyle doğrudan bağlantı.'],
    ['i-tag', 'Etiket ve takip numarası', 'Gönderi panelden açılır; firmanın etiketi (PDF, ZPL ya da görsel) ve takip numarası pakete yazılır.'],
    ['i-sync', 'Kanala bildirim', '“Kargoya ver” dediğinizde takip numarası siparişin geldiği kanala (ikas, WooCommerce, pazaryeri) bildirilir.'],
    ['i-eye', 'Otomatik kargo takibi', 'Kargo firmasından durum sorgulanır; teslim edilen sipariş kendiliğinden “Teslim edildi” olur.'],
    ['i-calc', 'Gerçek kargo maliyeti', 'Firmanın bildirdiği kargo ücreti siparişin giderine yazılır, kâr hesabınız doğru çıkar.'],
    ['i-orders', 'Toplu ve termal yazdırma', 'Etiketleri termal ya da normal yazıcıdan tek tek veya toplu basın.'],
  ],
  steps: [
    ['Kargo firmanızı bağlayın', 'Firmanın verdiği web servis bilgilerini Entegrasyonlar → Kargo firmaları bölümüne girin; panel bağlantıyı test eder.'],
    ['Gönderiyi açın', 'Siparişte “Kargo firmasından etiket al” deyin; takip numarası ve etiket saniyeler içinde gelir.'],
    ['Kargoya verin', 'Etiketi yazdırın; takip numarası kanala bildirilir, teslimat kendiliğinden takip edilir.'],
  ],
  note: { title: 'Bilmeniz gerekenler', items: ['Kargo firması entegrasyonu Kurumsal pakette yer alır.', 'Web servis bilgileri kargo firmasıyla yaptığınız kurumsal anlaşmayla, firmanın şube ya da satış ekibinden alınır.', 'Trendyol ve Hepsiburada gibi pazaryerlerinin anlaşmalı kargosuyla gönderimde barkod pazaryerinden gelir; bu entegrasyona gerek yoktur.'] },
  faq: [
    ['Hangi kargo firmalarıyla entegrasyon var?', 'Yurtiçi Kargo, Aras Kargo, PTT Kargo, UPS, HepsiJET, DHL eCommerce, Sürat Kargo, Kolay Gelsin, Sendeo ve DHL Express ile doğrudan entegrasyon vardır. Navlungo hesabınızla birçok firmaya tek hesaptan gönderebilirsiniz. İnternet sitenizin siparişlerini Kargonomi hesabınızla da gönderebilirsiniz (Profesyonel ve Kurumsal pakette): kargo firmasını fiyatlarını görerek siz seçersiniz.'],
    ['Kargo entegrasyonu için ne gerekir?', 'Kargo firmasıyla kurumsal anlaşmanız ve firmanın verdiği web servis kullanıcı adı / şifresi gerekir. Bilgileri panele girdiğinizde bağlantı hemen test edilir.'],
    ['Takip numarası satış kanalına gider mi?', 'Evet. Paketi “Kargoya ver” ile kapattığınızda takip numarası ve kargo firması siparişin geldiği kanala bildirilir; müşteriniz kargosunu takip edebilir.'],
    ['Kargo teslim edilince ne olur?', 'Panel kargo firmasından durumu düzenli sorgular; teslim edilen sipariş kendiliğinden “Teslim edildi” olur, iade dönen gönderi işaretlenir.'],
    ['Hangi pakette var?', 'Kendi anlaşmalı kargo entegrasyonu Kurumsal pakette yer alır. Pazaryerlerinin anlaşmalı kargosu ve ikas Kargo tüm paketlerde çalışır.'],
  ],
  related: ['kargonomi-entegrasyonu', 'kargo-ve-etiket', 'siparis-yonetimi'],
  carriers: true,
});

// ---------- Kargonomi ile gönderim (Profesyonel ve Kurumsal paket): internet sitesi siparişleri ----------
FEATURES.push({
  slug: 'kargonomi-entegrasyonu', name: 'Kargonomi entegrasyonu', icon: 'i-truck', color: 'c-orange', short: 'İnternet sitesi siparişlerini Kargonomi ile gönderin',
  title: 'Kargonomi Entegrasyonu — Hastürk CRM', h1: ['Sitenizin Siparişlerini', 'Kargonomi ile Gönderin'],
  lead: 'ikas, WooCommerce, Shopify, OpenCart, Ticimax, IdeaSoft ve T-Soft sitenizden gelen siparişleri Kargonomi hesabınızla gönderin: Aras, Yurtiçi, Sürat, PTT, HepsiJET, Kolay Gelsin gibi firmaların fiyatlarını panelde görün, istediğiniz firmayı seçin; etiket ve takip numarası panele gelsin.',
  img: 'kargo',
  points: [
    ['i-calc', 'Fiyatları görerek seçin', 'Her gönderide Kargonomi\'deki kargo firmalarının o gönderi için fiyatı listelenir; firmayı siz seçersiniz, sistem kendiliğinden seçmez.'],
    ['i-tag', 'Etiket ve takip numarası', 'Gönderi panelden açılır; Kargonomi etiketi (PDF) ve takip numarası pakete yazılır, yazdırırsınız.'],
    ['i-orders', 'Toplu gönderim', 'Siparişleri seçin, kargo firmasını seçin, tek seferde gönderin; etiketleri toplu yazdırın.'],
    ['i-sync', 'Sitenize otomatik bildirim', 'Kargo firması paketi teslim alınca sipariş kendiliğinden “Kargoda” olur; takip numarası ve kargo firması sitenize (ikas, WooCommerce…) gider, müşteriniz kargosunu takip eder.'],
    ['i-eye', 'Teslimat takibi', 'Gönderinin durumu Kargonomi\'den düzenli sorgulanır; teslim edilen sipariş panelde ve sitenizde kendiliğinden “Teslim edildi” olur.'],
    ['i-calc', 'Gerçek kargo maliyeti', 'Kargonomi\'nin kestiği ücret siparişin kargo giderine yazılır; kâr hesabınız doğru çıkar.'],
  ],
  steps: [
    ['Kargonomi hesabı açın', 'kargonomi.com.tr\'de hesabınızı açın, bakiye yükleyin ve Depolarım bölümünden gönderen adresinizi (depo) ekleyin.'],
    ['API anahtarını e-postayla isteyin', 'Kargonomi API anahtarını (token) yalnız kendi müşterilerine, e-postayla verir; telefonla verilmez. Kargonomi\'de kayıtlı e-posta adresinizden destek@kargonomi.com.tr adresine yazıp hesabınız için API token isteyin. Panelde Entegrasyonlar → Kargo entegrasyonları → Kargonomi\'deki “E-postayı hazırla” düğmesi talep metnini hazır getirir.'],
    ['Token\'ı panele girin', 'Gelen token\'ı Entegrasyonlar → Kargo entegrasyonları → Kargonomi\'ye yapıştırın ve “Bağlantıyı test et” deyin; bakiyeniz görünürse bağlantı tamamdır.'],
    ['Siparişi gönderin', 'İnternet sitenizden gelen siparişte “Kargonomi ile gönder”e basın, “Fiyatları getir” ile firmaların fiyatlarını görün, istediğiniz firmayı seçin; etiket ve takip numarası gelir. Birden çok sipariş için listeden seçip toplu gönderin.'],
  ],
  note: { title: 'Bilmeniz gerekenler', items: [
    'Kargonomi ile gönderim Profesyonel ve Kurumsal pakette yer alır.',
    'Yalnız internet sitenizin (ikas, WooCommerce, Shopify, OpenCart, Ticimax, IdeaSoft, T-Soft) siparişlerinde kullanılır. Trendyol, Hepsiburada gibi pazaryerlerinin siparişleri pazaryerinin anlaşmalı kargosuyla gönderilir.',
    '“Kargonomi ile gönder” seçeneği yalnız Kargonomi bağlantınız kurulu ve aktifken görünür.',
    'Kargo ücreti Kargonomi bakiyenizden düşer; bakiye yetersizse gönderi açılmaz.',
  ] },
  faq: [
    ['Kargonomi API anahtarını nereden alırım?', 'Kargonomi API anahtarını (token) yalnız kendi müşterilerine, e-postayla verir. Kargonomi\'de kayıtlı e-posta adresinizden destek@kargonomi.com.tr adresine yazıp hesabınız için API token isteyin. Telefonla verilmez.'],
    ['Kargo firmasını kim seçer?', 'Siz seçersiniz. Her gönderide Kargonomi\'deki firmaların o gönderi için fiyatı listelenir; sistem kendiliğinden (örneğin en ucuzu) seçmez. Toplu gönderimde tüm seçili siparişler için seçtiğiniz firma kullanılır.'],
    ['Pazaryeri siparişlerini Kargonomi ile gönderebilir miyim?', 'Hayır. Trendyol, Hepsiburada, N11 gibi pazaryerleri siparişi kendi anlaşmalı kargosuyla gönderir; bu siparişlerde Kargonomi seçeneği görünmez.'],
    ['Hangi pakette var?', 'Profesyonel ve Kurumsal pakette. Kurumsal pakette ayrıca Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL eCommerce ve Sürat Kargo ile kendi anlaşmanızla doğrudan bağlantı vardır.'],
    ['Takip numarası ve teslimat siteme kendiliğinden gider mi?', 'Evet. Kargo firması paketi teslim alınca panel “Kargoya ver”i kendisi yapar; takip numarası ve kargo firması sitenize gider (ikas\'ta paket “Kargoda” olur, müşteriye ikas bildirim gönderir; WooCommerce\'te sipariş tamamlanır ve müşteriye takip notu gider). Takip kodu sonradan gelirse o da siteye yazılır; teslim edilince ikas\'ta paket “Teslim edildi” olur. İsterseniz Ayarlar\'dan kapatabilirsiniz.'],
  ],
  related: ['kargo-entegrasyonu', 'kargo-ve-etiket', 'siparis-yonetimi'],
  carriers: true,
});

// ---------- arama motoru başlık ve açıklamaları ----------
// title: sekme / arama sonucu başlığı (en çok ~60 karakter), desc: arama sonucu açıklaması (en çok ~155 karakter).
// İnsanların Google'da yazdığı ifadelerle (ör. "pazaryeri stok takibi", "trendyol entegrasyonu") yazılır.
const FEATURE_SEO = {
  'siparis-yonetimi': ['Pazaryeri Sipariş Yönetimi Programı | Hastürk CRM', 'Trendyol, Hepsiburada, N11 ve ikas siparişlerini tek listede yönetin: gecikme uyarısı, toplu işlem, sipariş başı kâr. 7 gün ücretsiz deneyin.'],
  'kargo-ve-etiket': ['Pazaryeri Kargo Etiketi ve Toplu Yazdırma | Hastürk CRM', 'Trendyol ve Hepsiburada ortak barkodlu kargo etiketi, ikas Kargo, termal yazıcı (ZPL) ve toplu etiket yazdırma tek panelde. 7 gün ücretsiz deneyin.'],
  'kargonomi-entegrasyonu': ['Kargonomi Entegrasyonu ile Kargo Gönderimi | Hastürk CRM', 'ikas, WooCommerce ve Shopify siparişlerinizi Kargonomi ile gönderin: firmaların fiyatlarını görün, firmayı seçin, etiket ve takip numarası panele gelsin.'],
  'kargo-entegrasyonu': ['Kargo Entegrasyonu: Yurtiçi, Aras, PTT, UPS | Hastürk CRM', 'Yurtiçi, Aras, PTT, UPS, HepsiJET, DHL eCommerce ve Sürat Kargo entegrasyonu: kendi anlaşmanızla etiket, takip numarası ve otomatik teslimat takibi.'],
  'stok-senkronizasyonu': ['Pazaryeri Stok Senkronizasyonu ve Stok Takibi | Hastürk CRM', 'Bir kanalda satılan ürünün stoğu Trendyol, Hepsiburada, N11 ve sitenizde otomatik düşer. Fazla satışa son; çoklu mağaza stok takibi tek panelde.'],
  'urun-yonetimi': ['Toplu Ürün Yükleme ve Pazaryeri Ürün Yönetimi | Hastürk CRM', 'Ürünü bir kez tanımlayın; Trendyol, Hepsiburada, N11 ve idefix\'e toplu ürün yükleyin. Kategori eşleştirme, varyant ve görseller otomatik gider.'],
  'buybox-takibi': ['Buybox Takibi ve Otomatik Fiyatlandırma | Hastürk CRM', 'Trendyol ve Hepsiburada buybox takibi: rakip fiyatlarını izleyin, belirlediğiniz alt-üst sınırlarla fiyatınız otomatik ayarlansın. Zararına satış yok.'],
  'kar-zarar': ['Pazaryeri Kâr Hesaplama ve Kâr-Zarar Raporu | Hastürk CRM', 'Komisyon, kargo, hizmet bedeli, stopaj ve reklam kesintileriyle sipariş başı gerçek kârınızı görün. Trendyol ve Hepsiburada hakedişleri otomatik.'],
  'raporlar': ['E-Ticaret Satış Raporları ve Analiz | Hastürk CRM', 'Günlük, haftalık ve aylık satış raporları; en çok satan ürünler, kanal dağılımı, il bazında satış haritası ve sadık müşteriler. Tüm pazaryerleri tek raporda.'],
  'musteri-sorulari-ve-iadeler': ['Pazaryeri Müşteri Soruları ve İade Yönetimi | Hastürk CRM', 'Trendyol, Hepsiburada ve N11 müşteri sorularını hazır cevaplarla yanıtlayın, iade taleplerini panelden onaylayın ya da reddedin.'],
  'ekip-ve-guvenlik': ['Personel Yetkilendirme ve Güvenlik | Hastürk CRM', 'Ekibinize yalnız ihtiyaç duyduğu bölümleri açın; hazır roller, iki adımlı doğrulama ve şifreli saklanan API bilgileriyle mağazanız güvende.'],
  'doviz-endeksli-fiyat': ['Döviz Kuruna Endeksli Otomatik Fiyat | Hastürk CRM', 'Ürün fiyatını dolar veya euro ile girin; kur değişince TL fiyatınız Trendyol, Hepsiburada ve sitenizde otomatik güncellensin.'],
  'mobil-yonetim': ['Pazaryeri Mağazanızı Telefondan Yönetin | Hastürk CRM', 'Siparişleri işleme alın, stok güncelleyin, soruları yanıtlayın: panel telefonda uygulama gibi çalışır, yeni siparişte anlık bildirim gelir.'],
};
for (const f of FEATURES) { const s = FEATURE_SEO[f.slug]; if (s) [f.seoTitle, f.desc] = s; }

// Entegrasyon sayfası arama sonucu açıklamaları (özellik listesi uzun olan kanallarda kesik görünmesin)
const INTEGRATION_SEO = {
  trendyol: 'Trendyol entegrasyonu: siparişler, ortak barkodlu kargo etiketi, stok ve fiyat, ürün yükleme, buybox ve gerçek kâr tek panelde. 7 gün ücretsiz deneyin.',
  hepsiburada: 'Hepsiburada entegrasyonu: siparişler ve paketleme, kargo etiketi, stok ve fiyat, ürün yükleme, buybox ve hakediş tek panelde. 7 gün ücretsiz deneyin.',
  pazarama: 'Pazarama entegrasyonu: siparişleri onaylayın, stok ve fiyatlarınızı eşitleyin, kargo etiketini panelden basın, müşteri sorularını tek ekranda yanıtlayın.',
};
for (const x of INTEGRATIONS) if (INTEGRATION_SEO[x.slug]) x.desc = INTEGRATION_SEO[x.slug];
