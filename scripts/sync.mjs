// ikas → public/products.json
// Çalıştırma: node scripts/sync.mjs
// Gerekli ortam değişkenleri (GitHub > Settings > Secrets and variables > Actions):
//   IKAS_STORE          mağaza adı (panel adresindeki: <IKAS_STORE>.myikas.com)
//   IKAS_CLIENT_ID      özel uygulamanın client id'si
//   IKAS_CLIENT_SECRET  özel uygulamanın client secret'ı
// İsteğe bağlı:
//   IKAS_MERCHANT_ID    görsel adresleri için (bulunamazsa API'den denenir)
//   IKAS_SALES_CHANNEL_ID  sadece bu satış kanalındaki ürünleri al
//   MOCK=1              API'ye gitmeden örnek veriyle çalış (test için)
//   TRENDS_URL          ziyaretçi eğilimi özeti (varsayılan: Worker'ın /trends adresi); TRENDS_FILE ile yerel dosya
//   ORDER_DAYS          satış analizinde bakılacak gün (varsayılan 60)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'products.json');
const API = 'https://api.myikas.com/api/v1/admin/graphql';
const REPORT = join(ROOT, 'docs', 'trend-raporu.md');
const env = process.env;
const TRENDS_URL = env.TRENDS_URL || 'https://hasturk-arama.halilc2007.workers.dev/trends';

// ---------- yardımcılar ----------
const die = (msg) => { console.error('HATA: ' + msg); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  for (const k of ['IKAS_STORE', 'IKAS_CLIENT_ID', 'IKAS_CLIENT_SECRET']) if (!env[k]) die(`${k} tanımlı değil`);
  const res = await fetch(`https://${env.IKAS_STORE}.myikas.com/api/admin/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.IKAS_CLIENT_ID,
      client_secret: env.IKAS_CLIENT_SECRET,
    }),
  });
  const body = await res.text();
  if (!res.ok) die(`Token alınamadı (${res.status}): ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  if (!json.access_token) die('Token cevabında access_token yok: ' + body.slice(0, 300));
  return json.access_token;
}

let TOKEN;
async function gql(query, variables = {}, tries = 3) {
  for (let i = 1; ; i++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ query, variables }),
    });
    if ((res.status === 429 || res.status >= 500) && i < tries) { await sleep(1500 * i); continue; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.errors) {
      const err = new Error((json.errors || []).map((e) => e.message).join(' | ') || `HTTP ${res.status}`);
      err.gql = true;
      throw err;
    }
    return json.data;
  }
}

// Şemada olmayan isteğe bağlı bir alan varsa onu çıkarıp tekrar dener.
async function gqlFlexible(build, optional, variables) {
  const active = { ...optional };
  for (;;) {
    try {
      return { data: await gql(build(active), variables), active };
    } catch (e) {
      const msg = e.message.toLowerCase();
      const bad = Object.keys(active)
        .sort((a, b) => b.length - a.length)
        .find((k) => active[k] && [k, ...(ALIASES[k] || [])].some((s) => msg.includes(s.toLowerCase())));
      if (!e.gql || !bad) throw e;
      console.warn(`UYARI: "${bad}" alanı alınamadı, onsuz devam ediliyor. (${e.message.slice(0, 160)})`);
      active[bad] = '';
    }
  }
}

// Hata mesajında geçebilecek tip adları
const ALIASES = {
  metaData: ['HTMLMetaData'],
  tags: ['SimpleProductTag', 'ProductTag'],
  brand: ['SimpleProductBrand', 'ProductBrand'],
  productVariantTypes: ['ProductVariantType'],
  variantValueIds: ['VariantValueRelation'],
  bundleSettings: ['ProductBundleSettings', 'ProductBundleProduct', 'bundle'],
};

