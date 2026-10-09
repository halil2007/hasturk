// Shopify (Admin GraphQL API, sürüm 2026-10 — erişilebilir: 16 Ekim 2027'ye kadar; her yıl en az bir kez yükseltin). Kendi web siteniz: komisyon yok, etiketi panel basar, takip no satıcı girer.
// Kimlik iki yoldan biri:
//  (1) Dev Dashboard uygulaması (1 Ocak 2026'dan beri yeni uygulamalar yalnız böyle): Client ID + Client secret → client credentials grant ile
//      24 saatlik erişim belirteci alınır (POST {mağaza}/admin/oauth/access_token), süresi dolmadan yenilenir. Uygulama ve mağaza aynı Shopify organizasyonunda olmalı.
//  (2) Eskiden Shopify yönetiminde oluşturulmuş özel uygulama: Admin API erişim belirteci (shpat_…). Başlık: X-Shopify-Access-Token.
// İzinler: read_orders (60 günden eski siparişler için read_all_orders), write_products, write_inventory, read_locations,
// write_merchant_managed_fulfillment_orders + write_fulfillments (kargoya verme).
// Desteklenen: siparişler (senkronda güncellenme, geçmiş aktarımında sipariş tarihi), tek sipariş, varyant listesi, stok (tek lokasyon: girilen ya da ana lokasyon),
// fiyat, kargoya verme (fulfillmentCreate + takip bilgisi, müşteriye bildirim). Yok: ürün oluşturma, iade talepleri, soru-cevap.
// Sorgu maliyeti 1000 puanı aşarsa sayfa boyutu kendiliğinden küçültülür; THROTTLED hatasında kısa bekleyip yeniden denenir.
// Stok mutasyonları (inventorySetQuantities, inventoryActivate) 2026-04'ten beri @idempotent anahtarı ister; tekrar denemede aynı anahtar gider.
import { http, num, str, r2, chunk, imageList, sleep, diagStep } from '../util.js';

