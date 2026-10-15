// Ak Bilge soru havuzu üretici: doğrulanmış kaynaklardan (config.json > guides kullanım tabloları ve bilgi/urunler.json
// kartları) hazır soru-cevaplar üretir. Cevaplardaki rakamlar tablodan birebir alınır; yapay zeka rakam üretmez.
// Çelişkili / eksik dozlar cevaba konmaz, müşteri hizmetlerine yönlendirilir. Çıktı: bilgi/soru-havuzu.json
import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('config.json', 'utf8'));
const kb = JSON.parse(await readFile('bilgi/urunler.json', 'utf8')).urunler;
const oto = JSON.parse(await readFile('bilgi/urunler-otomatik.json', 'utf8')).urunler;
const prods = JSON.parse(await readFile('public/products.json', 'utf8'));
const bySlug = new Map(prods.items.map((p) => [p.s, p]));
const toh = JSON.parse(await readFile('bilgi/tohumlar.json', 'utf8'));
// Kaynaklar müşteriye gösterilmez (kafa karıştırmasın); kayıt alanında (kaynak) ve bilgi/ dosyalarında durur
const tKaynak = () => '';
const tohumMetin = (t) => [
  t.yontem === 'fide' ? 'Nasıl: önce fide yetiştirilir, sonra yerine dikilir.' : t.yontem === 'doğrudan' ? 'Nasıl: tohum doğrudan yerine ekilir.' : `Nasıl: ${t.yontem}.`,
  t.zaman && `Ne zaman: ${t.zaman}`,
  t.derinlik && `Ne kadar derine: ${t.derinlik}.`,
  t.mesafe && `Aralık: ${t.mesafe}.`,
  t.cimlenme && `Çimlenme: ${t.cimlenme}.`,
  t.sicaklik, t.hasat && `Hasat: ${t.hasat}.`,
].filter(Boolean).map((x) => '• ' + x).join('\n');
const USTA = 'Kesin bilgi için müşteri hizmetlerimizden destek alabilirsiniz.';
// Sade dil: müşteriye giden cevaplarda ağır tarım terimleri ve kısaltmalar günlük dile çevrilir; miktarlar
// "dekara 60–80 kg", "fidan başına 2 kg" gibi okunur biçimde yazılır. (Rakamlar değişmez, yalnız yazılışı değişir.)
const TERIM = [
  [/yetişkin ağaçta taç izdüşümündeki kök bölgesine; 15 cm en ve 15 cm derinlikte çembere veya diskaro ile toprak altına/gi, 'Yetişkin ağaçta; dal uçlarının altına 15 cm genişlik ve derinlikte bir çember açıp toprağa karıştırın'],
  [/([\d.,]+)\s*cc\s*-\s*([\d.,]+)\s*(L|lt)\/dekar/g, 'dekara $1 ml – $2 litre'],
  [/viyolü bandırma/gi, 'viyolünü suya batırma'],
  [/vejetatif kök gelişim döneminde/gi, 'bitki büyümeye başladığında'], [/kardeşlenme döneminde/gi, 'yan sürgünler çıkarken (kardeşlenme)'],
  [/sapa kalkma döneminde/gi, 'saplar uzarken'], [/tohuma kalkma/gi, 'tohum bağlama'],
  [/(ağaca )?su yürümesi başladıktan (\d+ gün )?sonra/gi, (m, a, g) => (g ? `ağaç uyanıp tomurcuklar kabardıktan ${g}sonra` : 'ağaç uyanıp tomurcuklar kabarınca')],
  [/su yürümesinden (\d+ gün) sonra/gi, 'ağaç uyanıp tomurcuklar kabardıktan $1 sonra'],
  [/su yürümesi/gi, 'ağacın uyanması (tomurcukların kabarması)'],
  [/taç izdüşümündeki/gi, 'dal uçlarının altına denk gelen'], [/taç izdüşümüne/gi, 'dal uçlarının altına'], [/taç izdüşümü/gi, 'dal uçlarının altı'],
  [/meyve tutumunda/gi, 'meyveler oluşurken'], [/meyve irileştirme döneminde/gi, 'meyveler büyürken'],
  [/kökle temas edecek şekilde/gi, 'köke değecek şekilde'], [/veya diskaro ile/gi, 'ya da çapayla'], [/diskaro ile/gi, 'çapayla'],
  [/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*kg\/dekar/g, 'dekara $1 kg'], [/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*kg\/m²/g, 'metrekareye $1 kg'],
  [/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*(kg|g)\/(fidan|asma|bitki|kök|ağaç|fide|saksı)/g, '$3 başına $1 $2'],
  [/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*cc\/dekar/g, 'dekara $1 ml'], [/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*(L|lt)\/dekar/g, 'dekara $1 litre'],
  [/([\d.,]+(?:\s*[-–]\s*[\d.,]+)?)\s*(L|lt)\/da\b/g, 'dekara $1 litre'],
  [/Gölge çapı \(m\) = kg/g, 'ağacın gölge çapı kaç metreyse o kadar kg (ör. 3 metre → 3 kg)'],
  [/(\d)\s*L suya/g, '$1 litre suya'], [/(\d)\s*cc\b/g, '$1 ml'], [/\bcc\b/g, 'ml'],
  [/(\d)\s*-\s*(\d)/g, '$1–$2'],
];
const sadeMetin = (t) => { let x = String(t || ''); for (const [re, to] of TERIM) x = x.replace(re, to); return x; };
// Dekar geçen cevaba bir kez açıklama eklenir
const dekarNot = (t) => (/dekar/.test(t) && !/1 dekar =/.test(t) ? t + '\n\n(1 dekar = 1.000 metrekare)' : t);
// Kullanım satırı: "• Ne zaman / nasıl: ne kadar (yöntem)". Yöntem zaten cümlede geçiyorsa tekrar yazılmaz.
const YONTEM = { 'Serpme / Toprak altı': 'toprağa serpip karıştırarak', 'Harca karıştırma': 'toprağa karıştırarak', 'Bant uygulama': 'sıra boyunca', 'Kök bölgesine': 'kök çevresine',
  'Fidan çukuruna': 'fidan çukuruna', 'Taç izdüşümü / Toprak altı': 'dal uçlarının altına, toprağa karıştırarak', 'Fide çukuruna': 'fide çukuruna', 'Dikim yalağına': 'dikim çukuruna',
  'Serpme': 'serperek', 'Bandırma': 'köklerini batırarak', 'Damla sulama': 'damla sulamayla', 'Yapraktan': 'yapraklara püskürterek', 'Tohum ıslama': 'tohumu ıslatarak',
  'Yağmurlama': 'yağmurlama sulamayla', 'Geniş toprak uygulaması': 'toprağa', 'Sıra üzeri şerit uygulama': 'sıra boyunca', 'Sıra üzeri uygulama': 'sıra boyunca',
  'Damlama / sulama suyuna': 'sulama suyuna katarak', 'Damla sulama / sulama suyuna': 'sulama suyuna katarak', 'Toprağa': 'toprağa' };
const ANAHTAR = { 'fidan çukuruna': /fidan çukur/i, 'fide çukuruna': /fide çukur/i, 'dikim çukuruna': /dikim/i, 'serperek': /serp/i, 'toprağa serpip karıştırarak': /serp/i, 'toprağa karıştırarak': /karıştır|harc/i,
  'sıra boyunca': /sıra|bant|şerit/i, 'kök çevresine': /kök/i, 'yapraklara püskürterek': /yaprak/i, 'damla sulamayla': /damla/i, 'sulama suyuna katarak': /sulama/i, 'köklerini batırarak': /bandır|batır/i,
  'tohumu ıslatarak': /ısla/i, 'yağmurlama sulamayla': /yağmurla/i, 'toprağa': /toprağa|toprak/i, 'dal uçlarının altına, toprağa karıştırarak': /taç|dal uç/i };
