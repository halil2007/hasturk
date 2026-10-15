// Bilge Bey: hasturkgubre.com.tr/blog yazılarının "Sık Sorulan Sorular" bölümlerinden hazır cevap adayları.
// Kaynak metin: docs/blog/*.txt (blog-indir.yml indirir). Cevaplarda blog bağlantısı verilmez.
// Süzgeç: gübre/ilaç miktarı veren cevaplar alınmaz (orada doğrulanmış kullanım tabloları geçerlidir; bunlar kontrol için
// bilgi/BLOG-KONTROL.md'ye yazılır); site yönlendirmesi ("sayfamızdan inceleyin") cümleleri atılır; çok kısa / çok uzun
// cevaplar ve konusu belirsiz sorular ("Nasıl uygulanır?") alınmaz. Cevapta adı geçen ürünler (sitede ve stoktaysa) eklenir.
// Çıktı: bilgi/blog-sss.json (akbilge-havuz.mjs okur).
import { readFile, writeFile, readdir } from 'node:fs/promises';

const DIR = 'docs/blog';
const prods = JSON.parse(await readFile('public/products.json', 'utf8')).items;
const lc = (s) => s.toLocaleLowerCase('tr-TR');
const JUNK = /^(Tüm Kredi Kartlarına|Müşteri Hizmetleri Hattımız|₺|HG$|HasTürk$|Hastürk Gübre$|Solucan Gübresi$|Özel Bitki Toprakları$|Sebze ve Meyve|Genel Kullanım ve Saksı|Cocopeat Hindistan|Toprak Düzenleyiciler$|Sebze Tohumu$|Çim Tohumu$|Çiçek Tohumu$|Bitki Besinleri$|Bahçe Ekipmanları$|İlaçlama Pompaları$|Kedi|Köpek|Halk Sağlığı)/;
// Kısa ürün adları (marka ve ölçü olmadan) → ürün; cevapta geçen ürünü bulmak için
const MARKA = /^(has ?türk|hasturk|hg|altınvadi|arzuman|uzman|arom|tarm|florist|chrysamed|gartengold|güzelbahçe|klasmann|qts|icl)\s+/i;
const kisa = (n) => lc(n).replace(/\s*[|–—].*$/, '').replace(/\s+-\s+.*$/, '').replace(/\(.*?\)/g, ' ').replace(/\s+\d+([.,]\d+)?\s*(gr|g|kg|lt|l|ml|adet|cm)\b.*$/i, '').replace(MARKA, '').replace(/\s+/g, ' ').trim();
const URUN = prods.filter((p) => p.st > 0).map((p) => ({ s: p.s, k: kisa(p.n) })).filter((x) => x.k.length >= 9 && !/^(mama|kedi|köpek)/.test(x.k))
  .sort((a, b) => b.k.length - a.k.length);
