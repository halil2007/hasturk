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
//   STORE_OUT           sadece ürünleri bu dosyaya yaz (ikinci mağaza karşılaştırması: scripts/compare-stores.mjs)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// İkinci site (SITE=tarim): ürünler o mağazanın API'sinden, dosyalar public/<SITE>/ altına; ayarlar config.json +
// config.<SITE>.json (üzerine yazar). Ziyaretçi eğilimleri iki sitede ortak (aynı /trends).
const SITE = (env.SITE || '').replace(/[^a-z0-9-]/g, '');
const PUB = SITE ? join(ROOT, 'public', SITE) : join(ROOT, 'public');
const OUT = join(PUB, 'products.json');
const API = 'https://api.myikas.com/api/v1/admin/graphql';
const REPORT = join(ROOT, 'docs', SITE ? `trend-raporu-${SITE}.md` : 'trend-raporu.md');
const MENU = join(PUB, 'menu.json');
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

    // Deneme/boş kayıtlar (kategorisi de fiyatı da olmayan, ör. "görsel") aramaya girmesin
    if (!(p.categoryIds || []).length && !(cheapest && (cheapest.d ?? cheapest.p))) continue;

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
    const body = await res.text();
    let j;
    try { j = JSON.parse(body); } catch {
      // Worker henüz yayında değilse (ör. merge'den hemen sonra) adres 404 ya da boş döner; bir sonraki senkronda alınır
      console.warn(`UYARI: eğilim adresi beklenen cevabı vermedi (HTTP ${res.status}, ${body.length} bayt). Cloudflare yayını bitmemiş olabilir.`);
      return null;
    }
    if (!j.ok) { console.warn('UYARI: eğilim verisi henüz yok (' + (j.why || res.status) + ')'); return null; }
    console.log(`Eğilim verisi: ${j.rows} satır (son ${j.days} gün)`);
    return j;
  } catch (e) {
    console.warn('UYARI: eğilim verisi alınamadı: ' + e.message.slice(0, 160));
    return null;
  }
}

