// Etsy (Open API v3, openapi.etsy.com/v3/application). etsy.com/developers → Your Apps: keystring (API Key) + shared secret.
// Kimlik: OAuth 2 refresh token (kapsamlar: transactions_r transactions_w listings_r listings_w shops_r) → 1 saatlik erişim belirteci.
// Ürün yükleme listings_r + listings_w ister (Listings Tutorial); kargo profili okuma shops_r. listings_d istenmez: panel Etsy'de ilan silmez.
// Kapsam yenileme belirteciyle değişmez: listings_w olmadan yetkilendirilmiş uygulama yeniden yetkilendirilip yeni refresh token girilmeli.
// Her istekte x-api-key: "keystring:shared_secret" (2025'ten beri birleşik biçim zorunlu) + Authorization: Bearer.
// Etsy her yenilemede YENİ refresh token verir: en yenisi kanalın kv deposunda { token, base } olarak saklanır; kullanıcı Entegrasyonlar'da
// başka bir refresh token girerse (base değişir) girilen kazanır.
// Siparişler: shops/{id}/receipts (senkronda son değişiklik, geçmiş aktarımında oluşturulma aralığı). Ürünler: aktif ilanlar + envanter
// (her ürün / varyant bir satır). Stok / fiyat: ilanın tüm envanteri okunur, ilgili satırlar değiştirilip PUT ile geri yazılır.
// Kargoya verme: receipts/{id}/tracking (takip no + kargo firması). İşleme alma panelde. Ürün yükleme var (aşağıda "ürün yükleme");
// etiket, iade yok.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, sleep, diagStep, imageList, budgetLeft } from '../util.js';

const API = 'https://openapi.etsy.com/v3/application';
const money = (p) => (p ? num(p.amount) / (num(p.divisor) || 1) : 0);
const ent = (s) => str(s).replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ON_PROP = ['price_on_property', 'quantity_on_property', 'sku_on_property', 'readiness_state_on_property'];

