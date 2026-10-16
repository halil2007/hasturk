// eBay (Sell API'leri: Fulfillment v1 + Inventory v1). developer.ebay.com → Application Keys: App ID (Client ID) + Cert ID (Client Secret).
// Kimlik: OAuth 2 "authorization code" ile alınmış kullanıcı refresh token'ı (≈18 ay geçerli, eBay yenilemede yenisini VERMEZ) →
// POST /identity/v1/oauth2/token (grant_type=refresh_token, Authorization: Basic base64(client_id:client_secret)) → ≈2 saatlik erişim belirteci.
// Kapsam parametresi gönderilmez: eBay ilk onaydaki kapsamları kullanır (sell.fulfillment, sell.inventory gerekli; ürün yüklemede iş politikaları
// için sell.account ya da sell.account.readonly da gerekir). Kategori / özellik / para birimi (Taxonomy, Metadata) uygulama belirteciyle okunur:
// grant_type=client_credentials, scope=https://api.ebay.com/oauth/api_scope (eBay'in ebay-oauth-nodejs-client 1.2.2 paketi). Belirteç süresince
// kanalın kv deposunda { access, exp, fp } olarak saklanır (fp: refresh token + ortam parmak izi; kullanıcı yeni token girerse eskisi kullanılmaz).
// Ortam: canlı api.ebay.com, test api.sandbox.ebay.com. Pazar yeri (EBAY_US, EBAY_GB, EBAY_DE …) X-EBAY-C-MARKETPLACE-ID başlığında gider.
// Siparişler: GET /sell/fulfillment/v1/order (senkronda filter=lastmodifieddate:[..], geçmiş aktarımında creationdate:[..]; en çok 200/sayfa,
// eBay en fazla 2 yıllık sipariş verir). Adres fulfillmentStartInstructions[0].shippingStep.shipTo içinde; ad/telefon/adres 90 gün, e-posta 14 gün sonra gelmez.
// Tutar / para birimi siparişin pricingSummary.total değerinden olduğu gibi alınır (çeviri yapılmaz).
// Ürünler: yalnızca Inventory API ile oluşturulmuş (ya da bulk_migrate_listing ile taşınmış) ilanlar görünür: GET /inventory_item (stok, başlık,
// görsel, EAN/UPC) + SKU başına GET /offer?sku= (fiyat, ilan no, yayın durumu). Seller Hub / Trading API ile açılmış eski ilanlar listelenmez.
// Stok / fiyat: POST /bulk_update_price_quantity (çağrı başına en çok 25 SKU; yanıt satır satır statusCode döner, 207 kısmi başarı).
// Kargoya verme: POST /order/{id}/shipping_fulfillment (satırlar + takip no + taşıyıcı kodu). İşleme alma panelde. Etiket, iade yok.
// Ürün yükleme (catalog): Inventory API ile stok kaydı + teklif + yayın (ayrıntı "ürün yükleme" bölümünde); varyantlar ayrı ilan olarak açılır.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, pool, sleep, diagStep, imageList, oneAxis, DEAD_LINE } from '../util.js';

