# Teklif Robotu

Müşteri ve araç bilgilerini **bir kez** girersiniz; robot, kayıtlı tüm sigorta şirketlerinin acente portallarını **kendi bilgisayarınızdaki tarayıcıda** aynı anda doldurur, fiyatları okur ve tek tabloda ucuzdan pahalıya sıralar.

```
[ Form: TC, plaka, belge… ]  →  Chrome/Edge (her şirket bir sekme)  →  [ Fiyat tablosu + ekran görüntüleri ]
        127.0.0.1:3737              şirketin kendi ekranı, sizin oturumunuz
```

- **API gerekmez.** Robot, sizin elle yaptığınız tıklama ve yazmaları tekrarlar (Doğanium, Open Hızlı Teklif, İhsan Yazılım gibi ürünlerin "robot" yöntemi).
- **Her şey sizin bilgisayarınızda kalır.** Şifre kaydedilmez, girişi siz yaparsınız (SMS kodu dahil). Sunucu yalnızca `127.0.0.1` adresinden erişilebilir, müşteri bilgisi diske yazılmaz (sadece fiyat ve ekran görüntüsü `sonuclar/` klasörüne kaydedilir).
- Oturumlar robot açık kaldığı sürece korunur: sabah her portala bir kez girersiniz, gün boyu tekrar sormaz (portalın kendi oturum süresi kadar).

## Kurulum (Windows, bir kez)