export const SHOPIFY_VER = '2026-10';
const gid = (type, id) => (/^gid:\/\//.test(String(id)) ? String(id) : `gid://shopify/${type}/${id}`);
const nid = (g) => str(g).replace(/\?.*$/, '').split('/').pop();
const money = (s) => num(s && s.shopMoney && s.shopMoney.amount);
const uuid = () => crypto.randomUUID();
// "xxx", "xxx.myshopify.com", "https://xxx.myshopify.com/admin" ya da "admin.shopify.com/store/xxx" → xxx.myshopify.com
export function shopifyStore(v) {
  let s = str(v).replace(/^https?:\/\//i, '');
  const adm = /^admin\.shopify\.com\/store\/([a-z0-9-]+)/i.exec(s);
  s = adm ? adm[1] : s.replace(/[/?#].*$/, '').replace(/\.myshopify\.com$/i, '');
  // Yalnız mağaza adı: erişim belirteci başka bir sunucuya gitmesin
  return /^[a-z0-9][a-z0-9-]*$/i.test(s) ? `${s.toLowerCase()}.myshopify.com` : '';
}
export function shopifyStatus(o) {
  if (o.cancelledAt) return 'cancelled';
  const ff = o.displayFulfillmentStatus, fs = (o.fulfillments || []).filter((f) => f.displayStatus !== 'CANCELED');
  // Hiç gönderilmeden tamamı iade edilen sipariş iptaldir (ürün depodan çıkmadı); gönderildiyse iade
  if (o.displayFinancialStatus === 'REFUNDED') return !fs.length && ['UNFULFILLED', 'RESTOCKED', 'OPEN'].includes(ff) ? 'cancelled' : 'returned';
  if (ff === 'FULFILLED') return fs.length && fs.every((f) => f.displayStatus === 'DELIVERED') ? 'delivered' : 'shipped';
  if (ff === 'FULFILLMENT_NOT_REQUIRED') return 'delivered'; // gönderilecek kalem yok (dijital ürün, hizmet)
  if (ff === 'PARTIALLY_FULFILLED' || ff === 'IN_PROGRESS') return 'processing';
  return 'new';
}
// Shopify'ın tanıdığı Türk kargo adları (takip bağlantısı kendiliğinden oluşur): PTT, Yurtiçi Kargo, Aras Kargo, Sürat Kargo
export const shopifyCarrier = (c) => { const s = str(c); return /^ptt/i.test(s) ? 'PTT' : /^yurti[çc]i/i.test(s) ? 'Yurtiçi Kargo' : /^aras/i.test(s) ? 'Aras Kargo' : /^s[üu]rat/i.test(s) ? 'Sürat Kargo' : /^dhl\s*e-?commerce$/i.test(s) ? 'DHL eCommerce' : s; };

// discountedTotalSet: satır indirimleri + (withCodeDiscounts) kod indirimleri düşülmüş, iade / çıkarılan adetler dahil satır tutarı
const LI = 'id sku name quantity currentQuantity variant { id barcode } image { url } originalUnitPriceSet { shopMoney { amount } } discountedTotalSet(withCodeDiscounts: true) { shopMoney { amount } } taxLines { priceSet { shopMoney { amount } } }';
const ORDER = `id name createdAt updatedAt displayFinancialStatus displayFulfillmentStatus cancelledAt taxesIncluded email phone customer { id firstName lastName }
    shippingAddress { name address1 address2 city province phone } totalPriceSet { shopMoney { amount currencyCode } } currentTotalPriceSet { shopMoney { amount } }
    lineItems(first: 10) { pageInfo { hasNextPage endCursor } nodes { ${LI} } }
    fulfillments(first: 10) { displayStatus trackingInfo(first: 3) { number company } }`;
const ORDERS = `query($first: Int!, $after: String, $q: String, $sort: OrderSortKeys) { orders(first: $first, after: $after, query: $q, sortKey: $sort) {
  pageInfo { hasNextPage endCursor }
  nodes { ${ORDER} } } }`;
const ONE = `query($id: ID!) { order(id: $id) { ${ORDER} } }`;
const MORE_ITEMS = `query($id: ID!, $after: String) { order(id: $id) { lineItems(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${LI} } } } }`;
// Stok: lokasyon biliniyorsa o lokasyondaki "available" (stok yalnız o lokasyona yazılır); bilinmiyorsa tüm lokasyonların toplamı
const VARIANTS = (loc) => `query($first: Int!, $after: String${loc ? ', $loc: ID!' : ''}) { productVariants(first: $first, after: $after) { pageInfo { hasNextPage endCursor }
  nodes { id sku barcode title price compareAtPrice inventoryQuantity image { url } product { id title status featuredMedia { preview { image { url } } } }${loc ? ' inventoryItem { tracked inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } } }' : ''} } } }`;
// Korunan müşteri verisi (ad, adres, e-posta, telefon) izni yoksa Shopify veriyi boş alanlarla + hata listesiyle döner
const PII = /^(customer|email|phone|shippingAddress|billingAddress|firstName|lastName|name|address1|address2|city|province|zip)$/;

export function shopify(env, meta = {}) {
  const store = shopifyStore(env.SHOPIFY_STORE), cid = str(env.SHOPIFY_CLIENT_ID), csec = str(env.SHOPIFY_CLIENT_SECRET);
  const API = `https://${store}/admin/api/${SHOPIFY_VER}/graphql.json`, kv = meta && meta.kv;
  let token = str(env.SHOPIFY_TOKEN), tokenExp = token ? Infinity : 0;
  let location = env.SHOPIFY_LOCATION_ID ? gid('Location', str(env.SHOPIFY_LOCATION_ID)) : '';

  // Client credentials: belirteç 24 saat geçerli (expires_in 86399); bitmesine 5 dk kala yenilenir, kanal deposunda (kv) saklanır
  async function auth(force = false) {
    if (!force && token && Date.now() < tokenExp - 300e3) return token;
    if (!cid || !csec) return token;
    if (!force && kv) {
      const c = await Promise.resolve(kv.get('token')).catch(() => null);
      if (c && c.token && c.cid === cid && c.store === store && num(c.exp) > Date.now() + 300e3) { token = c.token; tokenExp = num(c.exp); return token; }
    }
    let r;
    try {
      r = await http(`https://${store}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cid, client_secret: csec }).toString() });
    } catch (e) {
      throw new Error(`Shopify: erişim belirteci alınamadı (${e.message.slice(0, 200)}) · Client ID / secret doğru mu, uygulama mağazaya kurulu mu, uygulama ve mağaza aynı Shopify organizasyonunda mı?`);
    }
    if (!r || !r.access_token) throw new Error('Shopify: erişim belirteci alınamadı (cevapta access_token yok)');
    token = str(r.access_token); tokenExp = Date.now() + num(r.expires_in, 86399) * 1000;
    if (kv) await Promise.resolve(kv.set('token', { token, exp: tokenExp, cid, store })).catch(() => null);
    return token;
  }

  // partial: korunan müşteri verisi izni eksikse hata yerine boş alanlarla devam edilir (uyarı warn dizisine yazılır)
  async function gql(query, variables = {}, { partial = null } = {}) {
    for (let i = 1, renewed = false; ; i++) {
      let r;
      try {
        r = (await http(API, { method: 'POST', headers: { 'X-Shopify-Access-Token': await auth(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) })) || {};
      } catch (e) {
        // Süresi dolmuş / iptal edilmiş belirteç: client credentials ile bir kez yenilenir
        if (e.status === 401 && cid && csec && !renewed) { renewed = true; await auth(true); i--; continue; }
        throw e;
      }
      const errs = !r.errors ? [] : Array.isArray(r.errors) ? r.errors : [{ message: typeof r.errors === 'string' ? r.errors : JSON.stringify(r.errors) }];
      if (!errs.length) return r.data || {};
      if (partial && r.data && errs.every((e) => Array.isArray(e.path) && e.path.some((p) => PII.test(String(p))))) {
        partial.push('Shopify: müşteri bilgileri (ad, adres, telefon, e-posta) okunamadı — uygulamaya korunan müşteri verisi erişimi verilmeli (Dev Dashboard → uygulama → API erişimi → Protected customer data)');
        return r.data;
      }
      const ext = (errs[0] && errs[0].extensions) || {};
      // Sızdıran kova (leaky bucket) boşalana kadar bekle: eksik puan / dolum hızı (en çok 5 sn)
      if (errs.some((e) => e.extensions && e.extensions.code === 'THROTTLED') && i < 4) {
        const c = (r.extensions && r.extensions.cost) || {}, t = c.throttleStatus || {};
        await sleep(Math.min(5000, Math.max(500, ((num(c.requestedQueryCost, 100) - num(t.currentlyAvailable)) / num(t.restoreRate, 50)) * 1000)));
        continue;
      }
      const err = new Error('Shopify: ' + errs.map((e) => e.message).join('; ').slice(0, 400));
      Object.assign(err, { code: ext.code, cost: num(ext.cost), maxCost: num(ext.maxCost, 1000), gql: true });
      throw err;
    }
  }
  // Mutasyon sonucundaki userErrors → anlaşılır hata
  const ok = (res, what) => {
    const e = (res && res.userErrors) || [];
    if (e.length) throw new Error(`Shopify: ${what}: ` + e.map((u) => (u.field ? u.field.join('.') + ': ' : '') + u.message).join('; ').slice(0, 400));
    return res || {};
  };
  // Sayfalı okuma; sorgu maliyeti sınırı (MAX_COST_EXCEEDED) aşılırsa sayfa boyutu orantılı küçültülür (sonraki çağrılar için saklanır).
  // Sayfa sınırına gelindiyse dönen dizide more = true (kalan kayıtlar okunmadı).
  // Ölçülen istenen maliyet (2026-10): 50 sipariş ≈ 163, 100 varyant (lokasyon stoğuyla) ≈ 83 puan — tek sorgu sınırı 1000
  const sizes = { orders: 50, variants: 100 };
  async function paged(query, vars, pick, key, max, opts) {
    const out = [];
    let after = null, size = sizes[key];
    for (let p = 0; p < max; p++) {
      let d;
      try { d = await gql(query, { ...vars, first: size, after }, opts); } catch (e) {
        if (e.code === 'MAX_COST_EXCEEDED' && size > 1) { size = Math.max(1, Math.min(size - 1, Math.floor((size * e.maxCost * 0.8) / (e.cost || size * 100)))); sizes[key] = size; p--; continue; }
        throw e;
      }
      const c = pick(d) || {};
      out.push(...(c.nodes || []));
      if (!c.pageInfo || !c.pageInfo.hasNextPage) return out;
      after = c.pageInfo.endCursor;
    }
    out.more = true;
    return out;
  }

  // Stok lokasyonu: panelde girilen; yoksa mağazanın ana (primary) lokasyonu; o da okunamazsa ilk etkin lokasyon
  async function getLocation() {
    if (location) return location;
    const d = await gql('{ location { id isActive } }');
    if (d.location && d.location.id && d.location.isActive !== false) return (location = d.location.id);
    const l = (((await gql('{ locations(first: 5) { nodes { id name isActive } } }')).locations || {}).nodes || []).find((x) => x.isActive !== false);
    if (!l) throw new Error('Shopify: etkin stok lokasyonu bulunamadı (Ayarlar → Lokasyonlar)');
    return (location = l.id);
  }

  function norm(o) {
    const a = o.shippingAddress || {}, c = o.customer || {};
    const items = o.items.map((it) => {
      const q0 = num(it.quantity, 1), cur = it.currentQuantity == null ? q0 : num(it.currentQuantity);
      // KDV hariç fiyatlı mağazada (taxesIncluded = false) satır vergisi eklenir: panel tutarları KDV dahil
      const tax = o.taxesIncluded === false ? (it.taxLines || []).reduce((s, t) => s + money(t.priceSet), 0) : 0;
      const gross = (it.discountedTotalSet ? money(it.discountedTotalSet) : money(it.originalUnitPriceSet) * q0) + tax;
      // Kısmen çıkarılan / iade edilen satır: kalan adet ve orantılı tutar; tamamı çıkarıldıysa satır iptal
      const qty = cur > 0 && cur < q0 ? cur : q0, total = r2(q0 ? (gross * qty) / q0 : gross);
      return { lineId: nid(it.id), sku: str(it.sku), barcode: str(it.variant && it.variant.barcode), name: str(it.name), image: str(it.image && it.image.url), quantity: qty,
        unitPrice: qty ? r2(total / qty) : money(it.originalUnitPriceSet), total, status: cur === 0 && q0 > 0 ? 'cancelled' : '', remoteKey: it.variant ? nid(it.variant.id) : '' };
    });
    const ti = (o.fulfillments || []).flatMap((f) => f.trackingInfo || []).filter((t) => t.number || t.company).pop() || {};
    const status = shopifyStatus(o), name = [c.firstName, c.lastName].map(str).filter(Boolean).join(' ') || str(a.name);
    // Tutar: siparişten çıkarılan kalemler / iadeler düşülmüş güncel toplam (iptal ve iadede ilk toplam)
    const total = !['cancelled', 'returned'].includes(status) && o.currentTotalPriceSet ? money(o.currentTotalPriceSet) : money(o.totalPriceSet);
    return {
      remoteId: nid(o.id), orderNumber: str(o.name).replace(/^#/, ''), orderedAt: Date.parse(o.createdAt) || Date.now(),
      remoteStatus: o.cancelledAt ? 'CANCELLED' : [o.displayFinancialStatus, o.displayFulfillmentStatus].filter(Boolean).join(' · '), status,
      customer: name, phone: str(a.phone || o.phone), email: str(o.email), customerId: c.id ? nid(c.id) : '',
      // Türkiye adreslerinde province = il, city = ilçe
      address: { name: str(a.name) || name, line: [a.address1, a.address2].map(str).filter(Boolean).join(' '), district: a.province ? str(a.city) : '', city: str(a.province || a.city), phone: str(a.phone || o.phone) },
      total, currency: str(o.totalPriceSet && o.totalPriceSet.shopMoney && o.totalPriceSet.shopMoney.currencyCode) || 'TRY',
      cargoCompany: str(ti.company), tracking: str(ti.number), items, packages: null,
    };
  }
  // 10'dan fazla kalemli siparişin kalan kalemleri ayrıca okunur
  async function withItems(o, warn) {
    o.items = [...((o.lineItems || {}).nodes || [])];
    for (let pi = (o.lineItems || {}).pageInfo || {}, n = 0; pi.hasNextPage && n < 10; n++) {
      const li = ((await gql(MORE_ITEMS, { id: o.id, after: pi.endCursor }, { partial: warn })).order || {}).lineItems || {};
      o.items.push(...(li.nodes || []));
      pi = li.pageInfo || {};
    }
    return o;
  }
  const uniq = (a) => [...new Set(a)];

  // Senkronda güncellenme tarihine göre (sonradan kargolanan / iptal edilen siparişler de gelir), geçmiş aktarımında sipariş tarihine göre (eskiden yeniye)
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const f = byOrdered ? 'created_at' : 'updated_at', iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z'), warn = [];
    const rows = await paged(ORDERS, { q: `${f}:>='${iso(since)}' ${f}:<='${iso(until)}'`, sort: byOrdered ? 'CREATED_AT' : 'UPDATED_AT' }, (d) => d.orders, 'orders', 100, { partial: warn });
    for (const o of rows) await withItems(o, warn);
    const out = rows.map(norm);
    // Sayfa sınırı (100 sayfa): kalanlar bir sonraki senkronda, son okunan siparişin güncellenme zamanından devam edilir
    if (rows.more) {
      warn.push(`Shopify: bu aralıkta ${rows.length}+ sipariş var; kalanlar bir sonraki senkronda alınacak`);
      const last = Date.parse((rows[rows.length - 1] || {}).updatedAt);
      if (!byOrdered) out.partialUntil = Number.isFinite(last) ? Math.max(since, last) : since;
    }
    if (warn.length) out.warnings = uniq(warn);
    return out;
  }
  async function fetchOne(remoteId) {
    const warn = [], o = (await gql(ONE, { id: gid('Order', remoteId) }, { partial: warn })).order;
    if (!o) throw new Error('Shopify: sipariş bulunamadı (silinmiş ya da 60 günden eski: read_all_orders izni gerekir)');
    return norm(await withItems(o, warn));
  }
  // Silinen sipariş null döner. Not: read_all_orders izni yoksa 60 günden eski siparişler de null döner (panel 30 günü aşan açık siparişi zaten kapatır).
  const orderExists = async (remoteId) => !!(await gql('query($id: ID!) { order(id: $id) { id } }', { id: gid('Order', remoteId) })).order;

  async function fetchListings() {
    const loc = await getLocation().catch(() => '');
    return (await paged(VARIANTS(loc), loc ? { loc } : {}, (d) => d.productVariants, 'variants', 400)).map((v) => {
      const p = v.product || {}, pimg = str(p.featuredMedia && p.featuredMedia.preview && p.featuredMedia.preview.image && p.featuredMedia.preview.image.url);
      const vname = v.title === 'Default Title' ? '' : str(v.title), price = num(v.price);
      const lvl = v.inventoryItem && v.inventoryItem.inventoryLevel, avail = lvl && (lvl.quantities || []).find((q) => q.name === 'available');
      return { remoteId: nid(v.id), remoteProductId: nid(p.id), sku: str(v.sku), barcode: str(v.barcode), name: vname ? `${str(p.title)} - ${vname}` : str(p.title), groupName: str(p.title), variantName: vname,
        image: str(v.image && v.image.url) || pimg, images: imageList([v.image && v.image.url, pimg]), price, listPrice: Math.max(num(v.compareAtPrice), price),
        stock: avail ? num(avail.quantity) : num(v.inventoryQuantity), active: p.status === 'ACTIVE' };
    });
  }

  // Varyant → stok kalemi (ve lokasyonda etkin mi) / ürün kimliği; 100'erli nodes sorgusu
  async function variantInfo(ids, loc) {
    const out = new Map();
    for (const part of chunk([...new Set(ids)], 100)) {
      const d = await gql(`query($ids: [ID!]!${loc ? ', $loc: ID!' : ''}) { nodes(ids: $ids) { ... on ProductVariant { id product { id } inventoryItem { id tracked${loc ? ' inventoryLevel(locationId: $loc) { id }' : ''} } } } }`,
        { ids: part.map((x) => gid('ProductVariant', x)), ...(loc ? { loc } : {}) });
      for (const n of d.nodes || []) if (n && n.id) out.set(nid(n.id), n);
    }
    return out;
  }

  async function pushStock(items) {
    const loc = await getLocation(), info = await variantInfo(items.map((x) => x.remoteId), loc), qs = [];
    for (const x of items) {
      const inv = (info.get(String(x.remoteId)) || {}).inventoryItem;
      if (!inv || !inv.tracked) continue; // silinmiş varyant ya da Shopify'da stok takibi kapalı: atlanır
      // Bu lokasyonda stoklanmayan kalem önce etkinleştirilir
      if (!inv.inventoryLevel) ok((await gql('mutation($i: ID!, $l: ID!, $key: String!) { inventoryActivate(inventoryItemId: $i, locationId: $l) @idempotent(key: $key) { userErrors { field message } } }', { i: inv.id, l: loc, key: uuid() })).inventoryActivate, 'stok lokasyonu etkinleştirme');
      // changeFromQuantity: null → karşılaştırmasız yazılır (panel stoğun kaynağıdır); 2026-04'ten beri alan zorunlu (null da olsa gönderilmeli)
      qs.push({ inventoryItemId: inv.id, locationId: loc, quantity: Math.max(0, Math.round(num(x.stock))), changeFromQuantity: null });
    }
    for (const part of chunk(qs, 100)) {
      const d = await gql('mutation($input: InventorySetQuantitiesInput!, $key: String!) { inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } } }',
        { input: { name: 'available', reason: 'correction', quantities: part }, key: uuid() });
      ok(d.inventorySetQuantities, 'stok');
    }
  }

  async function pushPrice(items) {
    const noParent = items.filter((x) => !x.remoteProductId).map((x) => x.remoteId);
    const info = noParent.length ? await variantInfo(noParent) : new Map(), by = new Map();
    for (const x of items) {
      const pid = x.remoteProductId || nid(((info.get(String(x.remoteId)) || {}).product || {}).id);
      if (!pid) continue;
      const price = num(x.price), list = num(x.listPrice);
      by.set(pid, [...(by.get(pid) || []), { id: gid('ProductVariant', x.remoteId), price: String(price), compareAtPrice: list > price ? String(list) : null }]);
    }
    for (const [pid, variants] of by) {
      const d = await gql('mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { field message } } }', { p: gid('Product', pid), v: variants });
      ok(d.productVariantsBulkUpdate, 'fiyat');
    }
  }

  // Panelde açılan ürünü mağazada oluştur: ürün (başlık, açıklama, yayında) + görseller → tek varyantın fiyatı, SKU, barkodu ve
  // stok takibi → stok (mağazanın lokasyonuna). Shopify ürünü varsayılan tek varyantla açar.
  async function createProduct(pr) {
    let imgs = [];
    try { imgs = JSON.parse(pr.images || '[]'); } catch { /* bozuk liste */ }
    imgs = [...new Set([pr.image, ...imgs].filter((u) => /^https:\/\//i.test(u || '')))].slice(0, 10);
    const d = await gql('mutation($p: ProductCreateInput!, $m: [CreateMediaInput!]) { productCreate(product: $p, media: $m) { product { id variants(first: 1) { nodes { id } } } userErrors { field message } } }', {
      p: { title: pr.name, descriptionHtml: pr.description || '', status: 'ACTIVE', ...(pr.brand ? { vendor: pr.brand } : {}) },
      m: imgs.map((u) => ({ originalSource: u, mediaContentType: 'IMAGE' })),
    });
    ok(d.productCreate, 'ürün');
    const prod = d.productCreate.product, v = ((prod.variants || {}).nodes || [])[0];
    if (!v) throw new Error('Shopify ürünü varyantsız döndü');
    const price = num(pr.sale_price), stock = Math.max(0, Math.round(num(pr.stock)));
    const u = await gql('mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { field message } } }', {
      p: prod.id, v: [{ id: v.id, price: String(price), ...(pr.barcode ? { barcode: String(pr.barcode) } : {}), inventoryItem: { sku: pr.sku || undefined, tracked: true } }],
    });
    ok(u.productVariantsBulkUpdate, 'varyant');
    const listing = { remoteId: nid(v.id), remoteProductId: nid(prod.id), sku: pr.sku || '', barcode: pr.barcode || '', name: pr.name, price, stock };
    await pushStock([listing]);
    return listing;
  }

  // Kargoya ver: açık gönderim emirleri (fulfillment order) takip bilgisiyle kapatılır; paket kalemleri verildiyse yalnız onlar
  async function ship(order, pkg, { cargoCompany, tracking } = {}) {
    const d = await gql(`query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 5) { nodes { id status lineItems(first: 50) { nodes { id remainingQuantity lineItem { id } } } } } } }`, { id: gid('Order', order.remote_id) });
    const fos = (((d.order || {}).fulfillmentOrders || {}).nodes || []);
    const open = fos.filter((f) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
    if (!open.length) {
      if (fos.some((f) => f.status === 'CLOSED')) return {}; // Shopify'da zaten gönderilmiş
      throw new Error(`Shopify: gönderilecek açık kalem yok (gönderim durumları: ${fos.map((f) => f.status).join(', ') || '-'})`);
    }
    const need = new Map(((pkg && pkg.items) || []).map((i) => [String(i.line_id), num(i.qty, 1)]));
    const groups = [];
    for (const f of open) {
      if (!need.size) { groups.push({ fulfillmentOrderId: f.id }); continue; }
      const lines = [];
      for (const l of (f.lineItems || {}).nodes || []) {
        const k = nid(l.lineItem && l.lineItem.id), q = Math.min(need.get(k) || 0, num(l.remainingQuantity));
        if (q > 0) { lines.push({ id: l.id, quantity: q }); need.set(k, need.get(k) - q); }
      }
      if (lines.length) groups.push({ fulfillmentOrderId: f.id, fulfillmentOrderLineItems: lines });
    }
    if (!groups.length) return {};
    const fulfillment = { lineItemsByFulfillmentOrder: groups, notifyCustomer: true, ...(tracking || cargoCompany ? { trackingInfo: { number: str(tracking), company: shopifyCarrier(cargoCompany) } } : {}) };
    const r = ok((await gql('mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id status } userErrors { field message } } }', { f: fulfillment })).fulfillmentCreate, 'kargoya verme');
    return r.fulfillment ? { remoteId: nid(r.fulfillment.id) } : {};
  }

  const NEED = ['read_orders', 'write_products', 'write_inventory', 'read_locations', 'write_merchant_managed_fulfillment_orders', 'write_fulfillments'];
  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const shop = await diagStep(out, 'Shopify bağlantısı', async () => { const d = await gql('{ shop { name myshopifyDomain currencyCode } }'); return { detail: `${d.shop.name} (${d.shop.myshopifyDomain}) · para birimi ${d.shop.currencyCode} · API ${SHOPIFY_VER} · ${tokenExp === Infinity ? 'erişim belirteci (shpat_)' : 'Client ID / secret (24 saatlik belirteç)'}` }; });
    if (!shop) return out;
    await diagStep(out, 'Uygulama izinleri', async () => {
      const d = await gql('{ currentAppInstallation { accessScopes { handle } } }'), have = ((d.currentAppInstallation || {}).accessScopes || []).map((s) => s.handle);
      const miss = NEED.filter((s) => !have.includes(s) && !have.includes(s.replace(/^read_/, 'write_')));
      const old = have.includes('read_all_orders') ? '' : ' · read_all_orders yok: 60 günden eski siparişler aktarılamaz';
      return { ok: miss.length ? null : true, detail: (miss.length ? `Eksik izin: ${miss.join(', ')} (uygulama → Admin API izinleri)` : 'Gerekli izinler açık') + old };
    });
    await diagStep(out, 'Stok lokasyonu', async () => {
      const loc = await getLocation(), all = (((await gql('{ locations(first: 20) { nodes { id name fulfillsOnlineOrders } } }')).locations || {}).nodes || []).filter((l) => l.fulfillsOnlineOrders !== false);
      const me = all.find((l) => l.id === loc), others = all.filter((l) => l.id !== loc);
      return { ok: others.length ? null : true, detail: `${me ? me.name + ' · ' : ''}${loc}${env.SHOPIFY_LOCATION_ID ? '' : ' (ana lokasyon)'}${others.length ? ` · dikkat: ${others.length} lokasyon daha online sipariş karşılıyor (${others.map((l) => l.name).slice(0, 3).join(', ')}); panel stoğu yalnız bu lokasyona yazar, diğerlerindeki stok da satılır` : ''}` };
    });
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * 864e5, now); return { ok: o.warnings ? null : true, detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ''}${o.warnings ? ' · ' + o.warnings.join(' · ') : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `#${o.orderNumber}: ${o.remoteStatus} → ${o.status} · ${o.items.length} kalem` }; });
    await diagStep(out, 'Ürünler (varyantlar)', async () => { const d = await gql('{ productVariants(first: 1) { nodes { id sku } } }'); const n = (d.productVariants || {}).nodes || []; return { ok: n.length ? true : null, detail: n.length ? 'varyant listesi okundu' : 'ürün yok' }; });
    return out;
  }

  const missing = [!store && 'SHOPIFY_STORE', !token && (cid ? !csec && 'SHOPIFY_CLIENT_SECRET' : 'SHOPIFY_TOKEN')].filter(Boolean);
  return {
    ...meta, type: 'shopify', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: true, price: true, manualTracking: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, ship, createProduct, diagnose,
  };
}
