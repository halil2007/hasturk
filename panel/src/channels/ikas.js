// ikas (GraphQL Admin API). Her ikas mağazası için bir özel uygulama gerekir:
// ikas paneli → Uygulamalar → Özel uygulama → izinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma).
// Kargo (ikas Kargo): gönderi ikas'taki "ikas Kargo ile Paketle ve Gönder" uygulamasıyla açılır (genel API'de yok);
// ikas Kargo paketi oluşturup barkod ve etiket görselini paketin trackingInfo alanına yazar, panel oradan okur ve yazdırır.
// Şema kaynağı: ikas'ın resmi @ikas/admin-api-client paketi (FulFillOrderInput, UpdateOrderPackageStatusInput, TrackingInfo…).
import { http, num, str, labelFrom, sleep, brandKey } from '../util.js';

const API = 'https://api.myikas.com/api/v1/admin/graphql';
// Müşterinin ödeme sayfasında seçtiği kargo SEÇENEĞİNİN adı → ikas Kargo ekranında seçilecek firma (seçenek bir bağlantı değildir)
const CARRIERS = [[/hepsi\s*jet/i, 'hepsiJET'], [/aras/i, 'Aras Kargo'], [/yurt\s*i?[çc]i/i, 'Yurtiçi Kargo'], [/dhl/i, 'DHL eCommerce'], [/ptt/i, 'PTT Kargo'],
  [/s[üu]rat/i, 'Sürat Kargo'], [/mng/i, 'MNG Kargo'], [/trendyol\s*express/i, 'Trendyol Express'], [/kolay\s*gelsin/i, 'Kolay Gelsin'], [/\bups\b/i, 'UPS Kargo'], [/sendeo/i, 'Sendeo']];
export const ikasCarrier = (choice) => { const c = CARRIERS.find(([re]) => re.test(String(choice || ''))); return c ? c[1] : ''; };

