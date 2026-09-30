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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'products.json');
const API = 'https://api.myikas.com/api/v1/admin/graphql';
const env = process.env;

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