// Gerçek satışlar: [from, to] aralığındaki siparişlerde ürün satırları (iptal/iade hariç).
// Uygulamanın sipariş okuma izni yoksa atlanır (ürün senkronu etkilenmez).
let ORDER_Q = null; // çalışan sorgu biçimi (ilk denemede bulunur)
async function fetchOrdersRange(from, to, maxPages) {
  const line = 'orderLineItems { quantity status variant { id productId } }';
  const variants = [
    (pg) => [`query($p: PaginationInput, $d: DateFilterInput) { listOrder(pagination: $p, orderedAt: $d) { hasNext data { status orderedAt ${line} } } }`, { p: pg, d: { gte: from, lte: to } }],
    (pg) => [`query($p: PaginationInput) { listOrder(pagination: $p) { hasNext data { status orderedAt ${line} } } }`, { p: pg }],
    (pg) => [`query($p: PaginationInput) { listOrder(pagination: $p) { hasNext data { status orderedAt orderLineItems { quantity variant { id productId } } } } }`, { p: pg }],
  ];
  let lastErr;
  for (const build of ORDER_Q ? [ORDER_Q] : variants) {
    try {
      const out = { orders: 0, lines: [] };
      for (let page = 1; page <= maxPages; page++) {
        const [q, vars] = build({ page, limit: 50 });
        const r = (await gql(q, vars)).listOrder;
        let old = 0;
        for (const o of r.data || []) {
          const t = typeof o.orderedAt === 'number' ? o.orderedAt : Date.parse(o.orderedAt);
          if (t && t < from) { old++; continue; }
          if (t && t > to) continue;
          if (/CANCEL|REFUND|DRAFT/i.test(o.status || '')) continue;
          out.orders++;
          for (const li of o.orderLineItems || []) {
            if (/CANCEL|REFUND/i.test(li.status || '')) continue;
            if (li.variant) out.lines.push({ pid: li.variant.productId, vid: li.variant.id, q: +li.quantity || 1, t });
          }
        }
        if (!r.hasNext || !(r.data || []).length || (old && old === r.data.length)) break;
      }
      ORDER_Q = build;
      return out;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
// Son ORDER_DAYS gün (bugünün eğilimi) + 1 ve 2 yıl önce aynı dönem (o günün 3 hafta öncesi – 1 ay sonrası).
// Geçmiş yıllar iki iş görür: önümüzdeki ay hangi ürünlerin satacağını söyler (sezon) ve son 2 haftayı
// bu yılın son 2 haftasıyla karşılaştırıp sezonun bu yıl tutup tutmadığını gösterir (teyit).
async function fetchOrders() {
  if (env.MOCK) return env.ORDERS_FILE ? JSON.parse(await readFile(env.ORDERS_FILE, 'utf8')) : null;
  const days = +env.ORDER_DAYS || 60, now = Date.now(), Y = 365 * 864e5, D = 864e5;
  try {
    const cur = await fetchOrdersRange(now - days * D, now, 60);
    console.log(`Siparişler: son ${days} günde ${cur.orders} sipariş, ${cur.lines.length} satır`);
    // Tarih filtresi gerçekten uygulanıyor mu? (geçmiş yıllar 0 gelirse sebebini ayırt etmek için)
    try {
      const half = await fetchOrdersRange(now - days * D, now - 30 * D, 60);
      const exp = new Set(cur.lines.filter((l) => l.t && l.t <= now - 30 * D).map((l) => l.t)).size;
      const oldest = Math.min(...cur.lines.map((l) => l.t || now));
      console.log(`Kontrol: ${days}-30 gün önce arası ${half.orders} sipariş (beklenen ~${exp}); en eski sipariş ${new Date(oldest).toISOString().slice(0, 10)}`);
    } catch {}
    const past = [];
    for (const y of [1, 2]) {
      try {
        const r = await fetchOrdersRange(now - y * Y - 21 * D, now - y * Y + 30 * D, 200);
        console.log(`${y} yıl önce aynı dönem: ${r.orders} sipariş, ${r.lines.length} satır`);
        past.push({ y, ...r });
      } catch (e) { console.warn(`UYARI: ${y} yıl önceki siparişler alınamadı: ` + String(e.message).slice(0, 160)); }
    }
    return { days, now, orders: cur.orders, lines: cur.lines, past };
  } catch (e) {
    console.warn('UYARI: sipariş verisi alınamadı (ikas uygulamasına "Siparişler (okuma)" izni gerekebilir): ' + String(e && e.message).slice(0, 200));
    return null;
  }
}

const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[ışğüöçâîû]/g, (c) => ({ ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' })[c]).replace(/̇/g, '');

// ---------- eğilim algoritması ----------
// Her ürün için puan (p.h, 0-100) şu parçalardan oluşur, hepsi aynı ölçekte ("talep puanı"):
//  1) ŞİMDİ     4 × satış + 2 × sepete ekleme + 1 × tıklama + 0,3 × görüntüleme; yeni olan ağır basar
//               (sipariş yarı ömrü 20 gün, site olayları 10 gün) → eski ilgi yavaşça söner, sert sıfırlama yok
//  2) İVME      son 7 günün hızı ÷ önceki 3 haftanın hızı. En az 1,5 kat hızlanan ve yeterli hacmi olan ürün
//               "yükselen" sayılır ve ek puan alır (bu yıl yeni tutan ürünler sezon verisini beklemeden öne çıkar)
//  3) SEZON     1 ve 2 yıl önce, bugünden 1 hafta önce – 1 ay sonrasına kadar satılanlar (geçen yıl ağırlık 1,
//               2 yıl önce 0,5); mağazanın büyüme oranıyla ölçeklenir (bu yıl genel satış 2 katsa geçmiş de 2 kat sayılır)
//  4) TEYİT     geçen yılın son 2 haftası ile bu yılın son 2 haftası karşılaştırılır: bu yıl geride kalan ürünün
//               sezon puanı azalır (en az %40'ına), önde gidenin artar (en fazla %150) → geçen yıl revaçta olup
//               bu yıl ilgi görmeyen ürün zorla öne çıkarılmaz, bu yıl erken başlayan daha da öne alınır
//  puan = ŞİMDİ + İVME + 0,6 × SEZON × TEYİT
// Stokta olmayan ürünler sitede öne çıkarılmaz (widget stok kontrol eder); raporda uyarı olarak listelenir.
const W = { o: 4, a: 2, c: 1, v: 0.3 };
const SEASON = 0.6, Y2 = 0.5, HL_ORDER = 20;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function momentum(m7, m28, minVol) {
  const prior = Math.max(0, m28 - m7);
  const ratio = (m7 / 7 + 0.3) / (prior / 21 + 0.3);
  const rising = m7 >= minVol && ratio >= 1.5;
  return { ratio, rising, bonus: rising ? 0.5 * m7 * (Math.min(ratio, 4) - 1) : 0 };
}

function applyTrends(out, trends, orders, config) {
  const D = 864e5, now = (orders && orders.now) || Date.now();
  const bySlug = new Map(out.items.map((p) => [p.s, p]));
  const byId = new Map(out.items.map((p) => [p.id, p]));
  const byVar = new Map();
  for (const p of out.items) { if (p.v1) byVar.set(p.v1, p); for (const v of p.v || []) byVar.set(v.id, p); }
  const prodOf = (l) => byId.get(l.pid) || byVar.get(l.vid);
  const st = new Map();
  const get = (slug) => {
    if (!st.has(slug)) st.set(slug, { o: 0, o7: 0, o14: 0, o28: 0, a: 0, c: 0, v: 0, e7: 0, e28: 0, yrs: {} });
    return st.get(slug);
  };
  const yr = (g, y) => (g.yrs[y] = g.yrs[y] || { oA: 0, o14: 0, eA: 0, e14: 0 });

  // Bugünkü siparişler
  for (const l of (orders && orders.lines) || []) {
    const p = prodOf(l);
    if (!p) continue;
    const g = get(p.s), age = l.t ? Math.max(0, (now - l.t) / D) : 0;
    g.o += l.q * Math.pow(0.5, age / HL_ORDER);
    if (age < 7) g.o7 += l.q;
    if (age < 14) g.o14 += l.q;
    if (age < 28) g.o28 += l.q;
  }
  // Geçmiş yılların siparişleri: "önümüzdeki dönem" (−7…+30 gün) ve "son 2 hafta" (−14…0 gün)
  const years = {};
  for (const py of (orders && orders.past) || []) {
    years[py.y] = { o14: 0, e14: 0, has: py.orders > 0 };
    const base = now - py.y * 365 * D;
    for (const l of py.lines) {
      const p = prodOf(l);
      if (!p || !l.t) continue;
      const rel = (l.t - base) / D, y = yr(get(p.s), py.y);
      if (rel >= -7 && rel <= 30) y.oA += l.q;
      if (rel >= -14 && rel <= 0) { y.o14 += l.q; years[py.y].o14 += l.q; }
    }
  }
  // Site içi olaylar (bugün + geçmiş yıllar)
  // Olay anahtarı ürün adresi (slug) ya da — ürün verisi inmemiş sayfalarda sepete eklenen — varyant kimliği olabilir
  const slugOf = (x) => bySlug.has(x) ? x : (byVar.get(x) || {}).s;
  const evP = (src) => {
    const m = {};
    for (const [x, o] of Object.entries(src || {})) {
      const s = slugOf(x);
      if (!s) continue;
      const t = (m[s] = m[s] || {});
      for (const k in o) t[k] = (t[k] || 0) + (o[k] || 0);
    }
    return m;
  };
  for (const [slug, o] of Object.entries(evP(trends && trends.p))) {
    const g = get(slug);
    g.a += o.a || 0; g.c += o.c || 0; g.v += o.v || 0; g.e7 += o.e7 || 0; g.e28 += o.e28 || 0;
  }
  for (const [y, key] of [[1, 'ly'], [2, 'ly2']]) {
    const t = trends && trends[key];
    if (!t || !t.rows) continue;
    years[y] = years[y] || { o14: 0, e14: 0, has: false };
    years[y].hasE = true;
    for (const [slug, o] of Object.entries(evP(t.p))) {
      const v = yr(get(slug), y);
      v.eA += o.e || 0; v.e14 += o.e14 || 0; years[y].e14 += o.e14 || 0;
    }
  }
  // Mağaza büyümesi: bu yılın son 2 haftası ÷ o yılın aynı 2 haftası (sipariş ve olay ayrı ayrı)
  let cur14 = 0, curE14 = 0;
  for (const g of st.values()) { cur14 += g.o14; curE14 += g.e28 / 2; }
  // (o yılın son 2 haftasında yeterli veri yoksa oran güvenilmez → 1 kabul edilir)
  for (const y of Object.values(years)) {
    y.g = y.o14 >= 5 && cur14 >= 5 ? clamp((cur14 + 3) / (y.o14 + 3), 0.5, 3) : 1;
    y.ge = y.e14 >= 10 && curE14 >= 10 ? clamp((curE14 + 3) / (y.e14 + 3), 0.5, 3) : 1;
  }

  const rows = [];
  for (const [slug, g] of st) {
    const now0 = W.o * g.o + W.a * g.a + W.c * g.c + W.v * g.v;
    const mo = momentum(W.o * g.o7 + g.e7, W.o * g.o28 + g.e28, 5);
    const bonus = Math.min(mo.bonus, Math.max(now0, W.o * g.o7 + g.e7));
    // Sezon: yılların ağırlıklı ortalaması (veri olan yıllar)
    let sNum = 0, sDen = 0, lNum = 0;
    for (const [y, w] of [[1, 1], [2, Y2]]) {
      const Yd = years[y];
      if (!Yd || (!Yd.has && !Yd.hasE)) continue;
      const v = g.yrs[y] || { oA: 0, o14: 0, eA: 0, e14: 0 };
      sNum += w * (W.o * v.oA * Yd.g + v.eA * Yd.ge);
      lNum += w * (W.o * v.o14 * Yd.g + v.e14 * Yd.ge);
      sDen += w;
    }
    const season = sDen ? sNum / sDen : 0, lastRecent = sDen ? lNum / sDen : 0;
    const thisRecent = W.o * g.o14 + g.e28 / 2;
    const conf = lastRecent >= 4 ? clamp((thisRecent + 2) / (lastRecent + 2), 0.4, 1.5) : 1;
    const score = now0 + bonus + SEASON * season * conf;
    rows.push({ slug, g, now0, mo, bonus, season, conf, lastRecent, thisRecent, score });
  }
  const max = Math.max(0, ...rows.map((r) => r.score));
  for (const r of rows) {
    const h = max ? Math.round((100 * r.score) / max) : 0;
    if (h > 0) bySlug.get(r.slug).h = h;
  }
  const inStock = (r) => (bySlug.get(r.slug) || {}).st;
  // Çok satan: gerçek siparişler (bugün + yaklaşan sezonda geçen yıl satılan), en az 2 adet, en fazla 12.
  // Geçen yılın sezonu sadece bu yıl geride değilse sayılır (bu yıl satmayan ürüne "Çok satan" denmez)
  const sold = (r) => r.g.o + (r.conf >= 0.8 ? SEASON * ((r.g.yrs[1] || {}).oA || 0) * r.conf : 0);
  const best = orders ? rows.filter((r) => sold(r) >= 2).sort((a, b) => sold(b) - sold(a)).slice(0, 12).map((r) => r.slug) : [];
  const rising = rows.filter((r) => r.mo.rising && inStock(r)).sort((a, b) => b.bonus - a.bonus).slice(0, 8).map((r) => r.slug);
  // Sezon önerileri: bu yıl geride kalanlar hariç (teyit ≥ %70 ya da sezon henüz başlamadı)
  const season = rows.filter((r) => r.season * r.conf >= 4 && r.conf >= 0.7 && inStock(r)).sort((a, b) => b.season * b.conf - a.season * a.conf).slice(0, 8).map((r) => r.slug);

  // Aramalar: bugün (yeni olan ağır) + yükselen + geçmiş yılların aynı dönemi; farklı yazımlar birleşir
  const terms = new Map();
  const term = (x) => {
    const f = fold(x).replace(/[^a-z0-9 ]/g, '').trim();
    if (!f) return null;
    if (!terms.has(f)) terms.set(f, { n: 0, s: 0, n7: 0, ly: 0, show: x, top: 0 });
    return terms.get(f);
  };
  for (const [x, n, s, n7] of (trends && trends.q) || []) {
    const t = term(x);
    if (!t) continue;
    t.n += n; t.s += s || n; t.n7 += n7 || 0;
    if (n > t.top) { t.top = n; t.show = x; }
  }
  for (const [y, key, w] of [[1, 'ly', 1], [2, 'ly2', Y2]]) {
    for (const [x, n] of (trends && trends[key] && trends[key].q) || []) {
      const t = term(x);
      if (t) t.ly += w * n * ((years[y] || {}).ge || 1);
    }
  }
  for (const t of terms.values()) {
    t.mo = momentum(t.n7, t.n, 3);
    t.score = t.s + t.mo.bonus + SEASON * t.ly;
  }
  const q = [...terms.values()].filter((t) => t.n + t.ly >= 3).sort((a, b) => b.score - a.score).slice(0, 12).map((t) => t.show);
  const r2 = (n) => Math.round(n * 100) / 100;
  out.trend = {
    q, best, rising, season,
    src: {
      orders: orders ? orders.orders : null,
      years: Object.fromEntries(Object.entries(years).map(([y, v]) => [y, { growth: r2(v.g), orders: v.has, events: !!v.hasE }])),
      events: trends ? trends.rows : null,
    },
  };
  return { rows, terms, best, rising, season, years };
}

// İnsan için rapor: docs/trend-raporu.md (sadece içerik değişince yazılır)
async function writeReport(out, trends, orders, an, config) {
  const bySlug = new Map(out.items.map((p) => [p.s, p]));
  const name = (s) => (bySlug.get(s) || {}).n || s;
  const stock = (s) => ((bySlug.get(s) || {}).st ? 'evet' : '**HAYIR**');
  const catOf = new Map(out.cats.map((c) => [c.id, c]));
  const topCat = (p) => { let c = catOf.get(p.c[0]); while (c && c.p && catOf.get(c.p)) c = catOf.get(c.p); return c ? c.n : ''; };
  const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString('tr-TR');
  const pct = (n) => '%' + Math.round(n * 100);
  const L = [];
  const tbl = (head, rows) => { if (!rows.length) { L.push('_Henüz veri yok._', ''); return; } L.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |'), ''); };
  const yrs = an.years;
  const yearTxt = [1, 2].filter((y) => yrs[y]).map((y) => (yrs[y].has || yrs[y].hasE)
    ? `${y} yıl önce aynı dönem (${[yrs[y].has && 'sipariş', yrs[y].hasE && 'site içi'].filter(Boolean).join(' + ')}; mağaza büyümesi ×${f1(yrs[y].g)})`
    : `${y} yıl önce aynı dönemde veri yok`);
  L.push('# Ziyaretçi ve satış eğilimleri', '',
    'Kaynaklar: ' + [
      orders ? `son ${orders.days} günde ${orders.orders} sipariş` : 'sipariş verisi yok (ikas uygulamasına "Siparişler (okuma)" izni gerekir)',
      trends ? `site içi olaylar son ${trends.days} gün (${trends.rows} kayıt)` : 'site içi olay verisi henüz yok',
      ...yearTxt,
    ].join('; ') + '.', '',
    'Bu dosya 2 saatte bir otomatik güncellenir. Puan = şimdiki talep + yükselme ivmesi + 0,6 × geçmiş yılların sezonu × bu yılki teyit. ' +
    'Masaüstü menüde ürün sabitlemek için `config.json > desktopMenu.picks`.', '');

  L.push('## Yükselen ürünler (son 7 gün, önceki 3 haftaya göre)', '', 'Bu yıl hızla ilgi görmeye başlayanlar; sezon verisi beklenmeden öne çıkarılıyor.', '');
  tbl(['#', 'Ürün', 'Hızlanma', 'Son 7 gün satış', 'Stokta'], an.rows.filter((r) => r.mo.rising).sort((a, b) => b.bonus - a.bonus).slice(0, 15)
    .map((r, i) => [i + 1, name(r.slug), '×' + f1(Math.min(r.mo.ratio, 9.9)), r.g.o7, stock(r.slug)]));

  L.push('## Yaklaşan sezon (geçmiş yıllarda önümüzdeki 1 ayda satanlar)', '',
    'Teyit: geçen yılın son 2 haftasına göre bu yılın durumu. %100 = aynı tempoda; altı geride, üstü önde.', '');
  tbl(['#', 'Ürün', 'Geçen yıl (1 ay) adet', 'Teyit', 'Durum', 'Stokta'], an.rows.filter((r) => r.season > 0).sort((a, b) => b.season * b.conf - a.season * a.conf).slice(0, 20)
    .map((r, i) => [i + 1, name(r.slug), (r.g.yrs[1] || {}).oA || 0, r.lastRecent >= 4 ? pct(r.conf) : '—',
      r.lastRecent < 4 ? 'sezon başlamadı' : r.conf >= 1.15 ? 'bu yıl önde' : r.conf <= 0.7 ? 'bu yıl geride' : 'yolunda', stock(r.slug)]));

  L.push('## Geçen yıl revaçta, bu yıl geride kalanlar', '', 'Kampanya, fiyat veya görünürlük düşünülebilir; sistem bunları zorla öne çıkarmaz.', '');
  tbl(['Ürün', 'Geçen yıl son 2 hafta', 'Bu yıl son 2 hafta', 'Teyit'], an.rows.filter((r) => r.lastRecent >= 4 && r.conf <= 0.7).sort((a, b) => b.lastRecent - a.lastRecent).slice(0, 15)
    .map((r) => [name(r.slug), f1(r.lastRecent), f1(r.thisRecent), pct(r.conf)]));

  L.push('## En çok satanlar (son 60 gün, gerçek siparişler)', '');
  tbl(['#', 'Ürün', 'Satış puanı', 'Son 28 gün adet'], an.rows.filter((r) => r.g.o > 0).sort((a, b) => b.g.o - a.g.o).slice(0, 20).map((r, i) => [i + 1, name(r.slug), f1(r.g.o), r.g.o28]));

  L.push('## En çok aranan kelimeler', '');
  tbl(['#', 'Kelime', 'Son 30 gün', 'Son 7 gün', 'Yükseliyor', 'Geçen yıl bu dönem'], [...an.terms.values()].sort((a, b) => b.score - a.score).slice(0, 25)
    .map((t, i) => [i + 1, t.show, t.n, t.n7, t.mo.rising ? '↑ ×' + f1(Math.min(t.mo.ratio, 9.9)) : '', t.ly ? f1(t.ly) : '']));

  L.push('## Sonuç bulunamayan aramalar', '', 'Bu kelimeler için ürün eklemeyi ya da `config.json > synonyms` ile eşanlamlı tanımlamayı düşünün.', '');
  tbl(['#', 'Kelime', 'Arama'], ((trends && trends.q0) || []).slice(0, 25).map(([x, n], i) => [i + 1, x, n]));

  L.push('## En çok sepete eklenenler', '');
  tbl(['#', 'Ürün', 'Sepete ekleme', 'Görüntüleme'], an.rows.filter((r) => r.g.a > 0).sort((a, b) => b.g.a - a.g.a).slice(0, 20).map((r, i) => [i + 1, name(r.slug), f1(r.g.a), f1(r.g.v)]));

  L.push('## Çok bakılıp az sepete eklenenler', '', 'Fiyat, görsel veya açıklama gözden geçirilebilir.', '');
  tbl(['Ürün', 'Görüntüleme', 'Sepete ekleme', 'Oran'], an.rows.filter((r) => r.g.v >= 8 && r.g.a / r.g.v < 0.05).sort((a, b) => b.g.v - a.g.v).slice(0, 15)
    .map((r) => [name(r.slug), f1(r.g.v), f1(r.g.a), pct(r.g.a / r.g.v)]));

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

// ---------- kategori görselleri + hızlı menü verisi ----------
// Kategori kapak görseli: config.json > categoryImages'daki ürün; yoksa kategorideki (alt kategoriler dahil) stoktaki
// mağaza markalı ürün; o da yoksa stoktaki ilk görselli ürün (daha önce telefonda hesaplanıyordu)
function catCovers(out, config) {
  const bySlug = new Map(out.items.map((p) => [p.s, p]));
  const own = new RegExp(config.brandPattern || 'has ?t[uü]rk|^hg$', 'i');
  const cover = {};
  for (const [n, slug] of Object.entries(config.categoryImages || {})) cover[fold(n)] = bySlug.get(slug);
  const catById = new Map(out.cats.map((c) => [c.id, c]));
  const byCat = new Map();
  for (const p of out.items) {
    if (!p.img) continue;
    const seen = new Set();
    for (const id of p.c) {
      for (let c = catById.get(id), n = 0; c && !seen.has(c.id) && n < 10; c = catById.get(c.p), n++) {
        seen.add(c.id);
        if (!byCat.has(c.id)) byCat.set(c.id, []);
        byCat.get(c.id).push(p);
      }
    }
  }
  for (const c of out.cats) {
    const inCat = byCat.get(c.id) || [], inStock = inCat.filter((p) => p.st), cv = cover[fold(c.n)];
    const pick = (cv && cv.img ? cv : null) || inStock.find((p) => own.test(p.b || '')) || inStock[0] || inCat[0];
    c.img = pick ? pick.img : '';
  }
}
// public/menu.json (~5 KB): telefonda ☰ menüsü / Ürün Bul ana ekranı ürün verisinin (90+ KB) inmesini beklemeden
// bununla anında açılır. Ağır ama ana ekranda gerekmeyen ayarlar (rehberler, toprak eşleştirme…) içinde yoktur.
const MENU_SKIP = ['guides', 'soilMatch', 'synonyms', 'crossSell', 'boost', 'bestsellers', 'badges', 'categoryImages'];
// Masaüstü menüsünün her ana kategori için öne çıkan 3 ürünü (widget'taki dmProducts ile aynı kural):
// config.json > desktopMenu.picks önce, sonra eğilim + satış (p.h), çok satan ve mağaza markası; toptan/ton ürünler geride.
// Böylece masaüstü menüsü 300 KB'lık ürün verisini indirmeden kurulur.
function dmPicks(out, config) {
  const dm = config.desktopMenu && typeof config.desktopMenu === 'object' ? config.desktopMenu : {};
  if (config.desktopMenu === false || dm.products === false) return {};
  const boost = (config.boost || []).slice().reverse(), best = new Set([...(config.bestsellers || config.boost || []), ...((out.trend || {}).best || [])]);
  const ownB = new RegExp(config.brandPattern || 'has ?t[uü]rk|^hg$', 'i'), bulk = new RegExp(config.bulkPattern || '\\b\\d+([.,]\\d+)? ?ton\\b', 'i');
  const bulkPrice = config.bulkPrice || 40000;
  const rank = (p) => {
    const b = boost.indexOf(p.s);
    let r = (b !== -1 ? 4 + b / Math.max(boost.length, 1) : 0) + (ownB.test(p.b || '') ? 2 : 0) + (p.st ? Math.min(2, (p.h || 0) / 50) : 0);
    if (bulk.test(p.n) || (p.p || 0) >= bulkPrice) r -= 8;
    return r;
  };
  const kids = {}, bySlug = new Map(out.items.map((p) => [p.s, p]));
  for (const c of out.cats) if (c.p) (kids[c.p] = kids[c.p] || []).push(c);
  const ok = (p) => p && p.st && p.img;
  const res = {};
  for (const c of out.cats.filter((x) => !x.p || !out.cats.some((y) => y.id === x.p))) {
    const set = new Set();
    (function add(id) { set.add(id); (kids[id] || []).forEach((k) => add(k.id)); })(c.id);
    const picks = ((dm.picks || {})[c.n] || []).map((s) => bySlug.get(s)).filter(ok);
    const rest = out.items.filter((p) => ok(p) && rank(p) >= 0 && !picks.includes(p) && (p.c || []).some((x) => set.has(x)))
      .sort((a, b) => (b.h || 0) - (a.h || 0) || ((best.has(b.s) ? 3 : 0) + rank(b)) - ((best.has(a.s) ? 3 : 0) + rank(a)));
    const top = picks.concat(rest).slice(0, 3);
    if (top.length) res[c.id] = top.map((p) => ({ n: p.n, s: p.s, img: p.img, p: p.d != null ? p.d : p.p, o: p.d != null && p.p > p.d ? p.p : 0 }));
  }
  return res;
}

async function writeMenu(out) {
  const config = Object.fromEntries(Object.entries(out.config || {}).filter(([k]) => !MENU_SKIP.includes(k)));
  const menu = { v: 1, merchant: out.merchant, n: out.items.length, config, cats: out.cats, trend: { q: (out.trend && out.trend.q) || [] }, dmp: dmPicks(out, out.config || {}) };
  const text = JSON.stringify(menu);
  let prev = '';
  try { prev = await readFile(MENU, 'utf8'); } catch {}
  if (prev === text) return;
  await writeFile(MENU, text);
  console.log(`Menü verisi yazıldı: public/menu.json (${(Buffer.byteLength(text) / 1024).toFixed(1)} KB)`);
}

// ---------- ana akış ----------
// İkinci sitenin ayarı: config.json'daki ürün adresleri (slug) o mağazanın adreslerine çevrilir.
// Sıra: config.<SITE>.json > slugMap (elle) → aynı adres → 1. mağazadaki ürün adıyla eşleşen ürün. Bulunamayan atlanır.
async function siteConfig(base) {
  let over = {};
  try { over = JSON.parse(await readFile(join(ROOT, `config.${SITE}.json`), 'utf8')); } catch {}
  return { ...base, ...over };
}
async function remapConfig(config, out) {
  const fold2 = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const have = new Set(out.items.map((p) => p.s)), byName = new Map(out.items.map((p) => [fold2(p.n), p.s]));
  let main1 = new Map();
  try { main1 = new Map(JSON.parse(await readFile(join(ROOT, 'public', 'products.json'), 'utf8')).items.map((p) => [p.s, p.n])); } catch {}
  const manual = config.slugMap || {}, miss = new Set();
  const m = (s) => {
    const r = manual[s] || (have.has(s) ? s : byName.get(fold2(main1.get(s) || '')));
    if (!r || !have.has(r)) { miss.add(s); return null; }
    return r;
  };
  const arr = (a) => (a || []).map(m).filter(Boolean);
  const c = { ...config };
  for (const k of ['boost', 'bestsellers']) if (c[k]) c[k] = arr(c[k]);
  if (c.crossSell) c.crossSell = c.crossSell.map((x) => ({ ...x, offer: arr(x.offer) }));
  if (c.categoryImages) c.categoryImages = Object.fromEntries(Object.entries(c.categoryImages).map(([n, s]) => [n, m(s)]).filter((x) => x[1]));
  if (c.guides) c.guides = c.guides.map((g) => ({ ...g, product: g.product && m(g.product) || undefined }));
  if (c.desktopMenu && c.desktopMenu.picks) c.desktopMenu = { ...c.desktopMenu, picks: Object.fromEntries(Object.entries(c.desktopMenu.picks).map(([n, a]) => [n, arr(a)])) };
  delete c.slugMap;
  if (miss.size) console.warn(`UYARI (${SITE}): bu mağazada karşılığı bulunamayan ürün adresleri atlandı (config.${SITE}.json > slugMap ile eşleştirilebilir): ${[...miss].join(', ')}`);
  // Adıyla anılan kategoriler bu mağazada var mı (yoksa o ayar sessizce etkisiz kalır)
  const cats = new Set(out.cats.map((x) => fold(x.n)));
  const names = [...(c.categoryOrder || []), ...((c.desktopMenu || {}).items || []), ...(c.featured || []).map((f) => f.category)].filter(Boolean);
  const noCat = [...new Set(names.filter((n) => !cats.has(fold(n))))];
  if (noCat.length) console.warn(`UYARI (${SITE}): bu mağazada bulunmayan kategori adları: ${noCat.join(', ')}`);
  return c;
}

async function main() {
  let config = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  if (SITE) {
    config = await siteConfig(config);
    if (!env.MENU_ONLY && (!env.IKAS_CLIENT_ID || !env.IKAS_CLIENT_SECRET)) { console.warn(`UYARI: ${SITE} için API anahtarları yok, atlandı.`); return; }
  }
  // Sadece menü verisini mevcut products.json'dan üret (API'ye gitmeden): MENU_ONLY=1 node scripts/sync.mjs
  if (env.MENU_ONLY) {
    const cur = JSON.parse(await readFile(OUT, 'utf8'));
    cur.config = config = SITE ? await remapConfig(config, cur) : config;
    catCovers(cur, config);
    await writeFile(OUT, JSON.stringify(cur));
    await writeMenu(cur);
    return;
  }
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
  if (SITE) out.config = config = await remapConfig(config, out);
  // Başka bir mağazanın ürünlerini sadece dosyaya yaz (karşılaştırma için; eğilim/menü/rapor yapılmaz):
  // STORE_OUT=/tmp/magaza2.json IKAS_STORE=... node scripts/sync.mjs
  if (env.STORE_OUT) {
    await writeFile(env.STORE_OUT, JSON.stringify(out));
    console.log(`Yazıldı: ${env.STORE_OUT} (${out.items.length} ürün, ${out.cats.length} kategori)`);
    return;
  }

  // Eğilimler: hata olursa ürün senkronu yine de tamamlanır
  try {
    const [trends, orders] = await Promise.all([fetchTrends(), fetchOrders()]);
    const an = applyTrends(out, trends, orders, config);
    await writeReport(out, trends, orders, an, config);
  } catch (e) {
    console.warn('UYARI: eğilim hesaplanamadı: ' + (e.stack || e.message).slice(0, 300));
  }
  catCovers(out, config);
  await writeMenu(out);

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
