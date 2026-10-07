// idefix pazaryeri (merchantapi.idefix.com, developer.idefix.com dokümanına göre). Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri →
// “Yeni API Oluştur”: API KEY ve API SECRET KEY satıcının e-posta adresine gönderilir; Satıcı ID ekranda görünür.
// Kimlik: X-API-KEY = base64(ApiKey:ApiSecret). Canlı ortamda IP izni gerekmez (test ortamında gerekir).
// Kimlik: X-API-KEY başlığı (biçim otomatik bulunur, aşağıya bakın). Siparişler: /oms/{vendorId}/list · İadeler: /oms/{vendorId}/claim-list · Ürün/stok/fiyat: /pim/...
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, diagStep, sleep, imageList } from '../util.js';

const BASE = 'https://merchantapi.idefix.com';
// idefix durumları "shipment_" önekiyle gelir (shipment_created, shipment_picking, shipment_in_cargo, shipment_delivered…)
const STATUS = {
  // Dokümana göre: created (ödeme alındı) → ready (hazırlanabilir) → picking (iptal edilemez) → invoiced → in_cargo → delivered → approved (hak ediş)
  created: 'new', ready: 'new', awaiting: 'new', split: 'new',
  picking: 'processing', ready_to_ship: 'processing', invoiced: 'processing', approved: 'delivered',
  in_cargo: 'shipped', shipped: 'shipped', undeliver: 'shipped', undelivered: 'shipped', at_collection_point: 'shipped',
  delivered: 'delivered', cancelled: 'cancelled', canceled: 'cancelled', unsupplied: 'cancelled', un_supplied: 'cancelled', returned: 'returned', refunded: 'returned',
};
export const idefixStatus = (s) => STATUS[String(s || '').trim().toLowerCase().replace(/-/g, '_').replace(/^shipment_/, '')] || 'new';

