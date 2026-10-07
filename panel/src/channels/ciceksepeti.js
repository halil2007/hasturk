// Çiçeksepeti (apis.ciceksepeti.com/api/v1; test ortamı sandbox-apis.ciceksepeti.com). Satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri: API anahtarı.
// Kimlik: her istekte x-api-key başlığı. Siparişler (Order/GetOrders) ürün satırı düzeyinde gelir, aynı orderId'li satırlar tek siparişte birleştirilir;
// tarih aralığı en fazla ~14 gün olduğundan aralık dilimlenir. Ürünler: GET Products (sayfa başına 60). Stok / fiyat: PUT Products/price-and-stock
// (asenkron, batchId döner; istekte en fazla 200 satır). İlanların anahtarı satıcı stok kodu (stockCode); sipariş satırı da stok koduyla eşleşir.
// Kargo: Çiçeksepeti anlaşmalı kargosu; etiket Çiçeksepeti panelinden basılır, takip no kanaldan gelir (elle takip / API'den kargoya verme yok).
// Onay (işleme al) servisi kullanılmaz. Soru-cevap, iade, ürün yükleme yok. Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, imageList, diagStep, TR } from '../util.js';

const RANKS = ['new', 'processing', 'shipped', 'delivered'];
// Satır durumu metinle gelir (ör. Yeni, Hazırlanıyor, Kargoya Verildi, Teslim Edildi, İptal, İade). Sıra önemli: önce kesin sonuçlar.
function byText(t) {
  const s = str(t).toLocaleLowerCase('tr');
  if (/iptal|cancel/.test(s)) return 'cancelled';
  if (/iade|return|refund/.test(s)) return 'returned';
  if (/teslim edildi|delivered|tamamland/.test(s)) return 'delivered';
  if (/hazırlan|kargoya hazır|kargoya verilecek|onaylan|processing|preparing/.test(s)) return 'processing';
  if (/kargo|gönderi|yolda|dağıtım|shipped|teslim edilemedi/.test(s)) return 'shipped';
  return 'new';
}
// Yalnız sayısal kod geldiğinde (orderItemStatusId). Resmi doküman (ciceksepeti.dev) bu ortamdan okunamadı; kodlar Çiçeksepeti API'sinin
// açık kaynak bir istemcisindeki sabitlerden: 1 Yeni · 2 Hazırlanıyor · 11 Kargoya verilecek · 5 Kargoya verildi · 7 Teslim edildi ·
// 20 İade süreci başladı · 21 İade kargoda · 22 İade tedarikçide · 23 İade tedarikçi onayı bekliyor. (Önceki varsayımdaki "5 = iptal" kargodaki
// siparişi iptal sayıp stoğu geri ekliyordu.) İptaller ayrı bir servisten gelir; bilinmeyen kod "yeni" sayılır.
const CODE = { 1: 'new', 2: 'processing', 11: 'processing', 5: 'shipped', 7: 'delivered', 20: 'returned', 21: 'returned', 22: 'returned', 23: 'returned' };
const pick = (o, ...ks) => { for (const k of ks) if (o[k] != null && o[k] !== '') return o[k]; return ''; };
function lineStatus(it) {
  const vals = [it.orderProductStatus, it.orderItemStatus, it.orderItemStatusName, it.orderStatus, it.statusName, it.status];
  const t = vals.find((v) => v != null && v !== '' && typeof v !== 'object' && !Number.isFinite(Number(v)));
  if (t != null) return { raw: str(t), st: byText(t) };
  const c = [it.orderItemStatusId, it.orderProductStatusId, it.statusId, ...vals].find((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  return { raw: c == null ? '' : String(c), st: CODE[Number(c)] || 'new' };
}
// Tarih: ISO (saat dilimsiz ise Türkiye saati) ya da gg.aa.yyyy ss:dd
function when(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const s = str(v), m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TR;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(s + '+03:00') || 0;
  return Date.parse(s) || 0;
}

export function ciceksepeti(env, meta) {
  const key = env.CICEKSEPETI_API_KEY;
  const API = String(env.CICEKSEPETI_TEST || '') === '1' ? 'https://sandbox-apis.ciceksepeti.com/api/v1' : 'https://apis.ciceksepeti.com/api/v1';
  // Her istekte x-api-key ve user-agent: user-agent "Satıcı ID" (entegratör adıyla "SatıcıID-EntegratörAdı"); ikisi de satıcı panelinde
  // Entegrasyon Bilgilerim'de yazar. Satıcı ID girilmemişse panelin varsayılan kimliği gider.
  const seller = str(env.CICEKSEPETI_SELLER_ID), integrator = str(env.CICEKSEPETI_INTEGRATOR);
  const ua = seller ? (integrator ? `${seller}-${integrator}` : seller) : null;
  const call = (path, opts = {}) => http(API + path, { ...opts, headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json', ...(ua ? { 'User-Agent': ua } : {}) }, body: opts.body && JSON.stringify(opts.body) });

  function group(rows) {
    const by = new Map();
    for (const r of rows) { const k = str(pick(r, 'orderId', 'orderNumber', 'orderNo')); if (k) by.set(k, [...(by.get(k) || []), r]); }
    return [...by.entries()].map(([id, list]) => {
      const r0 = list[0], seen = new Set(), items = [];
      for (const it of list) {
        const lineId = str(pick(it, 'orderItemId', 'orderProductId', 'id')) || `${id}-${items.length + 1}`;
        if (seen.has(lineId)) continue;
        seen.add(lineId);
        const qty = num(pick(it, 'quantity', 'productQuantity'), 1) || 1, s = lineStatus(it);
        const total = num(pick(it, 'totalPrice', 'orderItemTotalPrice', 'lineTotal')) || num(pick(it, 'itemPrice', 'price', 'salesPrice', 'unitPrice')) * qty;
        const sku = str(pick(it, 'stockCode', 'productCode', 'supplierProductCode'));
        items.push({ lineId, sku, barcode: str(pick(it, 'barcode', 'productBarcode')), name: str(pick(it, 'name', 'productName')), image: str(pick(it, 'productImageUrl', 'imageUrl', 'image')),
          quantity: qty, unitPrice: total / qty, total, status: ['cancelled', 'returned'].includes(s.st) ? s.st : '', remoteKey: sku || str(it.code), _st: s.st, _raw: s.raw, _it: it });
      }
      const live = items.filter((i) => !['cancelled', 'returned'].includes(i._st));
      const status = !live.length ? (items.some((i) => i._st === 'returned') ? 'returned' : 'cancelled') : RANKS[Math.min(...live.map((i) => Math.max(0, RANKS.indexOf(i._st))))];
      const raw = [...new Set(items.map((i) => i._raw).filter(Boolean))].join(', ');
      const cg = (items.find((i) => pick(i._it, 'cargoNumber', 'cargoTrackingNumber', 'trackingNumber')) || { _it: r0 })._it;
      const ship = live.map((i) => when(pick(i._it, 'lastShipmentDate', 'cargoLastDate', 'deliveryDate'))).filter(Boolean);
      for (const i of items) { delete i._st; delete i._raw; delete i._it; }
      const phone = str(pick(r0, 'receiverPhone', 'receiverMobilePhone', 'senderPhone'));
      return {
        remoteId: id, orderNumber: id, orderedAt: when(pick(r0, 'orderCreateDate', 'orderDate', 'createDate')) || Date.now(), remoteStatus: raw || status, status,
        customer: str(pick(r0, 'senderName', 'customerName', 'receiverName')), phone, email: str(pick(r0, 'senderEmail', 'customerEmail')), customerId: str(pick(r0, 'customerId', 'senderId')),
        address: { name: str(pick(r0, 'receiverName', 'senderName')), line: str(pick(r0, 'receiverAddress', 'deliveryAddress')), district: str(pick(r0, 'receiverDistrict', 'receiverRegion', 'receiverTown')), city: str(pick(r0, 'receiverCity')), phone },
        total: (live.length ? live : items).reduce((s, i) => s + i.total, 0), currency: 'TRY',
        cargoCompany: str(pick(cg, 'cargoCompany', 'cargoCompanyName', 'shipmentCompany')), tracking: str(pick(cg, 'cargoNumber', 'cargoTrackingNumber', 'trackingNumber')),
        shipBy: ship.length ? Math.min(...ship) : null, items, packages: null,
      };
    });
  }

  const W = 14 * 864e5 - 60e3;
  const page = (from, to, p, size = 100) => call('/Order/GetOrders', { method: 'POST', body: { startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString(), pageSize: size, page: p } });
  async function fetchOrders(since, until) {
    const rows = [];
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let p = 0; p < 50; p++) {
        const r = (await page(from, to, p)) || {};
        const list = r.supplierOrderListWithBranch || r.supplierOrderList || r.orders || [];
        rows.push(...list);
        if (list.length < 100 || (r.orderListCount != null && (p + 1) * 100 >= num(r.orderListCount))) break;
      }
    }
    return group(rows);
  }

  // Aynı ana ürün kodundaki (mainProductCode) ürünlerin ortak ad başı grup adı, kalan kısmı varyant adı olur
  const common = (names) => { const w = names.map((n) => n.split(/\s+/)); const out = []; for (let i = 0; w.every((x) => i < x.length - 1 && x[i] === w[0][i]); i++) out.push(w[0][i]); return out.join(' '); };
  async function fetchListings() {
    const all = [];
    for (let p = 1; p <= 400; p++) {
      const r = (await call(`/Products?PageSize=60&Page=${p}`)) || {};
      const list = r.products || r.items || [];
      all.push(...list);
      if (list.length < 60 || (r.totalCount != null && p * 60 >= num(r.totalCount))) break;
    }
    const groups = new Map();
    for (const p of all) { const g = str(p.mainProductCode) || str(p.productCode); groups.set(g, [...(groups.get(g) || []), str(p.productName)]); }
    return all.filter((p) => str(p.stockCode)).map((p) => {
      const name = str(p.productName), names = groups.get(str(p.mainProductCode) || str(p.productCode)) || [name];
      const g = names.length > 1 ? common(names) : '', images = imageList(p.images);
      return {
        remoteId: str(p.stockCode), remoteProductId: str(p.productCode), sku: str(p.stockCode), barcode: str(p.barcode), name, groupName: g || name,
        variantName: str(p.variantName) || (g ? name.slice(g.length).trim() : ''), image: images[0] || '', images,
        price: num(p.salesPrice), listPrice: num(p.listPrice) || num(p.salesPrice), stock: num(p.stockQuantity),
        active: p.isActive !== false && !/pasif|passive|inactive|red|reject|silin|delete/i.test(str(p.productStatusType)),
      };
    });
  }

  const update = async (rows) => { for (const part of chunk(rows, 200)) await call('/Products/price-and-stock', { method: 'PUT', body: { items: part } }); };
  const pushStock = (items) => update(items.map((x) => ({ stockCode: x.remoteId || x.sku, stockQuantity: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = (items) => update(items.map((x) => ({ stockCode: x.remoteId || x.sku, listPrice: Math.max(num(x.listPrice), num(x.price)), salesPrice: num(x.price) })));

  async function diagnose() {
    const out = [], now = Date.now();
    out.push({ name: 'Ortam', ok: null, detail: API.includes('sandbox') ? 'Test (sandbox) ortamı' : 'Canlı ortam' });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => {
      const r = (await page(now - 864e5, now, 0, 10)) || {}, list = r.supplierOrderListWithBranch || [];
      return { detail: `${r.orderListCount ?? list.length} sipariş satırı${list[0] ? ` · örnek durum: ${lineStatus(list[0]).raw} → ${lineStatus(list[0]).st}` : ''}` };
    });
    await diagStep(out, 'Ürünler', async () => { const r = (await call('/Products?PageSize=1&Page=1')) || {}; return { detail: `${r.totalCount ?? (r.products || []).length} ürün` }; });
    return out;
  }

  const missing = ['CICEKSEPETI_API_KEY'].filter((k) => !env[k]);
  return {
    ...meta, type: 'ciceksepeti', byOrderDate: true, enabled: !missing.length, missing,
    // Kargo Çiçeksepeti anlaşmasıyla: etiket kanal panelinden, takip no siparişle gelir; elle takip girilmez
    caps: { accept: 'local', split: 'local', ship: 'local', label: null, createProduct: false, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, diagnose,
  };
}
