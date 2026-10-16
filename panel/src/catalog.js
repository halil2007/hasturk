// Kategori eşleştirme ve pazaryerine ürün yükleme ("Ürün yükle" ekranı).
// Panel ürünlerinin kategorisi ana katalog sitesinden (ikas) gelir. Her ikas kategorisi, her pazaryeri için bir kategoriye
// ve o kategorinin özellik değerlerine (ör. Menşei = TR, Ağırlık = ürünün varyant adından) bir kez eşlenir.
// Yükleme: henüz o kanalda ilanı olmayan ürünler, eşleştirmedeki değerlerle kanalın ürün servisine gönderilir; kanalın
// verdiği takip kimliğiyle (HB trackingId / Trendyol batchRequestId) sonuç sorgulanır. Onaylanan ürün, ilanlar
// çekilince barkod / SKU ile otomatik eşleşir.
import { all, first, run, allIn, getRaw, setSetting, getSettings, log, notify, resolve } from './db.js';
import { getChannels } from './channels/index.js';
import { importListings, catalogOf, HELD_SQL } from './sync.js';
import { fail, str, num, r2, isImageAttr, variantAxes, cleanHtml } from './util.js';
export { variantAxes };
import { rank, localProfile, prepare, score } from './catmatch.js';
import { quantities, withoutQty, norm as normQ } from './match.js';

const NO_API = { pttavm: 'Ürün yükleme PttAVM panelinden yapılır' };
// Test modülündeki kanallar: ürün yükleme henüz yok (ilanlar kanalın kendi panelinden açılır; stok / fiyat panelden gider)
const NO_UPLOAD = ['shopify', 'woocommerce', 'opencart', 'boyner', 'pasaj', 'trendyolgo', 'getir', 'yemeksepeti', 'ticimax', 'ideasoft', 'tsoft'];
const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/,/g, '.').replace(/\s+/g, '').replace(/(lt|litre|l)$/, 'lt').replace(/(kg|kilo|kilogram)$/, 'kg');

async function targets(env, db) {
  return (await getChannels(env, db)).filter((c) => c.type !== 'ikas' && !NO_UPLOAD.includes(c.type) && (c.enabled || NO_API[c.type] && !c.paused));
}
export async function target(env, db, id) {
  const c = (await getChannels(env, db)).find((x) => x.id === id);
  if (!c) fail(404, 'Kanal yok');
  if (c.hold) fail(400, `${c.name} beklemede: yazma işlemleri kapalı`);
  if (!c.enabled || !c.catalog) fail(400, NO_API[c.type] || `${c.name} için ürün yükleme desteklenmiyor ya da API bilgileri girilmemiş`);
  return c;
}
async function mapOf(db, local, ch) {
  const m = await first(db, 'SELECT * FROM category_map WHERE local = ? AND channel = ?', local, ch);
  return m && { ...m, attrs: JSON.parse(m.attrs || '{}') };
}

