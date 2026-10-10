// DHL eCommerce Türkiye (eski MNG Kargo) API (IBM API Connect, api.mngkargo.com.tr/mngapi/api).
// İki kimlik: geliştirici portalındaki uygulama anahtarları (X-IBM-Client-Id / Secret, her istekte) + müşteri numarası / şifresi (JWT).
// Gönderi iki adımda açılır: createOrder (sipariş kaydı) → createbarcode (gönderi no + ZPL etiket). Alıcı il / ilçesi DHL'in
// kodlarıyla gönderilir (cbsinfoapi; JWT gerekmez). Varış şubesi henüz belirlenemediyse (hata 20001) etiket sonradan alınır.
// carrier_ref = referenceId (bizim sipariş-paket numaramız, büyük harf); takip numarası = shipmentId.
import { http, str, sleep } from '../util.js';
import { phone10, nameKey, fullAddress, money, trackUrl } from './common.js';

const BASE = (test) => (test ? 'https://testapi.mngkargo.com.tr/mngapi/api' : 'https://api.mngkargo.com.tr/mngapi/api');
const tokens = new Map(), places = new Map();
const one = (b) => (Array.isArray(b) ? b[0] : b) || {};
const STATES = { 1: 'created', 2: 'transit', 3: 'transit', 4: 'transit', 5: 'delivered', 6: 'transit', 7: 'returned', 8: 'transit' };
// "13-02-2019 14:56" (Türkiye saati) → ms
const trDate = (s) => { const m = /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/.exec(str(s)); return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+03:00`) : null; };

export function make(values) {
  const test = values.DHL_ENV === 'test', base = BASE(test);
  const ibm = { 'X-IBM-Client-Id': str(values.DHL_CLIENT_ID), 'X-IBM-Client-Secret': str(values.DHL_CLIENT_SECRET), Accept: 'application/json' };
  const key = `${test}:${values.DHL_CLIENT_ID}:${values.DHL_CUSTOMER_NO}`;
  const call = async (method, path, body, jwt) => {
    try {
      return await http(base + path, { method, tries: method === 'GET' ? 2 : 1, timeout: 30000, headers: { ...ibm, ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      const m = /HTTP (\d+) (.*)$/s.exec(e.message || ''); let j = null;
      try { j = JSON.parse(m ? m[2] : ''); } catch { /* düz metin */ }
      const er = (j && (j.error || j)) || {};
      const msg = er.Description || er.description || er.Message || er.message || er.detail || er.title || er.moreInformation || (m ? m[2] : e.message);
      const err = new Error(/Invalid client id|subscription/i.test(String(msg)) ? 'DHL eCommerce uygulama anahtarları (Client ID / Secret) geçersiz ya da uygulama bu API ürününe abone değil' : 'DHL eCommerce: ' + msg);
      err.code = String(er.Code || er.code || ''); err.status = m ? Number(m[1]) : 0;
      throw err;
    }
  };
  async function token(fresh) {
    const c = tokens.get(key);
    if (!fresh && c && c.until > Date.now()) return c.t;
    const j = one(await call('POST', '/token', { customerNumber: str(values.DHL_CUSTOMER_NO), password: str(values.DHL_PASSWORD), identityType: 1 }).catch((e) => {
      throw e.status === 401 && !/anahtar/.test(e.message) ? new Error('DHL eCommerce müşteri numarası veya şifresi hatalı') : e;
    }));
    if (!j.jwt) throw new Error('DHL eCommerce oturum açılamadı');
    tokens.set(key, { t: j.jwt, until: Date.now() + 6 * 3600e3 });
    return j.jwt;
  }
  const req = async (method, path, body) => {
    try { return await call(method, path, body, await token()); } catch (e) {
      if (e.status !== 401) throw e;
      return call(method, path, body, await token(true));
    }
  };
  async function codes(city, district) {
    if (!places.has('c')) places.set('c', await call('GET', '/cbsinfoapi/getcities'));
    const want = nameKey(city), cities = places.get('c') || [];
    const c = cities.find((x) => nameKey(str(x.name).replace(/\s+\d+$/, '')) === want);
    if (!c) throw new Error(`DHL eCommerce: alıcı ili bulunamadı (“${city}”)`);
    const k = 'd' + c.code;
    if (!places.has(k)) places.set(k, await call('GET', `/cbsinfoapi/getdistricts/${String(c.code).padStart(2, '0')}`));
    const dw = nameKey(district), ds = places.get(k) || [];
    const d = ds.find((x) => nameKey(x.name) === dw) || (dw.length > 3 && ds.find((x) => nameKey(x.name).startsWith(dw))) || ds.find((x) => /merkez/i.test(x.name) && !district);
    if (!d) throw new Error(`DHL eCommerce: alıcı ilçesi bulunamadı (“${district}”, ${city})`);
    return { cityCode: Number(c.code), cityName: str(c.name).replace(/\s+\d+$/, ''), districtCode: Number(d.code), districtName: str(d.name) };
  }
  const pieces = (ref, desi, content) => [{ barcode: `${ref}_PARCA1`, desi: Math.max(1, Math.ceil(Number(desi) || 1)), kg: Math.max(1, Math.ceil(Number(desi) || 1)), content: str(content).slice(0, 100) || 'Paket' }];
  async function barcode(ref, desi, content) {
    const b = one(await req('POST', '/barcodecmdapi/createbarcode', { referenceId: ref, billOfLandingId: '', isCOD: 0, codAmount: 0, packagingType: 3, printReferenceBarcodeOnError: 0, message: '', orderPieceList: pieces(ref, desi, content) }));
    const zpl = (b.barcodes || []).map((x) => str(x.value)).filter((v) => /\^XA/.test(v)).join('\n');
    return { shipmentId: str(b.shipmentId), label: zpl ? { format: 'zpl', data: zpl } : null };
  }
  return {
    async test() {
      await token(true);
      return { ok: true, message: `DHL eCommerce bağlantısı tamam${test ? ' (test ortamı)' : ''}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone);
      if (phone.length !== 10) throw new Error('DHL eCommerce alıcı cep telefonunu zorunlu istiyor (10 hane); siparişte geçerli telefon yok');
      const place = await codes(r.city, r.district);
      // Referans: büyük harf, yalnız ASCII harf / rakam (DHL küçük harfi ve Türkçe karakteri kabul etmiyor)
      const ref = s.reference.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
      const content = (s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ').slice(0, 200) || 'Paket';
      try {
        await req('POST', '/standardcmdapi/createOrder', {
          order: { referenceId: ref, barcode: ref, billOfLandingId: '', isCOD: 0, codAmount: 0, shipmentServiceType: 1, packagingType: 3, content, smsPreference1: 1, smsPreference2: 0, smsPreference3: 0, paymentType: 1, deliveryType: 1, description: s.orderNumber ? `Sipariş ${s.orderNumber}` : ref, marketPlaceShortCode: '', marketPlaceSaleCode: '' },
          orderPieceList: pieces(ref, s.desi, content),
          recipient: { refCustomerId: '', ...place, address: fullAddress(r).slice(0, 250), bussinessPhoneNumber: '', email: r.email || 'musteri@hasturkcrm.com', taxOffice: 'SAHIS', taxNumber: '11111111110', fullName: r.name, homePhoneNumber: '', mobilePhoneNumber: phone },
        });
      } catch (e) { if (e.code !== '3002') throw e; } // aynı referansla sipariş zaten kayıtlı: etiket adımına geçilir
      // Varış şubesi birkaç saniye içinde belirlenir (20001): bir kez beklenip yeniden denenir; olmazsa etiket sonra alınır
      let b = null;
      for (let i = 0; i < 2 && !b; i++) {
        try { b = await barcode(ref, s.desi, content); } catch (e) { if (e.code !== '20001') throw e; if (!i) await sleep(4000); }
      }
      return { ref, tracking: b ? b.shipmentId : '', barcode: b ? b.shipmentId : ref, carrier: 'DHL eCommerce', trackingUrl: b && b.shipmentId ? trackUrl('dhl', b.shipmentId) : '', cost: null, label: b ? b.label : null };
    },
    async cancel(ref) {
      const st = one(await req('GET', `/standardqueryapi/getshipmentstatus/${encodeURIComponent(ref)}`).catch(() => null));
      if (st && st.shipmentId) await req('PUT', '/barcodecmdapi/cancelshipment', { referenceId: ref, shipmentId: str(st.shipmentId) });
      await req('PUT', `/standardcmdapi/cancelorder/${encodeURIComponent(ref)}`);
    },
    async track(pkg) {
      const st = one(await req('GET', `/standardqueryapi/getshipmentstatus/${encodeURIComponent(pkg.carrier_ref)}`));
      const sh = one(await req('GET', `/standardqueryapi/getshipment/${encodeURIComponent(pkg.carrier_ref)}`).catch(() => null));
      const id = str(st.shipmentId);
      return {
        state: Number(st.isDelivered) === 1 ? 'delivered' : STATES[st.shipmentStatusCode] || null, text: str(st.shipmentStatus).replace(/_/g, ' '),
        tracking: id, barcode: id, trackingUrl: id ? trackUrl('dhl', id) : '', deliveredAt: trDate(st.deliveryDateTime),
        cost: sh && sh.shipment ? money(sh.shipment.finalTotal) : null,
      };
    },
    // Gönderi açılırken şube belirlenemediyse etiket (ve gönderi no) burada alınır
    async label(pkg) {
      if (pkg.tracking) return null; // DHL etiketi yeniden vermiyor: gönderi açılırken alınan etiket kayıtlıdır
      const b = await barcode(pkg.carrier_ref, pkg.desi, '');
      return b.label ? { ...b.label, tracking: b.shipmentId, trackingUrl: trackUrl('dhl', b.shipmentId) } : null;
    },
  };
}
