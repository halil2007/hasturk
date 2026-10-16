// Kategori önerisi: gerçek Pazarama ağacından bir kesit + gerçek ikas kategori yolları ve ürün adlarıyla görülen yanlış öneriler sabitlenir.
// Kurallar sektörden bağımsızdır (Türkçe ek / kök, baş kelime, alan ve tür uyumu); bu firmaya özel eşleme tablosu yoktur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, same } from '../src/catmatch.js';
import { confident } from '../src/catalog.js';

// Pazarama getCategoryTree yapraklarından kesit (yol › [yaprak adları]); yanlış öneriler ve doğru kategoriler birlikte
const SLICE = [
  ["Ev, Yaşam, Yapı Market › Bahçe › Bahçe Dekorasyonu", ["Bahçe Çiti"]],
  ["Ev, Yaşam, Yapı Market › Bahçe › Bahçe El Aletleri", ["Alet Sapı","Aşı Bıçağı, Makası","Bahçe Eldiveni","Bahçe Seti","Budama Makası","Budama Testeresi","Fide Dikici, Sökücü","Kürek, Kazma","Meyve Toplama Aleti","Orak","Tırmık","Tırpan Misinası","Çapa","Çim, Çit Makası"]],
  ["Ev, Yaşam, Yapı Market › Bahçe › Bahçe Makineleri", ["Hidrofor, Pompa","Çapa Makinesi Aksesuar, Yedek Parça"]],
  ["Ev, Yaşam, Yapı Market › Bahçe › Bahçe Mobilyası", ["Bahçe, Balkon Salıncağı"]],
  ["Ev, Yaşam, Yapı Market › Bahçe › Havuz & Havuz Ekipmanları › Havuz Yapı Malzemeleri", ["Havuz Filtresi","Havuz, Dozaj Pompası"]],
  ["Ev, Yaşam, Yapı Market › Bahçe › Sulama", ["Bahçe Musluğu","Fıskiye, Çim Sulama Sistemleri","Hortum Bağlantısı, Kelepçe","Hortum Tabancası, Sulama Başlığı","Hortum, Hortum Toplama","Su Zamanlayıcı","Sulama Kabı"]],
  ["Ev, Yaşam, Yapı Market › Bahçe › Çiçek, Bitki", ["Bitki Vitamini, Besini","Bitki Yetiştirme Kiti","Bonsai","Fidan","Fide","Gübre","Kaktüs","Saksı","Sera, Sera Malzemeleri","Sukulent","Teraryum, Teraryum Aksesuarları","Tohum","Torf ve Toprak","İç Mekan Bitkileri"]],
  ["Ev, Yaşam, Yapı Market › Sofra & Mutfak › Pratik Mutfak Aletleri", ["Krema Pompası"]],
  ["Kitap, Kırtasiye, Hobi, Oyuncak › Oyuncak › Beceri Oyuncakları", ["Kinetik Kum"]],
  ["Kişisel Bakım ve Kozmetik › Kişisel Bakım › El,Ayak,Tırnak Bakımı", ["Ayak Koku Giderici"]],
  ["Spor ve Outdoor › Outdoor Aktivite › Bisiklet ve Aksesuar › Bisiklet Aksesuar", ["Bisiklet Pompası"]],
  ["Spor ve Outdoor › Outdoor Aktivite › Tekne Malzemeleri", ["Tekne Pompaları"]],
  ["Spor ve Outdoor › Sporcu Besinleri", ["Amino Asit"]],
  ["Süpermarket › Deterjan ve Temizlik Ürünleri › Ev Temizlik", ["Böcek İlacı"]],
  ["Süpermarket › Gıda › Yağlar", ["Bitkisel Yağlar","Zeytinyağı"]],
  ["Süpermarket › Pet Shop › Kedi", ["Kedi Elbisesi","Kedi Evi","Kedi Güvenlik","Kedi Kumları","Kedi Mama ve Su Kapları","Kedi Maması","Kedi Oyuncakları","Kedi Tasmaları ve İsimlikler","Kedi Tuvaleti, Aksesuarları","Kedi Tırmalama","Kedi Vitamini","Kedi Yatağı","Kedi Çantası","Kedi Ödülleri","Tüy Toplama Ürünleri"]],
  ["Süpermarket › Pet Shop › Kedi › Kedi Hijyen,Bakım Ürünleri", ["Kedi Koku Giderici","Kedi Tarak, Fırça, Makas","Kedi Tuvalet Eğitimi","Kedi Tüyü Bakımı Ürünleri","Kedi Çimleri","Kedi Şampuanları","Parazit Karşıtı Ürünler"]],
  ["Süpermarket › Pet Shop › Köpek", ["Köpek Elbisesi","Köpek Güvenlik","Köpek Kafesi, Aksesuarları","Köpek Kemikleri","Köpek Kulubesi","Köpek Mama ve Su Kapları","Köpek Maması","Köpek Oyuncakları","Köpek Tasmaları","Köpek Taşıma Çantası, Aksesuarları","Köpek Vitamini","Köpek Yatağı","Köpek Ödülleri"]],
  ["Süpermarket › Pet Shop › Köpek › Köpek Hijyen,Bakım Ürünleri", ["Furminator","Kene, Pire & Parazit Ürünleri","Köpek Koku Giderici","Köpek Sağlık & Bakım Malzemeleri","Köpek Tarak, Fırça, Makas","Köpek Tuvaleti & Eğitim Ürünleri","Köpek Tıraş Makinesi","Köpek Çiş Pedleri & Külotlar","Köpek Şampuanları & Banyo Malzemeleri"]],
  ["Süpermarket › Pet Shop › Sürüngenler", ["Sürüngen Yemler, Ek Besinler"]],
];
const TREE = SLICE.flatMap(([path, leaves]) => leaves.map((name) => ({ id: path + ' › ' + name, name, path })));
const top = (local, names) => { const r = rank(TREE, local, names, 5); return { r, best: r[0] ? r[0].name : null, sure: confident(r) }; };

