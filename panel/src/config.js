// Kanal API bilgileri: panelden (Entegrasyonlar) girilir, veritabanında şifreli (AES-GCM) saklanır.
// Panelde girilen değer, Cloudflare'de tanımlı aynı adlı gizli değişkenin önüne geçer; panelde boşsa Cloudflare'deki kullanılır.
// Şifreleme anahtarı PANEL_SECRET'tan (yoksa panel şifresinden) türetilir; anahtarlar istemciye asla açık gönderilmez.
import { all, first, run } from './db.js';
import { fail } from './util.js';

const ikasFields = (p) => [
  { k: `${p}NAME`, label: 'Panelde görünen ad', hint: 'ör. HasTürk' },
  { k: `${p}STORE`, label: 'Mağaza adı', hint: 'panel adresindeki XXXX.myikas.com → XXXX', req: true },
  { k: `${p}CLIENT_ID`, label: 'Client ID', req: true },
  { k: `${p}CLIENT_SECRET`, label: 'Client Secret', secret: true, req: true },
  { k: `${p}MERCHANT_ID`, label: 'Merchant ID', hint: 'ürün görselleri için (isteğe bağlı)', adv: true },
  { k: `${p}SALES_CHANNEL_ID`, label: 'Satış kanalı ID', hint: 'sadece bu kanalın siparişleri (isteğe bağlı)', adv: true },
  { k: `${p}STOCK_LOCATION_ID`, label: 'Stok lokasyonu', hint: 'ikas\'taki depo adı ya da ID\'si; tek lokasyon varsa boş bırakılabilir, birden çok lokasyonda zorunlu', adv: true },
];

