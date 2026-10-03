// Trendyol Marketplace API (apigw.trendyol.com/integration).
// Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri: Satıcı ID, API Key, API Secret.
import { http, basic, num, str, chunk, diagStep } from '../util.js';

const BASE = 'https://apigw.trendyol.com/integration';

const STATUS = {
  Awaiting: 'new', Created: 'new', Picking: 'processing', Invoiced: 'processing', Repack: 'processing', UnPacked: 'processing',
  Shipped: 'shipped', AtCollectionPoint: 'shipped', UnDelivered: 'shipped', Delivered: 'delivered',
  Cancelled: 'cancelled', UnSupplied: 'cancelled', Returned: 'returned',
};
const RANKS = ['new', 'processing', 'shipped', 'delivered'];
// Trendyol kargo firmaları (getProviders). Kargo değişikliği yalnızca Created / Picking / Invoiced paketlerde, paket başına 5 dakikada bir.
export const TY_CARGO = [['TEXMP', 'Trendyol Express'], ['ARASMP', 'Aras Kargo'], ['YKMP', 'Yurtiçi Kargo'], ['SURATMP', 'Sürat Kargo'], ['PTTMP', 'PTT Kargo'],
  ['HOROZMP', 'Horoz Lojistik'], ['DHLECOMMP', 'DHL eCommerce'], ['CEVAMP', 'CEVA Lojistik'], ['KOLAYGELSINMP', 'Kolay Gelsin']];
const CHANGEABLE = ['Created', 'Picking', 'Invoiced'];
const VARIANT_ATTR = /beden|boyut|ebat|hacim|a[gğ][ıi]rl[ıi]k|renk|miktar|litre|kilo|gram|adet|paket|ölçü|olcu/i;

