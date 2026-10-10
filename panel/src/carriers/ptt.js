// PTT Kargo kurumsal web servisleri (pttws.ptt.gov.tr; SOAP / Axis2).
// Gönderi "veri yükleme"dir (kabulEkle2): PTT barkod üretmez — müşteriye verilen barkod aralığından sıradaki 12 hane alınır,
// kontrol hanesi eklenir (13 hane) ve etikete basılır; şubede okutulunca gönderi kabul edilir. Sıra sayacı panelde tutulur.
// Takip (GonderiTakipV2 / gonderiSorgu2) ancak şube kabulünden sonra veri döner. Silme yalnız kabulden önce yapılabilir.
// Hatalar HTTP 200 içinde gelir: hataKodu (1 = başarılı), gönderi başına donguHataKodu / donguSonuc.
import { first } from '../db.js';
import { str } from '../util.js';
import { soap, esc, tag, tags, phone10, trUpper, fullAddress, trackUrl } from './common.js';

const URL = (test) => `https://pttws.ptt.gov.tr/${test ? 'PttVeriYuklemeTest' : 'PttVeriYukleme'}/services/Sorgu`;
const TRACK = 'https://pttws.ptt.gov.tr/GonderiTakipV2/services/Sorgu';
const K = 'http://kabul.ptt.gov.tr', KX = 'http://kabul.ptt.gov.tr/xsd';

// 12 haneye PTT kontrol hanesi: soldan 1,3,1,3… ağırlıklı toplam, bir üst 10'un katına tamamlayan rakam
export function pttCheckDigit(body12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (s % 10)) % 10);
}

