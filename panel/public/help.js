// Sayfa yardımı ("?" düğmesi): o sayfada ne yapılır, adım adım; sayfayla ilgili terimler ve destek talebi kısayolu.
import { state, html, sheet, $ } from './core.js';

// Terimler sözlüğü (sade dille)
export const GLOSSARY = {
  'İlan': 'Ürününüzün bir pazaryerindeki (Trendyol, Hepsiburada …) satış sayfası. Aynı ürünün her kanalda ayrı ilanı olur.',
  'Eşleştirme': 'Farklı kanallardaki ilanların paneldeki aynı ürüne bağlanması. Bağlanınca stok ve satışlar tek üründe toplanır. Barkod ya da stok kodu aynıysa kendiliğinden olur.',
  'Ana katalog': 'Ürün bilgilerinin (ad, görsel, stok) alındığı ana kanal; genelde kendi siteniz (ikas). Diğer kanallar buna göre eşleşir.',
  'Stok gönderimi': 'Paneldeki stok adedinin pazaryerlerine otomatik gönderilmesi. Açıksa bir kanalda satılan ürün diğerlerinde de düşer.',
  'Kanala yazma': 'Panelden kanala işlem gönderilmesi (paketleme, kargo bildirimi, stok, fiyat). Kapalıysa panel yalnız okur.',
  'Paketleme': 'Siparişin kanalda "kargoya hazırlanıyor" yapılması; kargo barkodu / etiketi bundan sonra oluşur.',
  'Ortak barkod': 'Pazaryerinin anlaşmalı kargosuyla gönderimde etikette kullanılan barkod; etiketi pazaryeri verir.',
  'Hakediş': 'Pazaryerinin komisyon ve kesintiler düşüldükten sonra hesabınıza yatıracağı tutar.',
  'Stopaj': 'Pazaryerinin satıştan kesip vergi dairesine yatırdığı vergi (genelde %1); yıllık vergiden düşülür.',
  'Buybox': 'Aynı ürünü birden fazla satıcı satıyorsa pazaryerinin ürün sayfasında öne çıkardığı satıcı. Fiyatınız rakiplerden iyiyse buybox sizde olur.',
  'Fiyat önerisi': 'Rakiplerin pazaryerindeki fiyatına göre hazırlanan öneri: birinci sırayı almak için rakibin hemen altı ya da birinci sıra sizdeyse kârı artıracak fiyat.',
  'Kritik stok': 'Bu adedin altına inen ürün için uyarı alırsınız.',
};

