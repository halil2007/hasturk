// Ak Bilge (isim config.json > akbilge.name ile değişir): müşterinin tarım sorusunu cevaplar.
//   1) Soru önce hazır soru havuzunda aranır (src/akbilge-havuz.json; scripts/akbilge-havuz.mjs üretir). Bulunursa cevap
//      anında ve ücretsiz döner. Havuzdaki rakamlar yalnız doğrulanmış tablolardan gelir.
//   2) Bulunamazsa ve anahtar + günlük sınır uygunsa Claude'a sorulur: en yakın havuz cevapları ve ilgili ürünler bağlam
//      olarak verilir, model yalnız bu bağlamdaki rakamları ve ürünleri kullanabilir.
//   3) Claude'un cevabı veritabanına 'onay-bekliyor' olarak yazılır; onaylanan cevaplar sonraki aynı soruda havuzdan gelir.
// Kişisel veri tutulmaz: soru metni, cevap, tarih; IP / çerez / kimlik yok.
import Anthropic from '@anthropic-ai/sdk';
import HAVUZ from './akbilge-havuz.json';
import { rehberMetni, GRUPLAR, OZEL_KARISIM, TOPRAK_SORUSU, KENDIM } from './toprak.js';

export const MODEL = 'claude-opus-5-5';
const DAILY_LIMIT = 150;     // günde en fazla bu kadar Claude sorgusu (env.AK_DAILY_LIMIT ile değişir)
const MAX_Q = 300;           // karakter

// ---------- Türkçe metin ----------
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => FOLD[c])
  .replace(/[^a-z0-9]+/g, ' ').trim();
// Soruya anlam katmayan dolgu kelimeleri (soru kalıbı kelimeleri — ne, nasıl, kaç… — KALIR, niyeti onlar taşır)
const FILL = new Set(['merhaba', 'selam', 'selamlar', 'iyi', 'gunler', 'aksamlar', 'lutfen', 'acaba', 'abi', 'abla', 'hocam', 'usta', 'kardesim',
  'tesekkurler', 'tesekkur', 'ederim', 'almaliyim', 'almali', 'alayim', 'alsam', 'almak', 'onerirsiniz', 'onerir', 'misiniz', 'musunuz', 'yardimci', 'olur', 'musun', 'sayin', 'yetkili', 'bilgi', 'alabilir', 'miyim', 'sormak', 'istiyorum', 'istiyordum', 'bir', 'bu', 'su', 've', 'ile', 'ya', 'da', 'de', 'ki', 'mi', 'mu', 'benim', 'bana', 'sizde', 'var', 'cok', 'sey', 'seyler', 'lazim', 'gerek', 'gerekir', 'gerekiyor', 'almam', 'alirim', 'kullanmaliyim', 'kullanayim', 'kullanmam']);
const stem = (t) => (t.length > 5 ? t.slice(0, 5) : t);
// "ağaç/ağacı/ağacına" bitki adının parçası olarak anlam katmaz (limon ağacı = limon)
const FILL_STEM = new Set(['agac', 'agaci', 'agacl', 'agacm']);
export const toks = (s) => [...new Set(norm(s).split(' ').filter((t) => t && !FILL.has(t)).map(stem).filter((t) => !FILL_STEM.has(t)))];

// ---------- Havuz dizini (her Worker örneğinde bir kez kurulur) ----------
let IDX = null, IDX_X = { key: '', idx: null };
function index(extra = []) {
  if (IDX && !extra.length) return IDX;
  // Ek kayıtlarla (onaylı / kayıtlı Claude cevapları) kurulan dizin, liste değişmedikçe yeniden kurulmaz
  const key = extra.length ? extra.length + ':' + extra[0].i + ':' + extra[extra.length - 1].i : '';
  if (key && IDX_X.key === key) return IDX_X.idx;
  const entries = HAVUZ.concat(extra), pats = [], df = new Map();
  entries.forEach((e, ei) => e.s.forEach((q) => {
    const ts = toks(q); if (!ts.length) return;
    pats.push({ ei, ts, r: ' ' + norm(q) + ' ' });
    ts.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  }));
  const N = pats.length, idf = new Map();
  df.forEach((n, t) => idf.set(t, Math.log(1 + N / n)));
  const byTok = new Map(); // ters dizin: kelime → kalıplar
  pats.forEach((p, pi) => { p.w = p.ts.reduce((a, t) => a + idf.get(t), 0); p.ts.forEach((t) => { if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(pi); }); });
  const built = { entries, pats, idf, byTok, N };
  if (!extra.length) IDX = built; else IDX_X = { key, idx: built };
  return built;
}
// Konu kelimeleri: soru "gübre" diye soruyorsa "toprak" cevabı verilmez (bu kelimeler sık geçtiği için idf'leri düşük kalır)
const TOPIC = { gubre: 'g', besin: 'g', dozu: 'g', topra: 't', harci: 't', tohum: 'e', ekili: 'e', ekim: 'e', ekme: 'e', saksi: 's', pompa: 'p', ilac: 'i', ilacl: 'p' };
const topics = (ts) => new Set(ts.map((t) => TOPIC[t]).filter(Boolean));
// Kelime benzerliği: aynı kök 1; ilk 4 harf aynı (yazım farkı, ek) 0,7
const sim = (a, b) => (a === b ? 1 : a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4) ? 0.7 : 0);

