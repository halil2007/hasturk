// DHL Express Türkiye — MyDHL API (express.api.dhl.com/mydhlapi, OpenAPI "dpdhl-express-api" 3.3.3; REST / JSON).
// Kimlik: developer.dhl.com'da açılan MyDHL API uygulamasının API Key / Secret'ı → her istekte HTTP Basic. Gönderiler DHL Express
// gönderen (shipper) hesap numaranıza faturalanır. Ortamlar: canlı …/mydhlapi, test …/mydhlapi/test.
// Gönderi tek istekte açılır (POST /shipments): AWB (shipmentTrackingNumber) + parça numaraları + base64 PDF etiket aynı yanıtta gelir.
// Yurt içi (TR → TR) gönderide gümrük beyanı yok (isCustomsDeclarable: false); ürün kodu varsayılan "N" (DOMESTIC EXPRESS).
// MyDHL API'de gönderi iptal servisi yok: kuryeye verilmeyen AWB faturalanmaz (yalnız kurye çağrısı DELETE /pickups/{no} ile iptal edilir;
// bu bağlantı kurye çağırmaz, pickup.isRequested: false). Takip: GET /shipments/{awb}/tracking (olay kodları: PU alındı, WC dağıtımda,
// OK teslim edildi, RT göndericiye iade …). Hatalar RFC 7807 biçiminde: { title, detail, status, additionalDetails[] }.
// carrier_ref = takip numarası = AWB.
import { http, basic, str } from '../util.js';
import { phone10, money, cut, b64 } from './common.js';
import { plateOf } from './kolaygelsin.js';

const BASE = (test) => (test ? 'https://express.api.dhl.com/mydhlapi/test' : 'https://express.api.dhl.com/mydhlapi');
// Herkese açık takip sayfası (common.js trackUrl 'dhl' anahtarı DHL eCommerce'e gider; DHL Express ayrı)
export const publicUrl = (n) => (n ? `https://www.dhl.com/tr-tr/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}` : '');
const DELIVERED = ['OK', 'DD'], RETURNED = ['RT'], CREATED = ['SA', 'PS'];
// Planlanan gönderim zamanı (Türkiye saati, en çok 10 gün sonrası): bugün 17:00'den önceyse 2 saat sonrası, değilse ertesi gün 10:00
export function plannedAt(now = Date.now()) {
  const tr = new Date(now + 3 * 3600e3);
  let d = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate(), tr.getUTCHours() + 2, tr.getUTCMinutes()));
  if (tr.getUTCHours() >= 17) d = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate() + 1, 10, 0));
  if (d.getUTCDay() === 0) d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 10, 0)); // pazar → pazartesi
  return d.toISOString().slice(0, 19) + ' GMT+03:00';
}
// Adres en çok 3 satır × 45 karakter (kelime sınırından bölünür)
export function lines(text, n = 3, w = 45) {
  const out = [''];
  for (const word of str(text).split(/\s+/).filter(Boolean)) {
    const cur = out[out.length - 1];
    if (!cur) out[out.length - 1] = word.slice(0, w);
    else if ((cur + ' ' + word).length <= w) out[out.length - 1] = cur + ' ' + word;
    else if (out.length < n) out.push(word.slice(0, w));
    else break;
  }
  return out.filter(Boolean);
}

