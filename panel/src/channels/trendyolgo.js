// Trendyol Go by Uber Eats — Hızlı Market (grocery) entegrasyonu (developers.tgoapps.com → "Market Entegrasyonu").
// Canlı adres https://api.tgoapis.com/integrator/, test https://stageapi.tgoapis.com/integrator/ (test ortamı IP yetkisi ister, 503 = IP tanımsız).
// Kimlik: Basic Auth (API Key : API Secret) + zorunlu User-Agent "SatıcıId - SelfIntegration" (entegratör firma varsa "SatıcıId - FirmaAdı", alfanumerik ≤ 30);
// User-Agent'sız istek 403. Bilgiler: Trendyol Go satıcı paneli (partner.tgomarket.com) → mağaza adı → Hesap Bilgilerim → Entegrasyon Bilgileri.
// Anahtar satıcı (supplierId) başına tektir, şubelerde (storeId) değişmez. Sınır: aynı uca 10 saniyede 50 istek (51. istek 429).
// Siparişler: GET order/grocery/suppliers/{supplierId}/packages?storeId=&status=…&page=&size= (paket listesi; size ≤ 50).
// Akış: Created → PUT …/packages/{packageId}/picked (gövdesiz; "işleme al") → toplama bitince GET …/orders/{orderId}/invoice-amount (provizyon aralığı)
// hemen ardından PUT …/packages/{packageId}/invoiced (sipariş hazırlandı; Invoiced beslenmeyen sipariş Shipped olamaz) → kurye alır (Shipped) → Delivered.
// Tedarik edememe (UnSupplied) aynı sipariş numarasında yeni packageId oluşturur: panelde sipariş kimliği sipariş numarasıdır, paket kimliği işlem anında
// GET …/packages/order-number/{orderNumber} ile güncel paketten okunur.
// Kurye platformun (Model 2) ya da satıcının (Model 1): etiket / takip numarası yok (caps.label null, manualTracking false).
// Ürünler şube bazlı: GET product/grocery/suppliers/{supplierId}/stores/{storeId}/products (Ürün Filtreleme V2); stok + fiyat
// POST product/grocery/suppliers/{supplierId}/products/price-and-inventory { items: [{ barcode, storeId, quantity, salePrice, listPrice }] } (asenkron, batchRequestId).
// Şube kimliği (storeId) GET store/grocery/suppliers/{supplierId}/store-listing ile listelenir (tanılamada gösterilir).
// İade, değerlendirme, teslimat bölgesi, çalışma saatleri ve fatura gönderimi kullanılmaz.
import { http, basic, num, str, chunk, imageList, diagStep, DEAD_LINE } from '../util.js';

export const TGO_BASE = 'https://api.tgoapis.com/integrator';
export const TGO_STAGE = 'https://stageapi.tgoapis.com/integrator';
const STATUS = { Created: 'new', Picking: 'processing', Invoiced: 'processing', Shipped: 'shipped', Delivered: 'delivered', Cancelled: 'cancelled', UnSupplied: 'cancelled', Returned: 'returned' };
const ALL = ['Created', 'Picking', 'Invoiced', 'Shipped', 'Delivered', 'Cancelled', 'UnSupplied', 'Returned'];
const SIZE = 50, D = 864e5;

