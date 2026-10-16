// Pazarama (isortagimapi.pazarama.com). İş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri: API Key (Client ID), API Secret.
// Kimlik: client_credentials belirteci (isortagimgiris.pazarama.com/connect/token, kapsam merchantgatewayapi.fullaccess; belirteç 1 saat geçerli).
// API Secret üretildiği günden itibaren en fazla 1 yıl geçerlidir; süresi dolan anahtar Pazarama tarafından sıfırlanır (yenisi panelde üretilir).
// Doküman: isortagim.pazarama.com/auth/integration (içerik isortagimapi.pazarama.com/api/content/getBySlug/<sayfa> servisinden gelir).
// Cevaplar { data, success, message } ile sarılıdır. Sipariş durumu satır (orderItemStatus) düzeyinde okunur.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, basic, num, str, chunk, imageList, diagStep, sleep, DEAD_LINE, TR, rankBrands } from '../util.js';

const API = 'https://isortagimapi.pazarama.com';
// Satır durum kodları (Siparişler dokümanı, OrderItemStatus): 3 alındı · 12 hazırlanıyor · 18 iptal süreci başlatıldı (satıcı onayı / Pazarama incelemesi
// bekleniyor, sipariş hâlâ açık) · 5 kargoya verildi · 16 mağazada · 19 teslimat noktasında · 14 teslim edilemedi · 11 teslim edildi · 9 iade reddedildi
// (ürün müşteride kalır) · 6 iptal · 13 tedarik edilemedi · 7 iade süreci başlatıldı · 8 iade onaylandı · 10 iade edildi
const CODES = { 3: 'new', 12: 'processing', 18: 'processing', 5: 'shipped', 16: 'shipped', 19: 'shipped', 14: 'shipped', 11: 'delivered', 9: 'delivered',
  6: 'cancelled', 13: 'cancelled', 7: 'returned', 8: 'returned', 10: 'returned', 15: 'returned' };
const ITEM = (c) => CODES[Number(c)] || 'new';
const ITEM_TR = { 3: 'Siparişiniz Alındı', 12: 'Siparişiniz Hazırlanıyor', 18: 'İptal Süreci Başlatıldı', 5: 'Siparişiniz Kargoya Verildi', 16: 'Siparişiniz Mağazada',
  19: 'Siparişiniz Teslimat Noktasında', 14: 'Teslim Edilemedi', 11: 'Teslim Edildi', 9: 'İade Reddedildi', 6: 'Siparişiniz İptal Edildi', 13: 'Tedarik Edilemedi',
  7: 'İade Süreci Başlatıldı', 8: 'İade Onaylandı', 10: 'İade Edildi' };
const RANKS = ['new', 'processing', 'shipped', 'delivered'];
const val = (v) => (v && typeof v === 'object' ? num(v.value ?? v.amount) : num(v));
// Tarih: saat dilimi yazılmamışsa (ör. "2026-02-17 17:23", "2023-12-28T09:12:16.333") Türkiye saati
export function pzDate(v) {
  const s = str(v);
  if (!s) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TR;
  return Date.parse(s) || 0;
}
// Sipariş sorgusu tarihi: Türkiye saatiyle "YYYY-AA-GGTSS:DD" (dokümandaki örnek biçim)
const minute = (ms) => new Date(ms + TR).toISOString().slice(0, 16);
const firmKey = (x) => str(x).toLocaleLowerCase('tr').replace(/kargo|lojistik|express|\s|\./g, '');

