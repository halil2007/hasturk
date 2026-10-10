// Sürat Kargo web servisi (webservices.suratkargo.com.tr, SOAP; takip: api01 REST).
// Gönderi "ön kabul"dür (GonderiyiKargoyaGonderYeni): bizim verdiğimiz OzelKargoTakipNo (Sürat'ta WebSiparisKodu) etikete barkod olarak
// basılır; şube okutunca Sürat kendi takip numarasını (KargoTakipNo) verir — takip sorgusuyla sonradan pakete yazılır.
// Hesabında barkod yetkisi olan firmalar için Sürat etiketi (PDF) KargoBarkodu ile alınabilir (web servis şifresi gerekir).
import { http, str } from '../util.js';
import { soap, esc, tag, phone10, cut, fullAddress, trackUrl } from './common.js';

const SOAP_URL = (test) => (test ? 'https://prova.suratkargo.com.tr/services.asmx' : 'https://webservices.suratkargo.com.tr/services.asmx');
const REST = (test) => (test ? 'https://api02.suratkargo.com.tr/api' : 'https://api01.suratkargo.com.tr/api');
const NS = 'http://tempuri.org/';
// Sonuç kodları: başarılı / zaten var sayılanlar
const OK = /^(tamam|010|011|012|013|014|015|016|039)$/i;
const DUP = /^009$|daha önce oluşturulmuş|gönderi oluşmuştur/i;
const CODES = { '001': 'Kullanıcı adı (cari kod) veya şifre yanlış', '002': 'alıcı adı eksik', '003': 'alıcı adresi eksik', '004': 'il / ilçe bilgisi eksik', '006': 'desi / kg sıfırdan büyük olmalı',
  '018': 'Sürat sözleşmesi bulunamadı', '019': 'telefon biçimi hatalı', '020': 'telefon numarası rakamlardan oluşmalı', '022': 'cep telefonu 05 ile başlamalı', '024': 'cep telefonu en az 10 hane olmalı', '038': 'takip numarası oluşturulamadı, tekrar deneyin', '042': 'Sürat sistem hatası' };
// KargonunDurumuSayi → panel takip durumu
const STATES = { 1: 'created', 2: 'transit', 3: 'transit', 4: 'transit', 5: 'transit', 6: 'delivered', 7: 'transit', 9: 'returned', 11: 'transit', 13: 'returned', 14: 'delivered' };

