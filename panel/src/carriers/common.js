// Kargo firması bağlantılarının ortak yardımcıları: SOAP zarfı, XML okuma, telefon / il-ilçe biçimleri, takip durumu.
// Her bağlantı (src/carriers/<firma>.js) make(values) ile şu işlevleri verir:
//   test()        → { ok, message }
//   create(s)     → { ref, tracking, barcode, carrier, trackingUrl, cost, label: { format, data } | null }
//   cancel(ref)
//   track(pkg)    → { state: 'created'|'transit'|'delivered'|'returned'|'cancelled'|null, text, tracking, barcode, trackingUrl, carrier, cost, deliveredAt }
//   label(pkg)    → { format, data } | null   (etiketi sonradan veren firmalar; isteğe bağlı)
import { http, str } from '../util.js';

export const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
// İsim alanı önekinden bağımsız etiket okuma (<ns2:jobId>, <jobId>); boş etiket (<x/>) ''
export const tag = (x, t) => { const m = new RegExp(`<(?:[\\w-]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${t}>`).exec(x || ''); return m ? unesc(m[1]).trim() : ''; };
export const tags = (x, t) => [...String(x || '').matchAll(new RegExp(`<(?:[\\w-]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${t}>`, 'g'))].map((m) => m[1]);
// Elemanın alanları (tek seviye): <x><a>1</a><b>2</b></x> → { a: '1', b: '2' }
export const fields = (x) => { const o = {}; for (const m of String(x || '').matchAll(/<(?:[\w-]+:)?(\w+)(?:\s[^>]*)?>([^<]*)<\/(?:[\w-]+:)?\1>/g)) if (!(m[1] in o)) o[m[1]] = unesc(m[2]).trim(); return o; };

// SOAP 1.1 isteği: hata (soap:Fault) okunur mesajla atılır
export async function soap(url, { ns, action, body, prefix = 'ns', header = '', timeout = 30000 }) {
  const env = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:${prefix}="${ns}">`
    + `<soapenv:Header>${header}</soapenv:Header><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
  let text;
  try {
    const res = await http(url, { method: 'POST', raw: true, tries: 1, timeout, headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${action}"`, Accept: 'text/xml' }, body: env });
    text = await res.text();
  } catch (e) {
    // SOAP hataları çoğu sunucuda HTTP 500 ile gelir: gövdedeki açıklama gösterilir
    const m = /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/.exec(e.message || '');
    throw new Error(m ? unesc(m[1]).trim() : e.message);
  }
  const fault = tag(text, 'faultstring');
  if (fault) throw new Error(fault);
  return text;
}

// Telefon: 10 hane (5XXXXXXXXX)
export const phone10 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.replace(/^(?:90)?0?(?=\d{10}$)/, '').slice(-10); };
// Türkçe büyük harf (İ, I) ve karşılaştırma anahtarı (İSTANBUL = istanbul = Istanbul)
export const trUpper = (s) => String(s || '').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
export const nameKey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[ıi̇]/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// Türkçe karakterleri ASCII'ye çevirir (yalnız ASCII kabul eden eski servisler için)
export const ascii = (s) => String(s || '').replace(/[çÇ]/g, (c) => (c === 'ç' ? 'c' : 'C')).replace(/[ğĞ]/g, (c) => (c === 'ğ' ? 'g' : 'G')).replace(/[ıİ]/g, (c) => (c === 'ı' ? 'i' : 'I'))
  .replace(/[öÖ]/g, (c) => (c === 'ö' ? 'o' : 'O')).replace(/[şŞ]/g, (c) => (c === 'ş' ? 's' : 'S')).replace(/[üÜ]/g, (c) => (c === 'ü' ? 'u' : 'U'));
export const cut = (s, n) => str(s).slice(0, n);
export const money = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
export const b64 = (s) => str(s).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
// Firmanın verdiği açıklama yoksa durum metninden takip durumu
export function stateOf(text) {
  const t = String(text || '').toLocaleLowerCase('tr');
  if (!t) return null;
  if (/iptal|cancel/.test(t)) return 'cancelled';
  if (/iade edil|göndericiye teslim|geri döndü|returned/.test(t)) return 'returned';
  if (/teslim edildi|teslim edilmiştir|delivered/.test(t) && !/edilemedi|edilmedi|not/.test(t)) return 'delivered';
  if (/hazırlan|oluşturuldu|kayıt|bekleniyor|teslim alınacak|created/.test(t)) return 'created';
  return 'transit';
}
// Alıcı adresi tek satırda (bazı firmalar ilçe / ili adres metninde de ister)
export function fullAddress(r) {
  const a = str(r.address), k = nameKey(a);
  return [a, r.district && !k.includes(nameKey(r.district)) ? r.district : '', r.city && !k.includes(nameKey(r.city)) ? r.city : ''].filter(Boolean).join(' ');
}

// Kargo firmalarının herkese açık takip sayfaları (firma API'si takip adresi vermediyse)
const TRACK = {
  aras: 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code={n}',
  yurtici: 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={n}',
  surat: 'https://www.suratkargo.com.tr/KargoTakip/?kargotakipno={n}',
  hepsijet: 'https://www.hepsijet.com/gonderi-takibi/{n}',
  ptt: 'https://gonderitakip.ptt.gov.tr/Track/Verify?q={n}',
  kolaygelsin: 'https://esube.kolaygelsin.com/shipments?trackingId={n}&lang=TR',
  ups: 'https://www.ups.com/track?loc=tr_TR&tracknum={n}',
  dhl: 'https://kargotakip.dhlecommerce.com.tr/?takipNo={n}',
};
const TRACK_ALIAS = { araskargo: 'aras', yurticikargo: 'yurtici', suratkargo: 'surat', hepsijetxl: 'hepsijet', pttkargo: 'ptt', mng: 'dhl', mngkargo: 'dhl', dhlecommerce: 'dhl' };
export function trackUrl(carrier, n) {
  if (!n) return '';
  const k = nameKey(carrier), t = TRACK[k] || TRACK[TRACK_ALIAS[k]] || TRACK[Object.keys(TRACK).find((x) => k.startsWith(x)) || ''];
  return t ? t.replace('{n}', encodeURIComponent(n)) : '';
}
