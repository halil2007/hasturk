// WooCommerce (WordPress, REST API v3: {site}/wp-json/wc/v3). Kendi web siteniz: komisyon yok, etiketi panel basar, takip no satıcı girer.
// Anahtar: WooCommerce → Ayarlar → Gelişmiş → REST API → Anahtar ekle (izin: Okuma/Yazma) → Consumer key (ck_…) + secret (cs_…).
// Kimlik: HTTPS üzerinden HTTP Basic. Bazı sunucular (Apache/CGI) Authorization başlığını siler → 401: bir kez anahtarlar
// sorgu parametresiyle (consumer_key / consumer_secret) denenir ve o yöntemle devam edilir. Kalıcı bağlantılar "Düz" ise /wp-json çalışmaz.
// Siparişler: senkronda değiştirilme tarihine (modified_after, eskiden yeniye), geçmiş aktarımında sipariş tarihine (after/before) göre.
// Ödenmemiş (pending, failed, checkout-draft) siparişler alınmaz; on-hold (havale / EFT onayı bekleniyor) "ödeme bekleniyor" işaretli gelir.
// Woo'da "teslim edildi" yok: completed → kargoda.
// Kargoya verme: sipariş "completed" yapılır ve müşteriye görünen not (kargo firması + takip no) eklenir.
// Yok: ürün oluşturma, iade talepleri, soru-cevap. Tutarlar KDV dahil (satır total + total_tax).
import { http, basic, num, str, chunk, imageList, diagStep } from '../util.js';

const SKIP = ['pending', 'failed', 'checkout-draft', 'trash', 'auto-draft'];
const ST = { processing: 'new', 'on-hold': 'new', completed: 'shipped', cancelled: 'cancelled', refunded: 'returned' };
// Eklentilerin özel durumları (ör. "kargoya-verildi", "delivered") adından tahmin edilir
export const wooStatus = (s) => ST[s] || (/deliver|teslim/i.test(s) ? 'delivered' : /ship|kargo/i.test(s) ? 'shipped' : /iade|return/i.test(s) ? 'returned' : /cancel|iptal/i.test(s) ? 'cancelled' : 'new');
// WooCommerce Türkiye il kodları (TR01…TR81, plaka sırası) → il adı; bu durumda "city" alanı ilçedir
const IL = 'Adana,Adıyaman,Afyonkarahisar,Ağrı,Amasya,Ankara,Antalya,Artvin,Aydın,Balıkesir,Bilecik,Bingöl,Bitlis,Bolu,Burdur,Bursa,Çanakkale,Çankırı,Çorum,Denizli,Diyarbakır,Edirne,Elazığ,Erzincan,Erzurum,Eskişehir,Gaziantep,Giresun,Gümüşhane,Hakkari,Hatay,Isparta,Mersin,İstanbul,İzmir,Kars,Kastamonu,Kayseri,Kırklareli,Kırşehir,Kocaeli,Konya,Kütahya,Malatya,Manisa,Kahramanmaraş,Mardin,Muğla,Muş,Nevşehir,Niğde,Ordu,Rize,Sakarya,Samsun,Siirt,Sinop,Sivas,Tekirdağ,Tokat,Trabzon,Tunceli,Şanlıurfa,Uşak,Van,Yozgat,Zonguldak,Aksaray,Bayburt,Karaman,Kırıkkale,Batman,Şırnak,Bartın,Ardahan,Iğdır,Yalova,Karabük,Kilis,Osmaniye,Düzce'.split(',');
const ilOf = (st) => { const m = /^TR(\d\d)$/i.exec(str(st)); return m ? IL[Number(m[1]) - 1] || '' : ''; };
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const meta_ = (o, re) => (o.meta_data || []).find((m) => re.test(m.key) && m.value);

