// Kategori eşleştirme puanı: panel (ikas) kategorisi + o kategorideki ürün adları ↔ pazaryeri kategorisi (ad + yol).
// Yalnız kelime benzerliğine bakılmaz; tarım / bahçe alanındaki kavramlar ayrıca tanınır. Böylece "İlaç Pompası"
// su pompasına, "Sıvı Gübre" akvaryum gübresine, "Saksı Toprağı" kedi kumuna gitmez:
//   - Türkçe ekler ve ünsüz yumuşaması yok sayılır (toprak / toprağı, ilaç / ilaçlama, gübre / gübresi).
//   - Kavramlar (ilaçlama pompası, su pompası, gübre, toprak, tohum, zirai ilaç ...) iki tarafta da çıkarılır; ortak kavram puanı
//     artırır, çelişen kavram (ilaçlama ↔ su pompası) ve alakasız alan (evcil hayvan, otomotiv, kozmetik ...) puanı düşürür.
//   - Pazaryeri kategorisinin adında, yerel tarafta karşılığı olmayan kelimeler puanı düşürür ("Su Pompası" ← yerelde "su" yoksa).

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const STOP = new Set(['ve', 'ile', 'icin', 'diger', 'urun', 'urunu', 'urunler', 'urunleri', 'cesit', 'cesitleri', 'malzeme', 'malzemeleri', 'grubu', 'tum', 'genel',
  'lt', 'litre', 'kg', 'kilo', 'gr', 'gram', 'ml', 'cc', 'cm', 'mm', 'adet', 'li', 'lu', 'lik', 'luk', 'paket', 'kutu', 'yeni', 'orijinal', 'ozel', 'en', 'cok', 'the', 'of', 'and']);
export const fold = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, (c) => FOLD[c] || c).replace(/[^a-z0-9]+/g, ' ').trim();
export const tokens = (s) => fold(s).split(' ').filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d/.test(w));

// Ek ve yumuşama farkına dayanıklı kelime eşitliği: "ilac" ~ "ilaclama", "toprak" ~ "topragi", "gubre" ~ "gubresi"; "su" yalnız "su"
const SOFT = { k: 'g', p: 'b', t: 'd', c: 'c' };
const soft = (w) => (SOFT[w[w.length - 1]] ? w.slice(0, -1) + SOFT[w[w.length - 1]] : w);
function pm(a, b) {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 3) return s === l;
  if (s.length === 3) return l.startsWith(s) && l.length - s.length <= 2; // "pet" ≠ "petunya", "oto" ≠ "otomatik"
  return l.startsWith(s) && l.length - s.length <= 5;
}
// Çoğul / iyelik ekleri: gübreleri → gübre, tohumları → tohum, pompası → pompa, toprağı → toprak
const SUFFIX = ['larindan', 'lerinden', 'larinin', 'lerinin', 'lari', 'leri', 'lar', 'ler', 'sini', 'sunu', 'nin', 'nun', 'si', 'su', 'in', 'un', 'i', 'u'];
const HARD = { g: 'k', b: 'p', d: 't' };
export function stem(w) {
  for (const x of SUFFIX) if (w.endsWith(x) && w.length - x.length >= 4) { const r = w.slice(0, -x.length); return HARD[r[r.length - 1]] && x[0] !== 's' && x[0] !== 'l' ? r.slice(0, -1) + HARD[r[r.length - 1]] : r; }
  return w;
}
export const same = (a, b) => a === b || pm(a, b) || pm(soft(a), b) || pm(a, soft(b)) || (a.length > 4 && b.length > 4 && pm(stem(a), stem(b)));
const has = (list, w) => list.some((x) => same(x, w));

