# Satış Paneli: 5 kanal, tek panel

İki ikas sitesi (**HasTürk** ve **Tarım Dünyası**) ile **Trendyol**, **Hepsiburada** ve **PttAVM** mağazaları tek panelden yönetilir:

- **Siparişler:** Beş kanalın siparişleri tek listede görünür. Siparişler işleme alınır, **paketlere bölünür**, her paket ayrı ayrı **kargoya verilir** ve her paket için **ayrı kargo etiketi** basılır. Toplu işleme alma ve toplu etiket de vardır.
- **Stok:** Merkezi stok tutulur. Herhangi bir kanalda satış olunca stok düşer ve yeni adet **diğer tüm kanallara gönderilir**. Stok girişi yapılınca da tüm kanallar güncellenir. İptal edilen sipariş stoğa geri eklenir.
- **Ürünler:** Ürün ekleme/düzenleme, alış/satış fiyatı, KDV ve desi girilir. Her kanaldaki fiyat ve komisyon ayrı ayrı tutulur. Kanallardan içe aktarma yapılabilir ve SKU/barkodla otomatik eşleştirme yapılır.
- **İstatistik:** Günlük, haftalık ve aylık ciro ile sipariş adedi hem kanal bazında hem toplam olarak görülür. Önceki dönemle veya geçen yılla karşılaştırılabilir. Tahmini kâr ve en çok satan ürünler de listelenir.
- **Kârlılık:** Alış, satış, komisyon, kargo ve diğer giderler girilince satıştan kalan tutar ve ürün başına kâr hesaplanır. Ayrıca kâr oranı, başabaş fiyatı ve hedef kâr oranı için gereken satış fiyatı gösterilir. İsteğe bağlı olarak KDV de hesaba katılır. Aynı ürünün beş kanaldaki kârı yan yana görülür. Telefonda tek elle kullanılacak şekilde tasarlandı.

Panel telefon, tablet ve bilgisayarda çalışır. Telefonda "Ana ekrana ekle" ile uygulama gibi açılır. Açık ve koyu tema desteklenir.

```
Trendyol / Hepsiburada / PttAVM / ikas ×2 ──(10 dakikada bir + "Senkronla" düğmesi)──▶ Cloudflare Worker (panel/) ──▶ D1 veritabanı
                                                    ◀── stok / fiyat / kargo bildirimi ──
```

Arama widget'ından (`../src/worker.js`) **ayrı bir Worker**'dır. Biri bozulsa diğeri etkilenmez.

---

## 1. Önce deneme modunda açın (anahtar gerekmez)

1. dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → `hasturk` deposu.
2. **Project name:** `hasturk-panel` · **Root directory (Kök dizin): `panel`** · Build command: boş · Deploy command: `npx wrangler deploy`.
3. Yayınlandıktan sonra: Worker → **Settings → Variables and Secrets → Add** → Type: *Text*, Name: `DEMO`, Value: `1` → Deploy.
4. `https://hasturk-panel.<hesap>.workers.dev` adresini açın ve **demo** şifresiyle girin. **Ürünler → İçe aktar**'a, ardından sağ üstteki **Senkronla**'ya basın. Örnek ürün ve siparişlerle tüm ekranları deneyebilirsiniz.

Veritabanı (`hasturk-panel`) ilk yayında kendiliğinden oluşur. Deneme modunda, anahtarı girilmemiş her kanal örnek veriyle çalışır. Anahtarı girilen kanal gerçek verisiyle çalışır, yani kanalları tek tek bağlayabilirsiniz.

## 2. Panel şifresi

**Variables and Secrets → Add → Type: Secret**:

| Ad | Değer |
|---|---|
| `PANEL_PASSWORD` | Panele giriş şifresi (uzun ve tahmin edilemez olsun) |
| `PANEL_SECRET` | *(önerilir)* Rastgele uzun bir metin (ör. 40 karakter). Panelde girilen API bilgileri bununla şifrelenir. **Sonradan değiştirmeyin**: değişirse oturumlar kapanır ve API bilgilerini yeniden girmeniz gerekir |

