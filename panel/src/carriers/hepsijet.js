// HepsiJET (integration.hepsijet.com, "Module Design – Integration v2.1"): kendi anlaşmanızla gönderi.
// Kimlik: kullanıcı adı / şifre → GET /auth/getToken (Basic) → 60 dk geçerli token (X-Auth-Token).
// Gönderi tek istekte açılır ve etiket (ZPL) aynı yanıtta gelir (POST /rest/delivery/sendDeliveryOrderEnhanced).
// Gönderi (barkod) numarası bizim verdiğimiz customerDeliveryNo'dur: firma kodu + benzersiz rakamlar; takip numarası da odur.
// Adresler kodla değil adla eşleşir (il / ilçe / mahalle).
import { http, basic, str } from '../util.js';
import { phone10, trUpper, fullAddress, trackUrl } from './common.js';

const BASE = (test) => (test ? 'https://integration-apitest.hepsijet.com' : 'https://integration.hepsijet.com');
const tokens = new Map();
const STATES = { NEO: 'created', ACCEPTED: 'transit', OUT_FOR_DELIVERY: 'transit', FAILED_ATTEMPT: 'transit', DELIVERED: 'delivered', RETURNED: 'returned', DELETED: 'cancelled', CANCELLED: 'cancelled' };
const TEXT = { NEO: 'Gönderi kaydı alındı', ACCEPTED: 'Kargoya verildi', OUT_FOR_DELIVERY: 'Dağıtıma çıktı', FAILED_ATTEMPT: 'Teslim edilemedi (tekrar denenecek)', DELIVERED: 'Teslim edildi', RETURNED: 'İade edildi', DELETED: 'Silindi', CANCELLED: 'İptal edildi' };

