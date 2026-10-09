# Hastürk CRM: satış kanalları tek panelde

İki ikas sitesi (**HasTürk** ve **Tarım Dünyası**) ile **Hepsiburada** ve **Trendyol** mağazaları tek panelden yönetilir. **PttAVM, N11, idefix ve Pazarama** altyapısı hazırdır; bu kanallar bilgileri girilip **bağlantı testi başarılı olana kadar** yalnızca Entegrasyonlar'da görünür, sipariş/ürün/stok/analiz ekranlarına ve senkrona girmez.

- **Siparişler:** Tüm kanalların siparişleri tek listede görünür. İşleme alınır, **paketlere bölünür**, her paket **kanalda kargoya hazırlanır**, kargo firması **kanalın kendi listesinden** seçilir/değiştirilir, kanalın etiketi alınır ve yazdırılır. Etiketin oluşturulması, görüntülenmesi ve yazdırılması paket bazında ayrı izlenir (“yazdırıldı” yalnızca onayınızla işaretlenir). 1 günü aşan ve son kargoya teslim tarihi yaklaşan siparişler **Geciken** olarak işaretlenir. Kanalın kendi panelinden yapılan işlemler algılanır (ör. “Hepsiburada üzerinden işlem yapıldı”); kaynağı kesin olmayan değişiklikte kaynak iddia edilmez. İptal ve iade ayrı sekmelerde; her siparişin işlem geçmişi detayda.
- **Stok:** Merkezi (depo) stok tutulur. Herhangi bir kanalda satış olunca stok düşer ve yeni adet **diğer tüm kanallara gönderilir**. Stok girişi yapılınca da tüm kanallar güncellenir. İptal edilen sipariş stoğa geri eklenir. Stoklar sayfası **Stokta yok / Sınır altı / Yeterli** bölümlerine ayrılır (sınır Ayarlar'dan, ürüne özel kritik stok varsa o kullanılır).
- **Stok tek yerden:** Stok panelde tutulur ve **ana katalog sitesi (HasTürk ikas) dahil** tüm kanallara gönderilir; ana katalog yalnız ilk kurulumda (ürünler oluşturulurken) referans alınır. Ana panelde stok senkronu bir kez kendiliğinden açılır (açıldığı andan önceki siparişler stoğu değiştirmez); Ayarlar → Stok'tan kapatılırsa stok yeniden ikas'tan okunur ve hiçbir kanala gönderilmez. Kanalın reddettiği stok sonraki senkronda yeniden gönderilir. idefix stok ve fiyatı aynı kayıtta ister: stokla birlikte ilanın mevcut fiyatı da gönderilir (yalnız stok gönderilirse idefix “NO_PRICE” ile reddeder).
- **Kanala özel stok:** Her ilan için kural seçilir: **Ortak stok** (depodaki adet), **En fazla N** (ör. Hepsiburada'da en çok 5 göster) veya **Ayrılmış N** (ör. Trendyol'da sabit 10; bu kanaldaki satış hem bu adetten hem depodan düşer).
- **Ürünler:** Ürünler görselleri, **markası** ve **açıklamasıyla** (ikas ve Trendyol'dan) içe aktarılır. Varyantlar tek bir **ana ürün** satırında toplanır; satıra tıklayınca varyantlar alt alta açılır / kapanır (sayfalama ana ürün bazındadır, toplam stok ve fiyat aralığı ana satırda görünür). Marka ve açıklama panelde boşsa kanaldan doldurulur, elle girilen değer korunur; açıklama ürün detayında güvenli biçimde (betik ve stil temizlenerek) gösterilir. Alış/satış fiyatı, KDV, desi ve her kanaldaki fiyat/komisyon tutulur.
- **Eşleştirme:** **Farklı kanallardaki** aynı ürünü/varyantı birbirine bağlar; bir panel ürününe her kanaldan yalnızca bir ilan bağlanır, ana katalog sitesinin her varyantı kendi ürünüdür (tek site bağlıyken eşleştirme yapılmaz). Otomatik: barkod aynı; ya da stok kodu aynı ve barkod çelişmiyor; ya da **ad + varyant/ölçü birebir aynı** ve tek aday. Emin olunamayanlar **Eşleştirme → Onay bekleyen**'de benzerlik puanlı önerilerle listelenir. **Eşleşmiş ürünler** sekmesinde hangi kanaldaki hangi ilanın bağlı olduğu ürün ürün görülür; yanlış eşleşme kaldırılır ya da başka ürüne taşınır (kaldırılan eşleşme otomatik olarak tekrar yapılmaz).
- **Geçmiş siparişler:** Entegrasyonlar sayfasından tarih aralığı seçilerek kanal kanal aktarılır (haftalık parçalar halinde, kaldığı yerden sürer).
- **Kullanıcılar:** Yönetici ve personel hesapları. Personel API bilgilerini, kullanıcıları ve ayarları değiştiremez.
- **Müşteri soruları:** Trendyol ve Hepsiburada'daki ürün soruları her senkronda panele gelir; **Müşteri Soruları** sayfasında listelenir ve panelden cevaplanır (hazır cevaplar, karakter sınırı, son cevap süresi). Kanalın kendi panelinden verilen cevaplar da görünür. Trendyol: Soru-Cevap servisi (en fazla 2 haftalık aralık, cevap 10–2000 karakter, Trendyol onayından sonra yayımlanır). Hepsiburada: “Satıcıya Sor” servisi (cevap en fazla 2000 karakter). ikas'ın API'sinde müşteri sorusu servisi yoktur; N11 (yalnız SOAP), idefix ve Pazarama soruları bu kanallar etkinleştiğinde eklenecektir.
- **Bağlantı tanılaması:** Entegrasyonlar'daki **Tanılama** düğmesi (ve sipariş menüsündeki “Kargo / bağlantı tanılaması”) kanalın her adımını ayrı ayrı dener: kimlik, uygulama izinleri, servisler, ikas'ta depo adresi ve kargo ayarları, seçili siparişin kanaldaki paket / barkod / etiket durumu. Sorunlu adım açıklamasıyla gösterilir; rapor kopyalanıp iletilebilir.
- **Kanalı beklemeye alma:** Entegrasyonlar'da her kanal için **“Kanala yazmayı beklet”**: siparişler, ürünler, stok ve kanalda oluşan etiketler okunmaya devam eder; paketleme, kargo bildirimi, stok/fiyat gönderimi ve ürün oluşturma kanala gönderilmez (kanalın kendi panelinden yapılır). Varsayılan olarak hiçbir kanal beklemede değildir: ikas siparişleri de panelden paketlenir, ikas Kargo'nun ürettiği barkod / etiket panele gelir ve buradan yazdırılır.
- **Kargoyu takip et:** Kargoya verilen pakette düğme, kanalın verdiği resmi takip bağlantısını (ikas, Trendyol) ya da kargo firmasının takip sayfasını takip numarasıyla açar (Ayarlar → Kargo takip adresleri'nden düzenlenebilir; {no} takip numarasıdır).
- **Kargo entegratörleri (Kargonomi, Navlungo):** Hangi kanaldan gelirse gelsin, kendi kargo anlaşmanızla gönderdiğiniz paketin gönderisi entegratörde açılır: sipariş → paket → **Kargo entegratöründen etiket al** (kanalın etiket servisi yoksa ana düğme; varsa yanındaki kamyon düğmesi / paket menüsü). Takip no, kargo firması ve etiket (entegratör vermezse panel etiketi barkodla) pakete yazılır, entegratörün ücreti siparişin kargo giderine eklenir; **Kargoya ver** takip numarasını kanala bildirir. Gönderi kargoya verilmeden “Entegratör gönderisini iptal et” ile geri alınır. ikas siparişleri yalnız ikas Kargo ile gönderildiği için kullanılmaz. Bilgiler Entegrasyonlar → **Kargo entegratörleri**'nden girilir (şifreli saklanır, varsayılan entegratör seçilir). Altyapı `src/carriers.js`'tedir; **iki firmanın API dokümanı herkese açık değil** (API erişimi firmaların ekibinden istenir): doküman gelince firmanın bağlantısı (`ADAPTERS`) yazılıp `ready: true` yapılır. O zamana kadar kartlarda “API dokümanı bekleniyor” görünür, gönderi açılmaz. Deneme modunda (DEMO=1) örnek entegratörle akış uçtan uca denenebilir. Yakında: Yurtiçi, Aras, DHL eCommerce (MNG), Sürat, PTT, UPS, HepsiJET, Kolay Gelsin, Sendeo, DHL Express doğrudan bağlantısı.
- **Hata ve yeniden deneme:** Başarısız sipariş, stok ve fiyat işlemleri Bildirimler'e açıklamasıyla (401 anahtar, 403 yetki/IP, 404 adres…) düşer ve bir sonraki senkronda yeniden denenir. Art arda 3+ kez hata veren kanal 15 dakikadan 2 saate kadar kademeli aralıklarla denenir (Entegrasyonlar'da sonraki deneme zamanı görünür); “Senkronla” beklemeyi atlayıp hemen dener.
- **Bildirimler:** Yeniden denemeye rağmen çözülemeyen senkron, stok gönderimi ve aktarım hataları burada toplanır; sorun düzelince kendiliğinden kapanır.
- **Yeni sipariş e-postası:** Bağlı mağaza / pazaryerinden yeni sipariş gelince belirlediğiniz adreslere e-posta gider (“Hepsiburada üzerinden yeni sipariş geldi”, “HasTürk (ikas) mağazanızdan yeni sipariş geldi”): sipariş no, tarih, ürünler, adetler, toplam ve paneldeki siparişe bağlantı. Sipariş başına **bir kez** gönderilir; 15 dakikalık senkronlar, kanalın ilk aktarımı, geçmiş sipariş aktarımı ve 48 saatten eski siparişler e-posta oluşturmaz. **Ayarlar → Yeni sipariş e-posta bildirimi**: alıcılar, hangi mağazalardan e-posta alınacağı ve e-posta servisi (Brevo önerilir: ücretsiz, gönderen adresini e-postayla doğrulamak yeterli; ya da Resend). “Deneme e-postası gönder” ile kontrol edilir. Birden çok alıcı varsa her adrese ayrı kopya gider; alıcılar birbirinin adresini görmez (hatalı tek adres diğerlerini durdurmaz). E-postada ara toplam, kargo / diğer ücretler (sipariş toplamı ile ürünler arasındaki fark) ve firma logosu (Ayarlar → Firma) görünür.
- **Analizler:** Bugün / dün / önceki günler (ya da hafta, ay, yıl) kartları: satış, sepet ortalaması, sipariş, ürün adedi, iptal/iade oranı ve değişim; son 8 haftanın raporu; en çok gönderim yapılan iller; en çok satanlar (adet, ciro, ortalama / en yüksek / en düşük satış fiyatı). Hepsi toplam ya da kanal bazında. “Ayrıntılı grafik” sekmesinde dönem karşılaştırmalı grafikler.
- **Buybox (Trendyol / Hepsiburada):** Buybox sırası, buybox fiyatı ve rakip fiyatları, “Buybox sizde / kaybedildi / kazanıldı” durumları ve geçmiş. **Otomatik fiyat** yalnızca sizin kural açtığınız ürün ve kanalda, genel anahtar açıkken çalışır: rakibin belirlediğiniz TL kadar altına iner, en düşük fiyatın altına inmez, rakip çekilince normal fiyata döner, en yüksek fiyatı aşmaz. Rakip verisi yoksa veya güncel değilse fiyat değiştirilmez; kendi fiyatınız rakip sayılmaz; her değişiklik (eski/yeni fiyat, zaman, neden, sonraki sıra) kaydedilir.
- **Kârlılık:** Alış, satış, komisyon, kargo ve diğer giderler girilince satıştan kalan tutar ve ürün başına kâr hesaplanır. Ayrıca kâr oranı, başabaş fiyatı ve hedef kâr oranı için gereken satış fiyatı gösterilir. İsteğe bağlı olarak KDV de hesaba katılır. Aynı ürünün beş kanaldaki kârı yan yana görülür. Telefonda tek elle kullanılacak şekilde tasarlandı.

Panel telefon, tablet ve bilgisayarda çalışır. Telefonda "Ana ekrana ekle" ile uygulama gibi açılır. Açık ve koyu tema desteklenir.

```
ikas ×2 / Hepsiburada / Trendyol ──(15 dakikada bir + "Senkronla" düğmesi)──▶ Cloudflare Worker (panel/) ──▶ D1 veritabanı
                                                    ◀── stok / fiyat / kargo bildirimi ──
```

Arama widget'ından (`../src/worker.js`) **ayrı bir Worker**'dır. Biri bozulsa diğeri etkilenmez.

---

## 1. Kurulum (Cloudflare)

1. dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → `hasturk` deposu.
2. **Project name:** `hasturk-panel` · **Root directory (Kök dizin): `panel`** · Build command: boş · Deploy command: `npx wrangler deploy`.
3. Yayınlandıktan sonra aşağıdaki şifreyi tanımlayın ve `https://hasturk-panel.<hesap>.workers.dev` adresini açın.

Veritabanı (`hasturk-panel`) ilk yayında kendiliğinden oluşur.

**Kendi alan adınızdan açmak (ör. `panel.hasturkgubre.com.tr`):**
- Alan adının DNS'i Cloudflare'deyse: Workers & Pages → `hasturk-panel` → **Settings → Domains & Routes → Add → Custom domain** → `panel.alanadiniz.com` → Add. DNS kaydı ve SSL sertifikası otomatik oluşur (birkaç dakika).
- DNS başka yerdeyse (alan adı firması / cPanel): Cloudflare özel alan adı için alan adının Cloudflare'e eklenmesi gerekir. Mağaza (ikas) bağlı ana alan adını taşımak yerine panel için **ayrı, ucuz bir alan adı** alıp Cloudflare'e eklemek en risksizidir. Ana alan adını taşıyacaksanız Cloudflare'in içe aktardığı kayıtların (ikas, e-posta/MX) eksiksiz olduğunu kontrol edin ve ikas kayıtlarını **DNS only (gri bulut)** yapın.
- **DNS'i taşımadan alt alan adı (cPanel hostinginiz varsa):** cPanel'de alt alan adını (ör. `crm`) oluşturun; DNS alan adı firmasındaysa orada `A` kaydı ekleyin (İsim `crm`, Değer hostinginizin IP'si). Panelde **Ayarlar → Yeni sipariş e-posta bildirimi** altındaki `index.php` bağlantısından dosyayı indirin (panel adresi içine yazılı gelir; elle almak için `public/panel-proxy.php`), alt alan adının klasörüne yükleyin, cPanel → SSL/TLS Status → **Run AutoSSL**. Dosya tüm istekleri panele iletir, `.htaccess`'i ilk açılışta kendisi oluşturur.
- Yeni adresten giriş yapın (oturum adres başına ayrıdır). E-postalardaki "Siparişi panelde aç" bağlantısı yönetici ilk girişte yeni adrese otomatik geçer (Ayarlar → Panel adresi). workers.dev adresi çalışmaya devam eder; istemezseniz Domains & Routes'ta kapatabilirsiniz.

*Deneme modu:* `DEMO = 1` (Text) değişkeni tanımlanırsa anahtarı girilmemiş kanallar örnek veriyle çalışır (şifre: demo). Gerçek kullanımda bu değişkeni **silin**; silindikten sonraki ilk senkronda örnek siparişler, ilanlar ve ürünler **otomatik temizlenir** (gerçek verilere dokunulmaz). Ayarlar sayfasındaki "Örnek (demo) verileri temizle" düğmesiyle de elle temizlenebilir.

## 2. Panel şifresi

**Variables and Secrets → Add → Type: Secret**:

| Ad | Değer |
|---|---|
| `PANEL_PASSWORD` | Panele giriş şifresi (uzun ve tahmin edilemez olsun) |
| `PANEL_SECRET` | *(önerilir)* Rastgele uzun bir metin (ör. 40 karakter). Panelde girilen API bilgileri bununla şifrelenir. **Sonradan değiştirmeyin**: değişirse oturumlar kapanır ve API bilgilerini yeniden girmeniz gerekir |

`PANEL_PASSWORD` ana yönetici şifresidir: girişte kullanıcı adı **boş** bırakılır. Diğer kişiler için panelde **Kullanıcılar** sayfasından hesap açın (kendi kullanıcı adı ve şifreleriyle girerler; şifrelerini sağ üstteki menüden değiştirebilirler).

**Giriş koruması (IP engelleme)** (Kullanıcılar → giriş koruması kartı, yalnız ana panel, varsayılan açık): bir IP **15 dakikada 5** kez hatalı şifre, hatalı kod (iki adımlı / e-posta), var olmayan firma kodu ya da geçersiz dış API anahtarı denerse engellenir; engelliyken şifre kontrol edilmeden reddedilir (HTTP 429, kalan süre mesajda). Engel bitince denemeler sürerse her yeni engel uzar: **1 dk → 5 dk → 15 dk → 1 saat → 6 saat → 24 saat → 7 gün**; 24 saat hatalı deneme yapmayan IP'nin geçmişi sıfırlanır. Deneme şifre kontrolünden önce sayılır, başarılı girişte sıfırlanır. Ana panelin önünde çalışır: ana panel ve **tüm müşteri panellerinin** girişleri, şifre sıfırlama istekleri ve dış API aynı sayaçtan geçer. Kartta engelli / son 7 günde hatalı deneme yapan IP'ler, son denenen firma / kullanıcı, "Engeli kaldır"; ayarlarda deneme sınırı, süre, engel süreleri, **güvenilir IP'ler** (ofis IP'nizi ekleyin; hiç engellenmez) ve IP başına dakikada en fazla istek (varsayılan 600; bellekte, Worker örneği başına). Kullanıcı adı + IP başına 15 dakikada 20 deneme sınırı ayrıca sürer (koruma kapalıyken ve güvenilir IP'de de). Kesin ağ düzeyi sınır için Cloudflare → Security → WAF → **Rate limiting rules** ile `/api/login` için ek kural önerilir. Kod: `src/guard.js`.

**Yeni ağdan girişte e-posta kodu** (Kullanıcılar → güvenlik kartı, varsayılan açık): kullanıcı daha önce doğrulamadığı bir ağdan (IP) girince şifreden sonra e-postasına 6 haneli kod gider (10 dakika geçerli; 5 hatalı denemede geçersiz olur; “Kodu tekrar gönder” 45 sn arayla, saatte en fazla 5). Kod girilince o ağ 48 saat hatırlanır ve bu sürede oradan girişte kod sorulmaz; o ağdan her girişte 48 saat yeniden başlar, 48 saatten uzun süre giriş yapılmazsa kod yeniden istenir. Ağ: IPv4'te ilk üç bölüm (ör. `85.105.12.x`; aynı ev / ofis hattında son hane değişse de tanınır), IPv6'da ilk dört grup. İki adımlı doğrulaması (uygulama) açık kullanıcıya bu adım yerine uygulama kodu sorulur ve kodla girdiği ağ da hatırlanır. Ana yöneticinin kodu alacağı adres aynı karttaki **Ana yönetici e-postası**dır. E-postası olmayan kullanıcıda ya da e-posta servisi çalışmazsa giriş engellenmez (kimse panelin dışında kalmasın), olay günlüğe yazılır. Yönetici bir kullanıcının **oturumlarını kapatınca** tanınan ağları da silinir. Kod e-postası Ayarlar → Bildirimler'deki e-posta servisiyle gider; müşteri panellerinde ana panelin servisi kullanılır. Kontrol girişte yapılır; açık oturum IP değişince kapanmaz.

**Firma bilgileri ve logo:** Ayarlar → Firma bilgileri bölümünden unvan, iletişim bilgileri ve logo değiştirilir. Logo menüde, giriş ekranında ve telefonda üst çubukta görünür.

## 3. Kanal API bilgileri (panelden)

Panelde **Entegrasyonlar** sayfasında her kanal için bir kart vardır. API bilgilerini buraya girip **Kaydet**'e, ardından **Bağlantıyı test et**'e basın. Hangi bilginin nereden alınacağı kartın üstünde yazar.

- Bilgiler sunucuda **şifreli (AES-GCM)** saklanır ve bir daha ekranda açık gösterilmez. Gizli alanlarda sadece son 4 karakter görünür. Gizli alanı boş bırakıp kaydederseniz eski değer korunur.
- Şifreleme anahtarı `PANEL_SECRET`'tan türetilir. Tanımlı değilse panel şifresinden türetilir; bu durumda şifreyi değiştirdiğinizde API bilgilerini yeniden girmeniz gerekir. Bu yüzden Cloudflare'de `PANEL_SECRET` tanımlamanız önerilir.
- **Aktif** anahtarı kapatılan kanal hiç senkronlanmaz.
- İsterseniz bilgiler Cloudflare'de gizli değişken olarak da tanımlanabilir. Panelde girilen değer, Cloudflare'deki aynı adlı değişkenin önüne geçer.

| Kanal | Gerekli bilgiler | Nereden alınır | Cloudflare değişken adları (isteğe bağlı) |
|---|---|---|---|
| ikas (HasTürk / Tarım Dünyası) | Mağaza adı, Client ID, Client Secret | ikas → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma) | `IKAS1_*` / `IKAS2_*` (`STORE`, `CLIENT_ID`, `CLIENT_SECRET`, `NAME`, `MERCHANT_ID`, `SALES_CHANNEL_ID`, `STOCK_LOCATION_ID`) |
| Trendyol | Satıcı ID, API Key, API Secret | Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri | `TRENDYOL_SELLER_ID`, `TRENDYOL_API_KEY`, `TRENDYOL_API_SECRET` |
| Hepsiburada | Merchant ID, servis anahtarı, **entegratör adı** | Merchant Portal → Hesabım → Entegrasyon | `HB_MERCHANT_ID`, `HB_PASSWORD`, `HB_USER_AGENT` (+ `HB_USERNAME`, `HB_MERCHANT_NAME`) |
| PttAVM | API Key ve Token (entegratör için), isteğe bağlı depo numarası | Satıcı paneli → Hesap Yönetimi → Entegrasyon Bilgileri → entegratör → Ekle / Görüntüle | `PTTAVM_API_KEY`, `PTTAVM_TOKEN`, `PTTAVM_WAREHOUSE_ID` (eski yol: `PTTAVM_USERNAME`, `PTTAVM_PASSWORD`) |
| N11 | App Key, App Secret | Satıcı Ofisi → Hesabım → API Hesapları | `N11_APP_KEY`, `N11_APP_SECRET` |
| idefix | Satıcı ID, API KEY, API SECRET KEY | Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri → “Yeni API Oluştur”: API KEY ve API SECRET KEY kayıtlı e-posta adresinize gönderilir | `IDEFIX_VENDOR_ID`, `IDEFIX_API_KEY`, `IDEFIX_API_SECRET` |
| Pazarama | API Key (Client ID), API Secret | İş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri | `PAZARAMA_CLIENT_ID`, `PAZARAMA_CLIENT_SECRET` |
| OpenCart *(test aşamasında)* | Site adresi + panelden indirilen **bağlantı dosyası** (anahtar dosyaya gömülü) | Entegrasyonlar → OpenCart → **Bağlantı dosyasını indir** → dosyayı OpenCart ana klasörüne (config.php'nin yanına) yükleyin | `OPENCART_URL`, `OPENCART_KEY` (+ `OPENCART_BRIDGE`, `OPENCART_SHIP_STATUS`) |

**PttAVM, N11, idefix, Pazarama:** bilgileri girip **Kaydet**, sonra **Bağlantıyı test et**. Bağlantı doğrulanınca kanal siparişler, ürünler ve stok ekranlarına eklenir; bilgiler sonradan değişirse yeniden test gerekir.

> ⚠️ Arama widget'ı için açılan mevcut ikas uygulamasında yalnızca okuma izni var. Panel için **yazma izinli yeni bir özel uygulama** açın.
>
> ⚠️ **Hepsiburada entegratör adı zorunludur:** Hepsiburada her isteğin `User-Agent` başlığında Merchant Portal'da tanımlı entegratör adını (ör. `hasturk_dev`) bekler; boş veya farklıysa istekler 401/403 ile reddedilir. Merchant Portal → Hesabım → Entegrasyon ekranında entegratör tanımlayın / adını kopyalayın ve Entegrasyonlar → Hepsiburada → “Entegratör adı” alanına yazın. Buybox sırası için “Mağaza adı” (ürün sayfasında görünen satıcı adı) da girilmelidir.

> ⚠️ ikas'ın kendi pazaryeri entegrasyonu (ikas üzerinden Trendyol/Hepsiburada bağlantısı) açıksa aynı sipariş iki kez gelir. Bu durumda ikas'taki pazaryeri stok senkronunu kapatın ya da gelişmiş ayarlardaki "Satış kanalı ID" ile yalnızca web sitesi kanalını alın.

**Birden fazla mağaza:** Entegrasyonlar → **Mağaza ekle** ile aynı pazaryerinden (ya da ikas'tan) istediğiniz kadar mağaza eklenir. Her mağaza kendi API bilgileri ve “Panelde görünen ad” ile ayrı çalışır (kimliği `trendyol_2`, `ikas_3` gibi); siparişler, stok, raporlar ve müşteriler mağaza bazında ayrılır. Eklenen mağaza **Kaldır** ile panelden çıkarılır (geçmiş siparişler korunur); ana mağazalar yalnız pasif yapılabilir.

**Hepsiburada test ortamı (SIT) → canlıya geçiş:** Hepsiburada canlı API bilgilerini, test ortamında üç adım tamamlanınca verir. Entegrasyonlar → Hepsiburada'da test bilgilerini (Merchant ID, servis anahtarı, entegratör adı) girip **Ortam = Test (SIT)** seçin, ardından **Test adımları** sayfasında: 1) ürün gönderme (trackingId), 2) envanterdeki üründe stok + fiyat gönderimi, 3) test siparişi oluşturma, API'den listeleme ve paketleme. Sayfanın altındaki özet Hepsiburada'ya iletilir. Panelden test sunucularına bağlanırken 520 hatası alınırsa sayfadaki **Test aracını indir (Windows)** (`public/hb-sit-test.ps1`) aynı adımları kendi bilgisayarınızdan yapar. Canlı bilgiler gelince bilgileri değiştirip **Ortam = Canlı** seçin.

**Hepsiburada 520 hatası (gerekirse):** Hepsiburada bazı servislerde panelin çalıştığı Cloudflare sunucularından gelen istekleri 520 ile kapatabiliyor. Bu durumda `public/hb-proxy.php` dosyasındaki `$KEY` değerini uzun rastgele bir metinle değiştirip kendi hostinginize (cPanel → public_html) yükleyin; Gelişmiş ayarlar → **Aracı sunucu adresi** ve **Aracı sunucu anahtarı** alanlarını doldurun. Aracı yalnız `https://*.hepsiburada.com` adreslerine, doğru anahtarla iletim yapar ve hiçbir şey kaydetmez (PHP curl eklentisi gerekir). Hosting yoksa aynı işi `public/hb-proxy-deno.js` yapar: deno.com/deploy'da (ücretsiz, GitHub hesabıyla) bir Playground açıp dosyayı yapıştırın, `KEY`'i değiştirip yayınlayın ve verilen `https://….deno.dev` adresini aynı alanlara girin (Deno Deploy, Cloudflare değil Google Cloud sunucularında çalışır). Sorun yoksa bu alanlar boş kalır.

**OpenCart (test aşamasında):** OpenCart'ta kullanılabilir bir yönetim API'si olmadığından panel, sitenize yüklenen tek bir PHP dosyasıyla (`public/opencart-bridge.php`, indirilen adı `hasturk-baglanti.php`) konuşur. Entegrasyonlar → OpenCart → **Bağlantı dosyasını indir**: panel rastgele bir anahtar üretip kanalın bilgilerine şifreli kaydeder ve dosyaya yazar (yeniden indirmede aynı anahtar). Dosyayı FTP / dosya yöneticisiyle OpenCart'ın kurulu olduğu ana klasöre (config.php'nin yanına) yükleyin, site adresini (https) girip bağlantıyı test edin. Dosya veritabanına OpenCart'ın `config.php` bilgileriyle bağlanır, yalnız `X-Hasturk-Key` başlığında doğru anahtar gelen POST isteklerine cevap verir (PHP 7.0+, mysqli). Siparişler (durumu 0 olan yarım siparişler hariç; durumlar adından eşlenir), ürünler (her seçenek değeri ayrı varyant: `<ürün>:<seçenek değeri>`), stok, fiyat (satış fiyatı liste fiyatından düşükse panel kendi indirimli fiyat satırını yazar; bitiş tarihi 9999-12-31 olan satır panelindir) ve kargo bildirimi (sipariş geçmişine müşteriye görünen not + “Kargoya verildi” durumu; adı Shipped / Kargo… olan durum yoksa gelişmiş ayarlardan durum numarası girilir) desteklenir. OpenCart olayları çalışmadığından müşteriye e-posta gitmez.

## 4. İlk kurulum adımları (sırayla)

Öncelik sırası: önce iki ikas sitesi, sonra Hepsiburada, sonra Trendyol.

1. **Entegrasyonlar** sayfasında API bilgilerini girin ve **Bağlantıyı test et**'e basın. Her kartta siparişlerin ve ürünlerin **son başarılı senkron** zamanı görünür. Hata olursa mesaj kartta görünür, ayrıntısı **Bildirimler**'dedir.
2. **İlanları çek:** Ürünler görselleri ve varyantlarıyla çekilir. **Ana katalog** (Ayarlar'dan seçilir, varsayılan HasTürk) kanalındaki varyantlar panel ürünü olarak açılır ve stok o kanaldan alınır; diğer kanalların ilanları barkod/SKU ile kesin uyuşuyorsa otomatik bağlanır.
3. **Eşleştirme** sayfasında bekleyen ilanları kontrol edin: önerilen ürüne bağlayın, ürün arayın, yeni ürün olarak ekleyin veya yok sayın. "Eşleşmiş" sekmesinde otomatik bağlananları gözden geçirip gerekirse bağlantıyı kaldırabilirsiniz.
4. **Stoklar:** Adetleri kontrol edin (stoğa dokunup **Sayım (=)**). Kanala özel adet gerekiyorsa kanal hücresine veya "Kanal stokları"na dokunup kural seçin. Kârlılık için ürünlere **alış fiyatı** girin.
5. **Ayarlar:** Kanal komisyonları, kargo gideri, hizmet bedeli, stok sınırı, gönderici bilgileri, firma bilgileri ve logo.
6. **Stok senkronu kapalıyken (varsayılan):** Hiçbir kanala stok gönderilmez. Panel stokları her senkronda ana katalog ikas sitesindeki (varsayılan HasTürk) adetlerden okunur; bu ürünlerin stoğu panelden değiştirilemez (ikas panelinden değiştirin). Stoklar ekranında her kanalın kendi stoğu görünür.
7. **Ayarlar → Stok senkronu: Aç** (sistem tamamen hazır olunca). Açıldığı andan sonraki satışlar stoktan düşer ve stok her kanala kendi kuralıyla gönderilir. Daha eski siparişler stoğu etkilemez.
7. İsterseniz **Entegrasyonlar → Geçmiş siparişleri aktar** ile geçmiş dönem siparişlerini alın (istatistikler için). Geçmiş siparişler stoğu değiştirmez.

## Nasıl çalışır?

**Senkron:** Panel **15 dakikada bir** (Cloudflare zamanlanmış görev) ve **Senkronla** düğmesine basınca çalışır. Her senkronda şu işler yapılır:
- Her kanaldan yeni ve değişen siparişler çekilir. Değişmeyenler veritabanına yeniden yazılmaz; aynı sipariş ikinci kez oluşmaz.
- Ürünler, görseller, varyantlar ve kanal stokları yeniden okunur; yeni ilanlar eşleştirilir (stoğu 0 olan eşleşmemiş ilanlar eşleştirmeye girmez, stok gelince döner), ürünün eksik bilgisi bağlı ilanlardan tamamlanır: görsel, varyant, marka, açıklama, kategori, **SKU ve barkod** (önce ana katalog sitesi, sonra diğer platformlar; ör. ikas'ta barkod boşsa Trendyol'daki barkod yazılır). Panelde dolu olan alan değiştirilmez; başka üründe kullanılan SKU / barkod yazılmaz, sıradaki platformun değeri denenir. Elle eşleştirme ve toplu onaydan sonra da hemen çalışır. Mevcut eşleştirmeler ve kanala özel stok kuralları korunur.
- Siparişteki ürünler merkezi stoktan düşülür. Her sipariş için hangi üründen kaç adet düşüldüğü kaydedilir. Bu sayede aynı sipariş tekrar gelse veya paketlere bölünse bile **çift düşüm olmaz**. İptal edilen sipariş geri eklenir, iade isteğe bağlıdır.
- Stoğu değişen ürünler, bağlı oldukları **tüm kanal ilanlarına** gönderilir. Her ilana en son gönderilen adet saklanır ve sadece fark gönderilir. Kanaldaki fiyat değişiklikleri de gönderilir.

- Devam eden geçmiş sipariş aktarımı bir parça ilerletilir.
- Hata olan adım bir sonraki senkronda **yeniden denenir**; art arda başarısız olursa **Bildirimler**'e düşer ve çan simgesinde görünür. Başarılı olunca bildirim kendiliğinden kapanır.

Elle yapılan stok girişi kaydedildiği anda tüm kanallara gönderilir. Kanala gönderilemeyen ilan, stok listesinde kırmızı olarak işaretlenir ve hata mesajı görünür.

**Kanal bazında işlemler** ("panel" yazanlar sadece panelde kaydedilir):

| İşlem | ikas | Trendyol | Hepsiburada |
|---|---|---|---|
| İşleme al | panel | ✓ "Hazırlanıyor" (Picking) | panel |
| Paketle (kargoya hazırla) | **ikas Kargo ile Gönder** (ikas'ın ikas Kargo ekranı açılır; gönderi panele kendiliğinden gelir) | ✓ "Hazırlanıyor" (fatura no verilirse "Faturalandı") | ✓ paket HB'de oluşturulur |
| Kargo firması seç / değiştir | — firmayı ikas Kargo belirler (müşterinin ödeme sayfasında seçtiği kargo yöntemi / ikas kargo ayarlarınız); panel elle firma yazmaz | ✓ Trendyol firmaları (Yeni/Hazırlanıyor/Faturalandı paketlerde, 5 dk'da bir) | ✓ HB'nin paket için izin verdiği firmalar |
| Kargo etiketi | ✓ yalnızca ikas Kargo'nun gerçek gönderi etiketi (gönderi oluşmadan “hazır” sayılmaz) | ✓ ortak etiket (Trendyol Express / Aras, ZPL); diğer firmalarda takip barkodu | ✓ paket etiketi (ZPL/PDF) |
| Paketi iptal et | yalnız “Kargoya Hazır” işaretini kaldırır (ikas Kargo gönderisi ikas'tan iptal edilir) | — (Trendyol panelinden) | ✓ (unpack) |
| Kargoya verme | ✓ paket "Gönderildi" | ✓ | kargo okutunca (HB) |
| Paketlere bölme | panel → her paket ayrı ikas paketi | ✓ Trendyol'da bölünür | ✓ her paket ayrı HB paketi |
| Stok / fiyat gönderme | ✓ | ✓ | ✓ |

**ikas Kargo:** ikas'ta gönderi, siparişin ⋮ menüsündeki **“ikas Kargo ile Paketle ve Gönder”** uygulamasıyla açılır (ürünler → Kaydet → kargo firması → Devam Et; ücret ikas Kargo üzerinden alınır). Bu işlem ikas'ın genel Admin API'sinde (son sürümler dahil) yoktur; “Kargoya Hazır Olarak İşaretle” ise ikas Kargo değildir ve gönderi açmaz — panel bunu **yapmaz**. Panelde ikas siparişlerinde **“ikas Kargo ile Gönder”** düğmesi siparişin ikas sayfasını yeni sekmede açar; panel siparişi 5 saniyede bir ve sekmeye dönüldüğünde ikas'tan yeniler, ikas Kargo gönderiyi oluşturunca barkodu ve etiketi algılar ve **“Etiketi yazdır”** sunar (senkronu beklemez). Daha önce yalnızca “Kargoya Hazır” işaretlenmiş paketlerde işaret panelden kaldırılabilir; barkodlu ikas Kargo gönderisi ikas Kargo ekranından iptal edilir. Hata (ör. müşteri telefonu, depo adresi) paket kartında görünür; “Tanılama” adım adım kontrol eder.

**Kendi kargo etiketimiz** (Ayarlar → Kargo etiketi → boyut: 10×15 cm termal, A5 ya da A4): üstte kendi logomuz ve kanalın işareti, altında kargo firması, anlaşma ifadesi ve paket no; ardından geniş, kenar boşluklu gerçek kargo barkodu ve numarası; sipariş no, platform, takip no, tarih, gönderen ve büyük harflerle alıcı adı / telefonu / adresi; en altta ürünler (ad, varyant etiketi, stok kodu, adet ve tutar). A5/A4'te barkod sağda, bilgiler solda (örnek etiket düzeni).

**Etiket ayrıntıları:** Kanal etiketi vermediğinde (ör. Trendyol'da ortak etiketi olmayan firmalar) basılan 100×150 mm etikette kendi logomuz ve siparişin geldiği kanalın işareti (ikas / trendyol / hepsiburada / PttAVM) barkodun üstünde yer alır; altında kargo firması ve gönderinin yapıldığı gerçek anlaşma yazar (“Trendyol anlaşmalı gönderi”, “ikas Kargo anlaşmalı gönderi”, “Hepsiburada anlaşmalı gönderi”, “PttAVM anlaşmalı gönderi”; kendi anlaşmanızla takip no girdiyseniz “Satıcı anlaşmalı gönderi”). Barkod alanının boyutu ve okunabilirliği korunur.

Alınan etiket pakete kaydedilir; tekrar yazdırırken kanala yeniden gidilmez. ZPL dosyası Zebra ve uyumlu termal yazıcılarda doğrudan basılır. Normal yazıcı kullanıyorsanız **Ayarlar → Kargo etiketi → "ZPL etiketini PDF'e çevir"** seçeneğini açın. Bu çeviri Labelary servisiyle yapılır ve etiket içeriği (alıcı adı/adresi) bu servise gönderilir.

**Sayfalar (menü grupları):** Genel Bakış (bugünün işleri: yeni sipariş, gecikme riski, kargo, eşleşme, stokta yok, açık sorun) · **Satış:** Siparişler (kanal sekmeleri, Yeni / Hazırlanıyor / Kargoda / Teslim / İptal / İade, toplu işlem, Excel; sipariş detayı sağdan açılır), Kargo (Hazırlanacak → Etiketi yazdırılacak → Kargoya verilecek → Kargoda) · **Katalog:** Ürünler, Stoklar, Ürün Yükle, Eşleştirme, Buybox · **Raporlar:** Analizler, Kârlılık · **Sistem:** Entegrasyonlar, Bildirimler, Kullanıcılar, Ayarlar. Filtreler adres çubuğunda tutulur (geri tuşu çalışır, bağlantı paylaşılabilir).

**Ürün Yükle (Katalog → Ürün Yükle):** ikas'taki ürünler Trendyol ve Hepsiburada'ya panelden yüklenir.
1. **Kategori eşleştirme:** Ürün kategorisi ikas'tan gelir (ör. “Gübre › Sıvı Gübre”). Her ikas kategorisi her pazaryeri için bir kez kanal kategorisine eşlenir; kanalın zorunlu özellikleri (ör. Menşei) listeden seçilir. Varyant özelliği (ör. Ağırlık) için **“Ürünün varyant adından”** seçilirse her ürünün varyant adı (“5 Kg”) kanalın değer listesinde otomatik eşlenir. **Kategori öner** kategori yolunu ve o kategorideki ürün adlarını birlikte değerlendirir (`src/catmatch.js`): Türkçe ekler (gübreleri / gübresi), eş anlamlılar (fungisit → mantar ilacı) ve tarım kavramları tanınır; ilaçlama pompası su pompasına, organik gübre kimyevi gübreye, bahçe ürünleri evcil hayvan / otomotiv kategorilerine eşlenmez. Sistem kategoriyi **kendisi eşleştirmez**: her eşleştirilmemiş kategori için önerilen kanal kategorisini gösterir (iki aday çok yakınsa "zayıf öneri"). Öneri doğruysa **Onayla** ile eşleşir; değilse **Başka kategori seç** ile kendiniz seçersiniz ya da ✕ ile öneriyi kaldırırsınız (reddedilen kategori tekrar önerilmez). Onaylanmamış kategoride ürün gönderilmez. Eski sürümün onaysız yaptığı otomatik eşleştirmeler bir kez onay bekleyen öneriye çevrilir. **Eşleştirmeleri kontrol et** mevcut eşleştirmeleri denetler ve daha uygun kategori bulduklarını tek tıkla düzeltir.
2. **Gönder:** Kanalda henüz ilanı olmayan ürünler listelenir; eksik bilgisi olanlar (barkod, görsel, marka, zorunlu özellik) nedeniyle birlikte gösterilir ve gönderilmez. Ad, açıklama, marka (Trendyol marka kimliği otomatik bulunur), barkod, SKU, KDV, desi, görsel, varyant grubu ve fiyat üründen gelir. Kanal ayarlarında **fiyat farkı (%)** (ör. komisyonu karşılamak için) ve kanala özel alanlar (Trendyol kargo firması ID, Hepsiburada garanti süresi) tanımlanır. Stok senkronu kapalıyken “Stok 0 gönder” seçilebilir.
3. **Takip:** Kanalın verdiği takip kimliği (Trendyol batchRequestId, Hepsiburada trackingId) saklanır; sonuç her senkronda (ilk 4 saat) ve “Durumu sorgula” ile alınır, ürün bazında onay / hata görünür. Onaylanan ürün ilanlar çekilince barkod / SKU ile panel ürününe bağlanır. idefix, PttAVM, N11 ve Pazarama'nın ürün aktarma servisleri resmi dokümanları gelince eklenecek.

**Otomatik işlemler (kanal bazında, Ürün Yükle → kanal seçin):** **Yeni ürünleri otomatik gönder** açıksa her senkronda onayladığınız kategori eşleşmelerinde kanalda olmayan, stoğu olan ürünler gönderilir (en fazla 100, aynı ürün 14 gün tekrar gönderilmez; eksik bilgisi olan atlanır). Eşleştirilmemiş ikas kategorileri için günde bir **öneri hazırlanır** (eşleştirilmez): kategori adı ve yolu pazaryeri kategorileriyle karşılaştırılır (toprak / toprağı, tohum / tohumu gibi ek farkları yok sayılır); öneri onaylanınca varyant özelliği ürünün varyant adından, Menşei Türkiye olarak doldurulur. “Kategori öner” düğmesi önerileri hemen hazırlar. **Stokları gönder** açıksa genel stok senkronu kapalıyken bile ikas stoğu yalnız o kanala gider. İkisi de istendiğinde kapatılır.

**Müşteriler:** Siparişlerden müşteri çıkarılır (telefon → e-posta → kanal müşteri kimliği → ad + il); toplam müşteri, tekrar sipariş oranı, ortalama sepet, kanal bazında müşteri (ikas üyeliksiz dahil), kaç kez sipariş verdikleri, aylık yeni / tekrar eden, iller ve müşteri listesi (tüm siparişleri ve aldığı ürünler). Siparişlerde “2. sipariş” rozeti görünür. Pazaryerleri iletişim bilgisini gizlediğinde aynı kişinin farklı kanallardaki siparişleri birleşmeyebilir.

**Gerçek kargo gideri:** Trendyol kargo faturaları (cari hesap ekstresi → kargo faturası kalemleri) ve Hepsiburada kayıt bazlı muhasebe servisindeki kargo kayıtları 6 saatte bir okunup siparişin kargo giderine yazılır; kârlılıkta “kanal faturası / tahmini / elle” olarak görünür. Elle girilen tutar korunur.

**Sistem kontrolü:** Entegrasyonlar → “Sistem kontrolü (tüm kanallar)” bağlı her kanalın tanılamasını sırayla çalıştırıp tek raporda gösterir.

**Komisyon:** Kanal siparişte gerçek komisyonu bildiriyorsa (Hepsiburada satır komisyonu / oranı, idefix komisyon tutarı) kârlılıkta tahmini oran yerine o tutar kullanılır ve ilanın komisyonu otomatik güncellenir; ürün formunda elle girilen oran korunur. Kargo ücreti kanaldan gerçek tutar gelmedikçe tahmin edilmez (sipariş detayında elle girilebilir).

**Geçmiş siparişler:** Her bağlı kanal için son 1 yılın siparişleri bir kez otomatik aktarılır (parça parça; stok düşmez, e-posta gitmez). API bilgileri değiştirilince aktarım yeniden başlar; aynı sipariş iki kez oluşmaz.

**Toplu işlemler:** Toplu etiket ve toplu işleme alma siparişleri 4'erli paralel işler; çok sayıda sipariş 30'arlık parçalarla ilerler. Yazdırma işaretleri tek istekte kaydedilir.

**Hata özeti (Bildirimler):** Son 30 günün hataları kanal ve hata türüne göre gruplanır, olası nedenle (401 kimlik, 403 yetki/IP, 520 sunucu bağlantıyı kapattı…) birlikte gösterilir; **Raporu kopyala** ile iletilebilir.

### Gelir & Gider ve kesilen faturalar (Raporlar → Gelir & Gider)

- **Masraf basamakları:** Satış − komisyon − kargo − hizmet bedeli − ek kesinti (işlem / ödeme bedeli, %) − **stopaj** = hakediş; hakediş − alış maliyeti = kâr. Oranlar Ayarlar → *Komisyon ve giderler*'den kanal kanal girilir; kanal gerçek komisyonu / kargo faturasını bildirdiyse o kullanılır. Sipariş ayrıntısındaki kâr dökümü ve Kârlılık hesaplayıcısı aynı basamakları gösterir.
- **Stopaj:** 1 Ocak 2025'ten beri pazaryerleri hakedişten **KDV hariç satış tutarının %1'ini** gelir vergisi olarak keser (9284 sayılı CBK). Pazaryerleri için varsayılan %1, kendi siteniz (ikas) için 0. Yıllık vergiden mahsup edildiği için raporda ayrıca belirtilir.
- **Kesilen faturalar:** Trendyol (cari hesap ekstresi: kesinti faturaları — kargo, platform hizmet bedeli, reklam —, stopaj, komisyon sözleşme ve iade faturaları) ve Hepsiburada (muhasebe işlemleri: komisyon, stopaj, kargo, reklam / pazarlama, hizmet bedeli, ceza; aynı faturanın satırları birleştirilir) 6 saatte bir çekilip panelde saklanır, türlerine göre toplanır. Kanallar PDF bağlantısı vermediği için PDF, kanalın kendi panelinden fatura numarasıyla indirilir. N11, idefix, Pazarama ve PttAVM'in fatura servisi yoktur.

### İadeler, hakediş, kampanyalar

- **İadeler** (Satış → İadeler): Trendyol ve Hepsiburada iade talepleri her senkronda çekilir. "Aksiyon bekliyor" durumundaki talepler panelden **onaylanır** ya da gerekçe + açıklama (Trendyol'da fotoğraf / PDF eki) ile **reddedilir**. Karar doğrudan pazaryerine gider; panelde kim, ne zaman, hangi gerekçeyle karar verdi saklanır.
- **Hakediş** (Raporlar → Gelir & Gider): Trendyol hesap ekstresi (satış, iade, indirim, kupon, komisyon düzeltmeleri; ödeme tarihi) ve Hepsiburada ödenecek / ödenen kayıtları 6 saatte bir çekilir. Ödeme günlerine göre ödenen / ödenecek / vadesi geçmiş tutarlar ve **mutabakat** (pazaryerinin hakedişi panelin tahmininden farklı olan siparişler) gösterilir.
- **Kampanyalar** (Katalog → Kampanyalar): Hepsiburada satıcı sepet indirimleri (sepette % indirim, TL indirim, X al Y öde; tüm ürünler, kategoriler ya da SKU listesi) panelden oluşturulur ve iptal edilir. Trendyol kampanya / avantajlı ürün katılımı için açık servis sunmuyor; satıcı panelinden yönetilir.
- **E-posta:** Bildirimler kendi e-posta sunucunuzdan (hosting / kurumsal e-posta, SMTP 465 SSL ya da 587 STARTTLS) gönderilebilir: Ayarlar → Yeni sipariş e-posta bildirimi → Servis: *Kendi e-posta sunucum*. Brevo / Resend de kullanılabilir.
- **Personel yetkileri:** Kullanıcılar → kullanıcı formunda personelin görebileceği bölümler seçilir (siparişler, kargo, iadeler, sorular, ürünler, stok, eşleştirme, raporlar, gelir-gider). Menü ve sunucu aynı yetkiyi uygular.

### Döviz bazlı fiyat (dolar / euro / sterlin)

Ürün formunda **Fiyat para birimi** (USD / EUR / GBP) ve **döviz fiyatı** girilir; TL satış fiyatı = döviz fiyatı × kur × (1 + kâr payı %), seçilen yuvarlamayla. Bağlı kanal fiyatları, ürünün eski TL fiyatına göre oranı korunarak (ör. Trendyol'daki %10 fark) güncellenir ve kanallara gönderilir. Ayarlar → **Döviz ve fiyat**:
- **Kur kaynağı:** TCMB (resmi; iş günlerinde ~15:30'da günde bir açıklanır) ya da anlık piyasa kuru (her senkronda, ~15 dakikada bir okunur).
- **Kullanılacak kur:** döviz satış / alış, efektif satış / alış.
- **Güncelleme sıklığı:** anlık (kur eşikten fazla değişince), günlük, haftalık (pazartesi), aylık (ayın 1'i) ya da yalnız elle (**Fiyatları şimdi güncelle**).
- **Değişim eşiği, yuvarlama** (kuruşuyla, tam sayı, ,90, ,99) ve **genel kâr payı** (ürüne özel değer önceliklidir).
Müşteri panellerinde bu özellik "Yakında" olarak görünür.

### Ürün görselleri (yalnız bağlantı)
Her senkronda bağlı kanallardan ürünün **tüm görsellerinin bağlantıları** alınır (ikas'ta varyantın görselleri, yoksa ürünün görselleri; Trendyol, idefix, N11, Pazarama ilan görselleri) ve ürüne kaydedilir. Dosya indirilmez, panelde yer kaplamaz: görseller kanalın kendi sunucusundan (ör. ikas CDN) açılır. Kaynak sırası ana katalog önce; kanalda görsel değişince panel de güncellenir. Ürün kartında **Tüm görseller** bölümü görselleri gösterir; **Bağlantıları düzenle** ile satır satır değiştirilebilir (bu durumda senkron üzerine yazmaz), **Kanaldan otomatik al** ile kanala geri dönülür. Pazaryerine ürün gönderirken tüm görseller gider (Hepsiburada en fazla 5, Trendyol 8). Not: kaynak kanaldaki görsel silinirse bağlantı da açılmaz.

### SKU oluşturma
SKU'su olmayan ürünlere **ürün adından** okunabilir stok kodu verilir: **Ürünler → Barkod / SKU oluştur → SKU** sekmesi (toplu) ya da ürün kartında SKU alanının yanındaki **Oluştur**. Biçim: **ön ek – kısaltma – miktar/varyant**; ör. “HasTürk Solucan Gübresi - 15 Kg” → `HG-SOGU-15KG`, “Bahçe Toprağı Canlandırma Seti” → `HG-BTCS`, “Sıvı Gübre 2,5 Lt” → `HG-SIGU-2500ML`. Kısaltma: tek kelime → ilk 4 harf, iki kelime → ilk 2'şer harf, üç ve fazlası → baş harfler; marka adı ve parantez içi kısaltmaya girmez. Öneriler kaydetmeden önce görünür ve kutudan değiştirilebilir; panel ürünleri ve tüm kanal ilanlarıyla çakışmaz (çakışırsa -2, -3 eklenir). Ön ek (ör. HG) hatırlanır. SKU'su dolu ürünler değişmez. **SKU eksik** sekmesi bu ürünleri gösterir.

### Barkod oluşturma
Barkodu olmayan ürünlere benzersiz barkod verilir: **Ürünler → Barkod / SKU oluştur** (toplu; barkodu eksik ürünler listelenir, istenenler seçilir) ya da ürün kartında Barkod alanının yanındaki **Oluştur** (kaydedince geçerli olur). Barkodlar geçerli **EAN-13**'tür (son hane kontrol hanesi), panel ürünleri ve tüm kanal ilanlarıyla çakışmaz. Varsayılan ön ek **200**: GS1'in mağaza içi kullanıma ayırdığı aralık, gerçek bir firmanın barkoduyla çakışmaz; GS1 firma önekiniz varsa (ör. 8691234) ön ek olarak girilir ve hatırlanır. Barkodu dolu ürünler toplu işlemde değişmez. Ürünler sayfasındaki **Barkod eksik** sekmesi bu ürünleri gösterir; oluşturulan liste kopyalanıp Excel'e yapıştırılabilir.

### Toplama listesi
**Kargo → Toplama listesi** (ya da Siparişler → menü → Toplama listesi): kargoya çıkacak (yeni / hazırlanıyor) siparişlerdeki ürünler ürün bazında toplanır — depoda tek turda toplanır. Paketlenmiş siparişte yalnız açık (gönderilmemiş) paketlerdeki adetler, iptal satırlar hariç. Kanal sekmesi seçiliyse o kanal, sipariş / paket seçiliyse yalnız seçilenler. Stoğu yetmeyen ürün kırmızı görünür; **Yazdır** işaret kutulu, sipariş numaralı sade bir liste basar.

### Günlük özet e-postası
Ayarlar → Bildirimler → **Her sabah günlük özet e-postası gönder**: saat 08:00'den sonraki ilk senkronda (günde bir kez) dünün cirosu, sipariş sayısı ve tahmini kârı (önceki günle karşılaştırmalı, kanal kanal), bugün kargoya hazırlanacak / geciken siparişler, bekleyen iade ve sorular, stokta olmayan ve tükenmek üzere olan ürünler e-postayla gelir. Alıcılar ve e-posta sunucusu yeni sipariş bildirimiyle aynıdır; **Örnek günlük özet gönder** hemen bir örnek yollar. Panel adresi girilmişse e-postadaki maddeler ilgili sayfaya bağlanır.

### Müşteri soruları

Trendyol, Hepsiburada, **N11** (SOAP ürün soru-cevap servisi; liste dakikada bir çağrılabildiği için her senkronda açık sorular), **idefix** ve **Pazarama** soruları Müşteri Soruları sayfasında toplanır ve panelden cevaplanır. Sayfanın üstündeki **soru analizi** son 30 günde kanal bazında soru sayısını, bekleyenleri, cevaplanma oranını ve ortalama cevap süresini gösterir. PttAVM'in soru servisi yoktur.

### Müşteri panelleri (CRM'i başka firmalara kullandırma)

Kullanıcılar → **Müşteri panelleri** (yalnız ana panel yöneticisi): firma adı, **firma kodu** ve müşterinin yönetici kullanıcı adı / şifresiyle panel oluşturulur. Müşteri giriş ekranında firma kodunu yazar (ya da `https://panel-adresiniz/?firma=kod` bağlantısını kullanır).

- Her müşteri paneli ayrı bir **Durable Object**'te kendi SQLite veritabanıyla çalışır: siparişler, ürünler, kullanıcılar ve şifreli API bilgileri yalnız o firmaya aittir; ana panelin API bilgileri, şifresi ve deneme modu müşteriye geçmez. Müşteri kendi kullanıcılarını, mağazalarını ve ayarlarını kendisi yönetir.
- Kod ortak olduğu için panelin her güncellemesi tüm müşteri panellerine aynı anda gelir. Her müşteri paneli 15 dakikada bir kendi kanallarını senkronlar.
- Ana panelden: askıya alma (giriş ve senkron durur, veri korunur), yönetici şifresini sıfırlama, istatistik, **Panele gir** (2 saatlik destek oturumu; üstte “Ana panele dön”) ve kalıcı silme.
- **Paketler** (`src/plans.js`, sitedeki paketlerle aynı): Başlangıç 3 mağaza / 2 kullanıcı; Profesyonel 10 / 5 + buybox ve otomatik fiyat, otomatik ürün gönderimi, hakediş ve faturalar, Excel, personel yetkileri; Kurumsal 25 / sınırsız + Stok API. Firma kartında paket seçilir; mağaza ve kullanıcı sınırı elle de girilebilir ("Özel" pakette sınır yoktur). Paket yükseltilince kısıtlar hemen kalkar.
- **Abonelik / deneme bitişi**: son 7 günde müşteri panelinin üstünde uyarı çıkar, firma kartındaki e-postaya 7, 3 ve 1 gün kala hatırlatma gider (ana panelin e-posta servisiyle). Süre dolunca giriş ve arka plan senkronu durur, veriler korunur; giriş ekranında ana panelin **Ayarlar → Firma** bölümündeki telefon ve e-posta gösterilir (doldurun). Ödeme kaydıyla süre uzayınca senkron kendiliğinden devam eder.
- **Hoş geldiniz e-postası**: firma oluşturulurken e-posta girildiyse giriş adresi, firma kodu, kullanıcı adı ve 7 gün geçerli "şifrenizi belirleyin" bağlantısı gider.
- **Şifremi unuttum**: giriş ekranında (firma koduyla) — kullanıcıya kayıtlı e-postaya 1 saat geçerli, tek kullanımlık bağlantı gider; şifre değişince diğer oturumlar kapanır.
- **Online satış (iyzico)** (`src/billing.js`, `src/iyzico.js`): sitedeki **Satın al** sayfasında yeni müşteri paket + dönem seçer, firma kodu / kullanıcı adı / şifresini yazar, iyzico'da öder → firma paneli kendiliğinden açılır ve hoş geldiniz e-postası gider. Mevcut müşteri (süresi dolmuş olsa da) sitede firma kodu + firma kartındaki e-postayla, ya da panelde **Paketim** sayfasından yeniler / yükseltir; süre mevcut bitişin üstüne eklenir, paket hemen değişir. Tutar sunucudaki fiyattan alınır (`src/plans.js`), sonuç iyzico'dan sunucu tarafında doğrulanır, aynı ödeme iki kez işlenmez; tahsilat firmanın ödeme geçmişine "Kart (iyzico)" olarak yazılır. Ödeme alınıp işlem tamamlanamazsa Bildirimler'e ve telefona acil bildirim düşer.
  Kurulum: Cloudflare → hasturk-panel → Settings → Variables and Secrets: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY` (Secret); deneme için `IYZICO_SANDBOX` = `1` (sandbox anahtarlarıyla). Canlıya geçerken canlı anahtarları girip `IYZICO_SANDBOX`'ı silin. Yıllıkta 1-3 taksit sunulur; "peşin fiyatına" olması için iyzico panelinde taksit vade farkını üye işyerinin karşılaması seçilmelidir.

- **Giriş ekranında bot doğrulaması (Cloudflare Turnstile):** Cloudflare → Turnstile → Add widget (alan adı: panel adresiniz, mod: Managed). Verilen anahtarları hasturk-panel → Settings → Variables and Secrets'a girin: `TURNSTILE_SITE_KEY` (Text) ve `TURNSTILE_SECRET` (Secret). İkisi de tanımlıysa giriş (şifre adımı) ve "Şifremi unuttum" doğrulama ister; tanımlı değilse kapalıdır. Demo panelinde uygulanmaz.
- **Test aşamasındaki kanallar:** Amazon, Çiçeksepeti, Koçtaş, Shopify, OpenCart ve Etsy ana panelde ve müşteri panellerinde eklenip kullanılabilir; panellerde ve tanıtım sitesinde **“Test aşamasında”** etiketiyle görünür. Test bitince: Ana panel → Entegrasyonlar → kanal → **“Test yazısını kaldır”**. Kod değişikliği gerekmez; müşteri panellerine birkaç dakika içinde yansır, tanıtım sitesi etiketi `/api/public/channels`'tan okuyarak kaldırır. **“Test aşamasında” etiketini geri koy** ile geri alınır (kanal çalışmaya devam eder, yalnız etiket değişir).
- **Hata kayıtları kendiliğinden çözülür:** aynı işlem sonradan başarıyla yapılınca, kanal hatasında o kanalın senkronu başarılı olunca ya da hata bir süre tekrarlanmayınca (tek seferlik / anlık hata 1 saat, 2-3 kez görülen 6 saat, daha sık görülen 24 saat) kayıt "Çözüldü (kendiliğinden)" olur; tekrar ederse yeniden açılır.
- **Blog:** Ana panel → Blog'da yazı yazılır (görsel yüklenebilir); yayındaki yazılar hasturkcrm.com/blog'da görünür. Site Worker'ı `site/wrangler.jsonc` ile `src/worker.js`'i çalıştırır (yalnız /blog adreslerinde); layout değişince `node build.mjs`.
- **Bekçi**: ana panelin senkronu saatte bir, 2 saattir senkron izi olmayan etkin müşteri panellerinin zamanlayıcısını yeniden kurar.
- Gereken Cloudflare ayarı `wrangler.jsonc`'de hazır (`durable_objects` + `migrations`); ilk yayında kendiliğinden oluşur. Müşterilerin API bilgileri `PANEL_SECRET`'tan türetilen anahtarla şifrelendiği için **PANEL_SECRET tanımlayın ve değiştirmeyin**.

## Bilinmesi gerekenler

- **Canlı hesapla ilk deneme:** API bağlantıları kanalların resmi dokümanlarına (ikas: resmi `@ikas/admin-api-client` şeması) göre yazıldı. Örnek API cevaplarıyla test edildi ama Trendyol, Hepsiburada ve yeni pazaryerleri gerçek mağaza hesaplarıyla henüz denenmedi; ikas'ta panelden “Kargoya Hazır” yapılan paketin ikas Kargo'yu tetiklediği ilk gerçek siparişte doğrulanmalıdır. İlk bağlantıda **Ayarlar → Kayıtlar**'da bir hata görürseniz mesajı iletin; çoğu düzeltme tek satırlıktır.
- **PttAVM:** PttAVM token doğrulamasını zorunlu yaptı. API Key + Token girildiyse yeni REST Entegrasyon API'si kullanılır (`integration-api.pttavm.com/api/v1`; her istekte `Api-Key`, `access-token`, `X-Correlation-Id`): siparişler `orders/search` (en fazla 40 günlük aralıklarla), tek sipariş `orders/{id}`, ürünler `products/search` (varyantlar ayrı ilan), stok ve fiyat `products/stock-prices` (1000'lik, sonucu `products/tracking-result/{id}` ile ürün bazında), kargo barkodu `shipment.pttavm.com/api/v1/create-barcode` + `barcode-status` (depo girilmediyse mağazanın ilk deposu). API Key / Token yoksa eski SOAP servisi (kullanıcı adı / şifre) kullanılır; PttAVM'in SOAP servisinin alan adları hesaba ve sürüme göre değişebiliyor. Yöntem adları ortam değişkenleriyle değiştirilebilir: `PTTAVM_ORDER_METHOD` (varsayılan `SiparisKontrolListesiV2`), `PTTAVM_STOCK_METHOD` (`StokFiyatGuncelle3`), `PTTAVM_LIST_METHOD` (`StokKontrolListesi`), `PTTAVM_DATE_FORMAT` (`tr` = gg.aa.yyyy).
- **Trendyol ürün servisi:** Ürünler Trendyol'un yeni V2 servisinden (`products/approved` + `inventory-and-price`) okunur; eski V1 ürün listesi Trendyol tarafından kapatılmaktadır (yalnızca V2 erişilemezse yedek olarak kullanılır). Kaldırılan “takip numarası bildirme” servisi artık çağrılmaz.
- **Hepsiburada paket listeleri:** Kargodaki, teslim edilen ve iptal edilen paket uç noktalarından biri hesabınızda kapalıysa senkron devam eder; uyarı Kayıtlar'a yazılır.
- **Kargo firması entegrasyonu yok (bilerek):** Etiket ve barkod her kanalın kendi kargo sisteminden gelir. Yurtiçi, Aras, MNG gibi firmalara doğrudan bağlantı ileride eklenebilir.
- **Cloudflare limitleri:** Ücretsiz planda istek başına işlemci süresi ve veritabanı sorgu sayısı sınırlıdır. Kayıtlarda "CPU" veya "too many" hatası görünürse **Workers Paid** planına (aylık 5 $) geçin. Kod değişikliği gerekmez.
- **Kişisel veriler:** Müşteri adı, adresi ve telefonu yalnızca sizin Cloudflare veritabanınızda tutulur. Panel girişsiz hiçbir veri vermez. Oturum, imzalı ve HttpOnly bir çerezle tutulur. Başka sitelerden gelen yazma istekleri reddedilir.

## Dış API (stok aktarımı)

Yalnız ana panelin yetkilendirdiği müşteri panelleri için: **Firmalar → firma → Dış API (stok aktarımı) → API erişimini aç**.
Anahtar bir kez gösterilir (veritabanında yalnız özeti tutulur) ve firma koduna bağlıdır; dış sistem yalnız o mağazanın ürün ve
stoklarını **okur** (yazma yok). Firma yöneticisi bu ayarı göremez / değiştiremez. İsteğe bağlı IP kısıtı (adres ya da IPv4 aralığı),
dakikada 120 istek; kapatma, yeni anahtar (eskisi hemen geçersiz) ve son erişim / istek sayısı aynı kartta.

```bash
curl -H "Authorization: Bearer hst_<firma-kodu>_<gizli>" "https://<panel-adresi>/api/v1/stock?page=1&limit=500"
# parametreler: page, limit (≤1000), updated_since (ISO / ms), sku, barcode, include_inactive=1 · bağlantı testi: /api/v1/ping
```

## Geliştirme

```bash
cd panel
npm run dev      # http://localhost:8787 — deneme modu, şifre: demo (Node 22.5+, Cloudflare hesabı gerekmez)
npm test         # stok düşümü, iptal/iade, kanala özel stok, eşleştirme, kargo akışı, buybox kuralları, kanal bağlantıları (örnek cevaplarla)
                 # ve ikas'a giden tüm GraphQL sorgularının ikas'ın resmi şemasına uygunluğu (test/fixtures/ikas-schema.json)
node dev/bench.mjs                               # büyük katalog hız testi: 20.000 ürün, 60.000 sipariş; sayfa başına süre ve sorgu sayısı
PRODUCTS=50000 ORDERS=150000 DEV_LATENCY=2 node dev/bench.mjs   # daha büyük veri + her sorguya 2 ms ağ gecikmesi (D1 gidiş-dönüşü)
```

Sistem hızı canlıda da izlenir: ana panel → Destek → **Sistem hızı** (panel başına istek süreleri, en yavaş işlemler, son otomatik
bakım). Ortalaması 3 saniyeyi aşan işlem **Müşteri hataları**na "Yavaş işlem" olarak düşer; her gün eski kayıtlar budanır ve
`PRAGMA optimize` çalışır (bkz. src/perf.js).

ikas şema özetini güncellemek (ikas yeni sürüm yayınlarsa): `npm pack @ikas/admin-api-client` → paketi açın →
`node dev/ikas-schema.mjs package/dist/src/api/admin/generated/index.d.ts <sürüm> > test/fixtures/ikas-schema.json` → `npm test`.

| Dosya | Görev |
|---|---|
| `src/index.js` | Worker girişi: `/api/*`, giriş, zamanlanmış senkron |
| `src/api.js` | Sipariş, ürün, ilan, ayar ve istatistik uç noktaları |
| `src/sync.js` | Senkron motoru: sipariş kaydı, stok düşümü, kanala özel stok ve fiyat gönderimi, içe aktarma, yeniden deneme / bildirim |
| `src/match.js` | Ürün eşleştirme: kanallar arası kesin eşleşme (barkod / stok kodu / ad + varyant) ve benzerlik puanlı öneriler |
| `src/buybox.js` | Buybox takibi ve kurallı otomatik fiyat (güvenlik kurallarıyla) |
| `src/backfill.js` | Geçmiş sipariş aktarımı (parça parça, kaldığı yerden) |
| `src/auth.js` | Giriş, oturum çerezi, kullanıcılar ve şifreler |
| `src/stats.js` | Ciro, adet, kâr serileri, karşılaştırma, dönem kartları, iller, en çok satanlar |
| `src/channels/*.js` | Kanal bağlantıları (`ikas`, `trendyol`, `hepsiburada`, `pttavm`, `n11`, `idefix`, `pazarama`, `demo`; test aşamasında: `amazon`, `ciceksepeti`, `koctas`, `shopify`, `woocommerce`, `opencart`, `etsy`) |
| `public/opencart-bridge.php` | OpenCart bağlantı dosyası şablonu (panel anahtarı yazıp `hasturk-baglanti.php` olarak indirir) |
| `src/config.js` | Panelden girilen API bilgileri (şifreli saklama, maskeleme) |
| `public/` | Panel arayüzü (derleme gerektirmez): `app.js`, `views/*.js` (sayfalar; `orderops.js` = sipariş işlemleri bileşeni), `chart.js`, `labels.js` (etiket + Code 128), `profit.js` (kâr formülü; sunucu da aynı dosyayı kullanır) |
| `dev/` | Yerel sunucu ve D1 benzeri SQLite sarmalayıcı |

### Gecikme riski, ürün ve sipariş silme
- **Ürün sil** (Ürünler → satırdaki ⋯ menüsü, toplu seçim → Sil, ya da ürün düzenleme): ürün panelden silinir, kanallardaki ilanlar silinmez. Bağlı ilanlar "yok sayılanlar"a alınır (Kanal ürünleri → Yok sayılanlar'dan geri eklenebilir); ana katalog senkronu ürünü yeniden açmaz. Geçmiş sipariş satırları kalır.
- **Gecikme riski:** ayrı "Geciken" sekmesi yoktur. Kargoya verilmemiş açık siparişte kanalın son teslim tarihine 12 saatten az kaldıysa ya da (son teslim bilinmiyorsa) sipariş 1 günü aştıysa Yeni / Hazırlanıyor listesinde **Gecikme riski** etiketi, son teslim geçtiyse **Gecikti** etiketi görünür.
- **Sipariş sil** (yalnız yönetici; sipariş detayı → Not ve ayarlar → Siparişi sil, ya da toplu seçim → Sil): önce siparişin kanalda olup olmadığına bakılır (destekleyen kanallarda) ve sonuç onayda gösterilir. Düşülen stok geri eklenir, sipariş raporlardan çıkar ve kanal aynı siparişi yine gönderse de panel almaz (`deleted_orders`). Kanaldaki sipariş etkilenmez.
- **Kanalda bulunamayan siparişler** (`src/orderclean.js`): senkron, açık siparişleri kanalda arar. ikas'ta sipariş kimliğiyle sorgulanır; "yok" cevabında ya da siparişin mağazası panelden kaldırılmışsa sipariş iptal sayılır (açık listelerden çıkar, stok döner). Diğer kanallarda eski açık siparişler kanaldan yeniden okunurken iki kontrolde üst üste (en az 6 saat arayla) dönmeyen sipariş yalnız işaretlenir. Siparişler sayfasının üstünde "N sipariş kanalda bulunamadı → İncele" uyarısı çıkar; listeden tek tek ya da "Hepsini sil" ile silinir. Sipariş sonradan kanalda görünürse işaret kalkar.

### Kargo gideri ve görünüm
- **Kargo gideri (kâr hesabı):** sırasıyla kanalın kargo faturası → siparişe elle girilen tutar → **ürüne girilen kargo tutarı** (Ürünler → Düzenle → "Kargo tutarı"; siparişteki ürünlerin en yükseği, tek koli varsayımı) → Ayarlar → Giderler'deki sipariş başı tutar. Hiçbiri yoksa sipariş kârlılığında "ürüne girilmedi" yazar; tahmin yapılmaz.
- **Tema:** varsayılan açık tema. Koyu tema ve "cihaz temasına uy" Ayarlar → Görünüm'den (ya da sağ üstteki kullanıcı menüsünden) seçilir; seçim cihaz başına saklanır.

### Açılışın takılmaması (yeni yayın sırasında)
- Uygulama dosyaları önce ağdan alınır (4 sn içinde gelmezse cihazdaki kopya, `sw.js`): yeni yayından sonra eski / yeni dosyalar karışıp panel boş ekranda kalmaz.
- `boot.js`: panel 12 sn içinde açılmazsa saklanan dosyalar silinip sayfa bir kez yenilenir (2 dakikada en fazla bir kez).
- Okuma istekleri en fazla 20 sn beklenir. Açılışta özet alınamazsa "Panel açılamadı · Tekrar dene" gösterilir ve 2 / 5 / 10 sn sonra kendiliğinden yeniden denenir.
- Yeni yayın (sunucu sürümü değişti) sayfayı yenilemez, yalnız saklanan dosyaları siler (yayın yayılırken yenileme döngüsü olmaz).
- Şema güncellemesinde yalnız yeni eklenen geçişler çalışır (`schema_n`); firma paneli yeniden başlayınca yarıda kalan senkron kilidi hemen bırakılır.
- Özet sekme arka plandayken tazelenmez (sunucu boşuna meşgul edilmez).