Gerçek kanalları bağladıktan sonra `DEMO` değişkenini silin. Deneme siparişlerini de temizlemek için Cloudflare → D1 → `hasturk-panel` → Console'da `DELETE FROM orders; DELETE FROM order_items; DELETE FROM packages; DELETE FROM order_stock; DELETE FROM listings; DELETE FROM products; DELETE FROM stock_moves; DELETE FROM settings WHERE k LIKE 'cursor:%' OR k LIKE 'last:%';` çalıştırın.

## 3. Kanal API bilgileri (panelden)

Panelde **Entegrasyonlar** sayfasında her kanal için bir kart vardır. API bilgilerini buraya girip **Kaydet**'e, ardından **Bağlantıyı test et**'e basın. Hangi bilginin nereden alınacağı kartın üstünde yazar.

- Bilgiler sunucuda **şifreli (AES-GCM)** saklanır ve bir daha ekranda açık gösterilmez. Gizli alanlarda sadece son 4 karakter görünür. Gizli alanı boş bırakıp kaydederseniz eski değer korunur.
- Şifreleme anahtarı `PANEL_SECRET`'tan türetilir. Tanımlı değilse panel şifresinden türetilir; bu durumda şifreyi değiştirdiğinizde API bilgilerini yeniden girmeniz gerekir. Bu yüzden Cloudflare'de `PANEL_SECRET` tanımlamanız önerilir.
- **Aktif** anahtarı kapatılan kanal hiç senkronlanmaz.
- İsterseniz bilgiler Cloudflare'de gizli değişken olarak da tanımlanabilir. Panelde girilen değer, Cloudflare'deki aynı adlı değişkenin önüne geçer.

| Kanal | Gerekli bilgiler | Nereden alınır | Cloudflare değişken adları (isteğe bağlı) |
|---|---|---|---|
| ikas (HasTürk / Tarım Dünyası) | Mağaza adı, Client ID, Client Secret | ikas → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok (okuma + yazma) | `IKAS1_*` / `IKAS2_*` (`STORE`, `CLIENT_ID`, `CLIENT_SECRET`, `NAME`, `MERCHANT_ID`, `SALES_CHANNEL_ID`, `STOCK_LOCATION_ID`) |
| Trendyol | Satıcı ID, API Key, API Secret | Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri | `TRENDYOL_SELLER_ID`, `TRENDYOL_API_KEY`, `TRENDYOL_API_SECRET` |
| Hepsiburada | Merchant ID, servis anahtarı | Merchant paneli → Entegrasyon / API bilgileri | `HB_MERCHANT_ID`, `HB_PASSWORD` (+ `HB_USERNAME`, `HB_USER_AGENT`, `HB_TEST`) |
| PttAVM | API kullanıcı adı ve şifresi, depo numarası | Mağaza paneli → Entegrasyon → API kullanıcısı | `PTTAVM_USERNAME`, `PTTAVM_PASSWORD`, `PTTAVM_WAREHOUSE_ID` (+ gelişmiş ayarlar) |

> ⚠️ Arama widget'ı için açılan mevcut ikas uygulamasında yalnızca okuma izni var. Panel için **yazma izinli yeni bir özel uygulama** açın.
>
> ⚠️ ikas'ın kendi pazaryeri entegrasyonu (ikas üzerinden Trendyol/Hepsiburada bağlantısı) açıksa aynı sipariş iki kez gelir. Bu durumda ikas'taki pazaryeri stok senkronunu kapatın ya da gelişmiş ayarlardaki "Satış kanalı ID" ile yalnızca web sitesi kanalını alın.

## 4. İlk kurulum adımları (sırayla)

1. **Entegrasyonlar** sayfasında API bilgilerini girin ve **Bağlantıyı test et**'e basın. Her kanal **Bağlı** görünmeli. Hata olursa mesaj kartta görünür, ayrıntısı **Ayarlar → Kayıtlar**'dadır.
2. **Ürünler → İçe aktar:** Kanallardaki ilanlar çekilir. Aynı **SKU (stok kodu)** veya **barkod**a sahip ilanlar tek ürün altında birleşir ve stok ilk kanaldan (HasTürk) alınır.
3. **Ürünler → Eşleştir:** Kodu farklı olan ilanları elle bir ürüne bağlayın ya da yeni ürün olarak ekleyin.
4. Stok adetlerini kontrol edin. Gerekirse ürünün stoğuna dokunup **Sayım (=)** ile düzeltin. Kârlılık için ürünlere **alış fiyatı** girin ("Alış fiyatı eksik" filtresi).
5. **Ayarlar → Komisyon ve giderler:** Kanal komisyonlarını, sipariş başına kargo giderini ve hizmet bedelini girin. **Kargo etiketi** bölümüne gönderici bilgilerini yazın.
6. **Ayarlar → Stok senkronu: Aç.** Açıldığı andan sonraki satışlar stoktan düşer ve panel stoğu tüm kanallara gönderilir. Daha eski siparişler stoğu etkilemez.

