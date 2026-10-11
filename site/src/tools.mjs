// Ücretsiz hesaplama araçları (/araclar ve /araclar/<slug>): sayfa metinleri, rehber içerikleri, SSS ve hesaplayıcı formları.
// build.mjs + src/tools-pages.mjs sayfaları, üst menüdeki "Araçlar" listesini ve ana sayfa kartlarını buradan üretir; hesaplar
// tarayıcıda public/assets/tools.js ile yapılır (sunucu yok, giriş yok).
// Kural (panelle aynı): tüm tutarlar KDV DAHİL, yani cebinize giren / cebinizden çıkan haliyle girilir ve gösterilir; "KDV hariç kâr" gösterilmez.
// Komisyon oranı pazaryerlerinin listelediği gibi KDV hariç girilebilir: kesilen komisyon = oran × 1,20 (komisyon faturasına %20 KDV eklenir).
// Stopaj satışın KDV hariç tutarı üzerinden hesaplanır (panel/public/profit.js ile aynı formül).
// Kategori bazlı resmî oranlar src/commission.mjs → public/assets/komisyon-<pazaryeri>.json (yalnız resmî listeden; yoksa elle oran).
// Kanal örnek oranları resmî liste DEĞİLDİR: panelin başlangıç ayarlarıdır (panel/src/db.js → DEFAULT_SETTINGS.commission, KDV dahil);
// burada KDV hariç karşılıkları tutulur (24 → 20 + KDV). Yalnız sitede aktif görünen pazaryerleri listelenir (build.mjs süzer).
export const CHANNEL_RATES = { trendyol: 20, hepsiburada: 18, n11: 15, pttavm: 12, idefix: 15, pazarama: 15 };
export const WITHHOLDING = 1; // e-ticaret stopajı % (panel varsayılanı)
// Rehber metinlerinin son gözden geçirildiği tarih (sayfada "Son güncelleme" ve arama motoru verisinde dateModified)
export const UPDATED = '2026-10-11';
export const YEAR = UPDATED.slice(0, 4);

export const TOOL_GROUPS = [['genel', 'Genel hesaplayıcılar'], ['pazaryeri', 'Komisyon ve kâr']];

// ---------- örnek hesaplar (rehberdeki tablolar aynı formülle üretilir; elle yazılmış rakam yok) ----------
const m = (n) => `${n < 0 && Math.abs(n) >= 0.005 ? '−' : ''}${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
const pc = (n, d = 2) => `%${(Math.round(n * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: d })}`;
const nm = (n, d = 2) => n.toLocaleString('tr-TR', { maximumFractionDigits: d });
// basis: 'ex' = oran KDV hariç (×1,2), 'inc' = KDV dahil
export function br({ price, rate, basis = 'ex', ship = 0, fee = 0, wh = WITHHOLDING, vat = 20, cost = 0 }) {
  const eff = basis === 'ex' ? rate * 1.2 : rate, base = price / (1 + vat / 100);
  const com = (price * eff) / 100, whA = (base * wh) / 100, payout = price - com - ship - fee - whA, profit = payout - cost;
  return { eff, base, com, whA, payout, profit, margin: (profit / price) * 100, cut: price - payout };
}
const bdTable = (o, cap, x = br(o)) => ['table', { cap, head: ['Kalem', 'Tutar'], num: true, rows: [
  ['Satış fiyatı (KDV dahil)', m(o.price)],
  [`Komisyon (${o.basis === 'inc' ? pc(o.rate) : `${pc(o.rate)} + KDV = ${pc(x.eff)}`})`, m(-x.com)],
  ['Kargo', m(-(o.ship || 0))],
  ['Hizmet bedeli', m(-(o.fee || 0))],
  [`Stopaj (%${nm(o.wh ?? WITHHOLDING)} × ${m(x.base)} KDV hariç)`, m(-x.whA)],
  ['**Hakediş (hesabınıza geçen)**', `**${m(x.payout)}**`],
  ['Alış maliyeti', m(-(o.cost || 0))],
  ['**Net kâr**', `**${m(x.profit)}**`],
  ['Kâr marjı (satışa göre)', pc(x.margin)],
] }];
const rateTable = (o, rates, cap) => ['table', { cap, num: true, head: ['Resmî oran (KDV hariç)', 'Kesilen (KDV dahil)', 'Komisyon tutarı', 'Hakediş', 'Net kâr'],
  rows: rates.map((r) => { const x = br({ ...o, rate: r, basis: 'ex' }); return [pc(r), pc(x.eff), m(x.com), m(x.payout), m(x.profit)]; }) }];
const vatTable = ['table', { cap: 'KDV hariç orandan kesilen orana', num: true, head: ['Listede yazan (KDV hariç)', 'Komisyona eklenen KDV', 'Kesilen (KDV dahil)'],
  rows: [5, 10, 12, 15, 18, 20, 21.5, 25].map((r) => [pc(r), pc(r * 0.2), pc(r * 1.2)]) }];

// Ortak cümleler
const VAT_INCL = 'Tüm tutarları KDV dahil, yani faturada yazan ve cebinizden çıkan haliyle girin.';
const STOPAJ_P = '1 Ocak 2025\'ten bu yana pazaryerleri, satıcıya yaptıkları ödemeden **e-ticaret stopajı** keser ve satıcı adına vergi dairesine yatırır. Genel oran %1\'dir ve satışın **KDV hariç** tutarı üzerinden hesaplanır: %20 KDV\'li 1.200 ₺\'lik satışta matrah 1.000 ₺, stopaj 10 ₺\'dir. Kesilen tutar yıllık beyannamede ödenecek vergiden mahsup edilir; ancak hakedişten nakit olarak düştüğü için kâr ve nakit hesabında ayrı bir kalemdir.';
const AUTO_P = (mp, slug) => `Bu araç tek bir ürün için hesap yapar. [Hastürk CRM](/ozellikler/kar-zarar), ${mp} mağazanızı [resmî entegrasyonla](/entegrasyonlar/${slug}) bağladığınızda pazaryerinin kestiği komisyon, kargo ve hizmet bedeli kayıtlarını ve hakedişleri çeker; her siparişin net kârını alış maliyetinizle birlikte kendiliğinden hesaplar. Böylece kampanya, kargo ya da oran değişikliklerinin kârınıza etkisini sipariş sipariş görürsünüz.`;

// Pazaryeri komisyon rehberi (Trendyol / Hepsiburada / N11): her kanal kendi örneği ve kendi metniyle
function mpGuide(k) {
  const ex = { price: k.price, rate: k.rate, basis: 'ex', ship: k.ship, fee: k.fee, cost: k.cost }, x = br(ex);
  return (c) => [
    ['h2', `${k.name} komisyonu nasıl hesaplanır?`],
    ['p', k.intro],
    ['p', `Komisyon, siparişteki satış tutarı yani müşterinin ödediği **KDV dahil** fiyat üzerinden hesaplanır. ${k.name} oranı ${k.basisText}; komisyon faturasına %20 KDV eklendiği için cebinizden çıkan oran listedekinin 1,2 katıdır. Listede %${nm(k.rate)} görüyorsanız kesilen komisyon satış fiyatınızın ${pc(k.rate * 1.2)}'üdür.`],
    vatTable,
    c.data ? ['p', `Yukarıdaki hesaplayıcıda kategorinizi seçtiğinizde ${k.name}'${k.sx} yayımladığı resmî komisyon listesindeki oran (${c.data.basis === 'kdv-haric' ? 'KDV hariç' : 'KDV dahil'}) gelir ve KDV\'si eklenerek hesaplanır. Tüm kategorilerin listesi için [${k.name} komisyon oranları](/araclar/${k.slug}-komisyon-oranlari) sayfasına bakın. Mağazanıza özel bir anlaşma ya da dönemsel indirim varsa oranı elle değiştirebilirsiniz.`]
      : ['p', `Kategorinizin güncel oranını ${k.name} satıcı panelinizde ürün ya da kategori bazında görürsünüz. Hesaplayıcıya oranı panelde gördüğünüz gibi yazın ve "KDV hariç" seçili kalsın; araç %20 KDV'yi kendisi ekler.`],
    ['h2', `${k.name} hakedişinden düşülen kesintiler`],
    ['p', `Bir ${k.name} siparişinde satış fiyatının tamamı hesabınıza geçmez. Sipariş başına düşülen kalemler şunlardır:`],
    ['h3', 'Komisyon'],
    ['p', `Kategoriye göre değişen yüzdelik kesintidir ve en büyük kalemdir. Satış fiyatı arttıkça komisyon da aynı oranda artar; bu yüzden fiyatı "maliyet + kâr" diye belirlemek yetmez, komisyonu paydadan düşmek gerekir ([satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama)).`],
    ['h3', 'Kargo bedeli'],
    ['p', k.cargo],
    ['h3', k.feeTitle],
    ['p', k.feeText],
    ['h3', 'E-ticaret stopajı'],
    ['p', STOPAJ_P],
    ['note', `Reklam, iade kargosu, ceza ya da kampanya katılım bedeli gibi kesintiler her siparişte olmaz; dönem sonunda ayrıca faturalanır. Bu araç sipariş başı kesintileri hesaplar, dönemsel kesintileri kendi kârlılık hesabınızda ayrıca düşün.`],
    ['h2', `Örnek hesap: ${m(k.price).replace(',00', '')}'lik ${k.name} satışı`],
    ['p', `Ürünün satış fiyatı ${m(k.price)}, listede yazan komisyon %${nm(k.rate)} (KDV hariç), kargo ${m(k.ship)}, hizmet bedeli ${m(k.fee)}, ürün KDV'si %20 ve alış maliyeti ${m(k.cost)} olsun:`],
    bdTable(ex, `${k.name} örnek hesap (tutarlar örnektir)`),
    ['p', `Bu satışta toplam kesinti ${m(x.cut)}, yani satış fiyatının ${pc((x.cut / k.price) * 100)}'idir. Komisyonu KDV'siz %${nm(k.rate)} sanıp hesaplasaydınız kârınızı ${m((k.price * k.rate * 0.2) / 100)} fazla görürdünüz.`],
    ['h2', 'Komisyon oranı kârınızı ne kadar değiştirir?'],
    ['p', `Aynı ürünü farklı oranlı bir kategoride sattığınızda kâr hızla değişir. Yukarıdaki örnekte yalnız komisyon oranını değiştirince:`],
    rateTable(ex, k.rates, 'Komisyon oranına göre net kâr (diğer tutarlar sabit)'),
    ['p', 'Oran 5 puan arttığında kâr, satış fiyatının %6\'sı kadar azalır (5 puan + KDV). Doğru kategoride listelemek, en kolay kâr artışıdır: ürününüzün gerçekten ait olduğu kategoriyi seçin, benzer ürünlerin hangi kategoride listelendiğine bakın.'],
    ['h2', 'Sık yapılan hatalar'],
    ['ul', [
      `**Oranı KDV'siz hesaplamak.** ${k.name} listesindeki oran KDV hariçtir; kesilen tutar 1,2 katıdır.`,
      '**Stopajı KDV dahil tutardan hesaplamak.** Stopaj matrahı satışın KDV hariç tutarıdır.',
      '**Kargo ve hizmet bedelini KDV hariç girmek.** Faturada yazan, cebinizden çıkan KDV dahil tutarı girin.',
      '**Liste fiyatından hesaplamak.** Kendi karşıladığınız indirim ya da kupon varsa komisyon indirimli satış tutarından kesilir; kârı da indirimli fiyattan hesaplayın ([indirim sonrası kâr](/araclar/indirim-kar-hesaplama)).',
      '**Desiyi tahmin etmek.** Koli ölçüsündeki küçük bir fark kargo ücretini bir üst kademeye taşır ([desi hesaplama](/araclar/desi-hesaplama)).',
      '**İade ve reklamı yok saymak.** Tek siparişte kâr çıkan bir ürün, iade oranı ve reklam harcamasıyla dönem sonunda zarar ettirebilir.',
    ]],
    ['h2', 'Kârı artırmak için ipuçları'],
    ['ul', [
      'Fiyatı hedef kâr marjınızdan geriye doğru hesaplayın; komisyon, stopaj ve marjı paydadan düşen formül tek seferde doğru fiyatı verir.',
      'Kampanyaya girmeden önce indirimli fiyattaki kârı ve aynı toplam kâr için gereken satış artışını görün.',
      `Aynı ürünün ${k.name} ve diğer kanallardaki kârını [kâr karşılaştırma](/araclar/kar-karsilastirma) aracıyla yan yana koyun; fiyatı kanal kanal belirleyin.`,
      'Koli boyutunu ürüne göre seçin; desi düşerse kargo bedeli de düşer.',
      'Rakip fiyatlarını izliyorsanız alt fiyat sınırınızı başabaş fiyatın üstünde tutun ([buybox ve otomatik fiyat](/ozellikler/buybox-takibi)).',
    ]],
    ['h2', 'Her sipariş için otomatik kâr hesabı'],
    ['p', AUTO_P(k.name, k.int)],
  ];
}
const mpFaq = (k) => (c) => [
  [`${k.name} komisyon oranı ne kadar?`, c.data ? `Oran kategoriye göre değişir. Bu sayfada kategorinizi seçtiğinizde ${k.name}'${k.sx} resmî komisyon listesindeki oran gelir (liste tarihi: ${c.dateText}); tüm kategoriler ${k.name} komisyon oranları sayfasında. Mağazanıza özel oran varsa elle girebilirsiniz.` : `Oran kategoriye göre değişir ve ${k.name} satıcı panelinizde ürün ya da kategori bazında görünür. Hesaplayıcıya panelde gördüğünüz oranı yazın; araç KDV'sini ekleyip kesilen tutarı hesaplar.`],
  [`${k.name} komisyonu KDV dahil mi?`, `Hayır, ${k.name} oranı KDV hariç gösterir; komisyon faturasına %20 KDV eklenir. %${nm(k.rate)} oranın cebinizden çıkan karşılığı satış fiyatının ${pc(k.rate * 1.2)}'üdür. Araçta "KDV hariç" seçiliyken bu dönüşüm kendiliğinden yapılır.`],
  [`${k.name} komisyonu hangi fiyat üzerinden kesilir?`, 'Siparişteki satış tutarı, yani müşterinin ödediği KDV dahil fiyat üzerinden. Kendi karşıladığınız bir indirim varsa komisyon indirimli tutardan hesaplanır.'],
  [`${k.name} hakedişimden hangi kesintiler düşülür?`, `Sipariş başına komisyon, kargo bedeli (anlaşmalı kargoyla gönderiyorsanız), ${k.feeShort} ve e-ticaret stopajı. Reklam, iade kargosu ya da ceza gibi kesintiler varsa dönemsel olarak ayrıca düşülür.`],
  [`${k.name} stopajı nasıl hesaplanır?`, 'Satışın KDV hariç tutarının %1\'i olarak: %20 KDV\'li 1.200 ₺\'lik satışta 1.000 ₺ × %1 = 10 ₺. Kesilen stopaj yıllık beyannamede ödenecek vergiden mahsup edilir.'],
  ['Kargo ve hizmet bedelini nasıl girmeliyim?', 'Faturada yazan KDV dahil tutarla, yani cebinizden çıkan haliyle. Kargo bedeli desiye ve anlaşmaya göre değiştiği için kendi kargo faturanızdaki tutarı kullanın.'],
  [`Her ${k.name} siparişinin gerçek kârını otomatik görebilir miyim?`, `Evet. Hastürk CRM, ${k.name}'${k.sx2} kestiği komisyon, kargo ve hizmet bedeli kayıtlarını ve hakedişleri çeker; her siparişin net kârını panelde gösterir. 7 gün ücretsiz deneyebilirsiniz.`],
];
const MP_HOWTO = (n) => [
  ['Kategoriyi ya da oranı seçin', `Kategorinizi arayıp seçin ya da ${n} satıcı panelinizde gördüğünüz komisyon oranını yazın; oran KDV hariçse "KDV hariç" seçili kalsın.`],
  ['Satış fiyatını girin', 'Ürünün müşteriye görünen KDV dahil satış fiyatını yazın.'],
  ['Kargo, hizmet bedeli ve stopajı girin', 'Sipariş başı kargo ve hizmet bedelini faturadaki KDV dahil tutarla girin; stopaj %1 olarak gelir.'],
  ['Alış maliyetini ekleyin', 'Ürünün KDV dahil alış maliyetini yazın; net kâr ve marj hemen hesaplanır.'],
  ['Sonucu paylaşın', '"Bağlantıyı kopyala" ile hesabın bağlantısını alın ya da sayfayı yazdırın.'],
];