export function make(values, { db } = {}) {
  const test = values.PTT_ENV === 'test', id = str(values.PTT_CUSTOMER_NO), pass = str(values.PTT_PASSWORD);
  // Gövde öğeleri xsd önekli (elementFormDefault = qualified): zarfa ikinci önek eklenir
  const op = (name, wrap, fields, url = URL(test), ns = K, nsx = KX) => soap(url, {
    ns, prefix: 'kab', action: 'urn:' + name,
    body: `<kab:${name} xmlns:xsd="${nsx}"><kab:${wrap}>${Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<xsd:${k}>${esc(v)}</xsd:${k}>`).join('')}</kab:${wrap}></kab:${name}>`,
  }).catch((e) => { throw new Error('PTT: ' + e.message); });
  const fail = (x) => {
    const code = tag(x, 'hataKodu'), msg = tag(x, 'aciklama');
    if (code === '-1' || /S[İI]FRE HATALI/i.test(msg)) return 'PTT müşteri numarası veya web servis şifresi hatalı';
    return code !== '1' ? 'PTT: ' + (msg || `işlem reddedildi (kod ${code || '?'})`) : '';
  };
  // Barkod aralığından sıradaki numara (atomik sayaç: aynı anda iki gönderi aynı barkodu alamaz)
  async function nextBarcode() {
    const start = str(values.PTT_BARCODE_START).replace(/\D/g, '').slice(0, 12), end = str(values.PTT_BARCODE_END).replace(/\D/g, '').slice(0, 12);
    if (start.length !== 12) throw new Error('PTT barkod aralığının başlangıcı 12 haneli olmalı (PTT\'nin verdiği aralık, kontrol hanesi olmadan)');
    if (!db) throw new Error('PTT barkod sayacı kullanılamıyor');
    const r = await first(db, `INSERT INTO settings (k, v) VALUES (?, '0') ON CONFLICT(k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + 1 AS TEXT) RETURNING v`, 'ptt_barcode_seq:' + start);
    const body = String(BigInt(start) + BigInt(Number(r && r.v) || 0)).padStart(12, '0');
    if (end.length === 12 && BigInt(body) > BigInt(end)) throw new Error('PTT barkod aralığı doldu: PTT\'den yeni aralık isteyip Entegrasyonlar → PTT Kargo bölümüne girin');
    return body + pttCheckDigit(body);
  }
  return {
    async test() {
      // Kimlik denemesi: var olmayan barkodun etiketi istenir; şifre hatalıysa -1 döner
      const x = await op('etiketGetir', 'input', { barkodNo: '0000000000000', musteriId: id, sifre: pass });
      if (tag(x, 'hataKodu') === '-1' || /S[İI]FRE HATALI/i.test(tag(x, 'aciklama'))) return { ok: false, message: 'PTT müşteri numarası veya web servis şifresi hatalı' };
      const start = str(values.PTT_BARCODE_START).replace(/\D/g, '');
      return { ok: true, message: `PTT bağlantısı tamam${test ? ' (test ortamı)' : ''}${start.length === 12 ? '' : ' · barkod aralığı girilmedi: gönderi açmak için PTT\'nin verdiği aralığı girin'}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone);
      if (!r.district) throw new Error('PTT alıcı ilçesini istiyor; sipariş adresinde ilçe yok');
      const barkod = await nextBarcode(), t = new Date(Date.now() + 3 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14);
      const ref = s.reference.replace(/[^\w.-]/g, '-').slice(0, 60), dosya = `${ref}-${t}`.slice(0, 50);
      const name = r.name.length >= 5 ? r.name : r.name.padEnd(5, '.'), addr = fullAddress(r);
      // Alanlar WSDL sırasıyla (alfabetik)
      const d = [['aAdres', addr.length >= 5 ? addr.slice(0, 255) : addr.padEnd(5, '.')], ['agirlik', Math.max(1, Math.round((Number(s.desi) || 1) * 1000))], ['aliciAdi', name.slice(0, 100)],
        ['aliciEmail', r.email], ['aliciIlAdi', trUpper(r.city)], ['aliciIlceAdi', trUpper(r.district)], ['aliciSms', phone.length === 10 ? phone : ''], ['aliciTel', phone.length === 10 ? phone : ''],
        ['barkodNo', barkod], ['desi', Number(s.desi) || 1], ['musteriReferansNo', ref], ['odemesekli', 'MH']]
        .filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<xsd:${k}>${esc(v)}</xsd:${k}>`).join('');
      const head = [['dosyaAdi', dosya], ['gonderiTip', 'NORMAL'], ['gonderiTur', 'KARGO'], ['kullanici', 'PttWs'], ['musteriId', id], ['sifre', pass]].map(([k, v]) => `<xsd:${k}>${esc(v)}</xsd:${k}>`).join('');
      const x = await soap(URL(test), { ns: K, prefix: 'kab', action: 'urn:kabulEkle2', body: `<kab:kabulEkle2 xmlns:xsd="${KX}"><kab:input><xsd:dongu>${d}</xsd:dongu>${head}</kab:input></kab:kabulEkle2>` })
        .catch((e) => { throw new Error('PTT: ' + e.message); });
      const err = fail(x);
      if (err) throw new Error(err);
      const dg = tags(x, 'dongu')[0] || '';
      if (tag(dg, 'donguHataKodu') !== '1' || tag(dg, 'donguSonuc') === 'false') throw new Error('PTT gönderiyi kabul etmedi: ' + (tag(dg, 'donguAciklama') || 'bilinmeyen hata'));
      const url = /^https?:\/\//.test(tag(dg, 'donguAciklama')) ? tag(dg, 'donguAciklama') : trackUrl('ptt', barkod);
      // Silme için dosya adı da saklanır (ref = barkod|dosya)
      return { ref: `${barkod}|${dosya}`, tracking: barkod, barcode: barkod, carrier: 'PTT Kargo', trackingUrl: url, cost: null, label: null };
    },
    async cancel(ref) {
      const [barcode, dosya] = String(ref).split('|');
      const x = await op('barkodVeriSil', 'inpDelete', { barcode, dosyaAdi: dosya, musteriId: id, sifre: pass });
      const err = fail(x);
      if (err) throw new Error(err.replace(/^PTT: /, 'PTT gönderisi silinemedi (şubede kabul edildiyse PTT\'den iptal isteyin): '));
    },
    async track(pkg) {
      const barkod = str(pkg.tracking) || String(pkg.carrier_ref).split('|')[0];
      const x = await op('gonderiSorgu2', 'input', { barkod, kullanici: id, sifre: pass }, TRACK, 'http://takip.ptt.gov.tr', 'http://takip.ptt.gov.tr/xsd');
      if (/hatal/i.test(tag(x, 'sonucAciklama')) && tag(x, 'sonucKodu') === '1') throw new Error('PTT takip: kullanıcı veya şifre hatalı');
      const events = tags(x, 'dongu').map((e) => ({ text: tag(e, 'ISLEM'), at: tag(e, 'ITARIH'), no: Number(tag(e, 'siraNo')) || 0 })).sort((a, b) => a.no - b.no);
      if (!tag(x, 'BARNO') && !events.length) return { state: 'created', text: 'Şube kabulü bekleniyor', tracking: barkod };
      const last = events[events.length - 1] || {}, got = str(tag(x, 'TESALAN'));
      const delivered = !!got || /teslim edildi/i.test(last.text || '');
      const state = delivered && !/iade/i.test(last.text || '') ? 'delivered' : /iade/i.test(last.text || '') ? 'returned' : 'transit';
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(last.at || '');
      return { state, text: last.text || '', tracking: barkod, deliveredAt: state === 'delivered' && m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T12:00:00+03:00`) : null,
        trackingUrl: /^https?:\/\//.test(tag(x, 'sonucAciklama')) ? tag(x, 'sonucAciklama') : '' };
    },
  };
}