export function ikas(env, p, meta) {
  // Mağaza adı "hasturkgubre", "hasturkgubre.myikas.com" ya da "https://hasturkgubre.myikas.com/admin" yazılmış olabilir: yalnız ad alınır
  const store0 = String(env[p + 'STORE'] || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.myikas\.com$/i, '');
  // Mağaza adı yalnız harf, rakam, tire: başka bir sunucuya (ve API anahtarının oraya) yönlenmesin
  const store = /^[a-z0-9-]+$/i.test(store0) ? store0 : '';
  const id = env[p + 'CLIENT_ID'], secret = env[p + 'CLIENT_SECRET'];
  const salesChannel = env[p + 'SALES_CHANNEL_ID'] || '';
  let merchant = env[p + 'MERCHANT_ID'] || '', merchantTried = false;
  let token = null, tokenScope = '', tokenExp = 0, locationId = env[p + 'STOCK_LOCATION_ID'] || '';

  async function auth() {
    if (token && Date.now() < tokenExp) return token;
    const r = await http(`https://${store}.myikas.com/api/admin/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
    });
    if (!r || !r.access_token) throw new Error('ikas token alınamadı');
    token = r.access_token;
    tokenScope = String(r.scope || '');
    tokenExp = Date.now() + Math.max(60, (r.expires_in || 3600) - 120) * 1000;
    return token;
  }

  // ikas istek sınırı (ör. 50 istek / pencere; aşılırsa HTTP 429 + retryAfter): istekler arka arkaya en az GAP ms aralıkla gider,
  // 429 gelirse ikas'ın bildirdiği süre kadar beklenip aynı istek yeniden denenir (en çok 6 kez). Önceden 429 tüm stok gönderimini düşürüyordu.
  const GAP = 220;
  let nextAt = 0;
  async function gql(query, variables = {}) {
    for (let i = 0; ; i++) {
      const wait = nextAt - Date.now();
      if (wait > 0) await sleep(wait);
      nextAt = Date.now() + GAP;
      let r;
      try {
        r = await http(API, {
          method: 'POST', tries: 1,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth()}` },
          body: JSON.stringify({ query, variables }),
        });
      } catch (e) {
        if (e.status === 429 && i < 6) {
          const m = /"retryAfter"\s*:\s*([\d.]+)/.exec(e.message || '');
          nextAt = Date.now() + Math.min(30e3, Math.max(1000, (m ? Number(m[1]) : 2) * 1000 + 300));
          continue;
        }
        throw e;
      }
      if (r.errors) { const e = new Error('ikas: ' + r.errors.map((x) => x.message).join(' | ')); e.gql = true; throw e; }
      return r.data;
    }
  }

  // Şemada olmayan isteğe bağlı alan hata verirse o alanı çıkarıp tekrar dener (ikas sürüm farklarına dayanıklı)
  async function flex(build, optional, variables) {
    const active = { ...optional };
    for (;;) {
      try { return await gql(build(active), variables); } catch (e) {
        const msg = e.message.toLowerCase();
        // Şemada olmayan alt alan (ör. eski sürümde trackingInfo.shippingLabelImage): sadece o alan çıkarılır
        const f = e.gql && /cannot query field "(\w+)"(?: on type "(\w+)")?/i.exec(e.message);
        if (f && (!f[2] || f[2] === 'Order') && active[f[1]]) { active[f[1]] = ''; continue; }
        if (f) {
          const re = new RegExp(`\\s${f[1]}(\\s*\\{[^{}]*\\})?(?=[\\s}])`);
          const k = Object.keys(active).find((x) => active[x] && active[x] !== f[1] && re.test(' ' + active[x] + ' '));
          if (k) { active[k] = (' ' + active[k] + ' ').replace(re, '').trim(); continue; }
        }
        const bad = Object.keys(active).sort((a, b) => b.length - a.length).find((k) => active[k] && msg.includes(k.toLowerCase()));
        if (!e.gql || !bad) throw e;
        active[bad] = '';
      }
    }
  }

  const PKG_FIELDS = 'id orderPackageNumber orderLineItemIds orderPackageFulfillStatus errorMessage appId updatedAt trackingInfo { cargoCompany cargoCompanyId trackingNumber trackingLink barcode shippingLabelImage }';
  const ORDER_OPT = {
    salesChannelId: 'salesChannelId',
    orderPackageStatus: 'orderPackageStatus',
    orderPaymentStatus: 'orderPaymentStatus',
    customer: 'customer { id firstName lastName email phone isGuestCheckout }',
    billingAddress: 'billingAddress { phone }',
    shippingAddress: 'shippingAddress { firstName lastName phone addressLine1 addressLine2 city { name } district { name } }',
    barcodeList: 'barcodeList',
    mainImageId: 'mainImageId',
    shippingLines: 'shippingLines { cargoCompanyId title }',
    cancelledAt: 'cancelledAt',
    updatedAt: 'updatedAt',
    orderPackages: `orderPackages { ${PKG_FIELDS} }`,
    paymentMethods: 'paymentMethods { type }',
  };
  // sort: "updatedAt" (eskiden yeniye): aralık tek senkronda bitmezse imleç okunan son güncellemeden devam eder
  const orderQuery = (o, filter, sort) => `query ($p: PaginationInput, $d: ${filter === 'id' ? 'StringFilterInput' : 'DateFilterInput'}) {
    listOrder(pagination: $p, ${filter}: $d${sort ? `, sort: "${sort}"` : ''}) { hasNext data {
      id orderNumber orderedAt status totalFinalPrice currencyCode ${o.salesChannelId} ${o.orderPackageStatus} ${o.orderPaymentStatus} ${o.cancelledAt} ${o.updatedAt} ${o.shippingLines} ${o.paymentMethods}
      ${o.customer} ${o.shippingAddress} ${o.billingAddress}
      orderLineItems { id quantity price finalPrice status variant { id productId sku name ${o.barcodeList} ${o.mainImageId} } }
      ${o.orderPackages}
    } }
  }`;

  // Paket / satır durumları (ikas OrderPackageStatusEnum, OrderLineItemStatusEnum):
  //  · iptal: CANCELLED · iade kesinleşti: REFUNDED, REFUND_REQUEST_ACCEPTED ve onay sonrası iade kargosu (RETURN_PARCEL_WAITING,
  //    RETURN_IN_TRANSIT, RETURN_DELIVERED) · teslim edilmiş ama iade talebi açık / reddedildi: REFUND_REQUESTED, REFUND_REJECTED,
  //    RETURN_REJECTED (ürün müşteride: teslim edildi) · CANCEL_REQUESTED / CANCEL_REJECTED: talep ya da reddedilen talep, sipariş sürüyor.
  const RETURNED = /^(REFUNDED|REFUND_REQUEST_ACCEPTED|RETURN_PARCEL_WAITING|RETURN_IN_TRANSIT|RETURN_DELIVERED)$/;
  const AFTER_DELIVERY = /^(DELIVERED|REFUND_REQUESTED|REFUND_REJECTED|RETURN_REJECTED)$/;
  // Kısmi durumda (PARTIALLY_*) sipariş durumu canlı satırlardan: hepsi teslim → teslim, hepsi kargoda / teslim → kargoda,
  // aksi halde hazırlanıyor (satır durumlarında "kargoya hazır" yok; kısmi durum bir işlem yapıldığını gösterir)
  function fromLines(lines) {
    const st = (lines || []).map((l) => String(l.status || '').toUpperCase()).filter(Boolean);
    const live = st.filter((x) => x !== 'CANCELLED' && !RETURNED.test(x));
    if (!st.length) return 'processing';
    if (!live.length) return st.some((x) => RETURNED.test(x)) ? 'returned' : 'cancelled';
    if (live.every((x) => AFTER_DELIVERY.test(x))) return 'delivered';
    if (live.every((x) => x === 'FULFILLED' || AFTER_DELIVERY.test(x))) return 'shipped';
    return 'processing';
  }
  function mapStatus(o) {
    const s = String(o.status || '').toUpperCase(), ps = String(o.orderPackageStatus || '').toUpperCase();
    // CANCEL_REJECTED / REFUND_REJECTED: talep reddedildi, sipariş sürüyor. *_REQUESTED: yalnız talep (karar verilmedi).
    // PARTIALLY_REFUNDED: siparişin bir kısmı iade — iade edilen satırlar ayrıca işaretlenir, sipariş tamamı iade sayılmaz.
    if (s === 'CANCELLED' || ps === 'CANCELLED') return 'cancelled';
    if (s === 'REFUNDED' || RETURNED.test(ps)) return 'returned';
    if (AFTER_DELIVERY.test(ps)) return 'delivered';
    if (/^PARTIALLY_/.test(ps)) return fromLines(o.orderLineItems);
    if (/^(FULFILLED|UNABLE_TO_DELIVER)$/.test(ps)) return 'shipped';
    if (/^(READY_FOR_SHIPMENT|READY_FOR_PICK_UP)$/.test(ps)) return 'processing';
    return 'new';
  }

  // Satır durumu: yalnız kesinleşen iptal / iade (talep ya da reddedilen talep satırı canlı bırakır)
  const lineStatus = (v) => { const x = String(v || '').toUpperCase(); return x === 'CANCELLED' ? 'cancelled' : RETURNED.test(x) ? 'returned' : ''; };
  function normOrder(o) {
    const a = o.shippingAddress || {}, c = o.customer || {};
    const items = (o.orderLineItems || []).map((li) => {
      const v = li.variant || {};
      const unit = num(li.finalPrice ?? li.price);
      return {
        lineId: String(li.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]), name: str(v.name),
        image: v.mainImageId ? imgUrl({ imageId: v.mainImageId, fileName: 'image' }) : '',
        quantity: num(li.quantity, 1), unitPrice: unit, total: unit * num(li.quantity, 1),
        status: lineStatus(li.status), remoteKey: str(v.id),
      };
    });
    // İptal / iade edilmiş paketler panelde gösterilmez (sipariş durumu ayrıca güncellenir)
    const packages = (o.orderPackages || []).filter((pk) => { const x = String(pk.orderPackageFulfillStatus || ''); return x !== 'CANCELLED' && !RETURNED.test(x); }).map((pk) => {
      const ti = pk.trackingInfo || {}, st = String(pk.orderPackageFulfillStatus || '');
      return {
        remoteId: String(pk.id),
        items: (pk.orderLineItemIds || []).map((lid) => ({ line_id: String(lid), qty: (items.find((i) => i.lineId === String(lid)) || {}).quantity || 1 })),
        status: /^(DELIVERED|FULFILLED|UNABLE_TO_DELIVER)$/.test(st) ? 'shipped' : 'open', remoteStatus: st,
        cargoCompany: str(ti.cargoCompany), tracking: str(ti.trackingNumber), barcode: str(ti.barcode), trackingUrl: str(ti.trackingLink),
        error: st === 'ERROR' ? str(pk.errorMessage) || 'ikas Kargo hata verdi' : '', labelReady: !!ti.shippingLabelImage,
        agreement: (ti.barcode || ti.trackingNumber) && (pk.appId || st === 'READY_FOR_SHIPMENT') ? 'ikas' : null,
      };
    });
    const first = packages.find((x) => x.tracking) || {};
    return {
      remoteId: String(o.id), orderNumber: String(o.orderNumber || o.id), orderedAt: typeof o.orderedAt === 'number' ? o.orderedAt : Date.parse(o.orderedAt),
      remoteStatus: [o.status, o.orderPackageStatus, o.orderPaymentStatus].filter(Boolean).join(' / '), status: mapStatus(o),
      customer: [a.firstName || c.firstName, a.lastName || c.lastName].filter(Boolean).join(' '), phone: str(a.phone || (o.billingAddress || {}).phone || c.phone), email: str(c.email),
      address: { name: [a.firstName, a.lastName].filter(Boolean).join(' '), line: [a.addressLine1, a.addressLine2].filter(Boolean).join(' '), district: str(a.district && a.district.name), city: str(a.city && a.city.name), phone: str(a.phone) },
      total: num(o.totalFinalPrice), currency: o.currencyCode || 'TRY',
      cargoCompany: first.cargoCompany || '', tracking: first.tracking || '',
      awaitingPayment: /WAITING/i.test(o.orderPaymentStatus || ''),
      // Kapıda ödeme (nakit / kartla): anlaşmalı kargo entegrasyonuyla tahsilatlı gönderi açılamaz (bkz. carriers.js codBlocked)
      cod: (o.paymentMethods || []).some((m) => /ON_DELIVERY/i.test(String(m && m.type))) || undefined, customerId: str(c.id), guest: !!c.isGuestCheckout,
      cargoChoice: str(((o.shippingLines || [])[0] || {}).title), cargoChoiceId: str(((o.shippingLines || [])[0] || {}).cargoCompanyId),
      items, packages,
    };
  }

  // Görsel adresleri için mağaza (merchant) kimliği: girilmediyse API'den bir kez alınır
  async function ensureMerchant() {
    if (merchant || merchantTried) return merchant;
    merchantTried = true;
    try { const d = await gql('{ getMerchant { id } }'); merchant = (d.getMerchant && d.getMerchant.id) || ''; } catch { /* görselsiz devam */ }
    return merchant;
  }
  const imgUrl = (img, size = 180) => (merchant && img && img.imageId ? `https://cdn.myikas.com/images/${merchant}/${img.imageId}/${size}/${encodeURIComponent(String(img.fileName || 'image').replace(/\.[a-z0-9]+$/i, ''))}.webp` : '');

  // byOrdered: geçmiş sipariş aktarımında sipariş tarihine göre (normalde son güncellenme tarihine göre) çeker
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    await ensureMerchant();
    const out = [];
    let filter = byOrdered ? 'orderedAt' : 'updatedAt', optional = ORDER_OPT, more = false, sort = byOrdered ? '' : 'updatedAt', last = null, noChannel = 0;
    const maxPage = byOrdered ? 60 : 100;
    for (let page = 1; page <= maxPage; page++) {
      let data;
      try {
        data = await flex((o) => orderQuery(o, filter, sort), optional, { p: { page, limit: 50 }, d: { gte: since, lte: until } });
      } catch (e) {
        // Sıralama desteklenmiyorsa sırasız (imleç aralığın başında kalır)
        if (sort && e.gql && /sort/i.test(e.message)) { sort = ''; page--; continue; }
        // Eski şemada updatedAt filtresi yoksa sipariş tarihine göre çek
        if (filter === 'updatedAt' && e.gql) { filter = 'orderedAt'; page--; continue; }
        throw e;
      }
      const r = data.listOrder;
      for (const o of r.data || []) {
        // Taslak ve satış sonrası teklif (upsell) ekranında bekleyen sipariş henüz kesinleşmedi: CREATED olunca (updatedAt değişir) gelir
        if (o.updatedAt != null) last = o.updatedAt;
        if (/^(DRAFT|WAITING_UPSELL_ACTION)$/i.test(o.status || '')) continue;
        // Satış kanalı seçiliyken siparişin kanalı okunamadıysa (şemada alan yok) sipariş alınmaz: diğer kanalların siparişi karışmasın
        if (salesChannel && o.salesChannelId == null) { noChannel++; continue; }
        if (salesChannel && o.salesChannelId !== salesChannel) continue;
        out.push(normOrder(o));
      }
      more = !!r.hasNext;
      if (!r.hasNext) break;
    }
    // Aralıktaki siparişlerin hepsi okunamadı (ör. uzun kesintiden sonra binlerce güncelleme): imleç ilerlemez, kalanı sonraki senkronda
    // Sıralı okumada imleç okunan son güncellemeden devam eder (sırasızda aralığın başında kalır)
    const lastAt = sort && last != null ? (typeof last === 'number' ? last : Date.parse(last)) : NaN;
    if (more && !byOrdered) { out.warnings = [`ikas: bu aralıkta ${out.length}+ sipariş güncellemesi var; kalanlar bir sonraki senkronda alınacak`]; out.partialUntil = Number.isFinite(lastAt) && lastAt > since ? lastAt : since; }
    if (noChannel) (out.warnings = out.warnings || []).push(`ikas: ${noChannel} siparişin satış kanalı okunamadı; seçili satış kanalı (${salesChannel}) doğrulanamadığı için alınmadı`);
    return out;
  }

  // Ürünler varyant düzeyinde gelir (her varyant = bir ilan = bir SKU). Varyant adı (ör. "5 Kg") ve görsel eklenir.
  async function fetchListings() {
    await ensureMerchant();
    const out = [];
    let values = new Map();
    try {
      const vt = await gql('{ listVariantType { id name values { id name } } }');
      for (const t of vt.listVariantType || []) for (const v of t.values || []) values.set(v.id, v.name);
    } catch { /* varyant adları olmadan devam */ }
    // Kategori yolu (ör. "Gübre › Sıvı Gübre"): kategori eşleştirme ve pazaryerine ürün yüklemede kullanılır
    const cats = new Map();
    try { for (const c of (await gql('{ listCategory { id name parentId } }')).listCategory || []) cats.set(c.id, c); } catch { /* kategori olmadan devam */ }
    const catPath = (ids) => {
      const list = (ids || []).filter((id) => cats.has(id));
      const parents = new Set(list.map((id) => cats.get(id).parentId).filter(Boolean));
      const leaf = list.find((id) => !parents.has(id)) || list[0];
      const names = [];
      for (let c = cats.get(leaf), i = 0; c && i < 8; c = cats.get(c.parentId), i++) names.unshift(c.name);
      return names.join(' › ');
    };
    const q = (o) => `query ($page: Int!) { listProduct(pagination: { page: $page, limit: 100 }) { hasNext data {
      id name ${o.salesChannelIds} ${o.brand} ${o.description} ${o.categoryIds} variants { id sku ${o.barcodeList} isActive ${o.variantValueIds} prices { sellPrice discountPrice priceListId } stocks { stockCount stockLocationId } ${o.images} } } } }`;
    // Stok, gönderimin yazdığı lokasyondan okunur (pushStock ile aynı): çok lokasyonlu mağazada toplam okunursa diğer depodaki adet
    // yüzünden okunan değer gönderilenle hiç eşleşmez ve ilan her senkronda yeniden gönderilir. Diğer depolara dokunulmaz.
    // Lokasyon bilinmiyorsa ya da varyantın o lokasyonda kaydı yoksa toplam alınır.
    // Lokasyon seçilmeden (çok lokasyonlu mağaza) ya da seçilen silinmişken stok okunmaz: toplam okunup ana katalog stoğu yanlış olmasın
    let loc = '';
    try { loc = await location(true); } catch (e) { if (e.loc || e.budget) throw e; /* lokasyon listesi okunamadı: toplam stok */ }
    const stockOf = (v) => {
      const list = v.stocks || [], at = loc ? list.filter((x) => x.stockLocationId === loc) : [];
      return (at.length ? at : list).reduce((s, x) => s + num(x.stockCount), 0);
    };
    let optional = { barcodeList: 'barcodeList', images: 'images { imageId fileName isMain order isVideo }', salesChannelIds: 'salesChannelIds', variantValueIds: 'variantValueIds { variantTypeId variantValueId }', brand: 'brand { name }', description: 'description', categoryIds: 'categoryIds' };
    for (let page = 1; page <= 200; page++) {
      const d = await flex(q, optional, { page });
      for (const p of d.listProduct.data || []) {
        if (salesChannel && Array.isArray(p.salesChannelIds) && !p.salesChannelIds.includes(salesChannel)) continue;
        const vars = p.variants || [];
        // Ürün görseli: varyantın kendi görseli yoksa ürünün ana görseli
        const allImgs = vars.flatMap((v) => v.images || []).filter((i) => !i.isVideo && i.imageId);
        const mainImg = allImgs.find((i) => i.isMain) || allImgs.sort((a, b) => (a.order || 0) - (b.order || 0))[0];
        for (const v of vars) {
          // Mağazanın ana fiyatı: fiyat listesine (priceListId) bağlı olmayan kayıt; fiyat gönderimi de bu kaydı günceller
          const pr = (v.prices || []).find((x) => !x.priceListId) || (v.prices || [])[0] || {};
          const vi = (v.images || []).filter((i) => !i.isVideo && i.imageId);
          const img = vi.find((i) => i.isMain) || vi[0] || mainImg;
          // Tüm görseller (büyük boy bağlantı): varyantın kendi görselleri, yoksa ürünün görselleri; ana görsel önce
          const ord = (list) => [...list].sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0) || (a.order || 0) - (b.order || 0));
          const gallery = [...new Map(ord(vi.length ? vi : allImgs).map((i) => [i.imageId, imgUrl(i, 1080)])).values()].filter(Boolean).slice(0, 12);
          const vname = (v.variantValueIds || []).map((x) => values.get(x.variantValueId)).filter(Boolean).join(' / ');
          out.push({
            remoteId: String(v.id), remoteProductId: String(p.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]),
            name: vname ? `${p.name} - ${vname}` : p.name, groupName: p.name, variantName: vname,
            image: imgUrl(img, 360), images: gallery, price: num(pr.discountPrice || pr.sellPrice), listPrice: num(pr.sellPrice),
            stock: stockOf(v), active: v.isActive !== false,
            brand: str(p.brand && p.brand.name), description: str(p.description), category: catPath(p.categoryIds),
          });
        }
      }
      if (!d.listProduct.hasNext) break;
    }
    return out;
  }

  // Stok lokasyonu: seçilmediyse yalnız tek (silinmemiş) lokasyonlu mağazada o kullanılır. Birden çok lokasyonda hangi depoya
  // yazılacağı tahmin edilmez (ilki seçilince stok yanlış depoya yazılıyordu): seçilmesi istenir. Seçilen lokasyon silinmişse de hata.
  // Yalnız stok işlemleri durur; siparişler alınmaya devam eder.
  // Seçilen lokasyon her gönderimde sorgulanmaz: stok okunurken (fetchListings, verify) doğrulanır, sonuç gönderimde kullanılır.
  const cfgLoc = locationId;
  let locErr = null;
  const locError = (msg) => Object.assign(new Error(msg), { loc: true });
  async function location(verify = false) {
    if (locErr && !verify) throw locErr;
    if (locationId && !verify) return locationId;
    let d = null;
    try { d = await gql('{ listStockLocation { id name deleted } }'); } catch (e) { if (!cfgLoc || e.budget) throw e; }
    const arr = d && d.listStockLocation, live = (arr || []).filter((x) => !x.deleted);
    locErr = null;
    if (cfgLoc) {
      // Liste okunamadıysa (yanıtta yok) seçilen lokasyon kullanılır; yalnız listede olmadığı kesinse hata
      if (Array.isArray(arr) && !live.some((x) => String(x.id) === String(cfgLoc))) throw (locErr = locError(`ikas'ta seçili stok lokasyonu (${cfgLoc}) bulunamadı ya da silinmiş; Entegrasyonlar → ikas'tan stok lokasyonunu seçin`));
      return cfgLoc;
    }
    locationId = '';
    if (live.length > 1) throw (locErr = locError("ikas'ta birden fazla stok lokasyonu var; Entegrasyonlar → ikas'tan stok lokasyonunu seçin"));
    if (!live.length) throw new Error('ikas stok lokasyonu bulunamadı (' + p + 'STOCK_LOCATION_ID tanımlayın)');
    return (locationId = live[0].id);
  }

  // Grup reddedilirse ikiye bölünerek hatalı varyant(lar) bulunur: tek bir hatalı varyant (ikas'ta silinmiş / ürünü değişmiş)
  // gruptaki diğer 99 ilanın gönderimini engellemez ve onları "hatalı" göstermez. Bağlantı / yetki hatası tüm gönderimi durdurur.
  // Bölme sınırlıdır: iki yarı da üst grupla aynı hatayı verir ve iki tek ilanlık deneme de aynı hatayı verirse hata ilanlara değil
  // tüm isteğe aittir (şema / yetki): atılır (önceden 100 ilanlık grup tek tek bölünüp ~200 istek atıyordu). Bir gönderimde en çok
  // SPLIT_CAP bölme isteği atılır; kalan ilanlar hatalı yazılır (sonra yeniden denenir). İstek bütçesi hatası (e.budget) hep atılır.
  const itemError = (e) => !e.budget && (e.gql || /HTTP 4(00|22)\b/.test(e.message || ''));
  const SPLIT_CAP = 60;
  const msgOf = (e) => String(e.message).replace(/^ikas: /, '');
  async function isolate(items, send, out, ctx = { calls: 0 }) {
    const attempt = async (part) => {
      try { await send(part); out.done.push(...part.map((x) => x.remoteId)); return null; } catch (e) { if (!itemError(e)) throw e; return e; }
    };
    const fail = (part, e) => out.errors.push(...part.map((x) => ({ remoteId: x.remoteId, error: msgOf(e) })));
    const split = async (part, e) => {
      if (part.length === 1) return fail(part, e);
      if (ctx.calls >= SPLIT_CAP) return fail(part, e);
      const h = Math.ceil(part.length / 2), a = part.slice(0, h), b = part.slice(h);
      ctx.calls += 2;
      const ea = await attempt(a), eb = await attempt(b);
      if (ea && eb && msgOf(ea) === msgOf(e) && msgOf(eb) === msgOf(e) && a.length > 1) {
        // Tüm isteğe ait hata mı: her yarıdan bir ilan tek başına denenir
        ctx.calls += 2;
        const pa = await attempt(a.slice(0, 1)), pb = await attempt(b.slice(0, 1));
        if (pa && pb && msgOf(pa) === msgOf(e) && msgOf(pb) === msgOf(e)) throw pa;
        if (pa) fail(a.slice(0, 1), pa);
        if (pb) fail(b.slice(0, 1), pb);
        for (const rest of [a.slice(1), b.slice(1)].filter((x) => x.length)) {
          if (ctx.calls >= SPLIT_CAP) { fail(rest, e); continue; }
          ctx.calls++;
          const er = await attempt(rest);
          if (er) await split(rest, er);
        }
        return;
      }
      if (ea) await split(a, ea);
      if (eb) await split(b, eb);
    };
    ctx.calls++;
    const e = await attempt(items);
    if (e) await split(items, e);
  }

  async function pushStock(items) {
    const loc = await location(), out = { done: [], errors: [] }, ctx = { calls: 0 };
    const send = (part) => gql('mutation ($input: SaveStockLocationsInput!) { saveProductStockLocations(input: $input) }', {
      input: { productStockLocationInputs: part.map((x) => ({ productId: x.remoteProductId, variantId: x.remoteId, stockLocationId: loc, stockCount: x.stock })) },
    });
    for (let i = 0; i < items.length; i += 100) await isolate(items.slice(i, i + 100), send, out, ctx);
    return out;
  }

  async function pushPrice(items) {
    const out = { done: [], errors: [] }, ctx = { calls: 0 };
    const send = (part) => gql('mutation ($input: SaveVariantPricesInput!) { saveVariantPrices(input: $input) }', {
      input: {
        variantPriceInputs: part.map((x) => ({
          productId: x.remoteProductId, variantId: x.remoteId,
          // İndirim yoksa discountPrice açıkça boşaltılır: eski indirimli fiyat kalırsa müşteri o fiyattan alır
          price: x.listPrice && x.listPrice > x.price ? { sellPrice: x.listPrice, discountPrice: x.price } : { sellPrice: x.price, discountPrice: null },
        })),
      },
    });
    for (let i = 0; i < items.length; i += 100) await isolate(items.slice(i, i + 100), send, out, ctx);
    return out;
  }

  // ---------- kargo (ikas Kargo) ----------
  // Resmi Admin API'de ikas Kargo için "gönderi oluştur" işlemi yoktur; gönderi ikas'taki ikas Kargo uygulamasıyla açılır
  // (bkz. aşağıda adminUrl / fetchOne). ikas Kargo paketi oluşturup barkod / takip no / etiket görselini paketin trackingInfo
  // alanına yazar (hata olursa durum ERROR + errorMessage); panel bunu okur. Panel ikas'a hiçbir kargo / takip bilgisi yazmaz.
  let cargoCache = null;
  async function carriers() {
    if (!cargoCache) {
      const d = await gql('{ listCargoCompany { id name } }');
      cargoCache = (d.listCargoCompany || []).map((c) => ({ id: String(c.id), name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }
    return cargoCache;
  }
  // Kargo firması panelden seçilmez: ikas Kargo, siparişin kargo yöntemine göre kendisi seçer (bilgi amaçlı tek seçenek)
  async function cargoOptions(order) {
    const choice = order && order.extra && order.extra.cargoChoice;
    return [{ id: '', name: `ikas Kargo${choice ? ` — müşterinin seçtiği: ${choice}` : ''}`, hint: 'Firma ikas Kargo tarafından, siparişin kargo yöntemine ve ikas\'taki kargo ayarlarınıza göre belirlenir.', current: true }];
  }
  // Tek siparişi kimliğiyle oku (etiket / barkod kontrolü için)
  async function getOrder(remoteId) {
    const d = await flex((o) => orderQuery(o, 'id'), ORDER_OPT, { p: { page: 1, limit: 1 }, d: { eq: remoteId } });
    const o = (d.listOrder.data || [])[0];
    if (!o) throw new Error('ikas: sipariş bulunamadı');
    return o;
  }

  // ikas paketinin gönderi durumu: kimin işlediği, gerçek gönderi oluştu mu, etiket var mı, hata ne
  function shipment(pk) {
    const ti = pk.trackingInfo || {}, st = String(pk.orderPackageFulfillStatus || '');
    const code = str(ti.barcode) || str(ti.trackingNumber);
    const base = { remoteId: String(pk.id), remoteStatus: st, barcode: str(ti.barcode), tracking: str(ti.trackingNumber), cargoCompany: str(ti.cargoCompany), appId: str(pk.appId) };
    if (st === 'ERROR') return { ...base, state: 'error', error: `ikas Kargo gönderiyi oluşturamadı: ${str(pk.errorMessage) || 'sebep bildirilmedi'}` };
    // "Kargoya Hazır" pakete barkodu yazan ikas Kargo'dur (ya da paketi işleyen kargo uygulaması: appId)
    // ikas Kargo gönderisi: paketi ikas Kargo uygulaması işler (appId) ve barkod / etiket görselini yazar
    if (code && (pk.appId || ti.shippingLabelImage || st === 'READY_FOR_SHIPMENT')) return { ...base, state: ti.shippingLabelImage ? 'labeled' : 'created', agreement: 'ikas', labelImage: ti.shippingLabelImage || '' };
    if (code) return { ...base, state: 'manual', labelImage: ti.shippingLabelImage || '' }; // takip no elle girilip gönderilmiş
    // Kargoya Hazır ama elle kargo firması yazılmış (eski panel sürümü / ikas'ta elle giriş): ikas Kargo bu paketi işlemez
    if (st === 'READY_FOR_SHIPMENT' && !pk.appId && (ti.cargoCompanyId || ti.cargoCompany)) return { ...base, state: 'manualCargo' };
    if (st === 'READY_FOR_SHIPMENT') return { ...base, state: 'waiting' };
    return { ...base, state: 'none' };
  }

  // ikas Kargo: gönderi ikas panelindeki "ikas Kargo ile Paketle ve Gönder" uygulamasıyla oluşturulur (firma seçimi ve ücret
  // ikas Kargo'da). Bu işlem ikas'ın genel Admin API'sinde yoktur; panel "Kargoya Hazır Olarak İşaretle" YAPMAZ (o menü ikas Kargo
  // değildir ve ikas Kargo gönderisi açmaz). Panel siparişin ikas Kargo ekranını açar, gönderi oluşunca paketi, barkodu ve etiketi okur.
  const adminUrl = `https://${store}.myikas.com/admin/order/view/`;
  const fetchOne = async (remoteId) => normOrder(await getOrder(remoteId));
  // Sipariş ikas'ta var mı (silinmiş / deneme siparişi tespiti, bkz. orderclean.js): kimlikle tam eşleşme sorgusu, hata = bilinmiyor
  const orderExists = async (remoteId) => !!((await flex((o) => orderQuery(o, 'id'), ORDER_OPT, { p: { page: 1, limit: 1 }, d: { eq: remoteId } })).listOrder.data || [])[0];
  const EXT = (extra = '', firm = '') => `Bu sipariş henüz ikas Kargo ile gönderilmedi. “ikas Kargo ile Gönder”e basın: ikas'ta siparişin ⋮ menüsünden “ikas Kargo ile Paketle ve Gönder” → ürünler → Kaydet → ${firm ? `kargo firması: ${firm}` : 'kargo firması'} → Devam Et. Gönderi oluşunca barkod ve etiket buraya kendiliğinden gelir.${extra}`;

  // Etiket: yalnızca ikas Kargo'nun gerçek gönderisi ve etiketi. Gönderi henüz oluşmadıysa "bekleniyor", hata varsa sebebi.
  async function label(order, pkg) {
    const firm = ikasCarrier(order.extra && order.extra.cargoChoice);
    if (!pkg.remote_id) return { pending: EXT('', firm), external: true, step: 'external' };
    const o = await getOrder(order.remote_id);
    const pk = (o.orderPackages || []).find((x) => String(x.id) === String(pkg.remote_id));
    if (!pk) throw new Error('Paket ikas\'ta bulunamadı (ikas panelinden iptal edilmiş olabilir); senkronlayın');
    const sh = shipment(pk);
    const info = { barcode: sh.barcode, tracking: sh.tracking, cargoCompany: sh.cargoCompany, remoteStatus: sh.remoteStatus, agreement: sh.agreement || null, step: sh.state };
    if (sh.state === 'error') throw new Error(sh.error + ' — müşteri telefonu, gönderici (depo) adresi ve ikas Kargo\'daki firma anlaşmasını kontrol edin.');
    if (sh.labelImage) {
      const lab = await labelFrom(sh.labelImage, `ikas-${order.order_number}-${pkg.no}`);
      if (lab) return { ...info, label: lab };
    }
    if (sh.state === 'created') return { ...info, pending: `ikas Kargo gönderiyi oluşturdu (${sh.cargoCompany || 'kargo'} · barkod ${sh.barcode || sh.tracking}) ama etiket görselini henüz vermedi. Birkaç saniye sonra tekrar deneyin.`, barcodeOnly: true };
    if (sh.state === 'manual') return { ...info, pending: 'Bu pakete takip numarası elle girilmiş; ikas Kargo gönderisi değil, ikas etiket vermez.', barcodeOnly: true };
    if (sh.state === 'manualCargo' || sh.state === 'waiting') return { ...info, external: true, cancelable: true, pending: EXT(` Not: bu paket ikas'ta yalnızca “Kargoya Hazır” işaretli${sh.cargoCompany ? ` (${sh.cargoCompany})` : ''}; bu bir ikas Kargo gönderisi değil. ikas Kargo menüsü görünmüyorsa önce paket menüsünden “Paketi iptal et” ile bu işareti kaldırın.`, firm) };
    return { ...info, external: true, pending: EXT(` (paket durumu: ${sh.remoteStatus || '-'})`, firm) };
  }

  // Kargoya ver: ikas'a HİÇBİR takip / kargo bilgisi yazılmaz. Gönderiyi ikas Kargo yönetir; kargo firması paketi
  // okutunca ikas durumu kendisi "Gönderildi" yapar ve senkronla panele gelir. Panel yalnızca kendi kaydını günceller.
  // Kendi anlaşmanızla (kargo entegratörü: Kargonomi, Navlungo…) gönderim: ikas Kargo kullanılmaz. Entegratörün takip no / barkodu
  // ikas'ta paket olarak yazılır ("Kargoya Hazır", müşteriye bildirim gitmez); "Kargoya ver" paketi ikas'ta "Kargoda" yapar ve takip
  // bilgisi müşteriye ikas'tan gider. ikas'a kargo bilgisi yalnız bu yolda yazılır; ikas Kargo gönderilerine dokunulmaz.
  const own = (pkg) => pkg.agreement === 'own' && !!pkg.carrier_provider;
  const tinfo = (t, notify) => ({ trackingNumber: t.tracking || undefined, barcode: t.barcode || undefined, cargoCompany: t.cargoCompany || undefined, trackingLink: t.trackingUrl || undefined, isSendNotification: notify });
  async function ownShipment(order, pkg, t) {
    const lines = (pkg.items || []).map((x) => ({ orderLineItemId: String(x.line_id), quantity: Number(x.qty) || 1 }));
    if (!lines.length) throw new Error('Pakette ürün yok');
    const d = await gql('mutation ($input: FulFillOrderInput!) { fulfillOrder(input: $input) { id orderPackages { id orderLineItemIds trackingInfo { trackingNumber barcode } } } }', {
      input: { orderId: order.remote_id, lines, markAsReadyForShipment: true, sendNotificationToCustomer: false, trackingInfoDetail: tinfo(t, false) },
    });
    const pks = (d.fulfillOrder && d.fulfillOrder.orderPackages) || [];
    const hit = pks.find((p) => p.trackingInfo && t.tracking && (p.trackingInfo.trackingNumber === t.tracking || p.trackingInfo.barcode === t.tracking)) || pks[pks.length - 1];
    if (!hit) throw new Error('ikas paketi oluşturamadı');
    return { remoteId: String(hit.id) };
  }
  async function ship(order, pkg) {
    if (own(pkg)) {
      const t = { tracking: pkg.tracking, barcode: pkg.barcode, cargoCompany: pkg.cargo_company, trackingUrl: pkg.tracking_url };
      const id = pkg.remote_id || (await ownShipment(order, pkg, t)).remoteId;
      await gql('mutation ($input: UpdateOrderPackageStatusInput!) { updateOrderPackageStatus(input: $input) { id } }', {
        input: { orderId: order.remote_id, packages: [{ packageId: id, status: 'FULFILLED', trackingInfo: tinfo(t, true) }] },
      });
      return { remoteId: id, tracking: pkg.tracking };
    }
    if (!pkg.remote_id || !(pkg.barcode || pkg.tracking)) throw new Error('Bu paket ikas Kargo ile gönderilmemiş. Önce “ikas Kargo ile Gönder” ya da bağlı kargo entegratörünüzle gönderi açın; elle kargo bilgisi girilmez.');
    return { remoteId: pkg.remote_id };
  }

  // Paketi iptal et (ikas'ta paketlemeyi geri al) — kargo firmasını değiştirmek veya yeniden bölmek için
  async function cancelPackage(order, pkg) {
    if (!pkg.remote_id) return;
    if ((pkg.barcode || pkg.tracking) && !own(pkg)) throw new Error('Bu pakette ikas Kargo gönderisi (barkod) var; gönderiyi ikas panelindeki ikas Kargo ekranından iptal edin.');
    await gql('mutation ($input: CancelFulfillmentInput!) { cancelFulfillment(input: $input) { id } }', { input: { orderId: order.remote_id, orderPackageId: pkg.remote_id } });
  }
  // Panelde açılan ürünü ikas'ta oluştur. Tek ürün ya da (opts.variants: aynı ana ürünün varyantları) varyantlı tek ürün.
  // Marka adla bulunur (yoksa açılır), kategori ürünün kategori adına göre eşlenir (bulunamazsa boş), varyant türü varyant adlarından
  // (ör. "5 Kg" → Ağırlık), liste fiyatı satış fiyatından yüksekse sellPrice = liste, discountPrice = satış. Görseller bağlantıdan
  // (ikas görsel yükleme servisi) eklenir; yüklenemeyen görsel ürünü engellemez. Stok yalnız seçili stok lokasyonuna yazılır (pushStock).
  const lcName = (v) => str(v).toLocaleLowerCase('tr');
  const imagesOf = (r) => { let l = []; try { l = JSON.parse(r.images || '[]'); } catch { /* bozuk liste */ } return [...new Set([r.image, ...l].filter((u) => /^https:\/\//i.test(u || '')))].slice(0, 10); };
  const priceOf = (r) => { const sale = num(r.sale_price), list = num(r.list_price); return list > sale && sale > 0 ? { sellPrice: list, discountPrice: sale } : { sellPrice: sale }; };
  async function brandFor(name) {
    if (!str(name)) return undefined;
    try {
      const d = await gql('query ($s: String) { listProductBrand(search: $s) { id name } }', { s: str(name) });
      const hit = (d.listProductBrand || []).find((b) => brandKey(b.name) === brandKey(name));
      if (hit) return hit.id;
      const c = await gql('mutation ($input: ProductBrandInput!) { saveProductBrand(input: $input) { id } }', { input: { name: str(name) } });
      return (c.saveProductBrand && c.saveProductBrand.id) || undefined;
    } catch (e) { if (e.budget) throw e; return undefined; }
  }
  async function categoryFor(path) {
    const leaf = lcName(str(path).split('›').pop());
    if (!leaf) return undefined;
    try {
      const list = (await gql('{ listCategory { id name parentId } }')).listCategory || [];
      const hit = list.find((c) => lcName(c.name) === leaf);
      return hit ? [hit.id] : undefined;
    } catch (e) { if (e.budget) throw e; return undefined; }
  }
  const typeName = (vals) => (vals.every((v) => /\d\s*(kg|kilo|gr|g|gram)\b/i.test(v)) ? 'Ağırlık' : vals.every((v) => /\d\s*(lt|l|litre|ml|cc)\b/i.test(v)) ? 'Hacim' : 'Seçenek');
  async function variantType(vals) {
    const name = typeName(vals);
    const d = await gql('query ($n: StringFilterInput) { listVariantType(name: $n) { id name values { id name } } }', { n: { eq: name } });
    const cur = (d.listVariantType || [])[0];
    const have = cur ? cur.values || [] : [], add = vals.filter((v) => !have.some((x) => lcName(x.name) === lcName(v)));
    let t = cur;
    if (!cur || add.length) {
      const r = await gql('mutation ($input: VariantTypeInput!) { saveVariantType(input: $input) { id name values { id name } } }', {
        input: { ...(cur ? { id: cur.id } : {}), name, values: [...have.map((x) => ({ id: x.id, name: x.name })), ...add.map((v) => ({ name: v }))] },
      });
      t = r.saveVariantType;
    }
    const idOf = (v) => ((t.values || []).find((x) => lcName(x.name) === lcName(v)) || {}).id;
    return { id: t.id, idOf };
  }
  async function uploadImages(prodRows) {
    // Aynı görsel birden çok varyantta: tek yükleme, tüm varyantlara
    const by = new Map();
    for (const { vid, row } of prodRows) imagesOf(row).forEach((u, i) => { const x = by.get(u) || { order: i, ids: [] }; x.ids.push(vid); x.order = Math.min(x.order, i); by.set(u, x); });
    let n = 0;
    for (const [url, x] of by) {
      if (n++ >= 20) break;
      try {
        await http('https://api.myikas.com/api/v1/admin/product/upload/image', { method: 'POST', tries: 1, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth()}` },
          body: JSON.stringify({ productImage: { variantIds: x.ids, url, order: x.order, isMain: x.order === 0 } }) });
      } catch (e) { if (e.budget) throw e; /* görsel yüklenemedi: ürün yine açılır */ }
    }
  }
  // Kategori eşleştirme ekranı için ikas kategorileri (yalnız okuma): ad + üst kategori yolu
  async function storeCategories() {
    const list = (await gql('{ listCategory { id name parentId } }')).listCategory || [], by = new Map(list.map((c) => [c.id, c]));
    const pathOf = (c) => { const n = []; for (let x = by.get(c.parentId), i = 0; x && i < 8; x = by.get(x.parentId), i++) n.unshift(x.name); return n.join(' › '); };
    return list.map((c) => ({ id: String(c.id), name: str(c.name), path: pathOf(c) }));
  }
  async function createProduct(pr, opts = {}) {
    const rows = (opts.variants || []).length > 1 ? opts.variants : [pr];
    const group = rows.length > 1;
    const vals = group ? rows.map((r) => str(r.variant_name) || str(r.name)) : [];
    if (group && new Set(vals.map(lcName)).size !== vals.length) throw new Error('Varyant adları farklı olmalı (ör. 5 Kg, 10 Kg)');
    const vt = group ? await variantType(vals) : null;
    const [brandId, categoryIds] = await Promise.all([brandFor(pr.brand), opts.categoryId ? [String(opts.categoryId)] : categoryFor(pr.category)]);
    const weight = num(pr.weight) > 0 ? num(pr.weight) : undefined;
    const d = await gql('mutation ($input: ProductInput!) { saveProduct(input: $input) { id variants { id sku } } }', {
      input: {
        name: group ? str(pr.group_name) || pr.name : pr.name, type: 'PHYSICAL', description: pr.description || '',
        salesChannelIds: salesChannel ? [salesChannel] : undefined, brandId, categoryIds, weight,
        ...(vt ? { productVariantTypes: [{ order: 0, variantTypeId: vt.id, variantValueIds: vals.map(vt.idOf) }] } : {}),
        variants: rows.map((r, i) => ({ sku: r.sku || undefined, barcodeList: r.barcode ? [r.barcode] : [], isActive: true, prices: [priceOf(r)],
          ...(num(r.weight) > 0 ? { weight: num(r.weight) } : {}), ...(vt ? { variantValueIds: [{ variantTypeId: vt.id, variantValueId: vt.idOf(vals[i]) }] } : {}) })),
      },
    });
    const prod = d.saveProduct, vs = prod.variants || [];
    const out = rows.map((r, i) => {
      const v = (r.sku && vs.find((x) => str(x.sku) === str(r.sku))) || vs[i];
      if (!v) throw new Error('ikas varyantı oluşturmadı');
      const p0 = priceOf(r);
      return { pid: r.id, remoteId: String(v.id), remoteProductId: String(prod.id), sku: r.sku, barcode: r.barcode, name: r.name, price: p0.discountPrice || p0.sellPrice, stock: Math.max(0, num(r.stock)) };
    });
    await uploadImages(out.map((l, i) => ({ vid: l.remoteId, row: rows[i] })));
    await pushStock(out.map((l) => ({ ...l })));
    return group ? out : out[0];
  }

  // ---------- tanılama ----------
  // Her adımı ayrı ayrı ikas'a sorar ve sonucu açıklar: bağlantı, uygulama izinleri, depo adresi, kargo ayarları,
  // ve (sipariş verilirse) o siparişin paketleri: durum, ikas Kargo uygulaması işledi mi, barkod / etiket / hata.
  async function diagnose({ orderId } = {}) {
    const out = [];
    const step = async (name, fn) => {
      try { const r = await fn(); out.push({ name, ...r }); return r; } catch (e) { out.push({ name, ok: false, detail: e.message }); return null; }
    };
    const tok = await step('ikas bağlantısı (OAuth)', async () => { await auth(); return { ok: true, detail: `${store}.myikas.com için erişim anahtarı alındı` }; });
    if (!tok) return out;
    // İzinler: resmi adlar read_/write_ + orders, products, inventories (ikas OAuth). Önce erişim anahtarının izin listesi,
    // yoksa uygulama kaydı. ikas listeyi boş döndürürse "eksik" denmez; izinler aşağıdaki gerçek işlemlerle doğrulanır.
    // İzinler: ikas özel uygulamalarda izin listesini bildirmediği için her izin GERÇEK ama HİÇBİR ŞEY DEĞİŞTİRMEYEN bir işlemle denenir:
    // okuma → 1 kayıt okunur; yazma → boş liste kaydedilir (stok / fiyat) ya da var olmayan bir paket iptal edilmeye çalışılır
    // ("bulunamadı" cevabı yetkinin açık olduğunu gösterir; "yetki / izin / unauthorized" cevabı kapalı olduğunu).
    await step('Uygulama izinleri (gerçek işlemle denendi)', async () => {
      const DENY = /unauthori[sz]ed|forbidden|permission|not allowed|access denied|scope|yetki|izin/i;
      const ZERO = '00000000-0000-0000-0000-000000000000';
      const tests = [
        ['Siparişler – okuma', true, () => gql('{ listOrder(pagination: { page: 1, limit: 1 }) { data { id } } }')],
        ['Siparişler – düzenleme', true, () => gql('mutation ($input: CancelFulfillmentInput!) { cancelFulfillment(input: $input) { id } }', { input: { orderId: ZERO, orderPackageId: ZERO } })],
        ['Ürünler – okuma', true, () => gql('{ listProduct(pagination: { page: 1, limit: 1 }) { data { id } } }')],
        ['Ürünler – düzenleme (fiyat)', false, () => gql('mutation ($input: SaveVariantPricesInput!) { saveVariantPrices(input: $input) }', { input: { variantPriceInputs: [] } })],
        ['Envanter – okuma (depo)', false, () => gql('{ listStockLocation { id } }')],
        ['Envanter – düzenleme (stok)', false, () => gql('mutation ($input: SaveStockLocationsInput!) { saveProductStockLocations(input: $input) }', { input: { productStockLocationInputs: [] } })],
      ];
      const rows = [];
      let ok = true;
      for (const [name, need, fn] of tests) {
        try { await fn(); rows.push(`✓ ${name}`); }
        catch (e) {
          if (DENY.test(e.message) || /HTTP 40[13]/.test(e.message)) { rows.push(`✗ ${name}: KAPALI (${e.message.slice(0, 120)})`); if (need) ok = false; else if (ok) ok = null; }
          else rows.push(`✓ ${name} (yetki var; deneme isteği beklendiği gibi reddedildi: ${e.message.replace(/^ikas: /, '').slice(0, 80)})`);
        }
      }
      return { ok, detail: rows.join('\n') + (ok === true ? '\nTüm izinler açık.' : '\nKapalı izni ikas → Uygulamalar → Özel uygulama → izinlerden açın.') };
    });
    await step('Mağaza (görseller için)', async () => { const d = await gql('{ getMerchant { id } }'); return { ok: !!(d.getMerchant && d.getMerchant.id), detail: `Merchant ID: ${(d.getMerchant || {}).id || '-'}` }; });
    await step('Depo / stok lokasyonu adresi', async () => {
      const d = await gql('{ listStockLocation { id name type address { address phone postalCode city { name } district { name } } } }');
      const locs = d.listStockLocation || [];
      if (!locs.length) return { ok: false, detail: 'Stok lokasyonu yok. ikas → Ayarlar → Stok Lokasyonları' };
      const bad = locs.filter((l) => { const a = l.address || {}; return !a.address || !(a.city && a.city.name) || !(a.district && a.district.name) || !a.phone; });
      return { ok: bad.length ? false : true, detail: locs.map((l) => { const a = l.address || {}; return `${l.name}${l.id === locationId ? ' (stok buraya gönderiliyor)' : ''}: ${[a.address, a.district && a.district.name, a.city && a.city.name, a.phone].filter(Boolean).join(', ') || 'ADRES YOK'}`; }).join(' · ') + (bad.length ? ' — ikas Kargo barkod üretmek için gönderici adresi (adres, il, ilçe, telefon) eksiksiz olmalı.' : '') };
    });
    await step('Kargo firmaları (ikas)', async () => { const c = await carriers(); return { ok: c.length ? true : null, detail: c.map((x) => x.name).join(', ') || 'ikas kargo firması listesi boş' }; });
    await step('Kargo ayarları (bölgeler)', async () => {
      const d = await gql('{ listShippingSettings { zoneName isPassive salesChannelId type zoneRate { rateName cargoCompanyId price } } }');
      const list = (d.listShippingSettings || []).filter((x) => !x.isPassive);
      const names = new Map((cargoCache || []).map((c) => [c.id, c.name]));
      return { ok: list.length ? true : null, detail: 'Müşterinin ödeme sayfasında gördüğü kargo seçenekleri (gönderi firması ikas Kargo ekranında seçilir) · ' + list.map((x) => `${x.zoneName}: ${(x.zoneRate || []).map((r) => `${r.rateName}${r.cargoCompanyId ? ` → ${names.get(r.cargoCompanyId) || r.cargoCompanyId}` : ''}`).join(', ')}`).join(' · ') || 'Aktif kargo ayarı yok' };
    });
    if (orderId) {
      await step('Sipariş ve paketleri (ikas)', async () => {
        const o = await getOrder(orderId);
        const a = o.shippingAddress || {}, bill = o.billingAddress || {}, cu = o.customer || {};
        const phone = a.phone || bill.phone || cu.phone;
        const phoneSrc = a.phone ? 'teslimat adresi' : bill.phone ? 'fatura adresi (teslimat adresinde yok)' : cu.phone ? 'müşteri kaydı (teslimat adresinde yok)' : '';
        const sl = (o.shippingLines || [])[0] || {};
        const firm = ikasCarrier(sl.title);
        const pk = o.orderPackages || [];
        const lines = [`Sipariş #${o.orderNumber} · durum ${o.status} / ${o.orderPackageStatus || '-'}`,
          `Müşterinin ödeme sayfasındaki seçeneği: ${sl.title || '-'} → ikas Kargo'da seçilecek firma: ${firm || 'adından anlaşılamadı (ikas Kargo ekranında uygun firmayı seçin)'}`,
          `Alıcı telefonu: ${phone ? `${phone} (${phoneSrc})` : 'YOK (teslimat, fatura ve müşteri kaydında)'}`];
        let ok = true;
        if (!phone) { ok = false; lines.push('⚠ Alıcı telefonu yok: kargo firması gönderi açmaz. ikas\'ta siparişin teslimat adresine telefon ekleyin.'); }
        else if (!a.phone) lines.push('⚠ Telefon teslimat adresinde değil; bazı kargo firmaları yalnızca teslimat adresindeki telefonu kabul eder. ikas\'ta teslimat adresine telefonu ekleyin.');
        if (!pk.length) { ok = null; lines.push(`Sipariş henüz ikas Kargo ile gönderilmemiş. Panelde “ikas Kargo ile Gönder”e basın; ikas'ta ⋮ → ikas Kargo ile Paketle ve Gönder → ${firm || 'firma'} → Devam Et. Gönderi oluşunca barkod ve etiket panele kendiliğinden gelir.`); }
        for (const x of pk) {
          const ti = x.trackingInfo || {};
          lines.push(`Paket ${x.orderPackageNumber || x.id}: ${x.orderPackageFulfillStatus}${x.appId ? ` · işleyen uygulama ${x.appId}` : ' · hiçbir kargo uygulaması işlememiş'} · kargo ${ti.cargoCompany || '-'} · barkod ${ti.barcode || '-'} · takip ${ti.trackingNumber || '-'} · etiket görseli ${ti.shippingLabelImage ? 'VAR' : 'yok'}${x.errorMessage ? ` · HATA: ${x.errorMessage}` : ''}`);
          if (x.orderPackageFulfillStatus === 'ERROR') ok = false;
          if (x.orderPackageFulfillStatus === 'READY_FOR_SHIPMENT' && !ti.barcode && !ti.trackingNumber && !x.errorMessage) {
            ok = false;
            lines.push(`⚠ Bu paket ikas'ta yalnızca “Kargoya Hazır” işaretli; ikas Kargo gönderisi değil, bu yüzden barkod / etiket yok. Panelde paketin “Kargoya Hazır işaretini kaldır” seçeneğini kullanın (ya da ikas'ta paketi iptal edin), sonra “ikas Kargo ile Gönder” → ${firm || 'firma'} → Devam Et.`);
          }
        }
        return { ok, detail: lines.join('\n') };
      });
    }
    return out;
  }

  const missing = [p + 'STORE', p + 'CLIENT_ID', p + 'CLIENT_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'ikas', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', pack: 'external', external: { label: 'ikas Kargo ile Gönder', url: adminUrl }, ship: 'local', manualTracking: false, ownCarrier: true, label: 'remote', cargo: false, repack: false, cancelPackage: true, createProduct: true, price: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, ship, ownShipment, createProduct, storeCategories, cargoOptions, label, cancelPackage, diagnose,
  };
}