const buyuk = (x) => x.charAt(0).toLocaleUpperCase('tr-TR') + x.slice(1);
const adim = (st) => {
  const tam = sadeMetin(st[0]).replace(/[.;]\s*$/, ''), y = YONTEM[st[1]] ?? lc(st[1]), mik = sadeMetin(st[2]);
  const tekrar = ANAHTAR[y] ? ANAHTAR[y].test(st[0]) : lc(st[0]).includes(y);
  // Uzun açıklama "; " ile bölünmüşse: önce kısa başlık ve miktar, sonra nasıl yapılacağı
  const [ne, ...ek] = tam.split(/;\s*/);
  return `• ${buyuk(ne)}: ${mik}${y && !tekrar ? ' (' + y + ')' : ''}${ek.length ? '. ' + buyuk(ek.join(', ')) + '.' : ''}`;
};
const NOT_SADE = (n) => (n && /genel uygulama rehberi/i.test(n) ? 'Bu miktarlar genel öneridir; uygularken ürün etiketine de bakın.' : sadeMetin(n || ''));
const out = [];
// durum: hazir = doğrulanmış tablolardan/ürün bilgisinden üretildi, canlıda kullanılır. Claude'un yeni cevapları
// sunucuda 'onay-bekliyor' olarak tutulur ve onaylanınca havuza katılır.
// Aynı cümle bir cevapta iki kez geçmesin ("Kesin bilgi için müşteri hizmetlerimizden…" gibi); " ." → "."
const tekil = (c) => { const g = new Set(); return c.replace(/ +([.,;:])/g, '$1').replace(/[^.!?\n]+[.!?]/g, (m) => { const k = m.trim().toLocaleLowerCase('tr-TR'); if (k.length > 20 && g.has(k)) return ''; g.add(k); return m; }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); };
const add = (e) => { if (e.cevap) e.cevap = tekil(dekarNot(sadeMetin(e.cevap))); if (e.urun && (e.tur === 'urun' || e.tur === 'saksi' || e.tur === 'pompa')) e.sorular = kisaKalip(e.sorular, ((bySlug.get(e.urun) || {}).n || '')); out.push({ id: 'h' + String(out.length + 1).padStart(4, '0'), durum: 'hazir', ...e }); };
const lc = (s) => s.toLocaleLowerCase('tr-TR');
// Kısa ürün adı: müşteri marka ve paket ölçüsü yazmaz ("hastürk sıvı solucan gübresi 1 lt" → "sıvı solucan gübresi")
const MARKA = new Set(['hg', 'hastürk', 'hasturk', 'arzuman', 'altınvadi', 'egarden', 'reflex', 'wanpy', 'prochoice', 'chrysamed', 'brit', 'proline', 'uzman', 'raco', 'bestpet', 'quik', 'tigem', 'felicia', 'sgs', 'florist', 'jungle', 'tarm', 'delta', 'flip', 'güzelbahçe', 'lıtolan', 'litolan', 'beavis', 'dsv', 'lippa', 'spectrum', 'sinpest', 'trendline', 'ilposan', 'i̇lposan', 'biosas', 'komelon', 'envaplas', 'gartengold', 'icl', 'klasmann', 'pomsan', 'qts', 'serinova', 'özka', 'arom', 'gold', 'valley']);
const kisaAd = (ad) => lc(ad).replace(/\s*\|.*$/, '').replace(/\s+[-–]\s+.*$/, '').replace(/\(.*?\)/g, ' ')
  .replace(/\b\d+(?:[.,]\d+)?\s*(?:gr|g|kg|lt|l|litre|ml|adet|cm|m)\b/g, ' ').replace(/[×x]\s*\d+/g, ' ')
  .split(/\s+/).filter((w) => w && !MARKA.has(w)).join(' ').replace(/\s+/g, ' ').trim();
// Ürün soru kalıplarına kısa adla da kopya ekle (kalıpların ortak başı ürün adıdır). Kısa adı birden çok üründe aynı
// çıkıyorsa (ör. aynı serinin farklı litreleri) eklenmez; yoksa yanlış boy gösterilebilir.
const KISA_SAY = new Map();
prods.items.forEach((p) => { const k = kisaAd(p.n); KISA_SAY.set(k, (KISA_SAY.get(k) || 0) + 1); });
const kisaKalip = (sorular, ad) => {
  const k = kisaAd(ad);
  if (sorular.length < 2) return sorular;
  let pre = sorular.reduce((a, q) => { let i = 0; while (i < a.length && a[i] === q[i]) i++; return a.slice(0, i); });
  pre = pre.slice(0, pre.lastIndexOf(' ') + 1);
  if (pre.trim().length < 4) return sorular;
  // Sadece marka çıkarılmış ad (ölçü kalır) her zaman; tamamen kısa ad yalnız tek ürüne aitse
  const mk = pre.trim().split(/\s+/).filter((w) => !MARKA.has(w)).join(' ');
  const adlar = [mk, KISA_SAY.get(k) > 1 ? '' : k].filter((a) => a && a !== pre.trim());
  return [...new Set(sorular.concat(...adlar.map((a) => sorular.map((q) => a + ' ' + q.slice(pre.length)))))];
};
// Türkçe yönelme eki (domatese, limona, bibere…) — soru varyantlarında doğal görünsün diye
const yon = (w) => {
  const s = lc(w).replace(/\s*\(.*\)\s*/g, '').trim(), last = s.split(' ').pop();
  const v = (last.match(/[aeıioöuü]/g) || []).pop() || 'e', back = 'aıou'.includes(v), end = /[aeıioöuü]$/.test(last);
  return s + (end ? 'y' : '') + (back ? 'a' : 'e');
};
const kisa = { kati: 'solucan gübresi', sivi: 'sıvı solucan gübresi', humik: 'hümik asit' };

// A) Bitki × HasTürk ürünü (kullanım tabloları)
for (const g of config.guides || []) {
  const ad = ((bySlug.get(g.product) || {}).n || g.title).trim(), k = kisa[g.id] || lc(g.title);
  for (const gr of g.groups || []) {
    const satirlar = gr.steps.map(adim).join('\n');
    for (const bitki of gr.plants) {
      const b = bitki.replace(/\s*\(.*\)\s*/g, '').trim();
      add({
        tur: 'bitki-doz', bitki, grup: gr.name, urun: g.product,
        sorular: [`${b} için ${k} ne kadar kullanılır`, `${yon(bitki)} ${k} nasıl verilir`, `${b} ${k} dozu`, `${yon(bitki)} ne kadar ${k} atılır`],
        cevap: dekarNot(`${bitki.replace(/\s*\(.*\)\s*/g, '').trim()} için ${ad} kullanımı:\n${satirlar}\n\n${NOT_SADE(g.note)}`.trim()),
        urunler: [g.product], kaynak: `rehber:${g.id}`,
      });
    }
  }
}