// Kavramlar: kelimelerden biri geçerse (ve varsa "with" kelimelerinden biri de geçerse) kavram vardır
const CONCEPTS = [
  { id: 'spray', any: ['ilaclama', 'pulverizator', 'puskurtme', 'atomizor', 'sprayer'] },
  { id: 'spray', any: ['pompa', 'pompasi'], with: ['ilac', 'ilaclama', 'sirt', 'zirai', 'bahce', 'basincli', 'akulu', 'manuel'] },
  { id: 'water', any: ['dalgic', 'hidrofor', 'motopomp', 'santrifuj', 'jet', 'kuyu', 'foseptik', 'sintine'] },
  { id: 'water', any: ['pompa', 'pompasi', 'motor', 'motoru'], with: ['su', 'temiz', 'pis', 'kirli', 'havuz'] },
  { id: 'pest', any: ['ilac', 'insektisit', 'fungisit', 'herbisit', 'pestisit', 'akarisit', 'nematisit', 'zirai', 'koruma'] },
  { id: 'fert', any: ['gubre', 'fertilizer', 'npk', 'kompost', 'vermikompost', 'humik', 'fulvik', 'besin', 'besini', 'aminoasit', 'solucan'] },
  { id: 'soil', any: ['toprak', 'torf', 'perlit', 'kokopit', 'harc', 'vermikulit', 'kompost', 'zeolit'] },
  { id: 'seed', any: ['tohum', 'fide', 'fidan', 'sogan', 'yumru'] },
  { id: 'pot', any: ['saksi', 'saksilar', 'jardinyer', 'vazo'] },
  { id: 'irrig', any: ['sulama', 'hortum', 'damla', 'fiskiye', 'sprinkler', 'yagmurlama', 'damlatma'] },
  { id: 'tool', any: ['makas', 'budama', 'kurek', 'tirmik', 'capa', 'kazma', 'testere', 'tirpan', 'aparat'] },
  { id: 'plant', any: ['bitki', 'cicek', 'agac', 'sebze', 'meyve', 'cim', 'bahce', 'tarim', 'ziraat', 'sera'] },
  // Alakasız alanlar: yerel tarafta yoksa puanı ciddi düşürür
  { id: 'x-pet', any: ['kedi', 'kopek', 'akvaryum', 'evcil', 'kus', 'balik', 'kemirgen', 'pet'] },
  { id: 'x-auto', any: ['otomotiv', 'oto', 'arac', 'yakit', 'motosiklet', 'lastik'] },
  { id: 'x-cosm', any: ['kozmetik', 'sac', 'cilt', 'parfum', 'makyaj', 'tiras', 'kisisel'] },
  { id: 'x-home', any: ['hasere', 'sinek', 'hamam', 'mutfak', 'banyo', 'temizlik', 'deterjan'] },
  { id: 'x-elec', any: ['bilgisayar', 'telefon', 'elektronik', 'kablo', 'sarj'] },
  { id: 'x-baby', any: ['bebek', 'anne', 'oyuncak', 'kirtasiye', 'kitap', 'giyim', 'ayakkabi'] },
];
export function concepts(words) {
  const out = new Set();
  for (const c of CONCEPTS) if (c.any.some((w) => has(words, w)) && (!c.with || c.with.some((w) => has(words, w)))) out.add(c.id);
  // Pompa: ilaçlama bağlamı varsa su pompası sayılmaz (ve tersi)
  if (out.has('spray') && out.has('water') && !['su', 'dalgic', 'hidrofor'].some((w) => has(words, w))) out.delete('water');
  return out;
}

// Eş anlamlılar: yerel kelime → pazaryerinde sık kullanılan karşılığı
const SYN = {
  fungisit: ['mantar', 'ilac'], insektisit: ['bocek', 'ilac'], herbisit: ['ot', 'ilac'], akarisit: ['orumcek', 'ilac'], pestisit: ['zirai', 'ilac'],
  solucan: ['organik'], vermikompost: ['organik', 'gubre'], leonardit: ['humik', 'organik', 'gubre'], humik: ['organik'], kompost: ['organik'],
  pulverizator: ['ilaclama', 'pompa'], atomizor: ['ilaclama'], hortum: ['sulama'], fide: ['fidan'], torf: ['toprak'], kokopit: ['toprak'],
  saksilar: ['saksi'], aletleri: ['alet'], besin: ['gubre'], besini: ['gubre'],
};
// Birbirini dışlayan aileler: yerelde biri, kategoride diğeri varsa ceza (organik ↔ kimyevi, sıvı ↔ granül, sebze ↔ çiçek ↔ çim)
const EXCLUSIVE = [
  [['organik', 'solucan', 'vermikompost', 'kompost', 'dogal', 'leonardit', 'humik'], ['kimyevi', 'kimyasal', 'mineral', 'sentetik']],
  [['sivi'], ['granul', 'toz', 'kati', 'tablet']],
  [['sebze', 'domates', 'biber', 'salatalik', 'patlican', 'marul', 'fasulye'], ['cicek', 'petunya', 'gul', 'lale'], ['cim'], ['meyve', 'elma', 'cilek', 'uzum']],
];
const families = (words, group) => group.map((f, i) => (f.some((w) => has(words, w)) ? i : -1)).filter((i) => i >= 0);

