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
import { http, num, str, chunk, pool, sleep, diagStep, imageList, DEAD_LINE } from '../util.js';

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
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