// ---------- veri çekme ----------
const PRODUCT_OPTIONAL = {
  metaData: 'metaData { slug }',
  tags: 'tags { id name }',
  brand: 'brand { id name }',
  hiddenSalesChannelIds: 'hiddenSalesChannelIds',
  salesChannelIds: 'salesChannelIds',
  productVariantTypes: 'productVariantTypes { variantTypeId variantValueIds }',
  variantValueIds: 'variantValueIds { variantTypeId variantValueId }',
  sellIfOutOfStock: 'sellIfOutOfStock',
  // Paket (BUNDLE) ürünlerin kendi stoğu yok; içindeki ürünlerden hesaplanır
  bundleSettings: 'bundleSettings { products { productId quantity filteredVariantIds } }',
};

const productQuery = (o) => `
query ($page: Int!) {
  listProduct(pagination: { page: $page, limit: 200 }) {
    hasNext
    count
    data {
      id name type ${o.bundleSettings} ${o.metaData} categoryIds ${o.tags} ${o.brand} ${o.salesChannelIds} ${o.hiddenSalesChannelIds}
      ${o.productVariantTypes}
      variants {
        id sku isActive ${o.sellIfOutOfStock} ${o.variantValueIds}
        prices { sellPrice discountPrice priceListId }
        stocks { stockCount }
        images { imageId fileName isMain order isVideo }
      }
    }
  }
}`;

async function fetchProducts() {
  let optional = { ...PRODUCT_OPTIONAL };
  const all = [];
  for (let page = 1; ; page++) {
    const { data, active } = await gqlFlexible(productQuery, optional, { page });
    optional = active;
    const r = data.listProduct;
    all.push(...r.data);
    console.log(`Ürünler: sayfa ${page}, toplam ${all.length}/${r.count ?? '?'}`);
    if (!r.hasNext || r.data.length === 0 || page > 100) break;
  }
  return all;
}

async function fetchCategories() {
  const fields = (o) => `id name parentId ${o.metaData}`;
  const opt = { metaData: 'metaData { slug }' };
  try {
    const { data } = await gqlFlexible((o) => `{ listCategory { ${fields(o)} } }`, opt);
    return data.listCategory;
  } catch (e) {
    // Bazı sürümlerde sayfalı dönüyor olabilir
    const { data } = await gqlFlexible((o) => `{ listCategory { data { ${fields(o)} } } }`, opt);
    return data.listCategory.data;
  }
}

async function fetchVariantTypes() {
  try {
    const data = await gql('{ listVariantType { id name values { id name } } }');
    return data.listVariantType || [];
  } catch (e) {
    console.warn('UYARI: varyant tipleri alınamadı: ' + e.message.slice(0, 160));
    return [];
  }
}

async function fetchMerchantId() {
  if (env.IKAS_MERCHANT_ID) return env.IKAS_MERCHANT_ID;
  try {
    const data = await gql('{ getMerchant { id } }');
    return data.getMerchant?.id || '';
  } catch {
    console.warn('UYARI: IKAS_MERCHANT_ID bulunamadı, görseller gösterilmeyecek. Secrets\'a ekleyin.');
    return '';
  }
}

// ---------- dönüştürme ----------
// Müşteriye gösterilmeyecek muhasebe etiketleri (kdv_20 vb.)
const HIDDEN_TAG = /^kdv[\s_-]*\d+$/i;

function pickPrice(prices = []) {
  const p = prices.find((x) => !x.priceListId) || prices[0];
  if (!p) return null;
  const sell = p.sellPrice ?? null;
  const disc = p.discountPrice && p.discountPrice < sell ? p.discountPrice : null;
  return { sell, disc };
}