export function trendyol(env, meta) {
  const seller = env.TRENDYOL_SELLER_ID, key = env.TRENDYOL_API_KEY, secret = env.TRENDYOL_API_SECRET;
  const headers = () => ({
    Authorization: basic(key, secret),
    'User-Agent': `${seller} - SelfIntegration`,
    storeFrontCode: env.TRENDYOL_STOREFRONT || 'TR',
    'Content-Type': 'application/json',
  });
  const call = (path, opts = {}) => http(BASE + path, { ...opts, headers: headers(), body: opts.body && JSON.stringify(opts.body) });

  // Trendyol her paketi ayrı kayıt olarak verir; aynı sipariş numarasındaki paketler tek siparişte toplanır
  function group(pkgs) {
    const byNo = new Map();
    for (const p of pkgs) {
      const no = String(p.orderNumber);
      if (!byNo.has(no)) byNo.set(no, []);
      byNo.get(no).push(p);
    }
    return [...byNo.values()].map((list) => {
      const p0 = list[0], a = p0.shipmentAddress || {};
      const items = [], seen = new Set();
      for (const p of list) for (const l of p.lines || []) {
        const id = String(l.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const unit = num(l.price ?? l.amount);
        items.push({
          lineId: id, sku: str(l.merchantSku || l.stockCode), barcode: str(l.barcode), name: str(l.productName), image: '',
          quantity: num(l.quantity, 1), unitPrice: unit, total: unit * num(l.quantity, 1),
          status: /Cancel|UnSupplied|Return/i.test(l.orderLineItemStatusName || '') || STATUS[p.status] === 'cancelled' ? 'cancelled' : '',
          remoteKey: str(l.barcode),
        });
      }
      const live = list.filter((p) => !['cancelled', 'returned'].includes(STATUS[p.status]));
      let status;
      if (!live.length) status = list.some((p) => STATUS[p.status] === 'returned') ? 'returned' : 'cancelled';
      else status = RANKS[Math.min(...live.map((p) => Math.max(0, RANKS.indexOf(STATUS[p.status] || 'new'))))];
      const tracked = list.find((p) => p.cargoTrackingNumber) || {};
      return {
        remoteId: String(p0.orderNumber), orderNumber: String(p0.orderNumber), orderedAt: num(p0.orderDate) || Date.now(),
        remoteStatus: list.map((p) => p.status).join(', '), status,
        customer: [p0.customerFirstName, p0.customerLastName].filter(Boolean).join(' ') || str(a.fullName), phone: str(a.phone), email: str(p0.customerEmail),
        address: { name: str(a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ')), line: str(a.fullAddress || [a.address1, a.address2].filter(Boolean).join(' ')), district: str(a.district), city: str(a.city), phone: str(a.phone) },
        total: list.reduce((s, p) => s + num(p.totalPrice ?? p.grossAmount), 0), currency: p0.currencyCode || 'TRY',
        cargoCompany: str(tracked.cargoProviderName || p0.cargoProviderName), tracking: str(tracked.cargoTrackingNumber),
        awaitingPayment: list.every((p) => p.status === 'Awaiting'),
        // Son kargoya teslim tarihi (agreedDeliveryDate): canlı paketlerin en erkeni
        shipBy: Math.min(...live.map((p) => num(p.agreedDeliveryDate)).filter((x) => x > 0)) || null,
        history: list.flatMap((p) => (p.packageHistories || []).map((h) => ({ status: h.status, at: num(h.createdDate) }))),
        items,
        packages: list.map((p) => ({
          remoteId: String(p.id || p.shipmentPackageId),
          items: (p.lines || []).map((l) => ({ line_id: String(l.id), qty: num(l.quantity, 1) })),
          status: ['shipped', 'delivered'].includes(STATUS[p.status]) ? 'shipped' : STATUS[p.status] === 'cancelled' ? 'cancelled' : 'open',
          cargoCompany: str(p.cargoProviderName), tracking: str(p.cargoTrackingNumber),
          remoteStatus: p.status,
        })).filter((x) => x.status !== 'cancelled'),
      };
    });
  }

  async function fetchOrders(since, until) {
    // Trendyol en fazla 2 haftalık aralık kabul eder; daha eskiyse 2 haftalık dilimlerle çekilir
    const W = 14 * 864e5 - 60e3, pkgs = [];
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 0; page < 50; page++) {
        const r = await call(`/order/sellers/${seller}/orders?startDate=${from}&endDate=${to}&page=${page}&size=200&orderByField=PackageLastModifiedDate&orderByDirection=DESC`);
        pkgs.push(...(r.content || []));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    }
    return group(pkgs);
  }

  // Ürünler: V2 "approved" servisi (V1 /products Trendyol tarafından kapatılıyor). Stok ayrı "inventory-and-price" servisinden gelir.
  // Sayfalama: size ≤ 100, page × size ≤ 10.000; daha fazlası için nextPageToken. V2 hata verirse V1'e düşülür.
  const listingOf = (p, v, stock) => {
    const attrs = [...(v.attributes || []), ...(p.attributes || [])].filter((a) => VARIANT_ATTR.test(a.attributeName || '')).map((a) => a.attributeValue || a.customAttributeValue).filter(Boolean);
    const price = v.price || {};
    return {
      remoteId: str(v.barcode), remoteProductId: str(p.productMainId || p.contentId || p.id), sku: str(v.stockCode), barcode: str(v.barcode), name: str(p.title),
      groupName: str(p.title), variantName: [...new Set(attrs)].join(' / '),
      image: str(((p.images || v.images || [])[0] || {}).url), price: num(price.salePrice ?? v.salePrice), listPrice: num(price.listPrice ?? v.listPrice),
      stock: num(stock ?? v.quantity ?? v.stock?.quantity), active: v.onSale !== false && !v.archived && !v.blacklisted && !v.locked,
      brand: str((p.brand && typeof p.brand === 'object' ? p.brand.name : p.brand) || p.brandName), description: str(p.description),
    };
  };
  async function pagedV2(path) {
    const rows = [];
    let page = 0, token = '';
    for (let i = 0; i < 1000; i++) {
      const q = new URLSearchParams({ size: '100' });
      if (token) q.set('nextPageToken', token); else q.set('page', String(page));
      const r = await call(`${path}?${q}`);
      rows.push(...(r.content || []));
      if (!(r.content || []).length) break;
      if (r.nextPageToken) token = r.nextPageToken;
      else if ((page + 1) * 100 < 10000 && page + 1 < (r.totalPages || 1)) page++;
      else break;
    }
    return rows;
  }
  async function fetchListings() {
    try {
      const stock = new Map();
      for (const p of await pagedV2(`/product/sellers/${seller}/products/approved/inventory-and-price`)) for (const v of p.variants || [p]) stock.set(str(v.barcode), num(v.quantity));
      const out = [];
      for (const p of await pagedV2(`/product/sellers/${seller}/products/approved`)) for (const v of p.variants || []) if (v.barcode) out.push(listingOf(p, v, stock.get(str(v.barcode))));
      return out;
    } catch (e) {
      if (!/404|405|410|not\s*found/i.test(e.message)) throw e;
    }
    const out = [];
    for (let page = 0; page < 200; page++) {
      const r = await call(`/product/sellers/${seller}/products?page=${page}&size=100`);
      for (const p of r.content || []) {
        const l = listingOf(p, { ...p, price: { salePrice: p.salePrice, listPrice: p.listPrice }, onSale: true }, p.quantity);
        l.active = p.approved !== false && !p.archived;
        out.push(l);
      }
      if (page + 1 >= (r.totalPages || 1)) break;
    }
    return out;
  }

  async function pushStock(items) {
    for (const part of chunk(items, 1000)) {
      await call(`/inventory/sellers/${seller}/products/price-and-inventory`, { method: 'POST', body: { items: part.map((x) => ({ barcode: x.remoteId, quantity: x.stock })) } });
    }
  }
  async function pushPrice(items) {
    for (const part of chunk(items, 1000)) {
      await call(`/inventory/sellers/${seller}/products/price-and-inventory`, {
        method: 'POST', body: { items: part.map((x) => ({ barcode: x.remoteId, salePrice: x.price, listPrice: Math.max(x.listPrice || 0, x.price) })) },
      });
    }
  }

  const openPkgs = (order) => order.packages.filter((p) => p.remote_id && p.status === 'open');
  const linesOf = (pkg) => pkg.items.map((x) => ({ lineId: Number(x.line_id), quantity: x.qty }));

  // İşleme al = paketleri "Picking" (hazırlanıyor) yap; müşteri siparişin hazırlandığını görür
  async function accept(order) {
    for (const p of openPkgs(order)) {
      if (p.remote_status && p.remote_status !== 'Created') continue;
      await call(`/order/sellers/${seller}/shipment-packages/${p.remote_id}`, { method: 'PUT', body: { lines: linesOf(p), params: {}, status: 'Picking' } });
    }
  }

  // Paket bölme: Trendyol yeni paketleri birkaç dakika içinde oluşturur (bir sonraki senkronda panelde görünür)
  async function split(order, groups) {
    const src = openPkgs(order);
    if (src.length !== 1) throw new Error('Trendyol\'da sadece tek paketli, henüz kargolanmamış sipariş bölünebilir');
    await call(`/order/sellers/${seller}/shipment-packages/${src[0].remote_id}/split-packages`, {
      method: 'POST',
      body: { splitPackages: groups.map((g) => ({ packageDetails: g.items.map((x) => ({ orderLineId: Number(x.line_id), quantities: x.qty })) })) },
    });
    return { async: true, message: 'Bölme isteği Trendyol\'a gönderildi. Yeni paketler birkaç dakika içinde oluşur ve senkronla panele gelir.' };
  }

  async function ship(order, pkg, { invoiceNumber }) {
    if (!pkg.remote_id) throw new Error('Paket Trendyol\'da henüz oluşmadı; senkronu bekleyin');
    if (invoiceNumber) {
      await call(`/order/sellers/${seller}/shipment-packages/${pkg.remote_id}`, { method: 'PUT', body: { lines: linesOf(pkg), params: { invoiceNumber }, status: 'Invoiced' } });
    }
    // Takip numarası Trendyol'un anlaşmalı kargosundan gelir. Elle takip no bildirme servisi (update-tracking-number)
    // Trendyol tarafından kullanımdan kaldırıldı; kargo firması değişikliği "Kargo firmasını değiştir" ile yapılır.
    return {};
  }

  // Paketle (kargoya hazırla): "Picking" bildirimi; fatura no verilirse "Invoiced". Trendyol paketi zaten oluşturmuştur.
  async function pack(order, pkgs, { invoiceNumber } = {}) {
    const out = [];
    for (const p of pkgs) {
      if (!p.remote_id) throw new Error('Paket Trendyol\'da henüz oluşmadı; senkronu bekleyin');
      if (!p.remote_status || p.remote_status === 'Created') await call(`/order/sellers/${seller}/shipment-packages/${p.remote_id}`, { method: 'PUT', body: { lines: linesOf(p), params: {}, status: 'Picking' } });
      if (invoiceNumber && p.remote_status !== 'Invoiced') await call(`/order/sellers/${seller}/shipment-packages/${p.remote_id}`, { method: 'PUT', body: { lines: linesOf(p), params: { invoiceNumber }, status: 'Invoiced' } });
      out.push({ remoteId: p.remote_id, remoteStatus: invoiceNumber ? 'Invoiced' : 'Picking' });
    }
    return { packages: out, message: `Trendyol'a "${invoiceNumber ? 'Faturalandı' : 'Hazırlanıyor'}" bildirildi` };
  }

  async function cargoOptions(order, pkg) {
    const cur = pkg && pkg.cargo_company;
    return TY_CARGO.map(([id, name]) => ({ id, name, current: !!cur && cur.toLowerCase().includes(name.split(' ')[0].toLowerCase()) }));
  }
  async function changeCargo(order, pkg, cargo) {
    if (!pkg.remote_id) throw new Error('Paket Trendyol\'da henüz oluşmadı');
    if (pkg.remote_status && !CHANGEABLE.includes(pkg.remote_status)) throw new Error(`Trendyol kargo firması yalnızca Yeni / Hazırlanıyor / Faturalandı paketlerde değiştirilebilir (paket: ${pkg.remote_status})`);
    await call(`/order/sellers/${seller}/shipment-packages/${pkg.remote_id}/cargo-providers`, { method: 'PUT', body: { cargoProvider: cargo.id } });
    // Trendyol değişikliği uygular ve yeni takip numarası verir: paket tekrar okunur
    const r = await call(`/order/sellers/${seller}/orders?orderNumber=${encodeURIComponent(order.remote_id)}`).catch(() => null);
    const p = r && (r.content || []).find((x) => String(x.id) === String(pkg.remote_id));
    return { remoteId: pkg.remote_id, cargoCompany: p ? str(p.cargoProviderName) : cargo.name, tracking: p ? str(p.cargoTrackingNumber) : '', resetLabel: true };
  }

  // Ortak etiket (Trendyol Express / Aras): ZPL. Diğer firmalarda Trendyol API etiket vermez; kargo takip barkodu panel etiketine basılır.
  async function label(order, pkg) {
    const tn = pkg.tracking || order.tracking;
    if (!tn) return { pending: 'Trendyol kargo takip numarası henüz oluşmadı; paket "Hazırlanıyor" yapıldıktan birkaç dakika sonra tekrar deneyin.' };
    const common = /trendyol\s*express|tex|aras/i.test(pkg.cargo_company || order.cargo_company || 'Trendyol Express');
    if (!common) return { tracking: tn, panel: true };
    try {
      await call(`/sellers/${seller}/common-label/${encodeURIComponent(tn)}`, { method: 'POST', body: { format: 'ZPL', boxQuantity: 1 } });
    } catch (e) {
      if (!/exist|already|mevcut|zaten|409/i.test(e.message)) throw e;
    }
    const pick = (r) => { const d = r && (r.data || r); return (Array.isArray(d) ? d : [d]).map((x) => (typeof x === 'string' ? x : x && (x.label || x.zpl))).filter(Boolean).join('\n'); };
    let zpl = pick(await call(`/sellers/${seller}/common-label/${encodeURIComponent(tn)}`).catch(() => null));
    if (!zpl) zpl = pick(await call(`/sellers/${seller}/common-label/query?id=${encodeURIComponent(tn)}`).catch(() => null));
    return zpl ? { tracking: tn, label: { format: 'zpl', data: zpl, filename: `trendyol-${tn}.zpl` } } : { tracking: tn, pending: 'Trendyol etiketi henüz hazır değil; birkaç dakika sonra tekrar deneyin.' };
  }

  // Buybox: en fazla 10 barkod / istek. buyboxOrder = bizim sıramız, buyboxPrice = buybox sahibinin fiyatı.
  async function buybox(remoteIds) {
    const out = [];
    for (const part of chunk(remoteIds, 10)) {
      const r = await call(`/product/sellers/${seller}/products/buybox-information`, { method: 'POST', body: { barcodes: part } });
      for (const b of (r && (r.buyboxInfo || r.content || r)) || []) {
        out.push({ remoteId: str(b.barcode), rank: num(b.buyboxOrder) || null, buyboxPrice: num(b.buyboxPrice) || null, second: num(b.secondBuyboxPrice) || null, third: num(b.thirdBuyboxPrice) || null, multi: !!b.hasMultipleSeller });
      }
    }
    return out;
  }

  // Müşteri soruları (Soru-Cevap entegrasyonu). Tarih aralığı en fazla 2 hafta, sayfa 0'dan, sayfa boyutu ≤ 50.
  const QST = { WAITING_FOR_ANSWER: 'waiting', ANSWERED: 'answered', WAITING_FOR_APPROVE: 'answered', REJECTED: 'rejected', REPORTED: 'other' };
  async function questions({ since, until = Date.now(), page = 0, size = 50 }) {
    const start = Math.max(since || 0, until - 14 * 864e5 + 60e3);
    const q = new URLSearchParams({ supplierId: seller, startDate: String(start), endDate: String(until), page: String(page), size: String(Math.min(size, 50)), orderByField: 'LastModifiedDate', orderByDirection: 'DESC' });
    const r = await call(`/qna/sellers/${seller}/questions/filter?${q}`);
    const items = (r.content || []).map((x) => {
      const a = x.answer || {};
      return {
        remoteId: str(x.id), text: str(x.text), askedAt: num(x.creationDate) || Date.now(), status: QST[x.status] || 'other', remoteStatus: str(x.status),
        productName: str(x.productName), productImage: str(x.imageUrl), productUrl: str(x.webUrl), barcode: '', sku: str(x.productMainId),
        customer: x.showUserName === false ? '' : str(x.userName), answer: a.text ? str(a.text) : null, answeredAt: num(a.creationDate) || null,
      };
    });
    return { items, total: num(r.totalElements), hasNext: page + 1 < num(r.totalPages) };
  }
  // Cevap: 10–2000 karakter; Trendyol onayından sonra müşteriye görünür
  async function answer(q, text) {
    await call(`/qna/sellers/${seller}/questions/${encodeURIComponent(q.remote_id)}/answers`, { method: 'POST', body: { text } });
  }
  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const r = await call(`/order/sellers/${seller}/orders?startDate=${now - 864e5}&endDate=${now}&page=0&size=1`); return { detail: `${r.totalElements ?? (r.content || []).length} paket · satıcı ${seller}` }; });
    let bc = '';
    await diagStep(out, 'Ürünler (V2 onaylı ürün servisi)', async () => { const r = await call(`/product/sellers/${seller}/products/approved?page=0&size=1`); bc = str((((r.content || [])[0] || {}).variants || [])[0]?.barcode); return { detail: `${r.totalElements ?? '?'} ürün` }; });
    await diagStep(out, 'Stok / fiyat servisi', async () => { const r = await call(`/product/sellers/${seller}/products/approved/inventory-and-price?page=0&size=1`); return { detail: `erişildi · ${r.totalElements ?? (r.content || []).length} ürün` }; });
    await diagStep(out, 'Buybox servisi', async () => { if (!bc) return { ok: null, detail: 'Ürün yok, denenemedi' }; await buybox([bc]); return { detail: 'Erişilebilir' }; });
    await diagStep(out, 'Müşteri soruları', async () => { const r = await questions({ since: now - 7 * 864e5, page: 0, size: 1 }); return { detail: `son 7 günde ${r.total ?? r.items.length} soru` }; });
    if (orderId) await diagStep(out, 'Sipariş paketleri', async () => {
      const r = await call(`/order/sellers/${seller}/orders?orderNumber=${encodeURIComponent(orderId)}`);
      const ps = r.content || [];
      return { ok: ps.length ? true : false, detail: ps.map((p) => `Paket ${p.id}: ${p.status} · ${p.cargoProviderName || '-'} · takip ${p.cargoTrackingNumber || '-'}${p.agreedDeliveryDate ? ` · son teslim ${new Date(p.agreedDeliveryDate).toISOString().slice(0, 16).replace('T', ' ')}` : ''}`).join('\n') || 'Trendyol bu sipariş numarasını bulamadı' };
    });
    return out;
  }

  const missing = ['TRENDYOL_SELLER_ID', 'TRENDYOL_API_KEY', 'TRENDYOL_API_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'trendyol', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'remote-async', pack: 'status', ship: 'remote', label: 'remote', cargo: 'change', createProduct: false, price: true, answer: { min: 10, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, split, ship, label, pack, cargoOptions, changeCargo, buybox, questions, answer, diagnose,
  };
}
