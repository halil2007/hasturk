// Amazon (Selling Partner API). Seller Central → Uygulamalar ve Hizmetler → Uygulama geliştirme: kendi (özel) uygulamanızı oluşturup
// mağazanız için yetkilendirin → LWA Client ID / Client Secret + refresh token (Atzr|…). Satıcı Token: Ayarlar → Hesap Bilgileri.
// Kimlik: LWA (api.amazon.com/auth/o2/token, refresh_token) → x-amz-access-token başlığı (SigV4 imzası gerekmez). Belirteç süresince saklanır.
// Siparişler: /orders/v0 (senkronda LastUpdatedAfter, geçmiş aktarımında CreatedAfter). Alıcı adı / açık adres / telefon kısıtlı veridir (RDT):
// yalnız il / ilçe gelir, ad boş kalır. Satır servisi (orderItems) yavaş kotalıdır (0,5 istek/sn): çağrı başına en eski 100 sipariş işlenir,
// fazlası varsa imleç son işlenenin güncellenme zamanında kalır (partialUntil), kalanlar sonraki senkronda. FBA (AFN) siparişlerini Amazon gönderir: durum OrderStatus'tan okunur, panelden kargoya verilmez.
// Ürün / stok / fiyat: Listings Items 2021-08-01 (searchListingsItems; patchListingsItem SKU başına bir istek, 5 istek/sn).
// Kargoya verme: shipmentConfirmation (takip no + kargo firması). Etiket, iade yok.
// Ürün yükleme (Ürün Yükle / Kanallarda yayınla): kategori = Amazon ürün tipi (Product Type Definitions), ilan putListingsItem ile (aşağıda).
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, r2, sleep, diagStep, imageList, oneAxis, DEAD_LINE } from '../util.js';

const STATUS = { Pending: 'new', PendingAvailability: 'new', Unshipped: 'new', InvoiceUnconfirmed: 'new', PartiallyShipped: 'processing', Shipped: 'shipped', Canceled: 'cancelled', Unfulfillable: 'cancelled' };
// Pazar yeri → para birimi (fiyat gönderiminde purchasable_offer.currency)
const CURRENCY = { A33AVAJ2PDY3EV: 'TRY', A1PA6795UKMFR9: 'EUR', A13V1IB3VIYZZH: 'EUR', APJ6JRA9NG5V4: 'EUR', A1RKKUPIHCS9HS: 'EUR', A1805IZSGTT6HS: 'EUR', AMEN7PMS3EDWL: 'EUR',
  A1F83G8C2ARO7P: 'GBP', A2NODRKZP88ZB9: 'SEK', A1C3SOZRARQ6R3: 'PLN', A2VIGQ35RCS4UG: 'AED', A17E79C6D8DWNP: 'SAR', ARBP9OOSHTCHU: 'EGP', A21TJRUUN4KGV: 'INR',
  ATVPDKIKX0DER: 'USD', A2EUQ1WTGCTBG2: 'CAD', A1AM78C64UM0Y8: 'MXN', A2Q3Y263D00KWC: 'BRL', A1VC38T7YXB528: 'JPY', A39IBJ37TRP1C6: 'AUD', A19VAU5U5O7RUS: 'SGD' };