const money = (a) => num(a && a.value);
const iso = (ms) => new Date(ms).toISOString();
// eBay filtre değerinde [ ] { } | yüzde kodlu olmalı (belgedeki örnekle aynı biçim); ":" ve "," olduğu gibi kalır
const enc = (s) => String(s).replace(/[[\]{}|]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
// Panelin kargo firması adı → eBay taşıyıcı kodu. DOĞRULA: Türkiye kargo firmalarının eBay kodu belgelerde yok; eşleşmeyen "Other" gider.
const CARRIERS = [[/dhl/i, 'DHL'], [/ups/i, 'UPS'], [/fedex/i, 'FedEx'], [/tnt/i, 'TNT'], [/usps/i, 'USPS'], [/aramex/i, 'Aramex'], [/royal\s*mail/i, 'RoyalMail'], [/deutsche\s*post/i, 'DeutschePost']];
const carrierCode = (name) => (CARRIERS.find(([re]) => re.test(str(name))) || [, 'Other'])[1];
const PAGE = 200;

export function ebay(env, meta) {
  const sandbox = str(env.EBAY_SANDBOX) === '1', market = str(env.EBAY_MARKETPLACE_ID) || 'EBAY_US';
  const HOST = `https://api.${sandbox ? 'sandbox.' : ''}ebay.com`;
  const cid = str(env.EBAY_CLIENT_ID), secret = str(env.EBAY_CLIENT_SECRET), refresh = str(env.EBAY_REFRESH_TOKEN), kv = meta && meta.kv;
  // Saklanan belirtecin hangi refresh token'a ait olduğu (token'ın kendisi kv'ye yazılmaz)
  const fp = `${sandbox ? 's' : 'p'}:${refresh.length}:${refresh.slice(-16)}`;
  let access = null, exp = 0, pending = null;

  async function renew(force) {
    if (!force) {
      try { const v = kv ? await kv.get('token') : null; if (v && v.fp === fp && v.access && v.exp > Date.now()) { access = v.access; exp = v.exp; return access; } } catch { /* kv okunamadı: yeni belirteç alınır */ }
    }
    let r;
    try {
      r = await http(`${HOST}/identity/v1/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${cid}:${secret}`) },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }).toString() });
    } catch (e) {
      if (e.status === 400 || e.status === 401) throw new Error(`eBay refresh token geçersiz, süresi dolmuş ya da başka bir uygulamaya ait (App ID / Cert ID ile aynı uygulamadan ve ${sandbox ? 'Sandbox' : 'Production'} ortamından alınmalı): ${e.message.slice(0, 200)}`);
      throw e;
    }
    if (!r || !r.access_token) throw new Error('eBay erişim belirteci alınamadı');
    access = r.access_token; exp = Date.now() + Math.max(60, num(r.expires_in, 7200) - 120) * 1000;
    try { if (kv) await kv.set('token', { access, exp, fp }); } catch { /* saklanamadı: bir sonraki çağrıda yeniden alınır */ }
    return access;
  }
  async function auth(force) {
    if (!force && access && Date.now() < exp) return access;
    return (pending ||= renew(force).finally(() => { pending = null; }));
  }
  // Uygulama belirteci (client credentials): Taxonomy / Metadata gibi herkese açık veriler için; kv'de { access, exp, fp } ('apptoken')
  const afp = `${sandbox ? 's' : 'p'}:${cid}`;
  let appAccess = null, appExp = 0, appPending = null;
  async function appRenew(force) {
    if (!force) {
      try { const v = kv ? await kv.get('apptoken') : null; if (v && v.fp === afp && v.access && v.exp > Date.now()) { appAccess = v.access; appExp = v.exp; return appAccess; } } catch { /* kv okunamadı */ }
    }
    let r;
    try {
      r = await http(`${HOST}/identity/v1/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${cid}:${secret}`) },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }).toString() });
    } catch (e) {
      if (e.status === 400 || e.status === 401) throw new Error(`eBay uygulama belirteci alınamadı (App ID / Cert ID ${sandbox ? 'Sandbox' : 'Production'} anahtar setinden olmalı): ${e.message.slice(0, 200)}`);
      throw e;
    }
    if (!r || !r.access_token) throw new Error('eBay uygulama belirteci alınamadı');
    appAccess = r.access_token; appExp = Date.now() + Math.max(60, num(r.expires_in, 7200) - 120) * 1000;
    try { if (kv) await kv.set('apptoken', { access: appAccess, exp: appExp, fp: afp }); } catch { /* saklanamadı */ }
    return appAccess;
  }
  async function appAuth(force) {
    if (!force && appAccess && Date.now() < appExp) return appAccess;
    return (appPending ||= appRenew(force).finally(() => { appPending = null; }));
  }
  // opts.app: uygulama belirteciyle; opts.headers: ek başlıklar (ör. Content-Language)
  async function call(path, opts = {}, retried) {
    const headers = { Authorization: `Bearer ${opts.app ? await appAuth() : await auth()}`, Accept: 'application/json', 'X-EBAY-C-MARKETPLACE-ID': market, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) };
    try { return await http(HOST + path, { ...opts, headers, body: opts.body && JSON.stringify(opts.body) }); } catch (e) {
      if (e.status !== 401 || retried) throw e;
      // belirteç geçersiz kılındı: bir kez yenilenip tekrar denenir
      if (opts.app) { appAccess = null; appExp = 0; await appAuth(true); } else { access = null; exp = 0; await auth(true); }
      return call(path, opts, true);
    }
  }

  // ---------- siparişler ----------
  function norm(o) {
    const fs = str(o.orderFulfillmentStatus), ps = str(o.orderPaymentStatus), cs = str(o.cancelStatus && o.cancelStatus.cancelState);
    const status = cs === 'CANCELED' ? 'cancelled' : ps === 'FULLY_REFUNDED' ? (fs === 'FULFILLED' ? 'returned' : 'cancelled')
      : fs === 'FULFILLED' ? 'shipped' : fs === 'IN_PROGRESS' ? 'processing' : 'new';
    const lines = o.lineItems || [];
    const items = lines.map((l) => {
      const qty = num(l.quantity, 1) || 1, total = money(l.discountedLineItemCost) || money(l.lineItemCost);
      const v = (l.variationAspects || []).map((a) => str(a.value)).filter(Boolean).join(' / ');
      return { lineId: str(l.lineItemId), sku: str(l.sku), barcode: '', name: str(l.title) + (v ? ` (${v})` : ''), image: '', quantity: qty, unitPrice: total / qty, total,
        status: status === 'cancelled' ? 'cancelled' : '',
        remoteKey: str(l.sku) || str(l.legacyItemId) + (l.legacyVariationId ? ':' + l.legacyVariationId : '') };
    });
    const step = ((o.fulfillmentStartInstructions || [])[0] || {}).shippingStep || {}, to = step.shipTo || {}, a = to.contactAddress || {};
    const phone = str(to.primaryPhone && to.primaryPhone.phoneNumber), name = str(to.fullName);
    const due = lines.map((l) => Date.parse(l.lineItemFulfillmentInstructions && l.lineItemFulfillmentInstructions.shipByDate)).filter((x) => x > 0);
    // Türkiye adresinde il stateOrProvince, ilçe city alanındadır (eyalet yoksa city il kabul edilir); yurt dışı adreste ülke kodu satıra eklenir
    return {
      remoteId: str(o.orderId), orderNumber: str(o.orderId), orderedAt: Date.parse(o.creationDate) || Date.now(),
      remoteStatus: [fs, ps, cs && cs !== 'NONE_REQUESTED' ? 'cancel:' + cs : ''].filter(Boolean).join(' / '), status,
      customer: name || str(o.buyer && o.buyer.username), phone, email: str(to.email), customerId: str(o.buyer && o.buyer.username),
      address: { name, line: [a.addressLine1, a.addressLine2, [a.postalCode, a.countryCode === 'TR' ? '' : a.countryCode].map(str).filter(Boolean).join(' ')].map(str).filter(Boolean).join(', '),
        district: a.stateOrProvince ? str(a.city) : str(a.county), city: str(a.stateOrProvince || a.city), phone },
      total: money(o.pricingSummary && o.pricingSummary.total) || items.reduce((s, i) => s + (i.status ? 0 : i.total), 0),
      currency: str(o.pricingSummary && o.pricingSummary.total && o.pricingSummary.total.currency) || str(((lines[0] || {}).lineItemCost || {}).currency) || 'USD',
      cargoCompany: '', tracking: '', shipBy: due.length ? Math.min(...due) : null, items, packages: null,
    };
  }

  // since/until ms. Senkronda son değişiklik (lastmodifieddate), geçmiş aktarımında (byOrdered) oluşturulma tarihi (creationdate) aralığı
  async function fetchOrders(since, until, { byOrdered } = {}) {
    const k = byOrdered ? 'creationdate' : 'lastmodifieddate', filter = enc(`${k}:[${iso(since)}..${iso(until)}]`), out = [];
    for (let page = 0; page < 50; page++) {
      const r = (await call(`/sell/fulfillment/v1/order?filter=${filter}&limit=${PAGE}&offset=${page * PAGE}`, { tries: 3 })) || {};
      const rows = r.orders || [];
      out.push(...rows.map(norm));
      if (rows.length < PAGE || (r.total != null && (page + 1) * PAGE >= num(r.total))) break;
    }
    return out;
  }

  // ---------- ürünler (Inventory API) ----------
  const offers = new Map(); // SKU → teklifler (fiyat / stok gönderiminde offerId için)
  async function offersOf(sku) {
    if (offers.has(sku)) return offers.get(sku);
    let list = [];
    try { list = (((await call(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}${str(env.EBAY_MARKETPLACE_ID) ? '&marketplace_id=' + market : ''}`)) || {}).offers) || []; } catch (e) {
      if (e.status !== 404 && e.status !== 400) throw e; // teklifi olmayan stok kaydı: 404 / 400 (25713) döner
    }
    offers.set(sku, list);
    return list;
  }
  const live = (o) => o.status === 'PUBLISHED' && (!o.listing || !o.listing.listingStatus || o.listing.listingStatus === 'ACTIVE');
  async function fetchListings() {
    offers.clear();
    const inv = [];
    let offset = 0;
    for (let page = 0; page < 500; page++) {
      const r = (await call(`/sell/inventory/v1/inventory_item?limit=100&offset=${offset}`, { tries: 3 })) || {};
      inv.push(...(r.inventoryItems || []));
      // DOĞRULA: belgede offset "sayfa numarası" olarak tarif ediliyor; bir sonraki sayfa eBay'in verdiği next adresindeki offset ile istenir
      const next = str(r.next);
      if (!next || !(r.inventoryItems || []).length) break;
      const n = new URL(next, HOST).searchParams.get('offset');
      if (n == null || String(n) === String(offset)) break;
      offset = n;
    }
    return pool(inv, 4, async (it) => {
      const sku = str(it.sku), p = it.product || {}, list = await offersOf(sku);
      const o = list.find((x) => live(x) && x.format !== 'AUCTION') || list.find(live) || list[0] || {}, ps = o.pricingSummary || {};
      const images = imageList(p.imageUrls), price = money(ps.price);
      const avail = num(it.availability && it.availability.shipToLocationAvailability && it.availability.shipToLocationAvailability.quantity);
      return { remoteId: sku, remoteProductId: str(o.listing && o.listing.listingId), sku, barcode: str((p.ean || [])[0] || (p.upc || [])[0] || (p.isbn || [])[0]),
        name: str(p.title), groupName: str(p.title), variantName: '', image: images[0] || '', images, price, listPrice: Math.max(money(ps.originalRetailPrice), price),
        stock: o.availableQuantity != null && live(o) ? num(o.availableQuantity) : avail, active: live(o) };
    });
  }

  // bulk_update_price_quantity: 25'erli istek; yanıttaki her satırın statusCode'u denetlenir. Sonuç ilan ilan: { done, errors }
  // (yalnız reddedilen ilan yeniden denenir). Hiçbiri gönderilemeden bağlantı / yetki hatası: atılır.
  // entries: [{ remoteId, req, keys: [yanıt satırını ilana bağlayan sku / offerId] }]
  async function bulk(entries, out) {
    for (const [i, part] of chunk(entries, 25).entries()) {
      if (i) await sleep(200);
      let r;
      try { r = (await call('/sell/inventory/v1/bulk_update_price_quantity', { method: 'POST', body: { requests: part.map((x) => x.req) } })) || {}; } catch (e) {
        if (!out.done.length || e.budget) throw e;
        out.errors.push(...part.map((x) => ({ remoteId: x.remoteId, error: e.message })));
        continue;
      }
      const bad = new Map();
      for (const x of r.responses || []) {
        if (num(x.statusCode, 200) >= 300 || (x.errors || []).length) bad.set(str(x.sku || x.offerId), (x.errors || []).map((e) => e.longMessage || e.message).join(' · ') || 'HTTP ' + x.statusCode);
      }
      for (const x of part) {
        const k = x.keys.find((y) => bad.has(y));
        if (k) out.errors.push({ remoteId: x.remoteId, error: 'eBay: ' + bad.get(k) }); else out.done.push(x.remoteId);
      }
    }
    return out;
  }
  // Stok: stok kaydının toplam "ship-to-home" miktarı; SKU'nun tek yayındaki teklifi varsa teklifin satılabilir miktarı da aynı değere çekilir
  async function pushStock(items) {
    const entries = await pool(items, 4, async (x) => {
      const sku = str(x.remoteId || x.sku), qty = Math.max(0, Math.round(num(x.stock))), pub = (await offersOf(sku)).filter(live);
      const offer = pub.length === 1 ? str(pub[0].offerId) : '';
      return { remoteId: x.remoteId, keys: [sku, offer].filter(Boolean), req: { sku, shipToLocationAvailability: { quantity: qty }, ...(offer ? { offers: [{ offerId: offer, availableQuantity: qty }] } : {}) } };
    });
    return bulk(entries, { done: [], errors: [] });
  }
  // Fiyat: SKU'nun sabit fiyatlı (açık artırma olmayan) tüm teklifleri; para birimi teklifin kendi para birimi
  async function pushPrice(items) {
    const out = { done: [], errors: [] }, entries = [];
    await pool(items, 4, async (x) => {
      const sku = str(x.remoteId || x.sku), list = (await offersOf(sku)).filter((o) => o.format !== 'AUCTION' && o.offerId);
      if (!list.length) { out.errors.push({ remoteId: x.remoteId, error: 'eBay: teklif (offer) bulunamadı' }); return; }
      entries.push({ remoteId: x.remoteId, keys: [sku, ...list.map((o) => str(o.offerId))], req: { offers: list.map((o) => ({ offerId: str(o.offerId), price: { value: (Math.round(num(x.price) * 100) / 100).toFixed(2), currency: str(o.pricingSummary && o.pricingSummary.price && o.pricingSummary.price.currency) || 'USD' } })) } });
    });
    return bulk(entries, out);
  }

  // ---------- kargoya verme ----------
  // Paket satırları (ya da siparişin iptal olmayan tüm satırları) + takip no + taşıyıcı kodu; takip no yoksa yalnız "gönderildi" bilgisi gider
  async function ship(order, pkg = {}, { cargoCompany, tracking } = {}) {
    const lines = (pkg.items && pkg.items.length ? pkg.items : (order.items || []).filter((i) => !DEAD_LINE(i.status)).map((i) => ({ line_id: i.line_id, qty: i.quantity })))
      .filter((i) => i.line_id).map((i) => ({ lineItemId: String(i.line_id), quantity: Math.max(1, Math.round(num(i.qty, 1))) }));
    if (!lines.length) throw new Error('eBay: gönderilecek sipariş satırı yok');
    const tn = str(tracking || pkg.tracking);
    await call(`/sell/fulfillment/v1/order/${encodeURIComponent(order.remote_id)}/shipping_fulfillment`, { method: 'POST',
      body: { lineItems: lines, shippedDate: iso(Date.now()), ...(tn ? { shippingCarrierCode: carrierCode(cargoCompany || pkg.cargo_company), trackingNumber: tn } : {}) } });
    return { tracking: tn };
  }

  // ---------- ürün yükleme (catalog) ----------
  // Kaynak: eBay resmi OpenAPI belgeleri (developer.ebay.com/develop/api/spec/): taxonomy_api.json v1.1.1, inventory_api.json 1.18.5,
  // account_api_v1.json 1.9.3, metadata_api.json v1.13.0 ve "Required fields for publishing an offer" / "Creating and managing inventory item
  // groups" rehberleri (api-docs/sell/static/inventory/).
  // Kategori: Taxonomy getDefaultCategoryTreeId + getCategoryTree (yalnız leafCategoryTreeNode=true düğümler). Özellik: getItemAspectsForCategory
  // (aspectRequired, aspectMode FREE_TEXT/SELECTION_ONLY, aspectValues, itemToAspectCardinality, aspectMaxLength). Özellik kimliği = localizedAspectName.
  // Ürün durumu (condition): Metadata getItemConditionPolicies (kategorinin izin verdiği conditionId'ler; ConditionEnum karşılığı Inventory
  // ConditionEnum açıklamasındaki "Condition ID" eşlemesi). Para birimi: Metadata getCurrencies (pazar yerinin tek para birimi; catalog.currency):
// panel fiyatı bu para birimine kendisi çevirip pr.price / pr.currency olarak verir; build fiyatı olduğu gibi kullanır.
  // Politikalar: Account getFulfillmentPolicies / getPaymentPolicies / getReturnPolicies (marketplace_id), konum: Inventory getInventoryLocations
  // (ENABLED). Tek tane varsa o kullanılır; birden çoksa kanal seçeneklerinde adı ya da kimliği yazılır; hiç yoksa eksik.
  // Gönderim (senkron): bulk_get_inventory_item (eBay'de zaten olan SKU üzerine yazılmaz) → bulk_create_or_replace_inventory_item →
  // bulk_create_offer (FIXED_PRICE, GTC) → bulk_publish_offer; her çağrı en çok 25 kayıt. Yayınlanamayan ürünün bu gönderimde açılan stok
  // kaydı silinir (deleteInventoryItem yayınlanmamış teklifini de siler), düzeltilip yeniden gönderilebilir. Sonuçlar kv'de saklanır, status okur.
  // Anahtar (key): SKU — fetchListings ilanı SKU ile tanıtır (remoteId = sku).
  // Varyantlar: çok varyantlı ilan (inventory_item_group) kurulmaz: grup başlığı ve açıklaması tüm varyantlarda aynı olmalı ve ana ürün adı
  // (group_name) ürün verisinde (shape) yok; her varyant kendi adıyla ayrı ilan olarak açılır, varyant özelliği '@variant' ile doldurulur.
  const LANG = { EBAY_US: 'en-US', EBAY_GB: 'en-GB', EBAY_DE: 'de-DE', EBAY_FR: 'fr-FR', EBAY_IT: 'it-IT', EBAY_ES: 'es-ES', EBAY_AU: 'en-AU', EBAY_CA: 'en-CA' };
  const lang = LANG[market] || '';
  // Inventory API ConditionEnum açıklaması: "This enumeration value should be used if the Condition ID value is …"
  const CONDITION = { 1000: 'NEW', 1500: 'NEW_OTHER', 1750: 'NEW_WITH_DEFECTS', 2000: 'CERTIFIED_REFURBISHED', 2010: 'EXCELLENT_REFURBISHED', 2020: 'VERY_GOOD_REFURBISHED',
    2030: 'GOOD_REFURBISHED', 2500: 'SELLER_REFURBISHED', 2750: 'LIKE_NEW', 2990: 'PRE_OWNED_EXCELLENT', 3000: 'USED_EXCELLENT', 3010: 'PRE_OWNED_FAIR',
    4000: 'USED_VERY_GOOD', 5000: 'USED_GOOD', 6000: 'USED_ACCEPTABLE', 7000: 'FOR_PARTS_OR_NOT_WORKING' };
  const COND = '@condition', COND_NAME = 'Ürün durumu (Condition)';
  const POLICY = { fulfillmentPolicyId: ['fulfillment_policy', 'fulfillmentPolicies', 'kargo politikası'], paymentPolicyId: ['payment_policy', 'paymentPolicies', 'ödeme politikası'],
    returnPolicyId: ['return_policy', 'returnPolicies', 'iade politikası'] };
  const lc = (s) => str(s).toLocaleLowerCase('en');
  // eBay hata satırları (ErrorDetailV3: errorId, message, longMessage)
  const errText = (list) => (list || []).map((x) => str(x.longMessage || x.message)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ');
  const errOf = (e) => (e && e.data && errText(e.data.errors)) || str(e && e.message);
  const memo = new Map();
  const cached = (k, ms, fn) => {
    const c = memo.get(k);
    if (c && Date.now() - c.at < ms) return c.p;
    const p = fn();
    memo.set(k, { at: Date.now(), p });
    p.catch(() => memo.delete(k));
    return p;
  };
  const treeId = () => cached('tree', 24 * 3600e3, async () => {
    const id = str(((await call(`/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${market}`, { app: true })) || {}).categoryTreeId);
    if (!id) throw new Error(`eBay: ${market} için kategori ağacı bulunamadı`);
    return id;
  });
  // Yol: kökten yaprağa üst kategori adları (kök düğümün adı kullanılmaz: belgeye göre anlamsızdır)
  const allCategories = () => cached('cats', 6 * 3600e3, async () => {
    const r = (await call(`/commerce/taxonomy/v1/category_tree/${encodeURIComponent(await treeId())}`, { app: true, timeout: 60000 })) || {}, out = [];
    const walk = (n, path, depth) => {
      for (const c of n.childCategoryTreeNodes || []) {
        const name = str(c.category && c.category.categoryName), id = str(c.category && c.category.categoryId);
        if (c.leafCategoryTreeNode) { if (id) out.push({ id, name, path: path.join(' › ') }); } else if (depth < 20) walk(c, [...path, name], depth + 1);
      }
    };
    walk(r.rootCategoryNode || {}, [], 0);
    return out;
  });
  async function categories(q) {
    const all = await allCategories(), k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: all.length, items: all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const aspectsOf = (cat) => cached('asp:' + cat, 6 * 3600e3, async () => {
    const r = await call(`/commerce/taxonomy/v1/category_tree/${encodeURIComponent(await treeId())}/get_item_aspects_for_category?category_id=${encodeURIComponent(cat)}`, { app: true });
    return ((r && r.aspects) || []).filter((a) => str(a.localizedAspectName));
  });
  // Kategorinin ürün durumu politikası: { required, list: [{ id: conditionId, value }] } ya da null (politika dönmezse)
  const conditionsOf = (cat) => cached('cond:' + cat, 6 * 3600e3, async () => {
    const r = await call(`/sell/metadata/v1/marketplace/${market}/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${cat}}`)}`);
    const p = ((r && r.itemConditionPolicies) || []).find((x) => str(x.categoryId) === String(cat));
    if (!p) return null;
    return { required: !!p.itemConditionRequired, list: (p.itemConditions || []).filter((c) => CONDITION[str(c.conditionId)]).map((c) => ({ id: str(c.conditionId), value: str(c.conditionDescription) || CONDITION[str(c.conditionId)] })) };
  });
  async function attributes(cat) {
    const [asp, cond] = await Promise.all([aspectsOf(cat), conditionsOf(cat)]);
    return [
      ...(cond ? [{ id: COND, name: COND_NAME, mandatory: cond.required, kind: 'category', type: 'enum', custom: false, multi: false }] : []),
      ...asp.map((a) => { const k = a.aspectConstraint || {}, sel = k.aspectMode === 'SELECTION_ONLY';
        return { id: str(a.localizedAspectName), name: str(a.localizedAspectName), mandatory: !!k.aspectRequired, kind: k.aspectEnabledForVariations ? 'variant' : 'category',
          type: sel ? 'enum' : 'text', custom: !sel, multi: k.itemToAspectCardinality === 'MULTI' }; }),
    ];
  }
  async function values(cat, attr) {
    if (attr === COND) return ((await conditionsOf(cat)) || { list: [] }).list;
    const a = (await aspectsOf(cat)).find((x) => str(x.localizedAspectName) === String(attr));
    return [...new Set(((a && a.aspectValues) || []).map((v) => str(v.localizedValue)).filter(Boolean))].map((v) => ({ id: v, value: v }));
  }
  const currency = () => cached('cur', 24 * 3600e3, async () => str((((await call(`/sell/metadata/v1/marketplace/${market}/get_currencies`, { app: true })) || {}).defaultCurrency || {}).code));
  const policies = (k) => cached('pol:' + k, 600e3, async () => {
    const [path, field, label] = POLICY[k];
    let r;
    try { r = await call(`/sell/account/v1/${path}?marketplace_id=${market}`); } catch (e) {
      if (e.status === 401 || e.status === 403) throw new Error(`eBay ${label} okunamadı: refresh token'da sell.account (ya da sell.account.readonly) kapsamı olmalı (${errOf(e).slice(0, 160)})`);
      throw e;
    }
    // Motorlu taşıt ilanlarına ait politikalar kullanılmaz (CategoryTypeEnum)
    return ((r && r[field]) || []).filter((p) => !(p.categoryTypes || []).length || p.categoryTypes.some((c) => c.name === 'ALL_EXCLUDING_MOTORS_VEHICLES'))
      .map((p) => ({ id: str(p[k]), name: str(p.name) })).filter((p) => p.id);
  });
  const locations = () => cached('loc', 600e3, async () => {
    const r = (await call('/sell/inventory/v1/location?limit=100')) || {};
    return (r.locations || []).filter((l) => !l.merchantLocationStatus || l.merchantLocationStatus === 'ENABLED').map((l) => ({ id: str(l.merchantLocationKey), name: str(l.name) || str(l.merchantLocationKey) })).filter((l) => l.id);
  });
  // Seçenek: kimlik ya da ad; yazılmadıysa tek kayıt kullanılır
  function choose(list, want, label, missing) {
    const w = str(want);
    if (w) {
      const hit = list.find((p) => p.id === w) || list.find((p) => lc(p.name) === lc(w));
      if (!hit) missing.push(`${label} “${w}” eBay'de bulunamadı`);
      return hit ? hit.id : '';
    }
    if (list.length === 1) return list[0].id;
    if (!list.length) missing.push(`${label} eBay'de tanımlı değil`);
    else missing.push(`${label} seçin (eBay seçeneklerine adını yazın: ${list.slice(0, 4).map((p) => p.name).join(', ')}${list.length > 4 ? '…' : ''})`);
    return '';
  }
  const shortTitle = (s) => (s.length <= 80 ? s : s.slice(0, 81).replace(/\s+\S*$/, '') || s.slice(0, 80));
  const textOnly = (h) => str(String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '));
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], cat = str(map.remote_id), attrs = map.attrs || {}, sku = str(pr.sku), bc = str(pr.barcode);
    const [asp, cond] = await Promise.all([aspectsOf(cat), conditionsOf(cat)]);
    // Ürün durumu: kategori eşleştirmesinde seçilen conditionId
    let condition = '';
    if (cond) {
      const v = attrs[COND] || {}, want = str(v.id || v.value);
      const hit = want ? cond.list.find((c) => c.id === want) || cond.list.find((c) => lc(c.value) === lc(want)) : null;
      if (hit) condition = CONDITION[hit.id];
      else if (cond.required) missing.push(COND_NAME + (want ? ` (“${str(v.value) || want}” bu kategoride yok)` : ''));
    }
    // Özellikler (aspects): Brand / EAN / UPC ürünün kendi bilgisinden; diğerleri eşleştirmeden (sabit değer ya da '@variant')
    const aspects = {}, freeVar = [];
    const ean = /^(\d{8}|\d{13})$/.test(bc) ? bc : '', upc = /^\d{12}$/.test(bc) ? bc : '';
    for (const a of asp) {
      const k = a.aspectConstraint || {}, name = str(a.localizedAspectName), v = attrs[name], sel = k.aspectMode === 'SELECTION_ONLY';
      const list = (a.aspectValues || []).map((x) => str(x.localizedValue)).filter(Boolean), own = { brand: str(pr.brand), ean, upc }[lc(name)];
      let text = own || '', why = '';
      if (!text && v && v.value === '@variant') {
        const hit = pr.variant && pick ? await pick({ id: name }, pr.variant) : null;
        if (hit) text = str(hit.value);
        else if (!sel && oneAxis(pr.variant)) { freeVar.push(a); continue; } else why = pr.variant ? ` (varyant “${pr.variant}” eBay listesinde yok)` : ' (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)';
      } else if (!text && v && v.value !== '@image') text = str(v.value || v.id);
      if (text) {
        const hit = list.find((x) => lc(x) === lc(text));
        const max = num(k.aspectMaxLength) || 50; // Product.aspects: değer en çok 50 karakter (aspectMaxLength dönerse o)
        if (hit) text = hit; else if (sel) { why = ` (“${text}” eBay listesinde yok)`; text = ''; }
        if (text.length > max) { why = ` (en çok ${max} karakter)`; text = ''; }
      }
      if (text) aspects[name] = [text];
      else if (k.aspectRequired) missing.push(name + why);
    }
    // Serbest metin varyant özelliği: varyant adı tek parçaysa ve yalnız BİR özelliğe gidebiliyorsa o özelliğe yazılır (birden çoksa belirsiz)
    if (freeVar.length === 1 && str(oneAxis(pr.variant)).length <= (num((freeVar[0].aspectConstraint || {}).aspectMaxLength) || 50)) aspects[str(freeVar[0].localizedAspectName)] = [oneAxis(pr.variant)];
    else for (const a of freeVar) if ((a.aspectConstraint || {}).aspectRequired) missing.push(`${str(a.localizedAspectName)} (varyant “${pr.variant}” birden çok özelliğe uyuyor; kategori eşleştirmesinde değer seçin)`);
    if (!sku) missing.push('SKU'); else if (sku.length > 50) missing.push('SKU (eBay en çok 50 karakter)');
    if (!str(pr.name)) missing.push('ürün adı');
    const all = [...new Set([pr.image, ...(pr.images || [])].map(str).filter(Boolean))];
    const imgs = all.filter((u) => /^https:\/\//i.test(u)).slice(0, 24); // imageUrls: yalnız HTTPS, en çok 24
    if (!imgs.length) missing.push(all.length ? 'görsel (eBay yalnız https:// adresli görsel kabul eder)' : 'görsel');
    if (!(num(pr.price) > 0)) missing.push('fiyat');
    const desc = str(pr.description) || str(pr.name);
    if (desc.length > 500000) missing.push('açıklama (eBay en çok 500.000 karakter)');
    if (!lang) missing.push(`pazar yeri ${market} desteklenmiyor`);
    // Fiyat: panel, catalog.currency() para birimine çevrilmiş fiyatı verir (pr.price, pr.currency); eBay yalnız pazar yerinin para birimini
    // kabul eder (Amount.currency: "Only the currency of the marketplace is supported")
    const want = await currency();
    if (!want) throw new Error(`eBay: ${market} para birimi okunamadı`);
    const cur = str(pr.currency).toUpperCase() || want, price = Math.round(num(pr.price) * 100) / 100;
    if (cur !== want) missing.push(`fiyat para birimi (${cur}; eBay ${market} yalnız ${want} kabul eder)`);
    const pol = {};
    for (const k of Object.keys(POLICY)) pol[k] = choose(await policies(k), opts[k], POLICY[k][2], missing);
    const loc = choose(await locations(), opts.merchantLocationKey, 'stok konumu (inventory location)', missing);
    const product = { title: shortTitle(str(pr.name)), description: desc.length <= 4000 ? desc : textOnly(desc).slice(0, 4000), aspects, imageUrls: imgs,
      ...(str(pr.brand) && str(pr.brand).length <= 65 ? { brand: str(pr.brand) } : {}), ...(ean ? { ean: [ean] } : {}), ...(upc ? { upc: [upc] } : {}) };
    const qty = Math.max(0, Math.round(num(pr.stock)));
    return {
      key: sku, missing,
      payload: {
        sku,
        item: { sku, locale: lang.replace('-', '_'), product, ...(condition ? { condition } : {}), availability: { shipToLocationAvailability: { quantity: qty } } },
        offer: { sku, marketplaceId: market, format: 'FIXED_PRICE', listingDuration: 'GTC', availableQuantity: qty, categoryId: cat, listingDescription: desc,
          pricingSummary: { price: { value: price.toFixed(2), currency: cur } }, listingPolicies: pol, merchantLocationKey: loc },
      },
    };
  }
  // Gönderim: 25'erli bulk çağrılar; sonuç SKU başına { key, ok, status, error }
  async function send(items) {
    const res = new Map(), H = { 'Content-Language': lang };
    const put = (sku, ok, status, error = '') => res.set(sku, { key: sku, ok, status, error });
    const NOT_FOUND = [25701, 25702, 25710]; // bulkGetInventoryItem hata kodları: SKU sistemde yok
    // 1) eBay'de aynı SKU ile stok kaydı varsa üzerine yazılmaz (createOrReplace kaydın tamamını değiştirir)
    const fresh = [];
    for (const part of chunk(items, 25)) {
      let rows;
      try { rows = ((await call('/sell/inventory/v1/bulk_get_inventory_item', { method: 'POST', body: { requests: part.map((x) => ({ sku: x.sku })) } })) || {}).responses || []; } catch (e) {
        const errs = (e.data && e.data.errors) || [];
        if (e.status === 400 && errs.length && errs.every((x) => NOT_FOUND.includes(num(x.errorId)))) rows = part.map((x) => ({ sku: x.sku, statusCode: 404 }));
        else if (!fresh.length && !res.size) throw e; // ilk çağrı (bağlantı / yetki): gönderim hiç başlamadı
        else { for (const x of part) put(x.sku, false, 'eBay\'e ulaşılamadı', errOf(e)); continue; }
      }
      const by = new Map(rows.map((r) => [str(r.sku), r]));
      for (const x of part) {
        const r = by.get(x.sku) || {}, code = num(r.statusCode);
        if (code === 200 && r.inventoryItem) put(x.sku, false, 'eBay\'de zaten var', 'eBay\'de bu SKU ile stok kaydı zaten var; ilanlar yenilenince panele bağlanır');
        else if (code === 404 || (r.errors || []).some((y) => NOT_FOUND.includes(num(y.errorId)))) fresh.push(x);
        else put(x.sku, false, 'eBay kontrol edilemedi', errText(r.errors) || `HTTP ${code || '?'}`);
      }
    }
    const made = new Set();
    // Yayınlanamayan ürün: bu gönderimde açılan stok kaydı (ve yayınlanmamış teklifi) silinir
    async function fail(x, status, error) {
      let left = '';
      if (made.has(x.sku)) {
        try { await call(`/sell/inventory/v1/inventory_item/${encodeURIComponent(x.sku)}`, { method: 'DELETE', tries: 1 }); } catch (e) { if (e.status !== 404) left = ' · yayınlanmamış stok kaydı eBay\'de kaldı (Seller Hub\'dan silin)'; }
      }
      put(x.sku, false, status, (error || status) + left);
    }
    // 2) stok kayıtları
    const items2 = [];
    for (const part of chunk(fresh, 25)) {
      let rows;
      try { rows = ((await call('/sell/inventory/v1/bulk_create_or_replace_inventory_item', { method: 'POST', headers: H, body: { requests: part.map((x) => x.item) } })) || {}).responses || []; } catch (e) {
        for (const x of part) put(x.sku, false, 'eBay kabul etmedi', errOf(e));
        continue;
      }
      const by = new Map(rows.map((r) => [str(r.sku), r]));
      for (const x of part) {
        const r = by.get(x.sku) || {};
        if (num(r.statusCode) >= 200 && num(r.statusCode) < 300) { made.add(x.sku); items2.push(x); } else put(x.sku, false, 'eBay kabul etmedi', errText(r.errors) || `HTTP ${num(r.statusCode) || '?'}`);
      }
    }
    // 3) teklifler
    const offered = [];
    for (const part of chunk(items2, 25)) {
      let rows;
      try { rows = ((await call('/sell/inventory/v1/bulk_create_offer', { method: 'POST', headers: H, tries: 1, body: { requests: part.map((x) => x.offer) } })) || {}).responses || []; } catch (e) {
        for (const x of part) await fail(x, 'eBay teklifi kabul etmedi', errOf(e));
        continue;
      }
      const by = new Map(rows.map((r) => [str(r.sku), r]));
      for (const x of part) {
        const r = by.get(x.sku) || {};
        if (str(r.offerId) && num(r.statusCode) < 300) offered.push({ ...x, offerId: str(r.offerId) }); else await fail(x, 'eBay teklifi kabul etmedi', errText(r.errors) || `HTTP ${num(r.statusCode) || '?'}`);
      }
    }
    // 4) yayın
    for (const part of chunk(offered, 25)) {
      let rows;
      try { rows = ((await call('/sell/inventory/v1/bulk_publish_offer', { method: 'POST', tries: 1, body: { requests: part.map((x) => ({ offerId: x.offerId })) } })) || {}).responses || []; } catch (e) {
        for (const x of part) await fail(x, 'eBay yayınlamadı', errOf(e));
        continue;
      }
      const by = new Map(rows.map((r) => [str(r.offerId), r]));
      for (const x of part) {
        const r = by.get(x.offerId) || {};
        if (str(r.listingId) && num(r.statusCode) < 300) put(x.sku, true, `eBay'de yayında (ilan ${str(r.listingId)})`);
        else await fail(x, 'eBay yayınlamadı', errText(r.errors) || `HTTP ${num(r.statusCode) || '?'}`);
      }
    }
    // Sonuç kv'de son 50 gönderim yuvasında saklanır; kv yoksa ref'in içinde
    const out = items.map((x) => res.get(x.sku) || { key: x.sku, ok: false, status: 'Sonuç alınamadı', error: 'eBay bu ürün için sonuç vermedi' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (kv) {
      try { const n = (Math.round(num(await kv.get('uploadSeq'))) + 1) % 50; await kv.set('uploadSeq', n); await kv.set('upload:' + n, { id, items: out }); return { ref: `up:${n}:${id}` }; } catch { /* kv yazılamadı: sonuç ref'te */ }
    }
    return { ref: 'r:' + encodeURIComponent(JSON.stringify(out)) };
  }
  async function status(ref) {
    const s = String(ref || '');
    if (s.startsWith('r:')) { try { return { done: true, items: JSON.parse(decodeURIComponent(s.slice(2))) }; } catch { return { done: true, items: [] }; } }
    const m = /^up:(\d+):(\w+)$/.exec(s);
    let v = null;
    try { v = m && kv ? await kv.get('upload:' + m[1]) : null; } catch { /* okunamadı */ }
    return { done: true, items: v && v.id === m[2] ? v.items || [] : [] };
  }
  const catalog = { categories, allCategories, attributes, values, build, send, status, currency, chunk: 25,
    options: [{ k: 'fulfillmentPolicyId', label: 'Kargo politikası (birden çok varsa adı ya da ID)' },
      { k: 'paymentPolicyId', label: 'Ödeme politikası (birden çok varsa adı ya da ID)' }, { k: 'returnPolicyId', label: 'İade politikası (birden çok varsa adı ya da ID)' },
      { k: 'merchantLocationKey', label: 'Stok konumu (birden çok varsa merchantLocationKey ya da adı)' }] };

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik (OAuth belirteci)', async () => { await auth(); return { detail: `alındı · ${HOST.replace('https://', '')} · pazar yeri ${market}` }; });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => {
      const r = (await call(`/sell/fulfillment/v1/order?filter=${enc(`creationdate:[${iso(now - 864e5)}..]`)}&limit=1`)) || {}, o = (r.orders || [])[0];
      return { detail: `${num(r.total)} sipariş${o ? ` · örnek ${o.orderId}: ${o.orderFulfillmentStatus} → ${norm(o).status}` : ''}` };
    });
    await diagStep(out, 'Stok kayıtları (Inventory API)', async () => {
      const r = (await call('/sell/inventory/v1/inventory_item?limit=1')) || {};
      return { ok: num(r.total) ? true : null, detail: num(r.total) ? `${num(r.total)} stok kaydı (SKU)` : 'Inventory API\'de kayıt yok: Seller Hub ile açılan ilanlar bu API\'de görünmez (bulk_migrate_listing ile taşınmalı)' };
    });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await call(`/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`); return { detail: JSON.stringify(o).slice(0, 600) }; });
    return out;
  }

  const missing = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET', 'EBAY_REFRESH_TOKEN'].filter((k) => !str(env[k]));
  return {
    ...meta, type: 'ebay', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose, catalog,
  };
}