// En iyi eşleşmeler: kalıbın büyük kısmı soruda, sorunun büyük kısmı kalıpta olmalı (idf ağırlıklı)
export function match(q, { extra = [], top = 5, product = null } = {}) {
  const X = index(extra), qt = toks(q);
  if (!qt.length) return [];
  const qi = (t) => X.idf.get(t) || Math.log(1 + X.N); // havuzda hiç geçmeyen kelime: en nadir sayılır
  const qw = qt.reduce((a, t) => a + qi(t), 0), qtop = topics(qt);
  // Eşitlik bozucu: kökleri aynı iki kalıptan (biber / biberiye) sorudaki kelimeyi AYNEN içeren öne geçer
  const qr = norm(q).split(' ').filter((t) => t.length >= 3);
  const cand = new Set();
  qt.forEach((t) => { (X.byTok.get(t) || []).forEach((pi) => cand.add(pi)); if (t.length >= 4) X.byTok.forEach((list, k) => { if (k !== t && k.slice(0, 4) === t.slice(0, 4)) list.forEach((pi) => cand.add(pi)); }); });
  const best = new Map();
  cand.forEach((pi) => {
    const p = X.pats[pi];
    let hitP = 0, hitQ = 0;
    p.ts.forEach((t) => { let m = 0; qt.forEach((u) => { m = Math.max(m, sim(t, u)); }); hitP += m * X.idf.get(t); });
    qt.forEach((u) => { let m = 0; p.ts.forEach((t) => { m = Math.max(m, sim(t, u)); }); hitQ += m * qi(u); });
    const cp = hitP / p.w, cq = hitQ / qw;
    let sc = 2 * cp * cq / (cp + cq || 1); // iki yönlü kapsama (F1)
    if (qtop.size) { const pt = topics(p.ts); if (pt.size && ![...qtop].some((x) => pt.has(x))) sc *= 0.5; }
    // Belirli bir bitkiye ait cevap (doz, toprak, ekim) yalnız o bitki soruda geçiyorsa verilir
    const eb = X.entries[p.ei].b;
    // Bitki adı yazım benzerliğiyle değil, kökünden eşleşmeli (kaladyum ≠ kalanşo): biri ötekinin başıysa (nane / naneye) sayılır
    if (eb) { const bt = toks(eb.replace(/\(.*?\)/g, ' ')); if (bt.length && !bt.some((t) => qt.some((u) => t.length >= 3 && u.length >= 3 && (u.startsWith(t) || t.startsWith(u))))) sc *= 0.4; }
    if (product && X.entries[p.ei].p === product) sc += 0.08; // müşterinin bulunduğu ürün sayfasıyla ilgili cevaba hafif öncelik
    if (qr.length) sc += 0.004 * qr.filter((t) => p.r.includes(' ' + t + ' ')).length / qr.length;
    const prev = best.get(p.ei);
    if (!prev || sc > prev.sc) best.set(p.ei, { sc, cp, cq, pat: p });
  });
  return [...best.entries()].sort((a, b) => b[1].sc - a[1].sc).slice(0, top)
    .map(([ei, r]) => ({ e: X.entries[ei], sc: +r.sc.toFixed(3), cp: +r.cp.toFixed(3), cq: +r.cq.toFixed(3) }));
}
// ---------- Toprak niyeti: bitki adı (yazım hatasına dayanıklı) + toprak sorusu → bitkinin toprak kartı ----------
// "Bengovil toprağı lazım" (yazım hatası), "kızılcık toprağı hazırlayabilir misin" (karışım isteği) gibi sorular havuz
// kalıbına uymasa da yapay zekâya gitmeden bitkinin kartına (hazır toprak; karışım istenirse tarif ve sepete ekleme) gider.
const mesafe = (a, b) => { // harf ekleme / silme / değiştirme / yan yana yer değiştirme sayısı
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
};
let BT = null;
function bitkiler() {
  if (BT) return BT;
  const voc = new Set(); HAVUZ.forEach((e) => e.s.forEach((q) => norm(q).split(' ').forEach((w) => voc.add(w))));
  const list = HAVUZ.filter((e) => e.t === 'bitki-toprak' && e.b).map((e) => ({ e, adlar: e.b.split(',').map((x) => norm(x.replace(/\(.*?\)/g, ' ')).split(' ').filter((w) => w.length >= 3)).filter((a) => a.length) }));
  const adK = new Set(list.flatMap((x) => x.adlar.flat()));
  return (BT = { list, voc, adK });
}
// Sorudaki kelime bitki adının kelimesi mi: aynısı, ekli hali (begonvilin) ya da sözlükte olmayan yazım hatası (bengovil)
function kelimeUyar(w, t, voc) {
  if (w === t || (t.length >= 3 && w.startsWith(t) && w.length - t.length <= 4)) return 2;
  if (t.length < 5 || w[0] !== t[0] || voc.has(w)) return 0;
  const k = t.length >= 7 ? 2 : 1;
  return mesafe(w, t) <= k || mesafe(w.slice(0, t.length), t) <= k ? 1 : 0;
}
const TOPRAK_DEGIL = /gubre|ilac|bocek|hastalik|zararli|sulam|budam/;
const toprakOk = (n) => TOPRAK_SORUSU.test(n) && !TOPRAK_DEGIL.test(n);
export function toprakNiyet(q) {
  const n = norm(q);
  if (!toprakOk(n)) return null;
  const B = bitkiler(), ws = n.split(' ').filter((w) => w.length >= 3);
  let best = null;
  B.list.forEach((x) => x.adlar.forEach((ad) => {
    let puan = 0;
    for (const t of ad) { const m = Math.max(0, ...ws.map((w) => kelimeUyar(w, t, B.voc))); if (!m) return; puan += m * t.length; }
    if (!best || puan > best.puan) best = { e: x.e, puan };
  }));
  return best ? { e: best.e, kendim: KENDIM.test(n) } : null;
}
// Sorudaki bitki, yapay zekânın daha önce tanıdığı bitkilerden biri mi (yazım hatası ve ekli hali dahil)
export function bitkiBul(q, list) {
  const n = norm(q);
  if (!toprakOk(n)) return null;
  const B = bitkiler(), ws = n.split(' ').filter((w) => w.length >= 3);
  let best = null, bp = 0;
  for (const x of list) {
    let puan = 0;
    for (const t of x.w) { const m = Math.max(0, ...ws.map((w) => kelimeUyar(w, t, B.voc))); if (!m) { puan = 0; break; } puan += m * t.length; }
    if (puan > bp) { best = x; bp = puan; }
  }
  return best;
}

// Havuzdan cevap verilecek kadar emin miyiz
export const SURE = 0.72;
const AYLAR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
// "bu ay ne ekilir" → "ekim ayında ne ekilir" (Türkiye saatine göre bu ay)
const buAy = (q) => q.replace(/\b(bu|şu an(ki)?|şimdiki) ay(ı|da|ında|ki)?\b/giu, AYLAR[new Date(Date.now() + 3 * 3600e3).getUTCMonth()] + ' ayında');
export function poolAnswer(q, opts = {}) {
  q = buAy(q);
  let r = match(q, opts);
  // Ürün sayfasındaysa ve soruda ürün adı yoksa ("bunu nasıl kullanırım", "kaç litre"), ürün adıyla birlikte de dene
  if (opts.productName && (!r[0] || r[0].sc < SURE)) {
    const r2 = match(q + ' ' + opts.productName, opts).filter((x) => x.e.p === opts.product);
    if (r2[0] && (!r[0] || r2[0].sc > r[0].sc)) r = r2.concat(r);
  }
  return { hit: r[0] && r[0].sc >= SURE && r[0].cp >= 0.65 && r[0].cq >= 0.8 ? r[0] : null, near: r };
}

