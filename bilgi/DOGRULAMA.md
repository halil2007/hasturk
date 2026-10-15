# Ak Bilgi – doz ve kullanım bilgisi doğrulama raporu

Güncelleme: 15 Ekim 2026 · Kapsam: en çok satan bitki ürünlerinden ilk 13 ürün (`bilgi/urunler.json`)

## Yöntem
1. Kaynak: ikas ürün açıklaması + HasTürk kullanım tabloları (Ürün Bul rehberleri).
2. Bağımsız kontrol: ziraat fakültesi yayınları/ders notları, akademik denemeler, üretici teknik verileri.
3. HasTürk markalı ürünlerde üretici tablosu esastır; ürün sayfası ile tablo arasında iç tutarlılık kontrol edildi.
4. Kural: çelişen ya da kaynağı olmayan doz **müşteriye verilmez**. Ak Bilgi rakam üretmez, yalnızca bu tablodaki değeri aktarır.

## Sonuç

| Ürün | Durum | Not |
|---|---|---|
| HasTürk Solucan Gübresi (katı) | ✅ Üretici tablosu | 146 bitki; saksı 100-125 g, harç %40-50, çim 100-125 kg/da |
| HasTürk Sıvı Solucan Gübresi | ✅ Üretici + tutarlı | Yapraktan 1 L suya 10-20 ml; sulama 10 L suya 50-100 ml; akademik aralıkla uyumlu |
| HasTürk Hümix Sıvı Hümik Asit | ⚠️ Kısmi | Bahçe/tarla/ağaç dozları var; **saksı/ev bitkisi dozu yok** |
| Leonardit | ❌ Çelişki | Saksı %10-20 doğrulandı. **Bahçe "1 kg/m²" (=1.000 kg/da) kaynaklarda 50-250 kg/da** — sayfanın düzeltilmesi gerekiyor |
| HG Tarım Perliti | ✅ Doğrulandı | Karışıma %20-30 |
| HG Vermikülit | ✅ Doğrulandı | Karışıma %10-30; tohum üstü örtü |
| Sıkıştırılmış Kokopit 5 kg | ✅ Doğrulandı | 20-25 L su → 60-65 L (üreticilerde 65-75 L) |
| Kullanıma Hazır Cocopeat | ✅ Doğrulandı | Doğrudan kullanım |
| HG Asidik Torf | ⚠️ Kısmi | %40-50 bahçe, %45 saksı; pH 4,0-5,5 |
| Yaban Mersini ve Ortanca Toprağı | ⛔ Eksik | Sayfada kullanım bilgisi yok |
| Premium Fide Toprağı | ✅ Doğrulandı | Ekim talimatı |
| HG Mezar Toprağı | ✅ Doğrulandı | 5-10 cm katman |
| DSV Lippa Lisuna 6 Mix | ✅ Doğrulandı | Makineyle 50-60 g/m² (araştırmayla uyumlu); elle serpme 80-90 g/m² (Lippa Tamu sayfasıyla tutarlı) |

## Karar gerekenler (HasTürk)
1. **Leonardit bahçe dozu:** ürün sayfasındaki "metrekareye 1 litre/kg" yüksek. Öneri: tarla/bahçe için 100-200 kg/dekar (metrekareye 100-200 g). Sayfa düzeltilince kart güncellenir.
2. **Hümix saksı dozu:** üretici olarak ev/saksı bitkileri için sulama suyuna oranı belirlenmeli (ör. "1 litre suya … ml, … günde bir").
3. **Yaban Mersini ve Ortanca Toprağı:** kullanım şekli (doğrudan dolgu mu, karışım oranı) yazılmalı.
4. ~~**DSV Lippa Lisuna:**~~ Çözüldü: elle serpme miktarı makineli ekimden yüksek olur; iki değer de doğru.

---

## Gübreler (devam ediyor) – 15 Ekim 2026

32 ürünün kartı hazır (13 ilk grup + 19 gübre). Kalan gübreler: setler (içindeki ürünlerin kartları kullanılır), Chrysamed ve Florist koruyucu spreyler (ilaç/koruma kuralıyla ayrıca ele alınacak).

| Ürün | Durum | Not |
|---|---|---|
| ICL Landscaper Pro 20-20-8 | ✅ Doğrulandı | 35 g/m² (ICL ürün rehberi), en fazla 45 g/m² |
| Sıvı Solucan Gübresi 1 Ton | ✅ Üretici | 100 L suya 1-2 L; ana ürünle aynı oran |
| Katı Solucan Gübresi 20 kg / 1 Ton | ✅ Üretici | HasTürk tablosu |
| **TurfMaster 16-6-25** | ❌ Çelişki | Sayfada "20-35 g/m²" ve "20 kg ≈ 400 m²" (=50 g/m²) birlikte yazıyor |
| Florist konsantre besinler (5 ürün) | ⚠️ Kısmi | 20 ml şase + 1 L su; kullanım sıklığı teyit edilemedi |
| Tarm / Biosas hazır spreyler (5 ürün) | ⚠️ Kısmi | Seyreltmeden kullanılır; sıklık yok |
| Guanokalong toz / sıvı, Biochar, Tarm GrassMaster | ⛔ Eksik | Sayfada doz yok |