const MP = {
  trendyol: { name: 'Trendyol', slug: 'trendyol', int: 'trendyol', sx: 'un', sx2: 'un', price: 1000, rate: 20, ship: 65, fee: 10, cost: 450, rates: [10, 15, 20, 25],
    intro: 'Trendyol\'da mağaza açmak ücretsizdir; Trendyol gelirini her satıştan aldığı komisyonla elde eder. Komisyon oranı ürünün listelendiği kategoriye göre belirlenir: elektronik gibi düşük marjlı kategorilerde oran düşük, giyim, aksesuar ve kozmetik gibi kategorilerde daha yüksektir.',
    basisText: 'satıcı panelinde ve komisyon tarifelerinde KDV hariç gösterilir',
    cargo: 'Trendyol\'un anlaşmalı kargo firmalarıyla gönderdiğiniz siparişlerde kargo ücreti, paketin desisine ya da ağırlığına göre belirlenir ve hakedişinizden düşülür. Kendi kargo anlaşmanızla gönderiyorsanız ücreti kendi kargo faturanızdan alın. Araca sipariş başına ödediğiniz KDV dahil kargo tutarını girin.',
    feeTitle: 'Platform hizmet bedeli', feeShort: 'platform hizmet bedeli',
    feeText: 'Trendyol, komisyondan ayrı olarak sipariş başına sabit bir hizmet bedeli de keser. Tutar dönem dönem güncellendiği için güncel tutarı satıcı panelinizdeki duyurulardan ve faturalarınızdan kontrol edin; araca KDV dahil haliyle girin.' },
  hepsiburada: { name: 'Hepsiburada', slug: 'hepsiburada', int: 'hepsiburada', sx: 'nın', sx2: 'nın', price: 750, rate: 18, ship: 60, fee: 12, cost: 320, rates: [8, 12, 18, 22],
    intro: 'Hepsiburada\'da satıcılar her satıştan kategoriye göre belirlenen oranda komisyon öder. Oranlar kategori ve alt kategori kırılımında belirlenir; aynı ana kategorideki iki ürün farklı oranlara tabi olabilir. Yeni mağazalara dönemsel hoş geldin indirimleri de sunulabilir; koşulları Hepsiburada\'nın güncel duyurusundan kontrol edin.',
    basisText: 'kategori komisyon listesinde ve sipariş kayıtlarında KDV hariç ("+KDV") gösterilir',
    cargo: 'Hepsiburada\'nın anlaşmalı kargo seçenekleriyle gönderdiğiniz siparişlerde kargo ücreti desiye göre hesaplanıp hakedişinizden düşülür. Kendi anlaşmanızla gönderiyorsanız kendi kargo faturanızdaki tutarı kullanın. Araca sipariş başına KDV dahil kargo tutarını girin.',
    feeTitle: 'Hizmet ve işlem bedeli', feeShort: 'hizmet ve işlem bedeli',
    feeText: 'Hepsiburada, komisyonun yanında gönderi başına hizmet bedeli ve işlem bedeli de tahsil eder. Tutarlar dönemsel olarak güncellendiği için faturalarınızdaki güncel tutarları toplayıp araçtaki "Hizmet bedeli" alanına KDV dahil haliyle girin.' },
  n11: { name: 'N11', slug: 'n11', int: 'n11', sx: 'in', sx2: 'in', price: 1250, rate: 15, ship: 70, fee: 15, cost: 600, rates: [8, 12, 15, 20],
    intro: 'N11\'de satıcılar her satıştan, ürünün listelendiği kategoriye göre belirlenen oranda komisyon öder. Oranlar ana kategori ve alt kategori kırılımında değişir; elektronikte düşük, moda ve aksesuarda daha yüksek oranlar görülür.',
    basisText: 'satıcı panelinde KDV hariç gösterilir (faturanızda komisyon ve KDV ayrı satırlarda görünür)',
    cargo: 'N11\'in anlaşmalı kargosuyla gönderdiğiniz siparişlerde kargo ücreti desi ve anlaşmaya göre hakedişinizden düşülür; kendi kargo anlaşmanızla gönderiyorsanız ücreti kendi faturanızdan alın. Araca sipariş başına KDV dahil tutarı girin.',
    feeTitle: 'Hizmet bedelleri', feeShort: 'varsa hizmet bedelleri',
    feeText: 'N11 faturalarınızda komisyon dışında hizmet bedeli adıyla ek kalemler görebilirsiniz. Sipariş başına düşen bu tutarları KDV dahil haliyle araçtaki "Hizmet bedeli" alanına girin; dönemsel olanları ayrıca hesaplayın.' },
};