const DOZ = /(gübre|gubre|besin|ilaç|hümik|humik|leonardit|guano|solucan)[^?]{0,60}(ne kadar|kaç (gram|kg|litre|ml|cc)|doz|miktar|oran)|(ne kadar|kaç (gram|kg|litre|ml)|doz|miktar)[^?]{0,60}(gübre|besin|ilaç|solucan|hümik)/i;
const SAYILI_DOZ = /\d[\d.,–-]*\s*(kg|g|gr|gram|ml|cc|l|lt|litre)\s*\/?\s*(dekar|da|m²|m2|fidan|ağaç|bitki|saksı|ton)|\d[\d.,–-]*\s*(ml|cc)\b/i;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.txt')).sort();
const sss = [], kontrol = [];
for (const f of files) {
  let raw = await readFile(`${DIR}/${f}`, 'utf8');
  const baslik = (raw.match(/^# Başlık: (.*)$/m) || [])[1] || f;
  raw = raw.replace(/\{"time".*?"text":"/s, '').replace(/"\}\},\{"id":"\w+","type":"\w+","data":\{"(text|level)":"?/g, '\n').replace(/\\n/g, ' ').replace(/\\"/g, '"');
  const lines = raw.split('\n').slice(2).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !JUNK.test(l));
  const i = lines.findIndex((l) => /^(Sık Sorulan Sorular|Sıkça Sorulan Sorular)/i.test(l));
  if (i < 0) continue;
  const metin = lines.slice(i + 1).join(' ').replace(/^\(SSS\)\s*/, '');
  // Sorular: büyük harfle başlayıp "?" ile biten cümle; cevap bir sonraki soruya kadar
  const parca = metin.split(/(?<=[.!?…)"]\s|^)(?=[A-ZÇĞİÖŞÜ0-9][^.?!]{6,140}\?\s)/u);
  for (const p of parca) {
    const m = p.match(/^([A-ZÇĞİÖŞÜ0-9][^.?!]{6,140}\?)\s+(.+)$/u);
    if (!m) continue;
    const q = m[1].trim();
    let a = m[2].trim().replace(/\s+/g, ' ');
    // site yönlendirmesi ve bağlantı cümleleri atılır
    a = a.split(/(?<=[.!])\s+/).filter((c) => !/sayfamız|bağlantı|tıklayın|incele(yebilir|yin)|blog|yazımız|yanınızdayız|uzman kadro|profesyonel destek|telefon uzağınızda|bize ulaş|iletişime geç|şifa|maksimum|muazzam|mucizevi|anında tetikler|kesinlikle (en|tek)|yalnız değilsiniz|tartışmasız|yatırımdır|riski(nin)? sıfır|hayalinizdeki|bir adım önde/i.test(c)).join(' ').replace(/\s+\d+\.\s*$/, '').trim();
    // Reklam / yönlendirme soruları, mağaza bilgisi (fiyat, taksit, stok), verim tahmini ve ilaçların insan/hayvan sağlığına etkisi alınmaz
    if (q.length > 100 || /^İlgili Yazılar|hazır mısınız|ister misiniz|kararsız mısınız|ihtiyacınız var mı|sorular mı var|destek mi almak|ulaşmıyor mu\?$/i.test(q)) continue;
    if (/hastürk gübre'de|taksit|fiyat|kargo|stok/i.test(q)) continue;
    if (/ne kadar ürün alınır|verim(i)? ne kadar|en hızlı/i.test(q) || (/ilac|ilaç|permetrin/i.test(q + a) && /insan|kedi|köpek|evcil|sağlı/i.test(q))) { kontrol.push({ kaynak: f.replace(/\.txt$/, ''), baslik, soru: q, cevap: a }); continue; }
    if (/^(Ne Zaman|Nasıl|Neden|Ne Yapmalı)\b[^?]{0,22}\?$/i.test(q)) continue;
    if (a.length < 40 || a.length > 900) continue;
    if (q.split(/\s+/).filter((w) => w.length >= 4).length < 2) continue; // "Nasıl uygulanır?" gibi konusu belirsiz
    const k = { kaynak: f.replace(/\.txt$/, ''), baslik, soru: q, cevap: a };
    if (DOZ.test(q) || (SAYILI_DOZ.test(a) && /gübre|besin|ilaç|hümik|solucan|leonardit|guano/i.test(q + ' ' + a))) { kontrol.push(k); continue; }
    // Doğrulanamayan verim / yüzde / kesinlik iddiaları ("%30 verim artışı", "mucize", "garanti") alınmaz
    if (/%\s?\d|\d\s?%|mucize|garanti|kesin(likle)? (çözüm|sonuç)|randıman|rekolte|verim(i|de)? (artış|art[ıa]r)/i.test(a)) { kontrol.push(k); continue; }
    const metinLc = lc(q + ' ' + a), urunler = [];
    for (const u of URUN) if (urunler.length < 3 && metinLc.includes(u.k) && !urunler.includes(u.s)) urunler.push(u.s);
    sss.push({ ...k, urunler });
  }
}
await writeFile('bilgi/blog-sss.json', JSON.stringify({ _aciklama: 'Blog SSS bölümlerinden hazır cevap adayları (akbilge-blog.mjs). Gübre/ilaç miktarı veren cevaplar hariç (bilgi/BLOG-KONTROL.md).', kayit: sss.length, sss }, null, 1) + '\n');
await writeFile('bilgi/BLOG-KONTROL.md', `# Blog: Bilge Bey'e eklenmeyen cevaplar (kontrol listesi)\n\nBu cevaplar Bilge Bey'e eklenmedi: gübre/ilaç miktarı veriyor (doğrulanmış kullanım tabloları geçerli: config.json > guides) ya da doğrulanamayan verim / yüzde iddiası içeriyor.\nBlogdaki rakam tabloyla çelişiyorsa ya da iddia kaynağa dayanmıyorsa blog yazısının düzeltilmesi önerilir.\n\n` +
  kontrol.map((k) => `### ${k.soru}\n*${k.baslik}* (${k.kaynak})\n\n${k.cevap}\n`).join('\n'));
console.log(`Blog SSS: ${sss.length} cevap adayı (${new Set(sss.map((x) => x.kaynak)).size} yazı), ${kontrol.length} miktar veren cevap kontrol listesine`);