export function woocommerce(env, meta) {
  const base0 = str(env.WOO_URL).replace(/\/+$/, '').replace(/\/(wp-admin|wp-json)(\/.*)?$/i, '');
  const site = /^https:\/\/[^\s/]+/i.test(base0) ? base0 : ''; // anahtar düz HTTP'den gönderilmez
  const API = site + '/wp-json/wc/v3', key = env.WOO_KEY, secret = env.WOO_SECRET;
  let viaQuery = false;

  async function call(path, { method = 'GET', body, query = {} } = {}) {
    const q = (extra) => { const s = new URLSearchParams({ ...query, ...extra }).toString(); return s ? (path.includes('?') ? '&' : '?') + s : ''; };
    const opts = { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
    if (!viaQuery) {
      try { return await http(API + path + q(), { ...opts, headers: { ...opts.headers, Authorization: basic(key, secret) } }); } catch (e) {
        if (e.status !== 401) throw e;
        viaQuery = true; // sunucu Authorization başlığını silmiş olabilir: anahtarlar sorgu parametresiyle
        try { return await http(API + path + q({ consumer_key: key, consumer_secret: secret }), opts); } catch (e2) { viaQuery = false; throw e2.status === 401 ? e : e2; }
      }
    }
    return http(API + path + q({ consumer_key: key, consumer_secret: secret }), opts);
  }

  function norm(o) {
    const b = o.billing || {}, s = o.shipping && (o.shipping.address_1 || o.shipping.city) ? o.shipping : b;
    const il = ilOf(s.state), name = [s.first_name, s.last_name].map(str).filter(Boolean).join(' ');
    const items = (o.line_items || []).map((it) => {
      const qty = num(it.quantity, 1), total = num(it.total) + num(it.total_tax);
      return { lineId: str(it.id), sku: str(it.sku), barcode: str(it.global_unique_id), name: str(it.name), image: str(it.image && it.image.src), quantity: qty,
        unitPrice: qty ? total / qty : num(it.price), total, status: '', remoteKey: str(it.variation_id || it.product_id) };
    });
    // Takip: "Shipment Tracking" eklentisi (_wc_shipment_tracking_items) ya da _tracking_number / _tracking_provider benzeri alanlar
    const stItems = meta_(o, /^_wc_shipment_tracking_items$/), st = stItems && Array.isArray(stItems.value) ? stItems.value[stItems.value.length - 1] || {} : {};
    const tn = meta_(o, /tracking_(number|code)|takip/i), tp = meta_(o, /tracking_provider|kargo_firma/i);
    return {
      remoteId: str(o.id), orderNumber: str(o.number || o.id), orderedAt: Date.parse(o.date_created_gmt ? o.date_created_gmt + 'Z' : o.date_created) || Date.now(),
      remoteStatus: str(o.status), status: wooStatus(str(o.status)), awaitingPayment: o.status === 'on-hold',
      customer: [b.first_name, b.last_name].map(str).filter(Boolean).join(' ') || name, phone: str(b.phone || s.phone), email: str(b.email), customerId: num(o.customer_id) ? str(o.customer_id) : '',
      address: { name: name || [b.first_name, b.last_name].map(str).filter(Boolean).join(' '), line: [s.address_1, s.address_2].map(str).filter(Boolean).join(' '),
        district: il ? str(s.city) : '', city: il || str(s.city || s.state), phone: str(s.phone || b.phone) },
      total: num(o.total), currency: str(o.currency) || 'TRY',
      cargoCompany: str(st.custom_tracking_provider || st.tracking_provider || (tp && tp.value)), tracking: str(st.tracking_number || (tn && typeof tn.value !== 'object' ? tn.value : '')),
      items, packages: null,
    };
  }

  // Eski sürümler modified_after'ı tanımaz (yok sayar): dönen sipariş aralık dışındaysa sipariş tarihine göre çekmeye geçilir.
  // Değiştirilme tarihine göre eskiden yeniye okunur: 50 sayfa (5000 sipariş) sınırına gelinirse kalanlar son okunan siparişin
  // değiştirilme zamanından itibaren bir sonraki senkronda alınır (partialUntil)
  let modifiedOk = true;
  const MAXP = 50;
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const byMod = !byOrdered && modifiedOk, out = [];
    const range = byMod ? { modified_after: iso(since), modified_before: iso(until), orderby: 'modified', order: 'asc' } : { after: iso(since), before: iso(until), orderby: 'date', order: 'desc' };
    let last = null;
    for (let page = 1; page <= MAXP; page++) {
      const rows = await call('/orders', { query: { ...range, dates_are_gmt: 'true', per_page: 100, page } });
      const list = Array.isArray(rows) ? rows : [];
      if (byMod && page === 1 && list.some((o) => o.date_modified_gmt && Date.parse(o.date_modified_gmt + 'Z') < since - 864e5)) { modifiedOk = false; return fetchOrders(since, until, { byOrdered }); }
      for (const o of list) if (!SKIP.includes(o.status)) out.push(norm(o));
      if (list.length < 100) return out;
      last = list[list.length - 1];
    }
    out.warnings = [`WooCommerce: bu aralıkta ${MAXP * 100}+ sipariş var; kalanlar bir sonraki senkronda alınacak`];
    const t = last && Date.parse(last.date_modified_gmt + 'Z');
    if (byMod) out.partialUntil = Number.isFinite(t) ? Math.max(since, t) : since;
    return out;
  }
  // Tek sipariş: çöp kutusundaki (trash) sipariş kanalda yok sayılır; 404 → yok
  async function getOrder(id) {
    try { return await call(`/orders/${encodeURIComponent(id)}`); } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function fetchOne(id) {
    const o = await getOrder(id);
    if (!o || !o.id || o.status === 'trash') throw new Error('WooCommerce: sipariş bulunamadı');
    return norm(o);
  }
  const orderExists = async (id) => { const o = await getOrder(id); return !!(o && o.id && o.status !== 'trash'); };

  const listing = (p, v) => {
    const x = v || p, img = str((v && v.image && v.image.src) || ((p.images || [])[0] || {}).src);
    const vname = v ? (v.attributes || []).map((a) => str(a.option)).filter(Boolean).join(' / ') : '';
    const managed = x.manage_stock === true ? x : x.manage_stock === 'parent' ? p : null; // 'parent': stok ana üründe
    const price = num(x.price || x.regular_price);
    return { remoteId: str(x.id), remoteProductId: str(p.id), sku: str(x.sku), barcode: str(x.global_unique_id), name: vname ? `${str(p.name)} - ${vname}` : str(p.name), groupName: str(p.name), variantName: vname,
      image: img, images: imageList([img, ...(p.images || [])]), price, listPrice: Math.max(num(x.regular_price), price),
      stock: managed ? Math.max(0, num(managed.stock_quantity)) : 0, active: str(x.status || 'publish') === 'publish' && x.purchasable !== false };
  };
  async function fetchListings() {
    const out = [];
    for (let page = 1; page <= 200; page++) {
      const rows = await call('/products', { query: { per_page: 100, page, status: 'publish' } });
      for (const p of Array.isArray(rows) ? rows : []) {
        if (p.type !== 'variable') { out.push(listing(p)); continue; }
        for (let vp = 1; vp <= 10; vp++) {
          const vs = await call(`/products/${p.id}/variations`, { query: { per_page: 100, page: vp } });
          for (const v of Array.isArray(vs) ? vs : []) out.push(listing(p, v));
          if (!Array.isArray(vs) || vs.length < 100) break;
        }
      }
      if (!Array.isArray(rows) || rows.length < 100) break;
    }
    return out;
  }

  // Basit ürün: /products/batch; varyasyon: /products/{ana}/variations/batch (en çok 100'er). Kalem hataları toplanıp bildirilir.
  async function batch(items, fields) {
    const groups = new Map(), errs = [];
    for (const x of items) {
      const parent = x.remoteProductId && String(x.remoteProductId) !== String(x.remoteId) ? String(x.remoteProductId) : '';
      groups.set(parent, [...(groups.get(parent) || []), { id: Number(x.remoteId) || x.remoteId, ...fields(x) }]);
    }
    for (const [parent, list] of groups) {
      for (const part of chunk(list, 100)) {
        const r = await call(parent ? `/products/${parent}/variations/batch` : '/products/batch', { method: 'POST', body: { update: part } });
        for (const u of (r && r.update) || []) if (u && u.error) errs.push(`${u.id}: ${u.error.message || u.error.code}`);
      }
    }
    if (errs.length) throw new Error(`WooCommerce: ${errs.length} ürün güncellenemedi (${errs.slice(0, 3).join('; ')})`);
  }
  const pushStock = (items) => batch(items, (x) => ({ manage_stock: true, stock_quantity: Math.max(0, Math.round(num(x.stock))) }));
  const pushPrice = (items) => batch(items, (x) => {
    const price = num(x.price), list = Math.max(num(x.listPrice), price);
    return { regular_price: String(list), sale_price: price < list ? String(price) : '' };
  });

  // Kargoya ver: müşteriye görünen kargo notu + (siparişin son açık paketiyse) durum "completed" (Woo müşteriye e-posta gönderir)
  async function ship(order, pkg, { cargoCompany, tracking } = {}) {
    const id = encodeURIComponent(order.remote_id);
    if (tracking || cargoCompany) await call(`/orders/${id}/notes`, { method: 'POST', body: { note: [cargoCompany && `Kargo: ${cargoCompany}`, tracking && `Takip: ${tracking}`].filter(Boolean).join(' · '), customer_note: true } });
    const others = (order.packages || []).filter((p) => p.status === 'open' && (!pkg || p.id !== pkg.id));
    if (!others.length) await call(`/orders/${id}`, { method: 'PUT', body: { status: 'completed' } });
    return {};
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const okAuth = await diagStep(out, 'WooCommerce bağlantısı', async () => {
      const r = await call('/products', { query: { per_page: 1 } });
      return { detail: `${site} · kimlik ${viaQuery ? 'sorgu parametresiyle (sunucu Authorization başlığını iletmiyor)' : 'HTTP Basic'} · ${Array.isArray(r) && r.length ? 'ürün örneği alındı' : 'ürün yok'}` };
    });
    if (!okAuth) { out.push({ name: 'İpucu', ok: null, detail: '401: anahtar yanlış ya da yetkisiz · 404: WordPress → Ayarlar → Kalıcı bağlantılar "Düz" olmamalı, WooCommerce REST API açık olmalı' }); return out; }
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * 864e5, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await call(`/orders/${encodeURIComponent(orderId)}`); return { detail: `#${o.number || o.id}: ${o.status} → ${wooStatus(o.status)}` }; });
    // Panel fiyatları KDV dahildir: Woo'da fiyatlar KDV hariç girilecek şekilde ayarlıysa gönderilen fiyat sitede vergi eklenerek görünür
    await diagStep(out, 'Fiyatlar KDV dahil mi', async () => {
      const calc = await call('/settings/general/woocommerce_calc_taxes');
      if (str(calc && calc.value) !== 'yes') return { detail: 'Vergi hesaplama kapalı: fiyatlar sitede olduğu gibi (KDV dahil) görünür' };
      const r = await call('/settings/tax/woocommerce_prices_include_tax');
      const yes = str(r && r.value) === 'yes';
      return { ok: yes ? true : null, detail: yes ? 'Evet (WooCommerce → Ayarlar → Vergi: fiyatlar vergi dahil girilir)' : 'Hayır: WooCommerce fiyatları KDV hariç tutuyor; panelden gönderilen (KDV dahil) fiyatlara sitede ayrıca KDV eklenir · WooCommerce → Ayarlar → Vergi → "Fiyatlar vergi dahil girilecek" seçin' };
    });
    out.push({ name: 'Yazma izni', ok: null, detail: 'Stok / fiyat / kargo için anahtar izni "Okuma/Yazma" olmalı (ilk gönderimde denenir)' });
    return out;
  }

  const missing = [!site && 'WOO_URL', !key && 'WOO_KEY', !secret && 'WOO_SECRET'].filter(Boolean);
  return {
    ...meta, type: 'woocommerce', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
