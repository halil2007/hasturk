import { CHANNEL_PAGES, CARRIER_PAGES } from './integration-pages.mjs';

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
      ['Eski siparişlerim de gelir mi?', 'Evet. Mağazanızı bağladığınızda panel son bir yılın siparişlerini arka planda aktarmaya başlar. Kanalın servisi daha kısa geçmiş veriyorsa (ör. Trendyol son bir ay, Yemeksepeti 60 gün) o kadarı gelir.'],
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
      ['Geçmiş dönemleri görebilir miyim?', 'Evet. Bağlantıdan sonra bir yıla kadar geriye giden siparişler aktarılır (kanalın servisi daha kısa geçmiş veriyorsa o kadarı); raporlar ilk günden geçmişi de kapsar.'],
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

// Entegrasyonlar. caps: [özellik, true | false | 'metin'] (sayfadaki "Desteklenen işlemler" kartı; kart özeti ve özellik ↔ kanal bağlantıları da
// buradan çıkar). Sayfa metinleri (title, desc, lead, tiles, setup, notes, faq, cta) src/integration-pages.mjs → CHANNEL_PAGES'tadır.
export const INTEGRATIONS = [
  {
    slug: 'trendyol', name: 'Trendyol', kind: 'pazaryeri', color: '#f27a1a', badge: 'T', word: 'trendyol',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Ortak barkod'], ['Kargo firması değiştirme', true], ['Paket bölme', true], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', true], ['Gerçek kargo maliyeti', true], ['Buybox takibi ve otomatik fiyat', true]],
  },
  {
    slug: 'hepsiburada', name: 'Hepsiburada', kind: 'pazaryeri', color: '#ff6000', badge: 'hb', word: 'hepsiburada',
    caps: [['Siparişler ve paketleme', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Ortak barkod'], ['Kargo firması değiştirme', true], ['Paket bölme ve iptal', true], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', true], ['Gerçek kargo maliyeti', true], ['Buybox takibi ve otomatik fiyat', true]],
  },
  {
    slug: 'n11', name: 'N11', kind: 'pazaryeri', color: '#7b3fe4', badge: 'n11', word: 'n11',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', false], ['Buybox takibi', false]],
  },
  {
    slug: 'ikas', name: 'ikas', kind: 'e-ticaret sitesi', color: '#111827', badge: 'ik', word: 'ikas',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Ürün oluşturma', true], ['Kargo etiketi', 'ikas Kargo'], ['Birden fazla site', true], ['Ana katalog (kategori, görsel, varyant)', true], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'woocommerce', name: 'WooCommerce', kind: 'e-ticaret sitesi', color: '#7f54b3', badge: 'W', word: 'WooCommerce',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo bildirimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Ürün oluşturma', true], ['Birden fazla site', true], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'pttavm', name: 'PttAVM', kind: 'pazaryeri', color: '#e0a800', badge: 'Ptt', word: 'PttAVM',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'PttAVM barkodu (ZPL)'], ['Ürün yükleme', false], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'idefix', name: 'idefix', kind: 'pazaryeri', color: '#1d4ed8', badge: 'id', word: 'idefix',
    caps: [['Siparişler, onay ve kargoya verme', true], ['Stok ve fiyat gönderimi', true], ['Ürün yükleme', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['İade talepleri (onay / ret)', true], ['Hakediş ve kesilen faturalar', false], ['Buybox takibi', false]],
  },
  {
    slug: 'pazarama', name: 'Pazarama', kind: 'pazaryeri', color: '#7a2bc9', badge: 'Pz', word: 'pazarama',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Müşteri soruları', true], ['Ürün yükleme', true], ['İade talepleri', false]],
  },
  // Test aşamasındaki kanallar (beta: paneldeki kanal türü). Sayfada, menüde ve kartlarda "Test aşamasında" etiketiyle görünür; ana panelde
  // Entegrasyonlar → kanal → "Test yazısını kaldır" denince etiket sitede de kalkar (site.js, panelin /api/public/channels yanıtına göre).
  {
    slug: 'amazon', beta: 'amazon', name: 'Amazon', kind: 'pazaryeri', color: '#232f3e', badge: 'a', word: 'amazon',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Amazon\'un gönderdiği (FBA) siparişler', 'Durum takibi'], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'ciceksepeti', beta: 'ciceksepeti', name: 'Çiçeksepeti', kind: 'pazaryeri', color: '#1e9e57', badge: 'Çs', word: 'çiçeksepeti',
    caps: [['Siparişler', true], ['Ürün ve stok okuma', true], ['Stok ve fiyat gönderimi', true], ['Kargo etiketi', 'Çiçeksepeti panelinden'], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'koctas', beta: 'koctas', name: 'Koçtaş', kind: 'pazaryeri', color: '#e5541b', badge: 'K', word: 'koçtaş',
    caps: [['Siparişler ve onay', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'shopify', beta: 'shopify', name: 'Shopify', kind: 'e-ticaret sitesi', color: '#5e8e3e', badge: 'S', word: 'shopify',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Ürün oluşturma', true], ['Birden fazla site', true], ['İade talepleri', false]],
  },
  {
    slug: 'opencart', beta: 'opencart', name: 'OpenCart', kind: 'e-ticaret sitesi', color: '#23a8e0', badge: 'OC', word: 'OpenCart',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Kargo etiketi', 'Panel etiketi'], ['Birden fazla site', true], ['Ürün oluşturma', false], ['İade talepleri', false]],
  },
  {
    slug: 'etsy', beta: 'etsy', name: 'Etsy', kind: 'yurt dışı pazaryeri', color: '#f1641e', badge: 'E', word: 'Etsy',
    caps: [['Siparişler', true], ['Stok ve fiyat gönderimi', true], ['Kargo / takip bildirimi', true], ['Ürün yükleme', true], ['Müşteri soruları', false], ['İade talepleri', false]],
  },
  {
    slug: 'teknosa', beta: 'teknosa', name: "Teknosa", kind: 'pazaryeri', color: '#005bab', badge: "T", word: "Teknosa",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Ürün yükleme", true], ["Sipariş komisyonu", true], ["Müşteri soruları", false], ["İade talepleri", false]],
  },
  {
    slug: 'boyner', dev: true, name: "Boyner", kind: 'pazaryeri', color: '#000000', badge: "B", word: "Boyner",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Ürün yükleme", false], ["Müşteri soruları", false], ["İade talepleri", false]],
  },
  {
    slug: 'pasaj', dev: true, name: "Turkcell Pasaj", kind: 'pazaryeri', color: '#ffc900', badge: "P", word: "Pasaj",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Ürün yükleme", false], ["Müşteri soruları", false], ["İade talepleri", false]],
  },
  {
    slug: 'trendyolgo', beta: 'trendyolgo', name: "Trendyol Go", kind: 'hızlı market', color: '#ff6000', badge: "TG", word: "Trendyol Go",
    caps: [["Siparişler", true], ["Hazırlandı / kuryeye teslim bildirimi", true], ["Stok ve fiyat gönderimi", true], ["Kurye", "Platformun kuryesi"], ["Ürün yükleme", false]],
  },
  {
    slug: 'getir', dev: true, name: "Getir Çarşı", kind: 'hızlı market', color: '#5d3ebc', badge: "G", word: "getir",
    caps: [["Siparişler", true], ["Hazırlandı / kuryeye teslim bildirimi", true], ["Stok ve fiyat gönderimi", true], ["Kurye", "Platformun kuryesi"], ["Ürün yükleme", false]],
  },
  {
    slug: 'yemeksepeti', beta: 'yemeksepeti', name: "Yemeksepeti Market", kind: 'hızlı market', color: '#fa0050', badge: "YS", word: "yemeksepeti",
    caps: [["Siparişler", true], ["Hazırlandı / kuryeye teslim bildirimi", true], ["Stok ve fiyat gönderimi", true], ["Kurye", "Platformun kuryesi"], ["Ürün yükleme", false]],
  },
  {
    slug: 'ebay', beta: 'ebay', name: "eBay", kind: 'yurt dışı pazaryeri', color: '#E53238', badge: "e", word: "ebay",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Döviz ile fiyat (Kurumsal)", true], ["Ürün yükleme", true]],
  },
  {
    slug: 'ozon', beta: 'ozon', name: "Ozon", kind: 'yurt dışı pazaryeri', color: '#005BFF', badge: "O", word: "OZON",
    caps: [["Siparişler ve onay", true], ["Stok ve fiyat gönderimi", true], ["Kargo etiketi", "Ozon etiketi (FBS)"], ["Kargo / takip bildirimi", true], ["Döviz ile fiyat (Kurumsal)", true], ["Ürün yükleme", true]],
  },
  {
    slug: 'ticimax', beta: 'ticimax', name: "Ticimax", kind: 'e-ticaret sitesi', color: '#00A8E8', badge: "Tx", word: "ticimax",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Birden fazla site", true], ["Ürün oluşturma", false]],
  },
  {
    slug: 'ideasoft', beta: 'ideasoft', name: "IdeaSoft", kind: 'e-ticaret sitesi', color: '#F26B21', badge: "iS", word: "IdeaSoft",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Birden fazla site", true], ["Ürün oluşturma", false]],
  },
  {
    slug: 'tsoft', beta: 'tsoft', name: "T-Soft", kind: 'e-ticaret sitesi', color: '#E30613', badge: "T", word: "T-Soft",
    caps: [["Siparişler", true], ["Stok ve fiyat gönderimi", true], ["Kargo / takip bildirimi", true], ["Birden fazla site", true], ["Ürün oluşturma", false]],
  },
];

// ---------- kargo firması ve kargo entegratörü sayfaları: /entegrasyonlar/<slug> ----------
// Kaynak: panel/src/carriers.js ve panel/src/carriers/<firma>.js (yalnız bağlantının bugün yaptıkları yazılır).
// Alanlar: slug, panel (paneldeki firma kimliği), name, kind ('kargo firması' | 'kargo entegratörü'), color, word (logo kutusundaki yazı),
// beta (panelde test aşamasında), plan, caps [işlem, true | false | 'açıklama']. Sayfa metinleri (title, desc, lead, tiles, setup, faq, cta)
// src/integration-pages.mjs → CARRIER_PAGES'tadır.
// Kargonomi'nin ayrıntılı sayfası /ozellikler/kargonomi-entegrasyonu'dur (page ile oraya bağlanır, ayrı sayfa üretilmez).
export const CARRIERS = [
  {
    slug: 'yurtici-kargo', panel: 'yurtici', name: 'Yurtiçi Kargo', kind: 'kargo firması', color: '#004a99', word: 'Yurtiçi',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'Panel etiketi + barkod'], ['Takip numarası', 'Şube kabulünden sonra'], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
  },
  {
    slug: 'aras-kargo', panel: 'aras', name: 'Aras Kargo', kind: 'kargo firması', color: '#e30613', word: 'Aras',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'Aras etiketi (ZPL) ya da panel etiketi'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', 'İrsaliye kesilmeden önce']],
  },
  {
    slug: 'ptt-kargo', panel: 'ptt', name: 'PTT Kargo', kind: 'kargo firması', color: '#f5b400', word: 'PTT Kargo',
    caps: [['Gönderi oluşturma (veri yükleme)', true], ['Kargo etiketi', 'Panel etiketi + PTT barkodu'], ['Takip numarası', true], ['Kargo durumu takibi', 'Şube kabulünden sonra'], ['Gönderi iptali', 'Şube kabulünden önce']],
  },
  {
    slug: 'ups-kargo', panel: 'ups', name: 'UPS Kargo', kind: 'kargo firması', color: '#351c15', word: 'UPS',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'UPS etiketi (görsel)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
  },
  {
    slug: 'hepsijet', panel: 'hepsijet', name: 'HepsiJET', kind: 'kargo firması', color: '#ff6000', word: 'HepsiJET',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'HepsiJET etiketi (ZPL)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Teslimat türü', 'Standart, ertesi gün, aynı gün'], ['Gönderi iptali', true]],
  },
  {
    slug: 'dhl-ecommerce', panel: 'dhl', name: 'DHL eCommerce', kind: 'kargo firması', color: '#d40511', word: 'DHL eCom',
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'DHL etiketi (ZPL)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
  },
  {
    slug: 'surat-kargo', panel: 'surat', name: 'Sürat Kargo', kind: 'kargo firması', color: '#0b3c8c', word: 'Sürat',
    caps: [['Gönderi oluşturma (ön kabul)', true], ['Kargo etiketi', 'Panel etiketi ya da Sürat etiketi (PDF)'], ['Takip numarası', 'Şube kabulünden sonra'], ['Kargo durumu takibi', true], ['Gönderi iptali', true]],
  },
  {
    slug: 'kolay-gelsin', panel: 'kolaygelsin', name: 'Kolay Gelsin', kind: 'kargo firması', color: '#00a651', word: 'Kolay Gelsin', beta: true,
    caps: [['Gönderi oluşturma', true], ['Kargo etiketi', 'Panel etiketi + müşteri barkodu'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Gönderi iptali', true]],
  },
  {
    slug: 'sendeo', panel: 'sendeo', name: 'Sendeo', kind: 'kargo firması', color: '#00b140', word: 'Sendeo', beta: true,
    caps: [['Gönderi oluşturma (iş emri)', true], ['Kargo etiketi', 'Sendeo etiketi (ZPL)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', 'Toplanmadan önce']],
  },
  {
    slug: 'dhl-express', panel: 'dhlexpress', name: 'DHL Express', kind: 'kargo firması', color: '#ffcc00', word: 'DHL Express', beta: true,
    caps: [['Yurt içi ekspres gönderi', true], ['Kargo etiketi', 'DHL Express etiketi (PDF)'], ['Takip numarası (AWB)', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true]],
  },
  {
    slug: 'navlungo', panel: 'navlungo', name: 'Navlungo', kind: 'kargo entegratörü', color: '#1d4ed8', word: 'Navlungo',
    caps: [['Gönderi oluşturma', true], ['Kargo firması seçimi', 'Otomatik ya da sabit firma'], ['Kargo etiketi', 'Navlungo etiketi (PDF)'], ['Takip numarası', true], ['Kargo durumu takibi', true], ['Kargo ücreti', true], ['Gönderi iptali', true]],
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
    steps: [['Veriler gelsin', 'Bağladığınız kanalların siparişleri bir yıla kadar geriye aktarılır.'], ['Dönemi seçin', 'Bugün, 7 gün, bu ay ya da istediğiniz tarih aralığı.'], ['Karşılaştırın', 'Önceki dönemle farkı, kanal ve ürün dağılımını inceleyin.']],
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

// Sayfa sonu çağrı bandı [kalın başlık, metin]: her özellik sayfasında farklı (aynı cümle iki sayfada geçmez; test/seo.test.mjs)
const FEATURE_CTA = {
  'siparis-yonetimi': ['Bugünün kargolarını tek listede görün', 'Demo panelde örnek siparişleri işleme alın, geciken siparişin nasıl işaretlendiğine bakın. Kendi kanallarınızla 7 gün ücretsiz devam edin.'],
  'kargo-ve-etiket': ['İlk etiketinizi demo panelde basın', 'Toplama listesini ve toplu etiket yazdırmayı kayıt olmadan deneyin; beğenirseniz mağazanızı bağlayın, kurulum ücretsizdir.'],
  'stok-senkronizasyonu': ['Fazla satışı bu hafta bitirin', 'Demo panelde bir kanalda satılan ürünün stoğunun diğer kanallara nasıl gittiğini izleyin, sonra kendi ilanlarınızı eşleştirin.'],
  'urun-yonetimi': ['Bir ürünü dört pazaryerine aynı anda gönderin', 'Kategori eşleştirmesini ve otomatik gönderimi demo panelde inceleyin. 7 günlük deneme için kart bilgisi istenmez.'],
  'buybox-takibi': ['Buybox kuralınızı önce demoda kurun', 'Alt ve üst fiyat sınırının nasıl çalıştığını örnek ilanlarda görün; Trendyol ve Hepsiburada mağazanızla ücretsiz deneyin.'],
  'kar-zarar': ['Gerçek kârınızı hesaplamaya bugün başlayın', 'Örnek siparişlerde komisyon, kargo ve stopajın nasıl düşüldüğüne demo panelde bakın; kendi faturalarınız bağlantıdan sonra gelir.'],
  'raporlar': ['Satış haritanızı demo verisiyle keşfedin', 'Dönem karşılaştırmasını ve en çok satanları kayıt olmadan açın. Kendi mağazanızın raporları ilk günden geçmiş siparişlerle dolar.'],
  'musteri-sorulari-ve-iadeler': ['Bekleyen soruların hiçbirini kaçırmayın', 'Hazır cevap şablonlarını ve gerekçeli iade reddini demo panelde deneyin; müşteri hizmetleri ekibiniz için ayrı yetki açın.'],
  'ekip-ve-guvenlik': ['Ekibinize doğru yetkiyi verin', 'Hazır rolleri ve iki adımlı doğrulamayı deneme panelinizde kurun; Başlangıç paketinde iki, Profesyonel pakette beş kullanıcı vardır.'],
  'doviz-endeksli-fiyat': ['Kur değişikliklerine elle yetişmeye çalışmayın', 'Döviz fiyatlı ürünlerinizi Kurumsal pakette tanımlayın; örnek kur ekranını demo panelde inceleyebilirsiniz.'],
  'mobil-yonetim': ['Paneli telefonunuzun ana ekranına ekleyin', 'Demo paneli telefondan açıp siparişleri parmağınızla yönetmeyi deneyin; uygulama mağazasından bir şey indirmeniz gerekmez.'],
  'kargo-entegrasyonu': ['Kendi kargo anlaşmanızı panele bağlayın', 'Firmanızın web servis bilgileriyle Kurumsal pakette etiket ve takip numarasını siparişin içinden alın; 7 gün ücretsiz deneyin.'],
  'kargonomi-entegrasyonu': ['Site siparişlerinizi en uygun firmayla gönderin', 'Kargonomi token\'ınızı alın, fiyatları panelde karşılaştırın. Profesyonel ve Kurumsal pakette ilk hafta ücretsiz.'],
};
for (const f of FEATURES) { f.cta = FEATURE_CTA[f.slug]; if (!f.cta) throw new Error(`FEATURE_CTA: ${f.slug} eksik`); }

// Entegrasyon ve kargo sayfalarının metinleri (başlık, açıklama, giriş, kutular, kurulum, SSS, çağrı bandı): src/integration-pages.mjs
for (const x of INTEGRATIONS) Object.assign(x, CHANNEL_PAGES[x.slug] || {});
for (const c of CARRIERS) if (!c.page) Object.assign(c, CARRIER_PAGES[c.slug] || {});