export function idefix(env, meta) {
  const key = str(env.IDEFIX_API_KEY), secret = str(env.IDEFIX_API_SECRET), vendor = str(env.IDEFIX_VENDOR_ID);
  // Kimlik: satıcı panelinde (Hesabım → Entegrasyon Bilgileri) yeni hesaplarda yalnızca Satıcı ID + API KEY verilir; eski hesaplarda
  // ayrıca API Secret vardır. X-API-KEY biçimi buna göre denenir ve kabul edilen biçim hatırlanır (401/403 alınca sıradakine geçilir).
  const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
  // API KEY alanına zaten "anahtar:gizli" ya da onun base64 hali yapıştırılmış olabilir
  const pairB64 = (() => { try { return /^[A-Za-z0-9+/]+=*$/.test(key) && key.length >= 16 && atob(key).includes(':'); } catch { return false; } })();
  const MODES = [];
  // Her biçim: [ad, X-API-KEY değeri, ek başlıklar]
  const addMode = (name, v, extra = null) => { if (v && !MODES.some((m) => m[1] === v && JSON.stringify(m[2]) === JSON.stringify(extra))) MODES.push([name, v, extra]); };
  if (secret) addMode('API KEY:API Secret (base64)', b64(`${key}:${secret}`));
  if (key.includes(':')) addMode('API KEY alanındaki anahtar:gizli (base64)', b64(key));
  if (pairB64) addMode('API KEY olduğu gibi (hazır base64)', key);
  addMode('yalnız API KEY', key);
  addMode('API KEY (base64)', b64(`${key}:`));
  addMode('Satıcı ID:API KEY (base64)', b64(`${vendor}:${key}`));
  // Bazı pazaryerleri kimliği Authorization başlığında ister
  if (secret) addMode('Authorization: Basic API KEY:API Secret', b64(`${key}:${secret}`), { Authorization: 'Basic ' + b64(`${key}:${secret}`) });
  addMode('Authorization: Bearer API KEY', key, { Authorization: 'Bearer ' + key });
  let mode = 0, modeOk = false;
  const tried = [];
  const headers = () => ({ 'X-API-KEY': MODES[mode][1], 'Content-Type': 'application/json', Accept: 'application/json', ...(MODES[mode][2] || {}) });
  // idefix istek sınırı sıkı: 429 / 5xx'te artan beklemeyle 4 deneme (bağlantı test edilip sonra senkronda kopması bu yüzdendi)
  async function call(path, opts = {}) {
    for (;;) {
      try {
        const r = await http(BASE + path, { tries: 4, timeout: 30000, ...opts, headers: headers(), body: opts.body && JSON.stringify(opts.body) });
        modeOk = true;
        return r;
      } catch (e) {
        if (!/HTTP (401|403)/.test(e.message)) throw e;
        if (!modeOk) {
          tried.push(`${MODES[mode][0]} → ${(/HTTP \d{3}\s*(.*)$/.exec(e.message) || [])[1] || e.message}`.slice(0, 160));
          if (mode < MODES.length - 1) { mode++; continue; }
        }
        const fmt = /NOT_FORMAT/i.test(tried.join(' ') + e.message);
        throw new Error(`HTTP ${(/HTTP (\d{3})/.exec(e.message) || [])[1]} — idefix kimliği reddetti. Denenen biçimler: ${tried.join(' · ')}. `
          + (fmt ? 'idefix “VENDOR_TOKEN_NOT_FORMATED” diyor: anahtarı “API KEY:API Secret” çiftinden oluşmuş biçimde bekliyor. '
            + (secret ? 'Panelde kayıtlı API Secret bu API KEY\'e ait değil (eski olabilir): doğru API Secret\'ı girin ya da “Panelde kayıtlı değeri sil” ile silin.'
              : 'idefix → Hesap Bilgilerim → Entegrasyon Bilgileri → “Yeni API Oluştur” dediğinizde API KEY ve API SECRET KEY idefix\'te kayıtlı e-posta adresinize gönderilir; ikisini de girin.')
            : 'Satıcı ID ve API KEY\'i idefix → Hesabım → Entegrasyon Bilgileri\'nden yeniden kopyalayın.'));
      }
    }
  }
  // Sayfalı okuma: sayfa boyutu reddedilirse (400/422) 50'ye, sonra 20'ye düşülür; sayfalar arasında kısa bekleme
  let pageSize = 100;
  async function paged(build, maxPages) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      let rows;
      for (;;) {
        try { rows = list(await call(build(page, pageSize))); break; }
        catch (e) { if (/HTTP (400|422)/.test(e.message) && pageSize > 20) { pageSize = pageSize === 100 ? 50 : 20; continue; } throw e; }
      }
      out.push(...rows);
      if (rows.length < pageSize) break;
      await sleep(250);
    }
    return out;
  }
  const list = (r) => (Array.isArray(r) ? r : (r && (r.items || r.data || r.content || r.products)) || []);
  // Tarih biçimi: yyyy/MM/dd HH:mm:ss (Türkiye saati)
  const fmt = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');

  function norm(s) {
    const a = s.shippingAddress || {}, st = idefixStatus(s.status);
    const items = (s.items || []).map((it) => {
      const qty = num(it.quantity, 1), total = num(it.discountedTotalPrice) || num(it.price ?? it.productPrice) * qty;
      return { lineId: str(it.id || it.orderLineId), sku: str(it.merchantSku || it.erpId), barcode: str(it.barcode), name: str(it.productName || it.title), image: str(it.image || it.productImage).replace('{size}', '300/'), quantity: qty, variantName: (it.productAttributes || []).map((a) => a.attributeValueName).filter(Boolean).join(' / '), unitPrice: qty ? total / qty : total, total,
        status: st === 'cancelled' || st === 'returned' ? st : '', remoteKey: str(it.barcode), commission: it.commissionAmount != null ? num(it.commissionAmount) : null };
    });
    return {
      remoteId: str(s.id), orderNumber: str(s.orderNumber || s.id), orderedAt: Date.parse(s.orderDate || s.createdAt) || Date.now(), remoteStatus: str(s.status), status: st,
      customer: str(s.customerContactName || a.fullName), phone: str(a.phone), email: str(s.customerContactMail || s.customerEmail), customerId: str(s.customerId),
      address: { name: str(a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ')), line: str(a.address1 || a.address), district: str(a.county || a.district), city: str(a.city), phone: str(a.phone) },
      total: items.reduce((x, i) => x + (i.status ? 0 : i.total), 0), currency: 'TRY',
      cargoCompany: str(s.cargoCompany || s.cargoProfileName), tracking: str(s.cargoTrackingNumber || s.cargoKey), trackingUrl: str(s.cargoTrackingUrl || s.trackingUrl),
      shipBy: Date.parse(s.lastShipmentDate || s.estimatedDeliveryDate || '') || null, items,
      packages: [{ remoteId: str(s.id), items: items.map((i) => ({ line_id: i.lineId, qty: i.quantity })), status: ['shipped', 'delivered'].includes(st) ? 'shipped' : 'open', remoteStatus: str(s.status), cargoCompany: str(s.cargoCompany), tracking: str(s.cargoTrackingNumber || s.cargoKey), trackingUrl: str(s.cargoTrackingUrl || s.trackingUrl), packed: st !== 'new' }],
    };
  }

  async function fetchOrders(since, until) {
    const rows = await paged((page, n) => `/oms/${vendor}/list?page=${page}&limit=${n}&startDate=${encodeURIComponent(fmt(since))}&endDate=${encodeURIComponent(fmt(until))}&sortByField=createAt&sortDirection=desc`, 100);
    return rows.map(norm);
  }

  async function fetchListings() {
    const rows = await paged((page, n) => `/pim/pool/${vendor}/list?page=${page}&limit=${n}`, 1000);
    return rows.filter((p) => p.barcode).map((p) => {
      const img = (p.images || p.imageUrls || [])[0], q = p.inventoryQuantity ?? p.quantity ?? p.stock;
      return { remoteId: str(p.barcode), remoteProductId: str(p.productMainId), sku: str(p.vendorStockCode || p.erpId), barcode: str(p.barcode), name: str(p.title), groupName: str(p.title), variantName: '',
        image: str(typeof img === 'string' ? img : img && (img.url || img.imageUrl)), images: imageList(p.images || p.imageUrls), price: num(p.price), listPrice: num(p.comparePrice) || num(p.price),
        // Stok bilgisi gelmezse bilinmiyor sayılır (0 sayılıp eşleştirmeden düşmesin)
        stock: q == null ? null : num(q),
        active: !/reject|archive|passive/i.test(str(p.status)), brand: str(p.brandName) };
    });
  }

  const upload = (items) => call(`/pim/catalog/${vendor}/inventory-upload`, { method: 'POST', body: { items } });
  async function pushStock(items) { for (const part of chunk(items, 1000)) await upload(part.map((x) => ({ barcode: x.remoteId, inventoryQuantity: x.stock }))); }
  async function pushPrice(items) { for (const part of chunk(items, 1000)) await upload(part.map((x) => ({ barcode: x.remoteId, price: x.price, comparePrice: Math.max(x.listPrice || 0, x.price) }))); }

  // İşleme al: "picking" (müşteri artık iptal edemez)
  async function accept(order) {
    for (const p of order.packages.filter((x) => x.remote_id && x.status === 'open')) await call(`/oms/${vendor}/${p.remote_id}/update-shipment-status`, { method: 'POST', body: { status: 'picking' } });
  }
  // Kendi kargo anlaşmasıyla gönderimde takip no bildirilir (paket "kargoda" olur)
  // Kendi kargo anlaşmanızla gönderim: takip no + takip adresi zorunlu (adres, siparişteki kargo firmasıyla uyumlu olmalı)
  const TRACK = [[/yurt/i, 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code='], [/aras/i, 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code='],
    [/mng|dhl/i, 'https://www.mngkargo.com.tr/gonderi-takip/?takipNo='], [/ptt/i, 'https://gonderitakip.ptt.gov.tr/Track/Verify?q='], [/s[üu]rat/i, 'https://suratkargo.com.tr/KargoTakip/?kargotakipno='],
    [/hepsi\s*jet/i, 'https://www.hepsijet.com/gonderi-takibi/'], [/sendeo/i, 'https://sendeo.com.tr/gonderi-takip?code=']];
  async function ship(order, pkg, { tracking }) {
    if (!pkg.remote_id || !tracking) return {};
    const firm = pkg.cargo_company || order.cargo_company || '';
    const t = TRACK.find(([re]) => re.test(firm));
    if (!t) throw new Error(`idefix takip adresi ister: “${firm || 'kargo firması'}” için takip adresi bilinmiyor. Kargo firmasını (Yurtiçi, Aras, MNG, PTT, Sürat, HepsiJet) seçin.`);
    await call(`/oms/${vendor}/${pkg.remote_id}/update-tracking-number`, { method: 'POST', body: { trackingNumber: tracking, trackingUrl: t[1] + encodeURIComponent(tracking) } });
    return {};
  }

  // Tanılama: ürün ve sipariş servisleri ayrı ayrı denenir; HTTP hatası açıklanır (401 anahtar, 403 yetki/IP, 404 satıcı no)
  async function diagnose() {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik ve ürün servisi', async () => { const r = await call(`/pim/pool/${vendor}/list?page=1&limit=1`); return { detail: `erişildi · Satıcı ID ${vendor} · kabul edilen kimlik biçimi: ${MODES[mode][0]} · ${list(r).length ? 'ürün örneği alındı' : 'ürün yok'}` }; });
    await diagStep(out, 'Sipariş servisi (son 24 saat)', async () => { const r = await call(`/oms/${vendor}/list?page=1&limit=1&startDate=${encodeURIComponent(fmt(now - 864e5))}&endDate=${encodeURIComponent(fmt(now))}`); const rows = list(r); return { detail: `erişildi · ${r && (r.totalCount ?? r.total ?? r.totalElements) != null ? (r.totalCount ?? r.total ?? r.totalElements) + ' sipariş' : rows.length + ' sipariş örneği'}${rows[0] ? ` · örnek durum: ${rows[0].status} → ${idefixStatus(rows[0].status)}` : ''}` }; });
    return out;
  }

  // ---------- müşteri soruları: /pim/vendor/{vendor}/question/filter (sayfa 1'den, en fazla 50), cevap: .../question/{id}/answer ----------
  async function questions({ since, until = Date.now(), page = 0, size = 50 }) {
    const r = await call(`/pim/vendor/${vendor}/question/filter?page=${page + 1}&limit=${Math.min(50, size)}&startDate=${since}&endDate=${until}&sort=newest`);
    const list = r.items || r.data || r.questions || r.content || (Array.isArray(r) ? r : []);
    const items = list.map((x) => {
      const a = (x.productQuestionAnswer || x.answers || [])[0];
      const p = x.product && typeof x.product === 'object' ? x.product : { name: x.product };
      return {
        remoteId: String(x.id), text: str(x.question), askedAt: Date.parse(x.createdAt) || num(x.createdAt) || Date.now(),
        status: a ? 'answered' : x.isArchived ? 'other' : 'waiting', remoteStatus: a ? 'answered' : x.isArchived ? 'archived' : 'waiting',
        productName: str(p.name || p.title), productImage: str(p.image || p.imageUrl).replace('{size}', '300/'), barcode: str(p.barcode), customer: x.showMyName === false ? '' : str(x.customerName),
        answer: a ? str(a.answerBody || a.answer_body || a.text) : null, answeredAt: a ? Date.parse(a.createdAt) || null : null,
      };
    });
    return { items, hasNext: page + 1 < num(r.pageCount), total: num(r.totalCount) || items.length };
  }
  async function answer(q, text) { await call(`/pim/vendor/${vendor}/question/${encodeURIComponent(q.remote_id)}/answer`, { method: 'POST', body: { answer_body: text } }); }

  // ---------- Ürün yükleme (Ürün yükle ekranı) ----------
  // Kategori ağacı: /pim/product-category · özellikler (değerleriyle): /pim/category-attribute/{id} · marka: /pim/brand/by-name
  // Ürün oluşturma: /pim/pool/{vendor}/create (istek başına en fazla 200 ürün) → batchRequestId · durum: /pim/pool/{vendor}/batch-result/{id}
  // Not: idefix ürün bilgisi güncellemeyi API'den kabul etmez (yalnız stok / fiyat); kargo etiketi ve hakediş servisi de yoktur.
  let catCache = null;
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) {
      const all = [];
      const walk = (rows, path) => { for (const c of rows || []) { const p = path.concat(str(c.name)); if ((c.subs || []).length) walk(c.subs, p); else all.push({ id: String(c.id), name: str(c.name), path: path.join(' › ') }); } };
      const r = await call('/pim/product-category');
      walk(Array.isArray(r) ? r : list(r), []);
      catCache = { at: Date.now(), all };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  // allowCustom: değer listesi yerine serbest metin (customAttributeValue) gönderilir
  const attrCache = new Map();
  async function rawAttrs(cat) {
    if (!attrCache.has(cat)) attrCache.set(cat, ((await call(`/pim/category-attribute/${encodeURIComponent(cat)}`)) || {}).categoryAttributes || []);
    return attrCache.get(cat);
  }
  const attributes = async (cat) => (await rawAttrs(cat)).map((a) => ({ id: String(a.attributeId), name: str(a.attributeTitle), mandatory: !!a.required,
    kind: a.isVariant ? 'variant' : 'category', type: a.allowCustom && !(a.attributeValues || []).length ? 'text' : 'enum', custom: !!a.allowCustom, multi: false }));
  async function values(cat, attr) {
    const a = (await rawAttrs(cat)).find((x) => String(x.attributeId) === String(attr));
    return ((a && a.attributeValues) || []).map((v) => ({ id: String(v.id), value: str(v.name) }));
  }
  const brands = new Map();
  async function brandId(name) {
    const k = str(name).toLocaleLowerCase('tr');
    if (!k) return null;
    if (!brands.has(k)) {
      let r = null;
      try { r = await call(`/pim/brand/by-name?title=${encodeURIComponent(name)}`); } catch (e) { if (!/HTTP 404/.test(e.message)) throw e; }
      const hit = (Array.isArray(r) ? r : r ? [r] : []).find((b) => str(b.title).toLocaleLowerCase('tr') === k);
      brands.set(k, hit ? hit.id : null);
    }
    return brands.get(k);
  }
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], attrs = [];
    for (const a of await rawAttrs(map.remote_id)) {
      const id = String(a.attributeId), v = (map.attrs || {})[id];
      let valueId = v && v.id, text = v && v.value;
      if (text === '@variant') { const hit = pr.variant && !a.allowCustom ? await pick({ id }, pr.variant) : null; valueId = hit && hit.id; text = hit ? hit.value : pr.variant; }
      if (text === '@image') text = pr.image;
      if (a.allowCustom && text) attrs.push({ attributeId: Number(id), attributeValueId: null, customAttributeValue: String(text) });
      else if (valueId) attrs.push({ attributeId: Number(id), attributeValueId: Number(valueId), customAttributeValue: null });
      else if (a.required) missing.push(str(a.attributeTitle) + (text ? ` (“${text}” listede yok)` : ''));
    }
    const bid = pr.brand ? await brandId(pr.brand) : null;
    if (!pr.brand) missing.push('marka'); else if (!bid) missing.push(`marka “${pr.brand}” idefix'te bulunamadı`);
    if (!pr.barcode) missing.push('barkod');
    if (!pr.sku) missing.push('SKU');
    if (!pr.image) missing.push('görsel');
    if (!(pr.price > 0)) missing.push('fiyat');
    const item = {
      barcode: pr.barcode, title: pr.name, productMainId: pr.group || pr.sku, brandId: bid, categoryId: Number(map.remote_id), inventoryQuantity: pr.stock, vendorStockCode: pr.sku,
      desi: pr.desi || 1, description: pr.description || pr.name, price: pr.price, comparePrice: Math.max(pr.listPrice || 0, pr.price), vatRate: pr.vat ?? 20,
      images: [pr.image, ...(pr.images || []).filter((u) => u !== pr.image)].filter(Boolean).slice(0, 8).map((url) => ({ url })), attributes: attrs,
    };
    if (opts.cargoCompanyId) item.cargoCompanyId = Number(opts.cargoCompanyId);
    if (opts.deliveryDuration) item.deliveryDuration = Number(opts.deliveryDuration);
    return { key: pr.barcode, missing, payload: item };
  }
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 200)) {
      const r = await call(`/pim/pool/${vendor}/create`, { method: 'POST', body: { products: part } });
      if (!r || !r.batchRequestId) throw new Error('idefix batchRequestId döndürmedi: ' + JSON.stringify(r).slice(0, 300));
      refs.push(r.batchRequestId);
    }
    return { ref: refs.join(',') };
  }
  // Ürün durumları: satışa hazır / eşleşti → onay; eksik bilgi / red → hata; inceleme ve eşleşme onayı bekleyenler → bekliyor
  const PST = { ready_for_sale: [true, 'satışa hazır'], auto_matched: [true, 'katalogdaki ürünle eşleşti'], manual_matched: [true, 'eşleştirildi'],
    waiting_catalog_action: [null, 'idefix inceliyor'], not_matched: [null, 'eşleşme yok · idefix operatörü inceliyor'], waiting_vendor_approve: [null, 'eşleşme onayı bekliyor (idefix panelinden onaylayın)'],
    missing_info: [false, 'eksik bilgi'], platform_declined: [false, 'idefix reddetti'], vendor_declined: [false, 'eşleşme reddedildi'], decline: [false, 'reddedildi'] };
  const FAIL_TR = { CATEGORY_MANDATORY_ATTRIBUTE_MISSED: 'zorunlu kategori özelliği eksik', ATTRIBUTE_MULTIPLE_NOT_ALLOWED: 'aynı özellik birden fazla gönderildi', CUSTOM_ATTRIBUTE_NOT_SUPPORTED_YET: 'tanımsız özellik',
    ATTRIBUTEVALUE_NOT_DEFINED: 'tanımsız özellik değeri', BRAND_NOT_EXIST: 'marka idefix\'te yok', VENDOR_RETURN_ADDRESS_NOT_CORRECT: 'iade adresi hatalı', VENDOR_SHIPMENT_ADDRESS_NOT_CORRECT: 'sevkiyat adresi hatalı',
    PRODUCT_IMAGE_MANDATORY_ONCREATE: 'görsel zorunlu', VENDOR_CATEGORY_ACCESS_DENIED: 'kategori yetkisi yok', BRAND_EXCLUSIVE_NOT_AUTHORIZED: 'markada münhasır yetki yok', VENDOR_BRAND_ACCESS_DENIED: 'marka yetkisi yok',
    VENDOR_ACCESS_DENIED: 'satıcı onaylı değil', DATA_PARSE_ERROR: 'istek okunamadı', NO_BATCH_ID_EXIST: 'gönderim kimliği bulunamadı', VENDOR_IN_VACATION_MODE: 'tatil modu açık',
    BRAND_FAILED_TO_MATCH: 'marka katalogdaki ürünle uyuşmuyor', CATEGORY_FAILED_TO_MATCH: 'kategori katalogdaki ürünle uyuşmuyor' };
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const id of String(ref).split(',').filter(Boolean)) {
      const r = await call(`/pim/pool/${vendor}/batch-result/${encodeURIComponent(id)}`);
      if (!/^(completed|failed|cancelled)$/i.test(str(r && r.status))) pending = true;
      for (const p of (r && r.products) || []) {
        const st = str(p.status).toLowerCase(), codes = [].concat(p.failureReasons || []).map((x) => (typeof x === 'string' ? x : x && (x.code || x.message || JSON.stringify(x)))).filter(Boolean);
        // Ürün zaten satıcının havuzunda: bu gönderim için hata sayılmaz (tekrar gönderilmesin)
        if (codes.length && codes.every((c) => c === 'PRODUCT_POOL_ALREADY_EXIST')) { items.push({ key: str(p.barcode), status: 'zaten ürün havuzunda', ok: true, error: '' }); continue; }
        const [ok, tr] = PST[st] || [codes.length ? false : null, st];
        if (ok === null && !codes.length) pending = true;
        items.push({ key: str(p.barcode), status: tr, ok: codes.length ? false : ok, error: codes.map((c) => FAIL_TR[c] || c).join(' · ') || (ok === false ? tr : '') });
      }
    }
    return { done: !pending, items };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const catalog = { categories, allCategories, attributes, values, build, send, status, chunk: 200,
    options: [{ k: 'cargoCompanyId', label: 'Kargo firması ID (isteğe bağlı)' }, { k: 'deliveryDuration', label: 'Kargoya veriliş süresi, gün (isteğe bağlı)' }] };

  // ---------- iade talepleri (claims): /oms/{vendor}/claim-list ----------
  // Her talep kalemi tek adettir; aynı ürün + durum + gerekçe tek satırda toplanır (ids: kalem kimlikleri).
  // Yalnız "waiting_vendor_approve" (depoya ulaştı) kalemler onaylanır / red talebi açılır. Red talebini idefix inceler.
  const CST = { waiting_vendor_approve: 'waiting', approved: 'accepted', decline: 'rejected', ready: 'other', in_cargo: 'other', vendor_decline_request: 'other' };
  const CST_TR = { waiting_vendor_approve: 'Aksiyon bekliyor', approved: 'Onaylandı', decline: 'Reddedildi', ready: 'Oluşturuldu', in_cargo: 'Kargoda', vendor_decline_request: 'Red talebi (idefix inceliyor)' };
  async function claims({ since, until = Date.now(), page = 0 }) {
    const r = await call(`/oms/${vendor}/claim-list?startDate=${encodeURIComponent(fmt(since))}&endDate=${encodeURIComponent(fmt(until))}&page=${page + 1}`);
    const items = list(r).map((c) => {
      const by = new Map();
      for (const it of c.items || []) {
        const st = str(it.state), why = str(it.customerReason || it.platformReason || it.vendorReason);
        const k = `${it.barcode || it.orderLineId}|${st}|${why}`;
        const l = by.get(k) || { id: String(it.id), ids: [], name: str(it.productName), barcode: str(it.barcode), sku: str(it.erpId), image: str(it.productImage).replace('{size}', '300/'), qty: 0,
          price: num(it.discountedTotalPrice ?? it.totalPrice), reason: why, note: [it.customerNote, it.note].map(str).filter(Boolean).join(' · '), status: CST[st] || 'other', remoteStatus: CST_TR[st] || str(it.stateName) || st };
        l.ids.push(String(it.id)); l.qty++;
        by.set(k, l);
      }
      const lines = [...by.values()];
      const status = lines.some((l) => l.status === 'waiting') ? 'waiting' : lines.length && lines.every((l) => l.status === 'accepted') ? 'accepted' : lines.some((l) => l.status === 'rejected') ? 'rejected' : 'other';
      return {
        remoteId: String(c.id), orderNumber: str(c.orderNumber), claimedAt: Date.parse(c.createdAt || '') || Date.now(), status, remoteStatus: [...new Set(lines.map((l) => l.remoteStatus))].join(', '),
        customer: str(c.customerName), reason: [...new Set(lines.map((l) => l.reason).filter(Boolean))].join(', '), note: lines.map((l) => l.note).filter(Boolean).join(' · '),
        lines, amount: lines.reduce((x, l) => x + l.price * l.qty, 0), cargo: str(c.cargoCompanyName), tracking: str(c.cargoTrackingNumber || c.cargoKey),
      };
    });
    // Sayfa parametresi yok sayılırsa aynı sayfa tekrar okunmasın: dönen sayfa no istenenle aynı olmalı
    const cur = r && r.currentPage != null ? num(r.currentPage) : page + 1;
    return { items, hasNext: cur === page + 1 && page + 1 < num(r && r.pageCount), total: num(r && r.totalCount) || items.length };
  }
  const claimIds = (lines) => lines.flatMap((l) => l.ids || [l.id]).map(String);
  async function approveClaim(c, lines) {
    await call(`/oms/${vendor}/${encodeURIComponent(c.remote_id)}/claim-approve`, { method: 'POST', body: { claimLineIds: claimIds(lines) } });
  }
  // Red talebi: görseller yalnız adres (URL) olarak kabul edilir; dosya yükleme servisi yok, ek dosya gönderilmez
  async function rejectClaim(c, lines, { reasonId, text }) {
    await call(`/oms/${vendor}/${encodeURIComponent(c.remote_id)}/claim-decline-request`, { method: 'POST',
      body: { claimLines: claimIds(lines).map((id) => ({ id: Number(id), claimDeclineReasonId: Number(reasonId), description: String(text), images: [] })) } });
  }
  let reasonCache = null;
  async function claimReasons() {
    if (!reasonCache) reasonCache = list(await call('/oms/claim-decline-reasons')).map((x) => ({ id: String(x.id), name: str(x.name) }));
    return reasonCache;
  }

  const missing = ['IDEFIX_API_KEY', 'IDEFIX_API_SECRET', 'IDEFIX_VENDOR_ID'].filter((k) => !env[k]);
  return {
    ...meta, type: 'idefix', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, answer: { min: 2, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose, questions, answer, catalog, claims, claimReasons, approveClaim, rejectClaim,
  };
}