export function trendyolgo(env, meta) {
  const base = str(env.TRENDYOLGO_ENV) === 'stage' ? TGO_STAGE : TGO_BASE;
  const sid = str(env.TRENDYOLGO_SUPPLIER_ID), store = str(env.TRENDYOLGO_STORE_ID);
  const integrator = str(env.TRENDYOLGO_INTEGRATOR).replace(/[^0-9A-Za-z]/g, '').slice(0, 30) || 'SelfIntegration';
  const headers = (body) => ({
    Authorization: basic(str(env.TRENDYOLGO_API_KEY), str(env.TRENDYOLGO_API_SECRET)),
    'User-Agent': `${sid} - ${integrator}`,
    // DOĞRULA: x-agentname / x-executor-user Yemek servislerinde zorunlu; Market dokümanında geçmiyor — zararsız olduğundan gönderilir
    'x-agentname': integrator,
    ...(str(env.TRENDYOLGO_EXECUTOR) ? { 'x-executor-user': str(env.TRENDYOLGO_EXECUTOR) } : {}),
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  });
  const q = (o) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o || {})) for (const x of [].concat(v)) if (x != null && x !== '') p.append(k, String(x));
    const s = p.toString();
    return s ? '?' + s : '';
  };
  const call = (path, { method = 'GET', query, body } = {}) => http(base + path + q(query), { method, headers: headers(body), body: body && JSON.stringify(body) });
  const ord = `/order/grocery/suppliers/${encodeURIComponent(sid)}`, prod = `/product/grocery/suppliers/${encodeURIComponent(sid)}`;

  // ---------- siparişler ----------
  // Paket satırı: ürün satırı (lines) altında adet kadar "items" (packageItemId) bulunur; adet ayrıca "quantity" olarak da gelebilir
  // DOĞRULA: Market paket modelindeki satır alan adları (barcode, productName, quantity, price / amount) — Yemek modeli ve Trendyol pazaryeri ile aynı varsayıldı
  function lineOf(l, dead) {
    const units = Array.isArray(l.items) ? l.items : [];
    const live = units.filter((u) => !u.isCancelled);
    const qty = units.length ? live.length : num(l.quantity ?? l.amount, 1);
    const unit = num(l.unitSellingPrice ?? l.price ?? l.salePrice ?? l.amount);
    return {
      lineId: str(l.lineItemId ?? l.id ?? (units[0] && units[0].lineItemId) ?? l.barcode), sku: str(l.stockCode || l.merchantSku || l.barcode), barcode: str(l.barcode),
      name: str(l.productName || l.name), image: str(l.imageUrl || l.image), quantity: qty || num(l.quantity, 1) || 1, unitPrice: unit,
      total: Math.round(unit * (qty || num(l.quantity, 1) || 1) * 100) / 100, status: dead || (units.length && !live.length) ? 'cancelled' : '', remoteKey: str(l.barcode),
    };
  }
  // Aynı sipariş numarasındaki paketler tek sipariş: tedarik edememe sonrası yeni paket eskisinin yerini alır (en son oluşturulan canlı paket esas)
  function group(pkgs) {
    const by = new Map();
    for (const p of pkgs) {
      const no = str(p.orderNumber || p.orderId || p.id);
      if (!by.has(no)) by.set(no, new Map());
      by.get(no).set(str(p.id), p);
    }
    return [...by.entries()].map(([no, m]) => {
      const list = [...m.values()].sort((a, b) => num(b.packageCreationDate) - num(a.packageCreationDate));
      const cur = list.find((p) => p.packageStatus !== 'UnSupplied') || list[0];
      const c = cur.customer || {}, a = cur.address || {};
      const st = str(cur.packageStatus);
      const items = (cur.lines || []).map((l) => lineOf(l, ['cancelled', 'returned'].includes(STATUS[st]) ? 'cancelled' : ''));
      const name = [a.firstName || c.firstName, a.lastName || c.lastName].map(str).filter(Boolean).join(' ');
      const line = [a.address1, a.address2, a.neighborhood, a.apartmentNumber && `No ${a.apartmentNumber}`, a.floor && `Kat ${a.floor}`, a.doorNumber && `Daire ${a.doorNumber}`, a.addressDescription, a.postalCode]
        .map(str).filter((x) => x && !/^Trendyol/i.test(x)).join(' ');
      return {
        remoteId: no, orderNumber: no, orderedAt: num(cur.packageCreationDate) || num(cur.orderDate) || Date.now(), remoteStatus: st, status: STATUS[st] || 'new',
        customer: [c.firstName, c.lastName].map(str).filter(Boolean).join(' ') || name, phone: str(a.phone || cur.callCenterPhone), email: '', customerId: str(c.id),
        address: { name, line, district: /^Trendyol/i.test(str(a.district)) ? '' : str(a.district), city: /^Trendyol/i.test(str(a.city)) ? '' : str(a.city), phone: str(a.phone || cur.callCenterPhone) },
        total: num(cur.totalPrice) || items.filter((i) => !i.status).reduce((s, i) => s + i.total, 0), currency: 'TRY',
        cargoCompany: str(cur.deliveryType) === 'STORE' ? 'Kendi kuryesi' : 'Trendyol Go kuryesi', tracking: '',
        shipBy: num(cur.estimatedDeliveryEndDate || cur.estimatedPickupTimeMax) || null, items, packages: null,
      };
    });
  }
  async function pages(query, max = 40) {
    const out = [];
    for (let page = 0; page < max; page++) {
      const r = (await call(`${ord}/packages`, { query: { ...query, page, size: SIZE } })) || {};
      const list = r.content || [];
      out.push(...list);
      if (list.length < SIZE || page + 1 >= num(r.totalPages, Infinity)) break;
    }
    return out;
  }
  // Paket değişiklik zamanına göre (durum değişiklikleri kaçmaz); geçmiş aktarımda da aynı süzgeç (değişiklik zamanı ≥ oluşturulma)
  // DOĞRULA: tarih süzgeci adları packageModificationStartDate / packageModificationEndDate (Yemek modelinde belgeli; Market'te önerilen örnek yalnız storeId + status)
  async function fetchOrders(since, until) {
    const pkgs = await pages({ storeId: store, status: ALL, packageModificationStartDate: Math.floor(since), packageModificationEndDate: Math.floor(until || Date.now()), sortDirection: 'DESC' });
    return group(pkgs);
  }
  // Güncel paket: sipariş numarasıyla (tedarik edememe sonrası yeni packageId)
  async function currentPackage(order) {
    const no = str(order.remote_id || order.order_number);
    const r = await call(`${ord}/packages/order-number/${encodeURIComponent(no)}`);
    const list = Array.isArray(r) ? r : (r && (r.content || r.packages)) || (r && r.id ? [r] : []);
    const sorted = [...list].sort((a, b) => num(b.packageCreationDate) - num(a.packageCreationDate));
    const p = sorted.find((x) => x.packageStatus !== 'UnSupplied' && x.packageStatus !== 'Cancelled') || sorted[0];
    if (!p) throw new Error(`Trendyol Go: ${no} siparişinin paketi bulunamadı`);
    return p;
  }

  // ---------- sipariş işlemleri ----------
  // İşleme al: Created paket → Picking (gövdesiz PUT)
  async function accept(order) {
    const p = await currentPackage(order);
    if (p.packageStatus !== 'Created') return;
    await call(`${ord}/packages/${encodeURIComponent(p.id)}/picked`, { method: 'PUT' });
  }
  // Hazır: provizyon aralığı okunur, tutar aralığa sıkıştırılarak Invoiced bildirilir. Created paket önce Picking yapılır.
  // DOĞRULA: invoiced gövdesi { invoiceAmount, bagCount, receiptLink, invoiceTaxAmount } ve invoice-amount yanıt alanları (min / max) — üçüncü taraf entegrasyonlardan
  async function ship(order) {
    let p = await currentPackage(order);
    if (['Invoiced', 'Shipped', 'Delivered'].includes(p.packageStatus)) return {};
    if (['Cancelled', 'UnSupplied', 'Returned'].includes(p.packageStatus)) throw new Error(`Trendyol Go: paket ${p.packageStatus} durumunda, hazırlandı bildirilemez`);
    if (p.packageStatus === 'Created') await call(`${ord}/packages/${encodeURIComponent(p.id)}/picked`, { method: 'PUT' });
    const live = (order.items || []).filter((i) => !DEAD_LINE(i.status));
    let amount = live.length ? live.reduce((s, i) => s + (num(i.total) || num(i.unit_price) * num(i.quantity, 1)), 0) : num(p.totalPrice);
    if (!(amount > 0)) amount = num(p.totalPrice);
    if (p.orderId) {
      const lim = (await call(`${ord}/orders/${encodeURIComponent(p.orderId)}/invoice-amount`).catch(() => null)) || {};
      const lo = num(lim.minInvoiceAmount ?? lim.min ?? lim.minAmount, 0), hi = num(lim.maxInvoiceAmount ?? lim.max ?? lim.maxAmount, 0);
      if (hi > 0) amount = Math.min(amount, hi);
      if (lo > 0) amount = Math.max(amount, lo);
    }
    await call(`${ord}/packages/${encodeURIComponent(p.id)}/invoiced`, { method: 'PUT', body: { invoiceAmount: Math.round(amount * 100) / 100, bagCount: null, receiptLink: null, invoiceTaxAmount: 0 } });
    return { tracking: '' };
  }

  // ---------- ürünler (şube bazlı) ----------
  // DOĞRULA: Ürün Filtreleme V2 yolu …/stores/{storeId}/products ve yanıt alanları (content[], barcode, title, salePrice, listPrice, quantity, onSale)
  async function fetchListings() {
    const out = [];
    for (let page = 0; page < 400; page++) {
      const r = (await call(`${prod}/stores/${encodeURIComponent(store)}/products`, { query: { page, size: 100 } })) || {};
      const list = r.content || r.products || [];
      for (const p of list) {
        if (!p.barcode) continue;
        const images = imageList(p.images), price = num(p.salePrice ?? p.sellingPrice ?? p.price);
        out.push({ remoteId: str(p.barcode), remoteProductId: str(p.productMainId || p.id), sku: str(p.stockCode || p.barcode), barcode: str(p.barcode), name: str(p.title || p.name),
          groupName: str(p.title || p.name), variantName: '', image: images[0] || '', images, price, listPrice: Math.max(num(p.listPrice ?? p.originalPrice), price),
          stock: num(p.quantity ?? p.stock), active: p.onSale !== false && p.status !== 'PASSIVE' && p.archived !== true });
      }
      if (list.length < 100 || page + 1 >= num(r.totalPages, Infinity)) break;
    }
    return out;
  }
  // Fiyat ve stok aynı serviste: stok gönderiminde son okunan fiyat, fiyat gönderiminde son okunan stok korunur (gönderilmeyen alan istenmez)
  // DOĞRULA: yol …/products/price-and-inventory ve satır alanları; tek alanlı (yalnız quantity ya da yalnız fiyat) gönderim kabul ediliyor varsayıldı
  const BATCH = 1000;
  async function send(rows) {
    const ids = [];
    for (const part of chunk(rows, BATCH)) {
      const r = (await call(`${prod}/products/price-and-inventory`, { method: 'POST', body: { items: part } })) || {};
      if (r.batchRequestId) ids.push(r.batchRequestId);
    }
    return { batchRequestIds: ids };
  }
  const bc = (x) => str(x.barcode || x.remoteId);
  const pushStock = (items) => send(items.filter(bc).map((x) => ({ barcode: bc(x), storeId: num(store) || store, quantity: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = async (items) => {
    const bad = items.filter((x) => !(num(x.price) > 0)).map(bc);
    if (bad.length) throw new Error(`Trendyol Go: ${bad.length} üründe satış fiyatı yok (${bad.slice(0, 5).join(', ')})`);
    return send(items.filter(bc).map((x) => {
      const sale = Math.round(num(x.price) * 100) / 100;
      return { barcode: bc(x), storeId: num(store) || store, salePrice: sale, listPrice: Math.max(Math.round(num(x.listPrice) * 100) / 100, sale) };
    }));
  };

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Şubeler (store-listing)', async () => {
      const r = await call(`/store/grocery/suppliers/${encodeURIComponent(sid)}/store-listing`);
      const list = Array.isArray(r) ? r : (r && (r.content || r.stores || r.groceries)) || [];
      const mine = list.find((s) => str(s.id ?? s.storeId) === store);
      return { detail: `${list.length} şube${list.length ? ': ' + list.slice(0, 5).map((s) => `${s.name || s.storeName || '?'} (${s.id ?? s.storeId})`).join(', ') : ''}${store ? (mine ? ` · seçili şube ${store} bulundu` : ` · seçili şube ${store} listede yok`) : ' · şube ID girilmedi'} · adres ${base}` };
    });
    await diagStep(out, 'Sipariş paketleri (son 24 saat)', async () => {
      const r = (await call(`${ord}/packages`, { query: { storeId: store, packageModificationStartDate: now - D, packageModificationEndDate: now, page: 0, size: 1 } })) || {}, p = (r.content || [])[0];
      return { detail: `${r.totalCount ?? (r.content || []).length} paket${p ? ` · örnek durum: ${p.packageStatus} → ${STATUS[p.packageStatus] || 'new'}` : ''}` };
    });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const p = await currentPackage({ remote_id: orderId }); return { detail: `paket ${p.id} · durum ${p.packageStatus} · ${p.deliveryType || ''}`.trim() }; });
    if (store) await diagStep(out, 'Ürünler (şube)', async () => { const r = (await call(`${prod}/stores/${encodeURIComponent(store)}/products`, { query: { page: 0, size: 1 } })) || {}; return { detail: `${r.totalElements ?? r.totalCount ?? (r.content || []).length} ürün` }; });
    return out;
  }

  const missing = ['TRENDYOLGO_SUPPLIER_ID', 'TRENDYOLGO_API_KEY', 'TRENDYOLGO_API_SECRET', 'TRENDYOLGO_STORE_ID'].filter((k) => !env[k]);
  return {
    ...meta, type: 'trendyolgo', enabled: !missing.length, missing,
    // courier: 'platform' → kargo yok; "Kargoya ver" = sipariş hazırlandı (Invoiced), kurye platformun ya da satıcının
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: false, courier: 'platform' },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose,
  };
}
