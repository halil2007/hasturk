// Veritabanı (Cloudflare D1 / SQLite). Tablolar ilk istekte kendiliğinden oluşur.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE, barcode TEXT, name TEXT NOT NULL, brand TEXT, category TEXT, description TEXT, image TEXT,
    purchase_price REAL NOT NULL DEFAULT 0, sale_price REAL NOT NULL DEFAULT 0, vat REAL NOT NULL DEFAULT 20, desi REAL NOT NULL DEFAULT 1,
    stock INTEGER NOT NULL DEFAULT 0, critical_stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS products_barcode ON products(barcode)',
  // Kanal ilanı: ikas varyantı / Trendyol barkodu / Hepsiburada SKU'su / PttAVM barkodu → panel ürünü
  `CREATE TABLE IF NOT EXISTS listings (
    channel TEXT NOT NULL, remote_id TEXT NOT NULL, product_id INTEGER, remote_product_id TEXT,
    sku TEXT, barcode TEXT, name TEXT, image TEXT, price REAL, list_price REAL, remote_stock INTEGER,
    pushed_stock INTEGER, price_dirty INTEGER NOT NULL DEFAULT 0, commission REAL, error TEXT, synced_at INTEGER,
    PRIMARY KEY (channel, remote_id))`,
  'CREATE INDEX IF NOT EXISTS listings_product ON listings(product_id)',
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, channel TEXT NOT NULL, remote_id TEXT NOT NULL, order_number TEXT,
    status TEXT NOT NULL, remote_status TEXT, local_status TEXT, ordered_at INTEGER NOT NULL, updated_at INTEGER,
    customer TEXT, phone TEXT, email TEXT, address TEXT, total REAL NOT NULL DEFAULT 0, currency TEXT,
    cargo_company TEXT, tracking TEXT, shipping_cost REAL, note TEXT, extra TEXT, hash TEXT)`,
  'CREATE INDEX IF NOT EXISTS orders_date ON orders(ordered_at)',
  'CREATE INDEX IF NOT EXISTS orders_status ON orders(status, ordered_at)',
  `CREATE TABLE IF NOT EXISTS order_items (
    order_id TEXT NOT NULL, line_id TEXT NOT NULL, product_id INTEGER, sku TEXT, barcode TEXT, name TEXT, image TEXT,
    quantity INTEGER NOT NULL, unit_price REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, status TEXT, remote_key TEXT,
    PRIMARY KEY (order_id, line_id))`,
  'CREATE INDEX IF NOT EXISTS order_items_product ON order_items(product_id)',
  // Paket: siparişin bir kısmı (satır + adet), kendi kargo takip no'su ve etiketiyle
  `CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, no INTEGER NOT NULL, remote_id TEXT,
    items TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', remote_status TEXT, cargo_company TEXT, tracking TEXT, desi REAL,
    created_at INTEGER NOT NULL, shipped_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS packages_order ON packages(order_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS packages_remote ON packages(order_id, remote_id)',
  // Siparişin stoktan düştüğü adet (ürün başına). Senkron her seferinde farkı uygular → çift düşüm olmaz.
  `CREATE TABLE IF NOT EXISTS order_stock (order_id TEXT NOT NULL, product_id INTEGER NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY (order_id, product_id))`,
  `CREATE TABLE IF NOT EXISTS stock_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, delta INTEGER NOT NULL, stock_after INTEGER,
    reason TEXT, ref TEXT, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS stock_moves_product ON stock_moves(product_id, created_at)',
  'CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)',
  `CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, channel TEXT, level TEXT, msg TEXT)`,
  // Panelden girilen kanal API bilgileri (şifreli)
  'CREATE TABLE IF NOT EXISTS channel_config (id TEXT PRIMARY KEY, data TEXT, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER)',
  // Panel kullanıcıları (şifre PBKDF2 ile özetlenir)
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT, email TEXT, pass TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER, last_login INTEGER)`,
  // Sipariş olayları: panelden yapılan işlemler (kaynak = panel) ve kanalda algılanan durum değişiklikleri (kaynak = kanal)
  `CREATE TABLE IF NOT EXISTS order_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, at INTEGER NOT NULL, source TEXT NOT NULL,
    action TEXT, status TEXT, remote_status TEXT, note TEXT, user TEXT)`,
  'CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id, at)',
  // Buybox (Trendyol / Hepsiburada): ilanın son buybox durumu, geçmişi, otomatik fiyat kuralı ve fiyat değişiklikleri
  `CREATE TABLE IF NOT EXISTS buybox (channel TEXT NOT NULL, remote_id TEXT NOT NULL, rank INTEGER, buybox_price REAL, second_price REAL, third_price REAL,
    multi INTEGER, our_price REAL, prev_rank INTEGER, checked_at INTEGER, error TEXT, PRIMARY KEY (channel, remote_id))`,
  `CREATE TABLE IF NOT EXISTS buybox_history (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, remote_id TEXT NOT NULL, at INTEGER NOT NULL,
    rank INTEGER, our_price REAL, buybox_price REAL, second_price REAL, event TEXT)`,
  'CREATE INDEX IF NOT EXISTS buybox_history_l ON buybox_history(channel, remote_id, at)',
  `CREATE TABLE IF NOT EXISTS price_rules (channel TEXT NOT NULL, remote_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, min_price REAL, max_price REAL,
    target_price REAL, step REAL NOT NULL DEFAULT 5, updated_at INTEGER, user TEXT, PRIMARY KEY (channel, remote_id))`,
  `CREATE TABLE IF NOT EXISTS price_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, remote_id TEXT NOT NULL, at INTEGER NOT NULL,
    old_price REAL, new_price REAL, competitor_price REAL, reason TEXT, rank_before INTEGER, rank_after INTEGER, ok INTEGER, error TEXT)`,
  'CREATE INDEX IF NOT EXISTS price_changes_l ON price_changes(channel, remote_id, at)',
  // Müşteri soruları (pazaryerlerinden): soru, ürün, durum ve cevap. answered_by: panel | kanal
  // Yeni sipariş e-posta kuyruğu: sipariş başına tek kayıt (aynı sipariş için ikinci e-posta gitmez)
  `CREATE TABLE IF NOT EXISTS mail_queue (order_id TEXT PRIMARY KEY, channel TEXT, created_at INTEGER NOT NULL, sent_at INTEGER, tries INTEGER NOT NULL DEFAULT 0, error TEXT)`,
  `CREATE TABLE IF NOT EXISTS questions (channel TEXT NOT NULL, remote_id TEXT NOT NULL, text TEXT, asked_at INTEGER, status TEXT NOT NULL DEFAULT 'waiting', remote_status TEXT,
    product_name TEXT, product_image TEXT, product_url TEXT, barcode TEXT, sku TEXT, customer TEXT, answer TEXT, answered_at INTEGER, answered_by TEXT, user TEXT,
    due_at INTEGER, error TEXT, synced_at INTEGER, PRIMARY KEY (channel, remote_id))`,
  'CREATE INDEX IF NOT EXISTS questions_status ON questions(status, asked_at)',
  // Bildirimler: senkron hataları, stok uyarıları; aynı konu (key) tek kayıtta güncellenir
  `CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, level TEXT NOT NULL, channel TEXT, title TEXT NOT NULL, msg TEXT,
    count INTEGER NOT NULL DEFAULT 1, first_at INTEGER, last_at INTEGER, read INTEGER NOT NULL DEFAULT 0, resolved_at INTEGER)`,
  // Kategori eşleştirme: panel (ikas) kategorisi → pazaryeri kategorisi + sabit özellik değerleri (JSON)
  `CREATE TABLE IF NOT EXISTS category_map (local TEXT NOT NULL, channel TEXT NOT NULL, remote_id TEXT NOT NULL, remote_name TEXT, attrs TEXT,
    updated_at INTEGER, user TEXT, PRIMARY KEY (local, channel))`,
  // Pazaryerine ürün gönderimleri: kanalın verdiği takip kimliği (HB trackingId / Trendyol batchRequestId) ve sonuç
  `CREATE TABLE IF NOT EXISTS product_uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, ref TEXT, status TEXT NOT NULL,
    items TEXT, result TEXT, error TEXT, user TEXT, created_at INTEGER NOT NULL, checked_at INTEGER)`,
  // Geçmiş sipariş aktarımı (kanal başına, parça parça ilerler)
  `CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, channel TEXT NOT NULL, from_ms INTEGER NOT NULL, to_ms INTEGER NOT NULL, cursor_ms INTEGER NOT NULL,
    status TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER, updated_at INTEGER)`,
];
// Sonradan eklenen sütunlar (mevcut veritabanlarına eklenir; zaten varsa hata yok sayılır)
const MIGRATIONS = [
  'ALTER TABLE packages ADD COLUMN barcode TEXT',
  'ALTER TABLE packages ADD COLUMN label_format TEXT',
  'ALTER TABLE packages ADD COLUMN label_data TEXT',
  'ALTER TABLE packages ADD COLUMN label_at INTEGER',
  'ALTER TABLE orders ADD COLUMN hash TEXT',
  // Ürün grubu / varyant (ikas'ta tek üründe varyant, Trendyol'da ayrı ürün olabilir: eşleştirme varyant = SKU düzeyinde)
  'ALTER TABLE products ADD COLUMN group_name TEXT',
  'ALTER TABLE products ADD COLUMN variant_name TEXT',
  'ALTER TABLE listings ADD COLUMN group_name TEXT',
  'ALTER TABLE listings ADD COLUMN variant_name TEXT',
  // Eşleşme şekli: barcode | sku | manual | new (yeni ürün olarak açıldı); ignored = eşleştirme listesinde gösterme
  'ALTER TABLE listings ADD COLUMN match TEXT',
  'ALTER TABLE listings ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0',
  // Kanala özel stok: shared (ortak stok) | limit (ortak stok, en fazla N) | own (bu kanala ayrılmış N adet)
  "ALTER TABLE listings ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'shared'",
  'ALTER TABLE listings ADD COLUMN stock_value INTEGER',
  'ALTER TABLE stock_moves ADD COLUMN user TEXT',
  // Kargo akışı: paketleme zamanı, kanaldan gelen hata, etiketin görüntülenme / yazdırılma durumu (paket başına), seçilen kargo
  'ALTER TABLE packages ADD COLUMN packed_at INTEGER',
  'ALTER TABLE packages ADD COLUMN error TEXT',
  'ALTER TABLE packages ADD COLUMN cargo_code TEXT',
  // Paketlemeden önce seçilen kargo firması (JSON {id, name}); paket kanalda oluşunca uygulanır
  'ALTER TABLE orders ADD COLUMN cargo_pick TEXT',
  'ALTER TABLE packages ADD COLUMN cargo_applied TEXT',
  'ALTER TABLE packages ADD COLUMN label_viewed_at INTEGER',
  'ALTER TABLE packages ADD COLUMN label_printed_at INTEGER',
  'ALTER TABLE packages ADD COLUMN label_prints INTEGER NOT NULL DEFAULT 0',
  // Kanalın son kargoya teslim tarihi ve kanal tarafında yapılan son işlem (panel dışından)
  'ALTER TABLE orders ADD COLUMN ship_by INTEGER',
  'ALTER TABLE orders ADD COLUMN ext_action TEXT',
  // Gönderinin yapıldığı kargo anlaşması: ikas | trendyol | hepsiburada | pttavm | n11 | idefix | pazarama | own (kendi anlaşmanız)
  'ALTER TABLE packages ADD COLUMN agreement TEXT',
  // Kanaldan gelen marka ve ürün açıklaması (panel ürününde boşsa buradan doldurulur)
  'ALTER TABLE listings ADD COLUMN brand TEXT',
  'ALTER TABLE listings ADD COLUMN description TEXT',
  // Kanalın verdiği resmi kargo takip bağlantısı (yoksa panel kargo firmasının takip sayfasını kullanır)
  'ALTER TABLE packages ADD COLUMN tracking_url TEXT',
  // Ana ürün kimliği (ana katalog kanalındaki ürün id'si): varyant gruplaması
  'ALTER TABLE products ADD COLUMN parent_key TEXT',
  // Kanalın siparişte bildirdiği gerçek komisyon (TL); yoksa tahmini oran kullanılır. İlanın oranı API'den gelirse kaynağı 'api'
  'ALTER TABLE order_items ADD COLUMN commission REAL',
  'ALTER TABLE listings ADD COLUMN commission_src TEXT',
  // Kategori (ikas kategori yolu) → ürün kategorisi; kategori eşleştirme ve ürün yüklemede kullanılır
  'ALTER TABLE listings ADD COLUMN category TEXT',
  'CREATE INDEX IF NOT EXISTS listings_open ON listings(product_id, ignored)',
  // Müşteri anahtarı (bkz. customers.js): tekrar eden sipariş ve müşteri analizi
  'ALTER TABLE orders ADD COLUMN ckey TEXT',
  // Kargo gideri kaynağı: api (kanalın kargo faturasından) | manual (elle girildi)
  'ALTER TABLE orders ADD COLUMN shipping_src TEXT',
  'CREATE INDEX IF NOT EXISTS orders_ckey ON orders(ckey, ordered_at)',
  // Hız: kanal filtreli sipariş listeleri / raporlar ve kategori bazlı ürün sorguları (eşleştirme, ürün yükleme)
  // Müşteri panelleri kaydı (yalnız ana panelde kullanılır; müşteri verisi her firmanın kendi Durable Object'indedir)
  `CREATE TABLE IF NOT EXISTS tenants (slug TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, note TEXT, active INTEGER NOT NULL DEFAULT 1,
    admin_username TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)`,
  // Pazaryerlerinin kestiği faturalar / kesintiler (komisyon, kargo, hizmet bedeli, reklam, stopaj, ceza ...)
  `CREATE TABLE IF NOT EXISTS invoices (channel TEXT NOT NULL, remote_id TEXT NOT NULL, no TEXT, date INTEGER NOT NULL, type TEXT NOT NULL, description TEXT,
    amount REAL NOT NULL DEFAULT 0, order_number TEXT, url TEXT, synced_at INTEGER, PRIMARY KEY (channel, remote_id))`,
  'CREATE INDEX IF NOT EXISTS invoices_date ON invoices(date)',
  // Hakediş kayıtları (pazaryeri hesap ekstresi: satış, iade, indirim, komisyon …; ödeme / vade tarihi)
  `CREATE TABLE IF NOT EXISTS settlements (channel TEXT NOT NULL, remote_id TEXT NOT NULL, date INTEGER, type TEXT, order_number TEXT, amount REAL NOT NULL DEFAULT 0, commission REAL,
    payment_date INTEGER, due_date INTEGER, paid INTEGER NOT NULL DEFAULT 0, payment_id TEXT, synced_at INTEGER, PRIMARY KEY (channel, remote_id))`,
  'CREATE INDEX IF NOT EXISTS settlements_due ON settlements(due_date)',
  'CREATE INDEX IF NOT EXISTS settlements_order ON settlements(channel, order_number)',
  // İade talepleri (bkz. claims.js)
  `CREATE TABLE IF NOT EXISTS claims (channel TEXT NOT NULL, remote_id TEXT NOT NULL, order_number TEXT, order_id TEXT, claimed_at INTEGER NOT NULL, status TEXT NOT NULL,
    remote_status TEXT, customer TEXT, reason TEXT, note TEXT, lines TEXT, amount REAL, cargo TEXT, tracking TEXT, synced_at INTEGER, decided_at INTEGER, decided_by TEXT,
    decision_note TEXT, error TEXT, PRIMARY KEY (channel, remote_id))`,
  'CREATE INDEX IF NOT EXISTS claims_status ON claims(status, claimed_at)',
  // Döviz bazlı fiyat (bkz. fx.js): para birimi (USD / EUR / GBP; boşsa TL), döviz fiyatı ve ürüne özel kâr payı %
  'ALTER TABLE products ADD COLUMN currency TEXT',
  'ALTER TABLE products ADD COLUMN fx_price REAL',
  'ALTER TABLE products ADD COLUMN fx_margin REAL',
  // Personel yetkileri (JSON bölüm listesi; boşsa tüm bölümler) — bkz. public/perms.js
  'ALTER TABLE users ADD COLUMN perms TEXT',
  // Ürün görselleri: yalnız bağlantılar (JSON dizi; dosya saklanmaz, görseller kanalın CDN'inden açılır).
  // images_manual = 1: panelde elle düzenlendi (senkron üzerine yazmaz)
  'ALTER TABLE products ADD COLUMN images TEXT',
  'ALTER TABLE products ADD COLUMN images_manual INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE listings ADD COLUMN images TEXT',
  // Anlık bildirim (Web Push) abonelikleri: cihaz başına bir satır (bkz. push.js)
  'CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER, ua TEXT, created_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS orders_channel ON orders(channel, ordered_at)',
  'CREATE INDEX IF NOT EXISTS products_category ON products(category)',
  // Personel: telefon, görev, not, rol şablonu, oturum sürümü (oturumları kapat), son giriş IP'si
  'ALTER TABLE users ADD COLUMN phone TEXT',
  'ALTER TABLE users ADD COLUMN title TEXT',
  'ALTER TABLE users ADD COLUMN note TEXT',
  'ALTER TABLE users ADD COLUMN template TEXT',
  'ALTER TABLE users ADD COLUMN sess INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN last_ip TEXT',
  // İki adımlı doğrulama (TOTP) ayarı: JSON (bkz. totp.js, auth.js)
  'ALTER TABLE users ADD COLUMN totp TEXT',
  'CREATE INDEX IF NOT EXISTS order_events_user ON order_events(user, at)',
  // Firmalar (müşteri panelleri): ünvan, vergi, yetkili, adres, paket, ücret, dönem, abonelik başlangıç / bitiş, kullanıcı sınırı, kullanım özeti
  'ALTER TABLE tenants ADD COLUMN legal TEXT',
  'ALTER TABLE tenants ADD COLUMN tax TEXT',
  'ALTER TABLE tenants ADD COLUMN contact TEXT',
  'ALTER TABLE tenants ADD COLUMN address TEXT',
  'ALTER TABLE tenants ADD COLUMN city TEXT',
  'ALTER TABLE tenants ADD COLUMN plan TEXT',
  'ALTER TABLE tenants ADD COLUMN fee REAL',
  "ALTER TABLE tenants ADD COLUMN period TEXT NOT NULL DEFAULT 'monthly'",
  'ALTER TABLE tenants ADD COLUMN starts_at INTEGER',
  'ALTER TABLE tenants ADD COLUMN expires_at INTEGER',
  'ALTER TABLE tenants ADD COLUMN trial INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE tenants ADD COLUMN max_users INTEGER',
  'ALTER TABLE tenants ADD COLUMN usage TEXT',
  'ALTER TABLE tenants ADD COLUMN usage_at INTEGER',
  // Dış API (stok aktarımı) yetkisi: JSON (açık mı, anahtar özeti, IP kısıtı, kullanım) — bkz. extapi.js
  'ALTER TABLE tenants ADD COLUMN api TEXT',
  // Online paket satışı (iyzico, bkz. billing.js): sipariş, ödeme sonucu ve oluşturulan / uzatılan firma
  `CREATE TABLE IF NOT EXISTS sales_orders (id TEXT PRIMARY KEY, kind TEXT NOT NULL, slug TEXT, plan TEXT NOT NULL, period TEXT NOT NULL, amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', buyer TEXT, username TEXT, pass_hash TEXT, token TEXT, payment_id TEXT, installment INTEGER, error TEXT, origin TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS sales_orders_t ON sales_orders(created_at)',
  // Firma kartında elle girilen mağaza sınırı (boşsa paketin sınırı; bkz. plans.js)
  'ALTER TABLE tenants ADD COLUMN max_stores INTEGER',
  // Stok düşümü bekleyen sipariş (bkz. sync.js applyStock): kanaldan gelen değişiklik, sonradan kurulan / kaldırılan eşleşme.
  // Düşüm yapılınca 0 olur; senkron yarıda kesilse bile bir sonraki senkronda tamamlanır.
  'ALTER TABLE orders ADD COLUMN stock_dirty INTEGER NOT NULL DEFAULT 0',
  'CREATE INDEX IF NOT EXISTS orders_stock_dirty ON orders(stock_dirty) WHERE stock_dirty = 1',
  // Kabul edilmiş iade talebiyle iade edilen adet (bkz. claims.js applyClaimReturns); "iadede stoğa ekle" açıksa stoğa döner
  'ALTER TABLE order_items ADD COLUMN returned_qty INTEGER NOT NULL DEFAULT 0',
  // Gönderilen stok / fiyatın kanal tarafındaki sonucu (Trendyol toplu işlem, Hepsiburada yükleme): reddedilen satırlar ilana hata olarak yazılır
  `CREATE TABLE IF NOT EXISTS push_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL, at INTEGER NOT NULL,
    n INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', failed INTEGER NOT NULL DEFAULT 0, checked_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS push_checks_p ON push_checks(status, at)',
  // Firma tahsilatları (ödeme kaydı; aboneliği uzatır)
  `CREATE TABLE IF NOT EXISTS tenant_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, at INTEGER NOT NULL, amount REAL NOT NULL,
    months INTEGER NOT NULL DEFAULT 0, method TEXT, note TEXT, user TEXT)`,
  'CREATE INDEX IF NOT EXISTS tenant_payments_slug ON tenant_payments(slug, at)',
  // Destek talepleri (bkz. support.js): ana panelin veritabanında; slug = talebi açan firma ('' = ana panel)
  `CREATE TABLE IF NOT EXISTS support_tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL DEFAULT '', firm TEXT, user_name TEXT, user_id INTEGER, subject TEXT NOT NULL,
    category TEXT, status TEXT NOT NULL DEFAULT 'open', page TEXT, context TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    unread_admin INTEGER NOT NULL DEFAULT 1, unread_user INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS support_slug ON support_tickets(slug, updated_at)',
  'CREATE TABLE IF NOT EXISTS support_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, author TEXT, admin INTEGER NOT NULL DEFAULT 0, body TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS support_messages_t ON support_messages(ticket_id)',
  'CREATE TABLE IF NOT EXISTS support_files (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, message_id INTEGER, name TEXT, type TEXT, size INTEGER, data TEXT, created_at INTEGER)',
  'CREATE INDEX IF NOT EXISTS support_files_t ON support_files(ticket_id)',
  // İşletme giderleri (kâr-zarar): tek seferlik ya da aylık tekrar eden (bkz. finance.js)
  `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT, amount REAL NOT NULL, date INTEGER NOT NULL,
    recurring TEXT, until INTEGER, note TEXT, created_at INTEGER)`,
  // Hata kayıtları (bkz. errors.js): müşteri panellerinden otomatik gelen hatalar, firma + hata başına tek satır
  `CREATE TABLE IF NOT EXISTS error_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, slug TEXT NOT NULL DEFAULT '', firm TEXT, source TEXT NOT NULL,
    message TEXT NOT NULL, action TEXT, page TEXT, status_code INTEGER, detail TEXT, user_name TEXT, count INTEGER NOT NULL DEFAULT 1, first_at INTEGER, last_at INTEGER,
    status TEXT NOT NULL DEFAULT 'open', reopened INTEGER NOT NULL DEFAULT 0, resolved_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS error_reports_last ON error_reports(status, last_at)',
  // Sistem hızı (bkz. perf.js): panel başına günlük istek süreleri, işlem türüne göre
  `CREATE TABLE IF NOT EXISTS perf_stats (day TEXT NOT NULL, slug TEXT NOT NULL DEFAULT '', route TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0,
    max_ms INTEGER NOT NULL DEFAULT 0, slow_n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, slug, route))`,
  // Eski Excel fırsat etiketleri tablosu kaldırıldı (yerine buybox fiyat önerileri, bkz. suggest.js)
  'DROP TABLE IF EXISTS promo_offers',
  // Panelden silinen siparişler (bkz. orderclean.js): kanal aynı siparişi yine gönderse de alınmaz
  'CREATE TABLE IF NOT EXISTS deleted_orders (id TEXT PRIMARY KEY, at INTEGER NOT NULL, user TEXT, order_number TEXT)',
  // Kanalda bulunamayan sipariş: missing_n kaç kontrolde bulunamadı (2 = kesin / uyarı), missing_why sebep; checked_at son tek sipariş kontrolü
  'ALTER TABLE orders ADD COLUMN missing_n INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE orders ADD COLUMN missing_why TEXT',
  'ALTER TABLE orders ADD COLUMN checked_at INTEGER',
  'CREATE INDEX IF NOT EXISTS orders_missing ON orders(missing_n) WHERE missing_n >= 2',
  // Önerilen kategori eşleşmesi (bkz. catalog.js): sistem kendisi eşleştirmez; öneri kullanıcı onaylayınca category_map'e yazılır.
  // rejected: kullanıcının reddettiği pazaryeri kategorileri (JSON dizi) — tekrar önerilmez
  `CREATE TABLE IF NOT EXISTS category_suggest (local TEXT NOT NULL, channel TEXT NOT NULL, remote_id TEXT, remote_name TEXT, path TEXT, score REAL,
    sure INTEGER NOT NULL DEFAULT 0, rejected TEXT, created_at INTEGER, PRIMARY KEY (local, channel))`,
  // Ürünün kargo tutarı (kullanıcı girer): kanal kargo faturası / siparişe elle girilen tutar yoksa sipariş kargo gideri bundan hesaplanır
  'ALTER TABLE products ADD COLUMN ship_cost REAL',
  // Trendyol sipariş saati düzeltmesi (aşağıdaki tek seferlik adım) için şema sürümü değişsin: mevcut veritabanlarında da çalışır
  'CREATE INDEX IF NOT EXISTS orders_channel ON orders(channel, ordered_at)',
  // Online satışta alınan fatura bilgisi (JSON: bireysel / kurumsal, TC / vergi no, adres, e-posta, telefon; bkz. billing.js)
  'ALTER TABLE tenant_payments ADD COLUMN invoice TEXT',
  // Blog (bkz. blog.js): yalnız ana panelde kullanılır. Yazı gövdesi Markdown; tags JSON dizi; durum draft | published
  `CREATE TABLE IF NOT EXISTS blog_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT, body TEXT,
    cover_id TEXT, tags TEXT, status TEXT NOT NULL DEFAULT 'draft', published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    author TEXT, seo_title TEXT, seo_desc TEXT)`,
  'CREATE INDEX IF NOT EXISTS blog_posts_pub ON blog_posts(status, published_at)',
  // Blog görselleri: rastgele kimlik (sırayla tahmin edilemez), base64 içerik (WEBP / JPG / PNG, en fazla ~500 KB)
  `CREATE TABLE IF NOT EXISTS blog_images (id TEXT PRIMARY KEY, post_id INTEGER, name TEXT, type TEXT NOT NULL, size INTEGER, w INTEGER, h INTEGER,
    data TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS blog_images_post ON blog_images(post_id)',
  // Hepsiburada komisyon düzeltmesi (yukarıdaki tek seferlik adım) mevcut veritabanlarında da çalışsın diye şema sürümü değişir
  'CREATE INDEX IF NOT EXISTS order_items_remote ON order_items(remote_key)',
  // Kendiliğinden çözülen hata kaydının nedeni (bkz. errors.js → autoResolve); elle çözülende boş
  'ALTER TABLE error_reports ADD COLUMN auto TEXT',
  // İlk girişte şifre değiştirme zorunlu (online satışla açılan panelin geçici şifresi; bkz. billing.js)
  'ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0',
  // Online satış: ödeme tamamlanana kadar geçici şifre şifrelenmiş saklanır, firma açılınca silinir
  'ALTER TABLE sales_orders ADD COLUMN pass_tmp TEXT',
  // Kargo entegratörüyle (Kargonomi, Navlungo…) oluşturulan gönderi: entegratör, onun gönderi numarası ve ücreti (bkz. carriers.js)
  'ALTER TABLE packages ADD COLUMN carrier_provider TEXT',
  'ALTER TABLE packages ADD COLUMN carrier_ref TEXT',
  'ALTER TABLE packages ADD COLUMN carrier_cost REAL',
  // Kargo firmasından son takip sorgusu: zaman ve durum (created / transit / delivered / returned / cancelled) + firmanın durum metni
  'ALTER TABLE packages ADD COLUMN carrier_checked_at INTEGER',
  'ALTER TABLE packages ADD COLUMN carrier_state TEXT',
  'ALTER TABLE packages ADD COLUMN carrier_status TEXT',
  // Giriş koruması: IP başına hatalı deneme, engel sayısı (her engel bir öncekinden uzun) ve engel bitişi (bkz. guard.js)
  `CREATE TABLE IF NOT EXISTS ip_guard (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, window_at INTEGER, strikes INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER, blocked_hits INTEGER NOT NULL DEFAULT 0, blocks INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
    last_at INTEGER, last_user TEXT, last_kind TEXT)`,
  // İade talebine müşterinin eklediği görseller (kanal veriyorsa; JSON dizi)
  'ALTER TABLE claims ADD COLUMN images TEXT',
  // Ek mağaza satın alma (sales_orders.kind = 'stores'): adet
  'ALTER TABLE sales_orders ADD COLUMN qty INTEGER',
  // İlanın kalem hatası zamanı: kalıcı hatalı ilan bir süre yeniden gönderilmez (bkz. sync.js → ERROR_RETRY_MS)
  'ALTER TABLE listings ADD COLUMN error_at INTEGER',
];

// Şema sürümü: tablo/sütun listesi değişince değişir. Veritabanı güncelse açılışta tek sorgu yapılır
// (her yeni Worker örneğinde onlarca şema sorgusu çalıştırmamak için; sayfa geçişlerini hızlandırır).
const SCHEMA_V = (() => { let h = 0; for (const c of SCHEMA.concat(MIGRATIONS).join('|')) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return 'v' + (h >>> 0).toString(36); })();
const ready = new WeakMap();
export function init(db) {
  if (!ready.has(db)) {
    ready.set(db, (async () => {
      // Yeni yayında yalnız sonradan eklenen geçişler çalışır (MIGRATIONS yalnız sona eklenir): tümünü sırayla çalıştırmak
      // büyük veritabanında açılışı saniyelerce bekletiyordu. Kayıt yoksa ya da liste beklenmedik biçimde değiştiyse hepsi çalışır.
      let done = -1;
      try {
        const r = await db.prepare("SELECT k, v FROM settings WHERE k IN ('schema_v', 'schema_n')").all();
        const m = Object.fromEntries((r.results || []).map((x) => [x.k, JSON.parse(x.v)]));
        if (m.schema_v === SCHEMA_V) return;
        if (Number.isInteger(m.schema_n) && m.schema_n < MIGRATIONS.length) done = m.schema_n;
      } catch { /* ilk kurulum */ }
      await db.batch(SCHEMA.map((s) => db.prepare(s)));
      for (const m of done >= 0 ? MIGRATIONS.slice(done) : MIGRATIONS) { try { await db.prepare(m).run(); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; } }
      // Tek seferlik: sistem tamamen hazır olana kadar kanallara stok gönderimi kapatılır (stoklar ikas sitesinden okunur).
      // Sonradan Ayarlar → Stok'tan açılabilir; bu adım bir daha çalışmaz.
      if (!(await db.prepare("SELECT 1 AS x FROM settings WHERE k = 'once:stock_off_1'").first())) {
        await db.batch([
          db.prepare("INSERT INTO settings (k, v) VALUES ('stock_sync', 'false') ON CONFLICT (k) DO UPDATE SET v = 'false'"),
          db.prepare("INSERT INTO settings (k, v) VALUES ('once:stock_off_1', '1') ON CONFLICT (k) DO NOTHING"),
        ]);
      }
      // Tek seferlik: ikas mağazalarının "beklemede" kilidi kaldırılır; paketleme / ikas Kargo / etiket panelden yapılır
      if (!(await db.prepare("SELECT 1 AS x FROM settings WHERE k = 'once:unhold_ikas_1'").first())) {
        const h = await db.prepare("SELECT v FROM settings WHERE k = 'hold_channels'").first();
        const list = h ? JSON.parse(h.v).filter((c) => !['ikas1', 'ikas2'].includes(c)) : [];
        await db.batch([
          db.prepare("INSERT INTO settings (k, v) VALUES ('hold_channels', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(list)),
          db.prepare("INSERT INTO settings (k, v) VALUES ('once:unhold_ikas_1', '1') ON CONFLICT (k) DO NOTHING"),
        ]);
      }
      // Tek seferlik: Trendyol sipariş tarihi (orderDate) GMT+3 zaman damgası olarak gelir ve 3 saat ileri kaydediliyordu; kayıtlı Trendyol
      // siparişleri düzeltilir. Güncelleme ve işaret aynı işlemde: aynı anda açılan iki örnek düzeltmeyi iki kez yapamaz.
      await db.batch([
        db.prepare("UPDATE orders SET ordered_at = ordered_at - 10800000 WHERE channel LIKE 'trendyol%' AND ordered_at > 10800000 AND NOT EXISTS (SELECT 1 FROM settings WHERE k = 'once:ty_gmt3_1')"),
        db.prepare("INSERT INTO settings (k, v) VALUES ('once:ty_gmt3_1', '1') ON CONFLICT (k) DO NOTHING"),
      ]);
      // Tek seferlik: Hepsiburada komisyonu adet başı ve KDV hariç kaydediliyordu (2 adetlik 3.000 TL siparişte 612 TL yerine 255 TL);
      // kayıtlı satırlar satır toplamına ve KDV dahil tutara çevrilir, ilanların komisyon oranı son siparişten yeniden hesaplanır.
      await db.batch([
        db.prepare("UPDATE order_items SET commission = ROUND(commission * MAX(quantity, 1) * 1.2, 2) WHERE commission IS NOT NULL AND order_id IN (SELECT id FROM orders WHERE channel LIKE 'hepsiburada%') AND NOT EXISTS (SELECT 1 FROM settings WHERE k = 'once:hb_comm_1')"),
        db.prepare(`UPDATE listings SET commission = (SELECT ROUND(i.commission / i.total * 100, 2) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.channel = listings.channel AND i.remote_key = listings.remote_id AND i.commission IS NOT NULL AND i.total > 0 ORDER BY o.ordered_at DESC LIMIT 1)
          WHERE channel LIKE 'hepsiburada%' AND commission_src = 'api' AND NOT EXISTS (SELECT 1 FROM settings WHERE k = 'once:hb_comm_1')`),
        db.prepare("INSERT INTO settings (k, v) VALUES ('once:hb_comm_1', '1') ON CONFLICT (k) DO NOTHING"),
      ]);
      // Tek seferlik: kanaldan gelen ilan komisyon oranları KDV dahil kaydediliyordu; artık KDV hariç tutulur (hesapta KDV eklenir)
      await db.batch([
        db.prepare("UPDATE listings SET commission = ROUND(commission / 1.2, 2) WHERE commission_src = 'api' AND commission IS NOT NULL AND NOT EXISTS (SELECT 1 FROM settings WHERE k = 'once:comm_net_1')"),
        db.prepare("INSERT INTO settings (k, v) VALUES ('once:comm_net_1', '1') ON CONFLICT (k) DO NOTHING"),
      ]);
      await db.batch([
        db.prepare("INSERT INTO settings (k, v) VALUES ('schema_v', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(SCHEMA_V)),
        db.prepare("INSERT INTO settings (k, v) VALUES ('schema_n', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(MIGRATIONS.length)),
      ]);
    })().catch((e) => { ready.delete(db); throw e; }));
  }
  return ready.get(db);
}

export const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
export const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
export const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
// D1 bir sorguda en fazla 100 değer kabul eder ("too many SQL variables"): uzun kimlik listesi parça parça sorgulanır, sonuçlar
// birleştirilir. build(ph, part) → [sql, argümanlar]; ph = parçanın "?, ?, …" listesi. Parçalar arası sıralama korunmaz.
export async function allIn(db, ids, build, size = 80) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size), [sql, args] = build(part.map(() => '?').join(','), part);
    out.push(...await all(db, sql, ...args));
  }
  return out;
}

// ---------- ayarlar ----------
export const DEFAULT_SETTINGS = {
  // Kanal başına varsayılan komisyon (%) ve sipariş başı kargo gideri (TL); ürün/ilan bazında değiştirilebilir
  // Otomatik fiyatlandırma genel anahtarı (kapalıyken hiçbir fiyat değiştirilmez; yalnızca buybox izlenir)
  autoprice: false,
  // Beklemedeki kanallar: okunur, kanala yazılmaz (ikas: resmi dokümanlar gelene kadar)
  hold_channels: [],
  // Yeni sipariş e-posta bildirimi: açık/kapalı, alıcılar, kanal seçimi (false = o kanaldan e-posta gelmez), panel adresi (e-postadaki bağlantı)
  mail_enabled: false,
  // Günlük özet e-postası (her sabah 08:00'den sonra; alıcılar mail_to)
  daily_digest: false,
  mail_to: [],
  mail_channels: {},
  panel_url: '',
  // Kurulum rehberi kararları (stok gönderimi soruldu mu, rehber gizlendi mi)
  setup: {},
  // Döviz bazlı fiyat ayarları (kaynak, kur türü, güncelleme sıklığı, eşik %, yuvarlama, genel kâr payı %)
  fx: { source: 'tcmb', kind: 'sell', mode: 'daily', threshold: 0.5, rounding: 'none', margin: 0 },
  // Müşteri sorularına hazır cevaplar
  answer_templates: ['Merhaba, ilginiz için teşekkür ederiz. ', 'Merhaba, ürünümüz stoklarımızda mevcuttur; siparişiniz aynı gün kargoya verilir. İyi günler dileriz.'],
  commission: { ikas1: 0, ikas2: 0, trendyol: 20, hepsiburada: 18, pttavm: 12, n11: 15, idefix: 15, pazarama: 15, amazon: 15, ciceksepeti: 20, koctas: 15, shopify: 0, woocommerce: 0, opencart: 0, etsy: 6.5 },
  shipping: { ikas1: 0, ikas2: 0, trendyol: 0, hepsiburada: 0, pttavm: 0 },
  // Komisyon, kargo, hizmet bedeli ve ek kesinti KDV hariç girilir, hesapta %20 KDV eklenir; true: girilen tutarlar zaten KDV dahil
  costs_vat_incl: false,
  // Ödeme/hizmet bedeli gibi sabit kesintiler (sipariş başı TL)
  service_fee: { ikas1: 0, ikas2: 0, trendyol: 0, hepsiburada: 0, pttavm: 0 },
  // Satış tutarının %'si olarak ek kesinti (işlem / ödeme bedeli vb.)
  fee_rate: { ikas1: 0, ikas2: 0, trendyol: 0, hepsiburada: 0, pttavm: 0, n11: 0, idefix: 0, pazarama: 0, amazon: 0, ciceksepeti: 0, koctas: 0, shopify: 0, woocommerce: 0, opencart: 0, etsy: 3 },
  // E-ticaret stopajı %: pazaryeri hakedişten keser (KDV hariç satış üzerinden); kendi siteniz (ikas) için 0
  withholding: { ikas1: 0, ikas2: 0, trendyol: 1, hepsiburada: 1, pttavm: 1, n11: 1, idefix: 1, pazarama: 1, amazon: 1, ciceksepeti: 1, koctas: 1, shopify: 0, woocommerce: 0, opencart: 0, etsy: 0 },
  // Stok senkronu: ilk ürün eşleştirmesi kontrol edildikten sonra açılır
  stock_sync: false,
  // Genel stok senkronu kapalıyken bile stok gönderilecek kanallar (ikas stoğu bu kanallara gider) ve otomatik ürün gönderimi açık kanallar
  stock_push: {},
  auto_upload: {},
  stock_since: 0,           // bu zamandan önceki siparişler stoktan düşmez (ilk kurulumdaki eski siparişler)
  restock_returns: false,   // iade gelen ürün stoğa geri eklensin mi
  history_days: 30,         // ilk senkronda geriye kaç gün sipariş çekilsin (daha eskisi: Entegrasyonlar → Geçmiş siparişler)
  low_stock: 5,             // ürüne özel kritik stok girilmemişse bu adet ve altı "sınırın altında" sayılır
  catalog_channels: ['ikas1'], // eşleşmeyen ilanından otomatik ürün açılan ana katalog kanalları
  company: { title: 'Hastürk', legal: '', phone: '', email: '', address: '', tax: '' },
  sender: { name: '', phone: '', address: '', city: '' },
  // Trendyol/Hepsiburada ZPL etiketini normal yazıcıda basmak için PDF'e çevir (Labelary servisi; etiket içeriği o servise gider)
  zpl_pdf: false,
  // Hepsiburada etiketi bizim tasarımla basılır (barkod / takip no Hepsiburada'dan); kapalıysa Hepsiburada'nın kendi etiketi
  label_own: true,
  // Kendi kargo etiketimizin boyutu: 100x150 (termal) | a5 | a4
  label_size: '100x150',
  // Kargo firması takip sayfaları ({no} = takip numarası). Kanal resmi takip bağlantısı verdiyse o kullanılır.
  track_urls: {
    'Yurtiçi': 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={no}',
    'Aras': 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code={no}',
    'PTT': 'https://gonderitakip.ptt.gov.tr/Track/Verify?q={no}',
    'HepsiJet': 'https://www.hepsijet.com/gonderi-takibi/{no}',
    'Sürat': 'https://suratkargo.com.tr/KargoTakip/?kargotakipno={no}',
    'MNG': 'https://www.mngkargo.com.tr/gonderi-takip/?takipNo={no}',
    'DHL eCommerce': 'https://www.dhlecommerce.com.tr/gonderi-takip?trackingNumber={no}',
    'Kolay Gelsin': 'https://www.kolaygelsin.com/gonderi-takip?trackingNumber={no}',
    'Sendeo': 'https://www.sendeo.com.tr/gonderi-takip?code={no}',
    'Trendyol Express': 'https://kargotakip.trendyolexpress.com/?trackingNumber={no}',
  },
  cargo_companies: ['Yurtiçi Kargo', 'Aras Kargo', 'DHL eCommerce', 'PTT Kargo', 'Sürat Kargo', 'Trendyol Express', 'HepsiJet', 'Kolay Gelsin'],
};

// Logo (base64, yüzlerce KB olabilir) her ayar okumasında taşınmaz: yerine kısa bir sürüm işareti gelir ("logo:uzunluk:son-karakterler").
// Görselin kendisi /api/logo adresinden (tarayıcı önbellekli) sunulur; içeriği gereken yer getLogo() kullanır.
// Giriş deneme sayaçları da ayar değildir, okunmaz.
export async function getSettings(db) {
  const rows = await all(db, `SELECT k, CASE WHEN k = 'logo' AND length(v) > 2 THEN json_quote('logo:' || length(v) || ':' || substr(v, -24, 20)) ELSE v END AS v
    FROM settings WHERE k NOT LIKE 'login_fail:%'`);
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    try {
      const v = JSON.parse(r.v);
      out[r.k] = v && typeof v === 'object' && !Array.isArray(v) && out[r.k] && typeof out[r.k] === 'object' && !Array.isArray(out[r.k]) ? { ...out[r.k], ...v } : v;
    } catch { /* bozuk satır */ }
  }
  // Etiketteki gönderen adı girilmediyse firma adı (müşteri panelinde başka firmanın adı görünmesin)
  if (out.sender && !out.sender.name) out.sender = { ...out.sender, name: (out.company && out.company.title) || '' };
  return out;
}
export const setSetting = (db, k, v) => run(db, 'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v));
export async function getLogo(db) { const r = await first(db, "SELECT v FROM settings WHERE k = 'logo'"); try { return (r && JSON.parse(r.v)) || ''; } catch { return ''; } }
export async function getRaw(db, k) { const r = await first(db, 'SELECT v FROM settings WHERE k = ?', k); return r ? JSON.parse(r.v) : null; }

// Bildirim: aynı key için tek kayıt (tekrar ederse sayaç artar, okunmamış olur). resolve() düzelince kapatır.
export async function notify(db, key, { level = 'error', channel = null, title, msg = '' }) {
  const t = Date.now();
  try {
    await run(db, `INSERT INTO notices (key, level, channel, title, msg, count, first_at, last_at, read, resolved_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, NULL)
      ON CONFLICT (key) DO UPDATE SET level = excluded.level, title = excluded.title, msg = excluded.msg, last_at = excluded.last_at,
        count = CASE WHEN notices.resolved_at IS NULL THEN notices.count + 1 ELSE 1 END, read = 0, resolved_at = NULL,
        first_at = CASE WHEN notices.resolved_at IS NULL THEN notices.first_at ELSE excluded.first_at END`, key, level, channel, title, String(msg).slice(0, 1000), t, t);
  } catch { /* bildirim yazılamazsa işi durdurma */ }
}
export async function resolve(db, key) {
  try { await run(db, 'UPDATE notices SET resolved_at = ? WHERE key = ? AND resolved_at IS NULL', Date.now(), key); } catch { /* yok say */ }
}

export async function log(db, channel, level, msg) {
  try {
    await run(db, 'INSERT INTO logs (at, channel, level, msg) VALUES (?, ?, ?, ?)', Date.now(), channel || null, level, String(msg).slice(0, 1000));
    if (Math.random() < 0.05) await run(db, 'DELETE FROM logs WHERE at < ?', Date.now() - 30 * 864e5);
  } catch { /* günlük yazılamazsa işi durdurma */ }
}