## Nasıl çalışır?

**Senkron:** Panel 10 dakikada bir (Cloudflare zamanlanmış görev) ve **Senkronla** düğmesine basınca çalışır. Her senkronda şu işler yapılır:
- Her kanaldan yeni ve değişen siparişler çekilir. Değişmeyenler veritabanına yeniden yazılmaz.
- Siparişteki ürünler merkezi stoktan düşülür. Her sipariş için hangi üründen kaç adet düşüldüğü kaydedilir. Bu sayede aynı sipariş tekrar gelse veya paketlere bölünse bile **çift düşüm olmaz**. İptal edilen sipariş geri eklenir, iade isteğe bağlıdır.
- Stoğu değişen ürünler, bağlı oldukları **tüm kanal ilanlarına** gönderilir. Her ilana en son gönderilen adet saklanır ve sadece fark gönderilir. Kanaldaki fiyat değişiklikleri de gönderilir.

Elle yapılan stok girişi kaydedildiği anda tüm kanallara gönderilir. Kanala gönderilemeyen ilan, ürün listesinde kırmızı olarak işaretlenir ve hata mesajı görünür.

**Kanal bazında işlemler** ("panel" yazanlar sadece panelde kaydedilir):

| İşlem | ikas | Trendyol | Hepsiburada | PttAVM |
|---|---|---|---|---|
| Sipariş çekme | ✓ | ✓ | ✓ | ✓ (beta) |
| İşleme al | panel | ✓ "Hazırlanıyor" (Picking) | panel | panel |
| Paketlere bölme | panel | ✓ Trendyol'da bölünür (yeni paketler birkaç dk sonra gelir) | ✓ her paket ayrı HB paketi | panel |
| Kargoya verme | ✓ takip no müşteriye bildirilir | ✓ fatura no / takip no | panel (HB kargosu alır) | ✓ barkod (depo no varsa) |
| Kargo etiketi | ikas kargo barkodu etikete basılır | ✓ Trendyol ortak etiketi (ZPL) | ✓ Hepsiburada paket etiketi (ZPL/PDF) | PttAVM kargo barkodu etikete basılır |
| Stok gönderme | ✓ | ✓ | ✓ | ✓ (beta) |
| Fiyat gönderme | ✓ | ✓ | ✓ | — |
| Ürün oluşturma | ✓ | kanal panelinden | kanal panelinden | kanal panelinden |

**Kargo etiketi (kanalların kendi sistemlerinden):** Ayrı bir kargo firması entegrasyonu yoktur; etiket ve barkod her kanalın kendi kargo sisteminden gelir.
- **Trendyol:** Ortak etiket (Trendyol Express / Aras) ZPL olarak alınır. Sipariş işleme alındıktan birkaç dakika sonra hazır olur.
- **Hepsiburada:** Paket oluşturulunca paketin etiketi ZPL veya PDF olarak alınır.
- **ikas ve PttAVM:** Bu kanallar API'den etiket dosyası vermiyor. Kanalın kargo entegrasyonunun **barkodu** (ikas paket barkodu / PttAVM kargo barkodu) senkronla gelir ve panelin 100×150 mm etiketine Code 128 olarak basılır.

Alınan etiket pakete kaydedilir; tekrar yazdırırken kanala yeniden gidilmez. ZPL dosyası Zebra ve uyumlu termal yazıcılarda doğrudan basılır. Normal yazıcı kullanıyorsanız **Ayarlar → Kargo etiketi → "ZPL etiketini PDF'e çevir"** seçeneğini açın. Bu çeviri Labelary servisiyle yapılır ve etiket içeriği (alıcı adı/adresi) bu servise gönderilir.

