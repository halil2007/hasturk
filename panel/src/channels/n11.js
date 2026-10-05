// N11 (yeni REST API, api.n11.com). Satıcı Ofisi → Hesabım → API Hesapları: appkey + appsecret (her istekte başlıkta).
// Siparişler paket (shipmentPackage) düzeyinde gelir, aynı sipariş numarasındakiler birleştirilir. En fazla 15 günlük aralık.
// Kargo: N11 anlaşmalı kargo; durum kargo okutunca kendiliğinden "Shipped" olur (API'de kargoya verme / etiket servisi yok).
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk } from '../util.js';

const BASE = 'https://api.n11.com';
const STATUS = { Created: 'new', Picking: 'processing', UnPacked: 'processing', Shipped: 'shipped', Delivered: 'delivered', Cancelled: 'cancelled', UnSupplied: 'cancelled', Returned: 'returned' };
const RANKS = ['new', 'processing', 'shipped', 'delivered'];

export function n11(env, meta) {
  const key = env.N11_APP_KEY, secret = env.N11_APP_SECRET;
  const call = (path, opts = {}) => http(BASE + path, { ...opts, headers: { appkey: key, appsecret: secret, 'Content-Type': 'application/json', Accept: 'application/json' }, body: opts.body && JSON.stringify(opts.body) });

  function group(pkgs) {
    const by = new Map();
    for (const p of pkgs) { const k = String(p.orderNumber); by.set(k, [...(by.get(k) || []), p]); }
    return [...by.values()].map((list) => {
      const p0 = list[0], a = p0.shippingAddress || {};
      const items = [];
      for (const p of list) for (const l of p.lines || []) {
        if (items.some((i) => i.lineId === String(l.orderLineId))) continue;
        const qty = num(l.quantity, 1), unit = num(l.price);
        items.push({ lineId: String(l.orderLineId), sku: str(l.stockCode), barcode: str(l.barcode), name: str(l.productName), image: '', quantity: qty, unitPrice: unit, total: num(l.dueAmount) || unit * qty,
          status: STATUS[p.shipmentPackageStatus] === 'cancelled' ? 'cancelled' : '', remoteKey: str(l.stockCode) });
      }
      const live = list.filter((p) => !['cancelled', 'returned'].includes(STATUS[p.shipmentPackageStatus]));
      const status = !live.length ? (list.some((p) => STATUS[p.shipmentPackageStatus] === 'returned') ? 'returned' : 'cancelled')
        : RANKS[Math.min(...live.map((p) => Math.max(0, RANKS.indexOf(STATUS[p.shipmentPackageStatus] || 'new'))))];
      const hist = list.flatMap((p) => (p.packageHistories || []).map((h) => num(h.createdDate))).filter(Boolean);
      const tracked = list.find((p) => p.cargoTrackingNumber) || {};
      return {
        remoteId: String(p0.orderNumber), orderNumber: String(p0.orderNumber), orderedAt: hist.length ? Math.min(...hist) : num(p0.lastModifiedDate) || Date.now(),
        remoteStatus: list.map((p) => p.shipmentPackageStatus).join(', '), status,
        customer: str(p0.customerfullName || a.fullName), phone: str(a.gsm), email: str(p0.customerEmail), customerId: str(p0.customerId || p0.buyerId),
        address: { name: str(a.fullName || p0.customerfullName), line: str(a.address), district: str(a.district), city: str(a.city), phone: str(a.gsm) },
        total: list.reduce((s, p) => s + num(p.totalAmount), 0), currency: 'TRY',
        cargoCompany: str(tracked.cargoProviderName), tracking: str(tracked.cargoTrackingNumber),
        shipBy: Math.min(...live.map((p) => num(p.agreedDeliveryDate)).filter((x) => x > 0)) || null,
        items,
        packages: list.filter((p) => STATUS[p.shipmentPackageStatus] !== 'cancelled').map((p) => ({
          remoteId: String(p.id), items: (p.lines || []).map((l) => ({ line_id: String(l.orderLineId), qty: num(l.quantity, 1) })),
          status: ['shipped', 'delivered'].includes(STATUS[p.shipmentPackageStatus]) ? 'shipped' : 'open', remoteStatus: p.shipmentPackageStatus,
          cargoCompany: str(p.cargoProviderName), tracking: str(p.cargoTrackingNumber), barcode: str(p.cargoSenderNumber),
        })),
      };
    });
  }

  async function fetchOrders(since, until) {
    const W = 15 * 864e5 - 60e3, pkgs = [];
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 0; page < 50; page++) {
        const r = await call(`/rest/delivery/v1/shipmentPackages?startDate=${from}&endDate=${to}&page=${page}&size=100`);
        pkgs.push(...(r.content || []));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    }
    return group(pkgs);
  }

  async function fetchListings() {
    const out = [];
    for (let page = 0; page < 400; page++) {
      const r = await call(`/ms/product-query?page=${page}&size=250`);
      for (const p of r.content || []) {
        out.push({ remoteId: str(p.stockCode), remoteProductId: str(p.n11ProductId || p.productMainId), sku: str(p.stockCode), barcode: str(p.barcode), name: str(p.title), groupName: str(p.title), variantName: '',
          image: str((p.imageUrls || [])[0] || ((p.images || [])[0] || {}).url), price: num(p.salePrice), listPrice: num(p.listPrice), stock: num(p.quantity), active: p.status !== 'Suspended' });
      }
      if (r.last || page + 1 >= (r.totalPages || 1)) break;
    }
    return out;
  }

  const task = (skus) => call('/ms/product/tasks/price-stock-update', { method: 'POST', body: { payload: { integrator: 'HasturkPanel', skus } } });
  async function pushStock(items) { for (const part of chunk(items, 1000)) await task(part.map((x) => ({ stockCode: x.remoteId, quantity: x.stock }))); }
  async function pushPrice(items) { for (const part of chunk(items, 1000)) await task(part.map((x) => ({ stockCode: x.remoteId, salePrice: x.price, listPrice: Math.max(x.listPrice || 0, x.price), currencyType: 'TL' }))); }

  // İşleme al: "Picking" (yalnızca Created satırlar)
  async function accept(order) {
    const lines = order.items.filter((i) => i.status !== 'cancelled').map((i) => ({ lineId: Number(i.line_id) || i.line_id }));
    if (lines.length) await call('/rest/order/v1/update', { method: 'PUT', body: { lines, status: 'Picking' } });
  }

  // ---------- müşteri soruları (ürün soru-cevap, SOAP: api.n11.com/ws/productService) ----------
  // Liste servisi dakikada bir kez çağrılabilir: her senkronda açık (cevap bekleyen) sorular tek sayfada (100) alınır.
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tag = (x, t) => { const m = new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`).exec(x); return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : ''; };
  const tags = (x, t) => [...x.matchAll(new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`, 'g'))].map((m) => m[1]);
  async function soap(op, inner) {
    const body = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas"><soapenv:Header/><soapenv:Body>`
      + `<sch:${op}Request><auth><appKey>${esc(key)}</appKey><appSecret>${esc(secret)}</appSecret></auth>${inner}</sch:${op}Request></soapenv:Body></soapenv:Envelope>`;
    const res = await fetch(BASE + '/ws/productService/', { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: op }, body });
    const x = await res.text();
    const fault = tag(x, 'faultstring');
    if (!res.ok || fault) throw new Error(`N11 ${op}: HTTP ${res.status} ${fault || x.slice(0, 200)}`);
    if (/^failure$/i.test(tag(tag(x, 'result') || x, 'status'))) throw new Error(`N11 ${op}: ${tag(x, 'errorMessage') || 'başarısız'}`);
    return x;
  }
  const dmy = (ms) => { const d = new Date(ms + 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
  async function questions({ since, until = Date.now(), page = 0 }) {
    if (page > 0) return { items: [], hasNext: false };
    const x = await soap('GetProductQuestionList', `<productQuestionSearch><productId></productId><buyerEmail></buyerEmail><subject></subject><status>OPEN</status><startDate>${dmy(since)}</startDate><endDate>${dmy(until)}</endDate></productQuestionSearch><pagingData><currentPage>0</currentPage><pageSize>100</pageSize></pagingData>`);
    const items = tags(x, 'productQuestion').map((q) => ({
      remoteId: tag(q, 'id'), text: [tag(q, 'questionSubject'), tag(q, 'question')].filter(Boolean).join(' — '), status: tag(q, 'answer') ? 'answered' : 'waiting', remoteStatus: tag(q, 'answer') ? 'CLOSED' : 'OPEN',
      productName: tag(q, 'productTitle'), sku: tag(q, 'productId'), answer: tag(q, 'answer') || null,
    })).filter((q) => q.remoteId);
    return { items, hasNext: false, total: Number(tag(x, 'totalCount')) || items.length };
  }
  async function answer(q, text) {
    await soap('SaveProductAnswer', `<productQuestionId>${esc(q.remote_id)}</productQuestionId><answer>${esc(text)}</answer>`);
  }

  const missing = ['N11_APP_KEY', 'N11_APP_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'n11', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'local', label: null, createProduct: false, price: true, answer: { min: 1, max: 2048 } },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, questions, answer,
  };
}
