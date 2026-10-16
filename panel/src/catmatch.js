// Kategori eşleştirme puanı (PROPOSED, sector-agnostic): panel kategorisi + o kategorideki ürün adları ↔ pazaryeri kategorisi (ad + yol).
//   1. Türkçe normalizasyon + ek / yumuşama farkına dayanıklı kelime eşitliği (kılıfları ~ kılıf, rujlar ~ ruj, yağları ~ yağ, kumu ~ kumları);
//      yapım eki anlamı değiştirir (bitki ≠ bitkisel, koku ≠ kokulu, ilaç ≠ ilaçlama).
//   1b. Baş kelime: kategorinin asıl nesnesi (Türkçe tamlamada son kelime; ürün adlarının çoğunluğu başka bir ad kelimesini kullanıyorsa o).
//      Kanal kategorisinin de başıyla eşleşmesi tam puan, yalnız niteleyicisiyle eşleşmesi az puan; başı yereldeki hiçbir nesneye
//      karşılık gelmeyen kategori cezalı (Balkon Bitkileri ≠ Balkon Salıncağı, Süs Bitkileri ≠ Bitkisel Yağ).
//   2. Genel eş anlamlılar tablosu (tüm e-ticaret sektörleri): tişört ~ t-shirt, kılıf ~ kapak, şarj aleti ~ şarj cihazı …
//   3. FASETLER (sektörden bağımsız ayırt ediciler): cinsiyet, yaş grubu, tür (pet), cihaz ailesi, malzeme, kıvam.
//      İki taraf farklı değer söylüyorsa büyük ceza; kategori daha dar bir hedef söylüyor ve yerelde kanıt yoksa küçük ceza.
//      Yerel kategorinin adı bir tür söylüyor (Kedi …), kanal kategorisi hiçbir tür için değilse ceza (kedi macunu ≠ bitki vitamini).
//   4. Alan paketleri: kavramın bağlamla değiştiği yerler (ilaçlama pompası ≠ su pompası, organik ≠ kimyevi, kedi vitamini ≠ bitki vitamini).
//      Yerel kategori bir alana açıkça giriyor, kanal kategorisi hiçbirine girmiyorsa ceza (Viyoller ≠ Viyola). Bahçe paketi korunur;
//      başka sektörler aynı yapıyla paket ekleyebilir. Eski "alakasız alan" (x-*) listeleri kaldırıldı: giyim / ayakkabı / bebek /
//      elektronik kategorilerini HER yerel kategori için cezalandırıyordu.
//   5. Genel kategori ("Diğer", "Genel", "Kampanya", "Yeni Gelenler") yalnız ürün adlarıyla puanlanır ve hiçbir zaman "kesin" olmaz.
//   6. Hız: kategori kelimeleri 2 harflik önek dizininde tutulur; yalnız yerel kelimeyle önek paylaşan kategoriler puanlanır.

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const STOP = new Set(['ve', 'ile', 'icin', 'diger', 'urun', 'urunu', 'urunler', 'urunleri', 'cesit', 'cesitleri', 'malzeme', 'malzemeleri', 'grubu', 'tum', 'genel',
  'lt', 'litre', 'kg', 'kilo', 'gr', 'gram', 'ml', 'cc', 'cm', 'mm', 'adet', 'li', 'lu', 'lik', 'luk', 'paket', 'kutu', 'yeni', 'orijinal', 'ozel', 'en', 'cok', 'the', 'of', 'and',
  'model', 'seri', 'stil', 'set', 'takim', 'aksesuar', 'aksesuarlari']);
export const fold = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, (c) => FOLD[c] || c).replace(/[^a-z0-9]+/g, ' ').trim();
export const tokens = (s) => fold(s).split(' ').filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d/.test(w));

