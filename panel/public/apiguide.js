// Stok API kullanım kılavuzu (firmaya / bayiye gönderilen metin): Firmalar → Dış API ve Ayarlar → Stok API ortak kullanır.
export const apiBase = () => location.origin + '/api/v1';
export const apiGuide = (store, key = '<API_ANAHTARI>') => `Hastürk — Stok API (${store})

Adres:   ${apiBase()}/stock
Yöntem:  GET (yalnız okuma)
Başlık:  Authorization: Bearer ${key}

Örnek:
curl -H "Authorization: Bearer ${key}" "${apiBase()}/stock?page=1&limit=500"

Parametreler (isteğe bağlı):
  page, limit            sayfalama (limit en fazla 1000; varsayılan 500)
  updated_since          yalnız bu tarihten sonra değişenler (ISO tarih ya da milisaniye) — düzenli çekimde önerilir
  sku / barcode          tek ürün
  include_inactive=1     pasif ürünler de gelsin

Yanıt:
{ "store": {...}, "page": 1, "limit": 500, "total": 1250, "has_more": true, "generated_at": "...",
  "items": [ { "id": 12, "sku": "HG-SOL-5", "barcode": "869...", "name": "...", "variant": "5 Kg", "brand": "...",
               "stock": 20, "price": 189.9, "vat": 20, "active": true, "updated_at": "2026-10-06T09:12:00.000Z" } ] }

Önerilen kullanım: ilk seferde tüm sayfaları çekin (has_more false olana kadar), sonra 10-15 dakikada bir
updated_since ile yalnız değişenleri alın.

Bağlantı testi: ${apiBase()}/ping
Sınır: dakikada 120 istek. Hata kodları: 401 anahtar geçersiz, 403 erişim kapalı / IP izni yok, 429 sınır aşıldı.
Anahtarı kimseyle paylaşmayın; sızdığını düşünürseniz Hastürk'ten yenisini isteyin.`;
