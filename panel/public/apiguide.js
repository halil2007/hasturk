// Stok API kullanım kılavuzu (firmaya / bayiye gönderilen metin): Firmalar → Dış API ve Ayarlar → Stok API ortak kullanır.
export const apiBase = () => location.origin + '/api/v1';
export const apiGuide = (store, key = '<API_ANAHTARI>') => `Hastürk — Stok API (${store})

Ne işe yarar: ${store} ürünlerinin güncel stoğunu kendi sisteminize (sitenize) çekersiniz; stokta olmayan ürünü
satmazsınız. Sitenizde bir ürün satıldığında satışı bildirirsiniz: ${store} stoğu hemen düşer ve tüm satış kanallarına
gider. Siparişlerinizi (kargo, fatura) kendi sisteminizde yönetirsiniz; buraya sipariş gönderilmez, yalnız satılan adet.

Adres:   ${apiBase()}/stock
Yöntem:  GET (stok okuma)
Başlık:  Authorization: Bearer ${key}

Örnek:
curl -H "Authorization: Bearer ${key}" "${apiBase()}/stock?page=1&limit=1000"

Parametreler (isteğe bağlı):
  page, limit            sayfalama (limit en fazla 1000; varsayılan 500)
  updated_since          yalnız bu zamandan sonra değişenler (ISO tarih ya da milisaniye) — düzenli çekimde kullanın
  sku / barcode          tek ürün
  include_inactive=1     tam listede pasif ürünler de gelsin

Yanıt:
{ "store": {...}, "page": 1, "limit": 1000, "total": 1250, "has_more": true,
  "generated_at": "2026-10-16T09:12:00.000Z", "next_since": "2026-10-16T09:10:00.000Z",
  "items": [ { "id": 12, "sku": "OM-TS-XL", "barcode": "869...", "name": "...", "variant": "XL", "brand": "...",
               "stock": 20, "price": 189.9, "vat": 20, "active": true, "updated_at": "2026-10-16T09:05:00.000Z" } ],
  "deleted": [ { "id": 40, "sku": "ESKI-1", "barcode": "869...", "stock": 0, "deleted_at": "..." } ] }

Kurallar (yanlış ürün satmamak için):
  - "stock" satılabilir adettir. 0 ise o ürünü satışa kapatın.
  - "active": false gelen ürün satıştan kaldırılmıştır (stock 0 gelir); satışa kapatın.
  - "deleted" listesindeki ürünler silinmiştir; sitenizde satışa kapatın. (Yalnız updated_since ile çekimde, ilk sayfada gelir.)
  - Ürünü kendi sisteminizde sku (stok kodu) ya da barcode ile eşleştirin.

Önerilen kullanım:
  1. İlk kurulumda tüm sayfaları çekin (has_more false olana kadar).
  2. Sonra 5 dakikada bir yalnız değişenleri çekin: updated_since = bir önceki çekimin ilk sayfasındaki "next_since".
     (Tüm sayfaları has_more false olana kadar alın.)
  3. Günde bir kez tam listeyi yeniden çekip karşılaştırmanız önerilir.

Satış bildirimi (sitenizde satılınca stok düşsün):
  İzin: anahtar varsayılan olarak yalnız stok okur. Satış bildirmek (ve iptal etmek) için ${store} yetkilisinin bu anahtara
  "satış bildirebilsin" iznini açması gerekir; izin yoksa POST istekleri 403 (code "readonly") alır.
  POST ${apiBase()}/sales        Content-Type: application/json
  { "ref": "WEB-1001", "items": [ { "sku": "OM-TS-XL", "quantity": 2 }, { "id": 12, "quantity": 1 } ] }
  - ref: sizin sipariş numaranız. Aynı ref tekrar gelirse stok ikinci kez düşmez (ağ hatasında güvenle yeniden gönderin).
  - Ürün sku, barcode ya da stok listesindeki id ile verilir. Ürünlerden biri bulunamazsa hiçbir stok düşmez (422).
  - Bir istekte en fazla 100 kalem; bir anahtarla son 24 saatte en fazla 5.000 adet (aşılırsa 429, code "daily_limit").
  - Satış ya tamamen işlenir ya hiç: reddedilen satışta hiçbir ürünün stoğu düşmez. Ret durumları (409):
      insufficient_stock  istenen adet mevcut stoktan fazla (yanıttaki "items": ürün, requested, available). Stoğu yenileyin.
      stock_sync_off      ${store} panelinde stok senkronu kapalı ve ürünün stoğu siteden okunuyor; satış stoğa işlenemez.
                          Senkron açılınca aynı numarayla yeniden gönderin (iptal de aynı nedenle reddedilebilir).
      cancelled           bu numara iptal edildi; yeniden satış için yeni numara kullanın.
      conflict            bu numara daha önce farklı ürün / adetle bildirildi.
  - Yanıt 201: { "created": true, "sale": { "ref", "status": "active", "items": [ { "sku", "quantity", "stock" } ] }, "warnings": [] }
  İptal / iade (stok geri gelir):   POST ${apiBase()}/sales/WEB-1001/cancel
  Durum:                            GET  ${apiBase()}/sales/WEB-1001

curl -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\
     -d '{"ref":"WEB-1001","items":[{"sku":"OM-TS-XL","quantity":1}]}' "${apiBase()}/sales"

Bağlantı testi: ${apiBase()}/ping
Sınır: dakikada 120 istek. Hata kodları: 400 hatalı parametre, 401 anahtar geçersiz, 403 erişim kapalı / IP izni yok,
403 satış izni yok (readonly), 404 bulunamadı, 409 satış reddedildi (yetersiz stok, senkron kapalı, iptal edilmiş ya da
farklı ürünlü numara; "code" alanına bakın), 413 gövde 256 KB'tan büyük, 422 ürün bulunamadı, 429 dakika / gün sınırı aşıldı.
Hata yanıtı: { "error": "açıklama", "code": "..." }
Anahtarı kimseyle paylaşmayın; sızdığını düşünürseniz ${store} yetkilisinden yenisini isteyin.`;
