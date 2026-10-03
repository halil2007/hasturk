// idefix pazaryeri (merchantapi.idefix.com). Satıcı paneli → Hesap Bilgileri → Entegrasyon Bilgileri: API Key, API Secret, Vendor ID.
// Kimlik: X-API-KEY = base64(apiKey:apiSecret). Siparişler: /oms/{vendorId}/list · Ürün/stok/fiyat: /pim/...
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür (beta: canlı hesapla doğrulanmalı).
import { http, num, str, chunk, diagStep } from '../util.js';

const BASE = 'https://merchantapi.idefix.com';
// idefix durumları "shipment_" önekiyle gelir (shipment_created, shipment_picking, shipment_in_cargo, shipment_delivered…)
const STATUS = {
  created: 'new', approved: 'new', awaiting: 'new', split: 'new',
  picking: 'processing', ready: 'processing', ready_to_ship: 'processing', invoiced: 'processing',
  in_cargo: 'shipped', shipped: 'shipped', undeliver: 'shipped', undelivered: 'shipped', at_collection_point: 'shipped',
  delivered: 'delivered', cancelled: 'cancelled', canceled: 'cancelled', unsupplied: 'cancelled', un_supplied: 'cancelled', returned: 'returned', refunded: 'returned',
};
export const idefixStatus = (s) => STATUS[String(s || '').trim().toLowerCase().replace(/-/g, '_').replace(/^shipment_/, '')] || 'new';

