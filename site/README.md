# Hastürk CRM — tanıtım sitesi

Statik site (HTML + CSS + az JS); panelden bağımsız bir Cloudflare Worker olarak yayınlanır.

Sayfalar: ana sayfa (`/`), `/ozellikler` (+ her özellik için ayrı sayfa), `/entegrasyonlar` (+ her kanal için ayrı sayfa), `/paketler`, `/hakkimizda` (güvenlik dahil), `/iletisim`, `/demo`,
yasal sayfalar (`/kvkk`, `/gizlilik`, `/kullanim-kosullari`) ve 404.

## Yayına alma
1. Cloudflare → **Workers & Pages → Create → Import a repository** → `hasturk` deposu → proje adı `hasturk-site`, **Path: `/site`**.
2. Yayından sonra Worker → **Settings → Domains & Routes → Custom domain**: `hasturkcrm.com` ve `www.hasturkcrm.com`.
3. Panel Worker'ında (hasturk-panel) `SITE_ORIGINS` boşsa `https://hasturkcrm.com,https://www.hasturkcrm.com` varsayılır.
   Formlar bu adreslerden panele gönderilir; talepler panelde **Destek**'e "Web sitesi" olarak düşer.

## Demo paneli
Sitedeki **Canlı Demo** düğmeleri hiçbir bilgi istemeden `https://panel.hasturkcrm.com/api/public/demo` adresini açar (IP başına saatte 30 giriş).
Bu adres, panelde **demo** firma koduyla otomatik açılan, örnek verilerle çalışan ortak firma paneline girer (bkz. `panel/src/tenants.js`, `panel/src/lead.js`).
Bu yalnız herkese açık örnek demodur; müşterilere açılan 7 günlük deneme panelleri kendi firmalarıdır ve hiçbir zaman sıfırlanmaz.
- Ziyaretçi "Demo kullanıcı" personel hesabıyla girer: siparişler, kargo, stok, ürünler, raporlar, gelir & gider açık;
  ayarlar, entegrasyon bilgileri, kullanıcılar, şifre ve iki adımlı doğrulama kapalı.
- Panel kendini sıfırlar: 20 dakika kimse kullanmazsa (son sıfırlamadan 1 saat geçtiyse) ve her durumda günde bir; ziyaretçilerin değişiklikleri silinir, örnek veriler yeniden gelir, açık oturumlar düşmez.
- Ana panelde **Firmalar** listesinde "Demo Mağaza" olarak görünür; askıya alırsanız demo kapanır.
- Panelde `PANEL_SECRET` tanımlı olmalı (müşteri panelleri için zaten gerekli).

## Düzenleme
Sayfalar `src/` klasöründen derlenir; **`public/*.html` dosyalarını elle düzenlemeyin**:
- `src/layout.html`: tüm sayfalarda ortak üst çubuk, menü, alt bilgi, WhatsApp düğmesi.
- `src/pages/*.html`: sayfa içerikleri (başındaki yorum bloğu: başlık, açıklama, adres).
- `src/data.mjs`: özellik ve entegrasyon sayfalarının içeriği (`/ozellikler/<ad>`, `/entegrasyonlar/<ad>`) ve üst menüdeki açılır listeler.
  Buradaki her cümle panelin bugün yaptığıyla birebir olmalı; yeni özellik ya da kanal eklenince buraya da ekleyin.
- `src/sprite.svg`: simgeler.

Düzenledikten sonra derleyin (Node.js yeterli, bağımlılık yok) ve `public/` ile birlikte kaydedin:
```bash
cd site && node build.mjs
```

Derleme ayrıca:
- Her sayfaya arama motoru verisi (JSON-LD: kuruluş, site, sayfa yolu, yazılım + KDV dahil paket fiyatları, sayfadaki sık sorulan sorular),
  Open Graph / Twitter kartı ve `robots` etiketini ekler, `public/sitemap.xml`'i yeniden yazar.
- `site.css`, `site.js`, `config.js` adreslerine içerik özeti ekler (`?v=…`). Bu dosyalar tarayıcıda uzun süre saklanır (`public/_headers`);
  değiştirdikten sonra **mutlaka derleyin**, yoksa ziyaretçiler eski sürümü görmeye devam eder (`config.js` en geç 10 dakikada yenilenir).