const SOFT = { k: 'g', p: 'b', t: 'd', c: 'c' };
const soft = (w) => (SOFT[w[w.length - 1]] ? w.slice(0, -1) + SOFT[w[w.length - 1]] : w);
// Yapım ekleri kelimenin anlamını değiştirir: bitki ≠ bitkisel, koku ≠ kokulu, ilaç ≠ ilaçlama, tuz ≠ tuzsuz, kahve ≠ kahveci.
// Çekim ekleri (-lar / -ler, -ı / -sı, -da, -ın …) serbesttir. Kalıp, kısa kelimeden (ya da gövdesinden: bitk-i) sonra gelen kalanın başına
// bakar; gövdede düşen ünlü kalanın başında olabilir (bitk + isel).
const DERIV = /^[aeiu]?(l[iu]k?|l$|s[iu]z|s[ae]l|c[iu]|l[ae]m[ae])/;
function pm(a, b) {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 3) return s === l;
  if (!l.startsWith(s) || DERIV.test(l.slice(s.length))) return false;
  if (s.length === 3) return l.length - s.length <= 2 && !/^(ik|ım|lik)$/.test(l.slice(3)); // "bal" ≠ "balık"
  return l.length - s.length <= 5;
}
// Çoğul / iyelik ekleri; çoğul eki 3 harfli köke kadar inebilir (rujlar → ruj, yağları → yağ)
const SUFFIX = ['larindan', 'lerinden', 'larinin', 'lerinin', 'lari', 'leri', 'lar', 'ler', 'sini', 'sunu', 'nin', 'nun', 'si', 'su', 'in', 'un', 'i', 'u'];
const HARD = { g: 'k', b: 'p', d: 't' };
export function stem(w) {
  for (const x of SUFFIX) {
    const min = x[0] === 'l' ? 3 : 4;
    if (w.endsWith(x) && w.length - x.length >= min) { const r = w.slice(0, -x.length); return r.length > 3 && HARD[r[r.length - 1]] && x[0] !== 's' && x[0] !== 'l' ? r.slice(0, -1) + HARD[r[r.length - 1]] : r; }
  }
  return w;
}
// "bot" ≠ "body": yumuşama yalnız 4+ harfte; kısa kök ancak birebir ya da çoğul ekiyle eşleşir
// 3 harfli kök + iyelik eki ("kumu", "yağı", "tuzu") ile aynı kökün çoğulu ("kumları", "yağları"): kök birebir aynıysa eşittir
const p3 = (a, b) => a.length === 4 && /[iu]$/.test(a) && b.length > 4 && stem(b) === a.slice(0, 3);
const same0 = (a, b) => a === b || pm(a, b) || p3(a, b) || p3(b, a) || (a.length > 3 && pm(soft(a), b)) || (b.length > 3 && pm(a, soft(b))) || (a.length > 4 || b.length > 4) && stem(a) === stem(b) || (a.length > 4 && b.length > 4 && pm(stem(a), stem(b)));
// Kelime çifti sonucu önbellekte (binlerce kategori × yerel kelime: aynı çiftler tekrar tekrar karşılaştırılır)
// Eşleşen iki kelimenin ilk iki harfi her zaman aynıdır (önek, yumuşama ve ek yalnız sonu değiştirir): farklıysa hemen hayır.
const SAME = new Map();
let sameN = 0;
export const same = (a, b) => {
  if (a === b) return true;
  if (a[0] !== b[0] || a[1] !== b[1]) return false;
  if (a > b) [a, b] = [b, a];
  let m = SAME.get(a);
  if (!m) { if (sameN > 200000) { SAME.clear(); sameN = 0; } SAME.set(a, (m = new Map())); }
  let r = m.get(b);
  if (r === undefined) { m.set(b, (r = same0(a, b))); sameN++; }
  return r;
};
const has = (list, w) => list.some((x) => same(x, w));

