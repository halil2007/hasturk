// IdeaSoft (kendi web siteniz, IdeaSoft / Ideashop altyapısı): komisyon yok, etiketi panel basar, takip no satıcı girer.
// Admin API (REST, JSON): https://{mağaza}/admin-api/… · Kimlik OAuth2 (yalnız authorization_code akışı):
//  IdeaSoft paneli → Entegrasyonlar → API → Ekle: Client ID + Client Secret üretilir, yönlendirme adresi (Redirect URI) girilir; yetki
//  ekranında izin verilince dönen kod 30 sn içinde /oauth/v2/token'a verilir → access token (24 saat) + refresh token (2 ay).
//  Panel bağlantıda yalnız refresh token'ı ister; access token'ı kendisi alır. DİKKAT: refresh token her kullanımda YENİLENİR ve eskisi
//  geçersizleşir → yeni refresh token kanal deposunda (kv) saklanır, sonraki yenilemede o kullanılır. Kullanıcı panelde yeni bir refresh token
//  girerse depodaki değil yeni girilen kullanılır. 2 ay hiç yenilenmezse yeniden yetki verilmesi gerekir.
// İstek: Authorization: Bearer <token>. Liste uçları limit (en çok 100) + page (1'den) + sort ("-id" azalan) alır.
// Siparişler: GET /admin-api/orders (kalemler, teslimat ve fatura adresi aynı yanıtta). Belgede güncellenme tarihi süzgeci yok:
//  senkronda sort=-updatedAt ile yeniden eskiye okunur, aralığın başından eski siparişe gelince durulur. Sunucu bu sıralamayı
//  uygulamıyorsa (sıra bozuk) son 7 günde oluşturulan siparişler startCreatedAt / endCreatedAt (yyyy-mm-dd) ile okunur.
//  Geçmiş aktarımında oluşturulma tarihine göre (gün hassasiyetinde istenir, saat panelde süzülür).
// İlanlar: GET /admin-api/products (varyantlar parent alanı dolu ayrı ürün kaydıdır; varyantı olan ana ürün satılamaz, listelenmez).
// Stok / fiyat: PUT /admin-api/products/{id} (yalnız değişen alanlar). Kargoya verme: PUT /admin-api/orders/{id} (durum fulfilled + takip kodu).
// Yok: ürün oluşturma, iade talepleri, soru-cevap.
import { http, num, str, r2, imageList, diagStep, pool } from '../util.js';

// Sipariş durumları (Order.status)
const ST = { waiting_for_approval: 'new', approved: 'new', waiting_for_payment: 'new', on_accumulation: 'new', being_prepared: 'processing', fulfilled: 'shipped',
  delivered: 'delivered', cancelled: 'cancelled', refunded: 'returned', personal_status_1: 'new', personal_status_2: 'new', personal_status_3: 'new' };