export function idefix(env, meta) {
  const key = env.IDEFIX_API_KEY, secret = env.IDEFIX_API_SECRET, vendor = env.IDEFIX_VENDOR_ID;
  const headers = () => ({ 'X-API-KEY': btoa(`${key}:${secret}`), 'Content-Type': 'application/json', Accept: 'application/json' });
  const call = (path, opts = {}) => http(BASE + path, { ...opts, headers: headers(), body: opts.body && JSON.stringify(opts.body) });
  const list = (r) => (Array.isArray(r) ? r : (r && (r.items || r.data || r.content || r.products)) || []);
  // Tarih biçimi: yyyy/MM/dd HH:mm:ss (Türkiye saati)
  const fmt = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');

  function norm(s) {
    const a = s.shippingAddress || {}, st = idefixStatus(s.status);
    const items = (s.items || []).map((it) => {
      const qty = num(it.quantity, 1), total = num(it.discountedTotalPrice) || num(it.price ?? it.productPrice) * qty;
      return { lineId: str(it.id || it.orderLineId), sku: str(it.merchantSku || it.erpId), barcode: str(it.barcode), name: str(it.productName || it.title), image: str(it.image || it.productImage), quantity: qty, unitPrice: qty ? total / qty : total, total,
        status: st === 'cancelled' ? 'cancelled' : '', remoteKey: str(it.barcode) };
    });
    return {
      remoteId: str(s.id), orderNumber: str(s.orderNumber || s.id), orderedAt: Date.parse(s.orderDate || s.createdAt) || Date.now(), remoteStatus: str(s.status), status: st,
      customer: str(s.customerContactName || a.fullName), phone: str(a.phone), email: '',
      address: { name: str(a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ')), line: str(a.address1 || a.address), district: str(a.county || a.district), city: str(a.city), phone: str(a.phone) },
      total: items.reduce((x, i) => x + (i.status ? 0 : i.total), 0), currency: 'TRY',
      cargoCompany: str(s.cargoCompany || s.cargoProfileName), tracking: str(s.cargoTrackingNumber || s.cargoKey), trackingUrl: str(s.cargoTrackingUrl || s.trackingUrl),
      shipBy: Date.parse(s.lastShipmentDate || s.estimatedDeliveryDate || '') || null, items,
      packages: [{ remoteId: str(s.id), items: items.map((i) => ({ line_id: i.lineId, qty: i.quantity })), status: ['shipped', 'delivered'].includes(st) ? 'shipped' : 'open', remoteStatus: str(s.status), cargoCompany: str(s.cargoCompany), tracking: str(s.cargoTrackingNumber || s.cargoKey), trackingUrl: str(s.cargoTrackingUrl || s.trackingUrl), packed: st !== 'new' }],
    };
  }

  async function fetchOrders(since, until) {
    const out = [];
    for (let page = 1; page <= 50; page++) {
      const r = await call(`/oms/${vendor}/list?page=${page}&limit=100&startDate=${encodeURIComponent(fmt(since))}&endDate=${encodeURIComponent(fmt(until))}&sortByField=createAt&sortDirection=desc`);
      const rows = list(r);
      out.push(...rows.map(norm));
      if (rows.length < 100) break;
    }
    return out;
  }

  async function fetchListings() {
    const out = [];
    for (let page = 1; page <= 400; page++) {
      const rows = list(await call(`/pim/pool/${vendor}/list?page=${page}&limit=100`));
      for (const p of rows) {
        const img = (p.images || p.imageUrls || [])[0];
        out.push({ remoteId: str(p.barcode), remoteProductId: str(p.productMainId), sku: str(p.vendorStockCode || p.erpId), barcode: str(p.barcode), name: str(p.title), groupName: str(p.title), variantName: '',
          image: str(typeof img === 'string' ? img : img && (img.url || img.imageUrl)), price: num(p.price), listPrice: num(p.comparePrice) || num(p.price), stock: num(p.inventoryQuantity ?? p.quantity),
          active: !/reject|archive|passive/i.test(str(p.status)), brand: str(p.brandName) });
      }
      if (rows.length < 100) break;
    }
    return out;
  }

  const upload = (items) => call(`/pim/catalog/${vendor}/inventory-upload`, { method: 'POST', body: { items } });
  async function pushStock(items) { for (const part of chunk(items, 1000)) await upload(part.map((x) => ({ barcode: x.remoteId, inventoryQuantity: x.stock }))); }
  async function pushPrice(items) { for (const part of chunk(items, 1000)) await upload(part.map((x) => ({ barcode: x.remoteId, price: x.price, comparePrice: Math.max(x.listPrice || 0, x.price) }))); }

  // İşleme al: "picking" (müşteri artık iptal edemez)
  async function accept(order) {
    for (const p of order.packages.filter((x) => x.remote_id && x.status === 'open')) await call(`/oms/${vendor}/${p.remote_id}/update-shipment-status`, { method: 'POST', body: { status: 'picking' } });
  }
  // Kendi kargo anlaşmasıyla gönderimde takip no bildirilir (paket "kargoda" olur)
  async function ship(order, pkg, { tracking }) {
    if (!pkg.remote_id || !tracking) return {};
    await call(`/oms/${vendor}/${pkg.remote_id}/update-tracking-number`, { method: 'POST', body: { trackingNumber: tracking, trackingUrl: '' } });
    return {};
  }

  // Tanılama: ürün ve sipariş servisleri ayrı ayrı denenir; HTTP hatası açıklanır (401 anahtar, 403 yetki/IP, 404 satıcı no)
  async function diagnose() {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik ve ürün servisi', async () => { const r = await call(`/pim/pool/${vendor}/list?page=1&limit=1`); return { detail: `erişildi · satıcı (vendor) ${vendor} · ${list(r).length ? 'ürün örneği alındı' : 'ürün yok'}` }; });
    await diagStep(out, 'Sipariş servisi (son 24 saat)', async () => { const r = await call(`/oms/${vendor}/list?page=1&limit=1&startDate=${encodeURIComponent(fmt(now - 864e5))}&endDate=${encodeURIComponent(fmt(now))}`); const rows = list(r); return { detail: `erişildi · ${r && (r.totalCount ?? r.total ?? r.totalElements) != null ? (r.totalCount ?? r.total ?? r.totalElements) + ' sipariş' : rows.length + ' sipariş örneği'}${rows[0] ? ` · örnek durum: ${rows[0].status} → ${idefixStatus(rows[0].status)}` : ''}` }; });
    return out;
  }

  const missing = ['IDEFIX_API_KEY', 'IDEFIX_API_SECRET', 'IDEFIX_VENDOR_ID'].filter((k) => !env[k]);
  return {
    ...meta, type: 'idefix', beta: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose,
  };
}
