// UPS Türkiye web servisleri (ws.ups.com.tr, SOAP; test ortamı yok — denemede açılan gönderi iptal edilir).
// Gönderi: Login_Type1 → CreateShipment_Type3 → takip no (ShipmentNo, 1Z…) + etiket (paket başına PNG, base64).
// Takip: ayrı sorgu servisi (Login_V1 → GetTransactionsByTrackingNumber_V1). Hatalar SOAP hatası değil, ErrorCode / ErrorDefinition ile gelir.
// İl / ilçe UPS kodlarıyla gönderilir: il = plaka, ilçe = UPS bölge kodu (tablo: ups-areas.js).
import { str } from '../util.js';
import { soap, esc, tag, tags, phone10, nameKey, cut, fullAddress, money, trackUrl } from './common.js';
import { UPS_CITIES, UPS_AREAS } from './ups-areas.js';

const CS = { url: 'https://ws.ups.com.tr/wsCreateShipment/wsCreateShipment.asmx', ns: 'https://ws.ups.com.tr/wsCreateShipment' };
const QS = { url: 'https://ws.ups.com.tr/QueryPackageInfo/wsQueryPackagesInfo.asmx', ns: 'https://ws.ups.com.tr/wsPaketIslemSorgulamaEng/' };
const sessions = new Map();
const STATES = { 34: 'created', 2: 'delivered', 17: 'returned' };
const CITY_ALIAS = { afyonkarahisar: 'afyon', icel: 'mersin', kahramanmaras: 'kmaras' };

// İl / ilçe adı → UPS kodları
export function upsPlace(city, district) {
  const ck = nameKey(city), want = CITY_ALIAS[ck] || ck;
  const code = Object.keys(UPS_CITIES).find((k) => nameKey(UPS_CITIES[k]) === want || nameKey(UPS_CITIES[k]) === ck);
  if (!code) return null;
  const rows = (UPS_AREAS[code] || '').split('|').map((x) => x.split(':')).map(([a, n, l]) => ({ a: Number(a), n: nameKey(n), top: l === '0' || l === '' }));
  const dk = nameKey(district);
  const hit = (dk && (rows.find((r) => r.top && r.n === dk) || rows.find((r) => r.n === dk)))
    || ((!dk || dk === 'merkez' || dk === want) && rows.find((r) => r.n === 'merkez'))
    || (dk.length > 3 && rows.find((r) => r.top && r.n.startsWith(dk)));
  return hit ? { city: Number(code), area: hit.a } : { city: Number(code), area: null };
}

