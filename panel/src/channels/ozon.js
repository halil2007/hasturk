// Ozon (Seller API, api-seller.ozon.ru). Satıcı paneli (seller.ozon.ru) → Ayarlar → Seller API → Client ID + API anahtarı (rol: Admin ya da
// en az "Siparişler (FBS)", "Ürünler", "Fiyatlar ve stoklar"). Kimlik: her istekte "Client-Id" + "Api-Key" başlıkları (OAuth yok). Hepsi POST + JSON.
// Siparişler: FBS / rFBS gönderileri (posting) — panelde her gönderi bir sipariştir (posting_number). POST /v3/posting/fbs/list
// (senkronda filter.last_changed_status_date, geçmiş aktarımında filter.since/to = işleme alınma tarihi; aralık en çok 1 yıl, offset sayfalama, has_next).
// Alıcı adı / adresi yalnız rFBS'de (customer.address) gelir; Ozon lojistiğiyle giden FBS'de adres ve telefon verilmez.
// Tutar: ürün satırlarının fiyatı × adedi; para birimi satırın currency_code değeri (satıcı hesabının para birimi, çevrilmez).
// Ürünler: /v3/product/list (last_id sayfalama) → /v3/product/info/list (1000'erli; ad, barkod, görsel, fiyat, FBS stoku).
// Stok: /v2/products/stocks (100'erli; depo no zorunlu: girilmediyse hesapta tek FBS deposu varsa o kullanılır). Fiyat: /v1/product/import/prices (1000'erli).
// İşleme al: /v4/posting/fbs/ship ("Topla": gönderi awaiting_packaging → awaiting_deliver, etiket hazırlanır). Etiket: /v2/posting/fbs/package-label (PDF).
// Kargoya ver: FBS'de kurye Ozon'un (panel yalnız toplanmış olduğunu garanti eder); rFBS'de takip no girildiyse tracking-number/set + delivering.
// Ürün yükleme (Ürün yükle / Kanallarda yayınla): /v1/description-category/* (kategori ağacı, özellikler, değerler) → /v3/product/import (100'erli)
// → /v1/product/import/info (task_id ile sonuç). İade, soru-cevap yok. Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, diagStep, imageList, toB64, sleep, DEAD_LINE, rankBrands, brandKey } from '../util.js';

const API = 'https://api-seller.ozon.ru';
const STATUS = { awaiting_registration: 'new', acceptance_in_progress: 'new', awaiting_approve: 'new', awaiting_packaging: 'new', awaiting_verification: 'new',
  awaiting_deliver: 'processing', arbitration: 'processing', client_arbitration: 'processing',
  driver_pickup: 'shipped', delivering: 'shipped', sent_by_seller: 'shipped', delivered: 'delivered', cancelled: 'cancelled', not_accepted: 'cancelled' };
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const PAGE = 50; // DOĞRULA: belgelerde /v3/posting/fbs/list limit üst sınırı 1000 olarak da geçiyor; 50 her iki durumda geçerli
const SYNC_DAYS = 30; // senkron: son 30 günde işleme alınmış gönderilerin durum değişiklikleri