export const TOOLS = [
  {
    slug: 'trendyol-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', mp: 'trendyol', brand: ['T', '#f27a1a'], name: 'Trendyol komisyon', short: 'Kategori oranıyla net kâr ve hakediş',
    card: 'Trendyol satışınızda komisyon, kargo, platform hizmet bedeli ve stopaj sonrası hakedişinizi ve net kârınızı görün.',
    title: (c) => (c.data ? `Trendyol Komisyon Hesaplama ${YEAR}: Kategori Bazlı Oranlar` : `Trendyol Komisyon Hesaplama ${YEAR}: Net Kâr ve Hakediş`),
    desc: (c) => (c.data ? `Trendyol komisyon hesaplama: kategorinizi seçin, resmî orana KDV eklensin; kargo, hizmet bedeli ve %1 stopaj sonrası net kârınızı görün. Ücretsiz.` : `Trendyol komisyon hesaplama: komisyon oranına KDV eklenir; kargo, platform hizmet bedeli ve %1 stopaj sonrası hakedişinizi ve net kârınızı görün.`),
    h1: ['Trendyol Komisyon', 'Hesaplama'],
    lead: (c) => (c.data ? `Kategorinizi seçin; Trendyol'un resmî komisyon oranına KDV eklenerek kesinti, hakediş ve ürün başı net kârınız hesaplansın.` : 'Komisyon oranınızı panelde gördüğünüz gibi (KDV hariç) yazın; araç KDV\'yi ekleyip kargo, hizmet bedeli ve stopajla birlikte hakedişinizi ve net kârınızı hesaplasın.'),
    formula: ['Kesilen komisyon = Satış × Oran (KDV hariç) × 1,20 ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × %1', 'Hakediş = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj', 'Net kâr = Hakediş − Alış maliyeti'],
    guide: mpGuide(MP.trendyol), faq: mpFaq(MP.trendyol), howto: MP_HOWTO('Trendyol'),
    links: [['/entegrasyonlar/trendyol', 'Trendyol entegrasyonu', 'Sipariş, stok ve fiyat tek panelde'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Her siparişin net kârı otomatik'], ['/ozellikler/buybox-takibi', 'Buybox ve otomatik fiyat', 'Alt sınırın altına inmeden']],
    related: ['hepsiburada-komisyon-hesaplama', 'n11-komisyon-hesaplama', 'kar-karsilastirma', 'satis-fiyati-hesaplama', 'e-ticaret-stopaj-hesaplama', 'desi-hesaplama'],
  },
  {
    slug: 'hepsiburada-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', mp: 'hepsiburada', brand: ['hb', '#ff6000'], name: 'Hepsiburada komisyon', short: 'Kategori oranıyla net kâr ve hakediş',
    card: 'Hepsiburada satışınızda komisyon, kargo, hizmet ve işlem bedeli ile stopaj sonrası hakedişinizi ve net kârınızı görün.',
    title: (c) => (c.data ? `Hepsiburada Komisyon Hesaplama ${YEAR} – Kategori Bazlı Oranlar` : `Hepsiburada Komisyon Hesaplama ${YEAR}: Net Kâr ve Hakediş`),
    desc: (c) => (c.data ? `Hepsiburada komisyon hesaplama: kategorinizi seçin, resmî orana KDV eklensin; kargo, hizmet bedeli ve %1 stopaj sonrası net kârınızı görün.` : `Hepsiburada komisyon hesaplama: oranınıza KDV eklenir; kargo, hizmet ve işlem bedeli ile %1 stopaj sonrası hakedişinizi ve net kârınızı görün.`),
    h1: ['Hepsiburada Komisyon', 'Hesaplama'],
    lead: (c) => (c.data ? `Kategorinizi seçin; Hepsiburada'nın resmî komisyon oranına KDV eklenerek kesinti, hakediş ve ürün başı net kârınız hesaplansın.` : 'Hepsiburada\'nın "+KDV" olarak bildirdiği komisyon oranını yazın; araç KDV\'yi ekleyip kargo, hizmet bedeli ve stopajla birlikte hakedişinizi ve net kârınızı hesaplasın.'),
    formula: ['Kesilen komisyon = Satış × Oran (KDV hariç) × 1,20 ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × %1', 'Hakediş = Satış − Komisyon − Kargo − Hizmet ve işlem bedeli − Stopaj', 'Net kâr = Hakediş − Alış maliyeti'],
    guide: mpGuide(MP.hepsiburada), faq: mpFaq(MP.hepsiburada), howto: MP_HOWTO('Hepsiburada'),
    links: [['/entegrasyonlar/hepsiburada', 'Hepsiburada entegrasyonu', 'Sipariş, stok ve fiyat tek panelde'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Her siparişin net kârı otomatik'], ['/ozellikler/kargo-ve-etiket', 'Kargo ve etiket', 'Toplu ve termal etiket']],
    related: ['trendyol-komisyon-hesaplama', 'n11-komisyon-hesaplama', 'kar-karsilastirma', 'satis-fiyati-hesaplama', 'e-ticaret-stopaj-hesaplama', 'indirim-kar-hesaplama'],
  },
  {
    slug: 'n11-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', mp: 'n11', brand: ['n11', '#7b3fe4'], name: 'N11 komisyon', short: 'N11 satışında net kâr ve hakediş',
    card: 'N11 satışınızda komisyon, kargo, hizmet bedeli ve stopaj sonrası hesabınıza geçecek tutarı ve net kârınızı görün.',
    title: (c) => (c.data ? `N11 Komisyon Hesaplama ${YEAR} – Kategori Bazlı Resmî Oranlar` : `N11 Komisyon Hesaplama ${YEAR}: Net Kâr ve Hakediş`),
    desc: () => 'N11 komisyon hesaplama: komisyon oranınıza KDV eklenir; kargo, hizmet bedeli ve %1 stopaj sonrası hakedişinizi ve ürün başı net kârınızı görün. Ücretsiz.',
    h1: ['N11 Komisyon', 'Hesaplama'],
    lead: 'N11 satıcı panelinizdeki komisyon oranını yazın; araç KDV\'yi ekleyip kargo, hizmet bedeli ve stopajla birlikte hesabınıza geçecek tutarı ve net kârınızı hesaplasın.',
    formula: ['Kesilen komisyon = Satış × Oran (KDV hariç) × 1,20 ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × %1', 'Hakediş = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj', 'Net kâr = Hakediş − Alış maliyeti'],
    guide: mpGuide(MP.n11), faq: mpFaq(MP.n11), howto: MP_HOWTO('N11'),
    links: [['/entegrasyonlar/n11', 'N11 entegrasyonu', 'Sipariş, stok ve fiyat tek panelde'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Her siparişin net kârı otomatik'], ['/ozellikler/stok-senkronizasyonu', 'Stok senkronizasyonu', 'Bir kanalda satılan her yerde düşer']],
    related: ['trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'kar-karsilastirma', 'pazaryeri-komisyon-hesaplama', 'satis-fiyati-hesaplama', 'desi-hesaplama'],
  },
  {
    slug: 'pazaryeri-komisyon-hesaplama', group: 'pazaryeri', calc: 'komisyon', icon: 'i-store', color: 'c-blue', name: 'Pazaryeri komisyon', short: 'Tüm kanallar: kesintiler sonrası hakediş',
    card: 'PttAVM, idefix, Pazarama ve diğer kanallar için komisyon, kargo, hizmet bedeli ve stopaj sonrası net hakedişinizi bulun.',
    title: `Pazaryeri Komisyon Hesaplama ${YEAR}: Net Hakediş ve Kâr`,
    desc: 'Pazaryeri komisyon hesaplama: Trendyol, Hepsiburada, N11, PttAVM, idefix ve Pazarama için komisyon, kargo ve %1 stopaj sonrası net kârınızı bulun.',
    h1: ['Pazaryeri Komisyon', 'Hesaplama'], lead: 'Pazaryerini seçin, oranınızı girin: komisyon (KDV\'siyle), kargo, hizmet bedeli ve stopaj düşülünce hesabınıza ne geçeceğini ve ürün başı net kârınızı görün.',
    formula: ['Kesilen komisyon = Satış × Oran × (KDV hariç oranda 1,20) ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × Stopaj %', 'Hakediş = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj', 'Net kâr = Hakediş − Alış maliyeti'],
    guide: () => {
      const ex = { price: 900, rate: 12, basis: 'ex', ship: 55, fee: 8, cost: 400 }, x = br(ex);
      return [
        ['h2', 'Pazaryeri komisyonu nedir?'],
        ['p', 'Pazaryeri komisyonu, ürününüzü kendi platformunda satan pazaryerinin her satıştan aldığı paydır. Mağaza açmak çoğu pazaryerinde ücretsizdir; pazaryeri gelirini satış başına komisyon ve sipariş başı hizmet bedelleriyle elde eder. Oran kanala, kategoriye ve zaman zaman kampanya dönemine göre değişir.'],
        ['p', 'Komisyon siparişteki satış tutarı (müşterinin ödediği KDV dahil fiyat) üzerinden hesaplanır. Pazaryerlerinin çoğu oranı **KDV hariç** ilan eder ve komisyon faturasına %20 KDV ekler; bu yüzden %15 olarak gördüğünüz oran, cebinizden çıkan haliyle satış fiyatının %18\'idir. Araçta oran türünü "KDV hariç" seçerseniz bu dönüşüm kendiliğinden yapılır.'],
        vatTable,
        ['h2', 'Hakedişten düşülen kalemler'],
        ['ol', [
          '**Komisyon:** kategoriye göre yüzdelik kesinti, KDV\'siyle birlikte.',
          '**Kargo:** pazaryerinin anlaşmalı kargosuyla gönderimde desiye göre kesilen ücret; kendi anlaşmanızla gönderiyorsanız kendi kargo faturanız.',
          '**Hizmet / işlem bedeli:** bazı pazaryerlerinin sipariş ya da gönderi başına aldığı sabit bedel.',
          '**E-ticaret stopajı:** satışın KDV hariç tutarının %1\'i.',
        ]],
        ['p', STOPAJ_P],
        ['h2', 'Örnek hesap'],
        ['p', `${m(ex.price)}'lik bir ürün, %${nm(ex.rate)} + KDV komisyon, ${m(ex.ship)} kargo, ${m(ex.fee)} hizmet bedeli ve ${m(ex.cost)} alış maliyetiyle:`],
        bdTable(ex, 'Örnek pazaryeri satışı (tutarlar örnektir)'),
        ['p', `Toplam kesinti ${m(x.cut)}, satış fiyatının ${pc((x.cut / ex.price) * 100)}'i. Kâr marjı ${pc(x.margin)}.`],
        ['h2', 'Kanal kanal oran nereden öğrenilir?'],
        ['p', 'Her pazaryeri kategori komisyonlarını kendi satıcı panelinde ya da satıcı yardım merkezinde yayımlar. Trendyol, Hepsiburada ve N11 için ayrıntılı rehberli sayfalarımız var: [Trendyol komisyon hesaplama](/araclar/trendyol-komisyon-hesaplama), [Hepsiburada komisyon hesaplama](/araclar/hepsiburada-komisyon-hesaplama), [N11 komisyon hesaplama](/araclar/n11-komisyon-hesaplama). PttAVM, idefix, Pazarama ve diğer kanallarda oranı satıcı panelinizden alıp bu sayfada hesaplayın.'],
        ['note', 'Aracı açınca seçili gelen kanal oranları resmî liste değil, örnek başlangıç değerleridir (Hastürk CRM panelinin başlangıç ayarları). Kendi kategorinizin oranını yazın.'],
        ['h2', 'Sık yapılan hatalar'],
        ['ul', [
          '**KDV\'yi unutmak:** KDV hariç ilan edilen oranı olduğu gibi kullanmak kârı olduğundan yüksek gösterir.',
          '**Stopajı yanlış matrahla hesaplamak:** stopaj KDV dahil değil, KDV hariç satış tutarı üzerinden kesilir.',
          '**Sabit giderleri yüzde sanmak:** kargo ve hizmet bedeli fiyattan bağımsızdır; ucuz üründe kârın büyük kısmını yer.',
          '**Tek siparişe bakıp karar vermek:** iade oranı, reklam ve kampanya katılım bedelleri dönem kârını değiştirir.',
        ]],
        ['h2', 'Hangi kanal daha kârlı?'],
        ['p', 'Aynı ürünün kanallardaki kârını yan yana görmek için [pazaryeri kâr karşılaştırma](/araclar/kar-karsilastirma) aracını kullanın. Fiyatı hedef marjdan belirlemek için [satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama), kampanya kararları için [indirim sonrası kâr](/araclar/indirim-kar-hesaplama) aracına bakın.'],
        ['p', 'Tüm kanallarınızı [tek panelde bağladığınızda](/entegrasyonlar) Hastürk CRM her siparişin komisyonunu, kargosunu ve hizmet bedelini pazaryerinin kayıtlarından çeker; [sipariş başı net kârı](/ozellikler/kar-zarar) kendiliğinden hesaplar.'],
      ];
    },
    faq: [
      ['Pazaryeri komisyonu KDV dahil mi?', 'Pazaryerlerinin çoğu oranı KDV hariç ilan eder, komisyon faturasına %20 KDV ekler. %15 komisyon, KDV\'siyle satış fiyatınızın %18\'idir. Araçta oran türünü "KDV hariç" seçin; hesap KDV dahil tutarla yapılır.'],
      ['Hakediş nedir?', 'Hakediş, pazaryerinin satış tutarından komisyon, kargo, hizmet bedeli ve stopaj gibi kesintileri düştükten sonra size ödediği tutardır. Ödeme günü pazaryerine ve vadenize göre değişir.'],
      ['Komisyon oranları neden kanala göre değişiyor?', 'Her pazaryeri kategori bazında kendi oranını belirler. Bu sayfada kanal seçince gelen oranlar örnek başlangıç değerleridir; satıcı panelinizdeki oranı girin.'],
      ['Stopaj hangi tutardan kesilir?', 'Satışın KDV hariç tutarından. %20 KDV\'li 1.200 ₺\'lik satışta matrah 1.000 ₺, %1 stopaj 10 ₺\'dir.'],
      ['Reklam ve iade kesintileri hesaba katılıyor mu?', 'Hayır. Araç sipariş başı kesintileri hesaplar. Reklam, ceza ve iade gibi dönemsel kesintileri Hastürk CRM\'in gelir ve gider ekranı dönem bazında ayrıca gösterir.'],
      ['Hesabı başkasıyla paylaşabilir miyim?', 'Evet. "Bağlantıyı kopyala" düğmesi girdiğiniz değerleri bağlantıya ekler; bağlantıyı açan kişi aynı hesabı görür. Değerler sunucuya kaydedilmez, yalnız bağlantıda bulunur.'],
    ],
    howto: MP_HOWTO('ilgili pazaryerinin'),
    links: [['/entegrasyonlar', 'Tüm entegrasyonlar', 'Pazaryerleri ve e-ticaret siteleri'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Her siparişin net kârı otomatik'], ['/ozellikler/raporlar', 'Raporlar', 'Kanal kanal satış ve kâr']],
    related: ['kar-karsilastirma', 'trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'n11-komisyon-hesaplama', 'satis-fiyati-hesaplama', 'e-ticaret-stopaj-hesaplama'],
  },
  {
    slug: 'kar-karsilastirma', group: 'pazaryeri', calc: 'karsilastir', icon: 'i-scale', color: 'c-green', name: 'Kâr karşılaştırma', short: 'Aynı ürün, kanal kanal net kâr',
    card: 'Aynı ürünün pazaryerlerindeki net kârını yan yana görün; komisyon, kargo ve hizmet bedelini kanal başına değiştirin.',
    title: 'Pazaryeri Kâr Karşılaştırma: Hangi Kanal Daha Kârlı?',
    desc: 'Aynı ürünün Trendyol, Hepsiburada, N11, PttAVM, idefix ve Pazarama\'daki net kârını yan yana görün. Komisyon, kargo ve hizmet bedelini kanal başına girin.',
    h1: ['Pazaryeri Kâr', 'Karşılaştırma'], lead: 'Satış fiyatını ve alış maliyetini bir kez girin; her pazaryerinde ne kadar kâr bıraktığını yan yana görün. Komisyon, kargo ve hizmet bedelini kanal kanal değiştirebilirsiniz.',
    formula: ['Kesilen komisyon = Satış × Oran (KDV hariç) × 1,20 ÷ 100', 'Stopaj = Satış ÷ (1 + KDV %) × Stopaj %', 'Kanal kârı = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj − Alış', 'Marj = Kâr ÷ Satış × 100'],
    guide: () => {
      const base = { price: 1000, ship: 65, fee: 10, cost: 450 };
      const rows = [['A kanalı', 20, 65, 10], ['B kanalı', 15, 70, 15], ['C kanalı', 12, 80, 0]].map(([n, r, s, f]) => { const x = br({ ...base, rate: r, ship: s, fee: f }); return [n, `${pc(r)} + KDV`, m(s), m(f), m(x.payout), `**${m(x.profit)}**`]; });
      return [
        ['h2', 'Aynı ürün neden her kanalda farklı kâr bırakır?'],
        ['p', 'Pazaryerleri komisyonu kategori bazında kendileri belirler; kargo anlaşmaları ve sipariş başı hizmet bedelleri de kanaldan kanala değişir. Aynı ürünü aynı fiyata sattığınızda bile bir kanalda iyi kâr ederken diğerinde başabaş noktasına yaklaşabilirsiniz. Bu araç farkı tek ekranda gösterir.'],
        ['h2', 'Örnek: üç kanalda aynı ürün'],
        ['p', `${m(base.price)}'lik, alışı ${m(base.cost)} olan bir ürünün üç farklı kanaldaki kârı (oranlar ve tutarlar örnektir):`],
        ['table', { cap: 'Kanal kanal kâr (örnek değerler)', num: true, head: ['Kanal', 'Komisyon', 'Kargo', 'Hizmet bedeli', 'Hakediş', 'Net kâr'], rows }],
        ['p', 'Komisyonu en düşük kanal her zaman en kârlı kanal değildir: kargo ve hizmet bedeli sabit tutarlar olduğu için düşük fiyatlı ürünlerde farkı onlar belirler. Yüksek fiyatlı ürünlerde ise komisyon oranındaki birkaç puanlık fark öne çıkar.'],
        ['h2', 'Karşılaştırmayı nasıl yorumlamalı?'],
        ['ul', [
          '**Kanal başına fiyat:** Zorunlu değilse her kanalda aynı fiyatı kullanmayın; düşük kâr bırakan kanalda fiyatı hedef marja göre ayarlayın ([satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama)).',
          '**Hacim ve kâr birlikte:** Ürün başı kârı düşük ama çok satan bir kanal toplamda daha çok kazandırabilir; satış adedini de hesaba katın.',
          '**Dönemsel kesintiler:** Reklam, iade ve kampanya katılım bedelleri kanala göre değişir; dönem sonu kârlılığınızı kanal kanal izleyin ([raporlar](/ozellikler/raporlar)).',
          '**Stok paylaşımı:** Aynı stoğu birden çok kanalda satıyorsanız stokların eşit kalması fazla satışı önler ([stok senkronizasyonu](/ozellikler/stok-senkronizasyonu)).',
        ]],
        ['h2', 'Oranları nereden alırım?'],
        ['p', 'Kartlarda gelen oranlar örnek başlangıç değerleridir (KDV hariç; Hastürk CRM panelinin başlangıç ayarlarıyla aynı). Her kanalın kendi kategoriniz için uyguladığı oranı satıcı panelinizden alıp karta yazın. Kanal ayrıntıları için [Trendyol](/araclar/trendyol-komisyon-hesaplama), [Hepsiburada](/araclar/hepsiburada-komisyon-hesaplama) ve [N11](/araclar/n11-komisyon-hesaplama) komisyon sayfalarına bakın.'],
        ['h2', 'Gerçek kârı sipariş sipariş görün'],
        ['p', 'Hastürk CRM tüm kanallarınızın siparişlerini tek listede toplar; pazaryerinin kestiği komisyon, kargo ve hizmet bedelleriyle her siparişin [net kârını](/ozellikler/kar-zarar) gösterir. Hangi kanalın gerçekten kazandırdığını tahminle değil, kendi siparişlerinizle görürsünüz.'],
      ];
    },
    faq: [
      ['Aynı ürünü her kanalda aynı fiyata mı satmalıyım?', 'Zorunlu değil. Komisyon ve kargo farkları yüzünden aynı fiyat her kanalda farklı kâr bırakır. Bu araçla kanal başına kârı görüp fiyatınızı buna göre belirleyebilirsiniz.'],
      ['Kanal oranları neden örnek?', 'Pazaryerleri oranları kategoriye göre belirler. Kartlardaki değerler Hastürk CRM panelinin başlangıç ayarlarıdır; satıcı panelinizdeki oranları girin.'],
      ['Oranları KDV dahil mi girmeliyim?', 'Kartlardaki oranlar KDV hariçtir; araç %20 KDV\'yi kendisi ekler. Kargo ve hizmet bedelini ise faturadaki KDV dahil tutarla girin.'],
      ['Bir kanalı karşılaştırmadan çıkarabilir miyim?', 'Evet. Kartın başlığındaki işareti kaldırın; o kanal en kârlı kanal hesabına girmez.'],
      ['Reklam ve iade maliyetleri hesaba katılıyor mu?', 'Hayır. Karşılaştırma sipariş başı komisyon, kargo, hizmet bedeli ve stopajla yapılır. Reklam, ceza ve iade gibi dönemsel kesintileri Hastürk CRM\'in gelir ve gider ekranı ayrıca gösterir.'],
    ],
    howto: [['Ürünü girin', 'Satış fiyatını, alış maliyetini ve ürünün KDV oranını yazın.'], ['Kanalları düzenleyin', 'Her kanal kartına kendi komisyon oranınızı (KDV hariç), kargo ve hizmet bedelinizi yazın.'], ['Sonucu okuyun', 'En kârlı kanal üstte gösterilir; zarar eden kanal kırmızı işaretlenir.']],
    links: [['/entegrasyonlar', 'Tüm entegrasyonlar', 'Kanallarınız tek panelde'], ['/ozellikler/raporlar', 'Raporlar', 'Kanal kanal satış ve kâr'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Her siparişin net kârı otomatik']],
    related: ['pazaryeri-komisyon-hesaplama', 'trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'satis-fiyati-hesaplama', 'indirim-kar-hesaplama', 'n11-komisyon-hesaplama'],
  },
  {
    slug: 'satis-fiyati-hesaplama', group: 'genel', calc: 'satis', icon: 'i-tag', color: 'c-purple', name: 'Satış fiyatı belirleme', short: 'Maliyet + kesintiler + hedef kâr',
    card: 'Alış, komisyon, kargo, hizmet bedeli ve stopajla hedef kârınıza göre satış fiyatını bulun; ya da fiyattan kârı görün.',
    title: 'Satış Fiyatı Hesaplama: Komisyon ve Kargo Dahil Fiyat',
    desc: 'Satış fiyatı hesaplama: alış maliyeti, pazaryeri komisyonu, kargo, hizmet bedeli ve stopajla hedef kâr marjınıza göre doğru satış fiyatını bulun.',
    h1: ['Satış Fiyatı', 'Hesaplama'], lead: 'Maliyetinizi ve kesintileri girin, hedef kârınıza göre satış fiyatını bulun. Ters yönde de çalışır: fiyatınızı girin, birim kârınızı, marjınızı ve başabaş fiyatınızı görün.',
    formula: ['Satış fiyatı = (Alış + Kargo + Hizmet bedeli + Hedef kâr ₺) ÷ (1 − Kesilen komisyon % − Stopaj % ÷ (1 + KDV %) − Hedef marj %)', 'Net kâr = Satış − Komisyon − Kargo − Hizmet bedeli − Stopaj − Alış', 'Kâr marjı = Net kâr ÷ Satış × 100 · Kâr oranı (markup) = Net kâr ÷ Alış × 100'],
    guide: () => {
      const k = { cost: 450, rate: 15, ship: 65, fee: 10 }, c = k.rate * 1.2 / 100, w = 0.01 / 1.2;
      const price = (mg) => (k.cost + k.ship + k.fee) / (1 - c - w - mg / 100);
      const wrong = k.cost * 1.2 + k.ship + k.fee, wx = br({ price: wrong, rate: k.rate, ship: k.ship, fee: k.fee, cost: k.cost });
      return [
        ['h2', 'Satış fiyatı nasıl belirlenir?'],
        ['p', 'Pazaryerinde doğru fiyatı bulmanın zorluğu, kesintilerin bir kısmının **fiyata bağlı** olmasıdır. Komisyon ve stopaj satış fiyatının yüzdesidir: fiyatı yükselttikçe onlar da büyür. Alış maliyeti, kargo ve hizmet bedeli ise **sabittir**. Bu yüzden "maliyetin üstüne %20 ekle" yöntemi beklenen kârı vermez.'],
        ['p', 'Doğru yöntem, yüzdelik kesintileri ve hedef marjınızı paydada toplamaktır: sabit giderlerin toplamı, satış fiyatının kesintilerden ve kârdan arta kalan payına bölünür. Araç bu hesabı sizin yerinize yapar.'],
        ['h2', 'Neden "maliyet + %20" yanlış sonuç verir?'],
        ['p', `Alış ${m(k.cost)}, komisyon %${k.rate} + KDV, kargo ${m(k.ship)}, hizmet bedeli ${m(k.fee)} olsun. Alışa %20 ekleyip kargo ve hizmet bedelini üstüne koyarsanız fiyat ${m(wrong)} olur. Bu fiyatta komisyon ve stopaj düşülünce net kâr ${m(wx.profit)}, marj ${pc(wx.margin)} çıkar; beklediğiniz %20 değil.`],
        ['h2', 'Hedef marja göre fiyat tablosu'],
        ['p', 'Aynı ürün için farklı hedef marjlarda bulunması gereken satış fiyatı (komisyon %15 + KDV, stopaj %1, ürün KDV\'si %20):'],
        ['table', { cap: 'Hedef kâr marjına göre satış fiyatı (örnek)', num: true, head: ['Hedef marj', 'Satış fiyatı', 'Net kâr', 'Kâr oranı (alışa göre)'],
          rows: [0, 10, 15, 20, 25, 30].map((mg) => { const P = price(mg), x = br({ price: P, rate: k.rate, ship: k.ship, fee: k.fee, cost: k.cost }); return [mg ? pc(mg) : 'Başabaş (%0)', m(P), m(x.profit), pc((x.profit / k.cost) * 100)]; }) }],
        ['p', 'Marj arttıkça fiyat doğrusal değil, hızlanarak artar; çünkü payda küçülür. Komisyon, stopaj ve hedef marj toplamı %100\'e yaklaştığında hiçbir fiyat hedefi karşılamaz; araç bu durumda "Bu hedefe ulaşılamaz" der.'],
        ['h2', 'Kâr marjı mı, kâr oranı mı?'],
        ['p', '**Kâr marjı** kârın satış fiyatına, **kâr oranı (markup)** kârın alış maliyetine oranıdır. %20 marj, %20 markup ile aynı şey değildir: yukarıdaki tabloda %20 marj alışa göre çok daha yüksek bir kâr oranına denk gelir. Pazaryeri raporları ve kampanya hesapları genellikle satışa göre marjla çalışır; araç ikisini de gösterir.'],
        ['h2', 'Başabaş fiyatı'],
        ['p', 'Başabaş fiyat, kârın sıfır olduğu fiyattır. Rakip fiyat takibi yapıyorsanız alt fiyat sınırınızı bunun altına indirmeyin; kampanya indirimini de bu fiyata göre sınırlayın ([indirim sonrası kâr](/araclar/indirim-kar-hesaplama)).'],
        ['h2', 'İpuçları'],
        ['ul', [
          'Tutarları KDV dahil girin: alış faturası, kargo ve hizmet bedeli cebinizden çıkan haliyle.',
          'Komisyon oranını kategorinize göre alın: [Trendyol](/araclar/trendyol-komisyon-hesaplama), [Hepsiburada](/araclar/hepsiburada-komisyon-hesaplama), [N11](/araclar/n11-komisyon-hesaplama).',
          'Desiyi doğru hesaplayın; kargo sabit gider olduğu için ucuz ürünlerde fiyatı en çok o belirler ([desi hesaplama](/araclar/desi-hesaplama)).',
          'İade oranı yüksek ürünlerde hedef marjı biraz yüksek tutun; iade kargosu ve iade edilen ürünün maliyeti kârdan düşer.',
          'Kur ile değişen alış maliyetlerinde fiyatı dövize bağlamak kârı korur ([döviz ile fiyat](/ozellikler/doviz-endeksli-fiyat)).',
        ]],
      ];
    },
    faq: [
      ['Kâr marjı ile kâr oranı (markup) arasındaki fark nedir?', 'Kâr marjı kârın satış fiyatına, markup ise alış maliyetine oranıdır. 1.000 ₺\'ye sattığınız, 450 ₺\'ye aldığınız üründe 200 ₺ kâr %20 marj, yaklaşık %44 markup demektir.'],
      ['Neden maliyetin üstüne yüzde eklemek yetmiyor?', 'Komisyon ve stopaj satış fiyatının yüzdesidir; fiyat yükseldikçe onlar da artar. Doğru fiyat için yüzdelik kesintiler ve hedef marj paydadan düşülür; araç bu formülü kullanır.'],
      ['Hesap neden KDV dahil tutarlarla yapılıyor?', 'Satış fiyatınız ile komisyon, kargo ve hizmet bedeli faturaları KDV dahildir; hakedişiniz de bunlardan oluşur. Araç cebinize giren ve çıkan tutarları gösterir. Dönem sonu ödeyeceğiniz KDV için mali müşavirinize danışın.'],
      ['Komisyon oranımı nereden öğrenirim?', 'Pazaryerinin satıcı panelinde kategori ya da ürün bazında görünür. Oran KDV hariç ise araçta "KDV hariç" seçili kalsın; %20 KDV kendiliğinden eklenir.'],
      ['"Bu hedefe ulaşılamaz" ne demek?', 'Komisyon, stopaj ve hedef marjın toplamı %100\'e ulaşırsa hiçbir fiyat hedefi karşılamaz: fiyat arttıkça kesinti de aynı oranda artar. Hedef marjı düşürün ya da kesintileri gözden geçirin.'],
      ['Hedefi tutar olarak verebilir miyim?', 'Evet. Hedef alanının yanındaki seçimi "₺ kâr" yapın; araç ürün başı istediğiniz tutarda kâr bırakan fiyatı bulur.'],
    ],
    howto: [['Hesap yönünü seçin', '"Hedef kârdan fiyat bul" ya da "Fiyattan kâr bul".'], ['Maliyeti ve hedefi girin', 'Alış maliyetini ve hedef marjı (%) ya da hedef kârı (₺) yazın.'], ['Kesintileri girin', 'Komisyon oranını (KDV hariç), kargo, hizmet bedeli ve stopajı girin.'], ['Fiyatı okuyun', 'Önerilen satış fiyatı, net kâr, marj ve başabaş fiyatı hemen görünür.']],
    links: [['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Her siparişin net kârı otomatik'], ['/ozellikler/buybox-takibi', 'Buybox ve otomatik fiyat', 'Alt sınırın altına inmeden'], ['/ozellikler/doviz-endeksli-fiyat', 'Döviz ile fiyat', 'Kurla otomatik TL']],
    related: ['pazaryeri-komisyon-hesaplama', 'kar-karsilastirma', 'indirim-kar-hesaplama', 'trendyol-komisyon-hesaplama', 'kdv-hesaplama', 'desi-hesaplama'],
  },
  {
    slug: 'indirim-kar-hesaplama', group: 'pazaryeri', calc: 'indirim', icon: 'i-discount', color: 'c-orange', name: 'İndirim sonrası kâr', short: 'Kampanyada kâr ve başabaş indirim',
    card: 'İndirim ya da kampanya sonrası kârınızı, zarar etmeden yapabileceğiniz en yüksek indirimi ve gereken satış artışını görün.',
    title: 'İndirim Sonrası Kâr Hesaplama: Kampanya Kârlı mı?',
    desc: 'İndirim sonrası kâr hesaplama: kampanyada ürün başı kârınızı, zarar etmeden yapabileceğiniz en yüksek indirimi ve gereken satış artışını görün.',
    h1: ['İndirim Sonrası', 'Kâr Hesaplama'], lead: 'Kampanyaya girmeden önce hesaplayın: indirimli fiyatta ürün başı ne kalır, en fazla ne kadar indirim yapılabilir ve aynı toplam kâr için ne kadar fazla satmanız gerekir?',
    formula: ['İndirimli fiyat = Fiyat × (1 − İndirim % ÷ 100)', 'Başabaş fiyat = (Alış + Kargo + Hizmet bedeli) ÷ (1 − Kesilen komisyon % − Stopaj % ÷ (1 + KDV %))', 'En fazla indirim = 1 − Başabaş fiyat ÷ Fiyat', 'Gereken satış artışı = İndirimsiz kâr ÷ İndirimli kâr − 1'],
    guide: () => {
      const k = { price: 1000, rate: 15, ship: 65, fee: 10, cost: 450 }, a = br(k);
      const rows = [5, 10, 15, 20, 25, 30].map((d) => { const x = br({ ...k, price: k.price * (1 - d / 100) }); return [pc(d), m(k.price * (1 - d / 100)), m(x.profit), pc(((x.profit - a.profit) / a.profit) * 100), x.profit > 0 ? pc((a.profit / x.profit - 1) * 100, 1) : 'Zarar']; });
      return [
        ['h2', 'İndirim kârı neden orantısız azaltır?'],
        ['p', 'İndirim satış fiyatından düşer ama alış maliyeti, kargo ve hizmet bedeli aynı kalır. Komisyon ve stopaj fiyatla birlikte biraz azalsa da kârın kaybı indirim oranından çok daha büyüktür. Kampanyaya katılmadan önce bu kaybın satış artışıyla telafi edilip edilemeyeceğini hesaplamak gerekir.'],
        ['h2', 'İndirim tablosu'],
        ['p', `${m(k.price)}'lik, alışı ${m(k.cost)} olan ürün (komisyon %15 + KDV, kargo ${m(k.ship)}, hizmet bedeli ${m(k.fee)}). İndirimsiz net kâr ${m(a.profit)}:`],
        ['table', { cap: 'İndirim oranına göre kâr ve gereken satış artışı (örnek)', num: true, head: ['İndirim', 'İndirimli fiyat', 'Ürün başı kâr', 'Kârdaki değişim', 'Aynı toplam kâr için satış artışı'], rows }],
        ['p', 'Tablo şunu söyler: %10 indirimde aynı toplam kârı korumak için satış adedinin belirgin biçimde artması gerekir; indirim büyüdükçe gereken artış katlanır. İndirim başabaş noktasını geçerse her satış zarar ettirir.'],
        ['h2', 'Başabaş indirimi ve alt fiyat sınırı'],
        ['p', '**Başabaş indirimi**, ürün başı kârı sıfıra indiren indirim oranıdır. Kampanya teklifi bu oranın üstündeyse kampanya yalnızca görünürlük ya da stok eritme amacıyla anlamlıdır. Otomatik fiyatlandırma kullanıyorsanız alt fiyat sınırınızı başabaş fiyatın üstünde tutun ([buybox ve otomatik fiyat](/ozellikler/buybox-takibi)).'],
        ['h2', 'Pazaryeri indirimin bir kısmını karşılıyorsa'],
        ['p', 'Bazı kampanyalarda indirimin bir bölümünü pazaryeri üstlenir. Bu durumda araca yalnız sizin karşıladığınız indirim oranını girin. Örneğin %20\'lik kampanyanın %5\'i pazaryerinden geliyorsa %15 yazın. Kampanyada komisyon oranı değişiyorsa komisyon alanını da kampanya oranıyla güncelleyin.'],
        ['h2', 'Kampanya kararı için kontrol listesi'],
        ['ol', [
          'İndirimli fiyattaki ürün başı kârı ve marjı hesaplayın.',
          'Aynı toplam kâr için gereken satış artışını, ürünün geçmiş kampanya performansıyla karşılaştırın.',
          'Stoğunuzun artan talebi karşılayıp karşılamayacağını kontrol edin.',
          'Kargo bedelinin indirimden etkilenmediğini unutmayın; ucuz üründe kampanya kârı hızla tüketir.',
          'Kampanya bitince fiyatın eski haline döneceğini ve rakip fiyatlarını takip edin.',
        ]],
        ['p', 'Kampanyanın gerçek etkisini görmek için kampanya dönemindeki siparişlerin net kârını [sipariş başı kâr](/ozellikler/kar-zarar) ekranında izleyin; fiyatı baştan doğru kurmak için [satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama) aracını kullanın.'],
      ];
    },
    faq: [
      ['%10 indirim kârımı neden %10\'dan fazla düşürüyor?', 'İndirim satış fiyatından düşer ama alış maliyeti ve kargo gibi sabit giderler aynı kalır. Bu yüzden kârdaki düşüş, indirim oranının birkaç katı olabilir; araç değişimi yüzde olarak gösterir.'],
      ['Başabaş indirimi nedir?', 'Ürün başı kârın sıfıra indiği indirim oranıdır. Bu orandan fazla indirim yaparsanız her satışta zarar edersiniz.'],
      ['Pazaryeri indirimin bir kısmını karşılarsa nasıl girerim?', 'Yalnız sizin karşıladığınız indirim oranını girin. Örneğin %20\'lik kampanyanın %5\'ini pazaryeri karşılıyorsa indirim olarak %15 girin.'],
      ['Gereken satış artışı nasıl hesaplanıyor?', 'İndirimsiz ürün başı kâr, indirimli ürün başı kâra bölünür; sonuçtan 1 çıkarılır. Toplam kârı korumak için satış adedinin bu oranda artması gerekir.'],
      ['Komisyon kampanyada değişiyorsa ne yapmalıyım?', 'Komisyon alanına kampanya süresince geçerli oranı yazın. Araç indirimsiz ve indirimli kârı aynı oranla hesaplar; farklı oranları karşılaştırmak için iki hesabı ayrı ayrı yapın.'],
    ],
    howto: [['Ürünü girin', 'Normal satış fiyatını, indirim oranını ve alış maliyetini yazın.'], ['Kesintileri girin', 'Komisyon oranını (KDV hariç), kargo, hizmet bedeli ve stopajı girin.'], ['Kararı verin', 'İndirimli kâra, en fazla indirime ve gereken satış artışına bakın.']],
    links: [['/ozellikler/buybox-takibi', 'Buybox ve otomatik fiyat', 'Alt sınırın altına inmeden'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Kampanya siparişlerinin gerçek kârı'], ['/ozellikler/raporlar', 'Raporlar', 'Dönem dönem satış ve kâr']],
    related: ['satis-fiyati-hesaplama', 'kar-karsilastirma', 'yuzde-hesaplama', 'pazaryeri-komisyon-hesaplama', 'trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama'],
  },
  {
    slug: 'e-ticaret-stopaj-hesaplama', group: 'genel', calc: 'stopaj', icon: 'i-bank', color: 'c-pink', name: 'E-ticaret stopajı', short: '%1 stopaj kesintisi, KDV hariç matrah',
    card: 'Pazaryerinin hakedişinizden kestiği %1 e-ticaret stopajını KDV dahil satış tutarından hesaplayın.',
    title: `E-Ticaret Stopajı Hesaplama ${YEAR} (%1 Pazaryeri Kesintisi)`,
    desc: 'E-ticaret stopajı hesaplama: pazaryerinin kestiği %1 stopajı KDV dahil satış tutarından hesaplayın; KDV hariç matrahı ve hakedişten düşülecek tutarı görün.',
    h1: ['E-Ticaret Stopajı', 'Hesaplama'], lead: 'Pazaryeri satışlarınızdan kesilen stopajı bulun: KDV dahil satış tutarını girin, KDV hariç matrahı ve hakedişinizden düşülecek tutarı görün.',
    formula: ['Matrah (KDV hariç) = KDV dahil satış ÷ (1 + KDV % ÷ 100)', 'Stopaj = Matrah × Stopaj % ÷ 100'],
    guide: () => [
      ['h2', 'E-ticaret stopajı nedir?'],
      ['p', STOPAJ_P],
      ['p', 'Stopajı satıcı değil pazaryeri (aracı hizmet sağlayıcı) keser: size ödeyeceği hakedişten düşer ve sizin adınıza vergi dairesine yatırır. Ayrıca bir ödeme yapmanız gerekmez; kesilen tutarlar hakediş ve fatura dökümlerinizde ayrı satır olarak görünür.'],
      ['h2', 'Stopaj nasıl hesaplanır?'],
      ['p', 'Önce KDV dahil satış tutarından KDV ayrılır, kalan KDV hariç tutar (matrah) stopaj oranıyla çarpılır. Ürünün KDV oranı matrahı değiştirdiği için stopaj tutarı da değişir:'],
      ['table', { cap: 'KDV dahil satış tutarına göre %1 stopaj', num: true, head: ['Satış (KDV dahil)', 'Ürün KDV oranı', 'Matrah (KDV hariç)', 'Stopaj (%1)'],
        rows: [[1200, 20], [1200, 10], [1200, 1], [5000, 20], [25000, 20], [100000, 20]].map(([a, v]) => [m(a), pc(v), m(a / (1 + v / 100)), m(a / (1 + v / 100) / 100)]) }],
      ['h2', 'Sık yapılan hata: KDV dahil tutardan hesaplamak'],
      ['p', '%20 KDV\'li 1.200 ₺\'lik satışta stopajı 1.200 × %1 = 12 ₺ diye hesaplamak yanlıştır; doğrusu 1.000 × %1 = 10 ₺\'dir. Tek siparişte küçük görünen fark, aylık cironuzda belirgin bir tutara ulaşır ve kâr hesabınızı bozar.'],
      ['h2', 'Stopaj kârınızı nasıl etkiler?'],
      ['p', 'Stopaj yıllık beyannamede mahsup edildiği için nihai bir vergi yükü değildir; ama hakedişten nakit olarak düşer. Nakit akışınızı planlarken stopajı ayrı bir kalem olarak görün. Sipariş başı kâr hesabında stopajı düşmek, cebinize giren tutarı doğru gösterir; [pazaryeri komisyon hesaplama](/araclar/pazaryeri-komisyon-hesaplama) ve [satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama) araçları stopajı kendiliğinden düşer.'],
      ['h2', 'Mahsup ve iade'],
      ['p', 'Kesilen stopaj, yıllık gelir ya da kurumlar vergisi beyannamenizde hesaplanan vergiden mahsup edilir. Mahsup edilemeyen tutarların iadesi ve belge süreçleri için mali müşavirinize danışın. Bu sayfa vergi danışmanlığı değildir; oran değişirse araçtaki oranı değiştirebilirsiniz.'],
    ],
    faq: [
      ['E-ticaret stopajını kim keser?', 'Pazaryeri (aracı hizmet sağlayıcı) keser: size ödeyeceği hakedişten düşer ve sizin adınıza vergi dairesine yatırır. Ayrıca bir ödeme yapmanız gerekmez.'],
      ['Stopaj KDV dahil tutar üzerinden mi hesaplanır?', 'Hayır, satışın KDV hariç tutarı üzerinden hesaplanır. %20 KDV\'li 1.200 ₺\'lik satışta stopaj 12 ₺ değil, 1.000 ₺ × %1 = 10 ₺\'dir.'],
      ['E-ticaret stopajı oranı kaç?', 'Genel oran %1\'dir. Oran değişirse araçtaki stopaj oranı alanını güncelleyerek hesaplayabilirsiniz.'],
      ['Kesilen stopaj geri alınır mı?', 'Yıllık beyannamede hesaplanan gelir ya da kurumlar vergisinden mahsup edilir. Mahsup ve iade süreçleri için mali müşavirinize danışın.'],
      ['Stopaj iade edilen siparişlerde ne olur?', 'İade ve iptallerde stopajın düzeltilmesi pazaryerinin hakediş dökümünde görünür. Dönem sonunda kesilen toplam stopajı hakediş raporlarınızla karşılaştırın.'],
    ],
    howto: [['Satış tutarını girin', 'Tek siparişin ya da aylık toplam satışın KDV dahil tutarını yazın.'], ['KDV oranını seçin', 'Ürününüzün KDV oranını seçin (%1, %10, %20 ya da diğer).'], ['Stopajı okuyun', 'Matrah, stopaj kesintisi ve stopaj sonrası tutar görünür.']],
    links: [['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Stopaj dahil net kâr'], ['/ozellikler/raporlar', 'Raporlar', 'Dönem dönem kesintiler'], ['/entegrasyonlar', 'Entegrasyonlar', 'Hakedişler panelde']],
    related: ['kdv-hesaplama', 'pazaryeri-komisyon-hesaplama', 'satis-fiyati-hesaplama', 'trendyol-komisyon-hesaplama', 'hepsiburada-komisyon-hesaplama', 'kar-karsilastirma'],
  },
  {
    slug: 'kdv-hesaplama', group: 'genel', calc: 'kdv', icon: 'i-receipt', color: 'c-blue', name: 'KDV hesaplama', short: 'KDV dahil ↔ hariç, %1 · %10 · %20',
    card: 'KDV hariç fiyattan KDV dahil fiyatı, KDV dahil fiyattan KDV hariç tutarı ve KDV\'yi bulun.',
    title: `KDV Hesaplama ${YEAR}: KDV Dahil ve Hariç Fiyat (%1, %10, %20)`,
    desc: 'KDV hesaplama: KDV hariç fiyattan KDV dahil fiyatı, KDV dahil fiyattan KDV hariç tutarı ve KDV\'yi saniyede bulun. %1, %10, %20 ve özel oran. Ücretsiz.',
    h1: ['KDV', 'Hesaplama'], lead: 'Fiyata KDV ekleyin ya da KDV dahil fiyatın içindeki KDV\'yi ayırın. %1, %10, %20 veya kendi oranınızla; yazdıkça hesaplanır.',
    formula: ['KDV dahil = KDV hariç × (1 + oran ÷ 100)', 'KDV hariç = KDV dahil ÷ (1 + oran ÷ 100)', 'KDV tutarı = KDV dahil − KDV hariç'],
    guide: () => [
      ['h2', 'KDV nasıl hesaplanır?'],
      ['p', 'Katma değer vergisi (KDV), KDV hariç tutarın yüzdesidir. KDV eklerken tutarı (1 + oran) ile çarparsınız; KDV dahil fiyattan geri giderken aynı sayıya bölersiniz. %20 KDV\'de çarpan 1,20, %10\'da 1,10, %1\'de 1,01\'dir.'],
      ['table', { cap: 'Sık kullanılan oranlarla KDV', num: true, head: ['KDV hariç', 'Oran', 'KDV', 'KDV dahil'],
        rows: [[100, 20], [1000, 20], [1000, 10], [1000, 1], [2500, 20], [10000, 20]].map(([a, r]) => [m(a), pc(r), m((a * r) / 100), m(a * (1 + r / 100))]) }],
      ['h2', 'KDV dahil fiyattan KDV nasıl ayrılır?'],
      ['p', 'KDV dahil tutarı (1 + oran) ile bölün. 1.200 ₺ ÷ 1,20 = 1.000 ₺ KDV hariç tutar, aradaki 200 ₺ KDV\'dir. Pratik bir kural: %20 KDV\'li bir fiyatın içindeki KDV, fiyatın 1/6\'sıdır (1.200 ÷ 6 = 200).'],
      ['h2', 'En sık yapılan hata'],
      ['p', 'KDV dahil fiyattan oran kadar düşmek: 1.200 ₺ × %20 = 240 ₺ çıkarılırsa KDV hariç tutar 960 ₺ gibi yanlış bulunur. KDV, KDV hariç tutarın %20\'sidir, KDV dahil tutarın değil.'],
      ['h2', 'Hangi ürüne hangi oran?'],
      ['p', 'Genel KDV oranı %20\'dir. Bazı temel gıda ürünleri gibi mallarda %1, bazı ürün ve hizmetlerde %10 gibi indirimli oranlar uygulanır. Ürününüzün oranını alış faturanızdan ya da mali müşavirinizden teyit edin; yanlış oran, satış fiyatı ve kâr hesabını da bozar.'],
      ['h2', 'Pazaryerinde KDV'],
      ['p', 'Pazaryerinde müşterinin gördüğü fiyat KDV dahildir. Komisyon, kargo ve hizmet bedeli faturaları da size KDV eklenerek kesilir: pazaryerleri komisyonu genellikle KDV hariç ilan eder, faturaya %20 KDV ekler. Kâr hesabında tüm tutarları KDV dahil kullanmak, cebinize giren ve çıkan parayı doğrudan gösterir. Pazaryeri hesapları için [pazaryeri komisyon hesaplama](/araclar/pazaryeri-komisyon-hesaplama) ve [e-ticaret stopajı](/araclar/e-ticaret-stopaj-hesaplama) araçlarına bakın.'],
    ],
    faq: [
      ['KDV dahil fiyattan KDV nasıl çıkarılır?', 'KDV dahil tutarı (1 + KDV oranı) ile bölün. %20 KDV\'de 1.200 ₺ ÷ 1,20 = 1.000 ₺ KDV hariç tutardır; aradaki 200 ₺ KDV\'dir.'],
      ['KDV dahil fiyattan neden %20 düşülmez?', 'Çünkü KDV, KDV hariç tutarın %20\'sidir, KDV dahil tutarın değil. 1.200 ₺\'nin %20\'si 240 ₺ eder ve KDV hariç tutarı 960 ₺ gibi hatalı gösterir.'],
      ['%20 KDV\'li fiyatın içindeki KDV ne kadar?', 'Fiyatın 1/6\'sı. 600 ₺\'lik KDV dahil fiyatta KDV 100 ₺, KDV hariç tutar 500 ₺\'dir.'],
      ['Hangi ürüne hangi KDV oranı uygulanır?', 'Genel oran %20\'dir. Bazı temel gıda ürünleri gibi mallarda %1 ya da %10 gibi indirimli oranlar uygulanır. Ürününüzün oranını alış faturanızdan ya da mali müşavirinizden teyit edin.'],
      ['Pazaryerinde satış fiyatı KDV dahil mi yazılır?', 'Evet. Pazaryerlerinde müşterinin gördüğü fiyat KDV dahildir. Komisyon, kargo ve hizmet bedeli faturaları da size KDV dahil kesilir.'],
    ],
    howto: [['Yönü seçin', '"KDV ekle" (hariç → dahil) ya da "KDV ayır" (dahil → hariç).'], ['Tutarı girin', 'Tutarı yazın; binlik ayracı ve virgül kullanabilirsiniz.'], ['Oranı seçin', '%1, %10, %20 ya da "Diğer" ile kendi oranınızı seçin; sonuç hemen görünür.']],
    links: [['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'KDV dahil net kâr'], ['/ozellikler/raporlar', 'Raporlar', 'Satış ve kâr raporları'], ['/paketler', 'Paketler', 'KDV dahil fiyatlar']],
    related: ['e-ticaret-stopaj-hesaplama', 'satis-fiyati-hesaplama', 'yuzde-hesaplama', 'pazaryeri-komisyon-hesaplama', 'indirim-kar-hesaplama', 'desi-hesaplama'],
  },
  {
    slug: 'desi-hesaplama', group: 'genel', calc: 'desi', icon: 'i-ruler', color: 'c-orange', name: 'Desi hesaplama', short: 'Koli ölçüsünden desi, desi mi kg mı?',
    card: 'En × boy × yükseklik ile desiyi bulun; birden fazla koli ekleyin, ücretin desiden mi kilogramdan mı alınacağını görün.',
    title: 'Desi Hesaplama: Kargo Desi ve Ücrete Esas Ağırlık',
    desc: 'Kargo desi hesaplama: en × boy × yükseklik ÷ 3000 ile desiyi bulun, birden fazla koli ekleyin; ücretin desiden mi kilogramdan mı alınacağını görün.',
    h1: ['Desi', 'Hesaplama'], lead: 'Koli ölçülerini ve ağırlığını girin; desiyi ve kargo ücretinin desiden mi kilogramdan mı hesaplanacağını görün. Birden fazla koli ekleyebilirsiniz.',
    formula: ['Desi = En (cm) × Boy (cm) × Yükseklik (cm) ÷ 3000', 'Ücrete esas = desi ile gerçek ağırlıktan (kg) büyük olanı', 'Birden fazla koli: her kolinin ücrete esas değeri × adet, toplanır'],
    guide: () => [
      ['h2', 'Desi nedir?'],
      ['p', 'Desi, bir gönderinin kapladığı hacmin ağırlık karşılığıdır. Kargo firmaları gönderiyi hem tartar hem ölçer: hafif ama büyük bir koli araçta çok yer kapladığı için hacmine (desi), küçük ama ağır bir koli gerçek ağırlığına göre ücretlendirilir. Ücrete esas olan, ikisinden büyük olanıdır.'],
      ['h2', 'Desi nasıl hesaplanır?'],
      ['p', 'Kolinin en, boy ve yüksekliği santimetre cinsinden çarpılır ve firmanın bölenine bölünür. Yurt içi kargo firmalarının çoğu **3000** kullanır; bazı firmalar ve yurt dışı / ekspres gönderiler 4000 ya da 5000 kullanabilir. Firmalar küsuratı genellikle bir üst desiye yuvarlar.'],
      ['table', { cap: 'Yaygın koli ölçüleri ve desi (bölen 3000)', num: true, head: ['Koli (cm)', 'Hacim (cm³)', 'Desi', 'Yukarı yuvarlanmış'],
        rows: [[20, 15, 10], [30, 20, 15], [40, 30, 20], [50, 40, 30], [60, 40, 40]].map(([a, b, c]) => [`${a} × ${b} × ${c}`, nm(a * b * c, 0), nm((a * b * c) / 3000), nm(Math.ceil((a * b * c) / 3000 - 1e-9), 0)]) }],
      ['h2', 'Desi mi, kilogram mı?'],
      ['p', '30 × 20 × 15 cm ve 2 kg\'lık koli: 9.000 ÷ 3000 = 3 desi. Desi ağırlıktan büyük olduğu için ücret 3 desiden hesaplanır. Aynı koli 5 kg gelseydi ücret 5 kg\'dan alınırdı. Araç her koli için hangisinin ücrete esas olduğunu ayrı ayrı gösterir.'],
      ['h2', 'Birden fazla koli'],
      ['p', 'Her koli ayrı ölçülür; her birinin desi ve ağırlığından büyük olanı alınıp adetle çarpılır ve toplanır. Bazı firmalar ise toplam desi ile toplam ağırlığı karşılaştırır; araç iki toplamı da verir. Anlaşmanızdaki kuralı kontrol edin.'],
      ['h2', 'Desiyi düşürmek için ipuçları'],
      ['ul', [
        'Ürüne uygun boyutta koli kullanın; boş alan desiyi gereksiz büyütür.',
        'Koli ölçüsündeki 1–2 cm\'lik fark bile desiyi bir üst kademeye taşıyabilir; yuvarlanmış desiye bakın.',
        'Sık gönderdiğiniz ürünler için standart koli ölçüleri belirleyin; kargo maliyetiniz öngörülebilir olur.',
        'Kargo bedeli sabit bir gider olduğu için ucuz ürünlerde kârı en çok etkileyen kalemdir; fiyatı belirlerken hesaba katın ([satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama)).',
      ]],
      ['p', 'Hastürk CRM ile kargo etiketlerini [tek ekrandan basabilir](/ozellikler/kargo-ve-etiket), kendi kargo anlaşmanızla [kargo firmalarına](/ozellikler/kargo-entegrasyonu) doğrudan gönderi oluşturabilirsiniz.'],
    ],
    faq: [
      ['Desi nedir?', 'Desi, gönderinin kapladığı hacmin ağırlık karşılığıdır. Kargo ücreti, desi ile gerçek ağırlıktan büyük olana göre belirlenir.'],
      ['Desi hesaplamada neden 3000\'e bölünür?', 'Yurt içi kargo firmalarının çoğu 3000 cm³ hacmi 1 desi kabul eder. Bölen firmaya ve gönderi türüne göre değişebilir; araçta 4000 ve 5000 de seçilebilir.'],
      ['Desi küsuratlı çıkarsa ne olur?', 'Firmalar küsuratı çoğunlukla bir üst desiye yuvarlar: 3,2 desi 4 desi sayılır. Araç yukarı yuvarlanmış değeri de gösterir.'],
      ['Birden fazla koli gönderirken desi nasıl hesaplanır?', 'Her koli ayrı ölçülür; her birinin desi ve ağırlığından büyük olanı alınıp toplanır. Bazı firmalar toplam desi ile toplam ağırlığı karşılaştırır; araç iki toplamı da gösterir.'],
      ['Desiyi nasıl düşürebilirim?', 'Ürüne uygun boyutta koli kullanın ve boş alanı azaltın. Koli ölçüsündeki 1–2 cm\'lik fark bile desiyi bir üst kademeye taşıyabilir.'],
    ],
    howto: [['Böleni seçin', 'Kargo firmanızın bölenini seçin (çoğu yurt içi firma 3000).'], ['Koli ölçülerini girin', 'En, boy, yükseklik (cm), ağırlık (kg) ve adet yazın; gerekirse koli ekleyin.'], ['Sonucu okuyun', 'Toplam desi, ağırlık ve ücrete esas değer görünür.']],
    links: [['/ozellikler/kargo-ve-etiket', 'Kargo ve etiket', 'Toplu ve termal etiket'], ['/ozellikler/kargo-entegrasyonu', 'Kargo entegrasyonu', 'Kendi anlaşmanızla'], ['/ozellikler/siparis-yonetimi', 'Sipariş yönetimi', 'Tüm kanallar tek listede']],
    related: ['satis-fiyati-hesaplama', 'pazaryeri-komisyon-hesaplama', 'kdv-hesaplama', 'kar-karsilastirma', 'trendyol-komisyon-hesaplama', 'yuzde-hesaplama'],
  },
  {
    slug: 'yuzde-hesaplama', group: 'genel', calc: 'yuzde', icon: 'i-percent', color: 'c-teal', name: 'Yüzde hesaplama', short: 'Yüzdesi, artış oranı, indirimli fiyat',
    card: 'Bir sayının yüzdesini, yüzde kaç olduğunu, artış / azalış oranını ve indirimli fiyatı hesaplayın.',
    title: 'Yüzde Hesaplama: Yüzdesi, Artış Oranı, İndirimli Fiyat',
    desc: 'Yüzde hesaplama: bir sayının yüzdesini, diğerinin yüzde kaçı olduğunu, artış / azalış oranını ve indirimli fiyatı tek sayfada hesaplayın. Ücretsiz.',
    h1: ['Yüzde', 'Hesaplama'], lead: 'Dört sık kullanılan yüzde hesabı tek sayfada: bir sayının yüzdesi, yüzde kaçı olduğu, iki değer arasındaki değişim ve indirimli fiyat.',
    formula: ['X\'in %Y\'si = X × Y ÷ 100', 'A, B\'nin yüzde kaçı = A ÷ B × 100', 'Değişim oranı = (Yeni − Eski) ÷ Eski × 100', 'İndirimli fiyat = Fiyat × (1 − İndirim ÷ 100)'],
    guide: () => [
      ['h2', 'Yüzde nasıl hesaplanır?'],
      ['p', 'Yüzde, bir sayının 100 parça içindeki payıdır. Bir sayının yüzdesini bulmak için sayıyı oranla çarpıp 100\'e bölersiniz: 250\'nin %18\'i 250 × 18 ÷ 100 = 45\'tir.'],
      ['table', { cap: 'Dört temel yüzde hesabı', head: ['Soru', 'Formül', 'Örnek', 'Sonuç'], rows: [
        ['250\'nin %18\'i kaçtır?', 'X × Y ÷ 100', '250 × 18 ÷ 100', '45'],
        ['45, 250\'nin yüzde kaçıdır?', 'A ÷ B × 100', '45 ÷ 250 × 100', '%18'],
        ['200\'den 250\'ye artış yüzde kaç?', '(Yeni − Eski) ÷ Eski × 100', '(250 − 200) ÷ 200 × 100', '%25'],
        ['1.000 ₺\'ye %15 indirim', 'Fiyat × (1 − İndirim ÷ 100)', '1.000 × 0,85', '850 ₺'],
      ] }],
      ['h2', 'Artış ve azalış oranında dikkat'],
      ['p', 'Değişim oranında bölen her zaman **eski** (başlangıç) değerdir. Bu yüzden %20 zammın ardından gelen %20 indirim başlangıca geri getirmez: 100 ₺ → 120 ₺ → 96 ₺. Fiyat değişikliklerini yorumlarken hangi değerin başlangıç olduğuna dikkat edin.'],
      ['h2', 'İndirimli fiyattan eski fiyatı bulmak'],
      ['p', 'İndirimli fiyatı (1 − indirim oranı) ile bölün. %15 indirimle 850 ₺\'ye satılan ürünün eski fiyatı 850 ÷ 0,85 = 1.000 ₺\'dir.'],
      ['h2', 'E-ticarette yüzde hesapları'],
      ['p', 'Komisyon oranı, kâr marjı, indirim ve KDV birer yüzde hesabıdır; ama hangi tutarın yüzdesi olduklarına dikkat etmek gerekir. Kâr marjı satış fiyatına, markup alış maliyetine, KDV KDV hariç tutara, stopaj KDV hariç satışa göre hesaplanır. Bu hesaplar için hazır araçlar: [KDV hesaplama](/araclar/kdv-hesaplama), [satış fiyatı hesaplama](/araclar/satis-fiyati-hesaplama), [indirim sonrası kâr](/araclar/indirim-kar-hesaplama).'],
    ],
    faq: [
      ['Yüzde artış nasıl hesaplanır?', 'Yeni değerden eski değeri çıkarın, sonucu eski değere bölüp 100 ile çarpın. 200 ₺\'den 250 ₺\'ye çıkan fiyat (250 − 200) ÷ 200 × 100 = %25 artmıştır.'],
      ['%20 zam ve ardından %20 indirim eski fiyatı verir mi?', 'Hayır. 100 ₺\'ye %20 zam 120 ₺ eder; 120 ₺\'ye %20 indirim 96 ₺\'dir. İndirim daha büyük tutardan yapıldığı için fiyat başlangıcın altına düşer.'],
      ['İndirimli fiyattan eski fiyat nasıl bulunur?', 'İndirimli fiyatı (1 − indirim oranı) ile bölün. %15 indirimle 850 ₺\'ye satılan ürünün eski fiyatı 850 ÷ 0,85 = 1.000 ₺\'dir.'],
      ['Bir sayının yüzde kaçı olduğu nasıl bulunur?', 'Parçayı bütüne bölüp 100 ile çarpın. 45, 250\'nin 45 ÷ 250 × 100 = %18\'idir.'],
    ],
    howto: [['Hesabı seçin', 'Dört kutudan sorunuza uyanı seçin.'], ['Sayıları girin', 'İki değeri yazın; sonuç kutunun altında hemen görünür.']],
    links: [['/ozellikler/raporlar', 'Raporlar', 'Satış değişimini otomatik görün'], ['/ozellikler/kar-zarar', 'Sipariş başı kâr', 'Marj ve kâr otomatik'], ['/ozellikler/buybox-takibi', 'Otomatik fiyat', 'Rakibe göre fiyat']],
    related: ['kdv-hesaplama', 'indirim-kar-hesaplama', 'satis-fiyati-hesaplama', 'kar-karsilastirma', 'e-ticaret-stopaj-hesaplama', 'desi-hesaplama'],
  },
];

// ---------- form parçaları ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const ico = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
export const trNum = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
// Sayı alanı: metin kutusu + birim (₺, %, cm, kg); "1.234,56" ve "1234.56" ikisi de kabul edilir (tools.js). Hatalı girişte altta uyarı çıkar.
const fld = (name, label, val, unit = '₺', hint = '', opt = '') => `<label class="cf"><span class="cf-l">${label}</span><span class="cf-in"><input class="in" name="${name}" type="text" inputmode="decimal" autocomplete="off" value="${val === '' ? '' : esc(trNum(val))}"${val === '' ? ' placeholder="isteğe bağlı"' : ''}${opt}><i>${unit}</i></span>${hint ? `<small>${hint}</small>` : ''}<small class="cf-e" data-err hidden>Geçerli bir sayı girin</small></label>`;
const seg = (name, opts, sel, label, cls = '') => `<div class="seg${cls}" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}"${v === sel ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
const vatChips = (name = 'vat', sel = '20', other = true, label = 'Ürün KDV oranı') => `<div class="cf"><span class="cf-l">${label}</span><div class="seg seg-sm" role="radiogroup" aria-label="${label}">${['1', '10', '20'].map((r) => `<label><input type="radio" name="${name}" value="${r}"${r === sel ? ' checked' : ''}><span>%${r}</span></label>`).join('')}${other ? `<label><input type="radio" name="${name}" value="x"><span>Diğer</span></label>` : ''}</div>${other ? `<span class="cf-in cf-x" hidden><input class="in" name="${name}X" type="text" inputmode="decimal" autocomplete="off" aria-label="Diğer KDV oranı" placeholder="ör. 8"><i>%</i></span>` : ''}</div>`;
// Oran alanı + oran türü (KDV hariç / dahil)
const rateFld = (val, label = 'Komisyon oranı', hint = '') => `<div class="cf cf-rate">${fld('com', label, val, '%', hint)}${seg('basis', [['ex', 'KDV hariç'], ['inc', 'KDV dahil']], 'ex', 'Oran türü', ' seg-sm seg-basis')}</div>`;
const grp = (n, title, inner, sub = '') => `<fieldset class="cg"><legend><span class="cg-n" aria-hidden="true">${n}</span>${title}${sub ? `<small>${sub}</small>` : ''}</legend>${inner}</fieldset>`;
const out = (k, l, cls = '') => `<div class="co${cls ? ' ' + cls : ''}"><span>${l}</span><b data-o="${k}">–</b></div>`;
const big = (label, k = 'big', sub = 'bigSub') => `<div class="cr-big"><span data-o="bigLabel">${label}</span><strong data-o="${k}" aria-live="polite">–</strong><small data-o="${sub}"></small></div>`;
// Satış fiyatının dağılımı (yüzdelik çubuk; tools.js genişlikleri ayarlar)
const BAR = [['com', 'Komisyon'], ['ship', 'Kargo'], ['fee', 'Hizmet'], ['wh', 'Stopaj'], ['cost', 'Alış'], ['profit', 'Kâr']];
const bar = `<div class="cbar-w" data-barw><div class="cbar" data-bar aria-hidden="true">${BAR.map(([k]) => `<i data-k="${k}"></i>`).join('')}</div><ul class="cbar-l">${BAR.map(([k, l]) => `<li data-l="${k}"><i></i>${l} <b data-bl="${k}"></b></li>`).join('')}</ul></div>`;
const actions = `<div class="calc-act"><button type="button" class="ca" data-share>${ico('i-link')}<span data-share-l>Bağlantıyı kopyala</span></button><button type="button" class="ca" data-print>${ico('i-receipt')}Yazdır</button><button type="button" class="ca" data-reset>${ico('i-sync')}Sıfırla</button></div>`;
const res = (inner, note = '', act = true) => `<div class="calc-out">${inner}${note ? `<p class="calc-note">${note}</p>` : ''}${act ? actions : ''}</div>`;
const form = (calc, inner, attrs = '') => `<form class="calc" data-calc="${calc}"${attrs} novalidate autocomplete="off">${inner}</form>`;
const NOTE_INCL = 'Tüm tutarlar KDV dahildir (cebinizden çıkan haliyle).';
const fees = () => `<div class="cf-grid g3">${fld('ship', 'Kargo', 65, '₺', 'Sipariş başı, KDV dahil')}${fld('fee', 'Hizmet bedeli', 10, '₺', 'Sipariş başı, KDV dahil')}${fld('wh', 'Stopaj', WITHHOLDING, '%', 'KDV hariç satıştan')}</div>`;

// Kategori seçici (resmî liste varsa). srcs: { pazaryeri: { src, name, date, basis, count, page } }
const picker = (srcs) => `<div class="cp" data-cp data-srcs="${esc(JSON.stringify(srcs))}">
  <label class="cf-l" for="cp-q">Kategori <small data-cp-cap></small></label>
  <div class="cp-box">${ico('i-search')}<input id="cp-q" class="in" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cp-list" autocomplete="off" spellcheck="false" placeholder="Kategori arayın: ör. tencere, kılıf, mont"><button type="button" class="cp-x" data-cp-clear aria-label="Kategori seçimini temizle" hidden>${ico('i-x')}</button><ul id="cp-list" class="cp-list" role="listbox" aria-label="Kategoriler" hidden></ul></div>
  <p class="cp-st" data-cp-st aria-live="polite"></p>
</div>`;

// Kanal listesi: [slug, ad, oran (KDV hariç, örnek)] (build.mjs aktif kanallarla süzer). comm: resmî listesi olan pazaryerleri (srcs biçimi)
export function calcForm(t, channels, comm = {}) {
  const chSel = (sel) => `<label class="cf"><span class="cf-l">Pazaryeri</span><select class="in" name="ch">${channels.map(([s, n, r]) => `<option value="${s}" data-rate="${r}"${s === sel ? ' selected' : ''}>${esc(n)}${comm[s] ? ' (resmî kategori listesi)' : ` (örnek %${trNum(r)} + KDV)`}</option>`).join('')}<option value="">Diğer / kendi oranım</option></select></label>`;
  switch (t.calc) {
    case 'kdv':
      return form('kdv', `<div class="calc-in">
  ${seg('mode', [['add', 'KDV ekle (hariç → dahil)'], ['remove', 'KDV ayır (dahil → hariç)']], 'add', 'Hesap yönü')}
  ${fld('amount', '<span data-o="amountLabel">KDV hariç tutar</span>', 1000)}
  ${vatChips('vat', '20', true, 'KDV oranı')}
</div>${res(`${big('KDV dahil fiyat')}${out('net', 'KDV hariç')}${out('vat', 'KDV tutarı')}${out('gross', 'KDV dahil', 'strong')}`)}`);
    case 'desi':
      return form('desi', `<div class="calc-in">
  <label class="cf"><span class="cf-l">Kargo firmasının böleni</span><select class="in" name="div"><option value="3000" selected>3000 (yurt içi kargoların çoğu)</option><option value="4000">4000</option><option value="5000">5000 (bazı yurt dışı / ekspres)</option></select></label>
  <div class="parcels" data-rows>
    <fieldset class="parcel" data-row><legend class="parcel-h"><b>Koli <span data-n>1</span></b></legend><button type="button" class="parcel-x" data-del aria-label="Koliyi kaldır" hidden>${ico('i-x')}</button>
      <div class="cf-grid g5">${fld('en', 'En', 30, 'cm')}${fld('boy', 'Boy', 20, 'cm')}${fld('yuk', 'Yükseklik', 15, 'cm')}${fld('kg', 'Ağırlık', 2, 'kg')}${fld('adet', 'Adet', 1, 'ad')}</div>
      <div class="parcel-r"><span>Desi: <b data-r="desi">–</b></span><span>Ücrete esas: <b data-r="charge">–</b></span></div></fieldset>
  </div>
  <button type="button" class="btn btn-line btn-sm" data-add>+ Koli ekle</button>
</div>${res(`${big('Ücrete esas toplam')}${out('desi', 'Toplam desi')}${out('kg', 'Toplam ağırlık')}${out('up', 'Yukarı yuvarlanmış (koli başı)')}`, 'Firmalar küsuratı çoğunlukla bir üst desiye yuvarlar; anlaşmanızı kontrol edin.')}`);
    case 'yuzde': {
      const box = (title, inner, outs) => `<fieldset class="pbox"><legend class="pbox-h">${title}</legend><div class="cf-grid">${inner}</div><div class="pbox-o" aria-live="polite">${outs}</div></fieldset>`;
      return form('yuzde', `<div class="pboxes">
  ${box('Bir sayının yüzdesi', `${fld('p1x', 'Sayı', 250, '')}${fld('p1y', 'Yüzde', 18, '%')}`, `<span data-o="p1t">250 × %18 =</span><strong data-o="p1">–</strong>`)}
  ${box('Yüzde kaçı?', `${fld('p2a', 'Sayı', 45, '')}${fld('p2b', 'Toplam', 250, '')}`, `<span data-o="p2t">45 ÷ 250 =</span><strong data-o="p2">–</strong>`)}
  ${box('Artış / azalış oranı', `${fld('p3a', 'Eski değer', 200, '')}${fld('p3b', 'Yeni değer', 250, '')}`, `<span data-o="p3t">Değişim</span><strong data-o="p3">–</strong><small data-o="p3d"></small>`)}
  ${box('İndirimli fiyat', `${fld('p4p', 'Fiyat', 1000)}${fld('p4d', 'İndirim', 15, '%')}`, `<span>İndirimli fiyat</span><strong data-o="p4">–</strong><small data-o="p4s"></small>`)}
</div>${actions}`, ' data-wide');
    }
    case 'satis':
      return form('satis', `<div class="calc-in">
  ${seg('mode', [['price', 'Hedef kârdan fiyat bul'], ['profit', 'Fiyattan kâr bul']], 'price', 'Hesap yönü')}
  ${grp(1, 'Ürün ve hedef', `<div class="cf-grid">${fld('cost', 'Alış maliyeti', 450, '₺', 'KDV dahil')}<div data-mode="profit" hidden>${fld('price', 'Satış fiyatı', 1000, '₺', 'KDV dahil')}</div>
  <div class="cf" data-mode="price"><span class="cf-l">Hedef</span><span class="cf-in cf-pair"><input class="in" name="target" type="text" inputmode="decimal" autocomplete="off" value="20" aria-label="Hedef kâr"><select class="in" name="tt" aria-label="Hedef türü"><option value="m" selected>% marj</option><option value="t">₺ kâr</option></select></span><small>Satış fiyatına göre marj ya da ürün başı tutar</small></div></div>`)}
  ${grp(2, 'Pazaryeri kesintileri', `${rateFld(15)}${fees()}`)}
  ${vatChips('vat', '20', false)}
</div>${res(`${big('Önerilen satış fiyatı')}<p class="cr-rate" data-o="rateLine"></p>${out('com', 'Komisyon')}${out('ship', 'Kargo + hizmet bedeli')}${out('wh', 'Stopaj')}${out('payout', 'Hakediş (elinize geçen)')}${out('profit', 'Net kâr', 'strong')}${out('margin', 'Kâr marjı (satışa göre)')}${out('markup', 'Kâr oranı (alışa göre)')}${out('be', 'Başabaş fiyat (kâr = 0)')}${bar}`, NOTE_INCL)}`);
    case 'stopaj':
      return form('stopaj', `<div class="calc-in">
  ${fld('amount', 'Satış tutarı (KDV dahil)', 1200, '₺', 'Tek sipariş ya da aylık toplam satış')}
  ${vatChips('vat', '20')}
  ${fld('wh', 'Stopaj oranı', WITHHOLDING, '%')}
</div>${res(`${big('Stopaj kesintisi')}${out('base', 'Matrah (KDV hariç satış)')}${out('vatAmt', 'Satıştaki KDV')}${out('after', 'Stopaj sonrası (diğer kesintiler hariç)', 'strong')}`, 'Kesilen stopaj yıllık gelir / kurumlar vergisinden mahsup edilir.')}`);
    case 'komisyon': {
      const fixed = t.mp ? channels.find(([s]) => s === t.mp) || [t.mp, t.name, CHANNEL_RATES[t.mp] ?? 18] : null;
      const r = fixed || channels[0];
      const srcs = t.mp ? (comm[t.mp] ? { [t.mp]: comm[t.mp] } : {}) : comm;
      const has = Object.keys(srcs).length > 0;
      const hint = t.mp && !comm[t.mp] ? `${esc(t.h1[0].replace(/ Komisyon$/, ''))} satıcı panelinizde gördüğünüz oran` : '';
      return form('komisyon', `<div class="calc-in">
  ${grp(1, 'Satış ve komisyon', `${t.mp ? '' : chSel(r ? r[0] : '')}${has ? picker(srcs) : ''}<div class="cf-grid">${fld('price', 'Satış fiyatı', 1000, '₺', 'Müşterinin ödediği, KDV dahil')}${rateFld(r ? r[2] : 18, 'Komisyon oranı', hint || (t.mp ? '' : 'Kategorinizin oranı'))}</div>`)}
  ${grp(2, 'Sipariş başı kesintiler', fees())}
  ${grp(3, 'Ürün', `<div class="cf-grid">${fld('cost', 'Alış maliyeti', 450, '₺', 'KDV dahil; boş bırakırsanız yalnız hakediş')}${vatChips('vat', '20', false)}</div>`, 'Net kâr için')}
</div>${res(`${big('Hakediş (elinize geçen)')}<p class="cr-rate" data-o="rateLine"></p>${out('com', 'Komisyon')}${out('ship', 'Kargo')}${out('fee', 'Hizmet bedeli')}${out('wh', 'Stopaj')}${out('cut', 'Toplam kesinti')}${out('profit', 'Net kâr', 'strong')}${out('margin', 'Kâr marjı')}${bar}`, NOTE_INCL)}`, `${t.mp ? ` data-preset="${t.mp}"` : ''}`);
    }
    case 'karsilastir':
      return form('karsilastir', `<div class="calc-in calc-top">
  <div class="cf-grid g4">${fld('price', 'Satış fiyatı', 1000, '₺', 'KDV dahil')}${fld('cost', 'Alış maliyeti', 450, '₺', 'KDV dahil')}${fld('wh', 'Stopaj', WITHHOLDING, '%', 'KDV hariç satıştan')}<label class="cf"><span class="cf-l">Ürün KDV oranı</span><select class="in" name="vat"><option value="1">%1</option><option value="10">%10</option><option value="20" selected>%20</option></select></label></div>
  <p class="calc-hint">${ico('i-eye')}<span>Kartlardaki komisyon oranları KDV hariç <b>örnek başlangıç değerleridir</b> (araç %20 KDV'yi ekler). Kendi kategorinizin oranını yazın.</span></p>
</div>
<div class="cmp-sum" aria-live="polite"><span data-o="bigLabel">En kârlı kanal</span><strong data-o="big">–</strong><small data-o="bigSub"></small></div>
<div class="cmp">${channels.map(([s, n, rt]) => `<fieldset class="cmp-c" data-ch="${s}"><legend class="vh">${esc(n)}</legend><label class="cmp-h"><input type="checkbox" name="on" checked><b>${esc(n)}</b><em class="pill" data-best hidden>En kârlı</em></label>
  <div class="cf-grid g3">${fld('com', 'Komisyon (+KDV)', rt, '%')}${fld('ship', 'Kargo', 65)}${fld('fee', 'Hizmet b.', 10)}</div>
  <div class="cmp-r"><span>Hakediş <b data-r="payout">–</b></span><span>Kâr <b data-r="profit">–</b></span><span>Marj <b data-r="margin">–</b></span></div></fieldset>`).join('')}</div>
<p class="calc-note">${NOTE_INCL}</p>${actions}`, ' data-wide');
    case 'indirim':
      return form('indirim', `<div class="calc-in">
  ${grp(1, 'Ürün ve indirim', `<div class="cf-grid g3">${fld('price', 'Normal satış fiyatı', 1000, '₺', 'KDV dahil')}${fld('disc', 'İndirim oranı', 10, '%', 'Sizin karşıladığınız')}${fld('cost', 'Alış maliyeti', 450, '₺', 'KDV dahil')}</div>`)}
  ${grp(2, 'Pazaryeri kesintileri', `${rateFld(15)}${fees()}`)}
  ${vatChips('vat', '20', false)}
</div>${res(`${big('İndirimli fiyatta kâr')}${out('newPrice', 'İndirimli fiyat')}${out('before', 'İndirimsiz kâr')}${out('after', 'İndirimli kâr', 'strong')}${out('drop', 'Kârdaki değişim')}${out('be', 'Başabaş fiyat')}${out('maxDisc', 'En fazla indirim (kâr = 0)')}${out('need', 'Aynı toplam kâr için gereken satış artışı')}`, NOTE_INCL)}`);
  }
  throw new Error(`Araç: "${t.calc}" hesaplayıcısı yok`);
}

// Ana sayfadaki küçük net kâr hesaplayıcısı (komisyon KDV hariç girilir, ×1,2; stopaj %1, ürün KDV %20 kabul edilir)
export const miniProfit = () => form('mini', `<div class="calc-in">
  <div class="cf-grid">${fld('price', 'Satış fiyatı', 1000)}${fld('cost', 'Alış maliyeti', 450)}${fld('com', 'Komisyon (+KDV)', 15, '%')}${fld('ship', 'Kargo + hizmet bedeli', 75)}</div>
</div>${res(`${big('Ürün başı net kâr')}${out('payout', 'Hakediş (elinize geçen)')}${out('margin', 'Kâr marjı')}`, 'KDV dahil tutarlar; komisyona %20 KDV eklenir, stopaj %1 düşülür.', false)}`);
