// Çiçeksepeti (apis.ciceksepeti.com/api/v1; test ortamı sandbox-apis.ciceksepeti.com). Satıcı paneli → Hesap Ayarları → Entegrasyon Bilgileri: API anahtarı.
// Kimlik: her istekte x-api-key başlığı. Siparişler (Order/GetOrders) ürün satırı düzeyinde gelir, aynı orderId'li satırlar tek siparişte birleştirilir;
// tarih aralığı en fazla ~14 gün olduğundan aralık dilimlenir. Ürünler: GET Products (sayfa başına 60). Stok / fiyat: PUT Products/price-and-stock
// (asenkron, batchId döner; istekte en fazla 200 satır). İlanların anahtarı satıcı stok kodu (stockCode); sipariş satırı da stok koduyla eşleşir.
// Kargo: Çiçeksepeti anlaşmalı kargosu; etiket Çiçeksepeti panelinden basılır, takip no kanaldan gelir (elle takip / API'den kargoya verme yok).
// Onay (işleme al) servisi kullanılmaz. Soru-cevap, iade yok. Ürün yükleme: Categories, Categories/{id}/attributes, POST Products, Products/batch-status
// (ayrıntı ve kaynaklar aşağıda "ürün yükleme" bölümünde). Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, r2, chunk, sleep, imageList, diagStep, rankBrands, brandKey, TR } from '../util.js';

const RANKS = ['new', 'processing', 'shipped', 'delivered'];
// Satır durumu metinle gelir (ör. Yeni, Hazırlanıyor, Kargoya Verildi, Teslim Edildi, İptal, İade). Sıra önemli: önce kesin sonuçlar.
function byText(t) {
  const s = str(t).toLocaleLowerCase('tr');
  if (/iptal|cancel/.test(s)) return 'cancelled';
  if (/iade|return|refund/.test(s)) return 'returned';
  if (/teslim edildi|delivered|tamamland/.test(s)) return 'delivered';
  if (/hazırlan|kargoya hazır|kargoya verilecek|onaylan|processing|preparing/.test(s)) return 'processing';
  if (/kargo|gönderi|yolda|dağıtım|shipped|teslim edilemedi/.test(s)) return 'shipped';
  return 'new';
}
// Yalnız sayısal kod geldiğinde (orderItemStatusId). Resmi doküman (ciceksepeti.dev) bu ortamdan okunamadı; kodlar Çiçeksepeti API'sinin
// açık kaynak bir istemcisindeki sabitlerden: 1 Yeni · 2 Hazırlanıyor · 11 Kargoya verilecek · 5 Kargoya verildi · 7 Teslim edildi ·
// 20 İade süreci başladı · 21 İade kargoda · 22 İade tedarikçide · 23 İade tedarikçi onayı bekliyor. (Önceki varsayımdaki "5 = iptal" kargodaki
// siparişi iptal sayıp stoğu geri ekliyordu.) İptaller ayrı bir servisten gelir; bilinmeyen kod "yeni" sayılır.
const CODE = { 1: 'new', 2: 'processing', 11: 'processing', 5: 'shipped', 7: 'delivered', 20: 'returned', 21: 'returned', 22: 'returned', 23: 'returned' };
const pick = (o, ...ks) => { for (const k of ks) if (o[k] != null && o[k] !== '') return o[k]; return ''; };
function lineStatus(it) {
  const vals = [it.orderProductStatus, it.orderItemStatus, it.orderItemStatusName, it.orderStatus, it.statusName, it.status];
  const t = vals.find((v) => v != null && v !== '' && typeof v !== 'object' && !Number.isFinite(Number(v)));
  if (t != null) return { raw: str(t), st: byText(t) };
  const c = [it.orderItemStatusId, it.orderProductStatusId, it.statusId, ...vals].find((v) => v != null && v !== '' && Number.isFinite(Number(v)));
  return { raw: c == null ? '' : String(c), st: CODE[Number(c)] || 'new' };
}
// Tarih: ISO (saat dilimsiz ise Türkiye saati) ya da gg.aa.yyyy ss:dd
function when(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const s = str(v), m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - TR;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(s + '+03:00') || 0;
  return Date.parse(s) || 0;
}

