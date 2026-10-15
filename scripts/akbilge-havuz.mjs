// Ak Bilge soru havuzu üretici: doğrulanmış kaynaklardan (config.json > guides kullanım tabloları ve bilgi/urunler.json
// kartları) hazır soru-cevaplar üretir. Cevaplardaki rakamlar tablodan birebir alınır; yapay zeka rakam üretmez.
// Çelişkili / eksik dozlar cevaba konmaz, müşteri ustaya yönlendirilir. Çıktı: bilgi/soru-havuzu.json
import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('config.json', 'utf8'));
const kb = JSON.parse(await readFile('bilgi/urunler.json', 'utf8')).urunler;
const oto = JSON.parse(await readFile('bilgi/urunler-otomatik.json', 'utf8')).urunler;
const prods = JSON.parse(await readFile('public/products.json', 'utf8'));
const bySlug = new Map(prods.items.map((p) => [p.s, p]));
const USTA = 'Bu konuda kesin bilgi için ustamız size yardımcı olsun.';
const out = [];
const add = (e) => out.push({ id: 'h' + String(out.length + 1).padStart(4, '0'), durum: 'onay-bekliyor', ...e });
const lc = (s) => s.toLocaleLowerCase('tr-TR');
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
    const satirlar = gr.steps.map((s) => `• ${s[0]} — ${s[1]}: ${s[2]}`).join('\n');
    for (const bitki of gr.plants) {
      const b = bitki.replace(/\s*\(.*\)\s*/g, '').trim();
      add({
        tur: 'bitki-doz', bitki, grup: gr.name, urun: g.product,
        sorular: [`${b} için ${k} ne kadar kullanılır`, `${yon(bitki)} ${k} nasıl verilir`, `${b} ${k} dozu`, `${yon(bitki)} ne kadar ${k} atılır`, `${lc(b)} için gübre`, `${lc(b)} için besin`],
        cevap: `${ad} — ${bitki} (${gr.name}) için önerilen uygulama:\n${satirlar}\n\n${g.note || ''}`.trim(),
        urunler: [g.product], kaynak: `rehber:${g.id}`,
      });
    }
  }
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
  return [a[1] !== a[0] ? `${PH[a[0]]}–${PH[a[1]]}` : PH[a[0]], { 2: 'iyi süzen', 3: 'çok iyi süzen' }[a[2]], { 1: 'çabuk kuruyan', 3: 'nemini koruyan' }[a[3]],
    { 1: 'besini az', 3: 'besince zengin' }[a[4]], { k: 'kumlu', h: 'havalı' }[a[5]]].filter(Boolean).join(', '); };
for (const pl of (config.soilMatch || {}).plants || []) {
  const [ad, diger, grup, prof, ozel, strict] = pl;
  if (!/^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(prof || '')) continue;
  const adlar = [ad, ...String(diger || '').split(',').map((x) => x.trim()).filter(Boolean)];
  add({ tur: 'bitki-toprak', bitki: ad, grup, dinamik: 'toprak',
    sorular: adlar.flatMap((n) => [`${lc(n)} için hangi toprak`, `${lc(n)} toprağı`, `${lc(n)} saksı toprağı`, `${yon(n)} hangi toprak kullanılır`]),
    cevap: `${ad} ${desc(prof)} bir toprak sever.${strict === 's' ? ' Çok özel bir ortam ister; uygun hazır toprak yoksa başka toprak önermeyiz.' : ''} Önerdiğimiz toprak, o anki stok durumuna göre aşağıda gösterilir.`,
    urunler: ozel ? [ozel] : [], kaynak: 'config:soilMatch' });
}