1. [Node.js LTS](https://nodejs.org) kurun.
2. Bu `teklif-robotu` klasörünü bilgisayarınıza kopyalayın (ör. `C:\teklif-robotu`).
3. `baslat.bat` dosyasına çift tıklayın. İlk açılışta gerekli paket kurulur, tarayıcıda `http://127.0.0.1:3737` açılır.

Robot bilgisayarınızdaki **Chrome**'u kullanır, yoksa **Edge**'i. İki demo şirket (Demo Sigorta A/B) hazır gelir: "Teklif al"a basın, açılan pencerede herhangi bir kullanıcı/şifre ile giriş yapın ve fiyatların tabloya düştüğünü görün.

## Şirket ekleme: bir kez göstermek yeterli (şirket başına ~5 dk)

Her şirketin ekranı farklı olduğu için robota her şirketi **bir kez** gösterirsiniz:

1. Robot açıksa kapatın (aynı tarayıcı profilini kullanırlar).
2. `kaydet.bat` dosyasına çift tıklayın. Sorulanlar:
   - kısa kod (`anadolu`, `axa`, `sompo`… boşluksuz), şirket adı, portal adresi,
   - kayıtta ekrana **yazacağınız** örnek değerler (gerçek bir müşterinin TC'si, plakası vb.; portallar TRAMER/EGM sorgusu yaptığı için gerçek kayıt gerekir).
3. Açılan pencerede **giriş yapın** (şifre/SMS — bu kısım kaydedilmez), teklif ekranının başına gelin, konsola dönüp **ENTER**.
4. Teklifi normal şekilde doldurun, "hesapla"ya basın. Fiyat ekrana gelince konsola dönüp **ENTER**.
5. `adaptorler/<kod>.mjs` oluşur ve şirket listeye eklenir. Konsol hangi alanların veriye bağlandığını söyler; "bulunamayan alanlar" uyarısı çıkarsa o değeri ekrana farklı yazmışsınızdır (ör. `34 ABC 123` yerine `34ABC123`).

17 şirket için bunu 17 kez yaparsınız; sonrasında her sorgu tek formdan gider.

### Kayıttan sonra ince ayar (gerekirse)

Adaptör sıradan bir metin dosyasıdır; Not Defteri ile açılabilir. Sık gereken düzeltmeler:

| Durum | Ne yapılır |
|---|---|
| Fiyat yanlış satırdan okunuyor | `fiyatSecici` alanına fiyatın seçicisini yazın (ör. `'#odenecek'`). Boşken "Brüt prim / Ödenecek" satırı otomatik aranır, vergi/komisyon satırları atlanır. |
| Fiyat geç geliyor | Son satırdaki `arac.bekle(1500)` yerine sonucu bekleyin: `await page.getByText('Brüt Prim').waitFor();` |
| Plaka 3 kutuya bölünmüş | `veri.plakaIl`, `veri.plakaHarf`, `veri.plakaNo` kullanın (kayıt bunları çoğunlukla kendisi bağlar). |
| Trafik ve kasko farklı ekran | `if (veri.brans === 'kasko') { … }` ile dallanın ya da kasko için ayrı kod ile ikinci kayıt yapın (`anadolu-kasko`). |
| Portal ekranı değişti | `kaydet.bat` ile aynı kodu yeniden kaydedin (eski dosya `.yedek` olarak saklanır). |

Değişiklik bir sonraki sorguda geçerli olur, robotu kapatıp açmak gerekmez.

## Kullanım

1. `baslat.bat` → tarayıcıda form açılır.
2. Gün başında şirket listesindeki **Aç** düğmeleriyle portallara giriş yapın (ya da doğrudan "Teklif al"a basın: oturumu kapalı şirket tabloda **"Giriş bekleniyor"** görünür, ilgili sekmede giriş yaptığınız anda robot kaldığı yerden devam eder).
3. Bilgileri girin, şirketleri seçin, **Teklif al**. Sonuçlar canlı gelir; en uygun teklif en üstte yeşil. Her satırın **ekran** bağlantısı, şirket ekranının o anki görüntüsüdür — fiyatı oradan teyit edin.

## Ayarlar (`ayarlar.json`)

| Ayar | Varsayılan | Anlamı |
|---|---|---|
| `esZamanli` | 6 | Aynı anda çalışan şirket sayısı. Bilgisayar yavaşsa düşürün. |
| `kanal` | `chrome` | `chrome` ya da `msedge`. |
| `gizli` | `false` | `true`: pencere görünmez. Giriş gerektiğinde çalışmaz; önce görünür modda giriş yapın. |
| `girisBeklemeDk` | 5 | Giriş için en fazla kaç dakika beklenir. |
| `adimZamanAsimiSn` / `sirketZamanAsimiSn` | 30 / 150 | Tek bir adım / bir şirketin tamamı için süre sınırı. |

## Bilmeniz gerekenler

- **Sözleşme:** Bazı sigorta şirketlerinin acente portal kullanım koşulları otomasyonu kısıtlayabilir. Bu araç sizin oturumunuzu, sizin bilgisayarınızda, sizin yapacağınız işlemleri yapmak için kullanır; şifre paylaşmaz ve başka acentenin yetkisiyle fiyat çekmez. Yine de anlaşmalı olduğunuz şirketlerin koşullarına bakın.
- **KVKK:** Müşteri bilgileri bilgisayarınızdan çıkmaz. `sonuclar/` klasöründeki ekran görüntüleri kişisel veri içerebilir; düzenli silin.
- **CAPTCHA / ekstra doğrulama:** Bir portal her teklifte resimli doğrulama soruyorsa robot o adımda bekler; o şirket için sekmede elle tamamlamanız gerekir.

## Geliştirici notları

- `sunucu.mjs` yerel arayüz ve API (`/api/teklif`, `/api/olaylar` canlı durum), `motor.mjs` sekme yönetimi + giriş bekleme + fiyat toplama, `kaydet.mjs` Playwright kaydını adaptöre çevirir (şifre satırlarını atar, örnek değerleri `veri.*` yapar), `yardimci.mjs` ortak parçalar.
- Adaptör sözleşmesi: `export const adres` ve `export async function teklifAl(page, veri, arac)` → `{ fiyat, fiyatMetni }`. İsteğe bağlı `export async function girisGerekliMi(page)` (varsayılan: ekranda şifre kutusu var mı).
- Deneme: `npm test` (ekransız Linux'ta `xvfb-run -a npm test`) — iki demo portalda giriş bekleme, oturumun korunması, fiyat okuma, dönüştürücü ve API'yi dener.
- `kaydet.mjs` Playwright'ın kayıt özelliğini kullanır; bu yüzden Playwright sürümü `package.json`'da sabittir.