// ---------- genel eş anlamlılar (tüm sektörler) ----------
// Her satır bir eşdeğerlik sınıfıdır; ilk kelime pazaryerinde en sık kullanılan biçim. Çok kelimeli ifadeler tek kelimeye indirgenir.
// Başta { when } varsa eş anlam yalnız o alanda geçerlidir: "besin" bitki / toprak bağlamında gübredir, kedi / gıda bağlamında değil.
const PLANT = { when: ['plant', 'fert', 'soil', 'seed', 'pot'] };
const SYN_GROUPS = [
  ['tisort', 'tshirt', 't-shirt'], ['sweatshirt', 'sweat', 'hoodie', 'kapusonlu'], ['jean', 'kot', 'denim'], ['mont', 'kaban', 'parka'], ['tayt', 'legging'],
  ['ayakkabi', 'sneaker', 'spor ayakkabi'], ['canta', 'cantasi'], ['sal', 'esarp', 'fular'],
  ['telefon', 'cep telefonu', 'akilli telefon', 'gsm'], ['kilif', 'kapak', 'case'], ['sarj cihazi', 'sarj aleti', 'sarj adaptoru', 'adaptor'], ['sarj kablosu', 'kablo', 'data kablosu'],
  ['kulaklik', 'earbuds', 'tws'], ['powerbank', 'tasinabilir sarj'], ['ekran koruyucu', 'temperli cam', 'koruyucu cam', 'jelatin'], ['kordon', 'kayis'], ['mouse', 'fare'],
  ['hoparlor', 'speaker'], ['laptop', 'notebook', 'dizustu'],
  ['parfum', 'edp', 'edt', 'kolonya'], ['gunes kremi', 'gunes koruyucu', 'spf'], ['ruj', 'dudak boyasi'], ['nemlendirici', 'nemlendirici krem'], ['sampuan', 'sac sampuani'],
  ['bebek bezi', 'bez', 'kulot bez'], ['islak mendil', 'islak havlu'], ['biberon', 'emzik'],
  ['vitamin', 'takviye', 'gida takviyesi', 'multivitamin'], ['omega', 'balik yagi'], ['protein', 'whey'],
  ['nevresim', 'nevresim takimi', 'yatak ortusu'], ['havlu', 'bornoz'], ['tencere', 'duduklu'], ['tava', 'wok'], ['saklama kabi', 'erzak kabi'], ['deterjan', 'temizleyici'],
  ['tv unitesi', 'tv sehpasi', 'tv standi'], ['ofis sandalyesi', 'calisma sandalyesi', 'ofis koltugu', 'sandalye'], ['calisma masasi', 'bilgisayar masasi'],
  ['kahve', 'turk kahvesi', 'filtre kahve'], ['maden suyu', 'soda'], ['zeytinyagi', 'zeytin yagi', 'sizma'], ['findik kremasi', 'kakaolu krema'],
  ['mama', 'yem'], ['kedi kumu', 'kum'], ['tasma', 'gogusluk'],
  ['yoga mati', 'pilates mati', 'egzersiz mati'], ['termos', 'matara'], ['cadir', 'kamp cadiri'],
  ['motor yagi', 'madeni yag', 'yag'], ['oto paspas', 'paspas'], ['telefon tutucu', 'tutucu'], ['fren balatasi', 'balata'], ['silecek', 'silecek supurgesi'],
  ['roman', 'kitap'], ['hikaye kitabi', 'masal', 'cocuk kitabi'], ['yapboz', 'puzzle'], ['pelus', 'pelus oyuncak'], ['kumandali araba', 'rc araba', 'uzaktan kumandali'],
  ['kurşun kalem', 'kalem'], ['defter', 'bloknot'],
  [PLANT, 'gubre', 'bitki besini', 'besin'], [PLANT, 'toprak', 'torf', 'harc'], ['tohum', 'fide'], ['hortum', 'sulama hortumu'], ['matkap', 'delici'],
  ['fungisit', 'mantar ilaci'], ['insektisit', 'bocek ilaci'], ['herbisit', 'ot ilaci'], ['pulverizator', 'ilaclama pompasi'],
];
// Çok kelimeli ifade ancak bütün kelimeleri birlikte geçiyorsa eş anlamlısını getirir: "ilaçlama pompası" ≡ pulverizatör, ama her "pompa"
// değil (havuz / bisiklet pompası); "ekran koruyucu" ≡ temperli cam, ama "güneş koruyucu" değil.
const SYN = new Map(); // son kelime → [{ need: ifadenin diğer kelimeleri, words: eş anlamlılar, when: alan koşulu | null }]
for (const g0 of SYN_GROUPS) {
  const when = typeof g0[0] === 'object' ? g0[0].when : null, g = when ? g0.slice(1) : g0;
  const fw = g.map((x) => fold(x).split(' ').filter(Boolean));
  for (const a of fw) { const k = a[a.length - 1]; (SYN.get(k) || SYN.set(k, []).get(k)).push({ need: a.slice(0, -1), words: fw.filter((b) => b !== a).flat(), when }); }
}
const synOf = (w, ctx, base) => {
  const out = new Set();
  for (const [k, v] of SYN) if (same(k, w)) for (const e of v) if ((!e.when || e.when.some((c) => ctx.has(c))) && e.need.every((x) => has(base, x))) for (const x of e.words) out.add(x);
  return [...out];
};

