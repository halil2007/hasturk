# ikas Özel Arama — Kurulum

Tamamen ücretsiz: **GitHub** (ürünleri 2 saatte bir çeker) + **Cloudflare Pages** (dosyaları yayınlar) + ikas'a **tek satır** kod.

```
ikas API ──(GitHub Actions, 2 saatte bir)──▶ public/products.json ──▶ Cloudflare Pages ──▶ sitendeki arama
```

## Dosyalar
| Dosya | Ne işe yarar |
|---|---|
| `scripts/sync.mjs` | ikas'tan ürün, kategori, fiyat, stok, görsel, varyantları çeker → `public/products.json` |
| `.github/workflows/sync.yml` | Senkronu 2 saatte bir otomatik çalıştırır |
| `public/pm-search.js` | Arama menüsünün kendisi (tasarım + arama motoru) |
| `config.json` | Popüler aramalar, eş anlamlılar, renkler, telefon/WhatsApp, rozetler |
| `public/test.html` | Yayına aldıktan sonra deneme sayfası |
| `src/worker.js` | Ziyaretçi eğilimlerini toplar (`/e`) ve özetler (`/trends`); diğer her şey statik |
| `docs/trend-raporu.md` | Otomatik rapor: en çok satan/aranan/sepete eklenen, sonuçsuz aramalar, menü önerileri |

---

## 1. ikas: Özel uygulama
1. ikas paneli → **Uygulamalar → Uygulamalarım → Özel uygulama oluştur**
2. İzinler: **Ürünler (okuma)** ve **Kategoriler (okuma)**. "Çok satan" rozeti ve satış analizi için **Siparişler (okuma)** da eklenmeli (yoksa sadece site içi eğilimler kullanılır).
3. Çıkan **Client ID** ve **Client Secret**'ı bir kenara yaz. *Kimseyle paylaşma, sohbete yapıştırma.*
4. Mağaza adın: panel adresindeki `XXXX.myikas.com` kısmındaki `XXXX`.

**Merchant ID (görseller için):** Sitende herhangi bir ürün görseline sağ tıkla → "Resim adresini kopyala". Adres şöyle olur:
`https://cdn.myikas.com/images/`**`21337986-....-....`**`/be29df4e-.../1080/urun.webp` → kalın kısım Merchant ID.

## 2. GitHub
1. github.com'da hesap aç → **New repository** → ad: `magaza-arama` → **Private** → Create.
2. Bu klasördeki tüm dosyaları yükle (**Add file → Upload files**, `.github` klasörü dahil).
   > `.github` gizli klasör olduğu için görünmüyorsa: GitHub'da **Add file → Create new file** → ad kısmına `.github/workflows/sync.yml` yazıp içeriği yapıştır.
3. **Settings → Secrets and variables → Actions → New repository secret** ile şunları ekle:
   - `IKAS_STORE` → mağaza adın
   - `IKAS_CLIENT_ID`
   - `IKAS_CLIENT_SECRET`
   - `IKAS_MERCHANT_ID`
4. **Actions** sekmesi → "ikas ürünlerini senkronla" → **Run workflow**.
   Yeşil tik = `public/products.json` oluştu. Kırmızıysa loga tıkla, hatayı bana at.

## 3. Cloudflare (Workers)
1. dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → GitHub'ı bağla, `hasturk` deposunu seç.
2. Ayarlar: **Build command: boş**, **Deploy command: `npx wrangler deploy`** (varsayılan). Yayın ayarı repodaki `wrangler.jsonc` dosyasında; `public/` klasörü yayınlanır.
3. Adres: `https://hasturk-arama.halilc2007.workers.dev`
4. Kontrol: `https://hasturk-arama.halilc2007.workers.dev/test.html` aç, arama kutusuna tıkla, gerçek ürünlerin çıkmalı.

Bundan sonra GitHub her güncellemede dosyayı değiştirir, Cloudflare otomatik yeniden yayınlar.

## 4. ikas'a tek satır
Şu satırı sitenin tüm sayfalarına ekle:

```html
<script src="https://hasturk-arama.halilc2007.workers.dev/pm-search.js" defer></script>
```

Nereye: ikas panelinde tema/mağaza ayarlarındaki **özel kod (head/body)** alanı. O alan yoksa **Google Tag Manager** → Yeni etiket → **Özel HTML** → yukarıdaki satır → Tetikleyici: **All Pages** → Yayınla.

