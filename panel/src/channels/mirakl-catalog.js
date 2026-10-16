// Mirakl Marketplace Platform (MMP) satıcı API'siyle ürün yükleme (catalog): Koçtaş ve Teknosa ortak kullanır; her kanal kendi `call` fonksiyonunu verir.
// Kaynak: developer.mirakl.com → Mirakl Marketplace APIs → Rest Seller APIs (resmi OpenAPI: /_bundle/content/product/mmp/rest/seller/openapi3.json).
// Mirakl'da ürün (product, operatörün kataloğu) ile teklif (offer, satıcının fiyat / stok kaydı) ayrıdır:
//  1. Barkod P31 (GET /api/products?product_references=<tür>|<barkod>) ile katalogda aranır. Varsa yalnız teklif açılır: OF24 (POST /api/offers, JSON;
//     product_id = Mirakl ürün SKU'su, product_id_type = "SKU" — OF01 örneğindeki gibi).
//  2. Yoksa ürün P41 (POST /api/products/imports, multipart "file", operator_format=true) ile operatör şablonundaki özellik kodlarıyla (PM11) dosya olarak
//     içe aktarılır. Ürün operatör onayından geçip kataloğa girince (P42 COMPLETE, hata raporunda yok, P31'de bulunur) teklif OF24 ile açılır.
//     Teklif bilgisi (fiyat / stok / durum) bu arada kanal kv'sinde saklanır.
// Sınırlar (OpenAPI "Call Frequency"): H11, PM11, VL11 en fazla saatte bir (6 saat önbellekte: Worker belleği + veri merkezi önbelleği, edgecache.js;
// kanal nesnesi her istekte yeniden kurulduğundan kanalın kendi belleği yetmez); P41 satıcı başına en fazla 15 dakikada bir;
// OF24, P42, OF02 en fazla dakikada bir; AF01 ve OF61 günde bir (kv'de 24 saat saklanır). Tek gönderimde tüm teklifler tek OF24 isteğinde, tüm yeni
// ürünler tek P41 dosyasında gider (belgede istek başına ürün sınırı yok; sınır çağrı sıklığı).
// OF24 teklifi bütün olarak yazar (gönderilmeyen alanlar sıfırlanır): aynı SKU ile teklif zaten varsa (OF21) teklif gönderilmez, dokunulmaz.
// P41 ve OF24 tekrar denenmez (tries: 1): zaman aşımında Mirakl isteği almış olabilir; P41'in ikinci denemesi 15 dakika sınırına takılır, import_id kaybolur.
// Onaydan (günler) sonra açılan teklif stok 0 ile açılır: gönderim anının stoğu bu arada tükenmiş olabilir (fazla satış). Gerçek stoğu panel, ilan
// bağlandıktan sonra stok gönderimiyle yazar (kanalın pushStock'u teklifin OF21'deki fiyat / indirimini koruyarak yalnız miktarı değiştirir).
// Kanal toplu ürün kurmadan önce catalog.prepare(prs) çağrılabilir: barkodlar 100'lük P31 istekleriyle önceden aranır, build tek tek sormaz.
// Operatöre bırakılanlar sabit varsayılmaz: kategoriler H11, özellikler / zorunluluk / varyant ekseni PM11 (requirement_level, variant, type, type_parameter),
// değer listeleri VL11, CSV ayırıcı PC01 (features.operator_csv_delimiter), teklif durumu OF61, zorunlu teklif alanları AF01 (entities=OFFER).
// Belgede ürün adı / barkod / kategori gibi özelliklerin hangi PM11 kodu olduğu tanımlı değil (roles alanının türleri belgelenmemiş): bu kodlar kanal
// ayarlarından (options) alınır (operatörün ürün şablonundaki sütun kodları). Barkod kimlik türü (ör. EAN) ayardan, boşsa satıcının mevcut
// tekliflerindeki (OF21 product_references) barkod biçimli referansların tek türünden okunur.
// key = teklif SKU'su (shop_sku): fetchListings ilanı shop_sku ile tanıtır (remoteId / sku).
import { str, num, r2, oneAxis, brandKey } from '../util.js';
import { edgeCached } from '../edgecache.js';

