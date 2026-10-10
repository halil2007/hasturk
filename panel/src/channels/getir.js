// GetirÇarşı (Getir Locals) — mağaza / hızlı market POS entegrasyonu (developers.getir.com/locals).
// GetirÇarşı API'si GetirYemek (GetirFood, food-external-api-gateway.getirapi.com, Swagger 1.5.8) ile aynı kalıptadır; Çarşı uç noktaları
// açık dokümanda yayımlanmıyor (anahtar ve doküman Getir'den: getircarsiapi@getir.com / Getir temsilcisi). Aşağıdaki yollar Yemek API'sinin
// belgeli şekli Çarşı ağ geçidine uyarlanarak yazıldı; canlı bağlantıda doğrulanmalı (// DOĞRULA).
// Kimlik: POST /auth/login { appSecretKey (entegratör / uygulama anahtarı), shopSecretKey (mağaza anahtarı) } → { token, shopId }; her istekte "token" başlığı.
// Token 1 saat geçerli: 55 dakika bellekte tutulur, 401'de yenilenir.
// Siparişler Getir'de webhook ile itilir; panel webhook kullanmaz, POST /orders/active (aktif siparişler) + POST /orders/periodic/unapproved (onay bekleyen)
// + POST /orders/periodic/cancelled (iptaller) ile yoklar. Tarih aralıklı sipariş servisi yok: geçmiş aktarım yapılamaz (byOrdered → boş).
// Akış: 400 (yeni) → POST /orders/{id}/verify ("işleme al"; planlı sipariş 325 → verify-scheduled) → en az 1 dakika sonra POST /orders/{id}/prepare
// ("hazır"; Getir kuryesi gelip teslim alır, teslimi Getir işler). Kendi kuryesiyle çalışan mağazada (deliveryType 2) teslim Getir panelinden bildirilir.
// Sipariş 30 saniye içinde yanıtlanmazsa mağaza IVR ile aranır, 5 dakikada otomatik kapanır: işleme al hızlı yapılmalı (otomatik onay panel tarafında).
// Etiket / takip numarası yoktur (caps.label null, manualTracking false). Ürünler: GET /products (mağaza ürünleri); stok ve fiyat
// PUT /products/stock { products: [{ barcode | productId, stock }] } ve PUT /products/price { products: [{ barcode | productId, price, struckPrice }] }.
import { http, num, str, chunk, imageList, diagStep } from '../util.js';

// DOĞRULA: Çarşı POS ağ geçidi adresi (api-evangelist taramasında görülen ana makine); farklıysa GETIR_BASE ile değiştirilir
export const GETIR_BASE = 'https://locals-integration-pos-api-gateway.artisan.getirapi.com';
// Yemek API durum kodları: 325 planlı (onay bekliyor), 350 planlı onaylı, 400 yeni, 500 hazırlanıyor (onaylandı), 550 hazır, 600 kurye teslim aldı,
// 700 yolda, 800 adreste, 900 teslim edildi, 1500 / 1600 iptal (yönetici / otomatik)
const STATUS = { 325: 'new', 350: 'processing', 400: 'new', 500: 'processing', 550: 'shipped', 600: 'shipped', 700: 'shipped', 800: 'shipped', 900: 'delivered', 1500: 'cancelled', 1600: 'cancelled' };
const TOKEN_TTL = 55 * 60e3;
const tr = (v) => (v && typeof v === 'object' ? str(v.tr || v.en) : str(v));