// Yerel taraf: kategori yolu + ürün adları (sık geçen kelimeler, ağırlıklı)
export function localProfile(local, names = []) {
  const segs = String(local || '').split(/›|>|\//).map((x) => x.trim()).filter(Boolean);
  const head = tokens(segs[segs.length - 1] || local), other = tokens(segs.slice(0, -1).join(' ')).filter((w) => !has(head, w));
  const freq = new Map();
  for (const n of names.slice(0, 60)) for (const w of new Set(tokens(n))) freq.set(w, (freq.get(w) || 0) + 1);
  const total = Math.max(1, Math.min(names.length, 60));
  const prod = [...freq.entries()].filter(([w]) => !has(head, w) && !has(other, w)).map(([w, c]) => [w, c / total]).filter(([, r]) => r >= 0.15 || total <= 3)
    .sort((a, b) => b[1] - a[1]).slice(0, 10);
  const base = [...head, ...other, ...prod.map(([w]) => w)];
  const syn = [...new Set(base.flatMap((w) => Object.entries(SYN).filter(([k]) => same(k, w)).flatMap(([, v]) => v)))].filter((w) => !has(base, w));
  const all = [...base, ...syn];
  // Baş isim: Türkçe tamlamada son kelime ("Saksı Toprağı" → toprak); kategori adında olması ayrıca önemlidir
  const core = head[head.length - 1] || '';
  return { head, other, prod, syn, all, core, coreConcepts: concepts(core ? [core, ...(SYN[core] || [])] : []), concepts: concepts(all) };
}

// Pazaryeri kategorileri: kelimeler ve kavramlar bir kez çıkarılır (binlerce kategori için hızlı)
const prepared = new WeakMap();
export function prepare(list) {
  if (prepared.has(list)) return prepared.get(list);
  const out = list.map((c) => { const name = tokens(c.name), path = tokens(c.path).filter((w) => !has(name, w)); return { c, name, path, concepts: concepts([...name, ...path]) }; });
  prepared.set(list, out);
  return out;
}

export function score(L, k) {
  let s = 0, hit = 0;
  for (const w of L.head) { if (has(k.name, w)) { s += 3; hit++; } else if (has(k.path, w)) s += 1.2; }
  for (const w of L.other) { if (has(k.name, w)) { s += 1.5; hit++; } else if (has(k.path, w)) s += 0.8; }
  for (const [w, r] of L.prod) { if (has(k.name, w)) { s += 2 * r + 0.5; hit++; } else if (has(k.path, w)) s += 0.6 * r; }
  for (const w of L.syn) { if (has(k.name, w)) { s += 1.5; hit++; } else if (has(k.path, w)) s += 0.5; }
  if (L.core && has(k.name, L.core)) s += 2;
  // Baş ismin kavramı kategoride yoksa (ör. "Saksı Toprağı" → "Saksı" kategorisi) ceza
  const cc = [...L.coreConcepts].filter((c) => c !== 'plant');
  if (cc.length && !cc.some((c) => k.concepts.has(c))) s -= 3;
  for (const g of EXCLUSIVE) { const a = families(L.all, g), b = families(k.name, g); if (a.length && b.length && !b.some((i) => a.includes(i))) s -= 3; }
  // Kategori adında yerelde karşılığı olmayan kelimeler (ör. yerelde "su" yokken "Su Pompası")
  const extra = k.name.filter((w) => !has(L.all, w)).length;
  s -= Math.min(3, extra);
  if (L.head.length && L.head.length === k.name.length && L.head.every((w) => has(k.name, w))) s += 2;
  // Kavramlar
  const shared = [...k.concepts].filter((c) => L.concepts.has(c) && !c.startsWith('x-'));
  s += Math.min(5, shared.length * 2.5);
  const kc = [...k.concepts].filter((c) => !c.startsWith('x-') && c !== 'plant'), lc = [...L.concepts].filter((c) => !c.startsWith('x-') && c !== 'plant');
  if (kc.length && lc.length && !kc.some((c) => L.concepts.has(c))) s -= 6;
  if ([...k.concepts].some((c) => c.startsWith('x-') && !L.concepts.has(c))) s -= 5;
  if (L.concepts.has('spray') && k.concepts.has('water')) s -= 6;
  if (L.concepts.has('water') && k.concepts.has('spray')) s -= 6;
  if (k.concepts.has('plant') && !k.concepts.has('x-pet')) s += 0.5;
  return { score: Math.round(s * 10) / 10, hit };
}

// En iyi n kategori; hiçbir kelimesi kategori adında geçmeyenler önerilmez
export function rank(list, local, names = [], n = 5) {
  const L = localProfile(local, names);
  if (!L.all.length) return [];
  return prepare(list).map((k) => ({ k, ...score(L, k) })).filter((x) => x.hit > 0 && x.score >= 2)
    .sort((a, b) => b.score - a.score || a.k.name.length - b.k.name.length).slice(0, n)
    .map((x) => ({ ...x.k.c, score: x.score }));
}
