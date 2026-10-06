# Hastürk CRM — tanıtım sitesi

Statik site (HTML + CSS + az JS); panelden bağımsız bir Cloudflare Worker olarak yayınlanır.

## Yayına alma
1. Cloudflare → **Workers & Pages → Create → Import a repository** → `hasturk` deposu → **Root directory: `site`**.
2. Yayından sonra Worker → **Settings → Domains & Routes → Custom domain**: `hasturkcrm.com` ve `www.hasturkcrm.com`.
3. Panel Worker'ına (hasturk-panel) değişken: `SITE_ORIGINS = https://hasturkcrm.com,https://www.hasturkcrm.com`
   (boşsa bu iki adres varsayılır). Demo formu bu adreslerden panele gönderilir; talepler panelde **Destek**'e "Web sitesi" olarak düşer.

## Düzenleme
- **Şirket bilgileri, iletişim, paket fiyatları:** `public/assets/config.js` (boş alanlar sitede gösterilmez; yasal sayfalarda sarı `[yer tutucu]` olarak kalır — yayından önce doldurun).
- **Kanal listesi (aktif / yakında):** `public/assets/site.js` → `ACTIVE`, `SOON`.
- **Ekran görüntüleri:** `public/img/*.jpg` (panelin deneme modundan, 1440×900).
- **Yasal metinler:** `kvkk.html`, `gizlilik.html`, `kullanim-kosullari.html` — yayından önce bir hukukçuya kontrol ettirin.
- Panel adresi değişirse: `config.js` (`panelUrl`, `leadUrl`) ve `public/_headers` (`connect-src`).

## Yerelde bakmak
```bash
cd site/public && python3 -m http.server 8080   # http://localhost:8080
```
