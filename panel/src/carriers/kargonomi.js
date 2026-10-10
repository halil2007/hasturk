// Kargonomi (app.kargonomi.com.tr/api/v1): bakiye yüklemeli kargo platformu. Kimlik: sabit API anahtarı (Bearer).
// Gönderi üç adımda açılır: taslak (POST /shipments) → kargo firması seçimi (POST /confirm-shipping-price; -1 = en ucuz)
// → firma gönderisi oluşunca takip no ve etiket (GET /shipments/{id}, /shipments/{id}/barcode?format=pdf).
// Alıcı il / ilçesi Kargonomi'nin numaralarıyla gönderilir (Kargonomi'de "state" = il, "city" = ilçe): adlardan bulunur, önbelleklenir.
// Gönderen: Kargonomi panelindeki depo (warehouse); numara girilmediyse ana depo kullanılır.
import { http, str } from '../util.js';
import { phone10, nameKey, fullAddress, money, b64, trackUrl } from './common.js';

const API = 'https://app.kargonomi.com.tr/api/v1';
const places = new Map(); // il / ilçe listeleri (isolate ömrü boyunca)
const unwrap = (j) => (j && j.data && !Array.isArray(j.data) && typeof j.data === 'object' ? j.data : j);
const list = (j) => (Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : []);
const label = (x) => str(x && (x.name || x.title || x.state_name || x.city_name));

// Kargonomi durumları → panel takip durumu
const STATES = {
  draft: 'created', ready: 'created', webservice_order_creating: 'created', webservice_order_created: 'created', webservice_checking_shipment: 'created',
  webservice_shipment_started: 'transit', webservice_shipment_not_delivered: 'transit', webservice_shipment_delivered: 'delivered',
  webservice_shipment_returning: 'returned', webservice_shipment_missing: 'transit', cancelled: 'cancelled', request_for_cancellation: 'cancelled',
  webservice_order_failed: 'failed',
};

export function make(values) {
  const token = str(values.KARGONOMI_API_KEY).replace(/^Bearer\s+/i, '');
  const req = async (method, path, body) => {
    try {
      return await http(API + path, { method, tries: method === 'GET' ? 2 : 1, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      // Laravel doğrulama hatası: { message, errors: { alan: [..] } } → okunur metin
      const m = /HTTP (\d+) (.*)$/s.exec(e.message || '');
      if (m && m[1] === '401') throw new Error('Kargonomi API anahtarı geçersiz (401). Kargonomi panelindeki anahtarı yeniden girin.');
      throw new Error('Kargonomi: ' + (m ? m[2] : e.message));
    }
  };
  async function placeId(kind, parent, name) {
    const key = kind + ':' + (parent || '');
    if (!places.has(key)) places.set(key, list(await req('GET', kind === 'state' ? '/states' : `/cities/${parent}`)));
    const want = nameKey(name), rows = places.get(key);
    const hit = rows.find((x) => nameKey(label(x)) === want) || (want.length > 3 && rows.find((x) => nameKey(label(x)).startsWith(want)));
    return hit ? hit.id : null;
  }
  async function warehouse() {
    if (str(values.KARGONOMI_WAREHOUSE)) return Number(values.KARGONOMI_WAREHOUSE) || values.KARGONOMI_WAREHOUSE;
    const rows = list(await req('GET', '/warehouses'));
    const w = rows.find((x) => x.is_main === true || x.is_main === 1) || rows[0];
    if (!w) throw new Error('Kargonomi: gönderen depo tanımlı değil. Kargonomi panelinde Depolarım bölümünden bir depo (gönderen adresi) ekleyin.');
    return w.id;
  }
  const result = (s) => {
    const tracking = str(s.shipping_webservice_tracking_code), carrier = str(s.shipping_provider_name);
    return {
      ref: str(s.id), tracking, barcode: str(s.shipping_webservice_barcode) || tracking, carrier: carrier || 'Kargonomi',
      trackingUrl: tracking ? trackUrl(s.shipping_provider_slug, tracking) : '', cost: money(s.real_price) ?? money(s.estimated_price),
      state: STATES[s.status] || null, text: str(s.status_label),
    };
  };
  async function getLabel(id) {
    const j = await req('GET', `/shipments/${id}/barcode?format=pdf`);
    const d = typeof j === 'string' ? j : [j && j.data, j && j.data && j.data.barcode, j && j.data && j.data.base64, j && j.data && j.data.pdf, j && j.barcode, j && j.base64, j && j.pdf].find((x) => typeof x === 'string' && x.length > 100);
    return d ? { format: 'pdf', data: b64(d) } : null;
  }
  return {
    async test() {
      const j = unwrap(await req('GET', '/user/credit'));
      return { ok: true, message: `Kargonomi bağlantısı tamam · bakiye ${Number(j.credit ?? 0).toLocaleString('tr-TR')} TL` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone);
      if (phone.length !== 10) throw new Error('Kargonomi alıcı telefonunu zorunlu istiyor (10 hane); siparişte geçerli telefon yok');
      if (!r.district) throw new Error('Kargonomi alıcı ilçesini zorunlu istiyor; sipariş adresinde ilçe yok');
      const stateId = await placeId('state', null, r.city);
      if (!stateId) throw new Error(`Kargonomi: alıcı ili bulunamadı (“${r.city}”)`);
      const cityId = await placeId('city', stateId, r.district);
      if (!cityId) throw new Error(`Kargonomi: alıcı ilçesi bulunamadı (“${r.district}”, ${r.city})`);
      const draft = unwrap(await req('POST', '/shipments', { shipment: {
        warehouse_id: await warehouse(), buyer_name: r.name, buyer_email: r.email || undefined, buyer_phone: phone, buyer_address: fullAddress(r).slice(0, 512),
        buyer_state_id: stateId, buyer_city_id: cityId,
        packages: [{ desi: s.desi, content: (s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ').slice(0, 200) || s.reference }],
      } }));
      if (!draft || !draft.id) throw new Error('Kargonomi gönderi numarası vermedi');
      const provider = str(values.KARGONOMI_PROVIDER) || '-1';
      try {
        await req('POST', '/confirm-shipping-price', { shipment_id: draft.id, shipping_provider_id: Number(provider) || provider });
      } catch (e) {
        await req('DELETE', `/shipments/${draft.id}`).catch(() => null); // seçilemeyen taslak kalmasın
        throw e;
      }
      const s2 = unwrap(await req('GET', `/shipments/${draft.id}`).catch(() => draft));
      if (s2.status === 'webservice_order_failed') throw new Error(`Kargonomi: kargo firması gönderiyi oluşturamadı (${str(s2.status_label)})`);
      const out = result(s2);
      out.label = out.tracking ? await getLabel(draft.id).catch(() => null) : null;
      return out;
    },
    async cancel(ref) {
      try { await req('POST', '/shipments/cancel', { shipment_id: Number(ref) || ref }); } catch (e) {
        // Henüz firmaya iletilmemiş taslak: silinir
        try { await req('DELETE', `/shipments/${ref}`); } catch { throw e; }
      }
    },
    async track(pkg) { return result(unwrap(await req('GET', `/shipments/${pkg.carrier_ref}`))); },
    // Etiket, firma gönderisi oluştuktan (takip no geldikten) sonra hazır olur
    async label(pkg) {
      const s = result(unwrap(await req('GET', `/shipments/${pkg.carrier_ref}`)));
      if (!s.tracking) return null;
      const lab = await getLabel(pkg.carrier_ref);
      return lab ? { ...lab, tracking: s.tracking, trackingUrl: s.trackingUrl } : null;
    },
  };
}
