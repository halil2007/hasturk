// Pazarama (isortagimapi.pazarama.com). İş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri: API Key (Client ID), API Secret.
// Kimlik: client_credentials belirteci (isortagimgiris.pazarama.com/connect/token, kapsam merchantgatewayapi.fullaccess).
// Cevaplar { data, success, message } ile sarılıdır. Sipariş durumu satır (orderItemStatus) düzeyinde okunur.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, basic, num, str, chunk } from '../util.js';

const API = 'https://isortagimapi.pazarama.com';
// Satır durum kodları: 3 alındı, 12 hazırlanıyor, 5 kargoya verildi, 11 teslim, 6/13 iptal, 7/8/10/14/15 iade süreci
const ITEM = (c) => ({ 3: 'new', 12: 'processing', 5: 'shipped', 11: 'delivered', 6: 'cancelled', 13: 'cancelled', 7: 'returned', 8: 'returned', 10: 'returned', 14: 'returned', 15: 'returned' })[Number(c)] || 'new';
const RANKS = ['new', 'processing', 'shipped', 'delivered'];
const val = (v) => (v && typeof v === 'object' ? num(v.value ?? v.amount) : num(v));

export function pazarama(env, meta) {
  const id = env.PAZARAMA_CLIENT_ID, secret = env.PAZARAMA_CLIENT_SECRET;
  let token = null, exp = 0;
  async function auth() {
    if (token && Date.now() < exp) return token;
    const r = await http('https://isortagimgiris.pazarama.com/connect/token', {
      method: 'POST', headers: { Authorization: basic(id, secret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=merchantgatewayapi.fullaccess',
    });
    const d = (r && r.data) || r || {};
    token = d.accessToken || d.access_token;
    if (!token) throw new Error('Pazarama belirteci alınamadı');
    exp = Date.now() + Math.max(60, num(d.expiresIn || d.expires_in, 3600) - 120) * 1000;
    return token;
  }
  const call = async (path, opts = {}) => {
    const r = await http(API + path, { ...opts, headers: { Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
    if (r && r.success === false) throw new Error('Pazarama: ' + (r.userMessage || r.message || 'işlem başarısız'));
    return r;
  };
  const day = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);

  function norm(o) {
    const a = o.shipmentAddress || {};
    const items = (o.items || []).map((it) => {
      const p = it.product || {}, qty = num(it.quantity, 1), total = val(it.totalPrice) || val(it.salePrice) * qty;
      return { lineId: str(it.orderItemId), sku: str(p.stockCode), barcode: str(p.barcode || p.code), name: str(p.name), image: str(p.imageUrl), quantity: qty, unitPrice: qty ? total / qty : total, total,
        status: ['cancelled', 'returned'].includes(ITEM(it.orderItemStatus)) ? 'cancelled' : '', remoteKey: str(p.code || p.barcode), _st: ITEM(it.orderItemStatus), cargo: it.cargo || {} };
    });
    const live = items.filter((i) => !['cancelled', 'returned'].includes(i._st));
    const status = !live.length ? (items.some((i) => i._st === 'returned') ? 'returned' : 'cancelled') : RANKS[Math.min(...live.map((i) => Math.max(0, RANKS.indexOf(i._st))))];
    const cg = (items.find((i) => i.cargo.trackingNumber) || { cargo: {} }).cargo;
    for (const i of items) { delete i._st; delete i.cargo; }
    return {
      remoteId: str(o.orderNumber || o.orderId), orderNumber: str(o.orderNumber || o.orderId), orderedAt: Date.parse(o.orderDate) || Date.now(), remoteStatus: status, status,
      customer: str(o.customerName || a.nameSurname), phone: str(a.phoneNumber), email: str(o.customerEmail), customerId: str(o.customerId),
      address: { name: str(a.nameSurname || o.customerName), line: str(a.addressDetail || a.displayAddressText), district: str(a.districtName), city: str(a.cityName), phone: str(a.phoneNumber) },
      total: val(o.orderAmount) || live.reduce((s, i) => s + i.total, 0), currency: 'TRY', cargoCompany: str(cg.companyName), tracking: str(cg.trackingNumber),
      items, packages: null,
    };
  }

  async function fetchOrders(since, until) {
    const out = [], W = 30 * 864e5;
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 1; page <= 50; page++) {
        const r = await call('/order/getOrdersForApi', { method: 'POST', body: { pageSize: 100, pageNumber: page, startDate: day(from), endDate: day(to) } });
        const rows = (r && r.data) || [];
        out.push(...rows.map(norm));
        if (rows.length < 100) break;
      }
    }
    return out;
  }

  async function fetchListings() {
    const out = [];
    for (let page = 1; page <= 400; page++) {
      const rows = ((await call(`/product/products?Approved=true&Page=${page}&Size=250`)) || {}).data || [];
      for (const p of rows) {
        out.push({ remoteId: str(p.code), remoteProductId: str(p.code), sku: str(p.stockCode), barcode: str(p.code), name: str(p.displayName || p.name), groupName: str(p.name), variantName: '',
          image: str(((p.images || [])[0] || {}).imageUrl), price: num(p.salePrice), listPrice: num(p.listPrice) || num(p.salePrice), stock: num(p.stockCount), active: true });
      }
      if (rows.length < 250) break;
    }
    return out;
  }

  async function pushStock(items) { for (const part of chunk(items, 1000)) await call('/product/updateStock-v2', { method: 'POST', body: { items: part.map((x) => ({ code: x.remoteId, stockCount: x.stock })) } }); }
  async function pushPrice(items) { for (const part of chunk(items, 1000)) await call('/product/updatePrice-v2', { method: 'POST', body: { items: part.map((x) => ({ code: x.remoteId, listPrice: Math.max(x.listPrice || 0, x.price), salePrice: x.price })) } }); }
  // İşleme al: siparişi "Hazırlanıyor" (12) yap
  async function accept(order) { await call('/order/updateOrderStatusList', { method: 'PUT', body: { orderNumber: Number(order.remote_id) || order.remote_id, status: 12 } }); }

  // ---------- müşteri soruları: QuestionAnswer/getApprovalAnswersByMerchantSearch (sayfa 1'den), cevap: QuestionAnswer/sellerAnswer ----------
  async function questions({ since, until = Date.now(), page = 0, size = 50 }) {
    const r = await call('/QuestionAnswer/getApprovalAnswersByMerchantSearch', { method: 'POST', body: { questionStartDate: new Date(since).toISOString(), questionEndDate: new Date(until).toISOString(), pageIndex: page + 1, pageSize: size } });
    const d = r.data || {}, list = d.approvalAnswersByMerchantSearchs || d.items || (Array.isArray(d) ? d : []);
    const items = list.map((x) => ({
      remoteId: String(x.questionId || x.id), text: str(x.question), askedAt: Date.parse(x.questionDate) || Date.now(),
      status: x.answer || Number(x.questionStatus) === 1 ? 'answered' : 'waiting', remoteStatus: String(x.questionStatus ?? ''),
      productName: str(x.productName), productImage: str(x.productImageUrl), barcode: str(x.barcode), customer: str(x.maskedUserName), answer: x.answer ? str(x.answer) : null,
    }));
    return { items, hasNext: items.length >= size, total: num(d.totalCount) || items.length };
  }
  async function answer(q, text) { await call('/QuestionAnswer/sellerAnswer', { method: 'PUT', body: { questionId: q.remote_id, text } }); }

  const missing = ['PAZARAMA_CLIENT_ID', 'PAZARAMA_CLIENT_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'pazarama', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'local', label: null, createProduct: false, price: true, answer: { min: 2, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, questions, answer,
  };
}