export function make(values) {
  const test = values.DHLEXPRESS_ENV === 'test', base = BASE(test);
  const auth = basic(str(values.DHLEXPRESS_API_KEY), str(values.DHLEXPRESS_API_SECRET)), account = str(values.DHLEXPRESS_ACCOUNT);
  const call = async (method, path, body) => {
    let res;
    try {
      res = await http(base + path, { method, raw: true, tries: method === 'GET' ? 2 : 1, timeout: 45000,
        headers: { Authorization: auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      const m = /HTTP (\d+) (.*)$/s.exec(e.message || ''), status = m ? Number(m[1]) : 0;
      if (status === 401) throw Object.assign(new Error('DHL Express API Key / Secret hatalı (401)'), { status });
      let j = null; try { j = JSON.parse(m ? m[2] : ''); } catch { /* yarım / düz metin */ }
      const det = j && Array.isArray(j.additionalDetails) && j.additionalDetails.length ? j.additionalDetails.join('; ') : '';
      const dm = /"detail"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(m ? m[2] : '');
      const msg = det || str(j && (j.detail || j.title || j.message)) || (dm ? JSON.parse(`"${dm[1]}"`) : m ? m[2] : e.message);
      throw Object.assign(new Error('DHL Express: ' + msg), { status });
    }
    const text = await res.text();
    try { return text ? JSON.parse(text) : {}; } catch { throw new Error('DHL Express: beklenmeyen yanıt (' + text.slice(0, 120) + ')'); }
  };
  // Posta kodu: siparişte yoksa DHL'in adres doğrulamasından (il / ilçe), o da olmazsa ilin merkez kodu (plaka + 000)
  async function postal(city, district, given, type) {
    if (/^\d{5}$/.test(str(given))) return str(given);
    try {
      const q = new URLSearchParams({ type, countryCode: 'TR', cityName: cut(city, 45), ...(district ? { countyName: cut(district, 45) } : {}) });
      const j = await call('GET', '/address-validate?' + q);
      const a = (Array.isArray(j.address) ? j.address : []).find((x) => /^\d{5}$/.test(str(x.postalCode)));
      if (a) return str(a.postalCode);
    } catch { /* tahmine düşülür */ }
    const p = plateOf(city);
    return p ? String(p).padStart(2, '0') + '000' : ''; // DOĞRULA: DHL'in il merkez posta kodunu kabul ettiği
  }
  const party = (p, postalCode, company, typeCode) => {
    const ph = phone10(p.phone);
    return {
      postalAddress: { postalCode, cityName: cut(p.city, 45), countyName: cut(p.district, 45) || undefined, countryCode: 'TR', ...Object.fromEntries(lines(p.address).map((l, i) => [`addressLine${i + 1}`, l])) },
      contactInformation: { fullName: cut(p.name, 255), companyName: cut(company || p.name, 100), phone: ph ? '+90' + ph : '', ...(/^5/.test(ph) ? { mobilePhone: '+90' + ph } : {}), ...(p.email ? { email: cut(p.email, 70) } : {}) },
      typeCode,
    };
  };
  return {
    async test() {
      // Kimlik denemesi: adres doğrulama (gönderi açmaz, ücretsiz)
      await call('GET', '/address-validate?' + new URLSearchParams({ type: 'pickup', countryCode: 'TR', postalCode: '34000', cityName: 'Istanbul' }));
      return { ok: true, message: `DHL Express bağlantısı tamam${test ? ' (test ortamı)' : ''}` };
    },
    async create(s) {
      const r = s.receiver, snd = s.sender;
      if (phone10(r.phone).length !== 10) throw new Error('DHL Express alıcı telefonunu istiyor (10 hane); siparişte geçerli telefon yok');
      if (!r.city) throw new Error('DHL Express alıcı ilini istiyor; sipariş adresinde il yok');
      if (!snd.city || !snd.address) throw new Error('DHL Express gönderen adresini istiyor: Ayarlar → Kargo etiketi → Gönderen');
      if (phone10(snd.phone).length !== 10) throw new Error('DHL Express gönderen telefonunu istiyor (10 hane): Ayarlar → Kargo etiketi → Gönderen');
      const [rp, sp] = [await postal(r.city, r.district, r.postalCode, 'delivery'), await postal(snd.city, snd.district, values.DHLEXPRESS_SENDER_POSTCODE, 'pickup')];
      if (!rp) throw new Error(`DHL Express: alıcı posta kodu bulunamadı (“${r.city}”)`);
      const ref = str(s.reference).slice(0, 35), weight = Math.max(0.5, Math.round((Number(s.desi) || 1) * 10) / 10);
      const content = (s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ');
      const body = {
        plannedShippingDateAndTime: plannedAt(), pickup: { isRequested: false },
        productCode: str(values.DHLEXPRESS_PRODUCT) || 'N', accounts: [{ typeCode: 'shipper', number: account }],
        outputImageProperties: { encodingFormat: 'pdf', imageOptions: [{ typeCode: 'label', templateName: 'ECOM26_84_001', isRequested: true }, { typeCode: 'waybillDoc', isRequested: false }], allDocumentsInOneImage: false },
        customerReferences: [{ value: ref, typeCode: 'CU' }],
        customerDetails: {
          shipperDetails: party(snd, sp, str(values.DHLEXPRESS_COMPANY) || snd.name, 'business'),
          receiverDetails: party(r, rp, r.name, 'private'),
        },
        content: {
          packages: [{ weight, customerReferences: [{ value: ref, typeCode: 'CU' }], description: cut(content, 70) || undefined }],
          isCustomsDeclarable: false, description: cut(content, 70) || 'Paket', unitOfMeasurement: 'metric',
          ...(s.value > 0 ? { declaredValue: s.value, declaredValueCurrency: s.currency || 'TRY' } : {}),
        },
      };
      const j = await call('POST', '/shipments', body);
      const awb = str(j.shipmentTrackingNumber);
      if (!awb) throw new Error('DHL Express gönderi (AWB) numarası vermedi');
      const docs = (Array.isArray(j.documents) ? j.documents : []).filter((d) => str(d.content));
      const lab = docs.find((d) => /label/i.test(d.typeCode)) || docs[0];
      const charge = (Array.isArray(j.shipmentCharges) ? j.shipmentCharges : []).find((c) => /BILLC|TRY/i.test(`${c.currencyType} ${c.priceCurrency}`));
      return {
        ref: awb, tracking: awb, barcode: awb, carrier: 'DHL Express', trackingUrl: publicUrl(awb), cost: charge ? money(charge.price) : null,
        label: lab ? { format: /zpl/i.test(lab.imageFormat) ? 'zpl' : 'pdf', data: /zpl/i.test(lab.imageFormat) ? atob(b64(lab.content)) : b64(lab.content) } : null,
      };
    },
    // İptal servisi yok: kuryeye verilmeyen AWB faturalanmaz; panelde gönderi kaldırılır
    async cancel() {}, // DOĞRULA: kullanılmayan AWB'nin DHL Express Türkiye'de ücretlendirilmediği
    async track(pkg) {
      const awb = str(pkg.carrier_ref);
      let j;
      try { j = await call('GET', `/shipments/${encodeURIComponent(awb)}/tracking?trackingView=all-checkpoints&levelOfDetail=shipment&requestGMTOffsetPerEvent=true`); } catch (e) {
        if (e.status === 404) return { state: 'created', text: 'Gönderi henüz DHL\'e teslim edilmedi', tracking: awb, barcode: awb, trackingUrl: publicUrl(awb) };
        throw e;
      }
      const sh = (Array.isArray(j.shipments) ? j.shipments : [])[0] || {};
      const ev = (Array.isArray(sh.events) ? sh.events : []).slice().sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
      const last = ev[ev.length - 1];
      if (!last) return { state: 'created', text: 'Gönderi kaydı alındı', tracking: awb, barcode: awb, trackingUrl: publicUrl(awb) };
      const code = str(last.typeCode).toUpperCase();
      const state = DELIVERED.includes(code) ? 'delivered' : RETURNED.includes(code) ? 'returned' : CREATED.includes(code) ? 'created' : 'transit';
      const at = Date.parse(`${last.date}T${last.time || '12:00:00'}${/[+-]\d{2}:?\d{2}$/.test(str(last.GMTOffset)) ? last.GMTOffset : '+03:00'}`);
      return { state, text: str(last.description), tracking: awb, barcode: awb, trackingUrl: publicUrl(awb), deliveredAt: state === 'delivered' && Number.isFinite(at) ? at : null };
    },
  };
}
