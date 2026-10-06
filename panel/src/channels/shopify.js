// Shopify (Admin GraphQL API, sürüm 2025-07). Kendi web siteniz: komisyon yok, etiketi panel basar, takip no satıcı girer.
// Anahtar: Shopify yönetimi → Ayarlar → Uygulamalar → Uygulama geliştir → özel uygulama → Admin API erişim belirteci (shpat_…).
// İzinler: read_orders (60 günden eski siparişler için read_all_orders), write_products, write_inventory, read_locations,
// write_merchant_managed_fulfillment_orders + write_fulfillments (kargoya verme). Başlık: X-Shopify-Access-Token.
// Desteklenen: siparişler (senkronda güncellenme, geçmiş aktarımında sipariş tarihi), varyant listesi, stok (tek lokasyon), fiyat,
// kargoya verme (fulfillmentCreate + takip bilgisi, müşteriye bildirim). Yok: ürün oluşturma, iade talepleri, soru-cevap.
// Sorgu maliyeti 1000 puanı aşarsa sayfa boyutu kendiliğinden küçültülür; THROTTLED hatasında kısa bekleyip yeniden denenir.
import { http, num, str, chunk, imageList, sleep, diagStep } from '../util.js';

const VER = '2025-07';
const gid = (type, id) => (/^gid:\/\//.test(String(id)) ? String(id) : `gid://shopify/${type}/${id}`);
const nid = (g) => str(g).replace(/\?.*$/, '').split('/').pop();
const money = (s) => num(s && s.shopMoney && s.shopMoney.amount);
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
  if (o.displayFinancialStatus === 'REFUNDED') return 'returned';
  const ff = o.displayFulfillmentStatus, fs = o.fulfillments || [];
  if (ff === 'FULFILLED') return fs.length && fs.every((f) => f.displayStatus === 'DELIVERED') ? 'delivered' : 'shipped';
  if (ff === 'PARTIALLY_FULFILLED' || ff === 'IN_PROGRESS') return 'processing';
  return 'new';
}

const LI = 'id sku name quantity currentQuantity variant { id barcode } image { url } originalUnitPriceSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } }';
const ORDERS = `query($first: Int!, $after: String, $q: String, $sort: OrderSortKeys) { orders(first: $first, after: $after, query: $q, sortKey: $sort) {
  pageInfo { hasNextPage endCursor }
  nodes { id name createdAt displayFinancialStatus displayFulfillmentStatus cancelledAt email phone customer { id firstName lastName }
    shippingAddress { name address1 address2 city province phone } totalPriceSet { shopMoney { amount currencyCode } }
    lineItems(first: 10) { pageInfo { hasNextPage endCursor } nodes { ${LI} } }
    fulfillments(first: 10) { displayStatus trackingInfo(first: 3) { number company } } } } }`;
const MORE_ITEMS = `query($id: ID!, $after: String) { order(id: $id) { lineItems(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${LI} } } } }`;
const VARIANTS = `query($first: Int!, $after: String) { productVariants(first: $first, after: $after) { pageInfo { hasNextPage endCursor }
  nodes { id sku barcode title price compareAtPrice inventoryQuantity image { url } product { id title status featuredMedia { preview { image { url } } } } } } }`;

