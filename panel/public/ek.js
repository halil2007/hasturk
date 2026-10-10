// Panel (tarayıcı) ve sunucu ortak: DOM kullanmaz
// Ad + ek (Türkçe ses uyumu): ek('Trendyol', 'a') → Trendyol'a, ek('Hepsiburada', 'a') → Hepsiburada'ya, ek('N11', 'da') → N11'de.
// kind: 'a' (yönelme) | 'da' (bulunma) | 'dan' (ayrılma). Okunuşu yazılışından farklı adlar tablodan.
const EK = { hepsiburada: ["'ya", "'da", "'dan"], pazarama: ["'ya", "'da", "'dan"], teknosa: ["'ya", "'da", "'dan"], n11: ["'e", "'de", "'den"], idefix: ["'e", "'te", "'ten"],
  hastürk: ["'e", "'te", "'ten"], pttavm: ["'ye", "'de", "'den"], çiçeksepeti: ["'ne", "'nde", "'nden"], trendyol: ["'a", "'da", "'dan"], amazon: ["'a", "'da", "'dan"],
  ikas: ["'a", "'ta", "'tan"], koçtaş: ["'a", "'ta", "'tan"], ebay: ["'e", "'de", "'den"], shopify: ["'a", "'da", "'dan"], woocommerce: ["'a", "'da", "'dan"], etsy: ["'ye", "'de", "'den"] };
const DIGIT = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const LETTER = { a: 'a', b: 'be', c: 'ce', ç: 'çe', d: 'de', e: 'e', f: 'fe', g: 'ge', ğ: 'ğe', h: 'he', ı: 'ı', i: 'i', j: 'je', k: 'ke', l: 'le', m: 'me', n: 'ne', o: 'o', ö: 'ö', p: 'pe', r: 're', s: 'se', ş: 'şe', t: 'te', u: 'u', ü: 'ü', v: 've', w: 've', x: 'iks', y: 'ye', z: 'ze', q: 'ku' };
export function ek(name, kind = 'a') {
  const s = String(name ?? '').trim(), i = kind === 'dan' || kind === 'den' ? 2 : kind === 'da' || kind === 'de' ? 1 : 0;
  if (!s) return s;
  const key = s.toLocaleLowerCase('tr'), hit = EK[key] || EK[key.split(/\s+/).pop()];
  if (hit) return s + hit[i];
  // Okunuş: sondaki sayı yazıyla, sondaki kısaltma (2+ büyük harf) harf harf okunur
  let w = (s.match(/[\p{L}\d]+$/u) || [s])[0];
  const num = /(\d+)$/.exec(w);
  if (num) { const v = Number(num[1].slice(-2)); w = v % 10 ? DIGIT[v % 10] : v ? TENS[Math.floor(v / 10)] : num[1].length > 2 ? 'yüz' : 'sıfır'; }
  else if (/[A-ZÇĞİÖŞÜ]{2,}$/.test(w)) w = LETTER[w.slice(-1).toLocaleLowerCase('tr')] || w;
  w = w.toLocaleLowerCase('tr');
  const vs = w.match(/[aeıioöuü]/g), back = !vs || /[aıou]/.test(vs[vs.length - 1]), V = back ? 'a' : 'e';
  const end = w.slice(-1), vowelEnd = /[aeıioöuü]/.test(end), hard = /[fstkçşhpx]/.test(end);
  return s + "'" + [vowelEnd ? 'y' + V : V, (hard ? 't' : 'd') + V, (hard ? 't' : 'd') + V + 'n'][i];
}