// Panel ürünü → kanala gidecek ortak ürün bilgisi
export async function productsFor(db, settings, { local, ch, ids }) {
  const cats = catalogOf(settings);
  const ph = cats.map(() => '?').join(',');
  const q = (where) => `SELECT p.*, (SELECT MAX(l.price) FROM listings l WHERE l.product_id = p.id AND l.channel IN (${ph})) AS cat_price,
      (SELECT MAX(l.list_price) FROM listings l WHERE l.product_id = p.id AND l.channel IN (${ph})) AS cat_list,
      EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.channel = ?) AS listed,
      -- İlan kanalda var ama yayında değil (kanal onayı bekliyor / onaylamadı): "durum|not"; yayında bir ilan varsa boş
      (SELECT CASE WHEN SUM(NOT ${HELD_SQL()}) > 0 THEN NULL ELSE MAX(l.remote_state || '|' || COALESCE(l.remote_state_note, '')) END FROM listings l WHERE l.product_id = p.id AND l.channel = ?) AS held
    FROM products p WHERE p.active = 1 AND ${where} ORDER BY COALESCE(NULLIF(p.group_name, ''), p.name), p.variant_name LIMIT 500`;
  if (!ids) return all(db, q("COALESCE(p.category, '') = ?"), ...cats, ...cats, ch, ch, local);
  // Seçili ürünler parça parça okunur (D1 sorgu başına en fazla 100 değer), sonra aynı sırayla dizilir
  const key = (p) => `${p.group_name || p.name}\u0000${p.variant_name || ''}`;
  return (await allIn(db, ids, (ph2, part) => [q(`p.id IN (${ph2})`), [...cats, ...cats, ch, ch, ...part]], 60)).sort((a, b) => key(a).localeCompare(key(b))).slice(0, 500);
}
// Varyant grubu kodu (Trendyol / idefix / N11 productMainId, Hepsiburada VaryantGroupID): aynı ana ürünün varyantları aynı kodla gider.
// Sıra: ürünün model kodu → ikas ana ürün kimliği (parent_key) → ana ürün adından sabit kod → SKU
const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
export const slug = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => TR_ASCII[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 40);
export const groupCode = (p) => str(p.model_code).trim() || str(p.parent_key).split(':').pop() || slug(p.group_name) || str(p.sku);
// Fiyat farkı (%): "%10", "10,5", " 10 " gibi yazımlar okunur; eski kayıtlardaki "%10" de doğru uygulanır
export const markupPct = (v) => { const x = Number(String(v ?? '').replace(/[%\s]/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
// Kaydederken: boş = kaldır (''), sayı değilse ya da -50…300 dışındaysa açıklamalı hata
export function cleanMarkup(v) {
  const s = String(v ?? '').replace(/[%\s]/g, '').replace(',', '.');
  if (!s) return '';
  const x = Number(s);
  if (!Number.isFinite(x)) fail(400, `Fiyat farkı sayı olmalı (ör. 10); yazılan: “${String(v).slice(0, 20)}”`);
  if (x < -50 || x > 300) fail(400, 'Fiyat farkı -50 ile 300 arasında olmalı (yüzde)');
  return String(Math.round(x * 100) / 100);
}
export function shape(p, opts, zeroStock) {
  const base = p.cat_price > 0 ? p.cat_price : p.sale_price;
  const k = 1 + markupPct(opts.markup) / 100;
  // Kanal görselinin küçük boyutu büyüğüyle değiştirilir (panelde barındırılan fotoğrafın adresine dokunulmaz: /img/<firma>/<kimlik>.jpg)
  const big = (u) => (/\/img\/[^/]+\/[a-f0-9]{32}\.\w+$/.test(str(u)) ? str(u) : str(u).replace(/\/(180|360)\//, '/1080/'));
  // Ürünün liste (üstü çizili) fiyatı: satış fiyatından düşükse kullanılmaz
  const own = num(p.list_price) > 0 && num(p.list_price) >= base ? num(p.list_price) : 0;
  const img = big(p.image);
  // Tüm görsel bağlantıları (ana görsel önce, tekrarsız): pazaryerine ek görsel olarak gider
  let extra = [];
  try { extra = JSON.parse(p.images || '[]'); } catch { /* bozuk liste */ }
  const images = [...new Set([img, ...extra.map(big)].filter(Boolean))].slice(0, 10);
  return {
    id: p.id, sku: str(p.sku), barcode: str(p.barcode), name: str(p.name), brand: str(p.brand), description: cleanHtml(p.description) || str(p.name),
    image: img || images[0] || '', images, vat: p.vat ?? 20, desi: p.desi || 1, stock: zeroStock ? 0 : Math.max(0, Math.round(p.stock || 0)),
    price: r2(base * k), listPrice: r2((own || Math.max(p.cat_list || 0, base)) * k), weight: num(p.weight) > 0 ? num(p.weight) : null,
    group: groupCode(p), variant: str(p.variant_name),
  };
}
// Varyant adından (ör. "5 Kg") kanalın değer listesindeki karşılığını bul
export function picker(c, catId) {
  const cache = new Map();
  // One axis value against the list: exact, else same canonical quantity ("500 ml" = "0,5 Lt", "5000 gr" = "5 Kg"; "15 Kg" never "5 Kg")
  const one = (list, text) => {
    const t = norm(text), q = [...quantities(text)].sort().join(',');
    return list.find((v) => norm(v.value) === t) || (q && list.find((v) => [...quantities(v.value)].sort().join(',') === q)) || null;
  };
  return async (attr, text) => {
    if (!text) return null;
    if (!cache.has(attr.id)) cache.set(attr.id, await c.catalog.values(catId, attr.id).catch(() => []));
    const list = cache.get(attr.id);
    const whole = one(list, text);
    if (whole) return whole;
    // Multi-axis variant ("Kırmızı / XL", "1 Lt / 6 Adet"): each axis is tried on its own; exactly one axis may match this attribute
    const parts = variantAxes(text);
    if (parts.length < 2) return null;
    const hits = [...new Map(parts.map((x) => one(list, x)).filter(Boolean).map((h) => [String(h.id), h])).values()];
    return hits.length === 1 ? hits[0] : null;
  };
}
// ---------- eksik zorunlu özellikleri ürün bilgisinden algılama (yalnız kesin eşleşmede) ----------
// Ölçü özelliği (değerleri "5 kg", "500 ml", "3 adet"…): üründe (varyant, ad) o türden TEK ölçü varsa ve listede aynı ölçü varsa.
// Metin özelliği ("Ürün Tipi": Katı, Sıvı…): listedeki değerlerden yalnız BİRİ ürün varyantında / adında / kategorisinde kelimesi
// kelimesine geçiyorsa (sırayla bakılır; aynı yerde birden çok değer geçerse belirsizdir, seçilmez). Genel değerler (Diğer, Yok…) seçilmez.
const QFAM = (q) => (/(?:mg|mcg|g|kg)$/.test(q) ? 'mass' : /(?:ml|l)$/.test(q) ? 'vol' : /(?:ad|pk)$/.test(q) ? 'count' : q.replace(/^[\d.]+/, ''));
const toKg = (t) => String(t || '').replace(/(\d+(?:[.,]\d+)?)\s*ton\b/gi, (m, v) => `${Number(v.replace(',', '.')) * 1000} kg`);
// Ölçüler: tekli ("15 kg" → 15kg) ve çoklu paket ("6 x 405 gr" → 6x405g; içindeki 405 gr ayrıca sayılmaz)
const PACK = /(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?\s*['’]?\s*[a-zçğıöşü]+)/gi;
function qtyKeys(t) {
  const out = [];
  // "400 Grx6 Adet" / "5x14 Grx12": birime bitişik "x" ayrılır (yoksa "400 Gr" ölçü olarak okunmaz)
  const rest = toKg(t).replace(/(\d\s*(?:kg|gr|g|mg|ml|lt|l|cl|adet|paket))\s*[x×]\s*(?=\d)/gi, '$1 x ').replace(PACK, (m, n, q) => {
    const one = [...quantities(q)];
    if (one.length !== 1) return m;
    out.push(+n > 1 ? { key: `${+n}x${one[0]}`, fam: 'pack-' + QFAM(one[0]) } : { key: one[0], fam: QFAM(one[0]) });
    return ' ';
  });
  for (const q of quantities(rest)) out.push({ key: q, fam: QFAM(q) });
  return { keys: [...new Map(out.map((x) => [x.key, x])).values()], rest };
}
// Değer yalnız tek bir ölçüden mi oluşuyor ("5 kg", "6 x 405 gr" evet; "10 lt / H - 5 Bar", "2 kg + 2 adet Pouch Hediye", "15kg - 100 gr" hayır)
function pureQty(v) {
  const { keys, rest } = qtyKeys(v);
  return keys.length === 1 && !/[a-z0-9]/.test(withoutQty(rest)) ? keys[0] : null;
}
const GENERIC = /^(di[gğ]er|yok|belirtilmemi[sş]|standart|karışık|karisik|mevcut de[gğ]il|hepsi|genel|other|none)$/i;
const wordsKey = (t) => ` ${normTr(t).replace(/[^a-z0-9]+/g, ' ').trim()} `;
function normTr(t) { return String(t || '').toLocaleLowerCase('tr').replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c'); }
// Set / kampanya / hediyeli / seçenekli ürün ("20 Lt Toprak + Bitki Besini", "… Seti", "Torf Hediye", "Seçilebilir Renk … Ücretsiz Toprak"):
// addaki ölçü / kelime ürünün kendisini değil eki ya da seçeneği anlatıyor olabilir: addaki ölçü kullanılmaz, addaki tek değer ancak kategori de
// aynısını söylüyorsa seçilir (varyant her zaman kullanılır)
const BUNDLE = /\+|\b(set|seti|setler\w*|kampanya\w*|hediye\w*|ucretsiz|secilebilir|secenekli)\b/;
export function inferValue(list, p) {
  const vals = (list || []).filter((v) => str(v.value) && !GENERIC.test(str(v.value).trim()));
  if (!vals.length) return null;
  const vq = vals.map((v) => ({ v, q: pureQty(v.value) }));
  const pure = vq.filter((x) => x.q);
  // Ölçü özelliği: değerlerin çoğu yalnız ölçü
  if (pure.length >= Math.max(2, vals.length * 0.6)) {
    const fams = new Set(pure.map((x) => x.q.fam));
    for (const t of [p.variant_name, p.name]) {
      if (!str(t)) continue;
      const all = qtyKeys(t).keys;
      let mine = all.filter((k) => fams.has(k.fam));
      // Ölçü + adet birlikte: koli ("400 Gr - 12 Adet" = 12 x 400 gr) yalnız listede o paket değeri varsa; yoksa ya da daha karmaşıksa
      // ("5x14 Gr x 12 Paket", "4'lü … 20 Kg (260 Litre)") belirsiz: tek ölçüyü seçmek ürünün tamamını yanlış anlatır
      const cnt = all.filter((k) => k.fam === 'count' && parseFloat(k.key) > 1), meas = all.filter((k) => k.fam !== 'count');
      if (cnt.length && meas.length) {
        const pack = cnt.length === 1 && meas.length === 1 && !meas[0].fam.startsWith('pack-') ? `${parseFloat(cnt[0].key)}x${meas[0].key}` : '';
        if (!pack || !pure.some((x) => x.q.key === pack)) return null;
        mine = [{ key: pack }];
      }
      if (!mine.length) continue;
      // ölçü birden çok (ör. "1 Ton … 20 kg'lık", "4-5 Kg / 65 Lt") ya da set / kampanya / seçenekli ürün → belirsiz
      if (mine.length !== 1 || BUNDLE.test(normQ(t))) return null;
      const hits = pure.filter((x) => x.q.key === mine[0].key);
      if (!hits.length) return null;
      // Aynı ölçünün listede farklı yazımları ("1.5 kg" / "1500 gr"): hepsi doğru; üründeki yazıma en yakını (sayı aynı olan) seçilir
      const num = (x) => (normQ(x).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => String(+n.replace(',', '.')));
      const mineNums = new Set(num(t)), h = hits.find((x) => num(x.v.value).every((n) => mineNums.has(n))) || hits[0];
      return { id: String(h.v.id), value: str(h.v.value), auto: true };
    }
    return null;
  }
  // Metin özelliği: varyant → ürün adı → kategori yaprağı → kategori yolu
  const cat = String(p.category || '');
  const bundle = BUNDLE.test(normQ(p.name));
  let pending = null; // set / hediyeli ürün adında tek değer: ancak kategori de aynı değeri söylerse seçilir
  for (const t of [p.variant_name, p.name, cat.split(/›|>/).pop(), cat]) {
    const k = wordsKey(t);
    if (k.trim() === '') continue;
    // Yalnız rakamdan oluşan değer ("5") metinde ölçü / kod parçasıyla karışır: metin eşleşmesinde kullanılmaz
    const hits = vals.filter((v) => { const w = wordsKey(v.value); return w.trim().length >= 2 && !/^\d+([.,]\d+)?$/.test(str(v.value).trim()) && k.includes(w); });
    // Biri diğerini içeriyorsa (ör. "Solucan Gübresi" ve "Gübre") en uzunu
    const best = hits.filter((h) => !hits.some((o) => o !== h && wordsKey(o.value).includes(wordsKey(h.value))));
    // Set / hediyeli / seçenekli ürünün adında geçen değer eki ya da seçeneği anlatıyor olabilir ("Ücretsiz Toprak", "Sıvı ve Katı … Seti"):
    // adda birden çok değer → belirsiz; tek değer → kategoride de aynısı geçerse
    if (t === p.name && bundle) { if (best.length > 1) return null; if (best.length === 1) pending = best[0]; continue; }
    if (pending) {
      if (!best.length) continue;
      return best.length === 1 && best[0] === pending ? { id: String(pending.id), value: str(pending.value), auto: true } : null;
    }
    if (best.length === 1) return { id: String(best[0].id), value: str(best[0].value), auto: true };
    if (best.length > 1) return null;
  }
  return null;
}
// Marka: ürünün marka alanı boşsa paneldeki markalardan yalnız biri ürün adında geçiyorsa o
export function inferBrand(name, brands) {
  const k = wordsKey(name);
  const hits = (brands || []).filter((b) => { const w = wordsKey(b); return w.trim().length >= 2 && k.includes(w); });
  const best = hits.filter((h) => !hits.some((o) => o !== h && wordsKey(o).includes(wordsKey(h))));
  return best.length === 1 ? best[0] : '';
}
export async function autoFill(c, catId, m, p, missing) {
  const attrs = await c.catalog.attributes(catId).catch(() => []), add = {}, filled = [];
  for (const a of attrs) {
    if (!a.mandatory || isImageAttr(a)) continue;
    if (!missing.some((x) => x === a.name || x.startsWith(a.name + ' ('))) continue;
    const v = inferValue(await c.catalog.values(catId, a.id).catch(() => []), p);
    if (v) { add[a.id] = { id: v.id, value: v.value }; filled.push({ attr: a.id, name: a.name, value: v.value }); }
  }
  return { attrs: { ...m.attrs, ...add }, filled };
}

async function buildAll(c, map, prods, opts, zeroStock, db) {
  const pick = picker(c, map.remote_id), out = [];
  // Marka eşleştirmesi (Kanallarda yayınla ekranında seçilen / adı birebir aynı bulunup hatırlanan kanal markası): ürün markasının adı
  // kanaldakiyle aynı olmasa da eşleşmiş marka kullanılır
  const brands = db && c.catalog.brands && !c.catalog.brandByCategory ? new Map((await all(db, 'SELECT brand, remote_id, remote_name FROM brand_map WHERE channel = ? AND COALESCE(remote_id, \'\') != \'\'', c.id).catch(() => [])).map((r) => [r.brand, r])) : new Map();
  // Marka alanı boş ürün: paneldeki markalardan adında geçen (tek) marka
  const known = db && prods.some((p) => !str(p.brand)) ? (await all(db, "SELECT DISTINCT brand FROM products WHERE COALESCE(TRIM(brand), '') != ''").catch(() => [])).map((r) => r.brand) : [];
  for (const p of prods) {
    const pr = shape(p, opts, zeroStock), auto = [];
    if (!str(p.brand) && known.length) { const g = inferBrand(p.name, known); if (g) { pr.brand = g; auto.push({ name: 'Marka', value: g }); } }
    const bm = brands.get(str(pr.brand));
    if (bm) { pr.brandId = bm.remote_id; pr.brand = str(bm.remote_name) || pr.brand; }
    const m = str(p.origin) ? { ...map, attrs: await withOrigin(c, map.remote_id, map.attrs || {}, p) } : map;
    try {
      let b = await c.catalog.build(pr, m, { opts, pick });
      // Eksik zorunlu özellik: ürün bilgisinden kesin algılanabiliyorsa doldurulup yeniden kurulur (doldurulanlar listede "otomatik")
      if (b.missing.length) {
        const f = await autoFill(c, map.remote_id, m, p, b.missing);
        if (f.filled.length) { b = await c.catalog.build(pr, { ...m, attrs: f.attrs }, { opts, pick }); auto.push(...f.filled); }
      }
      out.push({ p: pr, ...b, auto });
    } catch (e) { out.push({ p: pr, key: pr.barcode || pr.sku, missing: ['hata: ' + e.message], auto }); }
  }
  return out;
}

// ---------- kategori eşleştirme önerisi ----------
// Puanlama src/catmatch.js'te: ikas kategori yolu + o kategorideki ürün adları, pazaryeri kategorisinin adı ve yoluyla;
// Türkçe ekler, eş anlamlılar ve tarım/bahçe kavramları (ilaçlama pompası ≠ su pompası, organik ≠ kimyevi gübre) dikkate alınır.
export function scoreCategory(local, c, names = []) { return score(localProfile(local, names), prepare([c])[0]).score; }
export const namesOf = async (db, local) => (await all(db, "SELECT name FROM products WHERE active = 1 AND COALESCE(category, '') = ? ORDER BY updated_at DESC LIMIT 60", local)).map((r) => r.name);
async function suggest(db, c, local, n = 5) {
  if (!local || !c.catalog.allCategories) return [];
  return rank(await c.catalog.allCategories(), local, await namesOf(db, local), n);
}
// "Güçlü öneri": açık farkla en iyi aday; iki aday birbirine çok yakınsa "zayıf öneri" (her iki durumda da onay gerekir)
const AUTO_MIN = 6, AUTO_LEAD = 2;
export const confident = (r) => !!r[0] && !r[0].generic && r[0].score >= AUTO_MIN && (!r[1] || r[0].score - r[1].score >= AUTO_LEAD);
// Menşei: mağaza ayarı "Ürünlerin menşei" (varsayılan Türkiye); ürün kartında ayrıca girilmişse o ürün için o geçerli.
// Kanal listesindeki değer ülke adı ya da ISO koduyla bulunur ("Türkiye" = "TR", "Çin" = "CN" …).
export const DEFAULT_ORIGIN = 'Türkiye';
export const isOriginAttr = (a) => /men[sş]e|origin|[üu]retim yeri/i.test(String((a && a.name) || ''));
const COUNTRY = [['türkiye', 'turkiye', 'turkey', 'tr'], ['çin', 'cin', 'china', 'cn', 'çin halk cumhuriyeti'], ['almanya', 'germany', 'de'], ['italya', 'italy', 'it'], ['fransa', 'france', 'fr'],
  ['ispanya', 'spain', 'es'], ['abd', 'amerika', 'amerika birleşik devletleri', 'usa', 'us'], ['ingiltere', 'birleşik krallık', 'uk', 'gb'], ['japonya', 'japan', 'jp'], ['güney kore', 'kore', 'korea', 'kr'],
  ['hindistan', 'india', 'in'], ['vietnam', 'vn'], ['tayvan', 'taiwan', 'tw'], ['polonya', 'poland', 'pl'], ['bangladeş', 'bangladesh', 'bd'], ['pakistan', 'pk'], ['yunanistan', 'greece', 'gr']];
const ckey = (s) => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const countryOf = (s) => { const k = ckey(s); return COUNTRY.find((g) => g.includes(k)) || [k]; };
export const originOf = (settings, p) => str(p && p.origin) || str(settings && settings.origin) || DEFAULT_ORIGIN;
// Değer listesinde ülkenin karşılığı; liste yoksa (serbest metin) ülke adı, listede yoksa null (eksik olarak sorulur)
export function originValue(list, origin, free) {
  const g = countryOf(origin), hit = (list || []).find((x) => g.includes(ckey(x.value)));
  if (hit) return { id: hit.id, value: hit.value };
  return free || !(list || []).length ? { value: str(origin) } : null;
}
// Kategori özelliklerini mümkün olduğunca otomatik doldur: varyant özellikleri ürünün varyant adından, Menşei = mağaza ayarı
export async function autoAttrs(c, catId, { origin = DEFAULT_ORIGIN } = {}) {
  const out = {}, missing = [];
  for (const a of await c.catalog.attributes(catId)) {
    if (a.kind === 'variant') { out[a.id] = { value: '@variant' }; continue; }
    if (!a.mandatory) continue;
    if (isImageAttr(a)) { out[a.id] = { value: '@image' }; continue; }
    if (isOriginAttr(a)) {
      const v = originValue(await c.catalog.values(catId, a.id).catch(() => []), origin, a.custom || !/enum/i.test(a.type || ''));
      if (v) { out[a.id] = v; continue; }
    }
    missing.push(a.name);
  }
  return { attrs: out, missing };
}
// Ürüne özel menşei (ürün kartı): kategorinin Menşei değeri bu ürün için değiştirilir; kanal listesinde yoksa değer kalkar (eksik sorulur)
export async function withOrigin(c, catId, attrs, p) {
  if (!str(p && p.origin)) return attrs;
  const out = { ...attrs };
  for (const a of await c.catalog.attributes(catId).catch(() => [])) {
    if (!isOriginAttr(a)) continue;
    const v = originValue(await c.catalog.values(catId, a.id).catch(() => []), p.origin, a.custom || !/enum/i.test(a.type || ''));
    if (v) out[a.id] = v; else delete out[a.id];
  }
  return out;
}
// Kanal kategori ağacından kaldırılmış eşleşmeler: ağaç okunamazsa ya da boşsa hiçbir eşleşme "kaldırılmış" sayılmaz
export const STALE_MSG = 'Kategori kanalda kaldırılmış; yeniden eşleştirin';
export async function staleCheck(c) {
  let list = [];
  try { list = c.catalog && c.catalog.allCategories ? await c.catalog.allCategories() : []; } catch (e) { if (e.budget) throw e; }
  if (!list || !list.length) return () => false;
  const ids = new Set(list.map((x) => String(x.id)));
  return (id) => !ids.has(String(id));
}
// Kanalda kaldırılmış kategoriler için uyarı (aynı uyarı açıkken tekrar yazılmaz; kalmadıysa kapanır)
export async function staleNotice(db, c, locals) {
  const key = `catstale:${c.id}`;
  if (!locals.length) return resolve(db, key);
  const msg = `${locals.slice(0, 5).join(', ')}${locals.length > 5 ? ` ve ${locals.length - 5} kategori daha` : ''} · Kategori eşleştirme sayfasından yeni kategoriyi seçin.`;
  const cur = await first(db, 'SELECT msg, resolved_at FROM notices WHERE key = ?', key).catch(() => null);
  if (cur && !cur.resolved_at && cur.msg === msg) return;
  await notify(db, key, { level: 'warn', channel: c.id, title: `${c.name}: ${STALE_MSG}`, msg });
}
// Öneri kaydı: eşleşme yapılınca öneri temizlenir ama reddedilenler kalır (kaldırılan / reddedilen kategori bir daha önerilmez)
export async function clearSuggest(db, local, ch) {
  await run(db, "DELETE FROM category_suggest WHERE local = ? AND channel = ? AND COALESCE(rejected, '') IN ('', '[]')", local, ch);
  await run(db, 'UPDATE category_suggest SET remote_id = NULL, remote_name = NULL, path = NULL, score = NULL, sure = 0 WHERE local = ? AND channel = ?', local, ch);
}
// Eşleşme kaldırıldı / değiştirildi: eski kategori reddedilenlere eklenir; yeni öneri hazırlanır (created_at = 0) ama "kesin" sayılmaz
export async function rejectMapped(db, local, ch, remoteId, { fresh = true } = {}) {
  if (!str(remoteId)) return;
  const sg = await first(db, 'SELECT rejected FROM category_suggest WHERE local = ? AND channel = ?', local, ch);
  let rej = [];
  try { rej = JSON.parse((sg && sg.rejected) || '[]'); } catch { /* bozuk */ }
  rej = [...new Set([...rej.map(String), String(remoteId)])];
  await run(db, `INSERT INTO category_suggest (local, channel, remote_id, remote_name, path, score, sure, rejected, created_at) VALUES (?, ?, NULL, NULL, NULL, NULL, 0, ?, ?)
    ON CONFLICT (local, channel) DO UPDATE SET rejected = excluded.rejected${fresh ? ', remote_id = NULL, remote_name = NULL, path = NULL, score = NULL, sure = 0, created_at = 0' : ''}`, local, ch, JSON.stringify(rej), fresh ? 0 : Date.now());
}
// Önerilen eşleşme: eşleştirilmemiş ikas kategorileri için en uygun pazaryeri kategorisi ÖNERİLİR (category_suggest), eşleştirilmez.
// Kullanıcı "Onayla" derse eşleşir; beğenmezse kendisi başka kategori seçer (reddedilen kategori o ikas kategorisine tekrar önerilmez).
// sure: açık farkla en iyi aday (yine de onay gerekir); değilse "zayıf öneri" diye gösterilir.
async function suggestAll(db, settings, c, { redo = false } = {}) {
  await migrateAuto(db);
  const cats = catalogOf(settings), ph = cats.map(() => '?').join(',');
  const locals = (await all(db, `SELECT DISTINCT COALESCE(p.category, '') AS local FROM products p WHERE p.active = 1 AND COALESCE(p.category, '') != ''
    AND EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.channel IN (${ph}))
    AND NOT EXISTS (SELECT 1 FROM category_map m WHERE m.local = p.category AND m.channel = ?)`, ...cats, c.id)).map((r) => r.local);
  const old = new Map((await all(db, 'SELECT local, remote_id, rejected FROM category_suggest WHERE channel = ?', c.id)).map((r) => [r.local, r]));
  const suggested = [], none = [], t = Date.now();
  for (const local of locals) {
    const prev = old.get(local);
    if (prev && prev.remote_id && !redo) { suggested.push({ local }); continue; }
    const rej = new Set(JSON.parse((prev && prev.rejected) || '[]').map(String));
    const r = (await suggest(db, c, local, 5 + rej.size)).filter((x) => !rej.has(String(x.id))), best = r[0];
    if (!best || best.score < 2) { none.push({ local, reason: best ? `en yakın: ${best.name} (benzerlik düşük)` : 'uygun kategori bulunamadı' }); }
    await run(db, `INSERT INTO category_suggest (local, channel, remote_id, remote_name, path, score, sure, rejected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, path = excluded.path, score = excluded.score, sure = excluded.sure, created_at = excluded.created_at`,
    local, c.id, best && best.score >= 2 ? String(best.id) : null, best && best.score >= 2 ? best.name : null, best && best.score >= 2 ? best.path || '' : null,
    best ? best.score : null, confident(r) && !rej.size ? 1 : 0, JSON.stringify([...rej]), t);
    if (best && best.score >= 2) suggested.push({ local, remote: best.name, path: best.path, sure: confident(r) && !rej.size });
  }
  return { suggested, none };
}
// Eski sürümün kendiliğinden yaptığı (onaysız) eşleştirmeler bir kez öneriye çevrilir: kullanıcı onaylayana kadar ürün gönderiminde kullanılmaz
async function migrateAuto(db) {
  if (await getRaw(db, 'once:catsuggest_1')) return;
  const rows = await all(db, "SELECT local, channel, remote_id, remote_name FROM category_map WHERE COALESCE(user, '') LIKE 'Otomatik%'");
  for (const r of rows) {
    await db.batch([
      db.prepare(`INSERT INTO category_suggest (local, channel, remote_id, remote_name, path, score, sure, rejected, created_at) VALUES (?, ?, ?, ?, '', NULL, 1, '[]', ?)
        ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, sure = 1`).bind(r.local, r.channel, r.remote_id, r.remote_name, Date.now()),
      db.prepare('DELETE FROM category_map WHERE local = ? AND channel = ?').bind(r.local, r.channel),
    ]);
  }
  if (rows.length) await log(db, null, 'info', `${rows.length} otomatik kategori eşleştirmesi onay bekleyen öneriye çevrildi (Ürünler → Pazaryerine yükle)`);
  await setSetting(db, 'once:catsuggest_1', Date.now());
}
// Öneriyi onayla: zorunlu özellikler mümkün olduğunca doldurulur, eşleşme kullanıcının adıyla kaydedilir
async function acceptSuggestion(db, c, local, user) {
  const sg = await first(db, 'SELECT * FROM category_suggest WHERE local = ? AND channel = ?', local, c.id);
  if (!sg || !sg.remote_id) fail(404, 'Bu kategori için öneri yok; “Eşleştir” ile kendiniz seçin');
  const { attrs, missing } = await autoAttrs(c, sg.remote_id, { origin: originOf(await getSettings(db)) });
  await run(db, `INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, attrs = excluded.attrs, updated_at = excluded.updated_at, user = excluded.user`,
  local, c.id, sg.remote_id, sg.remote_name, JSON.stringify(attrs), Date.now(), user.name);
  await clearSuggest(db, local, c.id);
  await log(db, c.id, 'info', `${user.name}: önerilen kategori onaylandı (${local} → ${sg.remote_name})`);
  return { ok: true, remote: sg.remote_name, missing };
}

// Mevcut eşleştirmeleri denetle: seçili kategori, yeni puanlamaya göre açıkça daha uygun bir kategorinin gerisinde kalıyorsa listelenir
async function review(db, c) {
  const list = c.catalog.allCategories ? await c.catalog.allCategories() : [];
  const byId = new Map(list.map((x) => [String(x.id), x])), out = [];
  for (const m of await all(db, 'SELECT local, remote_id, remote_name, user FROM category_map WHERE channel = ?', c.id)) {
    const names = await namesOf(db, m.local), L = localProfile(m.local, names);
    const r = rank(list, m.local, names, 2), best = r[0], curCat = byId.get(String(m.remote_id));
    const now = curCat ? score(L, prepare([curCat])[0]).score : null;
    if (!best || String(best.id) === String(m.remote_id) || !confident(r)) continue;
    if (now != null && best.score - now < 3 && now >= 3) continue;
    out.push({ local: m.local, current: { id: m.remote_id, name: m.remote_name, score: now }, best: { id: best.id, name: best.name, path: best.path, score: best.score }, auto: /^Otomatik/.test(m.user || '') });
  }
  return { items: out };
}

// ---------- otomatik ürün gönderimi (kanal bazında açılıp kapatılır) ----------
// Her senkronda: eşleştirilmemiş kategoriler için (günde bir) yalnız öneri hazırlanır; kullanıcının onayladığı kategorilerde kanalda henüz olmayan,
// stoğu olan ve son 14 günde gönderilmemiş ürünler (eksiği yoksa) gönderilir. Tek seferde en fazla 100 ürün.
// Otomatik gönderimde atlanacak ürünler (son 14 gün): kabul edilen ya da kanalın hâlâ işlediği ürün tekrar gönderilmez.
// Kanalın reddettiği (ya da isteği hiç kabul edilmeyen) ürün tekrar denenir: gönderimden sonra ürün düzeltildiyse 1 saat,
// düzeltilmediyse 24 saat sonra (aynı hatayla 15 dakikada bir tekrar gönderilmesin).
// Gönderimler + her ürünün kanal envanterinde (ilan olarak) görünüp görünmediği: "kabul" kanalın dosyayı işlediğini gösterir,
// ürünün mağazaya düştüğünü ise kanaldan çekilen ilanlarda aynı SKU'nun görünmesi kanıtlar.
async function uploadsWithListing(db) {
  const ups = (await all(db, 'SELECT id, channel, ref, status, items, result, error, user, created_at, checked_at FROM product_uploads ORDER BY id DESC LIMIT 30'))
    .map((u) => ({ ...u, items: JSON.parse(u.items || '[]'), result: JSON.parse(u.result || 'null') }));
  const chs = [...new Set(ups.map((u) => u.channel))];
  const have = new Set(chs.length ? (await all(db, `SELECT channel, UPPER(TRIM(sku)) AS s, product_id FROM listings WHERE channel IN (${chs.map(() => '?').join(',')})`, ...chs))
    .flatMap((l) => [`${l.channel}|s|${l.s}`, l.product_id ? `${l.channel}|p|${l.product_id}` : '']) : []);
  for (const u of ups) {
    for (const x of u.items) x.listed = have.has(`${u.channel}|s|${String(x.key || '').trim().toUpperCase()}`) || have.has(`${u.channel}|p|${x.id}`);
    u.listed = u.items.filter((x) => x.listed).length;
  }
  return ups;
}
export async function sentFilter(db, ch) {
  const ok = new Set(), failed = new Map();
  for (const u of await all(db, 'SELECT status, items, created_at FROM product_uploads WHERE channel = ? AND created_at > ? ORDER BY id', ch, Date.now() - 14 * 864e5)) {
    for (const x of JSON.parse(u.items || '[]')) {
      if (u.status === 'error' || x.ok === false) { failed.set(x.id, u.created_at); ok.delete(x.id); } else { ok.add(x.id); failed.delete(x.id); }
    }
  }
  const now = Date.now();
  return (p) => ok.has(p.id) || (failed.has(p.id) && now - failed.get(p.id) < ((p.updated_at || 0) > failed.get(p.id) ? 3600e3 : 864e5));
}
// Otomatik gönderimin kategorileri müşteri seçer (kanal başına; "tümü" ya da bir kısmı). Seçim özelliği gelmeden önce otomatik
// gönderimi açık olan kanallarda o güne kadar elle onaylanmış eşleşmeler bir kez seçili sayılır (çalışan gönderim durmasın).
export const AUTO_MAP_SQL = "COALESCE(user, '') NOT LIKE 'Otomatik%'"; // sistemin kendi onayladığı eşleşme otomatik gönderimde kullanılmaz
export async function autoCats(db, settings) {
  settings = settings || await getSettings(db);
  if (await getRaw(db, 'once:autoupload_cats')) return settings.auto_upload_cats || {};
  const cats = { ...(settings.auto_upload_cats || {}) };
  for (const ch of Object.keys(settings.auto_upload || {}).filter((k) => settings.auto_upload[k] && !cats[k])) {
    cats[ch] = (await all(db, `SELECT local FROM category_map WHERE channel = ? AND ${AUTO_MAP_SQL}`, ch)).map((r) => r.local);
  }
  await setSetting(db, 'auto_upload_cats', cats);
  await setSetting(db, 'once:autoupload_cats', Date.now());
  settings.auto_upload_cats = cats;
  return cats;
}
export async function autoUpload(env, db, settings) {
  settings = settings || await getSettings(db);
  const on = Object.keys(settings.auto_upload || {}).filter((k) => settings.auto_upload[k]);
  if (!on.length) return null;
  const chosen = await autoCats(db, settings);
  const out = {};
  const allOpts = (await getRaw(db, 'upload_opts')) || {};
  for (const c of await getChannels(env, db)) {
    if (!on.includes(c.id) || !c.enabled || !c.catalog || c.hold) continue;
    let items = null;
    try {
      // Eşleştirilmemiş kategoriler için yalnız öneri hazırlanır (günde bir); gönderim yalnız kullanıcının onayladığı eşleşmelerle
      const last = await getRaw(db, 'automap:' + c.id);
      if (!last || Date.now() - last > 864e5) { await suggestAll(db, settings, c); await setSetting(db, 'automap:' + c.id, Date.now()); }
      const skip = await sentFilter(db, c.id), stale = await staleCheck(c), gone = [];
      const ready = [];
      // Yalnız müşterinin otomatik gönderim için seçtiği ve kendisinin onayladığı kategori eşleşmeleri
      const pick = new Set(chosen[c.id] || []);
      for (const map of (await all(db, `SELECT * FROM category_map WHERE channel = ? AND ${AUTO_MAP_SQL}`, c.id)).filter((m) => pick.has(m.local)).map((m) => ({ ...m, attrs: JSON.parse(m.attrs || '{}') }))) {
        if (ready.length >= 100) break;
        if (stale(map.remote_id)) { gone.push(map.local); continue; }
        const prods = (await productsFor(db, settings, { local: map.local, ch: c.id })).filter((p) => !p.listed && !skip(p) && (p.stock || 0) > 0).slice(0, 100 - ready.length);
        if (!prods.length) continue;
        for (const x of await buildAll(c, map, prods, allOpts[c.id] || {}, false, db)) if (!x.missing.length) ready.push(x);
      }
      if (gone.length) await staleNotice(db, c, gone).catch(() => {});
      if (!ready.length) { out[c.id] = 0; continue; }
      items = ready.map((x) => ({ id: x.p.id, key: x.key, name: x.p.name }));
      const r = await c.catalog.send(ready.map((x) => x.payload));
      const row = await first(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at) VALUES (?, ?, 'sent', ?, 'Otomatik', ?) RETURNING id", c.id, r.ref, JSON.stringify(items), Date.now());
      await markSent(db, c.id, items.map((x) => x.id), row && row.id, r.ref);
      await log(db, c.id, 'info', `Otomatik gönderim: ${ready.length} yeni ürün ${c.name}'a gönderildi · takip ${r.ref}`);
      out[c.id] = ready.length;
    } catch (e) {
      out[c.id] = 'hata: ' + e.message;
      await log(db, c.id, 'error', 'Otomatik ürün gönderimi başarısız: ' + e.message);
      // Gönderilemeyen ürünler kaydedilir: 2 dakikada bir aynı ürünler yeniden gönderilmez (ürün düzeltilirse 1 saat, yoksa 24 saat sonra denenir)
      if (items && items.length) {
        await run(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at, error) VALUES (?, '', 'error', ?, 'Otomatik', ?, ?)", c.id, JSON.stringify(items.map((x) => ({ ...x, ok: false, error: e.message.slice(0, 300) }))), Date.now(), e.message.slice(0, 400));
        await notify(db, `autoupload:${c.id}`, { level: 'warn', channel: c.id, title: `${c.name}: otomatik ürün gönderimi başarısız (${items.length} ürün)`, msg: e.message.slice(0, 400) + ' · Ürünler 24 saat sonra (ürünü düzeltirseniz 1 saat sonra) yeniden denenir.' });
      }
    }
  }
  return out;
}

export async function catalogApi(env, db, ctx, path, m, q, b, user) {
  const settings = await getSettings(db);
  const allOpts = (await getRaw(db, 'upload_opts')) || {};
  if (path === 'catalog/state' && m === 'GET') {
    const chans = await targets(env, db);
    const cats = catalogOf(settings), ph = cats.map(() => '?').join(',');
    const rows = await all(db, `SELECT COALESCE(p.category, '') AS local, COUNT(*) AS n,
        ${chans.map((c) => `SUM(EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.channel = '${c.id}')) AS "l_${c.id}"`).join(', ') || '0 AS x'}
      FROM products p WHERE p.active = 1 AND (EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.channel IN (${ph})) OR COALESCE(p.category, '') != '')
      GROUP BY 1 ORDER BY local = '', local`, ...cats);
    await migrateAuto(db);
    const maps = await all(db, 'SELECT local, channel, remote_id, remote_name, attrs, updated_at, user FROM category_map');
    const chosen = await autoCats(db, settings);
    const sugs = await all(db, 'SELECT local, channel, remote_id, remote_name, path, score, sure FROM category_suggest WHERE remote_id IS NOT NULL');
    return {
      channels: chans.map((c) => ({ id: c.id, name: c.name, ready: !!(c.enabled && c.catalog && !c.hold), demo: !!c.demo, test: !!c.sandbox,
        reason: c.hold ? 'Beklemede' : !c.catalog ? NO_API[c.type] || 'Desteklenmiyor' : '', options: (c.catalog && c.catalog.options) || [], opts: allOpts[c.id] || {},
        auto: !!(settings.auto_upload || {})[c.id], autoCats: chosen[c.id] || [], stockPush: !!(settings.stock_push || {})[c.id] })),
      categories: rows.map((r) => ({ local: r.local, n: r.n, listed: Object.fromEntries(chans.map((c) => [c.id, r['l_' + c.id] || 0])) })),
      maps: maps.map((x) => ({ ...x, attrs: JSON.parse(x.attrs || '{}'), auto: /^Otomatik/.test(x.user || ''), user: undefined })),
      suggestions: sugs,
      uploads: await uploadsWithListing(db),
      stockSync: !!settings.stock_sync,
    };
  }
  if (path === 'catalog/suggest' && m === 'GET') return { items: await suggest(db, await target(env, db, q.channel), str(q.local)) };
  // Öneri hazırla (eşleştirmez); onayla / reddet
  if (path === 'catalog/automap' && m === 'POST') return suggestAll(db, settings, await target(env, db, str(b.channel)), { redo: !!b.redo });
  if (path === 'catalog/suggest/accept' && m === 'POST') return acceptSuggestion(db, await target(env, db, str(b.channel)), str(b.local), user);
  if (path === 'catalog/suggest/reject' && m === 'POST') {
    const c = await target(env, db, str(b.channel)), sg = await first(db, 'SELECT remote_id, rejected FROM category_suggest WHERE local = ? AND channel = ?', str(b.local), c.id);
    if (sg && sg.remote_id) await run(db, 'UPDATE category_suggest SET rejected = ?, remote_id = NULL, remote_name = NULL, path = NULL, sure = 0 WHERE local = ? AND channel = ?',
      JSON.stringify([...new Set([...JSON.parse(sg.rejected || '[]'), sg.remote_id])]), str(b.local), c.id);
    return { ok: true };
  }
  if (path === 'catalog/review' && m === 'GET') return review(db, await target(env, db, q.channel));
  if (path === 'catalog/review/apply' && m === 'POST') {
    const c = await target(env, db, str(b.channel)), done = [];
    for (const x of (b.items || []).slice(0, 200)) {
      if (!str(x.local) || !str(x.id)) continue;
      const cur = await first(db, 'SELECT remote_id FROM category_map WHERE local = ? AND channel = ?', str(x.local), c.id);
      if (cur && String(cur.remote_id) !== str(x.id)) await rejectMapped(db, str(x.local), c.id, cur.remote_id, { fresh: false });
      const { attrs } = await autoAttrs(c, str(x.id), { origin: originOf(settings) });
      await run(db, 'UPDATE category_map SET remote_id = ?, remote_name = ?, attrs = ?, updated_at = ?, user = ? WHERE local = ? AND channel = ?', str(x.id), str(x.name), JSON.stringify(attrs), Date.now(), user.name, str(x.local), c.id);
      done.push(x.local);
    }
    await log(db, c.id, 'info', `${user.name}: ${done.length} kategori eşleştirmesi önerilen kategoriyle değiştirildi`);
    return { ok: true, count: done.length };
  }
  if (path === 'catalog/remote-categories' && m === 'GET') return (await target(env, db, q.channel)).catalog.categories(str(q.q));
  if (path === 'catalog/attributes' && m === 'GET') return { attributes: await (await target(env, db, q.channel)).catalog.attributes(str(q.category)) };
  if (path === 'catalog/values' && m === 'GET') return { values: await (await target(env, db, q.channel)).catalog.values(str(q.category), str(q.attribute)) };
  if (path === 'catalog/map' && m === 'POST') {
    const c = await target(env, db, str(b.channel));
    if (!str(b.remote_id)) fail(400, 'Pazaryeri kategorisi seçin');
    const attrs = {};
    for (const [k, v] of Object.entries(b.attrs || {})) if (v && (str(v.value) || str(v.id))) attrs[k] = { id: str(v.id) || undefined, value: str(v.value) };
    await run(db, `INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, attrs = excluded.attrs, updated_at = excluded.updated_at, user = excluded.user`,
    str(b.local), c.id, str(b.remote_id), str(b.remote_name), JSON.stringify(attrs), Date.now(), user.name);
    await clearSuggest(db, str(b.local), c.id);
    return { ok: true };
  }
  // Eşleştirmeyi kaldır: kaldırılan kategori reddedilenlere eklenir (günlük öneri / "kesinleri otomatik onayla" aynı kategoriyi geri getirmez)
  if (path === 'catalog/unmap' && m === 'POST') {
    const cur = await first(db, 'SELECT remote_id FROM category_map WHERE local = ? AND channel = ?', str(b.local), str(b.channel));
    await run(db, 'DELETE FROM category_map WHERE local = ? AND channel = ?', str(b.local), str(b.channel));
    if (cur) await rejectMapped(db, str(b.local), str(b.channel), cur.remote_id);
    return { ok: true };
  }
  if (path === 'catalog/options' && m === 'POST') {
    const c = await target(env, db, str(b.channel));
    const o = {};
    for (const x of [...(c.catalog.options || []), { k: 'markup' }]) {
      const v = x.k === 'markup' ? cleanMarkup(b.opts && b.opts.markup) : str(b.opts && b.opts[x.k]);
      if (b.opts && v !== '') o[x.k] = v;
    }
    await setSetting(db, 'upload_opts', { ...allOpts, [c.id]: o });
    return { ok: true };
  }
  if (path === 'catalog/candidates' && m === 'GET') {
    const c = await target(env, db, q.channel);
    const map = await mapOf(db, str(q.local), c.id);
    const prods = await productsFor(db, settings, { local: str(q.local), ch: c.id });
    const sent = new Set((await all(db, "SELECT items FROM product_uploads WHERE channel = ? AND status IN ('sent', 'done') AND created_at > ?", c.id, Date.now() - 14 * 864e5))
      .flatMap((u) => JSON.parse(u.items || '[]').filter((x) => x.ok !== false).map((x) => x.id)));
    const open = prods.filter((p) => !p.listed);
    const gone = map && (await staleCheck(c))(map.remote_id);
    const built = map && !gone ? await buildAll(c, map, open, allOpts[c.id] || {}, !!Number(q.zero), db) : [];
    const byId = new Map(built.map((x) => [x.p.id, x]));
    return {
      map, listed: prods.length - open.length,
      items: open.map((p) => { const x = byId.get(p.id); const s = x ? x.p : shape(p, allOpts[c.id] || {}, !!Number(q.zero));
        return { id: p.id, name: s.name, sku: s.sku, barcode: s.barcode, image: p.image, price: s.price, stock: s.stock, variant: s.variant, missing: x ? x.missing : [gone ? STALE_MSG : 'kategori eşleştirilmemiş'], auto: (x && x.auto) || [], sent: sent.has(p.id) }; }),
      ...(gone ? { stale: STALE_MSG } : {}),
    };
  }
  if (path === 'catalog/upload' && m === 'POST') {
    const c = await target(env, db, str(b.channel));
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean);
    if (!ids.length) fail(400, 'Ürün seçin');
    const prods = (await productsFor(db, settings, { ch: c.id, ids })).filter((p) => !p.listed);
    const groups = new Map();
    for (const p of prods) { const k = str(p.category); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const ready = [], skipped = [], stale = await staleCheck(c);
    for (const [local, list] of groups) {
      const map = await mapOf(db, local, c.id);
      if (!map) { skipped.push(...list.map((p) => ({ id: p.id, name: p.name, missing: ['kategori eşleştirilmemiş'] }))); continue; }
      if (stale(map.remote_id)) { skipped.push(...list.map((p) => ({ id: p.id, name: p.name, missing: [STALE_MSG] }))); continue; }
      for (const x of await buildAll(c, map, list, allOpts[c.id] || {}, !!b.zeroStock, db)) (x.missing.length ? skipped.push({ id: x.p.id, name: x.p.name, missing: x.missing }) : ready.push(x));
    }
    if (!ready.length) return { sent: 0, skipped };
    const items = ready.map((x) => ({ id: x.p.id, key: x.key, name: x.p.name }));
    const t = Date.now();
    try {
      const r = await c.catalog.send(ready.map((x) => x.payload));
      const row = await first(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at) VALUES (?, ?, 'sent', ?, ?, ?) RETURNING id", c.id, r.ref, JSON.stringify(items), user.name, t);
      await markSent(db, c.id, items.map((x) => x.id), row && row.id, r.ref);
      await log(db, c.id, 'info', `${user.name}: ${ready.length} ürün ${c.name}'a gönderildi · takip ${r.ref}`);
      return { id: row && row.id, ref: r.ref, sent: ready.length, skipped };
    } catch (e) {
      await run(db, "INSERT INTO product_uploads (channel, status, items, error, user, created_at) VALUES (?, 'error', ?, ?, ?, ?)", c.id, JSON.stringify(items), e.message.slice(0, 2000), user.name, t);
      await log(db, c.id, 'error', `Ürün gönderimi başarısız: ${e.message}`);
      fail(502, `${c.name} ürünleri kabul etmedi: ${e.message}`);
    }
  }
  // Kanalın ham durum cevabı (teşhis için: Hepsiburada'nın döndürdüğü JSON olduğu gibi)
  const mr = path.match(/^catalog\/uploads\/(\d+)\/raw$/);
  if (mr && m === 'GET') {
    const u = await first(db, 'SELECT * FROM product_uploads WHERE id = ?', Number(mr[1]));
    if (!u || !u.ref) fail(404, 'Gönderim bulunamadı');
    const c = await target(env, db, u.channel);
    if (!c.catalog.raw) fail(400, 'Bu kanal ham durum sorgusunu desteklemiyor');
    return { ref: u.ref, raw: await c.catalog.raw(String(u.ref).split(',')[0]) };
  }
  const mm = path.match(/^catalog\/uploads\/(\d+)\/check$/);
  if (mm && m === 'POST') {
    const u = await first(db, 'SELECT * FROM product_uploads WHERE id = ?', Number(mm[1]));
    if (!u || !u.ref) fail(404, 'Gönderim bulunamadı');
    return checkUpload(env, db, ctx, u, await target(env, db, u.channel));
  }
  fail(404, 'Bilinmeyen işlem');
}

// Gönderimin sonucunu kanaldan sorgula; tamamlandıysa ilanlar çekilip onaylanan ürünler panel ürününe bağlanır
export async function checkUpload(env, db, ctx, u, c) {
  const st = await c.catalog.status(u.ref);
  const res = new Map(st.items.map((x) => [x.key, x]));
  const items = JSON.parse(u.items || '[]').map((x) => { const r = res.get(x.key); return r ? { ...x, ok: r.ok, status: r.status, error: r.error } : x; });
  const status = st.done ? 'done' : 'sent';
  await run(db, 'UPDATE product_uploads SET status = ?, items = ?, result = ?, checked_at = ? WHERE id = ?', status, JSON.stringify(items), JSON.stringify(st.items.slice(0, 500)), Date.now(), u.id);
  await channelStates(db, u, items, st.done);
  if (st.done) {
    const ok = items.filter((x) => x.ok).length, bad = items.filter((x) => x.ok === false).length;
    await log(db, c.id, bad ? 'error' : 'info', `Ürün gönderimi #${u.id} tamamlandı: ${ok} onay${bad ? `, ${bad} hata (${items.filter((x) => x.ok === false).slice(0, 2).map((x) => `${x.name}: ${x.error || x.status}`).join(' · ')})` : ''}`);
    // Reddedilen ürünler Bildirimler'e de düşer (yalnız günlükte kalmasın)
    if (bad) await notify(db, `uploadreject:${c.id}`, { level: 'warn', channel: c.id, title: `${c.name}: ${bad} ürün kabul edilmedi`, msg: `${items.filter((x) => x.ok === false).slice(0, 3).map((x) => `${x.name}: ${x.error || x.status}`).join(' · ')} · Ürün Yükle sayfasında ayrıntıları görüp düzeltebilirsiniz.` });
    if (ok) {
      const job = importListings(env, db, { only: [c.id] }).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
    }
  }
  return { status, items, done: st.done };
}
// Ürünün kanal durumu (Kanallarda yayınla): kabul → yayında, red → reddedildi (kanalın nedeniyle). Yalnız bu gönderime bağlı kayıtlar
// güncellenir (ürün sonradan yeniden gönderildiyse eski sonuç yenisinin üstüne yazılmaz).
export async function channelStates(db, u, items, done) {
  const t = Date.now(), st = [];
  for (const x of items) {
    if (!x.id) continue;
    const state = x.ok === true ? 'live' : x.ok === false ? 'rejected' : done ? 'error' : null;
    if (!state) continue;
    const err = x.ok === true ? null : str(x.error || x.status || (state === 'error' ? 'Kanal bu ürün için sonuç vermedi' : 'Kanal kabul etmedi')).slice(0, 500);
    st.push(db.prepare('UPDATE product_channel SET state = ?, error = ?, updated_at = ? WHERE product_id = ? AND channel = ? AND upload_id = ?').bind(state, err, t, x.id, u.channel, u.id));
  }
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
}
// Gönderilen ürünlerin kanal durumu "gönderildi" olarak kaydedilir (gönderim kaydı ve takip kimliğiyle)
export async function markSent(db, ch, ids, uploadId, ref, state = 'sent', error = null) {
  const t = Date.now(), st = ids.map((id) => db.prepare(`INSERT INTO product_channel (product_id, channel, state, ref, error, upload_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (product_id, channel) DO UPDATE SET state = excluded.state, ref = excluded.ref, error = excluded.error, upload_id = excluded.upload_id, updated_at = excluded.updated_at`)
    .bind(id, ch, state, ref == null ? null : String(ref), error, uploadId ?? null, t));
  for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
}
// Senkron sırasında: son 4 saatte gönderilip sonucu henüz alınmamış gönderimler sorgulanır (Trendyol sonucu 4 saat saklar)
export async function checkPendingUploads(env, db) {
  // Kanal onayı saatler / birkaç gün sürebilir: ilk 4 saatte her senkronda, sonra saatte bir, 3 güne kadar sorgulanır
  const now = Date.now();
  const rows = await all(db, `SELECT * FROM product_uploads WHERE status = 'sent' AND ref IS NOT NULL AND created_at BETWEEN ? AND ?
    AND (created_at > ? OR COALESCE(checked_at, 0) < ?) ORDER BY COALESCE(checked_at, 0) LIMIT 5`, now - 3 * 864e5, now - 60e3, now - 4 * 3600e3, now - 3600e3);
  let n = 0;
  // 3 günde sonuçlanmayan gönderim kapanır (kanal sonucu artık vermiyor; sonsuza kadar "gönderildi" kalmasın)
  await run(db, "UPDATE product_uploads SET status = 'error', error = COALESCE(error, 'Kanal 3 gün içinde sonuç vermedi; ürünü kanal panelinden kontrol edin') WHERE status = 'sent' AND created_at < ?", now - 3 * 864e5);
  await run(db, "UPDATE product_channel SET state = 'error', error = 'Kanal 3 gün içinde sonuç vermedi', updated_at = ? WHERE state = 'sent' AND upload_id IN (SELECT id FROM product_uploads WHERE status = 'error')", now);
  const chans = rows.length ? await getChannels(env, db) : [];
  for (const u of rows) {
    const c = chans.find((x) => x.id === u.channel && x.enabled && x.catalog && !x.hold);
    // Sorgulanamayan / kanalı kapalı kayıt da "denendi" işaretlenir: sıradakilerin önünü tıkamasın
    if (!c) { await run(db, 'UPDATE product_uploads SET checked_at = ? WHERE id = ?', now, u.id); continue; }
    try { if ((await checkUpload(env, db, null, u, c)).done) n++; } catch (e) {
      if (e.budget) break;
      await run(db, 'UPDATE product_uploads SET checked_at = ? WHERE id = ?', now, u.id);
      await log(db, u.channel, 'error', `Ürün gönderimi #${u.id} sorgulanamadı: ${e.message}`);
    }
  }
  return n;
}