// ---------- fasetler (sektörden bağımsız) ----------
// values: değer → kelimeler; def: hiçbir şey söylenmediğinde varsayılan değer (yaş: yetişkin); target: kategori dar bir hedef
// söylüyor ve yerelde kanıt yoksa ceza uygulanır mı (kime / neye: tür, cihaz)
const FACETS = [
  { id: 'gender', values: { f: ['kadin', 'bayan', 'kiz'], m: ['erkek', 'bay'], u: ['unisex'] }, compat: { u: ['f', 'm'] } },
  { id: 'age', def: 'adult', values: { baby: ['bebek', 'yenidogan', 'anne'], child: ['cocuk', 'kiz cocuk', 'erkek cocuk', 'genc'], adult: ['yetiskin'] } },
  { id: 'species', target: 5, values: { cat: ['kedi'], dog: ['kopek'], bird: ['kus'], fish: ['akvaryum', 'balik yemi'], rodent: ['kemirgen', 'hamster', 'tavsan yemi'] } },
  { id: 'device', target: 2, values: { phone: ['telefon', 'iphone', 'galaxy', 'redmi', 'xiaomi', 'huawei', 'oppo', 'cep'], tablet: ['tablet', 'ipad', 'tab'],
    pc: ['laptop', 'notebook', 'macbook', 'bilgisayar'], watch: ['akilli saat', 'watch', 'kordon'], car: ['arac', 'oto', 'otomobil', 'otomotiv'] }, beats: { tablet: ['phone'], watch: ['phone'] } },
  { id: 'material', values: { gold: ['altin'], silver: ['gumus'], steel: ['celik'], wood: ['ahsap'], glass: ['cam'], leather: ['deri'] } },
  { id: 'state', values: { liquid: ['sivi'], solid: ['granul', 'toz', 'kati', 'tablet'] } },
];
const FACET_WORDS = FACETS.map((f) => ({ ...f, words: Object.entries(f.values).map(([v, ws]) => [v, ws.map((w) => fold(w).split(' '))]) }));
// Kelime dizisinde fasetin değerleri ("kiz cocuk" → gender f + age child; "erkek cocuk" → m + child)
function facetsOf(words) {
  const out = {};
  for (const f of FACET_WORDS) {
    const vals = new Set();
    for (const [v, phrases] of f.words) for (const ph of phrases) {
      if (ph.length === 1 ? words.some((w) => w === ph[0] || (ph[0].length >= 4 && same(w, ph[0]))) : words.some((w, i) => ph.every((p, j) => words[i + j] && same(words[i + j], p)))) vals.add(v);
    }
    if (f.beats) for (const [a, bs] of Object.entries(f.beats)) if (vals.has(a)) for (const b of bs) vals.delete(b);
    if (vals.size) out[f.id] = vals;
  }
  return out;
}
const rawWords = (s) => fold(s).split(' ').filter(Boolean);
// Ürün adlarından fasetler: değer adların en az yarısında geçiyorsa
function nameFacets(names) {
  const cnt = {}, n = Math.min(names.length, 60);
  for (const nm of names.slice(0, 60)) for (const [k, vs] of Object.entries(facetsOf(rawWords(nm)))) for (const v of vs) { cnt[k] = cnt[k] || {}; cnt[k][v] = (cnt[k][v] || 0) + 1; }
  const out = {};
  for (const [k, m] of Object.entries(cnt)) for (const [v, c] of Object.entries(m)) if (c / n > 0.5) (out[k] || (out[k] = new Set())).add(v);
  return out;
}
function facetScore(lf, kf) {
  let s = 0;
  for (const f of FACETS) {
    const a = lf[f.id] || (f.def ? new Set([f.def]) : null), b = kf[f.id] || (f.def ? new Set([f.def]) : null);
    const explicitA = !!lf[f.id], explicitB = !!kf[f.id];
    if (a && b) {
      const ok = [...a].some((x) => b.has(x) || (f.compat && ((f.compat[x] || []).some((y) => b.has(y)) || [...b].some((y) => (f.compat[y] || []).includes(x)))));
      if (!ok) s -= explicitA && explicitB ? 6 : 4;
      else if (explicitA && explicitB) s += 1.5;
    } else if (!a && b && f.target) s -= f.target; // kategori "kedi / telefon için" diyor, yerelde kanıt yok
  }
  return s;
}