function transform({ products, categories, variantTypes, merchantId, config }) {
  const valueName = new Map();
  for (const t of variantTypes) for (const v of t.values || []) valueName.set(v.id, v.name);

  const channel = env.IKAS_SALES_CHANNEL_ID;
  const items = [];

  // Paket ürün stoğu: içindeki her ürünün (varsa izin verilen varyantlarından) en az biri istenen adette stokta olmalı
  const vStock = (v) => (v.stocks || []).reduce((s, x) => s + (x.stockCount || 0), 0);
  const byId = new Map(products.map((p) => [p.id, p]));
  const isBundle = (p) => String(p.type || '').toUpperCase() === 'BUNDLE';
  function bundleInStock(p) {
    const parts = p.bundleSettings?.products;
    if (!parts?.length) return true; // içerik bilinmiyorsa ikas'ın ürün sayfası karar versin, satışı engelleme
    return parts.every((b) => {
      const c = byId.get(b.productId);
      if (!c) return true;
      const allow = b.filteredVariantIds?.length ? new Set(b.filteredVariantIds) : null;
      return (c.variants || []).some((v) => v.isActive !== false && (!allow || allow.has(v.id)) &&
        (v.sellIfOutOfStock || vStock(v) >= (b.quantity || 1)));
    });
  }
  const catCount = new Map();

  for (const p of products) {
    if (channel) {
      if (p.salesChannelIds && !p.salesChannelIds.includes(channel)) continue;
      if (p.hiddenSalesChannelIds?.includes(channel)) continue;
    }
    const slug = p.metaData?.slug;
    const variants = (p.variants || []).filter((v) => v.isActive !== false);
    if (!variants.length || !slug) continue;

    const bundle = isBundle(p), bundleOk = bundle && bundleInStock(p);
    const vars = variants.map((v) => {
      const price = pickPrice(v.prices);
      const stock = bundle ? (bundleOk ? 1 : 0) : vStock(v);
      return {
        id: v.id,
        sku: v.sku || undefined,
        name: (v.variantValueIds || []).map((x) => valueName.get(x.variantValueId)).filter(Boolean).join(' / ') || undefined,
        p: price?.sell ?? null,
        d: price?.disc ?? undefined,
        st: stock,
        oos: v.sellIfOutOfStock ? 1 : undefined, // stok bitse de satılabilir
      };
    });

    // En ucuz varyantın fiyatını göster
    const priced = vars.filter((v) => v.p != null);
    const cheapest = priced.sort((a, b) => (a.d ?? a.p) - (b.d ?? b.p))[0];
    const inStock = vars.some((v) => v.st > 0 || v.oos);

    // Ana görsel
    const imgs = variants.flatMap((v) => v.images || []).filter((i) => !i.isVideo && i.imageId);
    const main = imgs.find((i) => i.isMain) || imgs.sort((a, b) => a.order - b.order)[0];
    const img = main ? `${main.imageId}/${(main.fileName || 'image').replace(/\.[a-z0-9]+$/i, '')}` : undefined;

    (p.categoryIds || []).forEach((id) => catCount.set(id, (catCount.get(id) || 0) + 1));

    items.push({
      id: p.id,
      n: p.name,
      s: slug,
      c: p.categoryIds || [],
      t: (p.tags || []).map((x) => x.name).filter((n) => n && !HIDDEN_TAG.test(n)),
      b: p.brand?.name || undefined,
      img,
      p: cheapest?.p ?? null,
      d: cheapest?.d,
      multi: new Set(vars.map((v) => v.d ?? v.p)).size > 1 ? 1 : undefined, // "…'den başlayan"
      st: inStock ? 1 : 0,
      bn: bundle ? 1 : undefined, // paket ürün
      v: vars.length > 1 ? vars : undefined,
      v1: vars.length === 1 ? vars[0].id : undefined,
    });
  }

  const cats = categories
    .filter((c) => c.metaData?.slug)
    .map((c) => ({ id: c.id, n: c.name, p: c.parentId || undefined, s: c.metaData.slug, k: catCount.get(c.id) || 0 }));

  // Üst kategori sayısı = kendisi + alt kategorilerdeki benzersiz ürünler
  const childrenOf = new Map();
  cats.forEach((c) => c.p && childrenOf.set(c.p, [...(childrenOf.get(c.p) || []), c.id]));
  const descendants = (id) => [id, ...(childrenOf.get(id) || []).flatMap(descendants)];
  for (const c of cats) {
    const ids = new Set(descendants(c.id));
    c.k = items.filter((it) => it.c.some((x) => ids.has(x))).length;
  }

  return {
    v: 1,
    updated: new Date().toISOString(),
    merchant: merchantId,
    config,
    cats: cats.filter((c) => c.k > 0),
    items,
  };
}

