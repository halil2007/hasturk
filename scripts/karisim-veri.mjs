// "Kendi Toprak Karışımını Oluştur" ürününün bileşenleri ve litre fiyatları → public/karisim.json (widget okur).
// Kaynak: ürün sayfasının __NEXT_DATA__ verisi (ikas seçenek seti; fiyatlar sitede herkese açık). Her bileşen bir onay kutusu
// (cb) ve ona bağlı litre seçimi (ch); seçilen litre değerinin fiyatı taban fiyatın üstüne eklenir. Sepete ekleme:
// window.addToCart({ variantId, quantity: 1, options: [{ productOptionId: cb, productOptionsSetId, values: ['true'] },
// { productOptionId: ch, productOptionsSetId, values: [değerKimliği] }, …] }) — gerçek sitede doğrulandı (karisim-diag).
import { writeFile } from 'node:fs/promises';
const SITE = process.env.SITE_URL || 'https://hasturkgubre.com.tr';
const SLUG = 'kendi-toprak-karisimini-olustur';
const html = await (await fetch(`${SITE}/${SLUG}`, { headers: { 'user-agent': 'Mozilla/5.0 (HasTurk urun-senkron)' } })).text();
const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('__NEXT_DATA__ bulunamadı');
let urun = null;
(function walk(o, d) { if (urun || !o || typeof o !== 'object' || d > 16) return; if (o.metaData && o.metaData.slug === SLUG && o.productOptionSet) { urun = o; return; } for (const k in o) walk(o[k], d + 1); })(JSON.parse(m[1]), 0);
if (!urun) throw new Error('ürün / seçenek seti bulunamadı');
const set = urun.productOptionSet, v = urun.variants[0], fiyat = (v.prices || [])[0] || {};
// Bileşen anahtarı: widget tarifindeki adlarla eşleşir
const ANAHTAR = [[/sphagnum/i, 'sphagnum'], [/asidik/i, 'asidik'], [/cocopeat/i, 'cocopeat'], [/orman/i, 'orman'], [/[İi]nce.*perlit/i, 'ince-perlit'], [/kal[ıi]n.*perlit/i, 'kalin-perlit'],
  [/pomza/i, 'pomza'], [/vermik/i, 'vermikulit'], [/bentonit/i, 'bentonit'], [/solucan/i, 'solucan'], [/leonardit/i, 'leonardit']];
const bilesen = set.options.filter((o) => o.type === 'CHECKBOX' && o.childOptions && o.childOptions.length).map((o) => {
  const ch = o.childOptions[0], ad = o.name.replace(/^[^\p{L}]+/u, '').replace(/\s+/g, ' ').trim();
  return { k: (ANAHTAR.find(([re]) => re.test(ad)) || [, ''])[1], ad, cb: o.id, ch: ch.id,
    d: ((ch.selectSettings || {}).values || []).filter((x) => !x.deleted).map((x) => [parseFloat(String(x.value).replace(',', '.')), x.id, x.price]).filter((x) => x[0] > 0 && x[2] != null).sort((a, b) => a[0] - b[0]) };
}).filter((x) => x.d.length);
// Not alanı (metin seçeneği, ör. "Not" / "Karışım adı"): widget karışımın adını (bitki / kendi oranları) buraya yazar,
// sipariş gelince hangi toprak için hazırlandığı görünür
const notOpt = set.options.find((o) => /TEXT/i.test(o.type || ''));
console.log('Seçenekler: ' + set.options.map((o) => `${o.type}${o.isOptional === false || o.required ? '*' : ''} "${String(o.name).replace(/\s+/g, ' ').trim().slice(0, 40)}"`).join(' | '));
if (notOpt) console.log('Not alanı: ' + JSON.stringify({ id: notOpt.id, ad: notOpt.name, tur: notOpt.type, ayar: notOpt.textSettings || null }));
const out = { _aciklama: 'Kendi Toprak Karışımını Oluştur: bileşenler ve litre fiyatları (karisim-veri.mjs, ürün sayfasından). d: [litre, değer kimliği, fiyat TL].', guncelleme: new Date().toISOString().slice(0, 16),
  urun: urun.id, varyant: v.id, set: set.id, taban: fiyat.discountPrice || fiyat.sellPrice || 0, bilesen,
  not: notOpt ? { id: notOpt.id, ad: String(notOpt.name).replace(/\s+/g, ' ').trim(), max: (notOpt.textSettings || {}).max || null } : null };
await writeFile('public/karisim.json', JSON.stringify(out) + '\n');
console.log(`Kendi karışımı: taban ${out.taban} TL, ${bilesen.length} bileşen (${bilesen.map((b) => b.k + ':' + b.d.length).join(', ')})`);