export function pazarama(env, meta) {
  const id = env.PAZARAMA_CLIENT_ID, secret = env.PAZARAMA_CLIENT_SECRET;
  let token = null, exp = 0;
  async function auth() {
    if (token && Date.now() < exp) return token;
    const r = await http('https://isortagimgiris.pazarama.com/connect/token', {
      method: 'POST', headers: { Authorization: basic(id, secret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=merchantgatewayapi.fullaccess',
    });
    const d = (r && r.data) || r || {};
    token = d.accessToken || d.access_token;
    if (!token) throw new Error('Pazarama belirteci alınamadı (API Key / API Secret hatalı ya da API Secret\'ın 1 yıllık süresi dolmuş olabilir: Pazarama → Hesabım → Entegrasyon Bilgileri → “Yeni API Key Üret”)');
    exp = Date.now() + Math.max(60, num(d.expiresIn || d.expires_in, 3600) - 120) * 1000;
    return token;
  }
  const call = async (path, opts = {}) => {
    const r = await http(API + path, { ...opts, headers: { Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
    if (r && r.success === false) throw new Error('Pazarama: ' + (r.userMessage || r.message || 'işlem başarısız'));
    return r;
  };

  function norm(o) {
    const a = o.shipmentAddress || {};
    const items = (o.items || []).map((it) => {
      const p = it.product || {}, qty = num(it.quantity, 1), total = val(it.totalPrice) || val(it.salePrice) * qty, st = ITEM(it.orderItemStatus);
      return { lineId: str(it.orderItemId), sku: str(p.stockCode), barcode: str(p.barcode || p.code), name: str(p.name || p.title), image: str(p.imageURL || p.imageUrl || it.productImageUrl),
        variantName: str(p.variantOptionDisplay), quantity: qty, unitPrice: qty ? total / qty : total, total,
        status: DEAD_LINE(st) ? st : '', remoteKey: str(p.code || p.barcode), _st: st, _raw: str(it.orderItemStatusName || ITEM_TR[it.orderItemStatus] || it.orderItemStatus),
        _ship: pzDate(it.estimatedShippingDate), cargo: it.cargo || {} };
    });
    const live = items.filter((i) => !DEAD_LINE(i._st));
    const status = !live.length ? (items.some((i) => i._st === 'returned') ? 'returned' : 'cancelled') : RANKS[Math.min(...live.map((i) => Math.max(0, RANKS.indexOf(i._st))))];
    const cg = (items.find((i) => i.cargo.trackingNumber) || { cargo: {} }).cargo;
    const raw = [...new Set(items.map((i) => i._raw).filter(Boolean))].join(', ');
    const ship = live.map((i) => i._ship).filter(Boolean);
    for (const i of items) { delete i._st; delete i._raw; delete i._ship; delete i.cargo; }
    const liveSum = live.reduce((s, i) => s + i.total, 0);
    return {
      remoteId: str(o.orderNumber || o.orderId), orderNumber: str(o.orderNumber || o.orderId), orderedAt: pzDate(o.orderDate) || Date.now(), remoteStatus: raw || status, status,
      customer: str(o.customerName || a.nameSurname), phone: str(a.phoneNumber), email: str(o.customerEmail || a.customerEmail), customerId: str(o.customerId),
      address: { name: str(a.nameSurname || o.customerName), line: str(a.addressDetail || a.displayAddressText), district: str(a.districtName), city: str(a.cityName), phone: str(a.phoneNumber) },
      // Kısmi iptal / iadede sipariş tutarı canlı satırlardan (orderAmount ilk tutardır)
      total: live.length < items.length ? liveSum : val(o.orderAmount) || liveSum, currency: 'TRY', cargoCompany: str(cg.companyName), tracking: str(cg.trackingNumber),
      shipBy: ship.length ? Math.min(...ship) : null, items, packages: null,
    };
  }

  // getOrdersForApi: aralık en fazla 1 ay; bitiş tarihi HARİÇ ("EndDate'ten önceki siparişler"). Yalnız gün verilirse bugünün siparişleri gelmez:
  // bu yüzden tarih saat:dakika ile gönderilir ve bitiş bir dakika ileri yuvarlanır.
  async function fetchOrders(since, until) {
    const out = new Map(), W = 28 * 864e5, end = Math.ceil(until / 60e3) * 60e3 + 60e3;
    let cut = null;
    for (let to = end; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 1; page <= 50; page++) {
        const r = await call('/order/getOrdersForApi', { method: 'POST', body: { pageSize: 100, pageNumber: page, startDate: minute(from), endDate: minute(to) } });
        const rows = (r && r.data) || [];
        for (const o of rows) { const n = norm(o); out.set(n.remoteId, n); }
        if (rows.length < 100) break;
        if (page === 50) cut = from; // sayfa sınırı (5.000 sipariş): dilimin kalanı okunmadı
      }
    }
    const res = [...out.values()];
    if (cut != null) { res.partialUntil = cut; res.warnings = ['Pazarama: bir tarih aralığında 5.000 siparişten fazlası var; kalanlar sonraki senkronda okunur']; }
    return res;
  }

  // Onaylı ürünler: product/products/approved (imleç tabanlı, istek başına en fazla 100; nextCursor null olunca biter).
  // Eski product/products servisi approved / unapproved olarak ikiye ayrıldı.
  async function fetchListings() {
    const out = [];
    let cursor = '';
    for (let i = 0; i < 1000; i++) {
      const r = (await call(`/product/products/approved?Size=100${cursor ? '&Cursor=' + encodeURIComponent(cursor) : ''}`)) || {};
      const d = r.data || {}, rows = Array.isArray(d) ? d : d.sellerProducts || [];
      for (const p of rows) {
        const g = (p.productGroups || []).find((x) => str(x.code) === str(p.code));
        out.push({ remoteId: str(p.code), remoteProductId: str(p.groupCode || p.code), sku: str(p.stockCode), barcode: str(p.code), name: str(p.displayName || p.name), groupName: str(p.name || p.displayName),
          variantName: str(g && g.attributeValue), image: str(((p.images || [])[0] || {}).imageUrl), images: imageList(p.images), price: num(p.salePrice), listPrice: num(p.listPrice) || num(p.salePrice),
          stock: p.stockCount == null ? null : num(p.stockCount), active: true, brand: str(p.brandName), category: str(p.categoryName) });
      }
      cursor = Array.isArray(d) ? '' : str(d.nextCursor);
      if (!cursor || !rows.length) break;
    }
    return out;
  }

  // Stok / fiyat: satıcı başına iki istek arasında en az 10 sn olmalı, istekte en fazla 3000 ürün (Servis Limitleri).
  // Cevaptaki data bir işlem kimliğidir (dataId); sonuç listing-state servisinden okunur (pushStatus).
  let lastPush = 0;
  async function pushed(path, rows) {
    const refs = [];
    for (const part of chunk(rows, 3000)) {
      const wait = lastPush + 10500 - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        const r = await call(path, { method: 'POST', body: { items: part } });
        if (r && typeof r.data === 'string' && r.data) refs.push(r.data);
      } finally { lastPush = Date.now(); }
    }
    return { refs };
  }
  const pushStock = (items) => pushed('/product/updateStock-v2', items.map((x) => ({ code: x.remoteId, stockCount: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = (items) => pushed('/product/updatePrice-v2', items.map((x) => ({ code: x.remoteId, listPrice: Math.max(x.listPrice || 0, x.price), salePrice: x.price })));
  // OperationStatus: 0 başarılı · 1 tamamlanamadı · 2 hata · 3 işleniyor · 5 onaya gönderildi (%70 üzeri indirim Pazarama onayına gider)
  async function pushStatus(ref) {
    const r = (await call(`/listing-state/batch-id/${encodeURIComponent(ref)}/lake-projections?page=1&pageSize=3000`)) || {};
    const rows = ((r.data || {}).data) || [];
    let pending = !rows.length;
    const items = rows.map((x) => {
      const op = x.stock || x.price || {}, c = op.status, text = str(x.operationStatusText);
      const bad = c === 1 || c === 2 || /hata|tamamlanamad|başarısız/i.test(text), wait = c === 3 || (c == null && /işleniyor/i.test(text));
      if (wait) pending = true;
      return { key: str(x.code), ok: bad ? false : wait ? null : true, error: bad ? str(op.operationDetail) || text || 'Pazarama reddetti' : '' };
    });
    return { done: !pending, items };
  }

  // İşleme al: siparişi "Hazırlanıyor" (12) yap
  async function accept(order) { await call('/order/updateOrderStatusList', { method: 'PUT', body: { orderNumber: Number(order.remote_id) || order.remote_id, status: 12 } }); }

  // Kargoya verme (Pazarama anlaşmalı kargo kullanmayan satıcılar): her satır için updateOrderStatus, statü 5 + takip no + kargo firması kimliği.
  // Kargo firması kimliği satıcının teslimat ayarlarından (sellerRegister/getSellerDelivery) firma adıyla bulunur. Anlaşmalı kargoda süreç
  // Pazarama'da kendiliğinden ilerler: takip no girilmediyse ya da takip no kanalın kendi verdiği numaraysa bir şey gönderilmez.
  let firms = null;
  async function cargoFirms() {
    if (!firms) firms = ((((await call('/sellerRegister/getSellerDelivery')) || {}).data || {}).cargoCompany || {}).cargoCompanies || [];
    return firms;
  }
  async function ship(order, pkg, { tracking, cargoCompany } = {}) {
    tracking = str(tracking);
    if (!tracking || (pkg.agreement !== 'own' && tracking === str(order.tracking))) return {};
    const firm = cargoCompany || pkg.cargo_company || order.cargo_company || '', list = await cargoFirms(), k = firmKey(firm);
    const hit = k && list.find((c) => { const n = firmKey(c.cargoCompanyName); return n && (n.includes(k) || k.includes(n)); });
    if (!hit) throw new Error(`Pazarama kargo firmasının kimliğini ister: “${firm || 'kargo firması'}” Pazarama teslimat ayarlarınızda yok. Tanımlı firmalar: ${[...new Set(list.map((c) => str(c.cargoCompanyName)))].join(', ') || '—'}`);
    const live = new Set((order.items || []).filter((i) => !DEAD_LINE(i.status)).map((i) => String(i.line_id)));
    const ids = ((pkg.items || []).length ? pkg.items.map((x) => String(x.line_id)) : [...live]).filter((x) => live.has(x));
    if (!ids.length) return {};
    // Kargoya verme yalnız "Hazırlanıyor" (12) sonrası yapılabilir: işleme alınmamış sipariş önce işleme alınır
    if (order.status === 'new') await accept(order).catch(() => null);
    for (const lineId of ids) {
      await call('/order/updateOrderStatus', { method: 'PUT', body: { orderNumber: Number(order.remote_id) || order.remote_id,
        item: { orderItemId: lineId, status: 5, deliveryType: 1, shippingTrackingNumber: tracking, cargoCompanyId: hit.cargoCompanyId } } });
    }
    return {};
  }

  // ---------- müşteri soruları: QuestionAnswer/getApprovalAnswersByMerchantSearch (sayfa 1'den), cevap: QuestionAnswer/sellerAnswer ----------
  // questionStatus: 0 cevap bekliyor · 1 cevaplandı · 2 onay bekliyor (cevap Pazarama onayında) · 3 reddedildi
  const QST = { 0: 'Cevap bekliyor', 1: 'Cevaplandı', 2: 'Onay bekliyor', 3: 'Reddedildi' };
  async function questions({ since, until = Date.now(), page = 0, size = 50 }) {
    const r = await call('/QuestionAnswer/getApprovalAnswersByMerchantSearch', { method: 'POST', body: { questionStartDate: new Date(since).toISOString(), questionEndDate: new Date(until).toISOString(), pageIndex: page + 1, pageSize: size } });
    const d = r.data || {}, list = d.approvalAnswersByMerchantSearchs || d.items || (Array.isArray(d) ? d : []), pr = d.pageResponse || {};
    const items = list.map((x) => {
      const qs = x.questionStatus == null ? null : Number(x.questionStatus);
      return {
        remoteId: String(x.questionId || x.id), text: str(x.question), askedAt: pzDate(x.questionDate) || Date.now(),
        status: qs === 3 ? 'other' : x.answer || qs === 1 || qs === 2 ? 'answered' : 'waiting', remoteStatus: QST[qs] || String(x.questionStatus ?? ''),
        productName: str(x.productName), productImage: str(x.productImageUrl), barcode: str(x.barcode), customer: str(x.maskedUserName), answer: x.answer ? str(x.answer) : null,
        answeredAt: x.answer ? pzDate(x.answerDate) || null : null,
      };
    });
    const pages = num(pr.totalPages);
    return { items, hasNext: pages ? page + 1 < pages : items.length >= size, total: num(pr.totalCount) || num(d.totalCount) || items.length };
  }
  async function answer(q, text) { await call('/QuestionAnswer/sellerAnswer', { method: 'PUT', body: { questionId: q.remote_id, text } }); }

  // ---------- ürün yükleme (Ürün Ekleme dokümanı, isortagimapi.pazarama.com/api/content/getBySlug/urun-ekleme) ----------
  // Kategori listesi düz gelir (parentId, parentCategories, leaf); ürün yalnız son kategoriye (leaf) açılır. Özellik değerleri listeden seçilir
  // (serbest metin yok). Marka kimliği GUID (brand/getBrands?name=). product/create istekte en fazla 500 ürün, iki istek arası en az 10 sn;
  // sonuç product/getProductBatchResult ile (durum 1 işleniyor · 2 tamam · 3 hata; yalnız hatalı ürünler failedProducts'ta listelenir).
  // Kabul edilen ürün Pazarama onayına girer; onaylanınca onaylı ürünler listesinde görünür (fetchListings).
  let catCache = null;
  const list = (r) => { const d = r && r.data !== undefined ? r.data : r; return Array.isArray(d) ? d : (d && (d.items || d.data)) || []; };
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) {
      const rows = list(await call('/category/getCategoryTree'));
      const byId = new Map(rows.map((c) => [String(c.id), c]));
      // Yol: parentCategories (kökten yaprağa adlar) ya da parentId zinciri; kategorinin kendi adı yolda yer almaz
      const pathOf = (c) => {
        const names = Array.isArray(c.parentCategories) && c.parentCategories.length ? c.parentCategories.map(str) : (() => { const p = []; let x = byId.get(String(c.parentId || '')); for (let i = 0; x && i < 12; i++) { p.unshift(str(x.displayName || x.name)); x = byId.get(String(x.parentId || '')); } return p; })();
        const own = str(c.displayName || c.name);
        return (names[names.length - 1] === own ? names.slice(0, -1) : names).filter(Boolean).join(' › ');
      };
      const leafOf = (c) => (c.leaf != null ? !!c.leaf : !rows.some((x) => String(x.parentId) === String(c.id)));
      catCache = { at: Date.now(), all: rows.filter(leafOf).map((c) => ({ id: String(c.id), name: str(c.displayName || c.name), path: pathOf(c) })) };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const attrCache = new Map();
  async function rawAttrs(cat) {
    if (!attrCache.has(cat)) { const r = await call(`/category/getCategoryWithAttributes?Id=${encodeURIComponent(cat)}`); attrCache.set(cat, ((r && r.data) || {}).attributes || []); }
    return attrCache.get(cat);
  }
  const attributes = async (cat) => (await rawAttrs(cat)).map((a) => ({ id: String(a.id), name: str(a.displayName || a.name), mandatory: !!a.isRequired,
    kind: a.isVariantable ? 'variant' : 'category', type: 'enum', custom: false, multi: false }));
  async function values(cat, attr) {
    const a = (await rawAttrs(cat)).find((x) => String(x.id) === String(attr));
    return ((a && a.attributeValues) || []).map((v) => ({ id: String(v.id), value: str(v.value ?? v.name) }));
  }
  const brandHits = new Map();
  async function findBrands(name) {
    const k = str(name);
    if (!k) return [];
    if (!brandHits.has(k)) brandHits.set(k, list(await call(`/brand/getBrands?Page=1&Size=100&name=${encodeURIComponent(k)}`)).map((b) => ({ id: str(b.id), name: str(b.name) })));
    return brandHits.get(k);
  }
  async function brandId(name) {
    const k = str(name).toLocaleLowerCase('tr');
    const hit = (await findBrands(name)).find((b) => b.name.toLocaleLowerCase('tr') === k);
    return hit ? hit.id : null;
  }
  async function searchBrands(q) {
    const k = str(q), out = [];
    if (!k) return [];
    for (const term of [...new Set([k, k.split(/\s+/)[0]])]) out.push(...await findBrands(term));
    return rankBrands(out, k);
  }
  // Varyant grubu kodu: Pazarama en fazla 10 karakter kabul eder; uzun grup kodu kararlı bir özetle kısaltılır (aynı grubun varyantları aynı kodu alır)
  const groupCode = (g) => {
    const s = str(g).replace(/[^A-Za-z0-9-]/g, '');
    if (s && s.length <= 10) return s;
    let h1 = 0x811c9dc5, h2 = 0x1b873593;
    for (const ch of str(g)) { const c = ch.charCodeAt(0); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); }
    return ('G' + ((h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)).toUpperCase()).slice(0, 10);
  };
  async function build(pr, map, { pick } = {}) {
    const missing = [], attrs = [];
    for (const a of await rawAttrs(map.remote_id)) {
      const id = String(a.id), v = (map.attrs || {})[id];
      let valueId = v && v.id;
      const text = v && v.value;
      if (text === '@variant') { const hit = pr.variant && pick ? await pick({ id }, pr.variant) : null; valueId = hit && hit.id; }
      if (valueId) attrs.push({ attributeId: id, attributeValueId: String(valueId) });
      else if (a.isRequired) missing.push(str(a.displayName || a.name) + (text && text !== '@variant' ? ` (“${text}” listede yok)` : text === '@variant' && pr.variant ? ` (“${pr.variant}” listede yok)` : ''));
    }
    const bid = pr.brandId ? str(pr.brandId) : pr.brand ? await brandId(pr.brand) : null;
    if (!pr.brand && !bid) missing.push('marka'); else if (!bid) missing.push(`marka “${pr.brand}” Pazarama'da bulunamadı`);
    if (!pr.barcode) missing.push('barkod');
    if (!pr.sku) missing.push('SKU');
    const imgs = [pr.image, ...(pr.images || []).filter((u) => u !== pr.image)].filter((u) => /^https?:\/\//i.test(str(u)) && str(u).length <= 500).slice(0, 8);
    if (!imgs.length) missing.push('görsel');
    if (!(pr.price > 0)) missing.push('fiyat');
    const item = {
      name: str(pr.name).slice(0, 100), displayName: str(pr.name).slice(0, 250), description: pr.description || pr.name, brandId: bid,
      desi: Math.max(1, Math.round(num(pr.desi, 1))), code: pr.barcode, groupCode: groupCode(pr.group || pr.sku), stockCount: Math.max(0, Math.round(num(pr.stock))), stockCode: str(pr.sku).slice(0, 100),
      currencyType: 'TRY', listPrice: Math.max(num(pr.listPrice), num(pr.price)), salePrice: num(pr.price), vatRate: Math.round(num(pr.vat ?? 20)),
      images: imgs.map((imageurl) => ({ imageurl })), categoryId: str(map.remote_id), attributes: attrs, deliveries: [],
    };
    return { key: pr.barcode, missing, payload: item };
  }
  // Gönderim: istek başına en fazla 500 ürün, iki istek arası en az 10 sn. Kayıt: "<batch>:<barkodlar>" (sonuç yalnız hatalıları listeler;
  // listede olmayanlar kabul edilmiş sayılır). Tek ürünlük istekte Pazarama toplu işlem açmaz (kimlik sıfır): hata varsa hemen döner
  let lastCreate = 0;
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 500)) {
      const wait = lastCreate + 10500 - Date.now();
      if (wait > 0) await sleep(wait);
      let r;
      try { r = await call('/product/create', { method: 'POST', body: { products: part } }); } finally { lastCreate = Date.now(); }
      const d = (r && r.data) || {}, errs = [].concat(((d.error || {}).errors) || []).map((x) => (typeof x === 'string' ? x : str(x && (x.message || x.errorMessage || x.description)) || JSON.stringify(x))).filter(Boolean);
      const bid = str(d.batchRequestId), keys = part.map((x) => x.code).join(',');
      if (!bid || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(bid)) {
        if (errs.length || (d.error && d.error.message)) throw new Error('Pazarama: ' + (errs.join(' · ') || d.error.message));
        refs.push('0:' + keys);
      } else refs.push(bid + ':' + keys);
    }
    return { ref: refs.join(';') };
  }
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const part of String(ref).split(';').filter(Boolean)) {
      const i = part.indexOf(':'), bid = part.slice(0, i), keys = part.slice(i + 1).split(',').filter(Boolean);
      // Tek ürünlük istek: toplu işlem yok, hata dönmediyse ürün Pazarama'ya iletildi
      if (bid === '0') { for (const k of keys) items.push({ key: k, ok: true, status: 'Pazarama\'ya iletildi (onay bekliyor)', error: '' }); continue; }
      const d = ((await call(`/product/getProductBatchResult?BatchRequestId=${encodeURIComponent(bid)}`)) || {}).data || {};
      const st = Number(d.status);
      if (st === 1 || !d.status) { pending = true; continue; }
      const bad = new Map();
      for (const f of d.failedProducts || []) {
        const k = str(f.productCode);
        bad.set(k, [...(bad.get(k) || []), str(f.errorReason)].filter(Boolean));
      }
      for (const k of keys) {
        const e = bad.get(k);
        items.push(e ? { key: k, ok: false, status: 'Pazarama kabul etmedi', error: [...new Set(e)].join(' · ') || 'Pazarama kabul etmedi' }
          : st === 3 ? { key: k, ok: false, status: 'Pazarama işlemi hata verdi', error: 'Toplu işlem hata ile bitti' } : { key: k, ok: true, status: 'Pazarama\'ya iletildi (onay bekliyor)', error: '' });
      }
      for (const [k, e] of bad) if (!keys.includes(k)) items.push({ key: k, ok: false, status: 'Pazarama kabul etmedi', error: e.join(' · ') });
    }
    return { done: !pending, items };
  }
  const catalog = { categories, allCategories, attributes, values, build, send, status, brands: searchBrands, chunk: 500, options: [] };

  async function diagnose() {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik (belirteç)', async () => { await auth(); return { detail: 'belirteç alındı' }; });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const o = await fetchOrders(now - 864e5, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek durum: ${o[0].remoteStatus} → ${o[0].status}` : ''}` }; });
    await diagStep(out, 'Onaylı ürünler', async () => { const r = (await call('/product/products/approved?Size=1')) || {}, d = r.data || {}; return { detail: (Array.isArray(d) ? d : d.sellerProducts || []).length ? 'ürün örneği alındı' : 'onaylı ürün yok' }; });
    return out;
  }

  const missing = ['PAZARAMA_CLIENT_ID', 'PAZARAMA_CLIENT_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'pazarama', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, answer: { min: 2, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, pushStatus, accept, ship, questions, answer, diagnose, catalog,
  };
}
