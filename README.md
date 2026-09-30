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

---

## 1. ikas: Özel uygulama
1. ikas paneli → **Uygulamalar → Uygulamalarım → Özel uygulama oluştur**
2. İzinler: **Ürünler (okuma)** ve **Kategoriler (okuma)** yeterli.
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
- `bulkPattern` / `bulkPrice`: Ton bazlı/toptan ürünleri geriye atar. Varsayılan: adında "1 Ton" gibi ifade geçenler veya fiyatı 40.000 TL ve üzeri olanlar.
- `trust`: Ana bölümdeki güven şeridi — `[{ "icon": "leaf|shield|chat|truck", "title": "...", "text": "..." }]`. Verilmezse (varsayılan) gösterilmez.
- `bestsellers`: Kartlarda "Çok satan" rozeti alacak ürünlerin slug listesi (verilmezse `boost` kullanılır).
- `calc.packs`: Toprak hesabında önerilecek torba boyutları (litre), varsayılan `[5, 10, 20, 40]`. Sonuç %`extra` oturma payı dahil gösterilir ve bu torbalara yuvarlanır.
- `hideNative`: ikas'ın kendi arama penceresinin CSS seçicisi; verilirse tüm ziyaretçilerde hiç görünmez. Seçiciyi bulmak için telefonda sitenin arama düğmesine bir kez basın, sonra adres çubuğuna `hasturkgubre.com.tr/#ua-debug` yazın; çıkan metni gönderin.
- `categoryOrder`: ana kategorilerin gösterim sırası (listede olmayanlar sonra, ürün sayısına göre)
- `categoryLast`: en sona konacak ana kategoriler (örn. kedi/köpek)
- `categoryImages`: kategori adı → görseli kullanılacak ürünün adresi (slug)
- `pages`: "Sayfalar" sekmesindeki bağlantılar (`title`, `url`); aramada da çıkar
- `guides`: "Kullanım Rehberi" sekmesi ve aramadaki doz kartları. Her rehber: `title`, `product` (ürün slug'ı), `url` (rehber sayfası), `keywords`, `note`, `groups` → `{cat, name, plants[], steps: [[zaman, şekil, doz]]}`. `steps` boşsa bitki aramasında rehber sayfasına bağlantı gösterilir.
- `cart`: `enabled: false` → kartlarda "Ekle" butonunu gizle. "Ekle"ye basılınca ürün sayfası görünmez bir çerçevede (masaüstü genişliğinde) açılır; seçilen seçenek (örn. "5 Kg") işaretlenip sitenin kendi "Sepete Ekle" butonuna basılır. Müşteri panelden ayrılmaz. Eklenemezse ürün sayfasına bağlantı gösterilir. `cartUrl`: "Sepete git" adresi (varsayılan `/cart`). (Sitede `window.UrunAramaSepet(varyantId, adet)` tanımlanırsa doğrudan o kullanılır.)
- `triggers`: sitenin kendi arama butonunun CSS seçicisi (boşsa otomatik tanınır). Tanınmayan bir buton ikas'ın aramasını açarsa panel kapatılır, bizimki açılır ve buton tarayıcıda hatırlanır.
- `calc`: toprak hesaplayıcı — `enabled`, `extra` (oturma payı %), `recommend.pot` / `recommend.bed` (sonuçtan sonra yönlendirilecek toprak kategorilerinin adları; boşsa `categories` altındaki alt kategoriler)
- `synonyms`: "müşteri bunu yazarsa şunu da ara" (Türkçe karakterleri yazman gerekmez)
- `badges`: ikas'taki etiket adı → üründe görünecek sarı rozet (örn. `"3 Al 2 Öde"`)
- `phone`, `whatsapp`: doluysa altta arama/WhatsApp çubuğu çıkar (`"0216 000 00 00"`, `"905xxxxxxxxx"`)
- `colors`: marka renklerin (`primary` ana renk, `dark` koyu ton)
- `fab`: sağ alttaki "Ürün Bul" butonu — `enabled` (false = gizle), `text`, `side` (`"right"`/`"left"`), `bottom` (alttan px), `animate` (false = hareketsiz). Altta sabit bir şey (çerez uyarısı, sepet çubuğu vb.) belirirse buton otomatik olarak onun üstüne çıkar, kaybolunca geri iner; ekranı kaplayan pencerede gizlenir.

config.json'u GitHub'da düzenleyip kaydettiğinde senkron kendiliğinden çalışır.

## Maliyet
GitHub Actions (özel depo: ayda 2000 dk ücretsiz, bu iş ~360 dk kullanır) + Cloudflare Pages (statik dosya istekleri sınırsız) = **0 TL**.