// Sayfa → [başlık, ne işe yarar, adımlar, ilgili terimler]
const PAGES = {
  '': ['Genel Bakış', 'Günün özeti: yeni ve geciken siparişler, kargoya hazırlanacaklar, ciro ve kâr.', ['Üstteki kutulara tıklayarak ilgili listeye gidin.', 'Tarih düğmeleriyle (Bugün, 7 gün, Bu ay) dönemi değiştirin.', 'Sipariş listesinden bir siparişe tıklayınca sağda işlemleri görünür.'], ['Kanala yazma']],
  siparisler: ['Siparişler', 'Tüm kanallardan gelen siparişler tek listede. Siparişler 15 dakikada bir kendiliğinden gelir.', ['Üstteki sekmelerle duruma göre süzün (Yeni, Hazırlanıyor, Geciken …).', 'Siparişe tıklayın: "İşleme al" → "Paketle ve etiket al" → kargoya verin.', 'Birden fazla siparişi seçip toplu etiket basabilirsiniz.'], ['Paketleme', 'Ortak barkod']],
  kargo: ['Kargo', 'Kargoya çıkacak paketler: etiket basılacaklar, kargoya verilecekler ve yoldakiler.', ['"Hazırlanacak" sekmesinde paketi seçip "Paketle ve etiket al"a basın.', 'Etiketi yazdırınca paket "Kargoya verilecek"e geçer.', '"Toplama listesi" depodan toplanacak ürünlerin toplamını verir.'], ['Paketleme', 'Ortak barkod']],
  iadeler: ['İadeler', 'Pazaryerlerinden gelen iade talepleri. Onay / ret kararı doğrudan pazaryerine gider.', ['Ürün size ulaşıp kontrol edilmeden karar vermeyin.', 'Reddederken gerekçe seçin ve mümkünse fotoğraf ekleyin.'], []],
  sorular: ['Müşteri Soruları', 'Pazaryerlerinde müşterilerin ürünlerinize sorduğu sorular.', ['Soruyu açıp cevabınızı yazın; cevap pazaryerine gönderilir.', 'Sık kullandığınız cevapları hazır cevap olarak kaydedebilirsiniz.'], []],
  urunler: ['Ürünler', 'Paneldeki ürün kartlarınız: fiyat, stok, alış fiyatı ve kanallardaki ilanları.', ['Alış fiyatını girin: kâr hesapları buna göre yapılır.', 'Varyantlı ürünlerde "Varyantları düzenle" ile tüm varyantları tek ekranda değiştirin.', 'Araçlar menüsünden Excel ile toplu güncelleme yapabilirsiniz.'], ['İlan', 'Eşleştirme', 'Kritik stok']],
  stoklar: ['Stoklar', 'Ürünlerin stok adedi, kaç gün yeteceği ve kanallardaki stok.', ['Stoğu değiştirince (stok gönderimi açıksa) tüm kanallara gider.', 'Kırmızı / turuncu ürünler yakında tükenecek demektir.'], ['Stok gönderimi', 'Kritik stok']],
  'kanal-urunleri': ['Kanaldaki ürünler', 'Kanallarınızdaki ilanlar. Panelde olmayanları seçip panele alırsınız.', ['Kanal sekmesini seçin, "Panelde değil" listesindeki ilanları işaretleyip "Panele ekle"ye basın.', 'Aynı barkod / stok kodlu ürün panelde varsa ona bağlanır, yoksa yeni ürün açılır.'], ['İlan', 'Eşleştirme', 'Ana katalog']],
  eslestirme: ['Eşleştirme', 'Kendiliğinden eşleşemeyen ilanları doğru ürüne bağlarsınız.', ['"Onay bekleyen" listesinde önerilen ürünü kontrol edip onaylayın.', 'Yanlış eşleşme varsa "Eşleşmiş ürünler"den bağlantıyı kaldırın.'], ['Eşleştirme', 'İlan', 'Ana katalog']],
  'urun-yukle': ['Pazaryerine yükle', 'Panelde olup pazaryerinde olmayan ürünleri pazaryerine gönderirsiniz.', ['Kategorinizi pazaryeri kategorisiyle bir kez eşleştirin.', '"… ürünü gönder" ile yükleyin.', 'Onay sonucunu "Gönderimler" bölümünde takip edin.'], ['İlan']],
  kampanyalar: ['Kampanyalar', 'Rakip fiyatlarına göre fiyat önerileri ve Hepsiburada sepet indirimleri.', ['"Birinciliği al" sekmesi rakibin önde olduğu ürünleri ve önerilen fiyattaki kârınızı gösterir.', '"Kâr artır" sekmesi birinci sıra sizdeyken fiyatı yükseltebileceğiniz ürünleri gösterir.', 'Uygun olanı tek tıkla ya da seçip toplu uygulayın; fiyat kanala gönderilir.'], ['Fiyat önerisi', 'Buybox']],
  buybox: ['Buybox', 'Aynı ürünü satan rakiplere göre sıranız ve fiyat farkı.', ['"Kaybedilen" sekmesi rakibin önde olduğu ürünleri gösterir.', 'Ürüne en düşük / en yüksek fiyat kuralı tanımlayıp otomatik fiyatı açabilirsiniz.'], ['Buybox']],
  analiz: ['Satış analizi', 'Günlük, haftalık, aylık satış; en çok satanlar ve illere göre satış.', ['Üstteki kanal sekmesiyle tek kanalı inceleyin.', 'Dönem düğmeleriyle karşılaştırın.'], []],
  'gelir-gider': ['Gelir & gider', 'Satıştan kâra: komisyon, kargo, hizmet bedeli, stopaj ve hakediş.', ['Kesinti oranlarınızı Ayarlar → Giderler\'den kontrol edin.', 'Alış fiyatı eksik ürünler kârı olduğundan yüksek gösterir; Ürünler\'den tamamlayın.'], ['Hakediş', 'Stopaj']],
  kar: ['Kâr hesapla', 'Bir ürünün satış fiyatında ne kadar kazandığınızı hesaplar.', ['Satış ve alış fiyatını girin; komisyon kanalı seçince dolar.', 'Hedef kâr oranına göre satış fiyatı önerisi alın.'], ['Stopaj']],
  musteriler: ['Müşteriler', 'Müşterileriniz, tekrar sipariş verenler ve illere göre dağılım.', ['Listeden müşteriye tıklayınca tüm siparişleri görünür.'], []],
  entegrasyonlar: ['Entegrasyonlar', 'Satış kanallarınızı (site ve pazaryerleri) bağladığınız yer.', ['Kanal kartında "Bağla"ya basın.', 'Kanalın satıcı panelinden aldığınız API bilgilerini girip "Kaydet ve bağlantıyı test et"e basın.', 'Bağlantı doğrulanınca siparişler ve ürünler kendiliğinden gelir.'], ['Kanala yazma', 'Stok gönderimi']],
  kullanicilar: ['Personel', 'Ekibinizi ekler, her kişiye yalnız ihtiyaç duyduğu bölümleri açarsınız.', ['"Personel ekle" ile kullanıcı oluşturun, rol şablonu seçin.', '"Görür" yetkisi yalnız görüntüleme verir, değişiklik yapamaz.'], []],
  ayarlar: ['Ayarlar', 'Firma bilgileri, stok, giderler, bildirimler ve kargo etiketi ayarları.', ['Sekmeler arasında gezinip her sekmede "Kaydet"e basın.', 'Firma bilgileri ve logo kargo etiketinde ve e-postalarda kullanılır.'], ['Stok gönderimi', 'Ana katalog', 'Stopaj']],
  destek: ['Destek', 'Sorunlarınızı ve sorularınızı bize iletirsiniz; yanıtı buradan görürsünüz.', ['"Yeni talep"e basın, sorunu yazın, isterseniz ekran görüntüsü ekleyin (Ctrl+V ile yapıştırabilirsiniz).', 'Yanıt gelince menüde "Destek" yanında sayı görünür.'], []],
  bildirimler: ['Bildirimler', 'Kanal hataları ve dikkat edilmesi gereken durumlar.', ['Sorun çözülünce bildirim kendiliğinden kapanır.'], []],
};