// ---------- alan paketleri (bağlamla anlamı değişen kavramlar) ----------
// Bahçe / tarım paketi (eski davranış korunur). Başka sektör aynı biçimde paket ekleyebilir.
const CONCEPTS = [
  { id: 'spray', any: ['ilaclama', 'pulverizator', 'puskurtme', 'atomizor', 'sprayer'] },
  { id: 'spray', any: ['pompa', 'pompasi'], with: ['ilac', 'ilaclama', 'sirt', 'zirai', 'basincli', 'akulu', 'manuel'] }, // "bahçe" alan adıdır: Bahçe › Havuz Pompası ilaçlama değildir
  { id: 'water', any: ['dalgic', 'hidrofor', 'motopomp', 'santrifuj', 'jet', 'kuyu', 'foseptik', 'sintine'] },
  { id: 'water', any: ['pompa', 'pompasi', 'motor', 'motoru'], with: ['su', 'temiz', 'pis', 'kirli', 'havuz'] },
  { id: 'pest', any: ['ilac', 'insektisit', 'fungisit', 'herbisit', 'pestisit', 'akarisit', 'nematisit', 'zirai', 'koruma'] },
  { id: 'fert', any: ['gubre', 'fertilizer', 'npk', 'kompost', 'vermikompost', 'humik', 'fulvik', 'aminoasit', 'solucan'] },
  { id: 'fert', any: ['besin', 'besini'], with: ['bitki', 'gubre', 'toprak', 'cicek', 'bahce', 'tarim', 'sebze', 'meyve', 'cim', 'yaprak'] }, // kedi "ek besin"i gübre değildir
  { id: 'soil', any: ['toprak', 'torf', 'perlit', 'kokopit', 'harc', 'vermikulit', 'kompost', 'zeolit'] },
  { id: 'seed', any: ['tohum', 'fide', 'fidan', 'sogan', 'yumru'] },
  { id: 'pot', any: ['saksi', 'saksilar', 'jardinyer'] },
  { id: 'irrig', any: ['sulama', 'hortum', 'damla', 'fiskiye', 'sprinkler', 'yagmurlama', 'damlatma'] },
  { id: 'plant', any: ['bitki', 'cicek', 'agac', 'sebze', 'meyve', 'cim', 'bahce', 'tarim', 'ziraat', 'sera'] },
  // Evcil hayvan alanı: "Kedi › Vitamin" bitki vitamini, "Kedi Çimi" bahçe çimi değildir
  { id: 'pet', any: ['kedi', 'kopek', 'akvaryum', 'kemirgen', 'hamster', 'evcil'] },
  { id: 'pet', any: ['pet'], with: ['shop'] },
];
export function concepts(words) {
  const out = new Set();
  for (const c of CONCEPTS) if (c.any.some((w) => has(words, w)) && (!c.with || c.with.some((w) => has(words, w)))) out.add(c.id);
  if (out.has('spray') && out.has('water') && !['su', 'dalgic', 'hidrofor'].some((w) => has(words, w))) out.delete('water');
  return out;
}
const EXCLUSIVE = [
  [['organik', 'solucan', 'vermikompost', 'kompost', 'dogal', 'leonardit', 'humik'], ['kimyevi', 'kimyasal', 'mineral', 'sentetik']],
  [['sebze', 'domates', 'biber', 'salatalik', 'patlican', 'marul', 'fasulye'], ['cicek', 'petunya', 'gul', 'lale'], ['cim'], ['meyve', 'elma', 'cilek', 'uzum']],
];
const families = (words, group) => group.map((f, i) => (f.some((w) => has(words, w)) ? i : -1)).filter((i) => i >= 0);