- Sayfanın ilk büyük görselini öncelikli, diğerlerini ekrana yaklaşınca yükler.
- `public/llms.txt`'in ve `src/blog-shell.mjs` → `LLMS`'in sabit kısmını (ürün, özellikler, entegrasyonlar, araçlar, fiyatlar) üretir;
  `/llms-full.txt` buna `LLMS_FULL`'u (kanal başına desteklenen işlemler, paket içerikleri, özellikler) ve tüm blog yazılarını ekler.
- `site.js`'in tarayıcıda doldurduğu içeriği (şirket / iletişim bilgileri, paket kartları ve fiyatlar, karşılaştırma tablosu, ana sayfadaki kanal listesi)
  HTML'e de yazar: JavaScript çalıştırmayan arama motoru ve yapay zekâ tarayıcıları (GPTBot, ClaudeBot, PerplexityBot …) da görür.
  `site.js`'teki biçimi değiştirirseniz `build.mjs` → `planCards`, `compareTable`, `integList` de aynı kalmalı.
- Site haritasındaki `lastmod`, sayfanın içeriği (`<main>`) değişince ilerler; sayfa başına içerik özeti ve tarih `src/lastmod.json`'da tutulur
  (derleme günceller, `public/` ile birlikte kaydedin). `/blog` ve yazılar `/blog/sitemap.xml`'dedir (panel, gerçek tarihleriyle).

Arama motoru denetimi: `cd site && node --test` → `test/seo.test.mjs` her sayfada başlık (≤60), açıklama (110–160), canonical, tek H1, başlık sırası,
Open Graph / X kartı, JSON-LD (çakışmasız; SSS cevapları sayfada görünür; fiyatlar config.js ve panel/src/plans.js ile aynı), site haritası, kırık iç bağlantı,
görsel alt / boyut, JS'siz okunan fiyat ve şirket bilgileri, robots.txt ve llms.txt'i denetler.

Paylaşım görseli (Open Graph / X, 1200×630): `public/img/og-hasturk-crm.jpg`; logo ya da ekran görüntüsü değişince `python3 scripts/og-image.py` ile yeniden üretin.

IndexNow (Bing, Yandex, Seznam, Naver; Google kullanmaz): anahtar dosyası `public/<anahtar>.txt`. Yayından **sonra** değişen sayfaları bildirmek için:
```bash
cd site && node scripts/indexnow.mjs            # lastmod'u bugün olan sayfalar (--since 2026-10-01, --all, --dry-run)
```
Blog yazıları Worker'ın zamanlayıcısıyla bildirilir (aşağıda `INDEXNOW_KEY`; aynı anahtarı kullanabilirsiniz). Alternatif: Cloudflare → alan adı →
Caching → Configuration → **Crawler Hints** açılırsa Cloudflare değişen sayfaları IndexNow'a kendisi bildirir (betiğe gerek kalmaz).
Ayrıca Google Search Console ve Bing Webmaster Tools'a `https://hasturkcrm.com/sitemap.xml` ve `https://hasturkcrm.com/blog/sitemap.xml` ekleyin.

Blog (`src/worker.js`): `/blog`, `/blog/<adres>`, `/blog/rss.xml`, `/blog/sitemap.xml`, `/llms.txt`, `/llms-full.txt` panelden tek istekle çizilir ve
Cloudflare önbelleğinde tutulur (liste 2 dk, yazı 10 dk, 404 1 dk; süresi geçen sayfa beklemeden sunulup arka planda yenilenir, panel açılmazsa eski kopya sunulur).
İleri tarihli yazı yayın saatine kadar 404'tür ve site haritasında / RSS'te / llms.txt'de yer almaz. Deneme: `cd site && node --test` (~250 yazılı sahte panel).
IndexNow (Bing / Yandex'e anında bildirim): Worker → Settings → Variables and Secrets → `INDEXNOW_KEY` (8–128 harf / rakam) girilince 15 dakikada bir
yeni yayına giren yazılar bildirilir; girilmezse kapalıdır.

Online satış: `/satin-al` sayfası (paket kartlarındaki "Hemen satın al") formu panele (`checkoutUrl`) gönderir, ödeme iyzico sayfasında alınır, sonuç sayfası panelde gösterilir. Fiyatı değiştirirseniz `public/assets/config.js` ile birlikte `panel/src/plans.js`'i de güncelleyin (tahsil edilen tutar panelden alınır). iyzico başvurusu için gereken yasal sayfalar hazır: `/mesafeli-satis-sozlesmesi`, `/on-bilgilendirme`, `/iptal-iade` (şirket bilgileri config.js'den dolar; yayından önce bir hukukçuya kontrol ettirin).