// E) Diğer tüm ürünler: ürün sayfasından otomatik kartlar ("ürün bilgisine göre")
for (const [slug, c] of Object.entries(oto)) {
  if (!bySlug.has(slug)) continue;
  const n = lc(c.ad).replace(/\s*\|.*$/, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  let cevap = `${c.ad}${c.ozet ? ' — ' + c.ozet : ''}`;
  if (c.ph) cevap += `\n\npH: ${c.ph}`;
  if (c.icerik) cevap += `\n\n${c.icerik}`;
  if (c.kullanim.length) cevap += `\n\nÜrün bilgisine göre:\n${c.kullanim.map((k) => '• ' + k).join('\n')}`;
  if (c.kural === 'ilac') cevap += `\n\nKullanım miktarı ve güvenlik uyarıları için ürün etiketine uyunuz. ${USTA}`;
  const tohum = c.kategori === 'Tohumlar';
  const sorular = [`${n} nasıl kullanılır`, `${n} ne işe yarar`, `${n} özellikleri`, `${n} nedir`];
  if (tohum) sorular.push(`${n} ne zaman ekilir`, `${n} nasıl ekilir`, `${n} ekim zamanı`);
  if (c.kategori === 'Kedi Ürünleri' || c.kategori === 'Köpek Ürünleri') sorular.push(`${n} günlük ne kadar verilir`, `${n} besleme miktarı`);
  add({ tur: 'urun', urun: slug, kartDurum: 'urun_sayfasi', kategori: c.kategori, sorular, cevap, urunler: [slug, ...((bySlug.get(slug) || {}).x || []).slice(0, 2)], kaynak: `urun_sayfasi:${slug}` });
}

// F) Saksılar (bilgi/saksilar.json; akbilge-saksi.mjs üretir): hacim, toprak ihtiyacı, delik, saksı seçimi kuralları
const sx = JSON.parse(await readFile('bilgi/saksilar.json', 'utf8'));
const virg = (x) => String(x).replace('.', ',');
const kaynakSatir = (k) => '\n\nKaynak: ' + k.kaynaklar.map((x) => x.ad).join('; ');
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
    cevap: `Çapı ${d} cm, yüksekliği çapına yakın standart bir saksı yaklaşık ${virg(t.litre)} litredir. İçine yaklaşık ${virg(t.toprak.litre)} litre toprak gider (üstte 2–3 cm sulama payı kalır)${t.toprak.paket ? '; ' + (/^en küçük/.test(t.toprak.paket) ? t.toprak.paket : t.toprak.paket + ' paket yeter') : ''}.\n\nKâse biçimli, alçak saksılarda hacim daha azdır. Bitkinizi bu saksıdan taşıyacaksanız yeni saksının çapı ${sonra} olmalı.`,
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
  add({ tur: 'saksi', urun: p.slug, sorular, cevap, urunler: [p.slug, ...((bySlug.get(p.slug) || {}).x || []).slice(0, 2)], kaynak: `saksi:${p.slug}` });
}

// C) Mağaza bilgileri (config.json > promo): aramalarda "indirim kodu" soruluyor
const pr = config.promo || {};
if (pr.code) add({ tur: 'magaza', sorular: ['indirim kodu', 'indirim var mı', 'kupon kodu', 'kargo ücretsiz mi', 'ücretsiz kargo'],
  cevap: `${pr.title || 'İndirim'}: ${pr.code} kodunu ödeme adımında kullanabilirsiniz${pr.note ? ' (' + pr.note + ')' : ''}.${pr.shipping ? ' ' + pr.shipping + '.' : ''}`, urunler: [], kaynak: 'config:promo' });
await writeFile('bilgi/soru-havuzu.json', JSON.stringify({ _aciklama: 'Ak Bilge soru havuzu. durum: onay-bekliyor → onaylandi olunca canlıda kullanılır. Rakamlar yalnız doğrulanmış tablolardan.', surum: 1, kayit: out.length, havuz: out }, null, 1) + '\n');
const c = (t) => out.filter((x) => x.tur === t).length;
console.log(`Soru havuzu: ${out.length} kayıt (bitki-doz ${c('bitki-doz')}, ürün ${c('urun')}, bitki-toprak ${c('bitki-toprak')}, saksı ${c('saksi')}+${c('saksi-hesap')} hesap+${c('saksi-kural')} kural, mağaza ${c('magaza')}), ${out.reduce((a, x) => a + x.sorular.length, 0)} soru kalıbı`);
