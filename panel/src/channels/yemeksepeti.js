// Yemeksepeti Market / Mahalle (hızlı market) — Delivery Hero Partner API v2 (yemeksepeti.partner.deliveryhero.io, OpenAPI v2.0.2).
// Kimlik: OAuth 2.0 client_credentials → POST /v2/oauth/token (form: grant_type, client_id, client_secret) → kısa ömürlü access_token;
// her istekte "Authorization: Bearer <token>". Token süresi (expires_in) dolmadan bellekte tutulur; 401'de bir kez yenilenir.
// client_id / client_secret: Yemeksepeti Partner Portal → Shop Integrations (Mağaza Entegrasyonları) eklentisi; Zincir (chain) ve Mağaza (vendor) kimliği
// aynı ekrandan ya da Yemeksepeti hesap yöneticisinden alınır. Tek anahtar zincirin tüm şubelerinde geçer; panel bir mağazayı (vendor) yönetir,
// diğer şubeler "ek mağaza" olarak eklenir (stok / fiyat şube bazlı).
// Siparişler: GET /v2/chains/{chain}/vendors/{vendor}/orders (start_time / end_time = oluşturulma zamanı, ISO 8601, en fazla 60 gün geriye; page / page_size ≤ 500).
// Servis yalnız oluşturulma zamanına göre süzdüğünden normal senkron en az son 2 günü okur (hızlı market siparişi saatler içinde kapanır; durum değişiklikleri kaçmaz).
// Akış (hızlı market): sipariş RECEIVED gelir; ayrıca "kabul" çağrısı yoktur (işleme al panelde kalır). Toplama bitince
// PUT /v2/chains/{chain}/orders/{order_id}: LOGISTICS_DELIVERY (Yemeksepeti kuryesi) → READY_FOR_PICKUP; VENDOR_DELIVERY (kendi kuryesi) → DISPATCHED.
// Gövdede kalemler zorunlu: her kalem _id + status (IN_CART / NOT_FOUND) + pricing (adet ya da KG ise ağırlık). Panelde iptal edilen satır NOT_FOUND gider.
// Etiket ve takip numarası yoktur (kurye platformun): caps.label null, manualTracking false.
// Ürünler: GET /v2/chains/{chain}/vendors/{vendor}/catalog (page / page_size ≤ 500); stok / fiyat PUT aynı yol { products: [{ sku, quantity | price }] }
// (asenkron, 202 + job_id). Liste fiyatı (üstü çizili) bu serviste yok: yalnız satış fiyatı gönderilir. Ürün ekleme (beta), kampanya, şube açma/kapama kullanılmaz.
import { http, num, str, chunk, imageList, diagStep, DEAD_LINE } from '../util.js';

export const YS_BASE = 'https://yemeksepeti.partner.deliveryhero.io';
export const YS_SANDBOX = 'https://sandbox.partner.deliveryhero.io';
const STATUS = { RECEIVED: 'new', READY_FOR_PICKUP: 'shipped', DISPATCHED: 'shipped', DELIVERED: 'delivered', CANCELLED: 'cancelled' };
const D = 864e5, MAX_BACK = 60 * D - 3600e3, MIN_WINDOW = 2 * D, PAGE = 500;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const DEAD_ITEM = ['NOT_FOUND', 'REPLACED'];

