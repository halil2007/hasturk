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

Online satış: `/satin-al` sayfası (paket kartlarındaki "Hemen satın al") formu panele (`checkoutUrl`) gönderir, ödeme iyzico sayfasında alınır, sonuç sayfası panelde gösterilir. Fiyatı değiştirirseniz `public/assets/config.js` ile birlikte `panel/src/plans.js`'i de güncelleyin (tahsil edilen tutar panelden alınır). iyzico başvurusu için gereken yasal sayfalar hazır: `/mesafeli-satis-sozlesmesi`, `/on-bilgilendirme`, `/iptal-iade` (şirket bilgileri config.js'den dolar; yayından önce bir hukukçuya kontrol ettirin).

Ayarlar (değiştirdikten sonra `node build.mjs` çalıştırın; arama motoru verisi ve önbellek adresi de güncellenir):
- **Şirket bilgileri, telefon, WhatsApp, e-posta, paket fiyatları (KDV dahil) ve karşılaştırma tablosu:** `public/assets/config.js`
  (boş alanlar sitede gösterilmez; yasal sayfalarda sarı `[yer tutucu]` olarak kalır — yayından önce doldurun).
  Bir pakete henüz aktif olmayan özellik eklemek için `soon: [...]` kullanın; kartta "Yakında" rozetiyle görünür.
- **Kanal listesi (aktif / yakında):** `public/assets/site.js` → `ACTIVE`, `SOON`. Kanal yetenek tablosu `src/pages/entegrasyonlar.html` içindedir.
- **Rakamlar şeridi** (ana sayfa, `class="stats"`): yalnız doğrulanabilir bilgiler yazın (müşteri sayısı, memnuniyet oranı gibi değerleri gerçek veri olmadan eklemeyin).
- **Ekran görüntüleri:** `public/img/*.jpg` (panelin deneme modundan, 1440×900).
- **Yasal metinler:** `src/pages/kvkk.html`, `gizlilik.html`, `kullanim-kosullari.html` — yayından önce bir hukukçuya kontrol ettirin.
- Panel adresi değişirse: `config.js` (`panelUrl`, `leadUrl`) ve `public/_headers` (`connect-src`).

## Yerelde bakmak
`/ozellikler` gibi uzantısız adresler Cloudflare'de `ozellikler.html` dosyasına gider. Yerelde aynı davranış için:
```bash
cd site && npx wrangler dev   # ya da: cd site/public && python3 -m http.server 8080 → http://localhost:8080/ozellikler.html
```
