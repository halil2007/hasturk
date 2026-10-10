// Turkcell Pasaj pazaryeri (Pasaj Seller Admin satıcı API'si). Mirakl değil: panel pasaj.turkcell.com.tr/seller-admin (kendi altyapısı).
// Herkese açık resmi API dokümanı yok: API özelliği varsayılan kapalı gelir, Pasaj danışmanı açar ve entegrasyon belgesini / API adresini iletir.
// Kimlik bilgileri: Seller Admin (https://pasaj.turkcell.com.tr/seller-admin) → sağ üstte kullanıcı adı → Entegrasyon Bilgileri → "Yeni Oluştur":
// Satıcı ID, API Key, API Secret. Bunlar Trendyol düzenindeki üçlüdür; kimlik bu yüzden "Authorization: Basic base64(APIKey:APISecret)" ve
// "User-Agent: <SatıcıID> - SelfIntegration" olarak gönderilir (DOĞRULA).
// API kök adresi doğrulanamadığından zorunlu alandır: Pasaj'ın verdiği adres (yol önekiyle birlikte) girilir.
// Uç noktalar Trendyol tedarikçi API düzeninde varsayıldı (DOĞRULA): sipariş paketleri GET /suppliers/{id}/orders (sayfalı, tarih ms),
// paket statüsü PUT /suppliers/{id}/shipment-packages/{paket} (Picking / Invoiced), takip no PUT /suppliers/{id}/{paket}/update-tracking-number,
// ürünler GET /suppliers/{id}/products, stok + fiyat POST /suppliers/{id}/products/price-and-inventory (asenkron, batchRequestId döner).
// Her paket ayrı kayıt olarak gelir: aynı sipariş numarasındaki paketler tek siparişte toplanır (panelde paketleme yereldir).
// Kargoya verme: Pasaj anlaşmalı kargoda takip no Pasaj'dan gelir (yalnız "Invoiced" bildirilir); satıcının kendi kargosunda takip no gönderilir.
// Soru-cevap, iade, ürün yükleme, etiket yok. Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, basic, num, str, chunk, imageList, diagStep, DEAD_LINE } from '../util.js';

const STATUS = {
  Awaiting: 'new', Created: 'new', Picking: 'processing', Invoiced: 'processing', Shipped: 'shipped', AtCollectionPoint: 'shipped', UnDelivered: 'shipped',
  Delivered: 'delivered', Cancelled: 'cancelled', UnSupplied: 'cancelled', Returned: 'returned',
};
const RANKS = ['new', 'processing', 'shipped', 'delivered'];
const D = 864e5;
// DOĞRULA: tarih aralığı sınırı (Trendyol düzeninde en fazla 2 hafta): uzun aralık 14 günlük dilimlerle okunur
const W = 14 * D;
// Değişen sipariş başına bir numarayla sorgu (tüm paketler): bir senkronda en fazla bu kadar
const MAX_LOOKUP = 100;