Artık sitendeki arama kutusuna tıklayan herkes yeni menüyü görür.

### İnce ayar (gerekirse)
Script satırına ekleyebileceğin ayarlar:
- `data-selector="#header input.search"` → yeni menü sitedeki arama kutusunu yakalamıyorsa, kutunun seçicisini yaz.
- `data-trigger=".search-icon, .header-search-button"` → büyüteç ikonuna tıklayınca da açılsın.
- `data-fab="off"` → sağ alttaki "Ürün Bul" butonunu gösterme.
- `data-auto="off"` → sitedeki arama butonlarını (büyüteç vb.) otomatik yakalamayı kapat. Otomatik tanıma bir butonu kaçırırsa `config.json` → `triggers` alanına seçicisini yaz.

Menüye bağlantı olarak `#hacim-hesapla` eklersen tıklayınca doğrudan toprak hesaplayıcı açılır (`#urun-ara` → arama).

Örnek: `<script src="https://hasturk-arama.halilc2007.workers.dev/pm-search.js" data-trigger=".search-icon" defer></script>`

## config.json
- `popular`: boş kutuda görünen "çok arananlar"
- `promo`: Kategoriler sekmesinin üstündeki kampanya kartı — `title`, `code` (dokununca kopyalanır), `note`, `shipping` (ücretsiz kargo metni; sepete ekle penceresinde de görünür)
- `featured`: "Öne çıkan kategoriler" görselli menüsü — `[{ "category": "Kategori adı", "img": "görsel adresi" }]`. Görseller **1200 × 600 px** hazırlanmalı; sadece Kategoriler sekmesinin ana bölümünde 2:1 çerçevede gösterilir (masaüstünde 2, telefonda 1 sütun). Dokununca kategorinin ürünleri panelde açılır (orada görsel tekrar gösterilmez).
- `boost`: Aramada ve kategori listelerinde öne çıkarılacak ürünlerin adres (slug) listesi; en üstteki en önce gelir. Mağaza markası (HasTürk/HG) ürünleri de otomatik öne alınır.
- `crossSell`: Sepete ekleyince onayla birlikte gösterilen "Yanına iyi gider" önerileri — `[{ "when": ["Kategori adı"], "offer": ["ürün-slug", "#Kategori adı"] }]`. `#` ile başlayan öneri o kategorinin en öne çıkan stoktaki ürünüdür. En fazla 2 öneri, oturum başına en fazla 3 kez; 12 sn sonra kendiliğinden kapanır, öneriden eklenen ürün için tekrar öneri çıkmaz. Kural yoksa normal bildirim çıkar.
- `soilMatch`: Bitkiye göre toprak önerisi. Arama kutusuna ya da Rehber sekmesine bitki adı yazılınca (örn. "monstera", "zeytin") "… için toprak" kartı çıkar. Bitkiye özel toprak varsa o, yoksa profili en yakın toprak "uyum %" ile önerilir; eksik özellik için katkı (perlit, asidik torf, vermikülit, solucan gübresi) eklenir. Profiller `docs/bitki-toprak-eslestirme.xlsx` dosyasından gelir (pH 1–4, drenaj/su/besin 1–3, yapı k/h/d).
  - **Yeni toprak eklerken güncelleme gerekmez:**
    1. Ürün adında listedeki bir bitki geçiyorsa (örn. "HG Philodendron Toprağı") o bitkiye kendiliğinden önerilir.
    2. ikas'ta ürüne şu etiketler eklenirse benzerlik önerilerine de girer: `pH:asidik|hafif asidik|nötr|kireçli`, `Drenaj:orta|yüksek|çok yüksek`, `Su:düşük|orta|yüksek`, `Besin:düşük|orta|zengin`, `Yapı:kumlu|havalı|dengeli`; isteğe bağlı `Grup:Salon|Sukulent|Çiçek|Asit seven|Meyve|Sebze|Aromatik` ve `Genel` (her bitkiye önerilebilir). Ürünler 2 saatte bir senkronlandığı için en geç 2 saatte menüye yansır.
  - Toprak özellikleri, üreticinin 10 litrelik karışım tariflerinden hesaplanır (`docs/bitki-toprak-eslestirme.xlsx` → Tarifler; hesap kuralları "Nasıl kullanılır" sayfasında). Benzerlik önerisinde yalnızca tarifi doğrulanmış (`v`) ya da ikas'ta etiketlenmiş topraklar kullanılır; tarifi olmayanlar sadece kendi bitkisine önerilir.
  - Bitkilerin pH ihtiyacı aralık olarak tutulur (örn. hafif asidik–nötr); toprak aralık içindeyse pH farkı sayılmaz.
  - Etiketsiz ve adında bitki geçmeyen toprak benzerlik önerisine girmez (yanlış öneri olmasın).
  - Yanıltmamak için: uyum `minFit` (%85) altındaysa hazır karışım önerilmez, "Kendi Toprak Karışımını Oluştur" (`custom`) ve "Uzmanımıza sorun" gösterilir. Bitki satırındaki 6. alan `"s"` ise (orkide, asit sevenler, bonsai, nilüfer) özel toprağı stokta yokken hiçbir toprak önerilmez. Özel toprağı olmayan bitkilerde hazır karışımın yanında kendi karışımı da önerilir. Aranan kelimede başka bir ürün türü (tohum, gübre, ilaç…) varsa kart çıkmaz.