export function openHelp(path, onReport) {
  const p = PAGES[path] || PAGES[''];
  const terms = [...new Set(p[3])];
  const s = sheet({
    title: `Nasıl kullanılır? · ${p[0]}`, size: 'narrow',
    body: html`<div class="stack help-sheet">
      <p style="margin:0">${p[1]}</p>
      <ol class="help-steps">${p[2].map((x) => html`<li>${x}</li>`)}</ol>
      ${terms.length ? html`<div><h3>Bu sayfadaki terimler</h3><dl class="help-terms">${terms.map((t) => html`<dt>${t}</dt><dd>${GLOSSARY[t]}</dd>`)}</dl></div>` : ''}
      <details><summary style="cursor:pointer;font-weight:650">Tüm terimler sözlüğü</summary><dl class="help-terms" style="margin-top:8px">${Object.entries(GLOSSARY).map(([t, d]) => html`<dt>${t}</dt><dd>${d}</dd>`)}</dl></details>
      ${state.tenant ? html`<div class="notice small"><i class="ico ico-chat"></i><div style="flex:1">Aradığınızı bulamadınız mı? Bize yazın, panelden yanıt verelim.</div><button class="btn sm primary" data-report>Destek talebi aç</button></div>` : ''}
    </div>`,
  });
  const b = $('[data-report]', s.el);
  if (b) b.onclick = () => { s.close(); onReport && onReport(p[0]); };
}