// Hiçbir şey söylemeyen yerel kategori adları: yalnız ürün adlarına bakılır, öneri "kesin" olmaz
const GENERIC = new Set(['diger', 'genel', 'kampanya', 'kampanyali', 'indirim', 'indirimli', 'firsat', 'outlet', 'yeni', 'gelenler', 'tum', 'hepsi', 'cok', 'satanlar', 'one', 'cikanlar', 'vitrin', 'sezon', 'ozel', 'urunler', 'kategorisiz', 'misc', 'other', 'sale']);
export const isGeneric = (local) => { const w = rawWords(String(local || '').split(/›|>|\//).pop()); return !w.length || w.every((x) => GENERIC.has(x)); };

// Baş kelime (kategorinin asıl nesnesi): Türkçe tamlamada son kelime ("Ödül Maması" → mama, "Bitki Vitamini" → vitamin). Virgül / "ve"
// ile sıralanan her parçanın kendi başı vardır ("Torf ve Toprak"); "Bahçe, Balkon Salıncağı" / "Salon ve Ev Bitkileri" eksiltmesinde
// eksiz tek kelimelik parça, ardından gelen iyelik ekli başa bağlanır (bahçe salıncağı, salon bitkileri) ve baş sayılmaz;
// çoğul / ekli tek kelime kendi başına nesnedir ("Saksılar ve Bahçe Yatakları").
const PARTS = /\s*(?:,|&|\/|\+|\s(?:ve|veya|ile|and)\s)\s*/i;
function headsOf(text) {
  const parts = String(text || '').split(PARTS).map(tokens).filter((t) => t.length);
  return parts.flatMap((t, i) => (t.length === 1 && stem(t[0]) === t[0] && parts.slice(i + 1).some((u) => u.length > 1 && /[iu]$/.test(u[u.length - 1])) ? [] : [t[t.length - 1]]));
}
const isFacetWord = (w) => Object.keys(facetsOf([w])).length > 0;

export function localProfile(local, names = []) {
  const segs = String(local || '').split(/›|>|\//).map((x) => x.trim()).filter(Boolean);
  const generic = isGeneric(local);
  let head = generic ? [] : tokens(segs[segs.length - 1] || local);
  const other = generic ? [] : tokens(segs.slice(0, -1).join(' ')).filter((w) => !has(head, w));
  const freq = new Map();
  for (const n of names.slice(0, 60)) for (const w of new Set(tokens(n))) freq.set(w, (freq.get(w) || 0) + 1);
  const total = Math.max(1, Math.min(names.length, 60));
  let prod = [...freq.entries()].filter(([w]) => !has(head, w) && !has(other, w)).map(([w, c]) => [w, c / total]).filter(([, r]) => r >= 0.15 || total <= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 10);
  // Genel kategori: ürün adlarının en sık baş ismi "baş" sayılır (çoğunluk varsa)
  if (generic && prod.length && prod[0][1] >= 0.6) { head = [prod[0][0]]; prod = prod.slice(1); }
  const base = [...head, ...other, ...prod.map(([w]) => w)];
  const bc = concepts(base);
  const syn = [...new Set(base.flatMap((w) => synOf(w, bc, base)))].filter((w) => !has(base, w));
  const all = [...base, ...syn];
  // Baş kelime: kategori adının son kelimesi; ürün adlarının belirgin çoğunluğu başka bir ad kelimesini kullanıyorsa o ("Kedi Ödül Maması":
  // ürünler "… Kedi Ödül Maması / Ödül Çubuğu / Kedi Ödülleri" → ödül). Faset kelimeleri (kedi, kadın, bebek …)
  // ve üst kategoride de geçen kelimeler ("Kedi Kumu › Kedi Kumu Koku Giderici"de kum) ayırt etmez, baş olamaz.
  let core = head[head.length - 1] || '';
  const ns = names.slice(0, 60).map(tokens), share = (w) => ns.filter((t) => has(t, w)).length / Math.max(1, ns.length);
  const up = tokens(segs.slice(0, -1).join(' '));
  if (!generic && ns.length >= 3) { const c = head.filter((w) => !isFacetWord(w) && !has(up, w)); const b = c.reduce((a, x) => (share(x) > share(a) ? x : a), core); if (share(b) - share(core) >= 0.1) core = b; }
  // Kategorinin "nesneleri": her yol parçasının başı + baş kelime + ürün adlarının çoğunluğundaki kelimeler (en az 3 ürün)
  const objs = generic ? [...head] : [...new Set([...segs.flatMap(headsOf), core, ...(total >= 3 ? prod.filter(([, r]) => r >= 0.5).map(([w]) => w) : [])])].filter(Boolean);
  const segWords = segs.flatMap((x) => rawWords(x));
  const lf = facetsOf(segWords), nf = nameFacets(names);
  const speciesX = !!lf.species; // tür kategori adında açıkça söyleniyor (ürün adlarından değil)
  for (const [k, v] of Object.entries(nf)) if (!lf[k]) lf[k] = v; // kategori adı söylemiyorsa ürün adlarının çoğunluğu
  const parentHeads = generic ? [] : segs.slice(0, -1).reverse().flatMap((x) => headsOf(x).reverse()); // en yakın üst kategoriden köke
  // Kavramlar: kategorinin kendi adı ve nesnelerinden gelenler güçlü (objConcepts); üst kategorideki niteleyiciden / az sayıda ürün adından
  // gelenler zayıf ("Çiçekli Saksı Bitkileri › Orkideler" saksı değildir)
  const objConcepts = concepts([...head, ...objs, ...[...head, ...objs].flatMap((w) => synOf(w, bc, base))]);
  return { head, other, prod, nNames: ns.length, syn, all, core, objs, parentHeads, speciesX, generic, facets: lf, coreConcepts: concepts(core ? [core] : []), concepts: concepts(all), objConcepts };
}

const prepared = new WeakMap();
export function prepare(list) {
  if (prepared.has(list)) return prepared.get(list);
  const out = list.map((c) => {
    const name = tokens(c.name), path = tokens(c.path).filter((w) => !has(name, w));
    const raw = [...rawWords(c.path), ...rawWords(c.name)];
    return { c, name, path, heads: headsOf(c.name), concepts: concepts([...name, ...path]), facets: facetsOf(raw), fam: EXCLUSIVE.map((g) => families(name, g)) };
  });
  // 2 harflik önek dizini (yalnız kategori ADI kelimeleri: öneri için en az bir ad kelimesi eşleşmeli)
  out.index = new Map();
  for (const k of out) for (const w of k.name) { const p = w.slice(0, 2); (out.index.get(p) || out.index.set(p, new Set()).get(p)).add(k); }
  prepared.set(list, out);
  return out;
}

export function score(L, k) {
  let s = 0, hit = 0;
  for (const w of L.head) { if (has(k.name, w)) { s += 3; hit++; } else if (has(k.path, w)) s += 1.2; }
  for (const w of L.other) { if (has(k.name, w)) { s += 1.5; hit++; } else if (has(k.path, w)) s += 0.8; }
  for (const [w, r] of L.prod) { if (has(k.name, w)) { s += 2 * r + 0.5; hit++; } else if (has(k.path, w)) s += 0.6 * r; }
  for (const w of L.syn) { if (has(k.name, w)) { s += 1.5; hit++; } else if (has(k.path, w)) s += 0.5; }
  // Baş kelime kanal kategorisinin de başıysa tam puan; yalnız niteleyicisiyse ("Süs Bitkileri" ↔ "Bitki Vitamini") az puan
  if (L.core && has(k.name, L.core)) s += has(k.heads, L.core) ? 2 : 0.5;
  // Kanal kategorisinin başı yereldeki hiçbir nesneye karşılık gelmiyor ve baş kelime de adında yok: başka bir nesne ("Balkon Bitkileri" ↔ "Balkon Salıncağı")
  // (başı yalnız birkaç ürün adında geçiyorsa yarım ceza)
  else if (L.objs.length && k.heads.length && !k.heads.some((h) => has(L.objs, h) || has(L.syn, h))) s -= L.nNames >= 2 && k.heads.some((h) => L.prod.some(([w]) => same(w, h))) ? 1 : 2;
  // Yerel kategori bir hayvan türü için (adında "kedi" / "köpek" …) ama kanal kategorisi hiçbir tür için değil (bitki vitamini, oyuncak kum …)
  if (L.speciesX && !k.facets.species) s -= 3;
  const cc = [...L.coreConcepts].filter((c) => c !== 'plant');
  if (cc.length && !cc.some((c) => k.concepts.has(c))) s -= 3;
  EXCLUSIVE.forEach((g, i) => { const a = families(L.all, g), b = k.fam[i]; if (a.length && b.length && !b.some((x) => a.includes(x))) s -= 3; });
  const extra = k.name.filter((w) => !has(L.all, w)).length;
  s -= Math.min(3, extra);
  if (L.head.length && L.head.length === k.name.length && L.head.every((w) => has(k.name, w))) s += 2;
  const shared = [...k.concepts].filter((c) => L.concepts.has(c));
  s += Math.min(5, shared.reduce((a, c) => a + (L.objConcepts.has(c) ? 2.5 : 1), 0));
  const kc = [...k.concepts].filter((c) => c !== 'plant'), lc = [...L.concepts].filter((c) => c !== 'plant');
  if (kc.length && lc.length && !kc.some((c) => L.concepts.has(c))) s -= 6;
  // Alan uyumu: yerel kategori bir alan paketine açıkça giriyor (adında ilaçlama, gübre, tohum, kedi …), kanal kategorisi hiçbirine girmiyor
  // ("Viyoller" ↔ müzik aleti "Viyola", "İlaçlama Pompaları" ↔ "Tekne Pompaları")
  else if (!k.concepts.size && [...L.objConcepts].some((c) => c !== 'plant')) s -= 2;
  if (L.concepts.has('spray') && k.concepts.has('water')) s -= 6;
  if (L.concepts.has('water') && k.concepts.has('spray')) s -= 6;
  s += facetScore(L.facets, k.facets);
  return { score: Math.round(s * 10) / 10, hit };
}

// Yerel kategori ile kanal kategorisi arasında faset çelişkisi (cinsiyet / yaş / tür / cihaz / malzeme / kıvam): ör. "Kadın › Elbise" ↔
// "Kız Çocuk › Elbise". Aynı adlı site kategorisi bile olsa böyle bir öneri "kesin" sayılmaz.
export const facetClash = (local, names, cat) => facetScore(localProfile(local, names).facets, prepare([cat])[0].facets) < 0;
export function rank(list, local, names = [], n = 5) {
  const L = localProfile(local, names);
  if (!L.all.length) return [];
  const P = prepare(list), cand = new Set();
  for (const w of [...L.all, ...L.all.map(stem)]) for (const k of P.index.get(w.slice(0, 2)) || []) cand.add(k);
  // Baş kelime kanalın hiçbir kategori adında geçmiyorsa (ağaçta "Orkide" yok) en yakın üst kategorinin başı geçer: orkide bir "bitki"dir
  if (L.core && ![...cand].some((k) => has(k.name, L.core))) {
    const up = L.parentHeads.find((h) => [...cand].some((k) => has(k.name, h)));
    if (up) { L.core = up; L.coreConcepts = concepts([up]); }
  }
  return [...cand].map((k) => ({ k, ...score(L, k) })).filter((x) => x.hit > 0 && x.score >= 2)
    .sort((a, b) => b.score - a.score || a.k.name.length - b.k.name.length).slice(0, n)
    .map((x) => ({ ...x.k.c, score: x.score, ...(L.generic ? { generic: true } : {}) }));
}