test('Türkçe ek / kök: kumu ~ kumları; yapım eki anlamı değiştirir', () => {
  assert.ok(same('kumu', 'kumlari') && same('yagi', 'yaglari') && same('kedi', 'kediler') && same('bitki', 'bitkileri'));
  assert.ok(!same('bitki', 'bitkisel'), 'bitkisel yağ bitki değildir');
  assert.ok(!same('koku', 'kokulu') && !same('ilac', 'ilaclama') && !same('kitap', 'kitaplik') && !same('tuz', 'tuzsuz'));
});

test('gerçek örnekler (Pazarama): yanlış alan / yanlış nesne önerilmez, yanlış öneri "emin" görünmez', () => {
  const pump = top('Bahçe Ekipmanları › İlaçlama Pompaları', ['Delta 10 Lt Basınçlı İlaçlama Pompası K-83', 'Lıtolan 16 Lt Akülü İlaçlama Pompası', 'Uzman 16 Lt Sırt Pulverizatörü İlaçlama Pompası (K-103)',
    'Pomsan 20 Lt Manuel İlaçlama Pompası K-305', 'Uzman 2 Lt Basınçlı El Püskürtücü']);
  assert.ok(!pump.r.some((x) => /Havuz/.test(x.path + x.name)), 'ilaçlama pompası havuz dozaj pompası değildir: ' + pump.best);
  assert.equal(pump.sure, false, 'ağaçta ilaçlama pompası yok: öneri zayıf kalır');

  const leafy = top('Bitkiler › Salon ve Ev Bitkileri › Yapraklı Salon Bitkileri', ['Alocasia Fil Kulağı Bitkisi', 'Dracaena Mısır Bitkisi', 'Ficus Ginseng Bonsai Ağacı', 'Sarı Kenarlı Paşa Kılıcı']);
  assert.equal(leafy.best, 'İç Mekan Bitkileri');
  assert.ok(!leafy.r.some((x) => x.name === 'Bitkisel Yağlar'));

  const litter = top('Kedi Ürünleri › Kedi Kumu', ['Prochoice Aktif Karbonlu Bentonit Kedi Kumu 10 Lt', 'Proline Lavanta Kokulu 10 LT Bentonit Kedi Kumu', 'Proline Bebek Pudra Kokulu Bentonit Kedi Kumu 5 LT']);
  assert.equal(litter.best, 'Kedi Kumları'); assert.ok(litter.sure);

  const treat = top('Kedi Ürünleri › Kedi Ödül Maması', ['Reflex Plus Natural Tavuk Fileto Kedi Ödül Maması 30 Gr', 'Reflex Plus Sticks Somonlu Kedi Ödül Çubuğu 3x5 Gr',
    'Reflex Plus Mini Mix Somonlu Kuzu Etli Biftekli Kısır Tavuk Kedi Ödülleri 20 X 2 Gr', 'Wanpy Tavuklu Sıvı Kedi Ödül Maması 5x14 Gr', 'Reflex Plus Sticks Hindi ve Kuzu Etli Kedi Ödül Çubuğu 3x5 Gr',
    'Bestpet Jöleli Somonsuz Kedi Yaş Maması 85 Gr', 'Wanpy Taze Tavuklu&Havuçlu Kedi Et Ezmesi 90 gr']);
  assert.equal(treat.best, 'Kedi Ödülleri');

  const paste = top('Kedi Ürünleri › Vitaminler ve Ek Besinler › Kedi Macunu', ['Jungle Bağışıklık ve Deri Tüy Sağlığı Destekleyici Kedi Vitamin Macunu 75ml', 'Jungle Kedi Tüy Yumağı Önleyici ve Multivitamin Macun 75ml',
    'Spectrum Care Tüy Yumağı Önleyici Malt Paste 100 g']);
  assert.equal(paste.best, 'Kedi Vitamini');
  assert.ok(!paste.r.some((x) => /Bitki|Gübre/.test(x.name)), 'kedi macunu bitki vitamini / gübre değildir');

  const balcony = top('Bitkiler › Balkon ve Bahçe Bitkileri', ['Kırmızı Malabar Ispanağı']);
  assert.notEqual(balcony.best, 'Bahçe, Balkon Salıncağı'); assert.equal(balcony.sure, false);

  const ornamental = top('Bitkiler › Süs Bitkileri', ['Dracaena Mısır Bitkisi', 'Ficus Ginseng Bonsai Ağacı', 'Telgraf Çiçeği ve Sukulent Aranjmanı – Mint Yeşili Saksıda']);
  assert.equal(ornamental.best, 'İç Mekan Bitkileri');
  const orchid = top('Bitkiler › Çiçekli Saksı Bitkileri › Orkideler', ['Beyaz Kelebek Orkide']);
  assert.equal(orchid.best, 'İç Mekan Bitkileri', 'ağaçta orkide yok: üst kategorinin başı (bitki) geçer, niteleyicisi (saksı) değil');
  assert.equal(orchid.sure, false);
});