export function make(values) {
  const test = values.SURAT_ENV === 'test', user = str(values.SURAT_USER), pass = str(values.SURAT_PASSWORD), web = str(values.SURAT_WEB_PASSWORD);
  // Sürat sunucuları Cloudflare güvenlik duvarı arkasında: engellenen istek anlaşılır mesajla
  const blocked = (e) => new Error(/HTTP 403|güvenlik duvarı/i.test(e.message) ? 'Sürat sunucusu isteği güvenlik duvarında engelledi. Sürat Kargo entegrasyon ekibinden panelimizin (Cloudflare) erişimine izin vermesini isteyin.' : 'Sürat: ' + e.message);
  const call = (op, inner) => soap(SOAP_URL(test), { ns: NS, action: NS + op, body: `<${op} xmlns="${NS}">${inner}</${op}>` }).catch((e) => { throw blocked(e); });
  const message = (s) => { const t = str(s).replace(/^"|"$/g, ''); const code = (/\[?(\d{3})\]?/.exec(t) || [])[1]; return { t, code, ok: OK.test(t) || (code && OK.test(code)), dup: DUP.test(t) || code === '009' }; };
  async function query(ref) {
    const url = `${REST(test)}/KargoTakipHareketDetayi?CariKodu=${encodeURIComponent(user)}&Sifre=${encodeURIComponent(str(values.SURAT_TRACK_PASSWORD) || pass)}&WebSiparisKodu=${encodeURIComponent(ref)}`;
    const j = await http(url, { method: 'POST', body: '', headers: { Accept: 'application/json' } }).catch((e) => { throw blocked(e); });
    return typeof j === 'string' ? JSON.parse(j || '{}') : j || {};
  }
  return {
    async test() {
      // Kimlik denemesi: var olmayan sipariş sorgulanır; şifre hatalıysa açıklama döner
      const j = await query('HASTURK-TEST-' + Date.now());
      if (j.IsError && /şifre|sifre|kullan[ıi]c[ıi]/i.test(str(j.errorMessage))) return { ok: false, message: 'Sürat cari kodu veya şifresi hatalı' };
      return { ok: true, message: `Sürat Kargo bağlantısı tamam${test ? ' (test ortamı)' : ''}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone);
      if (!r.district) throw new Error('Sürat alıcı ilçesini istiyor; sipariş adresinde ilçe yok');
      // Barkod olarak basılacağı için yalnız harf / rakam / tire
      const key = s.reference.toUpperCase().replace(/[^A-Z0-9-]/g, '-').slice(0, 50);
      const desi = String(Math.max(1, Math.ceil(Number(s.desi) || 1)));
      const g = [['KisiKurum', cut(r.name, 100)], ['AliciAdresi', cut(fullAddress(r), 250)], ['Il', r.city], ['Ilce', r.district], ['TelefonCep', phone.length === 10 ? '0' + phone : ''],
        ['Email', r.email], ['KargoTuru', 3], ['OdemeTipi', 1], ['ReferansNo', cut(s.orderNumber || key, 50)], ['OzelKargoTakipNo', key], ['Adet', 1], ['BirimDesi', desi], ['BirimKg', desi],
        ['KargoIcerigi', cut((s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', '), 100)], ['KapidanOdemeTahsilatTipi', 0], ['TasimaSekli', 1], ['TeslimSekli', 1], ['GonderiSekli', 0], ['Pazaryerimi', 0], ['Iademi', 'false']]
        .filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
      const x = await call('GonderiyiKargoyaGonderYeni', `<KullaniciAdi>${esc(user)}</KullaniciAdi><Sifre>${esc(pass)}</Sifre><Gonderi>${g}</Gonderi>`);
      const m = message(tag(x, 'GonderiyiKargoyaGonderYeniResult'));
      if (!m.ok && !m.dup) throw new Error('Sürat: ' + (CODES[m.code] || m.t || 'gönderi oluşturulamadı'));
      return { ref: key, tracking: '', barcode: key, carrier: 'Sürat Kargo', trackingUrl: '', cost: null, label: null };
    },
    async cancel(ref) {
      if (!web) throw new Error('Sürat gönderisini panelden iptal etmek için Sürat web servis şifresi gerekir (e-Sürat → profil → Web Servis Şifre); Entegrasyonlar → Sürat Kargo bölümüne girin');
      const x = await call('GonderiSil', `<cariKodu>${esc(user)}</cariKodu><WebPassword>${esc(web)}</WebPassword><ozelKargoTakipNo>${esc(ref)}</ozelKargoTakipNo>`);
      const t = tag(x, 'GonderiSilResult');
      if (!/ba[sş]ar|silindi|tamam/i.test(t)) throw new Error('Sürat gönderisi silinemedi: ' + (t || 'bilinmeyen hata'));
    },
    async track(pkg) {
      const j = await query(pkg.carrier_ref);
      const g = (j.Gonderiler || [])[0];
      if (j.IsError || !g) {
        const e = str(j.errorMessage);
        if (/iptal/i.test(e)) return { state: 'cancelled', text: e };
        return { state: 'created', text: e && !/kabul bekleniyor/i.test(e) ? e : 'Şube kabulü bekleniyor' };
      }
      const no = str(g.KargoTakipNo), st = STATES[Number(g.KargonunDurumuSayi)] || null;
      const m = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(str(g.TeslimTarihi));
      return { state: st, text: str(g.KargonunDurumu), tracking: no, barcode: no || pkg.carrier_ref, trackingUrl: str(g.TakipUrl) || trackUrl('surat', no),
        deliveredAt: st === 'delivered' && m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4] || '12'}:${m[5] || '00'}:00+03:00`) : null };
    },
    // Barkod yetkisi olan hesaplarda Sürat'ın kendi etiketi (PDF)
    async label(pkg) {
      if (!web) return null;
      const x = await call('KargoBarkodu', `<cariKodu>${esc(user)}</cariKodu><WebPassword>${esc(web)}</WebPassword><ozelKargoTakipNo>${esc(pkg.carrier_ref)}</ozelKargoTakipNo>`);
      const pdf = tag(x, 'PdfBarkod').replace(/\s+/g, '');
      return pdf.length > 100 ? { format: 'pdf', data: pdf, tracking: tag(x, 'KargoTakipNo') } : null;
    },
  };
}