// A2) Bitki için gübre (genel soru): o bitkinin tüm kullanım tabloları tek cevapta
const BIRLESIK = new Map();
for (const g of config.guides || []) {
  const ad = ((bySlug.get(g.product) || {}).n || g.title).trim();
  for (const gr of g.groups || []) for (const bitki of gr.plants) {
    if (!BIRLESIK.has(bitki)) BIRLESIK.set(bitki, { grup: gr.name, parca: [], urunler: [] });
    const B = BIRLESIK.get(bitki);
    B.parca.push(`${ad}:\n${gr.steps.map(adim).join('\n')}`);
    B.urunler.push(g.product);
  }
}
for (const [bitki, B] of BIRLESIK) {
  const b = bitki.replace(/\s*\(.*\)\s*/g, '').trim(), l = lc(b);
  add({ tur: 'bitki-doz', bitki, grup: B.grup, sorular: [`${l} için gübre`, `${l} için besin`, `${l} için hangi gübre`, `${yon(bitki)} hangi gübre verilir`, `${l} gübreleme`, `${l} nasıl gübrelenir`, `${l} için en iyi gübre`, `${l} gübre önerisi`, `${l} ne zaman gübrelenir`, `${l} gübresi`],
    cevap: dekarNot(`${b} için önerdiğimiz ürünler ve miktarları:\n\n${B.parca.join('\n\n')}\n\nBu miktarlar genel öneridir; uygularken ürün etiketine de bakın.`), urunler: [...new Set(B.urunler)], kaynak: 'rehber:birlesik' });
}

// B) Ürün kartları
for (const [slug, c] of Object.entries(kb)) {
  const p = bySlug.get(slug), ad = (p && p.n.trim()) || c.ad;
  const iyi = (c.kullanim || []).filter((u) => u.durum !== 'celiski');
  const kotu = (c.kullanim || []).filter((u) => u.durum === 'celiski');
  const satir = iyi.map((u) => `• ${u.alan}: ${u.miktar}`).join('\n');
  const birlikte = (c.birlikte || []).map((s) => (bySlug.get(s) || {}).n).filter(Boolean).map((n) => n.trim());
  let cevap = `${ad}${c.ozet ? ' — ' + c.ozet : ''}`;
  if (c.ayni && kb[c.ayni]) cevap += `\n\nKullanım miktarları "${(bySlug.get(c.ayni) || {}).n || kb[c.ayni].ad}" ile aynıdır.`;
  if (satir) cevap += `\n\nKullanım:\n${satir}`;
  if (kotu.length) cevap += `\n\n${kotu.map((u) => u.alan).join(', ')} için miktarı teyit ediyoruz. ${USTA}`;
  if (c.durum === 'eksik' || (!satir && !c.ayni && !c.rehber)) cevap += `\n\nKullanım miktarı ürün etiketinde yer alır. ${USTA}`;
  if (c.rehber) cevap += '\n\nBitkinize özel miktarı sorabilirsiniz (ör. "domatese ne kadar?").';
  if (birlikte.length) cevap += `\n\nBirlikte sık alınanlar: ${birlikte.slice(0, 3).join(', ')}.`;
  const n = lc(ad).replace(/\s*\|.*$/, '').trim();
  add({
    tur: 'urun', urun: slug, kartDurum: c.durum,
    sorular: [`${n} nasıl kullanılır`, `${n} ne kadar kullanılır`, `${n} dozu`, `${n} kullanım miktarı`, `${n} ne işe yarar`],
    cevap, urunler: [slug, ...(c.birlikte || []).slice(0, 2)], kaynak: `kart:${slug}`,
  });
}
// D) Bitki → toprak (config.json > soilMatch; Ürün Bul'daki eşleştirme). Ürün canlı stoktan seçilir (dinamik)
const PH = { 1: 'asidik', 2: 'hafif asidik', 3: 'nötr', 4: 'kireçli' };
const desc = (pr) => { const a = [+pr[0], +pr[1], +pr[2], +pr[3], +pr[4], pr[5]];
  const ph = a[1] <= 2 ? 'kireçsiz (asidik)' : a[0] >= 4 ? 'kireçli' : '';
  return [ph, { 2: 'suyu iyi süzen', 3: 'suyu çok iyi süzen' }[a[2]], { 1: 'çabuk kuruyan', 3: 'nemini koruyan' }[a[3]],
    { 1: 'az besinli', 3: 'besince zengin' }[a[4]], { k: 'kumlu', h: 'havadar' }[a[5]]].filter(Boolean).join(', '); };
for (const pl of (config.soilMatch || {}).plants || []) {
  const [ad, diger, grup, prof, ozel, strict] = pl;
  if (!/^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(prof || '')) continue;
  const adlar = [ad, ...String(diger || '').split(',').map((x) => x.trim()).filter(Boolean)];
  add({ tur: 'bitki-toprak', bitki: ad, grup, dinamik: 'toprak',
    sorular: adlar.flatMap((n) => [`${lc(n)} için hangi toprak`, `${lc(n)} toprağı`, `${lc(n)} saksı toprağı`, `${yon(n)} hangi toprak kullanılır`, `${lc(n)} için en iyi toprak`, `${lc(n)} için uygun toprak`, `${lc(n)} toprak önerisi`, `${lc(n)} saksı değişimi toprak`]),
    cevap: `${ad} için ${desc(prof)} bir toprak uygundur.${strict === 's' ? ' Özel bir toprak ister; bu yüzden yalnız ona uygun toprağımızı öneriyoruz.' : ''} Size uygun toprağımız aşağıda.`,
    urunler: ozel ? [ozel] : [], kaynak: 'config:soilMatch' });
}

// Ürün açıklamaları çoğu zaman ürün adını tekrar ederek başlar ("SUBON BUG STOP 500 ML – Bitki Spreyi Subon Bug Stop 500 ML, iç ve
// dış mekân…"). Baştaki, kelimelerinin çoğu ürün adından oluşan (ya da tamamı büyük harf) parçalar atılır.
const kel = (s) => lc(s).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((x) => x.length > 1);
const adAt = (s, ad) => {
  const A = new Set(kel(ad)); s = String(s || '').trim();
  for (let k = 0; k < 5; k++) {
    const m = s.match(/^(.{3,120}?)(?:\s[–—|-]\s|,\s|\s,\s?|:\s)/); if (!m) break;
    const w = kel(m[1]); if (!w.length || w.length > 14) break;
    const ad1 = w.filter((x) => A.has(x)).length / w.length, buyuk = /\p{L}/u.test(m[1]) && m[1] === m[1].toLocaleUpperCase('tr-TR');
    if (ad1 < 0.5 && !buyuk) break;
    s = s.slice(m[0].length).trim();
  }
  return s;
};
// İki metin aynı bilgiyi mi söylüyor (kelimelerin %80'i ortak)
const benzer = (a, list) => { const A = new Set(kel(a).filter((x) => x.length > 2)); if (A.size < 4) return false;
  return list.some((b) => { const B = new Set(kel(b).filter((x) => x.length > 2)); if (B.size < 4) return false; let n = 0; A.forEach((x) => B.has(x) && n++); return n / Math.min(A.size, B.size) > 0.8; }); };

