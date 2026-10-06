// Koçtaş pazaryeri (Mirakl Marketplace Platform). Satıcı paneli → sağ üst kullanıcı menüsü → API Anahtarı; adres panelin kök adresi (ör. https://koctas-prod.mirakl.net).
// Kimlik: her istekte "Authorization: <anahtar>" (Bearer yok). Birden çok mağazalı hesapta her isteğe shop_id eklenir.
// Siparişler OR11 (son güncellenme tarihine göre; geçmiş aktarımda oluşturulma tarihine göre), işleme al OR21 (satırları kabul),
// kargo OR23 (takip no) + OR24 (kargoya verildi). Teklifler (ilanlar) OF21; stok / fiyat OF24 (asenkron, import_id döner).
// OF24 teklifi bütün olarak yazar (gönderilmeyen alanlar sıfırlanır): bu yüzden önce teklifin güncel hali OF21'den okunur ve korunarak gönderilir.
// Kargo satıcının kendi anlaşmasıyla: takip no panelden girilir. Soru-cevap (M11), iade, ürün yükleme (P41) yok.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, imageList, diagStep, pool } from '../util.js';

const STATUS = { WAITING_ACCEPTANCE: 'new', WAITING_DEBIT: 'new', WAITING_DEBIT_PAYMENT: 'new', STAGING: 'new', SHIPPING: 'processing', SHIPPED: 'shipped', TO_COLLECT: 'shipped',
  RECEIVED: 'delivered', CLOSED: 'delivered', REFUSED: 'cancelled', CANCELED: 'cancelled', CANCELLED: 'cancelled', REFUNDED: 'returned' };
const DEAD = ['REFUSED', 'CANCELED', 'CANCELLED'];
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const EAN = /^(EAN|EAN13|GTIN|BARCODE|BARKOD)$/i;

