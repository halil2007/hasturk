// Amazon (Selling Partner API). Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme: kendi (özel) uygulamanızı oluşturup
// mağazanız için yetkilendirin → LWA Client ID / Client Secret + refresh token (Atzr|…). Satıcı Token: Ayarlar → Hesap Bilgileri.
// Kimlik: LWA (api.amazon.com/auth/o2/token, refresh_token) → x-amz-access-token başlığı (SigV4 imzası gerekmez). Belirteç süresince saklanır.
// Siparişler: /orders/v0 (senkronda LastUpdatedAfter, geçmiş aktarımında CreatedAfter). Alıcı adı / açık adres / telefon kısıtlı veridir (RDT):
// yalnız il / ilçe gelir, ad boş kalır. Satır servisi (orderItems) yavaş kotalıdır (0,5 istek/sn): çağrı başına en yeni 100 sipariş işlenir,
// fazlası uyarıyla bildirilir. FBA (AFN) siparişlerini Amazon gönderir: durum OrderStatus'tan okunur, panelden kargoya verilmez.
// Ürün / stok / fiyat: Listings Items 2021-08-01 (searchListingsItems; patchListingsItem SKU başına bir istek, 5 istek/sn).
// Kargoya verme: shipmentConfirmation (takip no + kargo firması). Ürün oluşturma, etiket, iade yok.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, sleep, diagStep, imageList } from '../util.js';

const STATUS = { Pending: 'new', PendingAvailability: 'new', Unshipped: 'new', InvoiceUnconfirmed: 'new', PartiallyShipped: 'processing', Shipped: 'shipped', Canceled: 'cancelled', Unfulfillable: 'cancelled' };
// Pazar yeri → para birimi (fiyat gönderiminde purchasable_offer.currency)
const CURRENCY = { A33AVAJ2PDY3EV: 'TRY', A1PA6795UKMFR9: 'EUR', A13V1IB3VIYZZH: 'EUR', APJ6JRA9NG5V4: 'EUR', A1RKKUPIHCS9HS: 'EUR', A1805IZSGTT6HS: 'EUR', AMEN7PMS3EDWL: 'EUR',
  A1F83G8C2ARO7P: 'GBP', A2NODRKZP88ZB9: 'SEK', A1C3SOZRARQ6R3: 'PLN', A2VIGQ35RCS4UG: 'AED', A17E79C6D8DWNP: 'SAR', ARBP9OOSHTCHU: 'EGP', A21TJRUUN4KGV: 'INR',
  ATVPDKIKX0DER: 'USD', A2EUQ1WTGCTBG2: 'CAD', A1AM78C64UM0Y8: 'MXN', A2Q3Y263D00KWC: 'BRL', A1VC38T7YXB528: 'JPY', A39IBJ37TRP1C6: 'AUD', A19VAU5U5O7RUS: 'SGD' };
