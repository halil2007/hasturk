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
  { k: `${p}STOCK_LOCATION_ID`, label: 'Stok lokasyonu ID', hint: 'boşsa ilk lokasyon', adv: true },
];

export const FIELDS = {
  ikas1: ikasFields('IKAS1_'),
  ikas2: ikasFields('IKAS2_'),
  trendyol: [
    { k: 'TRENDYOL_SELLER_ID', label: 'Satıcı ID (Cari ID)', req: true, pattern: '^\\d+$', patternMsg: 'Trendyol Satıcı ID yalnızca rakamlardan oluşur' },
    { k: 'TRENDYOL_API_KEY', label: 'API Key', req: true },
    { k: 'TRENDYOL_API_SECRET', label: 'API Secret', secret: true, req: true },
  ],
  // Yeni sipariş e-posta bildirimi (kanal değil; Ayarlar → Bildirimler'den girilir)
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
    { k: 'PTTAVM_USERNAME', label: 'API kullanıcı adı', req: true },
    { k: 'PTTAVM_PASSWORD', label: 'API şifresi', secret: true, req: true },
    { k: 'PTTAVM_WAREHOUSE_ID', label: 'Depo numarası', hint: 'kargo barkodu için' },
    { k: 'PTTAVM_SHIPMENT_USER', label: 'Kargo servisi kullanıcı adı', hint: 'boşsa API kullanıcısı', adv: true },
    { k: 'PTTAVM_SHIPMENT_PASSWORD', label: 'Kargo servisi şifresi', secret: true, adv: true },
    { k: 'PTTAVM_ORDER_METHOD', label: 'Sipariş servisi', hint: 'varsayılan SiparisKontrolListesiV2', adv: true },
    { k: 'PTTAVM_STOCK_METHOD', label: 'Stok servisi', hint: 'varsayılan StokFiyatGuncelle3', adv: true },
    { k: 'PTTAVM_LIST_METHOD', label: 'Ürün listesi servisi', hint: 'varsayılan StokKontrolListesi', adv: true },
    { k: 'PTTAVM_DATE_FORMAT', label: 'Tarih biçimi', hint: 'tr = gg.aa.yyyy', adv: true },
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
  // ---------- test modülündeki kanallar (yalnız ana panelde; müşteri panellerinde "Yakında") ----------
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
    { k: 'CICEKSEPETI_TEST', label: 'Ortam', choices: [['', 'Canlı'], ['1', 'Test (Sandbox)']], adv: true },
  ],
  koctas: [
    { k: 'KOCTAS_URL', label: 'Koçtaş pazaryeri API adresi', req: true, hint: 'Koçtaş satıcı paneli (Mirakl) adresi, ör. https://koctas-prod.mirakl.net', pattern: '^https://[A-Za-z0-9.-]+\\.[A-Za-z]{2,}(/[^\\s]*)?$', patternMsg: 'https:// ile başlayan panel adresini girin (ör. https://koctas-prod.mirakl.net)' },
    { k: 'KOCTAS_API_KEY', label: 'API anahtarı', secret: true, req: true, hint: 'Satıcı paneli → sağ üst kullanıcı menüsü → API Anahtarı' },
    { k: 'KOCTAS_SHOP_ID', label: 'Mağaza ID', hint: 'birden fazla mağazanız varsa', adv: true },
  ],
  shopify: [
    { k: 'SHOPIFY_STORE', label: 'Mağaza adresi', req: true, hint: 'XXXX.myshopify.com → XXXX (ya da adresin tamamı)' },
    { k: 'SHOPIFY_TOKEN', label: 'Admin API erişim belirteci', secret: true, req: true, hint: 'Shopify yönetimi → Ayarlar → Uygulamalar → Uygulama geliştir → özel uygulama (izinler: ürünler, siparişler, stok, lokasyon okuma + yazma) → shpat_…' },
    { k: 'SHOPIFY_LOCATION_ID', label: 'Stok lokasyonu ID', hint: 'boşsa ilk lokasyon', adv: true },
  ],
  woocommerce: [
    { k: 'WOO_URL', label: 'Site adresi', req: true, hint: 'ör. https://magazaniz.com', pattern: '^https://[^\\s]+$', patternMsg: 'https:// ile başlayan site adresini girin' },
    { k: 'WOO_KEY', label: 'Consumer key', req: true, hint: 'WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle (Okuma/Yazma) → ck_…' },
    { k: 'WOO_SECRET', label: 'Consumer secret', secret: true, req: true, hint: 'cs_…' },
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
// Ek mağazanın bilgileri ana mağazayla aynı alan adlarıyla, kendi kaydında saklanır; Cloudflare değişkenleri ek mağazaya karışmaz.
// Test modülündeki kanallar: ana panelde bağlanıp denenir, müşteri panellerinde "Yakında" görünür (eklenemez, çalışmaz)
export const BETA_TYPES = ['amazon', 'ciceksepeti', 'koctas', 'shopify', 'woocommerce', 'opencart', 'etsy'];
export const TYPES = ['ikas', 'trendyol', 'hepsiburada', 'pttavm', 'n11', 'idefix', 'pazarama', ...BETA_TYPES];
export const TYPE_NAMES = { ikas: 'ikas', trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', pttavm: 'PttAVM', n11: 'N11', idefix: 'idefix', pazarama: 'Pazarama', amazon: 'Amazon', ciceksepeti: 'Çiçeksepeti', koctas: 'Koçtaş', shopify: 'Shopify', woocommerce: 'WooCommerce', opencart: 'OpenCart', etsy: 'Etsy' };
export const EXTRA_RE = new RegExp(`^(${TYPES.join('|')})_(\\d{1,3})$`);
export const isBeta = (id) => BETA_TYPES.includes(typeOf(id));
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
export async function addStore(db, type, { tenant = false } = {}) {
  if (!TYPES.includes(type)) fail(400, 'Bilinmeyen kanal türü');
  if (tenant && BETA_TYPES.includes(type)) fail(403, `${TYPE_NAMES[type]} yakında açılacak`);
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
export function effectiveEnv(env, cfg) {
  const out = { ...env };
  for (const [id, c] of Object.entries(cfg)) if (!isExtra(id)) for (const [k, v] of Object.entries(c.values || {})) if (v) out[k] = v;
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
  const r = await first(db, "SELECT (SELECT MAX(updated_at) FROM channel_config) AS v, (SELECT GROUP_CONCAT(v) FROM settings WHERE k LIKE 'verified:%') AS w, (SELECT v FROM settings WHERE k = 'hold_channels') AS h");
  return `${(r && r.v) || 0}|${(r && r.w) || ''}|${(r && r.h) || ''}`;
}