export function getir(env, meta) {
  const base = str(env.GETIR_BASE).replace(/\/+$/, '') || GETIR_BASE;

  let tok = null, tokUntil = 0, shopId = '';
  async function token(force = false) {
    if (!force && tok && Date.now() < tokUntil) return tok;
    // DOĞRULA: Çarşı giriş gövdesi — Yemek'te { appSecretKey, restaurantSecretKey }; Çarşı'da mağaza anahtarı shopSecretKey varsayıldı
    const r = (await http(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appSecretKey: str(env.GETIR_APP_SECRET_KEY), shopSecretKey: str(env.GETIR_SHOP_SECRET_KEY) }) })) || {};
    if (!r.token) throw new Error('Getir: oturum belirteci alınamadı (uygulama / mağaza anahtarını kontrol edin)');
    tok = r.token; tokUntil = Date.now() + TOKEN_TTL; shopId = str(r.shopId || r.restaurantId);
    return tok;
  }
  async function call(path, { method = 'GET', body } = {}) {
    const go = async (t) => http(base + path, { method, headers: { token: t, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
    try { return await go(await token()); } catch (e) {
      if (e.status !== 401) throw e;
      return go(await token(true));
    }
  }

  // ---------- siparişler ----------
  // DOĞRULA: sipariş alan adları Yemek modelinden (id, status, confirmationId, client.deliveryAddress, products[].count / totalPrice, checkoutDate)
  function norm(o) {
    const c = o.client || {}, a = c.deliveryAddress || {}, st = num(o.status);
    const items = (o.products || []).map((p) => {
      const qty = num(p.count, 1) || 1, total = num(p.totalPriceWithOption ?? p.totalPrice) || num(p.price) * qty;
      return { lineId: str(p.id), sku: str(p.barcode || p.product), barcode: str(p.barcode), name: tr(p.name), image: str(p.imageURL), quantity: qty,
        unitPrice: Math.round((total / qty) * 100) / 100, total: Math.round(total * 100) / 100, status: STATUS[st] === 'cancelled' || p.status === 'CANCELLED' ? 'cancelled' : '', remoteKey: str(p.barcode || p.product) };
    });
    const name = str(c.name);
    return {
      remoteId: str(o.id), orderNumber: str(o.confirmationId || o.id), orderedAt: Date.parse(o.checkoutDate) || Date.now(), remoteStatus: String(o.status ?? ''), status: STATUS[st] || 'new',
      customer: name, phone: str(c.clientUnmaskedPhoneNumber || c.clientPhoneNumber || c.contactPhoneNumber), email: '', customerId: str(c.id),
      address: { name, line: [a.address, a.aptNo && `No ${a.aptNo}`, a.floor && `Kat ${a.floor}`, a.doorNo && `Daire ${a.doorNo}`, a.description && `(${str(a.description)})`].map(str).filter(Boolean).join(' '),
        district: str(a.district), city: str(a.city), phone: str(c.contactPhoneNumber || c.clientPhoneNumber) },
      total: num(o.totalDiscountedPrice) || num(o.totalPrice) || items.filter((i) => !i.status).reduce((s, i) => s + i.total, 0), currency: 'TRY',
      cargoCompany: num(o.deliveryType) === 2 ? 'Kendi kuryesi' : 'Getir kuryesi', tracking: '',
      shipBy: Date.parse(o.scheduledDate) || null, items, packages: null,
    };
  }
  const list = (r) => (Array.isArray(r) ? r : (r && (r.orders || r.data || r.content)) || []);
  // Tarih aralığı servisi yok: her senkronda güncel (onay bekleyen + aktif + son iptaller) siparişler döner (pencere süzülmez; aynı sipariş güncellenir).
  // Geçmiş aktarımda boş. DOĞRULA: yollar (Yemek: /food-orders/active, /food-orders/periodic/unapproved, /food-orders/periodic/cancelled)
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    if (byOrdered) return [];
    const seen = new Map();
    for (const p of ['/orders/periodic/unapproved', '/orders/active', '/orders/periodic/cancelled']) {
      for (const o of list(await call(p, { method: 'POST' }))) if (o && o.id && !seen.has(o.id)) seen.set(o.id, o);
    }
    return [...seen.values()].map(norm);
  }
  // DOĞRULA: tek sipariş yolu GET /orders/{id} (Yemek: /food-orders/{id})
  const getOrder = (id) => call(`/orders/${encodeURIComponent(id)}`);

  // ---------- sipariş işlemleri ----------
  async function accept(order) {
    const id = encodeURIComponent(str(order.remote_id));
    const st = num(order.remote_status) || num(((await getOrder(order.remote_id)) || {}).status);
    if (st === 325) await call(`/orders/${id}/verify-scheduled`, { method: 'POST' });
    else if (st === 400 || !st) await call(`/orders/${id}/verify`, { method: 'POST' });
  }
  // Hazır: onaylı siparişte prepare; yeni siparişte önce verify (Getir verify → prepare arasında en az 1 dakika ister: hata anlaşılır mesajla döner)
  async function ship(order) {
    const id = encodeURIComponent(str(order.remote_id));
    const o = (await getOrder(order.remote_id)) || {}, st = num(o.status);
    if (STATUS[st] === 'cancelled') throw new Error('Getir: sipariş iptal edilmiş');
    if (st >= 550) return {};
    if (st === 400 || st === 325) {
      await call(`/orders/${id}/${st === 325 ? 'verify-scheduled' : 'verify'}`, { method: 'POST' });
      throw new Error('Getir: sipariş onaylandı; Getir onay ile hazır bildirimi arasında en az 1 dakika ister, 1 dakika sonra yeniden “Kargoya ver”e basın');
    }
    await call(`/orders/${id}/prepare`, { method: 'POST' });
    return { tracking: '' };
  }

  // ---------- ürünler ----------
  // DOĞRULA: ürün listesi yolu ve alanları (GET /products → [{ id, barcode, name{tr}, price, struckPrice, stock, status(100 aktif / 200 pasif), imageURL }])
  async function fetchListings() {
    const out = [];
    for (let page = 1; page <= 200; page++) {
      const r = await call(`/products?page=${page}&limit=100`);
      const rows = Array.isArray(r) ? r : (r && (r.products || r.data || r.content)) || [];
      for (const p of rows) {
        const id = str(p.barcode || p.id);
        if (!id) continue;
        const images = imageList([p.imageURL, p.wideImageURL, ...(p.images || [])]), price = num(p.price);
        out.push({ remoteId: id, remoteProductId: str(p.id), sku: str(p.sku || p.barcode), barcode: str(p.barcode), name: tr(p.name), groupName: tr(p.name), variantName: '',
          image: images[0] || '', images, price, listPrice: Math.max(num(p.struckPrice), price), stock: num(p.stock ?? p.quantity), active: num(p.status, 100) === 100 });
      }
      if (rows.length < 100 || Array.isArray(r)) break;
    }
    return out;
  }
  const key = (x) => (str(x.barcode) ? { barcode: str(x.barcode) } : { productId: str(x.remoteProductId || x.remoteId) });
  // DOĞRULA: stok / fiyat yolları ve gövdeleri (PUT /products/stock, PUT /products/price)
  async function pushStock(items) {
    for (const part of chunk(items, 500)) await call('/products/stock', { method: 'PUT', body: { products: part.map((x) => ({ ...key(x), stock: Math.max(0, Math.round(num(x.stock))) })) } });
  }
  async function pushPrice(items) {
    const bad = items.filter((x) => !(num(x.price) > 0)).map((x) => str(x.remoteId || x.barcode));
    if (bad.length) throw new Error(`Getir: ${bad.length} üründe satış fiyatı yok (${bad.slice(0, 5).join(', ')})`);
    for (const part of chunk(items, 500)) await call('/products/price', { method: 'PUT', body: { products: part.map((x) => {
      const price = Math.round(num(x.price) * 100) / 100, list = Math.round(num(x.listPrice) * 100) / 100;
      return { ...key(x), price, ...(list > price ? { struckPrice: list } : {}) };
    }) } });
  }

  async function diagnose({ orderId } = {}) {
    const out = [];
    await diagStep(out, 'Oturum (auth/login)', async () => { await token(true); return { detail: `belirteç alındı${shopId ? ' · mağaza ' + shopId : ''} · adres ${base}` }; });
    await diagStep(out, 'Aktif siparişler', async () => { const l = list(await call('/orders/active', { method: 'POST' })); return { detail: `${l.length} aktif sipariş${l[0] ? ` · örnek durum: ${l[0].status} → ${STATUS[num(l[0].status)] || 'new'}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = (await getOrder(orderId)) || {}; return { detail: `durum ${o.status ?? '?'} · teslimat ${num(o.deliveryType) === 2 ? 'kendi kuryesi' : 'Getir kuryesi'}` }; });
    await diagStep(out, 'Ürünler', async () => { const r = await call('/products?page=1&limit=1'); const rows = Array.isArray(r) ? r : (r && (r.products || r.data || r.content)) || []; return { detail: `${r && r.totalCount != null ? r.totalCount : rows.length} ürün` }; });
    return out;
  }

  const missing = ['GETIR_APP_SECRET_KEY', 'GETIR_SHOP_SECRET_KEY'].filter((k) => !env[k]);
  return {
    ...meta, type: 'getir', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: false, courier: 'platform' },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose,
  };
}