- Arama: Türkçe tamlamada asıl ürün sondaki isimdir ("Saksı Toprağı" bir topraktır). Aranan kelime adda sadece niteleyici geçiyorsa ve katalogda o kelimenin asıl ürün olduğu ürünler varsa sonuç geriye düşer; kategori adı o kelimeyle bitenler öne çıkar.
- `bulkPattern` / `bulkPrice`: Ton bazlı/toptan ürünleri geriye atar. Varsayılan: adında "1 Ton" gibi ifade geçenler veya fiyatı 40.000 TL ve üzeri olanlar.
- `trust`: Ana bölümdeki güven şeridi — `[{ "icon": "leaf|shield|chat|truck", "title": "...", "text": "..." }]`. Verilmezse (varsayılan) gösterilmez.
- `promo.freeShipping`: Ücretsiz kargo eşiği (TL). Verilmezse `promo.shipping` yazısındaki tutar kullanılır (örn. 975). Sepet tutarı sitenin kendi sepet yanıtlarından okunur; sepette ürün varken panelin altında kalan tutarı gösteren hareketli çubuk çıkar, sepete eklemede bildirimde de yazar.
- `bestsellers`: Kartlarda "Çok satan" rozeti alacak ürünlerin slug listesi (verilmezse `boost` kullanılır).
- `calc.packs`: Toprak hesabında önerilecek torba boyutları (litre), varsayılan `[5, 10, 20, 40]`. Sonuç %`extra` oturma payı dahil gösterilir ve bu torbalara yuvarlanır.
- `hideNative`: ikas'ın kendi arama penceresinin CSS seçicisi; verilirse tüm ziyaretçilerde hiç görünmez. Seçiciyi bulmak için telefonda sitenin arama düğmesine bir kez basın, sonra adres çubuğuna `hasturkgubre.com.tr/#ua-debug` yazın; çıkan metni gönderin.
- `replaceMenu` (varsayılan açık) / `menuTrigger`: Telefonda sitenin menü düğmesine (☰) basılınca ikas menüsü yerine bu panel açılır (Ürün Bul ile aynı görünüm). Düğme adında menu/hamburger/drawer vb. geçiyorsa doğrudan tanınır; geçmiyorsa ikas menüsü açıldığı an kapatılıp panel açılır ve düğme hatırlanır. Tüm ziyaretçilerde ilk basıştan itibaren çalışması için `#ua-debug` çıktısındaki `menu` değerini `menuTrigger` seçicisi olarak ekleyin. `replaceMenu: false` kapatır. Bu ayar masaüstünü etkilemez.
- `desktopMenu` (varsayılan açık): Masaüstünde (en az 1024px genişlik + fare) ikas'ın üst kategori menüsü düzenli bir çubukla değiştirilir; kategorinin üzerine gelince geniş bir panel açılır (alt kategoriler sütunlar halinde, kategorinin çok satan 3 ürünü, "Tümünü gör"; ürün sayıları gösterilmez). Çubukta ikas menüsündeki kategoriler `categoryOrder` sırasıyla durur, kategori olmayan bağlantılar (Blog vb.) sona eklenir, "Anasayfa" atlanır (logo oraya gidiyor). ikas'tan önce devreye girer: script çalışır çalışmaz ikas menüsü görünmez yapılır, menünün küçük özeti (~12 KB, `ua-dnav-v1`) tarayıcıda saklandığı için ikinci sayfadan itibaren ilk karede kurulur; ikas (React) sayfayı canlandırana kadar aynı çubuğun geçici kopyası gösterilir. Menü bulunamazsa ya da 6 sn içinde kurulamazsa ikas menüsü olduğu gibi kalır. `false` kapatır; nesne olarak: `{ "items": ["Gübreler", "Topraklar", …], "hide": ["Toprak"], "labels": { "Halk Sağlığı Ürünleri": "Halk Sağlığı" }, "products": false }` (`items`: çubukta hangi ana kategorilerin hangi sırayla duracağı; ikas menüsünde olmasalar da gösterilir. `hide`: gösterilmeyecek kategoriler. `labels`: çubukta kısa ad). Menü yanlış yerde bulunursa `desktopNav` ile ikas menüsünün CSS seçicisi verilebilir.
- `categoryOrder`: ana kategorilerin gösterim sırası (listede olmayanlar sonra, ürün sayısına göre)
- `categoryLast`: en sona konacak ana kategoriler (örn. kedi/köpek)
- `categoryImages`: kategori adı → görseli kullanılacak ürünün adresi (slug)
- `pages`: "Sayfalar" sekmesindeki bağlantılar (`title`, `url`); aramada da çıkar
- `guides`: "Kullanım Rehberi" sekmesi ve aramadaki doz kartları. Her rehber: `title`, `product` (ürün slug'ı), `url` (rehber sayfası), `keywords`, `note`, `groups` → `{cat, name, plants[], steps: [[zaman, şekil, doz]]}`. `steps` boşsa bitki aramasında rehber sayfasına bağlantı gösterilir.
- `cart`: `enabled: false` → kartlarda "Ekle" butonunu gizle. "Ekle"ye basılınca ürün sayfası görünmez bir çerçevede (masaüstü genişliğinde) açılır; seçilen seçenek (örn. "5 Kg") işaretlenip sitenin kendi "Sepete Ekle" butonuna basılır. Müşteri panelden ayrılmaz. Eklenemezse ürün sayfasına bağlantı gösterilir. `cartUrl`: "Sepete git" adresi (varsayılan `/cart`). (Sitede `window.UrunAramaSepet(varyantId, adet)` tanımlanırsa doğrudan o kullanılır.)
  - **"Sepete eklendi" yalnızca kanıtla gösterilir:** butona basıldıktan sonra sitenin kendi kodu seçilen varyantın (ya da ürünün) kimliğini içeren bir istek gönderip hatasız cevap almalı, ya da dönen sepette o varyantın adedi artmış olmalı. Kanıt yoksa 8 sn sonra "Sepete eklenemedi" denir ve ürün sayfası bağlantısı gösterilir. Son 5 denemenin kaydı `#ua-debug` ile görülür.
  - Hızlandırmalar (sıcak çerçeve `cart.warm`, doğrudan ekleme `cart.direct`) canlıda doğrulanana kadar varsayılan olarak kapalıdır; `true` verilirse açılır.
- Paket (BUNDLE) ürünler: ikas'ta kendi stokları olmadığı için stok, içindeki ürünlerden hesaplanır (her parça istenen adette stoktaysa "stokta").
- `triggers`: sitenin kendi arama butonunun CSS seçicisi (boşsa otomatik tanınır). Tanınmayan bir buton ikas'ın aramasını açarsa panel kapatılır, bizimki açılır ve buton tarayıcıda hatırlanır.
- `calc`: toprak hesaplayıcı — `enabled`, `extra` (oturma payı %), `recommend.pot` / `recommend.bed` (sonuçtan sonra yönlendirilecek toprak kategorilerinin adları; boşsa `categories` altındaki alt kategoriler)
- `synonyms`: "müşteri bunu yazarsa şunu da ara" (Türkçe karakterleri yazman gerekmez)
- `badges`: ikas'taki etiket adı → üründe görünecek sarı rozet (örn. `"3 Al 2 Öde"`)
- `phone`, `whatsapp`: doluysa altta arama/WhatsApp çubuğu çıkar (`"0216 000 00 00"`, `"905xxxxxxxxx"`)
- `colors`: marka renklerin (`primary` ana renk, `dark` koyu ton)
- `fab`: sağ alttaki "Ürün Bul" butonu — `enabled` (false = gizle), `text`, `side` (`"right"`/`"left"`), `bottom` (alttan px), `animate` (false = hareketsiz). Altta sabit bir şey (çerez uyarısı, sepet çubuğu vb.) belirirse buton otomatik olarak onun üstüne çıkar, kaybolunca geri iner; ekranı kaplayan pencerede gizlenir.

config.json'u GitHub'da düzenleyip kaydettiğinde senkron kendiliğinden çalışır.

## Ziyaretçi eğilimleri (analiz)
Widget anonim olarak (IP, çerez, kimlik tutmadan) şunları sayar: aranan kelimeler, sonuç bulunamayan aramalar, panelden/menüden ürün tıklamaları, ürün sayfası görüntülemeleri ve **sitenin her yerinden** sepete eklemeler (ikas'ın kendi butonu dahil; sepet yanıtından okunur). Her olay bir oturumda bir kez sayılır, toplu gönderilir. Cloudflare'de günlük toplamlar tutulur (D1 veritabanı `hasturk-egilim`, ilk yayında otomatik oluşur; son 2 yılın sezonu için 800 gün saklanır).

`scripts/sync.mjs` 2 saatte bir şu verileri birleştirir: son 30 günün site içi olayları, ikas'taki son 60 günün siparişleri ve **1 ile 2 yıl önceki aynı dönem** (sipariş + site içi). Ürün puanı `h` (0-100) dört parçadan oluşur:
1. **Şimdi:** 4 × satış + 2 × sepete ekleme + 1 × tıklama + 0,3 × görüntüleme. Yeni olan ağır basar (sipariş yarı ömrü 20 gün, olaylar 10 gün); sert sıfırlama yok.
2. **İvme:** Son 7 günün hızı ÷ önceki 3 haftanın hızı. En az 1,5 kat hızlanan ve yeterli hacmi olan ürün "yükselen" sayılır, ek puan alır. Bu yıl yeni tutan ürün sezon verisini beklemeden öne çıkar.
3. **Sezon:** Geçmiş yıllarda bugünden 1 hafta önce ile 1 ay sonrası arasında satılanlar (geçen yıl ağırlık 1, 2 yıl önce 0,5). Mağazanın büyüme oranıyla ölçeklenir.
4. **Teyit:** O yılın son 2 haftası ile bu yılın son 2 haftası karşılaştırılır. Bu yıl geride kalan ürünün sezon puanı %40'a kadar düşer, önde gidenin %150'ye kadar çıkar.

Puan = şimdi + ivme + 0,6 × sezon × teyit. Kullanıldığı yerler:
- **Arama:** Stoktaki ürünlere küçük bir öne çıkarma (alaka her zaman önce).
- **Masaüstü menü "Çok satanlar":** Bu puana göre seçilir; `"desktopMenu": { "picks": { "Topraklar": ["urun-slug"] } }` ile elle sabitlenebilir.
- **"Ürün Bul" ana ekranı "Şu sıralar çok tercih edilenler":** Yükselen, sezonun ürünü (bu yıl geride olmayan) ve çok satanlar; sadece stoktaki ürünler, ton/toptan hariç. `"trendBlock": false` kapatır.
- **"Çok satan" rozeti:** Gerçek siparişlerde en çok satan 12 ürün (bugün + teyitli sezon) ve `bestsellers`.
- **"Sık arananlar":** Bugün aranan + yükselen + geçmiş yılların bu dönemi; bugün sonuç vermeyen kelime gösterilmez. Eksik kalırsa `popular` ile tamamlanır (`"trendPopular": false` sadece elle listeyi kullanır).
- **Rapor (`docs/trend-raporu.md`):** Yükselenler, yaklaşan sezon (teyit ve stok durumuyla), geçen yıl revaçta olup bu yıl geride kalanlar, çok satanlar, aramalar (yükselenler işaretli), sonuçsuz aramalar, çok bakılıp az sepete eklenenler, menü önerileri.

Kapatmak: `"analytics": false` (config.json) ya da script etiketine `data-collect="off"`.

## Maliyet
GitHub Actions (özel depo: ayda 2000 dk ücretsiz, bu iş ~360 dk kullanır) + Cloudflare Pages (statik dosya istekleri sınırsız) = **0 TL**.
