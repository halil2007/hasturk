# Hastürk CRM — tanıtım sitesi

Statik site (HTML + CSS + az JS); panelden bağımsız bir Cloudflare Worker olarak yayınlanır.

Sayfalar: ana sayfa (`/`), `/ozellikler`, `/entegrasyonlar`, `/paketler`, `/hakkimizda` (güvenlik dahil), `/iletisim`, `/demo`,
yasal sayfalar (`/kvkk`, `/gizlilik`, `/kullanim-kosullari`) ve 404.

## Yayına alma
1. Cloudflare → **Workers & Pages → Create → Import a repository** → `hasturk` deposu → proje adı `hasturk-site`, **Path: `/site`**.
2. Yayından sonra Worker → **Settings → Domains & Routes → Custom domain**: `hasturkcrm.com` ve `www.hasturkcrm.com`.
3. Panel Worker'ında (hasturk-panel) `SITE_ORIGINS` boşsa `https://hasturkcrm.com,https://www.hasturkcrm.com` varsayılır.
   Formlar bu adreslerden panele gönderilir; talepler panelde **Destek**'e "Web sitesi" olarak düşer.

## Demo paneli
`/demo` sayfasındaki form gönderilince panel 14 gün geçerli bir demo bağlantısı döndürür. Bağlantı, panelde **demo** firma koduyla
otomatik açılan, örnek verilerle çalışan firma paneline girer (bkz. `panel/src/tenants.js`, `panel/src/lead.js`):
- Ziyaretçi "Demo kullanıcı" personel hesabıyla girer: siparişler, kargo, stok, ürünler, raporlar, gelir & gider açık;
  ayarlar, entegrasyon bilgileri, kullanıcılar, şifre ve iki adımlı doğrulama kapalı.
- Panel her gün kendini sıfırlar (ziyaretçilerin yaptığı değişiklikler silinir, örnek veriler yeniden gelir).
- Ana panelde **Firmalar** listesinde "Demo Mağaza" olarak görünür; askıya alırsanız demo kapanır.
- Panelde `PANEL_SECRET` tanımlı olmalı (müşteri panelleri için zaten gerekli).

## Düzenleme
Sayfalar `src/` klasöründen derlenir; **`public/*.html` dosyalarını elle düzenlemeyin**:
- `src/layout.html`: tüm sayfalarda ortak üst çubuk, menü, alt bilgi, WhatsApp düğmesi.
- `src/pages/*.html`: sayfa içerikleri (başındaki yorum bloğu: başlık, açıklama, adres).
- `src/sprite.svg`: simgeler.

Düzenledikten sonra derleyin (Node.js yeterli, bağımlılık yok) ve `public/` ile birlikte kaydedin:
```bash
cd site && node build.mjs
```

Derleme gerektirmeyen ayarlar:
- **Şirket bilgileri, telefon, WhatsApp, e-posta, paket fiyatları ve karşılaştırma tablosu:** `public/assets/config.js`
  (boş alanlar sitede gösterilmez; yasal sayfalarda sarı `[yer tutucu]` olarak kalır — yayından önce doldurun).
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