export function make(values) {
  const cust = str(values.UPS_CUSTOMER_NO), user = str(values.UPS_USER), pass = str(values.UPS_PASSWORD);
  const quser = str(values.UPS_QUERY_USER) || user, qpass = str(values.UPS_QUERY_PASSWORD) || pass;
  const call = (svc, op, inner) => soap(svc.url, { ns: svc.ns, action: svc.ns.replace(/\/$/, '') + '/' + op, body: `<${op} xmlns="${svc.ns}">${inner}</${op}>` })
    .catch((e) => { throw new Error('UPS: ' + e.message); });
  async function session(svc, fresh) {
    const k = `${svc.ns}:${cust}:${svc === CS ? user : quser}`, c = sessions.get(k);
    if (!fresh && c && c.until > Date.now()) return c.id;
    const op = svc === CS ? 'Login_Type1' : 'Login_V1';
    const x = await call(svc, op, `<CustomerNumber>${esc(cust)}</CustomerNumber><UserName>${esc(svc === CS ? user : quser)}</UserName><Password>${esc(svc === CS ? pass : qpass)}</Password>`);
    if (tag(x, 'ErrorCode') !== '0' || !tag(x, 'SessionID')) throw new Error(/PASSWORD|USER/i.test(tag(x, 'ErrorDefinition')) ? `UPS müşteri numarası, kullanıcı adı veya şifresi hatalı${svc === QS ? ' (takip servisi)' : ''}` : 'UPS: ' + (tag(x, 'ErrorDefinition') || 'oturum açılamadı'));
    sessions.set(k, { id: tag(x, 'SessionID'), until: Date.now() + 4 * 60e3 }); // 5 dk işlem yapılmazsa oturum kapanır
    return tag(x, 'SessionID');
  }
  // Oturum düşmüşse (12 TOKEN DECODE ERROR / 20 SESSION NOT FOUND) bir kez yeniden giriş
  async function withSession(svc, fn) {
    let x = await fn(await session(svc));
    if (/<ErrorCode>(12|20)<\/ErrorCode>/.test(x)) x = await fn(await session(svc, true));
    return x;
  }
  const party = (p, name, addr, place, phone, email) => `<${p}Name>${esc(cut(name, 40))}</${p}Name><${p}ContactName>${esc(cut(name, 40))}</${p}ContactName><${p}Address>${esc(cut(addr, 255))}</${p}Address>`
    + `<${p}CityCode>${place.city}</${p}CityCode><${p}AreaCode>${place.area}</${p}AreaCode><${p}PostalCode></${p}PostalCode><${p}PhoneNumber>${phone ? '0' + phone : ''}</${p}PhoneNumber><${p}PhoneExtension></${p}PhoneExtension>`
    + `<${p}MobilePhoneNumber>${phone ? '0' + phone : ''}</${p}MobilePhoneNumber><${p}EMail>${esc(cut(email, 64))}</${p}EMail><${p}ExpenseCode></${p}ExpenseCode>`;
  return {
    async test() {
      await session(CS, true);
      return { ok: true, message: 'UPS bağlantısı tamam' };
    },
    async create(s) {
      const r = s.receiver;
      const to = upsPlace(r.city, r.district), from = upsPlace(s.sender.city, s.sender.district);
      if (!to) throw new Error(`UPS: alıcı ili bulunamadı (“${r.city}”)`);
      if (!to.area) throw new Error(`UPS: alıcı ilçesi UPS bölge listesinde bulunamadı (“${r.district || '—'}”, ${r.city})`);
      if (!from || !from.area) throw new Error('UPS gönderen il ve ilçesini istiyor: Ayarlar → Kargo etiketi → “İlçe / il” alanına ör. “Selçuklu / Konya” yazın');
      const content = (s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ') || 'Paket';
      const kg = Math.max(1, Math.round((Number(s.desi) || 1) * 100) / 100);
      const info = `<ShipperAccountNumber>${esc(cust)}</ShipperAccountNumber>${party('Shipper', s.sender.name, s.sender.address, from, phone10(s.sender.phone), '')}`
        + `<ConsigneeAccountNumber></ConsigneeAccountNumber>${party('Consignee', r.name, fullAddress(r), to, phone10(r.phone), r.email)}`
        + `<ServiceLevel>${Number(values.UPS_SERVICE) || 3}</ServiceLevel><PaymentType>2</PaymentType><PackageType>K</PackageType><NumberOfPackages>1</NumberOfPackages>`
        + `<CustomerReferance>${esc(cut(s.reference, 40))}</CustomerReferance><CustomerInvoiceNumber></CustomerInvoiceNumber><DeliveryNotificationEmail>${esc(cut(r.email, 64))}</DeliveryNotificationEmail>`
        + `<IdControlFlag>0</IdControlFlag><PhonePrealertFlag>0</PhonePrealertFlag><SmsToShipper>0</SmsToShipper><SmsToConsignee>${phone10(r.phone) ? 1 : 0}</SmsToConsignee>`
        + '<InsuranceValue>0</InsuranceValue><InsuranceValueCurrency>TL</InsuranceValueCurrency><ValueOfGoods>0</ValueOfGoods><ValueOfGoodsCurrency>TL</ValueOfGoodsCurrency><ValueOfGoodsPaymentType>0</ValueOfGoodsPaymentType>'
        + '<DeliveryByTally>0</DeliveryByTally><ThirdPartyAccountNumber></ThirdPartyAccountNumber><ThirdPartyExpenseCode></ThirdPartyExpenseCode>'
        + `<PackageDimensions><DimensionInfo><DescriptionOfGoods>${esc(cut(content, 120))}</DescriptionOfGoods><Length>0</Length><Height>0</Height><Width>0</Width><Weight>${kg}</Weight></DimensionInfo></PackageDimensions>`;
      const x = await withSession(CS, (sid) => call(CS, 'CreateShipment_Type3', `<SessionID>${esc(sid)}</SessionID><ShipmentInfo>${info}</ShipmentInfo><ReturnLabelLink>false</ReturnLabelLink><ReturnLabelImage>true</ReturnLabelImage>`));
      if (tag(x, 'ErrorCode') !== '0') throw new Error('UPS: ' + (tag(x, 'ErrorDefinition') || 'gönderi oluşturulamadı'));
      const no = tag(x, 'ShipmentNo');
      if (!no) throw new Error('UPS gönderi numarası vermedi');
      const png = tags(tag(x, 'BarkodArrayPng'), 'string').map((v) => v.replace(/\s+/g, '')).filter(Boolean)[0];
      return { ref: no, tracking: no, barcode: no, carrier: 'UPS', trackingUrl: trackUrl('ups', no), cost: null, label: png ? { format: 'png', data: png } : null };
    },
    async cancel(ref) {
      const x = await withSession(CS, (sid) => call(CS, 'Cancel_Shipment_V1', `<sessionId>${esc(sid)}</sessionId><customerCode>${esc(cust)}</customerCode><waybillNumber>${esc(ref)}</waybillNumber>`));
      if (tag(x, 'ErrorCode') !== '0') throw new Error('UPS gönderisi iptal edilemedi: ' + (tag(x, 'ErrorDefinition') || 'bilinmeyen hata'));
    },
    async track(pkg) {
      const n = pkg.tracking || pkg.carrier_ref;
      const x = await withSession(QS, (sid) => call(QS, 'GetTransactionsByTrackingNumber_V1', `<SessionID>${esc(sid)}</SessionID><InformationLevel>1</InformationLevel><TrackingNumber>${esc(n)}</TrackingNumber>`));
      const rows = tags(x, 'PackageTransaction').map((r) => ({ code: Number(tag(r, 'StatusCode')), exc: tag(r, 'ExceptionCode'), ts: tag(r, 'ProcessTimeStamp'), text: tag(r, 'ProcessDescription1'), err: tag(r, 'ErrorCode'), errText: tag(r, 'ErrorDefinition'), id: Number(tag(r, 'RecordId')) || 0 }));
      if (rows.length === 1 && rows[0].err && rows[0].err !== '0') throw new Error('UPS takip: ' + rows[0].errText);
      rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.id - b.id));
      const last = rows[rows.length - 1];
      if (!last) return { state: 'created', text: 'Gönderi kaydı oluşturuldu', tracking: n, trackingUrl: trackUrl('ups', n) };
      const ts = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(last.ts);
      const state = STATES[last.code] || (['DL', 'GI'].includes(str(last.exc)) ? 'returned' : 'transit');
      return { state, text: last.text || '', tracking: n, trackingUrl: trackUrl('ups', n), deliveredAt: state === 'delivered' && ts ? Date.parse(`${ts[1]}-${ts[2]}-${ts[3]}T${ts[4]}:${ts[5]}:00+03:00`) : null };
    },
    // UPS'in hesapladığı kargo ücreti gönderiden sonra paket bilgisinde görünür
    async cost(pkg) {
      const x = await withSession(QS, (sid) => call(QS, 'GetPackageInfoByTrackingNumber_V1', `<SessionID>${esc(sid)}</SessionID><InformationLevel>1</InformationLevel><TrackingNumber>${esc(pkg.tracking || pkg.carrier_ref)}</TrackingNumber>`));
      return money(tag(x, 'Freight'));
    },
  };
}