### Karar gerekenler (eklenenler)
5. **TurfMaster 16-6-25:** doğru doz ve kapsama alanı etiketten teyit edilmeli.
6. **Guanokalong, Biochar, Tarm GrassMaster, Florist besinler:** etiket fotoğrafı (kullanım talimatı kısmı).

## Tohumlar (ekim bilgisi) — bilgi/tohumlar.json

20 sebze türü için ekim zamanı, yöntem, derinlik, mesafe, çimlenme, 1 g'daki tohum sayısı ve saklama ömrü; 61 tohum ürünü türüyle eşleşti (26'sında paketteki tohum sayısı hesaplandı). Kaynak metinleri `docs/kaynak/` altında.

| Kaynak | Tür |
|---|---|
| TİGEM – Mirasımız Yerel Tohum | Resmi kurum: dikim tarihleri (25 Nisan–15 Mayıs), roka/tere/dereotu/fasulye/lahana dönemleri |
| Atalık Tohumlar Yetiştirici Rehberi (Dr. G. Beşirli, Dr. A. Karagöz) | Araştırma enstitüsü uzmanları: tür tür yetiştirme, çimlenme, saklama |
| Ankara Üniv. Ziraat Fak. ders notu | Akademik çizelge: derinlik, mesafe, toprak sıcaklığı |
| Ankara BB kurs notu, Tarım Kütüphanesi | Destekleyici |

**Kaynaklar çeliştiği için kullanılmayan değerler:**
- Turp ekim derinliği: Ankara Üniv. çizelgesinde 0,2 cm (diğerleri 1,3–2,5 cm; dizgi hatası olmalı) → 1,5–2 cm verildi.
- Kavun ekim derinliği: Ankara Üniv. çizelgesinde 0,4 cm (diğerleri 2,5–5 cm) → kavun tohumu satılmadığı için eklenmedi.
- Havuç: Ankara BB 2,5–3 cm diyor; üniversite 0,5 cm, Yalova uzmanları 1–1,5 cm → 1–1,5 cm verildi (tohum iriliği kuralıyla uyumlu).
- Fasulye/bezelye paket tohum sayısı: tohum iriliği çeşide göre çok değiştiği için verilmez.

**Doğrulanmış özel veri bulunamayanlar** (çiçekler, aromatik otlar, mısır, semizotu, enginar, kuşkonmaz, çilek, kudret narı): cevapta ürün sayfası bilgisi + genel derinlik kuralı verilir.

**Ürün açıklamalarında yazım hatası:** Birçok ürün sayfasında kelimeler bitişik yazılmış (ör. "taze tüketim" → "tazetüketim", "üstün kaliteli" → "üstünkaliteli", "Aromatik ve" → "Aromatikve", "direkt tohumdan" → "direktohumdan"). Ak Bilge bu metni aynen aktarır; ikas'ta düzeltilmesi önerilir.

## Saksılar — bilgi/saksilar.json

39 saksı ürünü, 69 boy. Litre üreticiden; yoksa ölçülerden hesap (konik saksıda 0,72 × silindir; Line, Kozalak, Cornet 85 L, Çeşme 130 L üretici litreleriyle %5 içinde). Kurallar Colorado State, Clemson, NC State, Illinois, UConn, UC Master Gardeners yayınlarından. "Dibe çakıl" konusu kaynaklarda tartışmalı olduğu için öyle anlatılır.

## Bitki sorunları — bilgi/sorunlar.json

31 belirti (yaprak sararması, damar arası sararma, uç kuruması, solma, yaprak/tomurcuk dökümü, çiçek açmama, kök çürümesi, toprak sinekçiği, yaprak biti, unlu/kabuklu bit, kırmızı örümcek, beyaz sinek, külleme, fide devrilmesi ve boylanması, salyangoz, saksı darlığı, toprakta küf/tuz, güneş yanığı; orkide, limon/narenciye, domates/biber, kaktüs/sukulent, monstera, benjamin, ortanca). Kaynaklar: UC IPM (Houseplant Problems), Illinois Extension, Iowa State (orkide, çiçek burnu çürüklüğü), Clemson HGIC (çiçeklenme), Oregon State / Wisconsin / Maryland (sinekçik), UC Master Gardeners / UConn (bit, akar), Maryland (bitkisel yağ uyarısı), RHS + UC MG (narenciye), Nevada / Illinois / UF / MSU / UGA (domates), Utah State (salyangoz), Missouri BG (beyaz sinek), NC State (fide), Colorado State (kloroz).

Kurallar: kesin teşhis yok ("olası nedenler"), ilaç dozu yok (etikete göre), ev/halk sağlığı böcek ilaçları (Chrysamed insektisit, Mite-Ex, Sinpest) bitkiye önerilmez. Ürün faydası yalnız ürün açıklamasında yazanla sınırlı: Tarm neem spreyi (yaprak biti, unlu bit, kabuklu bit, beyaz sinek), Florist sinek ve unlu bit spreyi (unlu bit, toprak sineklenmesi), Florist mantar önleyici ve Subon Hijyen (külleme). Kırmızı örümcek için etiketinde akar yazan bitki ürünü yok; müşteri hizmetlerine yönlendirilir. Salyangoz için ürün yok; elle toplama ve tuzak anlatılır.
