// Yurtiçi Kargo web servisi (ws.yurticikargo.com, KOPS ShippingOrderDispatcherServices; SOAP).
// Gönderi "veri gönderimi"dir (createShipment): bizim verdiğimiz kargo anahtarı (cargoKey, en çok 20 karakter) etikete barkod olarak
// basılır; şube okutunca Yurtiçi gönderi kodunu (docId) ve takip adresini verir — takip sorgusuyla (queryShipment) pakete yazılır.
// Ödeme tipi kullanıcıya bağlıdır (gönderici ödemeli için ayrı kullanıcı verilir). Hatalar HTTP 200 içinde: outFlag + satır errCode.
// Alt öğeler ön eksizdir (yalnız işlem öğesi ship: önekli); dil öğesi işleme göre değişir (userLanguage / wsLanguage).
import { str } from '../util.js';
import { soap, esc, tag, tags, phone10, cut, money, trackUrl } from './common.js';

const URL = (test) => `https://${test ? 'testws' : 'ws'}.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices`;
const NS = 'http://yurticikargo.com.tr/ShippingOrderDispatcherServices';
const STATES = { NOP: 'created', ISR: 'transit', IND: 'transit', DLV: 'delivered', CNL: 'cancelled', ISC: 'cancelled', BI: 'cancelled' };
const AUTH = /^(1625|1626|80265)$/;

// Kargo anahtarı: kanal kısaltması + sipariş-paket no (büyük harf / rakam, en çok 20)
export function cargoKey(s) {
  const tag2 = str(s.channel).replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase() || 'HT';
  const ref = str(s.reference).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return tag2 + ref.slice(-18);
}

export function make(values) {
  const test = values.YURTICI_ENV === 'test', user = str(values.YURTICI_USER), pass = str(values.YURTICI_PASSWORD);
  const call = (op, inner, lang = 'userLanguage') => soap(URL(test), { ns: NS, prefix: 'ship', action: '', body: `<ship:${op}><wsUserName>${esc(user)}</wsUserName><wsPassword>${esc(pass)}</wsPassword><${lang}>TR</${lang}>${inner}</ship:${op}>` })
    .catch((e) => { throw new Error('Yurtiçi: ' + e.message); });
  const authErr = (x) => (AUTH.test(tag(x, 'errCode')) ? 'Yurtiçi web servis kullanıcı adı veya şifresi hatalı' : '');
  const query = (key) => call('queryShipment', `<keys>${esc(key)}</keys><keyType>0</keyType><addHistoricalData>false</addHistoricalData><onlyTracking>false</onlyTracking>`, 'wsLanguage');
  return {
    async test() {
      const x = await query('HASTURKTEST');
      if (authErr(x)) return { ok: false, message: authErr(x) };
      return { ok: true, message: `Yurtiçi Kargo bağlantısı tamam${test ? ' (test ortamı)' : ''}` };
    },
    async create(s) {
      const r = s.receiver, phone = phone10(r.phone), key = cargoKey(s);
      if (!r.district) throw new Error('Yurtiçi alıcı ilçesini istiyor; sipariş adresinde ilçe yok');
      if (phone.length !== 10) throw new Error('Yurtiçi alıcı telefonunu istiyor (10 hane); siparişte geçerli telefon yok');
      const name = r.name.length >= 5 ? r.name : (r.name + ' ' + r.name).slice(0, 5).padEnd(5, '.');
      const addr = r.address.length >= 10 ? r.address : `${r.address} ${r.district} ${r.city}`.padEnd(10, '.');
      const vo = [['cargoKey', key], ['invoiceKey', key], ['receiverCustName', cut(name, 200)], ['receiverAddress', cut(addr, 500)], ['cityName', cut(r.city, 40)], ['townName', cut(r.district, 40)],
        ['receiverPhone1', phone], ['emailAddress', r.email], ['desi', Number(s.desi) || 1], ['kg', Number(s.desi) || 1], ['cargoCount', 1],
        ['description', cut((s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ') || s.reference, 255)]]
        .filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
      const x = await call('createShipment', `<ShippingOrderVO>${vo}</ShippingOrderVO>`);
      const row = tags(x, 'shippingOrderDetailVO')[0] || '', code = tag(row, 'errCode') || tag(x, 'errCode');
      if (authErr(x) || AUTH.test(code)) throw new Error('Yurtiçi web servis kullanıcı adı veya şifresi hatalı');
      // 60020: aynı anahtarla gönderi zaten var (yanıtı kaybolmuş önceki istek) → o gönderi kullanılır
      if ((tag(x, 'outFlag') !== '0' || (code && code !== '0')) && code !== '60020') throw new Error('Yurtiçi: ' + (tag(row, 'errMessage') || tag(x, 'outResult') || 'gönderi oluşturulamadı'));
      return { ref: key, tracking: '', barcode: key, carrier: 'Yurtiçi Kargo', trackingUrl: '', cost: null, label: null };
    },
    async cancel(ref) {
      const x = await call('cancelShipment', `<cargoKeys>${esc(ref)}</cargoKeys>`);
      const row = tags(x, 'shippingCancelDetailVO')[0] || '', st = tag(row, 'operationStatus'), code = tag(row, 'errCode');
      if (authErr(x)) throw new Error(authErr(x));
      // 82519: kayıt yok (iptal edilen gönderi Yurtiçi'de silinir) → iptal edilmiş sayılır
      if (['CNL', 'ISC'].includes(st) || code === '82520' || code === '82519') return;
      throw new Error('Yurtiçi gönderisi iptal edilemedi' + (st && st !== 'NOP' ? ' (gönderi şubede işlem görmüş; Yurtiçi şubesinden iptal isteyin)' : '') + ': ' + (tag(row, 'errMessage') || tag(row, 'operationMessage') || tag(x, 'outResult')));
    },
    async track(pkg) {
      const x = await query(pkg.carrier_ref);
      if (authErr(x)) throw new Error(authErr(x));
      const row = tags(x, 'shippingDeliveryDetailVO')[0] || '';
      if (tag(row, 'errCode') && tag(row, 'errCode') !== '0') throw new Error('Yurtiçi takip: ' + tag(row, 'errMessage'));
      const item = tags(row, 'shippingDeliveryItemDetailVO')[0] || '', st = tag(row, 'operationStatus');
      const doc = tag(item, 'docId') !== '0' ? tag(item, 'docId') : '';
      // İade: returnStatus 2 / 3 ya da rejectStatus 9 / 10
      const returned = ['2', '3'].includes(tag(item, 'returnStatus')) || ['9', '10'].includes(tag(item, 'rejectStatus'));
      const d = /^(\d{4})(\d{2})(\d{2})$/.exec(tag(item, 'deliveryDate')), tm = /^(\d{2})(\d{2})/.exec(tag(item, 'deliveryTime'));
      const state = returned ? 'returned' : STATES[st] || null;
      return {
        state, text: tag(row, 'operationMessage') || st, tracking: doc, barcode: doc || pkg.carrier_ref,
        trackingUrl: tag(item, 'trackingUrl') || (doc ? trackUrl('yurtici', doc) : ''), cost: money(tag(item, 'totalAmount')),
        deliveredAt: state === 'delivered' && d ? Date.parse(`${d[1]}-${d[2]}-${d[3]}T${tm ? tm[1] : '12'}:${tm ? tm[2] : '00'}:00+03:00`) : null,
      };
    },
  };
}