Ayarlar (değiştirdikten sonra `node build.mjs` çalıştırın; arama motoru verisi ve önbellek adresi de güncellenir):
- **Şirket bilgileri, telefon, WhatsApp, e-posta, paket fiyatları (KDV dahil) ve karşılaştırma tablosu:** `public/assets/config.js`
  (boş alanlar sitede gösterilmez; yasal sayfalarda sarı `[yer tutucu]` olarak kalır — yayından önce doldurun).
  Bir pakete henüz aktif olmayan özellik eklemek için `soon: [...]` kullanın; kartta "Yakında" rozetiyle görünür.
- **Kanal listesi (aktif / test aşamasında / yakında):** `public/assets/site.js` → `ACTIVE`, `TEST`, `SOON`; kanal sayfaları `src/data.mjs` → `INTEGRATIONS`. Kanal yetenek tablosu `src/pages/entegrasyonlar.html` içindedir.
  Liste sayfasındaki kartlar (arama + kategori sekmeleri: Pazaryerleri, E-ticaret siteleri, Yurt dışı, Hızlı teslimat, Kargo) `data.mjs`'teki `kind`'dan derlenir; kargo firmalarının kartları ve kendi sayfaları (`/entegrasyonlar/<firma>`) `data.mjs` → `CARRIERS`'tan derlenir (içerik `panel/src/carriers.js` ve `panel/src/carriers/<firma>.js`'teki bağlantının yaptıklarıyla birebir olmalı; test aşamasındaki firmada `beta: true`). Sekme adresle de açılır: `/entegrasyonlar#kargo`.
  Kart özetleri ve "Desteklenen işlemler" kutusu yalnız `caps`'te açık olan işlemlerden üretilir (`build.mjs` → `capShort`). Kanal ve kargo sayfalarının
  metinleri (başlık, açıklama, giriş, kutular, kurulum, SSS, çağrı bandı) `src/integration-pages.mjs`'tedir ve her sayfaya özel yazılır; şablon cümle yoktur.
  **Sayfalar birbirinin adı değiştirilmiş kopyası olmamalı** (Google: scaled content abuse): yeni kanal eklerken başka sayfadan cümle kopyalamayın.
  `node scripts/similarity.mjs` aynı ailedeki sayfaların benzerliğini (kelime üçlüsü Jaccard), aynı / çok benzer başlık ve açıklamaları ve tekrarlanan
  cümleleri raporlar; `test/seo.test.mjs` entegrasyon ve özellik sayfalarında tekrarlanan cümleye ve benzerlik sınırının aşılmasına izin vermez.
  Test aşamasındaki kanallar (Amazon, Çiçeksepeti, Koçtaş, Shopify, OpenCart, Etsy; `data.mjs`'te `beta`) menüde, kartlarda ve kendi sayfalarında **“Test aşamasında”** etiketiyle görünür.
  Ana panelde Entegrasyonlar → kanal → **“Test yazısını kaldır”** denince etiket sitede de kalkar (sayfalar `/api/public/channels`'tan okur; derleme gerekmez).
- **Rakamlar şeridi** (ana sayfa, `class="stats"`): yalnız doğrulanabilir bilgiler yazın (müşteri sayısı, memnuniyet oranı gibi değerleri gerçek veri olmadan eklemeyin).
- **Ekran görüntüleri:** `public/img/*.jpg` (panelin deneme modundan, 1440×900).
- **Yasal metinler:** `src/pages/kvkk.html`, `gizlilik.html`, `kullanim-kosullari.html` — yayından önce bir hukukçuya kontrol ettirin.
- Panel adresi değişirse: `config.js` (`panelUrl`, `leadUrl`) ve `public/_headers` (`connect-src`).

## Yerelde bakmak
`/ozellikler` gibi uzantısız adresler Cloudflare'de `ozellikler.html` dosyasına gider. Yerelde aynı davranış için:
```bash
cd site && npx wrangler dev   # ya da: cd site/public && python3 -m http.server 8080 → http://localhost:8080/ozellikler.html
```