export const FIELDS = {
  ikas1: ikasFields('IKAS1_'),
  ikas2: ikasFields('IKAS2_'),
  trendyol: [
    { k: 'TRENDYOL_SELLER_ID', label: 'Satıcı ID (Cari ID)', req: true, pattern: '^\\d+$', patternMsg: 'Trendyol Satıcı ID yalnızca rakamlardan oluşur' },
    { k: 'TRENDYOL_API_KEY', label: 'API Key', req: true },
    { k: 'TRENDYOL_API_SECRET', label: 'API Secret', secret: true, req: true },
    { k: 'TRENDYOL_INTEGRATOR', label: 'Entegratör adı', adv: true, hint: 'Boşsa "SelfIntegration" gönderilir. Trendyol\'da entegratör firma olarak kayıtlıysanız firma adınız (yalnız harf ve rakam, en fazla 30 karakter); istekler "SatıcıId - FirmaAdı" kimliğiyle gider' },
  ],
  // Yeni sipariş e-posta bildirimi (kanal değil; Ayarlar → Bildirimler'den girilir)
  // ---------- kargo entegratörleri (kanal değil; siparişin kargo etiketi bu firmalar üzerinden alınır: src/carriers.js) ----------
  // Alanlar firmaların API'lerinin istediği bilgiler (src/carriers/<firma>.js)
  kargonomi: [
    { k: 'KARGONOMI_API_KEY', label: 'API anahtarı (token)', secret: true, req: true, hint: 'Kargonomi destek ekibinin verdiği API anahtarı (destek@kargonomi.com.tr)' },
    { k: 'KARGONOMI_WAREHOUSE', label: 'Depo numarası', adv: true, hint: 'Boşsa Kargonomi\'deki ana depo (gönderen adresi) kullanılır' },
    { k: 'KARGONOMI_PROVIDER', label: 'Kargo firması', adv: true, choices: [['', 'Otomatik (en ucuz)'], ['3', 'Kolay Gelsin'], ['4', 'Aras Kargo'], ['5', 'Sürat Kargo'], ['6', 'HepsiJET'], ['7', 'PTT Kargo']] },
  ],
  navlungo: [
    { k: 'NAVLUNGO_USER', label: 'API kullanıcı adı', req: true, hint: 'Navlungo → Entegrasyonlar\'da açılan API kullanıcısı (panel giriş bilgisi değil)' },
    { k: 'NAVLUNGO_PASSWORD', label: 'API şifresi', secret: true, req: true },
    { k: 'NAVLUNGO_ADDRESS_ID', label: 'Gönderici adres numarası', req: true, pattern: '^\\d+$', patternMsg: 'Navlungo adres defterindeki numara (yalnız rakam)', hint: 'Navlungo → Adres Defteri\'ndeki gönderici adresinin numarası' },
    { k: 'NAVLUNGO_CARRIER_ID', label: 'Kargo firması', adv: true, choices: [['', 'Otomatik'], ['9', 'Sürat Kargo'], ['10', 'HepsiJET'], ['11', 'Kolay Gelsin'], ['13', 'Aras Kargo'], ['14', 'PTT Kargo'], ['18', 'Yurtiçi Kargo']] },
    { k: 'NAVLUNGO_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test (QA)']] },
  ],
  // Doğrudan kargo firmaları (kendi anlaşmanız)
  hepsijet: [
    { k: 'HEPSIJET_USER', label: 'Kullanıcı adı', req: true }, { k: 'HEPSIJET_PASSWORD', label: 'Şifre', secret: true, req: true },
    { k: 'HEPSIJET_COMPANY', label: 'Firma kodu', req: true, hint: 'HepsiJET\'in verdiği kısa kod (ör. ETF)' }, { k: 'HEPSIJET_WAREHOUSE', label: 'Depo (XDock) kodu', req: true, hint: 'Gönderilerin çıkış deposu (ör. MRHP_SANCAKTEPE)' },
    { k: 'HEPSIJET_SENDER_ID', label: 'Gönderen adres kodu', adv: true, hint: 'HepsiJET\'te kayıtlı gönderen adresinizin kodu (verildiyse)' },
    { k: 'HEPSIJET_COMPANY_NAME', label: 'Firma adı', adv: true, hint: 'Boşsa Ayarlar → Kargo etiketi → Gönderen' },
    { k: 'HEPSIJET_APIKEY', label: 'API key', secret: true, adv: true, hint: 'HepsiJET ayrıca apikey verdiyse' },
    { k: 'HEPSIJET_PRODUCT', label: 'Teslimat türü', adv: true, choices: [['', 'Standart (HX_STD)'], ['HX_ND', 'Ertesi gün (HX_ND)'], ['HX_SD', 'Aynı gün (HX_SD)']] },
    { k: 'HEPSIJET_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test']] },
  ],
  dhl: [
    { k: 'DHL_CLIENT_ID', label: 'API istemci kimliği (Client ID)', req: true, hint: 'apizone.mngkargo.com.tr geliştirici portalındaki uygulamanızın anahtarı' }, { k: 'DHL_CLIENT_SECRET', label: 'API gizli anahtarı (Client Secret)', secret: true, req: true },
    { k: 'DHL_CUSTOMER_NO', label: 'Müşteri numarası', req: true }, { k: 'DHL_PASSWORD', label: 'Müşteri şifresi', secret: true, req: true },
    { k: 'DHL_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test (sandbox)']] },
  ],
  ptt: [
    { k: 'PTT_CUSTOMER_NO', label: 'Müşteri numarası', req: true, pattern: '^\\d+$', patternMsg: 'PTT müşteri numarası yalnız rakamlardan oluşur' }, { k: 'PTT_PASSWORD', label: 'Web servis şifresi', secret: true, req: true },
    { k: 'PTT_BARCODE_START', label: 'Barkod aralığı başlangıcı', req: true, pattern: '^\\d{12,13}$', patternMsg: 'PTT\'nin verdiği 12 haneli başlangıç numarası', hint: 'PTT\'nin verdiği aralığın ilk numarası (12 hane, kontrol hanesi olmadan)' },
    { k: 'PTT_BARCODE_END', label: 'Barkod aralığı sonu', pattern: '^\\d{12,13}$', patternMsg: 'PTT\'nin verdiği 12 haneli bitiş numarası' },
    { k: 'PTT_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test']] },
  ],
  surat: [
    { k: 'SURAT_USER', label: 'Cari kod', req: true, hint: 'Sürat Kargo müşteri (cari) numaranız' }, { k: 'SURAT_PASSWORD', label: 'Web servis şifresi', secret: true, req: true },
    { k: 'SURAT_WEB_PASSWORD', label: 'e-Sürat web servis şifresi', secret: true, hint: 'Panelden iptal ve Sürat etiketi için: e-Sürat → profil → Web Servis Şifre' },
    { k: 'SURAT_TRACK_PASSWORD', label: 'Takip şifresi', secret: true, adv: true, hint: 'Takip sorgusu farklı şifreyle çalışıyorsa' },
    { k: 'SURAT_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test (prova)']] },
  ],
  yurtici: [
    { k: 'YURTICI_USER', label: 'Web servis kullanıcı adı (wsUserName)', req: true, hint: 'Gönderici ödemeli kullanıcı' }, { k: 'YURTICI_PASSWORD', label: 'Web servis şifresi (wsPassword)', secret: true, req: true },
    { k: 'YURTICI_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test']] },
  ],
  aras: [
    { k: 'ARAS_USER', label: 'Kullanıcı adı', req: true, hint: 'Sevkiyat entegrasyonu (SetOrder) kullanıcısı' }, { k: 'ARAS_PASSWORD', label: 'Şifre', secret: true, req: true },
    { k: 'ARAS_QUERY_USER', label: 'Takip servisi kullanıcı adı', hint: 'Kargo durumu için: esasweb → Entegrasyon → XML Servisleri' }, { k: 'ARAS_QUERY_PASSWORD', label: 'Takip servisi şifresi', secret: true },
    { k: 'ARAS_CUSTOMER_CODE', label: 'Müşteri kodu', hint: 'Takip servisi için' },
    { k: 'ARAS_ENV', label: 'Ortam', adv: true, choices: [['', 'Canlı'], ['test', 'Test']] },
  ],
  ups: [
    { k: 'UPS_CUSTOMER_NO', label: 'Müşteri numarası', req: true }, { k: 'UPS_USER', label: 'Kullanıcı adı', req: true }, { k: 'UPS_PASSWORD', label: 'Şifre', secret: true, req: true },
    { k: 'UPS_QUERY_USER', label: 'Takip kullanıcı adı', adv: true, hint: 'UPS takip servisi için ayrı kullanıcı verdiyse' }, { k: 'UPS_QUERY_PASSWORD', label: 'Takip şifresi', secret: true, adv: true },
    { k: 'UPS_SERVICE', label: 'Servis', adv: true, choices: [['', 'Standart'], ['6', 'Express Saver'], ['4', 'Express 10:30']] },
  ],
  // Otomatik blog: Anthropic (Claude) API anahtarı (yalnız ana panel; bkz. blogai.js)
  ai: [{ k: 'ANTHROPIC_API_KEY', label: 'Anthropic API anahtarı', secret: true, req: true, hint: 'console.anthropic.com → API Keys' }],
  mail: [
    { k: 'MAIL_PROVIDER', label: 'E-posta servisi', hint: 'smtp (kendi e-posta sunucunuz), brevo veya resend' },
    { k: 'MAIL_API_KEY', label: 'API anahtarı', secret: true },
    { k: 'MAIL_FROM', label: 'Gönderen e-posta', hint: 'serviste doğrulanmış adres', req: true },
    { k: 'MAIL_FROM_NAME', label: 'Gönderen adı', hint: 'ör. Hastürk Panel' },
    { k: 'MAIL_SMTP_HOST', label: 'SMTP sunucusu', hint: 'ör. mail.alanadiniz.com.tr' },
    { k: 'MAIL_SMTP_PORT', label: 'SMTP portu', hint: '465 (SSL) ya da 587 (STARTTLS)', pattern: '^(465|587|2525)$', patternMsg: 'Port 465, 587 ya da 2525 olmalı (Cloudflare 25 numaralı porta izin vermez)' },
    { k: 'MAIL_SMTP_USER', label: 'SMTP kullanıcı adı', hint: 'genelde e-posta adresinin kendisi' },
    { k: 'MAIL_SMTP_PASS', label: 'SMTP şifresi', secret: true },
  ],
  hepsiburada: [
    { k: 'HB_MERCHANT_ID', label: 'Merchant ID', req: true, hint: 'ör. 10012bc1-3a53-4306-b782-11eed9083af2', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', patternMsg: 'Merchant ID, Hepsiburada\'nın verdiği 36 karakterlik kimlik olmalı (ör. 10012bc1-3a53-4306-b782-11eed9083af2)' },
    { k: 'HB_PASSWORD', label: 'Servis anahtarı (şifre)', secret: true, req: true },
    { k: 'HB_USERNAME', label: 'Kullanıcı adı', hint: 'boşsa Merchant ID', adv: true },
    { k: 'HB_USER_AGENT', platform: true, label: 'Entegratör adı (User-Agent)', req: true, hint: 'Merchant Portal → Hesabım → Entegrasyon (Entegratör Bilgileri) ekranındaki entegratör adı, ör. hasturk_dev. Boşsa ya da farklıysa Hepsiburada isteği 401/403 ile reddeder.' },
    { k: 'HB_TEST', platform: true, label: 'Ortam', hint: 'Test (SIT): canlı bilgiler gelene kadar test bilgileriyle; Canlı: Hepsiburada canlı bilgileri', choices: [['', 'Canlı'], ['1', 'Test (SIT)']] },
    { k: 'HB_MERCHANT_NAME', label: 'Mağaza adı (Hepsiburada\'da görünen)', hint: 'Buybox sıranızı bulmak için; ürün sayfasındaki satıcı adıyla birebir aynı', adv: true },
    { k: 'HB_PROXY_URL', platform: true, label: 'Aracı sunucu adresi (520 hatası için)', hint: 'Hosting yoksa: panel adresi/hb-proxy-deno.js dosyasını Deno Deploy\'da yayınlayıp verilen adres (ör. https://ornek.deno.dev). Hosting varsa: yüklediğiniz hb-proxy.php adresi (ör. https://alanadiniz.com/hb-proxy.php)', adv: true, pattern: '^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(:\\d+)?(/[^\\s]*)?$', patternMsg: 'https:// ile başlayan tam adresi kopyalayıp yapıştırın (ör. https://ornek-ad.halil2007.deno.net); “…” gibi kısaltma içermemeli' },
    { k: 'HB_PROXY_KEY', platform: true, label: 'Aracı sunucu anahtarı', hint: 'Aracı dosyasındaki KEY / $KEY ile birebir aynı', secret: true, adv: true },
  ],
  pttavm: [
    { k: 'PTTAVM_API_KEY', label: 'API Key', req: true, hint: 'PttAVM satıcı paneli → Hesap Yönetimi → Entegrasyon Bilgileri → entegratör (Hastürk) → Görüntüle → API Key' },
    { k: 'PTTAVM_TOKEN', label: 'Token (entegrasyon token)', secret: true, req: true, hint: 'Aynı ekrandaki, bu entegratör için üretilen token' },
    { k: 'PTTAVM_WAREHOUSE_ID', label: 'Depo numarası', hint: 'kargo barkodu için; boşsa mağazanın ilk deposu kullanılır', adv: true },
    { k: 'PTTAVM_USERNAME', label: 'Eski API kullanıcı adı', hint: 'yalnız API Key / Token yoksa (PttAVM eski girişi kapatıyor)', adv: true },
    { k: 'PTTAVM_PASSWORD', label: 'Eski API şifresi', secret: true, adv: true },
  ],
  n11: [
    { k: 'N11_APP_KEY', label: 'App Key', hint: 'Satıcı Ofisi → Hesabım → API Hesapları', req: true },
    { k: 'N11_APP_SECRET', label: 'App Secret', secret: true, req: true },
  ],
  idefix: [
    { k: 'IDEFIX_VENDOR_ID', label: 'Satıcı ID', req: true, hint: 'ör. 16705', pattern: '^\\d+$', patternMsg: 'idefix Satıcı ID yalnızca rakamlardan oluşur (Hesabım → Entegrasyon Bilgileri)' },
    { k: 'IDEFIX_API_KEY', label: 'API KEY', secret: true, req: true },
    { k: 'IDEFIX_API_SECRET', label: 'API SECRET KEY', secret: true, req: true, hint: '“Yeni API Oluştur” sonrası idefix\'in e-posta ile gönderdiği gizli anahtar' },
  ],
  pazarama: [
    { k: 'PAZARAMA_CLIENT_ID', label: 'API Key (Client ID)', req: true },
    { k: 'PAZARAMA_CLIENT_SECRET', label: 'API Secret', secret: true, req: true },
  ],
  // ---------- test aşamasındaki kanallar (ana ve müşteri panellerinde "Test aşamasında" etiketiyle) ----------
  amazon: [
    { k: 'AMAZON_SELLER_ID', label: 'Satıcı kimliği (Merchant Token)', req: true, hint: 'Seller Central → Ayarlar → Hesap Bilgileri → Satıcı Token (ör. A1B2C3D4E5F6G7)', pattern: '^[A-Z0-9]{8,20}$', patternMsg: 'Amazon satıcı kimliği büyük harf ve rakamlardan oluşur (ör. A1B2C3D4E5F6G7)' },
    { k: 'AMAZON_CLIENT_ID', label: 'LWA Client ID', req: true, hint: 'Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme → uygulamanız → LWA kimlik bilgileri (amzn1.application-oa2-client…)' },
    { k: 'AMAZON_CLIENT_SECRET', label: 'LWA Client Secret', secret: true, req: true },
    { k: 'AMAZON_REFRESH_TOKEN', label: 'Refresh token', secret: true, req: true, hint: 'Uygulamayı kendi mağazanız için yetkilendirince verilen Atzr|… ile başlayan belirteç' },
    { k: 'AMAZON_MARKETPLACE_ID', label: 'Pazar yeri ID', hint: 'boşsa Amazon.com.tr (A33AVAJ2PDY3EV)', adv: true },
    { k: 'AMAZON_REGION', label: 'Bölge', choices: [['', 'Avrupa (Türkiye dahil)'], ['na', 'Kuzey Amerika'], ['fe', 'Uzak Doğu']], adv: true },
    { k: 'AMAZON_SANDBOX', label: 'Ortam', choices: [['', 'Canlı'], ['1', 'Test (Sandbox)']], adv: true },
  ],
  ciceksepeti: [
    { k: 'CICEKSEPETI_API_KEY', label: 'API anahtarı', secret: true, req: true, hint: 'Çiçeksepeti satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri' },
    { k: 'CICEKSEPETI_SELLER_ID', label: 'Satıcı ID', hint: 'Çiçeksepeti satıcı paneli → Entegrasyon Bilgilerim (her istekte user-agent olarak gönderilir)' },
    { k: 'CICEKSEPETI_INTEGRATOR', label: 'Entegratör adı', adv: true, hint: 'Boşsa yalnız Satıcı ID gönderilir; entegratör olarak kayıtlıysanız "SatıcıId-EntegratörAdı" gider' },
    { k: 'CICEKSEPETI_TEST', label: 'Ortam', choices: [['', 'Canlı'], ['1', 'Test (Sandbox)']], adv: true },
  ],
  koctas: [
    { k: 'KOCTAS_URL', label: 'Koçtaş pazaryeri API adresi', req: true, hint: 'Koçtaş satıcı paneli (Mirakl) adresi, ör. https://koctas-prod.mirakl.net', pattern: '^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$', patternMsg: 'https:// ile başlayan panel adresini girin (ör. https://koctas-prod.mirakl.net)' },
    { k: 'KOCTAS_API_KEY', label: 'API anahtarı', secret: true, req: true, hint: 'Satıcı paneli → sağ üst kullanıcı menüsü → API Anahtarı' },
    { k: 'KOCTAS_SHOP_ID', label: 'Mağaza ID', hint: 'birden fazla mağazanız varsa', adv: true },
  ],
  shopify: [
    { k: 'SHOPIFY_STORE', label: 'Mağaza adresi', req: true, hint: 'XXXX.myshopify.com → XXXX (ya da adresin tamamı)' },
    { k: 'SHOPIFY_CLIENT_ID', label: 'Client ID', hint: 'dev.shopify.com → Dev Dashboard → uygulama → Ayarlar (uygulamayı mağazanıza kurun; kapsamlar: read_orders, read_all_orders, write_products, write_inventory, read_locations, write_merchant_managed_fulfillment_orders, write_fulfillments)' },
    { k: 'SHOPIFY_CLIENT_SECRET', label: 'Client secret', secret: true, hint: 'Dev Dashboard → uygulama → Ayarlar → Client secret' },
    { k: 'SHOPIFY_TOKEN', label: 'Admin API erişim belirteci (eski)', secret: true, adv: true, hint: 'Yalnız eski (Shopify yönetiminde oluşturulmuş) özel uygulamalar: shpat_… — Client ID / secret girildiyse gerekmez' },
    { k: 'SHOPIFY_LOCATION_ID', label: 'Stok lokasyonu ID', hint: 'boşsa ana (primary) lokasyon', adv: true },
  ],
  woocommerce: [
    { k: 'WOO_URL', label: 'Site adresi', req: true, hint: 'ör. https://magazaniz.com', pattern: '^https://[^\\s]+$', patternMsg: 'https:// ile başlayan site adresini girin' },
    { k: 'WOO_KEY', label: 'Tüketici anahtarı', req: true, hint: 'WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle (Okuma/Yazma) → ck_…' },
    { k: 'WOO_SECRET', label: 'Tüketici gizli anahtarı', secret: true, req: true, hint: 'cs_…' },
  ],
  // OpenCart: yönetim API'si yok; panelden indirilen bağlantı dosyası (public/opencart-bridge.php) sitenin ana klasörüne yüklenir
  opencart: [
    { k: 'OPENCART_URL', label: 'Site adresi', req: true, hint: 'ör. https://magazaniz.com (OpenCart\'ın kurulu olduğu adres; yönetim paneli adresi değil)', pattern: '^https://[^\\s]+$', patternMsg: 'https:// ile başlayan site adresini girin' },
    { k: 'OPENCART_KEY', label: 'Bağlantı anahtarı', secret: true, req: true, hint: 'Bağlantı dosyası indirilirken panel kendisi oluşturur ve dosyaya yazar (dosyadaki HASTURK_KEY ile aynı olmalı); elle girmeniz gerekmez', pattern: '^[A-Za-z0-9_-]{24,128}$', patternMsg: 'Anahtar en az 24 karakter olmalı ve yalnız harf, rakam, - ve _ içermeli' },
    { k: 'OPENCART_BRIDGE', label: 'Bağlantı dosyasının adı', hint: 'boşsa hasturk-baglanti.php (sunucuya farklı adla yüklediyseniz o adı yazın)', adv: true, pattern: '^[A-Za-z0-9._-]+\\.php$', patternMsg: 'Dosya adı .php ile bitmeli; yalnız harf, rakam, nokta, - ve _ içermeli' },
    { k: 'OPENCART_SHIP_STATUS', label: '"Kargoya verildi" durum no', hint: 'boşsa adı "Shipped" / "Kargo…" olan sipariş durumu kullanılır; numara: OpenCart → Sistem → Yerelleştirme → Sipariş Durumları (düzenle bağlantısındaki order_status_id)', adv: true, pattern: '^\\d+$', patternMsg: 'Sipariş durumu numarası yalnız rakamlardan oluşur' },
  ],
  etsy: [
    { k: 'ETSY_SHOP_ID', label: 'Mağaza ID', req: true, pattern: '^\\d+$', patternMsg: 'Etsy mağaza ID yalnızca rakamlardan oluşur' },
    { k: 'ETSY_API_KEY', label: 'Keystring (API Key)', req: true, hint: 'etsy.com/developers → Your Apps → uygulamanız' },
    { k: 'ETSY_SHARED_SECRET', label: 'Shared secret', secret: true, req: true },
    { k: 'ETSY_REFRESH_TOKEN', label: 'Refresh token', secret: true, req: true, hint: 'Uygulamayı mağazanız için yetkilendirince (OAuth, kapsamlar: transactions_r transactions_w listings_r listings_w shops_r) verilen belirteç; panel yenisini kendisi saklar' },
  ],
};