export function yemeksepeti(env, meta) {
  const base = str(env.YEMEKSEPETI_ENV) === 'sandbox' ? YS_SANDBOX : YS_BASE;
  const chain = str(env.YEMEKSEPETI_CHAIN_ID), vendor = str(env.YEMEKSEPETI_VENDOR_ID);
  const cv = `/v2/chains/${encodeURIComponent(chain)}`, vp = `${cv}/vendors/${encodeURIComponent(vendor)}`;

  // ---------- kimlik (OAuth client_credentials) ----------
  let tok = null, tokUntil = 0;
  async function token(force = false) {
    if (!force && tok && Date.now() < tokUntil) return tok;
    const r = (await http(base + '/v2/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: str(env.YEMEKSEPETI_CLIENT_ID), client_secret: str(env.YEMEKSEPETI_CLIENT_SECRET) }).toString(),
    })) || {};
    if (!r.access_token) throw new Error('Yemeksepeti: erişim belirteci alınamadı (client_id / client_secret kontrol edin)');
    tok = r.access_token;
    tokUntil = Date.now() + Math.max(60, num(r.expires_in, 3600) - 60) * 1000;
    return tok;
  }
  async function call(path, { method = 'GET', query, body } = {}) {
    const q = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    const go = async (t) => http(base + path + (q ? '?' + q : ''), { method, headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
    try { return await go(await token()); } catch (e) {
      if (e.status !== 401) throw e;
      return go(await token(true)); // belirteç süresinden önce geçersiz olduysa bir kez yenilenir
    }
  }

  // ---------- siparişler ----------
  const qtyOf = (p) => (str(p.pricing_type).toUpperCase() === 'KG' ? 1 : num(p.quantity, 1) || 1);
  function norm(o) {
    const c = o.customer || {}, a = c.delivery_address || {}, pay = o.payment || {};
    const name = [c.first_name, c.last_name].map(str).filter(Boolean).join(' ');
    const items = (o.items || []).map((it) => {
      const p = it.pricing || {}, op = it.original_pricing || {};
      // Satıcı henüz işlemediyse (NOT_PROCESSED) müşterinin istediği adet / tutar; işlendiyse karşılanan
      const src = str(it.status) === 'NOT_PROCESSED' && (op.quantity != null || op.total_price != null) ? op : p;
      const kg = str(src.pricing_type || p.pricing_type).toUpperCase() === 'KG';
      const qty = qtyOf(src), total = num(src.total_price) || num(src.unit_price) * (kg ? num(src.weight, 1) : qty);
      return {
        lineId: str(it._id), sku: str(it.sku), barcode: str([].concat(it.barcode || [])[0]), name: str(it.name), image: str(it.image_url),
        quantity: qty, unitPrice: kg ? total : num(src.unit_price) || (qty ? total / qty : 0), total: Math.round(total * 100) / 100,
        status: DEAD_ITEM.includes(str(it.status)) || str(o.status) === 'CANCELLED' ? 'cancelled' : '', remoteKey: str(it.sku),
      };
    });
    const sys = o.sys || {}, line = [a.street, a.number, a.building, a.block && `Blok ${a.block}`, a.entrance && `Giriş ${a.entrance}`, a.floor && `Kat ${a.floor}`, a.apartment && `Daire ${a.apartment}`, a.zipcode]
      .map(str).filter(Boolean).join(' ') || str(a.formattedAddress);
    return {
      remoteId: str(o.order_id), orderNumber: str(o.external_order_id || o.order_code || o.order_id), orderedAt: Date.parse(sys.created_at) || Date.now(),
      remoteStatus: str(o.status), status: STATUS[o.status] || 'new',
      customer: name, phone: str(c.phone_number), email: '', customerId: str(c._id),
      address: { name, line: [line, a.instructions && `(${str(a.instructions)})`].filter(Boolean).join(' '), district: str(a.suburb), city: str(a.city), phone: str(c.phone_number) },
      total: num(pay.order_total) || items.filter((i) => !i.status).reduce((s, i) => s + i.total, 0), currency: 'TRY',
      // Kurye platformun (LOGISTICS_DELIVERY) ya da satıcının (VENDOR_DELIVERY); takip numarası yok
      cargoCompany: o.transport_type === 'VENDOR_DELIVERY' ? 'Kendi kuryesi' : 'Yemeksepeti kuryesi', tracking: '',
      shipBy: Date.parse(o.promised_for) || Date.parse(o.accepted_for) || null, items, packages: null,
    };
  }

  // Servis oluşturulma zamanına göre süzer: senkronda pencere en az son 2 gün; en fazla 60 gün geriye (geçmiş aktarımda daha eskisi atlanır)
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const end = Math.min(until || Date.now(), Date.now()), floor = Date.now() - MAX_BACK;
    let start = byOrdered ? since : Math.min(since, end - MIN_WINDOW);
    start = Math.max(start, floor);
    if (start >= end) return [];
    const out = [], seen = new Set();
    for (let page = 1; page <= 100; page++) {
      const r = (await call(`${vp}/orders`, { query: { start_time: iso(start), end_time: iso(end), page, page_size: PAGE } })) || {};
      const list = r.orders || [];
      for (const o of list) if (!seen.has(o.order_id)) { seen.add(o.order_id); out.push(norm(o)); }
      if (list.length < PAGE || page >= num(r.total_pages, Infinity)) break;
    }
    return out;
  }

  // ---------- ürünler (katalog) ----------
  async function fetchListings() {
    const out = [];
    for (let page = 1; page <= 400; page++) {
      const r = (await call(`${vp}/catalog`, { query: { page, page_size: PAGE } })) || {};
      const list = r.products || [];
      for (const p of list) {
        if (!p.sku) continue;
        const images = imageList(p.images), price = num(p.price);
        // Katalog servisi stok miktarı döndürmez: stok null (panel kendi stoğunu gönderir)
        out.push({ remoteId: str(p.sku), remoteProductId: str(p.remote_product_id), sku: str(p.sku), barcode: str([].concat(p.barcodes || [])[0]), name: str(p.title), groupName: str(p.title), variantName: '',
          image: images[0] || '', images, price, listPrice: price, stock: null, active: p.active !== false });
      }
      if (list.length < PAGE || page >= num(r.total_pages, Infinity)) break;
    }
    return out;
  }
  // PUT catalog: sku zorunlu, price / active / quantity'den en az biri; asenkron (job_id). Büyük partiler tek istekte daha verimli (servis notu)
  async function editProducts(products) {
    const jobs = [];
    for (const part of chunk(products, 5000)) {
      const r = (await call(`${vp}/catalog`, { method: 'PUT', body: { products: part } })) || {};
      if (r.job_id) jobs.push(r.job_id);
    }
    return { jobs };
  }
  const skuOf = (x) => str(x.remoteId || x.sku);
  const pushStock = (items) => editProducts(items.filter(skuOf).map((x) => ({ sku: skuOf(x), quantity: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = async (items) => {
    const bad = items.filter((x) => !(num(x.price) > 0)).map(skuOf);
    if (bad.length) throw new Error(`Yemeksepeti: ${bad.length} üründe satış fiyatı yok (${bad.slice(0, 5).join(', ')})`);
    return editProducts(items.filter(skuOf).map((x) => ({ sku: skuOf(x), price: Math.round(num(x.price) * 100) / 100 })));
  };

  // ---------- sipariş işlemleri ----------
  const orderPath = (id) => `${cv}/orders/${encodeURIComponent(id)}`;
  // Hazır: kalemler güncel sipariş detayından (_id, fiyatlama türü, adet/ağırlık) kurulur; panelde iptal edilen satır NOT_FOUND
  async function ship(order) {
    const id = str(order.remote_id);
    const o = (await call(orderPath(id))) || {};
    if (o.status === 'CANCELLED') throw new Error('Yemeksepeti: sipariş iptal edilmiş');
    if (o.status === 'READY_FOR_PICKUP' || o.status === 'DISPATCHED' || o.status === 'DELIVERED') return {};
    const deadLocal = new Set((order.items || []).filter((i) => DEAD_LINE(i.status)).map((i) => str(i.line_id)));
    const items = (o.items || []).filter((it) => str(it.status) !== 'REPLACED').map((it) => {
      const p = { ...(it.original_pricing || {}), ...(it.status !== 'NOT_PROCESSED' ? it.pricing || {} : {}) };
      const kg = str(p.pricing_type).toUpperCase() === 'KG';
      const gone = deadLocal.has(str(it._id)) || str(it.status) === 'NOT_FOUND';
      const pricing = { pricing_type: kg ? 'KG' : 'UNIT', unit_price: num(p.unit_price) };
      if (kg) pricing.weight = num(p.weight); else pricing.quantity = num(p.quantity, 1);
      return { _id: str(it._id), sku: str(it.sku), status: gone ? 'NOT_FOUND' : 'IN_CART', pricing };
    });
    if (!items.some((i) => i.status === 'IN_CART')) throw new Error('Yemeksepeti: gönderilecek ürün kalmadı; siparişi Yemeksepeti panelinden iptal edin');
    const status = o.transport_type === 'VENDOR_DELIVERY' ? 'DISPATCHED' : 'READY_FOR_PICKUP';
    await call(orderPath(id), { method: 'PUT', body: { order_id: id, status, items } });
    return { tracking: '' };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Erişim belirteci (OAuth)', async () => { await token(true); return { detail: `belirteç alındı · adres ${base}` }; });
    await diagStep(out, 'Mağaza durumu', async () => { const r = (await call(`${vp}/status`)) || {}; return { detail: `mağaza ${r.vendor_id || vendor} · ${r.status || '?'}${r.closed_reason ? ' · ' + r.closed_reason : ''}` }; });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => {
      const r = (await call(`${vp}/orders`, { query: { start_time: iso(now - D), end_time: iso(now), page: 1, page_size: 1 } })) || {}, o = (r.orders || [])[0];
      return { detail: `${r.total_pages != null ? `${r.total_pages} sayfa` : `${(r.orders || []).length} sipariş`}${o ? ` · örnek durum: ${o.status} → ${STATUS[o.status] || 'new'} · ${o.transport_type || ''}` : ''}` };
    });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = (await call(orderPath(orderId))) || {}; return { detail: `durum ${o.status || '?'} · ${o.transport_type || '-'} · ${(o.items || []).length} kalem` }; });
    await diagStep(out, 'Katalog', async () => { const r = (await call(`${vp}/catalog`, { query: { page: 1, page_size: 1 } })) || {}; return { detail: `${r.total_pages != null ? r.total_pages + ' ürün (sayfa başı 1)' : (r.products || []).length + ' ürün'}` }; });
    return out;
  }

  const missing = ['YEMEKSEPETI_CLIENT_ID', 'YEMEKSEPETI_CLIENT_SECRET', 'YEMEKSEPETI_CHAIN_ID', 'YEMEKSEPETI_VENDOR_ID'].filter((k) => !env[k]);
  return {
    ...meta, type: 'yemeksepeti', enabled: !missing.length, missing,
    // courier: 'platform' → kargo platformun kuryesiyle (takip no / etiket yok); "Kargoya ver" = hazır (READY_FOR_PICKUP / DISPATCHED)
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: false, courier: 'platform' },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
