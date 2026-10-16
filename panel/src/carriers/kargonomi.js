// Kargonomi (app.kargonomi.com.tr/api/v1): bakiye yüklemeli kargo platformu. Kimlik: sabit API anahtarı (Bearer).
// Gönderi üç adımda açılır: taslak (POST /shipments) → kargo firması seçimi (POST /confirm-shipping-price; -1 = en ucuz)
// → firma gönderisi oluşunca takip no ve etiket (GET /shipments/{id}, /shipments/{id}/barcode?format=pdf).
// Alıcı il / ilçesi Kargonomi'nin numaralarıyla gönderilir (Kargonomi'de "state" = il, "city" = ilçe): adlardan bulunur, önbelleklenir.
// Gönderen: Kargonomi panelindeki depo (warehouse); numara girilmediyse ana depo kullanılır.
// Kargo firması: kullanıcı seçer (otomatik seçim yok): gönderinin teklifleri (GET /shipment-price-comparison/{id}) fiyatlarıyla gösterilir.
// Alan kuralları (doküman): alıcı adı en az 5 karakter ve 2 kelime, adres 10–512 karakter, telefon 10 hane, desi > 0.
import { http, str } from '../util.js';
import { phone10, nameKey, fullAddress, money, b64, trackUrl, ascii } from './common.js';

