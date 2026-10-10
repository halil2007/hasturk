// Aras Kargo web servisi (customerws.araskargo.com.tr; SOAP / ASMX, namespace tempuri.org).
// Gönderi: SetOrder (entegrasyon kodu = bizim sipariş-paket anahtarımız; büyük harf, en çok 32) + parça barkodu (şube bunu okutur).
// Hesapta barkod yetkisi varsa GetBarcode aynı anda Aras etiketini (ZPL) ve 13 haneli takip numarasını verir; yoksa panel etiketi
// parça barkoduyla basılır. Takip ayrı servisten (GetQueryJSON) ve ayrı bilgilerle (esasweb XML servis kullanıcısı + müşteri kodu) yapılır.
// Öğe adlarının büyük / küçük harfi işleme göre değişir (userName / Username): zarflar dokümandaki gibi.
import { str, sleep } from '../util.js';
import { soap, esc, tag, tags, phone10, trUpper, cut, money, trackUrl } from './common.js';

const URL = (test) => (test ? 'https://customerservicestest.araskargo.com.tr/arascargoservice/arascargoservice.asmx' : 'https://customerws.araskargo.com.tr/arascargoservice.asmx');
const QUERY = 'https://customerservices.araskargo.com.tr/ArasCargoCustomerIntegrationService/ArasCargoIntegrationService.svc';
const NS = 'http://tempuri.org/';

export const integrationCode = (s) => str(s.reference).toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(-30).padStart(2, '0');