const MAX_ORDERS = 100;
const money = (m) => num(m && m.Amount);
const iso = (ms) => encodeURIComponent(new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'));

export function amazon(env, meta) {
  const seller = str(env.AMAZON_SELLER_ID), market = str(env.AMAZON_MARKETPLACE_ID) || 'A33AVAJ2PDY3EV';
  const region = { na: 'na', fe: 'fe' }[str(env.AMAZON_REGION).toLowerCase()] || 'eu';
  const API = `https://${str(env.AMAZON_SANDBOX) === '1' ? 'sandbox.' : ''}sellingpartnerapi-${region}.amazon.com`;
  const currency = CURRENCY[market] || 'TRY', mq = `marketplaceIds=${encodeURIComponent(market)}`;
  const types = new Map(); // SKU → productType (ürün listesinden; yoksa PRODUCT)

  let token = null, exp = 0;
  async function auth() {
    if (token && Date.now() < exp) return token;
    const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: str(env.AMAZON_REFRESH_TOKEN), client_id: str(env.AMAZON_CLIENT_ID), client_secret: str(env.AMAZON_CLIENT_SECRET) });
    const r = await http('https://api.amazon.com/auth/o2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: form.toString() });
    if (!r || !r.access_token) throw new Error('Amazon erişim belirteci alınamadı (LWA bilgileri / refresh token kontrol edin)');
    token = r.access_token;
    exp = Date.now() + Math.max(60, num(r.expires_in, 3600) - 120) * 1000;
    return token;
  }
  const call = async (path, opts = {}) => http(API + path, { ...opts, headers: { 'x-amz-access-token': await auth(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: opts.body && JSON.stringify(opts.body) });

  async function orderItems(id) {
    const out = [];
    let next = '';
    for (let page = 0; page < 10; page++) {
      const r = await call(`/orders/v0/orders/${encodeURIComponent(id)}/orderItems${next ? '?NextToken=' + encodeURIComponent(next) : ''}`, { tries: 4 });
      const p = (r && r.payload) || {};
      out.push(...(p.OrderItems || []));
      next = p.NextToken;
      if (!next) break;
      await sleep(500);
    }
    return out;
  }

  function norm(o, lines) {
    const status = STATUS[o.OrderStatus] || 'new', a = o.ShippingAddress || {}, b = o.BuyerInfo || {};
    const items = lines.map((it) => {
      const qty = num(it.QuantityOrdered) || 1, total = money(it.ItemPrice);
      return { lineId: str(it.OrderItemId), sku: str(it.SellerSKU), barcode: '', name: str(it.Title), image: '', quantity: qty, unitPrice: total / qty, total,
        status: status === 'cancelled' ? 'cancelled' : '', remoteKey: str(it.SellerSKU) };
    });
    // Türkiye adreslerinde il StateOrRegion, ilçe City alanında gelir (bölge yoksa City il kabul edilir)
    const city = str(a.StateOrRegion || a.City), district = str(a.StateOrRegion ? a.City || a.County || a.District : a.County || a.District);
    return {
      remoteId: str(o.AmazonOrderId), orderNumber: str(o.AmazonOrderId), orderedAt: Date.parse(o.PurchaseDate) || Date.now(),
      remoteStatus: str(o.OrderStatus) + (o.FulfillmentChannel === 'AFN' ? ' (FBA)' : ''), status,
      customer: str(a.Name || b.BuyerName), phone: str(a.Phone), email: str(b.BuyerEmail), customerId: '',
      address: { name: str(a.Name), line: [a.AddressLine1, a.AddressLine2, a.AddressLine3].map(str).filter(Boolean).join(' '), district, city, phone: str(a.Phone) },
      total: money(o.OrderTotal) || items.reduce((s, i) => s + (i.status ? 0 : i.total), 0), currency: str(o.OrderTotal && o.OrderTotal.CurrencyCode) || currency,
      cargoCompany: '', tracking: '', shipBy: Date.parse(o.LatestShipDate) || null, items, packages: null,
    };
  }

  // since/until ms. Senkronda "son güncelleme", geçmiş aktarımında (byOrdered) "sipariş tarihi" aralığı. Bitiş en geç 2 dk öncesi olabilir.
  async function fetchOrders(since, until, { byOrdered } = {}) {
    const limit = Date.now() - 125e3, k = byOrdered ? 'Created' : 'LastUpdated';
    if (since >= Math.min(until, limit)) return [];
    const first = `MarketplaceIds=${encodeURIComponent(market)}&${k}After=${iso(since)}${until < limit ? `&${k}Before=${iso(until)}` : ''}&MaxResultsPerPage=100`;
    const heads = [];
    let next = '';
    for (let page = 0; page < 20; page++) {
      const r = await call('/orders/v0/orders?' + (next ? `MarketplaceIds=${encodeURIComponent(market)}&NextToken=${encodeURIComponent(next)}` : first), { tries: 4 });
      const p = (r && r.payload) || {};
      heads.push(...(p.Orders || []));
      next = p.NextToken;
      if (!next) break;
    }
    const key = (o) => Date.parse(byOrdered ? o.PurchaseDate : o.LastUpdateDate || o.PurchaseDate) || 0;
    heads.sort((x, y) => key(y) - key(x));
    const out = [];
    for (const [i, o] of heads.slice(0, MAX_ORDERS).entries()) {
      if (i) await sleep(500);
      out.push(norm(o, await orderItems(o.AmazonOrderId)));
    }
    if (heads.length > MAX_ORDERS) out.warnings = [`Amazon: ${heads.length} siparişin en yeni ${MAX_ORDERS} tanesi işlendi (satır servisi kotası); eskiler için geçmiş sipariş aktarımını kullanın`];
    return out;
  }

  async function fetchListings() {
    const out = [];
    let next = '';
    for (let page = 0; page < 250; page++) {
      const r = await call(`/listings/2021-08-01/items/${encodeURIComponent(seller)}?${mq}&includedData=summaries,offers,fulfillmentAvailability&pageSize=20${next ? '&pageToken=' + encodeURIComponent(next) : ''}`, { tries: 4 });
      for (const it of (r && r.items) || []) {
        const s = (it.summaries || []).find((x) => x.marketplaceId === market) || (it.summaries || [])[0] || {};
        const offers = it.offers || [], o = offers.find((x) => x.marketplaceId === market && x.offerType !== 'B2B') || offers[0] || {};
        const fa = it.fulfillmentAvailability || [], f = fa.find((x) => x.fulfillmentChannelCode === 'DEFAULT');
        const img = str(s.mainImage && s.mainImage.link);
        if (s.productType) types.set(str(it.sku), s.productType);
        out.push({ remoteId: str(it.sku), remoteProductId: str(s.asin), sku: str(it.sku), barcode: '', name: str(s.itemName), groupName: str(s.itemName), variantName: '',
          image: img, images: imageList([img]), price: num(o.price && o.price.amount), listPrice: num(o.price && o.price.amount),
          stock: f ? num(f.quantity) : fa.reduce((t, x) => t + num(x.quantity), 0), active: (s.status || []).includes('BUYABLE') });
      }
      next = r && r.pagination && r.pagination.nextToken;
      if (!next) break;
      await sleep(250);
    }
    return out;
  }

  // patchListingsItem: SKU başına bir istek; Amazon kabul etmezse (INVALID) sorunlar toplanıp hata olarak bildirilir
  async function patch(items, fn) {
    const errs = [];
    for (const [i, x] of items.entries()) {
      if (i) await sleep(250);
      const sku = str(x.remoteId || x.sku);
      const r = await call(`/listings/2021-08-01/items/${encodeURIComponent(seller)}/${encodeURIComponent(sku)}?${mq}`, { method: 'PATCH', tries: 4, body: { productType: types.get(sku) || 'PRODUCT', patches: [fn(x)] } });
      if (r && r.status === 'INVALID') errs.push(`${sku}: ${(r.issues || []).map((s) => s.message).join(' · ') || 'reddedildi'}`);
    }
    if (errs.length) throw new Error('Amazon güncellemeyi reddetti: ' + errs.slice(0, 5).join(' | '));
  }
  const pushStock = (items) => patch(items, (x) => ({ op: 'replace', path: '/attributes/fulfillment_availability', value: [{ fulfillment_channel_code: 'DEFAULT', quantity: Math.max(0, Math.round(num(x.stock))) }] }));
  const pushPrice = (items) => patch(items, (x) => ({ op: 'replace', path: '/attributes/purchasable_offer', value: [{ marketplace_id: market, currency, our_price: [{ schedule: [{ value_with_tax: num(x.price) }] }] }] }));

  // Kargoya ver: shipmentConfirmation (paket satırları + takip no). FBA siparişini Amazon gönderir.
  async function ship(order, pkg, { cargoCompany, tracking }) {
    if (/FBA/.test(str(order.remote_status))) throw new Error('Amazon: FBA siparişi Amazon tarafından gönderilir');
    if (!tracking) throw new Error('Amazon: kargoya vermek için takip numarası girin');
    const lines = (pkg.items && pkg.items.length ? pkg.items : (order.items || []).filter((i) => i.status !== 'cancelled').map((i) => ({ line_id: i.line_id, qty: i.quantity })))
      .map((i) => ({ orderItemId: String(i.line_id), quantity: num(i.qty, 1) }));
    await call(`/orders/v0/orders/${encodeURIComponent(order.remote_id)}/shipmentConfirmation`, { method: 'POST', body: {
      marketplaceId: market, packageDetail: { packageReferenceId: String(pkg.no || pkg.id || 1), carrierCode: 'Other', carrierName: str(cargoCompany) || 'Other', trackingNumber: str(tracking),
        shipDate: new Date().toISOString(), orderItems: lines } } });
    return { tracking };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik (LWA belirteci)', async () => { await auth(); return { detail: `alındı · ${API.replace('https://', '')} · pazar yeri ${market}` }; });
    await diagStep(out, 'Sipariş servisi (son 24 saat)', async () => { const r = await call(`/orders/v0/orders?MarketplaceIds=${encodeURIComponent(market)}&CreatedAfter=${iso(now - 864e5)}&MaxResultsPerPage=1`); const o = ((r && r.payload) || {}).Orders || []; return { detail: `erişildi · ${o.length ? `örnek: ${o[0].AmazonOrderId} ${o[0].OrderStatus}` : 'sipariş yok'}` }; });
    await diagStep(out, 'Ürün listesi (Listings Items)', async () => { const r = await call(`/listings/2021-08-01/items/${encodeURIComponent(seller)}?${mq}&includedData=summaries&pageSize=1`); return { detail: `erişildi · ${r && r.numberOfResults != null ? r.numberOfResults + ' SKU' : 'ürün örneği alındı'} · satıcı ${seller}` }; });
    if (orderId) await diagStep(out, 'Sipariş', async () => { const r = await call(`/orders/v0/orders/${encodeURIComponent(orderId)}`); return { detail: JSON.stringify((r && r.payload) || r).slice(0, 600) }; });
    return out;
  }

  const missing = ['AMAZON_SELLER_ID', 'AMAZON_CLIENT_ID', 'AMAZON_CLIENT_SECRET', 'AMAZON_REFRESH_TOKEN'].filter((k) => !env[k]);
  return {
    ...meta, type: 'amazon', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
