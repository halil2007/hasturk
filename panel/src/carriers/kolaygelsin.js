// Kolay Gelsin (Ekol Ekspres Kargo; 2024'ten beri Sendeo ile aynı çatı altında) entegrasyon servisi: REST / JSON, yalnız POST.
// Adres: {taban}/api/request/{MetodAdı} — canlı api.kolaygelsin.com, test apiintg.klyglsn.com (eski dokümanda apibeta.klyglsn.com).
// Kimlik: Kolay Gelsin'in verdiği token (Authorization: Bearer …) + müşteri numarası (CustomerId) + gönderen adres numarası (AddressId).
// Gönderi tek istekte açılır (SaveIntegrationShipmentV2: alıcı istekle birlikte kaydedilir, ayrı SaveRecipient gerekmez).
// Kolay Gelsin müşteri barkoduyla taşımayı tercih ediyor: parça barkodu (CustomerBarcode) bizim verdiğimiz kargo anahtarıdır ve
// panelin kendi etiketine basılır (Kolay Gelsin'in etiketi HTML gelir; panel PDF / ZPL / PNG sakladığı için kullanılmaz).
// Takip numarası = Kolay Gelsin gönderi numarası (ShipmentId); iptal ve takip de onunla yapılır.
// Yanıtlar ortak zarfla gelir: { Payload, ResultCode (200 = başarılı; 500.0, 404.1 …), ResultMessage }; iş kuralı hataları HTTP 200 içinde.
// Takip (GetCorporateShipmentsStatus) yalnız Kolay Gelsin panelindeki "Webhook Ayarlar" sekmesinde seçilen durumları döndürür.
import { http, str } from '../util.js';
import { phone10, nameKey, fullAddress, trackUrl } from './common.js';

const BASE = (test) => (test ? 'https://apiintg.klyglsn.com/api/request' : 'https://api.kolaygelsin.com/api/request'); // DOĞRULA: canlı adres (dokümanda yalnız test adresi var)

// İl plaka numaraları (Kolay Gelsin CityId = plaka; Sendeo ve DHL Express bağlantıları da kullanır)
const PLATES = ['adana', 'adiyaman', 'afyonkarahisar', 'agri', 'amasya', 'ankara', 'antalya', 'artvin', 'aydin', 'balikesir', 'bilecik', 'bingol', 'bitlis', 'bolu', 'burdur', 'bursa',
  'canakkale', 'cankiri', 'corum', 'denizli', 'diyarbakir', 'edirne', 'elazig', 'erzincan', 'erzurum', 'eskisehir', 'gaziantep', 'giresun', 'gumushane', 'hakkari', 'hatay', 'isparta',
  'mersin', 'istanbul', 'izmir', 'kars', 'kastamonu', 'kayseri', 'kirklareli', 'kirsehir', 'kocaeli', 'konya', 'kutahya', 'malatya', 'manisa', 'kahramanmaras', 'mardin', 'mugla',
  'mus', 'nevsehir', 'nigde', 'ordu', 'rize', 'sakarya', 'samsun', 'siirt', 'sinop', 'sivas', 'tekirdag', 'tokat', 'trabzon', 'tunceli', 'sanliurfa', 'usak', 'van', 'yozgat',
  'zonguldak', 'aksaray', 'bayburt', 'karaman', 'kirikkale', 'batman', 'sirnak', 'bartin', 'ardahan', 'igdir', 'yalova', 'karabuk', 'kilis', 'osmaniye', 'duzce'];
