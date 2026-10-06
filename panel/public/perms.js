// Personel yetkileri: yönetici her bölümü görür; personelin hangi bölümleri görebileceği kullanıcı başına seçilir.
// Her bölüm için iki düzey: "bolum" = görür ve işlem yapar, "bolum:view" = yalnız görür (sunucu değişiklik isteğini reddeder).
// Panel (menü, sayfalar) ve sunucu (API) aynı listeyi kullanır. Yetki listesi boş bırakılmış eski personel tüm bölümleri görür.
export const PERMS = [
  ['orders', 'Siparişler', 'sipariş listesi, işleme alma, paketleme'],
  ['cargo', 'Kargo ve etiket', 'kargo etiketi, barkod yazdırma'],
  ['returns', 'İadeler', 'iade taleplerini onaylama / reddetme'],
  ['questions', 'Müşteri soruları', 'soruları görme ve cevaplama'],
  ['products', 'Ürünler ve ürün yükleme', 'ürün kartları, pazaryerine ürün gönderme, buybox, kampanyalar'],
  ['stock', 'Stoklar', 'stok güncelleme ve kanallara gönderme'],
  ['match', 'Eşleştirme', 'ilan / ürün eşleştirme'],
  ['reports', 'Raporlar', 'analizler, müşteriler'],
  ['finance', 'Gelir, gider ve hakediş', 'kâr, kesintiler, faturalar, hakediş'],
];
export const PERM_KEYS = PERMS.map((p) => p[0]);
export const PERM_VALUES = PERM_KEYS.flatMap((k) => [k, k + ':view']);
// Hazır rol şablonları (formda seçilince yetkiler doldurulur; sonra tek tek değiştirilebilir)
export const ROLE_TEMPLATES = [
  ['depo', 'Depo / sevkiyat', ['orders', 'cargo', 'returns', 'stock', 'products:view']],
  ['musteri', 'Müşteri hizmetleri', ['orders:view', 'cargo:view', 'returns', 'questions']],
  ['katalog', 'Katalog / ürün sorumlusu', ['products', 'stock', 'match', 'orders:view']],
  ['muhasebe', 'Muhasebe', ['finance', 'reports', 'orders:view', 'returns:view']],
  ['satis', 'Satış / pazaryeri uzmanı', ['orders', 'cargo', 'returns', 'questions', 'products', 'stock', 'match', 'reports']],
  ['izleyici', 'Yalnız izleme (rapor)', ['orders:view', 'cargo:view', 'returns:view', 'products:view', 'stock:view', 'reports', 'finance:view']],
];

// API yolu → bölüm (sunucu tarafı denetim)
const MAP = [
  [/^(orders|orders-bulk|orders\.csv)(\/|$)/, 'orders'],
  [/^(packages|labels|picklist)(\/|$)/, 'cargo'],
  [/^products\/\d+\/stock$/, 'stock'],
  [/^claims(\/|$)/, 'returns'],
  [/^questions(\/|$)/, 'questions'],
  [/^(products|catalog|price-rules|buybox|campaigns|channel-products)(\/|\.csv$|$)/, 'products'],
  [/^(listings\/stock|push-stock)(\/|$)/, 'stock'],
  [/^(match|listings)(\/|$)/, 'match'],
  [/^(stats|insights|customers)(\/|$)/, 'reports'],
  [/^(finance|invoices|settlements)(\/|$)/, 'finance'],
];
export const sectionOf = (path) => (MAP.find(([re]) => re.test(path)) || [])[1] || null;
// Kullanıcı bu bölümü görebilir mi (yönetici her şeyi; yetkisi tanımlanmamış personel her bölümü).
// write = true: işlem yapabilir mi (yalnız görüntüleme yetkisi yetmez)
export const can = (user, key, write = false) => !key || !user || user.role === 'admin' || !Array.isArray(user.perms) || user.perms.includes(key) || (!write && user.perms.includes(key + ':view'));
export const viewOnly = (user, key) => can(user, key) && !can(user, key, true);
