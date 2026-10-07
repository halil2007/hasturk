// Trendyol Marketplace API (apigw.trendyol.com/integration).
// Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri: Satıcı ID, API Key, API Secret.
import { http, basic, num, str, chunk, diagStep, imageList } from '../util.js';

const BASE = 'https://apigw.trendyol.com/integration';

const STATUS = {
  Awaiting: 'new', Verified: 'new', Created: 'new', Picking: 'processing', Invoiced: 'processing', Repack: 'processing', UnPacked: 'processing',
  Shipped: 'shipped', AtCollectionPoint: 'shipped', UnDelivered: 'shipped', Delivered: 'delivered',
  Cancelled: 'cancelled', UnSupplied: 'cancelled', Returned: 'returned',
};
const RANKS = ['new', 'processing', 'shipped', 'delivered'];
const H3 = 3 * 3600e3, D = 864e5;
// Sipariş servisi: orderDate ve startDate/endDate "GMT+3" zaman damgasıdır (Türkiye saati UTC gibi yazılır; gerçek zamandan 3 saat ileride).
// Servis en fazla 2 haftalık aralık ve son 1 aylık veri verir (5 Mart 2026'dan beri). 15 Ekim 2026'dan itibaren yalnız v2/orders çalışır.
const MAX_BACK = 30 * D - 3600e3;
// Ödeme onayı bekleyen paketlerde (Awaiting / Verified) stok dışında işlem yapılmaz
const PAYMENT_WAIT = ['Awaiting', 'Verified'];
const MAX_STOCK = 20000;
// Trendyol kargo firmaları (getProviders). Kargo değişikliği yalnızca Created / Picking / Invoiced paketlerde, paket başına 5 dakikada bir.
export const TY_CARGO = [['TEXMP', 'Trendyol Express'], ['ARASMP', 'Aras Kargo'], ['YKMP', 'Yurtiçi Kargo'], ['SURATMP', 'Sürat Kargo'], ['PTTMP', 'PTT Kargo'],
  ['HOROZMP', 'Horoz Lojistik'], ['DHLECOMMP', 'DHL eCommerce'], ['CEVAMP', 'CEVA Lojistik'], ['KOLAYGELSINMP', 'Kolay Gelsin']];
const CHANGEABLE = ['Created', 'Picking', 'Invoiced'];
const VARIANT_ATTR = /beden|boyut|ebat|hacim|a[gğ][ıi]rl[ıi]k|renk|miktar|litre|kilo|gram|adet|paket|ölçü|olcu/i;

