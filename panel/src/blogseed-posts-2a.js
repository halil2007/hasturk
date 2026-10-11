// İkinci parti hazır blog yazıları (bkz. blogseed.js, biçim blogseed-posts.js ile aynı)
// Sıra yayın sırasıdır (blogseed.js 2 günde bir yayına alır); yazılar yalnız kendinden önce yayımlanan yazılara bağlantı verir.
export const POSTS_2A = [
  {
    slug: "e-ticaret-sahis-sirketi-mi-limited-sirket-mi",
    title: "E-Ticaret İçin Şirket Kurmak: Şahıs Şirketi mi, Limited Şirket mi? (2026)",
    seo_title: "E-Ticaret İçin Şahıs Şirketi mi, Limited mi? (2026)",
    seo_desc: "E-ticaret için şahıs şirketi mi limited şirket mi? Vergi, sorumluluk, sermaye, muhasebe ve pazaryeri şartları tek tabloda. Doğru kararı verin, okuyun.",
    summary: "Pazaryerinde satış için şahıs şirketi mi, limited şirket mi kurmalısınız? Vergi (gelir vergisi, %25 kurumlar vergisi, %15 kâr payı stopajı), borç sorumluluğu, 50.000 TL asgari sermaye, kuruluş adımları ve e-ticarete özel yükümlülükleri karşılaştırıyoruz.",
    tags: ["Şirket Kuruluşu","Vergi","E-Ticaret","Rehber"],
    cover: "e-ticaret-sirket-kurma-kapak.jpg",
    body: `E-ticarete yeni başlayan ve tek başına çalışacak satıcıların çoğu için **şahıs şirketi** daha pratik bir başlangıçtır: kuruluşu hızlı, sermaye şartı yoktur, muhasebesi daha sadedir ve Trendyol, Hepsiburada, N11 ya da Amazon gibi pazaryerleri şahıs şirketini kabul eder. **Limited şirket** ise kârınız belirli bir seviyeyi aştığında, ortakla çalışacağınızda ya da kişisel malvarlığınızı işin risklerinden ayırmak istediğinizde öne çıkar. Doğru seçim; beklediğiniz kâra, ortaklık yapınıza, risk iştahınıza ve büyüme planınıza göre değişir. Bu kararı, kendi rakamlarınızla bir mali müşavire hesaplatarak vermelisiniz.

Bu yazıda iki şirket türünü e-ticaret satıcısının gözünden karşılaştırıyoruz: vergilendirme nasıl işler, borçlardan kim sorumludur, kuruluş ve muhasebe süreci nasıl ilerler, pazaryerleri ne ister, e-ticarete özel hangi yükümlülükler vardır. Vergi tarifeleri ve tutarlar her yıl değiştiği için yalnızca resmî kaynaklardan doğrulanabilen oranları veriyoruz; kendi durumunuza uygulanan rakamları mutlaka mali müşavirinizle kontrol edin.

## Pazaryerleri hangi şirket türlerini kabul ediyor?

Türkiye'deki büyük pazaryerlerinin hiçbiri satıcıdan limited şirket şartı aramaz. Trendyol, Hepsiburada, N11 ve Amazon.com.tr; şahıs şirketi, limited şirket ve anonim şirketlerle çalışır. Hepsinde ortak şart, vergi mükellefi olmanız ve her satış için fatura düzenleyebilmenizdir. Şirket türüne göre değişen tek şey, başvuruda istenen belgelerdir:

- **Şahıs şirketinde** genellikle vergi levhası, imza beyannamesi ya da imza sirküleri ve kimlik belgesi istenir.
- **Limited ve anonim şirkette** bunlara ticaret sicil gazetesi ve faaliyet belgesi eklenir.

Pazaryerlerine göre belge listelerini [Trendyol mağaza açma](/blog/trendyol-magaza-acma-rehberi) ve [Hepsiburada satıcı olma](/blog/hepsiburada-satici-olma-magaza-acma) rehberlerimizde ayrıntılı olarak anlattık. Kısacası şirket türü, pazaryerinde satış yapıp yapamayacağınızı değil; vergi yükünüzü, sorumluluğunuzu ve maliyetlerinizi belirler.

## Şahıs şirketi nedir?

Şahıs şirketi (şahıs işletmesi), tek bir gerçek kişinin kendi adına ticari faaliyet yürütmesidir. Ayrı bir tüzel kişilik yoktur: işletme ile işletme sahibi hukuken aynı kişidir.

**Öne çıkan özellikleri:**

- **Kuruluş hızlı ve masrafı düşüktür.** Vergi dairesine işe başlama bildirimi ve faaliyetinize göre ilgili oda ile sicil kayıtlarıyla kurulur; sermaye koymanız gerekmez.
- **Kazanç gelir vergisine tabidir.** Gelir vergisi artan oranlıdır: tarife %15'ten başlar, kazanç yükseldikçe üst dilimlerde %40'a kadar çıkar. Dilim tutarları her yıl güncellenir.
- **Muhasebe daha sadedir.** Kanuni hadleri aşmadıkça işletme hesabı esasına göre defter tutulabilir; bu da mali müşavir ücretini genellikle düşürür.
- **Sorumluluk sınırsızdır.** İşletmenin borçlarından işletme sahibi tüm kişisel malvarlığıyla sorumludur.
- **Kâr doğrudan sahibinindir.** Kazancın vergisini ödedikten sonra parayı işletmeden çekmek için ayrıca kâr dağıtımı yapmanız gerekmez.

## Limited şirket nedir?

Limited şirket, bir ya da daha fazla ortak tarafından kurulan, ortaklarından ayrı tüzel kişiliği olan bir sermaye şirketidir. Tek ortakla da kurulabilir.

**Öne çıkan özellikleri:**

- **Asgari sermaye vardır.** 1 Ocak 2024'ten beri yeni kurulan limited şirketlerde asgari sermaye 50.000 TL'dir.
- **Kazanç kurumlar vergisine tabidir.** Genel oran %25'tir (Gelir İdaresi Başkanlığı'nın Mart 2026 tarihli kurumlar vergisi rehberine göre).
- **Kâr dağıtımında ayrıca stopaj vardır.** Şirket kârını gerçek kişi ortaklara dağıttığında, 22 Aralık 2024'ten beri %15 oranında kâr payı stopajı uygulanır.
- **Muhasebe bilanço esasına göredir.** Sermaye şirketleri her zaman bilanço esasına göre defter tutar; bu, mali müşavir ücretinin şahıs şirketine göre genellikle daha yüksek olması demektir.
- **Sorumluluk kural olarak şirkete aittir.** Ticari borçlardan önce şirketin malvarlığı sorumludur; ancak vergi ve SGK prim borçları gibi kamu alacaklarında ortakların ve müdürlerin kişisel sorumluluğu doğabilir (aşağıda açıklıyoruz).

## Şahıs şirketi ve limited şirket karşılaştırması

| Konu | Şahıs şirketi | Limited şirket |
| --- | --- | --- |
| Tüzel kişilik | Yok, işletme sahibiyle aynı | Var, ortaklardan ayrı |
| Kuruluş | Hızlı, düşük masraf | Ana sözleşme, tescil ve ilan; daha fazla adım |
| Asgari sermaye | Yok | 50.000 TL |
| Vergi | Artan oranlı gelir vergisi (%15–%40) | %25 kurumlar vergisi + dağıtılan kârda %15 stopaj |
| Defter | Hadler içinde işletme hesabı | Her zaman bilanço esası |
| Mali müşavir ücreti | Genellikle daha düşük | Genellikle daha yüksek |
| Borç sorumluluğu | Sınırsız, kişisel malvarlığıyla | Kural olarak şirket; kamu borçlarında ortak ve müdür sorumluluğu doğabilir |
| Ortak almak | Mümkün değil (adi ortaklık ayrı bir yapıdır) | Pay devriyle mümkün |
| Pazaryerinde satış | Kabul edilir | Kabul edilir |
| Kimler için uygun? | Tek başına başlayan, kârı henüz düşük-orta seviyede olan satıcılar | Ortaklı, kârı yüksek, büyümeyi ve yatırımı planlayan işletmeler |

![Şahıs şirketi ve limited şirket karşılaştırması: vergi, kâr dağıtımı, asgari sermaye, defter, sorumluluk ve pazaryeri şartı](https://hasturkcrm.com/img/blog/sahis-limited-karsilastirma.jpg "Şahıs şirketi ile limited şirket arasındaki temel farklar")

## Vergi farkı nasıl işler?

Şahıs ile limited arasındaki en çok merak edilen fark vergidir. İki yapının mantığı farklıdır:

**Şahıs şirketinde** yıllık kazancınızın tamamı, artan oranlı gelir vergisi tarifesine göre vergilendirilir. Kazanç düşükken alt dilimlerde kalırsınız ve efektif vergi oranınız düşüktür; kazanç büyüdükçe kazancın üst dilimlere düşen kısmı daha yüksek oranla vergilendirilir.

**Limited şirkette** şirket kazancı önce %25 kurumlar vergisine tabi olur. Kalan kârı şirkette bırakırsanız (örneğin stok ya da yatırım için) bu aşamada ek vergi doğmaz. Kârı ortaklara dağıttığınızda ise gerçek kişi ortaklar için %15 stopaj uygulanır; dağıtılan kâr payının ayrıca yıllık beyannameye girip girmeyeceği tutara göre değişir.

Basitleştirilmiş bir örnekle, limited şirkette 100 TL kâr şöyle ilerler (beyanname etkisi hariç):

| Adım | Tutar |
| --- | --- |
| Şirket kârı | 100,00 TL |
| Kurumlar vergisi (%25) | −25,00 TL |
| Dağıtılabilir kâr | 75,00 TL |
| Kâr payı stopajı (75 × %15) | −11,25 TL |
| **Ortağın eline geçen** | **63,75 TL** |

Bu tablo tek başına "hangisi daha avantajlı" sorusunu cevaplamaz; çünkü şahıs şirketindeki yük, kazancınızın hangi dilime düştüğüne göre değişir. Genel eğilim şudur: kazanç düşük ve orta seviyedeyken şahıs şirketi çoğu zaman daha az vergi ve daha az masrafla çalışır; kazanç yükseldikçe ve özellikle kâr şirkette bırakılıp büyümeye yatırıldıkça limited şirket avantajlı hâle gelebilir. Kırılma noktasını, yıllık kâr tahmininizle mali müşavirinize hesaplatın.

### Yurt içi asgari kurumlar vergisi

2025 hesap döneminden itibaren kurumlar için **yurt içi asgari kurumlar vergisi** uygulaması da vardır: hesaplanan kurumlar vergisi, indirim ve istisnalar düşülmeden önceki kurum kazancının %10'undan az olamaz. Gelir İdaresi'nin rehberine göre **ilk defa faaliyete başlayan kurumlara**, faaliyete başladıkları hesap döneminden itibaren üç hesap dönemi boyunca bu hükümler uygulanmaz. Yeni kuracağınız bir limited şirket için bu süreyi planlamanıza dahil edin.

### E-ticaret stopajı her iki türde de vardır

1 Ocak 2025'ten beri pazaryerleri, satıcılara yaptıkları ödemelerden %1 stopaj keser. Bu kesinti şirket türünden bağımsızdır ve beyannamede ödeyeceğiniz vergiden mahsup edilir. Stopajın tutarını [e-ticaret stopajı hesaplama aracıyla](/araclar/e-ticaret-stopaj-hesaplama) görebilirsiniz.

## Borçlardan kim sorumlu?

Şahıs şirketinde işletme ile sahibi aynı kişi olduğu için, işletmenin tüm borçlarından (tedarikçi, kredi, vergi, SGK) işletme sahibi kişisel malvarlığıyla sınırsız sorumludur.

Limited şirkette ticari borçlardan kural olarak şirketin malvarlığı sorumludur. Ancak bu ayrımın önemli bir istisnası vardır: **kamu alacakları.** 6183 sayılı Amme Alacaklarının Tahsil Usulü Hakkında Kanun'a göre şirketten tahsil edilemeyen vergi ve benzeri kamu alacaklarından ortaklar sermaye payları oranında sorumlu tutulabilir; şirket müdürleri ise kanuni temsilci sıfatıyla ayrıca sorumlu olabilir. Yani limited şirket, "hiçbir borçtan kişisel olarak sorumlu olmam" anlamına gelmez; vergisini ve primini düzenli ödeyen bir şirkette ise kişisel malvarlığınızı ticari risklerden ayırmanın güçlü bir yoludur.

## Kuruluş süreci

### Şahıs şirketi nasıl kurulur?

1. **Mali müşavirle faaliyet kodunu belirleyin.** İnternet üzerinden satışı kapsayan doğru faaliyet kodunu seçin.
2. **İşe başlama bildirimini yapın.** Vergi dairesine işe başlama bildirimi verilir; işyeri adresiniz için vergi dairesi yoklama yapabilir. Ev adresinizi işyeri olarak göstermeyi düşünüyorsanız uygunluğunu önceden sorun.
3. **Oda ve sicil kaydını yapın.** Faaliyetinize ve ölçeğinize göre ticaret odası ve ticaret siciline ya da esnaf ve sanatkârlar odası ve siciline kaydolursunuz.
4. **Bağ-Kur kaydı.** Şahıs işletmesi sahibi olarak 5510 sayılı Kanun'un 4/b kapsamında (Bağ-Kur) sigortalı olursunuz.
5. **e-Arşiv / e-Fatura ve banka hesabı.** Fatura altyapınızı kurun, işletme adına banka hesabı açın.

### Limited şirket nasıl kurulur?

1. **Ana sözleşmeyi hazırlayın.** Şirket unvanı, merkezi, faaliyet konusu, sermaye ve ortaklık payları MERSİS (Merkezi Sicil Kayıt Sistemi) üzerinden girilir.
2. **Sermayeyi belirleyin.** Asgari sermaye 50.000 TL'dir; sermayenin ödenme koşullarını mali müşavirinizle planlayın.
3. **İmza ve tescil.** Kuruluş belgeleri ticaret sicil müdürlüğünde imzalanır, şirket tescil edilir ve Türkiye Ticaret Sicili Gazetesi'nde ilan edilir.
4. **Vergi kaydı ve oda kaydı.** Tescille birlikte vergi kaydı açılır, şirket ilgili ticaret odasına kaydolur.
5. **Bağ-Kur.** Limited şirket ortakları da 4/b (Bağ-Kur) kapsamında sigortalı sayılır.
6. **e-Fatura altyapısı, defterler ve banka hesabı.** Şirket adına banka hesabı açılır, fatura ve defter altyapısı kurulur.

> **Mevcut limited şirketler için önemli tarih:** 7511 sayılı Kanun ile yapılan düzenlemeye göre sermayesi 50.000 TL'nin altında olan limited şirketler (ve 250.000 TL'nin altında olan anonim şirketler), sermayelerini **31 Aralık 2026'ya kadar** bu tutarlara yükseltmezse infisah etmiş (sona ermiş) sayılır. Eski bir limited şirketle satış yapıyorsanız sermayenizi kontrol edin.

## E-ticarete özel yükümlülükler

Şirket türünden bağımsız olarak, internetten satış yapan her işletmenin bilmesi gereken başlıca konular:

- **Fatura:** Her satış için fatura düzenlersiniz. Pazaryeri satıcılarının çoğu e-Arşiv fatura ile çalışır; alıcı e-Fatura mükellefiyse e-Fatura düzenlenir. e-Fatura'ya geçiş zorunluluğu hasılat sınırlarına bağlıdır ve bu sınırlar ile geçiş tarihleri son yıllarda birkaç kez değişti; size uygulanan güncel kuralı mali müşavirinize sorun.
- **%1 e-ticaret stopajı:** Pazaryeri ödemelerinden kesilir, beyannamede mahsup edilir.
- **ETBİS kaydı:** Kendi e-ticaret siteniz üzerinden satış yapıyorsanız Ticaret Bakanlığı'nın Elektronik Ticaret Bilgi Sistemi'ne (ETBİS) kayıt yükümlülüğünüz vardır. Yalnız yurt içi pazaryerlerinde satış yapıyorsanız genellikle gerekmez; yurt dışı pazaryerlerinde satış gibi durumlar için güncel esasları Ticaret Bakanlığı'ndan kontrol edin.
- **Tüketici mevzuatı:** Mesafeli satışlarda ön bilgilendirme, mesafeli satış sözleşmesi ve tüketicinin 14 günlük cayma hakkı gibi kurallar uygulanır.
- **KDV:** Satışlarınızda hesapladığınız KDV ile alışlarınızda ve pazaryeri faturalarında ödediğiniz KDV arasındaki farkı beyan edersiniz. Fiyatlarınızı KDV dahil ve hariç doğru hesaplamak için [KDV hesaplama aracını](/araclar/kdv-hesaplama) kullanabilirsiniz.

## Gençlere ve evden üretim yapanlara özel durumlar

### Genç girişimci kazanç istisnası

Gelir Vergisi Kanunu'nun 20/A maddesindeki genç girişimci istisnası, **şahıs işletmeleri** içindir. Ticari faaliyetiyle ilk kez gelir vergisi mükellefi olan ve mükellefiyet başladığında 29 yaşını doldurmamış kişilerin kazancının belirli bir tutarı, faaliyete başlanan yıldan itibaren üç vergilendirme dönemi boyunca gelir vergisinden istisnadır. İşe başlamanın kanuni süresinde bildirilmesi ve işin bizzat yürütülmesi gibi şartlar vardır; istisna tutarı her yıl güncellenir. Şartları sağlayanlar için bir yıl süreyle Bağ-Kur prim desteği de öngörülmüştür. Şartları taşıyorsanız bu durum şahıs şirketi lehine güçlü bir sebep olabilir; uygunluğunuzu mali müşavirinize teyit ettirin.

### Esnaf muaflığı

Evinde kendi ürettiği el emeği ürünleri ticari bir organizasyon kurmadan internetten satanlar için Gelir Vergisi Kanunu'nda belirli hasılat sınırlarıyla esnaf muaflığı imkânı vardır. Ancak muafiyetin kapsamı dardır ve pazaryerlerinin çoğu başvuruda vergi levhası ister. Bu yolu düşünüyorsanız hem muafiyet şartlarını hem de satış yapmak istediğiniz pazaryerinin muafiyet belgesini kabul edip etmediğini önceden kontrol edin.

## Hangi durumda hangisini seçmeli?

**Şahıs şirketi genellikle daha uygundur, eğer:**

- Tek başınıza başlıyorsanız ve ilk yıllarda kârınızın düşük ya da orta seviyede kalmasını bekliyorsanız,
- Genç girişimci istisnasından yararlanabiliyorsanız,
- Kuruluş ve muhasebe maliyetini düşük tutmak istiyorsanız,
- İşi hızla başlatıp pazaryerinde ürünü test etmek istiyorsanız.

**Limited şirket genellikle daha uygundur, eğer:**

- Bir ya da daha fazla ortakla çalışacaksanız,
- Kârınız yüksekse ya da kısa sürede yükselmesini bekliyorsanız ve kârın bir kısmını şirkette bırakıp büyümeye yatıracaksanız,
- Yüksek tutarlı stok, kredi ya da tedarikçi borcu gibi ticari riskler alıyorsanız ve kişisel malvarlığınızı ayırmak istiyorsanız,
- Kurumsal tedarikçiler, yatırımcılar ya da finansman kuruluşlarıyla çalışmayı planlıyorsanız.

Çoğu satıcı için gerçekçi yol şudur: şahıs şirketiyle başlamak, satışları ve kârı düzenli izlemek, kâr belirli bir seviyeye ulaştığında mali müşavirle birlikte limited şirkete geçişi değerlendirmek. Geçişin yöntemi ve vergisel sonuçları ayrıca planlanmalıdır.

## Mali müşavirinize sormanız gereken 8 soru

1. Benim tahmini yıllık kârımda şahıs ve limited şirketin toplam vergi yükü ne olur?
2. Hangi faaliyet kodunu kullanmalıyım?
3. Ev adresimi işyeri olarak gösterebilir miyim?
4. İşletme hesabı mı, bilanço esası mı tutacağım; aylık ücretiniz ne olur?
5. Genç girişimci istisnasından ya da başka bir destekten yararlanabilir miyim?
6. e-Arşiv ve e-Fatura için hangi kurallar bana uygulanır, hangi tarihten itibaren?
7. Pazaryeri hakedişlerimi, komisyon faturalarını ve stopajı nasıl kaydedeceğiz?
8. Hangi kâr seviyesinde limited şirkete geçmeyi konuşmalıyız?

## Şirketi kurduktan sonra: gerçek kârınızı görün

Şirket türü ne olursa olsun, vergi planlamasının temeli **doğru kâr bilgisidir.** Pazaryerinde ciro yüksek görünse de komisyon, kargo, hizmet bedeli, stopaj, reklam ve iadeler düşüldüğünde gerçek kâr çok farklı çıkabilir. Mali müşavirinize ciroyu değil, gerçek kârı götürmeniz hem şirket türü kararını hem de vergi planlamasını doğrudan etkiler.

Hastürk CRM'in [gelir, gider ve kâr-zarar](/ozellikler/kar-zarar) bölümü satıştan net kâra her basamağı gösterir: Trendyol ve Hepsiburada'nın kestiği komisyon, kargo ve reklam faturaları ile hakedişler kendiliğinden panele gelir; kira, personel gibi işletme giderlerinizi de girerek dönem kârınızı görürsünüz. [Ekip ve yetki](/ozellikler/ekip-ve-guvenlik) ayarlarındaki hazır muhasebe rolüyle mali müşavirinize ya da muhasebe personelinize yalnız ihtiyaç duyduğu bölümleri açabilirsiniz. Satışa yeni başlıyorsanız ilk adımları [Trendyol mağaza açma rehberimizde](/blog/trendyol-magaza-acma-rehberi) bulabilirsiniz.

Kayıt olmadan [canlı demoyu](/demo) inceleyebilir, mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Şahıs şirketiyle Trendyol ve Hepsiburada'da satış yapılır mı?

Evet. Trendyol, Hepsiburada, N11 ve Amazon.com.tr şahıs şirketlerini kabul eder. Şirket türü satış yapıp yapamayacağınızı değil, vergi yükünüzü, sorumluluğunuzu ve muhasebe maliyetinizi belirler.

### Limited şirket kurmak için ne kadar sermaye gerekir?

1 Ocak 2024'ten beri yeni kurulan limited şirketlerde asgari sermaye 50.000 TL'dir. Sermayesi bu tutarın altında olan mevcut limited şirketlerin sermayelerini 31 Aralık 2026'ya kadar yükseltmesi gerekir.

### Limited şirkette vergi oranı nedir?

Kurumlar vergisinin genel oranı %25'tir. Şirket kârını gerçek kişi ortaklara dağıttığında ayrıca %15 kâr payı stopajı uygulanır. Ayrıca yurt içi asgari kurumlar vergisi kuralları vardır; ilk defa faaliyete başlayan kurumlara ilk üç hesap döneminde uygulanmaz.

### Şahıs şirketinde vergi oranı nedir?

Şahıs şirketinin kazancı artan oranlı gelir vergisine tabidir. Tarife %15'ten başlar ve kazanç yükseldikçe üst dilimlerde %40'a kadar çıkar; dilim tutarları her yıl güncellenir.

### Şahıs şirketinden limited şirkete geçilebilir mi?

Evet, işletme büyüdüğünde limited şirkete geçmek mümkündür. Ancak geçişin yöntemi (yeni şirket kurmak, işletmeyi devretmek gibi) ve vergisel sonuçları farklıdır; geçişi mali müşavirinizle planlayın.

### E-ticaret için hangi şirket türü daha az vergi öder?

Tek bir doğru cevap yoktur. Kazanç düşük ve orta seviyedeyken şahıs şirketi çoğu zaman daha az vergi ve masrafla çalışır; kazanç yükseldikçe ve kâr şirkette bırakıldıkça limited şirket avantajlı hâle gelebilir. Kırılma noktasını kendi rakamlarınızla mali müşavirinize hesaplatın.
`,
  },
  {
    slug: "amazon-turkiye-satici-olma-rehberi",
    title: "Amazon Türkiye'de Satış Yapmak: Satıcı Hesabı Açma Rehberi (2026)",
    seo_title: "Amazon'da Satış Yapmak 2026: Satıcı Hesabı Açma Rehberi",
    seo_desc: "Amazon Türkiye'de satıcı olmak için gerekenler: belgeler, kayıt adımları, satış ücreti, ürün listeleme, FBA ve kendi gönderiminiz. Rehberi hemen okuyun.",
    summary: "Amazon.com.tr'de satış yapmak için vergi kaydı olan bir işletme, kimlik, kredi kartı ve banka hesabı gerekir. Kayıt adımlarını, satış ücretlerini, ASIN ve GTIN ile ürün listelemeyi, Amazon Lojistik (FBA) ile kendi gönderiminiz arasındaki farkı anlatıyoruz.",
    tags: ["Amazon","Mağaza Açma","Pazaryeri","Rehber"],
    cover: "amazon-satici-kapak.jpg",
    body: `Amazon Türkiye'de (Amazon.com.tr) satış yapmak için vergi kaydı olan bir işletmeniz (şahıs, limited ya da anonim şirket), geçerli bir kimlik belgesi, kredi kartı, şirket adına banka hesabı, telefon numarası ve e-posta adresiniz olmalıdır. Kayıt, Amazon'un Türkiye satıcı sitesindeki "Kaydol" adımıyla başlar; işletme ve kişi bilgilerinizi girer, kimlik ve adres doğrulamasını tamamlar, ödeme bilgilerinizi ve mağaza adınızı eklersiniz. Hesabınız onaylandıktan sonra ürünlerinizi listeler ve siparişleri ister kendiniz gönderirsiniz, ister Amazon'un deposuna bırakıp gönderimi Amazon'a yaptırırsınız.

Bu rehberde Amazon satıcı hesabı açmayı baştan sona anlatıyoruz: kimler satış yapabilir, hangi belgeler gerekir, kayıt adımları nasıl ilerler, ürün nasıl listelenir, Amazon Lojistik (FBA) ile kendi gönderiminiz arasındaki fark nedir, kesintiler nasıl hesaplanır ve ilk aylarda nelere dikkat etmelisiniz. Amazon'un ücret ve kampanyaları sık değiştiği için kesin rakam vermiyoruz; her bölümde güncel bilgiyi nereden kontrol edeceğinizi belirtiyoruz.

## Amazon Türkiye’de kimler satış yapabilir?

Amazon.com.tr'de satış yapmak için ticari faaliyetinizi yasal olarak yürüten, vergi mükellefi bir işletmeniz olmalıdır. Şahıs şirketi, limited şirket ve anonim şirket kabul edilir. Zaten faal bir şirketiniz varsa e-ticaret için ayrıca şirket kurmanız gerekmez; mevcut şirketinizle başvurabilirsiniz.

Şirketiniz yoksa önce bir mali müşavirle birlikte şirket türüne karar vermeniz gerekir. Şahıs şirketi ile limited şirket arasındaki vergi, sorumluluk ve maliyet farklarını [e-ticaret için şahıs şirketi mi, limited şirket mi](/blog/e-ticaret-sahis-sirketi-mi-limited-sirket-mi) yazımızda ayrıntılı olarak ele alıyoruz.

> **Not:** Şahıs şirketlerinde kayıt formundaki vergi kimlik numarası alanına, vergi levhanızda yazan T.C. kimlik numaranızı girersiniz. Bu küçük ayrıntı, yeni başlayanların kayıtta en sık takıldığı noktalardan biridir.

## Amazon satıcı hesabı açmak için gerekenler

Kayda başlamadan önce aşağıdakileri hazır edin. Belgelerin çoğunu sisteme bilgi olarak girer ya da taranmış hâlde yüklersiniz; kayıt için ayrıca basılı evrak göndermeniz gerekmez.

| Gereken | Açıklama |
| --- | --- |
| İşletme bilgileri | Unvan, işletme türü, vergi numarası ve vergi dairesi, ticaret sicil ve MERSİS numarası (varsa), kayıtlı adres |
| Kimlik belgesi | Hesaptan sorumlu kişinin geçerli kimlik kartı ya da pasaportu |
| Adres doğrulama belgesi | Adınıza düzenlenmiş güncel bir banka ya da kredi kartı ekstresi veya fatura gibi belgeler |
| Kredi kartı | Ücretlerin tahsil edilebilmesi için geçerli bir kredi kartı |
| Banka hesabı | Satış gelirlerinin yatacağı, işletmenize ait IBAN |
| Telefon ve e-posta | Doğrulama için ulaşılabilir bir cep telefonu ve ticari e-posta adresi |

Belgelerdeki ad, unvan ve adres bilgilerinin forma girdiğiniz bilgilerle birebir aynı olmasına dikkat edin. Amazon, kimlik ve adres doğrulaması sırasında gerekli görürse sizinle görüntülü görüşme de planlayabilir.

## Amazon’da satıcı hesabı açma adımları

1. **Satıcı sitesine gidin.** Amazon Türkiye'nin satıcı sitesinde "Kaydol" ya da "Hesap aç" düğmesine tıklayın ve e-posta adresinizle bir hesap oluşturun.
2. **E-postanızı doğrulayın.** Gelen doğrulama kodunu girerek kaydı başlatın.
3. **İşletme bilgilerinizi girin.** İşletme türünüzü, unvanınızı, vergi ve sicil bilgilerinizi, işletme adresinizi doldurun.
4. **Kişisel bilgileri tamamlayın.** Hesaptan sorumlu kişinin kimlik ve iletişim bilgilerini girin.
5. **Ödeme bilgilerini ekleyin.** Kredi kartınızı ve satış gelirlerinin yatacağı banka hesabını tanımlayın.
6. **Mağaza adınızı belirleyin.** Müşterilerin göreceği adı seçin; kısa, akılda kalıcı ve markanızla uyumlu olsun.
7. **Kimlik ve adres doğrulamasını tamamlayın.** İstenen belgeleri yükleyin; gerekirse görüntülü görüşmeye katılın.
8. **Onaydan sonra Satıcı Merkezi'ne girin.** Hesabınız onaylandığında Amazon'un satıcı paneli olan Satıcı Merkezi (Seller Central) üzerinden ürün eklemeye başlayabilirsiniz.

Onay süresi, belgelerinizin eksiksiz ve tutarlı olmasına göre değişir. Doğrulama sırasında hata alırsanız bilgileri belgelerle karşılaştırıp düzeltin; aynı bilgilerle tekrar tekrar başvurmak süreci hızlandırmaz.

## Satış planı ve kesintiler: Amazon’da maliyetler nasıl oluşur?

Amazon'da maliyetler birkaç kalemden oluşur. Rakamlar değişebildiği için kendi kategorinizin güncel ücretlerini Amazon'un Türkiye ücretlendirme sayfasından ve Satıcı Merkezi'nden kontrol edin.

- **Satış planı / abonelik ücreti:** Profesyonel satış planında aylık bir üyelik ücreti vardır. Amazon Türkiye zaman zaman bu ücrete yönelik muafiyet kampanyaları duyurur; kayıt olduğunuz dönemde geçerli bir kampanya olup olmadığını ücretlendirme sayfasından kontrol edin.
- **Satış ücreti (komisyon):** Kategoriye göre değişen bir orandır ve KDV'ye tabidir. Amazon'un ücretlendirme sayfasına göre bu ücret, alıcının ödediği toplam tutar üzerinden, yani ürün fiyatına kargo ücreti de dahil edilerek hesaplanır.
- **Gönderim ücretleri:** Amazon Lojistik kullanıyorsanız depolama ve gönderim ücretleri; Amazon'un anlaşmalı kargosunu kullanıyorsanız kargo ücreti.
- **Reklam:** Sponsorlu Ürünler gibi reklamları kullanırsanız tıklama başına ödediğiniz bedel.
- **E-ticaret stopajı:** 1 Ocak 2025'ten beri elektronik ticaret aracı hizmet sağlayıcıları, satıcılara yaptıkları ödemelerde %1 stopaj (gelir vergisi kesintisi) uygular. Bu kesinti, yıllık beyannamenizde ödeyeceğiniz vergiden mahsup edilir.

### Komisyonun kargo dahil hesaplanması neden önemli?

Komisyonun yalnız ürün fiyatı üzerinden değil, alıcının ödediği toplam tutar üzerinden hesaplanması, kargo ücretini müşteriye yansıttığınız durumlarda kesintinin beklediğinizden yüksek çıkmasına yol açabilir. Fiyatınızı belirlerken bu farkı hesaba katın. Kendi komisyon oranınızla hakedişinizi görmek için [pazaryeri komisyon hesaplama aracını](/araclar/pazaryeri-komisyon-hesaplama), hedef kârınıza göre fiyat bulmak için [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) kullanabilirsiniz. Stopajın nasıl hesaplandığını [e-ticaret stopajı hesaplama aracında](/araclar/e-ticaret-stopaj-hesaplama) görebilirsiniz.

## Amazon’da ürün listeleme: ASIN, GTIN ve marka kaydı

Amazon'da her ürünün tek bir ürün detay sayfası vardır ve her ürüne Amazon tarafından **ASIN** adı verilen benzersiz bir kod atanır. Aynı ürünü satan satıcılar aynı ASIN'e teklif ekler. Bu yüzden ürün eklerken iki durumla karşılaşırsınız:

- **Ürün Amazon'da zaten varsa:** Satıcı Merkezi'nde "Ürün Ekle" bölümünden ürünü arar, mevcut sayfaya kendi fiyatınız, stoğunuz ve ürün durumunuzla teklif eklersiniz. Bu durumda ayrıca barkod (GTIN) girmeniz gerekmez.
- **Ürün Amazon'da yoksa:** Yeni ürün sayfası oluşturursunuz. Bunun için genellikle ürünün GTIN'i (EAN, UPC gibi barkod) gerekir. Özel markalı ve barkodu olmayan ürünler gibi bazı durumlarda **GTIN muafiyeti** talep edebilirsiniz; uygunluk ürüne göre değerlendirilir.

Kendi markanızla satış yapıyorsanız **Amazon Marka Kaydı** programını inceleyin. Amazon'un açıklamasına göre bu program için markanızın, kaydolmak istediğiniz ülkede tescilli ya da tescil başvurusu yapılmış bir ticari marka olması gerekir. Marka kaydı, ürün sayfanız üzerindeki kontrolünüzü artırır ve markanızı korumanıza yardımcı olur.

### İyi bir Amazon ürün sayfası için kontrol listesi

- Başlıkta marka, ürün türü, temel özellik ve varyant bilgisi (renk, beden, kapasite) yer alsın.
- Ana görsel sade arka planlı ve net olsun; diğer görsellerde ölçü, kullanım ve detayları gösterin.
- Madde işaretli özellikler bölümünde müşterinin en çok merak ettiği bilgileri öne çıkarın.
- Ölçü, malzeme, uyumluluk ve garanti bilgisini eksiksiz yazın; eksik bilgi soruya, yanlış bilgi iadeye dönüşür.
- Varyantları (renk, beden) ayrı ürünler yerine aynı ürün ailesi altında toplayın.

## Gönderim seçenekleri: Amazon Lojistik (FBA) mı, kendi gönderiminiz mi?

Amazon Türkiye'de siparişleri üç farklı yolla gönderebilirsiniz. Hangisinin size uygun olduğu; sipariş hacminize, ürününüzün boyutuna, depo ve personel imkânlarınıza bağlıdır.

| | Amazon Lojistik (FBA) | Amazon anlaşmalı kargo | Kendi gönderiminiz |
| --- | --- | --- | --- |
| Stok nerede? | Amazon'un anlaşmalı lojistik merkezinde | Sizin deponuzda | Sizin deponuzda |
| Paketleme | Amazon | Siz | Siz |
| Kargo | Amazon | Amazon'un anlaşmalı kargo firması adresinizden alır | Kendi kargo anlaşmanız |
| Müşteri hizmetleri ve iade | Amazon yürütür | Siz yürütürsünüz | Siz yürütürsünüz |
| Prime etiketi | Amazon'a göre en kolay yol | Programın güncel şartlarına bağlı | Programın güncel şartlarına bağlı |
| En uygun olduğu durum | Hızlı dönen, küçük-orta boy ürünler | Kendi kargo anlaşması olmayan yeni satıcılar | Kendi kargo anlaşması güçlü satıcılar |

### Amazon Lojistik (FBA) nasıl çalışır?

Amazon Lojistik'te ürünlerinizi Amazon'un anlaşmalı lojistik merkezine gönderirsiniz. Amazon ürünleri teslim alır, depolar, sipariş geldiğinde hazırlayıp müşteriye gönderir; bu süreçteki müşteri hizmetlerini ve iadeleri de sizin adınıza yürütür. Envanterinizi ve satışlarınızı Satıcı Merkezi'nden takip edersiniz. Amazon'a göre Amazon Lojistik, ürünlerinize Prime etiketi kazandırmanın en kolay yoludur.

FBA'nın karşılığında depolama ve gönderim ücretleri ödersiniz. Uzun süre satılmayan stok, depolama maliyeti yüzünden kârınızı eritebilir. Bu yüzden FBA'ya önce hızlı dönen ürünlerinizi, sınırlı miktarda göndermek mantıklıdır.

### Kendi gönderiminiz nasıl çalışır?

Siparişi kendiniz hazırlayıp gönderdiğinizde ürün sizin deponuzda kalır, kontrol sizdedir. Amazon Türkiye, satıcıların kendi adresinden alınan siparişleri anlaşmalı kargo firmalarıyla gönderebileceği bir hizmet ve Satıcı Merkezi üzerinden kargo etiketi satın alma imkânı da sunar. Kendi kargo anlaşmanızı kullanıyorsanız kargo firmasını ve takip numarasını siparişe girmeniz gerekir; müşteri kargosunu bu bilgiyle takip eder.

Kargo ücretini doğru tahmin etmek için paketinizin desisini bilmeniz gerekir. Formülü ve örnekleri [desi nedir, nasıl hesaplanır](/blog/desi-nedir-nasil-hesaplanir) rehberimizde bulabilirsiniz.

## Amazon’da satıcı performansı: hesap sağlığını koruyun

Amazon, satıcıların müşteri deneyimini nasıl yönettiğini yakından izler. Satıcı Merkezi'ndeki hesap sağlığı bölümünde sipariş hataları, geç gönderimler, satıcı kaynaklı iptaller ve politika uyumu gibi göstergeleri görürsünüz. Bu göstergelerin bozulması, ürünlerinizin görünürlüğünü ve hesabınızın durumunu etkileyebilir.

Kendi gönderiminizi yapıyorsanız en çok dikkat etmeniz gerekenler şunlardır:

- **Gönderim süresine uyun.** Belirttiğiniz hazırlık süresi içinde kargoya verin ve takip numarasını zamanında girin.
- **Stoğu doğru tutun.** Elinizde olmayan ürünün siparişini iptal etmek performansınızı düşürür. Amazon'un yanında başka kanallarda da satıyorsanız stoklarınızı eşitlemeniz şarttır; yöntemler için [e-ticarette stok takibi](/blog/e-ticarette-stok-takibi-fazla-satis) rehberimize bakın.
- **Mesajları hızlı yanıtlayın.** Alıcı mesajlarına geç dönmek, olumsuz geri bildirim riskini artırır.
- **Ürün bilgisini doğru verin.** Açıklamayla uyuşmayan ürün, hem iade hem de şikâyet sebebidir.

## Avrupa’ya satış: Amazon Global Satış

Amazon.com.tr'de satış yapan satıcılar, Amazon'un Global Satış programıyla Avrupa'daki Amazon mağazalarında da satış yapmayı değerlendirebilir. Ancak yurt dışı satış; gümrük, vergi, ürün mevzuatı, dil ve iade lojistiği gibi ayrı bir hazırlık gerektirir. Önce Türkiye'de süreçlerinizi oturtmanızı, sonra programın güncel şartlarını Amazon'un Türkiye satıcı sitesindeki Global Satış sayfasından incelemenizi öneririz.

## Amazon başvurusu öncesi kontrol listesi

- Şirketiniz faal, vergi levhanız ve sicil bilgileriniz güncel.
- Hesaptan sorumlu kişinin geçerli kimlik belgesi hazır.
- Adres doğrulaması için adınıza düzenlenmiş güncel bir belge hazır.
- Geçerli bir kredi kartı ve işletmenize ait banka hesabı var.
- e-Arşiv / e-Fatura altyapınız kurulu; her sipariş için fatura kesebilecek durumdasınız.
- Satacağınız ürünlerin barkodları (GTIN) ya da muafiyet durumunuz belli.
- Ürün görselleri, açıklamaları ve paket ölçüleri hazır.
- Satış ücreti, kargo, stopaj ve reklam sonrası kârınızı gösteren bir fiyat listeniz var.
- Gönderim modelinize (FBA, anlaşmalı kargo ya da kendi gönderiminiz) karar verdiniz.

## İlk 90 günde Amazon’da satışları büyütmek için

1. **Az ürünle, iyi tanıdığınız kategoride başlayın.** Stoğunu garanti edebildiğiniz, iade riski düşük ürünler seçin.
2. **Kârı baştan hesaplayın.** Satış ücretinin kargo dahil tutar üzerinden hesaplandığını unutmayın. Aynı ürünün farklı kanallardaki kârını yan yana görmek için [kâr karşılaştırma aracını](/araclar/kar-karsilastirma) kullanabilirsiniz.
3. **Ürün sayfasına yatırım yapın.** İyi görsel ve eksiksiz özellik bilgisi, reklamdan önce gelir.
4. **Reklamı küçük bütçeyle test edin.** Hangi ürünün reklamla kârlı sattığını görmeden bütçeyi büyütmeyin.
5. **FBA'yı ölçerek deneyin.** En hızlı dönen birkaç ürünü sınırlı miktarda Amazon Lojistik'e göndererek satış hızı ve maliyet farkını ölçün.
6. **Yorumları ve iadeleri okuyun.** Tekrarlayan şikâyetler, ürün sayfasındaki eksikleri gösterir.

## Amazon’u diğer pazaryerleriyle birlikte yönetmek

Amazon'da satış yapanların çoğu Trendyol, Hepsiburada ya da N11'de de mağaza açar. Kanal sayısı arttıkça asıl zorluk satış değil, operasyon olur: Amazon'da satılan ürünün stoğu diğer kanallarda düşmezse fazla satış yaşanır, her panelde ayrı sipariş takibi yapmak da zaman alır.

Hastürk CRM'in [Amazon entegrasyonu](/entegrasyonlar/amazon) test aşamasındadır ve kullanıma açıktır. Amazon siparişleriniz diğer kanallarla aynı listeye gelir; Amazon'un kendi deposundan gönderdiği (FBA) siparişlerin durumu da izlenir. Stok ve fiyatlarınız ilanlarınıza gönderilir; bir kanalda satılan ürünün stoğu [stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) ile diğer kanallarda da düşer. Kendi gönderiminizde kargo firmasını ve takip numarasını panelden Amazon'a bildirirsiniz. Ürün yükleme, müşteri soruları ve iade talepleri bu entegrasyonda yoktur; bunları Satıcı Merkezi'nden yönetirsiniz. Trendyol tarafının sürecini merak ediyorsanız [Trendyol mağaza açma rehberimize](/blog/trendyol-magaza-acma-rehberi) göz atabilirsiniz.

Kayıt olmadan [canlı demoyu](/demo) inceleyebilir, kendi mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Amazon'da satış yapmak için şirket kurmak gerekir mi?

Evet. Amazon.com.tr'de satış yapmak için vergi kaydı olan bir işletmeniz olmalıdır. Şahıs şirketi, limited şirket ya da anonim şirketle başvurabilirsiniz; faal bir şirketiniz varsa yenisini kurmanız gerekmez.

### Amazon satıcı hesabı açmak ücretli mi?

Amazon'da maliyet iki ana kalemden oluşur: profesyonel satış planının aylık üyelik ücreti ve her satışta kategoriye göre değişen satış ücreti. Bunlara kullandığınız gönderim ve reklam hizmetlerinin bedeli eklenir. Amazon Türkiye zaman zaman üyelik ücretine yönelik muafiyet kampanyaları duyurur; güncel durumu ücretlendirme sayfasından kontrol edin.

### Amazon komisyonu nasıl hesaplanır?

Satış ücreti kategoriye göre değişir ve KDV'ye tabidir. Amazon'un ücretlendirme sayfasına göre bu ücret, alıcının ödediği toplam tutar, yani ürün fiyatı ile kargo ücretinin toplamı üzerinden hesaplanır.

### Amazon FBA Türkiye'de nasıl çalışır?

Amazon Lojistik'te ürünlerinizi Amazon'un anlaşmalı lojistik merkezine gönderirsiniz. Amazon ürünleri depolar, siparişleri hazırlayıp gönderir, müşteri hizmetlerini ve iadeleri yürütür. Karşılığında depolama ve gönderim ücretleri ödersiniz.

### Barkodu olmayan ürünü Amazon'da satabilir miyim?

Ürün Amazon'da zaten listeleniyorsa mevcut sayfaya teklif eklersiniz ve barkod girmeniz gerekmez. Yeni ürün oluşturuyorsanız genellikle GTIN gerekir; özel markalı ürünler gibi bazı durumlarda GTIN muafiyeti talep edebilirsiniz.

### Amazon'u Trendyol ve Hepsiburada ile aynı panelden yönetebilir miyim?

Evet. Hastürk CRM'de Amazon entegrasyonu test aşamasında ve kullanıma açık: siparişler diğer kanallarla aynı listeye gelir, stok ve fiyatlar eşitlenir, kargo takip numarası Amazon'a bildirilir. Ayrıntılar [Amazon entegrasyonu](/entegrasyonlar/amazon) sayfasında.
`,
  },
  {
    slug: "n11-magaza-acma-satis-rehberi",
    title: "N11'de Mağaza Açma ve Satış Yapma Rehberi (2026)",
    seo_title: "N11 Mağaza Açma 2026: Şartlar, Belgeler ve Adımlar",
    seo_desc: "N11'de mağaza nasıl açılır? Şahıs ve limited şirket için belgeler, Satıcı Ofisi başvuru adımları, kargo, kesintiler ve ödeme süreci. Rehberi hemen okuyun.",
    summary: "N11'de mağaza açmak ücretsizdir; vergi numarası olan şahıs ve sermaye şirketleri başvurabilir. Şirket türüne göre belgeleri, Satıcı Ofisi'nde başvuru adımlarını, ürün yükleme, kargo, komisyon ve hizmet bedelleri ile ödeme sürecini anlatıyoruz.",
    tags: ["N11","Mağaza Açma","Pazaryeri","Rehber"],
    cover: "n11-magaza-acma-kapak.jpg",
    body: `N11'de mağaza açmak ücretsizdir ve Türkiye'de vergi numarası, e-posta adresi ve banka hesabı olan şahıs şirketleri ile limited ve anonim şirketler satıcı olabilir. Süreç iki aşamadan oluşur: önce N11'in mağaza üyelik formunu doldurursunuz (bu aşamada evrak istenmez, bilgileriniz Gelir İdaresi kayıtlarıyla kontrol edilir), ardından N11'in satıcı paneli olan **Satıcı Ofisi**'ne girip şirket türünüze göre istenen belgeleri yüklersiniz. Belgeleriniz onaylandığında ürün yükleyip satışa başlayabilirsiniz.

Bu rehberde N11 mağaza açma sürecini adım adım anlatıyoruz: şartlar, şirket türüne göre belgeler, başvuru adımları, ürün yükleme, kargo, kesintiler, ödeme süreci ve ilk satışlarınızı hızlandırmak için yapmanız gerekenler. N11'in oranları ve süreleri değişebildiği için kesin rakam vermiyoruz; güncel bilgiyi Satıcı Ofisi'nde nerede bulacağınızı belirtiyoruz.

## N11’de kimler satış yapabilir?

N11'de satış yapmak için ticari bir işletmeniz olmalıdır; bireysel olarak, yani şirket ya da vergi kaydı olmadan mağaza açılamaz. N11'in mağaza destek sayfalarına göre:

- **Şahıs şirketleri** ve **sermaye şirketleri** (limited, anonim, sermayesi paylara bölünmüş komandit) başvurabilir.
- Türkiye Cumhuriyeti **vergi numarası**, bir **e-posta adresi** ve bir **banka hesabı** gerekir.
- Mağaza açma listesindeki belgeleri sağlayan işletmeler N11'de **ücretsiz** mağaza açabilir.

Şirketiniz yoksa ilk adım, bir mali müşavirle birlikte şirket kurmaktır. Hangi şirket türünün size uygun olduğunu [e-ticaret için şahıs şirketi mi, limited şirket mi](/blog/e-ticaret-sahis-sirketi-mi-limited-sirket-mi) yazımızda karşılaştırdık.

## N11 mağaza açmak için gerekli belgeler

Belgeler, üyelik formunu doldurup hesabınızı etkinleştirdikten sonra Satıcı Ofisi'nden şirket türünüz seçilerek yüklenir. N11'in yayımladığı listelere göre belgeler şirket türüne göre şöyle değişir:

| Belge | Şahıs şirketi | Limited / Anonim şirket |
| --- | --- | --- |
| Vergi levhası | Gerekli (son 1 yıl içinde alınmış) | Gerekli (son 1 yıl içinde alınmış) |
| İmza sirküleri | Gerekli; sicil kaydı yoksa imza beyannamesi | Gerekli |
| Kimlik fotokopisi | Ön yüz | — |
| Faaliyet belgesi | — | Son 6 ay içinde alınmış; yoksa güncel KDV tahakkuk fişi |
| Kuruluş ticaret sicil gazetesi | — | Gerekli |
| Satıcı sözleşmesi ve mali şartlar | Onaylanır | Onaylanır |

N11, gerekli gördüğünde ek belge isteyebilir ve üyeliği onaylama kararı N11'e aittir. Belge listesi zaman zaman güncellendiği için yüklemeden önce Satıcı Ofisi'ndeki güncel listeyi kontrol edin.

> **İpucu:** Vergi levhasının alınma tarihi ve faaliyet belgesinin güncelliği N11'in en sık eksik bulduğu iki konudur. Başvurudan hemen önce güncel belgeleri alırsanız onay süreci gereksiz yere uzamaz.

## N11 mağaza açma adımları

1. **Mağaza üyelik formunu doldurun.** N11'in satıcı başvurusu (mağaza açma) sayfasından formu açın; üyelik türü olarak şahıs ya da şirket seçeneğini işaretleyin. Limited, anonim, komandit şirketler ve kooperatifler "Şirket" seçeneğine girer.
2. **Bilgilerinizi doğru girin.** Unvan, vergi numarası, vergi dairesi ve adres bilgileriniz Gelir İdaresi Başkanlığı kayıtlarıyla kontrol edilir; levhanızdaki bilgilerle birebir aynı olmalıdır.
3. **Hesabınızı etkinleştirin.** E-postanıza gelen bağlantıyla üyeliğinizi aktifleştirin.
4. **Satıcı Ofisi'ne giriş yapın.** N11'in satıcı paneli Satıcı Ofisi, mağazanızın tüm işlemlerini yaptığınız yerdir.
5. **Şirket türünüzü seçip belgelerinizi yükleyin.** Yukarıdaki tabloda yer alan belgeleri taranmış ve okunaklı hâlde yükleyin, sözleşmeleri onaylayın.
6. **Onayı bekleyin.** N11 belgelerinizi inceler; eksik ya da hatalı belge varsa size bildirir.
7. **Mağaza ayarlarını tamamlayın.** Mağaza adı ve logosu, sevkiyat ve iade adresi, kargo tercihleri, banka bilgileri ve iletişim bilgilerinizi girin.
8. **Ürün yükleyin ve satışa başlayın.**

### Mağaza adını seçerken

Mağaza adınız müşterinin sipariş, kargo ve fatura sürecinde gördüğü addır. Kısa, kolay okunan ve markanızla uyumlu bir ad seçin; başka kanallarda da satış yapıyorsanız her kanalda aynı adı kullanmak müşterinin sizi tanımasını kolaylaştırır. Başka bir markayı çağrıştıran ya da tescilli bir markayı içeren adlardan kaçının.

## N11’de ürün yükleme

N11'de ürünlerinizi Satıcı Ofisi'nden tek tek ya da toplu olarak yükleyebilirsiniz. Ürün yüklerken en önemli konu, ürünü doğru kategoriye koymak ve kategorinin istediği özellikleri eksiksiz doldurmaktır; müşteriler filtrelerle arama yaptığında ürününüzün görünmesi buna bağlıdır.

### Ürün yüklerken dikkat edilecekler

- **Başlık:** Marka, ürün türü, model ve ayırt edici özellik (renk, beden, kapasite) başlıkta yer alsın.
- **Kategori ve özellikler:** En doğru alt kategoriyi seçin, zorunlu ve isteğe bağlı özellikleri doldurun.
- **Barkod ve stok kodu:** Her varyant için benzersiz barkod ve stok kodu kullanın. Birden fazla kanalda satıyorsanız aynı ürüne her kanalda aynı stok kodunu vermek, stok takibini çok kolaylaştırır.
- **Görseller:** Net, iyi ışıklı ve ürünü farklı açılardan gösteren görseller yükleyin.
- **Açıklama:** Ölçü, malzeme, kullanım, uyumluluk ve garanti bilgisini açıkça yazın.
- **Hazırlık süresi:** Gerçekten uyabileceğiniz bir kargoya verme süresi belirleyin.

Varyantlı ürünlerde (beden, renk) tüm seçenekleri tek ürün altında toplamak hem müşteri deneyimini hem de ürünün yorum ve satış geçmişini güçlendirir.

## N11’de kargo nasıl çalışır?

N11'de siparişleri, Satıcı Ofisi'ndeki kargo ayarlarında tanımladığınız seçeneklerle gönderirsiniz. N11'in anlaşmalı kargo seçeneklerini kullandığınızda kargo bedeli hakedişinizden düşülebilir; iade gönderimlerinde de anlaşmalı kargo için kampanya numarası kullanılır. Hangi kargo seçeneğinin size hangi koşullarla açık olduğunu ve ücretlerin nasıl yansıtıldığını Satıcı Ofisi'ndeki kargo bölümünden kontrol edin.

Kargo maliyetini önceden tahmin etmek için paketinizin desisini bilmeniz gerekir. Desi; en × boy × yükseklik (cm) ÷ 3000 formülüyle hesaplanır ve gerçek ağırlıkla karşılaştırılarak büyük olan değer ücrete esas alınır. Ayrıntılar için [desi nedir, nasıl hesaplanır](/blog/desi-nedir-nasil-hesaplanir) rehberimize, hızlı hesap için [desi hesaplama aracına](/araclar/desi-hesaplama) bakabilirsiniz.

## N11 komisyonu ve kesintiler

N11'de her satıştan birkaç kalem düşülür. N11'in mağaza destek merkezindeki açıklamaya göre kesintiler şu kalemlerden oluşur:

- **Komisyon:** Kategoriye göre değişen oran. Oranlar satıcıyla yapılan mali şartlar belgesinde ve Satıcı Ofisi'nde yer alır.
- **Pazarlama hizmet bedeli:** Satış tutarı üzerinden alınan bedel (KDV'ye tabi).
- **Pazaryeri hizmet bedeli:** Satış tutarı üzerinden alınan bedel (KDV'ye tabi).
- **E-ticaret stopajı:** 1 Ocak 2025'ten beri satışın KDV hariç tutarının %1'i.
- **Kargo:** N11'in anlaşmalı kargosuyla gönderilen siparişlerde kargo bedeli ayrıca düşülür.

Oranlar zaman zaman güncellendiği için bu yazıda rakam vermiyoruz; kendi oranlarınızı Satıcı Ofisi'nden kontrol edin. Komisyon, hizmet bedelleri, kargo ve stopaj sonrası hakedişinizi ve net kârınızı görmek için [N11 komisyon hesaplama aracımızı](/araclar/n11-komisyon-hesaplama) kullanabilirsiniz.

### Örnek kesinti hesabı

Aşağıdaki oranlar ve tutarlar **varsayımsaldır**; yalnızca hesabın mantığını göstermek için seçilmiştir.

| Kalem | Tutar |
| --- | --- |
| Satış fiyatı (KDV dahil, %20 KDV) | 480,00 TL |
| Komisyon (örnek %12 + KDV = %14,4) | −69,12 TL |
| Hizmet bedelleri (örnek toplam %1,5 + KDV = %1,8) | −8,64 TL |
| Kargo (örnek) | −65,00 TL |
| Stopaj (480 ÷ 1,20 × %1) | −4,00 TL |
| **Hakediş** | **333,24 TL** |

Hakedişten ürünün alış maliyetini ve ödeyeceğiniz KDV farkını düştüğünüzde gerçek kârınızı bulursunuz. KDV farkını da içeren adım adım bir örneği [Trendyol komisyon ve net kâr hesaplama rehberimizde](/blog/trendyol-komisyon-orani-net-kar-hesaplama) anlattık; hesabın mantığı N11 için de aynıdır.

## N11’de ödemeler ne zaman yapılır?

N11'de ödeme süreci, siparişin **tamamlandı** durumuna geçmesiyle başlar. N11'in mağaza destek merkezindeki açıklamaya göre ödemeler, siparişin tamamlanma tarihinden sonra kategori bazlı hesaplama süreleri sonunda hesaplanır ve N11'in belirlediği ödeme günlerinde hesabınıza aktarılır; ödeme günü resmî tatile denk gelirse bir sonraki iş gününe kayar. Ödeme takviminin ayrıntıları dönem dönem değişebildiği için kendi hesabınıza uygulanan takvimi Satıcı Ofisi'nin ödeme ve fatura bölümünden takip edin.

Nakit akışınızı planlarken şunu unutmayın: bugün kargoya verdiğiniz siparişin parası; teslimat, siparişin tamamlanması ve hesaplama süresi eklendiğinde birkaç hafta sonra hesabınıza geçer. Stok alımlarınızı bu gecikmeye göre planlayın.

## Müşteri soruları, iadeler ve mağaza puanı

N11'de satışın sürekliliği, siparişten sonraki süreçlere bağlıdır:

- **Müşteri soruları:** Ürün sayfasındaki sorular diğer müşteriler tarafından da okunur. Hızlı ve net yanıtlar dönüşümü artırır; sık gelen soruların cevabını ürün açıklamasına ekleyin.
- **İade talepleri:** Mesafeli satışlarda tüketici, ürünü teslim aldığı günden itibaren 14 gün içinde gerekçe göstermeden cayma hakkını kullanabilir. Gelen ürünü kontrol edin; satılabilir durumdaysa stoğa geri alın, kullanılmış ya da hasarlı geldiyse gerekçesini belgeleyerek itiraz edin.
- **Mağaza performansı:** Zamanında kargolama, iptal oranı ve müşteri değerlendirmeleri mağazanızın görünürlüğünü etkiler. Stokta olmayan ürünün siparişini iptal etmek en kolay önlenebilecek performans kaybıdır.

## N11’de yeni satıcıların sık yaptığı 6 hata

1. **Kesintileri hesaba katmadan fiyat vermek.** Komisyonun yanında pazarlama ve pazaryeri hizmet bedelleri, stopaj ve kargo da düşülür. Yalnız komisyona bakarak verilen fiyat, satıldıkça zarar ettirebilir.
2. **Yanlış kategoriye ürün yüklemek.** Ürün yanlış kategorideyse hem filtrelerde görünmez hem de beklediğinizden farklı bir komisyon oranıyla karşılaşabilirsiniz.
3. **Varyantları ayrı ürünler olarak açmak.** Aynı ürünün renk ve bedenlerini ayrı ilanlara bölmek, yorum ve satış geçmişini dağıtır.
4. **Gerçekçi olmayan kargoya verme süresi seçmek.** Uyamayacağınız kısa bir süre, gecikmeye ve mağaza puanının düşmesine yol açar.
5. **Stoğu elle güncellemek.** Birden fazla kanalda satış yaparken stoğu her panelde elle güncellemek, er ya da geç fazla satışa ve iptale dönüşür.
6. **Siparişleri geç onaylamak.** Yeni siparişleri düzenli aralıklarla kontrol edip onaylamamak, kargoya verme süresini gereksiz yere daraltır.

## N11 API bilgileri: entegrasyon kullanacaksanız

Siparişlerinizi, stoklarınızı ve ürünlerinizi bir entegrasyon yazılımıyla yönetecekseniz N11'in API bilgilerine ihtiyacınız olur. Bu bilgileri Satıcı Ofisi'nde **Hesabım → API Hesapları → Yeni Hesap Oluştur** adımlarıyla oluşturursunuz; App Key ve App Secret bilgileri e-posta adresinize gönderilir. Bu bilgiler mağazanıza erişim sağladığı için yalnızca güvendiğiniz yazılımlarla paylaşın.

## N11 başvurusu öncesi kontrol listesi

- Vergi levhanız son 1 yıl içinde alınmış ve bilgileri güncel.
- Şahıs şirketiyseniz imza sirküleri ya da imza beyannamesi hazır.
- Limited / anonim şirketseniz son 6 ay içinde alınmış faaliyet belgesi (ya da güncel KDV tahakkuk fişi) ve kuruluş ticaret sicil gazetesi hazır.
- Şirket adına bir banka hesabı ve kurumsal bir e-posta adresi var.
- e-Arşiv / e-Fatura altyapınız kurulu.
- İlk ürünlerinizin barkodları, stok kodları, görselleri ve açıklamaları hazır.
- Paket ölçüleriniz ve ağırlıklarınız belli; kargo maliyetini hesapladınız.
- Komisyon, hizmet bedelleri, kargo ve stopaj sonrası kâr ettiğiniz bir fiyat listeniz var.

## N11’de ilk satışları hızlandırmak için 6 öneri

1. **Rekabeti doğru okuyun.** Aynı ürünü çok sayıda satıcının sattığı ürünlerde fiyat baskısı yüksektir; başlangıçta ürün sayfası kalitesiyle ayrışabileceğiniz ürünleri öne çıkarın.
2. **Fiyatı kesintilere göre belirleyin.** Hedef kârınıza göre fiyat bulmak için [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) kullanın.
3. **Kampanyalardan önce hesap yapın.** İndirim sonrası kesintiler azalmadığı için kârınız indirim oranından daha hızlı düşer. Başabaş indiriminizi [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) görün.
4. **Hızlı kargolayın.** Kısa hazırlık süresi hem müşteri tercihini hem mağaza puanını olumlu etkiler.
5. **Soruları aynı gün yanıtlayın.** Cevapsız soru, büyük olasılıkla rakibe giden satıştır.
6. **Stoğu güncel tutun.** N11'in yanında başka kanallarda da satıyorsanız stoklarınızı eşitleyin; yöntemler için [e-ticarette stok takibi](/blog/e-ticarette-stok-takibi-fazla-satis) rehberimize bakın.

## N11’i Trendyol ve Hepsiburada ile tek panelden yönetmek

N11 satıcılarının çoğu Trendyol ve Hepsiburada'da da mağaza açar; o pazaryerlerinin süreçlerini [Trendyol mağaza açma](/blog/trendyol-magaza-acma-rehberi) ve [Hepsiburada satıcı olma](/blog/hepsiburada-satici-olma-magaza-acma) rehberlerimizde anlattık. Üç ayrı panelde sipariş, stok ve soru takibi yapmak zaman alır; bir kanalda satılan ürünün stoğu diğerlerinde düşmezse fazla satış yaşanır.

Hastürk CRM'in [N11 entegrasyonu](/entegrasyonlar/n11) ile yeni N11 siparişlerini panelden onaylar, diğer kanallarla aynı listede yönetirsiniz. Stok ve fiyatlarınız diğer kanallarla eşit kalır; ürünlerinizi kategori eşleştirmesiyle panelden N11'e yükleyebilirsiniz. Müşteri sorularını yanıtlar, iade taleplerini panelden onaylar ya da reddedersiniz. N11 komisyon oranınızı bir kez girdiğinizde N11 siparişlerinizin kârı da diğer kanallarla birlikte [kâr-zarar raporunda](/ozellikler/kar-zarar) görünür.

Kayıt olmadan [canlı demoyu](/demo) inceleyebilir, kendi mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### N11'de mağaza açmak ücretli mi?

Hayır. N11'in mağaza destek sayfalarına göre gerekli belgeleri sağlayan işletmeler N11'de ücretsiz mağaza açabilir. Satış yaptıkça komisyon, hizmet bedelleri, kargo ve stopaj gibi kesintiler uygulanır.

### N11'de şahıs olarak, şirketsiz satış yapılır mı?

Hayır. N11'de satış yapmak için vergi numarası olan bir işletme gerekir. Şahıs şirketi, limited şirket ya da anonim şirketle başvurabilirsiniz.

### N11 mağaza açmak için hangi belgeler gerekir?

Şahıs şirketlerinde vergi levhası, imza sirküleri ya da imza beyannamesi ve kimlik fotokopisi; limited ve anonim şirketlerde vergi levhası, faaliyet belgesi, kuruluş ticaret sicil gazetesi ve imza sirküleri istenir. Güncel listeyi Satıcı Ofisi'nden kontrol edin.

### N11 başvurusu kaç günde onaylanır?

Onay süresi belgelerinizin eksiksiz ve güncel olmasına ve inceleme yoğunluğuna göre değişir. En sık gecikme sebepleri eski tarihli vergi levhası, güncel olmayan faaliyet belgesi ve forma girilen bilgilerle belgeler arasındaki farklardır.

### N11'de ödemeler ne zaman yapılır?

Ödemeler, siparişin tamamlanma tarihinden sonra kategori bazlı hesaplama süresi sonunda hesaplanır ve N11'in ödeme günlerinde hesabınıza aktarılır. Kendi takviminizi Satıcı Ofisi'nin ödeme ve fatura bölümünden takip edin.

### N11 komisyonu nasıl hesaplanır?

Komisyon kategoriye göre değişir; buna pazarlama ve pazaryeri hizmet bedelleri, %1 stopaj ve varsa kargo eklenir. Kendi oranlarınızla net kârınızı görmek için [N11 komisyon hesaplama aracını](/araclar/n11-komisyon-hesaplama) kullanabilirsiniz.
`,
  },
  {
    slug: "pazaryeri-iade-yonetimi-iade-oranini-dusurme",
    title: "Pazaryerinde İade Yönetimi: İade Oranını Düşürmenin 12 Yolu",
    seo_title: "Pazaryeri İade Yönetimi: İade Oranını Düşürmenin 12 Yolu",
    seo_desc: "14 günlük cayma hakkı, iade kargo masrafı ve geri ödeme süreleri; iade maliyeti hesabı, iade oranını düşürmenin 12 yolu ve hızlı iade akışı. Hemen okuyun.",
    summary: "Mesafeli satışta iade kurallarını (14 gün cayma hakkı, geri ödeme, iade kargo masrafı, istisnalar) özetliyor; iade maliyetini hesaplamayı, iade nedenlerini ölçmeyi, iade oranını düşürmenin 12 yolunu ve iade sürecini hızlandıran iş akışını anlatıyoruz.",
    tags: ["İade","Cayma Hakkı","Pazaryeri","Müşteri Memnuniyeti"],
    cover: "iade-yonetimi-kapak.jpg",
    body: `Pazaryerinde iade oranını düşürmenin en etkili yolu, iadeleri tek tek "kötü şans" olarak görmek yerine nedenlerine göre ölçmek ve her nedenin kaynağını ürün sayfasında, paketlemede ya da depoda düzeltmektir. İadelerin büyük kısmı ölçü ve beden uyumsuzluğu, ürünün görsellerden ya da açıklamadan farklı görünmesi, kargoda hasar ve yanlış ya da eksik gönderim gibi önlenebilir sebeplerden doğar. İade sürecini hızlandırmak için de gelen iadeyi aynı gün kontrol eden, kararı fotoğrafla belgeleyen ve satılabilir ürünü hemen stoğa geri alan basit bir iş akışı kurmanız yeterlidir.

Bu rehberde önce mesafeli satışta iade kurallarını özetliyoruz: 14 günlük cayma hakkı, iade ve geri ödeme süreleri, iade masrafları ve istisnalar. Ardından iade maliyetini nasıl hesaplayacağınızı, iade oranını düşürmenin 12 pratik yolunu, iade sürecini hızlandıran iş akışını ve haksız iadelerde nasıl itiraz edeceğinizi anlatıyoruz.

> **Not:** Bu yazı genel bilgilendirme amaçlıdır, hukuki danışmanlık değildir. Tüketici mevzuatı son yıllarda birkaç kez değişti; özel bir uyuşmazlıkta güncel mevzuatı kontrol edin ya da bir hukukçuya danışın.

## Mesafeli satışta iade kuralları: kısa özet

Pazaryerinde yapılan satışlar, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamındaki mesafeli satışlardır. Satıcı olarak bilmeniz gereken temel kurallar şunlardır:

| Konu | Kural |
| --- | --- |
| Cayma süresi | Tüketici, malı teslim aldığı günden itibaren 14 gün içinde gerekçe göstermeden ve cezai şart ödemeden cayma hakkını kullanabilir. |
| Ürünün geri gönderilmesi | Tüketici, cayma bildiriminden itibaren 14 gün içinde ürünü geri gönderir (2022 değişikliğiyle 10 günden 14 güne çıkarıldı). |
| Bedel iadesi | Satıcı, tahsil ettiği tutarı teslim masrafları dahil 14 gün içinde iade eder. Süre, ürünün iade için ön bilgilendirmede belirtilen taşıyıcıya teslim edildiği tarihten; başka bir yolla gönderilmişse ürünün satıcıya ulaştığı tarihten başlar. |
| İade kargo masrafı | Ürün, ön bilgilendirmede belirtilen taşıyıcıyla gönderilirse tüketiciden iade masrafı istenemez; iade için taşıyıcı belirtilmemişse de istenemez. |
| İstisnalar | Kişiye özel hazırlanan, çabuk bozulabilen ve ambalajı açılınca iadesi sağlık ve hijyen açısından uygun olmayan ürünler gibi yönetmelikte sayılan durumlarda cayma hakkı kullanılamaz. |

![Mesafeli satışta iade süreci: teslim, 14 günlük cayma süresi, ürünün geri gönderilmesi ve bedel iadesi; satıcının iade iş akışı](https://hasturkcrm.com/img/blog/iade-sureci-akisi.jpg "Cayma hakkında yasal süreler ve satıcının iade iş akışı")

### İade kargosunu kim öder?

Uygulamada pazaryerleri, müşteriye iade için anlaşmalı bir kargo firması ve iade kodu verir; müşteri ürünü bu yolla ücretsiz gönderir. İade kargo bedelinin satıcıya nasıl yansıtılacağı ise pazaryerinin kurallarına ve sizinle yaptığı sözleşmeye göre belirlenir; birçok pazaryerinde bu bedel satıcının hakedişinden düşülür. 2025'te yapılan yönetmelik değişikliğiyle, iade masraflarının sözleşmeyle tüketiciye yüklenebilmesini öngören düzenlemeden vazgeçildi. Yani cayma hakkında iade masrafını müşteriye yansıtmayı planlamamalı, bu maliyeti fiyatlamanıza dahil etmelisiniz.

### Elektronik ürünlerde cayma hakkı var mı?

Evet. 2022'de cep telefonu, akıllı saat, tablet ve bilgisayarların cayma hakkı kapsamı dışında bırakılması öngörülmüş, yürürlüğü birkaç kez ertelenmişti. Ticaret Bakanlığı bu düzenlemeden vazgeçti; 1 Ocak 2026'dan itibaren bu ürünlerde de tüketici 14 gün içinde gerekçesiz cayma hakkını kullanabilir.

### Cayma hakkı ile ayıplı ürün iadesi farklıdır

Cayma hakkı, ürün kusursuz olsa bile müşterinin vazgeçebilmesidir ve 14 günle sınırlıdır. Ürün **ayıplıysa** (kusurlu, eksik, açıklamadan farklı) ise 6502 sayılı Kanun'daki ayıplı mal hükümleri uygulanır: tüketici sözleşmeden dönme, bedelden indirim, ücretsiz onarım ya da ayıpsız bir benzeriyle değişim haklarından birini seçebilir. Ayıplı ürün iadesinde masraflar ve sorumluluk farklı işler; bu yüzden iade nedenini doğru sınıflandırmak önemlidir.

### Kullanılmış ürün iadesi

Yönetmeliğe göre tüketici, cayma süresi içinde ürünü işleyişine, teknik özelliklerine ve kullanım talimatlarına uygun şekilde kullanmasından kaynaklanan değişiklik ve bozulmalardan sorumlu değildir. Ancak ürün olağan kullanımın ötesinde kullanılmış, hasar görmüş ya da eksik gönderilmişse durumu fotoğraf ve açıklamayla belgeleyerek pazaryerine itiraz edebilirsiniz.

## İade size gerçekte kaça mal oluyor?

İade, yalnızca satışın iptal olması değildir; çoğu zaman satıştan hiç kazanmamış olmanızdan daha pahalıdır. Bir iadenin maliyeti genellikle şu kalemlerden oluşur:

- **Gidiş kargosu:** Ürünü müşteriye göndermek için ödediğiniz kargo bedeli.
- **Dönüş kargosu:** Pazaryerinin kuralına göre hakedişinizden düşülen iade kargo bedeli.
- **Paketleme ve işçilik:** Kutu, dolgu malzemesi, etiket ve hazırlayan personelin zamanı.
- **Değer kaybı:** Ambalajı bozulan, yeniden satılamayan ya da indirimle satılması gereken ürün.
- **Kesintiler:** Komisyon ve hizmet bedellerinin iadede nasıl işlendiği pazaryerine göre değişir; hakediş dökümünüzden kontrol edin.
- **Fırsat maliyeti:** İade sürecinde stokta görünmeyen ürünün kaçırdığı satışlar.

### Örnek iade maliyeti

Aşağıdaki tutarlar **varsayımsaldır** ve yalnızca hesabın mantığını gösterir.

| Kalem | Tutar |
| --- | --- |
| Gidiş kargosu | 70,00 TL |
| Dönüş kargosu | 70,00 TL |
| Paketleme ve işçilik | 15,00 TL |
| Değer kaybı (ambalaj yenileme) | 20,00 TL |
| **Bir iadenin maliyeti** | **175,00 TL** |

Bu ürünü sattığınızda 120 TL net kâr ediyorsanız, tek bir iade yaklaşık 1,5 satışın kârını siler. İade oranının yüzde birkaç puan düşmesi bu yüzden doğrudan kâra yansır. Ürün bazında iade oranını hesaplamak için iade adedini teslim edilen sipariş adedine bölmeniz yeterlidir; hızlı hesap için [yüzde hesaplama aracını](/araclar/yuzde-hesaplama) kullanabilirsiniz. Kargo bedelinin desiyle nasıl değiştiğini [desi hesaplama rehberimizde](/blog/desi-nedir-nasil-hesaplanir) anlattık.

## Önce ölçün: iade nedenleri ve kök nedenler

Pazaryerleri iade talebinde müşteriden bir neden seçmesini ister. Bu nedenleri her ay ürün bazında bir tabloya dökmek, nereden başlayacağınızı gösterir:

| Müşterinin seçtiği neden | Muhtemel kök neden | Önce bakılacak yer |
| --- | --- | --- |
| Beden / ölçü uymadı | Eksik ya da yanlış ölçü tablosu, kalıp farkı belirtilmemiş | Ürün açıklaması, beden tablosu |
| Beklentimi karşılamadı | Görsel renk, boyut ya da malzemeyi yanlış yansıtıyor | Görseller, açıklama |
| Hasarlı geldi | Yetersiz koruma, yanlış kutu boyutu | Paketleme standardı |
| Yanlış / eksik ürün | Toplama ve paketleme hatası, varyant karışıklığı | Depo, barkod, kontrol adımı |
| Kusurlu ürün | Tedarikçi kalite sorunu | Tedarikçi, giriş kontrolü |
| Vazgeçtim | Geç teslimat, daha ucuz bulma, düşünmeden alma | Kargo süresi, fiyat |

Tek bir ürünün iade oranı diğerlerinden belirgin şekilde yüksekse sorun büyük olasılıkla o ürünün sayfasındadır. Tüm ürünlerde "hasarlı geldi" artıyorsa sorun paketleme ya da kargodadır.

## İade oranını düşürmenin 12 yolu

### 1. Ölçü ve beden bilgisini eksiksiz verin

Giyim, ayakkabı ve ev tekstilinde iadelerin en sık nedeni ölçüdür. Her ürün için santimetre cinsinden ölçü tablosu ekleyin, kalıbın dar ya da geniş olduğunu açıkça yazın, mankenin boyunu ve giydiği bedeni belirtin.

### 2. Görselleri gerçeğe sadık tutun

Aşırı filtrelenmiş ya da renk ayarı bozuk görseller "beklentimi karşılamadı" iadesinin ana kaynağıdır. Ürünü gün ışığına yakın ışıkta, farklı açılardan ve boyutunu anlatan bir nesneyle birlikte gösterin.

### 3. Açıklamada sınırları da yazın

Ürünün neyi yapmadığını, neyle uyumlu olmadığını ve kutudan ne çıkmadığını yazmak satışı azaltmaz; yanlış müşteriyi eler. "Pil dahil değildir", "şu modellerle uyumludur" gibi cümleler iadeyi doğrudan önler.

### 4. Müşteri sorularından öğrenin

Aynı soru tekrar tekrar geliyorsa cevabı açıklamada eksiktir. Sık gelen soruların cevabını ürün açıklamasına ekleyin; ürün sayfasındaki soru-cevaplar diğer müşterilerin de beklentisini doğru kurar.

### 5. Paketlemeyi ürüne göre standartlaştırın

Kırılabilir ürünlerde yeterli dolgu, ürüne uygun boyutta kutu ve köşe koruması kullanın. Paket gereğinden büyükse ürün kutu içinde hareket eder, desi de boşuna artar.

### 6. Toplama ve paketlemede ikinci kontrol yapın

Yanlış ve eksik ürün iadeleri tamamen depo kaynaklıdır. Paketi kapatmadan önce barkodu okutarak ürün ve varyantı siparişle eşleştirin; çok parçalı ürünlerde parça listesini kontrol edin.

### 7. Kargoya hızlı verin

Geç gelen ürün, müşterinin vazgeçme ihtimalini artırır. Kargoya verme süresine uyun ve gecikme riski taşıyan siparişleri her sabah ilk iş olarak ele alın.

### 8. Stoğu doğru tutun

Stokta olmayan ürünü satıp sonra iptal etmek iade sayılmasa da aynı müşteri memnuniyetsizliğini doğurur. Birden fazla kanalda satıyorsanız stokları eşitlemenin yollarını [e-ticarette stok takibi rehberimizde](/blog/e-ticarette-stok-takibi-fazla-satis) anlattık.

### 9. Kutuya küçük bir kullanım notu koyun

Kurulum ya da kullanım gerektiren ürünlerde kısa bir kullanım kartı veya karekodla ulaşılan bir video, "çalışmıyor" sanılıp iade edilen ürünlerin sayısını azaltır.

### 10. Tedarikçiyle iade verisini paylaşın

Belirli bir partide kusur artıyorsa bunu iade nedenlerinden erken görürsünüz. İade verisini tedarikçinizle paylaşmak, kalite sorununu kaynağında çözmenin en hızlı yoludur.

### 11. Varyantları doğru eşleştirin

Renk ve beden varyantlarının görselleri doğru eşleşmezse müşteri farklı bir ürün alır. Her varyantın kendi görseline ve barkoduna sahip olduğundan emin olun.

### 12. Sürekli yüksek iade alan ürünü gözden geçirin

Tüm iyileştirmelere rağmen iade oranı yüksek kalan ürünü fiyatlamasıyla birlikte yeniden değerlendirin. Bazen doğru karar, iade maliyetini fiyata yansıtmak ya da ürünü o kanaldan çekmektir. Aynı ürünün farklı kanallardaki kârını [kâr karşılaştırma aracıyla](/araclar/kar-karsilastirma) yan yana görebilirsiniz.

## İade sürecini hızlandıran iş akışı

İade oranını düşürmek kadar, gelen iadeyi hızla sonuçlandırmak da önemlidir: bekleyen iade hem müşteri memnuniyetini düşürür hem de satılabilir ürünü stok dışında tutar. Aşağıdaki iş akışı küçük ekiplerde de uygulanabilir:

1. **Talebi aynı gün görün.** Her sabah tüm kanallardaki yeni iade taleplerini tek listede kontrol edin; nedenini ve siparişi not edin.
2. **İade paketini ayrı bir alanda açın.** Gelen iade kolilerini diğer gönderilerle karıştırmayın; açılışı mümkünse kamera önünde yapın.
3. **Ürünü kontrol edin ve fotoğraflayın.** Ürünün durumunu, etiketini, ambalajını ve eksik parça olup olmadığını kontrol edin; fotoğraflarla kayıt altına alın.
4. **Kararı verin.** Ürün sorunsuzsa iadeyi onaylayın. Kullanılmış, hasarlı ya da eksikse kanalın istediği gerekçeyi seçip fotoğrafla birlikte itiraz edin.
5. **Ürünü sınıflandırın.** Satılabilir ürünü hemen stoğa geri alın; ambalajı yenilenmesi gerekenleri, ikinci el ya da indirimli satılacakları ve tedarikçiye iade edilecekleri ayrı ayırın.
6. **Kaydı tutun.** Her iadenin nedenini, kararınızı ve maliyetini kaydedin. Aylık değerlendirmeyi bu kayıtlar üzerinden yaparsınız.

> **İpucu:** Satılabilir durumdaki iade ürününü stoğa geri almayı geciktirmeyin. Özellikle hızlı satan ürünlerde birkaç günlük gecikme, stokta varken "tükendi" görünen ürün ve kaçan satış demektir.

## Haksız iadeye nasıl itiraz edilir?

Ürün kullanılmış, hasar görmüş, parçası eksik ya da farklı bir ürün olarak geri gelmişse iadeyi gerekçesiyle reddedebilir ya da pazaryerine itiraz edebilirsiniz. İtirazın sonuç vermesi için:

- Ürünü paketten çıkarırken fotoğraf ya da video kaydı alın.
- Etiket, seri numarası, ambalaj ve eksik parçaları net gösterin.
- Kanalın sunduğu ret gerekçelerinden durumu en doğru anlatanı seçin.
- Gönderim öncesi kayıtlarınız (paketleme fotoğrafı, seri numarası) varsa ekleyin.

Pazaryeri, itiraz edilen iadelerde iki tarafın kanıtlarını değerlendirerek son kararı verebilir. Bu yüzden kanıtı baştan düzgün toplamak, tartışmayı uzatmaktan çok daha etkilidir. Ret hakkınızı yalnız gerçekten haklı olduğunuz durumlarda kullanın; haksız retler müşteri şikâyetine ve mağaza değerlendirmenizin düşmesine yol açar.

## İadeyi kâr hesabınıza doğru yansıtın

Ciroya bakarak iade etkisini göremezsiniz. Net kârınızı hesaplarken iadelerin kargo, işçilik ve değer kaybı maliyetini ayrı bir kalem olarak düşmelisiniz. Komisyon, kargo, hizmet bedeli ve stopajın kâra etkisini adım adım [Trendyol komisyon ve net kâr hesaplama](/blog/trendyol-komisyon-orani-net-kar-hesaplama) rehberimizde anlattık; iade maliyetini de aynı tabloya eklemeniz yeterlidir.

## Tüm kanalların iadelerini tek panelden yönetin

Trendyol, Hepsiburada ve N11'de aynı anda satış yapıyorsanız her kanalın iade ekranını ayrı ayrı takip etmek, taleplerin gözden kaçmasına ve sürelerin kaçırılmasına yol açar. Amazon'da satıyorsanız sürecin bir kısmı farklı işler: Amazon Lojistik kullandığınız siparişlerde iadeleri Amazon yürütür; ayrıntılar için [Amazon'da satış yapmak](/blog/amazon-turkiye-satici-olma-rehberi) rehberimize bakabilirsiniz.

Hastürk CRM'in [müşteri soruları ve iadeler](/ozellikler/musteri-sorulari-ve-iadeler) bölümünde Trendyol, Hepsiburada, N11 ve idefix iade taleplerini tek listede görür; panelden onaylar ya da kanalın istediği gerekçeyi seçip açıklama ve belge ekleyerek reddedersiniz. İade siparişler [sipariş yönetimi](/ozellikler/siparis-yonetimi) ekranında ayrı bir sekmede durur; pazaryeri panelinden yapılan iade işlemleri de panelde kendiliğinden güncellenir. [Kâr-zarar raporu](/ozellikler/kar-zarar) iade kaybını ayrı bir basamak olarak gösterir; müşteri hizmetleri personelinize yalnız sorular ve iadeler bölümünü açabilirsiniz.

Kayıt olmadan [canlı demoyu](/demo) inceleyebilir, kendi mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Pazaryerinde cayma hakkı süresi kaç gün?

Tüketici, ürünü teslim aldığı günden itibaren 14 gün içinde gerekçe göstermeden cayma hakkını kullanabilir. Cayma bildiriminden sonra ürünü geri göndermek için de 14 günü vardır.

### İade kargo ücretini müşteriden alabilir miyim?

Cayma hakkında, ürün ön bilgilendirmede belirtilen taşıyıcıyla gönderilirse tüketiciden iade masrafı istenemez; iade için taşıyıcı belirtilmemişse de istenemez. Pazaryerlerinde iade kargo bedeli genellikle pazaryerinin kurallarına göre satıcıya yansıtılır.

### Satıcı iade bedelini ne zaman ödemek zorunda?

Satıcı, tahsil ettiği tutarı 14 gün içinde iade eder. Süre, ürünün iade için belirtilen taşıyıcıya teslim edildiği tarihten; başka bir yolla gönderilmişse satıcıya ulaştığı tarihten başlar. Pazaryeri satışlarında bedel iadesi müşteriye pazaryeri üzerinden yapılır.

### Hangi ürünlerde cayma hakkı yoktur?

Yönetmelikte sayılan istisnalar arasında kişiye özel hazırlanan ürünler, çabuk bozulabilen ürünler ve ambalajı açıldıktan sonra iadesi sağlık ve hijyen açısından uygun olmayan ürünler bulunur. Cep telefonu, tablet, bilgisayar ve akıllı saatlerde ise 1 Ocak 2026'dan itibaren cayma hakkı vardır.

### Kullanılmış ürünün iadesini reddedebilir miyim?

Müşteri, ürünü kullanım talimatlarına uygun şekilde kullanmasından doğan değişiklik ve bozulmalardan sorumlu değildir. Ürün olağan kullanımın ötesinde kullanılmış, hasarlı ya da eksikse durumu fotoğrafla belgeleyerek gerekçeli ret ya da itiraz yapabilirsiniz; son kararı pazaryeri verebilir.

### İade oranı nasıl hesaplanır?

Belirli bir dönemde iade edilen ürün adedini, aynı dönemde teslim edilen ürün adedine bölüp 100 ile çarparsınız. Oranı ürün ve iade nedeni bazında ayrı ayrı izlemek, sorunun nerede olduğunu gösterir.
`,
  },
  {
    slug: "ciceksepeti-satici-olma-magaza-acma",
    title: "Çiçeksepeti'nde Satıcı Olmak: Mağaza Açma ve Satış Rehberi (2026)",
    seo_title: "Çiçeksepeti Satıcı Olma 2026: Başvuru, Belgeler, Kargo",
    seo_desc: "Çiçeksepeti'nde nasıl satıcı olunur? Şartlar, belgeler, başvuru adımları, kargo ve komisyon, ödeme takvimi ve kişiye özel ürünlerde iade. Rehberi okuyun.",
    summary: "Çiçeksepeti'nde satıcı olmak ücretsizdir; vergi levhası ve fatura kesebilen bir işletme yeterlidir. Başvuru adımlarını, belgeleri, ürün yüklemeyi, satıcıya ait kargo ve iade kargo ücretlerini, komisyonu, ödemeleri ve kişiye özel ürünlerde iade kurallarını anlatıyoruz.",
    tags: ["Çiçeksepeti","Mağaza Açma","Pazaryeri","Rehber"],
    cover: "ciceksepeti-satici-kapak.jpg",
    body: `Çiçeksepeti'nde satıcı olmak için vergi levhası olan ve fatura düzenleyebilen bir işletmeniz olması gerekir; satıcı olmak ve mağaza açmak ücretsizdir. Başvuru, Çiçeksepeti'nin "Çiçeksepeti'nde Satış Yap" sayfasından yapılır: formu doldurur, satacağınız ürün kategorisini seçer ve satıcı tipinize göre istenen belgeleri yüklersiniz. Başvurunuz onaylandığında satıcı panelinden ürünlerinizi yükleyip satışa başlarsınız. Çiçeksepeti adına rağmen yalnızca çiçek değil; hediyelik ürünlerden ev ve yaşama, aksesuardan kişiye özel ürünlere kadar birçok kategoride satış yapılan bir pazaryeridir.

Bu rehberde Çiçeksepeti satıcı olma sürecini adım adım anlatıyoruz: şartlar, belgeler, başvuru, ürün yükleme, kargo, komisyon, ödeme takvimi ve Çiçeksepeti'ne özgü dikkat edilmesi gereken noktalar. Oranlar ve süreler dönem dönem güncellendiği için kesin rakam vermiyoruz; güncel bilgiyi nereden kontrol edeceğinizi belirtiyoruz.

## Çiçeksepeti’nde kimler satıcı olabilir?

Çiçeksepeti'nin satıcılara yönelik sık sorulan sorular sayfasına göre satıcı olmanın temel şartları şunlardır:

- **Vergi levhası:** Vergi mükellefi bir işletmeniz olmalıdır. Şahıs şirketi, limited şirket ya da anonim şirket olabilir.
- **Fatura düzenleyebilmek:** Her satış için müşteriye fatura kesebilmelisiniz. Pazaryeri satıcılarının çoğu e-Arşiv / e-Fatura ile çalışır.
- **Banka hesabı:** Ödemelerin yatacağı, işletmenize ait bir hesap gerekir.

Bireysel olarak, yani vergi kaydı olmadan satıcı olunamaz. Şirketiniz yoksa hangi türün size uygun olduğunu [e-ticaret için şahıs şirketi mi, limited şirket mi](/blog/e-ticaret-sahis-sirketi-mi-limited-sirket-mi) yazımızda karşılaştırdık.

## Çiçeksepeti satıcı başvurusu için gerekli belgeler

Çiçeksepeti, istenen belgelerin satıcı tipine göre değiştiğini ve zorunlu bilgiler eksikse başvurunun tamamlanmadığını belirtir. Pazaryeri başvurularında genellikle istenen belgeler şunlardır:

| Belge | Şahıs şirketi | Limited / Anonim şirket |
| --- | --- | --- |
| Vergi levhası | Gerekli | Gerekli |
| Kimlik fotokopisi | Genellikle istenir | Yetkili kişi için istenebilir |
| İmza beyannamesi / imza sirküleri | İmza beyannamesi ya da imza sirküleri | İmza sirküleri |
| Ticaret sicil gazetesi / faaliyet belgesi | Sicil kaydı varsa istenebilir | Gerekli |
| Banka hesap bilgisi (IBAN) | Gerekli | Gerekli |
| Satıcı sözleşmesi | Onaylanır | Onaylanır |

Belge listesi kategoriye göre de değişebilir. Gıda, kozmetik ya da takviye gibi kategorilerde ürüne özel izin ve belgeler, markalı ürünlerde marka tescil ya da yetki belgesi istenebilir. Başvuru ekranında sizden istenen güncel listeyi esas alın; belgelerin ıslak imzalı ya da kaşeli olması gerekiyorsa bu bilgi de başvuru sürecinde size iletilir.

> **İpucu:** Belgelerdeki unvan, adres ve vergi numarasıyla başvuru formuna girdiğiniz bilgilerin birebir aynı olduğundan emin olun. Küçük yazım farkları, onay sürecinin uzamasının en yaygın sebeplerindendir.

## Çiçeksepeti başvurusu adım adım

1. **Başvuru sayfasını açın.** Çiçeksepeti'nin "Çiçeksepeti'nde Satış Yap" sayfasında başvuru düğmesine tıklayın.
2. **Formu doldurun.** İşletme bilgilerinizi, iletişim bilgilerinizi ve yetkili kişi bilgilerini eksiksiz girin.
3. **Ürün kategorinizi seçin.** Satış yapacağınız ana kategoriyi seçin. Çiçeksepeti'ne göre kategori bazındaki komisyon oranları başvuru formunda gösterilir; oranınızı başvuru aşamasında görmüş olursunuz.
4. **Belgelerinizi yükleyin.** Satıcı tipinize göre istenen belgeleri okunaklı hâlde yükleyin.
5. **Sözleşmeyi onaylayın ve inceleme sürecini bekleyin.** Çiçeksepeti başvurunuzu inceler; eksik ya da hatalı bilgi varsa sizinle iletişime geçer.
6. **Satıcı paneline giriş yapın.** Başvurunuz onaylandığında satıcı panelinize (seller.ciceksepeti.com) giriş yaparsınız.
7. **Mağaza ayarlarını tamamlayın.** Sevkiyat ve iade adresi, kargo tercihleri, banka bilgileri ve mağaza bilgilerinizi girin.
8. **Ürünlerinizi yükleyin ve satışa başlayın.**

Çiçeksepeti, yeni ve mevcut satıcılar için **Çiçeksepeti Akademi** adlı bir eğitim platformu da sunar. Panel kullanımı, ürün yükleme ve kampanyalar hakkındaki eğitim videolarını izlemek, ilk haftalarda yapılan hataları azaltır.

## Çiçeksepeti’nde ürün yükleme

Ürünlerinizi satıcı panelinden tek tek ya da toplu olarak yükleyebilirsiniz. Çiçeksepeti'nde müşterilerin önemli bir kısmı hediye almak için alışveriş yapar; bu da ürün sayfasında bazı bilgilerin diğer pazaryerlerine göre daha belirleyici olmasına yol açar.

### Hediye odaklı alışverişte ürün sayfası

- **Teslimat bilgisi açık olsun.** Hediye alan müşteri için ürünün belirli bir güne yetişmesi kritiktir. Kargoya verme sürenizi gerçekçi belirleyin ve ona uyun.
- **Kutudan ne çıktığını gösterin.** Ürünün ambalajını, hediye paketi seçeneğini (varsa) ve kutu içeriğini görsellerle anlatın.
- **Ölçüleri net yazın.** Hediye ürünlerde "beklediğimden küçük" iadesinin önüne geçmek için ölçüleri santimetre cinsinden ve bir referans nesneyle birlikte gösterin.
- **Kişiselleştirme bilgisini doğru toplayın.** İsim, tarih ya da not basılan ürünlerde müşterinin gireceği bilgiyi ve yazım kurallarını açıkça belirtin.
- **Başlık ve kategori doğru olsun.** Başlıkta ürün türü, temel özellik ve varyant bilgisi yer alsın; kategori özelliklerini eksiksiz doldurun.
- **Stok kodunu standartlaştırın.** Birden fazla kanalda satıyorsanız aynı ürüne her kanalda aynı stok kodunu vermek, stok ve sipariş takibini çok kolaylaştırır.

### Kişiye özel ürünlerde iade

Kişiye özel ürünler Çiçeksepeti'nde sık satılan bir gruptur. Mesafeli Sözleşmeler Yönetmeliği'ne göre tüketicinin istekleri ya da kişisel ihtiyaçları doğrultusunda hazırlanan ürünlerde cayma hakkı kullanılamaz. Ancak bu istisna, ürün **ayıplıysa** (yanlış isim basılması, hasar, kusur) geçerli değildir; ayıplı ürünlerde tüketicinin kanundan doğan hakları devam eder. Bu yüzden kişiselleştirme bilgisini siparişten sonra müşteriyle teyit etmek ve üretimden önce kontrol etmek, iade riskini en aza indirir. Cayma hakkı ve iade kurallarının ayrıntılarını [pazaryerinde iade yönetimi](/blog/pazaryeri-iade-yonetimi-iade-oranini-dusurme) yazımızda anlattık.

## Çiçeksepeti’nde kargo

Çiçeksepeti'nin satıcı sık sorulan sorular sayfasına göre, müşterilere ücretsiz kargo seçeneği sunulduğu için gönderim ve iade kargo ücretleri satıcıya aittir. Gönderiler Çiçeksepeti'nin anlaşmalı kargo firmalarıyla yapılabilir; anlaşmalı kargo fiyatları satıcı paneli üzerinden talep oluşturduğunuzda size iletilir. Kargo koşulları dönem dönem değişebildiği için güncel uygulamayı satıcı panelinizden kontrol edin.

Kargo ücreti satıcıya ait olduğu için fiyatınızı belirlerken kargoyu mutlaka maliyete ekleyin. Kargo bedeli çoğunlukla paketin desisine göre hesaplanır; desi en × boy × yükseklik (cm) ÷ 3000 formülüyle bulunur ve gerçek ağırlıkla karşılaştırılarak büyük olan değer esas alınır. Ayrıntılar için [desi nedir, nasıl hesaplanır](/blog/desi-nedir-nasil-hesaplanir) rehberimize, hızlı hesap için [desi hesaplama aracına](/araclar/desi-hesaplama) bakabilirsiniz.

## Çiçeksepeti komisyonu ve kesintiler

Çiçeksepeti'nde her satıştan komisyon kesilir ve komisyon oranı ürün kategorisine göre değişir. Oranlar başvuru formunda kategori bazında gösterilir; güncel oranlarınızı satıcı panelinizden takip edin. Komisyona ek olarak hesabınızda şu kalemleri dikkate almalısınız:

- **Kargo:** Gönderim ve iade kargo ücretleri.
- **E-ticaret stopajı:** 1 Ocak 2025'ten beri pazaryerleri satıcılara yaptıkları ödemelerden satışın KDV hariç tutarının %1'i oranında stopaj keser.
- **Kampanya ve reklam:** Katıldığınız indirim kampanyaları ve kullandığınız reklam hizmetleri.
- **İadeler:** İade kargosu ve yeniden satılamayan ürünlerin maliyeti.

Komisyon ve kargo sonrası hakedişinizi hesaplamak için [pazaryeri komisyon hesaplama aracını](/araclar/pazaryeri-komisyon-hesaplama), hedef kârınıza göre fiyat belirlemek için [satış fiyatı hesaplama aracını](/araclar/satis-fiyati-hesaplama) kullanabilirsiniz. Kesintilerin net kâra etkisini adım adım görmek isterseniz [Trendyol komisyon ve net kâr hesaplama](/blog/trendyol-komisyon-orani-net-kar-hesaplama) rehberimizdeki yöntem Çiçeksepeti için de geçerlidir.

### Kampanya dönemlerine hazırlık

Hediye alışverişinin yoğunlaştığı özel günler, Çiçeksepeti'nde satışların en hızlı arttığı dönemlerdir. Bu dönemlerde kampanyaya katılmadan önce indirimli fiyatta kârınızı hesaplayın; kargo ve komisyon gibi kesintiler indirimle azalmadığı için kârınız indirim oranından daha hızlı düşer. Başabaş indirim oranınızı [indirim sonrası kâr hesaplama aracıyla](/araclar/indirim-kar-hesaplama) görebilirsiniz. Stoklarınızı ve paketleme kapasitenizi de önceden planlayın; özel güne yetişmeyen sipariş, hediye alışverişinde iade ve olumsuz değerlendirmenin en hızlı yoludur.

## Çiçeksepeti’nde ödemeler ne zaman yapılır?

Çiçeksepeti'nde ödemeler, siparişin teslim edilmesinin ve kategoriye göre belirlenen vade süresinin dolmasının ardından, Çiçeksepeti'nin ödeme takvimine göre yapılır. Çiçeksepeti Akademi'ye göre satıcılar ödeme raporlarını satıcı panelinden görebilir. Ödeme günleri ve vade süreleri dönemsel olarak değişebildiği için kendi takviminizi panelinizdeki ödeme raporlarından takip edin.

Nakit akışınızı planlarken bugün gönderdiğiniz siparişin parasının teslimat ve vade süresi eklendiğinde birkaç hafta sonra hesabınıza geçeceğini unutmayın; özellikle yoğun dönemlerden önce stok alımınızı buna göre planlayın.

## Müşteri soruları ve değerlendirmeler

Hediye alışverişinde müşteri, ürünü kendisi için değil başkası için seçtiğinden karar vermeden önce daha çok soru sorar: ürün zamanında yetişir mi, paket nasıl görünür, içine not eklenebilir mi, ölçüsü nedir? Bu sorulara hızlı ve net cevap vermek doğrudan satışa dönüşür. Sık gelen soruların cevabını ürün açıklamasına eklerseniz hem soru sayısı azalır hem de sonraki müşteriler beklentisini doğru kurar.

Teslimattan sonra gelen değerlendirmeler ise yeni müşterilerin güvenini belirler. Olumsuz bir değerlendirmeye savunmacı değil, çözüm odaklı yaklaşın; tekrarlayan şikâyetleri ürün sayfası, paketleme ya da kargo sürecinizde düzeltilmesi gereken bir sinyal olarak okuyun.

## Çiçeksepeti’nde sık yapılan 5 hata

1. **Kargo maliyetini unutmak.** Gönderim ve iade kargosu satıcıya ait olduğu için kargoyu fiyata eklemeyen satıcı, satış arttıkça daha çok zarar eder.
2. **Özel günlere stoksuz girmek.** Talebin en yüksek olduğu günlerde stok bitmesi hem satış kaybı hem de iptal demektir. Özel günlerden birkaç hafta önce stok ve paketleme kapasitenizi gözden geçirin.
3. **Kişiselleştirme bilgisini kontrol etmeden üretmek.** Yanlış basılan isim ya da tarih ayıplı ürün sayılır; bu ürünlerde iade ve yeniden üretim maliyeti size kalır.
4. **Ürün ölçülerini yazmamak.** Hediye ürünlerde "beklediğimden küçük" iadesinin en yaygın nedeni eksik ölçü bilgisidir.
5. **Hazırlık süresini iyimser seçmek.** Özellikle el yapımı ve kişiye özel ürünlerde hazırlık süresini gerçek üretim sürenize göre belirleyin.

## Çiçeksepeti API bilgileri: entegrasyon kullanacaksanız

Siparişlerinizi ve stoklarınızı bir entegrasyon yazılımıyla yönetecekseniz Çiçeksepeti'nin API anahtarına ihtiyacınız olur. Bu anahtarı satıcı panelinde **Hesap Ayarları → Entegrasyon Bilgileri** sayfasından alırsınız. API anahtarı mağazanıza erişim sağladığı için yalnızca güvendiğiniz yazılımlarla paylaşın.

## Çiçeksepeti başvurusu öncesi kontrol listesi

- Vergi levhanız güncel, şirketiniz faal.
- İmza beyannamesi ya da imza sirküleriniz hazır.
- Limited / anonim şirketseniz ticaret sicil gazeteniz ve faaliyet belgeniz hazır.
- İşletmenize ait bir banka hesabınız var.
- e-Arşiv / e-Fatura altyapınız kurulu.
- Satacağınız kategori için gereken ek belgeler (varsa) hazır.
- İlk ürünlerinizin görselleri, ölçüleri, açıklamaları ve stok kodları hazır.
- Kargo ve iade kargo maliyetini de içeren, kâr ettiğiniz bir fiyat listeniz var.
- Özel günler için stok ve paketleme planınız var.

## Çiçeksepeti’nde ilk satışlarınızı hızlandırmak için

1. **Hediye niyetine uygun ürünlerle başlayın.** Çiçeksepeti müşterisinin alışveriş nedenine uyan ürünleri öne çıkarın.
2. **Teslimat sözünüzü tutun.** Kargoya verme süresine uymak, hediye alışverişinde her şeyden önemlidir.
3. **Kargoyu fiyata dahil edin.** Ücretsiz kargo seçeneğinde kargo bedeli size aittir; kârsız satışın en yaygın nedeni budur.
4. **Kişiselleştirmeyi teyit edin.** Kişiye özel ürünlerde müşteri bilgisini üretimden önce kontrol edin.
5. **Soruları hızlı yanıtlayın.** Hediye alan müşteri, sorusunun cevabını beklemeden başka ürüne geçebilir.
6. **Stoğu güncel tutun.** Çiçeksepeti'nin yanında başka kanallarda da satıyorsanız stokları eşitleyin; yöntemler için [e-ticarette stok takibi](/blog/e-ticarette-stok-takibi-fazla-satis) rehberimize bakın.

## Çiçeksepeti’ni diğer kanallarla birlikte yönetmek

Çiçeksepeti satıcılarının çoğu Trendyol, Hepsiburada ya da N11'de de satış yapar. Çiçeksepeti'nde satılan ürünün stoğu diğer kanallarda düşmezse, özellikle özel günlerin yoğunluğunda elinizde olmayan ürünü satabilirsiniz.

Hastürk CRM'in [Çiçeksepeti entegrasyonu](/entegrasyonlar/ciceksepeti) test aşamasındadır ve kullanıma açıktır. Çiçeksepeti siparişleriniz diğer kanallarla aynı listeye gelir ve durumları kanaldan güncellenir. İlanlarınız stok koduyla panele gelir ve paneldeki ürünle eşleşir; stok ve fiyatlarınız ilanlarınıza gönderilir, bir kanalda satılan ürünün stoğu [stok senkronizasyonu](/ozellikler/stok-senkronizasyonu) ile diğer kanallarda da düşer. Gönderi Çiçeksepeti'nin anlaşmalı kargosuyla yapılır, kargo etiketi Çiçeksepeti panelinden alınır ve takip numarası kanaldan panele gelir. Ürün yükleme, müşteri soruları ve iade talepleri bu entegrasyonda yoktur; bunları Çiçeksepeti satıcı panelinden yönetirsiniz. Diğer pazaryerlerinin süreçleri için [N11 mağaza açma](/blog/n11-magaza-acma-satis-rehberi) ve [Amazon'da satış yapmak](/blog/amazon-turkiye-satici-olma-rehberi) rehberlerimize bakabilirsiniz.

Kayıt olmadan [canlı demoyu](/demo) inceleyebilir, kendi mağazalarınızla [7 gün ücretsiz deneyebilirsiniz](/demo#deneme).

## Sık sorulan sorular

### Çiçeksepeti'nde mağaza açmak ücretli mi?

Hayır. Çiçeksepeti'nin satıcı sık sorulan sorular sayfasına göre satıcı olmak ve mağaza açmak için ücret alınmaz. Satış yaptıkça kategoriye göre değişen komisyon ve diğer kesintiler uygulanır.

### Çiçeksepeti'nde şahıs şirketiyle satış yapılır mı?

Evet. Vergi levhası olan ve fatura düzenleyebilen şahıs şirketleri de Çiçeksepeti'nde satıcı olabilir. Vergi kaydı olmadan, bireysel olarak satış yapılamaz.

### Çiçeksepeti'nde sadece çiçek mi satılır?

Hayır. Çiçeksepeti; hediyelik ürünler, ev ve yaşam, aksesuar, kişiye özel ürünler gibi birçok kategoride satış yapılan bir pazaryeridir. Başvuru sırasında satış yapacağınız kategoriyi seçersiniz.

### Çiçeksepeti'nde kargo ücretini kim öder?

Çiçeksepeti'nin satıcı sık sorulan sorular sayfasına göre müşterilere ücretsiz kargo seçeneği sunulduğu için gönderim ve iade kargo ücretleri satıcıya aittir. Anlaşmalı kargo fiyatları satıcı panelinden talep edildiğinde iletilir.

### Çiçeksepeti komisyon oranları ne kadar?

Komisyon oranı ürün kategorisine göre değişir ve başvuru formunda kategori bazında gösterilir. Kendi oranınızla hakedişinizi görmek için [pazaryeri komisyon hesaplama aracını](/araclar/pazaryeri-komisyon-hesaplama) kullanabilirsiniz.

### Kişiye özel ürünlerde iade kabul etmek zorunda mıyım?

Mesafeli Sözleşmeler Yönetmeliği'ne göre tüketicinin istekleri doğrultusunda kişiye özel hazırlanan ürünlerde cayma hakkı kullanılamaz. Ancak ürün ayıplıysa, örneğin isim yanlış basılmışsa ya da ürün hasarlıysa, tüketicinin ayıplı mal hükümlerinden doğan hakları geçerlidir.
`,
  },
];