export function ciceksepeti(env, meta) {
  const key = env.CICEKSEPETI_API_KEY;
  const API = String(env.CICEKSEPETI_TEST || '') === '1' ? 'https://sandbox-apis.ciceksepeti.com/api/v1' : 'https://apis.ciceksepeti.com/api/v1';
  // Her istekte x-api-key ve user-agent: user-agent "Satıcı ID" (entegratör adıyla "SatıcıID-EntegratörAdı"); ikisi de satıcı panelinde
  // Entegrasyon Bilgilerim'de yazar. Satıcı ID girilmemişse panelin varsayılan kimliği gider.
  const seller = str(env.CICEKSEPETI_SELLER_ID), integrator = str(env.CICEKSEPETI_INTEGRATOR);
  const ua = seller ? (integrator ? `${seller}-${integrator}` : seller) : null;
  const call = (path, opts = {}) => http(API + path, { ...opts, headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json', ...(ua ? { 'User-Agent': ua } : {}) }, body: opts.body && JSON.stringify(opts.body) });

  function group(rows) {
    const by = new Map();
    for (const r of rows) { const k = str(pick(r, 'orderId', 'orderNumber', 'orderNo')); if (k) by.set(k, [...(by.get(k) || []), r]); }
    return [...by.entries()].map(([id, list]) => {
      const r0 = list[0], seen = new Set(), items = [];
      for (const it of list) {
        const lineId = str(pick(it, 'orderItemId', 'orderProductId', 'id')) || `${id}-${items.length + 1}`;
        if (seen.has(lineId)) continue;
        seen.add(lineId);
        const qty = num(pick(it, 'quantity', 'productQuantity'), 1) || 1, s = lineStatus(it);
        const total = num(pick(it, 'totalPrice', 'orderItemTotalPrice', 'lineTotal')) || num(pick(it, 'itemPrice', 'price', 'salesPrice', 'unitPrice')) * qty;
        const sku = str(pick(it, 'stockCode', 'productCode', 'supplierProductCode'));
        items.push({ lineId, sku, barcode: str(pick(it, 'barcode', 'productBarcode')), name: str(pick(it, 'name', 'productName')), image: str(pick(it, 'productImageUrl', 'imageUrl', 'image')),
          quantity: qty, unitPrice: total / qty, total, status: ['cancelled', 'returned'].includes(s.st) ? s.st : '', remoteKey: sku || str(it.code), _st: s.st, _raw: s.raw, _it: it });
      }
      const live = items.filter((i) => !['cancelled', 'returned'].includes(i._st));
      const status = !live.length ? (items.some((i) => i._st === 'returned') ? 'returned' : 'cancelled') : RANKS[Math.min(...live.map((i) => Math.max(0, RANKS.indexOf(i._st))))];
      const raw = [...new Set(items.map((i) => i._raw).filter(Boolean))].join(', ');
      const cg = (items.find((i) => pick(i._it, 'cargoNumber', 'cargoTrackingNumber', 'trackingNumber')) || { _it: r0 })._it;
      const ship = live.map((i) => when(pick(i._it, 'lastShipmentDate', 'cargoLastDate', 'deliveryDate'))).filter(Boolean);
      for (const i of items) { delete i._st; delete i._raw; delete i._it; }
      const phone = str(pick(r0, 'receiverPhone', 'receiverMobilePhone', 'senderPhone'));
      return {
        remoteId: id, orderNumber: id, orderedAt: when(pick(r0, 'orderCreateDate', 'orderDate', 'createDate')) || Date.now(), remoteStatus: raw || status, status,
        customer: str(pick(r0, 'senderName', 'customerName', 'receiverName')), phone, email: str(pick(r0, 'senderEmail', 'customerEmail')), customerId: str(pick(r0, 'customerId', 'senderId')),
        address: { name: str(pick(r0, 'receiverName', 'senderName')), line: str(pick(r0, 'receiverAddress', 'deliveryAddress')), district: str(pick(r0, 'receiverDistrict', 'receiverRegion', 'receiverTown')), city: str(pick(r0, 'receiverCity')), phone },
        total: (live.length ? live : items).reduce((s, i) => s + i.total, 0), currency: 'TRY',
        cargoCompany: str(pick(cg, 'cargoCompany', 'cargoCompanyName', 'shipmentCompany')), tracking: str(pick(cg, 'cargoNumber', 'cargoTrackingNumber', 'trackingNumber')),
        shipBy: ship.length ? Math.min(...ship) : null, items, packages: null,
      };
    });
  }

  const W = 14 * 864e5 - 60e3;
  const page = (from, to, p, size = 100) => call('/Order/GetOrders', { method: 'POST', body: { startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString(), pageSize: size, page: p } });
  // İptal edilen siparişler GetOrders'ta gelmiyor; iptal servisi bu ortamdan doğrulanamadı (uç nokta bilinmiyor): iptaller okunamaz.
  // Kullanıcı bunu bilsin diye bağlantı başına bir kez uyarı düşer (iptaller Çiçeksepeti panelinden kontrol edilmeli).
  let cancelWarned = false;
  async function fetchOrders(since, until) {
    const rows = [], warnings = [];
    let cut = null;
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let p = 0; p < 50; p++) {
        const r = (await page(from, to, p)) || {};
        const list = r.supplierOrderListWithBranch || r.supplierOrderList || r.orders || [];
        rows.push(...list);
        if (list.length < 100 || (r.orderListCount != null && (p + 1) * 100 >= num(r.orderListCount))) break;
        if (p === 49) cut = from; // sayfa sınırı (5.000 satır): dilimin kalanı okunmadı
      }
    }
    const out = group(rows);
    if (cut != null) { out.partialUntil = cut; warnings.push('Çiçeksepeti: bir tarih aralığında 5.000 sipariş satırından fazlası var; kalanlar sonraki senkronda okunur'); }
    if (!cancelWarned) { cancelWarned = true; warnings.push('Çiçeksepeti: iptal edilen siparişler API\'den okunamıyor; iptalleri Çiçeksepeti satıcı panelinden kontrol edin'); }
    if (warnings.length) out.warnings = warnings;
    return out;
  }

  // Aynı ana ürün kodundaki (mainProductCode) ürünlerin ortak ad başı grup adı, kalan kısmı varyant adı olur
  const common = (names) => { const w = names.map((n) => n.split(/\s+/)); const out = []; for (let i = 0; w.every((x) => i < x.length - 1 && x[i] === w[0][i]); i++) out.push(w[0][i]); return out.join(' '); };
  async function fetchListings() {
    const all = [];
    for (let p = 1; p <= 400; p++) {
      const r = (await call(`/Products?PageSize=60&Page=${p}`)) || {};
      const list = r.products || r.items || [];
      all.push(...list);
      if (list.length < 60 || (r.totalCount != null && p * 60 >= num(r.totalCount))) break;
    }
    const groups = new Map();
    for (const p of all) { const g = str(p.mainProductCode) || str(p.productCode); groups.set(g, [...(groups.get(g) || []), str(p.productName)]); }
    return all.filter((p) => str(p.stockCode)).map((p) => {
      const name = str(p.productName), names = groups.get(str(p.mainProductCode) || str(p.productCode)) || [name];
      const g = names.length > 1 ? common(names) : '', images = imageList(p.images);
      return {
        remoteId: str(p.stockCode), remoteProductId: str(p.productCode), sku: str(p.stockCode), barcode: str(p.barcode), name, groupName: g || name,
        variantName: str(p.variantName) || (g ? name.slice(g.length).trim() : ''), image: images[0] || '', images,
        price: num(p.salesPrice), listPrice: num(p.listPrice) || num(p.salesPrice), stock: num(p.stockQuantity),
        active: p.isActive !== false && !/pasif|passive|inactive|red|reject|silin|delete/i.test(str(p.productStatusType)),
      };
    });
  }

  // Toplu işlem kimlikleri (batchId) refs olarak döner. Sonuç sorgu servisi (pushStatus) doğrulanamadığından yok: refs şimdilik izlenmez.
  const update = async (rows) => {
    const refs = [];
    for (const part of chunk(rows, 200)) { const r = await call('/Products/price-and-stock', { method: 'PUT', body: { items: part } }); if (r && r.batchId) refs.push(String(r.batchId)); }
    return { refs };
  };
  const pushStock = (items) => update(items.map((x) => ({ stockCode: x.remoteId || x.sku, stockQuantity: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = (items) => update(items.map((x) => ({ stockCode: x.remoteId || x.sku, listPrice: Math.max(num(x.listPrice), num(x.price)), salesPrice: num(x.price) })));

  // ---------- ürün yükleme (Ürün yükle / Kanallarda yayınla) ----------
  // Resmi belge (ciceksepeti.dev) bu ortamdan açılamadı. Uçlar ve alanlar açık kaynak istemcilerden, birbirini tutanlar alındı:
  //  [A] npm ciceksepeti-api 1.1.1 (resources/category.js, resources/product.js, index.d.ts; github.com/Coskntkk/ciceksepeti-api documentation.md)
  //  [B] github.com/developkariyer/iwapim src/Connector/Marketplace/CiceksepetiConnector.php + src/MessageHandler/CiceksepetiListingHandler.php
  //  [C] npm turkish-marketplaces 2.6.7 (lib/integrations/Ciceksepeti.js, lib/types/ciceksepeti.d.ts)
  //  [D] github.com/backlex/backlex packages/integrations/src/providers/ciceksepeti.ts (+ apps/web/tests/integrations/ciceksepeti-listing.test.ts)
  //  [E] github.com/1212falcon1212/zunaproV4 apps/api/src/modules/marketplace/ciceksepeti.service.ts
  //  [F] github.com/LUNEX3D/LysiaETIC backend/services/ciceksepeti/ciceksepetiService.js
  //  [G] github.com/oguzhanayyldz/moon-lib src/services/response-interpreters/ciceksepeti.interpreter.ts
  // GET Categories → { categories: [{ id, name, parentCategoryId, subCategories: [...] }] } (ağaç; ürün yaprak kategoriye açılır) [A][B][D][G]
  // GET Categories/{id}/attributes → { categoryId, categoryName, categoryAttributes: [{ attributeId, attributeName, required, varianter, type,
  //   attributeValues: [{ id, name }] }] } [A][B][D][G]. Değer listeden seçilir: ürüne { id, valueId, textLength: 0 } gider [A][B][D][E].
  //   Marka da bir kategori özelliğidir ("Marka") [B][C]: eşleştirmede sorulmaz, ürünün markasından listedeki karşılığı bulunur (N11 gibi).
  //   type "Kişiselleştirilebilir Özellik" alıcının sipariş verirken yazdığı metindir; satıcı değer vermez, gönderilmez [D].
  // POST Products { products: [...] } → { batchId } (asenkron) [A][B][D][E][F]; istekte en fazla 1000 ürün, farklı gövdeyle 5 saniyede 1 istek [D][E][F].
  // GET Products/batch-status/{batchId} → { batchId, itemCount, items: [{ itemId, data: { stockCode, … }, status, failureReasons }] } [A][B][C][D][E][G]
  //   status: Pending | Processing | Success | Failed | Warning [C][D][G]; Warning = işlem başarılı, uyarı notuyla [D][G].
  //   failureReasons: [{ message, code }] [C][D][E] (eski tanımda düz metin listesi [A]; ikisi de okunur).
  // Ürün anahtarı satıcı stok kodu (stockCode): fetchListings ilanı stockCode ile tanıtır, sonuçta da data.stockCode döner [D][E].
  let catCache = null;
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) {
      const out = [];
      const walk = (list, path) => { for (const c of list || []) { if (c == null || c.id == null) continue; const kids = c.subCategories || []; if (kids.length) walk(kids, path.concat(str(c.name))); else out.push({ id: String(c.id), name: str(c.name), path: path.join(' › ') }); } };
      walk(((await call('/Categories')) || {}).categories, []);
      catCache = { at: Date.now(), all: out };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const attrCache = new Map();
  async function rawAttrs(cat) {
    if (!attrCache.has(cat)) attrCache.set(cat, (((await call(`/Categories/${encodeURIComponent(cat)}/attributes`)) || {}).categoryAttributes || []).filter((a) => !/^ki[sş]iselle[sş]tirilebilir/i.test(str(a.type))));
    return attrCache.get(cat);
  }
  const isBrand = (a) => /^marka$/i.test(str(a.attributeName));
  const attributes = async (cat) => (await rawAttrs(cat)).filter((a) => !isBrand(a)).map((a) => ({ id: String(a.attributeId), name: str(a.attributeName), mandatory: !!a.required,
    kind: a.varianter ? 'variant' : 'category', type: 'enum', custom: false, multi: false }));
  const valuesOf = (a) => ((a && a.attributeValues) || []).map((v) => ({ id: String(v.id), value: str(v.name) }));
  async function values(cat, attr) { return valuesOf((await rawAttrs(cat)).find((x) => String(x.attributeId) === String(attr))); }
  // Marka: kategorinin "Marka" özelliğinin değerleri içinde (büyük / küçük harf, boşluk, noktalama farkı gözetmeden birebir)
  async function searchBrands(q, cat) {
    if (!cat || !str(q)) return [];
    return rankBrands(valuesOf((await rawAttrs(cat)).find(isBrand)).map((v) => ({ id: v.id, name: v.value })), q);
  }
  const plain = (h) => str(String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, 'x').replace(/\s+/g, ' '));
  // Seçenek eksikliği "(Ürün yükle → … seçenekleri)" biçiminde: Kanallarda yayınla bunu kendi seçenek listesinde sorar (publish.js NEED)
  const OPT = '(Ürün yükle → Çiçeksepeti seçenekleri)';
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], attrs = [];
    for (const a of await rawAttrs(map.remote_id)) {
      const id = String(a.attributeId), v = (map.attrs || {})[id], list = valuesOf(a);
      let valueId = v && v.id, text = v && v.value;
      if (!v && isBrand(a)) { text = pr.brand; if (pr.brandId) valueId = pr.brandId; }
      if (text === '@variant') { const hit = pr.variant && pick ? await pick({ id }, pr.variant) : null; valueId = hit && hit.id; text = hit ? '' : pr.variant; }
      if (text === '@image') text = '';
      // Değer kimliği listede olmalı; yazılan değer listede aynı adla aranır (serbest metin değer kabul edilmez)
      if (valueId && !list.some((x) => x.id === String(valueId))) valueId = null;
      if (!valueId && text) valueId = (list.find((x) => (isBrand(a) ? brandKey(x.value) === brandKey(text) : x.value.toLocaleLowerCase('tr') === str(text).toLocaleLowerCase('tr'))) || {}).id;
      if (valueId) attrs.push({ id: Number(id), valueId: Number(valueId), textLength: 0 });
      else if (a.required) {
        if (isBrand(a)) missing.push(text ? `marka “${text}” Çiçeksepeti'de bulunamadı` : 'marka');
        else missing.push(str(a.attributeName) + (v && v.value === '@variant' ? (pr.variant ? ` (varyant “${pr.variant}” Çiçeksepeti listesinde yok)` : ' (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)') : text ? ` (“${text}” Çiçeksepeti listesinde yok)` : ''));
      }
    }
    if (!pr.sku) missing.push('SKU');
    // Görsel: düz adres listesi [A][D]; en fazla 5 görsel [B]
    const images = [pr.image, ...(pr.images || [])].filter((u, i, l) => /^https?:\/\//i.test(str(u)) && l.indexOf(u) === i).slice(0, 5);
    if (!images.length) missing.push('görsel');
    if (!(pr.price > 0)) missing.push('fiyat');
    // Açıklama: düz metin en az 30, HTML en fazla 20.000 karakter [D][E][B]
    const description = str(pr.description) || str(pr.name);
    if (plain(description).length < 30) missing.push('açıklama (en az 30 karakter)');
    else if (description.length > 20000) missing.push('açıklama (en fazla 20.000 karakter)');
    // Teslimat tipi (1 Çiçeksepeti servis aracı · 2 kargo · 3 ikisi) [A][D] ve teslimat mesaj tipi (sayısal kod) [A][B][D][E]: zorunlu, varsayılan yok
    const dt = Number(opts.deliveryType), dm = Number(opts.deliveryMessageType);
    if (![1, 2, 3].includes(dt)) missing.push(`teslimat tipi ${OPT}`);
    if (!(Number.isInteger(dm) && dm > 0)) missing.push(`teslimat mesaj tipi ${OPT}`);
    const item = {
      productName: str(pr.name).slice(0, 255), mainProductCode: str(pr.group || pr.sku), stockCode: str(pr.sku), categoryId: Number(map.remote_id), description,
      deliveryMessageType: dm, deliveryType: dt, stockQuantity: Math.max(0, Math.round(num(pr.stock))), salesPrice: r2(pr.price), listPrice: r2(Math.max(num(pr.listPrice), num(pr.price))),
      ...(str(pr.barcode) ? { barcode: str(pr.barcode) } : {}), images, attributes: attrs,
    };
    return { key: str(pr.sku), missing, payload: item };
  }
  // Gönderim: istekte en fazla 1000 ürün, iki istek arası en az 5 sn. Kayıt: "<batchId>:<stok kodları>;…" (sonuçtaki stok kodu eşleşmesi için).
  // Ürün oluşturma tekrar denenmez (aynı ürün iki kez açılmasın).
  let lastCreate = 0;
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 1000)) {
      const wait = lastCreate + 5500 - Date.now();
      if (wait > 0) await sleep(wait);
      let r;
      try { r = await call('/Products', { method: 'POST', body: { products: part }, tries: 1 }); } finally { lastCreate = Date.now(); }
      const bid = str(r && r.batchId);
      if (!bid) throw new Error('Çiçeksepeti takip numarası (batchId) vermedi: ' + (str(r && (r.message || r.Message)) || JSON.stringify(r).slice(0, 300)));
      refs.push(bid + ':' + part.map((x) => x.stockCode).join(','));
    }
    return { ref: refs.join(';') };
  }
  const reasons = (f) => [].concat(f || []).map((x) => (typeof x === 'string' ? x : str(x && (x.message || x.Message)))).filter(Boolean);
  const batch = (bid) => call(`/Products/batch-status/${encodeURIComponent(bid)}`);
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const part of String(ref).split(';').filter(Boolean)) {
      const i = part.indexOf(':'), bid = i < 0 ? part : part.slice(0, i), keys = i < 0 ? [] : part.slice(i + 1).split(',').filter(Boolean);
      const r = (await batch(bid)) || {}, list = r.items || [], seen = new Set();
      for (const it of list) {
        const k = str((it.data || {}).stockCode), st = str(it.status), why = [...new Set(reasons(it.failureReasons))].join(' · ');
        if (/^(success|warning)$/i.test(st)) items.push({ key: k, ok: true, status: /^warning$/i.test(st) ? `Çiçeksepeti kabul etti (uyarı${why ? ': ' + why : ''})` : 'Çiçeksepeti kabul etti', error: '' });
        else if (/^failed$/i.test(st)) items.push({ key: k, ok: false, status: 'Çiçeksepeti kabul etmedi', error: why || 'Çiçeksepeti neden belirtmedi' });
        else { pending = true; continue; }
        seen.add(k);
      }
      // Sonuç listesi henüz boşsa ya da gönderilen stok kodlarının hepsi sonuçlanmadıysa işlem sürüyor
      if (!list.length || (keys.length && keys.some((k) => !seen.has(k)) && list.length < Math.max(keys.length, num(r.itemCount)))) pending = true;
    }
    return { done: !pending, items: items.filter((x) => x.key) };
  }
  const raw = (ref) => batch(String(ref).split(/[:;]/)[0]);
  const catalog = { categories, allCategories, attributes, values, build, send, status, raw, brands: searchBrands, brandByCategory: true, chunk: 1000,
    options: [{ k: 'deliveryType', label: 'Teslimat tipi (deliveryType): 1 Çiçeksepeti servis aracı, 2 kargo, 3 servis aracı ve kargo' },
      { k: 'deliveryMessageType', label: 'Teslimat mesaj tipi kodu (deliveryMessageType; Çiçeksepeti entegrasyon belgesindeki / mevcut ürününüzdeki sayı)' }] };

  async function diagnose() {
    const out = [], now = Date.now();
    out.push({ name: 'Ortam', ok: null, detail: API.includes('sandbox') ? 'Test (sandbox) ortamı' : 'Canlı ortam' });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => {
      const r = (await page(now - 864e5, now, 0, 10)) || {}, list = r.supplierOrderListWithBranch || [];
      return { detail: `${r.orderListCount ?? list.length} sipariş satırı${list[0] ? ` · örnek durum: ${lineStatus(list[0]).raw} → ${lineStatus(list[0]).st}` : ''}` };
    });
    // Örnek üründeki teslimat kodları: ürün yükleme seçenekleri (teslimat tipi / teslimat mesaj tipi) için yol gösterir
    await diagStep(out, 'Ürünler', async () => {
      const r = (await call('/Products?PageSize=1&Page=1')) || {}, p = (r.products || [])[0] || {}, dt = pick(p, 'deliveryType', 'DeliveryType'), dm = pick(p, 'deliveryMessageType', 'DeliveryMessageType');
      return { detail: `${r.totalCount ?? (r.products || []).length} ürün${dt !== '' || dm !== '' ? ` · örnek ürün: teslimat tipi ${dt}, teslimat mesaj tipi ${dm}` : ''}` };
    });
    return out;
  }

  const missing = ['CICEKSEPETI_API_KEY'].filter((k) => !env[k]);
  return {
    ...meta, type: 'ciceksepeti', byOrderDate: true, enabled: !missing.length, missing,
    // Kargo Çiçeksepeti anlaşmasıyla: etiket kanal panelinden, takip no siparişle gelir; elle takip girilmez
    caps: { accept: 'local', split: 'local', ship: 'local', label: null, createProduct: false, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, diagnose, catalog,
  };
}
