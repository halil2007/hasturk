// Personel yetkileri: yönetici her bölümü görür; personelin hangi bölümleri görebileceği kullanıcı başına seçilir.
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

// API yolu → bölüm (sunucu tarafı denetim)
const MAP = [
  [/^(orders|orders-bulk|orders\.csv)(\/|$)/, 'orders'],
  [/^(packages|labels|picklist)(\/|$)/, 'cargo'],
  [/^products\/\d+\/stock$/, 'stock'],
  [/^claims(\/|$)/, 'returns'],
  [/^questions(\/|$)/, 'questions'],
  [/^(products|catalog|price-rules|buybox|campaigns)(\/|\.csv$|$)/, 'products'],
  [/^(listings\/stock|push-stock)(\/|$)/, 'stock'],
  [/^(match|listings)(\/|$)/, 'match'],
  [/^(stats|insights|customers)(\/|$)/, 'reports'],
  [/^(finance|invoices|settlements)(\/|$)/, 'finance'],
];
export const sectionOf = (path) => (MAP.find(([re]) => re.test(path)) || [])[1] || null;
// Kullanıcı bu bölümü görebilir mi (yönetici her şeyi; yetkisi tanımlanmamış personel her bölümü)
export const can = (user, key) => !key || !user || user.role === 'admin' || !Array.isArray(user.perms) || user.perms.includes(key);