const HOUR = 3600e3, TTL = 6 * HOUR, DAY = 864e5, P41_GAP = 15 * 60e3;
const BIND = ['attrCategory', 'attrTitle', 'attrEan', 'attrSku', 'attrDesc', 'attrBrand', 'attrGroup'];
// Etiket: label, yoksa Türkçe çeviri, yoksa ilk çeviri, yoksa kod (H11 / PM11 / VL11'de label zorunlu değil, label_translations zorunlu)
const tr = (x) => str(x && x.label) || str(((x && x.label_translations) || []).find((t) => /^tr/i.test(str(t && t.locale)))?.value) || str((((x && x.label_translations) || [])[0] || {}).value) || str(x && x.code);
const vkey = (x) => str(x).toLocaleLowerCase('tr').replace(/\s+/g, ' ');
// PM11: LIST türünde type_parameter değer listesinin kodudur (values_list eski alan). Çoklu değer ("Multiple Values List", PC01) türü adında MULTIPLE geçer.
const isList = (a) => /LIST/i.test(str(a.type));
const listCode = (a) => str(a.type_parameter) || str(a.values_list);
const levelOf = (a) => str(a.requirement_level).toUpperCase() || (a.required ? 'REQUIRED' : 'OPTIONAL');

// Mirakl rapor dosyaları (P44 / P47 / OF03) CSV: tırnak içinde satır sonu olabilir; ayırıcı başlık satırından anlaşılır
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, ''), first = s.split(/\r?\n/, 1)[0] || '';
  const sep = [';', ',', '\t'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => str(x)));
}
// Hata raporu: satır, hücrelerinden biri gönderimdeki SKU / barkoda denk gelen ürünündür. Hata metni: "message" sütunları (OF03 örneği: error-message),
// yoksa error / reason / warning sütunları, yoksa gönderdiğimiz dosyada olmayan (raporun eklediği) sütunlar. Rapor biçimi belgede yalnız OF03 için örnekli.
export function reportErrors(text, keyOf, own = []) {
  const rows = parseCsv(text), out = new Map();
  if (rows.length < 2) return out;
  const head = rows[0].map((h) => str(h).toLowerCase()), mine = new Set(own.map((h) => str(h).toLowerCase()));
  const cols = (re) => head.map((h, i) => (h && re.test(h) && !mine.has(h) ? i : -1)).filter((i) => i >= 0);
  let ec = cols(/message|mesaj/);
  if (!ec.length) ec = cols(/error|hata|reason|warning|uyar/);
  if (!ec.length) ec = cols(/./);
  for (const r of rows.slice(1)) {
    const k = r.map((c) => keyOf(str(c))).find(Boolean);
    if (!k) continue;
    const msg = ec.map((i) => str(r[i])).filter(Boolean).join(' · ');
    out.set(k, [...new Set([...(out.get(k) || []), msg || 'reddedildi'])]);
  }
  return out;
}

// Ağaç / değer listesi türetmeleri: aynı ham cevap için bir kez (önbellekten gelen nesneye bağlı)
const TREES = new WeakMap(), LISTS = new WeakMap(), SEEN = new Map();
const derive = (wm, raw, fn) => { if (!wm.has(raw)) wm.set(raw, fn(raw)); return wm.get(raw); };