export function etsy(env, meta) {
  const shop = str(env.ETSY_SHOP_ID), key = str(env.ETSY_API_KEY), base = str(env.ETSY_REFRESH_TOKEN);
  const apiKey = `${key}:${str(env.ETSY_SHARED_SECRET)}`, kv = meta && meta.kv;
  let access = null, exp = 0, refresh = null, pending = null, inc = 'Images,Inventory';

  async function stored() {
    try { const v = kv ? await kv.get('refresh') : null; return v && v.token && v.base === base ? v : null; } catch { return null; }
  }
  async function renew(force) {
    const s = await stored();
    if (!force && s && s.access && s.exp > Date.now()) { access = s.access; exp = s.exp; refresh = s.token; return access; }
    // Sırayla denenir: kayıtlı (en son döndürülmüş) belirteç, bu nesnenin son belirteci, girilen belirteç
    const cands = [s && s.token, refresh, base].filter((t, i, l) => t && l.indexOf(t) === i);
    let err = null;
    for (const t of cands) {
      let r;
      try {
        r = await http('https://api.etsy.com/v3/public/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: key, refresh_token: t }).toString() });
      } catch (e) { err = e; if (e.status === 400 || e.status === 401) continue; throw e; }
      if (!r || !r.access_token) throw new Error('Etsy erişim belirteci alınamadı');
      access = r.access_token; exp = Date.now() + Math.max(60, num(r.expires_in, 3600) - 120) * 1000; refresh = r.refresh_token || t;
      try { if (kv) await kv.set('refresh', { token: refresh, base, access, exp }); } catch { /* saklanamadı: bir sonraki yenilemede yine denenir */ }
      return access;
    }
    throw new Error('Etsy refresh token geçersiz ya da süresi dolmuş; uygulamayı yeniden yetkilendirip yeni refresh token girin' + (err ? ` (${err.message.slice(0, 200)})` : ''));
  }
  async function auth(force) {
    if (!force && access && Date.now() < exp) return access;
    return (pending ||= renew(force).finally(() => { pending = null; }));
  }
  // Gövde: body → JSON; form → application/x-www-form-urlencoded (ilan oluşturma / güncelleme, özellik); data → multipart (görsel; sınırı fetch koyar)
  async function call(path, opts = {}, retried) {
    const headers = { 'x-api-key': apiKey, Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json', Accept: 'application/json' };
    let body = opts.body && JSON.stringify(opts.body);
    if (opts.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(Object.entries(opts.form).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString(); }
    else if (opts.data) { delete headers['Content-Type']; body = opts.data; }
    try { return await http(API + path, { method: opts.method, tries: opts.tries, headers, body }); } catch (e) {
      if (e.status !== 401 || retried) throw e;
      access = null; exp = 0; await auth(true); // belirteç geçersiz kılındı: bir kez yenilenip tekrar denenir
      return call(path, opts, true);
    }
  }

  const keyOf = (lid, pid, sku) => str(sku) || `${lid}:${pid}`;
  function norm(rc) {
    const st = str(rc.status).toLowerCase();
    const status = /^cancel/.test(st) ? 'cancelled' : st === 'fully refunded' ? 'returned' : st === 'completed' || rc.is_shipped ? 'shipped' : 'new';
    const tx = rc.transactions || [];
    const items = tx.map((t) => {
      const qty = num(t.quantity, 1), unit = money(t.price), v = (t.variations || []).map((x) => ent(x.formatted_value)).filter(Boolean).join(' / ');
      return { lineId: str(t.transaction_id), sku: str(t.sku), barcode: '', name: ent(t.title) + (v ? ` (${v})` : ''), image: '', quantity: qty, unitPrice: unit, total: unit * qty,
        status: status === 'cancelled' ? 'cancelled' : '', remoteKey: t.product_id ? keyOf(t.listing_id, t.product_id, t.sku) : str(t.sku || t.listing_id) };
    });
    const sh = [...(rc.shipments || [])].reverse().find((x) => x.tracking_code) || {};
    const due = tx.map((t) => num(t.expected_ship_date)).filter((x) => x > 0);
    // Türkiye adresinde il "state", ilçe "city" alanındadır (state yoksa city il kabul edilir)
    return {
      remoteId: str(rc.receipt_id), orderNumber: str(rc.receipt_id), orderedAt: num(rc.created_timestamp || rc.create_timestamp) * 1000 || Date.now(), remoteStatus: str(rc.status), status,
      customer: str(rc.name), phone: '', email: str(rc.buyer_email), customerId: str(rc.buyer_user_id),
      address: { name: str(rc.name), line: [rc.first_line, rc.second_line, [rc.zip, rc.country_iso === 'TR' ? '' : rc.country_iso].map(str).filter(Boolean).join(' ')].map(str).filter(Boolean).join(', '),
        district: rc.state ? str(rc.city) : '', city: str(rc.state || rc.city), phone: '' },
      total: money(rc.grandtotal) || items.reduce((s, i) => s + i.total, 0), currency: str((rc.grandtotal || {}).currency_code || ((tx[0] || {}).price || {}).currency_code) || 'USD',
      cargoCompany: str(sh.carrier_name), tracking: str(sh.tracking_code), shipBy: due.length ? Math.min(...due) * 1000 : null, items, packages: null,
    };
  }

  // since/until ms. Senkronda son değişiklik (last_modified), geçmiş aktarımında (byOrdered) oluşturulma tarihi aralığı
  async function fetchOrders(since, until, { byOrdered } = {}) {
    const k = byOrdered ? 'created' : 'last_modified', out = [];
    for (let page = 0; page < 50; page++) {
      const r = await call(`/shops/${shop}/receipts?min_${k}=${Math.floor(since / 1000)}&max_${k}=${Math.ceil(until / 1000)}&limit=100&offset=${page * 100}`);
      const rows = (r && r.results) || [];
      out.push(...rows.map(norm));
      if (rows.length < 100 || (r.count != null && (page + 1) * 100 >= num(r.count))) break;
    }
    return out;
  }

  async function listingsPage(offset) {
    try { return await call(`/shops/${shop}/listings?state=active&limit=100&offset=${offset}&includes=${inc}`); } catch (e) {
      if (e.status !== 400 || inc === 'Images') throw e;
      inc = 'Images'; // envanter eklentisi kabul edilmezse ilan başına envanter okunur
      return call(`/shops/${shop}/listings?state=active&limit=100&offset=${offset}&includes=${inc}`);
    }
  }
  async function fetchListings() {
    const out = [], seen = new Set();
    for (let page = 0; page < 100; page++) {
      const r = await listingsPage(page * 100), rows = (r && r.results) || [];
      for (const l of rows) {
        const inv = l.inventory || (await sleep(100), await call(`/listings/${l.listing_id}/inventory`));
        const imgs = [...(l.images || [])].sort((a, b) => num(a.rank) - num(b.rank)).map((i) => i.url_fullxfull || i.url_570xN);
        for (const p of ((inv && inv.products) || []).filter((x) => !x.is_deleted)) {
          const o = (p.offerings || []).find((x) => !x.is_deleted) || {};
          let id = str(p.sku);
          if (!id || seen.has(id)) id = `${l.listing_id}:${p.product_id}`;
          seen.add(id);
          const variant = (p.property_values || []).map((v) => (v.values || []).map(ent).join('/')).filter(Boolean).join(' / ');
          out.push({ remoteId: id, remoteProductId: str(l.listing_id), sku: str(p.sku), barcode: '', name: ent(l.title) + (variant ? ` (${variant})` : ''), groupName: ent(l.title), variantName: variant,
            image: str(imgs[0]), images: imageList(imgs), price: money(o.price) || money(l.price), listPrice: money(o.price) || money(l.price), stock: num(o.quantity),
            active: l.state === 'active' && o.is_enabled !== false });
        }
      }
      if (rows.length < 100 || (r.count != null && (page + 1) * 100 >= num(r.count))) break;
    }
    return out;
  }

  // Envanter yazımı: ilanın tüm ürünleri (salt okunur alanlar çıkarılarak) geri gönderilir. Değer özelliğe göre değişmiyorsa
  // (ör. quantity_on_property boş) Etsy tüm varyantlarda aynı değeri ister: o zaman değer ilanın tüm satırlarına yazılır.
  // Sonuç ilan ilan: { done, errors }. İlana özgü ret (400 / 404 / 409) yalnız o ilanın satırlarına yazılır; hiçbiri gönderilemeden
  // bağlantı / yetki hatası atılır (sonradan gelirse kalan ilanlara hata yazılır, yalnız onlar yeniden denenir).
  async function writeInventory(items, prop, apply) {
    const by = new Map(), out = { done: [], errors: [] }, fail = (x, error) => out.errors.push({ remoteId: x.remoteId, error: 'Etsy: ' + error });
    for (const x of items) {
      const lid = str(x.remoteProductId) || (/^\d+:\d+$/.test(str(x.remoteId)) ? str(x.remoteId).split(':')[0] : '');
      if (!lid) { fail(x, 'ilan numarası yok'); continue; }
      by.set(lid, [...(by.get(lid) || []), x]);
    }
    let n = 0;
    for (const [lid, list] of by) {
      if (n++) await sleep(150);
      try {
        const inv = await call(`/listings/${lid}/inventory`);
        const products = (inv.products || []).filter((p) => !p.is_deleted).map((p) => ({
          _id: p.product_id, sku: str(p.sku),
          property_values: (p.property_values || []).map((v) => ({ property_id: v.property_id, value_ids: v.value_ids || [], scale_id: v.scale_id ?? null, property_name: v.property_name, values: v.values || [] })),
          offerings: (p.offerings || []).filter((o) => !o.is_deleted).map((o) => ({ price: money(o.price), quantity: num(o.quantity), is_enabled: o.is_enabled !== false,
            ...(o.readiness_state_id != null ? { readiness_state_id: o.readiness_state_id } : {}) })),
        }));
        const shared = !(inv[prop] || []).length && products.length > 1, sent = [];
        for (const x of list) {
          const hit = products.filter((p) => (p.sku && p.sku === str(x.remoteId)) || `${lid}:${p._id}` === str(x.remoteId));
          if (!hit.length) { fail(x, 'ilanda bulunamadı'); continue; }
          for (const p of shared ? products : hit) for (const o of p.offerings) apply(o, x);
          sent.push(x);
        }
        if (!sent.length) continue;
        const body = { products: products.map(({ _id, ...p }) => p) };
        for (const k of ON_PROP) if (Array.isArray(inv[k])) body[k] = inv[k];
        await call(`/listings/${lid}/inventory`, { method: 'PUT', body });
        out.done.push(...sent.map((x) => x.remoteId));
      } catch (e) {
        if (e.budget || (![400, 404, 409].includes(e.status) && !out.done.length)) throw e;
        for (const x of list) if (!out.errors.some((y) => y.remoteId === x.remoteId)) fail(x, String(e.message).replace(/^Etsy: /, ''));
      }
    }
    return out;
  }
  const pushStock = (items) => writeInventory(items, 'quantity_on_property', (o, x) => { o.quantity = Math.min(999, Math.max(0, Math.round(num(x.stock)))); });
  const pushPrice = (items) => writeInventory(items, 'price_on_property', (o, x) => { o.price = Math.round(num(x.price) * 100) / 100; });

  // Kargoya ver: takip no + kargo firması (Etsy alıcıya bildirim gönderir)
  async function ship(order, pkg, { cargoCompany, tracking }) {
    if (!tracking) throw new Error('Etsy: kargoya vermek için takip numarası girin');
    await call(`/shops/${shop}/receipts/${encodeURIComponent(order.remote_id)}/tracking`, { method: 'POST', body: { tracking_code: str(tracking), carrier_name: str(cargoCompany) || 'other' } });
    return { tracking };
  }

  // ---------- ürün yükleme ----------
  // Kaynak: Listings Tutorial (developers.etsy.com/documentation/tutorials/listings) ve Etsy OpenAPI şemasından (etsy.com/openapi/generated/oas/3.0.0.json)
  // üretilmiş etsy-ts 8.0.1 paketi (dist/api/ShopListing*.d.ts, SellerTaxonomy.d.ts, ShopShippingProfile.d.ts, ShopReturnPolicy.d.ts,
  // ShopProcessingProfiles.d.ts, data-contracts.d.ts). Akış (ürün başına, belgeye göre):
  //  1. createDraftListing  POST /shops/{shop}/listings (form): quantity, title, description, price, who_made, when_made, taxonomy_id zorunlu;
  //     fiziksel üründe shipping_profile_id ve readiness_state_id (hazırlık / processing profile) zorunlu; who_made ↔ is_supply ↔ when_made birlikte.
  //  2. uploadListingImage  POST /shops/{shop}/listings/{id}/images (multipart "image" + rank). Yayındaki ilan en az 1 görsel ister; ilanda en çok 20.
  //  3. updateListingProperty PUT /shops/{shop}/listings/{id}/properties/{property_id} (form: value_ids, values, scale_id).
  //  4. updateListingInventory PUT /listings/{id}/inventory (JSON): SKU, fiyat, adet, readiness_state_id (tek ürün, varyasyonsuz).
  //  5. updateListing PATCH /shops/{shop}/listings/{id} (form) state=active: yayına alır (görsel şart). return_policy_id aktif fiziksel ilanda
  //     zorunludur (AB'de kurulu mağazalar hariç).
  // Kategori: getSellerTaxonomyNodes (ağaç; ürün yaprak düğüme açılır), özellikler getPropertiesByTaxonomyId (is_required, possible_values, scales).
  // Satıcının beyan etmesi gerekenler (who_made, when_made, is_supply) ve kargo / hazırlık / iade profili kanal ayarıdır (options): kullanıcı
  // yazmadan hiçbiri varsayılanla doldurulmaz. Belgede varsayılan profil kuralı yok: mağazada tek kargo profili olsa da kendiliğinden
  // kullanılmaz, eksik metninde önerilir. Panel ürünü (her varyant) ayrı ilan olur; SKU envantere yazılır, ilan listesinde (fetchListings)
  // SKU ile tanınır: key = SKU. Etsy sonucu senkron verir: gönderim kanalın kv deposunda sıraya alınır, send ilk birkaç ürünü, her status
  // sorgusu sıradaki ürünleri işler (ürün başına 5-25 istek; istekler arası en az 200 ms; Rate Limits: QPS / QPD aşımında 429 + retry-after).
  // Yarım kalan ürün (geçici hata / istek bütçesi) kaldığı adımdan sürer; ilan iki kez açılmaz.
  const WHO = ['i_did', 'someone_else', 'collective'];
  const WHEN = /^(made_to_order|\d{4}_\d{4}|before_\d{4}|\d{4}s)$/; // şemadaki değerler: made_to_order, 2020_2026, 2010_2019 … 1700s, before_1700
  const OPT = {
    who_made: 'Etsy: ürünü kim yaptı (i_did = ben, someone_else = başka biri, collective = ekibim)',
    when_made: 'Etsy: ürün ne zaman yapıldı (made_to_order = siparişe göre, 2020_2026, 2010_2019, … before_1700)',
    is_supply: 'Etsy: ürün malzeme / sarf mı (evet = malzeme, hayır = bitmiş ürün)',
    shipping_profile_id: 'Etsy kargo profili numarası (shipping_profile_id)',
    readiness_state_id: 'Etsy hazırlık profili numarası (processing profile, readiness_state_id)',
    return_policy_id: 'Etsy iade politikası numarası (return_policy_id; AB\'de kurulu mağaza “yok” yazabilir)',
    fx_rate: 'Kur: Etsy mağazanızın para birimi TL değilse 1 birimi kaç TL (ör. 41,25)',
  };
  const options = Object.entries(OPT).map(([k, label]) => ({ k, label }));
  const why = (e) => str((e && e.data && (e.data.error || e.data.message)) || (e && e.message)).replace(/^(GET|POST|PUT|PATCH|DELETE) \S+: /, '').slice(0, 400);
  // Geçici hata: bağlantı, 429 (hız sınırı), 5xx, istek bütçesi → ürün sırada kalır, sonraki sorguda kaldığı adımdan sürer
  const temp = (e) => !!e.budget || e.status === 429 || e.status >= 500 || (!e.status && !/HTTP 4\d\d/.test(String(e.message)));
  // Açıklama: Etsy description düz metindir (HTML işlenmez): satır sonları korunur, etiketler atılır
  const plain = (h) => ent(str(h).replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => (+n === 39 ? m : String.fromCodePoint(+n)))).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  let taxCache = null;
  async function categories(q) {
    if (!taxCache || Date.now() - taxCache.at > 6 * 3600e3) {
      const all = [];
      const walk = (n, names) => {
        const kids = n.children || [];
        if (!kids.length) all.push({ id: String(n.id), name: str(n.name), path: names.join(' › ') });
        for (const c of kids) walk(c, [...names, str(n.name)]);
      };
      for (const n of ((await call('/seller-taxonomy/nodes')) || {}).results || []) walk(n, []);
      taxCache = { at: Date.now(), all };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: taxCache.all.length, items: taxCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const allCategories = async () => { await categories(''); return taxCache.all; };
  const propCache = new Map();
  async function rawAttrs(cat) {
    if (!propCache.has(cat)) {
      const r = await call(`/seller-taxonomy/nodes/${encodeURIComponent(cat)}/properties`);
      // İlana yalnız supports_attributes özellikleri yazılabilir (updateListingProperty); zorunlu olan her durumda gösterilir
      propCache.set(cat, ((r && r.results) || []).filter((a) => a.supports_attributes || a.is_required));
    }
    return propCache.get(cat);
  }
  const attributes = async (cat) => (await rawAttrs(cat)).map((a) => ({ id: String(a.property_id), name: str(a.display_name || a.name), mandatory: !!a.is_required,
    kind: 'category', type: 'enum', custom: false, multi: !!a.is_multivalued }));
  async function values(cat, attr) {
    const a = (await rawAttrs(cat)).find((x) => String(x.property_id) === String(attr));
    const scales = new Map(((a && a.scales) || []).map((s) => [s.scale_id, str(s.display_name)]));
    // Değerin kimliği yoksa (value_id null) ilana yazılamaz; birden çok ölçek varsa (ör. ayakkabı numarası US / EU / UK) ölçek adı eklenir
    return ((a && a.possible_values) || []).filter((v) => v.value_id != null).map((v) => ({ id: String(v.value_id), value: str(v.name) + (scales.size > 1 && scales.get(v.scale_id) ? ` · ${scales.get(v.scale_id)}` : '') }));
  }

  // Mağaza bilgisi (para birimi) ve profiller: 10 dk önbellek; okunamazsa (yetki / bağlantı) profil numarası denetlenmez, Etsy kendisi denetler
  const cached = new Map();
  async function once(k, fn) {
    const c = cached.get(k);
    if (c && Date.now() - c.at < 600e3) return c.v;
    const v = await fn();
    cached.set(k, { at: Date.now(), v });
    return v;
  }
  const shopInfo = () => once('shop', () => call(`/shops/${shop}`));
  const PROFILES = {
    shipping_profile_id: async () => (((await call(`/shops/${shop}/shipping-profiles`)) || {}).results || []).filter((x) => !x.is_deleted)
      .map((x) => ({ id: str(x.shipping_profile_id), name: str(x.title) || str(x.origin_country_iso) })),
    readiness_state_id: async () => {
      const out = [];
      for (let off = 0; off < 500; off += 100) {
        const rows = (((await call(`/shops/${shop}/readiness-state-definitions?limit=100&offset=${off}`)) || {}).results) || [];
        out.push(...rows.map((x) => ({ id: str(x.readiness_state_id), name: [str(x.readiness_state), str(x.processing_days_display_label)].filter(Boolean).join(' · ') })));
        if (rows.length < 100) break;
      }
      return out;
    },
    return_policy_id: async () => (((await call(`/shops/${shop}/policies/return`)) || {}).results || [])
      .map((x) => ({ id: str(x.return_policy_id), name: x.accepts_returns ? `iade ${num(x.return_deadline)} gün` : x.accepts_exchanges ? 'yalnız değişim' : 'iade yok' })),
  };
  const profiles = (k) => once(k, PROFILES[k]).catch((e) => { if (e.budget) throw e; return null; });
  const fmt = (x) => `${x.id} “${x.name}”`;
  const hint = (list) => (!list ? '' : !list.length ? ' — mağazanızda tanımlı değil (Etsy\'de oluşturun)'
    : list.length === 1 ? ` — mağazanızda tek kayıt var: ${fmt(list[0])} (kullanmak için Kanal ayarlarına yazın)` : ` — mağazanızdakiler: ${list.slice(0, 6).map(fmt).join(', ')}`);
  const supply = (v) => (/^(evet|e|true|1|malzeme|supply)$/i.test(str(v)) ? true : /^(hay[ıi]r|h|false|0|bitmi[şs]|finished)$/i.test(str(v)) ? false : null);

  async function build(pr, map, { opts, pick } = {}) {
    const o = opts || {}, missing = [];
    const sku = str(pr.sku);
    if (!sku) missing.push('SKU');
    // Başlık: harf, rakam, noktalama, matematik sembolü, boşluk, ™ © ® (regex şemada); %, :, & ve + en fazla birer kez
    const title = str(pr.name).replace(/\s+/g, ' ');
    if (!title) missing.push('ürün adı');
    const bad = [...new Set(title.match(/[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/gu) || [])];
    if (bad.length) missing.push(`ürün adında Etsy'nin kabul etmediği karakter var (${bad.map((c) => `“${c}”`).join(' ')})`);
    for (const ch of '%:&+') if (title.split(ch).length > 2) missing.push(`ürün adında “${ch}” Etsy'de en fazla bir kez kullanılabilir`);
    // Fiyat mağazanın para biriminde gönderilir (currency_code); TL değilse kullanıcının girdiği kurla çevrilir
    const cur = str((await shopInfo()).currency_code).toUpperCase(), rate = num(o.fx_rate), tl = num(pr.price);
    const price = Math.round((cur === 'TRY' ? tl : rate > 0 ? tl / rate : 0) * 100) / 100;
    if (!(tl > 0)) missing.push('fiyat');
    else if (cur !== 'TRY' && !(rate > 0)) missing.push(`${OPT.fx_rate} — mağazanızın para birimi ${cur || 'bilinmiyor'}`);
    else if (!(price > 0)) missing.push(`fiyat (${cur} ile 0'a yuvarlanıyor)`);
    const quantity = Math.max(0, Math.round(num(pr.stock)));
    if (quantity < 1) missing.push('stok (Etsy en az 1 adet ister)');
    const images = [...new Set([pr.image, ...(pr.images || [])].map(str).filter((u) => /^https?:\/\//i.test(u)))].slice(0, 20);
    if (!images.length) missing.push('görsel');
    // Satıcı beyanları
    const who = str(o.who_made).toLowerCase(), when = str(o.when_made).toLowerCase(), sup = supply(o.is_supply);
    if (!who) missing.push(OPT.who_made); else if (!WHO.includes(who)) missing.push(`${OPT.who_made}: “${o.who_made}” geçersiz`);
    if (!when) missing.push(OPT.when_made); else if (!WHEN.test(when)) missing.push(`${OPT.when_made}: “${o.when_made}” geçersiz`);
    if (str(o.is_supply) === '') missing.push(OPT.is_supply); else if (sup == null) missing.push(`${OPT.is_supply}: “${o.is_supply}” geçersiz`);
    // Profiller: numara mağazanın listesinde olmalı (liste okunabildiyse); iade politikası AB mağazasında "yok"
    const ids = {};
    for (const k of ['shipping_profile_id', 'readiness_state_id', 'return_policy_id']) {
      const v = str(o[k]);
      if (k === 'return_policy_id' && /^yok$/i.test(v)) continue;
      const list = await profiles(k);
      if (!v) { missing.push(OPT[k] + hint(list)); continue; }
      if (!/^\d+$/.test(v)) { missing.push(`${OPT[k]}: “${v}” numara olmalı`); continue; }
      if (list && !list.some((x) => x.id === v)) { missing.push(`${OPT[k]}: “${v}” mağazanızda yok${hint(list)}`); continue; }
      ids[k] = Number(v);
    }
    // Özellikler: değer Etsy listesinden (value_id); varyanttan okunacaksa ürünün varyant adıyla eşleşen değer
    const props = [];
    for (const a of await rawAttrs(map.remote_id)) {
      const id = String(a.property_id), v = (map.attrs || {})[id], list = (a.possible_values || []).filter((x) => x.value_id != null);
      let pv = null;
      if (v && v.value === '@variant') { const hit = pr.variant && pick ? await pick({ id }, pr.variant) : null; pv = hit && list.find((x) => String(x.value_id) === String(hit.id)); }
      else if (v) pv = list.find((x) => v.id && String(x.value_id) === String(v.id)) || list.find((x) => v.value && str(x.name).toLocaleLowerCase('tr') === str(v.value).toLocaleLowerCase('tr'));
      if (pv) props.push({ property_id: a.property_id, value_ids: [pv.value_id], values: [str(pv.name)], ...(pv.scale_id ? { scale_id: pv.scale_id } : {}) });
      else if (a.is_required) {
        const name = str(a.display_name || a.name), text = v && v.value;
        missing.push(name + (!list.length ? ' (Etsy bu özellik için değer listesi vermiyor; ilanı Etsy panelinden açın)' : text === '@variant' ? (pr.variant ? ` (varyant “${pr.variant}” Etsy listesinde yok)` : ' (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)') : text ? ` (“${text}” Etsy listesinde yok)` : ''));
      }
    }
    const listing = { quantity, title, description: plain(pr.description) || title, price, who_made: who, when_made: when, is_supply: sup, taxonomy_id: Number(map.remote_id),
      type: 'physical', shipping_profile_id: ids.shipping_profile_id, readiness_state_id: ids.readiness_state_id, return_policy_id: ids.return_policy_id };
    return { key: sku, missing, payload: { key: sku, listing, images, props, sku, price, quantity, readiness_state_id: ids.readiness_state_id ?? null } };
  }

  // ---- gönderim kuyruğu (kv): "up:<id>" başlık { at, parts, lock }, "up:<id>:<n>" en çok 25 ürün [{ p: yük, st: adım durumu }]
  const mem = new Map();
  const jget = async (k) => (kv ? kv.get(k) : structuredClone(mem.get(k) ?? null));
  const jset = async (k, v) => (kv ? kv.set(k, v) : mem.set(k, structuredClone(v)));
  const PART = 25, STEP = 8, FIRST = 3, GAP = 200;
  let lastCall = 0;
  async function paced(path, opts) {
    const w = lastCall + GAP - Date.now();
    if (w > 0) await sleep(w);
    try { return await call(path, opts); } finally { lastCall = Date.now(); }
  }
  async function download(u) {
    const res = await http(u, { raw: true, timeout: 30000 });
    const type = str(res.headers.get('content-type')).split(';')[0];
    if (!/^image\//i.test(type)) { res.body?.cancel().catch(() => {}); throw new Error(`HTTP 415 görsel değil (${type || 'tür yok'})`); }
    const name = decodeURIComponent((new URL(u).pathname.split('/').pop() || 'image').slice(0, 80)) || 'image';
    return { blob: new Blob([await res.arrayBuffer()], { type }), name };
  }
  // Tek ürün: adımlar sırayla, her adımdan sonra durum st'ye yazılır. Dönüş 'stop' = geçici hata (ürün sırada kalır)
  async function one(it, save) {
    const p = it.p, st = it.st;
    try {
      if (!st.listing && st.createAt) {
        // Önceki oluşturma isteği cevapsız kaldı (bağlantı / 5xx): Etsy ilanı yine de açmış olabilir; aynı başlıklı yeni taslak varsa o kullanılır
        const r = await paced(`/shops/${shop}/listings?state=draft&limit=100`);
        const hit = ((r && r.results) || []).find((l) => ent(l.title) === p.listing.title && num(l.created_timestamp || l.creation_timestamp) * 1000 >= st.createAt - 120e3);
        if (hit) { st.listing = String(hit.listing_id); await save(); }
      }
      if (!st.listing) {
        st.createAt = Date.now(); await save();
        const r = await paced(`/shops/${shop}/listings`, { method: 'POST', form: p.listing, tries: 1 });
        if (!r || !r.listing_id) throw Object.assign(new Error('Etsy ilan numarası dönmedi'), { status: 400 });
        st.listing = String(r.listing_id); await save();
      }
      for (let i = num(st.img); i < p.images.length; i = st.img = i + 1) {
        let f;
        try { f = await download(p.images[i]); } catch (e) { if (temp(e)) throw e; (st.warn ||= []).push(`görsel ${i + 1} indirilemedi (${why(e).slice(0, 80)})`); continue; }
        const fd = new FormData();
        fd.append('image', f.blob, f.name); fd.append('rank', String(num(st.up) + 1));
        try { await paced(`/shops/${shop}/listings/${st.listing}/images`, { method: 'POST', data: fd, tries: 1 }); st.up = num(st.up) + 1; } catch (e) {
          if (temp(e) || e.status === 401 || e.status === 403) throw e;
          (st.warn ||= []).push(`görsel ${i + 1}: ${why(e).slice(0, 120)}`);
        }
      }
      if (!num(st.up)) throw Object.assign(new Error(`görsel yüklenemedi${st.warn ? ` (${st.warn.join(' · ')})` : ''}; Etsy yayındaki ilanda en az bir görsel ister`), { status: 400 });
      for (let i = num(st.prop); i < p.props.length; i = st.prop = i + 1) {
        const x = p.props[i];
        await paced(`/shops/${shop}/listings/${st.listing}/properties/${x.property_id}`, { method: 'PUT', form: { value_ids: x.value_ids.join(','), values: x.values.join(','), scale_id: x.scale_id } });
      }
      if (!st.inv) {
        await paced(`/listings/${st.listing}/inventory`, { method: 'PUT', body: {
          products: [{ sku: p.sku, property_values: [], offerings: [{ price: p.price, quantity: p.quantity, is_enabled: true, readiness_state_id: p.readiness_state_id }] }],
          price_on_property: [], quantity_on_property: [], sku_on_property: [], readiness_state_on_property: [] } });
        st.inv = true;
      }
      if (!st.act) { await paced(`/shops/${shop}/listings/${st.listing}`, { method: 'PATCH', form: { state: 'active' } }); st.act = true; }
      st.ok = true;
    } catch (e) {
      if (temp(e) && (e.budget || (st.tries = num(st.tries) + 1) < 5)) { st.last = why(e); return 'stop'; }
      st.ok = false;
      st.error = `Etsy: ${why(e)}${st.listing && !st.act ? ` · Etsy'de taslak ilan #${st.listing} açıldı: düzeltip Etsy panelinden tamamlayın ya da silin (ürünü yeniden göndermek ikinci ilan açar)` : ''}`;
    }
    return '';
  }
  async function parts(id, head) { const out = []; for (let i = 0; i < head.parts; i++) out.push((await jget(`up:${id}:${i}`)) || []); return out; }
  // Sıradaki ürünler işlenir (en çok `limit` ürün, ~20 sn, istek bütçesi). Aynı gönderimi aynı anda tek işlem yürütür (kilit 2 dk)
  async function work(id, limit) {
    const hk = 'up:' + id, head = await jget(hk);
    if (!head) return null;
    if (head.lock && head.lock.until > Date.now()) return { head, list: await parts(id, head) };
    const tok = Math.random().toString(36).slice(2);
    head.lock = { tok, until: Date.now() + 120e3 };
    await jset(hk, head);
    const chk = await jget(hk);
    if (!chk || !chk.lock || chk.lock.tok !== tok) return { head, list: await parts(id, head) };
    const list = await parts(id, head), dirty = new Set(), t0 = Date.now();
    let n = 0;
    try {
      out: for (let pi = 0; pi < list.length; pi++) {
        for (const it of list[pi]) {
          if (it.st.ok != null) continue;
          if (n >= limit || Date.now() - t0 > 20e3 || budgetLeft() < 60) break out;
          n++; dirty.add(pi);
          if ((await one(it, () => jset(`up:${id}:${pi}`, list[pi]))) === 'stop') break out;
        }
      }
      // Hepsi sonuçlandıysa yükler (açıklama, görsel adresleri) silinir; sonuç kalır
      if (list.every((x) => x.every((it) => it.st.ok != null))) for (let pi = 0; pi < list.length; pi++) { list[pi] = list[pi].map((it) => ({ p: { key: it.p.key }, st: it.st })); dirty.add(pi); }
    } finally {
      for (const pi of dirty) await jset(`up:${id}:${pi}`, list[pi]);
      head.lock = null;
      await jset(hk, head);
    }
    return { head, list };
  }
  function results(r) {
    if (!r) return { done: true, items: [] }; // kuyruk kaydı yok (silinmiş): sonuç verilemez
    const items = r.list.flat().map(({ p, st }) => (st.ok === true ? { key: p.key, ok: true, status: `Etsy'de yayında (ilan #${st.listing})${st.warn ? ` · ${st.warn.join(' · ')}` : ''}`, error: '' }
      : st.ok === false ? { key: p.key, ok: false, status: 'Etsy kabul etmedi', error: st.error }
        : { key: p.key, ok: null, status: st.listing ? `Etsy'ye yükleniyor (ilan #${st.listing})` : 'Etsy\'ye gönderilmek üzere sırada', error: st.last ? `son deneme: ${st.last}` : '' }));
    return { done: items.every((x) => x.ok != null), items };
  }
  async function send(payloads) {
    await auth(); // kimlik hatası gönderimden önce görünsün (hiçbir ilan açılmadan)
    const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), seen = new Set(), rows = [];
    for (const p of payloads) {
      const dup = seen.has(p.key);
      seen.add(p.key);
      rows.push({ p, st: dup ? { ok: false, error: `Etsy: aynı SKU (${p.key}) bu gönderimde birden çok üründe var` } : {} });
    }
    const groups = [];
    for (let i = 0; i < rows.length; i += PART) groups.push(rows.slice(i, i + PART));
    for (let i = 0; i < groups.length; i++) await jset(`up:${id}:${i}`, groups[i]);
    await jset('up:' + id, { at: Date.now(), parts: groups.length, lock: null });
    // İlk birkaç ürün hemen; kalanlar Durumu sorgula / senkronda. Kuyruk kaydedildikten sonra hata atılmaz (ref kaybolmasın)
    try { await work(id, FIRST); } catch { /* sonraki sorguda sürer */ }
    return { ref: id };
  }
  const status = async (ref) => results(await work(String(ref), STEP));
  const catalog = { categories, allCategories, attributes, values, build, send, status, options };

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik (OAuth belirteci)', async () => { const s = await stored(); await auth(); return { detail: `alındı · refresh token: ${s ? 'panelin sakladığı (yenilenmiş)' : 'girilen'}` }; });
    await diagStep(out, 'Mağaza', async () => {
      const r = await call(`/shops/${shop}`), part = [];
      // Ürün yükleme: kanal ayarlarına yazılacak profil numaraları (okunamazsa atlanır)
      for (const [k, name] of [['shipping_profile_id', 'kargo profilleri'], ['readiness_state_id', 'hazırlık profilleri'], ['return_policy_id', 'iade politikaları']]) {
        const list = await profiles(k).catch(() => null);
        if (list) part.push(`${name}: ${list.length ? list.slice(0, 8).map(fmt).join(', ') : 'yok'}`);
      }
      return { detail: [`${str(r.shop_name)} · ${str(r.currency_code)} · ${num(r.listing_active_count)} aktif ilan`, ...part].join(' · ') };
    });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const r = await call(`/shops/${shop}/receipts?min_created=${Math.floor((now - 864e5) / 1000)}&limit=1`); return { detail: `${num(r.count)} sipariş` }; });
    await diagStep(out, 'İlanlar / envanter', async () => {
      const r = await call(`/shops/${shop}/listings?state=active&limit=1`), l = (r.results || [])[0];
      if (l) await call(`/listings/${l.listing_id}/inventory`);
      return { detail: `${num(r.count)} aktif ilan${l ? ' · envanter okundu' : ''}` };
    });
    if (orderId) await diagStep(out, 'Sipariş', async () => ({ detail: JSON.stringify(await call(`/shops/${shop}/receipts/${encodeURIComponent(orderId)}`)).slice(0, 600) }));
    return out;
  }

  const missing = ['ETSY_SHOP_ID', 'ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_REFRESH_TOKEN'].filter((k) => !env[k]);
  return {
    ...meta, type: 'etsy', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose, catalog,
  };
}
