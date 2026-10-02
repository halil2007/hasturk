// ikas (GraphQL Admin API). Her ikas mağazası için bir özel uygulama gerekir:
// ikas paneli → Uygulamalar → Özel uygulama → izinler: Ürünler, Siparişler, Stok (okuma + yazma).
import { http, num, str } from '../util.js';

const API = 'https://api.myikas.com/api/v1/admin/graphql';

export function ikas(env, p, meta) {
  const store = env[p + 'STORE'], id = env[p + 'CLIENT_ID'], secret = env[p + 'CLIENT_SECRET'];
  const salesChannel = env[p + 'SALES_CHANNEL_ID'] || '';
  const merchant = env[p + 'MERCHANT_ID'] || '';
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
        const bad = Object.keys(active).sort((a, b) => b.length - a.length).find((k) => active[k] && msg.includes(k.toLowerCase()));
        if (!e.gql || !bad) throw e;
        active[bad] = '';
      }
    }
  }

  const ORDER_OPT = {
    salesChannelId: 'salesChannelId',
    orderPackageStatus: 'orderPackageStatus',
    orderPaymentStatus: 'orderPaymentStatus',
    customer: 'customer { firstName lastName email phone }',
    shippingAddress: 'shippingAddress { firstName lastName phone addressLine1 addressLine2 city { name } district { name } }',
    barcodeList: 'barcodeList',
    mainImageId: 'mainImageId',
    orderPackages: 'orderPackages { id orderLineItemIds orderPackageFulfillStatus trackingInfo { cargoCompany trackingNumber trackingLink } }',
  };
  const orderQuery = (o, filter) => `query ($p: PaginationInput, $d: DateFilterInput) {
    listOrder(pagination: $p, ${filter}: $d) { hasNext data {
      id orderNumber orderedAt status totalFinalPrice currencyCode ${o.salesChannelId} ${o.orderPackageStatus} ${o.orderPaymentStatus}
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
        image: merchant && v.mainImageId ? `https://cdn.myikas.com/images/${merchant}/${v.mainImageId}/image_180.webp` : '',
        quantity: num(li.quantity, 1), unitPrice: unit, total: unit * num(li.quantity, 1),
        status: /CANCEL|REFUND/i.test(li.status || '') ? 'cancelled' : '', remoteKey: str(v.id),
      };
    });
    const packages = (o.orderPackages || []).map((pk) => ({
      remoteId: String(pk.id),
      items: (pk.orderLineItemIds || []).map((lid) => ({ line_id: String(lid), qty: (items.find((i) => i.lineId === String(lid)) || {}).quantity || 1 })),
      status: /DELIVERED|FULFILLED|SHIPPED/i.test(pk.orderPackageFulfillStatus || '') ? 'shipped' : 'open',
      cargoCompany: str(pk.trackingInfo && pk.trackingInfo.cargoCompany), tracking: str(pk.trackingInfo && pk.trackingInfo.trackingNumber),
    }));
    const first = packages.find((x) => x.tracking) || {};
    return {
      remoteId: String(o.id), orderNumber: String(o.orderNumber || o.id), orderedAt: typeof o.orderedAt === 'number' ? o.orderedAt : Date.parse(o.orderedAt),
      remoteStatus: [o.status, o.orderPackageStatus, o.orderPaymentStatus].filter(Boolean).join(' / '), status: mapStatus(o),
      customer: [a.firstName || c.firstName, a.lastName || c.lastName].filter(Boolean).join(' '), phone: str(a.phone || c.phone), email: str(c.email),
      address: { name: [a.firstName, a.lastName].filter(Boolean).join(' '), line: [a.addressLine1, a.addressLine2].filter(Boolean).join(' '), district: str(a.district && a.district.name), city: str(a.city && a.city.name), phone: str(a.phone) },
      total: num(o.totalFinalPrice), currency: o.currencyCode || 'TRY',
      cargoCompany: first.cargoCompany || '', tracking: first.tracking || '',
      awaitingPayment: /WAITING/i.test(o.orderPaymentStatus || ''),
      items, packages,
    };
  }

  async function fetchOrders(since, until) {
    const out = [];
    let filter = 'updatedAt', optional = ORDER_OPT;
    for (let page = 1; page <= 20; page++) {
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

  async function fetchListings() {
    const out = [];
    const q = (o) => `query ($page: Int!) { listProduct(pagination: { page: $page, limit: 100 }) { hasNext data {
      id name ${o.salesChannelIds} variants { id sku ${o.barcodeList} isActive prices { sellPrice discountPrice } stocks { stockCount } ${o.images} } } } }`;
    let optional = { barcodeList: 'barcodeList', images: 'images { imageId isMain }', salesChannelIds: 'salesChannelIds' };
    for (let page = 1; page <= 100; page++) {
      const d = await flex(q, optional, { page });
      for (const p of d.listProduct.data || []) {
        if (salesChannel && Array.isArray(p.salesChannelIds) && !p.salesChannelIds.includes(salesChannel)) continue;
        for (const v of p.variants || []) {
          const pr = (v.prices || [])[0] || {};
          const img = (v.images || []).find((i) => i.isMain) || (v.images || [])[0];
          out.push({
            remoteId: String(v.id), remoteProductId: String(p.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]),
            name: p.variants.length > 1 && v.sku ? `${p.name} (${v.sku})` : p.name,
            image: merchant && img ? `https://cdn.myikas.com/images/${merchant}/${img.imageId}/image_180.webp` : '',
            price: num(pr.discountPrice || pr.sellPrice), listPrice: num(pr.sellPrice),
            stock: (v.stocks || []).reduce((s, x) => s + num(x.stockCount), 0),
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

  // ikas'ta "kargoya verme" = paketi gönderildi olarak işaretleme (fulfillOrder). Takip no müşteriye bildirilir.
  async function ship(order, pkg, { cargoCompany, tracking }) {
    const lines = pkg.items.map((x) => ({ orderLineItemId: x.line_id, quantity: x.qty }));
    const d = await gql(`mutation ($input: FulfillOrderInput!) { fulfillOrder(input: $input) { id orderPackages { id orderLineItemIds } } }`, {
      input: {
        orderId: order.remote_id, lines,
        trackingInfoDetail: tracking ? { cargoCompany: cargoCompany || '', trackingNumber: tracking, isSendNotification: true } : undefined,
      },
    });
    const pk = ((d.fulfillOrder || {}).orderPackages || []).find((x) => (x.orderLineItemIds || []).some((l) => lines.some((y) => y.orderLineItemId === String(l))));
    return { remoteId: pk ? String(pk.id) : null };
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
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: true, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, createProduct,
  };
}