// scope: önbellek anahtarı (Mirakl kök adresi; katalog yapısı operatörün, mağazadan bağımsız)
export function miraklCatalog({ name, call, kv, offersFor, scope = name }) {
  const shared = (k, ttl, load) => edgeCached(`mirakl:${scope}:${k}`, ttl, load);
  // Kanalın kalıcı küçük kayıtları (kv: settings "kv:<kanal>:<anahtar>"); kv yoksa (doğrudan kullanım) bellek
  const local = new Map();
  const sget = async (k) => { try { return kv ? await kv.get(k) : local.get(k) ?? null; } catch { return local.get(k) ?? null; } };
  const sset = async (k, v) => { local.set(k, v); try { if (kv) await kv.set(k, v); } catch { /* kv yazılamadı: bellekte kalır */ } };
  const memo = (ttl, load) => { let at = 0, p = null; return () => { if (!p || Date.now() - at > ttl) { at = Date.now(); p = load().catch((e) => { p = null; throw e; }); } return p; }; };
  // Günde bir çağrılabilenler (AF01, OF61): kv'de 24 saat
  const daily = (k, load) => memo(DAY, async () => { const s = await sget(k); if (s && Date.now() - num(s.at) < DAY) return s.v; const v = await load(); await sset(k, { at: Date.now(), v }); return v; });

  // ---------- H11: kategori ağacı (code, parent_code, level); ürün yalnız son kategoriye (çocuğu olmayan) açılır ----------
  const tree = async () => derive(TREES, await shared('h11', TTL, async () => ((await call('/hierarchies')) || {}).hierarchies || []), (all) => {
    const rows = all.filter((h) => str(h.code));
    const by = new Map(rows.map((h) => [str(h.code), h])), parents = new Set(rows.map((h) => str(h.parent_code)).filter(Boolean));
    const up = (code) => { const out = []; let x = by.get(code); for (let i = 0; x && str(x.parent_code) && i < 30; i++) { x = by.get(str(x.parent_code)); if (!x) break; out.unshift(x); } return out; };
    const leaves = rows.filter((h) => !parents.has(str(h.code))).map((h) => ({ id: str(h.code), name: tr(h), path: up(str(h.code)).map(tr).filter(Boolean).join(' › ') }));
    return { leaves, up };
  });
  async function categories(q) {
    const all = (await tree()).leaves, k = vkey(q);
    return { total: all.length, items: all.filter((c) => !k || vkey(`${c.name} ${c.path} ${c.id}`).includes(k)).slice(0, 60) };
  }
  const allCategories = async () => (await tree()).leaves;

  // ---------- PM11: tüm özellikler bir kez (saatte bir sınırı); kategoriye uyan: hierarchy_code boş (ortak) ya da kategori / üst kategorilerinden biri ----------
  const pm11 = () => shared('pm11', TTL, async () => ((await call('/products/attributes')) || {}).attributes || []);
  async function attrsOf(cat) {
    const t = await tree(), ids = new Set([str(cat), ...t.up(str(cat)).map((h) => str(h.code))]), out = new Map();
    for (const a of await pm11()) {
      const code = str(a.code), h = str(a.hierarchy_code), lvl = levelOf(a);
      if (!code || (h && !ids.has(h)) || lvl === 'DISABLED') continue;
      const prev = out.get(code);
      if (!prev) out.set(code, { a, req: lvl === 'REQUIRED' }); else if (lvl === 'REQUIRED') prev.req = true;
    }
    return [...out.values()];
  }
  // Ürün alanına bağlanan özellik kodları (kanal ayarları): build her çağrıda kv'ye yazar, attributes() bunları kategori eşleştirmesinde sormaz
  let bindSeen;
  async function bound(opts) {
    if (opts) {
      const b = Object.fromEntries(BIND.map((k) => [k, str(opts[k])])), j = JSON.stringify(b);
      if (bindSeen === undefined) bindSeen = JSON.stringify(await sget('bind'));
      if (j !== bindSeen) { bindSeen = j; await sset('bind', b); }
      return b;
    }
    return (await sget('bind')) || {};
  }
  async function attributes(cat, { opts } = {}) {
    const skip = new Set(Object.values(await bound(opts)).filter(Boolean));
    return (await attrsOf(cat)).filter(({ a }) => !skip.has(str(a.code))).map(({ a, req }) => ({
      id: str(a.code), name: tr(a), mandatory: req, kind: a.variant ? 'variant' : 'category', type: isList(a) ? 'enum' : str(a.type).toLowerCase() || 'text',
      custom: !isList(a), multi: isList(a) && /MULTIPLE/i.test(str(a.type)) }));
  }
  // VL11: tüm değer listeleri bir kez (saatte bir sınırı); değer kimliği = değer kodu (dosyaya kod yazılır)
  const vl11 = async () => derive(LISTS, await shared('vl11', TTL, async () => ((await call('/values_lists')) || {}).values_lists || []),
    (all) => new Map(all.map((l) => [str(l.code), (l.values || []).map((v) => ({ id: str(v.code), value: tr(v) }))])));
  async function values(cat, attr) {
    const x = (await attrsOf(cat)).find((y) => str(y.a.code) === str(attr));
    if (!x || !isList(x.a)) return [];
    const code = listCode(x.a);
    if (!code) return (x.a.values || []).map((v) => ({ id: str(v.code), value: str(v.code) })).filter((v) => v.id);
    return (await vl11()).get(code) || [];
  }

  // ---------- teklif bilgileri ----------
  const of61 = daily('of61', async () => (((await call('/offers/states')) || {}).offer_states || []).map((s) => ({ code: str(s.code), label: tr(s) })));
  // AF01 okunamazsa (ör. yetki) gönderim durdurulmaz: eksik teklif alanını Mirakl içe aktarma raporunda bildirir
  const af01 = daily('af01', async () => {
    try { return (((await call('/additional_fields', { entities: 'OFFER' })) || {}).additional_fields || []).filter((f) => str(f.entity || 'OFFER').toUpperCase() === 'OFFER' && f.required === true).map((f) => str(f.label) || str(f.code)); } catch (e) { if (e.budget) throw e; return []; }
  });
  // Teklif durumu (OF24 state_code zorunlu): ayar; yoksa OF61'de tek durum ya da adı "Yeni / New" olan tek durum
  async function stateCode(opts) {
    if (str(opts.offerState)) return str(opts.offerState);
    const list = await of61();
    if (list.length === 1) return list[0].code;
    const hit = list.filter((s) => /^(yeni|new|sıfır)(\s|$)/i.test(s.label));
    return hit.length === 1 ? hit[0].code : '';
  }
  // Barkod kimlik türü: ayar; yoksa satıcının tekliflerinde (OF21) barkod biçimli (8-14 rakam) referansların tek türü
  const refType = memo(TTL, async () => {
    const types = new Set();
    for (const o of ((await call('/offers', { max: 100 })) || {}).offers || []) for (const r of o.product_references || []) if (/^\d{8,14}$/.test(str(r.reference)) && str(r.reference_type)) types.add(str(r.reference_type));
    return types.size === 1 ? [...types][0] : '';
  });
  const eanType = async (opts) => str(opts.eanType) || await refType();
  // build'in kullandığı kimlik türü kv'de: prepare ayarsız çağrılırsa aynı türle önceden arar
  let typeSeen;
  async function rememberType(type) {
    if (typeSeen === undefined) typeSeen = str(await sget('eantype'));
    if (type && type !== typeSeen) { typeSeen = type; await sset('eantype', type); }
  }
  // P31: barkodla katalog araması (istekte en fazla 100 referans); sonuç 30 dk Worker belleğinde
  const seen = { get: (k) => SEEN.get(scope + '|' + k), set: (k, v) => { SEEN.set(scope + '|' + k, v); if (SEEN.size > 5000) SEEN.delete(SEEN.keys().next().value); } };
  // fresh: sonuç sorgusunda önbellek kullanılmaz (ürün onaylanıp kataloğa yeni girmiş olabilir)
  async function lookup(type, codes, fresh = false) {
    codes = [...new Set(codes)];
    const out = new Map(), need = [];
    for (const c of codes) { const h = !fresh && seen.get(type + '|' + c); if (h && Date.now() - h.at < 30 * 60e3) { if (h.v) out.set(c, h.v); } else need.push(c); }
    for (let i = 0; i < need.length; i += 100) {
      const part = need.slice(i, i + 100);
      const r = (await call('/products', { product_references: part.map((c) => `${type}|${c}`).join(',') })) || {};
      const hit = new Map((r.products || []).filter((p) => str(p.product_sku)).map((p) => [str(p.product_id), p]));
      for (const c of part) { const p = hit.get(c) || null; seen.set(type + '|' + c, { at: Date.now(), v: p }); if (p) out.set(c, p); }
    }
    return out;
  }
  // OF24 teklif satırı: liste fiyatı satış fiyatından büyükse teklif fiyatı = liste fiyatı, satış fiyatı indirim (stok / fiyat gönderimiyle aynı kural)
  function offerRow(pr, state, opts) {
    const sale = r2(pr.price), list = r2(Math.max(num(pr.listPrice), sale));
    const o = { shop_sku: str(pr.sku), price: list, quantity: Math.max(0, Math.round(num(pr.stock))), state_code: state, update_delete: 'update' };
    if (list > sale) o.discount = { price: sale };
    if (num(opts.leadtime) > 0) o.leadtime_to_ship = Math.round(num(opts.leadtime));
    return o;
  }

  const OPT = {
    attrCategory: `${name} ürün şablonu: kategori özellik kodu`, attrTitle: `${name} ürün şablonu: ürün adı özellik kodu`, attrEan: `${name} ürün şablonu: barkod özellik kodu`,
  };
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], key = str(pr.sku), b = await bound(opts);
    if (!pr.sku) missing.push('SKU');
    if (!pr.barcode) missing.push('barkod');
    if (!(pr.price > 0)) missing.push('fiyat');
    const state = await stateCode(opts);
    if (!state) missing.push(`teklif durumu (${name} ayarlarından “Teklif durumu kodu” girin)`);
    for (const f of await af01()) missing.push(`teklif alanı “${f}” (${name} zorunlu tutuyor; panelden gönderilemiyor)`);
    const type = await eanType(opts);
    await rememberType(type);
    if (!type) { missing.push(`barkod kimlik türü (${name} ayarlarından girin, ör. EAN)`); return { key, missing, payload: null }; }
    const offer = offerRow(pr, state, opts);
    // prepare() önceden aradıysa önbellekten (30 dk), yoksa tek barkod için P31
    const found = pr.barcode ? (await lookup(type, [str(pr.barcode)])).get(str(pr.barcode)) : null;
    // Ürün katalogda var: yalnız teklif
    if (found) return { key, missing, payload: { key, mode: 'offer', offer: { ...offer, product_id: str(found.product_sku), product_id_type: 'SKU' } } };

    // Ürün katalogda yok: operatör şablonundaki özelliklerle yeni ürün
    for (const k of ['attrCategory', 'attrTitle', 'attrEan']) if (!b[k]) missing.push(OPT[k]);
    const attrs = await attrsOf(map.remote_id), codes = new Set(attrs.map((x) => str(x.a.code)));
    for (const k of ['attrCategory', 'attrTitle', 'attrEan']) if (b[k] && !codes.has(b[k])) missing.push(`${OPT[k]}: “${b[k]}” bu kategorinin şablonunda yok`);
    const fixed = new Map([[b.attrCategory, str(map.remote_id)], [b.attrTitle, str(pr.name)], [b.attrEan, str(pr.barcode)], [b.attrSku, str(pr.sku)], [b.attrDesc, str(pr.description)], [b.attrGroup, str(pr.group)]].filter(([k]) => k));
    const imgs = [pr.image, ...(pr.images || []).filter((u) => u !== pr.image)].filter((u) => /^https?:\/\//i.test(str(u)));
    const row = {};
    let at = 0;
    for (const { a, req } of attrs) {
      const code = str(a.code), lab = tr(a), list = isList(a);
      let v = '', why = '';
      if (code === b.attrBrand) {
        if (!list) v = str(pr.brand);
        else if (pr.brandId) v = str(pr.brandId);
        else if (pr.brand) {
          // Marka listesi (VL11): adı büyük / küçük harf ve noktalama farkı gözetmeden birebir aranır
          const hit = (await values(map.remote_id, code)).find((x) => brandKey(x.value) === brandKey(pr.brand) || brandKey(x.id) === brandKey(pr.brand));
          if (hit) v = hit.id; else { if (req) missing.push(`marka “${pr.brand}” ${name} listesinde bulunamadı`); continue; }
        }
        if (!v && req) { missing.push('marka'); continue; }
      } else if (fixed.has(code)) v = fixed.get(code);
      else {
        const m = (map.attrs || {})[code], text = str(m && m.value);
        if (text === '@image') { v = imgs[at++] || ''; why = ' (ürünün görseli yok)'; }
        else if (text === '@variant') {
          if (list) { const hit = pr.variant && pick ? await pick({ id: code }, pr.variant) : null; v = hit ? str(hit.id) : ''; } else v = oneAxis(pr.variant);
          why = pr.variant ? ` (varyant “${pr.variant}” ${name} listesinde yok)` : ' (ürünün varyantı yok; kategori eşleştirmesinde değer seçin)';
          if (!list && pr.variant && !v) why = ` (varyant “${pr.variant}” tek değer değil)`;
        } else if (list && m && str(m.id)) v = str(m.id);
        else if (text) {
          if (!list) v = text;
          else { const hit = (await values(map.remote_id, code)).find((x) => vkey(x.value) === vkey(text) || vkey(x.id) === vkey(text)); v = hit ? hit.id : ''; why = ` (“${text}” ${name} listesinde yok)`; }
        }
      }
      if (v) row[code] = v; else if (req) missing.push(lab + why);
    }
    return { key, missing, payload: { key, mode: 'product', barcode: str(pr.barcode), type, row, offer } };
  }

  // Toplu ön arama (isteğe bağlı kanca): panel bir kategori grubunu build etmeden önce şekillenmiş ürünlerle bir kez çağırır. Barkodlar 100'lük P31
  // istekleriyle aranır, sonuç build'in kullandığı önbelleğe (30 dk) yazılır. Hata gönderimi durdurmaz (build tek tek arar).
  async function prepare(prs, { opts } = {}) {
    const codes = [...new Set((prs || []).map((p) => str(p && p.barcode)).filter(Boolean))];
    if (!codes.length) return;
    try {
      const type = (opts && str(opts.eanType)) || (typeSeen !== undefined ? typeSeen : (typeSeen = str(await sget('eantype')))) || await refType();
      if (type) await lookup(type, codes);
    } catch (e) { if (e.budget) throw e; }
  }

  // ---------- gönderim ----------
  // Kayıt: "<tür><değer>:<sku>,<sku>…" parçaları ";" ile (değer ve SKU'lar URL kodlu). O = OF24 içe aktarma no · P = P41 içe aktarma no ·
  // E = aynı SKU ile teklif zaten var (gönderilmedi) · X = gönderilemedi (değer: neden)
  const part = (t, v, list) => `${t}${encodeURIComponent(v)}:${list.map((x) => encodeURIComponent(x.key)).join(',')}`;
  async function existing(keys) {
    if (!offersFor || !keys.length) return new Set();
    const list = await offersFor(keys);
    return new Set(keys.filter((k, i) => list[i]));
  }
  async function csvSep() {
    const d = str(((((await pc01()) || {}).features) || {}).operator_csv_delimiter).toUpperCase();
    if (d === 'SEMICOLON') return ';';
    if (d === 'COMMA') return ',';
    throw new Error(`${name} platform ayarlarından (PC01) CSV ayırıcı okunamadı`);
  }
  const pc01 = () => shared('pc01', TTL, async () => (await call('/platform/configuration')) || {});
  async function productFile(list) {
    const sep = await csvSep(), head = [...new Set(list.flatMap((x) => Object.keys(x.row)))];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return { head, csv: [head.map(q).join(sep), ...list.map((x) => head.map((h) => q(x.row[h])).join(sep))].join('\n') + '\n' };
  }
  async function send(items) {
    const parts = [], errs = [], list = items.filter(Boolean);
    const have = await existing(list.map((x) => x.key));
    const ex = list.filter((x) => have.has(x.key)), fresh = list.filter((x) => !have.has(x.key));
    if (ex.length) parts.push(part('E', '', ex));
    const offers = fresh.filter((x) => x.mode === 'offer'), prods = fresh.filter((x) => x.mode === 'product');
    if (offers.length) {
      try {
        const r = await call('/offers', {}, { method: 'POST', body: { offers: offers.map((x) => x.offer) }, tries: 1 });
        parts.push(part('O', r && r.import_id != null ? String(r.import_id) : '0', offers));
      } catch (e) { if (e.budget) throw e; errs.push(e.message); parts.push(part('X', e.message, offers)); }
    }
    if (prods.length) {
      try {
        const last = num(await sget('p41at')), wait = last + P41_GAP - Date.now();
        if (wait > 0) throw new Error(`${name} ürün dosyasını en fazla 15 dakikada bir kabul eder; ${Math.ceil(wait / 60e3)} dakika sonra yeniden gönderin`);
        const { csv, head } = await productFile(prods);
        const fd = new FormData();
        fd.append('file', new Blob([csv], { type: 'text/csv' }), 'urunler.csv');
        fd.append('operator_format', 'true');
        let r;
        // Tek deneme: zaman aşımı / bağlantı hatası / sunucu hatasında dosya Mirakl'a ulaşmış olabilir (ikinci deneme 15 dk sınırına takılırdı)
        try { r = await call('/products/imports', {}, { method: 'POST', body: fd, tries: 1 }); } catch (e) {
          if (e.budget || (e.status && e.status < 500)) throw e;
          throw new Error(`${name} ürün dosyası gönderiminde yanıt alınamadı (${e.message}). Mirakl'a dosya gitmiş olabilir; 15 dakika sonra ${name} panelinde içe aktarmaları kontrol edin, sonra yeniden gönderin`);
        } finally { await sset('p41at', Date.now()); }
        const id = r && r.import_id != null ? String(r.import_id) : '';
        if (!id) throw new Error(`${name} içe aktarma numarası (import_id) dönmedi`);
        await sset('p41:' + id, { at: Date.now(), head, type: prods[0].type, items: prods.map((x) => ({ key: x.key, barcode: x.barcode, offer: x.offer })), offers: [], made: [] });
        parts.push(part('P', id, prods));
      } catch (e) { if (e.budget) throw e; errs.push(e.message); parts.push(part('X', e.message, prods)); }
    }
    if (!parts.some((p) => p[0] !== 'X')) throw new Error(errs.join(' · ') || `${name}: gönderilecek ürün yok`);
    return { ref: parts.join(';') };
  }

  // ---------- sonuç ----------
  const ACCEPT = 'application/octet-stream, text/csv, */*';
  const report = async (path) => String((await call(path, {}, { accept: ACCEPT }).catch((e) => { if (e.budget) throw e; return ''; })) || '');
  // OF02 durumu: WAITING_SYNCHRONIZATION_PRODUCT / WAITING / RUNNING sürüyor, COMPLETE / FAILED bitti; hatalı satırlar OF03 raporundan
  // note: başarılı satırın durum metnine eklenir (onaydan sonra stok 0 ile açılan teklif)
  async function offerResult(id, keys, note = '') {
    if (id === '0') return { pending: false, items: keys.map((k) => ({ key: k, ok: true, status: `${name}'a iletildi${note}`, error: '' })) };
    const r = (await call(`/offers/imports/${encodeURIComponent(id)}`)) || {}, st = str(r.status || r.import_status).toUpperCase();
    if (st !== 'COMPLETE' && st !== 'FAILED') return { pending: true, items: keys.map((k) => ({ key: k, ok: null, status: `${name} teklifi işliyor`, error: '' })) };
    if (st === 'FAILED') return { pending: false, items: keys.map((k) => ({ key: k, ok: false, status: `${name} teklifi kabul etmedi`, error: str(r.reason_status) || 'Teklif içe aktarması başarısız' })) };
    const errLines = num(r.lines_in_error), bad = errLines > 0 || r.has_error_report === true ? reportErrors(await report(`/offers/imports/${encodeURIComponent(id)}/error_report`), (v) => (keys.includes(v) ? v : '')) : new Map();
    const unknown = errLines > 0 && !bad.size;
    return { pending: false, items: keys.map((k) => (bad.has(k) ? { key: k, ok: false, status: `${name} teklifi kabul etmedi`, error: bad.get(k).join(' · ') }
      : unknown ? { key: k, ok: null, status: `${errLines} teklif satırı hatalı; ${name} hata raporu okunamadı`, error: '' } : { key: k, ok: true, status: `Teklif açıldı (${name})${note}`, error: '' })) };
  }
  // P42 durumu: TRANSFORMATION_WAITING / TRANSFORMATION_RUNNING / WAITING / RUNNING işleniyor · SENT operatöre gönderildi (onay bekliyor) ·
  // COMPLETE bitti (P44 hata raporu) · FAILED / CANCELLED / TRANSFORMATION_FAILED başarısız. Dönüşüm hataları P47 raporunda (SENT / COMPLETE'te).
  // Sonuç kesinleşince (bekleyen yok) kv kaydı küçültülür: yalnız ürün başına son durum kalır (dosya başlığı, teklif satırları atılır);
  // sonraki sorgular Mirakl'a gitmeden bu durumu döndürür.
  const OPENED = '; stok panelin stok gönderimiyle yazılır';
  async function settle(id, items) {
    await sset('p41:' + id, { at: Date.now(), done: true, r: items.map((x) => [x.key, x.ok, x.status, x.error]) });
    return { pending: false, items };
  }
  async function productResult(id, keys) {
    const ent = await sget('p41:' + id);
    if (ent && ent.done) {
      const r = new Map((ent.r || []).map(([key, ok, status, error]) => [key, { key, ok, status, error }]));
      return { pending: false, items: keys.map((k) => r.get(k) || { key: k, ok: false, status: `${name} sonucu bulunamadı`, error: 'Gönderim sonucu kayıtlı değil: ürünü yeniden gönderin' }) };
    }
    const info = new Map(((ent && ent.items) || []).map((x) => [x.key, x])), byBc = new Map([...info.values()].map((x) => [x.barcode, x.key]));
    const keyOf = (v) => (keys.includes(v) ? v : byBc.get(v) || '');
    const r = (await call(`/products/imports/${encodeURIComponent(id)}`)) || {}, st = str(r.import_status).toUpperCase(), bad = new Map();
    const add = (m) => { for (const [k, e] of m) bad.set(k, [...new Set([...(bad.get(k) || []), ...e])]); };
    const head = (ent && ent.head) || [];
    if (r.has_transformation_error_report === true) add(reportErrors(await report(`/products/imports/${encodeURIComponent(id)}/transformation_error_report`), keyOf, head));
    const fail = (k, e) => ({ key: k, ok: false, status: `${name} ürünü kabul etmedi`, error: e });
    if (['FAILED', 'CANCELLED', 'TRANSFORMATION_FAILED'].includes(st)) {
      const items = keys.map((k) => fail(k, (bad.get(k) || []).join(' · ') || str(r.reason_status) || `Ürün içe aktarması ${st === 'CANCELLED' ? 'iptal edildi' : 'başarısız'}`));
      return ent ? settle(id, items) : { pending: false, items };
    }
    if (st !== 'COMPLETE') {
      const wait = st === 'SENT' ? `${name} ürün onayı bekleniyor` : `${name} ürün dosyasını işliyor`;
      return { pending: keys.some((k) => !bad.has(k)), items: keys.map((k) => (bad.has(k) ? fail(k, bad.get(k).join(' · ')) : { key: k, ok: null, status: wait, error: '' })) };
    }
    if (r.has_error_report === true) add(reportErrors(await report(`/products/imports/${encodeURIComponent(id)}/error_report`), keyOf, head));
    const items = [], ok = keys.filter((k) => !bad.has(k));
    for (const k of keys) if (bad.has(k)) items.push(fail(k, bad.get(k).join(' · ')));
    if (!ent) {
      for (const k of ok) items.push(fail(k, `Ürün ${name} kataloğuna alındı ama teklif açılamadı (gönderim bilgisi bulunamadı): ürünü yeniden gönderin, bu kez yalnız teklif açılır`));
      return { pending: false, items };
    }
    // Onaylanan ürünler için teklif: ürün P31'de bulununca OF24 ile açılır (aynı SKU ile teklif varsa dokunulmaz); bulunamayanlar beklemede kalır.
    // Stok 0: gönderim anının stoğu günler sonra geçerli olmayabilir; gerçek stok ilan bağlanınca panelin stok gönderimiyle yazılır. Fiyat gönderim anının.
    const made = new Set(ent.made || []), exists = new Set(ent.exists || []), todo = ok.filter((k) => !made.has(k) && !exists.has(k));
    let pending = false;
    if (todo.length) {
      for (const k of await existing(todo)) exists.add(k);
      const need = todo.filter((k) => !exists.has(k)), hit = ent.type ? await lookup(ent.type, need.map((k) => (info.get(k) || {}).barcode).filter(Boolean), true) : new Map();
      const rows = need.map((k) => { const x = info.get(k) || {}, p = hit.get(x.barcode); return p && x.offer ? { k, o: { ...x.offer, quantity: 0, product_id: str(p.product_sku), product_id_type: 'SKU' } } : null; }).filter(Boolean);
      if (rows.length) {
        const res = await call('/offers', {}, { method: 'POST', body: { offers: rows.map((x) => x.o) }, tries: 1 });
        ent.offers = [...(ent.offers || []), { id: res && res.import_id != null ? String(res.import_id) : '0', keys: rows.map((x) => x.k) }];
        for (const x of rows) made.add(x.k);
      }
      ent.made = [...made]; ent.exists = [...exists];
      await sset('p41:' + id, ent);
    }
    for (const k of ok) if (exists.has(k)) items.push({ key: k, ok: true, status: `Ürün kataloğa alındı; bu SKU ile teklif zaten vardı (değiştirilmedi)`, error: '' });
    for (const k of ok) if (!made.has(k) && !exists.has(k)) { pending = true; items.push({ key: k, ok: null, status: `${name} ürün onayı / kataloğa eklenmesi bekleniyor`, error: '' }); }
    for (const o of ent.offers || []) {
      const res = await offerResult(o.id, o.keys.filter((k) => ok.includes(k)), OPENED);
      if (res.pending) pending = true;
      items.push(...res.items);
    }
    return pending ? { pending, items } : settle(id, items);
  }
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const p of String(ref || '').split(';').filter(Boolean)) {
      const t = p[0], i = p.indexOf(':'), v = decodeURIComponent(p.slice(1, i)), keys = p.slice(i + 1).split(',').filter(Boolean).map(decodeURIComponent);
      if (t === 'E') for (const k of keys) items.push({ key: k, ok: true, status: `${name}'da bu SKU ile teklif zaten var (değiştirilmedi)`, error: '' });
      else if (t === 'X') for (const k of keys) items.push({ key: k, ok: false, status: `${name}'a gönderilemedi`, error: v });
      else if (t === 'O' || t === 'P') {
        const r = t === 'O' ? await offerResult(v, keys) : await productResult(v, keys);
        if (r.pending) pending = true;
        items.push(...r.items);
      }
    }
    return { done: !pending, items };
  }

  const options = [
    { k: 'eanType', label: `Barkod kimlik türü (${name} ürün kimliği türü, ör. EAN; boşsa mevcut tekliflerinizden okunur)` },
    { k: 'offerState', label: 'Teklif durumu kodu (boşsa “Yeni”)' },
    { k: 'leadtime', label: 'Kargoya veriliş süresi (gün; boşsa kanal varsayılanı)' },
    { k: 'attrCategory', label: OPT.attrCategory }, { k: 'attrTitle', label: OPT.attrTitle }, { k: 'attrEan', label: OPT.attrEan },
    { k: 'attrSku', label: `${name} ürün şablonu: satıcı ürün kodu (SKU) özellik kodu` },
    { k: 'attrDesc', label: `${name} ürün şablonu: açıklama özellik kodu` },
    { k: 'attrBrand', label: `${name} ürün şablonu: marka özellik kodu` },
    { k: 'attrGroup', label: `${name} ürün şablonu: varyant grup kodu özellik kodu` },
  ];
  return { categories, allCategories, attributes, values, prepare, build, send, status, options };
}