export function shopify(env, meta) {
  const store = shopifyStore(env.SHOPIFY_STORE), token = env.SHOPIFY_TOKEN;
  const API = `https://${store}/admin/api/${VER}/graphql.json`;
  let location = env.SHOPIFY_LOCATION_ID ? gid('Location', str(env.SHOPIFY_LOCATION_ID)) : '';

  async function gql(query, variables = {}) {
    for (let i = 1; ; i++) {
      const r = (await http(API, { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) })) || {};
      const errs = !r.errors ? [] : Array.isArray(r.errors) ? r.errors : [{ message: typeof r.errors === 'string' ? r.errors : JSON.stringify(r.errors) }];
      if (!errs.length) return r.data || {};
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
  // Sayfalı okuma; sorgu maliyeti sınırı (MAX_COST_EXCEEDED) aşılırsa sayfa boyutu orantılı küçültülür (sonraki çağrılar için saklanır)
  const sizes = { orders: 10, variants: 100 };
  async function paged(query, vars, pick, key, max) {
    const out = [];
    let after = null, size = sizes[key];
    for (let p = 0; p < max; p++) {
      let d;
      try { d = await gql(query, { ...vars, first: size, after }); } catch (e) {
        if (e.code === 'MAX_COST_EXCEEDED' && size > 1) { size = Math.max(1, Math.min(size - 1, Math.floor((size * e.maxCost * 0.8) / (e.cost || size * 100)))); sizes[key] = size; p--; continue; }
        throw e;
      }
      const c = pick(d) || {};
      out.push(...(c.nodes || []));
      if (!c.pageInfo || !c.pageInfo.hasNextPage) break;
      after = c.pageInfo.endCursor;
    }
    return out;
  }

  async function getLocation() {
    if (location) return location;
    const d = await gql('{ locations(first: 5) { nodes { id name isActive } } }');
    const l = ((d.locations || {}).nodes || []).find((x) => x.isActive !== false);
    if (!l) throw new Error('Shopify: etkin stok lokasyonu bulunamadı (Ayarlar → Lokasyonlar)');
    return (location = l.id);
  }

  function norm(o) {
    const a = o.shippingAddress || {}, c = o.customer || {};
    const items = o.items.map((it) => {
      const qty = num(it.quantity, 1), total = it.discountedTotalSet ? money(it.discountedTotalSet) : money(it.originalUnitPriceSet) * qty;
      return { lineId: nid(it.id), sku: str(it.sku), barcode: str(it.variant && it.variant.barcode), name: str(it.name), image: str(it.image && it.image.url), quantity: qty,
        unitPrice: qty ? total / qty : money(it.originalUnitPriceSet), total, status: it.currentQuantity === 0 && qty > 0 ? 'cancelled' : '', remoteKey: it.variant ? nid(it.variant.id) : '' };
    });
    const ti = (o.fulfillments || []).flatMap((f) => f.trackingInfo || []).filter((t) => t.number || t.company).pop() || {};
    const status = shopifyStatus(o), name = [c.firstName, c.lastName].map(str).filter(Boolean).join(' ') || str(a.name);
    return {
      remoteId: nid(o.id), orderNumber: str(o.name).replace(/^#/, ''), orderedAt: Date.parse(o.createdAt) || Date.now(),
      remoteStatus: o.cancelledAt ? 'CANCELLED' : [o.displayFinancialStatus, o.displayFulfillmentStatus].filter(Boolean).join(' · '), status,
      customer: name, phone: str(a.phone || o.phone), email: str(o.email), customerId: c.id ? nid(c.id) : '',
      // Türkiye adreslerinde province = il, city = ilçe
      address: { name: str(a.name) || name, line: [a.address1, a.address2].map(str).filter(Boolean).join(' '), district: a.province ? str(a.city) : '', city: str(a.province || a.city), phone: str(a.phone || o.phone) },
      total: money(o.totalPriceSet), currency: str(o.totalPriceSet && o.totalPriceSet.shopMoney && o.totalPriceSet.shopMoney.currencyCode) || 'TRY',
      cargoCompany: str(ti.company), tracking: str(ti.number), items, packages: null,
    };
  }

  // Senkronda güncellenme tarihine göre (sonradan kargolanan / iptal edilen siparişler de gelir), geçmiş aktarımında sipariş tarihine göre
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const f = byOrdered ? 'created_at' : 'updated_at', iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
    const rows = await paged(ORDERS, { q: `${f}:>='${iso(since)}' ${f}:<='${iso(until)}'`, sort: byOrdered ? 'CREATED_AT' : 'UPDATED_AT' }, (d) => d.orders, 'orders', 100);
    for (const o of rows) {
      o.items = [...((o.lineItems || {}).nodes || [])];
      // 10'dan fazla kalemli siparişin kalan kalemleri ayrıca okunur
      for (let pi = (o.lineItems || {}).pageInfo || {}, n = 0; pi.hasNextPage && n < 10; n++) {
        const li = ((await gql(MORE_ITEMS, { id: o.id, after: pi.endCursor })).order || {}).lineItems || {};
        o.items.push(...(li.nodes || []));
        pi = li.pageInfo || {};
      }
    }
    return rows.map(norm);
  }

  async function fetchListings() {
    return (await paged(VARIANTS, {}, (d) => d.productVariants, 'variants', 400)).map((v) => {
      const p = v.product || {}, pimg = str(p.featuredMedia && p.featuredMedia.preview && p.featuredMedia.preview.image && p.featuredMedia.preview.image.url);
      const vname = v.title === 'Default Title' ? '' : str(v.title), price = num(v.price);
      return { remoteId: nid(v.id), remoteProductId: nid(p.id), sku: str(v.sku), barcode: str(v.barcode), name: vname ? `${str(p.title)} - ${vname}` : str(p.title), groupName: str(p.title), variantName: vname,
        image: str(v.image && v.image.url) || pimg, images: imageList([v.image && v.image.url, pimg]), price, listPrice: Math.max(num(v.compareAtPrice), price), stock: num(v.inventoryQuantity), active: p.status === 'ACTIVE' };
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
      if (!inv.inventoryLevel) ok((await gql('mutation($i: ID!, $l: ID!) { inventoryActivate(inventoryItemId: $i, locationId: $l) { userErrors { field message } } }', { i: inv.id, l: loc })).inventoryActivate, 'stok lokasyonu etkinleştirme');
      qs.push({ inventoryItemId: inv.id, locationId: loc, quantity: Math.max(0, Math.round(num(x.stock))) });
    }
    for (const part of chunk(qs, 100)) {
      // 2025-07: ignoreCompareQuantity ile karşılaştırmasız yazılır (yeni sürümlerde yerini changeFromQuantity alıyor; sürüm yükseltilirse güncelleyin)
      const d = await gql('mutation($input: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $input) { userErrors { field message } } }',
        { input: { name: 'available', reason: 'correction', ignoreCompareQuantity: true, quantities: part } });
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
    const fulfillment = { lineItemsByFulfillmentOrder: groups, notifyCustomer: true, ...(tracking || cargoCompany ? { trackingInfo: { number: str(tracking), company: str(cargoCompany) } } : {}) };
    const r = ok((await gql('mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id status } userErrors { field message } } }', { f: fulfillment })).fulfillmentCreate, 'kargoya verme');
    return r.fulfillment ? { remoteId: nid(r.fulfillment.id) } : {};
  }

  const NEED = ['read_orders', 'write_products', 'write_inventory', 'read_locations', 'write_merchant_managed_fulfillment_orders', 'write_fulfillments'];
  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const shop = await diagStep(out, 'Shopify bağlantısı', async () => { const d = await gql('{ shop { name myshopifyDomain currencyCode } }'); return { detail: `${d.shop.name} (${d.shop.myshopifyDomain}) · para birimi ${d.shop.currencyCode}` }; });
    if (!shop) return out;
    await diagStep(out, 'Uygulama izinleri', async () => {
      const d = await gql('{ currentAppInstallation { accessScopes { handle } } }'), have = ((d.currentAppInstallation || {}).accessScopes || []).map((s) => s.handle);
      const miss = NEED.filter((s) => !have.includes(s) && !have.includes(s.replace(/^read_/, 'write_')));
      return { ok: miss.length ? null : true, detail: miss.length ? `Eksik izin: ${miss.join(', ')} (özel uygulama → Admin API izinleri)` : 'Gerekli izinler açık' };
    });
    await diagStep(out, 'Stok lokasyonu', async () => ({ detail: `${await getLocation()}${env.SHOPIFY_LOCATION_ID ? '' : ' (ilk etkin lokasyon)'}` }));
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * 864e5, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const d = await gql('query($id: ID!) { order(id: $id) { name displayFinancialStatus displayFulfillmentStatus } }', { id: gid('Order', orderId) }); if (!d.order) throw new Error('Sipariş bulunamadı'); return { detail: `${d.order.name}: ${d.order.displayFinancialStatus} · ${d.order.displayFulfillmentStatus}` }; });
    await diagStep(out, 'Ürünler (varyantlar)', async () => { const d = await gql('{ productVariants(first: 1) { nodes { id sku } } }'); const n = (d.productVariants || {}).nodes || []; return { ok: n.length ? true : null, detail: n.length ? 'varyant listesi okundu' : 'ürün yok' }; });
    return out;
  }

  const missing = [!store && 'SHOPIFY_STORE', !token && 'SHOPIFY_TOKEN'].filter(Boolean);
  return {
    ...meta, type: 'shopify', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
