// Ak Bilge otomatik ürün kartları: doğrulanmış kartı olmayan her ürün için ikas açıklamasından (docs/bilgi/urunler-hasturk.json)
// özet, kullanım cümleleri, pH ve içerik çıkarılır. durum = "urun_sayfasi": Ak Bilge bunu "ürün bilgisine göre" diye aktarır.
// Halk sağlığı (haşere/ilaç) ürünlerinde doz cümlesi alınmaz (yalnız etiket kuralı). Çıktı: bilgi/urunler-otomatik.json
import { readFile, writeFile } from 'node:fs/promises';
const raw = JSON.parse(await readFile('docs/bilgi/urunler-hasturk.json', 'utf8'));
const kb = JSON.parse(await readFile('bilgi/urunler.json', 'utf8')).urunler;
const live = new Set(JSON.parse(await readFile('public/products.json', 'utf8')).items.map((p) => p.s));
const cumle = (t) => t.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9•])|\s*•\s*/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 320);
const KUL = /(kullan|uygula|ekil|ekim|ekin|karıştır|doldur|sula|serp|nasıl|hazırla|seyrelt|püskürt|besle|günlük|dikim|aktar)/i;
const SAT = /(sipariş|kargo|teslim|indirim|kampanya|fiyat|satın al|stok|sepete|hemen|kapınıza|güvencesi)/i;
const out = {};
for (const p of raw) {
  if (!p.adres || kb[p.adres] || !live.has(p.adres)) continue;
  const kat = (p.kategoriler || []).map((k) => k.split(' > ')[0]);
  const ilac = kat.includes('Halk Sağlığı Ürünleri');
  const cs = cumle(p.aciklama || '').filter((s) => !SAT.test(s));
  const ad = p.ad.trim(), adl = ad.toLocaleLowerCase('tr-TR');
  // Başlığı tekrar eden ilk kısmı at ("Barış Çiçeği Toprağı | … Barış çiçeği toprağı, …" → asıl cümle)
  const temiz = (s) => { let t = s; const i = t.toLocaleLowerCase('tr-TR').lastIndexOf(adl.split(' ').slice(0, 2).join(' ')); if (i > 0 && i < 140) t = t.slice(i); return t.replace(/^[^a-zçğıöşü]*\|\s*/i, '').replace(/\s+,/g, ','); };
  const ozet = temiz(cs.find((s) => !/^[A-ZÇĞİÖŞÜ0-9 –-]{20,}$/.test(s)) || '');
  let kul = cs.filter((s) => KUL.test(s) && s !== ozet);
  if (ilac) kul = kul.filter((s) => !/\d/.test(s));
  const ph = ((p.aciklama || '').match(/ph[^0-9]{0,15}(\d[.,]?\d?\s*[-–]\s*\d[.,]?\d?)/i) || [])[1];
  const icerik = cs.find((s) => /(içerik|bileşen|formül|karışım).{0,40}(torf|perlit|cocopeat|kokopit|solucan|leonardit|ponza|kum|bark|vermikülit)/i.test(s));
  out[p.adres] = { ad, durum: 'urun_sayfasi', kategori: kat[0] || '', ozet, kullanim: kul.slice(0, 5), ...(ph ? { ph: ph.replace(/\s/g, '') } : {}), ...(icerik ? { icerik } : {}), ...(ilac ? { kural: 'ilac' } : {}) };
}
await writeFile('bilgi/urunler-otomatik.json', JSON.stringify({ _aciklama: 'Ürün sayfasından otomatik çıkarılmış bilgiler (doğrulanmadı). Doğrulanan ürün bilgi/urunler.json dosyasına taşınır ve oradaki öncelikli olur.', guncelleme: new Date().toISOString().slice(0, 10), urunler: out }, null, 1) + '\n');
const v = Object.values(out);
console.log(`Otomatik kart: ${v.length} ürün · kullanım cümlesi olan ${v.filter((x) => x.kullanim.length).length} · pH ${v.filter((x) => x.ph).length} · içerik ${v.filter((x) => x.icerik).length}`);