**Sayfalar:** Genel Bakış, Siparişler (kanal sekmeleri, tarih/kargo filtresi, toplu işleme alma ve etiket, Excel'e aktarma), Ürünler, Stoklar (ortak stok ve her kanaldaki adet), Kargo (etiket bekleyen / kargoya verilecek / kargoda), Kârlılık, Analizler, Entegrasyonlar, Ayarlar.

**Pazaryerlerinde yeni ürün açma:** Trendyol, Hepsiburada ve PttAVM her kategori için zorunlu özellikler istediğinden yeni ilan kanalın kendi panelinden açılır. İlan aynı SKU veya barkodla açıldığında bir sonraki içe aktarmada panel ürününe otomatik bağlanır.

## Bilinmesi gerekenler

- **Canlı hesapla ilk deneme:** API bağlantıları kanalların resmi dokümanlarına göre yazıldı. Örnek API cevaplarıyla test edildi ama gerçek mağaza hesaplarıyla henüz denenmedi. İlk bağlantıda **Ayarlar → Kayıtlar**'da bir hata görürseniz mesajı iletin; çoğu düzeltme tek satırlıktır.
- **PttAVM (beta):** PttAVM'in SOAP servisinin alan adları hesaba ve sürüme göre değişebiliyor. Yöntem adları ortam değişkenleriyle değiştirilebilir: `PTTAVM_ORDER_METHOD` (varsayılan `SiparisKontrolListesiV2`), `PTTAVM_STOCK_METHOD` (`StokFiyatGuncelle3`), `PTTAVM_LIST_METHOD` (`StokKontrolListesi`), `PTTAVM_DATE_FORMAT` (`tr` = gg.aa.yyyy).
- **Hepsiburada paket listeleri:** Kargodaki, teslim edilen ve iptal edilen paket uç noktalarından biri hesabınızda kapalıysa senkron devam eder; uyarı Kayıtlar'a yazılır.
- **Kargo firması entegrasyonu yok (bilerek):** Etiket ve barkod her kanalın kendi kargo sisteminden gelir. Yurtiçi, Aras, MNG gibi firmalara doğrudan bağlantı ileride eklenebilir.
- **Cloudflare limitleri:** Ücretsiz planda istek başına işlemci süresi ve veritabanı sorgu sayısı sınırlıdır. Kayıtlarda "CPU" veya "too many" hatası görünürse **Workers Paid** planına (aylık 5 $) geçin. Kod değişikliği gerekmez.
- **Kişisel veriler:** Müşteri adı, adresi ve telefonu yalnızca sizin Cloudflare veritabanınızda tutulur. Panel girişsiz hiçbir veri vermez. Oturum, imzalı ve HttpOnly bir çerezle tutulur. Başka sitelerden gelen yazma istekleri reddedilir.

## Geliştirme

```bash
cd panel
npm run dev      # http://localhost:8787 — deneme modu, şifre: demo (Node 22.5+, Cloudflare hesabı gerekmez)
npm test         # stok düşümü, iptal/iade, stok gönderimi, kâr formülü, kanal bağlantıları (örnek cevaplarla), giriş güvenliği
```

| Dosya | Görev |
|---|---|
| `src/index.js` | Worker girişi: `/api/*`, giriş, zamanlanmış senkron |
| `src/api.js` | Sipariş, ürün, ilan, ayar ve istatistik uç noktaları |
| `src/sync.js` | Senkron motoru: sipariş kaydı, stok düşümü, stok ve fiyat gönderimi, içe aktarma |
| `src/stats.js` | Ciro, adet, kâr serileri, karşılaştırma, en çok satanlar |
| `src/channels/*.js` | Kanal bağlantıları (`ikas`, `trendyol`, `hepsiburada`, `pttavm`, `demo`) |
| `src/config.js` | Panelden girilen API bilgileri (şifreli saklama, maskeleme) |
| `public/` | Panel arayüzü (derleme gerektirmez): `app.js`, `views/*.js` (sayfalar; `orderops.js` = sipariş işlemleri bileşeni), `chart.js`, `labels.js` (etiket + Code 128), `profit.js` (kâr formülü; sunucu da aynı dosyayı kullanır) |
| `dev/` | Yerel sunucu ve D1 benzeri SQLite sarmalayıcı |