// ---------- Claude ----------
export function systemPrompt(name) {
  return `Sen ${name}'sin: HasTürk Gübre'nin (hasturkgubre.com.tr) çevrimiçi tarım ve bahçe danışmanısın. Müşterilerin gübre, toprak, tohum, saksı, bitki bakımı ve ilaçlama ekipmanı sorularını Türkçe, sade ve kısa cevaplarsın.

Dil: Günlük, sade Türkçe kullan; bir bahçe sahibiyle konuşur gibi yaz. Kısa cümleler kur, "siz" diye hitap et. Ağır tarım terimlerini kullanma; gerekiyorsa günlük karşılığını yaz ("taç izdüşümü" yerine "dal uçlarının altı", "su yürümesi" yerine "ağaç uyanıp tomurcuklar kabarınca"). Miktarları "dekara 60–80 kg", "10 litre suya 50 ml", "fidan başına 2 kg" gibi okunur yaz; "cc" yerine "ml" de. Gereksiz giriş, tekrar ve uzun açıklama yapma; gerekiyorsa en fazla 4 madde kullan.

Müşteriler emek, para ve zaman harcıyor: yanlış ya da alakasız bir cevap, hiç cevap vermemekten daha kötüdür. Her ne pahasına cevap vermeye çalışma; doğru bilgin yoksa müşteriyi müşteri hizmetlerimize yönlendir. Gereken yerde yönlendirmekten çekinme, ama bildiğin ve güvenli olan temel bilgiyi de esirgeme.

Kurallar:
- Kıvamında yaz: 2–4 kısa cümle ya da en fazla 4 kısa madde (yaklaşık 70 kelime, asla 100 kelimeyi geçme). Sorunun cevabı için gerekeni eksiksiz ver, gerisini yazma; abartma, süsleme, tekrar etme. "Siz" diye hitap et. Selamlama ve övgü cümlesi yazma.
- Rakam (doz, miktar, litre, gün, cm, sıcaklık, oran) YALNIZCA kullanıcı mesajındaki "Doğrulanmış bilgi" bölümünde, sorulan bitki ve ürün için geçiyorsa kullanılır. Başka bir bitkinin ya da ürünün rakamını bu soruya uyarlama. Rakam yoksa rakam verme.
- "Doğrulanmış bilgi" soruyla ilgisizse onu kullanma; sorulmayan bir konuyu anlatma.
- Zirai ilaç, böcek/haşere/kemirgen ilacı ve dezenfektanlar için asla doz, karışım oranı veya uygulama tarifi verme: ürün etiketine uyulmasını söyle.
- Ürün önerisi yalnız "Önerilebilecek ürünler" listesinden ve yalnız soruyla gerçekten ilgiliyse yapılır; listede olmayan ürün, marka veya rakip mağaza adı yazma.
- Toprak sorulduysa (hangi toprak, nasıl bir toprak, toprak karışımı) yalnız toprak öner; gübreyi toprak yerine önerme. Bitkinin kendi hazır toprağı "Önerilebilecek ürünler"de varsa onu öner, tarif verme; müşteri hazır almak istemeyip karışımı kendisi yapmak istediğini söylerse "Kendi Toprak Karışımını Oluştur" ürününü ve rehberdeki tarifi ver. Bitkinin kendi toprağı "Önerilebilecek ürünler"de yoksa "Toprak rehberi"nden bitkiye en uygun grubu seç ve şunu yaz: bitkinin nasıl bir toprak sevdiği (bir cümle), o grubun hazır toprağı (en yakın seçenek olarak) ve "Kendi Toprak Karışımını Oluştur" ürünüyle hazırlanacak karışım tarifi (ölçü oranlarıyla, rehberdeki gibi). Ürün olarak en uygun hazır toprağı ve Kendi Toprak Karışımını Oluştur'u seç. Bitkiyi tanımıyorsan genel grubu öner ve müşteri hizmetlerimize danışılabileceğini ekle.
- Bitki hastalığı ya da zararlı teşhisi koyma; "Doğrulanmış bilgi"de o belirtiye ait olası nedenler ve öneriler varsa onları kullan, yoksa yalnız olası nedenleri say. Her durumda fotoğrafla müşteri hizmetlerimize danışılmasını öner. Ev ve halk sağlığı böcek ilaçlarını (sinek, hamamböceği, tahtakurusu, akar spreyleri) bitkiye önerme. İnsan veya hayvan sağlığı konusunda tavsiye verme.
- Mağaza bilgisi: siparişler aynı gün kargoya teslim edilir; bölgeye göre teslimat ertesi gün ya da 2-3 gün içinde gerçekleşir. Bunun dışındaki sipariş durumu, kargo takibi, iade, fiyat, kampanya ve stok sorularını cevaplama; bu konular için müşteri hizmetlerimize yönlendir.
- Yönlendirirken "usta" deme; "müşteri hizmetlerimizden destek alabilirsiniz" de.
- Kaynak, yayın, kurum ya da "şuradan aldım" bilgisi verme; yalnız cevabı yaz.

"durum" alanı:
- "cevap": soruyu doğru ve güvenle cevapladın.
- "yonlendir": soru insan desteği gerektiriyor (sipariş/kargo/iade, teşhis, elinde doğru bilgi olmayan teknik soru). "cevap" alanına müşteriye kısa ve nazik bir yönlendirme cümlesi yaz.
- "konu_disi": soru tarım, bahçe ve mağazayla ilgisiz; kibarca yalnız bu konularda yardımcı olabildiğini yaz.
"emin" alanı: cevabındaki her bilgi ya "Doğrulanmış bilgi"de geçiyorsa ya da kimseyi yanıltmayacak kadar temel, herkesçe kabul gören bahçe bilgisiyse (ör. "fesleğen güneşli yer sever") true; en küçük bir şüphen varsa false.

Cevabı yalnız istenen JSON biçiminde ver: "cevap" müşteriye gösterilecek metin; "urunler" listeden seçtiğin ürünlerin kodları (en fazla 3, uygun yoksa boş); "durum"; "emin".`;
}
// ---------- Listede olmayan bitkinin toprak profili ----------
// Ayrı ve dikkatli bir sorgu (config.json > soilMatch.plants ile aynı ölçek). İki bağımsız cevap alınır; ikisi de bitkiyi
// emin şekilde tanımalı, aynı grupta ve her özellikte en çok 1 adım farkla anlaşmalı; ayrıca bitki bilgisine aykırı
// (kumlu ama çok nem isteyen sukulent gibi) profiller reddedilir. Geçmezse kart verilmez, normal cevap akışı sürer.
const GRUP_AI = ['Salon', 'Sukulent', 'Çiçek', 'Asit seven', 'Aromatik', 'Meyve', 'Sebze', 'Bahçe', 'Su bitkisi'];
const BITKI = {
  type: 'object',
  properties: {
    taninan: { type: 'boolean' },
    ad: { type: 'string' },
    latince: { type: 'string' },
    guven: { type: 'string', enum: ['yuksek', 'orta', 'dusuk'] },
    ph_min: { type: 'integer', enum: [1, 2, 3, 4] },
    ph_max: { type: 'integer', enum: [1, 2, 3, 4] },
    drenaj: { type: 'integer', enum: [1, 2, 3] },
    su: { type: 'integer', enum: [1, 2, 3] },
    besin: { type: 'integer', enum: [1, 2, 3] },
    yapi: { type: 'string', enum: ['k', 'h', 'd'] },
    grup: { type: 'string', enum: GRUP_AI },
    aciklama: { type: 'string' },
  },
  required: ['taninan', 'ad', 'latince', 'guven', 'ph_min', 'ph_max', 'drenaj', 'su', 'besin', 'yapi', 'grup', 'aciklama'],
  additionalProperties: false,
};
const BITKI_SISTEM = `Sen saksı ve bahçe bitkilerinin toprak ihtiyaçlarını çok iyi bilen bir ziraat uzmanısın. Müşterinin sorusundaki bitkiyi belirleyip sevdiği toprağı aşağıdaki ölçekle tanımlarsın. Cevabın bir toprak karışımı tarifine dönüşecek; yanlış profil bitkiye zarar verir, bu yüzden dikkatli ol.

Bitkiyi belirle: Türkçe yaygın adı, yöresel adı, yazım hatalı ya da sesle yazılmış hali olabilir ("bengovil" = begonvil). Aynı adla birden çok bitki biliniyorsa Türkiye'de saksıda ya da bahçede en çok yetiştirileni seç. "latince": bitkinin bilimsel adı (cins ve tür; tür belirsizse cins).

Ölçek:
- "ph_min" / "ph_max" (sevdiği pH aralığı): 1 asidik (pH 5,5 altı), 2 hafif asidik (5,5–6,5), 3 nötr (6,5–7,5), 4 kireçli (7,5 üstü).
- "drenaj" (toprağın suyu ne kadar hızlı süzmesi gerekir): 1 orta, 2 yüksek, 3 çok yüksek.
- "su" (toprağın nemi ne kadar tutması gerekir): 1 az (iki sulama arası kurumalı), 2 orta, 3 çok (hep nemli kalmalı).
- "besin": 1 az, 2 orta, 3 zengin.
- "yapi": "k" kumlu-mineralli (kaktüs, Akdeniz bitkisi), "h" havalı-lifli (tropikal salon bitkisi, epifit), "d" dengeli.
- "grup": listeden bitkiye en yakın olanı.

Doğrulanmış örnekler (ph_min ph_max drenaj su besin yapi grup):
Monstera 2 3 3 2 2 h Salon; Philodendron 2 2 3 2 2 h Salon; Zamioculcas 2 3 3 1 1 h Salon; Eğrelti otu 2 2 2 3 2 h Salon; Avokado 2 2 3 2 2 h Meyve;
Kaktüs 2 3 3 1 1 k Sukulent; Aloe vera 2 3 3 1 1 k Sukulent; Begonvil 2 2 3 1 2 k Çiçek; Sardunya 2 3 3 1 2 k Çiçek; Gül 2 2 2 2 3 d Çiçek; Petunya 2 3 2 2 3 d Çiçek;
Ortanca 1 2 2 2 2 d Asit seven; Açelya 1 1 2 2 2 d Asit seven; Yaban mersini 1 1 2 2 2 d Asit seven;
Lavanta 3 4 3 1 1 k Aromatik; Biberiye 3 3 3 1 1 k Aromatik; Fesleğen 2 3 2 2 2 d Aromatik; Nane 2 3 2 3 2 d Aromatik;
Limon 2 3 3 2 3 d Meyve; Zeytin 3 4 3 1 1 k Meyve; Çilek 2 2 2 2 3 d Meyve; Domates 2 3 2 2 3 d Sebze; Çim 2 3 2 2 2 d Bahçe; Mor salkım 2 3 2 2 2 d Bahçe; Nilüfer 2 3 1 3 3 d Su bitkisi.

"guven": bu bitkinin toprak ihtiyacını iyi biliyorsan "yuksek"; genel olarak biliyorsan "orta"; tahmin ediyorsan "dusuk".
Soruda bitki yoksa ya da bitkiyi tanımıyorsan "taninan": false yaz (diğer alanlara listeden herhangi bir değer).
"ad": bitkinin yaygın Türkçe adı (ilk harfi büyük). "aciklama": bitkinin nasıl bir toprak sevdiğini sade Türkçeyle, "siz" diye hitap ederek 1–2 kısa cümle; rakam, ürün ya da marka adı yazma.`;
// Modelin bitki profili → { ad, prof: "23322h", grup, aciklama } ya da null (tanınmadı / emin değil / tutarsız)
export function bitkiProfil(b) {
  if (!b || b.taninan !== true || !/^(yuksek|orta)$/.test(b.guven || '') || String(b.latince || '').trim().length < 3) return null;
  const ad = String(b.ad || '').replace(/[^\p{L}\p{N} '-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const n = [b.ph_min, b.ph_max, b.drenaj, b.su, b.besin];
  if (ad.length < 3 || !n.every((x) => Number.isInteger(x)) || !/^[khd]$/.test(b.yapi) || !GRUP_AI.includes(b.grup)) return null;
  const [p1, p2] = [Math.min(n[0], n[1]), Math.max(n[0], n[1])], [, , dr, su] = n;
  // Bitki bilgisine aykırı profiller
  if (p2 - p1 > 2 || (b.yapi === 'k' && su === 3) || (b.grup === 'Sukulent' && (b.yapi !== 'k' || su > 1 || dr < 2)) ||
    (b.grup === 'Asit seven' && p2 > 2) || (b.grup === 'Su bitkisi' && su < 3) || (b.yapi === 'h' && dr < 2)) return null;
  const prof = `${p1}${p2}${n[2]}${n[3]}${n[4]}${b.yapi}`;
  if (!/^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(prof)) return null;
  const aciklama = String(b.aciklama || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { ad: ad[0].toLocaleUpperCase('tr-TR') + ad.slice(1), prof, grup: b.grup, latince: String(b.latince).trim().slice(0, 60), aciklama };
}
// İki bağımsız profil aynı bitkiyi ve yakın değerleri gösteriyor mu
export function bitkiUyum(a, b) {
  if (!a || !b || a.grup !== b.grup || a.prof[5] !== b.prof[5]) return null;
  const cins = (x) => x.latince.toLocaleLowerCase('en').split(/\s+/)[0];
  if (cins(a) !== cins(b)) return null;
  for (let i = 0; i < 5; i++) if (Math.abs(+a.prof[i] - +b.prof[i]) > 1) return null;
  return a;
}
async function bitkiSor(env, key, q) {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 25000 });
  const bir = () => client.beta.messages.create({
    model: env.AK_MODEL || MODEL,
    max_tokens: 1500,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: BITKI } },
    system: [{ type: 'text', text: BITKI_SISTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Müşterinin sorusu: ${q}` }],
  }).then((m) => {
    const u = m.usage || {};
    let o = null;
    if (m.stop_reason !== 'refusal' && m.stop_reason !== 'max_tokens') { try { o = JSON.parse(m.content.filter((x) => x.type === 'text').map((x) => x.text).join('')); } catch { o = null; } }
    return { b: bitkiProfil(o), giris: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), cikis: u.output_tokens || 0 };
  });
  const [x, y] = await Promise.all([bir(), bir()]);
  return { b: bitkiUyum(x.b, y.b), giris: x.giris + y.giris, cikis: x.cikis + y.cikis };
}
const SCHEMA = {
  type: 'object',
  properties: {
    cevap: { type: 'string' },
    urunler: { type: 'array', items: { type: 'string' } },
    durum: { type: 'string', enum: ['cevap', 'yonlendir', 'konu_disi'] },
    emin: { type: 'boolean' },
  },
  required: ['cevap', 'urunler', 'durum', 'emin'],
  additionalProperties: false,
};

// Bağlam: en yakın havuz cevapları (doğrulanmış) + onlardaki ürünler + soruda adı geçen ürünler
function context(q, near, products, F) {
  // Toprak sorusu: gübre cevapları bilgi olarak verilmez (yapay zekâ toprak yerine gübre önermesin); toprak rehberi,
  // grupların hazır toprakları ve "Kendi Toprak Karışımını Oluştur" önerilebilir ürünlere eklenir
  const toprak = TOPRAK_SORUSU.test(norm(q));
  if (toprak) near = near.filter((x) => !/^(bitki-doz|gubre-genel)$/.test(x.e.t));
  const byS = new Map(products.map((p) => [p.s, p]));
  // Maliyet: en yakın 3 cevap, her biri en fazla ~900 karakter (rakamlar ve kaynak satırı genelde baştadır)
  const facts = near.filter((x) => x.sc >= 0.35).slice(0, toprak ? 2 : 3).map((x) => (x.e.c.length > 900 ? x.e.c.slice(0, 900) + '…' : x.e.c));
  if (toprak) facts.push(rehberMetni(byS, F));
  const slugs = new Set();
  if (toprak) [OZEL_KARISIM, ...new Set(GRUPLAR.flatMap((g) => g.hazir)), 'tarim-perliti', 'hg-asidik-torf'].forEach((s) => slugs.add(s));
  near.slice(0, 4).forEach((x) => x.e.u.forEach((s) => slugs.add(s)));
  const qt = toks(q);
  products.map((p) => ({ p, h: toks(p.n).filter((t) => qt.includes(t)).length })).filter((x) => x.h >= 1)
    .sort((a, b) => b.h - a.h).slice(0, 6).forEach((x) => slugs.add(x.p.s));
  const list = [...slugs].map((s) => byS.get(s)).filter((p) => p && p.st).slice(0, toprak ? 14 : 10);
  return { facts, list };
}
export function userMessage(q, ctx, page) {
  return `Doğrulanmış bilgi:\n${ctx.facts.length ? ctx.facts.map((f, i) => `[${i + 1}] ${f}`).join('\n\n') : '(yok)'}\n\n` +
    `Önerilebilecek ürünler (kod — ad):\n${ctx.list.length ? ctx.list.map((p) => `${p.s} — ${p.n}`).join('\n') : '(yok)'}\n\n` +
    (page ? `Müşterinin bulunduğu ürün sayfası: ${page}\n\n` : '') +
    `Müşterinin sorusu: ${q}`;
}

async function askClaude(env, key, name, q, ctx, page) {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 25000 });
  const msg = await client.beta.messages.create({
    model: env.AK_MODEL || MODEL,
    max_tokens: 2500,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    // Uzun ve sabit sistem talimatı önbelleğe alınır (her soruda yeniden ücretlendirilmesin)
    system: [{ type: 'text', text: systemPrompt(name), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage(q, ctx, page) }],
  });
  if (msg.stop_reason === 'refusal') return { refused: true, usage: msg.usage };
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { return { error: 'json', usage: msg.usage }; }
  if (msg.stop_reason === 'max_tokens' || typeof out.cevap !== 'string' || !out.cevap.trim()) return { error: 'kesik', usage: msg.usage };
  const allowed = new Set(ctx.list.map((p) => p.s));
  return { cevap: out.cevap.trim(), urunler: (out.urunler || []).filter((s) => allowed.has(s)).slice(0, 3), durum: out.durum || 'cevap', emin: !!out.emin, usage: msg.usage, model: msg.model };
}

// ---------- Veritabanı ----------
let dbReady = false;
export async function initDb(db) {
  if (dbReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS ak_soru (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, q TEXT NOT NULL, qn TEXT NOT NULL, kaynak TEXT NOT NULL, havuz TEXT, skor REAL, cevap TEXT, urunler TEXT, durum TEXT, site TEXT, sayfa TEXT, giris INTEGER, cikis INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ak_soru_durum ON ak_soru (durum, ts)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ak_gun (d TEXT PRIMARY KEY, n INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ak_oy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, q TEXT NOT NULL, kaynak TEXT, havuz TEXT, oy INTEGER NOT NULL, site TEXT)'),
  ]);
  dbReady = true;
}
// Eskimiş bilgi içeren eski Claude cevapları tekrar verilmez: solucan gübresinin harca karışım oranı blogla aynı
// %10–20 oldu (fidede en fazla %10); eski tablodaki "%40–50" geçen solucan gübresi cevapları atlanır
const ESKI = (c) => /solucan/i.test(c) && /%\s?40\s?[–-]\s?50|40\s?[–-]\s?50\s?%/.test(c);
// Onaylanmış Claude cevapları havuza eklenir (5 dakikada bir tazelenir)
let APPROVED = { t: 0, list: [] };
async function approved(db) {
  if (Date.now() - APPROVED.t < 300000) return APPROVED.list;
  const { results } = await db.prepare("SELECT id, q, cevap, urunler FROM ak_soru WHERE durum = 'onaylandi' ORDER BY id DESC LIMIT 2000").all();
  APPROVED = { t: Date.now(), list: results.filter((r) => !ESKI(r.cevap || '')).map((r) => ({ i: 'o' + r.id, t: 'onayli', s: [r.q], c: r.cevap, u: JSON.parse(r.urunler || '[]') })) };
  return APPROVED.list;
}

// POST /ak/oy {q, k (kaynak), h (havuz id), oy: 1|0}: müşterinin "işinize yaradı mı" oyu. Olumsuz oylar incelenip
// havuz/kurallar düzeltilir.
export async function vote(req, env, okOrigin) {
  if (!okOrigin || !env.DB) return json({ ok: false }, okOrigin ? 200 : 403);
  let b; try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  const q = String(b.q || '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
  if (q.length < 3 || (b.oy !== 1 && b.oy !== 0)) return json({ ok: false }, 400);
  await initDb(env.DB).catch(() => {});
  await env.DB.prepare('INSERT INTO ak_oy (ts, q, kaynak, havuz, oy, site) VALUES (?,?,?,?,?,?)')
    .bind(new Date().toISOString(), q, String(b.k || '').slice(0, 20), /^[ho]\d{1,6}$/.test(b.h || '') ? b.h : null, b.oy, /^[a-z]{1,20}$/.test(b.s || '') ? b.s : 'hasturk').run().catch(() => {});
  return json({ ok: true });
}

// GET /ak/sayac: bugün ve son 7 gün kaç soru havuzdan / Claude'dan cevaplandı, Claude token kullanımı ve tahmini maliyet.
// Soru metni gösterilmez (yalnız sayılar).
// Konum: cevabın hangi Cloudflare merkezinden döndüğü ve veritabanının (D1) hangi bölgede çalıştığı.
// Ziyaretçinin kendi konumu yalnız kendisine gösterilir, kaydedilmez.
const MERKEZ = { IST: 'İstanbul', ADB: 'İzmir', ESB: 'Ankara', SOF: 'Sofya', OTP: 'Bükreş', ATH: 'Atina', FRA: 'Frankfurt', AMS: 'Amsterdam', LHR: 'Londra', CDG: 'Paris', VIE: 'Viyana', MXP: 'Milano', WAW: 'Varşova', ARN: 'Stockholm', DME: 'Moskova', TLV: 'Tel Aviv', IAD: 'Washington (ABD)', ORD: 'Chicago (ABD)', DFW: 'Dallas (ABD)', SJC: 'San Jose (ABD)', LAX: 'Los Angeles (ABD)', SEA: 'Seattle (ABD)', ATL: 'Atlanta (ABD)', EWR: 'New York (ABD)' };
const BOLGE = { EEUR: 'Doğu Avrupa', WEUR: 'Batı Avrupa', ENAM: 'Kuzey Amerika doğu', WNAM: 'Kuzey Amerika batı', APAC: 'Asya-Pasifik', OC: 'Okyanusya', ME: 'Orta Doğu', AF: 'Afrika' };
export async function konum(req, env) {
  const cf = req.cf || {}, out = { ok: true, cevap_merkezi: cf.colo ? `${cf.colo}${MERKEZ[cf.colo] ? ' — ' + MERKEZ[cf.colo] : ''}` : null, sizin_ulke: cf.country || null, havuz: 'Bilge Bey programının içinde (bu merkezde çalışır)' };
  if (env.DB) {
    const t0 = Date.now();
    try {
      const r = await env.DB.prepare('SELECT 1 AS x').all(), m = r.meta || {};
      out.veritabani = { bolge: m.served_by_region ? `${m.served_by_region}${BOLGE[m.served_by_region] ? ' — ' + BOLGE[m.served_by_region] : ''}` : null, ana_kopya: m.served_by_primary ?? null, merkez: m.served_by_colo || null, sql_ms: m.timings ? m.timings.sql_duration_ms : (m.duration ?? null), toplam_ms: Date.now() - t0 };
    } catch (e) { out.veritabani = { hata: true }; }
  }
  return json(out);
}

export async function sayac(env) {
  if (!env.DB) return json({ ok: false, why: 'db' });
  await initDb(env.DB).catch(() => {});
  const gun = today(), hafta = new Date(Date.now() + 3 * 3600e3 - 7 * 864e5).toISOString().slice(0, 10);
  const q = (since) => env.DB.prepare("SELECT kaynak, COALESCE(durum,'') AS durum, COUNT(*) AS n, SUM(COALESCE(giris,0)) AS giris, SUM(COALESCE(cikis,0)) AS cikis FROM ak_soru WHERE substr(ts,1,10) >= ? GROUP BY kaynak, durum").bind(since).all().then((r) => r.results);
  const oy = await env.DB.prepare('SELECT oy, COUNT(*) AS n FROM ak_oy GROUP BY oy').all().then((r) => r.results).catch(() => []);
  const [b, h] = await Promise.all([q(gun), q(hafta)]);
  const ozet = (rows) => {
    const ai = rows.filter((r) => r.kaynak === 'ai'), giris = ai.reduce((a, r) => a + r.giris, 0), cikis = ai.reduce((a, r) => a + r.cikis, 0);
    return { satir: rows, toplam: rows.reduce((a, r) => a + r.n, 0), havuz: rows.filter((r) => r.kaynak === 'havuz' || r.kaynak === 'havuz-ai').reduce((a, r) => a + r.n, 0),
      claude: ai.reduce((a, r) => a + r.n, 0), giris, cikis, tahmini_usd: +((giris * 4 + cikis * 20) / 1e6).toFixed(3) };
  };
  return json({ ok: true, bugun: ozet(b), son7: ozet(h), oylar: oy, model: env.AK_MODEL || MODEL, gunluk_sinir: Number(env.AK_DAILY_LIMIT) || DAILY_LIMIT });
}

// GET /ak/populer: son 30 günde havuzdan en çok cevaplanan sorular (öne çıkan sorular; en az 3 kez sorulmuş olmalı)
let POP = { t: 0, list: [] };
let HAVUZ_I = null;
export async function populer(env) {
  if (Date.now() - POP.t < 600000) return json({ ok: true, sorular: POP.list });
  let list = [];
  if (env.DB) {
    await initDb(env.DB).catch(() => {});
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { results } = await env.DB.prepare("SELECT havuz, COUNT(*) AS n FROM ak_soru WHERE kaynak = 'havuz' AND ts >= ? GROUP BY havuz HAVING n >= 3 ORDER BY n DESC LIMIT 14")
      .bind(since).all().catch(() => ({ results: [] }));
    // Müşterinin yazdığı metin herkese gösterilmez (ad, telefon vb. içerebilir): aynı hazır cevabın kendi soru kalıbı
    // gösterilir. Havuz yeniden üretilince kimlik değişebilir; bulunamayan atlanır, aynı soru iki kez görünmez.
    if (!HAVUZ_I) HAVUZ_I = new Map(HAVUZ.map((e) => [e.i, e]));
    const gor = new Set();
    list = results.map((r) => { const e = HAVUZ_I.get(r.havuz); return e && e.s && e.s[0] ? String(e.s[0]).slice(0, 80) : ''; })
      .map((q) => q.charAt(0).toLocaleUpperCase('tr-TR') + q.slice(1)).filter((q) => q.length >= 6 && !gor.has(norm(q)) && gor.add(norm(q))).slice(0, 6);
  }
  POP = { t: Date.now(), list };
  return json({ ok: true, sorular: list });
}

// Claude'un daha önce verdiği (müşteriye gösterilen, olumsuz oy almamış) cevaplar: aynı ya da neredeyse aynı soru
// tekrar gelirse Claude'a gitmeden bu cevap verilir (sezonda maliyet birikmesin). 5 dakikada bir tazelenir.
let RECENT = { t: 0, list: [], byQn: new Map() };
async function recentAi(db) {
  if (Date.now() - RECENT.t < 300000) return RECENT;
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { results } = await db.prepare("SELECT s.id, s.q, s.qn, s.cevap, s.urunler FROM ak_soru s WHERE s.kaynak = 'ai' AND s.durum = 'onay-bekliyor' AND s.ts >= ? " +
    "AND NOT EXISTS (SELECT 1 FROM ak_oy o WHERE o.q = s.q AND o.oy = 0) ORDER BY s.id DESC LIMIT 3000").bind(since).all();
  const list = [], byQn = new Map();
  for (const r of results) {
    if (byQn.has(r.qn) || ESKI(r.cevap || '')) continue;
    const e = { i: 'a' + r.id, t: 'ai-kayit', s: [r.q], c: r.cevap, u: JSON.parse(r.urunler || '[]') };
    byQn.set(r.qn, e); list.push(e);
  }
  RECENT = { t: Date.now(), list, byQn };
  return RECENT;
}

// Yapay zekânın tanıdığı bitkiler (ak_soru'da durum 'bitki-ai', havuz "bitki2:Ad|23322h|Grup"; çift sorguyla doğrulanmış): aynı bitki tekrar
// sorulunca Claude'a gidilmeden toprak kartı verilir. Olumsuz oy alanlar atlanır. 5 dakikada bir tazelenir.
let BITKI_AI = { t: 0, list: [] };
async function bitkiKayit(db) {
  if (Date.now() - BITKI_AI.t < 300000) return BITKI_AI.list;
  const { results } = await db.prepare("SELECT s.havuz, s.cevap FROM ak_soru s WHERE s.durum = 'bitki-ai' AND s.havuz LIKE 'bitki2:%' " +
    "AND NOT EXISTS (SELECT 1 FROM ak_oy o WHERE o.q = s.q AND o.oy = 0) ORDER BY s.id DESC LIMIT 2000").all();
  const seen = new Set(), list = [];
  for (const r of results) {
    const [ad, prof, grup] = String(r.havuz).slice(7).split('|'), k = norm(ad);
    if (!k || seen.has(k) || !/^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(prof || '')) continue;
    seen.add(k);
    list.push({ ad, prof, grup, cevap: r.cevap, w: k.split(' ').filter((w) => w.length >= 3) });
  }
  BITKI_AI = { t: Date.now(), list: list.filter((x) => x.w.length) };
  return BITKI_AI.list;
}

const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Türkiye saati
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });

// "Domates tohumu çeşitleri neler", "hangi çiçek tohumları var": stoktaki çeşitlerden en çok ilgi görenler (3 ürün) ve
// widget'ın altına koyduğu "Tüm çeşitleri gör" araması (ara). Ücretsiz; Claude'a gidilmez. Sorudaki her anlamlı kelime
// ürün adında geçmeli (kök eşleşmesi); en az 2 stoklu çeşit yoksa havuz / Claude devam eder.
const CESIT_RE = /çeşit|cesit|türleri|turleri|neler var|nelerdir|hangi .{2,40}\bvar\b|var m[ıi]|seçenek|secenek/i;
const CESIT_DUR = new Set(['cesit', 'cesitleri', 'cesitler', 'cesidi', 'cesidiniz', 'cesitleriniz', 'neler', 'nelerdir', 'hangi', 'hangileri', 'ne', 'neleriniz', 'turleri',
  'turler', 'turu', 'secenek', 'secenekleri', 'secenekler', 'olan', 'urun', 'urunler', 'urunleriniz', 'satiyor', 'sitenizde', 'elinizde', 'mevcut', 'kac', 'tane',
  'sizin', 'tum', 'butun', 'neydi', 'var', 'mi', 'mu', 'sizde', 'bir', 've', 'ile', 'satisi', 'satiyormusunuz', 'listesi']);
export function cesitAnswer(q, prods) {
  if (!CESIT_RE.test(q) || !prods || !prods.length) return null;
  const w = norm(q).split(' ').filter((t) => t.length >= 3 && !CESIT_DUR.has(t) && !FILL.has(t));
  if (!w.length || w.length > 3) return null;
  // Kök: son harf düşer (çiçek → çiçeği, saksı → saksısı), en çok 5 harf
  const st = w.map((t) => t.slice(0, t.length <= 3 ? 3 : Math.min(5, t.length - 1)));
  // "saksı" sorusunda "saksı toprağı" gibi başka türün adı geçen ürünler sayılmaz (kelimeden sonra tür adı geliyorsa)
  const TUR = ['topra', 'gubre', 'besin', 'ilac', 'altli', 'tabag', 'karis'];
  const uyar = (p) => {
    const ws = norm(p.n).split(' ');
    return st.every((x) => ws.some((y, i) => y.startsWith(x) && !(ws[i + 1] && TUR.some((k) => ws[i + 1].startsWith(k) && !st.some((z) => z.startsWith(k.slice(0, 4)))))));
  };
  const hit = prods.filter((p) => p.st > 0 && uyar(p));
  if (hit.length < 2) return null;
  hit.sort((a, b) => (b.h || 0) - (a.h || 0));
  // Arama ifadesi ürün adındaki tam kelimelerle ("tohumları" değil "Tohumu"): widget araması aynı ürünleri bulsun
  const ad = hit[0].n.replace(/\s*\([^)]*\)/g, ' ').split(/\s+/);
  const ara = st.map((x) => ad.find((y) => norm(y).startsWith(x)) || x).join(' ').toLocaleLowerCase('tr-TR');
  const kw = String(q).toLocaleLowerCase('tr-TR').split(/[^\p{L}\p{N}]+/u).filter((t) => w.includes(norm(t))).join(' ') || ara;
  const konu = kw.charAt(0).toLocaleUpperCase('tr-TR') + kw.slice(1);
  return { i: 'liste', t: 'liste', c: `${konu} için stokta ${hit.length} çeşidimiz var. En çok tercih edilenler aşağıda; hepsini "Tüm çeşitleri gör" ile listeleyebilirsiniz.`, u: hit.slice(0, 3).map((p) => p.s), ara, n: hit.length };
}

// POST /ak  {q, p (ürün sayfası adresi), s (site), n (asistan adı)}
// Bitki sorunu cevabında önerilen ürünler canlı stoğa göre süzülür: stokta olmayan (ya da bu sitede olmayan) ürün listeden
// çıkar (eski biçimdeki "• Ad — fayda" satırı da); hiç ürün kalmazsa "ürünler aşağıda" cümlesi / başlık da kalkar
export function stokSuz(e, prods) {
  if (e.d !== 'sorun' || !e.un || !prods || !prods.length) return e;
  const st = new Map(prods.map((p) => [p.s, p]));
  const yok = new Set(e.u.filter((s) => !(st.get(s) || {}).st));
  if (!yok.size) return e;
  const adlar = e.u.map((s, i) => (yok.has(s) ? e.un[i] : null)).filter(Boolean);
  let c = e.c.split('\n').filter((l) => !adlar.some((n) => l.startsWith('• ' + n + ' — '))).join('\n');
  c = c.replace(/\n\nSitemizde işinize yarayacaklar:(?=\n\n|$)/, '');
  const u = e.u.filter((s) => !yok.has(s));
  if (!u.length) c = c.replace(/\n\nİşinize yarayacak ürünler aşağıda\./, '');
  return { ...e, c, u };
}

export async function handle(req, env, ctx, { aiKey, originOk, products, formul }) {
  if (!originOk) return json({ ok: false, why: 'origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, why: 'json' }, 400); }
  const q = String(body.q || '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
  if (q.length < 3) return json({ ok: false, why: 'kisa' }, 400);
  const page = /^[a-z0-9-]{1,140}$/.test(body.p || '') ? body.p : null;
  const site = /^[a-z0-9-]{1,30}$/.test(body.s || '') ? body.s : 'hasturk';
  const name = String(body.n || 'Bilge Bey').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 30) || 'Bilge Bey';
  const db = env.DB;
  const prods = await products().catch(() => []);
  const pageName = page ? ((prods.find((p) => p.s === page) || {}).n || '') : '';
  // Veritabanının ana kopyası uzakta (ABD) olabilir: hazır cevap onu beklemeden verilir. Önce havuz + bellekteki onaylı
  // cevaplarla bakılır; bulunamazsa veritabanı beklenip onaylı liste tazelenerek tekrar bakılır.
  const ready = db ? initDb(db).catch(() => {}) : Promise.resolve();
  const tryPool = (extra) => {
    let { hit, near } = poolAnswer(q, { extra, product: page, productName: pageName });
    // Ürün sayfasında "nasıl kullanılır / ne işe yarar / dozu / özellikleri" gibi sorular o ürünün havuz cevabından gelir
    // (soru ürün adını tam içermese de; Claude'a gidip para harcamasın)
    if (!hit && page && /kullan|işe yar|ise yar|nedir|özellik|ozellik|doz|miktar|nasıl|nasil|kaç litre|kac litre|ölçü|olcu|ekilir/i.test(q)) {
      const pe = HAVUZ.find((e) => e.p === page && (e.t === 'urun' || e.t === 'saksi' || e.t === 'pompa'));
      if (pe && !toks(q).some((t) => t.length >= 4 && !toks(pageName + ' nasıl kullanılır ne işe yarar nedir özellikleri dozu kullanım miktarı kaç litre ölçüleri ne zaman ekilir bu ürün urun').includes(t) && (IDX && IDX.idf.get(t) || 0) > 6)) hit = { e: pe, sc: 0.75 };
    }
    return { hit, near };
  };
  const ce = cesitAnswer(q, prods);
  if (ce) {
    if (body.on !== 1 && db && req.headers.get('x-ak-test') !== '1') ctx.waitUntil(ready.then(() => db.prepare('INSERT INTO ak_soru (ts, q, qn, kaynak, havuz, site, sayfa) VALUES (?,?,?,?,?,?,?)')
      .bind(new Date().toISOString(), q, norm(q), 'havuz', 'liste', site, page).run()).catch(() => {}));
    return json({ ok: true, kaynak: 'havuz', id: ce.i, tur: 'liste', cevap: ce.c, urunler: ce.u, ara: ce.ara, n: ce.n });
  }
  let { hit, near } = tryPool(APPROVED.t ? APPROVED.list : []);
  // Bitkiye toprak sorusu (yazım hatası, "hazırlar mısın" gibi karışım isteği dahil): bitkinin toprak kartı
  const tn = toprakNiyet(q);
  if (tn && (tn.kendim || !hit || hit.e.t === 'bitki-toprak') && body.on !== 1) {
    const e = tn.e, ad = e.b.split(',')[0].trim();
    if (db && req.headers.get('x-ak-test') !== '1') ctx.waitUntil(ready.then(() => db.prepare('INSERT INTO ak_soru (ts, q, qn, kaynak, havuz, site, sayfa) VALUES (?,?,?,?,?,?,?)')
      .bind(new Date().toISOString(), q, norm(q), 'havuz', e.i, site, page).run()).catch(() => {}));
    return json({ ok: true, kaynak: 'havuz', id: e.i, tur: e.t, dinamik: 'toprak', bitki: e.b, kendim: tn.kendim, urunler: e.u,
      cevap: tn.kendim ? `${ad} için karışımınızı hazırladım; tarif ve fiyatı aşağıda. "Bu tarifle hazırlat"a dokunursanız bileşenler tek seferde sepete eklenir; litreyi değiştirebilirsiniz.` : e.c });
  }
  // Önden yükleme (on: 1): Bilge Bey'in öneri düğmelerinin cevabı müşteri dokunmadan arkada alınır. Yalnız hazır havuz;
  // Claude'a gidilmez, veritabanı beklenmez, kayda geçmez (müşteri dokununca asıl istek ayrıca gelir ve sayılır).
  if (body.on === 1) {
    if (!hit) return json({ ok: false, why: 'yok' });
    const e = stokSuz(hit.e, prods);
    return json({ ok: true, kaynak: 'havuz', id: e.i, tur: e.t, cevap: e.c, urunler: e.u, dinamik: e.d || null, bitki: e.b || null });
  }
  if (!hit && db) {
    await ready;
    const extra = await approved(db).catch(() => []);
    if (extra.length) ({ hit, near } = tryPool(extra));
  } else if (db && Date.now() - APPROVED.t >= 300000) ctx.waitUntil(ready.then(() => approved(db)).catch(() => {}));
  // Canlı kontrol testleri (X-Ak-Test: 1) kayda geçmez: sayaç ve 'en çok sorulanlar' gerçek müşterileri göstersin
  const test = req.headers.get('x-ak-test') === '1';
  const log = (o) => db && !test && ctx.waitUntil(ready.then(() => db.prepare('INSERT INTO ak_soru (ts, q, qn, kaynak, havuz, skor, cevap, urunler, durum, site, sayfa, giris, cikis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(new Date().toISOString(), q, norm(q), o.kaynak, o.havuz || null, o.skor ?? null, o.cevap || null, JSON.stringify(o.urunler || []), o.durum || null, site, page, o.giris ?? null, o.cikis ?? null).run()).catch(() => {}));

  if (hit) {
    log({ kaynak: 'havuz', havuz: hit.e.i, skor: hit.sc });
    const e = stokSuz(hit.e, prods);
    return json({ ok: true, kaynak: 'havuz', id: e.i, tur: e.t, cevap: e.c, urunler: e.u, dinamik: e.d || null, bitki: e.b || null });
  }
  // Listede olmayan bitkiye toprak sorusu: yapay zekâ bitkiyi tanıyıp toprak profilini verir, widget bununla toprak
  // kartını (en yakın hazır toprak + HG formülünden uyarlanan tarif + sepete ekleme) gösterir. Aynı bitki tekrar
  // sorulursa kayıttan, ücretsiz.
  const kendim = KENDIM.test(norm(q));
  const kart = (b, cevap, tekrar) => json({ ok: true, kaynak: 'ai', ...(tekrar ? { tekrar: true } : {}), dinamik: 'toprak', bitki: b.ad, prof: b.prof, grup: b.grup, kendim,
    cevap: kendim ? `${b.ad} için karışımınızı hazırladım; tarif ve fiyatı aşağıda. "Bu tarifle hazırlat"a dokunursanız bileşenler tek seferde sepete eklenir; litreyi değiştirebilirsiniz.` : cevap, urunler: [] });
  if (db && toprakOk(norm(q))) {
    const b = bitkiBul(q, await bitkiKayit(db).catch(() => []));
    if (b) {
      log({ kaynak: 'havuz-ai', havuz: `bitki2:${b.ad}|${b.prof}|${b.grup}` });
      return kart(b, b.cevap, true);
    }
  }
  // Daha önce Claude'un cevapladığı aynı soru: kayıttan, ücretsiz
  if (db) {
    const R = await recentAi(db).catch(() => null);
    if (R && R.list.length) {
      let e = R.byQn.get(norm(q));
      if (!e) { const m = match(q, { extra: R.list, top: 3 }).find((x) => x.e.t === 'ai-kayit' && x.sc >= 0.9 && x.cp >= 0.9 && x.cq >= 0.9); if (m) e = m.e; }
      if (e) {
        log({ kaynak: 'havuz-ai', havuz: e.i });
        return json({ ok: true, kaynak: 'ai', tekrar: true, cevap: e.c, urunler: e.u });
      }
    }
  }
  // Claude: anahtar yoksa, kapalıysa ya da günlük sınır dolduysa "bilmiyorum + müşteri hizmetleri"
  const limit = Number(env.AK_DAILY_LIMIT) || DAILY_LIMIT;
  const off = !aiKey || env.AK_AI === 'off';
  let used = 0;
  if (!off && db) {
    const r = await db.prepare('INSERT INTO ak_gun (d, n) VALUES (?, 1) ON CONFLICT (d) DO UPDATE SET n = n + 1 RETURNING n').bind(today()).first().catch(() => null);
    used = r ? r.n : 0;
  }
  if (off || !db || used > limit) {
    log({ kaynak: 'yok', skor: near[0] ? near[0].sc : null, durum: 'cevapsiz' });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: off ? 'kapali' : 'sinir' });
  }
  // Listede olmayan bitkiye toprak sorusu: önce bitkinin toprak profili (ayrı, dikkatli sorgu). Tanınırsa toprak kartı
  // verilir (genel cevaba gidilmez); tanınmazsa normal akış sürer.
  if (toprakOk(norm(q))) {
    const pb = await bitkiSor(env, aiKey, q).catch(() => null);
    if (pb && pb.b) {
      const b = pb.b, cevap = b.aciklama || `${b.ad} için toprak önerimiz aşağıda.`;
      log({ kaynak: 'ai', havuz: `bitki2:${b.ad}|${b.prof}|${b.grup}`, skor: near[0] ? near[0].sc : null, cevap, durum: 'bitki-ai', giris: pb.giris, cikis: pb.cikis });
      if (!test) BITKI_AI.list.unshift({ ...b, cevap, w: norm(b.ad).split(' ').filter((w) => w.length >= 3) });
      return kart(b, cevap);
    }
  }
  const c = context(q, near, prods, formul ? await formul().catch(() => null) : null);
  let r;
  try { r = await askClaude(env, aiKey, name, q, c, pageName); }
  catch (e) {
    log({ kaynak: 'hata', skor: near[0] ? near[0].sc : null, cevap: String(e && e.status || e && e.message || e).slice(0, 200), durum: 'cevapsiz' });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: 'hata' });
  }
  if (!r.cevap) {
    log({ kaynak: r.refused ? 'red' : 'hata', durum: 'cevapsiz', giris: r.usage && r.usage.input_tokens, cikis: r.usage && r.usage.output_tokens });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: r.refused ? 'red' : 'hata' });
  }
  const tok = { giris: r.usage && (r.usage.input_tokens + (r.usage.cache_read_input_tokens || 0) + (r.usage.cache_creation_input_tokens || 0)), cikis: r.usage && r.usage.output_tokens };
  // Yönlendirme ve konu dışı: modelin kısa cümlesi + iletişim düğmeleri
  if (r.durum === 'yonlendir' || r.durum === 'konu_disi') {
    log({ kaynak: 'ai', skor: near[0] ? near[0].sc : null, cevap: r.cevap, durum: r.durum, ...tok });
    return json({ ok: true, kaynak: 'yonlendir', cevap: r.cevap, urunler: [], neden: r.durum });
  }
  // Model kendi cevabından emin değilse cevap gösterilmez (yanlış bilgi riski); müşteri hizmetlerine yönlendirilir.
  // Cevap inceleme için kaydedilir.
  if (!r.emin) {
    log({ kaynak: 'ai', skor: near[0] ? near[0].sc : null, cevap: r.cevap, urunler: r.urunler, durum: 'emin-degil', ...tok });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: 'emin-degil' });
  }
  log({ kaynak: 'ai', skor: near[0] ? near[0].sc : null, cevap: r.cevap, urunler: r.urunler, durum: 'onay-bekliyor', ...tok });
  return json({ ok: true, kaynak: 'ai', cevap: r.cevap, urunler: r.urunler });
}
