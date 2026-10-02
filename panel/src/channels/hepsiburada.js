// Hepsiburada Marketplace API.
// Merchant paneli → Entegrasyon → API bilgileri: Merchant ID ve servis anahtarı (şifre).
//   Siparişler/paketler: oms-external.hepsiburada.com   İlan/stok/fiyat: listing-external.hepsiburada.com
import { http, basic, num, str, chunk } from '../util.js';

export function hepsiburada(env, meta) {
  const m = env.HB_MERCHANT_ID, user = env.HB_USERNAME || m, pass = env.HB_PASSWORD;
  const test = env.HB_TEST === '1' ? '-sit' : '';
  const OMS = `https://oms-external${test}.hepsiburada.com`, LST = `https://listing-external${test}.hepsiburada.com`;
  const headers = () => ({
    Authorization: basic(user, pass),
    'User-Agent': env.HB_USER_AGENT || `${m} - HasTurkPanel`,
    'Content-Type': 'application/json', Accept: 'application/json',
  });
  const call = (url, opts = {}) => http(url, { ...opts, headers: headers(), body: opts.body && JSON.stringify(opts.body) });
  const list = (r) => (Array.isArray(r) ? r : (r && (r.items || r.data || r.listings || r.packages)) || []);
  const money = (v) => (v && typeof v === 'object' ? num(v.amount ?? v.value) : num(v));

  function lineOf(it) {
    const qty = num(it.quantity, 1);
    const total = money(it.totalPrice) || money(it.price) * qty || money(it.unitPrice) * qty;
    return {
      lineId: str(it.lineItemId || it.id), sku: str(it.merchantSku || it.merchantSKU), barcode: str(it.barcode), name: str(it.productName || it.name), image: '',
      quantity: qty, unitPrice: qty ? total / qty : total, total,
      status: /cancel|iptal/i.test(it.status || '') ? 'cancelled' : '', remoteKey: str(it.sku || it.hbSku || it.hepsiburadaSku),
      orderNumber: str(it.orderNumber || it.orderId), orderDate: it.orderDate || it.orderedDate,
      customerName: str(it.customerName || it.recipientName), address: it.shippingAddress || it.deliveryAddress || null,
      cargoCompany: str(it.cargoCompany || it.cargoCompanyName),
    };
  }

  // Açık siparişler (paketlenmeyi bekleyen satırlar) + paketler (kargoya verilmeyi bekleyen / kargoda / teslim) birleştirilir
  async function fetchOrders(since, until) {
    const orders = new Map();
    const touch = (l, status) => {
      if (!l.orderNumber) return null;
      let o = orders.get(l.orderNumber);
      if (!o) {
        const a = l.address || {};
        o = {
          remoteId: l.orderNumber, orderNumber: l.orderNumber, orderedAt: Date.parse(l.orderDate) || Date.now(),
          remoteStatus: status, status, customer: l.customerName || str(a.name), phone: str(a.phoneNumber || a.phone), email: str(a.email),
          address: { name: str(a.name || l.customerName), line: str(a.address || a.addressDetail), district: str(a.district || a.town), city: str(a.city), phone: str(a.phoneNumber || a.phone) },
          total: 0, currency: 'TRY', cargoCompany: l.cargoCompany, tracking: '', items: [], packages: [],
        };
        orders.set(l.orderNumber, o);
      }
      if (!o.items.some((i) => i.lineId === l.lineId)) { o.items.push(l); o.total += l.status ? 0 : l.total; }
      return o;
    };
    const rank = { new: 0, processing: 1, shipped: 2, delivered: 3 };
    const bump = (o, s) => { if (s === 'cancelled') return; if ((rank[s] ?? 0) > (rank[o.status] ?? 0) || o.status === 'cancelled') o.status = s; };

    for (let offset = 0; offset < 5000; offset += 100) {
      const r = await call(`${OMS}/orders/merchantid/${m}?offset=${offset}&limit=100`);
      for (const it of list(r)) { const o = touch(lineOf(it), 'new'); if (o) bump(o, 'new'); }
      if (list(r).length < 100) break;
    }
    // Paket listeleri: uç noktaların bazıları hesapta kapalı olabilir; biri hata verirse diğerleri yine işlenir
    const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
    const range = `begindate=${iso(since)}&enddate=${iso(until)}`;
    const sources = [
      [`${OMS}/packages/merchantid/${m}?`, 'processing'],
      [`${OMS}/packages/merchantid/${m}/shipped?${range}&`, 'shipped'],
      [`${OMS}/packages/merchantid/${m}/delivered?${range}&`, 'delivered'],
      [`${OMS}/orders/merchantid/${m}/cancelled?${range}&`, 'cancelled'],
    ];
    const errors = [];
    for (const [base, status] of sources) {
      // Sayfa sayfa (geçmiş sipariş aktarımında yüzlerce paket olabilir)
      const rows = [];
      try {
        for (let offset = 0; offset < 5000; offset += 100) {
          const r = await call(`${base}offset=${offset}&limit=100`);
          rows.push(...list(r));
          if (list(r).length < 100) break;
        }
      } catch (e) { errors.push(e.message); if (!rows.length) continue; }
      for (const pk of rows) {
        const lines = (pk.items || pk.lineItems || [pk]).map(lineOf);
        const pkgNo = str(pk.packageNumber || pk.packageId);
        let o = null;
        for (const l of lines) { if (!l.orderNumber) l.orderNumber = str(pk.orderNumber); o = touch(l, status) || o; }
        if (!o) continue;
        if (status === 'cancelled') { for (const l of lines) { const it = o.items.find((i) => i.lineId === l.lineId); if (it) it.status = 'cancelled'; } }
        else bump(o, status);
        if (pkgNo && !o.packages.some((p) => p.remoteId === pkgNo)) {
          const tn = str(pk.trackingNumber || pk.trackingInfoCode || pk.barcode);
          o.packages.push({ remoteId: pkgNo, items: lines.map((l) => ({ line_id: l.lineId, qty: l.quantity })), status: status === 'processing' ? 'open' : 'shipped', cargoCompany: str(pk.cargoCompany), tracking: tn, barcode: str(pk.barcode) });
          if (tn && !o.tracking) { o.tracking = tn; o.cargoCompany = str(pk.cargoCompany) || o.cargoCompany; }
        }
      }
    }
    for (const o of orders.values()) {
      if (o.items.length && o.items.every((i) => i.status === 'cancelled')) o.status = 'cancelled';
      for (const i of o.items) { delete i.orderNumber; delete i.orderDate; delete i.customerName; delete i.address; delete i.cargoCompany; }
      if (!o.packages.length) o.packages = null; // paket yoksa paneldeki paket bölmesi korunur
      o.remoteStatus = o.status;
    }
    const out = [...orders.values()];
    if (errors.length) out.warnings = errors;
    return out;
  }

  async function fetchListings() {
    const out = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const r = await call(`${LST}/listings/merchantid/${m}?offset=${offset}&limit=1000`);
      const rows = list(r);
      for (const l of rows) {
        out.push({
          remoteId: str(l.hepsiburadaSku || l.hbSku), remoteProductId: str(l.hepsiburadaSku), sku: str(l.merchantSku), barcode: str(l.barcode || ''), name: str(l.productName || l.merchantSku),
          groupName: str(l.productName || ''), variantName: '',
          image: str(l.imageUrl || l.image || ''), price: money(l.price), listPrice: money(l.price), stock: num(l.availableStock), active: l.isSalable !== false,
        });
      }
      if (rows.length < 1000) break;
    }
    return out;
  }

  async function upload(kind, rows) {
    for (const part of chunk(rows, 4000)) {
      try { await call(`${LST}/listings/merchantid/${m}/${kind}-uploads`, { method: 'POST', body: part }); } catch (e) {
        if (kind === 'stock' && e.status === 404) await call(`${LST}/listings/merchantid/${m}/inventory-uploads`, { method: 'POST', body: part });
        else throw e;
      }
    }
  }
  const pushStock = (items) => upload('stock', items.map((x) => ({ hepsiburadaSku: x.remoteId, merchantSku: x.sku, availableStock: x.stock })));
  const pushPrice = (items) => upload('price', items.map((x) => ({ hepsiburadaSku: x.remoteId, merchantSku: x.sku, price: x.price })));

  // Paketleme: her grup Hepsiburada'da ayrı paket olur (ayrı kargo barkodu)
  async function split(order, groups) {
    const packages = [];
    for (const g of groups) {
      const r = await call(`${OMS}/packages/merchantid/${m}`, {
        method: 'POST',
        body: { lineItemRequests: g.items.map((x) => ({ id: x.line_id, quantity: x.qty })), parcelQuantity: 1, deci: Math.max(1, num(g.desi, 1)) },
      });
      const x = Array.isArray(r) ? r[0] : r;
      packages.push({ remoteId: str(x && (x.packageNumber || x.packageId || x.id)), items: g.items, tracking: str(x && (x.trackingNumber || x.barcode)) });
    }
    return { packages, message: `${packages.length} paket Hepsiburada'da oluşturuldu.` };
  }

  async function label(order, pkg) {
    if (!pkg.remote_id) return null;
    const res = await http(`${OMS}/packages/merchantid/${m}/packagenumber/${encodeURIComponent(pkg.remote_id)}/labels?format=ZPL`, { headers: headers(), raw: true });
    const type = res.headers.get('content-type') || '';
    if (/pdf/i.test(type)) {
      const buf = new Uint8Array(await res.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { format: 'pdf', data: btoa(s), filename: `hepsiburada-${pkg.remote_id}.pdf` };
    }
    const text = await res.text();
    let data = text;
    try {
      const j = JSON.parse(text);
      const pick = (o) => (typeof o === 'string' ? o : o && (o.zpl || o.label || o.data || o.content || (Array.isArray(o) ? o.map(pick).join('\n') : '')));
      data = pick(Array.isArray(j) ? j : j.data || j);
    } catch { /* düz ZPL */ }
    if (!data) return null;
    if (!/\^XA/.test(data) && /^[A-Za-z0-9+/=\s]+$/.test(data)) {
      try { const dec = atob(data.replace(/\s/g, '')); if (/\^XA/.test(dec)) data = dec; else if (dec.startsWith('%PDF')) return { format: 'pdf', data: data.replace(/\s/g, ''), filename: `hepsiburada-${pkg.remote_id}.pdf` }; } catch { /* olduğu gibi */ }
    }
    return { format: 'zpl', data, filename: `hepsiburada-${pkg.remote_id}.zpl` };
  }

  const missing = ['HB_MERCHANT_ID', 'HB_PASSWORD'].filter((k) => !env[k]);
  return {
    ...meta, type: 'hepsiburada', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'remote', ship: 'local', label: 'zpl', createProduct: false, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, split, label,
  };
}
