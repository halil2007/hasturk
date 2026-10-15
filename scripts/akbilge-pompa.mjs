// Ak Bilge ilaçlama pompası bilgisi: ürün açıklamalarından tip (akülü / manuel), depo, akü, tek şarjla çalışma,
// şarj süresi, basınç, atış mesafesi, akış, nozul ve hortum bilgisini çıkarır. Garanti mağaza bilgisidir (24 ay).
// Çıktı: bilgi/pompalar.json (akbilge-havuz.mjs okur).
import { readFile, writeFile } from 'node:fs/promises';

const GARANTI = { ay: 24, metin: 'İlaçlama pompalarımız 24 ay garantilidir.', kaynak: 'mağaza' };
const raw = JSON.parse(await readFile('docs/bilgi/urunler-hasturk.json', 'utf8'));
const prods = JSON.parse(await readFile('public/products.json', 'utf8'));
const bySlug = new Map(prods.items.map((p) => [p.s, p]));
const txt = (h) => String(h || '').replace(/\s+/g, ' ');
const v = (x) => String(x).replace('.', ',').replace(/\s*(?:-|ila)\s*/g, '–');

const pompalar = [];
for (const p of raw) {
  const kat = (p.kategoriler || []).join(' | ');
  if (!/İlaçlama Pompaları/.test(kat) || /Yedek/.test(kat)) continue;
  const live = bySlug.get(p.adres); if (!live) continue;
  const s = txt(p.aciklama), ad = live.n.trim(), m = (re) => (s.match(re) || [])[1];
  const akulu = /Akülü|Şarjlı/i.test(kat) || /akülü|şarjlı/i.test(ad);
  const o = { slug: p.adres, ad, stok: live.st, tip: akulu ? 'akulu' : 'manuel' };
  const L = (ad.match(/(\d+(?:[.,]\d+)?)\s*(?:lt|l|litre)\b/i) || [])[1]; if (L) o.depo = v(L);
  o.tasima = /sırt/i.test(ad + ' ' + s) && !/sırtı yormayan hafif/i.test(s.slice(0, 0)) && (/sırt/i.test(ad) || /sırt askı|sırt tipi|sırtta taşı|sırt pul|sırt tasarım/i.test(s)) ? 'sırt tipi'
    : /omuz askı/i.test(s) ? 'omuz askılı' : (L && parseFloat(L.replace(',', '.')) <= 2) ? 'el tipi' : null;
  if (!akulu) {
    o.mekanizma = /kollu/i.test(s) || /manuel/i.test(ad) && parseFloat(o.depo) >= 16 ? 'kollu (sürekli pompalanır)' : /basınçlı|piston|basınçlandır/i.test(ad + ' ' + s) ? 'basınçlı (birkaç kez pompalanır, basıncı tutar)' : null;
  } else {
    const mah = m(/(\d{3,5})\s*mAh/i), vah = m(/(\d+\s*V\s*\d+\s*Ah?)\b/i);
    if (mah) o.aku = `${mah} mAh`; else if (vah) o.aku = vah.replace(/\s+/g, ' ');
    if (/lityum/i.test(ad + ' ' + s)) o.aku = (o.aku ? o.aku + ' ' : '') + 'lityum';
    const saat = m(/(\d+(?:\s*-\s*\d+)?)\s*saat(?:e kadar| boyunca| sürekli| kesintisiz)/i) || m(/Çalışma Süresi Yaklaşık (\d+) Saat/i);
    const depo = s.match(/(minimum\s*)?(\d+(?:\s*(?:-|ila)\s*\d+)?)\s*(?:kez|depo)\b[^.]{0,40}?(?:ilaçlama|boşalt)/i) || s.match(/Tek Şarjla (\d+(?:-\d+)?) Depo/i);
    const litre = m(/yaklaşık ([\d]+-[\d]+) litre ilaçlama/i);
    if (saat) o.calisma = `yaklaşık ${v(saat)} saat`;
    if (depo) o.calismaDepo = `${depo[1] && /minimum/i.test(depo[1]) ? 'en az ' : ''}${v(depo[2] || depo[1])} depo`;
    if (litre) o.calismaLitre = `${v(litre)} litre`;
    const ilk = m(/İlk kullanımda (\d+) saat şarj/i), sonra = m(/sonraki kullanımlarda yalnızca ([\d-]+) saatte/i);
    if (ilk || sonra) o.sarj = [sonra && `${v(sonra)} saatte tam dolar`, ilk && `ilk kullanımda ${ilk} saat şarj edilmesi önerilir`].filter(Boolean).join('; ');
    if (/USB[ -]?(?:Type-)?C/i.test(s)) o.sarjGiris = 'USB Type-C';
    if (/bakır/i.test(s) && /motor/i.test(s)) o.motor = 'bakır sargılı motor';
  }
  const bar = s.match(/(\d+(?:[.,]\d+)?)\s*(bar|ATM)\b/i); if (bar) o.basinc = `${v(bar[1])} ${bar[2].toLowerCase() === 'atm' ? 'ATM' : 'bar'}`;
  const atis = m(/(\d+(?:\s*[-–]\s*\d+)?)\s*metre(?:ye)?\s*(?:kadar\s*)?(?:uzun\s*)?atış/i) || m(/(\d+-\d+) Metre Atış/i) || m(/Püskürtme Mesafesi ([\d,]+\s*[–-]\s*\d+) Metre/i) || m(/(\d+-\d+) metreye ulaşan sıvı atım/i);
  if (atis) o.atis = `${v(atis.replace(/\s/g, ''))} metre`;
  const akis = m(/Dakikada ([\d.,]+) Litre/i); if (akis) o.akis = `dakikada ${v(akis)} litre`;
  const noz = m(/(\d+) (?:farklı |adet )?(?:çok amaçlı )?(?:püskürtme )?(?:nozul|nozzle)/i) || m(/Nozul \(Başlık\) (\d+) Adet/i); if (noz) o.nozul = `${noz} nozul`;
  const hort = m(/([\d,]+) metre PVC hortum/i); if (hort) o.hortum = `${hort} m PVC hortum`;
  if (/teleskop/i.test(s)) o.lans = 'teleskopik püskürtme borusu';
  o.bos = !s.trim();
  pompalar.push(o);
}
await writeFile('bilgi/pompalar.json', JSON.stringify({
  _aciklama: 'İlaçlama pompaları: ürün açıklamalarından çıkarılan teknik bilgiler. Garanti mağaza bilgisidir.',
  surum: 1, garanti: GARANTI, pompalar,
}, null, 1) + '\n');
console.log(`Pompa: ${pompalar.length} ürün (akülü ${pompalar.filter((x) => x.tip === 'akulu').length}, manuel ${pompalar.filter((x) => x.tip === 'manuel').length}) · açıklaması boş: ${pompalar.filter((x) => x.bos).map((x) => x.slug).join(', ') || '-'}`);