// ---------- test verisi ----------
function mockData() {
  const cat = (id, name, parentId, slug) => ({ id, name, parentId, metaData: { slug } });
  const categories = [
    cat('c1', 'Toprak ve Karışımlar', null, 'toprak-ve-karisimlar'),
    cat('c11', 'Perlit', 'c1', 'perlit'),
    cat('c12', 'Torf', 'c1', 'torf'),
    cat('c2', 'Gübre ve Besleme', null, 'gubre-ve-besleme'),
    cat('c21', 'Solucan Gübresi', 'c2', 'solucan-gubresi'),
    cat('c3', 'Tohum ve Fide', null, 'tohum-ve-fide'),
  ];
  const variantTypes = [{ id: 'vt1', name: 'Hacim', values: [{ id: 'l5', name: '5 Litre' }, { id: 'l10', name: '10 Litre' }, { id: 'l50', name: '50 Litre' }] }];
  const v = (id, price, stock, disc, val) => ({
    id, isActive: true, sku: id.toUpperCase(),
    variantValueIds: val ? [{ variantTypeId: 'vt1', variantValueId: val }] : [],
    prices: [{ sellPrice: price, discountPrice: disc ?? null, priceListId: null }],
    stocks: [{ stockCount: stock }], images: [],
  });
  const prod = (id, name, slug, cats, variants, tags = []) => ({
    id, name, metaData: { slug }, categoryIds: cats, tags: tags.map((n) => ({ name: n })), variants,
  });
  const products = [
    prod('p1', 'İnce Tarım Perliti', 'ince-tarim-perliti', ['c1', 'c11'], [v('a', 89, 5, null, 'l5'), v('b', 149, 3, null, 'l10'), v('c', 549, 0, 489, 'l50')], ['3 Al 2 Öde']),
    prod('p2', 'Kokopit Blok 5 Kg', 'kokopit-blok', ['c1'], [v('d', 249, 10)]),
    prod('p3', 'Klasmann TS1 Torf 210 Litre', 'klasmann-ts1-torf-210-litre', ['c1', 'c12'], [v('e', 1250, 2)]),
    prod('p4', 'Sıvı Solucan Gübresi 1 Lt', 'sivi-solucan-gubresi', ['c2', 'c21'], [v('f', 149, 7, 119)]),
    prod('p5', 'Orkide Sıvı Besini 250 ml', 'orkide-sivi-besini', ['c2'], [v('g', 89, 0)]),
    prod('p6', 'Fesleğen Tohumu', 'feslegen-tohumu', ['c3'], [v('h', 29, 50)]),
    // Paket ürünler: kendi stoğu 0, içerikten hesaplanır
    { ...prod('p7', 'Toprak + Gübre Seti', 'toprak-gubre-seti', ['c1'], [v('i', 299, 0)]), type: 'BUNDLE',
      bundleSettings: { products: [{ productId: 'p2', quantity: 1 }, { productId: 'p4', quantity: 2 }] } },
    { ...prod('p8', 'Orkide Bakım Seti', 'orkide-bakim-seti', ['c2'], [v('j', 199, 0)]), type: 'BUNDLE',
      bundleSettings: { products: [{ productId: 'p5', quantity: 1 }, { productId: 'p6', quantity: 1 }] } },
  ];
  return { products, categories, variantTypes, merchantId: '' };
}