const MAX_ORDERS = 100;
const money = (m) => num(m && m.Amount);
// Ürün tipi listesi ve şemalar modül düzeyinde önbellekte (kanal nesnesi istek başına yeniden kurulabilir): API + pazar yeri + satıcı anahtarıyla, 6 saat
const PT_CACHE = new Map(), SCHEMA_CACHE = new Map();
const iso = (ms) => encodeURIComponent(new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z'));
// Açıklama düz metne çevrilir: Amazon metin alanlarında HTML etiketi kabul etmez ("An HTML tag cannot be included in this field",
// Listings Items API Issues Troubleshooting)
const plain = (h) => String(h || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim();
const bytes = (s) => new TextEncoder().encode(s).length;
// Uzun metin sınırda kelime ortasından değil son boşluktan kesilir (yalnız açıklama; ürün adı kesilmez, eksik bildirilir)
function cut(s, max, inBytes) {
  const len = (x) => (inBytes ? bytes(x) : x.length);
  if (!max || len(s) <= max) return s;
  let t = s.slice(0, max);
  while (t && len(t) > max) t = t.slice(0, -1);
  const sp = t.lastIndexOf(' ');
  return (sp > max * 0.6 ? t.slice(0, sp) : t).trim();
}
// Listings Items 2021-08-01 Issue: { code, message, severity: ERROR | WARNING | INFO, attributeNames, categories }; yalnız ERROR gönderimi durdurur
const issueText = (list) => [...new Set((list || []).filter((i) => i && i.severity === 'ERROR').map((i) => str(i.message)).filter(Boolean))].join(' · ').slice(0, 900);
// ErrorList: { errors: [{ code, message, details }] } (400 / 403 / 404 / 413 / 415 / 429 / 500 / 503)
const apiErr = (e) => ((e && e.data && Array.isArray(e.data.errors) && e.data.errors.map((x) => [str(x.message), str(x.details)].filter(Boolean).join(' ')).filter(Boolean).join(' · ')) || str(e && e.message)).slice(0, 900);

export function amazon(env, meta) {
  const seller = str(env.AMAZON_SELLER_ID), market = str(env.AMAZON_MARKETPLACE_ID) || 'A33AVAJ2PDY3EV';
  const region = { na: 'na', fe: 'fe' }[str(env.AMAZON_REGION).toLowerCase()] || 'eu';
  const API = `https://${str(env.AMAZON_SANDBOX) === '1' ? 'sandbox.' : ''}sellingpartnerapi-${region}.amazon.com`;
  const currency = CURRENCY[market] || 'TRY', mq = `marketplaceIds=${encodeURIComponent(market)}`;
  const types = new Map(); // SKU → productType (ürün listesinden; yoksa PRODUCT)
  const fba = new Set(), seen = new Set(); // Amazon deposundaki (FBA) SKU'lar: stok gönderilmez (DEFAULT kanalı yazılırsa ilan satıcı gönderimine dönerdi)
  // DEFAULT (satıcı gönderimi) kanalı olmayan SKU Amazon deposunda (FBA): stoğu Amazon tutar
  const known = (it) => {
    const sku = str(it.sku), fa = it.fulfillmentAvailability || [];
    seen.add(sku);
    if (fa.length && !fa.some((x) => x.fulfillmentChannelCode === 'DEFAULT')) fba.add(sku); else fba.delete(sku);
  };
  // Ürün listesi bu bağlantıda okunmadıysa SKU'nun gönderim kanalı tek tek sorulur (okunamazsa eskisi gibi gönderilir)
  async function isFba(sku) {
    if (!seen.has(sku)) {
      const r = await call(`/listings/2021-08-01/items/${encodeURIComponent(seller)}/${encodeURIComponent(sku)}?${mq}&includedData=summaries,fulfillmentAvailability`, { tries: 4 }).catch((e) => { if (e.budget) throw e; return null; });
      if (r) { const s = (r.summaries || []).find((x) => x.marketplaceId === market) || (r.summaries || [])[0]; if (s && s.productType) types.set(sku, s.productType); known({ ...r, sku }); }
    }
    return fba.has(sku);
  }

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
      // Satır tutarı: ItemPrice − satıcının verdiği promosyon indirimi (PromotionDiscount)
      const qty = num(it.QuantityOrdered) || 1, total = Math.round((money(it.ItemPrice) - money(it.PromotionDiscount)) * 100) / 100;
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
    // Eskiden yeniye: en eski 100 işlenir, imleç son işlenenin zamanında kalır (en yeniler işlenip imleç ilerleyince eskiler kaybolurdu)
    heads.sort((x, y) => key(x) - key(y));
    const out = [], done = heads.slice(0, MAX_ORDERS);
    for (const [i, o] of done.entries()) {
      if (i) await sleep(500);
      out.push(norm(o, await orderItems(o.AmazonOrderId)));
    }
    if (heads.length > MAX_ORDERS) {
      out.partialUntil = key(done[done.length - 1]) - 1000;
      out.warnings = [`Amazon: ${heads.length} siparişin en eski ${MAX_ORDERS} tanesi işlendi (satır servisi kotası); kalanlar sonraki senkronda alınır`];
    }
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
        known(it);
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
  async function pushStock(items) {
    const own = [];
    for (const x of items) if (!(await isFba(str(x.remoteId || x.sku)))) own.push(x);
    return patch(own, (x) => ({ op: 'replace', path: '/attributes/fulfillment_availability', value: [{ fulfillment_channel_code: 'DEFAULT', quantity: Math.max(0, Math.round(num(x.stock))) }] }));
  }
  const pushPrice = (items) => patch(items, (x) => ({ op: 'replace', path: '/attributes/purchasable_offer', value: [{ marketplace_id: market, currency, our_price: [{ schedule: [{ value_with_tax: num(x.price) }] }] }] }));

  // Kargoya ver: shipmentConfirmation (paket satırları + takip no). FBA siparişini Amazon gönderir.
  async function ship(order, pkg, { cargoCompany, tracking }) {
    if (/FBA/.test(str(order.remote_status))) throw new Error('Amazon: FBA siparişi Amazon tarafından gönderilir');
    if (!tracking) throw new Error('Amazon: kargoya vermek için takip numarası girin');
    const lines = (pkg.items && pkg.items.length ? pkg.items : (order.items || []).filter((i) => !DEAD_LINE(i.status)).map((i) => ({ line_id: i.line_id, qty: i.quantity })))
      .map((i) => ({ orderItemId: String(i.line_id), quantity: num(i.qty, 1) }));
    await call(`/orders/v0/orders/${encodeURIComponent(order.remote_id)}/shipmentConfirmation`, { method: 'POST', body: {
      marketplaceId: market, packageDetail: { packageReferenceId: String(pkg.no || pkg.id || 1), carrierCode: 'Other', carrierName: str(cargoCompany) || 'Other', trackingNumber: str(tracking),
        shipDate: new Date().toISOString(), orderItems: lines } } });
    return { tracking };
  }

  // ---------- ürün yükleme: Product Type Definitions 2020-09-01 + Listings Items 2021-08-01 (putListingsItem) ----------
  // Kaynaklar: resmi modeller github.com/amzn/selling-partner-api-models (models/product-type-definitions-api-model/definitionsProductTypes_2020-09-01.json,
  // models/listings-items-api-model/listingsItems_2021-08-01.json; aynıları @sp-api-sdk/*-api npm paketlerinde) ve developer-docs.amazon.com/sp-api
  // sayfaları (@amazon-sp-api-release/sp-api-dev-mcp 1.0.5 paketindeki belge dizininden okundu): Building Listings Management Workflows Guide,
  // Retrieve a Product Type Definition, Product Type Definitions Meta-Schema (v1), Get recommended browse nodes or item type keywords,
  // Tutorial: Retrieve Merchant Shipping Templates, Mapping product attributes, Manage purchasable offer, Submit media attributes,
  // Listings APIs FAQ, Listings Items API Issues Troubleshooting, Listings Items / Product Type Definitions API Rate Limits.
  // - Kategori = Amazon ürün tipi: searchDefinitionsProductTypes (keywords olmadan tüm ürün tipleri, keywords ile Amazon araması) → { productTypes: [{ name, displayName, marketplaceIds }] }.
  // - Özellikler: getDefinitionsProductType (requirements=LISTING: ürün bilgisi + satış koşulları, requirementsEnforced=ENFORCED, parentageLevel=NONE:
  //   varyasyon ailesi dışı tek ilan şeması, sellerId: satıcıya özel değerler) → schema.link.resource (S3 bağlantısı, 7 gün geçerli, kimliksiz GET).
  //   Şema JSON Schema 2019-09: kök "required" zorunlu özellikler; her özellik bir dizi, items.properties.value (enum + enumNames, ya da anyOf
  //   [serbest metin, enum]), marketplace_id / language_tag ($ref "#/$defs/…"). Yalnız value (+ marketplace_id / language_tag) içeren basit özellikler
  //   eşleştirilir; birimli / çok alanlı zorunlu özellikler (ör. ağırlık + birim) eksik olarak bildirilir. Koşullu zorunluluklar (allOf if/then)
  //   değerlendirilmez: Amazon bunları gönderimde INVALID + issues olarak bildirir.
  // - Gönderim: putListingsItem SKU başına bir istek (5 istek/sn, burst 10). ACCEPTED = ilk doğrulama geçti, Amazon işlemeye aldı; INVALID = kaydedilmedi.
  //   mode=VALIDATION_PREVIEW kullanılmaz: INVALID gönderim zaten kaydedilmez, aynı sorunlar gerçek gönderimin cevabında gelir (iki kat istek olurdu).
  //   Sonuçlar kanal deposunda (kv "uploads") saklanır; kabul edilenler getListingsItem (summaries, issues) ile izlenir: özet (ASIN) gelince
  //   oluşturuldu, işleme sırasında ERROR sorunu çıkarsa reddedildi (Listings APIs FAQ: getListingsItem 1-5 dk içinde güncellenir).
  // - Anahtar: SKU (fetchListings ilanı SKU ile tanıtır; Amazon'da ilan kimliği satıcı SKU'sudur).
  const PTD = '/definitions/2020-09-01/productTypes', kv = meta && meta.kv;
  const ptRow = (p) => ({ id: str(p.name), name: str(p.displayName) || str(p.name), path: str(p.name) });
  async function productTypes(keywords) {
    const r = await call(`${PTD}?${mq}${keywords ? '&keywords=' + encodeURIComponent(keywords) : ''}`, { tries: 4 });
    return ((r && r.productTypes) || []).filter((p) => !(p.marketplaceIds || []).length || p.marketplaceIds.includes(market)).map(ptRow).filter((p) => p.id);
  }
  const ck = `${API}|${market}|${seller}`;
  if (!PT_CACHE.has(ck)) PT_CACHE.set(ck, { list: null, hits: new Map() });
  const ptc = PT_CACHE.get(ck), ptHits = ptc.hits;
  async function allCategories() {
    if (!ptc.list || Date.now() - ptc.list.at > 6 * 3600e3) ptc.list = { at: Date.now(), all: await productTypes('') };
    return ptc.list.all;
  }
  async function categories(q) {
    const all = await allCategories(), k = str(q).toLocaleLowerCase('tr');
    let items = all.filter((c) => !k || `${c.name} ${c.id}`.toLocaleLowerCase('tr').includes(k));
    // Amazon'un anahtar kelime araması (ürün tipinin adında geçmeyen kelimeler için): yerel eşleşmelerin ardından
    if (k && items.length < 60) {
      if (ptHits.size > 200) ptHits.clear();
      if (!ptHits.has(k)) ptHits.set(k, await productTypes(str(q)).catch((e) => { if (e.budget) throw e; return []; }));
      const have = new Set(items.map((c) => c.id));
      items = [...items, ...ptHits.get(k).filter((c) => !have.has(c.id))];
    }
    return { total: all.length, items: items.slice(0, 60) };
  }

  // Şema: yerel $ref ("#/$defs/language_tag" …) çözülür; yalnız zorunlu ve panelin kendisinin doldurduğu özellikler özetlenir
  const AUTO = new Set(['item_name', 'brand', 'product_description', 'externally_assigned_product_identifier', 'supplier_declared_has_product_identifier_exemption',
    'purchasable_offer', 'list_price', 'fulfillment_availability', 'item_package_weight', 'item_package_dimensions', 'main_product_image_locator', ...Array.from({ length: 8 }, (_, i) => `other_product_image_locator_${i + 1}`)]);
  const ptr = (root, ref) => (typeof ref === 'string' && ref.startsWith('#/') ? ref.slice(2).split('/').reduce((o, k) => (o == null ? o : o[k.replace(/~1/g, '/').replace(/~0/g, '~')]), root) : null);
  const deref = (root, x) => { for (let i = 0; x && x.$ref && i < 10; i++) x = ptr(root, x.$ref); return x || {}; };
  // Değer listesi: enum (+ enumNames) doğrudan ya da anyOf / oneOf içinde; enum'suz anyOf kolu = serbest değer de kabul edilir
  function scalar(root, v) {
    v = deref(root, v);
    const alts = [...(v.anyOf || []), ...(v.oneOf || [])].map((x) => deref(root, x)), list = [];
    for (const e of [v, ...alts]) (e.enum || []).forEach((x, i) => list.push({ id: String(x), value: str((e.enumNames || [])[i]) || String(x) }));
    const type = v.type || (alts.find((x) => x.type) || {}).type || 'string';
    return { type, list, free: !v.enum && (!alts.length || alts.some((x) => !x.enum)), max: v.maxLength || v.maxUtf8ByteLength || 0, bytes: !v.maxLength && !!v.maxUtf8ByteLength, def: v.default };
  }
  function digest(s) {
    const req = new Set(s.required || []), props = {};
    for (const [name, raw] of Object.entries(s.properties || {})) {
      if (!req.has(name) && !AUTO.has(name)) continue;
      const p = deref(s, raw), items = deref(s, p.items), ip = items.properties || {}, ireq = items.required || [];
      const sub = {};
      const nest = {};
      for (const [k, x] of Object.entries(ip)) {
        const d = deref(s, x);
        if (d.type !== 'object' && d.type !== 'array') sub[k] = scalar(s, d);
        // İç içe nesne (ör. item_package_dimensions.length = { value, unit }): yalnız düz alanları özetlenir
        else if (d.type === 'object') nest[k] = { keys: Object.keys(d.properties || {}), sub: Object.fromEntries(Object.entries(d.properties || {}).map(([j, y]) => [j, scalar(s, y)])) };
      }
      // Dil etiketi: şemadaki varsayılan; yoksa listede tek değer varsa o (birden çok ve varsayılansızsa belirlenemez)
      const lt = sub.language_tag, lang = lt ? str(lt.def) || (lt.list.length === 1 ? lt.list[0].id : '') : '';
      const value = ip.value ? sub.value || null : null;
      props[name] = { name, title: str(p.title) || name, required: req.has(name), keys: Object.keys(ip), req: ireq, sub, nest, lang, value,
        simple: !!value && ireq.every((k) => ['value', 'marketplace_id', 'language_tag'].includes(k)) };
    }
    return { productType: str((/\/([^/]+)$/.exec(str(s.$id)) || [])[1]), props };
  }
  function schemaOf(pt) {
    const key = `${ck}|${pt}`, hit = SCHEMA_CACHE.get(key);
    if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.p;
    const p = (async () => {
      const d = await call(`${PTD}/${encodeURIComponent(pt)}?${mq}&sellerId=${encodeURIComponent(seller)}&requirements=LISTING&requirementsEnforced=ENFORCED&parentageLevel=NONE`, { tries: 4 });
      const link = d && d.schema && d.schema.link;
      if (!link || !link.resource) throw new Error(`Amazon: ${pt} ürün tipinin şema bağlantısı alınamadı`);
      // Ön imzalı S3 bağlantısı: Amazon erişim belirteci gönderilmez (resmi örnek uygulama da düz GET ile okur)
      const s = await http(link.resource, { method: str(link.verb) || 'GET', timeout: 60000, tries: 3 });
      if (!s || typeof s !== 'object' || !s.properties) throw new Error(`Amazon: ${pt} ürün tipinin şeması okunamadı`);
      return { ...digest(s), productType: str(d.productType) || pt };
    })();
    if (SCHEMA_CACHE.size > 100) SCHEMA_CACHE.delete(SCHEMA_CACHE.keys().next().value);
    SCHEMA_CACHE.set(key, { at: Date.now(), p });
    p.catch(() => SCHEMA_CACHE.delete(key));
    return p;
  }
  const attrType = (p) => (!p.simple ? 'complex' : p.value.list.length || p.value.type === 'boolean' ? 'enum' : p.value.type === 'string' ? 'text' : 'number');
  async function attributes(pt) {
    const { props } = await schemaOf(str(pt));
    return Object.values(props).filter((p) => p.required && !AUTO.has(p.name)).map((p) => ({ id: p.name, name: p.title, mandatory: true, kind: 'category',
      type: attrType(p), custom: p.simple && p.value.free && p.value.type !== 'boolean', multi: false }));
  }
  async function values(pt, attr) {
    const p = (await schemaOf(str(pt))).props[str(attr)];
    if (!p || !p.simple) return [];
    return p.value.type === 'boolean' ? [{ id: 'true', value: 'Evet' }, { id: 'false', value: 'Hayır' }] : p.value.list;
  }

  // Basit özellik girdisi: { value, language_tag?, marketplace_id? } (şemadaki alanlara göre); uymazsa nedeni
  function cell(p, raw, label) {
    if (!p.simple) return { err: `${label} (birimli / çok alanlı özellik; panelden gönderilemiyor, Amazon Seller Central'dan girin)` };
    const v = p.value;
    let x;
    if (v.type === 'boolean') {
      x = { true: true, false: false, evet: true, 'hayır': false }[String(raw).toLocaleLowerCase('tr')];
      if (x == null) return { err: `${label} (evet / hayır seçin)` };
    } else if (v.type === 'number' || v.type === 'integer') {
      x = num(raw, NaN);
      if (!Number.isFinite(x) || (v.type === 'integer' && !Number.isInteger(x))) return { err: `${label} (sayı olmalı)` };
    } else {
      x = str(raw);
      if (!x) return { err: label };
      const hit = v.list.find((e) => e.id === x) || v.list.find((e) => e.value.toLocaleLowerCase('tr') === x.toLocaleLowerCase('tr'));
      if (hit) x = hit.id; else if (v.list.length && !v.free) return { err: `${label} (“${x}” Amazon listesinde yok)` };
      if (v.max && (v.bytes ? bytes(x) : x.length) > v.max) return { err: `${label} en fazla ${v.max} ${v.bytes ? 'bayt' : 'karakter'} olabilir` };
    }
    const e = { value: x };
    if (p.keys.includes('language_tag')) { if (p.lang) e.language_tag = p.lang; else if (p.req.includes('language_tag')) return { err: `${label} (dil etiketi şemada belirlenemedi)` }; }
    if (p.keys.includes('marketplace_id')) e.marketplace_id = market;
    return { entry: e };
  }
  const mp = (p) => (p.keys.includes('marketplace_id') ? { marketplace_id: market } : {});
  const inList = (p, k, v) => { const s = p.sub[k]; return !s || !s.list.length || s.free ? v : (s.list.find((e) => e.id.toLowerCase() === String(v).toLowerCase()) || {}).id; };
  const YES = /^(1|evet|e|true|yes)$/i;

  async function build(pr, map, { opts = {}, pick } = {}) {
    const s = await schemaOf(str(map.remote_id)), P = s.props, missing = [], at = {}, sku = str(pr.sku);
    // Fiyatlar pazar yerinin para biriminde gelir (panel çevirir: pr.currency); gelmediyse pazar yerinin para birimi
    const cur = str(pr.currency) || currency;
    if (!sku) missing.push('SKU');
    const put = (name, label, raw, { cutText } = {}) => {
      const p = P[name];
      if (cutText && p.simple && p.value.max) raw = cut(raw, p.value.max, p.value.bytes);
      const r = cell(p, raw, label);
      if (r.err) missing.push(r.err); else at[name] = [r.entry];
    };
    if (P.item_name) { if (pr.name) put('item_name', 'ürün adı', pr.name); else missing.push('ürün adı'); }
    if (P.brand) {
      const p = P.brand, b = str(pr.brand);
      // Satıcıya özel şemada marka listesi varsa (sellerId ile gelir) marka listede olmalı
      if (!b) missing.push('marka');
      else if (p.simple && p.value.list.length && !p.value.free && !p.value.list.some((e) => e.id === b || e.value.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr'))) missing.push(`marka “${b}” Amazon'da bulunamadı`);
      else put('brand', 'marka', b);
    }
    if (P.product_description) { const d = plain(pr.description); if (d) put('product_description', 'açıklama', d, { cutText: true }); else if (P.product_description.required) missing.push('açıklama'); }

    // Ürün kimliği: UPC 12, EAN 13, GTIN 14 hane (Issues Troubleshooting). Barkodsuz ürün yalnız Amazon'un onayladığı GTIN muafiyetiyle
    // (supplier_declared_has_product_identifier_exemption = true; Listings APIs FAQ) oluşturulabilir.
    const bc = str(pr.barcode).replace(/\s+/g, ''), idp = P.externally_assigned_product_identifier, ex = P.supplier_declared_has_product_identifier_exemption;
    if (bc) {
      const kind = /^\d{12}$/.test(bc) ? 'upc' : /^\d{13}$/.test(bc) ? 'ean' : /^\d{14}$/.test(bc) ? 'gtin' : '';
      const type = kind && idp && idp.keys.includes('type') && idp.keys.includes('value') && idp.sub.type && idp.sub.type.list.length ? inList(idp, 'type', kind) : '';
      if (!kind) missing.push('barkod Amazon için 12 (UPC), 13 (EAN) ya da 14 (GTIN) haneli olmalı');
      else if (!type) missing.push(`barkod (${kind.toUpperCase()}) bu ürün tipinin şemasında gönderilemiyor`);
      else at.externally_assigned_product_identifier = [{ type, value: bc, ...mp(idp) }];
    } else if (YES.test(str(opts.gtinExempt)) && ex && ex.simple && ex.value.type === 'boolean') at.supplier_declared_has_product_identifier_exemption = [{ value: true, ...mp(ex) }];
    else missing.push(YES.test(str(opts.gtinExempt)) ? 'barkod (bu ürün tipinde GTIN muafiyeti alanı yok)' : 'barkod');

    // Satış koşulları: our_price.schedule.value_with_tax (KDV dahil), audience ALL; liste fiyatı purchasable_offer.list_price (Mapping product
    // attributes → Pricing Feed mappings, Manage purchasable offer). Stok: fulfillment_availability DEFAULT kanalı (satıcı gönderimi).
    const po = P.purchasable_offer;
    if (po) {
      if (!(pr.price > 0)) missing.push('fiyat');
      else if (!po.keys.includes('our_price')) missing.push('fiyat (satış koşulu alanı şemada tanınmadı)');
      else {
        const o = { ...(po.keys.includes('currency') ? { currency: cur } : {}), ...mp(po), our_price: [{ schedule: [{ value_with_tax: r2(pr.price) }] }] };
        if (po.keys.includes('audience') && inList(po, 'audience', 'ALL')) o.audience = inList(po, 'audience', 'ALL');
        if (po.keys.includes('list_price') && pr.listPrice > pr.price) o.list_price = [{ schedule: [{ value_with_tax: r2(pr.listPrice) }] }];
        at.purchasable_offer = [o];
      }
    }
    const lp = P.list_price, lpKey = lp && (lp.keys.includes('value_with_tax') ? 'value_with_tax' : lp.keys.includes('value') ? 'value' : '');
    if (lp && lpKey && pr.listPrice > 0 && (lp.required || pr.listPrice > pr.price)) at.list_price = [{ [lpKey]: r2(pr.listPrice), ...(lp.keys.includes('currency') ? { currency: cur } : {}), ...mp(lp) }];
    else if (lp && lp.required) missing.push('liste fiyatı');
    const fa = P.fulfillment_availability;
    if (fa) {
      if (fa.keys.includes('fulfillment_channel_code') && fa.keys.includes('quantity') && inList(fa, 'fulfillment_channel_code', 'DEFAULT')) at.fulfillment_availability = [{ fulfillment_channel_code: 'DEFAULT', quantity: Math.max(0, Math.round(num(pr.stock))), ...mp(fa) }];
      else if (fa.required) missing.push('stok (gönderim kanalı alanı şemada tanınmadı)');
    }
    // Paket ağırlığı / ölçüleri: { value, unit } (birim tam adıyla: "kilograms", "centimeters"; Mapping product attributes → "Unit of measure requires
    // full names"; Catalog Items örneğinde item_package_dimensions { length, width, height: { unit, value } }). Şemadaki birim listesinde yoksa eksik.
    const unitOk = (sub, u) => sub && sub.unit && sub.value && (!sub.unit.list.length ? false : sub.unit.list.some((e) => e.id === u));
    const pw = P.item_package_weight;
    if (pw) {
      if (num(pr.weight) > 0 && pw.keys.includes('value') && unitOk(pw.sub, 'kilograms')) at.item_package_weight = [{ value: num(pr.weight), unit: 'kilograms', ...mp(pw) }];
      else if (pw.required) missing.push(num(pr.weight) > 0 ? 'paket ağırlığı (kilogram birimi bu ürün tipinde yok)' : 'paket ağırlığı (kg)');
    }
    const pd = P.item_package_dimensions;
    if (pd) {
      const dims = { length: num(pr.length), width: num(pr.width), height: num(pr.height) }, ks = Object.keys(dims);
      const shapeOk = ks.every((k) => pd.nest[k] && unitOk(pd.nest[k].sub, 'centimeters'));
      if (ks.every((k) => dims[k] > 0) && shapeOk) at.item_package_dimensions = [{ ...Object.fromEntries(ks.map((k) => [k, { value: dims[k], unit: 'centimeters' }])), ...mp(pd) }];
      else if (pd.required) missing.push(shapeOk || !ks.every((k) => dims[k] > 0) ? 'paket ölçüleri (en, boy, yükseklik cm)' : 'paket ölçüleri (santimetre birimi bu ürün tipinde yok)');
    }
    // Görseller: main_product_image_locator + other_product_image_locator_1…8, { media_location } (Submit media attributes); herkese açık adres
    const imgs = [pr.image, ...(pr.images || []).filter((u) => u !== pr.image)].map(str).filter((u) => /^https?:\/\//i.test(u));
    ['main_product_image_locator', ...Array.from({ length: 8 }, (_, i) => `other_product_image_locator_${i + 1}`)].forEach((k, i) => {
      const p = P[k];
      if (!p || !p.keys.includes('media_location')) { if (p && p.required) missing.push('görsel (görsel alanı şemada tanınmadı)'); return; }
      if (imgs[i]) at[k] = [{ media_location: imgs[i], ...mp(p) }];
      else if (p.required) missing.push(i ? `${i + 1}. görsel` : 'görsel');
    });

    // Kategori eşleştirmesindeki değerler (zorunlu özellikler): liste değeri kimliği, serbest metin, '@variant' (ürünün varyant adından)
    const attrs = map.attrs || {};
    for (const p of Object.values(P)) {
      if (AUTO.has(p.name) || (!p.required && !attrs[p.name])) continue;
      const v = attrs[p.name], text = v && str(v.value);
      let raw = v && (str(v.id) || text);
      if (text === '@variant') {
        const hit = pr.variant && pick ? await pick({ id: p.name }, pr.variant) : null;
        raw = hit ? hit.id : p.simple && p.value.free && p.value.type === 'string' ? oneAxis(pr.variant) : '';
        if (!raw) { missing.push(p.title + (pr.variant ? ` (varyant “${pr.variant}” Amazon listesinde yok)` : ' (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)')); continue; }
      } else if (text === '@image') raw = imgs[0] || '';
      if (!p.simple) { missing.push(cell(p, raw, p.title).err); continue; }
      if (raw === '' || raw == null) { missing.push(p.title); continue; }
      const r = cell(p, raw, p.title);
      if (r.err) missing.push(r.err); else at[p.name] = [r.entry];
    }
    return { key: sku, missing: [...new Set(missing)], payload: { sku, productType: s.productType || str(map.remote_id), attributes: at } };
  }

  // Gönderim sonuçları kanal deposunda (settings "kv:<kanal>:uploads"): son 4 günün en çok 30 gönderimi; depo yoksa bellekte
  let memBook = {};
  async function book() {
    if (kv) { try { const v = await kv.get('uploads'); return v && typeof v === 'object' ? v : {}; } catch (e) { if (e.budget) throw e; } }
    return memBook;
  }
  async function keep(b) {
    const now = Date.now(), ids = Object.keys(b).filter((k) => now - num(b[k].at) < 4 * 864e5).sort((x, y) => b[y].at - b[x].at).slice(0, 30);
    memBook = Object.fromEntries(ids.map((k) => [k, b[k]]));
    if (kv) { try { await kv.set('uploads', memBook); } catch (e) { if (e.budget) throw e; } }
  }
  const itemUrl = (sku) => `/listings/2021-08-01/items/${encodeURIComponent(seller)}/${encodeURIComponent(sku)}?${mq}`;
  // putListingsItem: SKU başına bir istek, en az 250 ms arayla (5 istek/sn). Hiçbir istek cevaplanmadıysa (kimlik / yetki / bağlantı) hata fırlatılır;
  // bir kısmı gittiyse gidemeyenler ürün bazında hata olarak kaydedilir (gönderilenlerin takibi kaybolmasın)
  let lastPut = 0;
  async function send(payloads) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), res = {};
    let answered = 0, first = null, stop = null;
    for (const p of payloads) {
      const sku = str(p.sku);
      if (stop) { res[sku] = { s: 'E', e: 'Gönderilmedi (bu işlemin dış istek sınırı doldu); yeniden gönderin' }; continue; }
      const wait = lastPut + 250 - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        const r = await call(`${itemUrl(sku)}&includedData=issues,identifiers`, { method: 'PUT', tries: 4, body: { productType: p.productType, requirements: 'LISTING', attributes: p.attributes } });
        answered++;
        if (r && r.status === 'ACCEPTED') {
          types.set(sku, p.productType);
          res[sku] = { s: 'A', sid: str(r.submissionId), asin: str(((r.identifiers || []).find((x) => x.marketplaceId === market) || {}).asin) };
        } else res[sku] = { s: 'I', e: issueText(r && r.issues) || `Amazon kabul etmedi (${str(r && r.status) || 'cevap yok'})` };
      } catch (e) {
        if (e.budget) { stop = e; res[sku] = { s: 'E', e: 'Gönderilmedi (bu işlemin dış istek sınırı doldu); yeniden gönderin' }; continue; }
        first = first || e;
        res[sku] = { s: 'E', e: apiErr(e) };
      } finally { lastPut = Date.now(); }
    }
    if (!answered) { if (stop) throw stop; if (first) throw new Error(apiErr(first)); }
    const b = await book();
    b[id] = { at: Date.now(), items: res };
    await keep(b);
    return { ref: 'amz:' + id };
  }
  const VIEW = {
    A: () => ({ ok: null, status: 'Amazon işliyor (gönderim kabul edildi)', error: '' }),
    L: (x) => ({ ok: true, status: `Amazon'da oluşturuldu${x.asin ? ` · ASIN ${x.asin}` : ''}${x.buy ? ' · satışta' : ''}`, error: '' }),
    I: (x) => ({ ok: false, status: 'Amazon kabul etmedi', error: x.e }),
    R: (x) => ({ ok: false, status: 'Amazon işlerken sorun bildirdi', error: x.e }),
    E: (x) => ({ ok: false, status: 'Gönderilemedi', error: x.e }),
  };
  // Kabul edilenler getListingsItem ile izlenir (sorgu başına en çok 40 SKU, 250 ms arayla): 404 = henüz oluşmadı (işleniyor),
  // ERROR sorunu = reddedildi, pazar yeri özeti (ASIN) = oluşturuldu
  async function status(ref) {
    const id = String(ref).replace(/^amz:/, ''), b = await book(), u = b[id];
    if (!u) return { done: true, items: [] };
    let checked = 0, dirty = false;
    for (const [sku, x] of Object.entries(u.items || {})) {
      if (x.s !== 'A' || checked >= 40) continue;
      if (checked++) await sleep(250);
      const r = await call(`${itemUrl(sku)}&includedData=summaries,issues`, { tries: 3 }).catch((e) => { if (e.status === 404) return null; throw e; });
      if (!r) continue;
      const errs = issueText(r.issues), sm = (r.summaries || []).find((y) => y.marketplaceId === market) || (r.summaries || [])[0];
      if (errs) Object.assign(x, { s: 'R', e: errs });
      else if (sm) Object.assign(x, { s: 'L', asin: str(sm.asin) || x.asin, buy: (sm.status || []).includes('BUYABLE') });
      else continue;
      dirty = true;
      if (sm && sm.productType) types.set(sku, sm.productType);
    }
    if (dirty) await keep(b);
    const items = Object.entries(u.items || {}).map(([key, x]) => ({ key, ...(VIEW[x.s] || VIEW.E)(x) }));
    return { done: !items.some((x) => x.ok === null), items };
  }
  const raw = async (ref) => (await book())[String(ref).replace(/^amz:/, '')] || null;
  // Pazar yerinin para birimi: panel fiyatları build'den önce bu para birimine çevirir (pr.currency)
  const catalog = { categories, allCategories, attributes, values, build, send, status, raw, currency: async () => currency,
    options: [{ k: 'gtinExempt', label: 'Barkodsuz ürünler: Amazon GTIN muafiyeti onayınız varsa “evet” yazın' }] };

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
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose, catalog,
  };
}