export function koctas(env, meta) {
  // Kök adres: sondaki "/", "/api" ya da panel yolu (/mmp/...) atılır
  const base = str(env.KOCTAS_URL).replace(/\/+$/, '').replace(/\/(api|mmp)(\/.*)?$/i, '');
  const shop = str(env.KOCTAS_SHOP_ID);
  const url = (path, q = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v != null && v !== '') p.set(k, v);
    if (shop) p.set('shop_id', shop);
    const s = p.toString();
    return `${base}/api${path}${s ? '?' + s : ''}`;
  };
  const call = (path, q, opts = {}) => http(url(path, q), { ...opts, headers: { Authorization: env.KOCTAS_API_KEY, Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }, body: opts.body && JSON.stringify(opts.body) });

  function norm(o) {
    const c = o.customer || {}, a = c.shipping_address || {};
    const name = [a.firstname || c.firstname, a.lastname || c.lastname].filter(Boolean).join(' ');
    const items = (o.order_lines || []).map((l) => {
      const qty = num(l.quantity, 1) || 1, total = num(l.price) || num(l.price_unit) * qty;
      const media = (l.product_medias || []).find((m) => /small|medium/i.test(m.type || '')) || (l.product_medias || [])[0] || {};
      return { lineId: str(l.order_line_id), sku: str(l.offer_sku), barcode: '', name: str(l.product_title), image: str(media.media_url), quantity: qty,
        unitPrice: num(l.price_unit) || total / qty, total, status: DEAD.includes(l.order_line_state) ? 'cancelled' : '', remoteKey: str(l.offer_sku) };
    });
    return {
      remoteId: str(o.order_id), orderNumber: str(o.commercial_id || o.order_id), orderedAt: Date.parse(o.created_date) || Date.now(), remoteStatus: str(o.order_state), status: STATUS[o.order_state] || 'new',
      customer: [c.firstname, c.lastname].filter(Boolean).join(' ') || name, phone: str(a.phone || a.phone_secondary), email: str(o.customer_notification_email), customerId: str(c.customer_id),
      address: { name: name || [c.firstname, c.lastname].filter(Boolean).join(' '), line: [a.street_1, a.street_2, a.zip_code].map(str).filter(Boolean).join(' '),
        district: a.state && a.state !== a.city ? str(a.state) : '', city: str(a.city), phone: str(a.phone || a.phone_secondary) },
      total: num(o.total_price) || items.filter((i) => !i.status).reduce((s, i) => s + i.total, 0) + num(o.shipping_price), currency: str(o.currency_iso_code) || 'TRY',
      cargoCompany: str(o.shipping_company), tracking: str(o.shipping_tracking), shipBy: Date.parse(o.shipping_deadline) || null, items, packages: null,
    };
  }

  // byOrdered: geçmiş aktarımda oluşturulma tarihine göre; normal senkronda son güncellenme tarihine göre (durum değişiklikleri kaçmaz)
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const out = [], [s, e] = byOrdered ? ['start_date', 'end_date'] : ['start_update_date', 'end_update_date'];
    for (let page = 0; page < 50; page++) {
      const r = (await call('/orders', { [s]: iso(since), [e]: iso(until), paginate: 'true', max: 100, offset: page * 100 })) || {};
      const list = r.orders || [];
      out.push(...list.map(norm));
      if (list.length < 100 || (page + 1) * 100 >= num(r.total_count, Infinity)) break;
    }
    return out;
  }

  // ---------- teklifler (OF21) ----------
  // Son okunan teklifler bellekte tutulur: OF24 için fiyat/stok ve diğer alanlar buradan korunur
  const cache = new Map();
  const ref = (o) => str(((o.product_references || []).find((r) => EAN.test(r.reference_type || '')) || {}).reference);
  async function loadOffers(q = {}, maxPages = 400) {
    const out = [];
    for (let page = 0; page < maxPages; page++) {
      const r = (await call('/offers', { ...q, max: 100, offset: page * 100 })) || {};
      const list = r.offers || [];
      for (const o of list) { out.push(o); if (o.shop_sku) cache.set(str(o.shop_sku), o); }
      if (list.length < 100 || (page + 1) * 100 >= num(r.total_count, Infinity)) break;
    }
    return out;
  }
  async function fetchListings() {
    cache.clear();
    return (await loadOffers()).filter((o) => o.shop_sku).map((o) => {
      const price = num(o.price) || num(o.applicable_pricing && o.applicable_pricing.price), d = o.discount || {};
      const images = imageList((o.product_medias || []).map((m) => m.media_url || m.url || m));
      return {
        remoteId: str(o.shop_sku), remoteProductId: str(o.product_sku), sku: str(o.shop_sku), barcode: ref(o), name: str(o.product_title), groupName: str(o.product_title), variantName: '',
        image: images[0] || '', images, price, listPrice: Math.max(num(d.origin_price), num(o.origin_price), price), stock: num(o.quantity),
        active: o.active !== false && !o.deleted,
      };
    });
  }
  // Önbellekte olmayan teklifler: azsa tek tek (OF21 sku süzgeci), çoksa tüm liste yeniden okunur
  async function offersFor(skus) {
    const lack = skus.filter((k) => !cache.has(k));
    if (lack.length > 20) await loadOffers();
    else await pool(lack, 4, async (k) => { await loadOffers({ sku: k }, 1); });
    return skus.map((k) => cache.get(k) || null);
  }
  // OF24 satırı: ürün kimliği önce Mirakl ürün SKU'su (SKU), yoksa EAN barkodu; teklifin mevcut alanları korunur
  function row(o, x, { price, discount, quantity }) {
    const pid = str(o && o.product_sku) || str(x.remoteProductId), ean = (o && ref(o)) || str(x.barcode);
    if (!pid && !ean) throw new Error(`Koçtaş: ${x.remoteId} teklifinin ürün kimliği (ürün SKU / EAN) bulunamadı`);
    const r = { shop_sku: str(x.remoteId || x.sku), product_id: pid || ean, product_id_type: pid ? 'SKU' : 'EAN', price, quantity, state_code: str(o && o.state_code) || '11', update_delete: 'update' };
    if (discount) r.discount = discount;
    if (o) {
      for (const k of ['description', 'internal_description', 'leadtime_to_ship', 'min_quantity_alert']) if (o[k] != null && o[k] !== '') r[k] = o[k];
      if (o.logistic_class) r.logistic_class = typeof o.logistic_class === 'object' ? o.logistic_class.code : o.logistic_class;
      if ((o.offer_additional_fields || []).length) r.offer_additional_fields = o.offer_additional_fields.map((f) => ({ code: f.code, value: f.value }));
    }
    return r;
  }
  const oldDiscount = (o) => { const d = (o && o.discount) || {}; return num(d.discount_price) > 0 ? { price: num(d.discount_price), start_date: d.start_date || undefined, end_date: d.end_date || undefined } : null; };
  const basePrice = (o) => { const d = (o && o.discount) || {}; return num(d.origin_price) || num(o && o.origin_price) || num(o && o.price); };
  // Bulunamayan teklifler atlanır, diğerleri gönderilir ve sonra hata verilir. Gönderilen değerler önbelleğe yazılır (sonraki gönderim güncel değeri kullanır).
  async function send(items, build, patch) {
    const offers = await offersFor(items.map((x) => str(x.remoteId || x.sku))), rows = [], bad = [];
    items.forEach((x, i) => { const o = offers[i]; if (o && basePrice(o) > 0) rows.push(build(o, x)); else bad.push(str(x.remoteId || x.sku)); });
    for (const part of chunk(rows, 100)) await call('/offers', {}, { method: 'POST', body: { offers: part } });
    for (const r of rows) { const o = cache.get(r.shop_sku); if (o) Object.assign(o, patch(r)); }
    if (bad.length) throw new Error(`Koçtaş: ${bad.length} teklif bulunamadı ya da fiyatı yok (${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''})`);
  }
  // Stok: teklifin güncel fiyatı ve indirimi korunur
  const pushStock = (items) => send(items, (o, x) => row(o, x, { price: basePrice(o), discount: oldDiscount(o), quantity: Math.max(0, Math.round(num(x.stock))) }), (r) => ({ quantity: r.quantity }));
  // Fiyat: liste fiyatı satış fiyatından büyükse teklif fiyatı = liste fiyatı, satış fiyatı indirim (süresiz) olarak gönderilir; stok korunur
  const pushPrice = (items) => send(items, (o, x) => {
    const sale = num(x.price), list = Math.max(num(x.listPrice), sale);
    return row(o, x, { price: list, discount: list > sale ? { price: sale } : null, quantity: num(o.quantity) });
  }, (r) => ({ price: r.discount ? r.discount.price : r.price, origin_price: r.price, discount: r.discount ? { origin_price: r.price, discount_price: r.discount.price } : null }));

  // ---------- sipariş işlemleri ----------
  // İşleme al (OR21): kabul bekleyen siparişin iptal olmayan satırları kabul edilir
  async function accept(order) {
    if (order.remote_status && order.remote_status !== 'WAITING_ACCEPTANCE') return;
    const lines = (order.items || []).filter((i) => i.status !== 'cancelled' && i.line_id).map((i) => ({ accepted: true, id: String(i.line_id) }));
    if (lines.length) await call(`/orders/${encodeURIComponent(order.remote_id)}/accept`, {}, { method: 'PUT', body: { order_lines: lines } });
  }
  // Kargo firması Mirakl taşıyıcı listesinden (SH21) adla eşlenir; bulunamazsa ad olarak gönderilir
  let carriers = null;
  const fold = (s) => str(s).toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => 'cgiosu'['çğıöşü'.indexOf(c)]).replace(/kargo|cargo|express|lojistik|a\.s\.?|[^a-z0-9]/g, '');
  async function carrierOf(name) {
    if (!name) return null;
    if (!carriers) carriers = await call('/shipping/carriers').then((r) => (r && r.carriers) || [], () => []);
    const k = fold(name);
    return k ? carriers.find((c) => fold(c.label) === k || fold(c.code) === k || (fold(c.label) && (fold(c.label).includes(k) || k.includes(fold(c.label))))) || null : null;
  }
  // Mirakl'da kargoya verme sipariş düzeyindedir: siparişin başka paketi zaten gönderildiyse tekrar çağrılmaz
  async function ship(order, pkg, { cargoCompany, tracking } = {}) {
    if ((order.packages || []).some((p) => p !== pkg && p.id !== pkg.id && p.status === 'shipped')) return {};
    const id = encodeURIComponent(order.remote_id), tn = str(tracking || pkg.tracking);
    if (tn) {
      const firm = str(cargoCompany || pkg.cargo_company || order.cargo_company), c = await carrierOf(firm);
      if (!c && !firm) throw new Error('Koçtaş: takip numarası için kargo firması seçin');
      await call(`/orders/${id}/tracking`, {}, { method: 'PUT', body: c ? { carrier_code: c.code, tracking_number: tn } : { carrier_name: firm, tracking_number: tn } });
    }
    await call(`/orders/${id}/ship`, {}, { method: 'PUT' });
    return { tracking: tn };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Hesap (A01)', async () => { const r = (await call('/account')) || {}; return { detail: `${str(r.shop_name) || 'mağaza'} · mağaza ID ${r.shop_id ?? '?'}${r.shop_state ? ' · durum ' + r.shop_state : ''} · adres ${base}` }; });
    await diagStep(out, 'Siparişler (son 24 saat, OR11)', async () => {
      const r = (await call('/orders', { start_update_date: iso(now - 864e5), end_update_date: iso(now), paginate: 'true', max: 1 })) || {}, o = (r.orders || [])[0];
      return { detail: `${r.total_count ?? (r.orders || []).length} sipariş${o ? ` · örnek durum: ${o.order_state} → ${STATUS[o.order_state] || 'new'}` : ''}` };
    });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = (((await call('/orders', { order_ids: orderId })) || {}).orders || [])[0]; if (!o) throw new Error('Sipariş bulunamadı'); return { detail: `durum ${o.order_state} · kargo ${o.shipping_company || '-'} ${o.shipping_tracking || ''}`.trim() }; });
    await diagStep(out, 'Teklifler (OF21)', async () => { const r = (await call('/offers', { max: 1 })) || {}; return { detail: `${r.total_count ?? (r.offers || []).length} teklif` }; });
    return out;
  }

  const missing = ['KOCTAS_URL', 'KOCTAS_API_KEY'].filter((k) => !env[k]);
  return {
    ...meta, type: 'koctas', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose,
  };
}