// E) Diğer tüm ürünler: ürün sayfasından otomatik kartlar ("ürün bilgisine göre")
for (const [slug, c] of Object.entries(oto)) {
  if (!bySlug.has(slug)) continue;
  const n = lc(c.ad).replace(/\s*\|.*$/, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // Özet ürün adıyla başlıyorsa ad tekrar edilmez ("X — X, ..." yerine "X — ...")
  let oz = c.ozet || '';
  const adSade = lc(c.ad).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  for (const a of [lc(c.ad), adSade]) if (a && lc(oz).startsWith(a)) { oz = oz.slice(a.length).replace(/^[\s,:;—–-]+/, ''); break; }
  { // ad ölçüsüz yazılmışsa ("X Tohumu 5 Gr" / "X Tohumu, ...") baştaki ortak kelimeler atılır
    const aw = adSade.split(' '), ow = oz.split(' '); let i = 0;
    while (i < aw.length && i < ow.length && lc(ow[i]).replace(/[,:;]$/, '') === aw[i]) i++;
    if (i >= 3 && i >= aw.length * 0.6) oz = ow.slice(i).join(' ').replace(/^[\s,:;—–-]+/, '');
  }
  // Açıklamadaki kaçış karakterleri ("\\n") ve satıcı bilgisi ("Ürün Kodu: … | Marka: … | Satıcı: …") müşteriye gösterilmez
  const temiz = (t) => String(t || '').replace(/\\[nrt]/g, ' ').replace(/Ürün Kodu:[^|]*\|\s*Marka:[^|]*\|\s*Satıcı:\s*[^\s🐱🐶]+(\s+[^\s🐱🐶]+)?/g, ' ').replace(/\s+/g, ' ').trim();
  oz = adAt(temiz(oz), c.ad);
  if (oz && oz.length < 25) oz = '';
  let cevap = `${c.ad}${oz ? ' — ' + oz.charAt(0).toLocaleUpperCase('tr-TR') + oz.slice(1) : ''}`;
  if (c.ph) cevap += `\n\npH: ${c.ph}`;
  if (c.icerik && !benzer(c.icerik, [oz])) cevap += `\n\n${c.icerik}`;
  const tu0 = toh.urunler[slug];
  // Madde listesi: özetle ya da önceki maddeyle aynı olan, yalnız ürün adını tekrarlayan ve bilgi taşımayan başlık
  // parçaları ("Kullanım Alanları X;") atılır
  const km = [];
  for (const k0 of c.kullanim) { const k = adAt(temiz(k0), c.ad); if (k.length >= 25 && !/[;:?]$|\?\s*\([^)]*\)$/.test(k) && !benzer(k, [oz, c.ozet || '', c.icerik || '', ...km])) km.push(k.charAt(0).toLocaleUpperCase('tr-TR') + k.slice(1)); }
  if (km.length && !(tu0 && tu0.tur)) cevap += `\n\nÜrün bilgisine göre:\n${km.map((k) => '• ' + k).join('\n')}`;
  if (c.kural === 'ilac') cevap += `\n\nKullanım miktarı ve güvenlik uyarıları için ürün etiketine uyunuz. ${USTA}`;
  const tu = toh.urunler[slug], tt = tu && tu.tur && toh.turler[tu.tur];
  if (tt) {
    cevap += `\n\n${tt.ad} ekim bilgisi:\n${tohumMetin(tt)}`;
    if (tu.tohumSayisi) cevap += `\n• Bu pakette (${String(tu.gram).replace('.', ',')} g) yaklaşık ${tu.tohumSayisi[0].toLocaleString('tr-TR')}–${tu.tohumSayisi[1].toLocaleString('tr-TR')} tohum bulunur.`;
    if (tt.saklama) cevap += `\n• Serin, kuru ve karanlık yerde saklanırsa tohumlar yaklaşık ${tt.saklama} yıl canlı kalır.`;
  } else if (tu) cevap += `\n\nGenel kural: ${toh.genel.derinlik.replace(/^Pratik kural:\s*/, '')}`;
  const tohum = c.kategori === 'Tohumlar' || !!tu;
  const sorular = [`${n} nasıl kullanılır`, `${n} ne işe yarar`, `${n} özellikleri`, `${n} nedir`, `${n} nasıl uygulanır`, `${n} ne zaman kullanılır`, `${n} hangi bitkilerde kullanılır`];
  if (tohum) sorular.push(`${n} ne zaman ekilir`, `${n} nasıl ekilir`, `${n} ekim zamanı`, `${n} kaç tohum var`, `${n} kaç cm derine ekilir`);
  if (c.kategori === 'Kedi Ürünleri' || c.kategori === 'Köpek Ürünleri') sorular.push(`${n} günlük ne kadar verilir`, `${n} besleme miktarı`);
  add({ tur: 'urun', urun: slug, kartDurum: 'urun_sayfasi', kategori: c.kategori, sorular, cevap, urunler: [slug, ...((bySlug.get(slug) || {}).x || []).slice(0, 2)], kaynak: `urun_sayfasi:${slug}` });
}