export function make(values) {
  const test = values.HEPSIJET_ENV === 'test', base = BASE(test), user = str(values.HEPSIJET_USER), pass = str(values.HEPSIJET_PASSWORD);
  const company = str(values.HEPSIJET_COMPANY).toUpperCase(), key = `${test}:${user}:${pass.length}`;
  const extra = str(values.HEPSIJET_APIKEY) ? { apikey: str(values.HEPSIJET_APIKEY) } : {};
  async function token(fresh) {
    const c = tokens.get(key);
    if (!fresh && c && c.until > Date.now()) return c.t;
    let j;
    try { j = await http(base + '/auth/getToken', { headers: { Authorization: basic(user, pass), 'Content-Type': 'application/json', ...extra }, tries: 1 }); } catch (e) {
      if (/HTTP 401/.test(e.message)) throw new Error('HepsiJET kullanıcı adı veya şifresi hatalı');
      throw new Error('HepsiJET: ' + e.message);
    }
    const t = j && j.data && j.data.token;
    if (!t) throw new Error('HepsiJET oturum açılamadı: ' + str(j && j.message));
    tokens.set(key, { t, until: Date.now() + 50 * 60e3 });
    return t;
  }
  async function req(method, path, body, again) {
    let j;
    try {
      j = await http(base + path, { method, tries: 1, timeout: 30000, headers: { 'X-Auth-Token': await token(again), 'Content-Type': 'application/json', Accept: 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      if (/HTTP 401/.test(e.message) && !again) return req(method, path, body, true); // token süresi doldu
      const m = /HTTP \d+ (.*)$/s.exec(e.message || '');
      throw new Error('HepsiJET: ' + (m ? m[1] : e.message));
    }
    // HTTP 200 içinde de hata gelebilir: { status: 'FAIL', message }
    if (j && j.status === 'FAIL') throw new Error('HepsiJET: ' + (str(j.message) || 'işlem reddedildi') + (j.detailStatus ? ` (${j.detailStatus})` : ''));
    return j;
  }
  const zpl = (list) => (Array.isArray(list) ? list.map((x) => str(x && x.zplBarcode)).filter(Boolean).join('\n') : '');
  return {
    async test() {
      await token(true);
      return { ok: true, message: `HepsiJET bağlantısı tamam${test ? ' (test ortamı)' : ''}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone);
      if (phone.length !== 10) throw new Error('HepsiJET alıcı telefonunu zorunlu istiyor (10 hane); siparişte geçerli telefon yok');
      if (!r.district) throw new Error('HepsiJET alıcı ilçesini zorunlu istiyor; sipariş adresinde ilçe yok');
      if (!s.sender.city || !s.sender.district) throw new Error('HepsiJET gönderen il ve ilçesini istiyor: Ayarlar → Kargo etiketi → “İlçe / il” alanına ör. “Selçuklu / Konya” yazın');
      const parts = r.name.split(/\s+/), last = parts.length > 1 ? parts.pop() : '.', first = parts.join(' ');
      // Barkod numarası: firma kodu + zaman + rastgele (en çok 16 karakter, büyük harf / rakam)
      const no = (company + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, '0')).replace(/[^A-Z0-9]/g, '').slice(0, 16);
      const body = {
        company: { name: str(values.HEPSIJET_COMPANY_NAME) || s.sender.name, abbreviationCode: company },
        delivery: {
          customerDeliveryNo: no, customerOrderId: s.reference.slice(0, 50), totalParcels: '1', desi: s.desi, deliveryType: 'RETAIL', deliverySlotOriginal: '0',
          product: { productCode: str(values.HEPSIJET_PRODUCT) || 'HX_STD' },
          receiver: { companyCustomerId: phone, firstName: first, lastName: last, phone1: phone, email: r.email || undefined },
          recipientPerson: r.name, recipientPersonPhone1: phone,
          recipientAddress: { companyAddressId: `A${phone}`, country: { name: 'Türkiye' }, city: { name: trUpper(r.city) }, town: { name: trUpper(r.district) }, addressLine1: fullAddress(r).slice(0, 250), postalCode: r.postalCode || undefined },
          senderAddress: { companyAddressId: str(values.HEPSIJET_SENDER_ID) || null, country: { name: 'Türkiye' }, city: { name: trUpper(s.sender.city) }, town: { name: trUpper(s.sender.district) }, addressLine1: s.sender.address },
          deliveryContent: (s.items || []).map((x) => ({ sku: x.sku || x.barcode || '-', description: str(x.name).slice(0, 100), quantity: x.qty })),
        },
        currentXDock: { abbreviationCode: str(values.HEPSIJET_WAREHOUSE) },
      };
      const j = await req('POST', '/rest/delivery/sendDeliveryOrderEnhanced', body);
      const d = (j && j.data) || {}, tn = str(d.customerDeliveryNo) || no;
      const label = zpl(d.zplBarcodeDTOList);
      return { ref: tn, tracking: tn, barcode: tn, carrier: 'HepsiJET', trackingUrl: trackUrl('hepsijet', tn), cost: null, label: label ? { format: 'zpl', data: label } : null };
    },
    async cancel(ref) { await req('POST', `/rest/delivery/deleteDeliveryOrder/${encodeURIComponent(ref)}`, { deleteReason: 'IPTAL' }); },
    async track(pkg) {
      const j = await req('POST', '/rest/delivery/integration/track', { barcodes: [pkg.carrier_ref], isTrackAdded: true });
      const d = (Array.isArray(j.data) ? j.data : [])[0] || {};
      const det = Array.isArray(d.details) ? d.details : [], lastD = det[det.length - 1] || {};
      const st = str(d.integrationStatus || lastD.integrationStatus);
      return { state: STATES[st] || null, text: TEXT[st] || st, tracking: pkg.carrier_ref, trackingUrl: str(d.trackingUrl).replace('hepsiexpress.com', 'www.hepsijet.com') || trackUrl('hepsijet', pkg.carrier_ref),
        deliveredAt: st === 'DELIVERED' && lastD.transactionDate ? Date.parse(lastD.transactionDate) || null : null };
    },
    async label(pkg) {
      const j = await req('GET', `/rest/delivery/generateZplBarcode/${encodeURIComponent(pkg.carrier_ref)}/1`);
      const z = zpl(Array.isArray(j.data) ? j.data : []);
      return z ? { format: 'zpl', data: z } : null;
    },
  };
}