export const ideasoftStatus = (s) => ST[s] || 'new';
// Silinmiş sipariş ve başarısız / yarım kalmış kart ödemesi panele alınmaz
const skip = (o) => o.status === 'deleted' || o.paymentStatus === 'failed' || o.paymentStatus === 'in_transaction';
// "magaza.myideasoft.com", "https://www.magaza.com/admin" → https://kök
export function ideasoftSite(v) {
  const h = str(v).replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? `https://${h}` : '';
}
// Türkiye günü (yyyy-mm-dd)
const TR = 3 * 3600e3;
const day = (ms) => new Date(ms + TR).toISOString().slice(0, 10);
// "2018-02-21T09:36:03+0300" (iki noktasız ofset) da okunur
export const isoParse = (s) => { const t = str(s).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'); return Date.parse(t) || 0; };
const name2 = (...a) => a.map(str).filter(Boolean).join(' ');
const https = (u) => { const s = str(u); return s.startsWith('//') ? 'https:' + s : s; };

export function ideasoft(env, meta = {}) {
  const site = ideasoftSite(env.IDEASOFT_URL), cid = str(env.IDEASOFT_CLIENT_ID), csec = str(env.IDEASOFT_CLIENT_SECRET), seed = str(env.IDEASOFT_REFRESH_TOKEN);
  const kv = meta && meta.kv;
  let access = '', exp = 0, refresh = seed;

  const loadKv = async () => {
    if (!kv) return null;
    const c = await Promise.resolve(kv.get('token')).catch(() => null);
    // Depodaki değer başka bir mağaza / uygulama ya da kullanıcının sonradan değiştirdiği refresh token için değilse kullanılmaz
    return c && c.cid === cid && c.site === site && c.seed === seed ? c : null;
  };
  async function auth(force = false) {
    if (!force && access && Date.now() < exp - 300e3) return access;
    const c = await loadKv();
    if (c) {
      if (c.refresh) refresh = c.refresh;
      if (!force && c.access && num(c.exp) > Date.now() + 300e3) { access = c.access; exp = num(c.exp); return access; }
    }
    const grant = async (rt) => http(`${site}/oauth/v2/token`, { method: 'POST', tries: 1,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      // DOĞRULA: belge "POST /oauth/v2/token" diyor, örnek sorguları GET + sorgu parametresi; form gövdeli POST kullanıldı
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: cid, client_secret: csec, refresh_token: rt }).toString() });
    let r;
    try { r = await grant(refresh); } catch (e) {
      // Aynı anda başka bir istek belirteci yenilemiş olabilir: depodaki yeni refresh token ile bir kez daha
      const c2 = await loadKv();
      if (c2 && c2.refresh && c2.refresh !== refresh) {
        refresh = c2.refresh;
        if (c2.access && num(c2.exp) > Date.now() + 300e3) { access = c2.access; exp = num(c2.exp); return access; }
        try { r = await grant(refresh); } catch { /* aşağıda anlaşılır hata */ }
      }
      if (!r) throw new Error(`IdeaSoft: erişim belirteci alınamadı (${e.message.slice(0, 200)}) · Client ID / secret doğru mu? Refresh token 2 ay kullanılmadıysa ya da başka bir yerde kullanıldıysa geçersizdir: IdeaSoft → Entegrasyonlar → API'den yeniden yetki verip yeni refresh token girin`);
    }
    if (!r || !r.access_token) throw new Error('IdeaSoft: erişim belirteci alınamadı (cevapta access_token yok)');
    access = str(r.access_token); exp = Date.now() + num(r.expires_in, 86400) * 1000;
    if (r.refresh_token) refresh = str(r.refresh_token);
    if (kv) await Promise.resolve(kv.set('token', { access, exp, refresh, seed, cid, site })).catch(() => null);
    return access;
  }

  async function call(path, { method = 'GET', query, body } = {}) {
    const q = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
    const go = async (force) => http(`${site}/admin-api${path}${q}`, { method, body: body && JSON.stringify(body),
      headers: { Authorization: `Bearer ${await auth(force)}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) } });
    try { return await go(false); } catch (e) { if (e.status !== 401) throw e; return go(true); } // süresi dolmuş / iptal edilmiş belirteç: bir kez yenilenir
  }

  function norm(o) {
    const s = o.shippingAddress && (o.shippingAddress.address || o.shippingAddress.location) ? o.shippingAddress : o.billingAddress || {};
    const items = (o.orderItems || []).map((it) => {
      const qty = num(it.productQuantity, 1) || 1, p = it.product || {};
      // DOĞRULA: productPrice KDV hariç birim fiyat kabul edildi (siparişte amount "vergi hariç", taxAmount ayrı); productTax yüzde oranı
      const unit = r2(num(it.productPrice) * (1 + num(it.productTax) / 100));
      const img = (p.images || []).slice().sort((a, b) => num(a.sortOrder) - num(b.sortOrder))[0];
      return { lineId: str(it.id), sku: str(it.productSku || p.sku), barcode: str(it.productBarcode || p.barcode), name: str(p.fullName || it.productName), image: img ? https(img.originalUrl || img.thumbUrl) : '',
        quantity: qty, unitPrice: unit, total: r2(unit * qty), status: '', remoteKey: str(p.id) };
    });
    const customer = name2(o.customerFirstname, o.customerSurname) || name2(s.firstname, s.surname);
    return {
      remoteId: str(o.id), orderNumber: str(o.id), orderedAt: isoParse(o.createdAt) || Date.now(),
      remoteStatus: str(o.status), status: ideasoftStatus(o.status), awaitingPayment: o.status === 'waiting_for_payment',
      customer, phone: str(o.customerPhone || s.mobilePhoneNumber || s.phoneNumber), email: str(o.customerEmail), customerId: o.member && o.member.id ? str(o.member.id) : '',
      address: { name: name2(s.firstname, s.surname) || customer, line: str(s.address), district: str(s.subLocation), city: str(s.location), phone: str(s.mobilePhoneNumber || s.phoneNumber || o.customerPhone) },
      total: num(o.finalAmount) || num(o.generalAmount), currency: str(o.currency).replace(/^TL$/i, 'TRY') || 'TRY',
      cargoCompany: str(o.shippingCompanyName || o.shippingProviderName), tracking: str(o.shippingTrackingCode), items, packages: null,
    };
  }

  // Senkron: güncellenmeye göre yeniden eskiye (sort=-updatedAt). Sıra uygulanmıyorsa son 7 günde oluşturulanlara geçilir.
  let byUpdatedOk = true;
  const LIM = 100, MAXP = 50;
  async function byCreated(since, until, out) {
    for (let page = 1; page <= MAXP; page++) {
      const rows = await call('/orders', { query: { startCreatedAt: day(since), endCreatedAt: day(until), sort: 'id', limit: LIM, page } });
      const list = Array.isArray(rows) ? rows : [];
      for (const o of list) { const t = isoParse(o.createdAt); if ((!t || (t >= since && t <= until)) && !skip(o)) out.push(norm(o)); }
      if (list.length < LIM) return out;
    }
    out.warnings = [`IdeaSoft: bu aralıkta ${MAXP * LIM}+ sipariş var; kalanlar alınamadı (daha kısa aralıklarla aktarın)`];
    return out;
  }
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const out = [];
    if (byOrdered) return byCreated(since, until, out);
    if (!byUpdatedOk) return byCreated(Math.min(since, until - 7 * 864e5), until, out);
    for (let page = 1; page <= MAXP; page++) {
      // DOĞRULA: sort parametresi belgede id örneğiyle; updatedAt alanıyla sıralamanın desteklendiği varsayıldı (bozuksa yukarıdaki yedek yol)
      const rows = await call('/orders', { query: { sort: '-updatedAt', limit: LIM, page } });
      const list = Array.isArray(rows) ? rows : [];
      const ts = list.map((o) => isoParse(o.updatedAt));
      if (ts.some((t, i) => !t || (i && t > ts[i - 1] + 1000))) { byUpdatedOk = false; out.length = 0; return fetchOrders(since, until, { byOrdered }); }
      for (let i = 0; i < list.length; i++) {
        if (ts[i] < since) return out;
        if (ts[i] <= until && !skip(list[i])) out.push(norm(list[i]));
      }
      if (list.length < LIM) return out;
    }
    // Yeniden eskiye okunduğu için kalanlar daha eski: imleç ilerlemez (aralığın başı korunur)
    out.warnings = [`IdeaSoft: bu aralıkta ${MAXP * LIM}+ güncellenen sipariş var; kalanlar bir sonraki senkronda alınacak`];
    out.partialUntil = since;
    return out;
  }
  async function getOrder(id) {
    try { return await call(`/orders/${encodeURIComponent(id)}`); } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function fetchOne(id) {
    const o = await getOrder(id);
    if (!o || !o.id || o.status === 'deleted') throw new Error('IdeaSoft: sipariş bulunamadı');
    return norm(o);
  }
  const orderExists = async (id) => { const o = await getOrder(id); return !!(o && o.id && o.status !== 'deleted'); };

  // ---------- ilanlar ----------
  // KDV dahil fiyat: taxIncluded=0 ise price1 KDV hariçtir
  const withTax = (p, v) => (num(p.taxIncluded, 1) === 0 ? v * (1 + num(p.tax) / 100) : v);
  function listing(p) {
    const parent = p.parent && typeof p.parent === 'object' ? p.parent : null;
    const group = str(parent ? parent.name : p.name), full = str(p.fullName) || (parent ? name2(parent.name, p.name) : str(p.name));
    const vname = parent ? (full.startsWith(group) ? full.slice(group.length).replace(/^[\s\-/]+/, '') : str(p.name)) : '';
    const list = r2(withTax(p, num(p.price1)));
    // DOĞRULA: discountType 1 = yüzde, 0 = tutar kabul edildi (belgede yalnız "tip'e göre ₺ veya %")
    const d = num(p.discount), disc = d > 0 ? (num(p.discountType) === 1 ? list * d / 100 : withTax(p, d)) : 0;
    const price = r2(Math.max(0, list - disc)) || list;
    const imgs = imageList((p.images || parent && parent.images || []).slice().sort((a, b) => num(a.sortOrder) - num(b.sortOrder)).map((i) => https(i.originalUrl || i.thumbUrl)));
    return { remoteId: str(p.id), remoteProductId: str(parent ? parent.id : p.id), sku: str(p.sku), barcode: str(p.barcode), name: full || group, groupName: group, variantName: vname,
      image: imgs[0] || '', images: imgs, price, listPrice: Math.max(list, price), stock: Math.max(0, Math.floor(num(p.stockAmount))), active: num(p.status) === 1 };
  }
  async function fetchListings() {
    const out = new Map(), children = [];
    for (let page = 1; page <= 500; page++) {
      const rows = await call('/products', { query: { sort: 'id', limit: LIM, page } });
      const list = Array.isArray(rows) ? rows : [];
      for (const p of list) {
        // Varyantı olan ana ürün satılmaz; varyantlar ayrı kayıt olarak gelir (gelmezse ana ürünün children listesinden alınır)
        if (num(p.hasOption) === 1) { for (const ch of p.children || []) if (ch && ch.id) children.push({ ...ch, parent: ch.parent && typeof ch.parent === 'object' ? ch.parent : { id: p.id, name: p.name, images: p.images } }); continue; }
        out.set(str(p.id), listing(p));
      }
      if (list.length < LIM) break;
    }
    for (const ch of children) if (!out.has(str(ch.id))) out.set(str(ch.id), listing(ch));
    return [...out.values()];
  }

  // Ürün güncelleme kalem kalem (toplu uç yok). Sonuç ilan ilan: { done, errors } (yalnız hatalı ilan yeniden denenir).
  // Hiçbiri gönderilemeden bağlantı / yetki hatası (4xx ilan hatası değil) olduysa atılır; istek bütçesi hatası hep atılır.
  const itemErr = (e) => [400, 404, 409, 422].includes(e.status);
  async function each(items, fn) {
    const out = { done: [], errors: [] };
    let global = null;
    for (const x of items) if (!(num(x.remoteId) > 0)) out.errors.push({ remoteId: x.remoteId, error: 'IdeaSoft: geçersiz ürün numarası' });
    await pool(items.filter((x) => num(x.remoteId) > 0), 4, async (x) => {
      try { await fn(x); out.done.push(x.remoteId); } catch (e) {
        if (e.budget) throw e;
        if (!itemErr(e)) global = global || e;
        out.errors.push({ remoteId: x.remoteId, error: e.message });
      }
    });
    if (global && !out.done.length) throw global;
    return out;
  }
  // DOĞRULA: PUT gövdesinde yalnız değişen alan (IdeaSoft'un kendi araçları kısmi PUT kullanıyor; şema tüm nesneyi tanımlıyor)
  const pushStock = (items) => each(items, (x) => call(`/products/${num(x.remoteId)}`, { method: 'PUT', body: { id: num(x.remoteId), stockAmount: Math.max(0, Math.round(num(x.stock))) } }));
  // Fiyat: satış fiyatı price1'e yazılır, ürün indirimi sıfırlanır (indirim tipinin anlamı belgede net değil: üstü çizili fiyat yazılmaz).
  // Ürün fiyatları KDV hariç tutuyorsa (taxIncluded=0) KDV düşülerek yazılır → önce ürün okunur.
  const pushPrice = (items) => each(items, async (x) => {
    const p = await call(`/products/${num(x.remoteId)}`);
    const price = num(x.price), v = num(p && p.taxIncluded, 1) === 0 ? price / (1 + num(p.tax) / 100) : price;
    await call(`/products/${num(x.remoteId)}`, { method: 'PUT', body: { id: num(x.remoteId), price1: Math.round(v * 10000) / 10000, discount: 0 } });
  });

  // Kargoya ver: siparişin son açık paketiyse durum "fulfilled" + kargo takip kodu (müşteri bildirimi IdeaSoft ayarlarına göre)
  async function ship(order, pkg, { tracking } = {}) {
    const others = (order.packages || []).filter((p) => p.status === 'open' && (!pkg || p.id !== pkg.id));
    if (others.length) return {};
    // DOĞRULA: takip kodu alanı Order şemasındaki shippingTrackingCode (IdeaSoft araç örneğinde cargoTrackingNumber geçiyor)
    await call(`/orders/${encodeURIComponent(order.remote_id)}`, { method: 'PUT', body: { id: num(order.remote_id), status: 'fulfilled', ...(tracking ? { shippingTrackingCode: String(tracking) } : {}) } });
    return {};
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const ok = await diagStep(out, 'IdeaSoft yetkilendirme', async () => { await auth(true); return { detail: `${site} · erişim belirteci alındı${kv ? ' · yenilenen refresh token saklandı' : ''}` }; });
    if (!ok) { out.push({ name: 'İpucu', ok: null, detail: 'invalid_client: Client ID / secret yanlış · invalid_grant: refresh token geçersiz ya da süresi dolmuş (2 ay) → IdeaSoft → Entegrasyonlar → API → uygulamaya yeniden izin verip yeni refresh token girin' }); return out; }
    await diagStep(out, 'Ürünler', async () => { const r = await call('/products', { query: { limit: 1 } }); return { detail: Array.isArray(r) && r.length ? `örnek: ${r[0].fullName || r[0].name}` : 'ürün yok' }; });
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * 864e5, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ''}${byUpdatedOk ? '' : ' · güncellenme sırası desteklenmiyor: oluşturulma tarihiyle okunuyor'}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `#${o.orderNumber}: ${o.remoteStatus} → ${o.status} · ${o.items.length} kalem` }; });
    out.push({ name: 'İzinler', ok: null, detail: 'Uygulamaya sipariş okuma / güncelleme (order_update) ve ürün güncelleme izinleri verilmeli (ilk gönderimde denenir)' });
    return out;
  }

  const missing = [!site && 'IDEASOFT_URL', !cid && 'IDEASOFT_CLIENT_ID', !csec && 'IDEASOFT_CLIENT_SECRET', !seed && 'IDEASOFT_REFRESH_TOKEN'].filter(Boolean);
  return {
    ...meta, type: 'ideasoft', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
