// ikas (GraphQL Admin API). Her ikas mağazası için bir özel uygulama gerekir:
// ikas paneli → Uygulamalar → Özel uygulama → izinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma).
// Kargo (ikas Kargo): paket "Kargoya Hazır" (READY_FOR_SHIPMENT) olarak oluşturulunca ikas Kargo, ikas panelindeki
// kargo önceliğine göre barkodu üretir; barkod ve etiket görseli paketin trackingInfo alanına yazılır, panel oradan okur.
// Şema kaynağı: ikas'ın resmi @ikas/admin-api-client paketi (FulFillOrderInput, UpdateOrderPackageStatusInput, TrackingInfo…).
import { http, num, str, labelFrom } from '../util.js';

const API = 'https://api.myikas.com/api/v1/admin/graphql';

export function ikas(env, p, meta) {
  const store = env[p + 'STORE'], id = env[p + 'CLIENT_ID'], secret = env[p + 'CLIENT_SECRET'];
  const salesChannel = env[p + 'SALES_CHANNEL_ID'] || '';
  let merchant = env[p + 'MERCHANT_ID'] || '', merchantTried = false;
  let token = null, tokenExp = 0, locationId = env[p + 'STOCK_LOCATION_ID'] || '';

  async function auth() {
    if (token && Date.now() < tokenExp) return token;
    const r = await http(`https://${store}.myikas.com/api/admin/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
    });
    if (!r || !r.access_token) throw new Error('ikas token alınamadı');
    token = r.access_token;
    tokenExp = Date.now() + Math.max(60, (r.expires_in || 3600) - 120) * 1000;
    return token;
  }

  async function gql(query, variables = {}) {
    const r = await http(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth()}` },
      body: JSON.stringify({ query, variables }),
    });
    if (r.errors) { const e = new Error('ikas: ' + r.errors.map((x) => x.message).join(' | ')); e.gql = true; throw e; }
    return r.data;
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

  const PKG_FIELDS = 'id orderPackageNumber orderLineItemIds orderPackageFulfillStatus errorMessage updatedAt trackingInfo { cargoCompany cargoCompanyId trackingNumber trackingLink barcode shippingLabelImage }';
  const ORDER_OPT = {
    salesChannelId: 'salesChannelId',
    orderPackageStatus: 'orderPackageStatus',
    orderPaymentStatus: 'orderPaymentStatus',
    customer: 'customer { firstName lastName email phone }',
    shippingAddress: 'shippingAddress { firstName lastName phone addressLine1 addressLine2 city { name } district { name } }',
    barcodeList: 'barcodeList',
    mainImageId: 'mainImageId',
    shippingLines: 'shippingLines { cargoCompanyId title }',
    cancelledAt: 'cancelledAt',
    updatedAt: 'updatedAt',
    orderPackages: `orderPackages { ${PKG_FIELDS} }`,
  };
  const orderQuery = (o, filter) => `query ($p: PaginationInput, $d: ${filter === 'id' ? 'StringFilterInput' : 'DateFilterInput'}) {
    listOrder(pagination: $p, ${filter}: $d) { hasNext data {
      id orderNumber orderedAt status totalFinalPrice currencyCode ${o.salesChannelId} ${o.orderPackageStatus} ${o.orderPaymentStatus} ${o.cancelledAt} ${o.updatedAt} ${o.shippingLines}
      ${o.customer} ${o.shippingAddress}
      orderLineItems { id quantity price finalPrice status variant { id productId sku name ${o.barcodeList} ${o.mainImageId} } }
      ${o.orderPackages}
    } }
  }`;

  function mapStatus(o) {
    const s = String(o.status || '').toUpperCase(), ps = String(o.orderPackageStatus || '').toUpperCase();
    if (/^(CANCELLED|CANCEL_REJECTED)$/.test(s) || ps === 'CANCELLED') return 'cancelled';
    if (/^REFUNDED$/.test(s) || /REFUNDED|RETURN/.test(ps)) return 'returned';
    if (ps === 'DELIVERED') return 'delivered';
    if (/FULFILLED|SHIPPED|UNABLE_TO_DELIVER/.test(ps) && !/^PARTIALLY|UNFULFILLED/.test(ps)) return 'shipped';
    if (/READY|PARTIALLY|PREPAR/.test(ps)) return 'processing';
    return 'new';
  }

  function normOrder(o) {
    const a = o.shippingAddress || {}, c = o.customer || {};
    const items = (o.orderLineItems || []).map((li) => {
      const v = li.variant || {};
      const unit = num(li.finalPrice ?? li.price);
      return {
        lineId: String(li.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]), name: str(v.name),
        image: v.mainImageId ? imgUrl({ imageId: v.mainImageId, fileName: 'image' }) : '',
        quantity: num(li.quantity, 1), unitPrice: unit, total: unit * num(li.quantity, 1),
        status: /CANCEL|REFUND/i.test(li.status || '') ? 'cancelled' : '', remoteKey: str(v.id),
      };
    });
    // İptal / iade edilmiş paketler panelde gösterilmez (sipariş durumu ayrıca güncellenir)
    const packages = (o.orderPackages || []).filter((pk) => !/^(CANCELLED|REFUNDED|RETURN_|REFUND_REQUEST_ACCEPTED)/.test(pk.orderPackageFulfillStatus || '')).map((pk) => {
      const ti = pk.trackingInfo || {}, st = String(pk.orderPackageFulfillStatus || '');
      return {
        remoteId: String(pk.id),
        items: (pk.orderLineItemIds || []).map((lid) => ({ line_id: String(lid), qty: (items.find((i) => i.lineId === String(lid)) || {}).quantity || 1 })),
        status: /^(DELIVERED|FULFILLED|UNABLE_TO_DELIVER)$/.test(st) ? 'shipped' : 'open', remoteStatus: st,
        cargoCompany: str(ti.cargoCompany), tracking: str(ti.trackingNumber), barcode: str(ti.barcode),
        error: st === 'ERROR' ? str(pk.errorMessage) || 'ikas Kargo hata verdi' : '', labelReady: !!ti.shippingLabelImage,
      };
    });
    const first = packages.find((x) => x.tracking) || {};
    return {
      remoteId: String(o.id), orderNumber: String(o.orderNumber || o.id), orderedAt: typeof o.orderedAt === 'number' ? o.orderedAt : Date.parse(o.orderedAt),
      remoteStatus: [o.status, o.orderPackageStatus, o.orderPaymentStatus].filter(Boolean).join(' / '), status: mapStatus(o),
      customer: [a.firstName || c.firstName, a.lastName || c.lastName].filter(Boolean).join(' '), phone: str(a.phone || c.phone), email: str(c.email),
      address: { name: [a.firstName, a.lastName].filter(Boolean).join(' '), line: [a.addressLine1, a.addressLine2].filter(Boolean).join(' '), district: str(a.district && a.district.name), city: str(a.city && a.city.name), phone: str(a.phone) },
      total: num(o.totalFinalPrice), currency: o.currencyCode || 'TRY',
      cargoCompany: first.cargoCompany || '', tracking: first.tracking || '',
      awaitingPayment: /WAITING/i.test(o.orderPaymentStatus || ''),
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
    let filter = byOrdered ? 'orderedAt' : 'updatedAt', optional = ORDER_OPT;
    for (let page = 1; page <= (byOrdered ? 60 : 20); page++) {
      let data;
      try {
        data = await flex((o) => orderQuery(o, filter), optional, { p: { page, limit: 50 }, d: { gte: since, lte: until } });
      } catch (e) {
        // Eski şemada updatedAt filtresi yoksa sipariş tarihine göre çek
        if (filter === 'updatedAt' && e.gql) { filter = 'orderedAt'; page--; continue; }
        throw e;
      }
      const r = data.listOrder;
      for (const o of r.data || []) {
        if (/DRAFT|WAITING_UPGRADE/i.test(o.status || '')) continue;
        if (salesChannel && o.salesChannelId && o.salesChannelId !== salesChannel) continue;
        out.push(normOrder(o));
      }
      if (!r.hasNext) break;
    }
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
    const q = (o) => `query ($page: Int!) { listProduct(pagination: { page: $page, limit: 100 }) { hasNext data {
      id name ${o.salesChannelIds} variants { id sku ${o.barcodeList} isActive ${o.variantValueIds} prices { sellPrice discountPrice } stocks { stockCount } ${o.images} } } } }`;
    let optional = { barcodeList: 'barcodeList', images: 'images { imageId fileName isMain order isVideo }', salesChannelIds: 'salesChannelIds', variantValueIds: 'variantValueIds { variantTypeId variantValueId }' };
    for (let page = 1; page <= 200; page++) {
      const d = await flex(q, optional, { page });
      for (const p of d.listProduct.data || []) {
        if (salesChannel && Array.isArray(p.salesChannelIds) && !p.salesChannelIds.includes(salesChannel)) continue;
        const vars = p.variants || [];
        // Ürün görseli: varyantın kendi görseli yoksa ürünün ana görseli
        const allImgs = vars.flatMap((v) => v.images || []).filter((i) => !i.isVideo && i.imageId);
        const mainImg = allImgs.find((i) => i.isMain) || allImgs.sort((a, b) => (a.order || 0) - (b.order || 0))[0];
        for (const v of vars) {
          const pr = (v.prices || [])[0] || {};
          const vi = (v.images || []).filter((i) => !i.isVideo && i.imageId);
          const img = vi.find((i) => i.isMain) || vi[0] || mainImg;
          const vname = (v.variantValueIds || []).map((x) => values.get(x.variantValueId)).filter(Boolean).join(' / ');
          out.push({
            remoteId: String(v.id), remoteProductId: String(p.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]),
            name: vname ? `${p.name} - ${vname}` : p.name, groupName: p.name, variantName: vname,
            image: imgUrl(img, 360), price: num(pr.discountPrice || pr.sellPrice), listPrice: num(pr.sellPrice),
            stock: (v.stocks || []).reduce((s, x) => s + num(x.stockCount), 0), active: v.isActive !== false,
          });
        }
      }
      if (!d.listProduct.hasNext) break;
    }
    return out;
  }

  async function location() {
    if (locationId) return locationId;
    const d = await gql('{ listStockLocation { id name } }');
    const l = (d.listStockLocation || [])[0];
    if (!l) throw new Error('ikas stok lokasyonu bulunamadı (' + p + 'STOCK_LOCATION_ID tanımlayın)');
    return (locationId = l.id);
  }

  async function pushStock(items) {
    const loc = await location();
    for (let i = 0; i < items.length; i += 100) {
      const part = items.slice(i, i + 100);
      await gql('mutation ($input: SaveStockLocationsInput!) { saveVariantStocks(input: $input) }', {
        input: { productStockLocationInputs: part.map((x) => ({ productId: x.remoteProductId, variantId: x.remoteId, stockLocationId: loc, stockCount: x.stock })) },
      });
    }
  }

  async function pushPrice(items) {
    for (let i = 0; i < items.length; i += 100) {
      await gql('mutation ($input: SaveVariantPricesInput!) { saveVariantPrices(input: $input) }', {
        input: {
          variantPriceInputs: items.slice(i, i + 100).map((x) => ({
            productId: x.remoteProductId, variantId: x.remoteId,
            price: x.listPrice && x.listPrice > x.price ? { sellPrice: x.listPrice, discountPrice: x.price } : { sellPrice: x.price },
          })),
        },
      });
    }
  }

  // ---------- kargo (ikas Kargo) ----------
  let cargoCache = null;
  async function cargoOptions() {
    if (!cargoCache) {
      const d = await gql('{ listCargoCompany { id name } }');
      cargoCache = (d.listCargoCompany || []).map((c) => ({ id: String(c.id), name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }
    return [{ id: '', name: 'ikas Kargo (ikas panelindeki kargo önceliğine göre)' }, ...cargoCache];
  }
  const cargoInfo = (cargo) => (cargo && cargo.id ? { cargoCompanyId: cargo.id, cargoCompany: cargo.name } : undefined);
  // Paket alanlarıyla dönen mutasyonlar: şemada olmayan alan hata verirse o alan çıkarılıp tekrar denenir
  let pkgFields = PKG_FIELDS;
  async function gqlPkg(build, variables) {
    for (;;) {
      try { return await gql(build(pkgFields), variables); } catch (e) {
        const f = e.gql && /cannot query field "(\w+)"/i.exec(e.message);
        const re = f && new RegExp(`\\s${f[1]}(\\s*\\{[^{}]*\\})?(?=[\\s}])`);
        if (!re || !re.test(' ' + pkgFields + ' ')) throw e;
        pkgFields = (' ' + pkgFields + ' ').replace(re, '').trim();
      }
    }
  }
  const FULFILL = (pf) => `mutation ($input: FulFillOrderInput!) { fulfillOrder(input: $input) { id orderPackages { ${pf} } } }`;

  // Tek siparişi kimliğiyle oku (etiket / barkod kontrolü için)
  async function getOrder(remoteId) {
    const d = await flex((o) => orderQuery(o, 'id'), ORDER_OPT, { p: { page: 1, limit: 1 }, d: { eq: remoteId } });
    const o = (d.listOrder.data || [])[0];
    if (!o) throw new Error('ikas: sipariş bulunamadı');
    return o;
  }

  // Paketle: her yerel paket ikas'ta "Kargoya Hazır" paket olarak oluşturulur → ikas Kargo barkod/etiket üretir
  async function pack(order, pkgs, { cargo } = {}) {
    const out = [];
    for (const pkg of pkgs) {
      const lines = pkg.items.map((x) => ({ orderLineItemId: String(x.line_id), quantity: x.qty }));
      const d = await gqlPkg(FULFILL, { input: { orderId: order.remote_id, lines, markAsReadyForShipment: true, sendNotificationToCustomer: false, trackingInfoDetail: cargoInfo(cargo) } });
      const pks = ((d.fulfillOrder || {}).orderPackages || []).filter((x) => !/CANCEL|REFUND/.test(x.orderPackageFulfillStatus || ''));
      const pk = pks.filter((x) => (x.orderLineItemIds || []).some((l) => lines.some((y) => y.orderLineItemId === String(l)))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (!pk) throw new Error('ikas paketi oluşturdu ama paket bilgisi dönmedi; birazdan senkronlayın');
      const ti = pk.trackingInfo || {};
      out.push({ remoteId: String(pk.id), remoteStatus: pk.orderPackageFulfillStatus, barcode: str(ti.barcode), tracking: str(ti.trackingNumber), cargoCompany: str(ti.cargoCompany) || (cargo && cargo.name) || '', error: pk.orderPackageFulfillStatus === 'ERROR' ? str(pk.errorMessage) : '' });
    }
    return { packages: out, message: `${out.length} paket ikas'ta "Kargoya Hazır" olarak oluşturuldu; ikas Kargo barkodu hazırlıyor` };
  }

  // Etiket: ikas Kargo'nun ürettiği etiket görseli; yoksa barkod (panel etiketine basılır); hata varsa ikas'ın mesajı
  async function label(order, pkg) {
    if (!pkg.remote_id) return { pending: 'Önce paketleyin (ikas\'ta Kargoya Hazır)' };
    const o = await getOrder(order.remote_id);
    const pk = (o.orderPackages || []).find((x) => String(x.id) === String(pkg.remote_id));
    if (!pk) throw new Error('Paket ikas\'ta bulunamadı (ikas panelinden iptal edilmiş olabilir); senkronlayın');
    if (pk.orderPackageFulfillStatus === 'ERROR') throw new Error('ikas Kargo: ' + (str(pk.errorMessage) || 'barkod oluşturulamadı') + ' (müşteri telefonu ve depo adresi eksiksiz olmalı)');
    const ti = pk.trackingInfo || {};
    const info = { barcode: str(ti.barcode), tracking: str(ti.trackingNumber), cargoCompany: str(ti.cargoCompany), remoteStatus: pk.orderPackageFulfillStatus };
    if (ti.shippingLabelImage) {
      const lab = await labelFrom(ti.shippingLabelImage, `ikas-${order.order_number}-${pkg.no}`);
      if (lab) return { ...info, label: lab };
    }
    if (info.barcode || info.tracking) return { ...info, panel: true };
    return { ...info, pending: 'ikas Kargo barkodu henüz oluşmadı. Birkaç saniye sonra tekrar deneyin; uzun sürerse ikas panelinde kargo entegrasyonu ve kargo önceliğini kontrol edin.' };
  }

  // Kargoya ver: ikas Kargo paketi zaten varsa "Gönderildi" (FULFILLED) yapılır; yoksa takip bilgisiyle gönderilir
  async function ship(order, pkg, { cargoCompany, tracking }) {
    if (pkg.remote_id) {
      await gql('mutation ($input: UpdateOrderPackageStatusInput!) { updateOrderPackageStatus(input: $input) { id } }', {
        input: { orderId: order.remote_id, packages: [{ packageId: pkg.remote_id, status: 'FULFILLED', trackingInfo: tracking && tracking !== pkg.tracking && tracking !== pkg.barcode ? { trackingNumber: tracking, cargoCompany: cargoCompany || undefined, isSendNotification: true } : undefined }] },
      });
      return { remoteId: pkg.remote_id };
    }
    const lines = pkg.items.map((x) => ({ orderLineItemId: String(x.line_id), quantity: x.qty }));
    const d = await gqlPkg(FULFILL, { input: { orderId: order.remote_id, lines, sendNotificationToCustomer: true, trackingInfoDetail: tracking ? { cargoCompany: cargoCompany || '', trackingNumber: tracking, isSendNotification: true } : undefined } });
    const pk = ((d.fulfillOrder || {}).orderPackages || []).find((x) => (x.orderLineItemIds || []).some((l) => lines.some((y) => y.orderLineItemId === String(l))));
    return { remoteId: pk ? String(pk.id) : null };
  }

  // Paketi iptal et (ikas'ta paketlemeyi geri al) — kargo firmasını değiştirmek veya yeniden bölmek için
  async function cancelPackage(order, pkg) {
    if (!pkg.remote_id) return;
    await gql('mutation ($input: CancelFulfillmentInput!) { cancelFulfillment(input: $input) { id } }', { input: { orderId: order.remote_id, orderPackageId: pkg.remote_id } });
  }
  // Kargo firması değiştir: barkod oluşmadan önce paket iptal edilip seçilen firmayla yeniden "Kargoya Hazır" yapılır
  async function changeCargo(order, pkg, cargo) {
    if (pkg.barcode || pkg.tracking) throw new Error('Barkod oluştuktan sonra ikas Kargo firması değiştirilemez. Önce "Paketi iptal et", sonra yeniden paketleyin.');
    await cancelPackage(order, pkg);
    const r = await pack(order, [pkg], { cargo });
    return r.packages[0];
  }

  async function createProduct(pr) {
    const d = await gql('mutation ($input: ProductInput!) { saveProduct(input: $input) { id variants { id } } }', {
      input: {
        name: pr.name, type: 'PHYSICAL', description: pr.description || '',
        salesChannelIds: salesChannel ? [salesChannel] : undefined,
        variants: [{ sku: pr.sku || undefined, barcodeList: pr.barcode ? [pr.barcode] : [], isActive: true, prices: [{ sellPrice: pr.sale_price }] }],
      },
    });
    const prod = d.saveProduct, v = (prod.variants || [])[0];
    const listing = { remoteId: String(v.id), remoteProductId: String(prod.id), sku: pr.sku, barcode: pr.barcode, name: pr.name, price: pr.sale_price, stock: 0 };
    await pushStock([{ ...listing, stock: Math.max(0, pr.stock) }]);
    return { ...listing, stock: Math.max(0, pr.stock) };
  }

  const missing = [p + 'STORE', p + 'CLIENT_ID', p + 'CLIENT_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'ikas', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', pack: 'remote', ship: 'remote', label: 'remote', cargo: 'pack', cancelPackage: true, createProduct: true, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, createProduct, cargoOptions, pack, label, cancelPackage, changeCargo,
  };
}