export function ozon(env, meta) {
  const cid = str(env.OZON_CLIENT_ID), key = str(env.OZON_API_KEY);
  const headers = { 'Client-Id': cid, 'Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' };
  const call = (path, body, opts = {}) => http(API + path, { method: 'POST', headers, body: JSON.stringify(body || {}), tries: 3, ...opts });

  // ---------- siparişler (FBS gönderileri) ----------
  function norm(p) {
    const st = str(p.status), status = STATUS[st] || 'new', c = p.customer || {}, a = c.address || {}, ad = p.addressee || {}, an = p.analytics_data || {};
    const items = (p.products || []).map((x) => {
      const qty = num(x.quantity, 1) || 1, unit = num(x.price);
      return { lineId: str(x.sku), sku: str(x.offer_id), barcode: '', name: str(x.name), image: '', quantity: qty, unitPrice: unit, total: unit * qty,
        status: status === 'cancelled' ? 'cancelled' : '', remoteKey: str(x.offer_id) };
    });
    const name = str(c.name || ad.name), dm = p.delivery_method || {};
    return {
      remoteId: str(p.posting_number), orderNumber: str(p.posting_number), orderedAt: Date.parse(p.in_process_at) || Date.now(),
      remoteStatus: st + (p.substatus && p.substatus !== st ? ` / ${p.substatus}` : ''), status,
      customer: name, phone: str(c.phone || ad.phone), email: '', customerId: c.customer_id ? str(c.customer_id) : '',
      address: { name, line: [a.address_tail, a.zip_code].map(str).filter(Boolean).join(', '), district: str(a.district), city: str(a.city || an.city || a.region || an.region), phone: str(c.phone || ad.phone) },
      total: items.reduce((s, i) => s + i.total, 0), currency: str(((p.products || [])[0] || {}).currency_code) || 'RUB',
      cargoCompany: str(dm.tpl_provider || an.tpl_provider), tracking: str(p.tracking_number), shipBy: Date.parse(p.shipment_date) || null, items, packages: null,
    };
  }

  // since/until ms. Senkronda son durum değişikliği (last_changed_status_date), geçmiş aktarımında (byOrdered) işleme alınma tarihi aralığı.
  // DOĞRULA: filter.since/to zorunlu kabul edildi; senkronda since = bitişten 30 gün öncesi, durum değişikliği süzgeci ayrıca uygulanır.
  async function fetchOrders(since, until, { byOrdered } = {}) {
    const filter = byOrdered ? { since: iso(since), to: iso(until) }
      : { since: iso(Math.min(since, until - SYNC_DAYS * 864e5)), to: iso(until), last_changed_status_date: { from: iso(since), to: iso(until) } };
    const out = [];
    for (let page = 0; page < 100; page++) {
      const r = (await call('/v3/posting/fbs/list', { dir: 'ASC', filter, limit: PAGE, offset: page * PAGE, with: { analytics_data: true, financial_data: false } })) || {};
      const res = r.result || {}, rows = res.postings || [];
      out.push(...rows.map(norm));
      if (!res.has_next || !rows.length) break;
    }
    return out;
  }
  async function fetchOne(id) {
    const r = (await call('/v3/posting/fbs/get', { posting_number: str(id), with: { analytics_data: true } })) || {};
    if (!r.result) throw new Error('Ozon: gönderi bulunamadı');
    return norm(r.result);
  }

  // ---------- ürünler ----------
  const cache = new Map(); // offer_id → { product_id, currency }
  async function fetchListings() {
    const ids = [];
    let last = '';
    for (let page = 0; page < 200; page++) {
      const r = ((await call('/v3/product/list', { filter: { visibility: 'ALL' }, last_id: last, limit: 1000 })) || {}).result || {};
      const rows = r.items || [];
      ids.push(...rows.filter((x) => !x.archived).map((x) => x.product_id));
      last = str(r.last_id);
      if (!last || rows.length < 1000) break;
    }
    const out = [];
    for (const part of chunk(ids, 1000)) {
      const r = (await call('/v3/product/info/list', { product_id: part })) || {};
      for (const p of r.items || []) {
        const price = num(p.price), old = num(p.old_price), images = imageList([...(p.primary_image || []), ...(p.images || [])]);
        // FBS / rFBS stoku: depodaki miktar (present). Gönderim de bu miktarı yazar (/v2/products/stocks "stock"; rezerveyi Ozon düşer):
        // okunan ile gönderilen aynı temelde karşılaştırılır (önceden present − reserved okunuyordu, rezerve olan her ilan her senkronda yeniden gönderiliyordu)
        const fbs = ((p.stocks && p.stocks.stocks) || []).filter((s) => /fbs/i.test(str(s.source)));
        cache.set(str(p.offer_id), { product_id: p.id, currency: str(p.currency_code) });
        out.push({ remoteId: str(p.offer_id), remoteProductId: str(p.id), sku: str(p.offer_id), barcode: str((p.barcodes || [])[0] || p.barcode), name: str(p.name), groupName: str(p.name), variantName: '',
          image: images[0] || '', images, price, listPrice: Math.max(old, price), stock: fbs.reduce((t, s) => t + Math.max(0, num(s.present)), 0),
          active: !p.is_archived && !p.is_autoarchived && p.visible !== false && !(p.visibility_details && p.visibility_details.active_product === false) });
      }
    }
    return out;
  }

  // Depo: girilmediyse hesabın FBS depoları okunur; tek (etkin) depo varsa o kullanılır
  let wh = str(env.OZON_WAREHOUSE_ID);
  const warehouses = async () => (((await call('/v1/warehouse/list', {})) || {}).result || []).filter((w) => !/disabled|blocked|archived/i.test(str(w.status)));
  async function warehouse() {
    if (wh) return wh;
    const list = await warehouses();
    if (list.length === 1) return (wh = str(list[0].warehouse_id));
    throw new Error(list.length ? `Ozon: ${list.length} FBS deposu var (${list.slice(0, 5).map((w) => `${w.name} ${w.warehouse_id}`).join(', ')}); Entegrasyonlar'da stok deposu numarasını girin` : 'Ozon: hesapta FBS deposu bulunamadı');
  }
  // Satır sonuçları ilan ilan: { done, errors } (yalnız reddedilen ilan yeniden denenir). Hiçbiri gönderilemeden bağlantı / yetki hatası: atılır.
  const rowErr = (x) => (x.errors || []).map((e) => e.message || e.code).join(' · ') || 'güncellenmedi';
  async function send(items, size, gap, request) {
    const out = { done: [], errors: [] };
    for (const [i, part] of chunk(items, size).entries()) {
      if (i && gap) await sleep(gap);
      let r;
      try { r = await request(part); } catch (e) {
        if (!out.done.length || e.budget) throw e;
        out.errors.push(...part.map((x) => ({ remoteId: x.remoteId, error: e.message })));
        continue;
      }
      const bad = new Map(((r && r.result) || []).filter((x) => x.updated === false || (x.errors || []).length).flatMap((x) => [[str(x.offer_id), rowErr(x)], [str(x.product_id), rowErr(x)]]));
      for (const x of part) {
        const err = bad.get(str(x.remoteId || x.sku)) || (x.remoteProductId && bad.get(str(x.remoteProductId)));
        if (err) out.errors.push({ remoteId: x.remoteId, error: 'Ozon: ' + err }); else out.done.push(x.remoteId);
      }
    }
    return out;
  }

  // Stok: 100'erli; aynı ürün-depo için 2 dakikada bir güncellenebilir (Ozon TOO_MANY_REQUESTS satır hatası döner)
  async function pushStock(items) {
    const w = Number(await warehouse());
    // dakikada 80 istek sınırı: parçalar arası 800 ms
    return send(items, 100, 800, (part) => call('/v2/products/stocks', { stocks: part.map((x) => {
      const id = str(x.remoteId || x.sku), c = cache.get(id), pid = num((c && c.product_id) || x.remoteProductId);
      return { offer_id: id, ...(pid ? { product_id: pid } : {}), stock: Math.max(0, Math.round(num(x.stock))), warehouse_id: w };
    }) }));
  }
  // Fiyat: liste fiyatı satış fiyatından büyükse old_price (üstü çizili), değilse old_price "0" (sıfırlanır). Fiyat saatte en çok 10 kez değişebilir.
  async function pushPrice(items) {
    return send(items, 1000, 0, (part) => call('/v1/product/import/prices', { prices: part.map((x) => {
      const id = str(x.remoteId || x.sku), c = cache.get(id), pid = num((c && c.product_id) || x.remoteProductId), sale = Math.round(num(x.price) * 100) / 100, list = Math.round(num(x.listPrice) * 100) / 100;
      return { offer_id: id, ...(pid ? { product_id: pid } : {}), price: String(sale), old_price: list > sale ? String(list) : '0', ...(c && c.currency ? { currency_code: c.currency } : {}), auto_action_enabled: 'UNKNOWN' };
    }) }));
  }

  // ---------- gönderi işlemleri ----------
  // İşleme al ("Topla"): tüm ürünler tek pakette. DOĞRULA: paket ürününde product_id alanına gönderideki Ozon SKU'su yazılır (belgedeki örnek bu biçimde).
  async function pack(order) {
    const products = (order.items || []).filter((i) => !DEAD_LINE(i.status) && i.line_id).map((i) => ({ product_id: num(i.line_id), quantity: Math.max(1, Math.round(num(i.quantity, 1))) }));
    if (!products.length) throw new Error('Ozon: toplanacak ürün yok');
    await call('/v4/posting/fbs/ship', { packages: [{ products }], posting_number: str(order.remote_id), with: { additional_data: false } });
  }
  async function accept(order) {
    if (order.remote_status && !/^awaiting_packaging/.test(str(order.remote_status))) return;
    await pack(order);
  }
  // Kargoya ver: toplanmamışsa önce toplanır. rFBS (satıcının kendi kargosu): takip no Ozon'a yazılır ve gönderi "teslimatta" yapılır.
  async function ship(order, pkg = {}, { tracking } = {}) {
    if (/^awaiting_packaging/.test(str(order.remote_status))) await pack(order);
    const id = str(order.remote_id), tn = str(tracking || pkg.tracking);
    if (!tn) return {};
    const r = (await call('/v2/fbs/posting/tracking-number/set', { tracking_numbers: [{ posting_number: id, tracking_number: tn }] })) || {};
    const bad = (r.result || []).find((x) => x.result === false || (x.error || []).length);
    if (bad) throw new Error(`Ozon takip numarasını kabul etmedi: ${(bad.error || []).join(' · ') || 'reddedildi'}`);
    const d = (await call('/v2/fbs/posting/delivering', { posting_number: [id] })) || {};
    const bd = (d.result || []).find((x) => x.result === false || (x.error || []).length);
    if (bd) throw new Error(`Ozon gönderiyi "teslimatta" yapmadı: ${(bd.error || []).join(' · ') || 'reddedildi'}`);
    return { tracking: tn };
  }
  // Etiket (PDF): toplandıktan 45–60 sn sonra hazır olur; hazır değilse bekleme bildirilir
  async function label(order, pkg = {}) {
    let res;
    try { res = await http(`${API}/v2/posting/fbs/package-label`, { method: 'POST', headers, body: JSON.stringify({ posting_number: [str(order.remote_id)] }), raw: true }); } catch (e) {
      if (/not.?ready|NOT_READY|awaiting_deliver|POSTINGS_NOT/i.test(e.message)) return { pending: 'Ozon etiketi hazırlıyor (toplandıktan 45–60 sn sonra hazır olur); biraz sonra tekrar deneyin.', step: 'waiting' };
      throw e;
    }
    const filename = `ozon-${order.remote_id}-${pkg.no || 1}.pdf`;
    if (/pdf|octet/i.test(res.headers.get('content-type') || '')) return { label: { format: 'pdf', data: toB64(new Uint8Array(await res.arrayBuffer())), filename } };
    const j = await res.json().catch(() => ({})); // DOĞRULA: bazı istemciler JSON (file_content, base64) biçimini bekliyor
    if (j && j.file_content) return { label: { format: 'pdf', data: str(j.file_content), filename } };
    throw new Error('Ozon etiketi alınamadı');
  }

  // ---------- ürün yükleme ----------
  // Kaynak: Ozon Seller API OpenAPI şemasından üretilmiş istemciler (docs.ozon.ru bu ortamdan açılmadı), çapraz doğrulandı:
  //   generated-ozon-seller-api-client@1.0.0 (dist/OzonSellerAPI.d.ts: V1GetTreeResponseItem, V1GetAttributesResponseAttribute,
  //   V1GetAttributeValuesRequest/Response, V1SearchAttributeValuesRequest, V3ImportProductsRequestItem, GetImportProductsInfoResponseResultItem),
  //   artefactby-ozon-seller-api@0.18.0 (dist/index.d.ts: aynı uçların örnek istek / cevapları), @seller-sdk/ozon@0.3.2
  //   (dist/endpoints/category/*, product/import/{create,get-status}), daytona-ozon-seller-api@2.2.17 (last_value_id sayfalama).
  // Kategori: /v1/description-category/tree. Ürün yalnız son düzeydeki "tür" (type_id) düğümüne açılır; düğüm description_category_id taşımaz,
  //   üstündeki kategorinin kimliğiyle birlikte kullanılır. Paneldeki tek kimlik "<description_category_id>:<type_id>" (ikisi de pozitif tam sayı).
  //   disabled = true: o kategoride ürün oluşturulamaz (atlanır).
  // Dil: istekler language = TR (şemadaki LanguageLanguage: DEFAULT, RU, EN, TR, ZH_HANS; varsayılan Rusça). Çevirisi olmayan ad / değer Ozon'un
  //   döndürdüğü gibi (ör. Rusça) gösterilir; değer kimliği (dictionary_value_id) dilden bağımsızdır.
  // Özellik: dictionary_id 0 değilse değer listeden seçilir (/v1/description-category/attribute/values, en çok 2000'lik sayfa, last_value_id = önceki
  //   sayfanın son kimliği, has_next). is_aspect (aynı modelin ürünlerini ayıran özellik: renk, beden…) → varyant özelliği. attribute_complex_id 0
  //   değilse özellik complex_attributes içinde (complex_id ile) gönderilir.
  // Üründen dolan özellikler (kategori eşleştirmesinde sorulmaz): 8229 tür (type_id gönderilince gerekmez: V3ImportProductsRequestItem.type_id
  //   açıklaması), 85 marka (attribute/values örneğinde marka sözlüğü; Kanallarda yayınla'da kategori başına aranır), 4180 ürün adı ve 4191 açıklama
  //   (/v4/product/info/attributes örnek cevabında 4180 = name, 4191 = açıklama metni), 9048 model adı (aynı 9048 değerini alan kartlar Ozon'da tek
  //   kartta birleşir — /v3/product/import açıklaması): ürünün varyant grubu kodu. Bunlar yalnız kategorinin özellik listesinde varsa gönderilir.
  // /v3/product/import: istekte en çok 100 ürün; ürünün tüm bilgisi (özellikler, barkod, görsel, gerçek paket ölçüleri ve ağırlığı — 0 olamaz,
  //   boş bırakılamaz —, fiyat, para birimi) gönderilir. Görsel: JPG / PNG bağlantısı, ana görsel (primary_image) + en çok 29 görsel. Para birimi
  //   hesabın para birimiyle aynı olmalı (RUB, BYN, KZT, EUR, USD, CNY). KDV: 0, 0.05, 0.07, 0.1, 0.2, 0.22. offer_id en çok 50, ad en çok 500 karakter.
  //   Sınır aşımı: 429 (dakikalık) / item_limit_exceeded (günlük). Cevap yalnız task_id; ürün ürün sonuç /v1/product/import/info
  //   (pending · imported · failed · skipped; errors[]). Onaylanan ürün /v3/product/list'te offer_id ile görünür: key = offer_id = panel SKU'su.
  const LANG = 'TR';
  const OWN = { TYPE: 8229, BRAND: 85, NAME: 4180, DESC: 4191, MODEL: 9048 };
  const VATS = ['0', '0.05', '0.07', '0.1', '0.2', '0.22'], CURS = ['RUB', 'EUR', 'USD', 'CNY']; // TCMB kuru olanlar (BYN / KZT için kur yok: fiyat çevrilemez)
  const catIds = (id) => {
    const m = /^(\d+):(\d+)$/.exec(str(id));
    if (!m) throw new Error(`Ozon kategori kimliği geçersiz (“${str(id).slice(0, 40)}”): kategoriyi yeniden seçin`);
    return { description_category_id: Number(m[1]), type_id: Number(m[2]) };
  };
  let catCache = null;
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) {
      const all = [];
      const walk = (nodes, path, dc) => {
        for (const n of nodes || []) {
          if (n.disabled) continue;
          if (num(n.type_id) > 0) { if (dc) all.push({ id: `${dc}:${n.type_id}`, name: str(n.type_name), path: path.join(' › ') }); continue; }
          walk(n.children, [...path, str(n.category_name)].filter(Boolean), num(n.description_category_id) || dc);
        }
      };
      walk(((await call('/v1/description-category/tree', { language: LANG })) || {}).result, [], 0);
      catCache = { at: Date.now(), all };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const attrCache = new Map();
  async function rawAttrs(cat) {
    if (!attrCache.has(cat)) attrCache.set(cat, ((await call('/v1/description-category/attribute', { ...catIds(cat), language: LANG })) || {}).result || []);
    return attrCache.get(cat);
  }
  const isBrand = (a) => num(a.id) === OWN.BRAND;
  const ownAttr = (a) => Object.values(OWN).includes(num(a.id));
  const attributes = async (cat) => (await rawAttrs(cat)).filter((a) => !ownAttr(a)).map((a) => ({ id: String(a.id), name: str(a.name), mandatory: !!a.is_required,
    kind: a.is_aspect ? 'variant' : 'category', type: num(a.dictionary_id) ? 'enum' : str(a.type).toLowerCase() || 'text', custom: !num(a.dictionary_id), multi: !!a.is_collection }));
  // Değer listesi: 2000'lik sayfalar, en çok 10 sayfa (çok büyük sözlüklerde ilk 20 000 değer)
  const valCache = new Map();
  async function values(cat, attr) {
    const a = (await rawAttrs(cat)).find((x) => String(x.id) === String(attr));
    if (!a || !num(a.dictionary_id)) return [];
    const ck = `${cat}|${attr}`;
    if (!valCache.has(ck)) {
      const out = [];
      let last = 0;
      for (let page = 0; page < 10; page++) {
        const r = (await call('/v1/description-category/attribute/values', { ...catIds(cat), attribute_id: num(a.id), language: LANG, limit: 2000, ...(last ? { last_value_id: last } : {}) })) || {};
        const rows = r.result || [];
        out.push(...rows.map((v) => ({ id: String(v.id), value: str(v.value) })));
        if (!r.has_next || !rows.length) break;
        last = num(rows[rows.length - 1].id);
      }
      valCache.set(ck, out);
    }
    return valCache.get(ck);
  }
  // Marka: kategorinin marka özelliğinde arama (/v1/description-category/attribute/values/search: en az 2 karakter, en çok 100 sonuç)
  const brandHits = new Map();
  async function findBrands(q, cat) {
    const k = str(q);
    if (!cat || k.length < 2) return [];
    const a = (await rawAttrs(cat)).find(isBrand);
    if (!a) return [];
    const ck = `${cat}|${k}`;
    if (!brandHits.has(ck)) brandHits.set(ck, (((await call('/v1/description-category/attribute/values/search', { ...catIds(cat), attribute_id: num(a.id), value: k, limit: 100 })) || {}).result || []).map((v) => ({ id: String(v.id), name: str(v.value) })));
    return brandHits.get(ck);
  }
  const searchBrands = async (q, cat) => rankBrands(await findBrands(q, cat), str(q));
  // KDV seçeneği: "20", "%20", "0,2" → "0.2"; Ozon'un kabul ettiği oranlardan biri değilse boş
  const vatOf = (v) => { const s = str(v).replace(/[%\s]/g, '').replace(',', '.'); if (!s || !Number.isFinite(Number(s))) return ''; const x = Number(s) > 1 ? Number(s) / 100 : Number(s); return VATS.find((o) => Math.abs(Number(o) - x) < 1e-9) || ''; };
  const money = (v) => String(Math.round(num(v) * 100) / 100);
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], attrs = [], complex = new Map(), vals = map.attrs || {};
    const add = (a, values) => {
      const row = { id: num(a.id), complex_id: num(a.attribute_complex_id), values };
      if (row.complex_id) complex.set(row.complex_id, [...(complex.get(row.complex_id) || []), row]); else attrs.push(row);
    };
    for (const a of await rawAttrs(map.remote_id)) {
      const id = String(a.id), v = vals[id], dict = !!num(a.dictionary_id), name = str(a.name);
      if (num(a.id) === OWN.TYPE) continue; // type_id alanı gönderilir
      if (!v && isBrand(a)) {
        let bid = str(pr.brandId), bname = str(pr.brand);
        if (!bid && bname) { const hit = (await findBrands(bname, map.remote_id)).find((b) => brandKey(b.name) === brandKey(bname)); if (hit) { bid = hit.id; bname = hit.name; } }
        if (bid) add(a, [{ dictionary_value_id: num(bid), value: bname }]);
        else if (a.is_required) missing.push(bname ? `marka “${bname}” Ozon'da bulunamadı` : 'marka');
        continue;
      }
      if (!v && num(a.id) === OWN.NAME) { if (pr.name) add(a, [{ value: str(pr.name).slice(0, 500) }]); continue; }
      if (!v && num(a.id) === OWN.DESC) { if (pr.description) add(a, [{ value: pr.description }]); continue; }
      if (!v && num(a.id) === OWN.MODEL) { if (str(pr.group)) add(a, [{ value: str(pr.group) }]); else if (a.is_required) missing.push(name); continue; }
      let valueId = v && v.id, text = v && v.value;
      if (text === '@variant') { const hit = pr.variant && pick ? await pick({ id }, pr.variant) : null; valueId = hit && hit.id; text = hit ? hit.value : dict ? '' : str(pr.variant); }
      else if (text === '@image') text = pr.image;
      if (dict && valueId) add(a, [{ dictionary_value_id: num(valueId), value: str(text) }]);
      else if (!dict && str(text)) add(a, [{ value: str(text) }]);
      // Zorunlu özellik: seçilmemiş / değer Ozon listesinde yok (liste özelliğinde kimlik gerekir) / varyanttan okunacak ama varyant listede yok
      else if (a.is_required) missing.push(name + (v && v.value === '@variant' ? (pr.variant ? ` (varyant “${pr.variant}” Ozon listesinde yok)` : ' (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)') : v && str(v.value) ? ` (“${v.value}” Ozon listesinde yok)` : ''));
    }
    if (!pr.sku) missing.push('SKU'); else if (str(pr.sku).length > 50) missing.push('SKU (Ozon en çok 50 karakter kabul eder)');
    if (!pr.name) missing.push('ürün adı');
    if (!(pr.price > 0)) missing.push('fiyat');
    // Görsel: yalnız JPG / PNG (uzantısız bağlantı kabul edilir; .webp, .gif… gönderilmez)
    const all = imageList([pr.image, ...(pr.images || [])], 40);
    const imgs = all.filter((u) => { const ext = (/\.([a-z0-9]{2,5})$/i.exec(u.split(/[?#]/)[0]) || [])[1]; return !ext || /^(jpe?g|png)$/i.test(ext); }).slice(0, 30);
    if (!imgs.length) missing.push(all.length ? 'görsel (Ozon yalnız JPG / PNG kabul eder)' : 'görsel');
    // Paket ölçüleri ve ağırlığı: gerçek değer zorunlu (0 ya da boş olamaz). Panelde en / boy / yükseklik alanı yok: desiden türetilmez.
    // pr.width / pr.height / pr.length (cm) gelirse milimetreye çevrilir. Ağırlık panelde kg: grama çevrilir (Ozon tam sayı ister).
    const mm = (v) => Math.round(num(v) * 10), w = mm(pr.width), h = mm(pr.height), d = mm(pr.length);
    if (!(w > 0 && h > 0 && d > 0)) missing.push('paket ölçüleri (en, boy, yükseklik)');
    const g = Math.round(num(pr.weight) * 1000);
    if (!(g > 0)) missing.push('ağırlık (kg)');
    const vat = vatOf(opts.vat), cur = str(opts.currency).toUpperCase();
    // Boş seçenek "(Ürün yükle → Ozon seçenekleri)" ekiyle; geçersiz değer eksiz (her ekranda gönderimi engeller)
    if (str(opts.vat) === '') missing.push('KDV oranı (Ürün yükle → Ozon seçenekleri)');
    else if (!vat) missing.push(`KDV oranı “${str(opts.vat)}” geçersiz (0, 5, 7, 10, 20 ya da 22; Ozon seçeneklerinden düzeltin)`);
    if (!cur) missing.push('para birimi (Ürün yükle → Ozon seçenekleri)');
    else if (!CURS.includes(cur)) missing.push(`para birimi “${cur}” geçersiz (${CURS.join(', ')}; Ozon seçeneklerinden düzeltin)`);
    // Fiyat catalog.js'te TCMB kuruyla hesap para birimine çevrilmiş gelir (catalog.currency; pr.currency); çevrilmemiş TL fiyat gönderilmez
    else if (str(pr.currency || 'TRY').toUpperCase() !== cur) missing.push(`fiyat para birimi (${str(pr.currency || 'TRY').toUpperCase()}; Ozon hesabınız ${cur})`);
    const sale = num(pr.price), list = Math.max(num(pr.listPrice), sale);
    const item = {
      offer_id: str(pr.sku), name: str(pr.name).slice(0, 500), ...(pr.barcode ? { barcode: str(pr.barcode) } : {}), ...catIds(map.remote_id),
      price: money(sale), ...(list > sale ? { old_price: money(list) } : {}), currency_code: cur, vat,
      height: h, width: w, depth: d, dimension_unit: 'mm', weight: g, weight_unit: 'g',
      primary_image: imgs[0] || '', images: imgs.slice(1, 30), attributes: attrs,
      ...(complex.size ? { complex_attributes: [...complex.values()].map((x) => ({ attributes: x })) } : {}),
    };
    return { key: str(pr.sku), missing, payload: item };
  }
  // Gönderim: istekte en çok 100 ürün. Kayıt: "<task_id>:<offer_id,…>" parçaları ";" ile (offer_id URL kodlu). İlk parça kabul edilmezse hata
  // atılır; sonraki bir parça reddedilirse o parçanın ürünleri "0:<offer_id,…>:<hata>" olarak kaydedilir (gönderilenlerin takibi kaybolmasın).
  // Yazma isteği sonucu belirsizken tekrarlanmaz (tries: 1).
  async function sendProducts(items) {
    const refs = [];
    for (const part of chunk(items, 100)) {
      const keys = part.map((x) => encodeURIComponent(x.offer_id)).join(',');
      try {
        const task = str((((await call('/v3/product/import', { items: part }, { tries: 1 })) || {}).result || {}).task_id);
        if (!/^\d+$/.test(task) || task === '0') throw new Error('Ozon görev numarası (task_id) vermedi');
        refs.push(`${task}:${keys}`);
      } catch (e) {
        if (e.budget) throw e;
        if (!refs.length) throw new Error(e.message.replace(/^POST \S+: /, ''));
        refs.push(`0:${keys}:${encodeURIComponent(e.message.replace(/^POST \S+: /, '').slice(0, 300))}`);
      }
    }
    return { ref: refs.join(';') };
  }
  const errText = (x) => [...new Set((x.errors || []).map((e) => [str(e.attribute_name), str(e.description || e.message || e.code)].filter(Boolean).join(': ')).filter(Boolean))].join(' · ');
  async function importStatus(ref) {
    const items = [];
    let pending = false;
    for (const part of String(ref).split(';').filter(Boolean)) {
      const [task, k = '', err = ''] = part.split(':'), keys = k.split(',').filter(Boolean).map(decodeURIComponent);
      if (task === '0') { for (const key of keys) items.push({ key, ok: false, status: 'Ozon\'a gönderilemedi', error: decodeURIComponent(err) || 'gönderilemedi' }); continue; }
      const r = ((await call('/v1/product/import/info', { task_id: Number(task) })) || {}).result || {};
      const rows = new Map((r.items || []).map((x) => [str(x.offer_id), x]));
      if (!rows.size || [...rows.values()].some((x) => !x.status || x.status === 'pending')) { pending = true; continue; }
      for (const key of keys) {
        const x = rows.get(key);
        if (!x) { items.push({ key, ok: false, status: 'Ozon sonuç vermedi', error: 'Ozon bu ürün için sonuç vermedi' }); continue; }
        if (x.status === 'imported') items.push({ key, ok: true, status: 'Ozon\'a yüklendi (Ozon onayı bekliyor)', error: '' });
        else if (x.status === 'skipped') items.push({ key, ok: true, status: 'Ozon\'da zaten aynı (değişiklik yok)', error: '' });
        else items.push({ key, ok: false, status: 'Ozon kabul etmedi', error: errText(x) || `Ozon durumu: ${str(x.status) || 'bilinmiyor'}` });
      }
    }
    return { done: !pending, items };
  }
  const raw = async (ref) => call('/v1/product/import/info', { task_id: Number(String(ref).split(/[;:]/)[0]) });
  // Hesap para birimi kanal seçeneğinden: panel fiyatı (TL) catalog.js'te TCMB kuruyla buna çevrilir
  const currency = (opts = {}) => { const c = str(opts.currency).toUpperCase(); return CURS.includes(c) ? c : ''; };
  const catalog = { categories, allCategories, attributes, values, build, send: sendProducts, status: importStatus, raw, brands: searchBrands, brandByCategory: true, chunk: 100, currency,
    options: [{ k: 'vat', label: 'Ozon KDV oranı (%): 0, 5, 7, 10, 20 ya da 22' }, { k: 'currency', label: 'Ozon hesap para birimi (RUB, CNY, USD, EUR): panel fiyatı TCMB kuruyla bu para birimine çevrilir' }] };

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const ok = await diagStep(out, 'Kimlik (Client-Id + Api-Key) · depolar', async () => { const w = await warehouses(); return { detail: `bağlantı kuruldu · ${w.length} FBS deposu${w.length ? ': ' + w.slice(0, 5).map((x) => `${x.name} (${x.warehouse_id})`).join(', ') : ''}${wh ? ` · seçili depo ${wh}` : ''}` }; });
    if (!ok) { out.push({ name: 'İpucu', ok: null, detail: '401/403: Client ID ya da API anahtarı hatalı veya anahtarın rolü yetersiz. seller.ozon.ru → Ayarlar → Seller API: anahtarı Admin rolüyle oluşturun.' }); return out; }
    await diagStep(out, 'Gönderiler (son 7 gün, FBS)', async () => {
      const r = ((await call('/v3/posting/fbs/list', { dir: 'DESC', filter: { since: iso(now - 7 * 864e5), to: iso(now) }, limit: 1, offset: 0 })) || {}).result || {}, p = (r.postings || [])[0];
      return { detail: p ? `erişildi · örnek ${p.posting_number}: ${p.status} → ${STATUS[p.status] || 'new'}` : 'erişildi · gönderi yok' };
    });
    await diagStep(out, 'Ürünler', async () => { const r = ((await call('/v3/product/list', { filter: { visibility: 'ALL' }, last_id: '', limit: 1 })) || {}).result || {}; return { detail: `${num(r.total)} ürün` }; });
    if (orderId) await diagStep(out, `Gönderi ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `${o.items.length} ürün · ${o.remoteStatus} → ${o.status}${o.tracking ? ` · takip ${o.tracking}` : ''}` }; });
    return out;
  }

  const missing = ['OZON_CLIENT_ID', 'OZON_API_KEY'].filter((k) => !str(env[k]));
  return {
    ...meta, type: 'ozon', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: 'remote', createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchOne, fetchListings, pushStock, pushPrice, accept, ship, label, diagnose, catalog,
  };
}