export function make(values) {
  const test = values.ARAS_ENV === 'test', user = str(values.ARAS_USER), pass = str(values.ARAS_PASSWORD);
  const call = (op, inner, url = URL(test), action = NS + op) => soap(url, { ns: NS, action, body: `<${op} xmlns="${NS}">${inner}</${op}>` })
    .catch((e) => { throw new Error('Aras: ' + e.message); });
  const codeOf = (x) => tag(x, 'ResultCode'), msgOf = (x) => tag(x, 'ResultMessage') || tag(x, 'Message');
  // Aras etiketi (barkod yetkisi olan hesaplarda): şube kodu belirlenene kadar birkaç saniye "hazır değil" (1004) dönebilir
  async function barcode(code, tries = 2) {
    for (let i = 0; i < tries; i++) {
      const x = await call('GetBarcode', `<Username>${esc(user)}</Username><Password>${esc(pass)}</Password><integrationCode>${esc(code)}</integrationCode>`);
      if (codeOf(x) === '0') {
        const zpl = tags(tag(x, 'ZebraZpl'), 'string').filter((z) => /\^XA/.test(z)).join('\n');
        const model = tags(x, 'BarcodeModel')[0] || '';
        return { tracking: tag(model, 'TrackingNumber'), label: zpl ? { format: 'zpl', data: zpl } : null };
      }
      if (codeOf(x) !== '1004' || i === tries - 1) return null; // yetki yok / bulunamadı: panel etiketi
      await sleep(2500);
    }
    return null;
  }
  return {
    async test() {
      // Kimlik denemesi: var olmayan siparişin etiketi istenir (1000 = kullanıcı adı / şifre yanlış)
      const x = await call('GetBarcode', `<Username>${esc(user)}</Username><Password>${esc(pass)}</Password><integrationCode>HASTURK-TEST</integrationCode>`);
      if (codeOf(x) === '1000' || /şifre/i.test(msgOf(x))) return { ok: false, message: 'Aras kullanıcı adı veya şifresi hatalı' };
      const q = str(values.ARAS_QUERY_USER) && str(values.ARAS_CUSTOMER_CODE);
      return { ok: true, message: `Aras Kargo bağlantısı tamam${test ? ' (test ortamı)' : ''}${q ? '' : ' · kargo durumu takibi için esasweb XML servis bilgilerini de girin'}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone), code = integrationCode(s);
      if (!r.district) throw new Error('Aras alıcı ilçesini istiyor; sipariş adresinde ilçe yok');
      if (phone.length !== 10) throw new Error('Aras alıcı telefonunu istiyor (10 hane); siparişte geçerli telefon yok');
      const desi = Math.max(1, Math.round((Number(s.desi) || 1) * 100) / 100), piece = (code.replace(/-/g, '') + '01').slice(-64);
      const content = cut((s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', '), 255);
      // Tüm öğeler gönderilir (eksik öğe sunucuda hata verir), WSDL sırasıyla
      const order = `<UserName>${esc(user)}</UserName><Password>${esc(pass)}</Password><TradingWaybillNumber>${esc(code.slice(-16))}</TradingWaybillNumber><InvoiceNumber>${esc(code.slice(-20))}</InvoiceNumber>`
        + `<ReceiverName>${esc(cut(r.name, 100))}</ReceiverName><ReceiverAddress>${esc(cut(r.address, 250))}</ReceiverAddress><ReceiverPhone1>${phone}</ReceiverPhone1>`
        + `<ReceiverCityName>${esc(trUpper(r.city))}</ReceiverCityName><ReceiverTownName>${esc(cut(trUpper(r.district), 16))}</ReceiverTownName>`
        + `<VolumetricWeight>${desi}</VolumetricWeight><Weight>${desi}</Weight><PieceCount>1</PieceCount><IntegrationCode>${esc(code)}</IntegrationCode>`
        + `<Description>${esc(content)}</Description><PayorTypeCode>1</PayorTypeCode><IsWorldWide>0</IsWorldWide><IsCod>0</IsCod>`
        + `<PieceDetails><PieceDetail><VolumetricWeight>${desi}</VolumetricWeight><Weight>${desi}</Weight><BarcodeNumber>${esc(piece)}</BarcodeNumber><ProductNumber></ProductNumber><Description>${esc(cut(content, 64))}</Description></PieceDetail></PieceDetails>`;
      const x = await call('SetOrder', `<orderInfo><Order>${order}</Order></orderInfo><userName>${esc(user)}</userName><password>${esc(pass)}</password>`);
      if (codeOf(x) === '1000') throw new Error('Aras kullanıcı adı veya şifresi hatalı');
      if (codeOf(x) !== '0') throw new Error('Aras: ' + (msgOf(x) || `gönderi oluşturulamadı (kod ${codeOf(x)})`));
      const b = await barcode(code).catch(() => null);
      return { ref: code, tracking: (b && b.tracking) || '', barcode: (b && b.tracking) || piece, carrier: 'Aras Kargo', trackingUrl: b && b.tracking ? trackUrl('aras', b.tracking) : '', cost: null, label: b ? b.label : null };
    },
    async cancel(ref) {
      const x = await call('CancelDispatch', `<userName>${esc(user)}</userName><password>${esc(pass)}</password><integrationCode>${esc(ref)}</integrationCode>`);
      if (['0', '1', '405'].includes(codeOf(x))) return;
      throw new Error('Aras gönderisi iptal edilemedi' + (codeOf(x) === '999' ? ' (irsaliye kesilmiş; Aras şubesinden iptal isteyin)' : '') + ': ' + (msgOf(x) || codeOf(x)));
    },
    async label(pkg) {
      const b = await barcode(pkg.carrier_ref, 3);
      return b && b.label ? { ...b.label, tracking: b.tracking, trackingUrl: b.tracking ? trackUrl('aras', b.tracking) : '' } : null;
    },
    // Kargo durumu: esasweb XML servis bilgileri (kullanıcı, şifre, müşteri kodu) girildiyse
    async track(pkg) {
      const qu = str(values.ARAS_QUERY_USER), qp = str(values.ARAS_QUERY_PASSWORD), cc = str(values.ARAS_CUSTOMER_CODE);
      if (!qu || !cc) return { state: null };
      const login = `<LoginInfo><UserName>${esc(qu)}</UserName><Password>${esc(qp)}</Password><CustomerCode>${esc(cc)}</CustomerCode></LoginInfo>`;
      const q = `<QueryInfo><QueryType>39</QueryType><IntegrationCode>${esc(pkg.carrier_ref)}</IntegrationCode></QueryInfo>`;
      const x = await soap(QUERY, { ns: NS, prefix: 'tem', action: NS + 'IArasCargoIntegrationService/GetQueryJSON', body: `<tem:GetQueryJSON><tem:loginInfo>${esc(login)}</tem:loginInfo><tem:queryInfo>${esc(q)}</tem:queryInfo></tem:GetQueryJSON>` })
        .catch((e) => { throw new Error('Aras takip: ' + e.message); });
      let j; try { j = JSON.parse(tag(x, 'GetQueryJSONResult') || 'null'); } catch { j = null; }
      // Yanıt içinde DURUM_KODU taşıyan ilk kayıt
      const find = (v) => { if (!v || typeof v !== 'object') return null; if ('DURUM_KODU' in v || 'KARGO_TAKIP_NO' in v) return v; for (const k of Object.keys(v)) { const f = find(v[k]); if (f) return f; } return null; };
      const row = find(j);
      if (!row) return { state: 'created', text: 'Şube kabulü bekleniyor' };
      const no = str(row.KARGO_TAKIP_NO), durum = Number(row.DURUM_KODU), tip = Number(row.TIP_KODU);
      const state = tip === 3 ? 'returned' : durum === 6 ? 'delivered' : durum >= 1 ? 'transit' : 'created';
      const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(str(row.TESLIM_TARIHI)), h = /(\d{2}):(\d{2})/.exec(str(row.TESLIM_SAATI));
      return { state, text: str(row.DURUMU || row.DURUM_EN), tracking: no, barcode: no || pkg.barcode, trackingUrl: no ? trackUrl('aras', no) : '', cost: money(row.TUTAR),
        deliveredAt: state === 'delivered' && m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T${h ? h[1] : '12'}:${h ? h[2] : '00'}:00+03:00`) : null };
    },
  };
}