test('gerçek örnekler: doğru ve emin öneriler korunur', () => {
  for (const [local, names, want] of [
    ['Kedi Ürünleri › Kedi Maması › Yetişkin Kedi Maması', ['Reflex Plus Tavuklu Yetişkin Kedi Maması 1,5 Kg', 'Pro Plan Somonlu Yetişkin Kedi Maması 3 Kg'], 'Kedi Maması'],
    ['Köpek Ürünleri › Köpek Ödül Maması', ['Reflex Plus Smoothie Biftekli ve Mangolu 85 gr Sıvı Köpek Ödül Maması', 'Reflex Plus Smoothie Kuzu Etli ve Papayalı Sıvı Yavru Köpek Ödülü 85 gr',
      'Reflex Plus Smoothie Ton Balıklı ve Kivili 85 gr Sıvı Köpek Ödül Maması'], 'Köpek Ödülleri'],
    ['Kedi Ürünleri › Kedi Kumu › Kedi Kumu Koku Giderici', ['Quik Kedi Kumu Koku Giderici Lavanta 500 gr', 'Quik Kedi Kumu Koku Giderici Bebek Pudrası 500 gr'], 'Kedi Koku Giderici'],
    ['Kedi Ürünleri › Vitaminler ve Ek Besinler › Kedi Çimi', ['Jungle Kedi Çimi Kutulu (Fileli)', 'Quik Doğal Kedi Çimi (Fileli)'], 'Kedi Çimleri'],
    ['Halk Sağlığı Ürünleri › Böcek İlaçları', ['Chrysamed G-05 Pro Konsantre Böcek İlacı 1 Lt', 'Chrysamed Konsantre EC Haşere İlacı 1 Lt'], 'Böcek İlacı'],
    ['Gübreler › Solucan Gübresi › Sıvı Solucan Gübresi', ['HasTürk Sıvı Solucan Gübresi 1 Lt', 'HasTürk Sıvı Solucan Gübresi 5 Lt'], 'Gübre'],
    ['Tohumlar › Sebze Tohumu', ['Domates Tohumu', 'Biber Tohumu', 'Salatalık Tohumu'], 'Tohum'],
    ['Topraklar › Özel Bitki Toprakları', ['Orkide Toprağı 5 Lt', 'Kaktüs Toprağı 5 Lt'], 'Torf ve Toprak'],
    ['Saksılar ve Bahçe Yatakları › Dekoratif Saksılar', ['Yuvarlak Vakum Saksı - 13 X 10,5 CM', 'Kare Saksı 20 cm'], 'Saksı'],
  ]) {
    const t = top(local, names);
    assert.equal(t.best, want, local);
    assert.ok(t.sure, local + ' emin olmalı');
  }
});