const API = 'https://app.kargonomi.com.tr/api/v1';
// Paket içeriği: Kargonomi yalnız Latin harf, rakam ve izinli noktalama kabul eder (uzun tire, tırnak, ×, ₺, emoji, Kiril / Arapça
// reddedilir). Türkçe harfler ASCII'ye çevrilir, tire / tırnak türleri sadeleşir, kalan izinsiz karakterler atılır.
export const safeText = (t) => ascii(String(t || '').normalize('NFKC'))
  .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019\u201A\u2032`´]/g, "'").replace(/[\u201C\u201D\u201E\u2033«»]/g, '"').replace(/[×✕]/g, 'x')
  .replace(/[^A-Za-z0-9 .,;:()\/&+%#'"-]/g, ' ').replace(/\s+/g, ' ').trim();
const places = new Map(); // il / ilçe listeleri (isolate ömrü boyunca)
const unwrap = (j) => (j && j.data && !Array.isArray(j.data) && typeof j.data === 'object' ? j.data : j);
const list = (j) => (Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : []);
const label = (x) => str(x && (x.name || x.title || x.state_name || x.city_name));

// Kargonomi durumları → panel takip durumu
const STATES = {
  draft: 'created', ready: 'created', webservice_order_creating: 'created', webservice_order_created: 'created', webservice_checking_shipment: 'created',
  webservice_shipment_started: 'transit', webservice_shipment_not_delivered: 'transit', webservice_shipment_delivered: 'delivered',
  // İptal talebi kesin iptal değildir (Kargonomi 36 saate kadar işler, reddedebilir): takip sürer
  webservice_shipment_returning: 'returned', webservice_shipment_missing: 'transit', cancelled: 'cancelled', request_for_cancellation: 'cancelling',
  webservice_order_failed: 'failed',
};

export function make(values) {
  const token = str(values.KARGONOMI_API_KEY).replace(/^Bearer\s+/i, '');
  const req = async (method, path, body) => {
    try {
      return await http(API + path, { method, tries: method === 'GET' ? 2 : 1, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      // Laravel doğrulama hatası: { message, errors: { alan: [..] } } → alan mesajları (İngilizce genel "The given data was invalid." yerine)
      const m = /HTTP (\d+) (.*)$/s.exec(e.message || ''), code = m ? m[1] : String(e.status || '');
      if (code === '401') throw new Error('Kargonomi API anahtarı geçersiz (401). Kargonomi panelindeki anahtarı yeniden girin.');
      const d = e.data || {}, fields = d.errors && typeof d.errors === 'object' ? Object.values(d.errors).flat().map(str).filter(Boolean) : [];
      let msg = fields.length ? fields.join(' · ') : str(d.message) || (m ? m[2] : e.message);
      if (code === '404' && !fields.length) msg = 'gönderi Kargonomi\'de bulunamadı (silinmiş ya da iptal edilmiş olabilir)';
      else if (/^the given data was invalid\.?$/i.test(msg)) msg = 'Kargonomi bilgileri kabul etmedi (eksik / hatalı alan)';
      else if (/unauthenticated/i.test(msg)) msg = 'API anahtarı kabul edilmedi';
      else if (/too many/i.test(msg)) msg = 'çok fazla istek; birkaç dakika sonra yeniden deneyin';
      else if (/server error/i.test(msg)) msg = 'Kargonomi sunucusu yanıt veremedi; birkaç dakika sonra yeniden deneyin';
      const out = new Error('Kargonomi: ' + msg);
      out.status = e.status;
      throw out;
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
  // Seçilen kargo firması → bu gönderinin teklifleri içindeki numarası (yoksa hangi firmaların teklif verdiği yazılır)
  const LEGACY = { 3: 'kolaygelsin', 4: 'aras', 5: 'surat', 6: 'hepsijet', 7: 'ptt' }; // eski sürümde kaydedilen firma numaraları
  // Kargo firması her zaman kullanıcının seçimidir (otomatik / en ucuz seçilmez): tekliften numarası (firmId) ya da adı (toplu gönderimde
  // seçilen firma, yoksa Ayarlar'daki varsayılan firma). Hiçbiri yoksa gönderi açılmaz.
  const offersOf = async (id) => list(unwrap(await req('GET', `/shipment-price-comparison/${id}`)).shipping_provider_with_price || []).filter((o) => String(o.id) !== '-1')
    .map((o) => ({ id: String(o.id), name: str(o.name), slug: str(o.slug), price: o.price == null ? null : money(o.price), note: money(o.price) == null && o.price != null ? str(o.price) : '' }))
    // Fiyat yerine açıklama gelen firma (ör. "Hizmet Dışı Bölge") bu gönderiyi taşımaz: listelenmez
    .filter((o) => o.price != null);
  async function providerId(id, { firmId, firm } = {}) {
    if (firmId && String(firmId) !== '-1') return Number(firmId) || firmId;
    let want = str(firm);
    if (LEGACY[want]) want = LEGACY[want];
    if (!want || want === '-1') throw new Error('Kargonomi: kargo firması seçilmedi. Gönderirken firmayı seçin (fiyatlar Kargonomi\'den gelir)');
    const offers = await offersOf(id);
    const k = nameKey(want), hit = offers.find((o) => nameKey(o.slug) === k || nameKey(o.slug).startsWith(k) || nameKey(o.name).startsWith(k));
    if (!hit) throw new Error(`Kargonomi: seçilen kargo firması (${want}) bu gönderi için teklif vermedi. Teklif verenler: ${offers.map((o) => `${str(o.name)}${o.price != null ? ` (${o.price} TL)` : ''}`).join(', ') || 'yok'}. Başka bir firma seçin.`);
    return Number(hit.id) || hit.id;
  }
  // Gönderi taslağı (doküman kuralları istekten önce denetlenir)
  async function openDraft(s) {
    const r = s.receiver, phone = phone10(r.phone);
    if (phone.length !== 10) throw new Error('Kargonomi alıcı telefonunu zorunlu istiyor (10 hane); siparişte geçerli telefon yok');
    if (!r.district) throw new Error('Kargonomi alıcı ilçesini zorunlu istiyor; sipariş adresinde ilçe yok');
    // Ad / adres: Türkçe harfler kalır, emoji ve Latin dışı yazılar atılır (Kargonomi reddeder)
    const clean = (t) => String(t || '').replace(/[^\p{Script=Latin}\p{N}\s.,;:()\/&+%#'"-]/gu, ' ').replace(/[\u2010-\u2015]/g, '-');
    const buyer = clean(str(r.name)).replace(/\s+/g, ' ').trim();
    if (buyer.length < 5 || buyer.split(' ').length < 2) throw new Error(`Kargonomi alıcı adını ad ve soyadıyla istiyor (en az 2 kelime, 5 karakter); siparişteki ad: “${buyer || '—'}”`);
    const addr = clean(fullAddress(r)).replace(/\s+/g, ' ').trim().slice(0, 512);
    if (addr.replace(/\s/g, '').length < 10) throw new Error('Kargonomi alıcı adresini en az 10 karakter istiyor; sipariş adresi çok kısa');
    const stateId = await placeId('state', null, r.city);
    if (!stateId) throw new Error(`Kargonomi: alıcı ili bulunamadı (“${r.city}”)`);
    const cityId = await placeId('city', stateId, r.district);
    if (!cityId) throw new Error(`Kargonomi: alıcı ilçesi bulunamadı (“${r.district}”, ${r.city})`);
    const body = { shipment: {
      warehouse_id: await warehouse(), buyer_name: buyer.slice(0, 255), buyer_email: r.email || undefined, buyer_phone: phone, buyer_address: addr,
      buyer_state_id: stateId, buyer_city_id: cityId,
      packages: [{ desi: Number(s.desi) > 0 ? Number(s.desi) : 1, content: safeText((s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ')).slice(0, 200) || safeText(s.reference) || 'Urun' }],
    } };
    let draft;
    try { draft = unwrap(await req('POST', '/shipments', body)); } catch (e) {
      // Kargonomi bir alanın yazımını reddetti (karakter / biçim): alan arka planda sadeleştirilip bir kez yeniden denenir —
      // içerik "Siparis <no>", ad / adres / e-posta ASCII; kullanıcıya hata yalnız ikinci deneme de olmazsa gösterilir
      const m = String(e.message || '');
      if (!/karakter|harf|içerik|icerik|content|buyer_|alıcı|adres|address|name|isim|e-posta|email|geçersiz|invalid|format/i.test(m) || /bakiye|credit|yetki|401|token/i.test(m)) throw e;
      const sh = body.shipment;
      sh.packages[0].content = safeText(`Siparis ${s.orderNumber || s.reference || ''}`).slice(0, 200) || 'Urun';
      sh.buyer_name = safeText(sh.buyer_name).slice(0, 255);
      sh.buyer_address = safeText(sh.buyer_address).slice(0, 512);
      if (sh.buyer_email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(sh.buyer_email)) delete sh.buyer_email;
      draft = unwrap(await req('POST', '/shipments', body));
    }
    if (!draft || !draft.id) throw new Error('Kargonomi gönderi numarası vermedi');
    return draft;
  }
  const result = (s) => {
    const tracking = str(s.shipping_webservice_tracking_code), carrier = str(s.shipping_provider_name);
    // Şubede ölçülen desi (paket başına real_desi) ve kesin ücret (real_price; ek ücret extra_shipping_price ayrıca eklenir)
    const pk = Array.isArray(s.shipment_packages) ? s.shipment_packages : [];
    const realDesi = pk.length && pk.every((x) => money(x.real_desi) != null) ? Math.round(pk.reduce((a, x) => a + money(x.real_desi), 0) * 100) / 100 : null;
    const real = money(s.real_price), extra = money(s.extra_shipping_price) || 0;
    return {
      realDesi,
      ref: str(s.id), tracking, // barkod: kargo firmasının okuttuğu barkod (Kargonomi'nin kendi sipariş barkodu değil; bizim tasarımdaki etikete basılır)
      barcode: str(s.shipping_webservice_barcode) || tracking, carrier: carrier || 'Kargonomi',
      // DOĞRULA: real_price / estimated_price KDV hariç kabul edildi (Kargonomi fiyat listeleri KDV hariç)
      // costFinal: gerçek ücret (real_price) geldi; tahmini ücretin yerine geçer (bkz. carriers.js trackCarriers)
      trackingUrl: tracking ? trackUrl(s.shipping_provider_slug, tracking) : '', cost: real != null ? Math.round((real + extra) * 100) / 100 : money(s.estimated_price), costFinal: real != null, costVatIncluded: false,
      state: STATES[s.status] || null, text: str(s.status_label),
    };
  };
  // Etiket hazır mı: kargo firmasında gönderi oluştu (takip kodu firma kabulünden sonra gelebilir; etiket ondan önce de alınır)
  const LABEL_READY = new Set(['webservice_order_created', 'webservice_checking_shipment', 'webservice_shipment_started', 'webservice_shipment_not_delivered', 'webservice_shipment_returning', 'webservice_shipment_missing']);
  const labelReady = (s) => LABEL_READY.has(s.status) || !!str(s.shipping_webservice_barcode) || !!str(s.shipping_webservice_tracking_code);
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
    // Fiyat teklifi: taslak açılır, firmaların fiyatları döner (ref = taslak; create(s, { draftId, providerId }) onaylar, discard siler)
    async quote(s) {
      const draft = await openDraft(s);
      try { return { ref: str(draft.id), offers: await offersOf(draft.id) }; } catch (e) { await req('DELETE', `/shipments/${draft.id}`).catch(() => null); throw e; }
    },
    // Vazgeçilen teklif: yalnız hâlâ taslaksa silinir (yanıtı kaybolmuş onaylı gönderi silinmesin)
    async discard(ref) {
      const s = unwrap(await req('GET', `/shipments/${ref}`).catch(() => null)) || {};
      if (str(s.status) === 'draft') await req('DELETE', `/shipments/${ref}`);
    },
    async create(s, opts = {}) {
      const draft = opts.draftId ? { id: Number(opts.draftId) || opts.draftId } : await openDraft(s);
      // Firma seçimi onaydan önce: seçilen firma teklif vermediyse gönderi hiç onaylanmaz; panelin açtığı taslak silinir
      let pid;
      try { pid = await providerId(draft.id, { firmId: opts.providerId, firm: opts.firm }); } catch (e) {
        if (!opts.draftId) await req('DELETE', `/shipments/${draft.id}`).catch(() => null);
        throw e;
      }
      try {
        await req('POST', '/confirm-shipping-price', { shipment_id: draft.id, shipping_provider_id: pid });
      } catch (e) {
        // Onay yanıtı alınamadı ama Kargonomi işlemiş olabilir (zaman aşımı / 5xx): gönderi taslak değilse iptal edilir, taslaksa silinir.
        // Durumu okunamazsa ikisi de denenir: ücretli ve panelde kaydı olmayan gönderi kalmasın
        const now = unwrap(await req('GET', `/shipments/${draft.id}`).catch(() => null)) || {};
        // Kullanıcının seçtiği teklif (draftId) taslak kaldıysa korunur: başka firma seçip yeniden deneyebilir (vazgeçerse ekran siler)
        if (now.status === 'draft') { if (!opts.draftId) await req('DELETE', `/shipments/${draft.id}`).catch(() => null); }
        else if (now.status) await req('POST', '/shipments/cancel', { shipment_id: draft.id }).catch(() => null);
        else await req('POST', '/shipments/cancel', { shipment_id: draft.id }).catch(() => (opts.draftId ? null : req('DELETE', `/shipments/${draft.id}`))).catch(() => null);
        throw e;
      }
      // Fiyat onayından sonraki hata: gönderi panele yazılmaz (takipsiz taslak / gönderi kalmasın) → iptal edilir, olmazsa silinir (en iyi çaba)
      try {
        // Kargo firması gönderiyi birkaç saniyede oluşturur: kısa bir süre (en çok ~6 sn) beklenir, oluşunca etiket hemen alınır
        let s2 = unwrap(await req('GET', `/shipments/${draft.id}`).catch(() => draft));
        for (let i = 0; i < 3 && !labelReady(s2) && s2.status !== 'webservice_order_failed' && !opts.noWait; i++) {
          await new Promise((res) => setTimeout(res, 2000));
          s2 = unwrap(await req('GET', `/shipments/${draft.id}`).catch(() => s2));
        }
        if (s2.status === 'webservice_order_failed') throw new Error(`Kargonomi: kargo firması gönderiyi oluşturamadı (${str(s2.status_label)})`);
        const out = result(s2);
        out.label = labelReady(s2) ? await getLabel(draft.id).catch(() => null) : null;
        return out;
      } catch (e) {
        await req('POST', '/shipments/cancel', { shipment_id: draft.id }).catch(() => req('DELETE', `/shipments/${draft.id}`)).catch(() => null);
        throw e;
      }
    },
    // İptal: Kargonomi'de iptal bir taleptir (kargo firması paketi almadıysa 36 saate kadar işlenir, reddedilebilir).
    // Dönüş: { done } kesin iptal (ya da silinen taslak) · { pending } talep iletildi, sonuç takipte gelir (bkz. carriers.js)
    async cancel(ref) {
      const id = Number(ref) || ref;
      const statusOf = async () => str((unwrap(await req('GET', `/shipments/${id}`).catch(() => null)) || {}).status);
      const now = await statusOf();
      if (now === 'cancelled') return { done: true };
      if (now === 'draft') { await req('DELETE', `/shipments/${id}`); return { done: true }; }
      if (now === 'request_for_cancellation') return { pending: true };
      await req('POST', '/shipments/cancel', { shipment_id: id });
      return (await statusOf()) === 'cancelled' ? { done: true } : { pending: true };
    },
    async track(pkg) { return result(unwrap(await req('GET', `/shipments/${pkg.carrier_ref}`))); },
    // Etiket, firma gönderisi oluştuktan (takip no geldikten) sonra hazır olur
    async label(pkg) {
      const raw = unwrap(await req('GET', `/shipments/${pkg.carrier_ref}`)), s = result(raw);
      if (raw.status === 'webservice_order_failed') return { failed: true, text: str(raw.status_label) };
      if (!labelReady(raw)) return null;
      const lab = await getLabel(pkg.carrier_ref);
      return lab ? { ...lab, tracking: s.tracking, barcode: s.barcode, carrier: s.carrier, trackingUrl: s.trackingUrl } : null;
    },
  };
}