const PLATE_ALIAS = { afyon: 3, icel: 33, maras: 46, kmaras: 46, urfa: 63, antakya: 31, izmit: 41, adapazari: 54, hakkari: 30, hakari: 30 };
export function plateOf(city) {
  const k = nameKey(city);
  if (/^\d{1,2}$/.test(k) && +k >= 1 && +k <= 81) return +k;
  const i = PLATES.indexOf(k);
  return i >= 0 ? i + 1 : PLATE_ALIAS[k] || 0;
}
// Kargo anahtarı / parça barkodu: kanal kısaltması + sipariş-paket no (büyük harf / rakam, en çok 20)
export function barcodeOf(s) {
  const pre = str(s.channel).replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'HT';
  return pre + str(s.reference).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-18);
}
// Desi → küp ölçü (cm): desi = en × boy × yükseklik / 3000
const side = (desi) => Math.round(Math.cbrt(Math.max(1, Number(desi) || 1) * 3000) * 10) / 10;
// "13.05.2021 18:28:01" ya da ISO → ms
function when(v) {
  const s = str(v), m = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}+03:00`);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
// Kargo aksiyonları (CargoEventType) → takip durumu
const STATES = { 1: 'created', 2: 'created', 12: 'transit', 13: 'transit', 14: 'transit', 17: 'transit', 18: 'transit', 25: 'transit', 26: 'transit', 28: 'transit',
  29: 'delivered', 31: 'returned', 32: 'returned', 33: 'transit', 35: 'transit', 39: 'transit', 46: 'returned', 58: 'transit' };
const TEXT = { 1: 'Gönderi kaydı alındı', 2: 'Toplama kuryesi yola çıktı', 12: 'Kolay Gelsin teslim aldı', 13: 'Toplama transfer merkezinde', 14: 'Dağıtım transfer merkezinde',
  17: 'Dağıtım aracına yüklendi', 18: 'Dağıtıma çıktı', 25: 'Alıcı adresi hatalı', 26: 'Alıcı adreste bulunamadı', 28: 'Alıcı teslimatı reddetti', 29: 'Teslim edildi',
  31: 'Gönderen durdurdu, iade edilecek', 32: 'Alıcı talebiyle iade kaydedildi', 33: 'Gönderi kayıp', 35: 'Alıcı adresi problemli', 39: 'Ertesi iş gününe devredildi',
  46: 'Operasyonel iade kaydedildi', 58: 'Hasar raporu oluşturuldu' };
const okCode = (c) => Math.floor(Number(c)) === 200;

export function make(values) {
  const test = values.KOLAYGELSIN_ENV === 'test', base = BASE(test);
  const raw = str(values.KOLAYGELSIN_TOKEN), auth = /^bearer\s/i.test(raw) ? raw : 'Bearer ' + raw; // DOĞRULA: token "Bearer" önekiyle mi, yalın mı
  const customerId = Number(str(values.KOLAYGELSIN_CUSTOMER_ID)) || str(values.KOLAYGELSIN_CUSTOMER_ID);
  const addressId = Number(str(values.KOLAYGELSIN_ADDRESS_ID)) || str(values.KOLAYGELSIN_ADDRESS_ID);
  async function call(method, body) {
    let text;
    try {
      const res = await http(`${base}/${method}`, { method: 'POST', raw: true, tries: 1, timeout: 30000, headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body || {}) });
      text = await res.text();
    } catch (e) {
      if (/HTTP 401|HTTP 403/.test(e.message)) throw new Error('Kolay Gelsin API token\'ı geçersiz (yetki reddedildi)');
      const m = /"ResultMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(e.message || '');
      throw new Error('Kolay Gelsin: ' + (m ? JSON.parse(`"${m[1]}"`) : e.message));
    }
    let j = null;
    try { j = JSON.parse(text); } catch { throw new Error('Kolay Gelsin: beklenmeyen yanıt (' + text.slice(0, 120) + ')'); }
    if (!j || !okCode(j.ResultCode)) {
      const msg = str(j && j.ResultMessage) || 'işlem reddedildi';
      throw new Error('Kolay Gelsin: ' + msg + (j && j.ResultCode != null ? ` (${j.ResultCode})` : ''));
    }
    return j.Payload;
  }
  return {
    async test() {
      const p = await call('GetCorporateCustomerCargoEventTypes', {});
      const n = Array.isArray(p && p.CargoEventTypeList) ? p.CargoEventTypeList.length : 0;
      return { ok: true, message: `Kolay Gelsin bağlantısı tamam${test ? ' (test ortamı)' : ''}${n ? ` · ${n} kargo durumu tanımlı` : ''}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone), city = plateOf(r.city);
      if (!city) throw new Error(`Kolay Gelsin: alıcı ili tanınmadı (“${r.city}”)`);
      if (!r.district) throw new Error('Kolay Gelsin alıcı ilçesini istiyor; sipariş adresinde ilçe yok');
      if (phone.length !== 10) throw new Error('Kolay Gelsin alıcı cep telefonunu istiyor (10 hane); siparişte geçerli telefon yok');
      const parts = str(r.name).split(/\s+/).filter(Boolean), last = parts.length > 1 ? parts.pop() : '.', first = parts.join(' ') || last;
      const code = barcodeOf(s), d = side(s.desi);
      const content = (s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ').slice(0, 250) || s.reference;
      const body = {
        SenderCustomer: { CustomerId: customerId, Address: { AddressId: addressId } },
        Recipient: {
          RecipientType: 1, RecipientName: first.slice(0, 100), RecipientSurname: last.slice(0, 100), Gsm: phone, Email: r.email || undefined, OnlyDeliverToRecipient: false, SaveOutOfCoverage: false,
          Address: { AddressTypeId: 1, AddressText: fullAddress(r).slice(0, 500), CityId: city, TownName: r.district, PostalCode: r.postalCode || undefined },
        },
        PackageType: 2, PayingParty: 1, OnlyDeliverToRecipient: false, CustomerSpecificCode: code,
        ...(str(values.KOLAYGELSIN_BRAND) ? { SenderBrand: str(values.KOLAYGELSIN_BRAND) } : {}),
        ...(values.KOLAYGELSIN_SAMEDAY === '1' ? { ProductCodeList: ['SAMEDAY'] } : {}),
        ShipmentItemList: [{ Width: d, Length: d, Height: d, Weight: Math.max(1, Math.ceil(Number(s.desi) || 1)), ContentText: content, CustomerBarcode: code, CustomerTrackingId: code, HasCommercialValue: false }],
      };
      const p = (await call('SaveIntegrationShipmentV2', body)) || {};
      const id = str(p.ShipmentId);
      if (!id) throw new Error('Kolay Gelsin gönderi numarası vermedi');
      // Takip bağlantısı gönderiye özelse o, genel sayfaysa (ör. …/shipment) herkese açık takip adresi
      const link = str(p.ShipmentTrackingLink);
      return { ref: id, tracking: id, barcode: code, carrier: 'Kolay Gelsin', trackingUrl: /^https?:\/\//.test(link) && link.includes(id) ? link : trackUrl('kolaygelsin', id), cost: null, label: null };
    },
    // Toplanmamış gönderi iptal edilir; toplanmış (henüz teslim edilmemiş) gönderide teslimat durdurulup iade süreci başlar
    async cancel(ref) {
      await call('CancelPickupAndDelivery', { ShipmentId: /^\d+$/.test(str(ref)) ? Number(ref) : str(ref), DeliveryCancellationReason: 1 });
    },
    async track(pkg) {
      const id = str(pkg.carrier_ref);
      const p = await call('GetCorporateShipmentsStatus', { ShipmentIdList: [id], CustomerSpecificCodeList: [], CustomerBarcodeList: [], CustomerTrackingIdList: [], OnlyLatestEvents: false });
      // Dokümanda Payload.ShipmentModelList; şemada doğrudan dizi — ikisi de okunur
      const list = Array.isArray(p) ? p : (p && (p.ShipmentModelList || p.ShipmentModels)) || [];
      const sh = list.find((x) => str(x.ShipmentId) === id) || list[0] || {};
      const ev = Array.isArray(sh.CargoEventLogModelList) ? sh.CargoEventLogModelList : [];
      const at = (e) => when(e.TimeStamp || e.EventDate || e.CreateDate) || 0;
      const lastE = ev.slice().sort((a, b) => at(a) - at(b)).pop() || null;
      if (!lastE) return { state: null, text: '', tracking: id, barcode: str(sh.CustomerBarcode), trackingUrl: trackUrl('kolaygelsin', id) };
      const t = parseInt(str(lastE.CargoEventType), 10);
      const state = STATES[t] || 'transit';
      return {
        state, text: TEXT[t] || str(lastE.EventDescription || lastE.EventCustomerDescription) || `Durum ${t}`, tracking: id, barcode: str(sh.CustomerBarcode),
        trackingUrl: trackUrl('kolaygelsin', id), deliveredAt: state === 'delivered' ? at(lastE) || null : null,
      };
    },
  };
}