// ---------- eğilim: ziyaretçi olayları + gerçek siparişler ----------
// Ziyaretçi olayları (src/worker.js > /trends): arama, sonuçsuz arama, tıklama, görüntüleme, sepete ekleme
async function fetchTrends() {
  try {
    if (env.TRENDS_FILE) return JSON.parse(await readFile(env.TRENDS_FILE, 'utf8'));
    if (env.MOCK) return null;
    const res = await fetch(TRENDS_URL, { signal: AbortSignal.timeout(20000) });
    const j = await res.json();
    if (!j.ok) { console.warn('UYARI: eğilim verisi henüz yok (' + (j.why || res.status) + ')'); return null; }
    console.log(`Eğilim verisi: ${j.rows} satır (son ${j.days} gün)`);
    return j;
  } catch (e) {
    console.warn('UYARI: eğilim verisi alınamadı: ' + e.message.slice(0, 160));
    return null;
  }
}

// Gerçek satışlar: son ORDER_DAYS gündeki siparişlerde ürün başına adet (iptal/iade hariç).
// Uygulamanın sipariş okuma izni yoksa atlanır (ürün senkronu etkilenmez).
async function fetchOrders() {
  if (env.MOCK) return env.ORDERS_FILE ? JSON.parse(await readFile(env.ORDERS_FILE, 'utf8')) : null;
  const days = +env.ORDER_DAYS || 60, since = Date.now() - days * 864e5;
  const line = 'orderLineItems { quantity status variant { id productId } }';
  const variants = [
    (pg) => [`query($p: PaginationInput, $d: DateFilterInput) { listOrder(pagination: $p, orderedAt: $d) { hasNext data { status orderedAt ${line} } } }`, { p: pg, d: { gte: since } }],
    (pg) => [`query($p: PaginationInput) { listOrder(pagination: $p) { hasNext data { status orderedAt ${line} } } }`, { p: pg }],
    (pg) => [`query($p: PaginationInput) { listOrder(pagination: $p) { hasNext data { status orderedAt orderLineItems { quantity variant { id productId } } } } }`, { p: pg }],
  ];
  let lastErr;
  for (const build of variants) {
    try {
      const out = { days, orders: 0, lines: [] };
      for (let page = 1; page <= 60; page++) {
        const [q, vars] = build({ page, limit: 50 });
        const r = (await gql(q, vars)).listOrder;
        let old = 0;
        for (const o of r.data || []) {
          const t = typeof o.orderedAt === 'number' ? o.orderedAt : Date.parse(o.orderedAt);
          if (t && t < since) { old++; continue; }
          if (/CANCEL|REFUND|DRAFT/i.test(o.status || '')) continue;
          out.orders++;
          for (const li of o.orderLineItems || []) {
            if (/CANCEL|REFUND/i.test(li.status || '')) continue;
            if (li.variant) out.lines.push({ pid: li.variant.productId, vid: li.variant.id, q: +li.quantity || 1, t });
          }
        }
        if (!r.hasNext || !(r.data || []).length || (old && old === r.data.length)) break;
      }
      console.log(`Siparişler: son ${days} günde ${out.orders} sipariş, ${out.lines.length} satır`);
      return out;
    } catch (e) { lastErr = e; }
  }
  console.warn('UYARI: sipariş verisi alınamadı (ikas uygulamasına "siparişleri okuma" izni gerekebilir): ' + String(lastErr && lastErr.message).slice(0, 200));
  return null;
}