export function trendyol(env, meta) {
  const seller = env.TRENDYOL_SELLER_ID, key = env.TRENDYOL_API_KEY, secret = env.TRENDYOL_API_SECRET;
  // User-Agent: "SatıcıId - SelfIntegration"; aracı firma (entegratör) ile çalışılıyorsa "SatıcıId - FirmaAdı" (alfanumerik, en fazla 30 karakter)
  const integrator = str(env.TRENDYOL_INTEGRATOR).replace(/[^0-9A-Za-z]/g, '').slice(0, 30) || 'SelfIntegration';
  const headers = () => ({
    Authorization: basic(key, secret),
    'User-Agent': `${seller} - ${integrator}`,
    storeFrontCode: env.TRENDYOL_STOREFRONT || 'TR',
    'Content-Type': 'application/json',
  });
  const call = (path, opts = {}) => http(BASE + path, { ...opts, headers: headers(), body: opts.body && JSON.stringify(opts.body) });

  // Sipariş paketi alanları Nisan 2026'da yeniden adlandırıldı (id → shipmentPackageId, lines[].id → lineId, price → lineUnitPrice,
  // totalPrice → packageTotalPrice, merchantSku → stockCode); eski adlar yalnız yedek olarak okunur
  const pkgId = (p) => str(p.shipmentPackageId ?? p.id);
  const lineIdOf = (l) => str(l.lineId ?? l.id);
  const lineKind = (p, l) => {
    const s = String(l.orderLineItemStatusName || '');
    return /Cancel|UnSupplied/i.test(s) || STATUS[p.status] === 'cancelled' ? 'cancelled' : /Return/i.test(s) || STATUS[p.status] === 'returned' ? 'returned' : '';
  };
  const isLive = (p) => !['cancelled', 'returned'].includes(STATUS[p.status]);

  // Trendyol her paketi ayrı kayıt olarak verir; aynı sipariş numarasındaki paketler tek siparişte toplanır.
  // Bölünen (UnPacked) ya da kısmi iptalle bozulan paket (yeni paketlerin originPackageIds alanında geçer) yerini yeni paketlere
  // bırakır: yalnız güncel paketler sayılır (aynı ürün iki kez sayılmasın, tutar ikiye katlanmasın).
  function group(pkgs) {
    const byNo = new Map();
    for (const p of pkgs) {
      const no = String(p.orderNumber);
      if (!byNo.has(no)) byNo.set(no, new Map());
      const m = byNo.get(no), id = pkgId(p);
      if (!m.has(id)) m.set(id, p); // aynı paket iki sayfada / iki dilimde gelebilir: ilki (en güncel) kalır
    }
    return [...byNo.values()].map((m) => {
      let list = [...m.values()];
      const origins = new Set(list.flatMap((p) => [].concat(p.originPackageIds ?? []).flatMap((x) => String(x).split(','))).map((x) => x.trim()).filter(Boolean));
      const current = list.filter((p) => p.status !== 'UnPacked' && !origins.has(pkgId(p)));
      if (current.length) list = current;
      const p0 = list[0], a = p0.shipmentAddress || {};
      const live = list.filter(isLive);
      // Kalemler satır kimliğine göre: aynı satır birden çok pakete bölündüyse adetler toplanır; aynı satırın iptal / iade edilen
      // kısmı ayrı kalem olur (canlı paketler önce okunur)
      const items = [], byKey = new Map();
      for (const p of [...live, ...list.filter((x) => !isLive(x))]) for (const l of p.lines || []) {
        const lid = lineIdOf(l), st = lineKind(p, l), qty = num(l.quantity, 1);
        const first = byKey.get(lid), key = first && first.status !== st ? `${lid}-${st || 'acik'}` : lid;
        const ex = byKey.get(key);
        if (ex) { ex.quantity += qty; ex.total = Math.round(ex.unitPrice * ex.quantity * 100) / 100; continue; }
        const unit = num(l.lineUnitPrice ?? l.price ?? l.amount);
        const it = {
          lineId: key, sku: str(l.stockCode || l.merchantSku), barcode: str(l.barcode), name: str(l.productName), image: '',
          quantity: qty, unitPrice: unit, total: Math.round(unit * qty * 100) / 100, status: st, remoteKey: str(l.barcode),
        };
        byKey.set(key, it);
        items.push(it);
      }
      let status;
      if (!live.length) status = list.some((p) => STATUS[p.status] === 'returned') ? 'returned' : 'cancelled';
      else status = RANKS[Math.min(...live.map((p) => Math.max(0, RANKS.indexOf(STATUS[p.status] || 'new'))))];
      const tracked = list.find((p) => p.cargoTrackingNumber) || {};
      const sum = (ps) => ps.reduce((s, p) => s + num(p.packageTotalPrice ?? p.totalPrice ?? p.grossAmount), 0);
      return {
        // orderDate GMT+3 zaman damgasıdır: gerçek zamana çevrilir
        remoteId: String(p0.orderNumber), orderNumber: String(p0.orderNumber), orderedAt: num(p0.orderDate) ? num(p0.orderDate) - H3 : Date.now(),
        remoteStatus: list.map((p) => p.status).join(', '), status,
        customer: [p0.customerFirstName, p0.customerLastName].filter(Boolean).join(' ') || str(a.fullName), phone: str(a.phone), email: str(p0.customerEmail), customerId: str(p0.customerId),
        address: { name: str(a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ')), line: str(a.fullAddress || [a.address1, a.address2].filter(Boolean).join(' ')), district: str(a.district), city: str(a.city), phone: str(a.phone) },
        // Tutar: canlı paketlerin toplamı (iptal / iade edilen paketler düşülür); hepsi iptal / iadeyse tüm paketlerin toplamı
        total: Math.round(sum(live.length ? live : list) * 100) / 100, currency: p0.currencyCode || 'TRY',
        cargoCompany: str(tracked.cargoProviderName || p0.cargoProviderName), tracking: str(tracked.cargoTrackingNumber),
        awaitingPayment: list.every((p) => PAYMENT_WAIT.includes(p.status)),
        // Son kargoya teslim tarihi (agreedDeliveryDate): canlı paketlerin en erkeni
        shipBy: Math.min(...live.map((p) => num(p.agreedDeliveryDate)).filter((x) => x > 0)) || null,
        history: list.flatMap((p) => (p.packageHistories || []).map((h) => ({ status: h.status, at: num(h.createdDate) }))),
        items,
        packages: list.map((p) => ({
          remoteId: pkgId(p),
          items: (p.lines || []).map((l) => ({ line_id: lineIdOf(l), qty: num(l.quantity, 1) })),
          status: ['shipped', 'delivered'].includes(STATUS[p.status]) ? 'shipped' : STATUS[p.status] === 'cancelled' ? 'cancelled' : 'open',
          cargoCompany: str(p.cargoProviderName), tracking: str(p.cargoTrackingNumber), trackingUrl: str(p.cargoTrackingLink),
          remoteStatus: p.status,
        })).filter((x) => x.status !== 'cancelled'),
      };
    });
  }

  // Sipariş paketleri: v2/orders (eski /orders 15 Ekim 2026'da kapanıyor; o tarihe kadar günde 3 kez 10 dk 426 dönüyor).
  // v2 bu hesapta yoksa (404 / 405) bir kez eski adrese düşülür.
  let ordersPath = `/order/sellers/${seller}/v2/orders`;
  async function orders(query) {
    try { return await call(`${ordersPath}?${query}`); } catch (e) {
      if (!/\b(404|405)\b/.test(e.message) || !ordersPath.includes('/v2/')) throw e;
      ordersPath = `/order/sellers/${seller}/orders`;
      return call(`${ordersPath}?${query}`);
    }
  }
  async function fetchOrders(since, until) {
    // Trendyol en fazla 2 haftalık aralık ve son 1 aylık veri verir. Tarihler GMT+3 beklenir: bitiş 3 saat ileri alınır ki son 3 saatte
    // gelen siparişler de dönsün (başlangıç olduğu gibi kalır; aralık yalnız genişler). Dilim boyu bu 3 saat düşülerek 2 haftayı aşmaz.
    const out = [], floor = Date.now() - MAX_BACK;
    if (since < floor) { out.warnings = ['Trendyol sipariş servisi yalnız son 1 ayın siparişlerini veriyor; daha eski siparişler okunamadı']; since = floor; }
    const W = 14 * D - H3 - 60e3, pkgs = [];
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 0; page < 50; page++) {
        const r = await orders(`startDate=${from}&endDate=${to + H3}&page=${page}&size=200&orderByField=PackageLastModifiedDate&orderByDirection=DESC`);
        pkgs.push(...(r.content || []));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    }
    out.push(...group(pkgs));
    return out;
  }
  // Tek sipariş (sipariş numarasıyla; servis tarihsiz sorguda son 1 haftayı tarar, bu yüzden yalnız kargo değişikliği / tanılamada kullanılır)
  const orderPackages = async (no) => ((await orders(`orderNumber=${encodeURIComponent(no)}`)) || {}).content || [];

  // Ürünler: V2 "approved" servisi (V1 /products Trendyol tarafından kapatılıyor). Stok ayrı "inventory-and-price" servisinden gelir.
  // Sayfalama: size ≤ 100, page × size ≤ 10.000; daha fazlası için nextPageToken. V2 hata verirse V1'e düşülür.
  const listingOf = (p, v, stock) => {
    const attrs = [...(v.attributes || []), ...(p.attributes || [])].filter((a) => VARIANT_ATTR.test(a.attributeName || '')).map((a) => a.attributeValue || a.customAttributeValue).filter(Boolean);
    const price = v.price || {};
    return {
      remoteId: str(v.barcode), remoteProductId: str(p.productMainId || p.contentId || p.id), sku: str(v.stockCode), barcode: str(v.barcode), name: str(p.title),
      groupName: str(p.title), variantName: [...new Set(attrs)].join(' / '),
      image: str(((p.images || v.images || [])[0] || {}).url), images: imageList((v.images || []).length ? v.images : p.images), price: num(price.salePrice ?? v.salePrice), listPrice: num(price.listPrice ?? v.listPrice),
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

  // Stok / fiyat gönderimi: Trendyol isteği kabul edip toplu işlem kimliği döner; sonuç (satır bazında başarılı / reddedildi)
  // birkaç dakika sonra pushStatus ile sorgulanır (bkz. sync.js checkPushes)
  async function pushStock(items) {
    const refs = [];
    for (const part of chunk(items, 1000)) {
      // Trendyol bir ürüne en fazla 20.000 adet stok kabul eder; fazlası tüm isteği reddettirmesin diye sınıra çekilir
      const r = await call(`/inventory/sellers/${seller}/products/price-and-inventory`, { method: 'POST', body: { items: part.map((x) => ({ barcode: x.remoteId, quantity: Math.min(MAX_STOCK, Math.max(0, Math.round(num(x.stock)))) })) } });
      if (r && r.batchRequestId) refs.push(String(r.batchRequestId));
    }
    return { refs };
  }
  async function pushPrice(items) {
    const refs = [];
    for (const part of chunk(items, 1000)) {
      const r = await call(`/inventory/sellers/${seller}/products/price-and-inventory`, {
        method: 'POST', body: { items: part.map((x) => ({ barcode: x.remoteId, salePrice: x.price, listPrice: Math.max(x.listPrice || 0, x.price) })) },
      });
      if (r && r.batchRequestId) refs.push(String(r.batchRequestId));
    }
    return { refs };
  }
  const pushStatus = (ref) => status(ref);

  const openPkgs = (order) => order.packages.filter((p) => p.remote_id && p.status === 'open');
  const linesOf = (pkg) => pkg.items.map((x) => ({ lineId: Number(x.line_id), quantity: x.qty }));

  // Statü bildirimi sırası: önce Picking, sonra Invoiced. Ödeme bekleyen (Awaiting) pakete işlem yapılmaz; kargodaki / teslim edilen
  // pakete statü gönderilmez (Trendyol reddeder).
  const noPayment = (p) => { if (PAYMENT_WAIT.includes(p.remote_status)) throw new Error('Trendyol bu paketin ödeme onayını bekliyor (Awaiting); paket "Yeni" olana kadar işlem yapılamaz'); };
  const putStatus = (p, status, params = {}) => call(`/order/sellers/${seller}/shipment-packages/${p.remote_id}`, { method: 'PUT', body: { lines: linesOf(p), params, status } });

  // İşleme al = paketleri "Picking" (hazırlanıyor) yap; müşteri siparişin hazırlandığını görür
  async function accept(order) {
    for (const p of openPkgs(order)) {
      if (p.remote_status && p.remote_status !== 'Created') continue;
      await putStatus(p, 'Picking');
    }
  }

  // Paket bölme: Trendyol yeni paketleri birkaç dakika içinde oluşturur (bir sonraki senkronda panelde görünür)
  async function split(order, groups) {
    const src = openPkgs(order);
    if (src.length !== 1) throw new Error('Trendyol\'da sadece tek paketli, henüz kargolanmamış sipariş bölünebilir');
    noPayment(src[0]);
    await call(`/order/sellers/${seller}/shipment-packages/${src[0].remote_id}/split-packages`, {
      method: 'POST',
      body: { splitPackages: groups.map((g) => ({ packageDetails: g.items.map((x) => ({ orderLineId: Number(x.line_id), quantities: x.qty })) })) },
    });
    return { async: true, message: 'Bölme isteği Trendyol\'a gönderildi. Yeni paketler birkaç dakika içinde oluşur ve senkronla panele gelir.' };
  }

  async function ship(order, pkg, { invoiceNumber } = {}) {
    if (!pkg.remote_id) throw new Error('Paket Trendyol\'da henüz oluşmadı; senkronu bekleyin');
    noPayment(pkg);
    if (invoiceNumber && (!pkg.remote_status || ['Created', 'Picking'].includes(pkg.remote_status))) {
      if (!pkg.remote_status || pkg.remote_status === 'Created') await putStatus(pkg, 'Picking');
      await putStatus(pkg, 'Invoiced', { invoiceNumber });
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
      noPayment(p);
      if (p.remote_status && !CHANGEABLE.includes(p.remote_status)) { out.push({ remoteId: p.remote_id, remoteStatus: p.remote_status }); continue; } // kargoda / teslim: dokunulmaz
      if (!p.remote_status || p.remote_status === 'Created') await putStatus(p, 'Picking');
      if (invoiceNumber && p.remote_status !== 'Invoiced') await putStatus(p, 'Invoiced', { invoiceNumber });
      out.push({ remoteId: p.remote_id, remoteStatus: invoiceNumber ? 'Invoiced' : p.remote_status === 'Invoiced' ? 'Invoiced' : 'Picking' });
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
    const p = (await orderPackages(order.remote_id).catch(() => [])).find((x) => pkgId(x) === String(pkg.remote_id));
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
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const r = await orders(`startDate=${now - 864e5}&endDate=${now + H3}&page=0&size=1`); return { detail: `${r.totalElements ?? (r.content || []).length} paket · satıcı ${seller}` }; });
    let bc = '';
    await diagStep(out, 'Ürünler (V2 onaylı ürün servisi)', async () => { const r = await call(`/product/sellers/${seller}/products/approved?page=0&size=1`); bc = str((((r.content || [])[0] || {}).variants || [])[0]?.barcode); return { detail: `${r.totalElements ?? '?'} ürün` }; });
    await diagStep(out, 'Stok / fiyat servisi', async () => { const r = await call(`/product/sellers/${seller}/products/approved/inventory-and-price?page=0&size=1`); return { detail: `erişildi · ${r.totalElements ?? (r.content || []).length} ürün` }; });
    await diagStep(out, 'Buybox servisi', async () => {
      if (!bc) return { ok: null, detail: 'Ürün yok, denenemedi' };
      const [b] = await buybox([bc]);
      if (!b) return { ok: false, detail: `${bc}: buybox yanıtı okunamadı` };
      return { detail: `${bc}: buybox sırası ${b.rank ?? '?'} · buybox fiyatı ${b.buyboxPrice ?? 'yok'}${b.multi ? ` · 2. satıcı ${b.second ?? '?'}` : ' · tek satıcı'}` };
    });
    await diagStep(out, 'Müşteri soruları', async () => { const r = await questions({ since: now - 7 * 864e5, page: 0, size: 1 }); return { detail: `son 7 günde ${r.total ?? r.items.length} soru` }; });
    if (orderId) await diagStep(out, 'Sipariş paketleri', async () => {
      const ps = await orderPackages(orderId);
      return { ok: ps.length ? true : false, detail: ps.map((p) => `Paket ${pkgId(p)}: ${p.status} · ${p.cargoProviderName || '-'} · takip ${p.cargoTrackingNumber || '-'}${p.agreedDeliveryDate ? ` · son teslim ${new Date(p.agreedDeliveryDate).toISOString().slice(0, 16).replace('T', ' ')}` : ''}`).join('\n') || 'Trendyol bu sipariş numarasını bulamadı' };
    });
    return out;
  }

  // ---------- Ürün yükleme (Ürün yükle ekranı) ----------
  // Kategori ağacı: /product/product-categories · özellikler (değerleriyle): /product/product-categories/{id}/attributes
  // Marka kimliği: /product/brands/by-name · ürün oluşturma: v2/products (yoksa v1) → batchRequestId · durum: batch-requests/{id}
  let catCache = null;
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) {
      const all = [];
      const walk = (list, path) => { for (const c of list || []) { const p = path.concat(c.name); if ((c.subCategories || []).length) walk(c.subCategories, p); else all.push({ id: String(c.id), name: str(c.name), path: path.join(' › ') }); } };
      walk((await call('/product/product-categories')).categories, []);
      catCache = { at: Date.now(), all };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  // Özellikler: /product/categories/{id}/attributes (değer listesi bazen boş gelir; o zaman .../attributes/{attr}/values sayfalı okunur)
  const attrCache = new Map(), valCache = new Map();
  async function rawAttrs(cat) {
    if (!attrCache.has(cat)) {
      let r;
      try { r = await call(`/product/categories/${encodeURIComponent(cat)}/attributes`); }
      catch (e) { if (!/\b(404|405)\b/.test(e.message)) throw e; r = await call(`/product/product-categories/${encodeURIComponent(cat)}/attributes`); }
      attrCache.set(cat, Array.isArray(r) ? r : r.categoryAttributes || r.attributes || []);
    }
    return attrCache.get(cat);
  }
  const attrId = (a) => String((a.attribute && a.attribute.id) ?? a.id);
  const attrName = (a) => str((a.attribute && a.attribute.name) ?? a.name);
  const attributes = async (cat) => (await rawAttrs(cat)).map((a) => ({ id: attrId(a), name: attrName(a), mandatory: !!a.required,
    kind: a.varianter ? 'variant' : 'category', type: a.allowCustom && !(a.attributeValues || []).length ? 'text' : 'enum', custom: !!a.allowCustom, multi: !!a.allowMultipleAttributeValues }));
  async function values(cat, attr) {
    const a = (await rawAttrs(cat)).find((x) => attrId(x) === String(attr));
    if (a && (a.attributeValues || []).length) return a.attributeValues.map((v) => ({ id: String(v.id), value: str(v.name) }));
    const k = cat + ':' + attr;
    if (!valCache.has(k)) {
      const out = [];
      for (let page = 0; page < 20; page++) {
        const r = await call(`/product/categories/${encodeURIComponent(cat)}/attributes/${encodeURIComponent(attr)}/values?page=${page}&size=1000`);
        out.push(...(r.content || []).map((v) => ({ id: String(v.attributeValueId ?? v.id), value: str(v.attributeValue ?? v.attributeValueName ?? v.name) })));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
      valCache.set(k, out);
    }
    return valCache.get(k);
  }
  const brands = new Map();
  async function brandId(name) {
    const k = str(name).toLocaleLowerCase('tr');
    if (!k) return null;
    if (!brands.has(k)) {
      const r = await call(`/product/brands/by-name?name=${encodeURIComponent(name)}`);
      const list = Array.isArray(r) ? r : r.brands || [];
      brands.set(k, (list.find((b) => str(b.name).toLocaleLowerCase('tr') === k) || {}).id || null);
    }
    return brands.get(k);
  }
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], attrs = [];
    for (const a of await rawAttrs(map.remote_id)) {
      const id = attrId(a), v = (map.attrs || {})[id];
      let valueId = v && v.id, text = v && v.value;
      if (text === '@variant') { const hit = pr.variant ? await pick({ id }, pr.variant) : null; valueId = hit && hit.id; text = hit ? '' : pr.variant; }
      if (text === '@image') text = pr.image;
      // V2 biçimi: listeden değer → attributeValueIds, serbest metin (izin varsa) → attributeValue
      if (valueId) attrs.push({ attributeId: Number(id), attributeValueIds: [Number(valueId)] });
      else if (text && a.allowCustom) attrs.push({ attributeId: Number(id), attributeValue: String(text) });
      else if (a.required) missing.push(attrName(a) + (text ? ` (“${text}” listede yok)` : ''));
    }
    const bid = pr.brand ? await brandId(pr.brand) : null;
    if (!pr.brand) missing.push('marka'); else if (!bid) missing.push(`marka “${pr.brand}” Trendyol'da bulunamadı`);
    if (!pr.barcode) missing.push('barkod');
    if (!pr.image) missing.push('görsel');
    if (!(pr.price > 0)) missing.push('fiyat');
    const item = {
      barcode: pr.barcode, title: str(pr.name).slice(0, 100), productMainId: str(pr.group).slice(0, 40), brandId: bid, categoryId: Number(map.remote_id),
      quantity: pr.stock, stockCode: pr.sku, dimensionalWeight: pr.desi || 1, description: pr.description || pr.name, currencyType: 'TRY',
      listPrice: Math.max(pr.listPrice || 0, pr.price), salePrice: pr.price, vatRate: pr.vat ?? 20,
      images: [pr.image, ...(pr.images || []).slice(1, 8)].filter(Boolean).map((url) => ({ url })), attributes: attrs,
    };
    if (opts.cargoCompanyId) item.cargoCompanyId = Number(opts.cargoCompanyId);
    return { key: pr.barcode, missing, payload: item };
  }
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 1000)) {
      let r;
      try { r = await call(`/product/sellers/${seller}/v2/products`, { method: 'POST', body: { items: part } }); }
      catch (e) {
        if (!/\b(404|405)\b/.test(e.message)) throw e;
        // V2 yoksa V1: özellik biçimi attributeValueId / customAttributeValue
        const v1 = part.map((x) => ({ ...x, attributes: x.attributes.map((a) => (a.attributeValueIds ? { attributeId: a.attributeId, attributeValueId: a.attributeValueIds[0] } : { attributeId: a.attributeId, customAttributeValue: a.attributeValue })) }));
        r = await call(`/product/sellers/${seller}/products`, { method: 'POST', body: { items: v1 } });
      }
      if (!r.batchRequestId) throw new Error('Trendyol batchRequestId döndürmedi: ' + JSON.stringify(r).slice(0, 300));
      refs.push(r.batchRequestId);
    }
    return { ref: refs.join(',') };
  }
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const id of String(ref).split(',').filter(Boolean)) {
      const r = await call(`/product/sellers/${seller}/products/batch-requests/${encodeURIComponent(id)}`);
      // Stok / fiyat toplu işleminde genel "status" alanı dönmez: kalemlerin hepsi SUCCESS / FAILED olunca tamamlanmış sayılır
      const its = r.items || [];
      if (r.status ? !/COMPLETED|DONE|FAILED/i.test(r.status) : !its.length || its.some((it) => !/SUCCESS|FAIL/i.test(str(it.status))) || num(r.itemCount) > its.length) pending = true;
      for (const it of its) {
        const req = it.requestItem || {}, st = str(it.status);
        items.push({ key: str(req.barcode || (req.product && req.product.barcode)), status: st, ok: /SUCCESS/i.test(st) ? true : /FAIL/i.test(st) ? false : null, error: (it.failureReasons || []).map((x) => (typeof x === 'string' ? x : x.message || JSON.stringify(x))).join(' · ') });
      }
    }
    return { done: !pending, items };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const catalog = { categories, allCategories, attributes, values, build, send, status, chunk: 1000, options: [{ k: 'cargoCompanyId', label: 'Kargo firması ID (isteğe bağlı)' }] };

  // ---------- kargo gideri (gerçek) ----------
  // Cari hesap ekstresindeki kesinti faturalarından (DeductionInvoices) kargo faturaları bulunur; her kargo faturasının kalemleri
  // sipariş numarası ve kargo tutarını verir. Finans servisi en fazla 15 günlük aralık kabul eder.
  async function cargoCosts(since, until) {
    const W = 14 * 864e5, invoices = new Set(), byOrder = new Map();
    for (let from = since; from < until; from += W) {
      const to = Math.min(until, from + W);
      for (let page = 0; page < 20; page++) {
        const r = await call(`/finance/che/sellers/${seller}/otherfinancials?transactionType=DeductionInvoices&startDate=${from}&endDate=${to}&page=${page}&size=500`);
        for (const x of r.content || []) if (/kargo|cargo/i.test(`${x.transactionType || ''} ${x.description || ''}`) && x.id) invoices.add(String(x.id));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    }
    for (const id of invoices) {
      for (let page = 0; page < 50; page++) {
        const r = await call(`/finance/che/sellers/${seller}/cargo-invoice/${encodeURIComponent(id)}/items?page=${page}&size=500`);
        for (const it of r.content || []) if (it.orderNumber && num(it.amount)) byOrder.set(String(it.orderNumber), (byOrder.get(String(it.orderNumber)) || 0) + num(it.amount));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    }
    return { invoices: invoices.size, items: [...byOrder].map(([orderNumber, amount]) => ({ orderNumber, amount: Math.round(amount * 100) / 100 })) };
  }

  // ---------- iade talepleri (claims) ----------
  // Her ürün adedi ayrı bir talep kalemi (claimItem); aynı satır + durum + gerekçe tek satırda toplanır (ids: kalem kimlikleri).
  // Yalnız "WaitingInAction" (aksiyon bekliyor) kalemler onaylanır / reddedilir. Ret: claim issue (multipart; belge eklenebilir).
  const CST = { WaitingInAction: 'waiting', Accepted: 'accepted', Rejected: 'rejected', Created: 'other', WaitingFraudCheck: 'other', Unresolved: 'other', Cancelled: 'other', InAnalysis: 'other' };
  const CST_TR = { WaitingInAction: 'Aksiyon bekliyor', Accepted: 'Onaylandı', Rejected: 'Reddedildi', Created: 'Oluşturuldu (kargo yolda)', WaitingFraudCheck: 'Kontrol ediliyor', Unresolved: 'Anlaşmazlık', Cancelled: 'İptal', InAnalysis: 'Trendyol inceliyor' };
  async function claims({ since, until = Date.now(), page = 0, size = 50 }) {
    const r = await call(`/order/sellers/${seller}/claims?startDate=${since}&endDate=${until}&page=${page}&size=${Math.min(200, size)}`);
    const items = (r.content || []).map((c) => {
      const by = new Map();
      for (const it of c.items || []) {
        const ol = it.orderLine || {};
        for (const ci of it.claimItems || []) {
          const st = (ci.claimItemStatus && ci.claimItemStatus.name) || '', why = (ci.customerClaimItemReason && ci.customerClaimItemReason.name) || '';
          const k = `${ol.id}|${st}|${why}`;
          const l = by.get(k) || { id: String(ci.id), ids: [], name: str(ol.productName), barcode: str(ol.barcode), sku: str(ol.merchantSku), qty: 0, price: num(ol.price), reason: why, note: str(ci.customerNote || ci.note), status: CST[st] || 'other', remoteStatus: CST_TR[st] || st };
          l.ids.push(String(ci.id)); l.qty++;
          by.set(k, l);
        }
      }
      const lines = [...by.values()];
      const status = lines.some((l) => l.status === 'waiting') ? 'waiting' : lines.length && lines.every((l) => l.status === 'accepted') ? 'accepted' : lines.some((l) => l.status === 'rejected') ? 'rejected' : 'other';
      return {
        remoteId: str(c.claimId ?? c.id), orderNumber: str(c.orderNumber), claimedAt: num(c.claimDate) || Date.now(), status, remoteStatus: [...new Set(lines.map((l) => l.remoteStatus))].join(', '),
        customer: [c.customerFirstName, c.customerLastName].filter(Boolean).join(' '), reason: [...new Set(lines.map((l) => l.reason).filter(Boolean))].join(', '),
        note: lines.map((l) => l.note).filter(Boolean).join(' · '), lines, amount: lines.reduce((x, l) => x + l.price * l.qty, 0), cargo: str(c.cargoProviderName), tracking: str(c.cargoTrackingNumber),
      };
    });
    return { items, hasNext: page + 1 < num(r.totalPages) };
  }
  const claimIds = (lines) => lines.flatMap((l) => l.ids || [l.id]).map(String);
  async function approveClaim(c, lines) {
    await call(`/order/sellers/${seller}/claims/${encodeURIComponent(c.remote_id)}/items/approve`, { method: 'PUT', body: { claimLineItemIdList: claimIds(lines), params: {} } });
  }
  // Ret talebi (createClaimIssue): gerekçe, kalemler ve açıklama sorgu parametresi olarak; ek dosya multipart "files" alanında
  async function rejectClaim(c, lines, { reasonId, text, file }) {
    const q = new URLSearchParams({ claimIssueReasonId: String(reasonId), claimItemIdList: claimIds(lines).join(','), description: String(text).slice(0, 500) });
    const fd = new FormData();
    if (file) fd.append('files', file, file.name);
    const h = headers(); delete h['Content-Type'];
    await http(`${BASE}/order/sellers/${seller}/claims/${encodeURIComponent(c.remote_id)}/issue?${q}`, { method: 'POST', headers: h, body: fd });
  }
  // Ret gerekçeleri Trendyol'da değişebiliyor (ör. 8 Ekim 2026'da bazıları kaldırıldı): 6 saatte bir yeniden okunur
  let reasonCache = null;
  async function claimReasons() {
    if (!reasonCache || Date.now() - reasonCache.at > 6 * 3600e3) reasonCache = { at: Date.now(), list: ((await call('/order/claim-issue-reasons')) || []).map((x) => ({ id: String(x.id), name: str(x.name) })) };
    return reasonCache.list;
  }

  // ---------- hakediş (cari hesap ekstresi: settlements) ----------
  // Satış, iade, indirim, kupon ve komisyon düzeltmeleri; her kaydın satıcı hakedişi (sellerRevenue) ve ödeme tarihi.
  // Önce tüm türler tek istekte (transactionTypes) denenir; servis kabul etmezse tür tür okunur. En fazla 15 günlük aralık.
  const ST_TYPES = { Sale: 'Satış', Return: 'İade', Discount: 'İndirim', DiscountCancel: 'İndirim iptali', Coupon: 'Kupon', CouponCancel: 'Kupon iptali', SellerRevenuePositive: 'Hakediş düzeltme (+)', SellerRevenueNegative: 'Hakediş düzeltme (−)',
    CommissionPositive: 'Komisyon düzeltme (+)', CommissionNegative: 'Komisyon düzeltme (−)', ManualRefund: 'Manuel iade', ProvisionPositive: 'Provizyon (+)', ProvisionNegative: 'Provizyon (−)', DeliveryFee: 'Teslimat bedeli',
    // İptal kayıtları (iade / iptal sonrası ters kayıt): okunmazsa düzeltme ve teslimat bedelleri iki kez sayılır
    ManualRefundCancel: 'Manuel iade iptali', DeliveryFeeCancel: 'Teslimat bedeli iptali', SellerRevenuePositiveCancel: 'Hakediş düzeltme (+) iptali', SellerRevenueNegativeCancel: 'Hakediş düzeltme (−) iptali',
    CommissionPositiveCancel: 'Komisyon düzeltme (+) iptali', CommissionNegativeCancel: 'Komisyon düzeltme (−) iptali' };
  async function settlements(since, until) {
    const W = 14 * 864e5, out = [];
    const row = (x) => {
      const sign = num(x.debt) > 0 && !num(x.credit) ? -1 : 1, rev = Math.abs(num(x.sellerRevenue ?? (num(x.credit) - num(x.debt))));
      return { remoteId: String(x.id), date: num(x.transactionDate), type: ST_TYPES[x.transactionType] || str(x.transactionType), orderNumber: str(x.orderNumber), amount: Math.round(sign * rev * 100) / 100,
        commission: Math.round(sign * Math.abs(num(x.commissionAmount)) * 100) / 100, paymentDate: num(x.paymentDate) || null, dueDate: num(x.paymentDate) || null, paid: !!x.paymentOrderId, paymentId: str(x.paymentOrderId) };
    };
    const read = async (q, from, to) => {
      for (let page = 0; page < 40; page++) {
        const r = await call(`/finance/che/sellers/${seller}/settlements?${q}&startDate=${from}&endDate=${to}&page=${page}&size=1000`);
        out.push(...(r.content || []).map(row));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    };
    let joint = true;
    for (let from = since; from < until; from += W) {
      const to = Math.min(until, from + W);
      if (joint) { try { await read(`transactionTypes=${Object.keys(ST_TYPES).join(',')}`, from, to); continue; } catch (e) { if (!/HTTP (400|422|500)/.test(e.message)) throw e; joint = false; } }
      for (const t of Object.keys(ST_TYPES)) await read(`transactionType=${t}`, from, to);
    }
    return [...new Map(out.map((x) => [x.remoteId, x])).values()];
  }

  // ---------- kesilen faturalar / kesintiler (cari hesap ekstresi: otherfinancials) ----------
  // Kesinti faturaları (kargo, platform hizmet bedeli, reklam, komisyon ...), stopaj, komisyon sözleşme faturaları ve iade faturaları.
  // Servis en fazla 15 günlük aralık kabul eder; PDF bağlantısı vermez (fatura no / açıklama ile Trendyol panelinden indirilir).
  const INV = { DeductionInvoices: null, Stoppage: 'Stopaj', CommissionAgreementInvoice: 'Komisyon', ReturnInvoice: 'İade faturası' };
  const invType = (x) => {
    const t = `${x.transactionType || ''} ${x.description || ''}`;
    if (/kargo|cargo/i.test(t)) return 'Kargo';
    if (/hizmet bedeli|platform|service/i.test(t)) return 'Hizmet bedeli';
    if (/reklam|ads|advert|influencer|sponsor/i.test(t)) return 'Reklam / pazarlama';
    if (/komisyon|commission/i.test(t)) return 'Komisyon';
    if (/stopaj|stoppage/i.test(t)) return 'Stopaj';
    if (/ceza|penalt|gecik/i.test(t)) return 'Ceza';
    return 'Diğer kesinti';
  };
  async function invoices(since, until) {
    const W = 14 * 864e5, out = [];
    for (const [tt, fixed] of Object.entries(INV)) {
      for (let from = since; from < until; from += W) {
        const to = Math.min(until, from + W);
        for (let page = 0; page < 40; page++) {
          const r = await call(`/finance/che/sellers/${seller}/otherfinancials?transactionType=${tt}&startDate=${from}&endDate=${to}&page=${page}&size=500`);
          for (const x of r.content || []) {
            const amount = num(x.debt) - num(x.credit);
            if (!amount) continue;
            out.push({ remoteId: `${tt}:${x.id}`, no: str(x.id), date: num(x.transactionDate) || from, type: fixed || invType(x), description: [x.transactionType, x.description].filter(Boolean).join(' · '),
              amount: Math.round(amount * 100) / 100, orderNumber: str(x.orderNumber), url: '' });
          }
          if (page + 1 >= (r.totalPages || 1)) break;
        }
      }
    }
    return out;
  }

  const missing = ['TRENDYOL_SELLER_ID', 'TRENDYOL_API_KEY', 'TRENDYOL_API_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'trendyol', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'remote-async', pack: 'status', ship: 'remote', label: 'remote', cargo: 'change', createProduct: false, price: true, answer: { min: 10, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, pushStatus, accept, split, ship, label, pack, cargoOptions, changeCargo, buybox, questions, answer, diagnose, catalog, cargoCosts, invoices, settlements, claims, claimReasons, approveClaim, rejectClaim,
  };
}