// F) Saksılar (bilgi/saksilar.json; akbilge-saksi.mjs üretir): hacim, toprak ihtiyacı, delik, saksı seçimi kuralları
const sx = JSON.parse(await readFile('bilgi/saksilar.json', 'utf8'));
const virg = (x) => String(x).replace('.', ',');
const kaynakSatir = () => '';
const KURAL_SORU = {
  boyut: ['saksı değiştirirken kaç numara büyük alınır', 'ne kadar büyük saksı almalıyım', 'saksı boyutu nasıl seçilir', 'büyük saksı zararlı mı', 'bir boy büyük saksı'],
  delik: ['deliksiz saksıya bitki dikilir mi', 'saksının deliği olmazsa ne olur', 'drenaj deliği şart mı', 'kaşpo nasıl kullanılır', 'deliksiz saksı'],
  cakil: ['saksının altına taş konur mu', 'saksı dibine çakıl koymak', 'saksıya drenaj için ne konur', 'saksı altına perlit', 'saksı drenajı nasıl yapılır'],
  zaman: ['saksı ne zaman değiştirilir', 'saksı değiştirme zamanı', 'bitki saksısı ne zaman büyütülür', 'kökler saksıdan çıkıyor', 'saksı değişimi hangi ay'],
  orkide: ['orkide hangi saksıya dikilir', 'orkide saksısı', 'orkide şeffaf saksı', 'orkide saksı değişimi', 'orkide nasıl saksı değiştirilir'],
  kaktus: ['kaktüs hangi saksıya dikilir', 'sukulent saksısı', 'kaktüs saksı boyutu', 'kaktüs saksı değişimi', 'sukulent hangi saksı'],
};
const KURAL_URUN = { orkide: ['seffaf-plastik-orkide-kaktus-saksisi', 'gartengold-orkide-topragi'], kaktus: ['kaktus-ve-sukulent-topragi', 'kaktus-kozalak-yuvarlak-saksi-015l'], cakil: ['tarim-perliti'] };
for (const [k, sorular] of Object.entries(KURAL_SORU)) {
  const r = sx.kural[k];
  add({ tur: 'saksi-kural', konu: k, sorular, cevap: r.metin + kaynakSatir(r), urunler: (KURAL_URUN[k] || []).filter((s) => bySlug.has(s)), kaynak: `saksi:kural:${k}` });
}
for (const t of sx.tablo) {
  const d = t.cap, sonra = `${virg(d + 2.5)}–${d + 5} cm`;
  add({ tur: 'saksi-hesap', cap: d,
    sorular: [`${d} cm saksı kaç litre`, `${d} cm saksıya ne kadar toprak gider`, `${d}'lik saksı kaç litre`, `${d} numara saksı kaç litre`, `${d} numara saksıya ne kadar toprak`, `${d} cm saksıdan sonra kaç cm saksı`],
    cevap: `Çapı ${d} cm, yüksekliği çapına yakın standart bir saksı yaklaşık ${virg(t.litre)} litredir. İçine yaklaşık ${virg(t.toprak.litre)} litre toprak gider (üstte 2–3 cm sulama payı kalır)${t.toprak.paket ? '; ' + (/^en küçük/.test(t.toprak.paket) ? t.toprak.paket : t.toprak.paket.replace(/(\d+)\s*L\b/, '$1 litrelik') + ' paket yeterli olur') : ''}.\n\nKâse biçimli, alçak saksılarda hacim daha azdır. Bitkinizi bu saksıdan taşıyacaksanız yeni saksının çapı ${sonra} olmalı.`,
    urunler: [], kaynak: 'saksi:hesap' });
}
for (const p of sx.saksilar) {
  const n = lc(p.ad).replace(/\s*\|.*$/, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*[-–].*$/, '')
    .replace(/(?:\d+(?:[.,]\d+)?\s*(?:l|lt|litre)\b\s*\/\s*)+\d+(?:[.,]\d+)?\s*(?:l|lt|litre)\b/g, ' ').replace(/\s+/g, ' ').trim() + (/^line-saksi-/.test(p.slug) ? ' ' + lc(p.ad.split('|')[1] || '').trim() : '');
  const satir = p.boylar.map((b) => {
    const olcu = b.cap ? ` (Ø${virg(b.cap)}${b.yukseklik ? ' × ' + virg(b.yukseklik) : ''} cm)` : b.uzunluk ? ` (${b.uzunluk} × ${b.genislik} × ${b.yukseklik} cm)` : b.derinlik ? ` (${b.genislik} × ${b.derinlik} × ${b.yukseklik} cm)` : '';
    const L = `${virg(b.litre)} L${b.kaynak === 'hesap' ? ' (ölçülerden yaklaşık)' : ''}`;
    const tp = b.toprak ? ` → yaklaşık ${virg(b.toprak.litre)} L toprak${b.toprak.paket ? ', ' + (/^en küçük/.test(b.toprak.paket) ? 'en küçük paket (5 L) yeter' : b.toprak.paket + ' paket') : ''}` : '';
    return `• ${L}${olcu}${tp}`;
  }).join('\n');
  let cevap = `${p.ad}\n\n${p.boylar.length > 1 ? 'Boylar ve toprak ihtiyacı:' : 'Hacim ve toprak ihtiyacı:'}\n${satir}`;
  if (p.delik === 'var') cevap += '\n\nAltında su tahliye açıklığı var.';
  else if (p.delik === 'kontrol') cevap += '\n\nÜrün bilgisine göre dikimden önce drenaj çıkışını kontrol edin; drenaj deliği yoksa bitkiyi delikli bir iç saksıyla yerleştirin (saksıyı kaşpo olarak kullanın).';
  if (p.tabak) cevap += ' Tabağı var.';
  if (p.uygun) cevap += `\n\nÜrün bilgisine göre: ${p.uygun.replace(/\s+$/, '')}${/[.!]$/.test(p.uygun) ? '' : '.'}`;
  cevap += '\n\nBitkinizi taşıyorsanız mevcut saksısından 2,5–5 cm geniş olanı seçin. Bitkinize uygun toprağı da sorabilirsiniz (ör. "monstera toprağı").';
  const sorular = [`${n} kaç litre`, `${n} ne kadar toprak alır`, `${n} saksıya ne kadar toprak gider`, `${n} ölçüleri`, `${n} deliği var mı`, `${n} hangi bitki için uygun`];
  // Seri adı + litre ("cornet 25 litre", "line 5 litre"): müşteri uzun ürün adını yazmaz
  const seri = lc(p.ad).split(/\s+/)[0];
  if (seri.length >= 3 && !/^(dekoratif|büyük|ince|yuvarlak|şeffaf|mini)$/.test(seri)) p.boylar.filter((b) => b.litre).forEach((b) => {
    const L = virg(b.litre); sorular.push(`${seri} ${L} litre saksıya ne kadar toprak gider`, `${seri} ${L} litre saksı ölçüleri`, `${seri} ${L} litre kaç cm`);
  });
  add({ tur: 'saksi', urun: p.slug, sorular, cevap, urunler: [p.slug, ...((bySlug.get(p.slug) || {}).x || []).slice(0, 2)], kaynak: `saksi:${p.slug}` });
}

