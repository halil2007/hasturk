# Hastürk CRM: satış kanalları tek panelde

İki ikas sitesi (**HasTürk** ve **Tarım Dünyası**) ile **Hepsiburada** ve **Trendyol** mağazaları tek panelden yönetilir. **PttAVM, N11, idefix ve Pazarama** altyapısı hazırdır; bu kanallar bilgileri girilip **bağlantı testi başarılı olana kadar** yalnızca Entegrasyonlar'da görünür, sipariş/ürün/stok/analiz ekranlarına ve senkrona girmez.

- **Siparişler:** Tüm kanalların siparişleri tek listede görünür. İşleme alınır, **paketlere bölünür**, her paket **kanalda kargoya hazırlanır**, kargo firması **kanalın kendi listesinden** seçilir/değiştirilir, kanalın etiketi alınır ve yazdırılır. Etiketin oluşturulması, görüntülenmesi ve yazdırılması paket bazında ayrı izlenir (“yazdırıldı” yalnızca onayınızla işaretlenir). 1 günü aşan ve son kargoya teslim tarihi yaklaşan siparişler **Geciken** olarak işaretlenir. Kanalın kendi panelinden yapılan işlemler algılanır (ör. “Hepsiburada üzerinden işlem yapıldı”); kaynağı kesin olmayan değişiklikte kaynak iddia edilmez. İptal ve iade ayrı sekmelerde; her siparişin işlem geçmişi detayda.
- **Stok:** Merkezi (depo) stok tutulur. Herhangi bir kanalda satış olunca stok düşer ve yeni adet **diğer tüm kanallara gönderilir**. Stok girişi yapılınca da tüm kanallar güncellenir. İptal edilen sipariş stoğa geri eklenir. Stoklar sayfası **Stokta yok / Sınır altı / Yeterli** bölümlerine ayrılır (sınır Ayarlar'dan, ürüne özel kritik stok varsa o kullanılır).
- **Kanala özel stok:** Her ilan için kural seçilir: **Ortak stok** (depodaki adet), **En fazla N** (ör. Hepsiburada'da en çok 5 göster) veya **Ayrılmış N** (ör. Trendyol'da sabit 10; bu kanaldaki satış hem bu adetten hem depodan düşer).
- **Ürünler:** Ürünler görselleri ve **varyantlarıyla** içe aktarılır; varyantlar ana ürün başlığı altında gruplanır. Alış/satış fiyatı, KDV, desi ve her kanaldaki fiyat/komisyon tutulur.
- **Eşleştirme:** **Farklı kanallardaki** aynı ürünü/varyantı birbirine bağlar; bir panel ürününe her kanaldan yalnızca bir ilan bağlanır, ana katalog sitesinin her varyantı kendi ürünüdür (tek site bağlıyken eşleştirme yapılmaz). Otomatik: barkod aynı; ya da stok kodu aynı ve barkod çelişmiyor; ya da **ad + varyant/ölçü birebir aynı** ve tek aday. Emin olunamayanlar **Eşleştirme → Onay bekleyen**'de benzerlik puanlı önerilerle listelenir. **Eşleşmiş ürünler** sekmesinde hangi kanaldaki hangi ilanın bağlı olduğu ürün ürün görülür; yanlış eşleşme kaldırılır ya da başka ürüne taşınır (kaldırılan eşleşme otomatik olarak tekrar yapılmaz).
- **Geçmiş siparişler:** Entegrasyonlar sayfasından tarih aralığı seçilerek kanal kanal aktarılır (haftalık parçalar halinde, kaldığı yerden sürer).
- **Kullanıcılar:** Yönetici ve personel hesapları. Personel API bilgilerini, kullanıcıları ve ayarları değiştiremez.
- **Bildirimler:** Yeniden denemeye rağmen çözülemeyen senkron, stok gönderimi ve aktarım hataları burada toplanır; sorun düzelince kendiliğinden kapanır.
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

*Deneme modu:* `DEMO = 1` (Text) değişkeni tanımlanırsa anahtarı girilmemiş kanallar örnek veriyle çalışır (şifre: demo). Gerçek kullanımda bu değişkeni **silin**; silindikten sonraki ilk senkronda örnek siparişler, ilanlar ve ürünler **otomatik temizlenir** (gerçek verilere dokunulmaz). Ayarlar sayfasındaki "Örnek (demo) verileri temizle" düğmesiyle de elle temizlenebilir.

## 2. Panel şifresi

**Variables and Secrets → Add → Type: Secret**:

| Ad | Değer |
|---|---|
| `PANEL_PASSWORD` | Panele giriş şifresi (uzun ve tahmin edilemez olsun) |
| `PANEL_SECRET` | *(önerilir)* Rastgele uzun bir metin (ör. 40 karakter). Panelde girilen API bilgileri bununla şifrelenir. **Sonradan değiştirmeyin**: değişirse oturumlar kapanır ve API bilgilerini yeniden girmeniz gerekir |

`PANEL_PASSWORD` ana yönetici şifresidir: girişte kullanıcı adı **boş** bırakılır. Diğer kişiler için panelde **Kullanıcılar** sayfasından hesap açın (kendi kullanıcı adı ve şifreleriyle girerler; şifrelerini sağ üstteki menüden değiştirebilirler).

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
| Hepsiburada | Merchant ID, servis anahtarı | Merchant paneli → Entegrasyon / API bilgileri | `HB_MERCHANT_ID`, `HB_PASSWORD` (+ `HB_USERNAME`, `HB_USER_AGENT`, `HB_TEST`) |
| PttAVM *(beklemede)* | API kullanıcı adı ve şifresi, depo numarası | Mağaza paneli → Entegrasyon → API kullanıcısı | `PTTAVM_USERNAME`, `PTTAVM_PASSWORD`, `PTTAVM_WAREHOUSE_ID` (+ gelişmiş ayarlar) |
| N11 *(beklemede, beta)* | App Key, App Secret | Satıcı Ofisi → Hesabım → API Hesapları | `N11_APP_KEY`, `N11_APP_SECRET` |
| idefix *(beklemede, beta)* | Vendor ID, API Key, API Secret | Satıcı paneli → Hesap Bilgileri → Entegrasyon Bilgileri | `IDEFIX_VENDOR_ID`, `IDEFIX_API_KEY`, `IDEFIX_API_SECRET` |
| Pazarama *(beklemede, beta)* | API Key (Client ID), API Secret | İş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri | `PAZARAMA_CLIENT_ID`, `PAZARAMA_CLIENT_SECRET` |

**Bekleyen kanallar** (PttAVM, N11, idefix, Pazarama): bilgileri girip **Kaydet**, sonra **Bağlantıyı test et**. Test başarılı olunca kanal devreye girer; bilgiler sonradan değişirse yeniden test gerekir.

> ⚠️ Arama widget'ı için açılan mevcut ikas uygulamasında yalnızca okuma izni var. Panel için **yazma izinli yeni bir özel uygulama** açın.
>
> ⚠️ ikas'ın kendi pazaryeri entegrasyonu (ikas üzerinden Trendyol/Hepsiburada bağlantısı) açıksa aynı sipariş iki kez gelir. Bu durumda ikas'taki pazaryeri stok senkronunu kapatın ya da gelişmiş ayarlardaki "Satış kanalı ID" ile yalnızca web sitesi kanalını alın.

## 4. İlk kurulum adımları (sırayla)

Öncelik sırası: önce iki ikas sitesi, sonra Hepsiburada, sonra Trendyol.

1. **Entegrasyonlar** sayfasında API bilgilerini girin ve **Bağlantıyı test et**'e basın. Her kartta siparişlerin ve ürünlerin **son başarılı senkron** zamanı görünür. Hata olursa mesaj kartta görünür, ayrıntısı **Bildirimler**'dedir.
2. **İlanları çek:** Ürünler görselleri ve varyantlarıyla çekilir. **Ana katalog** (Ayarlar'dan seçilir, varsayılan HasTürk) kanalındaki varyantlar panel ürünü olarak açılır ve stok o kanaldan alınır; diğer kanalların ilanları barkod/SKU ile kesin uyuşuyorsa otomatik bağlanır.
3. **Eşleştirme** sayfasında bekleyen ilanları kontrol edin: önerilen ürüne bağlayın, ürün arayın, yeni ürün olarak ekleyin veya yok sayın. "Eşleşmiş" sekmesinde otomatik bağlananları gözden geçirip gerekirse bağlantıyı kaldırabilirsiniz.
4. **Stoklar:** Adetleri kontrol edin (stoğa dokunup **Sayım (=)**). Kanala özel adet gerekiyorsa kanal hücresine veya "Kanal stokları"na dokunup kural seçin. Kârlılık için ürünlere **alış fiyatı** girin.
5. **Ayarlar:** Kanal komisyonları, kargo gideri, hizmet bedeli, stok sınırı, gönderici bilgileri, firma bilgileri ve logo.
6. **Ayarlar → Stok senkronu: Aç.** Açıldığı andan sonraki satışlar stoktan düşer ve stok her kanala kendi kuralıyla gönderilir. Daha eski siparişler stoğu etkilemez.
7. İsterseniz **Entegrasyonlar → Geçmiş siparişleri aktar** ile geçmiş dönem siparişlerini alın (istatistikler için). Geçmiş siparişler stoğu değiştirmez.

## Nasıl çalışır?

**Senkron:** Panel **15 dakikada bir** (Cloudflare zamanlanmış görev) ve **Senkronla** düğmesine basınca çalışır. Her senkronda şu işler yapılır:
- Her kanaldan yeni ve değişen siparişler çekilir. Değişmeyenler veritabanına yeniden yazılmaz; aynı sipariş ikinci kez oluşmaz.
- Ürünler, görseller, varyantlar ve kanal stokları yeniden okunur; yeni ilanlar eşleştirilir, ürünün eksik görsel/varyant bilgisi tamamlanır. Mevcut eşleştirmeler ve kanala özel stok kuralları korunur.
- Siparişteki ürünler merkezi stoktan düşülür. Her sipariş için hangi üründen kaç adet düşüldüğü kaydedilir. Bu sayede aynı sipariş tekrar gelse veya paketlere bölünse bile **çift düşüm olmaz**. İptal edilen sipariş geri eklenir, iade isteğe bağlıdır.
- Stoğu değişen ürünler, bağlı oldukları **tüm kanal ilanlarına** gönderilir. Her ilana en son gönderilen adet saklanır ve sadece fark gönderilir. Kanaldaki fiyat değişiklikleri de gönderilir.

- Devam eden geçmiş sipariş aktarımı bir parça ilerletilir.
- Hata olan adım bir sonraki senkronda **yeniden denenir**; art arda başarısız olursa **Bildirimler**'e düşer ve çan simgesinde görünür. Başarılı olunca bildirim kendiliğinden kapanır.

Elle yapılan stok girişi kaydedildiği anda tüm kanallara gönderilir. Kanala gönderilemeyen ilan, stok listesinde kırmızı olarak işaretlenir ve hata mesajı görünür.

**Kanal bazında işlemler** ("panel" yazanlar sadece panelde kaydedilir):

| İşlem | ikas | Trendyol | Hepsiburada |
|---|---|---|---|
| İşleme al | panel | ✓ "Hazırlanıyor" (Picking) | panel |
| Paketle (kargoya hazırla) | ✓ paket ikas'ta **"Kargoya Hazır"** olur → ikas Kargo barkodu üretir | ✓ "Hazırlanıyor" (fatura no verilirse "Faturalandı") | ✓ paket HB'de oluşturulur |
| Kargo firması seç / değiştir | ✓ ikas'taki kargo firmaları (seçilmezse ikas panelindeki kargo önceliği); barkod oluşmadan değiştirilebilir | ✓ Trendyol firmaları (Yeni/Hazırlanıyor/Faturalandı paketlerde, 5 dk'da bir) | ✓ HB'nin paket için izin verdiği firmalar |
| Kargo etiketi | ✓ ikas Kargo etiket görseli; yoksa ikas barkodu panel etiketine basılır | ✓ ortak etiket (Trendyol Express / Aras, ZPL); diğer firmalarda takip barkodu | ✓ paket etiketi (ZPL/PDF) |
| Paketi iptal et | ✓ (ikas'ta paketlemeyi geri alır) | — (Trendyol panelinden) | ✓ (unpack) |
| Kargoya verme | ✓ paket "Gönderildi" | ✓ | kargo okutunca (HB) |
| Paketlere bölme | panel → her paket ayrı ikas paketi | ✓ Trendyol'da bölünür | ✓ her paket ayrı HB paketi |
| Stok / fiyat gönderme | ✓ | ✓ | ✓ |

**ikas Kargo:** “Paketle ve etiket al” paketi ikas'ta **Kargoya Hazır** yapar; ikas Kargo, ikas panelindeki kargo önceliğine (ya da seçtiğiniz firmaya) göre barkodu üretir ve panel birkaç saniye içinde barkodu/etiketi okur. ikas bir hata verirse (ör. müşteri telefonu ya da depo adresi eksik) mesaj paket kartında görünür. Barkod oluşturmak için ikas panelinde **ikas Kargo entegrasyonunun açık** ve stok lokasyonu adresinin eksiksiz olması gerekir.

Alınan etiket pakete kaydedilir; tekrar yazdırırken kanala yeniden gidilmez. ZPL dosyası Zebra ve uyumlu termal yazıcılarda doğrudan basılır. Normal yazıcı kullanıyorsanız **Ayarlar → Kargo etiketi → "ZPL etiketini PDF'e çevir"** seçeneğini açın. Bu çeviri Labelary servisiyle yapılır ve etiket içeriği (alıcı adı/adresi) bu servise gönderilir.

**Sayfalar (menü grupları):** Genel Bakış (bugünün işleri: yeni sipariş, geciken, kargo, eşleşme, stokta yok, açık sorun) · **Satış:** Siparişler (kanal sekmeleri, Yeni / Hazırlanıyor / Geciken / Kargoda / Teslim / İptal / İade, toplu işlem, Excel; sipariş detayı sağdan açılır), Kargo (Hazırlanacak → Etiketi yazdırılacak → Kargoya verilecek → Kargoda) · **Katalog:** Ürünler, Stoklar, Eşleştirme, Buybox · **Raporlar:** Analizler, Kârlılık · **Sistem:** Entegrasyonlar, Bildirimler, Kullanıcılar, Ayarlar. Filtreler adres çubuğunda tutulur (geri tuşu çalışır, bağlantı paylaşılabilir).

**Pazaryerlerinde yeni ürün açma:** Trendyol ve Hepsiburada'da yeni ilan kanalın kendi panelinden açılır (kategori işlemleri bu aşamada kapsam dışı). İlan aynı barkod veya SKU ile açıldığında bir sonraki senkronda panel ürününe otomatik bağlanır.

## Bilinmesi gerekenler

- **Canlı hesapla ilk deneme:** API bağlantıları kanalların resmi dokümanlarına (ikas: resmi `@ikas/admin-api-client` şeması) göre yazıldı. Örnek API cevaplarıyla test edildi ama Trendyol, Hepsiburada ve yeni pazaryerleri gerçek mağaza hesaplarıyla henüz denenmedi; ikas'ta panelden “Kargoya Hazır” yapılan paketin ikas Kargo'yu tetiklediği ilk gerçek siparişte doğrulanmalıdır. İlk bağlantıda **Ayarlar → Kayıtlar**'da bir hata görürseniz mesajı iletin; çoğu düzeltme tek satırlıktır.
- **PttAVM (beklemede, beta):** PttAVM'in SOAP servisinin alan adları hesaba ve sürüme göre değişebiliyor. Yöntem adları ortam değişkenleriyle değiştirilebilir: `PTTAVM_ORDER_METHOD` (varsayılan `SiparisKontrolListesiV2`), `PTTAVM_STOCK_METHOD` (`StokFiyatGuncelle3`), `PTTAVM_LIST_METHOD` (`StokKontrolListesi`), `PTTAVM_DATE_FORMAT` (`tr` = gg.aa.yyyy).
- **Hepsiburada paket listeleri:** Kargodaki, teslim edilen ve iptal edilen paket uç noktalarından biri hesabınızda kapalıysa senkron devam eder; uyarı Kayıtlar'a yazılır.
- **Kargo firması entegrasyonu yok (bilerek):** Etiket ve barkod her kanalın kendi kargo sisteminden gelir. Yurtiçi, Aras, MNG gibi firmalara doğrudan bağlantı ileride eklenebilir.
- **Cloudflare limitleri:** Ücretsiz planda istek başına işlemci süresi ve veritabanı sorgu sayısı sınırlıdır. Kayıtlarda "CPU" veya "too many" hatası görünürse **Workers Paid** planına (aylık 5 $) geçin. Kod değişikliği gerekmez.
- **Kişisel veriler:** Müşteri adı, adresi ve telefonu yalnızca sizin Cloudflare veritabanınızda tutulur. Panel girişsiz hiçbir veri vermez. Oturum, imzalı ve HttpOnly bir çerezle tutulur. Başka sitelerden gelen yazma istekleri reddedilir.

## Geliştirme

```bash
cd panel
npm run dev      # http://localhost:8787 — deneme modu, şifre: demo (Node 22.5+, Cloudflare hesabı gerekmez)
npm test         # stok düşümü, iptal/iade, kanala özel stok, eşleştirme, geçmiş aktarım, kullanıcı yetkileri, kâr formülü, kanal bağlantıları (örnek cevaplarla)
```

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
| `src/channels/*.js` | Kanal bağlantıları (`ikas`, `trendyol`, `hepsiburada`, `pttavm`, `n11`, `idefix`, `pazarama`, `demo`) |
| `src/config.js` | Panelden girilen API bilgileri (şifreli saklama, maskeleme) |
| `public/` | Panel arayüzü (derleme gerektirmez): `app.js`, `views/*.js` (sayfalar; `orderops.js` = sipariş işlemleri bileşeni), `chart.js`, `labels.js` (etiket + Code 128), `profit.js` (kâr formülü; sunucu da aynı dosyayı kullanır) |
| `dev/` | Yerel sunucu ve D1 benzeri SQLite sarmalayıcı |
