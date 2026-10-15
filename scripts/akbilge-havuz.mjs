// Ak Bilge soru havuzu üretici: doğrulanmış kaynaklardan (config.json > guides kullanım tabloları ve bilgi/urunler.json
// kartları) hazır soru-cevaplar üretir. Cevaplardaki rakamlar tablodan birebir alınır; yapay zeka rakam üretmez.
// Çelişkili / eksik dozlar cevaba konmaz, müşteri ustaya yönlendirilir. Çıktı: bilgi/soru-havuzu.json
import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('config.json', 'utf8'));
const kb = JSON.parse(await readFile('bilgi/urunler.json', 'utf8')).urunler;
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
// C) Mağaza bilgileri (config.json > promo): aramalarda "indirim kodu" soruluyor
const pr = config.promo || {};
if (pr.code) add({ tur: 'magaza', sorular: ['indirim kodu', 'indirim var mı', 'kupon kodu', 'kargo ücretsiz mi', 'ücretsiz kargo'],
  cevap: `${pr.title || 'İndirim'}: ${pr.code} kodunu ödeme adımında kullanabilirsiniz${pr.note ? ' (' + pr.note + ')' : ''}.${pr.shipping ? ' ' + pr.shipping + '.' : ''}`, urunler: [], kaynak: 'config:promo' });
await writeFile('bilgi/soru-havuzu.json', JSON.stringify({ _aciklama: 'Ak Bilge soru havuzu. durum: onay-bekliyor → onaylandi olunca canlıda kullanılır. Rakamlar yalnız doğrulanmış tablolardan.', surum: 1, kayit: out.length, havuz: out }, null, 1) + '\n');
const c = (t) => out.filter((x) => x.tur === t).length;
console.log(`Soru havuzu: ${out.length} kayıt (bitki-doz ${c('bitki-doz')}, ürün ${c('urun')}, mağaza ${c('magaza')}), ${out.reduce((a, x) => a + x.sorular.length, 0)} soru kalıbı`);