// ---------- ek mağazalar ----------
// Her kanal türüne istenen sayıda mağaza eklenebilir: ek mağazanın kimliği "<tür>_<n>" (ör. trendyol_2, ikas_3).
// Test aşamasındaki yeni kanallar ve kargo firmaları (bağlantı dosyaları: src/channels/<id>.js, src/carriers/<id>.js)
Object.assign(FIELDS, {
  teknosa: [{"k": "TEKNOSA_API_KEY", "label": "API anahtarı", "secret": true, "req": true, "hint": "Teknosa satıcı paneli (Mirakl) → sağ üst kullanıcı menüsü → API Anahtarı"}, {"k": "TEKNOSA_URL", "label": "Teknosa pazaryeri API adresi", "adv": true, "hint": "Boş bırakılırsa https://teknosatr-prod.mirakl.net kullanılır", "pattern": "^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "https:// ile başlayan panel adresini girin (ör. https://teknosatr-prod.mirakl.net)"}, {"k": "TEKNOSA_SHOP_ID", "label": "Mağaza ID", "adv": true, "hint": "birden fazla mağazanız varsa"}],
  boyner: [{"k": "BOYNER_SELLER_ID", "label": "Satıcı ID", "req": true, "pattern": "^\\d+$", "patternMsg": "Boyner Satıcı ID yalnızca rakamlardan oluşur"}, {"k": "BOYNER_API_KEY", "label": "API Key", "req": true}, {"k": "BOYNER_API_SECRET", "label": "API Secret", "secret": true, "req": true}, {"k": "BOYNER_URL", "label": "API adresi", "adv": true, "hint": "Boş bırakılırsa https://merchantapi.boyner.com.tr kullanılır. Boyner farklı bir adres / yol öneki verdiyse girin", "pattern": "^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "https:// ile başlayan adres girin"}, {"k": "BOYNER_INTEGRATOR", "label": "Entegratör adı", "adv": true, "hint": "Boşsa \"SelfIntegration\" gönderilir; istekler \"SatıcıId - FirmaAdı\" kimliğiyle gider (yalnız harf ve rakam, en fazla 30 karakter)"}],
  pasaj: [{"k": "PASAJ_URL", "label": "API adresi", "req": true, "hint": "Pasaj danışmanınızın API erişimini açarken verdiği servis adresi (entegrasyon belgesinde)", "pattern": "^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "https:// ile başlayan adres girin"}, {"k": "PASAJ_SELLER_ID", "label": "Satıcı ID", "req": true}, {"k": "PASAJ_API_KEY", "label": "API Key", "req": true}, {"k": "PASAJ_API_SECRET", "label": "API Secret", "secret": true, "req": true}, {"k": "PASAJ_INTEGRATOR", "label": "Entegratör adı", "adv": true, "hint": "Boşsa \"SelfIntegration\" gönderilir"}],
  trendyolgo: [{"k": "TRENDYOLGO_SUPPLIER_ID", "label": "Satıcı ID (Supplier ID)", "req": true, "pattern": "^\\d+$", "patternMsg": "Trendyol Go Satıcı ID yalnızca rakamlardan oluşur", "hint": "Trendyol Go satıcı paneli → mağaza adı → Hesap Bilgilerim → Entegrasyon Bilgileri"}, {"k": "TRENDYOLGO_API_KEY", "label": "API Key", "req": true}, {"k": "TRENDYOLGO_API_SECRET", "label": "API Secret", "secret": true, "req": true}, {"k": "TRENDYOLGO_STORE_ID", "label": "Şube ID (storeId)", "req": true, "pattern": "^\\d+$", "patternMsg": "Şube ID yalnızca rakamlardan oluşur", "hint": "Stok ve fiyat bu şubeye gönderilir, siparişler bu şubeden çekilir. Bilmiyorsanız kategori sorumlunuzdan alın; “Bağlantıyı test et” şube listesini gösterir. Diğer şubeler ek mağaza olarak eklenir."}, {"k": "TRENDYOLGO_INTEGRATOR", "label": "Entegratör adı", "adv": true, "hint": "Boşsa \"SelfIntegration\" gönderilir (User-Agent: \"SatıcıId - FirmaAdı\"; yalnız harf/rakam, en fazla 30 karakter)"}, {"k": "TRENDYOLGO_EXECUTOR", "label": "İşlemi yapan e-posta", "adv": true, "hint": "İsteğe bağlı x-executor-user başlığı (Trendyol Go isterse)"}, {"k": "TRENDYOLGO_ENV", "label": "Ortam", "adv": true, "choices": [["", "Canlı"], ["stage", "Test (stage, IP yetkisi gerekir)"]]}],
  getir: [{"k": "GETIR_APP_SECRET_KEY", "label": "Uygulama anahtarı (appSecretKey)", "secret": true, "req": true, "hint": "Getir'in entegrasyon için verdiği uygulama (entegratör) gizli anahtarı"}, {"k": "GETIR_SHOP_SECRET_KEY", "label": "Mağaza anahtarı (shopSecretKey)", "secret": true, "req": true, "hint": "Her mağaza (şube) için ayrı; diğer şubeler ek mağaza olarak eklenir"}, {"k": "GETIR_BASE", "label": "API adresi", "adv": true, "hint": "Boşsa https://locals-integration-pos-api-gateway.artisan.getirapi.com; Getir farklı adres verdiyse girin", "pattern": "^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "https:// ile başlayan adres girin"}],
  yemeksepeti: [{"k": "YEMEKSEPETI_CLIENT_ID", "label": "Client ID", "req": true, "hint": "Yemeksepeti Partner Portal → Mağaza Entegrasyonları (Shop Integrations) eklentisi"}, {"k": "YEMEKSEPETI_CLIENT_SECRET", "label": "Client secret", "secret": true, "req": true}, {"k": "YEMEKSEPETI_CHAIN_ID", "label": "Zincir ID (chain_id)", "req": true, "hint": "Partner Portal entegrasyon ekranı ya da hesap yöneticiniz"}, {"k": "YEMEKSEPETI_VENDOR_ID", "label": "Mağaza ID (vendor_id)", "req": true, "hint": "Yemeksepeti'nin mağazanıza verdiği kod; diğer şubeler ek mağaza olarak eklenir"}, {"k": "YEMEKSEPETI_ENV", "label": "Ortam", "adv": true, "choices": [["", "Canlı"], ["sandbox", "Test (sandbox)"]]}],
  ebay: [{"k": "EBAY_CLIENT_ID", "label": "App ID (Client ID)", "req": true, "hint": "developer.ebay.com → Hi <kullanıcı> → Application Keys → Production (ya da Sandbox) anahtar seti → App ID"}, {"k": "EBAY_CLIENT_SECRET", "label": "Cert ID (Client Secret)", "secret": true, "req": true, "hint": "Aynı anahtar setindeki Cert ID"}, {"k": "EBAY_REFRESH_TOKEN", "label": "Refresh token", "secret": true, "req": true, "hint": "Application Keys → User Tokens → \"Get a Token from eBay via Your Application\" (OAuth, kapsamlar: sell.fulfillment, sell.inventory) ile mağaza hesabınızla oturum açınca verilen v^1.1#… belirteç (≈18 ay geçerli)", "pattern": "^v\\^1\\.1#\\S+$", "patternMsg": "eBay refresh token v^1.1# ile başlar"}, {"k": "EBAY_MARKETPLACE_ID", "label": "Pazar yeri", "adv": true, "choices": [["", "eBay.com (ABD, EBAY_US)"], ["EBAY_GB", "eBay.co.uk (EBAY_GB)"], ["EBAY_DE", "eBay.de (EBAY_DE)"], ["EBAY_FR", "eBay.fr (EBAY_FR)"], ["EBAY_IT", "eBay.it (EBAY_IT)"], ["EBAY_ES", "eBay.es (EBAY_ES)"], ["EBAY_AU", "eBay.com.au (EBAY_AU)"], ["EBAY_CA", "eBay.ca (EBAY_CA)"]]}, {"k": "EBAY_SANDBOX", "label": "Ortam", "adv": true, "choices": [["", "Canlı"], ["1", "Test (Sandbox)"]]}],
  ozon: [{"k": "OZON_CLIENT_ID", "label": "Client ID", "req": true, "hint": "seller.ozon.ru → Ayarlar (Настройки) → Seller API → Client ID", "pattern": "^\\d+$", "patternMsg": "Ozon Client ID yalnızca rakamlardan oluşur"}, {"k": "OZON_API_KEY", "label": "API anahtarı", "secret": true, "req": true, "hint": "Aynı sayfada \"Anahtar oluştur\" (Сгенерировать ключ) → rol: Admin (ya da en az FBS siparişleri + ürünler + fiyat ve stok)"}, {"k": "OZON_WAREHOUSE_ID", "label": "Stok deposu ID", "adv": true, "hint": "Stokların yazılacağı FBS / rFBS deposu (Logistics → Depolar / Склады). Hesapta tek depo varsa boş bırakılabilir", "pattern": "^\\d+$", "patternMsg": "Depo ID yalnızca rakamlardan oluşur"}],
  ticimax: [{"k": "TICIMAX_URL", "label": "Site adresi", "req": true, "hint": "Ticimax altyapılı mağazanızın alan adı, ör. www.magazaniz.com (servisler https://alanadi/Servis/… adresinden çağrılır)", "pattern": "^(https://)?[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "Alan adını girin (ör. www.magazaniz.com)"}, {"k": "TICIMAX_KEY", "label": "WS Yetki Kodu", "secret": true, "req": true, "hint": "Ticimax paneli → Ayarlar → WS Yetki Kodu Yönetimi → kod oluşturun; SelectSiparis, SetSiparisDurum, SelectUrun, StokAdediGuncelle, VaryasyonGuncelle yetkilerini işaretleyin"}],
  ideasoft: [{"k": "IDEASOFT_URL", "label": "Mağaza adresi", "req": true, "hint": "ör. magazaniz.myideasoft.com ya da kendi alan adınız (www.magazaniz.com)", "pattern": "^(https://)?[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "Mağaza alan adını girin"}, {"k": "IDEASOFT_CLIENT_ID", "label": "Client ID", "req": true, "hint": "IdeaSoft paneli → Entegrasyonlar → API → Ekle (ör. 7_xxxx)"}, {"k": "IDEASOFT_CLIENT_SECRET", "label": "Client Secret", "secret": true, "req": true}, {"k": "IDEASOFT_REFRESH_TOKEN", "label": "Refresh token", "secret": true, "req": true, "hint": "Uygulamaya izin verdikten sonra /oauth/v2/token yanıtındaki refresh_token. Panel her yenilemede yenisini kendisi saklar; 2 ay kullanılmazsa yeniden yetki gerekir"}],
  tsoft: [{"k": "TSOFT_URL", "label": "Site adresi", "req": true, "hint": "T-Soft altyapılı mağazanızın alan adı, ör. www.magazaniz.com (servis: https://alanadi/rest1/…)", "pattern": "^(https://)?[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$", "patternMsg": "Alan adını girin"}, {"k": "TSOFT_USER", "label": "Web servis kullanıcı adı", "req": true, "hint": "T-Soft paneli → Ayarlar → Kullanıcı Yönetimi → Web Servis Kullanıcıları"}, {"k": "TSOFT_PASS", "label": "Web servis şifresi", "secret": true, "req": true}, {"k": "TSOFT_CARGO_CODE", "label": "Kargo firma kodu", "adv": true, "hint": "Kargoya verirken gönderilecek T-Soft kargo kodu (ör. T2). Boşsa siparişte seçili kargo firmasının kodu kullanılır"}],
  kolaygelsin: [{"k": "KOLAYGELSIN_TOKEN", "label": "API token", "req": true, "secret": true, "hint": "Kolay Gelsin'in verdiği entegrasyon token'ı"}, {"k": "KOLAYGELSIN_CUSTOMER_ID", "label": "Müşteri numarası", "req": true, "pattern": "^\\d+$", "patternMsg": "Kolay Gelsin müşteri numarası yalnız rakamdır", "hint": "Kolay Gelsin'in verdiği gönderen müşteri numarası (CustomerId)"}, {"k": "KOLAYGELSIN_ADDRESS_ID", "label": "Gönderen adres numarası", "req": true, "pattern": "^\\d+$", "patternMsg": "Adres numarası yalnız rakamdır", "hint": "Kolay Gelsin'de kayıtlı çıkış adresinizin numarası (AddressId)"}, {"k": "KOLAYGELSIN_BRAND", "label": "Gönderen marka", "adv": true, "hint": "Kolay Gelsin bildirimlerinde görünecek marka (verildiyse)"}, {"k": "KOLAYGELSIN_SAMEDAY", "label": "Teslimat türü", "adv": true, "choices": [["", "Standart"], ["1", "Aynı gün (SAMEDAY)"]]}, {"k": "KOLAYGELSIN_ENV", "label": "Ortam", "adv": true, "choices": [["", "Canlı"], ["test", "Test"]]}],
  sendeo: [{"k": "SENDEO_USER", "label": "Müşteri adı (musteri)", "req": true, "hint": "Sendeo'nun verdiği web servis müşteri adı"}, {"k": "SENDEO_PASSWORD", "label": "Şifre (sifre)", "req": true, "secret": true}, {"k": "SENDEO_SENDER_NAME", "label": "Gönderen ünvanı", "adv": true, "hint": "Boşsa Ayarlar → Kargo etiketi → Gönderen"}, {"k": "SENDEO_SENDER_DISTRICT_ID", "label": "Gönderen ilçe kodu", "adv": true, "pattern": "^\\d+$", "patternMsg": "Sendeo ilçe kodu yalnız rakamdır", "hint": "Gönderen ilçesi otomatik bulunamazsa Sendeo'nun verdiği ilçe kodu"}, {"k": "SENDEO_SENDER_CITY_ID", "label": "Gönderen il kodu (plaka)", "adv": true, "pattern": "^\\d{1,2}$", "patternMsg": "İl plaka numarası"}, {"k": "SENDEO_ENV", "label": "Ortam", "adv": true, "choices": [["", "Canlı"], ["test", "Test"]]}],
  dhlexpress: [{"k": "DHLEXPRESS_API_KEY", "label": "API Key", "req": true, "hint": "developer.dhl.com → My Apps → MyDHL API uygulamanızın anahtarı"}, {"k": "DHLEXPRESS_API_SECRET", "label": "API Secret", "req": true, "secret": true}, {"k": "DHLEXPRESS_ACCOUNT", "label": "Hesap numarası", "req": true, "pattern": "^\\d{9,12}$", "patternMsg": "DHL Express hesap numarası (genellikle 9 hane)", "hint": "Gönderilerin faturalanacağı DHL Express gönderen hesabı"}, {"k": "DHLEXPRESS_SENDER_POSTCODE", "label": "Gönderen posta kodu", "pattern": "^\\d{5}$", "patternMsg": "5 haneli posta kodu", "hint": "Boşsa DHL adres doğrulamasından bulunur"}, {"k": "DHLEXPRESS_COMPANY", "label": "Gönderen firma adı", "adv": true, "hint": "Boşsa Ayarlar → Kargo etiketi → Gönderen"}, {"k": "DHLEXPRESS_PRODUCT", "label": "Ürün kodu", "adv": true, "choices": [["", "Domestic Express (N)"], ["O", "Domestic Express 10:30 (O)"], ["1", "Domestic Express 12:00 (1)"]], "hint": "Hesabınızda tanımlı yurt içi ürün"}, {"k": "DHLEXPRESS_ENV", "label": "Ortam", "adv": true, "choices": [["", "Canlı"], ["test", "Test"]]}],
});
// Ek mağazanın bilgileri ana mağazayla aynı alan adlarıyla, kendi kaydında saklanır; Cloudflare değişkenleri ek mağazaya karışmaz.
// Test aşamasındaki kanallar: ana panelde ve müşteri panellerinde eklenip kullanılabilir, "Test aşamasında" etiketiyle görünür
// (tanıtım sitesinde de). Ana panel → Entegrasyonlar → kanal → "Test yazısını kaldır" ile tamamlanan tür (settings: released_channels)
// etiketsiz normal kanal olur: müşteri panellerine RELEASED_TYPES ortam değişkeniyle gider (birkaç dakika içinde), tanıtım sitesi
// /api/public/channels'tan okur.
// Geliştirme aşamasındaki kanallar: listede görünür, bağlanamaz (API belgesi doğrulanana kadar)
export const DEV_TYPES = ['boyner', 'pasaj', 'getir'];
// Yurt dışı pazaryerleri (Kurumsal pakette): eBay, Etsy, Ozon; Amazon yalnız Türkiye dışı pazar yeri seçildiyse (Amazon.com.tr yurt içidir)
export const INTL_TYPES = ['ebay', 'etsy', 'ozon'];
const AMAZON_TR = 'A33AVAJ2PDY3EV';
export const isIntl = (type, values = {}) => {
  if (INTL_TYPES.includes(type)) return true;
  if (type !== 'amazon') return false;
  // Ek mağazada alan adları önekli olabilir (AMAZON2_MARKETPLACE_ID …): sonu eşleşen alan okunur
  const pick = (suffix) => { const k = Object.keys(values || {}).find((x) => x.endsWith(suffix)); return k ? String(values[k] || '').trim() : ''; };
  const mp = pick('_MARKETPLACE_ID'), rg = pick('_REGION');
  return (!!mp && mp !== AMAZON_TR) || (!!rg && rg !== 'eu');
};
export const BETA_TYPES = ['amazon', 'ciceksepeti', 'koctas', 'shopify', 'opencart', 'etsy', 'teknosa', 'boyner', 'pasaj', 'trendyolgo', 'getir', 'yemeksepeti', 'ebay', 'ozon', 'ticimax', 'ideasoft', 'tsoft'];
export async function releasedTypes(env, db) {
  if (env && env.TENANT_SLUG) return String(env.RELEASED_TYPES || '').split(',').filter((t) => BETA_TYPES.includes(t));
  if (!db) return [];
  const r = await first(db, "SELECT v FROM settings WHERE k = 'released_channels'").catch(() => null);
  try { const a = r ? JSON.parse(r.v) : []; return Array.isArray(a) ? a.filter((t) => BETA_TYPES.includes(t)) : []; } catch { return []; }
}
export const TYPES = ['ikas', 'trendyol', 'hepsiburada', 'pttavm', 'n11', 'idefix', 'pazarama', 'woocommerce', ...BETA_TYPES];
export const TYPE_NAMES = { ikas: 'ikas', trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', pttavm: 'PttAVM', n11: 'N11', idefix: 'idefix', pazarama: 'Pazarama', amazon: 'Amazon', ciceksepeti: 'Çiçeksepeti', koctas: 'Koçtaş', shopify: 'Shopify', woocommerce: 'WooCommerce', opencart: 'OpenCart', etsy: 'Etsy', teknosa: 'Teknosa', boyner: 'Boyner', pasaj: 'Turkcell Pasaj', trendyolgo: 'Trendyol Go', getir: 'Getir Çarşı', yemeksepeti: 'Yemeksepeti Market', ebay: 'eBay', ozon: 'Ozon', ticimax: 'Ticimax', ideasoft: 'IdeaSoft', tsoft: 'T-Soft' };
export const EXTRA_RE = new RegExp(`^(${TYPES.join('|')})_(\\d{1,3})$`);
export const isBeta = (id, released = []) => BETA_TYPES.includes(typeOf(id)) && !released.includes(typeOf(id));
export const isExtra = (id) => EXTRA_RE.test(String(id || ''));
export const typeOf = (id) => { const m = EXTRA_RE.exec(String(id || '')); return m ? m[1] : /^ikas\d$/.test(id) ? 'ikas' : id; };
const baseFields = (type) => FIELDS[type === 'ikas' ? 'ikas1' : type] || [];
const LABEL = { k: 'STORE_LABEL', label: 'Panelde görünen ad', hint: 'ör. Trendyol · 2. mağaza' };
export function fieldsFor(id) {
  if (FIELDS[id]) return FIELDS[id];
  if (!isExtra(id)) return null;
  return typeOf(id) === 'ikas' ? baseFields('ikas') : [LABEL, ...baseFields(typeOf(id))];
}
// Ek mağazanın değişkenleri: ortamdaki o türe ait anahtarlar silinir, yerine mağazanın kendi bilgileri konur
export function storeEnv(env, type, values) {
  const out = { ...env };
  for (const f of baseFields(type)) delete out[f.k];
  for (const [k, v] of Object.entries(values || {})) if (v) out[k] = v;
  return out;
}
export async function addStore(db, type) {
  if (!TYPES.includes(type)) fail(400, 'Bilinmeyen kanal türü');
  const rows = await all(db, 'SELECT id FROM channel_config');
  const used = new Set(rows.map((r) => r.id));
  let n = type === 'ikas' ? 3 : 2;
  while (used.has(`${type}_${n}`)) n++;
  const id = `${type}_${n}`;
  await run(db, 'INSERT INTO channel_config (id, data, active, updated_at) VALUES (?, NULL, 1, ?)', id, Date.now());
  return id;
}
export async function removeStore(db, id) {
  if (!isExtra(id)) fail(400, 'Ana mağaza kaldırılamaz; pasif yapabilirsiniz');
  await run(db, 'DELETE FROM channel_config WHERE id = ?', id);
  // Mağazaya ait tüm durum kayıtları (senkron imleci, onay, fatura / hakediş / maliyet zamanları ...) ve ilanları, kategori eşleştirmeleri,
  // fiyat kuralları silinir: aynı kimlikle yeniden eklenen mağaza eski hesabın verisiyle başlamaz. Siparişler ve raporlar korunur.
  await run(db, "DELETE FROM settings WHERE k LIKE ? ESCAPE '\\'", '%:' + id.replace(/_/g, '\\_'));
  for (const t of ['listings', 'category_map', 'price_rules', 'buybox']) await run(db, `DELETE FROM ${t} WHERE channel = ?`, id).catch(() => {});
}

// ---------- şifreleme ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(env) {
  const base = env.PANEL_SECRET || env.PANEL_PASSWORD || (env.DEMO === '1' ? 'demo' : '');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('hasturk-panel-config|' + base));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(JSON.stringify(obj))));
  return b64(iv) + '.' + b64(ct);
}
async function open(env, s) {
  const [iv, ct] = String(s).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(ct));
  return JSON.parse(dec.decode(pt));
}

// Kayıtlı yapılandırma: { id: { values, active, locked } }
export async function loadConfig(env, db) {
  const rows = await all(db, 'SELECT id, data, active, updated_at FROM channel_config');
  const out = {};
  for (const r of rows) {
    let values = {}, locked = false;
    if (r.data) { try { values = await open(env, r.data); } catch { locked = true; } }
    out[r.id] = { values, active: r.active !== 0, locked, updated: r.updated_at };
  }
  return out;
}

export async function saveConfig(env, db, id, { values = {}, clear = [], active } = {}) {
  const fields = fieldsFor(id);
  if (!fields) throw new Error('Bilinmeyen kanal');
  const cur = (await loadConfig(env, db))[id] || { values: {}, active: true };
  const next = cur.locked ? {} : { ...cur.values };
  for (const f of fields) {
    if (clear.includes(f.k)) { delete next[f.k]; continue; }
    if (!(f.k in values)) continue;
    const v = String(values[f.k] ?? '').trim();
    // Gizli alan boş gönderilirse eski değer korunur (istemci gizli değeri hiç görmez)
    if (f.secret && !v) continue;
    if (v && f.pattern && !new RegExp(f.pattern).test(v)) fail(400, `${f.label}: ${f.patternMsg || 'geçersiz değer'} (girilen: “${v.slice(0, 40)}”)`);
    if (v) next[f.k] = v; else delete next[f.k];
  }
  const act = active === undefined ? cur.active : !!active;
  await run(db, `INSERT INTO channel_config (id, data, active, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET data = excluded.data, active = excluded.active, updated_at = excluded.updated_at`,
  id, Object.keys(next).length ? await seal(env, next) : null, act ? 1 : 0, Date.now());
}

// Kanal için geçerli değişkenler: Cloudflare ortamı + panelde girilenler (panel önceliklidir)
// Müşteri panelinde platformdan gelen gizli bilgiler (ana panelin e-posta servisi, Hepsiburada aracı sunucusu) gruptur: müşteri gruptan
// tek bir değeri bile kendisi girerse platformun o gruptaki değerleri hiç kullanılmaz (aksi halde ör. yalnız SMTP sunucusunu kendi
// adresine çevirip platformun SMTP şifresini oraya gönderebilirdi).
const PLATFORM_GROUPS = [/^MAIL_/, /^HB_PROXY_/];
export function effectiveEnv(env, cfg) {
  const out = { ...env };
  const own = [];
  // Müşteri panelinde kayıtlı e-posta servisi (eskiden girilmiş olsa da) kullanılmaz: e-postalar yalnız platformun adresinden gider
  for (const [id, c] of Object.entries(cfg)) if (!isExtra(id) && !(env.TENANT_SLUG && id === 'mail')) for (const [k, v] of Object.entries(c.values || {})) if (v) own.push([k, v]);
  if (env.TENANT_SLUG && env.PLATFORM_KEYS) {
    const plat = String(env.PLATFORM_KEYS).split(',').filter(Boolean);
    for (const g of PLATFORM_GROUPS) if (own.some(([k]) => g.test(k))) for (const k of plat) if (g.test(k)) delete out[k];
  }
  for (const [k, v] of own) out[k] = v;
  return out;
}

// İstemciye gösterilecek alanlar: gizli değerler maskelenir
export function describe(env, cfg, id) {
  const c = cfg[id] || { values: {}, active: true };
  return {
    active: c.active, locked: !!c.locked, updated: c.updated || null,
    fields: fieldsFor(id).map((f) => {
      const p = c.values[f.k], e = isExtra(id) ? '' : env[f.k];
      const v = p || e || '';
      return {
        k: f.k, label: f.label, hint: f.hint || '', secret: !!f.secret, req: !!f.req, adv: !!f.adv, choices: f.choices || null,
        source: p ? 'panel' : e ? 'cloudflare' : '',
        value: f.secret ? '' : v,
        masked: f.secret && v ? '••••••' + String(v).slice(-4) : '',
      };
    }),
  };
}

// Kanal nesneleri önbelleğinin anahtarı: API bilgisi kaydı ya da bekleyen kanal onayı değişince yenilenir
export async function configVersion(db) {
  const r = await first(db, "SELECT (SELECT MAX(updated_at) FROM channel_config) AS v, (SELECT GROUP_CONCAT(v) FROM settings WHERE k LIKE 'verified:%') AS w, (SELECT v FROM settings WHERE k = 'hold_channels') AS h, (SELECT v FROM settings WHERE k = 'released_channels') AS rl");
  return `${(r && r.v) || 0}|${(r && r.w) || ''}|${(r && r.h) || ''}|${(r && r.rl) || ''}`;
}