export function pasaj(env, meta) {
  // DOĞRULA: kök adres Pasaj'dan alınır (varsayılan yok)
  const base = str(env.PASAJ_URL).replace(/\/+$/, '');
  const seller = str(env.PASAJ_SELLER_ID), key = str(env.PASAJ_API_KEY), secret = str(env.PASAJ_API_SECRET);
  const integrator = str(env.PASAJ_INTEGRATOR).replace(/[^0-9A-Za-z]/g, '').slice(0, 30) || 'SelfIntegration';
  const sup = `/suppliers/${encodeURIComponent(seller)}`;
  const call = (path, opts = {}) => http(base + path, {
    ...opts, body: opts.body && JSON.stringify(opts.body),
    headers: { Authorization: basic(key, secret), 'User-Agent': `${seller} - ${integrator}`, Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });

  // Paket alanları Trendyol düzeninde okunur; farklı adlar yedek olarak denenir (DOĞRULA: alan adları)
  const pkgId = (p) => str(p.id ?? p.shipmentPackageId ?? p.packageId);
  const lineIdOf = (l) => str(l.id ?? l.lineId ?? l.orderLineId);
  const isLive = (p) => !['cancelled', 'returned'].includes(STATUS[p.status]);
  const lineKind = (p, l) => {
    const s = str(l.orderLineItemStatusName || l.status);
    return /Cancel|UnSupplied/i.test(s) || STATUS[p.status] === 'cancelled' ? 'cancelled' : /Return/i.test(s) || STATUS[p.status] === 'returned' ? 'returned' : '';
  };

  const noOf = (p) => str(p.orderNumber ?? p.orderId);
  // Paketin son değişiklik zamanı (DOĞRULA: alan adı Trendyol düzeninde lastModifiedDate); yoksa sipariş tarihi
  const dateOf = (v) => (typeof v === 'string' && !/^\d+$/.test(v) ? Date.parse(v) || 0 : num(v));
  const modOf = (p) => dateOf(p.lastModifiedDate ?? p.packageLastModifiedDate ?? p.orderDate);
  function group(pkgs) {
    const byNo = new Map();
    for (const p of pkgs) {
      const no = str(p.orderNumber ?? p.orderId);
      if (!byNo.has(no)) byNo.set(no, new Map());
      const m = byNo.get(no), id = pkgId(p);
      if (!m.has(id)) m.set(id, p);
    }
    return [...byNo.values()].map((m) => {
      const list = [...m.values()], p0 = list[0], a = p0.shipmentAddress || p0.shippingAddress || {}, live = list.filter(isLive);
      const items = [];
      for (const p of [...live, ...list.filter((x) => !isLive(x))]) for (const l of p.lines || p.orderLines || []) {
        const qty = num(l.quantity, 1) || 1, unit = num(l.price ?? l.unitPrice ?? l.amount), st = lineKind(p, l);
        items.push({ lineId: lineIdOf(l), sku: str(l.merchantSku || l.stockCode), barcode: str(l.barcode), name: str(l.productName || l.name), image: str(l.imageUrl || l.image),
          quantity: qty, unitPrice: unit, total: Math.round(unit * qty * 100) / 100, status: st, remoteKey: str(l.barcode) });
      }
      let status;
      if (!live.length) status = list.some((p) => STATUS[p.status] === 'returned') ? 'returned' : 'cancelled';
      else status = RANKS[Math.min(...live.map((p) => Math.max(0, RANKS.indexOf(STATUS[p.status] || 'new'))))];
      const tracked = list.find((p) => p.cargoTrackingNumber) || {};
      const sum = (ps) => ps.reduce((s, p) => s + num(p.totalPrice ?? p.grossAmount), 0);
      const name = str(a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' '));
      const orderedAt = dateOf(p0.orderDate);
      return {
        remoteId: str(p0.orderNumber ?? p0.orderId), orderNumber: str(p0.orderNumber ?? p0.orderId), orderedAt: orderedAt || Date.now(),
        remoteStatus: [...new Set(list.map((p) => p.status))].join(', '), status,
        customer: [p0.customerFirstName, p0.customerLastName].filter(Boolean).join(' ') || name, phone: str(a.phone), email: str(p0.customerEmail), customerId: str(p0.customerId),
        address: { name, line: str(a.fullAddress || [a.address1, a.address2].filter(Boolean).join(' ')), district: str(a.district), city: str(a.city), phone: str(a.phone) },
        total: Math.round(sum(live.length ? live : list) * 100) / 100, currency: str(p0.currencyCode) || 'TRY',
        cargoCompany: str(tracked.cargoProviderName || p0.cargoProviderName), tracking: str(tracked.cargoTrackingNumber),
        shipBy: ((n) => (Number.isFinite(n) ? n : null))(Math.min(...live.map((p) => num(p.agreedDeliveryDate)).filter((x) => x > 0))),
        items, packages: null,
      };
    });
  }

  // Siparişler: son güncellenme tarihine göre (durum değişiklikleri kaçmaz); geçmiş aktarımda (byOrdered) sipariş tarihine göre
  // DOĞRULA: orderByField değerleri (PackageLastModifiedDate / CreatedDate) ve tarih biçimi (ms epoch)
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const pkgs = [];
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 0; page < 50; page++) {
        const q = new URLSearchParams({ startDate: String(from), endDate: String(to), page: String(page), size: '200', orderByField: byOrdered ? 'CreatedDate' : 'PackageLastModifiedDate', orderByDirection: 'DESC' });
        const r = (await call(`${sup}/orders?${q}`)) || {};
        pkgs.push(...(r.content || []));
        if (page + 1 >= num(r.totalPages, 1)) break;
      }
    }
    if (byOrdered) return group(pkgs);
    // Güncellenme tarihine göre sorguda yalnız değişen paket gelir: siparişin diğer paketleri (satırları) kaydedilen siparişten düşer,
    // stokları geri eklenirdi. Görülen her sipariş numarasının tüm paketleri numarayla okunur (en eski değişen önce, en fazla MAX_LOOKUP);
    // fazlası sonraki senkrona kalır (imleç son okunan siparişin değişiklik zamanında: partialUntil). Sorgu aralığında oluşturulan
    // siparişin bütün paketleri zaten listededir (oluşturulma da değişikliktir): o siparişler numarayla okunmaz.
    const last = new Map(), fresh = new Set();
    for (const p of pkgs) { const no = noOf(p), t = modOf(p); if (no && (!last.has(no) || t > last.get(no))) last.set(no, t); if (no && dateOf(p.orderDate) >= since) fresh.add(no); }
    for (const no of fresh) last.delete(no);
    const nos = [...last.keys()].sort((a, b) => last.get(a) - last.get(b)), keep = new Set(nos.slice(0, MAX_LOOKUP)), full = [];
    for (const no of keep) full.push(...(await orderPackages(no)).filter((p) => noOf(p) === no));
    const out = group([...full, ...pkgs.filter((p) => keep.has(noOf(p)) || fresh.has(noOf(p)))]);
    if (nos.length > keep.size) {
      const t = last.get(nos[keep.size - 1]);
      out.partialUntil = t > since ? t - 1000 : since;
      out.warnings = [`Pasaj: ${nos.length} değişen siparişin ${keep.size} tanesi okundu; kalanlar sonraki senkronda`];
    }
    return out;
  }
  const orderPackages = async (no) => (((await call(`${sup}/orders?orderNumber=${encodeURIComponent(no)}`)) || {}).content || []);

  // Ürünler (onaylı ürünler, sayfalı)
  async function fetchListings() {
    const out = [];
    for (let page = 0; page < 500; page++) {
      const r = (await call(`${sup}/products?page=${page}&size=100&approved=true`)) || {};
      for (const p of r.content || []) {
        if (!p.barcode) continue;
        const images = imageList(p.images);
        const price = num(p.salePrice);
        out.push({ remoteId: str(p.barcode), remoteProductId: str(p.productMainId || p.productCode || p.id), sku: str(p.stockCode || p.merchantSku), barcode: str(p.barcode),
          name: str(p.title || p.name), groupName: str(p.title || p.name), variantName: str(p.color || p.size ? [p.color, p.size].filter(Boolean).join(' / ') : ''),
          image: images[0] || '', images, price, listPrice: Math.max(num(p.listPrice), price), stock: num(p.quantity ?? p.stock),
          active: p.approved !== false && p.onSale !== false && !p.archived && !p.locked });
      }
      if (page + 1 >= num(r.totalPages, 1)) break;
    }
    return out;
  }

  // Stok / fiyat: aynı servis, 1000'er satır; Pasaj toplu işlem kimliği döner (sonuç birkaç dakika sonra işlenir)
  async function pushItems(rows) {
    const refs = [];
    for (const part of chunk(rows, 1000)) {
      const r = await call(`${sup}/products/price-and-inventory`, { method: 'POST', body: { items: part } });
      if (r && r.batchRequestId) refs.push(String(r.batchRequestId));
    }
    return { refs };
  }
  const pushStock = (items) => pushItems(items.map((x) => ({ barcode: str(x.remoteId || x.barcode), quantity: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = (items) => pushItems(items.map((x) => ({ barcode: str(x.remoteId || x.barcode), salePrice: num(x.price), listPrice: Math.max(num(x.listPrice), num(x.price)) })));

  // ---------- sipariş işlemleri ----------
  // Paket bilgisi senkrondan (packages: null) gelmez: işlem anında sipariş numarasıyla paketler okunur
  const linesOf = (p) => (p.lines || p.orderLines || []).map((l) => ({ lineId: Number(lineIdOf(l)) || lineIdOf(l), quantity: num(l.quantity, 1) }));
  const putStatus = (p, status, params = {}) => call(`${sup}/shipment-packages/${encodeURIComponent(pkgId(p))}`, { method: 'PUT', body: { lines: linesOf(p), params, status } });
  // İşleme al: yeni (Created) paketler "Picking" yapılır
  async function accept(order) {
    if ((order.items || []).every((i) => DEAD_LINE(i.status))) return;
    for (const p of await orderPackages(order.remote_id)) if (p.status === 'Created') await putStatus(p, 'Picking');
  }
  // Kargoya ver: Picking → Invoiced (fatura no varsa), takip no girildiyse bildirilir (satıcının kendi kargosu)
  // DOĞRULA: update-tracking-number yolu ve gövdesi; Pasaj anlaşmalı kargoda bu servis reddedebilir
  async function ship(order, pkg, { tracking, invoiceNumber } = {}) {
    const pkgs = (await orderPackages(order.remote_id)).filter(isLive);
    if (!pkgs.length) throw new Error(`Pasaj: ${order.remote_id} siparişinin açık paketi bulunamadı`);
    const tn = str(tracking || (pkg && pkg.tracking));
    for (const p of pkgs) {
      if (['Shipped', 'Delivered', 'AtCollectionPoint'].includes(p.status)) continue;
      if (p.status === 'Created' || p.status === 'Awaiting') await putStatus(p, 'Picking');
      if (p.status !== 'Invoiced') await putStatus(p, 'Invoiced', invoiceNumber ? { invoiceNumber: str(invoiceNumber) } : {});
      if (tn) await call(`${sup}/${encodeURIComponent(pkgId(p))}/update-tracking-number`, { method: 'PUT', body: { trackingNumber: tn } });
    }
    const t = pkgs.find((p) => p.cargoTrackingNumber);
    return { tracking: tn || str(t && t.cargoTrackingNumber) };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const r = (await call(`${sup}/orders?startDate=${now - D}&endDate=${now}&page=0&size=1`)) || {}; return { detail: `${r.totalElements ?? (r.content || []).length} paket · satıcı ${seller} · adres ${base}` }; });
    await diagStep(out, 'Ürünler', async () => { const r = (await call(`${sup}/products?page=0&size=1`)) || {}; return { detail: `${r.totalElements ?? (r.content || []).length} ürün` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => {
      const ps = await orderPackages(orderId);
      if (!ps.length) throw new Error('Sipariş bulunamadı');
      return { detail: ps.map((p) => `Paket ${pkgId(p)}: ${p.status} → ${STATUS[p.status] || 'new'} · ${p.cargoProviderName || '-'} ${p.cargoTrackingNumber || ''}`.trim()).join('\n') };
    });
    return out;
  }

  const missing = ['PASAJ_URL', 'PASAJ_SELLER_ID', 'PASAJ_API_KEY', 'PASAJ_API_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'pasaj', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose,
  };
}