const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[ışğüöçâîû]/g, (c) => ({ ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' })[c]).replace(/̇/g, '');

// Ürün başına eğilim puanı (p.h, 0-100) + "Çok satan" listesi + "Sık arananlar"
//   ham puan = 4 × satış adedi + 2 × sepete ekleme + 1 × tıklama + 0,3 × görüntüleme  (yeni olanlar daha ağır)
function applyTrends(out, trends, orders, config) {
  const bySlug = new Map(out.items.map((p) => [p.s, p]));
  const byId = new Map(out.items.map((p) => [p.id, p]));
  const byVar = new Map();
  for (const p of out.items) { if (p.v1) byVar.set(p.v1, p); for (const v of p.v || []) byVar.set(v.id, p); }
  const st = new Map(); // slug → { o, a, c, v }
  const get = (slug) => { if (!st.has(slug)) st.set(slug, { o: 0, a: 0, c: 0, v: 0 }); return st.get(slug); };
  if (orders) {
    const now = Date.now();
    for (const l of orders.lines) {
      const p = byId.get(l.pid) || byVar.get(l.vid);
      if (!p) continue;
      const age = l.t ? Math.max(0, (now - l.t) / 864e5) : 0;
      get(p.s).o += l.q * Math.pow(0.5, age / 20);
    }
  }
  for (const [slug, o] of Object.entries((trends && trends.p) || {})) {
    if (!bySlug.has(slug)) continue;
    const g = get(slug);
    g.a += o.a || 0; g.c += o.c || 0; g.v += o.v || 0;
  }
  const raw = new Map([...st].map(([s, g]) => [s, 4 * g.o + 2 * g.a + g.c + 0.3 * g.v]));
  const max = Math.max(0, ...raw.values());
  for (const [s, r] of raw) {
    const h = max ? Math.round((100 * r) / max) : 0;
    if (h > 0) bySlug.get(s).h = h;
  }
  // Çok satan: sadece gerçek siparişlerden (en az 2 adet), en fazla 12 ürün
  const best = orders ? [...st].filter(([, g]) => g.o >= 2).sort((a, b) => b[1].o - a[1].o).slice(0, 12).map(([s]) => s) : [];
  // Sık arananlar: aynı kelimenin farklı yazımları birleşir, en çok kullanılan yazım gösterilir; en az 3 arama
  const terms = new Map();
  for (const [x, n] of (trends && trends.q) || []) {
    const f = fold(x).replace(/[^a-z0-9 ]/g, '').trim();
    if (!f) continue;
    const t = terms.get(f) || { n: 0, show: x, top: 0 };
    t.n += n;
    if (n > t.top) { t.top = n; t.show = x; }
    terms.set(f, t);
  }
  const q = [...terms.values()].filter((t) => t.n >= 3).sort((a, b) => b.n - a.n).slice(0, 12).map((t) => t.show);
  out.trend = { q, best, src: { orders: orders ? orders.orders : null, events: trends ? trends.rows : null } };
  return { st, terms, best };
}

// İnsan için rapor: docs/trend-raporu.md (sadece içerik değişince yazılır)
async function writeReport(out, trends, orders, an, config) {
  const bySlug = new Map(out.items.map((p) => [p.s, p]));
  const name = (s) => (bySlug.get(s) || {}).n || s;
  const catOf = new Map(out.cats.map((c) => [c.id, c]));
  const topCat = (p) => { let c = catOf.get(p.c[0]); while (c && c.p && catOf.get(c.p)) c = catOf.get(c.p); return c ? c.n : ''; };
  const L = [];
  const tbl = (head, rows) => { if (!rows.length) { L.push('_Henüz veri yok._', ''); return; } L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |'), ''); };
  L.push('# Ziyaretçi ve satış eğilimleri', '',
    `Kaynak: ${orders ? `son ${orders.days} günde ${orders.orders} sipariş` : 'sipariş verisi yok (ikas uygulamasına sipariş okuma izni gerekebilir)'}; ` +
    `${trends ? `site içi olaylar son ${trends.days} gün (${trends.rows} kayıt)` : 'site içi olay verisi henüz yok'}.`,
    '', 'Bu dosya 2 saatte bir otomatik güncellenir. Masaüstü menüdeki ürünleri sabitlemek için `config.json > desktopMenu.picks` kullanın.', '');
  L.push('## En çok satanlar (gerçek siparişler)', '');
  tbl(['#', 'Ürün', 'Satış puanı'], [...an.st].filter(([, g]) => g.o > 0).sort((a, b) => b[1].o - a[1].o).slice(0, 20).map(([s, g], i) => [i + 1, name(s), g.o.toFixed(1)]));
  L.push('## En çok aranan kelimeler', '');
  tbl(['#', 'Kelime', 'Arama'], [...an.terms.values()].sort((a, b) => b.n - a.n).slice(0, 25).map((t, i) => [i + 1, t.show, t.n]));
  L.push('## Sonuç bulunamayan aramalar', '', 'Bu kelimeler için ürün eklemeyi ya da `config.json > synonyms` ile eşanlamlı tanımlamayı düşünün.', '');
  tbl(['#', 'Kelime', 'Arama'], ((trends && trends.q0) || []).slice(0, 25).map(([x, n], i) => [i + 1, x, n]));
  L.push('## En çok sepete eklenenler', '');
  tbl(['#', 'Ürün', 'Sepete ekleme', 'Görüntüleme'], [...an.st].filter(([, g]) => g.a > 0).sort((a, b) => b[1].a - a[1].a).slice(0, 20).map(([s, g], i) => [i + 1, name(s), g.a.toFixed(1), g.v.toFixed(1)]));
  L.push('## Çok bakılıp az sepete eklenenler', '', 'Fiyat, görsel veya açıklama gözden geçirilebilir.', '');
  tbl(['Ürün', 'Görüntüleme', 'Sepete ekleme', 'Oran'], [...an.st].filter(([, g]) => g.v >= 8 && g.a / g.v < 0.05).sort((a, b) => b[1].v - a[1].v).slice(0, 15).map(([s, g]) => [name(s), g.v.toFixed(1), g.a.toFixed(1), '%' + Math.round((100 * g.a) / g.v)]));
  L.push('## Masaüstü menü önerileri (kategori başına ilk 3)', '', 'Onayladıklarınızı `desktopMenu.picks` içine yazarsanız sabitlenir; yazmazsanız menü bu sıraya göre kendini günceller.', '');
  const groups = new Map();
  for (const p of out.items) if (p.h && p.st && p.img) { const c = topCat(p); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(p); }
  tbl(['Kategori', 'Önerilen ürünler'], [...groups].map(([c, ps]) => [c, ps.sort((a, b) => b.h - a.h).slice(0, 3).map((p) => `${p.n} (\`${p.s}\`)`).join('<br>')]));
  const text = L.join('\n') + '\n';
  let prev = '';
  try { prev = await readFile(REPORT, 'utf8'); } catch {}
  if (prev === text) return;
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, text);
  console.log('Rapor yazıldı: docs/trend-raporu.md');
}

// ---------- ana akış ----------
async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  let raw;
  if (env.MOCK) {
    console.log('MOCK modu: örnek veri kullanılıyor');
    raw = mockData();
  } else {
    TOKEN = await getToken();
    console.log('Token alındı');
    const [products, categories, variantTypes, merchantId] = await Promise.all([
      fetchProducts(), fetchCategories(), fetchVariantTypes(), fetchMerchantId(),
    ]);
    raw = { products, categories, variantTypes, merchantId };
  }
  const out = transform({ ...raw, config });
  if (!out.items.length) die('Hiç ürün çıkmadı; products.json güncellenmedi.');

  // Eğilimler: hata olursa ürün senkronu yine de tamamlanır
  try {
    const [trends, orders] = await Promise.all([fetchTrends(), fetchOrders()]);
    const an = applyTrends(out, trends, orders, config);
    await writeReport(out, trends, orders, an, config);
  } catch (e) {
    console.warn('UYARI: eğilim hesaplanamadı: ' + (e.stack || e.message).slice(0, 300));
  }

  // Sadece içerik değiştiyse yaz (gereksiz commit/deploy olmasın)
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const same = prev && JSON.stringify({ ...prev, updated: 0 }) === JSON.stringify({ ...out, updated: 0 });
  if (same) { console.log('Değişiklik yok.'); return; }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
  console.log(`Yazıldı: ${out.items.length} ürün, ${out.cats.length} kategori, ${kb} KB`);
}

main().catch((e) => die(e.stack || e.message));