// G) Tohum türleri (bilgi/tohumlar.json; akbilge-tohum.mjs üretir): "domates ne zaman ekilir" gibi genel sorular
const TUR_ADLARI = { hiyar: ['hıyar', 'salatalık'], marul: ['marul', 'salata'], lahana: ['lahana', 'kara lahana'], balkabagi: ['bal kabağı'] };
for (const [key, t] of Object.entries(toh.turler)) {
  const adlar = TUR_ADLARI[key] || [lc(t.ad.replace(/\s*\(.*\)/, '').split('/')[0].trim())];
  const sorular = adlar.flatMap((a) => [`${a} ekebilir miyim`, `${a} ne zaman dikilir`, `${a} ne zaman ekilmeli`, `${a} hangi ayda ekilir`, `${a} tohumu ne zaman atılır`, `şimdi ${a} ekilir mi`, `${a} saksıda yetişir mi`, `${a} ne zaman ekilir`, `${a} tohumu nasıl ekilir`, `${a} ekim zamanı`, `${a} tohumu kaç cm derine ekilir`, `${a} kaç günde çimlenir`, `${a} kaç günde çıkar`, `${a} ekim aralığı`,
    ...(t.gram ? [`${a} tohumu kaç tane`, `${a} tohumu 1 gramda kaç tohum var`, `${a} tohumu gramı kaç tane`] : []),
    ...(t.yontem === 'fide' ? [`${a} fidesi ne zaman dikilir`, `${a} fidesi nasıl yetiştirilir`] : [])]);
  const urunlerT = Object.entries(toh.urunler).filter(([s2, u]) => u.tur === key && bySlug.has(s2)).sort((a, b) => ((bySlug.get(b[0]).st > 0) - (bySlug.get(a[0]).st > 0))).map(([s2]) => s2);
  add({ tur: 'tohum', bitki: t.ad, sorular, cevap: `${t.ad} (${t.grup} sebzesi):\n${tohumMetin(t)}${t.gram ? `\n• 1 gramda yaklaşık ${t.gram[0].toLocaleString('tr-TR')}–${t.gram[1].toLocaleString('tr-TR')} tohum vardır.` : ''}${t.saklama ? `\n• Tohum saklama ömrü: yaklaşık ${t.saklama} yıl.` : ''}`,
    urunler: urunlerT.slice(0, 3), dinamik: 'stok', kaynak: `tohum:${key}` });
}
// G2) Ay ay "bu ay ne ekilir" (yalnız kaynakta ayı açıkça yazan türler)
const AY = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
const AYB = (m) => AY[m - 1].charAt(0).toLocaleUpperCase('tr-TR') + AY[m - 1].slice(1);
const ayHal = (m) => { const a = AY[m - 1]; return a + (/[aıou][^aeıioöuü]*$/.test(a) ? 'da' : 'de').replace(/^d/, /[çfhkpsşt]$/.test(a) ? 't' : 'd'); }; // ocakta, şubatta, martta, nisanda, ekimde…
for (let m = 1; m <= 12; m++) {
  const tohumL = [], dikimL = [], slugs = new Set();
  const tr = prods.trend || {}, sira = (s2) => { const i = (tr.rising || []).indexOf(s2), j = (tr.best || []).indexOf(s2); return (i < 0 ? 99 : i) + (j < 0 ? 99 : j); };
  // Yalnız sitede stokta tohumu olan sebzeler yazılır (olmayan ürünü önermeyelim)
  const satilan = (key) => Object.entries(toh.urunler).some(([s2, u]) => u.tur === key && bySlug.has(s2) && bySlug.get(s2).st > 0);
  for (const [key, t] of Object.entries(toh.turler)) if (satilan(key)) for (const a of t.aylar || []) {
    const ad = t.ad.replace(/\s*\(.*\)/, '');
    if ((a.t || []).includes(m)) tohumL.push(`${ad}${a.not ? ' (' + a.not + ')' : ''}`);
    if ((a.d || []).includes(m)) dikimL.push(`${ad}${a.not ? ' (' + a.not + ')' : ''}`);
    if ((a.t || []).includes(m) || (a.d || []).includes(m)) Object.entries(toh.urunler).filter(([s2, u]) => u.tur === key && bySlug.has(s2) && bySlug.get(s2).st > 0)
      .sort((x, y) => sira(x[0]) - sira(y[0])).slice(0, 1).forEach(([s2]) => slugs.add(s2));
  }
  if (!tohumL.length && !dikimL.length) continue;
  const ay = AY[m - 1], hal = ayHal(m);
  let cevap = `${AYB(m)} ayında ekebilecekleriniz:`;
  if (tohumL.length) cevap += `\n\nTohum ekimi:\n${tohumL.map((x) => '• ' + x).join('\n')}`;
  if (dikimL.length) cevap += `\n\nFide dikimi:\n${dikimL.map((x) => '• ' + x).join('\n')}`;
  cevap += `\n\nTarihler bölgeye göre değişir: soğuk bölgelerde biraz geç, sıcak bölgelerde biraz erken ekilir.${m >= 3 && m <= 6 ? ' Sıcak iklim sebzeleri son don tarihinden sonra ekilir/dikilir.' : ''} Bir sebzenin ayrıntısını sorabilirsiniz (ör. "${(tohumL[0] || dikimL[0]).replace(/\s*\(.*\)/, '').toLocaleLowerCase('tr-TR')} nasıl ekilir").`;
  // O ayın hazır tohum seti sitede varsa (ör. "Ekim Ayı Sebze Tohumu Seti") öneri olarak eklenir
  const AYS = { ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', ç: 'c' };
  const set = prods.items.find((p) => p.st > 0 && p.s.startsWith(ay.replace(/[ğıöşüç]/g, (x) => AYS[x]) + '-ayi-sebze-tohumu-seti'));
  if (set) { cevap += `\n\nKışlık sebze tohumlarını tek pakette isterseniz: ${set.n.trim()}.`; slugs.add(set.s); }
  add({ tur: 'tohum-ay', ay: m, sorular: [`${ay} ayında ne ekilir`, `${hal} ne ekilir`, `${ay} ayında hangi sebzeler ekilir`, `${hal} hangi tohumlar ekilir`, `${hal} hangi sebzeler ekilir`, `${ay} ayında ne dikilir`, `${hal} hangi fideler dikilir`, `${ay} ayı ekim takvimi`, `${ay} ayında hangi sebze ekilir`, `${hal} ne ekebilirim`, `${hal} hangi tohumları ekebilirim`, `${ay} ayında ekilecek sebzeler`, `${ay} ayında ekilen sebzeler`, `${ay} ayında bahçeye ne ekilir`, `${ay} ayında saksıya ne ekilir`],
    cevap, urunler: [...slugs].sort((x, y) => (/-ayi-sebze-tohumu-seti/.test(y) - /-ayi-sebze-tohumu-seti/.test(x)) || sira(x) - sira(y)).slice(0, 4), dinamik: 'stok', kaynak: `tohum:ay:${m}` });
}

for (const [konu, sorular] of Object.entries({
  derinlik: ['tohum kaç cm derine ekilir', 'tohum ekim derinliği', 'tohum ne kadar derine gömülür', 'tohumu toprağa nasıl ekerim'],
  dogrudan: ['hangi sebzeler fide ile yetiştirilir', 'hangi tohumlar direkt ekilir', 'fide mi tohum mu', 'doğrudan tohum ekimi hangi sebzeler'],
  serin: ['kışlık sebzeler hangileri', 'serin iklim sebzeleri', 'sonbaharda hangi sebzeler ekilir', 'soğuğa dayanıklı sebzeler'],
  sicak: ['yazlık sebzeler hangileri', 'sıcak iklim sebzeleri', 'ilkbaharda hangi sebzeler ekilir', 'soğuğa hassas sebzeler'],
})) add({ tur: 'tohum-genel', konu, sorular, cevap: toh.genel[konu], urunler: [], kaynak: `tohum:genel:${konu}` });

// H) İlaçlama pompaları (bilgi/pompalar.json; akbilge-pompa.mjs üretir): akülü/manuel, şarj, kapasite, garanti
const pm = JSON.parse(await readFile('bilgi/pompalar.json', 'utf8'));
const pmSatir = (p) => [
  p.tip === 'akulu' ? 'Tip: Akülü (şarjlı) — elle pompalama gerektirmez, tetiğe basınca püskürtür' : `Tip: Manuel — şarj/akü gerektirmez${p.mekanizma ? ', ' + p.mekanizma : ''}`,
  p.depo && `Depo: ${p.depo} litre${p.tasima ? ' · ' + p.tasima : ''}`,
  p.aku && `Akü: ${p.aku}`,
  (p.calisma || p.calismaDepo) && `Tek şarjla: ${[p.calisma, p.calismaDepo, p.calismaLitre && '≈ ' + p.calismaLitre].filter(Boolean).join(' · ')}`,
  p.sarj && `Şarj: ${p.sarj}`, p.sarjGiris && `Şarj girişi: ${p.sarjGiris}`,
  p.basinc && `Basınç: ${p.basinc}`, p.atis && `Atış mesafesi: ${p.atis}`, p.akis && `Akış: ${p.akis}`,
  [p.nozul, p.hortum, p.lans, p.motor].filter(Boolean).join(', '),
  `Garanti: ${pm.garanti.ay} ay`,
].filter(Boolean).map((x) => '• ' + x).join('\n');
for (const p of pm.pompalar) {
  const n = lc(p.ad).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  let cevap = `${p.ad}\n\n${pmSatir(p)}`;
  if (p.tip === 'akulu' && !p.calisma && !p.calismaDepo) cevap += '\n\nTek şarjla çalışma süresi ürün bilgisinde belirtilmemiş; müşteri hizmetlerimizden bilgi alabilirsiniz.';
  if (p.bos) cevap += '\n\nDiğer teknik bilgiler için müşteri hizmetlerimizden destek alabilirsiniz.';
  add({ tur: 'pompa', urun: p.slug, sorular: [`${n} akülü mü`, `${n} şarjlı mı`, `${n} manuel mi`, `${n} şarjı ne kadar gider`, `${n} kaç saat şarj olur`, `${n} kaç litre`, `${n} garantisi var mı`, `${n} özellikleri`],
    cevap, urunler: [p.slug, ...((bySlug.get(p.slug) || {}).x || []).slice(0, 2)], kaynak: `pompa:${p.slug}` });
}
const akl = pm.pompalar.filter((p) => p.tip === 'akulu' && bySlug.has(p.slug)), man = pm.pompalar.filter((p) => p.tip === 'manuel' && bySlug.has(p.slug));
const kisaP = (p) => `• ${p.ad}${p.calisma || p.calismaDepo ? ' — tek şarjla ' + [p.calisma, p.calismaDepo].filter(Boolean).join(' / ') : ''}${p.sarj ? '; ' + p.sarj : ''}`;
add({ tur: 'pompa-genel', konu: 'garanti', sorular: ['ilaçlama pompası garantisi', 'pompanın garantisi var mı', 'ilaçlama pompası kaç yıl garantili', 'akülü pompa garanti süresi', 'garanti süresi ne kadar'],
  cevap: `${pm.garanti.metin} (${pm.garanti.ay} ay = 2 yıl)`, urunler: [], kaynak: 'pompa:garanti' });
add({ tur: 'pompa-genel', konu: 'akulu-manuel', sorular: ['akülü mü manuel mi ilaçlama pompası', 'akülü pompa mı almalıyım', 'manuel ilaçlama pompası mı akülü mü', 'hangi ilaçlama pompasını almalıyım', 'ilaçlama pompası önerisi'],
  cevap: 'Manuel pompalar şarj gerektirmez, her an kullanıma hazırdır; küçük (0,5–2 L) basınçlı modeller birkaç kez pompalanıp basıncı tutar, 16–20 L sırt tipi kollu modeller ilaçlama sırasında elle pompalanır. Akülü (şarjlı) pompalar elle pompalama gerektirmez, sabit basınçla püskürtür; geniş bahçe, bağ ve tarlada daha az yorar.\n\nKüçük balkon/salon bitkileri için 0,5–2 L el tipi, birkaç ağaç ve sebze yatağı için 5–10 L omuz askılı, geniş alan için 16–20 L sırt tipi (akülü ya da manuel) uygundur. Tüm ilaçlama pompalarımız ' + pm.garanti.ay + ' ay garantilidir.',
  urunler: [...akl.filter((p) => bySlug.get(p.slug).st > 0).slice(0, 2), ...man.filter((p) => bySlug.get(p.slug).st > 0).slice(0, 1)].map((p) => p.slug), kaynak: 'pompa:karsilastirma' });
add({ tur: 'pompa-genel', konu: 'sarj', sorular: ['akülü ilaçlama pompası şarjı ne kadar gider', 'şarjlı pompa kaç saat çalışır', 'akülü pompa kaç depo atar', 'ilaçlama pompası şarj süresi', 'akülü pompa kaç saatte şarj olur'],
  cevap: `Akülü modellerimizin ürün bilgisine göre tek şarjla çalışma süreleri:\n${akl.filter((p) => bySlug.get(p.slug).st > 0 && (p.calisma || p.calismaDepo)).map(kisaP).join('\n')}\n\nTüm ilaçlama pompalarımız ${pm.garanti.ay} ay garantilidir.`, urunler: akl.filter((p) => bySlug.get(p.slug).st > 0).slice(0, 3).map((p) => p.slug), dinamik: 'stok', kaynak: 'pompa:sarj' });

// I) Bitki sorunları (bilgi/sorunlar.json; akbilge-sorun.mjs üretir): sararma, solma, çiçek açmama, zararlılar…
// Ürün satırları "• Ad — fayda" biçiminde; sunucu stokta olmayan ürünün satırını cevaptan çıkarır (dinamik: sorun)
const sr = JSON.parse(await readFile('bilgi/sorunlar.json', 'utf8'));
const madde = (b, l) => l.length ? `\n\n${b}:\n${l.map((x) => '• ' + x).join('\n')}` : '';
for (const s of sr.sorunlar) {
  const ur = s.urunler.filter((u) => bySlug.has(u.slug));
  add({ tur: 'sorun', konu: s.key, ...(s.bitki ? { bitki: s.bitki } : {}), sorular: s.sorular,
    cevap: `${s.baslik}${madde('Olası nedenler', s.nedenler)}${madde('Nasıl anlarsınız', s.anlama)}${madde('Ne yapmalısınız', s.yapin)}${madde('Sitemizde işinize yarayacaklar', ur.map((u) => `${u.ad} — ${u.fayda}`))}\n\nSorun devam ederse ya da emin olamazsanız bitkinin ve yaprakların (alt yüzü dahil) fotoğrafıyla müşteri hizmetlerimizden destek alabilirsiniz.`,
    urunler: ur.map((u) => u.slug), urunAdlari: ur.map((u) => u.ad), dinamik: 'sorun', kaynak: `sorun:${s.key}` });
}

// G3) Genel gübre soruları (herkesin bahçesine/saksısına uyan): ev ölçeğinde, doğrulanmış miktarlarla.
// Kaynak: config.json > guides ve bilgi/urunler.json kullanım satırları; dekar başına miktar metrekareye çevrildi
// (1 dekar = 1.000 m²: 60 kg/dekar = 60 g/m²). Uygun set varsa önerilir (çapraz satış).
const varsa = (slug, metin) => (bySlug.has(slug) && bySlug.get(slug).st > 0 ? metin : '');
const GENEL_GUBRE = [
  { konu: 'saksi-cicek', sorular: ['saksı çiçeklerine hangi gübre', 'saksı çiçekleri için gübre', 'saksı bitkilerine hangi gübre', 'saksı bitkisi gübresi', 'çiçeklere hangi gübre verilir', 'çiçek gübresi', 'salon bitkilerine hangi gübre', 'ev bitkilerine hangi gübre', 'ev çiçeklerine gübre', 'bitkime hangi gübre', 'bitkime hangi gübreyi vermeliyim', 'çiçeğime ne gübre vereyim', 'saksıya gübre nasıl verilir', 'saksıdaki çiçeklere gübre'],
    cevap: [
      'Saksı çiçekleriniz için iki ürünü birlikte kullanmanızı öneririz:',
      'HasTürk Solucan Gübresi — toprağı uzun süre besler, kök gelişimini destekler.\n• Saksı başına 100–125 g, toprağa karıştırarak.',
      'HasTürk Sıvı Solucan Gübresi — bitki besini hızlı alır.\n• Sulama suyuna: 10 litre suya 50–100 ml.\n• Yapraklara püskürterek: 1 litre suya 10–20 ml.',
      varsa('florist-cicekli-bitkiler-sivi-konsantre-bitki-besini', 'Çiçekli bitkileriniz için Florist Çiçekli Bitkiler Besini de var (ürün bilgisine göre 1 şase + 1 litre su).'),
      varsa('cicek-topragi-bakim-seti', 'Saksı değiştirecekseniz Çiçek Toprağı Bakım Seti\'nde çiçek toprağı, sıvı solucan gübresi ve çiçek besini bir arada.'),
    ], urunler: ['hasturk-kati-solucan-gubresi', 'hasturk-sivi-solucan-gubresi', 'cicek-topragi-bakim-seti', 'florist-cicekli-bitkiler-sivi-konsantre-bitki-besini'] },
  { konu: 'sebze-bahce', sorular: ['sebze bahçesine hangi gübre', 'sebze bahçesi için gübre', 'sebzelere hangi gübre verilir', 'sebze gübresi', 'bahçeye hangi gübre atılır', 'bahçe gübresi', 'bahçem için gübre', 'domates biber için gübre', 'bostana hangi gübre', 'bostan gübresi', 'sebze ekmeden önce gübre', 'toprağa ekim öncesi gübre'],
    cevap: [
      'Sebze bahçeniz için önerimiz:',
      'HasTürk Solucan Gübresi — ekimden ya da dikimden önce toprağa.\n• Domates, biber, patlıcan gibi sebzelerde: metrekareye 60–80 g (dekara 60–80 kg), toprağa serpip karıştırarak.\n• Marul, ıspanak gibi yaprağı yenen sebzelerde: metrekareye 50–60 g.\n• Fide yetiştirdiğiniz yatağa: metrekareye 5 kg, toprağa karıştırarak.',
      'HasTürk Sıvı Solucan Gübresi — büyüme döneminde.\n• Sulama suyuna: 10 litre suya 50–100 ml.\n• Yapraklara püskürterek: 1 litre suya 10–20 ml.',
      varsa('hasturk-mukemmel-uclu-set', 'Solucan gübresi, sıvı solucan gübresi ve Hümix\'i birlikte almak isterseniz HasTürk Mükemmel Üçlü Set avantajlı bir seçenek.'),
    ], urunler: ['hasturk-kati-solucan-gubresi', 'hasturk-sivi-solucan-gubresi', 'hasturk-mukemmel-uclu-set'] },
  { konu: 'fide', sorular: ['fidelere hangi gübre', 'fideye hangi gübre verilir', 'fide gübresi', 'fide için gübre', 'fideler için besin', 'fide dikerken gübre', 'fide toprağına gübre', 'fideyi nasıl beslerim', 'fide yetiştirirken gübre'],
    cevap: [
      'Fideleriniz için önerimiz:',
      '• Fideleri dikmeden önce: köklerini sıvı solucan gübreli suya batırın (10 litre suya 100 ml).\n• Fideler büyürken: HasTürk Sıvı Solucan Gübresi, sulama suyuna 10 litre suya 50–100 ml.',
      varsa('fide-sasirtma-topragi', 'Hazır toprak isterseniz Profesyonel Fide Şaşırtma Toprağı fideler için hazırlanmıştır.'),
    ], urunler: ['hasturk-sivi-solucan-gubresi', 'fide-sasirtma-topragi', 'hasturk-kati-solucan-gubresi'] },
  { konu: 'meyve-agaci', sorular: ['meyve ağaçlarına hangi gübre', 'meyve ağacı için gübre', 'meyve ağacı gübresi', 'ağaçlara hangi gübre verilir', 'ağaç gübresi', 'fidana hangi gübre', 'fidan gübresi', 'fidan dikerken gübre', 'meyve ağaçlarını ne zaman gübrelemeli', 'bahçedeki ağaçlara gübre'],
    cevap: [
      'Meyve ağaçlarınız için önerimiz:',
      'HasTürk Solucan Gübresi\n• Yeni fidan dikerken: fidan çukuruna 1,5–2 kg, köke değecek şekilde.\n• Yetişkin ağaçta: ağacın gölge çapı kaç metreyse o kadar kg (ör. 3 metre → 3 kg). Dal uçlarının altına açtığınız çembere toprakla karıştırın.',
      'HasTürk Sıvı Solucan Gübresi\n• Çiçeklenme ve meyveler oluşurken yapraklara püskürterek: 1 litre suya 10–20 ml.',
      'HasTürk Hümix Sıvı Hümik Asit\n• Ağaç uyanıp tomurcuklar kabarınca: 10 litre suya 100 ml, dal uçlarının altındaki toprağa.',
      varsa('hasturk-mukemmel-uclu-set', 'Üçünü birlikte almak isterseniz HasTürk Mükemmel Üçlü Set avantajlı bir seçenek.'),
    ], urunler: ['hasturk-kati-solucan-gubresi', 'hasturk-sivi-solucan-gubresi', 'hasturk-humix-sivi-humik-asit', 'hasturk-mukemmel-uclu-set'] },
];
for (const g of GENEL_GUBRE) add({ tur: 'gubre-genel', konu: g.konu, sorular: g.sorular, cevap: g.cevap.filter(Boolean).join('\n\n') + '\n\nBu miktarlar genel öneridir; uygularken ürün etiketine de bakın.',
  urunler: g.urunler.filter((x) => bySlug.has(x) && bySlug.get(x).st > 0), kaynak: `rehber:genel:${g.konu}` });

// J) Blog "Sık Sorulan Sorular" (bilgi/blog-sss.json; akbilge-blog.mjs üretir): bakım bilgisi (sulama, ışık, toprak, saksı…).
// En sona eklenir: aynı soruya doğrulanmış bir cevap varsa eşit puanda o kazanır. Gübre/ilaç miktarı veren blog cevapları alınmaz.
const blog = JSON.parse(await readFile('bilgi/blog-sss.json', 'utf8'));
for (const b of blog.sss) add({ tur: 'blog', konu: b.kaynak, sorular: [b.soru.replace(/\?$/, '')], cevap: b.cevap, urunler: b.urunler.filter((x) => bySlug.has(x) && bySlug.get(x).st > 0), kaynak: `blog:${b.kaynak}` });

// C) Mağaza bilgileri (config.json > promo): aramalarda "indirim kodu" soruluyor
const pr = config.promo || {};
if (pr.code) add({ tur: 'magaza', sorular: ['indirim kodu', 'indirim var mı', 'kupon kodu', 'kargo ücretsiz mi', 'ücretsiz kargo'],
  cevap: `${pr.title || 'İndirim'}: ${pr.code} kodunu ödeme adımında kullanabilirsiniz${pr.note ? ' (' + pr.note + ')' : ''}.${pr.shipping ? ' ' + pr.shipping + '.' : ''}`, urunler: [], kaynak: 'config:promo' });
// Kargo ve sipariş (config.json > akbilge.kargo: mağazanın verdiği bilgi)
const AKC = config.akbilge || {};
if (AKC.kargo) {
  const ship = pr.shipping ? ` ${pr.shipping}.` : '';
  add({ tur: 'magaza', konu: 'kargo', sorular: ['siparişler ne zaman kargoya verilir', 'sipariş ne zaman kargoya verilir', 'kargoya ne zaman verilir', 'siparişim ne zaman kargoya verilecek',
    'ne zaman kargolanır', 'kargo ne zaman çıkar', 'aynı gün kargo var mı', 'bugün kargoya verilir mi', 'siparişim ne zaman gelir', 'kargo kaç günde gelir', 'kaç günde teslim edilir', 'ne zaman elime ulaşır', 'kargom ne zaman gelir'],
    cevap: `${AKC.kargo}${ship}`, urunler: [], kaynak: 'config:akbilge.kargo' });
}
await writeFile('bilgi/soru-havuzu.json', JSON.stringify({ _aciklama: 'Ak Bilge soru havuzu. durum: hazir = canlıda kullanılır (doğrulanmış tablolar ve ürün bilgisi). Rakamlar yalnız doğrulanmış tablolardan.', surum: 1, kayit: out.length, havuz: out }, null, 1) + '\n');
// Sunucu (src/akbilge.js) için sıkıştırılmış kopya: soru kalıpları, cevap, ürünler, dinamik alan, ürün adı
const adOf = (slug) => ((bySlug.get(slug) || {}).n || '').trim();
await writeFile('src/akbilge-havuz.json', JSON.stringify(out.filter((e) => e.durum === 'hazir').map((e) => {
  const o = { i: e.id, t: e.tur, s: e.sorular, c: e.cevap, u: e.urunler || [] };
  if (e.dinamik) o.d = e.dinamik;
  if (e.bitki) o.b = e.bitki;
  if (e.urun) { o.p = e.urun; o.n = adOf(e.urun); }
  if (e.urunAdlari) o.un = e.urunAdlari;
  return o;
})));
const c = (t) => out.filter((x) => x.tur === t).length;
console.log(`Soru havuzu: ${out.length} kayıt (bitki-doz ${c('bitki-doz')}, ürün ${c('urun')}, bitki-toprak ${c('bitki-toprak')}, saksı ${c('saksi')}+${c('saksi-hesap')} hesap+${c('saksi-kural')} kural, tohum türü ${c('tohum')}+${c('tohum-genel')} genel+${c('tohum-ay')} ay, pompa ${c('pompa')}+${c('pompa-genel')} genel, genel gübre ${c('gubre-genel')}, blog ${c('blog')}, bitki sorunu ${c('sorun')}, mağaza ${c('magaza')}), ${out.reduce((a, x) => a + x.sorular.length, 0)} soru kalıbı`);
