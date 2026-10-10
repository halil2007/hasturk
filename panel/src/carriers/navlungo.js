// Navlungo (yurt içi API v2.1, domestic-api.navlungo.com): bakiyeli gönderi platformu.
// Kimlik: Navlungo panelinde Entegrasyonlar'dan açılan API kullanıcısı (panel girişi değil) → POST /auth/api ile 8 saatlik token.
// Gönderen: Navlungo adres defterindeki gönderici adresinin numarası (sender.addressId). Kargo firması: carrier_id (1 = otomatik).
// Gönderi firmaya sırayla iletilir (bakiye yeterliyse): takip no ve etiket birkaç saniye / dakika sonra hazır olur → track / label.
import { http, str, sleep } from '../util.js';
import { phone10, money, b64, stateOf } from './common.js';

const BASE = (test) => (test ? 'https://domestic-api-qa.navlungo.com/v2.1' : 'https://domestic-api.navlungo.com/v2.1');
const tokens = new Map();
// Navlungo hata gövdesi: { status:false, error: 'metin' | { alan: [..] }, message }
const errText = (j) => (typeof j.error === 'string' ? j.error : j.error && typeof j.error === 'object' ? Object.values(j.error).flat().join(' ') : str(j.message));
// Navlungo durum kodları → panel takip durumu
const STATES = { 1: 'created', 14: 'created', 2: 'delivered', 3: 'transit', 4: 'transit', 5: 'transit', 6: 'transit', 16: 'transit', 17: 'transit', 18: 'transit', 7: 'returned', 9: 'returned', 21: 'returned', 10: 'cancelled' };
const phoneTR = (p) => { const d = phone10(p); return d.length === 10 ? `+90 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : ''; };

export function make(values) {
  const test = values.NAVLUNGO_ENV === 'test', user = str(values.NAVLUNGO_USER), pass = str(values.NAVLUNGO_PASSWORD);
  const base = BASE(test), key = `${test ? 'qa' : 'prod'}:${user}:${pass.length}`;
  const call = async (method, path, body, auth) => {
    let res;
    try {
      res = await http(base + path, { method, raw: true, tries: 1, headers: { Accept: 'application/json', 'X-localization': 'tr', ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      const m = /HTTP (\d+) (.*)$/s.exec(e.message || ''); let j = null;
      try { j = JSON.parse(m ? m[2] : ''); } catch { /* düz metin */ }
      const err = new Error('Navlungo: ' + (j ? errText(j) : m ? m[2] : e.message) + (m && m[1] === '402' ? ' (Navlungo bakiyesi yetersiz)' : ''));
      err.status = m ? Number(m[1]) : 0;
      throw err;
    }
    const j = await res.json().catch(() => ({}));
    if (j.status === false) throw new Error('Navlungo: ' + errText(j));
    return j;
  };
  async function token(fresh) {
    const c = tokens.get(key);
    if (!fresh && c && c.until > Date.now()) return c.t;
    const j = await call('POST', '/auth/api', { username: user, password: pass }).catch((e) => {
      throw new Error(e.status === 422 || e.status === 401 ? 'Navlungo API kullanıcı adı / şifresi geçersiz. Navlungo panelinde Entegrasyonlar bölümünden açılan API kullanıcısını girin (panel giriş bilgisi çalışmaz).' : e.message);
    });
    const t = j.data && j.data.access_token;
    if (!t) throw new Error('Navlungo oturum açılamadı');
    tokens.set(key, { t, until: Date.now() + 7.5 * 3600e3 });
    return t;
  }
  const req = async (method, path, body) => {
    try { return await call(method, path, body, await token()); } catch (e) {
      if (e.status !== 401) throw e;
      return call(method, path, body, await token(true)); // süresi dolmuş token
    }
  };
  const check = async (ref) => (await req('GET', `/post/check/${encodeURIComponent(ref)}`)).data || {};
  const result = (d) => {
    const st = d.status || {}, p = d.post || {};
    return {
      ref: str(d.post_number), tracking: str(d.carrier_tracking_code), barcode: str(d.carrier_tracking_code) || str(d.post_number),
      carrier: str(p.carrier_name) || 'Navlungo', trackingUrl: str(d.carrier_tracking_url) || str(d.tracking_url),
      cost: money(p.post && (p.post.post_price ?? p.post.calculated_price)), state: STATES[st.status_code] || stateOf(st.status_name), text: str(st.status_name),
      deliveredAt: st.delivered_date ? Date.parse(String(st.delivered_date).replace(' ', 'T') + '+03:00') || null : null, labelReady: d.barcode_status === 1,
    };
  };
  async function getLabel(ref) {
    const j = await req('POST', '/barcode/getBarcode', { post_number: ref, barcode_type: 'pdf' });
    const d = j.data && j.data.barcode_pdf;
    return d ? { format: 'pdf', data: b64(d) } : null;
  }
  return {
    async test() {
      await token(true);
      const addr = str(values.NAVLUNGO_ADDRESS_ID);
      if (addr) {
        const a = (await req('GET', `/address-book/get/${encodeURIComponent(addr)}`)).data || {};
        return { ok: true, message: `Navlungo bağlantısı tamam · gönderen adresi: ${str(a.location_name || a.address_name) || addr}` };
      }
      return { ok: true, message: 'Navlungo bağlantısı tamam' };
    },
    async create(s) {
      const r = s.receiver, phone = phoneTR(r.phone);
      if (!phone) throw new Error('Navlungo alıcı telefonunu zorunlu istiyor; siparişte geçerli telefon yok');
      if (!r.district) throw new Error('Navlungo alıcı ilçesini zorunlu istiyor; sipariş adresinde ilçe yok');
      const ref = s.reference.replace(/[^\w.-]/g, '-').slice(0, 60);
      const post = {
        reference_id: ref, carrier_id: Number(values.NAVLUNGO_CARRIER_ID) || 1, post_type: 2, cod_payment_type: '',
        sender: { addressId: Number(values.NAVLUNGO_ADDRESS_ID) || values.NAVLUNGO_ADDRESS_ID },
        recipient: { name: r.name, phone, email: r.email || '', address: r.address, country: 'tr', city: r.city, district: r.district, post_code: r.postalCode || '' },
        post: { desi: s.desi, package_count: 1, price: '', note: s.orderNumber ? `Sipariş ${s.orderNumber}` : '' },
        barcode_format: 'pdf-A5',
      };
      let j;
      try { j = await req('POST', '/post/create', { platform: 'HasTürk', posts: [post] }); } catch (e) {
        // Aynı referansla önceden açılmış (yanıtı kaybolmuş) gönderi: o gönderi kullanılır
        if (!/zaten mevcut/i.test(e.message)) throw e;
        j = { data: [await check(ref)] };
      }
      const d = Array.isArray(j.data) ? j.data[0] : j.data && j.data.post_number ? j.data : j;
      if (!d || !d.post_number) throw new Error('Navlungo gönderi numarası vermedi');
      // Firma gönderisi birkaç saniyede oluşur: kısa bir bekleme ile takip no ve etiket aynı işlemde alınmaya çalışılır
      let out = { ref: str(d.post_number), tracking: '', barcode: str(d.post_number), carrier: str(d.post && d.post.carrier_name) || 'Navlungo', trackingUrl: str(d.tracking_url), cost: null, label: null };
      for (const wait of [1500, 2500]) {
        await sleep(wait);
        const c = await check(out.ref).catch(() => null);
        if (!c) continue;
        out = { ...out, ...result(c), label: null };
        if (out.labelReady) { out.label = await getLabel(out.ref).catch(() => null); break; }
      }
      return out;
    },
    async cancel(ref) { await req('POST', '/post/cancel', { post_number: ref }); },
    async track(pkg) { return result(await check(pkg.carrier_ref)); },
    async label(pkg) { return getLabel(pkg.carrier_ref); },
  };
}
